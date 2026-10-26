// sonido sintetizado. sin ficheros: osciladores y ruido

let ctx = null;
let master = null;
let noiseBuf = null;
let roto = false;

function build() {
  if (ctx) return ctx;
  if (roto) return null;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) {
      roto = true;
      return null;
    }
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = audio.enabled ? 0.15 : 0;
    master.connect(ctx.destination);

    const len = Math.floor(ctx.sampleRate * 0.3);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return ctx;
  } catch (err) {
    // sin audio se juega igual
    roto = true;
    ctx = null;
    master = null;
    return null;
  }
}

function tono(freq, dur, opts = {}) {
  const c = build();
  if (!c) return;
  const t0 = c.currentTime + (opts.delay || 0);
  const osc = c.createOscillator();
  const gan = c.createGain();
  osc.type = opts.tipo || 'square';
  osc.frequency.setValueAtTime(freq, t0);
  if (opts.fin) osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.fin), t0 + dur);
  const vol = opts.vol ?? 0.28;
  gan.gain.setValueAtTime(0.0001, t0);
  gan.gain.exponentialRampToValueAtTime(vol, t0 + 0.006);
  gan.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gan).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function ruido(dur, opts = {}) {
  const c = build();
  if (!c) return;
  const t0 = c.currentTime + (opts.delay || 0);
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  const filtro = c.createBiquadFilter();
  filtro.type = 'lowpass';
  filtro.frequency.setValueAtTime(opts.desde || 2400, t0);
  filtro.frequency.exponentialRampToValueAtTime(opts.hasta || 120, t0 + dur);
  const gan = c.createGain();
  gan.gain.setValueAtTime(opts.vol ?? 0.35, t0);
  gan.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filtro).connect(gan).connect(master);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

const SONIDOS = {
  start() {
    tono(180, 0.1, { vol: 0.18 });
    tono(90, 0.14, { tipo: 'triangle', vol: 0.22, delay: 0.02 });
  },
  bite({ multiplier = 1 } = {}) {
    const paso = Math.min(multiplier, 5);
    tono(300 + paso * 70, 0.07, { vol: 0.24 });
    tono(600 + paso * 90, 0.05, { vol: 0.12, delay: 0.03 });
  },
  bonus() {
    tono(620, 0.07, { vol: 0.2 });
    tono(820, 0.07, { vol: 0.2, delay: 0.06 });
    tono(1040, 0.09, { vol: 0.18, delay: 0.12 });
  },
  power() {
    tono(480, 0.08, { tipo: 'triangle', vol: 0.2 });
    tono(720, 0.1, { tipo: 'triangle', vol: 0.16, delay: 0.07 });
  },
  shield() {
    tono(240, 0.12, { tipo: 'triangle', vol: 0.18, fin: 520 });
    tono(820, 0.08, { vol: 0.12, delay: 0.04 });
  },
  turbo() {
    tono(140, 0.08, { tipo: 'sawtooth', vol: 0.1 });
  },
  hunter() {
    tono(72, 0.09, { tipo: 'sawtooth', vol: 0.09 });
  },
  death() {
    ruido(0.34, { desde: 3200, hasta: 60, vol: 0.4 });
    tono(220, 0.4, { tipo: 'sawtooth', vol: 0.24, fin: 40 });
    tono(140, 0.3, { vol: 0.14, fin: 30, delay: 0.04 });
  },
  level() {
    [523, 659, 784, 1046].forEach((f, i) => tono(f, 0.12, { vol: 0.2, delay: i * 0.075 }));
  },
  wall() {
    tono(150, 0.09, { tipo: 'square', vol: 0.12, fin: 90 });
    ruido(0.12, { desde: 900, hasta: 200, vol: 0.18 });
  },
  pellet() {
    tono(760, 0.05, { tipo: 'triangle', vol: 0.18 });
    tono(1010, 0.06, { tipo: 'triangle', vol: 0.14, delay: 0.05 });
  },
  alerta() {
    tono(210, 0.05, { vol: 0.09 });
    tono(180, 0.05, { vol: 0.07, delay: 0.09 });
  },
  hunterEat() {
    tono(300, 0.06, { tipo: 'triangle', vol: 0.14, fin: 220 });
  },
  ui() {
    tono(440, 0.03, { vol: 0.1 });
  },
  // BORRAR-COMPETITIVO · sonidos de rangos y sorteo retirados para v1.0.
  locked() {
    tono(120, 0.08, { vol: 0.14 });
  },
};

// BORRAR-COMPETITIVO · el pulso de sala se retiró para v1.0.

export const audio = {
  enabled: true,

  unlock() {
    try {
      const c = build();
      if (c && c.state === 'suspended') c.resume().catch(() => {});
    } catch (err) {
      /* seguimos sin sonido */
    }
  },

  set(on) {
    this.enabled = !!on;
    if (master) master.gain.value = this.enabled ? 0.15 : 0;
  },

  toggle() {
    this.set(!this.enabled);
    return this.enabled;
  },

  play(nombre, datos) {
    if (!this.enabled) return;
    try {
      if (!build()) return;
      const fn = SONIDOS[nombre];
      if (fn) fn(datos || {});
    } catch (err) {
      /* un sonido que falla no puede parar el juego */
    }
  },
};
