'use client';

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  ASTRONOMY_ACTIVITIES,
  CONSTELLATIONS,
  SPACE_MISSIONS,
  TOTAL_EXPLORATION_STATIONS,
  loadExplorationState,
  saveExplorationState,
  saveSurveyResponses,
  INITIAL_SURVEY_RESPONSES,
  type AstroActivityId,
  type Constellation,
  type ExplorationState,
  type SpaceMission,
  type SurveyResponses,
  type SurveyScaleAnswer,
} from './astroModel';
import { createAstroScene, type AstroInteraction, type AstroSceneApi } from './astroScene';
import { type CharacterType } from './characterController';

export default function AstroExperience() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneApi = useRef<AstroSceneApi | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const joystickPointerId = useRef<number | null>(null);

  // Exploration & Modal State
  const [exploration, setExploration] = useState<ExplorationState>({ visitedStations: [], surveySubmitted: false });
  const [activeModal, setActiveModal] = useState<AstroActivityId | 'door' | 'guide' | null>(null);
  const [interaction, setInteraction] = useState<AstroInteraction | null>(null);
  const [pointerLocked, setPointerLocked] = useState(false);
  const [isThirdPerson, setIsThirdPerson] = useState(true);
  const [activeCharacter, setActiveCharacter] = useState<CharacterType>('female');
  const [toastMessage, setToastMessage] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [soundVolume, setSoundVolume] = useState(0.65);
  const [joystickKnob, setJoystickKnob] = useState({ x: 0, y: 0 });

  // External Overlays
  const [externalOverlay, setExternalOverlay] = useState<'nasa' | 'stellarium' | null>(null);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [iframeError, setIframeError] = useState(false);

  // Sub-station selections
  const [selectedConstellation, setSelectedConstellation] = useState<Constellation>(CONSTELLATIONS[0]);
  const [selectedActivityIndex, setSelectedActivityIndex] = useState(0);
  const [selectedMission, setSelectedMission] = useState<SpaceMission>(SPACE_MISSIONS[0]);

  // Survey State
  const [surveyData, setSurveyData] = useState<SurveyResponses>(INITIAL_SURVEY_RESPONSES);
  const [surveyStep, setSurveyStep] = useState<'questions' | 'contact' | 'completed'>('questions');

  // Load exploration state from localStorage on mount
  useEffect(() => {
    const saved = loadExplorationState();
    setExploration(saved);
  }, []);

  const markStationExplored = (id: string) => {
    if (id === 'door' || id === 'guide') return;
    setExploration((prev) => {
      if (prev.visitedStations.includes(id)) return prev;
      const updated = { ...prev, visitedStations: [...prev.visitedStations, id] };
      saveExplorationState(updated);
      showToast(`✨ Discovery Unlocked: ${id.replace('_', ' ').toUpperCase()} (${updated.visitedStations.length}/${TOTAL_EXPLORATION_STATIONS})`);
      return updated;
    });
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 4500);
  };

  // Audio synthesis helpers
  function ensureAudioContext() {
    if (typeof window === 'undefined') return;
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    if (!audioContext.current) audioContext.current = new AudioCtx();
    if (audioContext.current.state === 'suspended') void audioContext.current.resume();
    return audioContext.current;
  }

  function playTone(freq: number, duration: number, vol = 0.05, type: OscillatorType = 'sine') {
    if (!soundEnabled) return;
    const ctx = ensureAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(vol * soundVolume, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration + 0.02);
  }

  function playCelestialChime() {
    playTone(523.25, 0.4, 0.04); // C5
    setTimeout(() => playTone(659.25, 0.45, 0.045), 90); // E5
    setTimeout(() => playTone(783.99, 0.6, 0.05), 180); // G5
    setTimeout(() => playTone(1046.50, 0.8, 0.04), 270); // C6
  }

  function playFootstep() {
    if (!soundEnabled) return;
    const ctx = ensureAudioContext();
    if (!ctx) return;
    const duration = 0.08;
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    filter.type = 'lowpass';
    filter.frequency.value = 260;
    gain.gain.value = 0.06 * soundVolume;
    src.buffer = buffer;
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start();
  }

  // Initialize 3D Scene
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    sceneApi.current = createAstroScene(container, {
      onInteractionChange: (next) => setInteraction(next),
      onActivityInteract: (activityId) => {
        if (activityId === 'door') {
          sceneApi.current?.openDoor(() => window.location.assign('/'));
          showToast('Returning to Campus Corridor...');
          return;
        }
        playCelestialChime();
        markStationExplored(activityId);
        setActiveModal(activityId);
      },
      onFootstep: playFootstep,
      onPointerLockChange: setPointerLocked,
    });

    const unlockAudio = () => ensureAudioContext();
    ['click', 'keydown', 'touchstart'].forEach((e) => window.addEventListener(e, unlockAudio, { once: true }));

    return () => {
      sceneApi.current?.dispose();
      sceneApi.current = null;
      if (audioContext.current && audioContext.current.state !== 'closed') {
        void audioContext.current.close();
      }
      audioContext.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard shortcut for opening stations or toggles
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && el.matches('input, textarea, select, button')) return;
      if (e.key.toLowerCase() === 'v') {
        const next = sceneApi.current?.toggleView();
        if (typeof next === 'boolean') setIsThirdPerson(next);
      }
      if (e.key.toLowerCase() === 'c') {
        const next = sceneApi.current?.switchCharacter();
        if (next) {
          setActiveCharacter(next);
          showToast(`Character changed to: ${next === 'female' ? 'Female (Carla)' : 'Male (Eric)'}`);
        }
      }
      if (e.key === 'Escape') {
        setActiveModal(null);
        setExternalOverlay(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Mobile joystick handlers
  const moveJoystick = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (joystickPointerId.current !== event.pointerId) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const maxR = Math.min(bounds.width, bounds.height) * 0.32;
    const rawX = event.clientX - (bounds.left + bounds.width / 2);
    const rawY = event.clientY - (bounds.top + bounds.height / 2);
    const dist = Math.hypot(rawX, rawY);
    const scale = dist > maxR ? maxR / dist : 1;
    const x = rawX * scale;
    const y = rawY * scale;
    const normX = Math.abs(x / maxR) < 0.12 ? 0 : x / maxR;
    const normForward = Math.abs(y / maxR) < 0.12 ? 0 : -y / maxR;
    setJoystickKnob({ x, y });
    sceneApi.current?.setMoveVector(normX, normForward);
  };

  const startJoystick = (event: ReactPointerEvent<HTMLDivElement>) => {
    joystickPointerId.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    moveJoystick(event);
  };

  const releaseJoystick = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (joystickPointerId.current !== event.pointerId) return;
    joystickPointerId.current = null;
    sceneApi.current?.setMoveVector(0, 0);
    setJoystickKnob({ x: 0, y: 0 });
  };

  const openStationModal = (activityId: AstroActivityId) => {
    if (document.pointerLockElement) document.exitPointerLock();
    markStationExplored(activityId);
    setActiveModal(activityId);
  };

  const launchNasaEyesOverlay = () => {
    setIframeLoaded(false);
    setIframeError(false);
    setExternalOverlay('nasa');
  };

  const launchStellariumOverlay = () => {
    setIframeLoaded(false);
    setIframeError(false);
    setExternalOverlay('stellarium');
  };

  const submitSurvey = (includeContact: boolean) => {
    const finalResponses: SurveyResponses = {
      ...surveyData,
      contactOption: includeContact ? 'yes' : 'no',
      contactName: includeContact ? surveyData.contactName : '',
      contactEmail: includeContact ? surveyData.contactEmail : '',
      contactProgramYear: includeContact ? surveyData.contactProgramYear : '',
    };
    saveSurveyResponses(finalResponses);
    setExploration((prev) => {
      const next = { ...prev, surveySubmitted: true };
      saveExplorationState(next);
      return next;
    });
    setSurveyStep('completed');
  };

  return (
    <main className="astro-shell">
      {/* 3D Scene Viewport */}
      <div ref={containerRef} className="astro-canvas-container" aria-label="Room 04 Astronomical Society 3D Virtual Environment" />
      <div className="astro-vignette" aria-hidden="true" />

      {/* Reticle for Pointer-Lock Walking */}
      {!activeModal && !externalOverlay && (
        <div className={`astro-reticle ${interaction ? 'active' : ''}`} aria-hidden="true">
          <span />
          <span />
          {interaction && (
            <div className="astro-reticle-tooltip">
              <kbd>E</kbd>
              <span>{interaction.action}</span>
            </div>
          )}
        </div>
      )}

      {/* Enter Walk Mode Prompt */}
      {!pointerLocked && !activeModal && !externalOverlay && (
        <button className="astro-enter-walk" onClick={() => sceneApi.current?.requestPointerLock()}>
          <b>ENTER WALK MODE</b>
          <span>Click to look and explore · WASD move · ESC release</span>
        </button>
      )}

      {/* Proximity Interaction HUD Card */}
      {interaction && !activeModal && !externalOverlay && (
        <aside className="astro-inspector-card" aria-live="polite">
          <div className="astro-inspector-badge">
            <span>{interaction.category}</span>
            <small>ROOM 04 EXHIBIT</small>
          </div>
          <h3>{interaction.name}</h3>
          <p>{interaction.description}</p>
          <div className="astro-action-prompt">
            <kbd>E</kbd>
            <span>{interaction.action}</span>
          </div>
        </aside>
      )}

      {/* Toast Notification */}
      {toastMessage && <div className="astro-toast" role="status">{toastMessage}</div>}

      {/* Room 04 Top Navigation Bar */}
      <header className="astro-topbar">
        <a
          href="/"
          className="astro-brand-lockup"
          onClick={(e) => {
            e.preventDefault();
            sceneApi.current?.openDoor(() => window.location.assign('/'));
          }}
          title="Return to University Corridor"
        >
          <span className="astro-brand-glyph">✦</span>
          <div>
            <strong>UPHSD Astronomical Society</strong>
            <small>Room 04 · Proposed Student Organization in Development</small>
          </div>
        </a>

        {/* Exploration Milestone Pill */}
        <div className="astro-milestone-pill" title="Exploration Milestones (Non-Graded Extracurricular Discovery)">
          <span>🔭 DISCOVERIES:</span>
          <b>{exploration.visitedStations.length} / {TOTAL_EXPLORATION_STATIONS} EXPLORED</b>
        </div>

        {/* Quick Station Navigation Menu */}
        <nav className="astro-station-dock" aria-label="Room 04 Stations">
          <button onClick={() => { openStationModal('solar_system'); sceneApi.current?.teleportTo('solar_system'); }}>
            🪐 Solar System
          </button>
          <button onClick={() => { openStationModal('virtual_observatory'); sceneApi.current?.teleportTo('virtual_observatory'); }}>
            🔭 Observatory
          </button>
          <button onClick={() => { openStationModal('constellations'); sceneApi.current?.teleportTo('constellations'); }}>
            ⭐ Constellations
          </button>
          <button onClick={() => { openStationModal('activities'); sceneApi.current?.teleportTo('activities'); }}>
            📋 10 Activities
          </button>
          <button onClick={() => { openStationModal('astrophotography'); sceneApi.current?.teleportTo('astrophotography'); }}>
            📷 Astrophoto
          </button>
          <button onClick={() => { openStationModal('research'); sceneApi.current?.teleportTo('research'); }}>
            💻 Research
          </button>
          <button onClick={() => { openStationModal('space_missions'); sceneApi.current?.teleportTo('space_missions'); }}>
            🚀 Missions
          </button>
          <button className="survey-btn-pill" onClick={() => { openStationModal('membership_survey'); sceneApi.current?.teleportTo('membership_survey'); }}>
            ✍️ Join / Survey
          </button>
        </nav>
      </header>

      {/* Bottom Status Dock */}
      <footer className="astro-bottom-dock">
        <div className="astro-dock-status">
          <i />
          <span>ROOM 04 ONLINE · WALK WITH WASD · KEYS 1–8 TELEPORT</span>
        </div>
        <div className="astro-dock-controls">
          <button
            type="button"
            className="astro-ctrl-btn"
            onClick={() => {
              const next = sceneApi.current?.toggleView();
              if (typeof next === 'boolean') setIsThirdPerson(next);
            }}
          >
            📷 {isThirdPerson ? '3rd Person' : '1st Person'} (V)
          </button>
          <button
            type="button"
            className="astro-ctrl-btn"
            onClick={() => {
              const next = sceneApi.current?.switchCharacter();
              if (next) setActiveCharacter(next);
            }}
          >
            👤 {activeCharacter === 'female' ? 'Female (Carla)' : 'Male (Eric)'} (C)
          </button>
          <button
            type="button"
            className="astro-ctrl-btn"
            onClick={() => setSoundEnabled((v) => !v)}
          >
            {soundEnabled ? '🔊 Sound' : '🔇 Muted'}
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={soundVolume}
            onChange={(e) => setSoundVolume(Number(e.target.value))}
            aria-label="Sound Volume"
          />
        </div>
      </footer>

      {/* Mobile Touch Joystick */}
      {!activeModal && !externalOverlay && (
        <div className="astro-mobile-controls">
          <div
            className="astro-mobile-joystick"
            onPointerDown={startJoystick}
            onPointerMove={moveJoystick}
            onPointerUp={releaseJoystick}
            onPointerCancel={releaseJoystick}
          >
            <span className="knob" style={{ transform: `translate(${joystickKnob.x}px, ${joystickKnob.y}px)` }} />
            <small>WALK</small>
          </div>
          <button
            className={`astro-mobile-action ${interaction ? 'ready' : ''}`}
            onClick={() => sceneApi.current?.interact()}
            disabled={!interaction}
          >
            {interaction ? 'INTERACT [E]' : 'LOOK AT EXHIBIT'}
          </button>
        </div>
      )}

      {/* ============================================================== */}
      {/* STATION 2: SOLAR SYSTEM BRIEFING MODAL */}
      {/* ============================================================== */}
      {activeModal === 'solar_system' && (
        <div className="astro-modal-backdrop" onClick={() => setActiveModal(null)}>
          <div className="astro-modal-card" onClick={(e) => e.stopPropagation()}>
            <header className="astro-modal-header">
              <span className="astro-modal-kicker">EDUCATIONAL CELESTIAL MODEL</span>
              <h2>Interactive Solar System Explorer</h2>
              <button className="astro-modal-close" onClick={() => setActiveModal(null)}>✕</button>
            </header>
            <div className="astro-modal-body">
              <p className="astro-modal-lead">
                Explore the planetary architecture of our Solar System — from the scorched plains of Mercury out to the icy winds of Neptune.
              </p>
              <div className="astro-notice-box">
                <b>⚠️ Educational Visualization Notice:</b>
                <span>The physical model on the central table is an educational demonstration. Planetary sphere diameters and orbital radii are exaggerated for visibility, not to literal astronomical scale.</span>
              </div>
              <div className="astro-action-card">
                <div className="astro-action-info">
                  <h3>Explore NASA Eyes on the Solar System</h3>
                  <p>Journey through the Solar System in real time using NASA’s official 3D visualization platform. Track planets, asteroids, and robotic spacecraft missions.</p>
                  <small className="attribution-tag">Interactive resource: NASA Eyes (Official Public Educational Application)</small>
                </div>
                <div className="astro-btn-group">
                  <button className="btn-astro-primary" onClick={launchNasaEyesOverlay}>
                    🪐 Explore NASA Eyes in Virtual Overlay
                  </button>
                  <a
                    href="https://eyes.nasa.gov/apps/solar-system/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-astro-secondary"
                  >
                    ↗ Open NASA Eyes in New Tab
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* STATION 3: VIRTUAL OBSERVATORY MODAL */}
      {/* ============================================================== */}
      {activeModal === 'virtual_observatory' && (
        <div className="astro-modal-backdrop" onClick={() => setActiveModal(null)}>
          <div className="astro-modal-card" onClick={(e) => e.stopPropagation()}>
            <header className="astro-modal-header">
              <span className="astro-modal-kicker">ASTRONOMICAL OBSERVATION PLATFORM</span>
              <h2>Virtual Observatory: Night Sky Exploration</h2>
              <button className="astro-modal-close" onClick={() => setActiveModal(null)}>✕</button>
            </header>
            <div className="astro-modal-body">
              <p className="astro-modal-lead">
                Look out through the curved observatory windows and discover the cosmos with the society’s digital planetarium.
              </p>
              <div className="astro-briefing-grid">
                <div>
                  <h4>⭐ Constellations & Stars</h4>
                  <p>Identify celestial lines, seasonal asterisms, and Bayer-designated bright stars across both celestial hemispheres.</p>
                </div>
                <div>
                  <h4>🪐 Planetary Tracking</h4>
                  <p>Follow the ecliptic plane to observe Venus, Mars, Jupiter, and Saturn in real-time alignment against background stars.</p>
                </div>
                <div>
                  <h4>🌌 Deep-Sky Objects</h4>
                  <p>Locate star clusters, gaseous emission nebulae, and neighboring galaxies using the Messier and NGC catalogs.</p>
                </div>
                <div>
                  <h4>🔭 Naked-Eye vs. Telescopic</h4>
                  <p>Learn how aperture, focal length, and optical coatings resolve faint details that human retinas cannot detect.</p>
                </div>
              </div>

              <div className="astro-action-card">
                <div className="astro-action-info">
                  <h3>Stellarium Web Planetarium</h3>
                  <p>Launch the world-standard interactive open-source sky map to simulate the exact night sky for any location, date, and hour.</p>
                  <small className="attribution-tag">Interactive resource: Stellarium Web (Free Public Planetarium Service)</small>
                </div>
                <div className="astro-btn-group">
                  <button className="btn-astro-primary" onClick={launchStellariumOverlay}>
                    🔭 Launch Stellarium Web Overlay
                  </button>
                  <a
                    href="https://stellarium-web.org/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-astro-secondary"
                  >
                    ↗ Open Stellarium Web in New Tab
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* STATION 1: SOCIETY INFORMATION MODAL */}
      {/* ============================================================== */}
      {activeModal === 'society_information' && (
        <div className="astro-modal-backdrop" onClick={() => setActiveModal(null)}>
          <div className="astro-modal-card" onClick={(e) => e.stopPropagation()}>
            <header className="astro-modal-header">
              <span className="astro-modal-kicker">STUDENT ORGANIZATION OVERVIEW</span>
              <h2>UPHSD Astronomical Society</h2>
              <button className="astro-modal-close" onClick={() => setActiveModal(null)}>✕</button>
            </header>
            <div className="astro-modal-body">
              <div className="astro-status-badge">
                <span>STATUS: Proposed Student Organization · In Development</span>
              </div>
              <p className="astro-modal-lead">
                The UPHSD Astronomical Society is a proposed student-led academic and extracurricular organization dedicated to observational astronomy, astrophysics discussions, and hands-on space science exploration.
              </p>

              <div className="astro-pillars-grid">
                <div className="pillar-card">
                  <h3>🎯 Our Mission</h3>
                  <p>To foster curiosity, scientific literacy, and camaraderie among students through observational astronomy, astrophysics colloquia, and community stargazing.</p>
                </div>
                <div className="pillar-card">
                  <h3>🔭 Our Vision</h3>
                  <p>A thriving university campus where every student has the opportunity to look through a telescope, discover cosmic wonders, and engage with space science.</p>
                </div>
                <div className="pillar-card">
                  <h3>👥 Who Can Join?</h3>
                  <p>Open to <strong>all students across all programs and year levels</strong>. Zero prior physics, math, or telescopic experience is required — only genuine curiosity!</p>
                </div>
                <div className="pillar-card">
                  <h3>🤝 Possible Roles</h3>
                  <p>Telescope Operators · Astrophotographers · Research & Citizen Science · Event Planners · Science Writers · Social Media & Graphics Designers.</p>
                </div>
              </div>

              <div className="astro-disclaimer-card">
                <b>Institutional & Partner Transparency:</b>
                <p>
                  This organization is currently in proposal and developmental stages. Exploration of this room or participation in the survey does not create legal club membership or institutional dues. External astronomy resources (NASA, Stellarium) are educational tools and do not imply endorsement or partnership.
                </p>
              </div>

              <div className="astro-btn-center">
                <button className="btn-astro-primary" onClick={() => setActiveModal('membership_survey')}>
                  ✍️ Express Interest in the Membership Survey
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* STATION 4: 10 ACTIVITIES BOARD MODAL */}
      {/* ============================================================== */}
      {activeModal === 'activities' && (
        <div className="astro-modal-backdrop" onClick={() => setActiveModal(null)}>
          <div className="astro-modal-card wide-card" onClick={(e) => e.stopPropagation()}>
            <header className="astro-modal-header">
              <span className="astro-modal-kicker">WHAT CAN CLUB MEMBERS DO?</span>
              <h2>Proposed Astronomy Society Activities (10 Programs)</h2>
              <button className="astro-modal-close" onClick={() => setActiveModal(null)}>✕</button>
            </header>
            <div className="astro-modal-body">
              <div className="activities-layout">
                {/* Left activity list rail */}
                <div className="activities-rail">
                  {ASTRONOMY_ACTIVITIES.map((act, index) => (
                    <button
                      key={act.id}
                      className={`act-rail-btn ${selectedActivityIndex === index ? 'active' : ''}`}
                      onClick={() => setSelectedActivityIndex(index)}
                    >
                      <span className="act-num">{act.number}</span>
                      <div className="act-rail-info">
                        <b>{act.title}</b>
                        <small>{act.subtitle}</small>
                      </div>
                    </button>
                  ))}
                </div>

                {/* Right detailed preview */}
                {(() => {
                  const act = ASTRONOMY_ACTIVITIES[selectedActivityIndex];
                  return (
                    <div className="activity-detail-card">
                      <div className="act-detail-header">
                        <span className="act-badge">ACTIVITY #{act.number}</span>
                        <h3>{act.title}</h3>
                        <p className="act-tagline">{act.tagline}</p>
                      </div>
                      <p className="act-desc">{act.description}</p>
                      
                      <div className="act-section">
                        <h4>What Members Do:</h4>
                        <ul>
                          {act.whatMembersDo.map((item, i) => (
                            <li key={i}>{item}</li>
                          ))}
                        </ul>
                      </div>

                      <div className="act-meta-row">
                        <div>
                          <b>Equipment & Tools:</b>
                          <span>{act.equipmentUsed.join(' · ')}</span>
                        </div>
                        <div>
                          <b>Recommended For:</b>
                          <span className="highlight-tag">{act.recommendedFor}</span>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* STATION 5: ASTROPHOTOGRAPHY STATION MODAL */}
      {/* ============================================================== */}
      {activeModal === 'astrophotography' && (
        <div className="astro-modal-backdrop" onClick={() => setActiveModal(null)}>
          <div className="astro-modal-card" onClick={(e) => e.stopPropagation()}>
            <header className="astro-modal-header">
              <span className="astro-modal-kicker">PRACTICAL ASTROPHOTOGRAPHY WORKSTATION</span>
              <h2>Astrophotography & Image Stacking</h2>
              <button className="astro-modal-close" onClick={() => setActiveModal(null)}>✕</button>
            </header>
            <div className="astro-modal-body">
              <p className="astro-modal-lead">
                Learn how cameras collect photons across minutes and hours to reveal colors, hydrogen clouds, and spiral arms that human vision cannot see in real time.
              </p>

              <div className="astrophoto-guide-grid">
                <div className="photo-card">
                  <h4>🌙 Lunar & Planetary Imaging</h4>
                  <p>High-frame-rate video capture (lucky imaging) through a telescope eyepiece to overcome atmospheric turbulence, stacking the sharpest 10% of frames.</p>
                </div>
                <div className="photo-card">
                  <h4>🌌 Wide-Field Milky Way</h4>
                  <p>Using standard DSLR lenses (14–24mm, f/2.8) at ISO 3200 for 15–25 seconds to capture the brilliant core of the Milky Way over landscape foregrounds.</p>
                </div>
                <div className="photo-card">
                  <h4>🔭 Deep-Sky Stacking (Siril / DSS)</h4>
                  <p>Combining multiple sub-exposures with Light, Dark, Flat, and Bias calibration frames to eliminate sensor thermal noise and vignetting.</p>
                </div>
                <div className="photo-card">
                  <h4>⚡ Tracking Mounts</h4>
                  <p>Motorized equatorial trackers counter the Earth’s 24-hour rotation, enabling multi-minute exposures without star trails.</p>
                </div>
              </div>

              <div className="astro-notice-box">
                <b>Camera Equipment Showcase:</b>
                <span>The workstation features a telephoto zoom prime lens on a micro-tripod coupled to an image processing terminal demonstrating post-calibration curves.</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* STATION 6: RESEARCH DESK MODAL */}
      {/* ============================================================== */}
      {activeModal === 'research' && (
        <div className="astro-modal-backdrop" onClick={() => setActiveModal(null)}>
          <div className="astro-modal-card" onClick={(e) => e.stopPropagation()}>
            <header className="astro-modal-header">
              <span className="astro-modal-kicker">STUDENT SCIENCE FRONTIERS</span>
              <h2>Astronomy Research & Citizen Science</h2>
              <button className="astro-modal-close" onClick={() => setActiveModal(null)}>✕</button>
            </header>
            <div className="astro-modal-body">
              <div className="research-pillars-banner">
                <span>OBSERVE</span> · <span>ANALYZE</span> · <span>DOCUMENT</span> · <span>SHARE</span>
              </div>
              <p className="astro-modal-lead">
                Proposed student science projects showcasing how university club members can participate in real data collection and international citizen science.
              </p>

              <div className="research-topics-list">
                <div className="research-item">
                  <h4>💡 Light Pollution & Bortle Scale Mapping</h4>
                  <p>Using handheld Sky Quality Meters (SQM) to measure artificial sky glow across campus and municipal regions, advocating for dark-sky friendly lighting policies.</p>
                </div>
                <div className="research-item">
                  <h4>📈 Variable Star Photometry</h4>
                  <p>Monitoring pulsating Cepheid or eclipsing binary stars over weeks to plot brightness changes and light curves in collaboration with international observer networks like AAVSO.</p>
                </div>
                <div className="research-item">
                  <h4>☄️ Visual & Radio Meteor Counting</h4>
                  <p>Timing hourly meteor rates during peak Perseids and Geminids to calculate the spatial density of cometary debris streams.</p>
                </div>
                <div className="research-item">
                  <h4>🌐 Citizen Science Discovery</h4>
                  <p>Participating in Zooniverse projects like Planet Hunters (TESS exoplanet transits) and Galaxy Zoo (spiral vs elliptical galaxy morphology classification).</p>
                </div>
              </div>
              <small className="muted-notice">*Proposed student research programs; clearly designated as sample initiatives in development.</small>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* STATION 7: CONSTELLATIONS EXPLORER MODAL */}
      {/* ============================================================== */}
      {activeModal === 'constellations' && (
        <div className="astro-modal-backdrop" onClick={() => setActiveModal(null)}>
          <div className="astro-modal-card wide-card" onClick={(e) => e.stopPropagation()}>
            <header className="astro-modal-header">
              <span className="astro-modal-kicker">CELESTIAL CARTOGRAPHY WALL</span>
              <h2>Constellation Explorer (6 Major Constellations)</h2>
              <button className="astro-modal-close" onClick={() => setActiveModal(null)}>✕</button>
            </header>
            <div className="astro-modal-body">
              <div className="constellation-selector-row">
                {CONSTELLATIONS.map((c) => (
                  <button
                    key={c.id}
                    className={`constellation-tab-btn ${selectedConstellation.id === c.id ? 'active' : ''}`}
                    onClick={() => setSelectedConstellation(c)}
                  >
                    <b>{c.name}</b>
                    <small>{c.englishName}</small>
                  </button>
                ))}
              </div>

              <div className="constellation-detail-card">
                <div className="const-header">
                  <div>
                    <h3>{selectedConstellation.name} ({selectedConstellation.englishName})</h3>
                    <span className="pronunciation">Pronunciation: /{selectedConstellation.pronunciation}/</span>
                  </div>
                  <div className="const-coords">
                    <span>RA: {selectedConstellation.coordinates.ra}</span>
                    <span>Dec: {selectedConstellation.coordinates.dec}</span>
                    <span className="season-badge">{selectedConstellation.bestSeason}</span>
                  </div>
                </div>

                <div className="const-section">
                  <h4>Notable & Brightest Stars:</h4>
                  <div className="stars-grid">
                    {selectedConstellation.brightestStars.map((star, i) => (
                      <div key={i} className="star-card">
                        <b>{star.name}</b>
                        <small>{star.designation} · Mag {star.mag}</small>
                        <span className="star-dist">{star.dist}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="const-section">
                  <h4>Deep-Sky Treasures:</h4>
                  <ul>
                    {selectedConstellation.deepSkyObjects.map((dso, i) => (
                      <li key={i}>
                        <strong>{dso.name}</strong> ({dso.type}): {dso.desc}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="const-section">
                  <h4>Mythological Lore & History:</h4>
                  <p>{selectedConstellation.mythology}</p>
                </div>

                <div className="const-action-row">
                  <a
                    href="https://stellarium-web.org/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-astro-secondary"
                  >
                    ↗ Locate {selectedConstellation.name} in Stellarium Web
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* STATION 8: SPACE MISSIONS MODAL */}
      {/* ============================================================== */}
      {activeModal === 'space_missions' && (
        <div className="astro-modal-backdrop" onClick={() => setActiveModal(null)}>
          <div className="astro-modal-card wide-card" onClick={(e) => e.stopPropagation()}>
            <header className="astro-modal-header">
              <span className="astro-modal-kicker">EXHIBITION GALLERY</span>
              <h2>Landmark Space Science & Planetary Missions</h2>
              <button className="astro-modal-close" onClick={() => setActiveModal(null)}>✕</button>
            </header>
            <div className="astro-modal-body">
              <div className="mission-selector-row">
                {SPACE_MISSIONS.map((m) => (
                  <button
                    key={m.id}
                    className={`mission-tab-btn ${selectedMission.id === m.id ? 'active' : ''}`}
                    onClick={() => setSelectedMission(m)}
                  >
                    <b>{m.name.split('(')[0].trim()}</b>
                    <small>{m.agency}</small>
                  </button>
                ))}
              </div>

              <div className="mission-detail-card">
                <div className="mission-header">
                  <h3>{selectedMission.name}</h3>
                  <span className="mission-agency">{selectedMission.agency} · Launch: {selectedMission.launchDate}</span>
                  <div className="mission-status-pill">Status: {selectedMission.status}</div>
                </div>
                <p className="mission-headline">"{selectedMission.headline}"</p>
                
                <div className="mission-section">
                  <h4>Key Scientific Discoveries:</h4>
                  <ul>
                    {selectedMission.keyDiscoveries.map((disc, i) => (
                      <li key={i}>{disc}</li>
                    ))}
                  </ul>
                </div>

                <div className="mission-section">
                  <h4>Scientific Significance:</h4>
                  <p>{selectedMission.significance}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* STATION 9: MEMBERSHIP & INTEREST SURVEY MODAL */}
      {/* ============================================================== */}
      {activeModal === 'membership_survey' && (
        <div className="astro-modal-backdrop" onClick={() => setActiveModal(null)}>
          <div className="astro-modal-card wide-card" onClick={(e) => e.stopPropagation()}>
            <header className="astro-modal-header">
              <span className="astro-modal-kicker">UPHSD ASTRONOMICAL SOCIETY</span>
              <h2>Student Interest & Feedback Survey</h2>
              <button className="astro-modal-close" onClick={() => setActiveModal(null)}>✕</button>
            </header>
            <div className="astro-modal-body">
              {surveyStep === 'questions' && (
                <div className="survey-form-container">
                  <div className="survey-banner">
                    <b>Help shape the proposed Astronomical Society!</b>
                    <p>Your feedback helps us understand which activities, topics, and events students want to see. This survey is interest-focused and anonymous by default.</p>
                  </div>

                  {/* Question 1 */}
                  <div className="survey-q-card">
                    <label className="survey-q-title">1. How interested are you in astronomy and space science?</label>
                    <div className="scale-options">
                      {(['Very interested', 'Interested', 'Unsure', 'Not interested'] as SurveyScaleAnswer[]).map((val) => (
                        <label key={val} className={`scale-label ${surveyData.q1_spaceInterest === val ? 'selected' : ''}`}>
                          <input
                            type="radio"
                            name="q1"
                            checked={surveyData.q1_spaceInterest === val}
                            onChange={() => setSurveyData({ ...surveyData, q1_spaceInterest: val })}
                          />
                          <span>{val}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Question 2 */}
                  <div className="survey-q-card">
                    <label className="survey-q-title">2. After exploring Room 04, how interested are you in participating in the proposed Astronomical Society?</label>
                    <div className="scale-options">
                      {(['Very interested', 'Interested', 'Unsure', 'Not interested'] as SurveyScaleAnswer[]).map((val) => (
                        <label key={val} className={`scale-label ${surveyData.q2_joinInterest === val ? 'selected' : ''}`}>
                          <input
                            type="radio"
                            name="q2"
                            checked={surveyData.q2_joinInterest === val}
                            onChange={() => setSurveyData({ ...surveyData, q2_joinInterest: val })}
                          />
                          <span>{val}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Question 3 */}
                  <div className="survey-q-card">
                    <label className="survey-q-title">3. Which proposed activities would you like to participate in? (Select all that apply)</label>
                    <div className="checkbox-options-grid">
                      {[
                        'Stargazing Nights on Campus',
                        'Telescope Observation & Operation',
                        'Astrophotography & Image Stacking',
                        'Astronomy Lectures & Guest Seminars',
                        'Space Science Discussions & Debates',
                        'Community & School Outreach',
                        'Citizen Science Projects (Galaxy Zoo, etc.)',
                        'Observational Research & Light Pollution Mapping',
                        'NASA Space Apps Challenge & Hackathons',
                        'Eclipse & Meteor Shower Campouts',
                      ].map((act) => {
                        const checked = surveyData.q3_activities.includes(act);
                        return (
                          <label key={act} className={`checkbox-label ${checked ? 'selected' : ''}`}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                const next = checked
                                  ? surveyData.q3_activities.filter((x) => x !== act)
                                  : [...surveyData.q3_activities, act];
                                setSurveyData({ ...surveyData, q3_activities: next });
                              }}
                            />
                            <span>{act}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* Question 4 */}
                  <div className="survey-q-card">
                    <label className="survey-q-title">4. Which single activity interested you most during your exploration?</label>
                    <input
                      type="text"
                      className="astro-input"
                      placeholder="e.g. Telescope observation of Saturn, Solar System NASA Eyes, Astrophotography..."
                      value={surveyData.q4_mostExcitedActivity}
                      onChange={(e) => setSurveyData({ ...surveyData, q4_mostExcitedActivity: e.target.value })}
                    />
                  </div>

                  {/* Question 5 */}
                  <div className="survey-q-card">
                    <label className="survey-q-title">5. How often could you potentially participate in club meetings or stargazing sessions?</label>
                    <div className="scale-options">
                      {['Weekly', 'Bi-weekly (twice a month)', 'Monthly', 'Special events & star parties only'].map((val) => (
                        <label key={val} className={`scale-label ${surveyData.q5_frequency === val ? 'selected' : ''}`}>
                          <input
                            type="radio"
                            name="q5"
                            checked={surveyData.q5_frequency === val}
                            onChange={() => setSurveyData({ ...surveyData, q5_frequency: val })}
                          />
                          <span>{val}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Question 6 */}
                  <div className="survey-q-card">
                    <label className="survey-q-title">6. What skills or interests could you contribute to the society? (Select all that apply)</label>
                    <div className="checkbox-options-grid">
                      {[
                        'Telescope & Sky Observation',
                        'Photography & Image Editing',
                        'Event Planning & Logistics',
                        'Graphic Design & Social Media',
                        'Writing & Science Communication',
                        'Software / Web / Hardware',
                        'General curious learner / Enthusiastic participant',
                      ].map((item) => {
                        const checked = surveyData.q6_contributions.includes(item);
                        return (
                          <label key={item} className={`checkbox-label ${checked ? 'selected' : ''}`}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                const next = checked
                                  ? surveyData.q6_contributions.filter((x) => x !== item)
                                  : [...surveyData.q6_contributions, item];
                                setSurveyData({ ...surveyData, q6_contributions: next });
                              }}
                            />
                            <span>{item}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* Question 7 */}
                  <div className="survey-q-card">
                    <label className="survey-q-title">7. What specific events or projects would you love the club to organize?</label>
                    <input
                      type="text"
                      className="astro-input"
                      placeholder="e.g. Dark sky weekend trip, Astrobiology seminar, Sidewalk Moon telescope night..."
                      value={surveyData.q7_desiredEvents}
                      onChange={(e) => setSurveyData({ ...surveyData, q7_desiredEvents: e.target.value })}
                    />
                  </div>

                  {/* Question 8 */}
                  <div className="survey-q-card">
                    <label className="survey-q-title">8. Would you be interested in helping establish the organization as part of the student organizing committee?</label>
                    <div className="scale-options">
                      {['Yes, interested in helping organize', 'Maybe / Would like more details', 'No, prefer general participation'].map((val) => (
                        <label key={val} className={`scale-label ${surveyData.q8_committeeInterest === val ? 'selected' : ''}`}>
                          <input
                            type="radio"
                            name="q8"
                            checked={surveyData.q8_committeeInterest === val}
                            onChange={() => setSurveyData({ ...surveyData, q8_committeeInterest: val })}
                          />
                          <span>{val}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Question 9 */}
                  <div className="survey-q-card">
                    <label className="survey-q-title">9. Would you like to receive updates when organizational meetings or stargazing activities become available?</label>
                    <div className="scale-options">
                      {['Yes', 'No'].map((val) => (
                        <label key={val} className={`scale-label ${surveyData.q9_receiveUpdates === val ? 'selected' : ''}`}>
                          <input
                            type="radio"
                            name="q9"
                            checked={surveyData.q9_receiveUpdates === val}
                            onChange={() => setSurveyData({ ...surveyData, q9_receiveUpdates: val })}
                          />
                          <span>{val}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Question 10 */}
                  <div className="survey-q-card">
                    <label className="survey-q-title">10. Any other thoughts, ideas, or questions for the student organizers?</label>
                    <textarea
                      className="astro-textarea"
                      placeholder="Share your suggestions, questions, or ideas..."
                      value={surveyData.q10_generalFeedback}
                      onChange={(e) => setSurveyData({ ...surveyData, q10_generalFeedback: e.target.value })}
                    />
                  </div>

                  <div className="survey-btn-row">
                    <button className="btn-astro-primary" onClick={() => setSurveyStep('contact')}>
                      Next: Optional Contact Step ➔
                    </button>
                    <button className="btn-astro-secondary" onClick={() => submitSurvey(false)}>
                      Submit Survey Anonymously (Skip Contact)
                    </button>
                  </div>
                </div>
              )}

              {/* Step 2: Separate Optional Contact Step */}
              {surveyStep === 'contact' && (
                <div className="contact-step-container">
                  <div className="contact-header">
                    <h3>Optional Contact Information</h3>
                    <p>
                      If you would like the student organizing committee to contact you about upcoming meetings, stargazing nights, or committee roles, you may share your contact details below.
                    </p>
                    <small className="contact-privacy-note">
                      🔒 Privacy Note: Your contact details remain private to the student organizing team and are never sent to external astronomy websites. You may skip this step at any time.
                    </small>
                  </div>

                  <div className="contact-form-grid">
                    <label>
                      <span>Full Name</span>
                      <input
                        type="text"
                        className="astro-input"
                        placeholder="Your name"
                        value={surveyData.contactName}
                        onChange={(e) => setSurveyData({ ...surveyData, contactName: e.target.value })}
                      />
                    </label>
                    <label>
                      <span>Email Address</span>
                      <input
                        type="email"
                        className="astro-input"
                        placeholder="e.g. yourname@uphsd.edu.ph"
                        value={surveyData.contactEmail}
                        onChange={(e) => setSurveyData({ ...surveyData, contactEmail: e.target.value })}
                      />
                    </label>
                    <label>
                      <span>College Program & Year Level</span>
                      <input
                        type="text"
                        className="astro-input"
                        placeholder="e.g. BS Computer Science - 2nd Year"
                        value={surveyData.contactProgramYear}
                        onChange={(e) => setSurveyData({ ...surveyData, contactProgramYear: e.target.value })}
                      />
                    </label>
                  </div>

                  <div className="survey-btn-row">
                    <button className="btn-astro-primary" onClick={() => submitSurvey(true)}>
                      ✓ Submit Interest with Contact Details
                    </button>
                    <button className="btn-astro-secondary" onClick={() => submitSurvey(false)}>
                      Submit Anonymously (Without Contact)
                    </button>
                    <button className="btn-astro-outline" onClick={() => setSurveyStep('questions')}>
                      ⬅ Back to Questions
                    </button>
                  </div>
                </div>
              )}

              {/* Step 3: Thank You & Completion Screen */}
              {surveyStep === 'completed' && (
                <div className="survey-completed-screen">
                  <span className="completed-glyph">🌌</span>
                  <h3>THANK YOU FOR EXPLORING THE ASTRONOMICAL SOCIETY</h3>
                  <p>
                    Your feedback is invaluable in helping us understand student interest and the kinds of astronomy events our campus community wants to experience.
                  </p>
                  
                  <div className="completed-summary-pill">
                    <b>Exploration Summary:</b>
                    <span>You visited {exploration.visitedStations.length} of {TOTAL_EXPLORATION_STATIONS} interactive stations in Room 04.</span>
                  </div>

                  <div className="completed-action-row">
                    <button className="btn-astro-primary" onClick={() => setActiveModal(null)}>
                      🔭 Continue Exploring Room 04
                    </button>
                    <a
                      href="/"
                      className="btn-astro-secondary"
                      onClick={(e) => {
                        e.preventDefault();
                        sceneApi.current?.openDoor(() => window.location.assign('/'));
                      }}
                    >
                      🚪 Return to Campus Hallway
                    </a>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* STATION 10: GUIDE NPC MODAL */}
      {/* ============================================================== */}
      {activeModal === 'guide' && (
        <div className="astro-modal-backdrop" onClick={() => setActiveModal(null)}>
          <div className="astro-modal-card" onClick={(e) => e.stopPropagation()}>
            <header className="astro-modal-header">
              <span className="astro-modal-kicker">SOCIETY ORIENTATION GUIDE</span>
              <h2>Welcome to the Astronomical Society Room!</h2>
              <button className="astro-modal-close" onClick={() => setActiveModal(null)}>✕</button>
            </header>
            <div className="astro-modal-body">
              <p className="astro-modal-lead">
                "Hello! Welcome to Room 04. This space explores what an astronomy-focused student organization could offer our university community."
              </p>
              <div className="guide-tour-list">
                <div>🪐 <b>Center Table:</b> Inspect the 3D Solar System and launch NASA Eyes.</div>
                <div>🔭 <b>North Windows:</b> Test the telescope and simulate the night sky with Stellarium.</div>
                <div>📋 <b>Activity Wall:</b> Read through 10 proposed club activities from stargazing to hackathons.</div>
                <div>📷 <b>Astrophoto Station:</b> Explore camera optics, long-exposure tracking, and deep-sky stacking.</div>
                <div>⭐ <b>Constellation Wall:</b> Learn star lore, coordinates, and deep-sky objects.</div>
                <div>✍️ <b>Recruitment Desk:</b> Share your feedback in our short 10-question interest survey!</div>
              </div>
              <div className="astro-btn-center">
                <button className="btn-astro-primary" onClick={() => setActiveModal(null)}>
                  Begin Exploring Room 04
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* EXTERNAL IN-APP OVERLAYS: NASA EYES & STELLARIUM */}
      {/* ============================================================== */}
      {externalOverlay && (
        <div className="astro-external-overlay" role="dialog" aria-modal="true">
          <header className="overlay-header">
            <div className="overlay-title-group">
              <b>{externalOverlay === 'nasa' ? 'NASA Eyes on the Solar System' : 'Stellarium Web Planetarium'}</b>
              <span className="attribution-tag">
                {externalOverlay === 'nasa' ? 'Interactive resource: NASA Eyes' : 'Interactive resource: Stellarium Web'}
              </span>
            </div>
            <div className="overlay-btn-group">
              <a
                href={externalOverlay === 'nasa' ? 'https://eyes.nasa.gov/apps/solar-system/' : 'https://stellarium-web.org/'}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-overlay-newtab"
              >
                ↗ Open in New Tab
              </a>
              <button className="btn-overlay-close" onClick={() => setExternalOverlay(null)}>
                ✕ Return to Room 04
              </button>
            </div>
          </header>

          <div className="overlay-frame-wrapper">
            {!iframeLoaded && !iframeError && (
              <div className="overlay-loading">
                <div className="spinner" />
                <p>Loading interactive simulation...</p>
                <small>If your browser or school network restricts embedded frames, click "Open in New Tab" above.</small>
              </div>
            )}

            {iframeError && (
              <div className="overlay-error">
                <p>Embedding is restricted by browser security or network policy.</p>
                <a
                  href={externalOverlay === 'nasa' ? 'https://eyes.nasa.gov/apps/solar-system/' : 'https://stellarium-web.org/'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-astro-primary"
                >
                  ↗ Open Official Experience in New Browser Tab
                </a>
              </div>
            )}

            <iframe
              src={externalOverlay === 'nasa' ? 'https://eyes.nasa.gov/apps/solar-system/' : 'https://stellarium-web.org/'}
              title={externalOverlay === 'nasa' ? 'NASA Eyes on the Solar System' : 'Stellarium Web Planetarium'}
              className="astro-iframe"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
              onLoad={() => setIframeLoaded(true)}
              onError={() => setIframeError(true)}
            />
          </div>
        </div>
      )}
    </main>
  );
}
