/* ─────────────────────────────────────────────────────
   10. NOTIFICATIONS
───────────────────────────────────────────────────── */
function addNotif(userId, type, sessionId, sessionTitle, message, extra = {}) {
  let notifs = getNotifs(userId);

  // Deduplicate reminder bursts (same reminder key/session in a short window).
  if (type === NOTIF_TYPES.REMINDER) {
    const reminderKey = extra.reminderKey || `${sessionId}_${extra.sessionDate || ''}_${extra.sessionTime || ''}`;
    const existing = notifs.find(n =>
      n.type === NOTIF_TYPES.REMINDER &&
      n.sessionId === sessionId &&
      (n.reminderKey || `${n.sessionId}_${n.sessionDate || ''}_${n.sessionTime || ''}`) === reminderKey &&
      !n.archived &&
      (now() - n.timestamp) < REMINDER_DEDUPE_MS
    );
    if (existing) {
      return false;
    }
  }

  // TC-AM-013 (F2): Merge update notifications within 15-minute window
  if (type === NOTIF_TYPES.UPDATE) {
    const recent = notifs.find(n =>
      n.type === NOTIF_TYPES.UPDATE &&
      n.sessionId === sessionId &&
      !n.archived &&
      (now() - n.timestamp) < MERGE_WINDOW_MS
    );
    if (recent) {
      recent.timestamp = now();
      recent.message   = message;
      // Limit to MAX_NOTIFS_STORE
      notifs = notifs.slice(0, MAX_NOTIFS_STORE);
      saveNotifs(userId, notifs);
      refreshNotifUI();
      return false;
    }
  }

  const notif = {
    id:           uid(),
    userId,
    type,
    sessionId,
    sessionTitle,
    message,
    timestamp:    now(),
    read:         false,
    archived:     false,
    archivedAt:   null,
    ...extra,
  };

  notifs.unshift(notif); // TC-AM-014: newest first
  notifs = notifs.slice(0, MAX_NOTIFS_STORE);
  saveNotifs(userId, notifs);
  refreshNotifUI();
  return true;
}

function markAsRead(notifId, userId) {
  const notifs = getNotifs(userId);
  const n = notifs.find(x => x.id === notifId);
  if (n) { n.read = true; saveNotifs(userId, notifs); }
  refreshNotifUI();
}

function markAllRead(userId) {
  const notifs = getNotifs(userId).map(n => ({ ...n, read: true }));
  saveNotifs(userId, notifs);
  refreshNotifUI();
  toast('All notifications marked as read', 'success');
}

// TC-AM-007 (F2): Dismiss → archive state
function dismissNotif(notifId, userId) {
  const notifs = getNotifs(userId);
  const n = notifs.find(x => x.id === notifId);
  if (n) {
    n.archived   = true;
    n.archivedAt = now();
    saveNotifs(userId, notifs);
  }
  refreshNotifUI();
}

function getActiveNotifs(userId) {
  const all = getNotifs(userId);
  // Purge archived notifications older than 90 days
  const pruned = all.filter(n => !n.archived || (now() - n.archivedAt) < ARCHIVE_DAYS_MS);
  if (pruned.length !== all.length) saveNotifs(userId, pruned);
  return pruned
    .filter(n => !n.archived)
    .sort((a, b) => b.timestamp - a.timestamp);
}

function getUnreadCount(userId) {
  return getActiveNotifs(userId).filter(n => !n.read).length;
}

/* ─────────────────────────────────────────────────────
   11. REMINDER SCHEDULING
───────────────────────────────────────────────────── */
function scheduleReminder(session, userId, offsetMs, label) {
  const startMs  = sessionDateTime(session);
  const fireAt   = startMs - offsetMs;
  const delay    = fireAt - now();
  if (delay <= 0) return; // already past

  const timerId = setTimeout(() => {
    const sessions = getSessions();
    const s = sessions.find(x => x.id === session.id);
    if (!s || s.status === 'cancelled') return;
    const msg = `Reminder: "${s.title}" is coming up ${label} on ${formatDate(s.date)} at ${s.startTime}`;
    const created = addNotif(userId, NOTIF_TYPES.REMINDER, s.id, s.title, msg, {
      sessionDate: s.date,
      sessionTime: s.startTime,
      reminderKey: `${s.id}_${label}_${s.date}_${s.startTime}`,
    });
    if (created) {
      toast(`⏰ ${msg}`, 'info', 6000);
    }
    // Refresh reminders panel if on dashboard
    if (currentView === 'dashboard') renderDashboard();
  }, delay);

  // Store timer ref in memory
  const key = `${session.id}_${userId}_${label}`;
  if (remTimers[key]) clearTimeout(remTimers[key]);
  remTimers[key] = timerId;
}

function scheduleRemindersForUser(session, userId) {
  scheduleReminder(session, userId, REMINDER_1H_MS,  'in 1 hour');
  scheduleReminder(session, userId, REMINDER_24H_MS, 'in 24 hours');
}

