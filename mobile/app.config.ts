import type { ConfigContext, ExpoConfig } from 'expo/config';

// CommonJS helper — app.config must not import aliased src/ modules during prebuild.
const {
  buildGoogleCalendarAndroidIntentFilters,
  GOOGLE_CALENDAR_ANDROID_PACKAGE,
  resolveGoogleCalendarAndroidOAuthScheme,
} = require('./googleCalendarAndroidApp.config.js') as typeof import('./googleCalendarAndroidApp.config.js');

type AppEnv = {
  APP_ENV: 'development' | 'staging' | 'production';
  EXPO_PUBLIC_APP_NAME: string;
  EXPO_PUBLIC_API_BASE_URL: string;
  EXPO_PUBLIC_ENABLE_REALTIME: boolean;
  EXPO_PUBLIC_REQUEST_TIMEOUT_MS: number;
  EXPO_PUBLIC_GOOGLE_CALENDAR_ENABLED: boolean;
  EXPO_PUBLIC_GOOGLE_CALENDAR_WEB_CLIENT_ID: string;
  EXPO_PUBLIC_GOOGLE_CALENDAR_ANDROID_CLIENT_ID: string;
  EXPO_PUBLIC_GOOGLE_CALENDAR_IOS_CLIENT_ID: string;
  EXPO_PUBLIC_APP_API_KEY: string;
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
    EXPO_PUBLIC_API_BASE_URL: source.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:3001/api',
    EXPO_PUBLIC_ENABLE_REALTIME: source.EXPO_PUBLIC_ENABLE_REALTIME === 'true',
    EXPO_PUBLIC_REQUEST_TIMEOUT_MS:
      Number.isFinite(requestTimeoutValue) && requestTimeoutValue > 0 ? requestTimeoutValue : 10000,
    EXPO_PUBLIC_GOOGLE_CALENDAR_ENABLED: source.EXPO_PUBLIC_GOOGLE_CALENDAR_ENABLED === 'true',
    EXPO_PUBLIC_GOOGLE_CALENDAR_WEB_CLIENT_ID: source.EXPO_PUBLIC_GOOGLE_CALENDAR_WEB_CLIENT_ID || '',
    EXPO_PUBLIC_GOOGLE_CALENDAR_ANDROID_CLIENT_ID:
      source.EXPO_PUBLIC_GOOGLE_CALENDAR_ANDROID_CLIENT_ID || '',
    EXPO_PUBLIC_GOOGLE_CALENDAR_IOS_CLIENT_ID: source.EXPO_PUBLIC_GOOGLE_CALENDAR_IOS_CLIENT_ID || '',
    EXPO_PUBLIC_APP_API_KEY: source.EXPO_PUBLIC_APP_API_KEY || '',
  };
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const appEnv = readAppEnv(process.env);
  const googleAndroidOAuthScheme = resolveGoogleCalendarAndroidOAuthScheme(
    appEnv.EXPO_PUBLIC_GOOGLE_CALENDAR_ANDROID_CLIENT_ID,
  );

  return {
    ...config,
    name: appEnv.EXPO_PUBLIC_APP_NAME,
    slug: 'mobile',
    owner: 'andriysydorenko',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.aiexecutiveassistant.mobile',
      scheme: 'mobile',
      infoPlist: {
        NSMicrophoneUsageDescription:
          'Microphone access is used for voice commands and executive assistant conversations.',
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/images/adaptive-icon.png',
        backgroundColor: '#ffffff',
      },
      edgeToEdgeEnabled: true,
      package: GOOGLE_CALENDAR_ANDROID_PACKAGE,
      ...(googleAndroidOAuthScheme ? { scheme: googleAndroidOAuthScheme } : {}),
      intentFilters: buildGoogleCalendarAndroidIntentFilters(
        appEnv.EXPO_PUBLIC_GOOGLE_CALENDAR_ANDROID_CLIENT_ID,
      ),
      permissions: [
        'android.permission.POST_NOTIFICATIONS',
        'android.permission.SCHEDULE_EXACT_ALARM',
        'android.permission.USE_EXACT_ALARM',
        'android.permission.VIBRATE',
        'android.permission.WAKE_LOCK',
        'android.permission.RECEIVE_BOOT_COMPLETED',
      ],
    },
    web: {
      bundler: 'metro',
      // SPA mode: direct URLs like /google-calendar-callback are handled client-side (required for OAuth).
      output: 'single',
      favicon: './assets/images/favicon.png',
    },
    plugins: [
      [
        'expo-router',
        {
          origin: process.env.EXPO_PUBLIC_WEB_ORIGIN ?? 'http://localhost:8081',
        },
      ],
      'expo-av',
      'expo-secure-store',
      [
        'expo-splash-screen',
        {
          image: './assets/images/splash-icon.png',
          imageWidth: 200,
          resizeMode: 'contain',
          backgroundColor: '#ffffff',
        },
      ],
      [
        'expo-notifications',
        {
          icon: './assets/images/icon.png',
          color: '#ffffff',
          sounds: ['./assets/sounds/reminder_important_info_uk.wav'],
        },
      ],
      'expo-task-manager',
    ],
    experiments: {
      typedRoutes: true,
    },
    extra: {
      ...config.extra,
      env: appEnv,
      eas: {
        projectId: '766748f4-42ba-460e-a22b-5d2c3765466a',
      },
    },
  };
};
