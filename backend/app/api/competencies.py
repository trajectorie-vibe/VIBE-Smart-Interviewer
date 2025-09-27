"""
Competencies API endpoints for managing competency dictionaries
"""

from fastapi import APIRouter, HTTPException, Depends, status, Query, UploadFile, File
from sqlalchemy.orm import Session
from typing import List, Optional
import csv, io

from app.database import get_db
from sqlalchemy import func
from app.auth import get_current_active_user, require_admin, require_superadmin, UserContext
from app.models import (
    CompetencyDictionary, CompetencyCreate, CompetencyUpdate, CompetencyResponse,
    User
)

router = APIRouter(prefix="/competencies", tags=["competencies"])


@router.post("", response_model=CompetencyResponse)
async def create_competency(
    data: CompetencyCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin)
):
    """Create a new competency (admin/superadmin)"""

    # Normalize code and ensure uniqueness within tenant (case-insensitive)
    normalized_code = (data.competency_code or "").strip()
    if not normalized_code:
        raise HTTPException(status_code=400, detail="competency_code is required")

    tenant_id = data.tenant_id or current_user.tenant_id
    existing = (
        db.query(CompetencyDictionary)
        .filter(
            CompetencyDictionary.tenant_id == tenant_id,
            func.lower(CompetencyDictionary.competency_code) == func.lower(normalized_code),
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="Competency code already exists")

    comp = CompetencyDictionary(
        tenant_id=tenant_id,
        competency_code=normalized_code,
        competency_name=data.competency_name,
        competency_description=data.competency_description,
        meta_competency=data.meta_competency,
        translations=data.translations,
        category=data.category,
        industry=data.industry,
        role_category=data.role_category,
        is_active=data.is_active,
    )

    with UserContext(db, current_user):
        db.add(comp)
        db.commit()
        db.refresh(comp)

    return comp


@router.get("", response_model=List[CompetencyResponse])
async def list_competencies(
    tenant_id: Optional[str] = None,
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """List competencies. Non-superadmin limited to their tenant"""
    with UserContext(db, current_user):
        query = db.query(CompetencyDictionary)
        if current_user.role != "superadmin":
            query = query.filter(CompetencyDictionary.tenant_id == current_user.tenant_id)
        elif tenant_id:
            # Superadmin can filter by tenant
            query = query.filter(CompetencyDictionary.tenant_id == tenant_id)
        if not include_inactive:
            query = query.filter(CompetencyDictionary.is_active == True)
        items = query.order_by(CompetencyDictionary.created_at.desc()).all()
    return items


@router.get("/{code}", response_model=CompetencyResponse)
async def get_competency(
    code: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    norm = code.strip()
    with UserContext(db, current_user):
        comp = db.query(CompetencyDictionary).filter(func.lower(CompetencyDictionary.competency_code) == func.lower(norm)).first()
    if not comp:
        raise HTTPException(status_code=404, detail="Competency not found")
    if current_user.role == "admin" and comp.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=403, detail="Access denied")
    return comp


@router.put("/{code}", response_model=CompetencyResponse)
async def update_competency(
    code: str,
    data: CompetencyUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin)
):
    norm = code.strip()
    with UserContext(db, current_user):
        comp = db.query(CompetencyDictionary).filter(func.lower(CompetencyDictionary.competency_code) == func.lower(norm)).first()
    if not comp:
        raise HTTPException(status_code=404, detail="Competency not found")
    if current_user.role == "admin" and comp.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=403, detail="Access denied")

    updates = data.dict(exclude_unset=True)
    for k, v in updates.items():
        setattr(comp, k, v)

    with UserContext(db, current_user):
        db.commit()
        db.refresh(comp)

    return comp


@router.delete("/{code}")
async def delete_competency(
    code: str,
    hard: bool = Query(False, description="If true, permanently delete. Otherwise soft-deactivate."),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin)
):
    norm = code.strip()
    with UserContext(db, current_user):
        comp = db.query(CompetencyDictionary).filter(func.lower(CompetencyDictionary.competency_code) == func.lower(norm)).first()
    if not comp:
        raise HTTPException(status_code=404, detail="Competency not found")
    if current_user.role == "admin" and comp.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=403, detail="Access denied")

    with UserContext(db, current_user):
        if hard:
            db.delete(comp)
            db.commit()
            return {"message": "Competency deleted"}
        else:
            comp.is_active = False
            db.commit()
            return {"message": "Competency deactivated"}

@router.get("/export")
async def export_competencies_csv(
    tenant_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    with UserContext(db, current_user):
        q = db.query(CompetencyDictionary)
        if current_user.role != 'superadmin':
            q = q.filter(CompetencyDictionary.tenant_id == current_user.tenant_id)
        elif tenant_id:
            q = q.filter(CompetencyDictionary.tenant_id == tenant_id)
        items = q.order_by(CompetencyDictionary.created_at.asc()).all()
    headers = ["competency_code","competency_name","competency_description","meta_competency","category","industry","role_category","is_active","tenant_id"]
    out = io.StringIO()
    w = csv.DictWriter(out, fieldnames=headers)
    w.writeheader()
    for c in items:
        w.writerow({
            "competency_code": c.competency_code,
            "competency_name": c.competency_name,
            "competency_description": c.competency_description or "",
            "meta_competency": c.meta_competency or "",
            "category": c.category or "",
            "industry": c.industry or "",
            "role_category": c.role_category or "",
            "is_active": int(bool(c.is_active)),
            "tenant_id": c.tenant_id or "",
        })
    return {"csv": out.getvalue()}

@router.post("/import")
async def import_competencies_csv(
    file: UploadFile = File(..., description="CSV file with headers: competency_code,competency_name,competency_description,meta_competency,category,industry,role_category"),
    tenant_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin)
):
    import csv, io
    content = await file.read()
    text = content.decode("utf-8", errors="ignore")
    reader = csv.DictReader(io.StringIO(text))
    required = ["competency_code","competency_name","competency_description"]
    created, skipped = 0, []
    with UserContext(db, current_user):
        for row in reader:
            if not any((v or "").strip() for v in row.values()):
                continue
            missing = [f for f in required if not (row.get(f) or "").strip()]
            if missing:
                skipped.append({"row": row, "reason": f"missing fields: {', '.join(missing)}"})
                continue
            code = row["competency_code"].strip()
            existing = db.query(CompetencyDictionary).filter(
                CompetencyDictionary.tenant_id == (tenant_id or current_user.tenant_id),
                func.lower(CompetencyDictionary.competency_code) == func.lower(code)
            ).first()
            if existing:
                skipped.append({"row": row, "reason": "duplicate code"})
                continue
            comp = CompetencyDictionary(
                tenant_id=(tenant_id or current_user.tenant_id),
                competency_code=code,
                competency_name=row["competency_name"].strip(),
                competency_description=row["competency_description"].strip(),
                meta_competency=(row.get("meta_competency") or "").strip() or None,
                translations=None,
                category=(row.get("category") or "").strip() or None,
                industry=(row.get("industry") or "").strip() or None,
                role_category=(row.get("role_category") or "").strip() or None,
                is_active=True
            )
            db.add(comp)
            created += 1
        db.commit()
    return {"created": created, "skipped": skipped}
