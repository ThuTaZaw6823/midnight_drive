import * as THREE from 'three';
import { RoadSpline } from '../roads/RoadSpline';
import { BuiltTerrain } from '../terrain/TerrainGenerator';
import { seededRandom } from '../utils/MathUtils';

export interface StaticBoxCollider {
  position: THREE.Vector3;
  rotationY: number;
  halfExtents: THREE.Vector3;
}

export interface BuiltLandmarks {
  group: THREE.Group;
  boxColliders: StaticBoxCollider[];
}

/**
 * Builds rich, believable roadside environments along the 5 km Mountain Escape highway:
 * - Cable-stayed suspension lakefront bridge with illuminated twin towers & stay cables
 * - Illuminated vaulted mountain tunnel with stone portals
 * - Peaceful Roadside Rest Area (Midnight Café, Solstice Energy petrol canopy, signage & parking)
 * - Mountain Viewpoint wooden overlook deck with warm bollards
 * - Reflective roadside curve chevron signs & distant lakeside village lights
 */
export function buildRoadsideLandmarks(spline: RoadSpline, terrain: BuiltTerrain): BuiltLandmarks {
  const group = new THREE.Group();
  group.name = 'RoadsideLandmarks';
  const boxColliders: StaticBoxCollider[] = [];

  buildCableStayedBridge(spline, group);
  buildMountainTunnel(spline, group);
  buildRestArea(spline, group, boxColliders);
  buildMountainViewpoint(spline, group);
  buildRoadsideSigns(spline, group);
  buildDistantLakesideVillage(terrain, spline, group);

  return { group, boxColliders };
}

