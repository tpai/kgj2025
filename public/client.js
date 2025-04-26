'use strict';
const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const players = {};
const enemies = {};
// No chat/speech functionality

let myId = null;
// Player movement speed (pixels per frame), aligned with NPC_SPEED on server
const speed = 2;
// Emoji size (px) for boundary clamping
const EMOJI_SIZE = 32;
const keys = {};
// Default emoji for uninfected players
const DEFAULT_EMOJI = '😊';

// Function to display a temporary non-blocking popup message
// Map infected emoji to stage number
const EMOJI_STAGE_MAP = { '🤔': 1, '😡': 2, '🤑': 3 };
function showPopup(message) {
  const popup = document.getElementById('popup');
  if (!popup) return;
  popup.textContent = message;
  popup.style.display = 'block';
  // Force reflow for transition
  void popup.offsetWidth;
  popup.style.opacity = '1';
  setTimeout(() => {
    popup.style.opacity = '0';
    popup.addEventListener('transitionend', function handler() {
      popup.style.display = 'none';
      popup.removeEventListener('transitionend', handler);
    });
  }, 2000);
}

// Timing for countdown (will be set by server)
let serverStart;
let stageDuration;
let totalStages;
// Start main loop once initial data is received
let gameStarted = false;
// Receive initial state
socket.on('init', (data) => {
  // Set up timing from server and adjust for client-server clock skew
  if (data.serverStart != null) {
    if (data.serverNow != null) {
      const offset = Date.now() - data.serverNow;
      serverStart = data.serverStart + offset;
    } else {
      serverStart = data.serverStart;
    }
  }
  if (data.stageDuration != null) stageDuration = data.stageDuration;
  if (data.totalStages != null) totalStages = data.totalStages;
  // Initialize player and entity states
  myId = data.id;
  Object.assign(players, data.players);
  Object.assign(enemies, data.enemies);
  // Start game loop after initial server data
  if (!gameStarted) {
    gameStarted = true;
    gameLoop();
  }
});

// New enemy joined
socket.on('enemyJoined', (data) => {
  enemies[data.id] = { emoji: data.emoji, x: data.x, y: data.y };
  // Notify player of new stage start
  const stageNumber = parseInt(data.id.replace('enemy', ''), 10);
  showPopup(`階段 ${stageNumber} 開始囉！`);
});

// Enemy moved
socket.on('enemyMoved', (data) => {
  if (enemies[data.id]) {
    enemies[data.id].x = data.x;
    enemies[data.id].y = data.y;
  }
});
// Enemy emoji changed by infection
socket.on('enemyEmojiChanged', (data) => {
  if (enemies[data.id]) {
    enemies[data.id].emoji = data.emoji;
  }
});

// Player emoji changed (infection)
socket.on('playerEmojiChanged', (data) => {
  if (players[data.id]) {
    const prevEmoji = players[data.id].emoji;
    players[data.id].emoji = data.emoji;
  }
});

// Game over: display customized celebratory popup and schedule restart
socket.on('gameOver', ({ survivors, restartDelay }) => {
  const popup = document.getElementById('popup');
  if (!popup) return;
  // Tailor message: survivors (kept smile face) vs. others (infected with thinking/angry/money faces)
  let message;
  if (Array.isArray(survivors) && survivors.includes(myId)) {
    message = `習藍4ni？<br>(遊戲將於 ${restartDelay/1000} 秒後自動重啟)`;
  } else {
    message = `玩得很好，以後不要參加心靈課程了。<br>(遊戲將於 ${restartDelay/1000} 秒後自動重啟)`;
  }
  // Include the player's final emoji in large size above the message
  const playerEmoji = (players[myId] && players[myId].emoji) || DEFAULT_EMOJI;
  popup.innerHTML = `<div style="font-size:64px; line-height:1">${playerEmoji}</div>` + message;
  popup.style.display = 'block';
  // Force reflow for transition
  void popup.offsetWidth;
  popup.style.opacity = '1';
  // Hide popup after the restart delay
  setTimeout(() => {
    popup.style.opacity = '0';
    popup.addEventListener('transitionend', function handler() {
      popup.style.display = 'none';
      popup.removeEventListener('transitionend', handler);
    });
  }, restartDelay);
});


