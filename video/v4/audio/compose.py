#!/usr/bin/env python3
"""
compose.py -- score + sound design for the Quorum v4 showcase (whiteboard world, 168 s).

Everything is synthesised with numpy/scipy (no samples). Outputs, 48 kHz / 16-bit / stereo, next
to this script:
    soundtrack.wav   the master (= music.wav + sfx.wav through one master gain curve)
    music.wav        score stem
    sfx.wav          sound-design stem

WHERE THE TIMES COME FROM (all in video seconds)
    ../cues.json               the plan: scenes, captions, music marks, UI/system SFX cues
    picture_events.json        the finished picture, read out of the scene code by probe.js:
                               every marker stroke (t0 + duration), handwriting, sticky contact,
                               plate drop, eraser, note slip, cursor click, camera move, plate lift
    ../clips/<SHOT>/actions.json   captured keystrokes (ct), if the clips are on this machine;
                               otherwise the keystroke frames are rebuilt from cues.json captures
                               exactly as capture/capture.js schedules them. Either way they are
                               mapped ct -> video time through the scenes' capture_maps.
    So: strokes, slaps, clicks, typing and whooshes follow the picture; UI events (answers,
    counters, sync, the conflict, the chimes, the logo) follow cues.json, which the scenes hit.
    Re-run `node probe.js` after editing scenes, then `python compose.py`.

MUSIC  120 BPM (beat 0.5 s, bar 2 s), D major. Felt piano, marimba, soft plucks, round bass, brushed
    kit, warm pads in the vision section. Sparse "two dates" motif in the cold open (the 18 is a
    note a step above the 16), title impact at 16, demo groove from 26, low-passed while Tanishk is
    off the hub (it opens while the camera is on Lakshya's laptop), riser 72-75, one-beat breath,
    stop-time hit at 76 into B minor, lift to D major at 104, curious plucks for how-it-works,
    half-time pads for the vision, build to the logo hit at 160. Music ducks under key SFX.

Run:   python compose.py              (~1-2 min)
       python compose.py --analyze-only
       python compose.py --list       print the resolved SFX event list (sync table) and exit
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

HERE = os.path.dirname(os.path.abspath(__file__))
V4 = os.path.dirname(HERE)
SR = 48000
CUES = json.load(open(os.path.join(V4, "cues.json"), encoding="utf-8"))
DUR = float(CUES.get("duration", 168))
N = int(SR * DUR)
T = np.arange(N, dtype=np.float64) / SR
BEAT, BAR = 0.5, 2.0


# ======================================================================================
# DSP helpers
# ======================================================================================
def rng_for(*keys):
    return np.random.default_rng(zlib.crc32(repr(keys).encode()) & 0xFFFFFFFF)


def hz(m):
    return 440.0 * 2.0 ** ((np.asarray(m, dtype=np.float64) - 69.0) / 12.0)


def db(x):
    return 10 ** (np.asarray(x) / 20.0)


def bus():
    return np.zeros((2, N), dtype=np.float32)


def pan_gains(pan):
    th = (np.clip(pan, -1, 1) + 1) * np.pi / 4
    return np.cos(th) * np.sqrt(2), np.sin(th) * np.sqrt(2)


def place(b, x, t, gain=1.0, pan=0.0):
    """Add mono/stereo x into bus b so that x[0] lands at time t."""
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


def curve(points, log=False):
    pts = sorted(points, key=lambda p: p[0])
    ts = np.array([p[0] for p in pts], dtype=np.float64) + np.arange(len(pts)) * 1e-7
    vs = np.array([p[1] for p in pts], dtype=np.float64)
    if log:
        return (2.0 ** np.interp(T, ts, np.log2(vs))).astype(np.float32)
    return np.interp(T, ts, vs).astype(np.float32)


def fade(x, a=0.002, r=0.01):
    n = x.shape[-1]
    na, nr = min(int(a * SR), n // 2), min(int(r * SR), n // 2)
    if na > 0:
        x[..., :na] *= np.linspace(0, 1, na)
    if nr > 0:
        x[..., -nr:] *= np.linspace(1, 0, nr)
    return x


def filt(x, kind, fc, order=2):
    sos = signal.butter(order, fc, btype=kind, fs=SR, output="sos")
    return signal.sosfilt(sos, x, axis=-1)


def tv_biquad(x, kind, fc, q=0.707, block=128, stages=1):
    """Time-varying RBJ biquad. x: (C,n) or (n,); fc: per-sample array or scalar."""
    mono = x.ndim == 1
    X = x[None, :] if mono else x
    C, n = X.shape
    nb = (n + block - 1) // block
    fcs = np.full(nb, float(fc)) if np.isscalar(fc) else np.asarray(fc, dtype=np.float64)[::block][:nb]
    if len(fcs) < nb:
        fcs = np.pad(fcs, (0, nb - len(fcs)), mode="edge")
    fcs = np.clip(fcs, 20.0, 0.45 * SR)
    w0 = 2 * np.pi * fcs / SR
    cw, sw = np.cos(w0), np.sin(w0)
    al = sw / (2 * q)
    if kind == "lp":
        b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0
    elif kind == "hp":
        b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0
    else:  # band-pass, 0 dB peak
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


def env_exp(n, attack, tau):
    t = np.arange(n) / SR
    e = np.exp(-t / tau)
    na = max(1, int(attack * SR))
    e[:na] *= 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, na))
    return e


def sweep_sine(f0, f1, n, tau):
    t = np.arange(n) / SR
    fr = f1 + (f0 - f1) * np.exp(-t / tau)
    return np.sin(2 * np.pi * np.cumsum(fr) / SR)


def norm(x):
    return x / (np.max(np.abs(x)) + 1e-12)


def smooth_noise(rng, n, rate):
    """Band-limited random walk in [-1, 1] at about `rate` Hz."""
    k = max(4, int(n / SR * rate) + 4)
    pts = rng.uniform(-1, 1, k)
    return np.interp(np.linspace(0, k - 3, n), np.arange(k), pts)


def make_ir(rt60, length, seed, lp=7000, predelay=0.015, er=True, hi_ratio=0.5):
    rng = rng_for("ir", seed)
    n = int(length * SR)
    t = np.arange(n) / SR
    x = rng.standard_normal((2, n))
    lo = filt(x, "lowpass", 1200, 2)
    hi = x - lo
    y = lo * np.exp(-6.9078 * t / rt60) + hi * np.exp(-6.9078 * t / (rt60 * hi_ratio))
    y = filt(y, "lowpass", lp, 2)
    y *= 1 - np.exp(-t / 0.02)
    pd = int(predelay * SR)
    y = np.concatenate([np.zeros((2, pd)), y[:, :n - pd]], 1)
    if er:
        for ch in range(2):
            for _ in range(12):
                i = int(rng.uniform(0.003, 0.05) * SR)
                y[ch, i] += rng.uniform(-1, 1) * 1.6
    y /= np.sqrt((y ** 2).sum(1, keepdims=True))
    return y.astype(np.float32)


def convolve(x, ir):
    out = np.empty_like(x)
    for c in range(2):
        out[c] = signal.oaconvolve(x[c], ir[c], mode="full")[:x.shape[1]]
    return out


def pwl(x, pts):
    if x <= pts[0][0]:
        return pts[0][1]
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        if x <= x1:
            return y0 if x1 == x0 else y0 + (y1 - y0) * (x - x0) / (x1 - x0)
    return pts[-1][1]


def pwl_inverse(y, pts):
    """First video time at which the capture map reaches capture time y (lib.js pwlInverse)."""
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        lo, hi = min(y0, y1), max(y0, y1)
        if lo - 1e-9 <= y <= hi + 1e-9 and y1 != y0:
            return x0 + (x1 - x0) * (y - y0) / (y1 - y0)
    return None


def global_map(shot):
    pts = []
    for s in CUES["scenes"]:
        for p in (s.get("capture_maps") or {}).get(shot, []):
            pts.append(tuple(p))
    pts.sort()
    out = []
    for p in pts:
        if not out or p != out[-1]:
            out.append(p)
    return out


EASES = {
    "linear": lambda x: x,
    "easeInOutCubic": lambda x: np.where(x < .5, 4 * x ** 3, 1 - (-2 * x + 2) ** 3 / 2),
    "easeInOutSine": lambda x: -(np.cos(np.pi * x) - 1) / 2,
    "easeOutExpo": lambda x: np.where(x >= 1, 1, 1 - 2.0 ** (-10 * x)),
    "easeOutCubic": lambda x: 1 - (1 - x) ** 3,
    "easeInOutExpo": lambda x: np.where(x < .5, 2.0 ** (20 * x - 10) / 2, (2 - 2.0 ** (-20 * x + 10)) / 2),
}


def ease_speed(name, n):
    """|d ease / du| sampled over n points, normalised to peak 1 (camera / stroke speed envelope)."""
    f = EASES.get(name or "easeInOutCubic", EASES["easeInOutCubic"])
    u = np.linspace(0, 1, n + 1)
    v = np.abs(np.diff(f(u)))
    return v / (v.max() + 1e-12)


# ======================================================================================
# SFX library. Each fx_* returns (signal mono|stereo, preroll seconds): the signal is placed
# at t - preroll, so the sound's sync point (contact / press / peak) lands on t.
# ======================================================================================
PEN = {"blue": 1.0, "red": 1.12, "ink": 0.88, "green": 1.06, "ink3": 0.94, "ink2": 0.9}


def fx_marker(dur, width=5.0, color="blue", seed=0, dry=True, scale=1.0):
    """Felt marker on a whiteboard: friction hiss that follows the stroke's speed (easeInOutSine,
    so loudest mid-stroke) plus an intermittent stick-slip squeal. Each pen colour has its own
    pitch; thicker strokes are lower and fuller."""
    rng = rng_for("marker", seed, round(dur, 3), color)
    dur = max(0.02, dur)
    pre = 0.006
    n = int((dur + 0.06) * SR)
    nd = int(dur * SR)
    t = np.arange(n) / SR
    u = np.clip(t / dur, 0, 1)
    speed = np.sin(np.pi * u) ** 0.7 * (t < dur)
    speed = 0.25 * (t < dur) + 0.75 * speed                         # pen pressure even when slow
    touch = np.exp(-t / 0.006)                                      # felt tip lands
    lift = np.exp(-np.clip(t - dur, 0, None) / 0.012) * (t >= dur)  # lifts off
    amp = np.maximum(speed, 0) + 0.5 * touch
    amp[nd:] = lift[nd:] * 0.35
    pitch = PEN.get(color, 1.0) * (5.0 / max(2.0, width)) ** 0.22 * scale * rng.uniform(0.94, 1.06)
    grain = 0.65 + 0.35 * smooth_noise(rng, n, 38)                 # felt texture
    hiss = rng.standard_normal(n)
    hiss = filt(hiss, "bandpass", [1500 * pitch, 7200 * min(1.25, pitch)], 2)
    hiss = norm(hiss) * grain
    # squeal: a wandering tone (direction changes move it), gated on and off
    f0 = rng.uniform(1500, 2100) * pitch
    fr = f0 * (1 + 0.09 * smooth_noise(rng, n, 7) + 0.012 * np.sin(2 * np.pi * rng.uniform(26, 34) * t))
    ph = 2 * np.pi * np.cumsum(fr) / SR
    sq = np.sin(ph) + 0.42 * np.sin(2 * ph + 0.4) + 0.18 * np.sin(3 * ph + 1.1)
    gate = np.clip(smooth_noise(rng, n, 9 + 6 / max(dur, .1)) * 1.6 + rng.uniform(-0.3, 0.5), 0, 1)
    gate = uniform_filter1d(gate, int(0.008 * SR))
    sq *= gate * (0.55 if dry else 0.75)
    y = (0.62 * hiss + 0.3 * sq) * amp
    tap = filt(rng.standard_normal(n), "bandpass", [900, 4000], 2) * np.exp(-t / 0.0025)
    y += 0.5 * norm(tap) * 0.6
    y = fade(y, 0.0015, 0.01)
    return norm(y) * (0.55 + 0.45 * min(1.0, dur / 0.25)), pre


def fx_dab(seed=0, color="blue"):
    """Very short marker touch (dashes of a dotted arrow, hatching)."""
    rng = rng_for("dab", seed)
    n = int(0.045 * SR)
    t = np.arange(n) / SR
    p = PEN.get(color, 1.0)
    y = filt(rng.standard_normal(n), "bandpass", [1800 * p, 6500], 2) * np.exp(-t / 0.009)
    y += 0.35 * np.sin(2 * np.pi * 1900 * p * t) * np.exp(-t / 0.006)
    return fade(norm(y), 0.0008, 0.006), 0.002


def fx_writing(dur, size=34, color="blue", seed=0):
    """Handwriting: a run of short marker strokes with pen lifts, at letter rate."""
    rng = rng_for("writing", seed, round(dur, 3))
    big = size >= 120
    n = int((dur + 0.08) * SR)
    out = np.zeros(n)
    tt = 0.0
    k = 0
    while tt < dur - 0.02:
        ln = rng.uniform(0.12, 0.22) if big else rng.uniform(0.035, 0.10)
        ln = min(ln, dur - tt)
        s, _ = fx_marker(ln, width=9 if big else 4, color=color, seed=(seed, k), dry=True, scale=0.82 if big else 1.08)
        i = int(tt * SR)
        e = min(n, i + len(s))
        out[i:e] += s[:e - i] * rng.uniform(0.55, 1.0)
        tt += ln + (rng.uniform(0.02, 0.05) if big else rng.uniform(0.006, 0.035))
        k += 1
    return fade(norm(out), 0.002, 0.02), 0.004


def fx_eraser(dur, seed=0):
    """Felt eraser block wiping the board: rubbing that follows the block's sweep (easeInOutSine)
    and its wobble (sin(k*18) in lib.js eraser), plus felt squeaks at the turns."""
    rng = rng_for("eraser", seed, dur)
    n = int((dur + 0.15) * SR)
    t = np.arange(n) / SR
    u = np.clip(t / dur, 0, 1)
    k = -(np.cos(np.pi * u) - 1) / 2
    sweep = np.sin(np.pi * u) ** 0.8 * (t < dur)
    wob = np.abs(np.cos(k * 18))                                  # wobble velocity
    amp = sweep * (0.45 + 0.55 * wob)
    x = rng.standard_normal(n)
    rub = tv_biquad(x, "bp", 500 + 1400 * amp, q=0.6, block=64)
    rub = norm(rub) * (0.7 + 0.3 * smooth_noise(rng, n, 30))
    hiss = norm(filt(rng.standard_normal(n), "bandpass", [2500, 7000], 2)) * 0.25
    y = (rub + hiss) * amp
    # felt squeaks where the wobble turns
    turns = np.where(np.diff(np.sign(np.diff(np.cos(k * 18)))) != 0)[0]
    for i in turns[::1]:
        if t[i] > dur * 0.95:
            continue
        s, _ = fx_marker(0.06, width=8, color="ink", seed=(seed, int(i)), scale=0.7)
        e = min(n, i + len(s))
        y[i:e] += 0.18 * s[:e - i] * sweep[i]
    return fade(norm(y), 0.01, 0.06), 0.0


def fx_air(dur, seed=0, fc0=500, fc1=1800):
    rng = rng_for("air", seed, dur)
    n = int(dur * SR)
    u = np.arange(n) / max(n, 1)
    y = tv_biquad(rng.standard_normal(n), "bp", fc0 * (fc1 / fc0) ** u, q=0.8, block=64)
    return norm(y) * u ** 2


def fx_sticky_slap(size=1.0, seed=0, kraft=False):
    """Sticky note slapped onto the board: the 0.12 s fall (air), the paper slap at contact, a low
    felt thump through the board, a little paper flutter and the tape catching."""
    rng = rng_for("slap", seed, size, kraft)
    pre = 0.12
    n = int(0.42 * SR)
    t = np.arange(n) / SR
    y = np.zeros(n)
    ip = int(pre * SR)
    y[:ip] += 0.10 * fx_air(pre, seed, 700, 2600)
    tc = t[ip:] - pre
    m = n - ip
    sl = filt(rng.standard_normal(m), "bandpass", [700, 5200 if not kraft else 3800], 2)
    sl = norm(sl) * np.exp(-tc / (0.010 + 0.004 * size)) * (1 - np.exp(-tc / 0.0006))
    th = sweep_sine(115 / size ** 0.3, 68, m, 0.02) * np.exp(-tc / 0.045) * (1 - np.exp(-tc / 0.002))
    fl = norm(filt(rng.standard_normal(m), "bandpass", [2500, 8000], 2))
    fl *= np.clip(smooth_noise(rng, m, 60), 0, 1) * np.exp(-tc / 0.05) * (tc > 0.008)
    tape_i = int(rng.uniform(0.028, 0.04) * SR)
    tape = np.zeros(m)
    tl = int(0.02 * SR)
    tk = norm(filt(rng.standard_normal(tl), "bandpass", [3500, 9000], 2)) * np.exp(-np.arange(tl) / SR / 0.003)
    tape[tape_i:tape_i + tl] += tk
    y[ip:] += 1.0 * sl + (0.75 if not kraft else 0.95) * th * size ** 0.4 + 0.18 * fl + 0.22 * tape
    return fade(norm(y), 0.004, 0.05), pre


def fx_plate_slap(seed=0):
    """A printed page / screen card taped onto the board: bigger, softer slap, a board knock, two
    tape strips pressed on (left, right)."""
    rng = rng_for("plate", seed)
    pre = 0.14
    n = int(0.55 * SR)
    t = np.arange(n) / SR
    ip = int(pre * SR)
    out = np.zeros((2, n))
    air = 0.12 * fx_air(pre, seed, 400, 1600)
    out[:, :ip] += air
    m = n - ip
    tc = t[ip:] - pre
    sl = norm(filt(rng.standard_normal(m), "bandpass", [400, 3500], 2)) * np.exp(-tc / 0.018) * (1 - np.exp(-tc / 0.001))
    th = sweep_sine(95, 55, m, 0.03) * np.exp(-tc / 0.07)
    knock = (np.sin(2 * np.pi * 212 * tc) * np.exp(-tc / 0.05) + 0.6 * np.sin(2 * np.pi * 487 * tc) * np.exp(-tc / 0.03))
    mono = 0.8 * sl + 0.8 * th + 0.25 * knock
    out[:, ip:] += mono
    for side, dt in ((-0.6, 0.045), (0.6, 0.095)):
        i = ip + int(dt * SR)
        tl = int(0.03 * SR)
        tk = norm(filt(rng.standard_normal(tl), "bandpass", [2500, 8000], 2)) * np.exp(-np.arange(tl) / SR / 0.004)
        gl, gr = pan_gains(side)
        out[0, i:i + tl] += 0.3 * gl * tk
        out[1, i:i + tl] += 0.3 * gr * tk
    return fade(norm(out), 0.004, 0.06), pre


def fx_slip(seed=0):
    """A small paper slip / note popping onto the board."""
    rng = rng_for("slip", seed)
    n = int(0.12 * SR)
    t = np.arange(n) / SR
    y = norm(filt(rng.standard_normal(n), "bandpass", [1200, 6500], 2)) * np.exp(-t / 0.012)
    y += 0.4 * sweep_sine(160, 100, n, 0.01) * np.exp(-t / 0.02)
    return fade(norm(y), 0.001, 0.02), 0.0


def fx_tape_strip(seed=0):
    """Tape pulled and pressed (the ruler strip)."""
    rng = rng_for("tapestrip", seed)
    n = int(0.3 * SR)
    t = np.arange(n) / SR
    cr = rng.standard_normal(n) * (rng.random(n) < 0.08)
    cr = filt(cr, "bandpass", [1500, 7000], 2)
    env = np.clip(t / 0.18, 0, 1) * np.exp(-np.clip(t - 0.18, 0, None) / 0.03)
    y = norm(cr) * env
    s, _ = fx_slip(seed + 1)
    i = int(0.18 * SR)
    y[i:i + len(s)] += 0.8 * s[:n - i]
    return fade(norm(y), 0.004, 0.02), 0.18


def fx_click(up=False, seed=0):
    """Mouse button: crisp plastic tick + small body. Release is softer and higher."""
    rng = rng_for("click", seed, up)
    n = int(0.05 * SR)
    t = np.arange(n) / SR
    j = rng.uniform(0.96, 1.04)
    tick = norm(filt(rng.standard_normal(n), "bandpass", [3200 * j, 9000], 2)) * np.exp(-t / (0.0011 if up else 0.0016))
    body = np.sin(2 * np.pi * (1650 if up else 1250) * j * t) * np.exp(-t / (0.004 if up else 0.006))
    thock = np.sin(2 * np.pi * 170 * t) * np.exp(-t / 0.009) * (0 if up else 1)
    y = tick + 0.55 * body + 0.5 * thock
    return fade(norm(y) * (0.6 if up else 1.0), 0.0002, 0.01), 0.0


KEYROWS = ["`1234567890-=", "qwertyuiop[]\\", "asdfghjkl;'", "zxcvbnm,./"]


def key_pan(ch):
    c = ch.lower()
    for r, row in enumerate(KEYROWS):
        i = row.find(c)
        if i >= 0:
            return float(np.clip(((i + r * 0.4) / 12.0 - 0.5) * 0.5, -0.25, 0.25))
    return 0.0


def fx_key(ch, seed=0, variant=0):
    """Laptop key (scissor switch): top tick + bottom-out thock + release click. Space bar is
    deeper with a stabiliser rattle; each key varies in pitch and level."""
    rng = rng_for("key", seed, ch, variant)
    space = ch == " "
    n = int(0.11 * SR)
    t = np.arange(n) / SR
    j = rng.uniform(0.97, 1.03) * (1.0 + 0.04 * (variant - 1.5))
    lo, hi = (260, 900) if space else (420 * j, 1500 * j)
    thock = norm(filt(rng.standard_normal(n), "bandpass", [lo, hi], 2)) * np.exp(-t / (0.016 if space else 0.007))
    tick = norm(filt(rng.standard_normal(n), "bandpass", [3000 * j, 8500], 2)) * np.exp(-t / 0.0014)
    body = np.sin(2 * np.pi * (380 if space else 820 * j) * t) * np.exp(-t / (0.012 if space else 0.005))
    y = 0.75 * thock + 0.55 * tick + 0.3 * body
    if space:
        y += 0.12 * np.sin(2 * np.pi * 2650 * t) * np.exp(-t / 0.018) * np.sin(2 * np.pi * 31 * t)
    r = int(rng.uniform(0.045, 0.07) * SR)                           # key comes back up
    rel = norm(filt(rng.standard_normal(n - r), "bandpass", [2500 * j, 7000], 2)) * np.exp(-np.arange(n - r) / SR / 0.0018)
    y[r:] += rng.uniform(0.18, 0.3) * rel
    g = db(rng.uniform(-1.5, 1.5)) * (1.15 if space else 1.0)
    return fade(norm(y) * g, 0.0002, 0.01), 0.0


def fx_toggle(on=True, seed=0, soft=False):
    """Switch: a tiny slide of the knob, then the clack. On is a touch brighter."""
    rng = rng_for("toggle", seed, on)
    pre = 0.028
    n = int(0.16 * SR)
    t = np.arange(n) / SR
    ip = int(pre * SR)
    y = np.zeros(n)
    sl = norm(filt(rng.standard_normal(ip), "bandpass", [2000, 6000], 2)) * np.linspace(0.05, 0.35, ip) ** 1.5
    y[:ip] += sl
    tc = t[ip:] - pre
    m = n - ip
    k = 1.12 if on else 1.0
    snap = norm(filt(rng.standard_normal(m), "bandpass", [2200 * k, 9000], 2)) * np.exp(-tc / 0.0018)
    body = (np.sin(2 * np.pi * 980 * k * tc) * np.exp(-tc / 0.012) + 0.6 * np.sin(2 * np.pi * 1530 * k * tc) * np.exp(-tc / 0.008))
    thock = np.sin(2 * np.pi * 140 * tc) * np.exp(-tc / 0.018)
    y[ip:] += snap + 0.45 * body + (0.3 if soft else 0.55) * thock
    i2 = ip + int(0.018 * SR)                                        # second contact (clack-ack)
    y[i2:] += 0.35 * snap[:n - i2]
    return fade(norm(y), 0.002, 0.02), pre


def fx_disconnect(seed=0):
    """Cut off from the hub: muffled low thud, a short downward blip, and a low tone that powers
    down under it."""
    rng = rng_for("disc", seed)
    n = int(1.5 * SR)
    t = np.arange(n) / SR
    thud = sweep_sine(110, 46, n, 0.05) * np.exp(-t / 0.16) * (1 - np.exp(-t / 0.003))
    thud += 0.45 * norm(filt(rng.standard_normal(n), "lowpass", 380, 2)) * np.exp(-t / 0.04)
    f = 880 * np.exp(-t / 0.09) + 180
    blip = np.sin(2 * np.pi * np.cumsum(f) / SR)
    blip = filt(np.sign(blip) * 0.3 + blip * 0.7, "lowpass", 2200, 2) * np.exp(-t / 0.07) * (t < 0.35)
    ft = 98 * (0.55 + 0.45 * np.exp(-t / 0.5))
    tone = (np.sin(2 * np.pi * np.cumsum(ft) / SR) + 0.3 * np.sin(4 * np.pi * np.cumsum(ft) / SR))
    tone *= np.clip(t / 0.02, 0, 1) * np.exp(-t / 0.55)
    y = 1.0 * thud + 0.28 * blip + 0.32 * tone
    y = np.tanh(1.3 * y)
    return fade(norm(y), 0.001, 0.15), 0.0


def fx_bell(f, dur=1.4, index=1.4, ratio=3.5, tau=0.5, seed=0):
    t = np.arange(int(dur * SR)) / SR
    I = index * np.exp(-t / 0.08) + 0.12
    y = np.sin(2 * np.pi * f * t + I * np.sin(2 * np.pi * f * ratio * t))
    y += 0.22 * np.sin(2 * np.pi * 2.0 * f * t) * np.exp(-t / (tau * 0.35))
    y += 0.08 * np.sin(2 * np.pi * 2.76 * f * t) * np.exp(-t / (tau * 0.25))
    y *= env_exp(len(t), 0.0015, tau)
    return fade(norm(y), 0.0005, 0.05)


def fx_glint(f, seed=0):
    t = np.arange(int(0.35 * SR)) / SR
    y = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.07) + 0.3 * np.sin(2 * np.pi * 2.01 * f * t) * np.exp(-t / 0.03)
    return fade(norm(y * (1 - np.exp(-t / 0.002))), 0.0005, 0.02)


def fx_sync(seed=0, claims=1, ding=True):
    """Outbox drains to the hub: rising airy whoosh, then one soft glint per claim sent and a
    little ding."""
    rng = rng_for("sync", seed)
    wd = 0.34
    n = int((wd + 0.9) * SR)
    t = np.arange(n) / SR
    out = np.zeros((2, n))
    nw = int(wd * SR)
    u = np.arange(nw) / nw
    w = tv_biquad(rng.standard_normal(nw), "bp", 700 * (7000 / 700) ** (u ** 1.3), q=1.3, block=64)
    w = norm(w) * (u ** 1.6) * np.exp(-((u - 1) ** 2) * 0)
    w = fade(w, 0.01, 0.03)
    gl, gr = pan_gains(np.linspace(-0.5, 0.5, nw))
    out[0, :nw] += 0.75 * w * gl
    out[1, :nw] += 0.75 * w * gr
    notes = [2349.3, 2793.8, 3520.0]
    for c in range(max(1, claims)):
        g = fx_glint(notes[c % 3] * (1 + 0.003 * c), seed + c)
        i = int((wd - 0.03 + 0.07 * c) * SR)
        p = 0.35 * (1 if c % 2 else -1)
        l, r = pan_gains(p)
        e = min(n, i + len(g))
        out[0, i:e] += 0.35 * l * g[:e - i]
        out[1, i:e] += 0.35 * r * g[:e - i]
    if ding:
        b = fx_bell(1760.0, 0.8, index=0.8, ratio=2.0, tau=0.22)
        i = int((wd + 0.04 + 0.07 * (claims - 1)) * SR)
        e = min(n, i + len(b))
        out[:, i:e] += 0.28 * b[:e - i]
    return fade(norm(out), 0.004, 0.05), 0.0


def fx_conflict_hit(seed=0):
    """The hero hit: deep kick + low tom + snare crack (the room reverb comes from the SFX bus)."""
    rng = rng_for("hit", seed)
    n = int(1.6 * SR)
    t = np.arange(n) / SR
    kick = sweep_sine(150, 42, n, 0.04) * np.exp(-t / 0.42) * (1 - np.exp(-t / 0.001))
    tom = sweep_sine(170, 92, n, 0.06) * np.exp(-t / 0.16)
    crack = norm(filt(rng.standard_normal(n), "bandpass", [900, 5500], 2)) * np.exp(-t / 0.055)
    crack += 0.35 * np.sin(2 * np.pi * 205 * t) * np.exp(-t / 0.03)
    sub = np.sin(2 * np.pi * 41 * t) * np.exp(-t / 0.7) * np.clip(t / 0.01, 0, 1)
    y = 1.0 * kick + 0.5 * tom + 0.55 * crack + 0.45 * sub
    y = np.tanh(1.6 * y) / np.tanh(1.6)
    st = np.stack([y, np.roll(y, int(0.0004 * SR))])
    return fade(norm(st), 0.0005, 0.2), 0.0


def fx_alert(two=True, seed=0):
    """Tasteful two-tone alert: two soft bells a tritone apart (E5, then A#5), slightly beating.
    two=False plays only the first (the first laptop catches it)."""
    n = int(1.6 * SR)
    out = np.zeros((2, n))
    b1 = fx_bell(659.25, 1.5, index=1.0, ratio=2.0, tau=0.55)
    b1 += 0.5 * fx_bell(659.25 * 1.004, 1.5, index=0.6, ratio=2.0, tau=0.5)
    out[:, :len(b1)] += 0.8 * norm(b1)
    if two:
        b2 = fx_bell(932.33, 1.4, index=1.0, ratio=2.0, tau=0.6) + 0.5 * fx_bell(932.33 * 0.996, 1.4, index=0.6, ratio=2.0, tau=0.55)
        i = int(0.11 * SR)
        e = min(n, i + len(b2))
        out[0, i:e] += 0.55 * norm(b2)[:e - i]
        out[1, i:e] += 0.85 * norm(b2)[:e - i]
    return fade(norm(out), 0.0005, 0.1), 0.0


def fx_resolve(variant=0, seed=0):
    """Bright major-third two-note chime (D6 then F#6); variant 1 a step higher and softer."""
    f1, f2 = (1174.66, 1479.98) if variant == 0 else (1479.98, 1864.66)
    n = int(1.8 * SR)
    out = np.zeros((2, n))
    a = fx_bell(f1, 1.6, index=0.9, ratio=2.0, tau=0.6)
    b = fx_bell(f2, 1.7, index=0.9, ratio=2.0, tau=0.7)
    out[0, :len(a)] += 0.9 * a
    out[1, :len(a)] += 0.7 * a
    i = int(0.09 * SR)
    out[0, i:i + len(b)] += 0.7 * b[:n - i]
    out[1, i:i + len(b)] += 0.9 * b[:n - i]
    # a soft low octave under the first note for warmth
    w = np.sin(2 * np.pi * f1 / 2 * np.arange(n) / SR) * env_exp(n, 0.003, 0.35)
    out += 0.18 * w
    return fade(norm(out), 0.0005, 0.1), 0.0


def fx_pop(f=760, seed=0, double=False):
    """Bubble pop (pitch rises as it pops). double: two quick pops a fifth apart (an answer lands)."""
    rng = rng_for("pop", seed, f)
    n = int(0.16 * SR)
    t = np.arange(n) / SR
    fr = f * (1 + 0.6 * (1 - np.exp(-t / 0.018)))
    ph = 2 * np.pi * np.cumsum(fr) / SR
    y = np.sin(ph) * np.exp(-t / 0.035) * (1 - np.exp(-t / 0.0012))
    y += 0.12 * np.sin(2 * ph) * np.exp(-t / 0.015)
    y += 0.1 * norm(filt(rng.standard_normal(n), "highpass", 3500, 2)) * np.exp(-t / 0.0015)
    y = norm(y)
    if double:
        y2, _ = fx_pop(f * 1.5, seed + 1)
        i = int(0.055 * SR)
        z = np.zeros(i + len(y2))
        z[:n] += y
        z[i:] += 0.75 * y2
        y = z
    return fade(norm(y), 0.0003, 0.02), 0.0


def fx_counter(f=1.0, seed=0):
    """Mechanical counter: the drum flips (two quick ticks) with a tiny metal ring."""
    rng = rng_for("counter", seed)
    n = int(0.12 * SR)
    t = np.arange(n) / SR
    y = np.zeros(n)
    for off, a in ((0.0, 1.0), (0.016, 0.55)):
        i = int(off * SR)
        tt = t[:n - i]
        c = norm(filt(rng.standard_normal(n - i), "bandpass", [2500 * f, 8000], 2)) * np.exp(-tt / 0.0016)
        c += 0.5 * np.sin(2 * np.pi * 620 * f * tt) * np.exp(-tt / 0.008)
        y[i:] += a * c
    y += 0.16 * np.sin(2 * np.pi * 3400 * f * t) * np.exp(-t / 0.03)
    return fade(norm(y), 0.0002, 0.01), 0.0


def fx_whoosh(dur, ease="easeInOutCubic", seed=0, bright=1.0, pan0=-0.25, pan1=0.25):
    """Airy paper swish whose loudness and brightness follow the camera's speed over the move."""
    rng = rng_for("whoosh", seed, round(dur, 3))
    n = int(dur * SR)
    v = ease_speed(ease, n)
    v = uniform_filter1d(v, max(1, int(0.02 * SR)))
    x = rng.standard_normal((2, n))
    fc = (260 + 2600 * v ** 1.2) * bright
    y = tv_biquad(x, "bp", fc, q=0.75, block=64)
    paper = rng.standard_normal(n) * (rng.random(n) < 0.03)        # paper grain
    paper = filt(paper, "bandpass", [1800, 7000], 2)
    y[0] += 0.5 * paper * norm(y[0]).std()
    y[1] += 0.5 * np.roll(paper, 37) * norm(y[1]).std()
    y = y / (np.max(np.abs(y)) + 1e-12)
    y *= v ** 1.15
    p = np.linspace(pan0, pan1, n)
    gl, gr = pan_gains(p)
    y[0] *= gl
    y[1] *= gr
    return fade(y, 0.01, 0.03), 0.0


def fx_fly(seed=0):
    """Fast whoosh with an immediate peak (easeOutExpo motion: the giant 18 / 16 fly out)."""
    return fx_whoosh(0.55, "easeOutExpo", seed, bright=1.25, pan0=0.0, pan1=0.0)


def fx_drop_thunk(seed=0):
    """The red '?' falls (short whistle, 0.18 s) and lands with a marker-cap thunk on the board."""
    rng = rng_for("drop", seed)
    pre = 0.18
    n = int(0.6 * SR)
    t = np.arange(n) / SR
    ip = int(pre * SR)
    y = np.zeros(n)
    f = np.linspace(1500, 700, ip)
    y[:ip] += 0.12 * np.sin(2 * np.pi * np.cumsum(f) / SR) * np.linspace(0, 1, ip) ** 2
    tc = t[ip:] - pre
    m = n - ip
    th = sweep_sine(150, 70, m, 0.02) * np.exp(-tc / 0.08)
    knock = np.sin(2 * np.pi * 330 * tc) * np.exp(-tc / 0.03) + 0.5 * np.sin(2 * np.pi * 760 * tc) * np.exp(-tc / 0.015)
    cl = norm(filt(rng.standard_normal(m), "bandpass", [1000, 5000], 2)) * np.exp(-tc / 0.006)
    y[ip:] += 1.0 * th + 0.35 * knock + 0.45 * cl
    b = int(0.13 * SR)                                              # little bounce
    y[ip + b:] += 0.22 * (th + 0.3 * knock)[:m - b]
    return fade(norm(y), 0.004, 0.06), pre


def fx_ffwd(dur, seed=0):
    """Fast-forward stamp: a racing mechanical tick (sprocket/counter) over a soft rising whirr."""
    rng = rng_for("ffwd", seed)
    n = int((dur + 0.15) * SR)
    t = np.arange(n) / SR
    u = np.clip(t / dur, 0, 1)
    env = np.clip(t / 0.06, 0, 1) * np.clip((dur - t) / 0.12, 0, 1)
    f = 320 + 260 * u
    wh = np.sin(2 * np.pi * np.cumsum(f) / SR)
    wh = filt(np.sign(wh) * 0.2 + wh, "lowpass", 1400, 2) * 0.25
    y = wh * env
    rate = 15 + 9 * u
    ph = np.cumsum(rate) / SR
    idx = np.where(np.diff(np.floor(ph)) > 0)[0]
    for i in idx:
        if t[i] > dur:
            break
        c, _ = fx_counter(1.2 + 0.2 * u[i], seed=(seed, int(i)))
        e = min(n, i + len(c))
        y[i:e] += 0.35 * c[:e - i] * env[i]
    return fade(norm(y), 0.004, 0.04), 0.0


def fx_logo(seed=0):
    """Logo hit: cymbal swell into a big warm low hit, a bright bell stack, and a long crash ring."""
    rng = rng_for("logo", seed)
    pre = 1.1
    n = int((pre + 3.2) * SR)
    t = np.arange(n) / SR
    out = np.zeros((2, n))
    ip = int(pre * SR)
    # reversed cymbal swell
    sw = filt(rng.standard_normal((2, ip)), "highpass", 3000, 2)
    sw = filt(sw, "lowpass", 12000, 2) * (np.arange(ip) / ip) ** 3
    out[:, :ip] += 0.35 * sw
    tc = t[ip:] - pre
    m = n - ip
    kick = sweep_sine(130, 40, m, 0.05) * np.exp(-tc / 0.5) * (1 - np.exp(-tc / 0.001))
    boom = np.sin(2 * np.pi * 49 * tc) * np.exp(-tc / 0.9) * np.clip(tc / 0.008, 0, 1)
    low = np.tanh(1.5 * (kick + 0.5 * boom))
    crash = filt(rng.standard_normal((2, m)), "highpass", 2800, 2)
    crash = filt(crash, "lowpass", 13000, 2) * (0.6 * np.exp(-tc / 0.18) + 0.4 * np.exp(-tc / 1.1))
    bells = np.zeros(m)
    for f, a, tau in ((1174.66, 1.0, 1.1), (1760.0, 0.6, 0.9), (2349.3, 0.45, 0.8), (2959.96, 0.3, 0.6)):
        b = fx_bell(f, min(3.0, m / SR), index=0.7, ratio=2.0, tau=tau)
        bells[:len(b)] += a * b
    out[:, ip:] += 1.0 * low + 0.35 * crash + 0.33 * norm(bells)
    return fade(norm(out), 0.01, 0.4), pre


# ======================================================================================
# Event list: picture events (probe) + cue events (cues.json) + keystrokes
# ======================================================================================
def load_picture():
    p = os.path.join(HERE, "picture_events.json")
    if not os.path.exists(p):
        print("  (no picture_events.json: run `node audio/probe.js`; falling back to cues.json strokes)")
        return None
    return json.load(open(p, encoding="utf-8"))


def keystrokes():
    """[(vt, char)] for every typed character, mapped ct -> video time."""
    out = []
    for shot, cap in (CUES.get("captures") or {}).items():
        gm = global_map(shot)
        if not gm:
            continue
        evs = None
        ap = os.path.join(V4, "clips", shot, "actions.json")
        if os.path.exists(ap):
            a = json.load(open(ap, encoding="utf-8"))
            evs = [(e["ct"], e.get("key", "")) for e in a.get("events", []) if e.get("type") == "key"]
            src = "actions.json"
        if evs is None:  # rebuild exactly as capture.js plan() does (frame-quantised)
            evs = []
            for act in cap.get("actions", []):
                if act.get("do") != "type":
                    continue
                txt = act["text"]
                nch = len(txt)
                until = act.get("until", act["ct"] + nch * 0.05)
                for i, ch in enumerate(txt):
                    f = round((act["ct"] + i * (until - act["ct"]) / max(1, nch - 1)) * 30)
                    evs.append((f / 30.0, ch))
            src = "cues.json captures (capture.js schedule)"
        for ct, ch in evs:
            vt = pwl_inverse(ct, gm)
            if vt is not None:
                out.append((vt, ch))
        if evs:
            print(f"  keystrokes {shot}: {len(evs)} from {src}")
    return sorted(out)


def camera_segments(pic):
    """[(t0, t1, ease, magnitude|None)]: every camera move between consecutive keys. magnitude is the
    move size in screen px (pan at the mean zoom + zoom change), None when a key depends on clip rects."""
    keys = []
    for s in pic["scenes"]:
        for k in s["keys"]:
            keys.append((float(k[0]), k[1], k[2] if len(k) > 2 else "plate"))
    keys.sort(key=lambda k: k[0])
    segs = []
    for (t0, _, v0), (t1, e, v1) in zip(keys, keys[1:]):
        if t1 - t0 <= 0.05:
            continue
        mag = None
        if isinstance(v0, dict) and isinstance(v1, dict):
            zm = (v0["z"] * v1["z"]) ** 0.5
            mag = float(np.hypot(v1["x"] - v0["x"], v1["y"] - v0["y"]) * zm + 900 * abs(np.log(v1["z"] / v0["z"])))
        segs.append((t0, t1, e or "easeInOutCubic", mag))
    return segs


def build_events():
    pic = load_picture()
    cues = CUES["sfx"]
    ev = []

    def add(t, typ, gain=1.0, pan=0.0, **kw):
        ev.append(dict(t=float(t), type=typ, gain=float(gain), pan=float(pan), **kw))

    picture_types = {"marker_squeak", "sticky_slap", "click_down", "click_up", "key_tick"}
    erasers = []
    segs = camera_segments(pic) if pic else []

    if pic:
        rng = rng_for("pans")
        k = 0
        for it in pic["items"]:
            kind, sc = it["kind"], it.get("scene")
            col = it.get("color") or "blue"
            wid = it.get("width") or 5
            if kind in ("strokeSeq", "markerArrow", "markerCross"):
                parts = it.get("parts") or []
                dashed = len(parts) >= 5 and all(p["dur"] <= 0.06 for p in parts)
                for p in parts:
                    k += 1
                    if p["dur"] <= 0.06:
                        add(p["t0"], "dab", 0.55 if dashed else 0.7, rng.uniform(-.2, .2), color=col, scene=sc, src="picture")
                    else:
                        add(p["t0"], "stroke", 1.0, rng.uniform(-.2, .2), dur=p["dur"], color=col, width=wid, scene=sc, src="picture")
            elif kind.startswith("marker"):
                k += 1
                add(it["t0"], "stroke", 1.0, rng.uniform(-.2, .2), dur=it["dur"], color=col, width=wid, scene=sc, src="picture",
                    label=kind)
            elif kind == "handText":
                size = it.get("size") or 34
                add(it["t0"], "writing", 1.0, rng.uniform(-.15, .15), dur=it["dur"], size=size, color=col, scene=sc, src="picture",
                    label=it.get("text", ""))
            elif kind == "KIT.note":
                if not any(c["type"] == "ui_pop" and abs(float(c["t"]) - it["t0"]) < 0.06 for c in cues):
                    add(it["t0"], "slip", 1.0, 0.0, scene=sc, src="picture", label="note slip: " + it.get("text", ""))
                add(it["t0"] + 0.08, "writing", 0.9, 0.0, dur=it["dur"], size=it.get("size") or 24, color=col, scene=sc, src="picture",
                    label=it.get("text", ""))
            elif kind == "sticky":
                w = (it.get("w") or 280) / 300.0
                add(it["t0"], "sticky_slap", float(np.clip(0.8 + 0.25 * w, 0.75, 1.1)), 0.0, size=float(np.clip(w, 0.7, 1.6)),
                    kraft=it.get("stickyColor") == "kraft", scene=sc, src="picture")
            elif kind == "KIT.slapCrop":
                add(it["t0"], "sticky_slap", 0.72, 0.0, size=0.8, scene=sc, src="picture", label="slapCrop")
            elif kind == "KIT.plateDrop":
                add(it["t0"], "plate_slap", 0.8, 0.0, scene=sc, src="picture")
            elif kind == "eraser":
                add(it["t0"], "eraser", 1.0, 0.0, dur=it["dur"], scene=sc, src="picture")
                erasers.append(it["t0"])
            elif kind == "KIT.ffStamp":
                add(it["t0"], "ffwd", 1.0, 0.0, dur=(it.get("t1") or it["t0"] + 0.85) - it["t0"], scene=sc, src="picture")
            elif kind == "KIT.popper" and abs(it["t0"] - 79.3) < 0.05:
                add(it["t0"], "tape_strip", 0.8, 0.0, scene=sc, src="picture", label="ruler strip")
        # cursor clicks
        for c in pic["cursor"]:
            if c["kind"] != "click":
                continue
            tg = c.get("target") or ""
            pan = -0.15 if tg.startswith("L.") else 0.15 if tg.startswith("R.") else 0.0
            add(c["t"], "click_down", 1.0, pan, scene=c.get("scene"), src="picture", label="click " + tg)
            add(c["t"] + 0.1, "click_up", 1.0, pan, scene=c.get("scene"), src="picture", label="release " + tg)
        # counter lifts on plates that cues.json has no sound for
        tick_ts = [float(c["t"]) for c in cues if c["type"] == "counter_tick"]
        for l in pic["lifts"]:
            if "Num" in l["name"] and not any(abs(l["t0"] - x) < 0.05 for x in tick_ts):
                add(l["t0"], "counter_tick", 0.6, 0.1, scene=l.get("scene"), src="picture", label="lift " + l["name"])
    else:
        picture_types = {"key_tick"}

    # keystrokes (captured schedule mapped through the scene time remap)
    ks = keystrokes()
    for i, (vt, ch) in enumerate(ks):
        if ch.isupper() or ch in ':"?!':
            add(vt - 0.03, "key", 0.45, key_pan("z") - 0.1, char="shift", variant=3, src="capture", label="shift")
        add(vt, "key", 1.0, key_pan(ch), char=ch, variant=i % 4, src="capture", label=f"type {ch!r}")

    # cue events
    claims = {66.0: 1, 75.25: 1, 104.5: 3}
    for c in cues:
        typ, t, g = c["type"], float(c["t"]), float(c.get("gain", 1.0))
        lab = c.get("label", "")
        if typ in picture_types:
            continue
        if typ == "marker_squeak":          # only without a probe
            add(t, "stroke", 1.0, 0.0, dur=float(c.get("dur", 0.4)), color="blue", width=5, scene=c["scene"], src="cue", label=lab)
            continue
        if typ == "sticky_slap":
            add(t, "sticky_slap", g, 0.0, size=1.0, scene=c["scene"], src="cue", label=lab)
            continue
        if typ == "paper_whoosh":
            if any(abs(t - e) < 0.35 for e in erasers):
                continue                     # the eraser is its own sound
            if "18 / 16" in lab:
                add(t, "fly", 0.8, -0.35, scene=c["scene"], src="cue", label="giant 18 flies")
                add(t + 0.15, "fly", 0.8, 0.35, scene=c["scene"], src="cue", label="giant 16 flies")
                continue
            seg = None
            for s in segs:
                if s[0] - 0.3 <= t <= s[1] - 0.1:
                    if seg is None or abs(s[0] - t) < abs(seg[0] - t):
                        seg = s
            if seg:
                gm = g if seg[3] is None else g * float(np.clip(seg[3] / 700, 0.7, 1.2))
                add(seg[0], "whoosh", gm, 0.0, dur=seg[1] - seg[0], ease=seg[2], scene=c["scene"], src="cue+camera", label=lab)
            else:
                add(t - 0.2, "whoosh", g, 0.0, dur=0.6, ease="easeInOutCubic", scene=c["scene"], src="cue", label=lab)
            continue
        if typ == "ui_pop" and '"?"' in lab:
            add(t, "drop_thunk", 1.0, 0.0, scene=c["scene"], src="cue", label=lab)
            continue
        if typ == "ui_pop" and "fast-forward" in lab and pic:
            continue                         # the ffwd sound covers the stamp
        if typ == "ui_pop" and "Tanishk conflict card" in lab:
            add(t, "alert1", 1.0, -0.25, scene=c["scene"], src="cue", label=lab)
            add(t, "pop", 0.5, -0.25, f=640, scene=c["scene"], src="cue", label=lab)
            continue
        if typ == "ui_pop":
            add(t, "pop", g, 0.0, scene=c["scene"], src="cue", label=lab, double=("answer" in lab))
            continue
        if typ == "resolve_chime" and c.get("variant", 0) == 0 and pic:
            fl = [it["t0"] for it in pic["items"] if it["kind"] == "KIT.flashRect" and it.get("color") == "green"]
            near = [x for x in fl if 0 <= x - t <= 0.4]
            add(near[0] if near else t, "resolve_chime", g, -0.15, variant=0, scene=c["scene"], src="cue+picture", label=lab)
            continue
        if typ == "sync_whoosh":
            add(t, "sync", g, 0.0, claims=claims.get(round(t, 2), 1), ding=round(t, 2) != 75.25, scene=c["scene"], src="cue", label=lab)
            continue
        add(t, typ, g, 0.0, variant=c.get("variant", 0), scene=c["scene"], src="cue", label=lab)

    # camera moves with no cue: a quiet swish for deliberate (cubic / expo) moves only
    cued = [e for e in ev if e["type"] == "whoosh"]
    for s in segs:
        if s[2] not in ("easeInOutCubic", "easeOutExpo") or not (0.45 <= s[1] - s[0] <= 2.2):
            continue
        if any(abs(e["t"] - s[0]) < 0.2 for e in cued):
            continue
        if s[3] is not None and s[3] < 80:
            continue                         # a reframe too small to hear
        g = 0.3 if s[3] is None else 0.34 * float(np.clip(s[3] / 700, 0.35, 1.2))
        add(s[0], "whoosh", g, 0.0, dur=s[1] - s[0], ease=s[2], src="camera", label=f"camera move ({'?' if s[3] is None else int(s[3])} px)")

    # pitched sequences: deck flow steps and the region numbers climb a D-major pentatonic
    flow = sorted([e for e in ev if e["type"] == "pop" and "flow step" in e.get("label", "")], key=lambda e: e["t"])
    for i, e in enumerate(flow):
        e["f"] = float(hz([74, 76, 78, 81, 83, 86][i % 6]))
    regs = sorted([e for e in ev if e["type"] == "pop" and "region number" in e.get("label", "")], key=lambda e: e["t"])
    for i, e in enumerate(regs):
        e["f"] = float(hz([74, 76, 78, 81, 83, 86, 88][i % 7]))
    needle = sorted([e for e in ev if e["type"] == "counter_tick" and ("needle" in e.get("label", "") or "dot ->" in e.get("label", ""))],
                    key=lambda e: e["t"])
    for i, e in enumerate(needle):
        e["pitch"] = 1.0 + 0.06 * (i % 4)
    ev.sort(key=lambda e: e["t"])
    return ev, pic


# ======================================================================================
# SFX render
# ======================================================================================
LEVEL = {  # bus gain per type (before the event's own gain)
    "stroke": 0.24, "dab": 0.14, "writing": 0.19, "eraser": 0.42, "slip": 0.20, "tape_strip": 0.22,
    "sticky_slap": 0.62, "plate_slap": 0.55, "click_down": 0.42, "click_up": 0.30, "key": 0.30,
    "toggle_clack": 0.55, "disconnect_thud": 0.8, "sync": 0.42, "conflict_hit": 0.95, "alert_chime": 0.5,
    "alert1": 0.2, "resolve_chime": 0.48, "pop": 0.36, "counter_tick": 0.36, "logo_hit": 0.95,
    "whoosh": 0.40, "fly": 0.38, "drop_thunk": 0.62, "ffwd": 0.22,
}
WET = {"stroke": 0.12, "writing": 0.1, "sticky_slap": 0.22, "plate_slap": 0.25, "conflict_hit": 0.55, "alert_chime": 0.6,
       "alert1": 0.5, "resolve_chime": 0.55, "logo_hit": 0.5, "pop": 0.2, "sync": 0.35, "disconnect_thud": 0.3,
       "whoosh": 0.18, "fly": 0.2, "drop_thunk": 0.3, "toggle_clack": 0.15, "click_down": 0.08, "key": 0.06}
DUCK = {  # music sidechain depth (dB) and release (s)
    "conflict_hit": (5.0, 0.6), "logo_hit": (3.0, 0.5), "disconnect_thud": (4.0, 0.45), "sticky_slap": (1.5, 0.18),
    "plate_slap": (1.8, 0.2), "toggle_clack": (1.5, 0.15), "drop_thunk": (2.5, 0.25), "click_down": (0.8, 0.1),
    "alert_chime": (2.0, 0.5), "alert1": (1.5, 0.3), "resolve_chime": (1.5, 0.35), "eraser": (2.0, 0.3),
}


def synth(e, k):
    typ = e["type"]
    seed = zlib.crc32(repr((typ, k, round(e["t"], 3))).encode()) & 0xFFFF
    if typ == "stroke":
        return fx_marker(e["dur"], e.get("width", 5), e.get("color", "blue"), seed)
    if typ == "dab":
        return fx_dab(seed, e.get("color", "blue"))
    if typ == "writing":
        return fx_writing(e["dur"], e.get("size", 34), e.get("color", "blue"), seed)
    if typ == "eraser":
        return fx_eraser(e["dur"], seed)
    if typ == "slip":
        return fx_slip(seed)
    if typ == "tape_strip":
        return fx_tape_strip(seed)
    if typ == "sticky_slap":
        return fx_sticky_slap(e.get("size", 1.0), seed, e.get("kraft", False))
    if typ == "plate_slap":
        return fx_plate_slap(seed)
    if typ == "click_down":
        return fx_click(False, seed)
    if typ == "click_up":
        return fx_click(True, seed)
    if typ == "key":
        if e.get("char") == "shift":
            x, p = fx_key("a", seed, 3)
            return filt(x, "highpass", 900, 2), p
        return fx_key(e.get("char", "a"), seed, e.get("variant", 0))
    if typ == "toggle_clack":
        return fx_toggle("off" not in e.get("label", ""), seed, soft=e["gain"] < 0.8)
    if typ == "disconnect_thud":
        return fx_disconnect(seed)
    if typ == "sync":
        return fx_sync(k, e.get("claims", 1), e.get("ding", True))
    if typ == "conflict_hit":
        return fx_conflict_hit(k)
    if typ == "alert_chime":
        return fx_alert(True, k)
    if typ == "alert1":
        return fx_alert(False, k)
    if typ == "resolve_chime":
        return fx_resolve(e.get("variant", 0), k)
    if typ == "pop":
        f = e.get("f") or float(rng_for("popf", k).uniform(640, 900))
        return fx_pop(f, k, e.get("double", False))
    if typ == "counter_tick":
        return fx_counter(e.get("pitch", 1.0), k)
    if typ == "logo_hit":
        return fx_logo(k)
    if typ == "whoosh":
        return fx_whoosh(e["dur"], e.get("ease"), k, bright=1.0 if e["dur"] < 1.2 else 0.8)
    if typ == "fly":
        return fx_fly(k)
    if typ == "drop_thunk":
        return fx_drop_thunk(k)
    if typ == "ffwd":
        return fx_ffwd(e["dur"], k)
    raise ValueError(typ)


def render_sfx(events):
    dry, wet = bus(), bus()
    for k, e in enumerate(events):
        x, pre = synth(e, k)
        g = LEVEL[e["type"]] * e["gain"]
        if e["type"] == "whoosh":
            g *= float(np.clip(0.75 + 0.25 * e["dur"], 0.8, 1.15))
        place(dry, x, e["t"] - pre, g, e["pan"])
        w = WET.get(e["type"], 0.1)
        if w:
            place(wet, x, e["t"] - pre, g * w, e["pan"])
    return dry, wet


def duck_curve(events):
    """Music gain curve: dips under key SFX (fast attack, exponential release), plus a 3 dB dip
    under typing runs."""
    g_db = np.zeros(N, dtype=np.float32)
    for e in events:
        d = DUCK.get(e["type"])
        if not d:
            continue
        depth, rel = d
        depth *= min(1.0, e["gain"])
        i0 = int((e["t"] - 0.006) * SR)
        n = int((rel * 4 + 0.01) * SR)
        tt = np.arange(n) / SR
        shape = -depth * np.minimum(1, tt / 0.006) * np.exp(-np.clip(tt - 0.03, 0, None) / rel)
        s0, s1 = max(0, i0), min(N, i0 + n)
        if s1 > s0:
            g_db[s0:s1] = np.minimum(g_db[s0:s1], shape[s0 - i0:s1 - i0])
    keys = [e["t"] for e in events if e["type"] == "key"]
    if keys:
        runs = []
        a = b = keys[0]
        for t in keys[1:]:
            if t - b < 0.3:
                b = t
            else:
                runs.append((a, b)); a = b = t
        runs.append((a, b))
        for a, b in runs:
            c = curve([(0, 0), (a - 0.15, 0), (a, -3), (b, -3), (b + 0.4, 0), (DUR, 0)])
            g_db = np.minimum(g_db, c)
    return db(g_db).astype(np.float32)


# ======================================================================================
# Music instruments
# ======================================================================================
_cache = {}


def felt_piano(midi, vel=0.6, dur=2.0):
    """Felt piano: inharmonic partials with per-partial decay, two-stage envelope, soft felt
    (low-passed) hammer, slight two-string beating, damper release at dur."""
    vb = round(vel, 1)
    key = ("fp", int(midi), vb)
    if key not in _cache:
        rng = rng_for(*key)
        f = float(hz(midi))
        L = float(np.clip(5.5 - (midi - 40) * 0.06, 1.6, 6.0))
        n = int(L * SR)
        t = np.arange(n) / SR
        Bc = 0.00035
        y = np.zeros(n)
        nmax = int(min(14, 9000 / f))
        for k in range(1, nmax + 1):
            fk = k * f * np.sqrt(1 + Bc * k * k)
            a = (1.0 / k ** 1.25) * np.exp(-(k - 1) * (1.15 - vb) * 0.45)
            tau1 = L * 0.12 / (1 + 0.5 * (k - 1))
            tau2 = L * 0.42 / (1 + 0.3 * (k - 1))
            env = 0.65 * np.exp(-t / tau1) + 0.35 * np.exp(-t / tau2)
            det = 1 + rng.uniform(-0.6, 0.6) / 1200
            y += a * env * (np.sin(2 * np.pi * fk * t + rng.uniform(0, 6.28)) + 0.6 * np.sin(2 * np.pi * fk * det * t))
        ham = filt(rng.standard_normal(n), "lowpass", 900 + 1500 * vb, 2) * np.exp(-t / 0.012)
        y += 0.18 * norm(ham) * vb
        y = filt(y, "lowpass", min(9000, 1400 + 3800 * vb + 1.5 * f), 2)
        y *= 1 - np.exp(-t / 0.0025)
        _cache[key] = norm(y) * (0.35 + 0.65 * vb)
    y = _cache[key]
    m = min(len(y), int((dur + 0.35) * SR))
    out = y[:m].copy()
    nd = int(dur * SR)
    if nd < m:
        out[nd:] *= np.exp(-np.arange(m - nd) / SR / 0.09)
    return fade(out, 0.0005, 0.02)


def marimba(midi, vel=0.6):
    key = ("mar", int(midi), round(vel, 1))
    if key not in _cache:
        rng = rng_for(*key)
        f = float(hz(midi))
        L = float(np.clip(1.6 - (midi - 55) * 0.025, 0.5, 1.8))
        n = int(L * SR)
        t = np.arange(n) / SR
        y = np.sin(2 * np.pi * f * t) * np.exp(-t / (L * 0.32))
        y += 0.38 * np.sin(2 * np.pi * f * 3.93 * t) * np.exp(-t / (L * 0.07))
        y += 0.12 * np.sin(2 * np.pi * f * 9.2 * t) * np.exp(-t / 0.012)
        y += 0.25 * np.sin(2 * np.pi * f * 2 * t) * np.exp(-t / (L * 0.12)) * (midi < 70)
        mal = filt(rng.standard_normal(n), "bandpass", [600, 3500], 2) * np.exp(-t / 0.003)
        y += 0.15 * norm(mal) * vel
        y *= 1 - np.exp(-t / 0.0012)
        _cache[key] = norm(y) * (0.4 + 0.6 * vel)
    return _cache[key]


def pluck(midi, vel=0.6, t60=0.9, dur=1.2, bright=0.5):
    key = ("pl", int(midi), round(vel, 1), round(t60, 2), round(dur, 2), round(bright, 2))
    if key not in _cache:
        rng = rng_for(*key)
        f = float(hz(midi))
        P = SR / f
        Nd = int(np.floor(P - 0.6))
        d = P - 0.5 - Nd
        c = (1 - d) / (1 + d)
        g = 10 ** (-3.0 / (f * t60))
        n = int(dur * SR)
        exc = rng.standard_normal(Nd)
        exc = signal.lfilter([1 - bright], [1, -bright], exc)
        exc = signal.lfilter([1 - bright], [1, -bright], exc)
        exc -= exc.mean()
        exc *= np.hanning(Nd) ** 0.5
        x = np.zeros(n)
        x[:Nd] = exc
        a = np.zeros(Nd + 3)
        a[0] = 1.0; a[1] = c
        a[Nd] += -0.5 * g * c; a[Nd + 1] += -0.5 * g * (1 + c); a[Nd + 2] += -0.5 * g
        y = signal.lfilter([1.0, c], a, x)
        y = norm(y)
        t = np.arange(n) / SR
        y += 0.3 * np.sin(2 * np.pi * f * t) * np.exp(-t / (t60 * 0.3)) * (1 - np.exp(-t / 0.003))
        y = filt(y, "lowpass", min(8000, 2.0 * f + 1800 + 2500 * vel), 2)
        _cache[key] = fade(norm(y), 0.001, 0.04) * (0.4 + 0.6 * vel)
    return _cache[key]


def bass_note(midi, dur, vel=0.7):
    key = ("bs", int(midi), round(dur, 2), round(vel, 1))
    if key not in _cache:
        f = float(hz(midi))
        n = int((dur + 0.12) * SR)
        t = np.arange(n) / SR
        y = np.sin(2 * np.pi * f * t) + 0.28 * np.sin(4 * np.pi * f * t + 0.4) + 0.08 * np.sin(6 * np.pi * f * t)
        y = np.tanh(1.2 * y)
        env = (1 - np.exp(-t / 0.004)) * (0.55 + 0.45 * np.exp(-t / 0.18))
        nd = int(dur * SR)
        env[nd:] *= np.exp(-np.arange(n - nd) / SR / 0.03)
        y = filt(y * env, "lowpass", 900, 2)
        _cache[key] = fade(norm(y), 0.001, 0.02) * vel
    return _cache[key]


def pad_chord(midis, dur, attack=0.8, release=1.2, seed=0, bright=1500):
    """Warm pad: detuned triangle-ish voices, low-passed (no supersaw shine)."""
    rng = rng_for("pad", tuple(midis), round(dur, 2), seed)
    n = int((dur + release) * SR)
    t = np.arange(n) / SR
    out = np.zeros((2, n))
    for m in midis:
        f = float(hz(m))
        for v in range(3):
            det = (v - 1) * 7 + rng.normal(0, 1.5)
            fr = f * 2 ** (det / 1200) * (1 + 0.0015 * np.sin(2 * np.pi * rng.uniform(0.1, 0.3) * t))
            ph = np.cumsum(fr) / SR
            tri = 2 * np.abs(2 * (ph % 1) - 1) - 1
            gl, gr = pan_gains(rng.uniform(-0.7, 0.7))
            out[0] += tri * gl
            out[1] += tri * gr
    out = filt(out, "lowpass", bright, 2)
    env = np.ones(n)
    na = int(attack * SR)
    env[:na] = 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, na))
    nd = int(dur * SR)
    env[nd:] *= np.linspace(1, 0, n - nd) ** 2
    return out * env / (len(midis) * 3) ** 0.5


