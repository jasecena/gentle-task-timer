/**
 * Manual mock for expo-audio, picked up automatically for every test in the
 * `app` project.
 *
 * The real module is native and has nothing to bind to off-device. Only the
 * sound *preview* uses it — alerts carry their sound on the notification and
 * are played by iOS — so the surface worth faking is small: create a player,
 * seek, play, release.
 *
 * It records which clip was created so a test can assert "stepping to Bell
 * previewed Bell", which is the behaviour that matters and the one a call
 * counter alone cannot answer.
 */

export interface MockPlayer {
  play: jest.Mock;
  pause: jest.Mock;
  seekTo: jest.Mock;
  remove: jest.Mock;
  loop: boolean;
}

let created: { clip: unknown; player: MockPlayer }[] = [];

export const createAudioPlayer = jest.fn((clip: unknown) => {
  const player: MockPlayer = {
    play: jest.fn(),
    pause: jest.fn(),
    seekTo: jest.fn(),
    remove: jest.fn(),
    loop: false,
  };
  created.push({ clip, player });
  return player;
});

export const useAudioPlayer = jest.fn(() => created[created.length - 1]?.player);

/** Test helper: every player created, oldest first. */
export function __players(): { clip: unknown; player: MockPlayer }[] {
  return [...created];
}

/** Test helper: how many times anything was actually played. */
export function __playCount(): number {
  return created.reduce((total, entry) => total + entry.player.play.mock.calls.length, 0);
}

/** Test helper: clears the record. Call alongside `jest.clearAllMocks()`. */
export function __reset(): void {
  created = [];
}

export type AudioPlayer = MockPlayer;
