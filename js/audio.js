// Sonido sintetizado. Sin ficheros: osciladores y ruido, volumen bajo.

let ctx = null;
let master = null;
let noise = null;

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = audio.muted ? 0 : 0.16;
  master.connect(ctx.destination);
  const len = Math.floor(ctx.sampleRate * 0.3);
  noise = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return ctx;
}

function tone(freq, dur, opts = {}) {
  const c = ensure();
  if (!c) return;
  const t0 = c.currentTime + (opts.delay || 0);
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = opts.type || 'square';
  osc.frequency.setValueAtTime(freq, t0);
  if (opts.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.to), t0 + dur);
  const vol = opts.gain ?? 0.28;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function hiss(dur, opts = {}) {
  const c = ensure();
  if (!c) return;
  const t0 = c.currentTime + (opts.delay || 0);
  const src = c.createBufferSource();
  src.buffer = noise;
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(opts.from || 2400, t0);
  filter.frequency.exponentialRampToValueAtTime(opts.to || 120, t0 + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(opts.gain ?? 0.35, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filter).connect(g).connect(master);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

export const audio = {
  muted: false,

  unlock() {
    const c = ensure();
    if (c && c.state === 'suspended') c.resume();
  },

  setMuted(m) {
    this.muted = m;
    if (master) master.gain.value = m ? 0 : 0.16;
  },

  play(type, data = {}) {
    if (this.muted) return;
    if (!ensure()) return;
    switch (type) {
      case 'start':
        tone(180, 0.1, { type: 'square', gain: 0.18 });
        tone(90, 0.14, { type: 'triangle', gain: 0.22, delay: 0.02 });
        break;
      case 'eat': {
        const step = Math.min(data.multiplier || 1, 5);
        tone(300 + step * 70, 0.07, { type: 'square', gain: 0.24 });
        tone(600 + step * 90, 0.05, { type: 'square', gain: 0.12, delay: 0.03 });
        break;
      }
      case 'bonus':
        tone(620, 0.07, { type: 'square', gain: 0.2 });
        tone(820, 0.07, { type: 'square', gain: 0.2, delay: 0.06 });
        tone(1040, 0.09, { type: 'square', gain: 0.18, delay: 0.12 });
        break;
      case 'portal':
        tone(900, 0.06, { type: 'triangle', gain: 0.16, to: 1400 });
        break;
      case 'turbo':
        tone(140, 0.08, { type: 'sawtooth', gain: 0.1 });
        break;
      case 'die':
        hiss(0.34, { from: 3200, to: 60, gain: 0.4 });
        tone(220, 0.4, { type: 'sawtooth', gain: 0.24, to: 40 });
        tone(140, 0.3, { type: 'square', gain: 0.14, to: 30, delay: 0.04 });
        break;
      case 'clear':
        [523, 659, 784, 1046].forEach((f, i) =>
          tone(f, 0.12, { type: 'square', gain: 0.2, delay: i * 0.075 }));
        break;
      case 'ui':
        tone(440, 0.03, { type: 'square', gain: 0.1 });
        break;
      case 'locked':
        tone(120, 0.08, { type: 'square', gain: 0.14 });
        break;
    }
  },
};
