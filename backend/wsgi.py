"""
WSGI Configuration for PythonAnywhere
This file wraps the FastAPI (ASGI) application for WSGI deployment.
"""

import sys
import os
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ============================================================================
# IMPORTANT: Update this with your PythonAnywhere username
# ============================================================================
PYTHONANYWHERE_USERNAME = "cogniviewandcognify"
# ============================================================================

# Add your project directory to the sys.path
project_home = f'/home/{PYTHONANYWHERE_USERNAME}/VIBE-Smart-Interviewer/backend'
if project_home not in sys.path:
    sys.path.insert(0, project_home)

# Change to project directory
os.chdir(project_home)
logger.info(f"Working directory: {os.getcwd()}")

# Load environment variables from .env file
try:
    from dotenv import load_dotenv
    env_file = os.path.join(project_home, '.env')
    if os.path.exists(env_file):
        load_dotenv(env_file)
        logger.info(f"✅ Loaded environment from: {env_file}")
    else:
        logger.warning(f"⚠️  No .env file found at: {env_file}")
except Exception as e:
    logger.error(f"❌ Error loading environment: {e}")

# Import and wrap the FastAPI application for WSGI
try:
    # Import the ASGI-to-WSGI adapter
    from a2wsgi import ASGIMiddleware
    
    # Import the FastAPI app
    from main import app
    
    # Wrap it for WSGI compatibility
    application = ASGIMiddleware(app)
    
    logger.info("✅ Successfully wrapped FastAPI application for WSGI")
    logger.info(f"Database URL configured: {'Yes' if os.getenv('DATABASE_URL') else 'No'}")
    logger.info(f"CORS origins: {os.getenv('CORS_ORIGINS', 'Not set')}")
    
except ImportError as e:
    logger.error(f"❌ Import error: {e}")
    logger.error("Make sure 'a2wsgi' is installed: pip install a2wsgi")
    raise
except Exception as e:
    logger.error(f"❌ Error creating WSGI application: {e}")
    raise
