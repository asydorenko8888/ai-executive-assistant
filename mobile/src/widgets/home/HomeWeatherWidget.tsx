import { StyleSheet, Text, View } from 'react-native';

import { GlassCard } from '@/src/components/ui/GlassCard';
import { SectionTitle } from '@/src/components/ui/SectionTitle';
import type { WeatherSummary } from '@/src/entities/home/types';
import { colors, fontSizes, fontWeights, letterSpacings, radii } from '@/src/theme';

type HomeWeatherWidgetProps = {
  weather: WeatherSummary;
};

export function HomeWeatherWidget({ weather }: HomeWeatherWidgetProps) {
  const iconColor = weather.needsLocation ? colors.textSubtle : colors.accentGold;
  const iconBackgroundColor = weather.needsLocation ? colors.surfaceElevated : colors.overlayGold;

  return (
    <GlassCard>
      <SectionTitle
        title="Weather"
        subtitle={weather.location}
        icon={weather.conditionIcon}
        iconColor={iconColor}
        iconBackgroundColor={iconBackgroundColor}
        rightAccessory={
          weather.needsLocation || weather.isLoading ? null : (
            <Text style={styles.temperature}>{weather.temperature}</Text>
          )
        }
      />

      {weather.metrics.length > 0 ? (
        <View style={styles.weatherRow}>
          {weather.metrics.map((metric) => (
            <View key={metric.id} style={styles.metricPill}>
              <Text style={styles.metricLabel}>{metric.label}</Text>
              <Text style={styles.metricValue}>{metric.value}</Text>
            </View>
          ))}
        </View>
      ) : null}
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
