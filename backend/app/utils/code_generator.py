"""Deprecated placeholder.

The new architecture uses ``app.core.id_generator`` for all sequential code generation.
This module is kept temporarily to avoid import errors while legacy references are being
refactored. Do not add new dependencies here.
"""

from __future__ import annotations

def __getattr__(name: str):  # pragma: no cover - compatibility shim
    raise AttributeError(
        "app.utils.code_generator is deprecated. Use app.core.id_generator instead."
    )
