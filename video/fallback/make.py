"""Quorum showcase fallback video. Pure-Pillow frames piped into ffmpeg.
Usage: python make.py            -> renders all scenes in parallel, concats to quorum-showcase-fallback.mp4
       python make.py still T    -> writes still_T.png at time T seconds
"""
import math
import os
import subprocess
import sys
from functools import lru_cache
from multiprocessing import Pool

from PIL import Image, ImageDraw, ImageFont

W, H, FPS = 1920, 1080, 24
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "quorum-showcase-fallback.mp4")

BG = (10, 14, 22)
AMBER = (245, 165, 36)
GREEN = (34, 197, 94)
RED = (239, 68, 68)
INDIGO = (124, 140, 255)
WHITE = (240, 244, 250)
GREY = (154, 164, 178)
DIM = (70, 80, 96)
PANEL = (20, 26, 38)
PANEL2 = (26, 34, 50)
EDGE = (48, 58, 78)

FD = "C:/Windows/Fonts/"
FONTS = {
    "r": "segoeui.ttf", "b": "segoeuib.ttf", "sb": "seguisb.ttf",
    "l": "segoeuil.ttf", "m": "consola.ttf", "sym": "seguisym.ttf",
}


@lru_cache(maxsize=None)
def F(kind, size):
    return ImageFont.truetype(FD + FONTS[kind], size)


@lru_cache(maxsize=1)
def background():
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    g = (18, 24, 36)
    for x in range(0, W, 60):
        d.line([(x, 0), (x, H)], fill=g)
    for y in range(0, H, 60):
        d.line([(0, y), (W, y)], fill=g)
    # soft vignette-ish top glow
    return im


# ---------------- helpers ----------------
def clamp(x, a=0.0, b=1.0):
    return max(a, min(b, x))


def ease(x):
    x = clamp(x)
    return 1 - (1 - x) ** 3


def inout(x):
    x = clamp(x)
    return x * x * (3 - 2 * x)


def mix(c1, c2, t):
    t = clamp(t)
    return tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3))


def fa(c, a):
    """colour c faded against background by alpha a"""
    return mix(BG, c, a)


def appear(t, start, dur=0.5):
    return ease((t - start) / dur)


def text(d, xy, s, font, color, a=1.0, anchor="la", dy=0):
    if a <= 0.01 or not s:
        return
    x, y = xy
    d.text((x, y + (1 - a) * 24 + dy), s, font=font, fill=fa(color, a), anchor=anchor)


def typed(s, t, start, cps=38):
    n = int(max(0, (t - start) * cps))
    return s[:n]


def box(d, rect, a=1.0, fill=PANEL, outline=EDGE, r=18, width=2):
    if a <= 0.01:
        return
    d.rounded_rectangle(rect, radius=r, fill=fa(fill, a), outline=fa(outline, a), width=width)


def glow_dot(d, cx, cy, r, color, a=1.0, glow=2.8):
    if a <= 0.01:
        return
    steps = 7
    for i in range(steps, 0, -1):
        rr = r + (r * glow - r) * i / steps
        al = a * 0.28 * (1 - i / (steps + 1)) ** 1.6
        d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=fa(color, al))
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=fa(color, a))
    hr = r * 0.4
    d.ellipse([cx - hr - r * 0.2, cy - hr - r * 0.2, cx + hr - r * 0.2, cy + hr - r * 0.2],
              fill=fa(mix(color, WHITE, 0.55), a))


def ring(d, cx, cy, r, color, a):
    if a <= 0.01:
        return
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=fa(color, a), width=3)


def pulse(t, speed=1.2):
    return 0.5 + 0.5 * math.sin(2 * math.pi * speed * t)


def dashed(d, p1, p2, color, a, t, dash=18, gap=12, width=4, speed=60):
    if a <= 0.01:
        return
    (x1, y1), (x2, y2) = p1, p2
    L = math.hypot(x2 - x1, y2 - y1)
    ux, uy = (x2 - x1) / L, (y2 - y1) / L
    off = (t * speed) % (dash + gap)
    s = -dash + off
    while s < L:
        a0, a1 = max(0, s), min(L, s + dash)
        if a1 > a0:
            d.line([(x1 + ux * a0, y1 + uy * a0), (x1 + ux * a1, y1 + uy * a1)], fill=fa(color, a), width=width)
        s += dash + gap


