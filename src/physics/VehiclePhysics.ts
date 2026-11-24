import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { PhysicsWorld } from './PhysicsWorld';
import { computeAutomaticTransmission, TransmissionState, VehicleSpec } from '../vehicles/VehicleConfig';
import { RoadSpline } from '../roads/RoadSpline';
import { getEnvironmentById } from '../world/EnvironmentConfig';
import { clamp, damp, lerp, wrapAngle } from '../utils/MathUtils';

export interface DrivingInput {
  throttle: number; // 0..1
  brake: number; // 0..1
  steer: number; // -1 (right) .. +1 (left)
  handbrake: boolean;
}

export interface WheelVisualState {
  connectionLocal: THREE.Vector3;
  suspensionLength: number;
  steeringAngle: number;
  spinAngle: number;
  inContact: boolean;
}

export interface VehicleTelemetry {
  speedKmh: number;
  signedSpeedKmh: number;
  longitudinalAccel: number; // m/s^2 for subtle cockpit weight-transfer inertia
  transmission: TransmissionState;
  steeringAngle: number;
  steeringInput: number;
  throttle: number;
  braking: boolean;
  reversing: boolean;
  groundedWheels: number;
  autopilotActive: boolean;
  autopilotTargetKmh: 30 | 50 | 70 | 90;
}

/**
 * Rapier3D DynamicRayCastVehicleController wrapper tuned for realistic, relaxing
 * grand-touring driving: smooth acceleration, progressive speed-sensitive steering,
 * automatic transmission, anti-roll stability, and seamless spline Autopilot.
 */
export class VehiclePhysics {
  public readonly body: RAPIER.RigidBody;
  public readonly controller: RAPIER.DynamicRayCastVehicleController;
  public readonly spec: VehicleSpec;

  public readonly wheelStates: WheelVisualState[] = [];
  private smoothedSteer = 0;
  private smoothedThrottle = 0;
  private prevForwardSpeedMs = 0;
  private smoothedAccel = 0;
  private reversing = false;
  private autopilotActive = false;
  private autopilotTargetKmh: 30 | 50 | 70 | 90 = 70;

  private readonly tmpPos = new THREE.Vector3();
  private readonly tmpQuat = new THREE.Quaternion();
  private readonly tmpForward = new THREE.Vector3();
  private readonly tmpRight = new THREE.Vector3();
  private readonly tmpUp = new THREE.Vector3();
  private readonly tmpVel = new THREE.Vector3();

