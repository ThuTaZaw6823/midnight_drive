import * as THREE from 'three';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { DrivingInput, VehiclePhysics, VehicleTelemetry } from '../physics/VehiclePhysics';
import { VehicleModel } from './VehicleModel';
import { VehicleInterior } from './VehicleInterior';
import { MIDNIGHT_GT_SPEC, VehicleSpec } from './VehicleConfig';
import { RoadSpline } from '../roads/RoadSpline';
import { CameraMode, VehicleCustomization } from '../settings/SettingsManager';

export interface VehicleSystemState {
  headlightsOn: boolean;
  wipersOn: boolean;
  leftIndicator: boolean;
  rightIndicator: boolean;
  indicatorBlinkPhase: boolean;
  hornActive: boolean;
}

/**
 * Unified player vehicle combining Rapier VehiclePhysics, sculpted exterior VehicleModel,
 * detailed cockpit VehicleInterior, and functional vehicle lights/wipers/indicators.
 */
export class Vehicle {
  public readonly root = new THREE.Group();
  public readonly physics: VehiclePhysics;
  public readonly model: VehicleModel;
  public readonly interior: VehicleInterior;
  public readonly spec: VehicleSpec;

  public headlightsOn = true;
  public wipersOn = false;
  public leftIndicator = false;
  public rightIndicator = false;
  public hornActive = false;

  public telemetry: VehicleTelemetry;
  private indicatorTimer = 0;

  constructor(
    physicsWorld: PhysicsWorld,
    spawnPos: THREE.Vector3,
    spawnYaw: number,
    customization: VehicleCustomization,
    spec: VehicleSpec = MIDNIGHT_GT_SPEC
  ) {
    this.spec = spec;
    this.root.name = 'PlayerVehicle';

    this.physics = new VehiclePhysics(physicsWorld, spec, spawnPos, spawnYaw);
    this.model = new VehicleModel(spec, customization);
    this.interior = new VehicleInterior(customization);

    this.root.add(this.model.group);
    this.root.add(this.interior.group);

    this.telemetry = {
      speedKmh: 0,
      signedSpeedKmh: 0,
      longitudinalAccel: 0,
      transmission: { gear: 'N', gearIndex: 0, rpm: 820 },
      steeringAngle: 0,
      steeringInput: 0,
      throttle: 0,
      braking: false,
      reversing: false,
      groundedWheels: 4,
      autopilotActive: false,
      autopilotTargetKmh: 70,
    };

    this.syncVisualTransform();
  }

  public applyCustomization(custom: VehicleCustomization): void {
    this.model.applyCustomization(custom);
    this.interior.applyCustomization(custom);
  }

  public setHeadlightBrightness(multiplier: number): void {
    this.model.setHeadlightBrightness(multiplier);
  }

  public toggleHeadlights(): boolean {
    this.headlightsOn = !this.headlightsOn;
    return this.headlightsOn;
  }

  public toggleWipers(): boolean {
    this.wipersOn = !this.wipersOn;
    return this.wipersOn;
  }

  public toggleLeftIndicator(): void {
    this.leftIndicator = !this.leftIndicator;
    if (this.leftIndicator) this.rightIndicator = false;
    this.indicatorTimer = 0;
  }

  public toggleRightIndicator(): void {
    this.rightIndicator = !this.rightIndicator;
    if (this.rightIndicator) this.leftIndicator = false;
    this.indicatorTimer = 0;
  }

  public getSystemState(): VehicleSystemState {
    const blinkOn = Math.floor(this.indicatorTimer * 2.2) % 2 === 0;
    return {
      headlightsOn: this.headlightsOn,
      wipersOn: this.wipersOn,
      leftIndicator: this.leftIndicator,
      rightIndicator: this.rightIndicator,
      indicatorBlinkPhase: blinkOn,
      hornActive: this.hornActive,
    };
  }

  public stepPhysics(dt: number, input: DrivingInput, spline: RoadSpline): void {
    this.telemetry = this.physics.step(dt, input, spline);
  }

  public updateVisuals(
    dt: number,
    elapsed: number,
    cameraMode: CameraMode,
    opts: {
      radioPlaying: boolean;
      radioStationName: string;
      weatherLabel: string;
      rainIntensity: number;
      clockText: string;
    }
  ): void {
    if (this.leftIndicator || this.rightIndicator) {
      this.indicatorTimer += dt;
    } else {
      this.indicatorTimer = 0;
    }

    const blinkOn = Math.floor(this.indicatorTimer * 2.2) % 2 === 0;
    const leftBlink = this.leftIndicator && blinkOn;
    const rightBlink = this.rightIndicator && blinkOn;

    this.syncVisualTransform();
    this.model.syncWheels(this.physics.wheelStates);
    this.model.updateLights({
      headlightsOn: this.headlightsOn,
      braking: this.telemetry.braking,
      reversing: this.telemetry.reversing,
      leftIndicatorBlink: leftBlink,
      rightIndicatorBlink: rightBlink,
    });

    const isCockpit = cameraMode === 'first-person';
    this.interior.setVisible(isCockpit);
    if (isCockpit) {
      this.interior.update(dt, elapsed, this.telemetry, {
        headlightsOn: this.headlightsOn,
        wipersOn: this.wipersOn,
        leftIndicatorBlink: leftBlink,
        rightIndicatorBlink: rightBlink,
        radioPlaying: opts.radioPlaying,
        radioStationName: opts.radioStationName,
        weatherLabel: opts.weatherLabel,
        rainIntensity: opts.rainIntensity,
        clockText: opts.clockText,
      });
    }
  }

  public syncVisualTransform(): void {
    this.physics.getPosition(this.root.position);
    this.physics.getQuaternion(this.root.quaternion);
  }
}
