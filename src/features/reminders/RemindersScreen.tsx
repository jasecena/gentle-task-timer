import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { REMINDER_BUDGET } from '@/core/alerts';
import { formatClock, formatDays, reminderTimesOfDay } from '@/core/reminders';
import { formatDurationLabel } from '@/core/timer';
import { colors, radius, spacing, typography } from '@/theme/tokens';

import { ArmButton } from './components/ArmButton';
import { ScheduleEditor } from './components/ScheduleEditor';
import type { UseReminders } from './hooks/useReminders';

interface Props {
  /**
   * The schedule state, lifted to the shell so the timer can see how many of
   * the 64 notification slots are already spoken for.
   *
   * Passed in rather than hooked up here, which also makes the screen a pure
   * function of its state: a test renders it with a plain object and never
   * touches storage or the notification module.
   */
  reminders: UseReminders;
}

/**
 * The scheduling mode: recurring alerts in a window, on chosen days.
 *
 * Unlike the timer, nothing here counts down and nothing needs the app to stay
 * open — arming the schedule hands a set of weekly-repeating notifications to
 * iOS, which delivers them whether or not the app is running. The screen is a
 * remote control for that arrangement: edit it, arm it, stop it.
 */
export function RemindersScreen({ reminders }: Props) {
  const { config, issues, slotCount } = reminders;

  const budgetIssue = issues.find((issue) => issue.field === 'budget');
  const blocking = issues.filter((issue) => issue.field !== 'budget');
  const perDay = reminderTimesOfDay(config).length;

  return (
    <ScrollView contentContainerStyle={styles.content} bounces={false}>
      <View style={styles.header}>
        <Text style={styles.title}>Schedule</Text>
        <Text style={styles.summary}>
          {config.enabled
            ? `Armed · ${formatDays(config.days)} · ${formatClock(config.startMinute)}–${formatClock(config.endMinute)}`
            : `Every ${formatDurationLabel(config.intervalMs)}, ${formatDays(config.days)}`}
        </Text>
      </View>

      <ScheduleEditor config={config} onChange={reminders.setConfig} disabled={config.enabled} />

      {/*
        The live count is the whole point of showing a budget: iOS holds 64
        pending alerts app-wide, and "every 30 minutes, 9 to 5, weekdays" is 85
        on its own. Better to say so here than to schedule 48 and drop 37.
      */}
      <View style={[styles.budget, budgetIssue && styles.budgetOver]}>
        <Text style={[styles.budgetCount, budgetIssue && styles.budgetCountOver]}>
          {slotCount} of {REMINDER_BUDGET} alerts a week
        </Text>
        <Text style={styles.budgetDetail}>
          {perDay} a day × {config.days.length} {config.days.length === 1 ? 'day' : 'days'}
        </Text>
      </View>

      {budgetIssue ? <Text style={styles.problem}>{budgetIssue.message}</Text> : null}
      {blocking.map((issue) => (
        <Text key={issue.field} style={styles.problem}>
          {issue.message}
        </Text>
      ))}

      <ArmButton armed={config.enabled} canArm={issues.length === 0} onArm={reminders.start} onStop={reminders.stop} />

      {reminders.permission === 'denied' ? (
        <Text style={styles.notice}>
          Notifications are off, so a schedule cannot reach you. Turn them on in Settings.
        </Text>
      ) : (
        <Text style={styles.notice}>
          {config.enabled
            ? 'Alerts keep arriving with the app closed. Vibration length applies while the app is open.'
            : 'Once armed, alerts arrive with the app closed — no need to keep it running.'}
        </Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, paddingHorizontal: spacing.lg, paddingVertical: spacing.lg, gap: spacing.lg },
  header: { alignItems: 'center', gap: spacing.xs },
  title: { ...typography.title, color: colors.textPrimary },
  summary: { ...typography.caption, color: colors.textMuted, textAlign: 'center' },
  budget: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    gap: spacing.xs,
  },
  budgetOver: { borderColor: colors.danger },
  budgetCount: { ...typography.body, color: colors.textPrimary },
  budgetCountOver: { color: colors.danger },
  budgetDetail: { ...typography.caption, color: colors.textMuted },
  problem: { ...typography.caption, color: colors.danger },
  notice: { ...typography.caption, color: colors.textMuted, textAlign: 'center' },
});
