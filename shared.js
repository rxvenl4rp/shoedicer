// shared.js — small helpers shared by app.js (duel mode) and track.js (track mode).

const $ = (sel) => document.querySelector(sel);

function showScreen(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function showToast(msg) {
  const toast = $('#toast');
  toast.textContent = msg;
  toast.classList.remove('hidden');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.add('hidden'), 3200);
}

// 5-letter room code, no 0/O/1/I to avoid mixups.
function randomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// ---------- Mode select (top of the lobby screen) ----------
function switchMode(which) {
  document.getElementById('mode-tab-duel').classList.toggle('active', which === 'duel');
  document.getElementById('mode-tab-track').classList.toggle('active', which === 'track');
  document.getElementById('mode-panel-duel').classList.toggle('hidden', which !== 'duel');
  document.getElementById('mode-panel-track').classList.toggle('hidden', which !== 'track');
  if (which === 'duel') {
    document.getElementById('track-name-box').classList.add('hidden');
  } else if (typeof trackCode !== 'undefined' && trackCode) {
    document.getElementById('track-name-box').classList.remove('hidden');
  }
}
document.getElementById('mode-tab-duel').addEventListener('click', () => switchMode('duel'));
document.getElementById('mode-tab-track').addEventListener('click', () => switchMode('track'));
