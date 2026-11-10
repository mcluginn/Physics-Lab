// @ts-check

/**
 * Circuit Solver Engine for Physics Virtual Laboratory
 * Implements DC node-voltage analysis, AC phasor impedance analysis,
 * and realistic Digital Multimeter (DMM) virtual measurement model
 * including shunt resistance, high-impedance voltage sensing, and failure modes.
 */

export type CircuitTopology = 'single' | 'series' | 'parallel' | 'combo';
export type CircuitMode = 'dc' | 'ac';
export type MultimeterMode = 'v_dc' | 'v_ac' | 'a_dc' | 'a_ac' | 'ohm' | 'cont';
export type MultimeterJack = 'v_ohm' | 'ma_10a';

export type TerminalId =
  | 'SRC_POS'       // Power Supply Positive (+)
  | 'SRC_NEG'       // Power Supply Negative (-) Ground
  | 'R1_A'          // Resistor 1 Left
  | 'R1_B'          // Resistor 1 Right
  | 'R2_A'          // Resistor 2 Left
  | 'R2_B'          // Resistor 2 Right
  | 'R3_A'          // Resistor 3 Left
  | 'R3_B'          // Resistor 3 Right
  | 'SERIES_JACK_A' // Series Ammeter Breakpoint Terminal A
  | 'SERIES_JACK_B' // Series Ammeter Breakpoint Terminal B
  | 'IND_A'         // Inductor Left
  | 'IND_B'         // Inductor Right
  | 'CAP_A'         // Capacitor Left
  | 'CAP_B';        // Capacitor Right

export type ResistorTelemetry = {
  id: 'R1' | 'R2' | 'R3';
  nominalResistance: number;
  powerRatingW: number;
  voltageDrop: number;
  currentA: number;
  currentMa: number;
  powerW: number;
  powerPercent: number;
  isOverloaded: boolean;
};

export type CircuitState = {
  mode: CircuitMode;
  topology: CircuitTopology;
  powerOn: boolean;
  sourceVoltage: number;   // Volts (0 - 240V)
  frequency: number;       // Hz (10 - 1000 Hz)
  waveType: 'sine' | 'square' | 'triangle';
  r1: number;              // Ohms
  r2: number;              // Ohms
  r3: number;              // Ohms
  inductanceMh: number;    // Millihenries
  capacitanceUf: number;   // Microfarads
  seriesJumperConnected: boolean; // True when series loop is jumpered closed; false when open for ammeter insertion
};

export type MultimeterState = {
  mode: MultimeterMode;
  redJack: MultimeterJack;   // 'v_ohm' or 'ma_10a'
  redProbeTerminal: TerminalId | null;
  blackProbeTerminal: TerminalId | null;
  fuseBlown: boolean;
};

export type MultimeterReading = {
  value: number | null;     // Numeric reading, or null if OL
  displayString: string;    // Formatted text e.g. "24.00 V", "36.92 mA", "100.0 Ω", "O.L", "LEAd", "FUSE"
  unit: string;             // "V", "mV", "A", "mA", "Ω", "kΩ"
  isContinuityBeep: boolean;
  warning: string | null;   // Educational feedback message
  isValidMeasurement: boolean;
  tripFuse?: boolean;       // Set true when overcurrent trips internal 10A fuse
};

export type CircuitSolution = {
  nodeVoltages: Record<string, number>; // Volts relative to GND (SRC_NEG)
  branchCurrents: {
    total: number;
    i1: number;
    i2: number;
    i3: number;
  };
  resistors: Record<'R1' | 'R2' | 'R3', ResistorTelemetry>;
  equivalentResistance: number;
  acImpedance: {
    zMagnitude: number;
    phaseRad: number;
    phaseDeg: number;
    xl: number;
    xc: number;
    powerFactor: number;
  };
};

/**
 * Solve node voltages and branch currents based on circuit topology and state.
 */
