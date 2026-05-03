# AcadeMeet Test Environment

This repository contains the Activity 08 SQA test environment for AcadeMeet. It mirrors the original AcadeMeet front-end project structure and adds a frontend mock API so testers can run the app from GitHub Pages or directly from files without the Spring Boot backend or a database.

## Purpose

- Provide a lightweight, browser-run version of AcadeMeet for System QA Engineers (SQAEs) to validate feature behavior and run acceptance tests.
- Simulate backend interactions (notifications, reminder scheduling, session persistence) using localStorage and seeded test actions.

## How to run

- Locally: open `index.html` in a modern browser. The app is static and requires no server for most tests.
- GitHub Pages: push this repo to GitHub and enable Pages on the `main` branch; the app will run at `https://<org>.github.io/<repo>/`.
- Notes: Some browsers apply strict file:// fetch rules. `index.html` is pre-composed so opening the file directly should work. If you preview fragments (files in `html/`) use `?raw=1` to view them without redirect.

## What SQAEs Should Test

### Feature 1 — Session Creation

- Create public and private sessions (private sessions require a password).
- Validate required fields: title, date, start and end times.
- Date/time validations: future date required; start time must be before end time.
- Location validation: accept free text and common online meeting links (e.g., `https://meet.google.com/...`).
- Participant limits: numeric limits should be enforced and validated.
- Tags: max count and max length enforcement.
- File/notes upload: accepted types and UI behavior when uploading multiple files.

### Feature 2 — Notifications & Reminders

- Notification ordering and unread counts.
- Mark all as read / mark individual as read / dismiss notification.
- Reminders are scheduled when sessions are saved: typical offsets are 24h, 1h, and 10m before start.
- Verify reminders are deduplicated and not shown repeatedly.
- Use Settings → Quick Test Actions to seed notifications for testing.

### Other Areas

- Join/leave session flows and the UX for participants.
- Comments and replies on a session: adding, editing, deleting; threaded replies.
- Session edits and cancellations: triggers for notifications to affected participants.

## Test Checklist (quick)

1. Open `index.html` and log in using a sample account.
2. Create a session with valid data; confirm success toast and that session appears in Sessions view.
3. Toggle "Simulate Network Error" and attempt to create a session — verify error handling and UI.
4. Seed sample notifications and open the notification dropdown — verify unread counts and ordering.
5. Create a private session with a password and confirm a participant must enter the password to join.
6. Verify reminders appear in the Reminders card and that they do not create duplicate toasts.

## SQA Guidance and Notes

- Use the Settings panel's developer controls to simulate network and notification errors for negative-case testing.
- The app persists state in `localStorage` — clear using the provided "Clear All Data" button before regression runs to reset the environment.
- The test environment intentionally simulates backend behavior; it is not a full integration with a real server.

## Known Limitations / Out of Scope

- No server-side persistence: all data is stored in the browser's `localStorage` only.
- External calendar sync, email delivery, and push notifications are simulated and out of scope.
- Authentication is mocked; there is no secure login backend.

## Contributing

- If you add new test utilities or edit sample-data seeds, document them here and update the Settings quick-actions.

## Contact

- For questions about the test harness or to request additional seeded data/features for QA, contact the project maintainer.
