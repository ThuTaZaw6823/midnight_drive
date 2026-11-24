export type GraphicsPreset = 'low' | 'medium' | 'high' | 'ultra';
export type WeatherMode = 'clear-night' | 'light-rain' | 'heavy-rain' | 'fog';
export type TimePreset = 'midnight' | 'evening' | 'early-morning' | 'sunrise' | 'sunset';
export type CameraMode = 'third-person' | 'first-person' | 'hood' | 'cinematic';
export type WheelStyle = 'five-spoke' | 'multi-mesh' | 'turbine';

export interface VehicleCustomization {
  paintColor: string;
  ambientColor: string;
  headlightTint: 'cool-white' | 'warm-halogen' | 'ice-blue';
  wheelStyle: WheelStyle;
}

export interface GameSettings {
  schemaVersion: number;
  graphics: GraphicsPreset;
  masterVolume: number;
  engineVolume: number;
  ambienceVolume: number;
  musicVolume: number;
  muted: boolean;
  weather: WeatherMode;
  timeOfDay: TimePreset;
  dynamicTime: boolean;
  exposure: number;
  headlightBrightness: number;
  cameraMode: CameraMode;
  chaseDistance: number;
  autopilotSpeedKmh: 30 | 50 | 70 | 90;
  radioStationIndex: number;
  showMinimap: boolean;
  showHud: boolean;
  customization: VehicleCustomization;
  worldSeed: number;
  environmentId: string;
  totalDistanceKm: number;
  savedProgress: {
    splineT: number;
    hasSession: boolean;
  };
}

const STORAGE_KEY = 'midnight_drive_save_v1';

export const DEFAULT_CUSTOMIZATION: VehicleCustomization = {
  paintColor: '#1a273b',
  ambientColor: '#9b5de5',
  headlightTint: 'cool-white',
  wheelStyle: 'five-spoke',
};

export const DEFAULT_SETTINGS: GameSettings = {
  schemaVersion: 2,
  graphics: 'high',
  masterVolume: 0.75,
  engineVolume: 0.65,
  ambienceVolume: 0.72,
  musicVolume: 0.58,
  muted: false,
  weather: 'clear-night',
  timeOfDay: 'midnight',
  dynamicTime: false,
  exposure: 1.1,
  headlightBrightness: 1.0,
  cameraMode: 'third-person',
  chaseDistance: 6.2,
  autopilotSpeedKmh: 70,
  radioStationIndex: 0,
  showMinimap: true,
  showHud: true,
  customization: { ...DEFAULT_CUSTOMIZATION },
  worldSeed: 202604,
  environmentId: 'mountain-escape',
  totalDistanceKm: 0,
  savedProgress: {
    splineT: 0.014,
    hasSession: false,
  },
};

const VALID_GRAPHICS = new Set<GraphicsPreset>(['low', 'medium', 'high', 'ultra']);
const VALID_WEATHER = new Set<WeatherMode>(['clear-night', 'light-rain', 'heavy-rain', 'fog']);
const VALID_TIME = new Set<TimePreset>(['midnight', 'evening', 'early-morning', 'sunrise', 'sunset']);
const VALID_CAMERA = new Set<CameraMode>(['third-person', 'first-person', 'hood', 'cinematic']);
const VALID_WHEEL = new Set<WheelStyle>(['five-spoke', 'multi-mesh', 'turbine']);
const VALID_AUTO_SPEEDS = new Set([30, 50, 70, 90]);

export class SettingsManager {
  private settings: GameSettings;
  private listeners: Array<(s: GameSettings) => void> = [];

  constructor() {
    this.settings = this.load();
  }

  public get(): GameSettings {
    return this.settings;
  }

  public update(partial: Partial<GameSettings>): void {
    this.settings = {
      ...this.settings,
      ...partial,
      schemaVersion: 2,
      customization: {
        ...this.settings.customization,
        ...(partial.customization ?? {}),
      },
      savedProgress: {
        ...this.settings.savedProgress,
        ...(partial.savedProgress ?? {}),
      },
    };
    this.save();
    for (const cb of this.listeners) cb(this.settings);
  }

  public resetCustomization(): void {
    this.update({ customization: { ...DEFAULT_CUSTOMIZATION } });
  }

  public onChange(cb: (s: GameSettings) => void): () => void {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  public reset(): void {
    this.settings = structuredClone(DEFAULT_SETTINGS);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore storage restrictions
    }
    this.save();
    for (const cb of this.listeners) cb(this.settings);
  }

