import * as THREE from 'three';
import { RoadSpline } from '../../roads/RoadSpline';
import { BuiltTerrain } from '../../terrain/TerrainGenerator';
import { BuiltLandmarks, StaticBoxCollider } from '../RoadsideProps';
import { seededRandom } from '../../utils/MathUtils';

export interface AnimatedLandmarks extends BuiltLandmarks {
  update?: (dt: number, elapsed: number) => void;
}

/**
 * Builds the Ocean Highway coastal landmarks:
 * - Iconic red-and-white Coastal Lighthouse with rotating luminous twin searchlight beams
 * - Coastal causeway bridge over the moonlit surf channel
 * - Rocky offshore sea stacks & warm illuminated seaside bay village
 */
export function buildOceanHighwayProps(spline: RoadSpline, terrain: BuiltTerrain): AnimatedLandmarks {
  const group = new THREE.Group();
  group.name = 'OceanHighwayProps';
  const boxColliders: StaticBoxCollider[] = [];
  const rand = seededRandom(5512);

  // 1. Rotating-Beam Coastal Lighthouse on the rocky promontory at (160, -140)
  const lhX = 160;
  const lhZ = -140;
  const lhY = Math.max(4, terrain.getHeightAt(lhX, lhZ));

  const lighthouse = new THREE.Group();
  lighthouse.position.set(lhX, lhY - 0.8, lhZ);

  const whiteStone = new THREE.MeshStandardMaterial({ color: 0xdbe3ee, roughness: 0.72 });
  const redBand = new THREE.MeshStandardMaterial({ color: 0xa82e36, roughness: 0.65 });
  const darkRoof = new THREE.MeshStandardMaterial({ color: 0x1e2530, roughness: 0.5, metalness: 0.5 });

  // Tapered alternating coastal lighthouse tower
  const baseTower = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 4.6, 12, 16), whiteStone);
  baseTower.position.y = 6;
  const midBand = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.2, 8, 16), redBand);
  midBand.position.y = 16;
  const upperTower = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.6, 9, 16), whiteStone);
  upperTower.position.y = 24.5;
  const gallery = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 2.5, 1.1, 16), darkRoof);
  gallery.position.y = 29.4;

  const lanternGlass = new THREE.Mesh(
    new THREE.CylinderGeometry(1.75, 1.75, 3.2, 16),
    new THREE.MeshStandardMaterial({
      color: 0xfff0c4,
      emissive: new THREE.Color(0xffd275),
      emissiveIntensity: 3.6,
    })
  );
  lanternGlass.position.y = 31.5;

  const cap = new THREE.Mesh(new THREE.ConeGeometry(2.2, 2.8, 16), darkRoof);
  cap.position.y = 34.5;

  lighthouse.add(baseTower, midBand, upperTower, gallery, lanternGlass, cap);

  // Rotating twin volumetric light cones sweeping across the moonlit ocean!
  const beamPivot = new THREE.Group();
  beamPivot.position.y = 31.5;

  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xffe4a8,
    transparent: true,
    opacity: 0.16,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  for (const dir of [-1, 1] as const) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(16, 190, 16, 1, true), beamMat);
    cone.rotation.z = dir * (Math.PI / 2);
    cone.position.x = dir * 96;
    beamPivot.add(cone);
  }
  lighthouse.add(beamPivot);
  group.add(lighthouse);

  // 2. Coastal Causeway Bridge Structure
  const bridgeSamples = spline.samples.filter((s) => s.zone === 'bridge');
  const concreteMat = new THREE.MeshStandardMaterial({ color: 0x454f5e, roughness: 0.85 });
  const deckW = (spline.roadHalfWidth + spline.shoulderWidth) * 2;
  const slabGeo = new THREE.BoxGeometry(deckW + 0.6, 1.35, 11.4);
  const pierGeo = new THREE.CylinderGeometry(1.05, 1.45, 24, 10);

  for (let i = 0; i < bridgeSamples.length; i += 3) {
    const s = bridgeSamples[i];
    const yaw = Math.atan2(s.tangent.x, s.tangent.z);
    const slab = new THREE.Mesh(slabGeo, concreteMat);
    slab.position.set(s.position.x, s.position.y - 0.72, s.position.z);
    slab.rotation.y = yaw;
    group.add(slab);

    if (i % 12 === 0) {
      for (const side of [-1, 1] as const) {
        const pier = new THREE.Mesh(pierGeo, concreteMat);
        pier.position.set(
          s.position.x + s.right.x * 4.4 * side,
          s.position.y - 12.6,
          s.position.z + s.right.z * 4.4 * side
        );
        group.add(pier);
      }
    }
  }

  // 3. Offshore Sea Stacks & Coastal Rocks
  const seaRockMat = new THREE.MeshStandardMaterial({
    color: 0x2f3a47,
    roughness: 0.9,
    flatShading: true,
  });
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rockMatrices: THREE.Matrix4[] = [];
  const dummy = new THREE.Object3D();

  for (let i = 0; i < 42; i++) {
    const angle = rand() * Math.PI * 2;
    const radius = 140 + rand() * 340;
    const x = 40 + Math.cos(angle) * radius;
    const z = 40 + Math.sin(angle) * radius;
    const y = terrain.getHeightAt(x, z);
    if (y > -1.0) continue;
    if (Math.hypot(x - lhX, z - lhZ) < 95) continue;

    const sx = 6 + rand() * 14;
    const sy = 5 + rand() * 16;
    const sz = 6 + rand() * 14;
    dummy.position.set(x, sy * 0.25, z);
    dummy.rotation.set(rand() * 0.4, rand() * Math.PI * 2, rand() * 0.4);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    rockMatrices.push(dummy.matrix.clone());
  }

  if (rockMatrices.length > 0) {
    const seaStacks = new THREE.InstancedMesh(rockGeo, seaRockMat, rockMatrices.length);
    for (let i = 0; i < rockMatrices.length; i++) seaStacks.setMatrixAt(i, rockMatrices[i]);
    seaStacks.instanceMatrix.needsUpdate = true;
    group.add(seaStacks);
  }

  // 4. Warm Illuminated Coastal Bay Village clustered along the distant northern cove
  const houseMat = new THREE.MeshStandardMaterial({ color: 0x26303d, roughness: 0.85 });
  const winMat = new THREE.MeshStandardMaterial({
    color: 0xffe4ad,
    emissive: new THREE.Color(0xffb454),
    emissiveIntensity: 2.8,
  });
  const houseGeo = new THREE.BoxGeometry(8, 5, 7);
  const winGeo = new THREE.BoxGeometry(8.2, 1.3, 2.2);
  const hMats: THREE.Matrix4[] = [];
  const wMats: THREE.Matrix4[] = [];

  for (const [cx, cz] of [
    [-340, -420],
    [220, -440],
    [-460, 260],
  ]) {
    for (let i = 0; i < 20; i++) {
      const x = cx + (rand() - 0.5) * 180;
      const z = cz + (rand() - 0.5) * 140;
      const y = terrain.getHeightAt(x, z);
      if (y < 2.2 || y > 30) continue;
      const c = spline.findClosest(x, z, 2);
      if (c && c.distance2D < 24) continue;

      const s = 0.75 + rand() * 0.9;
      dummy.position.set(x, y + 2.2 * s, z);
      dummy.rotation.set(0, rand() * Math.PI * 2, 0);
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      hMats.push(dummy.matrix.clone());
      wMats.push(dummy.matrix.clone());
    }
  }

  if (hMats.length > 0) {
    const houses = new THREE.InstancedMesh(houseGeo, houseMat, hMats.length);
    const wins = new THREE.InstancedMesh(winGeo, winMat, wMats.length);
    for (let i = 0; i < hMats.length; i++) {
      houses.setMatrixAt(i, hMats[i]);
      wins.setMatrixAt(i, wMats[i]);
    }
    houses.instanceMatrix.needsUpdate = true;
    wins.instanceMatrix.needsUpdate = true;
    group.add(houses, wins);
  }

  return {
    group,
    boxColliders,
    update: (dt: number) => {
      beamPivot.rotation.y += dt * 0.52;
    },
  };
}
