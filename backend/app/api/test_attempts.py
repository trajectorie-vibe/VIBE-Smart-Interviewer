"""Test Attempts CRUD endpoints - for frontend compatibility"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional, List
from pydantic import BaseModel
import uuid
from datetime import datetime

from app.database import get_db
from app.auth import get_current_active_user
from app.models import User, TestAttempt, TestAssignment
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/test-attempts", tags=["test-attempts"])


class CreateTestAttemptRequest(BaseModel):
    user_id: str
    test_type: str
    assignment_id: str
    status: str = "in_progress"


class UpdateTestAttemptRequest(BaseModel):
    status: Optional[str] = None
    score: Optional[float] = None
    answers: Optional[dict] = None


class TestAttemptResponse(BaseModel):
    id: str
    user_id: str
    test_type: str
    assignment_id: Optional[str]
    status: str
    attempt_number: int
    started_at: datetime
    completed_at: Optional[datetime]
    attempt_metadata: Optional[dict]

    class Config:
        from_attributes = True


@router.post("", response_model=TestAttemptResponse)
@router.post("/", response_model=TestAttemptResponse, include_in_schema=False)
async def create_test_attempt(
    data: CreateTestAttemptRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Create a new test attempt record"""
    try:
        # Validate user_id matches current user (for candidates)
        if current_user.role == "candidate" and str(current_user.id) != data.user_id:
            raise HTTPException(status_code=403, detail="Cannot create attempt for another user")
        
        # Validate test type
        test_type = data.test_type.upper()
        if test_type not in ("JDT", "SJT"):
            raise HTTPException(status_code=400, detail="Invalid test_type. Must be JDT or SJT")
        
        # Check if assignment exists
        assignment = None
        if data.assignment_id:
            try:
                assignment_uuid = uuid.UUID(data.assignment_id)
                assignment = db.query(TestAssignment).filter(
                    TestAssignment.id == assignment_uuid
                ).first()
            except ValueError:
                pass
        
        # Determine attempt number
        existing_attempts = db.query(TestAttempt).filter(
            TestAttempt.user_id == uuid.UUID(data.user_id),
            TestAttempt.test_type == test_type
        ).count()
        
        attempt_number = existing_attempts + 1
        
        # Create the attempt
        new_attempt = TestAttempt(
            id=str(uuid.uuid4()),
            user_id=uuid.UUID(data.user_id),
            test_type=test_type,
            assignment_id=uuid.UUID(data.assignment_id) if data.assignment_id else None,
            tenant_id=current_user.tenant_id,
            status=data.status,
            attempt_number=attempt_number,
            started_at=datetime.utcnow(),
            attempt_metadata={}
        )
        
        db.add(new_attempt)
        db.commit()
        db.refresh(new_attempt)
        
        logger.info(f"Created test attempt {new_attempt.id} for user {data.user_id}, test {test_type}")
        
        return TestAttemptResponse(
            id=str(new_attempt.id),
            user_id=str(new_attempt.user_id),
            test_type=new_attempt.test_type,
            assignment_id=str(new_attempt.assignment_id) if new_attempt.assignment_id else None,
            status=new_attempt.status,
            attempt_number=new_attempt.attempt_number,
            started_at=new_attempt.started_at,
            completed_at=new_attempt.completed_at,
            attempt_metadata=new_attempt.attempt_metadata
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating test attempt: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create test attempt: {str(e)}")


@router.get("", response_model=List[TestAttemptResponse])
@router.get("/", response_model=List[TestAttemptResponse], include_in_schema=False)
async def get_test_attempts(
    user_id: Optional[str] = Query(None),
    test_type: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get test attempts with optional filters"""
    try:
        query = db.query(TestAttempt)
        
        # Candidates can only see their own attempts
        if current_user.role == "candidate":
            query = query.filter(TestAttempt.user_id == current_user.id)
        elif user_id:
            # Admins can filter by user_id
            try:
                user_uuid = uuid.UUID(user_id)
                query = query.filter(TestAttempt.user_id == user_uuid)
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid user_id format")
        
        if test_type:
            query = query.filter(TestAttempt.test_type == test_type.upper())
        
        attempts = query.order_by(TestAttempt.started_at.desc()).limit(100).all()
        
        return [
            TestAttemptResponse(
                id=str(a.id),
                user_id=str(a.user_id),
                test_type=a.test_type,
                assignment_id=str(a.assignment_id) if a.assignment_id else None,
                status=a.status,
                attempt_number=a.attempt_number,
                started_at=a.started_at,
                completed_at=a.completed_at,
                attempt_metadata=a.attempt_metadata
            )
            for a in attempts
        ]
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching test attempts: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to fetch test attempts")


@router.put("/{attempt_id}", response_model=TestAttemptResponse)
async def update_test_attempt(
    attempt_id: str,
    data: UpdateTestAttemptRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Update a test attempt"""
    try:
        # Get the attempt
        try:
            attempt_uuid = uuid.UUID(attempt_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid attempt_id format")
        
        attempt = db.query(TestAttempt).filter(TestAttempt.id == attempt_uuid).first()
        if not attempt:
            raise HTTPException(status_code=404, detail="Test attempt not found")
        
        # Check permissions
        if current_user.role == "candidate" and attempt.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Cannot update another user's attempt")
        
        # Update fields
        if data.status is not None:
            attempt.status = data.status
            if data.status == "completed" and not attempt.completed_at:
                attempt.completed_at = datetime.utcnow()
        
        if data.score is not None or data.answers is not None:
            metadata = attempt.attempt_metadata or {}
            if data.score is not None:
                metadata['score'] = data.score
            if data.answers is not None:
                metadata['answers'] = data.answers
            attempt.attempt_metadata = metadata
        
        db.commit()
        db.refresh(attempt)
        
        logger.info(f"Updated test attempt {attempt_id}")
        
        return TestAttemptResponse(
            id=str(attempt.id),
            user_id=str(attempt.user_id),
            test_type=attempt.test_type,
            assignment_id=str(attempt.assignment_id) if attempt.assignment_id else None,
            status=attempt.status,
            attempt_number=attempt.attempt_number,
            started_at=attempt.started_at,
            completed_at=attempt.completed_at,
            attempt_metadata=attempt.attempt_metadata
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating test attempt: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to update test attempt")


@router.get("/{attempt_id}", response_model=TestAttemptResponse)
async def get_test_attempt(
    attempt_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get a specific test attempt by ID"""
    try:
        try:
            attempt_uuid = uuid.UUID(attempt_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid attempt_id format")
        
        attempt = db.query(TestAttempt).filter(TestAttempt.id == attempt_uuid).first()
        if not attempt:
            raise HTTPException(status_code=404, detail="Test attempt not found")
        
        # Check permissions
        if current_user.role == "candidate" and attempt.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Cannot view another user's attempt")
        
        return TestAttemptResponse(
            id=str(attempt.id),
            user_id=str(attempt.user_id),
            test_type=attempt.test_type,
            assignment_id=str(attempt.assignment_id) if attempt.assignment_id else None,
            status=attempt.status,
            attempt_number=attempt.attempt_number,
            started_at=attempt.started_at,
            completed_at=attempt.completed_at,
            attempt_metadata=attempt.attempt_metadata
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching test attempt: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to fetch test attempt")
