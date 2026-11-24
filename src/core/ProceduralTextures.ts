import * as THREE from 'three';
import { seededRandom } from '../utils/MathUtils';
import { RoadMarkingStyle } from '../world/EnvironmentConfig';

export interface RoadTextures {
  map: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
}

/**
 * Generates high-resolution procedural asphalt diffuse, wet-puddle roughness,
 * and aggregate bump textures tailored to each world's road markings.
 */
export function createRoadTextures(style: RoadMarkingStyle = 'mountain'): RoadTextures {
  const width = 512;
  const height = 1024;
  const rand = seededRandom(4242 + style.length * 131);

  const diffCanvas = document.createElement('canvas');
  diffCanvas.width = width;
  diffCanvas.height = height;
  const ctx = diffCanvas.getContext('2d')!;

  // Base asphalt luminance slightly tailored per environment
  const baseR = style === 'desert' ? 48 : style === 'countryside' ? 44 : 38;
  const baseG = style === 'desert' ? 46 : style === 'countryside' ? 48 : 44;
  const baseB = style === 'desert' ? 48 : style === 'countryside' ? 54 : 54;

  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    const grain = (rand() - 0.5) * 20;
    data[i] = Math.max(20, Math.min(76, baseR + grain));
    data[i + 1] = Math.max(22, Math.min(80, baseG + grain));
    data[i + 2] = Math.max(26, Math.min(90, baseB + grain));
    data[i + 3] = 255;
  }
  ctx.putImageData(imgData, 0, 0);

  // Darker tire-track polish bands
  const drawWearBand = (cx: number, bandW: number) => {
    const grad = ctx.createLinearGradient(cx - bandW, 0, cx + bandW, 0);
    grad.addColorStop(0, 'rgba(8, 10, 14, 0)');
    grad.addColorStop(0.5, 'rgba(8, 10, 14, 0.34)');
    grad.addColorStop(1, 'rgba(8, 10, 14, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(cx - bandW, 0, bandW * 2, height);
  };

  if (style === 'city' || style === 'expressway') {
    // 4 lanes
    drawWearBand(width * 0.16, 26);
    drawWearBand(width * 0.38, 26);
    drawWearBand(width * 0.62, 26);
    drawWearBand(width * 0.84, 26);
  } else {
    drawWearBand(width * 0.26, 42);
    drawWearBand(width * 0.74, 42);
  }

  // Shoulder border
  ctx.fillStyle = 'rgba(10, 12, 16, 0.48)';
  ctx.fillRect(0, 0, 22, height);
  ctx.fillRect(width - 22, 0, 22, height);

  // Outer solid white edge lines
  ctx.fillStyle = style === 'countryside' ? 'rgba(218, 224, 232, 0.72)' : 'rgba(232, 238, 248, 0.9)';
  ctx.fillRect(28, 0, 9, height);
  ctx.fillRect(width - 37, 0, 9, height);

  if (style === 'city' || style === 'expressway') {
    // Double amber center median line
    ctx.fillStyle = 'rgba(240, 186, 76, 0.9)';
    ctx.fillRect(width / 2 - 10, 0, 6, height);
    ctx.fillRect(width / 2 + 4, 0, 6, height);

    // Crisp white dashed lane dividers on left and right dual carriageways
    ctx.fillStyle = 'rgba(232, 240, 250, 0.86)';
    for (let y = 32; y < height; y += 160) {
      ctx.fillRect(width * 0.27 - 3, y, 6, 86);
      ctx.fillRect(width * 0.73 - 3, y, 6, 86);
    }

    // Reflective cat's-eye studs
    ctx.fillStyle = style === 'city' ? 'rgba(130, 225, 255, 0.95)' : 'rgba(255, 228, 165, 0.95)';
    for (let y = 16; y < height; y += 128) {
      ctx.fillRect(width / 2 - 2, y, 4, 9);
    }
  } else if (style === 'desert') {
    // Classic sun-baked desert highway dashed golden center line
    ctx.fillStyle = 'rgba(238, 190, 82, 0.88)';
    for (let y = 24; y < height; y += 180) {
      ctx.fillRect(width / 2 - 4, y, 8, 92);
    }
  } else if (style === 'countryside') {
    // Subtle dashed white country lane divider
    ctx.fillStyle = 'rgba(225, 228, 234, 0.75)';
    for (let y = 36; y < height; y += 170) {
      ctx.fillRect(width / 2 - 3, y, 6, 74);
    }
  } else {
    // Mountain & Ocean double amber centerline + reflective studs
    ctx.fillStyle = 'rgba(234, 182, 76, 0.9)';
    ctx.fillRect(width / 2 - 11, 0, 7, height);
    ctx.fillRect(width / 2 + 4, 0, 7, height);

    ctx.fillStyle = 'rgba(255, 228, 155, 0.95)';
    for (let y = 32; y < height; y += 128) {
      ctx.fillRect(width / 2 - 2, y, 4, 10);
    }
  }

  // Roughness map (damp tire polish + puddle variation)
  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = width;
  roughCanvas.height = height;
  const rctx = roughCanvas.getContext('2d')!;
  rctx.fillStyle = style === 'desert' ? '#c8c8c8' : '#a8a8a8';
  rctx.fillRect(0, 0, width, height);

  const puddleCount = style === 'city' || style === 'expressway' ? 75 : style === 'desert' ? 12 : 45;
  for (let i = 0; i < puddleCount; i++) {
    const px = 36 + rand() * (width - 72);
    const py = rand() * height;
    const rx = 18 + rand() * 58;
    const ry = 42 + rand() * 145;
    const pGrad = rctx.createRadialGradient(px, py, 2, px, py, Math.max(rx, ry));
    pGrad.addColorStop(0, 'rgba(24, 24, 24, 0.62)');
    pGrad.addColorStop(1, 'rgba(24, 24, 24, 0)');
    rctx.fillStyle = pGrad;
    rctx.beginPath();
    rctx.ellipse(px, py, rx, ry, 0, 0, Math.PI * 2);
    rctx.fill();
  }

  // Bump map for fine aggregate
  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = 256;
  bumpCanvas.height = 256;
  const bctx = bumpCanvas.getContext('2d')!;
  const bImg = bctx.createImageData(256, 256);
  for (let i = 0; i < bImg.data.length; i += 4) {
    const v = Math.floor(110 + rand() * 50);
    bImg.data[i] = v;
    bImg.data[i + 1] = v;
    bImg.data[i + 2] = v;
    bImg.data[i + 3] = 255;
  }
  bctx.putImageData(bImg, 0, 0);

  const map = new THREE.CanvasTexture(diffCanvas);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.anisotropy = 8;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(6, 12);

  return { map, roughnessMap, bumpMap };
}

