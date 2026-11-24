import * as THREE from 'three';
import { GraphicsPreset } from '../settings/SettingsManager';

/**
 * Upgraded alpine lake shader featuring multi-octave animated waves, emerald-midnight depth
 * coloration, sky zenith/horizon Fresnel reflection, moon & sunrise/sunset specular shimmer,
 * and GraphicsPreset-scaled shader detail.
 */
export class LakeSystem {
  public readonly mesh: THREE.Mesh;
  private readonly uniforms: {
    uTime: { value: number };
    uMoonDir: { value: THREE.Vector3 };
    uMoonColor: { value: THREE.Color };
    uDeepColor: { value: THREE.Color };
    uShallowColor: { value: THREE.Color };
    uSkyZenithColor: { value: THREE.Color };
    uSkyHorizonColor: { value: THREE.Color };
    uFogColor: { value: THREE.Color };
    uFogDensity: { value: number };
    uReflectionBoost: { value: number };
  };

  constructor() {
    const geometry = new THREE.PlaneGeometry(1880, 1620, 72, 72);
    geometry.rotateX(-Math.PI / 2);

    this.uniforms = {
      uTime: { value: 0 },
      uMoonDir: { value: new THREE.Vector3(0.32, 0.40, -0.86).normalize() },
      uMoonColor: { value: new THREE.Color(0xc8dcff) },
      uDeepColor: { value: new THREE.Color(0x05101e) },
      uShallowColor: { value: new THREE.Color(0x0e2a3e) },
      uSkyZenithColor: { value: new THREE.Color(0x060e1f) },
      uSkyHorizonColor: { value: new THREE.Color(0x183052) },
      uFogColor: { value: new THREE.Color(0x102038) },
      uFogDensity: { value: 0.0014 },
      uReflectionBoost: { value: 1.0 },
    };

    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: true,
      vertexShader: /* glsl */ `
        uniform float uTime;
        varying vec3 vWorldPos;

        void main() {
          vec3 pos = position;
          float wave = sin(pos.x * 0.038 + uTime * 0.85) * 0.055
                     + cos(pos.z * 0.052 - uTime * 0.68) * 0.045;
          pos.y += wave;
          vec4 worldPos = modelMatrix * vec4(pos, 1.0);
          vWorldPos = worldPos.xyz;
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uMoonDir;
        uniform vec3 uMoonColor;
        uniform vec3 uDeepColor;
        uniform vec3 uShallowColor;
        uniform vec3 uSkyZenithColor;
        uniform vec3 uSkyHorizonColor;
        uniform vec3 uFogColor;
        uniform float uFogDensity;
        uniform float uReflectionBoost;

        varying vec3 vWorldPos;

        float waveHeight(vec2 p, float t) {
          float w = 0.0;
          w += sin(p.x * 0.13 + p.y * 0.07 + t * 1.05) * 0.42;
          w += sin(p.x * -0.08 + p.y * 0.18 - t * 0.82) * 0.34;
          w += sin(p.x * 0.29 - p.y * 0.24 + t * 1.45) * 0.16;
          w += cos(p.x * 0.56 + p.y * 0.44 - t * 2.0) * 0.08;
          w += sin(p.x * 0.92 - p.y * 0.78 + t * 2.6) * 0.04;
          return w;
        }

        void main() {
          vec2 p = vWorldPos.xz;
          float eps = 0.32;
          float h0 = waveHeight(p, uTime);
          float hx = waveHeight(p + vec2(eps, 0.0), uTime);
          float hz = waveHeight(p + vec2(0.0, eps), uTime);

          vec3 normal = normalize(vec3((h0 - hx) * 0.24, 1.0, (h0 - hz) * 0.24));
          vec3 viewDir = normalize(cameraPosition - vWorldPos);

          // Fresnel sky reflection blending zenith and horizon colors realistically
          float ndotv = max(dot(viewDir, normal), 0.0);
          float fresnel = clamp(pow(1.0 - ndotv, 3.4), 0.08, 0.94);

          vec3 reflDir = reflect(-viewDir, normal);
          vec3 skyRefl = mix(uSkyHorizonColor * 1.18, uSkyZenithColor * 1.35, clamp(reflDir.y * 1.6, 0.0, 1.0));

          // Subtle natural emerald-blue variation across lake depths
          float depthWave = 0.4 + 0.25 * sin(p.x * 0.0045 + p.y * 0.003);
          vec3 baseWater = mix(uDeepColor, uShallowColor, depthWave);
          vec3 color = mix(baseWater, skyRefl, fresnel * uReflectionBoost);

          // Shimmering moonlight / sunrise / sunset specular reflection path
          vec3 halfVec = normalize(normalize(uMoonDir) + viewDir);
          float specBroad = pow(max(dot(normal, halfVec), 0.0), 32.0) * 0.38;
          float specCrisp = pow(max(dot(normal, halfVec), 0.0), 280.0) * 1.55;
          color += uMoonColor * (specBroad + specCrisp) * uReflectionBoost;

          // Subtle atmospheric fog matching scene FogExp2
          float dist = length(cameraPosition - vWorldPos);
          float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
          color = mix(color, uFogColor, clamp(fogFactor, 0.0, 1.0));

          gl_FragColor = vec4(color, 0.97);
        }
      `,
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.set(40, 0.0, 0);
    this.mesh.name = 'AlpineLake';
  }

  public setQuality(preset: GraphicsPreset): void {
    this.uniforms.uReflectionBoost.value =
      preset === 'low' ? 0.65 : preset === 'medium' ? 0.85 : preset === 'high' ? 1.0 : 1.18;
  }

  public update(elapsedTime: number): void {
    this.uniforms.uTime.value = elapsedTime;
  }

  public syncAtmosphere(
    moonDir: THREE.Vector3,
    moonColor: THREE.Color,
    skyZenith: THREE.Color,
    skyHorizon: THREE.Color,
    fogColor: THREE.Color,
    fogDensity: number
  ): void {
    this.uniforms.uMoonDir.value.copy(moonDir).normalize();
    this.uniforms.uMoonColor.value.copy(moonColor);
    this.uniforms.uSkyZenithColor.value.copy(skyZenith);
    this.uniforms.uSkyHorizonColor.value.copy(skyHorizon);
    this.uniforms.uFogColor.value.copy(fogColor);
    this.uniforms.uFogDensity.value = fogDensity;
  }
}
