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
    # time the solver gets per variant = iterations x seconds_per_iteration, kept between min and max
    # (the frontend asks for 80 / 250 / 700 iterations, which is 8 / 25 / 70 seconds)
    generation_seconds_per_iteration: float = 0.1
    generation_min_seconds: float = 5.0
    generation_max_seconds: float = 300.0
    solver_workers: int = 0  # 0 = use up to 8 CPU cores
    # GET /dataset answers from memory for this long (any change saved through this server clears it at once;
    # changes made elsewhere, e.g. a teammate's server on the same database, show up within this time). 0 = off
    dataset_cache_seconds: float = 30.0

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
