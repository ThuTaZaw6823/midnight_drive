import * as THREE from 'three';
import { PostProcessingPipeline } from './PostProcessing';
import { WorldManager } from '../world/WorldManager';
import { EnvironmentId, getEnvironmentById } from '../world/EnvironmentConfig';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { Vehicle } from '../vehicles/Vehicle';
import { CameraController } from '../camera/CameraController';
import { LightingSystem } from '../lighting/LightingSystem';
import { WeatherSystem } from '../weather/WeatherSystem';
import { AudioEngine } from '../audio/AudioEngine';
import { InputManager } from '../input/InputManager';
import { SettingsManager } from '../settings/SettingsManager';
import { TrafficManager } from '../traffic/TrafficManager';
import { MultiplayerClient } from '../multiplayer/MultiplayerClient';
import { MainMenu } from '../ui/MainMenu';
import { HUD } from '../ui/HUD';
import { PauseMenu } from '../ui/PauseMenu';
import { PhotoModeUI } from '../ui/PhotoModeUI';

type GameState = 'menu' | 'driving' | 'paused' | 'photo';

/**
 * Core Midnight Drive Game Engine (Phase 2).
 * Orchestrates Three.js WebGL2 rendering, Rapier3D fixed-step physics, Mountain Escape world,
 * Solstice GT vehicle, multi-mode & Photo Mode cameras, dynamic weather, smooth time-of-day
 * lighting, spatial Web Audio + 5-station Ambient Radio, and glassmorphic UI.
 */
export class GameEngine {
  private readonly scene = new THREE.Scene();
  private readonly settingsMgr = new SettingsManager();
  private readonly physics = new PhysicsWorld();
  private readonly input = new InputManager();
  private readonly audio = new AudioEngine();
  private readonly traffic = new TrafficManager();
  private readonly multiplayer = new MultiplayerClient();

  private pipeline!: PostProcessingPipeline;
  private cameraCtrl!: CameraController;
  private world!: WorldManager;
  private lighting!: LightingSystem;
  private weather!: WeatherSystem;
  private vehicle!: Vehicle;

  private mainMenu!: MainMenu;
  private hud!: HUD;
  private pauseMenu!: PauseMenu;
  private photoUI!: PhotoModeUI;

  private state: GameState = 'menu';
  private garageFocus = false;
  private zenMode = false;
  private animFrameId = 0;
  private lastTimestamp = 0;
  private elapsedTime = 0;
  private physicsAccumulator = 0;
  private autosaveTimer = 0;
  private lastIndicatorBlink = false;
  private savedPrePhotoExposure = 1.1;