function createSignTexture(
  bg: string,
  border: string,
  lines: Array<{ text: string; size: number; color: string; weight?: string }>,
  width = 512,
  height = 256
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = border;
  ctx.lineWidth = 10;
  ctx.strokeRect(10, 10, width - 20, height - 20);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const step = height / (lines.length + 1);
  lines.forEach((line, i) => {
    ctx.fillStyle = line.color;
    ctx.font = `${line.weight ?? '700'} ${line.size}px system-ui, -apple-system, sans-serif`;
    ctx.fillText(line.text, width / 2, step * (i + 1));
  });

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildCableStayedBridge(spline: RoadSpline, parent: THREE.Group): void {
  const bridgeGroup = new THREE.Group();
  bridgeGroup.name = 'LakefrontCableBridge';

  const concreteMat = new THREE.MeshStandardMaterial({
    color: 0x3f4957,
    roughness: 0.82,
    metalness: 0.14,
  });

  const steelMat = new THREE.MeshStandardMaterial({
    color: 0x2a3545,
    roughness: 0.48,
    metalness: 0.72,
  });

  const cableMat = new THREE.MeshStandardMaterial({
    color: 0x8ea3bd,
    emissive: new THREE.Color(0x3a4d66),
    emissiveIntensity: 0.55,
    roughness: 0.3,
    metalness: 0.85,
  });

  const towerLightMat = new THREE.MeshStandardMaterial({
    color: 0xffd28a,
    emissive: new THREE.Color(0xffaa44),
    emissiveIntensity: 2.6,
  });

  const bridgeSamples = spline.samples.filter((s) => s.zone === 'bridge');
  if (bridgeSamples.length < 10) return;

  const deckW = (spline.roadHalfWidth + spline.shoulderWidth) * 2;
  const girderGeo = new THREE.BoxGeometry(deckW + 0.8, 1.4, 11.2);
  const pierGeo = new THREE.CylinderGeometry(1.0, 1.4, 24, 10);
  const railBeamGeo = new THREE.BoxGeometry(0.28, 1.15, 11.2);

  for (let i = 0; i < bridgeSamples.length; i += 3) {
    const s = bridgeSamples[i];
    const yaw = Math.atan2(s.tangent.x, s.tangent.z);

    const slab = new THREE.Mesh(girderGeo, concreteMat);
    slab.position.set(s.position.x, s.position.y - 0.74, s.position.z);
    slab.rotation.y = yaw;
    slab.receiveShadow = true;
    bridgeGroup.add(slab);

    for (const side of [-1, 1] as const) {
      const sideOffset = spline.roadHalfWidth + 1.55;
      const rail = new THREE.Mesh(railBeamGeo, steelMat);
      rail.position.set(
        s.position.x + s.right.x * sideOffset * side,
        s.position.y + 0.55,
        s.position.z + s.right.z * sideOffset * side
      );
      rail.rotation.y = yaw;
      bridgeGroup.add(rail);
    }

    if (i % 12 === 0) {
      for (const side of [-1, 1] as const) {
        const pier = new THREE.Mesh(pierGeo, concreteMat);
        pier.position.set(
          s.position.x + s.right.x * 4.2 * side,
          s.position.y - 12.6,
          s.position.z + s.right.z * 4.2 * side
        );
        bridgeGroup.add(pier);
      }
    }
  }

  // Two monumental cable-stayed A-frame pylons spanning the main cove channel
  const pylonIndices = [
    Math.floor(bridgeSamples.length * 0.34),
    Math.floor(bridgeSamples.length * 0.66),
  ];

  const deckEdgeOffset = spline.roadHalfWidth + 1.85;
  const towerHeight = 36;

  for (const pIdx of pylonIndices) {
    const ps = bridgeSamples[pIdx];
    const yaw = Math.atan2(ps.tangent.x, ps.tangent.z);
    const tower = new THREE.Group();
    tower.position.copy(ps.position);
    tower.rotation.y = yaw;

    // Twin inclined concrete legs converging toward the peak
    for (const side of [-1, 1] as const) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(1.25, towerHeight + 14, 1.55), concreteMat);
      leg.position.set(side * (deckEdgeOffset - 0.8), (towerHeight - 10) * 0.5, 0);
      leg.rotation.z = side * 0.14;
      tower.add(leg);
    }

    // Upper cross-beam & amber aviation beacon
    const crossTop = new THREE.Mesh(new THREE.BoxGeometry(deckEdgeOffset * 1.1, 1.35, 1.5), concreteMat);
    crossTop.position.set(0, towerHeight - 6, 0);
    tower.add(crossTop);

    const beacon = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.45, 1.1), towerLightMat);
    beacon.position.set(0, towerHeight + 1.8, 0);
    tower.add(beacon);

    bridgeGroup.add(tower);

    // Fan of diagonal stay cables anchored down to the bridge deck edges
    const cableTopLeft = ps.position
      .clone()
      .addScaledVector(ps.right, -1.6)
      .add(new THREE.Vector3(0, towerHeight - 2.5, 0));
    const cableTopRight = ps.position
      .clone()
      .addScaledVector(ps.right, 1.6)
      .add(new THREE.Vector3(0, towerHeight - 2.5, 0));

    for (const offsetSteps of [-28, -21, -14, -7, 7, 14, 21, 28]) {
      const anchorIdx = pIdx + offsetSteps;
      if (anchorIdx < 2 || anchorIdx >= bridgeSamples.length - 2) continue;
      const anchorSample = bridgeSamples[anchorIdx];

      for (const side of [-1, 1] as const) {
        const start = side === -1 ? cableTopLeft : cableTopRight;
        const end = anchorSample.position
          .clone()
          .addScaledVector(anchorSample.right, side * deckEdgeOffset)
          .add(new THREE.Vector3(0, 0.7, 0));

        const dir = new THREE.Vector3().subVectors(end, start);
        const len = dir.length();
        const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, len, 5), cableMat);
        cable.position.copy(start).addScaledVector(dir, 0.5);
        cable.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
        bridgeGroup.add(cable);
      }
    }
  }

  parent.add(bridgeGroup);
}

