import * as THREE from 'three';
import { VehicleSpec } from './VehicleConfig';
import { createGlowTexture } from '../core/ProceduralTextures';
import { WheelVisualState } from '../physics/VehiclePhysics';
import { VehicleCustomization, WheelStyle } from '../settings/SettingsManager';

/**
 * Upgraded Solstice GT grand-touring coupe exterior:
 * - Sculpted wide-haunch bodywork, front air intakes, rear diffuser, quad chrome exhausts
 * - Recessed wheel arches, realistic dark-charcoal rubber tires & 3 selectable Garage wheel styles
 * - Tinted reflective cabin glass revealing interior seats/dash, door seams, flush handles & side mirrors
 * - Soft contact shadow beneath chassis, adjustable headlight beams & crimson taillight wash
 */
export class VehicleModel {
  public readonly group = new THREE.Group();
  public readonly wheelPivots: THREE.Group[] = [];
  public readonly wheelMeshes: THREE.Group[] = [];

  private readonly spec: VehicleSpec;
  private readonly bodyPaintMat: THREE.MeshPhysicalMaterial;
  private readonly rimMat: THREE.MeshStandardMaterial;
  private readonly headlightMat: THREE.MeshStandardMaterial;
  private readonly taillightMat: THREE.MeshStandardMaterial;
  private readonly reverseLightMat: THREE.MeshStandardMaterial;
  private readonly leftIndicatorMat: THREE.MeshStandardMaterial;
  private readonly rightIndicatorMat: THREE.MeshStandardMaterial;

  private readonly leftHeadlight: THREE.SpotLight;
  private readonly rightHeadlight: THREE.SpotLight;
  private readonly brakeWashLight: THREE.PointLight;
  private readonly headlightHalos: THREE.Sprite[] = [];
  private readonly taillightHalos: THREE.Sprite[] = [];
  private readonly spokeGroups: THREE.Group[] = [];

  private currentWheelStyle: WheelStyle = 'five-spoke';
  private headlightBrightness = 1.0;

