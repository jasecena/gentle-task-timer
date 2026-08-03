import { useCallback } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, Vibration, View } from 'react-native';

import { buildVibrationPattern } from '@/core/alerts';
import { DEFAULT_CONFIG, MAX_RUNS, type Phase, type TimerConfig, type TimerRun } from '@/core/timer';
import { colors, radius, spacing, typography } from '@/theme/tokens';

import { SwipeToDelete } from '@/components/SwipeToDelete';

import { TimerCard } from './components/TimerCard';
import { useKeepAwakeWhile } from './hooks/useKeepAwakeWhile';
import { useTimers } from './hooks/useTimers';
import { useTimersAlerts } from './hooks/useTimersAlerts';

const INITIAL_CONFIG = {
  ...DEFAULT_CONFIG,
  name: 'Gentle Task Timer',
  workDurationMs: 120_000,
  restDurationMs: 30_000,
  repeats: 3,
};

interface Props {
  /** Slots a standing schedule holds, so runs claim only what is free of the 64. */
  reminderSlots?: number;
  /** Pending one-off notes, which hold a slot each until they fire. */
  oneoffSlots?: number;
}

/**
 * Every timer, running in parallel.
 *
 * Timers do not interact: each has its own config, its own run, its own name on
 * its own alerts. The two things they genuinely share are handled elsewhere —
 * the notification budget, divided in `useTimersAlerts`, and the screen lock,
 * held while *any* of them is counting down.
 */
export function TimerScreen({ reminderSlots = 0, oneoffSlots = 0 }: Props) {
  /**
   * The alert callbacks are created once and held by the engine through a
   * latest-ref, so they cannot close over the run list — it does not exist yet
   * at that point. The run that fired is handed to them instead, which is also
   * what lets the buzz use the length *that* timer is set to rather than one
   * global setting.
   */
  const onPhaseEnd = useCallback((run: TimerRun, phase: Phase) => {
    // Distinct rhythms so work-ending and rest-ending are tellable apart in a
    // pocket; both last as long as that timer's setting says.
    vibrate(run.state.config.vibrationMs, phase.kind === 'work' ? 'double' : 'single');
  }, []);

  const onComplete = useCallback((run: TimerRun) => {
    vibrate(run.state.config.vibrationMs, 'triple');
  }, []);

  const timers = useTimers(INITIAL_CONFIG, { onPhaseEnd, onComplete });

  // Holds the screen on while anything is running, so a glance always shows the
  // countdowns — and releases it the moment the last one stops.
  useKeepAwakeWhile(timers.anyRunning);

  // Vibration only reaches you with the app in front. Local notifications are
  // what announce a boundary with the screen locked or the app closed.
  const alertPermission = useTimersAlerts(timers.runs, { reminderSlots, oneoffSlots });

  // Any deliberate press stops a buzz in progress — a ten-second vibration you
  // cannot interrupt is a misfeature. `Vibration.cancel` is global, which is
  // the right scope: it stops whichever timer is currently buzzing.
  const toggle = useCallback(
    (id: string) => {
      Vibration.cancel();
      timers.toggle(id);
    },
    [timers],
  );

  const reset = useCallback(
    (id: string) => {
      Vibration.cancel();
      timers.reset(id);
    },
    [timers],
  );

  const running = timers.views.filter((entry) => entry.view.status === 'running').length;

  return (
    <ScrollView contentContainerStyle={styles.content} bounces={false}>
      <View style={styles.header}>
        <Text style={styles.title}>Timers</Text>
        <Text style={styles.summary}>
          {timers.runs.length} of {MAX_RUNS} · {running} running
        </Text>
      </View>

      {/*
        Swipe is a shortcut, not the interface: the same delete lives inside
        each card's settings, because a swipe is undiscoverable and invisible to
        a screen reader.
      */}
      {timers.views.map((entry) => (
        <SwipeToDelete key={entry.id} enabled={timers.canRemove} onDelete={() => timers.remove(entry.id)}>
          <TimerCard
            config={entry.config}
            view={entry.view}
            canRemove={timers.canRemove}
            onToggle={() => toggle(entry.id)}
            onReset={() => reset(entry.id)}
            onRemove={() => timers.remove(entry.id)}
            onChange={(config: TimerConfig) => timers.setConfig(entry.id, config)}
          />
        </SwipeToDelete>
      ))}

      <Pressable
        onPress={timers.add}
        disabled={!timers.canAdd}
        accessibilityRole="button"
        accessibilityLabel="Add timer"
        accessibilityState={{ disabled: !timers.canAdd }}
        style={({ pressed }) => [
          styles.add,
          !timers.canAdd && styles.disabled,
          pressed && timers.canAdd && styles.pressed,
        ]}
      >
        <Text style={styles.addText}>{timers.canAdd ? '+ Add timer' : `${MAX_RUNS} timers is the limit`}</Text>
      </Pressable>

      {alertPermission === 'denied' ? (
        <Text style={styles.notice}>
          Notifications are off, so phase alerts only reach you while the app is open. Turn them on in Settings.
        </Text>
      ) : null}
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
    gap: spacing.md,
  },
  header: { alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs },
  title: { ...typography.title, color: colors.textPrimary },
  summary: { ...typography.caption, color: colors.textMuted },
  add: {
    minHeight: 52,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  addText: { ...typography.body, color: colors.textSecondary },
  notice: { ...typography.caption, color: colors.textMuted, textAlign: 'center' },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.7 },
});
