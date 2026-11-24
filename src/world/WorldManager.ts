import * as THREE from 'three';
import { RoadSpline } from '../roads/RoadSpline';
import { buildRoadMesh, BuiltRoad } from '../roads/RoadBuilder';
import { BuiltTerrain } from '../terrain/TerrainGenerator';
import { LakeSystem } from '../terrain/LakeSystem';
import { ForestSystem } from '../terrain/ForestSystem';
import { buildGuardrails, BuiltGuardrails } from '../roads/Guardrails';
import { Streetlights } from '../roads/Streetlights';
import { buildRoadsideLandmarks, BuiltLandmarks } from './RoadsideProps';
import { EnvironmentDescriptor, EnvironmentId, getEnvironmentById } from './EnvironmentConfig';
import { buildEnvironmentTerrain } from './environments/BiomeTerrain';
import { buildMidnightCityProps } from './environments/MidnightCityProps';
import { buildRainyExpresswayProps } from './environments/RainyExpresswayProps';
import { AnimatedLandmarks, buildOceanHighwayProps } from './environments/OceanHighwayProps';
import { buildCountrysideProps } from './environments/CountrysideProps';
import { buildEndlessDesertProps } from './environments/EndlessDesertProps';
import { GraphicsPreset } from '../settings/SettingsManager';

/**
 * Coordinates the active 3D environment across all 6 playable worlds:
 * Mountain Escape, Midnight City, Ocean Highway, Countryside, Rainy Expressway, and Endless Desert.
 * Supports clean resource disposal so switching maps at runtime never leaks GPU memory.
 */
export class WorldManager {
  public readonly envId: EnvironmentId;
  public readonly descriptor: EnvironmentDescriptor;
  public readonly group = new THREE.Group();
  public readonly spline: RoadSpline;
  public readonly road: BuiltRoad;
  public readonly terrain: BuiltTerrain;
  public readonly lake: LakeSystem | null;
  public readonly forest: ForestSystem | null;
  public readonly guardrails: BuiltGuardrails;
  public readonly streetlights: Streetlights;
  public readonly landmarks: BuiltLandmarks;

  private readonly landmarkUpdate?: (dt: number, elapsed: number) => void;
  private reflectionScale = 1.0;

  constructor(envId: EnvironmentId = 'mountain-escape', seed = 202604) {
    this.envId = envId;
    this.descriptor = getEnvironmentById(envId);
    this.group.name = `World_${envId}`;

    this.spline = new RoadSpline(1500, envId);
    this.road = buildRoadMesh(this.spline);
    this.terrain = buildEnvironmentTerrain(envId, this.spline, seed);
    this.guardrails = buildGuardrails(this.spline);
    this.streetlights = new Streetlights(this.spline, 6);

    // Water plane where appropriate (alpine lake, urban harbor, moonlit ocean, countryside creek)
    const hasWater =
      envId === 'mountain-escape' ||
      envId === 'midnight-city' ||
      envId === 'ocean-highway' ||
      envId === 'countryside';
    this.lake = hasWater ? new LakeSystem() : null;
    if (this.lake) {
      if (envId === 'countryside') {
        this.lake.mesh.position.set(660, 0.2, 10);
        this.lake.mesh.scale.set(0.34, 1, 0.38);
      } else if (envId === 'midnight-city') {
        this.lake.mesh.position.set(620, -0.4, -40);
        this.lake.mesh.scale.set(0.45, 1, 0.45);
      } else if (envId === 'ocean-highway') {
        this.lake.mesh.position.set(80, 0.0, 20);
        this.lake.mesh.scale.set(1.35, 1, 1.35);
      }
    }

    // Forest / Vegetation tailored per biome
    const treeCount =
      envId === 'mountain-escape'
        ? 2600
        : envId === 'rainy-expressway'
        ? 1800
        : envId === 'countryside'
        ? 1100
        : envId === 'ocean-highway'
        ? 950
        : 0; // Midnight City has skyscrapers; Endless Desert has cacti & mesas
    this.forest = treeCount > 0 ? new ForestSystem(this.spline, this.terrain, seed, treeCount) : null;

    // Dedicated biome landmarks & architecture
    if (envId === 'mountain-escape') {
      this.landmarks = buildRoadsideLandmarks(this.spline, this.terrain);
    } else if (envId === 'midnight-city') {
      this.landmarks = buildMidnightCityProps(this.spline, this.terrain);
    } else if (envId === 'rainy-expressway') {
      this.landmarks = buildRainyExpresswayProps(this.spline);
    } else if (envId === 'ocean-highway') {
      const animated: AnimatedLandmarks = buildOceanHighwayProps(this.spline, this.terrain);
      this.landmarks = animated;
      this.landmarkUpdate = animated.update;
    } else if (envId === 'countryside') {
      this.landmarks = buildCountrysideProps(this.spline, this.terrain);
    } else {
      this.landmarks = buildEndlessDesertProps(this.spline, this.terrain);
    }

    this.group.add(
      this.terrain.mesh,
      this.terrain.distantRingMesh,
      this.road.group,
      this.guardrails.group,
      this.streetlights.group,
      this.landmarks.group
    );
    if (this.lake) this.group.add(this.lake.mesh);
    if (this.forest) this.group.add(this.forest.group);
  }

