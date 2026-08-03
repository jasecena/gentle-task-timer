import { StyleSheet, Text, TextInput, View } from 'react-native';

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
import { clampMinute, formatClock, MINUTES_PER_DAY, type Weekday } from '@/core/clock';
import { normalizeOneOff, ONEOFF_LIMITS, type OneOff } from '@/core/oneoffs';
import { colors, radius, spacing, typography } from '@/theme/tokens';

interface Props {
  draft: OneOff;
  onChange: (draft: OneOff) => void;
}

/** Fifteen minutes: fine enough to say "quarter past", coarse enough to reach 9am in a few presses. */
const TIME_STEP_MINUTES = 15;

/**
 * Composing a note.
 *
 * The note itself is the only free-text field in the app. Everything else here
 * is a stepper over a bounded ladder, for the same reason as the other two
 * editors — on a phone they are faster, they cannot produce a half-typed
 * invalid value and they need no keyboard. The note has to be typed, because
 * the whole feature is "say something to yourself on Thursday".
 *
 * The day row is single-select: this fires once. Picking Thursday unpicks
 * whatever was chosen before, and the `radio` role is what tells a screen
 * reader that.
 */
export function OneOffComposer({ draft, onChange }: Props) {
  const update = (patch: Partial<OneOff>) => onChange(normalizeOneOff({ ...draft, ...patch }, draft.id));
  const remaining = ONEOFF_LIMITS.MAX_NOTE_LENGTH - draft.note.length;

  return (
    <View style={styles.container}>
      <View style={styles.noteField}>
        <TextInput
          value={draft.note}
          // Typing goes through the raw setter rather than the normaliser's
          // trim, or a trailing space would vanish mid-word as you type.
          onChangeText={(note: string) => onChange({ ...draft, note: note.slice(0, ONEOFF_LIMITS.MAX_NOTE_LENGTH) })}
          placeholder="What should it say?"
          placeholderTextColor={colors.textMuted}
          accessibilityLabel="Note"
          maxLength={ONEOFF_LIMITS.MAX_NOTE_LENGTH}
          multiline
          style={styles.noteInput}
        />
        <Text style={styles.counter}>{remaining} left</Text>
      </View>

      {/* A press replaces the day: a one-off happens once. */}
      <DayRow selected={[draft.weekday]} onPress={(day: Weekday) => update({ weekday: day })} role="radio" />

      <StepperRow
        label="At"
        value={formatClock(draft.minuteOfDay)}
        onDecrement={() => update({ minuteOfDay: clampMinute(draft.minuteOfDay - TIME_STEP_MINUTES) })}
        onIncrement={() => update({ minuteOfDay: clampMinute(draft.minuteOfDay + TIME_STEP_MINUTES) })}
        canDecrement={draft.minuteOfDay > 0}
        canIncrement={draft.minuteOfDay < MINUTES_PER_DAY - 1}
      />
      <StepperRow
        label="Vibration"
        value={formatVibrationLabel(draft.vibrationMs)}
        onDecrement={() => update({ vibrationMs: stepVibrationMs(draft.vibrationMs, -1) })}
        onIncrement={() => update({ vibrationMs: stepVibrationMs(draft.vibrationMs, 1) })}
        canDecrement={draft.vibrationMs > VIBRATION_LIMITS.OFF_MS}
        canIncrement={draft.vibrationMs < VIBRATION_LIMITS.MAX_MS}
      />
      <StepperRow
        label="Sound"
        value={formatSoundLabel(draft.soundId)}
        onDecrement={() => update({ soundId: stepSoundId(draft.soundId, -1) })}
        onIncrement={() => update({ soundId: stepSoundId(draft.soundId, 1) })}
        canDecrement={canStepSound(draft.soundId, -1)}
        canIncrement={canStepSound(draft.soundId, 1)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', gap: spacing.sm },
  noteField: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    gap: spacing.xs,
  },
  noteInput: { ...typography.body, color: colors.textPrimary, minHeight: 56, textAlignVertical: 'top' },
  counter: { ...typography.caption, color: colors.textMuted, textAlign: 'right' },
});
