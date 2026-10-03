"""Source parsers (WhatsApp exports, fixture inbox) and the integrity of every demo fixture."""
import json
import re
from datetime import date, datetime
from pathlib import Path

from edge.extract import resolve_date
from edge.sources import load_emails, parse_whatsapp

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures"

IOS_EXPORT = (
    "‎[02/10/26, 10:14:02 AM] Mehta Diwali reels: ‎Messages and calls are end-to-end encrypted.\n"
    "[02/10/26, 10:16:40 AM] Karan Mehta: Hi team! Loved the Diwali collection shoot\n"
    "[02/10/26, 10:17:05 AM] Karan Mehta: ‎image omitted\n"
    "[02/10/26, 7:40:12 PM] Karan Mehta: Small change. Marketing wants one more for YouTube Shorts.\n"
    "So 3 cutdowns total, not 2.\n"
    "\n"
    "Same 30 sec\n"
    "[02/10/26, 7:44:30 PM] Lakshya: Done, 3 cutdowns by 6 Oct\n"
)


def test_parse_whatsapp_android_fixture():
    msgs = parse_whatsapp((FIXTURES / "whatsapp_mehta.txt").read_text(encoding="utf-8"), chat="mehta-diwali-reels")
    # 3 system lines and one "<Media omitted>" are dropped
    assert [m["author"] for m in msgs] == ["Karan Mehta", "Karan Mehta", "Lakshya", "Tushar", "Karan Mehta", "Lakshya"]
    assert all(m["kind"] == "whatsapp" for m in msgs)
    change = msgs[4]
    assert change["at"] == "2026-10-02T19:40:00+05:30"
    assert change["ref"] == "whatsapp:mehta-diwali-reels:2026-10-02T19:40"
    assert change["text"].splitlines() == [
        "Small change. Marketing wants one more for YouTube Shorts.",
        "So 3 cutdowns total, not 2.",
        "Same 30 sec, but the third one should open on the necklace close-up",
    ]
    assert msgs[-1]["text"].startswith("Done, 3 cutdowns by 6 Oct")


def test_parse_whatsapp_ios_export():
    msgs = parse_whatsapp(IOS_EXPORT, chat="mehta")
    assert [m["author"] for m in msgs] == ["Karan Mehta", "Karan Mehta", "Lakshya"]
    assert msgs[1]["at"] == "2026-10-02T19:40:12+05:30"
    assert msgs[1]["text"] == ("Small change. Marketing wants one more for YouTube Shorts.\n"
                               "So 3 cutdowns total, not 2.\n\nSame 30 sec")
    assert msgs[0]["at"] == "2026-10-02T10:16:40+05:30"


def test_parse_whatsapp_android_12h_and_same_minute_refs():
    txt = ("03/10/2026, 2:02 pm - Tanishk: Client just called\n"
           "03/10/2026, 2:02 pm - Tanishk: Sharma delivery moves to the 18th.\n"
           "03/10/2026, 12:05 am - Aayat: late one\n")
    msgs = parse_whatsapp(txt, chat="crew")
    assert [m["at"] for m in msgs] == ["2026-10-03T14:02:00+05:30", "2026-10-03T14:02:00+05:30",
                                       "2026-10-03T00:05:00+05:30"]
    assert len({m["ref"] for m in msgs}) == 3
    assert msgs[1]["ref"] == "whatsapp:crew:2026-10-03T14:02#2"


def test_parse_whatsapp_ignores_preamble_and_empty_input():
    assert parse_whatsapp("") == []
    assert parse_whatsapp("not a chat export\nat all") == []
    assert parse_whatsapp("﻿03/10/2026, 09:00 - Lakshya: morning")[0]["text"] == "morning"


def test_load_emails_fixture_and_custom_file(data_dir):
    [msg] = load_emails(FIXTURES / "inbox_lakshya.json")
    assert msg["kind"] == "email" and msg["ref"] == "email:eml_sharma_final_delivery"
    assert msg["author"].startswith("Rohit Sharma")
    assert "final delivery of the Sharma wedding edit on 16 October" in msg["text"]
    assert msg["id"] == "eml_sharma_final_delivery" and msg["subject"]

    p = data_dir / "inbox.json"
    p.write_text(json.dumps([{"id": "e1", "from": "a@b", "subject": "s", "text": "t", "at": "2026-10-03T10:00:00+05:30"}]),
                 encoding="utf-8")
    assert load_emails(p)[0]["ref"] == "email:e1"
    assert load_emails(FIXTURES / "inbox_tanishk.json") == []


