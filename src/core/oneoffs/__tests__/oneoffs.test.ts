import { MINUTES_PER_WEEK } from '../../clock';
import {
  DEFAULT_ONEOFF,
  isValidOneOff,
  nextOneOffId,
  normalizeOneOff,
  normalizeOneOffs,
  ONEOFF_LIMITS,
  validateOneOff,
} from '../config';
import { describeOneOff, minutesUntilOneOff, oneOffKey, planOneOff, planOneOffs, pruneFired } from '../plan';
import type { ClockNow } from '../plan';
import type { OneOff } from '../types';

const note = (overrides: Partial<OneOff> = {}): OneOff => ({
  ...DEFAULT_ONEOFF,
  note: 'Call the dentist',
  ...overrides,
});

/** Wednesday, 12:00. */
const NOW: ClockNow = { weekday: 3, minuteOfDay: 12 * 60 };

describe('validateOneOff', () => {
  it('accepts a note with text', () => {
    expect(isValidOneOff(note())).toBe(true);
  });

  /**
   * The one that matters. A notification with no text is a buzz you cannot
   * interpret, which is worse than no notification at all.
   */
  it('refuses an empty or whitespace-only note', () => {
    expect(validateOneOff(note({ note: '' })).map((issue) => issue.field)).toEqual(['note']);
    expect(validateOneOff(note({ note: '   ' })).map((issue) => issue.field)).toEqual(['note']);
  });

  it('refuses a note longer than a lock screen will show', () => {
    const issues = validateOneOff(note({ note: 'x'.repeat(ONEOFF_LIMITS.MAX_NOTE_LENGTH + 1) }));

    expect(issues.map((issue) => issue.field)).toEqual(['note']);
  });

  it('refuses to add one past the budget, naming the number', () => {
    const issues = validateOneOff(note(), ONEOFF_LIMITS.MAX_ONEOFFS);
    const count = issues.find((issue) => issue.field === 'count');

    expect(count?.message).toContain(String(ONEOFF_LIMITS.MAX_ONEOFFS));
  });

  it('refuses a buzz the phone cannot produce, or a voice that does not exist', () => {
    expect(validateOneOff(note({ vibrationMs: 200 })).map((i) => i.field)).toEqual(['vibrationMs']);
    expect(validateOneOff(note({ soundId: 'gong' })).map((i) => i.field)).toEqual(['soundId']);
  });
});

describe('normalizeOneOff', () => {
  it('repairs anything into a structurally sound note', () => {
    const repaired = normalizeOneOff(
      {
        weekday: 99 as OneOff['weekday'],
        minuteOfDay: -400,
        soundId: 'gone',
        vibrationMs: Number.NaN,
        note: '  spaced  ',
      },
      'o7',
    );

    expect(repaired).toEqual({
      id: 'o7',
      note: 'spaced',
      weekday: DEFAULT_ONEOFF.weekday,
      minuteOfDay: 0,
      soundId: 'default',
      ringMs: 1_500,
      vibrationMs: 0,
    });
  });

  it('always produces something that passes validation, given text', () => {
    for (const input of [{}, null, undefined, { note: 'x'.repeat(500) }, { minuteOfDay: 99_999 }]) {
      const repaired = normalizeOneOff({ ...input, note: 'a note' }, 'o1');
      expect(validateOneOff(repaired)).toEqual([]);
    }
  });

  it('leaves an empty note empty rather than inventing text for it', () => {
    // Shape is repaired here; policy is reported to the user, not guessed at.
    expect(normalizeOneOff({}, 'o1').note).toBe('');
  });
});

describe('normalizeOneOffs', () => {
  it('treats an unreadable store as no notes at all', () => {
    expect(normalizeOneOffs(null)).toEqual([]);
    expect(normalizeOneOffs('nonsense' as unknown as [])).toEqual([]);
    expect(normalizeOneOffs([null, 7] as unknown as OneOff[])).toEqual([]);
  });

  it('drops notes with no text', () => {
    expect(
      normalizeOneOffs([
        { id: 'o1', note: '' },
        { id: 'o2', note: 'keep' },
      ]),
    ).toHaveLength(1);
  });

  it('reassigns a duplicate id, so one note cannot cancel another', () => {
    const notes = normalizeOneOffs([
      { id: 'o1', note: 'a' },
      { id: 'o1', note: 'b' },
    ]);

    expect(notes).toHaveLength(2);
    expect(new Set(notes.map((n) => n.id)).size).toBe(2);
  });

  it('caps an over-long stored list at the budget', () => {
    const stored = Array.from({ length: ONEOFF_LIMITS.MAX_ONEOFFS + 5 }, (_, i) => ({ id: `o${i + 1}`, note: 'x' }));

    expect(normalizeOneOffs(stored)).toHaveLength(ONEOFF_LIMITS.MAX_ONEOFFS);
  });
});

