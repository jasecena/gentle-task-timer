import { Pressable, StyleSheet, Text, View } from 'react-native';

import { dayInitial, dayName, sortDays, WEEKDAYS, type Weekday } from '@/core/reminders';
import { colors, radius, spacing, typography } from '@/theme/tokens';

interface Props {
  days: readonly Weekday[];
  onChange: (days: Weekday[]) => void;
  disabled?: boolean;
}

/**
 * The seven-day toggle row.
 *
 * The initials are ambiguous — two Ts, two Ss — which is why the row always
 * starts at Sunday and every button carries the full day name as its
 * accessibility label. A screen reader user hears "Tuesday, selected", not "T".
 */
export function DayPicker({ days, onChange, disabled = false }: Props) {
  const selected = new Set(days);

  const toggle = (day: Weekday) => {
    const next = new Set(selected);
    if (next.has(day)) {
      next.delete(day);
    } else {
      next.add(day);
    }
    onChange(sortDays([...next]));
  };

  return (
    <View style={styles.row}>
      {WEEKDAYS.map((day) => {
        const isOn = selected.has(day);
        return (
          <Pressable
            key={day}
            onPress={() => toggle(day)}
            disabled={disabled}
            accessibilityRole="checkbox"
            accessibilityLabel={dayName(day)}
            accessibilityState={{ checked: isOn, disabled }}
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
