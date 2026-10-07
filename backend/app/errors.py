"""Every error leaves the API as { "message": "..." } with a matching status (docs/API.md)."""
import logging

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import DBAPIError, IntegrityError


class ApiError(HTTPException):
    def __init__(self, status: int, message: str):
        super().__init__(status_code=status, detail=message)


def _json(status: int, message: str) -> JSONResponse:
    return JSONResponse(status_code=status, content={"message": message})


def install(app: FastAPI) -> None:
    @app.exception_handler(HTTPException)
    async def http_error(_: Request, exc: HTTPException):
        return _json(exc.status_code, str(exc.detail))

    @app.exception_handler(KeyError)
    async def missing_field(_: Request, exc: KeyError):
        return _json(422, f"Invalid data: missing field {exc.args[0]!r}")

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, exc: RequestValidationError):
        first = exc.errors()[0] if exc.errors() else {}
        where = ".".join(str(p) for p in first.get("loc", []) if p != "body")
        return _json(422, f"Invalid data{': ' + where if where else ''}: {first.get('msg', '')}".strip())

    @app.exception_handler(IntegrityError)
    async def integrity_error(_: Request, exc: IntegrityError):
        code = getattr(exc.orig, "sqlstate", "") or ""
        statement = (exc.statement or "").lstrip().upper()
        detail = (getattr(getattr(exc.orig, "diag", None), "message_primary", None)) or "Invalid data"
        if code == "23503":  # foreign key
            if statement.startswith("DELETE"):
                return _json(409, "Cannot delete: other records still use it")
            return _json(422, "Refers to something that does not exist")
        if code == "23505":
            return _json(422, "Already exists")
        return _json(422, detail)

    @app.exception_handler(Exception)
    async def unexpected(_: Request, exc: Exception):
        logging.getLogger("eduschedule").exception("Unhandled error", exc_info=exc)
        return _json(500, "Something went wrong on the server")

    @app.exception_handler(DBAPIError)
    async def db_error(_: Request, exc: DBAPIError):
        code = getattr(exc.orig, "sqlstate", "") or ""
        detail = (getattr(getattr(exc.orig, "diag", None), "message_primary", None)) or "Database error"
        logging.getLogger("eduschedule").warning("Database error %s: %s", code, detail)
        # raise exception / check_violation from our own triggers and functions
        if code in ("P0001", "23514", "22P02", "22007", "22008", "22003"):
            return _json(422, detail)
        return _json(500, "Database error")
