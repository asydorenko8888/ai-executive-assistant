import { colors } from '@/src/theme';
import type { ExecutiveProfile, HomeDashboardData } from '@/src/entities/home/types';

export function getHomeDashboardContent(): {
  profile: ExecutiveProfile;
  dashboard: HomeDashboardData;
} {
  console.log('[Calendar Audit] getHomeDashboardContent() — static demo agenda/weather (not Google Calendar)');

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
          text: '3 events today',
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
      agenda: [
        {
          time: '09:00',
          title: 'Board prep',
          detail: 'Review Q3 talking points',
        },
        {
          time: '11:30',
          title: 'Investor sync',
          detail: 'Finalize briefing notes',
        },
        {
          time: '15:00',
          title: 'Leadership 1:1s',
          detail: '3 conversations scheduled',
        },
      ],
    },
  };
}