function buildMountainTunnel(spline: RoadSpline, parent: THREE.Group): void {
  const tunnelGroup = new THREE.Group();
  tunnelGroup.name = 'MountainTunnel';

  const tunnelSamples = spline.samples.filter((s) => s.zone === 'tunnel');
  if (tunnelSamples.length < 4) return;

  const archRadius = spline.roadHalfWidth + 2.5;
  const archSegments = 16;
  const positions: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i < tunnelSamples.length; i++) {
    const s = tunnelSamples[i];
    for (let j = 0; j <= archSegments; j++) {
      const theta = (j / archSegments) * Math.PI;
      const localRight = Math.cos(theta) * archRadius;
      const localUp = Math.sin(theta) * (archRadius * 0.9) + 0.35;

      positions.push(
        s.position.x + s.right.x * localRight,
        s.position.y + localUp,
        s.position.z + s.right.z * localRight
      );
    }

    if (i < tunnelSamples.length - 1) {
      const ringSize = archSegments + 1;
      for (let j = 0; j < archSegments; j++) {
        const a = i * ringSize + j;
        const b = a + 1;
        const c = (i + 1) * ringSize + j;
        const d = c + 1;
        indices.push(a, b, c, b, d, c);
      }
    }
  }

  const tunnelGeo = new THREE.BufferGeometry();
  tunnelGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  tunnelGeo.setIndex(indices);
  tunnelGeo.computeVertexNormals();

  const tunnelMat = new THREE.MeshStandardMaterial({
    color: 0x2c323c,
    roughness: 0.88,
    metalness: 0.12,
    side: THREE.DoubleSide,
  });

  const vault = new THREE.Mesh(tunnelGeo, tunnelMat);
  vault.receiveShadow = true;
  tunnelGroup.add(vault);

  const portalMat = new THREE.MeshStandardMaterial({ color: 0x3b434f, roughness: 0.84 });
  const beaconMat = new THREE.MeshStandardMaterial({
    color: 0xffd080,
    emissive: new THREE.Color(0xff9a2e),
    emissiveIntensity: 2.5,
  });

  for (const portalSample of [tunnelSamples[0], tunnelSamples[tunnelSamples.length - 1]]) {
    const yaw = Math.atan2(portalSample.tangent.x, portalSample.tangent.z);
    const portal = new THREE.Group();
    portal.position.copy(portalSample.position);
    portal.rotation.y = yaw;

    const lintel = new THREE.Mesh(new THREE.BoxGeometry(archRadius * 2 + 4.4, 2.8, 2.4), portalMat);
    lintel.position.set(0, archRadius * 0.9 + 1.2, 0);
    portal.add(lintel);

    for (const side of [-1, 1] as const) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(2.5, archRadius + 1.8, 2.5), portalMat);
      pillar.position.set(side * (archRadius + 0.9), (archRadius + 1.8) * 0.5, 0);
      portal.add(pillar);

      const beacon = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 0.3), beaconMat);
      beacon.position.set(side * (archRadius - 0.5), archRadius * 0.85, 1.25);
      portal.add(beacon);
    }

    tunnelGroup.add(portal);
  }

  parent.add(tunnelGroup);
}

