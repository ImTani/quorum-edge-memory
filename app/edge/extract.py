"""Text -> claim drafts.

The LLM path (Ollama /api/chat, temperature 0) names the entity, the attribute and the raw value.
It never does date arithmetic: for dates it copies the date *words* ("the 18th") and
`resolve_date` turns them into ISO against the demo's today. Entities are snapped to known names
in Python and the privacy tier comes from explicit rules, so the parts the demo depends on are
deterministic. If Ollama is down, slower than 6 s or returns nothing valid, a regex fallback runs.

Public surface:
    extract(text, source, cfg, known_entities) -> list[draft]
    extract_with_meta(text, source, cfg, known_entities) -> (list[draft], "llm" | "fallback")
    resolve_date(phrase, today) -> "YYYY-MM-DD" | None
    warm_up(cfg) -> bool        # load the model into Ollama's memory before the first ingest

draft = {text, entity, entity_kind, attribute, value, value_label, tier}
"""
from __future__ import annotations

import calendar
import json
import logging
import re
import time
from datetime import date, timedelta

import httpx

log = logging.getLogger(__name__)

ENTITY_KINDS = ("task", "person", "project", "event", "note")
ATTRIBUTES = ("due_date", "birthday", "assignee", "location", "amount", "count", "status", "note")
DATE_ATTRIBUTES = {"due_date", "birthday"}
TEAM = ("tanishk", "lakshya", "tushar", "aayat")

LLM_TIMEOUT_S = 6.0
MAX_CLAIMS = 3
KEEP_ALIVE = "60m"  # keep llama3.2 resident between ingests; a cold load takes ~8 s

# ---------------------------------------------------------------------------------------------
# Dates
# ---------------------------------------------------------------------------------------------

_MONTHS = {
    "jan": 1, "january": 1, "feb": 2, "february": 2, "mar": 3, "march": 3, "apr": 4, "april": 4,
    "may": 5, "jun": 6, "june": 6, "jul": 7, "july": 7, "aug": 8, "august": 8, "sep": 9,
    "sept": 9, "september": 9, "oct": 10, "october": 10, "nov": 11, "november": 11, "dec": 12,
    "december": 12,
}
_WEEKDAYS = {d.lower(): i for i, d in enumerate(calendar.day_name)}  # monday=0 .. sunday=6
_NUMBER_WORDS = {
    "a": 1, "an": 1, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7,
    "eight": 8, "nine": 9, "ten": 10, "eleven": 11, "twelve": 12, "a couple of": 2, "couple of": 2,
}

_MONTH_RE = "|".join(sorted(_MONTHS, key=len, reverse=True))
_WEEKDAY_RE = "|".join(_WEEKDAYS)
_NUM_RE = r"\d{1,2}|a couple of|couple of|an?|one|two|three|four|five|six|seven|eight|nine|ten"
_ORD = r"(?:st|nd|rd|th)?"

# Patterns that locate a date phrase inside free text, most specific first.
_DATE_FINDERS = [
    r"\b\d{4}-\d{1,2}-\d{1,2}\b",
    r"\b\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?\b",
    rf"\b\d{{1,2}}{_ORD}(?:\s+of)?\s+(?:{_MONTH_RE})\.?(?:,?\s+\d{{4}})?\b",
    rf"\b(?:{_MONTH_RE})\.?\s+\d{{1,2}}{_ORD}(?:,?\s+\d{{4}})?\b",
    r"\bday after tomorrow\b",
    r"\b(?:tomorrow|tmrw|today|tonight)\b",
    rf"\bin\s+(?:{_NUM_RE})\s+(?:days?|weeks?)\b",
    r"\bin\s+a\s+fortnight\b",
    r"\bend\s+of\s+(?:the\s+|this\s+|next\s+)?(?:week|month)\b",
    r"\b(?:this\s+|next\s+)?weekend\b",
    rf"\b(?:next|this|coming)\s+(?:{_WEEKDAY_RE})\b",
    rf"\b(?:{_WEEKDAY_RE})\b",
    r"\bnext\s+week\b",
    r"\bthe\s+\d{1,2}(?:st|nd|rd|th)?\b",
    r"\b\d{1,2}(?:st|nd|rd|th)\b",
]
_DATE_FINDER_RES = [re.compile(p, re.IGNORECASE) for p in _DATE_FINDERS]


