/** Duration formatting and parsing. Pure string/number work — no locale or platform dependencies. */

const MS_PER_SECOND = 1_000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;

function pad(value: number): string {
  return value.toString().padStart(2, '0');
}

/**
 * Formats a duration for the countdown display: `mm:ss`, widening to `h:mm:ss`
 * only when there is an hour to show.
 *
 * Rounds *up* to the next whole second, which is what makes a countdown read
 * correctly: a timer with 4.2s left should show "00:05" ticking to "00:04",
 * and should display "00:01" for the whole of the final second rather than
 * sitting on "00:00" while a second of real time drains away.
 */
export function formatDuration(ms: number): string {
  const safe = Number.isFinite(ms) ? Math.max(0, ms) : 0;
  const totalSeconds = Math.ceil(safe / MS_PER_SECOND);

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

/** Formats a duration as a short human label, e.g. "2m 30s", "45s", "1h 5m". */
export function formatDurationLabel(ms: number): string {
  const safe = Number.isFinite(ms) ? Math.max(0, ms) : 0;
  const totalSeconds = Math.round(safe / MS_PER_SECOND);
  if (totalSeconds === 0) return '0s';

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0) parts.push(`${seconds}s`);
  return parts.join(' ');
}

/** Splits a duration into whole hours, minutes and seconds for picker inputs. */
export function toParts(ms: number): { hours: number; minutes: number; seconds: number } {
  const safe = Number.isFinite(ms) ? Math.max(0, ms) : 0;
  return {
    hours: Math.floor(safe / MS_PER_HOUR),
    minutes: Math.floor((safe % MS_PER_HOUR) / MS_PER_MINUTE),
    seconds: Math.floor((safe % MS_PER_MINUTE) / MS_PER_SECOND),
  };
}

/** Recombines picker parts into milliseconds. Non-finite parts count as zero. */
export function fromParts(parts: { hours?: number; minutes?: number; seconds?: number }): number {
  const safe = (value: number | undefined): number =>
    Number.isFinite(value) ? Math.max(0, Math.floor(value as number)) : 0;
  return safe(parts.hours) * MS_PER_HOUR + safe(parts.minutes) * MS_PER_MINUTE + safe(parts.seconds) * MS_PER_SECOND;
}

export const DURATION_UNITS = { MS_PER_SECOND, MS_PER_MINUTE, MS_PER_HOUR } as const;
