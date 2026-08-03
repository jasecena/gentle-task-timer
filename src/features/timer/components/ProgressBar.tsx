import { StyleSheet, View } from 'react-native';

import type { TimerProjection } from '@/core/timer';
import { colors, phaseColor, radius } from '@/theme/tokens';

interface Props {
  view: TimerProjection;
}

/**
 * Two bars: the current phase on top, the whole run underneath. Together they
 * answer "how long until the next beep?" and "how long until I'm finished?",
 * which are different questions.
 */
export function ProgressBar({ view }: Props) {
  const accent = phaseColor(view.phase?.kind ?? null);

  const phaseFraction =
    view.phase && view.phase.durationMs > 0 ? clamp01(view.phaseElapsedMs / view.phase.durationMs) : 0;

  return (
    <View style={styles.container}>
      <View style={styles.track} accessibilityRole="progressbar" accessibilityLabel="Current phase progress">
        <View style={[styles.fill, { width: `${phaseFraction * 100}%`, backgroundColor: accent }]} />
      </View>
      <View
        style={[styles.track, styles.trackThin]}
        accessibilityRole="progressbar"
        accessibilityLabel="Total progress"
      >
        <View style={[styles.fill, { width: `${clamp01(view.progress) * 100}%`, backgroundColor: colors.textMuted }]} />
      </View>
    </View>
  );
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

const styles = StyleSheet.create({
  container: { width: '100%', gap: 6 },
  track: { height: 6, borderRadius: radius.pill, backgroundColor: colors.surfaceRaised, overflow: 'hidden' },
  trackThin: { height: 3 },
  fill: { height: '100%', borderRadius: radius.pill },
});
