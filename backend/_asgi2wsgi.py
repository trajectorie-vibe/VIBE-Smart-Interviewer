"""Tiny ASGI -> WSGI adapter vendored into this repo.

This is a small, synchronous adapter intended for simple request handling
on PythonAnywhere where installing `asgi2wsgi` may fail. It is intentionally
minimal: it runs the ASGI app in a fresh event loop per request and
collects the full body before invoking the ASGI app. Streaming and
advanced features are not supported, but it works well for typical REST
and JSON APIs.
"""
from typing import Callable, Iterable
import asyncio

class ASGI2WSGI:
    def __init__(self, asgi_app: Callable):
        self.asgi_app = asgi_app

    def __call__(self, environ: dict, start_response: Callable) -> Iterable[bytes]:
        """WSGI callable that runs the ASGI app and returns the response body."""
        # Build ASGI scope
        body = environ.get('wsgi.input').read() if environ.get('wsgi.input') else b''

        scope = {
            'type': 'http',
            'asgi': {'version': '3.0'},
            'http_version': environ.get('SERVER_PROTOCOL', 'HTTP/1.1').split('/')[-1],
            'method': environ.get('REQUEST_METHOD', 'GET'),
            'scheme': environ.get('wsgi.url_scheme', 'http'),
            'path': environ.get('PATH_INFO', '/'),
            'query_string': environ.get('QUERY_STRING', '').encode('utf-8'),
            'headers': [
                (k[5:].replace('_', '-').lower().encode('latin-1'), v.encode('latin-1'))
                for k, v in environ.items() if k.startswith('HTTP_')
            ],
            'server': (
                environ.get('SERVER_NAME', 'localhost'),
                int(environ.get('SERVER_PORT') or 80),
            ),
            'client': (environ.get('REMOTE_ADDR'), int(environ.get('REMOTE_PORT') or 0)),
        }

        response_status = 500
        response_headers = []
        body_chunks = []

        async def receive():
            return {'type': 'http.request', 'body': body, 'more_body': False}

        async def send(message):
            nonlocal response_status, response_headers
            if message['type'] == 'http.response.start':
                response_status = message.get('status', 500)
                response_headers = [(k.decode() if isinstance(k, bytes) else k,
                                     v.decode() if isinstance(v, bytes) else v)
                                    for k, v in message.get('headers', [])]
            elif message['type'] == 'http.response.body':
                b = message.get('body', b'') or b''
                body_chunks.append(b)

        # Run the ASGI app in a fresh event loop to avoid interfering with host
        loop = asyncio.new_event_loop()
        try:
            asyncio.set_event_loop(loop)
            loop.run_until_complete(self.asgi_app(scope, receive, send))
        finally:
            try:
                loop.close()
            except Exception:
                pass

        status_text = f"{response_status} OK"
        start_response(status_text, response_headers)
        return [b''.join(body_chunks)]
