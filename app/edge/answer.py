"""Templated, always-cited answers over retrieved claims (no LLM on this path)."""
import re
from datetime import date, timedelta

from edge.config import DISPLAY_NAMES, first_name

DUE_QUESTION = re.compile(r"\b(due|this week|deadlines?)\b", re.IGNORECASE)
MENTIONS_CALL = re.compile(r"\bcall(ed|ing)?\b", re.IGNORECASE)
LIVE = ("active", "disputed")
TOP_HITS = 3
SOURCE_NOUNS = {"email": "email", "whatsapp": "WhatsApp message", "note": "note", "resolution": "decision"}


def compose(question: str, hits: list, conflicts: list[dict], cfg, all_claims: list[dict] | None = None) -> dict:
    """hits: [(claim, score)] from hybrid search. all_claims (already filtered to the asker's view)
    lets "due this week" questions see deadlines the search didn't rank."""
    claims = [c for c, _ in hits if c.get("status") in LIVE]
    parts: list[str] = []
    cited: list[dict] = []

    disputed = next((c for c in claims if c.get("status") == "disputed"), None)
    conflict = None
    if disputed is not None:
        conflict = next((x for x in conflicts if x["conflict_id"] == disputed.get("conflict_id")), None)
        pair = sorted(
            (c for c in claims if c.get("conflict_id") == disputed.get("conflict_id") and c.get("status") == "disputed"),
            key=side_order,
        )
        parts.append(_disputed_sentence(pair, conflict, disputed, cfg))
        cited += pair

    if DUE_QUESTION.search(question):
        pool = [c for c in claims + list(all_claims or []) if c.get("status") in LIVE]
        due = [c for c in _due_within_week(pool, cfg.today) if c.get("status") != "disputed"]
        parts.append(_due_sentence(due, pool, lead=disputed is None))
        cited += due
    elif disputed is None and claims:
        top = claims[:TOP_HITS]
        parts.append(" ".join(_as_sentence(c["text"]) for c in top))
        cited += top

    if not parts:
        parts.append("I don't have anything on that yet.")
    return {
        "answer": " ".join(parts),
        "citations": _citations(cited),
        "disputed": disputed is not None,
        "conflict_id": disputed.get("conflict_id") if disputed is not None else None,
    }


# ---- disputed lead ---------------------------------------------------------------------------


def _disputed_sentence(pair: list[dict], conflict: dict | None, disputed: dict, cfg) -> str:
    sides = "; ".join(f"{source_phrase(c)} says {label(c)}" for c in pair)
    owner = (conflict or {}).get("owner") or disputed.get("owner") or cfg.device
    if owner == cfg.device:
        tail = f"{first_name(owner)} owns this. Settle it?"
    else:
        tail = f"{first_name(owner)} owns this. Waiting for {first_name(owner)}."
    return f"Disputed: {sides}. {tail}"


def side_order(claim: dict) -> tuple:
    """Outside sources (the client's email) before teammates' notes, then by time, so the sentence
    reads the same whichever side happened to be captured first."""
    src = claim.get("source") or {}
    internal = src.get("kind") == "note" or _is_teammate(src.get("author") or "")
    return (internal, claim.get("stated_at") or "", claim["claim_id"])


def source_phrase(claim: dict) -> str:
    """"the client's email", "Tanishk's note from the call", "Riya's WhatsApp message"."""
    src = claim.get("source") or {}
    kind = src.get("kind", "note")
    author = src.get("author") or ""
    noun = SOURCE_NOUNS.get(kind, kind)
    if kind == "note" or _is_teammate(author):
        who = first_name(claim.get("captured_by") or author)
        phrase = f"{who}'s {noun}"
    elif kind == "email" or author.lower().startswith("client"):
        phrase = f"the client's {noun}"
    else:
        phrase = f"{author.split('<')[0].strip() or 'someone'}'s {noun}"
    if kind == "note" and MENTIONS_CALL.search(f"{author} {src.get('excerpt', '')}"):
        phrase += " from the call"
    return phrase


def _is_teammate(author: str) -> bool:
    name = author.split("<")[0].strip().lower()
    return name in DISPLAY_NAMES or any(name == first_name(d).lower() for d in DISPLAY_NAMES)


# ---- due this week ---------------------------------------------------------------------------


def _due_within_week(claims: list[dict], today: date) -> list[dict]:
    end = today + timedelta(days=7)
    seen, due = set(), []
    for c in claims:
        if c.get("attribute") != "due_date" or c["claim_id"] in seen:
            continue
        d = _parse_date(c.get("value"))
        if d is not None and today <= d <= end:
            seen.add(c["claim_id"])
            due.append(c)
    return sorted(due, key=lambda c: (c["value"], c.get("entity", "")))


def _due_sentence(due: list[dict], pool: list[dict], lead: bool) -> str:
    if not due:
        return "Nothing is due this week." if lead else "Nothing else is due this week."
    counts = {c["entity"].strip().lower(): c["value"] for c in pool if c.get("attribute") == "count"}
    items = []
    for c in due:
        n = counts.get(c["entity"].strip().lower())
        suffix = f" ({n} of them)" if n not in (None, "", 1, "1") else ""
        items.append(f"{c['entity']}{suffix} on {label(c)}")
    things = "1 thing is" if len(due) == 1 else f"{len(due)} things are"
    more = "" if lead else "Also, "
    return f"{more}{things} due this week: {_join(items)}."


# ---- helpers ---------------------------------------------------------------------------------


def _citations(claims: list[dict]) -> list[dict]:
    seen, out = set(), []
    for c in claims:
        if c["claim_id"] in seen:
            continue
        seen.add(c["claim_id"])
        src = c.get("source") or {}
        out.append({
            "claim_id": c["claim_id"],
            "kind": src.get("kind"),
            "author": src.get("author"),
            "excerpt": src.get("excerpt") or c.get("text"),
            "at": src.get("at") or c.get("stated_at"),
        })
    return out


def label(claim: dict) -> str:
    if claim.get("value_label"):
        return claim["value_label"]
    d = _parse_date(claim.get("value"))
    return f"{d.day} {d:%b}" if d else str(claim.get("value"))


def _parse_date(value) -> date | None:
    try:
        return date.fromisoformat(str(value))
    except ValueError:
        return None


def _as_sentence(text: str) -> str:
    text = text.strip()
    return text if text.endswith((".", "!", "?")) else text + "."


def _join(items: list[str]) -> str:
    return items[0] if len(items) == 1 else ", ".join(items[:-1]) + " and " + items[-1]