  public save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      // Ignore quota / privacy mode errors
    }
  }

  /**
   * Loads and validates save data, migrating Phase 1 (v1) saves safely into v2
   * without losing player distance, position, or preferences.
   */
  private load(): GameSettings {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return structuredClone(DEFAULT_SETTINGS);
      const parsed = JSON.parse(raw) as Partial<GameSettings>;
      if (!parsed || typeof parsed !== 'object') return structuredClone(DEFAULT_SETTINGS);

      const num = (v: unknown, fallback: number, min: number, max: number) =>
        typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback;

      const custom = (parsed.customization ?? {}) as Partial<VehicleCustomization>;
      const prog = (parsed.savedProgress ?? {}) as Partial<GameSettings['savedProgress']>;

      return {
        schemaVersion: 2,
        graphics: VALID_GRAPHICS.has(parsed.graphics as GraphicsPreset)
          ? (parsed.graphics as GraphicsPreset)
          : DEFAULT_SETTINGS.graphics,
        masterVolume: num(parsed.masterVolume, DEFAULT_SETTINGS.masterVolume, 0, 1),
        engineVolume: num(parsed.engineVolume, DEFAULT_SETTINGS.engineVolume, 0, 1),
        ambienceVolume: num(parsed.ambienceVolume, DEFAULT_SETTINGS.ambienceVolume, 0, 1),
        musicVolume: num(parsed.musicVolume, DEFAULT_SETTINGS.musicVolume, 0, 1),
        muted: typeof parsed.muted === 'boolean' ? parsed.muted : DEFAULT_SETTINGS.muted,
        weather: VALID_WEATHER.has(parsed.weather as WeatherMode)
          ? (parsed.weather as WeatherMode)
          : DEFAULT_SETTINGS.weather,
        timeOfDay: VALID_TIME.has(parsed.timeOfDay as TimePreset)
          ? (parsed.timeOfDay as TimePreset)
          : DEFAULT_SETTINGS.timeOfDay,
        dynamicTime: typeof parsed.dynamicTime === 'boolean' ? parsed.dynamicTime : false,
        exposure: num(parsed.exposure, DEFAULT_SETTINGS.exposure, 0.7, 1.6),
        headlightBrightness: num(parsed.headlightBrightness, DEFAULT_SETTINGS.headlightBrightness, 0.5, 1.6),
        cameraMode: VALID_CAMERA.has(parsed.cameraMode as CameraMode)
          ? (parsed.cameraMode as CameraMode)
          : DEFAULT_SETTINGS.cameraMode,
        chaseDistance: num(parsed.chaseDistance, DEFAULT_SETTINGS.chaseDistance, 4.6, 9.5),
        autopilotSpeedKmh: VALID_AUTO_SPEEDS.has(parsed.autopilotSpeedKmh as number)
          ? (parsed.autopilotSpeedKmh as 30 | 50 | 70 | 90)
          : DEFAULT_SETTINGS.autopilotSpeedKmh,
        radioStationIndex: Math.floor(num(parsed.radioStationIndex, 0, 0, 4)),
        showMinimap: typeof parsed.showMinimap === 'boolean' ? parsed.showMinimap : true,
        showHud: typeof parsed.showHud === 'boolean' ? parsed.showHud : true,
        customization: {
          paintColor:
            typeof custom.paintColor === 'string' && custom.paintColor.startsWith('#')
              ? custom.paintColor
              : DEFAULT_CUSTOMIZATION.paintColor,
          ambientColor:
            typeof custom.ambientColor === 'string' && custom.ambientColor.startsWith('#')
              ? custom.ambientColor
              : DEFAULT_CUSTOMIZATION.ambientColor,
          headlightTint:
            custom.headlightTint === 'cool-white' ||
            custom.headlightTint === 'warm-halogen' ||
            custom.headlightTint === 'ice-blue'
              ? custom.headlightTint
              : DEFAULT_CUSTOMIZATION.headlightTint,
          wheelStyle: VALID_WHEEL.has(custom.wheelStyle as WheelStyle)
            ? (custom.wheelStyle as WheelStyle)
            : DEFAULT_CUSTOMIZATION.wheelStyle,
        },
        worldSeed:
          typeof parsed.worldSeed === 'number' && Number.isFinite(parsed.worldSeed)
            ? parsed.worldSeed
            : DEFAULT_SETTINGS.worldSeed,
        environmentId:
          typeof parsed.environmentId === 'string' ? parsed.environmentId : DEFAULT_SETTINGS.environmentId,
        totalDistanceKm: num(parsed.totalDistanceKm, 0, 0, 999999),
        savedProgress: {
          splineT: num(prog.splineT, DEFAULT_SETTINGS.savedProgress.splineT, 0, 1),
          hasSession: typeof prog.hasSession === 'boolean' ? prog.hasSession : false,
        },
      };
    } catch {
      return structuredClone(DEFAULT_SETTINGS);
    }
  }
}
