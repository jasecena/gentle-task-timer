import { StyleSheet, Text, View } from 'react-native';

import { AlertRows, type AlertSettings } from '@/components/AlertRows';
import { StepperRow } from '@/components/StepperRow';
import { ToggleRow } from '@/components/ToggleRow';
import { alertDurationMs, restFloorMs } from '@/core/alerts';
import { LIMITS, formatDurationLabel, normalizeConfig, type TimerConfig } from '@/core/timer';
import { colors, spacing, typography } from '@/theme/tokens';

interface Props {
  config: TimerConfig;
  onChange: (config: TimerConfig) => void;
  /** Editing mid-run would invalidate the schedule the run is following, so the durations lock while running. */
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

  // The floor `normalizeConfig` applies, surfaced so a rest that refuses to go
  // lower explains itself rather than looking broken.
  const alertMs = alertDurationMs(config);
  const restPinned = alertMs > 0 && config.restDurationMs <= restFloorMs(0, config);

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
        canDecrement={config.restDurationMs > Math.max(LIMITS.MIN_REST_MS, alertMs)}
        canIncrement={config.restDurationMs < LIMITS.MAX_REST_MS}
      />
      {restPinned ? (
        <Text style={styles.note}>
          Rest is held at {formatDurationLabel(alertMs)} to match the alert — otherwise the noise would still be going
          when the next work phase starts. Turn vibration off and set the sound to Silent for no rest at all.
        </Text>
      ) : null}
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
        Editable mid-run, unlike the durations: changing how the alert sounds
        cannot invalidate a timeline the run is already following. Changing a
        duration can, which is why those lock.
      */}
      <AlertRows settings={config} onChange={(patch: Partial<AlertSettings>) => update(patch)} />

      {/*
        Only offered when there are rests to end. With rest set to None the setting has
        nothing to govern, and a control that visibly does nothing is worse than one that
        is not there.
      */}
      <ToggleRow
        label="Alerts with the app closed"
        hint={
          config.notifyWhenClosed
            ? 'Uses iPhone notification slots, which are limited to 64 for the whole app.'
            : 'Costs no notification slots. Alerts only while this app is open and on screen.'
        }
        value={config.notifyWhenClosed}
        onChange={(notifyWhenClosed: boolean) => update({ notifyWhenClosed })}
      />

      {config.restDurationMs > 0 ? (
        <ToggleRow
          label="Alert when rest ends"
          hint="Off by default. On for sets and reps, where the point is to go again."
          value={config.restEndAlert}
          onChange={(restEndAlert: boolean) => update({ restEndAlert })}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', gap: spacing.sm },
  note: { ...typography.caption, color: colors.textMuted },
});
