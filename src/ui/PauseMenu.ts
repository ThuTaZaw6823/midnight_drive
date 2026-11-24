import {
  GraphicsPreset,
  SettingsManager,
  TimePreset,
  WeatherMode,
} from '../settings/SettingsManager';
import { EnvironmentId, ENVIRONMENTS, getEnvironmentById } from '../world/EnvironmentConfig';
import { RADIO_STATIONS } from '../audio/AudioEngine';

export interface PauseMenuCallbacks {
  onResume: () => void;
  onResetVehicle: () => void;
  onEnterPhotoMode: () => void;
  onSelectEnvironment: (envId: EnvironmentId) => void;
  onReturnToMenu: () => void;
  onSettingsChanged: () => void;
  onSelectStation: (index: number) => void;
  onToggleRadio: () => void;
  isRadioPlaying: () => boolean;
}

/**
 * Clean glassmorphic Pause Menu (Escape) offering instant weather, time-of-day,
 * autopilot cruising speed, 5-station Ambient Radio selector, graphics quality,
 * photo mode launch, road reset, and audio mute.
 */
export class PauseMenu {
  public readonly element: HTMLDivElement;
  private readonly cardEl: HTMLDivElement;

  constructor(
    private readonly settingsMgr: SettingsManager,
    private readonly callbacks: PauseMenuCallbacks
  ) {
    this.element = document.createElement('div');
    this.element.className = 'pause-overlay hidden';

    this.cardEl = document.createElement('div');
    this.cardEl.className = 'pause-card';
    this.element.appendChild(this.cardEl);
  }

  public show(): void {
    this.render();
    this.element.classList.remove('hidden');
  }

  public hide(): void {
    this.element.classList.add('hidden');
  }

  private render(): void {
    const s = this.settingsMgr.get();
    const activeEnv = getEnvironmentById(s.environmentId);
    this.cardEl.innerHTML = `
      <div class="panel-header">
        <div class="panel-title">Paused · ${activeEnv.name}</div>
      </div>
    `;

    this.appendPills<EnvironmentId>(
      'Switch Map / Environment',
      activeEnv.id,
      ENVIRONMENTS.map((e) => ({ value: e.id, label: e.name })),
      (envId) => {
        if (envId !== activeEnv.id) {
          this.callbacks.onSelectEnvironment(envId);
          this.render();
        }
      }
    );

    this.appendPills<WeatherMode>(
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
        this.render();
      }
    );

    this.appendPills<TimePreset>(
      'Time of Day (Smooth Transition)',
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
        this.render();
      }
    );

    this.appendPills<string>(
      'Autopilot Cruising Speed',
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
        this.render();
      }
    );

    // 5-Station Ambient Radio quick selector
    this.appendPills<string>(
      `Ambient Radio (${this.callbacks.isRadioPlaying() ? 'Playing' : 'Paused'})`,
      String(s.radioStationIndex),
      RADIO_STATIONS.map((st, idx) => ({ value: String(idx), label: st.name })),
      (v) => {
        const idx = Number(v);
        this.settingsMgr.update({ radioStationIndex: idx });
        this.callbacks.onSelectStation(idx);
        this.render();
      }
    );

    this.appendPills<GraphicsPreset>(
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
        this.render();
      }
    );

    // Audio toggles row
    const audioSec = document.createElement('div');
    audioSec.className = 'panel-section';
    audioSec.innerHTML = `<span class="panel-label">Audio & Tools</span>`;
    const row = document.createElement('div');
    row.className = 'pill-group';

    const radioBtn = document.createElement('button');
    radioBtn.type = 'button';
    radioBtn.className = `pill-btn${this.callbacks.isRadioPlaying() ? ' active' : ''}`;
    radioBtn.textContent = this.callbacks.isRadioPlaying() ? 'Pause Radio' : 'Play Radio';
    radioBtn.addEventListener('click', () => {
      this.callbacks.onToggleRadio();
      this.render();
    });

    const muteBtn = document.createElement('button');
    muteBtn.type = 'button';
    muteBtn.className = `pill-btn${s.muted ? ' active' : ''}`;
    muteBtn.textContent = s.muted ? 'Master: Muted' : 'Master: Active';
    muteBtn.addEventListener('click', () => {
      this.settingsMgr.update({ muted: !s.muted });
      this.callbacks.onSettingsChanged();
      this.render();
    });

    const photoBtn = document.createElement('button');
    photoBtn.type = 'button';
    photoBtn.className = 'pill-btn';
    photoBtn.textContent = 'Photo Mode (P)';
    photoBtn.addEventListener('click', () => this.callbacks.onEnterPhotoMode());

    row.append(radioBtn, muteBtn, photoBtn);
    audioSec.appendChild(row);
    this.cardEl.appendChild(audioSec);

    const actions = document.createElement('div');
    actions.className = 'pause-actions';

    const resumeBtn = document.createElement('button');
    resumeBtn.type = 'button';
    resumeBtn.className = 'action-btn primary';
    resumeBtn.textContent = 'Resume Drive';
    resumeBtn.addEventListener('click', () => this.callbacks.onResume());

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'action-btn';
    resetBtn.textContent = 'Reset to Road';
    resetBtn.addEventListener('click', () => {
      this.callbacks.onResetVehicle();
      this.callbacks.onResume();
    });

    const menuBtn = document.createElement('button');
    menuBtn.type = 'button';
    menuBtn.className = 'action-btn';
    menuBtn.textContent = 'Main Menu';
    menuBtn.addEventListener('click', () => this.callbacks.onReturnToMenu());

    actions.append(resumeBtn, resetBtn, menuBtn);
    this.cardEl.appendChild(actions);
  }

  private appendPills<T extends string>(
    label: string,
    current: T,
    options: Array<{ value: T; label: string }>,
    onSelect: (v: T) => void
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
    this.cardEl.appendChild(sec);
  }
}
