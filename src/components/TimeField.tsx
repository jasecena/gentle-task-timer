import DateTimePicker from '@react-native-community/datetimepicker';
import { StyleSheet, Text, View } from 'react-native';

import { clampMinute, MINUTES_PER_DAY, type MinuteOfDay } from '@/core/clock';
import { colors, radius, spacing, typography } from '@/theme/tokens';

interface Props {
  label: string;
  minuteOfDay: MinuteOfDay;
  onChange: (minuteOfDay: MinuteOfDay) => void;
  disabled?: boolean;
}

/**
 * A wall-clock time, picked with the iOS wheel.
 *
 * This replaced a ±15-minute stepper, which was defensible when the only times
 * anyone set were "9am" and "5pm" but became tedious the moment a one-off note
 * wanted 07:40. The native picker is faster, needs no keyboard, and cannot
 * produce an invalid value.
 *
 * `compact` rather than `spinner`: it renders as a tappable field that opens
 * the wheel, so a screen full of time rows stays a screen rather than a stack
 * of wheels. iOS falls back to the spinner on anything before iOS 14.
 *
 * The domain still speaks in minutes of the day, not dates. A `MinuteOfDay` is
 * a wall-clock time with no timezone and no date attached; the `Date` here
 * exists only because that is what the picker's API takes, and it is built and
 * read back on the same local day so nothing about it can drift.
 */
export function TimeField({ label, minuteOfDay, onChange, disabled = false }: Props) {
  const safe = clampMinute(minuteOfDay);

  const value = new Date();
  value.setHours(Math.floor(safe / 60), safe % 60, 0, 0);

  return (
    <View style={[styles.row, disabled && styles.disabled]}>
      <Text style={styles.label}>{label}</Text>
      <DateTimePicker
        value={value}
        mode="time"
        display="compact"
        disabled={disabled}
        accessibilityLabel={label}
        onChange={(_event: unknown, next?: Date) => {
          if (!next) return;
          const minutes = next.getHours() * 60 + next.getMinutes();
          // Guard rather than trust: a picker that somehow yields a rolled-over
          // date must not become minute 1440.
          onChange(Math.min(MINUTES_PER_DAY - 1, Math.max(0, minutes)));
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    minHeight: 56,
  },
  label: { ...typography.body, color: colors.textSecondary },
  disabled: { opacity: 0.45 },
});
