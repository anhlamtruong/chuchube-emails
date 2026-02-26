"""Parse clipboard CSV/TSV text into structured recruiter data with fuzzy column matching."""
import csv
import io
import re

# Fuzzy column name mapping → canonical field names
_COLUMN_ALIASES: dict[str, list[str]] = {
    "name": ["name", "full name", "fullname", "recruiter name", "contact name", "first name", "firstname"],
    "email": ["email", "e-mail", "email address", "mail", "recruiter email", "contact email"],
    "title": ["title", "position", "positions", "job title", "role"],
    "company": ["company", "companies", "organization", "org", "employer"],
    "location": ["location", "city", "state", "region", "place", "address"],
    "notes": ["notes", "note", "comments", "comment", "memo"],
}

# Build a reverse lookup: lowercased alias → canonical field
_ALIAS_LOOKUP: dict[str, str] = {}
for canonical, aliases in _COLUMN_ALIASES.items():
    for alias in aliases:
        _ALIAS_LOOKUP[alias] = canonical


def _normalize_header(header: str) -> str:
    """Normalize a header string for matching."""
    # Strip special chars like @ from headers like "Title @ Company"
    cleaned = re.sub(r"[^a-zA-Z0-9\s]", "", header).strip().lower()
    return cleaned


def _detect_delimiter(text: str) -> str:
    """Auto-detect CSV delimiter (comma, tab, pipe, semicolon)."""
    first_line = text.strip().split("\n")[0]
    tab_count = first_line.count("\t")
    comma_count = first_line.count(",")
    pipe_count = first_line.count("|")
    semi_count = first_line.count(";")

    best = max(
        [("\t", tab_count), (",", comma_count), ("|", pipe_count), (";", semi_count)],
        key=lambda x: x[1],
    )
    return best[0] if best[1] > 0 else ","


def _map_columns(headers: list[str]) -> tuple[dict[int, str], list[str]]:
    """Map column indices to canonical field names. Returns (mapping, unmapped_headers)."""
    mapping: dict[int, str] = {}
    unmapped: list[str] = []
    used_fields: set[str] = set()

    for i, header in enumerate(headers):
        normalized = _normalize_header(header)
        canonical = _ALIAS_LOOKUP.get(normalized)
        if canonical and canonical not in used_fields:
            mapping[i] = canonical
            used_fields.add(canonical)
        else:
            unmapped.append(header)

    return mapping, unmapped


def parse_clipboard_text(text: str) -> dict:
    """
    Parse clipboard CSV/TSV text into structured data.
    Returns {
        preview: [{name, email, title, company, location, notes}],
        detected_columns: {index: field_name},
        unmapped_columns: [str],
        total_rows: int,
    }
    """
    text = text.strip()
    if not text:
        return {"preview": [], "detected_columns": {}, "unmapped_columns": [], "total_rows": 0}

    delimiter = _detect_delimiter(text)
    reader = csv.reader(io.StringIO(text), delimiter=delimiter)

    rows_raw = list(reader)
    if len(rows_raw) < 1:
        return {"preview": [], "detected_columns": {}, "unmapped_columns": [], "total_rows": 0}

    headers = [h.strip() for h in rows_raw[0]]
    col_mapping, unmapped = _map_columns(headers)

    # If no columns could be mapped, try treating first row as data (no headers)
    if not col_mapping:
        # Heuristic: if there are emails in the row, guess column positions
        preview = []
        for row in rows_raw:
            entry = {"name": "", "email": "", "title": "", "company": "", "location": "", "notes": ""}
            for i, val in enumerate(row):
                val = val.strip()
                if "@" in val and "." in val and not entry["email"]:
                    entry["email"] = val
                elif i == 0 and not entry["name"]:
                    entry["name"] = val
            preview.append(entry)
        return {
            "preview": preview,
            "detected_columns": {},
            "unmapped_columns": headers,
            "total_rows": len(preview),
        }

    preview = []
    for row in rows_raw[1:]:  # skip header
        entry = {"name": "", "email": "", "title": "", "company": "", "location": "", "notes": ""}
        for col_idx, field_name in col_mapping.items():
            if col_idx < len(row):
                entry[field_name] = row[col_idx].strip()
        preview.append(entry)

    return {
        "preview": preview,
        "detected_columns": {str(k): v for k, v in col_mapping.items()},
        "unmapped_columns": unmapped,
        "total_rows": len(preview),
    }
