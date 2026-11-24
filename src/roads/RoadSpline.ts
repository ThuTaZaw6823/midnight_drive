import * as THREE from 'three';
import { EnvironmentId, getEnvironmentById } from '../world/EnvironmentConfig';

export type RoadZone = 'highway' | 'bridge' | 'tunnel' | 'rest-area' | 'overlook' | 'viewpoint';

export interface RoadSample {
  t: number;
  distance: number;
  position: THREE.Vector3;
  tangent: THREE.Vector3;
  right: THREE.Vector3;
  up: THREE.Vector3;
  zone: RoadZone;
  curvature: number;
  signedCurvature: number;
}

export interface ClosestRoadResult {
  sample: RoadSample;
  distance2D: number;
  signedLateral: number;
}

const WORLD_UP = new THREE.Vector3(0, 1, 0);

const WAYPOINTS_BY_ENV: Record<EnvironmentId, Array<[number, number, number]>> = {
  'mountain-escape': [
    [-320, 12.5, 560],
    [-110, 11.0, 585],
    [120, 10.0, 560],
    [340, 9.5, 495],
    [540, 9.5, 360],
    [660, 10.0, 180],
    [625, 10.5, -15],
    [545, 11.0, -210],
    [485, 11.5, -395],
    [365, 20.0, -580],
    [185, 31.0, -700],
    [-30, 39.5, -755],
    [-260, 44.0, -735],
    [-480, 45.5, -660],
    [-665, 42.0, -530],
    [-760, 37.5, -345],
    [-790, 34.0, -145],
    [-775, 31.0, 55],
    [-725, 25.0, 255],
    [-655, 20.5, 425],
    [-555, 17.0, 535],
    [-445, 14.5, 565],
  ],
  'midnight-city': [
    // Sweeping urban boulevard loop with long neon straightaways + elevated harbor bridge
    [-420, 2.2, 560],
    [-120, 2.2, 580],
    [220, 2.2, 580],
    [520, 2.4, 520],
    [640, 4.5, 320],
    [660, 11.5, 80], // Elevated neon skyline bridge crossing harbor channel
    [645, 11.5, -160],
    [560, 5.0, -390],
    [380, 2.2, -570],
    [110, 2.2, -620],
    [-200, 2.2, -620],
    [-480, 2.4, -540],
    [-640, 3.0, -340],
    [-680, 3.2, -60],
    [-665, 2.6, 220],
    [-590, 2.2, 440],
  ],
  'ocean-highway': [
    // Dramatic seaside headland cliff highway hugging the moonlit ocean coast
    [-520, 14.0, 480],
    [-240, 11.5, 560],
    [60, 9.5, 540],
    [340, 8.5, 470],
    [560, 10.5, 340],
    [690, 11.0, 120], // Coastal bay causeway bridge over moonlit surf
    [660, 11.0, -140],
    [560, 13.0, -380],
    [360, 22.0, -560], // High coastal cliff headland overlooking lighthouse & sea
    [90, 28.0, -640],
    [-210, 26.0, -630],
    [-490, 21.0, -530],
    [-690, 16.5, -340],
    [-760, 14.0, -90],
    [-730, 13.0, 180],
    [-660, 13.5, 360],
  ],
  countryside: [
    // Peaceful gently rolling pastoral lanes through villages & meadows (~4.6 km)
    [-440, 7.5, 580],
    [-140, 11.0, 640],
    [185, 15.0, 600],
    [470, 12.5, 485],
    [660, 8.5, 270],
    [700, 6.5, 10], // Stone creek bridge
    [630, 9.0, -250],
    [460, 16.0, -510],
    [180, 22.5, -670],
    [-140, 20.0, -710],
    [-450, 14.5, -630],
    [-670, 10.5, -430],
    [-750, 9.0, -145],
    [-725, 11.5, 160],
    [-635, 9.5, 420],
  ],
  'rainy-expressway': [
    // Wide high-speed sweeping expressway oval with long gentle arcs
    [-520, 10.0, 610],
    [-140, 10.0, 650],
    [260, 10.5, 640],
    [610, 12.0, 520],
    [790, 14.5, 240],
    [810, 15.0, -120],
    [720, 13.5, -450],
    [440, 11.5, -660],
    [40, 10.5, -710],
    [-360, 11.0, -670],
    [-680, 13.0, -480],
    [-810, 14.0, -160],
    [-790, 12.5, 210],
    [-690, 10.5, 460],
  ],
  'endless-desert': [
    // Vast sweeping desert canyon blacktop with long meditative straightaways
    [-560, 8.0, 640],
    [-120, 8.5, 675],
    [320, 9.5, 655],
    [690, 12.0, 500],
    [820, 17.5, 180],
    [780, 22.0, -190],
    [640, 20.0, -520],
    [290, 15.0, -700],
    [-150, 12.0, -730],
    [-540, 14.0, -630],
    [-780, 19.0, -350],
    [-830, 17.0, 40],
    [-760, 11.5, 390],
  ],
};