// Reset game state on restart
socket.on('gameRestart', (data) => {
  // Set up timing from server restart and adjust clock skew
  if (data.serverStart != null) {
    if (data.serverNow != null) {
      const offset = Date.now() - data.serverNow;
      serverStart = data.serverStart + offset;
    } else {
      serverStart = data.serverStart;
    }
  }
  if (data.stageDuration != null) stageDuration = data.stageDuration;
  if (data.totalStages != null) totalStages = data.totalStages;
  // Reset players to default emoji
  Object.keys(players).forEach(id => {
    players[id].emoji = DEFAULT_EMOJI;
  });
  // Clear enemies
  Object.keys(enemies).forEach(id => delete enemies[id]);
});

// New player joined
socket.on('playerJoined', (data) => {
  players[data.id] = data.player;
});

// Player moved
socket.on('playerMoved', (data) => {
  if (players[data.id]) {
    players[data.id].x = data.x;
    players[data.id].y = data.y;
  }
});

// Player left
socket.on('playerLeft', (id) => {
  delete players[id];
});

// Input handling
// Prevent page scrolling with arrow keys and track key state
window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
    e.preventDefault();
  }
  keys[e.key] = true;
});
window.addEventListener('keyup', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
    e.preventDefault();
  }
  keys[e.key] = false;
});

// Game loop
function gameLoop() {
  if (myId && players[myId]) {
    const player = players[myId];
    let moved = false;
    if (keys['ArrowUp'] || keys['w']) { player.y = Math.max(0, player.y - speed); moved = true; }
    if (keys['ArrowDown'] || keys['s']) {
      player.y = Math.min(canvas.height - EMOJI_SIZE, player.y + speed);
      moved = true;
    }
    if (keys['ArrowLeft'] || keys['a']) { player.x = Math.max(0, player.x - speed); moved = true; }
    if (keys['ArrowRight'] || keys['d']) {
      player.x = Math.min(canvas.width - EMOJI_SIZE, player.x + speed);
      moved = true;
    }
    if (moved) {
      socket.emit('move', { x: player.x, y: player.y });
    }
  }
  draw();
  updateSidebar();
  requestAnimationFrame(gameLoop);
}

// Draw all players
function draw() {
  // Clear screen
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // No background speech overlays
  // Draw each player
  for (const id in players) {
    const p = players[id];
    ctx.font = '32px serif';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#000';
    ctx.fillText(p.emoji, p.x, p.y);
  }
  // Draw enemies
  for (const id in enemies) {
    const e = enemies[id];
    ctx.font = '32px serif';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#000';
    ctx.fillText(e.emoji, e.x, e.y);
  }
}


// Update sidebar with current stage and emoji counts
function updateSidebar() {
  // Stage is number of enemies spawned (1 to 3)
  const stage = Object.keys(enemies).length;
  const stageEl = document.getElementById('stage');
  if (stageEl) stageEl.textContent = stage;
  // Count players and enemies by emoji
  const counts = {};
  ['😊','🤔','😡','🤑'].forEach(e => { counts[e] = 0; });
  // Count player emojis (including NPCs)
  for (const id in players) {
    const em = players[id].emoji;
    if (counts.hasOwnProperty(em)) counts[em]++;
  }
  // Count enemy emojis
  for (const id in enemies) {
    const em = enemies[id].emoji;
    if (counts.hasOwnProperty(em)) counts[em]++;
  }
  // Update counts in sidebar
  document.querySelectorAll('#emojiCounts li').forEach(li => {
    const e = li.getAttribute('data-emoji');
    const span = li.querySelector('.count');
    if (span && counts[e] !== undefined) span.textContent = counts[e];
  });
}
// No speech events
