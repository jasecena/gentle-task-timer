import { alertDurationMs, restFloorMs } from '../duration';
import {
  ALERT_SOUNDS,
  canStepRing,
  canStepSound,
  DEFAULT_SOUND_ID,
  formatRingLabel,
  formatSoundLabel,
  hasRingLength,
  isSilentSound,
  normalizeRingMs,
  normalizeSoundId,
  RING_LIMITS,
  ringDurationMs,
  SILENT_SOUND_ID,
  soundFileFor,
  stepRingMs,
  stepSoundId,
} from '../sound';

describe('the sound catalogue', () => {
  it('offers the system sound first, silence second, then the bundled voices', () => {
    expect(ALERT_SOUNDS[0]!.id).toBe(DEFAULT_SOUND_ID);
    expect(ALERT_SOUNDS[0]!.kind).toBe('system');
    expect(ALERT_SOUNDS[1]!.kind).toBe('silent');

    const bundled = ALERT_SOUNDS.filter((sound) => sound.kind === 'bundled');
    expect(bundled.length).toBeGreaterThan(0);
    // Every bundled voice has both lengths, or the ring setting would silently
    // do nothing for one of them.
    expect(bundled.every((sound) => sound.shortFile?.endsWith('.wav') && sound.longFile?.endsWith('.wav'))).toBe(true);
  });

  it('has unique ids and labels', () => {
    expect(new Set(ALERT_SOUNDS.map((sound) => sound.id)).size).toBe(ALERT_SOUNDS.length);
    expect(new Set(ALERT_SOUNDS.map((sound) => sound.label)).size).toBe(ALERT_SOUNDS.length);
  });
});

describe('normalizeSoundId', () => {
  /**
   * The case that matters. A notification carrying a filename iOS cannot
   * resolve is delivered *silently*, so an id from a future build — or from a
   * voice that was removed — has to degrade to the system sound rather than to
   * nothing at all.
   */
  it('falls back to the system sound for anything unrecognised', () => {
    expect(normalizeSoundId('gong')).toBe(DEFAULT_SOUND_ID);
    expect(normalizeSoundId(undefined)).toBe(DEFAULT_SOUND_ID);
    expect(normalizeSoundId(null)).toBe(DEFAULT_SOUND_ID);
    expect(normalizeSoundId(42)).toBe(DEFAULT_SOUND_ID);
    expect(normalizeSoundId({ id: 'chime' })).toBe(DEFAULT_SOUND_ID);
  });

  it('leaves a known id alone', () => {
    expect(normalizeSoundId('chime')).toBe('chime');
  });
});

describe('soundFileFor', () => {
  it('gives null for the system and silent entries, so the caller decides', () => {
    expect(soundFileFor(DEFAULT_SOUND_ID)).toBeNull();
    expect(soundFileFor(SILENT_SOUND_ID)).toBeNull();
    expect(soundFileFor('nonsense')).toBeNull();
  });

  it('gives the bundled filename for a custom voice, at the requested length', () => {
    expect(soundFileFor('chime', RING_LIMITS.SHORT_MS)).toBe('chime.wav');
    expect(soundFileFor('chime', RING_LIMITS.LONG_MS)).toBe('chime-10s.wav');
    // Short is the default, so an omitted length never surprises anyone with
    // ten seconds of noise.
    expect(soundFileFor('chime')).toBe('chime.wav');
  });
});

describe('the silent entry', () => {
  /**
   * Half of "vibrate but do not ring" is real and half is not, and the
   * distinction matters enough to pin down.
   */
  it('is a first-class choice, distinct from the system sound', () => {
    expect(isSilentSound(SILENT_SOUND_ID)).toBe(true);
    expect(isSilentSound(DEFAULT_SOUND_ID)).toBe(false);
    expect(isSilentSound('chime')).toBe(false);
    // Unknown falls back to the system sound, which makes a noise — never to
    // silence, because a silent alert is indistinguishable from a broken one.
    expect(isSilentSound('gone')).toBe(false);
  });

  it('rings for no time at all, and neither does the system sound', () => {
    expect(ringDurationMs(SILENT_SOUND_ID, RING_LIMITS.LONG_MS)).toBe(0);
    expect(ringDurationMs(DEFAULT_SOUND_ID, RING_LIMITS.LONG_MS)).toBe(0);
    expect(ringDurationMs('chime', RING_LIMITS.LONG_MS)).toBe(RING_LIMITS.LONG_MS);
    expect(ringDurationMs('chime', RING_LIMITS.SHORT_MS)).toBe(RING_LIMITS.SHORT_MS);
  });

  it('offers no ring length, because it has only one', () => {
    expect(hasRingLength(SILENT_SOUND_ID)).toBe(false);
    expect(hasRingLength(DEFAULT_SOUND_ID)).toBe(false);
    expect(hasRingLength('bell')).toBe(true);
  });
});

