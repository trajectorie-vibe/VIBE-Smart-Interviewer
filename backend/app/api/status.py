"""
Status Events API
- Superadmin: sees all events, filterable by tenant
- Admin: sees their tenant's events
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from app.database import get_db
from app.auth import get_current_active_user, require_superadmin, UserContext
from app.models import User, StatusEvent

router = APIRouter(prefix="/status", tags=["status"]) 

@router.get("")
async def list_events(
    tenant_id: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    with UserContext(db, current_user):
        q = db.query(StatusEvent)
        if current_user.role == 'superadmin':
            if tenant_id:
                q = q.filter(StatusEvent.tenant_id == tenant_id)
        else:
            q = q.filter(StatusEvent.tenant_id == current_user.tenant_id)
        items = q.order_by(StatusEvent.created_at.desc()).limit(limit).all()
    return [
        {
            "id": e.id,
            "event_type": e.event_type,
            "message": e.message,
            "tenant_id": e.tenant_id,
            "actor_user_id": e.actor_user_id,
            "payload": e.payload,
            "created_at": e.created_at,
        }
        for e in items
    ]
