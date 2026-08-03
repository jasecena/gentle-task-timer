import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { TimerStatus } from '@/core/timer';
import { colors, phaseColor, radius, spacing, typography } from '@/theme/tokens';

interface Props {
  status: TimerStatus;
  phaseKind: 'work' | 'rest' | null;
  onToggle: () => void;
  onReset: () => void;
}

const PRIMARY_LABEL: Record<TimerStatus, string> = {
  idle: 'Start',
  running: 'Pause',
  paused: 'Resume',
  completed: 'Start again',
};

export function Controls({ status, phaseKind, onToggle, onReset }: Props) {
  const accent = phaseColor(phaseKind);
  const canReset = status !== 'idle';

  return (
    <View style={styles.container}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={PRIMARY_LABEL[status]}
        style={({ pressed }) => [styles.primary, { backgroundColor: accent }, pressed && styles.pressed]}
      >
        <Text style={styles.primaryText}>{PRIMARY_LABEL[status]}</Text>
      </Pressable>

      <Pressable
        onPress={onReset}
        disabled={!canReset}
        accessibilityRole="button"
        accessibilityLabel="Reset"
        accessibilityState={{ disabled: !canReset }}
        style={({ pressed }) => [styles.secondary, !canReset && styles.disabled, pressed && canReset && styles.pressed]}
      >
        <Text style={[styles.secondaryText, !canReset && styles.disabledText]}>Reset</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', gap: spacing.sm },
  primary: {
    minHeight: 56, // comfortably above the 44pt iOS touch-target minimum
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { ...typography.title, color: colors.onAccent },
  secondary: {
    minHeight: 48,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryText: { ...typography.body, color: colors.textSecondary },
  disabled: { opacity: 0.4 },
  disabledText: { color: colors.textMuted },
  pressed: { opacity: 0.7 },
});
