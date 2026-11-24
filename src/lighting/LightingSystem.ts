import * as THREE from 'three';
import { TimePreset } from '../settings/SettingsManager';
import { damp } from '../utils/MathUtils';

interface TimePalette {
  zenith: THREE.Color;
  horizon: THREE.Color;
  fog: THREE.Color;
  moonColor: THREE.Color;
  moonIntensity: number;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiIntensity: number;
  moonDir: THREE.Vector3;
  starVisibility: number;
  cloudTint: THREE.Color;
  streetlightScale: number;
  hourLabel: number;
}

const PALETTES: Record<TimePreset, TimePalette> = {
  midnight: {
    zenith: new THREE.Color(0x040b1a),
    horizon: new THREE.Color(0x162e52),
    fog: new THREE.Color(0x10213a),
    moonColor: new THREE.Color(0xc8dfff),
    moonIntensity: 2.15,
    hemiSky: new THREE.Color(0x4770ab),
    hemiGround: new THREE.Color(0x18263a),
    hemiIntensity: 1.35,
    moonDir: new THREE.Vector3(0.32, 0.40, -0.86).normalize(),
    starVisibility: 1.0,
    cloudTint: new THREE.Color(0x284369),
    streetlightScale: 1.0,
    hourLabel: 23.75,
  },
  evening: {
    zenith: new THREE.Color(0x0b1635),
    horizon: new THREE.Color(0x314575),
    fog: new THREE.Color(0x1f3054),
    moonColor: new THREE.Color(0xdbe7ff),
    moonIntensity: 1.85,
    hemiSky: new THREE.Color(0x5571ad),
    hemiGround: new THREE.Color(0x1a2538),
    hemiIntensity: 1.42,
    moonDir: new THREE.Vector3(0.45, 0.36, -0.82).normalize(),
    starVisibility: 0.72,
    cloudTint: new THREE.Color(0x3e5282),
    streetlightScale: 0.9,
    hourLabel: 21.25,
  },
  'early-morning': {
    zenith: new THREE.Color(0x0d1d3b),
    horizon: new THREE.Color(0x3a5882),
    fog: new THREE.Color(0x253e61),
    moonColor: new THREE.Color(0xe6f0ff),
    moonIntensity: 1.95,
    hemiSky: new THREE.Color(0x6382b5),
    hemiGround: new THREE.Color(0x213042),
    hemiIntensity: 1.5,
    moonDir: new THREE.Vector3(-0.35, 0.46, -0.82).normalize(),
    starVisibility: 0.5,
    cloudTint: new THREE.Color(0x4d6894),
    streetlightScale: 0.82,
    hourLabel: 4.5,
  },
  sunrise: {
    zenith: new THREE.Color(0x223868),
    horizon: new THREE.Color(0xd47d64),
    fog: new THREE.Color(0x6f515e),
    moonColor: new THREE.Color(0xffd2a1),
    moonIntensity: 2.55,
    hemiSky: new THREE.Color(0xb8868f),
    hemiGround: new THREE.Color(0x2d2930),
    hemiIntensity: 1.55,
    moonDir: new THREE.Vector3(0.72, 0.20, -0.66).normalize(),
    starVisibility: 0.08,
    cloudTint: new THREE.Color(0xd9927a),
    streetlightScale: 0.35,
    hourLabel: 6.2,
  },
  sunset: {
    zenith: new THREE.Color(0x172147),
    horizon: new THREE.Color(0xb85e58),
    fog: new THREE.Color(0x523648),
    moonColor: new THREE.Color(0xffb882),
    moonIntensity: 2.35,
    hemiSky: new THREE.Color(0x8e617c),
    hemiGround: new THREE.Color(0x251d2b),
    hemiIntensity: 1.4,
    moonDir: new THREE.Vector3(-0.72, 0.19, -0.67).normalize(),
    starVisibility: 0.25,
    cloudTint: new THREE.Color(0xb36466),
    streetlightScale: 0.62,
    hourLabel: 19.6,
  },
};

