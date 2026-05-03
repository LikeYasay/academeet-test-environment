/* ─────────────────────────────────────────────────────
   13. SESSION CREATION — VALIDATION
───────────────────────────────────────────────────── */
function setErr(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  if (msg) { el.textContent = '⚠ ' + msg; el.classList.remove('hidden'); }
  else       { el.classList.add('hidden'); }
}
function clearAllErrors() {
  ['err-title','err-datetime','err-location','err-password','err-limit','err-tags','err-files'].forEach(id => setErr(id,''));
}
function setInputError(inputId, hasError) {
  const el = document.getElementById(inputId);
  if (el) el.classList.toggle('error', hasError);
}

function validateSession(data) {
  let valid = true;
  clearAllErrors();

  // TC-AM-002: Empty title
  if (!data.title.trim()) {
    setErr('err-title', 'Session title is required.'); setInputError('f-title',true); valid = false;
  } else {
    setInputError('f-title', false);
  }

  // TC-AM-003: Past date
  if (!data.date) {
    setErr('err-datetime', 'Date is required.'); valid = false;
  } else {
    const today = new Date().toISOString().slice(0,10);
    if (data.date < today) {
      setErr('err-datetime', 'Date must be today or a future date.'); valid = false;
    } else if (!data.startTime || !data.endTime) {
      setErr('err-datetime', 'Start time and end time are required.'); valid = false;
    } else {
      const startAt = new Date(`${data.date}T${data.startTime}`);
      if (Number.isNaN(startAt.getTime())) {
        setErr('err-datetime', 'Enter a valid date and start time.'); valid = false;
      } else if (startAt.getTime() <= now()) {
        setErr('err-datetime', 'Session date and time must be in the future.'); valid = false;
      } else if (data.startTime >= data.endTime) {
        setErr('err-datetime', 'Start time must be earlier than end time.'); valid = false;
      }
    }
  }

  // TC-AM-005: Empty location
  if (!data.location.trim()) {
    setErr('err-location', 'Location or link is required.'); setInputError('f-location',true); valid = false;
  } else {
    setInputError('f-location', false);
    // TC-AM-014: URL validation
    const loc = data.location.trim();
    if (loc.includes('://') && !loc.startsWith('http://') && !loc.startsWith('https://')) {
      setErr('err-location', 'URL must start with http:// or https://'); setInputError('f-location',true); valid = false;
    }
  }

  // TC-AM-006: Private without password
  if (data.visibility === 'private') {
    if (!data.password) {
      setErr('err-password', 'Private sessions require a password.'); setInputError('f-password',true); valid = false;
    } else {
      // TC-AM-007: Invalid password format
      const pwOk = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d).{8,}$/.test(data.password);
      if (!pwOk) {
        setErr('err-password', 'Password must be at least 8 characters with 1 uppercase, 1 lowercase, and 1 number.');
        setInputError('f-password',true); valid = false;
      } else { setInputError('f-password', false); }
    }
  }

  // TC-AM-008, TC-AM-009: Participant limit
  if (data.participantLimit !== '') {
    const lim = Number(data.participantLimit);
    if (isNaN(lim) || !Number.isInteger(lim)) {
      setErr('err-limit', 'Participant limit must be a whole number.'); setInputError('f-limit',true); valid = false;
    } else if (lim <= 2 || lim >= 100) {
      setErr('err-limit', 'Participant limit must be greater than 2 and less than 100.'); setInputError('f-limit',true); valid = false;
    } else { setInputError('f-limit', false); }
  }

  return valid;
}

/* ─────────────────────────────────────────────────────
   14. SESSION CREATION — SAVE
───────────────────────────────────────────────────── */
function saveSession(data) {
  if (!currentUser) return null;
  const sessions = getSessions();
  const session  = {
    id:             uid(),
    title:          data.title.trim(),
    date:           data.date,
    startTime:      data.startTime,
    endTime:        data.endTime,
    location:       data.location.trim(),
    visibility:     data.visibility,
    password:       data.password || '',
    participantLimit: data.participantLimit ? parseInt(data.participantLimit) : null,
    description:    (data.description || '').trim(),
    tags:           (data.tags || []).map(t => t.trim()).filter(Boolean),
    files:          data.files || [],
    hostId:         currentUser.id,
    hostName:       currentUser.name,
    participants:   [],
    comments:       [],
    createdAt:      now(),
    updatedAt:      now(),
    status:         'active',
    hue:            SESSION_HUES[Math.floor(Math.random() * SESSION_HUES.length)],
  };
  sessions.push(session);
  saveSessions(sessions);

  // Schedule reminders for the host
  scheduleRemindersForUser(session, currentUser.id);

  return session;
}

