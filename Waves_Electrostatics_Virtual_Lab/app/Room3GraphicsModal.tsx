'use client';

import React, { useState, useEffect } from 'react';
import {
  type GraphicsSettings,
  type GraphicsPreset,
  GRAPHICS_PRESETS,
  DEFAULT_GRAPHICS_SETTINGS,
  detectGpuRenderer,
} from './graphicsSettings';

export type Room3GraphicsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  settings: GraphicsSettings;
  onApply: (newSettings: GraphicsSettings) => void;
  perfStats: { fps: number; frameTimeMs: number };
  playTone?: (freq: number, type: OscillatorType, duration: number, vol: number) => void;
};

export const Room3GraphicsModal: React.FC<Room3GraphicsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onApply,
  perfStats,
  playTone,
}) => {
  const [draft, setDraft] = useState<GraphicsSettings>({ ...settings });
  const [gpuInfo, setGpuInfo] = useState<string>('Detecting GPU...');

  useEffect(() => {
    setDraft({ ...settings });
  }, [settings]);

  useEffect(() => {
    if (isOpen) {
      setGpuInfo(detectGpuRenderer());
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSelectPreset = (preset: Exclude<GraphicsPreset, 'custom'>) => {
    const presetConfig = GRAPHICS_PRESETS[preset];
    setDraft({ ...presetConfig });
    playTone?.(550, 'sine', 0.05, 0.12);
  };

  const handleUpdate = <K extends keyof GraphicsSettings>(key: K, value: GraphicsSettings[K]) => {
    setDraft((prev) => ({
      ...prev,
      [key]: value,
      preset: 'custom', // Switching individual setting switches to custom
    }));
    playTone?.(600, 'sine', 0.04, 0.1);
  };

  const handleApply = () => {
    onApply(draft);
    playTone?.(880, 'sine', 0.08, 0.2);
    onClose();
  };

  const handleReset = () => {
    setDraft({ ...DEFAULT_GRAPHICS_SETTINGS });
    playTone?.(440, 'triangle', 0.08, 0.15);
  };

  return (
    <div className="room3-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="graphics-settings-title">
      <div className="room3-graphics-modal" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="modal-header">
          <div className="header-titles">
            <span className="modal-badge">⚙️ 3D ENGINE PIPELINE</span>
            <h2 id="graphics-settings-title">Graphics & Visual Performance</h2>
            <p>Configure resolution scaling, shadow fidelity, and frame rates for your system.</p>
          </div>
          <button type="button" className="close-btn" onClick={onClose} aria-label="Close graphics settings">
            ✕
          </button>
        </div>

        {/* Live Hardware & Performance Readout Bar */}
        <div className="graphics-hw-card">
          <div className="hw-col">
            <span className="hw-label">DETECTED HARDWARE</span>
            <b className="hw-val" title={gpuInfo}>{gpuInfo}</b>
          </div>
          <div className="hw-col">
            <span className="hw-label">REAL-TIME PERFORMANCE</span>
            <div className="perf-pills">
              <span className={`perf-badge ${perfStats.fps >= 50 ? 'good' : perfStats.fps >= 30 ? 'warn' : 'bad'}`}>
                ● {perfStats.fps} FPS
              </span>
              <span className="perf-time">{perfStats.frameTimeMs} ms</span>
            </div>
          </div>
          <div className="hw-col">
            <span className="hw-label">DISPLAY PIXELS</span>
            <span className="hw-sub">
              {typeof window !== 'undefined' ? `${window.screen.width} × ${window.screen.height}` : '1920 × 1080'}
              {' '}(DPR {typeof window !== 'undefined' ? window.devicePixelRatio : 1}x)
            </span>
          </div>
        </div>

        {/* Preset Selector */}
        <div className="graphics-section">
          <label className="section-label">QUICK QUALITY PRESET</label>
          <div className="preset-row">
            {(['low', 'medium', 'high', 'ultra'] as const).map((presetKey) => {
              const active = draft.preset === presetKey;
              const labels = {
                low: { name: 'Low', desc: 'Battery / Chromebook' },
                medium: { name: 'Medium', desc: 'Balanced Performance' },
                high: { name: 'High', desc: 'Full Fidelity (Recommended)' },
                ultra: { name: 'Ultra', desc: 'Max 2.0x Retina Fidelity' },
              };
              return (
                <button
                  key={presetKey}
                  type="button"
                  className={`preset-btn ${active ? 'active' : ''}`}
                  onClick={() => handleSelectPreset(presetKey)}
                >
                  <span className="preset-name">{labels[presetKey].name}</span>
                  <small className="preset-desc">{labels[presetKey].desc}</small>
                </button>
              );
            })}
          </div>
        </div>

        {/* Granular Setting Controls */}
        <div className="graphics-grid">
          {/* 1. Resolution / Render Scale */}
          <div className="setting-card">
            <div className="setting-header">
              <span className="setting-title">Internal Render Scale</span>
              <span className="setting-current">{draft.resolutionScale}x</span>
            </div>
            <p className="setting-explainer">Controls internal WebGL pixel density. Lower values drastically speed up integrated graphics.</p>
            <div className="option-chips">
              {[
                { val: 0.75, label: '0.75x' },
                { val: 1.0, label: '1.0x' },
                { val: 1.25, label: '1.25x' },
                { val: 1.5, label: '1.5x' },
                { val: 2.0, label: '2.0x (Retina)' },
              ].map(({ val, label }) => (
                <button
                  key={val}
                  type="button"
                  className={`chip-btn ${draft.resolutionScale === val ? 'active' : ''}`}
                  onClick={() => handleUpdate('resolutionScale', val)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* 2. Shadows Quality */}
          <div className="setting-card">
            <div className="setting-header">
              <span className="setting-title">Dynamic Shadows</span>
              <span className="setting-current">{draft.shadows.toUpperCase()}</span>
            </div>
            <p className="setting-explainer">Quality of real-time shadows cast by sun and ceiling lights onto workbenches.</p>
            <div className="option-chips">
              {[
                { val: 'off', label: 'Off (Max FPS)' },
                { val: 'low', label: 'Low (512px)' },
                { val: 'medium', label: 'Medium (1024px)' },
                { val: 'high', label: 'High (Soft 2048px)' },
              ].map(({ val, label }) => (
                <button
                  key={val}
                  type="button"
                  className={`chip-btn ${draft.shadows === val ? 'active' : ''}`}
                  onClick={() => handleUpdate('shadows', val as GraphicsSettings['shadows'])}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* 3. Lighting & Sconces Quality */}
          <div className="setting-card">
            <div className="setting-header">
              <span className="setting-title">Architectural Lighting</span>
              <span className="setting-current">{draft.lightingQuality.toUpperCase()}</span>
            </div>
            <p className="setting-explainer">Controls secondary brass sconces and workbench accent spotlights.</p>
            <div className="option-chips">
              {[
                { val: 'simple', label: 'Simple (Ambient Only)' },
                { val: 'medium', label: 'Medium (Key Lights)' },
                { val: 'full', label: 'Full (All Accents)' },
              ].map(({ val, label }) => (
                <button
                  key={val}
                  type="button"
                  className={`chip-btn ${draft.lightingQuality === val ? 'active' : ''}`}
                  onClick={() => handleUpdate('lightingQuality', val as GraphicsSettings['lightingQuality'])}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* 4. Target Frame Rate Limit */}
          <div className="setting-card">
            <div className="setting-header">
              <span className="setting-title">Frame Rate Target</span>
              <span className="setting-current">{draft.frameRateLimit === 0 ? 'UNCAPPED' : `${draft.frameRateLimit} FPS`}</span>
            </div>
            <p className="setting-explainer">Limits render rate to preserve laptop battery life and prevent overheating.</p>
            <div className="option-chips">
              {[
                { val: 30, label: '30 FPS (Battery)' },
                { val: 60, label: '60 FPS (Standard)' },
                { val: 0, label: 'Uncapped (Max Hz)' },
              ].map(({ val, label }) => (
                <button
                  key={val}
                  type="button"
                  className={`chip-btn ${draft.frameRateLimit === val ? 'active' : ''}`}
                  onClick={() => handleUpdate('frameRateLimit', val)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Toggles Row */}
        <div className="toggles-row">
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={draft.showFpsCounter}
              onChange={(e) => handleUpdate('showFpsCounter', e.target.checked)}
            />
            <span className="toggle-custom" />
            <div>
              <b>Live FPS & Performance Counter</b>
              <small>Display real-time frame rate badge in top-right HUD</small>
            </div>
          </label>

          <label className="toggle-label">
            <input
              type="checkbox"
              checked={draft.bloomAndAtmosphere}
              onChange={(e) => handleUpdate('bloomAndAtmosphere', e.target.checked)}
            />
            <span className="toggle-custom" />
            <div>
              <b>Celestial Observatory Atmosphere</b>
              <small>Enable twinkling night-sky stars through observatory windows</small>
            </div>
          </label>
        </div>

        {/* Modal Actions Footer */}
        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={handleReset}>
            🔄 Reset to Defaults
          </button>
          <div className="footer-right">
            <button type="button" className="btn-cancel" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={handleApply}>
              ✓ Apply & Save Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
