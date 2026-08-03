import { StyleSheet, Text, View } from 'react-native';

import { StepperRow } from '@/components/StepperRow';
import {
  canStepRing,
  canStepSound,
  formatRingLabel,
  formatSoundLabel,
  formatVibrationLabel,
  hasRingLength,
  isSilentSound,
  stepRingMs,
  stepSoundId,
  stepVibrationMs,
  VIBRATION_LIMITS,
} from '@/core/alerts';
import { previewSound } from '@/services/soundPreview';
import { colors, spacing, typography } from '@/theme/tokens';

export interface AlertSettings {
  readonly vibrationMs: number;
  readonly soundId: string;
  readonly ringMs: number;
}

interface Props {
  settings: AlertSettings;
  onChange: (patch: Partial<AlertSettings>) => void;
  disabled?: boolean;
}

/**
 * Vibration, voice and ring length — the three rows every alert has.
 *
 * Shared by all three editors rather than copied into them, because they had
 * already drifted once: the timer's vibration row stayed editable mid-run while
 * the schedule's did not, for no reason anyone had written down.
 *
 * **Stepping the voice plays it.** Choosing a sound you cannot hear is
 * guesswork, and the voices are deliberately similar enough that the names do
 * not settle it. Tapping the value replays the current one, so auditioning two
 * against each other does not mean stepping past and back.
 */
export function AlertRows({ settings, onChange, disabled = false }: Props) {
  const { vibrationMs, soundId, ringMs } = settings;

  const chooseSound = (direction: 1 | -1) => {
    const next = stepSoundId(soundId, direction);
    onChange({ soundId: next });
    previewSound(next);
  };

  const silent = isSilentSound(soundId);
  const ringable = hasRingLength(soundId);

  return (
    <View style={styles.container}>
      <StepperRow
        label="Vibration"
        value={formatVibrationLabel(vibrationMs)}
        disabled={disabled}
        onDecrement={() => onChange({ vibrationMs: stepVibrationMs(vibrationMs, -1) })}
        onIncrement={() => onChange({ vibrationMs: stepVibrationMs(vibrationMs, 1) })}
        canDecrement={vibrationMs > VIBRATION_LIMITS.OFF_MS}
        canIncrement={vibrationMs < VIBRATION_LIMITS.MAX_MS}
      />
      <StepperRow
        label="Sound"
        value={formatSoundLabel(soundId)}
        disabled={disabled}
        onDecrement={() => chooseSound(-1)}
        onIncrement={() => chooseSound(1)}
        canDecrement={canStepSound(soundId, -1)}
        canIncrement={canStepSound(soundId, 1)}
        onPressValue={() => previewSound(soundId)}
      />
      {/*
        Greyed rather than hidden when the voice has only one length. A row that
        appears and disappears as you step through voices is more disorienting
        than one that is visibly unavailable.
      */}
      <StepperRow
        label="Ring length"
        value={ringable ? formatRingLabel(ringMs) : '—'}
        disabled={disabled || !ringable}
        onDecrement={() => onChange({ ringMs: stepRingMs(ringMs, -1) })}
        onIncrement={() => onChange({ ringMs: stepRingMs(ringMs, 1) })}
        canDecrement={canStepRing(ringMs, -1)}
        canIncrement={canStepRing(ringMs, 1)}
      />

      {silent ? (
        <Text style={styles.note}>
          Silent alerts make no sound. With the app open they still buzz; with it closed, whether the phone vibrates is
          your Ring/Silent switch, not something an app can ask for.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', gap: spacing.sm },
  note: { ...typography.caption, color: colors.textMuted },
});
