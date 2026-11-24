import * as THREE from 'three';
import { Vehicle } from '../vehicles/Vehicle';
import { CameraMode } from '../settings/SettingsManager';
import { BuiltTerrain } from '../terrain/TerrainGenerator';
import { RoadSpline } from '../roads/RoadSpline';
import { clamp, damp } from '../utils/MathUtils';

const CAMERA_CYCLE: CameraMode[] = ['third-person', 'first-person', 'hood', 'cinematic'];

export interface PhotoMoveInput {
  forward: number;
  right: number;
  up: number;
  boost: boolean;
}

/**
 * Upgraded Camera Controller:
 * - Third-Person Chase with adjustable distance (mouse wheel), smooth cornering swing & terrain/tunnel collision checks
 * - First-Person Cockpit with mouse-look around interior, recenter (V), and subtle weight-transfer inertia
 * - Hood Cam & Cinematic Cam
 * - Garage Showcase Orbit Cam (interactive studio inspection)
 * - Free-Flying Photo Mode Cam with mouse orbit, WASD+QE movement, and adjustable FOV
 */
export class CameraController {
  public readonly camera: THREE.PerspectiveCamera;
  public mode: CameraMode;
  public chaseDistance = 6.2;

  // First-person cockpit mouse-look offsets (radians)
  private fpYaw = 0;
  private fpPitch = 0;
  private fpYawTarget = 0;
  private fpPitchTarget = 0;

  // Garage interactive orbit
  private garageOrbitAngle = -0.65;
  private garageOrbitPitch = 0.24;

  // Photo Mode free camera state
  private photoPos = new THREE.Vector3();
  private photoYaw = 0;
  private photoPitch = 0;
  public photoFov = 54;

  private isDragging = false;
  private lastMouseX = 0;
  private lastMouseY = 0;
  private activeContext: 'menu' | 'garage' | 'driving' | 'photo' = 'menu';

  private readonly currentPos = new THREE.Vector3();
  private readonly currentLook = new THREE.Vector3();
  private initialized = false;
  private cinematicTimer = 0;
  private cinematicShotIndex = 0;

  private readonly tmpPos = new THREE.Vector3();
  private readonly tmpQuat = new THREE.Quaternion();
  private readonly tmpForward = new THREE.Vector3();
  private readonly tmpRight = new THREE.Vector3();
  private readonly tmpUp = new THREE.Vector3();
  private readonly targetPos = new THREE.Vector3();
  private readonly targetLook = new THREE.Vector3();

  private onChaseDistanceChange?: (dist: number) => void;

  constructor(
    aspect: number,
    initialMode: CameraMode = 'third-person',
    initialChaseDist = 6.2,
    canvas?: HTMLCanvasElement,
    onChaseDistanceChange?: (dist: number) => void
  ) {
    this.camera = new THREE.PerspectiveCamera(60, aspect, 0.12, 2800);
    this.mode = initialMode;
    this.chaseDistance = clamp(initialChaseDist, 4.6, 9.5);
    this.onChaseDistanceChange = onChaseDistanceChange;

    if (canvas) {
      this.bindMouseControls(canvas);
    }
  }

