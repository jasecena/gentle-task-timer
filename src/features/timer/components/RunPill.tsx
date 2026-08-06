import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text } from 'react-native';

import { formatDuration, type PhaseKind } from '@/core/timer';
import { colors, phaseColor, radius } from '@/theme/tokens';

/**
 * 3 cm square, in points.
 *
 * An iPhone 16 is 393pt across a screen 6.5 cm wide, so a centimetre is ~60.6pt.
 * That makes this box a little under half the width of the phone — deliberately
 * large: it is meant to be readable and pressable without looking at it closely,
 * from further away than a card is.
 */
export const RUN_PILL_SIZE = 181;

interface Props {
  /** The run's name, which is what its accessibility label has to say out loud. */
  name: string;
  status: 'running' | 'paused';
  /** Time left in the current phase — the same value the card's big countdown shows. */
  remainingMs: number;
  phaseKind: PhaseKind | null;
  onToggle: () => void;
}

/**
 * The floating control for the run in progress.
 *
 * It exists because the timers are a scrolling list: once you are down at the
 * sixth card, the one that is actually counting down is off screen, and pausing
 * it means finding it again. This keeps one number and one button reachable no
 * matter where the list is.
 *
 * Deliberately minimal — a countdown and a button, no name, no phase word, no
 * cycle count. All of that is on the card, and repeating it here would make a
 * second, smaller card rather than a control. The phase is carried by the border
 * colour alone, which costs no space.
 *
 * The whole square is the button. There is nothing else in it to press, and a
 * target this size does not need to be aimed at.
 */
export function RunPill({ name, status, remainingMs, phaseKind, onToggle }: Props) {
  const running = status === 'running';
  // Paused drops to the neutral border: the box stops looking like the phase it
  // is in, because it is not in it any more.
  const accent = running ? phaseColor(phaseKind) : colors.border;
  const action = running ? 'pause' : 'resume';

  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="button"
      /*
       * Deliberately not `Pause <name>`, which is the card button's label. Two
       * identical labels are a coin toss for anything driving the app by label,
       * and the release smoke test does exactly that — `Pause Gentle Task
       * Timer` must not be a substring of this, or `tapOn` in
       * `.maestro/smoke.yaml` becomes ambiguous and the release fails on a flow
       * bug rather than a real one. Hence the name first and the verb after it.
       */
      accessibilityLabel={`Floating control: ${name}, ${action}, ${formatDuration(remainingMs)} left`}
      style={({ pressed }) => [styles.box, { borderColor: accent }, pressed && styles.pressed]}
    >
      <Ionicons name={running ? 'pause' : 'play'} size={52} color={accent} />
      <Text
        style={styles.countdown}
        // The digits change every second; announcing each one would be unusable,
        // and the label above already carries the time for anyone listening.
        accessibilityElementsHidden
        importantForAccessibility="no"
        // An hour-long phase reads `1:02:28` and is wider than the box; iOS
        // shrinks it to fit rather than truncating or wrapping it.
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {formatDuration(remainingMs)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: {
    width: RUN_PILL_SIZE,
    height: RUN_PILL_SIZE,
    borderRadius: radius.xl,
    borderWidth: 2,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 12,
  },
  countdown: { fontSize: 56, fontWeight: '300', fontVariant: ['tabular-nums'], color: colors.textPrimary },
  pressed: { opacity: 0.7 },
});
