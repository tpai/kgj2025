'use strict';
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Serve static files from 'public'
app.use(express.static('public'));

// All players use the same emoji (default, uninfected)
const PLAYER_EMOJI = '😊';
// Strength mapping for infection hierarchy: higher values infect lower values
const EMOJI_STRENGTH = {
  [PLAYER_EMOJI]: 0,
  '🤔': 1,
  '😡': 2,
  '🤑': 3
};

// Player state storage
const players = {};
// Enemy state storage
const enemies = {};
// Canvas and emoji dimensions for boundary clamping
const CANVAS_SIZE = 600;
const EMOJI_SIZE = 32;
// Stage duration (milliseconds)
const STAGE_DURATION = 60000;
// Server start timestamp
const SERVER_START = Date.now();
// Total number of stages (number of enemy waves)
const TOTAL_STAGES = 3;
// NPC configuration: simulate human-like control
// NPC movement speed (pixels per tick)
const NPC_SPEED = 2;
const NPC_MIN_STEPS = 10;
const NPC_MAX_STEPS = 30;
// Possible movement directions (including idle)
const NPC_DIRECTIONS = [
  [0, 1], [1, 0], [0, -1], [-1, 0],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
  [0, 0]
];
// Initialize NPC players (fixed count) with a uniform emoji, positions, and movement state
const NPC_COUNT = 50;
for (let i = 0; i < NPC_COUNT; i++) {
  const npcId = `npc_${i}`;
  // NPCs all share the same avatar
  const npcEmoji = PLAYER_EMOJI;
  const npcX = Math.floor(Math.random() * (CANVAS_SIZE - EMOJI_SIZE));
  const npcY = Math.floor(Math.random() * (CANVAS_SIZE - EMOJI_SIZE));
  const dir = NPC_DIRECTIONS[Math.floor(Math.random() * NPC_DIRECTIONS.length)];
  const steps = Math.floor(Math.random() * (NPC_MAX_STEPS - NPC_MIN_STEPS + 1)) + NPC_MIN_STEPS;
  players[npcId] = {
    emoji: npcEmoji,
    x: npcX,
    y: npcY,
    dirX: dir[0],
    dirY: dir[1],
    steps
  };
}

	// Enemy and stage progression logic
	function spawnEnemy(enemyId, emoji) {
	  const x = Math.floor(Math.random() * (CANVAS_SIZE - EMOJI_SIZE));
	  const y = Math.floor(Math.random() * (CANVAS_SIZE - EMOJI_SIZE));
	  const dir = NPC_DIRECTIONS[Math.floor(Math.random() * NPC_DIRECTIONS.length)];
	  const steps = Math.floor(Math.random() * (NPC_MAX_STEPS - NPC_MIN_STEPS + 1)) + NPC_MIN_STEPS;
	  enemies[enemyId] = { emoji, x, y, dirX: dir[0], dirY: dir[1], steps };
	  io.emit('enemyJoined', { id: enemyId, emoji, x, y });
	}
	// Stage 1: spawn thinking enemy immediately
	spawnEnemy('enemy1', '🤔');
	// Stage 2: spawn angry emoji after STAGE_DURATION
	setTimeout(() => spawnEnemy('enemy2', '😡'), STAGE_DURATION);
	// Stage 3: spawn money-mouth emoji after 2*STAGE_DURATION
	setTimeout(() => spawnEnemy('enemy3', '🤑'), STAGE_DURATION * 2);
	// End game after TOTAL_STAGES*STAGE_DURATION: determine survivors and notify clients
	setTimeout(() => {
	  const survivors = Object.keys(players).filter(id => !id.startsWith('npc_') && players[id].emoji === PLAYER_EMOJI);
	  io.emit('gameOver', { survivors });
	}, STAGE_DURATION * TOTAL_STAGES);

	io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);
  // All players use the same emoji; random initial position
  const emoji = PLAYER_EMOJI;
  // Random initial position within canvas bounds (accounting for emoji size)
  const x = Math.floor(Math.random() * (CANVAS_SIZE - EMOJI_SIZE));
  const y = Math.floor(Math.random() * (CANVAS_SIZE - EMOJI_SIZE));
  // Initialize player with emoji, position, and empty speech
  players[socket.id] = { emoji, x, y };

  // Send init data to the new player, including timing for countdown
  socket.emit('init', {
    id: socket.id,
    players,
    enemies,
    serverStart: SERVER_START,
    stageDuration: STAGE_DURATION,
    totalStages: TOTAL_STAGES
  });
  // Notify other players
  socket.broadcast.emit('playerJoined', { id: socket.id, player: players[socket.id] });

  // Handle movement events
  socket.on('move', ({ x, y }) => {
    if (players[socket.id]) {
      players[socket.id].x = x;
      players[socket.id].y = y;
      io.emit('playerMoved', { id: socket.id, x, y });
    }
  });
  

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    delete players[socket.id];
    io.emit('playerLeft', socket.id);
  });
});

