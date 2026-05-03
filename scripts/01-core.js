/* ═══════════════════════════════════════════════════════
   ACADEMEET — SCRIPT.JS
   Pure Vanilla JS · localStorage persistence
   Test Suite: TS-AM-001 | All TC-AM covered
═══════════════════════════════════════════════════════ */

'use strict';

/* ─────────────────────────────────────────────────────
   1. CONSTANTS & CONFIG
───────────────────────────────────────────────────── */
const STORE = {
  USERS:    'am_users',
  SESSIONS: 'am_sessions',
  NOTIFS:   'am_notifs',
  JOINED:   'am_joined',
  CURRENT:  'am_current_user',
  TIMERS:   'am_reminder_timers',
  SIM_ERR:  'am_sim_notif_error',
  SIM_SAVE: 'am_sim_save_error',
};

const NOTIF_TYPES = {
  REMINDER:    'reminder',
  UPDATE:      'update',
  COMMENT:     'comment',
  JOINED:      'joined',
  CANCELLATION:'cancellation',
};

const NOTIF_ICONS = {
  reminder:     '⏰',
  update:       '✏️',
  comment:      '💬',
  joined:       '✅',
  cancellation: '🚫',
};

const MAX_NOTIFS_DROPDOWN = 25;
const MAX_NOTIFS_STORE    = 500;
const MERGE_WINDOW_MS     = 15 * 60 * 1000; // 15 minutes
const REMINDER_DEDUPE_MS  = 5 * 60 * 1000;  // prevent duplicate reminder bursts
const ARCHIVE_DAYS_MS     = 90 * 24 * 3600 * 1000;
const REMINDER_1H_MS      = 60 * 60 * 1000;
const REMINDER_24H_MS     = 24 * 60 * 60 * 1000;

const ALLOWED_EXT   = ['.pdf', '.docx', '.txt', '.jpg', '.png'];
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB

// Colour hues for session cards
const SESSION_HUES = [260, 200, 160, 30, 330, 280, 190];

let currentView   = 'dashboard';
let currentUser   = null;
let notifTab      = 'all';
let sessionTab    = 'available';
let profileTab    = 'sessions';
let currentSession = null;    // session being viewed
let remTimers     = {};        // active setTimeout handles
let editingTags   = [];
let editingFiles  = [];
let submitInProgress = false;

/* ─────────────────────────────────────────────────────
   2. STORAGE HELPERS
───────────────────────────────────────────────────── */
const load  = key => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
const save  = (key, val) => localStorage.setItem(key, JSON.stringify(val));
const flag  = key => localStorage.getItem(key) === 'true';
const setFlag = (key, v) => localStorage.setItem(key, v ? 'true' : 'false');

const getUsers    = () => load(STORE.USERS)    || [];
const getSessions = () => load(STORE.SESSIONS) || [];
const saveSessions = s => save(STORE.SESSIONS, s);
const getNotifs   = uid => { const m = load(STORE.NOTIFS) || {}; return m[uid] || []; };
const saveNotifs  = (uid, arr) => { const m = load(STORE.NOTIFS) || {}; m[uid] = arr; save(STORE.NOTIFS, m); };
const getJoined   = uid => { const m = load(STORE.JOINED) || {}; return m[uid] || []; };
const saveJoined  = (uid, arr) => { const m = load(STORE.JOINED) || {}; m[uid] = arr; save(STORE.JOINED, m); };

const uid  = () => 'id_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
const now  = () => Date.now();

/* ─────────────────────────────────────────────────────
   3. MOCK DATA INITIALISATION
───────────────────────────────────────────────────── */
const MOCK_USERS = [
  { id: 'u1', name: 'Lichael Urslo',    initials: 'LU', role: 'Host',        program: 'BSCS · 3rd Year',  hue: 260 },
  { id: 'u2', name: 'Faith Aligato',    initials: 'FA', role: 'Participant',  program: 'BSIT · 2nd Year',  hue: 160 },
  { id: 'u3', name: 'John Doe',         initials: 'JD', role: 'Participant',  program: 'BSCE · 1st Year',  hue: 200 },
];

