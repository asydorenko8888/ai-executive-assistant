export type TravelMode = 'driving' | 'walking' | 'transit' | 'rideshare';

export type TrafficLevel = 'light' | 'moderate' | 'heavy';

export type RouteProvider = 'google_maps' | 'apple_maps' | 'mapbox';

export type RouteAwareness = {
  destinationLabel: string;
  travelMode: TravelMode;
  suggestedDepartureAt?: string;
  estimatedDurationMinutes: number;
  trafficLevel: TrafficLevel;
  summary: string;
};
