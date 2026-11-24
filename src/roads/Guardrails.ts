import * as THREE from 'three';
import { RoadSpline } from '../roads/RoadSpline';

export interface BuiltGuardrails {
  group: THREE.Group;
  colliderVertices: Float32Array;
  colliderIndices: Uint32Array;
}

/**
 * Generates galvanized steel highway guardrails with retro-reflective roadside delineators
 * along curves, cliffs, and the lakefront bridge, plus smooth physics barrier walls
 * so vehicles deflect safely instead of plunging off the mountain or bridge.
 */
export function buildGuardrails(spline: RoadSpline): BuiltGuardrails {
  const group = new THREE.Group();
  group.name = 'Guardrails';

  const samples = spline.samples;
  const N = samples.length;
  const railOffset = spline.roadHalfWidth + 1.05;

  const railPositions: number[] = [];
  const railIndices: number[] = [];
  const colPositions: number[] = [];
  const colIndices: number[] = [];

  const postMatrices: THREE.Matrix4[] = [];
  const reflectorMatrices: THREE.Matrix4[] = [];
  const dummy = new THREE.Object3D();

  const shouldHaveRail = (side: -1 | 1, idx: number): boolean => {
    const s = samples[idx % N];
    // Leave open on right side at rest area, scenic overlook & mountain viewpoint for natural parking pullouts
    if (side === 1 && (s.zone === 'rest-area' || s.zone === 'overlook' || s.zone === 'viewpoint')) {
      return false;
    }
    if (s.zone === 'bridge' || s.zone === 'tunnel') return true;
    return true;
  };

  for (const side of [-1, 1] as const) {
    let stripStart = -1;

    for (let i = 0; i <= N; i++) {
      const active = i < N && shouldHaveRail(side, i);

      if (active && stripStart === -1) {
        stripStart = i;
      }

      if ((!active || i === N) && stripStart !== -1) {
        const stripEnd = i - 1;
        const baseVert = railPositions.length / 3;
        const colBaseVert = colPositions.length / 3;
        const len = stripEnd - stripStart + 1;

        for (let k = 0; k < len; k++) {
          const s = samples[(stripStart + k) % N];
          const px = s.position.x + s.right.x * railOffset * side;
          const pz = s.position.z + s.right.z * railOffset * side;
          const py = s.position.y;

          // Visual W-beam ribbon (0.48m to 0.84m height)
          railPositions.push(px, py + 0.48, pz, px, py + 0.84, pz);

          // Physics collision barrier (0.0m to 1.4m height, slightly inset 0.1m)
          const cpx = s.position.x + s.right.x * (railOffset - 0.08) * side;
          const cpz = s.position.z + s.right.z * (railOffset - 0.08) * side;
          colPositions.push(cpx, py - 0.1, cpz, cpx, py + 1.35, cpz);

          if (k < len - 1) {
            const a = baseVert + k * 2;
            const b = a + 1;
            const c = a + 2;
            const d = a + 3;
            if (side === 1) {
              railIndices.push(a, b, c, b, d, c);
            } else {
              railIndices.push(a, c, b, b, c, d);
            }

            const ca = colBaseVert + k * 2;
            const cb = ca + 1;
            const cc = ca + 2;
            const cd = ca + 3;
            // Double-sided collision wall for safety
            colIndices.push(ca, cb, cc, cb, cd, cc, ca, cc, cb, cb, cc, cd);
          }

          // Place steel posts & glowing highway reflectors every ~3 samples (~9.5m)
          if (k % 3 === 0) {
            dummy.position.set(px, py + 0.44, pz);
            dummy.rotation.set(0, Math.atan2(s.tangent.x, s.tangent.z), 0);
            dummy.scale.set(1, 1, 1);
            dummy.updateMatrix();
            postMatrices.push(dummy.matrix.clone());

            if (k % 6 === 0) {
              dummy.position.set(
                s.position.x + s.right.x * (railOffset - 0.08) * side,
                py + 0.72,
                s.position.z + s.right.z * (railOffset - 0.08) * side
              );
              dummy.updateMatrix();
              reflectorMatrices.push(dummy.matrix.clone());
            }
          }
        }

        stripStart = -1;
      }
    }
  }

  // Visual rail mesh
  const railGeo = new THREE.BufferGeometry();
  railGeo.setAttribute('position', new THREE.Float32BufferAttribute(railPositions, 3));
  railGeo.setIndex(railIndices);
  railGeo.computeVertexNormals();

  const railMat = new THREE.MeshStandardMaterial({
    color: 0x7c8796,
    roughness: 0.42,
    metalness: 0.68,
    side: THREE.DoubleSide,
  });
  const railMesh = new THREE.Mesh(railGeo, railMat);
  railMesh.castShadow = false;
  railMesh.receiveShadow = true;
  group.add(railMesh);

  // Instanced guardrail posts
  const postGeo = new THREE.BoxGeometry(0.11, 0.92, 0.11);
  const postMat = new THREE.MeshStandardMaterial({
    color: 0x4b5360,
    roughness: 0.65,
    metalness: 0.55,
  });
  const posts = new THREE.InstancedMesh(postGeo, postMat, postMatrices.length);
  for (let i = 0; i < postMatrices.length; i++) {
    posts.setMatrixAt(i, postMatrices[i]);
  }
  posts.instanceMatrix.needsUpdate = true;
  group.add(posts);

  // Instanced amber/white highway cat's-eye reflectors (catches bloom subtly at night!)
  const reflGeo = new THREE.BoxGeometry(0.06, 0.14, 0.18);
  const reflMat = new THREE.MeshStandardMaterial({
    color: 0xffd28a,
    emissive: new THREE.Color(0xffaa44),
    emissiveIntensity: 1.6,
    roughness: 0.2,
  });
  const reflectors = new THREE.InstancedMesh(reflGeo, reflMat, reflectorMatrices.length);
  for (let i = 0; i < reflectorMatrices.length; i++) {
    reflectors.setMatrixAt(i, reflectorMatrices[i]);
  }
  reflectors.instanceMatrix.needsUpdate = true;
  group.add(reflectors);

  return {
    group,
    colliderVertices: new Float32Array(colPositions),
    colliderIndices: new Uint32Array(colIndices),
  };
}