/* ─────────────────────────────────────────────────────
   15. RENDER: CREATE FORM
───────────────────────────────────────────────────── */
function renderCreateForm() {
  editingTags  = [];
  editingFiles = [];
  clearAllErrors();

  // Reset form
  ['f-title','f-date','f-start-time','f-end-time','f-location','f-password','f-overview'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.querySelector('input[name="visibility"][value="public"]').checked = true;
  document.getElementById('password-group').classList.add('hidden');
  document.getElementById('tags-chips').innerHTML = '';
  document.getElementById('tags-wrapper').querySelectorAll('.tags-input').forEach(i => i.value = '');
  if (document.getElementById('f-limit')) document.getElementById('f-limit').value = '';
  document.getElementById('files-list').innerHTML = '';
  document.getElementById('overview-count').textContent = '0 characters';

  // Set min date to today
  const todayStr = new Date().toISOString().slice(0,10);
  document.getElementById('f-date').min = todayStr;
}

/* ─────────────────────────────────────────────────────
   16. RENDER: DASHBOARD
───────────────────────────────────────────────────── */
function renderDashboard() {
  const sessions = getSessions().filter(s => s.status !== 'cancelled');
  const grid = document.getElementById('trending-sessions');
  if (sessions.length === 0) {
    grid.innerHTML = '<div class="sessions-empty-state">No sessions yet. <a style="color:var(--accent-bright);cursor:pointer" id="dash-create-link">Create one!</a></div>';
    document.getElementById('dash-create-link')?.addEventListener('click', () => navigate('create'));
    return;
  }
  grid.innerHTML = sessions.map(s => buildSessionCard(s, true)).join('');
  attachCardListeners(grid);
  renderReminders();
}

function renderReminders() {
  if (!currentUser) return;
  const listEl  = document.getElementById('reminders-list');
  const sessions = getSessions();
  const joined  = getJoined(currentUser.id);
  const hosted  = sessions.filter(s => s.hostId === currentUser.id);
  const allMine = [...new Set([...joined, ...hosted.map(s => s.id)])]
    .map(sid => sessions.find(s => s.id === sid))
    .filter(Boolean)
    .filter(s => s.status !== 'cancelled' && !isSessionExpired(s))
    .sort((a, b) => sessionDateTime(a) - sessionDateTime(b));

  if (allMine.length === 0) {
    listEl.innerHTML = '<p class="reminders-empty">No upcoming reminders</p>';
    return;
  }

  listEl.innerHTML = allMine.slice(0,5).map(s => `
    <div class="reminder-item">
      <div class="reminder-icon">⏰</div>
      <div class="reminder-text">
        <div class="reminder-title">${sanitize(s.title)}</div>
        <div class="reminder-time">${formatDateFriendly(s.date)} · ${s.startTime}</div>
      </div>
    </div>
  `).join('');
}

/* ─────────────────────────────────────────────────────
   17. RENDER: SESSIONS LIST
───────────────────────────────────────────────────── */
function renderSessions() {
  if (!currentUser) return;
  const all      = getSessions();
  const joined   = getJoined(currentUser.id);
  const grid     = document.getElementById('sessions-list');

  let list;
  if (sessionTab === 'available') {
    list = all.filter(s =>
      s.status !== 'cancelled' &&
      s.hostId !== currentUser.id &&
      !joined.includes(s.id)
    );
  } else {
    list = all.filter(s =>
      joined.includes(s.id) ||
      (s.hostId === currentUser.id && s.status !== 'cancelled')
    );
  }

  if (list.length === 0) {
    grid.innerHTML = `<div class="sessions-empty-state">${sessionTab === 'available' ? 'No available sessions.' : 'No joined sessions yet.'}</div>`;
    return;
  }
  grid.innerHTML = list.map(s => buildSessionCard(s, false)).join('');
  attachCardListeners(grid);
}

/* ─────────────────────────────────────────────────────
   18. SESSION CARD BUILDER
───────────────────────────────────────────────────── */
function buildSessionCard(session, showJoin) {
  const isFull    = session.participantLimit &&
                    session.participants.length >= session.participantLimit;
  const isCancelled = session.status === 'cancelled';
  const isHost    = currentUser && session.hostId === currentUser.id;
  const hasJoined = currentUser && getJoined(currentUser.id).includes(session.id);
  const isPrivate = session.visibility === 'private';
  const tagsHtml  = (session.tags || []).map(t => `<span class="tag-chip">${sanitize(t)}</span>`).join('');

  let statusClass = isCancelled ? 'status-cancelled' : isFull ? 'status-full' : 'status-active';
  let statusLabel = isCancelled ? 'Cancelled' : isFull ? 'Full' : 'Active';

  let footerBtns = '';
  if (!isCancelled && showJoin && !isHost && !hasJoined) {
    footerBtns = `<button class="btn btn-sm btn-primary session-join-btn" data-id="${session.id}" style="margin-top:10px;width:100%">${isFull ? 'Full' : 'Join'}</button>`;
    if (isFull) footerBtns = `<button class="btn btn-sm btn-outline" disabled style="margin-top:10px;width:100%;opacity:0.5;cursor:not-allowed">Full</button>`;
  }

  const participantsStr = session.participantLimit
    ? `${session.participants.length}/${session.participantLimit} participants`
    : `${session.participants.length} participant${session.participants.length !== 1 ? 's' : ''}`;

  return `
  <div class="session-card" data-id="${session.id}" style="--hue:${session.hue || 260}">
    <div class="session-card-thumb">
      <div class="session-card-thumb-inner"></div>
      <span class="session-card-status ${statusClass}">${statusLabel}</span>
      ${isPrivate ? '<span class="session-privacy-badge">🔒 Private</span>' : ''}
      ${isFull    ? '<span class="badge badge-full" style="position:absolute;bottom:8px;right:8px">FULL</span>' : ''}
    </div>
    <div class="session-card-body">
      <div class="session-card-title">${sanitize(session.title)}</div>
      <div class="session-card-meta">
        <div class="session-meta-row">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
          ${formatDateFriendly(session.date)}
        </div>
        <div class="session-meta-row">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
          ${session.startTime} - ${session.endTime}
        </div>
        <div class="session-meta-row">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="10" r="3"/><path d="M12 2a8 8 0 0 0-8 8c0 5.4 7.05 11.5 7.35 11.76a1 1 0 0 0 1.3 0C13 21.5 20 15.4 20 10a8 8 0 0 0-8-8z"/></svg>
          ${sanitize(session.location)}
        </div>
      </div>
      <div class="session-card-tags">${tagsHtml}</div>
      <div class="participants-count">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        ${participantsStr}
      </div>
      ${footerBtns}
    </div>
  </div>`;
}

function attachCardListeners(container) {
  container.querySelectorAll('.session-card').forEach(card => {
    const id = card.dataset.id;
    // Card body (not join button) → details
    card.addEventListener('click', e => {
      if (e.target.classList.contains('session-join-btn')) return;
      const s = getSessions().find(x => x.id === id);
      if (s) navigate('details', s);
    });
    // Join button
    const joinBtn = card.querySelector('.session-join-btn');
    if (joinBtn) {
      joinBtn.addEventListener('click', e => {
        e.stopPropagation();
        handleJoin(id);
      });
    }
  });
}

/* ─────────────────────────────────────────────────────
   19. JOINING A SESSION
───────────────────────────────────────────────────── */
function handleJoin(sessionId) {
  const sessions = getSessions();
  const session  = sessions.find(s => s.id === sessionId);
  if (!session) return;

  // TC-AM-019: Full check
  if (session.participantLimit && session.participants.length >= session.participantLimit) {
    toast('This session is full.', 'error'); return;
  }

  if (session.visibility === 'private') {
    openModal(`
      <h3 class="modal-title">🔒 Private Session</h3>
      <p class="modal-desc">Enter the session password to join <strong>${sanitize(session.title)}</strong></p>
      <div class="modal-form-group">
        <label class="modal-label">Password</label>
        <input type="password" id="join-password-input" class="form-input" placeholder="Enter password">
      </div>
      <div class="modal-actions">
        <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="confirmJoin('${sessionId}')">Join</button>
      </div>
    `);
  } else {
    doJoin(sessionId);
  }
}

function confirmJoin(sessionId) {
  const pw  = document.getElementById('join-password-input')?.value || '';
  const sessions = getSessions();
  const session  = sessions.find(s => s.id === sessionId);
  if (!session) { closeModal(); return; }

  if (pw !== session.password) {
    toast('Incorrect password.', 'error'); return;
  }
  closeModal();
  doJoin(sessionId);
}

function doJoin(sessionId) {
  if (!requireCurrentUser('join a session')) return;
  const sessions = getSessions();
  const session  = sessions.find(s => s.id === sessionId);
  if (!session) return;

  // Already joined
  const joined = getJoined(currentUser.id);
  if (joined.includes(sessionId)) { toast('You have already joined this session.', 'info'); return; }

  // Add to participants
  if (!session.participants.includes(currentUser.id)) {
    session.participants.push(currentUser.id);
    session.updatedAt = now();
    saveSessions(sessions);
  }

  // Update joined list
  joined.push(sessionId);
  saveJoined(currentUser.id, joined);

  // Join confirmation notification
  addNotif(currentUser.id, NOTIF_TYPES.JOINED, session.id, session.title,
    `You have successfully joined "${session.title}"`);

  // TC-AM-005 (F2): Notify host about new participant
  addNotif(session.hostId, NOTIF_TYPES.JOINED, session.id, session.title,
    `${currentUser.name} joined your session "${session.title}"`);

  // Schedule reminders for this user
  scheduleRemindersForUser(session, currentUser.id);

  toast(`Joined "${session.title}" successfully!`, 'success');
  renderSessions();
  refreshNotifUI();
}

/* ─────────────────────────────────────────────────────
   20. RENDER: SESSION DETAILS
───────────────────────────────────────────────────── */
function renderSessionDetails(session) {
  currentSession = session;
  const sessions = getSessions();
  const s = sessions.find(x => x.id === session.id) || session; // fresh data
  currentSession = s;

  const isHost     = currentUser && s.hostId === currentUser.id;
  const isExpired  = isSessionExpired(s);
  const isStarted  = isSessionStarted(s);
  const isFull     = s.participantLimit && s.participants.length >= s.participantLimit;
  const hasJoined  = currentUser && getJoined(currentUser.id).includes(s.id);

  // Action buttons in topbar
  const btnGroup = document.getElementById('details-btn-group');
  if (isHost) {
    btnGroup.innerHTML = `
      <button class="btn btn-danger btn-sm" id="delete-session-btn">🗑 Trash</button>
      <button class="btn btn-primary btn-sm" id="edit-session-btn">✏️ Edit Session</button>`;
    document.getElementById('delete-session-btn').onclick = () => confirmDeleteSession(s.id);
    document.getElementById('edit-session-btn').onclick   = () => openEditSession(s.id);
  } else {
    if (hasJoined || s.status === 'cancelled') {
      btnGroup.innerHTML = '';
    } else {
      btnGroup.innerHTML = `<button class="btn btn-primary btn-sm ${isFull ? 'btn-outline' : ''}" id="join-from-details-btn" ${isFull ? 'disabled' : ''}>${isFull ? 'Full' : '+ Join Session'}</button>`;
      if (!isFull) document.getElementById('join-from-details-btn').onclick = () => handleJoin(s.id);
    }
  }

  const tagsHtml = (s.tags || []).map(t => `<span class="tag-chip-sm">${sanitize(t)}</span>`).join(' ');
  const filesHtml = (s.files || []).map(f => `
    <div class="notes-file-item">
      <span>${f.ext === '.pdf' ? '📄' : f.ext === '.jpg' || f.ext === '.png' ? '🖼' : '📝'}</span>
      <span>${sanitize(f.name)}</span>
      <span style="margin-left:auto;color:var(--text-muted);font-size:11px">${f.sizeLabel}</span>
    </div>`).join('');

  const isUrl = s.location.startsWith('http://') || s.location.startsWith('https://');
  const locHtml = isUrl
    ? `<a href="${sanitize(s.location)}" target="_blank" rel="noopener">${sanitize(s.location)}</a>`
    : sanitize(s.location);

  const expiredBanner = (isExpired || isStarted)
    ? `<div class="session-expired-banner">
         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
         ${isExpired ? 'This session has expired.' : 'This session has already started.'}
       </div>`
    : '';

  const cancelledBanner = s.status === 'cancelled'
    ? `<div class="session-expired-banner">🚫 This session has been cancelled.</div>`
    : '';

  const participantsCountHtml = `
    <div class="participants-count">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
      ${s.participantLimit
        ? `${s.participants.length}/${s.participantLimit} participants${isFull ? ' — <b style="color:var(--amber)">FULL</b>' : ''}`
        : `${s.participants.length} participant${s.participants.length !== 1 ? 's' : ''}`}
    </div>`;

  const body = document.getElementById('session-detail-body');
  body.innerHTML = `
    ${expiredBanner}${cancelledBanner}
    <h2 style="font-family:var(--font-display);font-size:22px;font-weight:800;margin-bottom:4px">${sanitize(s.title)}</h2>
    <p style="font-size:12px;color:var(--text-muted);margin-bottom:20px">Created by ${sanitize(s.hostName)} · Last updated ${timeAgo(s.updatedAt)}</p>
    <div class="session-detail-layout">
      <!-- LEFT: Session Details -->
      <div class="detail-card">
        <div class="detail-card-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
          Session Details
        </div>
        ${participantsCountHtml}
        <div class="session-meta-list">
          <div class="session-meta-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
            ${formatDateFriendly(s.date)}
          </div>
          <div class="session-meta-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
            ${s.startTime} – ${s.endTime}
          </div>
          <div class="session-meta-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="10" r="3"/><path d="M12 2a8 8 0 0 0-8 8c0 5.4 7.05 11.5 7.35 11.76a1 1 0 0 0 1.3 0C13 21.5 20 15.4 20 10a8 8 0 0 0-8-8z"/></svg>
            ${locHtml}
          </div>
          <div class="session-meta-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
            ${sanitize(s.hostName)}
          </div>
        </div>
        <div class="session-badges mt-12">
          <span class="badge ${s.visibility === 'public' ? 'badge-public' : 'badge-private'}">${s.visibility === 'public' ? '🌐 Public' : '🔒 Private'}</span>
          ${isFull ? '<span class="badge badge-full">FULL</span>' : ''}
          ${s.status === 'cancelled' ? '<span class="badge badge-cancelled">Cancelled</span>' : ''}
        </div>
        ${s.tags && s.tags.length ? `<div class="mt-12" style="display:flex;gap:5px;flex-wrap:wrap">Tags: ${tagsHtml}</div>` : ''}
        ${s.files && s.files.length ? `
          <div class="mt-12">
            <div style="font-size:12px;color:var(--text-muted);margin-bottom:6px">Session Notes (${s.files.length})</div>
            ${filesHtml}
          </div>` : ''}
      </div>
      <!-- MIDDLE: Overview -->
      <div class="detail-card">
        <div class="detail-card-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          Session Overview
        </div>
        ${s.description
          ? `<p class="overview-text">${sanitize(s.description).replace(/\n/g,'<br>')}</p>`
          : '<p style="color:var(--text-muted);font-size:13px">No overview provided.</p>'}
      </div>
      <!-- RIGHT: Comments -->
      <div class="detail-card">
        <div class="detail-card-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          Comments
        </div>
        <div class="comment-form">
          <textarea class="comment-input" id="comment-input" placeholder="Add a comment..."></textarea>
          <button class="btn btn-primary btn-sm" id="post-comment-btn">Post Comment</button>
        </div>
        <div id="comments-list"></div>
      </div>
    </div>`;

  renderComments(s);

  document.getElementById('post-comment-btn')?.addEventListener('click', () => postComment(s.id));
}

/* ─────────────────────────────────────────────────────
   21. COMMENTS
───────────────────────────────────────────────────── */
function renderComments(session) {
  const list = document.getElementById('comments-list');
  if (!list) return;
  const comments = session.comments || [];
  if (comments.length === 0) {
    list.innerHTML = '<p style="color:var(--text-muted);font-size:13px;text-align:center;padding:20px">No comments yet.</p>';
    return;
  }
  list.innerHTML = comments.map(c => {
    const repliesHtml = (c.replies || []).map(r => `
      <div class="comment-item" style="margin-bottom:6px">
        <div class="comment-header">
          <div class="comment-avatar" style="background:hsl(${(r.userId.charCodeAt(1)||180)*3},60%,35%)">${r.authorInitials}</div>
          <span class="comment-author">${sanitize(r.author)}</span>
          <span class="comment-time">${timeAgo(r.timestamp)}</span>
        </div>
        <div class="comment-body">${sanitize(r.text)}</div>
      </div>`).join('');

    return `
    <div class="comment-item" id="comment-${c.id}">
      <div class="comment-header">
        <div class="comment-avatar" style="background:hsl(${(c.userId.charCodeAt(1)||180)*3},60%,35%)">${c.authorInitials}</div>
        <span class="comment-author">${sanitize(c.author)}</span>
        <span class="comment-time">${timeAgo(c.timestamp)}</span>
      </div>
      <div class="comment-body">${sanitize(c.text)}</div>
      <div class="comment-actions">
        <button class="comment-reply-btn" data-comment-id="${c.id}">↩ Reply</button>
      </div>
      ${c.replies && c.replies.length ? `<div class="reply-list">${repliesHtml}</div>` : ''}
      <div id="reply-form-${c.id}" style="display:none" class="reply-form">
        <input type="text" class="reply-input" id="reply-input-${c.id}" placeholder="Write a reply...">
        <button class="btn btn-sm btn-primary" onclick="postReply('${session.id}', '${c.id}')">Reply</button>
      </div>
    </div>`;
  }).join('');

  list.querySelectorAll('.comment-reply-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const cid = btn.dataset.commentId;
      const formEl = document.getElementById(`reply-form-${cid}`);
      if (formEl) formEl.style.display = formEl.style.display === 'none' ? 'flex' : 'none';
    });
  });
}

