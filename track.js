// track.js — "Brainrot Track" mode: up to 5 players race to grab shoes
// off a moving conveyor belt. Separate mode from the SoleDuel duel game;
// shares Firebase (firebase-init.js), helpers (shared.js), and the shoe
// pool (shoes.js).

const MAX_TRACK_PLAYERS = 5;
const SPAWN_INTERVAL_MS = 1300;
const BELT_TRAVEL_MS = 5500;
const SPAWN_MAX_AGE_MS = 8000;
const TRACK_DURATION_MS = 60000;

let trackName = '';
let trackCode = null;
let trackGameRef = null;
let trackIsHost = false;
let trackStatus = 'waiting';
let spawnLoopHandle = null;
let timerTickHandle = null;
let trackEndsAt = null;
const beltElements = new Map(); // spawnId -> DOM element
let lastFinishedShown = false;

// ---------- Lobby tabs ----------
$('#track-tab-create').addEventListener('click', () => switchTrackTab('create'));
$('#track-tab-join').addEventListener('click', () => switchTrackTab('join'));
function switchTrackTab(which) {
  $('#track-tab-create').classList.toggle('active', which === 'create');
  $('#track-tab-join').classList.toggle('active', which === 'join');
  $('#track-panel-create').classList.toggle('hidden', which !== 'create');
  $('#track-panel-join').classList.toggle('hidden', which !== 'join');
}

// ---------- Create / join ----------
$('#btn-track-create').addEventListener('click', async () => {
  const name = $('#track-name-create').value.trim();
  if (!name) return showToast('Enter your name first.');
  if (!myUid) return showToast('Still connecting — try again in a second.');
  $('#btn-track-create').disabled = true;
  try {
    const code = randomCode();
    const ref = db.ref('trackGames/' + code);
    await ref.set({
      createdAt: firebase.database.ServerValue.TIMESTAMP,
      status: 'waiting',
      hostUid: myUid,
      players: { [myUid]: { name, order: 0 } },
    });
    trackName = name;
    attachTrackGame(code);
  } catch (err) {
    console.error(err);
    showToast('Could not create a track. Check your Firebase setup.');
  } finally {
    $('#btn-track-create').disabled = false;
  }
});

$('#btn-track-join').addEventListener('click', async () => {
  const name = $('#track-name-join').value.trim();
  const code = $('#track-code-join').value.trim().toUpperCase();
  if (!name) return showToast('Enter your name first.');
  if (!code) return showToast('Enter a track code.');
  if (!myUid) return showToast('Still connecting — try again in a second.');
  $('#btn-track-join').disabled = true;
  try {
    const ref = db.ref('trackGames/' + code);
    const snap = await ref.get();
    if (!snap.exists()) {
      showToast("That code doesn't match a track.");
      return;
    }
    const data = snap.val();
    const players = data.players || {};
    const uids = Object.keys(players);

    if (uids.includes(myUid)) {
      trackName = players[myUid].name;
      attachTrackGame(code);
      return;
    }
    if (uids.length >= MAX_TRACK_PLAYERS) {
      showToast('That track is already full (5 players).');
      return;
    }
    if (data.status !== 'waiting') {
      showToast('That track has already started.');
      return;
    }

    await ref.child('players/' + myUid).set({ name, order: uids.length });
    trackName = name;
    attachTrackGame(code);
  } catch (err) {
    console.error(err);
    showToast('Could not join that track. Check your Firebase setup.');
  } finally {
    $('#btn-track-join').disabled = false;
  }
});

function attachTrackGame(code) {
  trackCode = code;
  trackGameRef = db.ref('trackGames/' + code);
  $('#track-waiting-code').textContent = code;

  trackGameRef.on('value', renderTrackMeta);
  trackGameRef.child('spawns').on('child_added', handleSpawnAdded);
  trackGameRef.child('spawns').on('child_changed', handleSpawnChanged);
  trackGameRef.child('spawns').on('child_removed', handleSpawnRemoved);
}

$('#btn-track-copy-code').addEventListener('click', () => {
  navigator.clipboard.writeText(trackCode).then(() => showToast('Code copied.'));
});