def find_date_phrases(text: str) -> list[str]:
    """Date phrases in `text`, in reading order, without overlaps (earlier patterns win)."""
    taken: list[tuple[int, int]] = []
    found: list[tuple[int, str]] = []
    for rx in _DATE_FINDER_RES:
        for m in rx.finditer(text or ""):
            s, e = m.span()
            if any(s < te and ts < e for ts, te in taken):
                continue
            taken.append((s, e))
            found.append((s, m.group(0)))
    return [p for _, p in sorted(found)]


def _safe_date(y: int, m: int, d: int) -> date | None:
    try:
        return date(y, m, d)
    except ValueError:
        return None


def _next_month(today: date) -> tuple[int, int]:
    return (today.year + 1, 1) if today.month == 12 else (today.year, today.month + 1)


def _day_month(day: int, month: int, year: int | None, today: date) -> date | None:
    """A day + month; without a year, roll to next year only if it would be long past."""
    if year is not None:
        return _safe_date(year + 2000 if year < 100 else year, month, day)
    d = _safe_date(today.year, month, day)
    if d and d < today - timedelta(days=60):
        d = _safe_date(today.year + 1, month, day)
    return d


def _resolve_exact(p: str, today: date) -> date | None:
    """Resolve an already-normalised phrase that is exactly one date expression."""
    if m := re.fullmatch(r"(\d{4})-(\d{1,2})-(\d{1,2})", p):
        return _safe_date(int(m[1]), int(m[2]), int(m[3]))
    if m := re.fullmatch(r"(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?", p):
        a, b = int(m[1]), int(m[2])
        day, month = (b, a) if b > 12 >= a else (a, b)  # day-first (India) unless impossible
        return _day_month(day, month, int(m[3]) if m[3] else None, today)
    if m := re.fullmatch(rf"(\d{{1,2}})(?: of)? ({_MONTH_RE})\.?(?: (\d{{4}}))?", p):
        return _day_month(int(m[1]), _MONTHS[m[2]], int(m[3]) if m[3] else None, today)
    if m := re.fullmatch(rf"({_MONTH_RE})\.? (\d{{1,2}})(?: (\d{{4}}))?", p):
        return _day_month(int(m[2]), _MONTHS[m[1]], int(m[3]) if m[3] else None, today)
    if p in ("today", "tonight", "eod"):
        return today
    if p in ("tomorrow", "tmrw", "tmr"):
        return today + timedelta(days=1)
    if p == "day after tomorrow":
        return today + timedelta(days=2)
    if m := re.fullmatch(rf"in ({_NUM_RE}) (days?|weeks?)", p):
        n = int(m[1]) if m[1].isdigit() else _NUMBER_WORDS[m[1]]
        return today + timedelta(days=n * (7 if m[2].startswith("week") else 1))
    if p == "in a fortnight":
        return today + timedelta(days=14)
    monday = today - timedelta(days=today.weekday())
    # Weeks run Monday-Sunday. "End of the week" is that week's Friday, or its Sunday once Friday
    # has passed; "end of next week" is next week's Friday; "next week" is next week's Monday.
    if p in ("end of week", "end of this week", "end of the week"):
        friday = monday + timedelta(days=4)
        return friday if today <= friday else monday + timedelta(days=6)
    if p == "end of next week":
        return monday + timedelta(days=11)
    if p == "next week":
        return monday + timedelta(days=7)
    if p in ("weekend", "this weekend"):
        return max(today, monday + timedelta(days=5))
    if p == "next weekend":
        return monday + timedelta(days=12)
    if p in ("end of month", "end of this month", "end of the month"):
        return date(today.year, today.month, calendar.monthrange(today.year, today.month)[1])
    if p == "end of next month":
        y, mth = _next_month(today)
        return date(y, mth, calendar.monthrange(y, mth)[1])
    if m := re.fullmatch(rf"(?:(next|this|coming) )?({_WEEKDAY_RE})", p):
        wd = _WEEKDAYS[m[2]]
        if m[1] == "next":  # the named day in next Monday-Sunday week
            return monday + timedelta(days=7 + wd)
        return today + timedelta(days=(wd - today.weekday()) % 7)  # nearest, today included
    if m := re.fullmatch(r"(\d{1,2})", p):
        # A bare day of month: this month if still ahead (or today), otherwise next month.
        d = _safe_date(today.year, today.month, int(m[1]))
        if d and d >= today:
            return d
        return _safe_date(*_next_month(today), int(m[1]))
    return None


