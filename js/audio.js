// Sonido sintetizado en tiempo real: sin ficheros externos ni música de fondo.

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

    if (typeof ctx.createDynamicsCompressor === 'function') {
      const compresor = ctx.createDynamicsCompressor();
      compresor.threshold.value = -20;
      compresor.knee.value = 16;
      compresor.ratio.value = 4;
      compresor.attack.value = 0.004;
      compresor.release.value = 0.16;
      master.connect(compresor).connect(ctx.destination);
    } else {
      master.connect(ctx.destination);
    }

    const len = Math.floor(ctx.sampleRate * 0.24);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return ctx;
  } catch (err) {
    // Sin audio se puede jugar con normalidad.
    roto = true;
    ctx = null;
    master = null;
    return null;
  }
}

function tono(freq, dur, opts = {}) {
  const c = build();
  if (!c || !(freq > 0) || !(dur > 0)) return;

  const t0 = c.currentTime + (opts.delay || 0);
  const ataque = Math.min(0.012, dur * 0.24);
  const salida = Math.min(opts.release || 0.04, dur * 0.44);
  const volumen = Math.max(0.0001, opts.vol ?? 0.2);
  const osc = c.createOscillator();
  const gan = c.createGain();

  osc.type = opts.tipo || 'square';
  osc.frequency.setValueAtTime(freq, t0);
  if (opts.fin > 0) osc.frequency.exponentialRampToValueAtTime(opts.fin, t0 + dur);

  gan.gain.setValueAtTime(0.0001, t0);
  gan.gain.exponentialRampToValueAtTime(volumen, t0 + ataque);
  gan.gain.setValueAtTime(volumen, t0 + dur - salida);
  gan.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  osc.connect(gan).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function ruido(dur, opts = {}) {
  const c = build();
  if (!c || !noiseBuf || !(dur > 0)) return;

  const t0 = c.currentTime + (opts.delay || 0);
  const src = c.createBufferSource();
  const filtro = c.createBiquadFilter();
  const gan = c.createGain();
  const volumen = Math.max(0.0001, opts.vol ?? 0.28);

  src.buffer = noiseBuf;
  filtro.type = 'lowpass';
  filtro.frequency.setValueAtTime(opts.desde || 2400, t0);
  filtro.frequency.exponentialRampToValueAtTime(opts.hasta || 120, t0 + dur);
  gan.gain.setValueAtTime(0.0001, t0);
  gan.gain.exponentialRampToValueAtTime(volumen, t0 + Math.min(0.008, dur * 0.2));
  gan.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  src.connect(filtro).connect(gan).connect(master);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

function secuencia(frecuencias, opts = {}) {
  const { tipo = 'triangle', dur = 0.075, vol = 0.12, salto = 0.045 } = opts;
  frecuencias.forEach((freq, i) => tono(freq, dur, {
    tipo,
    vol,
    delay: i * salto,
  }));
}

const SONIDOS = {
  start() {
    tono(260, 0.085, { tipo: 'triangle', vol: 0.16, fin: 420 });
    tono(620, 0.08, { tipo: 'sine', vol: 0.08, delay: 0.045, fin: 740 });
  },
  bite({ multiplier = 1 } = {}) {
    const nivel = Math.min(5, Math.max(1, multiplier));
    const tonoBase = 300 + nivel * 62;
    tono(tonoBase, 0.065, { tipo: 'triangle', vol: 0.15, fin: tonoBase * 1.12 });
    if (nivel > 1) tono(tonoBase * 1.5, 0.045, { tipo: 'sine', vol: 0.07, delay: 0.035 });
  },
  bonus() {
    secuencia([590, 760, 980], { dur: 0.085, vol: 0.13, salto: 0.055 });
  },
  power({ kind = 'ghost' } = {}) {
    const motivos = {
      ghost: [430, 650, 880],
      slow: [520, 410, 320],
      shrink: [760, 580],
      shield: [350, 560, 820],
      double: [620, 820, 1080],
    };
    secuencia(motivos[kind] || motivos.ghost, { dur: 0.07, vol: 0.11, salto: 0.045 });
  },
  shield() {
    tono(190, 0.14, { tipo: 'triangle', vol: 0.18, fin: 360 });
    tono(680, 0.16, { tipo: 'sine', vol: 0.12, delay: 0.045, fin: 430 });
  },
  turbo() {
    tono(150, 0.055, { tipo: 'triangle', vol: 0.09, fin: 220 });
    tono(245, 0.045, { tipo: 'square', vol: 0.035, delay: 0.025 });
  },
  death() {
    ruido(0.28, { desde: 2400, hasta: 90, vol: 0.28 });
    tono(210, 0.32, { tipo: 'sawtooth', vol: 0.16, fin: 52 });
    tono(135, 0.24, { tipo: 'triangle', vol: 0.09, fin: 42, delay: 0.035 });
  },
  level() {
    secuencia([494, 622, 740, 988], { dur: 0.11, vol: 0.13, salto: 0.07 });
  },
  campaignComplete() {
    secuencia([392, 494, 587, 784, 988], { dur: 0.16, vol: 0.14, salto: 0.09 });
  },
  wall() {
    tono(135, 0.085, { tipo: 'square', vol: 0.09, fin: 78 });
    ruido(0.09, { desde: 800, hasta: 170, vol: 0.12, delay: 0.012 });
  },
  pellet() {
    secuencia([740, 990], { tipo: 'sine', dur: 0.06, vol: 0.1, salto: 0.045 });
  },
  alerta() {
    tono(210, 0.055, { vol: 0.075 });
    tono(180, 0.055, { vol: 0.06, delay: 0.095 });
  },
  hunterEat() {
    tono(295, 0.07, { tipo: 'triangle', vol: 0.11, fin: 205 });
  },
  hunterDies() {
    ruido(0.18, { desde: 1500, hasta: 260, vol: 0.15 });
    secuencia([240, 180], { tipo: 'triangle', dur: 0.1, vol: 0.1, salto: 0.055 });
  },
  combo({ multiplier = 2 } = {}) {
    const nota = 640 + Math.min(5, multiplier) * 55;
    tono(nota, 0.055, { tipo: 'sine', vol: 0.075 });
    tono(nota * 1.25, 0.05, { tipo: 'sine', vol: 0.05, delay: 0.04 });
  },
  ui() {
    tono(460, 0.028, { tipo: 'square', vol: 0.045 });
  },
  // BORRAR-COMPETITIVO · sonidos de rangos y sorteo retirados para v1.0.
  locked() {
    tono(120, 0.075, { tipo: 'triangle', vol: 0.09, fin: 95 });
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
      /* El juego continúa en silencio. */
    }
  },

  set(on) {
    this.enabled = !!on;
    if (!master || !ctx) return;
    const valor = this.enabled ? 0.15 : 0;
    try {
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(valor, ctx.currentTime, 0.025);
    } catch (err) {
      master.gain.value = valor;
    }
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
      /* Un sonido que falla no puede detener la partida. */
    }
  },
};
