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
// News ticker content
const newsTickers = [
  '在非洲，每六十秒，就有一分鐘過去 ',
  '凡是每天喝水的人，有高機率在100年內死去 ',
  '每呼吸60秒，就減少一分鐘的壽命',
  '誰能想的到，這名16歲少女，在四年前，只是一名12歲少女',
  '台灣人在睡覺時，大多數的美國人都在工作 ',
  '當蝴蝶在南半球拍了兩下翅膀，牠就會稍微飛高一點點 ',
  '據統計，未婚生子的人數中有高機率為女性 ',
  '只要每天省下買一杯奶茶的錢，十天後就能買十杯奶茶 ',
  '當你的左臉被人打，那你的左臉就會痛 ',
  '今年中秋節剛好是滿月、今年七夕恰逢鬼月、今年母親節正好是星期日',
  '人被殺，就會死。',
  '台灣競爭力低落，在美國就連小學生都會說流利的英語',
  '我爸跟我媽同一天結婚',
  '研究顯示，過越多生日的人越長壽',
  '我前腳剛走，後腳就跟上了。',
  '羊毛出在羊身上',
  '當你舉起一隻手 你會發現你還有一隻手沒舉起來',
  '當你蹲得越低，腳就越酸',
  '人被殺就會死',
  '搭飛機的人，目的地通常離出發地有段距離。',
  '被叫醒的人，原本在睡覺。',
  '星星在晚上比較容易看見。',
  '沒有人能在出生前就出生。',
  '當你在看這個的時候，你的眼睛正在運動。',
  '我的右手指跟左手指一樣多',
  '在聊天室你打「男」有99%的機率對方會離開'
];

// Initialize news ticker
function initNewsTicker() {
  const tickerContent = document.getElementById('ticker-content');
  if (!tickerContent) return;
  
  // Join all ticker items with a separator and repeat for continuous flow
  // Using a nicer separator with more spacing for readability
  const tickerText = newsTickers.join(' 📢  ').repeat(2);
  
  // Set content
  tickerContent.textContent = tickerText;
  
  // Use requestAnimationFrame to ensure the browser is ready to calculate dimensions
  requestAnimationFrame(() => {
    // Wait for document fonts to be ready
    document.fonts.ready.then(() => {
      // Get the actual width of the text content after fonts are loaded
      const contentWidth = tickerContent.offsetWidth;
      const viewportWidth = window.innerWidth;
      
      // Calculate duration - slower for better readability
      // ~50px per second for smooth scrolling that's still readable
      const speedFactor = 50;
      const duration = contentWidth / speedFactor;
      
      // Set a reasonable animation duration (min 20s, max 180s)
      const finalDuration = Math.max(20, Math.min(180, duration));
      
      // Apply animation properties
      tickerContent.style.animationDuration = `${finalDuration}s`;
      
      // Use a better animation-timing-function for smoother effect
      tickerContent.style.animationTimingFunction = 'linear';
      
      // Make sure the animation runs infinitely
      tickerContent.style.animationIterationCount = 'infinite';
      
      // Show the ticker
      document.getElementById('news-ticker-container').style.visibility = 'visible';
      document.getElementById('news-ticker-container').style.opacity = '1';
      
      console.log(`News ticker initialized with ${finalDuration}s duration`);
    });
  });
  
  // Enhanced fallback
  setTimeout(() => {
    const container = document.getElementById('news-ticker-container');
    if (container && container.style.visibility !== 'visible') {
      container.style.visibility = 'visible';
      container.style.opacity = '1';
      tickerContent.style.animationDuration = '60s';
      console.log('News ticker fallback initialized');
    }
  }, 2000);
}

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
    
    // Initialize the news ticker
    initNewsTicker();
    
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
  showPopup(`階段 ${stageNumber} 課程導師登場`);
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
  let message = `課程將於 ${restartDelay/1000} 秒後重新開始`;
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
  
  // Reinitialize news ticker to ensure it's still running
  initNewsTicker();
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
    
    // DEBUG: Draw collision area as a blue circle
    // drawCollisionArea(x, y);
  }
  
  // Draw enemies second
  for (const id in enemies) {
    const e = enemies[id];
    // Use integer positions to avoid blurry text
    const x = Math.round(e.x);
    const y = Math.round(e.y);
    ctx.fillText(e.emoji, x, y);
    
    // DEBUG: Draw collision area as a blue circle
    // drawCollisionArea(x, y);
  }
}

// Update sidebar with current stage and emoji counts
function updateSidebar() {
  // Stage is number of enemies spawned (1 to 3)
  const stage = Object.keys(enemies).length || 1; // Default to stage 1 if no enemies
  const stageEl = document.getElementById('stage');
  if (stageEl) stageEl.textContent = stage;
  
  // Update stage name based on current stage
  const stageNameEl = document.getElementById('stage-name');
  if (stageNameEl) {
    switch (stage) {
      case 1:
        stageNameEl.textContent = '自我懷疑';
        break;
      case 2:
        stageNameEl.textContent = '崩潰暴怒';
        break;
      case 3:
        stageNameEl.textContent = '推銷課程';
        break;
      default:
        stageNameEl.textContent = '自我懷疑';
    }
  }
  
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

// Draw collision area for an entity at position (x,y)
function drawCollisionArea(x, y) {
  // Save current context state
  ctx.save();
  
  // Set blue outline for the collision area 
  ctx.strokeStyle = 'rgba(0, 100, 255, 0.7)';
  ctx.lineWidth = 2;
  
  // Draw a circle matching the emoji shape
  // Use EMOJI_SIZE/2 as radius for a circle that matches the emoji's circular shape
  ctx.beginPath();
  ctx.arc(
    x + EMOJI_SIZE / 2,  // X center of the emoji
    y + EMOJI_SIZE / 2,  // Y center of the emoji
    EMOJI_SIZE / 2,      // Radius (half of emoji size for a perfect circle)
    0,                   // Start angle
    Math.PI * 2          // End angle (full circle)
  );
  ctx.stroke();
  
  // Restore context state
  ctx.restore();
}

// No speech events
