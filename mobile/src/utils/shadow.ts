import { Platform, type ViewStyle } from 'react-native';

type ShadowOptions = {
  color: string;
  opacity: number;
  radius: number;
  offsetY?: number;
  elevation?: number;
};

export function createShadow({
  color,
  opacity,
  radius,
  offsetY = 0,
  elevation = 0,
}: ShadowOptions): ViewStyle {
  return Platform.select<ViewStyle>({
    ios: {
      shadowColor: color,
      shadowOpacity: opacity,
      shadowRadius: radius,
      shadowOffset: { width: 0, height: offsetY },
    },
    default: {
      elevation,
    },
  }) ?? {};
}
