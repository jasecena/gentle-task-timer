import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatDuration, formatDurationLabel, type TimerConfig, type TimerProjection } from '@/core/timer';
import { colors, phaseColor, radius, spacing, typography } from '@/theme/tokens';

import { ConfigEditor } from './ConfigEditor';
import { ProgressBar } from './ProgressBar';

interface Props {
  config: TimerConfig;
  view: TimerProjection;
  canRemove: boolean;
  onToggle: () => void;
  onReset: () => void;
  onRemove: () => void;
  onChange: (config: TimerConfig) => void;
}

const PRIMARY_LABEL: Record<TimerProjection['status'], string> = {
  idle: 'Start',
  running: 'Pause',
  paused: 'Resume',
  completed: 'Start again',
};

/**
 * One timer in the list.
 *
 * The single-timer screen this replaces gave the countdown a 76pt display and
 * the whole viewport. Eight of those do not fit, so the card trades size for
 * density: a countdown you can still read at a glance, both progress bars, and
 * the settings folded away behind a disclosure. Everything that was one press
 * before is still one press.
 *
 * The name doubles as the alert title, which is why it is the most prominent
 * thing on the card — with several timers going it is the only way to tell
 * which one just buzzed.
 */
export function TimerCard({ config, view, canRemove, onToggle, onReset, onRemove, onChange }: Props) {
  const [expanded, setExpanded] = useState(false);
  const accent = phaseColor(view.phase?.kind ?? null);
  const canReset = view.status !== 'idle';

  // Idle shows one work phase, so the user sees what pressing Start will
  // actually do rather than a meaningless zero.
  const displayMs = view.status === 'idle' ? config.workDurationMs : view.phaseRemainingMs;
  const phaseLabel =
    view.status === 'completed'
      ? 'DONE'
      : view.phase?.kind === 'rest'
        ? 'REST'
        : view.phase?.kind === 'work'
          ? 'WORK'
          : 'READY';

  return (
    <View style={[styles.card, view.status === 'running' && { borderColor: accent }]}>
      <View style={styles.header}>
        <View style={styles.heading}>
          <Text style={styles.name} numberOfLines={1}>
            {config.name}
          </Text>
          <Text style={styles.summary}>
            {formatDurationLabel(view.totalDurationMs)} total
            {config.restDurationMs > 0 ? ` · ${formatDurationLabel(config.restDurationMs)} rest` : ''}
          </Text>
        </View>

        <Pressable
          onPress={() => setExpanded((open) => !open)}
          accessibilityRole="button"
          accessibilityLabel={`${expanded ? 'Hide' : 'Show'} settings for ${config.name}`}
          accessibilityState={{ expanded }}
          hitSlop={8}
          style={({ pressed }) => [styles.disclosure, pressed && styles.pressed]}
        >
          <Text style={styles.disclosureSymbol}>{expanded ? '⌃' : '⌄'}</Text>
        </Pressable>
      </View>

      <View style={styles.display}>
        <Text style={[styles.phaseLabel, { color: accent }]}>{phaseLabel}</Text>
        <Text
          style={styles.countdown}
          accessibilityLabel={`${config.name}: ${formatDuration(displayMs)} remaining`}
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

      <ProgressBar view={view} />

      <View style={styles.controls}>
        <Pressable
          onPress={onToggle}
          accessibilityRole="button"
          accessibilityLabel={`${PRIMARY_LABEL[view.status]} ${config.name}`}
          style={({ pressed }) => [styles.primary, { backgroundColor: accent }, pressed && styles.pressed]}
        >
          <Text style={styles.primaryText}>{PRIMARY_LABEL[view.status]}</Text>
        </Pressable>

        <Pressable
          onPress={onReset}
          disabled={!canReset}
          accessibilityRole="button"
          accessibilityLabel={`Reset ${config.name}`}
          accessibilityState={{ disabled: !canReset }}
          style={({ pressed }) => [
            styles.secondary,
            !canReset && styles.disabled,
            pressed && canReset && styles.pressed,
          ]}
        >
          <Text style={[styles.secondaryText, !canReset && styles.disabledText]}>Reset</Text>
        </Pressable>
      </View>

      {expanded ? (
        <View style={styles.editor}>
          {/*
            The durations lock while running — editing them would invalidate the
            timeline the run is following. Vibration and sound stay editable,
            because neither can.
          */}
          <ConfigEditor config={config} onChange={onChange} disabled={view.status === 'running'} />

          <Pressable
            onPress={onRemove}
            disabled={!canRemove}
            accessibilityRole="button"
            accessibilityLabel={`Delete ${config.name}`}
            accessibilityState={{ disabled: !canRemove }}
            style={({ pressed }) => [
              styles.delete,
              !canRemove && styles.disabled,
              pressed && canRemove && styles.pressed,
            ]}
          >
            <Text style={[styles.deleteText, !canRemove && styles.disabledText]}>
              {canRemove ? 'Delete timer' : 'The last timer cannot be deleted'}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  heading: { flex: 1, gap: 2 },
  name: { ...typography.title, color: colors.textPrimary },
  summary: { ...typography.caption, color: colors.textMuted },
  disclosure: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
  },
  disclosureSymbol: { fontSize: 16, lineHeight: 20, color: colors.textSecondary },
  display: { alignItems: 'center', gap: spacing.xs },
  phaseLabel: { ...typography.label },
  // Two-thirds of the single-timer display: still the biggest thing on the
  // card, but eight of them fit on a phone.
  countdown: { fontSize: 48, fontWeight: '200', fontVariant: ['tabular-nums'], color: colors.textPrimary },
  cycle: { ...typography.caption, color: colors.textSecondary },
  controls: { flexDirection: 'row', gap: spacing.sm },
  primary: {
    flex: 2,
    minHeight: 48, // above the 44pt iOS touch-target minimum
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { ...typography.body, fontWeight: '600', color: colors.onAccent },
  secondary: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryText: { ...typography.body, color: colors.textSecondary },
  editor: {
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  delete: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  deleteText: { ...typography.caption, color: colors.danger },
  disabled: { opacity: 0.4 },
  disabledText: { color: colors.textMuted },
  pressed: { opacity: 0.7 },
});
