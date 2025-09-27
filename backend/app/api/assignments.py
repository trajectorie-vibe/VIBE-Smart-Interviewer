"""
User and Test Assignment API endpoints

Architecture update:
- Superadmin assigns tests directly to candidates across tenants (via test_id or test_type).
- Admins are read-only for assignments; they can view any test assignments for users in their own tenant.
- Legacy user-to-admin assignment endpoints are retained for backward compatibility but are deprecated.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from app.database import get_db
from app.auth import get_current_user, require_superadmin, require_admin
from app.models import (
    User, UserAssignment, TestAssignment, Tenant,
    UserAssignmentCreate, UserAssignmentResponse,
    TestAssignmentCreate, TestAssignmentResponse, TestAssignmentUpdate,
    BulkUserAssignmentRequest, BulkTestAssignmentRequest, Test
)
from app.models import StatusEvent
import uuid
from datetime import datetime

router = APIRouter(prefix="/assignments", tags=["assignments"])

# =====================================================
# (DEPRECATED) SUPERADMIN USER ASSIGNMENT ENDPOINTS
# Retained for backward compatibility but not recommended.
# =====================================================

@router.get("/users", response_model=List[UserAssignmentResponse])
async def get_user_assignments(
    admin_id: Optional[str] = None,
    user_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin)
):
    """Get all user assignments, optionally filtered by admin or user"""
    query = db.query(UserAssignment).filter(UserAssignment.is_active == True)
    
    if admin_id:
        query = query.filter(UserAssignment.admin_id == admin_id)
    if user_id:
        query = query.filter(UserAssignment.user_id == user_id)
    
    return query.all()

@router.post("/users/bulk", response_model=List[UserAssignmentResponse])
async def bulk_assign_users_to_admin(
    request: BulkUserAssignmentRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin)
):
    """Assign multiple users to an admin (superadmin only) [Deprecated]"""
    # Verify admin exists and has admin role
    admin = db.query(User).filter(
        User.id == str(request.admin_id),
        User.role == "admin"
    ).first()
    if not admin:
        raise HTTPException(status_code=404, detail="Admin user not found")
    
    # Verify users exist and have candidate role
    users = db.query(User).filter(
        User.id.in_([str(uid) for uid in request.user_ids]),
        User.role == "candidate"
    ).all()
    if len(users) != len(request.user_ids):
        raise HTTPException(status_code=400, detail="Some users not found or not candidates")
    
    created_assignments = []
    for user in users:
        # Check if assignment already exists
        existing = db.query(UserAssignment).filter(
            UserAssignment.user_id == user.id,
            UserAssignment.admin_id == str(request.admin_id),
            UserAssignment.is_active == True
        ).first()
        
        if existing:
            continue  # Skip if already assigned
        
        # Create new assignment with tenant_id validation/fallback
        user_tenant_id = user.tenant_id or current_user.tenant_id
        if not user_tenant_id:
            raise HTTPException(status_code=400, detail=f"User {user.email} has no valid tenant_id")
        
        assignment = UserAssignment(
            id=str(uuid.uuid4()),
            user_id=user.id,
            admin_id=str(request.admin_id),
            tenant_id=user_tenant_id,
            assigned_by=current_user.id,
            notes=request.notes
        )
        db.add(assignment)
        created_assignments.append(assignment)
    
    db.commit()
    for assignment in created_assignments:
        db.refresh(assignment)
    
    return created_assignments

@router.delete("/users/{assignment_id}")
async def remove_user_assignment(
    assignment_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin)
):
    """Remove user assignment (superadmin only)"""
    assignment = db.query(UserAssignment).filter(
        UserAssignment.id == assignment_id,
        UserAssignment.is_active == True
    ).first()
    
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    
    assignment.is_active = False
    db.commit()
    
    return {"message": "User assignment removed successfully"}

# =====================================================
# ADMIN TEST ASSIGNMENT ENDPOINTS
# =====================================================

@router.get("/tests", response_model=List[TestAssignmentResponse])
async def get_test_assignments(
    user_id: Optional[str] = None,
    test_type: Optional[str] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """List test assignments.
    - Superadmin: all assignments
    - Admin: assignments for users within the admin's tenant (read-only)
    """
    if current_user.role == "superadmin":
        query = db.query(TestAssignment)
    else:
        # Scope by tenant so admins see any superadmin-created assignments for their company
        query = db.query(TestAssignment).filter(
            TestAssignment.tenant_id == current_user.tenant_id
        )
    
    if user_id:
        query = query.filter(TestAssignment.user_id == user_id)
    if test_type:
        query = query.filter(TestAssignment.test_type == test_type)
    if status:
        query = query.filter(TestAssignment.status == status)
    
    return query.all()

@router.post("/tests/bulk", response_model=List[TestAssignmentResponse])
async def bulk_assign_tests_to_users(
    request: BulkTestAssignmentRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin)
):
    """Assign tests to multiple users (admin only for their assigned users).
    Prefer request.test_id if provided; otherwise fall back to legacy test_types.
    """
    # Superadmin assigns across tenants; ensure users belong to a single tenant per call to keep config consistent
    
    # Normalize incoming fields
    test_obj = None
    if request.test_id:
        test_obj = db.query(Test).filter(Test.id == str(request.test_id)).first()
        if not test_obj:
            raise HTTPException(status_code=404, detail="test_id not found")
        normalized_test_types = [test_obj.test_type]
    else:
        try:
            normalized_test_types = [str(t).upper() for t in (request.test_types or [])]
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid test_types format; expected a list of strings")

    # Coerce scenario IDs to strings if provided
    normalized_scenario_ids = None
    if request.sjt_scenario_ids is not None:
        try:
            normalized_scenario_ids = [str(x) for x in request.sjt_scenario_ids]
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid sjt_scenario_ids; expected a list of strings or numbers")

    # Verify users exist
    users = db.query(User).filter(
        User.id.in_([str(uid) for uid in request.user_ids]),
        User.role == "candidate"
    ).all()
    if len(users) != len(request.user_ids):
        raise HTTPException(status_code=400, detail="Some users not found or not candidates")
    
    created_assignments = []
    for user in users:
        for test_type in normalized_test_types:
            # Normalize test type to uppercase to match constraint (JDT/SJT)
            if test_type not in ("JDT", "SJT"):
                continue
            # Check if assignment already exists
            existing = db.query(TestAssignment).filter(
                TestAssignment.user_id == user.id,
                TestAssignment.test_type == test_type
            ).first()
            
            if existing:
                continue  # Skip if already assigned
            
            # Create new test assignment with tenant_id validation
            user_tenant_id = user.tenant_id or current_user.tenant_id
            if not user_tenant_id:
                raise HTTPException(status_code=400, detail=f"User {user.email} has no valid tenant_id")
            
            assignment = TestAssignment(
                id=str(uuid.uuid4()),
                user_id=user.id,
                admin_id=current_user.id,
                tenant_id=user_tenant_id,
                test_type=test_type,
                test_id=(test_obj.id if test_obj else None),
                status='assigned',  # Explicitly set status
                due_date=request.due_date,
                max_attempts=request.max_attempts,
                notes=request.notes,
                custom_config=(
                    { 'sjt_scenario_ids': normalized_scenario_ids }
                    if (test_type == 'SJT' and normalized_scenario_ids)
                    else None
                )
            )
            db.add(assignment)
            created_assignments.append(assignment)
    
    db.commit()
    for assignment in created_assignments:
        db.refresh(assignment)
    
    # Add status event
    try:
        msg = f"Assigned test {test_obj.name if test_obj else '/'.join(normalized_test_types)} to {len(users)} users"
        ev = StatusEvent(
            event_type="test_assigned",
            message=msg,
            tenant_id=current_user.tenant_id,
            actor_user_id=current_user.id,
            payload={
                "count": len(created_assignments),
                "test_id": getattr(test_obj, 'id', None),
            }
        )
        db.add(ev)
        db.commit()
    except Exception:
        db.rollback()
    return created_assignments

@router.put("/tests/{assignment_id}", response_model=TestAssignmentResponse)
async def update_test_assignment(
    assignment_id: str,
    update_data: TestAssignmentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin)
):
    """Update test assignment status and details"""
    query = db.query(TestAssignment).filter(TestAssignment.id == assignment_id)
    
    # Superadmin only per new architecture
    
    assignment = query.first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Test assignment not found")
    
    # Update fields
    update_dict = update_data.dict(exclude_unset=True)
    for field, value in update_dict.items():
        setattr(assignment, field, value)
    
    assignment.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(assignment)
    
    return assignment

@router.delete("/tests/{assignment_id}")
async def remove_test_assignment(
    assignment_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin)
):
    """Remove test assignment"""
    query = db.query(TestAssignment).filter(TestAssignment.id == assignment_id)
    
    # Superadmin only per new architecture
    
    assignment = query.first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Test assignment not found")
    
    db.delete(assignment)
    db.commit()
    
    return {"message": "Test assignment removed successfully"}

# =====================================================
# SUPERADMIN CSV ASSIGNMENT IMPORT
# =====================================================

from fastapi import UploadFile, File
import csv, io

@router.post("/tests/import-csv", response_model=List[TestAssignmentResponse])
async def import_test_assignments_csv(
    file: UploadFile = File(..., description="CSV with headers: identifier,type where identifier is candidate_id or email; type is optional when test_id provided"),
    test_id: Optional[str] = None,
    test_type: Optional[str] = None,
    tenant_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin)
):
    """Create test assignments in bulk from CSV by candidate identifier.

    Rules:
    - If test_id is provided, it is preferred and determines test type automatically.
    - Else test_type is required and must be JDT or SJT.
    - identifier column can be email or candidate_id; we try email first, then candidate_id.
    - Empty rows ignored. Duplicates skipped.
    """
    from app.models import Test
    t_obj = None
    if test_id:
        t_obj = db.query(Test).filter(Test.id == test_id).first()
        if not t_obj:
            raise HTTPException(status_code=404, detail="test_id not found")
        tt = t_obj.test_type
    else:
        if not test_type:
            raise HTTPException(status_code=400, detail="Either test_id or test_type is required")
        tt = test_type.upper()
        if tt not in ("JDT","SJT"):
            raise HTTPException(status_code=400, detail="Invalid test_type")

    content = await file.read()
    text = content.decode("utf-8", errors="ignore")
    reader = csv.DictReader(io.StringIO(text))
    required = ["identifier"]

    created: List[TestAssignment] = []
    seen_pairs = set()
    for row in reader:
        if not any((v or "").strip() for v in row.values()):
            continue
        ident = (row.get("identifier") or "").strip()
        if not ident:
            continue
        # Lookup user by email first, then candidate_id
        user = db.query(User).filter(User.email == ident).first()
        if not user:
            user = db.query(User).filter(User.candidate_id == ident).first()
        if not user:
            continue
        # Optional tenant filter
        if tenant_id and str(user.tenant_id) != tenant_id:
            continue
        key = (user.id, tt)
        if key in seen_pairs:
            continue
        seen_pairs.add(key)
        # Skip if assignment exists
        exists = db.query(TestAssignment).filter(
            TestAssignment.user_id == user.id,
            TestAssignment.test_type == tt
        ).first()
        if exists:
            continue
        assignment = TestAssignment(
            user_id=user.id,
            admin_id=current_user.id,
            tenant_id=user.tenant_id,
            test_type=tt,
            test_id=(t_obj.id if t_obj else None),
            status='assigned'
        )
        db.add(assignment)
        created.append(assignment)
    db.commit()
    for a in created:
        db.refresh(a)
    # Status event
    try:
        msg = f"Assigned {len(created)} {tt} tests via CSV"
        ev = StatusEvent(
            event_type="test_assigned_csv",
            message=msg,
            tenant_id=tenant_id,
            actor_user_id=current_user.id,
            payload={"count": len(created), "test_id": getattr(t_obj,'id', None)}
        )
        db.add(ev)
        db.commit()
    except Exception:
        db.rollback()
    return created

# =====================================================
# CSV EXPORTS
# =====================================================

@router.get("/tests/export")
async def export_test_assignments_csv(
    user_id: Optional[str] = None,
    test_type: Optional[str] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Export test assignments as CSV.
    - Superadmin: all assignments, optional filters.
    - Admin: only for users assigned to them.
    CSV columns: user_email,candidate_id,test_type,test_code,test_name,status,due_date,assigned_at,started_at,completed_at,admin_email,tenant_id
    """
    # Build base query with role constraints
    if current_user.role == "superadmin":
        query = db.query(TestAssignment)
    else:
        # Admins export assignments for their tenant
        query = db.query(TestAssignment).filter(
            TestAssignment.tenant_id == current_user.tenant_id
        )

    if user_id:
        query = query.filter(TestAssignment.user_id == user_id)
    if test_type:
        query = query.filter(TestAssignment.test_type == test_type)
    if status:
        query = query.filter(TestAssignment.status == status)

    rows = query.order_by(TestAssignment.assigned_at.desc()).all()

    # Preload related users/admins/tests to avoid N+1 lookups
    user_map = {}
    admin_map = {}
    test_map = {}
    for r in rows:
        if r.user_id and r.user_id not in user_map:
            u = db.query(User).filter(User.id == r.user_id).first()
            if u:
                user_map[r.user_id] = u
        if r.admin_id and r.admin_id not in admin_map:
            a = db.query(User).filter(User.id == r.admin_id).first()
            if a:
                admin_map[r.admin_id] = a
        if r.test_id and r.test_id not in test_map:
            t = db.query(Test).filter(Test.id == r.test_id).first()
            if t:
                test_map[r.test_id] = t

    header = [
        "user_email","candidate_id","test_type","test_code","test_name",
        "status","due_date","assigned_at","started_at","completed_at",
        "admin_email","tenant_id"
    ]
    output = io.StringIO()
    w = csv.DictWriter(output, fieldnames=header)
    w.writeheader()
    from datetime import datetime as _dt
    def fmt(dt):
        return dt.isoformat() if isinstance(dt, _dt) else (dt or "")
    for r in rows:
        u = user_map.get(r.user_id)
        a = admin_map.get(r.admin_id)
        t = test_map.get(r.test_id)
        w.writerow({
            "user_email": getattr(u, 'email', ''),
            "candidate_id": getattr(u, 'candidate_id', ''),
            "test_type": r.test_type,
            "test_code": getattr(t, 'test_code', ''),
            "test_name": getattr(t, 'name', ''),
            "status": r.status,
            "due_date": fmt(r.due_date),
            "assigned_at": fmt(r.assigned_at),
            "started_at": fmt(r.started_at),
            "completed_at": fmt(r.completed_at),
            "admin_email": getattr(a, 'email', ''),
            "tenant_id": r.tenant_id or ''
        })
    return {"csv": output.getvalue(), "count": len(rows)}

# =====================================================
# USER-FACING ENDPOINTS
# =====================================================

@router.get("/my-tests", response_model=List[TestAssignmentResponse])
async def get_my_assigned_tests(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get tests assigned to the current user"""
    if current_user.role != "candidate":
        raise HTTPException(status_code=403, detail="Only candidates can view assigned tests")
    
    assignments = db.query(TestAssignment).filter(
    TestAssignment.user_id == current_user.id
    ).all()
    
    return assignments

@router.post("/my-tests/{assignment_id}/start")
async def start_assigned_test(
    assignment_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Mark a test assignment as started"""
    if current_user.role != "candidate":
        raise HTTPException(status_code=403, detail="Only candidates can start tests")
    
    assignment = db.query(TestAssignment).filter(
    TestAssignment.id == assignment_id,
    TestAssignment.user_id == current_user.id,
        TestAssignment.status == "assigned"
    ).first()
    
    if not assignment:
        raise HTTPException(status_code=404, detail="Test assignment not found or already started")
    
    assignment.status = "started"
    assignment.started_at = datetime.utcnow()
    assignment.updated_at = datetime.utcnow()
    
    db.commit()
    db.refresh(assignment)
    
    return {"message": "Test started successfully", "assignment": assignment}