def _normalise_phrase(phrase: str) -> str:
    p = phrase.lower().strip().strip(".!?")
    p = re.sub(r"(\d)(st|nd|rd|th)\b", r"\1", p)
    p = re.sub(r"\s+", " ", p.replace(",", " ")).strip()
    p = re.sub(r"^(?:(?:on|by|before|till|until|due|for|from|at|moves? to|to) )+", "", p)
    return re.sub(r"^the ", "", p)


def resolve_date(phrase: str | None, today: date) -> str | None:
    """Resolve a date phrase against `today`. Returns ISO "YYYY-MM-DD" or None.

    Rules: numeric dates are day-first; a bare day ("the 18th") is this month if not yet past,
    else next month; "Friday" / "this Friday" is the nearest one, today included; "next Friday"
    is the Friday of next Monday-Sunday week; "end of next week" is that week's Friday; a day and
    month without a year stay in this year unless that is more than 60 days ago.
    """
    if not phrase or not isinstance(phrase, str):
        return None
    d = _resolve_exact(_normalise_phrase(phrase), today)
    if d is None:  # a longer phrase: resolve the first date expression inside it
        for inner in find_date_phrases(phrase):
            d = _resolve_exact(_normalise_phrase(inner), today)
            if d is not None:
                break
    return d.isoformat() if d else None


def date_label(iso: str, today: date) -> str:
    d = date.fromisoformat(iso)
    return f"{d.day} {d:%b}" + ("" if d.year == today.year else f" {d.year}")


# ---------------------------------------------------------------------------------------------
# Entities
# ---------------------------------------------------------------------------------------------

_STOPWORDS = {
    "the", "a", "an", "of", "for", "and", "to", "on", "in", "at", "is", "our", "my", "with", "by",
    "client", "just", "called", "new", "this", "that", "moves", "moved", "hi", "hello", "thanks",
}
# Words that describe *what kind* of thing it is; they break ties but never identify it alone.
_GENERIC = {
    "wedding", "edit", "delivery", "deliverable", "final", "shoot", "reel", "cutdown", "invoice",
    "project", "film", "video", "lake", "task", "payment", "permit", "drone", "trailer", "teaser",
    "highlight", "cut", "job", "work", "event", "date", "deadline", "birthday", "meeting", "call",
    "note", "team", "status", "update",
}


def _tokens(s: str) -> list[str]:
    out = []
    for t in re.findall(r"[a-z0-9]+", (s or "").lower().replace("'s", "")):
        if t in _STOPWORDS:
            continue
        if len(t) > 3 and t.endswith("s") and not t.endswith("ss"):
            t = t[:-1]  # crude singular: reels -> reel, permits -> permit
        out.append(t)
    return out


def _distinctive(tokens) -> set[str]:
    return {t for t in tokens if t not in _GENERIC and not t.isdigit()}


def match_known(mention: str, known_entities: list[str]) -> str | None:
    """The known entity a mention refers to, or None.

    A match needs at least one shared distinctive word ("Sharma"); generic words ("delivery",
    "edit") only break ties between candidates that share a distinctive one.
    """
    m_tokens = set(_tokens(mention))
    m_distinct = _distinctive(m_tokens)
    if not m_distinct:
        return None
    best, best_score = None, 0.0
    for name in known_entities:
        if name.strip().lower() == (mention or "").strip().lower():
            return name
        k_tokens = set(_tokens(name))
        shared_distinct = m_distinct & _distinctive(k_tokens)
        if not shared_distinct:
            continue
        shared_generic = (m_tokens & k_tokens) - shared_distinct
        score = 3 * len(shared_distinct) + len(shared_generic) - 0.1 * len(k_tokens - m_tokens)
        if score > best_score:
            best, best_score = name, score
    return best


def _canonical_entity(llm_entity: str, text: str, known: list[str]) -> str:
    """Snap the model's entity name to a known one when it clearly refers to it."""
    hit = match_known(llm_entity, known)
    if hit:
        return hit
    distinct = _distinctive(_tokens(llm_entity))
    # Generic ("Delivery") or not in the message at all (a name borrowed from the few-shot
    # examples): name the entity from the message itself instead.
    if not distinct or not distinct & set(_tokens(text)):
        return match_known(text, known) or _guess_entity(text)
    return llm_entity.strip()