  private bindMouseControls(canvas: HTMLCanvasElement): void {
    canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      this.isDragging = true;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
    });

    window.addEventListener('mouseup', () => {
      this.isDragging = false;
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      const dx = e.clientX - this.lastMouseX;
      const dy = e.clientY - this.lastMouseY;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;

      if (this.activeContext === 'driving' && this.mode === 'first-person') {
        this.fpYawTarget = clamp(this.fpYawTarget - dx * 0.0042, -1.12, 1.12);
        this.fpPitchTarget = clamp(this.fpPitchTarget - dy * 0.0032, -0.32, 0.36);
      } else if (this.activeContext === 'photo') {
        this.photoYaw -= dx * 0.0045;
        this.photoPitch = clamp(this.photoPitch - dy * 0.004, -1.35, 1.35);
      } else if (this.activeContext === 'garage') {
        this.garageOrbitAngle -= dx * 0.006;
        this.garageOrbitPitch = clamp(this.garageOrbitPitch + dy * 0.004, 0.08, 0.65);
      }
    });

    canvas.addEventListener('dblclick', () => {
      if (this.activeContext === 'driving' && this.mode === 'first-person') {
        this.recenterFirstPerson();
      }
    });

    canvas.addEventListener(
      'wheel',
      (e) => {
        if (this.activeContext === 'driving' && this.mode === 'third-person') {
          this.chaseDistance = clamp(this.chaseDistance + e.deltaY * 0.003, 4.6, 9.5);
          this.onChaseDistanceChange?.(this.chaseDistance);
        } else if (this.activeContext === 'photo') {
          this.photoFov = clamp(this.photoFov + e.deltaY * 0.025, 24, 92);
        }
      },
      { passive: true }
    );
  }

  public setContext(ctx: 'menu' | 'garage' | 'driving' | 'photo'): void {
    this.activeContext = ctx;
  }

  public setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  public setMode(mode: CameraMode): void {
    this.mode = mode;
    this.recenterFirstPerson();
    if (mode === 'first-person' || mode === 'hood') {
      this.initialized = false;
    }
  }

  public recenterFirstPerson(): void {
    this.fpYawTarget = 0;
    this.fpPitchTarget = 0;
  }

  public cycleMode(): CameraMode {
    const idx = CAMERA_CYCLE.indexOf(this.mode);
    const next = CAMERA_CYCLE[(idx + 1) % CAMERA_CYCLE.length];
    this.setMode(next);
    return next;
  }

  public enterPhotoMode(): void {
    this.activeContext = 'photo';
    this.photoPos.copy(this.camera.position);
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    this.photoYaw = Math.atan2(dir.x, dir.z);
    this.photoPitch = Math.asin(clamp(dir.y, -0.95, 0.95));
    this.photoFov = clamp(this.camera.fov, 32, 85);
  }

  public updatePhotoMode(dt: number, move: PhotoMoveInput, terrain: BuiltTerrain): void {
    const speed = (move.boost ? 28 : 11) * dt;
    const forward = new THREE.Vector3(
      Math.sin(this.photoYaw) * Math.cos(this.photoPitch),
      Math.sin(this.photoPitch),
      Math.cos(this.photoYaw) * Math.cos(this.photoPitch)
    ).normalize();
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

    this.photoPos.addScaledVector(forward, move.forward * speed);
    this.photoPos.addScaledVector(right, move.right * speed);
    this.photoPos.y += move.up * speed;

    this.clampAboveTerrain(this.photoPos, terrain, 0.85);

    this.camera.up.set(0, 1, 0);
    this.camera.fov = damp(this.camera.fov, this.photoFov, 10, dt);
    this.camera.updateProjectionMatrix();
    this.camera.position.copy(this.photoPos);
    this.camera.lookAt(this.photoPos.clone().add(forward));
  }

  public snapToVehicle(vehicle: Vehicle, terrain: BuiltTerrain, spline?: RoadSpline): void {
    this.initialized = false;
    this.updateDriving(1 / 60, 0, vehicle, terrain, spline);
  }

  /**
   * Animated overlook orbit for Main Menu, tightening into a studio inspection orbit in Garage.
   */
  public updateMenuOrbit(
    dt: number,
    elapsed: number,
    vehicle: Vehicle,
    terrain: BuiltTerrain,
    garageFocus: boolean
  ): void {
    this.activeContext = garageFocus ? 'garage' : 'menu';
    vehicle.physics.getPosition(this.tmpPos);

    if (garageFocus && !this.isDragging) {
      this.garageOrbitAngle += dt * 0.28;
    }

    const angle = garageFocus ? this.garageOrbitAngle : elapsed * 0.14 - 0.85;
    const radius = garageFocus ? 5.15 : 6.9 + Math.sin(elapsed * 0.25) * 0.55;
    const height = garageFocus
      ? 1.05 + Math.sin(this.garageOrbitPitch) * 2.2
      : 1.85 + Math.sin(elapsed * 0.2) * 0.28;

    this.targetPos.set(
      this.tmpPos.x + Math.sin(angle) * radius,
      this.tmpPos.y + height,
      this.tmpPos.z + Math.cos(angle) * radius
    );
    this.clampAboveTerrain(this.targetPos, terrain, 1.15);

    this.targetLook.set(this.tmpPos.x, this.tmpPos.y + (garageFocus ? 0.56 : 0.72), this.tmpPos.z);

    if (!this.initialized) {
      this.currentPos.copy(this.targetPos);
      this.currentLook.copy(this.targetLook);
      this.initialized = true;
    } else {
      const rate = garageFocus ? 6.5 : 3.5;
      this.currentPos.x = damp(this.currentPos.x, this.targetPos.x, rate, dt);
      this.currentPos.y = damp(this.currentPos.y, this.targetPos.y, rate, dt);
      this.currentPos.z = damp(this.currentPos.z, this.targetPos.z, rate, dt);
      this.currentLook.lerp(this.targetLook, 1 - Math.exp(-5.5 * dt));
    }

    this.camera.up.set(0, 1, 0);
    this.camera.fov = damp(this.camera.fov, garageFocus ? 44 : 52, 5, dt);
    this.camera.updateProjectionMatrix();
    this.camera.position.copy(this.currentPos);
    this.camera.lookAt(this.currentLook);
  }

  public updateDriving(
    dt: number,
    elapsed: number,
    vehicle: Vehicle,
    terrain: BuiltTerrain,
    spline?: RoadSpline
  ): void {
    this.activeContext = 'driving';
    vehicle.physics.getPosition(this.tmpPos);
    vehicle.physics.getQuaternion(this.tmpQuat);
    this.tmpForward.set(0, 0, 1).applyQuaternion(this.tmpQuat).normalize();
    this.tmpRight.set(-1, 0, 0).applyQuaternion(this.tmpQuat).normalize();
    this.tmpUp.set(0, 1, 0).applyQuaternion(this.tmpQuat).normalize();

    const speedRatio = Math.min(1, vehicle.telemetry.speedKmh / 180);

    if (this.mode === 'first-person') {
      // Smooth cockpit mouse-look + subtle longitudinal acceleration/braking & cornering head inertia
      this.fpYaw = damp(this.fpYaw, this.fpYawTarget, 10, dt);
      this.fpPitch = damp(this.fpPitch, this.fpPitchTarget, 10, dt);

      const accelLagZ = clamp(-vehicle.telemetry.longitudinalAccel * 0.0045, -0.032, 0.036);
      const cornerSwayX = clamp(vehicle.telemetry.steeringInput * 0.032, -0.035, 0.035);

      // Keep head safely inside driver cabin bounds (never clips dashboard, roof, or A-pillars)
      const localEye = new THREE.Vector3(0.36 + cornerSwayX, 0.785, -0.14 + accelLagZ);
      localEye.applyQuaternion(this.tmpQuat).add(this.tmpPos);

      // Compute forward look direction rotated by cockpit mouse-look angles in car space
      const lookYaw = this.fpYaw + vehicle.telemetry.steeringInput * 0.055;
      const lookPitch = this.fpPitch - 0.045 - clamp(vehicle.telemetry.longitudinalAccel * 0.003, -0.025, 0.025);
      const localDir = new THREE.Vector3(
        Math.sin(lookYaw) * Math.cos(lookPitch),
        Math.sin(lookPitch),
        Math.cos(lookYaw) * Math.cos(lookPitch)
      )
        .normalize()
        .multiplyScalar(14);
      const localTarget = localDir.add(new THREE.Vector3(0.36, 0.785, -0.14)).applyQuaternion(this.tmpQuat).add(this.tmpPos);

      this.camera.fov = damp(this.camera.fov, 68 + speedRatio * 5.5, 6, dt);
      this.camera.updateProjectionMatrix();
      this.camera.position.copy(localEye);
      this.camera.up.copy(this.tmpUp).lerp(new THREE.Vector3(0, 1, 0), 0.76).normalize();
      this.camera.lookAt(localTarget);
      this.currentPos.copy(localEye);
      this.currentLook.copy(localTarget);
      this.initialized = true;
      return;
    }

    this.camera.up.set(0, 1, 0);

    if (this.mode === 'hood') {
      const hoodEye = new THREE.Vector3(0, 0.87, 0.94).applyQuaternion(this.tmpQuat).add(this.tmpPos);
      const hoodLook = new THREE.Vector3(0, 0.68, 22.0).applyQuaternion(this.tmpQuat).add(this.tmpPos);
      this.camera.fov = damp(this.camera.fov, 64 + speedRatio * 6, 6, dt);
      this.camera.updateProjectionMatrix();
      this.camera.position.copy(hoodEye);
      this.camera.lookAt(hoodLook);
      this.currentPos.copy(hoodEye);
      this.currentLook.copy(hoodLook);
      this.initialized = true;
      return;
    }

    if (this.mode === 'third-person') {
      const followDist = this.chaseDistance + speedRatio * 1.25;
      const followHeight = 1.95 + (this.chaseDistance - 6.2) * 0.18 + speedRatio * 0.22;
      const lateralSwing = -vehicle.telemetry.steeringInput * 0.72;

      const flatForward = new THREE.Vector3(this.tmpForward.x, this.tmpForward.y * 0.3, this.tmpForward.z).normalize();

      this.targetPos
        .copy(this.tmpPos)
        .addScaledVector(flatForward, -followDist)
        .addScaledVector(this.tmpRight, lateralSwing);
      this.targetPos.y += followHeight;

      // Tunnel ceiling clearance + terrain collision clearance between car and chase camera
      this.enforceChaseClearance(this.tmpPos, this.targetPos, terrain, spline);

      // Frame vehicle comfortably in the lower-middle of the viewport with clear road view ahead
      this.targetLook
        .copy(this.tmpPos)
        .addScaledVector(flatForward, 10.5)
        .add(new THREE.Vector3(0, 1.05, 0));

      const posLambda = 7.2;
      const lookLambda = 10.5;

      if (!this.initialized) {
        this.currentPos.copy(this.targetPos);
        this.currentLook.copy(this.targetLook);
        this.initialized = true;
      } else {
        this.currentPos.x = damp(this.currentPos.x, this.targetPos.x, posLambda, dt);
        this.currentPos.y = damp(this.currentPos.y, this.targetPos.y, posLambda * 0.88, dt);
        this.currentPos.z = damp(this.currentPos.z, this.targetPos.z, posLambda, dt);

        this.currentLook.x = damp(this.currentLook.x, this.targetLook.x, lookLambda, dt);
        this.currentLook.y = damp(this.currentLook.y, this.targetLook.y, lookLambda, dt);
        this.currentLook.z = damp(this.currentLook.z, this.targetLook.z, lookLambda, dt);
      }

      this.camera.fov = damp(this.camera.fov, 57 + speedRatio * 8.5, 5, dt);
      this.camera.updateProjectionMatrix();
      this.camera.position.copy(this.currentPos);
      this.camera.lookAt(this.currentLook);
      return;
    }

    // Cinematic Mode
    this.cinematicTimer += dt;
    if (this.cinematicTimer > 9.0) {
      this.cinematicTimer = 0;
      this.cinematicShotIndex = (this.cinematicShotIndex + 1) % 3;
    }

    const drift = Math.sin(elapsed * 0.32) * 1.4;
    if (this.cinematicShotIndex === 0) {
      this.targetPos
        .copy(this.tmpPos)
        .addScaledVector(this.tmpForward, -7.2)
        .addScaledVector(this.tmpRight, 3.6 + drift);
      this.targetPos.y += 1.65;
    } else if (this.cinematicShotIndex === 1) {
      this.targetPos
        .copy(this.tmpPos)
        .addScaledVector(this.tmpForward, -11.5)
        .addScaledVector(this.tmpRight, -5.2 + drift);
      this.targetPos.y += 5.4;
    } else {
      this.targetPos
        .copy(this.tmpPos)
        .addScaledVector(this.tmpForward, 8.2)
        .addScaledVector(this.tmpRight, 2.8 + drift * 0.6);
      this.targetPos.y += 1.75;
    }

    this.enforceChaseClearance(this.tmpPos, this.targetPos, terrain, spline);
    this.targetLook.copy(this.tmpPos).add(new THREE.Vector3(0, 0.78, 0));

    if (!this.initialized) {
      this.currentPos.copy(this.targetPos);
      this.currentLook.copy(this.targetLook);
      this.initialized = true;
    } else {
      this.currentPos.x = damp(this.currentPos.x, this.targetPos.x, 3.2, dt);
      this.currentPos.y = damp(this.currentPos.y, this.targetPos.y, 3.2, dt);
      this.currentPos.z = damp(this.currentPos.z, this.targetPos.z, 3.2, dt);
      this.currentLook.lerp(this.targetLook, 1 - Math.exp(-6 * dt));
    }

    this.camera.fov = damp(this.camera.fov, 50, 4, dt);
    this.camera.updateProjectionMatrix();
    this.camera.position.copy(this.currentPos);
    this.camera.lookAt(this.currentLook);
  }

  /**
   * Samples terrain elevation along the segment from car -> camera and caps camera height inside tunnels
   * so mountains and tunnel roofs never clip the camera view.
   */
  private enforceChaseClearance(
    carPos: THREE.Vector3,
    camPos: THREE.Vector3,
    terrain: BuiltTerrain,
    spline?: RoadSpline
  ): void {
    // Check midpoint & endpoint against mountain slopes
    for (const frac of [0.55, 0.8, 1.0]) {
      const sx = carPos.x + (camPos.x - carPos.x) * frac;
      const sz = carPos.z + (camPos.z - carPos.z) * frac;
      const groundY = Math.max(0, terrain.getHeightAt(sx, sz));
      if (camPos.y < groundY + 1.35) {
        camPos.y = groundY + 1.35;
      }
    }

    // Inside rock tunnel, keep chase camera gracefully beneath the vaulted ceiling
    if (spline) {
      const closest = spline.findClosest(camPos.x, camPos.z, 1);
      if (closest && closest.sample.zone === 'tunnel') {
        const maxTunnelY = closest.sample.position.y + 3.4;
        if (camPos.y > maxTunnelY) camPos.y = maxTunnelY;
      }
    }
  }

  private clampAboveTerrain(pos: THREE.Vector3, terrain: BuiltTerrain, minClearance: number): void {
    const groundY = Math.max(0, terrain.getHeightAt(pos.x, pos.z));
    if (pos.y < groundY + minClearance) {
      pos.y = groundY + minClearance;
    }
  }
}
