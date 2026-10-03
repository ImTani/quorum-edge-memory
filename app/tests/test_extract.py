"""Extraction: date resolution, entity snapping, tiers, LLM output handling and the fallback.

Deterministic by default. Set QUORUM_LIVE_LLM=1 to also run the demo inputs through the real
Ollama (llama3.2 must already be installed; nothing is pulled).
"""
import json
import os
import time
from datetime import date
from pathlib import Path
from types import SimpleNamespace

import pytest

from edge import extract as ex
from edge.extract import (decide_tier, extract, extract_with_meta, find_date_phrases, match_known,
                          parse_claims, resolve_date)

TODAY = date(2026, 10, 3)  # a Saturday
FIXTURES = Path(__file__).resolve().parents[1] / "fixtures"
KNOWN = ["Sharma wedding edit", "Mehta reel cutdowns", "Kapoor invoice", "Pangong lake shoot",
         "Ladakh drone permit", "Riya", "Salary", "Kabir"]
NOTE = json.loads((FIXTURES / "demo_inputs.json").read_text(encoding="utf-8"))["tanishk_note"]
EMAIL = json.loads((FIXTURES / "inbox_lakshya.json").read_text(encoding="utf-8"))[0]["text"]


def cfg(url="http://127.0.0.1:9"):  # port 9 (discard): nothing listens, so connect is refused
    return SimpleNamespace(today=TODAY, ollama_url=url, ollama_model="llama3.2")


@pytest.fixture(autouse=True)
def fresh_llm_state(monkeypatch):
    """Each test starts with no memory of earlier Ollama failures or format support."""
    monkeypatch.setattr(ex, "_llm_down_until", 0.0)
    monkeypatch.setattr(ex, "_schema_format_supported", None)


@pytest.mark.parametrize("phrase, expected", [
    ("the 18th", "2026-10-18"),
    ("18th", "2026-10-18"),
    ("moves to the 18th", "2026-10-18"),
    ("the 2nd", "2026-11-02"),          # past this month -> next month
    ("the 3rd", "2026-10-03"),          # today counts
    ("16 October", "2026-10-16"),
    ("16th of October", "2026-10-16"),
    ("Oct 16", "2026-10-16"),
    ("October 16th, 2026", "2026-10-16"),
    ("on 16 Oct", "2026-10-16"),
    ("16/10", "2026-10-16"),
    ("16/10/2026", "2026-10-16"),
    ("16-10-26", "2026-10-16"),
    ("2026-10-16", "2026-10-16"),
    ("2 Jan", "2027-01-02"),            # long past this year -> next year
    ("28 Sep", "2026-09-28"),           # recently past stays this year
    ("today", "2026-10-03"),
    ("tomorrow", "2026-10-04"),
    ("day after tomorrow", "2026-10-05"),
    ("Friday", "2026-10-09"),
    ("this Friday", "2026-10-09"),
    ("Saturday", "2026-10-03"),         # nearest including today
    ("next Monday", "2026-10-05"),      # Monday of next Mon-Sun week
    ("next Friday", "2026-10-09"),
    ("next Saturday", "2026-10-10"),
    ("next week", "2026-10-05"),
    ("end of the week", "2026-10-04"),  # Friday has passed on a Saturday -> Sunday
    ("end of next week", "2026-10-09"),
    ("end of the month", "2026-10-31"),
    ("in 3 days", "2026-10-06"),
    ("in two weeks", "2026-10-17"),
    ("31 Feb", None),
    ("the 31st", "2026-10-31"),
    ("someday", None),
    ("", None),
    (None, None),
])
def test_resolve_date(phrase, expected):
    assert resolve_date(phrase, TODAY) == expected


def test_resolve_date_bare_day_rolls_over_month_end():
    assert resolve_date("the 31st", date(2026, 11, 5)) == "2026-12-31"
    assert resolve_date("the 2nd", date(2026, 12, 20)) == "2027-01-02"


def test_find_date_phrases_reads_in_order_without_overlap():
    text = "Kapoor pays by Friday; Pangong shoot on 14 October, crew leaves the 11th"
    assert find_date_phrases(text) == ["Friday", "14 October", "the 11th"]
    assert find_date_phrases("Need 3 cutdowns, 30 sec each") == []


@pytest.mark.parametrize("mention, expected", [
    ("Sharma delivery", "Sharma wedding edit"),
    ("the Sharma wedding", "Sharma wedding edit"),
    ("Mehta reels", "Mehta reel cutdowns"),
    ("Pangong drone permits", "Pangong lake shoot"),  # only Pangong is distinctive in that list
    ("Ladakh drone permit", "Ladakh drone permit"),
    ("delivery", None),                                # generic words never match on their own
    ("Bajaj launch film", None),
])
def test_match_known(mention, expected):
    assert match_known(mention, KNOWN) == expected