// NPC movement loop: human-like control by running straight then changing direction
// NPC movement ticker (more frequent for smoother motion)
setInterval(() => {
  Object.keys(players).forEach((id) => {
    if (id.startsWith('npc_')) {
      const p = players[id];
      // Choose new direction and duration when steps exhausted
      if (p.steps <= 0) {
        const nd = NPC_DIRECTIONS[Math.floor(Math.random() * NPC_DIRECTIONS.length)];
        p.dirX = nd[0];
        p.dirY = nd[1];
        p.steps = Math.floor(Math.random() * (NPC_MAX_STEPS - NPC_MIN_STEPS + 1)) + NPC_MIN_STEPS;
      }
      // Move according to current direction and speed
      p.x = Math.max(0, Math.min(CANVAS_SIZE - EMOJI_SIZE, p.x + p.dirX * NPC_SPEED));
      p.y = Math.max(0, Math.min(CANVAS_SIZE - EMOJI_SIZE, p.y + p.dirY * NPC_SPEED));
      p.steps--;
      io.emit('playerMoved', { id, x: p.x, y: p.y });
    }
  });
}, 50);
// Infection spread loop: infected players/NPCs and all enemies can infect default players
setInterval(() => {
  const infectors = [];
  // include all enemies as infectors
  Object.values(enemies).forEach(e => {
    infectors.push({ x: e.x, y: e.y, emoji: e.emoji });
  });
  // include infected players (emoji not default)
  Object.values(players).forEach(p => {
    if (p.emoji !== PLAYER_EMOJI) {
      infectors.push({ x: p.x, y: p.y, emoji: p.emoji });
    }
  });
  // infect weaker players on collision (infector must be stronger)
  infectors.forEach(inf => {
    Object.entries(players).forEach(([pid, p]) => {
      if (
        EMOJI_STRENGTH[inf.emoji] > EMOJI_STRENGTH[p.emoji] &&
        Math.abs(p.x - inf.x) < EMOJI_SIZE &&
        Math.abs(p.y - inf.y) < EMOJI_SIZE
      ) {
        players[pid].emoji = inf.emoji;
        io.emit('playerEmojiChanged', { id: pid, emoji: inf.emoji });
      }
    });
  });
  // infect weaker enemies on collision (infector must be stronger)
  infectors.forEach(inf => {
    Object.entries(enemies).forEach(([eid, e]) => {
      if (
        EMOJI_STRENGTH[inf.emoji] > EMOJI_STRENGTH[e.emoji] &&
        Math.abs(e.x - inf.x) < EMOJI_SIZE &&
        Math.abs(e.y - inf.y) < EMOJI_SIZE
      ) {
        enemies[eid].emoji = inf.emoji;
        io.emit('enemyEmojiChanged', { id: eid, emoji: inf.emoji });
      }
    });
  });
}, 50);
// Enemy movement loop: simulate human-like control and handle collisions
setInterval(() => {
  Object.keys(enemies).forEach((id) => {
    const e = enemies[id];
    if (e.steps <= 0) {
      const nd = NPC_DIRECTIONS[Math.floor(Math.random() * NPC_DIRECTIONS.length)];
      e.dirX = nd[0];
      e.dirY = nd[1];
      e.steps = Math.floor(Math.random() * (NPC_MAX_STEPS - NPC_MIN_STEPS + 1)) + NPC_MIN_STEPS;
    }
    // Update enemy position
    e.x = Math.max(0, Math.min(CANVAS_SIZE - EMOJI_SIZE, e.x + e.dirX * NPC_SPEED));
    e.y = Math.max(0, Math.min(CANVAS_SIZE - EMOJI_SIZE, e.y + e.dirY * NPC_SPEED));
    e.steps--;
    io.emit('enemyMoved', { id, x: e.x, y: e.y });
    // Collision detection with players
    Object.keys(players).forEach((pid) => {
      const p = players[pid];
      if (p.emoji !== e.emoji &&
          Math.abs(p.x - e.x) < EMOJI_SIZE &&
          Math.abs(p.y - e.y) < EMOJI_SIZE) {
        players[pid].emoji = e.emoji;
        io.emit('playerEmojiChanged', { id: pid, emoji: e.emoji });
      }
    });
  });
}, 50);

server.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
});