def caption(d, t, start, s, color=WHITE, y=985, size=46):
    a = appear(t, start, 0.6)
    text(d, (W // 2, y), s, F("sb", size), color, a, anchor="mm")


def check(d, x, y, color, a, s=22):
    if a <= 0.01:
        return
    d.line([(x, y), (x + s * 0.38, y + s * 0.4), (x + s, y - s * 0.45)], fill=fa(color, a), width=5, joint="curve")


def cross(d, x, y, color, a, s=18):
    if a <= 0.01:
        return
    d.line([(x, y - s / 2), (x + s, y + s / 2)], fill=fa(color, a), width=5)
    d.line([(x, y + s / 2), (x + s, y - s / 2)], fill=fa(color, a), width=5)


def pill(d, cx, cy, s, color, a, size=28, pad=22):
    if a <= 0.01:
        return
    f = F("sb", size)
    w = d.textlength(s, font=f)
    h = size + 18
    d.rounded_rectangle([cx - w / 2 - pad, cy - h / 2, cx + w / 2 + pad, cy + h / 2], radius=h / 2,
                        fill=fa(mix(BG, color, 0.18), a), outline=fa(color, a), width=2)
    d.text((cx, cy), s, font=f, fill=fa(color, a), anchor="mm")


def laptop(d, rect, title, a, status=None, status_col=GREY):
    x0, y0, x1, y1 = rect
    box(d, rect, a, fill=PANEL, outline=EDGE)
    d.line([(x0 + 2, y0 + 64), (x1 - 2, y0 + 64)], fill=fa(EDGE, a), width=2)
    for i, c in enumerate([RED, AMBER, GREEN]):
        cx = x0 + 30 + i * 26
        d.ellipse([cx - 7, y0 + 25, cx + 7, y0 + 39], fill=fa(mix(BG, c, 0.6), a))
    text(d, (x0 + 115, y0 + 32), title, F("sb", 30), WHITE, a, anchor="lm")
    if status:
        text(d, (x1 - 28, y0 + 32), status, F("sb", 26), status_col, a, anchor="rm")


# ---------------- scenes ----------------
def s_hook(d, t):
    lines = [
        ("I run seven projects at once.", 0.3),
        ("When one gets interesting, I forget the others exist.", 2.7),
        ("Now imagine four of us. Half the time on shoots with no signal.", 5.1),
    ]
    # seven project dots
    for i in range(7):
        cx = W // 2 - 3 * 110 + i * 110
        a = appear(t, 0.2 + i * 0.12, 0.4)
        focus = i == 3
        if t > 2.7 and not focus:
            a *= 1 - 0.75 * appear(t, 2.9, 0.8)
        col = INDIGO if focus else GREY
        r = 16 + (6 * pulse(t) if focus and t > 2.7 else 0)
        glow_dot(d, cx, 250, r, col, a)
    for i, (s, st) in enumerate(lines):
        a = appear(t, st, 0.4)
        col = WHITE if i < 2 else mix(WHITE, AMBER, 0.0)
        text(d, (W // 2, 440 + i * 130), typed(s, t, st, 34), F("sb", 60), col, a, anchor="mm")
    # 4 people dots, 2 offline (amber)
    if t > 5.1:
        for i in range(4):
            cx = W // 2 - 1.5 * 90 + i * 90
            glow_dot(d, cx, 820, 14, AMBER if i % 2 else GREEN, appear(t, 5.3 + i * 0.15, 0.4))


def s_problem(d, t):
    # WhatsApp bubble
    a1 = appear(t, 0.2, 0.6)
    x = -60 * (1 - a1)
    text(d, (180 + x, 230), "WhatsApp  ·  on set", F("sb", 30), GREEN, a1)
    box(d, [180 + x, 280, 820 + x, 450], a1, fill=(22, 52, 38), outline=(34, 90, 60), r=28)
    text(d, (215 + x, 320), "Client says push the Sharma", F("r", 38), WHITE, a1)
    text(d, (215 + x, 375), "delivery to the 18th", F("r", 38), WHITE, a1)
    # Email card
    a2 = appear(t, 1.4, 0.6)
    x = 60 * (1 - a2)
    text(d, (1100 + x, 230), "Email  ·  from client:sharma", F("sb", 30), INDIGO, a2)
    box(d, [1100 + x, 280, 1740 + x, 450], a2, fill=PANEL2, outline=EDGE, r=18)
    text(d, (1135 + x, 318), "Subject: Sharma delivery", F("r", 30), GREY, a2)
    text(d, (1135 + x, 370), "Confirming delivery on the 16th.", F("r", 36), WHITE, a2)
    # dates
    a4 = appear(t, 2.6, 0.5)
    text(d, (500, 630), "18th", F("b", 120), AMBER, a4, anchor="mm")
    text(d, (1420, 630), "16th", F("b", 120), GREEN, a4, anchor="mm")
    # red ?
    a3 = appear(t, 3.2, 0.5)
    if a3 > 0:
        r = (58 + 6 * pulse(t, 1.0)) * a3
        for i in range(7, 0, -1):
            rr = r * (1 + 1.2 * i / 7)
            d.ellipse([W / 2 - rr, 630 - rr, W / 2 + rr, 630 + rr], fill=fa(RED, a3 * 0.25 * (1 - i / 8) ** 1.6))
        d.ellipse([W / 2 - r, 630 - r, W / 2 + r, 630 + r], fill=fa(RED, a3))
        text(d, (W // 2, 622), "?", F("b", 88), WHITE, a3, anchor="mm")
    caption(d, t, 4.4, "Deadlines change in one place and get misquoted in another.")


def s_title(d, t):
    # constellation of dots
    pts = [(420, 300), (560, 180), (1360, 200), (1500, 330), (300, 700), (1620, 720), (480, 860), (1440, 880)]
    for i, (px, py) in enumerate(pts):
        a = appear(t, 0.1 * i, 0.6) * 0.8
        col = [GREEN, AMBER, INDIGO][i % 3]
        glow_dot(d, px, py + 8 * math.sin(t * 1.3 + i), 8, col, a)
    a = appear(t, 0.3, 0.9)
    f = F("b", 200)
    s = "QUORUM"
    # manual letter spacing
    sp = 26
    widths = [d.textlength(ch, font=f) for ch in s]
    total = sum(widths) + sp * (len(s) - 1)
    x = W / 2 - total / 2
    for ch, w in zip(s, widths):
        text(d, (x, 420), ch, f, WHITE, a, anchor="lm")
        x += w + sp
    text(d, (W // 2, 590), "Offline-first team memory on Qdrant Edge", F("sb", 54), INDIGO, appear(t, 1.3, 0.7), anchor="mm")
    text(d, (W // 2, 690), "Your team's memory, on every laptop, even with no signal.", F("r", 42), GREY,
         appear(t, 2.4, 0.7), anchor="mm")


def s_arch(d, t):
    items = ["Qdrant Edge", "FastEmbed (dense + BM25)", "SQLite graph + outbox", "Local LLM"]
    for k, (x0, name) in enumerate([(150, "Tanishk's laptop"), (1170, "Lakshya's laptop")]):
        a = appear(t, 0.2 + k * 0.5, 0.6)
        rect = [x0, 110, x0 + 600, 560]
        laptop(d, rect, name, a, "edge node", INDIGO)
        for i, it in enumerate(items):
            ai = appear(t, 0.8 + k * 0.5 + i * 0.35, 0.4)
            y = 220 + i * 82
            glow_dot(d, x0 + 50, y, 8, INDIGO, ai, glow=2.2)
            text(d, (x0 + 80, y), it, F("r" if i else "sb", 38), WHITE, ai, anchor="lm")
    # hub
    ah = appear(t, 3.4, 0.6)
    hub = [610, 720, 1310, 880]
    box(d, hub, ah, fill=PANEL2, outline=INDIGO, r=22)
    text(d, (960, 765), "Home server", F("sb", 30), GREY, ah, anchor="mm")
    text(d, (960, 825), "Qdrant Server + team hub", F("sb", 42), WHITE, ah, anchor="mm")
    al = appear(t, 4.0, 0.6)
    dashed(d, (450, 560), (760, 720), GREEN, al, t)
    dashed(d, (1470, 560), (1160, 720), GREEN, al, t)
    if al > 0:
        # packets
        for k, (p1, p2) in enumerate([((450, 560), (760, 720)), ((1470, 560), (1160, 720))]):
            u = ((t * 0.5 + k * 0.5) % 1.0)
            glow_dot(d, p1[0] + (p2[0] - p1[0]) * u, p1[1] + (p2[1] - p1[1]) * u, 7, GREEN, al)
    caption(d, t, 5.2, "Every device is a full edge node. The hub only syncs.", y=985)


def s_claim(d, t):
    a = appear(t, 0.2, 0.6)
    rect = [480, 110, 1440, 790]
    box(d, rect, a, fill=(14, 19, 30), outline=EDGE)
    text(d, (520, 150), "claim.json", F("m", 28), GREY, a)
    rows = [
        ("entity_id", '"task_sharma_edit"'),
        ("attribute", '"due_date"'),
        ("value", '"2026-10-16"'),
        ("source", '"email / client:sharma"'),
        ("captured_by", '"lakshya"'),
        ("tier", '"team"'),
        ("status", '"active"'),
    ]
    fm = F("m", 40)
    text(d, (520, 215), "{", fm, WHITE, a)
    for i, (k, v) in enumerate(rows):
        st = 0.8 + i * 0.55
        ai = appear(t, st, 0.3)
        y = 280 + i * 62
        hl = k in ("value", "source")
        text(d, (570, y), f'"{k}"', fm, INDIGO, ai)
        text(d, (570 + d.textlength(f'"{k}"', font=fm), y), ": ", fm, GREY, ai)
        vc = GREEN if k == "status" else (AMBER if hl else WHITE)
        comma = "," if i < len(rows) - 1 else ""
        text(d, (900, y), typed(v + comma, t, st + 0.1, 40), fm, vc, ai)
        if hl and t > 5.2:
            ah = appear(t, 5.2, 0.5) * (0.6 + 0.4 * pulse(t))
            d.rounded_rectangle([555, y - 8, 1425, y + 52], radius=10, outline=fa(AMBER, ah), width=2)
    text(d, (520, 280 + 7 * 62), "}", fm, WHITE, a)
    caption(d, t, 5.0, "Every fact is a claim with a source.")


def s_offline(d, t):
    a = appear(t, 0.1, 0.5)
    laptop(d, [260, 90, 1660, 860], "Tanishk's laptop  ·  on a shoot", a)
    # airplane + network
    text(d, (1350, 122), "\u2708", F("sym", 40), AMBER, a, anchor="rm")
    text(d, (1630, 122), "Network: 0 B/s", F("sb", 30), AMBER, a, anchor="rm")
    # query
    aq = appear(t, 0.6, 0.4)
    box(d, [320, 200, 1600, 290], aq, fill=PANEL2, outline=EDGE, r=14)
    text(d, (355, 245), "Ask:", F("sb", 36), GREY, aq, anchor="lm")
    text(d, (450, 245), typed("what's due this week?", t, 0.8, 26), F("r", 40), WHITE, aq, anchor="lm")
    # answer
    aa = appear(t, 2.0, 0.4)
    text(d, (340, 340), "Sharma edit  ·  due Thu 16 Oct   (source: client email)", F("r", 38), WHITE, aa)
    text(d, (340, 395), "Game project build  ·  due Fri 17 Oct", F("r", 38), WHITE, aa)
    ab = appear(t, 2.6, 0.4)
    glow_dot(d, 352, 480, 9, GREEN, ab, glow=2.2)
    text(d, (375, 480), "answered in 14 ms, on-device", F("sb", 36), GREEN, ab, anchor="lm")
    # note capture
    an = appear(t, 4.2, 0.4)
    d.line([(320, 550), (1600, 550)], fill=fa(EDGE, an), width=2)
    box(d, [320, 590, 1600, 680], an, fill=PANEL2, outline=EDGE, r=14)
    text(d, (355, 635), "Note:", F("sb", 36), GREY, an, anchor="lm")
    text(d, (470, 635), typed("Client says push the Sharma delivery to the 18th", t, 4.5, 30),
         F("r", 38), WHITE, an, anchor="lm")
    ad = appear(t, 6.4, 0.4)
    r = 14 + 4 * pulse(t, 1.0) * ad
    glow_dot(d, 360, 760, r, AMBER, ad)
    text(d, (410, 760), "saved locally  ·  queued for sync", F("sb", 36), AMBER, ad, anchor="lm")
    ao = appear(t, 7.0, 0.4)
    pill(d, 1450, 760, "Outbox: 1", AMBER, ao, size=34)
    caption(d, t, 8.2, "No signal. Search, answers and capture still work on-device.")


def s_meanwhile(d, t):
    a = appear(t, 0.1, 0.5)
    laptop(d, [360, 140, 1560, 760], "Lakshya's laptop  ·  in the studio", a, "Online", GREEN)
    ae = appear(t, 0.9, 0.6)
    x = 80 * (1 - ae)
    box(d, [440 + x, 260, 1480 + x, 500], ae, fill=PANEL2, outline=EDGE, r=16)
    text(d, (480 + x, 300), "From: client:sharma", F("r", 30), GREY, ae)
    text(d, (480 + x, 345), "Subject: Sharma delivery", F("r", 30), GREY, ae)
    text(d, (480 + x, 410), "Delivery confirmed for the 16th.", F("sb", 46), WHITE, ae)
    ag = appear(t, 2.4, 0.4)
    glow_dot(d, 470, 600, 14 + 3 * pulse(t) * ag, GREEN, ag)
    text(d, (505, 600), "captured as a claim  ·  synced to the hub", F("sb", 38), GREEN, ag, anchor="lm")
    caption(d, t, 3.2, "Meanwhile, Lakshya's laptop is online.")


def s_reconnect(d, t):
    a = appear(t, 0.1, 0.4)
    # outbox counter
    n = 1 if t < 1.6 else 0
    col = AMBER if n else GREEN
    text(d, (W // 2, 90), "Tanishk reconnects", F("sb", 40), WHITE, a, anchor="mm")
    pill(d, W // 2, 160, f"Outbox: {n}", col, a, size=32)
    # dots
    red = inout((t - 3.6) / 0.6)
    pull = inout((t - 4.0) / 1.8)
    lx = 560 + (170 * pull)
    rx = 1360 - (170 * pull)
    y = 330
    lcol = mix(AMBER, GREEN, appear(t, 1.8, 0.4))
    lcol = mix(lcol, RED, red)
    rcol = mix(GREEN, RED, red)
    # sync rings
    for cx, st in ((lx, 1.8), (rx, 1.8)):
        u = (t - st)
        if 0 < u < 1.2:
            ring(d, cx, y, 30 + 90 * u, GREEN, 1 - u / 1.2)
    if pull > 0:
        # tension line
        d.line([(lx, y), (rx, y)], fill=fa(RED, 0.5 * pull), width=3)
    r = 26 + (4 * pulse(t, 1.6) if red > 0 else 0)
    glow_dot(d, lx, y, r, lcol, a)
    glow_dot(d, rx, y, r, rcol, a)
    text(d, (lx, y + 70), "due 18th", F("b", 40), WHITE, a, anchor="mm")
    text(d, (lx, y + 115), "Tanishk's note, on set", F("r", 28), GREY, a, anchor="mm")
    text(d, (rx, y + 70), "due 16th", F("b", 40), WHITE, a, anchor="mm")
    text(d, (rx, y + 115), "client:sharma email", F("r", 28), GREY, a, anchor="mm")
    # search panel
    ap = appear(t, 5.8, 0.5)
    box(d, [360, 560, 1560, 880], ap, fill=(14, 19, 30), outline=EDGE)
    text(d, (400, 600), typed("Qdrant hybrid search  ·  attribute=due_date  ·  status=active", t, 6.0, 55),
         F("m", 32), INDIGO, ap)
    ar = appear(t, 7.6, 0.4)
    text(d, (400, 670), "Found 2 claims about the Sharma delivery", F("sb", 42), WHITE, ar)
    ar2 = appear(t, 8.2, 0.4)
    text(d, (400, 740), "similarity 0.91", F("r", 38), GREY, ar2)
    ar3 = appear(t, 8.8, 0.4)
    glow_dot(d, 412, 820, 10, RED, ar3, glow=2.2)
    text(d, (440, 820), "Dates disagree.", F("b", 42), RED, ar3, anchor="lm")
    caption(d, t, 10.0, "Qdrant finds the conflict. Nothing wins by default.")


def s_noguess(d, t):
    fr, fs = F("r", 36), F("sb", 30)
    # assistant bubble 1
    a1 = appear(t, 0.2, 0.4)
    text(d, (200, 95), "Quorum assistant", fs, INDIGO, a1)
    box(d, [200, 140, 1400, 270], a1, fill=PANEL2, outline=EDGE, r=24)
    glow_dot(d, 245, 180, 11, RED, a1, glow=2.0)
    text(d, (270, 180), "Disputed.", F("b", 38), RED, a1, anchor="lm")
    text(d, (462, 180), typed("The client's email says the 16th;", t, 0.5, 45), fr, WHITE, a1, anchor="lm")
    text(d, (240, 230), typed("you said the 18th on set.", t, 1.3, 45), fr, WHITE, a1, anchor="lm")
    a2 = appear(t, 2.2, 0.4)
    box(d, [200, 295, 800, 370], a2, fill=PANEL2, outline=EDGE, r=24)
    text(d, (240, 332), "Should I ask the client?", fr, WHITE, a2, anchor="lm")
    # draft
    a3 = appear(t, 3.2, 0.4)
    box(d, [200, 400, 1400, 540], a3, fill=(14, 19, 30), outline=INDIGO, r=16)
    text(d, (230, 425), "Draft to client:sharma", fs, INDIGO, a3)
    text(d, (230, 475), "\"Could you confirm the Sharma delivery date: the 16th or the 18th?\"", F("r", 34), WHITE, a3)
    # user yes
    a4 = appear(t, 4.4, 0.4)
    box(d, [1500, 420, 1720, 500], a4, fill=(40, 48, 100), outline=INDIGO, r=24)
    text(d, (1610, 460), "Yes", F("sb", 38), WHITE, a4, anchor="mm")
    a5 = appear(t, 5.0, 0.4)
    pill(d, 1540, 590, "Sent on yes", INDIGO, a5, size=30)
    # resolution
    a6 = appear(t, 6.0, 0.5)
    box(d, [200, 640, 1720, 900], a6, fill=PANEL, outline=EDGE)
    text(d, (240, 670), "Resolved on both laptops", F("sb", 36), GREEN, a6)
    glow_dot(d, 255, 755, 11, GREEN, a6, glow=2.0)
    text(d, (285, 755), "due_date = 2026-10-16", F("m", 36), WHITE, a6, anchor="lm")
    text(d, (800, 755), "active", F("sb", 34), GREEN, a6, anchor="lm")
    a7 = appear(t, 6.6, 0.5)
    glow_dot(d, 255, 835, 11, DIM, a7, glow=1.6)
    text(d, (285, 835), "due_date = 2026-10-18", F("m", 36), GREY, a7, anchor="lm")
    if a7 > 0:
        tw = d.textlength("due_date = 2026-10-18", font=F("m", 36))
        d.line([(285, 837), (285 + tw * appear(t, 7.0, 0.5), 837)], fill=fa(GREY, a7), width=3)
    text(d, (800, 835), "superseded, kept for history", F("r", 34), GREY, a7, anchor="lm")
    caption(d, t, 7.6, "No guessing. It asks, and keeps the history.")


def s_tiers(d, t):
    tiers = [
        ("Device only", "Never leaves this laptop.", AMBER),
        ("My devices", "Synced to your own devices.", INDIGO),
        ("Team", "Shared through the hub.", GREEN),
    ]
    for i, (name, desc, col) in enumerate(tiers):
        a = appear(t, 0.3 + i * 0.5, 0.6)
        x0 = 180 + i * 540
        y = 20 * (1 - a)
        box(d, [x0, 200 + y, x0 + 480, 600 + y], a, fill=PANEL, outline=mix(EDGE, col, 0.5))
        glow_dot(d, x0 + 240, 300 + y, 22 + 3 * pulse(t + i * 0.3), col, a)
        text(d, (x0 + 240, 400 + y), name, F("b", 50), WHITE, a, anchor="mm")
        text(d, (x0 + 240, 470 + y), desc, F("r", 32), GREY, a, anchor="mm")
        text(d, (x0 + 240, 540 + y), f"tier = {name.lower().replace(' ', '_')}", F("m", 28), col, a, anchor="mm")
    caption(d, t, 2.6, "Every Qdrant search carries a tier filter.", y=730, size=52)
    caption(d, t, 3.8, "No cloud calls in the private path.", y=810, color=GREY, size=44)


def s_nudge(d, t):
    a = appear(t, 0.1, 0.5)
    # "desktop" hint
    box(d, [260, 150, 1660, 880], a * 0.8, fill=(14, 19, 30), outline=EDGE)
    text(d, (300, 190), "game_project / level_03.scene", F("m", 30), GREY, a * 0.8)
    for i in range(8):
        w = 300 + (i * 173) % 700
        d.rounded_rectangle([300, 260 + i * 48, 300 + w, 280 + i * 48], radius=8, fill=fa(PANEL2, a * 0.8))
    text(d, (1620, 190), "16:40", F("sb", 30), GREY, a * 0.8, anchor="ra")
    # toast
    at = appear(t, 0.8, 0.7)
    x = 500 * (1 - at)
    rect = [820 + x, 360, 1600 + x, 620]
    box(d, rect, at, fill=PANEL2, outline=AMBER, r=22)
    glow_dot(d, 870 + x, 415, 12, AMBER, at * (0.7 + 0.3 * pulse(t)), glow=2.2)
    text(d, (900 + x, 415), "Quorum", F("sb", 32), AMBER, at, anchor="lm")
    text(d, (860 + x, 480), "You've been on the game project since 2.", F("r", 34), WHITE, at, anchor="lm")
    text(d, (860 + x, 540), "The Sharma edit is due tomorrow at 10.", F("sb", 34), WHITE, at, anchor="lm")
    caption(d, t, 2.4, "A gentle nudge when one project swallows the day.")


def s_honest(d, t):
    real = ["Qdrant Edge memory + hybrid search", "Conflict detection", "Offline sync + persistent outbox",
            "Tier filters"]
    mock = ["Phone app", "Live WhatsApp stream", "Screen understanding"]
    a = appear(t, 0.1, 0.5)
    text(d, (W // 2, 130), "What's real in this demo", F("b", 56), WHITE, a, anchor="mm")
    text(d, (220, 240), "Real", F("b", 44), GREEN, appear(t, 0.4, 0.4))
    for i, s in enumerate(real):
        ai = appear(t, 0.6 + i * 0.3, 0.4)
        check(d, 225, 340 + i * 90, GREEN, ai)
        text(d, (275, 340 + i * 90), s, F("r", 40), WHITE, ai, anchor="lm")
    text(d, (1100, 240), "Mocked for demo", F("b", 44), AMBER, appear(t, 1.8, 0.4))
    for i, s in enumerate(mock):
        ai = appear(t, 2.0 + i * 0.3, 0.4)
        cross(d, 1105, 340 + i * 90, AMBER, ai)
        text(d, (1150, 340 + i * 90), s, F("r", 40), WHITE, ai, anchor="lm")
    d.line([(1020, 250), (1020, 700)], fill=fa(EDGE, a), width=2)


def s_close(d, t):
    s = "Shared memory for small teams that work where the signal doesn't."
    a = appear(t, 0.2, 0.4)
    text(d, (W // 2, 330), typed(s, t, 0.3, 40), F("sb", 52), WHITE, a, anchor="mm")
    aq = appear(t, 2.2, 0.8)
    f = F("b", 150)
    text(d, (W // 2, 530), "QUORUM", f, WHITE, aq, anchor="mm")
    for i, col in enumerate([AMBER, GREEN, INDIGO]):
        glow_dot(d, W // 2 - 60 + i * 60, 660, 10, col, appear(t, 2.6 + i * 0.15, 0.4))
    af = appear(t, 3.0, 0.6)
    text(d, (W // 2, 760), "Code Cubicle 6.0  ·  Problem Statement 03", F("sb", 40), GREY, af, anchor="mm")
    text(d, (W // 2, 830), "github.com/ImTani/quorum-edge-memory", F("m", 40), INDIGO, af, anchor="mm")


SCENES = [
    (s_hook, 8.0), (s_problem, 8.0), (s_title, 7.0), (s_arch, 11.0), (s_claim, 9.0),
    (s_offline, 12.0), (s_meanwhile, 6.0), (s_reconnect, 14.0), (s_noguess, 10.0),
    (s_tiers, 8.0), (s_nudge, 6.0), (s_honest, 7.0), (s_close, 7.0),
]


def render(idx, t):
    fn, dur = SCENES[idx]
    im = background().copy()
    d = ImageDraw.Draw(im)
    fn(d, t)
    # scene envelope
    fin = 0.35
    fout = 1.6 if idx == len(SCENES) - 1 else 0.35
    env = min(clamp(t / fin), clamp((dur - t) / fout))
    if idx == 0:
        env = min(1.0, clamp(t / 0.6)) if t < dur - fout else env
    if env < 0.999:
        base = background() if idx != len(SCENES) - 1 else Image.new("RGB", (W, H), (0, 0, 0))
        im = Image.blend(base, im, inout(env))
    return im


def render_segment(idx):
    fn, dur = SCENES[idx]
    path = os.path.join(HERE, f"seg_{idx:02d}.mp4")
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
           "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20",
           "-preset", "veryfast", "-r", str(FPS), path]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    n = int(round(dur * FPS))
    for f in range(n):
        p.stdin.write(render(idx, f / FPS).tobytes())
    p.stdin.close()
    p.wait()
    return path


def scene_at(T):
    acc = 0
    for i, (_, dur) in enumerate(SCENES):
        if T < acc + dur:
            return i, T - acc
        acc += dur
    return len(SCENES) - 1, SCENES[-1][1] - 0.01


def main():
    if len(sys.argv) >= 3 and sys.argv[1] == "still":
        T = float(sys.argv[2])
        i, t = scene_at(T)
        render(i, t).save(os.path.join(HERE, f"still_{T:g}.png"))
        return
    only = None
    if len(sys.argv) >= 2 and sys.argv[1] == "seg":
        only = [int(x) for x in sys.argv[2:]]
    idxs = only if only else list(range(len(SCENES)))
    with Pool(min(12, len(idxs))) as pool:
        paths = pool.map(render_segment, idxs)
    lst = os.path.join(HERE, "concat.txt")
    with open(lst, "w") as fh:
        for i in range(len(SCENES)):
            fh.write(f"file 'seg_{i:02d}.mp4'\n")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", lst,
                    "-c", "copy", "-movflags", "+faststart", OUT + ".tmp.mp4"], check=True, cwd=HERE)
    os.replace(OUT + ".tmp.mp4", OUT)
    print("wrote", OUT, "total", sum(d for _, d in SCENES), "s")


if __name__ == "__main__":
    main()