function postComment(sessionId) {
  if (!requireCurrentUser('post a comment')) return;
  const input = document.getElementById('comment-input');
  const text  = input?.value?.trim();
  if (!text) { toast('Comment cannot be empty.', 'error'); return; }

  const sessions = getSessions();
  const s = sessions.find(x => x.id === sessionId);
  if (!s) return;

  const comment = {
    id: uid(),
    userId:        currentUser.id,
    author:        currentUser.name,
    authorInitials:currentUser.initials,
    text:          text,
    timestamp:     now(),
    replies:       [],
  };

  s.comments = s.comments || [];
  s.comments.push(comment);
  s.updatedAt = now();
  saveSessions(sessions);
  if (input) input.value = '';

  // TC-AM-012 (F2): Notify host when a user comments on their session
  if (s.hostId !== currentUser.id) {
    addNotif(s.hostId, NOTIF_TYPES.COMMENT, s.id, s.title,
      `${currentUser.name} commented on your session "${s.title}"`);
  }

  renderSessionDetails(s);
  toast('Comment posted!', 'success');
}

function postReply(sessionId, commentId) {
  if (!requireCurrentUser('post a reply')) return;
  const input = document.getElementById(`reply-input-${commentId}`);
  const text  = input?.value?.trim();
  if (!text) { toast('Reply cannot be empty.', 'error'); return; }

  const sessions = getSessions();
  const s = sessions.find(x => x.id === sessionId);
  if (!s) return;

  const comment = (s.comments || []).find(c => c.id === commentId);
  if (!comment) return;

  const reply = {
    id:             uid(),
    userId:         currentUser.id,
    author:         currentUser.name,
    authorInitials: currentUser.initials,
    text:           text,
    timestamp:      now(),
  };

  comment.replies = comment.replies || [];
  comment.replies.push(reply);
  s.updatedAt = now();
  saveSessions(sessions);

  // TC-AM-004 (F2): Notify original commenter of the reply
  if (comment.userId !== currentUser.id) {
    addNotif(comment.userId, NOTIF_TYPES.COMMENT, s.id, s.title,
      `${currentUser.name} replied to your comment in "${s.title}"`);
  }
  // Also notify host if different
  if (s.hostId !== currentUser.id && s.hostId !== comment.userId) {
    addNotif(s.hostId, NOTIF_TYPES.COMMENT, s.id, s.title,
      `${currentUser.name} replied to a comment in your session "${s.title}"`);
  }

  renderSessionDetails(s);
  toast('Reply posted!', 'success');
}

