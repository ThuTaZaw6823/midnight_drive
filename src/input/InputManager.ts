import { DrivingInput } from '../physics/VehiclePhysics';
import { PhotoMoveInput } from '../camera/CameraController';
import { clamp } from '../utils/MathUtils';

export interface InputActions {
  onToggleCamera?: () => void;
  onRecenterCamera?: () => void;
  onToggleHeadlights?: () => void;
  onToggleWipers?: () => void;
  onToggleLeftIndicator?: () => void;
  onToggleRightIndicator?: () => void;
  onToggleRadio?: () => void;
  onPrevRadioStation?: () => void;
  onNextRadioStation?: () => void;
  onToggleAutopilot?: () => void;
  onAdjustAutopilotSpeed?: (dir: 1 | -1) => void;
  onToggleMinimap?: () => void;
  onToggleZenMode?: () => void;
  onTogglePhotoMode?: () => void;
  onTogglePause?: () => void;
  onResetVehicle?: () => void;
  onHornChange?: (active: boolean) => void;
}

/**
 * Handles keyboard and optional HTML5 Gamepad driving & Photo Mode inputs.
 */
export class InputManager {
  private readonly keys = new Set<string>();
  private actions: InputActions = {};
  private drivingEnabled = true;
  private photoModeEnabled = false;
  private hornActive = false;

  constructor() {
    window.addEventListener('keydown', this.handleKeyDown, { passive: false });
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
  }

  public setActions(actions: InputActions): void {
    this.actions = actions;
  }

  public setDrivingEnabled(enabled: boolean): void {
    this.drivingEnabled = enabled;
    if (!enabled) {
      this.keys.clear();
      if (this.hornActive) {
        this.hornActive = false;
        this.actions.onHornChange?.(false);
      }
    }
  }

  public setPhotoModeEnabled(enabled: boolean): void {
    this.photoModeEnabled = enabled;
    this.keys.clear();
  }

  private handleKeyDown = (e: KeyboardEvent): void => {
    const code = e.code;

    // Escape closes photo mode or toggles pause
    if (code === 'Escape' && !e.repeat) {
      e.preventDefault();
      if (this.photoModeEnabled) {
        this.actions.onTogglePhotoMode?.();
      } else {
        this.actions.onTogglePause?.();
      }
      return;
    }

    if (this.photoModeEnabled) {
      if (code === 'KeyP' && !e.repeat) {
        e.preventDefault();
        this.actions.onTogglePhotoMode?.();
        return;
      }
      if (
        code === 'ArrowUp' ||
        code === 'ArrowDown' ||
        code === 'ArrowLeft' ||
        code === 'ArrowRight' ||
        code === 'Space'
      ) {
        e.preventDefault();
      }
      this.keys.add(code);
      return;
    }

    if (!this.drivingEnabled) return;

    if (
      code === 'ArrowUp' ||
      code === 'ArrowDown' ||
      code === 'ArrowLeft' ||
      code === 'ArrowRight' ||
      code === 'Space'
    ) {
      e.preventDefault();
    }

    this.keys.add(code);

    if (e.repeat) return;

    switch (code) {
      case 'KeyC':
        this.actions.onToggleCamera?.();
        break;
      case 'KeyV':
        this.actions.onRecenterCamera?.();
        break;
      case 'KeyL':
        this.actions.onToggleHeadlights?.();
        break;
      case 'KeyB':
        this.actions.onToggleWipers?.();
        break;
      case 'KeyQ':
        this.actions.onToggleLeftIndicator?.();
        break;
      case 'KeyE':
        this.actions.onToggleRightIndicator?.();
        break;
      case 'KeyR':
        this.actions.onToggleRadio?.();
        break;
      case 'BracketLeft':
        this.actions.onPrevRadioStation?.();
        break;
      case 'BracketRight':
        this.actions.onNextRadioStation?.();
        break;
      case 'KeyF':
        this.actions.onToggleAutopilot?.();
        break;
      case 'Minus':
        this.actions.onAdjustAutopilotSpeed?.(-1);
        break;
      case 'Equal':
        this.actions.onAdjustAutopilotSpeed?.(1);
        break;
      case 'KeyM':
        this.actions.onToggleMinimap?.();
        break;
      case 'KeyZ':
        this.actions.onToggleZenMode?.();
        break;
      case 'KeyP':
        this.actions.onTogglePhotoMode?.();
        break;
      case 'Backspace':
        this.actions.onResetVehicle?.();
        break;
      case 'KeyH':
        this.hornActive = true;
        this.actions.onHornChange?.(true);
        break;
    }
  };

  private handleKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
    if (e.code === 'KeyH' && this.hornActive) {
      this.hornActive = false;
      this.actions.onHornChange?.(false);
    }
  };

  private handleBlur = (): void => {
    this.keys.clear();
    if (this.hornActive) {
      this.hornActive = false;
      this.actions.onHornChange?.(false);
    }
  };

  public getDrivingInput(): DrivingInput {
    if (!this.drivingEnabled) {
      return { throttle: 0, brake: 0, steer: 0, handbrake: false };
    }

    let throttle = this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0;
    let brake = this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0;
    let steer = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) steer += 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) steer -= 1;
    let handbrake = this.keys.has('Space');

    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = pads[0];
    if (pad) {
      const stickX = Math.abs(pad.axes[0] ?? 0) > 0.1 ? -(pad.axes[0] ?? 0) : 0;
      const rt = pad.buttons[7]?.value ?? 0;
      const lt = pad.buttons[6]?.value ?? 0;
      if (Math.abs(stickX) > Math.abs(steer)) steer = clamp(stickX, -1, 1);
      if (rt > throttle) throttle = rt;
      if (lt > brake) brake = lt;
      if (pad.buttons[0]?.pressed) handbrake = true;
    }

    return { throttle, brake, steer, handbrake };
  }

  public getPhotoMoveInput(): PhotoMoveInput {
    if (!this.photoModeEnabled) {
      return { forward: 0, right: 0, up: 0, boost: false };
    }
    let forward = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) forward += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) forward -= 1;

    let right = 0;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) right += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) right -= 1;

    let up = 0;
    if (this.keys.has('KeyE') || this.keys.has('Space')) up += 1;
    if (this.keys.has('KeyQ') || this.keys.has('ControlLeft')) up -= 1;

    return {
      forward,
      right,
      up,
      boost: this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'),
    };
  }

  public dispose(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);
  }
}
