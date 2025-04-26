'use strict';
const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const players = {};
const enemies = {};
// Audio elements
const bgMusic = document.getElementById('bgMusic');
const winSound = document.getElementById('winSound');
const loseSound = document.getElementById('loseSound');
let soundsInitialized = false;

let myId = null;
// Player movement speed (pixels per frame), aligned with NPC_SPEED on server
const speed = 2;
// Emoji size (px) for boundary clamping
const EMOJI_SIZE = 32;
const keys = {};
// Default emoji for uninfected players
const DEFAULT_EMOJI = '😊';

// Movement optimization variables
const MOVEMENT_THROTTLE = 50; // Send movement updates to server every 50ms
let lastMovementUpdate = 0;
// Store the last position sent to the server for client-side prediction
let lastSentPosition = { x: 0, y: 0 };
// For smooth interpolation of other players
const otherPlayersTarget = {};

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
  
  // Initialize target positions for interpolation
  for (const id in players) {
    if (id !== myId) {
      otherPlayersTarget[id] = { x: players[id].x, y: players[id].y };
    } else {
      // Store our last sent position
      lastSentPosition = { x: players[id].x, y: players[id].y };
    }
  }
  
  // Initialize enemy targets
  for (const id in enemies) {
    otherPlayersTarget[`enemy_${id}`] = { x: enemies[id].x, y: enemies[id].y };
  }
  
  // Initialize audio (needs user interaction)
  if (!soundsInitialized) {
    // We'll initialize sounds on first user interaction
    document.addEventListener('click', initSounds, { once: true });
    document.addEventListener('keydown', initSounds, { once: true });
  }
  
  // Start game loop after initial server data
  if (!gameStarted) {
    gameStarted = true;
    gameLoop();
  }
});

// Initialize audio (requires user interaction due to browser policies)
function initSounds() {
  if (soundsInitialized) return;
  
  // Make sure all audio elements are properly loaded
  bgMusic.src = '/assets/bg.mp3';
  winSound.src = '/assets/win.mp3';
  loseSound.src = '/assets/lose.mp3';
  
  // Set properties for background music
  bgMusic.loop = true;
  bgMusic.volume = 0.8; // Set background music volume to 80%
  
  // Try to play background music
  const playPromise = bgMusic.play();
  
  if (playPromise !== undefined) {
    playPromise
      .then(_ => {
        console.log('Audio playback started successfully');
        soundsInitialized = true;
      })
      .catch(err => {
        console.log('Audio playback error:', err);
        // Try again after a short delay
        setTimeout(() => {
          if (!soundsInitialized) {
            bgMusic.play()
              .then(_ => {
                console.log('Audio playback started on retry');
                soundsInitialized = true;
              })
              .catch(e => console.log('Audio retry failed:', e));
          }
        }, 1000);
      });
  }
  
  // Remove event listeners since they're only needed once
  document.removeEventListener('click', initSounds);
  document.removeEventListener('keydown', initSounds);
}

// New enemy joined
socket.on('enemyJoined', (data) => {
  enemies[data.id] = { emoji: data.emoji, x: data.x, y: data.y };
  // Initialize target position for interpolation
  otherPlayersTarget[`enemy_${data.id}`] = { x: data.x, y: data.y };
  // Notify player of new stage start
  const stageNumber = parseInt(data.id.replace('enemy', ''), 10);
  showPopup(`階段 ${stageNumber} 開始囉！`);
});