export function solveCircuit(state: CircuitState, dmm: MultimeterState): CircuitSolution {
  const vs = state.powerOn ? state.sourceVoltage : 0;
  const r1 = Math.max(1, state.r1);
  const r2 = Math.max(1, state.r2);
  const r3 = Math.max(1, state.r3);

  // Check if DMM is inserted in series between SERIES_JACK_A and SERIES_JACK_B
  const isAmmeterInSeriesBreak =
    !state.seriesJumperConnected &&
    dmm.redJack === 'ma_10a' &&
    ((dmm.mode === 'a_dc' && state.mode === 'dc') || (dmm.mode === 'a_ac' && state.mode === 'ac')) &&
    !dmm.fuseBlown &&
    ((dmm.redProbeTerminal === 'SERIES_JACK_A' && dmm.blackProbeTerminal === 'SERIES_JACK_B') ||
     (dmm.redProbeTerminal === 'SERIES_JACK_B' && dmm.blackProbeTerminal === 'SERIES_JACK_A'));

  // Ammeter shunt resistance: 0.15 Ohms (models non-ideal burden resistance)
  const ammeterBurdenR = isAmmeterInSeriesBreak ? 0.15 : 0;

  // Circuit loop is closed if jumper is in place OR ammeter is properly inserted
  const isCircuitClosed = state.seriesJumperConnected || isAmmeterInSeriesBreak;

  let req = 0;
  let totalCurrent = 0;
  let i1 = 0;
  let i2 = 0;
  let i3 = 0;

  const nodeVoltages: Record<string, number> = {
    SRC_NEG: 0,
    SRC_POS: vs,
    R1_A: 0,
    R1_B: 0,
    R2_A: 0,
    R2_B: 0,
    R3_A: 0,
    R3_B: 0,
    SERIES_JACK_A: 0,
    SERIES_JACK_B: 0,
    IND_A: 0,
    IND_B: 0,
    CAP_A: 0,
    CAP_B: 0,
  };

  if (!isCircuitClosed && state.powerOn) {
    // Open circuit: Source voltage exists at positive rail, but zero current flows
    nodeVoltages.SRC_POS = vs;
    nodeVoltages.SERIES_JACK_A = vs;
    nodeVoltages.SERIES_JACK_B = 0;
    const zeroResistors: Record<'R1' | 'R2' | 'R3', ResistorTelemetry> = {
      R1: { id: 'R1', nominalResistance: r1, powerRatingW: 1.0, voltageDrop: 0, currentA: 0, currentMa: 0, powerW: 0, powerPercent: 0, isOverloaded: false },
      R2: { id: 'R2', nominalResistance: r2, powerRatingW: 1.0, voltageDrop: 0, currentA: 0, currentMa: 0, powerW: 0, powerPercent: 0, isOverloaded: false },
      R3: { id: 'R3', nominalResistance: r3, powerRatingW: 1.0, voltageDrop: 0, currentA: 0, currentMa: 0, powerW: 0, powerPercent: 0, isOverloaded: false },
    };
    return {
      nodeVoltages,
      branchCurrents: { total: 0, i1: 0, i2: 0, i3: 0 },
      resistors: zeroResistors,
      equivalentResistance: Infinity,
      acImpedance: { zMagnitude: Infinity, phaseRad: 0, phaseDeg: 0, xl: 0, xc: 0, powerFactor: 1 },
    };
  }

  if (state.mode === 'dc') {
    if (state.topology === 'single') {
      // Single 330 Ω Resistor Ohm's Law circuit (Experiment A)
      req = r3 + ammeterBurdenR;
      totalCurrent = vs / req;
      i1 = 0;
      i2 = 0;
      i3 = totalCurrent;

      nodeVoltages.SERIES_JACK_A = vs;
      nodeVoltages.SERIES_JACK_B = vs - (isAmmeterInSeriesBreak ? totalCurrent * ammeterBurdenR : 0);
      nodeVoltages.R3_A = nodeVoltages.SERIES_JACK_B;
      nodeVoltages.R3_B = 0;
      nodeVoltages.R1_A = 0;
      nodeVoltages.R1_B = 0;
      nodeVoltages.R2_A = 0;
      nodeVoltages.R2_B = 0;
    } else if (state.topology === 'series') {
      // R1 + R2 + R3 in series + burden resistance
      req = r1 + r2 + r3 + ammeterBurdenR;
      totalCurrent = vs / req;
      i1 = totalCurrent;
      i2 = totalCurrent;
      i3 = totalCurrent;

      const vR1 = totalCurrent * r1;
      const vR2 = totalCurrent * r2;
      const vR3 = totalCurrent * r3;

      // Node Voltages from SRC_POS (vs) stepping down to GND (0)
      nodeVoltages.SERIES_JACK_A = vs;
      nodeVoltages.SERIES_JACK_B = vs - (isAmmeterInSeriesBreak ? totalCurrent * ammeterBurdenR : 0);
      nodeVoltages.R1_A = nodeVoltages.SERIES_JACK_B;
      nodeVoltages.R1_B = nodeVoltages.R1_A - vR1;
      nodeVoltages.R2_A = nodeVoltages.R1_B;
      nodeVoltages.R2_B = nodeVoltages.R2_A - vR2;
      nodeVoltages.R3_A = nodeVoltages.R2_B;
      nodeVoltages.R3_B = 0;
    } else if (state.topology === 'parallel') {
      // 1 / Req = 1/R1 + 1/R2 + 1/R3
      const gEq = 1 / r1 + 1 / r2 + 1 / r3;
      req = (1 / gEq) + ammeterBurdenR;
      totalCurrent = vs / req;
      const vBranch = vs - totalCurrent * ammeterBurdenR;

      i1 = vBranch / r1;
      i2 = vBranch / r2;
      i3 = vBranch / r3;

      nodeVoltages.SERIES_JACK_A = vs;
      nodeVoltages.SERIES_JACK_B = vBranch;
      nodeVoltages.R1_A = vBranch;
      nodeVoltages.R1_B = 0;
      nodeVoltages.R2_A = vBranch;
      nodeVoltages.R2_B = 0;
      nodeVoltages.R3_A = vBranch;
      nodeVoltages.R3_B = 0;
    } else {
      // Combination: R1 in series with (R2 || R3)
      const rParallel23 = (r2 * r3) / (r2 + r3);
      req = r1 + rParallel23 + ammeterBurdenR;
      totalCurrent = vs / req;
      i1 = totalCurrent;
      const vParallel = totalCurrent * rParallel23;
      i2 = vParallel / r2;
      i3 = vParallel / r3;

      nodeVoltages.SERIES_JACK_A = vs;
      nodeVoltages.SERIES_JACK_B = vs - totalCurrent * ammeterBurdenR;
      nodeVoltages.R1_A = nodeVoltages.SERIES_JACK_B;
      nodeVoltages.R1_B = nodeVoltages.R1_A - totalCurrent * r1;
      nodeVoltages.R2_A = nodeVoltages.R1_B;
      nodeVoltages.R2_B = 0;
      nodeVoltages.R3_A = nodeVoltages.R1_B;
      nodeVoltages.R3_B = 0;
    }
  }

  // AC Phasor Calculations
  const omega = 2 * Math.PI * Math.max(1, state.frequency);
  const lHenries = (state.inductanceMh || 150) * 1e-3;
  const cFarads = (state.capacitanceUf || 47) * 1e-6;
  const xl = omega * lHenries;
  const xc = 1 / (omega * cFarads);
  const xNet = xl - xc;
  const zMag = Math.sqrt(req * req + xNet * xNet);
  const phaseRad = Math.atan2(xNet, Math.max(0.001, req));
  const phaseDeg = (phaseRad * 180) / Math.PI;
  const powerFactor = Math.cos(phaseRad);

  const vDropR1 = Math.abs((nodeVoltages.R1_A ?? 0) - (nodeVoltages.R1_B ?? 0));
  const vDropR2 = Math.abs((nodeVoltages.R2_A ?? 0) - (nodeVoltages.R2_B ?? 0));
  const vDropR3 = Math.abs((nodeVoltages.R3_A ?? 0) - (nodeVoltages.R3_B ?? 0));
  const pR1 = vDropR1 * i1;
  const pR2 = vDropR2 * i2;
  const pR3 = vDropR3 * i3;

  const resistors: Record<'R1' | 'R2' | 'R3', ResistorTelemetry> = {
    R1: {
      id: 'R1',
      nominalResistance: r1,
      powerRatingW: 1.0,
      voltageDrop: vDropR1,
      currentA: i1,
      currentMa: i1 * 1000,
      powerW: pR1,
      powerPercent: (pR1 / 1.0) * 100,
      isOverloaded: pR1 > 1.0,
    },
    R2: {
      id: 'R2',
      nominalResistance: r2,
      powerRatingW: 1.0,
      voltageDrop: vDropR2,
      currentA: i2,
      currentMa: i2 * 1000,
      powerW: pR2,
      powerPercent: (pR2 / 1.0) * 100,
      isOverloaded: pR2 > 1.0,
    },
    R3: {
      id: 'R3',
      nominalResistance: r3,
      powerRatingW: 1.0,
      voltageDrop: vDropR3,
      currentA: i3,
      currentMa: i3 * 1000,
      powerW: pR3,
      powerPercent: (pR3 / 1.0) * 100,
      isOverloaded: pR3 > 1.0,
    },
  };

  return {
    nodeVoltages,
    branchCurrents: { total: totalCurrent, i1, i2, i3 },
    resistors,
    equivalentResistance: req,
    acImpedance: {
      zMagnitude: zMag,
      phaseRad,
      phaseDeg,
      xl,
      xc,
      powerFactor,
    },
  };
}

