"""Generation jobs (docs/API.md, Generation). Solving takes seconds to minutes, so POST /generate saves a job
(status "running") and answers at once; a worker thread runs the CP-SAT + LNS solver and writes its progress
into the same row, which the client polls. The finished variants are saved as timetables of status "variant"."""
import json
import logging
import threading
import time
from concurrent.futures import ThreadPoolExecutor

from sqlalchemy import Connection, text

from ..config import get_config
from ..dataset import build_dataset
from ..db import get_engine
from ..deps import CurrentUser
from ..errors import ApiError
from ..settings_io import current_semester
from ..solver.generate import generate_timetable
from ..util import maybe_pid, pid, sid
from . import timetables as tt

log = logging.getLogger("eduschedule.generation")
_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="generation")  # one solver at a time
_progress_lock = threading.Lock()


def seconds_per_variant(iterations: int) -> float:
    cfg = get_config()
    return min(cfg.generation_max_seconds, max(cfg.generation_min_seconds, iterations * cfg.generation_seconds_per_iteration))


def start(conn: Connection, user: CurrentUser, req: dict) -> str:
    group_ids = [pid(g) for g in dict.fromkeys(req.get("groupIds") or [])]
    if not group_ids:
        raise ApiError(422, "Choose at least one group")
    variants, iterations = req.get("variants", 3), req.get("iterations", 250)
    if not isinstance(variants, int) or not 1 <= variants <= 10:
        raise ApiError(422, "variants must be between 1 and 10")
    if not isinstance(iterations, int) or not 1 <= iterations <= 5000:
        raise ApiError(422, "iterations must be between 1 and 5000")
    seed = req.get("seed")
    if seed is not None and not isinstance(seed, int):
        raise ApiError(422, "seed must be a whole number")
    rows = conn.execute(text("select id, faculty_id from student_group where id = any(cast(:g as bigint[]))"), {"g": group_ids}).all()
    if len(rows) != len(group_ids):
        raise ApiError(422, "Unknown group")
    if any(r[1] != user.faculty_id for r in rows):
        raise ApiError(403, "You can only generate for your own faculty's groups")
    base = req.get("baseTimetableId")
    if base is not None and (maybe_pid(base) is None or not conn.execute(text("select 1 from timetable where id = :i"), {"i": maybe_pid(base)}).first()):
        raise ApiError(404, "The base timetable does not exist")
    example = req.get("exampleTimetableId")
    if example is not None and (maybe_pid(example) is None or not conn.execute(text("select 1 from timetable where id = :i"), {"i": maybe_pid(example)}).first()):
        raise ApiError(404, "The example timetable does not exist")
    params = {"groupIds": [sid(g) for g in group_ids], "variants": variants, "iterations": iterations, "seed": seed,
              "baseTimetableId": sid(maybe_pid(base)) if base is not None else None,
              "exampleTimetableId": sid(maybe_pid(example)) if example is not None else None, "live": {"variant": 0, "progress": 0, "best": None}}
    job_id = conn.execute(
        text("insert into generation_job (created_by, status, progress, params) values (:u, 'running', 0, cast(:p as jsonb)) returning id"),
        {"u": user.id, "p": json.dumps(params)},
    ).scalar_one()
    conn.commit()
    _executor.submit(_run, job_id, user.id)
    return sid(job_id)


def status(conn: Connection, job_id: str) -> dict:
    r = conn.execute(
        text("select status::text as status, progress, params, error from generation_job where id = :i"), {"i": pid(job_id)}
    ).mappings().first()
    if not r:
        raise ApiError(404, "Unknown job")
    live = (r["params"] or {}).get("live") or {}
    out = {"status": r["status"], "progress": {"variant": live.get("variant", 0), "progress": live.get("progress", r["progress"] / 100)}}
    if live.get("best"):
        out["progress"]["best"] = live["best"]
    if r["status"] == "done":
        out["timetableIds"] = [sid(x[0]) for x in conn.execute(text("select timetable_id from generation_job_timetable where job_id = :i order by timetable_id"), {"i": pid(job_id)})]
    if r["status"] == "failed":
        out["error"] = r["error"] or "Generation failed"
    return out


