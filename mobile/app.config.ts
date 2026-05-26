import type { ConfigContext, ExpoConfig } from 'expo/config';

type AppEnv = {
  APP_ENV: 'development' | 'staging' | 'production';
  EXPO_PUBLIC_APP_NAME: string;
  EXPO_PUBLIC_API_BASE_URL: string;
  EXPO_PUBLIC_OPENAI_BASE_URL: string;
  EXPO_PUBLIC_OPENAI_API_KEY: string;
  EXPO_PUBLIC_ENABLE_REALTIME: boolean;
  EXPO_PUBLIC_REQUEST_TIMEOUT_MS: number;
};

function readAppEnv(source: Record<string, string | undefined>): AppEnv {
  const appEnvironment = source.APP_ENV;
  const requestTimeoutValue = Number(source.EXPO_PUBLIC_REQUEST_TIMEOUT_MS ?? '10000');

  return {
    APP_ENV:
      appEnvironment === 'staging' || appEnvironment === 'production'
        ? appEnvironment
        : 'development',
    EXPO_PUBLIC_APP_NAME: source.EXPO_PUBLIC_APP_NAME || 'AI Executive Assistant',
    EXPO_PUBLIC_API_BASE_URL: source.EXPO_PUBLIC_API_BASE_URL || 'https://api.example.com',
    EXPO_PUBLIC_OPENAI_BASE_URL: source.EXPO_PUBLIC_OPENAI_BASE_URL || 'https://api.openai.com/v1',
    EXPO_PUBLIC_OPENAI_API_KEY: source.EXPO_PUBLIC_OPENAI_API_KEY?.trim() || '',
    EXPO_PUBLIC_ENABLE_REALTIME: source.EXPO_PUBLIC_ENABLE_REALTIME === 'true',
    EXPO_PUBLIC_REQUEST_TIMEOUT_MS:
      Number.isFinite(requestTimeoutValue) && requestTimeoutValue > 0 ? requestTimeoutValue : 10000,
  };
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const appEnv = readAppEnv(process.env);

  return {
    ...config,
    name: appEnv.EXPO_PUBLIC_APP_NAME,
    slug: 'mobile',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    scheme: 'mobile',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    ios: {
      supportsTablet: true,
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/images/adaptive-icon.png',
        backgroundColor: '#ffffff',
      },
      edgeToEdgeEnabled: true,
    },
    web: {
      bundler: 'metro',
      output: 'static',
      favicon: './assets/images/favicon.png',
    },
    plugins: [
      'expo-router',
      [
        'expo-splash-screen',
        {
          image: './assets/images/splash-icon.png',
          imageWidth: 200,
          resizeMode: 'contain',
          backgroundColor: '#ffffff',
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
    },
    extra: {
      ...config.extra,
      env: appEnv,
    },
  };
};
