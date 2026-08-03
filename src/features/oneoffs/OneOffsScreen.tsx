import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { describeOneOff, ONEOFF_LIMITS } from '@/core/oneoffs';
import { colors, radius, spacing, typography } from '@/theme/tokens';

import { OneOffComposer } from './components/OneOffComposer';
import type { UseOneOffs } from './hooks/useOneOffs';

interface Props {
  /**
   * The notes, lifted to the shell so the timers can see how many of the 64
   * notification slots are already spoken for.
   *
   * Passed in rather than hooked up here, which also makes the screen a pure
   * function of its state: a test renders it with a plain object and never
   * touches storage or the notification module.
   */
  oneoffs: UseOneOffs;
}

/**
 * One-off notes: say something to yourself, once, on a day you pick.
 *
 * The third mode, and the one that is neither a run nor a standing
 * arrangement. Nothing counts down and nothing repeats — the note is handed to
 * iOS as a single non-repeating calendar alert, arrives once, and then removes
 * itself from the list the next time the app opens.
 */
export function OneOffsScreen({ oneoffs }: Props) {
  const { draft, issues, now } = oneoffs;

  const noteIssue = issues.find((issue) => issue.field === 'note' && draft.note.length > 0);
  const countIssue = issues.find((issue) => issue.field === 'count');
  const canAdd = issues.length === 0;

  return (
    <ScrollView contentContainerStyle={styles.content} bounces={false} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <Text style={styles.title}>Once</Text>
        <Text style={styles.summary}>
          {oneoffs.oneoffs.length} of {ONEOFF_LIMITS.MAX_ONEOFFS} notes waiting
        </Text>
      </View>

      <OneOffComposer draft={draft} onChange={oneoffs.setDraft} />

      {noteIssue ? <Text style={styles.problem}>{noteIssue.message}</Text> : null}
      {countIssue ? <Text style={styles.problem}>{countIssue.message}</Text> : null}

      <Pressable
        onPress={oneoffs.add}
        disabled={!canAdd}
        accessibilityRole="button"
        accessibilityLabel="Add note"
        accessibilityState={{ disabled: !canAdd }}
        style={({ pressed }) => [styles.add, !canAdd && styles.disabled, pressed && canAdd && styles.pressed]}
      >
        <Text style={styles.addText}>Add note</Text>
      </Pressable>

      {oneoffs.oneoffs.length === 0 ? (
        <Text style={styles.empty}>
          Nothing waiting. A note arrives once, at the day and time you pick, whether or not the app is open.
        </Text>
      ) : (
        <View style={styles.list}>
          {oneoffs.oneoffs.map((oneoff) => (
            <View key={oneoff.id} style={styles.row}>
              <View style={styles.rowText}>
                <Text style={styles.rowNote}>{oneoff.note}</Text>
                <Text style={styles.rowWhen}>{describeOneOff(oneoff, now)}</Text>
              </View>
              <Pressable
                onPress={() => oneoffs.remove(oneoff.id)}
                accessibilityRole="button"
                accessibilityLabel={`Delete note: ${oneoff.note}`}
                hitSlop={8}
                style={({ pressed }) => [styles.remove, pressed && styles.pressed]}
              >
                <Text style={styles.removeText}>Delete</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}

      {oneoffs.permission === 'denied' ? (
        <Text style={styles.notice}>Notifications are off, so a note cannot reach you. Turn them on in Settings.</Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, paddingHorizontal: spacing.lg, paddingVertical: spacing.lg, gap: spacing.md },
  header: { alignItems: 'center', gap: spacing.xs },
  title: { ...typography.title, color: colors.textPrimary },
  summary: { ...typography.caption, color: colors.textMuted },
  add: {
    minHeight: 56, // comfortably above the 44pt iOS touch-target minimum
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.work,
  },
  addText: { ...typography.title, color: colors.onAccent },
  list: { gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  rowText: { flex: 1, gap: 2 },
  rowNote: { ...typography.body, color: colors.textPrimary },
  rowWhen: { ...typography.caption, color: colors.textMuted },
  remove: { minHeight: 44, justifyContent: 'center' },
  removeText: { ...typography.caption, color: colors.danger },
  empty: { ...typography.caption, color: colors.textMuted, textAlign: 'center' },
  problem: { ...typography.caption, color: colors.danger },
  notice: { ...typography.caption, color: colors.textMuted, textAlign: 'center' },
  disabled: { opacity: 0.35 },
  pressed: { opacity: 0.7 },
});
