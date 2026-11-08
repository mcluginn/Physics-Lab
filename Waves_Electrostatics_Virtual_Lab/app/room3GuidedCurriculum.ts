import {
  type CircuitSettings,
  type OpticsSettings,
  type RelativitySettings,
  type Room3StationId,
} from './room3Model';
import {
  type MultimeterMode,
  type MultimeterJack,
  type TerminalId,
  type MultimeterReading,
} from './circuitSolver';

export type ExperienceMode = 'guided' | 'practice' | 'advanced';

export type GuidedExperimentState = {
  stationId: Room3StationId;
  circuits: CircuitSettings;
  optics: OpticsSettings;
  relativity: RelativitySettings;
  dmmMode: MultimeterMode;
  dmmJack: MultimeterJack;
  redTerminal: TerminalId | null;
  blackTerminal: TerminalId | null;
  jumperClosed: boolean;
  dmmReading: MultimeterReading;
  inspectedEquipment: string[];
};

export type StepValidationResult = {
  isPassed: boolean;
  feedback: string;
  errorType?: 'wrong_mode' | 'wrong_jack' | 'wrong_probes' | 'short_circuit' | 'unpowered' | 'power_not_off' | 'jumper_not_open' | 'other';
  hazardWarning?: string;
  canAutoAssist?: boolean;
};

export type GuidedStepDefinition = {
  id: string;
  stepNumber: number;
  title: string;
  action: string;
  why: string;
  expectedResult: string;
  hint: string;
  targetApparatusId?: string;
  relevantTool?: 'multimeter' | 'power_supply' | 'breadboard' | 'laser' | 'goniometer' | 'lens' | 'accelerator';
  validate: (state: GuidedExperimentState) => StepValidationResult;
  autoAssist?: {
    label: string;
    apply: () => Partial<GuidedExperimentState> | {
      circuits?: Partial<CircuitSettings>;
      optics?: Partial<OpticsSettings>;
      relativity?: Partial<RelativitySettings>;
      dmmMode?: MultimeterMode;
      dmmJack?: MultimeterJack;
      redTerminal?: TerminalId | null;
      blackTerminal?: TerminalId | null;
      jumperClosed?: boolean;
    };
  };
};

export type StationCurriculum = {
  experimentTitle: string;
  experimentSubtitle: string;
  learningGoal: string;
  steps: GuidedStepDefinition[];
};

