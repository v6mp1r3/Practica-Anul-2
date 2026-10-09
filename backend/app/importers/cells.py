"""What one timetable cell says, the way UTM's faculties print them: the type ("Curs", "Seminar", "Lucrări de
laborator"...), the subject, the teacher ("conf. univ. Balan M.") and the room ("6-316A"), one per line, or
squeezed onto one line ("VEPS curs E. Guțuleac aud 614"). The importers find the cells; this reads them."""
import re
import unicodedata

DAYS = {"luni": 0, "marti": 1, "miercuri": 2, "joi": 3, "vineri": 4, "sambata": 5, "duminica": 6,
        "monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3, "friday": 4, "saturday": 5, "sunday": 6,
        "понедельник": 0, "вторник": 1, "среда": 2, "четверг": 3, "пятница": 4, "суббота": 5, "воскресенье": 6}

GROUP_RE = re.compile(r"^([A-ZĂÂÎȘŞȚŢ]{1,7})\s*-?\s*(\d{3}[A-Z]{0,2})$")


def group_name(s: str) -> str | None:
    """"TDF - 241", "IMCM 241" → "TDF-241"."""
    m = GROUP_RE.match(s.strip())
    return f"{m[1]}-{m[2]}" if m else None
TIME_RE = re.compile(r"(\d{1,2})[:.](\d{2})\s*[-–]\s*(\d{1,2})[:.](\d{2})")

# the type words, longest first (the whole line, or a word inside it)
TYPES = [
    ("lucrari de laborator", "lab"), ("lucrari practice", "seminar"), ("laborator", "lab"), ("seminar", "seminar"),
    ("proiect", "project"), ("curs", "lecture"), ("lab", "lab"), ("sem", "seminar"), ("lp", "seminar"), ("pr", "project"),
    ("ll", "lab"), ("lucr", "lab"), ("lucrari", "lab"),
]
# a type written after the subject: "Fiabilitatea mijloacelor de transport L.L.", "... Curs/L.L."
TRAILING_TYPE = re.compile(r"\s*\b(curs(?:\s*/\s*l\.\s*l\.)?|l\.\s*l\.|l\.\s*p\.|lucr\.?|sem\.|lab\.)\s*$", re.I)
TITLE_WORDS = {"dr", "hab", "conf", "univ", "lect", "asist", "prof", "sup", "superior", "lector", "ing", "mag", "drd", "academician", "acad", "dse", "dst", "dsf", "dhab"}
ROOM_RE = re.compile(r"^(?:aud\.?|sala|cab\.?|auditoriul)?\s*((?:\d{1,2}\s*-\s*)?[0-9IVX]+[\w/.\- ]*|[A-Z]{1,3}\s*-\s*\d[\w/]*|Tekwill[\w/\- ]*|Aula[\w ().]*)$", re.I)


