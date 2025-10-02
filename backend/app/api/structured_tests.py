"""
Structured Tests API (superadmin focused)
- Create/list tests (SJT/JDT/CASE)
- Attach questions from question bank
- Edit competency overrides per test
- Export tests
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
import uuid

from app.database import get_db
from app.auth import require_superadmin, get_current_active_user, UserContext
from app.models import (
    User, Test, TestCreate, TestResponse, TestQuestion, TestQuestionAddRequest, TestQuestionResponse,
    TestCompetencyOverride, TestCompetencyOverridesRequest, TestCompetencyOverridesResponse, Question
)
from app.models import StatusEvent
from app.utils.ids import get_next_code

router = APIRouter(prefix="/tests-structured", tags=["tests_structured"])

@router.get("", response_model=List[TestResponse])
async def list_tests(
    search: Optional[str] = Query(None),
    test_type: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    with UserContext(db, current_user):
        q = db.query(Test)
        if current_user.role != 'superadmin':
            q = q.filter((Test.scope == 'system') | (Test.tenant_id == current_user.tenant_id))
        if test_type:
            tt = test_type.upper()
            if tt not in ("SJT","JDT","CASE"):
                raise HTTPException(status_code=400, detail="Invalid test type")
            q = q.filter(Test.test_type == tt)
        if search:
            pat = f"%{search.strip()}%"
            from sqlalchemy import or_
            q = q.filter(or_(Test.name.ilike(pat), Test.description.ilike(pat)))
        items = q.order_by(Test.created_at.desc()).all()
    return items

@router.post("", response_model=TestResponse)
async def create_test(
    payload: TestCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin)
):
    # Validate
    if not payload.name.strip() or not payload.description.strip():
        raise HTTPException(status_code=400, detail="name and description are required")
    tt = payload.test_type.upper()
    if tt not in ("SJT","JDT","CASE"):
        raise HTTPException(status_code=400, detail="Invalid test_type")
    tcode = get_next_code(db, 'tests', 'test_code', 'T')
    t = Test(
        id=str(uuid.uuid4()),
        test_code=tcode,
        name=payload.name.strip(),
        description=payload.description.strip(),
        test_type=tt,
        scope=payload.scope,
        tenant_id=str(payload.tenant_id) if payload.tenant_id else None,
        created_by=str(current_user.id),
        is_active=True,
        config=payload.config if hasattr(payload, 'config') else None
    )
    with UserContext(db, current_user):
        db.add(t)
        db.commit()
        db.refresh(t)
        try:
            db.add(StatusEvent(
                event_type="test_created",
                message=f"Test '{t.name}' created",
                tenant_id=t.tenant_id,
                actor_user_id=current_user.id,
                payload={"test_id": str(t.id), "test_code": t.test_code}
            ))
            db.commit()
        except Exception:
            db.rollback()
    return t

@router.post("/{test_id}/questions", response_model=List[TestQuestionResponse])
async def add_questions_to_test(
    test_id: str,
    payload: TestQuestionAddRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin)
):
    test = db.query(Test).filter(Test.id == test_id).first()
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")
    added: List[TestQuestion] = []
    with UserContext(db, current_user):
        # Determine current max sort order
        max_order = db.query(TestQuestion).filter(TestQuestion.test_id == test_id).count()
        for idx, qid in enumerate(payload.question_ids):
            q = db.query(Question).filter(Question.id == str(qid)).first()
            if not q:
                continue
            tq = TestQuestion(
                id=str(uuid.uuid4()),
                test_id=test_id,
                question_id=str(qid),
                sort_order=max_order + idx,
                settings=None
            )
            db.add(tq)
            added.append(tq)
        db.commit()
        for a in added:
            db.refresh(a)
    return added

@router.put("/{test_id}/competencies", response_model=TestCompetencyOverridesResponse)
async def set_test_competency_overrides(
    test_id: str,
    payload: TestCompetencyOverridesRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin)
):
    test = db.query(Test).filter(Test.id == test_id).first()
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")
    with UserContext(db, current_user):
        # Clear existing
        db.query(TestCompetencyOverride).filter(TestCompetencyOverride.test_id == test_id).delete(synchronize_session=False)
        # Insert new
        items: List[TestCompetencyOverride] = []
        for it in payload.overrides:
            if not it.competency_code or not it.override_description or not it.competency_name:
                continue
            row = TestCompetencyOverride(
                id=str(uuid.uuid4()),
                test_id=test_id,
                competency_code=it.competency_code,
                competency_name=it.competency_name,
                override_description=it.override_description
            )
            db.add(row)
            items.append(row)
        db.commit()
    return TestCompetencyOverridesResponse(
        test_id=uuid.UUID(test_id),
        overrides=[
            {
                "competency_code": r.competency_code,
                "competency_name": r.competency_name,
                "override_description": r.override_description
            } for r in items
        ]  # type: ignore
    )

@router.get("/export")
async def export_tests_csv(
    test_type: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Export structured tests to CSV. Admins see system + their tenant; superadmin sees all.
    CSV columns: test_code,name,description,test_type,scope,tenant_id,is_active,created_at
    """
    from datetime import datetime as _dt
    with UserContext(db, current_user):
        q = db.query(Test)
        if current_user.role != 'superadmin':
            q = q.filter((Test.scope == 'system') | (Test.tenant_id == current_user.tenant_id))
        if test_type:
            tt = test_type.upper()
            if tt not in ("SJT","JDT","CASE"):
                raise HTTPException(status_code=400, detail="Invalid test type")
            q = q.filter(Test.test_type == tt)
        rows = q.order_by(Test.created_at.desc()).all()
    import csv, io
    output = io.StringIO()
    header = ["test_code","name","description","test_type","scope","tenant_id","is_active","created_at"]
    w = csv.DictWriter(output, fieldnames=header)
    w.writeheader()
    for t in rows:
        w.writerow({
            "test_code": t.test_code,
            "name": t.name,
            "description": t.description,
            "test_type": t.test_type,
            "scope": t.scope,
            "tenant_id": t.tenant_id or "",
            "is_active": t.is_active,
            "created_at": t.created_at.isoformat() if isinstance(t.created_at, _dt) else (t.created_at or "")
        })
    return {"csv": output.getvalue(), "count": len(rows)}

