"""Settings read from environment variables or a .env file."""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

DEV_SECRET = "dev-only-secret-change-me"


class Config(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql://postgres:postgres@localhost:5432/eduschedule"
    jwt_secret: str = DEV_SECRET
    jwt_expire_hours: int = 12
    cors_origins: str = "http://localhost:5173"

    @property
    def sqlalchemy_url(self) -> str:
        """SQLAlchemy needs the driver in the URL; accept the plain form Supabase shows."""
        url = self.database_url
        for plain in ("postgresql://", "postgres://"):
            if url.startswith(plain):
                return "postgresql+psycopg://" + url[len(plain):]
        return url

    @property
    def origins(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_config() -> Config:
    return Config()
