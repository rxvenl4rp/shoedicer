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

// ---------- Random name generator (so nobody has to type one to start) ----------
const NAME_ADJECTIVES = ['Goofy', 'Gronk', 'Chaotic', 'Zesty', 'Wobbly', 'Sigma', 'Blorpy', 'Snarky', 'Funky', 'Gloopy', 'Turbo', 'Sneaky'];
const NAME_NOUNS = ['Gremlin', 'Noodle', 'Waffle', 'Yeeter', 'Blob', 'Chungus', 'Doofus', 'Gizmo', 'Whiffle', 'Nugget', 'Goober', 'Sprocket'];
function generateRandomName() {
  const a = NAME_ADJECTIVES[Math.floor(Math.random() * NAME_ADJECTIVES.length)];
  const n = NAME_NOUNS[Math.floor(Math.random() * NAME_NOUNS.length)];
  const num = Math.floor(Math.random() * 90) + 10;
  return `${a}${n}${num}`;
}

// ---------- Instant join: clicking the mode tab drops you straight in ----------
$('#mode-tab-track').addEventListener('click', () => {
  if (!trackCode) quickStartTrack();
});

async function quickStartTrack() {
  if (!myUid) {
    // Auth hasn't resolved yet — try again shortly rather than failing silently.
    setTimeout(() => { if (!trackCode) quickStartTrack(); }, 400);
    return;
  }
  trackName = generateRandomName();
  try {
    await ensureInventory(myUid);
    const code = randomCode();
    const ref = db.ref('trackGames/' + code);
    await ref.set({
      createdAt: firebase.database.ServerValue.TIMESTAMP,
      status: 'waiting',
      hostUid: myUid,
      players: { [myUid]: { name: trackName, order: 0 } },
    });
    attachTrackGame(code);
  } catch (err) {
    console.error(err);
    showToast('Could not start a track. Check your Firebase setup.');
  }
}

async function joinTrackByCode(code) {
  if (!code) return showToast('Enter a track code.');
  if (!myUid) return showToast('Still connecting — try again in a second.');
  try {
    await ensureInventory(myUid);
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

    trackName = trackName || generateRandomName();
    await ref.child('players/' + myUid).set({ name: trackName, order: uids.length });
    attachTrackGame(code);
  } catch (err) {
    console.error(err);
    showToast('Could not join that track. Check your Firebase setup.');
  }
}

function detachTrackGame() {
  if (!trackGameRef) return;
  trackGameRef.off('value', renderTrackMeta);
  trackGameRef.child('spawns').off();
  beltElements.forEach((el) => el.remove());
  beltElements.clear();
  stopSpawnLoop();
  stopTimerTick();
}

function attachTrackGame(code) {
  detachTrackGame();
  trackCode = code;
  trackGameRef = db.ref('trackGames/' + code);
  $('#track-waiting-code').textContent = code;
  $('#track-name-box').classList.remove('hidden');
  $('#track-name-input').value = trackName;

  trackGameRef.on('value', renderTrackMeta);
  trackGameRef.child('spawns').on('child_added', handleSpawnAdded);
  trackGameRef.child('spawns').on('child_changed', handleSpawnChanged);
  trackGameRef.child('spawns').on('child_removed', handleSpawnRemoved);
}

$('#btn-track-copy-code').addEventListener('click', () => {
  navigator.clipboard.writeText(trackCode).then(() => showToast('Code copied.'));
});

// ---------- Editable name box (top left) ----------
function commitNameChange() {
  const input = $('#track-name-input');
  const newName = input.value.trim();
  if (!newName || newName === trackName) {
    input.value = trackName;
    return;
  }
  trackName = newName;
  if (trackGameRef && myUid) {
    trackGameRef.child('players/' + myUid + '/name').set(newName);
  }
}
$('#track-name-input').addEventListener('blur', commitNameChange);
$('#track-name-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('#track-name-input').blur();
});

// ---------- Join a different track, from inside the lobby ----------
$('#btn-track-join-different').addEventListener('click', () => {
  $('#track-join-inline').classList.toggle('hidden');
});
$('#btn-track-join-inline-submit').addEventListener('click', () => {
  const code = $('#track-join-inline-code').value.trim().toUpperCase();
  joinTrackByCode(code);
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
    startBtn.classList.remove('hidden');
    note.textContent = uids.length < 2 ? 'You can start solo, or wait for friends to join.' : 'Ready when you are.';
  } else {
    startBtn.classList.add('hidden');
    note.textContent = 'Waiting for the host to start the track…';
  }

  // Keep the name box in sync if it was changed from another tab/device.
  if (players[myUid] && document.activeElement !== $('#track-name-input')) {
    trackName = players[myUid].name;
    $('#track-name-input').value = trackName;
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
      // Session collection (drives this round's leaderboard)...
      await trackGameRef.child(`collections/${myUid}/${instanceId}`).set(shoeTypeId);
      // ...and the same shoe also lands in your permanent inventory, so it
      // carries over into Duel mode.
      await db.ref(`players/${myUid}/inventory/${instanceId}`).set(shoeTypeId);
      el.classList.add('grabbed-mine');
    } else {
      showToast('Too slow!');
    }
  } catch (err) {
    console.error(err);
    el.disabled = false;
  }
}