/* ─────────────────────────────────────────────────────
   22. EDIT SESSION
───────────────────────────────────────────────────── */
function openEditSession(sessionId) {
  const sessions = getSessions();
  const s = sessions.find(x => x.id === sessionId);
  if (!s) return;

  openModal(`
    <h3 class="modal-title">✏️ Edit Session</h3>
    <div class="modal-form-group">
      <label class="modal-label">Session Title</label>
      <input type="text" class="form-input" id="edit-title" value="${sanitize(s.title)}">
    </div>
    <div class="modal-form-group">
      <label class="modal-label">Start Time</label>
      <input type="time" class="form-input" id="edit-start" value="${s.startTime}">
    </div>
    <div class="modal-form-group">
      <label class="modal-label">End Time</label>
      <input type="time" class="form-input" id="edit-end" value="${s.endTime}">
    </div>
    <div class="modal-form-group">
      <label class="modal-label">Location</label>
      <input type="text" class="form-input" id="edit-loc" value="${sanitize(s.location)}">
    </div>
    <div class="modal-form-group">
      <label class="modal-label">Overview</label>
      <textarea class="form-input" id="edit-overview" rows="4">${sanitize(s.description)}</textarea>
    </div>
    <div class="modal-actions">
      <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveEditSession('${sessionId}')">Save Changes</button>
    </div>
  `);
}

