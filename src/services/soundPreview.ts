import { createAudioPlayer, type AudioPlayer } from 'expo-audio';

import { soundFileFor } from '@/core/alerts';

/**
 * Playing an alert voice from the app itself.
 *
 * Two callers, and they are not the same thing:
 *
 * - **Preview**, so a choice can be heard before it is made.
 * - **In-app alert mode**, where nothing is handed to iOS and so nothing plays a sound unless
 *   the app does.
 *
 * One module, one player, deliberately. A second file importing `expo-audio` would mean two
 * players competing for the audio session, and a preview overlapping a real alert.
 *
 * The only file in the app that imports `expo-audio`, and the only place audio
 * is played at all. Alerts themselves never come through here: a notification
 * carries its own sound and iOS plays it, which is the only thing that works
 * with the app closed. This exists purely so the picker is not a guess.
 *
 * Note the short file is always previewed, even when the setting is the ten
 * second ring. Ten seconds is the length of the *alert*, not of the sound worth
 * auditioning, and a picker you cannot step through quickly is worse than one
 * that under-sells the setting.
 *
 * `expo-audio`'s config plugin is deliberately not in app.config.ts: it writes
 * `NSMicrophoneUsageDescription` and `UIBackgroundModes`, and this app neither
 * records nor plays in the background. Simple playback needs no plugin.
 */

/**
 * Static requires, because Metro resolves assets at build time — a filename
 * computed at runtime cannot be bundled. The map is keyed by the same filenames
 * the notification requests, so the thing you hear is the thing you get.
 */
const CLIPS: Record<string, number> = {
  'chime.wav': require('../../assets/sounds/chime.wav'),
  'chime-10s.wav': require('../../assets/sounds/chime-10s.wav'),
  'bell.wav': require('../../assets/sounds/bell.wav'),
  'bell-10s.wav': require('../../assets/sounds/bell-10s.wav'),
  'marimba.wav': require('../../assets/sounds/marimba.wav'),
  'marimba-10s.wav': require('../../assets/sounds/marimba-10s.wav'),
  'pulse.wav': require('../../assets/sounds/pulse.wav'),
  'pulse-10s.wav': require('../../assets/sounds/pulse-10s.wav'),
};

let player: AudioPlayer | null = null;
let playing: string | null = null;

/**
 * Plays a voice, replacing whatever was playing.
 *
 * Silent and system entries play nothing: iOS's own notification sound is not
 * a file the app can reach, so previewing "Default" is not possible and a
 * wrong-but-plausible stand-in would be worse than silence.
 *
 * Failures are swallowed. Not hearing a preview is a disappointment; a crash
 * while choosing a sound is a bug.
 */
export function previewSound(soundId: string): void {
  play(soundFileFor(soundId));
}

/**
 * Plays the voice an alert would have used, at the length it would have rung for.
 *
 * Only for in-app mode. In the normal mode the sound rides on the notification and iOS plays
 * it — that path works with the app closed and this cannot, so calling both would simply
 * double up.
 */
export function playAlertSound(soundId: string, ringMs: number): void {
  play(soundFileFor(soundId, ringMs));
}

/** Stops whatever is playing, paired with `Vibration.cancel()` on a deliberate press. */
export function stopAlertSound(): void {
  try {
    player?.pause();
  } catch (error) {
    console.warn('Could not stop the alert sound', error);
  }
}

function play(file: string | null): void {
  if (file === null) return;

  const clip = CLIPS[file];
  if (clip === undefined) return;

  try {
    if (playing !== file) {
      player?.remove();
      player = createAudioPlayer(clip);
      playing = file;
    }
    player?.seekTo(0);
    player?.play();
  } catch (error) {
    console.warn('Could not preview alert sound', error);
  }
}

/** Stops a preview and releases the player. Called when an editor closes. */
export function stopPreview(): void {
  try {
    player?.remove();
  } catch (error) {
    console.warn('Could not release the preview player', error);
  }
  player = null;
  playing = null;
}
