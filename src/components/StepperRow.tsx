import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '@/theme/tokens';

interface Props {
  label: string;
  /** Already formatted — the row renders text, it does not know what the value means. */
  value: string;
  disabled?: boolean;
  canDecrement?: boolean;
  canIncrement?: boolean;
  onDecrement: () => void;
  onIncrement: () => void;
}

/**
 * A labelled value with − and + either side.
 *
 * Steppers rather than free-text fields: on a phone they are faster, they
 * cannot produce a partially-typed invalid value, and they need no keyboard.
 * Shared by both editors so a setting looks and behaves the same wherever it
 * appears.
 */
export function StepperRow({
  label,
  value,
  disabled = false,
  canDecrement = true,
  canIncrement = true,
  onDecrement,
  onIncrement,
}: Props) {
  return (
    <View style={[styles.row, disabled && styles.rowDisabled]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.stepper}>
        <StepperButton
          symbol="−"
          accessibilityLabel={`Decrease ${label}`}
          disabled={disabled || !canDecrement}
          onPress={onDecrement}
        />
        <Text style={styles.rowValue} accessibilityLabel={`${label}: ${value}`}>
          {value}
        </Text>
        <StepperButton
          symbol="+"
          accessibilityLabel={`Increase ${label}`}
          disabled={disabled || !canIncrement}
          onPress={onIncrement}
        />
      </View>
    </View>
  );
}

function StepperButton({
  symbol,
  accessibilityLabel,
  disabled,
  onPress,
}: {
  symbol: string;
  accessibilityLabel: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      hitSlop={8}
      style={({ pressed }) => [
        styles.stepperButton,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text style={styles.stepperSymbol}>{symbol}</Text>
    </Pressable>
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
  },
  rowDisabled: { opacity: 0.45 },
  rowLabel: { ...typography.body, color: colors.textSecondary },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowValue: { ...typography.body, color: colors.textPrimary, minWidth: 72, textAlign: 'center' },
  stepperButton: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
  },
  stepperSymbol: { fontSize: 22, lineHeight: 26, color: colors.textPrimary },
  disabled: { opacity: 0.3 },
  pressed: { opacity: 0.6 },
});
