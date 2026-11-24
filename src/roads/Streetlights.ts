import * as THREE from 'three';
import { RoadSpline } from './RoadSpline';
import { createGlowTexture } from '../core/ProceduralTextures';

interface LampData {
  lightPos: THREE.Vector3;
  isTunnel: boolean;
}

/**
 * Warm amber roadside streetlights + tunnel overhead sodium fixtures.
 * Uses instanced poles/bulbs + a dynamic pool of real PointLights attached to
 * the closest lamps around the player so 60 FPS is preserved across the entire 5 km loop.
 */
export class Streetlights {
  public readonly group: THREE.Group;
  private readonly lamps: LampData[] = [];
  private readonly lightPool: THREE.PointLight[] = [];
  private readonly lampMat: THREE.MeshStandardMaterial;
  private readonly haloMat: THREE.SpriteMaterial;
  private intensityScale = 1.0;

  constructor(spline: RoadSpline, poolSize = 6) {
    this.group = new THREE.Group();
    this.group.name = 'Streetlights';

    const envId = spline.envId;
    const isCoolLight = envId === 'midnight-city' || envId === 'rainy-expressway';
    const lampHex = isCoolLight ? 0xd4ecff : 0xffb55a;
    const haloInner = isCoolLight ? 'rgba(205, 236, 255, 0.72)' : 'rgba(255, 224, 168, 0.72)';
    const haloOuter = isCoolLight ? 'rgba(110, 185, 255, 0.0)' : 'rgba(255, 165, 64, 0.0)';

    const samples = spline.samples;
    const poleMatrices: THREE.Matrix4[] = [];
    const armMatrices: THREE.Matrix4[] = [];
    const bulbMatrices: THREE.Matrix4[] = [];

    const dummy = new THREE.Object3D();
    const glowTex = createGlowTexture(haloInner, haloOuter);
    this.haloMat = new THREE.SpriteMaterial({
      map: glowTex,
      color: lampHex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.28,
    });

    const spacing = 14;
    let lastDist = -999;

    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      // Endless Desert keeps wide open starry solitude (lamps only at overlook & rest-area oasis)
      if (envId === 'endless-desert' && s.zone === 'highway') continue;

      const desiredGap =
        s.zone === 'bridge'
          ? 28
          : s.zone === 'tunnel'
          ? 22
          : s.zone === 'rest-area' || s.zone === 'overlook'
          ? 26
          : envId === 'midnight-city'
          ? 34
          : envId === 'rainy-expressway'
          ? 42
          : envId === 'countryside'
          ? 74
          : 58;

      if (s.distance - lastDist < desiredGap) continue;
      lastDist = s.distance;

      const yaw = Math.atan2(s.tangent.x, s.tangent.z);

      if (s.zone === 'tunnel') {
        // Overhead warm ceiling sodium strip inside tunnel
        const ceilingPos = new THREE.Vector3(s.position.x, s.position.y + 6.3, s.position.z);
        dummy.position.copy(ceilingPos);
        dummy.rotation.set(0, yaw, 0);
        dummy.scale.set(1.6, 0.25, 2.2);
        dummy.updateMatrix();
        bulbMatrices.push(dummy.matrix.clone());

        this.lamps.push({ lightPos: ceilingPos.clone().add(new THREE.Vector3(0, -0.5, 0)), isTunnel: true });

        const halo = new THREE.Sprite(this.haloMat);
        halo.position.copy(ceilingPos);
        halo.scale.set(5.5, 5.5, 1);
        this.group.add(halo);
        continue;
      }

      // Double-sided boulevard lamps in Midnight City & bridges
      const sides: Array<-1 | 1> =
        s.zone === 'bridge' || envId === 'midnight-city'
          ? [-1, 1]
          : [i % (spacing * 2) < spacing ? 1 : -1];

      for (const side of sides) {
        const offset = spline.roadHalfWidth + 1.55;
        const baseX = s.position.x + s.right.x * offset * side;
        const baseZ = s.position.z + s.right.z * offset * side;
        const baseY = s.position.y;

        // Vertical tapered pole
        dummy.position.set(baseX, baseY + 3.9, baseZ);
        dummy.rotation.set(0, yaw, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        poleMatrices.push(dummy.matrix.clone());

        // Overhanging curved arm pointing inward over the road
        const inwardX = baseX - s.right.x * 1.15 * side;
        const inwardZ = baseZ - s.right.z * 1.15 * side;
        dummy.position.set(inwardX, baseY + 7.75, inwardZ);
        dummy.rotation.set(0, yaw, 0);
        dummy.scale.set(2.3, 1, 1);
        dummy.updateMatrix();
        armMatrices.push(dummy.matrix.clone());

        // Lamp fixture bulb
        const bulbPos = new THREE.Vector3(
          baseX - s.right.x * 2.15 * side,
          baseY + 7.55,
          baseZ - s.right.z * 2.15 * side
        );
        dummy.position.copy(bulbPos);
        dummy.rotation.set(0, yaw, 0);
        dummy.scale.set(0.65, 0.2, 0.4);
        dummy.updateMatrix();
        bulbMatrices.push(dummy.matrix.clone());

        this.lamps.push({ lightPos: bulbPos.clone().add(new THREE.Vector3(0, -0.4, 0)), isTunnel: false });

        // Subtle warm atmospheric halo around each lamp head
        const halo = new THREE.Sprite(this.haloMat);
        halo.position.copy(bulbPos);
        halo.scale.set(2.4, 2.4, 1);
        this.group.add(halo);
      }
    }

    const poleMat = new THREE.MeshStandardMaterial({
      color: 0x354052,
      roughness: 0.55,
      metalness: 0.7,
    });

    const poleGeo = new THREE.CylinderGeometry(0.08, 0.14, 7.8, 6);
    const poles = new THREE.InstancedMesh(poleGeo, poleMat, poleMatrices.length);
    for (let i = 0; i < poleMatrices.length; i++) poles.setMatrixAt(i, poleMatrices[i]);
    poles.instanceMatrix.needsUpdate = true;

    const armGeo = new THREE.BoxGeometry(1.0, 0.1, 0.1);
    const arms = new THREE.InstancedMesh(armGeo, poleMat, armMatrices.length);
    for (let i = 0; i < armMatrices.length; i++) arms.setMatrixAt(i, armMatrices[i]);
    arms.instanceMatrix.needsUpdate = true;

    const bulbGeo = new THREE.BoxGeometry(1, 1, 1);
    this.lampMat = new THREE.MeshStandardMaterial({
      color: isCoolLight ? 0xe8f6ff : 0xffebc4,
      emissive: new THREE.Color(lampHex),
      emissiveIntensity: 2.0,
      roughness: 0.2,
    });
    const bulbs = new THREE.InstancedMesh(bulbGeo, this.lampMat, bulbMatrices.length);
    for (let i = 0; i < bulbMatrices.length; i++) bulbs.setMatrixAt(i, bulbMatrices[i]);
    bulbs.instanceMatrix.needsUpdate = true;

    this.group.add(poles, arms, bulbs);

    // Pooled dynamic PointLights for realistic light pools on the car hood and wet asphalt
    for (let i = 0; i < poolSize; i++) {
      const pl = new THREE.PointLight(lampHex, 0, 52, 1.35);
      pl.castShadow = false;
      this.group.add(pl);
      this.lightPool.push(pl);
    }
  }

