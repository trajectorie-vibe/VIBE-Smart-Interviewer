"""
Database configuration and connection management
Supports SQLite (development) and PostgreSQL/MySQL (production)
"""

import os
from sqlalchemy import create_engine, event
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import StaticPool
from typing import Generator, Optional
import logging

logger = logging.getLogger(__name__)

def _normalize_database_url(url: str) -> str:
    """Ensure database URLs include explicit drivers when required."""
    if not url:
        return url
    if url.startswith("mysql://"):
        # Default to PyMySQL driver if none specified
        return url.replace("mysql://", "mysql+pymysql://", 1)
    return url


# Database configuration
RAW_DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./trajectorie.db")
DATABASE_URL = _normalize_database_url(RAW_DATABASE_URL)
TESTING = os.getenv("TESTING", "false").lower() == "true"
SQL_ECHO = os.getenv("SQL_ECHO", "false").lower() == "true"

def _create_engine(url: str):
    if url.startswith("postgresql"):
        return create_engine(
            url,
            pool_size=int(os.getenv("SQL_POOL_SIZE", "20")),
            max_overflow=int(os.getenv("SQL_MAX_OVERFLOW", "0")),
            pool_pre_ping=True,
            pool_recycle=int(os.getenv("SQL_POOL_RECYCLE", "300")),
            echo=SQL_ECHO,
        )
    if url.startswith("mysql"):
        return create_engine(
            url,
            pool_size=int(os.getenv("SQL_POOL_SIZE", "10")),
            max_overflow=int(os.getenv("SQL_MAX_OVERFLOW", "10")),
            pool_pre_ping=True,
            pool_recycle=int(os.getenv("SQL_POOL_RECYCLE", "280")),
            echo=SQL_ECHO,
        )
    if url.startswith("sqlite"):
        engine = create_engine(
            url,
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
            echo=SQL_ECHO,
        )

        # Enable foreign keys for SQLite
        @event.listens_for(engine, "connect")
        def set_sqlite_pragma(dbapi_connection, connection_record):
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

        return engine

    raise ValueError(f"Unsupported database URL: {url}")

engine = _create_engine(DATABASE_URL)
DATABASE_DIALECT = engine.dialect.name