function initData() {
  if (!load(STORE.USERS)) save(STORE.USERS, MOCK_USERS);
}

/* ─────────────────────────────────────────────────────
   4. AUTH
───────────────────────────────────────────────────── */
function login(userId) {
  const users = getUsers();
  const user  = users.find(u => u.id === userId);
  if (!user) return;
  currentUser = user;
  save(STORE.CURRENT, userId);
  showApp();
  navigate('dashboard');
  checkAndScheduleReminders();
}

function logout() {
  currentUser = null;
  localStorage.removeItem(STORE.CURRENT);
  showLogin();
}

function restoreSession() {
  const userId = load(STORE.CURRENT);
  if (userId) {
    const user = (getUsers()).find(u => u.id === userId);
    if (user) { currentUser = user; return true; }
  }
  return false;
}

function requireCurrentUser(actionLabel = 'continue') {
  if (!currentUser) {
    toast(`Please log in to ${actionLabel}.`, 'error');
    return false;
  }
  return true;
}

/* ─────────────────────────────────────────────────────
   5. ROUTER / VIEW MANAGER
───────────────────────────────────────────────────── */
const VIEWS = ['dashboard','sessions','create','details','profile','settings'];

function navigate(viewName, data) {
  VIEWS.forEach(v => {
    const el = document.getElementById('view-' + v);
    if (el) el.classList.toggle('hidden', v !== viewName);
  });
  currentView = viewName;

  // Update header title
  const titles = { dashboard:'Dashboard', sessions:'Sessions', create:'Create Session',
                   details:'Session Details', profile:'Profile', settings:'Settings' };
  document.getElementById('header-title').textContent = titles[viewName] || viewName;

  // Update nav active state
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.nav === viewName);
  });

  // Render view
  if (viewName === 'dashboard') renderDashboard();
  if (viewName === 'sessions')  renderSessions();
  if (viewName === 'profile')   renderProfile();
  if (viewName === 'create')    renderCreateForm();
  if (viewName === 'details' && data) renderSessionDetails(data);

  closeNotifDropdown();
}

/* ─────────────────────────────────────────────────────
   6. SANITISATION
───────────────────────────────────────────────────── */
// TC-AM-020: Prevent XSS / injection
function sanitize(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/* ─────────────────────────────────────────────────────
   7. TOAST
───────────────────────────────────────────────────── */
function toast(msg, type = 'info', duration = 3500) {
  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  const tc   = document.getElementById('toast-container');
  const el   = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `<span class="toast-icon">${icons[type]||'ℹ️'}</span><span>${sanitize(msg)}</span>`;
  tc.appendChild(el);
  setTimeout(() => {
    el.classList.add('fadeOut');
    setTimeout(() => el.remove(), 400);
  }, duration);
}

/* ─────────────────────────────────────────────────────
   8. MODAL
───────────────────────────────────────────────────── */
function openModal(html) {
  document.getElementById('modal-box').innerHTML = html;
  document.getElementById('modal-overlay').classList.remove('hidden');
}
function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  document.getElementById('modal-box').innerHTML = '';
}

/* ─────────────────────────────────────────────────────
   9. TIME HELPERS
───────────────────────────────────────────────────── */
function timeAgo(ts) {
  const diff = now() - ts;
  if (diff < 60000)  return 'Just now';
  if (diff < 3600000) return Math.floor(diff/60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff/3600000) + 'h ago';
  return Math.floor(diff/86400000) + 'd ago';
}

function formatDateFriendly(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase();
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function sessionDateTime(session) {
  return new Date(session.date + 'T' + session.startTime).getTime();
}

function isSessionExpired(session) {
  return sessionDateTime(session) < now() - 3600000; // started >1h ago
}
function isSessionStarted(session) {
  return sessionDateTime(session) <= now();
}