/**
 * Smoothly transitioning sky dome & atmospheric lighting system.
 * Features procedural drifting moonlit/golden-hour clouds, crisp pinpoint stars,
 * subtle Milky Way band, luminous moon/sun disc, and flash-free color interpolation.
 */
export class LightingSystem {
  public readonly skyMesh: THREE.Mesh;
  public readonly moonLight: THREE.DirectionalLight;
  public readonly hemiLight: THREE.HemisphereLight;
  public readonly fog: THREE.FogExp2;

  public currentMoonDir = new THREE.Vector3();
  public currentMoonColor = new THREE.Color();
  public currentZenithColor = new THREE.Color();
  public currentHorizonColor = new THREE.Color();
  public currentFogColor = new THREE.Color();
  public currentStreetlightScale = 1.0;

  private targetPreset: TimePreset;
  private clockHours = 23.75;
  private dynamicCycle = false;

  private readonly skyUniforms: {
    uZenithColor: { value: THREE.Color };
    uHorizonColor: { value: THREE.Color };
    uMoonDir: { value: THREE.Vector3 };
    uMoonColor: { value: THREE.Color };
    uCloudTint: { value: THREE.Color };
    uStarVis: { value: number };
    uMilkyWayBoost: { value: number };
    uTime: { value: number };
  };

  constructor(scene: THREE.Scene, initialPreset: TimePreset = 'midnight') {
    this.targetPreset = initialPreset;
    const p = PALETTES[initialPreset];

    this.fog = new THREE.FogExp2(p.fog.getHex(), 0.0014);
    scene.fog = this.fog;
    scene.background = p.fog.clone();

    this.skyUniforms = {
      uZenithColor: { value: p.zenith.clone() },
      uHorizonColor: { value: p.horizon.clone() },
      uMoonDir: { value: p.moonDir.clone() },
      uMoonColor: { value: p.moonColor.clone() },
      uCloudTint: { value: p.cloudTint.clone() },
      uStarVis: { value: p.starVisibility },
      uMilkyWayBoost: { value: 1.0 },
      uTime: { value: 0 },
    };

    const skyGeo = new THREE.SphereGeometry(2200, 40, 28);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: this.skyUniforms,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uZenithColor;
        uniform vec3 uHorizonColor;
        uniform vec3 uMoonDir;
        uniform vec3 uMoonColor;
        uniform vec3 uCloudTint;
        uniform float uStarVis;
        uniform float uMilkyWayBoost;
        uniform float uTime;

        varying vec3 vDir;

        float hash31(vec3 p) {
          p = fract(p * 0.1031);
          p += dot(p, p.yzx + 33.33);
          return fract((p.x + p.y) * p.z);
        }

        float hash21(vec2 p) {
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
        }

        float noise2(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float a = hash21(i);
          float b = hash21(i + vec2(1.0, 0.0));
          float c = hash21(i + vec2(0.0, 1.0));
          float d = hash21(i + vec2(1.0, 1.0));
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }

        float fbmCloud(vec2 p) {
          float v = 0.0;
          float a = 0.5;
          for (int i = 0; i < 4; i++) {
            v += a * noise2(p);
            p = p * 2.06 + vec2(17.1, 9.2);
            a *= 0.5;
          }
          return v;
        }

        void main() {
          vec3 dir = normalize(vDir);
          float h = clamp(dir.y, 0.0, 1.0);

          vec3 col = mix(uHorizonColor, uZenithColor, pow(h, 0.52));

          // Soft atmospheric scattering glow near horizon
          float horizonBand = exp(-abs(dir.y) * 8.5);
          col += uHorizonColor * 0.28 * horizonBand;

          // Subtle Milky Way luminous band (boosted dramatically in Endless Desert!)
          float bandAxis = abs(dir.x * 0.55 + dir.y * 0.42 + dir.z * 0.72 - 0.18);
          float milkyWay = exp(-bandAxis * bandAxis * 18.0) * smoothstep(0.06, 0.45, dir.y) * uStarVis * uMilkyWayBoost;
          col += vec3(0.11, 0.14, 0.28) * milkyWay;

          // Crisp pinpoint twinkling stars
          if (dir.y > 0.02 && uStarVis > 0.01) {
            vec3 starGrid = dir * 460.0;
            vec3 starCell = floor(starGrid);
            vec3 starFrac = fract(starGrid) - 0.5;
            float rnd = hash31(starCell);
            float threshold = mix(0.994, 0.986, clamp((uMilkyWayBoost - 0.5) * 0.5, 0.0, 1.0));
            if (rnd > threshold) {
              float pinpoint = smoothstep(0.35, 0.05, length(starFrac));
              float twinkle = 0.75 + 0.25 * sin(uTime * 1.85 + rnd * 120.0);
              float brightness = smoothstep(threshold, 0.9995, rnd) * smoothstep(0.02, 0.24, dir.y) * pinpoint;
              vec3 starTint = mix(vec3(0.84, 0.91, 1.0), vec3(1.0, 0.93, 0.85), fract(rnd * 43.1));
              col += starTint * brightness * twinkle * 1.3 * uStarVis * min(1.5, 0.7 + uMilkyWayBoost * 0.4);
            }
          }

          // Celestial disc (Full Moon at night / Warm Sun at sunrise & sunset)
          vec3 celestialDir = normalize(uMoonDir);
          float moonDot = max(dot(dir, celestialDir), 0.0);
          float disc = smoothstep(0.9987, 0.9994, moonDot);
          float haloInner = pow(moonDot, 85.0) * 0.45;
          float haloOuter = pow(moonDot, 10.0) * 0.18;
          col += uMoonColor * (disc * 2.1 + haloInner + haloOuter);

          // Soft drifting atmospheric clouds lit along their edges by moonlight/sunlight
          if (dir.y > 0.03) {
            vec2 cloudUv = dir.xz / (dir.y + 0.22) * 1.35 + vec2(uTime * 0.0045, uTime * 0.002);
            float n = fbmCloud(cloudUv);
            float cloudMask = smoothstep(0.46, 0.78, n) * smoothstep(0.03, 0.22, dir.y) * (1.0 - smoothstep(0.68, 0.96, dir.y));
            float silverLining = pow(moonDot, 6.0) * 0.55;
            vec3 cloudCol = mix(uCloudTint, uMoonColor * 0.95, clamp(silverLining, 0.0, 0.78));
            col = mix(col, cloudCol, cloudMask * 0.55);
          }

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });

