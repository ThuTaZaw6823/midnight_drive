import { TimePreset, WeatherMode } from '../settings/SettingsManager';

export type EnvironmentId =
  | 'mountain-escape'
  | 'midnight-city'
  | 'ocean-highway'
  | 'countryside'
  | 'rainy-expressway'
  | 'endless-desert';

export type RoadMarkingStyle = 'mountain' | 'city' | 'expressway' | 'countryside' | 'desert';

export interface EnvironmentDescriptor {
  id: EnvironmentId;
  name: string;
  subtitle: string;
  description: string;
  available: boolean;
  phase: string;
  accentColor: string;
  roadLengthLabel: string;
  roadHalfWidth: number;
  laneOffset: number;
  roadStyle: RoadMarkingStyle;
  defaultWeather: WeatherMode;
  defaultTime: TimePreset;
  milkyWayBoost: number;
  waterAudioMode: 'lake' | 'ocean' | 'none';
}

/**
 * All 6 playable Midnight Drive environments.
 * Each world has its own route spline, terrain/water generator, architecture,
 * vegetation, road markings, lighting atmosphere, and minimap silhouette.
 */
export const ENVIRONMENTS: EnvironmentDescriptor[] = [
  {
    id: 'mountain-escape',
    name: 'Mountain Escape',
    subtitle: 'Alpine Highways · Pine Forests · Moonlit Lake',
    description:
      'A 5 km scenic mountain loop winding past dense evergreen forests, a moonlit alpine lake, cable-stayed bay bridge, rock tunnel, and midnight café.',
    available: true,
    phase: 'Playable',
    accentColor: '#6da8ff',
    roadLengthLabel: '5.0 km loop',
    roadHalfWidth: 4.1,
    laneOffset: 2.02,
    roadStyle: 'mountain',
    defaultWeather: 'clear-night',
    defaultTime: 'midnight',
    milkyWayBoost: 1.0,
    waterAudioMode: 'lake',
  },
  {
    id: 'midnight-city',
    name: 'Midnight City',
    subtitle: 'Neon Boulevards · Wet Asphalt · Skyline Bridges',
    description:
      'Rain-slicked 4-lane metropolitan avenues flanked by glowing skyscrapers, vibrant neon signs, traffic light gantries, and a lit harbor bridge.',
    available: true,
    phase: 'Playable',
    accentColor: '#c77dff',
    roadLengthLabel: '4.7 km urban loop',
    roadHalfWidth: 5.8,
    laneOffset: 2.85,
    roadStyle: 'city',
    defaultWeather: 'light-rain',
    defaultTime: 'midnight',
    milkyWayBoost: 0.25,
    waterAudioMode: 'lake',
  },
  {
    id: 'ocean-highway',
    name: 'Ocean Highway',
    subtitle: 'Coastal Cliffs · Moonlit Surf · Lighthouse',
    description:
      'Sweeping seaside cliffs overlooking animated moonlit ocean swells, a rotating-beam coastal lighthouse, sandy coves, and a glowing harbor village.',
    available: true,
    phase: 'Playable',
    accentColor: '#48cae4',
    roadLengthLabel: '5.2 km coastline',
    roadHalfWidth: 4.3,
    laneOffset: 2.1,
    roadStyle: 'mountain',
    defaultWeather: 'clear-night',
    defaultTime: 'midnight',
    milkyWayBoost: 1.15,
    waterAudioMode: 'ocean',
  },
  {
    id: 'countryside',
    name: 'Countryside',
    subtitle: 'Quiet Villages · Rural Lanes · Warm Lanterns',
    description:
      'Gentle rolling pastures, timber cottages, rustic wooden fences, broadleaf orchards, a quiet creek bridge, and warm amber village lanterns.',
    available: true,
    phase: 'Playable',
    accentColor: '#f4a261',
    roadLengthLabel: '4.8 km rural loop',
    roadHalfWidth: 3.85,
    laneOffset: 1.88,
    roadStyle: 'countryside',
    defaultWeather: 'clear-night',
    defaultTime: 'evening',
    milkyWayBoost: 1.25,
    waterAudioMode: 'none',
  },
  {
    id: 'rainy-expressway',
    name: 'Rainy Expressway',
    subtitle: '4-Lane Highway · Continuous Rain · Reflective Asphalt',
    description:
      'Wide high-speed expressway cutting through misty pine hills in steady nighttime rainfall, with overhead highway gantries and illuminated service plazas.',
    available: true,
    phase: 'Playable',
    accentColor: '#72a8d8',
    roadLengthLabel: '5.6 km expressway',
    roadHalfWidth: 6.5,
    laneOffset: 3.15,
    roadStyle: 'expressway',
    defaultWeather: 'heavy-rain',
    defaultTime: 'midnight',
    milkyWayBoost: 0.4,
    waterAudioMode: 'none',
  },
  {
    id: 'endless-desert',
    name: 'Endless Desert',
    subtitle: 'Starlit Canyon · Milky Way · Red-Rock Mesas',
    description:
      'Solitary desert blacktop stretching past stratified red-rock mesas, saguaro silhouettes, a glowing roadside motel diner, and a dazzling Milky Way sky.',
    available: true,
    phase: 'Playable',
    accentColor: '#e9c46a',
    roadLengthLabel: '5.7 km desert loop',
    roadHalfWidth: 4.5,
    laneOffset: 2.2,
    roadStyle: 'desert',
    defaultWeather: 'clear-night',
    defaultTime: 'midnight',
    milkyWayBoost: 2.35,
    waterAudioMode: 'none',
  },
];

export function getEnvironmentById(id: string): EnvironmentDescriptor {
  return ENVIRONMENTS.find((e) => e.id === id) ?? ENVIRONMENTS[0];
}
