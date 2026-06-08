# AI Executive Assistant - Project State

## Current Product Vision

Personal voice executive assistant with calendar, reminders, alarms, future Gmail, travel-time intelligence, and morning briefing.

## Product Direction

**Primary market:** USA

**Target platform priority:**

1. iPhone
2. Android

**Critical differentiator:** Voice-first executive assistant that proactively speaks reminders, alarms, calendar events, and future travel notifications.

**Success criteria:** User can put the phone away and receive spoken reminders without opening the app.

## Current Tech Stack

- React Native / Expo
- Node.js backend
- Google Calendar API
- Local reminder engine
- Local alarm engine
- Voice / TTS
- Cursor development workflow

## Working Features

- Voice interaction works
- Google Calendar OAuth works
- Calendar read works
- Create calendar event works
- Move/reschedule calendar event works
- Delete calendar event works
- Calendar conflict detection works
- Calendar ambiguity clarification works
- Time-until-event questions work
- Google Calendar reminder: 30 minutes before event
- Local reminders work: "remind me in N minutes/seconds"
- Local alarm works
- Alarm snooze works
- Alarm voice personalization by snooze count works
- Alarm phrase localization works

## Known Limitations

- iOS background execution may block the core success criteria (spoken alerts without opening the app)
- Android may support stronger background alarm behavior
- No user profile system yet
- No persistent user name/profile yet
- No recurring events yet
- No Gmail integration yet
- No travel-time intelligence yet
- No production iPhone/Android build testing yet

## Architecture Decisions

- Calendar events use Google Calendar
- Calendar reminders use Google Calendar reminder field with one popup 30 minutes before event
- Local reminders are separate from Google Calendar
- Local alarms are separate from Google Calendar
- Alarm Engine and Reminder Engine are separate systems
- User profile/personalization is postponed
- Calendar is frozen except critical bugs

## Next Priorities

1. Test on real iPhone
2. Test on real Android
3. Fix platform-specific limitations
4. Add recurring calendar events
5. Add user profile
6. Add Gmail integration
7. Add travel-time intelligence
8. Add morning briefing

## Rules for Future Cursor Work

- Do not refactor stable calendar code unless fixing a confirmed bug
- Do not mix unrelated features in one prompt
- Every major feature must have regression tests
- Every user-facing "done" message must be based on verified execution
- Calendar, reminders, and alarms must stay separate modules