# Session configuration
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Database dependency for FastAPI
def get_db() -> Generator[Session, None, None]:
    """Get database session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Test database configuration
def get_test_db():
    """Get test database session"""
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    
    test_engine = create_engine(
        "sqlite:///./test_trajectorie.db",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool
    )
    
    # Enable foreign keys for test SQLite
    @event.listens_for(test_engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()
    
    TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)
    
    # Create tables
    from app.models import Base
    Base.metadata.create_all(bind=test_engine)
    
    db = TestSessionLocal()
    try:
        yield db
    finally:
        db.close()

# Database initialization
def init_database():
    """Initialize database with tables and default data"""
    from app.models import Base, User, Tenant
    import uuid
    from sqlalchemy import inspect
    
    logger.info("Initializing database...")
    
    # Create all tables (idempotent)
    Base.metadata.create_all(bind=engine)

    # Run lightweight, idempotent migrations for SQLite (adds missing columns like users.age/gender)
    try:
        if engine.dialect.name == "sqlite":
            from app.db_migrations import run_migrations as run_sqlite_migrations
            logger.info("Running lightweight SQLite migrations...")
            run_sqlite_migrations(engine)
            logger.info("SQLite migrations completed")
    except Exception as mig_err:
        logger.error(f"Error running lightweight migrations: {mig_err}")

    # Lightweight schema verification (additive safety net, not a full migration system)
    try:
        inspector = inspect(engine)
        required_tables = [t.name for t in Base.metadata.sorted_tables]
        missing = [t for t in required_tables if t not in inspector.get_table_names()]
        if missing:
            logger.warning(f"Missing tables detected after create_all: {missing}; attempting creation again")
            Base.metadata.create_all(bind=engine, tables=[t for t in Base.metadata.sorted_tables if t.name in missing])
    except Exception as schema_err:
        logger.error(f"Schema verification failed: {schema_err}")
    
    # Create default data
    db = SessionLocal()
    try:
        # Check if system tenant exists
        system_tenant = db.query(Tenant).filter(Tenant.name == "System").first()
        if not system_tenant:
            logger.info("Creating system tenant...")
            system_tenant = Tenant(
                id="00000000-0000-0000-0000-000000000001",
                name="System",
                domain="system.trajectorie.com"
            )
            db.add(system_tenant)
            db.commit()
            db.refresh(system_tenant)
        
        # Check if superadmin user exists
        superadmin = db.query(User).filter(User.email == "superadmin@gmail.com").first()
        if not superadmin:
            logger.info("Creating superadmin user...")
            from app.auth import get_password_hash
            superadmin = User(
                id="00000000-0000-0000-0000-000000000002",
                email="superadmin@gmail.com",
                password_hash=get_password_hash("superadmin123"),
                candidate_name="Super Administrator",
                candidate_id="SUPERADMIN001",
                client_name="System",
                role="superadmin",
                tenant_id=system_tenant.id
            )
            db.add(superadmin)
            db.commit()
            logger.info("Superadmin user created successfully")
        
        # Check if admin user exists
        admin = db.query(User).filter(User.email == "admin@gmail.com").first()
        if not admin:
            logger.info("Creating admin user...")
            from app.auth import get_password_hash
            admin = User(
                email="admin@gmail.com",
                password_hash=get_password_hash("admin123"),
                candidate_name="Admin User",
                candidate_id="ADMIN001",
                client_name="System",
                role="admin",
                tenant_id=system_tenant.id
            )
            db.add(admin)
            db.commit()
            logger.info("Admin user created successfully")
        
        logger.info("Database initialization completed")
        
    except Exception as e:
        logger.error(f"Error initializing database: {e}")
        db.rollback()
        raise
    finally:
        db.close()

# Database health check
def check_database_health() -> bool:
    """Check if database is accessible"""
    try:
        from sqlalchemy import text
        db = SessionLocal()
        # Try a simple query
        db.execute(text("SELECT 1"))
        db.close()
        return True
    except Exception as e:
        logger.error(f"Database health check failed: {e}")
        return False

# Database migration utilities
def run_migrations():
    """Run database migrations (placeholder for Alembic)"""
    # In production, you would use Alembic for migrations.
    # For now, ensure tables exist and run lightweight SQLite migrations.
    from app.models import Base
    Base.metadata.create_all(bind=engine)
    if engine.dialect.name == "sqlite":
        try:
            from app.db_migrations import run_migrations as run_sqlite_migrations
            run_sqlite_migrations(engine)
            logger.info("Lightweight SQLite migrations executed successfully")
        except Exception as mig_err:
            logger.error(f"Error during lightweight SQLite migrations: {mig_err}")
    else:
        logger.info("Non-SQLite database detected; relying on create_all (or Alembic in prod)")

# Backup utilities
def backup_database(backup_path: Optional[str] = None):
    """Backup database (SQLite only)"""
    if not DATABASE_URL.startswith("sqlite"):
        raise ValueError("Backup currently only supported for SQLite")
    
    import shutil
    from datetime import datetime
    
    if not backup_path:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_path = f"backup_trajectorie_{timestamp}.db"
    
    db_path = DATABASE_URL.replace("sqlite:///", "")
    shutil.copy2(db_path, backup_path)
    logger.info(f"Database backed up to: {backup_path}")
    return backup_path

# Environment-specific configurations
class DatabaseConfig:
    """Database configuration class"""
    
    def __init__(self):
        self.database_url = DATABASE_URL
        self.dialect = DATABASE_DIALECT
        self.is_sqlite = self.dialect == "sqlite"
        self.is_postgresql = self.dialect == "postgresql"
        self.is_mysql = self.dialect in {"mysql", "mariadb"}
        self.testing = TESTING
    
    def get_connection_info(self):
        """Get connection information"""
        if self.is_sqlite:
            database_type = "sqlite"
        elif self.is_postgresql:
            database_type = "postgresql"
        elif self.is_mysql:
            database_type = "mysql"
        else:
            database_type = DATABASE_DIALECT
        return {
            "database_url": self.database_url,
            "database_type": database_type,
            "testing_mode": self.testing
        }

# Singleton instance
db_config = DatabaseConfig()

# Logging configuration for database operations
logging.getLogger('sqlalchemy.engine').setLevel(
    logging.INFO if os.getenv("SQL_ECHO", "false").lower() == "true" else logging.WARNING
)