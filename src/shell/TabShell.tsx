import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { countReminderSlots } from '@/core/reminders';
import { RemindersScreen } from '@/features/reminders/RemindersScreen';
import { useReminders } from '@/features/reminders/hooks/useReminders';
import { TimerScreen } from '@/features/timer/TimerScreen';
import { colors, spacing, typography } from '@/theme/tokens';

type Tab = 'timer' | 'schedule';

const TABS: { key: Tab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'timer', label: 'Timer', icon: 'timer-outline' },
  { key: 'schedule', label: 'Schedule', icon: 'calendar-outline' },
];

/**
 * The two modes, behind a bottom tab bar.
 *
 * Hand-rolled rather than pulling in a navigation library: two tabs need no
 * router, no navigation state and no native screen container, and this stays
 * one file with no new native module in the build.
 *
 * Both screens stay **mounted**, with the inactive one hidden. That is not an
 * optimisation — unmounting the timer would throw away a running countdown the
 * moment you glanced at the schedule tab.
 */
export function TabShell() {
  const [tab, setTab] = useState<Tab>('timer');

  // Lifted so the timer knows how many of the 64 notification slots a standing
  // schedule is holding, and takes only what is left.
  const reminders = useReminders();
  const reminderSlots = reminders.config.enabled ? countReminderSlots(reminders.config) : 0;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.screens}>
        <View style={[styles.screen, tab !== 'timer' && styles.hidden]}>
          <TimerScreen reminderSlots={reminderSlots} />
        </View>
        <View style={[styles.screen, tab !== 'schedule' && styles.hidden]}>
          <RemindersScreen reminders={reminders} />
        </View>
      </View>

      <View style={styles.tabBar}>
        {TABS.map(({ key, label, icon }) => {
          const active = tab === key;
          return (
            <Pressable
              key={key}
              onPress={() => setTab(key)}
              accessibilityRole="tab"
              // "Schedule tab", not "Schedule": the schedule screen has a
              // heading of its own, and an ambiguous label is a coin toss for
              // both a screen reader and the UI smoke test.
              accessibilityLabel={`${label} tab`}
              accessibilityState={{ selected: active }}
              style={({ pressed }) => [styles.tab, pressed && styles.pressed]}
            >
              <Ionicons name={icon} size={24} color={active ? colors.work : colors.textMuted} />
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  screens: { flex: 1 },
  // Absolute fill rather than conditional rendering: both screens keep their
  // state and their layout, and switching costs nothing.
  screen: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  hidden: { display: 'none' },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  tab: { flex: 1, alignItems: 'center', gap: spacing.xs, paddingTop: spacing.sm, paddingBottom: spacing.xs },
  tabLabel: { ...typography.caption, color: colors.textMuted },
  tabLabelActive: { color: colors.work },
  pressed: { opacity: 0.6 },
});
