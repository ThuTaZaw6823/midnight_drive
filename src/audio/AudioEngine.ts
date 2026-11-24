import { GameSettings } from '../settings/SettingsManager';
import { clamp } from '../utils/MathUtils';

export interface RadioStation {
  id: string;
  name: string;
  subtitle: string;
}

export const RADIO_STATIONS: RadioStation[] = [
  { id: 'lofi', name: 'Midnight Lo-Fi', subtitle: 'Warm Rhodes & Soft Crackle' },
  { id: 'piano', name: 'Rain & Piano', subtitle: 'Nocturne Felt Arpeggios' },
  { id: 'ambient', name: 'Ambient Journey', subtitle: 'Deep Evolving Synth Pads' },
  { id: 'mountain', name: 'Mountain Atmosphere', subtitle: 'Alpine Chimes & Fifths' },
  { id: 'nature', name: 'Nature Sounds', subtitle: 'Lake Water & Night Breeze' },
];

/**
 * Upgraded Procedural Web Audio Engine:
 * - Independent channels: Engine, Tires (wet/dry texture), Wind, Rain (interior/exterior),
 *   Forest Ambience, Spatial Lakeside Water, Distant Thunder, Horn, Indicator Clicks
 * - 5-Station Procedural Ambient Radio that persists smoothly across camera & weather changes
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain!: GainNode;
  private engineGain!: GainNode;
  private ambienceGain!: GainNode;
  private musicGain!: GainNode;

  // Engine synth
  private engOsc1!: OscillatorNode;
  private engOsc2!: OscillatorNode;
  private engSubOsc!: OscillatorNode;
  private engFilter!: BiquadFilterNode;
  private engVolNode!: GainNode;

  // Tire + Wind
  private tireFilter!: BiquadFilterNode;
  private tireGain!: GainNode;
  private windFilter!: BiquadFilterNode;
  private windGain!: GainNode;

  // Rain, Forest, Lakeside Water
  private rainFilter!: BiquadFilterNode;
  private rainGain!: GainNode;
  private forestGain!: GainNode;
  private lakeGain!: GainNode;

  // Horn
  private hornOsc1: OscillatorNode | null = null;
  private hornOsc2: OscillatorNode | null = null;
  private hornGain!: GainNode;

  // Distant thunder timer
  private thunderCooldown = 14;

  // 5-Station Ambient Radio
  public radioPlaying = false;
  public stationIndex = 0;
  private radioInterval: number | null = null;
  private stepCounter = 0;

  private initialized = false;
  private lastSettings: GameSettings | null = null;

  public getCurrentStation(): RadioStation {
    return RADIO_STATIONS[this.stationIndex % RADIO_STATIONS.length];
  }

  public setStationIndex(index: number): RadioStation {
    const len = RADIO_STATIONS.length;
    this.stationIndex = ((index % len) + len) % len;
    this.stepCounter = 0;
    if (this.radioPlaying) {
      this.restartRadioLoop();
    }
    return this.getCurrentStation();
  }

  public nextStation(): RadioStation {
    return this.setStationIndex(this.stationIndex + 1);
  }

  public prevStation(): RadioStation {
    return this.setStationIndex(this.stationIndex - 1);
  }

  public unlock(settings: GameSettings): void {
    this.lastSettings = settings;
    this.stationIndex = settings.radioStationIndex % RADIO_STATIONS.length;

    if (!this.initialized) {
      try {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return;
        this.ctx = new AudioCtx();
        this.buildGraph();
        this.initialized = true;
      } catch {
        return;
      }
    }

    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    this.applySettings(settings);
  }

  private buildGraph(): void {
    if (!this.ctx) return;
    const ctx = this.ctx;

    this.masterGain = ctx.createGain();
    this.masterGain.connect(ctx.destination);

    this.engineGain = ctx.createGain();
    this.engineGain.connect(this.masterGain);

    this.ambienceGain = ctx.createGain();
    this.ambienceGain.connect(this.masterGain);

    this.musicGain = ctx.createGain();
    this.musicGain.connect(this.masterGain);

    // 1. Multi-layer Grand-Tourer Engine
    this.engFilter = ctx.createBiquadFilter();
    this.engFilter.type = 'lowpass';
    this.engFilter.frequency.value = 180;
    this.engFilter.Q.value = 1.3;

    this.engVolNode = ctx.createGain();
    this.engVolNode.gain.value = 0.08;

    this.engOsc1 = ctx.createOscillator();
    this.engOsc1.type = 'sawtooth';
    this.engOsc1.frequency.value = 50;

    this.engOsc2 = ctx.createOscillator();
    this.engOsc2.type = 'triangle';
    this.engOsc2.frequency.value = 100;

    this.engSubOsc = ctx.createOscillator();
    this.engSubOsc.type = 'sine';
    this.engSubOsc.frequency.value = 25;

    const g1 = ctx.createGain();
    g1.gain.value = 0.34;
    const g2 = ctx.createGain();
    g2.gain.value = 0.42;
    const gs = ctx.createGain();
    gs.gain.value = 0.56;

    this.engOsc1.connect(g1).connect(this.engFilter);
    this.engOsc2.connect(g2).connect(this.engFilter);
    this.engSubOsc.connect(gs).connect(this.engFilter);
    this.engFilter.connect(this.engVolNode).connect(this.engineGain);

    this.engOsc1.start();
    this.engOsc2.start();
    this.engSubOsc.start();

    // Shared seamless pink noise buffer
    const bufferSize = ctx.sampleRate * 4;
    const noiseBuf = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    let b0 = 0,
      b1 = 0,
      b2 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.997 * b0 + white * 0.029;
      b1 = 0.985 * b1 + white * 0.032;
      b2 = 0.95 * b2 + white * 0.048;
      data[i] = clamp((b0 + b1 + b2 + white * 0.06) * 2.1, -1, 1);
    }

    // 2. Tire Contact Noise (shifts higher when driving on wet asphalt)
    const tireSrc = ctx.createBufferSource();
    tireSrc.buffer = noiseBuf;
    tireSrc.loop = true;
    this.tireFilter = ctx.createBiquadFilter();
    this.tireFilter.type = 'bandpass';
    this.tireFilter.frequency.value = 340;
    this.tireFilter.Q.value = 0.7;
    this.tireGain = ctx.createGain();
    this.tireGain.gain.value = 0;
    tireSrc.connect(this.tireFilter).connect(this.tireGain).connect(this.engineGain);
    tireSrc.start();

    // 3. Aerodynamic Wind Rush
    const windSrc = ctx.createBufferSource();
    windSrc.buffer = noiseBuf;
    windSrc.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'lowpass';
    this.windFilter.frequency.value = 480;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    windSrc.connect(this.windFilter).connect(this.windGain).connect(this.ambienceGain);
    windSrc.start();

    // 4. Rain Patter
    const rainSrc = ctx.createBufferSource();
    rainSrc.buffer = noiseBuf;
    rainSrc.loop = true;
    this.rainFilter = ctx.createBiquadFilter();
    this.rainFilter.type = 'lowpass';
    this.rainFilter.frequency.value = 2600;
    this.rainGain = ctx.createGain();
    this.rainGain.gain.value = 0;
    rainSrc.connect(this.rainFilter).connect(this.rainGain).connect(this.ambienceGain);
    rainSrc.start();

    // 5. Night Forest Breeze
    const forestSrc = ctx.createBufferSource();
    forestSrc.buffer = noiseBuf;
    forestSrc.loop = true;
    const forestFilter = ctx.createBiquadFilter();
    forestFilter.type = 'lowpass';
    forestFilter.frequency.value = 390;
    this.forestGain = ctx.createGain();
    this.forestGain.gain.value = 0.07;
    forestSrc.connect(forestFilter).connect(this.forestGain).connect(this.ambienceGain);
    forestSrc.start();

    // 6. Spatial Lakeside Water Lapping
    const lakeSrc = ctx.createBufferSource();
    lakeSrc.buffer = noiseBuf;
    lakeSrc.loop = true;
    const lakeFilter = ctx.createBiquadFilter();
    lakeFilter.type = 'bandpass';
    lakeFilter.frequency.value = 540;
    lakeFilter.Q.value = 1.2;
    this.lakeGain = ctx.createGain();
    this.lakeGain.gain.value = 0;
    lakeSrc.connect(lakeFilter).connect(this.lakeGain).connect(this.ambienceGain);
    lakeSrc.start();

    // 7. Horn Bus
    this.hornGain = ctx.createGain();
    this.hornGain.gain.value = 0;
    this.hornGain.connect(this.masterGain);
  }

  public applySettings(settings: GameSettings): void {
    this.lastSettings = settings;
    if (!this.initialized || !this.ctx) return;
    const now = this.ctx.currentTime;
    this.masterGain.gain.setTargetAtTime(settings.muted ? 0 : settings.masterVolume, now, 0.04);
    this.engineGain.gain.setTargetAtTime(settings.engineVolume, now, 0.04);
    this.ambienceGain.gain.setTargetAtTime(settings.ambienceVolume, now, 0.04);
    this.musicGain.gain.setTargetAtTime(settings.musicVolume, now, 0.04);
  }

  public update(
    dt: number,
    opts: {
      rpm: number;
      throttle: number;
      speedKmh: number;
      rainIntensity: number;
      wetness: number;
      lakeDistanceMeters: number;
      insideCabin: boolean;
      paused: boolean;
    }
  ): void {
    if (!this.initialized || !this.ctx) return;
    const now = this.ctx.currentTime;

    if (opts.paused) {
      this.engVolNode.gain.setTargetAtTime(0.012, now, 0.1);
      this.tireGain.gain.setTargetAtTime(0, now, 0.1);
      this.windGain.gain.setTargetAtTime(0, now, 0.1);
      return;
    }

    const cabinDamp = opts.insideCabin ? 0.68 : 1.0;

    // Engine RPM response
    const baseHz = 36 + (opts.rpm / 7200) * 145;
    this.engOsc1.frequency.setTargetAtTime(baseHz, now, 0.05);
    this.engOsc2.frequency.setTargetAtTime(baseHz * 1.5, now, 0.05);
    this.engSubOsc.frequency.setTargetAtTime(baseHz * 0.5, now, 0.05);

    const filterHz = (145 + (opts.rpm / 7200) * 610 + opts.throttle * 260) * cabinDamp;
    this.engFilter.frequency.setTargetAtTime(filterHz, now, 0.06);

    const engVol = (0.06 + opts.throttle * 0.095 + (opts.rpm / 7200) * 0.06) * (opts.insideCabin ? 0.8 : 1.0);
    this.engVolNode.gain.setTargetAtTime(engVol, now, 0.06);

    // Tire sound (higher hiss frequency & louder spray when driving fast on wet asphalt!)
    const speedNorm = clamp(opts.speedKmh / 180, 0, 1);
    const tireHz = 210 + speedNorm * 620 + opts.wetness * 740;
    this.tireFilter.frequency.setTargetAtTime(tireHz * cabinDamp, now, 0.08);
    this.tireGain.gain.setTargetAtTime(
      speedNorm * (0.16 + opts.wetness * 0.11) * (opts.insideCabin ? 0.62 : 1.0),
      now,
      0.08
    );

    // Wind rush increases smoothly above ~45 km/h
    const windNorm = clamp((opts.speedKmh - 25) / 155, 0, 1);
    this.windFilter.frequency.setTargetAtTime((300 + windNorm * 950) * cabinDamp, now, 0.1);
    this.windGain.gain.setTargetAtTime(windNorm * windNorm * 0.18 * (opts.insideCabin ? 0.55 : 1.0), now, 0.1);

    // Rain audio (cozy muffled on windshield inside cabin, crisper outside)
    this.rainFilter.frequency.setTargetAtTime(opts.insideCabin ? 760 : 3300, now, 0.12);
    this.rainGain.gain.setTargetAtTime(opts.rainIntensity * (opts.insideCabin ? 0.24 : 0.35), now, 0.12);

    // Forest breeze + proximity-based lakeside water sound
    const natureBoost = this.radioPlaying && this.getCurrentStation().id === 'nature' ? 1.65 : 1.0;
    this.forestGain.gain.setTargetAtTime((opts.insideCabin ? 0.032 : 0.085) * natureBoost, now, 0.15);

    const lakeProximity = clamp(1 - opts.lakeDistanceMeters / 240, 0, 1);
    const lakeLapping = (0.65 + 0.35 * Math.sin(now * 0.85)) * lakeProximity;
    this.lakeGain.gain.setTargetAtTime(
      lakeLapping * (opts.insideCabin ? 0.045 : 0.11) * natureBoost,
      now,
      0.2
    );

    // Soft distant mountain thunder rumble occasionally during Heavy Rain
    if (opts.rainIntensity > 0.8) {
      this.thunderCooldown -= dt;
      if (this.thunderCooldown <= 0) {
        this.thunderCooldown = 16 + Math.random() * 18;
        this.playDistantThunder(opts.insideCabin);
      }
    }
  }

  private playDistantThunder(insideCabin: boolean): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const dur = 3.6;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      d[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;

    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.setValueAtTime(insideCabin ? 95 : 135, now);
    lpf.frequency.exponentialRampToValueAtTime(48, now + dur);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(insideCabin ? 0.22 : 0.32, now + 0.55);
    g.gain.exponentialRampToValueAtTime(0.0005, now + dur);

    src.connect(lpf).connect(g).connect(this.ambienceGain);
    src.start(now);
    src.stop(now + dur + 0.05);
  }

  public setHorn(active: boolean): void {
    if (!this.initialized || !this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    if (active && !this.hornOsc1) {
      this.hornOsc1 = ctx.createOscillator();
      this.hornOsc2 = ctx.createOscillator();
      this.hornOsc1.type = 'sawtooth';
      this.hornOsc2.type = 'sawtooth';
      this.hornOsc1.frequency.value = 392;
      this.hornOsc2.frequency.value = 493.88;

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1150;

      this.hornOsc1.connect(filter);
      this.hornOsc2.connect(filter);
      filter.connect(this.hornGain);

      this.hornOsc1.start();
      this.hornOsc2.start();
      this.hornGain.gain.setTargetAtTime(0.14, now, 0.02);
    } else if (!active && this.hornOsc1) {
      this.hornGain.gain.setTargetAtTime(0.0, now, 0.03);
      const o1 = this.hornOsc1;
      const o2 = this.hornOsc2;
      this.hornOsc1 = null;
      this.hornOsc2 = null;
      setTimeout(() => {
        try {
          o1.stop();
          o2?.stop();
        } catch {
          // ignore
        }
      }, 90);
    }
  }

  public playIndicatorTick(): void {
    if (!this.initialized || !this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(980, now);
    osc.frequency.exponentialRampToValueAtTime(320, now + 0.028);
    g.gain.setValueAtTime(0.05, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.032);
    osc.connect(g).connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.035);
  }

  public toggleRadio(): boolean {
    if (!this.initialized && this.lastSettings) {
      this.unlock(this.lastSettings);
    }
    this.radioPlaying = !this.radioPlaying;
    if (this.radioPlaying) {
      this.restartRadioLoop();
    } else if (this.radioInterval !== null) {
      clearInterval(this.radioInterval);
      this.radioInterval = null;
    }
    return this.radioPlaying;
  }

  private restartRadioLoop(): void {
    if (this.radioInterval !== null) {
      clearInterval(this.radioInterval);
      this.radioInterval = null;
    }
    const station = this.getCurrentStation();
    const stepMs =
      station.id === 'lofi'
        ? 3600
        : station.id === 'piano'
        ? 2400
        : station.id === 'ambient'
        ? 5400
        : station.id === 'mountain'
        ? 4200
        : 5000;

    this.triggerStationPhrase();
    this.radioInterval = window.setInterval(() => {
      if (this.radioPlaying) this.triggerStationPhrase();
    }, stepMs);
  }

  private triggerStationPhrase(): void {
    if (!this.ctx || !this.initialized) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const station = this.getCurrentStation();

    if (station.id === 'nature') {
      // Soft nocturnal cricket shimmer chime
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 3950 + (this.stepCounter % 3) * 140;
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(0.006, now + 0.15);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.85);
      osc.connect(g).connect(this.musicGain);
      osc.start(now);
      osc.stop(now + 0.9);
      this.stepCounter++;
      return;
    }

    if (station.id === 'lofi') {
      // Warm Rhodes-like Jazz-9th progression (Cmaj9 -> Am9 -> Fmaj9 -> G13)
      const chords = [
        [261.63, 329.63, 392.0, 493.88, 587.33],
        [220.0, 261.63, 329.63, 392.0, 493.88],
        [174.61, 220.0, 261.63, 329.63, 392.0],
        [196.0, 246.94, 293.66, 349.23, 440.0],
      ];
      const notes = chords[this.stepCounter % chords.length];
      const lpf = ctx.createBiquadFilter();
      lpf.type = 'lowpass';
      lpf.frequency.value = 820;
      lpf.connect(this.musicGain);

      notes.forEach((freq, idx) => {
        const t0 = now + idx * 0.055;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq * 0.5;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.linearRampToValueAtTime(0.045, t0 + 0.08);
        g.gain.exponentialRampToValueAtTime(0.0002, t0 + 3.4);
        osc.connect(g).connect(lpf);
        osc.start(t0);
        osc.stop(t0 + 3.5);
      });
      this.stepCounter++;
      return;
    }

    if (station.id === 'piano') {
      // Delicate Rain & Piano felt nocturne arpeggio (D minor pentatonic / 9th)
      const patterns = [
        [293.66, 349.23, 440.0, 523.25, 659.25],
        [261.63, 329.63, 392.0, 523.25, 587.33],
        [233.08, 293.66, 349.23, 440.0, 523.25],
        [220.0, 261.63, 329.63, 440.0, 493.88],
      ];
      const arp = patterns[this.stepCounter % patterns.length];
      const lpf = ctx.createBiquadFilter();
      lpf.type = 'lowpass';
      lpf.frequency.value = 1150;
      lpf.connect(this.musicGain);

      arp.forEach((freq, idx) => {
        const t0 = now + idx * 0.42;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.linearRampToValueAtTime(0.05, t0 + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0002, t0 + 2.3);
        osc.connect(g).connect(lpf);
        osc.start(t0);
        osc.stop(t0 + 2.4);
      });
      this.stepCounter++;
      return;
    }

    if (station.id === 'mountain') {
      // Airy open alpine fifths + gentle glassy overtone chimes
      const roots = [146.83, 164.81, 196.0, 130.81];
      const root = roots[this.stepCounter % roots.length];
      const notes = [root, root * 1.5, root * 2.0, root * 3.0];
      const lpf = ctx.createBiquadFilter();
      lpf.type = 'lowpass';
      lpf.frequency.value = 1300;
      lpf.connect(this.musicGain);

      notes.forEach((freq, idx) => {
        const t0 = now + idx * 0.25;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.linearRampToValueAtTime(0.034 / (idx * 0.35 + 1), t0 + 0.9);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 4.2);
        osc.connect(g).connect(lpf);
        osc.start(t0);
        osc.stop(t0 + 4.3);
      });
      this.stepCounter++;
      return;
    }

    // Ambient Journey — lush evolving minor-9th synth pad
    const chords = [
      [220.0, 261.63, 329.63, 392.0, 493.88],
      [174.61, 220.0, 261.63, 329.63, 392.0],
      [146.83, 220.0, 261.63, 329.63, 349.23],
      [164.81, 246.94, 293.66, 392.0, 493.88],
    ];
    const notes = chords[this.stepCounter % chords.length];
    const padFilter = ctx.createBiquadFilter();
    padFilter.type = 'lowpass';
    padFilter.frequency.setValueAtTime(460, now);
    padFilter.frequency.linearRampToValueAtTime(940, now + 2.8);
    padFilter.frequency.linearRampToValueAtTime(440, now + 5.8);
    padFilter.connect(this.musicGain);

    for (const freq of notes) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq * 0.5;
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(0.042, now + 1.8);
      g.gain.linearRampToValueAtTime(0.028, now + 4.4);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 6.2);
      osc.connect(g).connect(padFilter);
      osc.start(now);
      osc.stop(now + 6.4);
    }
    this.stepCounter++;
  }

  public dispose(): void {
    if (this.radioInterval !== null) clearInterval(this.radioInterval);
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }
}
