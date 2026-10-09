"""Weekly timetables as UTM's faculties publish them in PDF: the groups across the top, the days down the
left (often printed sideways), each day split into its pairs (the times, also sideways), and in each cell the
class. A lecture shared by several groups is one wide cell; a cell split in two holds the odd week above and
the even week below. The drawn borders say where the cells are, so the text is read cell by cell."""
import io
import re
from collections import defaultdict

from .cells import TIME_RE, day_of, group_name, read_cell, untyped_are_seminars


def _clusters(chars: list[dict], gap: float = 3.0) -> list[list[dict]]:
    """Sideways text: the characters of one column, split into labels where there is a gap."""
    chars = sorted(chars, key=lambda c: -c["top"])  # printed bottom to top
    out: list[list[dict]] = []
    for c in chars:
        if out and out[-1][-1]["top"] - c["bottom"] <= gap:
            out[-1].append(c)
        else:
            out.append([c])
    return out


def _sideways(page, right: float) -> list[dict]:
    return [c for c in page.chars if abs(c["matrix"][1]) > 0.5 and c["x1"] <= right + 1]


def _sideways_labels(page, right: float) -> list[tuple[float, float, str]]:
    """(top, bottom, text) of the sideways labels left of the groups (days, hours, minutes)."""
    rot = _sideways(page, right)
    by_x: dict[int, list[dict]] = defaultdict(list)
    for c in rot:
        by_x[round(c["x0"])].append(c)
    out = []
    for cs in by_x.values():
        for cl in _clusters(cs):
            out.append((min(c["top"] for c in cl), max(c["bottom"] for c in cl), "".join(c["text"] for c in cl).strip()))
    return out


def _lines(words: list[dict]) -> list[str]:
    rows: list[list[dict]] = []
    for w in sorted(words, key=lambda w: (w["top"], w["x0"])):
        if rows and abs(rows[-1][0]["top"] - w["top"]) <= 1.6:
            rows[-1].append(w)
        else:
            rows.append([w])
    return [" ".join(w["text"].strip() for w in sorted(r, key=lambda w: w["x0"])).strip() for r in rows]


def _times(labels: list[tuple[float, float, str]], words: list[dict], left: float, rot: list[dict]) -> list[tuple[float, float, str, str]]:
    """The pairs down the page: (top, bottom, start, end)."""
    out = []
    # upright "08:00-09:30" in the left columns
    for w in words:
        if w["x1"] <= left + 1:
            m = TIME_RE.search(w["text"])
            if m:
                out.append((w["top"], w["bottom"], f"{int(m[1]):02d}:{m[2]}", f"{int(m[3]):02d}:{m[4]}"))
    if out:
        return out
    # sideways: hours ("8-9", "9-11") and their minutes ("0030", printed small next to them)
    # the minutes run into the hours ("800-930", "1130-1300"): the last two digits are the minutes
    for t, b, s in labels:
        m = re.fullmatch(r"(\d{1,2})(\d{2})-(\d{1,2})(\d{2})", s)
        if m:
            out.append((t, b, f"{int(m[1]):02d}:{m[2]}", f"{int(m[3]):02d}:{m[4]}"))
    if out:
        return out
    hours = [(t, b, s) for t, b, s in labels if re.fullmatch(r"\d{1,2}-\d{1,2}", s)]
    small = [(t, b, s) for t, b, s in labels if re.fullmatch(r"\d{2}", s)]
    small += [(t, (t + b) / 2, s[2:]) for t, b, s in labels if re.fullmatch(r"\d{4}", s)]  # "0030": end minutes on top
    small += [((t + b) / 2, b, s[:2]) for t, b, s in labels if re.fullmatch(r"\d{4}", s)]
    for t, b, s in hours:
        h1, h2 = s.split("-")
        # "8⁰⁰-9³⁰" printed bottom to top: the start minutes beside the first hour, the end minutes at the top
        near = sorted((m for m in small if t - 4 <= (m[0] + m[1]) / 2 <= b + 1), key=lambda m: -m[0])
        mm = (near[0][2] + near[1][2]) if len(near) >= 2 else "0000"
        out.append((t, b, f"{int(h1):02d}:{mm[:2]}", f"{int(h2):02d}:{mm[2:]}"))
    return out


def _segments(page):
    """Vertical and horizontal borders (thin rectangles and lines)."""
    vert, horiz = [], []
    for r in list(page.rects) + list(page.lines):
        w, h = r["x1"] - r["x0"], r["bottom"] - r["top"]
        if w < 1.5 and h > 2:
            vert.append((r["x0"], r["top"], r["bottom"]))
        elif h < 1.5 and w > 2:
            horiz.append((r["top"], r["x0"], r["x1"]))
    return vert, horiz


