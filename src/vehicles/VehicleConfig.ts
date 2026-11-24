export interface VehicleSpec {
  id: string;
  name: string;
  category: 'coupe' | 'sedan' | 'suv' | 'sports' | 'van';
  massKg: number;
  maxSpeedKmh: number;
  reverseMaxSpeedKmh: number;
  maxEngineForce: number;
  maxBrakeForce: number;
  handbrakeForce: number;
  wheelRadius: number;
  wheelWidth: number;
  suspensionRestLength: number;
  suspensionStiffness: number;
  suspensionCompression: number;
  suspensionRelaxation: number;
  maxSuspensionTravel: number;
  frictionSlip: number;
  sideFrictionStiffness: number;
  wheelbaseHalfZ: number;
  trackHalfX: number;
  chassisHalfExtents: [number, number, number];
  gearThresholdsKmh: number[]; // Upshift thresholds for D1..D6
}

/**
 * First polished vehicle: Midnight GT Coupe — balanced grand-tourer tuned
 * for peaceful, smooth mountain highway cruising up to 180 km/h.
 */
export const MIDNIGHT_GT_SPEC: VehicleSpec = {
  id: 'midnight-gt',
  name: 'Solstice GT',
  category: 'coupe',
  massKg: 1520,
  maxSpeedKmh: 180,
  reverseMaxSpeedKmh: 38,
  maxEngineForce: 5400,
  maxBrakeForce: 145,
  handbrakeForce: 220,
  wheelRadius: 0.36,
  wheelWidth: 0.25,
  suspensionRestLength: 0.36,
  suspensionStiffness: 34,
  suspensionCompression: 4.2,
  suspensionRelaxation: 4.8,
  maxSuspensionTravel: 0.24,
  frictionSlip: 2.35,
  sideFrictionStiffness: 1.45,
  wheelbaseHalfZ: 1.38,
  trackHalfX: 0.84,
  chassisHalfExtents: [0.92, 0.34, 2.24],
  gearThresholdsKmh: [0, 32, 62, 95, 128, 158],
};

export interface TransmissionState {
  gear: 'P' | 'R' | 'N' | 'D1' | 'D2' | 'D3' | 'D4' | 'D5' | 'D6';
  gearIndex: number; // -1 = R, 0 = N/P, 1..6 = D1..D6
  rpm: number; // 800..7200
}

/**
 * Computes realistic automatic transmission gear and engine RPM from speed and throttle.
 */
export function computeAutomaticTransmission(
  forwardSpeedKmh: number,
  throttle: number,
  reversing: boolean,
  thresholds: number[]
): TransmissionState {
  const absSpeed = Math.abs(forwardSpeedKmh);

  if (reversing && forwardSpeedKmh < -0.5) {
    const revNorm = Math.min(1, absSpeed / 40);
    return {
      gear: 'R',
      gearIndex: -1,
      rpm: 950 + revNorm * 3800 + throttle * 450,
    };
  }

  if (absSpeed < 0.4 && throttle < 0.02) {
    return {
      gear: 'N',
      gearIndex: 0,
      rpm: 820,
    };
  }

  let gearNum = 1;
  for (let i = 1; i < thresholds.length; i++) {
    if (absSpeed >= thresholds[i]) {
      gearNum = i + 1;
    }
  }

  const low = thresholds[gearNum - 1] ?? 0;
  const high = thresholds[gearNum] ?? 185;
  const ratioInGear = Math.max(0, Math.min(1, (absSpeed - low) / Math.max(1, high - low)));
  const rpm = 1150 + ratioInGear * 4900 + throttle * 650;

  return {
    gear: `D${gearNum}` as TransmissionState['gear'],
    gearIndex: gearNum,
    rpm: Math.min(7200, Math.max(820, rpm)),
  };
}