// ---------- Meta rendering (lobby list, leaderboard, timer, screens) ----------
function renderTrackMeta(snap) {
  const data = snap.val();
  if (!data) return;

  const players = data.players || {};
  trackIsHost = data.hostUid === myUid;
  trackStatus = data.status;

  if (data.status === 'waiting') {
    showScreen('screen-track-lobby');
    renderTrackLobbyList(players);
    return;
  }

  if (data.status === 'playing') {
    showScreen('screen-track-game');
    trackEndsAt = data.endsAt || null;
    lastFinishedShown = false;
    $('#track-overlay').classList.add('hidden');
    renderTrackLeaderboard(players, data.collections || {});
    startTimerTick();
    if (trackIsHost) startSpawnLoop();
    return;
  }

  if (data.status === 'finished') {
    stopSpawnLoop();
    stopTimerTick();
    renderTrackLeaderboard(players, data.collections || {});
    if (!lastFinishedShown) {
      lastFinishedShown = true;
      showTrackFinished(players, data.collections || {});
    }
    return;
  }
}

function renderTrackLobbyList(players) {
  const uids = Object.keys(players).sort((a, b) => players[a].order - players[b].order);
  $('#track-player-count').textContent = uids.length;
  $('#track-player-list').innerHTML = uids.map((u) => `
    <div class="track-player-chip ${u === myUid ? 'me' : ''}">${players[u].name}${u === myUid ? ' (you)' : ''}</div>
  `).join('') + (uids.length < MAX_TRACK_PLAYERS
    ? `<div class="track-player-chip empty">Open slot</div>`.repeat(MAX_TRACK_PLAYERS - uids.length)
    : '');

  const startBtn = $('#btn-track-start');
  const note = $('#track-host-note');
  if (trackIsHost) {
    startBtn.classList.toggle('hidden', uids.length < 2);
    note.textContent = uids.length < 2 ? 'Need at least 2 players to start.' : 'Ready when you are.';
  } else {
    startBtn.classList.add('hidden');
    note.textContent = 'Waiting for the host to start the track…';
  }
}

$('#btn-track-start').addEventListener('click', async () => {
  await trackGameRef.update({
    status: 'playing',
    startedAt: firebase.database.ServerValue.TIMESTAMP,
    endsAt: Date.now() + TRACK_DURATION_MS,
  });
});

function renderTrackLeaderboard(players, collections) {
  const uids = Object.keys(players);
  const rows = uids.map((u) => ({
    name: players[u].name,
    isMe: u === myUid,
    count: Object.keys(collections[u] || {}).length,
  })).sort((a, b) => b.count - a.count);

  $('#track-leaderboard-list').innerHTML = rows.map((r, i) => `
    <div class="leaderboard-row ${r.isMe ? 'me' : ''}">
      <span class="lb-rank">#${i + 1}</span>
      <span class="lb-name">${r.name}${r.isMe ? ' (you)' : ''}</span>
      <span class="lb-count">${r.count} 👟</span>
    </div>
  `).join('');
}

function startTimerTick() {
  if (timerTickHandle) return;
  timerTickHandle = setInterval(() => {
    if (!trackEndsAt) return;
    const remaining = Math.max(0, Math.round((trackEndsAt - Date.now()) / 1000));
    $('#track-timer').textContent = remaining + 's';
  }, 250);
}
function stopTimerTick() {
  clearInterval(timerTickHandle);
  timerTickHandle = null;
}

function showTrackFinished(players, collections) {
  const uids = Object.keys(players);
  const rows = uids.map((u) => ({
    name: players[u].name,
    isMe: u === myUid,
    count: Object.keys(collections[u] || {}).length,
  })).sort((a, b) => b.count - a.count);

  $('#track-final-list').innerHTML = rows.map((r, i) => `
    <div class="leaderboard-row ${i === 0 ? 'winner' : ''} ${r.isMe ? 'me' : ''}">
      <span class="lb-rank">${i === 0 ? '🏆' : '#' + (i + 1)}</span>
      <span class="lb-name">${r.name}${r.isMe ? ' (you)' : ''}</span>
      <span class="lb-count">${r.count} 👟</span>
    </div>
  `).join('');

  $('#btn-track-restart').classList.toggle('hidden', !trackIsHost);
  $('#track-restart-note').classList.toggle('hidden', trackIsHost);
  $('#track-overlay').classList.remove('hidden');
}

