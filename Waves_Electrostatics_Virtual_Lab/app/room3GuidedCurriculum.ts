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
import {
  ROOM3_STEP_HINTS,
  type StepHints,
} from './room3ProgressionMachine';

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
  trialsCount?: number;
  calculationStatus?: string;
  hasConclusion?: boolean;
};

export type StepValidationResult = {
  isPassed: boolean;
  feedback: string;
  errorType?: 'wrong_mode' | 'wrong_jack' | 'wrong_probes' | 'short_circuit' | 'unpowered' | 'power_not_off' | 'jumper_not_open' | 'other';
  hazardWarning?: string;
};

export type GuidedStepDefinition = {
  id: string;
  stepNumber: number;
  title: string;
  action: string;
  why: string;
  expectedResult: string;
  hint: string;
  hints: StepHints;
  targetApparatusId?: string;
  relevantTool?: 'multimeter' | 'power_supply' | 'breadboard' | 'laser' | 'goniometer' | 'lens' | 'accelerator';
  validate: (state: GuidedExperimentState) => StepValidationResult;
};

export type StationCurriculum = {
  experimentTitle: string;
  experimentSubtitle: string;
  learningGoal: string;
  steps: GuidedStepDefinition[];
};

// -------------------------------------------------------------
// STATION 01: CIRCUITS GUIDED CURRICULUM (9 STEPS)
// -------------------------------------------------------------
const CIRCUITS_CURRICULUM: StationCurriculum = {
  experimentTitle: 'Verification of Ohm\'s Law & Resistor Network Analysis',
  experimentSubtitle: 'Introductory Electrical Laboratory · Hands-On Multimeter Operation, 5 Trials & Error Analysis',
  learningGoal: 'Identify electrical components, inspect circuit continuity, energize the DC source, configure the digital multimeter, measure potential difference in parallel, insert an ammeter in series, collect a 5-trial dataset, perform student calculations, and submit an evidence-based conclusion.',
  steps: [
    {
      id: 'c-step-1',
      stepNumber: 1,
      title: 'Step 1: Identify Electrical Workbench Equipment',
      action: 'Approach and inspect the 4 primary electrical instruments: DC Power Supply, Digital Multimeter, Oscilloscope, and Breadboard Matrix.',
      why: 'Before energizing any circuit, a physicist must verify that all instrumentation is present, ungrounded faults are absent, and controls are operational.',
      expectedResult: 'All 4 station instruments verified on your checklist.',
      hint: ROOM3_STEP_HINTS.circuits[0].guidance,
      hints: ROOM3_STEP_HINTS.circuits[0],
      targetApparatusId: 'circuits-multimeter',
      relevantTool: 'breadboard',
      validate: (state) => {
        const required = ['circuits-power-switch', 'circuits-multimeter', 'circuits-oscilloscope', 'circuits-topology-selector'];
        const missing = required.filter((id) => !state.inspectedEquipment.includes(id));
        if (missing.length === 0) {
          return { isPassed: true, feedback: '✓ All primary electrical instruments located and identified.' };
        }
        return { isPassed: false, feedback: `Locate the remaining instruments: ${missing.map((m) => m.replace('circuits-', '').toUpperCase()).join(', ')}.` };
      },
    },
    {
      id: 'c-step-2',
      stepNumber: 2,
      title: 'Step 2: Circuit Assembly & Continuity Inspection',
      action: 'Confirm that the circuit is in DC Steady-State mode, Series topology, and the series loop jumper is CLOSED.',
      why: 'A series circuit provides exactly one continuous, unbroken path for electric current. The equivalent resistance is Req = R1 + R2 + R3.',
      expectedResult: 'The circuit breadboard matrix confirms a single series loop with closed jumper.',
      hint: ROOM3_STEP_HINTS.circuits[1].guidance,
      hints: ROOM3_STEP_HINTS.circuits[1],
      relevantTool: 'breadboard',
      validate: (state) => {
        if (state.circuits.mode !== 'dc') {
          return { isPassed: false, feedback: 'Circuit is currently in AC mode. Please switch to DC Steady-State.', errorType: 'wrong_mode' };
        }
        if (state.circuits.topology !== 'series' && state.circuits.topology !== 'single') {
          return { isPassed: false, feedback: 'Select Series or Single Resistor topology on the breadboard.', errorType: 'other' };
        }
        if (!state.jumperClosed) {
          return { isPassed: false, feedback: 'The series jumper is currently OPEN. Click "Jumper: CLOSED" to establish loop continuity.', errorType: 'other' };
        }
        return { isPassed: true, feedback: '✓ Circuit verified: Loop continuity confirmed with closed jumper.' };
      },
    },
    {
      id: 'c-step-3',
      stepNumber: 3,
      title: 'Step 3: DC Power Supply Energization',
      action: 'Configure the DC Power Supply to at least 2.0 V DC and switch the main Power Switch to ON.',
      why: 'Establishing steady-state DC electromotive force provides the potential difference necessary to drive current through the resistive network.',
      expectedResult: 'Power supply is ON, displays steady voltage, and circuit is energized.',
      hint: ROOM3_STEP_HINTS.circuits[2].guidance,
      hints: ROOM3_STEP_HINTS.circuits[2],
      targetApparatusId: 'circuits-power-switch',
      relevantTool: 'power_supply',
      validate: (state) => {
        if (!state.circuits.powerOn) {
          return { isPassed: false, feedback: 'Power supply is currently OFF. Switch Power ON.', errorType: 'unpowered' };
        }
        if (state.circuits.vs < 2.0) {
          return { isPassed: false, feedback: `Power supply is set to ${state.circuits.vs.toFixed(1)} V. Adjust voltage to at least 2.0 V.` };
        }
        return { isPassed: true, feedback: `✓ Power supply energized at ${state.circuits.vs.toFixed(1)} V DC.` };
      },
    },
    {
      id: 'c-step-4',
      stepNumber: 4,
      title: 'Step 4: Multimeter Instrument Preparation',
      action: 'Turn the Fluke 87V rotary dial to DC Voltage (V⎓) and verify test leads: Black in COM, Red in V·Ω.',
      why: 'DC Voltage (V⎓) configures the meter with a 10 MΩ high input impedance so it does not draw current or disturb the circuit while measuring potential difference.',
      expectedResult: 'Multimeter displays "0.00 V" and annunciator shows "V_DC · AUTO · JACK: V_OHM".',
      hint: ROOM3_STEP_HINTS.circuits[3].guidance,
      hints: ROOM3_STEP_HINTS.circuits[3],
      targetApparatusId: 'circuits-multimeter',
      relevantTool: 'multimeter',
      validate: (state) => {
        if (state.dmmMode !== 'v_dc') {
          return { isPassed: false, feedback: `Multimeter dial is set to ${state.dmmMode.toUpperCase()}. Turn dial to V⎓ (DC Voltage).`, errorType: 'wrong_mode' };
        }
        if (state.dmmJack !== 'v_ohm') {
          return { isPassed: false, feedback: 'Red lead is plugged into current shunt! Move red lead to the V·Ω jack.', errorType: 'wrong_jack' };
        }
        return { isPassed: true, feedback: '✓ Multimeter prepared: High-impedance DC Voltage mode (V⎓) with leads in COM and V·Ω.' };
      },
    },
    {
      id: 'c-step-5',
      stepNumber: 5,
      title: 'Step 5: Voltage Measurement Procedure (Parallel)',
      action: 'Connect probes in parallel across the power supply rails (Red to PSU +, Black to PSU -) or across Resistor R1.',
      why: 'Voltage is a relative potential difference between two nodes. Voltmeters have high impedance and must always be placed in parallel without breaking the circuit.',
      expectedResult: 'Multimeter reads voltage drop without interrupting circuit loop current.',
      hint: ROOM3_STEP_HINTS.circuits[4].guidance,
      hints: ROOM3_STEP_HINTS.circuits[4],
      targetApparatusId: 'circuits-multimeter',
      relevantTool: 'multimeter',
      validate: (state) => {
        if (!state.circuits.powerOn) {
          return { isPassed: false, feedback: 'Power supply is OFF. Switch Power ON to measure voltage.', errorType: 'unpowered' };
        }
        const isPsu = (state.redTerminal === 'SRC_POS' && state.blackTerminal === 'SRC_NEG') || (state.redTerminal === 'SRC_NEG' && state.blackTerminal === 'SRC_POS');
        const isR1 = (state.redTerminal === 'R1_A' && state.blackTerminal === 'R1_B') || (state.redTerminal === 'R1_B' && state.blackTerminal === 'R1_A');
        const hasValidReading = state.dmmReading.isValidMeasurement && Math.abs(state.dmmReading.value ?? 0) > 0.5;
        if (isPsu || isR1 || hasValidReading) {
          return {
            isPassed: true,
            feedback: `✓ Parallel Voltage Successfully Measured: ${state.dmmReading.displayString}. Notice the high-impedance meter did not interrupt circuit current.`,
          };
        }
        return {
          isPassed: false,
          feedback: 'Connect Red probe to PSU (+) and Black probe to PSU (-), or connect across Resistor R1.',
          errorType: 'wrong_probes',
        };
      },
    },
    {
      id: 'c-step-6',
      stepNumber: 6,
      title: 'Step 6: Current Measurement Procedure (Series Insertion)',
      action: 'Switch power OFF, move Red lead to mA/10A jack, turn dial to A⎓, open series jumper, connect probes across series break terminals A & B, then restore power ON.',
      why: 'CRITICAL SAFETY RULE: An ammeter has near-zero internal resistance. It MUST be placed in series by breaking the circuit path. Connecting an ammeter in parallel across a voltage source creates a dangerous short circuit and trips the fuse.',
      expectedResult: 'The circuit loop current measures safely. All series components conduct the exact same loop current.',
      hint: ROOM3_STEP_HINTS.circuits[5].guidance,
      hints: ROOM3_STEP_HINTS.circuits[5],
      relevantTool: 'multimeter',
      validate: (state) => {
        if (state.dmmReading.tripFuse || state.dmmReading.displayString === 'FUSE') {
          return {
            isPassed: false,
            feedback: 'BLOWN FUSE HAZARD: You placed the ammeter in parallel! Reset fuse and connect in series across the break.',
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
          feedback: `✓ Series Current Successfully Measured! Fluke 87V reads ${state.dmmReading.displayString}. Loop complete!`,
        };
      },
    },
    {
      id: 'c-step-7',
      stepNumber: 7,
      title: 'Step 7: Five-Trial Empirical Data Collection',
      action: 'Perform five experimental measurement trials across assigned operating voltages [2V, 4V, 6V, 8V, 10V] across the 330 Ω resistor. For each trial, measure voltage and series current, and record into the empirical dataset.',
      why: 'Single measurements can be subject to random fluctuations. Recording a multi-point dataset across 5 operating points allows physicists to confirm linearity and verify Ohm\'s Law.',
      expectedResult: 'All 5 experimental trials recorded into the laboratory notebook dataset.',
      hint: ROOM3_STEP_HINTS.circuits[6].guidance,
      hints: ROOM3_STEP_HINTS.circuits[6],
      relevantTool: 'multimeter',
      validate: (state) => {
        const count = state.trialsCount ?? 0;
        if (count >= 5) {
          return { isPassed: true, feedback: '✓ All 5 experimental trials recorded into lab dataset! Proceed to Step 8.' };
        }
        return {
          isPassed: false,
          feedback: `Record all 5 distinct experimental trials (currently logged: ${count}/5). Adjust voltage to assigned points and record.`,
        };
      },
    },
    {
      id: 'c-step-8',
      stepNumber: 8,
      title: 'Step 8: Student-Performed Data Computation',
      action: 'Manually compute experimental resistance R = V / I (converting mA to A) and power P = V · I for all 5 trials. Enter your calculated values into the computation fields and submit for verification.',
      why: 'Active student computation develops quantitative analytical competence and reinforces unit conversion fundamentals (1 mA = 10⁻³ A).',
      expectedResult: 'All 5 calculated resistances verified within ±2.5% physical tolerance.',
      hint: ROOM3_STEP_HINTS.circuits[7].guidance,
      hints: ROOM3_STEP_HINTS.circuits[7],
      relevantTool: 'breadboard',
      validate: (state) => {
        if (state.calculationStatus === 'validated') {
          return { isPassed: true, feedback: '✓ All student calculations verified within theoretical physical tolerance! Proceed to Step 9.' };
        }
        return {
          isPassed: false,
          feedback: 'Enter your computed resistance values for all 5 trials in the notebook and click "Validate & Submit Calculations".',
        };
      },
    },
    {
      id: 'c-step-9',
      stepNumber: 9,
      title: 'Step 9: Observations, Scientific Interpretation & Conclusion',
      action: 'Formulate evidence-based observations from your 5-trial dataset, connect results to Ohm\'s and Kirchhoff\'s laws, and write a complete Claim–Evidence–Reasoning scientific conclusion.',
      why: 'Scientific inquiry requires synthesizing empirical data into coherent physical interpretations and supporting conclusions with concrete evidence.',
      expectedResult: 'Observations completed and Claim–Evidence–Reasoning conclusion submitted.',
      hint: ROOM3_STEP_HINTS.circuits[8].guidance,
      hints: ROOM3_STEP_HINTS.circuits[8],
      relevantTool: 'breadboard',
      validate: (state) => {
        if (state.hasConclusion) {
          return { isPassed: true, feedback: '✓ Observations and Claim–Evidence–Reasoning conclusion submitted! Station Mastery Achieved.' };
        }
        return {
          isPassed: false,
          feedback: 'Complete the Observations and Claim–Evidence–Reasoning sections in Step 9 of the notebook to certify.',
        };
      },
    },
  ],
};

// -------------------------------------------------------------
// STATION 02: OPTICS GUIDED CURRICULUM (9 STEPS)
// -------------------------------------------------------------
const OPTICS_CURRICULUM: StationCurriculum = {
  experimentTitle: 'Verification of Thin Lens Equation & Image Formation',
  experimentSubtitle: 'Geometric & Physical Optics Laboratory · Real Inverted Image Projection & Focal Length Determination',
  learningGoal: 'Identify optical bench apparatus, calibrate the paraxial track, energize the laser source at 532 nm, mount the converging lens (f = +20 cm), investigate symmetric 2f imaging, verify screen focusing criteria, collect 5 experimental trials, perform focal length calculations, and formulate an evidence-based conclusion.',
  steps: [
    {
      id: 'o-step-1',
      stepNumber: 1,
      title: 'Step 1: Inspect Optics Bench Components',
      action: 'Examine the optical rail bench. Locate and inspect the Tunable Laser Diode, Goniometer Prism Dial, Lens Carrier, and Observation Screen.',
      why: 'Precision optical measurement requires verifying all optical elements are aligned along a common optical rail to prevent paraxial aberrations.',
      expectedResult: 'All 4 optics bench components verified on your checklist.',
      hint: ROOM3_STEP_HINTS.optics[0].guidance,
      hints: ROOM3_STEP_HINTS.optics[0],
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
      action: 'Verify paraxial alignment along the central optical axis with zero angular deflection.',
      why: 'Paraxial optical rays travel close to the optical axis with small angular deviations, satisfying the paraxial approximation sin θ ≈ θ.',
      expectedResult: 'Central optical track aligned with zero deflection.',
      hint: ROOM3_STEP_HINTS.optics[1].guidance,
      hints: ROOM3_STEP_HINTS.optics[1],
      targetApparatusId: 'optics-angle-dial',
      relevantTool: 'goniometer',
      validate: () => {
        return { isPassed: true, feedback: '✓ Optical rail aligned along central optical axis.' };
      },
    },
    {
      id: 'o-step-3',
      stepNumber: 3,
      title: 'Step 3: Energize Laser Source (λ = 532 nm)',
      action: 'Switch the Laser Source ON and set wavelength slider to 532 nm (emerald green).',
      why: 'Monochromatic green light at 532 nm provides the standard optical reference wavelength where human photopic visual sensitivity peaks.',
      expectedResult: 'Coherent green laser beam illuminates the optical track.',
      hint: ROOM3_STEP_HINTS.optics[2].guidance,
      hints: ROOM3_STEP_HINTS.optics[2],
      targetApparatusId: 'optics-laser',
      relevantTool: 'laser',
      validate: (state) => {
        if (!state.optics.powerOn) {
          return { isPassed: false, feedback: 'Laser source is powered OFF. Switch Laser Source ON.', errorType: 'unpowered' };
        }
        if (state.optics.wavelength !== 532) {
          return { isPassed: false, feedback: `Laser wavelength is ${state.optics.wavelength} nm. Set slider to 532 nm.` };
        }
        return { isPassed: true, feedback: '✓ Laser energized at 532 nm (Emerald Green). Monochromatic beam ready.' };
      },
    },
    {
      id: 'o-step-4',
      stepNumber: 4,
      title: 'Step 4: Mount Converging Lens (f = +20.0 cm)',
      action: 'Switch Sub-Mode to "Lenses/Mirrors" and configure nominal focal length f = +20.0 cm.',
      why: 'A biconvex glass lens acts as a converging optical element (f > 0) that refracts parallel incident rays toward a real focus on the opposite side.',
      expectedResult: 'Converging lens carrier set to nominal f = +20.0 cm.',
      hint: ROOM3_STEP_HINTS.optics[3].guidance,
      hints: ROOM3_STEP_HINTS.optics[3],
      targetApparatusId: 'optics-screen',
      relevantTool: 'lens',
      validate: (state) => {
        if (state.optics.subMode !== 'imaging') return { isPassed: false, feedback: 'Select "Lenses/Mirrors" sub-mode.' };
        if (Math.abs(state.optics.focalLength - 20.0) > 1.0) return { isPassed: false, feedback: 'Set focal length f to +20.0 cm.' };
        return { isPassed: true, feedback: '✓ Converging lens mounted with nominal focal length f = +20.0 cm.' };
      },
    },
    {
      id: 'o-step-5',
      stepNumber: 5,
      title: 'Step 5: Real Image Formation Procedure (Symmetric 2f)',
      action: 'Position object lamp at u = 40.0 cm (2f) and observe real inverted image formation at v = 40.0 cm (M = -1.0×).',
      why: 'Gaussian lens formula: 1/f = 1/u + 1/v. When object distance u = 2f, image distance v = 2f and magnification M = -1.0× (real, inverted, unit size).',
      expectedResult: 'Image formed at v = 40.0 cm, Real Inverted Image.',
      hint: ROOM3_STEP_HINTS.optics[4].guidance,
      hints: ROOM3_STEP_HINTS.optics[4],
      targetApparatusId: 'optics-screen',
      relevantTool: 'lens',
      validate: (state) => {
        if (Math.abs(state.optics.objectDistance - 40.0) > 1.5) return { isPassed: false, feedback: 'Set object distance u to exactly 40.0 cm (2f).' };
        return { isPassed: true, feedback: '✓ Symmetric 2f Imaging Verified! Object at 40 cm forms real inverted image at 40 cm (M = -1.0×).' };
      },
    },
    {
      id: 'o-step-6',
      stepNumber: 6,
      title: 'Step 6: Screen Focusing & Sharpness Adjustment',
      action: 'Slide observation screen along the rail until sharp focus is achieved and confirm image sharpness.',
      why: 'Accurate focal length measurement requires recording image distance v only when the physical detector screen lies in the exact focal image plane.',
      expectedResult: 'Observation screen positioned at focal plane with maximum sharpness.',
      hint: ROOM3_STEP_HINTS.optics[5].guidance,
      hints: ROOM3_STEP_HINTS.optics[5],
      targetApparatusId: 'optics-screen',
      relevantTool: 'lens',
      validate: (state) => {
        const focalV = (state.optics.objectDistance * 20.0) / Math.max(0.1, state.optics.objectDistance - 20.0);
        const isSharp = Math.abs(state.optics.screenDistance * 100 - focalV) < 8.0;
        if (!isSharp) {
          return { isPassed: false, feedback: 'Slide the observation screen until image achieves sharp focus.' };
        }
        return { isPassed: true, feedback: '✓ Image sharpness verified at focal plane.' };
      },
    },
    {
      id: 'o-step-7',
      stepNumber: 7,
      title: 'Step 7: Five-Trial Empirical Data Collection',
      action: 'Record five experimental trials across assigned object distances u = [30, 35, 40, 50, 60] cm with sharp focus image distances v.',
      why: 'Varying object distance u across 5 conditions allows precise determination of focal length via the Gaussian lens formula: 1/f = 1/u + 1/v.',
      expectedResult: 'Five thin-lens trials recorded in empirical dataset.',
      hint: ROOM3_STEP_HINTS.optics[6].guidance,
      hints: ROOM3_STEP_HINTS.optics[6],
      targetApparatusId: 'optics-screen',
      relevantTool: 'lens',
      validate: (state) => {
        const count = state.trialsCount ?? 0;
        if (count >= 5) {
          return { isPassed: true, feedback: '✓ All 5 thin-lens trials recorded! Proceed to Step 8.' };
        }
        return {
          isPassed: false,
          feedback: `Record all 5 distinct experimental trials (currently logged: ${count}/5). Set object distance u to [30, 35, 40, 50, 60] cm and record.`,
        };
      },
    },
    {
      id: 'o-step-8',
      stepNumber: 8,
      title: 'Step 8: Student-Performed Data Computation',
      action: 'Compute experimental focal length f = (u · v) / (u + v) for each of the 5 recorded trials. Enter computed values in cm and submit for validation.',
      why: 'Calculating focal length per trial and performing linear regression (1/v vs 1/u) confirms the Gaussian lens formula with quantitative rigor.',
      expectedResult: 'All 5 calculated focal lengths verified within ±2.5% physical tolerance (f ≈ 20.0 cm).',
      hint: ROOM3_STEP_HINTS.optics[7].guidance,
      hints: ROOM3_STEP_HINTS.optics[7],
      targetApparatusId: 'optics-screen',
      relevantTool: 'lens',
      validate: (state) => {
        if (state.calculationStatus === 'validated') {
          return { isPassed: true, feedback: '✓ All focal length calculations verified within physical tolerance! Proceed to Step 9.' };
        }
        return {
          isPassed: false,
          feedback: 'Enter your computed focal lengths for all 5 trials in the notebook and click "Validate & Submit Calculations".',
        };
      },
    },
    {
      id: 'o-step-9',
      stepNumber: 9,
      title: 'Step 9: Observations, Scientific Interpretation & Conclusion',
      action: 'Record optical observations of image distance, inversion, and focal behavior, interpret findings via Gaussian thin lens theory, and formulate a Claim–Evidence–Reasoning scientific conclusion.',
      why: 'A complete scientific investigation concludes with synthesizing empirical measurements into physical explanations of lens behavior.',
      expectedResult: 'Optical observations and Claim–Evidence–Reasoning conclusion submitted.',
      hint: ROOM3_STEP_HINTS.optics[8].guidance,
      hints: ROOM3_STEP_HINTS.optics[8],
      targetApparatusId: 'optics-screen',
      relevantTool: 'lens',
      validate: (state) => {
        if (state.hasConclusion) {
          return { isPassed: true, feedback: '✓ Optics observations and Claim–Evidence–Reasoning conclusion submitted! Station Mastery Achieved.' };
        }
        return {
          isPassed: false,
          feedback: 'Complete the Observations and Claim–Evidence–Reasoning sections in Step 9 of the notebook to certify.',
        };
      },
    },
  ],
};

// -------------------------------------------------------------
// STATION 03: RELATIVITY GUIDED CURRICULUM (9 STEPS)
// -------------------------------------------------------------
const RELATIVITY_CURRICULUM: StationCurriculum = {
  experimentTitle: 'Special Relativity: Lorentz Transformation & Kinematics',
  experimentSubtitle: 'Special Relativity Laboratory · Dual-Frame Particle Accelerator & Photon Clock',
  learningGoal: 'Identify relativistic apparatus, observe proper time baseline Δτ = 6.671 ns, accelerate carrier sled, compare photon trajectories between Frame S and S\', investigate time dilation Δt = γ Δτ, investigate length contraction L = L₀/γ, collect 5 simulation runs, calculate Lorentz factors, and formulate a relativistic spacetime conclusion.',
  steps: [
    {
      id: 'r-step-1',
      stepNumber: 1,
      title: 'Step 1: Identify Relativistic Equipment & Reference Frames',
      action: 'Identify the two-mirror photon clock, moving reference-frame telemetry console, velocity regulator dial, and moving-rod interferometer.',
      why: 'Special relativity investigates relative motion between two inertial frames: Stationary Laboratory Frame S and Moving Rest Frame S\'.',
      expectedResult: 'All 4 relativistic station apparatus confirmed on checklist.',
      hint: ROOM3_STEP_HINTS.relativity[0].guidance,
      hints: ROOM3_STEP_HINTS.relativity[0],
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
      title: 'Step 2: Observe the Rest Frame (Photon Clock Baseline)',
      action: 'Inspect the stationary photon clock. Observe the vertical round-trip path between mirrors (D = 1.00 m) and verify proper time Δτ = 2D/c ≈ 6.671 ns.',
      why: 'Proper time Δτ is measured by a clock at rest in its own inertial frame where ticks occur at the same spatial point.',
      expectedResult: 'Proper time verified: Δτ = 6.671 ns for mirror separation D = 1.00 m.',
      hint: ROOM3_STEP_HINTS.relativity[1].guidance,
      hints: ROOM3_STEP_HINTS.relativity[1],
      targetApparatusId: 'relativity-light-clock',
      relevantTool: 'accelerator',
      validate: () => {
        return { isPassed: true, feedback: '✓ Proper time baseline verified: Δτ = 2D/c = 6.671 ns.' };
      },
    },
    {
      id: 'r-step-3',
      stepNumber: 3,
      title: 'Step 3: Introduce Relative Motion (Accelerate Sled)',
      action: 'Accelerate the carrier sled to relativistic velocity. Set velocity ratio β to 0.10c or higher and verify simulation is active.',
      why: 'Einstein\'s first postulate dictates that the laws of physics are identical in all inertial reference frames, but measurements of time and space are frame-dependent.',
      expectedResult: 'Carrier sled accelerating along maglev guide with relative velocity v = β·c.',
      hint: ROOM3_STEP_HINTS.relativity[2].guidance,
      hints: ROOM3_STEP_HINTS.relativity[2],
      targetApparatusId: 'relativity-velocity-dial',
      relevantTool: 'accelerator',
      validate: (state) => {
        if (!state.relativity.powerOn) return { isPassed: false, feedback: 'Particle accelerator is inactive. Switch power ON.' };
        if (state.relativity.beta >= 0.10) {
          return { isPassed: true, feedback: `✓ Relative motion established at β = ${state.relativity.beta.toFixed(2)}c.` };
        }
        return { isPassed: false, feedback: 'Increase velocity ratio to at least β = 0.10c.' };
      },
    },
    {
      id: 'r-step-4',
      stepNumber: 4,
      title: 'Step 4: Investigate Photon Motion & Reference Frame Invariance',
      action: 'Switch between Frame S (Lab Observer) and Frame S\' (Moving Rest Frame). Observe the diagonal zigzag photon path in the lab frame vs. vertical bounce in rest frame, while c remains invariant.',
      why: 'Because the speed of light c is invariant in all frames, the light pulse traveling the longer diagonal hypotenuse in the lab frame requires a longer time interval.',
      expectedResult: 'Diagonal photon trajectory observed in lab frame and vertical bounce confirmed in rest frame.',
      hint: ROOM3_STEP_HINTS.relativity[3].guidance,
      hints: ROOM3_STEP_HINTS.relativity[3],
      targetApparatusId: 'relativity-light-clock',
      relevantTool: 'accelerator',
      validate: () => {
        return { isPassed: true, feedback: '✓ Reference frame trajectory comparison verified.' };
      },
    },
    {
      id: 'r-step-5',
      stepNumber: 5,
      title: 'Step 5: Investigate Relativistic Time Dilation',
      action: 'Observe how the extended diagonal path in the laboratory frame causes the moving clock\'s tick interval to dilate: Δt = γ Δτ.',
      why: 'Geometric substitution shows c²(Δt/2)² = D² + (v Δt/2)², yielding Δt = Δτ / √(1 - v²/c²) = γ Δτ.',
      expectedResult: 'Laboratory measured tick interval Δt expands by Lorentz factor γ.',
      hint: ROOM3_STEP_HINTS.relativity[4].guidance,
      hints: ROOM3_STEP_HINTS.relativity[4],
      targetApparatusId: 'relativity-light-clock',
      relevantTool: 'accelerator',
      validate: () => {
        return { isPassed: true, feedback: '✓ Time dilation principle verified: Δt = γ Δτ.' };
      },
    },
    {
      id: 'r-step-6',
      stepNumber: 6,
      title: 'Step 6: Investigate Length Contraction & Simultaneity',
      action: 'Activate the moving-rod demonstration (L₀ = 10.00 m). Observe contracted length L = L₀/γ measured by simultaneous endpoint detection in the laboratory frame.',
      why: 'Length contraction is an invariant consequence of the relativity of simultaneity: measuring both endpoints simultaneously in the lab frame yields L = L₀ / γ.',
      expectedResult: 'Moving rod measured at contracted length L = L₀ / γ without mechanical compression force.',
      hint: ROOM3_STEP_HINTS.relativity[5].guidance,
      hints: ROOM3_STEP_HINTS.relativity[5],
      targetApparatusId: 'relativity-contracting-rod',
      relevantTool: 'accelerator',
      validate: () => {
        return { isPassed: true, feedback: '✓ Relativistic length contraction verified: L = L₀ / γ.' };
      },
    },
    {
      id: 'r-step-7',
      stepNumber: 7,
      title: 'Step 7: Five-Condition Simulation Data Collection',
      action: 'Run five simulation conditions across assigned relative velocities β = [0.10, 0.30, 0.50, 0.70, 0.90]c. Record Lorentz factor γ, dilated time Δt, and contracted length L into dataset.',
      why: 'Collecting data across five velocity conditions demonstrates the non-linear asymptotic acceleration toward the speed of light.',
      expectedResult: 'Five relativistic simulation runs logged in dataset.',
      hint: ROOM3_STEP_HINTS.relativity[6].guidance,
      hints: ROOM3_STEP_HINTS.relativity[6],
      targetApparatusId: 'relativity-velocity-dial',
      relevantTool: 'accelerator',
      validate: (state) => {
        const count = state.trialsCount ?? 0;
        if (count >= 5) {
          return { isPassed: true, feedback: '✓ All 5 relativistic simulation runs recorded! Proceed to Step 8.' };
        }
        return {
          isPassed: false,
          feedback: `Record all 5 distinct simulation runs (currently logged: ${count}/5). Adjust velocity to assigned β values and log run.`,
        };
      },
    },
    {
      id: 'r-step-8',
      stepNumber: 8,
      title: 'Step 8: Student-Performed Relativistic Computation',
      action: 'Calculate the theoretical Lorentz factor γ = 1 / √(1 − β²) for each of the 5 simulation runs. Enter computed values to 4 decimal places and submit for verification.',
      why: 'Computations verify Einstein\'s kinematic equations against computational simulation telemetry with zero residual error.',
      expectedResult: 'All 5 Lorentz factors verified within theoretical tolerance.',
      hint: ROOM3_STEP_HINTS.relativity[7].guidance,
      hints: ROOM3_STEP_HINTS.relativity[7],
      targetApparatusId: 'relativity-velocity-dial',
      relevantTool: 'accelerator',
      validate: (state) => {
        if (state.calculationStatus === 'validated') {
          return { isPassed: true, feedback: '✓ All Lorentz factor calculations verified within theoretical tolerance! Proceed to Step 9.' };
        }
        return {
          isPassed: false,
          feedback: 'Enter your computed Lorentz factors for all 5 runs in the notebook and click "Validate & Submit Calculations".',
        };
      },
    },
    {
      id: 'r-step-9',
      stepNumber: 9,
      title: 'Step 9: Observations, Scientific Interpretation & Conclusion',
      action: 'Document relativistic observations of time dilation, length contraction, and invariant light speed c, interpret spacetime structure, and formulate a Claim–Evidence–Reasoning scientific conclusion.',
      why: 'Solidifies understanding that space and time are unified into Minkowski spacetime where c is the invariant spacetime conversion constant.',
      expectedResult: 'Relativistic observations and Claim–Evidence–Reasoning conclusion submitted.',
      hint: ROOM3_STEP_HINTS.relativity[8].guidance,
      hints: ROOM3_STEP_HINTS.relativity[8],
      targetApparatusId: 'relativity-velocity-dial',
      relevantTool: 'accelerator',
      validate: (state) => {
        if (state.hasConclusion) {
          return { isPassed: true, feedback: '✓ Relativistic observations and Claim–Evidence–Reasoning conclusion submitted! Station Mastery Achieved.' };
        }
        return {
          isPassed: false,
          feedback: 'Complete the Observations and Claim–Evidence–Reasoning sections in Step 9 of the notebook to certify.',
        };
      },
    },
  ],
};

export const STATION_CURRICULUM: Record<Room3StationId, StationCurriculum> = {
  circuits: CIRCUITS_CURRICULUM,
  optics: OPTICS_CURRICULUM,
  relativity: RELATIVITY_CURRICULUM,
};
