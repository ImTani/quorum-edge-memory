#!/usr/bin/env python3
"""
compose.py -- procedural score + UI sound design for the Quorum v3 showcase (150 s).

Everything is synthesised (numpy/scipy); no samples.  Outputs (48 kHz / 16-bit / stereo):
    soundtrack.wav   final master (= music.wav + sfx.wav, same master gain curve)
    music.wav        score stem
    sfx.wav          UI / transition sound-effects stem

TIMING / NUDGING
    All sync points live in  cue_sheet.json  (next to this script):
      "marks": named musical sync points (seconds) that drive the arrangement
               (impact, glitch, title_hit, lock, groove, offline, reconnect, pulse,
               conflict, calm, resolve, tiers, honesty, close, wordmark, ...)
      "sfx":   list of {t, type, label, ...} sound effects.
    Edit a "t" (or a mark) and re-run:   python compose.py
    The sheet is created from the built-in defaults (the storyboard) on first run, or
    with  --regen  (which also pulls matching times from ../cues.json if present).
    Quick one-off nudge without editing the file:
        python compose.py --nudge "chime=+0.10" --nudge "mark:resolve=108.6"
      ("<label-substring>=+/-dt" shifts matching sfx; "mark:<name>=<abs time>" sets a mark)

Tempo is 120 BPM (beat = 0.5 s, bar = 2 s): every key event in the storyboard sits on a
0.5 s grid, so every hit lands on a beat.  The groove is played half-time-ish so it feels
~100 BPM-relaxed rather than dancey.

Run:  python compose.py            (~1-2 min)       python compose.py --analyze-only
"""
import argparse
import json
import os
import re
import subprocess
import sys
import time
import zlib

import numpy as np
from scipy import signal
from scipy.io import wavfile
from scipy.ndimage import minimum_filter1d, uniform_filter1d

DEBUG = bool(os.environ.get("COMPOSE_DEBUG"))
HERE = os.path.dirname(os.path.abspath(__file__))
SR = 48000
DUR = 150.0
N = int(SR * DUR)
BEAT = 0.5          # 120 BPM
BAR = 2.0
T = np.arange(N, dtype=np.float64) / SR

# --------------------------------------------------------------------------------------
# Cue sheet
# --------------------------------------------------------------------------------------
DEFAULT_MARKS = {
    "hook": 0.0, "problem": 14.0, "impact": 17.5, "glitch": 18.5, "title_hit": 24.0,
    "lock": 26.0, "groove": 32.0, "claims": 46.0, "offline": 58.0, "airplane": 59.0,
    "meanwhile": 74.0, "reconnect": 82.5, "pulse": 84.0, "conflict": 86.0, "found": 90.0,
    "disputed": 91.0, "calm": 100.0, "resolve": 108.5, "tiers": 114.0, "proactive": 124.0,
    "honesty": 131.0, "close": 138.0, "wordmark": 144.0, "fade_start": 148.0, "end": 150.0,
}


def _s(t, typ, label, **kw):
    d = {"t": t, "type": typ, "label": label}
    d.update(kw)
    return d


DEFAULT_SFX = [
    # A hook
    _s(0.5, "sparkle", "A orbs fade in", dur=1.6, gain=0.35),
    _s(2.0, "air", "A text seven projects", gain=0.35),
    _s(5.0, "bloom", "A orb swells (game project)", gain=0.6),
    _s(5.5, "air", "A text forget others", gain=0.3),
    _s(6.2, "blink", "A deadline orb blink 1", gain=0.25, pan=0.5),
    _s(7.4, "blink", "A deadline orb blink 2", gain=0.22, pan=0.5),
    _s(8.6, "blink", "A deadline orb blink 3", gain=0.2, pan=0.5),
    _s(9.5, "pops", "A ring multiplies x4", n=3, step=0.12, gain=0.45),
    _s(9.5, "whoosh", "A ring multiply whoosh", dur=0.9, gain=0.35, pan0=0.0, pan1=0.0, f0=300, f1=2500),
    _s(10.5, "down", "A signal bars crossed out", gain=0.3),
    _s(10.55, "glitch", "A signal bars glitch (tiny)", gain=0.08),
    # B problem
    # whoosh "t" = crest; this one starts at 14.2 (t - peak*dur) and dies at the 14.7 landing
    _s(14.6, "whoosh", "B whatsapp slides from left", dur=0.5, peak=0.8, pan0=-0.9, pan1=-0.3, gain=0.6),
    _s(14.5, "pop", "B chat bubble 1 (very soft)", f=900, pan=-0.45, gain=0.15),
    _s(14.62, "pop", "B chat bubble 2 (very soft)", f=1000, pan=-0.4, gain=0.13),
    _s(14.7, "pop", "B whatsapp bubble lands", f=620, pan=-0.4, gain=0.45),
    _s(16.0, "whoosh", "B email slides from right", dur=0.7, pan0=0.9, pan1=0.3, gain=0.6),
    _s(16.2, "pop", "B email card lands", f=700, pan=0.4, gain=0.45),
    _s(17.5, "slam", "B 18th/16th slam", gain=0.8),
    _s(18.5, "glitch", "B red ? glitch", gain=0.55),
    # C title
    _s(24.0, "stream", "C particles stream in", dur=2.0, gain=0.35),
    _s(26.0, "sweep", "C wordmark light sweep", dur=1.1, gain=0.55),
    _s(27.0, "air", "C subtitle", gain=0.25),
    # D architecture
    _s(32.5, "whoosh", "D laptop L floats in", dur=1.0, peak=0.6, pan0=-0.8, pan1=-0.4, gain=0.45),   # starts 31.9
    _s(32.55, "whoosh", "D laptop R floats in", dur=1.0, peak=0.6, pan0=0.8, pan1=0.4, gain=0.45),
    _s(33.5, "stack", "D stack layers slide in (x2 laptops)", times=[33.5, 34.3, 35.2, 36.0], gain=0.35),
    _s(37.0, "pop", "D hub card", f=560, gain=0.45),
    _s(37.5, "draw", "D sync lines draw", dur=1.0, gain=0.3),
    _s(38.2, "zip", "D packet 1", dur=0.35, pan0=-0.4, pan1=0.0, gain=0.25),
    _s(38.9, "zip", "D packet 2", dur=0.35, pan0=0.4, pan1=0.0, gain=0.22),
    _s(39.5, "stream", "D sources stream into laptop A", dur=1.6, pan=-0.5, gain=0.35),
    # E claims
    _s(46.5, "air", "E email line fades/slides in", gain=0.4),
    _s(46.5, "blip", "E email line notification blip", f=1175, gain=0.22),
    _s(48.0, "whoosh", "E words fly apart", dur=0.6, f0=800, f1=5000, gain=0.4),
    _s(48.6, "snap", "E snap into claim card", gain=0.45),
    _s(51.0, "pops", "E annotations pop", n=3, step=0.2, f=820, gain=0.35),
    _s(55.5, "collapse", "E card collapses to point", dur=0.8, gain=0.7),
    _s(55.5, "whoosh", "E point flight whoosh (55.5-57.45)", dur=1.95, f0=300, f1=3500, peak=0.55, pan0=-0.2, pan1=0.5, gain=0.45),
    _s(56.0, "zip", "E point flies into cloud", dur=1.4, pan0=0.0, pan1=0.5, gain=0.3),
    _s(57.45, "land", "E point lands in cloud", pan=0.5, gain=0.5),
    # F offline
    _s(58.0, "whoosh", "F transition to laptop", dur=0.9, f0=250, f1=1500, gain=0.3),
    _s(59.0, "down", "F airplane mode", gain=0.5, pan=-0.3),
    _s(61.0, "typing", "F query types", dur=1.2, pan=-0.3, gain=0.5),
    _s(62.5, "pop", "F answer appears", f=660, pan=-0.3, gain=0.4),
    _s(63.0, "sparkle", "F cloud points light up", dur=0.8, pan=0.4, gain=0.3),
    _s(66.0, "typing", "F quick note types", dur=2.2, pan=-0.3, gain=0.5),
    _s(68.5, "birth", "F amber point born", f=1175, pan=0.4, gain=0.65),
    _s(68.5, "softimpact", "F amber point shockwave impact", pan=0.3, gain=0.45),
    _s(68.55, "ding", "F amber point chime", pan=0.4, gain=0.3),
    _s(69.0, "pop", "F outbox badge 0->1", f=900, pan=-0.3, gain=0.3),
    # G meanwhile
    _s(74.0, "whoosh", "G camera pulls back", dur=1.0, f0=250, f1=1800, gain=0.35),
    _s(74.4, "whoosh", "G Lakshya window slides in right", dur=0.7, pan0=0.9, pan1=0.4, gain=0.35),
    _s(75.5, "ding", "G email arrives", pan=0.4, gain=0.4),
    _s(77.0, "birth", "G green point born", f=1397, pan=0.3, gain=0.6),
    # H reconnect
    _s(82.5, "up", "H pill online", pan=-0.3, gain=0.5),
    _s(83.0, "zip", "H outbox packet A->hub->B", dur=1.0, pan0=-0.7, pan1=0.7, gain=0.4),
    _s(84.0, "pulse", "H green pulse wave", dur=1.4, gain=0.55),
    _s(86.0, "alert", "H conflict alert", gain=0.6),
    _s(86.5, "whoosh", "H camera swoops", dur=1.4, f0=200, f1=1500, gain=0.35),
    _s(88.0, "whoosh", "H qdrant panel slides in", dur=0.6, pan0=0.8, pan1=0.2, f0=600, f1=4500, gain=0.4),
    _s(90.0, "blip", "H found 2 claims", f=988, gain=0.35),
    _s(91.0, "blip", "H dates disagree / disputed", f=659, gain=0.35),
    # I no guessing
    _s(100.5, "entrance", "I assistant panel", dur=1.2, gain=0.55),
    _s(103.5, "pop", "I suggestion button", f=740, gain=0.4),
    _s(105.0, "typing", "I drafted message types", dur=2.3, gain=0.45),
    _s(107.5, "click", "I Yes pressed", gain=0.6),
    _s(108.5, "chime", "I resolved chime", gain=0.6),
    _s(109.5, "pops", "I claim rows", n=2, step=0.15, f=660, gain=0.3),
    # J tiers
    _s(114.5, "whoosh", "J glass planes", dur=1.0, f0=300, f1=2500, gain=0.35),
    _s(116.0, "rise", "J points rise to team plane", n=4, step=0.22, gain=0.35),
    _s(118.0, "thunk", "J private point bounces off lock", gain=0.75),
    _s(119.5, "pop", "J tier filter chip", f=780, gain=0.35),
    # K proactive
    _s(124.5, "clock", "K timer ticks", dur=2.0, interval=0.25, gain=0.4),
    _s(126.5, "whoosh", "K nudge slides in", dur=0.6, pan0=0.8, pan1=0.3, f0=700, f1=4000, gain=0.35),
    _s(126.75, "ding", "K nudge notification", pan=0.3, gain=0.4),
    # L honesty
    _s(131.0, "sweep", "L title appears (soft sweep)", dur=0.9, gain=0.2),
    _s(131.5, "whoosh", "L two columns appear", dur=0.8, f0=500, f1=3500, gain=0.25),
    _s(131.8, "stagger", "L Real items stagger", n=5, step=0.11, pan=-0.45, f=1320, gain=0.22),
    _s(132.3, "stagger", "L Mocked items stagger", n=4, step=0.07, pan=0.45, f=1175, gain=0.2),
    # M close
    _s(138.5, "whoosh", "M camera pulls far out", dur=1.8, f0=150, f1=1200, gain=0.45),
    _s(140.5, "air", "M closing line", gain=0.25),
    _s(144.0, "sweep", "M wordmark returns", dur=1.3, gain=0.45),
    _s(144.0, "sparkle", "M wordmark sparkle", dur=1.8, gain=0.3),
    _s(145.0, "air", "M per team per month", gain=0.2),
    _s(146.0, "pop", "M credits line", f=620, gain=0.2),
]

