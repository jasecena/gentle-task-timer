/**
 * Manual mock for expo-audio, picked up automatically for every test in the `app` project.
 *
 * The real module is native. Only in-app alert mode uses it — in the normal mode the sound
 * rides on the notification and iOS plays it — so the surface worth faking is small.
 *
 * It records which clip was created, so a test can assert "the 10s chime played", which is the
 * behaviour that matters and the one a call counter cannot answer.
 */

export interface MockPlayer {
  play: jest.Mock;
  pause: jest.Mock;
  seekTo: jest.Mock;
  remove: jest.Mock;
}

let created: { clip: unknown; player: MockPlayer }[] = [];

/**
 * Counted here rather than summed off the created players, and the difference matters.
 *
 * `soundPreview` keeps one module-level player and reuses it while the clip is unchanged —
 * module state that outlives an individual test. Deriving the count from `created` therefore
 * reported zero for every play on a player made before the last `__reset()`, which is most of
 * them. A test that resets mid-way to discard a preview would then see nothing at all.
 */
let plays = 0;

export const createAudioPlayer = jest.fn((clip: unknown) => {
  const player: MockPlayer = {
    play: jest.fn(() => {
      plays += 1;
    }),
    pause: jest.fn(),
    seekTo: jest.fn(),
    remove: jest.fn(),
  };
  created.push({ clip, player });
  return player;
});

/** Test helper: how many times anything was played since the last reset. */
export function __playCount(): number {
  return plays;
}

/** Test helper: every player created, oldest first. */
export function __players(): { clip: unknown; player: MockPlayer }[] {
  return [...created];
}

/** Test helper: clears the record. Call alongside `jest.clearAllMocks()`. */
export function __reset(): void {
  created = [];
  plays = 0;
}

export type AudioPlayer = MockPlayer;
