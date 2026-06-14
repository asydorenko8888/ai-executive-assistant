# Android custom reminder notification sound

Static voice alert for local reminder push notifications (not dynamic TTS while the app is closed).

**Phrase:** «В мене для тебе є важлива інформація»

## Current setup

| Item | Location / value |
|------|------------------|
| Sound asset (source) | `mobile/assets/sounds/reminder_important_info_uk.wav` |
| Android raw resource name | `reminder_important_info_uk` (basename, no extension) |
| Sound constant | `mobile/src/features/local-scheduling/reminderNotificationSound.ts` |
| Channel creation | `notificationSchedulerService.ts` → `configureAndroidChannels()` |
| Channel id | `reminders_v4` (`LOCAL_REMINDER_NOTIFICATION_CHANNEL_ID`) |
| Notification scheduling | `notificationSchedulerService.ts` → `scheduleOsNotification()` → `scheduleReminder()` |
| Expo plugin (copies WAV to native) | `app.config.ts` → `expo-notifications` → `sounds: [...]` |
| Native API | `expo-notifications` → `Notifications.scheduleNotificationAsync()` with `SchedulableTriggerInputTypes.DATE` |
| Android native scheduling | `AlarmManagerCompat.setExactAndAllowWhileIdle` (Expo `ExpoSchedulingDelegate.kt`) |

## File format and naming

- **Format:** `.wav` recommended (also `.mp3` / `.ogg` may work; WAV is most reliable).
- **Filename rules:** lowercase letters, numbers, underscores only — no spaces, hyphens, or Unicode in the filename.
- **Reference in JS:** pass the basename without extension: `sound: 'reminder_important_info_uk'`.
- **Native location after prebuild:** `android/app/src/main/res/raw/reminder_important_info_uk.wav` (copied automatically by the Expo config plugin).

## Channel vs notification content

On **Android 8+ (API 26+)**, notification **channels** control sound. Both should be set for compatibility:

1. **Channel** (`setNotificationChannelAsync`) — required on API 26+; this is what plays when the phone is locked.
2. **Notification content** (`scheduleNotificationAsync` → `content.sound`) — required on API &lt; 26; Expo docs recommend setting both.

Alarms still use `sound: 'default'`. Only the **Reminders** channel uses the custom file.

## Channel id bump / reinstall

Android **never updates** sound (or vibration/importance) on an existing channel id after first creation.

- Changing sound requires a **new channel id** (currently `reminders_v4`).
- **Metro reload alone is not enough** for the WAV file — the binary must be in the native app bundle.
- **Required after adding or replacing the sound file:**
  1. `npx expo prebuild --platform android` (or EAS build), **or**
  2. `npx expo run:android --device` (dev client rebuild)
- **Reinstall** the app on the device after rebuild so the new channel + raw asset are registered.
- Create a **new reminder** after install (old scheduled notifications may still reference a previous channel id).

## Replace the recording

1. Replace `mobile/assets/sounds/reminder_important_info_uk.wav` (keep the same filename, or update `reminderNotificationSound.ts`, `app.config.ts`, and bump channel id).
2. Rebuild the Android dev client (see above).
3. Reinstall and schedule a fresh reminder.

## Verify on Samsung

1. Settings → Apps → [app] → Notifications → **Reminders** — Sound should show the custom tone (not Silent).
2. After scheduling, check Metro logs: `NOTIFICATION_CHANNEL_ID` → `reminders_v4`.
3. Lock the phone and wait for the reminder — you should hear the bundled phrase, not the system default ping.