def glock(midi, vel=0.6):
    f = float(hz(midi))
    n = int(1.4 * SR)
    t = np.arange(n) / SR
    y = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.5) + 0.25 * np.sin(2 * np.pi * 2.76 * f * t) * np.exp(-t / 0.12)
    y += 0.1 * np.sin(2 * np.pi * 5.4 * f * t) * np.exp(-t / 0.04)
    return fade(norm(y * (1 - np.exp(-t / 0.001))), 0.0005, 0.05) * vel


def drum(kind, v=0):
    key = ("dr", kind, v)
    if key in _cache:
        return _cache[key]
    rng = rng_for(*key)
    if kind == "kick":
        n = int(0.5 * SR); t = np.arange(n) / SR
        y = sweep_sine(110, 54, n, 0.025) * np.exp(-t / 0.12) * (1 - np.exp(-t / 0.0015))
        y += 0.05 * norm(filt(rng.standard_normal(n), "bandpass", [1200, 4000], 2)) * np.exp(-t / 0.003)
        y = np.tanh(1.3 * y)
    elif kind == "kick_soft":
        n = int(0.45 * SR); t = np.arange(n) / SR
        y = sweep_sine(85, 50, n, 0.025) * np.exp(-t / 0.13) * (1 - np.exp(-t / 0.003))
    elif kind == "brush":
        n = int(0.35 * SR); t = np.arange(n) / SR
        y = norm(filt(rng.standard_normal(n), "bandpass", [1500, 7500], 2)) * (0.7 * np.exp(-t / 0.035) + 0.3 * np.exp(-t / 0.13))
        y += 0.3 * np.sin(2 * np.pi * 190 * t) * np.exp(-t / 0.025)
        y *= 1 - np.exp(-t / 0.003)
    elif kind == "clap":
        n = int(0.35 * SR); t = np.arange(n) / SR
        env = np.zeros(n)
        for off in (0.0, 0.008, 0.017):
            tt = np.clip(t - off, 0, None)
            env += (t >= off) * np.exp(-tt / (0.006 if off < 0.017 else 0.08))
        y = norm(filt(rng.standard_normal(n), "bandpass", [900, 4500], 2)) * env
    elif kind == "rim":
        n = int(0.12 * SR); t = np.arange(n) / SR
        y = np.sin(2 * np.pi * 1700 * t) * np.exp(-t / 0.012) + 0.6 * norm(filt(rng.standard_normal(n), "bandpass", [2000, 6000], 2)) * np.exp(-t / 0.004)
    elif kind == "shaker":
        n = int(0.14 * SR); t = np.arange(n) / SR
        env = (t / 0.015) * np.exp(1 - t / 0.015)
        y = norm(filt(rng.standard_normal(n), "bandpass", [4500, 11000], 2)) * env
    elif kind == "hat":
        n = int(0.12 * SR); t = np.arange(n) / SR
        y = norm(filt(rng.standard_normal(n), "highpass", 7000, 4)) * env_exp(n, 0.0008, 0.025)
    elif kind == "tick":       # clock-like woodblock tick
        n = int(0.09 * SR); t = np.arange(n) / SR
        f = 2350 if v % 2 == 0 else 1980
        y = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.014) + 0.5 * norm(filt(rng.standard_normal(n), "bandpass", [1500, 5000], 2)) * np.exp(-t / 0.002)
    elif kind == "tom":
        n = int(0.5 * SR); t = np.arange(n) / SR
        f0 = [130, 110, 95][v % 3]
        y = sweep_sine(f0 * 1.4, f0, n, 0.04) * np.exp(-t / 0.18) + 0.2 * norm(filt(rng.standard_normal(n), "lowpass", 1500, 2)) * np.exp(-t / 0.02)
    elif kind == "crash":
        n = int(2.6 * SR); t = np.arange(n) / SR
        y = filt(rng.standard_normal((2, n)), "highpass", 3000, 2)
        y = filt(y, "lowpass", 12000, 2) * (0.5 * np.exp(-t / 0.15) + 0.5 * np.exp(-t / 0.9))
        _cache[key] = fade(norm(y), 0.001, 0.2)
        return _cache[key]
    elif kind == "snare_roll_hit":
        n = int(0.2 * SR); t = np.arange(n) / SR
        y = norm(filt(rng.standard_normal(n), "bandpass", [1200, 7000], 2)) * np.exp(-t / 0.03) + 0.3 * np.sin(2 * np.pi * 200 * t) * np.exp(-t / 0.02)
    else:
        raise ValueError(kind)
    _cache[key] = fade(norm(y), 0.0005, 0.02)
    return _cache[key]


