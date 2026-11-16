'use client';

import React, { useState, useMemo, useSyncExternalStore } from 'react';
import {
  type CircuitSettings,
  type CircuitResult,
  type TrialRecord,
} from './room3Model';
import { isMobileTouchDevice, subscribeMobileTouch } from './graphicsSettings';
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
  trials?: TrialRecord[];
  measurementWarning?: string | null;
  onInspectApparatus?: (id: string) => void;
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
  trials,
  measurementWarning,
  onInspectApparatus,
}: Room3CircuitWorkspaceProps) {
  const [viewMode, setViewMode] = useState<'breadboard' | 'schematic'>('breadboard');
  const [selectedTerminal, setSelectedTerminal] = useState<TerminalId | null>(null);
  const [lampOn, setLampOn] = useState(false);
  const [knifeSwitchClosed, setKnifeSwitchClosed] = useState(true);
  const isTouchDevice = useSyncExternalStore(subscribeMobileTouch, isMobileTouchDevice, () => false);
  const [zoomOverride, setZoomOverride] = useState<number | null>(null);
  const boardZoom = zoomOverride ?? (isTouchDevice ? 1.45 : 1);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

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

  const handleWireSinglePreset = () => {
    onUpdateCircuits({ topology: 'single', mode: 'dc', vs: 2.0, r1: 100, r2: 220, r3: 330, powerOn: true });
    if (!jumperClosed) onToggleJumper();
    onSetProbe('red', 'R3_A');
    onSetProbe('black', 'R3_B');
    onSetDmmMode('v_dc');
    onSetDmmJack('v_ohm');
  };

  const handleWireSeriesPreset = () => {
    onUpdateCircuits({ topology: 'series', mode: 'dc', vs: 6.0, r1: 100, r2: 220, r3: 330, powerOn: true });
    if (!jumperClosed) onToggleJumper();
    onSetProbe('red', 'R1_A');
    onSetProbe('black', 'R1_B');
    onSetDmmMode('v_dc');
    onSetDmmJack('v_ohm');
  };

  const handleWireParallelPreset = () => {
    onUpdateCircuits({ topology: 'parallel', mode: 'dc', vs: 6.0, r1: 100, r2: 220, r3: 330, powerOn: true });
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
      <header className="r3cw-header" style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 16px',
        background: 'linear-gradient(180deg, #35121d 0%, #230c14 100%)',
        borderBottom: '1px solid rgba(212, 175, 55, 0.4)',
        zIndex: 20,
      }}>
        <div className="r3cw-brand-left" style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
          <span style={{ fontSize: '16px', color: '#fef08a', flexShrink: 0 }}>⚡</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <b style={{ fontSize: '13px', letterSpacing: '0.4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>BREADBOARD 2D/3D LAB</b>
              <span className="r3cw-arch-tag" style={{ fontSize: '12px', background: 'rgba(212, 175, 55, 0.2)', color: '#fef08a', padding: '2px 7px', borderRadius: '4px', border: '1px solid rgba(212, 175, 55, 0.5)', whiteSpace: 'nowrap' }}>
                DCACLab Architecture
              </span>
            </div>
            <small style={{ fontSize: '12px', color: '#cbd5e1' }}>
              Real-time MNA Simulation Engine · True-RMS Multimeter · Interactive Breadboard Matrix
            </small>
          </div>
        </div>

        {/* View Toggle, Zoom, Mobile Stats Drawer & Back to 3D */}
        <div className="r3cw-header-actions" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <div className="r3cw-view-switch" style={{ display: 'flex', background: '#15060b', padding: '3px', borderRadius: '6px', border: '1px solid rgba(212, 175, 55, 0.35)' }}>
            <button
              type="button"
              style={{
                background: viewMode === 'breadboard' ? '#d4af37' : 'transparent',
                color: viewMode === 'breadboard' ? '#1a0b10' : '#fef08a',
                border: 'none',
                padding: '5px 10px',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
              onClick={() => setViewMode('breadboard')}
            >
              🔌 Breadboard
            </button>
            <button
              type="button"
              style={{
                background: viewMode === 'schematic' ? '#d4af37' : 'transparent',
                color: viewMode === 'schematic' ? '#1a0b10' : '#fef08a',
                border: 'none',
                padding: '5px 10px',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
              onClick={() => setViewMode('schematic')}
            >
              📐 Schematic
            </button>
          </div>

          <div className="r3cw-zoom-switch" style={{ display: 'flex', background: '#15060b', padding: '3px', borderRadius: '6px', border: '1px solid rgba(212, 175, 55, 0.35)', gap: '2px' }}>
            <button
              type="button"
              style={{
                background: boardZoom <= 1.05 ? '#38bdf8' : 'transparent',
                color: boardZoom <= 1.05 ? '#0f172a' : '#e2e8f0',
                border: 'none',
                padding: '5px 8px',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
              onClick={() => setZoomOverride(1)}
              title="Fit whole board to screen"
            >
              Fit
            </button>
            <button
              type="button"
              style={{
                background: boardZoom > 1.05 && boardZoom < 1.65 ? '#38bdf8' : 'transparent',
                color: boardZoom > 1.05 && boardZoom < 1.65 ? '#0f172a' : '#e2e8f0',
                border: 'none',
                padding: '5px 8px',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
              onClick={() => setZoomOverride(1.45)}
              title="Comfortable readable zoom"
            >
              1.4x
            </button>
            <button
              type="button"
              style={{
                background: boardZoom >= 1.65 ? '#38bdf8' : 'transparent',
                color: boardZoom >= 1.65 ? '#0f172a' : '#e2e8f0',
                border: 'none',
                padding: '5px 8px',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
              onClick={() => setZoomOverride(1.85)}
              title="Large zoomed breadboard & labels"
            >
              1.8x
            </button>
          </div>

          <button
            type="button"
            className={`r3cw-drawer-btn ${mobileSidebarOpen ? 'active' : ''}`}
            onClick={() => setMobileSidebarOpen((v) => !v)}
          >
            📊 {dmmReading.displayString} · {(trials?.length ?? 0)}/5 {mobileSidebarOpen ? '✕' : '▾'}
          </button>

          <button
            type="button"
            className="r3cw-back-btn"
            style={{
              background: '#35121d',
              color: '#fef08a',
              border: '1px solid #d4af37',
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap',
            }}
            onClick={onBackTo3D}
          >
            <span>🔬 Return to 3D Lab</span>
          </button>
        </div>
      </header>

      {/* Main Workspace Body */}
      <div className="r3cw-body" style={{ display: 'flex', flex: 1, minHeight: 0, position: 'relative' }}>
        {/* Left Side: Interactive Circuit Construction Canvas */}
        <main className="r3cw-main" style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          background: '#1a080f',
          overflow: 'hidden',
          padding: '10px',
          minWidth: 0,
        }}>
          {/* Quick Actions & Circuit Presets Toolbar */}
          <div className="r3cw-toolbar" style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '8px',
            background: 'rgba(53, 18, 29, 0.9)',
            padding: '6px 12px',
            borderRadius: '8px',
            border: '1px solid rgba(212, 175, 55, 0.4)',
            gap: '8px',
            flexShrink: 0,
          }}>
            <div className="r3cw-toolbar-presets" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="r3cw-toolbar-label" style={{ fontSize: '12px', color: '#cbd5e1', fontWeight: 600, whiteSpace: 'nowrap' }}>CIRCUIT:</span>
              <button
                type="button"
                className={`quick-chip ${circuits.topology === 'single' ? 'active' : ''}`}
                style={{
                  background: circuits.topology === 'single' ? '#d4af37' : '#35121d',
                  color: circuits.topology === 'single' ? '#1a0b10' : '#fef08a',
                  border: '1px solid rgba(212, 175, 55, 0.4)',
                  padding: '5px 10px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
                onClick={handleWireSinglePreset}
              >
                Single R3 (330Ω)
              </button>
              <button
                type="button"
                className={`quick-chip ${circuits.topology === 'series' ? 'active' : ''}`}
                style={{
                  background: circuits.topology === 'series' ? '#d4af37' : '#35121d',
                  color: circuits.topology === 'series' ? '#1a0b10' : '#fef08a',
                  border: '1px solid rgba(212, 175, 55, 0.4)',
                  padding: '5px 10px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
                onClick={handleWireSeriesPreset}
              >
                Series (650Ω)
              </button>
              <button
                type="button"
                className={`quick-chip ${circuits.topology === 'parallel' ? 'active' : ''}`}
                style={{
                  background: circuits.topology === 'parallel' ? '#d4af37' : '#35121d',
                  color: circuits.topology === 'parallel' ? '#1a0b10' : '#fef08a',
                  border: '1px solid rgba(212, 175, 55, 0.4)',
                  padding: '5px 10px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
                onClick={handleWireParallelPreset}
              >
                Parallel (56.9Ω)
              </button>
              <button
                type="button"
                style={{
                  background: knifeSwitchClosed ? '#10b981' : '#ef4444',
                  color: '#fff',
                  border: 'none',
                  padding: '5px 10px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
                onClick={() => setKnifeSwitchClosed(!knifeSwitchClosed)}
              >
                {knifeSwitchClosed ? '🔪 Switch: CLOSED' : '🔪 Switch: OPEN'}
              </button>
              <button
                type="button"
                style={{
                  background: jumperClosed ? '#10b981' : '#f59e0b',
                  color: '#fff',
                  border: 'none',
                  padding: '5px 10px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
                onClick={onToggleJumper}
              >
                {jumperClosed ? '🔗 Jumper: CLOSED' : '⚡ Ammeter Break: OPEN'}
              </button>
            </div>

            <div className="r3cw-mode-badge" style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>Mode:</span>
              <span style={{ fontSize: '12px', color: '#fef08a', fontWeight: 700 }}>GUIDED EXPERIMENT</span>
            </div>
          </div>

          {/* Interactive Breadboard SVG (Scrollable & Zoomable for Phone Readability) */}
          <div className="r3cw-board-wrap" style={{
            flex: 1,
            display: 'flex',
            alignItems: boardZoom > 1.05 ? 'flex-start' : 'center',
            justifyContent: boardZoom > 1.05 ? 'flex-start' : 'center',
            position: 'relative',
            background: 'radial-gradient(circle at 50% 50%, #2e0f19 0%, #120509 100%)',
            borderRadius: '12px',
            border: '1px solid rgba(212, 175, 55, 0.4)',
            boxShadow: 'inset 0 0 40px rgba(0,0,0,0.6)',
            padding: '10px',
            overflow: 'auto',
            WebkitOverflowScrolling: 'touch',
            touchAction: 'pan-x pan-y',
            minHeight: 0,
          }}>
            <svg
              className="r3cw-svg"
              viewBox="0 0 960 560"
              style={
                boardZoom > 1.05
                  ? {
                      width: `${Math.round(920 * boardZoom)}px`,
                      height: `${Math.round(535 * boardZoom)}px`,
                      flexShrink: 0,
                    }
                  : {
                      width: '100%',
                      height: '100%',
                      maxHeight: '560px',
                    }
              }
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
                <text x="14" y="19" fill="#cbd5e1" fontSize="12" fontFamily="monospace" fontWeight="700">DC POWER SUPPLY</text>

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
                  onClick={() => {
                    onInspectApparatus?.('circuits-power-switch');
                    onUpdateCircuits({ powerOn: !circuits.powerOn });
                  }}
                />
                <text x="178" y="65" fill="#ffffff" fontSize="13" fontFamily="sans-serif" fontWeight="bold" textAnchor="middle" style={{ pointerEvents: 'none' }}>
                  {circuits.powerOn ? 'ON' : 'OFF'}
                </text>
                {!circuits.powerOn && (
                  <g transform="translate(178, 22)" style={{ pointerEvents: 'none' }}>
                    <circle cx="0" cy="0" r="14" fill="rgba(34, 197, 94, 0.2)" stroke="#22c55e" strokeWidth="2" />
                    <text x="0" y="-4" fill="#4ade80" fontSize="12" fontWeight="bold" textAnchor="middle">▼ Turn ON</text>
                  </g>
                )}

                {/* Output Terminals (+ / -) */}
                {/* Red Positive Terminal */}
                <circle
                  cx="50"
                  cy="108"
                  r="20"
                  fill="transparent"
                  style={{ cursor: 'pointer' }}
                  onClick={() => handleTerminalClick('SRC_POS')}
                />
                <circle
                  cx="50"
                  cy="108"
                  r="12"
                  fill="#ef4444"
                  stroke="#b91c1c"
                  strokeWidth="2"
                  style={{ pointerEvents: 'none' }}
                />
                <circle cx="50" cy="108" r="4" fill="#000" style={{ pointerEvents: 'none' }} />
                <text x="50" y="92" fill="#f87171" fontSize="14" fontWeight="bold" textAnchor="middle" style={{ pointerEvents: 'none' }}>+</text>
                <text x="50" y="131" fill="#cbd5e1" fontSize="11.5" fontFamily="monospace" fontWeight="bold" textAnchor="middle" style={{ pointerEvents: 'none' }}>VCC</text>

                {/* Black Negative GND Terminal */}
                <circle
                  cx="110"
                  cy="108"
                  r="20"
                  fill="transparent"
                  style={{ cursor: 'pointer' }}
                  onClick={() => handleTerminalClick('SRC_NEG')}
                />
                <circle
                  cx="110"
                  cy="108"
                  r="12"
                  fill="#18181b"
                  stroke="#3f3f46"
                  strokeWidth="2"
                  style={{ pointerEvents: 'none' }}
                />
                <circle cx="110" cy="108" r="4" fill="#000" style={{ pointerEvents: 'none' }} />
                <text x="110" y="92" fill="#cbd5e1" fontSize="14" fontWeight="bold" textAnchor="middle" style={{ pointerEvents: 'none' }}>-</text>
                <text x="110" y="131" fill="#cbd5e1" fontSize="11.5" fontFamily="monospace" fontWeight="bold" textAnchor="middle" style={{ pointerEvents: 'none' }}>GND</text>

                {/* Voltage Adjustment Knobs */}
                <circle
                  cx="178"
                  cy="108"
                  r="20"
                  fill="transparent"
                  style={{ cursor: 'pointer' }}
                  onClick={() => onUpdateCircuits({ vs: circuits.vs === 24.0 ? 12.0 : 24.0 })}
                />
                <circle
                  cx="178"
                  cy="108"
                  r="12"
                  fill="#d4af37"
                  stroke="#b58b45"
                  strokeWidth="2"
                  style={{ pointerEvents: 'none' }}
                />
                <text x="178" y="112" fill="#020617" fontSize="13" fontWeight="bold" textAnchor="middle" style={{ pointerEvents: 'none' }}>⟳</text>
                <text x="178" y="131" fill="#cbd5e1" fontSize="11.5" fontFamily="monospace" fontWeight="bold" textAnchor="middle" style={{ pointerEvents: 'none' }}>Adj Vs</text>
              </g>

              {/* ------------------------------------------------------------- */}
              {/* 2. SPST KNIFE SWITCH & LAMP (Top Center) */}
              {/* ------------------------------------------------------------- */}
              <g transform="translate(290, 45)" filter="url(#dropShadow)" style={{ cursor: 'pointer' }} onClick={() => setKnifeSwitchClosed(!knifeSwitchClosed)}>
                {/* Switch Base */}
                <rect x="0" y="0" width="115" height="92" rx="6" fill="#1e293b" stroke="#475569" strokeWidth="1.5" />
                <text x="57" y="18" fill="#cbd5e1" fontSize="11.5" fontFamily="monospace" fontWeight="bold" textAnchor="middle">KNIFE SWITCH</text>
                {/* Contacts */}
                <circle cx="25" cy="55" r="7" fill="#eab308" />
                <circle cx="90" cy="55" r="7" fill="#eab308" />
                {/* Blade */}
                <line
                  x1="25"
                  y1="55"
                  x2={knifeSwitchClosed ? 90 : 72}
                  y2={knifeSwitchClosed ? 55 : 25}
                  stroke="#facc15"
                  strokeWidth="5"
                  strokeLinecap="round"
                />
                <text x="57" y="82" fill={knifeSwitchClosed ? '#22c55e' : '#ef4444'} fontSize="12" fontFamily="monospace" fontWeight="bold" textAnchor="middle">
                  {knifeSwitchClosed ? 'CLOSED' : 'OPEN'}
                </text>
              </g>

              {/* Incandescent Lamp */}
              <g transform="translate(430, 45)" filter="url(#dropShadow)">
                <rect x="0" y="0" width="105" height="92" rx="6" fill="#1e293b" stroke="#475569" strokeWidth="1.5" />
                <text x="52" y="18" fill="#cbd5e1" fontSize="11.5" fontFamily="monospace" fontWeight="bold" textAnchor="middle">TEST LAMP</text>
                {/* Bulb Base */}
                <circle cx="52" cy="50" r="22" fill="#0f172a" stroke="#64748b" strokeWidth="2" />
                {/* Glowing Filament */}
                <circle
                  cx="52"
                  cy="50"
                  r="16"
                  fill={circuits.powerOn && knifeSwitchClosed && jumperClosed ? '#fef08a' : '#334155'}
                  filter={circuits.powerOn && knifeSwitchClosed && jumperClosed ? 'url(#lampGlow)' : undefined}
                  opacity={circuits.powerOn && knifeSwitchClosed && jumperClosed ? 0.9 : 0.3}
                />
                <path d="M 47 55 L 50 44 L 55 44 L 58 55" fill="none" stroke={circuits.powerOn && knifeSwitchClosed && jumperClosed ? '#ea580c' : '#64748b'} strokeWidth="1.5" />
                <text x="52" y="82" fill="#cbd5e1" fontSize="11.5" fontFamily="monospace" fontWeight="bold" textAnchor="middle">
                  {circuits.powerOn && knifeSwitchClosed && jumperClosed ? 'LIT · ON' : 'OFF'}
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
                <text x="25" y="29" fill="#ef4444" fontSize="15" fontWeight="bold">+</text>
                <text x="25" y="49" fill="#3b82f6" fontSize="15" fontWeight="bold">-</text>

                {/* Bottom Power Rails (+ / -) */}
                <line x1="40" y1="295" x2="840" y2="295" stroke="#ef4444" strokeWidth="2.5" />
                <line x1="40" y1="315" x2="840" y2="315" stroke="#3b82f6" strokeWidth="2.5" />
                <text x="25" y="299" fill="#ef4444" fontSize="15" fontWeight="bold">+</text>
                <text x="25" y="319" fill="#3b82f6" fontSize="15" fontWeight="bold">-</text>

                {/* Central Dividing Groove */}
                <rect x="40" y="165" width="800" height="10" fill="#94a3b8" rx="2" />

                {/* Column Pin Hole Grid (Visual dots) */}
                {[...Array(26)].map((_, col) => {
                  const cx = 70 + col * 30;
                  return (
                    <g key={`pin-col-${col}`}>
                      {col % 2 === 0 && (
                        <text x={cx} y="63" fill="#475569" fontSize="11.5" fontFamily="monospace" fontWeight="700" textAnchor="middle">{col * 2 + 1}</text>
                      )}
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
                  <rect x="-40" y="-26" width="200" height="58" fill="transparent" />
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
                  <text x="60" y="-19" fill="#0f172a" fontSize="13" fontFamily="monospace" fontWeight="bold" textAnchor="middle">
                    R1: 100 Ω ({vR1.toFixed(2)}V)
                  </text>
                  {/* Snap Terminals */}
                  <circle cx="-30" cy="0" r="8" fill="#d4af37" stroke="#b58b45" strokeWidth="2" />
                  <circle cx="150" cy="0" r="8" fill="#d4af37" stroke="#b58b45" strokeWidth="2" />
                  <text x="-30" y="24" fill="#0f172a" fontSize="12" fontFamily="monospace" fontWeight="bold" textAnchor="middle">Node A</text>
                  <text x="150" y="24" fill="#0f172a" fontSize="12" fontFamily="monospace" fontWeight="bold" textAnchor="middle">Node B</text>
                </g>

                {/* Series Break / Ammeter Break Terminals between R1 and R2 */}
                <g transform="translate(320, 95)">
                  <circle cx="0" cy="0" r="18" fill="transparent" style={{ cursor: 'pointer' }} onClick={() => handleTerminalClick('SERIES_JACK_A')} />
                  <circle cx="45" cy="0" r="18" fill="transparent" style={{ cursor: 'pointer' }} onClick={() => handleTerminalClick('SERIES_JACK_B')} />
                  <circle cx="0" cy="0" r="8" fill="#e2e8f0" stroke="#f59e0b" strokeWidth="2.5" style={{ pointerEvents: 'none' }} />
                  <circle cx="45" cy="0" r="8" fill="#e2e8f0" stroke="#f59e0b" strokeWidth="2.5" style={{ pointerEvents: 'none' }} />
                  {/* Jumper Bar */}
                  {jumperClosed ? (
                    <line
                      x1="0"
                      y1="0"
                      x2="45"
                      y2="0"
                      stroke="#10b981"
                      strokeWidth="6"
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
                      strokeWidth="6"
                      strokeLinecap="round"
                      style={{ cursor: 'pointer' }}
                      onClick={onToggleJumper}
                    />
                  )}
                  <text x="22" y="-26" fill={jumperClosed ? '#047857' : '#dc2626'} fontSize="12" fontFamily="monospace" fontWeight="bold" textAnchor="middle" style={{ pointerEvents: 'none' }}>
                    {jumperClosed ? 'JUMPER' : '⚡ BREAK'}
                  </text>
                </g>

                {/* Resistor R2 (220 Ω) */}
                <g transform="translate(410, 95)" style={{ cursor: 'pointer' }} onClick={() => { onSetProbe('red', 'R2_A'); onSetProbe('black', 'R2_B'); }}>
                  <rect x="-40" y="-26" width="200" height="58" fill="transparent" />
                  <line x1="-30" y1="0" x2="0" y2="0" stroke="#94a3b8" strokeWidth="2.5" />
                  <line x1="120" y1="0" x2="150" y2="0" stroke="#94a3b8" strokeWidth="2.5" />
                  <rect x="0" y="-12" width="120" height="24" rx="10" fill="#fed7aa" stroke="#ca8a04" strokeWidth="1.5" />
                  {/* Color Bands: Red (2), Red (2), Brown (x10), Gold */}
                  <rect x="22" y="-12" width="7" height="24" fill="#dc2626" />
                  <rect x="42" y="-12" width="7" height="24" fill="#dc2626" />
                  <rect x="62" y="-12" width="7" height="24" fill="#78350f" />
                  <rect x="92" y="-12" width="6" height="24" fill="#eab308" />
                  <text x="60" y="-19" fill="#0f172a" fontSize="13" fontFamily="monospace" fontWeight="bold" textAnchor="middle">
                    R2: 220 Ω ({vR2.toFixed(2)}V)
                  </text>
                  <circle cx="-30" cy="0" r="8" fill="#d4af37" stroke="#b58b45" strokeWidth="2" />
                  <circle cx="150" cy="0" r="8" fill="#d4af37" stroke="#b58b45" strokeWidth="2" />
                  <text x="-30" y="24" fill="#0f172a" fontSize="12" fontFamily="monospace" fontWeight="bold" textAnchor="middle">Node B</text>
                  <text x="150" y="24" fill="#0f172a" fontSize="12" fontFamily="monospace" fontWeight="bold" textAnchor="middle">Node C</text>
                </g>

                {/* Resistor R3 (330 Ω) */}
                <g transform="translate(610, 95)" style={{ cursor: 'pointer' }} onClick={() => { onSetProbe('red', 'R3_A'); onSetProbe('black', 'R3_B'); }}>
                  <rect x="-40" y="-26" width="200" height="58" fill="transparent" />
                  <line x1="-30" y1="0" x2="0" y2="0" stroke="#94a3b8" strokeWidth="2.5" />
                  <line x1="120" y1="0" x2="150" y2="0" stroke="#94a3b8" strokeWidth="2.5" />
                  <rect x="0" y="-12" width="120" height="24" rx="10" fill="#fed7aa" stroke="#ca8a04" strokeWidth="1.5" />
                  {/* Color Bands: Orange (3), Orange (3), Brown (x10), Gold */}
                  <rect x="22" y="-12" width="7" height="24" fill="#f97316" />
                  <rect x="42" y="-12" width="7" height="24" fill="#f97316" />
                  <rect x="62" y="-12" width="7" height="24" fill="#78350f" />
                  <rect x="92" y="-12" width="6" height="24" fill="#eab308" />
                  <text x="60" y="-19" fill="#0f172a" fontSize="13" fontFamily="monospace" fontWeight="bold" textAnchor="middle">
                    R3: 330 Ω ({vR3.toFixed(2)}V)
                  </text>
                  <circle cx="-30" cy="0" r="8" fill="#d4af37" stroke="#b58b45" strokeWidth="2" />
                  <circle cx="150" cy="0" r="8" fill="#d4af37" stroke="#b58b45" strokeWidth="2" />
                  <text x="-30" y="24" fill="#0f172a" fontSize="12" fontFamily="monospace" fontWeight="bold" textAnchor="middle">Node C</text>
                  <text x="150" y="24" fill="#0f172a" fontSize="12" fontFamily="monospace" fontWeight="bold" textAnchor="middle">GND (D)</text>
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
                <text x="26" y="30" fill="#cbd5e1" fontSize="11.5" fontFamily="monospace" fontWeight="700">FLUKE 87V · {dmmMode.toUpperCase()}</text>
                <text
                  x="120"
                  y="56"
                  fill={dmmReading.displayString === 'FUSE' || dmmReading.displayString === 'LEAd' ? '#ef4444' : '#38bdf8'}
                  fontSize="24"
                  fontFamily="monospace"
                  fontWeight="bold"
                  textAnchor="middle"
                >
                  {dmmReading.displayString}
                </text>

                {/* Rotary Mode Buttons */}
                <g transform="translate(18, 72)">
                  <rect
                    x="0"
                    y="0"
                    width="46"
                    height="26"
                    rx="4"
                    fill={dmmMode === 'v_dc' ? '#d4af37' : '#35121d'}
                    stroke={dmmMode === 'v_dc' ? '#fef08a' : '#475569'}
                    strokeWidth={dmmMode === 'v_dc' ? 2 : 1}
                    style={{ cursor: 'pointer' }}
                    onClick={() => {
                      onInspectApparatus?.('circuits-multimeter');
                      onSetDmmMode('v_dc');
                    }}
                  />
                  <text x="23" y="18" fill={dmmMode === 'v_dc' ? '#1a0b10' : '#fff'} fontSize="13" fontFamily="monospace" fontWeight="bold" textAnchor="middle" style={{ pointerEvents: 'none' }}>V⎓</text>
                  {guidedStep?.id === 'c-step-4' && dmmMode !== 'v_dc' && (
                    <g transform="translate(23, -10)" style={{ pointerEvents: 'none' }}>
                      <polygon points="0,0 -4,-6 4,-6" fill="#38bdf8" />
                      <text x="0" y="-8" fill="#38bdf8" fontSize="11.5" fontWeight="bold" textAnchor="middle">▼ V⎓</text>
                    </g>
                  )}

                  <rect
                    x="52"
                    y="0"
                    width="46"
                    height="26"
                    rx="4"
                    fill={dmmMode === 'a_dc' ? '#d4af37' : '#35121d'}
                    stroke={dmmMode === 'a_dc' ? '#fef08a' : '#475569'}
                    strokeWidth={dmmMode === 'a_dc' ? 2 : 1}
                    style={{ cursor: 'pointer' }}
                    onClick={() => {
                      onInspectApparatus?.('circuits-multimeter');
                      onSetDmmMode('a_dc');
                    }}
                  />
                  <text x="75" y="18" fill={dmmMode === 'a_dc' ? '#1a0b10' : '#fff'} fontSize="13" fontFamily="monospace" fontWeight="bold" textAnchor="middle" style={{ pointerEvents: 'none' }}>A⎓</text>
                  {guidedStep?.id === 'c-step-6' && dmmMode !== 'a_dc' && (
                    <g transform="translate(75, -10)" style={{ pointerEvents: 'none' }}>
                      <polygon points="0,0 -4,-6 4,-6" fill="#38bdf8" />
                      <text x="0" y="-8" fill="#38bdf8" fontSize="11.5" fontWeight="bold" textAnchor="middle">▼ A⎓</text>
                    </g>
                  )}

                  <rect
                    x="104"
                    y="0"
                    width="46"
                    height="26"
                    rx="4"
                    fill={dmmMode === 'ohm' ? '#d4af37' : '#35121d'}
                    stroke="#475569"
                    strokeWidth="1"
                    style={{ cursor: 'pointer' }}
                    onClick={() => {
                      onInspectApparatus?.('circuits-multimeter');
                      onSetDmmMode('ohm');
                    }}
                  />
                  <text x="127" y="18" fill={dmmMode === 'ohm' ? '#1a0b10' : '#fff'} fontSize="13" fontFamily="monospace" fontWeight="bold" textAnchor="middle" style={{ pointerEvents: 'none' }}>Ω</text>

                  <rect
                    x="156"
                    y="0"
                    width="46"
                    height="26"
                    rx="4"
                    fill={dmmMode === 'cont' ? '#d4af37' : '#35121d'}
                    stroke="#475569"
                    strokeWidth="1"
                    style={{ cursor: 'pointer' }}
                    onClick={() => {
                      onInspectApparatus?.('circuits-multimeter');
                      onSetDmmMode('cont');
                    }}
                  />
                  <text x="179" y="18" fill={dmmMode === 'cont' ? '#1a0b10' : '#fff'} fontSize="13" fontFamily="monospace" fontWeight="bold" textAnchor="middle" style={{ pointerEvents: 'none' }}>🔊</text>
                </g>

                {/* Multimeter Jack Sockets (COM, V·Ω, mA/10A) */}
                <g transform="translate(18, 104)">
                  {/* V·Ω Jack */}
                  <circle
                    cx="25"
                    cy="14"
                    r="18"
                    fill="transparent"
                    style={{ cursor: 'pointer' }}
                    onClick={() => {
                      onInspectApparatus?.('circuits-multimeter');
                      onSetDmmJack('v_ohm');
                    }}
                  />
                  <circle
                    cx="25"
                    cy="14"
                    r="8"
                    fill="#ef4444"
                    stroke={dmmJack === 'v_ohm' ? '#38bdf8' : '#7f1d1d'}
                    strokeWidth={dmmJack === 'v_ohm' ? 3 : 1.5}
                    style={{ pointerEvents: 'none' }}
                  />
                  <text x="25" y="30" fill="#cbd5e1" fontSize="11.5" fontFamily="monospace" fontWeight="bold" textAnchor="middle" style={{ pointerEvents: 'none' }}>V·Ω</text>
                  {guidedStep?.id === 'c-step-4' && dmmJack !== 'v_ohm' && (
                    <g transform="translate(25, -2)" style={{ pointerEvents: 'none' }}>
                      <text x="0" y="-2" fill="#38bdf8" fontSize="11.5" fontWeight="bold" textAnchor="middle">▼ V·Ω</text>
                    </g>
                  )}

                  {/* COM Jack */}
                  <circle cx="85" cy="14" r="8" fill="#18181b" stroke="#71717a" strokeWidth="2" />
                  <text x="85" y="30" fill="#cbd5e1" fontSize="11.5" fontFamily="monospace" fontWeight="bold" textAnchor="middle">COM</text>

                  {/* mA/10A Jack */}
                  <circle
                    cx="145"
                    cy="14"
                    r="18"
                    fill="transparent"
                    style={{ cursor: 'pointer' }}
                    onClick={() => {
                      onInspectApparatus?.('circuits-multimeter');
                      onSetDmmJack('ma_10a');
                    }}
                  />
                  <circle
                    cx="145"
                    cy="14"
                    r="8"
                    fill="#ef4444"
                    stroke={dmmJack === 'ma_10a' ? '#38bdf8' : '#7f1d1d'}
                    strokeWidth={dmmJack === 'ma_10a' ? 3 : 1.5}
                    style={{ pointerEvents: 'none' }}
                  />
                  <text x="145" y="30" fill="#cbd5e1" fontSize="11.5" fontFamily="monospace" fontWeight="bold" textAnchor="middle" style={{ pointerEvents: 'none' }}>mA·10A</text>
                  {guidedStep?.id === 'c-step-6' && dmmJack !== 'ma_10a' && (
                    <g transform="translate(145, -2)" style={{ pointerEvents: 'none' }}>
                      <text x="0" y="-2" fill="#38bdf8" fontSize="11.5" fontWeight="bold" textAnchor="middle">▼ mA</text>
                    </g>
                  )}
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
                  <g filter="url(#dropShadow)" style={{ pointerEvents: 'none' }}>
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
                    <text x={target.x} y={target.y - 44} fill="#ef4444" fontSize="12.5" fontFamily="monospace" fontWeight="bold" textAnchor="middle">
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
                  <g filter="url(#dropShadow)" style={{ pointerEvents: 'none' }}>
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
                    <text x={target.x} y={target.y - 44} fill="#94a3b8" fontSize="12.5" fontFamily="monospace" fontWeight="bold" textAnchor="middle">
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
        <aside className={`r3cw-sidebar ${mobileSidebarOpen ? 'mobile-open' : ''}`} style={{
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(212, 175, 55, 0.4)', paddingBottom: '8px', gap: '8px' }}>
            <div>
              <b style={{ fontSize: '13px', letterSpacing: '0.4px', color: '#fef08a' }}>RESULTS (REAL TIME)</b>
              <div style={{ fontSize: '12px', color: '#cbd5e1' }}>Live Kirchhoff & Ohm Analysis</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '12px', padding: '2px 7px', background: circuits.powerOn && knifeSwitchClosed ? '#14532d' : '#7f1d1d', color: '#fff', borderRadius: '4px', fontWeight: 700 }}>
                {circuits.powerOn && knifeSwitchClosed ? 'ON' : 'OFF'}
              </span>
              <button
                type="button"
                className="r3cw-sidebar-close-btn"
                onClick={() => setMobileSidebarOpen(false)}
                aria-label="Close results drawer"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Supply & Complete Circuit Summary */}
          <div style={{ background: '#15060b', padding: '10px', borderRadius: '8px', border: '1px solid rgba(212, 175, 55, 0.4)' }}>
            <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>DC SUPPLY SOURCE</div>
            <div style={{ fontSize: '20px', color: '#22c55e', fontWeight: 'bold', fontFamily: 'monospace' }}>
              {vs.toFixed(1)} V
            </div>

            <div style={{ height: '1px', background: 'rgba(212, 175, 55, 0.25)', margin: '8px 0' }} />

            <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>COMPLETE CIRCUIT TOTALS</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontFamily: 'monospace' }}>
              <div>
                <small style={{ color: '#94a3b8', fontSize: '12px' }}>I total</small>
                <div style={{ color: '#fef08a', fontSize: '13px', fontWeight: 'bold' }}>{totalCurrentMa.toFixed(2)} mA</div>
              </div>
              <div>
                <small style={{ color: '#94a3b8', fontSize: '12px' }}>P total</small>
                <div style={{ color: '#f59e0b', fontSize: '13px', fontWeight: 'bold' }}>{totalPowerMw.toFixed(1)} mW</div>
              </div>
              <div>
                <small style={{ color: '#94a3b8', fontSize: '12px' }}>Req (Equiv)</small>
                <div style={{ color: '#e2e8f0', fontSize: '13px', fontWeight: 'bold' }}>{solution.equivalentResistance.toFixed(1)} Ω</div>
              </div>
              <div>
                <small style={{ color: '#94a3b8', fontSize: '12px' }}>Loop Status</small>
                <div style={{ color: jumperClosed || (redTerminal?.startsWith('SERIES') && blackTerminal?.startsWith('SERIES')) ? '#22c55e' : '#ef4444', fontSize: '12px', fontWeight: 'bold' }}>
                  {jumperClosed || (redTerminal?.startsWith('SERIES') && blackTerminal?.startsWith('SERIES')) ? 'Closed Loop' : 'Open Break'}
                </div>
              </div>
            </div>
          </div>

          {/* Node Potentials */}
          <div style={{ background: '#15060b', padding: '10px', borderRadius: '8px', border: '1px solid rgba(212, 175, 55, 0.4)' }}>
            <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '6px', fontWeight: 600 }}>NODE POTENTIALS (vs GND)</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', fontFamily: 'monospace', fontSize: '12px' }}>
              <div style={{ color: '#ef4444' }}>VCC: {vVcc.toFixed(3)} V</div>
              <div style={{ color: '#94a3b8' }}>GND: 0.000 V</div>
              <div style={{ color: '#fef08a' }}>Node A: {vNodeA.toFixed(3)} V</div>
              <div style={{ color: '#f59e0b' }}>Node B: {vNodeB.toFixed(3)} V</div>
              <div style={{ color: '#a855f7' }}>Node C: {vNodeC.toFixed(3)} V</div>
              <div style={{ color: '#94a3b8' }}>Node D: 0.000 V</div>
            </div>
          </div>

          {/* Per-Component Measurements */}
          <div style={{ background: '#15060b', padding: '10px', borderRadius: '8px', border: '1px solid rgba(212, 175, 55, 0.4)' }}>
            <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '6px', fontWeight: 600 }}>BRANCH READINGS</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontFamily: 'monospace', fontSize: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #1e293b', paddingBottom: '3px' }}>
                <span style={{ color: '#e2e8f0' }}>R1 (100Ω):</span>
                <span style={{ color: '#fef08a' }}>{vR1.toFixed(2)}V</span>
                <span style={{ color: '#f59e0b' }}>{iR1Ma.toFixed(1)}mA</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #1e293b', paddingBottom: '3px' }}>
                <span style={{ color: '#e2e8f0' }}>R2 (220Ω):</span>
                <span style={{ color: '#fef08a' }}>{vR2.toFixed(2)}V</span>
                <span style={{ color: '#f59e0b' }}>{iR2Ma.toFixed(1)}mA</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#e2e8f0' }}>R3 (330Ω):</span>
                <span style={{ color: '#fef08a' }}>{vR3.toFixed(2)}V</span>
                <span style={{ color: '#f59e0b' }}>{iR3Ma.toFixed(1)}mA</span>
              </div>
            </div>
          </div>

          {/* Live Multimeter Readout Card */}
          <div style={{ background: '#15060b', padding: '10px', borderRadius: '8px', border: '1px solid #eab308' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <span style={{ fontSize: '12px', color: '#eab308', fontWeight: 'bold' }}>FLUKE 87V DMM READOUT</span>
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>{dmmJack.toUpperCase()}</span>
            </div>
            <div style={{ fontSize: '22px', color: dmmReading.isValidMeasurement ? '#38bdf8' : '#ef4444', fontWeight: 'bold', fontFamily: 'monospace' }}>
              {dmmReading.displayString}
            </div>
            {dmmReading.warning && (
              <div style={{ fontSize: '12px', color: '#fca5a5', marginTop: '4px', lineHeight: '1.35' }}>
                ⚠️ {dmmReading.warning}
              </div>
            )}
            {dmmReading.tripFuse && (
              <button
                type="button"
                style={{ marginTop: '6px', width: '100%', background: '#b91c1c', color: '#fff', border: 'none', padding: '6px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}
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
                  padding: '8px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
                onClick={() => {
                  const param = `${dmmMode.toUpperCase()} (${redTerminal ?? 'A'} to ${blackTerminal ?? 'B'})`;
                  onRecordMeasurement(param, dmmReading.value!, dmmReading.unit);
                }}
              >
                📝 Record Reading to Notebook (+10 pts)
              </button>
            )}

            {/* 5-Trial Experimental Data Collection Card */}
            <div style={{
              marginTop: '12px',
              padding: '10px',
              background: 'rgba(53, 18, 29, 0.85)',
              border: '1.5px solid rgba(212, 175, 55, 0.45)',
              borderRadius: '6px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <span style={{ fontSize: '12px', fontWeight: 800, color: '#fef08a' }}>
                  📊 5-TRIAL DATASET: {(trials?.length ?? 0)} / 5
                </span>
                <span style={{ fontSize: '12px', color: (trials?.length ?? 0) >= 5 ? '#34d399' : '#d4af37', fontWeight: 700 }}>
                  {(trials?.length ?? 0) >= 5 ? '✓ Done' : `#${(trials?.length ?? 0) + 1}`}
                </span>
              </div>

              {(trials?.length ?? 0) < 5 && (
                <>
                  <div style={{ fontSize: '12px', color: '#e2e8f0', marginBottom: '6px' }}>
                    Assigned Target: <b style={{ color: '#fef08a' }}>Vs = {[4, 8, 12, 16, 20][trials?.length ?? 0]}.0 V</b>
                  </div>
                  <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
                    {[4, 8, 12, 16, 20].map((v) => (
                      <button
                        key={v}
                        type="button"
                        style={{
                          flex: 1,
                          background: circuits.vs === v ? '#d4af37' : 'rgba(35, 12, 20, 0.8)',
                          color: circuits.vs === v ? '#1a0b10' : '#fffbeb',
                          border: '1px solid rgba(212, 175, 55, 0.5)',
                          borderRadius: '4px',
                          padding: '6px 0',
                          fontSize: '12px',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                        onClick={() => onUpdateCircuits({ vs: v, powerOn: true })}
                      >
                        {v}V
                      </button>
                    ))}
                  </div>
                </>
              )}

              {measurementWarning && (
                <div style={{
                  marginBottom: '8px',
                  padding: '6px 8px',
                  background: 'rgba(127, 29, 29, 0.95)',
                  border: '1px solid #ef4444',
                  borderRadius: '4px',
                  color: '#fef2f2',
                  fontSize: '12px',
                  lineHeight: '1.35',
                  fontWeight: 600,
                }}>
                  ⚠️ {measurementWarning}
                </div>
              )}

              {onRecordMeasurement && (
                <button
                  type="button"
                  style={{
                    width: '100%',
                    background: (trials?.length ?? 0) >= 5 ? 'rgba(16, 185, 129, 0.25)' : 'linear-gradient(135deg, #d4af37 0%, #b58b45 100%)',
                    color: (trials?.length ?? 0) >= 5 ? '#34d399' : '#1a0b10',
                    border: (trials?.length ?? 0) >= 5 ? '1px solid #10b981' : '1px solid #fef08a',
                    padding: '8px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                  onClick={() => onRecordMeasurement('trial', circuits.vs, 'V')}
                >
                  {(trials?.length ?? 0) >= 5
                    ? '✓ All 5 Trials Recorded'
                    : `⚡ Record Trial #${(trials?.length ?? 0) + 1} (${circuits.vs}V)`}
                </button>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