/**
 * Deterministic ~4.7–5.8 km closed spline route supporting all 6 Midnight Drive worlds.
 */
export class RoadSpline {
  public readonly envId: EnvironmentId;
  public readonly curve: THREE.CatmullRomCurve3;
  public readonly samples: RoadSample[] = [];
  public readonly totalLength: number;
  public readonly roadHalfWidth: number;
  public readonly shoulderWidth = 2.1;

  private readonly cellSize = 40;
  private readonly grid = new Map<string, number[]>();

  constructor(sampleCount = 1500, envId: EnvironmentId = 'mountain-escape') {
    this.envId = envId;
    const desc = getEnvironmentById(envId);
    this.roadHalfWidth = desc.roadHalfWidth;

    const waypoints = WAYPOINTS_BY_ENV[envId] ?? WAYPOINTS_BY_ENV['mountain-escape'];
    const points = waypoints.map(([x, y, z]) => new THREE.Vector3(x, y, z));
    this.curve = new THREE.CatmullRomCurve3(points, true, 'centripetal', 0.5);
    this.totalLength = this.curve.getLength();

    for (let i = 0; i < sampleCount; i++) {
      const t = i / sampleCount;
      const position = this.curve.getPointAt(t);
      const tangent = this.curve.getTangentAt(t).normalize();

      const horizTangent = new THREE.Vector3(tangent.x, 0, tangent.z).normalize();
      const right = new THREE.Vector3().crossVectors(horizTangent, WORLD_UP).normalize();
      const up = new THREE.Vector3().crossVectors(right, tangent).normalize();

      this.samples.push({
        t,
        distance: t * this.totalLength,
        position,
        tangent,
        right,
        up,
        zone: this.classifyZone(t),
        curvature: 0,
        signedCurvature: 0,
      });
    }

    for (let i = 0; i < sampleCount; i++) {
      const prev = this.samples[(i - 2 + sampleCount) % sampleCount];
      const next = this.samples[(i + 2) % sampleCount];
      const dTan = new THREE.Vector3().subVectors(next.tangent, prev.tangent);
      const ds = (4 / sampleCount) * this.totalLength;
      const s = this.samples[i];
      s.curvature = dTan.length() / Math.max(1, ds);
      s.signedCurvature = dTan.dot(s.right) / Math.max(1, ds);
    }

    for (let i = 0; i < this.samples.length; i++) {
      const p = this.samples[i].position;
      const key = this.cellKey(Math.floor(p.x / this.cellSize), Math.floor(p.z / this.cellSize));
      let bucket = this.grid.get(key);
      if (!bucket) {
        bucket = [];
        this.grid.set(key, bucket);
      }
      bucket.push(i);
    }
  }

