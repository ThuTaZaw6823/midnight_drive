import * as THREE from 'three';
import { Noise2D } from './Noise';
import { RoadSpline } from '../roads/RoadSpline';
import { createTerrainDetailTexture } from '../core/ProceduralTextures';
import { clamp, lerp, smootherstep, smoothstep } from '../utils/MathUtils';

export interface BuiltTerrain {
  mesh: THREE.Mesh;
  distantRingMesh: THREE.Mesh;
  size: number;
  segments: number;
  getHeightAt: (x: number, z: number) => number;
  colliderVertices: Float32Array;
  colliderIndices: Uint32Array;
}

/**
 * Generates realistic multi-layered Mountain Escape terrain:
 * - High-resolution carved valley & foothill terrain smoothly welded to the 8.2m road
 * - Natural ridged alpine mountain ranges, meadows, rocky cliff strata & pebble shorelines
 * - Secondary distant atmospheric mountain skyline ring for layered horizon depth
 */
export function buildTerrain(spline: RoadSpline, seed = 202604): BuiltTerrain {
  const size = 2500;
  const segments = 256;
  const half = size / 2;

  const noise = new Noise2D(seed);
  const detailNoise = new Noise2D(seed + 77);
  const biomeNoise = new Noise2D(seed + 313);

  const lakeCx = -40;
  const lakeCz = 20;

  /** Evaluates natural uncarved mountain, rolling hill & alpine lake basin elevation. */
  const evalBaseHeight = (x: number, z: number): number => {
    // Domain-warped organic lake basin
    const wx = noise.fbm(x * 0.0012, z * 0.0012, 3) * 85;
    const wz = detailNoise.fbm(x * 0.0012 + 12, z * 0.0012 - 9, 3) * 85;

    const lx = (x + wx * 0.35 - lakeCx) / 485;
    const lz = (z + wz * 0.35 - lakeCz) / 385;
    const lakeDist = Math.sqrt(lx * lx + lz * lz);

    // Eastern bay cove spanned by the cable-stayed lakefront bridge
    const coveDx = (x - 565) / 210;
    const coveDz = (z + 175) / 245;
    const coveDist = Math.sqrt(coveDx * coveDx + coveDz * coveDz);
    const effectiveLakeDist = Math.min(lakeDist, coveDist * 0.92 + 0.14);

    // Multi-frequency ridged + rolling noise (avoids repetitive pyramids or cones!)
    const ridgeBroad = noise.ridged((x + wx) * 0.00072, (z + wz) * 0.00072, 5, 2.08, 0.52);
    const ridgeCrag = detailNoise.ridged(x * 0.0018, z * 0.0018, 4, 2.15, 0.48);
    const rollingHills = biomeNoise.fbm(x * 0.0016, z * 0.0016, 4);

    // Gentle lakeside meadows & rolling hills near highway (lakeDist 0.95..1.65)
    const foothillMask = smoothstep(0.92, 1.65, lakeDist);
    // Majestic layered alpine ranges rising gracefully beyond the outer loop (lakeDist > 1.55)
    const mountainMask = smoothstep(1.52, 2.38, lakeDist);

    let h =
      2.4 +
      (ridgeBroad * 28 + rollingHills * 14) * foothillMask +
      (ridgeBroad * 165 + ridgeCrag * 42 + 48) * mountainMask;

    // Smooth lake basin carve below y = 0
    const basinFactor = 1.0 - smootherstep(0.54, 1.06, effectiveLakeDist);
    h = lerp(h, -16.5, basinFactor);

    // Rocky mountain spur encapsulating the western tunnel portal
    const tunnelSpurDist = Math.hypot((x + 815) / 185, (z + 185) / 210);
    const tunnelSpur = (1.0 - smootherstep(0.0, 1.06, tunnelSpurDist)) * 62;
    h += tunnelSpur;

    return h;
  };

  /** Evaluates terrain elevation smoothly welded to road embankments, viewpoints, rest area & bridge. */
  const getHeightAt = (x: number, z: number): number => {
    const baseH = evalBaseHeight(x, z);
    const closest = spline.findClosest(x, z, 2);
    if (!closest) return baseH;

    const { sample, distance2D, signedLateral } = closest;

    if (sample.zone === 'bridge') {
      const bridgeCarve = 1.0 - smoothstep(10, 58, distance2D);
      return Math.min(baseH, lerp(baseH, -8.5, bridgeCarve));
    }

    if (sample.zone === 'tunnel') {
      const innerHalf = spline.roadHalfWidth + spline.shoulderWidth + 1.0;
      if (distance2D <= innerHalf) return sample.position.y - 0.14;
      const wallBlend = smootherstep(innerHalf, innerHalf + 18, distance2D);
      return lerp(sample.position.y - 0.14, Math.max(baseH, sample.position.y + 20), wallBlend);
    }

    const extraRight =
      sample.zone === 'rest-area' && signedLateral > 0
        ? 27.0
        : sample.zone === 'viewpoint' && signedLateral > 0
        ? 14.0
        : sample.zone === 'overlook' && signedLateral > 0
        ? 10.0
        : 0.0;

    const flatHalf = spline.roadHalfWidth + spline.shoulderWidth + 2.2 + extraRight;
    const blendOuter = flatHalf + 34.0;

    if (distance2D <= flatHalf) {
      return sample.position.y - 0.14;
    }

    if (distance2D < blendOuter) {
      const t = smootherstep(flatHalf, blendOuter, distance2D);
      return lerp(sample.position.y - 0.14, baseH, t);
    }

    return baseH;
  };

  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);

  const posAttr = geo.attributes.position as THREE.BufferAttribute;
  const vertexCount = posAttr.count;
  const colors = new Float32Array(vertexCount * 3);

  const cLakeBed = new THREE.Color(0x0c1622);
  const cPebbleShore = new THREE.Color(0x28323b);
  const cMeadowGrass = new THREE.Color(0x1f3626);
  const cPineMoss = new THREE.Color(0x172b22);
  const cAlpineRock = new THREE.Color(0x37414f);
  const cGraniteCliff = new THREE.Color(0x465161);
  const cSnowCrest = new THREE.Color(0x788ba3);
  const tmpColor = new THREE.Color();

  for (let i = 0; i < vertexCount; i++) {
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i);
    const y = getHeightAt(x, z);
    posAttr.setY(i, y);

    const nBiome = biomeNoise.fbm(x * 0.008, z * 0.008, 3) * 0.5 + 0.5;
    const nFine = detailNoise.sample(x * 0.025, z * 0.025) * 0.5 + 0.5;

    if (y < -0.5) {
      tmpColor.copy(cLakeBed);
    } else if (y < 2.6) {
      tmpColor.copy(cLakeBed).lerp(cPebbleShore, smoothstep(-0.5, 2.6, y));
    } else if (y < 42) {
      const grassMix = clamp(nBiome * 0.75 + nFine * 0.25, 0, 1);
      tmpColor.copy(cPineMoss).lerp(cMeadowGrass, grassMix);
      if (y < 6.0) {
        tmpColor.lerp(cPebbleShore, 1 - smoothstep(2.6, 6.0, y));
      }
    } else if (y < 105) {
      tmpColor.copy(cPineMoss).lerp(cAlpineRock, smoothstep(42, 92, y));
    } else {
      tmpColor.copy(cAlpineRock).lerp(cSnowCrest, smoothstep(105, 185, y));
    }

    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  // Blend exposed granite rock on steep cliffs using computed surface normals
  const normAttr = geo.attributes.normal as THREE.BufferAttribute;
  const colAttr = geo.attributes.color as THREE.BufferAttribute;
  for (let i = 0; i < vertexCount; i++) {
    const ny = normAttr.getY(i);
    const y = posAttr.getY(i);
    if (ny < 0.85 && y > 2.5) {
      const cliffMix = smoothstep(0.85, 0.52, ny);
      const rockCol = ny < 0.65 ? cGraniteCliff : cAlpineRock;
      colAttr.setXYZ(
        i,
        lerp(colAttr.getX(i), rockCol.r, cliffMix),
        lerp(colAttr.getY(i), rockCol.g, cliffMix),
        lerp(colAttr.getZ(i), rockCol.b, cliffMix)
      );
    }
  }
  colAttr.needsUpdate = true;

  const detailMap = createTerrainDetailTexture();
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: detailMap,
    roughness: 0.9,
    metalness: 0.04,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'MountainTerrain';

  // Multi-layered distant alpine skyline ring (1180m .. 1950m) for rich horizon depth
  const distantRingMesh = buildDistantMountainRing(noise, detailNoise);

  const colliderVertices = new Float32Array(posAttr.array as Float32Array);
  const indexAttr = geo.getIndex()!;
  const colliderIndices = new Uint32Array(indexAttr.array as Uint32Array | Uint16Array);

  const stride = segments + 1;
  const cellW = size / segments;
  const fastHeightAt = (x: number, z: number): number => {
    const gx = clamp((x + half) / cellW, 0, segments - 0.001);
    const gz = clamp((z + half) / cellW, 0, segments - 0.001);
    const ix = Math.floor(gx);
    const iz = Math.floor(gz);
    const fx = gx - ix;
    const fz = gz - iz;

    const h00 = posAttr.getY(iz * stride + ix);
    const h10 = posAttr.getY(iz * stride + ix + 1);
    const h01 = posAttr.getY((iz + 1) * stride + ix);
    const h11 = posAttr.getY((iz + 1) * stride + ix + 1);

    return lerp(lerp(h00, h10, fx), lerp(h01, h11, fx), fz);
  };

  return {
    mesh,
    distantRingMesh,
    size,
    segments,
    getHeightAt: fastHeightAt,
    colliderVertices,
    colliderIndices,
  };
}