SHEET_PATH = os.path.join(HERE, "cue_sheet.json")


def default_sheet():
    return {"_help": "Times in seconds. Edit 't' (sfx) or a mark, then re-run compose.py. "
                     "sfx types: whoosh pop pops blip sparkle stream bloom blink down up slam glitch "
                     "sweep air stack draw zip snap collapse typing birth ding pulse alert click chime "
                     "rise thunk clock stagger. Optional keys: gain, pan, pan0, pan1, dur, f, n, step.",
            "marks": dict(DEFAULT_MARKS), "sfx": [dict(s) for s in DEFAULT_SFX]}


# marks that can be re-synced from the framework's cues.json on --regen: (scene letter, label keyword)
MARK_KEYS = {"impact": ("B", "slam"), "glitch": ("B", "glitch"), "title_hit": ("C", "particles"),
             "lock": ("C", "wordmark locks"), "airplane": ("F", "airplane"), "meanwhile": ("G", "camera pulls back"),
             "reconnect": ("H", "flips to online"), "pulse": ("H", "pulse wave"), "conflict": ("H", "flash red"),
             "found": ("H", "found 2"), "disputed": ("H", "disagree"), "resolve": ("I", "resolved"),
             "wordmark": ("M", "wordmark returns")}


def merge_framework_cues(sheet, path):
    """Pull times from the framework's cues.json ({t,type,label} list) into our sheet.
    A sheet sfx entry adopts a framework time when the framework has an event within
    +-0.75 s whose label shares >=2 significant words with ours. Returns #updated."""
    if not os.path.exists(path):
        return 0
    try:
        fw = json.load(open(path, encoding="utf-8"))
    except Exception as e:  # noqa
        print("  ! could not parse", path, e)
        return 0
    if isinstance(fw, dict):
        fw = fw.get("cues") or fw.get("events") or []
    stop = {"the", "a", "in", "to", "of", "and", "on", "into", "from", "x2", "x4", "is"}

    def words(s):
        return {w for w in re.findall(r"[a-z0-9]+", str(s).lower()) if w not in stop and len(w) > 1}

    n = 0
    for mk, (scene, kw) in MARK_KEYS.items():
        for c in fw:
            lab = str(c.get("label", ""))
            if lab.upper().startswith(scene + ":") and kw in lab.lower():
                try:
                    tt = float(c["t"])
                except Exception:  # noqa
                    break
                if abs(tt - sheet["marks"][mk]) > 1e-3:
                    print(f"  mark {mk}: {sheet['marks'][mk]} -> {tt}  (from '{lab}')")
                    sheet["marks"][mk] = tt
                break
    for s in sheet["sfx"]:
        mine = words(s["label"]) | words(s["type"])
        best, bscore = None, 0
        for c in fw:
            try:
                ct = float(c["t"])
            except Exception:  # noqa
                continue
            if abs(ct - s["t"]) > 0.75:
                continue
            sc = len(mine & (words(c.get("label", "")) | words(c.get("type", ""))))
            if sc > bscore or (sc == bscore and best is not None and abs(ct - s["t"]) < abs(best - s["t"])):
                best, bscore = ct, sc
        if best is not None and bscore >= 2 and abs(best - s["t"]) > 1e-3:
            s["t"] = round(best, 3)
            n += 1
    return n


def load_sheet(regen=False, fw_path=None):
    if regen or not os.path.exists(SHEET_PATH):
        sheet = default_sheet()
        if fw_path:
            k = merge_framework_cues(sheet, fw_path)
            print(f"  cue sheet: merged {k} times from {fw_path}")
        with open(SHEET_PATH, "w", encoding="utf-8") as f:
            json.dump(sheet, f, indent=1)
        print("  wrote", SHEET_PATH)
    sheet = json.load(open(SHEET_PATH, encoding="utf-8"))
    marks = dict(DEFAULT_MARKS)
    marks.update(sheet.get("marks", {}))
    return marks, sheet["sfx"]


def apply_nudges(marks, sfx, nudges):
    for nd in nudges or []:
        key, val = nd.split("=", 1)
        if key.startswith("mark:"):
            marks[key[5:]] = float(val)
        else:
            dt = float(val)
            for s in sfx:
                if key.lower() in s["label"].lower():
                    s["t"] = s["t"] + dt


class M:  # attribute access to marks
    def __init__(self, d):
        self.__dict__.update(d)


# --------------------------------------------------------------------------------------
# DSP helpers
# --------------------------------------------------------------------------------------
def rng_for(*keys):
    return np.random.default_rng(zlib.crc32(repr(keys).encode()) & 0xFFFFFFFF)


def hz(m):
    return 440.0 * 2.0 ** ((np.asarray(m, dtype=np.float64) - 69.0) / 12.0)


def db(x):
    return 10 ** (x / 20.0)


def bus():
    return np.zeros((2, N), dtype=np.float32)


def pan_gains(pan):
    th = (np.clip(pan, -1, 1) + 1) * np.pi / 4
    return np.cos(th) * np.sqrt(2), np.sin(th) * np.sqrt(2)


def place(b, x, t, gain=1.0, pan=0.0):
    if gain == 0:
        return
    i0 = int(round(t * SR))
    if x.ndim == 1:
        gl, gr = pan_gains(pan)
        x = np.stack([x * gl, x * gr])
    n = x.shape[1]
    s0, s1 = max(0, i0), min(N, i0 + n)
    if s1 <= s0:
        return
    b[:, s0:s1] += (gain * x[:, s0 - i0:s1 - i0]).astype(np.float32)


def pan_move(x, p0, p1):
    p = np.linspace(p0, p1, len(x))
    gl, gr = pan_gains(p)
    return np.stack([x * gl, x * gr])


def curve(points, is_db=False, log=False):
    pts = sorted(points, key=lambda p: p[0])
    ts = np.array([p[0] for p in pts], dtype=np.float64)
    ts = ts + np.arange(len(ts)) * 1e-7          # strictly increasing (allows steps)
    vs = np.array([p[1] for p in pts], dtype=np.float64)
    if log:
        return (2.0 ** np.interp(T, ts, np.log2(vs))).astype(np.float32)
    y = np.interp(T, ts, vs)
    return (db(y) if is_db else y).astype(np.float32)


def fade(x, a=0.002, r=0.01):
    n = x.shape[-1]
    na, nr = min(int(a * SR), n // 2), min(int(r * SR), n // 2)
    if na > 0:
        x[..., :na] *= np.linspace(0, 1, na)
    if nr > 0:
        x[..., -nr:] *= np.linspace(1, 0, nr)
    return x


def sos_filter(x, kind, fc, order=2):
    sos = signal.butter(order, fc, btype=kind, fs=SR, output="sos")
    return signal.sosfilt(sos, x, axis=-1)


def tv_biquad(x, kind, fc, q=0.707, block=128, stages=1):
    """Time-varying RBJ biquad. x: (C,n) or (n,); fc: per-sample array (len n) or scalar."""
    mono = x.ndim == 1
    X = x[None, :] if mono else x
    C, n = X.shape
    nb = (n + block - 1) // block
    fcs = np.full(nb, float(fc)) if np.isscalar(fc) else np.asarray(fc)[::block][:nb]
    fcs = np.clip(fcs, 20.0, 0.45 * SR)
    w0 = 2 * np.pi * fcs / SR
    cw, sw = np.cos(w0), np.sin(w0)
    al = sw / (2 * q)
    if kind == "lp":
        b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0
    elif kind == "hp":
        b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0
    else:  # bandpass, 0 dB peak
        b0 = al; b1 = np.zeros_like(al); b2 = -al
    a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al
    B = np.stack([b0, b1, b2], 1) / a0[:, None]
    A = np.stack([np.ones_like(a0), a1 / a0, a2 / a0], 1)
    Y = X.astype(np.float64)
    for _ in range(stages):
        out = np.empty_like(Y)
        zi = np.zeros((C, 2))
        for k in range(nb):
            s, e = k * block, min(n, (k + 1) * block)
            out[:, s:e], zi = signal.lfilter(B[k], A[k], Y[:, s:e], axis=-1, zi=zi)
        Y = out
    return Y[0] if mono else Y


def polyblep_saw(freq, n, phase0=0.0):
    inc = (np.full(n, freq / SR) if np.isscalar(freq) else np.asarray(freq) / SR)
    ph = (phase0 + np.cumsum(inc)) % 1.0
    y = 2.0 * ph - 1.0
    m = ph < inc
    x = ph[m] / inc[m]
    y[m] -= x + x - x * x - 1.0
    m = ph > 1.0 - inc
    x = (ph[m] - 1.0) / inc[m]
    y[m] -= x * x + x + x + 1.0
    return y


def exp_env(n, attack, tau):
    t = np.arange(n) / SR
    e = np.exp(-t / tau)
    na = max(1, int(attack * SR))
    e[:na] *= 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, na))
    return e


# --------------------------------------------------------------------------------------
# Instruments
# --------------------------------------------------------------------------------------
def pad_note(midi, hold, attack, release, rng, voices=5, detune=13.0, bright_voice=True):
    """Detuned polyBLEP supersaw voice (stereo), slow drift. Length = hold + release."""
    n = int((hold + release) * SR)
    t = np.arange(n) / SR
    f = hz(midi)
    out = np.zeros((2, n))
    spreads = np.linspace(-1, 1, voices)
    pans = rng.permutation(np.linspace(-0.85, 0.85, voices))
    for i in range(voices):
        cents = spreads[i] * detune + rng.normal(0, 1.5)
        drift = 2.5 * np.sin(2 * np.pi * rng.uniform(0.05, 0.25) * t + rng.uniform(0, 6.28))
        fr = f * 2 ** ((cents + drift) / 1200)
        s = polyblep_saw(fr, n, rng.uniform())
        gl, gr = pan_gains(pans[i])
        out[0] += s * gl
        out[1] += s * gr
    # soft sine core one octave down for body
    out += 0.35 * np.sin(2 * np.pi * f * 0.5 * t + rng.uniform(0, 6.28))
    out /= np.sqrt(voices)
    env = np.ones(n)
    na = max(1, int(attack * SR))
    env[:na] = 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, na))
    nh = int(hold * SR)
    if nh < n:
        rt = np.arange(n - nh) / SR
        env[nh:] *= np.exp(-rt / (release / 5.0)) * np.linspace(1, 0, n - nh) ** 0.3
    return out * env


_pluck_cache = {}


def pluck(midi, t60=1.2, dur=1.8, bright=0.45, variant=0):
    """Karplus-Strong with allpass fine tuning; soft (low-passed) excitation."""
    key = (int(midi), round(t60, 2), round(dur, 2), round(bright, 2), variant)
    if key in _pluck_cache:
        return _pluck_cache[key]
    rng = rng_for("pluck", key)
    f = float(hz(midi))
    P = SR / f
    Nd = int(np.floor(P - 0.6))
    d = P - 0.5 - Nd
    c = (1 - d) / (1 + d)
    g = 10 ** (-3.0 / (f * t60))
    n = int(dur * SR)
    exc = rng.standard_normal(Nd)
    exc = signal.lfilter([1 - bright], [1, -bright], exc)          # soften
    exc = signal.lfilter([1 - bright], [1, -bright], exc)
    exc -= exc.mean()
    exc *= np.hanning(Nd) ** 0.5
    x = np.zeros(n)
    x[:Nd] = exc
    a = np.zeros(Nd + 3)
    a[0] = 1.0
    a[1] = c
    a[Nd] += -0.5 * g * c
    a[Nd + 1] += -0.5 * g * (1 + c)
    a[Nd + 2] += -0.5 * g
    y = signal.lfilter([1.0, c], a, x)
    # a touch of pure fundamental "mallet" body
    t = np.arange(n) / SR
    y = y / (np.max(np.abs(y)) + 1e-9)
    y += 0.35 * np.sin(2 * np.pi * f * t) * np.exp(-t / (t60 * 0.35)) * (1 - np.exp(-t / 0.003))
    y = sos_filter(y, "lowpass", min(7000, 2.2 * f + 2500))
    y = fade(y, 0.001, 0.05)
    y /= np.max(np.abs(y)) + 1e-9
    _pluck_cache[key] = y
    return y