function sendImmediateReminderIfNeeded(session, userId) {
  if (!session || session.status === 'cancelled') return false;
  const startMs = sessionDateTime(session);
  const timeLeft = startMs - now();
  if (timeLeft <= 0 || timeLeft >= REMINDER_1H_MS) return false;

  const hasReminder = getActiveNotifs(userId).some(n =>
    n.type === NOTIF_TYPES.REMINDER && n.sessionId === session.id
  );
  if (hasReminder) return false;

  return addNotif(userId, NOTIF_TYPES.REMINDER, session.id, session.title,
    `Reminder: "${session.title}" is starting soon on ${formatDate(session.date)} at ${session.startTime}`,
    {
      sessionDate: session.date,
      sessionTime: session.startTime,
      reminderKey: `${session.id}_immediate_${session.date}_${session.startTime}`,
    });
}

function checkAndScheduleReminders() {
  if (!currentUser) return;
  const joined   = getJoined(currentUser.id);
  const sessions = getSessions();
  const hosted   = sessions.filter(s => s.hostId === currentUser.id);

  // Joined sessions
  joined.forEach(sid => {
    const s = sessions.find(x => x.id === sid);
    if (s && s.status !== 'cancelled') scheduleRemindersForUser(s, currentUser.id);
  });

  // Sessions hosted (hosts also get reminders)
  hosted.forEach(s => {
    if (s.status !== 'cancelled') scheduleRemindersForUser(s, currentUser.id);
  });

  // TC-AM-006 (F2): If user joins after a 24h reminder has passed but session hasn't started → immediate reminder
  joined.forEach(sid => {
    const s = sessions.find(x => x.id === sid);
    if (!s || s.status === 'cancelled') return;
    const startMs   = sessionDateTime(s);
    const timeLeft  = startMs - now();
    if (timeLeft > 0 && timeLeft < REMINDER_1H_MS) {
      // Session is within the next hour — send immediate
      const notifs = getActiveNotifs(currentUser.id);
      const hasImmediate = notifs.some(n =>
        n.type === NOTIF_TYPES.REMINDER && n.sessionId === s.id
      );
      if (!hasImmediate) {
        addNotif(currentUser.id, NOTIF_TYPES.REMINDER, s.id, s.title,
          `Reminder: "${s.title}" is starting soon on ${formatDate(s.date)} at ${s.startTime}`,
          {
            sessionDate: s.date,
            sessionTime: s.startTime,
            reminderKey: `${s.id}_immediate_${s.date}_${s.startTime}`,
          });
      }
    }
  });
}

/* ─────────────────────────────────────────────────────
   12. NOTIFICATION UI
───────────────────────────────────────────────────── */
function refreshNotifUI() {
  if (!currentUser) return;
  const unread = getUnreadCount(currentUser.id);
  const badge  = document.getElementById('notif-badge');
  badge.textContent = unread > 99 ? '99+' : unread;
  badge.classList.toggle('hidden', unread === 0);
  document.getElementById('unread-pill').textContent = unread;
  if (!document.getElementById('notif-dropdown').classList.contains('hidden')) {
    renderNotifList();
  }
  // Refresh reminders panel
  if (currentView === 'dashboard') renderReminders();
}

function renderNotifList() {
  if (!currentUser) return;

  const listEl  = document.getElementById('notif-list');
  const emptyEl = document.getElementById('notif-empty');
  const errEl   = document.getElementById('notif-error');

  // TC-AM-010 (F2): Simulate notification load error
  if (flag(STORE.SIM_ERR)) {
    listEl.innerHTML  = '';
    errEl.classList.remove('hidden');
    emptyEl.classList.add('hidden');
    // One-shot behavior: avoid getting stuck in an error state.
    setFlag(STORE.SIM_ERR, false);
    const toggle = document.getElementById('toggle-notif-error');
    if (toggle) toggle.checked = false;
    return;
  }
  errEl.classList.add('hidden');

  let notifs = getActiveNotifs(currentUser.id);
  // Filter by tab
  if (notifTab === 'unread') notifs = notifs.filter(n => !n.read);
  // TC-AM-015 (F2): Max 25 in dropdown
  notifs = notifs.slice(0, MAX_NOTIFS_DROPDOWN);

  if (notifs.length === 0) {
    listEl.innerHTML = '';
    emptyEl.classList.remove('hidden');
    return;
  }
  emptyEl.classList.add('hidden');

  listEl.innerHTML = notifs.map(n => {
    const icon  = NOTIF_ICONS[n.type] || '🔔';
    const cls   = `notif-icon-${n.type}`;
    const isNew = !n.read;
    return `
    <div class="notif-item ${isNew ? 'unread' : ''}" data-notif-id="${n.id}">
      ${isNew ? '<span class="notif-unread-dot"></span>' : '<span style="width:8px"></span>'}
      <div class="notif-item-icon ${cls}">${icon}</div>
      <div class="notif-item-body">
        <div class="notif-item-msg">${sanitize(n.message)}</div>
        <div class="notif-item-time">${timeAgo(n.timestamp)}</div>
        <div class="notif-item-actions">
          <button class="notif-view-btn" data-session-id="${n.sessionId}" data-notif-id="${n.id}">View Session</button>
          ${isNew ? `<button class="notif-dismiss-btn" data-action="mark-read" data-notif-id="${n.id}">Mark read</button>` : ''}
          <button class="notif-dismiss-btn" data-action="dismiss" data-notif-id="${n.id}">Dismiss</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function openNotifDropdown() {
  document.getElementById('notif-dropdown').classList.remove('hidden');
  renderNotifList();
}
function closeNotifDropdown() {
  document.getElementById('notif-dropdown').classList.add('hidden');
}

