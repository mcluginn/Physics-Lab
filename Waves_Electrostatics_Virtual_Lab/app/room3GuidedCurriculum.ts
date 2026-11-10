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

export type ExperienceMode = 'guided';

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
// Experiment: Verification of Ohm's Law Using a Digital Multimeter
// -------------------------------------------------------------
const CIRCUITS_CURRICULUM: StationCurriculum = {
  experimentTitle: 'Verification of Ohm\'s Law Using a Digital Multimeter',
  experimentSubtitle: 'Introductory Electrical Laboratory · Hands-On Multimeter Operation & 5-Trial Analysis',
  learningGoal: 'Learn how to configure a digital multimeter, measure potential differences in parallel, insert an ammeter in series, collect a 5-trial experimental dataset, and verify Ohm\'s Law (V = I·Req).',
  steps: [
    {
      id: 'c-step-1',
      stepNumber: 1,
      title: 'Step 1: Identify Electrical Workbench Equipment',
      action: 'Look at the electrical workbench. Locate and inspect the DC Power Supply, Digital Multimeter, and Resistor Circuit Board.',
      why: 'Before energizing any circuit, a physicist must verify that all instrumentation is present, ungrounded faults are absent, and controls are accessible.',
      expectedResult: 'All 4 station instruments become verified on your checklist.',
      hint: 'Click the inspection cards below, or walk up and interact with the apparatus in the 3D room.',
      targetApparatusId: 'circuits-multimeter',
      relevantTool: 'breadboard',
      validate: (state) => {
        const required = ['circuits-power-switch', 'circuits-multimeter', 'circuits-oscilloscope', 'circuits-topology-selector'];
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
      title: 'Step 2: Circuit Assembly & Continuity Inspection',
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
        if (state.circuits.topology !== 'series' && state.circuits.topology !== 'single') {
          return {
            isPassed: false,
            feedback: 'Circuit topology is not set to Series or Single Resistor. Select an arrangement on the breadboard.',
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
          feedback: '✓ Circuit verified: Conductive path confirmed with closed jumper loop.',
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
      title: 'Step 3: Power Supply Setup & Energization',
      action: 'Configure the DC Power Supply to nominal 24.0 V DC and switch Power ON.',
      why: 'Establishing steady-state DC electromotive force provides the baseline potential difference necessary to drive current through the resistive network.',
      expectedResult: 'Power supply displays 24.0 V, power indicator glows green, and circuit is energized.',
      hint: 'Slide DC Voltage to 24.0 V and toggle Power Switch to ON.',
      targetApparatusId: 'circuits-power-switch',
      relevantTool: 'power_supply',
      validate: (state) => {
        if (!state.circuits.powerOn) {
          return { isPassed: false, feedback: 'Power supply is currently OFF. Switch Power ON.', errorType: 'unpowered' };
        }
        if (Math.abs(state.circuits.vs - 24.0) > 1.0) {
          return { isPassed: false, feedback: `Power supply is set to ${state.circuits.vs.toFixed(1)} V. Adjust voltage to 24.0 V.` };
        }
        return { isPassed: true, feedback: '✓ Power supply configured and energized at 24.0 V DC.' };
      },
      autoAssist: {
        label: 'Energize Power Supply at 24.0 V',
        apply: () => ({ circuits: { powerOn: true, vs: 24.0 } }),
      },
    },
    {
      id: 'c-step-4',
      stepNumber: 4,
      title: 'Step 4: Multimeter Instrument Preparation',
      action: 'Turn the Fluke 87V rotary dial to DC Voltage (V⎓) and verify test leads: Black in COM, Red in V·Ω.',
      why: 'DC Voltage (V⎓) configures the meter with a 10 MΩ high input impedance so it does not draw current from the circuit while measuring potential difference.',
      expectedResult: 'Multimeter displays "0.00 V" and annunciator shows "V_DC · AUTO · JACK: V_OHM".',
      hint: 'Click "V⎓ (DC V)" on dial and "V·Ω" for red lead input jack.',
      targetApparatusId: 'circuits-multimeter',
      relevantTool: 'multimeter',
      validate: (state) => {
        if (state.dmmMode !== 'v_dc') {
          return { isPassed: false, feedback: `Multimeter dial is set to ${state.dmmMode.toUpperCase()}. Turn dial to V⎓ (DC Voltage).`, errorType: 'wrong_mode' };
        }
        if (state.dmmJack !== 'v_ohm') {
          return { isPassed: false, feedback: 'Red lead is plugged into the current shunt! Move red lead to the V·Ω jack.', errorType: 'wrong_jack' };
        }
        return { isPassed: true, feedback: '✓ Multimeter prepared: High-impedance DC Voltage mode (V⎓) with leads in COM and V·Ω.' };
      },
      autoAssist: {
        label: 'Prepare Multimeter for DC Voltage',
        apply: () => ({ dmmMode: 'v_dc', dmmJack: 'v_ohm' }),
      },
    },
    {
      id: 'c-step-5',
      stepNumber: 5,
      title: 'Step 5: Voltage Measurement Procedure (Parallel)',
      action: 'Connect probes in parallel across the power supply rails (Red to PSU +, Black to PSU -) to measure source voltage (24.00 V) and across resistor R1 (3.69 V).',
      why: 'Voltage is a relative potential difference between two nodes. Voltmeters have high impedance and must always be placed in parallel without breaking the circuit.',
      expectedResult: 'Multimeter reads approximately 24.00 V across source and 3.69 V across R1.',
      hint: 'Connect Red to PSU (+) and Black to PSU (-), then verify drop across R1.',
      targetApparatusId: 'circuits-multimeter',
      relevantTool: 'multimeter',
      validate: (state) => {
        if (!state.circuits.powerOn) {
          return { isPassed: false, feedback: 'Power supply is OFF. Switch Power ON to measure voltage.', errorType: 'unpowered' };
        }
        const isPsu = (state.redTerminal === 'SRC_POS' && state.blackTerminal === 'SRC_NEG');
        const isR1 = (state.redTerminal === 'R1_A' && state.blackTerminal === 'R1_B') || (state.redTerminal === 'R1_B' && state.blackTerminal === 'R1_A');
        if (isPsu || isR1) {
          return {
            isPassed: true,
            feedback: `✓ Parallel Voltage Successfully Measured: ${state.dmmReading.displayString}. Notice the high-impedance meter did not interrupt circuit current.`,
          };
        }
        return {
          isPassed: false,
          feedback: 'Connect Red probe to PSU (+) and Black probe to PSU (-), or connect across Resistor 1 (Node A & B).',
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
      title: 'Step 6: Current Measurement Procedure (Series Insertion)',
      action: 'Turn OFF power supply first. Move Red lead to mA/10A jack and turn dial to A⎓. Open series jumper, insert meter into series break terminals A and B, then restore power.',
      why: 'CRITICAL SAFETY RULE: An ammeter has near-zero internal resistance. It MUST be placed in series by breaking the circuit path. Connecting an ammeter in parallel across a voltage source causes a catastrophic short circuit!',
      expectedResult: 'The circuit loop current measures approximately 36.92 mA. All components conduct the exact same current.',
      hint: '1. Power: OFF → 2. Jumper: OPEN → 3. Jack: mA/10A → 4. Dial: A⎓ → 5. Probes: Series Jack A & B → 6. Power: ON.',
      relevantTool: 'multimeter',
      validate: (state) => {
        if (state.dmmReading.tripFuse || state.dmmReading.displayString === 'FUSE') {
          return {
            isPassed: false,
            feedback: 'BLOWN FUSE HAZARD: You placed the ammeter in parallel across the voltage source! Click "Reset Fuse" and connect in series.',
            errorType: 'short_circuit',
            hazardWarning: 'Ammeters must never be connected in parallel across power nodes.',
          };
        }
        if (state.dmmJack !== 'ma_10a') {
          return { isPassed: false, feedback: 'Move red test lead to the mA/10A jack before measuring current.', errorType: 'wrong_jack' };
        }
        if (state.dmmMode !== 'a_dc' && state.dmmMode !== 'a_ac') {
          return { isPassed: false, feedback: 'Turn the rotary dial to DC Current (A⎓).', errorType: 'wrong_mode' };
        }
        if (state.jumperClosed) {
          return { isPassed: false, feedback: 'The series jumper is closed! Click "Jumper: OPEN" to create the break for the ammeter.', errorType: 'jumper_not_open' };
        }
        const isSeriesBreak =
          (state.redTerminal === 'SERIES_JACK_A' && state.blackTerminal === 'SERIES_JACK_B') ||
          (state.redTerminal === 'SERIES_JACK_B' && state.blackTerminal === 'SERIES_JACK_A');
        if (!isSeriesBreak) {
          return { isPassed: false, feedback: 'Connect probes across Series Break Terminals A and B.', errorType: 'wrong_probes' };
        }
        if (!state.circuits.powerOn) {
          return { isPassed: false, feedback: 'Probes and jumper are configured in series! Now turn Power ON to read current.', errorType: 'unpowered' };
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
      id: 'c-step-7',
      stepNumber: 7,
      title: 'Step 7: Five-Trial Experimental Data Collection',
      action: 'Conduct five measurement trials at assigned voltages: 2 V, 4 V, 6 V, 8 V, and 10 V using the nominal 330 Ω resistor. Measure voltage across the resistor and series current for each trial and record into the empirical dataset.',
      why: 'Single measurements can be subject to random fluctuations. Recording a multi-point dataset across multiple operating points allows physicists to confirm linearity and verify Ohm\'s Law.',
      expectedResult: 'All 5 experimental trials recorded with measured voltage Vi, measured current Ii, and power Pi.',
      hint: 'Use the dedicated Five-Trial collection card. Set each assigned voltage (2V, 4V, 6V, 8V, 10V), measure with the Fluke 87V, and click "Record Trial".',
      relevantTool: 'multimeter',
      validate: (state) => {
        return {
          isPassed: true,
          feedback: '✓ Dedicated Five-Trial Data Collection active. Collect all 5 operating points (2 V, 4 V, 6 V, 8 V, 10 V) with the 330 Ω resistor.',
        };
      },
    },
    {
      id: 'c-step-8',
      stepNumber: 8,
      title: 'Step 8: Experimental Data Computation & Analysis',
      action: 'Calculate experimental resistance Ri = Vi / Ii and power Pi = Vi · Ii for each trial, average resistance Rmean, sample standard deviation s across operating points, percentage error vs 330 Ω, and review linear regression fit (slope = 330 Ω).',
      why: 'Quantitative error analysis and linear regression validate that the resistor obeys Ohm\'s Law with high precision.',
      expectedResult: 'Linear regression confirms slope m = R = 330.0 Ω and R² ≥ 0.999.',
      hint: 'Navigate to Step 8 in the Laboratory Notebook to view complete calculations, regression plot, and certify report.',
      relevantTool: 'breadboard',
      validate: (state) => {
        return {
          isPassed: true,
          feedback: '✓ Full Guided Electrical Experiment Completed! Ohm\'s Law verified with empirical precision.',
        };
      },
    },
  ],
};

// -------------------------------------------------------------
// STATION 02: OPTICS GUIDED CURRICULUM
// -------------------------------------------------------------
const OPTICS_CURRICULUM: StationCurriculum = {
  experimentTitle: 'Verification of Thin Lens Equation (1/f = 1/u + 1/v)',
  experimentSubtitle: 'Geometric & Physical Optics Laboratory · Laser Precision Bench',
  learningGoal: 'Investigate thin lens image formation, measure object and image distances across 5 experimental trials, and verify the Gaussian lens equation f = (u·v)/(u+v).',
  steps: [
    {
      id: 'o-step-1',
      stepNumber: 1,
      title: 'Step 1: Inspect Optics Bench Components',
      action: 'Examine the optical rail. Identify the tunable laser source, converging lens mount, object fixture, and observation screen.',
      why: 'Precision optics requires all optical axes to be aligned along the central rail to avoid paraxial aberrations.',
      expectedResult: 'Optics bench components verified on checklist.',
      hint: 'Inspect laser source, prism/lens carrier, and observation screen.',
      targetApparatusId: 'optics-laser',
      relevantTool: 'laser',
      validate: (state) => {
        const required = ['optics-laser', 'optics-angle-dial', 'optics-screen', 'optics-rail'];
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
      title: 'Step 2: Optical Rail Alignment & Calibration',
      action: 'Verify paraxial alignment along the central optical axis and zero angular deflection.',
      why: 'Accurate optical measurement requires the optical axis of all components to be collinear with the central laser track.',
      expectedResult: 'Central track aligned with zero deflection.',
      hint: 'Align central rail axis.',
      targetApparatusId: 'optics-angle-dial',
      relevantTool: 'goniometer',
      validate: (state) => {
        return { isPassed: true, feedback: '✓ Optical rail aligned along central optical axis.' };
      },
    },
    {
      id: 'o-step-3',
      stepNumber: 3,
      title: 'Step 3: Energize Laser Source (λ = 532 nm)',
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
      id: 'o-step-4',
      stepNumber: 4,
      title: 'Step 4: Mount Converging Lens (f = +20.0 cm)',
      action: 'Switch Sub-Mode to "Lenses/Mirrors" and configure nominal focal length f = +20.0 cm.',
      why: 'A biconvex glass lens acts as a converging optical element that refracts parallel rays toward a real focal point at f.',
      expectedResult: 'Converging lens carrier set to nominal f = +20.0 cm.',
      hint: 'Select Lenses/Mirrors mode and set focal length f = 20.0 cm.',
      targetApparatusId: 'optics-screen',
      relevantTool: 'lens',
      validate: (state) => {
        if (state.optics.subMode !== 'imaging') return { isPassed: false, feedback: 'Select "Lenses/Mirrors" sub-mode.' };
        if (Math.abs(state.optics.focalLength - 20.0) > 1.0) return { isPassed: false, feedback: 'Set focal length f to +20.0 cm.' };
        return { isPassed: true, feedback: '✓ Converging lens mounted with nominal focal length f = +20.0 cm.' };
      },
      autoAssist: {
        label: 'Configure Lens (f = +20.0 cm)',
        apply: () => ({ optics: { subMode: 'imaging', focalLength: 20.0 } }),
      },
    },
    {
      id: 'o-step-5',
      stepNumber: 5,
      title: 'Step 5: Real Image Formation Procedure',
      action: 'Position object lamp at u = 40.0 cm (2f) and observe real inverted image formation at v = 40.0 cm (M = -1.0×).',
      why: 'According to Gaussian optics, placing an object at twice the focal length (2f) produces a real, inverted image at exactly 2f on the opposite side with identical unit size.',
      expectedResult: 'Image formed at di = 40.0 cm, Real Inverted Image.',
      hint: 'Set object distance do = 40.0 cm.',
      targetApparatusId: 'optics-screen',
      relevantTool: 'lens',
      validate: (state) => {
        if (Math.abs(state.optics.objectDistance - 40.0) > 1.0) return { isPassed: false, feedback: 'Set object distance do to 40.0 cm.' };
        return { isPassed: true, feedback: '✓ Symmetric 2f Imaging Verified! Object at 40 cm forms real inverted image at 40 cm (M = -1.0×).' };
      },
      autoAssist: {
        label: 'Position Object at 2f (40.0 cm)',
        apply: () => ({ optics: { objectDistance: 40.0 } }),
      },
    },
    {
      id: 'o-step-6',
      stepNumber: 6,
      title: 'Step 6: Screen Focusing & Sharpness Adjustment',
      action: 'Slide observation screen along the rail until sharp focus is achieved and confirm image sharpness.',
      why: 'Accurate focal length measurement requires recording image distance v only when the projected image plane intersects the observation screen sharply.',
      expectedResult: 'Observation screen positioned at focal plane with maximum sharpness.',
      hint: 'Verify sharp image focus on screen.',
      targetApparatusId: 'optics-screen',
      relevantTool: 'lens',
      validate: (state) => {
        return { isPassed: true, feedback: '✓ Image sharpness verified at focal plane.' };
      },
    },
    {
      id: 'o-step-7',
      stepNumber: 7,
      title: 'Step 7: Five-Trial Experimental Data Collection',
      action: 'Record five experimental trials at assigned object distances u = [30, 35, 40, 50, 60] cm with sharp focus image distances v.',
      why: 'Varying object distance u across 5 conditions allows precise determination of focal length via the Gaussian lens formula.',
      expectedResult: 'Five thin-lens trials recorded in dataset.',
      hint: 'Record trials for u = 30, 35, 40, 50, 60 cm.',
      targetApparatusId: 'optics-screen',
      relevantTool: 'lens',
      validate: (state) => {
        return { isPassed: true, feedback: '✓ Thin-lens 5-trial collection active.' };
      },
    },
    {
      id: 'o-step-8',
      stepNumber: 8,
      title: 'Step 8: Experimental Data Computation & Analysis',
      action: 'Compute experimental focal length fi = (u·v)/(u+v) per trial, average fmean, standard deviation, percentage error vs 20.0 cm, and plot 1/v vs 1/u.',
      why: 'Linear regression of 1/v vs 1/u yields intercept 1/f, providing a rigorous graphical check of the thin lens equation.',
      expectedResult: 'Regression intercept yields experimental focal length f ≈ 20.0 cm.',
      hint: 'Navigate to Step 8 in Laboratory Notebook.',
      targetApparatusId: 'optics-screen',
      relevantTool: 'lens',
      validate: (state) => {
        return { isPassed: true, feedback: '✓ Optics experiment completed and certified!' };
      },
    },
  ],
};

// -------------------------------------------------------------
// STATION 03: RELATIVITY GUIDED CURRICULUM
// -------------------------------------------------------------
const RELATIVITY_CURRICULUM: StationCurriculum = {
  experimentTitle: 'Special Relativity: Lorentz Transformation & Kinematics',
  experimentSubtitle: 'Special Relativity Laboratory · Dual-Frame Particle Accelerator',
  learningGoal: 'Explore Einstein\'s postulates: the constancy of the speed of light c, the Lorentz factor γ = 1/√(1-β²), time dilation, and length contraction across 5 velocity conditions.',
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
        const required = ['relativity-velocity-dial', 'relativity-light-clock', 'relativity-contracting-rod', 'relativity-accelerator'];
        const missing = required.filter((id) => !state.inspectedEquipment.includes(id));
        if (missing.length === 0) return { isPassed: true, feedback: '✓ Observation deck equipment located and verified.' };
        return { isPassed: false, feedback: `Inspect remaining apparatus: ${missing.map((m) => m.replace('relativity-', '').toUpperCase()).join(', ')}.` };
      },
    },
    {
      id: 'r-step-2',
      stepNumber: 2,
      title: 'Step 2: Reference Frame Alignment & Proper Calibration',
      action: 'Calibrate Stationary Frame S against Moving Frame S\'. Confirm proper length L0 = 20.0 m and proper time Δt0 = 10.0 s.',
      why: 'Proper quantities (L0, Δt0) are invariants measured in the particle\'s co-moving rest frame.',
      expectedResult: 'Rest frame baseline calibrated: L0 = 20.0 m, Δt0 = 10.0 s.',
      hint: 'Confirm rest frame baseline.',
      targetApparatusId: 'relativity-velocity-dial',
      relevantTool: 'accelerator',
      validate: (state) => {
        return { isPassed: true, feedback: '✓ Reference frames calibrated with invariant baseline proper dimensions.' };
      },
    },
    {
      id: 'r-step-3',
      stepNumber: 3,
      title: 'Step 3: Accelerator Power & Baseline Calibration (β = 0.00c)',
      action: 'Select the Alpha Particle (⁴He²⁺) preset and set velocity ratio β = 0.000c with Accelerator ACTIVE.',
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
      id: 'r-step-4',
      stepNumber: 4,
      title: 'Step 4: Relativistic Light Clock Preparation',
      action: 'Inspect the photon light clock mechanism and observe the vertical photon reflection path.',
      why: 'Because the speed of light c is invariant, a moving light clock bounces photons along a longer hypotenuse path, causing it to tick slower in the lab frame.',
      expectedResult: 'Light clock ready for relativistic acceleration.',
      hint: 'Inspect light clock in 3D.',
      targetApparatusId: 'relativity-light-clock',
      relevantTool: 'accelerator',
      validate: (state) => {
        return { isPassed: true, feedback: '✓ Light clock mechanism verified.' };
      },
    },
    {
      id: 'r-step-5',
      stepNumber: 5,
      title: 'Step 5: Relativistic Time Dilation Procedure',
      action: 'Accelerate to β = 0.600c and observe dilated time interval Δt = γ Δt0 = 12.50 s.',
      why: 'At 0.600c, the Lorentz factor is γ = 1 / √(1 - 0.36) = 1.2500, causing a 25% dilation in laboratory measured time.',
      expectedResult: 'Dilated time Δt = 12.50 s (up from proper 10.0 s).',
      hint: 'Tune velocity ratio β to 0.600c.',
      targetApparatusId: 'relativity-velocity-dial',
      relevantTool: 'accelerator',
      validate: (state) => {
        if (Math.abs(state.relativity.beta - 0.600) <= 0.02) {
          return { isPassed: true, feedback: '✓ Time Dilation Verified! β = 0.600c yields γ = 1.2500 and Δt = 12.50 s.' };
        }
        return { isPassed: false, feedback: `Current speed is ${state.relativity.beta}c. Set β to 0.600c.` };
      },
      autoAssist: {
        label: 'Accelerate to β = 0.600c',
        apply: () => ({ relativity: { beta: 0.600, powerOn: true } }),
      },
    },
    {
      id: 'r-step-6',
      stepNumber: 6,
      title: 'Step 6: Relativistic Length Contraction Procedure',
      action: 'Observe physical contraction of the flight tunnel and meter rod strictly along the axis of motion (L = L0 / γ = 16.0 m).',
      why: 'Moving objects appear physically shortened along their direction of motion by factor 1/γ to stationary observers.',
      expectedResult: 'Contracted length L = 16.00 m (down from 20.0 m).',
      hint: 'Inspect the contracting rod at β = 0.600c.',
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
      id: 'r-step-7',
      stepNumber: 7,
      title: 'Step 7: Five-Trial Simulation Data Collection',
      action: 'Record five simulation trials across assigned velocity ratios β = [0.10, 0.20, 0.30, 0.40, 0.50]c. Log γ, Δt, and L.',
      why: 'Systematic velocity variation provides the empirical curve needed to demonstrate non-linear relativistic acceleration.',
      expectedResult: 'Five relativistic velocity trials logged in dataset.',
      hint: 'Record trials for β = 0.10, 0.20, 0.30, 0.40, 0.50c.',
      targetApparatusId: 'relativity-velocity-dial',
      relevantTool: 'accelerator',
      validate: (state) => {
        return { isPassed: true, feedback: '✓ Special relativity 5-trial simulation collection active.' };
      },
    },
    {
      id: 'r-step-8',
      stepNumber: 8,
      title: 'Step 8: Experimental Data Computation & Analysis',
      action: 'Compute theoretical Lorentz factors γ, dilated times Δt, sample standard deviation, and plot the relativistic γ vs β curve.',
      why: 'Validates Einstein\'s kinematic equations against simulation data with zero residual error.',
      expectedResult: 'Relativistic curve fit completed and report certified.',
      hint: 'Navigate to Step 8 in Laboratory Notebook.',
      targetApparatusId: 'relativity-velocity-dial',
      relevantTool: 'accelerator',
      validate: (state) => {
        return { isPassed: true, feedback: '✓ Special relativity experiment completed and certified!' };
      },
    },
  ],
};

export const STATION_CURRICULUM: Record<Room3StationId, StationCurriculum> = {
  circuits: CIRCUITS_CURRICULUM,
  optics: OPTICS_CURRICULUM,
  relativity: RELATIVITY_CURRICULUM,
};
