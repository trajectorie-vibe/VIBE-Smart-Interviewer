"""
Reports & Analytics API
Returns AI-generated reports for submissions. We treat analyzed submissions as generated reports.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime

from app.database import get_db
from app.auth import require_superadmin, get_current_active_user, UserContext, require_admin
from app.models import Submission, User, Tenant, Test, TestCompetencyOverride, StatusEvent
from sqlalchemy import or_
from typing import Dict, Any

router = APIRouter(prefix="/reports", tags=["reports"]) 

@router.get("/generated")
async def list_generated_reports(
    tenant_id: Optional[str] = None,
    user_id: Optional[str] = None,
    test_type: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """List AI-generated reports (submissions with analysis_result or analysis_completed).
    - Superadmin: can filter by tenant/user/test_type.
    - Admin: restricted to their tenant.
    """
    with UserContext(db, current_user):
        q = db.query(Submission)
        if current_user.role != 'superadmin':
            q = q.filter(Submission.tenant_id == current_user.tenant_id)
        else:
            if tenant_id:
                q = q.filter(Submission.tenant_id == tenant_id)
        if user_id:
            q = q.filter(Submission.user_id == user_id)
        if test_type:
            q = q.filter(Submission.test_type == test_type)
        # Consider any analyzed submission as a generated report
        q = q.filter(or_(Submission.analysis_result != None, Submission.analysis_completed == True))
        items = q.order_by(Submission.created_at.desc()).limit(500).all()

    # Map to a friendly response with generator inference (admin email if available)
    result = []
    for s in items:
        result.append({
            "report_id": str(s.id),
            "tenant_id": str(s.tenant_id) if s.tenant_id else None,
            "user_id": str(s.user_id) if s.user_id else None,
            "test_type": s.test_type,
            "created_at": s.created_at.isoformat() if isinstance(s.created_at, datetime) else s.created_at,
            "analysis_completed": bool(s.analysis_completed),
            "status": s.status,
        })
    return {"reports": result, "total": len(result)}


def _compose_competency_map_for_test(db: Session, test_id: Optional[str]) -> Dict[str, Dict[str, Any]]:
    """Return a mapping of competency_code -> { name, description } using per-test overrides if present."""
    mapping: Dict[str, Dict[str, Any]] = {}
    if not test_id:
        return mapping
    try:
        overrides = db.query(TestCompetencyOverride).filter(TestCompetencyOverride.test_id == test_id).all()
        for ov in overrides:
            mapping[ov.competency_code] = {
                "competency_name": ov.competency_name,
                "description": ov.override_description,
            }
    except Exception:
        pass
    return mapping

@router.post("/generate/{submission_id}")
async def generate_ai_report(
    submission_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin)
):
    """Generate AI analysis for a submission. Admins limited to their tenant; superadmin allowed.

    This endpoint composes a dynamic prompt context including per-test competency overrides.
    Actual LLM call can be integrated later; here we persist a structured placeholder result.
    """
    import uuid as _uuid
    try:
        sid = str(_uuid.UUID(submission_id))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid submission ID format")

    with UserContext(db, current_user):
        sub = db.query(Submission).filter(Submission.id == sid).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")
    # superadmin only already enforced by dependency

    # Pull per-test competency overrides
    comp_map = _compose_competency_map_for_test(db, getattr(sub, 'test_id', None))

    # Build prompt context skeleton (without external call)
    prompt_context = {
        "test_type": sub.test_type,
        "competency_overrides": comp_map,
        "conversation_history": sub.conversation_history,
    }

    # Placeholder analysis result to persist
    analysis = {
        "generated_at": datetime.utcnow().isoformat() + 'Z',
        "summary": "AI analysis placeholder. Integrate Gemini and use competency_overrides for per-question scoring.",
        "by_competency": {},
        "overall": {},
        "_prompt_context": prompt_context,
    }

    with UserContext(db, current_user):
        sub.analysis_result = analysis
        sub.analysis_completed = True
        sub.analysis_completed_at = datetime.utcnow()
        sub.status = "completed"
        db.commit()

        # Status event
        try:
            db.add(StatusEvent(
                event_type="report_generated",
                message=f"AI report generated for submission {sub.id}",
                tenant_id=sub.tenant_id,
                actor_user_id=current_user.id,
                payload={"submission_id": str(sub.id)}
            ))
            db.commit()
        except Exception:
            db.rollback()

    return {"message": "Analysis generated", "submission_id": str(sub.id)}

@router.get("/{submission_id}")
async def get_report(
    submission_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Fetch a single generated report. Permissions:
    - Superadmin: any
    - Admin: only within tenant
    - Candidate: only own submission
    """
    import uuid as _uuid
    try:
        sid = str(_uuid.UUID(submission_id))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid submission ID format")
    with UserContext(db, current_user):
        sub = db.query(Submission).filter(Submission.id == sid).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Report not found")
    if current_user.role == 'admin' and str(sub.tenant_id) != str(current_user.tenant_id):
        raise HTTPException(status_code=403, detail="Access denied")
    if current_user.role == 'candidate' and str(sub.user_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Access denied")
    # basic payload
    return {
        "submission": {
            "id": str(sub.id),
            "user_id": str(sub.user_id) if sub.user_id else None,
            "tenant_id": str(sub.tenant_id) if sub.tenant_id else None,
            "test_type": sub.test_type,
            "status": sub.status,
            "created_at": sub.created_at,
            "analysis_completed": bool(sub.analysis_completed),
        },
        "analysis_result": sub.analysis_result,
    }
