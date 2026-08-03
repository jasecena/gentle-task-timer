import { StyleSheet, Text, TextInput, View } from 'react-native';

import { AlertRows, type AlertSettings } from '@/components/AlertRows';
import { DayRow } from '@/components/DayRow';
import { TimeField } from '@/components/TimeField';
import type { MinuteOfDay, Weekday } from '@/core/clock';
import { normalizeOneOff, ONEOFF_LIMITS, type OneOff } from '@/core/oneoffs';
import { colors, radius, spacing, typography } from '@/theme/tokens';

interface Props {
  draft: OneOff;
  onChange: (draft: OneOff) => void;
}

/**
 * Composing a note.
 *
 * The note itself is the only free-text field in the app. Everything else is a
 * picker or a stepper, for the same reason as the other two editors — on a
 * phone they are faster, they cannot produce a half-typed invalid value and
 * they need no keyboard. The note has to be typed, because the whole feature is
 * "say something to yourself on Thursday".
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

      <TimeField
        label="At"
        minuteOfDay={draft.minuteOfDay}
        onChange={(minuteOfDay: MinuteOfDay) => update({ minuteOfDay })}
      />

      <AlertRows settings={draft} onChange={(patch: Partial<AlertSettings>) => update(patch)} />
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
