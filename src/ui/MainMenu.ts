import { EnvironmentId, ENVIRONMENTS, getEnvironmentById } from '../world/EnvironmentConfig';
import {
  GameSettings,
  GraphicsPreset,
  SettingsManager,
  TimePreset,
  WeatherMode,
  WheelStyle,
} from '../settings/SettingsManager';
import { MultiplayerClient } from '../multiplayer/MultiplayerClient';

type MenuTab = 'none' | 'multiplayer' | 'garage' | 'environment' | 'settings' | 'about';

export interface MainMenuCallbacks {
  onStartDriving: () => void;
  onContinueJourney: () => void;
  onSelectEnvironment: (envId: EnvironmentId) => void;
  onSettingsChanged: () => void;
  onGarageFocusChange: (garageOpen: boolean) => void;
}

const PAINT_SWATCHES = [
  { name: 'Midnight Sapphire', hex: '#1a273b' },
  { name: 'Obsidian Slate', hex: '#181b22' },
  { name: 'Alpine Silver', hex: '#8b98a8' },
  { name: 'Glacier White', hex: '#cfd8e3' },
  { name: 'Crimson Dusk', hex: '#631a27' },
  { name: 'Forest Pine', hex: '#18362e' },
  { name: 'Twilight Violet', hex: '#31234d' },
];

const AMBIENT_SWATCHES = [
  { name: 'Muted Purple', hex: '#9b5de5' },
  { name: 'Warm Amber', hex: '#ffaa44' },
  { name: 'Moonlight Cyan', hex: '#52b2ff' },
  { name: 'Soft Rose', hex: '#e06399' },
];

/**
 * Minimalist glassmorphic main menu layered over the live animated 3D overlook scene.
 * Preserves all Phase 1 options and expands Garage (wheel styles, interactive studio orbit, reset)
 * and Settings (headlight brightness, autopilot cruising speed).
 */
export class MainMenu {
  public readonly element: HTMLDivElement;
  private activeTab: MenuTab = 'none';
  private readonly panelEl: HTMLDivElement;
  private readonly continueBtn: HTMLButtonElement;
  private readonly eyebrowEl: HTMLElement;
  private readonly envBtnBadgeEl: HTMLElement;

  constructor(
    private readonly settingsMgr: SettingsManager,
    private readonly multiplayer: MultiplayerClient,
    private readonly callbacks: MainMenuCallbacks
  ) {
    this.element = document.createElement('div');
    this.element.className = 'main-menu';

    const left = document.createElement('div');
    left.className = 'menu-left';

    left.innerHTML = `
      <div class="brand-block">
        <div class="brand-eyebrow" id="menu-env-eyebrow">Mountain Escape</div>
        <h1 class="brand-title">MIDNIGHT<br/>DRIVE</h1>
        <p class="brand-slogan">No destination. No pressure. Just you and the road.</p>
      </div>
    `;
    this.eyebrowEl = left.querySelector('#menu-env-eyebrow')!;

    const nav = document.createElement('nav');
    nav.className = 'menu-nav';

    const addBtn = (
      label: string,
      onClick: () => void,
      opts?: { primary?: boolean; badge?: string; badgeWarn?: boolean; disabled?: boolean }
    ) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `menu-btn${opts?.primary ? ' primary' : ''}`;
      if (opts?.disabled) btn.disabled = true;
      btn.innerHTML = `<span>${label}</span>${
        opts?.badge
          ? `<span class="menu-badge${opts.badgeWarn ? ' warn' : ''}">${opts.badge}</span>`
          : ''
      }`;
      btn.addEventListener('click', onClick);
      nav.appendChild(btn);
      return btn;
    };