// Enemy moved
socket.on('enemyMoved', (data) => {
  if (enemies[data.id]) {
    // Create target for interpolation if it doesn't exist
    if (!otherPlayersTarget[`enemy_${data.id}`]) {
      otherPlayersTarget[`enemy_${data.id}`] = { x: data.x, y: data.y };
    } else {
      otherPlayersTarget[`enemy_${data.id}`].x = data.x;
      otherPlayersTarget[`enemy_${data.id}`].y = data.y;
    }
    
    // If enemy is too far from its target, snap immediately
    if (Math.abs(enemies[data.id].x - data.x) > 50 ||
        Math.abs(enemies[data.id].y - data.y) > 50) {
      enemies[data.id].x = data.x;
      enemies[data.id].y = data.y;
    }
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
  
  // Pause background music
  if (soundsInitialized) {
    bgMusic.pause();
    
    // Play win sound if player survived with smile emoji, lose sound otherwise
    if (Array.isArray(survivors) && survivors.includes(myId)) {
      winSound.play().catch(err => console.log('Win sound error:', err));
    } else {
      loseSound.play().catch(err => console.log('Lose sound error:', err));
    }
  }
  
  // Tailor message: survivors (kept smile face) vs. others (infected with thinking/angry/money faces)
  let message = `課程將於 ${restartDelay/1000} 秒後自動重啟`;
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
  Object.keys(enemies).forEach(id => {
    delete enemies[id];
    delete otherPlayersTarget[`enemy_${id}`];
  });
  
  // Restart background music if sounds were initialized
  if (soundsInitialized) {
    // Reset audio to beginning and play
    bgMusic.currentTime = 0;
    bgMusic.play().catch(err => console.log('Audio restart error:', err));
  }
});

// New player joined
socket.on('playerJoined', (data) => {
  players[data.id] = data.player;
  // Initialize target position for interpolation
  otherPlayersTarget[data.id] = { x: data.player.x, y: data.player.y };
});

// Player moved
socket.on('playerMoved', (data) => {
  // If this is our own movement, we've already updated locally
  if (data.id === myId) return;
  
  // For other players, set target position for smooth interpolation
  if (players[data.id]) {
    // Store target position for interpolation
    otherPlayersTarget[data.id] = { x: data.x, y: data.y };
    
    // If this is a new player or player is far from target, snap immediately
    if (!otherPlayersTarget[data.id] ||
        Math.abs(players[data.id].x - data.x) > 50 ||
        Math.abs(players[data.id].y - data.y) > 50) {
      players[data.id].x = data.x;
      players[data.id].y = data.y;
    }
  }
});

// Player left
socket.on('playerLeft', (id) => {
  delete players[id];
  delete otherPlayersTarget[id];
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
  const now = Date.now();
  
  if (myId && players[myId]) {
    const player = players[myId];
    let moved = false;
    
    // Handle player movement with immediate local updates
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
    
    // Throttle network updates to reduce server load and network traffic
    if (moved && now - lastMovementUpdate >= MOVEMENT_THROTTLE) {
      // Only send update if position has changed significantly or enough time has passed
      if (Math.abs(player.x - lastSentPosition.x) > 1 || 
          Math.abs(player.y - lastSentPosition.y) > 1 ||
          now - lastMovementUpdate >= MOVEMENT_THROTTLE * 3) {
            
        socket.emit('move', { x: player.x, y: player.y });
        lastSentPosition.x = player.x;
        lastSentPosition.y = player.y;
        lastMovementUpdate = now;
      }
    }
  }
  
  // Interpolate movement of other players for smoother visuals
  interpolateOtherPlayers();
  
  draw();
  updateSidebar();
  requestAnimationFrame(gameLoop);
}

// Smoothly interpolate other players' and enemies' positions
function interpolateOtherPlayers() {
  const INTERP_FACTOR = 0.2;  // Adjust for smoother or quicker interpolation
  
  // Interpolate other players
  for (const id in players) {
    if (id === myId) continue;  // Skip own player
    
    const player = players[id];
    const target = otherPlayersTarget[id];
    
    if (target) {
      // Interpolate towards target position
      player.x += (target.x - player.x) * INTERP_FACTOR;
      player.y += (target.y - player.y) * INTERP_FACTOR;
    }
  }
  
  // Interpolate enemies
  for (const id in enemies) {
    const enemy = enemies[id];
    const target = otherPlayersTarget[`enemy_${id}`];
    
    if (target) {
      // Interpolate towards target position
      enemy.x += (target.x - enemy.x) * INTERP_FACTOR;
      enemy.y += (target.y - enemy.y) * INTERP_FACTOR;
    }
  }
}

// Draw all players
function draw() {
  // Clear screen with transparency to show background
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Use hardware acceleration where possible
  ctx.imageSmoothingEnabled = false;  // Crisper pixel rendering
  
  // Common text rendering settings to avoid repeated state changes
  ctx.font = '32px serif';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#000'; // Black color
  
  // Draw all entities at once to minimize context state changes
  // Draw players first
  for (const id in players) {
    const p = players[id];
    // Use integer positions to avoid blurry text (round to nearest pixel)
    const x = Math.round(p.x);
    const y = Math.round(p.y);
    ctx.fillText(p.emoji, x, y);
  }
  
  // Draw enemies second
  for (const id in enemies) {
    const e = enemies[id];
    // Use integer positions to avoid blurry text
    const x = Math.round(e.x);
    const y = Math.round(e.y);
    ctx.fillText(e.emoji, x, y);
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
