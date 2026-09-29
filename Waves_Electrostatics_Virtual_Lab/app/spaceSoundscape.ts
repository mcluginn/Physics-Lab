// ============================================================================
// THE SOUND OF SPACE · CINEMATIC MUSIC ENGINE
// Inspired by humanity's fascination with the cosmos.
// Procedural Web Audio API soundscape generator with zero external network
// dependencies, zero 404 latency, and infinite non-repeating cinematic ambiance.
// ============================================================================

export type SpaceMovementId = 'orbital' | 'deep_void' | 'stellar_chimes';

export interface SpaceMovement {
  id: SpaceMovementId;
  name: string;
  subtitle: string;
  description: string;
  icon: string;
}

export const SPACE_MOVEMENTS: SpaceMovement[] = [
  {
    id: 'orbital',
    name: 'Movement I: Orbital Symphony',
    subtitle: 'Cosmic Drone, Nebula Pads & Celestial Harmonics',
    description: 'A rich cinematic soundscape inspired by the slow majesty of orbiting planets and glowing nebulae.',
    icon: '🪐',
  },
  {
    id: 'deep_void',
    name: 'Movement II: Deep Void & Solar Wind',
    subtitle: 'Sub-Harmonic Void & Interstellar Whispers',
    description: 'Deep resonant sub-bass frequencies and radio-wave sonifications mimicking voyager probes drifting past gas giants.',
    icon: '🌌',
  },
  {
    id: 'stellar_chimes',
    name: 'Movement III: Starlight & Pulsars',
    subtitle: 'Crystalline Bell Arpeggios & Cosmic Echoes',
    description: 'Shimmering celestial chimes and infinite delay reflections evoking distant pulsars and starlight glistening through telescopes.',
    icon: '✨',
  },
];

// Harmonic note frequencies (Hz) for cosmic progressions
const PITCHES = {
  // Deep sub / bass fundamentals
  D1: 36.71,
  F1: 43.65,
  G1: 49.00,
  A1: 55.00,
  Bb1: 58.27,
  C2: 65.41,
  D2: 73.42,
  E2: 82.41,
  F2: 87.31,
  G2: 98.00,
  A2: 110.00,
  Bb2: 116.54,
  C3: 130.81,

  // Nebula mid pads
  D3: 146.83,
  F3: 174.61,
  G3: 196.00,
  A3: 220.00,
  Bb3: 233.08,
  C4: 261.63,
  D4: 293.66,
  E4: 329.63,
  F4: 349.23,
  G4: 392.00,
  A4: 440.00,

  // Starlight crystalline chimes (high octaves)
  C5: 523.25,
  D5: 587.33,
  E5: 659.25,
  F5: 698.46,
  G5: 783.99,
  A5: 880.00,
  C6: 1046.50,
  D6: 1174.66,
  E6: 1318.51,
  G6: 1567.98,
  A6: 1760.00,
  C7: 2093.00,
};

// Cinematic cosmic chord voicings
interface ChordVoicing {
  root: number;
  padPitches: number[];
  chimePitches: number[];
}

const COSMIC_CHORDS: ChordVoicing[] = [
  // 1. D minor 9th (Orbital Vastness)
  {
    root: PITCHES.D1,
    padPitches: [PITCHES.D2, PITCHES.A2, PITCHES.F3, PITCHES.C4, PITCHES.E4],
    chimePitches: [PITCHES.A5, PITCHES.C6, PITCHES.D6, PITCHES.E6],
  },
  // 2. Bb major 7 (#11) (Nebula Mystery)
  {
    root: PITCHES.Bb1,
    padPitches: [PITCHES.Bb1, PITCHES.F2, PITCHES.D3, PITCHES.A3, PITCHES.E4],
    chimePitches: [PITCHES.F5, PITCHES.A5, PITCHES.C6, PITCHES.E6],
  },
  // 3. F major 7 / C (Stellar Horizon)
  {
    root: PITCHES.C2,
    padPitches: [PITCHES.C2, PITCHES.G2, PITCHES.F3, PITCHES.A3, PITCHES.C4],
    chimePitches: [PITCHES.G5, PITCHES.A5, PITCHES.C6, PITCHES.D6],
  },
  // 4. G sus 2 / A (Cosmic Voyager)
  {
    root: PITCHES.A1,
    padPitches: [PITCHES.A1, PITCHES.E2, PITCHES.G3, PITCHES.D4, PITCHES.A4],
    chimePitches: [PITCHES.E5, PITCHES.G5, PITCHES.A5, PITCHES.D6],
  },
];