  public setLightingScale(scale: number): void {
    this.intensityScale = scale;
    this.lampMat.emissiveIntensity = 2.0 * Math.max(0.12, scale);
    this.haloMat.opacity = 0.28 * scale;
  }

  /** Assigns the pooled PointLights to the closest streetlights around focusPos (vehicle). */
  public update(focusPos: THREE.Vector3): void {
    const scored: Array<{ idx: number; distSq: number }> = [];
    for (let i = 0; i < this.lamps.length; i++) {
      const d2 = this.lamps[i].lightPos.distanceToSquared(focusPos);
      if (d2 < 110 * 110) {
        scored.push({ idx: i, distSq: d2 });
      }
    }
    scored.sort((a, b) => a.distSq - b.distSq);

    for (let i = 0; i < this.lightPool.length; i++) {
      const light = this.lightPool[i];
      if (i < scored.length) {
        const lamp = this.lamps[scored[i].idx];
        light.position.copy(lamp.lightPos);
        const dist = Math.sqrt(scored[i].distSq);
        const fade = Math.max(0, 1 - dist / 110);
        const baseIntensity = lamp.isTunnel ? 42 : 34;
        light.intensity = baseIntensity * fade * (lamp.isTunnel ? 1.0 : this.intensityScale);
      } else {
        light.intensity = 0;
      }
    }
  }
}
