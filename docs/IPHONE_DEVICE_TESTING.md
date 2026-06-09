# iPhone device testing

Physical iPhone testing requires a **development build**. Expo Go does not support the native microphone pipeline (`expo-av` + Whisper).

## Prerequisites

1. **Apple Developer account** (free or paid) for code signing
2. **iPhone** on the same Wi‑Fi as your Mac
3. **Backend running** on your Mac (`npm run dev:backend` from repo root)
4. **Google Cloud iOS OAuth client** for bundle ID `com.aiexecutiveassistant.mobile`
5. **Device env** — `localhost` does not work on a phone

## 1. Configure device environment

Detect your Mac LAN IP:

```bash
ipconfig getifaddr en0
```

Copy the device template and set your IP:

```bash
cd mobile
cp .env.device.example .env
# Edit .env:
#   EXPO_PUBLIC_API_BASE_URL=http://YOUR_LAN_IP:3001/api
#   EXPO_PUBLIC_GOOGLE_CALENDAR_IOS_CLIENT_ID=your-ios-client-id
```

Restart backend after any env change. Keep the phone and Mac on the same network.

## 2. Google Calendar OAuth (iOS)

In [Google Cloud Console](https://console.cloud.google.com/):

1. Create an **iOS** OAuth client
2. Bundle ID: `com.aiexecutiveassistant.mobile`
3. Add the iOS client ID to `EXPO_PUBLIC_GOOGLE_CALENDAR_IOS_CLIENT_ID`

The app redirect URI is `mobile://oauthredirect` (scheme `mobile` in `app.config.ts`).

## 3. Build options

### Option A — EAS cloud build (recommended without Xcode)

This Mac does not have full Xcode installed. Use EAS to build in the cloud and install on your iPhone.

```bash
cd mobile
npx eas-cli login
npx eas-cli build:configure   # first time only; links Expo project
npm run build:ios:preview
```

When the build finishes, open the install link on your iPhone (internal distribution). Register your device UDID when EAS prompts you (requires Apple Developer membership for ad hoc/internal installs).

### Option B — Local Xcode build

Install **Xcode** from the Mac App Store, then:

```bash
cd mobile
npm run prebuild:ios          # generates ios/ if missing
npm run run:ios:device        # USB or wireless device
```

First run: trust the developer certificate on iPhone (**Settings → General → VPN & Device Management**).

## 4. Start backend + verify

From repo root:

```bash
npm run dev:backend
npm run check:backend
```

On the phone, the app must reach `http://YOUR_LAN_IP:3001/api`. If requests fail, check firewall and Wi‑Fi isolation (guest networks often block device-to-laptop traffic).

## 5. Manual test checklist

Track results in [TEST_RESULTS.md](../TEST_RESULTS.md).

Priority scenarios:

- [ ] App launch
- [ ] Google login (iOS client ID)
- [ ] Home voice: record → Whisper → spoken reply
- [ ] Calendar read / create / move / delete
- [ ] Local reminder (screen on)
- [ ] Local alarm + snooze + escalating voice
- [ ] Local alarm with screen locked / backgrounded (iOS limitation — document actual behavior)

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `Not logged in` (EAS) | `npx eas-cli login` |
| No Xcode | Use EAS preview build (Option A) |
| API connection refused on phone | Use LAN IP, not `localhost` |
| Google OAuth fails on iOS | Set `EXPO_PUBLIC_GOOGLE_CALENDAR_IOS_CLIENT_ID` |
| Mic permission denied | Use dev build, not Expo Go |
| Alarm silent when locked | Expected iOS limitation — log in TEST_RESULTS.md |
