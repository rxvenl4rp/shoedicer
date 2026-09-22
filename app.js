// app.js — SoleDuel game logic.

// ---------- Firebase setup ----------
firebase.initializeApp(FIREBASE_CONFIG);
const auth = firebase.auth();
const db = firebase.database();

let myUid = null;
let myName = '';
let gameCode = null;
let gameRef = null;
let lastPhaseSeen = null;

// ---------- DOM ----------
const $ = (sel) => document.querySelector(sel);
const screens = {
  lobby: $('#screen-lobby'),
  waiting: $('#screen-waiting'),
  game: $('#screen-game'),
};

function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[name].classList.add('active');
}

function showToast(msg) {
  const toast = $('#toast');
  toast.textContent = msg;
  toast.classList.remove('hidden');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.add('hidden'), 3200);
}

// ---------- Auth ----------
auth.onAuthStateChanged((user) => {
  if (user) {
    myUid = user.uid;
  }
});
auth.signInAnonymously().catch((err) => {
  console.error(err);
  showToast("Couldn't connect — check your Firebase config in firebase-config.js");
});

// ---------- Lobby ----------
function randomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I to avoid mixups
  let code = '';
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

$('#tab-create').addEventListener('click', () => switchTab('create'));
$('#tab-join').addEventListener('click', () => switchTab('join'));
function switchTab(which) {
  $('#tab-create').classList.toggle('active', which === 'create');
  $('#tab-join').classList.toggle('active', which === 'join');
  $('#panel-create').classList.toggle('hidden', which !== 'create');
  $('#panel-join').classList.toggle('hidden', which !== 'join');
}

$('#btn-create-game').addEventListener('click', async () => {
  const name = $('#name-create').value.trim();
  if (!name) return showToast('Enter your name first.');
  if (!myUid) return showToast('Still connecting — try again in a second.');
  $('#btn-create-game').disabled = true;
  try {
    const code = randomCode();
    const ref = db.ref('games/' + code);
    await ref.set({
      createdAt: firebase.database.ServerValue.TIMESTAMP,
      status: 'waiting',
      players: {
        [myUid]: { name, order: 0 }
      },
      log: { m0: { text: `${name} created the game.`, ts: Date.now() } }
    });
    myName = name;
    attachToGame(code);
  } catch (err) {
    console.error(err);
    showToast('Could not create a game. Check your Firebase setup.');
  } finally {
    $('#btn-create-game').disabled = false;
  }
});

$('#btn-join-game').addEventListener('click', async () => {
  const name = $('#name-join').value.trim();
  const code = $('#code-join').value.trim().toUpperCase();
  if (!name) return showToast('Enter your name first.');
  if (!code) return showToast('Enter a game code.');
  if (!myUid) return showToast('Still connecting — try again in a second.');
  $('#btn-join-game').disabled = true;
  try {
    const ref = db.ref('games/' + code);
    const snap = await ref.get();
    if (!snap.exists()) {
      showToast("That code doesn't match a game.");
      return;
    }
    const data = snap.val();
    const players = data.players || {};
    const uids = Object.keys(players);

    if (uids.includes(myUid)) {
      // Rejoining a game we're already in (e.g. after a refresh).
      myName = players[myUid].name;
      attachToGame(code);
      return;
    }
    if (uids.length >= 2) {
      showToast('That game is already full.');
      return;
    }

    await ref.child('players/' + myUid).set({ name, order: 1 });
    await ref.child('log').push({ text: `${name} joined the game.`, ts: Date.now() });

    // Second player joining kicks off the match.
    const startCollections = {
      [uids[0]]: makeStartingCollection(3),
      [myUid]: makeStartingCollection(3),
    };
    await ref.update({
      status: 'playing',
      collections: startCollections,
      turn: uids[0],
      round: { phase: 'staking', num: 1, stakes: {}, ready: {} },
    });

    myName = name;
    attachToGame(code);
  } catch (err) {
    console.error(err);
    showToast('Could not join that game. Check your Firebase setup.');
  } finally {
    $('#btn-join-game').disabled = false;
  }
});

