import { StyleSheet, Switch, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '@/theme/tokens';

interface Props {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  /** One line under the label, for a setting whose name does not explain itself. */
  hint?: string;
}

/**
 * A labelled on/off switch.
 *
 * Sits beside {@link StepperRow} and matches it deliberately: same surface, same radius, same
 * padding, so a settings list reads as one thing rather than as two component libraries. The
 * control differs because the value does — a boolean stepped with − and + would be a puzzle.
 *
 * `Switch` carries its own `switch` accessibility role and announces its state, so there is no
 * `accessibilityLabel` here beyond the visible text; adding one would make VoiceOver read the
 * label twice.
 */
export function ToggleRow({ label, value, onChange, disabled = false, hint }: Props) {
  return (
    <View style={[styles.row, disabled && styles.disabled]}>
      <View style={styles.text}>
        <Text style={styles.label}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        accessibilityLabel={label}
        trackColor={{ false: colors.surfaceRaised, true: colors.work }}
        thumbColor={colors.textPrimary}
        ios_backgroundColor={colors.surfaceRaised}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    minHeight: 56,
  },
  text: { flex: 1, gap: 2 },
  label: { ...typography.body, color: colors.textSecondary },
  hint: { ...typography.caption, color: colors.textMuted },
  disabled: { opacity: 0.45 },
});
