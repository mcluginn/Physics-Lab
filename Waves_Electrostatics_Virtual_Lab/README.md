# Physics University Virtual Laboratory

The local site now connects two university laboratory rooms through a walkable three-door university hallway. Rooms 01 and 02 are active; Room 03 is reserved for a future topic.

- `/` — first-person Physics University laboratory hallway and room directory
- `/room-1/index.html` — Room 01: Thermal & Fluid Sciences, copied from the read-only reference laboratory
- `/room-2` — Room 02: Waves, Sound & Fields

Both rooms support first-person laboratory interaction and include a physical exit door back to the hallway. Room 02 uses WASD movement, mouse look, direct click/tap raycasting when pointer lock is unavailable, a touch joystick, collision boundaries, interactive wall placards, physical controls, experimental data clipboards, and a pulsing in-world guide. Its apparatus-first workflow requires each inspection component and setup control to be operated, locks Run until the baseline is verified, waits for a stable instrument reading, and requires three unique conditions between recorded trials.

This is a separate companion project built from the existing Physics 2 virtual-laboratory interaction pattern. The original reference folder and the supplied lesson presentations are not modified.

## Stations

1. Transverse Waves — vibrating string, amplitude, frequency, tension, linear density, wavelength, period, and wave speed.
2. Sound Waves — longitudinal pressure motion, air-column resonance, open/closed harmonics, temperature-dependent sound speed, inverse-square intensity, and decibels.
3. Electrostatics — Coulomb force, attraction/repulsion, electric field, electric potential, and potential energy.

Each station follows an eight-step lab sequence: Explore, Predict, Set up, Run, Measure, Calculate, Analyze, and Report. Progress and scores are saved in the browser on the current device. Calculation verification checks all three frozen trials against the station model within ±2%; the analysis step includes a measured-versus-theoretical trend view and uncertainty selection; the final step exports a locally generated PDF certificate with the data table and rubric.

Room 02 also includes a loading gate for its organized asset library, daylight windows, safety-equipment panels, procedural station audio, source-power/intensity readouts for sound, and vector-correct electrostatic field arrows. The room sequence unlocks Sound Waves after the Transverse Waves certificate and Electrostatics after the Sound Waves certificate.

Room 02's 3D layout is kept in `app/labSceneConfig.ts` (metres, room envelope, tables, stations, door, and collision bounds). `app/equipmentRegistry.ts` defines replaceable wave, sound, and electrostatics assemblies; `app/equipmentAssets.ts` loads a local GLB/GLTF when an entry's `model` path is filled and otherwise keeps the procedural apparatus visible. Add `?debug=1` to `/room-2` to show station bounds, local axes, anchor markers, and the door hinge while tuning future assets.

## Run locally

From this folder, run:

```powershell
pnpm install
pnpm run dev
```

Then open `http://localhost:3000/`.

## Source material

- Lesson 5 — Transverse Waves
- Lesson 6 — Sound Waves
- Lesson 7 — Electrostatics

The supplied presentations were used as subject-matter references. All visual models and interaction code in this folder are newly created for the companion lab.