function attachToGame(code) {
  gameCode = code;
  gameRef = db.ref('games/' + code);
  $('#waiting-code').textContent = code;
  gameRef.on('value', (snap) => {
    const data = snap.val();
    if (!data) return;
    render(data);
  });
}

$('#btn-copy-code').addEventListener('click', () => {
  navigator.clipboard.writeText(gameCode).then(() => showToast('Code copied.'));
});

// ---------- Rendering ----------
function render(data) {
  const players = data.players || {};
  const uids = Object.keys(players);

  if (data.status === 'waiting') {
    showScreen('waiting');
    return;
  }
  if (data.status !== 'playing' && data.status !== 'finished') return;

  showScreen('game');

  const opponentUid = uids.find(u => u !== myUid);
  const me = players[myUid];
  const opp = opponentUid ? players[opponentUid] : null;

  $('#my-name').textContent = me ? me.name : 'You';
  $('#opp-name').textContent = opp ? opp.name : 'Waiting for opponent…';
  $('#game-code-badge').textContent = gameCode;

  const collections = data.collections || {};
  renderShelf($('#my-shelf'), collections[myUid] || {});
  renderShelf($('#opp-shelf'), collections[opponentUid] || {});

  renderLog(data.log || {});

  const round = data.round || { phase: 'staking' };
  const isMyTurn = data.turn === myUid;
  renderDuel(data, round, isMyTurn, opponentUid, players);

  if (data.status === 'finished' && lastPhaseSeen !== 'finished-shown') {
    lastPhaseSeen = 'finished-shown';
    const winnerName = players[data.winner] ? players[data.winner].name : 'Someone';
    showWinner(winnerName, data.winner === myUid);
  }
}

function renderShelf(el, collection) {
  el.innerHTML = '';
  const keys = Object.keys(collection);
  if (keys.length === 0) {
    el.innerHTML = '<p class="shelf-empty">No shoes left.</p>';
    return;
  }
  keys.forEach((k) => {
    const shoe = shoeById(collection[k]);
    if (!shoe) return;
    const card = document.createElement('div');
    card.className = 'shoe-card';
    card.dataset.rarity = shoe.rarity;
    card.innerHTML = `
      <div class="shoe-icon" style="filter: hue-rotate(${shoe.hue}deg)">👟</div>
      <div class="shoe-name">${shoe.name}</div>
      <div class="shoe-rarity">${RARITY_LABEL[shoe.rarity]}</div>
    `;
    el.appendChild(card);
  });
}

function renderLog(logObj) {
  const entries = Object.values(logObj).sort((a, b) => a.ts - b.ts).slice(-8);
  const el = $('#duel-log');
  el.innerHTML = entries.map(e => `<div class="log-line">${e.text}</div>`).join('');
  el.scrollTop = el.scrollHeight;
}