def fold(s: str) -> str:
    """Lowercase without diacritics (ş/ș, ţ/ț and â/ă/î all compare equal)."""
    s = unicodedata.normalize("NFD", s.lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


def day_of(s: str) -> int | None:
    w = re.sub(r"[^a-zа-я]", "", fold(s))
    return DAYS.get(w) if w else None


def type_of_line(line: str) -> str | None:
    """The type when the whole line is one ("Curs", "Lucrări practice")."""
    w = re.sub(r"[^a-z ]", "", fold(line)).strip()
    return next((t for k, t in TYPES if w == k), None)


def is_room(line: str) -> bool:
    s = line.strip()
    if not s or len(s) > 30 or not any(ch.isdigit() for ch in s) and not s.lower().startswith(("tekwill", "aula")):
        return False
    return bool(ROOM_RE.match(s))


def is_teacher(line: str) -> bool:
    words = re.findall(r"[a-zа-я]+", fold(line)) + [re.sub(r"[^a-z]", "", fold(w)) for w in line.split()]
    if any(w in TITLE_WORDS for w in words):
        return True
    # "E. Guțuleac", "Guțuleac E.", "Rotaru Igor V."
    return bool(re.match(r"^([A-ZĂÂÎȘȚ]\.\s*){1,2}[A-ZĂÂÎȘȚ][a-zăâîșțşţ-]+$|^[A-ZĂÂÎȘȚ][a-zăâîșțşţ-]+\s+([A-ZĂÂÎȘȚ]\.\s*){1,2}$", line.strip()))


def clean_teacher(line: str) -> str:
    """"dr., conf. univ. Balan M." → "Balan M." (titles also come without spaces: "asist.univ.", "d.ş.e.")."""
    line = re.sub(r"\bd\.\s*[sşș]\.\s*\w{1,2}\.", " ", line, flags=re.I)
    out = []
    for w in re.split(r"[\s,]+|(?<=\.)(?=[^\s.])", line.strip()):
        if re.sub(r"[^a-z]", "", fold(w)) in TITLE_WORDS or fold(w).startswith("universitar"):
            continue
        out.append(w)
    return re.sub(r"\s*\(.*$", "", " ".join(out)).strip(" ,")


def _split_inline(line: str) -> list[str]:
    """"VEPS curs E. Guțuleac aud 614" → ["VEPS", "curs", "E. Guțuleac", "aud 614"]; "X /Curs" → ["X", "Curs"]."""
    parts: list[str] = []
    for chunk in re.split(r"\s+/\s*|\s*/\s+", line):
        chunk = chunk.strip()
        if not chunk:
            continue
        room = re.search(r"\b(aud\.?|sala)\s+\S.*$", chunk, re.I)
        if room:
            parts += _split_inline(chunk[: room.start()]) if chunk[: room.start()].strip() else []
            parts.append(room.group(0))
            continue
        m = re.search(r"(?<!\S)(curs|sem\.?|seminar|lab\.?|laborator|l\.p\.|lp|pr\.?|proiect)(?!\S)", chunk, re.I)
        if m and type_of_line(chunk) is None:
            before, after = chunk[: m.start()].strip(), chunk[m.end():].strip()
            parts += [p for p in (before, m.group(0), after) if p]
        else:
            # a room printed right after the teacher: "Stanciu Liuba 6-313"
            m = re.match(r"^(.*[^\d\s-])\s+(\d{1,2}\s*-\s*[\w/]+)$", chunk)
            parts += [m[1], m[2]] if m and is_teacher(m[1]) else [chunk]
    return parts


def read_cell(lines: list[str]) -> list[dict]:
    """The classes in one cell, in order (usually one; two when a cell holds two stacked blocks)."""
    items: list[str] = []
    # text that ran together with long gaps ("ANALIZA MATEMATICĂ II        Curs") is separate pieces
    lines = [re.sub(r" {2,5}", " ", piece).strip() for line in lines for piece in re.split(r" {6,}|\t", line) if piece.strip()]
    for line in lines:
        items += _split_inline(line) if type_of_line(line) is None else [line.strip()]
    out: list[dict] = []
    cur: dict | None = None
    for it in items:
        t = type_of_line(it)
        if t:
            # the type printed after the subject ("ANALIZA MATEMATICĂ II ... Curs") still belongs to it;
            # otherwise a type line starts the next class
            if cur is not None and cur["subject"] and not cur["type"] and not cur["teacher"] and not cur["room"]:
                cur["type"] = t
            elif cur is None or cur.get("subject"):
                cur = {"type": t, "subject": "", "teacher": "", "room": ""}
                out.append(cur)
            else:
                cur["type"] = t
            continue
        if cur is None:
            cur = {"type": None, "subject": "", "teacher": "", "room": ""}
            out.append(cur)
        if is_room(it) and not cur["room"]:
            cur["room"] = re.sub(r"^(aud\.?|sala|cab\.?|auditoriul)\s*", "", it.strip(), flags=re.I)
        elif is_teacher(it) and not cur["teacher"]:
            cur["teacher"] = clean_teacher(it)
        elif is_teacher(it):
            continue  # a second teacher (the other subgroup's): the class is matched by the first
        elif not cur["teacher"] and not cur["room"]:
            cur["subject"] = f"{cur['subject']} {it}".strip()
        elif cur["subject"] and (cur["teacher"] or cur["room"]):
            # the next class starts without its type line
            cur = {"type": None, "subject": it, "teacher": "", "room": ""}
            out.append(cur)
    for c in out:
        c["subject"] = re.sub(r"\s+", " ", c["subject"]).strip(" /")
        m = TRAILING_TYPE.search(c["subject"])
        if m and c["subject"][: m.start()].strip():
            c["subject"] = c["subject"][: m.start()].strip(" /")
            if not c["type"]:
                c["type"] = type_of_line(m.group(1).split("/")[-1])
    return [c for c in out if c["subject"] and (c["teacher"] or c["room"] or c["type"])]
