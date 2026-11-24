import * as THREE from 'three';
import { RoadSpline } from './RoadSpline';
import { createRoadTextures } from '../core/ProceduralTextures';
import { getEnvironmentById } from '../world/EnvironmentConfig';
import { clamp } from '../utils/MathUtils';

export interface BuiltRoad {
  group: THREE.Group;
  roadMesh: THREE.Mesh;
  roadMaterial: THREE.MeshPhysicalMaterial;
  colliderVertices: Float32Array;
  colliderIndices: Uint32Array;
}

/**
 * Generates the continuous 8.2m two-lane mountain highway ribbon with subtle curve banking,
 * widened shoulders at scenic overlooks/viewpoints/rest areas, physically plausible wet-asphalt
 * clearcoat material, and 1:1 matching physics trimesh collider data.
 */
export function buildRoadMesh(spline: RoadSpline): BuiltRoad {
  const group = new THREE.Group();
  group.name = 'MountainRoad';

  const samples = spline.samples;
  const N = samples.length;
  const halfW = spline.roadHalfWidth;
  const shoulder = spline.shoulderWidth;

  const roadPositions: number[] = [];
  const roadNormals: number[] = [];
  const roadUvs: number[] = [];
  const roadIndices: number[] = [];

  const shoulderPositions: number[] = [];
  const shoulderNormals: number[] = [];
  const shoulderIndices: number[] = [];

  const colPositions: number[] = [];
  const colIndices: number[] = [];

  const uvRepeatMeters = 16;

  for (let i = 0; i <= N; i++) {
    const s = samples[i % N];
    const dist = i === N ? spline.totalLength : s.distance;
    const vCoord = dist / uvRepeatMeters;

    const p = s.position;
    const r = s.right;
    const u = s.up;

    // Gentle superelevation banking on sweeping highway curves (max ~2.4 degrees, flat on bridge/rest-area/tunnel)
    const allowBank = s.zone === 'highway';
    const bankAngle = allowBank ? clamp(s.signedCurvature * 14.0, -0.042, 0.042) : 0;
    const bankDrop = Math.sin(bankAngle) * halfW;

    const yRoad = p.y + 0.04;
    const yLeft = yRoad + bankDrop;
    const yRight = yRoad - bankDrop;

    const lx = p.x - r.x * halfW;
    const lz = p.z - r.z * halfW;
    const rx = p.x + r.x * halfW;
    const rz = p.z + r.z * halfW;

    roadPositions.push(lx, yLeft, lz, rx, yRight, rz);

    // Tilt surface normal subtly with bank angle
    const bankNormal = u.clone().addScaledVector(r, Math.sin(bankAngle)).normalize();
    roadNormals.push(
      bankNormal.x, bankNormal.y, bankNormal.z,
      bankNormal.x, bankNormal.y, bankNormal.z
    );
    roadUvs.push(0, vCoord, 1, vCoord);

    // Widen outer shoulders at Rest Area, Scenic Overlook, and Mountain Viewpoint
    const extraRight =
      s.zone === 'rest-area'
        ? 12.0
        : s.zone === 'viewpoint'
        ? 6.5
        : s.zone === 'overlook'
        ? 5.0
        : 0.0;

    const leftEdge = halfW + shoulder;
    const rightEdge = halfW + shoulder + extraRight;
    const dropY = s.zone === 'bridge' ? 0.02 : -0.18;

    shoulderPositions.push(
      lx, yLeft - 0.01, lz,
      p.x - r.x * leftEdge, p.y + dropY + bankDrop * 0.6, p.z - r.z * leftEdge,
      rx, yRight - 0.01, rz,
      p.x + r.x * rightEdge, p.y + dropY - bankDrop * 0.6, p.z + r.z * rightEdge
    );
    shoulderNormals.push(
      bankNormal.x, bankNormal.y, bankNormal.z,
      bankNormal.x, bankNormal.y, bankNormal.z,
      bankNormal.x, bankNormal.y, bankNormal.z,
      bankNormal.x, bankNormal.y, bankNormal.z
    );

    // Smooth 4-point cross-section for Rapier physics trimesh (exact match to visual road + bank!)
    const colOuterLeftY = s.zone === 'bridge' ? yLeft : yLeft - 0.1;
    const colOuterRightY = s.zone === 'bridge' ? yRight : yRight - 0.1;
    colPositions.push(
      p.x - r.x * leftEdge, colOuterLeftY, p.z - r.z * leftEdge,
      lx, yLeft, lz,
      rx, yRight, rz,
      p.x + r.x * rightEdge, colOuterRightY, p.z + r.z * rightEdge
    );

    if (i < N) {
      const a = i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      roadIndices.push(a, c, b, b, c, d);

      const sa = i * 4;
      shoulderIndices.push(sa + 1, sa + 5, sa + 0, sa + 0, sa + 5, sa + 4);
      shoulderIndices.push(sa + 2, sa + 6, sa + 3, sa + 3, sa + 6, sa + 7);

      const ca = i * 4;
      for (let q = 0; q < 3; q++) {
        const p0 = ca + q;
        const p1 = ca + q + 1;
        const p2 = ca + 4 + q;
        const p3 = ca + 4 + q + 1;
        colIndices.push(p0, p2, p1, p1, p2, p3);
      }
    }
  }

  const roadGeo = new THREE.BufferGeometry();
  roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(roadPositions, 3));
  roadGeo.setAttribute('normal', new THREE.Float32BufferAttribute(roadNormals, 3));
  roadGeo.setAttribute('uv', new THREE.Float32BufferAttribute(roadUvs, 2));
  roadGeo.setIndex(roadIndices);

  const envDesc = getEnvironmentById(spline.envId);
  const textures = createRoadTextures(envDesc.roadStyle);
  const roadMaterial = new THREE.MeshPhysicalMaterial({
    map: textures.map,
    roughnessMap: textures.roughnessMap,
    bumpMap: textures.bumpMap,
    bumpScale: 0.028,
    roughness: 0.64,
    metalness: 0.12,
    clearcoat: 0.18,
    clearcoatRoughness: 0.42,
    clearcoatRoughnessMap: textures.roughnessMap,
  });

  const roadMesh = new THREE.Mesh(roadGeo, roadMaterial);
  roadMesh.receiveShadow = true;
  roadMesh.name = 'AsphaltRibbon';
  group.add(roadMesh);

  const shoulderGeo = new THREE.BufferGeometry();
  shoulderGeo.setAttribute('position', new THREE.Float32BufferAttribute(shoulderPositions, 3));
  shoulderGeo.setAttribute('normal', new THREE.Float32BufferAttribute(shoulderNormals, 3));
  shoulderGeo.setIndex(shoulderIndices);
  shoulderGeo.computeVertexNormals();

  const shoulderMat = new THREE.MeshStandardMaterial({
    color: 0x1e2530,
    roughness: 0.88,
    metalness: 0.06,
  });
  const shoulderMesh = new THREE.Mesh(shoulderGeo, shoulderMat);
  shoulderMesh.receiveShadow = true;
  group.add(shoulderMesh);

  return {
    group,
    roadMesh,
    roadMaterial,
    colliderVertices: new Float32Array(colPositions),
    colliderIndices: new Uint32Array(colIndices),
  };
}
