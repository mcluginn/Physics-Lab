// =============================================================
// ROOM 03: CENTRALIZED EXPERIMENTAL PROGRESSION STATE MACHINE
// Authoritative, Event-Driven Learning Sequence & Validation Engine
// =============================================================

import {
  type Room3StationId,
  type StationProgress,
  type TrialRecord,
  TOTAL_TRIALS,
} from './room3Model';
import {
  type CircuitSettings,
  type OpticsSettings,
  type RelativitySettings,
} from './room3Model';
import {
  type MultimeterMode,
  type MultimeterJack,
  type TerminalId,
  type MultimeterReading,
} from './circuitSolver';

export const TOTAL_STEPS = 9;

// -------------------------------------------------------------
// 1. Explicit Progression Task Events
// -------------------------------------------------------------
export type ProgressionEvent =
  | { type: 'APPARATUS_IDENTIFIED'; stationId: Room3StationId; apparatusId: string }
  | { type: 'COMPONENT_CONNECTED'; stationId: Room3StationId; componentId: string }
  | { type: 'INSTRUMENT_CONFIGURED'; stationId: Room3StationId; instrumentId: string; configuration: string }
  | { type: 'MEASUREMENT_OBTAINED'; stationId: Room3StationId; measurementType: string; value: number; unit: string }
  | { type: 'TRIAL_VALIDATED'; stationId: Room3StationId; trialIndex: number; condition: number }
  | { type: 'TRIAL_RECORDED'; stationId: Room3StationId; trial: TrialRecord }
  | { type: 'CALCULATION_SUBMITTED'; stationId: Room3StationId; calculations: string[] }
  | { type: 'CALCULATION_VALIDATED'; stationId: Room3StationId; isValid: boolean }
  | { type: 'OBSERVATION_SUBMITTED'; stationId: Room3StationId; observations: string; interpretation: string }
  | { type: 'CONCLUSION_SUBMITTED'; stationId: Room3StationId; claim: string; evidence: string; reasoning: string };

// -------------------------------------------------------------
// 2. Step Prerequisites and Advancement Result
// -------------------------------------------------------------
export type StepPrerequisiteResult = {
  canAdvance: boolean;
  reason: string;
  remainingTasks: string[];
  feedback: string;
};

export const STEP_DESCRIPTIONS: Record<number, string> = {
  0: 'Step 1: Equipment Identification & Workbench Setup',
  1: 'Step 2: Circuit / Apparatus Assembly & Continuity Inspection',
  2: 'Step 3: Power / Source Energization & Baseline Calibration',
  3: 'Step 4: Instrument & Sensor Configuration',
  4: 'Step 5: Initial Scientific Investigation',
  5: 'Step 6: Measurement Procedure & Safety Verification',
  6: 'Step 7: Five-Trial Empirical Data Collection',
  7: 'Step 8: Student-Performed Data Computation',
  8: 'Step 9: Observations, Scientific Interpretation & Conclusion',
};

// -------------------------------------------------------------
// 3. Three-Level Progressive Hint System
// -------------------------------------------------------------
export type StepHints = {
  guidance: string; // Level 1: Simpler language
  concept: string; // Level 2: Underlying physical law
  procedure: string; // Level 3: Concrete action instructions without auto-advancing
};

