'use strict';
const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const players = {};
// No chat/speech functionality

let myId = null;
// Player movement speed (pixels per frame), aligned with NPC_SPEED on server
const speed = 2;
// Emoji size (px) for boundary clamping
const EMOJI_SIZE = 32;
const keys = {};

// Receive initial state
socket.on('init', (data) => {
  myId = data.id;
  Object.assign(players, data.players);
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
    // Draw emoji avatar
    ctx.font = '32px serif';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#000';
    ctx.fillText(p.emoji, p.x, p.y);
  }
}


// No speech events

gameLoop();