_EVENT_WORDS = re.compile(
    r"\b(shoot|reception|sangeet|haldi|party|meeting|appointment|recce|screening|ceremony|trip|"
    r"flight|launch)\b", re.IGNORECASE)
_NOTE_ENTITIES = {"salary", "note", "rent", "expenses"}


def guess_kind(entity: str, attribute: str) -> str:
    if attribute == "birthday":
        return "person"
    if entity.lower() in _NOTE_ENTITIES:
        return "note"
    if _EVENT_WORDS.search(entity):
        return "event"
    words = entity.split()
    if len(words) == 1 and words[0][:1].isupper() and words[0].lower() not in _GENERIC:
        return "person"
    return "task"


# ---------------------------------------------------------------------------------------------
# Tier
# ---------------------------------------------------------------------------------------------

_PRIVATE_RE = re.compile(
    r"\b(salary|credited|debited|bank|a/c|loan|emi|rent|upi|investment|stocks?|tax refund|"
    r"doctor|dentist|hospital|clinic|health|medicine|fever|sick|therapy|therapist|pregnan\w*|"
    r"diagnos\w*|surgery|blood test|scan report|break-?up|divorce|"
    r"don'?t tell|not telling|keep it quiet|between us|secret|private|confidential|"
    r"hasn'?t told|has not told|hasn'?t announced)\b",
    re.IGNORECASE,
)
_PERSONAL_RE = re.compile(
    r"\b(birthday|bday|anniversary dinner|gym|haircut|mom|dad|family dinner|flight home)\b",
    re.IGNORECASE,
)
_WORK_RE = re.compile(
    r"\b(client|deliver\w*|deadline|due|edit\w*|shoot|cutdowns?|reels?|invoice|render|export|"
    r"footage|rushes|grade|grading|colou?r|mix|permits?|recce|crew|call sheet|drone|trailer|"
    r"teaser|brief|storyboard|sangeet|haldi|wedding|highlights?|master|dop|gimbal|location)\b",
    re.IGNORECASE,
)


def decide_tier(text: str, attribute: str, entity: str, known: list[str]) -> str:
    """device unless sure: money, health and private news stay on this device; personal schedule
    goes to my devices; client work, deliverables, deadlines, shoots and team tasks go to the team."""
    if _PRIVATE_RE.search(text):
        return "device"
    if attribute == "birthday" or _PERSONAL_RE.search(text):
        return "my_devices"
    if entity in known or _WORK_RE.search(text):
        return "team"
    return "device"


# ---------------------------------------------------------------------------------------------
# Values and drafts
# ---------------------------------------------------------------------------------------------


def _indian_grouping(n: int) -> str:
    s = str(n)
    if len(s) <= 3:
        return s
    head = re.sub(r"(\d)(?=(\d\d)+$)", r"\1,", s[:-3])
    return f"{head},{s[-3:]}"


def parse_amount(raw: str) -> int | None:
    """'₹1,85,000' / 'Rs 58k' / '1.85 lakh' / '2L' -> rupees."""
    s = (raw or "").lower().replace(",", "").replace("₹", " ").replace("rs.", " ").replace("inr", " ")
    m = re.search(r"(\d+(?:\.\d+)?)\s*(k|l|lakh|lakhs|lac|cr|crore)?\b", s)
    if not m:
        return None
    mult = {"k": 1e3, "l": 1e5, "lakh": 1e5, "lakhs": 1e5, "lac": 1e5, "cr": 1e7, "crore": 1e7}
    return int(round(float(m[1]) * mult.get(m[2] or "", 1)))


def parse_count(raw: str) -> int | None:
    s = (raw or "").lower()
    if m := re.search(r"\d+", s):
        return int(m[0])
    for word, n in _NUMBER_WORDS.items():
        if word not in ("a", "an") and re.search(rf"\b{word}\b", s):
            return n
    return None


def _sentence(entity: str, attribute: str, label: str, source_text: str) -> str:
    if attribute == "due_date":
        delivery = re.search(r"deliver", source_text, re.I) and "deliver" not in entity.lower()
        return f"{entity}{' delivery' if delivery else ''} is due {label}"
    if attribute == "birthday":
        return f"{entity}'s birthday is {label}"
    if attribute == "assignee":
        return f"{label} is on {entity}"
    if attribute == "location":
        return f"{entity} is at {label}"
    if attribute == "count":
        return f"{entity}: {label} in total"
    if attribute == "status":
        return f"{entity} status: {label}"
    return f"{entity}: {label}"


