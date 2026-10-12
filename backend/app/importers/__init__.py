"""Reading timetables the faculties already have (PDF or Excel) into plain rows; the frontend matches the rows
to the loads (Sarcina didactică) and saves them as a draft."""
from ..errors import ApiError

MAX_BYTES = 15 * 1024 * 1024


def read_sheet(filename: str, data: bytes) -> dict:
    if len(data) > MAX_BYTES:
        raise ApiError(413, "The file is larger than 15 MB")
    name = filename.lower()
    try:
        if name.endswith(".pdf") or data[:4] == b"%PDF":
            from .pdf import read_pdf

            return read_pdf(data)
        if name.endswith((".xlsx", ".xlsm")) or data[:2] == b"PK":
            from .xlsx import read_xlsx

            return read_xlsx(data)
    except ApiError:
        raise
    except Exception as exc:  # a damaged or unusual file
        raise ApiError(422, f"Could not read the file: {type(exc).__name__}") from exc
    raise ApiError(415, "Choose a PDF or an Excel (.xlsx) file")
