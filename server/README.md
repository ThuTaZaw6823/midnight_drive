# Midnight Drive — Multiplayer Server (Planned Phase 5)

This directory is reserved for the Node.js + Socket.IO multiplayer backend planned for Phase 5.

## Planned Architecture
- **Rooms**: 2–8 players per private room joined via room code.
- **Deterministic Sync**: All clients in a room receive the same `worldSeed`, weather preset, and time-of-day clock.
- **Vehicle Replication**: Position, quaternion rotation, velocity, steering angle, headlight/brake/indicator states, and vehicle customization synchronized with client-side interpolation and server validation.
- **Social**: Player display names, optional text chat, and relaxed convoy driving.
