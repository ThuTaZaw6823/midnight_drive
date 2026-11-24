import * as THREE from 'three';
import { GraphicsPreset, WeatherMode } from '../settings/SettingsManager';
import { damp } from '../utils/MathUtils';

interface WeatherConfig {
  label: string;
  rainIntensity: number;
  fogDensity: number;
  wetness: number;
}

const WEATHER_CONFIGS: Record<WeatherMode, WeatherConfig> = {
  'clear-night': {
    label: 'Clear Night',
    rainIntensity: 0.0,
    fogDensity: 0.00125,
    wetness: 0.28,
  },
  'light-rain': {
    label: 'Light Rain',
    rainIntensity: 0.52,
    fogDensity: 0.00225,
    wetness: 0.82,
  },
  'heavy-rain': {
    label: 'Heavy Rain',
    rainIntensity: 1.0,
    fogDensity: 0.00325,
    wetness: 1.0,
  },
  fog: {
    label: 'Mountain Mist',
    rainIntensity: 0.0,
    fogDensity: 0.0046,
    wetness: 0.58,
  },
};

/**
 * Upgraded atmospheric weather system:
 * - Smooth transitions between Clear Night, Light Rain, Heavy Rain, and Mountain Mist
 * - Wind-drifted & vehicle-velocity-slanted 3D rainfall streaks
 * - GraphicsPreset particle budget scaling (Low/Medium/High/Ultra)
 */
export class WeatherSystem {
  public readonly group = new THREE.Group();
  public mode: WeatherMode;
  public currentRainIntensity = 0;
  public currentFogDensity = 0.00125;
  public currentWetness = 0.28;

  private readonly rainLines: THREE.LineSegments;
  private readonly rainMat: THREE.LineBasicMaterial;
  private readonly maxRainCount = 1900;
  private qualityScale = 1.0;
  private readonly boxSize = 48;
  private readonly boxHeight = 26;
  private readonly dropPositions: Float32Array;
  private readonly dropSpeeds: Float32Array;

  constructor(initialMode: WeatherMode = 'clear-night') {
    this.mode = initialMode;
    this.group.name = 'WeatherSystem';

    const cfg = WEATHER_CONFIGS[initialMode];
    this.currentRainIntensity = cfg.rainIntensity;
    this.currentFogDensity = cfg.fogDensity;
    this.currentWetness = cfg.wetness;

    this.dropPositions = new Float32Array(this.maxRainCount * 2 * 3);
    this.dropSpeeds = new Float32Array(this.maxRainCount);

    for (let i = 0; i < this.maxRainCount; i++) {
      const rx = (Math.random() - 0.5) * this.boxSize;
      const ry = Math.random() * this.boxHeight;
      const rz = (Math.random() - 0.5) * this.boxSize;
      this.dropSpeeds[i] = 24 + Math.random() * 14;

      const idx = i * 6;
      this.dropPositions[idx] = rx;
      this.dropPositions[idx + 1] = ry;
      this.dropPositions[idx + 2] = rz;
      this.dropPositions[idx + 3] = rx - 0.1;
      this.dropPositions[idx + 4] = ry - 0.65;
      this.dropPositions[idx + 5] = rz;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.dropPositions, 3));

    this.rainMat = new THREE.LineBasicMaterial({
      color: 0xb8d4f5,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });

    this.rainLines = new THREE.LineSegments(geo, this.rainMat);
    this.rainLines.frustumCulled = false;
    this.group.add(this.rainLines);
  }

  public setMode(mode: WeatherMode): void {
    this.mode = mode;
  }

  public setQuality(preset: GraphicsPreset): void {
    this.qualityScale =
      preset === 'low' ? 0.32 : preset === 'medium' ? 0.6 : preset === 'high' ? 0.85 : 1.0;
  }

  public getLabel(): string {
    return WEATHER_CONFIGS[this.mode].label;
  }

  public update(dt: number, cameraPos: THREE.Vector3, vehicleVel?: THREE.Vector3): void {
    const target = WEATHER_CONFIGS[this.mode];
    this.currentRainIntensity = damp(this.currentRainIntensity, target.rainIntensity, 1.35, dt);
    this.currentFogDensity = damp(this.currentFogDensity, target.fogDensity, 1.35, dt);
    this.currentWetness = damp(this.currentWetness, target.wetness, 1.15, dt);

    const visible = this.currentRainIntensity > 0.02;
    this.rainLines.visible = visible;
    if (!visible) return;

    this.rainMat.opacity = 0.14 + this.currentRainIntensity * 0.34;
    this.rainLines.position.set(cameraPos.x, cameraPos.y - 6, cameraPos.z);

    const posAttr = this.rainLines.geometry.attributes.position as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;
    const activeCount = Math.floor(
      this.maxRainCount * this.qualityScale * Math.max(0.24, this.currentRainIntensity)
    );

    // Gentle mountain breeze + opposite vehicle velocity slants raindrops naturally with speed
    const vx = -1.6 - (vehicleVel ? vehicleVel.x * 0.28 : 0);
    const vz = 0.8 - (vehicleVel ? vehicleVel.z * 0.28 : 0);
    const streakTime = 0.024 + this.currentRainIntensity * 0.012;
    const halfBox = this.boxSize * 0.5;

    for (let i = 0; i < activeCount; i++) {
      const idx = i * 6;
      const vy = -this.dropSpeeds[i];
      let x = arr[idx] + vx * dt;
      let y = arr[idx + 1] + vy * dt;
      let z = arr[idx + 2] + vz * dt;

      if (y < 0 || x < -halfBox || x > halfBox || z < -halfBox || z > halfBox) {
        x = (Math.random() - 0.5) * this.boxSize;
        y = y < 0 ? y + this.boxHeight : Math.random() * this.boxHeight;
        z = (Math.random() - 0.5) * this.boxSize;
      }

      arr[idx] = x;
      arr[idx + 1] = y;
      arr[idx + 2] = z;
      arr[idx + 3] = x + vx * streakTime;
      arr[idx + 4] = y + vy * streakTime;
      arr[idx + 5] = z + vz * streakTime;
    }

    this.rainLines.geometry.setDrawRange(0, activeCount * 2);
    posAttr.needsUpdate = true;
  }
}
