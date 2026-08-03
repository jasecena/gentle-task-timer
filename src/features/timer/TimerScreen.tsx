import { useCallback } from 'react';
import { ScrollView, StyleSheet, Text, Vibration, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DEFAULT_CONFIG, formatDurationLabel, type Phase } from '@/core/timer';
import { colors, spacing, typography } from '@/theme/tokens';

import { ConfigEditor } from './components/ConfigEditor';
import { Controls } from './components/Controls';
import { CountdownDisplay } from './components/CountdownDisplay';
import { ProgressBar } from './components/ProgressBar';
import { useKeepAwakeWhile } from './hooks/useKeepAwakeWhile';
import { useTimer } from './hooks/useTimer';

const INITIAL_CONFIG = {
  ...DEFAULT_CONFIG,
  name: 'Life Timer',
  workDurationMs: 120_000,
  restDurationMs: 30_000,
  repeats: 3,
};

/** Distinct patterns so work-ending and rest-ending are tellable apart without looking. */
const WORK_END_PATTERN = [0, 400, 150, 400];
const REST_END_PATTERN = [0, 200];
const COMPLETE_PATTERN = [0, 500, 200, 500, 200, 700];

export function TimerScreen() {
  const onPhaseEnd = useCallback((phase: Phase) => {
    Vibration.vibrate(phase.kind === 'work' ? WORK_END_PATTERN : REST_END_PATTERN);
  }, []);

  const onComplete = useCallback(() => {
    Vibration.vibrate(COMPLETE_PATTERN);
  }, []);

  const timer = useTimer(INITIAL_CONFIG, { onPhaseEnd, onComplete });

  // Holds the screen on while a timer is running, so a glance always shows the
  // countdown — and releases it the moment the timer stops.
  useKeepAwakeWhile(timer.isRunning);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
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
          onToggle={timer.toggle}
          onReset={timer.reset}
        />

        <ConfigEditor config={timer.config} onChange={timer.setConfig} disabled={timer.view.status === 'running'} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    gap: spacing.xl,
    justifyContent: 'space-between',
  },
  header: { alignItems: 'center', gap: spacing.xs },
  name: { ...typography.title, color: colors.textPrimary },
  summary: { ...typography.caption, color: colors.textMuted },
  display: { alignItems: 'center', gap: spacing.lg },
});
