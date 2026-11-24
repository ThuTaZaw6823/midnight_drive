export interface MultiplayerRoomConfig {
  roomCode: string;
  worldSeed: number;
  maxPlayers: number;
}

/**
 * Multiplayer client architecture contract for Phase 5 (Node.js + Socket.IO).
 * Intentionally unavailable in Phase 1 — does not simulate fake online players.
 */
export class MultiplayerClient {
  public readonly available = false;
  public readonly statusMessage =
    'Multiplayer (2–8 player private convoy rooms via Node.js & Socket.IO) is scheduled for Phase 5 once the single-player driving experience is complete.';

  public isConnected(): boolean {
    return false;
  }
}
