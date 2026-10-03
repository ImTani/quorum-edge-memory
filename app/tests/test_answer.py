"""Answers: templated, cited, disputed-first."""
from edge import answer, conflicts
from edge.config import Config
from test_conflicts import ctx, sharma_email, sharma_note  # noqa: F401  (ctx is a fixture)
from test_memory import make_claim

CFG = Config(device="tanishk", port=0)


def _disputed_pair():
    email, note = sharma_email(), sharma_note()
    cid = conflicts.conflict_id_for([email["claim_id"], note["claim_id"]])
    for c in (email, note):
        c.update(status="disputed", conflict_id=cid)
    conflict = {"conflict_id": cid, "claim_ids": sorted([email["claim_id"], note["claim_id"]]),
                "entity": "Sharma wedding edit", "attribute": "due_date", "similarity": 0.9,
                "owner": "tanishk", "status": "open"}
    return email, note, conflict


def test_disputed_hit_leads_the_answer_with_both_sources():
    email, note, conflict = _disputed_pair()
    out = answer.compose("when is the Sharma delivery?", [(note, 0.03), (email, 0.02)], [conflict], CFG)
    assert out["answer"] == ("Disputed: the client's email says 16 Oct; Tanishk's note from the call says 18 Oct. "
                             "Tanishk owns this. Settle it?")
    assert out["disputed"] is True and out["conflict_id"] == conflict["conflict_id"]
    assert [c["kind"] for c in out["citations"]] == ["email", "note"]
    assert out["citations"][0]["excerpt"].startswith("Confirming final delivery")


def test_non_owner_is_told_who_settles_it():
    email, note, conflict = _disputed_pair()
    out = answer.compose("Sharma delivery?", [(email, 0.03), (note, 0.02)], [conflict],
                         Config(device="lakshya", port=0))
    assert out["answer"].startswith("Disputed: ") and out["answer"].endswith("Tanishk owns this. Waiting for Tanishk.")


def test_due_this_week_lists_deadlines_in_date_order_with_counts():
    mehta = make_claim("Mehta reel cutdowns", "due_date", "2026-10-06", "Mehta reel cutdowns due 6 Oct", value_label="6 Oct")
    mehta_count = make_claim("Mehta reel cutdowns", "count", "3", "3 Mehta reel cutdowns", value_label="3")
    kapoor = make_claim("Kapoor invoice", "due_date", "2026-10-05", "Kapoor invoice due 5 Oct", value_label="5 Oct")
    later = make_claim("Pangong shoot", "due_date", "2026-10-20", "Pangong shoot on 20 Oct", value_label="20 Oct")
    gone = make_claim("Old task", "due_date", "2026-10-04", "Old task due 4 Oct", status="superseded")

    out = answer.compose("what's due this week?", [(later, 0.03)], [], CFG,
                         all_claims=[mehta, mehta_count, kapoor, later, gone])

    assert out["answer"] == ("2 things are due this week: Kapoor invoice on 5 Oct and "
                             "Mehta reel cutdowns (3 of them) on 6 Oct.")
    assert [c["claim_id"] for c in out["citations"]] == [kapoor["claim_id"], mehta["claim_id"]]
    assert out["disputed"] is False


def test_other_questions_answer_with_top_hits_and_cite_them():
    a = make_claim("Pangong shoot", "location", "Pangong Tso", "Pangong shoot is at the lake shore")
    b = make_claim("Pangong shoot", "assignee", "lakshya", "Lakshya is leading the Pangong shoot")
    out = answer.compose("where is the Pangong shoot?", [(a, 0.03), (b, 0.02)], [], CFG)
    assert out["answer"] == "Pangong shoot is at the lake shore. Lakshya is leading the Pangong shoot."
    assert {c["claim_id"] for c in out["citations"]} == {a["claim_id"], b["claim_id"]}
    assert set(out["citations"][0]) == {"claim_id", "kind", "author", "excerpt", "at"}


def test_no_hits_says_so_without_inventing_anything():
    out = answer.compose("who won the match?", [], [], CFG)
    assert out == {"answer": "I don't have anything on that yet.", "citations": [], "disputed": False, "conflict_id": None}


def test_asking_about_a_disputed_entity_in_memory_leads_with_disputed(ctx):  # noqa: F811
    email, note = sharma_email(), sharma_note()
    ctx.memory.add_claim(email)
    ctx.memory.add_claim(note)
    conflicts.check(ctx, note, detected_on="sync")

    hits = ctx.memory.search("when is the Sharma delivery?", view="team")
    out = answer.compose("when is the Sharma delivery?", hits, ctx.store.list_conflicts(), ctx.cfg)
    assert out["answer"].startswith("Disputed: the client's email says 16 Oct; Tanishk's note from the call says 18 Oct.")
    assert len(out["citations"]) == 2
