'use strict';
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3003;

// Serve static files from 'public'
app.use(express.static('public'));
// Serve assets directory for images and sounds
app.use('/assets', express.static('assets'));
// Serve background image from root directory
app.use(express.static('.'));

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
// Collision detection radius for infections (px)
const COLLISION_RADIUS = EMOJI_SIZE / 2; // Perfect circle matching emoji size
const COLLISION_DIST_SQ = COLLISION_RADIUS * COLLISION_RADIUS;
// Stage duration (milliseconds)
const STAGE_DURATION = 30000;
// Server start timestamp
let SERVER_START = Date.now();
// Total number of stages (number of enemy waves)
const TOTAL_STAGES = 3;
// NPC configuration: simulate human-like control
// Speeds for NPCs and enemies (pixels per tick)
const NPC_SPEED = 3; // 150% of base speed
const ENEMY_SPEED = 4; // doubled base speed
const NPC_MIN_STEPS = 10;
const NPC_MAX_STEPS = 30;
// Possible movement directions (including idle)
const NPC_DIRECTIONS = [
  [0, 1], [1, 0], [0, -1], [-1, 0],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
  [0, 0]
];
// Initialize NPC players (fixed count) with a uniform emoji, positions, and movement state
const NPC_COUNT = 10;
// Distance within which stronger entities begin chasing weaker ones
const TRACK_DISTANCE = 150;
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
  // Game cycle control: spawn stages, handle game over, and loop
  const RESTART_DELAY = 10000;
  let gameTimeouts = [];

  function clearGameTimeouts() {
    gameTimeouts.forEach(t => clearTimeout(t));
    gameTimeouts = [];
  }

  function startGameCycle() {
    clearGameTimeouts();
    // Reset server start time
    SERVER_START = Date.now();
    // Reset all players to default emoji and notify
    Object.keys(players).forEach(id => {
      if (players[id].emoji !== PLAYER_EMOJI) {
        players[id].emoji = PLAYER_EMOJI;
        io.emit('playerEmojiChanged', { id, emoji: PLAYER_EMOJI });
      }
    });
    // Clear existing enemies
    Object.keys(enemies).forEach(id => delete enemies[id]);
    // Notify clients to restart timer and stage
    io.emit('gameRestart', {
      serverStart: SERVER_START,
      serverNow: Date.now(),
      stageDuration: STAGE_DURATION,
      totalStages: TOTAL_STAGES
    });
    // Stage 1: spawn thinking enemy immediately and set up dynamic progression
    spawnEnemy('enemy1', '🤔');
    let stage2Spawned = false;
    let stage3Spawned = false;
    // Fallback timer for stage2
    const stage2Timeout = setTimeout(() => {
      if (!stage2Spawned) {
        stage2Spawned = true;
        spawnEnemy('enemy2', '😡');
        initStage3();
      }
    }, STAGE_DURATION);
    gameTimeouts.push(stage2Timeout);
    // Watcher to advance to stage2 when no entity remains with default emoji (😊)
    const watcher1 = setInterval(() => {
      const aliveDefault = Object.values(players).some(p => p.emoji === PLAYER_EMOJI)
                         || Object.values(enemies).some(e => e.emoji === PLAYER_EMOJI);
      if (!aliveDefault) {
        clearTimeout(stage2Timeout);
        clearInterval(watcher1);
        if (!stage2Spawned) {
          stage2Spawned = true;
          spawnEnemy('enemy2', '😡');
          initStage3();
        }
      }
    }, 500);
    gameTimeouts.push(watcher1);

    // Initialize stage3 progression
    function initStage3() {
      // Fallback timer for stage3
      const stage3Timeout = setTimeout(() => {
        if (!stage3Spawned) {
          stage3Spawned = true;
          spawnEnemy('enemy3', '🤑');
          initGameOver();
        }
      }, STAGE_DURATION);
      gameTimeouts.push(stage3Timeout);
      // Watcher to advance when no human players remain in stage2
      // Watcher to advance to stage3 when no entity remains with default (😊) or thinking (🤔) emojis
      const watcher2 = setInterval(() => {
        const aliveEarly2 = Object.values(players).some(p => p.emoji === PLAYER_EMOJI || p.emoji === '🤔')
                           || Object.values(enemies).some(e => e.emoji === PLAYER_EMOJI || e.emoji === '🤔');
        if (!aliveEarly2) {
          clearTimeout(stage3Timeout);
          clearInterval(watcher2);
          if (!stage3Spawned) {
            stage3Spawned = true;
            spawnEnemy('enemy3', '🤑');
            initGameOver();
          }
        }
      }, 500);
      gameTimeouts.push(watcher2);
    }

    // Initialize game over progression
    function initGameOver() {
      // After final stage duration, end game and immediately restart (no countdown)
      const gameOverTimeout = setTimeout(() => {
        const survivors = Object.keys(players).filter(id => !id.startsWith('npc_') && players[id].emoji === PLAYER_EMOJI);
        io.emit('gameOver', { survivors, restartDelay: RESTART_DELAY });
        const restartTimeout = setTimeout(() => startGameCycle(), RESTART_DELAY);
        gameTimeouts.push(restartTimeout);
      }, STAGE_DURATION);
      gameTimeouts.push(gameOverTimeout);
      // Watcher to end early when no human players remain in stage3
      // Watcher to immediately end game when no one remains in stage3
      // Watcher to end game when no entity remains with default (😊), thinking (🤔), or angry (😡) emojis
      const watcher3 = setInterval(() => {
        const aliveEarly3 = Object.values(players).some(p => p.emoji === PLAYER_EMOJI || p.emoji === '🤔' || p.emoji === '😡')
                           || Object.values(enemies).some(e => e.emoji === PLAYER_EMOJI || e.emoji === '🤔' || e.emoji === '😡');
        if (!aliveEarly3) {
          clearTimeout(gameOverTimeout);
          clearInterval(watcher3);
          const survivors = Object.keys(players).filter(id => !id.startsWith('npc_') && players[id].emoji === PLAYER_EMOJI);
          io.emit('gameOver', { survivors, restartDelay: RESTART_DELAY });
          const restartTimeout = setTimeout(() => startGameCycle(), RESTART_DELAY);
          gameTimeouts.push(restartTimeout);
        }
      }, 500);
      gameTimeouts.push(watcher3);
    }
  }

  // Start the first game cycle
  startGameCycle();

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
    serverNow: Date.now(),
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