function buildRestArea(spline: RoadSpline, parent: THREE.Group, colliders: StaticBoxCollider[]): void {
  const restCenter = spline.getFrameAt(0.865);
  const yaw = Math.atan2(restCenter.tangent.x, restCenter.tangent.z);

  const restGroup = new THREE.Group();
  restGroup.name = 'RoadsideRestArea';
  const anchorPos = restCenter.position
    .clone()
    .addScaledVector(restCenter.right, spline.roadHalfWidth + 15.5);
  restGroup.position.copy(anchorPos);
  restGroup.rotation.y = yaw;

  // Paved wet-sheen parking apron with painted parking bay lines
  const apronMat = new THREE.MeshStandardMaterial({ color: 0x202733, roughness: 0.55, metalness: 0.14 });
  const apron = new THREE.Mesh(new THREE.BoxGeometry(24, 0.2, 78), apronMat);
  apron.position.set(-4.2, -0.06, 0);
  apron.receiveShadow = true;
  restGroup.add(apron);

  const bayLineMat = new THREE.MeshBasicMaterial({ color: 0xcbd8eb, transparent: true, opacity: 0.65 });
  for (let bz = -24; bz <= -4; bz += 4.2) {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 0.12), bayLineMat);
    line.rotation.x = -Math.PI / 2;
    line.position.set(-5.2, 0.06, bz);
    restGroup.add(line);
  }

  // 1. Cozy Illuminated Midnight Roadside Café
  const timberMat = new THREE.MeshStandardMaterial({ color: 0x332720, roughness: 0.85 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x1e2531, roughness: 0.62, metalness: 0.25 });
  const warmWindowMat = new THREE.MeshStandardMaterial({
    color: 0xffe4b8,
    emissive: new THREE.Color(0xffaa4c),
    emissiveIntensity: 2.1,
    roughness: 0.15,
  });

  const cafe = new THREE.Group();
  cafe.position.set(3.8, 0, -15);

  const cafeBody = new THREE.Mesh(new THREE.BoxGeometry(10.0, 4.6, 16.0), timberMat);
  cafeBody.position.y = 2.3;
  cafeBody.castShadow = true;
  cafeBody.receiveShadow = true;
  cafe.add(cafeBody);

  const cafeRoof = new THREE.Mesh(new THREE.BoxGeometry(13.0, 0.55, 18.2), roofMat);
  cafeRoof.position.set(-1.1, 4.85, 0);
  cafe.add(cafeRoof);

  // Porch pillars supporting the café overhang
  const postMat = new THREE.MeshStandardMaterial({ color: 0x27201c, roughness: 0.8 });
  for (const pz of [-6.8, -2.2, 2.2, 6.8]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.24, 4.6, 0.24), postMat);
    post.position.set(-6.6, 2.3, pz);
    cafe.add(post);
  }

  // Warm café panoramic windows + entrance glass door
  for (const wz of [-5.2, -1.8, 5.2]) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.0, 2.5), warmWindowMat);
    win.position.set(-5.04, 2.25, wz);
    cafe.add(win);
  }
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.5, 1.5), warmWindowMat);
  door.position.set(-5.04, 1.35, 1.8);
  cafe.add(door);

  // Illuminated "MIDNIGHT CAFÉ" fascia sign
  const cafeSignTex = createSignTexture('#121a28', '#ffba66', [
    { text: 'MIDNIGHT CAFÉ', size: 54, color: '#ffe5bd' },
    { text: 'OPEN 24 HOURS · COFFEE & REST', size: 22, color: '#ffba66', weight: '600' },
  ]);
  const cafeSign = new THREE.Mesh(
    new THREE.PlaneGeometry(6.8, 1.5),
    new THREE.MeshBasicMaterial({ map: cafeSignTex })
  );
  cafeSign.position.set(-7.62, 4.85, 0);
  cafeSign.rotation.y = -Math.PI / 2;
  cafe.add(cafeSign);

  const cafeLight = new THREE.PointLight(0xffb86b, 32, 34, 1.5);
  cafeLight.position.set(-7.2, 4.1, 0);
  cafe.add(cafeLight);

  restGroup.add(cafe);

  const cafeWorldPos = cafe.position.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).add(anchorPos);
  colliders.push({
    position: cafeWorldPos.clone().add(new THREE.Vector3(0, 2.3, 0)),
    rotationY: yaw,
    halfExtents: new THREE.Vector3(5.2, 2.3, 8.2),
  });

  // 2. Solstice Energy Petrol Station Canopy (inspired by Oriseus Rest Area concept art!)
  const canopyGroup = new THREE.Group();
  canopyGroup.position.set(1.2, 0, 16);

  const canopyRoofMat = new THREE.MeshStandardMaterial({ color: 0x1d2534, roughness: 0.42, metalness: 0.48 });
  const canopyTrimMat = new THREE.MeshStandardMaterial({
    color: 0x72c8ff,
    emissive: new THREE.Color(0x4ea8f5),
    emissiveIntensity: 2.0,
  });

  const canopyTop = new THREE.Mesh(new THREE.BoxGeometry(11.6, 0.9, 18.0), canopyRoofMat);
  canopyTop.position.y = 5.6;
  canopyGroup.add(canopyTop);

  const canopyTrim = new THREE.Mesh(new THREE.BoxGeometry(11.8, 0.2, 18.2), canopyTrimMat);
  canopyTrim.position.y = 5.2;
  canopyGroup.add(canopyTrim);

  // Illuminated canopy fascia branding
  const fuelSignTex = createSignTexture('#101929', '#5cb6ff', [
    { text: 'SOLSTICE ENERGY', size: 50, color: '#dff2ff' },
  ]);
  const fuelFascia = new THREE.Mesh(
    new THREE.PlaneGeometry(8.4, 1.0),
    new THREE.MeshBasicMaterial({ map: fuelSignTex })
  );
  fuelFascia.position.set(-5.85, 5.65, 0);
  fuelFascia.rotation.y = -Math.PI / 2;
  canopyGroup.add(fuelFascia);

  // Recessed warm-white ceiling downlight panels under canopy
  const downlightMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: new THREE.Color(0xe6f2ff),
    emissiveIntensity: 2.6,
  });
  for (const lx of [-2.8, 2.8]) {
    for (const lz of [-5.2, 0, 5.2]) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.9), downlightMat);
      lamp.position.set(lx, 5.12, lz);
      canopyGroup.add(lamp);
    }
  }

  // Pillars & detailed fuel dispensers
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0xd0d9e6, roughness: 0.38, metalness: 0.35 });
  for (const pz of [-6.2, 6.2]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.62, 5.3, 0.62), pillarMat);
    p.position.set(0, 2.65, pz);
    canopyGroup.add(p);
  }

  const pumpMat = new THREE.MeshStandardMaterial({ color: 0x223044, roughness: 0.42, metalness: 0.45 });
  const pumpScreenMat = new THREE.MeshStandardMaterial({
    color: 0x8ad4ff,
    emissive: new THREE.Color(0x4ea8f5),
    emissiveIntensity: 1.8,
  });
  for (const pz of [-3.0, 0, 3.0]) {
    const pump = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.75, 1.25), pumpMat);
    pump.position.set(0, 0.92, pz);
    canopyGroup.add(pump);

    const screen = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.42, 0.72), pumpScreenMat);
    screen.position.set(0, 1.32, pz);
    canopyGroup.add(screen);
  }

  const canopyLight = new THREE.PointLight(0xdceeff, 42, 38, 1.45);
  canopyLight.position.set(0, 4.9, 0);
  canopyGroup.add(canopyLight);

  restGroup.add(canopyGroup);

  const pumpIslandWorld = new THREE.Vector3(1.2, 1.4, 16)
    .applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw)
    .add(anchorPos);
  colliders.push({
    position: pumpIslandWorld,
    rotationY: yaw,
    halfExtents: new THREE.Vector3(0.85, 2.6, 6.8),
  });

  // 3. Illuminated Highway Approach Rest Area Sign & Blue "P" Parking Sign
  const welcomeTex = createSignTexture('#0e2238', '#68b8ff', [
    { text: 'WELCOME TO', size: 32, color: '#9ed2ff', weight: '500' },
    { text: 'MIDNIGHT REST AREA', size: 42, color: '#eef7ff' },
    { text: 'CAFÉ · FUEL · SCENIC PARKING', size: 22, color: '#ffba66', weight: '600' },
  ]);
  const welcomeSign = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 2.4, 4.8),
    [
      new THREE.MeshStandardMaterial({ color: 0x1a2636 }),
      new THREE.MeshBasicMaterial({ map: welcomeTex }),
      new THREE.MeshStandardMaterial({ color: 0x1a2636 }),
      new THREE.MeshStandardMaterial({ color: 0x1a2636 }),
      new THREE.MeshStandardMaterial({ color: 0x1a2636 }),
      new THREE.MeshStandardMaterial({ color: 0x1a2636 }),
    ]
  );
  welcomeSign.position.set(-12.5, 2.4, -36);
  welcomeSign.rotation.y = 0.55;
  restGroup.add(welcomeSign);

  const pSignTex = createSignTexture('#1557a8', '#ffffff', [{ text: 'P', size: 150, color: '#ffffff' }], 256, 256);
  const pPost = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.6, 8), pillarMat);
  pPost.position.set(-10.8, 1.8, -28);
  restGroup.add(pPost);
  const pBoard = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 1.15, 1.15),
    new THREE.MeshBasicMaterial({ map: pSignTex })
  );
  pBoard.position.set(-10.8, 3.5, -28);
  pBoard.rotation.y = Math.PI / 2;
  restGroup.add(pBoard);

  parent.add(restGroup);
}

