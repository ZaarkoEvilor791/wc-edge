from importlib import resources

import psycopg

from .config import require_database_url


def connect() -> psycopg.Connection:
    return psycopg.connect(
        require_database_url(),
        options="-c search_path=wc,public",
    )


def init_schema(conn: psycopg.Connection) -> None:
    sql = resources.files(__package__).joinpath("wc_schema.sql").read_text(encoding="utf-8")
    with conn.cursor() as cur:
        for stmt in [s.strip() for s in sql.split(";") if s.strip()]:
            cur.execute(stmt)
    conn.commit()
