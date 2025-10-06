"""Simple WSGI entrypoint for PythonAnywhere

This file intentionally keeps things minimal. Upload it to
`/home/<yourusername>/VIBE-Smart-Interviewer/backend/wsgi.py` on PythonAnywhere
and update the `project_home` / `PYTHONANYWHERE_USERNAME` below.

It wraps the FastAPI ASGI `app` into a WSGI callable using `asgi2wsgi`.
`asgi2wsgi` is small and works well on PythonAnywhere. Alternatively you
can use `asgiref.wsgi.WsgiToAsgi` depending on your setup, but
`asgi2wsgi` is straightforward for this use-case.
"""

import sys
import os
import logging

# Basic logging to help debugging when PythonAnywhere loads the WSGI file
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ====== EDIT THIS: set your PythonAnywhere username ======
PYTHONANYWHERE_USERNAME = "yourusername"
# =======================================================

project_home = f"/home/{PYTHONANYWHERE_USERNAME}/VIBE-Smart-Interviewer/backend"
if project_home not in sys.path:
    sys.path.insert(0, project_home)

try:
    os.chdir(project_home)
except Exception:
    # ignore chdir errors; PHP/console may run elsewhere
    pass

# Load environment variables if python-dotenv is available
try:
    from dotenv import load_dotenv
    env_path = os.path.join(project_home, ".env")
    if os.path.exists(env_path):
        load_dotenv(env_path)
        logger.info(f"Loaded env from {env_path}")
    else:
        logger.info("No .env file found; relying on PA environment variables")
except Exception:
    logger.info("python-dotenv not installed or failed to load; skipping .env load")

# Create a WSGI application by wrapping the FastAPI app
try:
    # Prefer asgi2wsgi if available (small dependency)
    # Prefer an installed `asgi2wsgi` package, but fall back to the
    # vendored `_asgi2wsgi.ASGI2WSGI` adapter included in this repo so
    # you don't have to pip-install an external package on PythonAnywhere.
    try:
        from asgi2wsgi import ASGI2WSGI
        asgi_wrapper = ASGI2WSGI
    except Exception:
        try:
            from _asgi2wsgi import ASGI2WSGI as ASGI2WSGI_local
            asgi_wrapper = ASGI2WSGI_local
        except Exception:
            asgi_wrapper = None

    # Import the FastAPI app
    from main import app

    if asgi_wrapper is not None:
        application = asgi_wrapper(app)
        logger.info("WSGI application created using asgi2wsgi")
    else:
        # Fallback: use asgiref's WsgiToAsgi if available (less ideal)
        try:
            from asgiref.wsgi import WsgiToAsgi
            # WsgiToAsgi converts WSGI to ASGI; we need the opposite, so use
            # a tiny compatibility wrapper: expose the ASGI app directly via
            # a minimal synchronous adapter. This is only a last-resort fallback
            # and may not support streaming.
            def application(environ, start_response):
                # Lazy import to keep startup failures visible
                import asyncio
                body = environ['wsgi.input'].read()
                scope = {
                    'type': 'http',
                    'asgi': {'version': '3.0'},
                    'http_version': environ.get('SERVER_PROTOCOL', 'HTTP/1.1').split('/')[-1],
                    'method': environ['REQUEST_METHOD'],
                    'scheme': environ.get('wsgi.url_scheme', 'http'),
                    'path': environ.get('PATH_INFO', '/'),
                    'query_string': environ.get('QUERY_STRING', '').encode(),
                    'headers': [],
                    'server': (environ.get('SERVER_NAME'), int(environ.get('SERVER_PORT', 80))),
                }

                # Simple run of ASGI app
                async def _run_app():
                    messages = []

                    async def receive():
                        return {'type': 'http.request', 'body': body, 'more_body': False}

                    async def send(msg):
                        messages.append(msg)

                    await app(scope, receive, send)
                    return messages

                loop = asyncio.new_event_loop()
                try:
                    messages = loop.run_until_complete(_run_app())
                finally:
                    loop.close()

                status = "500 Internal Server Error"
                headers = [('Content-Type', 'text/plain')]
                body_out = b""
                for m in messages:
                    if m.get('type') == 'http.response.start':
                        status = f"{m.get('status', 500)} OK"
                        headers = [(k.decode() if isinstance(k, bytes) else k, v.decode() if isinstance(v, bytes) else v) for k, v in m.get('headers', [])]
                    elif m.get('type') == 'http.response.body':
                        body_out += m.get('body', b'') or b''

                start_response(status, headers)
                return [body_out]

        except Exception:
            # If everything fails, raise to make the error visible in PA logs
            raise

    logger.info("WSGI entrypoint configured")

except Exception as exc:
    # Ensure PythonAnywhere shows the import error in its error log
    logger.exception("Failed to create WSGI application: %s", exc)
    raise
