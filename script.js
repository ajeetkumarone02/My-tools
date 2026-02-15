const COLORS = [
  { name: 'Red', key: 'red', start: 0, color: '#d62828' },
  { name: 'Green', key: 'green', start: 13, color: '#2a9d8f' },
  { name: 'Yellow', key: 'yellow', start: 26, color: '#e9c46a' },
  { name: 'Blue', key: 'blue', start: 39, color: '#277da1' },
];

const SAFE_SQUARES = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
const TOKENS_PER_PLAYER = 4;
const FINAL_PROGRESS = 57;

const state = {
  players: COLORS.map((color) => ({
    ...color,
    tokens: Array.from({ length: TOKENS_PER_PLAYER }, (_, i) => ({ id: i, progress: -1 })),
    sixStreak: 0,
    finished: 0,
  })),
  currentPlayer: 0,
  dice: null,
  awaitingMove: false,
  gameOver: false,
};

const currentPlayerEl = document.getElementById('currentPlayer');
const diceValueEl = document.getElementById('diceValue');
const sixStreakEl = document.getElementById('sixStreak');
const rollBtn = document.getElementById('rollBtn');
const trackEl = document.getElementById('track');
const tokenPanelEl = document.getElementById('tokenPanel');
const logEl = document.getElementById('log');
const homeLanesEl = document.getElementById('homeLanes');

function globalPos(player, progress) {
  return (player.start + progress) % 52;
}

function addLog(text) {
  const li = document.createElement('li');
  li.textContent = text;
  logEl.prepend(li);
}

function occupancy() {
  const map = new Map();
  state.players.forEach((player, pIdx) => {
    player.tokens.forEach((token, tIdx) => {
      if (token.progress >= 0 && token.progress <= 51) {
        const g = globalPos(player, token.progress);
        if (!map.has(g)) map.set(g, []);
        map.get(g).push({ pIdx, tIdx });
      }
    });
  });
  return map;
}

function isBlockade(squareOccupants) {
  const byColor = new Map();
  squareOccupants.forEach(({ pIdx }) => {
    byColor.set(pIdx, (byColor.get(pIdx) || 0) + 1);
  });
  return [...byColor.values()].some((count) => count >= 2);
}

function canMoveToken(playerIdx, tokenIdx, dice) {
  const player = state.players[playerIdx];
  const token = player.tokens[tokenIdx];
  const occ = occupancy();

  if (token.progress === FINAL_PROGRESS) return { ok: false, reason: 'Already finished' };

  if (token.progress === -1) {
    if (dice !== 6) return { ok: false, reason: 'Need 6 to enter board' };
    const destination = player.start;
    const destOcc = occ.get(destination) || [];
    const ownCount = destOcc.filter((x) => x.pIdx === playerIdx).length;
    if (ownCount >= 2) return { ok: false, reason: 'Own blockade at entry' };
    if (isBlockade(destOcc) && ownCount === 0) return { ok: false, reason: 'Entry blocked by blockade' };
    return { ok: true, toProgress: 0 };
  }

  const target = token.progress + dice;
  if (target > FINAL_PROGRESS) return { ok: false, reason: 'Need exact roll to finish' };

  if (token.progress <= 51) {
    for (let step = 1; step <= dice; step += 1) {
      const traversed = token.progress + step;
      if (traversed > 51) break;
      const square = globalPos(player, traversed);
      const sqOcc = occ.get(square) || [];
      const filtered = sqOcc.filter((o) => !(o.pIdx === playerIdx && o.tIdx === tokenIdx));
      if (isBlockade(filtered)) return { ok: false, reason: 'Path blocked by blockade' };
    }
  }

  if (target <= 51) {
    const destination = globalPos(player, target);
    const destOcc = occ.get(destination) || [];
    const destWithoutSelf = destOcc.filter((o) => !(o.pIdx === playerIdx && o.tIdx === tokenIdx));
    const ownCount = destWithoutSelf.filter((x) => x.pIdx === playerIdx).length;
    if (ownCount >= 2) return { ok: false, reason: 'Cannot stack more than 2 tokens' };
    const opponents = destWithoutSelf.filter((x) => x.pIdx !== playerIdx);
    if (isBlockade(destWithoutSelf) && ownCount === 0) return { ok: false, reason: 'Destination blockade' };
    if (SAFE_SQUARES.has(destination) && opponents.length) {
      return { ok: true, toProgress: target, capture: [] };
    }
    if (opponents.length >= 2) return { ok: false, reason: 'Opponent blockade on destination' };
    return { ok: true, toProgress: target, capture: SAFE_SQUARES.has(destination) ? [] : opponents };
  }

  return { ok: true, toProgress: target, capture: [] };
}

function moveToken(playerIdx, tokenIdx) {
  const player = state.players[playerIdx];
  const token = player.tokens[tokenIdx];
  const check = canMoveToken(playerIdx, tokenIdx, state.dice);
  if (!check.ok) return;

  token.progress = check.toProgress;
  let captured = 0;
  (check.capture || []).forEach(({ pIdx, tIdx }) => {
    state.players[pIdx].tokens[tIdx].progress = -1;
    captured += 1;
  });

  if (token.progress === FINAL_PROGRESS) {
    player.finished += 1;
    addLog(`${player.name} token ${tokenIdx + 1} reached home!`);
  }

  if (captured > 0) {
    addLog(`${player.name} captured ${captured} token(s)!`);
  }

  if (player.finished === TOKENS_PER_PLAYER) {
    state.gameOver = true;
    addLog(`${player.name} wins the game!`);
    rollBtn.disabled = true;
  }

  const getsExtra = state.dice === 6 || captured > 0 || token.progress === FINAL_PROGRESS;
  if (!state.gameOver && getsExtra) {
    addLog(`${player.name} gets an extra roll.`);
    state.awaitingMove = false;
    state.dice = null;
  } else if (!state.gameOver) {
    endTurn();
  }

  render();
}