export const ROOM3_STEP_HINTS: Record<Room3StationId, Record<number, StepHints>> = {
  circuits: {
    0: {
      guidance: 'Look around the electrical test bench and inspect each of the 4 primary instruments.',
      concept: 'Before energizing any circuit, physicists verify the physical apparatus to ensure zero ungrounded faults or damaged insulation.',
      procedure: 'Approach and click the DC Power Supply, Fluke 87V Multimeter, Tektronix Oscilloscope, and Breadboard Matrix in 3D.',
    },
    1: {
      guidance: 'Verify that the 3 resistors form a single continuous series circuit loop.',
      concept: 'In a series circuit, Req = R1 + R2 + R3. Current can only flow if the circuit forms a closed conductive path with zero open breaks.',
      procedure: 'Check the breadboard: select DC mode, Series topology, and confirm the series loop jumper is CLOSED.',
    },
    2: {
      guidance: 'Configure the DC power supply to 24.0 V and turn the power switch ON.',
      concept: 'A DC voltage source provides the electrical potential difference (electromotive force) that drives charge through the resistive network.',
      procedure: 'Adjust the DC voltage slider to 24.0 V and toggle the main Power Switch to the ON position.',
    },
    3: {
      guidance: 'Set up the Fluke 87V Multimeter for high-impedance DC Voltage measurement.',
      concept: 'Voltmeters must have high input impedance (~10 MΩ) so they do not draw current or disturb the circuit while measuring potential difference.',
      procedure: 'Turn the multimeter rotary dial to V⎓ (DC Voltage) and ensure test leads are plugged into COM (black) and V·Ω (red).',
    },
    4: {
      guidance: 'Measure voltage drop in parallel across the power supply rails and across resistor R1.',
      concept: 'Potential difference is measured between two points. A voltmeter is always connected in parallel without disconnecting any circuit wires.',
      procedure: 'Place probes in parallel: Red to PSU (+) and Black to PSU (-), then verify drop across resistor R1 (Node A to B).',
    },
    5: {
      guidance: 'Safely insert the ammeter in series by opening the circuit loop.',
      concept: 'Ammeters have near-zero resistance and MUST be connected in series. Connecting an ammeter in parallel creates a dangerous short circuit and trips the fuse.',
      procedure: '1. Switch Power OFF → 2. Set dial to A⎓ → 3. Move Red lead to mA jack → 4. Open jumper → 5. Connect probes across Series Break A and B → 6. Restore Power ON.',
    },
    6: {
      guidance: 'Perform 5 distinct trials across assigned voltages [2V, 4V, 6V, 8V, 10V] across the 330 Ω resistor.',
      concept: 'Ohm\'s Law states that current is directly proportional to voltage: I = V / R. Recording 5 operating points confirms linearity.',
      procedure: 'For each trial: set DC voltage to assigned value, ensure ammeter is in series, verify stable reading, and click Record Trial.',
    },
    7: {
      guidance: 'Calculate the experimental resistance (R = V / I) and power (P = V · I) for each trial.',
      concept: 'Ohm\'s Law: R = V / I. Be sure to convert milliamps (mA) to Amperes (A) by dividing by 1000 before computing resistance in ohms.',
      procedure: 'Enter your computed resistance in ohms for all 5 trials into the input fields, then click "Submit Calculations".',
    },
    8: {
      guidance: 'State what happened to current as voltage increased and write a Claim-Evidence-Reasoning conclusion.',
      concept: 'Scientific claims must be supported by empirical data evidence (your 5 recorded trials) and physical reasoning (Ohm\'s and Kirchhoff\'s laws).',
      procedure: 'Fill out the Observations questions, explain the physical theory, and complete the Claim, Evidence, and Reasoning text fields.',
    },
  },
  optics: {
    0: {
      guidance: 'Examine the optical rail bench and locate all 4 primary optical instruments.',
      concept: 'Optical systems require precise alignment along a common optical rail axis to prevent spherical aberration and parallax errors.',
      procedure: 'Inspect the Laser Diode Source, Goniometer Prism Dial, Lens Carrier, and Observation Screen in the 3D lab.',
    },
    1: {
      guidance: 'Align the optical rail along the central optical axis.',
      concept: 'Paraxial optical rays travel close to the optical axis with small angular deviations, satisfying the paraxial approximation sin θ ≈ θ.',
      procedure: 'Ensure the optical rail is calibrated with zero lateral or angular offset.',
    },
    2: {
      guidance: 'Turn ON the laser source at calibration wavelength λ = 532 nm.',
      concept: 'Monochromatic green light at 532 nm provides the standard optical reference wavelength where human photopic visual sensitivity peaks.',
      procedure: 'Toggle Laser Power to ON and set the wavelength slider to 532 nm (emerald green).',
    },
    3: {
      guidance: 'Mount the converging biconvex lens with focal length f = +20.0 cm.',
      concept: 'A converging lens has positive focal length (f > 0) and bends parallel incident rays toward a real focus on the opposite side.',
      procedure: 'Select Lenses/Mirrors sub-mode and set nominal focal length to +20.0 cm on the lens carrier.',
    },
    4: {
      guidance: 'Position the object lamp at 2f = 40.0 cm and observe symmetric image formation.',
      concept: 'Gaussian lens formula: 1/f = 1/u + 1/v. When object distance u = 2f, image distance v = 2f and magnification M = -1.0× (real, inverted, identical size).',
      procedure: 'Move object lamp to u = 40.0 cm and observe the projected real inverted image on the opposite side.',
    },
    5: {
      guidance: 'Slide the observation screen along the rail until sharp focus is achieved.',
      concept: 'A real image is only sharply projected when the physical detector screen lies in the exact focal image plane (v).',
      procedure: 'Slide the observation screen until the focus indicator reaches maximum sharpness (≥ 90%).',
    },
    6: {
      guidance: 'Record five experimental trials at assigned object distances u = [30, 35, 40, 50, 60] cm.',
      concept: 'Varying object distance u allows rigorous verification of the thin lens equation: 1/f = 1/u + 1/v.',
      procedure: 'For each trial: adjust object distance u, slide screen until sharp focus is reached, and click Record Trial.',
    },
    7: {
      guidance: 'Compute experimental focal length f = (u · v) / (u + v) for each of the 5 trials.',
      concept: 'Thin Lens Equation: 1/f = 1/u + 1/v → f = (u · v) / (u + v). All trials should yield approximately f ≈ 20.0 cm.',
      procedure: 'Enter your calculated focal lengths in cm for all 5 conditions and submit for validation.',
    },
    8: {
      guidance: 'Summarize how image distance changed with object distance and write an evidence-based conclusion.',
      concept: 'As object distance increases, image distance decreases asymptotically toward the focal point f.',
      procedure: 'Answer the observation questions, explain Gaussian optics, and submit your Claim-Evidence-Reasoning conclusion.',
    },
  },
  relativity: {
    0: {
      guidance: 'Identify the relativistic equipment: photon clock, telemetry console, velocity dial, and contracting rod.',
      concept: 'Special relativity investigates the behavior of time, length, and energy in relative motion between inertial reference frames.',
      procedure: 'Inspect the Transverse Light Clock, Velocity Regulator Dial, Contracting Meter-Rod, and Particle Accelerator.',
    },
    1: {
      guidance: 'Observe the stationary photon clock in its rest frame (Frame S\').',
      concept: 'Proper time Δτ = 2D/c is the elapsed time measured by a clock at rest in its own frame (D = 1.00 m → Δτ = 6.671 ns).',
      procedure: 'Select Frame S\' (Rest Frame) and observe the straight vertical bounce between the mirrors.',
    },
    2: {
      guidance: 'Accelerate the carrier sled to relativistic velocity using the simulation regulator.',
      concept: 'Einstein\'s first postulate states that laws of physics are identical in all inertial frames, but temporal and spatial coordinates are relative.',
      procedure: 'Set velocity ratio β to 0.30c or higher and verify particle accelerator is active.',
    },
    3: {
      guidance: 'Switch between Frame S (Lab) and Frame S\' (Rest) to inspect the photon light path.',
      concept: 'Because the speed of light c is invariant, light travels along a longer diagonal path in the lab frame than in the rest frame.',
      procedure: 'Enable "Trace Light Path" and switch to Frame S to observe the diagonal zigzag trajectory.',
    },
    4: {
      guidance: 'Observe relativistic time dilation: Δt = γ · Δτ.',
      concept: 'Traveling a longer diagonal path at invariant light speed c requires a longer time interval: Δt = γ Δτ, where γ = 1/√(1-β²).',
      procedure: 'Observe the digital atomic clock tick rate expanding as velocity ratio β increases.',
    },
    5: {
      guidance: 'Observe length contraction and frame-dependent simultaneity for the moving rod.',
      concept: 'Lengths parallel to motion contract by L = L0 / γ. Simultaneous endpoint detection in the lab frame corresponds to non-simultaneous events in the rest frame.',
      procedure: 'Activate the moving rod demonstration and enable simultaneity laser detector gates.',
    },
    6: {
      guidance: 'Execute 5 simulation runs across assigned velocities β = [0.10, 0.30, 0.50, 0.70, 0.90]c.',
      concept: 'This is an exact computational simulation investigation; verification is established by zero numerical residual (|Δ| = 0.0000).',
      procedure: 'For each assigned velocity: adjust slider, run simulation, observe dilated time and contracted length, and record the run.',
    },
    7: {
      guidance: 'Calculate the theoretical Lorentz factor γ = 1 / √(1 − β²) for all 5 simulation conditions.',
      concept: 'Lorentz factor: γ = (1 - β²)⁻¹/². As β → 1, γ diverges asymptotically toward infinity.',
      procedure: 'Compute γ to 4 decimal places for each run, enter values into fields, and submit for verification.',
    },
    8: {
      guidance: 'Explain why light speed c is constant and formulate a Claim-Evidence-Reasoning conclusion.',
      concept: 'Relativity reveals that space and time are unified into Minkowski spacetime, where c is the invariant spacetime conversion constant.',
      procedure: 'Complete the observation analysis, explain modern invariant mass m0, and submit your Claim-Evidence-Reasoning conclusion.',
    },
  },
};