/**
 * Generates a lightweight distant mountain horizon ring encircling the playable valley
 * so every camera angle sees layered misty alpine silhouettes fading into the sky.
 */
function buildDistantMountainRing(noise: Noise2D, detail: Noise2D): THREE.Mesh {
  const radialSegs = 128;
  const ringSegs = 8;
  const innerR = 1140;
  const outerR = 1920;

  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  const cBase = new THREE.Color(0x162438);
  const cMid = new THREE.Color(0x213550);
  const cPeak = new THREE.Color(0x4a6385);
  const tmp = new THREE.Color();

  for (let r = 0; r <= ringSegs; r++) {
    const t = r / ringSegs;
    const radius = lerp(innerR, outerR, t);
    // Rise to majestic distant crests around t = 0.55 then taper cleanly at horizon
    const env = Math.sin(t * Math.PI);

    for (let a = 0; a <= radialSegs; a++) {
      const theta = (a / radialSegs) * Math.PI * 2;
      const x = Math.cos(theta) * radius;
      const z = Math.sin(theta) * radius;

      const ridge = noise.ridged(x * 0.0007, z * 0.0007, 4, 2.05, 0.52);
      const crag = detail.fbm(x * 0.0016, z * 0.0016, 3) * 0.5 + 0.5;
      const y = -12 + (85 + ridge * 260 + crag * 65) * env;

      positions.push(x, y, z);

      tmp.copy(cBase).lerp(cMid, smoothstep(20, 140, y)).lerp(cPeak, smoothstep(160, 290, y));
      colors.push(tmp.r, tmp.g, tmp.b);
    }
  }

  const stride = radialSegs + 1;
  for (let r = 0; r < ringSegs; r++) {
    for (let a = 0; a < radialSegs; a++) {
      const i0 = r * stride + a;
      const i1 = i0 + 1;
      const i2 = (r + 1) * stride + a;
      const i3 = i2 + 1;
      indices.push(i0, i2, i1, i1, i2, i3);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.96,
    metalness: 0.02,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'DistantAlpineRange';
  return mesh;
}