def reverse_cymbal(dur, seed=0):
    rng = rng_for("rcym", dur, seed)
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = filt(filt(rng.standard_normal((2, n)), "highpass", 3200, 2), "lowpass", 12000, 2)
    y = (x * np.exp(-t / (dur * 0.33)))[:, ::-1].copy()
    return fade(y, 0.01, 0.01)


def noise_riser(dur, f0=300, f1=7000, seed=0, power=2.4):
    rng = rng_for("riser", dur, seed)
    n = int(dur * SR)
    u = np.arange(n) / n
    y = tv_biquad(rng.standard_normal((2, n)), "bp", f0 * (f1 / f0) ** u, q=1.4, block=128)
    return fade(norm(y) * u ** power, 0.01, 0.01)


# ======================================================================================
# Score
# ======================================================================================
CH = {  # name: (bass midi, voicing)
    "D": (38, [62, 66, 69, 74]), "Dadd9": (38, [62, 66, 69, 76]), "A/C#": (37, [61, 64, 69, 73]),
    "A": (45, [61, 64, 69, 73]), "Asus4": (45, [62, 64, 69, 74]), "Bm": (35, [59, 62, 66, 71]),
    "Bm7": (35, [59, 62, 66, 69]), "Bmadd9": (35, [61, 62, 66, 73]), "G": (43, [59, 62, 67, 71]),
    "Gmaj7": (43, [59, 62, 66, 67]), "Gadd9": (43, [59, 62, 67, 69]), "Em7": (40, [59, 62, 64, 67]),
    "F#": (42, [58, 61, 66, 70]), "F#sus4": (42, [59, 61, 66, 71]), "F#m7": (42, [57, 61, 64, 69]),
    "D/F#": (42, [62, 66, 69, 74]), "Em": (40, [59, 64, 67, 71]),
}