// -------------------------------------------------------------
// 4. Authoritative Step Prerequisite Evaluator
// -------------------------------------------------------------
export type LiveEnvironmentState = {
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
  stationProgress: StationProgress;
};

export const INSPECTION_REQUIREMENTS: Record<Room3StationId, string[]> = {
  circuits: ['circuits-power-switch', 'circuits-multimeter', 'circuits-oscilloscope', 'circuits-topology-selector'],
  optics: ['optics-laser', 'optics-angle-dial', 'optics-screen', 'optics-rail'],
  relativity: ['relativity-velocity-dial', 'relativity-light-clock', 'relativity-contracting-rod', 'relativity-accelerator'],
};

export function evaluateStepPrerequisites(
  state: LiveEnvironmentState,
  targetStepIdx: number
): StepPrerequisiteResult {
  const { stationId, stationProgress, circuits, optics, relativity, dmmMode, dmmJack, redTerminal, blackTerminal, jumperClosed, dmmReading } = state;

  // Step 1: Equipment Identification (index 0)
  if (targetStepIdx === 0) {
    const required = INSPECTION_REQUIREMENTS[stationId];
    const missing = required.filter((id) => !stationProgress.inspected.includes(id));
    if (missing.length === 0) {
      return {
        canAdvance: true,
        reason: 'All station apparatus verified.',
        remainingTasks: [],
        feedback: '✓ All apparatus components identified. You may advance to Step 2.',
      };
    }
    return {
      canAdvance: false,
      reason: `Apparatus inspection incomplete (${stationProgress.inspected.length}/${required.length}).`,
      remainingTasks: missing.map((m) => `Inspect ${m.replace(`${stationId}-`, '').replace('-', ' ').toUpperCase()}`),
      feedback: `⚠️ Inspect all ${required.length} apparatus components before advancing. Missing: ${missing.length}.`,
    };
  }

  // Step 2: Assembly / Setup (index 1)
  if (targetStepIdx === 1) {
    if (stationId === 'circuits') {
      if (circuits.mode !== 'dc') {
        return {
          canAdvance: false,
          reason: 'Circuit not in DC steady-state mode.',
          remainingTasks: ['Switch circuit regime to DC Steady-State'],
          feedback: '⚠️ Switch circuit to DC Steady-State before proceeding.',
        };
      }
      if (!jumperClosed) {
        return {
          canAdvance: false,
          reason: 'Series loop jumper is open.',
          remainingTasks: ['Close series loop jumper to establish continuity'],
          feedback: '⚠️ The circuit is broken. Close the series loop jumper.',
        };
      }
      return {
        canAdvance: true,
        reason: 'Circuit loop continuity verified.',
        remainingTasks: [],
        feedback: '✓ Series loop continuity confirmed.',
      };
    }
    if (stationId === 'optics') {
      return {
        canAdvance: true,
        reason: 'Optical rail aligned along paraxial axis.',
        remainingTasks: [],
        feedback: '✓ Optical track aligned.',
      };
    }
    if (stationId === 'relativity') {
      return {
        canAdvance: true,
        reason: 'Proper time baseline verified.',
        remainingTasks: [],
        feedback: '✓ Frame S\' proper baseline confirmed (Δτ = 6.671 ns).',
      };
    }
  }

  // Step 3: Power / Source Energization (index 2)
  if (targetStepIdx === 2) {
    if (stationId === 'circuits') {
      if (!circuits.powerOn) {
        return {
          canAdvance: false,
          reason: 'Power supply is OFF.',
          remainingTasks: ['Turn Power Switch ON'],
          feedback: '⚠️ Turn the DC Power Supply ON to energize the circuit.',
        };
      }
      if (circuits.vs < 2.0) {
        return {
          canAdvance: false,
          reason: 'Voltage too low.',
          remainingTasks: ['Set voltage to 2.0 V or higher'],
          feedback: '⚠️ Increase DC voltage to at least 2.0 V.',
        };
      }
      return {
        canAdvance: true,
        reason: 'Power supply energized at steady-state.',
        remainingTasks: [],
        feedback: `✓ DC Power Supply energized at ${circuits.vs.toFixed(1)} V.`,
      };
    }
    if (stationId === 'optics') {
      if (!optics.powerOn) {
        return {
          canAdvance: false,
          reason: 'Laser source is OFF.',
          remainingTasks: ['Switch Laser Source ON'],
          feedback: '⚠️ Turn the Laser Source ON.',
        };
      }
      if (optics.wavelength !== 532) {
        return {
          canAdvance: false,
          reason: 'Laser wavelength not calibrated to 532 nm.',
          remainingTasks: ['Set laser wavelength slider to 532 nm'],
          feedback: '⚠️ Set laser wavelength to 532 nm (emerald green).',
        };
      }
      return {
        canAdvance: true,
        reason: 'Laser source energized at 532 nm.',
        remainingTasks: [],
        feedback: '✓ Monochromatic 532 nm laser active.',
      };
    }
    if (stationId === 'relativity') {
      if (!relativity.powerOn) {
        return {
          canAdvance: false,
          reason: 'Particle accelerator is on standby.',
          remainingTasks: ['Activate Particle Accelerator simulation'],
          feedback: '⚠️ Switch Particle Accelerator simulation to ACTIVE.',
        };
      }
      return {
        canAdvance: true,
        reason: 'Relativistic simulation active.',
        remainingTasks: [],
        feedback: '✓ Relativistic accelerator simulation active.',
      };
    }
  }

  // Step 4: Instrument & Sensor Configuration (index 3)
  if (targetStepIdx === 3) {
    if (stationId === 'circuits') {
      if (dmmMode !== 'v_dc') {
        return {
          canAdvance: false,
          reason: 'Multimeter dial not set to DC Voltage.',
          remainingTasks: ['Turn multimeter selector dial to V⎓ (DC Voltage)'],
          feedback: '⚠️ Multimeter must be set to DC Voltage (V⎓) mode.',
        };
      }
      if (dmmJack !== 'v_ohm') {
        return {
          canAdvance: false,
          reason: 'Red lead plugged into current shunt.',
          remainingTasks: ['Move Red test lead to V·Ω input terminal'],
          feedback: '⚠️ Move red lead from current shunt to high-impedance V·Ω socket.',
        };
      }
      return {
        canAdvance: true,
        reason: 'Multimeter configured for high-impedance voltage sensing.',
        remainingTasks: [],
        feedback: '✓ Fluke 87V prepared for voltage measurement (10 MΩ input).',
      };
    }
    if (stationId === 'optics') {
      if (optics.subMode !== 'imaging' || Math.abs(optics.focalLength - 20.0) > 1.0) {
        return {
          canAdvance: false,
          reason: 'Converging lens f = +20.0 cm not mounted.',
          remainingTasks: ['Select Lenses/Mirrors and set f = +20.0 cm'],
          feedback: '⚠️ Configure lens carrier to Lenses/Mirrors with focal length +20.0 cm.',
        };
      }
      return {
        canAdvance: true,
        reason: 'Converging lens f = +20.0 cm mounted.',
        remainingTasks: [],
        feedback: '✓ Converging lens mounted on central carrier.',
      };
    }
    if (stationId === 'relativity') {
      return {
        canAdvance: true,
        reason: 'Photon clock trajectory inspected.',
        remainingTasks: [],
        feedback: '✓ Rest frame vs Lab frame photon motion analyzed.',
      };
    }
  }

  // Step 5: Initial Scientific Investigation (index 4)
  if (targetStepIdx === 4) {
    if (stationId === 'circuits') {
      const isPsu = (redTerminal === 'SRC_POS' && blackTerminal === 'SRC_NEG') || (redTerminal === 'SRC_NEG' && blackTerminal === 'SRC_POS');
      const isR1 = (redTerminal === 'R1_A' && blackTerminal === 'R1_B') || (redTerminal === 'R1_B' && blackTerminal === 'R1_A');
      const hasValidReading = dmmReading.isValidMeasurement && Math.abs(dmmReading.value ?? 0) > 0.5;
      if (!circuits.powerOn) {
        return {
          canAdvance: false,
          reason: 'Circuit unpowered.',
          remainingTasks: ['Switch Power ON'],
          feedback: '⚠️ Energize power supply to read voltage drop.',
        };
      }
      if (!isPsu && !isR1 && !hasValidReading) {
        return {
          canAdvance: false,
          reason: 'Probes not placed in parallel.',
          remainingTasks: ['Connect test probes across PSU rails or across Resistor R1'],
          feedback: '⚠️ Connect probes in parallel across the voltage source or R1.',
        };
      }
      return {
        canAdvance: true,
        reason: 'Parallel voltage measurement verified.',
        remainingTasks: [],
        feedback: '✓ Parallel voltage drop successfully verified.',
      };
    }
    if (stationId === 'optics') {
      if (Math.abs(optics.objectDistance - 40.0) > 1.5) {
        return {
          canAdvance: false,
          reason: 'Object lamp not at 2f (40.0 cm).',
          remainingTasks: ['Position object lamp at u = 40.0 cm (2f)'],
          feedback: '⚠️ Position object lamp at exactly 2f = 40.0 cm.',
        };
      }
      return {
        canAdvance: true,
        reason: 'Symmetric 2f imaging condition verified.',
        remainingTasks: [],
        feedback: '✓ Symmetric 2f image verified (u = 40 cm, v = 40 cm, M = -1.0×).',
      };
    }
    if (stationId === 'relativity') {
      return {
        canAdvance: true,
        reason: 'Time dilation relationship verified.',
        remainingTasks: [],
        feedback: '✓ Time dilation relationship verified (Δt = γ Δτ).',
      };
    }
  }

  // Step 6: Measurement Procedure & Safety Verification (index 5)
  if (targetStepIdx === 5) {
    if (stationId === 'circuits') {
      if (dmmReading.tripFuse || dmmReading.displayString === 'FUSE') {
        return {
          canAdvance: false,
          reason: 'Multimeter fuse tripped.',
          remainingTasks: ['Reset blown fuse and connect in series (never in parallel)'],
          feedback: '🚨 FUSE BLOWN! Ammeter was placed across voltage rails. Reset fuse and connect in series.',
        };
      }
      const isSeriesBreak =
        (redTerminal === 'SERIES_JACK_A' && blackTerminal === 'SERIES_JACK_B') ||
        (redTerminal === 'SERIES_JACK_B' && blackTerminal === 'SERIES_JACK_A');
      if (jumperClosed) {
        return {
          canAdvance: false,
          reason: 'Series jumper is closed (ammeter bypassed).',
          remainingTasks: ['Open the series jumper to break the loop'],
          feedback: '⚠️ Open the series jumper so current must flow through the ammeter.',
        };
      }
      if (dmmJack !== 'ma_10a' || (dmmMode !== 'a_dc' && dmmMode !== 'a_ac')) {
        return {
          canAdvance: false,
          reason: 'Multimeter not configured as ammeter.',
          remainingTasks: ['Set dial to A⎓ and Red lead to mA/10A jack'],
          feedback: '⚠️ Configure multimeter: dial to A⎓ and Red lead in mA jack.',
        };
      }
      if (!isSeriesBreak) {
        return {
          canAdvance: false,
          reason: 'Probes not inserted across series break.',
          remainingTasks: ['Connect test leads to Series Break Terminals A and B'],
          feedback: '⚠️ Insert probes across Series Break Terminals A and B.',
        };
      }
      if (!circuits.powerOn) {
        return {
          canAdvance: false,
          reason: 'Circuit unpowered.',
          remainingTasks: ['Restore Power Supply ON to read current'],
          feedback: '⚠️ Restore power to measure series current.',
        };
      }
      return {
        canAdvance: true,
        reason: 'Series ammeter insertion procedure verified.',
        remainingTasks: [],
        feedback: `✓ Series current safely measured (${dmmReading.displayString}). Loop complete!`,
      };
    }
    if (stationId === 'optics') {
      const focalV = (optics.objectDistance * 20.0) / Math.max(0.1, optics.objectDistance - 20.0);
      const isSharp = Math.abs(optics.screenDistance * 100 - focalV) < 8.0;
      if (!isSharp) {
        return {
          canAdvance: false,
          reason: 'Image not in sharp focus on screen.',
          remainingTasks: ['Slide observation screen until image achieves sharp focus'],
          feedback: '⚠️ Slide screen along track until image sharpness is maximized.',
        };
      }
      return {
        canAdvance: true,
        reason: 'Screen focusing procedure verified.',
        remainingTasks: [],
        feedback: '✓ Image sharpness verified at focal plane.',
      };
    }
    if (stationId === 'relativity') {
      return {
        canAdvance: true,
        reason: 'Length contraction and simultaneity verified.',
        remainingTasks: [],
        feedback: '✓ Longitudinal contraction L = L0/γ and simultaneity verified.',
      };
    }
  }

  // Step 7: Five-Trial Empirical Data Collection (index 6)
  if (targetStepIdx === 6) {
    if (stationProgress.trials.length >= TOTAL_TRIALS) {
      return {
        canAdvance: true,
        reason: 'All 5 experimental trials recorded.',
        remainingTasks: [],
        feedback: `✓ All ${TOTAL_TRIALS} experimental trials recorded into lab notebook.`,
      };
    }
    return {
      canAdvance: false,
      reason: `Dataset incomplete (${stationProgress.trials.length}/${TOTAL_TRIALS} trials).`,
      remainingTasks: [`Perform and record ${TOTAL_TRIALS - stationProgress.trials.length} more trial(s)`],
      feedback: `⚠️ Record all ${TOTAL_TRIALS} distinct experimental trials before advancing to computation. Currently logged: ${stationProgress.trials.length}/${TOTAL_TRIALS}.`,
    };
  }

  // Step 8: Student-Performed Data Computation (index 7)
  if (targetStepIdx === 7) {
    if (stationProgress.calculationStatus === 'validated') {
      return {
        canAdvance: true,
        reason: 'Student calculations validated.',
        remainingTasks: [],
        feedback: '✓ All student calculations verified within physical tolerance.',
      };
    }
    return {
      canAdvance: false,
      reason: 'Calculations not validated.',
      remainingTasks: ['Complete all 5 trial calculations and submit for verification'],
      feedback: '⚠️ Enter and submit your experimental calculations in the notebook to unlock Step 9.',
    };
  }

  // Step 9: Observations & Conclusion (index 8)
  if (targetStepIdx === 8) {
    const obsLen = (stationProgress.observations || '').trim().length;
    const claimLen = (stationProgress.claim || '').trim().length;
    const evLen = (stationProgress.evidence || '').trim().length;
    const reasLen = (stationProgress.reasoning || '').trim().length;

    if (obsLen >= 20 && claimLen >= 15 && evLen >= 20 && reasLen >= 25) {
      return {
        canAdvance: true,
        reason: 'Scientific observations and conclusion submitted.',
        remainingTasks: [],
        feedback: '✓ Scientific observations and Claim-Evidence-Reasoning conclusion completed!',
      };
    }

    const missing: string[] = [];
    if (obsLen < 20) missing.push('Detailed qualitative observations');
    if (claimLen < 15) missing.push('Scientific Claim');
    if (evLen < 20) missing.push('Dataset Evidence');
    if (reasLen < 25) missing.push('Physical Reasoning');

    return {
      canAdvance: false,
      reason: 'Observations or conclusion incomplete.',
      remainingTasks: missing,
      feedback: `⚠️ Please complete all sections: ${missing.join(', ')}.`,
    };
  }

  return { canAdvance: false, reason: 'Unknown step', remainingTasks: [], feedback: '' };
}

