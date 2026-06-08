# AI Executive Assistant - Test Results

## Last Known Stable Commit

`45a1ff1` — alarm personalization (2026-06-06)

Full hash: `45a1ff14cfdd852ad2f60d75a91834f44762db2c`

## Browser / Localhost Tests

### Calendar

- [x] Google Calendar OAuth
- [x] Read events
- [x] Create event
- [x] Move event
- [x] Delete event
- [x] Resolve duplicate/ambiguous events
- [x] Conflict detection
- [x] Time until event
- [x] 30-minute calendar reminder
- [x] Voice calendar reminder

### Local Reminders

- [x] Create reminder: "remind me in 2 minutes"
- [x] Banner appears
- [x] Voice plays
- [x] No Google Calendar API call

### Local Alarms

- [x] Create alarm
- [x] Alarm triggers
- [x] Voice plays
- [x] Snooze 5 minutes works
- [x] Alarm repeats after snooze
- [x] Stop works
- [x] Personalized escalating phrases work
- [x] Phrase localization works

## iPhone Tests

Pending:

- [ ] App launch
- [ ] Google login
- [ ] Calendar read
- [ ] Calendar create
- [ ] Calendar move
- [ ] Calendar delete
- [ ] Calendar 30-minute reminder
- [ ] Local reminder with screen on
- [ ] Local reminder with screen locked
- [ ] Local alarm with screen on
- [ ] Local alarm with screen locked
- [ ] Local alarm when app is backgrounded
- [ ] Local alarm when app is closed

Known concern:
iOS may not allow full voice alarm behavior while app is suspended or terminated.

## Android Tests

Pending:

- [ ] App launch
- [ ] Google login
- [ ] Calendar read
- [ ] Calendar create
- [ ] Calendar move
- [ ] Calendar delete
- [ ] Calendar 30-minute reminder
- [ ] Local reminder with screen on
- [ ] Local reminder with screen locked
- [ ] Local alarm with screen on
- [ ] Local alarm with screen locked
- [ ] Local alarm when app is backgrounded
- [ ] Local alarm when app is closed

Known expectation:
Android should support stronger alarm behavior than iOS, but this must be tested on a real device.

## Bugs Found

Add new bugs here with date, platform, steps, expected result, actual result, and status.

## Regression Checklist Before New Feature Work

- [ ] Calendar read
- [ ] Calendar create
- [ ] Calendar move
- [ ] Calendar delete
- [ ] Calendar reminder
- [ ] Local reminder
- [ ] Local alarm
- [ ] Snooze
