/**
 * Brand tokens for React Native.
 *
 * Mirrors brand-kit/tokens.json, which the web app consumes as CSS custom properties. RN uses
 * StyleSheet rather than CSS, so the values are duplicated here by hand — keep the two in step.
 *
 * The screens previously used a lilac palette (#7658ef and friends). DESIGN.md rules the product
 * light-only with no purple, so those are replaced by the ice-blue set the web app now uses.
 *
 * Typography is colour and scale only: Manrope and Noto Sans Thai would need `expo-font` plus the
 * font files added to the app, which is a separate change.
 */
export const colors = {
  canvas: '#ffffff',
  ice: '#f7fbff',
  iceStrong: '#edf4fc',
  surface: 'rgba(255, 255, 255, 0.84)',
  ink: '#0b0e14',
  text: '#111116',
  muted: '#5b6778',
  line: 'rgba(11, 14, 20, 0.1)',
  blue: '#087bff',
  blueStrong: '#0064e8',
  blueSoft: '#e7f2ff',
  teal: '#45c8c0',
  danger: '#b4231d',
  warning: '#9c6b23',
  success: '#2f9e70',
} as const;

export const radii = {
  control: 8,
  card: 16,
  frame: 22,
  pill: 999,
} as const;

export const space = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  6: 24,
  8: 32,
  12: 48,
  16: 64,
  24: 96,
  32: 128,
} as const;

export const motion = {
  fast: 240,
  normal: 360,
} as const;

/** Matches --dd-shadow-float; RN needs the parts spelled out rather than a box-shadow string. */
export const shadowFloat = {
  shadowColor: '#1f4a89',
  shadowOpacity: 0.1,
  shadowRadius: 24,
  shadowOffset: { width: 0, height: 8 },
  elevation: 3,
} as const;

export const theme = { colors, radii, space, motion, shadowFloat };
export default theme;
