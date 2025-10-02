"""
Users API endpoints
Provides CRUD operations for users, including updating company (tenant) and role fields.
"""
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.orm import Session
from typing import List
import uuid

from app.database import get_db
from app.auth import get_current_active_user, require_admin, require_superadmin
from app.models import User, Tenant, UserUpdate, UserResponse, UserCreate
from app.auth import get_password_hash
from app.utils.ids import get_next_code

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/", response_model=List[UserResponse])
async def list_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """List users. Admins see users in their tenant; superadmins see all."""
    q = db.query(User)
    if current_user.role != 'superadmin':
        q = q.filter(User.tenant_id == current_user.tenant_id)
    users = q.order_by(User.created_at.desc()).limit(500).all()
    return users


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if current_user.role != 'superadmin' and user.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    return user


@router.put("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: str,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Update a user. Allows changing company (tenant), role, and profile fields.

    Access rules:
    - Superadmin can update any user and move them across tenants.
    - Admin can update users only within their tenant; cannot move users to another tenant.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Admins are limited to their tenant users
    if current_user.role != 'superadmin' and user.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    update_data = payload.dict(exclude_unset=True)

    # If tenant change is requested, validate and enforce permissions
    if 'tenant_id' in update_data and update_data['tenant_id'] is not None:
        new_tenant_id = str(update_data['tenant_id'])
        tenant = db.query(Tenant).filter(Tenant.id == new_tenant_id).first()
        if not tenant:
            raise HTTPException(status_code=404, detail="Target tenant not found")
        if current_user.role != 'superadmin':
            # Admins cannot move users to a different tenant
            if str(user.tenant_id) != new_tenant_id:
                raise HTTPException(status_code=403, detail="Admins cannot change user company")
        user.tenant_id = new_tenant_id

    # Update other allowed fields
    for field in (
        'email', 'candidate_name', 'candidate_id', 'client_name', 'role',
        'preferred_language', 'language_code', 'is_active', 'age', 'gender', 'phone_number'
    ):
        if field in update_data and update_data[field] is not None:
            setattr(user, field, update_data[field])

    db.commit()
    db.refresh(user)
    return user


@router.post("/", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Create a new user in the current tenant (admins) or any tenant (superadmin)."""
    # If admin, force tenant to their own unless explicitly set and matches
    tenant_id = str(payload.tenant_id) if payload.tenant_id else (str(current_user.tenant_id) if current_user.role != 'superadmin' else None)
    if tenant_id:
        tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
        if not tenant:
            raise HTTPException(status_code=404, detail="Tenant not found")
    # Check email uniqueness
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already in use")
    
    # Handle unique constraint for (candidate_id, client_name)
    # For candidates: enforce uniqueness, reject duplicates
    # For admins/superadmins: allow by making candidate_id unique if needed
    candidate_id = payload.candidate_id
    if payload.role in ('admin', 'superadmin'):
        # Check if combination exists
        conflict = db.query(User).filter(
            User.candidate_id == candidate_id,
            User.client_name == payload.client_name
        ).first()
        if conflict:
            # Make candidate_id unique by appending user code or timestamp
            import time
            candidate_id = f"{candidate_id}_{int(time.time())}"
    else:
        # For candidates, enforce strict uniqueness
        existing_candidate = db.query(User).filter(
            User.candidate_id == candidate_id,
            User.client_name == payload.client_name
        ).first()
        if existing_candidate:
            raise HTTPException(status_code=400, detail=f"Candidate ID '{candidate_id}' already exists for client '{payload.client_name}'")
    
    user = User(
        email=payload.email,
        password_hash=get_password_hash(payload.password),
        candidate_name=payload.candidate_name,
        candidate_id=candidate_id,
        client_name=payload.client_name,
        role=payload.role,
        preferred_language=payload.preferred_language,
        language_code=payload.language_code,
        phone_number=payload.phone_number,
        age=payload.age,
        gender=payload.gender,
        tenant_id=tenant_id
    )
    # Assign a human-friendly user code like C1, C2 ...
    try:
        user.user_code = get_next_code(db, 'users', 'user_code', 'C')
    except Exception:
        # Non-fatal if code generation fails
        pass
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.delete("/{user_id}")
async def delete_user(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if current_user.role != 'superadmin' and user.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    # Proactively remove dependent assignments to avoid ORM trying to NULL FKs
    # Covers both roles: user as candidate and user as admin
    try:
        from app.models import UserAssignment, TestAssignment
        # Delete user_assignments where the user is either the candidate or the admin
        db.query(UserAssignment).filter((UserAssignment.user_id == user.id) | (UserAssignment.admin_id == user.id)).delete(synchronize_session=False)
        # Delete test_assignments created by or assigned to the user
        db.query(TestAssignment).filter((TestAssignment.user_id == user.id) | (TestAssignment.admin_id == user.id)).delete(synchronize_session=False)
        db.commit()
    except Exception:
        db.rollback()
        # Continue with delete; DB-level CASCADE may already handle it
    db.delete(user)
    db.commit()
    return {"message": "User deleted"}


@router.get("/by-email/{email}", response_model=UserResponse)
async def get_user_by_email(
    email: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if current_user.role != 'superadmin' and user.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    return user


# ==============================
# CSV IMPORT (Admin/Superadmin)
# ==============================

@router.post("/import-csv")
async def import_users_csv(
    file: UploadFile = File(..., description="CSV with headers: email,password,candidate_name,candidate_id,client_name,role; ignore empty rows; all required"),
    tenant_id: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Bulk import users from CSV.

    Rules:
    - Ignore completely empty rows.
    - All required fields must be non-empty: email,password,candidate_name,candidate_id,client_name,role
    - Roles allowed: candidate (always). Admin creation allowed only for superadmin; admins are coerced to candidate.
    - Duplicates by email are skipped. Duplicate candidate_id+client_name are skipped.
    - Tenant assignment:
      * Admin: forced to their tenant; query tenant_id ignored.
      * Superadmin: must provide tenant_id (query param), otherwise 400.
    """
    import csv, io

    # Determine target tenant
    target_tenant_id: str | None
    if current_user.role == 'superadmin':
        if not tenant_id:
            raise HTTPException(status_code=400, detail="tenant_id is required for superadmin CSV import")
        # Validate tenant exists
        t = db.query(Tenant).filter(Tenant.id == str(tenant_id)).first()
        if not t:
            raise HTTPException(status_code=404, detail="Tenant not found")
        target_tenant_id = str(tenant_id)
    else:
        target_tenant_id = str(current_user.tenant_id) if current_user.tenant_id else None
        if not target_tenant_id:
            raise HTTPException(status_code=400, detail="Current admin has no tenant configured")

    content = await file.read()
    text = content.decode("utf-8", errors="ignore")
    reader = csv.DictReader(io.StringIO(text))
    required = ["email", "password", "candidate_name", "candidate_id", "client_name", "role"]

    created: list[UserResponse] = []
    skipped: list[dict] = []

    for row in reader:
        # Skip completely empty rows
        if not any((v or "").strip() for v in row.values()):
            continue

        # Validate required fields
        missing = [f for f in required if not (row.get(f) or "").strip()]
        if missing:
            skipped.append({"row": row, "reason": f"missing: {', '.join(missing)}"})
            continue

        email = row["email"].strip()
        password = row["password"].strip()
        candidate_name = row["candidate_name"].strip()
        candidate_id = row["candidate_id"].strip()
        client_name = row["client_name"].strip()
        role = row["role"].strip().lower()

        # Enforce role policy
        if current_user.role != 'superadmin':
            role = 'candidate'
        else:
            if role not in ('candidate', 'admin'):
                skipped.append({"row": row, "reason": "invalid role (allowed: candidate, admin)"})
                continue

        # Duplicates
        if db.query(User).filter(User.email == email).first():
            skipped.append({"row": row, "reason": "duplicate email"})
            continue
        from sqlalchemy import and_
        exists_cid = db.query(User).filter(and_(User.candidate_id == candidate_id, User.client_name == client_name)).first()
        if exists_cid:
            skipped.append({"row": row, "reason": "duplicate candidate_id for client"})
            continue

        # Create user
        u = User(
            email=email,
            password_hash=get_password_hash(password),
            candidate_name=candidate_name,
            candidate_id=candidate_id,
            client_name=client_name,
            role=role,
            preferred_language='en',
            language_code='en',
            tenant_id=target_tenant_id,
        )
        try:
            u.user_code = get_next_code(db, 'users', 'user_code', 'C')
        except Exception:
            pass
        db.add(u)
        try:
            db.commit()
            db.refresh(u)
            created.append(UserResponse.from_orm(u))
        except Exception as e:
            db.rollback()
            skipped.append({"row": row, "reason": f"db error: {getattr(e, 'detail', str(e))}"})

    return {"created": len(created), "skipped": skipped}