// -------------------------------------------------------------
// STATION 01: CIRCUITS GUIDED CURRICULUM
// Experiment: Measuring Voltage and Current in a DC Series Circuit
// -------------------------------------------------------------
const CIRCUITS_CURRICULUM: StationCurriculum = {
  experimentTitle: 'Measuring Voltage and Current in a DC Series Circuit',
  experimentSubtitle: 'Introductory Electrical Laboratory · Hands-On Multimeter Operation',
  learningGoal: 'Learn how to configure a digital multimeter, measure potential differences in parallel, and insert an ammeter in series to verify Ohm\'s Law and Kirchhoff\'s Voltage Law.',
  steps: [
    {
      id: 'c-step-1',
      stepNumber: 1,
      title: 'Step 1: Identify Electrical Workbench Equipment',
      action: 'Look at the electrical workbench. Locate and inspect the DC Power Supply, Digital Multimeter, and Resistor Circuit Board.',
      why: 'Before energizing any circuit, a physicist must verify that all instrumentation is present, ungrounded faults are absent, and controls are accessible.',
      expectedResult: 'All 3 station instruments become verified on your checklist.',
      hint: 'Click the inspection cards below, or walk up and interact with the apparatus in the 3D room.',
      targetApparatusId: 'circuits-multimeter',
      relevantTool: 'breadboard',
      validate: (state) => {
        const required = ['circuits-power-switch', 'circuits-multimeter', 'circuits-topology-selector'];
        const missing = required.filter((id) => !state.inspectedEquipment.includes(id));
        if (missing.length === 0) {
          return {
            isPassed: true,
            feedback: '✓ Excellent! All primary electrical instruments have been located and identified.',
          };
        }
        return {
          isPassed: false,
          feedback: `Locate the remaining instruments: ${missing.map((m) => m.replace('circuits-', '').toUpperCase()).join(', ')}.`,
        };
      },
    },
    {
      id: 'c-step-2',
      stepNumber: 2,
      title: 'Step 2: Prepare the DC Series Circuit',
      action: 'Confirm that the three resistors (R1 = 100 Ω, R2 = 220 Ω, R3 = 330 Ω) are connected in series and the series jumper is closed.',
      why: 'A series circuit provides exactly one continuous, unbroken path for electric current to flow. The equivalent resistance is Req = R1 + R2 + R3 = 650 Ω.',
      expectedResult: 'The circuit breadboard matrix confirms a single series loop with total resistance Req = 650 Ω.',
      hint: 'Ensure Circuit Regime is set to "DC Steady-State", Topology is "Series", and Jumper is "CLOSED".',
      relevantTool: 'breadboard',
      validate: (state) => {
        if (state.circuits.mode !== 'dc') {
          return {
            isPassed: false,
            feedback: 'The circuit is currently in AC mode. Please switch to DC Steady-State.',
            errorType: 'wrong_mode',
          };
        }
        if (state.circuits.topology !== 'series') {
          return {
            isPassed: false,
            feedback: 'Circuit topology is not set to Series. Select Series topology on the breadboard.',
            errorType: 'other',
          };
        }
        if (!state.jumperClosed) {
          return {
            isPassed: false,
            feedback: 'The series jumper is currently OPEN. Click "Jumper: CLOSED" to close the circuit loop.',
            errorType: 'other',
          };
        }
        return {
          isPassed: true,
          feedback: '✓ Circuit verified: R1 (100Ω) + R2 (220Ω) + R3 (330Ω) form an unbroken series path (Req = 650.0 Ω).',
        };
      },
      autoAssist: {
        label: 'Auto-Configure DC Series Circuit',
        apply: () => ({
          circuits: { mode: 'dc', topology: 'series', vs: 24.0, r1: 100, r2: 220, r3: 330 },
          jumperClosed: true,
        }),
      },
    },
    {
      id: 'c-step-3',
      stepNumber: 3,
      title: 'Step 3: Prepare the Multimeter (DC Voltage Mode)',
      action: 'Find the rotary selector dial on the Fluke 87V multimeter and turn it to DC Voltage (V⎓).',
      why: 'DC Voltage (V⎓) configures the meter with a 10 MΩ high input impedance so it does not draw current from the circuit while measuring potential difference.',
      expectedResult: 'The multimeter LCD screen will illuminate showing "0.00 V" and the annunciator "V_DC · AUTO".',
      hint: 'Click the "V⎓ (DC V)" button under the Rotary Function Dial controls.',
      targetApparatusId: 'circuits-multimeter',
      relevantTool: 'multimeter',
      validate: (state) => {
        if (state.dmmMode === 'v_dc') {
          return {
            isPassed: true,
            feedback: '✓ Correct! Multimeter dial is set to DC Voltage (V⎓). Meter is in high-impedance voltage sensing mode.',
          };
        }
        return {
          isPassed: false,
          feedback: `Current dial setting is ${state.dmmMode.toUpperCase()}. Turn the rotary dial to V⎓ (DC Voltage).`,
          errorType: 'wrong_mode',
        };
      },
      autoAssist: {
        label: 'Turn Dial to DC Voltage (V⎓)',
        apply: () => ({ dmmMode: 'v_dc' }),
      },
    },
    {
      id: 'c-step-4',
      stepNumber: 4,
      title: 'Step 4: Connect the Multimeter Test Leads',
      action: 'Verify the black test lead is connected to the COM socket and the red test lead is connected to the V·Ω socket.',
      why: 'The COM (common) socket is always reference ground. The V·Ω socket routes signals through the internal high-impedance divider. The mA/10A socket is strictly for current!',
      expectedResult: 'Red lead is plugged into V·Ω jack. The meter displays "V_DC · AUTO · JACK: V_OHM" with zero warning annunciators.',
      hint: 'Click "V·Ω (Hi-Z Volts/Ohms)" under the RED LEAD INPUT JACK controls.',
      targetApparatusId: 'circuits-multimeter',
      relevantTool: 'multimeter',
      validate: (state) => {
        if (state.dmmJack === 'v_ohm') {
          return {
            isPassed: true,
            feedback: '✓ Correct! Red lead is securely inserted into the high-impedance V·Ω jack, and Black lead is in COM.',
          };
        }
        return {
          isPassed: false,
          feedback: 'LEAD MISMATCH: The red lead is in the mA/10A current shunt! Move red lead to the V·Ω jack.',
          errorType: 'wrong_jack',
          hazardWarning: 'Placing a current lead across voltage nodes can cause a short circuit.',
        };
      },
      autoAssist: {
        label: 'Plug Red Lead into V·Ω Jack',
        apply: () => ({ dmmJack: 'v_ohm' }),
      },
    },
    {
      id: 'c-step-5',
      stepNumber: 5,
      title: 'Step 5: Measure Source Voltage (Vs = 24.00 V)',
      action: 'Turn the Power Supply ON. Connect the Black probe to PSU Negative (-) and the Red probe to PSU Positive (+).',
      why: 'Voltage is a relative potential difference between two points. To measure total available electromotive force (EMF), probes are placed in parallel across the power supply rails.',
      expectedResult: 'The multimeter LCD illuminates displaying approximately "24.00 V".',
      hint: 'Turn Power ON using the power switch, then set Red Probe to "PSU Positive (+)" and Black Probe to "PSU Negative (GND)".',
      targetApparatusId: 'circuits-power-switch',
      relevantTool: 'power_supply',
      validate: (state) => {
        if (!state.circuits.powerOn) {
          return {
            isPassed: false,
            feedback: 'Power supply is OFF. Switch Power ON to energize the circuit.',
            errorType: 'unpowered',
          };
        }
        const hasRed = state.redTerminal === 'SRC_POS';
        const hasBlack = state.blackTerminal === 'SRC_NEG';
        if (hasRed && hasBlack) {
          return {
            isPassed: true,
            feedback: `✓ Source Voltage Verified! Fluke 87V reads ${state.dmmReading.displayString} (Theoretical Vs = 24.00 V).`,
          };
        }
        if (state.redTerminal === 'SRC_NEG' && state.blackTerminal === 'SRC_POS') {
          return {
            isPassed: false,
            feedback: 'Polarity Inverted: Meter reads -24.00 V. Swap probes so Red is on (+) and Black is on (-).',
            errorType: 'wrong_probes',
          };
        }
        return {
          isPassed: false,
          feedback: 'Probes are not connected across the power supply. Connect Red probe to PSU (+) and Black probe to PSU (-).',
          errorType: 'wrong_probes',
        };
      },
      autoAssist: {
        label: 'Connect Probes Across Power Supply (24.00 V)',
        apply: () => ({
          circuits: { powerOn: true, vs: 24.0 },
          redTerminal: 'SRC_POS',
          blackTerminal: 'SRC_NEG',
        }),
      },
    },
    {
      id: 'c-step-6',
      stepNumber: 6,
      title: 'Step 6: Measure Voltage Drops Across Resistors (V1, V2, V3)',
      action: 'Move the probes across resistor R1 (Red to R1 Node A, Black to R1 Node B). Observe the voltage drop.',
      why: 'By Ohm\'s Law, each resistor produces a voltage drop V = I × R proportional to its resistance. According to Kirchhoff\'s Voltage Law (KVL), the sum of drops V1 + V2 + V3 must equal Vs (24.0 V).',
      expectedResult: 'R1 voltage drop measures approximately 3.69 V. (R2 = 8.12 V, R3 = 12.18 V).',
      hint: 'Select Red Probe: "Resistor 1 Node A" and Black Probe: "Resistor 1 Node B".',
      relevantTool: 'breadboard',
      validate: (state) => {
        if (!state.circuits.powerOn) {
          return { isPassed: false, feedback: 'Power supply is OFF. Turn power ON to measure voltage drop.', errorType: 'unpowered' };
        }
        const isR1 = (state.redTerminal === 'R1_A' && state.blackTerminal === 'R1_B') || (state.redTerminal === 'R1_B' && state.blackTerminal === 'R1_A');
        const isR2 = (state.redTerminal === 'R2_A' && state.blackTerminal === 'R2_B') || (state.redTerminal === 'R2_B' && state.blackTerminal === 'R2_A');
        const isR3 = (state.redTerminal === 'R3_A' && state.blackTerminal === 'R3_B') || (state.redTerminal === 'R3_B' && state.blackTerminal === 'R3_A');

        if (isR1) {
          return {
            isPassed: true,
            feedback: `✓ Measured R1 Voltage Drop: ${state.dmmReading.displayString} (Theoretical: 3.69 V). Probes correctly spanning R1 in parallel.`,
          };
        }
        if (isR2 || isR3) {
          return {
            isPassed: true,
            feedback: `✓ Measured Resistor Drop: ${state.dmmReading.displayString}. Notice the voltage drop is directly proportional to resistance!`,
          };
        }
        return {
          isPassed: false,
          feedback: 'Connect Red probe to Resistor 1 Node A and Black probe to Resistor 1 Node B.',
          errorType: 'wrong_probes',
        };
      },
      autoAssist: {
        label: 'Connect Probes Across R1 (3.69 V drop)',
        apply: () => ({
          circuits: { powerOn: true, vs: 24.0 },
          redTerminal: 'R1_A',
          blackTerminal: 'R1_B',
        }),
      },
    },
    {
      id: 'c-step-7',
      stepNumber: 7,
      title: 'Step 7: Measure Series Loop Current (I = 36.92 mA)',
      action: 'Turn OFF power supply first. Move Red lead to mA/10A jack and turn dial to A⎓. Open series jumper, insert meter into series break terminals A and B, then restore power.',
      why: 'CRITICAL SAFETY RULE: An ammeter has near-zero internal resistance. It MUST be placed in series by breaking the circuit path. Connecting an ammeter in parallel across a voltage source causes a catastrophic short circuit!',
      expectedResult: 'The circuit loop current measures approximately 36.92 mA. All components conduct the exact same current.',
      hint: '1. Power: OFF → 2. Jumper: OPEN → 3. Jack: mA/10A → 4. Dial: A⎓ → 5. Probes: Series Jack A & B → 6. Power: ON.',
      relevantTool: 'multimeter',
      validate: (state) => {
        // Dangerous short-circuit check
        if (state.dmmReading.tripFuse || state.dmmReading.displayString === 'FUSE') {
          return {
            isPassed: false,
            feedback: 'BLOWN FUSE HAZARD: You placed the ammeter in parallel across the voltage source! The internal 10A fuse tripped to protect the instrument. Click "Reset Fuse" and connect in series.',
            errorType: 'short_circuit',
            hazardWarning: 'Ammeters must never be connected in parallel across power nodes.',
          };
        }

        if (state.dmmJack !== 'ma_10a') {
          return {
            isPassed: false,
            feedback: 'Move the red test lead to the mA/10A current jack before measuring current.',
            errorType: 'wrong_jack',
          };
        }

        if (state.dmmMode !== 'a_dc' && state.dmmMode !== 'a_ac') {
          return {
            isPassed: false,
            feedback: 'Turn the rotary dial to DC Current (A⎓).',
            errorType: 'wrong_mode',
          };
        }

        if (state.jumperClosed) {
          return {
            isPassed: false,
            feedback: 'The series jumper is still closed! Click "Jumper: OPEN" to create the break for the ammeter.',
            errorType: 'jumper_not_open',
          };
        }

        const isSeriesBreak =
          (state.redTerminal === 'SERIES_JACK_A' && state.blackTerminal === 'SERIES_JACK_B') ||
          (state.redTerminal === 'SERIES_JACK_B' && state.blackTerminal === 'SERIES_JACK_A');

        if (!isSeriesBreak) {
          return {
            isPassed: false,
            feedback: 'Connect Red probe to Series Break Terminal A and Black probe to Series Break Terminal B.',
            errorType: 'wrong_probes',
          };
        }

        if (!state.circuits.powerOn) {
          return {
            isPassed: false,
            feedback: 'Probes and jumper are correctly configured in series! Now turn the Power Supply ON to read current.',
            errorType: 'unpowered',
          };
        }

        return {
          isPassed: true,
          feedback: `✓ Series Current Successfully Measured! Fluke 87V reads ${state.dmmReading.displayString} (Theoretical: 36.92 mA). Notice the ammeter completes the circuit loop!`,
        };
      },
      autoAssist: {
        label: 'Insert Ammeter Safely in Series (36.92 mA)',
        apply: () => ({
          dmmJack: 'ma_10a',
          dmmMode: 'a_dc',
          jumperClosed: false,
          redTerminal: 'SERIES_JACK_A',
          blackTerminal: 'SERIES_JACK_B',
          circuits: { powerOn: true, vs: 24.0 },
        }),
      },
    },
    {
      id: 'c-step-8',
      stepNumber: 8,
      title: 'Step 8: Record Empirical Data & Complete Analysis',
      action: 'Transfer all recorded experimental measurements into your Laboratory Notebook and review theoretical comparisons.',
      why: 'Scientific rigor requires comparing empirical observations with physical laws. Quantifying percent error validates instrument calibration and experimental accuracy.',
      expectedResult: 'All measured values align with Ohm\'s Law (I = Vs / Req = 24V / 650Ω = 36.92 mA) within experimental uncertainty.',
      hint: 'Click "Open Laboratory Notebook" or view the summary table below to record trials.',
      relevantTool: 'breadboard',
      validate: (state) => {
        return {
          isPassed: true,
          feedback: '✓ Full Guided Electrical Experiment Completed! You have learned proper multimeter setup, parallel voltage measurement, series current insertion, and circuit safety.',
        };
      },
    },
  ],
};