function renderDuel(data, round, isMyTurn, opponentUid, players) {
  const panel = $('#duel-panel');
  const phase = round.phase || 'staking';
  const oppName = players[opponentUid] ? players[opponentUid].name : 'your opponent';
  const myTurnName = isMyTurn ? 'Your' : `${oppName}'s`;

  $('#turn-indicator').textContent = `${myTurnName} call — round ${round.num || 1}`;

  if (data.status === 'finished') {
    panel.innerHTML = `<p class="duel-hint">The match is over.</p>`;
    return;
  }

  if (phase === 'staking') {
    renderStaking(panel, data, round, opponentUid, oppName);
    return;
  }

  if (phase === 'coin_call') {
    if (isMyTurn) {
      panel.innerHTML = `
        <p class="duel-hint">Both stakes are in. Call the coin.</p>
        <div class="call-buttons">
          <button class="btn btn-call" id="call-heads">Heads</button>
          <button class="btn btn-call" id="call-tails">Tails</button>
        </div>`;
      $('#call-heads').addEventListener('click', () => callCoin('heads'));
      $('#call-tails').addEventListener('click', () => callCoin('tails'));
    } else {
      panel.innerHTML = `<p class="duel-hint">Waiting for ${oppName} to call the coin…</p>`;
    }
    return;
  }

  if (phase === 'called' || phase === 'coin_result') {
    const flipped = phase === 'coin_result';
    const result = round.coinResult;
    panel.innerHTML = `
      <div class="coin ${flipped ? 'settled' : 'flipping'}">
        <span class="coin-face">${flipped ? (result === 'heads' ? 'H' : 'T') : ''}</span>
      </div>
      <p class="duel-hint">${flipped ? coinResultText(round, players) : 'Flipping…'}</p>
    `;

    if (flipped && round.coinWin && round.caller === myUid) {
      const colorRow = document.createElement('div');
      colorRow.className = 'color-buttons';
      colorRow.innerHTML = COLORS.map(c =>
        `<button class="color-swatch" data-color="${c.id}" style="background:${c.hex}" title="${c.label}"></button>`
      ).join('');
      panel.appendChild(colorRow);
      colorRow.querySelectorAll('.color-swatch').forEach(btn => {
        btn.addEventListener('click', () => chooseColor(btn.dataset.color));
      });
    } else if (flipped && round.coinWin && round.caller !== myUid) {
      const p = document.createElement('p');
      p.className = 'duel-hint';
      p.textContent = `${oppName} is choosing a color…`;
      panel.appendChild(p);
    }
    return;
  }

  if (phase === 'color_phase' || phase === 'dice_result') {
    const rolled = phase === 'dice_result';
    panel.innerHTML = `
      <p class="duel-hint">${players[round.caller] ? players[round.caller].name : ''} called <b style="color:${colorHex(round.colorChoice)}">${labelFor(round.colorChoice)}</b></p>
      <div class="die ${rolled ? 'settled' : 'rolling'}" style="${rolled ? 'background:' + colorHex(round.dieResult) : ''}"></div>
      <p class="duel-hint">${rolled ? diceOutcomeText(round) : 'Rolling…'}</p>
    `;
    return;
  }

  if (phase === 'resolved') {
    panel.innerHTML = `<p class="duel-hint">${round.resolution || ''}</p>`;
    return;
  }
}

function renderStaking(panel, data, round, opponentUid, oppName) {
  const ready = round.ready || {};
  const myReady = !!ready[myUid];
  const oppReady = !!ready[opponentUid];

  // Safety net: if both sides are ready but the phase hasn't moved on yet
  // (e.g. both players locked in within the same instant), nudge it forward.
  if (myReady && oppReady) {
    gameRef.child('round/phase').set('coin_call').catch(() => {});
  }

  const myCollection = (data.collections && data.collections[myUid]) || {};
  const myStakeKey = round.stakes && round.stakes[myUid];

  if (myReady) {
    const shoe = myStakeKey ? shoeById(myCollection[myStakeKey]) : null;
    panel.innerHTML = `
      <p class="duel-hint">You staked ${shoe ? shoe.name : 'a shoe'}.</p>
      <p class="duel-hint">${oppReady ? 'Starting round…' : `Waiting for ${oppName} to stake a shoe…`}</p>
    `;
    return;
  }

  const keys = Object.keys(myCollection);
  if (keys.length === 0) {
    panel.innerHTML = `<p class="duel-hint">You have no shoes left to stake.</p>`;
    return;
  }

  panel.innerHTML = `
    <p class="duel-hint">Pick a shoe to put up for this round.</p>
    <div class="stake-picker" id="stake-picker"></div>
    <button class="btn btn-call" id="btn-lock-stake" disabled>Lock in stake</button>
  `;

  const pickerEl = panel.querySelector('#stake-picker');
  const lockBtn = panel.querySelector('#btn-lock-stake');
  let selected = null;

  function drawPicker() {
    pickerEl.innerHTML = keys.map((k) => {
      const shoe = shoeById(myCollection[k]);
      return `
        <button class="stake-shoe ${selected === k ? 'selected' : ''}" data-key="${k}" data-rarity="${shoe.rarity}">
          <span class="shoe-icon" style="filter: hue-rotate(${shoe.hue}deg)">👟</span>
          <span class="shoe-name">${shoe.name}</span>
        </button>`;
    }).join('');
    pickerEl.querySelectorAll('.stake-shoe').forEach((btn) => {
      btn.addEventListener('click', () => {
        selected = btn.dataset.key;
        drawPicker();
        lockBtn.disabled = false;
      });
    });
  }
  drawPicker();

  lockBtn.addEventListener('click', () => {
    lockBtn.disabled = true;
    lockInStake(selected, opponentUid);
  });
}