/**
 * Generates a soft radial light-glow sprite for headlights, taillights, and streetlights.
 */
export function createGlowTexture(innerColor = '#ffffff', outerColor = 'rgba(255,255,255,0)'): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, innerColor);
  grad.addColorStop(0.28, innerColor);
  grad.addColorStop(0.6, outerColor);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Generates a subtle ground-detail albedo tile for natural soil, grass, or desert sand.
 */
export function createTerrainDetailTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const rand = seededRandom(9001);

  const img = ctx.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = 195 + (rand() - 0.5) * 55;
    img.data[i] = n;
    img.data[i + 1] = n;
    img.data[i + 2] = n;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(96, 96);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Procedural illuminated skyscraper facade texture with realistic lit & dark office/apartment windows.
 */
export function createBuildingFacadeTexture(seed = 101, warmTint = false): THREE.CanvasTexture {
  const width = 256;
  const height = 512;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const rand = seededRandom(seed);

  ctx.fillStyle = '#0e131e';
  ctx.fillRect(0, 0, width, height);

  const cols = 8;
  const rows = 24;
  const padX = 6;
  const padY = 5;
  const cellW = width / cols;
  const cellH = height / rows;

  for (let r = 1; r < rows - 1; r++) {
    const floorLitBias = 0.25 + rand() * 0.45;
    for (let c = 0; c < cols; c++) {
      if (rand() < floorLitBias) {
        const pick = rand();
        if (warmTint) {
          ctx.fillStyle = pick < 0.65 ? '#ffd48a' : pick < 0.9 ? '#ffe8bd' : '#a8d4ff';
        } else {
          ctx.fillStyle =
            pick < 0.42
              ? '#ffd894'
              : pick < 0.72
              ? '#c4e4ff'
              : pick < 0.88
              ? '#f0b8ff'
              : '#90f0ff';
        }
        ctx.globalAlpha = 0.45 + rand() * 0.52;
      } else {
        ctx.fillStyle = '#182234';
        ctx.globalAlpha = 0.85;
      }
      ctx.fillRect(c * cellW + padX, r * cellH + padY, cellW - padX * 2, cellH - padY * 2);
    }
  }
  ctx.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
