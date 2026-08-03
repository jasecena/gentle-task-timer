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


def render(voice: list[dict]) -> list[float]:
    total_s = max(n["start"] + n["length"] for n in voice)
    frames = int(total_s * SAMPLE_RATE)
    buffer = [0.0] * frames

    for n in voice:
        offset = int(n["start"] * SAMPLE_RATE)
        length = int(n["length"] * SAMPLE_RATE)
        weight = sum(amp for _, amp in n["partials"])

        for i in range(length):
            if offset + i >= frames:
                break
            t = i / SAMPLE_RATE
            # Exponential decay, plus a raised-cosine attack so the onset does
            # not click, and a linear taper so the tail does not either.
            envelope = math.exp(-n["decay"] * t)
            if t < ATTACK_S:
                envelope *= 0.5 - 0.5 * math.cos(math.pi * t / ATTACK_S)
            envelope *= min(1.0, (length - i) / (0.01 * SAMPLE_RATE))

            sample = sum(amp * math.sin(2 * math.pi * n["freq"] * mult * t) for mult, amp in n["partials"])
            buffer[offset + i] += envelope * sample / weight

    peak = max(abs(s) for s in buffer) or 1.0
    return [s * PEAK / peak for s in buffer]


def write_wav(path: Path, samples: list[float]) -> None:
    with wave.open(str(path), "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(SAMPLE_RATE)
        out.writeframes(b"".join(struct.pack("<h", int(max(-1.0, min(1.0, s)) * 32767)) for s in samples))


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for name, voice in VOICES.items():
        path = OUTPUT_DIR / f"{name}.wav"
        write_wav(path, render(voice))
        print(f"{path.relative_to(OUTPUT_DIR.parent.parent)}  {path.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