def read_pdf(data: bytes) -> dict:
    import pdfplumber

    rows: list[dict] = []
    warnings: list[str] = []
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        for pno, page in enumerate(pdf.pages, start=1):
            words = [w for w in page.extract_words(use_text_flow=True, keep_blank_chars=True, x_tolerance=1.5) if w.get("upright", True)]
            # the header: one line with several group names
            by_line: dict[int, list[dict]] = defaultdict(list)
            for w in words:
                if group_name(w["text"]):
                    by_line[round(w["top"])].append(w)
            header = max(by_line.values(), key=len, default=[])
            if len(header) < 1:
                continue
            header.sort(key=lambda w: w["x0"])
            vert, horiz = _segments(page)
            xs = sorted({round(x, 1) for x, _, _ in vert})
            cols = []
            for i, w in enumerate(header):
                cx = (w["x0"] + w["x1"]) / 2
                lo = max([x for x in xs if x < w["x0"] + 1], default=None)
                hi = min([x for x in xs if x > w["x1"] - 1], default=None)
                if lo is None:
                    lo = (header[i - 1]["x1"] + w["x0"]) / 2 if i else w["x0"] - (w["x1"] - w["x0"])
                if hi is None:
                    hi = (w["x1"] + header[i + 1]["x0"]) / 2 if i + 1 < len(header) else w["x1"] + (w["x1"] - w["x0"])
                cols.append({"name": group_name(w["text"]), "x0": lo, "x1": hi, "cx": cx})
            left = cols[0]["x0"]
            top = header[0]["bottom"]
            labels = _sideways_labels(page, left)
            # days: upright day names left of / across the grid, or sideways labels
            days = [(w["top"], d) for w in words if w["top"] > top and (d := day_of(w["text"])) is not None]
            days += [(t, d) for t, b, s in labels if (d := day_of(s)) is not None]
            days.sort()
            times = sorted(t for t in _times(labels, words, left, _sideways(page, left)) if t[0] > top)
            # where each row of cells starts: the borders across the whole grid
            row_tops = sorted({round(hy, 1) for hy, hx0, hx1 in horiz if hx0 <= left + 2 and hx1 >= cols[-1]["x1"] - 2})
            if not times:
                warnings.append(f"p{pno}: no pair times found")
                continue
            # the times are printed in the middle of their rows: a row reaches halfway to the next label
            # (or to a drawn border close to that). A day is the run of pairs until the times start again
            # (8:00 after 18:30); the day names (at the top of a day, or in its middle) say which day it is.
            centers = [(t + b) / 2 for t, b, _, _ in times]
            block = []
            for i, (_, _, start, _) in enumerate(times):
                block.append(0 if i == 0 else block[-1] + (start <= times[i - 1][2]))
            names = []
            for _, d in days:
                if not names or names[-1] != d:
                    names.append(d)
            first = names[0] if names else 0
            day_of_block = lambda k: names[k] if k < len(names) and len(names) >= block[-1] + 1 else (first + k) % 7

            def day_at(i: int):
                return day_of_block(block[i])

            def snap(y: float, reach: float) -> float:
                near = [r for r in row_tops if abs(r - y) <= reach]
                return min(near, key=lambda r: abs(r - y)) if near else y

            bands = []
            for i, (t, b, start, end) in enumerate(times):
                c = centers[i]
                same_prev = i > 0 and block[i - 1] == block[i]
                same_next = i + 1 < len(times) and block[i + 1] == block[i]
                step = (c - centers[i - 1]) if same_prev else (centers[i + 1] - c) if same_next else 2 * (b - t)
                y0 = (centers[i - 1] + c) / 2 if same_prev else c - step / 2
                y1 = (c + centers[i + 1]) / 2 if same_next else c + step / 2
                bands.append((snap(y0, step / 4), snap(y1, step / 4), start, end, day_at(i)))
            # the pairs' bands: from where the cells start, not where the sideways label starts
            for y0, y1, start, end, day in bands:
                if day is None:
                    continue
                inside = [w for w in words if y0 <= (w["top"] + w["bottom"]) / 2 < y1 and w["x0"] >= left - 1]
                grid_w = cols[-1]["x1"] - left

                def border(x: float, ya: float, yb: float) -> bool:
                    mid = (ya + yb) / 2
                    return any(abs(vx - x) < 1.5 and vt <= mid <= vb for vx, vt, vb in vert)

                # a column whose cell is split across (odd week above, even week below)
                def split_of(c: dict) -> float | None:
                    ys = sorted(hy for hy, hx0, hx1 in horiz if y0 + 3 < hy < y1 - 3 and hx0 <= c["x0"] + 2 and hx1 >= c["x1"] - 2 and hx1 - hx0 < grid_w - 2)
                    return ys[0] if ys else None

                splits = [split_of(c) for c in cols]
                # the cells of this pair: (columns, top, bottom, week); neighbours with no border between them
                # at that height are one wide cell (a lecture shared by several groups)
                cells: list[tuple[list[dict], float, float, str]] = []
                for half in ("weekly", "odd", "even"):
                    run: list[dict] = []
                    run_box: tuple[float, float] | None = None
                    for c, sp in zip(cols, splits):
                        if half == "weekly":
                            box = (y0, y1) if sp is None else None
                        else:
                            box = None if sp is None else ((y0, sp) if half == "odd" else (sp, y1))
                        joined = run and box and run_box and abs(box[0] - run_box[0]) < 2 and abs(box[1] - run_box[1]) < 2 and not (vert and border(run[-1]["x1"], *box))
                        if joined:
                            run.append(c)
                            continue
                        if run:
                            cells.append((run, run_box[0], run_box[1], half))
                        run, run_box = ([c], box) if box else ([], None)
                    if run:
                        cells.append((run, run_box[0], run_box[1], half))
                for run, ya, yb, parity in cells:
                    x0, x1 = run[0]["x0"], run[-1]["x1"]
                    # a little slack at the row's own edges, none at the line between the odd and the even week
                    lo, hi = ya - (1 if ya == y0 else 0), yb + (1 if yb == y1 else 0)
                    ws = [w for w in inside if x0 <= (w["x0"] + w["x1"]) / 2 < x1 and lo <= (w["top"] + w["bottom"]) / 2 < hi]
                    if not ws:
                        continue
                    for c in read_cell(_lines(ws)):
                        rows.append({"groups": [g["name"] for g in run], "day": day, "start": start, "end": end, "parity": parity,
                                     "type": c["type"], "subject": c["subject"], "teacher": c["teacher"], "room": c["room"], "prefixed": c.get("prefixed", False),
                                     "source": f"p{pno} {start} {'/'.join(g['name'] for g in run)}"})
    return {"rows": untyped_are_seminars(rows), "warnings": warnings}