// NPC movement loop: human-like control, chasing weaker and fleeing stronger entities
setInterval(() => {
  Object.entries(players).forEach(([id, p]) => {
    if (!id.startsWith('npc_')) return;
    const myStrength = EMOJI_STRENGTH[p.emoji] || 0;
    let chaseDistSq = TRACK_DISTANCE * TRACK_DISTANCE;
    let chaseDelta = null;
    let fleeDistSq = TRACK_DISTANCE * TRACK_DISTANCE;
    let fleeDelta = null;
    // Scan players for chase/flee
    Object.entries(players).forEach(([pid, pl]) => {
      if (pid === id) return;
      const otherStrength = EMOJI_STRENGTH[pl.emoji] || 0;
      const dx = pl.x - p.x;
      const dy = pl.y - p.y;
      const distSq = dx * dx + dy * dy;
      if (otherStrength > myStrength && distSq < fleeDistSq) {
        fleeDistSq = distSq;
        fleeDelta = { dx, dy };
      } else if (otherStrength < myStrength && distSq < chaseDistSq) {
        chaseDistSq = distSq;
        chaseDelta = { dx, dy };
      }
    });
    // Scan enemies for chase/flee
    Object.entries(enemies).forEach(([eid, e]) => {
      const otherStrength = EMOJI_STRENGTH[e.emoji] || 0;
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      const distSq = dx * dx + dy * dy;
      if (otherStrength > myStrength && distSq < fleeDistSq) {
        fleeDistSq = distSq;
        fleeDelta = { dx, dy };
      } else if (otherStrength < myStrength && distSq < chaseDistSq) {
        chaseDistSq = distSq;
        chaseDelta = { dx, dy };
      }
    });
    // Decide movement direction
    if (fleeDelta) {
      const mag = Math.hypot(fleeDelta.dx, fleeDelta.dy) || 1;
      p.dirX = -fleeDelta.dx / mag;
      p.dirY = -fleeDelta.dy / mag;
    } else if (chaseDelta) {
      const mag = Math.hypot(chaseDelta.dx, chaseDelta.dy) || 1;
      p.dirX = chaseDelta.dx / mag;
      p.dirY = chaseDelta.dy / mag;
    } else {
      // Random movement
      if (p.steps <= 0) {
        const nd = NPC_DIRECTIONS[Math.floor(Math.random() * NPC_DIRECTIONS.length)];
        p.dirX = nd[0];
        p.dirY = nd[1];
        p.steps = Math.floor(Math.random() * (NPC_MAX_STEPS - NPC_MIN_STEPS + 1)) + NPC_MIN_STEPS;
      }
      p.steps--;
    }
    // Move NPC
    p.x = Math.max(0, Math.min(CANVAS_SIZE - EMOJI_SIZE, p.x + p.dirX * NPC_SPEED));
    p.y = Math.max(0, Math.min(CANVAS_SIZE - EMOJI_SIZE, p.y + p.dirY * NPC_SPEED));
    io.emit('playerMoved', { id, x: p.x, y: p.y });
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
      // Use circular collision detection
      const dx = (p.x + EMOJI_SIZE/2) - (inf.x + EMOJI_SIZE/2); // Center to center X distance
      const dy = (p.y + EMOJI_SIZE/2) - (inf.y + EMOJI_SIZE/2); // Center to center Y distance
      const distSq = dx * dx + dy * dy; // Squared distance
      
      if (
        EMOJI_STRENGTH[inf.emoji] > EMOJI_STRENGTH[p.emoji] &&
        distSq < COLLISION_DIST_SQ // Circle collision check
      ) {
        players[pid].emoji = inf.emoji;
        io.emit('playerEmojiChanged', { id: pid, emoji: inf.emoji });
      }
    });
  });
  // infect weaker enemies on collision (infector must be stronger)
  infectors.forEach(inf => {
    Object.entries(enemies).forEach(([eid, e]) => {
      // Use circular collision detection
      const dx = (e.x + EMOJI_SIZE/2) - (inf.x + EMOJI_SIZE/2); // Center to center X distance
      const dy = (e.y + EMOJI_SIZE/2) - (inf.y + EMOJI_SIZE/2); // Center to center Y distance
      const distSq = dx * dx + dy * dy; // Squared distance
      
      if (
        EMOJI_STRENGTH[inf.emoji] > EMOJI_STRENGTH[e.emoji] &&
        distSq < COLLISION_DIST_SQ // Circle collision check
      ) {
        enemies[eid].emoji = inf.emoji;
        io.emit('enemyEmojiChanged', { id: eid, emoji: inf.emoji });
      }
    });
  });
}, 50);
// Enemy movement loop: human-like control, chasing weaker and fleeing stronger entities
setInterval(() => {
  Object.entries(enemies).forEach(([id, e]) => {
    const myStrength = EMOJI_STRENGTH[e.emoji] || 0;
    let chaseDistSq = TRACK_DISTANCE * TRACK_DISTANCE;
    let chaseDelta = null;
    let fleeDistSq = TRACK_DISTANCE * TRACK_DISTANCE;
    let fleeDelta = null;
    // Scan players for chase/flee
    Object.entries(players).forEach(([pid, p]) => {
      const otherStrength = EMOJI_STRENGTH[p.emoji] || 0;
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const distSq = dx * dx + dy * dy;
      if (otherStrength > myStrength && distSq < fleeDistSq) {
        fleeDistSq = distSq;
        fleeDelta = { dx, dy };
      } else if (otherStrength < myStrength && distSq < chaseDistSq) {
        chaseDistSq = distSq;
        chaseDelta = { dx, dy };
      }
    });
    // Scan other enemies for chase/flee
    Object.entries(enemies).forEach(([eid, ee]) => {
      if (eid === id) return;
      const otherStrength = EMOJI_STRENGTH[ee.emoji] || 0;
      const dx = ee.x - e.x;
      const dy = ee.y - e.y;
      const distSq = dx * dx + dy * dy;
      if (otherStrength > myStrength && distSq < fleeDistSq) {
        fleeDistSq = distSq;
        fleeDelta = { dx, dy };
      } else if (otherStrength < myStrength && distSq < chaseDistSq) {
        chaseDistSq = distSq;
        chaseDelta = { dx, dy };
      }
    });
    // Determine movement direction
    if (fleeDelta) {
      const mag = Math.hypot(fleeDelta.dx, fleeDelta.dy) || 1;
      e.dirX = -fleeDelta.dx / mag;
      e.dirY = -fleeDelta.dy / mag;
    } else if (chaseDelta) {
      const mag = Math.hypot(chaseDelta.dx, chaseDelta.dy) || 1;
      e.dirX = chaseDelta.dx / mag;
      e.dirY = chaseDelta.dy / mag;
    } else {
      // Random movement
      if (e.steps <= 0) {
        const nd = NPC_DIRECTIONS[Math.floor(Math.random() * NPC_DIRECTIONS.length)];
        e.dirX = nd[0];
        e.dirY = nd[1];
        e.steps = Math.floor(Math.random() * (NPC_MAX_STEPS - NPC_MIN_STEPS + 1)) + NPC_MIN_STEPS;
      }
      e.steps--;
    }
    // Move enemy
    e.x = Math.max(0, Math.min(CANVAS_SIZE - EMOJI_SIZE, e.x + e.dirX * ENEMY_SPEED));
    e.y = Math.max(0, Math.min(CANVAS_SIZE - EMOJI_SIZE, e.y + e.dirY * ENEMY_SPEED));
    io.emit('enemyMoved', { id, x: e.x, y: e.y });
    // Collision detection with players
    Object.keys(players).forEach((pid) => {
      const p = players[pid];
      // Use circular collision detection
      const dx = (p.x + EMOJI_SIZE/2) - (e.x + EMOJI_SIZE/2); // Center to center X distance
      const dy = (p.y + EMOJI_SIZE/2) - (e.y + EMOJI_SIZE/2); // Center to center Y distance
      const distSq = dx * dx + dy * dy; // Squared distance
      
      if (p.emoji !== e.emoji && distSq < COLLISION_DIST_SQ) {
        players[pid].emoji = e.emoji;
        io.emit('playerEmojiChanged', { id: pid, emoji: e.emoji });
      }
    });
  });
}, 100);

server.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
});
