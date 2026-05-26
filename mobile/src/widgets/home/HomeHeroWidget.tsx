import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { GlassCard } from '@/src/components/ui/GlassCard';
import type { QuickStat } from '@/src/entities/home/types';
import {
  colors,
  fontSizes,
  fontWeights,
  letterSpacings,
  lineHeights,
  radii,
  spacing,
} from '@/src/theme';

type HomeHeroWidgetProps = {
  greeting: string;
  firstName: string;
  subtitle: string;
  quickStats: QuickStat[];
};

export function HomeHeroWidget({
  greeting,
  firstName,
  subtitle,
  quickStats,
}: HomeHeroWidgetProps) {
  return (
    <GlassCard style={styles.heroPanel} topAccessory={<HeroGlow />}>
      <Text style={styles.kicker}>AI Executive Assistant</Text>
      <Text style={styles.greeting}>
        {greeting}, {firstName}
      </Text>
      <Text style={styles.subtitle}>{subtitle}</Text>

      <View style={styles.badgeRow}>
        {quickStats.map((item) => (
          <View key={item.id} style={styles.badge}>
            <Ionicons name={item.icon} size={16} color={item.color} />
            <Text style={styles.badgeText}>{item.text}</Text>
          </View>
        ))}
      </View>
    </GlassCard>
  );
}

function HeroGlow() {
  return (
    <>
      <View style={styles.heroGlowPrimary} />
      <View style={styles.heroGlowSecondary} />
    </>
  );
}

const styles = StyleSheet.create({
  heroPanel: {
    overflow: 'hidden',
    borderRadius: radii['2xl'],
    padding: spacing['2xl'],
    gap: 14,
    borderColor: colors.overlayBorder,
  },
  heroGlowPrimary: {
    position: 'absolute',
    top: -40,
    right: -20,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: colors.overlayBlue,
  },
  heroGlowSecondary: {
    position: 'absolute',
    bottom: -70,
    left: -30,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: colors.overlayPurple,
  },
  kicker: {
    color: colors.accentBlueSoft,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
    letterSpacing: letterSpacings.wide,
    textTransform: 'uppercase',
  },
  greeting: {
    color: colors.textPrimary,
    fontSize: fontSizes['4xl'],
    fontWeight: fontWeights.extrabold,
    lineHeight: lineHeights.xl,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: fontSizes.lg,
    lineHeight: lineHeights.lg,
    maxWidth: '92%',
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radii.pill,
    backgroundColor: colors.overlaySurface,
    borderWidth: 1,
    borderColor: colors.overlaySky,
  },
  badgeText: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
  },
});