def kick_sample(variant=0, hard=1.0):
    rng = rng_for("kick", variant)
    n = int(0.6 * SR)
    t = np.arange(n) / SR
    fr = 44 + 80 * hard * np.exp(-t / 0.035)
    ph = 2 * np.pi * np.cumsum(fr) / SR
    y = np.sin(ph) * np.exp(-t / 0.28)
    click = sos_filter(rng.standard_normal(n), "bandpass", [1500, 5000]) * np.exp(-t / 0.004)
    y = y + 0.06 * hard * click
    y = np.tanh(1.4 * y) / np.tanh(1.4)
    return fade(y, 0.0005, 0.05)


def hat_sample(variant=0, decay=0.035, fc=7500):
    rng = rng_for("hat", variant, decay)
    n = int((decay * 6 + 0.01) * SR)
    t = np.arange(n) / SR
    y = sos_filter(rng.standard_normal(n), "highpass", fc, 4) * exp_env(n, 0.001, decay)
    return y / (np.max(np.abs(y)) + 1e-9)


def shaker_sample(variant=0):
    rng = rng_for("shaker", variant)
    n = int(0.16 * SR)
    t = np.arange(n) / SR
    env = (t / 0.018) * np.exp(1 - t / 0.018)
    y = sos_filter(rng.standard_normal(n), "bandpass", [4500, 11000], 2) * env
    return y / (np.max(np.abs(y)) + 1e-9)


def snap_sample(variant=0):
    rng = rng_for("snap", variant)
    n = int(0.35 * SR)
    t = np.arange(n) / SR
    env = np.zeros(n)
    for off in (0.0, 0.009, 0.019):
        tt = np.clip(t - off, 0, None)
        env += (t >= off) * np.exp(-tt / (0.006 if off < 0.019 else 0.07))
    y = sos_filter(rng.standard_normal(n), "bandpass", [1100, 4200], 2) * env
    y += 0.25 * np.sin(2 * np.pi * 210 * t) * np.exp(-t / 0.03)
    return y / (np.max(np.abs(y)) + 1e-9)


def sub_note(midi, hold, attack=0.06, release=0.5):
    n = int((hold + release) * SR)
    t = np.arange(n) / SR
    f = hz(midi)
    y = np.sin(2 * np.pi * f * t) + 0.22 * np.sin(4 * np.pi * f * t + 0.3)
    y = np.tanh(1.3 * y) / np.tanh(1.3)
    env = np.ones(n)
    na = int(attack * SR)
    env[:na] = np.linspace(0, 1, na) ** 2
    nh = int(hold * SR)
    env[nh:] *= np.linspace(1, 0, n - nh) ** 2
    return y * env


def pulse_note(midi, dur=0.24):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = hz(midi)
    y = np.sin(2 * np.pi * f * t) + 0.5 * polyblep_saw(2 * f, n) * 0.4
    y = sos_filter(y, "lowpass", 260)
    y *= exp_env(n, 0.004, 0.07)
    return fade(y, 0.001, 0.02)


def noise_riser(dur, f0=300, f1=9000, q=1.6, power=2.5, seed=0):
    rng = rng_for("riser", seed, dur)
    n = int(dur * SR)
    x = rng.standard_normal((2, n))
    fc = f0 * (f1 / f0) ** (np.arange(n) / n)
    y = tv_biquad(x, "bp", fc, q=q, block=256)
    env = (np.arange(n) / n) ** power
    y *= env
    return fade(y, 0.01, 0.03)


def reverse_cymbal(dur=1.5, seed=0):
    rng = rng_for("revcym", seed, dur)
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = sos_filter(rng.standard_normal((2, n)), "highpass", 3500, 2)
    x = sos_filter(x, "lowpass", 13000, 2)
    y = x * np.exp(-t / (dur * 0.35))
    y = y[:, ::-1].copy()
    return fade(y, 0.01, 0.015)


def boom(dur=3.0, f0=68, f1=38, tau=0.9, seed=0):
    rng = rng_for("boom", seed)
    n = int(dur * SR)
    t = np.arange(n) / SR
    fr = f1 + (f0 - f1) * np.exp(-t / 0.35)
    y = np.sin(2 * np.pi * np.cumsum(fr) / SR) * np.exp(-t / tau)
    nz = sos_filter(rng.standard_normal(n), "lowpass", 1400, 2) * np.exp(-t / 0.18)
    y = y + 0.35 * nz / (np.max(np.abs(nz)) + 1e-9)
    y = np.tanh(1.5 * y) / np.tanh(1.5)
    return fade(y, 0.001, 0.2)


def sub_drop(dur=2.2, f0=110, f1=38):
    n = int(dur * SR)
    t = np.arange(n) / SR
    fr = f1 + (f0 - f1) * np.exp(-t / 0.45)
    y = np.sin(2 * np.pi * np.cumsum(fr) / SR) * np.exp(-t / 0.9)
    return fade(y, 0.002, 0.2)


def sparkle_grains(dur, density, notes, seed=0, grain_tau=(0.08, 0.35), ramp=None, pan_spread=0.9):
    rng = rng_for("sparkle", seed, dur)
    n = int((dur + 0.8) * SR)
    out = np.zeros((2, n))
    k = int(density * dur)
    ts = np.sort(rng.uniform(0, dur, k))
    if ramp == "up":
        ts = dur * np.sqrt(rng.uniform(0, 1, k))
    for tt in ts:
        m = rng.choice(notes)
        f = float(hz(m))
        tau = rng.uniform(*grain_tau)
        ln = int(min(tau * 6, 0.8) * SR)
        tg = np.arange(ln) / SR
        g = np.sin(2 * np.pi * f * tg) * np.exp(-tg / tau) * (1 - np.exp(-tg / 0.003))
        g += 0.2 * np.sin(2 * np.pi * 2.01 * f * tg) * np.exp(-tg / (tau * 0.4))
        gl, gr = pan_gains(rng.uniform(-pan_spread, pan_spread))
        amp = rng.uniform(0.4, 1.0)
        i = int(tt * SR)
        e = min(n, i + ln)
        out[0, i:e] += amp * gl * g[:e - i]
        out[1, i:e] += amp * gr * g[:e - i]
    return out


def make_ir(rt60, length, seed, lp=7000, predelay=0.018, er=True, hi_ratio=0.45):
    rng = rng_for("ir", seed)
    n = int(length * SR)
    t = np.arange(n) / SR
    x = rng.standard_normal((2, n))
    lo = sos_filter(x, "lowpass", 1200, 2)
    hi = x - lo
    y = lo * np.exp(-6.9078 * t / rt60) + hi * np.exp(-6.9078 * t / (rt60 * hi_ratio))
    y = sos_filter(y, "lowpass", lp, 2)
    y *= 1 - np.exp(-t / 0.025)                      # diffuse onset
    pd = int(predelay * SR)
    y = np.concatenate([np.zeros((2, pd)), y[:, :n - pd]], 1)
    if er:
        for ch in range(2):
            for _ in range(10):
                i = int(rng.uniform(0.004, 0.07) * SR)
                y[ch, i] += rng.uniform(-1, 1) * 2.0
    y /= np.sqrt((y ** 2).sum(1, keepdims=True))
    return y.astype(np.float32)


def convolve(x, ir):
    out = np.empty_like(x)
    for c in range(2):
        out[c] = signal.oaconvolve(x[c], ir[c], mode="full")[:N]
    return out


def pingpong(x, delay, fb=0.4, taps=6, lp=3500):
    mono = 0.5 * (x[0] + x[1])
    out = np.zeros_like(x)
    d = int(delay * SR)
    for k in range(1, taps + 1):
        sh = k * d
        if sh >= N:
            break
        out[(k - 1) % 2, sh:] += (fb ** (k - 1)) * mono[:N - sh]
    return sos_filter(sos_filter(out, "lowpass", lp), "highpass", 250).astype(np.float32)


# --------------------------------------------------------------------------------------
# SFX library (each returns mono or stereo float64 array, plus pre-roll seconds)
# --------------------------------------------------------------------------------------
def fx_whoosh(dur=0.8, f0=400, f1=4000, peak=0.62, pan0=0.0, pan1=0.0, q=1.1, seed=0):
    rng = rng_for("whoosh", seed, dur, f0, f1)
    n = int(dur * SR)
    u = np.arange(n) / n
    x = rng.standard_normal(n)
    # centre frequency rises to the peak then falls a bit
    shape = np.where(u < peak, (u / peak) ** 1.5, 1 - 0.45 * ((u - peak) / (1 - peak)))
    fc = f0 * (f1 / f0) ** shape
    y = tv_biquad(x, "bp", fc, q=q, block=64)
    env = np.where(u < peak, (u / peak) ** 2.2, np.exp(-5 * (u - peak) / (1 - peak)))
    y *= env
    y = fade(y, 0.005, 0.02)
    y /= np.max(np.abs(y)) + 1e-9
    st = pan_move(y, pan0, pan1)
    # slight decorrelation for width
    st[1] = np.roll(st[1], int(0.0007 * SR))
    return st, peak * dur


def fx_pop(f=700, seed=0):
    rng = rng_for("pop", seed, f)
    n = int(0.22 * SR)
    t = np.arange(n) / SR
    fr = f * (1 + 0.55 * np.exp(-t / 0.012))
    ph = 2 * np.pi * np.cumsum(fr) / SR
    y = np.sin(ph) * np.exp(-t / 0.045) * (1 - np.exp(-t / 0.0015))
    y += 0.18 * np.sin(2 * ph) * np.exp(-t / 0.02)
    y += 0.08 * sos_filter(rng.standard_normal(n), "highpass", 3000) * np.exp(-t / 0.002)
    return fade(y / np.max(np.abs(y)), 0.0005, 0.02), 0.0


def fx_blip(f=880, dur=0.25, seed=0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    y = (np.sin(2 * np.pi * f * t) + 0.12 * np.sin(6 * np.pi * f * t)) * exp_env(n, 0.004, dur / 4)
    return fade(y / np.max(np.abs(y)), 0.001, 0.02), 0.0


def fx_bell(f, dur=1.4, index=1.6, ratio=2.0, tau=0.45):
    n = int(dur * SR)
    t = np.arange(n) / SR
    I = index * np.exp(-t / 0.12) + 0.15
    y = np.sin(2 * np.pi * f * t + I * np.sin(2 * np.pi * f * ratio * t))
    y += 0.25 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t / (tau * 0.4))
    y *= exp_env(n, 0.002, tau)
    return fade(y / np.max(np.abs(y)), 0.0005, 0.05)


def fx_typing(dur, seed=0, pan=0.0):
    rng = rng_for("typing", seed, dur)
    n = int((dur + 0.2) * SR)
    out = np.zeros(n)
    tt = 0.0
    while tt < dur:
        ln = int(0.03 * SR)
        t = np.arange(ln) / SR
        space = rng.random() < 0.14
        fc = rng.uniform(1800, 2600) if space else rng.uniform(2800, 5200)
        c = sos_filter(rng.standard_normal(ln), "bandpass", [fc * 0.7, fc * 1.3]) * np.exp(-t / rng.uniform(0.003, 0.006))
        c += 0.3 * np.sin(2 * np.pi * rng.uniform(900, 1500) * t) * np.exp(-t / 0.004)
        # key release tick
        rel = int(rng.uniform(0.012, 0.022) * SR)
        c[rel:] += 0.35 * c[:ln - rel] * rng.uniform(0.3, 0.7)
        amp = rng.uniform(0.45, 1.0) * (1.25 if space else 1.0)
        i = int(tt * SR)
        out[i:i + ln] += amp * c / (np.max(np.abs(c)) + 1e-9)
        tt += rng.uniform(0.045, 0.11) + (0.08 if space else 0.0) + (rng.random() < 0.06) * 0.15
    return out, 0.0


