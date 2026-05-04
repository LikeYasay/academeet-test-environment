/* ─────────────────────────────────────────────────────
   29. EVENT LISTENERS
───────────────────────────────────────────────────── */
function bindCoreNavigationEvents() {
  // Sidebar / global navigation
  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', () => navigate(el.dataset.nav));
  });

  // Auth actions
  document.getElementById('logout-btn').addEventListener('click', logout);

  // Main route actions
  document.getElementById('create-session-btn')?.addEventListener('click', () => navigate('create'));
  document.getElementById('back-from-create').addEventListener('click', () => navigate('sessions'));
  document.getElementById('back-from-details').addEventListener('click', () => {
    if (currentView === 'details') navigate('sessions');
  });

  // Session list tabs
  document.querySelectorAll('[data-stab]').forEach(tab => {
    tab.addEventListener('click', () => {
      sessionTab = tab.dataset.stab;
      document.querySelectorAll('[data-stab]').forEach(t => t.classList.toggle('active', t.dataset.stab === sessionTab));
      renderSessions();
    });
  });

  // Profile tabs
  document.querySelectorAll('[data-ptab]').forEach(tab => {
    tab.addEventListener('click', () => {
      profileTab = tab.dataset.ptab;
      document.querySelectorAll('[data-ptab]').forEach(t => t.classList.toggle('active', t.dataset.ptab === profileTab));
    });
  });
}

function bindNotificationEvents() {
  // Notification bell
  document.getElementById('notif-btn').addEventListener('click', e => {
    e.stopPropagation();
    const dd = document.getElementById('notif-dropdown');
    if (dd.classList.contains('hidden')) openNotifDropdown();
    else closeNotifDropdown();
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', e => {
    const wrapper = document.getElementById('notif-wrapper');
    if (!wrapper.contains(e.target)) closeNotifDropdown();
  });

  // Notification tabs
  document.querySelectorAll('.notif-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      notifTab = tab.dataset.ntab;
      document.querySelectorAll('.notif-tab').forEach(t => t.classList.toggle('active', t.dataset.ntab === notifTab));
      renderNotifList();
    });
  });

  // Mark all read
  document.getElementById('mark-all-read-btn').addEventListener('click', () => {
    if (currentUser) markAllRead(currentUser.id);
  });

  // Notification list interactions (delegated)
  document.getElementById('notif-list').addEventListener('click', e => {
    const viewBtn    = e.target.closest('.notif-view-btn');
    const dismissBtn = e.target.closest('[data-action="dismiss"]');
    const markBtn    = e.target.closest('[data-action="mark-read"]');

    if (viewBtn) {
      const notifId   = viewBtn.dataset.notifId;
      const sessionId = viewBtn.dataset.sessionId;
      if (currentUser) markAsRead(notifId, currentUser.id);
      closeNotifDropdown();
      const s = getSessions().find(x => x.id === sessionId);
      if (s && typeof isPrivateSessionLocked === 'function' && isPrivateSessionLocked(s)) {
        requestPrivateDetailsAccess(s.id);
      } else if (s) {
        navigate('details', s);
      } else {
        toast('Session not found.', 'error');
      }
    }
    if (dismissBtn && currentUser) {
      dismissNotif(dismissBtn.dataset.notifId, currentUser.id);
    }
    if (markBtn && currentUser) {
      markAsRead(markBtn.dataset.notifId, currentUser.id);
    }
  });
}

function bindCreateSessionEvents() {
  // Submit session
  document.getElementById('submit-session-btn').addEventListener('click', handleSubmitSession);

  // Visibility toggle
  document.querySelectorAll('input[name="visibility"]').forEach(r => {
    r.addEventListener('change', () => {
      const isPrivate = document.querySelector('input[name="visibility"]:checked').value === 'private';
      document.getElementById('password-group').classList.toggle('hidden', !isPrivate);
    });
  });

  // Tags: Enter key
  document.getElementById('f-tag').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag(e.target.value);
      e.target.value = '';
    }
  });

  // File upload
  document.getElementById('upload-btn').addEventListener('click', () => {
    document.getElementById('f-files').click();
  });
  document.getElementById('f-files').addEventListener('change', e => {
    handleFiles(e.target.files);
    e.target.value = ''; // reset so same file can be added again after removal
  });

  // Overview char count
  document.getElementById('f-overview').addEventListener('input', e => {
    document.getElementById('overview-count').textContent = e.target.value.length + ' characters';
  });
}