def _ground_date(phrase: str, text: str, today: date) -> str | None:
    """ISO date for `phrase`, but only if the message really contains that date."""
    in_text = find_date_phrases(text)
    if phrase and phrase.lower() in text.lower():
        return resolve_date(phrase, today)
    if len(in_text) == 1:  # the model paraphrased or did arithmetic: use the message's own words
        return resolve_date(in_text[0], today)
    resolved = resolve_date(phrase, today)
    if resolved and resolved in {resolve_date(p, today) for p in in_text}:
        return resolved
    return None


def build_draft(entity, entity_kind, attribute, raw_value, text, today, known):
    """Validate one extracted fact and turn it into a draft, or return None if it doesn't hold.
    For date attributes `raw_value` is the date phrase."""
    entity = (entity or "").strip()
    if not entity or attribute not in ATTRIBUTES:
        return None
    if entity_kind not in ENTITY_KINDS:
        entity_kind = guess_kind(entity, attribute)
    raw_value = (raw_value or "").strip()

    if attribute in DATE_ATTRIBUTES:
        value = _ground_date(raw_value, text, today)
        if value is None:
            return None
        label = date_label(value, today)
    elif attribute == "amount":
        n = parse_amount(raw_value)
        if n is None:
            return None
        value, label = str(n), f"₹{_indian_grouping(n)}"
    elif attribute == "count":
        n = parse_count(raw_value)
        if n is None:
            return None
        value = label = str(n)
    elif attribute == "assignee":
        name = raw_value.split()[0].strip(".,") if raw_value else ""
        if not name:
            return None
        is_team = name.lower() in TEAM
        value = name.lower() if is_team else raw_value
        label = name.capitalize() if is_team else raw_value
    else:
        value = label = raw_value or text.strip()[:200]

    return {
        "text": _sentence(entity, attribute, label, text),
        "entity": entity,
        "entity_kind": entity_kind,
        "attribute": attribute,
        "value": value,
        "value_label": label,
        "tier": decide_tier(text, attribute, entity, known),
    }


def _grounded(attribute: str, raw_value: str, text: str) -> bool:
    """Reject model values that the message doesn't support (a 3B model does invent things)."""
    low = text.lower().replace(",", "")
    v = raw_value.lower().replace(",", "").strip()
    if attribute == "assignee":
        first = raw_value.split()[0].strip(".,") if raw_value.strip() else ""
        # A person's name, present in the message; an acronym ("FTII") is an institution.
        return bool(first) and not (first.isupper() and len(first) > 1) and first.lower() in low
    if attribute in ("count", "amount"):
        num = re.search(r"\d+(?:\.\d+)?", v)
        if num:
            return num[0] in low
        return any(re.search(rf"\b{w}\b", v) and re.search(rf"\b{w}\b", low)
                   for w in _NUMBER_WORDS if w not in ("a", "an"))
    if attribute == "location":
        return bool(set(_tokens(v)) & set(_tokens(low)))
    return True


def _dedupe(drafts: list[dict]) -> list[dict]:
    seen, out = set(), []
    for d in drafts:
        key = (d["entity"].lower(), d["attribute"], d["value"])
        if key not in seen:
            seen.add(key)
            out.append(d)
    return out[:MAX_CLAIMS + 1]


# ---------------------------------------------------------------------------------------------
# LLM path
# ---------------------------------------------------------------------------------------------

# Kept small on purpose: on this CPU llama3.2 generates ~15-20 tokens/s, so every output token
# counts against the 6 s budget. Kind is derived in Python; dates go in `value` as written.
LLM_SCHEMA = {
    "type": "object",
    "properties": {
        "claims": {
            "type": "array",
            "maxItems": MAX_CLAIMS,
            "items": {
                "type": "object",
                "properties": {
                    "entity": {"type": "string"},
                    "attribute": {"type": "string", "enum": list(ATTRIBUTES)},
                    "value": {"type": "string"},
                },
                "required": ["entity", "attribute", "value"],
            },
        }
    },
    "required": ["claims"],
}

