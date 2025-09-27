"""
Question Bank API for managing questions (superadmin primary owner).
Features:
- List/filter by type, text, competencies (AND filter), tenant scope
- Create question, optionally add to bank
- CSV import/export with validation (skip duplicates by question_code)
"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
import csv
import io
import uuid

from app.database import get_db
from app.auth import require_superadmin, get_current_active_user, UserContext
from app.models import User, Question, QuestionCreate, QuestionResponse, QuestionUpdate, StatusEvent, TestQuestion
from app.utils.ids import get_next_code

router = APIRouter(prefix="/question-bank", tags=["question_bank"])

def _require_non_empty_fields(data: Dict[str, Any], fields: List[str]):
    for f in fields:
        v = data.get(f)
        if v is None or (isinstance(v, str) and v.strip() == ""):
            raise HTTPException(status_code=400, detail=f"Field '{f}' is required and cannot be empty")

@router.get("", response_model=List[QuestionResponse])
async def list_questions(
    qtype: Optional[str] = Query(None, description="Filter by question_type: SJT, JDT, CASE"),
    search: Optional[str] = Query(None, description="Search in name/description (icontains)"),
    competencies: Optional[List[str]] = Query(None, description="Filter questions containing ALL these competency codes"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    with UserContext(db, current_user):
        query = db.query(Question)
        if current_user.role != 'superadmin':
            # Admins can see system-level and their tenant questions
            query = query.filter((Question.scope == 'system') | (Question.tenant_id == current_user.tenant_id))
        if qtype:
            qt = qtype.upper()
            if qt not in ("SJT","JDT","CASE"):
                raise HTTPException(status_code=400, detail="Invalid question type")
            query = query.filter(Question.question_type == qt)
        if search:
            pat = f"%{search.strip()}%"
            from sqlalchemy import or_
            query = query.filter(or_(Question.name.ilike(pat), Question.description.ilike(pat)))
        items = query.order_by(Question.created_at.desc()).all()
    # AND-filter by competencies in Python to avoid dialect JSON differences
    if competencies:
        comp_set = {c.strip() for c in competencies if c.strip()}
        filtered = []
        for it in items:
            try:
                q_comps = set(it.competencies or [])
                if comp_set.issubset(q_comps):
                    filtered.append(it)
            except Exception:
                continue
        items = filtered
    return items

@router.post("", response_model=QuestionResponse)
async def create_question(
    payload: QuestionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin)
):
    data = payload.dict()
    _require_non_empty_fields(data, ["name","description","question_type","competencies","content"])
    # Generate code
    qcode = get_next_code(db, 'questions', 'question_code', 'Q')
    q = Question(
        id=str(uuid.uuid4()),
        question_code=qcode,
        name=payload.name.strip(),
        description=payload.description.strip(),
        question_type=payload.question_type.upper(),
        competencies=payload.competencies,
        content=payload.content,
        scope=payload.scope,
        tenant_id=str(payload.tenant_id) if payload.tenant_id else None,
        created_by=str(current_user.id)
    )
    with UserContext(db, current_user):
        db.add(q)
        db.commit()
        db.refresh(q)
        try:
            db.add(StatusEvent(
                event_type="question_added",
                message=f"Question '{q.name}' added to Question Bank",
                tenant_id=q.tenant_id,
                actor_user_id=current_user.id,
                payload={"question_id": str(q.id), "question_code": q.question_code}
            ))
            db.commit()
        except Exception:
            db.rollback()
    return q

@router.post("/import")
async def import_questions_csv(
    file: UploadFile = File(...),
    scope: str = Form("system"),
    tenant_id: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin)
):
    if scope not in ("system","tenant"):
        raise HTTPException(status_code=400, detail="Invalid scope")
    content = await file.read()
    text = content.decode("utf-8", errors="ignore")
    reader = csv.DictReader(io.StringIO(text))
    required = ["name","description","question_type","competencies","content"]
    created, skipped = 0, []
    with UserContext(db, current_user):
        for row in reader:
            # Ignore completely empty rows
            if not any((v or "").strip() for v in row.values()):
                continue
            # Validate required fields non-empty
            try:
                _require_non_empty_fields(row, required)
            except HTTPException as e:
                skipped.append({"row": row, "reason": e.detail})
                continue
            qt = row["question_type"].strip().upper()
            if qt not in ("SJT","JDT","CASE"):
                skipped.append({"row": row, "reason": "invalid question_type"})
                continue
            # Parse competencies and content JSON
            try:
                comps = [c.strip() for c in row["competencies"].split("|") if c.strip()]
                import json
                content_json = json.loads(row["content"])
            except Exception:
                skipped.append({"row": row, "reason": "invalid competencies/content"})
                continue
            # Skip duplicates by name + type or explicit question_code if column present
            existing = db.query(Question).filter(
                Question.name == row["name"].strip(),
                Question.question_type == qt
            ).first()
            if existing:
                skipped.append({"row": row, "reason": "duplicate (name+type)"})
                continue
            qcode_in = (row.get("question_code") or "").strip()
            if qcode_in:
                exists_code = db.query(Question).filter(Question.question_code == qcode_in).first()
                if exists_code:
                    skipped.append({"row": row, "reason": "duplicate (question_code)"})
                    continue
            qcode = qcode_in or get_next_code(db, 'questions', 'question_code', 'Q')
            q = Question(
                id=str(uuid.uuid4()),
                question_code=qcode,
                name=row["name"].strip(),
                description=row["description"].strip(),
                question_type=qt,
                competencies=comps,
                content=content_json,
                scope=scope,
                tenant_id=tenant_id,
                created_by=str(current_user.id)
            )
            db.add(q)
            created += 1
        db.commit()
    return {"created": created, "skipped": skipped}

@router.get("/export")
async def export_questions_csv(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin)
):
    headers = ["question_code","name","description","question_type","competencies","content","scope","tenant_id"]
    items = db.query(Question).order_by(Question.created_at.asc()).all()
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=headers)
    writer.writeheader()
    import json
    for q in items:
        writer.writerow({
            "question_code": q.question_code,
            "name": q.name,
            "description": q.description,
            "question_type": q.question_type,
            "competencies": "|".join(q.competencies or []),
            "content": json.dumps(q.content or {}),
            "scope": q.scope,
            "tenant_id": q.tenant_id or ""
        })
    return {"csv": output.getvalue()}

@router.put("/{question_id}", response_model=QuestionResponse)
async def update_question(
    question_id: str,
    payload: QuestionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin)
):
    with UserContext(db, current_user):
        q = db.query(Question).filter(Question.id == question_id).first()
        if not q:
            raise HTTPException(status_code=404, detail="Question not found")
        data = payload.dict(exclude_unset=True)
        # Validate if provided
        if 'name' in data and (not data['name'] or not data['name'].strip()):
            raise HTTPException(status_code=400, detail="Name cannot be empty")
        if 'description' in data and (not data['description'] or not data['description'].strip()):
            raise HTTPException(status_code=400, detail="Description cannot be empty")
        if 'question_type' in data:
            qt = (data['question_type'] or '').upper()
            if qt not in ("SJT","JDT","CASE"):
                raise HTTPException(status_code=400, detail="Invalid question_type")
            q.question_type = qt
            del data['question_type']
        # Apply others
        for k, v in data.items():
            setattr(q, k, v)
        db.commit()
        db.refresh(q)
        try:
            db.add(StatusEvent(
                event_type="question_updated",
                message=f"Question '{q.name}' updated",
                tenant_id=q.tenant_id,
                actor_user_id=current_user.id,
                payload={"question_id": str(q.id), "question_code": q.question_code}
            ))
            db.commit()
        except Exception:
            db.rollback()
        return q

@router.delete("/{question_id}")
async def delete_question(
    question_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin)
):
    with UserContext(db, current_user):
        q = db.query(Question).filter(Question.id == question_id).first()
        if not q:
            raise HTTPException(status_code=404, detail="Question not found")
        # Safety: prevent deletion if question is used by any structured test
        used = db.query(TestQuestion).filter(TestQuestion.question_id == question_id).first()
        if used:
            raise HTTPException(status_code=409, detail="Question is used in one or more tests and cannot be deleted")
        db.delete(q)
        db.commit()
        try:
            db.add(StatusEvent(
                event_type="question_deleted",
                message=f"Question '{q.name}' deleted",
                tenant_id=q.tenant_id,
                actor_user_id=current_user.id,
                payload={"question_id": question_id, "question_code": q.question_code}
            ))
            db.commit()
        except Exception:
            db.rollback()
        return {"message": "Deleted"}
