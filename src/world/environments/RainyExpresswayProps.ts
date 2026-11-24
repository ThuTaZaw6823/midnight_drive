import * as THREE from 'three';
import { RoadSpline } from '../../roads/RoadSpline';
import { BuiltLandmarks, StaticBoxCollider } from '../RoadsideProps';

function makeHighwaySignTexture(top: string, main: string, sub: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#0d4a34';
  ctx.fillRect(0, 0, 768, 256);

  ctx.strokeStyle = '#e8f4ee';
  ctx.lineWidth = 10;
  ctx.strokeRect(12, 12, 744, 232);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#a7e8cb';
  ctx.font = '600 32px system-ui, sans-serif';
  ctx.fillText(top, 384, 66);

  ctx.fillStyle = '#ffffff';
  ctx.font = '700 56px system-ui, sans-serif';
  ctx.fillText(main, 384, 144);

  ctx.fillStyle = '#ffd080';
  ctx.font = '600 30px system-ui, sans-serif';
  ctx.fillText(sub, 384, 208);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Builds the Rainy Expressway environment landmarks:
 * - Overhead illuminated green highway gantry signs spanning all 4 lanes
 * - Illuminated roadside expressway petrol service plaza
 * - Modern reflective highway mileage & barrier markers
 */
export function buildRainyExpresswayProps(spline: RoadSpline): BuiltLandmarks {
  const group = new THREE.Group();
  group.name = 'RainyExpresswayProps';
  const boxColliders: StaticBoxCollider[] = [];

  const steelMat = new THREE.MeshStandardMaterial({ color: 0x3b4657, roughness: 0.48, metalness: 0.72 });
  const lampStripMat = new THREE.MeshStandardMaterial({
    color: 0xdff2ff,
    emissive: new THREE.Color(0xa6dcff),
    emissiveIntensity: 2.2,
  });

  const gantrySpecs = [
    { t: 0.14, top: 'EXPRESSWAY 04 · NORTHBOUND', main: 'BAYSIDE CORRIDOR', sub: 'ALL LANES OPEN · DRIVE SAFELY' },
    { t: 0.42, top: 'NEXT SERVICE PLAZA · 2.4 KM', main: 'SOLSTICE EXPRESS', sub: 'FUEL · COFFEE · SHELTERED PARKING' },
    { t: 0.72, top: 'APPROACHING SERVICE EXIT', main: 'MIDNIGHT PLAZA →', sub: 'KEEP RIGHT FOR REST STOP' },
    { t: 0.94, top: 'EXPRESSWAY LOOP', main: 'COASTAL JUNCTION', sub: 'CONTINUOUS CRUISE · 5.6 KM' },
  ];

  const spanW = spline.roadHalfWidth * 2 + 4.4;

  for (const spec of gantrySpecs) {
    const frame = spline.getFrameAt(spec.t);
    const yaw = Math.atan2(frame.tangent.x, frame.tangent.z);

    const gantry = new THREE.Group();
    gantry.position.copy(frame.position);
    gantry.rotation.y = yaw;

    for (const side of [-1, 1] as const) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.45, 9.2, 0.45), steelMat);
      leg.position.set(side * (spanW * 0.5), 4.6, 0);
      gantry.add(leg);
    }

    const truss = new THREE.Mesh(new THREE.BoxGeometry(spanW + 0.5, 0.55, 0.55), steelMat);
    truss.position.set(0, 8.8, 0);
    gantry.add(truss);

    const signTex = makeHighwaySignTexture(spec.top, spec.main, spec.sub);
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(9.6, 3.1, 0.16),
      [
        steelMat,
        steelMat,
        steelMat,
        steelMat,
        steelMat,
        new THREE.MeshBasicMaterial({ map: signTex }),
      ]
    );
    board.position.set(0, 7.9, 0.28);
    gantry.add(board);

    const signLamp = new THREE.Mesh(new THREE.BoxGeometry(8.8, 0.12, 0.16), lampStripMat);
    signLamp.position.set(0, 9.55, -0.5);
    gantry.add(signLamp);

    group.add(gantry);
  }

  // Illuminated Expressway Service Plaza / Petrol Canopy at the Rest Area
  const restFrame = spline.getFrameAt(0.84);
  const restYaw = Math.atan2(restFrame.tangent.x, restFrame.tangent.z);
  const anchorPos = restFrame.position
    .clone()
    .addScaledVector(restFrame.right, spline.roadHalfWidth + 16.5);

  const plaza = new THREE.Group();
  plaza.position.copy(anchorPos);
  plaza.rotation.y = restYaw;

  const apron = new THREE.Mesh(
    new THREE.BoxGeometry(24, 0.2, 74),
    new THREE.MeshStandardMaterial({ color: 0x1b222d, roughness: 0.35, metalness: 0.22 })
  );
  apron.position.set(-4.5, -0.06, 0);
  plaza.add(apron);

  const canopyRoof = new THREE.Mesh(
    new THREE.BoxGeometry(12.5, 0.9, 26),
    new THREE.MeshStandardMaterial({ color: 0x1c2635, roughness: 0.4, metalness: 0.5 })
  );
  canopyRoof.position.set(0, 5.8, 0);
  plaza.add(canopyRoof);

  const neonTrim = new THREE.Mesh(
    new THREE.BoxGeometry(12.7, 0.22, 26.2),
    new THREE.MeshStandardMaterial({
      color: 0x4de2ff,
      emissive: new THREE.Color(0x28c8ff),
      emissiveIntensity: 2.4,
    })
  );
  neonTrim.position.set(0, 5.35, 0);
  plaza.add(neonTrim);

  const pillarMat = new THREE.MeshStandardMaterial({ color: 0xd0dce8, roughness: 0.4 });
  for (const pz of [-9, 0, 9]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.65, 5.4, 0.65), pillarMat);
    p.position.set(0, 2.7, pz);
    plaza.add(p);
  }

  const plazaLight = new THREE.PointLight(0xd6f0ff, 50, 44, 1.4);
  plazaLight.position.set(0, 5.0, 0);
  plaza.add(plazaLight);

  group.add(plaza);

  boxColliders.push({
    position: anchorPos.clone().add(new THREE.Vector3(0, 2.6, 0)),
    rotationY: restYaw,
    halfExtents: new THREE.Vector3(0.9, 2.6, 10.0),
  });

  return { group, boxColliders };
}
