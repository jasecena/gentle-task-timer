import {
  ALERT_SOUNDS,
  canStepSound,
  DEFAULT_SOUND_ID,
  formatSoundLabel,
  normalizeSoundId,
  soundFileFor,
  stepSoundId,
} from '../sound';

describe('the sound catalogue', () => {
  it('offers the system sound first, and every other voice has a bundled file', () => {
    expect(ALERT_SOUNDS[0]!.id).toBe(DEFAULT_SOUND_ID);
    expect(ALERT_SOUNDS[0]!.file).toBeNull();
    expect(ALERT_SOUNDS.slice(1).every((sound) => sound.file?.endsWith('.wav'))).toBe(true);
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
  it('gives null for the system sound, so the caller lets iOS choose', () => {
    expect(soundFileFor(DEFAULT_SOUND_ID)).toBeNull();
    expect(soundFileFor('nonsense')).toBeNull();
  });

  it('gives the bundled filename for a custom voice', () => {
    expect(soundFileFor('chime')).toBe('chime.wav');
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
