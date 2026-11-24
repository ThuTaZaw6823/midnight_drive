import * as THREE from 'three';
import { RoadSpline } from '../../roads/RoadSpline';
import { BuiltTerrain } from '../../terrain/TerrainGenerator';
import { BuiltLandmarks, StaticBoxCollider } from '../RoadsideProps';
import { seededRandom } from '../../utils/MathUtils';

/**
 * Builds the Endless Desert night highway environment:
 * - Iconic flat-topped stratified red-rock mesas & sandstone canyon spires
 * - Instanced Saguaro cacti, desert scrub bushes & red boulders
 * - Weathered wooden utility poles lining the solitary desert blacktop
 * - Warm neon roadside oasis stop ("STARLIGHT MOTEL & DINER")
 */
export function buildEndlessDesertProps(spline: RoadSpline, terrain: BuiltTerrain): BuiltLandmarks {
  const group = new THREE.Group();
  group.name = 'EndlessDesertProps';
  const boxColliders: StaticBoxCollider[] = [];
  const rand = seededRandom(6619);
  const dummy = new THREE.Object3D();

  // 1. Stratified Flat-Topped Red-Rock Mesas & Buttes
  const mesaMat = new THREE.MeshStandardMaterial({
    color: 0x6f3928,
    roughness: 0.94,
    metalness: 0.04,
    flatShading: true,
  });

  const mesaGeo = new THREE.CylinderGeometry(0.62, 1.0, 1.0, 9);
  const mesaMatrices: THREE.Matrix4[] = [];

  for (let i = 0; i < 42; i++) {
    const x = (rand() * 2 - 1) * 1020;
    const z = (rand() * 2 - 1) * 1020;
    const closest = spline.findClosest(x, z, 2);
    if (closest && closest.distance2D < 95) continue;

    const y = terrain.getHeightAt(x, z);
    const r = 24 + rand() * 52;
    const h = 28 + rand() * 75;

    dummy.position.set(x, y + h * 0.42, z);
    dummy.rotation.set(0, rand() * Math.PI * 2, 0);
    dummy.scale.set(r, h, r * (0.75 + rand() * 0.5));
    dummy.updateMatrix();
    mesaMatrices.push(dummy.matrix.clone());
  }

  if (mesaMatrices.length > 0) {
    const mesas = new THREE.InstancedMesh(mesaGeo, mesaMat, mesaMatrices.length);
    for (let i = 0; i < mesaMatrices.length; i++) mesas.setMatrixAt(i, mesaMatrices[i]);
    mesas.instanceMatrix.needsUpdate = true;
    group.add(mesas);
  }

  // 2. Instanced Saguaro Cacti & Desert Sage Scrub
  const cactusMat = new THREE.MeshStandardMaterial({ color: 0x26442c, roughness: 0.9 });
  const scrubMat = new THREE.MeshStandardMaterial({ color: 0x4b4c32, roughness: 0.95, flatShading: true });

  const trunkGeo = new THREE.CylinderGeometry(0.26, 0.32, 5.4, 7);
  trunkGeo.translate(0, 2.7, 0);
  const armGeo = new THREE.BoxGeometry(1.75, 0.36, 0.36);
  armGeo.translate(0, 3.1, 0);
  const scrubGeo = new THREE.DodecahedronGeometry(0.95, 0);
  scrubGeo.scale(1.3, 0.6, 1.2);
  scrubGeo.translate(0, 0.45, 0);

  const cactusMatrices: THREE.Matrix4[] = [];
  const scrubMatrices: THREE.Matrix4[] = [];

  for (let i = 0; i < 1200; i++) {
    const x = (rand() * 2 - 1) * 1040;
    const z = (rand() * 2 - 1) * 1040;
    const y = terrain.getHeightAt(x, z);
    if (y > 26) continue;
    const closest = spline.findClosest(x, z, 2);
    if (closest && closest.distance2D < 13) continue;

    dummy.position.set(x, y - 0.15, z);
    dummy.rotation.set(0, rand() * Math.PI * 2, 0);

    if (rand() < 0.32 && cactusMatrices.length < 360) {
      const sc = 0.72 + rand() * 0.78;
      dummy.scale.set(sc, sc, sc);
      dummy.updateMatrix();
      cactusMatrices.push(dummy.matrix.clone());
    } else if (scrubMatrices.length < 620) {
      const sc = 0.7 + rand() * 1.1;
      dummy.scale.set(sc, sc * 0.8, sc);
      dummy.updateMatrix();
      scrubMatrices.push(dummy.matrix.clone());
    }
  }

  if (cactusMatrices.length > 0) {
    const trunks = new THREE.InstancedMesh(trunkGeo, cactusMat, cactusMatrices.length);
    const arms = new THREE.InstancedMesh(armGeo, cactusMat, cactusMatrices.length);
    for (let i = 0; i < cactusMatrices.length; i++) {
      trunks.setMatrixAt(i, cactusMatrices[i]);
      arms.setMatrixAt(i, cactusMatrices[i]);
    }
    trunks.instanceMatrix.needsUpdate = true;
    arms.instanceMatrix.needsUpdate = true;
    group.add(trunks, arms);
  }

  if (scrubMatrices.length > 0) {
    const scrubs = new THREE.InstancedMesh(scrubGeo, scrubMat, scrubMatrices.length);
    for (let i = 0; i < scrubMatrices.length; i++) scrubs.setMatrixAt(i, scrubMatrices[i]);
    scrubs.instanceMatrix.needsUpdate = true;
    group.add(scrubs);
  }

  // 3. Weathered Wooden Desert Utility Poles along the highway edge
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x3b2c22, roughness: 0.95 });
  const poleGeo = new THREE.CylinderGeometry(0.11, 0.16, 9.2, 6);
  const crossGeo = new THREE.BoxGeometry(2.4, 0.14, 0.14);
  const poleMats: THREE.Matrix4[] = [];
  const crossMats: THREE.Matrix4[] = [];

  let lastPole = -100;
  for (let i = 0; i < spline.samples.length; i += 3) {
    const s = spline.samples[i];
    if (s.zone === 'rest-area') continue;
    if (s.distance - lastPole < 68) continue;
    lastPole = s.distance;

    const offset = spline.roadHalfWidth + 6.4;
    const px = s.position.x - s.right.x * offset;
    const pz = s.position.z - s.right.z * offset;
    const py = terrain.getHeightAt(px, pz);
    const yaw = Math.atan2(s.tangent.x, s.tangent.z);

    dummy.position.set(px, py + 4.4, pz);
    dummy.rotation.set(0, yaw, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    poleMats.push(dummy.matrix.clone());

    dummy.position.set(px, py + 8.3, pz);
    dummy.updateMatrix();
    crossMats.push(dummy.matrix.clone());
  }

  if (poleMats.length > 0) {
    const poles = new THREE.InstancedMesh(poleGeo, poleMat, poleMats.length);
    const crosses = new THREE.InstancedMesh(crossGeo, poleMat, crossMats.length);
    for (let i = 0; i < poleMats.length; i++) {
      poles.setMatrixAt(i, poleMats[i]);
      crosses.setMatrixAt(i, crossMats[i]);
    }
    poles.instanceMatrix.needsUpdate = true;
    crosses.instanceMatrix.needsUpdate = true;
    group.add(poles, crosses);
  }

  // 4. Glowing Neon Desert Oasis Diner & Motel ("STARLIGHT DINER") at the Rest Area
  const restFrame = spline.getFrameAt(0.84);
  const yaw = Math.atan2(restFrame.tangent.x, restFrame.tangent.z);
  const anchorPos = restFrame.position
    .clone()
    .addScaledVector(restFrame.right, spline.roadHalfWidth + 16.5);

  const oasis = new THREE.Group();
  oasis.position.copy(anchorPos);
  oasis.rotation.y = yaw;

  const dinerWall = new THREE.Mesh(
    new THREE.BoxGeometry(10, 4.2, 22),
    new THREE.MeshStandardMaterial({ color: 0x3a2d28, roughness: 0.85 })
  );
  dinerWall.position.set(4, 2.1, 0);
  oasis.add(dinerWall);

  const dinerRoof = new THREE.Mesh(
    new THREE.BoxGeometry(12.5, 0.45, 24),
    new THREE.MeshStandardMaterial({ color: 0x241d1c, roughness: 0.7 })
  );
  dinerRoof.position.set(3.2, 4.35, 0);
  oasis.add(dinerRoof);

  const neonPink = new THREE.MeshStandardMaterial({
    color: 0xff6bb5,
    emissive: new THREE.Color(0xff429e),
    emissiveIntensity: 2.8,
  });
  const neonAmber = new THREE.MeshStandardMaterial({
    color: 0xffcf70,
    emissive: new THREE.Color(0xff9d33),
    emissiveIntensity: 2.6,
  });

  const roofNeon = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 23.6), neonPink);
  roofNeon.position.set(-3.0, 4.35, 0);
  oasis.add(roofNeon);

  for (let wz = -7; wz <= 7; wz += 4.6) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.8, 3.0), neonAmber);
    win.position.set(-1.05, 2.1, wz);
    oasis.add(win);
  }

  // Tall glowing roadside neon motel pylon sign
  const signPole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 11, 8), poleMat);
  signPole.position.set(-8.5, 5.5, -14);
  oasis.add(signPole);

  const signBox = new THREE.Mesh(new THREE.BoxGeometry(0.4, 3.2, 5.2), neonPink);
  signBox.position.set(-8.5, 9.2, -14);
  oasis.add(signBox);

  const oasisLight = new THREE.PointLight(0xffad5c, 42, 40, 1.5);
  oasisLight.position.set(-4.0, 4.2, 0);
  oasis.add(oasisLight);

  group.add(oasis);

  boxColliders.push({
    position: anchorPos
      .clone()
      .add(new THREE.Vector3(4, 2.1, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw)),
    rotationY: yaw,
    halfExtents: new THREE.Vector3(5.2, 2.2, 11.2),
  });

  return { group, boxColliders };
}
