"""
ID/code generation utilities for human-readable codes like C1, T1, Q1, etc.
We keep UUIDs as primary keys in DB for robustness, and attach unique codes per entity
for display/export and CSV import duplicate checks.

Usage patterns:
- get_next_code(db, table_name, code_column, prefix) -> str

Notes:
- Codes are strictly incremental per prefix and numeric suffix (prefix + integer).
- We parse existing max numeric part and add 1.
- Codes are unique per table/column; database should also enforce a UNIQUE constraint
  on the code column where applicable.
"""
from sqlalchemy.orm import Session
from sqlalchemy import text

def _extract_max_suffix(rows, prefix: str) -> int:
    max_n = 0
    plen = len(prefix)
    for (code,) in rows:
        if not code or not isinstance(code, str):
            continue
        if not code.startswith(prefix):
            continue
        num = code[plen:]
        try:
            n = int(num)
            if n > max_n:
                max_n = n
        except Exception:
            continue
    return max_n

def get_next_code(db: Session, table_name: str, code_column: str, prefix: str) -> str:
    """Return next available code for the table by scanning existing codes.

    Example: get_next_code(db, 'questions', 'question_code', 'Q') -> 'Q123'
    """
    # SQLite compatible SQL; we select the top 200 codes to avoid scanning entire table in huge datasets.
    # If table is small, this still suffices.
    sql = text(f"SELECT {code_column} FROM {table_name} WHERE {code_column} IS NOT NULL ORDER BY {code_column} DESC LIMIT 200")
    rows = db.execute(sql).fetchall()
    max_n = _extract_max_suffix(rows, prefix)
    return f"{prefix}{max_n + 1}"