function saveEditSession(sessionId) {
  if (!requireCurrentUser('save changes')) return;
  const sessions = getSessions();
  const s = sessions.find(x => x.id === sessionId);
  if (!s) { closeModal(); return; }

  s.title       = document.getElementById('edit-title').value.trim() || s.title;
  s.startTime   = document.getElementById('edit-start').value || s.startTime;
  s.endTime     = document.getElementById('edit-end').value   || s.endTime;
  s.location    = document.getElementById('edit-loc').value.trim() || s.location;
  s.description = document.getElementById('edit-overview').value.trim();
  s.updatedAt   = now();
  saveSessions(sessions);

  // TC-AM-003 (F2): Notify all participants of update
  s.participants.forEach(pid => {
    addNotif(pid, NOTIF_TYPES.UPDATE, s.id, s.title,
      `Session "${s.title}" details have been updated by the host`);
  });

  closeModal();
  toast('Session updated!', 'success');
  renderSessionDetails(s);
}

/* ─────────────────────────────────────────────────────
   23. DELETE / CANCEL SESSION
───────────────────────────────────────────────────── */
function confirmDeleteSession(sessionId) {
  openModal(`
    <h3 class="modal-title">🗑 Delete Session</h3>
    <p class="modal-desc">Are you sure you want to cancel and delete this session? All participants will be notified.</p>
    <div class="modal-actions">
      <button class="btn btn-outline" onclick="closeModal()">Keep It</button>
      <button class="btn btn-danger" onclick="doDeleteSession('${sessionId}')">Delete Session</button>
    </div>
  `);
}

