import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { GlassCard } from '@/src/components/ui/GlassCard';
import { SectionTitle } from '@/src/components/ui/SectionTitle';
import type { AgendaItem } from '@/src/entities/home/types';
import {
  colors,
  fontSizes,
  fontWeights,
  letterSpacings,
  lineHeights,
  radii,
  spacing,
} from '@/src/theme';

type HomeCalendarWidgetProps = {
  agenda: AgendaItem[];
};

export function HomeCalendarWidget({ agenda }: HomeCalendarWidgetProps) {
  return (
    <GlassCard>
      <SectionTitle
        title="Calendar Summary"
        subtitle="Next 3 priorities"
        icon="calendar-outline"
        iconColor={colors.accentPurple}
        iconBackgroundColor={colors.overlayPurpleSoft}
        rightAccessory={
          <View style={styles.summaryBadge}>
            <Text style={styles.summaryBadgeText}>Focused day</Text>
          </View>
        }
      />

      <View style={styles.agendaList}>
        {agenda.map((item) => (
          <View key={item.time} style={styles.agendaItem}>
            <Text style={styles.agendaTime}>{item.time}</Text>
            <View style={styles.agendaContent}>
              <Text style={styles.agendaTitle}>{item.title}</Text>
              <Text style={styles.agendaDetail}>{item.detail}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.chevron} />
          </View>
        ))}
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  summaryBadge: {
    paddingHorizontal: 12,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
  },
  summaryBadgeText: {
    color: colors.accentSkyBadge,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
  },
  agendaList: {
    gap: spacing.md,
  },
  agendaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  agendaTime: {
    width: 52,
    color: colors.accentBlueSoft,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
    letterSpacing: letterSpacings.tight,
  },
  agendaContent: {
    flex: 1,
    gap: spacing.xs,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceElevated,
  },
  agendaTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
  },
  agendaDetail: {
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    lineHeight: lineHeights.md,
  },
});
