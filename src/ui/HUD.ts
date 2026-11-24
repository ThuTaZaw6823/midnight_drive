import * as THREE from 'three';
import { RoadSpline } from '../roads/RoadSpline';
import { VehicleTelemetry } from '../physics/VehiclePhysics';
import { VehicleSystemState } from '../vehicles/Vehicle';
import { CameraMode } from '../settings/SettingsManager';

const CAMERA_LABELS: Record<CameraMode, string> = {
  'third-person': 'Chase Cam',
  'first-person': 'Cockpit',
  hood: 'Hood Cam',
  cinematic: 'Cinematic',
};

export interface HUDCallbacks {
  onToggleRadio: () => void;
  onPrevStation: () => void;
  onNextStation: () => void;
}

/**
 * Clean, minimalist driving HUD displaying actual vehicle speed, gear, RPM bar,
 * time, weather, distance, camera mode, compact 5-station radio controls,
 * Zen Mode suppression, and an optional crisp 2D minimap.
 */
export class HUD {
  public readonly element: HTMLDivElement;

  private readonly speedValEl: HTMLElement;
  private readonly gearEl: HTMLElement;
  private readonly rpmFillEl: HTMLElement;
  private readonly envNameEl: HTMLElement;
  private readonly clockEl: HTMLElement;
  private readonly weatherEl: HTMLElement;
  private readonly camEl: HTMLElement;
  private readonly distEl: HTMLElement;

  private readonly lightsPill: HTMLElement;
  private readonly radioPill: HTMLElement;
  private readonly autoPill: HTMLElement;
  private readonly wiperPill: HTMLElement;
  private readonly indLeftPill: HTMLElement;
  private readonly indRightPill: HTMLElement;

  private readonly radioMiniEl: HTMLElement;
  private readonly radioPlayBtn: HTMLButtonElement;
  private readonly radioTitleEl: HTMLElement;

  private readonly minimapWrap: HTMLElement;
  private readonly minimapCanvas: HTMLCanvasElement;
  private readonly minimapCtx: CanvasRenderingContext2D;
  private readonly toastEl: HTMLElement;
  private toastTimeout: number | null = null;
  private zenActive = false;

  private mapBounds = { minX: -900, maxX: 900, minZ: -900, maxZ: 900 };
  private roadOutlinePoints: Array<[number, number]> = [];
  private showLakeSilhouette = true;