# =============================
# Additional test management
# =============================

from pydantic import BaseModel

class TestUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None
    config: Optional[dict] = None

class ReorderRequest(BaseModel):
    # list of question_id in desired order
    question_ids: List[uuid.UUID]

@router.put("/{test_id}", response_model=TestResponse)
async def update_test_metadata(
    test_id: str,
    payload: TestUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin)
):
    t = db.query(Test).filter(Test.id == test_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Test not found")
    data = payload.dict(exclude_unset=True)
    for k, v in data.items():
        setattr(t, k, v)
    db.commit()
    db.refresh(t)
    try:
        db.add(StatusEvent(
            event_type="test_updated",
            message=f"Test '{t.name}' updated",
            tenant_id=t.tenant_id,
            actor_user_id=current_user.id,
            payload={"test_id": str(t.id)}
        ))
        db.commit()
    except Exception:
        db.rollback()
    return t

@router.get("/{test_id}/questions", response_model=List[dict])
async def get_test_questions(
    test_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get all questions for a test (candidates can access via their assignments)"""
    test = db.query(Test).filter(Test.id == test_id).first()
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")
    
    # Get questions with their details
    test_questions = db.query(TestQuestion, Question).join(
        Question, TestQuestion.question_id == Question.id
    ).filter(
        TestQuestion.test_id == test_id
    ).order_by(TestQuestion.sort_order).all()
    
    return [
        {
            "id": str(q.id),
            "question_code": q.question_code,
            "name": q.name,
            "description": q.description,
            "question_type": q.question_type,
            "content": q.content,
            "competencies": q.competencies,
            "reading_time_seconds": tq.settings.get("reading_time_seconds") if tq.settings else 30,
            "answer_time_seconds": tq.settings.get("answer_time_seconds") if tq.settings else 180,
            "sort_order": tq.sort_order
        }
        for tq, q in test_questions
    ]

@router.delete("/{test_id}/questions/{question_id}")
async def remove_question_from_test(
    test_id: str,
    question_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin)
):
    tq = db.query(TestQuestion).filter(TestQuestion.test_id == test_id, TestQuestion.question_id == question_id).first()
    if not tq:
        raise HTTPException(status_code=404, detail="Question not in test")
    db.delete(tq)
    db.commit()
    return {"message": "Removed"}

@router.put("/{test_id}/questions/reorder")
async def reorder_test_questions(
    test_id: str,
    payload: ReorderRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin)
):
    rows = db.query(TestQuestion).filter(TestQuestion.test_id == test_id).all()
    if not rows:
        raise HTTPException(status_code=404, detail="No questions to reorder")
    order_map = {str(qid): idx for idx, qid in enumerate(payload.question_ids)}
    for r in rows:
        new_idx = order_map.get(str(r.question_id))
        if new_idx is not None:
            r.sort_order = new_idx
    db.commit()
    return {"message": "Reordered"}
