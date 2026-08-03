import { Pressable, StyleSheet, Text, View } from 'react-native';

import { LIMITS, formatDurationLabel, normalizeConfig, type TimerConfig } from '@/core/timer';
import { colors, radius, spacing, typography } from '@/theme/tokens';

interface Props {
  config: TimerConfig;
  onChange: (config: TimerConfig) => void;
  /** Editing mid-run would invalidate the schedule the run is following, so the controls lock while running. */
  disabled: boolean;
}

const WORK_STEP_MS = 30_000;
const REST_STEP_MS = 15_000;

/**
 * Steppers rather than free-text fields. On a phone they are faster, they
 * cannot produce a partially-typed invalid value, and every result is passed
 * through `normalizeConfig` regardless — so the config handed to the engine is
 * always in range.
 */
export function ConfigEditor({ config, onChange, disabled }: Props) {
  const update = (patch: Partial<TimerConfig>) => onChange(normalizeConfig({ ...config, ...patch }));

  return (
    <View style={styles.container}>
      <StepperRow
        label="Work"
        value={formatDurationLabel(config.workDurationMs)}
        disabled={disabled}
        onDecrement={() => update({ workDurationMs: config.workDurationMs - WORK_STEP_MS })}
        onIncrement={() => update({ workDurationMs: config.workDurationMs + WORK_STEP_MS })}
        canDecrement={config.workDurationMs > LIMITS.MIN_WORK_MS}
        canIncrement={config.workDurationMs < LIMITS.MAX_WORK_MS}
      />
      <StepperRow
        label="Rest"
        value={config.restDurationMs === 0 ? 'None' : formatDurationLabel(config.restDurationMs)}
        disabled={disabled}
        onDecrement={() => update({ restDurationMs: config.restDurationMs - REST_STEP_MS })}
        onIncrement={() => update({ restDurationMs: config.restDurationMs + REST_STEP_MS })}
        canDecrement={config.restDurationMs > LIMITS.MIN_REST_MS}
        canIncrement={config.restDurationMs < LIMITS.MAX_REST_MS}
      />
      <StepperRow
        label="Repeats"
        value={`${config.repeats}`}
        disabled={disabled}
        onDecrement={() => update({ repeats: config.repeats - 1 })}
        onIncrement={() => update({ repeats: config.repeats + 1 })}
        canDecrement={config.repeats > LIMITS.MIN_REPEATS}
        canIncrement={config.repeats < LIMITS.MAX_REPEATS}
      />
    </View>
  );
}

interface StepperRowProps {
  label: string;
  value: string;
  disabled: boolean;
  canDecrement: boolean;
  canIncrement: boolean;
  onDecrement: () => void;
  onIncrement: () => void;
}

function StepperRow({ label, value, disabled, canDecrement, canIncrement, onDecrement, onIncrement }: StepperRowProps) {
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
  container: { width: '100%', gap: spacing.sm },
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
