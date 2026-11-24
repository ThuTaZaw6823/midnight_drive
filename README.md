# MIDNIGHT DRIVE

> *No destination. No pressure. Just you and the road.*

A peaceful, cinematic browser-based 3D nighttime relaxation driving game built with **Three.js**, **TypeScript**, **Vite**, **Rapier.js**, and the **Web Audio API**.

## Features

- **6 Playable 3D Environments** *(switchable live from Main Menu → Environment or Pause Menu `Esc`)*:
  1. **Mountain Escape** — 5.0 km alpine highway loop, ridged mountains, moonlit alpine lake, pine & broadleaf forests, cable-stayed bridge, vaulted rock tunnel, viewpoint, and Midnight Café / Solstice Energy rest area.
  2. **Midnight City** — 4-lane wet neon boulevard, illuminated skyscrapers with lit window grids, vibrant neon signs, traffic-light gantries, and a neon-arch harbor bridge.
  3. **Ocean Highway** — Coastal cliffside loop overlooking animated moonlit ocean waves, a rotating-beam coastal lighthouse, offshore sea stacks, coastal causeway bridge, and bay village lights.
  4. **Countryside** — Rolling pastoral fields, warm-lit timber cottages, rustic barns, hay bales, split-rail wooden fences, and a stone creek bridge.
  5. **Rainy Expressway** — Wide 4-lane high-speed wet expressway in continuous rain with overhead illuminated green highway gantries and a roadside service plaza.
  6. **Endless Desert** — Solitary desert blacktop framed by stratified red-rock mesas, saguaro cacti, wooden utility poles, a glowing neon Starlight Motel & Diner, and a dazzling Milky Way sky.
- **Rapier.js 3D Vehicle Physics**: `DynamicRayCastVehicleController` with 4-wheel suspension, AWD torque split, automatic 6-speed + Reverse gearbox (`180 km/h` max), speed-sensitive steering, handbrake, and 1:1 trimesh road/terrain/guardrail colliders.
- **Solstice GT Exterior, Garage & First-Person Cockpit**: Clearcoat PBR coupe with selectable Garage paint, 3 wheel styles (*5-Spoke GT*, *Multi-Spoke Mesh*, *Deep Turbine*), ambient cockpit LED strip, headlight tint & brightness, rotating steering wheel, live CanvasTexture dashboard gauges, and **interactive windshield raindrops physically cleared by sweeping wipers**.
- **Cameras & Photo Mode**: Third-Person Chase (scroll wheel zoom), First-Person Cockpit (drag mouse to look, `V` to recenter), Hood Cam, Cinematic Cam, Garage Studio Orbit, and **Photo Mode (`P`)** with free-flying camera, FOV/Exposure sliders, and PNG screenshot export.
- **Atmosphere, Weather & Procedural Audio**: Smooth flash-free transitions across 5 Times of Day (*Midnight, Evening, Early Morning, Sunrise, Sunset*), 4 Weather modes (*Clear Night, Light Rain, Heavy Rain, Mountain Mist*), velocity-slanted rain, wet asphalt reflections, procedural RPM engine synth, wet-tire/wind/rain/spatial water audio, **5-station procedural Ambient Radio**, configurable **Autopilot (`30 / 50 / 70 / 90 km/h`)**, **Zen Mode (`Z`)**, and `localStorage` save persistence.

## Installation & Running

Prerequisites: **Node.js 18+** and **npm**.

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173/` in Chrome, Safari, Edge, or Firefox.

### Build & Tests
```bash
npm run build   # TypeScript check + production Vite build
npm test        # Run Vitest unit tests
```

## Controls

| Key | Action |
| --- | --- |
| `W` / `↑` | Accelerate |
| `S` / `↓` | Brake / Reverse |
| `A` / `D` or `←` / `→` | Steer |
| `Space` | Handbrake |
| `C` | Switch Camera (Chase / Cockpit / Hood / Cinematic) |
| `Mouse Drag` / `V` | Look around Cockpit / Recenter View |
| `Scroll Wheel` | Adjust Third-Person Chase Distance (or Photo FOV) |
| `L` / `B` | Toggle Headlights / Windshield Wipers |
| `H` / `Q` `E` | Horn / Left & Right Turn Indicators |
| `R` / `[` `]` | Play-Pause Radio / Previous & Next Station |
| `F` / `-` `=` | Toggle Autopilot / Adjust Cruising Speed |
| `P` | Photo Mode (Free Cam + PNG Capture) |
| `M` / `Z` | Toggle Minimap / Zen Mode (Hide HUD) |
| `Backspace` | Reset Vehicle onto Highway |
| `Esc` | Pause Menu (Switch Maps, Weather, Time, Quality) |
