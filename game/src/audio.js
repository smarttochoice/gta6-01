// Sound, synthesized live with WebAudio: engine hum, sirens, gunshots, pickups,
// mission stings and a slow synthwave pad. No audio files, no network.
export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let padNodes = null;
  let muted = false;
  let sirenTimer = 0;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext ?? window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      // Engine: two detuned saws through a lowpass, pitch follows speed.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      const engineOsc2 = ctx.createOscillator();
      engineOsc2.type = 'sawtooth';
      engineOsc2.frequency.value = 55 * 1.007;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      engineOsc.connect(filter);
      engineOsc2.connect(filter);
      filter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      engineOsc2.start();
      startPad();
      return true;
    } catch {
      return false;
    }
  }

  function startPad() {
    // A slow Am–F–C–G pad, quiet under everything else.
    const chords = [
      [110.0, 130.81, 164.81],
      [87.31, 130.81, 174.61],
      [130.81, 164.81, 196.0],
      [98.0, 146.83, 196.0],
    ];
    padNodes = chords.map((freqs) => freqs.map((f) => {
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
      padNodes.forEach((voices, i) => {
        voices.forEach(({ g }) => {
          g.gain.linearRampToValueAtTime(i === chord ? 0.035 : 0, ctx.currentTime + 2.5);
        });
      });
      chord = (chord + 1) % padNodes.length;
      setTimeout(step, 5200);
    };
    step();
  }

  function blip(freq, dur, type, vol, slideTo) {
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

  function noise(dur, vol, filterFreq) {
    if (!ctx || muted) return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
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
    if (now - sirenTimer < 0.9) return;
    sirenTimer = now;
    blip(660, 0.42, 'sine', 0.10, 880);
    setTimeout(() => blip(880, 0.42, 'sine', 0.10, 660), 430);
  }

  return {
    unlock() {
      if (ensure() && ctx.state === 'suspended') void ctx.resume();
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    get muted() {
      return muted;
    },
    // Called every frame with the driving state; the engine follows the speed.
    update(state) {
      if (!ctx || muted || !engineGain || !engineOsc) return;
      const p = state.player;
      const driving = !p.onFoot;
      const speed = driving ? Math.abs(p.speed ?? 0) : 0;
      const target = driving ? 0.05 + (speed / 560) * 0.09 : 0;
      engineGain.gain.linearRampToValueAtTime(target, ctx.currentTime + 0.08);
      if (engineOsc) engineOsc.frequency.linearRampToValueAtTime(52 + (speed / 560) * 130, ctx.currentTime + 0.08);
      if (p.stars > 0) siren();
    },
    play(event) {
      if (!ctx || muted) return;
      switch (event) {
        case 'shot':
          noise(0.09, 0.35, 2400);
          break;
        case 'crash':
          noise(0.22, 0.4, 700);
          blip(90, 0.2, 'sine', 0.3, 45);
          break;
        case 'pickup':
          blip(880, 0.1, 'sine', 0.2);
          setTimeout(() => blip(1318, 0.14, 'sine', 0.2), 90);
          break;
        case 'mission':
          [523, 659, 784].forEach((f, i) => setTimeout(() => blip(f, 0.22, 'triangle', 0.22), i * 110));
          break;
        case 'mission-complete':
          [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => blip(f, 0.3, 'triangle', 0.25), i * 120));
          break;
        case 'mission-failed':
          [392, 330, 262].forEach((f, i) => setTimeout(() => blip(f, 0.3, 'sawtooth', 0.14), i * 140));
          break;
        case 'robbed':
          blip(1200, 0.12, 'square', 0.12, 600);
          break;
        case 'enter-car':
          blip(180, 0.12, 'sine', 0.25, 320);
          break;
        case 'siren':
          siren();
          break;
        case 'busted':
        case 'wasted':
          [330, 262, 196].forEach((f, i) => setTimeout(() => blip(f, 0.4, 'sawtooth', 0.16), i * 200));
          break;
        default:
          break;
      }
    },
  };
}