function labelFor(colorId) {
  const c = COLORS.find(x => x.id === colorId);
  return c ? c.label : '';
}
function coinResultText(round, players) {
  const callerName = players[round.caller] ? players[round.caller].name : 'Caller';
  const resultWord = round.coinResult === 'heads' ? 'Heads' : 'Tails';
  return round.coinWin
    ? `${resultWord}! ${callerName} called it right.`
    : `${resultWord}. ${callerName} called wrong.`;
}
function colorHex(colorId) {
  const c = COLORS.find(x => x.id === colorId);
  return c ? c.hex : '#444';
}
function diceOutcomeText(round) {
  return round.outcome === 'hit'
    ? `${labelFor(round.colorChoice)} landed — that's a hit!`
    : `${labelFor(round.colorChoice)} didn't land — instant loss.`;
}

// ---------- Colors ----------
const COLORS = [
  { id: 'red', label: 'Red', hex: '#E8433A' },
  { id: 'orange', label: 'Orange', hex: '#FF8C2B' },
  { id: 'yellow', label: 'Yellow', hex: '#FFC93C' },
  { id: 'green', label: 'Green', hex: '#3DAA5B' },
  { id: 'blue', label: 'Blue', hex: '#3D7DFF' },
  { id: 'purple', label: 'Purple', hex: '#9B5DE5' },
];

// ---------- Duel actions ----------
// The player whose turn it is acts as the "authority" for coin/dice rolls:
// they generate the random results and write them to the database. Both
// browsers read the same final values, so both sides always agree.
// For staking, each player writes only their own stake/ready flag.

async function lockInStake(instanceKey, opponentUid) {
  await gameRef.child(`round/stakes/${myUid}`).set(instanceKey);
  await gameRef.child(`round/ready/${myUid}`).set(true);

  const snap = await gameRef.child('round/ready').get();
  const readyMap = snap.val() || {};
  if (readyMap[opponentUid]) {
    await gameRef.child('round/phase').set('coin_call');
  }
}

async function callCoin(choice) {
  await gameRef.child('round').update({
    phase: 'called',
    caller: myUid,
    call: choice,
  });

  setTimeout(async () => {
    const coinResult = Math.random() < 0.5 ? 'heads' : 'tails';
    const coinWin = coinResult === choice;
    await gameRef.child('round').update({
      phase: 'coin_result',
      coinResult,
      coinWin,
    });
    if (!coinWin) {
      finishRoundNoColor(choice, coinResult);
    }
  }, 1200);
}

async function finishRoundNoColor(choice, coinResult) {
  const dataSnap = await gameRef.get();
  const data = dataSnap.val();
  const players = data.players || {};
  const name = players[myUid] ? players[myUid].name : 'Player';
  const oppUid = Object.keys(players).find(u => u !== myUid);
  const resolutionText = `${name} called ${choice}, coin landed ${coinResult}. Stakes return — turn passes.`;
  await appendLog(resolutionText);
  await gameRef.child('round').update({ phase: 'resolved', resolution: resolutionText });
  await advanceTurn(oppUid, data.round.num || 1);
}

