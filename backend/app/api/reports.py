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
    current_user: User = Depends(get_current_active_user)  # Changed: Allow admin and superadmin
):
    """Generate AI analysis for a submission. Admins limited to their tenant; superadmin allowed.

    This endpoint composes a dynamic prompt context including per-test competency overrides.
    Actual LLM call can be integrated later; here we persist a structured placeholder result.
    """
    import logging
    logger = logging.getLogger(__name__)
    
    import uuid as _uuid
    try:
        sid = str(_uuid.UUID(submission_id))
    except Exception as e:
        logger.error(f"Invalid submission ID format: {submission_id}, error: {e}")
        raise HTTPException(status_code=400, detail="Invalid submission ID format")

    try:
        with UserContext(db, current_user):
            sub = db.query(Submission).filter(Submission.id == sid).first()
        
        if not sub:
            logger.error(f"Submission not found: {sid}")
            raise HTTPException(status_code=404, detail="Submission not found")
        
        # Check permissions: admin can only access their tenant's submissions
        if current_user.role == "admin":
            if str(sub.tenant_id) != str(current_user.tenant_id):
                logger.warning(f"Admin {current_user.id} tried to access submission from different tenant")
                raise HTTPException(status_code=403, detail="Access denied - not your tenant's submission")
        
        logger.info(f"Generating analysis for submission {sid} by user {current_user.email}")

        # Pull per-test competency overrides
        comp_map = _compose_competency_map_for_test(db, getattr(sub, 'test_id', None))

        # Build prompt context skeleton (without external call)
        prompt_context = {
            "test_type": sub.test_type,
            "competency_overrides": comp_map,
            "conversation_history": sub.conversation_history,
        }

        # TODO: Migrate AI analysis logic from frontend to here
        # For now, trigger the frontend API to do the analysis (temporary bridge)
        # The actual AI analysis will be moved to backend in future commits
        
        # Placeholder analysis result to persist
        analysis = {
            "generated_at": datetime.utcnow().isoformat() + 'Z',
            "summary": "AI analysis placeholder. Integrate Gemini and use competency_overrides for per-question scoring.",
            "by_competency": {},
            "overall": {},
            "_prompt_context": prompt_context,
            "pending_ai_analysis": True,  # Flag to indicate real AI analysis is pending
        }

        with UserContext(db, current_user):
            sub.analysis_result = analysis
            sub.analysis_completed = False  # Changed: Not truly completed until AI analysis runs
            sub.analysis_completed_at = None  # Will be set when AI analysis completes
            sub.status = "analysis_pending"  # Changed: More accurate status
            db.commit()
            logger.info(f"Analysis placeholder saved for submission {sid}, pending AI analysis")

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
            except Exception as event_err:
                logger.warning(f"Failed to create status event: {event_err}")
                db.rollback()

        return {"message": "Analysis generated successfully", "submission_id": str(sub.id)}
    
    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise
    except Exception as e:
        logger.error(f"Unexpected error generating analysis for {sid}: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Analysis generation failed: {str(e)}"
        )

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