// -------------------------------------------------------------
// 5. Real-Time 3D Trial Validator (Prevents Button-Click Cheating)
// -------------------------------------------------------------
export type TrialValidationCheck = {
  isValid: boolean;
  feedback: string;
  measuredData?: TrialRecord;
};

export function validateLiveExperimentForTrial(
  state: LiveEnvironmentState,
  trialNumber: number,
  assignedCondition: { targetParam: string; targetValue: number; unit: string }
): TrialValidationCheck {
  const { stationId, circuits, optics, relativity, dmmMode, dmmJack, redTerminal, blackTerminal, jumperClosed, dmmReading, stationProgress } = state;

  // Station 01: Circuits
  if (stationId === 'circuits') {
    if (!circuits.powerOn) {
      return {
        isValid: false,
        feedback: `Circuit is OFF! Switch the DC Power Supply ON to take a live measurement for Trial ${trialNumber}.`,
      };
    }
    // Check operating voltage matching assigned condition (within ±0.6V)
    if (Math.abs(circuits.vs - assignedCondition.targetValue) > 0.6) {
      return {
        isValid: false,
        feedback: `Voltage mismatch: Trial ${trialNumber} requires Vs = ${assignedCondition.targetValue.toFixed(1)} V, but the power supply is set to ${circuits.vs.toFixed(1)} V. Adjust the voltage knob.`,
      };
    }
    // Prevent duplicate trial recording at the exact same condition
    const isDuplicate = stationProgress.trials.some(
      (tr) => Math.abs(Number(tr.vs ?? tr.paramA ?? 0) - assignedCondition.targetValue) < 0.3
    );
    if (isDuplicate) {
      return {
        isValid: false,
        feedback: `Trial for Vs = ${assignedCondition.targetValue.toFixed(1)} V is already recorded! Adjust the power supply to the next assigned operating point.`,
      };
    }

    // Require multimeter in series ammeter mode or legitimate sensing
    let measuredV = circuits.vs * (1 + (Math.sin(trialNumber * 13.7) * 0.0015));
    if (dmmMode === 'v_dc' && dmmJack === 'v_ohm' && dmmReading.value !== null && Math.abs(dmmReading.value) > 0.5) {
      measuredV = Math.abs(dmmReading.value);
    }
    const reqTheor = 330.0;
    let measuredI_mA = ((measuredV / reqTheor) * 1000) * (1 + (Math.cos(trialNumber * 11.3) * 0.0018));
    if ((dmmMode === 'a_dc' || dmmMode === 'a_ac') && dmmJack === 'ma_10a' && dmmReading.value !== null && Math.abs(dmmReading.value) > 0.0001) {
      measuredI_mA = Math.abs(dmmReading.value) * 1000;
    }
    const measuredI_A = measuredI_mA / 1000;
    const powerW = measuredV * measuredI_A;
    const resistance = measuredI_mA > 0 ? (measuredV * 1000) / measuredI_mA : reqTheor;
    const percentError = Math.abs((resistance - reqTheor) / reqTheor) * 100;

    return {
      isValid: true,
      feedback: `✓ Valid 3D Circuit Measurement: Vs = ${measuredV.toFixed(2)} V, I = ${measuredI_mA.toFixed(2)} mA.`,
      measuredData: {
        trial: trialNumber,
        vs: assignedCondition.targetValue,
        measuredV: Number(measuredV.toFixed(2)),
        measuredI_mA: Number(measuredI_mA.toFixed(2)),
        measuredI_A: Number(measuredI_A.toFixed(5)),
        resistance: Number(resistance.toFixed(1)),
        expectedR: reqTheor,
        powerW: Number(powerW.toFixed(4)),
        percentError: Number(percentError.toFixed(2)),
        mode: circuits.mode.toUpperCase(),
        topology: circuits.topology,
        current: Number(measuredI_A.toFixed(5)),
        impedance: Number(resistance.toFixed(1)),
      },
    };
  }

  // Station 02: Optics
  if (stationId === 'optics') {
    if (!optics.powerOn) {
      return {
        isValid: false,
        feedback: 'Laser is OFF! Energize the laser source to observe image formation.',
      };
    }
    // Check object distance match
    if (Math.abs(optics.objectDistance - assignedCondition.targetValue) > 2.0) {
      return {
        isValid: false,
        feedback: `Object Distance mismatch: Trial ${trialNumber} requires u = ${assignedCondition.targetValue.toFixed(1)} cm, but the object is positioned at ${optics.objectDistance.toFixed(1)} cm. Adjust the object slider.`,
      };
    }
    // Prevent duplicate trial
    const isDuplicate = stationProgress.trials.some(
      (tr) => Math.abs(Number(tr.u ?? tr.paramA ?? 0) - assignedCondition.targetValue) < 1.0
    );
    if (isDuplicate) {
      return {
        isValid: false,
        feedback: `Trial for u = ${assignedCondition.targetValue.toFixed(1)} cm is already recorded! Adjust object distance to the next assigned condition.`,
      };
    }

    const u = assignedCondition.targetValue;
    const theorV = (u * 20.0) / (u - 20.0);
    const measuredV = theorV * (1 + (Math.sin(trialNumber * 7.9) * 0.003));
    const invU = 1 / u;
    const invV = 1 / measuredV;
    const f_exp = (u * measuredV) / (u + measuredV);
    const f_nom = 20.0;
    const percentError = Math.abs((f_exp - f_nom) / f_nom) * 100;

    return {
      isValid: true,
      feedback: `✓ Valid Optical Observation: u = ${u.toFixed(1)} cm, sharp focus v = ${measuredV.toFixed(2)} cm.`,
      measuredData: {
        trial: trialNumber,
        u,
        v: Number(measuredV.toFixed(2)),
        invU: Number(invU.toFixed(4)),
        invV: Number(invV.toFixed(4)),
        f_exp: Number(f_exp.toFixed(2)),
        f_nom,
        percentError: Number(percentError.toFixed(2)),
        subMode: 'imaging',
        wavelength: optics.wavelength,
        paramA: u,
        paramB: 20.0,
        theoretical: Number(theorV.toFixed(2)),
        measured: Number(measuredV.toFixed(2)),
      },
    };
  }

  // Station 03: Special Relativity
  if (stationId === 'relativity') {
    if (!relativity.powerOn || !relativity.simPlaying) {
      return {
        isValid: false,
        feedback: 'Simulation is paused or inactive! Click Play (▶) on the particle accelerator to run the relativistic simulation.',
      };
    }
    // Check velocity match
    if (Math.abs(relativity.beta - assignedCondition.targetValue) > 0.03) {
      return {
        isValid: false,
        feedback: `Velocity mismatch: Run ${trialNumber} requires β = ${assignedCondition.targetValue.toFixed(2)}c, but current velocity is ${relativity.beta.toFixed(2)}c. Adjust the velocity slider.`,
      };
    }
    // Prevent duplicate run
    const isDuplicate = stationProgress.trials.some(
      (tr) => Math.abs(Number(tr.beta ?? tr.paramA ?? 0) - assignedCondition.targetValue) < 0.02
    );
    if (isDuplicate) {
      return {
        isValid: false,
        feedback: `Simulation run for β = ${assignedCondition.targetValue.toFixed(2)}c is already logged! Adjust velocity to the next assigned run.`,
      };
    }

    const beta = assignedCondition.targetValue;
    const gamma = 1 / Math.sqrt(Math.max(1e-6, 1 - beta * beta));
    const speed = beta * 299792458;
    const properTime = 6.671;
    const dilatedTime = gamma * properTime;
    const properLength = 10.00;
    const contractedLength = properLength / gamma;

    return {
      isValid: true,
      feedback: `✓ Valid Relativistic Simulation Run: β = ${beta.toFixed(2)}c, γ = ${gamma.toFixed(4)}, Δt = ${dilatedTime.toFixed(3)} ns, L = ${contractedLength.toFixed(3)} m.`,
      measuredData: {
        trial: trialNumber,
        beta,
        speed: Number(speed.toFixed(0)),
        gamma: Number(gamma.toFixed(4)),
        measuredGamma: Number(gamma.toFixed(4)),
        properTime,
        dilatedTime: Number(dilatedTime.toFixed(3)),
        properLength,
        contractedLength: Number(contractedLength.toFixed(3)),
        timeDilationRatio: Number(gamma.toFixed(4)),
        lengthContractionRatio: Number((1 / gamma).toFixed(4)),
        isSimulated: true,
      },
    };
  }

  return { isValid: false, feedback: 'Invalid experiment state.' };
}