$('#btn-track-restart').addEventListener('click', async () => {
  await trackGameRef.update({ status: 'waiting', spawns: null, collections: null });
});

// ---------- Spawn loop (host client only) ----------
function startSpawnLoop() {
  if (spawnLoopHandle) return;
  spawnLoopHandle = setInterval(async () => {
    try {
      const snap = await trackGameRef.get();
      const data = snap.val();
      if (!data || data.status !== 'playing') {
        stopSpawnLoop();
        return;
      }
      if (Date.now() >= data.endsAt) {
        await trackGameRef.update({ status: 'finished' });
        stopSpawnLoop();
        return;
      }

      const shoeType = pickRandomShoeType();
      const spawnId = 'sp' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      await trackGameRef.child('spawns/' + spawnId).set({
        shoeTypeId: shoeType.id,
        spawnedAt: Date.now(),
        grabbedBy: null,
      });

      // Light garbage collection so the spawns node doesn't grow forever.
      const spawnsSnap = await trackGameRef.child('spawns').get();
      const spawns = spawnsSnap.val() || {};
      const updates = {};
      Object.entries(spawns).forEach(([id, s]) => {
        if (Date.now() - (s.spawnedAt || 0) > SPAWN_MAX_AGE_MS) updates[id] = null;
      });
      if (Object.keys(updates).length) {
        await trackGameRef.child('spawns').update(updates);
      }
    } catch (err) {
      console.error(err);
    }
  }, SPAWN_INTERVAL_MS);
}
function stopSpawnLoop() {
  clearInterval(spawnLoopHandle);
  spawnLoopHandle = null;
}

// ---------- Belt rendering ----------
function handleSpawnAdded(snap) {
  if (trackStatus !== 'playing') return;
  const spawnId = snap.key;
  const spawn = snap.val();
  const shoe = shoeById(spawn.shoeTypeId);
  if (!shoe) return;

  const el = document.createElement('button');
  el.className = 'belt-shoe';
  el.dataset.rarity = shoe.rarity;
  el.style.animationDuration = BELT_TRAVEL_MS + 'ms';
  el.innerHTML = `<span class="belt-shoe-icon" style="filter:hue-rotate(${shoe.hue}deg)">👟</span>`;
  el.title = shoe.name;

  el.addEventListener('click', () => grabSpawn(spawnId, spawn.shoeTypeId, el));
  el.addEventListener('animationend', () => {
    el.remove();
    beltElements.delete(spawnId);
  });

  $('#track-belt').appendChild(el);
  beltElements.set(spawnId, el);
}

function handleSpawnChanged(snap) {
  const spawnId = snap.key;
  const spawn = snap.val();
  const el = beltElements.get(spawnId);
  if (!el || !spawn.grabbedBy) return;
  if (el.classList.contains('grabbed')) return; // already shown
  el.classList.add('grabbed');
  el.disabled = true;
}

function handleSpawnRemoved(snap) {
  const spawnId = snap.key;
  const el = beltElements.get(spawnId);
  if (el) {
    el.remove();
    beltElements.delete(spawnId);
  }
}

async function grabSpawn(spawnId, shoeTypeId, el) {
  if (el.disabled) return;
  el.disabled = true;
  try {
    const ref = trackGameRef.child('spawns/' + spawnId + '/grabbedBy');
    const result = await ref.transaction((current) => {
      if (current === null || current === undefined) return myUid;
      return; // undefined return aborts the transaction — someone beat us to it.
    });

    if (result.committed && result.snapshot.val() === myUid) {
      const instanceId = 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
      await trackGameRef.child(`collections/${myUid}/${instanceId}`).set(shoeTypeId);
      el.classList.add('grabbed-mine');
    } else {
      showToast('Too slow!');
    }
  } catch (err) {
    console.error(err);
    el.disabled = false;
  }
}