  constructor(spec: VehicleSpec, customization: VehicleCustomization) {
    this.spec = spec;
    this.group.name = 'SolsticeGTExterior';

    // 1. Controlled clearcoat metallic paint (realistic reflections without chrome mirror look)
    this.bodyPaintMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(customization.paintColor),
      metalness: 0.56,
      roughness: 0.24,
      clearcoat: 0.95,
      clearcoatRoughness: 0.1,
    });

    const darkTrimMat = new THREE.MeshStandardMaterial({
      color: 0x141820,
      roughness: 0.56,
      metalness: 0.34,
    });

    const matteWellMat = new THREE.MeshStandardMaterial({
      color: 0x0b0d11,
      roughness: 0.95,
      metalness: 0.04,
    });

    const chromeMat = new THREE.MeshStandardMaterial({
      color: 0xd0d9e6,
      roughness: 0.18,
      metalness: 0.9,
    });

    this.rimMat = new THREE.MeshStandardMaterial({
      color: 0xa6b2c2,
      roughness: 0.24,
      metalness: 0.86,
    });

    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x0b1526,
      metalness: 0.12,
      roughness: 0.06,
      transparent: true,
      opacity: 0.52,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
    });

    const cabinDarkMat = new THREE.MeshStandardMaterial({
      color: 0x161b24,
      roughness: 0.82,
    });

    // 2. Sculpted Lower Body Sill & Wide-Haunch GT Profile (+Z forward, +Y up)
    const lowerShape = new THREE.Shape();
    lowerShape.moveTo(-2.22, -0.02);
    lowerShape.lineTo(-2.27, 0.38);
    lowerShape.quadraticCurveTo(-2.25, 0.58, -1.96, 0.62);
    lowerShape.lineTo(-1.12, 0.66);
    lowerShape.lineTo(0.86, 0.62);
    lowerShape.lineTo(1.90, 0.49);
    lowerShape.quadraticCurveTo(2.26, 0.43, 2.31, 0.14);
    lowerShape.lineTo(2.25, -0.06);
    lowerShape.lineTo(-2.22, -0.02);

    const lowerGeo = new THREE.ExtrudeGeometry(lowerShape, {
      depth: 1.66,
      bevelEnabled: true,
      bevelThickness: 0.13,
      bevelSize: 0.09,
      bevelSegments: 4,
    });
    lowerGeo.translate(0, 0, -0.83);
    lowerGeo.rotateY(-Math.PI / 2);

    const lowerBody = new THREE.Mesh(lowerGeo, this.bodyPaintMat);
    lowerBody.castShadow = true;
    lowerBody.receiveShadow = true;
    this.group.add(lowerBody);

    // Tapered Aerodynamic Cabin Roof & Pillars (narrower than lower fenders like a real Aston/BMW GT!)
    const roofShape = new THREE.Shape();
    roofShape.moveTo(-1.42, 0.60);
    roofShape.quadraticCurveTo(-1.02, 0.97, -0.52, 0.99);
    roofShape.lineTo(0.18, 0.99);
    roofShape.quadraticCurveTo(0.55, 0.94, 0.92, 0.60);
    roofShape.lineTo(-1.42, 0.60);

    const roofGeo = new THREE.ExtrudeGeometry(roofShape, {
      depth: 1.24,
      bevelEnabled: true,
      bevelThickness: 0.09,
      bevelSize: 0.06,
      bevelSegments: 3,
    });
    roofGeo.translate(0, 0, -0.62);
    roofGeo.rotateY(-Math.PI / 2);
    const cabinShell = new THREE.Mesh(roofGeo, this.bodyPaintMat);
    cabinShell.castShadow = true;
    cabinShell.receiveShadow = true;
    this.group.add(cabinShell);

    // Muscular rear quarter haunches & front fender flares
    for (const side of [-1, 1] as const) {
      const rearHaunch = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.34, 1.32), this.bodyPaintMat);
      rearHaunch.position.set(side * 0.89, 0.34, -1.26);
      this.group.add(rearHaunch);

      const frontFender = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.30, 1.18), this.bodyPaintMat);
      frontFender.position.set(side * 0.88, 0.31, 1.34);
      this.group.add(frontFender);

      // Recessed dark wheel-well arch liners
      for (const wz of [spec.wheelbaseHalfZ, -spec.wheelbaseHalfZ]) {
        const well = new THREE.Mesh(new THREE.CylinderGeometry(0.41, 0.41, 0.32, 16), matteWellMat);
        well.rotation.z = Math.PI / 2;
        well.position.set(side * 0.78, 0.06, wz);
        this.group.add(well);
      }

      // Recessed tinted side window + B-pillar divider
      const sideGlass = new THREE.Mesh(new THREE.PlaneGeometry(1.48, 0.30), glassMat);
      sideGlass.position.set(side * 0.725, 0.79, -0.18);
      sideGlass.rotation.y = side * (Math.PI / 2);
      sideGlass.rotation.x = side * -0.14;
      this.group.add(sideGlass);

      // Door seam line & flush chrome handle
      const doorLine = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.44, 0.015), darkTrimMat);
      doorLine.position.set(side * 0.925, 0.36, -0.58);
      this.group.add(doorLine);

      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.032, 0.16), chromeMat);
      handle.position.set(side * 0.935, 0.50, -0.34);
      this.group.add(handle);

      // Sculpted side mirrors with reflective glass face
      const mirrorArm = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.045, 0.07), darkTrimMat);
      mirrorArm.position.set(side * 0.91, 0.66, 0.58);
      this.group.add(mirrorArm);

      const mirrorCap = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.105, 0.13), this.bodyPaintMat);
      mirrorCap.position.set(side * 1.02, 0.69, 0.56);
      this.group.add(mirrorCap);

      const mirrorFace = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.08), chromeMat);
      mirrorFace.position.set(side * 1.02, 0.69, 0.49);
      mirrorFace.rotation.y = Math.PI;
      this.group.add(mirrorFace);
    }

    // Exterior silhouettes of front bolstered seats (subtly visible through tinted cabin glass)
    for (const sx of [-0.36, 0.36]) {
      const seatBack = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.52, 0.12), cabinDarkMat);
      seatBack.position.set(sx, 0.56, -0.38);
      seatBack.rotation.x = -0.18;
      this.group.add(seatBack);

      const headrest = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.18, 0.10), cabinDarkMat);
      headrest.position.set(sx, 0.86, -0.44);
      this.group.add(headrest);
    }

    // Windshield & Fastback Rear Window Glass
    const frontWindshield = new THREE.Mesh(new THREE.PlaneGeometry(1.26, 0.66), glassMat);
    frontWindshield.position.set(0, 0.80, 0.58);
    frontWindshield.rotation.x = -0.82;
    this.group.add(frontWindshield);

    const rearGlass = new THREE.Mesh(new THREE.PlaneGeometry(1.24, 0.78), glassMat);
    rearGlass.position.set(0, 0.83, -0.96);
    rearGlass.rotation.x = -Math.PI * 0.34;
    rearGlass.rotation.y = Math.PI;
    this.group.add(rearGlass);

    // Lower rocker skirts, front bumper splitter & rear aero diffuser with vertical fins
    const lowerChassis = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.14, 4.48), darkTrimMat);
    lowerChassis.position.set(0, -0.05, 0.02);
    lowerChassis.castShadow = true;
    this.group.add(lowerChassis);

    const frontSplitter = new THREE.Mesh(new THREE.BoxGeometry(1.84, 0.05, 0.24), darkTrimMat);
    frontSplitter.position.set(0, -0.08, 2.24);
    this.group.add(frontSplitter);

    const grille = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.23, 0.12), darkTrimMat);
    grille.position.set(0, 0.17, 2.31);
    this.group.add(grille);

    const grilleTrim = new THREE.Mesh(new THREE.BoxGeometry(1.24, 0.035, 0.14), chromeMat);
    grilleTrim.position.set(0, 0.29, 2.31);
    this.group.add(grilleTrim);

    // Side bumper brake-cooling intakes
    for (const side of [-1, 1] as const) {
      const intake = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.16, 0.10), darkTrimMat);
      intake.position.set(side * 0.74, 0.14, 2.27);
      intake.rotation.y = side * 0.18;
      this.group.add(intake);
    }

    // Hood contour power bulge
    const hoodCrease = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.04, 1.12), this.bodyPaintMat);
    hoodCrease.position.set(0, 0.56, 1.38);
    hoodCrease.rotation.x = 0.08;
    this.group.add(hoodCrease);

    // Trunk lip spoiler & rear diffuser with fins + quad exhausts
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.58, 0.045, 0.18), darkTrimMat);
    spoiler.position.set(0, 0.67, -2.08);
    spoiler.rotation.x = 0.14;
    this.group.add(spoiler);

    for (const fx of [-0.22, 0, 0.22]) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.14, 0.22), darkTrimMat);
      fin.position.set(fx, -0.01, -2.23);
      this.group.add(fin);
    }

    for (const ex of [-0.62, -0.46, 0.46, 0.62]) {
      const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.044, 0.20, 12), chromeMat);
      exhaust.rotation.x = Math.PI / 2;
      exhaust.position.set(ex, 0.02, -2.26);
      this.group.add(exhaust);
    }

    // Soft grounded contact shadow right beneath chassis (works across all graphics presets!)
    const shadowTex = createGlowTexture('rgba(0, 0, 0, 0.72)', 'rgba(0, 0, 0, 0)');
    const contactShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(2.55, 5.15),
      new THREE.MeshBasicMaterial({
        map: shadowTex,
        transparent: true,
        depthWrite: false,
        opacity: 0.72,
      })
    );
    contactShadow.rotation.x = -Math.PI / 2;
    contactShadow.position.set(0, -0.34, 0);
    this.group.add(contactShadow);

    // 3. Emissive Lighting Clusters
    this.headlightMat = new THREE.MeshStandardMaterial({
      color: 0xeaf4ff,
      emissive: new THREE.Color(0xdbeeff),
      emissiveIntensity: 3.4,
      roughness: 0.1,
    });

    this.taillightMat = new THREE.MeshStandardMaterial({
      color: 0xff2a35,
      emissive: new THREE.Color(0xff1420),
      emissiveIntensity: 2.5,
      roughness: 0.15,
    });

    this.reverseLightMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.0,
      roughness: 0.15,
    });

    this.leftIndicatorMat = new THREE.MeshStandardMaterial({
      color: 0xffa822,
      emissive: new THREE.Color(0xff8c00),
      emissiveIntensity: 0.0,
      roughness: 0.2,
    });

    this.rightIndicatorMat = new THREE.MeshStandardMaterial({
      color: 0xffa822,
      emissive: new THREE.Color(0xff8c00),
      emissiveIntensity: 0.0,
      roughness: 0.2,
    });

    const headHaloTex = createGlowTexture('rgba(225, 240, 255, 0.85)', 'rgba(130, 185, 255, 0)');
    const tailHaloTex = createGlowTexture('rgba(255, 45, 55, 0.85)', 'rgba(255, 16, 28, 0)');

    for (const side of [-1, 1] as const) {
      const headHousing = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.10, 0.12), this.headlightMat);
      headHousing.position.set(side * 0.66, 0.34, 2.29);
      headHousing.rotation.y = side * 0.15;
      this.group.add(headHousing);

      const hHalo = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: headHaloTex,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          opacity: 0.56,
        })
      );
      hHalo.position.set(side * 0.68, 0.34, 2.41);
      hHalo.scale.set(1.25, 0.88, 1);
      this.group.add(hHalo);
      this.headlightHalos.push(hHalo);

      const tailHousing = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.10, 0.08), this.taillightMat);
      tailHousing.position.set(side * 0.62, 0.44, -2.26);
      this.group.add(tailHousing);

      const tHalo = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: tailHaloTex,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          opacity: 0.36,
        })
      );
      tHalo.position.set(side * 0.64, 0.44, -2.35);
      tHalo.scale.set(0.9, 0.56, 1);
      this.group.add(tHalo);
      this.taillightHalos.push(tHalo);

      const revLens = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.08), this.reverseLightMat);
      revLens.position.set(side * 0.34, 0.36, -2.27);
      this.group.add(revLens);

      const indMat = side === 1 ? this.leftIndicatorMat : this.rightIndicatorMat;
      const frontInd = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.055, 0.10), indMat);
      frontInd.position.set(side * 0.85, 0.31, 2.25);
      this.group.add(frontInd);

      const rearInd = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.055, 0.09), indMat);
      rearInd.position.set(side * 0.83, 0.37, -2.26);
      this.group.add(rearInd);
    }

    const lightBar = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.042, 0.06), this.taillightMat);
    lightBar.position.set(0, 0.44, -2.26);
    this.group.add(lightBar);

    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(0.44, 0.11, 0.04),
      new THREE.MeshStandardMaterial({
        color: 0xdbe6f6,
        emissive: new THREE.Color(0x6d93c8),
        emissiveIntensity: 0.75,
      })
    );
    plate.position.set(0, 0.24, -2.27);
    this.group.add(plate);

    // 4. Dual Headlight SpotLights + Crimson Wet-Road Taillight Reflection Wash
    this.leftHeadlight = this.createHeadlightBeam(0.64, 0.40, 2.26, 0.16);
    this.rightHeadlight = this.createHeadlightBeam(-0.64, 0.40, 2.26, -0.16);
    this.group.add(this.leftHeadlight, this.leftHeadlight.target);
    this.group.add(this.rightHeadlight, this.rightHeadlight.target);

    this.brakeWashLight = new THREE.PointLight(0xff1c2b, 3.8, 13, 1.5);
    this.brakeWashLight.position.set(0, 0.34, -2.75);
    this.group.add(this.brakeWashLight);

    // 5. Build 4 Wheels with Realistic Rubber Tires & Swappable Rim Designs
    this.buildWheels(spec);
    this.applyCustomization(customization);
  }

  private createHeadlightBeam(x: number, y: number, z: number, aimX: number): THREE.SpotLight {
    const light = new THREE.SpotLight(0xe4f2ff, 235, 160, Math.PI * 0.33, 0.62, 1.12);
    light.position.set(x, y, z);
    light.castShadow = false;
    const target = new THREE.Object3D();
    target.position.set(x + aimX * 14, -1.8, z + 42);
    light.target = target;
    return light;
  }

  private buildWheels(spec: VehicleSpec): void {
    // Realistic matte dark-charcoal rubber (not pure black plastic)
    const tireMat = new THREE.MeshStandardMaterial({
      color: 0x1d2128,
      roughness: 0.88,
      metalness: 0.05,
    });
    const barrelMat = new THREE.MeshStandardMaterial({
      color: 0x262c36,
      roughness: 0.45,
      metalness: 0.68,
    });
    const caliperMat = new THREE.MeshStandardMaterial({
      color: 0xb82936,
      roughness: 0.38,
      metalness: 0.45,
    });

    const r = spec.wheelRadius;
    const w = spec.wheelWidth;

    const tireGeo = new THREE.CylinderGeometry(r, r, w, 26);
    tireGeo.rotateZ(Math.PI / 2);

    const barrelGeo = new THREE.CylinderGeometry(r * 0.68, r * 0.68, w + 0.012, 20);
    barrelGeo.rotateZ(Math.PI / 2);

    for (let i = 0; i < 4; i++) {
      const pivot = new THREE.Group();
      const spinGroup = new THREE.Group();

      const tire = new THREE.Mesh(tireGeo, tireMat);
      tire.castShadow = true;
      spinGroup.add(tire);

      const barrel = new THREE.Mesh(barrelGeo, barrelMat);
      spinGroup.add(barrel);

      const spokes = new THREE.Group();
      spinGroup.add(spokes);
      this.spokeGroups.push(spokes);

      const caliper = new THREE.Mesh(new THREE.BoxGeometry(w * 0.55, 0.14, 0.10), caliperMat);
      caliper.position.set(0, 0.06, -r * 0.36);
      pivot.add(caliper);

      pivot.add(spinGroup);
      this.group.add(pivot);
      this.wheelPivots.push(pivot);
      this.wheelMeshes.push(spinGroup);
    }

    this.rebuildWheelSpokes(this.currentWheelStyle);
  }

  private rebuildWheelSpokes(style: WheelStyle): void {
    this.currentWheelStyle = style;
    const r = this.spec.wheelRadius;
    const w = this.spec.wheelWidth;

    for (const group of this.spokeGroups) {
      while (group.children.length > 0) {
        const child = group.children[0] as THREE.Mesh;
        child.geometry.dispose();
        group.remove(child);
      }

      // Center hub cap
      const capGeo = new THREE.CylinderGeometry(r * 0.18, r * 0.18, w + 0.032, 12);
      capGeo.rotateZ(Math.PI / 2);
      group.add(new THREE.Mesh(capGeo, this.rimMat));

      if (style === 'five-spoke') {
        const spokeGeo = new THREE.BoxGeometry(w + 0.024, r * 1.26, 0.048);
        for (let s = 0; s < 5; s++) {
          const m = new THREE.Mesh(spokeGeo.clone(), this.rimMat);
          m.rotation.x = (s / 5) * Math.PI;
          group.add(m);
        }
        spokeGeo.dispose();
      } else if (style === 'multi-mesh') {
        const spokeGeo = new THREE.BoxGeometry(w + 0.024, r * 1.28, 0.026);
        for (let s = 0; s < 10; s++) {
          const m = new THREE.Mesh(spokeGeo.clone(), this.rimMat);
          m.rotation.x = (s / 10) * Math.PI;
          group.add(m);
        }
        spokeGeo.dispose();
      } else {
        // Deep-dish turbine blades
        const bladeGeo = new THREE.BoxGeometry(w + 0.026, r * 1.24, 0.068);
        for (let s = 0; s < 7; s++) {
          const m = new THREE.Mesh(bladeGeo.clone(), this.rimMat);
          m.rotation.x = (s / 7) * Math.PI;
          m.rotation.y = 0.18;
          group.add(m);
        }
        bladeGeo.dispose();
      }
    }
  }

  public setHeadlightBrightness(multiplier: number): void {
    this.headlightBrightness = multiplier;
  }

  public applyCustomization(custom: VehicleCustomization): void {
    this.bodyPaintMat.color.set(custom.paintColor);

    const headColor =
      custom.headlightTint === 'warm-halogen'
        ? 0xffe4b8
        : custom.headlightTint === 'ice-blue'
        ? 0xc2e2ff
        : 0xe6f2ff;

    this.leftHeadlight.color.setHex(headColor);
    this.rightHeadlight.color.setHex(headColor);
    this.headlightMat.emissive.setHex(headColor);

    if (custom.wheelStyle && custom.wheelStyle !== this.currentWheelStyle) {
      this.rebuildWheelSpokes(custom.wheelStyle);
    }
  }

  public syncWheels(wheelStates: WheelVisualState[]): void {
    for (let i = 0; i < 4; i++) {
      const ws = wheelStates[i];
      const pivot = this.wheelPivots[i];
      const spinMesh = this.wheelMeshes[i];

      pivot.position.set(
        ws.connectionLocal.x,
        ws.connectionLocal.y - ws.suspensionLength,
        ws.connectionLocal.z
      );
      pivot.rotation.y = ws.steeringAngle;
      spinMesh.rotation.x = ws.spinAngle;
    }
  }

  public updateLights(opts: {
    headlightsOn: boolean;
    braking: boolean;
    reversing: boolean;
    leftIndicatorBlink: boolean;
    rightIndicatorBlink: boolean;
  }): void {
    const hIntensity = opts.headlightsOn ? 235 * this.headlightBrightness : 0;
    this.leftHeadlight.intensity = hIntensity;
    this.rightHeadlight.intensity = hIntensity;
    this.headlightMat.emissiveIntensity = opts.headlightsOn ? 3.2 * this.headlightBrightness : 0.15;
    for (const h of this.headlightHalos) {
      h.visible = opts.headlightsOn;
    }

    const tailIntensity = opts.braking ? 5.2 : opts.headlightsOn ? 2.4 : 0.45;
    this.taillightMat.emissiveIntensity = tailIntensity;
    this.brakeWashLight.intensity = opts.braking ? 10.5 : opts.headlightsOn ? 3.2 : 0.4;
    for (const t of this.taillightHalos) {
      const sc = opts.braking ? 1.15 : 0.82;
      t.scale.set(sc, sc * 0.58, 1);
      (t.material as THREE.SpriteMaterial).opacity = opts.braking ? 0.65 : opts.headlightsOn ? 0.34 : 0.1;
    }

    this.reverseLightMat.emissiveIntensity = opts.reversing ? 4.5 : 0.0;
    this.leftIndicatorMat.emissiveIntensity = opts.leftIndicatorBlink ? 4.8 : 0.0;
    this.rightIndicatorMat.emissiveIntensity = opts.rightIndicatorBlink ? 4.8 : 0.0;
  }
}