def fx_click(seed=0):
    rng = rng_for("click", seed)
    n = int(0.2 * SR)
    t = np.arange(n) / SR
    y = np.zeros(n)
    for off, fc, a in ((0.0, 3200, 1.0), (0.075, 4200, 0.55)):
        i = int(off * SR)
        ln = n - i
        tt = t[:ln]
        c = sos_filter(rng.standard_normal(ln), "bandpass", [fc * 0.6, fc * 1.4]) * np.exp(-tt / 0.004)
        c = c / np.max(np.abs(c)) + 0.6 * np.sin(2 * np.pi * 180 * tt) * np.exp(-tt / 0.018)
        y[i:] += a * c
    return fade(y / np.max(np.abs(y)), 0.0003, 0.02), 0.0


def fx_tick(tock=False, seed=0):
    rng = rng_for("tick", seed, tock)
    n = int(0.08 * SR)
    t = np.arange(n) / SR
    f = 1900 if tock else 2600
    y = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.012)
    y += 0.6 * sos_filter(rng.standard_normal(n), "bandpass", [f * 0.8, f * 2.2]) * np.exp(-t / 0.003)
    return fade(y / np.max(np.abs(y)), 0.0003, 0.01)


def fx_thunk(seed=0):
    rng = rng_for("thunk", seed)
    n = int(0.9 * SR)
    t = np.arange(n) / SR
    fr = 58 + 70 * np.exp(-t / 0.03)
    y = np.sin(2 * np.pi * np.cumsum(fr) / SR) * np.exp(-t / 0.13)
    y += 0.5 * sos_filter(rng.standard_normal(n), "lowpass", 500, 2) * np.exp(-t / 0.03)
    # small metallic lock rattle
    lk = np.sin(2 * np.pi * 2350 * t) * np.exp(-t / 0.025) + 0.5 * np.sin(2 * np.pi * 3710 * t) * np.exp(-t / 0.015)
    y += 0.18 * lk
    # tiny bounce back
    i = int(0.16 * SR)
    y[i:] += 0.3 * y[:n - i] * np.exp(-t[:n - i] / 0.1)
    y = np.tanh(1.5 * y)
    return fade(y / np.max(np.abs(y)), 0.0005, 0.05), 0.0


def fx_glitch(seed=0):
    rng = rng_for("glitch", seed)
    n = int(0.6 * SR)
    out = np.zeros((2, n))
    tt = 0.0
    while tt < 0.5:
        ln = int(rng.uniform(0.012, 0.045) * SR)
        t = np.arange(ln) / SR
        f = rng.choice([180, 360, 720, 1440, 2200, 3100]) * rng.uniform(0.95, 1.05)
        g = np.sign(np.sin(2 * np.pi * f * t)) * 0.5 + 0.5 * rng.standard_normal(ln) * (rng.random() < 0.4)
        g = np.round(g * 6) / 6
        g = fade(g, 0.001, 0.002) * rng.uniform(0.3, 1.0) * (1 - tt / 0.7)
        p = rng.uniform(-0.7, 0.7)
        gl, gr = pan_gains(p)
        i = int(tt * SR)
        out[0, i:i + ln] += gl * g
        out[1, i:i + ln] += gr * g
        tt += ln / SR + rng.uniform(0.0, 0.03)
    out = sos_filter(out, "lowpass", 7000)
    return out / np.max(np.abs(out)), 0.0


def fx_slam(seed=0):
    b = boom(1.2, f0=95, f1=42, tau=0.25, seed=seed + 7)
    rng = rng_for("slam", seed)
    n = len(b)
    t = np.arange(n) / SR
    crack = sos_filter(rng.standard_normal(n), "bandpass", [700, 3500]) * np.exp(-t / 0.035)
    y = b + 0.5 * crack / np.max(np.abs(crack))
    st = np.zeros((2, n + int(0.02 * SR)))
    gl, gr = pan_gains(-0.55)
    st[0, :n] += gl * y; st[1, :n] += gr * y
    gl, gr = pan_gains(0.55)
    i = int(0.02 * SR)
    st[0, i:] += gl * y; st[1, i:] += gr * y
    return st / np.max(np.abs(st)), 0.0


def fx_birth(f=1175, seed=0):
    n = int(1.6 * SR)
    t = np.arange(n) / SR
    y = np.zeros(n)
    p, _ = fx_pop(f * 0.5, seed)
    y[:len(p)] += 0.7 * p
    fr = 55 + 110 * np.exp(-t / 0.08)
    y += 0.55 * np.sin(2 * np.pi * np.cumsum(fr) / SR) * np.exp(-t / 0.22) * (1 - np.exp(-t / 0.004))
    bl = fx_bell(f, 1.6, index=1.0, tau=0.5)
    y += 0.45 * bl
    return y / np.max(np.abs(y)), 0.0


def render_sfx(sfx_list):
    dry, wet = bus(), bus()
    for k, s in enumerate(sfx_list):
        typ, t, g = s["type"], float(s["t"]), float(s.get("gain", 0.5))
        pan = float(s.get("pan", 0.0))
        seed = k
        rv = 0.25
        if typ == "whoosh" or typ == "draw":
            if typ == "draw":
                x, pre = fx_whoosh(s.get("dur", 1.0), 1500, 7000, 0.5, -0.4, 0.4, q=2.0, seed=seed)
                g *= 0.6
            else:
                x, pre = fx_whoosh(s.get("dur", 0.8), s.get("f0", 400), s.get("f1", 4000), s.get("peak", 0.62),
                                   s.get("pan0", pan), s.get("pan1", pan), seed=seed)
            place(dry, x, t - pre, g * 0.7); rv = 0.35
            place(wet, x, t - pre, g * 0.7 * rv)
            continue
        if typ == "entrance":  # soft warm panel entrance: dark swelling whoosh + low felt thump + glassy bloom
            x, pre = fx_whoosh(s.get("dur", 1.2), 150, 1400, 0.7, -0.3, 0.3, q=0.7, seed=seed)
            place(dry, x, t - pre, g * 0.6); place(wet, x, t - pre, g * 0.3)
            n = int(0.8 * SR)
            tt = np.arange(n) / SR
            th = np.sin(2 * np.pi * np.cumsum(70 + 50 * np.exp(-tt / 0.05)) / SR) * np.exp(-tt / 0.18) * (1 - np.exp(-tt / 0.008))
            place(dry, th, t, g * 0.35)
            for i, mi in enumerate((70, 77, 81)):          # Bb-F-A, the Bbmaj9 the score settles on
                y = fx_bell(float(hz(mi)), 1.8, index=0.5, tau=0.6)
                place(dry, y, t + 0.03 * i, g * 0.07, -0.3 + 0.3 * i); place(wet, y, t + 0.03 * i, g * 0.14)
            continue
        if typ == "land":        # small landing blip: soft pop + glassy tick
            y, _ = fx_pop(880, seed)
            b = fx_bell(float(hz(88)), 0.9, index=0.6, tau=0.25)
            place(dry, y, t, g * 0.4, pan); place(wet, y, t, g * 0.15, pan)
            place(dry, b, t + 0.01, g * 0.15, pan); place(wet, b, t + 0.01, g * 0.2, pan)
            continue
        if typ == "softimpact":  # soft rounded low impact (no crack)
            y = sos_filter(boom(1.6, f0=85, f1=46, tau=0.32, seed=seed + 11), "lowpass", 700)
            place(dry, y, t, g * 0.5, pan); place(wet, y, t, g * 0.3, pan)
            continue
        if typ == "collapse":   # reverse whoosh that sucks into the point
            x, pre = fx_whoosh(s.get("dur", 0.8), 5000, 500, 0.85, 0.0, 0.0, seed=seed)
            place(dry, x, t, g * 0.8); place(wet, x, t, g * 0.3)
            continue
        if typ == "zip":
            d = s.get("dur", 0.5)
            n = int(d * SR)
            tt = np.arange(n) / SR
            fr = 500 * (5.0 ** (tt / d))
            y = np.sin(2 * np.pi * np.cumsum(fr) / SR) * np.sin(np.pi * tt / d) ** 2
            rng = rng_for("zipn", k)
            y = 0.5 * y + 0.5 * sos_filter(rng.standard_normal(n), "bandpass", [2000, 8000]) * np.sin(np.pi * tt / d) ** 2
            x = pan_move(y / np.max(np.abs(y)), s.get("pan0", 0), s.get("pan1", 0))
            place(dry, x, t, g * 0.5); place(wet, x, t, g * 0.2)
            continue
        if typ in ("pop", "snap"):
            if typ == "snap":
                y = snap_sample(k)
                place(dry, y, t, g * 0.5, pan); place(wet, y, t, g * 0.25, pan)
                continue
            y, _ = fx_pop(s.get("f", 700), seed)
            place(dry, y, t, g * 0.5, pan); place(wet, y, t, g * 0.15, pan)
            continue
        if typ in ("pops", "stack", "stagger", "rise"):
            nn, step = int(s.get("n", 3)), float(s.get("step", 0.12))
            f0 = s.get("f", 700)
            for i in range(nn):
                if typ == "stack":        # both laptops, L then R slightly later
                    tl = s.get("times") or [t + j * step for j in range(nn)]
                    for j, tj in enumerate(tl):
                        for side, dt in ((-0.6, 0.0), (0.6, 0.07)):
                            y, _ = fx_pop(560 + 70 * j, seed * 10 + j)
                            place(dry, y, tj + dt, g * 0.4, side)
                            place(wet, y, tj + dt, g * 0.1, side)
                    break
                if typ == "stagger":
                    y, _ = fx_blip(s.get("f", 1320) * (1 + 0.03 * i), 0.12, seed)
                    place(dry, y, t + i * step, g * 0.4, pan); place(wet, y, t + i * step, g * 0.15, pan)
                    continue
                if typ == "rise":
                    y, _ = fx_blip(float(hz(74 + [0, 3, 5, 7][i % 4])), 0.3, seed)
                    place(dry, y, t + i * step, g * 0.4, -0.2 + 0.1 * i)
                    place(wet, y, t + i * step, g * 0.25, -0.2 + 0.1 * i)
                    continue
                y, _ = fx_pop(f0 * (1 + 0.12 * i), seed * 10 + i)
                pp = pan + (i - (nn - 1) / 2) * 0.35
                place(dry, y, t + i * step, g * 0.45, pp)
                place(wet, y, t + i * step, g * 0.15, pp)
            continue
        if typ == "blip":
            y, _ = fx_blip(s.get("f", 880), 0.3, seed)
            place(dry, y, t, g * 0.4, pan); place(wet, y, t, g * 0.2, pan)
            continue
        if typ == "blink":
            y, _ = fx_blip(1568, 0.12, seed)
            place(dry, y, t, g * 0.3, pan); place(wet, y, t, g * 0.3, pan)
            continue
        if typ in ("up", "down"):
            notes = (72, 79) if typ == "up" else (79, 72)
            for i, m in enumerate(notes):
                y, _ = fx_blip(float(hz(m)), 0.25, seed + i)
                place(dry, y, t + i * 0.09, g * 0.5, pan)
                place(wet, y, t + i * 0.09, g * 0.2, pan)
            continue
        if typ == "air":
            x, pre = fx_whoosh(0.7, 2000, 9000, 0.5, -0.2, 0.2, q=0.8, seed=seed)
            place(dry, x, t - pre, g * 0.25); place(wet, x, t - pre, g * 0.12)
            continue
        if typ in ("sparkle", "stream"):
            d = s.get("dur", 1.5)
            notes = [81, 84, 86, 88, 89, 91, 93, 96] if typ == "sparkle" else [76, 79, 81, 84, 86, 88, 91]
            x = sparkle_grains(d, 14 if typ == "sparkle" else 22, notes, seed=seed,
                               grain_tau=(0.05, 0.25), ramp="up" if typ == "stream" else None)
            if typ == "stream":
                w, pre = fx_whoosh(d, 600, 6000, 0.9, -0.5 + pan, 0.3 + pan, q=0.9, seed=seed)
                place(dry, w, t, g * 0.35); place(wet, w, t, g * 0.1)
            if pan:
                x[0] *= 1 - max(0, pan) * 0.7
                x[1] *= 1 + min(0, pan) * 0.7
            place(dry, x, t, g * 0.25); place(wet, x, t, g * 0.25)
            continue
        if typ == "bloom":
            n = int(2.2 * SR)
            tt = np.arange(n) / SR
            y = sum(np.sin(2 * np.pi * float(hz(m)) * tt) for m in (74, 81, 86)) / 3
            y *= (1 - np.exp(-tt / 0.25)) * np.exp(-tt / 0.7)
            place(dry, y, t, g * 0.35, pan); place(wet, y, t, g * 0.3, pan)
            continue
        if typ == "sweep":
            d = s.get("dur", 1.1)
            x, pre = fx_whoosh(d, 2500, 13000, 0.55, -0.8, 0.8, q=2.2, seed=seed)
            sp = sparkle_grains(d, 18, [88, 91, 93, 96, 98, 100], seed=seed, grain_tau=(0.04, 0.2))
            place(dry, x, t - 0.15, g * 0.6); place(wet, x, t - 0.15, g * 0.3)
            place(dry, sp, t, g * 0.2); place(wet, sp, t, g * 0.25)
            continue
        if typ == "pulse":
            d = s.get("dur", 1.4)
            x, pre = fx_whoosh(d, 250, 3000, 0.2, 0.0, 0.0, q=0.7, seed=seed)
            sp = sparkle_grains(d, 16, [77, 81, 84, 89, 91, 93], seed=seed, grain_tau=(0.05, 0.3))
            place(dry, x, t - pre, g * 0.45); place(wet, x, t - pre, g * 0.3)
            place(dry, sp, t, g * 0.25); place(wet, sp, t, g * 0.3)
            continue
        if typ == "slam":
            x, _ = fx_slam(seed)
            place(dry, x, t, g * 0.6); place(wet, x, t, g * 0.3)
            continue
        if typ == "glitch":
            x, _ = fx_glitch(seed)
            place(dry, x, t, g * 0.7); place(wet, x, t, g * 0.2)
            continue
        if typ == "typing":
            y, _ = fx_typing(s.get("dur", 1.5), seed, pan)
            place(dry, y, t, g * 0.45, pan); place(wet, y, t, g * 0.05, pan)
            continue
        if typ == "birth":
            y, _ = fx_birth(s.get("f", 1175), seed)
            place(dry, y, t, g * 0.4, pan); place(wet, y, t, g * 0.35, pan)
            continue
        if typ == "ding":
            for i, m in enumerate((81, 86)):
                y = fx_bell(float(hz(m)), 1.2, index=0.8, tau=0.35)
                place(dry, y, t + i * 0.11, g * 0.28, pan); place(wet, y, t + i * 0.11, g * 0.25, pan)
            continue
        if typ == "alert":     # soft two-tone (A5 -> F5), played twice, second quieter
            for rep, ra in ((0, 1.0), (0.42, 0.55)):
                for i, m in enumerate((81, 77)):
                    n = int(0.5 * SR)
                    tt = np.arange(n) / SR
                    f = float(hz(m))
                    y = np.sin(2 * np.pi * f * tt) + 0.25 * np.sin(2 * np.pi * 2 * f * tt) * np.exp(-tt / 0.05)
                    y += 0.12 * polyblep_saw(f, n) * np.exp(-tt / 0.03)
                    y *= exp_env(n, 0.006, 0.13)
                    y = fade(y, 0.001, 0.03)
                    place(dry, y, t + rep + i * 0.16, g * 0.6 * ra)
                    place(wet, y, t + rep + i * 0.16, g * 0.4 * ra)
            continue
        if typ == "click":
            y, _ = fx_click(seed)
            place(dry, y, t, g * 0.6, pan); place(wet, y, t, g * 0.1, pan)
            continue
        if typ == "chime":     # F major bell arpeggio + sparkle
            for i, m in enumerate((77, 81, 84, 89)):
                y = fx_bell(float(hz(m)), 2.4, index=1.2, tau=0.8 - 0.1 * i)
                p = -0.45 + 0.3 * i
                place(dry, y, t + i * 0.075, g * 0.22, p)
                place(wet, y, t + i * 0.075, g * 0.3, p)
            sp = sparkle_grains(1.0, 10, [89, 93, 96, 101], seed=seed, grain_tau=(0.05, 0.2))
            place(dry, sp, t + 0.2, g * 0.12); place(wet, sp, t + 0.2, g * 0.2)
            continue
        if typ == "thunk":
            y, _ = fx_thunk(seed)
            place(dry, y, t, g * 0.55, pan); place(wet, y, t, g * 0.15, pan)
            continue
        if typ == "clock":
            d, iv = s.get("dur", 2.0), s.get("interval", 0.25)
            for i in range(int(round(d / iv))):
                y = fx_tick(i % 2 == 1, seed + i)
                place(dry, y, t + i * iv, g * 0.6 * (0.85 + 0.15 * (i % 2 == 0)), -0.15)
                place(wet, y, t + i * iv, g * 0.1, -0.15)
            continue
        print("  ! unknown sfx type", typ, s.get("label"))
    return dry, wet