function bindSettingsEvents() {
  // Settings controls
  document.getElementById('toggle-notif-error')?.addEventListener('change', e => {
    setFlag(STORE.SIM_ERR, e.target.checked);
    toast(e.target.checked ? 'Notification error simulation ON' : 'Notification error simulation OFF', 'info');
  });
  document.getElementById('toggle-save-error')?.addEventListener('change', e => {
    setFlag(STORE.SIM_SAVE, e.target.checked);
    toast(e.target.checked ? 'Save error simulation ON' : 'Save error simulation OFF', 'info');
  });

  document.getElementById('btn-seed-sessions')?.addEventListener('click', seedSampleSessions);
  document.getElementById('btn-clear-data')?.addEventListener('click', clearAllData);
  document.getElementById('btn-seed-notifs')?.addEventListener('click', seedTestNotifications);

  // Dev panel
  document.getElementById('simulate-error-btn')?.addEventListener('click', () => {
    setFlag(STORE.SIM_SAVE, true);
    // Turn on save error for next create
    const toggle = document.getElementById('toggle-save-error');
    if (toggle) toggle.checked = true;
    toast('Network error will be simulated on next session create.', 'warning');
  });
}

function bindModalEvents() {
  // Modal overlay click to close
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-overlay')) closeModal();
  });
}

function bindEvents() {
  bindCoreNavigationEvents();
  bindNotificationEvents();
  bindCreateSessionEvents();
  bindSettingsEvents();
  bindModalEvents();
}

/* ─────────────────────────────────────────────────────
   30. SUBMIT SESSION HANDLER
───────────────────────────────────────────────────── */
function handleSubmitSession() {
  if (!requireCurrentUser('create a session')) return;
  if (submitInProgress) return; // TC-AM-015: prevent duplicate submissions

  const title      = document.getElementById('f-title').value;
  const date       = document.getElementById('f-date').value;
  const startTime  = document.getElementById('f-start-time').value;
  const endTime    = document.getElementById('f-end-time').value;
  const location   = document.getElementById('f-location').value;
  const visibility = document.querySelector('input[name="visibility"]:checked')?.value || 'public';
  const password   = document.getElementById('f-password')?.value || '';
  const limit      = document.getElementById('f-limit')?.value || '';
  const description= document.getElementById('f-overview').value;

  const data = { title, date, startTime, endTime, location, visibility, password,
                 participantLimit: limit, description, tags: editingTags, files: editingFiles };

  if (!validateSession(data)) return;

  // TC-AM-015: Disable button, prevent re-submit
  const btn = document.getElementById('submit-session-btn');
  btn.disabled = true;
  btn.textContent = 'Saving...';
  submitInProgress = true;

  // TC-AM-016: Simulate network error
  const shouldFail = flag(STORE.SIM_SAVE);

  setTimeout(() => {
    if (shouldFail) {
      // Re-enable button after failure
      setFlag(STORE.SIM_SAVE, false);
      const toggle = document.getElementById('toggle-save-error');
      if (toggle) toggle.checked = false;
      btn.disabled = false;
      btn.textContent = '+ Create Session';
      submitInProgress = false;
      toast('Failed to save session. Please try again. (Simulated error)', 'error');
      return;
    }

    // ── Success path ──
    const session = saveSession(data);
    btn.disabled = false;
    btn.textContent = '+ Create Session';
    submitInProgress = false;

    toast(`Session "${session.title}" created successfully!`, 'success');
    navigate('sessions');
  }, 600); // small delay to simulate async
}

/* ─────────────────────────────────────────────────────
   31. INITIALISE APP
───────────────────────────────────────────────────── */
function init() {
  initData();
  renderLoginScreen();
  bindEvents();

  // Ensure notification load simulation never persists unintentionally.
  setFlag(STORE.SIM_ERR, false);

  // Sync settings toggles with stored flags
  const notifErrToggle = document.getElementById('toggle-notif-error');
  if (notifErrToggle) notifErrToggle.checked = flag(STORE.SIM_ERR);
  const saveErrToggle = document.getElementById('toggle-save-error');
  if (saveErrToggle) saveErrToggle.checked = flag(STORE.SIM_SAVE);

  // Restore existing session
  if (restoreSession()) {
    showApp();
    navigate('dashboard');
    checkAndScheduleReminders();
  } else {
    showLogin();
  }
}

// ── Expose functions needed from inline handlers ──
window.closeModal        = closeModal;
window.confirmJoin       = confirmJoin;
window.confirmPrivateDetailsAccess = confirmPrivateDetailsAccess;
window.requestPrivateDetailsAccess = requestPrivateDetailsAccess;
window.postReply         = postReply;
window.removeTag         = removeTag;
window.removeFile        = removeFile;
window.saveEditSession   = saveEditSession;
window.doDeleteSession   = doDeleteSession;
window.confirmClearData  = confirmClearData;
window.navigate          = navigate;

// ── Boot ──
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