@pytest.mark.parametrize("text, attribute, entity, tier", [
    ("Client just called: Sharma delivery moves to the 18th.", "due_date", "Sharma wedding edit", "team"),
    ("Pangong shoot moves to Monday", "due_date", "Pangong lake shoot", "team"),
    ("Riya's birthday is on 9 October", "birthday", "Riya", "my_devices"),
    ("Salary credited, 62k", "amount", "Salary", "device"),
    ("Kabir got into FTII! Don't tell anyone", "note", "Kabir", "device"),
    ("Dentist on 7 Oct", "due_date", "Dentist appointment", "device"),
    ("Bought a new phone", "note", "Phone", "device"),  # unsure -> device
])
def test_decide_tier(text, attribute, entity, tier):
    assert decide_tier(text, attribute, entity, KNOWN) == tier


def test_fallback_handles_both_demo_inputs_when_ollama_is_down():
    t = time.perf_counter()
    note, path = extract_with_meta(NOTE, {"kind": "note"}, cfg(), KNOWN)
    assert time.perf_counter() - t < ex.LLM_TIMEOUT_S  # a refused connect is slow-ish on Windows
    assert path == "fallback"
    assert [(d["entity"], d["attribute"], d["value"], d["value_label"], d["tier"]) for d in note] == [
        ("Sharma wedding edit", "due_date", "2026-10-18", "18 Oct", "team")]
    assert note[0]["text"] == "Sharma wedding edit delivery is due 18 Oct"
    assert note[0]["entity_kind"] == "task"

    t = time.perf_counter()
    email, path = extract_with_meta(EMAIL, {"kind": "email"}, cfg(), KNOWN)
    assert time.perf_counter() - t < 0.5  # circuit open: no second connect attempt
    assert path == "fallback"
    assert [(d["entity"], d["attribute"], d["value"], d["tier"]) for d in email] == [
        ("Sharma wedding edit", "due_date", "2026-10-16", "team")]


def test_extract_returns_drafts_only():
    drafts = extract(NOTE, "note", cfg(), KNOWN)
    assert isinstance(drafts, list) and drafts[0]["value"] == "2026-10-18"
    assert set(drafts[0]) == {"text", "entity", "entity_kind", "attribute", "value", "value_label", "tier"}


@pytest.mark.parametrize("text, expected", [
    ("Salary credited today, 62k", [("Salary", "amount", "62000", "device")]),
    ("Riya's birthday is on 9 October", [("Riya", "birthday", "2026-10-09", "my_devices")]),
    ("Karan Mehta: so 3 cutdowns total, not 2", [("Mehta reel cutdowns", "count", "3", "team")]),
    ("Aayat will handle the Kapoor invoice", [("Kapoor invoice", "assignee", "aayat", "team")]),
    ("Kapoor invoice: ₹1,85,000 due by Friday",
     [("Kapoor invoice", "due_date", "2026-10-09", "team"), ("Kapoor invoice", "amount", "185000", "team")]),
])
def test_fallback_varied(text, expected):
    drafts = ex.fallback_extract(text, TODAY, KNOWN)
    assert [(d["entity"], d["attribute"], d["value"], d["tier"]) for d in drafts] == expected


def test_fallback_names_an_unnamed_note_from_its_own_words():
    """Never the shared placeholder "Note": two unrelated deadlines would key-match at 1.00."""
    a = ex.fallback_extract("pick up the hard drives from the rental by 7 Oct", TODAY, KNOWN)
    b = ex.fallback_extract("need to deliver the colour grade samples by 9 Oct", TODAY, KNOWN)
    assert [(d["entity"], d["attribute"], d["value"]) for d in a] == [("Hard drives rental", "due_date", "2026-10-07")]
    assert [(d["entity"], d["attribute"], d["value"]) for d in b] == [("Colour grade samples", "due_date", "2026-10-09")]


@pytest.mark.parametrize("a, b, same", [
    ("Sharma wedding edit", "Sharma delivery", True),
    ("Sharma wedding edit", "Sharma wedding edit", True),
    ("Drone permit", "Ladakh drone permit", True),     # a generic multi-word name inside the other
    ("Hard drives rental", "Colour grade samples", False),
    ("Note", "Note", False),                           # a placeholder identifies nothing
    ("Delivery", "Sharma delivery", False),
    ("Mehta reel cutdowns", "Sharma wedding edit", False),
])
def test_same_subject(a, b, same):
    assert ex.same_subject(a, b) is same


def test_fallback_always_returns_a_note_for_unstructured_text():
    drafts = ex.fallback_extract("Great energy on set today, everyone!", TODAY, KNOWN)
    assert len(drafts) == 1 and drafts[0]["attribute"] == "note"
    assert ex.fallback_extract("   ", TODAY, KNOWN) == []


def test_parse_claims_survives_truncation_and_duplicate_keys():
    truncated = '{"claims": [{"entity": "Sharma", "attribute": "due_date", "value": "the 18th"}, {"entity": "Sha'
    assert parse_claims(truncated) == [{"entity": "Sharma", "attribute": "due_date", "value": "the 18th"}]
    dup = ('{"claims": [{"entity": "A", "attribute": "note", "value": "x"}], \n "claims": '
           '[{"entity": "B", "attribute": "note", "value": "y"}]}')
    assert [c["entity"] for c in parse_claims(dup)] == ["A", "B"]
    assert parse_claims("not json at all") == []


