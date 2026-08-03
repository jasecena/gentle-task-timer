import { StyleSheet, View } from 'react-native';

import { DayRow } from '@/components/DayRow';
import { StepperRow } from '@/components/StepperRow';
import {
  canStepSound,
  formatSoundLabel,
  formatVibrationLabel,
  stepSoundId,
  stepVibrationMs,
  VIBRATION_LIMITS,
} from '@/core/alerts';
import {
  clampMinute,
  formatClock,
  MINUTES_PER_DAY,
  normalizeReminderConfig,
  REMINDER_LIMITS,
  type ReminderConfig,
  type Weekday,
} from '@/core/reminders';
import { formatDurationLabel } from '@/core/timer';
import { sortDays } from '@/core/clock';
import { spacing } from '@/theme/tokens';

interface Props {
  config: ReminderConfig;
  onChange: (config: ReminderConfig) => void;
  disabled?: boolean;
}

/** Fifteen minutes: fine enough to say "quarter past", coarse enough to reach 9am in a few presses. */
const TIME_STEP_MINUTES = 15;

/**
 * The intervals offered, in minutes.
 *
 * A stepper over a fixed ladder rather than free arithmetic: the useful
 * intervals are not evenly spaced (nobody wants 47 minutes), and a ladder makes
 * the jump from hourly to two-hourly one press instead of four.
 */
const INTERVAL_MINUTES = [1, 2, 5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240, 360, 480, 720];

function stepInterval(currentMs: number, direction: 1 | -1): number {
  const currentMinutes = Math.round(currentMs / 60_000);
  const index = INTERVAL_MINUTES.reduce(
    (best, minutes, candidate) =>
      Math.abs(minutes - currentMinutes) < Math.abs(INTERVAL_MINUTES[best]! - currentMinutes) ? candidate : best,
    0,
  );
  const next = Math.min(INTERVAL_MINUTES.length - 1, Math.max(0, index + direction));
  return INTERVAL_MINUTES[next]! * 60_000;
}

function toggleDay(days: readonly Weekday[], day: Weekday): Weekday[] {
  const next = new Set(days);
  if (next.has(day)) {
    next.delete(day);
  } else {
    next.add(day);
  }
  return sortDays([...next]);
}

export function ScheduleEditor({ config, onChange, disabled = false }: Props) {
  const update = (patch: Partial<ReminderConfig>) => onChange(normalizeReminderConfig({ ...config, ...patch }));

  return (
    <View style={styles.container}>
      <StepperRow
        label="Every"
        value={formatDurationLabel(config.intervalMs)}
        disabled={disabled}
        onDecrement={() => update({ intervalMs: stepInterval(config.intervalMs, -1) })}
        onIncrement={() => update({ intervalMs: stepInterval(config.intervalMs, 1) })}
        canDecrement={config.intervalMs > REMINDER_LIMITS.MIN_INTERVAL_MS}
        canIncrement={config.intervalMs < REMINDER_LIMITS.MAX_INTERVAL_MS}
      />
      <StepperRow
        label="From"
        value={formatClock(config.startMinute)}
        disabled={disabled}
        onDecrement={() => update({ startMinute: clampMinute(config.startMinute - TIME_STEP_MINUTES) })}
        onIncrement={() => update({ startMinute: clampMinute(config.startMinute + TIME_STEP_MINUTES) })}
        canDecrement={config.startMinute > 0}
        canIncrement={config.startMinute < MINUTES_PER_DAY - 1}
      />
      <StepperRow
        label="Until"
        value={formatClock(config.endMinute)}
        disabled={disabled}
        onDecrement={() => update({ endMinute: clampMinute(config.endMinute - TIME_STEP_MINUTES) })}
        onIncrement={() => update({ endMinute: clampMinute(config.endMinute + TIME_STEP_MINUTES) })}
        // The window cannot close before it opens; normalizeReminderConfig would
        // pin it back anyway, and a dead button says so before the press.
        canDecrement={config.endMinute > config.startMinute}
        canIncrement={config.endMinute < MINUTES_PER_DAY - 1}
      />
      <StepperRow
        label="Vibration"
        value={formatVibrationLabel(config.vibrationMs)}
        disabled={disabled}
        onDecrement={() => update({ vibrationMs: stepVibrationMs(config.vibrationMs, -1) })}
        onIncrement={() => update({ vibrationMs: stepVibrationMs(config.vibrationMs, 1) })}
        canDecrement={config.vibrationMs > VIBRATION_LIMITS.OFF_MS}
        canIncrement={config.vibrationMs < VIBRATION_LIMITS.MAX_MS}
      />
      <StepperRow
        label="Sound"
        value={formatSoundLabel(config.soundId)}
        disabled={disabled}
        onDecrement={() => update({ soundId: stepSoundId(config.soundId, -1) })}
        onIncrement={() => update({ soundId: stepSoundId(config.soundId, 1) })}
        canDecrement={canStepSound(config.soundId, -1)}
        canIncrement={canStepSound(config.soundId, 1)}
      />

      {/* A press toggles the day in the set — a schedule runs on any number of days. */}
      <DayRow
        selected={config.days}
        onPress={(day: Weekday) => update({ days: toggleDay(config.days, day) })}
        disabled={disabled}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', gap: spacing.sm },
});
