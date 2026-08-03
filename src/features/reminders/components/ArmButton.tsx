import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, typography } from '@/theme/tokens';

interface Props {
  armed: boolean;
  /** False while the draft has problems — an unfixed schedule cannot be armed. */
  canArm: boolean;
  onArm: () => void;
  onStop: () => void;
}

/**
 * Arm / stop.
 *
 * Stop is the control the user asked for on returning to the app: a schedule
 * that fires all day is only tolerable if turning it off takes one press, from
 * the screen you land on. It is styled as the destructive action because that
 * is what it is — pressing it cancels every pending alert.
 */
export function ArmButton({ armed, canArm, onArm, onStop }: Props) {
  if (armed) {
    return (
      <Pressable
        onPress={onStop}
        accessibilityRole="button"
        accessibilityLabel="Stop schedule"
        style={({ pressed }) => [styles.button, styles.stop, pressed && styles.pressed]}
      >
        <Text style={styles.stopText}>Stop</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.group}>
      <Pressable
        onPress={onArm}
        disabled={!canArm}
        accessibilityRole="button"
        accessibilityLabel="Start schedule"
        accessibilityState={{ disabled: !canArm }}
        style={({ pressed }) => [
          styles.button,
          styles.arm,
          !canArm && styles.disabled,
          pressed && canArm && styles.pressed,
        ]}
      >
        <Text style={styles.armText}>Start</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { width: '100%' },
  button: {
    minHeight: 56, // comfortably above the 44pt iOS touch-target minimum
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arm: { backgroundColor: colors.work },
  armText: { ...typography.title, color: colors.onAccent },
  stop: { backgroundColor: colors.danger },
  stopText: { ...typography.title, color: colors.onAccent },
  disabled: { opacity: 0.35 },
  pressed: { opacity: 0.7 },
});
