"""
API Router initialization
Combines all API endpoints
"""

from fastapi import APIRouter

from app.api import submissions, configurations, tenants, users, question_bank, structured_tests, status, competencies, reports, assignments, tests, statistics, test_attempts

# Create main API router
api_router = APIRouter(prefix="/api/v1")

# Include all sub-routers
api_router.include_router(submissions.router)
api_router.include_router(configurations.router)
api_router.include_router(tenants.router)
api_router.include_router(users.router)
api_router.include_router(question_bank.router)
api_router.include_router(structured_tests.router)
api_router.include_router(status.router)
api_router.include_router(competencies.router)
api_router.include_router(reports.router)
api_router.include_router(assignments.router)
api_router.include_router(tests.router)
api_router.include_router(statistics.router)
api_router.include_router(test_attempts.router)