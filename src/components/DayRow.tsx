import { Pressable, StyleSheet, Text, View } from 'react-native';

import { dayInitial, dayName, WEEKDAYS, type Weekday } from '@/core/clock';
import { colors, radius, spacing, typography } from '@/theme/tokens';

interface Props {
  /** The days currently on. A single-select caller passes an array of one. */
  selected: readonly Weekday[];
  onPress: (day: Weekday) => void;
  disabled?: boolean;
  /**
   * `checkbox` for a set of days, `radio` for exactly one.
   *
   * The visual is identical either way; what changes is what a screen reader
   * announces, and therefore whether someone who cannot see the row knows that
   * picking Thursday just unpicked Monday.
   */
  role?: 'checkbox' | 'radio';
}

/**
 * The seven-day toggle row, shared by the schedule and by one-off notes.
 *
 * The row decides nothing about selection — it reports a press and renders what
 * it is given. That is what lets the schedule treat a press as "toggle this day
 * in the set" and a one-off treat it as "this is now the day", from one
 * component.
 *
 * The initials are ambiguous — two Ts, two Ss — which is why the row always
 * starts at Sunday and every button carries the full day name as its
 * accessibility label. A screen reader user hears "Tuesday, selected", not "T".
 */
export function DayRow({ selected, onPress, disabled = false, role = 'checkbox' }: Props) {
  const on = new Set(selected);

  return (
    <View style={styles.row}>
      {WEEKDAYS.map((day) => {
        const isOn = on.has(day);
        return (
          <Pressable
            key={day}
            onPress={() => onPress(day)}
            disabled={disabled}
            accessibilityRole={role}
            accessibilityLabel={dayName(day)}
            accessibilityState={role === 'radio' ? { selected: isOn, disabled } : { checked: isOn, disabled }}
            style={({ pressed }) => [
              styles.day,
              isOn && styles.dayOn,
              disabled && styles.disabled,
              pressed && !disabled && styles.pressed,
            ]}
          >
            <Text style={[styles.dayText, isOn && styles.dayTextOn]}>{dayInitial(day)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.xs },
  day: {
    flex: 1,
    aspectRatio: 1,
    maxHeight: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dayOn: { backgroundColor: colors.work, borderColor: colors.work },
  dayText: { ...typography.label, color: colors.textSecondary },
  dayTextOn: { color: colors.onAccent },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.6 },
});