function movableTokensForCurrentPlayer() {
  return state.players[state.currentPlayer].tokens
    .map((_, idx) => ({ idx, result: canMoveToken(state.currentPlayer, idx, state.dice) }))
    .filter((entry) => entry.result.ok);
}

function endTurn() {
  state.players[state.currentPlayer].sixStreak = 0;
  state.currentPlayer = (state.currentPlayer + 1) % state.players.length;
  state.awaitingMove = false;
  state.dice = null;
}

function rollDice() {
  if (state.awaitingMove || state.gameOver) return;

  const player = state.players[state.currentPlayer];
  const dice = Math.floor(Math.random() * 6) + 1;
  state.dice = dice;
  addLog(`${player.name} rolled ${dice}.`);

  if (dice === 6) {
    player.sixStreak += 1;
    if (player.sixStreak >= 3) {
      addLog(`${player.name} rolled three 6s in a row. Turn forfeited.`);
      endTurn();
      render();
      return;
    }
  } else {
    player.sixStreak = 0;
  }

  const movable = movableTokensForCurrentPlayer();
  if (!movable.length) {
    addLog(`${player.name} has no legal move.`);
    if (dice === 6) {
      state.awaitingMove = false;
      state.dice = null;
      addLog(`${player.name} may roll again.`);
    } else {
      endTurn();
    }
    render();
    return;
  }

  state.awaitingMove = true;
  render();
}

function renderTrack() {
  const occ = occupancy();
  trackEl.innerHTML = '';
  for (let i = 0; i < 52; i += 1) {
    const cell = document.createElement('div');
    cell.className = `cell ${SAFE_SQUARES.has(i) ? 'safe' : ''}`;
    const label = document.createElement('div');
    label.textContent = `#${i}`;
    cell.appendChild(label);

    const occupants = occ.get(i) || [];
    occupants.forEach(({ pIdx, tIdx }) => {
      const dot = document.createElement('span');
      dot.className = 'token-dot';
      dot.style.background = state.players[pIdx].color;
      dot.title = `${state.players[pIdx].name} T${tIdx + 1}`;
      cell.appendChild(dot);
    });

    trackEl.appendChild(cell);
  }
}

function renderHomeLanes() {
  homeLanesEl.innerHTML = '';
  state.players.forEach((player, pIdx) => {
    const wrap = document.createElement('div');
    wrap.className = 'home-color';
    wrap.innerHTML = `<strong style="color:${player.color}">${player.name}</strong>`;

    const row = document.createElement('div');
    row.className = 'home-row';

    for (let i = 52; i <= 57; i += 1) {
      const hc = document.createElement('div');
      hc.className = 'home-cell';
      hc.textContent = i === 57 ? 'HOME' : `${i - 51}`;
      player.tokens
        .filter((t) => t.progress === i)
        .forEach((_, idx) => {
          const dot = document.createElement('span');
          dot.className = 'token-dot';
          dot.style.background = player.color;
          dot.title = `${player.name} home token ${idx + 1}`;
          hc.appendChild(dot);
        });
      row.appendChild(hc);
    }

    wrap.appendChild(row);

    const yardCount = player.tokens.filter((t) => t.progress === -1).length;
    const finishCount = player.tokens.filter((t) => t.progress === FINAL_PROGRESS).length;
    const info = document.createElement('p');
    info.textContent = `Yard: ${yardCount} | Finished: ${finishCount}`;
    wrap.appendChild(info);

    homeLanesEl.appendChild(wrap);
  });
}

function renderTokenPanel() {
  tokenPanelEl.innerHTML = '';

  state.players.forEach((player, pIdx) => {
    const box = document.createElement('div');
    box.className = `player-box ${pIdx === state.currentPlayer ? 'active' : ''}`;

    const header = document.createElement('h3');
    header.style.color = player.color;
    header.textContent = `${player.name}`;
    box.appendChild(header);

    const tokens = document.createElement('div');
    tokens.className = 'tokens';

    player.tokens.forEach((token, tIdx) => {
      const btn = document.createElement('button');
      btn.className = 'token-btn';
      btn.style.background = player.color;

      let posText = 'Yard';
      if (token.progress >= 0 && token.progress <= 51) {
        posText = `Track ${globalPos(player, token.progress)}`;
      } else if (token.progress >= 52 && token.progress <= FINAL_PROGRESS) {
        posText = token.progress === FINAL_PROGRESS ? 'Finished' : `Home lane ${token.progress - 51}`;
      }
      btn.textContent = `T${tIdx + 1}: ${posText}`;

      const canMove =
        pIdx === state.currentPlayer &&
        state.awaitingMove &&
        canMoveToken(pIdx, tIdx, state.dice).ok;

      btn.disabled = !canMove;
      btn.addEventListener('click', () => moveToken(pIdx, tIdx));
      tokens.appendChild(btn);
    });

    box.appendChild(tokens);
    tokenPanelEl.appendChild(box);
  });
}

function renderStatus() {
  const player = state.players[state.currentPlayer];
  currentPlayerEl.textContent = player.name;
  currentPlayerEl.style.color = player.color;
  diceValueEl.textContent = state.dice ?? '-';
  sixStreakEl.textContent = player.sixStreak;
  rollBtn.disabled = state.awaitingMove || state.gameOver;
}

function render() {
  renderStatus();
  renderTrack();
  renderHomeLanes();
  renderTokenPanel();
}

rollBtn.addEventListener('click', rollDice);

addLog('Game started. Red begins.');
render();
