import { useEffect, useMemo, useState } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '@/theme/tokens';

interface Props {
  onDelete: () => void;
  /** False keeps the row fixed — the last timer cannot be deleted. */
  enabled?: boolean;
  children: React.ReactNode;
}

/** How far the row slides to reveal the button. Matches the button's width. */
const REVEAL = 96;

/** Past this, letting go opens rather than snaps back. */
const OPEN_THRESHOLD = REVEAL / 2;

/**
 * A row that slides left to reveal a delete button.
 *
 * Hand-rolled on `PanResponder` rather than pulling in
 * `react-native-gesture-handler`. The library would be smoother under load, but
 * this is one short-lived horizontal drag on a list that is never more than
 * eight rows, and the alternative is a native module in the build for an
 * animation nothing else needs.
 *
 * Three details that make it behave rather than merely work:
 *
 * - **The gesture is claimed only once it is clearly horizontal.** Both lists
 *   live inside a `ScrollView`, so grabbing on every touch would fight vertical
 *   scrolling; the responder waits for horizontal movement to beat vertical by
 *   a clear margin.
 * - **Open/closed is React state, not a ref.** The obvious implementation keeps
 *   the current offset in a `useRef` and reads it while rendering, which this
 *   codebase's lint rules make an error — and rightly, since a value the render
 *   depends on belongs in state. The `Animated.Value` is held in lazily
 *   initialised state for the same reason: created once, never reassigned, and
 *   never read during render.
 * - **Swipe is never the only way to delete.** Every caller also keeps an
 *   ordinary button, and the revealed one here is hidden from the
 *   accessibility tree — a VoiceOver user cannot perform a swipe, so exposing
 *   it would only mean two identical Delete buttons on every row.
 */
export function SwipeToDelete({ onDelete, enabled = true, children }: Props) {
  const [translateX] = useState(() => new Animated.Value(0));
  const [open, setOpen] = useState(false);

  // Settles wherever the gesture left it, and re-settles if `open` was already
  // what the gesture chose — a drag that ends short of the threshold has moved
  // the value and still needs springing back.
  useEffect(() => {
    Animated.spring(translateX, {
      toValue: open ? -REVEAL : 0,
      useNativeDriver: true,
      bounciness: 0,
      speed: 20,
    }).start();
  }, [open, translateX]);

  const responder = useMemo(() => {
    const from = open ? -REVEAL : 0;

    const settle = (next: boolean) => {
      setOpen(next);
      Animated.spring(translateX, {
        toValue: next ? -REVEAL : 0,
        useNativeDriver: true,
        bounciness: 0,
        speed: 20,
      }).start();
    };

    return PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gesture) =>
        enabled && Math.abs(gesture.dx) > 12 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 2,
      onPanResponderMove: (_event, gesture) => {
        translateX.setValue(Math.min(0, Math.max(-REVEAL, from + gesture.dx)));
      },
      onPanResponderRelease: (_event, gesture) => settle(from + gesture.dx < -OPEN_THRESHOLD),
      // A gesture taken away mid-drag (the ScrollView winning, a phone call)
      // must not leave the row stranded half-open.
      onPanResponderTerminate: () => settle(false),
    });
  }, [enabled, open, translateX]);

  if (!enabled) return <View>{children}</View>;

  return (
    <View style={styles.container}>
      {/*
        Hidden from assistive technology on purpose: it is unreachable without
        a swipe, and the row itself always carries a real, labelled Delete.
      */}
      <View style={styles.behind} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Pressable
          onPress={() => {
            setOpen(false);
            onDelete();
          }}
          style={({ pressed }) => [styles.delete, pressed && styles.pressed]}
        >
          <Text style={styles.deleteText}>Delete</Text>
        </Pressable>
      </View>

      <Animated.View style={{ transform: [{ translateX }] }} {...responder.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: 'relative' },
  // Sits underneath the row and is uncovered as it slides, rather than sliding
  // in from the edge — one moving layer instead of two.
  behind: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: REVEAL,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.danger,
    borderRadius: radius.lg,
  },
  delete: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  deleteText: { ...typography.body, fontWeight: '600', color: colors.onAccent },
  pressed: { opacity: 0.7 },
});
