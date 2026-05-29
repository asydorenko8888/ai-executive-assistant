import type { IconName } from '@/src/shared/types/icon';

export type QuickStat = {
  id: string;
  icon: IconName;
  text: string;
  color: string;
};

export type WeatherMetric = {
  id: string;
  label: string;
  value: string;
};

export type WeatherSummary = {
  location: string;
  temperature: string;
  conditionIcon: IconName;
  metrics: WeatherMetric[];
};

export type AgendaItem = {
  id?: string;
  startsAt?: string;
  time: string;
  title: string;
  detail: string;
};

export type HomeDashboardData = {
  greeting: string;
  subtitle: string;
  quickStats: QuickStat[];
  weather: WeatherSummary;
  agenda: AgendaItem[];
};

export type ExecutiveProfile = {
  firstName: string;
};
