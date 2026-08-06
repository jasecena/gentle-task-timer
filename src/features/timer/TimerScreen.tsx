import { useCallback } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, Vibration, View } from 'react-native';

import { buildVibrationPattern } from '@/core/alerts';
import { playAlertSound, stopAlertSound } from '@/services/soundPreview';
import { DEFAULT_CONFIG, MAX_RUNS, type Phase, type TimerConfig, type TimerRun } from '@/core/timer';
import { colors, radius, spacing, typography } from '@/theme/tokens';

import { SwipeToDelete } from '@/components/SwipeToDelete';
import { ToggleRow } from '@/components/ToggleRow';

import { RunPill, RUN_PILL_SIZE } from './components/RunPill';
import { TimerCard } from './components/TimerCard';
import { useFloatingControl } from './hooks/useFloatingControl';
import { useKeepAwakeWhile } from './hooks/useKeepAwakeWhile';
import { useTimers, type TimerRunView } from './hooks/useTimers';
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
    // A rest ending is opt-in, and has to be skipped here as well as in the notification
    // plan — these are two independent paths to the same boundary, and silencing only one
    // would leave the phone buzzing whenever the app happened to be open.
    if (phase.kind === 'rest' && !run.state.config.restEndAlert) return;

    // Distinct rhythms so work-ending and rest-ending are tellable apart in a
    // pocket; both last as long as that timer's setting says.
    vibrate(run.state.config.vibrationMs, phase.kind === 'work' ? 'double' : 'single');
    announce(run.state.config);
  }, []);

  const onComplete = useCallback((run: TimerRun) => {
    vibrate(run.state.config.vibrationMs, 'triple');
    announce(run.state.config);
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
      stopAlertSound();
      timers.toggle(id);
    },
    [timers],
  );

  const reset = useCallback(
    (id: string) => {
      Vibration.cancel();
      stopAlertSound();
      timers.reset(id);
    },
    [timers],
  );

  const running = timers.views.filter((entry) => entry.view.status === 'running').length;

  const floating = useFloatingControl();
  const pinned = floating.enabled ? pickPinned(timers.views) : null;

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} bounces={false}>
        <View style={[styles.header, pinned && styles.headerInset]}>
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

        {/*
          At the foot of the list rather than the top, because the control it
          governs covers the top-left corner — a switch underneath it would be
          unreachable exactly when you wanted to turn it off.
        */}
        <ToggleRow
          label="Floating control"
          hint="Pins the running timer's countdown and pause button over the list."
          value={floating.enabled}
          onChange={floating.set}
        />

        {alertPermission === 'denied' ? (
          <Text style={styles.notice}>
            Notifications are off, so phase alerts only reach you while the app is open. Turn them on in Settings.
          </Text>
        ) : null}
      </ScrollView>

      {/*
        Last child, so it paints over the list without needing a zIndex, and
        outside the ScrollView, so it stays put while the list moves under it.
      */}
      {pinned ? (
        <View style={styles.pin}>
          <RunPill
            name={pinned.config.name}
            status={pinned.view.status === 'running' ? 'running' : 'paused'}
            remainingMs={pinned.view.phaseRemainingMs}
            phaseKind={pinned.view.phase?.kind ?? null}
            onToggle={() => toggle(pinned.id)}
          />
        </View>
      ) : null}
    </View>
  );
}

/**
 * The one run the floating control belongs to.
 *
 * Running wins, in list order — with several going, the first one is the one the
 * box follows. A *paused* run is the fallback rather than an equal, and it has
 * to be there: pausing from the box would otherwise make the box disappear,
 * taking with it the only thing that could resume the run.
 *
 * Derived on each render rather than remembered, so there is no stale id to
 * reconcile when a run is deleted, restored or reset. The one visible seam is
 * that pausing the only running timer while an older paused one sits above it in
 * the list hands the box to the older one; picking up the wrong *paused* timer
 * is a cheap kind of wrong, and it costs no state to be right the rest of the
 * time.
 */
function pickPinned(views: TimerRunView[]): TimerRunView | null {
  return (
    views.find((entry) => entry.view.status === 'running') ??
    views.find((entry) => entry.view.status === 'paused') ??
    null
  );
}

/**
 * Plays the run's voice, but only when nothing else will.
 *
 * In the normal mode the sound rides on the notification and iOS plays it, so doing it here as
 * well would double up. In-app mode schedules no notification at all, which means the app is
 * the only thing that can make a noise.
 */
function announce(config: TimerConfig): void {
  if (config.notifyWhenClosed) return;
  playAlertSound(config.soundId, config.ringMs);
}

/** Fires a vibration of the configured length, or nothing at all when it is off. */
function vibrate(durationMs: number, rhythm: 'single' | 'double' | 'triple') {
  const pattern = buildVibrationPattern(durationMs, rhythm);
  if (pattern.length === 0) return;
  Vibration.vibrate(pattern);
}

const styles = StyleSheet.create({
  // Holds the list and the floating control as siblings; the control is not
  // part of the scrolling content.
  root: { flex: 1 },
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    gap: spacing.md,
  },
  header: { alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs },
  // The control overlaps the top-left corner, so the heading centres itself in
  // what is left rather than sitting underneath it. Only the heading moves —
  // the cards keep their position, so nothing jumps when a run starts.
  headerInset: { paddingLeft: RUN_PILL_SIZE },
  pin: { position: 'absolute', top: spacing.sm, left: spacing.md },
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