    addBtn('Start Driving', () => this.callbacks.onStartDriving(), { primary: true, badge: 'Drive' });
    this.continueBtn = addBtn('Continue Journey', () => this.callbacks.onContinueJourney());
    addBtn('Multiplayer', () => this.toggleTab('multiplayer'), {
      badge: 'Unavailable',
      badgeWarn: true,
    });
    addBtn('Garage', () => this.toggleTab('garage'), { badge: 'Solstice GT' });
    const envBtn = addBtn('Environment', () => this.toggleTab('environment'), { badge: '6 Maps' });
    this.envBtnBadgeEl = envBtn.querySelector('.menu-badge')!;
    addBtn('Settings', () => this.toggleTab('settings'));
    addBtn('About', () => this.toggleTab('about'));

    left.appendChild(nav);

    const footer = document.createElement('div');
    footer.className = 'menu-footer';
    footer.innerHTML = `
      <span>WASD / Arrows to Drive</span>
      <span>C Camera</span>
      <span>R Radio</span>
      <span>F Autopilot</span>
      <span>P Photo</span>
    `;
    left.appendChild(footer);

    this.panelEl = document.createElement('div');
    this.panelEl.className = 'menu-panel hidden';

    this.element.append(left, this.panelEl);
    this.syncState();
  }

  public syncState(): void {
    const s = this.settingsMgr.get();
    const activeEnv = getEnvironmentById(s.environmentId);
    this.eyebrowEl.textContent = `${activeEnv.name} · ${activeEnv.roadLengthLabel}`;
    this.envBtnBadgeEl.textContent = '6 Maps';

    this.continueBtn.disabled = !s.savedProgress.hasSession;
    const badge = this.continueBtn.querySelector('.menu-badge');
    if (s.savedProgress.hasSession) {
      if (!badge) {
        const sp = document.createElement('span');
        sp.className = 'menu-badge';
        sp.textContent = `${s.totalDistanceKm.toFixed(1)} km`;
        this.continueBtn.appendChild(sp);
      } else {
        badge.textContent = `${s.totalDistanceKm.toFixed(1)} km`;
      }
    }
    if (this.activeTab !== 'none') {
      this.renderPanel();
    }
  }

  public show(): void {
    this.syncState();
    this.element.classList.remove('hidden');
  }

  public hide(): void {
    this.activeTab = 'none';
    this.callbacks.onGarageFocusChange(false);
    this.panelEl.classList.add('hidden');
    this.element.classList.add('hidden');
  }

  private toggleTab(tab: MenuTab): void {
    this.activeTab = this.activeTab === tab ? 'none' : tab;
    this.callbacks.onGarageFocusChange(this.activeTab === 'garage');
    if (this.activeTab === 'none') {
      this.panelEl.classList.add('hidden');
    } else {
      this.panelEl.classList.remove('hidden');
      this.renderPanel();
    }
  }

  private renderPanel(): void {
    const s = this.settingsMgr.get();
    this.panelEl.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'panel-header';
    const titles: Record<Exclude<MenuTab, 'none'>, string> = {
      multiplayer: 'Multiplayer — Unavailable',
      garage: 'Garage · Solstice GT',
      environment: 'Environments',
      settings: 'Settings',
      about: 'About Midnight Drive',
    };
    const tabTitle = this.activeTab === 'none' ? '' : titles[this.activeTab];
    header.innerHTML = `<div class="panel-title">${tabTitle}</div>`;
    const closeBtn = document.createElement('button');
    closeBtn.className = 'icon-close';
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', () => this.toggleTab('none'));
    header.appendChild(closeBtn);
    this.panelEl.appendChild(header);

    if (this.activeTab === 'multiplayer') {
      this.renderMultiplayerPanel();
    } else if (this.activeTab === 'garage') {
      this.renderGaragePanel(s);
    } else if (this.activeTab === 'environment') {
      this.renderEnvironmentPanel();
    } else if (this.activeTab === 'settings') {
      this.renderSettingsPanel(s);
    } else if (this.activeTab === 'about') {
      this.renderAboutPanel(s);
    }
  }

  private renderMultiplayerPanel(): void {
    const sec = document.createElement('div');
    sec.className = 'panel-section';
    sec.innerHTML = `
      <span class="panel-label">Status: Offline / Planned Phase 5</span>
      <p class="panel-text">${this.multiplayer.statusMessage}</p>
      <br/>
      <p class="panel-text">
        Planned capabilities include 2–8 player private room codes, synchronized weather and time-of-day,
        shared deterministic world seeds, interpolated convoy driving, and lightweight text chat.
      </p>
    `;
    this.panelEl.appendChild(sec);
  }

  private renderGaragePanel(s: GameSettings): void {
    const tip = document.createElement('p');
    tip.className = 'panel-text';
    tip.style.marginBottom = '14px';
    tip.textContent = 'Drag across the background to inspect the Solstice GT in live studio orbit.';
    this.panelEl.appendChild(tip);

    // Exterior paint
    const paintSec = document.createElement('div');
    paintSec.className = 'panel-section';
    paintSec.innerHTML = `<span class="panel-label">Exterior Paint</span>`;
    const paintRow = document.createElement('div');
    paintRow.className = 'swatch-row';
    for (const sw of PAINT_SWATCHES) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `swatch${s.customization.paintColor.toLowerCase() === sw.hex ? ' active' : ''}`;
      el.style.background = sw.hex;
      el.title = sw.name;
      el.addEventListener('click', () => {
        this.settingsMgr.update({ customization: { ...s.customization, paintColor: sw.hex } });
        this.callbacks.onSettingsChanged();
        this.renderPanel();
      });
      paintRow.appendChild(el);
    }
    paintSec.appendChild(paintRow);
    this.panelEl.appendChild(paintSec);

    // Wheel rim styles
    this.appendPillSection<WheelStyle>(
      'Wheel Style',
      s.customization.wheelStyle,
      [
        { value: 'five-spoke', label: '5-Spoke GT' },
        { value: 'multi-mesh', label: 'Multi-Spoke Mesh' },
        { value: 'turbine', label: 'Deep Turbine' },
      ],
      (wheelStyle) => {
        this.settingsMgr.update({ customization: { ...s.customization, wheelStyle } });
        this.callbacks.onSettingsChanged();
        this.renderPanel();
      }
    );

    // Interior ambient lighting
    const ambSec = document.createElement('div');
    ambSec.className = 'panel-section';
    ambSec.innerHTML = `<span class="panel-label">Cockpit Ambient Lighting</span>`;
    const ambRow = document.createElement('div');
    ambRow.className = 'swatch-row';
    for (const sw of AMBIENT_SWATCHES) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `swatch${s.customization.ambientColor.toLowerCase() === sw.hex ? ' active' : ''}`;
      el.style.background = sw.hex;
      el.title = sw.name;
      el.addEventListener('click', () => {
        this.settingsMgr.update({ customization: { ...s.customization, ambientColor: sw.hex } });
        this.callbacks.onSettingsChanged();
        this.renderPanel();
      });
      ambRow.appendChild(el);
    }
    ambSec.appendChild(ambRow);
    this.panelEl.appendChild(ambSec);

    // Headlight tint
    this.appendPillSection<GameSettings['customization']['headlightTint']>(
      'Headlight Beam Tint',
      s.customization.headlightTint,
      [
        { value: 'cool-white', label: 'Cool LED' },
        { value: 'warm-halogen', label: 'Warm Halogen' },
        { value: 'ice-blue', label: 'Ice Blue' },
      ],
      (headlightTint) => {
        this.settingsMgr.update({ customization: { ...s.customization, headlightTint } });
        this.callbacks.onSettingsChanged();
        this.renderPanel();
      }
    );

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'action-btn';
    resetBtn.textContent = 'Reset Vehicle Customization';
    resetBtn.addEventListener('click', () => {
      this.settingsMgr.resetCustomization();
      this.callbacks.onSettingsChanged();
      this.renderPanel();
    });
    this.panelEl.appendChild(resetBtn);
  }

  private renderEnvironmentPanel(): void {
    const activeId = this.settingsMgr.get().environmentId;

    const hint = document.createElement('p');
    hint.className = 'panel-text';
    hint.style.marginBottom = '12px';
    hint.textContent = 'Click any map below to load that world immediately and drive there.';
    this.panelEl.appendChild(hint);

    for (const env of ENVIRONMENTS) {
      const isSelected = env.id === activeId;
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `env-card${isSelected ? ' active' : ''}`;
      card.innerHTML = `
        <div class="env-card-top">
          <span class="env-name">${env.name}</span>
          <span class="menu-badge${isSelected ? '' : ' warn'}">${isSelected ? 'Selected' : 'Switch Map'}</span>
        </div>
        <div class="env-sub">${env.subtitle} · ${env.roadLengthLabel}</div>
        <p class="panel-text">${env.description}</p>
      `;
      card.addEventListener('click', () => {
        if (env.id !== activeId) {
          this.callbacks.onSelectEnvironment(env.id);
        }
        this.syncState();
      });
      this.panelEl.appendChild(card);
    }
  }

  private renderSettingsPanel(s: GameSettings): void {
    this.appendPillSection<GraphicsPreset>(
      'Graphics Quality',
      s.graphics,
      [
        { value: 'low', label: 'Low' },
        { value: 'medium', label: 'Medium' },
        { value: 'high', label: 'High' },
        { value: 'ultra', label: 'Ultra' },
      ],
      (graphics) => {
        this.settingsMgr.update({ graphics });
        this.callbacks.onSettingsChanged();
        this.renderPanel();
      }
    );

    this.appendPillSection<WeatherMode>(
      'Weather',
      s.weather,
      [
        { value: 'clear-night', label: 'Clear Night' },
        { value: 'light-rain', label: 'Light Rain' },
        { value: 'heavy-rain', label: 'Heavy Rain' },
        { value: 'fog', label: 'Mountain Mist' },
      ],
      (weather) => {
        this.settingsMgr.update({ weather });
        this.callbacks.onSettingsChanged();
        this.renderPanel();
      }
    );

    this.appendPillSection<TimePreset>(
      'Time of Day',
      s.timeOfDay,
      [
        { value: 'midnight', label: 'Midnight' },
        { value: 'evening', label: 'Evening' },
        { value: 'early-morning', label: 'Early Morning' },
        { value: 'sunrise', label: 'Sunrise' },
        { value: 'sunset', label: 'Sunset' },
      ],
      (timeOfDay) => {
        this.settingsMgr.update({ timeOfDay });
        this.callbacks.onSettingsChanged();
        this.renderPanel();
      }
    );

    this.appendPillSection<string>(
      'Autopilot Target Speed',
      String(s.autopilotSpeedKmh),
      [
        { value: '30', label: '30 km/h' },
        { value: '50', label: '50 km/h' },
        { value: '70', label: '70 km/h' },
        { value: '90', label: '90 km/h' },
      ],
      (v) => {
        this.settingsMgr.update({ autopilotSpeedKmh: Number(v) as 30 | 50 | 70 | 90 });
        this.callbacks.onSettingsChanged();
        this.renderPanel();
      }
    );

    const sliderSec = document.createElement('div');
    sliderSec.className = 'panel-section';
    sliderSec.innerHTML = `<span class="panel-label">Audio & Lighting</span>`;

    const addSlider = (
      label: string,
      min: number,
      max: number,
      step: number,
      val: number,
      onChange: (v: number) => void
    ) => {
      const row = document.createElement('div');
      row.className = 'slider-row';
      const lbl = document.createElement('span');
      lbl.className = 'panel-text';
      lbl.style.minWidth = '122px';
      lbl.textContent = label;
      const input = document.createElement('input');
      input.type = 'range';
      input.min = String(min);
      input.max = String(max);
      input.step = String(step);
      input.value = String(val);
      input.addEventListener('input', () => {
        onChange(parseFloat(input.value));
        this.callbacks.onSettingsChanged();
      });
      row.append(lbl, input);
      sliderSec.appendChild(row);
    };

    addSlider('Master Volume', 0, 1, 0.05, s.masterVolume, (masterVolume) =>
      this.settingsMgr.update({ masterVolume })
    );
    addSlider('Engine Sound', 0, 1, 0.05, s.engineVolume, (engineVolume) =>
      this.settingsMgr.update({ engineVolume })
    );
    addSlider('Ambience', 0, 1, 0.05, s.ambienceVolume, (ambienceVolume) =>
      this.settingsMgr.update({ ambienceVolume })
    );
    addSlider('Radio Music', 0, 1, 0.05, s.musicVolume, (musicVolume) =>
      this.settingsMgr.update({ musicVolume })
    );
    addSlider('Exposure', 0.75, 1.5, 0.05, s.exposure, (exposure) =>
      this.settingsMgr.update({ exposure })
    );
    addSlider('Headlights', 0.5, 1.6, 0.1, s.headlightBrightness, (headlightBrightness) =>
      this.settingsMgr.update({ headlightBrightness })
    );
    this.panelEl.appendChild(sliderSec);

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'action-btn danger';
    resetBtn.textContent = 'Reset Saved Settings & Progress';
    resetBtn.addEventListener('click', () => {
      if (window.confirm('Reset all saved Midnight Drive preferences and distance progress?')) {
        this.settingsMgr.reset();
        this.callbacks.onSettingsChanged();
        this.syncState();
      }
    });
    this.panelEl.appendChild(resetBtn);
  }

  private renderAboutPanel(s: GameSettings): void {
    const sec = document.createElement('div');
    sec.className = 'panel-section';
    sec.innerHTML = `
      <p class="panel-text">
        <strong>Midnight Drive</strong> is a browser-based 3D relaxation driving experience built with
        Three.js, TypeScript, Vite, Rapier.js physics, and procedural Web Audio.
      </p>
      <br/>
      <span class="panel-label">Controls</span>
      <div class="controls-grid">
        <div class="control-item"><span>Accelerate</span><span class="kbd">W / ↑</span></div>
        <div class="control-item"><span>Brake / Reverse</span><span class="kbd">S / ↓</span></div>
        <div class="control-item"><span>Steer</span><span class="kbd">A / D</span></div>
        <div class="control-item"><span>Handbrake</span><span class="kbd">Space</span></div>
        <div class="control-item"><span>Switch Camera</span><span class="kbd">C</span></div>
        <div class="control-item"><span>Look / Recenter</span><span class="kbd">Drag / V</span></div>
        <div class="control-item"><span>Chase Zoom</span><span class="kbd">Scroll</span></div>
        <div class="control-item"><span>Headlights / Wipers</span><span class="kbd">L / B</span></div>
        <div class="control-item"><span>Horn / Signals</span><span class="kbd">H / Q E</span></div>
        <div class="control-item"><span>Radio / Stations</span><span class="kbd">R / [ ]</span></div>
        <div class="control-item"><span>Autopilot / Speed</span><span class="kbd">F / - =</span></div>
        <div class="control-item"><span>Photo / Zen / Map</span><span class="kbd">P / Z / M</span></div>
        <div class="control-item"><span>Reset to Road</span><span class="kbd">Backspace</span></div>
        <div class="control-item"><span>Pause Menu</span><span class="kbd">Esc</span></div>
      </div>
      <br/>
      <p class="panel-text">Total Distance Travelled: <strong>${s.totalDistanceKm.toFixed(2)} km</strong></p>
    `;
    this.panelEl.appendChild(sec);
  }

  private appendPillSection<T extends string>(
    label: string,
    current: T,
    options: Array<{ value: T; label: string }>,
    onSelect: (val: T) => void
  ): void {
    const sec = document.createElement('div');
    sec.className = 'panel-section';
    sec.innerHTML = `<span class="panel-label">${label}</span>`;
    const group = document.createElement('div');
    group.className = 'pill-group';
    for (const opt of options) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `pill-btn${opt.value === current ? ' active' : ''}`;
      btn.textContent = opt.label;
      btn.addEventListener('click', () => onSelect(opt.value));
      group.appendChild(btn);
    }
    sec.appendChild(group);
    this.panelEl.appendChild(sec);
  }
}
