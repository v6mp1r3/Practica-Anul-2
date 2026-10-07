"""EduSchedule API. Run it from the backend folder:  uvicorn app.main:app --reload
All endpoints live under /api, as in docs/API.md."""
import logging

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import errors
from .config import DEV_SECRET, get_config
from .routers import auth, changes, data, exams, generation, notifications, timetables

log = logging.getLogger("eduschedule")


def create_app() -> FastAPI:
    cfg = get_config()
    if cfg.jwt_secret == DEV_SECRET:
        log.warning("JWT_SECRET is not set: using the development secret. Set a long random value in .env.")
    app = FastAPI(title="EduSchedule API", version="0.1.0", docs_url="/api/docs", openapi_url="/api/openapi.json")
    app.add_middleware(CORSMiddleware, allow_origins=cfg.origins, allow_methods=["*"], allow_headers=["*"])
    errors.install(app)

    api = APIRouter(prefix="/api")
    for module in (auth, data, timetables, generation, changes, notifications, exams):
        api.include_router(module.router)

    @api.get("/health", tags=["health"])
    def health():
        return {"status": "ok"}

    app.include_router(api)
    return app


app = create_app()