// -------------------------------------------------------------
// 6. Student Calculation Validator (Step 8)
// -------------------------------------------------------------
export type CalculationValidationResult = {
  isValid: boolean;
  perTrialStatus: ('correct' | 'incorrect' | 'empty')[];
  feedback: string;
};

export function validateStudentCalculations(
  stationId: Room3StationId,
  trials: TrialRecord[],
  studentEntries: string[]
): CalculationValidationResult {
  if (trials.length < TOTAL_TRIALS) {
    return {
      isValid: false,
      perTrialStatus: Array(TOTAL_TRIALS).fill('empty'),
      feedback: 'Please complete and record all 5 experimental trials in Step 7 first.',
    };
  }

  const perTrialStatus: ('correct' | 'incorrect' | 'empty')[] = [];
  let allCorrect = true;
  let firstErrorFeedback = '';

  for (let i = 0; i < TOTAL_TRIALS; i++) {
    const entry = (studentEntries[i] || '').trim();
    if (!entry) {
      perTrialStatus.push('empty');
      allCorrect = false;
      if (!firstErrorFeedback) {
        firstErrorFeedback = `Trial #${i + 1} calculation field is empty. Please enter your computed value.`;
      }
      continue;
    }

    const userVal = parseFloat(entry);
    if (isNaN(userVal)) {
      perTrialStatus.push('incorrect');
      allCorrect = false;
      if (!firstErrorFeedback) {
        firstErrorFeedback = `Trial #${i + 1} contains an invalid number. Please enter a valid numerical value.`;
      }
      continue;
    }

    const t = trials[i];
    let expected = 330.0;
    let tolerance = 0.025; // 2.5%

    if (stationId === 'circuits') {
      expected = Number(t.resistance ?? 330.0);
    } else if (stationId === 'optics') {
      expected = Number(t.f_exp ?? 20.0);
    } else {
      expected = Number(t.gamma ?? 1.0);
      tolerance = 0.01; // 1% for gamma
    }

    const diffRatio = Math.abs((userVal - expected) / Math.max(0.001, expected));
    if (diffRatio <= tolerance) {
      perTrialStatus.push('correct');
    } else {
      perTrialStatus.push('incorrect');
      allCorrect = false;
      if (!firstErrorFeedback) {
        if (stationId === 'circuits') {
          if (Math.abs(userVal - expected / 1000) < 0.1) {
            firstErrorFeedback = `Trial #${i + 1} Error: Did you forget to convert current from milliamps to amperes? R = V / (I_mA / 1000).`;
          } else {
            firstErrorFeedback = `Trial #${i + 1} Error: Computed R = ${userVal.toFixed(1)} Ω deviates from expected R = V / I. Check your arithmetic.`;
          }
        } else if (stationId === 'optics') {
          firstErrorFeedback = `Trial #${i + 1} Error: Computed f = ${userVal.toFixed(2)} cm deviates from Gaussian formula f = (u · v) / (u + v). Check your calculation.`;
        } else {
          firstErrorFeedback = `Run #${i + 1} Error: Computed γ = ${userVal.toFixed(4)} deviates from theoretical γ = 1 / √(1 − β²). Check your calculation.`;
        }
      }
    }
  }

  return {
    isValid: allCorrect,
    perTrialStatus,
    feedback: allCorrect
      ? '✓ All 5 student calculations verified within theoretical physical tolerance!'
      : firstErrorFeedback,
  };
}

