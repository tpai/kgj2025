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

// All players use the same emoji
const PLAYER_EMOJI = '😊';

// Player state storage
const players = {};
// Canvas and emoji dimensions for boundary clamping
const CANVAS_SIZE = 600;
const EMOJI_SIZE = 32;
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
const NPC_COUNT = 100;
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

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);
  // All players use the same emoji; random initial position
  const emoji = PLAYER_EMOJI;
  // Random initial position within canvas bounds (accounting for emoji size)
  const x = Math.floor(Math.random() * (CANVAS_SIZE - EMOJI_SIZE));
  const y = Math.floor(Math.random() * (CANVAS_SIZE - EMOJI_SIZE));
  // Initialize player with emoji, position, and empty speech
  players[socket.id] = { emoji, x, y };

  // Send init data to the new player
  socket.emit('init', { id: socket.id, players });
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

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Listening on port ${PORT}`);
});