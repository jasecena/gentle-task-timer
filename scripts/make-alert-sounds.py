#!/usr/bin/env python3
"""
Generates the bundled alert sounds in assets/sounds/.

The tones are synthesised rather than sourced, which is deliberate: the app
ships them inside the bundle, and a synthesised waveform has no licence, no
attribution and no provenance question at App Review. Re-run this after editing
a voice; the output is deterministic.

    python3 scripts/make-alert-sounds.py

Format is 16-bit mono PCM WAV at 44.1kHz. iOS requires a notification sound to
be Linear PCM, MA4, uLaw or aLaw, under 30 seconds, and sitting in the app
bundle — which is what the expo-notifications config plugin's `sounds` array
arranges. See docs/ARCHITECTURE.md.
"""

from __future__ import annotations

import math
import struct
import wave
from pathlib import Path

SAMPLE_RATE = 44_100

# The long ring is eight times the length, so it is written at half the rate to
# keep the bundle sane. A notification chime has nothing above ~8kHz in it, so
# 22.05kHz costs nothing audible and halves every long file.
LONG_SAMPLE_RATE = 22_050

# How long the "10s" ring setting actually rings. iOS plays a custom
# notification sound to its end and gives no way to stop it early, so this is
# also the longest anyone has to sit through one.
LONG_RING_S = 10.0

OUTPUT_DIR = Path(__file__).resolve().parent.parent / "assets" / "sounds"

# Long enough to breathe, short enough that a run of three cycles does not feel
# like a doorbell recital.
ATTACK_S = 0.004
PEAK = 0.72


def note(freq: float, start_s: float, length_s: float, partials: list[tuple[float, float]], decay: float):
    """One struck tone: a fundamental plus partials, under an exponential decay."""
    return {"freq": freq, "start": start_s, "length": length_s, "partials": partials, "decay": decay}


# Partial sets: (harmonic multiplier, relative amplitude).
BELL = [(1.0, 1.0), (2.0, 0.42), (3.01, 0.22), (4.17, 0.12), (5.43, 0.06)]
WOOD = [(1.0, 1.0), (3.0, 0.28), (6.2, 0.07)]
SOFT = [(1.0, 1.0), (2.0, 0.18)]

# Frequencies, equal temperament.
C6, E6, G6, A6, C7 = 1046.50, 1318.51, 1567.98, 1760.00, 2093.00
F5, A5, C5 = 698.46, 880.00, 523.25

VOICES: dict[str, list[dict]] = {
    # Two rising notes. The default voice: clearly an alert, not alarming.
    "chime": [
        note(C6, 0.00, 1.15, BELL, 4.2),
        note(G6, 0.16, 1.30, BELL, 3.8),
    ],
    # One struck bell with a long tail. The most "notification"-like of the set.
    "bell": [
        note(A5, 0.00, 1.60, BELL, 2.6),
        note(A6, 0.00, 1.20, BELL, 4.6),
    ],
    # Short wooden plucks. Dry and quiet — the one to pick for an open office.
    "marimba": [
        note(C5, 0.00, 0.42, WOOD, 11.0),
        note(F5, 0.11, 0.42, WOOD, 11.0),
        note(A5, 0.22, 0.60, WOOD, 9.0),
    ],
    # Three soft blips. Reads as a countdown ending rather than a bell.
    "pulse": [
        note(E6, 0.00, 0.20, SOFT, 16.0),
        note(E6, 0.16, 0.20, SOFT, 16.0),
        note(C7, 0.32, 0.46, SOFT, 10.0),
    ],
}


def render(voice: list[dict], rate: int, total_s: float | None = None, repeat_every_s: float | None = None):
    """
    One pass of the motif, or the motif repeated to fill `total_s`.

    Repeating with a gap rather than stretching one long tone is deliberate: a
    ten-second continuous chime is unpleasant and reads as a fault, while the
    same motif recurring reads as "still ringing" and stays recognisably the
    same voice as its short version.
    """
    motif_s = max(n["start"] + n["length"] for n in voice)
    span_s = total_s if total_s is not None else motif_s
    frames = int(span_s * rate)
    buffer = [0.0] * frames

    period_s = repeat_every_s if repeat_every_s is not None else span_s
    starts = [0.0]
    if total_s is not None:
        starts = []
        cursor = 0.0
        while cursor < total_s:
            starts.append(cursor)
            cursor += period_s

    for base in starts:
        for n in voice:
            offset = int((base + n["start"]) * rate)
            length = int(n["length"] * rate)
            weight = sum(amp for _, amp in n["partials"])

            for i in range(length):
                if offset + i >= frames:
                    break
                t = i / rate
                # Exponential decay, plus a raised-cosine attack so the onset
                # does not click, and a linear taper so the tail does not either.
                envelope = math.exp(-n["decay"] * t)
                if t < ATTACK_S:
                    envelope *= 0.5 - 0.5 * math.cos(math.pi * t / ATTACK_S)
                envelope *= min(1.0, (length - i) / (0.01 * rate))

                sample = sum(amp * math.sin(2 * math.pi * n["freq"] * mult * t) for mult, amp in n["partials"])
                buffer[offset + i] += envelope * sample / weight

    # A short fade at the very end, so a repeat cut off mid-decay does not click.
    fade = int(0.02 * rate)
    for i in range(min(fade, frames)):
        buffer[frames - 1 - i] *= i / fade

    peak = max(abs(s) for s in buffer) or 1.0
    return [s * PEAK / peak for s in buffer]


def write_wav(path: Path, samples: list[float], rate: int) -> None:
    with wave.open(str(path), "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(rate)
        out.writeframes(b"".join(struct.pack("<h", int(max(-1.0, min(1.0, s)) * 32767)) for s in samples))


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    total = 0
    for name, voice in VOICES.items():
        motif_s = max(n["start"] + n["length"] for n in voice)

        short = OUTPUT_DIR / f"{name}.wav"
        write_wav(short, render(voice, SAMPLE_RATE), SAMPLE_RATE)

        # A breath between repeats, never shorter than the motif itself.
        long = OUTPUT_DIR / f"{name}-10s.wav"
        write_wav(
            long,
            render(voice, LONG_SAMPLE_RATE, total_s=LONG_RING_S, repeat_every_s=max(motif_s, 0.6) + 0.35),
            LONG_SAMPLE_RATE,
        )

        for path in (short, long):
            size = path.stat().st_size
            total += size
            print(f"{path.relative_to(OUTPUT_DIR.parent.parent)}  {size / 1024:.0f} KB")
    print(f"total  {total / 1024 / 1024:.2f} MB")


if __name__ == "__main__":
    main()