  constructor(spline: RoadSpline, callbacks: HUDCallbacks) {
    this.element = document.createElement('div');
    this.element.className = 'hud hidden';

    this.element.innerHTML = `
      <div class="hud-top-left">
        <div class="hud-chip-row">
          <div class="hud-chip"><span class="hud-dot"></span><strong id="hud-env-name">Mountain Escape</strong></div>
          <div class="hud-chip"><span class="hud-dot amber"></span><span id="hud-clock">23:45</span></div>
          <div class="hud-chip"><span class="hud-dot purple"></span><span id="hud-weather">Clear Night</span></div>
        </div>
        <div class="hud-chip-row">
          <div class="hud-chip" id="hud-cam">Chase Cam</div>
          <div class="hud-chip" id="hud-dist">0.00 km</div>
          <div class="radio-mini" id="hud-radio-mini">
            <button type="button" class="radio-mini-btn" id="radio-prev" title="Previous Station ([)">‹</button>
            <button type="button" class="radio-mini-btn" id="radio-play" title="Play / Pause Radio (R)">▶</button>
            <span class="radio-mini-title" id="radio-title">Midnight Lo-Fi</span>
            <button type="button" class="radio-mini-btn" id="radio-next" title="Next Station (])">›</button>
          </div>
        </div>
      </div>

      <div class="hud-top-right">
        <div class="minimap-wrap" id="minimap-wrap">
          <canvas id="minimap-canvas" width="280" height="280"></canvas>
        </div>
      </div>

      <div class="toast" id="hud-toast"></div>

      <div class="hud-bottom-left">
        <div class="hint-bar">
          <span><span class="kbd">WASD</span> Drive</span>
          <span><span class="kbd">C</span> Camera</span>
          <span><span class="kbd">L</span> Lights</span>
          <span><span class="kbd">R</span> Radio</span>
          <span><span class="kbd">F</span> Auto</span>
          <span><span class="kbd">P</span> Photo</span>
          <span><span class="kbd">Z</span> Zen</span>
          <span><span class="kbd">Esc</span> Pause</span>
        </div>
      </div>

      <div class="hud-bottom-right">
        <div class="speed-cluster">
          <div class="speed-main">
            <span class="speed-value" id="hud-speed">0</span>
            <span class="speed-unit">km/h</span>
          </div>
          <div class="rpm-bar-track">
            <div class="rpm-bar-fill" id="hud-rpm-fill"></div>
          </div>
          <div class="speed-meta">
            <span class="gear-badge" id="hud-gear">N</span>
            <div class="status-icons">
              <span class="status-pill" id="pill-ind-l">◀</span>
              <span class="status-pill" id="pill-lights">LGT</span>
              <span class="status-pill" id="pill-wipers">WPR</span>
              <span class="status-pill" id="pill-radio">FM</span>
              <span class="status-pill" id="pill-auto">AUTO</span>
              <span class="status-pill" id="pill-ind-r">▶</span>
            </div>
          </div>
        </div>
      </div>
    `;

    this.speedValEl = this.element.querySelector('#hud-speed')!;
    this.gearEl = this.element.querySelector('#hud-gear')!;
    this.rpmFillEl = this.element.querySelector('#hud-rpm-fill')!;
    this.envNameEl = this.element.querySelector('#hud-env-name')!;
    this.clockEl = this.element.querySelector('#hud-clock')!;
    this.weatherEl = this.element.querySelector('#hud-weather')!;
    this.camEl = this.element.querySelector('#hud-cam')!;
    this.distEl = this.element.querySelector('#hud-dist')!;

    this.lightsPill = this.element.querySelector('#pill-lights')!;
    this.wiperPill = this.element.querySelector('#pill-wipers')!;
    this.radioPill = this.element.querySelector('#pill-radio')!;
    this.autoPill = this.element.querySelector('#pill-auto')!;
    this.indLeftPill = this.element.querySelector('#pill-ind-l')!;
    this.indRightPill = this.element.querySelector('#pill-ind-r')!;

    this.radioMiniEl = this.element.querySelector('#hud-radio-mini')!;
    this.radioPlayBtn = this.element.querySelector('#radio-play') as HTMLButtonElement;
    this.radioTitleEl = this.element.querySelector('#radio-title')!;

    this.element.querySelector('#radio-prev')!.addEventListener('click', () => callbacks.onPrevStation());
    this.radioPlayBtn.addEventListener('click', () => callbacks.onToggleRadio());
    this.element.querySelector('#radio-next')!.addEventListener('click', () => callbacks.onNextStation());

    this.minimapWrap = this.element.querySelector('#minimap-wrap')!;
    this.minimapCanvas = this.element.querySelector('#minimap-canvas') as HTMLCanvasElement;
    this.minimapCtx = this.minimapCanvas.getContext('2d')!;
    this.toastEl = this.element.querySelector('#hud-toast')!;

    this.setEnvironmentSpline(spline, 'Mountain Escape');
  }

  /** Rebuilds the minimap road projection & HUD map badge whenever the player switches worlds. */
  public setEnvironmentSpline(spline: RoadSpline, envName: string): void {
    this.envNameEl.textContent = envName;
    this.showLakeSilhouette = spline.envId === 'mountain-escape' || spline.envId === 'ocean-highway';
    this.roadOutlinePoints = [];

    let minX = Infinity,
      maxX = -Infinity,
      minZ = Infinity,
      maxZ = -Infinity;

    for (let i = 0; i < spline.samples.length; i += 6) {
      const p = spline.samples[i].position;
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
      this.roadOutlinePoints.push([p.x, p.z]);
    }
    this.mapBounds = {
      minX: minX - 130,
      maxX: maxX + 130,
      minZ: minZ - 130,
      maxZ: maxZ + 130,
    };
  }

  public show(): void {
    this.element.classList.remove('hidden');
  }

  public hide(): void {
    this.element.classList.add('hidden');
  }

  public setZenMode(zen: boolean): void {
    this.zenActive = zen;
    this.element.style.opacity = zen ? '0' : '1';
    this.radioMiniEl.style.pointerEvents = zen ? 'none' : 'auto';
    if (zen) {
      this.toastEl.classList.remove('visible');
    }
  }