    this.skyMesh = new THREE.Mesh(skyGeo, skyMat);
    this.skyMesh.name = 'MidnightSkyDome';
    scene.add(this.skyMesh);

    this.hemiLight = new THREE.HemisphereLight(p.hemiSky, p.hemiGround, p.hemiIntensity);
    scene.add(this.hemiLight);

    this.moonLight = new THREE.DirectionalLight(p.moonColor, p.moonIntensity);
    this.moonLight.castShadow = true;
    this.moonLight.shadow.mapSize.set(1024, 1024);
    this.moonLight.shadow.camera.near = 10;
    this.moonLight.shadow.camera.far = 260;
    const d = 62;
    this.moonLight.shadow.camera.left = -d;
    this.moonLight.shadow.camera.right = d;
    this.moonLight.shadow.camera.top = d;
    this.moonLight.shadow.camera.bottom = -d;
    this.moonLight.shadow.bias = -0.0005;
    scene.add(this.moonLight);
    scene.add(this.moonLight.target);

    this.snapToPreset(initialPreset);
  }

  public setShadowQuality(size: number, enabled: boolean): void {
    this.moonLight.castShadow = enabled;
    if (enabled && this.moonLight.shadow.mapSize.x !== size) {
      this.moonLight.shadow.mapSize.set(size, size);
      this.moonLight.shadow.map?.dispose();
      this.moonLight.shadow.map = null;
    }
  }

  public setDynamicCycle(enabled: boolean): void {
    this.dynamicCycle = enabled;
  }

  public setMilkyWayBoost(boost: number): void {
    this.skyUniforms.uMilkyWayBoost.value = boost;
  }

  /** Immediately snaps lighting without blending (used at startup). */
  public snapToPreset(preset: TimePreset): void {
    this.targetPreset = preset;
    const p = PALETTES[preset];
    this.clockHours = p.hourLabel;

    this.skyUniforms.uZenithColor.value.copy(p.zenith);
    this.skyUniforms.uHorizonColor.value.copy(p.horizon);
    this.skyUniforms.uMoonDir.value.copy(p.moonDir);
    this.skyUniforms.uMoonColor.value.copy(p.moonColor);
    this.skyUniforms.uCloudTint.value.copy(p.cloudTint);
    this.skyUniforms.uStarVis.value = p.starVisibility;

    this.moonLight.color.copy(p.moonColor);
    this.moonLight.intensity = p.moonIntensity;
    this.hemiLight.color.copy(p.hemiSky);
    this.hemiLight.groundColor.copy(p.hemiGround);
    this.hemiLight.intensity = p.hemiIntensity;
    this.fog.color.copy(p.fog);

    this.currentZenithColor.copy(p.zenith);
    this.currentHorizonColor.copy(p.horizon);
    this.currentFogColor.copy(p.fog);
    this.currentMoonDir.copy(p.moonDir);
    this.currentMoonColor.copy(p.moonColor);
    this.currentStreetlightScale = p.streetlightScale;
  }

  /** Sets the desired time preset; update() smoothly interpolates all lights & sky colors. */
  public applyPreset(preset: TimePreset): void {
    if (this.targetPreset !== preset) {
      this.targetPreset = preset;
      this.clockHours = PALETTES[preset].hourLabel;
    }
  }

  public getFormattedClock(): string {
    const wrapped = ((this.clockHours % 24) + 24) % 24;
    const h = Math.floor(wrapped);
    const m = Math.floor((wrapped - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  public update(dt: number, elapsed: number, focusPos: THREE.Vector3, fogDensity: number): void {
    this.skyUniforms.uTime.value = elapsed;
    this.skyMesh.position.copy(focusPos);
    this.fog.density = fogDensity;

    // Smooth flash-free color & lighting transition toward targetPreset
    const p = PALETTES[this.targetPreset];
    const blend = 1 - Math.exp(-2.2 * Math.max(dt, 0.016));

    this.skyUniforms.uZenithColor.value.lerp(p.zenith, blend);
    this.skyUniforms.uHorizonColor.value.lerp(p.horizon, blend);
    this.skyUniforms.uMoonColor.value.lerp(p.moonColor, blend);
    this.skyUniforms.uCloudTint.value.lerp(p.cloudTint, blend);
    this.skyUniforms.uMoonDir.value.lerp(p.moonDir, blend).normalize();
    this.skyUniforms.uStarVis.value = damp(this.skyUniforms.uStarVis.value, p.starVisibility, 2.2, Math.max(dt, 0.016));

    this.moonLight.color.lerp(p.moonColor, blend);
    this.moonLight.intensity = damp(this.moonLight.intensity, p.moonIntensity, 2.2, Math.max(dt, 0.016));
    this.hemiLight.color.lerp(p.hemiSky, blend);
    this.hemiLight.groundColor.lerp(p.hemiGround, blend);
    this.hemiLight.intensity = damp(this.hemiLight.intensity, p.hemiIntensity, 2.2, Math.max(dt, 0.016));
    this.fog.color.lerp(p.fog, blend);

    this.currentZenithColor.copy(this.skyUniforms.uZenithColor.value);
    this.currentHorizonColor.copy(this.skyUniforms.uHorizonColor.value);
    this.currentFogColor.copy(this.fog.color);
    this.currentMoonDir.copy(this.skyUniforms.uMoonDir.value);
    this.currentMoonColor.copy(this.moonLight.color);
    this.currentStreetlightScale = damp(this.currentStreetlightScale, p.streetlightScale, 2.2, Math.max(dt, 0.016));

    this.clockHours = (this.clockHours + dt * (this.dynamicCycle ? 0.12 : 0.00028)) % 24;

    this.moonLight.position.copy(focusPos).addScaledVector(this.currentMoonDir, 115);
    this.moonLight.target.position.copy(focusPos);
    this.moonLight.target.updateMatrixWorld();
  }
}
