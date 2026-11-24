import './ui/styles.css';
import { GameEngine } from './core/GameEngine';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
const uiRoot = document.getElementById('ui-root') as HTMLElement | null;

if (!canvas || !uiRoot) {
  throw new Error('Midnight Drive mount points (#game-canvas, #ui-root) not found.');
}

const engine = new GameEngine(canvas, uiRoot);
engine.init().catch((err) => {
  console.error('Failed to initialize Midnight Drive:', err);
  uiRoot.innerHTML = `
    <div class="loading-screen">
      <div class="loading-title">MIDNIGHT DRIVE</div>
      <div class="loading-sub" style="color:#ff8a96; max-width:480px; text-align:center; padding:0 24px;">
        Unable to initialize WebGL2 / physics engine: ${err instanceof Error ? err.message : String(err)}
      </div>
    </div>
  `;
});
