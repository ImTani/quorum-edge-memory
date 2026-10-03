"""Source parsers: WhatsApp chat exports and the fixture inbox, as uniform messages.

msg = {kind, ref, author, at, text}   (at is ISO 8601 with the IST offset)
"""
from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path

IST = "+05:30"  # exports carry local time without a zone; this crew is in India

# Android: "03/10/2026, 14:02 - Name: text"  (12-hour variants: "2:02 pm", with or without NBSP)
_ANDROID = re.compile(
    r"^(\d{1,2})/(\d{1,2})/(\d{2,4}),\s(\d{1,2}):(\d{2})(?:[\s ]?([aApP])\.?[mM]\.?)?\s-\s(.*)$"
)
# iOS: "[03/10/26, 2:02:11 PM] Name: text"  (often prefixed with a left-to-right mark)
_IOS = re.compile(
    r"^‎?\[(\d{1,2})/(\d{1,2})/(\d{2,4}),?\s(\d{1,2}):(\d{2})(?::(\d{2}))?"
    r"(?:[\s ]?([aApP])\.?[mM]\.?)?\]\s(.*)$"
)
_SENDER = re.compile(r"^([^:]{1,60}?):\s(.*)$", re.DOTALL)

# Placeholders that carry no information for memory.
_SKIP_TEXT = re.compile(
    r"^(<media omitted>|<attached: .*>|(image|video|audio|sticker|gif|document) omitted|"
    r"this message was deleted|you deleted this message|null|missed (voice|video) call)$",
    re.IGNORECASE,
)


def _timestamp(d: str, m: str, y: str, hh: str, mm: str, ss: str | None, ampm: str | None) -> str:
    day, month = int(d), int(m)
    if month > 12 >= day:  # a US-locale export (month first)
        day, month = month, day
    year = int(y) + (2000 if len(y) == 2 else 0)
    hour = int(hh)
    if ampm:
        hour = hour % 12 + (12 if ampm.lower() == "p" else 0)
    dt = datetime(year, month, day, hour, int(mm), int(ss or 0))
    return dt.isoformat() + IST


def _header(line: str):
    """(iso timestamp, rest of line) if `line` starts a new message, else None."""
    if m := _ANDROID.match(line):
        d, mo, y, hh, mm, ampm, rest = m.groups()
        return _timestamp(d, mo, y, hh, mm, None, ampm), rest
    if m := _IOS.match(line):
        d, mo, y, hh, mm, ss, ampm, rest = m.groups()
        return _timestamp(d, mo, y, hh, mm, ss, ampm), rest
    return None


def parse_whatsapp(txt: str, chat: str = "chat") -> list[dict]:
    """Messages from an Android or iOS WhatsApp export.

    Continuation lines belong to the previous message; system lines (encryption notice, "X added
    Y") and media/deleted placeholders are dropped. `chat` names the conversation in each ref.
    """
    raw: list[list] = []  # [at, rest, extra_lines]
    for line in (txt or "").lstrip("﻿").splitlines():
        head = _header(line)
        if head:
            raw.append([head[0], head[1], []])
        elif raw:
            raw[-1][2].append(line)

    msgs, seen_refs = [], set()
    for at, rest, extra in raw:
        m = _SENDER.match(rest)
        if not m:
            continue  # system line: no "Name: " prefix
        author, first = m.group(1).strip().lstrip("‎"), m.group(2)
        if first.startswith("‎"):
            continue  # iOS marks system events and attachments with a left-to-right mark
        text = "\n".join([first, *extra]).strip()
        if not text or _SKIP_TEXT.match(text):
            continue
        ref = f"whatsapp:{chat}:{at[:16]}"
        n = 2
        while ref in seen_refs:  # Android exports have minute resolution
            ref = f"whatsapp:{chat}:{at[:16]}#{n}"
            n += 1
        seen_refs.add(ref)
        msgs.append({"kind": "whatsapp", "ref": ref, "author": author, "at": at, "text": text})
    return msgs


def load_emails(path: str | Path) -> list[dict]:
    """Messages from a fixture inbox: a JSON list of {id, from, subject, text, at}.

    Keeps `id` and `subject` alongside the standard msg keys so the API can show and remove them.
    """
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    return [
        {
            "kind": "email",
            "ref": f"email:{e['id']}",
            "author": e.get("from", ""),
            "at": e.get("at", ""),
            "text": e.get("text", ""),
            "id": e["id"],
            "subject": e.get("subject", ""),
        }
        for e in data
    ]
