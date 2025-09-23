#!/usr/bin/env python3
"""
Ensure superadmin and admin accounts exist with known credentials.
Creates or updates:
 - superadmin@gmail.com (role=superadmin, password=superadmin123)
 - admin@gmial.com (role=admin, password=admin123)

Notes:
 - Anchored to the same DB and models as the FastAPI app.
 - Uses a different candidate_id for the gmial admin to avoid unique constraint
   conflicts on (candidate_id, client_name) with the seeded admin@gmail.com.
"""

from sqlalchemy.orm import Session
from sqlalchemy import func
from app.database import get_db, init_database
from app.models import User, Tenant
from app.auth import get_password_hash


def ensure_user(db: Session, *, email: str, role: str, password: str, candidate_name: str, candidate_id: str, client_name: str, tenant_id: str):
    email_norm = email.strip().lower()
    user = db.query(User).filter(func.lower(User.email) == email_norm).first()
    if user:
        updated = False
        if user.role != role:
            user.role = role
            updated = True
        if not user.is_active:
            user.is_active = True
            updated = True
        # Always reset password to the provided one for recovery
        new_hash = get_password_hash(password)
        if user.password_hash != new_hash:
            user.password_hash = new_hash
            updated = True
        if str(user.tenant_id) != str(tenant_id):
            user.tenant_id = tenant_id
            updated = True
        if updated:
            db.commit()
            db.refresh(user)
        print(f"✅ Ensured user exists and active: {email_norm} ({role})")
        return user

    # Create new user (ensure candidate_id is unique per client)
    user = User(
        email=email_norm,
        password_hash=get_password_hash(password),
        candidate_name=candidate_name,
        candidate_id=candidate_id,
        client_name=client_name,
        role=role,
        tenant_id=tenant_id,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    print(f"✅ Created user: {email_norm} ({role})")
    return user


def main():
    # Ensure tables exist and defaults are initialized
    init_database()
    db_gen = get_db()
    db = next(db_gen)
    try:
        # Ensure System tenant
        system = db.query(Tenant).filter(Tenant.name == "System").first()
        if not system:
            system = Tenant(name="System", domain="system.trajectorie.com")
            db.add(system)
            db.commit()
            db.refresh(system)
            print("ℹ️ Created System tenant")

        # Superadmin
        ensure_user(
            db,
            email="superadmin@gmail.com",
            role="superadmin",
            password="superadmin123",
            candidate_name="Super Administrator",
            candidate_id="SUPERADMIN001",
            client_name="System",
            tenant_id=system.id,
        )

        # Admin at gmial.com (distinct candidate_id to avoid unique constraint clashes)
        ensure_user(
            db,
            email="admin@gmial.com",
            role="admin",
            password="admin123",
            candidate_name="Admin User",
            candidate_id="ADMIN002",
            client_name="System",
            tenant_id=system.id,
        )

        print("\n✅ Admin accounts ensured successfully.")
        print("   - superadmin@gmail.com / superadmin123")
        print("   - admin@gmial.com / admin123")
    finally:
        db.close()


if __name__ == "__main__":
    main()