describe('nextOneOffId', () => {
  it('never reuses an id, even after the highest is deleted', () => {
    const notes = [note({ id: 'o1' }), note({ id: 'o2' })];

    expect(nextOneOffId(notes)).toBe('o3');
    expect(nextOneOffId([])).toBe('o1');
    expect(nextOneOffId([note({ id: 'weird' })])).toBe('o1');
  });
});

describe('minutesUntilOneOff', () => {
  it('finds the next occurrence later this week', () => {
    // Wednesday noon → Thursday 15:00 is 27 hours away.
    expect(minutesUntilOneOff(note({ weekday: 4, minuteOfDay: 15 * 60 }), NOW)).toBe(27 * 60);
  });

  it('wraps to next week when the day has already gone by', () => {
    // Wednesday noon → Monday 09:00 is next Monday.
    expect(minutesUntilOneOff(note({ weekday: 1, minuteOfDay: 9 * 60 }), NOW)).toBe(4 * 24 * 60 + 21 * 60);
  });

  it('treats later today as today', () => {
    expect(minutesUntilOneOff(note({ weekday: 3, minuteOfDay: 18 * 60 }), NOW)).toBe(6 * 60);
  });

  it('pushes a note set for the current minute to next week', () => {
    expect(minutesUntilOneOff(note({ weekday: 3, minuteOfDay: 12 * 60 }), NOW)).toBe(MINUTES_PER_WEEK);
  });
});

describe('describeOneOff', () => {
  it('reads as a day, a time and how far off it is', () => {
    expect(describeOneOff(note({ weekday: 4, minuteOfDay: 15 * 60 }), NOW)).toBe('Thursday 15:00 · in 1 day');
    expect(describeOneOff(note({ weekday: 3, minuteOfDay: 13 * 60 + 30 }), NOW)).toBe('Wednesday 13:30 · in 1h 30m');
  });
});

describe('planOneOff', () => {
  /**
   * The note is the title, not the body. A banner shows the title first and in
   * bold, and the whole reason someone wrote "call the dentist" is to read it
   * without unlocking anything.
   */
  it('puts the note in the title and the appointment in the body', () => {
    const slot = planOneOff(note({ id: 'o3', weekday: 4, minuteOfDay: 15 * 60, soundId: 'bell' }));

    expect(slot).toEqual({
      key: 'oneoff-o3',
      oneOffId: 'o3',
      weekday: 4,
      minuteOfDay: 15 * 60,
      hour: 15,
      minute: 0,
      title: 'Call the dentist',
      body: 'Thursday 15:00',
      soundId: 'bell',
      ringMs: 1_500,
      vibrationMs: 3_000,
    });
  });

  it('keys each note by id, so cancelling one leaves the rest pending', () => {
    const keys = planOneOffs([note({ id: 'o1' }), note({ id: 'o2' })]).map((slot) => slot.key);

    expect(keys).toEqual(['oneoff-o1', 'oneoff-o2']);
    expect(oneOffKey('o9')).toBe('oneoff-o9');
  });

  it('plans nothing for a note with no text', () => {
    expect(planOneOffs([note({ note: '   ' })])).toEqual([]);
  });
});

describe('pruneFired', () => {
  /**
   * Worked out by asking iOS what it is still holding rather than by comparing
   * clocks — the only method that cannot be wrong about daylight saving, a
   * changed device clock, or a note that fired while the app was closed.
   */
  it('keeps only the notes iOS is still holding', () => {
    const notes = [note({ id: 'o1' }), note({ id: 'o2' }), note({ id: 'o3' })];

    expect(pruneFired(notes, ['oneoff-o1', 'oneoff-o3']).map((n) => n.id)).toEqual(['o1', 'o3']);
  });

  it('forgets everything when the OS is holding nothing', () => {
    // Permission revoked, or the app reinstalled. The notes were never going to
    // arrive, and showing them would promise something iOS will not do.
    expect(pruneFired([note({ id: 'o1' })], [])).toEqual([]);
  });
});
