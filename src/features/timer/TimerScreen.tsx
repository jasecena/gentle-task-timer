import { useCallback, useEffect, useRef } from 'react';
import { ScrollView, StyleSheet, Text, Vibration, View } from 'react-native';

import { buildVibrationPattern } from '@/core/alerts';
import { DEFAULT_CONFIG, formatDurationLabel, type Phase } from '@/core/timer';
import { colors, spacing, typography } from '@/theme/tokens';

import { ConfigEditor } from './components/ConfigEditor';
import { Controls } from './components/Controls';
import { CountdownDisplay } from './components/CountdownDisplay';
import { ProgressBar } from './components/ProgressBar';
import { useKeepAwakeWhile } from './hooks/useKeepAwakeWhile';
import { usePersistedTimer } from './hooks/usePersistedTimer';
import { useTimerAlerts } from './hooks/useTimerAlerts';

const INITIAL_CONFIG = {
  ...DEFAULT_CONFIG,
  name: 'Gentle Task Timer',
  workDurationMs: 120_000,
  restDurationMs: 30_000,
  repeats: 3,
};

interface Props {
  /** Slots a standing schedule holds, so the run claims only what is free of the 64. */
  reminderSlots?: number;
}

export function TimerScreen({ reminderSlots = 0 }: Props) {
  /**
   * The vibration setting, mirrored into a ref.
   *
   * The alert callbacks are created once and held by the engine through a
   * latest-ref, so they cannot close over `timer.config` — the timer does not
   * exist yet at that point. Mirroring in an effect (never during render, which
   * the lint rules make an error) keeps them reading the current setting.
   */
  const vibrationMsRef = useRef(INITIAL_CONFIG.vibrationMs);

  const onPhaseEnd = useCallback((phase: Phase) => {
    // Distinct rhythms so work-ending and rest-ending are tellable apart in a
    // pocket; both last as long as the setting says.
    vibrate(vibrationMsRef.current, phase.kind === 'work' ? 'double' : 'single');
  }, []);

  const onComplete = useCallback(() => {
    vibrate(vibrationMsRef.current, 'triple');
  }, []);

  const timer = usePersistedTimer(INITIAL_CONFIG, { onPhaseEnd, onComplete });

  useEffect(() => {
    vibrationMsRef.current = timer.config.vibrationMs;
  });

  // Holds the screen on while a timer is running, so a glance always shows the
  // countdown — and releases it the moment the timer stops.
  useKeepAwakeWhile(timer.isRunning);

  // Vibration only reaches you with the app in front. Local notifications are
  // what announce a boundary with the screen locked or the app closed.
  const alertPermission = useTimerAlerts(timer.state, timer.schedule, { reminderSlots });

  // Any deliberate press stops a buzz in progress — a ten-second vibration you
  // cannot interrupt is a misfeature.
  const toggle = useCallback(() => {
    Vibration.cancel();
    timer.toggle();
  }, [timer]);

  const reset = useCallback(() => {
    Vibration.cancel();
    timer.reset();
  }, [timer]);

  return (
    <ScrollView contentContainerStyle={styles.content} bounces={false}>
      <View style={styles.header}>
        <Text style={styles.name}>{timer.config.name}</Text>
        <Text style={styles.summary}>
          {formatDurationLabel(timer.view.totalDurationMs)} total
          {timer.config.restDurationMs > 0 ? ` · ${formatDurationLabel(timer.config.restDurationMs)} rest` : ''}
        </Text>
      </View>

      <View style={styles.display}>
        <CountdownDisplay view={timer.view} idleDurationMs={timer.config.workDurationMs} />
        <ProgressBar view={timer.view} />
      </View>

      <Controls
        status={timer.view.status}
        phaseKind={timer.view.phase?.kind ?? null}
        onToggle={toggle}
        onReset={reset}
      />

      {alertPermission === 'denied' ? (
        <Text style={styles.notice}>
          Notifications are off, so phase alerts only reach you while the app is open. Turn them on in Settings.
        </Text>
      ) : null}

      <ConfigEditor config={timer.config} onChange={timer.setConfig} disabled={timer.view.status === 'running'} />
    </ScrollView>
  );
}

/** Fires a vibration of the configured length, or nothing at all when it is off. */
function vibrate(durationMs: number, rhythm: 'single' | 'double' | 'triple') {
  const pattern = buildVibrationPattern(durationMs, rhythm);
  if (pattern.length === 0) return;
  Vibration.vibrate(pattern);
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    gap: spacing.xl,
    justifyContent: 'space-between',
  },
  header: { alignItems: 'center', gap: spacing.xs },
  notice: { ...typography.caption, color: colors.textMuted, textAlign: 'center' },
  name: { ...typography.title, color: colors.textPrimary },
  summary: { ...typography.caption, color: colors.textMuted },
  display: { alignItems: 'center', gap: spacing.lg },
});