# --------------------------------------------------------------------------------------
# Harmony / arrangement
# --------------------------------------------------------------------------------------
CHORDS = {  # name: (bass midi, pad notes)
    "Dm9": (38, [50, 57, 60, 64, 65]),
    "Bbmaj9": (34, [46, 53, 57, 60, 62]),
    "Bbmaj7s11": (34, [46, 53, 57, 62, 64]),
    "Fadd9": (41, [53, 57, 60, 65, 67]),
    "Fmaj9": (41, [53, 60, 64, 67, 69]),
    "CE": (40, [52, 55, 60, 62, 67]),
    "Gm9": (43, [55, 58, 62, 65, 69]),
    "Csus4": (36, [48, 53, 55, 60, 65]),
    "C": (36, [48, 52, 55, 60, 64]),
    "Dm_b9": (38, [50, 57, 62, 63, 65]),
    "Dm_dark": (38, [50, 53, 57, 58]),
    "Dm": (38, [50, 57, 62, 65, 69]),
    "Bb": (34, [46, 53, 58, 62, 65]),
    "A7sus4": (33, [45, 52, 55, 57, 62, 64]),
    "Fmaj9_big": (41, [41, 48, 53, 57, 60, 64, 67, 69, 72]),
}


def chord_segments(m):
    """[(t0, t1, chord, opts)] -- arrangement follows the story marks."""
    S = []

    def add(t0, t1, ch, **kw):
        if t1 > t0:
            S.append((t0, t1, ch, kw))

    def cycle(t0, t1, names, step=4.0, **kw):
        t = t0
        i = 0
        while t < t1 - 1e-6:
            add(t, min(t1, t + step), names[i % len(names)], **kw)
            t += step
            i += 1

    slow = dict(attack=2.0, release=3.0)
    add(m.hook, 7.0, "Dm9", **slow)
    add(7.0, 10.5, "Bbmaj7s11", **slow)
    add(10.5, m.problem, "Gm9", **slow)
    add(m.problem, m.impact, "Dm_b9", attack=2.5, release=0.6)
    add(m.impact, m.title_hit, "Dm_dark", attack=0.8, release=1.5)
    add(m.title_hit, m.lock, "Bbmaj9", attack=1.2, release=1.2)
    add(m.lock, m.lock + 4.0, "Fmaj9", attack=0.06, release=2.5)
    add(m.lock + 4.0, m.groove, "CE", attack=1.0, release=1.5)
    grv = dict(attack=0.5, release=1.4)
    cycle(m.groove, m.offline, ["Dm9", "Bbmaj9", "Fadd9", "CE"], **grv)
    cycle(m.offline, m.meanwhile, ["Dm9", "Bbmaj9"], step=8.0, attack=1.5, release=2.5)
    add(m.meanwhile, m.meanwhile + 4.0, "Gm9", attack=1.2, release=2.0)
    add(m.meanwhile + 4.0, m.reconnect - 0.5, "Csus4", attack=1.2, release=1.0)
    add(m.reconnect - 0.5, m.pulse, "Bbmaj9", attack=0.3, release=1.0)
    add(m.pulse, m.conflict, "Fadd9", attack=0.05, release=0.8)
    add(m.conflict, m.conflict + 2.0, "Dm", attack=0.05, release=1.0)
    add(m.conflict + 2.0, m.found, "Bb", attack=0.4, release=1.0)
    add(m.found, m.disputed, "C", attack=0.3, release=1.0)
    add(m.disputed, m.calm, "A7sus4", attack=0.8, release=2.8)
    add(m.calm, m.calm + 4.0, "Bbmaj9", attack=1.5, release=2.5)
    add(m.calm + 4.0, m.resolve - 2.0, "Gm9", attack=1.5, release=2.0)
    add(m.resolve - 2.0, m.resolve, "Csus4", attack=1.0, release=0.8)
    add(m.resolve, m.tiers, "Fmaj9", attack=0.25, release=2.0)
    cycle(m.tiers, m.honesty, ["Fadd9", "CE", "Dm9", "Bbmaj9"], **grv)
    add(m.honesty, m.honesty + 3.5, "Bbmaj9", attack=1.5, release=2.0)
    add(m.honesty + 3.5, m.close, "Csus4", attack=1.5, release=1.5)
    add(m.close, m.close + 3.0, "Dm9", attack=1.0, release=1.2)
    add(m.close + 3.0, m.wordmark, "Bbmaj9", attack=1.0, release=0.8)
    add(m.wordmark, m.end - 0.8, "Fmaj9_big", attack=0.08, release=3.0)
    return S


def chord_at(segs, t):
    for s in segs:
        if s[0] <= t < s[1]:
            return s[2]
    return segs[-1][2]


def grid(t0, t1, step, offset=0.0):
    k0 = int(np.ceil((t0 - offset) / step - 1e-9))
    k1 = int(np.ceil((t1 - offset) / step - 1e-9))
    return [offset + k * step for k in range(k0, k1)]


