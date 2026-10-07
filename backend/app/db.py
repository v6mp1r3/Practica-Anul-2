"""One SQLAlchemy engine for the whole app. Queries are plain SQL (Core `text()`): the .sql files in
backend/db are the single source of truth for the schema, so there are no model classes to keep in sync."""
from functools import lru_cache

from sqlalchemy import Engine, create_engine

from .config import get_config


@lru_cache
def get_engine() -> Engine:
    return create_engine(
        get_config().sqlalchemy_url,
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=5,
        # Supabase's transaction pooler (port 6543) does not support prepared statements
        connect_args={"prepare_threshold": None},
    )


def reset_engine() -> None:
    """Forget the engine (tests point the app at another database)."""
    get_config.cache_clear()
    get_engine.cache_clear()
