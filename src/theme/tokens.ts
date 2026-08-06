/**
 * Design tokens. Every colour, space and type size in the app comes from here,
 * so a restyle is a one-file change rather than a hunt through StyleSheets.
 */
import type { TextStyle } from 'react-native';

export const colors = {
  background: '#0B0F14',
  surface: '#151C24',
  surfaceRaised: '#1E2833',
  border: '#2A3644',

  textPrimary: '#F2F6FA',
  textSecondary: '#9AAABC',
  textMuted: '#64748B',

  /** Work phase — the "go" state. */
  work: '#38BDF8',
  /** Rest phase — deliberately calmer than work so a glance tells them apart. */
  rest: '#A78BFA',
  success: '#34D399',
  danger: '#F87171',

  onAccent: '#0B0F14',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 20,
  /** For surfaces large enough that `lg` reads as a square corner — the floating run control. */
  xl: 36,
  pill: 999,
} as const;

export const typography = {
  /** The countdown itself. Tabular figures stop the layout jittering as digits change. */
  countdown: { fontSize: 76, fontWeight: '200', fontVariant: ['tabular-nums'] },
  title: { fontSize: 24, fontWeight: '600' },
  body: { fontSize: 16, fontWeight: '400' },
  label: { fontSize: 13, fontWeight: '600', letterSpacing: 1.2 },
  caption: { fontSize: 13, fontWeight: '400' },
} satisfies Record<string, TextStyle>;

/** The accent colour for a phase kind, used by the ring, badge and controls. */
export function phaseColor(kind: 'work' | 'rest' | null): string {
  if (kind === 'rest') return colors.rest;
  if (kind === 'work') return colors.work;
  return colors.textMuted;
}
