'use client';

import React, { useState, useMemo } from 'react';
import {
  type CircuitSettings,
  type CircuitResult,
} from './room3Model';
import {
  type MultimeterMode,
  type MultimeterJack,
  type TerminalId,
  type MultimeterReading,
  solveCircuit,
} from './circuitSolver';
import {
  type ExperienceMode,
  type GuidedStepDefinition,
  type StepValidationResult,
} from './room3GuidedCurriculum';

export interface Room3CircuitWorkspaceProps {
  circuits: CircuitSettings;
  circuitResult: CircuitResult;
  dmmMode: MultimeterMode;
  dmmJack: MultimeterJack;
  redTerminal: TerminalId | null;
  blackTerminal: TerminalId | null;
  jumperClosed: boolean;
  dmmReading: MultimeterReading;
  onUpdateCircuits: (patch: Partial<CircuitSettings>) => void;
  onSetDmmMode: (mode: MultimeterMode) => void;
  onSetDmmJack: (jack: MultimeterJack) => void;
  onSetProbe: (probe: 'red' | 'black', terminal: TerminalId | null) => void;
  onToggleJumper: () => void;
  onResetFuse: () => void;
  onBackTo3D: () => void;
  experienceMode?: ExperienceMode;
  onSetExperienceMode?: (mode: ExperienceMode) => void;
  guidedStep?: GuidedStepDefinition;
  stepValidation?: StepValidationResult;
  onContinueGuidedStep?: () => void;
  onRecordMeasurement?: (name: string, value: number, unit: string) => void;
}