/**
 * Peaceful lakeside mountain viewpoint pullout with timber deck & warm low bollards.
 */
function buildMountainViewpoint(spline: RoadSpline, parent: THREE.Group): void {
  const frame = spline.getFrameAt(0.502);
  const yaw = Math.atan2(frame.tangent.x, frame.tangent.z);

  const vp = new THREE.Group();
  vp.name = 'MountainViewpoint';
  vp.position
    .copy(frame.position)
    .addScaledVector(frame.right, spline.roadHalfWidth + 10.5);
  vp.rotation.y = yaw;

  const woodMat = new THREE.MeshStandardMaterial({ color: 0x3b2d23, roughness: 0.88 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(6.5, 0.35, 24), woodMat);
  deck.position.set(1.2, 0.05, 0);
  deck.receiveShadow = true;
  vp.add(deck);

  // Wooden viewing railing & warm glowing path bollards
  const bollardLampMat = new THREE.MeshStandardMaterial({
    color: 0xffe2b0,
    emissive: new THREE.Color(0xffaa44),
    emissiveIntensity: 2.2,
  });

  for (let bz = -10; bz <= 10; bz += 5) {
    const bollard = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 1.0, 8), woodMat);
    bollard.position.set(3.9, 0.65, bz);
    vp.add(bollard);

    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.10, 0.16, 8), bollardLampMat);
    lamp.position.set(3.9, 1.08, bz);
    vp.add(lamp);
  }

  const vpLight = new THREE.PointLight(0xffb662, 18, 22, 1.6);
  vpLight.position.set(2.5, 2.2, 0);
  vp.add(vpLight);

  parent.add(vp);
}

