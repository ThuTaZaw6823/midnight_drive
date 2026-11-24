import * as THREE from 'three';
import { VehicleTelemetry } from '../physics/VehiclePhysics';
import { VehicleCustomization } from '../settings/SettingsManager';
import { clamp, damp } from '../utils/MathUtils';

interface WindshieldDrop {
  x: number; // 0..1 across windshield canvas
  y: number; // 0..1 top to bottom
  r: number;
  vy: number;
  alpha: number;
}

/**
 * Upgraded First-Person Cockpit Interior for Solstice GT:
 * - Contoured dashboard, air vents, center gear selector, side door panels & ambient LED strips
 * - Rotating steering wheel synced to steering input
 * - Live CanvasTexture instrument cluster (analog tachometer/speedometer, real km/h, gear, fuel, clock)
 * - Live infotainment radio screen displaying active Ambient Radio station & waveform
 * - Functional windshield wipers + live interactive Windshield Raindrop Layer cleared by wiper arcs!
 */
export class VehicleInterior {
  public readonly group = new THREE.Group();

  private readonly steeringWheelPivot = new THREE.Group();
  private readonly leftWiperPivot = new THREE.Group();
  private readonly rightWiperPivot = new THREE.Group();
  private readonly ambientStripMat: THREE.MeshStandardMaterial;
  private readonly cabinGlowLight: THREE.PointLight;

  private readonly dashCanvas: HTMLCanvasElement;
  private readonly dashCtx: CanvasRenderingContext2D;
  private readonly dashTexture: THREE.CanvasTexture;

  private readonly radioCanvas: HTMLCanvasElement;
  private readonly radioCtx: CanvasRenderingContext2D;
  private readonly radioTexture: THREE.CanvasTexture;

  private readonly rainGlassCanvas: HTMLCanvasElement;
  private readonly rainGlassCtx: CanvasRenderingContext2D;
  private readonly rainGlassTex: THREE.CanvasTexture;
  private readonly rainGlassMesh: THREE.Mesh;
  private readonly drops: WindshieldDrop[] = [];

  private wiperPhase = 0;
  private wiperNorm = 0; // 0..1 sweep position
  private smoothedWheelAngle = 0;
  private lastDashRedraw = 0;
  private lastRainRedraw = 0;