  private readonly tmpPos = new THREE.Vector3();
  private readonly tmpFwd = new THREE.Vector3();
  private readonly tmpVel = new THREE.Vector3();
  private readonly prevPos = new THREE.Vector3();
  private hasPrevPos = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly uiRoot: HTMLElement
  ) {}

  public async init(): Promise<void> {
    const loadingEl = document.createElement('div');
    loadingEl.className = 'loading-screen';
    loadingEl.innerHTML = `
      <div class="loading-title">MIDNIGHT DRIVE</div>
      <div class="loading-sub">Preparing Mountain Escape · Loading physics, terrain & atmosphere…</div>
    `;
    this.uiRoot.appendChild(loadingEl);

    // Friendly WebGL2 capability check
    const testGl = this.canvas.getContext('webgl2');
    if (!testGl) {
      throw new Error(
        'WebGL 2 is not available in this browser. Please enable hardware acceleration or use a modern desktop browser (Chrome, Safari, Edge, or Firefox).'
      );
    }

    const settings = this.settingsMgr.get();

    // 1. Initialize Rapier3D WASM Physics World
    await this.physics.init();

    // 2. Build Selected World Environment (all 6 maps playable!)
    const initialEnv = getEnvironmentById(settings.environmentId);
    this.world = new WorldManager(initialEnv.id, settings.worldSeed);
    this.scene.add(this.world.group);
    this.registerWorldColliders();

    // 3. Lighting, Sky Dome & Weather
    this.lighting = new LightingSystem(this.scene, settings.timeOfDay);
    this.lighting.setMilkyWayBoost(initialEnv.milkyWayBoost);
    this.weather = new WeatherSystem(settings.weather);
    this.scene.add(this.weather.group);

    // 4. Spawn Player Vehicle neatly in right lane
    const startSpawn = this.getLaneSpawn(0.014, initialEnv.laneOffset);
    this.vehicle = new Vehicle(
      this.physics,
      startSpawn.position,
      startSpawn.yaw,
      settings.customization
    );
    this.vehicle.physics.setAutopilotSpeed(settings.autopilotSpeedKmh);
    this.scene.add(this.vehicle.root);

    // Settle suspension cleanly before first frame
    const idleInput = { throttle: 0, brake: 0, steer: 0, handbrake: true };
    for (let i = 0; i < 25; i++) {
      this.vehicle.stepPhysics(1 / 60, idleInput, this.world.spline);
      this.physics.step();
    }
    this.vehicle.syncVisualTransform();

    // 5. Camera & WebGL2 Post-Processing Renderer
    this.cameraCtrl = new CameraController(
      window.innerWidth / window.innerHeight,
      settings.cameraMode,
      settings.chaseDistance,
      this.canvas,
      (dist) => this.settingsMgr.update({ chaseDistance: Number(dist.toFixed(2)) })
    );
    this.pipeline = new PostProcessingPipeline(this.canvas, this.scene, this.cameraCtrl.camera);

    // 6. Build Minimalist UI
    this.mainMenu = new MainMenu(this.settingsMgr, this.multiplayer, {
      onStartDriving: () => this.startDriving(false),
      onContinueJourney: () => this.startDriving(true),
      onSelectEnvironment: (envId) => this.switchEnvironment(envId),
      onSettingsChanged: () => this.applySettings(),
      onGarageFocusChange: (open) => {
        this.garageFocus = open;
      },
    });

    this.hud = new HUD(this.world.spline, {
      onToggleRadio: () => this.handleToggleRadio(),
      onPrevStation: () => this.handleCycleRadio(-1),
      onNextStation: () => this.handleCycleRadio(1),
    });
    this.hud.setEnvironmentSpline(this.world.spline, initialEnv.name);

    this.pauseMenu = new PauseMenu(this.settingsMgr, {
      onResume: () => this.resumeDriving(),
      onResetVehicle: () => this.resetVehicleToNearestRoad(),
      onEnterPhotoMode: () => this.enterPhotoMode(),
      onSelectEnvironment: (envId) => {
        this.switchEnvironment(envId);
        this.resumeDriving();
      },
      onReturnToMenu: () => this.returnToMainMenu(),
      onSettingsChanged: () => this.applySettings(),
      onSelectStation: (idx) => {
        this.audio.unlock(this.settingsMgr.get());
        const st = this.audio.setStationIndex(idx);
        if (!this.audio.radioPlaying) this.audio.toggleRadio();
        this.hud.showToast(`Radio: ${st.name}`);
      },
      onToggleRadio: () => this.handleToggleRadio(),
      isRadioPlaying: () => this.audio.radioPlaying,
    });

    this.photoUI = new PhotoModeUI({
      onFovChange: (fov) => {
        this.cameraCtrl.photoFov = fov;
      },
      onExposureChange: (exp) => {
        this.pipeline.setExposure(exp);
      },
      onCaptureScreenshot: () => this.captureScreenshot(),
      onResetView: () => {
        this.cameraCtrl.snapToVehicle(this.vehicle, this.world.terrain, this.world.spline);
        this.cameraCtrl.enterPhotoMode();
        this.photoUI.show(this.cameraCtrl.photoFov, this.settingsMgr.get().exposure);
      },
      onExit: () => this.exitPhotoMode(),
    });

    this.uiRoot.append(
      this.mainMenu.element,
      this.hud.element,
      this.pauseMenu.element,
      this.photoUI.element
    );

    // 7. Wire Input Actions
    this.input.setDrivingEnabled(false);
    this.input.setActions({
      onToggleCamera: () => {
        const mode = this.cameraCtrl.cycleMode();
        this.settingsMgr.update({ cameraMode: mode });
        const labels: Record<string, string> = {
          'third-person': 'Third-Person Chase Camera (Scroll to Zoom)',
          'first-person': 'First-Person Cockpit (Drag to Look · V Recenter)',
          hood: 'Hood Camera',
          cinematic: 'Cinematic Camera',
        };
        this.hud.showToast(labels[mode] ?? mode);
      },
      onRecenterCamera: () => {
        this.cameraCtrl.recenterFirstPerson();
        if (this.cameraCtrl.mode === 'first-person') {
          this.hud.showToast('Cockpit View Centered');
        }
      },
      onToggleHeadlights: () => {
        const on = this.vehicle.toggleHeadlights();
        this.hud.showToast(on ? 'Headlights On' : 'Headlights Off');
      },
      onToggleWipers: () => {
        const on = this.vehicle.toggleWipers();
        this.hud.showToast(on ? 'Windshield Wipers On' : 'Windshield Wipers Off');
      },
      onToggleLeftIndicator: () => this.vehicle.toggleLeftIndicator(),
      onToggleRightIndicator: () => this.vehicle.toggleRightIndicator(),
      onToggleRadio: () => this.handleToggleRadio(),
      onPrevRadioStation: () => this.handleCycleRadio(-1),
      onNextRadioStation: () => this.handleCycleRadio(1),
      onToggleAutopilot: () => {
        const next = !this.vehicle.physics.isAutopilotActive();
        this.vehicle.physics.setAutopilot(next);
        this.hud.showToast(
          next
            ? `Autopilot Engaged · ${this.vehicle.telemetry.autopilotTargetKmh} km/h (- / = to adjust)`
            : 'Manual Control'
        );
      },
      onAdjustAutopilotSpeed: (dir) => {
        const speed = this.vehicle.physics.cycleAutopilotSpeed(dir);
        this.settingsMgr.update({ autopilotSpeedKmh: speed });
        this.hud.showToast(`Autopilot Speed: ${speed} km/h`);
      },
      onToggleMinimap: () => {
        const next = !this.settingsMgr.get().showMinimap;
        this.settingsMgr.update({ showMinimap: next });
        this.hud.setMinimapVisible(next);
      },
      onToggleZenMode: () => {
        this.zenMode = !this.zenMode;
        this.hud.setZenMode(this.zenMode);
      },
      onTogglePhotoMode: () => {
        if (this.state === 'driving') this.enterPhotoMode();
        else if (this.state === 'photo') this.exitPhotoMode();
      },
      onTogglePause: () => {
        if (this.state === 'driving') this.pauseGame();
        else if (this.state === 'paused') this.resumeDriving();
      },
      onResetVehicle: () => {
        this.resetVehicleToNearestRoad();
        this.hud.showToast('Vehicle Reset onto Highway');
      },
      onHornChange: (active) => {
        this.audio.unlock(this.settingsMgr.get());
        this.vehicle.hornActive = active;
        this.audio.setHorn(active);
      },
    });

    this.applySettings();

    window.addEventListener('resize', this.handleResize);
    window.addEventListener('beforeunload', this.handleBeforeUnload);

    loadingEl.style.opacity = '0';
    setTimeout(() => loadingEl.remove(), 500);

    this.lastTimestamp = performance.now();
    this.animFrameId = requestAnimationFrame(this.loop);
  }

  private handleToggleRadio(): void {
    this.audio.unlock(this.settingsMgr.get());
    const playing = this.audio.toggleRadio();
    const st = this.audio.getCurrentStation();
    this.hud.showToast(playing ? `Radio: ${st.name} — ${st.subtitle}` : 'Radio Paused');
  }

  private handleCycleRadio(dir: 1 | -1): void {
    this.audio.unlock(this.settingsMgr.get());
    const st = dir > 0 ? this.audio.nextStation() : this.audio.prevStation();
    this.settingsMgr.update({ radioStationIndex: this.audio.stationIndex });
    if (!this.audio.radioPlaying) this.audio.toggleRadio();
    this.hud.showToast(`Radio: ${st.name} — ${st.subtitle}`);
  }

  private registerWorldColliders(): void {
    this.physics.addStaticTrimesh(
      this.world.road.colliderVertices,
      this.world.road.colliderIndices,
      1.05,
      0.0
    );
    this.physics.addStaticTrimesh(
      this.world.terrain.colliderVertices,
      this.world.terrain.colliderIndices,
      0.82,
      0.0
    );
    this.physics.addStaticTrimesh(
      this.world.guardrails.colliderVertices,
      this.world.guardrails.colliderIndices,
      0.06,
      0.12
    );
    this.physics.addStaticBoxes(this.world.landmarks.boxColliders);
  }

  /**
   * Hot-swaps the active 3D map among all 6 environments cleanly with full GPU & physics cleanup.
   */
  public switchEnvironment(envId: EnvironmentId): void {
    if (this.world.envId === envId) return;

    const desc = getEnvironmentById(envId);
    const s = this.settingsMgr.get();

    // 1. Dispose old world meshes & physics colliders
    this.scene.remove(this.world.group);
    this.world.dispose();
    this.physics.clearStaticEnvironment();

    // 2. Build & mount new world
    this.world = new WorldManager(envId, s.worldSeed);
    this.scene.add(this.world.group);
    this.registerWorldColliders();
    this.world.setQuality(s.graphics);

    // 3. Apply environment's signature atmosphere defaults (Milky Way, Weather, Time)
    this.lighting.setMilkyWayBoost(desc.milkyWayBoost);
    this.settingsMgr.update({
      environmentId: envId,
      weather: desc.defaultWeather,
      timeOfDay: desc.defaultTime,
      savedProgress: { splineT: 0.014, hasSession: true },
    });
    this.applySettings();

    // 4. Place car smoothly on the new highway & settle suspension
    const spawn = this.getLaneSpawn(0.014, desc.laneOffset);
    this.vehicle.physics.teleportTo(spawn.position, spawn.yaw);
    this.vehicle.physics.setAutopilot(false);
    const idleInput = { throttle: 0, brake: 0, steer: 0, handbrake: true };
    for (let i = 0; i < 20; i++) {
      this.vehicle.stepPhysics(1 / 60, idleInput, this.world.spline);
      this.physics.step();
    }
    this.vehicle.syncVisualTransform();
    this.hasPrevPos = false;

    // 5. Update HUD minimap, map title & camera
    this.hud.setEnvironmentSpline(this.world.spline, desc.name);
    this.mainMenu.syncState();
    this.cameraCtrl.snapToVehicle(this.vehicle, this.world.terrain, this.world.spline);
    this.hud.showToast(`${desc.name} — ${desc.subtitle}`);
  }

  private getLaneSpawn(t: number, lateralOffset?: number): { position: THREE.Vector3; yaw: number } {
    const lane = lateralOffset ?? this.world.descriptor.laneOffset;
    const frame = this.world.spline.getFrameAt(t);
    const pos = frame.position
      .clone()
      .addScaledVector(frame.right, lane)
      .add(new THREE.Vector3(0, 0.54, 0));
    const yaw = Math.atan2(frame.tangent.x, frame.tangent.z);
    return { position: pos, yaw };
  }

  private startDriving(continueSaved: boolean): void {
    const s = this.settingsMgr.get();
    this.audio.unlock(s);

    const targetT = continueSaved && s.savedProgress.hasSession ? s.savedProgress.splineT : 0.014;
    const spawn = this.getLaneSpawn(targetT);
    this.vehicle.physics.teleportTo(spawn.position, spawn.yaw);
    this.vehicle.physics.setAutopilot(false);
    this.vehicle.syncVisualTransform();

    this.state = 'driving';
    this.garageFocus = false;
    this.zenMode = false;
    this.hasPrevPos = false;
    this.mainMenu.hide();
    this.pauseMenu.hide();
    this.photoUI.hide();
    this.hud.show();
    this.hud.setZenMode(false);
    this.hud.setMinimapVisible(s.showMinimap);
    this.input.setPhotoModeEnabled(false);
    this.input.setDrivingEnabled(true);
    this.cameraCtrl.snapToVehicle(this.vehicle, this.world.terrain, this.world.spline);

    this.settingsMgr.update({
      savedProgress: { splineT: targetT, hasSession: true },
    });
    this.hud.showToast(`${this.world.descriptor.name} — Enjoy the Road`);
  }

  private enterPhotoMode(): void {
    this.state = 'photo';
    this.savedPrePhotoExposure = this.settingsMgr.get().exposure;
    this.input.setDrivingEnabled(false);
    this.input.setPhotoModeEnabled(true);
    this.audio.setHorn(false);
    this.pauseMenu.hide();
    this.hud.hide();
    this.cameraCtrl.enterPhotoMode();
    this.photoUI.show(this.cameraCtrl.photoFov, this.savedPrePhotoExposure);
  }

  private exitPhotoMode(): void {
    this.state = 'driving';
    this.pipeline.setExposure(this.settingsMgr.get().exposure);
    this.photoUI.hide();
    this.hud.show();
    this.hud.setZenMode(this.zenMode);
    this.input.setPhotoModeEnabled(false);
    this.input.setDrivingEnabled(true);
    this.cameraCtrl.snapToVehicle(this.vehicle, this.world.terrain, this.world.spline);
    this.lastTimestamp = performance.now();
  }

  private captureScreenshot(): void {
    // Render a fresh frame immediately before extracting canvas data so WebGL buffer is populated
    this.pipeline.render(this.scene, this.cameraCtrl.camera);
    try {
      const dataUrl = this.canvas.toDataURL('image/png');
      const a = document.createElement('a');
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      a.href = dataUrl;
      a.download = `midnight-drive-${ts}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      console.error('Screenshot capture failed:', err);
    }
  }

  private pauseGame(): void {
    this.state = 'paused';
    this.input.setDrivingEnabled(false);
    this.audio.setHorn(false);
    this.pauseMenu.show();
    this.saveProgress();
  }

  private resumeDriving(): void {
    this.state = 'driving';
    this.pauseMenu.hide();
    this.photoUI.hide();
    this.hud.show();
    this.input.setPhotoModeEnabled(false);
    this.input.setDrivingEnabled(true);
    this.lastTimestamp = performance.now();
  }

  private returnToMainMenu(): void {
    this.saveProgress();
    this.state = 'menu';
    this.garageFocus = false;
    this.input.setDrivingEnabled(false);
    this.input.setPhotoModeEnabled(false);
    this.audio.setHorn(false);
    this.vehicle.physics.setAutopilot(false);

    const spawn = this.getLaneSpawn(0.014, 3.6);
    this.vehicle.physics.teleportTo(spawn.position, spawn.yaw - 0.14);
    this.vehicle.syncVisualTransform();

    this.pauseMenu.hide();
    this.photoUI.hide();
    this.hud.hide();
    this.mainMenu.show();
  }

  private resetVehicleToNearestRoad(): void {
    this.vehicle.physics.getPosition(this.tmpPos);
    const closest = this.world.spline.findClosestGlobal(this.tmpPos.x, this.tmpPos.z);
    const spawn = this.getLaneSpawn(closest.sample.t);
    this.vehicle.physics.teleportTo(spawn.position, spawn.yaw);
    this.vehicle.syncVisualTransform();
    this.cameraCtrl.snapToVehicle(this.vehicle, this.world.terrain, this.world.spline);
  }

  private applySettings(): void {
    const s = this.settingsMgr.get();
    const { shadowSize, shadowsEnabled } = this.pipeline.applyQuality(s.graphics);
    this.pipeline.setExposure(s.exposure);
    this.lighting.setShadowQuality(shadowSize, shadowsEnabled);
    this.lighting.applyPreset(s.timeOfDay);
    this.lighting.setDynamicCycle(s.dynamicTime);
    this.weather.setMode(s.weather);
    this.weather.setQuality(s.graphics);
    this.world.setQuality(s.graphics);
    this.vehicle.applyCustomization(s.customization);
    this.vehicle.setHeadlightBrightness(s.headlightBrightness);
    this.vehicle.physics.setAutopilotSpeed(s.autopilotSpeedKmh);
    this.audio.applySettings(s);
    this.hud.setMinimapVisible(s.showMinimap);

    if ((s.weather === 'light-rain' || s.weather === 'heavy-rain') && !this.vehicle.wipersOn) {
      this.vehicle.wipersOn = true;
    } else if ((s.weather === 'clear-night' || s.weather === 'fog') && this.vehicle.wipersOn) {
      this.vehicle.wipersOn = false;
    }
  }

  private saveProgress(): void {
    if (!this.vehicle) return;
    this.vehicle.physics.getPosition(this.tmpPos);
    const closest = this.world.spline.findClosestGlobal(this.tmpPos.x, this.tmpPos.z);
    this.settingsMgr.update({
      savedProgress: {
        splineT: closest.sample.t,
        hasSession: true,
      },
    });
  }

  private handleBeforeUnload = (): void => {
    if (this.state === 'driving' || this.state === 'paused' || this.state === 'photo') {
      this.saveProgress();
    }
  };

  private handleResize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.cameraCtrl.setAspect(w / h);
    this.pipeline.resize(w, h);
  };

  private loop = (timestamp: number): void => {
    this.animFrameId = requestAnimationFrame(this.loop);

    const rawDt = (timestamp - this.lastTimestamp) / 1000;
    this.lastTimestamp = timestamp;
    const dt = Math.min(Math.max(rawDt, 0.001), 0.05);

    const simActive = this.state === 'driving' || this.state === 'menu';
    if (simActive) {
      this.elapsedTime += dt;
    }

    // 1. Fixed-Timestep Physics (1/60s)
    if (this.state === 'driving') {
      const fixedDt = 1 / 60;
      this.physicsAccumulator = Math.min(this.physicsAccumulator + dt, fixedDt * 4);
      const drivingInput = this.input.getDrivingInput();

      while (this.physicsAccumulator >= fixedDt) {
        this.vehicle.stepPhysics(fixedDt, drivingInput, this.world.spline);
        this.physics.step();
        this.physicsAccumulator -= fixedDt;
      }

      this.vehicle.physics.getPosition(this.tmpPos);
      if (this.hasPrevPos) {
        const deltaMeters = this.tmpPos.distanceTo(this.prevPos);
        if (deltaMeters > 0.001 && deltaMeters < 25) {
          this.settingsMgr.get().totalDistanceKm += deltaMeters / 1000;
        }
      }
      this.prevPos.copy(this.tmpPos);
      this.hasPrevPos = true;

      this.autosaveTimer += dt;
      if (this.autosaveTimer >= 15) {
        this.autosaveTimer = 0;
        this.saveProgress();
      }
    } else if (this.state === 'menu') {
      this.vehicle.stepPhysics(
        1 / 60,
        { throttle: 0, brake: 0, steer: 0, handbrake: true },
        this.world.spline
      );
      this.physics.step();
    }

    // 2. Sync Vehicle Visuals, Windshield Droplets & Indicator Audio
    const clockText = this.lighting.getFormattedClock();
    const weatherLabel = this.weather.getLabel();
    const activeCamMode =
      this.state === 'menu' || this.state === 'photo' ? 'third-person' : this.cameraCtrl.mode;
    const stationName = this.audio.getCurrentStation().name;

    this.vehicle.updateVisuals(simActive ? dt : 0, this.elapsedTime, activeCamMode, {
      radioPlaying: this.audio.radioPlaying,
      radioStationName: stationName,
      weatherLabel,
      rainIntensity: this.weather.currentRainIntensity,
      clockText,
    });

    const sysState = this.vehicle.getSystemState();
    if (this.state === 'driving' && (sysState.leftIndicator || sysState.rightIndicator)) {
      if (sysState.indicatorBlinkPhase !== this.lastIndicatorBlink) {
        this.lastIndicatorBlink = sysState.indicatorBlinkPhase;
        this.audio.playIndicatorTick();
      }
    }

    // 3. Update Camera
    if (this.state === 'menu') {
      this.cameraCtrl.updateMenuOrbit(dt, this.elapsedTime, this.vehicle, this.world.terrain, this.garageFocus);
    } else if (this.state === 'driving') {
      this.cameraCtrl.updateDriving(dt, this.elapsedTime, this.vehicle, this.world.terrain, this.world.spline);
    } else if (this.state === 'photo') {
      this.cameraCtrl.updatePhotoMode(dt, this.input.getPhotoMoveInput(), this.world.terrain);
      this.photoUI.syncFov(this.cameraCtrl.photoFov);
    }

    // 4. Atmosphere, Velocity-Slanted Rain, Smooth Lighting Transitions, Lake & Audio
    this.vehicle.physics.getPosition(this.tmpPos);
    this.vehicle.physics.getForward(this.tmpFwd);
    const lv = this.vehicle.physics.body.linvel();
    this.tmpVel.set(lv.x, lv.y, lv.z);

    this.weather.update(simActive ? dt : 0, this.cameraCtrl.camera.position, this.tmpVel);
    this.world.setRoadWetness(this.weather.currentWetness);
    this.lighting.update(
      simActive ? dt : 0.016, // Allow smooth color transitions even while previewing in Pause Menu!
      this.elapsedTime,
      this.tmpPos,
      this.weather.currentFogDensity
    );
    this.world.streetlights.setLightingScale(this.lighting.currentStreetlightScale);
    this.world.lake?.syncAtmosphere(
      this.lighting.currentMoonDir,
      this.lighting.currentMoonColor,
      this.lighting.currentZenithColor,
      this.lighting.currentHorizonColor,
      this.lighting.currentFogColor,
      this.weather.currentFogDensity
    );
    this.world.update(simActive ? dt : 0, this.elapsedTime, this.tmpPos);
    this.traffic.update(simActive ? dt : 0);

    this.audio.update(dt, {
      rpm: this.vehicle.telemetry.transmission.rpm,
      throttle: this.vehicle.telemetry.throttle,
      speedKmh: this.vehicle.telemetry.speedKmh,
      rainIntensity: this.weather.currentRainIntensity,
      wetness: this.weather.currentWetness,
      lakeDistanceMeters: this.world.getDistanceToWater(this.tmpPos),
      insideCabin: this.state === 'driving' && this.cameraCtrl.mode === 'first-person',
      paused: this.state !== 'driving',
    });

    // 5. Minimalist HUD
    if (this.state === 'driving') {
      this.hud.update({
        telemetry: this.vehicle.telemetry,
        systemState: sysState,
        clockText,
        weatherLabel,
        cameraMode: this.cameraCtrl.mode,
        radioPlaying: this.audio.radioPlaying,
        radioStationName: stationName,
        totalDistanceKm: this.settingsMgr.get().totalDistanceKm,
        vehiclePos: this.tmpPos,
        vehicleForward: this.tmpFwd,
      });
    }

    // 6. Render Frame
    this.pipeline.render(this.scene, this.cameraCtrl.camera);
  };

  public dispose(): void {
    cancelAnimationFrame(this.animFrameId);
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('beforeunload', this.handleBeforeUnload);
    this.input.dispose();
    this.audio.dispose();
    this.physics.dispose();
    this.pipeline.dispose();
  }
}
