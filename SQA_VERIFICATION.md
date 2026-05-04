# AcadeMeet SQA Verification Notes

These notes map the mock test environment to the updated FSD, TCD clarification log, and test-suite spreadsheets supplied for Activity 08.

## Feature 1: Session Creation

- Required fields: title, date, start/end time, and location are validated.
- Date/time: past dates, past start times, and start-after-end cases are blocked.
- Private sessions: password is required and must be at least 8 characters with uppercase, lowercase, and a number.
- Participant limit: accepts only whole numbers greater than 2 and less than 100.
- Files: accepts `.pdf`, `.docx`, `.txt`, `.jpg`, and `.png`; rejects files over 10MB.
- Tags: maximum 5 tags, maximum 20 characters per tag.
- Online links: common online-meeting entries such as Zoom/Meet/Teams must start with `http://` or `https://`.
- Duplicate submit and simulated save failure are handled by disabling/re-enabling the create button.
- Session overview is displayed in session details.
- Private session details are password-gated for users who are not the host or already joined.
- Full sessions show a FULL badge and disable joining.
- User-entered text is rendered through the sanitizer to prevent script execution.

## Feature 2: Notifications and Reminders

- 1-hour and 24-hour reminders include type, session title, date/time, and a View Session button.
- Host edits notify participants with `Updated session details`.
- Comments and replies create session-linked notifications.
- Hosts receive `New participant joined` notifications.
- Mark read updates the unread badge immediately.
- Dismiss archives notifications; archived entries are retained for 90 days before purge.
- View Session opens the correct session details page.
- Started/expired sessions show the required banner in details.
- Notification load failure can be simulated from Settings and shows the required error message.
- Session cancellation notifies participants.
- Update notifications for the same session merge within 15 minutes.
- Notifications are stored newest first, dropdown display is capped at 25, and total storage is capped at 500.

## QA Seed Helpers

Use Settings -> Quick Test Actions:

- Seed sample sessions: creates public, private, full, and expired sessions.
- Seed notifications: creates reminder, update, comment/reply, join, cancellation, expired-session, and dropdown-cap cases.