export class SpaceSoundscapeEngine {
  private ctx: AudioContext;
  private isDisposed = false;
  private isRunning = false;
  private isMuted = false;
  private isDucked = false;
  private masterVolume = 0.65;
  private currentMovement: SpaceMovementId = 'orbital';

  // Audio Graph Nodes
  private masterMusicGain: GainNode | null = null;
  private droneGain: GainNode | null = null;
  private padGain: GainNode | null = null;
  private chimeGain: GainNode | null = null;
  private windGain: GainNode | null = null;
  private delayNode: DelayNode | null = null;
  private delayFeedbackGain: GainNode | null = null;

  // Drone Oscillators
  private droneOscA: OscillatorNode | null = null;
  private droneOscB: OscillatorNode | null = null;
  private droneFilter: BiquadFilterNode | null = null;
  private droneLFO: OscillatorNode | null = null;
  private droneLFOGain: GainNode | null = null;

  // Active Pad Voices
  private activePadNodes: { osc: OscillatorNode; gain: GainNode }[] = [];

  // Wind Buffer Source
  private windSource: AudioBufferSourceNode | null = null;
  private windFilter: BiquadFilterNode | null = null;

  // Timers
  private chordTimer: number | null = null;
  private chimeTimer: number | null = null;
  private currentChordIndex = 0;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.initAudioGraph();
  }

  private initAudioGraph() {
    try {
      // Master Music Bus
      this.masterMusicGain = this.ctx.createGain();
      this.masterMusicGain.gain.setValueAtTime(0.0001, this.ctx.currentTime);
      this.masterMusicGain.connect(this.ctx.destination);

      // Delay Line for Spatial Cosmic Reverb / Echo
      this.delayNode = this.ctx.createDelay(2.0);
      this.delayNode.delayTime.setValueAtTime(0.38, this.ctx.currentTime);

      this.delayFeedbackGain = this.ctx.createGain();
      this.delayFeedbackGain.gain.setValueAtTime(0.42, this.ctx.currentTime);

      const delayFilter = this.ctx.createBiquadFilter();
      delayFilter.type = 'lowpass';
      delayFilter.frequency.setValueAtTime(2400, this.ctx.currentTime);

      this.delayNode.connect(delayFilter);
      delayFilter.connect(this.delayFeedbackGain);
      this.delayFeedbackGain.connect(this.delayNode);
      this.delayNode.connect(this.masterMusicGain);

      // Sub-drone Gain
      this.droneGain = this.ctx.createGain();
      this.droneGain.gain.setValueAtTime(0.12, this.ctx.currentTime);
      this.droneGain.connect(this.masterMusicGain);

      // Pad Gain
      this.padGain = this.ctx.createGain();
      this.padGain.gain.setValueAtTime(0.16, this.ctx.currentTime);
      this.padGain.connect(this.masterMusicGain);

      // Chime Gain (routed to both dry master and space delay)
      this.chimeGain = this.ctx.createGain();
      this.chimeGain.gain.setValueAtTime(0.14, this.ctx.currentTime);
      this.chimeGain.connect(this.masterMusicGain);
      this.chimeGain.connect(this.delayNode);

      // Wind / Cosmic Noise Gain
      this.windGain = this.ctx.createGain();
      this.windGain.gain.setValueAtTime(0.025, this.ctx.currentTime);
      this.windGain.connect(this.masterMusicGain);
    } catch (err) {
      console.warn('SpaceSoundscapeEngine: Error initializing audio graph', err);
    }
  }

  public start() {
    if (this.isRunning || this.isDisposed) return;
    this.isRunning = true;

    try {
      if (this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }

      this.startDrone();
      this.startWind();
      this.scheduleNextChord();
      this.scheduleNextChime();
      this.updateEffectiveGain(true);
    } catch (err) {
      console.warn('SpaceSoundscapeEngine: Error starting playback', err);
    }
  }

  public setVolume(volume: number) {
    this.masterVolume = Math.max(0, Math.min(1, volume));
    this.updateEffectiveGain(false);
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    this.updateEffectiveGain(false);
  }

  public setDucked(ducked: boolean) {
    this.isDucked = ducked;
    this.updateEffectiveGain(false);
  }

  public setMovement(movement: SpaceMovementId) {
    if (this.currentMovement === movement) return;
    this.currentMovement = movement;
    this.applyMovementProfile();
  }

  public getMovement(): SpaceMovementId {
    return this.currentMovement;
  }

  private updateEffectiveGain(isInitialFadeIn = false) {
    if (!this.masterMusicGain) return;
    const now = this.ctx.currentTime;
    const targetGain = this.isMuted
      ? 0.0001
      : this.masterVolume * (this.isDucked ? 0.35 : 0.85);

    try {
      this.masterMusicGain.gain.cancelScheduledValues(now);
      if (isInitialFadeIn) {
        this.masterMusicGain.gain.setValueAtTime(0.0001, now);
        this.masterMusicGain.gain.exponentialRampToValueAtTime(Math.max(0.0001, targetGain), now + 3.0);
      } else {
        this.masterMusicGain.gain.setTargetAtTime(targetGain, now, 0.25);
      }
    } catch {}
  }

  private applyMovementProfile() {
    const now = this.ctx.currentTime;
    if (!this.droneGain || !this.padGain || !this.chimeGain || !this.windGain) return;

    try {
      if (this.currentMovement === 'orbital') {
        // Balanced rich cinematic blend
        this.droneGain.gain.setTargetAtTime(0.12, now, 0.8);
        this.padGain.gain.setTargetAtTime(0.16, now, 0.8);
        this.chimeGain.gain.setTargetAtTime(0.14, now, 0.8);
        this.windGain.gain.setTargetAtTime(0.025, now, 0.8);
      } else if (this.currentMovement === 'deep_void') {
        // Deep sub-harmonics & solar wind focus
        this.droneGain.gain.setTargetAtTime(0.20, now, 0.8);
        this.padGain.gain.setTargetAtTime(0.08, now, 0.8);
        this.chimeGain.gain.setTargetAtTime(0.04, now, 0.8);
        this.windGain.gain.setTargetAtTime(0.045, now, 0.8);
      } else if (this.currentMovement === 'stellar_chimes') {
        // High crystalline harmonics & celestial delay focus
        this.droneGain.gain.setTargetAtTime(0.08, now, 0.8);
        this.padGain.gain.setTargetAtTime(0.13, now, 0.8);
        this.chimeGain.gain.setTargetAtTime(0.22, now, 0.8);
        this.windGain.gain.setTargetAtTime(0.015, now, 0.8);
      }
    } catch {}
  }

  // --- Layer 1: Sub-bass Cosmic Drone & Slow Resonance LFO ---
  private startDrone() {
    if (!this.droneGain) return;
    try {
      const now = this.ctx.currentTime;

      // Resonant Lowpass Filter for Drone
      this.droneFilter = this.ctx.createBiquadFilter();
      this.droneFilter.type = 'lowpass';
      this.droneFilter.frequency.setValueAtTime(160, now);
      this.droneFilter.Q.setValueAtTime(2.2, now);

      // Slow Breathing LFO to gently modulate the filter frequency
      this.droneLFO = this.ctx.createOscillator();
      this.droneLFO.type = 'sine';
      this.droneLFO.frequency.setValueAtTime(0.05, now); // ~20s cycle

      this.droneLFOGain = this.ctx.createGain();
      this.droneLFOGain.gain.setValueAtTime(50, now); // sweeps between 110Hz and 210Hz
      this.droneLFO.connect(this.droneLFOGain);
      this.droneLFOGain.connect(this.droneFilter.frequency);
      this.droneLFO.start();

      // Dual Detuned Fundamental Oscillators (D1 = 36.71 Hz)
      this.droneOscA = this.ctx.createOscillator();
      this.droneOscA.type = 'sawtooth';
      this.droneOscA.frequency.setValueAtTime(PITCHES.D1 - 0.25, now);

      this.droneOscB = this.ctx.createOscillator();
      this.droneOscB.type = 'triangle';
      this.droneOscB.frequency.setValueAtTime(PITCHES.D1 + 0.25, now);

      this.droneOscA.connect(this.droneFilter);
      this.droneOscB.connect(this.droneFilter);
      this.droneFilter.connect(this.droneGain);

      this.droneOscA.start();
      this.droneOscB.start();
    } catch (err) {
      console.warn('Drone start error', err);
    }
  }

  // --- Layer 2: Interstellar Solar Wind / Radio Noise ---
  private startWind() {
    if (!this.windGain) return;
    try {
      const bufferSize = this.ctx.sampleRate * 4;
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);

      // Generate soft pink/white noise
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        output[i] = (b0 + b1 + b2 + white * 0.5362) * 0.08;
      }

      this.windSource = this.ctx.createBufferSource();
      this.windSource.buffer = noiseBuffer;
      this.windSource.loop = true;

      this.windFilter = this.ctx.createBiquadFilter();
      this.windFilter.type = 'bandpass';
      this.windFilter.frequency.setValueAtTime(620, this.ctx.currentTime);
      this.windFilter.Q.setValueAtTime(3.8, this.ctx.currentTime);

      this.windSource.connect(this.windFilter);
      this.windFilter.connect(this.windGain);
      this.windSource.start();
    } catch (err) {
      console.warn('Wind start error', err);
    }
  }

  // --- Layer 3: Lush Nebula Chord Progression (Evolving Polyphony) ---
  private scheduleNextChord() {
    if (this.isDisposed || !this.isRunning) return;

    try {
      const chord = COSMIC_CHORDS[this.currentChordIndex];
      this.playCosmicChord(chord);
      this.currentChordIndex = (this.currentChordIndex + 1) % COSMIC_CHORDS.length;

      // Chord duration is ~14 seconds for majestic, slow cinematic pacing
      this.chordTimer = window.setTimeout(() => {
        this.scheduleNextChord();
      }, 13500);
    } catch {}
  }

  private playCosmicChord(chord: ChordVoicing) {
    if (!this.padGain || this.isDisposed) return;
    const now = this.ctx.currentTime;
    const chordDuration = 15.0;
    const attack = 3.8;
    const release = 4.5;

    // Gently update root drone pitch with smooth transition
    if (this.droneOscA && this.droneOscB) {
      try {
        this.droneOscA.frequency.setTargetAtTime(chord.root - 0.2, now, 2.0);
        this.droneOscB.frequency.setTargetAtTime(chord.root + 0.2, now, 2.0);
      } catch {}
    }

    // Play each voice in the pad chord
    chord.padPitches.forEach((freq, idx) => {
      try {
        const osc = this.ctx.createOscillator();
        const voiceGain = this.ctx.createGain();
        const panner = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;

        // Alternate waveforms for warm lush acoustic blend
        osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
        // Add micro-detuning for chorus spread (-4 to +4 cents)
        const detuneCents = (idx - 2) * 2.5;
        osc.frequency.setValueAtTime(freq, now);
        osc.detune.setValueAtTime(detuneCents, now);

        // Volume envelope (smooth fade-in -> sustain -> fade-out)
        const peakGain = 0.05 / Math.sqrt(chord.padPitches.length);
        voiceGain.gain.setValueAtTime(0.0001, now);
        voiceGain.gain.exponentialRampToValueAtTime(peakGain, now + attack);
        voiceGain.gain.setValueAtTime(peakGain, now + chordDuration - release);
        voiceGain.gain.exponentialRampToValueAtTime(0.0001, now + chordDuration);

        // Pan voice across stereo field
        if (panner) {
          const panVal = Math.max(-0.6, Math.min(0.6, (idx - 2) * 0.3));
          panner.pan.setValueAtTime(panVal, now);
          osc.connect(voiceGain).connect(panner).connect(this.padGain!);
        } else {
          osc.connect(voiceGain).connect(this.padGain!);
        }

        osc.start(now);
        osc.stop(now + chordDuration + 0.1);

        const nodeRef = { osc, gain: voiceGain };
        this.activePadNodes.push(nodeRef);

        setTimeout(() => {
          const idx = this.activePadNodes.indexOf(nodeRef);
          if (idx >= 0) this.activePadNodes.splice(idx, 1);
        }, (chordDuration + 0.2) * 1000);
      } catch {}
    });
  }

  // --- Layer 4: Crystalline Stellar Chimes & Pulsar Delay Notes ---
  private scheduleNextChime() {
    if (this.isDisposed || !this.isRunning) return;

    try {
      const chord = COSMIC_CHORDS[this.currentChordIndex % COSMIC_CHORDS.length];
      const pitches = chord.chimePitches;
      const freq = pitches[Math.floor(Math.random() * pitches.length)];

      this.playStellarChime(freq);

      // Trigger every 2.8 to 5.2 seconds for natural, organic star twinkles
      const nextDelay = 2800 + Math.random() * 2400;
      this.chimeTimer = window.setTimeout(() => {
        this.scheduleNextChime();
      }, nextDelay);
    } catch {}
  }

  private playStellarChime(freq: number) {
    if (!this.chimeGain || this.isDisposed) return;
    const now = this.ctx.currentTime;
    const chimeDuration = 2.4;

    try {
      // Bell voice: Fundamental Sine + Metallic Overtone
      const osc = this.ctx.createOscillator();
      const overtone = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const panner = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);

      overtone.type = 'sine';
      overtone.frequency.setValueAtTime(freq * 2.756, now); // Natural bell harmonic

      // Instant attack and long exponential decay
      const chimeVol = this.currentMovement === 'stellar_chimes' ? 0.045 : 0.028;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(chimeVol, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + chimeDuration);

      if (panner) {
        const pan = (Math.random() * 2 - 1) * 0.7;
        panner.pan.setValueAtTime(pan, now);
        osc.connect(gain);
        overtone.connect(gain);
        gain.connect(panner).connect(this.chimeGain);
      } else {
        osc.connect(gain);
        overtone.connect(gain);
        gain.connect(this.chimeGain);
      }

      osc.start(now);
      overtone.start(now);
      osc.stop(now + chimeDuration + 0.05);
      overtone.stop(now + chimeDuration + 0.05);
    } catch {}
  }

  public dispose() {
    this.isDisposed = true;
    this.isRunning = false;

    if (this.chordTimer !== null) {
      clearTimeout(this.chordTimer);
      this.chordTimer = null;
    }
    if (this.chimeTimer !== null) {
      clearTimeout(this.chimeTimer);
      this.chimeTimer = null;
    }

    try {
      if (this.droneOscA) { this.droneOscA.stop(); this.droneOscA.disconnect(); }
      if (this.droneOscB) { this.droneOscB.stop(); this.droneOscB.disconnect(); }
      if (this.droneLFO) { this.droneLFO.stop(); this.droneLFO.disconnect(); }
      if (this.windSource) { this.windSource.stop(); this.windSource.disconnect(); }

      this.activePadNodes.forEach((node) => {
        try { node.osc.stop(); node.osc.disconnect(); } catch {}
      });
      this.activePadNodes = [];

      if (this.masterMusicGain) {
        this.masterMusicGain.disconnect();
      }
    } catch {}
  }
}
