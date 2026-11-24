import * as THREE from 'three';
import { RoadSpline } from '../roads/RoadSpline';
import { BuiltTerrain } from './TerrainGenerator';
import { Noise2D } from './Noise';
import { GraphicsPreset } from '../settings/SettingsManager';
import { seededRandom } from '../utils/MathUtils';

interface InstancedLayer {
  mesh: THREE.InstancedMesh;
  maxCount: number;
}

/**
 * Diverse instanced alpine vegetation & rock system:
 * - Natural noise-clustered pine forests (tall alpine spruce + fuller mountain fir)
 * - Lakeside broadleaf trees in lower meadows
 * - Low roadside bushes/shrubs & jagged granite boulders
 * - GPU vertex-shader wind sway (zero per-tree CPU cost)
 * - Instant GraphicsPreset density scaling via InstancedMesh.count
 */
export class ForestSystem {
  public readonly group = new THREE.Group();
  private readonly layers: InstancedLayer[] = [];
  private readonly shadowCastMeshes: THREE.InstancedMesh[] = [];
  private readonly windUniform = { value: 0 };

  constructor(spline: RoadSpline, terrain: BuiltTerrain, seed = 202604, maxTrees = 2800) {
    this.group.name = 'AlpineVegetation';

    const rand = seededRandom(seed + 515);
    const clusterNoise = new Noise2D(seed + 999);
    const spread = terrain.size * 0.46;

    interface Placement {
      x: number;
      y: number;
      z: number;
      scale: number;
      scaleY: number;
      rotY: number;
      tint: number;
    }

    const pinePlacements: Placement[] = [];
    const broadleafPlacements: Placement[] = [];
    const bushPlacements: Placement[] = [];
    const rockPlacements: Placement[] = [];

    const checkRoadClearance = (x: number, z: number, extra = 0): boolean => {
      const closest = spline.findClosest(x, z, 2);
      if (!closest) return true;
      const base =
        closest.sample.zone === 'rest-area'
          ? 34
          : closest.sample.zone === 'viewpoint'
          ? 24
          : closest.sample.zone === 'overlook'
          ? 20
          : closest.sample.zone === 'tunnel'
          ? 16
          : 12.2;
      return closest.distance2D >= base + extra;
    };

    // 1. Clustered Evergreen Pines & Lakeside Broadleaf Trees
    let attempts = 0;
    const maxAttempts = maxTrees * 9;
    while (pinePlacements.length + broadleafPlacements.length < maxTrees && attempts < maxAttempts) {
      attempts++;
      const x = (rand() * 2 - 1) * spread;
      const z = (rand() * 2 - 1) * spread;
      const y = terrain.getHeightAt(x, z);
      if (y < 2.4 || y > 92) continue;

      const hx = terrain.getHeightAt(x + 4, z);
      const hz = terrain.getHeightAt(x, z + 4);
      const slope = Math.hypot(hx - y, hz - y) / 4;
      if (slope > 0.72) continue;

      if (!checkRoadClearance(x, z, 0)) continue;

      // Natural organic forest clusters & clearings via fBm noise
      const cluster = clusterNoise.fbm(x * 0.0045, z * 0.0045, 3) * 0.5 + 0.5;
      if (cluster < 0.34 && rand() < 0.78) continue;

      const p: Placement = {
        x,
        y: y - 0.35,
        z,
        scale: 0.76 + rand() * 0.98,
        scaleY: 0.85 + rand() * 0.45,
        rotY: rand() * Math.PI * 2,
        tint: 0.78 + rand() * 0.44,
      };

      // Mix broadleaf trees gently in lower lakeside meadows (< 18m elevation)
      if (y < 18 && rand() < 0.2 && broadleafPlacements.length < 380) {
        broadleafPlacements.push(p);
      } else {
        pinePlacements.push(p);
      }
    }

    // 2. Roadside Bushes / Shrubs along forested embankments
    for (let i = 0; i < 1600 && bushPlacements.length < 650; i++) {
      const x = (rand() * 2 - 1) * spread * 0.92;
      const z = (rand() * 2 - 1) * spread * 0.92;
      const y = terrain.getHeightAt(x, z);
      if (y < 1.8 || y > 58) continue;
      if (!checkRoadClearance(x, z, -2.5)) continue;
      bushPlacements.push({
        x,
        y: y - 0.12,
        z,
        scale: 0.75 + rand() * 1.15,
        scaleY: 0.6 + rand() * 0.55,
        rotY: rand() * Math.PI * 2,
        tint: 0.75 + rand() * 0.45,
      });
    }

    // 3. Natural Mountain Boulders & Roadside Granite Rocks
    for (let i = 0; i < 1400 && rockPlacements.length < 420; i++) {
      const x = (rand() * 2 - 1) * spread * 0.94;
      const z = (rand() * 2 - 1) * spread * 0.94;
      const y = terrain.getHeightAt(x, z);
      if (y < 0.8 || y > 115) continue;
      if (!checkRoadClearance(x, z, -2.0)) continue;

      const hx = terrain.getHeightAt(x + 4, z);
      const hz = terrain.getHeightAt(x, z + 4);
      const slope = Math.hypot(hx - y, hz - y) / 4;
      // Favor rocky slopes, shorelines, and embankments
      if (slope < 0.14 && y > 4.5 && rand() < 0.6) continue;

      rockPlacements.push({
        x,
        y: y - 0.3,
        z,
        scale: 0.85 + rand() * 2.4,
        scaleY: 0.55 + rand() * 0.85,
        rotY: rand() * Math.PI * 2,
        tint: 0.75 + rand() * 0.4,
      });
    }

    // Shared GPU wind-sway foliage material
    const applyWindSway = (mat: THREE.MeshStandardMaterial, amplitude: number) => {
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uWindTime = this.windUniform;
        shader.vertexShader =
          `uniform float uWindTime;\n` +
          shader.vertexShader.replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
             float swayWeight = max(0.0, position.y - 1.5) * 0.085;
             float phase = instanceMatrix[3][0] * 0.09 + instanceMatrix[3][2] * 0.09;
             transformed.x += sin(uWindTime * 1.15 + phase) * ${amplitude.toFixed(3)} * swayWeight;
             transformed.z += cos(uWindTime * 0.92 + phase * 1.3) * ${(amplitude * 0.7).toFixed(3)} * swayWeight;`
          );
      };
    };

    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x2b1e17, roughness: 0.94 });
    const pineMat = new THREE.MeshStandardMaterial({
      color: 0x1e382b,
      roughness: 0.86,
      metalness: 0.04,
      flatShading: true,
    });
    applyWindSway(pineMat, 0.22);

    const broadleafMat = new THREE.MeshStandardMaterial({
      color: 0x243d2c,
      roughness: 0.88,
      metalness: 0.03,
      flatShading: true,
    });
    applyWindSway(broadleafMat, 0.28);

    const bushMat = new THREE.MeshStandardMaterial({
      color: 0x1c3425,
      roughness: 0.9,
      flatShading: true,
    });
    applyWindSway(bushMat, 0.14);

    const rockMat = new THREE.MeshStandardMaterial({
      color: 0x454f5e,
      roughness: 0.92,
      metalness: 0.06,
      flatShading: true,
    });

    const dummy = new THREE.Object3D();
    const col = new THREE.Color();

    // --- Build Pine Trees (4-tier evergreen silhouettes) ---
    if (pinePlacements.length > 0) {
      const n = pinePlacements.length;
      const trunkGeo = new THREE.CylinderGeometry(0.16, 0.34, 4.4, 6);
      trunkGeo.translate(0, 2.2, 0);

      const t1Geo = new THREE.ConeGeometry(2.65, 5.0, 7);
      t1Geo.translate(0, 5.2, 0);
      const t2Geo = new THREE.ConeGeometry(2.1, 4.7, 7);
      t2Geo.translate(0, 8.0, 0);
      const t3Geo = new THREE.ConeGeometry(1.45, 4.2, 7);
      t3Geo.translate(0, 10.6, 0);
      const t4Geo = new THREE.ConeGeometry(0.82, 3.0, 6);
      t4Geo.translate(0, 12.6, 0);

      const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, n);
      const tier1 = new THREE.InstancedMesh(t1Geo, pineMat, n);
      const tier2 = new THREE.InstancedMesh(t2Geo, pineMat, n);
      const tier3 = new THREE.InstancedMesh(t3Geo, pineMat, n);
      const tier4 = new THREE.InstancedMesh(t4Geo, pineMat, n);

      tier1.castShadow = true;
      tier1.receiveShadow = true;
      tier2.castShadow = true;
      tier2.receiveShadow = true;
      tier3.receiveShadow = true;
      tier4.receiveShadow = true;
      this.shadowCastMeshes.push(tier1, tier2);

      for (let i = 0; i < n; i++) {
        const p = pinePlacements[i];
        dummy.position.set(p.x, p.y, p.z);
        dummy.rotation.set(0, p.rotY, 0);
        dummy.scale.set(p.scale, p.scale * p.scaleY, p.scale);
        dummy.updateMatrix();

        trunks.setMatrixAt(i, dummy.matrix);
        tier1.setMatrixAt(i, dummy.matrix);
        tier2.setMatrixAt(i, dummy.matrix);
        tier3.setMatrixAt(i, dummy.matrix);
        tier4.setMatrixAt(i, dummy.matrix);

        col.setRGB(0.10 * p.tint, 0.23 * p.tint, 0.16 * p.tint);
        tier1.setColorAt(i, col);
        tier2.setColorAt(i, col.clone().multiplyScalar(1.08));
        tier3.setColorAt(i, col.clone().multiplyScalar(1.16));
        tier4.setColorAt(i, col.clone().multiplyScalar(1.24));
      }

      for (const m of [trunks, tier1, tier2, tier3, tier4]) {
        m.instanceMatrix.needsUpdate = true;
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
        this.group.add(m);
        this.layers.push({ mesh: m, maxCount: n });
      }
    }

    // --- Build Broadleaf Mountain Trees ---
    if (broadleafPlacements.length > 0) {
      const n = broadleafPlacements.length;
      const bTrunkGeo = new THREE.CylinderGeometry(0.18, 0.3, 3.8, 6);
      bTrunkGeo.translate(0, 1.9, 0);
      const crownGeo = new THREE.DodecahedronGeometry(2.5, 1);
      crownGeo.scale(1.08, 0.88, 1.04);
      crownGeo.translate(0, 5.1, 0);

      const bTrunks = new THREE.InstancedMesh(bTrunkGeo, trunkMat, n);
      const bCrowns = new THREE.InstancedMesh(crownGeo, broadleafMat, n);
      bCrowns.castShadow = true;
      bCrowns.receiveShadow = true;
      this.shadowCastMeshes.push(bCrowns);

      for (let i = 0; i < n; i++) {
        const p = broadleafPlacements[i];
        dummy.position.set(p.x, p.y, p.z);
        dummy.rotation.set(0, p.rotY, 0);
        dummy.scale.set(p.scale, p.scale * p.scaleY, p.scale);
        dummy.updateMatrix();
        bTrunks.setMatrixAt(i, dummy.matrix);
        bCrowns.setMatrixAt(i, dummy.matrix);
        col.setRGB(0.14 * p.tint, 0.27 * p.tint, 0.16 * p.tint);
        bCrowns.setColorAt(i, col);
      }

      for (const m of [bTrunks, bCrowns]) {
        m.instanceMatrix.needsUpdate = true;
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
        this.group.add(m);
        this.layers.push({ mesh: m, maxCount: n });
      }
    }

    // --- Build Roadside Bushes / Shrubs ---
    if (bushPlacements.length > 0) {
      const n = bushPlacements.length;
      const bushGeo = new THREE.DodecahedronGeometry(1.15, 0);
      bushGeo.scale(1.25, 0.72, 1.15);
      bushGeo.translate(0, 0.65, 0);

      const bushes = new THREE.InstancedMesh(bushGeo, bushMat, n);
      bushes.receiveShadow = true;
      for (let i = 0; i < n; i++) {
        const p = bushPlacements[i];
        dummy.position.set(p.x, p.y, p.z);
        dummy.rotation.set(0, p.rotY, 0);
        dummy.scale.set(p.scale, p.scaleY, p.scale);
        dummy.updateMatrix();
        bushes.setMatrixAt(i, dummy.matrix);
        col.setRGB(0.12 * p.tint, 0.25 * p.tint, 0.15 * p.tint);
        bushes.setColorAt(i, col);
      }
      bushes.instanceMatrix.needsUpdate = true;
      if (bushes.instanceColor) bushes.instanceColor.needsUpdate = true;
      this.group.add(bushes);
      this.layers.push({ mesh: bushes, maxCount: n });
    }

    // --- Build Natural Granite Boulders / Rocks ---
    if (rockPlacements.length > 0) {
      const n = rockPlacements.length;
      const rockGeo = new THREE.DodecahedronGeometry(1.3, 0);
      const rocks = new THREE.InstancedMesh(rockGeo, rockMat, n);
      rocks.receiveShadow = true;
      for (let i = 0; i < n; i++) {
        const p = rockPlacements[i];
        dummy.position.set(p.x, p.y, p.z);
        dummy.rotation.set(p.rotY * 0.3, p.rotY, p.rotY * 0.2);
        dummy.scale.set(p.scale, p.scale * p.scaleY, p.scale * 0.88);
        dummy.updateMatrix();
        rocks.setMatrixAt(i, dummy.matrix);
        col.setRGB(0.28 * p.tint, 0.32 * p.tint, 0.38 * p.tint);
        rocks.setColorAt(i, col);
      }
      rocks.instanceMatrix.needsUpdate = true;
      if (rocks.instanceColor) rocks.instanceColor.needsUpdate = true;
      this.group.add(rocks);
      this.layers.push({ mesh: rocks, maxCount: n });
    }
  }

  public setQuality(preset: GraphicsPreset): void {
    const ratio =
      preset === 'low' ? 0.38 : preset === 'medium' ? 0.68 : preset === 'high' ? 0.9 : 1.0;
    for (const layer of this.layers) {
      layer.mesh.count = Math.max(1, Math.floor(layer.maxCount * ratio));
    }
    const castShadows = preset === 'high' || preset === 'ultra';
    for (const m of this.shadowCastMeshes) {
      m.castShadow = castShadows;
    }
  }

  public update(elapsedTime: number): void {
    this.windUniform.value = elapsedTime;
  }
}
