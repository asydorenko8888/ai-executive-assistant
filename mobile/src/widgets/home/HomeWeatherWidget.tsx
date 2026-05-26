import { StyleSheet, Text, View } from 'react-native';

import { GlassCard } from '@/src/components/ui/GlassCard';
import { SectionTitle } from '@/src/components/ui/SectionTitle';
import type { WeatherSummary } from '@/src/entities/home/types';
import { colors, fontSizes, fontWeights, letterSpacings, radii } from '@/src/theme';

type HomeWeatherWidgetProps = {
  weather: WeatherSummary;
};

export function HomeWeatherWidget({ weather }: HomeWeatherWidgetProps) {
  return (
    <GlassCard>
      <SectionTitle
        title="Weather"
        subtitle={weather.location}
        icon={weather.conditionIcon}
        iconColor={colors.accentGold}
        iconBackgroundColor={colors.overlayGold}
        rightAccessory={<Text style={styles.temperature}>{weather.temperature}</Text>}
      />

      <View style={styles.weatherRow}>
        {weather.metrics.map((metric) => (
          <View key={metric.id} style={styles.metricPill}>
            <Text style={styles.metricLabel}>{metric.label}</Text>
            <Text style={styles.metricValue}>{metric.value}</Text>
          </View>
        ))}
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  temperature: {
    color: colors.textPrimary,
    fontSize: fontSizes['3xl'],
    fontWeight: fontWeights.extrabold,
  },
  weatherRow: {
    flexDirection: 'row',
    gap: 10,
  },
  metricPill: {
    flex: 1,
    gap: 6,
    borderRadius: radii.lg,
    padding: 14,
    backgroundColor: colors.surfaceElevated,
  },
  metricLabel: {
    color: colors.textSubtle,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
    textTransform: 'uppercase',
    letterSpacing: letterSpacings.normal,
  },
  metricValue: {
    color: colors.textSecondary,
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
  },
});
