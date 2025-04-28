# Technical Context

## Technology Stack

### Core Technologies
- **Runtime**: Node.js
- **Package Manager**: Bun
- **Server Framework**: Express.js
- **Real-time Communication**: Socket.io
- **Frontend**: HTML5 Canvas, JavaScript
- **Development Environment**: VS Code

### Dependencies
```json
{
  "express": "^4.18.2",  // Web server framework
  "socket.io": "^4.5.1"  // WebSocket implementation
}
```

## Development Setup

### Prerequisites
- Node.js installed
- Bun package manager installed
- Modern web browser with WebSocket support

### Installation Steps
1. Clone repository
2. Run `bun install` to install dependencies
3. Execute `bun run start` to launch server
4. Access game at `http://localhost:3000`

## Asset Management

### Audio Assets
- `bg.mp3`: Background meditation music
- `win.mp3`: Victory sound effect
- `lose.mp3`: Defeat sound effect

### Visual Assets
- `background.png`: Game background image
- Emojis: Native browser emoji support
  - 😊 Pure state
  - 🤔 Self-doubt state
  - 😡 Anger state
  - 🤑 Course-selling state

## Development Patterns

### Code Organization
```
/
├── assets/           # Static game assets
│   ├── background.png
│   ├── bg.mp3
│   ├── lose.mp3
│   └── win.mp3
├── public/           # Client-side code
│   ├── index.html
│   ├── style.css
│   └── client.js
├── server.js         # Game server
├── package.json      # Project configuration
└── bun.lock         # Dependency lock file
```

### Development Workflow
1. Server changes in server.js
2. Client logic in public/client.js
3. Styling in public/style.css
4. Asset updates in assets/

### Testing Strategy
- Manual testing for gameplay
- Browser compatibility testing
- WebSocket connection testing
- Performance monitoring

## Technical Constraints

### Browser Support
- Modern browsers with:
  - WebSocket support
  - Canvas API support
  - ES6+ JavaScript
  - Emoji rendering

### Performance
- Frame rate target: 60 FPS
- Network latency handling
- Collision detection optimization
- State synchronization efficiency

### Security
- Basic input validation
- WebSocket connection validation
- No sensitive data handling required

## Tool Usage

### Development Tools
- VS Code for coding
- Browser DevTools for debugging
- Network inspection tools
- Performance monitoring

### Build & Deploy
- No build step required
- Direct Node.js execution
- Static file serving
- WebSocket server setup

## Monitoring & Debugging
- Console logging
- WebSocket connection status
- Game state monitoring
- Performance metrics tracking
- Browser DevTools integration