/**
 * Adds reflective curve chevron signs on sharper mountain bends and scenic highway signs.
 */
function buildRoadsideSigns(spline: RoadSpline, parent: THREE.Group): void {
  const postMat = new THREE.MeshStandardMaterial({ color: 0x525d6e, roughness: 0.6, metalness: 0.5 });

  // Scenic overlook highway sign near start
  const startFrame = spline.getFrameAt(0.015);
  const startSignTex = createSignTexture('#132a42', '#d7e6fa', [
    { text: 'MOUNTAIN ESCAPE', size: 42, color: '#eef6ff' },
    { text: 'ALPINE LAKE LOOP · 5 KM', size: 24, color: '#ffba66', weight: '600' },
  ]);
  const signGroup = new THREE.Group();
  signGroup.position
    .copy(startFrame.position)
    .addScaledVector(startFrame.right, spline.roadHalfWidth + 3.2);
  signGroup.rotation.y = Math.atan2(startFrame.tangent.x, startFrame.tangent.z) + Math.PI;

  for (const x of [-1.2, 1.2]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.2, 6), postMat);
    post.position.set(x, 1.6, 0);
    signGroup.add(post);
  }
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(3.4, 1.35, 0.12),
    new THREE.MeshBasicMaterial({ map: startSignTex })
  );
  board.position.set(0, 2.75, 0);
  signGroup.add(board);
  parent.add(signGroup);

  // Reflective amber curve chevrons on outer edge of curved mountain highway sections
  const chevTex = createSignTexture('#14171c', '#ffba44', [{ text: '❯', size: 150, color: '#ffba44' }], 128, 160);
  const chevMat = new THREE.MeshBasicMaterial({ map: chevTex });
  const chevGeo = new THREE.BoxGeometry(0.75, 0.95, 0.08);
  const postGeo = new THREE.CylinderGeometry(0.045, 0.045, 1.9, 6);

  let lastChevDist = -100;
  for (let i = 0; i < spline.samples.length; i += 6) {
    const s = spline.samples[i];
    if (s.zone !== 'highway') continue;
    if (Math.abs(s.signedCurvature) < 0.0022) continue;
    if (s.distance - lastChevDist < 34) continue;
    lastChevDist = s.distance;

    // Place chevron on the OUTER edge of the curve
    const outerSide = s.signedCurvature > 0 ? -1 : 1;
    const offset = spline.roadHalfWidth + 1.9;
    const yaw = Math.atan2(s.tangent.x, s.tangent.z);

    const g = new THREE.Group();
    g.position.set(
      s.position.x + s.right.x * offset * outerSide,
      s.position.y,
      s.position.z + s.right.z * offset * outerSide
    );
    g.rotation.y = yaw + Math.PI - outerSide * 0.25;

    const p = new THREE.Mesh(postGeo, postMat);
    p.position.y = 0.95;
    const b = new THREE.Mesh(chevGeo, chevMat);
    b.position.y = 1.65;
    if (outerSide === 1) b.scale.x = -1;
    g.add(p, b);
    parent.add(g);
  }
}