# ----------------------------------------------------------------------------------------------
# Fixture integrity
# ----------------------------------------------------------------------------------------------

CLAIM_KEYS = {"claim_id", "text", "entity", "entity_kind", "attribute", "value", "value_label", "owner",
              "source", "stated_at", "captured_by", "device_id", "tier", "status", "conflict_id",
              "resolves", "version", "modified_at", "modified_by"}
TODAY_MS = int(datetime.fromisoformat("2026-10-03T00:00:00+05:30").timestamp() * 1000)


def _seed():
    return json.loads((FIXTURES / "seed.json").read_text(encoding="utf-8"))


def test_seed_claims_follow_the_contract_schema():
    seed = _seed()
    assert set(seed) == {"shared", "tanishk", "lakshya"}
    claims = [c for part in seed.values() for c in part]
    assert len({c["claim_id"] for c in claims}) == len(claims)
    for c in claims:
        assert set(c) == CLAIM_KEYS, c["claim_id"]
        assert re.fullmatch(r"clm_[0-9a-f]{12}", c["claim_id"])
        assert set(c["source"]) == {"kind", "ref", "author", "excerpt", "at"}
        assert c["entity_kind"] in {"task", "person", "project", "event", "note"}
        assert c["attribute"] in {"due_date", "birthday", "assignee", "location", "amount", "count", "status", "note"}
        assert c["tier"] in {"device", "my_devices", "team"}
        assert (c["status"], c["version"], c["conflict_id"], c["resolves"]) == ("active", 1, None, None)
        assert c["modified_by"] == c["captured_by"] and c["device_id"] == f"dev_{c['captured_by']}"
        assert isinstance(c["modified_at"], int) and c["modified_at"] < TODAY_MS
        assert c["source"]["at"] == c["stated_at"]
        if c["attribute"] in ("due_date", "birthday"):
            assert date.fromisoformat(c["value"])


def test_seed_tiers_and_privacy():
    seed = _seed()
    assert all(c["tier"] == "team" for c in seed["shared"])
    assert 14 <= len(seed["shared"]) <= 20
    for person in ("tanishk", "lakshya"):
        mine = seed[person]
        assert all(c["captured_by"] == person for c in mine)
        assert 2 <= sum(c["tier"] == "device" for c in mine) <= 3
        assert any(c["entity"] == "Salary" and c["tier"] == "device" for c in mine)
    [bday] = [c for part in seed.values() for c in part if c["tier"] == "my_devices"]
    assert (bday["entity"], bday["attribute"], bday["value"]) == ("Riya", "birthday", "2026-10-09")


def test_seed_demo_shape():
    shared = _seed()["shared"]
    sharma = [c for c in shared if c["entity"] == "Sharma wedding edit"]
    assert {c["attribute"] for c in sharma} >= {"assignee", "location"}
    assert all(c["attribute"] != "due_date" for c in sharma)  # the demo creates two
    assert all(c["owner"] == "tanishk" and c["entity_kind"] == "task" for c in sharma)
    due_this_week = sorted(c["value"] for c in shared
                           if c["attribute"] == "due_date" and "2026-10-03" <= c["value"] <= "2026-10-10")
    assert len(due_this_week) == 3
    [count] = [c for c in shared if c["entity"] == "Mehta reel cutdowns" and c["attribute"] == "count"]
    assert count["value"] == "3"
    clients = " ".join(c["entity"] for c in shared)
    for client in ("Sharma", "Mehta", "Kapoor", "Pangong"):
        assert client in clients


def test_demo_inputs_and_inbox_fixtures():
    demo = json.loads((FIXTURES / "demo_inputs.json").read_text(encoding="utf-8"))
    assert demo == {"tanishk_note": "Client just called: Sharma delivery moves to the 18th."}
    [email] = json.loads((FIXTURES / "inbox_lakshya.json").read_text(encoding="utf-8"))
    assert set(email) == {"id", "from", "subject", "text", "at"}
    assert resolve_date("16 October", date(2026, 10, 3)) == "2026-10-16"


def test_whatsapp_fixture_says_three_cutdowns_last():
    msgs = parse_whatsapp((FIXTURES / "whatsapp_mehta.txt").read_text(encoding="utf-8"))
    karan = [m for m in msgs if m["author"] == "Karan Mehta"]
    assert "3 cutdowns" in karan[-1]["text"]


def test_fixtures_avoid_banned_words():
    for path in FIXTURES.iterdir():
        text = path.read_text(encoding="utf-8").lower()
        assert "jarvis" not in text and "adhd" not in text, path.name