SYSTEM_PROMPT = """You pull facts out of messages for a film and events crew's shared memory.
Reply with JSON only: {"claims": [{"entity": ..., "attribute": ..., "value": ...}]}
entity: what the fact is about. If it is one of the known entities, even said loosely
("the Bose delivery" means "Bose anniversary film"), copy that known name exactly.
attribute: due_date (deadline, delivery, shoot or event date) | birthday | assignee | location |
amount (money) | count | status | note (anything else).
value: for due_date and birthday copy the date words exactly as written ("the 21st", "12 November",
"next Friday"); never calculate a date. Otherwise the person, place, number, status or a short note.
Only the current value: skip what is being replaced ("instead of X", "not 2").
Usually one claim per message, at most 3. Ignore greetings, thanks, praise and sign-offs."""

# Few-shot turns use made-up entities so they can't leak into real answers.
_FEW_SHOT_KNOWN = "Bose anniversary film; Iyer product shoot; Gupta reception highlights; Meher"
FEW_SHOT = [
    ("note", "Bose film delivery pushed to the 21st, Kunal is doing the grade.",
     [("Bose anniversary film", "due_date", "the 21st"), ("Bose anniversary film", "assignee", "Kunal")]),
    ("whatsapp", "Iyer shoot shifts to Film City gate 2 instead of Goregaon. Need 4 reels from it, not 3.",
     [("Iyer product shoot", "location", "Film City gate 2"), ("Iyer product shoot", "count", "4")]),
    ("email", "Hi team,\n\nThanks for the teaser, everyone at home loved it.\n\nConfirming the "
              "highlights for the Gupta reception are due on 12 November.\n\nWarm regards,\nAnil Gupta",
     [("Gupta reception highlights", "due_date", "12 November")]),
    ("note", "Salary credited, 58k. Meher's birthday is next Friday.",
     [("Salary", "amount", "58k"), ("Meher", "birthday", "next Friday")]),
]


class LLMUnavailable(Exception):
    """Ollama couldn't give a usable answer in time; the caller falls back."""


class _SchemaFormatRejected(Exception):
    pass


# Ollama < 0.5 rejects a JSON-schema `format` and only knows "json". Learn that once per process.
_schema_format_supported: bool | None = None

# A refused connection takes ~2 s to fail on Windows, so after one we skip the LLM for a while
# and every ingest in between goes straight to the fallback.
OLLAMA_RETRY_AFTER_S = 20.0
_llm_down_until = 0.0


def _user_turn(kind: str, text: str, known: str) -> str:
    return f"Known entities: {known}\nSource: {kind}\nMessage: {text}"


def _messages(text: str, kind: str, today: date, known: list[str]) -> list[dict]:
    msgs = [{"role": "system", "content": f"{SYSTEM_PROMPT}\nToday is {today:%A %d %B %Y}."}]
    for shot_kind, shot_text, claims in FEW_SHOT:
        reply = {"claims": [{"entity": e, "attribute": a, "value": v} for e, a, v in claims]}
        msgs.append({"role": "user", "content": _user_turn(shot_kind, shot_text, _FEW_SHOT_KNOWN)})
        msgs.append({"role": "assistant", "content": json.dumps(reply)})
    msgs.append({"role": "user", "content": _user_turn(kind, text, "; ".join(known) or "(none)")})
    return msgs


_FLAT_OBJECT = re.compile(r"\{[^{}\[\]]*\}")


def parse_claims(buf: str) -> list[dict]:
    """Claim objects from (possibly truncated or malformed) model output.

    Claims are flat objects, so each complete `{...}` after `"claims"` parses on its own. This
    survives a cut-off stream and the duplicated keys llama3.2 sometimes emits in plain JSON mode.
    """
    start = buf.find("[", buf.find('"claims"'))
    if start < 0:
        return []
    out = []
    for m in _FLAT_OBJECT.finditer(buf, start):
        try:
            obj = json.loads(m[0])
        except ValueError:
            continue
        if isinstance(obj, dict):
            out.append(obj)
    return out


def _claims_array_closed(buf: str) -> bool:
    """True once the first `claims` array has been closed (string-aware bracket scan)."""
    start = buf.find("[", buf.find('"claims"'))
    if start < 0:
        return False
    depth, in_str, esc = 0, False, False
    for ch in buf[start:]:
        if in_str:
            esc, in_str = (False, in_str) if esc else (ch == "\\", ch != '"')
            continue
        if ch == '"':
            in_str = True
        elif ch in "[{":
            depth += 1
        elif ch in "]}":
            depth -= 1
            if depth == 0:
                return True
    return False