export function Room3CircuitWorkspace({
  circuits,
  circuitResult,
  dmmMode,
  dmmJack,
  redTerminal,
  blackTerminal,
  jumperClosed,
  dmmReading,
  onUpdateCircuits,
  onSetDmmMode,
  onSetDmmJack,
  onSetProbe,
  onToggleJumper,
  onResetFuse,
  onBackTo3D,
  experienceMode,
  onSetExperienceMode,
  guidedStep,
  stepValidation,
  onContinueGuidedStep,
  onRecordMeasurement,
}: Room3CircuitWorkspaceProps) {
  const [viewMode, setViewMode] = useState<'breadboard' | 'schematic'>('breadboard');
  const [selectedTerminal, setSelectedTerminal] = useState<TerminalId | null>(null);
  const [lampOn, setLampOn] = useState(false);
  const [knifeSwitchClosed, setKnifeSwitchClosed] = useState(true);

  // Free build custom elements (for Mode 3)
  const [freeBuildComponents, setFreeBuildComponents] = useState<Array<{ id: string; type: 'resistor' | 'capacitor' | 'inductor' | 'lamp'; value: number }>>([
    { id: 'R1', type: 'resistor', value: 100 },
    { id: 'R2', type: 'resistor', value: 220 },
    { id: 'R3', type: 'resistor', value: 330 },
  ]);

  const TERMINAL_SVG_COORDS: Record<string, { x: number; y: number }> = {
    SRC_POS: { x: 90, y: 133 },
    SRC_NEG: { x: 150, y: 133 },
    R1_A: { x: 140, y: 275 },
    R1_B: { x: 320, y: 275 },
    SERIES_JACK_A: { x: 360, y: 275 },
    SERIES_JACK_B: { x: 405, y: 275 },
    R2_A: { x: 520, y: 275 },
    R2_B: { x: 700, y: 275 },
    R3_A: { x: 720, y: 275 },
    R3_B: { x: 800, y: 275 },
    IND_A: { x: 420, y: 395 },
    IND_B: { x: 500, y: 395 },
    CAP_A: { x: 520, y: 395 },
    CAP_B: { x: 600, y: 395 },
  };

  // Real-time full circuit solution
  const solution = useMemo(() => {
    return solveCircuit(
      {
        mode: circuits.mode,
        topology: circuits.topology,
        powerOn: Boolean(circuits.powerOn && knifeSwitchClosed),
        sourceVoltage: circuits.vs,
        frequency: circuits.freq,
        waveType: 'sine',
        r1: circuits.r1,
        r2: circuits.r2,
        r3: circuits.r3,
        inductanceMh: circuits.inductance,
        capacitanceUf: circuits.capacitance,
        seriesJumperConnected: jumperClosed,
      },
      {
        mode: dmmMode,
        redJack: dmmJack,
        redProbeTerminal: redTerminal,
        blackProbeTerminal: blackTerminal,
        fuseBlown: false,
      }
    );
  }, [circuits, knifeSwitchClosed, jumperClosed, dmmMode, dmmJack, redTerminal, blackTerminal]);

  const vs = circuits.powerOn && knifeSwitchClosed ? circuits.vs : 0;
  const isSeries = circuits.topology === 'series';
  const totalCurrentMa = solution.branchCurrents.total * 1000;
  const totalPowerMw = vs * solution.branchCurrents.total * 1000;

  // Node Potentials
  const vVcc = vs;
  const vGnd = 0;
  const vNodeA = solution.nodeVoltages.R1_A ?? 0;
  const vNodeB = solution.nodeVoltages.R1_B ?? 0;
  const vNodeC = solution.nodeVoltages.R2_B ?? 0;
  const vNodeD = 0;

  // Resistor drops and currents
  const vR1 = Math.abs(vNodeA - vNodeB);
  const vR2 = Math.abs(vNodeB - vNodeC);
  const vR3 = Math.abs(vNodeC - vNodeD);

  const iR1Ma = solution.branchCurrents.i1 * 1000;
  const iR2Ma = solution.branchCurrents.i2 * 1000;
  const iR3Ma = solution.branchCurrents.i3 * 1000;

  const pR1Mw = vR1 * solution.branchCurrents.i1 * 1000;
  const pR2Mw = vR2 * solution.branchCurrents.i2 * 1000;
  const pR3Mw = vR3 * solution.branchCurrents.i3 * 1000;

  const handleTerminalClick = (terminal: TerminalId) => {
    if (!selectedTerminal) {
      setSelectedTerminal(terminal);
    } else if (selectedTerminal === terminal) {
      setSelectedTerminal(null);
    } else {
      // Connect multimeter probes across selectedTerminal and clicked terminal
      onSetProbe('red', selectedTerminal);
      onSetProbe('black', terminal);
      setSelectedTerminal(null);
    }
  };

  const handleWireSeriesPreset = () => {
    onUpdateCircuits({ topology: 'series', mode: 'dc', vs: 24.0, r1: 100, r2: 220, r3: 330, powerOn: true });
    if (!jumperClosed) onToggleJumper();
    onSetProbe('red', 'R1_A');
    onSetProbe('black', 'R1_B');
    onSetDmmMode('v_dc');
    onSetDmmJack('v_ohm');
  };

  const handleWireParallelPreset = () => {
    onUpdateCircuits({ topology: 'parallel', mode: 'dc', vs: 24.0, r1: 100, r2: 220, r3: 330, powerOn: true });
    if (!jumperClosed) onToggleJumper();
    onSetProbe('red', 'SRC_POS');
    onSetProbe('black', 'SRC_NEG');
    onSetDmmMode('v_dc');
    onSetDmmJack('v_ohm');
  };

  return (
    <div className="dcac-workspace-container" style={{
      display: 'flex',
      flexDirection: 'column',
      width: '100%',
      height: '100%',
      background: '#1a0b10',
      color: '#f8fafc',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Top Application Bar */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 16px',
        background: 'linear-gradient(180deg, #35121d 0%, #230c14 100%)',
        borderBottom: '1px solid rgba(212, 175, 55, 0.4)',
        zIndex: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '16px', color: '#fef08a' }}>⚡</span>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <b style={{ fontSize: '13px', letterSpacing: '0.5px' }}>BREADBOARD 3D VIRTUAL CIRCUIT LABORATORY</b>
              <span style={{ fontSize: '10px', background: 'rgba(212, 175, 55, 0.2)', color: '#fef08a', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(212, 175, 55, 0.5)' }}>
                DCACLab Architecture
              </span>
            </div>
            <small style={{ fontSize: '11px', color: '#94a3b8' }}>
              Real-time MNA Simulation Engine · True-RMS Multimeter · Interactive Breadboard Matrix
            </small>
          </div>
        </div>

        {/* View Toggle & Back to 3D */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ display: 'flex', background: '#15060b', padding: '3px', borderRadius: '6px', border: '1px solid rgba(212, 175, 55, 0.35)' }}>
            <button
              type="button"
              style={{
                background: viewMode === 'breadboard' ? '#d4af37' : 'transparent',
                color: viewMode === 'breadboard' ? '#1a0b10' : '#fef08a',
                border: 'none',
                padding: '4px 10px',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
              onClick={() => setViewMode('breadboard')}
            >
              🔌 Breadboard 3D
            </button>
            <button
              type="button"
              style={{
                background: viewMode === 'schematic' ? '#d4af37' : 'transparent',
                color: viewMode === 'schematic' ? '#1a0b10' : '#fef08a',
                border: 'none',
                padding: '4px 10px',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
              onClick={() => setViewMode('schematic')}
            >
              📐 2D Schematic
            </button>
          </div>

          <button
            type="button"
            style={{
              background: '#35121d',
              color: '#fef08a',
              border: '1px solid #d4af37',
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
            onClick={onBackTo3D}
          >
            <span>🔬 Return to 3D Laboratory [ESC]</span>
          </button>
        </div>
      </header>

      {/* Main Workspace Body */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, position: 'relative' }}>
        {/* Left Side: Interactive Circuit Construction Canvas */}
        <main style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          background: '#1a080f',
          overflow: 'auto',
          padding: '12px',
        }}>
          {/* Quick Actions & Circuit Presets Toolbar */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '10px',
            background: 'rgba(53, 18, 29, 0.85)',
            padding: '6px 12px',
            borderRadius: '8px',
            border: '1px solid rgba(212, 175, 55, 0.4)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>CIRCUIT ARRANGEMENT:</span>
              <button
                type="button"
                className={`quick-chip ${circuits.topology === 'series' ? 'active' : ''}`}
                style={{
                  background: circuits.topology === 'series' ? '#d4af37' : '#35121d',
                  color: circuits.topology === 'series' ? '#1a0b10' : '#fef08a',
                  border: 'none',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  cursor: 'pointer',
                }}
                onClick={handleWireSeriesPreset}
              >
                Series (R1 + R2 + R3 = 650Ω)
              </button>
              <button
                type="button"
                className={`quick-chip ${circuits.topology === 'parallel' ? 'active' : ''}`}
                style={{
                  background: circuits.topology === 'parallel' ? '#d4af37' : '#35121d',
                  color: circuits.topology === 'parallel' ? '#1a0b10' : '#fef08a',
                  border: 'none',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  cursor: 'pointer',
                }}
                onClick={handleWireParallelPreset}
              >
                Parallel (R1 || R2 || R3 = 68.6Ω)
              </button>
              <button
                type="button"
                style={{
                  background: knifeSwitchClosed ? '#10b981' : '#ef4444',
                  color: '#fff',
                  border: 'none',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
                onClick={() => setKnifeSwitchClosed(!knifeSwitchClosed)}
              >
                {knifeSwitchClosed ? '🔪 Knife Switch: CLOSED' : '🔪 Knife Switch: OPEN'}
              </button>
              <button
                type="button"
                style={{
                  background: jumperClosed ? '#10b981' : '#f59e0b',
                  color: '#fff',
                  border: 'none',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
                onClick={onToggleJumper}
              >
                {jumperClosed ? '🔗 Ammeter Break: JUMPERED' : '⚡ Ammeter Break: OPEN (Insert Meter)'}
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>Mode:</span>
              <span style={{ fontSize: '11px', color: '#fef08a', fontWeight: 600 }}>GUIDED EXPERIMENT</span>
            </div>
          </div>

          {/* Interactive Breadboard SVG */}
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            background: 'radial-gradient(circle at 50% 50%, #2e0f19 0%, #120509 100%)',
            borderRadius: '12px',
            border: '1px solid rgba(212, 175, 55, 0.4)',
            boxShadow: 'inset 0 0 40px rgba(0,0,0,0.6)',
            padding: '10px',
            minHeight: '440px',
          }}>
            <svg
              viewBox="0 0 960 560"
              style={{ width: '100%', height: '100%', maxHeight: '560px' }}
            >
              <defs>
                {/* Glow & Shadow Filters */}
                <filter id="lampGlow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="dropShadow" x="-10%" y="-10%" width="120%" height="120%">
                  <feDropShadow dx="0" dy="6" stdDeviation="8" floodColor="#000" floodOpacity="0.5" />
                </filter>
                {/* Breadboard Plastic Texture */}
                <linearGradient id="bbBodyGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f8fafc" />
                  <stop offset="100%" stopColor="#e2e8f0" />
                </linearGradient>
                <linearGradient id="psuBodyGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#334155" />
                  <stop offset="100%" stopColor="#1e293b" />
                </linearGradient>
                <linearGradient id="meterGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#eab308" />
                  <stop offset="100%" stopColor="#ca8a04" />
                </linearGradient>
              </defs>

              {/* ------------------------------------------------------------- */}
              {/* 1. DC POWER SUPPLY UNIT (Top Left) */}
              {/* ------------------------------------------------------------- */}
              <g transform="translate(40, 25)" filter="url(#dropShadow)">
                <rect x="0" y="0" width="220" height="135" rx="8" fill="url(#psuBodyGrad)" stroke="#475569" strokeWidth="2" />
                {/* Top Banner */}
                <rect x="0" y="0" width="220" height="28" rx="8" fill="#0f172a" />
                <text x="14" y="19" fill="#94a3b8" fontSize="11" fontFamily="monospace" fontWeight="700">DC POWER SUPPLY</text>

                {/* Digital LED Display */}
                <rect x="14" y="38" width="120" height="44" rx="4" fill="#020617" stroke="#1e293b" strokeWidth="1.5" />
                <text x="74" y="70" fill={circuits.powerOn && knifeSwitchClosed ? '#22c55e' : '#475569'} fontSize="26" fontFamily="monospace" fontWeight="bold" textAnchor="middle">
                  {circuits.vs.toFixed(1)}V
                </text>

                {/* Power ON/OFF Rocker Switch */}
                <rect
                  x="150"
                  y="38"
                  width="56"
                  height="44"
                  rx="6"
                  fill={circuits.powerOn ? '#15803d' : '#1e293b'}
                  stroke={circuits.powerOn ? '#22c55e' : '#64748b'}
                  strokeWidth="2"
                  style={{ cursor: 'pointer' }}
                  onClick={() => onUpdateCircuits({ powerOn: !circuits.powerOn })}
                />
                <text x="178" y="65" fill="#ffffff" fontSize="12" fontFamily="sans-serif" fontWeight="bold" textAnchor="middle" style={{ pointerEvents: 'none' }}>
                  {circuits.powerOn ? 'ON' : 'OFF'}
                </text>

                {/* Output Terminals (+ / -) */}
                {/* Red Positive Terminal */}
                <circle
                  cx="50"
                  cy="108"
                  r="12"
                  fill="#ef4444"
                  stroke="#b91c1c"
                  strokeWidth="2"
                  style={{ cursor: 'pointer' }}
                  onClick={() => handleTerminalClick('SRC_POS')}
                />
                <circle cx="50" cy="108" r="4" fill="#000" />
                <text x="50" y="92" fill="#ef4444" fontSize="12" fontWeight="bold" textAnchor="middle">+</text>
                <text x="50" y="130" fill="#94a3b8" fontSize="9" fontFamily="monospace" textAnchor="middle">VCC (24V)</text>

                {/* Black Negative GND Terminal */}
                <circle
                  cx="110"
                  cy="108"
                  r="12"
                  fill="#18181b"
                  stroke="#3f3f46"
                  strokeWidth="2"
                  style={{ cursor: 'pointer' }}
                  onClick={() => handleTerminalClick('SRC_NEG')}
                />
                <circle cx="110" cy="108" r="4" fill="#000" />
                <text x="110" y="92" fill="#94a3b8" fontSize="12" fontWeight="bold" textAnchor="middle">-</text>
                <text x="110" y="130" fill="#94a3b8" fontSize="9" fontFamily="monospace" textAnchor="middle">GND (0V)</text>

                {/* Voltage Adjustment Knobs */}
                <circle
                  cx="178"
                  cy="108"
                  r="12"
                  fill="#d4af37"
                  stroke="#b58b45"
                  strokeWidth="2"
                  style={{ cursor: 'pointer' }}
                  onClick={() => onUpdateCircuits({ vs: circuits.vs === 24.0 ? 12.0 : 24.0 })}
                />
                <text x="178" y="112" fill="#020617" fontSize="11" fontWeight="bold" textAnchor="middle">⟳</text>
                <text x="178" y="130" fill="#94a3b8" fontSize="9" fontFamily="monospace" textAnchor="middle">Adj Vs</text>
              </g>

              {/* ------------------------------------------------------------- */}
              {/* 2. SPST KNIFE SWITCH & LAMP (Top Center) */}
              {/* ------------------------------------------------------------- */}
              <g transform="translate(290, 45)" filter="url(#dropShadow)">
                {/* Switch Base */}
                <rect x="0" y="0" width="110" height="90" rx="6" fill="#1e293b" stroke="#334155" strokeWidth="1.5" />
                <text x="55" y="18" fill="#94a3b8" fontSize="9" fontFamily="monospace" textAnchor="middle">SPST KNIFE SWITCH</text>
                {/* Contacts */}
                <circle cx="25" cy="55" r="7" fill="#eab308" />
                <circle cx="85" cy="55" r="7" fill="#eab308" />
                {/* Blade */}
                <line
                  x1="25"
                  y1="55"
                  x2={knifeSwitchClosed ? 85 : 70}
                  y2={knifeSwitchClosed ? 55 : 25}
                  stroke="#facc15"
                  strokeWidth="5"
                  strokeLinecap="round"
                  style={{ cursor: 'pointer' }}
                  onClick={() => setKnifeSwitchClosed(!knifeSwitchClosed)}
                />
                <text x="55" y="80" fill={knifeSwitchClosed ? '#22c55e' : '#ef4444'} fontSize="10" fontFamily="monospace" fontWeight="bold" textAnchor="middle">
                  {knifeSwitchClosed ? 'CLOSED' : 'OPEN'}
                </text>
              </g>

              {/* Incandescent Lamp */}
              <g transform="translate(430, 45)" filter="url(#dropShadow)">
                <rect x="0" y="0" width="95" height="90" rx="6" fill="#1e293b" stroke="#334155" strokeWidth="1.5" />
                <text x="47" y="18" fill="#94a3b8" fontSize="9" fontFamily="monospace" textAnchor="middle">TEST LAMP</text>
                {/* Bulb Base */}
                <circle cx="47" cy="50" r="22" fill="#0f172a" stroke="#64748b" strokeWidth="2" />
                {/* Glowing Filament */}
                <circle
                  cx="47"
                  cy="50"
                  r="16"
                  fill={circuits.powerOn && knifeSwitchClosed && jumperClosed ? '#fef08a' : '#334155'}
                  filter={circuits.powerOn && knifeSwitchClosed && jumperClosed ? 'url(#lampGlow)' : undefined}
                  opacity={circuits.powerOn && knifeSwitchClosed && jumperClosed ? 0.9 : 0.3}
                />
                <path d="M 42 55 L 45 44 L 50 44 L 53 55" fill="none" stroke={circuits.powerOn && knifeSwitchClosed && jumperClosed ? '#ea580c' : '#64748b'} strokeWidth="1.5" />
                <text x="47" y="80" fill="#94a3b8" fontSize="9" fontFamily="monospace" textAnchor="middle">
                  {circuits.powerOn && knifeSwitchClosed && jumperClosed ? '12V 100mA' : 'OFF'}
                </text>
              </g>

              {/* ------------------------------------------------------------- */}
              {/* 3. WHITE BREADBOARD 3D MATRIX (Center & Lower) */}
              {/* ------------------------------------------------------------- */}
              <g transform="translate(40, 180)" filter="url(#dropShadow)">
                {/* Breadboard Base Plate */}
                <rect x="0" y="0" width="880" height="340" rx="14" fill="url(#bbBodyGrad)" stroke="#cbd5e1" strokeWidth="2" />

                {/* Breadboard Tie Point Rows Graphic (Columns 1 to 50) */}
                {/* Top Power Rails (+ / -) */}
                <line x1="40" y1="25" x2="840" y2="25" stroke="#ef4444" strokeWidth="2.5" />
                <line x1="40" y1="45" x2="840" y2="45" stroke="#3b82f6" strokeWidth="2.5" />
                <text x="25" y="29" fill="#ef4444" fontSize="14" fontWeight="bold">+</text>
                <text x="25" y="49" fill="#3b82f6" fontSize="14" fontWeight="bold">-</text>

                {/* Bottom Power Rails (+ / -) */}
                <line x1="40" y1="295" x2="840" y2="295" stroke="#ef4444" strokeWidth="2.5" />
                <line x1="40" y1="315" x2="840" y2="315" stroke="#3b82f6" strokeWidth="2.5" />
                <text x="25" y="299" fill="#ef4444" fontSize="14" fontWeight="bold">+</text>
                <text x="25" y="319" fill="#3b82f6" fontSize="14" fontWeight="bold">-</text>

                {/* Central Dividing Groove */}
                <rect x="40" y="165" width="800" height="10" fill="#94a3b8" rx="2" />

                {/* Column Pin Hole Grid (Visual dots) */}
                {[...Array(26)].map((_, col) => {
                  const cx = 70 + col * 30;
                  return (
                    <g key={`pin-col-${col}`}>
                      <text x={cx} y="62" fill="#64748b" fontSize="8" fontFamily="monospace" textAnchor="middle">{col * 2 + 1}</text>
                      {/* Row sockets A to E */}
                      <circle cx={cx} cy="80" r="2.2" fill="#0f172a" />
                      <circle cx={cx} cy="98" r="2.2" fill="#0f172a" />
                      <circle cx={cx} cy="116" r="2.2" fill="#0f172a" />
                      <circle cx={cx} cy="134" r="2.2" fill="#0f172a" />
                      <circle cx={cx} cy="152" r="2.2" fill="#0f172a" />
                      {/* Row sockets F to J */}
                      <circle cx={cx} cy="190" r="2.2" fill="#0f172a" />
                      <circle cx={cx} cy="208" r="2.2" fill="#0f172a" />
                      <circle cx={cx} cy="226" r="2.2" fill="#0f172a" />
                      <circle cx={cx} cy="244" r="2.2" fill="#0f172a" />
                      <circle cx={cx} cy="262" r="2.2" fill="#0f172a" />
                    </g>
                  );
                })}

                {/* ----------------------------------------------------------- */}
                {/* 4. PHYSICAL RESISTORS PLUGGED INTO BREADBOARD */}
                {/* ----------------------------------------------------------- */}
                {/* Resistor R1 (100 Ω) spanning Col 3 to Col 8 */}
                <g transform="translate(130, 95)" style={{ cursor: 'pointer' }} onClick={() => { onSetProbe('red', 'R1_A'); onSetProbe('black', 'R1_B'); }}>
                  {/* Lead wires */}
                  <line x1="-30" y1="0" x2="0" y2="0" stroke="#94a3b8" strokeWidth="2.5" />
                  <line x1="120" y1="0" x2="150" y2="0" stroke="#94a3b8" strokeWidth="2.5" />
                  {/* Ceramic Body */}
                  <rect x="0" y="-12" width="120" height="24" rx="10" fill="#fed7aa" stroke="#ca8a04" strokeWidth="1.5" />
                  {/* Color Bands: Brown (1), Black (0), Brown (x10), Gold (5%) */}
                  <rect x="22" y="-12" width="7" height="24" fill="#78350f" />
                  <rect x="42" y="-12" width="7" height="24" fill="#0f172a" />
                  <rect x="62" y="-12" width="7" height="24" fill="#78350f" />
                  <rect x="92" y="-12" width="6" height="24" fill="#eab308" />
                  {/* Value Badge */}
                  <text x="60" y="-18" fill="#0f172a" fontSize="11" fontFamily="monospace" fontWeight="bold" textAnchor="middle">
                    R1: 100 Ω (VR1 = {vR1.toFixed(2)}V)
                  </text>
                  {/* Snap Terminals */}
                  <circle cx="-30" cy="0" r="6" fill="#d4af37" stroke="#b58b45" strokeWidth="2" />
                  <circle cx="150" cy="0" r="6" fill="#d4af37" stroke="#b58b45" strokeWidth="2" />
                  <text x="-30" y="20" fill="#0f172a" fontSize="9" fontFamily="monospace" fontWeight="bold" textAnchor="middle">Node A</text>
                  <text x="150" y="20" fill="#0f172a" fontSize="9" fontFamily="monospace" fontWeight="bold" textAnchor="middle">Node B</text>
                </g>

                {/* Series Break / Ammeter Break Terminals between R1 and R2 */}
                <g transform="translate(320, 95)">
                  <circle cx="0" cy="0" r="8" fill="#e2e8f0" stroke="#f59e0b" strokeWidth="2.5" style={{ cursor: 'pointer' }} onClick={() => handleTerminalClick('SERIES_JACK_A')} />
                  <circle cx="45" cy="0" r="8" fill="#e2e8f0" stroke="#f59e0b" strokeWidth="2.5" style={{ cursor: 'pointer' }} onClick={() => handleTerminalClick('SERIES_JACK_B')} />
                  {/* Jumper Bar */}
                  {jumperClosed ? (
                    <line
                      x1="0"
                      y1="0"
                      x2="45"
                      y2="0"
                      stroke="#10b981"
                      strokeWidth="5"
                      strokeLinecap="round"
                      style={{ cursor: 'pointer' }}
                      onClick={onToggleJumper}
                    />
                  ) : (
                    <line
                      x1="0"
                      y1="0"
                      x2="35"
                      y2="-20"
                      stroke="#ef4444"
                      strokeWidth="5"
                      strokeLinecap="round"
                      style={{ cursor: 'pointer' }}
                      onClick={onToggleJumper}
                    />
                  )}
                  <text x="22" y="-24" fill={jumperClosed ? '#10b981' : '#ef4444'} fontSize="9" fontFamily="monospace" fontWeight="bold" textAnchor="middle">
                    {jumperClosed ? 'JUMPER CLOSED' : '⚡ AMMETER BREAK'}
                  </text>
                </g>

                {/* Resistor R2 (220 Ω) */}
                <g transform="translate(410, 95)" style={{ cursor: 'pointer' }} onClick={() => { onSetProbe('red', 'R2_A'); onSetProbe('black', 'R2_B'); }}>
                  <line x1="-30" y1="0" x2="0" y2="0" stroke="#94a3b8" strokeWidth="2.5" />
                  <line x1="120" y1="0" x2="150" y2="0" stroke="#94a3b8" strokeWidth="2.5" />
                  <rect x="0" y="-12" width="120" height="24" rx="10" fill="#fed7aa" stroke="#ca8a04" strokeWidth="1.5" />
                  {/* Color Bands: Red (2), Red (2), Brown (x10), Gold */}
                  <rect x="22" y="-12" width="7" height="24" fill="#dc2626" />
                  <rect x="42" y="-12" width="7" height="24" fill="#dc2626" />
                  <rect x="62" y="-12" width="7" height="24" fill="#78350f" />
                  <rect x="92" y="-12" width="6" height="24" fill="#eab308" />
                  <text x="60" y="-18" fill="#0f172a" fontSize="11" fontFamily="monospace" fontWeight="bold" textAnchor="middle">
                    R2: 220 Ω (VR2 = {vR2.toFixed(2)}V)
                  </text>
                  <circle cx="-30" cy="0" r="6" fill="#d4af37" stroke="#b58b45" strokeWidth="2" />
                  <circle cx="150" cy="0" r="6" fill="#d4af37" stroke="#b58b45" strokeWidth="2" />
                  <text x="-30" y="20" fill="#0f172a" fontSize="9" fontFamily="monospace" fontWeight="bold" textAnchor="middle">Node B</text>
                  <text x="150" y="20" fill="#0f172a" fontSize="9" fontFamily="monospace" fontWeight="bold" textAnchor="middle">Node C</text>
                </g>

                {/* Resistor R3 (330 Ω) */}
                <g transform="translate(610, 95)" style={{ cursor: 'pointer' }} onClick={() => { onSetProbe('red', 'R3_A'); onSetProbe('black', 'R3_B'); }}>
                  <line x1="-30" y1="0" x2="0" y2="0" stroke="#94a3b8" strokeWidth="2.5" />
                  <line x1="120" y1="0" x2="150" y2="0" stroke="#94a3b8" strokeWidth="2.5" />
                  <rect x="0" y="-12" width="120" height="24" rx="10" fill="#fed7aa" stroke="#ca8a04" strokeWidth="1.5" />
                  {/* Color Bands: Orange (3), Orange (3), Brown (x10), Gold */}
                  <rect x="22" y="-12" width="7" height="24" fill="#f97316" />
                  <rect x="42" y="-12" width="7" height="24" fill="#f97316" />
                  <rect x="62" y="-12" width="7" height="24" fill="#78350f" />
                  <rect x="92" y="-12" width="6" height="24" fill="#eab308" />
                  <text x="60" y="-18" fill="#0f172a" fontSize="11" fontFamily="monospace" fontWeight="bold" textAnchor="middle">
                    R3: 330 Ω (VR3 = {vR3.toFixed(2)}V)
                  </text>
                  <circle cx="-30" cy="0" r="6" fill="#d4af37" stroke="#b58b45" strokeWidth="2" />
                  <circle cx="150" cy="0" r="6" fill="#d4af37" stroke="#b58b45" strokeWidth="2" />
                  <text x="-30" y="20" fill="#0f172a" fontSize="9" fontFamily="monospace" fontWeight="bold" textAnchor="middle">Node C</text>
                  <text x="150" y="20" fill="#0f172a" fontSize="9" fontFamily="monospace" fontWeight="bold" textAnchor="middle">Node D (GND)</text>
                </g>

                {/* ----------------------------------------------------------- */}
                {/* 5. FLEXIBLE JUMPER WIRES (Connecting circuit loop) */}
                {/* ----------------------------------------------------------- */}
                {/* Red VCC Feed Wire from Power Rail to Node A */}
                <path
                  d="M 60 25 C 60 50, 100 65, 100 95"
                  fill="none"
                  stroke="#ef4444"
                  strokeWidth="4"
                  strokeLinecap="round"
                />

                {/* Ground Return Wire from Node D (760, 95) back to Blue Ground Rail */}
                <path
                  d="M 760 95 C 790 95, 820 50, 820 45"
                  fill="none"
                  stroke="#18181b"
                  strokeWidth="4"
                  strokeLinecap="round"
                />
              </g>

              {/* ------------------------------------------------------------- */}
              {/* 7. DEDICATED FLUKE 87V MULTIMETER BENCH UNIT (Top Right) */}
              {/* ------------------------------------------------------------- */}
              <g transform="translate(680, 25)" filter="url(#dropShadow)">
                {/* Yellow Rubber Holster */}
                <rect x="0" y="0" width="240" height="145" rx="10" fill="url(#meterGrad)" stroke="#a16207" strokeWidth="2" />
                <rect x="8" y="8" width="224" height="129" rx="8" fill="#0f172a" />

                {/* Digital LCD Readout */}
                <rect x="18" y="16" width="204" height="50" rx="4" fill="#020617" stroke="#334155" strokeWidth="1.5" />
                <text x="26" y="30" fill="#94a3b8" fontSize="9" fontFamily="monospace">FLUKE 87V · {dmmMode.toUpperCase()}</text>
                <text
                  x="120"
                  y="55"
                  fill={dmmReading.displayString === 'FUSE' || dmmReading.displayString === 'LEAd' ? '#ef4444' : '#38bdf8'}
                  fontSize="24"
                  fontFamily="monospace"
                  fontWeight="bold"
                  textAnchor="middle"
                >
                  {dmmReading.displayString}
                </text>

                {/* Rotary Mode Buttons */}
                <g transform="translate(18, 74)">
                  <rect
                    x="0"
                    y="0"
                    width="46"
                    height="24"
                    rx="4"
                    fill={dmmMode === 'v_dc' ? '#d4af37' : '#35121d'}
                    stroke="#334155"
                    strokeWidth="1"
                    style={{ cursor: 'pointer' }}
                    onClick={() => onSetDmmMode('v_dc')}
                  />
                  <text x="23" y="16" fill="#fff" fontSize="10" fontFamily="monospace" fontWeight="bold" textAnchor="middle">V⎓</text>

                  <rect
                    x="52"
                    y="0"
                    width="46"
                    height="24"
                    rx="4"
                    fill={dmmMode === 'a_dc' ? '#d4af37' : '#35121d'}
                    stroke="#334155"
                    strokeWidth="1"
                    style={{ cursor: 'pointer' }}
                    onClick={() => onSetDmmMode('a_dc')}
                  />
                  <text x="75" y="16" fill="#fff" fontSize="10" fontFamily="monospace" fontWeight="bold" textAnchor="middle">A⎓</text>

                  <rect
                    x="104"
                    y="0"
                    width="46"
                    height="24"
                    rx="4"
                    fill={dmmMode === 'ohm' ? '#d4af37' : '#35121d'}
                    stroke="#334155"
                    strokeWidth="1"
                    style={{ cursor: 'pointer' }}
                    onClick={() => onSetDmmMode('ohm')}
                  />
                  <text x="127" y="16" fill="#fff" fontSize="10" fontFamily="monospace" fontWeight="bold" textAnchor="middle">Ω</text>

                  <rect
                    x="156"
                    y="0"
                    width="46"
                    height="24"
                    rx="4"
                    fill={dmmMode === 'cont' ? '#d4af37' : '#35121d'}
                    stroke="#334155"
                    strokeWidth="1"
                    style={{ cursor: 'pointer' }}
                    onClick={() => onSetDmmMode('cont')}
                  />
                  <text x="179" y="16" fill="#fff" fontSize="10" fontFamily="monospace" fontWeight="bold" textAnchor="middle">🔊</text>
                </g>

                {/* Multimeter Jack Sockets (COM, V·Ω, mA/10A) */}
                <g transform="translate(18, 106)">
                  {/* V·Ω Jack */}
                  <circle
                    cx="25"
                    cy="14"
                    r="8"
                    fill="#ef4444"
                    stroke={dmmJack === 'v_ohm' ? '#38bdf8' : '#7f1d1d'}
                    strokeWidth={dmmJack === 'v_ohm' ? 3 : 1.5}
                    style={{ cursor: 'pointer' }}
                    onClick={() => onSetDmmJack('v_ohm')}
                  />
                  <text x="25" y="28" fill="#94a3b8" fontSize="8" fontFamily="monospace" textAnchor="middle">V·Ω</text>

                  {/* COM Jack */}
                  <circle cx="85" cy="14" r="8" fill="#18181b" stroke="#52525b" strokeWidth="2" />
                  <text x="85" y="28" fill="#94a3b8" fontSize="8" fontFamily="monospace" textAnchor="middle">COM</text>

                  {/* mA/10A Jack */}
                  <circle
                    cx="145"
                    cy="14"
                    r="8"
                    fill="#ef4444"
                    stroke={dmmJack === 'ma_10a' ? '#38bdf8' : '#7f1d1d'}
                    strokeWidth={dmmJack === 'ma_10a' ? 3 : 1.5}
                    style={{ cursor: 'pointer' }}
                    onClick={() => onSetDmmJack('ma_10a')}
                  />
                  <text x="145" y="28" fill="#94a3b8" fontSize="8" fontFamily="monospace" textAnchor="middle">mA·10A</text>
                </g>
              </g>

              {/* ------------------------------------------------------------- */}
              {/* 8. REALISTIC FLEXIBLE SILICONE TEST LEADS & PROBES */}
              {/* ------------------------------------------------------------- */}
              {/* Red Test Lead & Probe */}
              {(() => {
                if (!redTerminal || !TERMINAL_SVG_COORDS[redTerminal]) return null;
                const target = TERMINAL_SVG_COORDS[redTerminal];
                const jackX = dmmJack === 'v_ohm' ? 723 : 843;
                const jackY = 145;
                const cp1X = (jackX + target.x) / 2;
                const cp1Y = Math.max(jackY, target.y) + 70;
                const cp2X = target.x + 25;
                const cp2Y = target.y - 45;

                return (
                  <g filter="url(#dropShadow)">
                    {/* Flexible Red Silicone Cable */}
                    <path
                      d={`M ${jackX} ${jackY} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${target.x} ${target.y - 32}`}
                      fill="none"
                      stroke="#dc2626"
                      strokeWidth="5"
                      strokeLinecap="round"
                    />
                    {/* Red Probe Handle */}
                    <rect x={target.x - 5} y={target.y - 35} width="10" height="35" rx="4" fill="#dc2626" stroke="#991b1b" strokeWidth="1.5" />
                    <circle cx={target.x} cy={target.y - 18} r="3" fill="#f87171" />
                    {/* Metallic Needle Tip */}
                    <line x1={target.x} y1={target.y - 2} x2={target.x} y2={target.y} stroke="#cbd5e1" strokeWidth="3" strokeLinecap="round" />
                    <text x={target.x} y={target.y - 42} fill="#ef4444" fontSize="10" fontFamily="monospace" fontWeight="bold" textAnchor="middle">
                      🔴 RED ({redTerminal})
                    </text>
                  </g>
                );
              })()}

              {/* Black Test Lead & Probe (COM) */}
              {(() => {
                if (!blackTerminal || !TERMINAL_SVG_COORDS[blackTerminal]) return null;
                const target = TERMINAL_SVG_COORDS[blackTerminal];
                const jackX = 783; // COM Jack
                const jackY = 145;
                const cp1X = (jackX + target.x) / 2;
                const cp1Y = Math.max(jackY, target.y) + 90;
                const cp2X = target.x - 25;
                const cp2Y = target.y - 45;

                return (
                  <g filter="url(#dropShadow)">
                    {/* Flexible Black Silicone Cable */}
                    <path
                      d={`M ${jackX} ${jackY} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${target.x} ${target.y - 32}`}
                      fill="none"
                      stroke="#18181b"
                      strokeWidth="5"
                      strokeLinecap="round"
                    />
                    {/* Black Probe Handle */}
                    <rect x={target.x - 5} y={target.y - 35} width="10" height="35" rx="4" fill="#18181b" stroke="#3f3f46" strokeWidth="1.5" />
                    <circle cx={target.x} cy={target.y - 18} r="3" fill="#71717a" />
                    {/* Metallic Needle Tip */}
                    <line x1={target.x} y1={target.y - 2} x2={target.x} y2={target.y} stroke="#cbd5e1" strokeWidth="3" strokeLinecap="round" />
                    <text x={target.x} y={target.y - 42} fill="#94a3b8" fontSize="10" fontFamily="monospace" fontWeight="bold" textAnchor="middle">
                      ⚫ BLACK (COM)
                    </text>
                  </g>
                );
              })()}
            </svg>
          </div>
        </main>

        {/* ------------------------------------------------------------- */}
        {/* Right Aside: DCACLab REAL-TIME RESULTS TELEMETRY HUD */}
        {/* ------------------------------------------------------------- */}
        <aside style={{
          width: '320px',
          background: 'linear-gradient(180deg, #35121d 0%, #230c14 100%)',
          borderLeft: '1px solid rgba(212, 175, 55, 0.4)',
          display: 'flex',
          flexDirection: 'column',
          padding: '14px',
          overflowY: 'auto',
          gap: '12px',
        }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(212, 175, 55, 0.4)', paddingBottom: '8px' }}>
            <div>
              <b style={{ fontSize: '12px', letterSpacing: '0.5px', color: '#fef08a' }}>RESULTS (REAL TIME)</b>
              <div style={{ fontSize: '10px', color: '#94a3b8' }}>Live Kirchhoff & Ohm Analysis</div>
            </div>
            <span style={{ fontSize: '10px', padding: '2px 6px', background: circuits.powerOn && knifeSwitchClosed ? '#14532d' : '#7f1d1d', color: '#fff', borderRadius: '4px' }}>
              {circuits.powerOn && knifeSwitchClosed ? 'ENERGIZED' : 'OFF'}
            </span>
          </div>

          {/* Supply & Complete Circuit Summary */}
          <div style={{ background: '#15060b', padding: '10px', borderRadius: '8px', border: '1px solid rgba(212, 175, 55, 0.4)' }}>
            <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>DC SUPPLY SOURCE</div>
            <div style={{ fontSize: '20px', color: '#22c55e', fontWeight: 'bold', fontFamily: 'monospace' }}>
              {vs.toFixed(1)} V
            </div>

            <div style={{ height: '1px', background: 'rgba(212, 175, 55, 0.25)', margin: '8px 0' }} />

            <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>COMPLETE CIRCUIT TOTALS</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontFamily: 'monospace' }}>
              <div>
                <small style={{ color: '#64748b', fontSize: '10px' }}>I total</small>
                <div style={{ color: '#fef08a', fontSize: '13px', fontWeight: 'bold' }}>{totalCurrentMa.toFixed(2)} mA</div>
              </div>
              <div>
                <small style={{ color: '#64748b', fontSize: '10px' }}>P total</small>
                <div style={{ color: '#f59e0b', fontSize: '13px', fontWeight: 'bold' }}>{totalPowerMw.toFixed(1)} mW</div>
              </div>
              <div>
                <small style={{ color: '#64748b', fontSize: '10px' }}>Req (Equivalent)</small>
                <div style={{ color: '#e2e8f0', fontSize: '13px', fontWeight: 'bold' }}>{solution.equivalentResistance.toFixed(1)} Ω</div>
              </div>
              <div>
                <small style={{ color: '#64748b', fontSize: '10px' }}>Loop Status</small>
                <div style={{ color: jumperClosed || (redTerminal?.startsWith('SERIES') && blackTerminal?.startsWith('SERIES')) ? '#22c55e' : '#ef4444', fontSize: '12px', fontWeight: 'bold' }}>
                  {jumperClosed || (redTerminal?.startsWith('SERIES') && blackTerminal?.startsWith('SERIES')) ? 'Closed Loop' : 'Open Break'}
                </div>
              </div>
            </div>
          </div>

          {/* Node Potentials */}
          <div style={{ background: '#15060b', padding: '10px', borderRadius: '8px', border: '1px solid rgba(212, 175, 55, 0.4)' }}>
            <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '6px', fontWeight: 600 }}>NODE POTENTIALS (vs GND)</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', fontFamily: 'monospace', fontSize: '11px' }}>
              <div style={{ color: '#ef4444' }}>VCC: {vVcc.toFixed(3)} V</div>
              <div style={{ color: '#64748b' }}>GND: 0.000 V</div>
              <div style={{ color: '#fef08a' }}>Node A: {vNodeA.toFixed(3)} V</div>
              <div style={{ color: '#f59e0b' }}>Node B: {vNodeB.toFixed(3)} V</div>
              <div style={{ color: '#a855f7' }}>Node C: {vNodeC.toFixed(3)} V</div>
              <div style={{ color: '#64748b' }}>Node D: 0.000 V</div>
            </div>
          </div>

          {/* Per-Component Measurements */}
          <div style={{ background: '#15060b', padding: '10px', borderRadius: '8px', border: '1px solid rgba(212, 175, 55, 0.4)' }}>
            <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '6px', fontWeight: 600 }}>BRANCH READINGS</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontFamily: 'monospace', fontSize: '11px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #1e293b', paddingBottom: '3px' }}>
                <span style={{ color: '#e2e8f0' }}>R1 (100 Ω):</span>
                <span style={{ color: '#fef08a' }}>V = {vR1.toFixed(2)} V</span>
                <span style={{ color: '#f59e0b' }}>I = {iR1Ma.toFixed(1)} mA</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #1e293b', paddingBottom: '3px' }}>
                <span style={{ color: '#e2e8f0' }}>R2 (220 Ω):</span>
                <span style={{ color: '#fef08a' }}>V = {vR2.toFixed(2)} V</span>
                <span style={{ color: '#f59e0b' }}>I = {iR2Ma.toFixed(1)} mA</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#e2e8f0' }}>R3 (330 Ω):</span>
                <span style={{ color: '#fef08a' }}>V = {vR3.toFixed(2)} V</span>
                <span style={{ color: '#f59e0b' }}>I = {iR3Ma.toFixed(1)} mA</span>
              </div>
            </div>
          </div>

          {/* Live Multimeter Readout Card */}
          <div style={{ background: '#15060b', padding: '10px', borderRadius: '8px', border: '1px solid #eab308' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <span style={{ fontSize: '11px', color: '#eab308', fontWeight: 'bold' }}>FLUKE 87V DMM READOUT</span>
              <span style={{ fontSize: '10px', color: '#94a3b8' }}>JACK: {dmmJack.toUpperCase()}</span>
            </div>
            <div style={{ fontSize: '22px', color: dmmReading.isValidMeasurement ? '#38bdf8' : '#ef4444', fontWeight: 'bold', fontFamily: 'monospace' }}>
              {dmmReading.displayString}
            </div>
            {dmmReading.warning && (
              <div style={{ fontSize: '10px', color: '#ef4444', marginTop: '4px', lineHeight: '1.3' }}>
                ⚠️ {dmmReading.warning}
              </div>
            )}
            {dmmReading.tripFuse && (
              <button
                type="button"
                style={{ marginTop: '6px', width: '100%', background: '#b91c1c', color: '#fff', border: 'none', padding: '4px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}
                onClick={onResetFuse}
              >
                ↺ Reset Multimeter Fuse
              </button>
            )}

            {/* Quick Record into Notebook */}
            {dmmReading.isValidMeasurement && dmmReading.value !== null && onRecordMeasurement && (
              <button
                type="button"
                style={{
                  marginTop: '8px',
                  width: '100%',
                  background: 'linear-gradient(135deg, #d4af37 0%, #b58b45 100%)',
                  color: '#1a0b10',
                  border: 'none',
                  padding: '6px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
                onClick={() => {
                  const param = `${dmmMode.toUpperCase()} (${redTerminal ?? 'A'} to ${blackTerminal ?? 'B'})`;
                  onRecordMeasurement(param, dmmReading.value!, dmmReading.unit);
                }}
              >
                📝 Record to Lab Notebook (+10 pts)
              </button>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
