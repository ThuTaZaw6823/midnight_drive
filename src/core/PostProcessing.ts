import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { GraphicsPreset } from '../settings/SettingsManager';

/**
 * Cinematic WebGL2 rendering pipeline with ACES Filmic tone mapping
 * and subtle UnrealBloomPass for headlights, crimson taillights, streetlights, and moon glow.
 */
export class PostProcessingPipeline {
  public readonly renderer: THREE.WebGLRenderer;
  private readonly composer: EffectComposer;
  private readonly bloomPass: UnrealBloomPass;
  private useComposer = true;

  constructor(canvas: HTMLCanvasElement, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });

    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.composer = new EffectComposer(this.renderer);
    const renderPass = new RenderPass(scene, camera);
    this.composer.addPass(renderPass);

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.26, // Tasteful cinematic glow without washing out lights into flat orbs
      0.42,
      0.86
    );
    this.composer.addPass(this.bloomPass);

    const outputPass = new OutputPass();
    this.composer.addPass(outputPass);
  }

  public applyQuality(preset: GraphicsPreset): { shadowSize: number; shadowsEnabled: boolean } {
    const dpr = window.devicePixelRatio || 1;
    switch (preset) {
      case 'low':
        this.renderer.setPixelRatio(Math.min(dpr, 1.0));
        this.useComposer = false;
        this.renderer.shadowMap.enabled = false;
        return { shadowSize: 512, shadowsEnabled: false };
      case 'medium':
        this.renderer.setPixelRatio(Math.min(dpr, 1.25));
        this.useComposer = true;
        this.bloomPass.strength = 0.22;
        this.renderer.shadowMap.enabled = true;
        return { shadowSize: 1024, shadowsEnabled: true };
      case 'ultra':
        this.renderer.setPixelRatio(Math.min(dpr, 2.0));
        this.useComposer = true;
        this.bloomPass.strength = 0.30;
        this.renderer.shadowMap.enabled = true;
        return { shadowSize: 2048, shadowsEnabled: true };
      case 'high':
      default:
        this.renderer.setPixelRatio(Math.min(dpr, 1.6));
        this.useComposer = true;
        this.bloomPass.strength = 0.26;
        this.renderer.shadowMap.enabled = true;
        return { shadowSize: 1024, shadowsEnabled: true };
    }
  }

  public setExposure(exposure: number): void {
    this.renderer.toneMappingExposure = exposure;
  }

  public resize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
    this.composer.setSize(width, height);
    this.bloomPass.resolution.set(width, height);
  }

  public render(scene: THREE.Scene, camera: THREE.Camera): void {
    if (this.useComposer) {
      this.composer.render();
    } else {
      this.renderer.render(scene, camera);
    }
  }

  public dispose(): void {
    this.composer.dispose();
    this.renderer.dispose();
  }
}