def compose_music(m):
    t_start = time.time()
    segs = chord_segments(m)
    dry, long_send, short_send, delay_send = bus(), bus(), bus(), bus()

    # ---------------- pads (supersaw through automated LPF) ----------------
    pad = bus()
    for (t0, t1, ch, o) in segs:
        _, notes = CHORDS[ch]
        for i, mi in enumerate(notes):
            rng = rng_for("pad", round(t0, 3), mi)
            off = rng.uniform(0, 0.035)
            w = 1.0 if i < len(notes) - 1 else 0.8
            if ch == "Fmaj9_big":
                w *= 0.75
            x = pad_note(mi, max(0.05, t1 - t0 - off), o.get("attack", 1.0), o.get("release", 2.0), rng)
            place(pad, x, t0 + off, 0.16 * w)
    print(f"  pads rendered  {time.time() - t_start:5.1f}s")
    cut = curve([
        (0, 480), (5, 650), (10, 600), (m.problem, 600), (m.impact - 0.05, 1900), (m.impact, 350),
        (m.title_hit - 3.5, 450), (m.title_hit - 0.05, 1500), (m.title_hit, 900), (m.lock - 0.05, 1300),
        (m.lock, 4200), (m.lock + 4, 2400), (m.groove, 1300), (m.claims, 2000), (m.offline - 0.5, 2600),
        (m.offline, 2200), (m.reconnect - 0.6, 2200), (m.reconnect, 3000), (m.pulse, 6000), (m.conflict, 4000),
        (m.disputed, 4500), (m.calm, 5000), (m.calm + 1.6, 1500), (m.resolve - 0.1, 2000), (m.resolve, 4000),
        (m.tiers - 1, 2400), (m.tiers, 2200), (m.honesty - 0.5, 2800), (m.honesty, 1300), (m.close, 1200),
        (m.wordmark - 0.1, 4500), (m.wordmark, 6500), (m.end, 1500)], log=True)
    lfo = 2.0 ** (0.25 * np.sin(2 * np.pi * 0.07 * T)).astype(np.float32)
    pad = sos_filter(pad, "highpass", 90).astype(np.float32)
    pad = tv_biquad(pad, "lp", cut * lfo, q=0.8, block=128, stages=2).astype(np.float32)
    pad_gain = curve([
        (0, -9), (m.problem - 0.5, -8), (m.problem, -7), (m.impact - 0.05, -1), (m.impact, -6),
        (m.title_hit - 0.1, -3), (m.title_hit, -7), (m.lock - 0.1, -5), (m.lock, 0), (m.groove - 1, -3),
        (m.groove, -4), (m.claims, -3), (m.offline, -2), (m.reconnect - 0.3, -2), (m.reconnect, 0),
        (m.pulse, 1), (m.conflict, 0), (m.calm, 1), (m.calm + 1.6, -5), (m.resolve - 0.1, -4),
        (m.resolve, -1), (m.tiers - 1, -3), (m.tiers, -4), (m.honesty - 0.2, -4), (m.honesty, -6),
        (m.close - 0.2, -6), (m.close, -4), (m.wordmark - 0.1, 0), (m.wordmark, 2), (m.end, -4)], is_db=True)

    # sidechain envelope from kick hits (filled later, applied at the end to pad/sub)
    kicks = []

    # ---------------- sub bass ----------------
    sub = bus()
    for (t0, t1, ch, o) in segs:
        b, _ = CHORDS[ch]
        x = sub_note(b, max(0.1, t1 - t0), attack=min(0.3, o.get("attack", 0.5)), release=0.4)
        place(sub, x, t0, 0.18)
    sub_gain = curve([
        (0, -40), (m.problem, -40), (m.lock - 0.01, -40), (m.lock, -6), (m.groove, -2), (m.offline - 0.5, -1), (m.airplane + 0.5, -5),
        (m.reconnect, 0), (m.disputed - 0.01, 0), (m.disputed, -40), (m.calm, -40), (m.calm + 0.01, -10),
        (m.resolve - 0.01, -10), (m.resolve, -4), (m.tiers, -1), (m.honesty - 0.01, -1), (m.honesty, -40),
        (m.close, -40), (m.close + 0.01, -5), (m.wordmark, 0), (m.end, -6)], is_db=True)

    # ---------------- low pulse (problem + held tension) ----------------
    pulse = bus()
    for tt in grid(m.problem, m.impact, 0.25):
        acc = 1.0 if (round(tt / 0.25) % 2 == 0) else 0.6
        place(pulse, pulse_note(38), tt, 0.5 * acc * (0.6 + 0.4 * (tt - m.problem) / (m.impact - m.problem)))
    for tt in grid(m.glitch + 1.0, m.title_hit, 0.25):
        acc = 1.0 if (round(tt / 0.25) % 2 == 0) else 0.6
        place(pulse, pulse_note(38), tt, 0.55 * acc)
    for tt in grid(m.disputed, m.calm + 1.5, 0.25):
        acc = 1.0 if (round(tt / 0.25) % 2 == 0) else 0.55
        settle = 1.0 if tt < m.calm else max(0.0, 1 - (tt - m.calm) / 1.5) ** 1.5   # settle, not a cliff
        place(pulse, pulse_note(45), tt, 0.55 * acc * settle)
    dry += pulse
    short_send += 0.15 * pulse

    # ---------------- lead / string line ----------------
    lead = bus()
    lead_notes = [(m.problem, m.impact, 75, 0.8), (m.glitch + 1.0, m.title_hit, 74, 0.6),
                  (m.conflict + 0.5, m.conflict + 2.0, 69, 0.7), (m.conflict + 2.0, m.found, 70, 0.8),
                  (m.found, m.disputed, 72, 0.9), (m.disputed, m.calm + 0.8, 76, 0.8),
                  (m.close + 1.0, m.close + 3.0, 72, 0.6), (m.close + 3.0, m.wordmark, 74, 0.8),
                  (m.wordmark, m.wordmark + 3.5, 77, 0.8)]
    for (t0, t1, mi, a) in lead_notes:
        rng = rng_for("lead", t0)
        x = pad_note(mi, t1 - t0, attack=min(1.5, (t1 - t0) * 0.6), release=1.2, rng=rng, voices=3, detune=7)
        n = x.shape[1]
        tt = np.arange(n) / SR
        x *= 1 + 0.08 * np.sin(2 * np.pi * 5.0 * tt) * np.clip(tt / 1.5, 0, 1)   # gentle tremolo
        place(lead, x, t0, 0.12 * a)
    lead = sos_filter(sos_filter(lead, "lowpass", 2600, 2), "highpass", 200).astype(np.float32)
    dry += 0.7 * lead
    long_send += 0.8 * lead

    # ---------------- arpeggio (KS plucks, 8ths / 16ths) ----------------
    arp = bus()
    arp_regions = [(m.groove, m.offline, 0.25), (m.offline, m.reconnect, 0.25), (m.reconnect, m.pulse, 0.25),
                   (m.pulse, m.disputed, 0.125), (m.disputed, m.calm + 1.5, 0.25),
                   (m.resolve, m.tiers, 0.5), (m.tiers, m.honesty, 0.25), (m.close, m.close + 3.0, 0.25),
                   (m.close + 3.0, m.wordmark, 0.125)]
    pattern = [0, 2, 4, 1, 3, 5, 2, 4, 0, 3, 5, 2, 4, 6, 3, 5]
    accents = [1.0, 0.55, 0.8, 0.55, 0.9, 0.55, 0.75, 0.6]
    for (r0, r1, step) in arp_regions:
        for tt in grid(r0, r1, step):
            ch = chord_at(segs, tt + 0.01)
            _, notes = CHORDS[ch]
            pcs = sorted({x % 12 for x in notes})
            tones = sorted(p + 12 * o for o in range(4, 8) for p in pcs if 62 <= p + 12 * o <= 81)
            k = int(round(tt / step))
            idx = pattern[k % len(pattern)] % len(tones)
            rng = rng_for("arp", round(tt, 3))
            vel = accents[k % len(accents)] * rng.uniform(0.85, 1.05)
            y = pluck(tones[idx], t60=0.9 if step < 0.3 else 1.4, dur=1.4, bright=0.5, variant=k % 3)
            place(arp, y, tt + rng.normal(0, 0.004), 0.42 * vel, pan=0.35 * np.sin(k * 0.9))
    arp_gain = curve([
        (m.groove, -8), (m.groove + 8, -3), (m.offline - 0.5, -2), (m.offline, -5), (m.meanwhile, -4),
        (m.reconnect - 0.2, -3), (m.reconnect, -1), (m.pulse, 0), (m.disputed, -3), (m.calm, -4), (m.calm + 1.5, -22), (m.calm + 1.51, -6),
        (m.resolve, -6), (m.tiers, -2), (m.honesty, -2), (m.close, -4), (m.wordmark, 0)], is_db=True)
    arp *= arp_gain
    dry += arp
    delay_send += 0.45 * arp
    short_send += 0.35 * arp
    long_send += 0.15 * arp

    # ---------------- solo pluck motif (hook, calm, honesty, ending) ----------------
    motif = bus()
    mot = [(1.0, 69), (2.0, 76), (2.5, 74), (3.5, 69),
           (5.0, 69), (6.0, 77), (6.5, 76), (7.5, 72),
           (9.0, 69), (10.0, 76), (10.5, 74), (11.5, 70), (12.5, 69),
           (m.calm + 1.0, 77), (m.calm + 2.0, 74), (m.calm + 3.0, 72), (m.calm + 4.5, 74), (m.calm + 5.5, 70),
           (m.calm + 7.0, 72), (m.resolve - 1.5, 72), (m.resolve - 1.0, 74), (m.resolve, 77), (m.resolve + 0.5, 81),
           (m.honesty + 0.5, 81), (m.honesty + 1.5, 77), (m.honesty + 2.5, 76), (m.honesty + 4.0, 74),
           (m.honesty + 5.0, 72), (m.honesty + 6.0, 77),
           (m.wordmark + 1.0, 81), (m.wordmark + 2.0, 84), (m.wordmark + 3.0, 88)]
    for i, (tt, mi) in enumerate(mot):
        y = pluck(mi, t60=2.2, dur=3.0, bright=0.4, variant=i % 3)
        place(motif, y, tt, 0.2, pan=[-0.25, 0.2, -0.1, 0.3][i % 4])
    dry += motif
    delay_send += 0.5 * motif
    long_send += 0.6 * motif

    # ---------------- shimmer (high sine partials, very wet) ----------------
    shim = bus()
    shim_regions = [(m.lock, m.groove, 1.0), (m.pulse, m.conflict + 0.5, 0.8), (m.resolve, m.tiers, 0.9),
                    (m.honesty, m.close, 0.5), (m.wordmark, m.end, 1.0), (m.hook + 0.5, m.problem, 0.25)]
    for (r0, r1, a) in shim_regions:
        for (t0, t1, ch, o) in segs:
            s0, s1 = max(r0, t0), min(r1, t1)
            if s1 - s0 < 0.2:
                continue
            _, notes = CHORDS[ch]
            for mi in notes[-3:]:
                rng = rng_for("shim", round(s0, 3), mi)
                n = int((s1 - s0 + 2.0) * SR)
                tt = np.arange(n) / SR
                f = float(hz(mi + 24))
                y = np.sin(2 * np.pi * f * tt + 0.002 * np.sin(2 * np.pi * 4.5 * tt))
                trem = 0.55 + 0.45 * np.sin(2 * np.pi * rng.uniform(0.15, 0.6) * tt + rng.uniform(0, 6.28))
                env = np.clip(tt / 0.6, 0, 1) * np.clip((s1 - s0 + 2.0 - tt) / 2.0, 0, 1)
                place(shim, y * trem * env, s0, 0.05 * a, pan=rng.uniform(-0.7, 0.7))
    dry += 0.4 * shim
    long_send += 1.2 * shim

    # ---------------- drums ----------------
    drums = bus()
    K = [kick_sample(v) for v in range(3)]
    H = [hat_sample(v) for v in range(4)]
    SH = [shaker_sample(v) for v in range(4)]
    SN = [snap_sample(v) for v in range(3)]

    def kick_at(tt, v=1.0):
        kicks.append((tt, v))
        place(drums, K[len(kicks) % 3], tt, 0.42 * v)

    # 32-46 kick 1&3 ; 46-58 + ghost + snap
    for tt in grid(m.groove, m.offline, 1.0):
        kick_at(tt, 0.8 if (tt - m.groove) < 8 else 0.9)
    for tt in grid(m.claims, m.offline, 2.0, 1.75):
        kick_at(tt, 0.45)
    for tt in grid(m.groove + 4, m.offline, 0.25):
        rng = rng_for("sh", round(tt, 3))
        place(drums, SH[int(tt * 4) % 4], tt, 0.05 * (1.3 if int(round(tt * 4)) % 2 else 0.8) * rng.uniform(0.8, 1.1),
              pan=0.25)
    for tt in grid(m.groove + 8, m.offline, 0.5, 0.25):
        rng = rng_for("hh", round(tt, 3))
        place(drums, H[int(tt * 4) % 4], tt, 0.07 * rng.uniform(0.8, 1.1), pan=-0.2)
    for tt in grid(m.claims, m.offline, 1.0, 0.5):
        place(drums, SN[int(tt) % 3], tt, 0.12)
    # offline: muffled heartbeat kick (global LPF does the muffling)
    for tt in grid(m.offline, m.reconnect - 0.5, 1.0):
        kick_at(tt, 0.55)
    for tt in grid(m.offline, m.reconnect - 0.5, 0.5, 0.25):
        place(drums, SH[int(tt * 4) % 4], tt, 0.05, pan=0.2)
    # hero
    kick_at(m.reconnect, 1.0)
    for tt in grid(m.reconnect + 0.5, m.pulse, 0.5):
        kick_at(tt, 0.65)
    for tt in grid(m.pulse, m.disputed, 0.5):
        kick_at(tt, 0.95)
    for tt in grid(m.reconnect, m.disputed, 0.125):
        k16 = int(round(tt / 0.125))
        rng = rng_for("h16", round(tt, 3))
        a = (0.075 if k16 % 2 else 0.045) * rng.uniform(0.8, 1.1)
        if tt < m.pulse:
            a *= 0.6
        place(drums, H[k16 % 4], tt, a, pan=0.3 if k16 % 2 else -0.3)
    for tt in grid(m.pulse, m.disputed, 1.0, 0.5):
        place(drums, SN[int(tt) % 3], tt, 0.16)
    # held tension: downbeat only
    for tt in grid(m.disputed, m.calm - 1.0, 2.0):
        kick_at(tt, 0.5)
    for tt in grid(m.disputed, m.calm + 1.0, 0.5, 0.25):
        place(drums, H[int(tt * 4) % 4], tt, 0.035 * (1.0 if tt < m.calm else 0.5), pan=0.2)
    # tiers / proactive: lighter confident groove
    for tt in grid(m.tiers, m.honesty, 1.0):
        kick_at(tt, 0.8)
    for tt in grid(m.tiers + 2, m.honesty, 2.0, 1.75):
        kick_at(tt, 0.4)
    for tt in grid(m.tiers, m.honesty, 0.5, 0.25):
        rng = rng_for("hh2", round(tt, 3))
        place(drums, H[int(tt * 4) % 4], tt, 0.065 * rng.uniform(0.8, 1.1), pan=-0.2)
    for tt in grid(m.tiers, m.honesty, 0.25):
        place(drums, SH[int(tt * 4) % 4], tt, 0.04 * (1.3 if int(round(tt * 4)) % 2 else 0.8), pan=0.3)
    for tt in grid(m.tiers + 2, m.honesty, 1.0, 0.5):
        place(drums, SN[int(tt) % 3], tt, 0.1)
    # close build
    for tt in grid(m.close + 1.0, m.close + 3.0, 1.0):
        kick_at(tt, 0.7)
    for tt in grid(m.close + 3.0, m.wordmark, 0.5):
        kick_at(tt, 0.85)
    for tt in grid(m.close + 1.0, m.wordmark, 0.25):
        prog = (tt - m.close) / (m.wordmark - m.close)
        place(drums, H[int(tt * 4) % 4], tt, 0.03 + 0.05 * prog, pan=0.25 if int(tt * 4) % 2 else -0.25)
    for tt in grid(m.wordmark - 1.0, m.wordmark, 0.125):   # soft snap roll into the wordmark
        prog = (tt - (m.wordmark - 1.0))
        place(drums, SN[int(tt * 8) % 3], tt, 0.03 + 0.1 * prog ** 2)
    kick_at(m.wordmark, 1.1)
    dry += drums
    short_send += 0.18 * drums

    # sidechain: pads/sub duck under kicks
    trig = np.zeros(N)
    for (tt, v) in kicks:
        i = int(tt * SR)
        if 0 <= i < N:
            trig[i] += v
    duck_env = signal.lfilter([1.0], [1, -np.exp(-1 / (0.16 * SR))], trig)
    duck_env = signal.lfilter([1 - np.exp(-1 / (0.004 * SR))], [1, -np.exp(-1 / (0.004 * SR))], duck_env) * 1.0
    duck = (1 - 0.3 * np.clip(duck_env, 0, 1)).astype(np.float32)
    pad_out = pad * pad_gain * duck
    dry += 0.8 * pad_out
    long_send += 0.55 * pad_out
    dry += sub * sub_gain * (1 - 0.5 * (1 - duck))

    # ---------------- FX: risers, impacts, sub drops, stabs, reverse swells ----------------
    fx = bus()
    place(fx, reverse_cymbal(1.2, 1), m.impact - 1.2, 0.25)
    place(fx, boom(3.0, seed=1), m.impact, 0.9)
    place(fx, noise_riser(m.title_hit - (m.glitch + 1.5), 250, 8000, seed=2), m.glitch + 1.5, 0.22)
    place(fx, reverse_cymbal(1.8, 2), m.title_hit - 1.8, 0.2)
    place(fx, reverse_cymbal(1.0, 3), m.lock - 1.0, 0.22)
    place(fx, sub_drop(2.5, 110, 40), m.lock, 0.7)
    place(fx, boom(2.0, f0=55, f1=36, tau=0.6, seed=3), m.lock, 0.35)
    place(fx, noise_riser(2.0, 400, 7000, seed=4), m.reconnect - 2.0, 0.18)
    place(fx, reverse_cymbal(1.6, 4), m.reconnect - 1.6, 0.25)
    place(fx, sub_drop(1.5, 90, 35), m.reconnect, 0.4)
    place(fx, noise_riser(m.disputed - m.conflict - 0.5, 300, 5000, q=1.2, power=2.0, seed=6), m.conflict + 0.5, 0.12)
    place(fx, boom(2.0, f0=60, f1=38, tau=0.5, seed=5), m.conflict, 0.45)
    place(fx, reverse_cymbal(1.2, 6), m.resolve - 1.2, 0.12)
    # soft warm entrance at the assistant panel (calm + 0.5): reverse swell into a low bloom
    place(fx, sos_filter(reverse_cymbal(1.1, 9), "lowpass", 5000), m.calm + 0.5 - 1.1, 0.14)
    place(fx, boom(2.0, f0=58, f1=42, tau=0.55, seed=9), m.calm + 0.5, 0.16)
    place(fx, noise_riser(m.wordmark - (m.close + 1.5), 250, 9000, seed=7), m.close + 1.5, 0.2)
    place(fx, reverse_cymbal(2.5, 7), m.wordmark - 2.5, 0.28)
    place(fx, sub_drop(3.0, 100, 38), m.wordmark, 0.75)
    place(fx, boom(3.5, f0=62, f1=40, tau=1.1, seed=8), m.wordmark, 0.35)
    # chord stabs (bright pulse 84, conflict 86)
    for (tt, notes, lp, a) in ((m.pulse, [65, 69, 72, 77, 79, 84], 7000, 0.14),
                              (m.conflict, [50, 62, 65, 69, 74, 75], 3000, 0.15)):
        st = np.zeros((2, int(3.0 * SR)))
        for mi in notes:
            x = pad_note(mi, 0.05, 0.004, 2.6, rng_for("stab", tt, mi), voices=5, detune=16)
            st[:, :x.shape[1]] += x
        st = sos_filter(st, "lowpass", lp, 2)
        place(fx, st, tt, a)
    dry += fx
    long_send += 0.6 * fx
    print(f"  music layers    {time.time() - t_start:5.1f}s")

    # ---------------- space ----------------
    ir_long = make_ir(4.2, 6.0, "long", lp=8000)
    ir_short = make_ir(1.3, 2.0, "short", lp=9000)
    music = dry.astype(np.float32)
    music += 0.5 * convolve(sos_filter(long_send, "highpass", 180).astype(np.float32), ir_long)
    music += 0.35 * convolve(short_send, ir_short)
    music += 0.35 * pingpong(delay_send, 0.375, fb=0.42, taps=7)
    print(f"  reverb          {time.time() - t_start:5.1f}s")

    # ---------------- tone: remove DC / sub-25 Hz rumble, add a little air ----------------
    music = sos_filter(music, "highpass", 28, 4)
    music = (music + high_shelf_add(music, 7000, 2.5)).astype(np.float32)

    # ---------------- "no signal": low-pass the whole score 58-82 ----------------
    glpf = curve([(0, 21000), (m.offline - 0.6, 21000), (m.offline + 0.4, 1800), (m.airplane, 1400),
                  (m.airplane + 0.7, 620), (m.meanwhile, 680), (m.meanwhile + 1.5, 800),
                  (m.reconnect - 0.7, 1300), (m.reconnect - 0.05, 1600), (m.reconnect + 0.35, 21000),
                  (DUR, 21000)], log=True)
    i0, i1 = int((m.offline - 1.0) * SR), int((m.reconnect + 1.0) * SR)
    seg = tv_biquad(music[:, i0:i1], "lp", glpf[i0:i1], q=0.75, block=64, stages=2)
    music[:, i0:i1] = seg.astype(np.float32)

    # ---------------- overall dynamic arc of the score ----------------
    arc = curve([(0, 2.5), (m.problem - 1.0, 2.0), (m.problem + 1.0, -1.5), (m.impact - 0.1, 0), (m.impact, 0), (m.title_hit, -1.5),
                 (m.lock, 0), (m.groove - 1, -1), (m.groove, -3), (m.claims, -1.5), (m.offline - 0.5, -0.5),
                 (m.airplane + 0.5, -5), (m.reconnect - 0.4, -4), (m.reconnect, 1.5), (m.pulse, 2.5),
                 (m.disputed, 1.5), (m.calm, 1.5), (m.calm + 1.6, -2), (m.resolve - 0.1, -1.5), (m.resolve, 0),
                 (m.tiers, -1), (m.honesty - 0.2, -1), (m.honesty, -1.5), (m.close, -1.5),
                 (m.wordmark - 0.1, 1), (m.wordmark, 2.5), (m.end, 2.5)], is_db=True)
    music *= arc
    if DEBUG:
        for name, b in (("pads", 0.8 * pad_out), ("sub", sub * sub_gain), ("arp", arp), ("drums", drums),
                        ("fx", fx), ("lead", lead), ("motif", motif), ("pulse", pulse), ("shim", 0.4 * shim),
                        ("MUSIC", music)):
            row = []
            for a_, b_ in ((0.5, 14), (14, 24), (24, 32), (32, 58), (60, 82), (82.5, 100), (100, 114),
                           (114, 131), (131, 138), (138, 144), (144, 148)):
                seg_ = b[:, int(a_ * SR):int(b_ * SR)]
                row.append(20 * np.log10(np.sqrt((seg_.astype(np.float64) ** 2).mean()) + 1e-9))
            print(f"    {name:6s}" + "".join(f"{v:7.1f}" for v in row))

    # ---------------- glitch stutter on the score at the "?" ----------------
    stutter(music, m.glitch)
    print(f"  music done      {time.time() - t_start:5.1f}s")
    return music