def _stream_chat(cfg, messages: list[dict], fmt, deadline: float) -> str:
    """Stream the reply; stop at the deadline, when the claims array closes, or at MAX_CLAIMS."""
    url = getattr(cfg, "ollama_url", "http://localhost:11434").rstrip("/") + "/api/chat"
    body = {
        "model": getattr(cfg, "ollama_model", "llama3.2"),
        "messages": messages,
        "stream": True,
        "format": fmt,
        "keep_alive": KEEP_ALIVE,
        "options": {"temperature": 0, "num_predict": 200},
    }
    buf = ""
    timeout = httpx.Timeout(LLM_TIMEOUT_S, connect=1.0)
    with httpx.stream("POST", url, json=body, timeout=timeout) as r:
        if r.status_code == 400:
            detail = r.read().decode("utf-8", "replace")
            if "format" in detail:
                raise _SchemaFormatRejected(detail)
        r.raise_for_status()
        for line in r.iter_lines():
            if not line:
                continue
            chunk = json.loads(line)
            buf += chunk.get("message", {}).get("content", "")
            if chunk.get("done") or _claims_array_closed(buf):
                break
            if len(_FLAT_OBJECT.findall(buf)) >= MAX_CLAIMS or time.monotonic() > deadline:
                break
    return buf


def _ask_llm(text: str, kind: str, cfg, today: date, known: list[str]) -> list[dict]:
    global _schema_format_supported, _llm_down_until
    if time.monotonic() < _llm_down_until:
        raise LLMUnavailable("ollama unreachable recently; not retrying yet")
    messages = _messages(text, kind, today, known)
    deadline = time.monotonic() + LLM_TIMEOUT_S
    try:
        buf = None
        if _schema_format_supported is not False:
            try:
                buf = _stream_chat(cfg, messages, LLM_SCHEMA, deadline)
                _schema_format_supported = True
            except _SchemaFormatRejected:
                _schema_format_supported = False
                log.info("extract: this Ollama only accepts format='json'; schema stays in the prompt")
        if buf is None:
            buf = _stream_chat(cfg, messages, "json", deadline)
    except (httpx.ConnectError, httpx.ConnectTimeout) as e:
        _llm_down_until = time.monotonic() + OLLAMA_RETRY_AFTER_S
        raise LLMUnavailable(f"ollama unreachable: {type(e).__name__}") from e
    except (httpx.HTTPError, ValueError) as e:
        raise LLMUnavailable(f"ollama: {type(e).__name__}: {e}") from e
    claims = parse_claims(buf)
    if not claims:
        late = " (deadline hit)" if time.monotonic() > deadline else ""
        raise LLMUnavailable(f"no parseable claims in model output{late}: {buf[:120]!r}")
    return claims


def _drafts_from_llm(claims: list[dict], text: str, today: date, known: list[str]) -> list[dict]:
    drafts = []
    for c in claims[:MAX_CLAIMS]:
        attribute = str(c.get("attribute") or "")
        raw_value = str(c.get("value") or "")
        if not _grounded(attribute, raw_value, text):
            continue
        entity = _canonical_entity(str(c.get("entity") or ""), text, known)
        d = build_draft(entity, None, attribute, raw_value, text, today, known)
        if d:
            drafts.append(d)
    # A free-text note is only worth a point when nothing more specific came out of the message.
    if any(d["attribute"] != "note" for d in drafts):
        drafts = [d for d in drafts if d["attribute"] != "note"]
    return _dedupe(drafts)


def warm_up(cfg) -> bool:
    """Ask Ollama to load the model now (an empty chat loads it), so the first ingest is fast."""
    url = getattr(cfg, "ollama_url", "http://localhost:11434").rstrip("/") + "/api/chat"
    try:
        r = httpx.post(url, json={"model": getattr(cfg, "ollama_model", "llama3.2"),
                                  "messages": [], "keep_alive": KEEP_ALIVE}, timeout=60)
        return r.status_code == 200
    except httpx.HTTPError:
        return False


# ---------------------------------------------------------------------------------------------
# Deterministic fallback
# ---------------------------------------------------------------------------------------------

