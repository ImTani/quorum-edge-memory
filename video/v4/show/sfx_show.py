"""Render the stage show's SFX stem (video/v4/audio/sfx_show.wav) from the film's composer (audio/compose.py),
with a softer marker. On stage the effects play alone (no music under them), and the film's felt-marker
sound (a friction hiss band-passed at 1.5-7.2 kHz plus a 1.5-2.1 kHz stick-slip squeal) put about half its
energy in the 2-6 kHz band that reads as harsh, on 200+ strokes. Here the hiss sits lower (0.45-2.6 kHz),
the squeal is lower and mostly gone, and marker sounds are 4 dB quieter. Everything else is the film's
sound design, level-matched to the film's stem. The film's own files are not touched.

Run with a Python that has numpy and scipy (the film's composer needs both):
    python video\\v4\\show\\sfx_show.py
The show player uses sfx_show.wav when it exists, else the film's sfx.wav.
"""
import os
import sys

import numpy as np
from scipy.io import wavfile

HERE = os.path.dirname(os.path.abspath(__file__))
AUDIO = os.path.join(os.path.dirname(HERE), "audio")
sys.path.insert(0, AUDIO)
import compose as C  # noqa: E402

MARKER_TYPES = ("stroke", "writing", "dab")
MARKER_TRIM_DB = -4.0


def fx_marker_soft(dur, width=5.0, color="blue", seed=0, dry=True, scale=1.0):
    """Felt marker, stage version: the same speed-following friction, darker and with almost no squeal."""
    rng = C.rng_for("marker", seed, round(dur, 3), color)
    dur = max(0.02, dur)
    pre = 0.006
    n = int((dur + 0.06) * C.SR)
    nd = int(dur * C.SR)
    t = np.arange(n) / C.SR
    u = np.clip(t / dur, 0, 1)
    speed = np.sin(np.pi * u) ** 0.7 * (t < dur)
    speed = 0.25 * (t < dur) + 0.75 * speed
    touch = np.exp(-t / 0.006)
    lift = np.exp(-np.clip(t - dur, 0, None) / 0.012) * (t >= dur)
    amp = np.maximum(speed, 0) + 0.4 * touch
    amp[nd:] = lift[nd:] * 0.3
    pitch = C.PEN.get(color, 1.0) * (5.0 / max(2.0, width)) ** 0.22 * scale * rng.uniform(0.96, 1.04)
    grain = 0.7 + 0.3 * C.smooth_noise(rng, n, 30)
    hiss = rng.standard_normal(n)
    hiss = C.filt(hiss, "bandpass", [450 * pitch, 2600 * min(1.1, pitch)], 2)
    hiss = C.norm(hiss) * grain
    f0 = rng.uniform(800, 1050) * pitch
    fr = f0 * (1 + 0.06 * C.smooth_noise(rng, n, 6))
    ph = 2 * np.pi * np.cumsum(fr) / C.SR
    sq = np.sin(ph) + 0.15 * np.sin(2 * ph + 0.4)
    gate = np.clip(C.smooth_noise(rng, n, 7) * 1.4 + rng.uniform(-0.5, 0.2), 0, 1)
    sq *= gate * 0.25
    y = (0.85 * hiss + 0.08 * sq) * amp
    tap = C.filt(rng.standard_normal(n), "bandpass", [400, 1800], 2) * np.exp(-t / 0.003)
    y += 0.25 * C.norm(tap)
    y = C.filt(y, "lowpass", 3000, 2)
    y = C.fade(y, 0.002, 0.012)
    return C.norm(y) * (0.55 + 0.45 * min(1.0, dur / 0.25)), pre


def fx_dab_soft(seed=0, color="blue"):
    rng = C.rng_for("dab", seed)
    n = int(0.045 * C.SR)
    t = np.arange(n) / C.SR
    p = C.PEN.get(color, 1.0)
    y = C.filt(rng.standard_normal(n), "bandpass", [600 * p, 2600], 2) * np.exp(-t / 0.009)
    y += 0.1 * np.sin(2 * np.pi * 900 * p * t) * np.exp(-t / 0.006)
    return C.fade(C.norm(y), 0.001, 0.008), 0.002


def render(events):
    sd, sw = C.render_sfx(events)
    sfx = sd + 0.5 * C.convolve(sw, C.make_ir(0.6, 1.2, "sfxroom", lp=8000, predelay=0.008))
    return C.filt(sfx, "highpass", 45, 2)


def rms_over(x, events, types):
    """RMS of x over the given event types' windows (mono)."""
    m = x.mean(axis=0) if x.ndim > 1 and x.shape[0] == 2 else (x.mean(axis=1) if x.ndim > 1 else x)
    acc, cnt = 0.0, 0
    for e in events:
        if e["type"] not in types:
            continue
        i0 = int(e["t"] * C.SR)
        i1 = i0 + int(max(0.05, min(e.get("dur", 0.25) or 0.25, 1.0)) * C.SR)
        seg = m[i0:i1]
        acc += float(np.sum(seg.astype(np.float64) ** 2))
        cnt += len(seg)
    return np.sqrt(acc / max(cnt, 1))


def peak_at(x, e, win=0.12):
    i0 = int(e["t"] * C.SR)
    return float(np.abs(x[:, i0:i0 + int(win * C.SR)]).max())


def main():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    events, _ = C.build_events()
    sr, film = wavfile.read(os.path.join(AUDIO, "sfx.wav"))
    film = film.astype(np.float64)
    if film.dtype.kind == "i" or np.abs(film).max() > 2:
        film /= 32768.0
    film = film.T                                    # channels first, like compose's buses

    C.fx_marker, C.fx_dab = fx_marker_soft, fx_dab_soft
    film_eraser = C.fx_eraser

    def fx_eraser_soft(dur, seed=0):
        """The film's felt eraser (its squeaks already use the soft marker above), rolled off above 3 kHz."""
        x, pre = film_eraser(dur, seed)
        return C.filt(x, "lowpass", 3000, 2), pre
    C.fx_eraser = fx_eraser_soft
    for k in MARKER_TYPES:
        C.LEVEL[k] = C.LEVEL[k] * C.db(MARKER_TRIM_DB)
    print("rendering the stage SFX stem ...")
    new = render(events)

    # level-match on the loud one-off sounds (markers never overlap them much): every non-marker sound
    # keeps the film's level, only the markers change
    anchors = ("conflict_hit", "logo_hit", "disconnect_thud", "drop_thunk", "sticky_slap", "toggle_clack")
    g = float(np.median([peak_at(film, e) / max(peak_at(new, e), 1e-9) for e in events if e["type"] in anchors]))
    new = new * g
    lim = C.limiter_gain(new.astype(np.float32), -1.9)
    new = new * lim
    out = os.path.join(AUDIO, "sfx_show.wav")
    C.write_wav(out, new.astype(np.float32), 2)
    print(f"wrote {out}  (gain {20 * np.log10(g):+.1f} dB to match the film's non-marker level)")


if __name__ == "__main__":
    main()