def high_shelf_add(x, fc, gain_db):
    """Return the component to ADD for a simple high shelf (parallel high-pass)."""
    hp = sos_filter(x, "highpass", fc, 2)
    return (db(gain_db) - 1.0) * hp


def stutter(x, t):
    rng = rng_for("stutter", t)
    i0 = int(t * SR)
    src = x[:, i0 - int(0.03 * SR): i0 + int(0.12 * SR)].copy()
    lens = [0.075, 0.075, 0.075, 0.05, 0.05, 0.035, 0.035, 0.025, 0.025, 0.02, 0.02, 0.06]
    pieces = []
    for k, L in enumerate(lens):
        n = int(L * SR)
        st = int(rng.uniform(0, 0.02) * SR)
        p = src[:, st:st + n].copy()
        if k % 3 == 1 or k >= 8:      # bit-crush / sample-hold some slices
            hold = 6 if k < 8 else 10
            p = np.repeat(p[:, ::hold], hold, axis=1)[:, :n]
            peak = np.max(np.abs(p)) + 1e-9
            p = np.round(p / peak * 12) / 12 * peak
        if k == len(lens) - 1:
            p = p[:, ::-1] * np.linspace(0.3, 1.0, p.shape[1])
        pieces.append(fade(p, 0.002, 0.003))
    out = np.concatenate(pieces, 1)
    n = out.shape[1]
    xf = int(0.004 * SR)
    ramp = np.linspace(0, 1, xf)
    orig = x[:, i0:i0 + n].copy()
    mix = out.copy()
    mix[:, :xf] = orig[:, :xf] * (1 - ramp) + out[:, :xf] * ramp
    mix[:, -xf:] = out[:, -xf:] * (1 - ramp) + orig[:, -xf:] * ramp
    x[:, i0:i0 + n] = mix