  private classifyZone(t: number): RoadZone {
    if (this.envId === 'mountain-escape') {
      if (t >= 0.0 && t <= 0.045) return 'overlook';
      if (t >= 0.235 && t <= 0.345) return 'bridge';
      if (t >= 0.48 && t <= 0.525) return 'viewpoint';
      if (t >= 0.675 && t <= 0.745) return 'tunnel';
      if (t >= 0.835 && t <= 0.895) return 'rest-area';
      return 'highway';
    }
    if (this.envId === 'midnight-city' || this.envId === 'ocean-highway') {
      if (t >= 0.0 && t <= 0.04) return 'overlook';
      if (t >= 0.24 && t <= 0.35) return 'bridge';
      if (t >= 0.82 && t <= 0.88) return 'rest-area';
      return 'highway';
    }
    if (this.envId === 'countryside') {
      if (t >= 0.0 && t <= 0.04) return 'overlook';
      if (t >= 0.24 && t <= 0.31) return 'bridge';
      if (t >= 0.78 && t <= 0.85) return 'rest-area';
      return 'highway';
    }
    // Rainy Expressway & Endless Desert
    if (t >= 0.0 && t <= 0.04) return 'overlook';
    if (t >= 0.8 && t <= 0.88) return 'rest-area';
    return 'highway';
  }

  private cellKey(cx: number, cz: number): string {
    return `${cx},${cz}`;
  }

  public getSampleAt(t: number): RoadSample {
    const wrapped = ((t % 1) + 1) % 1;
    const idx = Math.floor(wrapped * this.samples.length) % this.samples.length;
    return this.samples[idx];
  }

  public getFrameAt(t: number): {
    position: THREE.Vector3;
    tangent: THREE.Vector3;
    right: THREE.Vector3;
    up: THREE.Vector3;
    zone: RoadZone;
  } {
    const wrapped = ((t % 1) + 1) % 1;
    const position = this.curve.getPointAt(wrapped);
    const tangent = this.curve.getTangentAt(wrapped).normalize();
    const horizTangent = new THREE.Vector3(tangent.x, 0, tangent.z).normalize();
    const right = new THREE.Vector3().crossVectors(horizTangent, WORLD_UP).normalize();
    const up = new THREE.Vector3().crossVectors(right, tangent).normalize();
    return {
      position,
      tangent,
      right,
      up,
      zone: this.classifyZone(wrapped),
    };
  }

  public findClosest(x: number, z: number, searchRadiusCells = 2): ClosestRoadResult | null {
    const cx = Math.floor(x / this.cellSize);
    const cz = Math.floor(z / this.cellSize);

    let bestDistSq = Infinity;
    let bestIdx = -1;

    for (let dx = -searchRadiusCells; dx <= searchRadiusCells; dx++) {
      for (let dz = -searchRadiusCells; dz <= searchRadiusCells; dz++) {
        const bucket = this.grid.get(this.cellKey(cx + dx, cz + dz));
        if (!bucket) continue;
        for (let k = 0; k < bucket.length; k++) {
          const idx = bucket[k];
          const p = this.samples[idx].position;
          const ox = x - p.x;
          const oz = z - p.z;
          const d2 = ox * ox + oz * oz;
          if (d2 < bestDistSq) {
            bestDistSq = d2;
            bestIdx = idx;
          }
        }
      }
    }

    if (bestIdx === -1) return null;

    const sample = this.samples[bestIdx];
    const ox = x - sample.position.x;
    const oz = z - sample.position.z;
    const signedLateral = ox * sample.right.x + oz * sample.right.z;

    return {
      sample,
      distance2D: Math.sqrt(bestDistSq),
      signedLateral,
    };
  }

  public findClosestGlobal(x: number, z: number): ClosestRoadResult {
    const fast = this.findClosest(x, z, 3);
    if (fast) return fast;

    let bestDistSq = Infinity;
    let bestIdx = 0;
    for (let i = 0; i < this.samples.length; i += 2) {
      const p = this.samples[i].position;
      const dx = x - p.x;
      const dz = z - p.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestDistSq) {
        bestDistSq = d2;
        bestIdx = i;
      }
    }
    const sample = this.samples[bestIdx];
    const signedLateral = (x - sample.position.x) * sample.right.x + (z - sample.position.z) * sample.right.z;
    return { sample, distance2D: Math.sqrt(bestDistSq), signedLateral };
  }
}
