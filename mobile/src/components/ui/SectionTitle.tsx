import type { ReactNode } from 'react';

import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fontSizes, fontWeights, radii, spacing } from '@/src/theme';
import type { IconName } from '@/src/shared/types/icon';

type SectionTitleProps = {
  title: string;
  subtitle?: string;
  icon?: IconName;
  iconColor?: string;
  iconBackgroundColor?: string;
  rightAccessory?: ReactNode;
};

export function SectionTitle({
  title,
  subtitle,
  icon,
  iconColor = colors.textPrimary,
  iconBackgroundColor = colors.surfaceElevated,
  rightAccessory,
}: SectionTitleProps) {
  return (
    <View style={styles.container}>
      {icon ? (
        <View style={[styles.iconWrap, { backgroundColor: iconBackgroundColor }]}>
          <Ionicons name={icon} size={20} color={iconColor} />
        </View>
      ) : null}

      <View style={styles.textWrap}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>

      {rightAccessory}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: {
    flex: 1,
    marginLeft: spacing.md,
    gap: 2,
  },
  title: {
    color: colors.textPrimary,
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.bold,
  },
  subtitle: {
    color: colors.textSubtle,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
  },
});