def chord_plan():
    """[(t0, t1, chord)] for the whole film (bars of 2 s)."""
    P = []

    def seq(t0, names, bar=2.0):
        t = t0
        for nm in names:
            if isinstance(nm, tuple):
                nm, L = nm
            else:
                L = bar
            P.append((t, t + L, nm))
            t += L
        return t

    seq(0, [("Bmadd9", 4), ("Gmaj7", 4), ("Em7", 4), ("F#sus4", 2), ("F#", 2)])     # 0-16
    seq(16, ["Dadd9", "A/C#", "Bm7", "Gadd9", ("Asus4", 1), ("A", 1)])           # 16-26
    seq(26, ["D", "Bm", "G", "A"] * 5 + ["D", "Bm", "G"])                         # 26-72
    seq(72, [("F#sus4", 2), ("F#", 2)])                                          # 72-76
    seq(76, ["Bm", "G", "Em", "F#"] * 3)                                         # 76-100
    seq(100, ["G", ("Asus4", 1), ("A", 1)])                                      # 100-104
    seq(104, ["D", "A/C#", "Bm", "G"] + ["D", "A/C#"])                           # 104-116
    seq(116, ["Gmaj7", "D/F#", "Em7", "A"] * 2 + ["Gmaj7", "D/F#", "Em7"])       # 116-138
    seq(138, ["Gmaj7", "A", "F#m7", "Bm7", "Gmaj7", "A", "Bm7", "A/C#"])         # 138-154
    seq(154, ["Em7", "G", ("Asus4", 1), ("A", 1)])                               # 154-160
    seq(160, ["Dadd9", "Gadd9", ("Dadd9", 4)])                                   # 160-168
    P.sort()
    return P


