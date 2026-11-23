// Sound, synthesized live with WebAudio: engine hum, sirens, gunshots,
// crashes, pickups, mission stings and a slow synthwave pad. No audio files,
// no network, nothing to load.
export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineGain = null;
  let padVoices = null;
  let muted = false;
  let lastSiren = 0;

  function build() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext ?? window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      // Engine: two detuned saws through a lowpass, pitch follows speed.
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      filter.connect(master);
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineGain.connect(filter);
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineOsc2 = ctx.createOscillator();
      engineOsc2.type = 'sawtooth';
      engineOsc2.frequency.value = 55 * 1.007;
      engineOsc.connect(engineGain);
      engineOsc2.connect(engineGain);
      engineOsc.start();
      engineOsc2.start();
      startPad();
      return true;
    } catch {
      return false;
    }
  }

  function startPad() {
    // A slow Dm–Bb–F–C pad, quiet under everything else, one chord at a time.
    const chords = [
      [146.83, 174.61, 220.0],
      [116.54, 174.61, 233.08],
      [174.61, 220.0, 261.63],
      [130.81, 196.0, 261.63],
    ];
    padVoices = chords.map((freqs) => freqs.map((f) => {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = 0;
      o.connect(g);
      g.connect(master);
      o.start();
      return { o, g };
    }));
    let chord = 0;
    const step = () => {
      if (!ctx) return;
      padVoices.forEach((voices, i) => {
        voices.forEach(({ g }) => {
          g.gain.linearRampToValueAtTime(i === chord ? 0.035 : 0, ctx.currentTime + 2.5);
        });
      });
      chord = (chord + 1) % padVoices.length;
      setTimeout(step, 5200);
    };
    step();
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (!ctx || muted) return;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g);
    g.connect(master);
    o.start();
    o.stop(ctx.currentTime + dur);
  }

  function burstNoise(dur, vol, cutoff) {
    if (!ctx || muted) return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start();
  }

  function siren() {
    if (!ctx || muted) return;
    const now = ctx.currentTime;
    if (now - lastSiren < 0.9) return;
    lastSiren = now;
    tone(660, 0.42, 'sine', 0.1, 880);
    setTimeout(() => tone(880, 0.42, 'sine', 0.1, 660), 430);
  }

  // A short ascending phrase, one note per step, delayed in turn.
  function phrase(notes, dur, type, vol, gap) {
    notes.forEach((f, i) => setTimeout(() => tone(f, dur, type, vol), i * gap));
  }

  return {
    unlock() {
      if (build() && ctx.state === 'suspended') void ctx.resume();
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    get muted() {
      return muted;
    },
    // Called every frame with the driving state; the engine follows speed and
    // the siren wails while the player is wanted.
    update(state) {
      if (!ctx || muted || !engineGain || !engineOsc) return;
      const p = state.player;
      const driving = !p.onFoot;
      const speed = driving ? Math.abs(p.speed ?? 0) : 0;
      const gain = driving ? 0.05 + (speed / 560) * 0.09 : 0;
      engineGain.gain.linearRampToValueAtTime(gain, ctx.currentTime + 0.08);
      engineOsc.frequency.linearRampToValueAtTime(52 + (speed / 560) * 130, ctx.currentTime + 0.08);
      engineOsc2.frequency.linearRampToValueAtTime(52 * 1.007 + (speed / 560) * 130, ctx.currentTime + 0.08);
      if (p.stars > 0) siren();
    },
    play(event) {
      if (!ctx || muted) return;
      switch (event) {
        case 'shot':
          burstNoise(0.09, 0.35, 2400);
          break;
        case 'crash':
          burstNoise(0.22, 0.4, 700);
          tone(90, 0.2, 'sine', 0.3, 45);
          break;
        case 'pickup':
          tone(880, 0.1, 'sine', 0.2);
          setTimeout(() => tone(1318, 0.14, 'sine', 0.2), 90);
          break;
        case 'mission':
          phrase([523, 659, 784], 0.22, 'triangle', 0.22, 110);
          break;
        case 'mission-complete':
          phrase([523, 659, 784, 1046], 0.3, 'triangle', 0.25, 120);
          break;
        case 'mission-failed':
          phrase([392, 330, 262], 0.3, 'sawtooth', 0.14, 140);
          break;
        case 'robbed':
          tone(1200, 0.12, 'square', 0.12, 600);
          break;
        case 'enter-car':
          tone(180, 0.12, 'sine', 0.25, 320);
          break;
        case 'siren':
          siren();
          break;
        case 'busted':
        case 'wasted':
          phrase([330, 262, 196], 0.4, 'sawtooth', 0.16, 200);
          break;
        default:
          break;
      }
    },
  };
}