  constructor(physics: PhysicsWorld, spec: VehicleSpec, spawnPos: THREE.Vector3, spawnYaw: number) {
    this.spec = spec;

    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), spawnYaw);
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(spawnPos.x, spawnPos.y, spawnPos.z)
      .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
      .setLinearDamping(0.06)
      .setAngularDamping(1.15)
      .setCanSleep(false);

    this.body = physics.world.createRigidBody(bodyDesc);

    // Very low center of mass box collider for planted, flip-proof grand-touring dynamics
    const [hx, hy, hz] = spec.chassisHalfExtents;
    const colliderDesc = RAPIER.ColliderDesc.cuboid(hx, hy, hz)
      .setTranslation(0, 0.08, 0)
      .setMass(spec.massKg)
      .setFriction(0.22)
      .setRestitution(0.02);
    physics.world.createCollider(colliderDesc, this.body);

    this.controller = physics.world.createVehicleController(this.body);
    this.controller.indexUpAxis = 1;
    this.controller.setIndexForwardAxis = 2;

    // 4 wheels: 0 = FL, 1 = FR, 2 = RL, 3 = RR (+Z forward, +X left, -X right)
    const wheelCoords: Array<[number, number, number]> = [
      [spec.trackHalfX, 0.22, spec.wheelbaseHalfZ], // Front-Left
      [-spec.trackHalfX, 0.22, spec.wheelbaseHalfZ], // Front-Right
      [spec.trackHalfX, 0.22, -spec.wheelbaseHalfZ], // Rear-Left
      [-spec.trackHalfX, 0.22, -spec.wheelbaseHalfZ], // Rear-Right
    ];

    const dirCs = { x: 0, y: -1, z: 0 };
    const axleCs = { x: -1, y: 0, z: 0 };

    for (let i = 0; i < wheelCoords.length; i++) {
      const [wx, wy, wz] = wheelCoords[i];
      this.controller.addWheel(
        { x: wx, y: wy, z: wz },
        dirCs,
        axleCs,
        spec.suspensionRestLength,
        spec.wheelRadius
      );
      this.controller.setWheelSuspensionStiffness(i, spec.suspensionStiffness);
      this.controller.setWheelSuspensionCompression(i, spec.suspensionCompression);
      this.controller.setWheelSuspensionRelaxation(i, spec.suspensionRelaxation);
      this.controller.setWheelMaxSuspensionTravel(i, spec.maxSuspensionTravel);
      this.controller.setWheelMaxSuspensionForce(i, 36000);
      this.controller.setWheelFrictionSlip(i, 1.85);
      this.controller.setWheelSideFrictionStiffness(i, 1.0);

      this.wheelStates.push({
        connectionLocal: new THREE.Vector3(wx, wy, wz),
        suspensionLength: spec.suspensionRestLength,
        steeringAngle: 0,
        spinAngle: 0,
        inContact: true,
      });
    }
  }

  public setAutopilot(enabled: boolean): void {
    this.autopilotActive = enabled;
  }

  public isAutopilotActive(): boolean {
    return this.autopilotActive;
  }

  public setAutopilotSpeed(kmh: 30 | 50 | 70 | 90): void {
    this.autopilotTargetKmh = kmh;
  }

  public getAutopilotSpeed(): 30 | 50 | 70 | 90 {
    return this.autopilotTargetKmh;
  }

  public cycleAutopilotSpeed(dir: 1 | -1): 30 | 50 | 70 | 90 {
    const presets: Array<30 | 50 | 70 | 90> = [30, 50, 70, 90];
    const idx = presets.indexOf(this.autopilotTargetKmh);
    const nextIdx = clamp(idx + dir, 0, presets.length - 1);
    this.autopilotTargetKmh = presets[nextIdx];
    return this.autopilotTargetKmh;
  }

  public teleportTo(pos: THREE.Vector3, yaw: number): void {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    this.body.setTranslation({ x: pos.x, y: pos.y, z: pos.z }, true);
    this.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.smoothedSteer = 0;
    this.smoothedThrottle = 0;
    this.reversing = false;
  }

  public getPosition(out = new THREE.Vector3()): THREE.Vector3 {
    const t = this.body.translation();
    return out.set(t.x, t.y, t.z);
  }

  public getQuaternion(out = new THREE.Quaternion()): THREE.Quaternion {
    const r = this.body.rotation();
    return out.set(r.x, r.y, r.z, r.w);
  }

  public getForward(out = new THREE.Vector3()): THREE.Vector3 {
    this.getQuaternion(this.tmpQuat);
    return out.set(0, 0, 1).applyQuaternion(this.tmpQuat).normalize();
  }

  /**
   * Advances vehicle controls, suspension raycasts, drag, and stabilization by dt (1/60s).
   */
  public step(dt: number, rawInput: DrivingInput, spline: RoadSpline): VehicleTelemetry {
    // CRITICAL: Clear persistent forces & torques from the previous step in Rapier3D!
    this.body.resetForces(true);
    this.body.resetTorques(true);

    const pos = this.getPosition(this.tmpPos);
    const quat = this.getQuaternion(this.tmpQuat);
    this.tmpForward.set(0, 0, 1).applyQuaternion(quat).normalize();
    this.tmpRight.set(-1, 0, 0).applyQuaternion(quat).normalize();
    this.tmpUp.set(0, 1, 0).applyQuaternion(quat).normalize();

    const lv = this.body.linvel();
    this.tmpVel.set(lv.x, lv.y, lv.z);
    const forwardSpeedMs = this.tmpVel.dot(this.tmpForward);
    const signedSpeedKmh = forwardSpeedMs * 3.6;
    const speedKmh = Math.abs(signedSpeedKmh);

    // Instant manual override whenever the player touches throttle, brake, steer, or handbrake
    const manualOverride =
      rawInput.throttle > 0.05 ||
      rawInput.brake > 0.05 ||
      Math.abs(rawInput.steer) > 0.05 ||
      rawInput.handbrake;
    if (manualOverride && this.autopilotActive) {
      this.autopilotActive = false;
    }

    let throttle = rawInput.throttle;
    let brake = rawInput.brake;
    let steerTarget = rawInput.steer;
    const handbrake = rawInput.handbrake;

    // Optional relaxing Autopilot: tracks right lane smoothly & slows for curves
    if (this.autopilotActive) {
      const auto = this.computeAutopilot(pos, this.tmpForward, signedSpeedKmh, spline);
      throttle = auto.throttle;
      brake = auto.brake;
      steerTarget = auto.steer;
    }

    // Smooth steering response & progressive speed sensitivity for rock-solid highway feel
    const steerRate = Math.abs(steerTarget) > 0.01 ? 6.5 : 8.5;
    this.smoothedSteer = damp(this.smoothedSteer, steerTarget, steerRate, dt);
    this.smoothedThrottle = damp(this.smoothedThrottle, throttle, 5.5, dt);

    const speedFactor = clamp(speedKmh / this.spec.maxSpeedKmh, 0, 1);
    const maxSteerAngle = lerp(0.46, 0.12, Math.pow(speedFactor, 0.72));
    const appliedSteer = this.smoothedSteer * maxSteerAngle;

    // Drive / Brake / Reverse state machine
    let engineForce = 0;
    let brakeForce = 0;
    let isBrakingVisual = false;

    if (brake > 0.05) {
      if (forwardSpeedMs > 0.65 && !this.reversing) {
        // Braking while moving forward
        brakeForce = brake * this.spec.maxBrakeForce;
        isBrakingVisual = true;
      } else {
        // Smooth transition into Reverse
        this.reversing = true;
        if (signedSpeedKmh > -this.spec.reverseMaxSpeedKmh) {
          engineForce = -brake * this.spec.maxEngineForce * 0.52;
        }
      }
    } else if (throttle > 0.05) {
      if (forwardSpeedMs < -0.65) {
        // Braking while reversing
        brakeForce = throttle * this.spec.maxBrakeForce;
        isBrakingVisual = true;
      } else {
        this.reversing = false;
        // Progressive power taper as vehicle approaches 180 km/h cap
        const topSpeedLimit = clamp(1 - Math.pow(Math.max(0, signedSpeedKmh) / this.spec.maxSpeedKmh, 2.2), 0, 1);
        engineForce = this.smoothedThrottle * this.spec.maxEngineForce * (0.25 + 0.75 * topSpeedLimit);
      }
    } else {
      // Gentle coasting engine braking
      if (speedKmh < 0.8) {
        this.reversing = false;
        brakeForce = 8; // Hold stationary gently on light slopes
      } else {
        brakeForce = 1.6;
      }
    }

    // Apply steering to front wheels (0, 1)
    this.controller.setWheelSteering(0, appliedSteer);
    this.controller.setWheelSteering(1, appliedSteer);
    this.controller.setWheelSteering(2, 0);
    this.controller.setWheelSteering(3, 0);

    // AWD torque split (40% front / 60% rear) for balanced mountain cornering & hill climbs
    this.controller.setWheelEngineForce(0, engineForce * 0.4);
    this.controller.setWheelEngineForce(1, engineForce * 0.4);
    this.controller.setWheelEngineForce(2, engineForce * 0.6);
    this.controller.setWheelEngineForce(3, engineForce * 0.6);

    const rearBrake = handbrake ? this.spec.handbrakeForce : brakeForce * 0.45;
    const frontBrake = brakeForce * 0.55;
    this.controller.setWheelBrake(0, frontBrake);
    this.controller.setWheelBrake(1, frontBrake);
    this.controller.setWheelBrake(2, rearBrake);
    this.controller.setWheelBrake(3, rearBrake);

    if (handbrake) isBrakingVisual = true;

    // Update Rapier raycast vehicle suspension & tire forces
    this.controller.updateVehicle(dt);

    // Count grounded wheels and sync visual wheel data
    let groundedWheels = 0;
    for (let i = 0; i < 4; i++) {
      const inContact = this.controller.wheelIsInContact(i);
      if (inContact) groundedWheels++;

      const ws = this.wheelStates[i];
      ws.inContact = inContact;
      ws.suspensionLength = this.controller.wheelSuspensionLength(i) ?? this.spec.suspensionRestLength;
      ws.steeringAngle = this.controller.wheelSteering(i) ?? 0;
      ws.spinAngle = this.controller.wheelRotation(i) ?? ws.spinAngle;
    }

    // Aerodynamic drag + subtle downforce + rock-solid anti-flip uprighting stabilization
    const speedSq = forwardSpeedMs * Math.abs(forwardSpeedMs);
    const dragForce = -0.32 * speedSq;
    const downforce = groundedWheels > 0 ? -Math.min(4200, 1.35 * forwardSpeedMs * forwardSpeedMs) : 0;

    this.body.addForce(
      {
        x: this.tmpForward.x * dragForce,
        y: downforce,
        z: this.tmpForward.z * dragForce,
      },
      true
    );

    // Smoothly keep car upright so it never rolls onto its side or flips on curbs/guardrails
    const av = this.body.angvel();
    const worldUp = new THREE.Vector3(0, 1, 0);
    const uprightAxis = new THREE.Vector3().crossVectors(this.tmpUp, worldUp);
    const uprightStrength = 14000;
    const rollPitchDamping = 2600;

    // Project angular velocity onto local forward (roll) and right (pitch) to damp oscillation without affecting steering yaw
    const rollVel = av.x * this.tmpForward.x + av.y * this.tmpForward.y + av.z * this.tmpForward.z;
    const pitchVel = av.x * this.tmpRight.x + av.y * this.tmpRight.y + av.z * this.tmpRight.z;

    this.body.addTorque(
      {
        x: uprightAxis.x * uprightStrength - this.tmpForward.x * rollVel * rollPitchDamping - this.tmpRight.x * pitchVel * rollPitchDamping,
        y: uprightAxis.y * uprightStrength,
        z: uprightAxis.z * uprightStrength - this.tmpForward.z * rollVel * rollPitchDamping - this.tmpRight.z * pitchVel * rollPitchDamping,
      },
      true
    );

    // Hard safety net: if car ever tilts past ~48 degrees, smoothly right it onto its wheels
    if (this.tmpUp.y < 0.66) {
      const yaw = Math.atan2(this.tmpForward.x, this.tmpForward.z);
      const flatQ = new THREE.Quaternion().setFromAxisAngle(worldUp, yaw);
      this.body.setRotation({ x: flatQ.x, y: flatQ.y, z: flatQ.z, w: flatQ.w }, true);
      this.body.setAngvel({ x: 0, y: av.y * 0.3, z: 0 }, true);
    }

    // Safety cap on absolute speed (~184 km/h) so downhill runs stay controlled
    const maxMs = (this.spec.maxSpeedKmh + 4) / 3.6;
    const horizSpeed = Math.hypot(lv.x, lv.z);
    if (horizSpeed > maxMs) {
      const scale = maxMs / horizSpeed;
      this.body.setLinvel({ x: lv.x * scale, y: lv.y, z: lv.z * scale }, true);
    }

    const rawAccel = (forwardSpeedMs - this.prevForwardSpeedMs) / Math.max(dt, 0.001);
    this.prevForwardSpeedMs = forwardSpeedMs;
    this.smoothedAccel = damp(this.smoothedAccel, clamp(rawAccel, -12, 10), 6, dt);

    const transmission = computeAutomaticTransmission(
      signedSpeedKmh,
      this.smoothedThrottle,
      this.reversing,
      this.spec.gearThresholdsKmh
    );

    return {
      speedKmh,
      signedSpeedKmh,
      longitudinalAccel: this.smoothedAccel,
      transmission,
      steeringAngle: appliedSteer,
      steeringInput: this.smoothedSteer,
      throttle: this.smoothedThrottle,
      braking: isBrakingVisual,
      reversing: this.reversing && signedSpeedKmh < -0.4,
      groundedWheels,
      autopilotActive: this.autopilotActive,
      autopilotTargetKmh: this.autopilotTargetKmh,
    };
  }

  private computeAutopilot(
    pos: THREE.Vector3,
    forward: THREE.Vector3,
    speedKmh: number,
    spline: RoadSpline
  ): { throttle: number; brake: number; steer: number } {
    const closest = spline.findClosestGlobal(pos.x, pos.z);
    const lookAheadMeters = clamp(15 + speedKmh * 0.36, 15, 48);
    const lookAheadT = (closest.sample.t + lookAheadMeters / spline.totalLength) % 1;
    const farAheadT = (closest.sample.t + (lookAheadMeters + 24) / spline.totalLength) % 1;
    const aheadSample = spline.getSampleAt(lookAheadT);
    const farSample = spline.getSampleAt(farAheadT);

    // Stay smoothly centered in the right-hand cruising lane for whichever map is active
    const laneOffset = getEnvironmentById(spline.envId).laneOffset;
    const targetX = aheadSample.position.x + aheadSample.right.x * laneOffset;
    const targetZ = aheadSample.position.z + aheadSample.right.z * laneOffset;

    const toTargetX = targetX - pos.x;
    const toTargetZ = targetZ - pos.z;

    const desiredYaw = Math.atan2(toTargetX, toTargetZ);
    const currentYaw = Math.atan2(forward.x, forward.z);
    const headingError = wrapAngle(desiredYaw - currentYaw);

    const steer = clamp(headingError * 2.05, -1, 1);

    // Anticipate upcoming sharper curves smoothly and accelerate gently after exiting
    const upcomingCurvature = Math.max(aheadSample.curvature, farSample.curvature);
    const curveSlowdown = clamp(upcomingCurvature * 1650, 0, 34);
    const targetSpeed = Math.max(26, this.autopilotTargetKmh - curveSlowdown);

    const speedDiff = targetSpeed - speedKmh;
    const throttle = speedDiff > 1.2 ? clamp(speedDiff * 0.042, 0, 0.72) : 0;
    const brake = speedDiff < -5.5 ? clamp(-speedDiff * 0.038, 0, 0.48) : 0;

    return { throttle, brake, steer };
  }
}
