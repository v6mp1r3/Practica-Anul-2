"""EduSchedule API. Run it from the backend folder:  uvicorn app.main:app --reload
All endpoints live under /api, as in docs/API.md."""
import logging
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from starlette.concurrency import run_in_threadpool

from . import errors
from . import dataset  # noqa: F401  (registers the dataset with memo)
from .memo import forget_all
from .semester_clock import check_daily
from starlette.concurrency import run_in_threadpool
from .config import DEV_SECRET, get_config
from .routers import auth, changes, data, exams, generation, notifications, timetables, users
from .services.generation import mark_orphans
from .services.timetables import rescore_all_soon

log = logging.getLogger("eduschedule")

# the collections whose changes can make a timetable out of date
DATA_PATHS = {"settings", "teachers", "rooms", "groups", "streams", "subjects", "assignments", "clusters"}


@asynccontextmanager
async def lifespan(_: FastAPI):
    mark_orphans()
    check_daily()  # e.g. the winter break began while the server was off
    try:
        forget_all()  # read the public data in the background, so the first visitor does not wait for it
    except Exception:
        log.warning("Could not start reading the dataset", exc_info=True)
    yield


def create_app() -> FastAPI:
    cfg = get_config()
    if cfg.jwt_secret == DEV_SECRET:
        log.warning("JWT_SECRET is not set: using the development secret. Set a long random value in .env.")
    app = FastAPI(title="EduSchedule API", version="0.1.0", docs_url="/api/docs", openapi_url="/api/openapi.json", lifespan=lifespan)
    app.add_middleware(CORSMiddleware, allow_origins=cfg.origins, allow_methods=["*"], allow_headers=["*"])
    # the dataset is ~400 KB of JSON, ~10x smaller compressed
    app.add_middleware(GZipMiddleware, minimum_size=1000)
    errors.install(app)

    @app.middleware("http")
    async def follow_the_calendar(request: Request, call_next):
        """The first request of a day checks whether the next semester is due (semester_clock.py)."""
        await run_in_threadpool(check_daily)
        return await call_next(request)

    @app.middleware("http")
    async def forget_cached_reads(request: Request, call_next):
        """A write may have changed what the public reads return: they are read again afterwards."""
        response = await call_next(request)
        if request.method not in ("GET", "HEAD", "OPTIONS"):
            forget_all()
            # the teaching loads, teachers, rooms, groups or settings changed: the timetables are checked again
            if response.status_code < 400 and request.url.path.removeprefix("/api/").split("/")[0] in DATA_PATHS:
                await run_in_threadpool(rescore_all_soon)
        return response

    api = APIRouter(prefix="/api")
    for module in (auth, data, timetables, generation, changes, notifications, exams, users):
        api.include_router(module.router)

    @api.get("/health", tags=["health"])
    def health():
        return {"status": "ok"}

    app.include_router(api)
    return app


app = create_app()
