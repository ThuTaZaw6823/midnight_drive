import * as THREE from 'three';
import { Noise2D } from '../../terrain/Noise';
import { RoadSpline } from '../../roads/RoadSpline';
import { BuiltTerrain, buildTerrain as buildMountainTerrain } from '../../terrain/TerrainGenerator';
import { createTerrainDetailTexture } from '../../core/ProceduralTextures';
import { EnvironmentId } from '../EnvironmentConfig';
import { clamp, lerp, smootherstep, smoothstep } from '../../utils/MathUtils';

/**
 * Dispatches terrain generation for all 6 Midnight Drive environments.
 * Every terrain mesh welds seamlessly to the world's RoadSpline with 1:1 Rapier collider data.
 */
export function buildEnvironmentTerrain(
  envId: EnvironmentId,
  spline: RoadSpline,
  seed = 202604
): BuiltTerrain {
  if (envId === 'mountain-escape') {
    return buildMountainTerrain(spline, seed);
  }

  const size = 2500;
  const segments = envId === 'midnight-city' ? 160 : 210;
  const half = size / 2;

  const noise = new Noise2D(seed + envId.length * 97);
  const detail = new Noise2D(seed + 419);

  const evalBaseHeight = (x: number, z: number): number => {
    if (envId === 'midnight-city') {
      // Urban flat metropolis with a carved harbor river channel beneath the eastern bridge (x > 460, |z| < 260)
      const channelDx = (x - 630) / 190;
      const channelDz = (z + 40) / 240;
      const harborDist = Math.hypot(channelDx, channelDz);
      const riverCarve = 1.0 - smootherstep(0.42, 1.0, harborDist);
      const subtle = noise.fbm(x * 0.002, z * 0.002, 2) * 0.6;
      return lerp(2.0 + subtle, -9.5, riverCarve);
    }

    if (envId === 'ocean-highway') {
      // Vast open moonlit ocean across the center & south-east bay, sweeping coastal cliffs along the outer rim
      const ox = (x - 40) / 560;
      const oz = (z - 40) / 470;
      const warp = noise.fbm(x * 0.0014, z * 0.0014, 3) * 0.22;
      const bayDist = Math.hypot(ox, oz) + warp;

      const coveDist = Math.hypot((x - 630) / 220, (z + 10) / 260);
      const waterDist = Math.min(bayDist, coveDist * 0.9 + 0.1);

      const cliffRing = smoothstep(0.95, 1.85, bayDist);
      const ridge = noise.ridged(x * 0.0009, z * 0.0009, 4, 2.05, 0.5);
      let h = 2.5 + ridge * 92 * cliffRing + detail.fbm(x * 0.0025, z * 0.0025, 3) * 12 * cliffRing;

      // Submerge central bay + eastern channel below ocean surface (y = 0)
      const seaFactor = 1.0 - smootherstep(0.55, 1.05, waterDist);
      h = lerp(h, -15.0, seaFactor);

      // Rocky lighthouse promontory jutting into the moonlit ocean at (160, -140)
      const lhDist = Math.hypot((x - 160) / 95, (z + 140) / 85);
      const lhHill = (1.0 - smootherstep(0.0, 1.0, lhDist)) * 22;
      h = Math.max(h, -6 + lhHill);
      return h;
    }

    if (envId === 'countryside') {
      // Soft rolling green pastures, low valley creek under bridge, distant gentle hills
      const rolling = noise.fbm(x * 0.0011, z * 0.0011, 4) * 24;
      const hills = detail.fbm(x * 0.0024, z * 0.0024, 3) * 7;
      const outer = smoothstep(750, 1220, Math.hypot(x, z)) * 45;
      let h = 11.5 + rolling + hills + outer;
      // Quiet creek valley under eastern stone bridge
      const creekDist = Math.hypot((x - 680) / 145, (z - 10) / 210);
      const creek = 1.0 - smootherstep(0.3, 1.0, creekDist);
      h = lerp(h, -3.5, creek);
      return h;
    }

    if (envId === 'rainy-expressway') {
      // Rolling dark wet woodland hills flanking a smooth expressway corridor
      const r = Math.hypot(x, z);
      const hills = noise.fbm(x * 0.0012, z * 0.0012, 4) * 28 + detail.ridged(x * 0.001, z * 0.001, 3) * 32;
      const outerBoost = smoothstep(820, 1220, r) * 65;
      return 10.0 + hills * 0.65 + outerBoost;
    }

    // endless-desert: expansive arid canyon flats + stratified flat-topped desert mesas
    const flatRoll = noise.fbm(x * 0.001, z * 0.001, 3) * 6.5;
    const mesaNoise = noise.fbm(x * 0.0016 + 7.4, z * 0.0016 - 4.1, 4) * 0.5 + 0.5;
    // Create flat-topped red-rock plateaus via stepped smoothstep!
    const mesaStep = smootherstep(0.56, 0.66, mesaNoise) * 48 + smootherstep(0.72, 0.78, mesaNoise) * 34;
    const outerCanyon = smoothstep(860, 1220, Math.hypot(x, z)) * 55;
    return 7.5 + flatRoll + mesaStep + outerCanyon;
  };

  const getHeightAt = (x: number, z: number): number => {
    const baseH = evalBaseHeight(x, z);
    const closest = spline.findClosest(x, z, 2);
    if (!closest) return baseH;

    const { sample, distance2D, signedLateral } = closest;

    if (sample.zone === 'bridge') {
      const carve = 1.0 - smoothstep(10, 55, distance2D);
      return Math.min(baseH, lerp(baseH, -7.5, carve));
    }

    const extraRight =
      sample.zone === 'rest-area' && signedLateral > 0
        ? 28.0
        : sample.zone === 'overlook' && signedLateral > 0
        ? 9.0
        : 0.0;

    const flatHalf = spline.roadHalfWidth + spline.shoulderWidth + 2.4 + extraRight;
    const blendOuter = flatHalf + (envId === 'midnight-city' ? 22 : 34);

    if (distance2D <= flatHalf) return sample.position.y - 0.14;
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
  const tmp = new THREE.Color();

  // Biome-specific vertex color palettes
  for (let i = 0; i < vertexCount; i++) {
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i);
    const y = getHeightAt(x, z);
    posAttr.setY(i, y);

    const n = detail.sample(x * 0.015, z * 0.015) * 0.5 + 0.5;

    if (envId === 'midnight-city') {
      tmp.setHex(y < 0.2 ? 0x0d1522 : n > 0.5 ? 0x1b222e : 0x161c26);
    } else if (envId === 'ocean-highway') {
      if (y < -0.4) tmp.setHex(0x0b1624);
      else if (y < 3.2) tmp.setHex(0x4c483e).lerp(new THREE.Color(0x2d3832), smoothstep(0.2, 3.2, y)); // Sandy moonlit beach
      else if (y < 28) tmp.setHex(0x1f3428).lerp(new THREE.Color(0x2b4130), n);
      else tmp.setHex(0x3a4350).lerp(new THREE.Color(0x4e5766), smoothstep(28, 70, y));
    } else if (envId === 'countryside') {
      // Patchwork agricultural meadow fields & warm earth
      const fieldPatch = (Math.sin(x * 0.012) * Math.cos(z * 0.012)) * 0.5 + 0.5;
      if (y < 1.2) tmp.setHex(0x1a2824);
      else {
        tmp
          .setHex(0x203a24)
          .lerp(new THREE.Color(0x354726), fieldPatch * 0.65)
          .lerp(new THREE.Color(0x283823), n * 0.35);
      }
    } else if (envId === 'rainy-expressway') {
      tmp.setHex(0x14241e).lerp(new THREE.Color(0x22322b), n).lerp(new THREE.Color(0x2e3944), smoothstep(28, 65, y));
    } else {
      // endless-desert: rich terracotta sand, warm ochre flats, stratified red-rock mesas
      const strata = Math.sin(y * 0.42) * 0.5 + 0.5;
      if (y < 16) {
        tmp.setHex(0x6e4b35).lerp(new THREE.Color(0x825b3f), n);
      } else {
        tmp
          .setHex(0x6b3525)
          .lerp(new THREE.Color(0x8c4730), strata)
          .lerp(new THREE.Color(0x52291f), smoothstep(42, 85, y) * 0.45);
      }
    }

    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const detailMap = createTerrainDetailTexture();
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: detailMap,
    roughness: envId === 'midnight-city' ? 0.72 : 0.92,
    metalness: envId === 'midnight-city' ? 0.15 : 0.04,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = `${envId}_Terrain`;

  // Lightweight distant skyline silhouette ring matched to each biome
  const distantRingMesh = buildBiomeHorizonRing(envId, noise);

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

function buildBiomeHorizonRing(envId: EnvironmentId, noise: Noise2D): THREE.Mesh {
  const radialSegs = 96;
  const ringSegs = 6;
  const innerR = 1160;
  const outerR = 1920;

  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  const cBase = new THREE.Color(
    envId === 'endless-desert' ? 0x3a241d : envId === 'midnight-city' ? 0x0e1424 : 0x152236
  );
  const cTop = new THREE.Color(
    envId === 'endless-desert' ? 0x6b3a29 : envId === 'midnight-city' ? 0x1b2640 : 0x2b4161
  );
  const tmp = new THREE.Color();

  for (let r = 0; r <= ringSegs; r++) {
    const t = r / ringSegs;
    const radius = lerp(innerR, outerR, t);
    const env = Math.sin(t * Math.PI);

    for (let a = 0; a <= radialSegs; a++) {
      const theta = (a / radialSegs) * Math.PI * 2;
      const x = Math.cos(theta) * radius;
      const z = Math.sin(theta) * radius;

      const ridge = noise.ridged(x * 0.0008, z * 0.0008, 3);
      let heightScale = 140;
      if (envId === 'midnight-city') heightScale = 55;
      else if (envId === 'countryside') heightScale = 95;
      else if (envId === 'ocean-highway') heightScale = theta > -0.8 && theta < 1.3 ? 12 : 135;
      else if (envId === 'endless-desert') heightScale = 115;

      const y = -10 + (22 + ridge * heightScale) * env;
      positions.push(x, y, z);

      tmp.copy(cBase).lerp(cTop, clamp(y / 140, 0, 1));
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

  return new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0.02 })
  );
}
