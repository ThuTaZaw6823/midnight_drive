import * as THREE from 'three';
import { RoadSpline } from '../../roads/RoadSpline';
import { BuiltTerrain } from '../../terrain/TerrainGenerator';
import { BuiltLandmarks, StaticBoxCollider } from '../RoadsideProps';
import { seededRandom } from '../../utils/MathUtils';

/**
 * Builds the peaceful Countryside rural environment:
 * - Warm-lit wooden cottages & stone farmhouses clustered in tranquil roadside villages
 * - Rustic red/timber barns & golden rolled hay bales across pastures
 * - Split-rail wooden roadside fences & stone creek bridge
 */
export function buildCountrysideProps(spline: RoadSpline, terrain: BuiltTerrain): BuiltLandmarks {
  const group = new THREE.Group();
  group.name = 'CountrysideProps';
  const boxColliders: StaticBoxCollider[] = [];
  const rand = seededRandom(3344);

  const timberWallMat = new THREE.MeshStandardMaterial({ color: 0x473629, roughness: 0.9 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x2c2422, roughness: 0.88 });
  const barnMat = new THREE.MeshStandardMaterial({ color: 0x5c2624, roughness: 0.88 });
  const warmWinMat = new THREE.MeshStandardMaterial({
    color: 0xffe6b8,
    emissive: new THREE.Color(0xffb24c),
    emissiveIntensity: 2.4,
  });

  // 1. Peaceful Wooden Cottages & Farmhouses near the rural highway
  const cottageBodyGeo = new THREE.BoxGeometry(8.5, 4.6, 6.8);
  const cottageRoofGeo = new THREE.ConeGeometry(6.8, 3.2, 4);
  cottageRoofGeo.rotateY(Math.PI / 4);
  const cottageWinGeo = new THREE.BoxGeometry(8.65, 1.35, 1.6);

  const bodies: THREE.Matrix4[] = [];
  const roofs: THREE.Matrix4[] = [];
  const wins: THREE.Matrix4[] = [];
  const dummy = new THREE.Object3D();

  const villageT = [0.06, 0.14, 0.36, 0.44, 0.62, 0.72, 0.84, 0.92];
  for (const t of villageT) {
    const frame = spline.getFrameAt(t);
    const yaw = Math.atan2(frame.tangent.x, frame.tangent.z);

    for (let k = 0; k < 5; k++) {
      const side = k % 2 === 0 ? 1 : -1;
      const along = (k - 2) * 26 + (rand() - 0.5) * 10;
      const lateral = spline.roadHalfWidth + 18 + rand() * 34;

      const px = frame.position.x + frame.tangent.x * along + frame.right.x * lateral * side;
      const pz = frame.position.z + frame.tangent.z * along + frame.right.z * lateral * side;
      const py = terrain.getHeightAt(px, pz);
      if (py < 2.5) continue;

      const check = spline.findClosest(px, pz, 2);
      if (check && check.distance2D < spline.roadHalfWidth + 14) continue;

      const sc = 0.85 + rand() * 0.4;
      const rot = yaw + (rand() - 0.5) * 0.45;

      dummy.position.set(px, py + 2.1 * sc, pz);
      dummy.rotation.set(0, rot, 0);
      dummy.scale.set(sc, sc, sc);
      dummy.updateMatrix();
      bodies.push(dummy.matrix.clone());
      wins.push(dummy.matrix.clone());

      dummy.position.set(px, py + 5.7 * sc, pz);
      dummy.updateMatrix();
      roofs.push(dummy.matrix.clone());
    }
  }

  if (bodies.length > 0) {
    const bMesh = new THREE.InstancedMesh(cottageBodyGeo, timberWallMat, bodies.length);
    const rMesh = new THREE.InstancedMesh(cottageRoofGeo, roofMat, roofs.length);
    const wMesh = new THREE.InstancedMesh(cottageWinGeo, warmWinMat, wins.length);
    for (let i = 0; i < bodies.length; i++) {
      bMesh.setMatrixAt(i, bodies[i]);
      rMesh.setMatrixAt(i, roofs[i]);
      wMesh.setMatrixAt(i, wins[i]);
    }
    bMesh.instanceMatrix.needsUpdate = true;
    rMesh.instanceMatrix.needsUpdate = true;
    wMesh.instanceMatrix.needsUpdate = true;
    group.add(bMesh, rMesh, wMesh);
  }

  // 2. Rustic Wooden Barns & Hay Bales in Open Agricultural Fields
  const hayMat = new THREE.MeshStandardMaterial({ color: 0x8c7344, roughness: 0.95 });
  const hayGeo = new THREE.CylinderGeometry(1.1, 1.1, 1.8, 12);
  hayGeo.rotateZ(Math.PI / 2);
  const hayMatrices: THREE.Matrix4[] = [];

  for (let i = 0; i < 95; i++) {
    const x = (rand() * 2 - 1) * 840;
    const z = (rand() * 2 - 1) * 840;
    const y = terrain.getHeightAt(x, z);
    if (y < 4.5 || y > 26) continue;
    const c = spline.findClosest(x, z, 2);
    if (c && c.distance2D < 22) continue;

    dummy.position.set(x, y + 0.95, z);
    dummy.rotation.set(0, rand() * Math.PI, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    hayMatrices.push(dummy.matrix.clone());
  }

  if (hayMatrices.length > 0) {
    const hays = new THREE.InstancedMesh(hayGeo, hayMat, hayMatrices.length);
    for (let i = 0; i < hayMatrices.length; i++) hays.setMatrixAt(i, hayMatrices[i]);
    hays.instanceMatrix.needsUpdate = true;
    group.add(hays);
  }

  // A few landmark red timber barns in the rolling pastures
  for (const [bx, bz] of [
    [-190, 240],
    [220, -240],
    [-340, -190],
  ]) {
    const by = terrain.getHeightAt(bx, bz);
    const barn = new THREE.Group();
    barn.position.set(bx, by, bz);
    barn.rotation.y = rand() * Math.PI;
    const body = new THREE.Mesh(new THREE.BoxGeometry(12, 6.5, 18), barnMat);
    body.position.y = 3.25;
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 9.2, 4.2, 4), roofMat);
    roof.position.y = 8.4;
    roof.rotation.y = Math.PI / 4;
    roof.scale.set(1.0, 1, 1.45);
    barn.add(body, roof);
    group.add(barn);
  }

  // 3. Rustic Split-Rail Timber Fences along rural roadside embankments
  const fencePostGeo = new THREE.BoxGeometry(0.14, 1.35, 0.14);
  const fenceRailGeo = new THREE.BoxGeometry(0.08, 0.12, 6.5);
  const postMatrices: THREE.Matrix4[] = [];
  const railMatrices: THREE.Matrix4[] = [];

  for (let i = 0; i < spline.samples.length; i += 2) {
    const s = spline.samples[i];
    if (s.zone !== 'highway') continue;
    if (Math.floor(s.distance / 140) % 2 === 1) continue; // Organic fenced meadow stretches

    const yaw = Math.atan2(s.tangent.x, s.tangent.z);
    for (const side of [-1, 1] as const) {
      const offset = spline.roadHalfWidth + 3.6;
      const fx = s.position.x + s.right.x * offset * side;
      const fz = s.position.z + s.right.z * offset * side;
      const fy = terrain.getHeightAt(fx, fz);

      dummy.position.set(fx, fy + 0.65, fz);
      dummy.rotation.set(0, yaw, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      postMatrices.push(dummy.matrix.clone());

      dummy.position.set(fx, fy + 0.95, fz);
      dummy.updateMatrix();
      railMatrices.push(dummy.matrix.clone());
    }
  }

  if (postMatrices.length > 0) {
    const posts = new THREE.InstancedMesh(fencePostGeo, timberWallMat, postMatrices.length);
    const rails = new THREE.InstancedMesh(fenceRailGeo, timberWallMat, railMatrices.length);
    for (let i = 0; i < postMatrices.length; i++) {
      posts.setMatrixAt(i, postMatrices[i]);
      rails.setMatrixAt(i, railMatrices[i]);
    }
    posts.instanceMatrix.needsUpdate = true;
    rails.instanceMatrix.needsUpdate = true;
    group.add(posts, rails);
  }

  // 4. Low Stone Creek Bridge deck substructure
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x4b5159, roughness: 0.9 });
  const deckW = (spline.roadHalfWidth + spline.shoulderWidth) * 2;
  const slabGeo = new THREE.BoxGeometry(deckW + 0.8, 1.5, 10.5);
  for (let i = 0; i < spline.samples.length; i += 3) {
    const s = spline.samples[i];
    if (s.zone !== 'bridge') continue;
    const slab = new THREE.Mesh(slabGeo, stoneMat);
    slab.position.set(s.position.x, s.position.y - 0.78, s.position.z);
    slab.rotation.y = Math.atan2(s.tangent.x, s.tangent.z);
    group.add(slab);
  }

  return { group, boxColliders };
}