// -------------------------------------------------------------
// STATION 02: OPTICS GUIDED CURRICULUM
// -------------------------------------------------------------
const OPTICS_CURRICULUM: StationCurriculum = {
  experimentTitle: 'Snell\'s Law, Total Internal Reflection & Lens Optics',
  experimentSubtitle: 'Geometric & Physical Optics Laboratory · Laser Precision Bench',
  learningGoal: 'Investigate how light refracts at dielectric interfaces, discover the critical angle for Total Internal Reflection (TIR), and explore thin lens image formation.',
  steps: [
    {
      id: 'o-step-1',
      stepNumber: 1,
      title: 'Step 1: Inspect Optics Bench Components',
      action: 'Examine the optical rail. Identify the tunable laser source, goniometer prism mount, lens carrier, and observation screen.',
      why: 'Precision optics requires all optical axes to be aligned along the central rail to avoid paraxial aberrations.',
      expectedResult: 'Optics bench components verified on checklist.',
      hint: 'Inspect laser source, prism dial, and observation screen.',
      targetApparatusId: 'optics-laser',
      relevantTool: 'laser',
      validate: (state) => {
        const required = ['optics-laser', 'optics-angle-dial', 'optics-screen'];
        const missing = required.filter((id) => !state.inspectedEquipment.includes(id));
        if (missing.length === 0) {
          return { isPassed: true, feedback: '✓ Optical bench components located and verified.' };
        }
        return { isPassed: false, feedback: `Locate remaining optics apparatus: ${missing.map((m) => m.replace('optics-', '').toUpperCase()).join(', ')}.` };
      },
    },
    {
      id: 'o-step-2',
      stepNumber: 2,
      title: 'Step 2: Energize Tunable Laser Source (λ = 532 nm)',
      action: 'Switch the Laser Source ON and set wavelength to 532 nm (emerald green).',
      why: 'Green laser light at 532 nm provides the standard optical calibration wavelength where human eye sensitivity peaks.',
      expectedResult: 'Coherent green laser beam illuminates the optical track.',
      hint: 'Toggle "⚡ Laser Source: ON" and adjust wavelength slider.',
      targetApparatusId: 'optics-laser',
      relevantTool: 'laser',
      validate: (state) => {
        if (state.optics.powerOn === false) {
          return { isPassed: false, feedback: 'Laser source is powered OFF. Switch Laser Source ON.', errorType: 'unpowered' };
        }
        if (state.optics.wavelength !== 532) {
          return { isPassed: false, feedback: `Laser wavelength is ${state.optics.wavelength} nm. Set slider to 532 nm.` };
        }
        return { isPassed: true, feedback: '✓ Laser energized at 532 nm (Emerald Green). Monochromatic beam ready.' };
      },
      autoAssist: {
        label: 'Energize Laser at 532 nm',
        apply: () => ({ optics: { powerOn: true, wavelength: 532 } }),
      },
    },
    {
      id: 'o-step-3',
      stepNumber: 3,
      title: 'Step 3: Measure Refraction and Snell\'s Law',
      action: 'Set Sub-Mode to "Refraction & TIR", Medium 1 to Air (n1 = 1.00), Medium 2 to Glass (n2 = 1.52), and Incident Angle to θ1 = 30.0°.',
      why: 'Snell\'s Law states n1 · sin(θ1) = n2 · sin(θ2). Entering a denser medium slows the wavefront, bending light towards the normal.',
      expectedResult: 'Refracted beam bends to θ2 = 19.2° (sin(19.2°) = 1.00/1.52 · sin(30°)).',
      hint: 'Select Refraction & TIR, set θ1 = 30.0°, n1 = 1.00, n2 = 1.52.',
      targetApparatusId: 'optics-angle-dial',
      relevantTool: 'goniometer',
      validate: (state) => {
        if (state.optics.subMode !== 'refraction') {
          return { isPassed: false, feedback: 'Select "Refraction & TIR" mode.' };
        }
        if (Math.abs(state.optics.theta1 - 30.0) > 1.0) {
          return { isPassed: false, feedback: `Incident angle is ${state.optics.theta1}°. Set θ1 to 30.0°.` };
        }
        return { isPassed: true, feedback: '✓ Snell\'s Law verified! Incident ray at 30.0° refracts to 19.2° in glass.' };
      },
      autoAssist: {
        label: 'Set Snell\'s Law Refraction (30.0° -> 19.2°)',
        apply: () => ({ optics: { subMode: 'refraction', n1: 1.00, n2: 1.52, theta1: 30.0 } }),
      },
    },
    {
      id: 'o-step-4',
      stepNumber: 4,
      title: 'Step 4: Discover Total Internal Reflection (TIR)',
      action: 'Reverse the media: Set Medium 1 to Glass (n1 = 1.52) and Medium 2 to Air (n2 = 1.00). Increase incident angle past the critical angle (θ1 > 41.1°).',
      why: 'When passing from denser to rarer media, light bends away from normal. At θ1 > θc = arcsin(n2/n1) ≈ 41.1°, no real refracted ray exists and 100% of light reflects internally!',
      expectedResult: 'The status changes to "TOTAL INTERNAL REFLECTION (TIR)" with zero light escaping into air.',
      hint: 'Set n1 = 1.52, n2 = 1.00, and θ1 = 50.0°.',
      targetApparatusId: 'optics-angle-dial',
      relevantTool: 'goniometer',
      validate: (state) => {
        if (state.optics.subMode !== 'refraction') return { isPassed: false, feedback: 'Select Refraction & TIR mode.' };
        if (state.optics.n1 <= state.optics.n2) {
          return { isPassed: false, feedback: 'TIR requires n1 > n2! Set Medium 1 to Glass (1.52) and Medium 2 to Air (1.00).' };
        }
        if (state.optics.theta1 <= 41.2) {
          return { isPassed: false, feedback: `Current angle is ${state.optics.theta1}°. Increase θ1 above the critical angle (41.1°).` };
        }
        return { isPassed: true, feedback: '✓ Total Internal Reflection Observed! 100% of the light wave is reflected internally.' };
      },
      autoAssist: {
        label: 'Configure Total Internal Reflection (θ1 = 50° > θc)',
        apply: () => ({ optics: { subMode: 'refraction', n1: 1.52, n2: 1.00, theta1: 50.0 } }),
      },
    },
    {
      id: 'o-step-5',
      stepNumber: 5,
      title: 'Step 5: Thin Lens Imaging & Focal Plane',
      action: 'Switch Sub-Mode to "Lenses/Mirrors". Set focal length f = +20.0 cm and object distance do = 40.0 cm.',
      why: 'The Gaussian thin lens equation 1/f = 1/do + 1/di predicts that placing an object at 2f (40 cm) forms a real, inverted image at exactly 2f (40 cm) with magnification M = -1.0×.',
      expectedResult: 'Image distance di = 40.0 cm, Real Inverted Image.',
      hint: 'Select Lenses/Mirrors mode, set f = 20 cm, do = 40 cm.',
      targetApparatusId: 'optics-screen',
      relevantTool: 'lens',
      validate: (state) => {
        if (state.optics.subMode !== 'imaging') return { isPassed: false, feedback: 'Select "Lenses/Mirrors" sub-mode.' };
        if (Math.abs(state.optics.focalLength - 20.0) > 1.0) return { isPassed: false, feedback: 'Set focal length f to +20.0 cm.' };
        if (Math.abs(state.optics.objectDistance - 40.0) > 1.0) return { isPassed: false, feedback: 'Set object distance do to 40.0 cm.' };
        return { isPassed: true, feedback: '✓ Thin Lens Formula Verified! Object at 2f (40cm) forms real inverted image at di = 40.0 cm (M = -1.0×).' };
      },
      autoAssist: {
        label: 'Set Lens Calibration (f = 20cm, do = 40cm)',
        apply: () => ({ optics: { subMode: 'imaging', focalLength: 20.0, objectDistance: 40.0 } }),
      },
    },
  ],
};

