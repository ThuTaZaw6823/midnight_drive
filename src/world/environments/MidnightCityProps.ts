import * as THREE from 'three';
import { RoadSpline } from '../../roads/RoadSpline';
import { BuiltTerrain } from '../../terrain/TerrainGenerator';
import { BuiltLandmarks, StaticBoxCollider } from '../RoadsideProps';
import { createBuildingFacadeTexture } from '../../core/ProceduralTextures';
import { seededRandom } from '../../utils/MathUtils';

/**
 * Builds the neon-drenched Midnight City environment:
 * - Hundreds of illuminated skyscrapers & mid-rise urban blocks lining the boulevard
 * - Glowing neon signs (magenta, electric cyan, violet, warm amber) along building facades
 * - Overhead illuminated traffic-light gantries spanning the 4-lane avenue
 * - Modern lit neon-arch harbor bridge across the urban water channel
 */
export function buildMidnightCityProps(spline: RoadSpline, terrain: BuiltTerrain): BuiltLandmarks {
  const group = new THREE.Group();
  group.name = 'MidnightCityArchitecture';
  const boxColliders: StaticBoxCollider[] = [];
  const rand = seededRandom(7701);

  const facadeTex1 = createBuildingFacadeTexture(11, false);
  const facadeTex2 = createBuildingFacadeTexture(29, true);

  const towerMat1 = new THREE.MeshStandardMaterial({
    map: facadeTex1,
    emissiveMap: facadeTex1,
    emissive: new THREE.Color(0xcce4ff),
    emissiveIntensity: 0.92,
    roughness: 0.35,
    metalness: 0.55,
  });

  const towerMat2 = new THREE.MeshStandardMaterial({
    map: facadeTex2,
    emissiveMap: facadeTex2,
    emissive: new THREE.Color(0xffdcb0),
    emissiveIntensity: 0.85,
    roughness: 0.4,
    metalness: 0.48,
  });

  const neonColors = [0xff3ea8, 0x00e5ff, 0xa864ff, 0xffaa3b];
  const neonMats = neonColors.map(
    (hex) =>
      new THREE.MeshStandardMaterial({
        color: hex,
        emissive: new THREE.Color(hex),
        emissiveIntensity: 2.8,
        roughness: 0.2,
      })
  );

  const towerGeo = new THREE.BoxGeometry(1, 1, 1);
  const neonGeo = new THREE.BoxGeometry(1, 1, 1);

  const matricesA: THREE.Matrix4[] = [];
  const matricesB: THREE.Matrix4[] = [];
  const neonBuckets: THREE.Matrix4[][] = [[], [], [], []];
  const dummy = new THREE.Object3D();

  // 1. Place boulevard-front buildings evenly along both sides of the urban avenue
  const samples = spline.samples;
  let lastBuildDist = -100;
  for (let i = 0; i < samples.length; i += 4) {
    const s = samples[i];
    if (s.zone === 'bridge') continue;
    if (s.distance - lastBuildDist < 28) continue;
    lastBuildDist = s.distance;

    const yaw = Math.atan2(s.tangent.x, s.tangent.z);

    for (const side of [-1, 1] as const) {
      if (s.zone === 'rest-area' && side === 1) continue;

      const bw = 16 + rand() * 14;
      const bd = 16 + rand() * 16;
      const bh = 24 + rand() * 78;
      const lateral = spline.roadHalfWidth + 13 + bw * 0.5 + rand() * 5;

      const bx = s.position.x + s.right.x * lateral * side;
      const bz = s.position.z + s.right.z * lateral * side;
      const by = terrain.getHeightAt(bx, bz);
      if (by < 0.2) continue;

      // Double check not encroaching on another segment of the road
      const check = spline.findClosest(bx, bz, 2);
      if (check && check.distance2D < spline.roadHalfWidth + 11) continue;

      dummy.position.set(bx, by + bh * 0.5 - 1, bz);
      dummy.rotation.set(0, yaw, 0);
      dummy.scale.set(bw, bh, bd);
      dummy.updateMatrix();

      if (rand() < 0.55) matricesA.push(dummy.matrix.clone());
      else matricesB.push(dummy.matrix.clone());

      // Glowing vertical or horizontal neon billboard facing the boulevard!
      if (rand() < 0.72) {
        const neonColorIdx = Math.floor(rand() * neonBuckets.length);
        const signOffset = lateral - bw * 0.5 - 0.6;
        const sx = s.position.x + s.right.x * signOffset * side;
        const sz = s.position.z + s.right.z * signOffset * side;
        const isVertical = rand() < 0.5;
        const sy = by + 7 + rand() * Math.min(26, bh * 0.55);

        dummy.position.set(sx, sy, sz);
        dummy.rotation.set(0, yaw, 0);
        dummy.scale.set(0.35, isVertical ? 9 + rand() * 9 : 1.6 + rand() * 1.4, isVertical ? 1.8 : 7 + rand() * 6);
        dummy.updateMatrix();
        neonBuckets[neonColorIdx].push(dummy.matrix.clone());
      }
    }
  }

  // 2. Dense inner & outer skyline skyscrapers for rich metropolitan horizon silhouette
  for (let i = 0; i < 480; i++) {
    const x = (rand() * 2 - 1) * 1020;
    const z = (rand() * 2 - 1) * 1020;
    const y = terrain.getHeightAt(x, z);
    if (y < 0.5) continue;

    const closest = spline.findClosest(x, z, 2);
    if (closest && closest.distance2D < 34) continue;

    const bw = 20 + rand() * 28;
    const bd = 20 + rand() * 28;
    const bh = 38 + rand() * 135;

    dummy.position.set(x, y + bh * 0.5 - 1, z);
    dummy.rotation.set(0, (Math.floor(rand() * 4) * Math.PI) / 2, 0);
    dummy.scale.set(bw, bh, bd);
    dummy.updateMatrix();

    if (rand() < 0.52) matricesA.push(dummy.matrix.clone());
    else matricesB.push(dummy.matrix.clone());
  }

  const addInstanced = (geo: THREE.BufferGeometry, mat: THREE.Material, list: THREE.Matrix4[]) => {
    if (list.length === 0) return;
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    for (let i = 0; i < list.length; i++) mesh.setMatrixAt(i, list[i]);
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
  };

  addInstanced(towerGeo, towerMat1, matricesA);
  addInstanced(towerGeo, towerMat2, matricesB);
  neonBuckets.forEach((list, idx) => addInstanced(neonGeo, neonMats[idx], list));

  // 3. Illuminated Urban Traffic-Light Gantries over the 4-lane boulevard
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x262e3a, roughness: 0.45, metalness: 0.72 });
  const greenSigMat = new THREE.MeshStandardMaterial({
    color: 0x38ff9c,
    emissive: new THREE.Color(0x18e07c),
    emissiveIntensity: 3.0,
  });
  const redSigMat = new THREE.MeshStandardMaterial({
    color: 0xff3b4e,
    emissive: new THREE.Color(0xff1c34),
    emissiveIntensity: 2.2,
  });

  const spanW = spline.roadHalfWidth * 2 + 3.4;
  let lastGantry = -200;
  for (let i = 0; i < samples.length; i += 12) {
    const s = samples[i];
    if (s.zone !== 'highway') continue;
    if (s.distance - lastGantry < 360) continue;
    lastGantry = s.distance;

    const g = new THREE.Group();
    g.position.copy(s.position);
    g.rotation.y = Math.atan2(s.tangent.x, s.tangent.z);

    for (const side of [-1, 1] as const) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 8.2, 8), poleMat);
      post.position.set(side * (spanW * 0.5), 4.1, 0);
      g.add(post);
    }

    const crossBeam = new THREE.Mesh(new THREE.BoxGeometry(spanW + 0.4, 0.34, 0.34), poleMat);
    crossBeam.position.set(0, 7.8, 0);
    g.add(crossBeam);

    // Three signal boxes across the lanes (always green for relaxing uninterrupted driving!)
    for (const lx of [-3.2, 0, 3.2]) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.05, 0.32), poleMat);
      box.position.set(lx, 7.25, 0);
      g.add(box);

      const lens = new THREE.Mesh(
        new THREE.SphereGeometry(0.11, 8, 8),
        lx < 0 ? redSigMat : greenSigMat
      );
      lens.position.set(lx, 6.96, -0.18);
      g.add(lens);
    }

    group.add(g);
  }

  // 4. Modern Illuminated Neon-Arch Harbor Bridge
  const bridgeSamples = samples.filter((s) => s.zone === 'bridge');
  const concreteMat = new THREE.MeshStandardMaterial({ color: 0x2d3544, roughness: 0.72, metalness: 0.3 });
  const cyanNeon = neonMats[1];
  const deckW = (spline.roadHalfWidth + spline.shoulderWidth) * 2;
  const slabGeo = new THREE.BoxGeometry(deckW + 0.8, 1.4, 11.5);
  const pierGeo = new THREE.CylinderGeometry(1.1, 1.4, 24, 10);

  for (let i = 0; i < bridgeSamples.length; i += 3) {
    const s = bridgeSamples[i];
    const yaw = Math.atan2(s.tangent.x, s.tangent.z);
    const slab = new THREE.Mesh(slabGeo, concreteMat);
    slab.position.set(s.position.x, s.position.y - 0.72, s.position.z);
    slab.rotation.y = yaw;
    group.add(slab);

    if (i % 15 === 0) {
      // Glowing cyan skyline bridge arch rib over the road
      const arch = new THREE.Mesh(
        new THREE.TorusGeometry(spline.roadHalfWidth + 2.4, 0.24, 8, 20, Math.PI),
        cyanNeon
      );
      arch.position.copy(s.position);
      arch.rotation.y = yaw;
      group.add(arch);

      for (const side of [-1, 1] as const) {
        const pier = new THREE.Mesh(pierGeo, concreteMat);
        pier.position.set(
          s.position.x + s.right.x * 5.6 * side,
          s.position.y - 12.6,
          s.position.z + s.right.z * 5.6 * side
        );
        group.add(pier);
      }
    }
  }

  return { group, boxColliders };
}