@router.get("/{submission_id}/download")
async def download_analysis(
    submission_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Download analysis report for a submission.
    Returns a formatted text/markdown report suitable for download.
    Permissions:
    - Superadmin: any
    - Admin: only within tenant
    - Candidate: only own submission
    """
    import uuid as _uuid
    import logging
    from fastapi.responses import Response
    
    logger = logging.getLogger(__name__)
    
    try:
        sid = str(_uuid.UUID(submission_id))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid submission ID format")
    
    try:
        with UserContext(db, current_user):
            sub = db.query(Submission).filter(Submission.id == sid).first()
        
        if not sub:
            logger.error(f"Submission not found for download: {sid}")
            raise HTTPException(status_code=404, detail="Report not found")
        
        # Permission checks
        if current_user.role == 'admin' and str(sub.tenant_id) != str(current_user.tenant_id):
            logger.warning(f"Admin {current_user.id} tried to download report from different tenant")
            raise HTTPException(status_code=403, detail="Access denied - not your tenant's submission")
        
        if current_user.role == 'candidate' and str(sub.user_id) != str(current_user.id):
            logger.warning(f"Candidate {current_user.id} tried to download another user's report")
            raise HTTPException(status_code=403, detail="Access denied - not your submission")
        
        # Check if analysis exists
        if not sub.analysis_result and not sub.analysis_completed:
            logger.error(f"No analysis available for submission {sid}")
            raise HTTPException(status_code=404, detail="Analysis not yet generated for this submission")
        
        logger.info(f"Generating download for submission {sid} by user {current_user.email}")
        
        # Format the analysis report
        report_lines = []
        report_lines.append("=" * 80)
        report_lines.append("VIBE SMART INTERVIEWER - ANALYSIS REPORT")
        report_lines.append("=" * 80)
        report_lines.append("")
        report_lines.append(f"Report ID: {sub.id}")
        report_lines.append(f"Test Type: {sub.test_type or 'N/A'}")
        report_lines.append(f"Status: {sub.status}")
        report_lines.append(f"Generated At: {sub.analysis_completed_at or sub.created_at}")
        report_lines.append("")
        report_lines.append("-" * 80)
        report_lines.append("ANALYSIS RESULTS")
        report_lines.append("-" * 80)
        report_lines.append("")
        
        if sub.analysis_result:
            analysis = sub.analysis_result
            
            # Summary section
            if "summary" in analysis:
                report_lines.append("SUMMARY:")
                report_lines.append(str(analysis["summary"]))
                report_lines.append("")
            
            # Overall scores
            if "overall" in analysis and analysis["overall"]:
                report_lines.append("OVERALL SCORES:")
                for key, value in analysis["overall"].items():
                    report_lines.append(f"  {key}: {value}")
                report_lines.append("")
            
            # By competency
            if "by_competency" in analysis and analysis["by_competency"]:
                report_lines.append("COMPETENCY BREAKDOWN:")
                for comp_name, comp_data in analysis["by_competency"].items():
                    report_lines.append(f"\n  {comp_name}:")
                    if isinstance(comp_data, dict):
                        for k, v in comp_data.items():
                            report_lines.append(f"    {k}: {v}")
                    else:
                        report_lines.append(f"    {comp_data}")
                report_lines.append("")
            
            # Generated timestamp
            if "generated_at" in analysis:
                report_lines.append(f"Analysis Generated: {analysis['generated_at']}")
                report_lines.append("")
        else:
            report_lines.append("Analysis data not available.")
            report_lines.append("")
        
        report_lines.append("-" * 80)
        report_lines.append("END OF REPORT")
        report_lines.append("=" * 80)
        
        report_content = "\n".join(report_lines)
        
        # Create filename with timestamp
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        filename = f"analysis_report_{sub.id}_{timestamp}.txt"
        
        logger.info(f"Download successful for submission {sid}")
        
        return Response(
            content=report_content,
            media_type="text/plain",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"'
            }
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error downloading analysis for {sid}: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to download analysis: {str(e)}"
        )

@router.post("/generate-ai/{submission_id}")
async def generate_ai_analysis(
    submission_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    NEW ENDPOINT: Generate real AI analysis for a submission.
    This endpoint will contain the migrated AI analysis logic from the frontend.
    
    TODO: Migrate the following from frontend/src/app/api/background-analysis/route.ts:
    - AI initialization (getAI())
    - Submission fetching logic
    - Interview analysis (analyzeConversation)
    - SJT analysis (analyzeSJTScenario, analyzeSJTResponse, analyzeSingleCompetency)
    - Competency summary generation (generateCompetencySummaries)
    - Scenario grouping logic (groupEntriesByScenario)
    - Penalty calculations (calculatePenaltyScore)
    
    For now, this returns a placeholder response indicating migration is needed.
    """
    import logging
    import uuid as _uuid
    from fastapi.responses import Response
    
    logger = logging.getLogger(__name__)
    
    try:
        sid = str(_uuid.UUID(submission_id))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid submission ID format")
    
    try:
        with UserContext(db, current_user):
            sub = db.query(Submission).filter(Submission.id == sid).first()
        
        if not sub:
            logger.error(f"Submission not found for AI analysis: {sid}")
            raise HTTPException(status_code=404, detail="Submission not found")
        
        # Permission checks
        if current_user.role == 'admin' and str(sub.tenant_id) != str(current_user.tenant_id):
            logger.warning(f"Admin {current_user.id} tried to access submission from different tenant")
            raise HTTPException(status_code=403, detail="Access denied - not your tenant's submission")
        
        if current_user.role == 'candidate' and str(sub.user_id) != str(current_user.id):
            logger.warning(f"Candidate {current_user.id} tried to access another user's submission")
            raise HTTPException(status_code=403, detail="Access denied - not your submission")
        
        logger.info(f"Starting AI analysis for submission {sid} by user {current_user.email}")
        
        # FIX: Check if conversation_history exists and is not None before accessing length
        conversation_history = sub.conversation_history or []
        if not isinstance(conversation_history, list):
            logger.warning(f"Invalid conversation_history type for submission {sid}: {type(conversation_history)}")
            conversation_history = []
        
        logger.info(f"Submission has {len(conversation_history)} conversation entries")
        
        # TODO: MIGRATE AI ANALYSIS LOGIC FROM FRONTEND HERE
        # Currently this is a placeholder that will be replaced with actual AI analysis
        # The frontend route at /api/background-analysis should be deprecated once migration is complete
        
        # For now, return error indicating frontend should still be used
        raise HTTPException(
            status_code=501,
            detail="AI analysis migration in progress. Please use the frontend /api/background-analysis endpoint for now."
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in AI analysis for {sid}: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"AI analysis failed: {str(e)}"
        )
