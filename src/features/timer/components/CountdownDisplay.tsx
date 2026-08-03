import { StyleSheet, Text, View } from 'react-native';

import { formatDuration, type TimerProjection } from '@/core/timer';
import { colors, phaseColor, spacing, typography } from '@/theme/tokens';

interface Props {
  view: TimerProjection;
  /**
   * What to show before the timer starts — the length of one work phase. It is
   * passed in rather than derived from the projection because a projection has
   * no current phase while idle, and dividing the total by the cycle count
   * would fold the rest phases in and overstate it.
   */
  idleDurationMs: number;
}

/** The big number, plus the context needed to read it: which phase, which cycle. */
export function CountdownDisplay({ view, idleDurationMs }: Props) {
  const kind = view.phase?.kind ?? null;
  const accent = phaseColor(kind);

  // Idle shows one work phase, so the user sees what pressing Start will
  // actually do rather than a meaningless zero.
  const displayMs = view.status === 'idle' ? idleDurationMs : view.phaseRemainingMs;

  const phaseLabel =
    view.status === 'completed' ? 'DONE' : kind === 'rest' ? 'REST' : kind === 'work' ? 'WORK' : 'READY';

  return (
    <View style={styles.container}>
      <Text style={[styles.phaseLabel, { color: accent }]} accessibilityRole="header">
        {phaseLabel}
      </Text>

      <Text
        style={styles.countdown}
        accessibilityLabel={`${formatDuration(displayMs)} remaining`}
        // The value changes every second; announcing each one would be unusable.
        accessibilityLiveRegion="none"
      >
        {formatDuration(view.status === 'completed' ? 0 : displayMs)}
      </Text>

      <Text style={styles.cycle}>
        {view.status === 'completed'
          ? `${view.totalCycles} of ${view.totalCycles} complete`
          : `Cycle ${view.currentCycle} of ${view.totalCycles}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: spacing.sm },
  phaseLabel: { ...typography.label },
  countdown: { ...typography.countdown, color: colors.textPrimary },
  cycle: { ...typography.caption, color: colors.textSecondary },
});