def test_claims_array_closed():
    assert not ex._claims_array_closed('{"claims": [{"entity": "a]"')
    assert ex._claims_array_closed('{"claims": [{"entity": "a]", "value": "x"}]')


def _fake_llm(monkeypatch, claims):
    monkeypatch.setattr(ex, "_ask_llm", lambda *a, **k: claims)


def test_llm_entity_snapped_and_date_arithmetic_ignored(monkeypatch):
    # The model paraphrases the entity and "helpfully" computes a wrong date.
    _fake_llm(monkeypatch, [{"entity": "Sharma delivery", "attribute": "due_date", "value": "2026-10-19"}])
    drafts, path = extract_with_meta(NOTE, {"kind": "note"}, cfg(), KNOWN)
    assert path == "llm"
    assert [(d["entity"], d["value"], d["tier"]) for d in drafts] == [("Sharma wedding edit", "2026-10-18", "team")]


def test_llm_invented_date_is_dropped_then_fallback(monkeypatch):
    # A message with no date in it must never produce a date claim, whatever the model says.
    _fake_llm(monkeypatch, [{"entity": "Riya", "attribute": "birthday", "value": "9 October"}])
    drafts, path = extract_with_meta("Riya loved the edit", {"kind": "note"}, cfg(), KNOWN)
    assert path == "fallback"
    assert all(d["attribute"] not in ("birthday", "due_date") for d in drafts)


def test_llm_borrowed_fewshot_entity_is_renamed_from_message(monkeypatch):
    _fake_llm(monkeypatch, [{"entity": "Bose anniversary film", "attribute": "due_date",
                             "value": "end of next week"}])
    drafts, _ = extract_with_meta("Bajaj Auto wants a launch film by end of next week", "email", cfg(), KNOWN)
    assert drafts[0]["entity"] == "Bajaj Auto" and drafts[0]["value"] == "2026-10-09"


def test_llm_ungrounded_values_and_notes_dropped(monkeypatch):
    _fake_llm(monkeypatch, [
        {"entity": "Sharma wedding edit", "attribute": "due_date", "value": "16 October"},
        {"entity": "Sharma wedding edit", "attribute": "assignee", "value": "Tushar"},  # not in text
        {"entity": "Sharma wedding edit", "attribute": "assignee", "value": "OK"},      # not a person
        {"entity": "Sharma wedding edit", "attribute": "note", "value": "haldi sequence"},
    ])
    drafts, path = extract_with_meta(EMAIL, {"kind": "email"}, cfg(), KNOWN)
    assert path == "llm"
    assert [(d["attribute"], d["value"]) for d in drafts] == [("due_date", "2026-10-16")]


def test_llm_invalid_attribute_falls_back(monkeypatch):
    _fake_llm(monkeypatch, [{"entity": "Sharma wedding edit", "attribute": "attribute", "value": ""}])
    drafts, path = extract_with_meta(NOTE, {"kind": "note"}, cfg(), KNOWN)
    assert path == "fallback" and drafts[0]["value"] == "2026-10-18"


def test_schema_format_rejection_retries_with_json(monkeypatch):
    calls = []

    def fake_stream(cfg_, messages, fmt, deadline):
        calls.append(fmt)
        if isinstance(fmt, dict):
            raise ex._SchemaFormatRejected("cannot unmarshal object into ChatRequest.format")
        return '{"claims": [{"entity": "Sharma wedding edit", "attribute": "due_date", "value": "the 18th"}]}'

    monkeypatch.setattr(ex, "_stream_chat", fake_stream)
    drafts, path = extract_with_meta(NOTE, "note", cfg(), KNOWN)
    assert path == "llm" and drafts[0]["value"] == "2026-10-18"
    assert calls == [ex.LLM_SCHEMA, "json"]
    extract_with_meta(NOTE, "note", cfg(), KNOWN)
    assert calls[-1] == "json"  # remembered: no second schema attempt


def test_amount_and_count_labels():
    assert ex.parse_amount("₹1,85,000") == 185000
    assert ex.parse_amount("58k") == 58000
    assert ex.parse_amount("1.85 lakh") == 185000
    assert ex._indian_grouping(185000) == "1,85,000"
    assert ex._indian_grouping(12500000) == "1,25,00,000"
    assert ex.parse_count("three cutdowns") == 3


@pytest.mark.skipif(os.environ.get("QUORUM_LIVE_LLM") != "1", reason="set QUORUM_LIVE_LLM=1 to hit Ollama")
@pytest.mark.parametrize("text, kind, value", [(NOTE, "note", "2026-10-18"), (EMAIL, "email", "2026-10-16")])
def test_live_demo_inputs(text, kind, value):
    live = SimpleNamespace(today=TODAY, ollama_url="http://localhost:11434", ollama_model="llama3.2")
    ex.warm_up(live)
    drafts, path = extract_with_meta(text, {"kind": kind}, live, KNOWN)
    due = [d for d in drafts if d["attribute"] == "due_date"]
    assert [(d["entity"], d["value"], d["tier"]) for d in due] == [("Sharma wedding edit", value, "team")], path