  public setQuality(preset: GraphicsPreset): void {
    this.forest?.setQuality(preset);
    this.lake?.setQuality(preset);
    this.reflectionScale =
      preset === 'low' ? 0.35 : preset === 'medium' ? 0.65 : preset === 'high' ? 0.92 : 1.1;
  }

  public setRoadWetness(wetness: number): void {
    const w = Math.max(0, Math.min(1, wetness));
    // Urban & expressway wet surfaces glisten slightly stronger; desert stays drier
    const biomeWetBoost =
      this.envId === 'midnight-city' || this.envId === 'rainy-expressway'
        ? 1.15
        : this.envId === 'endless-desert'
        ? 0.45
        : 1.0;
    const effW = Math.min(1, w * biomeWetBoost);
    this.road.roadMaterial.roughness = 0.68 - effW * 0.38;
    this.road.roadMaterial.metalness = 0.1 + effW * 0.24 * this.reflectionScale;
    this.road.roadMaterial.clearcoat = (0.14 + effW * 0.74) * this.reflectionScale;
    this.road.roadMaterial.clearcoatRoughness = 0.46 - effW * 0.32;
  }

  public getDistanceToWater(pos: THREE.Vector3): number {
    if (this.descriptor.waterAudioMode === 'none') return 9999;
    if (this.envId === 'ocean-highway') {
      const dx = (pos.x - 40) / 560;
      const dz = (pos.z - 40) / 470;
      return Math.max(0, (Math.hypot(dx, dz) - 0.9) * 320);
    }
    const dx = (pos.x + 40) / 480;
    const dz = (pos.z - 20) / 380;
    return Math.max(0, (Math.hypot(dx, dz) - 0.95) * 420);
  }

  public update(dt: number, elapsedTime: number, focusPosition: THREE.Vector3): void {
    this.lake?.update(elapsedTime);
    this.forest?.update(elapsedTime);
    this.streetlights.update(focusPosition);
    this.landmarkUpdate?.(dt, elapsedTime);
  }

  /** Properly disposes all Three.js geometries, materials, and textures when switching maps. */
  public dispose(): void {
    this.group.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) {
        mesh.geometry.dispose();
      }
      if (mesh.material) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const mat of mats) {
          const std = mat as THREE.MeshStandardMaterial;
          std.map?.dispose();
          std.roughnessMap?.dispose();
          std.bumpMap?.dispose();
          std.emissiveMap?.dispose();
          mat.dispose();
        }
      }
    });
  }
}