# --------------------------------------------------------------------------------------
# Loudness, dynamics, master
# --------------------------------------------------------------------------------------
def k_weight(x):
    b1, a1 = [1.53512485958697, -2.69169618940638, 1.19839281085285], [1.0, -1.69065929318241, 0.73248077421585]
    b2, a2 = [1.0, -2.0, 1.0], [1.0, -1.99004745483398, 0.99007225036621]
    return signal.lfilter(b2, a2, signal.lfilter(b1, a1, x, axis=-1), axis=-1)


def lufs_integrated(x):
    y = k_weight(x.astype(np.float64))
    blk, hop = int(0.4 * SR), int(0.1 * SR)
    p = (y ** 2).sum(0)
    cs = np.concatenate([[0], np.cumsum(p)])
    starts = np.arange(0, len(p) - blk, hop)
    z = (cs[starts + blk] - cs[starts]) / blk
    l = -0.691 + 10 * np.log10(z + 1e-20)
    z1 = z[l > -70]
    rel = -0.691 + 10 * np.log10(z1.mean()) - 10
    z2 = z[l > rel]
    return -0.691 + 10 * np.log10(z2.mean())


def true_peak_env(x):
    up = signal.resample_poly(x, 4, 1, axis=-1)
    a = np.abs(up).max(0)
    a = a[: (len(a) // 4) * 4].reshape(-1, 4).max(1)
    return np.pad(a, (0, max(0, x.shape[1] - len(a))))


def glue_gain(x, thr_db=-15.0, ratio=1.4, att=0.03, rel=0.35, hop=48):
    """Slow RMS compressor gain curve (upward-free)."""
    p = (x.astype(np.float64) ** 2).mean(0)
    n = len(p) // hop
    pb = p[:n * hop].reshape(n, hop).mean(1)
    ca, cr = np.exp(-hop / (att * SR)), np.exp(-hop / (rel * SR))
    env = np.empty(n)
    e = pb[0]
    for i in range(n):
        v = pb[i]
        e = ca * e + (1 - ca) * v if v > e else cr * e + (1 - cr) * v
        env[i] = e
    lvl = 10 * np.log10(env + 1e-12)
    over = lvl - thr_db
    knee = 6.0
    gr = np.where(over <= -knee / 2, 0.0,
                  np.where(over >= knee / 2, over * (1 - 1 / ratio),
                           (1 - 1 / ratio) * (over + knee / 2) ** 2 / (2 * knee)))
    g = db(-gr)
    return np.interp(np.arange(len(p)), np.arange(n) * hop + hop / 2, g).astype(np.float32)


def limiter_gain(x, ceiling_db=-1.2, look=0.004, rel=0.06):
    pk = true_peak_env(x)
    c = db(ceiling_db)
    req = np.minimum(1.0, c / np.maximum(pk, 1e-9))
    L = int(look * SR)
    g = minimum_filter1d(req, 2 * L + 1)
    g = uniform_filter1d(g, L + 1)
    R = int(rel * SR)
    g2 = minimum_filter1d(req, 2 * R + 1)
    g2 = uniform_filter1d(g2, R + 1)
    # both curves stay <= the required gain; the slow one smooths sustained reduction
    return np.minimum(g, g2).astype(np.float32)


def master(music, sfx, target=-16.0, ceiling=-1.5):
    mix = music + sfx
    g = glue_gain(mix)
    fades = np.ones(N, dtype=np.float32)
    nf = int(0.5 * SR)
    fades[:nf] = np.linspace(0, 1, nf) ** 2
    i0, i1 = int(148.0 * SR), int(149.85 * SR)       # steeper fade, true digital silence from 149.85 s
    fades[i0:i1] = ((0.5 + 0.5 * np.cos(np.linspace(0, np.pi, i1 - i0))) ** 1.5).astype(np.float32)
    fades[i1:] = 0.0
    total = g * fades
    gain = 1.0
    for it in range(4):
        y = mix * total * gain
        lim = limiter_gain(y, ceiling - 0.3)
        y = y * lim
        L = lufs_integrated(y)
        print(f"  master pass {it}: LUFS {L:6.2f}  gain {20 * np.log10(gain):+5.2f} dB  "
              f"max limiter GR {-20 * np.log10(lim.min()):4.1f} dB")
        if abs(L - target) < 0.1:
            break
        gain *= db(target - L)
    curve_all = total * gain * lim
    return music * curve_all, sfx * curve_all


def sfx_ride(music, ref_db=-16.0, amount=0.5, lo=-3.0, hi=8.0):
    """SFX level partially follows the score's short-term level so UI sounds sit at a
    consistent depth (quieter in the intimate hook, lifted in the loud hero)."""
    p = (music.astype(np.float64) ** 2).mean(0)
    a = np.exp(-1 / (0.3 * SR))
    e = signal.filtfilt([1 - a], [1, -a], p)
    L = 10 * np.log10(np.maximum(e, 1e-10))
    return db(np.clip(amount * (L - ref_db), lo, hi)).astype(np.float32)


def write_wav(path, x, seed=0):
    rng = np.random.default_rng(seed)
    d = (rng.random(x.shape) - rng.random(x.shape)) / 32768.0
    d *= (np.abs(x) > 0)                               # no dither on digital silence
    y = np.clip(x + d, -1.0, 32767 / 32768)
    wavfile.write(path, SR, np.round(y.T * 32767).astype(np.int16))


# --------------------------------------------------------------------------------------
# Analysis
# --------------------------------------------------------------------------------------
def ffmpeg_loudness(path):
    try:
        r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", path, "-af", "ebur128=peak=true",
                            "-f", "null", "-"], capture_output=True, text=True, timeout=300)
        txt = r.stderr[r.stderr.rfind("Summary:"):]
        I = re.search(r"I:\s+(-?[\d.]+) LUFS", txt)
        LRA = re.search(r"LRA:\s+(-?[\d.]+) LU", txt)
        TP = re.search(r"Peak:\s+(-?[\d.]+) dBFS", txt)
        return (float(I.group(1)) if I else None, float(LRA.group(1)) if LRA else None,
                float(TP.group(1)) if TP else None)
    except Exception as e:  # noqa
        print("  ffmpeg failed:", e)
        return None, None, None


def analyze(path, marks):
    sr, d = wavfile.read(path)
    x = d.T.astype(np.float64) / 32768.0
    n = x.shape[1]
    print(f"\n== {os.path.basename(path)}: {n / sr:.3f} s, {sr} Hz, {x.shape[0]} ch, {d.dtype}")
    pk = np.abs(x).max()
    print(f"  sample peak {20 * np.log10(pk):6.2f} dBFS   clipped samples: {(np.abs(d) >= 32767).sum()}")
    I, LRA, TP = ffmpeg_loudness(path)
    print(f"  ffmpeg ebur128: integrated {I} LUFS, LRA {LRA} LU, true peak {TP} dBTP")
    secs = int(n // sr)
    rms = [20 * np.log10(np.sqrt((x[:, i * sr:(i + 1) * sr] ** 2).mean()) + 1e-9) for i in range(secs)]
    print("  RMS per second (dBFS):")
    for r0 in range(0, secs, 10):
        print("   %3d-%3ds " % (r0, r0 + 9) + " ".join("%6.1f" % v for v in rms[r0:r0 + 10]))
    m = M(marks)
    sections = [("A hook", 0.5, m.problem), ("B problem", m.problem, m.title_hit), ("C title", m.title_hit, m.groove),
                ("D/E groove", m.groove, m.offline), ("F/G offline(LPF)", m.offline + 1.5, m.reconnect - 0.5),
                ("H reconnect", m.reconnect, m.calm), ("I calm", m.calm, m.tiers), ("J/K tiers", m.tiers, m.honesty),
                ("L honesty", m.honesty, m.close), ("M build", m.close, m.wordmark),
                ("M swell", m.wordmark, m.fade_start), ("fade", m.fade_start, 150.0)]
    print("  section            RMS dB   peak dB  centroid Hz  L/R corr  side/mid dB")
    for name, a, b in sections:
        s = x[:, int(a * sr):int(b * sr)]
        r = 20 * np.log10(np.sqrt((s ** 2).mean()) + 1e-12)
        p = 20 * np.log10(np.abs(s).max() + 1e-12)
        mono = s.mean(0)
        spec = np.abs(np.fft.rfft(mono * np.hanning(len(mono))))
        fr = np.fft.rfftfreq(len(mono), 1 / sr)
        cen = (spec * fr).sum() / (spec.sum() + 1e-12)
        corr = np.corrcoef(s[0], s[1])[0, 1]
        mid, side = (s[0] + s[1]) / 2, (s[0] - s[1]) / 2
        sm = 20 * np.log10((np.sqrt((side ** 2).mean()) + 1e-12) / (np.sqrt((mid ** 2).mean()) + 1e-12))
        print(f"  {name:18s} {r:7.1f} {p:8.1f} {cen:11.0f} {corr:9.2f} {sm:11.1f}")
    tail = x[:, -int(0.05 * sr):]
    print(f"  last 50 ms peak: {20 * np.log10(np.abs(tail).max() + 1e-12):.1f} dBFS")
    return I, TP


# --------------------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--regen", action="store_true", help="rewrite cue_sheet.json from defaults (+ ../cues.json)")
    ap.add_argument("--cues", default=os.path.join(HERE, "..", "cues.json"), help="framework cues.json")
    ap.add_argument("--nudge", action="append", help='"label-substr=+0.1" or "mark:name=108.6"')
    ap.add_argument("--analyze-only", action="store_true")
    ap.add_argument("--target", type=float, default=-16.0, help="integrated LUFS target")
    a = ap.parse_args()

    marks, sfx = load_sheet(a.regen, a.cues)
    apply_nudges(marks, sfx, a.nudge)
    out = {k: os.path.join(HERE, k + ".wav") for k in ("soundtrack", "music", "sfx")}
    if not a.analyze_only:
        t0 = time.time()
        m = M(marks)
        print("composing music ...")
        music = compose_music(m)
        print("rendering sfx ...")
        sd, sw = render_sfx(sfx)
        sfx_bus = sd + 0.45 * convolve(sw, make_ir(1.4, 2.5, "sfx", lp=9000))
        sfx_bus = sos_filter(sfx_bus, "highpass", 60).astype(np.float32)
        sfx_bus *= sfx_ride(music)
        print("mastering ...")
        mo, so = master(music.astype(np.float64), sfx_bus.astype(np.float64), a.target)
        write_wav(out["music"], mo, 1)
        write_wav(out["sfx"], so, 2)
        write_wav(out["soundtrack"], mo + so, 3)
        print(f"done in {time.time() - t0:.1f}s")
    for k in ("soundtrack", "music", "sfx"):
        if k == "soundtrack":
            analyze(out[k], marks)
        else:
            sr, d = wavfile.read(out[k])
            x = d.astype(np.float64) / 32768
            print(f"  {k}.wav: {len(d) / sr:.3f}s  peak {20 * np.log10(np.abs(x).max()):.1f} dBFS  "
                  f"RMS {20 * np.log10(np.sqrt((x ** 2).mean())):.1f} dBFS")


if __name__ == "__main__":
    main()