describe('ring length', () => {
  it('snaps anything to the nearest offered length', () => {
    expect(normalizeRingMs(RING_LIMITS.LONG_MS)).toBe(RING_LIMITS.LONG_MS);
    expect(normalizeRingMs(9_000)).toBe(RING_LIMITS.LONG_MS);
    expect(normalizeRingMs(2_000)).toBe(RING_LIMITS.SHORT_MS);
    expect(normalizeRingMs(Number.NaN)).toBe(RING_LIMITS.SHORT_MS);
    expect(normalizeRingMs('long')).toBe(RING_LIMITS.SHORT_MS);
  });

  it('steps between the two, stopping at both ends', () => {
    expect(stepRingMs(RING_LIMITS.SHORT_MS, 1)).toBe(RING_LIMITS.LONG_MS);
    expect(stepRingMs(RING_LIMITS.LONG_MS, 1)).toBe(RING_LIMITS.LONG_MS);
    expect(stepRingMs(RING_LIMITS.SHORT_MS, -1)).toBe(RING_LIMITS.SHORT_MS);

    expect(canStepRing(RING_LIMITS.SHORT_MS, -1)).toBe(false);
    expect(canStepRing(RING_LIMITS.SHORT_MS, 1)).toBe(true);
    expect(canStepRing(RING_LIMITS.LONG_MS, 1)).toBe(false);
  });

  it('labels both lengths', () => {
    expect(formatRingLabel(RING_LIMITS.SHORT_MS)).toBe('Short');
    expect(formatRingLabel(RING_LIMITS.LONG_MS)).toBe('10s');
  });
});

describe('alertDurationMs', () => {
  it('is the longer of the buzz and the ring, because they overlap', () => {
    expect(alertDurationMs({ vibrationMs: 3_000, soundId: 'chime', ringMs: RING_LIMITS.LONG_MS })).toBe(10_000);
    expect(alertDurationMs({ vibrationMs: 10_000, soundId: 'chime', ringMs: RING_LIMITS.SHORT_MS })).toBe(10_000);
    expect(alertDurationMs({ vibrationMs: 3_000, soundId: 'chime', ringMs: RING_LIMITS.SHORT_MS })).toBe(3_000);
  });

  it('is zero when nothing happens at all', () => {
    expect(alertDurationMs({ vibrationMs: 0, soundId: SILENT_SOUND_ID, ringMs: RING_LIMITS.LONG_MS })).toBe(0);
  });
});

describe('restFloorMs', () => {
  /**
   * The point of the whole thing: a ten-second ring across a five-second rest
   * means the alert announcing the rest is still going when the next work
   * phase starts, so there was never a rest.
   */
  it('lifts a rest shorter than the alert announcing it', () => {
    const longRing = { vibrationMs: 0, soundId: 'chime', ringMs: RING_LIMITS.LONG_MS };

    expect(restFloorMs(5_000, longRing)).toBe(10_000);
    expect(restFloorMs(30_000, longRing)).toBe(30_000);
  });

  /**
   * The correction v0.4.1 makes. "No rest" with a ten-second buzz is the worst
   * case of the problem rather than an exception to it — the alert lands
   * squarely inside the next work phase with nothing to absorb it.
   */
  it('lifts a rest of zero too, because zero is the shortest rest of all', () => {
    const longRing = { vibrationMs: 0, soundId: 'chime', ringMs: RING_LIMITS.LONG_MS };

    expect(restFloorMs(0, longRing)).toBe(10_000);
    expect(restFloorMs(-5, longRing)).toBe(10_000);
    expect(restFloorMs(Number.NaN, longRing)).toBe(10_000);
  });

  it('allows no rest only when there is no alert to absorb', () => {
    const nothing = { vibrationMs: 0, soundId: SILENT_SOUND_ID, ringMs: RING_LIMITS.LONG_MS };

    // Vibration off and the voice silent: nothing happens at a boundary, so
    // work-to-work with no gap is coherent.
    expect(restFloorMs(0, nothing)).toBe(0);
  });

  it('follows the vibration too, not just the ring', () => {
    expect(restFloorMs(2_000, { vibrationMs: 10_000, soundId: SILENT_SOUND_ID, ringMs: 0 })).toBe(10_000);
  });
});

describe('formatSoundLabel', () => {
  it('labels every voice, and unknown input as Default', () => {
    expect(formatSoundLabel('marimba')).toBe('Marimba');
    expect(formatSoundLabel('nonsense')).toBe('Default');
  });
});

describe('stepSoundId', () => {
  it('walks the catalogue and stops at both ends', () => {
    const last = ALERT_SOUNDS[ALERT_SOUNDS.length - 1]!.id;

    expect(stepSoundId(DEFAULT_SOUND_ID, -1)).toBe(DEFAULT_SOUND_ID);
    expect(stepSoundId(DEFAULT_SOUND_ID, 1)).toBe(ALERT_SOUNDS[1]!.id);
    expect(stepSoundId(last, 1)).toBe(last);
  });

  it('starts from the fallback when the current id is unknown', () => {
    expect(stepSoundId('gone', 1)).toBe(ALERT_SOUNDS[1]!.id);
  });

  it('reports when a step would do nothing, so the picker can grey the button', () => {
    expect(canStepSound(DEFAULT_SOUND_ID, -1)).toBe(false);
    expect(canStepSound(DEFAULT_SOUND_ID, 1)).toBe(true);
    expect(canStepSound(ALERT_SOUNDS[ALERT_SOUNDS.length - 1]!.id, 1)).toBe(false);
  });

  it('round-trips: stepping forward and back returns where it started', () => {
    for (const sound of ALERT_SOUNDS.slice(1)) {
      expect(stepSoundId(stepSoundId(sound.id, -1), 1)).toBe(sound.id);
    }
  });
});