  constructor(customization: VehicleCustomization) {
    this.group.name = 'SolsticeGTInterior';

    const leatherMat = new THREE.MeshStandardMaterial({
      color: 0x161a23,
      roughness: 0.72,
      metalness: 0.12,
    });

    const alcantaraMat = new THREE.MeshStandardMaterial({
      color: 0x1d222d,
      roughness: 0.9,
      metalness: 0.05,
    });

    const brushedAlumMat = new THREE.MeshStandardMaterial({
      color: 0x8691a0,
      roughness: 0.28,
      metalness: 0.84,
    });

    this.ambientStripMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(customization.ambientColor),
      emissive: new THREE.Color(customization.ambientColor),
      emissiveIntensity: 2.2,
      roughness: 0.2,
    });

    // 1. Main dashboard shelf, gauge hood & ambient LED trim
    const dashMain = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.24, 0.44), leatherMat);
    dashMain.position.set(0, 0.48, 0.56);
    this.group.add(dashMain);

    const dashTop = new THREE.Mesh(new THREE.BoxGeometry(1.54, 0.05, 0.52), alcantaraMat);
    dashTop.position.set(0, 0.61, 0.60);
    dashTop.rotation.x = 0.06;
    this.group.add(dashTop);

    const binnacle = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.16, 0.24), leatherMat);
    binnacle.position.set(0.36, 0.64, 0.50);
    this.group.add(binnacle);

    const ambientStrip = new THREE.Mesh(new THREE.BoxGeometry(1.46, 0.013, 0.02), this.ambientStripMat);
    ambientStrip.position.set(0, 0.54, 0.34);
    this.group.add(ambientStrip);

    // Side door armrests & door ambient lighting strips
    for (const side of [-1, 1] as const) {
      const doorPanel = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.34, 1.05), leatherMat);
      doorPanel.position.set(side * 0.72, 0.46, 0.05);
      this.group.add(doorPanel);

      const doorGlow = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.012, 0.78), this.ambientStripMat);
      doorGlow.position.set(side * 0.675, 0.55, 0.08);
      this.group.add(doorGlow);
    }

    this.cabinGlowLight = new THREE.PointLight(new THREE.Color(customization.ambientColor), 0.7, 2.2, 2);
    this.cabinGlowLight.position.set(0.1, 0.62, 0.18);
    this.group.add(this.cabinGlowLight);

    // Center console tunnel + brushed aluminum gear selector
    const consoleMesh = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.24, 0.96), leatherMat);
    consoleMesh.position.set(0, 0.32, 0.06);
    this.group.add(consoleMesh);

    const shifterBase = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 0.18), brushedAlumMat);
    shifterBase.position.set(0, 0.445, 0.14);
    this.group.add(shifterBase);

    const shifterKnob = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.015, 0.09, 10), brushedAlumMat);
    shifterKnob.position.set(0, 0.49, 0.14);
    shifterKnob.rotation.x = 0.18;
    this.group.add(shifterKnob);

    // Air vents along dash
    for (const vx of [-0.52, -0.24, 0.14]) {
      const vent = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.045, 0.02), brushedAlumMat);
      vent.position.set(vx, 0.57, 0.34);
      this.group.add(vent);
    }

    // 2. Live Instrument Cluster (CanvasTexture)
    this.dashCanvas = document.createElement('canvas');
    this.dashCanvas.width = 512;
    this.dashCanvas.height = 192;
    this.dashCtx = this.dashCanvas.getContext('2d')!;
    this.dashTexture = new THREE.CanvasTexture(this.dashCanvas);
    this.dashTexture.colorSpace = THREE.SRGBColorSpace;

    const dashScreen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.38, 0.14),
      new THREE.MeshBasicMaterial({ map: this.dashTexture })
    );
    dashScreen.position.set(0.36, 0.615, 0.42);
    dashScreen.rotation.y = Math.PI;
    dashScreen.rotation.x = 0.12;
    this.group.add(dashScreen);

    // 3. Center Infotainment / Radio Screen
    this.radioCanvas = document.createElement('canvas');
    this.radioCanvas.width = 320;
    this.radioCanvas.height = 200;
    this.radioCtx = this.radioCanvas.getContext('2d')!;
    this.radioTexture = new THREE.CanvasTexture(this.radioCanvas);
    this.radioTexture.colorSpace = THREE.SRGBColorSpace;

    const radioBezel = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.18, 0.03), brushedAlumMat);
    radioBezel.position.set(-0.02, 0.57, 0.41);
    radioBezel.rotation.y = -0.16;
    this.group.add(radioBezel);

    const radioScreen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.25, 0.16),
      new THREE.MeshBasicMaterial({ map: this.radioTexture })
    );
    radioScreen.position.set(-0.02, 0.57, 0.393);
    radioScreen.rotation.y = Math.PI - 0.16;
    this.group.add(radioScreen);

    // 4. Rotating Steering Wheel
    this.steeringWheelPivot.position.set(0.36, 0.56, 0.25);
    this.steeringWheelPivot.rotation.x = -0.26;

    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.165, 0.019, 12, 32), leatherMat);
    this.steeringWheelPivot.add(rim);

    const topMarker = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.042, 0.042), this.ambientStripMat);
    topMarker.position.set(0, 0.165, 0);
    this.steeringWheelPivot.add(topMarker);

    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.056, 0.04, 16), leatherMat);
    hub.rotation.x = Math.PI / 2;
    this.steeringWheelPivot.add(hub);

    const hubRing = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.005, 8, 20), brushedAlumMat);
    hubRing.position.z = -0.022;
    this.steeringWheelPivot.add(hubRing);

    for (const angle of [0, Math.PI, -Math.PI / 2]) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.145, 0.026, 0.022), brushedAlumMat);
      spoke.position.set(Math.cos(angle) * 0.085, Math.sin(angle) * 0.085, -0.004);
      spoke.rotation.z = angle;
      this.steeringWheelPivot.add(spoke);
    }

    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.044, 0.22, 12), leatherMat);
    column.rotation.x = Math.PI / 2;
    column.position.set(0, 0, 0.11);
    this.steeringWheelPivot.add(column);

    this.group.add(this.steeringWheelPivot);

    // 5. A-Pillars, Roof Header & Rearview Mirror
    for (const side of [-1, 1] as const) {
      const aPillar = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.56, 0.068), alcantaraMat);
      aPillar.position.set(side * 0.72, 0.80, 0.47);
      aPillar.rotation.x = -0.68;
      aPillar.rotation.z = side * 0.14;
      this.group.add(aPillar);
    }

    const roofHeader = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.055, 0.18), alcantaraMat);
    roofHeader.position.set(0, 0.99, 0.24);
    this.group.add(roofHeader);

    const mirrorStem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.09, 8), leatherMat);
    mirrorStem.position.set(0, 0.94, 0.34);
    this.group.add(mirrorStem);

    const mirrorHousing = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.062, 0.026), leatherMat);
    mirrorHousing.position.set(0, 0.90, 0.34);
    this.group.add(mirrorHousing);

    const mirrorGlass = new THREE.Mesh(
      new THREE.PlaneGeometry(0.22, 0.048),
      new THREE.MeshStandardMaterial({
        color: 0x1a2c47,
        emissive: new THREE.Color(0x0f2036),
        emissiveIntensity: 0.55,
        metalness: 0.94,
        roughness: 0.05,
      })
    );
    mirrorGlass.position.set(0, 0.90, 0.326);
    mirrorGlass.rotation.y = Math.PI;
    this.group.add(mirrorGlass);

    // 6. Animated Windshield Wipers
    const wiperMat = new THREE.MeshStandardMaterial({ color: 0x0d1015, roughness: 0.5, metalness: 0.4 });
    const buildWiper = (pivot: THREE.Group, px: number) => {
      pivot.position.set(px, 0.61, 0.76);
      pivot.rotation.x = -0.66;
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.44, 0.014), wiperMat);
      arm.position.set(0, 0.22, 0);
      pivot.add(arm);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.36, 0.024), wiperMat);
      blade.position.set(0.01, 0.28, -0.01);
      pivot.add(blade);
      pivot.rotation.z = -1.28;
      this.group.add(pivot);
    };

    buildWiper(this.leftWiperPivot, 0.56);
    buildWiper(this.rightWiperPivot, -0.02);

    // 7. Interactive Windshield Raindrop Canvas Layer (visible only inside First-Person during rain!)
    this.rainGlassCanvas = document.createElement('canvas');
    this.rainGlassCanvas.width = 512;
    this.rainGlassCanvas.height = 256;
    this.rainGlassCtx = this.rainGlassCanvas.getContext('2d')!;
    this.rainGlassTex = new THREE.CanvasTexture(this.rainGlassCanvas);

    this.rainGlassMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1.36, 0.64),
      new THREE.MeshBasicMaterial({
        map: this.rainGlassTex,
        transparent: true,
        depthWrite: false,
        opacity: 0.9,
      })
    );
    this.rainGlassMesh.position.set(0, 0.80, 0.55);
    this.rainGlassMesh.rotation.y = Math.PI; // Face toward driver
    this.rainGlassMesh.rotation.x = 0.78; // Match windshield slope
    this.rainGlassMesh.visible = false;
    this.group.add(this.rainGlassMesh);

    this.drawRadioScreen(false, 'MIDNIGHT LO-FI', 'Clear Night');
  }

  public applyCustomization(custom: VehicleCustomization): void {
    this.ambientStripMat.color.set(custom.ambientColor);
    this.ambientStripMat.emissive.set(custom.ambientColor);
    this.cabinGlowLight.color.set(custom.ambientColor);
  }

  public setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  public update(
    dt: number,
    elapsed: number,
    telemetry: VehicleTelemetry,
    opts: {
      headlightsOn: boolean;
      wipersOn: boolean;
      leftIndicatorBlink: boolean;
      rightIndicatorBlink: boolean;
      radioPlaying: boolean;
      radioStationName: string;
      weatherLabel: string;
      rainIntensity: number;
      clockText: string;
    }
  ): void {
    // Smooth steering wheel rotation
    const targetWheelAngle = telemetry.steeringInput * 2.15;
    this.smoothedWheelAngle = damp(this.smoothedWheelAngle, targetWheelAngle, 12, dt);
    this.steeringWheelPivot.rotation.z = -this.smoothedWheelAngle;

    // Windshield wiper sweep animation
    if (opts.wipersOn) {
      this.wiperPhase += dt * (3.2 + opts.rainIntensity * 1.4);
      this.wiperNorm = Math.sin(this.wiperPhase) * 0.5 + 0.5;
      const angle = -1.28 + this.wiperNorm * 1.48;
      this.leftWiperPivot.rotation.z = angle;
      this.rightWiperPivot.rotation.z = angle;
    } else {
      const rest = -1.28;
      this.leftWiperPivot.rotation.z = damp(this.leftWiperPivot.rotation.z, rest, 7, dt);
      this.rightWiperPivot.rotation.z = damp(this.rightWiperPivot.rotation.z, rest, 7, dt);
      this.wiperNorm = damp(this.wiperNorm, 0, 7, dt);
    }

    // Update windshield raindrops & physically clear drops inside the swept wiper arcs!
    this.updateWindshieldDrops(dt, elapsed, opts.rainIntensity, opts.wipersOn, telemetry.speedKmh);

    if (elapsed - this.lastDashRedraw >= 0.05) {
      this.lastDashRedraw = elapsed;
      this.drawInstrumentCluster(telemetry, opts);
      this.drawRadioScreen(opts.radioPlaying, opts.radioStationName, opts.weatherLabel);
    }
  }

  private updateWindshieldDrops(
    dt: number,
    elapsed: number,
    rainIntensity: number,
    wipersOn: boolean,
    speedKmh: number
  ): void {
    const hasRain = rainIntensity > 0.03 || this.drops.length > 0;
    this.rainGlassMesh.visible = hasRain;
    if (!hasRain) return;

    // Spawn new droplets proportional to rain intensity & forward speed
    const spawnBudget = Math.floor(rainIntensity * (7 + speedKmh * 0.06));
    for (let i = 0; i < spawnBudget && this.drops.length < 220; i++) {
      if (Math.random() < 0.45) {
        this.drops.push({
          x: Math.random(),
          y: Math.random() * 0.85,
          r: 1.5 + Math.random() * 3.1,
          vy: 0.04 + Math.random() * 0.14 + (speedKmh / 180) * 0.18,
          alpha: 0.45 + Math.random() * 0.45,
        });
      }
    }

    // Current wiper sweep angle across normalized canvas space (two pivot origins along bottom edge)
    const sweepAngle = Math.PI * 0.14 + this.wiperNorm * Math.PI * 0.68;

    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.y += d.vy * dt;
      d.x += (Math.sin(elapsed * 2 + i) * 0.004) * dt;
      if (rainIntensity < 0.03) d.alpha -= dt * 0.45;

      // Clear droplets crossed by either left or right wiper blade!
      if (wipersOn) {
        let wiped = false;
        for (const pivotX of [0.22, 0.66]) {
          const dx = d.x - pivotX;
          const dy = 1.0 - d.y;
          const dist = Math.hypot(dx, dy);
          if (dist > 0.08 && dist < 0.62) {
            const dropAngle = Math.atan2(dy, dx);
            if (Math.abs(dropAngle - sweepAngle) < 0.16) {
              wiped = true;
              break;
            }
          }
        }
        if (wiped) {
          this.drops.splice(i, 1);
          continue;
        }
      }

      if (d.y > 1.05 || d.alpha <= 0.02) {
        this.drops.splice(i, 1);
      }
    }

    // Redraw windshield glass texture at ~25 Hz
    if (elapsed - this.lastRainRedraw < 0.04) return;
    this.lastRainRedraw = elapsed;

    const ctx = this.rainGlassCtx;
    const W = this.rainGlassCanvas.width;
    const H = this.rainGlassCanvas.height;
    ctx.clearRect(0, 0, W, H);

    for (const d of this.drops) {
      const px = d.x * W;
      const py = d.y * H;

      // Soft droplet streak tail
      ctx.beginPath();
      ctx.moveTo(px, py - d.r * 2.4);
      ctx.lineTo(px, py);
      ctx.strokeStyle = `rgba(180, 212, 245, ${(d.alpha * 0.25).toFixed(2)})`;
      ctx.lineWidth = d.r * 0.8;
      ctx.stroke();

      // Specular glinting bead
      ctx.beginPath();
      ctx.arc(px, py, d.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(215, 234, 255, ${(d.alpha * 0.55).toFixed(2)})`;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(px - d.r * 0.3, py - d.r * 0.3, d.r * 0.35, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${(d.alpha * 0.85).toFixed(2)})`;
      ctx.fill();
    }

    this.rainGlassTex.needsUpdate = true;
  }

  private drawInstrumentCluster(
    telemetry: VehicleTelemetry,
    opts: {
      headlightsOn: boolean;
      leftIndicatorBlink: boolean;
      rightIndicatorBlink: boolean;
      clockText: string;
    }
  ): void {
    const ctx = this.dashCtx;
    const W = this.dashCanvas.width;
    const H = this.dashCanvas.height;

    ctx.fillStyle = '#070b14';
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = 'rgba(130, 168, 255, 0.26)';
    ctx.lineWidth = 2;
    ctx.strokeRect(4, 4, W - 8, H - 8);

    const drawDial = (
      cx: number,
      cy: number,
      radius: number,
      valueNorm: number,
      label: string,
      accent: string
    ) => {
      const startA = Math.PI * 0.78;
      const endA = Math.PI * 2.22;
      const sweep = endA - startA;

      ctx.beginPath();
      ctx.arc(cx, cy, radius, startA, endA);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
      ctx.lineWidth = 10;
      ctx.stroke();

      const valAngle = startA + clamp(valueNorm, 0, 1) * sweep;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, startA, valAngle);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 10;
      ctx.stroke();

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(valAngle);
      ctx.beginPath();
      ctx.moveTo(-8, 0);
      ctx.lineTo(radius - 10, 0);
      ctx.strokeStyle = '#ff9f43';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();

      ctx.beginPath();
      ctx.arc(cx, cy, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#d8e4ff';
      ctx.fill();

      ctx.fillStyle = 'rgba(216, 228, 255, 0.65)';
      ctx.font = '600 13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(label, cx, cy + radius * 0.56);
    };

    drawDial(108, 102, 66, telemetry.transmission.rpm / 7500, 'RPM x1000', '#a980ff');
    drawDial(404, 102, 66, telemetry.speedKmh / 200, 'KM/H', '#63b3ff');

    ctx.fillStyle = '#f2f6ff';
    ctx.font = '700 44px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.round(telemetry.speedKmh)}`, W / 2, 92);

    ctx.fillStyle = '#ffba66';
    ctx.font = '700 22px system-ui, sans-serif';
    ctx.fillText(telemetry.transmission.gear, W / 2, 128);

    ctx.fillStyle = 'rgba(200, 218, 248, 0.72)';
    ctx.font = '500 13px system-ui, sans-serif';
    ctx.fillText(opts.clockText, W / 2, 34);

    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fillRect(W / 2 - 42, 152, 84, 7);
    ctx.fillStyle = '#63b3ff';
    ctx.fillRect(W / 2 - 42, 152, 68, 7);
    ctx.fillStyle = 'rgba(210, 224, 245, 0.55)';
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.fillText('FUEL', W / 2, 174);

    if (opts.leftIndicatorBlink) {
      ctx.fillStyle = '#38d39f';
      ctx.font = '700 22px system-ui, sans-serif';
      ctx.fillText('◀', 196, 40);
    }
    if (opts.rightIndicatorBlink) {
      ctx.fillStyle = '#38d39f';
      ctx.font = '700 22px system-ui, sans-serif';
      ctx.fillText('▶', 316, 40);
    }
    if (opts.headlightsOn) {
      ctx.fillStyle = '#63b3ff';
      ctx.font = '600 13px system-ui, sans-serif';
      ctx.fillText('LIGHTS', W / 2, 52);
    }

    this.dashTexture.needsUpdate = true;
  }

  private drawRadioScreen(playing: boolean, station: string, weatherLabel: string): void {
    const ctx = this.radioCtx;
    const W = this.radioCanvas.width;
    const H = this.radioCanvas.height;

    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, '#0b1224');
    grad.addColorStop(1, '#181330');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.fillText('MIDNIGHT DRIVE RADIO', 20, 30);

    ctx.fillStyle = '#f2f6ff';
    ctx.font = '700 21px system-ui, sans-serif';
    ctx.fillText(station.toUpperCase(), 20, 72);

    ctx.fillStyle = playing ? '#ffba66' : 'rgba(200, 214, 235, 0.5)';
    ctx.font = '600 14px system-ui, sans-serif';
    ctx.fillText(playing ? '● PLAYING · [ / ] CHANGE' : '○ STANDBY · PRESS R', 20, 104);

    for (let i = 0; i < 16; i++) {
      const h = playing ? 10 + Math.abs(Math.sin(performance.now() * 0.004 + i * 0.7)) * 28 : 4;
      ctx.fillStyle = playing ? 'rgba(155, 93, 229, 0.85)' : 'rgba(255, 255, 255, 0.14)';
      ctx.fillRect(20 + i * 17, 162 - h, 10, h);
    }

    ctx.fillStyle = 'rgba(180, 204, 240, 0.72)';
    ctx.font = '500 13px system-ui, sans-serif';
    ctx.fillText(weatherLabel, 20, 186);

    this.radioTexture.needsUpdate = true;
  }
}