// -------------------------------------------------------------
// STATION 03: RELATIVITY GUIDED CURRICULUM
// -------------------------------------------------------------
const RELATIVITY_CURRICULUM: StationCurriculum = {
  experimentTitle: 'Relativistic Kinematics, Time Dilation & Length Contraction',
  experimentSubtitle: 'Special Relativity Laboratory · Dual-Frame Particle Accelerator',
  learningGoal: 'Explore Einstein\'s postulates: the constancy of the speed of light c, the Lorentz factor γ, and physical consequences of high-velocity motion.',
  steps: [
    {
      id: 'r-step-1',
      stepNumber: 1,
      title: 'Step 1: Inspect Dual-Frame Observation Deck',
      action: 'Inspect the relativistic flight tunnel, light clock, and alpha particle emitter.',
      why: 'Special relativity compares two reference frames: stationary laboratory Frame S and moving particle proper Frame S\'.',
      expectedResult: 'Relativity apparatus confirmed on checklist.',
      hint: 'Inspect velocity dial, light clock, and contracting rod.',
      targetApparatusId: 'relativity-velocity-dial',
      relevantTool: 'accelerator',
      validate: (state) => {
        const required = ['relativity-velocity-dial', 'relativity-light-clock', 'relativity-contracting-rod'];
        const missing = required.filter((id) => !state.inspectedEquipment.includes(id));
        if (missing.length === 0) return { isPassed: true, feedback: '✓ Observation deck equipment located and verified.' };
        return { isPassed: false, feedback: `Inspect remaining apparatus: ${missing.map((m) => m.replace('relativity-', '').toUpperCase()).join(', ')}.` };
      },
    },
    {
      id: 'r-step-2',
      stepNumber: 2,
      title: 'Step 2: Initialize Particle Rest Frame (β = 0.00c)',
      action: 'Select the Alpha Particle (⁴He²⁺) preset and set velocity ratio β = 0.000c.',
      why: 'At rest (v = 0), the Lorentz factor is exactly γ = 1.000. Time flows at the proper rate (Δt = Δt₀) and tunnel length is uncontracted (L = L₀ = 20.0 m). Rest energy is E₀ = m₀c² = 3727.38 MeV.',
      expectedResult: 'γ = 1.0000, Dilated Time = 10.0 s, Contracted Length = 20.0 m, Kinetic Energy K = 0 MeV.',
      hint: 'Click "Alpha (He²⁺)" preset and slide velocity ratio β to 0.000c.',
      targetApparatusId: 'relativity-velocity-dial',
      relevantTool: 'accelerator',
      validate: (state) => {
        if (state.relativity.massPreset !== 'alpha') return { isPassed: false, feedback: 'Select the Alpha (He²⁺) particle preset.' };
        if (state.relativity.beta > 0.01) return { isPassed: false, feedback: `Velocity ratio is ${state.relativity.beta}c. Set β to 0.000c.` };
        return { isPassed: true, feedback: '✓ Rest Frame Baseline Verified! γ = 1.0000, Rest Energy E₀ = 3727.38 MeV, K = 0 MeV.' };
      },
      autoAssist: {
        label: 'Set Rest Frame Baseline (β = 0.000c)',
        apply: () => ({ relativity: { massPreset: 'alpha', beta: 0.000, properTime: 10.0, properLength: 20.0, powerOn: true } }),
      },
    },
    {
      id: 'r-step-3',
      stepNumber: 3,
      title: 'Step 3: Accelerate to Relativistic Speed (β = 0.600c)',
      action: 'Turn the particle accelerator ACTIVE and dial velocity ratio to β = 0.600c (60% the speed of light).',
      why: 'At 0.600c, relativistic effects become significant: γ = 1 / √(1 - 0.600²) = 1 / 0.800 = 1.2500.',
      expectedResult: 'Speed v = 179.88 × 10⁶ m/s. Lorentz factor γ increases to 1.2500.',
      hint: 'Toggle "⚡ Particle Accelerator: ACTIVE" and set slider β to 0.600c.',
      targetApparatusId: 'relativity-velocity-dial',
      relevantTool: 'accelerator',
      validate: (state) => {
        if (state.relativity.powerOn === false) return { isPassed: false, feedback: 'Accelerator is in STANDBY. Switch Particle Accelerator to ACTIVE.', errorType: 'unpowered' };
        if (Math.abs(state.relativity.beta - 0.600) > 0.01) return { isPassed: false, feedback: `Current speed is ${state.relativity.beta}c. Tune velocity ratio β to 0.600c.` };
        return { isPassed: true, feedback: '✓ Relativistic Speed Attained! β = 0.600c produces exact Lorentz factor γ = 1.2500.' };
      },
      autoAssist: {
        label: 'Accelerate to β = 0.600c (γ = 1.2500)',
        apply: () => ({ relativity: { powerOn: true, beta: 0.600 } }),
      },
    },
    {
      id: 'r-step-4',
      stepNumber: 4,
      title: 'Step 4: Observe Relativistic Length Contraction',
      action: 'Observe the flight tunnel meter-rod in the 3D viewport. Notice that physical dimensions contract along the axis of motion.',
      why: 'According to Lorentz contraction L = L₀ / γ, moving lengths are measured to be shorter by stationary observers: 20.0 m / 1.250 = 16.0 m (−20% contraction). Transverse dimensions remain invariant!',
      expectedResult: 'Flight tunnel contracted length reads 16.00 m (down from 20.0 m rest length).',
      hint: 'Inspect the Contracting Meter-Rod on the workbench.',
      targetApparatusId: 'relativity-contracting-rod',
      relevantTool: 'accelerator',
      validate: (state) => {
        if (Math.abs(state.relativity.beta - 0.600) <= 0.02) {
          return { isPassed: true, feedback: '✓ Length Contraction Verified! Tunnel contracted by 20% to L = 16.00 m.' };
        }
        return { isPassed: false, feedback: 'Keep velocity ratio at β = 0.600c to observe 16.00 m contracted length.' };
      },
    },
    {
      id: 'r-step-5',
      stepNumber: 5,
      title: 'Step 5: Witness Relativistic Time Dilation',
      action: 'Compare the moving light clock with the laboratory clock. Accelerate further to β = 0.800c (γ = 1.667).',
      why: 'Because the speed of light c is invariant, a photon inside a moving clock travels a longer diagonal path. Moving clocks run slower: Δt = γ Δt₀. At β = 0.80c, proper 10.0 s dilates to 16.67 s!',
      expectedResult: 'Lab clock measures dilated time Δt = 16.67 s while the particle experiences only 10.0 s of proper time.',
      hint: 'Tune velocity ratio β to 0.800c.',
      targetApparatusId: 'relativity-light-clock',
      relevantTool: 'accelerator',
      validate: (state) => {
        if (Math.abs(state.relativity.beta - 0.800) <= 0.02) {
          return { isPassed: true, feedback: '✓ Time Dilation Verified! γ = 1.6667: Moving clock ticks 66.7% slower (Δt = 16.67 s).' };
        }
        return { isPassed: false, feedback: `Current speed is ${state.relativity.beta}c. Increase velocity ratio β to 0.800c.` };
      },
      autoAssist: {
        label: 'Tune to β = 0.800c (γ = 1.667)',
        apply: () => ({ relativity: { beta: 0.800 } }),
      },
    },
  ],
};

export const STATION_CURRICULUM: Record<Room3StationId, StationCurriculum> = {
  circuits: CIRCUITS_CURRICULUM,
  optics: OPTICS_CURRICULUM,
  relativity: RELATIVITY_CURRICULUM,
};