/**
 * Measure circuit using Digital Multimeter probes with realistic physical constraints.
 */
export function readMultimeter(state: CircuitState, dmm: MultimeterState): MultimeterReading {
  const { redProbeTerminal, blackProbeTerminal, mode, redJack, fuseBlown } = dmm;

  // 1. Probes not connected
  if (!redProbeTerminal || !blackProbeTerminal) {
    return {
      value: null,
      displayString: mode === 'cont' ? 'OPEN' : 'O.L',
      unit: mode.startsWith('a') ? 'A' : mode === 'ohm' ? 'Ω' : 'V',
      isContinuityBeep: false,
      warning: 'Measurement probes not placed. Drag or click probes onto circuit terminals.',
      isValidMeasurement: false,
    };
  }

  // 2. Both probes connected to the exact same terminal
  if (redProbeTerminal === blackProbeTerminal) {
    if (mode === 'cont') {
      return {
        value: 0.0,
        displayString: '0.0 Ω',
        unit: 'Ω',
        isContinuityBeep: true,
        warning: 'Probes shorted together on same terminal (Direct Continuity).',
        isValidMeasurement: true,
      };
    }
    return {
      value: 0.0,
      displayString: '0.00 ' + (mode.startsWith('a') ? 'A' : mode === 'ohm' ? 'Ω' : 'V'),
      unit: mode.startsWith('a') ? 'A' : mode === 'ohm' ? 'Ω' : 'V',
      isContinuityBeep: false,
      warning: 'Probes placed on the same electrical node. Potential difference is zero.',
      isValidMeasurement: true,
    };
  }

  // 3. Blown Fuse Check (Ammeter overload)
  if (fuseBlown) {
    return {
      value: 0.0,
      displayString: 'FUSE',
      unit: '',
      isContinuityBeep: false,
      warning: 'DMM FUSE BLOWN! Current overload protection tripped. Reset multimeter fuse.',
      isValidMeasurement: false,
    };
  }

  // -------------------------------------------------------------
  // VOLTAGE MEASUREMENTS (Parallel Connection)
  // -------------------------------------------------------------
  if (mode === 'v_dc' || mode === 'v_ac') {
    if (redJack !== 'v_ohm') {
      return {
        value: null,
        displayString: 'LEAd',
        unit: 'V',
        isContinuityBeep: false,
        warning: 'LEAD WARNING: Red lead is in current shunt jack (mA/10A) while dial is set to Voltage! Move red lead to V·Ω jack.',
        isValidMeasurement: false,
      };
    }

    const solution = solveCircuit(state, dmm);
    const vRed = solution.nodeVoltages[redProbeTerminal] ?? 0;
    const vBlack = solution.nodeVoltages[blackProbeTerminal] ?? 0;
    const diff = vRed - vBlack;

    // Realistic ADC reading fluctuation (±0.25%)
    const adcNoise = 1 + (Math.sin(diff * 11.7 + 1.3) * 0.0025);

    if (mode === 'v_dc') {
      const noisyDiff = diff * (diff !== 0 ? adcNoise : 1);
      return {
        value: diff,
        displayString: `${diff >= 0 ? '' : '-'}${Math.abs(noisyDiff).toFixed(2)} V`,
        unit: 'V',
        isContinuityBeep: false,
        warning: diff < 0 ? 'Negative potential: Probes connected with reversed polarity.' : null,
        isValidMeasurement: true,
      };
    } else {
      // AC RMS Voltage
      const vRms = Math.abs(diff) / Math.SQRT2;
      const noisyVRms = vRms * (vRms !== 0 ? adcNoise : 1);
      return {
        value: vRms,
        displayString: `${noisyVRms.toFixed(2)} V~`,
        unit: 'V',
        isContinuityBeep: false,
        warning: state.mode !== 'ac' ? 'Measuring DC circuit in AC Voltage mode. Reading indicates AC ripple only.' : null,
        isValidMeasurement: true,
      };
    }
  }

  // -------------------------------------------------------------
  // CURRENT MEASUREMENTS (Series Connection Required)
  // -------------------------------------------------------------
  if (mode === 'a_dc' || mode === 'a_ac') {
    if (redJack !== 'ma_10a') {
      return {
        value: null,
        displayString: 'LEAd',
        unit: 'A',
        isContinuityBeep: false,
        warning: 'LEAD WARNING: Red lead is in V·Ω jack while dial is set to Current (A)! Move red lead to mA/10A jack.',
        isValidMeasurement: false,
      };
    }

    // Dangerous parallel current check: Probes placed across voltage source or un-isolated branch while energized
    if (
      state.powerOn &&
      ((redProbeTerminal === 'SRC_POS' && blackProbeTerminal === 'SRC_NEG') ||
       (redProbeTerminal === 'SRC_NEG' && blackProbeTerminal === 'SRC_POS') ||
       (state.seriesJumperConnected && (
         (redProbeTerminal === 'SRC_POS' && blackProbeTerminal === 'R1_B') ||
         (redProbeTerminal === 'R1_B' && blackProbeTerminal === 'SRC_POS') ||
         (redProbeTerminal === 'SERIES_JACK_A' && blackProbeTerminal === 'SRC_NEG') ||
         (redProbeTerminal === 'SRC_NEG' && blackProbeTerminal === 'SERIES_JACK_A')
       )))
    ) {
      return {
        value: 99.9,
        displayString: 'FUSE',
        unit: '',
        isContinuityBeep: false,
        warning: 'DANGER: Ammeter connected in PARALLEL across voltage source! Zero-resistance current shunt caused massive overcurrent (> 10 A). Virtual fuse blown! Press Reset Fuse and insert ammeter in series.',
        isValidMeasurement: false,
        tripFuse: true,
      };
    }

    // Proper series connection check: Probes must bridge the opened series breakpoint
    const isSeriesBridge =
      !state.seriesJumperConnected &&
      ((redProbeTerminal === 'SERIES_JACK_A' && blackProbeTerminal === 'SERIES_JACK_B') ||
       (redProbeTerminal === 'SERIES_JACK_B' && blackProbeTerminal === 'SERIES_JACK_A'));

    if (!isSeriesBridge) {
      return {
        value: 0.0,
        displayString: '0.00 mA',
        unit: 'mA',
        isContinuityBeep: false,
        warning: 'To measure current, circuit must be OPENED at the test jack and the meter inserted in SERIES.',
        isValidMeasurement: false,
      };
    }

    const solution = solveCircuit(state, dmm);
    const iTotal = solution.branchCurrents.total;
    const isReverse = redProbeTerminal === 'SERIES_JACK_B';
    const signedI = isReverse ? -iTotal : iTotal;

    // Realistic ADC reading fluctuation (±0.3%)
    const adcNoise = 1 + (Math.sin(signedI * 53.1 + 0.7) * 0.003);
    const noisyI = signedI * (signedI !== 0 ? adcNoise : 1);

    if (Math.abs(noisyI) < 1.0) {
      // Display in mA
      const mA = noisyI * 1000;
      return {
        value: signedI,
        displayString: `${mA.toFixed(2)} mA`,
        unit: 'mA',
        isContinuityBeep: false,
        warning: isReverse ? 'Negative current: Ammeter probe leads reversed.' : null,
        isValidMeasurement: true,
      };
    }

    return {
      value: signedI,
      displayString: `${noisyI.toFixed(3)} A`,
      unit: 'A',
      isContinuityBeep: false,
      warning: isReverse ? 'Negative current: Ammeter probe leads reversed.' : null,
      isValidMeasurement: true,
    };
  }

  // -------------------------------------------------------------
  // RESISTANCE MEASUREMENTS (Circuit Must Be De-energized)
  // -------------------------------------------------------------
  if (mode === 'ohm') {
    if (redJack !== 'v_ohm') {
      return {
        value: null,
        displayString: 'LEAd',
        unit: 'Ω',
        isContinuityBeep: false,
        warning: 'LEAD WARNING: Red lead is in mA/10A current jack while dial is set to Resistance (Ω)! Move red lead to V·Ω jack.',
        isValidMeasurement: false,
      };
    }

    if (state.powerOn) {
      return {
        value: null,
        displayString: 'ERR PWR',
        unit: 'Ω',
        isContinuityBeep: false,
        warning: 'HAZARD: Do not measure resistance in an energized circuit! Turn OFF power supply first.',
        isValidMeasurement: false,
      };
    }

    // Identify which component probes are connected across
    const pair = [redProbeTerminal, blackProbeTerminal].sort().join('-');
    let measuredR = null;

    if (pair === 'R1_A-R1_B') measuredR = state.r1;
    else if (pair === 'R2_A-R2_B') measuredR = state.r2;
    else if (pair === 'R3_A-R3_B') measuredR = state.r3;
    else if (pair === 'R1_A-R3_B' || pair === 'R1_A-SRC_NEG') {
      // Equivalent resistance of entire network
      if (state.topology === 'series') measuredR = state.r1 + state.r2 + state.r3;
      else if (state.topology === 'parallel') measuredR = 1 / (1 / state.r1 + 1 / state.r2 + 1 / state.r3);
      else measuredR = state.r1 + (state.r2 * state.r3) / (state.r2 + state.r3);
    }

    if (measuredR !== null) {
      if (measuredR >= 1000) {
        return {
          value: measuredR,
          displayString: `${(measuredR / 1000).toFixed(2)} kΩ`,
          unit: 'kΩ',
          isContinuityBeep: false,
          warning: null,
          isValidMeasurement: true,
        };
      }
      return {
        value: measuredR,
        displayString: `${measuredR.toFixed(1)} Ω`,
        unit: 'Ω',
        isContinuityBeep: false,
        warning: null,
        isValidMeasurement: true,
      };
    }

    return {
      value: null,
      displayString: 'O.L',
      unit: 'Ω',
      isContinuityBeep: false,
      warning: 'Open circuit: Probes not spanning a closed component loop.',
      isValidMeasurement: false,
    };
  }

  // -------------------------------------------------------------
  // CONTINUITY TESTING (Beep if R < 30 Ohms)
  // -------------------------------------------------------------
  if (mode === 'cont') {
    if (redJack !== 'v_ohm') {
      return {
        value: null,
        displayString: 'LEAd',
        unit: 'Ω',
        isContinuityBeep: false,
        warning: 'LEAD WARNING: Red lead is in mA/10A jack while dial is set to Continuity! Move red lead to V·Ω jack.',
        isValidMeasurement: false,
      };
    }

    if (state.powerOn) {
      return {
        value: null,
        displayString: 'ERR PWR',
        unit: 'Ω',
        isContinuityBeep: false,
        warning: 'Turn OFF power before testing continuity!',
        isValidMeasurement: false,
      };
    }

    const pair = [redProbeTerminal, blackProbeTerminal].sort().join('-');
    const isDirectWire =
      pair === 'SERIES_JACK_A-SERIES_JACK_B' && state.seriesJumperConnected;

    if (isDirectWire) {
      return {
        value: 0.1,
        displayString: '0.1 Ω',
        unit: 'Ω',
        isContinuityBeep: true,
        warning: 'Closed circuit: Direct wire continuity verified (< 30 Ω).',
        isValidMeasurement: true,
      };
    }

    return {
      value: null,
      displayString: 'OPEN',
      unit: 'Ω',
      isContinuityBeep: false,
      warning: 'Open circuit or high resistance (> 30 Ω). No continuity tone.',
      isValidMeasurement: false,
    };
  }

  return {
    value: null,
    displayString: 'O.L',
    unit: '',
    isContinuityBeep: false,
    warning: null,
    isValidMeasurement: false,
  };
}