def mark_orphans() -> None:
    """Jobs still "running" when the server starts were cut off by a restart."""
    try:
        with get_engine().begin() as conn:
            conn.execute(text("update generation_job set status = 'failed', error = 'The server restarted while this was running', finished_at = now() where status = 'running'"))
    except Exception:  # the database may be unreachable at start-up; requests will report it
        log.warning("Could not clean up unfinished generation jobs", exc_info=True)


def _write_progress(job_id: int, variant: int, fraction: float, best: dict | None) -> None:
    live = {"variant": variant, "progress": round(fraction, 3), "best": best}
    with get_engine().begin() as conn:
        conn.execute(
            text("update generation_job set progress = :p, params = jsonb_set(params, '{live}', cast(:l as jsonb)) where id = :i"),
            {"p": int(fraction * 100), "l": json.dumps(live), "i": job_id},
        )


def _run(job_id: int, user_id: int) -> None:
    try:
        with get_engine().connect() as conn:
            params = conn.execute(text("select params from generation_job where id = :i"), {"i": job_id}).scalar_one()
            group_ids = params["groupIds"]
            variants, iterations = params["variants"], params["iterations"]
            seed0 = params["seed"] if params["seed"] is not None else int(time.time()) % 1_000_000
            ds = build_dataset(conn)
            published = tt.get_published(conn)
            keep = published["lessons"] if published else []
            fixed = []
            if params.get("baseTimetableId"):
                base = tt.load_timetable(conn, int(params["baseTimetableId"]))
                fixed = [l for l in base["lessons"] if l.get("locked")]  # locked pairs are kept exactly as they are
            # an example (e.g. last year's timetable, imported): followed where it still fits
            example = tt.load_timetable(conn, int(params["exampleTimetableId"]))["lessons"] if params.get("exampleTimetableId") else None
            sem = current_semester(conn)
            seconds = seconds_per_variant(iterations)
            workers = get_config().solver_workers or None
            results = []
            last = [0.0]
            for v in range(variants):
                def on_progress(p: float, score: dict, v=v) -> None:
                    now = time.monotonic()
                    if p < 1 and now - last[0] < 0.8:
                        return
                    last[0] = now
                    _write_progress(job_id, v, (v + p) / variants, score)

                seed = seed0 + v * 7919
                results.append((seed, generate_timetable(ds, group_ids, seed, seconds, fixed, keep, on_progress, workers, example=example)))
            # the variants of earlier runs go; drafts and the published timetable stay
            conn.execute(text("delete from timetable where semester_id = :s and status = 'variant'"), {"s": sem.id})
            ids = []
            for v, (seed, gen) in enumerate(results):
                ids.append(tt.create_timetable(conn, sem.id, f"Varianta {chr(65 + v)}", "variant", f"CP-SAT + LNS (seed {seed}, {seconds:.0f} s)", [int(g) for g in group_ids], gen.lessons, gen.score, user_id))
            conn.execute(text("insert into generation_job_timetable (job_id, timetable_id) values (:j, :t)"), [{"j": job_id, "t": i} for i in ids])
            conn.execute(
                text("update generation_job set status = 'done', progress = 100, finished_at = now(), params = jsonb_set(params, '{live}', cast(:l as jsonb)) where id = :i"),
                {"i": job_id, "l": json.dumps({"variant": variants - 1, "progress": 1, "best": results[-1][1].score})},
            )
            conn.commit()
    except Exception as exc:
        log.exception("Generation job %s failed", job_id)
        try:
            with get_engine().begin() as conn:
                conn.execute(text("update generation_job set status = 'failed', error = :e, finished_at = now() where id = :i"), {"e": f"{type(exc).__name__}: {exc}"[:500], "i": job_id})
        except Exception:
            log.exception("Could not record the failure of job %s", job_id)