def chord_at(plan, t):
    for a, b, nm in plan:
        if a <= t < b:
            return nm
    return plan[-1][2]


def compose_music(events):
    t_start = time.time()
    plan = chord_plan()
    B = {k: bus() for k in ("piano", "mallet", "pluck", "bass", "pad", "drums", "kick", "fx")}

    def note(b, x, t, g, pan=0.0):
        place(B[b], x, t, g, pan)

    def grid(t0, t1, step, off=0.0):
        n0 = int(np.ceil((t0 - off) / step - 1e-9))
        out = []
        t = n0 * step + off
        while t < t1 - 1e-9:
            out.append(round(t, 4))
            t += step
        return out

    # ---------------- INTRO 0-16: clock ticks, felt piano, the two-dates motif --------------
    for i, t in enumerate(grid(0.5, 14.0, 0.5)):
        g = 0.05 + 0.05 * min(1, t / 6)
        note("drums", drum("tick", i), t, g, -0.3 if i % 2 else 0.3)
    for a, b, nm in plan:
        if b <= 16:
            bs, vo = CH[nm]
            note("piano", felt_piano(bs + 12, 0.35, b - a + 0.3), a, 0.30)
            for j, m in enumerate(vo[:3]):
                note("piano", felt_piano(m, 0.28, b - a + 0.2), a + 0.03 * j, 0.20, -0.2 + 0.2 * j)
            note("pad", pad_chord([bs + 12] + vo[:3], b - a, attack=1.2, release=1.5, seed=int(a), bright=900), a, 0.10)
    motif = [(1.5, 74, .5), (2.0, 76, .5), (2.5, 78, 1.0),            # Tanishk's phrase (the call)
             (4.5, 74, .5), (5.0, 76, .5), (5.5, 74, 1.0),            # Lakshya's phrase (the email)
             (8.0, 69, 0.9), (8.5, 67, 0.9),                          # circle 18 (A4) / circle 16 (G4)
             (12.0, 78, 1.5)]
    for t, m, d in motif:
        note("piano", felt_piano(m, 0.5, d), t, 0.42, 0.1)
    for t, m in ((9.0, 69), (9.15, 67)):                               # the two dates collide
        note("piano", felt_piano(m, 0.65, 1.2), t, 0.45, -0.2 if m == 69 else 0.2)
        note("piano", felt_piano(m + 12, 0.5, 1.0), t, 0.22)
    note("piano", felt_piano(23, 0.6, 2.5), 10.0, 0.5)                # the "?" lands: low B
    note("piano", felt_piano(29, 0.5, 2.5), 10.0, 0.35)               # with its tritone
    for i, (t, m) in enumerate([(13.0, 71), (13.5, 73), (14.0, 74), (14.5, 76), (15.0, 78), (15.25, 79), (15.5, 80), (15.75, 81)]):
        note("piano", felt_piano(m, 0.4 + 0.04 * i, 0.5), t, 0.30 + 0.02 * i, 0.15)
    note("fx", reverse_cymbal(2.0, 1), 14.0, 0.22)
    note("fx", noise_riser(2.0, 250, 5000, 1), 14.0, 0.07)

    # ---------------- shared groove writer ----------------
    def groove(t0, t1, kit="light", mallet=True, plucks=True, bassline=True, piano_mel=None, shaker=True, hats=False,
               clap=False, kick_g=0.45, mel_g=0.36, mal_g=0.24, pl_g=0.18):
        for t in grid(t0, t1, BAR):
            nm = chord_at(plan, t + 0.01)
            bs, vo = CH[nm]
            if kit in ("light", "full", "half", "muffled"):
                hits = [0, 1.0] if kit != "half" else [0]
                for o in hits:
                    if t + o < t1:
                        note("kick", drum("kick" if kit != "muffled" else "kick_soft"), t + o, kick_g)
                if kit != "muffled":
                    for o in ([0.5, 1.5] if kit != "half" else [1.0]):
                        if t + o < t1:
                            note("drums", drum("brush", int(t * 2 + o * 2) % 3), t + o, 0.26)
                            if clap:
                                note("drums", drum("clap", int(t) % 2), t + o + 0.004, 0.16, 0.1)
                    if kit == "full" and t + 1.75 < t1:
                        note("kick", drum("kick"), t + 1.75, kick_g * 0.45)
            if shaker:
                for j, o in enumerate(np.arange(0, 2, 0.25)):
                    if t + o < t1:
                        acc = 1.0 if j % 2 else 0.6
                        note("drums", drum("shaker", j % 4), t + o, 0.05 * acc, 0.35)
            if hats:
                for j, o in enumerate(np.arange(0.25, 2, 0.5)):
                    if t + o < t1:
                        note("drums", drum("hat", j % 3), t + o, 0.07, -0.3)
            if bassline:
                for o, m, d in ((0, bs, 0.45), (0.75, bs, 0.2), (1.0, bs + 7, 0.45), (1.75, bs + 12, 0.2)):
                    if t + o < t1:
                        note("bass", bass_note(m, d, 0.8 if o == 0 else 0.55), t + o, 0.21)
            if mallet:
                pat = [0, 1, 2, 3, 2, 1, 3, 2]
                for j, o in enumerate(np.arange(0, 2, 0.25)):
                    if t + o < t1:
                        m = vo[pat[j]] + 12
                        note("mallet", marimba(m, 0.55 if j % 2 == 0 else 0.4), t + o, mal_g, 0.25 if j % 2 else -0.15)
            if plucks:
                for o in (0.25, 0.75, 1.25, 1.75):
                    if t + o < t1:
                        for k, m in enumerate(vo[1:4]):
                            note("pluck", pluck(m, 0.5, t60=0.35, dur=0.5, bright=0.55), t + o + 0.006 * k, pl_g / 2, -0.3 + 0.3 * k)
        if piano_mel:
            phrase, base = piano_mel
            for t in grid(t0, t1, 8.0, off=base % 8.0):
                for bt, m, d in phrase:
                    tt = t + bt * BEAT
                    if t0 <= tt < t1:
                        note("piano", felt_piano(m, 0.55, d * BEAT), tt, mel_g, 0.05)

    MEL_A = [(0, 78, 2), (2, 76, 1), (3, 74, 1), (4, 74, 1.5), (5.5, 73, .5), (6, 71, 2), (8, 71, 1), (9, 74, 1), (10, 79, 2),
             (12, 76, 1.5), (13.5, 74, .5), (14, 73, 2)]
    MEL_MIN = [(0, 71, 1), (1, 74, 1), (2, 73, 2), (4, 71, 1.5), (5.5, 69, .5), (6, 67, 2), (8, 67, 1), (9, 71, 1), (10, 76, 2),
               (12, 73, 1.5), (13.5, 70, .5), (14, 73, 2)]
    MEL_VIS = [(0, 74, 3), (3, 76, 1), (4, 76, 3), (7, 78, 1), (8, 73, 4), (12, 74, 2), (14, 71, 2)]

    # ---------------- TITLE 16-26 ----------------
    note("drums", drum("crash"), 16.0, 0.30)
    note("kick", drum("kick"), 16.0, 0.8)
    bs, vo = CH["Dadd9"]
    note("piano", felt_piano(bs, 0.7, 2.5), 16.0, 0.45)
    note("piano", felt_piano(bs + 12, 0.7, 2.5), 16.0, 0.35)
    for j, m in enumerate(vo + [vo[-1] + 12]):
        note("piano", felt_piano(m, 0.7, 2.0), 16.0 + 0.012 * j, 0.24, -0.3 + 0.15 * j)
    note("pad", pad_chord([bs + 12] + vo, 10.0, attack=0.05, release=1.0, seed=16, bright=1800), 16.0, 0.12)
    for j, m in enumerate([74, 78, 81, 86, 90]):
        note("mallet", marimba(m, 0.6), 16.0 + 0.06 * j, 0.22, -0.4 + 0.2 * j)
    groove(16.5, 25.0, kit="light", mallet=False, plucks=True, bassline=True, shaker=True, clap=True, kick_g=0.5)
    groove(18.0, 25.0, kit=None, mallet=True, plucks=False, bassline=False, shaker=False, mal_g=0.16)
    for i, t in enumerate(grid(25.0, 26.0, 0.125)):                    # fill under the dive
        note("drums", drum("snare_roll_hit", i % 3), t, 0.05 + 0.16 * (t - 25.0), 0.1 * ((-1) ** i))
    note("drums", drum("tom", 0), 25.5, 0.25, -0.3)
    note("drums", drum("tom", 1), 25.75, 0.25, 0.3)

    # ---------------- DEMO A 26-46 ----------------
    note("drums", drum("crash"), 26.0, 0.18)
    groove(26.0, 30.0, kit="light", mallet=False, plucks=True, shaker=False, hats=True)
    groove(30.0, 34.0, kit="light", mallet=True, plucks=True, shaker=False, hats=True)
    groove(34.0, 46.0, kit="light", mallet=True, plucks=True, shaker=True, piano_mel=(MEL_A, 34.0))
    # ---------------- OFFLINE 46-72 (low-passed, kick muffled) ----------------
    groove(46.0, 72.0, kit="muffled", mallet=True, plucks=True, shaker=False, piano_mel=(MEL_A, 46.0), kick_g=0.5)
    for a, b, nm in plan:
        if 46 <= a < 72:
            bs, vo = CH[nm]
            note("pad", pad_chord(vo, b - a, attack=0.4, release=0.8, seed=int(a), bright=1400), a, 0.12)
    for t in grid(62.85, 68.4, 0.5):                                   # Lakshya's laptop is online: hats back
        note("drums", drum("hat", int(t * 2) % 3), t + 0.25, 0.06, -0.3)
    # ---------------- RISER 72-76 ----------------
    for t in grid(72.0, 74.95, 2.0):
        nm = chord_at(plan, t + .01)
        bs, vo = CH[nm]
        note("pad", pad_chord([bs + 12] + vo, 2.0 if t < 74 else 0.95, attack=0.3, release=0.15, seed=int(t), bright=2200), t, 0.15)
    for t in grid(72.0, 74.95, 0.5):
        note("bass", bass_note(CH["F#"][0], 0.4, 0.7), t, 0.26)
        note("kick", drum("kick_soft"), t, 0.35 + 0.1 * (t - 72) / 3)
    roll = grid(73.0, 74.0, 0.25) + grid(74.0, 74.5, 0.125) + grid(74.5, 74.95, 0.0625)
    for i, t in enumerate(roll):
        note("drums", drum("snare_roll_hit", i % 3), t, 0.05 + 0.2 * ((t - 73.0) / 2.0) ** 1.5, 0.15 * ((-1) ** i))
    for i, t in enumerate(grid(72.0, 74.95, 0.25)):                    # piano pulse climbing on F#
        m = [66, 68, 70, 71, 73, 75, 76, 78][min(7, int((t - 72) / 0.375))]
        note("piano", felt_piano(m, 0.45, 0.22), t, 0.20)
    rz = noise_riser(2.95, 300, 9000, 72)
    note("fx", rz, 72.0, 0.12)
    note("fx", reverse_cymbal(0.5, 75), 75.5, 0.16)                     # sucks into the hit
    # breath 74.95-76.0: music silent except the reverse cymbal (the SFX carry the reconnect)

    # ---------------- CONFLICT 76-104 ----------------
    note("drums", drum("crash"), 76.0, 0.36)
    note("kick", drum("kick"), 76.0, 0.9)
    bs, vo = CH["Bm"]
    note("piano", felt_piano(bs, 0.8, 2.0), 76.0, 0.5)
    note("piano", felt_piano(bs + 12, 0.8, 2.0), 76.0, 0.4)
    for j, m in enumerate(vo + [72]):                                  # Bm with a C on top: tension
        note("piano", felt_piano(m, 0.75, 1.8), 76.0 + 0.01 * j, 0.22, -0.25 + 0.12 * j)
    note("pad", pad_chord([bs + 12] + vo, 2.0, attack=0.02, release=1.2, seed=76, bright=1600), 76.0, 0.14)
    note("pluck", pluck(83, 0.6, t60=0.3, dur=0.5), 77.0, 0.22, -0.3)  # stopwatch +0.5 s
    note("pluck", pluck(86, 0.6, t60=0.3, dur=0.5), 77.5, 0.22, 0.3)   # stopwatch +1.0 s
    MIN_KIT = dict(kit="light", mallet=False, plucks=True, shaker=False, bassline=True, pl_g=0.13)
    groove(78.0, 79.5, **MIN_KIT)
    for t, m in ((80.5, 71), (80.75, 73), (81.0, 74), (81.25, 78)):     # the needle climbs
        note("pluck", pluck(m + 12, 0.6, t60=0.5, dur=0.7), t, 0.20, 0.2)
    for a, b, nm in plan:
        if 78 <= a < 100:
            bs, vo = CH[nm]
            note("pad", pad_chord(vo, b - a, attack=0.5, release=0.8, seed=int(a), bright=1300), a, 0.10)
    groove(82.0, 100.0, piano_mel=(MEL_MIN, 82.0), mel_g=0.30, **MIN_KIT)
    for t in grid(82.0, 100.0, 0.25):                                    # tense pulse
        nm = chord_at(plan, t + .01)
        note("mallet", marimba(CH[nm][1][0] + 12, 0.35), t, 0.07, -0.2)
    groove(100.0, 104.0, kit="light", mallet=True, plucks=True, shaker=True, mal_g=0.17)
    for i, t in enumerate(grid(102.0, 104.0, 0.125)):
        note("drums", drum("snare_roll_hit", i % 3), t, 0.04 + 0.14 * ((t - 102) / 2) ** 2, 0.1 * ((-1) ** i))
    note("fx", noise_riser(2.0, 400, 6000, 102), 102.0, 0.06)

    # ---------------- RESOLVE 104-116 ----------------
    note("drums", drum("crash"), 104.0, 0.26)
    bs, vo = CH["D"]
    for j, m in enumerate([bs, bs + 12] + vo):
        note("piano", felt_piano(m, 0.7, 2.0), 104.0 + 0.01 * j, 0.25)
    groove(104.0, 116.0, kit="full", mallet=True, plucks=True, shaker=True, hats=True, clap=True,
           piano_mel=(MEL_A, 104.0), mel_g=0.34)
    for a, b, nm in plan:
        if 104 <= a < 116:
            bs, vo = CH[nm]
            note("pad", pad_chord(vo, b - a, attack=0.3, release=0.6, seed=int(a), bright=1800), a, 0.10)
    for t, m in [(104.0 + 8 * k + bt * BEAT, mm + 12) for k in range(2) for bt, mm, d in MEL_A[:6]]:
        if t < 116:
            note("mallet", marimba(m, 0.5), t, 0.12, 0.3)

    # ---------------- EXPLAIN 116-138 (thin, curious) ----------------
    groove(116.0, 128.0, kit=None, mallet=False, plucks=True, shaker=True, bassline=True, pl_g=0.15)
    for a, b, nm in plan:
        if 116 <= a < 138:
            bs, vo = CH[nm]
            note("pad", pad_chord(vo, b - a, attack=0.6, release=0.8, seed=int(a), bright=1200), a, 0.07)
    for e in events:                                                     # marimba answers each lit step
        if e["type"] == "pop" and "flow step" in e.get("label", ""):
            m = int(round(69 + 12 * np.log2(e["f"] / 440.0)))
            note("mallet", marimba(m, 0.6), e["t"], 0.16, 0.2)
    groove(128.0, 138.0, kit="half", mallet=False, plucks=True, shaker=True, bassline=True, pl_g=0.14, kick_g=0.45)
    for t, m in ((134.0, 76), (134.25, 78), (134.5, 81)):                 # the dot rolls over the bar
        note("pluck", pluck(m + 12, 0.6, t60=0.5, dur=0.7), t, 0.18, -0.2)
    bs, vo = CH["Em7"]
    for j, m in enumerate(vo):                                           # "Ask the owner." lands
        note("piano", felt_piano(m + 12, 0.5, 1.2), 136.5 + 0.02 * j, 0.16)

    # ---------------- VISION 138-154 (warm pads, half time) ----------------
    for a, b, nm in plan:
        if 138 <= a < 154:
            bs, vo = CH[nm]
            note("pad", pad_chord([bs + 12] + vo, b - a, attack=0.9, release=1.0, seed=int(a), bright=1700), a, 0.17)
            note("bass", bass_note(bs, b - a - 0.1, 0.6), a, 0.26)
            for k, m in enumerate(vo):
                note("piano", felt_piano(m, 0.35, 1.5), a + 0.5 + k * 0.25, 0.10, -0.3 + 0.2 * k)
    groove(138.0, 154.0, kit="half", mallet=False, plucks=False, shaker=True, bassline=False, piano_mel=(MEL_VIS, 138.0),
           mel_g=0.38, kick_g=0.42)

    # ---------------- CLOSE BUILD 154-160 ----------------
    for a, b, nm in plan:
        if 154 <= a < 160:
            bs, vo = CH[nm]
            note("pad", pad_chord([bs + 12] + vo, b - a, attack=0.3, release=0.3, seed=int(a), bright=2400), a, 0.14)
    groove(154.0, 159.5, kit="light", mallet=True, plucks=True, shaker=True, mal_g=0.17)
    roll = grid(156.0, 158.0, 0.25) + grid(158.0, 159.0, 0.125) + grid(159.0, 159.5, 0.0625)
    for i, t in enumerate(roll):
        note("drums", drum("snare_roll_hit", i % 3), t, 0.04 + 0.16 * ((t - 156.0) / 3.5) ** 1.6, 0.12 * ((-1) ** i))
    for e in events:                                                     # glock doubles the region numbers
        if e["type"] == "pop" and "region number" in e.get("label", ""):
            m = int(round(69 + 12 * np.log2(e["f"] / 440.0)))
            note("mallet", glock(m + 12, 0.5), e["t"], 0.12, 0.15)
    note("fx", noise_riser(2.5, 300, 9000, 157), 157.5, 0.08)
    note("fx", reverse_cymbal(1.0, 159), 159.0, 0.14)

    # ---------------- CLOSE 160-168 ----------------
    note("drums", drum("crash"), 160.0, 0.34)
    note("kick", drum("kick"), 160.0, 0.85)
    bs, vo = CH["Dadd9"]
    for j, m in enumerate([bs, bs + 12] + vo + [vo[-1] + 12]):
        note("piano", felt_piano(m, 0.75, 3.5), 160.0 + 0.012 * j, 0.25, -0.3 + 0.1 * j)
    note("pad", pad_chord([bs + 12] + vo, 7.0, attack=0.03, release=1.0, seed=160, bright=2000), 160.0, 0.15)
    for j, m in enumerate([74, 78, 81, 86, 90, 93]):
        note("mallet", marimba(m, 0.6), 160.0 + 0.05 * j, 0.18, -0.4 + 0.16 * j)
    groove(162.0, 164.0, kit="half", mallet=True, plucks=True, shaker=True, bassline=True, mal_g=0.13, kick_g=0.4)
    bs, vo = CH["Dadd9"]
    for j, m in enumerate([bs, bs + 12] + vo):                           # final chord rings out
        note("piano", felt_piano(m, 0.5, 3.6), 164.0 + 0.03 * j, 0.22, -0.2 + 0.1 * j)
    note("mallet", glock(86, 0.5), 164.0, 0.14)
    note("mallet", glock(93, 0.4), 164.5, 0.10)

    print(f"  notes placed      {time.time() - t_start:5.1f}s")

    # ---------------- mix the score ----------------
    # the offline low-pass: on the whole bed while Tanishk is cut off; opens on Lakshya's laptop
    lp = curve([(0, 18000), (46.0, 18000), (46.35, 700), (62.6, 700), (63.4, 2600), (68.45, 2600), (69.2, 700),
                (72.0, 700), (74.95, 16000), (DUR, 16000)], log=True)
    bed = B["piano"] + B["mallet"] + B["pluck"] + B["pad"]
    bed = tv_biquad(bed, "lp", lp, q=0.75, block=128, stages=2)
    bass = tv_biquad(B["bass"], "lp", np.maximum(lp, 250), q=0.7, block=128)
    drums = B["drums"].astype(np.float64)
    dlp = curve([(0, 1.0), (46.0, 1.0), (46.3, 0.0), (62.6, 0.0), (63.2, 1.0), (68.45, 1.0), (69.0, 0.0), (72.9, 0.0), (73.0, 1.0), (DUR, 1)])
    drums *= dlp
    kick = tv_biquad(B["kick"], "lp", np.where((T > 46.1) & (T < 72.0), 180.0, 9000.0), q=0.7, block=128)
    music = bed + 0.9 * bass + drums + kick + B["fx"]
    # breath before the hit: everything but the reverse cymbal drops out 74.95 -> 76.0
    br = curve([(0, 1), (74.9, 1), (74.98, 0.0), (75.99, 0.0), (76.0, 1), (DUR, 1)])
    music = music * br + B["fx"] * (1 - br)
    # stems' reverb: a warm room
    ir = make_ir(1.9, 3.0, "music", lp=6500)
    send = 0.30 * (bed + 0.15 * drums) + 0.6 * B["fx"]
    music = music + 0.5 * convolve(send, ir)
    music = filt(music, "highpass", 32, 2)
    # tone: lighter low end, a little air on top (the bed measured dark and boomy)
    music = music - (1 - db(-4.5)) * filt(music, "lowpass", 110, 2) + (db(4.0) - 1) * filt(music, "highpass", 3500, 2)
    print(f"  music mixed       {time.time() - t_start:5.1f}s")
    return music.astype(np.float32)


