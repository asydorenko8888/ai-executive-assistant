import { colors } from '@/src/theme';
import type { ExecutiveProfile, HomeDashboardData } from '@/src/entities/home/types';

export function getHomeDashboardContent(): {
  profile: ExecutiveProfile;
  dashboard: HomeDashboardData;
} {
  return {
    profile: {
      firstName: 'Andriy',
    },
    dashboard: {
      greeting: 'Good morning',
      subtitle:
        'Your day is aligned, your priorities are surfaced, and your next move is one tap away.',
      quickStats: [
        {
          id: 'brief',
          icon: 'sparkles-outline',
          text: 'Priority brief ready',
          color: colors.accentBlueSoft,
        },
        {
          id: 'events',
          icon: 'time-outline',
          text: '0 events today',
          color: colors.accentPurpleSoft,
        },
      ],
      weather: {
        location: 'Kyiv, Ukraine',
        temperature: '21°',
        conditionIcon: 'partly-sunny-outline',
        metrics: [
          {
            id: 'condition',
            label: 'Condition',
            value: 'Partly cloudy',
          },
          {
            id: 'feels-like',
            label: 'Feels like',
            value: '24°',
          },
          {
            id: 'rain',
            label: 'Rain',
            value: '12%',
          },
        ],
      },
      agenda: [],
    },
  };
}