_AMOUNT_RE = re.compile(
    r"(?:₹|rs\.?|inr)\s*\d[\d,]*(?:\.\d+)?\s*(?:k|l|lakhs?|lac|cr|crore)?\b"
    r"|\b\d[\d,]*(?:\.\d+)?\s*(?:k|lakhs?|lac|crore)\b",
    re.IGNORECASE,
)
_COUNT_RE = re.compile(
    r"\b(\d{1,3}|two|three|four|five|six|seven|eight|nine|ten)\s+"
    r"(cutdowns?|reels?|edits?|videos?|cameras?|songs?|versions?|films?|teasers?|shorts)\b",
    re.IGNORECASE,
)
_ASSIGNEE_RE = re.compile(
    rf"\b({'|'.join(TEAM)})\b\s+(?:is|will|'ll|to)\s+(?:be\s+)?(?:doing|handling|editing|"
    rf"shooting|cutting|take|taking|own|owning|handle|lead|leading|on)\b"
    rf"|\bassign(?:ed)?\s+(?:it\s+)?to\s+({'|'.join(TEAM)})\b",
    re.IGNORECASE,
)
_DEADLINE_HINT = re.compile(
    r"\b(due|deadline|deliver\w*|by|moves?|moved|pushed|shift\w*|postponed|preponed|till|until|"
    r"confirm\w*|reschedul\w*|shoot|is on|are on)\b", re.IGNORECASE)


def _guess_entity(text: str) -> str:
    """A best-effort name for an unknown entity: the first capitalised words, else 'Note'."""
    skip = {"client", "just", "hi", "hey", "the", "also", "ok", "okay", "please", "confirming"}
    for m in re.finditer(r"\b[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*", text):
        words = [w for w in m[0].split()
                 if w.lower() not in skip and w.lower() not in _WEEKDAYS and w.lower() not in _MONTHS]
        if words:
            return " ".join(words[:3])
    return "Note"


def fallback_extract(text: str, today: date, known: list[str]) -> list[dict]:
    """Regex + known entities + resolve_date. Always returns at least one draft for real text."""
    text = (text or "").strip()
    if not text:
        return []
    entity = match_known(text, known)
    subject = entity or _guess_entity(text)
    drafts = []

    dates = find_date_phrases(text)
    if dates and re.search(r"\b(birthday|bday)\b", text, re.I):
        m = re.search(r"\b([A-Z][a-z]+)(?:'s)?\s+(?:birthday|bday)\b", text)
        drafts.append(build_draft(m[1] if m else subject, "person", "birthday", dates[0], text, today, known))
    elif dates and _DEADLINE_HINT.search(text):
        drafts.append(build_draft(subject, None, "due_date", dates[0], text, today, known))
    if m := _AMOUNT_RE.search(text):
        ent = entity or ("Salary" if re.search(r"salary", text, re.I) else subject)
        drafts.append(build_draft(ent, None, "amount", m[0], text, today, known))
    if m := _COUNT_RE.search(text):
        drafts.append(build_draft(subject, None, "count", m[1], text, today, known))
    if m := _ASSIGNEE_RE.search(text):
        drafts.append(build_draft(subject, None, "assignee", m[1] or m[2], text, today, known))

    drafts = [d for d in drafts if d]
    if not drafts:
        drafts = [build_draft(subject, None, "note", text[:200], text, today, known)]
    return _dedupe([d for d in drafts if d])


# ---------------------------------------------------------------------------------------------
# Entry points
# ---------------------------------------------------------------------------------------------


def _today(cfg) -> date:
    t = getattr(cfg, "today", None)
    if isinstance(t, date):
        return t
    if isinstance(t, str):
        return date.fromisoformat(t)
    return date.today()


def _source_kind(source) -> str:
    if isinstance(source, dict):
        return str(source.get("kind") or "note")
    return str(source or "note")


def extract_with_meta(text: str, source, cfg, known_entities: list[str]) -> tuple[list[dict], str]:
    """Drafts plus which path produced them: "llm" or "fallback"."""
    today = _today(cfg)
    known = [k for k in (known_entities or []) if isinstance(k, str) and k.strip()]
    if not (text or "").strip():
        return [], "fallback"
    try:
        claims = _ask_llm(text, _source_kind(source), cfg, today, known)
        drafts = _drafts_from_llm(claims, text, today, known)
        if drafts:
            return drafts, "llm"
        log.info("extract: model output had no valid claims, using fallback")
    except LLMUnavailable as e:
        log.info("extract: %s, using fallback", e)
    return fallback_extract(text, today, known), "fallback"


def extract(text: str, source, cfg, known_entities: list[str]) -> list[dict]:
    """Claim drafts {text, entity, entity_kind, attribute, value, value_label, tier}."""
    return extract_with_meta(text, source, cfg, known_entities)[0]
