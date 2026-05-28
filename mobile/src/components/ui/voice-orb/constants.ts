import { colors } from '@/src/theme';

export const VOICE_ORB_SIZE = 182;
export const VOICE_ORB_CORE_SIZE = 128;

export const voiceOrbPalette = {
  glow: colors.accentBlue,
  glowSoft: colors.accentBlueSoft,
  glowDeep: colors.accentBlueDeep,
  speaking: colors.accentPurpleSoft,
  surface: colors.surface,
  surfaceElevated: colors.surfaceElevated,
  border: colors.borderStrong,
  thinking: 'rgba(148, 163, 184, 0.35)',
} as const;
