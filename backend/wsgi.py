"""
WSGI Configuration for PythonAnywhere
This file is used to configure the WSGI application for PythonAnywhere deployment.
"""

import sys
import os
from pathlib import Path

# ============================================================================
# IMPORTANT: Update this with your PythonAnywhere username
# ============================================================================
PYTHONANYWHERE_USERNAME = "cogniviewandcognify"  # CHANGE THIS!
# ============================================================================

# Add your project directory to the sys.path
project_home = f'/home/{PYTHONANYWHERE_USERNAME}/VIBE-Smart-Interviewer/backend'
if project_home not in sys.path:
    sys.path.insert(0, project_home)

# Change to project directory
os.chdir(project_home)

# Load environment variables from .env file
try:
    from dotenv import load_dotenv
    env_path = Path(project_home) / '.env'
    if env_path.exists():
        load_dotenv(env_path)
        print(f"✅ Loaded environment from: {env_path}")
    else:
        print(f"⚠️  No .env file found at: {env_path}")
except Exception as e:
    print(f"❌ Error loading environment: {e}")

# Import the FastAPI application and wrap for WSGI
try:
    from a2wsgi import ASGIMiddleware
    from main import app
    application = ASGIMiddleware(app)
    print("✅ Successfully wrapped FastAPI application for WSGI")
except Exception as e:
    print(f"❌ Error importing application: {e}")
    raise

# For debugging - print environment info (comment out in production)
if os.getenv('DEBUG_WSGI'):
    print(f"Python version: {sys.version}")
    print(f"Python path: {sys.path}")
    print(f"Current directory: {os.getcwd()}")
    print(f"DATABASE_URL set: {'Yes' if os.getenv('DATABASE_URL') else 'No'}")
    print(f"FRONTEND_URL: {os.getenv('FRONTEND_URL', 'Not set')}")
