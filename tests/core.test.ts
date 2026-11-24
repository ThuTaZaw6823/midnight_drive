import { describe, expect, it } from 'vitest';
import { RoadSpline } from '../src/roads/RoadSpline';
import { Noise2D } from '../src/terrain/Noise';
import { computeAutomaticTransmission, MIDNIGHT_GT_SPEC } from '../src/vehicles/VehicleConfig';
import { RADIO_STATIONS } from '../src/audio/AudioEngine';
import { ENVIRONMENTS } from '../src/world/EnvironmentConfig';

describe('Midnight Drive Core & Multi-Map Systems', () => {
  it('generates deterministic closed loops for all 6 playable environments', () => {
    expect(ENVIRONMENTS.length).toBe(6);
    for (const env of ENVIRONMENTS) {
      expect(env.available).toBe(true);
      const spline = new RoadSpline(600, env.id);
      expect(spline.totalLength).toBeGreaterThan(4000);
      expect(spline.totalLength).toBeLessThan(6800);
      expect(spline.roadHalfWidth).toBeCloseTo(env.roadHalfWidth, 2);

      const sample = spline.getSampleAt(0.25);
      const closest = spline.findClosest(sample.position.x, sample.position.z);
      expect(closest).not.toBeNull();
      expect(closest!.distance2D).toBeLessThan(2.0);
    }
  });

  it('tags all key scenic zones along the Mountain Escape route', () => {
    const spline = new RoadSpline(800);
    const zones = new Set(spline.samples.map((s) => s.zone));
    expect(zones.has('overlook')).toBe(true);
    expect(zones.has('bridge')).toBe(true);
    expect(zones.has('viewpoint')).toBe(true);
    expect(zones.has('tunnel')).toBe(true);
    expect(zones.has('rest-area')).toBe(true);
  });

  it('produces deterministic seeded procedural noise', () => {
    const n1 = new Noise2D(202604);
    const n2 = new Noise2D(202604);
    expect(n1.fbm(1.25, -3.5, 4)).toBeCloseTo(n2.fbm(1.25, -3.5, 4), 10);
    expect(n1.ridged(0.4, 0.8, 4)).toBeCloseTo(n2.ridged(0.4, 0.8, 4), 10);
  });

  it('computes smooth automatic transmission gear shifts and reverse', () => {
    const idle = computeAutomaticTransmission(0, 0, false, MIDNIGHT_GT_SPEC.gearThresholdsKmh);
    expect(idle.gear).toBe('N');

    const d1 = computeAutomaticTransmission(15, 0.6, false, MIDNIGHT_GT_SPEC.gearThresholdsKmh);
    expect(d1.gear).toBe('D1');

    const d4 = computeAutomaticTransmission(105, 0.5, false, MIDNIGHT_GT_SPEC.gearThresholdsKmh);
    expect(d4.gear).toBe('D4');

    const rev = computeAutomaticTransmission(-12, 0.4, true, MIDNIGHT_GT_SPEC.gearThresholdsKmh);
    expect(rev.gear).toBe('R');
  });

  it('exposes all five original procedural Ambient Radio stations', () => {
    expect(RADIO_STATIONS.length).toBe(5);
    expect(RADIO_STATIONS.map((s) => s.name)).toContain('Midnight Lo-Fi');
    expect(RADIO_STATIONS.map((s) => s.name)).toContain('Rain & Piano');
  });
});
