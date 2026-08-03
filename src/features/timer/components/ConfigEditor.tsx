import { StyleSheet, View } from 'react-native';

import { StepperRow } from '@/components/StepperRow';
import { formatVibrationLabel, stepVibrationMs, VIBRATION_LIMITS } from '@/core/alerts';
import { LIMITS, formatDurationLabel, normalizeConfig, type TimerConfig } from '@/core/timer';
import { spacing } from '@/theme/tokens';

interface Props {
  config: TimerConfig;
  onChange: (config: TimerConfig) => void;
  /** Editing mid-run would invalidate the schedule the run is following, so the controls lock while running. */
  disabled: boolean;
}

const WORK_STEP_MS = 30_000;
const REST_STEP_MS = 15_000;

/**
 * Every value here goes through `normalizeConfig` on the way out, so the config
 * handed to the engine is always in range whatever the buttons do.
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
      {/*
        Editable mid-run, unlike the durations: changing how long the phone
        buzzes cannot invalidate a schedule the run is already following.
      */}
      <StepperRow
        label="Vibration"
        value={formatVibrationLabel(config.vibrationMs)}
        onDecrement={() => update({ vibrationMs: stepVibrationMs(config.vibrationMs, -1) })}
        onIncrement={() => update({ vibrationMs: stepVibrationMs(config.vibrationMs, 1) })}
        canDecrement={config.vibrationMs > VIBRATION_LIMITS.OFF_MS}
        canIncrement={config.vibrationMs < VIBRATION_LIMITS.MAX_MS}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', gap: spacing.sm },
});