function buildDistantLakesideVillage(terrain: BuiltTerrain, spline: RoadSpline, parent: THREE.Group): void {
  const villageGroup = new THREE.Group();
  villageGroup.name = 'DistantLakesideVillage';

  const rand = seededRandom(8842);
  const houseMat = new THREE.MeshStandardMaterial({ color: 0x1d2532, roughness: 0.88 });
  const windowMat = new THREE.MeshStandardMaterial({
    color: 0xffe0a3,
    emissive: new THREE.Color(0xffaa47),
    emissiveIntensity: 2.6,
  });

  const houseGeo = new THREE.BoxGeometry(8, 5, 7);
  const winGeo = new THREE.BoxGeometry(8.2, 1.3, 2.2);

  const clusterCenters: Array<[number, number]> = [
    [-260, -455],
    [120, -470],
    [-475, -180],
    [280, -340],
  ];

  const houseMatrices: THREE.Matrix4[] = [];
  const winMatrices: THREE.Matrix4[] = [];
  const dummy = new THREE.Object3D();

  for (const [cx, cz] of clusterCenters) {
    for (let i = 0; i < 18; i++) {
      const x = cx + (rand() - 0.5) * 175;
      const z = cz + (rand() - 0.5) * 135;
      const y = terrain.getHeightAt(x, z);
      if (y < 2.0 || y > 34) continue;

      const closest = spline.findClosest(x, z, 2);
      if (closest && closest.distance2D < 26) continue;

      const sx = 0.75 + rand() * 0.95;
      const sy = 0.75 + rand() * 1.1;
      const sz = 0.75 + rand() * 0.9;
      const rot = rand() * Math.PI * 2;

      dummy.position.set(x, y + 2.2 * sy, z);
      dummy.rotation.set(0, rot, 0);
      dummy.scale.set(sx, sy, sz);
      dummy.updateMatrix();
      houseMatrices.push(dummy.matrix.clone());

      dummy.position.set(x, y + 2.4 * sy, z);
      dummy.scale.set(sx, sy * 0.85, sz);
      dummy.updateMatrix();
      winMatrices.push(dummy.matrix.clone());
    }
  }

  if (houseMatrices.length === 0) return;

  const houses = new THREE.InstancedMesh(houseGeo, houseMat, houseMatrices.length);
  const windows = new THREE.InstancedMesh(winGeo, windowMat, winMatrices.length);
  for (let i = 0; i < houseMatrices.length; i++) {
    houses.setMatrixAt(i, houseMatrices[i]);
    windows.setMatrixAt(i, winMatrices[i]);
  }
  houses.instanceMatrix.needsUpdate = true;
  windows.instanceMatrix.needsUpdate = true;

  villageGroup.add(houses, windows);
  parent.add(villageGroup);
}
