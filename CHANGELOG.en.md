# Changelog (English)

## 1.6.3 – 23.10.2026
- Fixed: with alarm mode and frequent follow-ups the app could crash after saving and only reopen after “Force stop”

## 1.6.2 – 21.10.2026
- Anonymous usage count: when checking for updates, “active today” is sent at most once a day – without any device ID or personal data; can be turned off under “More → App updates”

## 1.6.1 – 21.10.2026
- Clearer “Today” view: times where everything was taken show “✓ done” instead of “due”; open ones show “open” (with several medications e.g. “open · 1 of 2”)

## 1.6.0 – 20.10.2026
- **Alarm mode** for important medication: the reminder rings full-screen with an alarm sound – even on a locked phone – until you tap “Taken” or “Later” (can be turned on per medication)
- **Reliability check** under “More”: checks notifications, exact alarms, battery optimisation and more, with a button straight to the right setting and a test reminder; a hint on “Today” if reminders are at risk
- **English:** Dosia is now available in English (automatically by system language or under “More → Language”)

## 1.5.1 – 20.10.2026
- New website: **dosia24.de** (updates, download and privacy policy now come from there)

## 1.5.0 – 20.10.2026
- **Repeated follow-ups:** Dosia reminds you again until the dose is checked off or skipped – every 5/10/15/30/60/120 min
  and 1×, 2×, 3×, 5×, 10× or “until checked off” (default); stops at the next dose of the same medication at the latest
- Clearer follow-up reminders (“⏰ Not taken yet … · due since 06:00 · reminder 3”), grouped per dose
- Checking off a dose removes all of its reminders from the notification shade
- “In 10 min” pauses the follow-ups until then
- Updates are checked on every app start

## 1.4.1 – 20.10.2026
- Outdated versions stop being supported after a grace period: first a notice with a date appears,
  then Dosia only offers the update and a backup export (reminders already scheduled keep running)
- The switch under “More → App updates” now only hides the notice about new versions

## 1.4.0 – 20.10.2026
- **Automatic updates:** Dosia looks for new versions on the website, shows “Update available” with the release notes
  and installs at the tap of a button (download, verification, then just confirm “Install” – your data is kept)
- Under “More → App updates”: installed and latest version, “Check for updates”, automatic check can be turned off
- The Google Play version still updates via Google Play only

## 1.3.0 – 19.10.2026
- **“✓ Taken”** and **“⏰ In 10 min”** buttons directly in the notification
  (the app checks off the dose and closes again; with weight tracking it stays open for the dialog)
- **Follow-ups:** another reminder if a dose wasn’t checked off (15/30/60/120 min, can be turned off)
- New frequencies **“every X weeks”** and **“every X months”** (end of month and leap years handled);
  rare frequencies always get their next reminder
- **Stock:** days remaining, a pre-calculated **restock reminder** (once per low phase), notice on “Today”
- Link to the privacy policy under “More”
- Fixed: the emergency contact was never shown – now for doses open for more than 2 hours (with call/text)
- Fixed: “Export backup” did nothing in the app – now via the Android share menu
- Reminders for completed doses disappear from the notification shade

## 1.2.0 – 19.10.2026
- **People & pets:** medication and readings per person/pet, selection at the top of every view
- **Weight with medication:** can be turned on per medication, asked at the first check-off of the day
- Reminders name the person or pet
- Fixed: values with a decimal comma (“12,5”) were not saved
- Fixed: medication without a start date counted days before it was added as “not taken”

## 1.1.1 – 19.10.2026
- More precise error messages for Google sign-in

## 1.1.0 – 19.10.2026
- **Backup to Google Drive** (hidden app folder): connect, back up automatically, restore
- Missing notification permission after restoring on a new phone is detected

## 1.0.2 – 18.10.2026
- Version kept centrally in `package.json`, file names with version number, shown in the app

## 1.0.1 – 18.10.2026
- Fixed: the service worker served outdated code in the app (notifications could not be enabled)

## 1.0.0 – 18.10.2026
- First version: medication, schedules, native reminders, stock, readings, history, backup