// -------------------------------------------------------------
// 7. Student Observation & Conclusion Validator (Step 9)
// -------------------------------------------------------------
export type ConclusionValidationResult = {
  isValid: boolean;
  missingFields: string[];
  feedback: string;
};

export function validateStudentObservationsAndConclusion(
  observations: string,
  scientificInterpretation: string,
  claim: string,
  evidence: string,
  reasoning: string
): ConclusionValidationResult {
  const missing: string[] = [];

  if ((observations || '').trim().length < 20) {
    missing.push('Qualitative Observations (at least 20 characters)');
  }
  if ((scientificInterpretation || '').trim().length < 20) {
    missing.push('Scientific Interpretation (at least 20 characters)');
  }
  if ((claim || '').trim().length < 15) {
    missing.push('Scientific Claim (at least 15 characters)');
  }
  if ((evidence || '').trim().length < 20) {
    missing.push('Dataset Evidence (at least 20 characters referencing data)');
  }
  if ((reasoning || '').trim().length < 25) {
    missing.push('Theoretical Reasoning (at least 25 characters linking physics laws)');
  }

  if (missing.length === 0) {
    return {
      isValid: true,
      missingFields: [],
      feedback: '✓ Comprehensive Claim-Evidence-Reasoning conclusion successfully submitted!',
    };
  }

  return {
    isValid: false,
    missingFields: missing,
    feedback: `⚠️ Incomplete scientific submission. Please provide: ${missing.join('; ')}.`,
  };
}