# ======================================================================================
# Loudness, dynamics, master
# ======================================================================================
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
    return -0.691 + 10 * np.log10(z[l > rel].mean())


def short_term(x, win=3.0):
    """Short-term loudness (LUFS-ish) per 0.1 s."""
    y = k_weight(x.astype(np.float64))
    p = (y ** 2).sum(0)
    blk, hop = int(win * SR), int(0.1 * SR)
    cs = np.concatenate([[0], np.cumsum(p)])
    st = np.arange(0, len(p) - blk, hop)
    return st / SR + win / 2, -0.691 + 10 * np.log10((cs[st + blk] - cs[st]) / blk + 1e-20)


def true_peak_env(x):
    up = signal.resample_poly(x, 4, 1, axis=-1)
    a = np.abs(up).max(0)
    a = a[: (len(a) // 4) * 4].reshape(-1, 4).max(1)
    return np.pad(a, (0, max(0, x.shape[1] - len(a))))


def glue_gain(x, thr_db=-16.0, ratio=1.5, att=0.03, rel=0.35, hop=48):
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
    gr = np.where(over <= -knee / 2, 0.0, np.where(over >= knee / 2, over * (1 - 1 / ratio), (1 - 1 / ratio) * (over + knee / 2) ** 2 / (2 * knee)))
    return np.interp(np.arange(len(p)), np.arange(n) * hop + hop / 2, db(-gr)).astype(np.float32)


def limiter_gain(x, ceiling_db=-1.5, look=0.004, rel=0.08):
    pk = true_peak_env(x)
    c = db(ceiling_db)
    req = np.minimum(1.0, c / np.maximum(pk, 1e-9))
    L = int(look * SR)
    g = uniform_filter1d(minimum_filter1d(req, 2 * L + 1), L + 1)
    R = int(rel * SR)
    g2 = uniform_filter1d(minimum_filter1d(req, 2 * R + 1), R + 1)
    return np.minimum(g, g2).astype(np.float32)


def master(music, sfx, target=-16.0, ceiling=-1.5):
    mix = music + sfx
    g = glue_gain(mix)
    fades = np.ones(N, dtype=np.float32)
    nf = int(0.05 * SR)
    fades[:nf] = np.linspace(0, 1, nf)
    i0, i1 = int(166.2 * SR), int(167.9 * SR)                 # tail done by 167.9, then digital silence
    fades[i0:i1] = ((0.5 + 0.5 * np.cos(np.linspace(0, np.pi, i1 - i0))) ** 1.4).astype(np.float32)
    fades[i1:] = 0.0
    total = g * fades
    gain = 1.0
    lim = np.ones(N, dtype=np.float32)
    for it in range(5):
        y = mix * total * gain
        lim = limiter_gain(y, ceiling - 0.4)
        y = y * lim
        L = lufs_integrated(y)
        print(f"  master pass {it}: LUFS {L:6.2f}  gain {20 * np.log10(gain):+5.2f} dB  max limiter GR {-20 * np.log10(lim.min()):4.1f} dB")
        if abs(L - target) < 0.1:
            break
        gain *= db(target - L)
    c = total * gain * lim
    return music * c, sfx * c


def write_wav(path, x, seed=0):
    rng = np.random.default_rng(seed)
    d = (rng.random(x.shape) - rng.random(x.shape)) / 32768.0
    d *= (np.abs(x) > 1e-7)
    y = np.clip(x + d, -1.0, 32767 / 32768)
    wavfile.write(path, SR, np.round(y.T * 32767).astype(np.int16))


def ffmpeg_loudness(path):
    try:
        r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", path, "-af", "ebur128=peak=true", "-f", "null", "-"],
                           capture_output=True, text=True, timeout=300)
        txt = r.stderr[r.stderr.rfind("Summary:"):]
        I = re.search(r"I:\s+(-?[\d.]+) LUFS", txt)
        LRA = re.search(r"LRA:\s+(-?[\d.]+) LU", txt)
        TP = re.search(r"Peak:\s+(-?[\d.]+) dBFS", txt)
        return tuple(float(m.group(1)) if m else None for m in (I, LRA, TP))
    except Exception as e:  # noqa
        print("  ffmpeg failed:", e)
        return None, None, None


def analyze(paths):
    sr, d = wavfile.read(paths["soundtrack"])
    x = d.T.astype(np.float64) / 32768.0
    n = x.shape[1]
    print(f"\n== soundtrack.wav: {n / sr:.3f} s, {sr} Hz, {x.shape[0]} ch")
    print(f"  sample peak {20 * np.log10(np.abs(x).max()):6.2f} dBFS   clipped samples: {(np.abs(d) >= 32767).sum()}")
    I, LRA, TP = ffmpeg_loudness(paths["soundtrack"])
    print(f"  ffmpeg ebur128: integrated {I} LUFS, LRA {LRA} LU, true peak {TP} dBTP")
    print("  section          RMS dB  peak dB")
    for s in CUES["music_sections"]:
        a, b = s["start"], s["end"]
        seg = x[:, int(a * sr):int(b * sr)]
        print(f"  {s['name']:15s} {20 * np.log10(np.sqrt((seg ** 2).mean()) + 1e-12):7.1f} {20 * np.log10(np.abs(seg).max() + 1e-12):8.1f}")
    for k in ("music", "sfx"):
        sr2, d2 = wavfile.read(paths[k])
        y = d2.astype(np.float64) / 32768
        print(f"  {k}.wav: peak {20 * np.log10(np.abs(y).max()):.1f} dBFS  RMS {20 * np.log10(np.sqrt((y ** 2).mean())):.1f} dBFS")
    tail = x[:, -int(0.05 * sr):]
    print(f"  last 50 ms peak: {20 * np.log10(np.abs(tail).max() + 1e-12):.1f} dBFS")
    return I, TP


def sfx_report(events, music, sfx):
    """Per type: count and the median of (SFX peak in its 80 ms window) - (music short-term loudness)."""
    ts, st = short_term(music, 1.0)
    rows = {}
    for e in events:
        i0 = int(e["t"] * SR)
        w = sfx[:, max(0, i0 - int(0.01 * SR)): i0 + int(0.08 * SR)]
        if w.size == 0:
            continue
        pk = 20 * np.log10(np.abs(w).max() + 1e-9)
        ml = float(np.interp(e["t"], ts, st))
        rows.setdefault(e["type"], []).append((pk, ml))
    print("  sfx type        n   median peak dBFS   median music LUFS(1s)")
    for k, v in sorted(rows.items()):
        a = np.array(v)
        print(f"  {k:14s} {len(v):4d}   {np.median(a[:, 0]):8.1f}          {np.median(a[:, 1]):8.1f}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--analyze-only", action="store_true")
    ap.add_argument("--list", action="store_true", help="print the resolved SFX events and exit")
    ap.add_argument("--target", type=float, default=-16.0)
    a = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    out = {k: os.path.join(HERE, k + ".wav") for k in ("soundtrack", "music", "sfx")}
    if a.analyze_only:
        analyze(out)
        return
    t0 = time.time()
    events, pic = build_events()
    if a.list:
        for e in events:
            extra = " ".join(f"{k}={e[k]}" for k in ("dur", "color", "width", "char", "ease", "claims") if k in e)
            print(f"{e['t']:8.3f}  {e['type']:14s} g={e['gain']:.2f} {e.get('src', ''):14s} {e.get('label', '')[:50]:50s} {extra}")
        print(len(events), "events")
        return
    cnt = {}
    for e in events:
        cnt[e["type"]] = cnt.get(e["type"], 0) + 1
    print("events:", json.dumps(cnt))
    print("composing music ...")
    music = compose_music(events)
    print("rendering sfx ...")
    sd, sw = render_sfx(events)
    sfx = sd + 0.5 * convolve(sw, make_ir(0.6, 1.2, "sfxroom", lp=8000, predelay=0.008))
    sfx = filt(sfx, "highpass", 45, 2).astype(np.float32)
    music = music * duck_curve(events)
    print("mastering ...")
    mo, so = master(music.astype(np.float64), sfx.astype(np.float64), a.target)
    write_wav(out["music"], mo, 1)
    write_wav(out["sfx"], so, 2)
    write_wav(out["soundtrack"], mo + so, 3)
    print(f"done in {time.time() - t0:.1f}s")
    sfx_report(events, mo, so)
    analyze(out)


if __name__ == "__main__":
    main()