  public setMinimapVisible(visible: boolean): void {
    this.minimapWrap.classList.toggle('hidden', !visible);
  }

  public showToast(message: string): void {
    if (this.zenActive) return;
    this.toastEl.textContent = message;
    this.toastEl.classList.add('visible');
    if (this.toastTimeout !== null) clearTimeout(this.toastTimeout);
    this.toastTimeout = window.setTimeout(() => {
      this.toastEl.classList.remove('visible');
    }, 2200);
  }

  public update(opts: {
    telemetry: VehicleTelemetry;
    systemState: VehicleSystemState;
    clockText: string;
    weatherLabel: string;
    cameraMode: CameraMode;
    radioPlaying: boolean;
    radioStationName: string;
    totalDistanceKm: number;
    vehiclePos: THREE.Vector3;
    vehicleForward: THREE.Vector3;
  }): void {
    this.speedValEl.textContent = String(Math.round(opts.telemetry.speedKmh));
    this.gearEl.textContent = opts.telemetry.transmission.gear;
    const rpmPct = Math.min(100, Math.max(8, (opts.telemetry.transmission.rpm / 7200) * 100));
    this.rpmFillEl.style.width = `${rpmPct.toFixed(1)}%`;

    this.clockEl.textContent = opts.clockText;
    this.weatherEl.textContent = opts.weatherLabel;
    this.camEl.textContent = CAMERA_LABELS[opts.cameraMode];
    this.distEl.textContent = `${opts.totalDistanceKm.toFixed(2)} km`;

    this.radioTitleEl.textContent = opts.radioStationName;
    this.radioPlayBtn.textContent = opts.radioPlaying ? '❚❚' : '▶';
    this.radioMiniEl.classList.toggle('playing', opts.radioPlaying);

    this.lightsPill.className = `status-pill${opts.systemState.headlightsOn ? ' on' : ''}`;
    this.wiperPill.className = `status-pill${opts.systemState.wipersOn ? ' on' : ''}`;
    this.radioPill.className = `status-pill${opts.radioPlaying ? ' purple-on' : ''}`;
    this.autoPill.textContent = opts.telemetry.autopilotActive
      ? `AUTO ${opts.telemetry.autopilotTargetKmh}`
      : 'AUTO';
    this.autoPill.className = `status-pill${opts.telemetry.autopilotActive ? ' amber-on' : ''}`;

    const blink = opts.systemState.indicatorBlinkPhase;
    this.indLeftPill.className = `status-pill${opts.systemState.leftIndicator && blink ? ' amber-on' : ''}`;
    this.indRightPill.className = `status-pill${opts.systemState.rightIndicator && blink ? ' amber-on' : ''}`;

    if (!this.minimapWrap.classList.contains('hidden')) {
      this.drawMinimap(opts.vehiclePos, opts.vehicleForward);
    }
  }

  private drawMinimap(pos: THREE.Vector3, forward: THREE.Vector3): void {
    const ctx = this.minimapCtx;
    const W = this.minimapCanvas.width;
    const H = this.minimapCanvas.height;
    const { minX, maxX, minZ, maxZ } = this.mapBounds;

    const mapX = (x: number) => ((x - minX) / (maxX - minX)) * (W - 24) + 12;
    const mapY = (z: number) => ((z - minZ) / (maxZ - minZ)) * (H - 24) + 12;

    ctx.clearRect(0, 0, W, H);

    if (this.showLakeSilhouette) {
      ctx.beginPath();
      ctx.ellipse(mapX(-20), mapY(20), 64, 48, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(42, 92, 148, 0.28)';
      ctx.fill();
    }

    ctx.beginPath();
    for (let i = 0; i < this.roadOutlinePoints.length; i++) {
      const [rx, rz] = this.roadOutlinePoints[i];
      const px = mapX(rx);
      const py = mapY(rz);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.strokeStyle = 'rgba(182, 206, 240, 0.55)';
    ctx.lineWidth = 4;
    ctx.stroke();

    const cx = mapX(pos.x);
    const cy = mapY(pos.z);
    const angle = Math.atan2(forward.z, forward.x);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.lineTo(-7, -6);
    ctx.lineTo(-4, 0);
    ctx.lineTo(-7, 6);
    ctx.closePath();
    ctx.fillStyle = '#ffba66';
    ctx.fill();
    ctx.restore();
  }
}