function doDeleteSession(sessionId) {
  if (!requireCurrentUser('delete this session')) return;
  const sessions = getSessions();
  const s = sessions.find(x => x.id === sessionId);
  if (!s) { closeModal(); return; }

  s.status    = 'cancelled';
  s.updatedAt = now();
  saveSessions(sessions);

  // TC-AM-011 (F2): Notify all participants of cancellation
  s.participants.forEach(pid => {
    addNotif(pid, NOTIF_TYPES.CANCELLATION, s.id, s.title,
      `Session "${s.title}" has been cancelled by the host and is no longer available`);
  });

  closeModal();
  toast('Session deleted and participants notified.', 'info');
  navigate('sessions');
}

/* ─────────────────────────────────────────────────────
   24. RENDER: PROFILE
───────────────────────────────────────────────────── */
function renderProfile() {
  if (!currentUser) return;
  document.getElementById('profile-avatar-xl').textContent   = currentUser.initials;
  document.getElementById('profile-name-display').textContent = currentUser.name;
  document.getElementById('profile-program-row').innerHTML   = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
    ${currentUser.program || 'BSCS · 1st Year'}`;

  const sessions = getSessions();
  const created  = sessions.filter(s => s.hostId === currentUser.id);
  const grid     = document.getElementById('profile-sessions-grid');

  if (created.length === 0) {
    grid.innerHTML = `<div class="sessions-empty-state">No sessions created yet. <span style="color:var(--accent-bright);cursor:pointer" onclick="navigate('create')">Create one!</span></div>`;
    return;
  }

  grid.innerHTML = `
    <div class="session-card" style="border:2px dashed var(--border);cursor:pointer;display:flex;align-items:center;justify-content:center;min-height:160px;flex-direction:column;gap:8px;color:var(--text-muted)" onclick="navigate('create')">
      <span style="font-size:24px">+</span>
      <span style="font-size:13px">Create New Session</span>
    </div>
    ${created.map(s => buildSessionCard(s, false)).join('')}`;

  attachCardListeners(grid);
}

/* ─────────────────────────────────────────────────────
   25. FORM: TAGS LOGIC
───────────────────────────────────────────────────── */
function addTag(value) {
  const val = value.trim();
  if (!val) return;
  if (editingTags.length >= 5) { setErr('err-tags', 'Maximum 5 tags allowed.'); return; }
  if (val.length > 20) { setErr('err-tags', 'Tag must be 20 characters or less.'); return; }
  if (editingTags.includes(val)) { setErr('err-tags', 'Tag already added.'); return; }
  setErr('err-tags', '');
  editingTags.push(val);
  renderTagChips();
}

function removeTag(idx) {
  editingTags.splice(idx, 1);
  renderTagChips();
}

function renderTagChips() {
  const container = document.getElementById('tags-chips');
  if (!container) return;
  container.innerHTML = editingTags.map((t, i) => `
    <span class="tag-item">
      ${sanitize(t)}
      <button class="tag-remove" onclick="removeTag(${i})">×</button>
    </span>`).join('');
}

/* ─────────────────────────────────────────────────────
   26. FORM: FILE UPLOAD LOGIC
───────────────────────────────────────────────────── */
function handleFiles(fileList) {
  for (const file of fileList) {
    // TC-AM-010: File >10MB
    if (file.size > MAX_FILE_BYTES) {
      setErr('err-files', `"${file.name}" exceeds the 10MB file size limit.`);
      toast(`File "${file.name}" is too large (max 10MB).`, 'error');
      continue;
    }
    // Allowed extensions
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!ALLOWED_EXT.includes(ext)) {
      setErr('err-files', `"${file.name}" is not an allowed file type. Allowed: .pdf, .docx, .txt, .jpg, .png`);
      toast(`File type "${ext}" is not allowed.`, 'error');
      continue;
    }
    setErr('err-files', '');
    const sizeLabel = file.size < 1024 ? file.size + 'B'
      : file.size < 1024*1024 ? (file.size/1024).toFixed(1) + 'KB'
      : (file.size/(1024*1024)).toFixed(1) + 'MB';
    editingFiles.push({ name: file.name, size: file.size, sizeLabel, ext });
    // TC-AM-011: File uploaded confirmation
    toast(`✅ "${file.name}" uploaded successfully.`, 'success');
  }
  renderFilesPreview();
}

function removeFile(idx) {
  editingFiles.splice(idx, 1);
  renderFilesPreview();
}

function renderFilesPreview() {
  const list = document.getElementById('files-list');
  if (!list) return;
  list.innerHTML = editingFiles.map((f, i) => `
    <div class="file-item">
      <span class="file-icon">${f.ext === '.pdf' ? '📄' : f.ext === '.jpg' || f.ext === '.png' ? '🖼' : '📝'}</span>
      <span class="file-name">${sanitize(f.name)}</span>
      <span class="file-size">${f.sizeLabel}</span>
      <button class="file-remove" onclick="removeFile(${i})">×</button>
    </div>`).join('');
}

/* ─────────────────────────────────────────────────────
   27. SETTINGS / DEV TOOLS
───────────────────────────────────────────────────── */
function seedSampleSessions() {
  if (!requireCurrentUser('seed sample sessions')) return;
  const today = new Date();
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const nextWeek = new Date(today); nextWeek.setDate(today.getDate() + 7);
  const fmt = d => d.toISOString().slice(0,10);

  const samples = [
    { title:'Advanced React Hooks Workshop', date:fmt(tomorrow), startTime:'10:30', endTime:'12:00',
      location:'https://meet.google.com/abc-defg', visibility:'public', tags:['React','JavaScript','Frontend'],
      description:'Deep dive into React hooks including useState, useEffect, and custom hooks.', hue:260 },
    { title:'Mathematics Study Group', date:fmt(nextWeek), startTime:'14:00', endTime:'16:00',
      location:'Room 301, CIT-U Main Building', visibility:'public', tags:['Math','Calculus'],
      description:'Group study for differential equations exam preparation.', hue:200,
      participantLimit: 15 },
    { title:'PRIVATE: Thesis Defense Prep', date:fmt(tomorrow), startTime:'09:00', endTime:'11:00',
      location:'Library Study Room 2', visibility:'private', password:'Thesis@2026', tags:['Thesis'],
      description:'Final preparation for thesis defense presentation.', hue:330 },
  ];

  const sessions = getSessions();
  samples.forEach(d => {
    sessions.push({
      id:             uid(),
      title:          d.title,
      date:           d.date,
      startTime:      d.startTime,
      endTime:        d.endTime,
      location:       d.location,
      visibility:     d.visibility,
      password:       d.password || '',
      participantLimit: d.participantLimit || null,
      description:    d.description,
      tags:           d.tags,
      files:          [],
      hostId:         currentUser.id,
      hostName:       currentUser.name,
      participants:   [],
      comments:       [],
      createdAt:      now(),
      updatedAt:      now(),
      status:         'active',
      hue:            d.hue,
    });
  });
  saveSessions(sessions);
  toast('Sample sessions seeded!', 'success');
  navigate('sessions');
}

function seedTestNotifications() {
  if (!requireCurrentUser('generate test notifications')) return;
  const sessions = getSessions();
  const s = sessions[0];
  if (!s) { toast('Create a session first.', 'warning'); return; }

  addNotif(currentUser.id, NOTIF_TYPES.REMINDER, s.id, s.title,
    `Reminder: "${s.title}" is coming up in 1 hour at ${s.startTime || '10:00'}`);
  addNotif(currentUser.id, NOTIF_TYPES.UPDATE, s.id, s.title,
    `Session "${s.title}" details have been updated by the host`);
  addNotif(currentUser.id, NOTIF_TYPES.JOINED, s.id, s.title,
    `John Doe joined your session "${s.title}"`);
  addNotif(currentUser.id, NOTIF_TYPES.COMMENT, s.id, s.title,
    `Faith Aligato commented on your session "${s.title}"`);
  toast('Test notifications generated!', 'success');
  refreshNotifUI();
}

function clearAllData() {
  if (!requireCurrentUser('clear all data')) return;
  openModal(`
    <h3 class="modal-title">⚠️ Clear All Data</h3>
    <p class="modal-desc">This will delete all sessions, notifications, and joined sessions. This cannot be undone.</p>
    <div class="modal-actions">
      <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
      <button class="btn btn-danger" onclick="confirmClearData()">Clear Everything</button>
    </div>
  `);
}

function confirmClearData() {
  [STORE.SESSIONS, STORE.NOTIFS, STORE.JOINED, STORE.CURRENT].forEach(k => localStorage.removeItem(k));
  currentUser = null;
  closeModal();
  toast('All data cleared.', 'info');
  showLogin();
}

/* ─────────────────────────────────────────────────────
   28. LOGIN SCREEN RENDER
───────────────────────────────────────────────────── */
function renderLoginScreen() {
  const list  = document.getElementById('user-list');
  const users = getUsers();
  list.innerHTML = users.map(u => `
    <button class="user-btn" data-uid="${u.id}">
      <div class="user-btn-avatar" style="background:hsl(${u.hue},60%,35%)">${u.initials}</div>
      <div class="user-btn-info">
        <div class="user-btn-name">${sanitize(u.name)}</div>
        <div class="user-btn-role">${u.role} · ${u.program}</div>
      </div>
      <div class="user-btn-arrow">→</div>
    </button>`).join('');

  list.querySelectorAll('.user-btn').forEach(btn => {
    btn.addEventListener('click', () => login(btn.dataset.uid));
  });
}

function showLogin() {
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
}
function showApp() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  // Update header user info
  document.getElementById('header-avatar').textContent   = currentUser.initials;
  document.getElementById('header-username').textContent = currentUser.name;
  refreshNotifUI();
}

