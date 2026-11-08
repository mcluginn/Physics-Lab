'use client';

import React, { useMemo } from 'react';
import {
  type CircuitSettings,
  type OpticsSettings,
  type RelativitySettings,
  type CircuitResult,
  type OpticsResult,
  type RelativityResult,
  type Room3StationId,
  MASS_PRESETS,
} from './room3Model';
import { type MultimeterReading } from './circuitSolver';

interface Room3Schematic2DProps {
  stationId: Room3StationId;
  circuits: CircuitSettings;
  optics: OpticsSettings;
  relativity: RelativitySettings;
  circuitResult: CircuitResult;
  opticsResult: OpticsResult;
  relativityResult: RelativityResult;
  dmmReading: MultimeterReading;
  jumperClosed: boolean;
  onToggleJumper?: () => void;
}

export function Room3Schematic2D({
  stationId,
  circuits,
  optics,
  relativity,
  circuitResult,
  opticsResult,
  relativityResult,
  dmmReading,
  jumperClosed,
  onToggleJumper,
}: Room3Schematic2DProps) {
  if (stationId === 'circuits') {
    return (
      <div className="schematic-viewport" style={{ width: '100%', height: '100%', background: '#070d18', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
        <svg viewBox="0 0 800 500" style={{ width: '100%', height: '100%', maxHeight: '550px' }}>
          <defs>
            <linearGradient id="psuGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1e293b" />
              <stop offset="100%" stopColor="#0f172a" />
            </linearGradient>
            <linearGradient id="dmmGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#334155" />
              <stop offset="100%" stopColor="#1e293b" />
            </linearGradient>
          </defs>

          {/* Background Grid Pattern */}
          <pattern id="gridPattern" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#1e293b" strokeWidth="0.5" />
          </pattern>
          <rect width="800" height="500" fill="url(#gridPattern)" />

          {/* Title Banner */}
          <text x="30" y="35" fill="#38bdf8" fontSize="13" fontFamily="monospace" fontWeight="700" letterSpacing="1">
            2D PRECISION SCHEMATIC · STATION 01: RLC CIRCUIT MATRIX
          </text>
          <text x="30" y="52" fill="#94a3b8" fontSize="11" fontFamily="monospace">
            Regime: {circuits.mode.toUpperCase()} · Topology: {circuits.topology.toUpperCase()} · Power: {circuits.powerOn ? 'ENERGIZED' : 'OFF'}
          </text>

          {/* Main Circuit Loop */}
          {/* Top Rail */}
          <path d="M 120 180 L 220 180" fill="none" stroke="#38bdf8" strokeWidth="3" />
          {/* R1 Zigzag */}
          <path d="M 220 180 L 230 170 L 245 190 L 260 170 L 275 190 L 290 170 L 305 190 L 315 180" fill="none" stroke="#f59e0b" strokeWidth="3.5" />
          <path d="M 315 180 L 380 180" fill="none" stroke="#38bdf8" strokeWidth="3" />

          {/* Series Jumper Switch */}
          <circle cx="380" cy="180" r="5" fill="#38bdf8" />
          <circle cx="430" cy="180" r="5" fill="#38bdf8" />
          <line
            x1="380"
            y1="180"
            x2={jumperClosed ? 430 : 415}
            y2={jumperClosed ? 180 : 155}
            stroke={jumperClosed ? '#10b981' : '#ef4444'}
            strokeWidth="4"
            style={{ cursor: 'pointer' }}
            onClick={onToggleJumper}
          />
          <text x="405" y="150" fill={jumperClosed ? '#10b981' : '#f59e0b'} fontSize="10" fontFamily="monospace" textAnchor="middle">
            {jumperClosed ? 'JUMPER CLOSED' : 'BREAK (OPEN)'}
          </text>

          <path d="M 430 180 L 480 180" fill="none" stroke="#38bdf8" strokeWidth="3" />

          {/* Topology Network: Series / Parallel / Combo */}
          {circuits.topology === 'series' && (
            <>
              {/* R2 */}
              <path d="M 480 180 L 490 170 L 505 190 L 520 170 L 535 190 L 550 170 L 565 190 L 575 180" fill="none" stroke="#f59e0b" strokeWidth="3" />
              <text x="527" y="160" fill="#cbd5e1" fontSize="11" fontFamily="monospace" textAnchor="middle">R2 ({circuits.r2}Ω)</text>
              <path d="M 575 180 L 610 180" fill="none" stroke="#38bdf8" strokeWidth="3" />
              {/* R3 */}
              <path d="M 610 180 L 620 170 L 635 190 L 650 170 L 665 190 L 680 170 L 695 190 L 705 180" fill="none" stroke="#f59e0b" strokeWidth="3" />
              <text x="657" y="160" fill="#cbd5e1" fontSize="11" fontFamily="monospace" textAnchor="middle">R3 ({circuits.r3}Ω)</text>
              <path d="M 705 180 L 740 180 L 740 380 L 120 380" fill="none" stroke="#38bdf8" strokeWidth="3" />
            </>
          )}

          {circuits.topology === 'parallel' && (
            <>
              {/* Parallel Splitter */}
              <path d="M 480 180 L 520 180" fill="none" stroke="#38bdf8" strokeWidth="3" />
              <path d="M 520 130 L 520 230" fill="none" stroke="#38bdf8" strokeWidth="3" />
              {/* Branch R2 */}
              <path d="M 520 130 L 550 130 L 560 120 L 575 140 L 590 120 L 605 140 L 620 120 L 635 140 L 645 130 L 680 130" fill="none" stroke="#f59e0b" strokeWidth="3" />
              <text x="597" y="112" fill="#cbd5e1" fontSize="11" fontFamily="monospace" textAnchor="middle">R2 ({circuits.r2}Ω)</text>
              {/* Branch R3 */}
              <path d="M 520 230 L 550 230 L 560 220 L 575 240 L 590 220 L 605 240 L 620 220 L 635 240 L 645 230 L 680 230" fill="none" stroke="#f59e0b" strokeWidth="3" />
              <text x="597" y="212" fill="#cbd5e1" fontSize="11" fontFamily="monospace" textAnchor="middle">R3 ({circuits.r3}Ω)</text>
              <path d="M 680 130 L 680 230" fill="none" stroke="#38bdf8" strokeWidth="3" />
              <path d="M 680 180 L 740 180 L 740 380 L 120 380" fill="none" stroke="#38bdf8" strokeWidth="3" />
            </>
          )}

          {circuits.topology === 'combo' && (
            <>
              <path d="M 480 180 L 510 180" fill="none" stroke="#38bdf8" strokeWidth="3" />
              <path d="M 510 140 L 510 220" fill="none" stroke="#38bdf8" strokeWidth="3" />
              {/* R2 */}
              <path d="M 510 140 L 530 140 L 540 130 L 555 150 L 570 130 L 585 150 L 595 140 L 630 140" fill="none" stroke="#f59e0b" strokeWidth="2.5" />
              <text x="567" y="122" fill="#cbd5e1" fontSize="10" fontFamily="monospace" textAnchor="middle">R2 ({circuits.r2}Ω)</text>
              {/* R3 */}
              <path d="M 510 220 L 530 220 L 540 210 L 555 230 L 570 210 L 585 230 L 595 220 L 630 220" fill="none" stroke="#f59e0b" strokeWidth="2.5" />
              <text x="567" y="202" fill="#cbd5e1" fontSize="10" fontFamily="monospace" textAnchor="middle">R3 ({circuits.r3}Ω)</text>
              <path d="M 630 140 L 630 220" fill="none" stroke="#38bdf8" strokeWidth="3" />
              <path d="M 630 180 L 740 180 L 740 380 L 120 380" fill="none" stroke="#38bdf8" strokeWidth="3" />
            </>
          )}

          {/* AC Reactive Elements on Bottom Rail if AC */}
          {circuits.mode === 'ac' && (
            <g transform="translate(300, 380)">
              {/* Inductor Arcs */}
              <path d="M 0 0 C 10 -20, 20 -20, 30 0 C 40 -20, 50 -20, 60 0 C 70 -20, 80 -20, 90 0 C 100 -20, 110 -20, 120 0" fill="none" stroke="#a855f7" strokeWidth="3" />
              <text x="60" y="-25" fill="#c084fc" fontSize="10" fontFamily="monospace" textAnchor="middle">L = {circuits.inductance} mH (XL={circuitResult.xl.toFixed(1)}Ω)</text>

              {/* Capacitor Parallel Plates */}
              <path d="M 170 0 L 200 0 M 200 -18 L 200 18 M 212 -18 L 212 18 M 212 0 L 240 0" fill="none" stroke="#38bdf8" strokeWidth="3" />
              <text x="206" y="-25" fill="#38bdf8" fontSize="10" fontFamily="monospace" textAnchor="middle">C = {circuits.capacitance} μF (XC={circuitResult.xc.toFixed(1)}Ω)</text>
            </g>
          )}

          {/* Power Supply Box (Left) */}
          <rect x="50" y="230" width="100" height="100" rx="10" fill="url(#psuGrad)" stroke={circuits.powerOn ? '#34d399' : '#ef4444'} strokeWidth="2.5" />
          <circle cx="100" cy="280" r="28" fill="#0f172a" stroke="#475569" strokeWidth="2" />
          {circuits.mode === 'dc' ? (
            <text x="100" y="286" fill="#f8fafc" fontSize="16" fontFamily="sans-serif" fontWeight="bold" textAnchor="middle">DC</text>
          ) : (
            <path d="M 85 280 Q 92.5 268 100 280 T 115 280" fill="none" stroke="#f8fafc" strokeWidth="3" />
          )}
          <text x="100" y="248" fill={circuits.powerOn ? '#34d399' : '#94a3b8'} fontSize="11" fontFamily="monospace" fontWeight="700" textAnchor="middle">
            {circuits.powerOn ? '⚡ ON' : '⏻ OFF'}
          </text>
          <text x="100" y="322" fill="#38bdf8" fontSize="10" fontFamily="monospace" textAnchor="middle">
            {circuits.vs.toFixed(1)} V
          </text>
          {/* PSU Connection Wires */}
          <path d="M 100 230 L 100 180 L 120 180" fill="none" stroke="#38bdf8" strokeWidth="3" />
          <path d="M 100 330 L 100 380 L 120 380" fill="none" stroke="#38bdf8" strokeWidth="3" />

          {/* Component Labels */}
          <text x="267" y="160" fill="#cbd5e1" fontSize="11" fontFamily="monospace" textAnchor="middle">R1 ({circuits.r1}Ω)</text>

          {/* Fluke 87V Digital Multimeter Representation (Bottom Center) */}
          <g transform="translate(320, 230)">
            {/* Rubber Yellow Holster */}
            <rect x="0" y="0" width="160" height="130" rx="8" fill="#eab308" />
            <rect x="6" y="6" width="148" height="118" rx="6" fill="#0f172a" stroke="#1e293b" strokeWidth="2" />

            {/* LCD Screen */}
            <rect x="16" y="14" width="128" height="42" rx="4" fill="#020617" stroke="#334155" strokeWidth="1.5" />
            <text
              x="80"
              y="42"
              fill={dmmReading.displayString === 'FUSE' || dmmReading.displayString === 'LEAd' ? '#ef4444' : '#38bdf8'}
              fontSize="18"
              fontFamily="monospace"
              fontWeight="bold"
              textAnchor="middle"
            >
              {dmmReading.displayString}
            </text>
            <text x="135" y="52" fill="#94a3b8" fontSize="9" fontFamily="monospace" textAnchor="end">{dmmReading.unit}</text>

            {/* Rotary Dial */}
            <circle cx="80" cy="80" r="16" fill="#1e293b" stroke="#eab308" strokeWidth="2" />
            <line x1="80" y1="80" x2="80" y2="68" stroke="#f8fafc" strokeWidth="2.5" />

            {/* Jack Terminals */}
            <circle cx="35" cy="112" r="5" fill="#020617" stroke="#ef4444" strokeWidth="1.5" />
            <circle cx="65" cy="112" r="5" fill="#020617" stroke="#3b82f6" strokeWidth="1.5" />
            <circle cx="95" cy="112" r="5" fill="#020617" stroke="#94a3b8" strokeWidth="1.5" />
            <circle cx="125" cy="112" r="5" fill="#020617" stroke="#ef4444" strokeWidth="1.5" />
            <text x="80" y="125" fill="#94a3b8" fontSize="8" fontFamily="monospace" textAnchor="middle">FLUKE 87V TRUE-RMS</text>
          </g>

          {/* Live Telemetry Legend */}
          <rect x="30" y="420" width="740" height="60" rx="6" fill="#0f172a" stroke="#334155" strokeWidth="1" />
          <text x="45" y="442" fill="#38bdf8" fontSize="11" fontFamily="monospace">
            I = {circuitResult.current.toFixed(3)} A · P = {circuitResult.realPower.toFixed(2)} W · Req = {circuitResult.req.toFixed(1)} Ω
          </text>
          <text x="45" y="462" fill="#94a3b8" fontSize="10" fontFamily="monospace">
            {circuits.mode === 'ac'
              ? `Z = ${circuitResult.impedance.toFixed(1)} Ω | cos φ = ${circuitResult.powerFactor.toFixed(3)} | φ = ${circuitResult.phaseAngleDeg.toFixed(1)}° | f₀ = ${circuitResult.resonantFreq.toFixed(1)} Hz`
              : 'Ohm\'s Law: V = I × R · Kirchhoff Voltage Law: Vs = V1 + V2 + V3'}
          </text>
        </svg>
      </div>
    );
  }

  if (stationId === 'optics') {
    const isRefraction = optics.subMode === 'refraction';
    const isImaging = optics.subMode === 'imaging';
    const isLaserOn = optics.powerOn !== false;

    return (
      <div className="schematic-viewport" style={{ width: '100%', height: '100%', background: '#070d18', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
        <svg viewBox="0 0 800 500" style={{ width: '100%', height: '100%', maxHeight: '550px' }}>
          <defs>
            <linearGradient id="prismGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#1e293b" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.25" />
            </linearGradient>
            <filter id="laserGlow">
              <feGaussianBlur stdDeviation="3" result="glow" />
              <feMerge>
                <feMergeNode in="glow" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Title Banner */}
          <text x="30" y="35" fill="#38bdf8" fontSize="13" fontFamily="monospace" fontWeight="700" letterSpacing="1">
            2D PRECISION OPTICAL BENCH · STATION 02: {optics.subMode.toUpperCase()}
          </text>
          <text x="30" y="52" fill="#94a3b8" fontSize="11" fontFamily="monospace">
            λ = {optics.wavelength} nm · Laser: {isLaserOn ? 'EMITTING' : 'OFF'} · Cauchy n₂(λ) = {opticsResult.effectiveN2.toFixed(4)}
          </text>

          {/* REFRACTION SUB-MODE */}
          {isRefraction && (
            <g transform="translate(0, 40)">
              {/* Interface dividing air (n1) and dielectric medium (n2) */}
              <rect x="400" y="80" width="360" height="300" fill="url(#prismGrad)" stroke="#38bdf8" strokeWidth="1.5" />
              <text x="350" y="100" fill="#94a3b8" fontSize="12" fontFamily="monospace" textAnchor="end">Medium 1 (n₁={optics.n1.toFixed(2)})</text>
              <text x="450" y="100" fill="#38bdf8" fontSize="12" fontFamily="monospace">Medium 2 (n₂={opticsResult.effectiveN2.toFixed(4)})</text>

              {/* Surface normal line */}
              <line x1="400" y1="60" x2="400" y2="400" stroke="#475569" strokeWidth="1.5" strokeDasharray="5,5" />
              <text x="405" y="75" fill="#64748b" fontSize="10" fontFamily="monospace">Normal</text>

              {/* Laser Diode Source */}
              {(() => {
                const angleRad = (optics.theta1 * Math.PI) / 180;
                const r = 240;
                const sourceX = 400 - r * Math.cos(angleRad);
                const sourceY = 230 - r * Math.sin(angleRad);

                // Refracted ray
                const theta2Rad = ((opticsResult.theta2Deg ?? 0) * Math.PI) / 180;
                const refX = 400 + r * Math.cos(theta2Rad);
                const refY = 230 + r * Math.sin(theta2Rad);

                // Reflected ray
                const reflX = 400 - r * Math.cos(angleRad);
                const reflY = 230 + r * Math.sin(angleRad);

                return (
                  <>
                    {/* Laser Diode Body */}
                    <circle cx={sourceX} cy={sourceY} r="14" fill="#1e293b" stroke={opticsResult.laserHex} strokeWidth="2" />
                    <text x={sourceX - 20} y={sourceY - 18} fill="#cbd5e1" fontSize="10" fontFamily="monospace">
                      Laser ({optics.wavelength}nm)
                    </text>

                    {isLaserOn && (
                      <>
                        {/* Incident Ray */}
                        <line
                          x1={sourceX}
                          y1={sourceY}
                          x2={400}
                          y2={230}
                          stroke={opticsResult.laserHex}
                          strokeWidth="3.5"
                          filter="url(#laserGlow)"
                        />

                        {/* Reflected Ray */}
                        <line
                          x1={400}
                          y1={230}
                          x2={reflX}
                          y2={reflY}
                          stroke={opticsResult.laserHex}
                          strokeWidth={opticsResult.isTIR ? '3.5' : '1.5'}
                          strokeDasharray={opticsResult.isTIR ? 'none' : '4,4'}
                          filter="url(#laserGlow)"
                        />

                        {/* Refracted Ray (if not TIR) */}
                        {!opticsResult.isTIR && (
                          <line
                            x1={400}
                            y1={230}
                            x2={refX}
                            y2={refY}
                            stroke={opticsResult.laserHex}
                            strokeWidth="3.5"
                            filter="url(#laserGlow)"
                          />
                        )}
                      </>
                    )}

                    {/* Angle labels */}
                    <text x="360" y="210" fill="#f8fafc" fontSize="11" fontFamily="monospace">θ₁ = {optics.theta1.toFixed(1)}°</text>
                    <text x="440" y="270" fill={opticsResult.isTIR ? '#ef4444' : '#38bdf8'} fontSize="11" fontFamily="monospace">
                      {opticsResult.isTIR ? 'TIR (Reflected)' : `θ₂ = ${opticsResult.theta2Deg?.toFixed(1)}°`}
                    </text>
                  </>
                );
              })()}
            </g>
          )}

          {/* IMAGING SUB-MODE */}
          {isImaging && (
            <g transform="translate(0, 40)">
              {/* Optical Axis */}
              <line x1="50" y1="230" x2="750" y2="230" stroke="#475569" strokeWidth="1.5" strokeDasharray="6,6" />
              <text x="740" y="222" fill="#64748b" fontSize="10" fontFamily="monospace" textAnchor="end">Optical Axis</text>

              {/* Lens at x = 400 */}
              <line x1="400" y1="100" x2="400" y2="360" stroke="#38bdf8" strokeWidth="4" />
              {/* Converging arrow heads on lens */}
              <path d="M 390 115 L 400 100 L 410 115 M 390 345 L 400 360 L 410 345" fill="none" stroke="#38bdf8" strokeWidth="3" />
              <text x="400" y="85" fill="#38bdf8" fontSize="11" fontFamily="monospace" textAnchor="middle">
                Thin Lens (f = {optics.focalLength} cm)
              </text>

              {/* Focal points F1 and F2 */}
              <circle cx={400 - optics.focalLength * 4} cy="230" r="4" fill="#f59e0b" />
              <text x={400 - optics.focalLength * 4} y="248" fill="#f59e0b" fontSize="10" fontFamily="monospace" textAnchor="middle">F₁</text>
              <circle cx={400 + optics.focalLength * 4} cy="230" r="4" fill="#f59e0b" />
              <text x={400 + optics.focalLength * 4} y="248" fill="#f59e0b" fontSize="10" fontFamily="monospace" textAnchor="middle">F₂</text>

              {/* Object Arrow at x = 400 - do * 4 */}
              {(() => {
                const objX = 400 - optics.objectDistance * 3.5;
                const objHeight = 60;
                const imgDist = opticsResult.imageDistanceCm;

                return (
                  <>
                    <line x1={objX} y1="230" x2={objX} y2={230 - objHeight} stroke="#10b981" strokeWidth="3.5" />
                    <polygon points={`${objX},${230 - objHeight - 6} ${objX - 6},${230 - objHeight + 6} ${objX + 6},${230 - objHeight + 6}`} fill="#10b981" />
                    <text x={objX} y={230 - objHeight - 12} fill="#10b981" fontSize="10" fontFamily="monospace" textAnchor="middle">
                      Object (do={optics.objectDistance}cm)
                    </text>

                    {/* Image Arrow */}
                    {imgDist !== null ? (
                      (() => {
                        const imgX = 400 + imgDist * 3.5;
                        const mag = opticsResult.magnification ?? 1;
                        const imgH = -objHeight * mag;
                        return (
                          <>
                            <line x1={imgX} y1="230" x2={imgX} y2={230 + imgH} stroke="#a855f7" strokeWidth="3" />
                            <polygon points={`${imgX},${230 + imgH + (imgH > 0 ? 6 : -6)} ${imgX - 5},${230 + imgH + (imgH > 0 ? -6 : 6)} ${imgX + 5},${230 + imgH + (imgH > 0 ? -6 : 6)}`} fill="#a855f7" />
                            <text x={imgX} y={230 + imgH + (imgH > 0 ? 18 : -14)} fill="#c084fc" fontSize="10" fontFamily="monospace" textAnchor="middle">
                              Image (di={imgDist.toFixed(1)}cm · {opticsResult.imageType})
                            </text>
                          </>
                        );
                      })()
                    ) : (
                      <text x="560" y="180" fill="#f59e0b" fontSize="12" fontFamily="monospace">
                        Collimated Rays at Infinity (do = f)
                      </text>
                    )}
                  </>
                );
              })()}
            </g>
          )}

          {/* Telemetry Bar */}
          <rect x="30" y="420" width="740" height="60" rx="6" fill="#0f172a" stroke="#334155" strokeWidth="1" />
          <text x="45" y="442" fill="#38bdf8" fontSize="11" fontFamily="monospace">
            {isRefraction
              ? `Snell's Law: n₁ sin θ₁ = n₂ sin θ₂ | θc = ${opticsResult.criticalAngleDeg ? `${opticsResult.criticalAngleDeg.toFixed(1)}°` : 'None'} | Reflectance: ${opticsResult.isTIR ? '100% (TIR)' : 'Fresnel'}`
              : isImaging
              ? `Gaussian Lens Law: 1/f = 1/do + 1/di | M = ${opticsResult.magnification ? `${opticsResult.magnification.toFixed(2)}×` : '∞'} | ${opticsResult.imageType}`
              : `Diffraction: Δy = λ L / d = ${opticsResult.fringeSpacingMm.toFixed(2)} mm`}
          </text>
          <text x="45" y="462" fill="#94a3b8" fontSize="10" fontFamily="monospace">
            Cauchy Dispersion: n₂(λ) = n_base + 4500 × (1/λ² - 1/532²) ⟹ Effective n₂ = {opticsResult.effectiveN2.toFixed(4)}
          </text>
        </svg>
      </div>
    );
  }

  // STATION 03: SPECIAL RELATIVITY
  const isBeamActive = relativity.powerOn !== false;
  return (
    <div className="schematic-viewport" style={{ width: '100%', height: '100%', background: '#070d18', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
      <svg viewBox="0 0 800 500" style={{ width: '100%', height: '100%', maxHeight: '550px' }}>
        <defs>
          <linearGradient id="tunnelGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#1e293b" />
            <stop offset="50%" stopColor="#0f172a" />
            <stop offset="100%" stopColor="#1e293b" />
          </linearGradient>
          <filter id="alphaGlow">
            <feGaussianBlur stdDeviation="4" result="glow" />
            <feMerge>
              <feMergeNode in="glow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Title Banner */}
        <text x="30" y="35" fill="#38bdf8" fontSize="13" fontFamily="monospace" fontWeight="700" letterSpacing="1">
          2D DUAL-FRAME MINKOWSKI ACCELERATOR · STATION 03: SPECIAL RELATIVITY
        </text>
        <text x="30" y="52" fill="#94a3b8" fontSize="11" fontFamily="monospace">
          Particle: {relativity.massPreset === 'alpha' ? 'Alpha Particle (He²⁺)' : relativity.massPreset.toUpperCase()} · v = {(relativity.beta).toFixed(3)}c · γ = {relativityResult.gamma.toFixed(4)}
        </text>

        {/* FRAME S: Laboratory Observer Frame */}
        <g transform="translate(50, 80)">
          <rect x="0" y="0" width="700" height="140" rx="8" fill="#0f172a" stroke="#334155" strokeWidth="1.5" />
          <text x="20" y="25" fill="#38bdf8" fontSize="11" fontFamily="monospace" fontWeight="700">
            FRAME S (LABORATORY REST FRAME)
          </text>

          {/* Rest Tunnel L0 */}
          <rect x="60" y="45" width="480" height="50" rx="4" fill="none" stroke="#475569" strokeWidth="1.5" strokeDasharray="4,4" />
          <text x="300" y="40" fill="#94a3b8" fontSize="10" fontFamily="monospace" textAnchor="middle">
            Rest Tunnel Baseline L₀ = {relativity.properLength.toFixed(1)} m
          </text>

          {/* Contracted Tunnel Length L = L0 / gamma */}
          {(() => {
            const contractedWidth = Math.max(40, 480 / relativityResult.gamma);
            return (
              <>
                <rect x="60" y="45" width={contractedWidth} height="50" rx="4" fill="url(#tunnelGrad)" stroke="#38bdf8" strokeWidth="2.5" />
                <text x={60 + contractedWidth / 2} y="75" fill="#38bdf8" fontSize="11" fontFamily="monospace" fontWeight="bold" textAnchor="middle">
                  Contracted L = {relativityResult.contractedLength.toFixed(2)} m (−{relativityResult.lengthContractionPercent.toFixed(1)}%)
                </text>

                {/* Moving Alpha Particle */}
                {isBeamActive && (
                  <g transform={`translate(${60 + contractedWidth * 0.75}, 70)`} filter="url(#alphaGlow)">
                    <circle cx="0" cy="0" r="10" fill="#f59e0b" stroke="#f8fafc" strokeWidth="2" />
                    <text x="0" y="4" fill="#0f172a" fontSize="9" fontFamily="monospace" fontWeight="bold" textAnchor="middle">He²⁺</text>
                    {/* Velocity vector */}
                    <line x1="12" y1="0" x2="35" y2="0" stroke="#f59e0b" strokeWidth="2.5" />
                    <polygon points="35,-4 42,0 35,4" fill="#f59e0b" />
                  </g>
                )}
              </>
            );
          })()}

          {/* Lab Observer Clock */}
          <g transform="translate(580, 45)">
            <circle cx="35" cy="25" r="24" fill="#1e293b" stroke="#38bdf8" strokeWidth="2" />
            <text x="35" y="28" fill="#38bdf8" fontSize="10" fontFamily="monospace" fontWeight="bold" textAnchor="middle">
              {relativityResult.dilatedTime.toFixed(1)}s
            </text>
            <text x="35" y="60" fill="#94a3b8" fontSize="9" fontFamily="monospace" textAnchor="middle">Lab Time Δt</text>
          </g>
        </g>

        {/* FRAME S': Particle Proper Rest Frame */}
        <g transform="translate(50, 240)">
          <rect x="0" y="0" width="700" height="140" rx="8" fill="#0f172a" stroke="#334155" strokeWidth="1.5" />
          <text x="20" y="25" fill="#10b981" fontSize="11" fontFamily="monospace" fontWeight="700">
            FRAME S&apos; (PARTICLE PROPER REST FRAME)
          </text>

          {/* Proper Light Clock (Photon bouncing between mirrors) */}
          <g transform="translate(140, 35)">
            <rect x="0" y="0" width="80" height="8" rx="2" fill="#94a3b8" />
            <rect x="0" y="60" width="80" height="8" rx="2" fill="#94a3b8" />
            <line x1="40" y1="8" x2="40" y2="60" stroke="#f59e0b" strokeWidth="2" strokeDasharray="3,3" filter="url(#alphaGlow)" />
            <circle cx="40" cy="34" r="5" fill="#f8fafc" />
            <text x="95" y="38" fill="#10b981" fontSize="10" fontFamily="monospace">
              Proper Clock Δt₀ = {relativity.properTime.toFixed(1)} s
            </text>
          </g>

          {/* Rest Mass & Energy Info */}
          <g transform="translate(400, 40)">
            <text x="0" y="15" fill="#cbd5e1" fontSize="11" fontFamily="monospace">
              Rest Mass m₀ = {MASS_PRESETS[relativity.massPreset]?.massKg.toExponential(4)} kg
            </text>
            <text x="0" y="35" fill="#f59e0b" fontSize="11" fontFamily="monospace">
              Rest Energy E₀ = m₀ c² = {relativityResult.restEnergyMeV.toFixed(2)} MeV
            </text>
            <text x="0" y="55" fill="#38bdf8" fontSize="11" fontFamily="monospace">
              Total Energy E = γ m₀ c² = {relativityResult.totalEnergyMeV.toFixed(2)} MeV
            </text>
          </g>
        </g>

        {/* Bottom Relativistic Telemetry */}
        <rect x="30" y="400" width="740" height="80" rx="6" fill="#0f172a" stroke="#334155" strokeWidth="1" />
        <text x="45" y="425" fill="#38bdf8" fontSize="11" fontFamily="monospace">
          Lorentz Factor γ = 1 / √(1 − β²) = {relativityResult.gamma.toFixed(4)} | Speed v = {(relativityResult.speedMps / 1e6).toFixed(2)} × 10⁶ m/s ({((relativityResult.speedMps / 299792458) * 100).toFixed(1)}% c)
        </text>
        <text x="45" y="445" fill="#94a3b8" fontSize="10" fontFamily="monospace">
          Time Dilation: Δt = γ Δt₀ = {relativityResult.dilatedTime.toFixed(2)} s (dilated by {((relativityResult.gamma - 1) * 100).toFixed(1)}%) · Length Contraction: L = L₀ / γ = {relativityResult.contractedLength.toFixed(2)} m
        </text>
        <text x="45" y="465" fill="#cbd5e1" fontSize="10" fontFamily="monospace">
          Relativistic Kinetic Energy K = (γ − 1) m₀ c² = {relativityResult.kineticEnergyMeV.toFixed(2)} MeV | Momentum p = γ m₀ v = {relativityResult.momentumMeV_c.toFixed(2)} MeV/c
        </text>
      </svg>
    </div>
  );
}