async function chooseColor(colorId) {
  await gameRef.child('round').update({
    phase: 'color_phase',
    colorChoice: colorId,
  });

  setTimeout(async () => {
    const roll = COLORS[Math.floor(Math.random() * COLORS.length)].id;
    const outcome = roll === colorId ? 'hit' : 'miss';
    await gameRef.child('round').update({
      phase: 'dice_result',
      dieResult: roll,
      outcome,
    });
    await handleDiceOutcome(colorId, outcome);
  }, 1400);
}

async function handleDiceOutcome(colorId, outcome) {
  const dataSnap = await gameRef.get();
  const data = dataSnap.val();
  const players = data.players || {};
  const name = players[myUid] ? players[myUid].name : 'Player';
  const oppUid = Object.keys(players).find(u => u !== myUid);
  const oppName = players[oppUid] ? players[oppUid].name : 'Opponent';
  const roundNum = (data.round && data.round.num) || 1;
  const stakes = (data.round && data.round.stakes) || {};
  const myStakeKey = stakes[myUid];
  const oppStakeKey = stakes[oppUid];

  const winnerUid = outcome === 'hit' ? myUid : oppUid;
  const loserUid = outcome === 'hit' ? oppUid : myUid;
  const stakeKeyAtRisk = outcome === 'hit' ? oppStakeKey : myStakeKey;

  let resolutionText;
  const loserCollection = (data.collections && data.collections[loserUid]) || {};
  const shoe = stakeKeyAtRisk ? shoeById(loserCollection[stakeKeyAtRisk]) : null;

  if (outcome === 'hit') {
    resolutionText = shoe
      ? `${name} called ${labelFor(colorId)} — it landed! Took ${shoe.name} from ${oppName}.`
      : `${name} called ${labelFor(colorId)} — it landed, but the stake was already gone.`;
  } else {
    resolutionText = shoe
      ? `${name} called ${labelFor(colorId)} — it didn't land. Instant loss: ${oppName} takes ${shoe.name}.`
      : `${name} called ${labelFor(colorId)} — it didn't land. Instant loss.`;
  }
  await appendLog(resolutionText);

  if (stakeKeyAtRisk && shoe) {
    await gameRef.child(`collections/${loserUid}/${stakeKeyAtRisk}`).remove();
    await gameRef.child(`collections/${winnerUid}/${stakeKeyAtRisk}`).set(shoe.id);
  }

  const remainingForLoser = Object.keys(loserCollection).filter(k => k !== stakeKeyAtRisk);
  if (stakeKeyAtRisk && shoe && remainingForLoser.length === 0) {
    await gameRef.update({ status: 'finished', winner: winnerUid });
    await gameRef.child('round').update({ phase: 'resolved', resolution: resolutionText });
    return;
  }

  await gameRef.child('round').update({ phase: 'resolved', resolution: resolutionText });
  await advanceTurn(oppUid, roundNum);
}

async function appendLog(text) {
  await gameRef.child('log').push({ text, ts: Date.now() });
  // Trim the log so it doesn't grow forever.
  const snap = await gameRef.child('log').get();
  const entries = Object.entries(snap.val() || {});
  if (entries.length > 30) {
    entries.sort((a, b) => a[1].ts - b[1].ts);
    const toRemove = entries.slice(0, entries.length - 30);
    const updates = {};
    toRemove.forEach(([k]) => (updates[k] = null));
    await gameRef.child('log').update(updates);
  }
}

async function advanceTurn(nextTurnUid, currentRoundNum) {
  setTimeout(async () => {
    await gameRef.update({ turn: nextTurnUid });
    await gameRef.child('round').set({ phase: 'staking', num: (currentRoundNum || 1) + 1, stakes: {}, ready: {} });
  }, 2600);
}

// ---------- Winner overlay ----------
function showWinner(name, isMe) {
  const overlay = $('#winner-overlay');
  $('#winner-text').textContent = isMe ? 'You cleaned out their shelf!' : `${name} cleaned out the shelf.`;
  overlay.classList.remove('hidden');
}
$('#btn-play-again').addEventListener('click', () => {
  window.location.reload();
});
