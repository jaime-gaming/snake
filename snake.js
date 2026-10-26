/* snake — un solo fichero, sin módulos. generado por tools/build.mjs (2026-10-26 · v16).
   no lo edites a mano: cambia js/*.js y vuelve a ejecutar node tools/build.mjs */
(function () {
'use strict';
const modulos = { grid: {}, levels: {}, audio: {}, input: {}, engine: {}, i18n: {}, main: {} };

// ---- grid ----
(function (modulo) {
'use strict';
// utilidades de rejilla que usan el motor y el piloto automático

const K = (x, y) => y * 4096 + x;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function inBounds(x, y, cols, rows) {
  return x >= 0 && y >= 0 && x < cols && y < rows;
}

// primer paso (en celdas, signo) desde start hasta goal esquivando blocked
function bfsStep({ start, goal, blocked, cols, rows, wrap }) {
  const startK = K(start.x, start.y);
  const goalK = K(goal.x, goal.y);
  if (startK === goalK) return null;

  const prev = new Map();
  const seen = new Set([startK]);
  const queue = [{ x: start.x, y: start.y }];
  let head = 0;

  while (head < queue.length) {
    const cell = queue[head++];
    const vecinos = [];
    for (const [dx, dy] of DIRS) {
      let nx = cell.x + dx;
      let ny = cell.y + dy;
      if (wrap) {
        nx = (nx + cols) % cols;
        ny = (ny + rows) % rows;
      } else if (!inBounds(nx, ny, cols, rows)) {
        continue;
      }
      const nk = K(nx, ny);
      if (blocked.has(nk) && nk !== goalK) continue;
      vecinos.push({ nx, ny, nk });
    }
    for (const { nx, ny, nk } of vecinos) {
      if (seen.has(nk)) continue;
      seen.add(nk);
      prev.set(nk, { x: cell.x, y: cell.y });

      if (nk === goalK) {
        let puntero = nk;
        for (let guarda = 0; guarda < cols * rows + 2; guarda++) {
          const anterior = prev.get(puntero);
          if (!anterior) return null;
          if (K(anterior.x, anterior.y) === startK) {
            const celda = { x: puntero % 4096, y: Math.floor(puntero / 4096) };
            return { x: Math.sign(celda.x - start.x), y: Math.sign(celda.y - start.y) };
          }
          puntero = K(anterior.x, anterior.y);
        }
        return null;
      }
      queue.push({ x: nx, y: ny });
    }
  }
  return null;
}

  Object.assign(modulo, { K, DIRS, inBounds, bfsStep });
})(modulos['grid']);

// ---- levels ----
(function (modulo) {
'use strict';
// modos y niveles. rejilla de 20x20, muros como pares [x, y]

const COLS = 20;
const ROWS = 20;

const rect = (x, y, w, h) => {
  const out = [];
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) out.push([x + i, y + j]);
  return out;
};
const hline = (x, y, len) => rect(x, y, len, 1);
const vline = (x, y, len) => rect(x, y, 1, len);
const ring = (x, y, w, h) => {
  const out = [];
  for (let i = 0; i < w; i++) {
    out.push([x + i, y]);
    out.push([x + i, y + h - 1]);
  }
  for (let j = 1; j < h - 1; j++) {
    out.push([x, y + j]);
    out.push([x + w - 1, y + j]);
  }
  return out;
};
const holes = (cells, list) => cells.filter(([x, y]) => !list.some(([hx, hy]) => hx === x && hy === y));
const diagonal = (x, y, len, dir = 1) => {
  const out = [];
  for (let i = 0; i < len; i++) out.push([x + i, y + i * dir]);
  return out;
};
const dots = (...celdas) => celdas;
// un corte deja hueco en un muro: es lo que convierte una barrera en un paso
const cut = (...celdas) => celdas;
const slit = (x, y, alto) => vline(x, y, alto);


// grupos del menú: cada uno es una subpágina con sus modos
// BORRAR-COMPETITIVO · modo retirado en la preparación de v1.0.
const GROUPS = [
  { name: 'progreso', tag: 'rutas con obstáculos', modes: ['campaign'] },
  { name: 'infinitos', tag: 'puntuación sin final', modes: ['classic', 'frenzy', 'hunter'] },
];

const MODE_ORDER = GROUPS.flatMap((g) => g.modes);

const POWER_POOLS = {
  campaign: ['ghost', 'slow', 'shrink'],
  classic: ['ghost', 'slow', 'shrink', 'double'],
  frenzy: ['slow', 'shield', 'double'],
  hunter: ['ghost', 'shrink', 'shield'],
};

const base = {
  cols: COLS,
  rows: ROWS,
  walls: [],
  bonusEvery: 5,
  powerEvery: 7,
  chainWindow: 3200,
};

const MODES = {
  classic: {
    ...base,
    id: 'classic',
    name: 'CLÁSICO',
    tag: 'cada fruta acelera · muros al llegar a 30 frutas',
    startSpeed: 142,
    minSpeed: 82,
    accelPerFood: 1.5,
    wallFrom: 30,
    wallEvery: 6,
    wallMax: 18,
    powerPool: POWER_POOLS.classic,
  },
  frenzy: {
    ...base,
    id: 'frenzy',
    name: 'FRENESÍ',
    tag: 'bordes abiertos y la velocidad sube sola',
    startSpeed: 132,
    minSpeed: 68,
    accelPerFood: 0.55,
    rampPerSec: 0.28,
    wrap: true,
    bonusEvery: 4,
    powerEvery: 6,
    powerPool: POWER_POOLS.frenzy,
  },
  hunter: {
    ...base,
    id: 'hunter',
    name: 'CAZADOR',
    tag: 'una serpiente roja come puntos azules y crece',
    startSpeed: 140,
    minSpeed: 86,
    accelPerFood: 1.2,
    hunter: true,
    hunterPellets: 2,
    hunterCap: 16,
    hunterSight: 4,
    bonusEvery: 6,
    powerEvery: 6,
    powerPool: POWER_POOLS.hunter,
  },

};

// campaña: 20 niveles. empieza lento y acaba a 104 ms por casilla
const level = (name, goal, speed, walls, extra = {}) => {
  const { cut: cortes = [], ...resto } = extra;
  const fuera = new Set(cortes.map(([x, y]) => `${x},${y}`));
  const vistos = new Set();
  const limpios = walls.filter(([x, y]) => {
    const k = `${x},${y}`;
    if (fuera.has(k) || vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });
  return {
    name,
    goal,
    speed,
    walls: limpios,
    minSpeed: Math.max(72, speed - 32),
    accelPerFood: 1.2,
    bonusEvery: 4,
    powerEvery: 6,
    powerPool: POWER_POOLS.campaign,
    chainWindow: 3400,
    ...resto,
  };
};

const nivel = (i, name, goal, walls, extra = {}) =>
  level(name, goal, Math.round(155 - i * 2.6), walls, {
    accelPerFood: Number((1.2 + i * 0.055).toFixed(2)),
    chainWindow: Math.max(2600, 3400 - i * 32),
    ...extra,
  });

const LEVELS = [
  nivel(0, 'LLANO', 4, []),

  nivel(1, 'CRUZ', 5, [...hline(9, 5, 8), ...vline(13, 2, 3), ...vline(13, 6, 4)]),

  nivel(2, 'PILARES', 5, [
    ...rect(4, 4, 2, 2),
    ...rect(14, 4, 2, 2),
    ...rect(4, 14, 2, 2),
    ...rect(14, 14, 2, 2),
  ]),

  nivel(3, 'ANILLO', 6, [
    ...holes(ring(6, 4, 8, 12), [[6, 9], [6, 10], [13, 9], [13, 10]]),
  ]),

  nivel(4, 'ZIGZAG', 7, [
    ...hline(0, 4, 13),
    ...hline(7, 8, 13),
    ...hline(0, 12, 13),
    ...hline(7, 16, 13),
  ]),

  nivel(5, 'COLUMNAS', 7, [
    ...vline(4, 0, 6),
    ...vline(9, 0, 6),
    ...vline(14, 0, 6),
    ...vline(4, 14, 6),
    ...vline(9, 14, 6),
    ...vline(14, 14, 6),
  ]),

  nivel(6, 'DOBLE ANILLO', 8, [
    ...holes(ring(2, 2, 16, 16), [
      [2, 9], [2, 10], [17, 9], [17, 10],
      [9, 2], [10, 2], [9, 17], [10, 17],
    ]),
    ...holes(ring(7, 7, 6, 6), [[7, 9], [7, 10], [12, 9], [12, 10]]),
  ]),

  nivel(7, 'REJILLA', 8, [
    ...hline(1, 3, 3),
    ...hline(9, 3, 3),
    ...hline(17, 3, 3),
    ...hline(5, 7, 3),
    ...hline(13, 7, 3),
    ...hline(1, 11, 3),
    ...hline(9, 11, 3),
    ...hline(17, 11, 3),
    ...hline(5, 15, 3),
    ...hline(13, 15, 3),
  ]),

  nivel(8, 'JAULA', 9, [
    ...holes(ring(3, 3, 14, 14), [
      [3, 9], [3, 10], [16, 9], [16, 10],
      [6, 3], [7, 3], [12, 3], [13, 3],
      [6, 16], [7, 16], [12, 16], [13, 16],
    ]),
  ]),

  nivel(9, 'ASPAS', 9, [
    ...holes(diagonal(3, 5, 5, 1), [[5, 7]]),
    ...holes(diagonal(12, 5, 5, 1), [[14, 7]]),
    ...holes(diagonal(3, 14, 4, -1), [[4, 13]]),
    ...holes(diagonal(12, 14, 4, -1), [[13, 13]]),
  ]),

  nivel(10, 'CUATRO ESQUINAS', 10, [
    ...rect(0, 0, 5, 5),
    ...rect(15, 0, 5, 5),
    ...rect(0, 15, 5, 5),
    ...rect(15, 15, 5, 5),
    ...rect(9, 5, 2, 2),
    ...rect(9, 13, 2, 2),
  ]),

  nivel(11, 'CRUZ HUECA', 10, [...rect(8, 0, 4, 20), ...rect(0, 8, 20, 4)], {
    cut: [
      ...hline(8, 4, 4),
      ...hline(8, 16, 4),
      ...vline(4, 8, 4),
      ...vline(15, 8, 4),
    ],
  }),

  nivel(12, 'REJILLA DOBLE', 11, [
    ...hline(3, 4, 14),
    ...hline(3, 9, 14),
    ...hline(3, 14, 14),
    ...vline(3, 4, 11),
    ...vline(9, 4, 11),
    ...vline(16, 4, 11),
  ], {
    cut: [
      [5, 4], [5, 9], [5, 14],
      [14, 4], [14, 9], [14, 14],
      [9, 6], [9, 11],
    ],
  }),

  nivel(13, 'PASILLO', 11, [
    ...rect(0, 6, 20, 2),
    ...rect(0, 13, 20, 2),
    ...dots([3, 10], [16, 10]),
  ], {
    cut: [
      [4, 6], [4, 7],
      [14, 6], [14, 7],
      [7, 13], [7, 14],
      [16, 13], [16, 14],
    ],
  }),

  nivel(14, 'PUAS', 12, [
    ...rect(4, 4, 3, 3),
    ...rect(13, 4, 3, 3),
    ...rect(4, 13, 3, 3),
    ...rect(13, 13, 3, 3),
    ...vline(9, 2, 5),
    ...vline(10, 14, 5),
    ...dots([9, 9], [10, 10], [9, 10], [10, 9]),
  ]),

  nivel(15, 'ESCALERA', 12, [
    ...hline(2, 4, 6),
    ...hline(8, 7, 6),
    ...hline(2, 10, 6),
    ...hline(8, 13, 6),
    ...vline(2, 4, 10),
    ...vline(13, 4, 10),
    ...holes(vline(7, 4, 4), [[7, 6]]),
    ...holes(vline(8, 10, 4), [[8, 12]]),
  ]),

  nivel(16, 'DIENTES', 13, [
    ...vline(5, 0, 7),
    ...vline(5, 10, 7),
    ...vline(10, 3, 7),
    ...vline(10, 13, 5),
    ...vline(15, 0, 7),
    ...vline(15, 10, 7),
    ...holes(ring(6, 6, 8, 8), [
      [6, 9], [6, 10], [13, 9], [13, 10],
      [9, 6], [10, 6], [9, 13], [10, 13],
    ]),
  ]),

  nivel(17, 'LABERINTO', 13, [
    ...vline(3, 0, 16),
    ...vline(7, 4, 16),
    ...vline(11, 0, 16),
    ...vline(15, 4, 16),
  ], {
    cut: [
      [3, 3], [3, 12],
      [7, 7], [7, 17],
      [11, 5], [11, 15],
      [15, 8], [15, 18],
    ],
  }),

  nivel(18, 'DOS JAULAS', 14, [
    ...ring(2, 2, 7, 7),
    ...ring(11, 11, 7, 7),
    ...ring(12, 2, 6, 6),
    ...ring(2, 12, 6, 6),
  ], {
    cut: [
      [5, 2], [6, 2], [5, 8], [6, 8], [2, 5], [3, 5], [8, 5], [7, 5],
      [14, 11], [15, 11], [14, 17], [15, 17], [11, 14], [12, 14], [17, 14], [17, 13],
      [14, 2], [15, 2], [14, 7], [15, 7], [12, 4], [13, 4], [17, 4], [17, 5],
      [4, 12], [5, 12], [4, 17], [5, 17], [2, 14], [3, 14], [7, 14], [7, 15],
    ],
  }),

  nivel(19, 'FINAL', 14, [
    ...rect(0, 0, 4, 4),
    ...rect(16, 0, 4, 4),
    ...rect(0, 16, 4, 4),
    ...rect(16, 16, 4, 4),
    ...rect(7, 7, 2, 2),
    ...rect(11, 7, 2, 2),
    ...rect(7, 11, 2, 2),
    ...rect(11, 11, 2, 2),
    ...hline(8, 2, 4),
    ...hline(8, 17, 4),
    ...holes(vline(2, 7, 6), [[2, 9], [2, 10]]),
    ...holes(vline(17, 7, 6), [[17, 9], [17, 10]]),
  ]),
];


// BORRAR-COMPETITIVO · los rangos, arenas y modificadores se retiraron para v1.0.

  Object.assign(modulo, { COLS, ROWS, GROUPS, MODE_ORDER, POWER_POOLS, MODES, LEVELS });
})(modulos['levels']);

// ---- audio ----
(function (modulo) {
'use strict';
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

const audio = {
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

  Object.assign(modulo, { audio });
})(modulos['audio']);

// ---- input ----
(function (modulo) {
'use strict';
// teclado, gestos y mando. habla en acciones, no en teclas

const TECLAS = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  KeyW: 'up',
  KeyS: 'down',
  KeyA: 'left',
  KeyD: 'right',
  Enter: 'confirm',
  NumpadEnter: 'confirm',
  Space: 'turbo',
  ShiftLeft: 'turbo',
  ShiftRight: 'turbo',
  Escape: 'back',
  KeyP: 'pause',
  KeyR: 'restart',
  KeyM: 'mute',
};

const BOTONES = { 12: 'up', 13: 'down', 14: 'left', 15: 'right' };

function attachInput({ stage, actions, canTurbo = () => true }) {
  const fire = (accion) => actions(accion);
  const turboActivo = () => typeof canTurbo === 'function' && canTurbo();

  window.addEventListener('keydown', (e) => {
    if (e.target && typeof e.target.closest === 'function'
      && e.target.closest('input, select, textarea, [contenteditable="true"]')) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const accion = TECLAS[e.code];
    if (!accion) return;
    if (e.code === 'Space' || e.code === 'Enter' || e.code.startsWith('Arrow')) e.preventDefault();
    if (e.repeat) return;
    if (accion === 'turbo' && !turboActivo()) return;
    fire(accion === 'turbo' ? 'turboOn' : accion);
  });

  window.addEventListener('keyup', (e) => {
    if (TECLAS[e.code] === 'turbo') fire('turboOff');
  });

  // gestos sobre el tablero
  let x0 = 0;
  let y0 = 0;
  let activo = false;

  stage.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button, #overlay')) return;
    // al tocar el tablero, el foco vuelve a la página: las teclas llegan siempre
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    if (typeof window.focus === 'function') window.focus();
    activo = true;
    x0 = e.clientX;
    y0 = e.clientY;
  });

  stage.addEventListener('pointerup', (e) => {
    if (!activo) return;
    activo = false;
    const dx = e.clientX - x0;
    const dy = e.clientY - y0;
    if (Math.abs(dx) < 18 && Math.abs(dy) < 18) {
      if (turboActivo()) fire('tap');
      return;
    }
    if (Math.abs(dx) > Math.abs(dy)) fire(dx > 0 ? 'right' : 'left');
    else fire(dy > 0 ? 'down' : 'up');
  });

  stage.addEventListener('pointercancel', () => {
    activo = false;
  });

  // mando: estado por frame, sin eventos
  let previo = {};
  let conectado = false;

  function leerMando() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = pads && pads[0];
    const actual = {};

    if (pad) {
      if (!conectado) {
        conectado = true;
        fire('padConectado');
      }
      const UMBRAL = 0.55;
      const ejeX = pad.axes[0] || 0;
      const ejeY = pad.axes[1] || 0;
      if (ejeX < -UMBRAL) actual.left = true;
      if (ejeX > UMBRAL) actual.right = true;
      if (ejeY < -UMBRAL) actual.up = true;
      if (ejeY > UMBRAL) actual.down = true;
      for (const [indice, nombre] of Object.entries(BOTONES)) {
        const boton = pad.buttons[indice];
        if (boton && (boton.pressed || boton.value > 0.5)) actual[nombre] = true;
      }
      if (turboActivo()) {
        [0, 1].forEach((n) => {
          const boton = pad.buttons[n];
          if (boton && (boton.pressed || boton.value > 0.5)) actual.turbo = true;
        });
      }
      [3, 9].forEach((n) => {
        const boton = pad.buttons[n];
        if (boton && (boton.pressed || boton.value > 0.5)) actual.aux = true;
      });
    } else if (conectado) {
      conectado = false;
    }

    for (const nombre of ['up', 'down', 'left', 'right']) {
      if (actual[nombre] && !previo[nombre]) fire(nombre);
    }
    if (actual.turbo && !previo.turbo) fire('turboOn');
    if (!actual.turbo && previo.turbo) fire('turboOff');
    if (actual.aux && !previo.aux) fire('pause');

    previo = actual;
    requestAnimationFrame(leerMando);
  }

  if (navigator.getGamepads) requestAnimationFrame(leerMando);
}

  Object.assign(modulo, { attachInput });
})(modulos['input']);

// ---- engine ----
(function (modulo) {
'use strict';
const { K, DIRS, bfsStep } = modulos['grid'];

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rand = (n) => Math.floor(Math.random() * n);

const POWER_INFO = {
  ghost: { label: 'fantasma', ms: 5200 },
  slow: { label: 'lento', ms: 6000 },
  shrink: { label: 'recorte', ms: 0 },
  shield: { label: 'escudo', ms: 10000 },
  double: { label: 'doble', ms: 7000 },
};

class Game {
  constructor(cfg, onEvent = () => {}) {
    this.cfg = cfg;
    this.onEvent = onEvent;
    this.cols = cfg.cols;
    this.rows = cfg.rows;
    this.walls = (cfg.walls || []).slice();
    this.reset();
  }

  emit(type, data) {
    this.onEvent(type, data);
  }

  reset() {
    const cfg = this.cfg;
    this.wallSet = new Set(this.walls.map(([x, y]) => K(x, y)));
    const start = this.findStart();
    this.body = [];
    for (let i = 0; i < 4; i++) {
      this.body.push({ x: start.x - start.dir.x * i, y: start.y - start.dir.y * i });
    }
    this.prevBody = this.body.map((p) => ({ ...p }));
    this.dir = { ...start.dir };
    this.queue = [];
    this.grow = 0;
    this.speed = cfg.startSpeed;
    this.acc = 0;
    this.state = 'ready';
    this.savedState = 'ready';
    this.score = 0;
    this.fruits = 0;
    this.chain = 0;
    this.chainTimer = 0;
    this.chainWindow = cfg.chainWindow || 3200;
    this.hitStop = 0;
    this.crash = null;
    this.wallTicks = 0;
    this.fx = { ghost: 0, slow: 0, shield: 0, double: 0 };
    this.bonus = null;
    this.power = null;
    this.hunter = null;
    this.hunterTick = 0;
    this.pellets = [];
    this.reveal = 0;
    this.chomp = 0;
    this.pendingWalls = [];
    this.turbo = false;
    this.time = 0;
    this.shake = 0;
    this.flash = 0;
    this.particles = [];
    this.food = null;
    this.spawnFood();
    if (cfg.hunter) {
      this.placeHunter();
      this.hunter.recarga = 0;
      this.hunter.movido = 0;
      this.hunter.paso = 0;
      const cuantos = Math.max(2, cfg.hunterPellets || 2);
      for (let i = 0; i < cuantos; i++) this.spawnPellet();
    }
  }

  findStart() {
    const free = (x, y) =>
      x >= 0 && y >= 0 && x < this.cols && y < this.rows && !this.wallSet.has(K(x, y));
    const ring = (n, c) => {
      const out = [];
      for (let d = 0; d < n; d++) {
        if (c - d >= 0) out.push(c - d);
        if (d > 0 && c + d < n) out.push(c + d);
      }
      return out;
    };
    const rowOrder = ring(this.rows, Math.floor(this.rows / 2));
    const colOrder = ring(this.cols, Math.floor(this.cols / 2));

    for (const y of rowOrder) {
      for (let x = 0; x + 4 < this.cols; x++) {
        if (free(x, y) && free(x + 1, y) && free(x + 2, y) && free(x + 3, y) && free(x + 4, y)) {
          return { x: x + 3, y, dir: { x: 1, y: 0 } };
        }
      }
    }
    for (const x of colOrder) {
      for (let y = 0; y + 4 < this.rows; y++) {
        if (free(x, y) && free(x, y + 1) && free(x, y + 2) && free(x, y + 3) && free(x, y + 4)) {
          return { x, y: y + 3, dir: { x: 0, y: -1 } };
        }
      }
    }
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        if (free(x, y)) return { x, y, dir: { x: 1, y: 0 } };
      }
    }
    return { x: 4, y: Math.floor(this.rows / 2), dir: { x: 1, y: 0 } };
  }

  get multiplier() {
    return this.cfg.scoring === false ? 1 : Math.min(5, 1 + Math.floor(this.chain / 2));
  }

  get ghosting() {
    return this.fx.ghost > 0;
  }

  get scoreFactor() {
    if (this.cfg.scoring === false) return 0;
    return this.fx.double > 0 ? 2 : 1;
  }

  interval() {
    const slow = this.fx.slow > 0 ? 1.5 : 1;
    return Math.max(42, this.speed * (this.turbo ? 0.68 : 1) * slow);
  }

  setDirection(dx, dy) {
    if (this.state === 'dead' || this.state === 'cleared' || this.state === 'paused') return;
    if (this.state === 'ready') {
      this.state = 'running';
      this.emit('start');
    }
    const last = this.queue.length ? this.queue[this.queue.length - 1] : this.dir;
    if (dx === -last.x && dy === -last.y) return;
    if (dx === last.x && dy === last.y) return;
    if (this.queue.length < 2) this.queue.push({ x: dx, y: dy });
  }

  setTurbo(on) {
    if (this.state !== 'running' || this.turbo === on) return;
    this.turbo = on;
    if (on) this.emit('turbo');
  }

  toggleTurbo() {
    this.setTurbo(!this.turbo);
  }

  pause() {
    if (this.state === 'running' || this.state === 'ready') {
      this.savedState = this.state;
      this.state = 'paused';
      this.turbo = false;
    }
  }

  resume() {
    if (this.state === 'paused') this.state = this.savedState;
  }

  update(dtRaw) {
    const dt = Math.min(dtRaw, 120);
    this.time += dt;
    // golpe congelado: medio segundo de impacto antes de que corran las partículas
    if (this.hitStop > 0) {
      this.hitStop = Math.max(0, this.hitStop - dt);
      this.updateFx(dt * 0.25);
      return;
    }
    for (const k of ['ghost', 'slow', 'shield', 'double']) {
      if (this.fx[k] > 0) this.fx[k] = Math.max(0, this.fx[k] - dt);
    }
    if (this.state === 'running') {
      const cfg = this.cfg;
      if (cfg.rampPerSec) {
        this.speed = Math.max(cfg.minSpeed, this.speed - (cfg.rampPerSec * dt) / 1000);
      }
      if (this.chainTimer > 0) {
        this.chainTimer -= dt;
        if (this.chainTimer <= 0) {
          this.chainTimer = 0;
          this.chain = 0;
        }
      }
      if (this.bonus) {
        this.bonus.ttl -= dt;
        if (this.bonus.ttl <= 0) this.bonus = null;
      }
      if (this.power) {
        this.power.ttl -= dt;
        if (this.power.ttl <= 0) this.power = null;
      }
      this.acc += dt;
      let guard = 0;
      while (this.state === 'running' && this.acc >= this.interval() && guard++ < 8) {
        this.acc -= this.interval();
        this.step();
      }
    }
    this.updateFx(dt);
  }

  updateFx(dt) {
    const k = dt / 1000;
    if (this.reveal < 1) this.reveal = Math.min(1, this.reveal + dt / 1000);
    if (this.hunter && this.hunter.recarga > 0) {
      this.hunter.recarga -= dt;
      if (this.hunter.recarga <= 0) this.renacerCazador();
    }
    if (this.chomp > 0) this.chomp = Math.max(0, this.chomp - dt / 150);
    for (let i = this.pendingWalls.length - 1; i >= 0; i--) {
      const w = this.pendingWalls[i];
      w.t += dt;
      if (w.t >= w.dur) {
        this.pendingWalls.splice(i, 1);
        this.levantarMuro(w);
      }
    }
    if (this.crash) {
      this.crash.t = Math.min(1600, this.crash.t + dt);
      // la serpiente se deshace de la cabeza a la cola, un anillo cada 18 ms
      const objetivo = Math.min(this.body.length, Math.floor(this.crash.t / 18));
      while (this.crash.popped < objetivo) {
        const c = this.body[this.crash.popped];
        this.crash.popped++;
        if (!c) break;
        this.burst(c.x + 0.5, c.y + 0.5, 2, '#ffffff', 5);
      }
    }
    this.shake = Math.max(0, this.shake - dt * 0.05);
    this.flash = Math.max(0, this.flash - dt * 0.004);
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * k;
      p.y += p.vy * k;
      p.vx *= 0.94;
      p.vy *= 0.94;
      p.life -= dt;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
  }

  step() {
    const cfg = this.cfg;
    const ghost = this.ghosting;
    if (this.queue.length) {
      const d = this.queue.shift();
      if (!(d.x === -this.dir.x && d.y === -this.dir.y)) this.dir = d;
    }

    this.prevBody = this.body.map((s) => ({ ...s }));

    let hx = this.body[0].x + this.dir.x;
    let hy = this.body[0].y + this.dir.y;

    if (cfg.wrap || ghost) {
      hx = (hx + this.cols) % this.cols;
      hy = (hy + this.rows) % this.rows;
    } else if (hx < 0 || hy < 0 || hx >= this.cols || hy >= this.rows) {
      return this.die('borde', clamp(hx, 0, this.cols - 1), clamp(hy, 0, this.rows - 1));
    }

    if (!ghost && this.wallSet.has(K(hx, hy))) return this.die('muro', hx, hy);
    // el cuerpo del cazador no te mata: le muerdes el anillo y sigues.
    // sólo su cabeza puede comerte (y sólo si cae sobre la tuya)
    if (!ghost && this.hunter) {
      const golpe = this.hunter.body.findIndex((c) => c.x === hx && c.y === hy);
      if (golpe === 0) return this.die('cazador', hx, hy);
      if (golpe > 0) {
        this.hunter.body.splice(golpe, 1);
        this.hunter.prev.splice(golpe, 1);
        this.burst(hx + 0.5, hy + 0.5, 10, '#c21414', 5);
        this.score += 20 * this.scoreFactor;
        this.shake = Math.max(this.shake, 3);
        this.chomp = 1;
        this.emit('bite', { x: hx, y: hy });
      }
    }

    const eats = this.food && hx === this.food.x && hy === this.food.y;
    const takesBonus = this.bonus && hx === this.bonus.x && hy === this.bonus.y;
    const takesPower = this.power && hx === this.power.x && hy === this.power.y;
    const willGrow = this.grow > 0 || eats || takesBonus;

    // con el fantasma puesto atraviesas también tu propio cuerpo
    if (!ghost) {
      for (let i = 0; i < this.body.length; i++) {
        if (!willGrow && i === this.body.length - 1) continue;
        if (this.body[i].x === hx && this.body[i].y === hy) return this.die('cola', hx, hy);
      }
    }

    this.body.unshift({ x: hx, y: hy });
    if (this.grow > 0) this.grow--;
    else this.body.pop();

    if (eats) this.eatFood();
    if (takesBonus) this.eatBonus();
    if (takesPower) this.takePower();
    if (this.cfg.hunter) {
      this.robaPunto();
      this.moveHunter();
    }
  }

  eatFood() {
    const cfg = this.cfg;
    const food = this.food;
    this.fruits++;
    this.grow += 1;
    const rapido = this.chainTimer > this.chainWindow * 0.62;
    this.chain = Math.min(this.chain + 1, 30);
    this.chainTimer = this.chainWindow;
    this.score += (10 * this.multiplier + (rapido ? 5 * this.multiplier : 0)) * this.scoreFactor;
    this.speed = Math.max(cfg.minSpeed, this.speed - (cfg.accelPerFood || 0));
    this.shake = 2.6;
    this.chomp = 1;
    const sube = this.multiplier > 1 && this.chain % 2 === 0;
    if (sube) {
      this.flash = Math.max(this.flash, 0.45);
      this.emit('combo', { multiplier: this.multiplier });
    }
    this.burst(food.x + 0.5, food.y + 0.5, sube ? 16 : 10, '#ff2b2b', 7);
    // clásico: pasada la mitad de la partida empiezan a salir muros sueltos
    if (cfg.wallFrom && this.fruits >= cfg.wallFrom && cfg.wallEvery &&
      this.fruits % cfg.wallEvery === 0 && this.walls.length < (cfg.wallMax || 999)) {
      this.raiseWall();
    }
    this.emit('eat', { chain: this.chain, multiplier: this.multiplier });
    this.spawnFood();
    if (cfg.bonusEvery && this.fruits % cfg.bonusEvery === 0) this.spawnBonus();
    if (cfg.powerEvery && this.fruits % cfg.powerEvery === 0) this.spawnPower();
    if (cfg.goal && this.fruits >= cfg.goal) {
      this.state = 'cleared';
      this.emit('clear', { fruits: this.fruits, score: this.score });
    }
  }

  // los puntos azules también son para ti: quitaselo y el cazador no crece
  robaPunto() {
    const indice = this.pellets.findIndex((p) => p.x === this.body[0].x && p.y === this.body[0].y);
    if (indice < 0) return;
    this.pellets.splice(indice, 1);
    this.grow += 1;
    this.score += 15 * this.multiplier * this.scoreFactor;
    this.chain = Math.min(this.chain + 1, 30);
    this.chainTimer = this.chainWindow;
    this.shake = 3;
    this.chomp = 1;
    this.burst(this.body[0].x + 0.5, this.body[0].y + 0.5, 12, '#3d7bff', 6);
    this.spawnPellet();
    this.emit('pellet', { score: this.score });
  }

  eatBonus() {
    const b = this.bonus;
    this.bonus = null;
    this.grow += 2;
    this.chain = Math.min(this.chain + 2, 30);
    this.chainTimer = this.chainWindow;
    this.score += 50 * this.multiplier * this.scoreFactor;
    this.shake = 5;
    this.flash = Math.max(this.flash, 0.24);
    this.burst(b.x + 0.5, b.y + 0.5, 18, '#ffffff', 9);
    if (this.cfg.hunter) this.placeHunter();
    this.emit('bonus', { score: this.score });
  }

  takePower() {
    const p = this.power;
    this.power = null;
    this.shake = 4;
    this.flash = Math.max(this.flash, 0.18);
    this.burst(p.x + 0.5, p.y + 0.5, 14, '#ffffff', 8);
    if (p.kind === 'ghost') {
      this.fx.ghost = POWER_INFO.ghost.ms;
    } else if (p.kind === 'slow') {
      this.fx.slow = POWER_INFO.slow.ms;
    } else if (p.kind === 'shield') {
      this.fx.shield = POWER_INFO.shield.ms;
    } else if (p.kind === 'double') {
      this.fx.double = POWER_INFO.double.ms;
    } else {
      const cut = Math.min(5, Math.max(0, this.body.length - 3));
      if (cut > 0) this.body.splice(this.body.length - cut, cut);
      this.score += 30 * this.scoreFactor;
    }
    this.emit('power', { kind: p.kind, label: POWER_INFO[p.kind].label });
  }

  // BORRAR-COMPETITIVO · la reaparición con penalización se retiró para v1.0.

  die(reason, x, y) {
    if (this.state !== 'running') return;
    const impactox = x ?? this.body[0].x;
    const impactoY = y ?? this.body[0].y;
    if (this.fx.shield > 0) {
      this.fx.shield = 0;
      this.fx.ghost = Math.max(this.fx.ghost, Math.max(250, this.interval() * 2));
      this.shake = Math.max(this.shake, 4);
      this.flash = Math.max(this.flash, 0.65);
      this.burst(impactox + 0.5, impactoY + 0.5, 16, '#b9f4ff', 7);
      this.emit('shield', { reason, x: impactox, y: impactoY });
      return false;
    }
    this.state = 'dead';
    this.turbo = false;
    this.shake = 11;
    this.flash = 0.8;
    this.hitStop = 90;
    this.crash = { x: impactox, y: impactoY, t: 0, reason, popped: 0 };
    this.burst(impactox + 0.5, impactoY + 0.5, 22, '#ffffff', 10);
    this.emit('die', { reason, score: this.score, fruits: this.fruits });
  }

  blockedSet({ omitTail = false, walls = true, hunter = true } = {}) {
    const set = new Set();
    if (walls) for (const k of this.wallSet) set.add(k);
    const end = omitTail ? this.body.length - 1 : this.body.length;
    for (let i = 0; i < end; i++) set.add(K(this.body[i].x, this.body[i].y));
    if (hunter && this.hunter) {
      for (const p of this.hunter.body) set.add(K(p.x, p.y));
    }
    return set;
  }

  // hueco libre alcanzable desde una casilla (con tope para no gastar)
  spaceFrom(celda, bloqueado, tope = 260) {
    const visto = new Set([K(celda.x, celda.y)]);
    const cola = [celda];
    let cabeza = 0;
    while (cabeza < cola.length && visto.size < tope) {
      const c = cola[cabeza++];
      for (const [dx, dy] of DIRS) {
        const nx = c.x + dx;
        const ny = c.y + dy;
        if (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows) continue;
        const k = K(nx, ny);
        if (visto.has(k) || bloqueado.has(k)) continue;
        visto.add(k);
        cola.push({ x: nx, y: ny });
      }
    }
    return visto.size;
  }

  // piloto automático: una demo clara de cada modo en los menús
  botTurn() {
    if (this.state !== 'ready' && this.state !== 'running') return;
    const cabeza = this.body[0];
    const wrap = !!this.cfg.wrap || this.ghosting;
    const ocupado = this.blockedSet({ omitTail: true });
    const haciaComida = this.food
      ? bfsStep({
        start: cabeza,
        goal: this.food,
        blocked: ocupado,
        cols: this.cols,
        rows: this.rows,
        wrap,
      })
      : null;

    // memoria corta: no dar vueltas sobre las mismas casillas
    if (!this.botTrail) this.botTrail = new Map();
    for (const [k, v] of this.botTrail) this.botTrail.set(k, v - 1);
    this.botTrail.set(K(cabeza.x, cabeza.y), 14);

    let mejor = null;
    let mejorPunto = -Infinity;
    const movimientos = [];

    for (const [dx, dy] of DIRS) {
      if (dx === -this.dir.x && dy === -this.dir.y) continue;
      let nx = cabeza.x + dx;
      let ny = cabeza.y + dy;
      if (wrap) {
        nx = (nx + this.cols) % this.cols;
        ny = (ny + this.rows) % this.rows;
      } else if (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows) {
        continue;
      }
      if (ocupado.has(K(nx, ny))) {
        continue;
      }
      const destino = { x: nx, y: ny };

      let puntos = 0;
      if (haciaComida && dx === haciaComida.x && dy === haciaComida.y) puntos += 100;
      if (this.food) {
        puntos -= (Math.abs(destino.x - this.food.x) + Math.abs(destino.y - this.food.y)) * 0.6;
      }
      // aire: no meterse en un callejón sin salida
      const espacio = this.spaceFrom(destino, ocupado);
      puntos += Math.min(espacio, 120) * 1.1;
      if (espacio <= this.body.length + 1) puntos -= 900;
      // el cazador: cuanto más lejos, mejor
      if (this.hunter) {
        const jefe = this.hunter.body[0];
        puntos += Math.min(20, Math.abs(destino.x - jefe.x) + Math.abs(destino.y - jefe.y)) * 1.5;
      }
      const visto = this.botTrail.get(K(nx, ny));
      if (visto > 0) puntos -= visto * 7;

      const movimiento = { dx, dy, puntos };
      movimientos.push(movimiento);
      if (puntos > mejorPunto) {
        mejorPunto = puntos;
        mejor = movimiento;
      }
    }

    if (mejor) {
      this.setDirection(mejor.dx, mejor.dy);
      return;
    }
    // sin salida (o choque sin rumbo peligroso): cualquier casilla libre
    for (const [dx, dy] of DIRS) {
      const nx = cabeza.x + dx;
      const ny = cabeza.y + dy;
      if (!wrap && (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows)) continue;
      if (ocupado.has(K((nx + this.cols) % this.cols, (ny + this.rows) % this.rows))) continue;
      this.setDirection(dx, dy);
      return;
    }
  }

  // casillas libres a las que se puede llegar desde la cabeza: la comida nunca cae en un hueco cerrado
  reachableFree() {
    const muro = new Set(this.wallSet);
    for (let i = 0; i < this.body.length - 1; i++) muro.add(K(this.body[i].x, this.body[i].y));
    if (this.hunter) for (const p of this.hunter.body) muro.add(K(p.x, p.y));
    const inicio = this.body[0];
    const visto = new Set([K(inicio.x, inicio.y)]);
    const cola = [inicio];
    const libres = [];
    for (let c = 0; c < cola.length; c++) {
      const p = cola[c];
      for (const [dx, dy] of DIRS) {
        const nx = p.x + dx;
        const ny = p.y + dy;
        if (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows) continue;
        const k = K(nx, ny);
        if (visto.has(k) || muro.has(k)) continue;
        visto.add(k);
        cola.push({ x: nx, y: ny });
        libres.push({ x: nx, y: ny });
      }
    }
    return libres;
  }

  ocupada(x, y) {
    if (this.body.some((s) => s.x === x && s.y === y)) return true;
    if (this.bonus && this.bonus.x === x && this.bonus.y === y) return true;
    if (this.power && this.power.x === x && this.power.y === y) return true;
    if (this.hunter && this.hunter.body.some((p) => p.x === x && p.y === y)) return true;
    if (this.pellets.some((p) => p.x === x && p.y === y)) return true;
    return false;
  }

  freeCell(pad = 0) {
    const blocked = (x, y) => {
      if (this.wallSet.has(K(x, y))) return true;
      if (this.body.some((s) => s.x === x && s.y === y)) return true;
      if (this.food && this.food.x === x && this.food.y === y) return true;
      if (this.bonus && this.bonus.x === x && this.bonus.y === y) return true;
      if (this.power && this.power.x === x && this.power.y === y) return true;
      if (this.hunter && this.hunter.body.some((p) => p.x === x && p.y === y)) return true;
      if (this.pellets.some((p) => p.x === x && p.y === y)) return true;
      if (this.pendingWalls.some((w) => w.x === x && w.y === y)) return true;
      return false;
    };
    for (let i = 0; i < 600; i++) {
      const x = pad + rand(this.cols - pad * 2);
      const y = pad + rand(this.rows - pad * 2);
      if (!blocked(x, y)) return { x, y };
    }
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) if (!blocked(x, y)) return { x, y };
    }
    return null;
  }

  spawnFood() {
    const libres = this.reachableFree().filter((c) => !this.ocupada(c.x, c.y));
    if (libres.length) {
      this.food = libres[rand(libres.length)];
      return;
    }
    const celda = this.freeCell(0);
    if (celda) this.food = celda;
  }

  spawnBonus() {
    const cell = this.freeCell(0);
    if (cell) this.bonus = { ...cell, ttl: 6500 };
  }

  spawnPower() {
    const pool = this.cfg.powerPool || [];
    if (this.power || pool.length === 0) return;
    const kind = pool[rand(pool.length)];
    if (!POWER_INFO[kind]) return;
    const cell = this.freeCell(0);
    if (cell) this.power = { ...cell, kind, ttl: 9000 };
  }

  // el muro avisa antes de cerrarse: enseña dónde va a salir y da tiempo a apartarse
  raiseWall() {
    const tope = this.cfg.wallMax || 999;
    if (this.walls.length + this.pendingWalls.length >= tope) return;
    const cabeza = this.body[0];
    const cercaDeSerpiente = (c) =>
      this.body.some((s) => Math.abs(s.x - c.x) + Math.abs(s.y - c.y) <= 2);
    for (let i = 0; i < 80; i++) {
      const c = this.freeCell(1);
      if (!c) return;
      const lejos = Math.abs(c.x - cabeza.x) + Math.abs(c.y - cabeza.y) >= 5;
      const hueco = DIRS.some(([dx, dy]) => !this.wallSet.has(K(c.x + dx, c.y + dy)));
      if (!lejos || !hueco || cercaDeSerpiente(c)) continue;
      this.pendingWalls.push({ x: c.x, y: c.y, t: 0, dur: 700 });
      this.emit('wallSoon', { x: c.x, y: c.y });
      return;
    }
  }

  levantarMuro(c) {
    if (this.wallSet.has(K(c.x, c.y))) return;
    if (this.body.some((s) => s.x === c.x && s.y === c.y)) return;
    if (this.food && this.food.x === c.x && this.food.y === c.y) return;
    if (this.hunter && this.hunter.body.some((p) => p.x === c.x && p.y === c.y)) return;
    this.walls.push([c.x, c.y]);
    this.wallSet.add(K(c.x, c.y));
    this.burst(c.x + 0.5, c.y + 0.5, 8, 'rgba(255,255,255,0.8)', 4);
    this.shake = 2;
    this.emit('wall', { x: c.x, y: c.y });
  }

  // el cazador se estrella contra ti: estalla, desaparece un momento y vuelve
  // por la mitad de largo, lejos. matarlo no te da la partida, pero te da aire
  matarCazador() {
    const h = this.hunter;
    for (const c of h.body) this.burst(c.x + 0.5, c.y + 0.5, 5, '#c21414', 4);
    this.score += 100 * this.scoreFactor;
    this.flash = 0.75;
    this.shake = 6;
    this.hitStop = 90;
    h.recarga = 1100;
    h.reaparece = Math.max(3, Math.ceil(h.body.length / 2));
    h.aim = null;
    h.cazando = false;
    this.emit('hunterDies', { x: h.body[0].x, y: h.body[0].y });
  }

  renacerCazador() {
    const h = this.hunter;
    const largo = h.reaparece || 3;
    this.placeHunter();
    const nuevo = this.hunter;
    const libre = (x, y) =>
      x >= 0 && y >= 0 && x < this.cols && y < this.rows &&
      !this.wallSet.has(K(x, y)) &&
      !nuevo.body.some((c) => c.x === x && c.y === y) &&
      !this.body.some((c) => c.x === x && c.y === y) &&
      !this.pellets.some((p) => p.x === x && p.y === y) &&
      (!this.food || this.food.x !== x || this.food.y !== y) &&
      (!this.bonus || this.bonus.x !== x || this.bonus.y !== y) &&
      (!this.power || this.power.x !== x || this.power.y !== y) &&
      !this.pendingWalls.some((w) => w.x === x && w.y === y);
    while (nuevo.body.length < largo) {
      const cola = nuevo.body[nuevo.body.length - 1];
      const antes = nuevo.body[nuevo.body.length - 2];
      let siguiente = null;
      for (const [dx, dy] of DIRS) {
        const nx = cola.x + dx;
        const ny = cola.y + dy;
        if (antes && nx === antes.x && ny === antes.y) continue;
        if (!libre(nx, ny)) continue;
        siguiente = { x: nx, y: ny };
        break;
      }
      if (!siguiente) break;
      nuevo.body.push(siguiente);
      nuevo.prev.push({ ...siguiente });
    }
    nuevo.recarga = 0;
    nuevo.cazando = false;
    nuevo.movido = this.time;
    nuevo.paso = Math.max(1, this.hunterCadence() * this.interval());
    this.flash = 0.3;
  }

  // el cazador nace fuera del foco, en un tramo libre y con espacio para verse
  placeHunter() {
    const cabeza = this.body[0];
    const libre = (x, y) =>
      x > 0 && y > 0 && x < this.cols - 1 && y < this.rows - 1 &&
      !this.wallSet.has(K(x, y)) &&
      !this.body.some((s) => s.x === x && s.y === y) &&
      !this.pellets.some((p) => p.x === x && p.y === y) &&
      (!this.food || this.food.x !== x || this.food.y !== y) &&
      (!this.bonus || this.bonus.x !== x || this.bonus.y !== y) &&
      (!this.power || this.power.x !== x || this.power.y !== y) &&
      !this.pendingWalls.some((w) => w.x === x && w.y === y) &&
      (!this.hunter || !this.hunter.body.some((p) => p.x === x && p.y === y));

    let mejor = null;
    let mejorPuntaje = -Infinity;
    for (let i = 0; i < 300; i++) {
      const origen = this.freeCell(1);
      if (!origen) break;
      const distancia = Math.abs(origen.x - cabeza.x) + Math.abs(origen.y - cabeza.y);
      for (const [dx, dy] of DIRS) {
        const cuerpo = [origen];
        for (let n = 1; n <= 2; n++) {
          const x = origen.x + dx * n;
          const y = origen.y + dy * n;
          if (!libre(x, y)) break;
          cuerpo.push({ x, y });
        }
        const puntaje = cuerpo.length * 100 + Math.min(distancia, 20) + (distancia >= 8 ? 30 : 0);
        if (puntaje > mejorPuntaje) {
          mejor = { cuerpo, dir: { x: -dx, y: -dy } };
          mejorPuntaje = puntaje;
        }
        if (cuerpo.length === 3 && distancia >= 8) break;
      }
      if (mejor && mejor.cuerpo.length === 3 &&
        Math.abs(mejor.cuerpo[0].x - cabeza.x) + Math.abs(mejor.cuerpo[0].y - cabeza.y) >= 8) break;
    }

    if (!mejor) {
      const origen = this.freeCell(1) || { x: 0, y: 0 };
      mejor = { cuerpo: [origen], dir: { x: 1, y: 0 } };
    }
    const cuerpo = mejor.cuerpo;
    this.hunter = {
      body: cuerpo,
      prev: cuerpo.map((p) => ({ ...p })),
      dir: mejor.dir,
      grow: 0,
      aim: null,
      botSiguienteFallo: 48 + rand(30),
    };
    this.hunterTick = 0;
  }

  spawnPellet() {
    if (!this.hunter) return;
    const cabeza = this.body[0];
    const tope = Math.max(2, this.cfg.hunterPellets || 2);
    if (this.pellets.length >= tope) return;
    const libres = this.reachableFree().filter((c) => !this.ocupada(c.x, c.y));
    const lejos = libres.filter((c) => Math.abs(c.x - cabeza.x) + Math.abs(c.y - cabeza.y) >= 4);
    const donde = lejos.length ? lejos : libres;
    if (donde.length) {
      this.pellets.push({ ...donde[rand(donde.length)] });
      return;
    }
    // acorralado: cualquier casilla libre vale, aunque quede cerca
    const c = this.freeCell(0);
    if (c) this.pellets.push({ ...c });
  }

  // ritmo del cazador: acelera cuando ya es largo, cuando lo tiene cerca y del todo al estar lleno
  hunterCadence() {
    const h = this.hunter;
    if (!h) return 2;
    const tope = this.cfg.hunterCap || 18;
    if (h.body.length >= tope) return 1;
    const cabeza = this.body[0];
    const jefe = h.body[0];
    const distancia = Math.abs(jefe.x - cabeza.x) + Math.abs(jefe.y - cabeza.y);
    if (h.body.length >= this.hunterUmbral() && distancia <= 3) return 1;

    const normal = h.body.length >= this.hunterUmbral() ? 2 : 4;
    const objetivo = this.hunterTarget();
    const cercaDelObjetivo = Math.abs(jefe.x - objetivo.x) + Math.abs(jefe.y - objetivo.y) <= 2;
    const cercaDelJugador = this.hunterPelea && distancia <= 5;
    // impulso: acelera una marcha al ir a por un punto o al cerrar sobre ti
    return cercaDelObjetivo || cercaDelJugador ? Math.max(1, normal - 1) : normal;
  }

  // cuánto lleva andado el cazador hacia su casilla nueva (0 a 1), para que no salte
  get hunterAvance() {
    const h = this.hunter;
    if (!h || h.recarga > 0) return 1;
    if (this.state !== 'running') return 1;
    return clamp((this.time - (h.movido || 0)) / Math.max(1, h.paso || 1), 0, 1);
  }

  // ya te está cazando (antes sólo comía puntos)
  get hunterPelea() {
    return !!this.hunter && !(this.hunter.recarga > 0) &&
      this.hunter.body.length >= this.hunterUmbral();
  }

  // cuándo deja de comer y empieza a cazarte: dos tercios de su tope
  hunterUmbral() {
    return Math.max(6, Math.round((this.cfg.hunterCap || 18) * 0.66));
  }

  // a qué va: a comer si es corta, a cortarte el paso si es larga y a por ti si ya está llena
  hunterTarget() {
    const h = this.hunter;
    const cabeza = this.body[0];
    const tope = this.cfg.hunterCap || 18;
    if (h.body.length >= tope) return { x: cabeza.x, y: cabeza.y };
    if (h.body.length >= this.hunterUmbral()) {
      const vista = Math.max(2, this.cfg.hunterSight || 4);
      let x = cabeza.x;
      let y = cabeza.y;
      for (let i = 0; i < vista; i++) {
        const nx = x + this.dir.x;
        const ny = y + this.dir.y;
        if (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows) break;
        if (this.wallSet.has(K(nx, ny))) break;
        x = nx;
        y = ny;
      }
      return { x, y };
    }
    const jefe = h.body[0];
    let mejor = null;
    let cerca = Infinity;
    for (const p of this.pellets) {
      const d = Math.abs(p.x - jefe.x) + Math.abs(p.y - jefe.y);
      if (d < cerca) {
        cerca = d;
        mejor = p;
      }
    }
    return mejor || cabeza;
  }

  // casillas libres que le quedan desde una posición (con tope, para no gastar)
  hunterSpace(origen, ocupado, tope = 90) {
    const visto = new Set([K(origen.x, origen.y)]);
    const cola = [origen];
    let cabeza = 0;
    while (cabeza < cola.length && visto.size < tope) {
      const c = cola[cabeza++];
      for (const [dx, dy] of DIRS) {
        const nx = c.x + dx;
        const ny = c.y + dy;
        if (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows) continue;
        const k = K(nx, ny);
        if (visto.has(k) || ocupado.has(k)) continue;
        visto.add(k);
        cola.push({ x: nx, y: ny });
      }
    }
    return visto.size;
  }

  moveHunter() {
    const h = this.hunter;
    if (!h) return;
    this.hunterTick++;
    if (h.recarga > 0) return;
    if (this.hunterTick % this.hunterCadence() !== 0) return;

    let error = '';
    if (this.hunterTick >= h.botSiguienteFallo) {
      // pequeños titubeos; más raro que elija mal o se estrelle
      h.botSiguienteFallo = this.hunterTick + 48 + rand(40);
      const suerte = Math.random();
      if (suerte < 0.06) return; // se queda pensando y pierde este movimiento
      if (suerte < 0.10) error = 'choque';
      else if (suerte < 0.25) error = 'giro';
    }

    h.prev = h.body.map((p) => ({ ...p }));
    h.movido = this.time;
    h.paso = Math.max(1, this.hunterCadence() * this.interval());
    const cabeza = h.body[0];
    const objetivo = this.hunterTarget();
    // primer aviso: acaba de pasar de comer a cazarte
    if (this.hunterPelea && !h.cazando) {
      h.cazando = true;
      this.flash = 0.6;
      this.shake = 4;
      this.emit('hunterHunt', { x: cabeza.x, y: cabeza.y });
    }

    const ocupadoCuerpo = new Set();
    for (let i = 0; i < h.body.length - 1; i++) ocupadoCuerpo.add(K(h.body[i].x, h.body[i].y));
    // tu cuerpo le cuesta caro: puede cruzarlo, pero si se estrella revienta.
    // la cabeza y la cola no cuentan aquí; la cabeza se mira aparte y la cola se mueve
    const cuerpoJugador = new Set(
      this.body.slice(1, -1).map((s) => K(s.x, s.y)),
    );
    // corto va a comer y no te toca: tu cabeza tampoco es paso para él.
    // al pasar el umbral de crecimiento ya te caza, y puede caer sobre ti
    const agresivo = this.hunterPelea;
    const bloqueado = new Set([...this.wallSet, ...ocupadoCuerpo]);
    for (const item of [this.food, this.bonus, this.power]) {
      if (item) bloqueado.add(K(item.x, item.y));
    }
    const tuCabeza = K(this.body[0].x, this.body[0].y);
    if (!agresivo) bloqueado.add(tuCabeza);

    // por dónde iría si no hubiera trampas: una casilla más cerca del objetivo
    const ideal = bfsStep({
      start: cabeza,
      goal: objetivo,
      blocked: bloqueado,
      cols: this.cols,
      rows: this.rows,
      wrap: false,
    });

    let elegido = null;
    let mejorPunto = -Infinity;
    const movimientos = [];
    let puedeChocar = false;

    for (const [dx, dy] of DIRS) {
      const nx = cabeza.x + dx;
      const ny = cabeza.y + dy;
      if (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows) {
        puedeChocar = true;
        continue;
      }
      const k = K(nx, ny);
      if (bloqueado.has(k)) {
        puedeChocar = true;
        continue;
      }
      const reversa = dx === -h.dir.x && dy === -h.dir.y;

      let puntos = 0;
      // rematar: si cae sobre tu cabeza, gana (sólo cuando ya te caza)
      const sobreCabeza = this.body[0].x === nx && this.body[0].y === ny;
      if (sobreCabeza && agresivo) puntos += 1200;
      puntos -= (Math.abs(nx - objetivo.x) + Math.abs(ny - objetivo.y)) * 12;
      if (ideal && dx === ideal.x && dy === ideal.y) puntos += 46;
      if (reversa) puntos -= 40;

      const ocupadoDestino = new Set([...bloqueado]);
      ocupadoDestino.delete(K(cabeza.x, cabeza.y));
      const espacio = this.hunterSpace({ x: nx, y: ny }, ocupadoDestino);
      puntos += Math.min(espacio, 60) * 0.7;
      if (espacio < 8) puntos -= 300;
      // no meterse justo al lado de la cabeza del jugador si aún es corta
      if (Math.abs(nx - this.body[0].x) + Math.abs(ny - this.body[0].y) === 1 && h.body.length < 5) {
        puntos -= 60;
      }
      // tu cuerpo no le bloquea, pero estrellarse contra él lo revienta
      if (cuerpoJugador.has(k)) puntos -= 400;

      movimientos.push({ x: nx, y: ny, puntos });
      if (puntos > mejorPunto) {
        mejorPunto = puntos;
        elegido = { x: nx, y: ny };
      }
    }

    if (error === 'choque' && puedeChocar) {
      // golpea un muro o su propio cuerpo: estalla y vuelve corto, como cuando te muerde
      this.matarCazador();
      return;
    }
    if (error === 'giro' && movimientos.length > 1) {
      const peor = movimientos.sort((a, b) => a.puntos - b.puntos)[0];
      elegido = { x: peor.x, y: peor.y };
    }

    if (!elegido) {
      // acorralado: se muda a otra zona en vez de quedarse clavado
      this.burst(cabeza.x + 0.5, cabeza.y + 0.5, 12, '#c91616', 7);
      this.placeHunter();
      return;
    }

    // marca a dónde va: el aviso se ve antes de que llegue
    h.aim = { x: objetivo.x, y: objetivo.y };

    h.dir = { x: elegido.x - cabeza.x, y: elegido.y - cabeza.y };
    h.body.unshift(elegido);
    if (h.grow > 0) h.grow--;
    else h.body.pop();

    // te muerde sólo si su cabeza cae sobre la tuya
    if (this.state === 'running' && !this.ghosting &&
      this.body[0].x === elegido.x && this.body[0].y === elegido.y) {
      this.die('cazador', elegido.x, elegido.y);
      return;
    }
    // y si se estrella contra tu cuerpo, revienta: muere y vuelve más corto
    if (this.state === 'running' && this.body.some((c) => c.x === elegido.x && c.y === elegido.y)) {
      this.matarCazador(elegido);
      return;
    }

    const indice = this.pellets.findIndex((p) => p.x === elegido.x && p.y === elegido.y);
    if (indice >= 0) {
      this.pellets.splice(indice, 1);
      const tope = this.cfg.hunterCap || 18;
      if (h.body.length < tope) h.grow += 1;
      this.burst(elegido.x + 0.5, elegido.y + 0.5, 8, '#3d7bff', 5);
      const cuantos = Math.max(2, this.cfg.hunterPellets || 2);
      for (let n = 0; n < cuantos + 2 && this.pellets.length < cuantos; n++) this.spawnPellet();
      this.emit('hunterEat', { largo: h.body.length, lleno: h.body.length >= tope });
    }
  }

  burst(x, y, n, color, power) {
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = (0.35 + Math.random() * 0.65) * power;
      this.particles.push({
        x,
        y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        life: 260 + Math.random() * 320,
        max: 580,
        color,
        size: Math.random() < 0.25 ? 2 : 1,
      });
    }
  }

  posAt(i, alpha) {
    const cur = this.body[i];
    if (!cur) return null;
    const prev = this.prevBody[i] || cur;
    const dx = cur.x - prev.x;
    const dy = cur.y - prev.y;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) return { x: cur.x, y: cur.y };
    return { x: prev.x + dx * alpha, y: prev.y + dy * alpha };
  }

  // el fantasma se apaga en cuatro escalones durante el último 1,6 s
  get ghostPaso() {
    if (!this.ghosting) return 0;
    return Math.min(1, Math.ceil((this.fx.ghost / 1600) * 4) / 4);
  }

  // la fruta que cierra el nivel
  get ultimaFruta() {
    return !!this.cfg.goal && this.fruits >= this.cfg.goal - 1;
  }

  // el borde no es un marco fijo: donde hay muro se marca, y donde no,
  // sólo aparece cuando te acercas. el bloque por el que vas a salir se enciende
  alfaBorde(cx, cy, sentido) {
    const cabeza = this.body[0] || { x: 0, y: 0 };
    const dist = Math.abs(cx - cabeza.x) + Math.abs(cy - cabeza.y);
    if (this.wallSet.has(K(cx, cy))) return 0.5;
    const rumbo = this.dir || { x: 1, y: 0 };
    const salida = rumbo.x < 0 ? 'izq' : rumbo.x > 0 ? 'der' : rumbo.y < 0 ? 'arriba' : 'abajo';
    const esSalida = sentido === salida &&
      (sentido === 'arriba' || sentido === 'abajo' ? cx === cabeza.x : cy === cabeza.y);
    // si darse contra él mata, el borde se ve siempre con contraste suave y estable
    if (!(this.cfg.wrap || this.ghosting)) {
      return esSalida && dist <= 4 ? 0.58 : 0.28;
    }
    // si no mata (frenesí, fantasma), sólo se marca al acercarse, sin parpadear
    if (this.reveal < 1) {
      const luz = 1.2 + this.reveal * 17;
      const lejos = Math.max(Math.abs(cx - cabeza.x), Math.abs(cy - cabeza.y));
      if (lejos <= luz + 1) return 0.22 * (1 - this.reveal);
    }
    if (dist > 4) return 0;
    return esSalida ? 0.58 : 0.12;
  }

  draw(ctx, view) {
    const { cell, ox, oy } = view;
    const W = this.cols * cell;
    const H = this.rows * cell;
    const lado = Math.round(cell);
    const caja = (x, y, margen, ancho) => [
      Math.round(ox + x * cell) + margen,
      Math.round(oy + y * cell) + margen,
      Math.max(2, ancho),
      Math.max(2, ancho),
    ];

    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, view.width, view.height);

    ctx.save();
    if (this.shake > 0.2) {
      const s = this.shake;
      ctx.translate(Math.round((Math.random() - 0.5) * s), Math.round((Math.random() - 0.5) * s));
    }

    // rejilla de 1 px
    ctx.fillStyle = '#141414';
    for (let x = 1; x < this.cols; x++) ctx.fillRect(Math.round(ox + x * cell), oy, 1, H);
    for (let y = 1; y < this.rows; y++) ctx.fillRect(ox, Math.round(oy + y * cell), W, 1);

    // ---- borde: bloques. donde hay muro se marca; donde no, sólo al acercarte,
    // y el bloque por el que vas a salir se enciende (aviso de salida)
    const grosor = Math.max(2, Math.round(cell * 0.2));
    const tramoBorde = (x0, y0, w, h, cx, cy, sentido) => {
      const alfa = this.alfaBorde(cx, cy, sentido);
      if (alfa < 0.02) return;
      ctx.fillStyle = `rgba(255,255,255,${alfa.toFixed(2)})`;
      ctx.fillRect(Math.round(x0), Math.round(y0), Math.round(w), Math.round(h));
    };
    for (let i = 0; i < this.cols; i++) {
      tramoBorde(ox + i * cell, oy, cell, grosor, i, 0, 'arriba');
      tramoBorde(ox + i * cell, oy + H - grosor, cell, grosor, i, this.rows - 1, 'abajo');
    }
    for (let j = 0; j < this.rows; j++) {
      tramoBorde(ox, oy + j * cell, grosor, cell, 0, j, 'izq');
      tramoBorde(ox + W - grosor, oy + j * cell, grosor, cell, this.cols - 1, j, 'der');
    }

    // muros: cubo hueco
    const inset = Math.max(1, Math.round(cell * 0.08));
    for (const [x, y] of this.walls) {
      const [px, py, w] = caja(x, y, inset, lado - inset * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(px, py, w, w);
      ctx.strokeStyle = 'rgba(255,255,255,0.36)';
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 0.5, py + 0.5, w - 1, w - 1);
    }

    // muros que van a salir: un cubo hueco que parpadea y se cierra
    for (const w of this.pendingWalls) {
      const avance = clamp(w.t / w.dur, 0, 1);
      const [px, py, w2] = caja(w.x, w.y, Math.round(cell * 0.16), lado - Math.round(cell * 0.32));
      ctx.strokeStyle = `rgba(255,255,255,${(0.3 + avance * 0.55).toFixed(2)})`;
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 0.5, py + 0.5, w2 - 1, w2 - 1);
      // el punto del centro crece: cuando llena la casilla, el muro ya está
      const punto = Math.max(2, Math.round(w2 * avance));
      if (punto > 2) {
        ctx.fillStyle = `rgba(255,255,255,${(0.25 + avance * 0.55).toFixed(2)})`;
        ctx.fillRect(
          Math.round(px + (w2 - punto) / 2),
          Math.round(py + (w2 - punto) / 2),
          punto,
          punto,
        );
      }
    }

    // comida: cubo rojo que respira. la que cierra el nivel va en amarillo
    if (this.food) {
      const ultima = this.ultimaFruta;
      const pulso = Math.floor((0.5 + 0.5 * Math.sin(this.time / 220)) * 3);
      const m = Math.round(cell * 0.16) + pulso;
      const [px, py, w] = caja(this.food.x, this.food.y, m, lado - m * 2);
      ctx.fillStyle = ultima ? '#ffd21e' : '#ff2b2b';
      ctx.fillRect(px, py, w, w);
      if (ultima) {
        const hueco = Math.max(2, Math.round(w * 0.34));
        ctx.fillStyle = '#000';
        ctx.fillRect(px + Math.round((w - hueco) / 2), py + Math.round((w - hueco) / 2), hueco, hueco);
      }
    }

    // premio: cubo rojo hueco, distinto de la fruta llena
    if (this.bonus && !(this.bonus.ttl < 1800 && Math.floor(this.time / 130) % 2 === 0)) {
      const m = Math.round(cell * 0.16);
      const [px, py, w] = caja(this.bonus.x, this.bonus.y, m, lado - m * 2);
      ctx.strokeStyle = '#ff2b2b';
      ctx.lineWidth = Math.max(2, Math.round(cell * 0.14));
      ctx.strokeRect(px + 0.5, py + 0.5, w - 1, w - 1);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = Math.max(1, Math.round(cell * 0.05));
      ctx.strokeRect(px + 0.5, py + 0.5, w - 1, w - 1);
    }

    // poderes: cubos con su marca dentro
    if (this.power && !(this.power.ttl < 2200 && Math.floor(this.time / 140) % 2 === 0)) {
      const { kind } = this.power;
      const m = Math.round(cell * 0.2);
      const [px, py, w] = caja(this.power.x, this.power.y, m, lado - m * 2);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = Math.max(1, Math.round(cell * 0.06));
      if (kind === 'ghost') {
        ctx.setLineDash([Math.max(2, Math.round(cell * 0.16)), Math.max(2, Math.round(cell * 0.16))]);
        ctx.strokeRect(px + 0.5, py + 0.5, w - 1, w - 1);
        ctx.setLineDash([]);
      } else if (kind === 'slow') {
        ctx.strokeRect(px + 0.5, py + 0.5, w - 1, w - 1);
        ctx.beginPath();
        ctx.moveTo(px + w * 0.28, py + w * 0.5);
        ctx.lineTo(px + w * 0.72, py + w * 0.5);
        ctx.stroke();
      } else if (kind === 'shield') {
        ctx.strokeRect(px + 0.5, py + 0.5, w - 1, w - 1);
        ctx.strokeRect(px + w * 0.22, py + w * 0.22, w * 0.56, w * 0.56);
        ctx.fillStyle = '#fff';
        ctx.fillRect(Math.round(px + w * 0.42), Math.round(py + w * 0.42), Math.max(2, Math.round(w * 0.16)), Math.max(2, Math.round(w * 0.16)));
      } else if (kind === 'double') {
        ctx.strokeRect(px + 0.5, py + 0.5, w - 1, w - 1);
        ctx.fillStyle = '#fff';
        const side = Math.max(2, Math.round(w * 0.22));
        ctx.fillRect(Math.round(px + w * 0.25 - side / 2), Math.round(py + w * 0.5 - side / 2), side, side);
        ctx.fillRect(Math.round(px + w * 0.75 - side / 2), Math.round(py + w * 0.5 - side / 2), side, side);
      } else {
        ctx.strokeRect(px + 0.5, py + 0.5, w - 1, w - 1);
        ctx.fillStyle = '#fff';
        ctx.fillRect(Math.round(px + w * 0.36), Math.round(py + w * 0.36), Math.max(2, Math.round(w * 0.28)), Math.max(2, Math.round(w * 0.28)));
      }
    }

    // puntos azules del cazador
    for (const punto of this.pellets) {
      const [px, py, w] = caja(punto.x, punto.y, Math.round(cell * 0.33), lado - Math.round(cell * 0.66));
      ctx.fillStyle = '#3d7bff';
      ctx.fillRect(px, py, w, w);
    }

    // ---- luz: todo a bloques, un escalón por casilla ----
    const cabeza = this.body[0];
    const centroX = ox + (cabeza.x + 0.5) * cell;
    const centroY = oy + (cabeza.y + 0.5) * cell;

    const sombra = (cx, cy, dentro, fuera, maxAlpha, pasos) => {
      for (let y = 0; y < this.rows; y++) {
        for (let x = 0; x < this.cols; x++) {
          const dx = Math.abs(x + 0.5 - cx);
          const dy = Math.abs(y + 0.5 - cy);
          const dist = Math.max(dx, dy);
          if (dist <= dentro) continue;
          const bruto = clamp((dist - dentro) / fuera, 0, 1);
          const alpha = (Math.ceil(bruto * pasos) / pasos) * maxAlpha;
          if (alpha < 0.04) continue;
          ctx.fillStyle = `rgba(0,0,0,${alpha.toFixed(2)})`;
          ctx.fillRect(
            Math.floor(ox + x * cell),
            Math.floor(oy + y * cell),
            Math.ceil(cell) + 1,
            Math.ceil(cell) + 1,
          );
        }
      }
    };

    if (this.reveal < 1) {
      // arranque: la luz avanza en cuadros desde la cabeza
      const alcance = 1.2 + this.reveal * 17;
      sombra(cabeza.x + 0.5, cabeza.y + 0.5, alcance, 3.4, 1, 5);
      const filo = Math.sin(Math.PI * Math.min(1, this.reveal * 1.15));
      if (filo > 0.03 && alcance * cell < Math.max(W, H) * 1.4) {
        const r = alcance * cell;
        ctx.strokeStyle = `rgba(255,255,255,${(filo * 0.5).toFixed(3)})`;
        ctx.lineWidth = Math.max(1, Math.round(cell * 0.08));
        ctx.strokeRect(
          Math.round(centroX - r) + 0.5,
          Math.round(centroY - r) + 0.5,
          Math.round(r * 2),
          Math.round(r * 2),
        );
      }
    }

    // el aviso de corte y el cazador quedan sobre la capa de sombra para no desaparecer
    if (this.hunter && this.hunter.aim && this.hunter.recarga <= 0) {
      const aim = this.hunter.aim;
      const dist = Math.abs(aim.x - this.body[0].x) + Math.abs(aim.y - this.body[0].y);
      if (dist <= (this.cfg.hunterAimShow || 7) && Math.floor(this.time / 110) % 2 === 0) {
        const m = Math.round(cell * 0.2);
        const [px, py, w] = caja(aim.x, aim.y, m, lado - m * 2);
        ctx.strokeStyle = 'rgba(255,43,43,0.95)';
        ctx.lineWidth = Math.max(1, Math.round(cell * 0.07));
        ctx.strokeRect(px + 0.5, py + 0.5, w - 1, w - 1);
      }
    }

    if (this.hunter && this.hunter.recarga > 0 && this.hunter.body[0]) {
      const cabezaCazador = this.hunter.body[0];
      const pulso = 0.3 + 0.45 * (0.5 + 0.5 * Math.sin(this.time / 95));
      const m = Math.max(2, Math.round(cell * 0.2));
      const [px, py, w] = caja(cabezaCazador.x, cabezaCazador.y, m, lado - m * 2);
      ctx.strokeStyle = `rgba(255,43,43,${pulso.toFixed(2)})`;
      ctx.lineWidth = Math.max(1, Math.round(cell * 0.08));
      ctx.strokeRect(px + 0.5, py + 0.5, w - 1, w - 1);
    }

    // el cazador: cubos rojos, uno por anillo, con la cabeza marcada
    if (this.hunter && this.hunter.recarga <= 0) {
      const avance = this.hunterAvance;
      const m = Math.max(1, Math.round(cell * 0.07));
      const ancho = lado - m * 2;
      const centro = Math.max(2, Math.round(ancho * 0.22));
      for (let i = this.hunter.body.length - 1; i >= 0; i--) {
        const actual = this.hunter.body[i];
        const previo = this.hunter.prev[i] || actual;
        const salto = Math.abs(actual.x - previo.x) > 1 || Math.abs(actual.y - previo.y) > 1;
        const px = salto ? actual.x : previo.x + (actual.x - previo.x) * avance;
        const py = salto ? actual.y : previo.y + (actual.y - previo.y) * avance;
        const x0 = Math.round(ox + px * cell) + m;
        const y0 = Math.round(oy + py * cell) + m;
        ctx.fillStyle = i === 0 ? '#ff2b2b' : '#c21414';
        ctx.fillRect(x0, y0, ancho, ancho);
        ctx.strokeStyle = i === 0 ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x0 + 0.5, y0 + 0.5, ancho - 1, ancho - 1);
        if (i === 0 && this.hunterPelea) {
          ctx.strokeStyle = 'rgba(255,255,255,0.9)';
          ctx.lineWidth = Math.max(1, Math.round(cell * 0.06));
          ctx.strokeRect(x0 - 2.5, y0 - 2.5, ancho + 5, ancho + 5);
        }
        if (i === 0) {
          const dx = this.hunter.dir.x || 0;
          const dy = this.hunter.dir.y || 0;
          ctx.fillStyle = '#000';
          for (const ladoOjo of [-1, 1]) {
            const ex = x0 + ancho / 2 + dx * ancho * 0.16 + (dy !== 0 ? ladoOjo * ancho * 0.18 : 0);
            const ey = y0 + ancho / 2 + dy * ancho * 0.16 + (dx !== 0 ? ladoOjo * ancho * 0.18 : 0);
            ctx.fillRect(Math.round(ex - centro / 2), Math.round(ey - centro / 2), centro, centro);
          }
        }
      }
    }

    // la serpiente: un cubo por casilla, todos iguales
    const alpha = this.state === 'running' ? clamp(this.acc / this.interval(), 0, 1) : 1;
    const hueco = Math.max(1, Math.round(cell * 0.1));
    const tamano = lado - hueco * 2;
    // al comer, la cabeza da un mordisco: crece un pelín y vuelve
    const huecoCabeza = Math.max(0, hueco - Math.round(this.chomp * cell * 0.07));
    const tamanoCabeza = lado - huecoCabeza * 2;
    const fantasma = this.ghosting;
    // el fantasma no se corta de golpe: se apaga en cuatro escalones durante
    // el último 1,6 s. primero pierde el relleno, luego el contorno
    const pasoFantasma = this.ghostPaso;
    const rellenoFantasma = (1 - pasoFantasma) * 0.82;
    const contornoFantasma = 0.9;
    const visibles = this.crash ? Math.max(0, this.body.length - this.crash.popped) : this.body.length;

    ctx.save();
    if (this.crash) ctx.globalAlpha = clamp(1 - (this.crash.t - 120) / 520, 0.12, 1);
    for (let i = visibles - 1; i >= 0; i--) {
      const p = this.posAt(i, alpha);
      if (!p) continue;
      const x0 = Math.round(ox + p.x * cell) + hueco;
      const y0 = Math.round(oy + p.y * cell) + hueco;
      if (fantasma) {
        if (rellenoFantasma > 0) {
          ctx.fillStyle = `rgba(255,255,255,${rellenoFantasma.toFixed(3)})`;
          ctx.fillRect(x0, y0, tamano, tamano);
        }
        ctx.strokeStyle = `rgba(255,255,255,${contornoFantasma.toFixed(3)})`;
        ctx.lineWidth = Math.max(1, Math.round(cell * 0.06));
        ctx.strokeRect(x0 + 0.5, y0 + 0.5, tamano - 1, tamano - 1);
      } else {
        ctx.fillStyle = i === 0 ? '#ffffff' : '#e8e8e8';
        ctx.fillRect(x0, y0, tamano, tamano);
      }
    }
    ctx.restore();

    // cabeza: el mismo cubo, con dos ojos cuadrados mirando hacia donde vas
    const punta = visibles > 0 ? this.posAt(0, alpha) : null;
    if (punta) {
      const x0 = Math.round(ox + punta.x * cell) + huecoCabeza;
      const y0 = Math.round(oy + punta.y * cell) + huecoCabeza;
      if (fantasma) {
        if (rellenoFantasma > 0) {
          ctx.fillStyle = `rgba(255,255,255,${rellenoFantasma.toFixed(3)})`;
          ctx.fillRect(x0, y0, tamanoCabeza, tamanoCabeza);
        }
        ctx.strokeStyle = `rgba(255,255,255,${(contornoFantasma + 0.05).toFixed(3)})`;
        ctx.lineWidth = Math.max(1, Math.round(cell * 0.06));
        ctx.strokeRect(x0 + 0.5, y0 + 0.5, tamanoCabeza - 1, tamanoCabeza - 1);
      } else {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x0, y0, tamanoCabeza, tamanoCabeza);
      }
      if (this.fx.shield > 0) {
        const pulso = 0.38 + 0.38 * (0.5 + 0.5 * Math.sin(this.time / 110));
        const margen = Math.max(1, Math.round(cell * 0.1));
        ctx.strokeStyle = `rgba(185,244,255,${pulso.toFixed(2)})`;
        ctx.lineWidth = Math.max(1, Math.round(cell * 0.055));
        ctx.strokeRect(
          x0 - margen + 0.5,
          y0 - margen + 0.5,
          tamanoCabeza + margen * 2 - 1,
          tamanoCabeza + margen * 2 - 1,
        );
      }
      const ojo = Math.max(2, Math.round(tamanoCabeza * 0.2));
      const dx = this.dir.x;
      const dy = this.dir.y;
      ctx.fillStyle = fantasma
        ? (pasoFantasma > 0.5 ? '#ffffff' : `rgba(0,0,0,${(1 - pasoFantasma).toFixed(2)})`)
        : '#000000';
      for (const s of [-1, 1]) {
        const ex = x0 + tamanoCabeza / 2 + dx * tamanoCabeza * 0.18 + (dy !== 0 ? s * tamanoCabeza * 0.2 : 0);
        const ey = y0 + tamanoCabeza / 2 + dy * tamanoCabeza * 0.18 + (dx !== 0 ? s * tamanoCabeza * 0.2 : 0);
        ctx.fillRect(Math.round(ex - ojo / 2), Math.round(ey - ojo / 2), ojo, ojo);
      }
    }

    // chispas: también cuadradas
    ctx.save();
    for (const p of this.particles) {
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.color;
      const s = Math.max(1, Math.round(p.size));
      ctx.fillRect(Math.round(ox + p.x * cell), Math.round(oy + p.y * cell), s, s);
    }
    ctx.restore();

    ctx.restore();

    if (this.flash > 0.01) {
      ctx.fillStyle = `rgba(255,255,255,${this.flash * 0.07})`;
      ctx.fillRect(0, 0, view.width, view.height);
    }

    // ---- choque: la casilla del golpe y tres marcos cuadrados que se abren ----
    if (this.crash) {
      const c = this.crash;
      const x0 = Math.round(ox + c.x * cell);
      const y0 = Math.round(oy + c.y * cell);

      const marca = clamp(1 - c.t / 220, 0, 1);
      if (marca > 0.01) {
        ctx.fillStyle = '#000';
        ctx.fillRect(x0, y0, lado, lado);
        ctx.strokeStyle = `rgba(255,255,255,${marca.toFixed(3)})`;
        ctx.lineWidth = Math.max(1, Math.round(cell * 0.1));
        ctx.strokeRect(x0 + 0.5, y0 + 0.5, lado - 1, lado - 1);
      }

      const avance = clamp((c.t - 40) / 420, 0, 1);
      if (avance > 0 && avance < 1) {
        for (let n = 0; n < 3; n++) {
          const paso = (avance + n * 0.22) % 1;
          const alfa = (1 - paso) * (1 - n * 0.22);
          if (alfa <= 0.02) continue;
          const crece = lado * (0.5 + paso * 2.6);
          ctx.strokeStyle = `rgba(255,255,255,${(alfa * 0.7).toFixed(3)})`;
          ctx.lineWidth = Math.max(1, Math.round(cell * 0.07 * (1 - paso)));
          ctx.strokeRect(
            Math.round(x0 + lado / 2 - crece / 2) + 0.5,
            Math.round(y0 + lado / 2 - crece / 2) + 0.5,
            Math.round(crece),
            Math.round(crece),
          );
        }
      }
    }
  }
}

  Object.assign(modulo, { POWER_INFO, Game });
})(modulos['engine']);

// ---- i18n ----
(function (modulo) {
'use strict';
// Textos del juego y nombres localizados. Sin dependencias ni llamadas externas.

const KEY = 'snake.language';
const STRINGS = {
  es: {
    documentTitle: 'Snake — v1.0',
    description: 'Snake v1.0: campaña, modos infinitos y una serpiente cazadora.',
    language: 'Idioma',
    sound: 'sonido',
    soundTitleOn: 'sonido activo (M)',
    soundTitleOff: 'sonido apagado (M)',
    pause: 'pausa',
    pauseTitle: 'pausa (P)',
    resume: 'seguir',
    resumeTitle: 'seguir (P)',
    board: 'tablero',
    startPrompt: 'pulsa una dirección',
    focusHint: 'haz clic en el tablero para que responda el teclado',
    fatalTitle: 'el juego no ha arrancado',
    fatalReload: 'recargar limpio',
    noScript: 'este juego necesita javascript activado.',
    loading: 'cargando…',
    missingPieces: 'faltan piezas ({pieces}). casi seguro hay ficheros viejos en caché: pulsa recargar limpio.',
    campaign: 'campaña',
    groupCampaign: 'progreso',
    groupCampaignTag: 'rutas con obstáculos',
    groupEndless: 'infinitos',
    groupEndlessTag: 'puntuación sin final',
    modeClassic: 'clásico',
    modeClassicTag: 'cada fruta acelera · muros al llegar a 30 frutas',
    modeFrenzy: 'frenesí',
    modeFrenzyTag: 'bordes abiertos y la velocidad sube sola',
    modeHunter: 'cazador',
    modeHunterTag: 'una serpiente roja come puntos azules y crece',
    levelNames: {
      LLANO: 'llano', CRUZ: 'cruz', PILARES: 'pilares', ANILLO: 'anillo', ZIGZAG: 'zigzag',
      COLUMNAS: 'columnas', 'DOBLE ANILLO': 'doble anillo', REJILLA: 'rejilla', JAULA: 'jaula',
      ASPAS: 'aspas', 'CUATRO ESQUINAS': 'cuatro esquinas', 'CRUZ HUECA': 'cruz hueca',
      'REJILLA DOBLE': 'rejilla doble', PASILLO: 'pasillo', PUAS: 'púas', ESCALERA: 'escalera',
      DIENTES: 'dientes', LABERINTO: 'laberinto', 'DOS JAULAS': 'dos jaulas', FINAL: 'final',
    },
    controls: 'controles',
    hideGrid: 'quitar trama',
    showGrid: 'poner trama',
    clearRecords: 'borrar récords',
    chooseGroup: 'elige un grupo',
    menuSubtitle: 'elige una partida',
    settings: 'configuración',
    settingsHint: 'ajusta la experiencia de juego',
    soundSettingHint: 'efectos sonoros del juego',
    scanlines: 'trama de fósforo',
    scanlinesHint: 'líneas de pantalla para dar textura',
    clearRecordsHint: 'borra récords y progreso guardados',
    enabled: 'activado',
    disabled: 'desactivado',
    preview: 'vista previa',
    previewMode: 'vista previa del modo',
    previewGroupHint: 'elige un grupo para ver sus modos',
    groupAria: 'grupos',
    menuNumber: 'menú · {number}',
    groups: 'grupos',
    switchGroup: 'cambiar de grupo',
    modes: 'modos',
    chooseMode: '↑↓ elegir · ←→ cambiar de grupo · enter jugar',
    campaignProgress: '{cleared}/{total} superados',
    campaignDescription: 'recorrido con muros · {cleared} superados',
    chooseLevel: 'elige nivel',
    blocked: 'bloqueado',
    fruits: '{count} {unit}',
    levelPreviewData: '{goal} {unit} · ritmo {speed}',
    applesRemaining: '{count} {unit} por recoger',
    campaignLevel: 'nivel {number} · {name}',
    campaignRunSummary: 'manzanas recogidas: {collected} · manzanas restantes: {remaining}',
    levelControls: 'flechas para moverte · enter para jugar',
    helpTitle: 'cómo se juega',
    helpHeading: 'controles',
    back: 'volver',
    turn: 'girar',
    turnKeys: 'flechas o WASD · desliza',
    turbo: 'turbo',
    turboKeys: 'espacio / mayús / A · salvo cazador',
    pauseHelp: 'pausa',
    pauseKeys: 'P o esc · mando: start',
    restart: 'reiniciar',
    restartKeys: 'R · sonido M',
    menus: 'menús',
    menuKeys: 'flechas + enter · ←→ cambia de grupo',
    gameRules: 'reglas de juego',
    ruleChain: 'sólo en modos infinitos: cadena hasta ×5; cubos dan premios o poderes.',
    ruleCampaign: 'campaña: manzanas, no puntos; la última fruta es dorada.',
    ruleModes: 'frenesí: los bordes dan la vuelta. cazador: come puntos y después te persigue.',
    ruleHunter: 'cazador: su cabeza te mata; su cuerpo y los puntos son seguros.',
    powerBasics: 'fantasma atraviesa obstáculos; lento baja el ritmo; recorte acorta la cola.',
    powerAdvanced: 'los poderes dependen del modo; el escudo salva un choque y doble dura 7 s.',
    gridMode: 'rejilla',
    levelNumberName: 'nivel {number} {name}',
    nextLevelMeta: 'siguiente · {name} · {goal} {unit}',
    recordFruitMeta: 'récord {record} · {fruits} {unit}',
    recordNew: 'récord nuevo',
    end: 'fin',
    retry: 'reintentar',
    menu: 'menú',
    levelCleared: 'nivel {number} superado',
    campaignComplete: 'campaña completa · ya no hay margen',
    next: 'siguiente',
    repeat: 'repetir',
    fruitsRecord: '{fruits} {unit} · récord {record}',
    paused: 'en pausa',
    eraseConfirm: '¿borrar récords y progreso?',
    gamepadConnected: 'mando conectado',
    activeEffects: 'efectos activos',
    hintHome: '↑↓ grupo · enter abrir',
    hintModes: '↑↓ modo · ←→ grupo · enter jugar · esc volver',
    hintLevels: 'flechas nav · enter jugar · esc grupos',
    hintHelp: 'esc volver',
    hintSettings: '↑↓ elegir · enter cambiar · esc volver',
    hintPaused: 'P seguir · R reiniciar · esc menú',
    hintDead: 'R reintentar · esc menú',
    hintCleared: 'enter siguiente · esc menú',
    hintSwipe: 'desliza para girar',
    hintGame: 'flechas girar · P pausa · R reiniciar · M sonido',
    hintGameTurbo: 'flechas girar · espacio turbo · P pausa · R reiniciar · M sonido',
    best: 'récord {score}',
    fruitScore: '{mode} · {fruits} {unit}',
    ghost: 'fantasma',
    slow: 'lento',
    shield: 'escudo',
    double: 'doble',
    turboEffect: 'turbo',
    hunted: 'te caza',
    locked: 'bloqueado',
    routeHome: '',
    routeModes: 'modos',
    routeHelp: 'ayuda',
    routeSettings: 'ajustes',
    routeCampaign: 'campaña',
    routeClassic: 'clásico',
    routeFrenzy: 'frenesí',
    routeHunter: 'cazador',
    routeEndless: 'infinitos',
    previewCampaign: 'vista previa · nivel {number} {name}',
    campaignAt: 'la campaña sigue por aquí · {cleared} de {total} superados',
    nextCampaignLevel: 'así es el siguiente nivel de la campaña',
    previewModeTitle: 'vista previa · {mode}',
    enterForModes: '{tag} · entra para ver los demás',
    footerGroups: 'grupos',
  },
  en: {
    documentTitle: 'Snake — v1.0',
    description: 'Snake v1.0: campaign, endless modes, and a hunter snake.',
    language: 'Language',
    sound: 'sound',
    soundTitleOn: 'sound on (M)',
    soundTitleOff: 'sound off (M)',
    pause: 'pause',
    pauseTitle: 'pause (P)',
    resume: 'resume',
    resumeTitle: 'resume (P)',
    board: 'game board',
    startPrompt: 'press a direction',
    focusHint: 'click the board to enable keyboard controls',
    fatalTitle: 'the game did not start',
    fatalReload: 'reload cleanly',
    noScript: 'this game needs javascript enabled.',
    loading: 'loading…',
    missingPieces: 'missing pieces ({pieces}). The browser may have cached old files; try a clean reload.',
    campaign: 'campaign',
    groupCampaign: 'campaign',
    groupCampaignTag: 'obstacle routes',
    groupEndless: 'endless',
    groupEndlessTag: 'chase a high score',
    modeClassic: 'classic',
    modeClassicTag: 'each fruit speeds you up · walls begin at 30 fruits',
    modeFrenzy: 'frenzy',
    modeFrenzyTag: 'open edges · your speed keeps rising',
    modeHunter: 'hunter',
    modeHunterTag: 'a red snake eats blue pellets and grows',
    levelNames: {
      LLANO: 'open field', CRUZ: 'cross', PILARES: 'pillars', ANILLO: 'ring', ZIGZAG: 'zigzag',
      COLUMNAS: 'columns', 'DOBLE ANILLO': 'double ring', REJILLA: 'grid', JAULA: 'cage',
      ASPAS: 'pinwheels', 'CUATRO ESQUINAS': 'four corners', 'CRUZ HUECA': 'hollow cross',
      'REJILLA DOBLE': 'double grid', PASILLO: 'corridor', PUAS: 'spikes', ESCALERA: 'staircase',
      DIENTES: 'teeth', LABERINTO: 'maze', 'DOS JAULAS': 'twin cages', FINAL: 'finale',
    },
    controls: 'controls',
    hideGrid: 'hide scanlines',
    showGrid: 'show scanlines',
    clearRecords: 'clear records',
    chooseGroup: 'choose a group',
    menuSubtitle: 'choose a run',
    settings: 'settings',
    settingsHint: 'adjust your game experience',
    soundSettingHint: 'game sound effects',
    scanlines: 'scanlines',
    scanlinesHint: 'screen lines for a little texture',
    clearRecordsHint: 'erase saved records and progress',
    enabled: 'on',
    disabled: 'off',
    preview: 'preview',
    previewMode: 'mode preview',
    previewGroupHint: 'choose a group to see its modes',
    groupAria: 'groups',
    menuNumber: 'menu · {number}',
    groups: 'groups',
    switchGroup: 'switch group',
    modes: 'modes',
    chooseMode: '↑↓ choose · ←→ switch group · enter play',
    campaignProgress: '{cleared}/{total} cleared',
    campaignDescription: 'obstacle course · {cleared} cleared',
    chooseLevel: 'choose a level',
    blocked: 'locked',
    fruits: '{count} {unit}',
    levelPreviewData: '{goal} {unit} · speed {speed}',
    applesRemaining: '{count} {unit} left',
    campaignLevel: 'level {number} · {name}',
    campaignRunSummary: 'apples collected: {collected} · apples remaining: {remaining}',
    levelControls: 'arrow keys to move · enter to play',
    helpTitle: 'how to play',
    helpHeading: 'controls',
    back: 'back',
    turn: 'turn',
    turnKeys: 'arrows or WASD · swipe',
    turbo: 'boost',
    turboKeys: 'space / shift / A · except in hunter',
    pauseHelp: 'pause',
    pauseKeys: 'P or esc · controller: start',
    restart: 'restart',
    restartKeys: 'R · sound M',
    menus: 'menus',
    menuKeys: 'arrows + enter · ←→ switches groups',
    gameRules: 'game rules',
    ruleChain: 'endless modes only: chain up to ×5; blocks drop bonuses or power-ups.',
    ruleCampaign: 'campaign: apples, not points; the final fruit is golden.',
    ruleModes: 'frenzy: wrap around the edges. hunter: eat pellets, then stay ahead.',
    ruleHunter: 'hunter: its head is deadly; its body and pellets are safe.',
    powerBasics: 'ghost passes hazards; slow eases the pace; shrink trims your tail.',
    powerAdvanced: 'available powers depend on the mode; shield saves one crash and double lasts 7 s.',
    gridMode: 'grid',
    levelNumberName: 'level {number} {name}',
    nextLevelMeta: 'next · {name} · {goal} {unit}',
    recordFruitMeta: 'best {record} · {fruits} {unit}',
    recordNew: 'new record',
    end: 'game over',
    retry: 'retry',
    menu: 'menu',
    levelCleared: 'level {number} cleared',
    campaignComplete: 'campaign complete · no more levels',
    next: 'next',
    repeat: 'play again',
    fruitsRecord: '{fruits} {unit} · best {record}',
    paused: 'paused',
    eraseConfirm: 'Clear records and progress?',
    gamepadConnected: 'controller connected',
    activeEffects: 'active effects',
    hintHome: '↑↓ group · enter open',
    hintModes: '↑↓ mode · ←→ group · enter play · esc back',
    hintLevels: 'arrows move · enter play · esc groups',
    hintHelp: 'esc back',
    hintSettings: '↑↓ choose · enter toggle · esc back',
    hintPaused: 'P resume · R restart · esc menu',
    hintDead: 'R retry · esc menu',
    hintCleared: 'enter next · esc menu',
    hintSwipe: 'swipe to turn',
    hintGame: 'arrows turn · P pause · R restart · M sound',
    hintGameTurbo: 'arrows turn · space boost · P pause · R restart · M sound',
    best: 'best {score}',
    fruitScore: '{mode} · {fruits} {unit}',
    ghost: 'ghost',
    slow: 'slow',
    shield: 'shield',
    double: 'double points',
    turboEffect: 'boost',
    hunted: 'hunted',
    locked: 'locked',
    routeHome: '',
    routeModes: 'modes',
    routeHelp: 'help',
    routeSettings: 'settings',
    routeCampaign: 'campaign',
    routeClassic: 'classic',
    routeFrenzy: 'frenzy',
    routeHunter: 'hunter',
    routeEndless: 'endless',
    previewCampaign: 'preview · level {number} {name}',
    campaignAt: 'campaign continues here · {cleared} of {total} cleared',
    nextCampaignLevel: 'preview of the next campaign level',
    previewModeTitle: 'preview · {mode}',
    enterForModes: '{tag} · enter to see the rest',
    footerGroups: 'groups',
  },
};

const MODE_KEYS = {
  campaign: 'campaign',
  classic: 'modeClassic',
  frenzy: 'modeFrenzy',
  hunter: 'modeHunter',
};
const MODE_TAG_KEYS = {
  classic: 'modeClassicTag',
  frenzy: 'modeFrenzyTag',
  hunter: 'modeHunterTag',
};
const GROUP_KEYS = ['groupCampaign', 'groupEndless'];
const GROUP_TAG_KEYS = ['groupCampaignTag', 'groupEndlessTag'];
let language = 'es';

try {
  const stored = localStorage.getItem(KEY);
  if (stored === 'es' || stored === 'en') language = stored;
} catch (error) {
  // El idioma también funciona sin almacenamiento local.
}

function getLanguage() {
  return language;
}

function setLanguage(value) {
  language = value === 'en' ? 'en' : 'es';
  try {
    localStorage.setItem(KEY, language);
  } catch (error) {
    // El idioma se mantiene en memoria durante esta sesión.
  }
  return language;
}

function t(key, values = {}) {
  let text = STRINGS[language][key] ?? STRINGS.es[key] ?? key;
  if (typeof text !== 'string') return text;
  return text.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : match,
  );
}

function modeName(mode) {
  return t(MODE_KEYS[mode] || 'campaign');
}

function modeTag(mode) {
  return t(MODE_TAG_KEYS[mode] || 'campaign');
}

function groupName(index) {
  return t(GROUP_KEYS[index] || GROUP_KEYS[0]);
}

function groupTag(index) {
  return t(GROUP_TAG_KEYS[index] || GROUP_TAG_KEYS[0]);
}

function levelName(name) {
  const names = STRINGS[language].levelNames || STRINGS.es.levelNames;
  return names[name] || String(name).toLowerCase();
}

function fruitUnit(count) {
  const singular = Number(count) === 1;
  if (language === 'en') return singular ? 'fruit' : 'fruits';
  return singular ? 'fruta' : 'frutas';
}

function appleUnit(count) {
  const singular = Number(count) === 1;
  if (language === 'en') return singular ? 'apple' : 'apples';
  return singular ? 'manzana' : 'manzanas';
}

function routeSlug(name) {
  const key = `route${name[0].toUpperCase()}${name.slice(1)}`;
  return t(key);
}

function routeWords() {
  return {
    home: '',
    modes: [STRINGS.es.routeModes, STRINGS.en.routeModes],
    help: [STRINGS.es.routeHelp, STRINGS.en.routeHelp],
    settings: [STRINGS.es.routeSettings, STRINGS.en.routeSettings],
    campaign: [STRINGS.es.routeCampaign, STRINGS.en.routeCampaign],
    classic: [STRINGS.es.routeClassic, 'clasico', STRINGS.en.routeClassic],
    frenzy: [STRINGS.es.routeFrenzy, 'frenesi', STRINGS.en.routeFrenzy],
    hunter: [STRINGS.es.routeHunter, STRINGS.en.routeHunter],
    endless: [STRINGS.es.routeEndless, STRINGS.en.routeEndless],
  };
}

  Object.assign(modulo, { getLanguage, setLanguage, t, modeName, modeTag, groupName, groupTag, levelName, fruitUnit, appleUnit, routeSlug, routeWords });
})(modulos['i18n']);

// ---- main ----
(function (modulo) {
'use strict';
const { Game, POWER_INFO } = modulos['engine'];
const { MODES, LEVELS, GROUPS, MODE_ORDER, COLS, ROWS } = modulos['levels'];
const { audio } = modulos['audio'];
const { attachInput } = modulos['input'];
const { t, getLanguage, setLanguage, modeName, modeTag, groupName, groupTag, levelName, fruitUnit, appleUnit, routeSlug, routeWords } = modulos['i18n'];

const $ = (sel) => document.querySelector(sel);

// si algo se rompe, que se vea en pantalla en vez de quedarse en negro
function avisar(mensaje) {
  if (typeof window.__snakeFallo === 'function') window.__snakeFallo(mensaje);
}

function comprobarPiezas() {
  const faltan = [];
  // BORRAR-COMPETITIVO · retirado en v1.0; sólo quedan los modos publicados.
  if (!MODES || !MODES.classic || !MODES.frenzy || !MODES.hunter || MODES.competitive) faltan.push('modos');
  if (!Array.isArray(LEVELS) || LEVELS.length !== 20) faltan.push('niveles');
  if (typeof Game !== 'function') faltan.push('motor');
  if (faltan.length) {
    avisar(t('missingPieces', { pieces: faltan.join(', ') }));
    return false;
  }
  return true;
}

const ORDEN = MODE_ORDER;
const CLAVE = 'snake.v2';
const CLAVE_ANTIGUA = 'snake.frenzy.v1';

const el = {
  stage: $('#stage'),
  canvas: $('#board'),
  overlay: $('#overlay'),
  prompt: $('#prompt'),
  meta: $('#hud-meta'),
  score: $('#hud-score'),
  best: $('#hud-best'),
  mult: $('#hud-mult'),
  chain: $('#chain-bar'),
  combo: $('#combo'),
  effects: $('#effects'),
  mute: $('#btn-mute'),
  pause: $('#btn-pause'),
  lang: $('#lang-switch'),
  hint: $('#hint'),
  avisoFoco: $('#aviso-foco'),
  barrido: $('#barrido'), // transición de bloques entre pantallas
};

const pincel = el.canvas.getContext('2d', { alpha: false });

/* ---------------------------------------------------------- récords */

function nuevoRegistro() {
  return {
    best: { classic: 0, frenzy: 0, hunter: 0 },
    campaign: { unlocked: 1 },
    sound: true,
    crt: true,
  };
}

function leerGuardado() {
  const datos = nuevoRegistro();
  let bruto = null;
  try {
    bruto = JSON.parse(localStorage.getItem(CLAVE) || 'null');
    if (!bruto) {
      const viejo = JSON.parse(localStorage.getItem(CLAVE_ANTIGUA) || 'null');
      if (viejo) {
        bruto = {
          best: viejo.best || {},
          campaign: viejo.campaign || {},
          sound: !viejo.muted,
        };
      }
    }
  } catch (err) {
    return datos;
  }
  if (!bruto || typeof bruto !== 'object') return datos;

  for (const modo of Object.keys(datos.best)) {
    datos.best[modo] = Number(bruto.best && bruto.best[modo]) || 0;
  }
  const camp = bruto.campaign || {};
  datos.campaign.unlocked = Math.min(
    LEVELS.length,
    Math.max(1, parseInt(camp.unlocked, 10) || 1),
  );
  if (typeof bruto.sound === 'boolean') datos.sound = bruto.sound;
  if (typeof bruto.crt === 'boolean') datos.crt = bruto.crt;
  return datos;
}

const guardado = leerGuardado();

function guardar() {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(guardado));
  } catch (err) {
    /* sin almacenamiento se juega igual */
  }
}

/* ---------------------------------------------------------- estado */

const app = {
  pantalla: 'home',
  modo: 'classic',
  nivel: 0,
  juego: null,
  demo: null,
  demoModo: null,
  demoAcum: 0,
  menuSel: 0,
  grupo: 0,
  modoSel: 0,
  nivelSel: 0,
  settingsReturn: 'modes',
  marca: 0,
  reloj: 0,
  temporizador: 0,
  record: false,
  chips: new Map(),
};

const rutas = { listas: false, restaurando: false };
const BASE_PATH = '/snake/';

const vista = { cell: 24, ox: 0, oy: 0, width: 480, height: 480, dpr: 1 };
const vistaDemo = { cell: 10, ox: 0, oy: 0, width: 200, height: 200, dpr: 1 };

const dosDigitos = (n) => String(n).padStart(2, '0');
const puntos = (n) => String(Math.max(0, Math.round(n || 0)));

function mejorActual() {
  if (app.modo === 'campaign') return 0;
  return guardado.best[app.modo] || 0;
}

function esTactil() {
  return window.matchMedia('(pointer: coarse)').matches;
}

function turboPermitido() {
  return app.pantalla === 'playing' && app.modo !== 'hunter';
}

function pararTemporizador() {
  if (app.temporizador) {
    clearTimeout(app.temporizador);
    app.temporizador = 0;
  }
}

/* ---------------------------------------------------------- rótulo
   "snake." dibujado con cinco serpientes: una por letra. Sólo la de la e tiene
   manzana y estira el último tramo del cuerpo para alcanzarla. */

// glifos de bloques; cada letra tiene cuerpo y cabeza independientes
const MARCA_GLIFOS = {
  s: ['.###', '#...', '.##.', '...#', '###.'],
  n: ['#..#', '##.#', '#.##', '#..#', '#..#'],
  a: ['.##.', '...#', '.###', '#..#', '.###'],
  k: ['#..#', '#.#.', '##..', '#.#.', '#..#'],
  e: ['###.', '#...', '##..', '#...', '###.'],
};
const MARCA_PALABRA = 'snake';
const ANCHO_GLIFO = 4;
const COLS_MARCA = 26; // 4 columnas por letra, 1 de hueco y el punto
const FILAS_MARCA = 5;
const marca = { t: 0, ancho: 0, alto: 0, dpr: 1 };

// construye una serpiente independiente por cada carácter (una por letra/dígito)
const serpientesDe = (texto, glifos) => {
  const serpientes = [];
  const caracteres = texto.split('');
  const desplazamiento = Math.max(0, Math.floor((COLS_MARCA - (caracteres.length * 5 + 1)) / 2));
  caracteres.forEach((letra, i) => {
    const glifo = glifos[letra];
    if (!glifo) return;
    const x0 = desplazamiento + i * 5;
    const cuerpo = [];
    let cabeza = null;
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < ANCHO_GLIFO; x++) {
        if (glifo[y][x] !== '#') continue;
        const celda = { x: x0 + x, y };
        if (cabeza) cuerpo.push(cabeza);
        cabeza = celda;
      }
    }
    // las otras letras se quedan en su sitio; sólo la e va a por la manzana final
    const ultimo = i === caracteres.length - 1 && letra === 'e';
    const objetivo = ultimo ? { x: x0 + 5, y: 4 } : cabeza;
    const punto = ultimo ? { ...objetivo } : null;
    if (cabeza) serpientes.push({ cuerpo, cabeza, objetivo, punto });
  });
  return serpientes;
};
const SERPIENTES_NOMBRE = serpientesDe(MARCA_PALABRA, MARCA_GLIFOS);

function ajustarMarca() {
  const lienzo = document.getElementById('marca');
  if (!lienzo) return;
  const caja = lienzo.parentElement ? lienzo.parentElement.getBoundingClientRect() : null;
  const ancho = Math.max(150, Math.min(caja && caja.width ? caja.width : 240, 300));
  const alto = Math.round((ancho * FILAS_MARCA) / COLS_MARCA);
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  lienzo.style.width = `${ancho}px`;
  lienzo.style.height = `${alto}px`;
  lienzo.width = Math.round(ancho * dpr);
  lienzo.height = Math.round(alto * dpr);
  Object.assign(marca, { ancho, alto, dpr });
}

// números de 4x5 para cuando el rótulo escribe el récord
const MARCA_DIGITOS = {
  0: ['.##.', '#..#', '#..#', '#..#', '.##.'],
  1: ['..#.', '.##.', '..#.', '..#.', '.###'],
  2: ['.##.', '#..#', '..#.', '.#..', '####'],
  3: ['###.', '...#', '.##.', '...#', '###.'],
  4: ['#..#', '#..#', '####', '...#', '...#'],
  5: ['###.', '#...', '###.', '...#', '###.'],
  6: ['.##.', '#...', '###.', '#..#', '.##.'],
  7: ['###.', '...#', '..#.', '.#..', '.#..'],
  8: ['.##.', '#..#', '.##.', '#..#', '.##.'],
  9: ['.##.', '#..#', '.###', '...#', '.##.'],
};

const CICLO_NOMBRE = 10000;
const CICLO_RECORD = 3000;

// el récord más alto de todo lo jugado: es lo que escribe la serpiente
function mejorGlobal() {
  let mejor = 0;
  for (const valor of Object.values(guardado.best || {})) mejor = Math.max(mejor, Number(valor) || 0);
  return Math.round(mejor);
}

function dibujarMarca(dt) {
  const lienzo = document.getElementById('marca');
  if (!lienzo || !marca.ancho) return;
  const ctx = lienzo.getContext('2d');

  // el rótulo alterna: el nombre y, si ya hay récord, la cifra escrita igual
  const record = mejorGlobal();
  const total = record > 0 ? CICLO_NOMBRE * 2 + CICLO_RECORD : CICLO_NOMBRE;
  marca.t = (marca.t + dt) % total;

  const lado = Math.floor(marca.ancho / COLS_MARCA);
  const sep = Math.max(1, Math.round(lado * 0.16));
  const tam = lado - sep * 2;
  const aire = Math.round((marca.ancho - lado * COLS_MARCA) / 2);

  ctx.setTransform(marca.dpr, 0, 0, marca.dpr, 0, 0);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, marca.ancho, marca.alto);

  const bloque = (cx, cy, color) => {
    ctx.fillStyle = color;
    ctx.fillRect(
      aire + Math.round(cx * lado) + sep,
      Math.round(cy * lado) + sep,
      tam,
      tam,
    );
  };

  // la cabeza: un bloque blanco con dos ojos negros que miran al punto
  const cara = (cx, cy, mira) => {
    bloque(cx, cy, '#ffffff');
    const ojo = Math.max(2, Math.round(tam * 0.2));
    for (const s of [-1, 1]) {
      const ex = aire + Math.round(cx * lado) + sep + tam / 2 + tam * mira;
      const ey = Math.round(cy * lado) + sep + tam / 2 + s * tam * 0.2;
      ctx.fillStyle = '#000';
      ctx.fillRect(Math.round(ex - ojo / 2), Math.round(ey - ojo / 2), ojo, ojo);
    }
  };

  // cinco serpientes, pero sólo la última tiene manzana y anima la mordida
  const cicloSerpientes = (serpientes, t) => {
    serpientes.forEach((serp) => {
      // El ciclo largo deja ver cómo la e avanza, bloque a bloque, hacia la manzana.
      const tt = t % CICLO_NOMBRE;
      let avance = 0;
      let comido = false;
      if (serp.punto) {
        if (tt >= 800 && tt < 6200) avance = (tt - 800) / 5400;
        else if (tt >= 6200 && tt < 8000) { avance = 1; comido = true; }
        else if (tt >= 8000) avance = 1 - (tt - 8000) / 2000;
      }

      serp.cuerpo.forEach((c, k) => {
        bloque(c.x, c.y, k % 5 === 4 ? '#cfcfcf' : '#e8e8e8');
      });

      if (serp.punto && !comido) {
        const m = Math.round(sep * 1.1);
        ctx.fillStyle = '#ff2b2b';
        ctx.fillRect(
          aire + Math.round(serp.punto.x * lado) + m,
          Math.round(serp.punto.y * lado) + m,
          lado - m * 2,
          lado - m * 2,
        );
      }

      const base = serp.cabeza;
      const destino = serp.objetivo || base;
      const cx = base.x + avance * (destino.x - base.x);
      const cy = base.y + avance * (destino.y - base.y);

      // El cuerpo se extiende de forma continua y lenta hasta la manzana.
      if (serp.punto && avance > 0) {
        bloque(base.x, base.y, '#cfcfcf');
        const dx = destino.x - base.x;
        const dy = destino.y - base.y;
        const x1 = aire + (base.x + 0.5) * lado;
        const y1 = base.y * lado + lado / 2;
        const x2 = aire + (cx + 0.5) * lado;
        const y2 = cy * lado + lado / 2;
        ctx.fillStyle = '#cfcfcf';
        if (dx) {
          ctx.fillRect(Math.min(x1, x2), y1 - tam / 2, Math.max(1, Math.abs(x2 - x1)), tam);
        } else {
          ctx.fillRect(x1 - tam / 2, Math.min(y1, y2), tam, Math.max(1, Math.abs(y2 - y1)));
        }
      }
      cara(cx, cy, avance > 0.05 ? 0.24 : 0.14);
    });
  };

  const t = marca.t;
  if (record > 0 && t >= CICLO_NOMBRE * 2) {
    const cifra = String(record).slice(-5);
    cicloSerpientes(serpientesDe(cifra, MARCA_DIGITOS), t - CICLO_NOMBRE * 2);
    return;
  }
  cicloSerpientes(SERPIENTES_NOMBRE, t);
}

/* ---------------------------------------------------------- lienzo */

function ajustarLienzo() {
  const caja = el.stage.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  // si el contenedor aún no tiene tamaño (pestaña oculta, iframe recién creado),
  // tiramos de la ventana para no quedarnos con un tablero de 0 px
  const anchoCaja = caja.width || window.innerWidth || 480;
  const altoCaja = caja.height || Math.max(240, (window.innerHeight || 720) * 0.6);
  // el tablero ocupa todo el hueco: celdas fraccionarias, sin bordes muertos
  const lado = Math.max(160, Math.min(anchoCaja, altoCaja) - 2);
  const celda = lado / Math.max(COLS, ROWS);
  const ancho = lado;
  const alto = lado;

  el.canvas.style.width = `${ancho}px`;
  el.canvas.style.height = `${alto}px`;
  el.canvas.width = Math.round(ancho * dpr);
  el.canvas.height = Math.round(alto * dpr);
  Object.assign(vista, { cell: celda, ox: 0, oy: 0, width: ancho, height: alto, dpr });

  ajustarMarca();

  const lienzoDemo = document.getElementById('demo');
  if (lienzoDemo) {
    const lado = Math.min(220, Math.max(140, Math.round(caja.width || 200)));
    lienzoDemo.style.width = `${lado}px`;
    lienzoDemo.style.height = `${lado}px`;
    lienzoDemo.width = Math.round(lado * dpr);
    lienzoDemo.height = Math.round(lado * dpr);
    Object.assign(vistaDemo, {
      cell: lado / COLS,
      ox: 0,
      oy: 0,
      width: lado,
      height: lado,
      dpr,
    });
  }
}

/* ---------------------------------------------------------- interfaz */

function ponerOverlay(html) {
  if (!html) {
    el.overlay.classList.remove('abierto');
    el.overlay.innerHTML = '';
    foco.indice = -1;
    return;
  }
  el.overlay.innerHTML = html;
  el.overlay.classList.add('abierto');
  el.overlay.scrollTop = 0;
}

/* ------------------------------------------------- barrido de pantallas

   cada cambio de pantalla tapa la vieja con una cortina de cubos y la vuelve a
   descubrir en escalera. son bloques enteros: no hay fundidos ni medios tonos. */

const barrido = { ctx: null, ancho: 0, alto: 0, dpr: 1, t: 0, activo: false, celdas: null };
const DURACION_BARRIDO = 260;

function sinMovimiento() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (err) {
    return false;
  }
}

function ajustarBarrido() {
  const lienzo = el.barrido;
  if (!lienzo) return false;
  const ancho = Math.max(1, Math.round(window.innerWidth || 480));
  const alto = Math.max(1, Math.round(window.innerHeight || 480));
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (barrido.ctx && barrido.ancho === ancho && barrido.alto === alto && barrido.dpr === dpr) return true;

  lienzo.style.width = `${ancho}px`;
  lienzo.style.height = `${alto}px`;
  lienzo.width = Math.round(ancho * dpr);
  lienzo.height = Math.round(alto * dpr);
  barrido.ctx = lienzo.getContext('2d');
  Object.assign(barrido, { ancho, alto, dpr });

  // cubos de unos 56 px: pocos y grandes, se leen como bloques
  const cols = Math.max(6, Math.round(ancho / 56));
  const filas = Math.max(4, Math.round(alto / 56));
  const cw = ancho / cols;
  const ch = alto / filas;
  const celdas = [];
  for (let y = 0; y < filas; y++) {
    for (let x = 0; x < cols; x++) {
      celdas.push({
        x: Math.floor(x * cw),
        y: Math.floor(y * ch),
        w: Math.ceil(cw) + 1,
        h: Math.ceil(ch) + 1,
        // el escalón va de la esquina de arriba a la izquierda a la de abajo a la derecha
        orden: (x + y) / Math.max(1, cols + filas - 2),
      });
    }
  }
  barrido.celdas = celdas;
  return true;
}

function pintarBarrido(quitado) {
  const ctx = barrido.ctx;
  if (!ctx || !barrido.celdas) return;
  ctx.setTransform(barrido.dpr, 0, 0, barrido.dpr, 0, 0);
  ctx.clearRect(0, 0, barrido.ancho, barrido.alto);
  ctx.fillStyle = '#000';
  for (const c of barrido.celdas) {
    if (c.orden < quitado) continue;
    ctx.fillRect(c.x, c.y, c.w, c.h);
  }
}

// se llama al cambiar de pantalla: la cortina ya está pintada antes de que el
// navegador dibuje, así que nunca se ve la pantalla nueva a medio montar
function taparPantalla() {
  if (!el.barrido || sinMovimiento()) return;
  if (!ajustarBarrido()) return;
  barrido.activo = true;
  barrido.t = 0;
  el.barrido.hidden = false;
  pintarBarrido(0);
}

function pasoBarrido(dt) {
  if (!barrido.activo) return;
  barrido.t += dt;
  const avance = Math.min(1, barrido.t / DURACION_BARRIDO);
  pintarBarrido(avance);
  if (avance >= 1) {
    barrido.activo = false;
    if (el.barrido) el.barrido.hidden = true;
  }
}

function pantalla(nombre) {
  const antes = app.pantalla;
  app.pantalla = nombre;
  document.body.dataset.screen = nombre;
  if (!app.juego) actualizarEfectos(null);
  // BORRAR-COMPETITIVO · pantallas y audio del modo retirados para v1.0.
  if (antes !== nombre) taparPantalla();
  actualizarPista();
  if (rutas.listas && !rutas.restaurando) sincronizarRuta(false);
}

const PISTAS = {
  home: 'hintHome',
  modes: 'hintModes',
  settings: 'hintSettings',
  levels: 'hintLevels',
  help: 'hintHelp',
  paused: 'hintPaused',
  dead: 'hintDead',
  cleared: 'hintCleared',
};

function actualizarPista() {
  if (app.pantalla === 'playing') {
    el.hint.textContent = esTactil()
      ? t('hintSwipe')
      : t(app.modo === 'hunter' ? 'hintGame' : 'hintGameTurbo');
    return;
  }
  el.hint.textContent = PISTAS[app.pantalla] ? t(PISTAS[app.pantalla]) : '';
}

const ALIAS_RUTA = routeWords();

function coincideRuta(segmento, clave) {
  return (ALIAS_RUTA[clave] || []).includes(segmento);
}

function rutaActual() {
  let camino = location.pathname;
  try {
    camino = decodeURIComponent(camino);
  } catch (error) {
    // Usamos la ruta sin decodificar si contiene escapes inválidos.
  }
  camino = camino.replace(/\/+$/, '');
  if (camino === '/snake' || camino === '/' || camino === '') return [];
  if (camino.startsWith('/snake/')) camino = camino.slice('/snake/'.length);
  else if (camino.startsWith('/')) camino = camino.slice(1);
  return camino.split('/').filter(Boolean).map((parte) => parte.toLowerCase());
}

function pantallaDeRuta() {
  const partes = rutaActual();
  const [primera, segunda] = partes;
  if (!primera) return { tipo: 'home' };

  if (coincideRuta(primera, 'modes')) {
    const grupo = coincideRuta(segunda || '', 'campaign') ? 0 : 1;
    return { tipo: 'modes', grupo };
  }
  if (coincideRuta(primera, 'help')) return { tipo: 'help' };
  if (coincideRuta(primera, 'settings')) return { tipo: 'settings' };
  if (coincideRuta(primera, 'campaign')) {
    const nivel = /^(?:nivel|level)-?(\d{1,2})$/.exec(segunda || '');
    return nivel
      ? { tipo: 'campaign-level', nivel: Number(nivel[1]) - 1 }
      : { tipo: 'levels' };
  }
  for (const modo of ['classic', 'frenzy', 'hunter']) {
    if (coincideRuta(primera, modo)) return { tipo: 'game', modo };
  }
  if (coincideRuta(primera, 'endless')) return { tipo: 'modes', grupo: 1 };
  return { tipo: 'home' };
}

function rutaDeEstado() {
  if (app.pantalla === 'home') return BASE_PATH;
  if (app.pantalla === 'modes') {
    const grupo = app.grupo === 0 ? 'campaign' : 'endless';
    return `${BASE_PATH}${routeSlug('modes')}/${routeSlug(grupo)}`;
  }
  if (app.pantalla === 'help') return `${BASE_PATH}${routeSlug('help')}`;
  if (app.pantalla === 'settings') return `${BASE_PATH}${routeSlug('settings')}`;
  if (app.pantalla === 'levels') return `${BASE_PATH}${routeSlug('campaign')}`;
  if (app.modo === 'campaign') {
    return `${BASE_PATH}${routeSlug('campaign')}/nivel-${dosDigitos(app.nivel + 1)}`;
  }
  return `${BASE_PATH}${routeSlug(app.modo)}`;
}

function sincronizarRuta(reemplazar = false) {
  if (location.protocol === 'file:') return;
  const destino = `${rutaDeEstado()}${location.hash}`;
  const actual = `${location.pathname}${location.search}${location.hash}`;
  if (actual === destino) return;
  const metodo = reemplazar ? 'replaceState' : 'pushState';
  history[metodo]({ snake: true }, '', destino);
}

function mostrarRuta(ruta) {
  if (ruta.tipo === 'modes') {
    mostrarModos(ruta.grupo);
  } else if (ruta.tipo === 'levels') {
    mostrarNiveles();
  } else if (ruta.tipo === 'help') {
    mostrarAyuda();
  } else if (ruta.tipo === 'settings') {
    mostrarAjustes('modes');
  } else if (ruta.tipo === 'game') {
    empezarPartida(ruta.modo, 0);
  } else if (ruta.tipo === 'campaign-level') {
    if (ruta.nivel >= 0 && ruta.nivel < LEVELS.length && ruta.nivel < guardado.campaign.unlocked) {
      empezarPartida('campaign', ruta.nivel);
    } else if (ruta.nivel >= 0 && ruta.nivel < LEVELS.length) {
      mostrarNiveles();
    } else {
      mostrarInicio();
    }
  } else {
    mostrarInicio();
  }
}

function restaurarRuta() {
  rutas.restaurando = true;
  mostrarRuta(pantallaDeRuta());
  rutas.restaurando = false;
  rutas.listas = true;
  sincronizarRuta(true);
}

window.addEventListener('popstate', () => {
  rutas.restaurando = true;
  mostrarRuta(pantallaDeRuta());
  rutas.restaurando = false;
  sincronizarRuta(true);
});

/* ---------------------------------------------------------- marcador */

function actualizarMarcador() {
  const juego = app.juego;
  if (!juego) {
    actualizarEfectos(null);
    return;
  }

  const esCampana = app.modo === 'campaign';
  if (el.combo) el.combo.hidden = esCampana;

  let meta;
  let valor;
  let marca;
  if (esCampana) {
    const nivel = LEVELS[app.nivel];
    const recogidas = Math.min(juego.fruits, nivel.goal);
    const restantes = Math.max(0, nivel.goal - recogidas);
    valor = puntos(recogidas);
    meta = t('campaignLevel', {
      number: dosDigitos(app.nivel + 1),
      name: levelName(nivel.name),
    });
    marca = t('applesRemaining', { count: restantes, unit: appleUnit(restantes) });
    el.mult.textContent = appleUnit(recogidas);
    el.mult.classList.remove('activo');
    el.chain.style.width = '0%';
  } else {
    valor = puntos(juego.score);
    meta = t('fruitScore', { mode: modeName(app.modo), fruits: juego.fruits, unit: fruitUnit(juego.fruits) });
    marca = t('best', { score: mejorActual() });
    const mult = juego.multiplier;
    el.mult.textContent = mult > 1 ? `×${mult}` : '';
    el.mult.classList.toggle('activo', mult > 1);
    el.chain.style.width = `${((juego.chainTimer / juego.chainWindow) * 100 || 0).toFixed(1)}%`;
  }

  if (el.score.textContent !== valor) el.score.textContent = valor;
  if (el.meta.textContent !== meta) el.meta.textContent = meta;
  if (el.best.textContent !== marca) el.best.textContent = marca;
  if (esCampana) el.mult.setAttribute('aria-label', appleUnit(juego.fruits));
  else el.mult.removeAttribute('aria-label');

  el.prompt.classList.toggle('visible', juego.state === 'ready');
  el.pause.textContent = t(app.pantalla === 'paused' ? 'resume' : 'pause');
  el.pause.title = t(app.pantalla === 'paused' ? 'resumeTitle' : 'pauseTitle');
  el.pause.disabled = app.pantalla !== 'playing' && app.pantalla !== 'paused';

  actualizarEfectos(juego);
}

function actualizarEfectos(juego) {
  const activos = [];
  if (juego) {
    if (juego.fx.ghost > 0) activos.push([t('ghost'), juego.fx.ghost / POWER_INFO.ghost.ms]);
    if (juego.fx.slow > 0) activos.push([t('slow'), juego.fx.slow / POWER_INFO.slow.ms]);
    if (juego.fx.shield > 0) activos.push([t('shield'), juego.fx.shield / POWER_INFO.shield.ms]);
    if (juego.fx.double > 0) activos.push([t('double'), juego.fx.double / POWER_INFO.double.ms]);
    if (juego.turbo && app.modo !== 'hunter') activos.push([t('turboEffect'), 1]);
    if (juego.cfg && juego.cfg.hunter && juego.hunter && juego.hunterPelea) {
      const tope = juego.cfg.hunterCap || 18;
      const umbral = juego.hunterUmbral();
      const largo = juego.hunter.body.length;
      activos.push([t('hunted'), largo >= tope ? 1 : (largo - umbral) / Math.max(1, tope - umbral)]);
    }
  }

  for (const [nombre, chip] of app.chips) {
    if (!activos.some(([n]) => n === nombre)) {
      chip.remove();
      app.chips.delete(nombre);
    }
  }

  for (const [nombre, fraccion] of activos) {
    let chip = app.chips.get(nombre);
    if (!chip) {
      chip = document.createElement('li');
      chip.className = 'chip';
      chip.innerHTML = `<span>${nombre}</span><i><b></b></i>`;
      el.effects.appendChild(chip);
      app.chips.set(nombre, chip);
    }
    const barra = chip.querySelector('b');
    barra.style.width = `${Math.max(0, Math.min(100, fraccion * 100)).toFixed(0)}%`;
    chip.classList.toggle('fijo', fraccion >= 1);
  }
}

/* ---------------------------------------------------------- foco de botones */

const foco = { indice: -1 };

// botones que se pueden alcanzar con las flechas en la capa abierta
function botonesUI() {
  if (!el.overlay.classList.contains('abierto')) return [];
  return [...el.overlay.querySelectorAll('button')].filter((b) => !b.disabled);
}

function pintarFoco() {
  const lista = botonesUI();
  lista.forEach((boton, i) => boton.classList.toggle('foco', i === foco.indice));
}

function marcar(boton) {
  // al enfocar una fila o una casilla, la selección va con ella
  if (!boton || !boton.dataset) return;
  if (app.pantalla === 'home' && boton.dataset.grupo !== undefined) {
    seleccionarGrupo(Number(boton.dataset.grupo));
  } else if (app.pantalla === 'modes' && boton.dataset.modo !== undefined) {
    seleccionarModo(Number(boton.dataset.i));
  } else if (app.pantalla === 'levels' && boton.dataset.nivel !== undefined) {
    seleccionarNivel(Number(boton.dataset.nivel));
  }
}

function enfocarUI(indice) {
  const lista = botonesUI();
  if (!lista.length) {
    foco.indice = -1;
    return;
  }
  foco.indice = ((indice % lista.length) + lista.length) % lista.length;
  pintarFoco();
  marcar(lista[foco.indice]);
  const activo = lista[foco.indice];
  if (activo && typeof activo.scrollIntoView === 'function') {
    try {
      activo.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    } catch (err) {
      /* sin scroll, no pasa nada */
    }
  }
}

function enfocarPrimero(selector) {
  const lista = botonesUI();
  const indice = lista.findIndex((b) => b.matches(selector));
  enfocarUI(indice >= 0 ? indice : 0);
}

// botones que forman el recorrido de las flechas en cada pantalla
function anilloFoco() {
  const todos = botonesUI();
  if (app.pantalla === 'home') {
    return todos.filter((b) => b.dataset.grupo !== undefined || b.classList.contains('link'));
  }
  if (app.pantalla === 'modes') return todos.filter((b) => b.dataset.modo !== undefined || b.dataset.accion === 'settings');
  if (app.pantalla === 'levels') return todos.filter((b) => b.dataset.nivel !== undefined);
  return todos;
}

// cuántas casillas hay por fila en la rejilla de niveles (4 por defecto)
function columnasRejilla(lista) {
  const tops = [];
  for (const boton of lista) {
    const top = Math.round(boton.getBoundingClientRect().top);
    if (!tops.includes(top)) tops.push(top);
    if (tops.length > 1) break;
  }
  if (tops.length < 2) return 4;
  const cuenta = lista.filter((b) => Math.round(b.getBoundingClientRect().top) === tops[0]).length;
  return cuenta > 0 ? cuenta : 4;
}

function fijarFoco(boton) {
  if (!boton) return;
  const lista = botonesUI();
  const indice = lista.indexOf(boton);
  if (indice < 0) return;
  foco.indice = indice;
  pintarFoco();
  marcar(boton);
  if (typeof boton.scrollIntoView === 'function') {
    try {
      boton.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    } catch (err) {
      /* sin scroll, no pasa nada */
    }
  }
}

// flechas: recorren el anillo de la pantalla; en la rejilla, ↑↓ saltan de fila
function moverFoco(dx, dy) {
  const anillo = anilloFoco();
  if (!anillo.length) return;
  const actual = botonesUI()[foco.indice];
  let i = anillo.indexOf(actual);
  if (i < 0) {
    fijarFoco(anillo[0]);
    return;
  }
  let paso;
  if (app.pantalla === 'levels') {
    paso = dy !== 0 ? dy * columnasRejilla(anillo) : dx;
  } else {
    paso = dx !== 0 ? dx : dy;
  }
  const total = anillo.length;
  const siguiente = i + paso;
  // en la rejilla de niveles no se da la vuelta: se queda en el borde
  if (app.pantalla === 'levels' && (siguiente < 0 || siguiente >= total)) return;
  const destino = anillo[((siguiente % total) + total) % total];
  fijarFoco(destino);
}

function activarFoco() {
  const lista = botonesUI();
  const boton = lista[foco.indice];
  if (!boton) return false;
  audio.play('ui');
  boton.click();
  return true;
}

/* ---------------------------------------------------------- menú */

function modosDelGrupo(indice = app.grupo) {
  return GROUPS[((indice % GROUPS.length) + GROUPS.length) % GROUPS.length].modes;
}

function descripcion(modo) {
  if (modo === 'campaign') {
    return t('campaignDescription', { cleared: guardado.campaign.unlocked - 1 });
  }
  return modeTag(modo);
}

function valorDerecha(modo) {
  if (modo === 'campaign') return `${guardado.campaign.unlocked - 1}/${LEVELS.length}`;
  const mejor = guardado.best[modo] || 0;
  return mejor ? String(mejor) : '—';
}

function resumenGrupo(indice) {
  const grupo = GROUPS[indice];
  if (indice === 0) return `${guardado.campaign.unlocked - 1}/${LEVELS.length}`;
  const hechos = grupo.modes.filter((m) => (guardado.best[m] || 0) > 0).length;
  return `${hechos}/${grupo.modes.length}`;
}

// la portada enseña cada grupo; la demo es un modo que lo representa
function modoDeGrupo(indice) {
  const grupo = GROUPS[indice];
  if (indice === 0) return 'campaign';
  const conRecord = grupo.modes.filter((m) => (guardado.best[m] || 0) > 0);
  return (conRecord[conRecord.length - 1]) || grupo.modes[0];
}

function filaModo(modo, i) {
  return `<button class="row" type="button" data-modo="${modo}" data-i="${i}">
    <span class="row-idx">${dosDigitos(i + 1)}</span>
    <span class="row-name">${modeName(modo)}<small>${descripcion(modo)}</small></span>
    <span class="row-right">${valorDerecha(modo)}</span>
  </button>`;
}

function mostrarInicio() {
  pararTemporizador();
  app.juego = null;
  app.grupo = Math.min(app.grupo, GROUPS.length - 1);
  app.demoModo = null;

  const filas = GROUPS.map((grupo, i) => `<button class="row" type="button" data-grupo="${i}" data-i="${i}">
      <span class="row-idx">${dosDigitos(i + 1)}</span>
      <span class="row-name">${groupName(i)}<small>${groupTag(i)}${grupo.modes.length > 1 ? ` · ${grupo.modes.length} ${t('modes')}` : ''}</small></span>
      <span class="row-right">${resumenGrupo(i)}</span>
    </button>`).join('');

  ponerOverlay(`<div class="panel inicio portada">
    <div class="inicio-texto">
      <header class="inicio-cabeza">
        <h1 class="marca"><canvas id="marca" role="img" aria-label="snake"></canvas></h1>
        <p class="kicker">${t('menuSubtitle')}</p>
      </header>
      <nav class="filas" aria-label="${t('groupAria')}">${filas}</nav>
      <p class="pie">
        <button class="link" type="button" data-accion="help">${t('controls')}</button>
      </p>
    </div>
    <aside class="inicio-demo">
      <p class="kicker" id="demo-titulo">${t('preview')}</p>
      <canvas id="demo" aria-label="${t('preview')}"></canvas>
      <p class="nota" id="demo-nota">${t('previewGroupHint')}</p>
    </aside>
  </div>`);

  el.score.textContent = '—';
  el.meta.textContent = t('chooseGroup');
  el.best.textContent = '';
  el.mult.textContent = '';
  el.chain.style.width = '0%';
  el.pause.disabled = true;
  el.pause.textContent = t('pause');
  el.pause.title = t('pauseTitle');
  el.prompt.classList.remove('visible');
  pantalla('home');
  seleccionarGrupo(app.grupo);
  enfocarPrimero(`.row[data-grupo="${app.grupo}"]`);
  ajustarLienzo();
}

function seleccionarGrupo(i) {
  const total = GROUPS.length;
  app.grupo = ((i % total) + total) % total;
  el.overlay.querySelectorAll('[data-grupo]').forEach((nodo) => {
    if (nodo.classList.contains('tab')) return;
    nodo.classList.toggle('sel', Number(nodo.dataset.grupo) === app.grupo);
  });
  const modo = modoDeGrupo(app.grupo);
  if (app.demoModo !== modo) crearDemo(modo);
  pintarTituloDemo(modo, 'grupo');
}

function mostrarModos(indice = app.grupo) {
  pararTemporizador();
  app.juego = null;
  app.demo = null;
  app.grupo = ((indice % GROUPS.length) + GROUPS.length) % GROUPS.length;
  app.modoSel = 0;
  app.demoModo = null;

  const grupo = GROUPS[app.grupo];
  const filas = grupo.modes.map((modo, i) => filaModo(modo, i)).join('');
  const tabs = GROUPS.map((g, i) =>
    `<button class="tab${i === app.grupo ? ' sel' : ''}" type="button" data-tab="${i}">${groupName(i)}</button>`).join('');

  ponerOverlay(`<div class="panel modos">
    <div class="niveles-cabeza">
      <div>
        <p class="kicker">${t('menuNumber', { number: dosDigitos(app.grupo + 1) })}</p>
        <h2>${groupName(app.grupo)}</h2>
      </div>
      <button class="ghost" type="button" data-accion="home">${t('groups')} <kbd>esc</kbd></button>
    </div>
    <nav class="tabs" aria-label="${t('switchGroup')}">${tabs}</nav>
    <div class="modos-cuerpo">
      <div>
        <nav class="filas" aria-label="${t('modes')}">${filas}</nav>
        <p class="pie"><button class="link" type="button" data-accion="settings">${t('settings')}</button></p>
      </div>
      <aside class="inicio-demo">
        <p class="kicker" id="demo-titulo">${t('preview')}</p>
        <canvas id="demo" aria-label="${t('previewMode')}"></canvas>
        <p class="nota" id="demo-nota"></p>
      </aside>
    </div>
    <p class="pie"><span>${t('chooseMode')}</span></p>
  </div>`);

  el.score.textContent = '—';
  el.meta.textContent = groupName(app.grupo);
  el.best.textContent = '';
  el.mult.textContent = '';
  el.chain.style.width = '0%';
  el.pause.disabled = true;
  el.pause.textContent = t('pause');
  el.pause.title = t('pauseTitle');
  el.prompt.classList.remove('visible');
  pantalla('modes');
  seleccionarModo(0);
  enfocarPrimero('.row[data-modo]');
  ajustarLienzo();
}

function seleccionarModo(i) {
  const modos = modosDelGrupo();
  const total = modos.length;
  app.modoSel = ((i % total) + total) % total;
  app.menuSel = ORDEN.indexOf(modos[app.modoSel]);
  el.overlay.querySelectorAll('.row[data-modo]').forEach((nodo, j) => {
    nodo.classList.toggle('sel', j === app.modoSel);
  });
  const modo = modos[app.modoSel];
  if (app.demoModo !== modo) crearDemo(modo);
  pintarTituloDemo(modo, 'modo');
}

function elegirModo(modo) {
  if (modo === 'campaign') mostrarNiveles();
  else empezarPartida(modo, 0);
}

/* ---------------------------------------------------------- niveles */

function mostrarNiveles() {
  pararTemporizador();
  app.juego = null;
  app.demo = null;
  app.nivelSel = Math.min(guardado.campaign.unlocked - 1, LEVELS.length - 1);
  pintarNiveles();
  el.score.textContent = '—';
  el.meta.textContent = t('campaign');
  el.best.textContent = '';
  el.mult.textContent = '';
  el.chain.style.width = '0%';
  el.pause.disabled = true;
  el.pause.textContent = t('pause');
  el.pause.title = t('pauseTitle');
  el.prompt.classList.remove('visible');
}

function pintarNiveles() {
  el.score.textContent = '—';
  el.meta.textContent = t('campaign');
  el.best.textContent = '';
  el.mult.textContent = '';
  el.chain.style.width = '0%';
  el.pause.disabled = true;
  el.pause.textContent = t('pause');
  el.pause.title = t('pauseTitle');
  el.prompt.classList.remove('visible');

  const celdas = LEVELS.map((nivel, i) => {
    const bloqueado = i >= guardado.campaign.unlocked;
    const hecho = i < guardado.campaign.unlocked - 1;
    return `<button class="celda${bloqueado ? ' bloqueada' : ''}${hecho ? ' hecha' : ''}"
      type="button" data-nivel="${i}"${bloqueado ? ' aria-disabled="true"' : ''}>
      <span class="celda-top"><span class="celda-num">${dosDigitos(i + 1)}</span>${hecho ? '<span class="celda-tick">✓</span>' : ''}</span>
      <span class="celda-nombre">${bloqueado ? '· · ·' : levelName(nivel.name)}</span>
      <span class="celda-meta">${bloqueado ? t('blocked') : t('fruits', { count: nivel.goal, unit: appleUnit(nivel.goal) })}</span>
    </button>`;
  }).join('');

  ponerOverlay(`<div class="panel niveles">
    <div class="niveles-cabeza">
      <div>
        <p class="kicker">${t('campaign')} · ${t('campaignProgress', { cleared: guardado.campaign.unlocked - 1, total: LEVELS.length })}</p>
        <h2>${t('chooseLevel')}</h2>
      </div>
      <button class="ghost" type="button" data-accion="modos">${t('groups')} <kbd>esc</kbd></button>
    </div>
    <div class="niveles-cuerpo">
      <div class="rejilla">${celdas}</div>
      <aside class="vistazo">
        <canvas id="preview" aria-label="${t('preview')}"></canvas>
        <p class="kicker" id="vistazo-nombre"></p>
        <p class="nota" id="vistazo-datos"></p>
      </aside>
    </div>
    <p class="pie"><span>${t('levelControls')}</span></p>
  </div>`);

  pantalla('levels');
  seleccionarNivel(app.nivelSel);
  enfocarPrimero(`.celda[data-nivel="${app.nivelSel}"]`);
}

function seleccionarNivel(i) {
  const total = LEVELS.length;
  app.nivelSel = ((i % total) + total) % total;
  el.overlay.querySelectorAll('.celda').forEach((nodo, j) => {
    nodo.classList.toggle('sel', j === app.nivelSel);
  });
  pintarVistazo(app.nivelSel);
}

function pintarVistazo(indice) {
  const nivel = LEVELS[indice];
  const lienzo = document.getElementById('preview');
  if (!lienzo) return;
  const lado = 168;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  lienzo.style.width = `${lado}px`;
  lienzo.style.height = `${lado}px`;
  lienzo.width = Math.round(lado * dpr);
  lienzo.height = Math.round(lado * dpr);

  const ctx = lienzo.getContext('2d');
  const celda = lado / COLS;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, lado, lado);
  ctx.fillStyle = '#141414';
  for (let n = 1; n < COLS; n++) {
    ctx.fillRect(Math.round(n * celda), 0, 1, lado);
    ctx.fillRect(0, Math.round(n * celda), lado, 1);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.36)';
  ctx.lineWidth = 1;
  const muro = Math.max(2, Math.round(celda - 2));
  for (const [x, y] of nivel.walls) {
    ctx.strokeRect(Math.round(x * celda) + 1.5, Math.round(y * celda) + 1.5, muro - 1, muro - 1);
  }
  ctx.strokeStyle = '#ffffff';
  ctx.strokeRect(0.5, 0.5, lado - 1, lado - 1);

  const nombre = document.getElementById('vistazo-nombre');
  const datos = document.getElementById('vistazo-datos');
  if (nombre) nombre.textContent = t('levelNumberName', { number: dosDigitos(indice + 1), name: levelName(nivel.name) });
  if (datos) {
    datos.textContent = t('levelPreviewData', {
      goal: nivel.goal,
      speed: nivel.speed,
      unit: appleUnit(nivel.goal),
    });
  }
}

function elegirNivel(indice) {
  if (indice >= guardado.campaign.unlocked) {
    audio.play('locked');
    return;
  }
  empezarPartida('campaign', indice);
}

/* ---------------------------------------------------------- ayuda */

function mostrarAyuda() {
  el.score.textContent = '—';
  el.meta.textContent = t('controls');
  el.best.textContent = '';
  el.mult.textContent = '';
  el.chain.style.width = '0%';
  el.pause.disabled = true;
  el.pause.textContent = t('pause');
  el.pause.title = t('pauseTitle');
  el.prompt.classList.remove('visible');

  ponerOverlay(`<div class="panel ayuda">
    <div class="niveles-cabeza">
      <div>
        <p class="kicker">${t('helpTitle')}</p>
        <h2>${t('helpHeading')}</h2>
      </div>
      <button class="ghost" type="button" data-accion="home">${t('back')}</button>
    </div>
    <table class="tabla">
      <tbody>
        <tr><th>${t('turn')}</th><td>${t('turnKeys')}</td></tr>
        <tr><th>${t('turbo')}</th><td>${t('turboKeys')}</td></tr>
        <tr><th>${t('pauseHelp')}</th><td>${t('pauseKeys')}</td></tr>
        <tr><th>${t('restart')}</th><td>${t('restartKeys')}</td></tr>
        <tr><th>${t('menus')}</th><td>${t('menuKeys')}</td></tr>
      </tbody>
    </table>
    <p class="kicker">${t('gameRules')}</p>
    <ul class="reglas">
      <li>${t('ruleChain')}</li>
      <li>${t('ruleCampaign')}</li>
      <li>${t('ruleModes')}</li>
      <li>${t('ruleHunter')}</li>
      <li>${t('powerBasics')}</li>
      <li>${t('powerAdvanced')}</li>
    </ul>
  </div>`);
  pantalla('help');
  enfocarPrimero('button[data-accion="home"]');
}

function ajustesDesde() {
  if (app.settingsReturn === 'modes') mostrarModos(app.grupo);
  else mostrarInicio();
}

function mostrarAjustes(desde = app.pantalla, focoInicial = 'button[data-accion="settingsBack"]') {
  app.settingsReturn = desde === 'home' ? 'home' : 'modes';
  pararTemporizador();
  app.juego = null;
  app.demo = null;

  const sonido = guardado.sound;
  const trama = guardado.crt;
  const botonEstado = (activo) => t(activo ? 'enabled' : 'disabled');

  ponerOverlay(`<div class="panel niveles">
    <div class="niveles-cabeza">
      <h2>${t('settings')}</h2>
      <button class="ghost" type="button" data-accion="settingsBack">${t('back')} <kbd>esc</kbd></button>
    </div>
    <nav class="filas" aria-label="${t('settings')}">
      <button class="row" type="button" data-accion="toggleSound" aria-pressed="${sonido}">
        <span class="row-idx">01</span>
        <span class="row-name">${t('sound')}</span>
        <span class="row-right">${botonEstado(sonido)}</span>
      </button>
      <button class="row" type="button" data-accion="crt" aria-pressed="${trama}">
        <span class="row-idx">02</span>
        <span class="row-name">${t('scanlines')}</span>
        <span class="row-right">${botonEstado(trama)}</span>
      </button>
      <button class="row" type="button" data-accion="wipe">
        <span class="row-idx">03</span>
        <span class="row-name">${t('clearRecords')}</span>
      </button>
    </nav>
  </div>`);

  el.score.textContent = '—';
  el.meta.textContent = t('settings');
  el.best.textContent = '';
  el.mult.textContent = '';
  el.chain.style.width = '0%';
  el.pause.disabled = true;
  el.pause.textContent = t('pause');
  el.pause.title = t('pauseTitle');
  el.prompt.classList.remove('visible');
  pantalla('settings');
  enfocarPrimero(focoInicial);
}

// BORRAR-COMPETITIVO · rangos y salas eliminados en v1.0.

/* ---------------------------------------------------------- partida */

function configuracion(modo, nivel) {
  if (modo !== 'campaign') return { ...MODES[modo] };
  const datos = LEVELS[nivel];
  return {
    cols: COLS,
    rows: ROWS,
    walls: datos.walls,
    startSpeed: datos.speed,
    minSpeed: datos.minSpeed,
    accelPerFood: datos.accelPerFood,
    wrap: false,
    goal: datos.goal,
    scoring: false,
    bonusEvery: datos.bonusEvery,
    powerEvery: datos.powerEvery,
    powerPool: datos.powerPool,
    chainWindow: datos.chainWindow,
  };
}

function empezarPartida(modo, nivel = 0) {
  pararTemporizador();
  audio.unlock();
  app.demo = null;
  app.modo = modo;
  app.nivel = nivel;
  app.record = false;
  app.juego = new Game(configuracion(modo, nivel), eventosJuego);
  app.marca = mejorActual();

  ponerOverlay(null);
  pantalla('playing');
  ajustarLienzo();
  actualizarMarcador();
}

function eventosJuego(tipo, datos) {
  switch (tipo) {
    case 'start':
      audio.play('start');
      break;
    case 'eat':
      audio.play('bite', datos);
      parpadear(el.score);
      break;
    case 'bonus':
      audio.play('bonus');
      parpadear(el.score);
      break;
    case 'power':
      audio.play('power', datos);
      parpadear(el.score);
      break;
    case 'shield':
      audio.play('shield', datos);
      break;
    case 'turbo':
      audio.play('turbo');
      break;
    case 'hunterEat':
      audio.play('hunterEat');
      break;
    case 'wall':
      audio.play('wall');
      break;
    case 'wallSoon':
      audio.play('alerta');
      break;
    case 'pellet':
      audio.play('pellet');
      parpadear(el.score);
      parpadear(el.mult);
      break;
    case 'bite':
      audio.play('hunterEat');
      parpadear(el.score);
      parpadear(el.mult);
      break;
    case 'hunterHunt':
      audio.play('alerta');
      parpadear(el.meta);
      break;
    case 'hunterDies':
      audio.play('hunterDies');
      parpadear(el.score);
      break;
    case 'combo':
      audio.play('combo', datos);
      parpadear(el.mult);
      break;
    case 'die':
      audio.play('death');
      guardarMarca();
      app.temporizador = setTimeout(mostrarFin, 900);
      break;
    case 'clear':
      audio.play(app.nivel >= LEVELS.length - 1 ? 'campaignComplete' : 'level');
      guardarMarca();
      guardado.campaign.unlocked = Math.max(
        guardado.campaign.unlocked,
        Math.min(LEVELS.length, app.nivel + 2),
      );
      guardar();
      app.temporizador = setTimeout(mostrarNivelSuperado, 540);
      break;
    default:
      break;
  }
}

function guardarMarca() {
  const juego = app.juego;
  if (!juego || app.modo === 'campaign') return;
  guardado.best[app.modo] = Math.max(guardado.best[app.modo] || 0, juego.score);
  guardar();
}

function resumenManzanas(juego) {
  const objetivo = LEVELS[app.nivel].goal;
  const recogidas = Math.min(juego.fruits, objetivo);
  const restantes = Math.max(0, objetivo - recogidas);
  return t('campaignRunSummary', {
    collected: recogidas,
    remaining: restantes,
  });
}

function mostrarFin() {
  const juego = app.juego;
  if (!juego || juego.state !== 'dead') return;
  const esCampana = app.modo === 'campaign';
  app.record = !esCampana && juego.score > app.marca;
  const meta = esCampana
    ? resumenManzanas(juego)
    : t('recordFruitMeta', {
      record: Math.max(app.marca, juego.score),
      fruits: juego.fruits,
      unit: fruitUnit(juego.fruits),
    });
  const cifra = esCampana ? puntos(juego.fruits) : puntos(juego.score);

  ponerOverlay(`<div class="panel fin">
    <div class="fin-cabeza">
      <p class="kicker">${t(!esCampana && app.record ? 'recordNew' : 'end')}</p>
      <p class="cifra" data-cifra>${cifra}</p>
      <p class="nota">${meta}</p>
    </div>
    <div class="acciones">
      <button class="principal" type="button" data-accion="retry">${t('retry')} <kbd>R</kbd></button>
      <button type="button" data-accion="home">${t('menu')} <kbd>esc</kbd></button>
    </div>
  </div>`);
  pantalla('dead');
  if (!esCampana) animarCifra(el.overlay.querySelector('[data-cifra]'), juego.score);
  enfocarPrimero('button[data-accion="retry"]');
  el.pause.disabled = true;
  el.prompt.classList.remove('visible');
  actualizarMarcador();
}

function mostrarNivelSuperado() {
  const juego = app.juego;
  if (!juego || juego.state !== 'cleared') return;
  const ultimo = app.nivel >= LEVELS.length - 1;
  const siguiente = LEVELS[Math.min(app.nivel + 1, LEVELS.length - 1)];
  const detalle = ultimo
    ? t('campaignComplete')
    : t('nextLevelMeta', {
      name: levelName(siguiente.name),
      goal: siguiente.goal,
      unit: appleUnit(siguiente.goal),
    });

  ponerOverlay(`<div class="panel fin">
    <div class="fin-cabeza">
      <p class="kicker">${t('levelCleared', { number: dosDigitos(app.nivel + 1) })}</p>
      <p class="cifra" data-cifra>${puntos(juego.fruits)}</p>
      <p class="nota">${resumenManzanas(juego)} · ${detalle}</p>
    </div>
    <div class="acciones">
      ${ultimo ? '' : `<button class="principal" type="button" data-accion="next">${t('next')} <kbd>↵</kbd></button>`}
      <button${ultimo ? ' class="principal"' : ''} type="button" data-accion="retry">${t('repeat')} <kbd>R</kbd></button>
      <button type="button" data-accion="home">${t('menu')} <kbd>esc</kbd></button>
    </div>
  </div>`);
  pantalla('cleared');
  enfocarPrimero('button.principal');
  el.pause.disabled = true;
  el.prompt.classList.remove('visible');
}

// un parpadeo corto para dar feedback sin llenar la pantalla
function parpadear(nodo) {
  if (!nodo) return;
  nodo.classList.remove('golpe');
  void nodo.offsetWidth;
  nodo.classList.add('golpe');
  clearTimeout(nodo._golpe);
  nodo._golpe = setTimeout(() => nodo.classList.remove('golpe'), 260);
}

// la cifra final sube hasta el marcador: se lee mejor y da un segundo de premio
function animarCifra(nodo, total) {
  if (!nodo) return;
  const objetivo = Math.max(0, Math.round(total || 0));
  const inicio = performance.now();
  const duracion = 520;
  const paso = (ahora) => {
    const t = Math.min(1, (ahora - inicio) / duracion);
    const suave = 1 - Math.pow(1 - t, 3);
    nodo.textContent = puntos(objetivo * suave);
    if (t < 1 && nodo.isConnected) requestAnimationFrame(paso);
  };
  nodo.textContent = '0';
  requestAnimationFrame(paso);
  // si el navegador no repinta (pestaña oculta), al menos queda la cifra buena
  setTimeout(() => {
    if (nodo.isConnected) nodo.textContent = puntos(objetivo);
  }, duracion + 80);
}

/* ---------------------------------------------------------- pausa */

function mostrarPausa() {
  const juego = app.juego;
  if (!juego) return;
  const esCampana = app.modo === 'campaign';
  const cifra = puntos(esCampana ? juego.fruits : juego.score);
  const nota = esCampana
    ? resumenManzanas(juego)
    : t('fruitsRecord', {
      fruits: juego.fruits,
      record: Math.max(app.marca, juego.score),
      unit: fruitUnit(juego.fruits),
    });

  ponerOverlay(`<div class="panel fin">
    <div class="fin-cabeza">
      <p class="kicker">${t('paused')}</p>
      <p class="cifra">${cifra}</p>
      <p class="nota">${nota}</p>
    </div>
    <div class="acciones">
      <button class="principal" type="button" data-accion="resume">${t('resume')} <kbd>P</kbd></button>
      <button type="button" data-accion="retry">${t('restart')} <kbd>R</kbd></button>
      <button type="button" data-accion="home">${t('menu')} <kbd>esc</kbd></button>
    </div>
  </div>`);
  enfocarPrimero('button[data-accion="resume"]');
  el.pause.textContent = t('resume');
  el.pause.title = t('resumeTitle');
  el.pause.disabled = false;
  el.prompt.classList.remove('visible');
}

function pausar() {
  if (!app.juego || app.pantalla !== 'playing') return;
  app.juego.pause();
  if (app.juego.state !== 'paused') return;
  audio.play('ui');
  pantalla('paused');
  mostrarPausa();
}

function reanudar() {
  if (!app.juego) return;
  app.juego.resume();
  ponerOverlay(null);
  foco.indice = -1;
  pantalla('playing');
  el.pause.textContent = t('pause');
  el.pause.title = t('pauseTitle');
  el.pause.disabled = false;
}

function alternarPausa() {
  if (app.pantalla === 'paused') reanudar();
  else pausar();
}

/* ---------------------------------------------------------- acciones */

function soltarFoco() {
  const activo = document.activeElement;
  if (activo && activo !== document.body && activo.blur) activo.blur();
}

function accion(nombre) {
  if (nombre === 'mute') {
    alternarSonido();
    return;
  }

  audio.unlock();


  if (nombre === 'tap') {
    if (turboPermitido() && app.juego) app.juego.toggleTurbo();
    return;
  }
  if (nombre === 'turboOn') {
    if (turboPermitido() && app.juego) app.juego.setTurbo(true);
    return;
  }
  if (nombre === 'turboOff') {
    if (app.juego) app.juego.setTurbo(false);
    return;
  }
  if (nombre === 'padConectado') {
    el.hint.textContent = t('gamepadConnected');
    return;
  }

  const esDireccion = ['up', 'down', 'left', 'right'].includes(nombre);

  if (app.pantalla === 'home') {
    if (nombre === 'up') moverFoco(0, -1);
    else if (nombre === 'down') moverFoco(0, 1);
    else if (nombre === 'left' || nombre === 'right') {
      const paso = nombre === 'left' ? -1 : 1;
      const total = GROUPS.length;
      const destino = ((app.grupo + paso) % total + total) % total;
      seleccionarGrupo(destino);
      enfocarPrimero(`.row[data-grupo="${destino}"]`);
    } else if (nombre === 'confirm') {
      if (!activarFoco()) {
        audio.play('ui');
        mostrarModos(app.grupo);
      }
    }
    return;
  }

  if (app.pantalla === 'modes') {
    if (nombre === 'up') moverFoco(0, -1);
    else if (nombre === 'down') moverFoco(0, 1);
    else if (nombre === 'left' || nombre === 'right') {
      audio.play('ui');
      mostrarModos(app.grupo + (nombre === 'left' ? -1 : 1));
    } else if (nombre === 'confirm') {
      const lista = botonesUI();
      const actual = lista[foco.indice];
      if (actual && actual.dataset.modo !== undefined) {
        audio.play('ui');
        elegirModo(actual.dataset.modo);
      } else if (!activarFoco()) {
        audio.play('ui');
        elegirModo(modosDelGrupo()[app.modoSel]);
      }
    } else if (nombre === 'back' || nombre === 'pause') {
      mostrarInicio();
    }
    return;
  }

  if (app.pantalla === 'levels') {
    if (nombre === 'up') moverFoco(0, -1);
    else if (nombre === 'down') moverFoco(0, 1);
    else if (nombre === 'left') moverFoco(-1, 0);
    else if (nombre === 'right') moverFoco(1, 0);
    else if (nombre === 'confirm') {
      audio.play('ui');
      const lista = botonesUI();
      const actual = lista[foco.indice];
      if (actual && actual.dataset.nivel !== undefined) elegirNivel(Number(actual.dataset.nivel));
      else if (!activarFoco()) elegirNivel(app.nivelSel);
    } else if (nombre === 'back' || nombre === 'pause') mostrarModos(0);
    return;
  }

  if (app.pantalla === 'help') {
    if (nombre === 'up' || nombre === 'down' || nombre === 'left' || nombre === 'right') {
      moverFoco(nombre === 'left' ? -1 : nombre === 'right' ? 1 : 0, nombre === 'up' ? -1 : nombre === 'down' ? 1 : 0);
    } else if (nombre === 'back' || nombre === 'pause' || nombre === 'confirm') mostrarInicio();
    return;
  }

  if (app.pantalla === 'settings') {
    if (nombre === 'up' || nombre === 'down' || nombre === 'left' || nombre === 'right') {
      moverFoco(nombre === 'left' ? -1 : nombre === 'right' ? 1 : 0, nombre === 'up' ? -1 : nombre === 'down' ? 1 : 0);
    } else if (nombre === 'confirm') activarFoco();
    else if (nombre === 'back' || nombre === 'pause') ajustesDesde();
    return;
  }

  if (app.pantalla === 'paused' || app.pantalla === 'dead' || app.pantalla === 'cleared') {
    if (esDireccion) {
      moverFoco(nombre === 'left' ? -1 : nombre === 'right' ? 1 : 0, nombre === 'up' ? -1 : nombre === 'down' ? 1 : 0);
      return;
    }
    if (nombre === 'confirm') {
      activarFoco();
      return;
    }
    if (nombre === 'restart') {
      if (app.pantalla === 'paused') empezarPartida(app.modo, app.nivel);
      else if (app.pantalla === 'cleared') empezarPartida('campaign', app.nivel);
      else empezarPartida(app.modo, app.nivel);
      return;
    }
    if (nombre === 'back') mostrarInicio();
    else if (nombre === 'pause' && app.pantalla === 'paused') reanudar();
    return;
  }

  // jugando
  if (nombre === 'pause') {
    alternarPausa();
    return;
  }
  if (nombre === 'back') {
    pausar();
    return;
  }
  if (nombre === 'restart') {
    if (app.juego) empezarPartida(app.modo, app.nivel);
    return;
  }
  if (!esDireccion) return;

  const direcciones = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const [dx, dy] = direcciones[nombre];
  if (app.juego) app.juego.setDirection(dx, dy);
}

function ejecutar(nombre) {
  switch (nombre) {
    case 'retry':
      empezarPartida(app.modo, app.nivel);
      break;
    case 'next':
      empezarPartida('campaign', Math.min(app.nivel + 1, LEVELS.length - 1));
      break;
    case 'resume':
      reanudar();
      break;
    case 'home':
      mostrarInicio();
      break;
    case 'modos':
      mostrarInicio();
      break;
    case 'help':
      mostrarAyuda();
      break;
    case 'settings':
      mostrarAjustes(app.pantalla);
      break;
    case 'settingsBack':
      ajustesDesde();
      break;
    case 'toggleSound':
      alternarSonido();
      mostrarAjustes(app.settingsReturn, 'button[data-accion="toggleSound"]');
      break;
    case 'crt':
      guardado.crt = !guardado.crt;
      guardar();
      document.documentElement.classList.toggle('trama', guardado.crt);
      if (app.pantalla === 'settings') mostrarAjustes(app.settingsReturn, 'button[data-accion="crt"]');
      else mostrarInicio();
      break;
    case 'wipe':
      borrarRecords();
      break;
    default:
      break;
  }
}

function borrarRecords() {
  if (!window.confirm(t('eraseConfirm'))) return;
  guardado.best = { classic: 0, frenzy: 0, hunter: 0 };
  guardado.campaign = { unlocked: 1 };
  guardar();
  audio.play('ui');
  if (app.pantalla === 'settings') mostrarAjustes(app.settingsReturn, 'button[data-accion="wipe"]');
  else mostrarInicio();
}

/* ---------------------------------------------------------- sonido */

function aplicarSonido() {
  audio.set(guardado.sound);
  el.mute.classList.toggle('apagado', !guardado.sound);
  el.mute.setAttribute('aria-pressed', String(guardado.sound));
  el.mute.title = t(guardado.sound ? 'soundTitleOn' : 'soundTitleOff');
  el.mute.setAttribute('aria-label', el.mute.title);
}

function alternarSonido() {
  audio.unlock();
  guardado.sound = !guardado.sound;
  guardar();
  aplicarSonido();
  if (guardado.sound) audio.play('ui');
}

function aplicarIdiomaBase() {
  document.documentElement.lang = getLanguage();
  document.title = t('documentTitle');
  const descripcionPagina = document.getElementById('meta-description');
  if (descripcionPagina) descripcionPagina.content = t('description');
  document.querySelectorAll('[data-i18n]').forEach((nodo) => {
    nodo.textContent = t(nodo.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-title]').forEach((nodo) => {
    nodo.title = t(nodo.dataset.i18nTitle);
  });
  document.querySelectorAll('[data-i18n-aria]').forEach((nodo) => {
    nodo.setAttribute('aria-label', t(nodo.dataset.i18nAria));
  });
  if (el.lang) el.lang.value = getLanguage();
  const efectos = document.getElementById('effects');
  if (efectos) efectos.setAttribute('aria-label', t('activeEffects'));
  if (el.pause) el.pause.title = t(app.pantalla === 'paused' ? 'resumeTitle' : 'pauseTitle');
  aplicarSonido();
}

function cambiarIdioma() {
  setLanguage(el.lang.value);
  aplicarIdiomaBase();
  rutas.restaurando = true;
  if (app.pantalla === 'home') mostrarInicio();
  else if (app.pantalla === 'modes') mostrarModos(app.grupo);
  else if (app.pantalla === 'levels') pintarNiveles();
  else if (app.pantalla === 'help') mostrarAyuda();
  else if (app.pantalla === 'settings') mostrarAjustes(app.settingsReturn);
  else if (app.pantalla === 'playing') {
    actualizarPista();
    actualizarMarcador();
  } else if (app.pantalla === 'paused') {
    actualizarMarcador();
    mostrarPausa();
  } else if (app.pantalla === 'dead') mostrarFin();
  else if (app.pantalla === 'cleared') {
    mostrarNivelSuperado();
    actualizarMarcador();
  }
  rutas.restaurando = false;
  sincronizarRuta(true);
  if (el.lang && typeof el.lang.focus === 'function') el.lang.focus({ preventScroll: true });
}

/* ---------------------------------------------------------- demo del menú */

function configDemo(modo) {
  if (modo === 'campaign') {
    const nivel = LEVELS[Math.min(guardado.campaign.unlocked - 1, LEVELS.length - 1)];
    return { ...configuracion('campaign', LEVELS.indexOf(nivel)), goal: null };
  }
  const base = { ...MODES[modo] };
  base.goal = null;
  return base;
}

function crearDemo(modo = app.demoModo || ORDEN[app.menuSel] || 'classic') {
  const cfg = configDemo(modo);
  const juego = new Game(cfg, () => {});
  juego.state = 'running';
  app.demo = juego;
  app.demoModo = modo;
  app.demoAcum = 0;
  ajustarLienzo();
  pintarTituloDemo(modo);
}

function pintarTituloDemo(modo, contexto = 'modo') {
  const titulo = document.getElementById('demo-titulo');
  const nota = document.getElementById('demo-nota');
  if (!titulo) return;
  if (modo === 'campaign') {
    const indice = Math.min(guardado.campaign.unlocked - 1, LEVELS.length - 1);
    const nivel = LEVELS[indice];
    titulo.textContent = t('previewCampaign', { number: dosDigitos(indice + 1), name: levelName(nivel.name) });
    nota.textContent = contexto === 'grupo'
      ? t('campaignAt', { cleared: guardado.campaign.unlocked - 1, total: LEVELS.length })
      : t('nextCampaignLevel');
  } else {
    titulo.textContent = t('previewModeTitle', { mode: modeName(modo) });
    nota.textContent = contexto === 'grupo'
      ? t('enterForModes', { tag: modeTag(modo) })
      : modeTag(modo);
  }
}

function pasoDemo(dt) {
  const demo = app.demo;
  if (!demo) return;
  demo.update(dt);
  app.demoAcum += dt;
  if (app.demoAcum > 60) {
    app.demoAcum = 0;
    demo.botTurn();
  }
  if (demo.state === 'dead' || demo.state === 'cleared') crearDemo(app.demoModo);

  const lienzo = document.getElementById('demo');
  if (!lienzo) return;
  const ctx = lienzo.getContext('2d', { alpha: false });
  demo.draw(ctx, vistaDemo);
}

/* ---------------------------------------------------------- eventos de interfaz */

el.overlay.addEventListener('click', (e) => {
  const boton = e.target.closest('button');
  if (!boton) return;
  soltarFoco();
  if (boton.dataset.grupo !== undefined) {
    audio.unlock();
    audio.play('ui');
    const grupo = GROUPS[Number(boton.dataset.grupo)];
    if (grupo && grupo.modes.length === 1) {
      elegirModo(grupo.modes[0]);
      return;
    }
    mostrarModos(Number(boton.dataset.grupo));
    return;
  }
  if (boton.dataset.tab !== undefined) {
    audio.unlock();
    audio.play('ui');
    mostrarModos(Number(boton.dataset.tab));
    return;
  }
  if (boton.dataset.modo) {
    audio.unlock();
    audio.play('ui');
    elegirModo(boton.dataset.modo);
    return;
  }
  if (boton.dataset.nivel !== undefined) {
    audio.unlock();
    elegirNivel(Number(boton.dataset.nivel));
    return;
  }
  if (boton.dataset.accion) {
    audio.unlock();
    ejecutar(boton.dataset.accion);
  }
});

el.overlay.addEventListener('pointerover', (e) => {
  const boton = e.target.closest('button');
  if (!boton) return;
  const lista = botonesUI();
  const indice = lista.indexOf(boton);
  if (indice >= 0 && indice !== foco.indice) {
    foco.indice = indice;
    pintarFoco();
  }
  if (app.pantalla === 'home' && boton.dataset.grupo !== undefined) {
    seleccionarGrupo(Number(boton.dataset.grupo));
  }
  if (app.pantalla === 'modes' && boton.dataset.modo !== undefined) {
    seleccionarModo(Number(boton.dataset.i));
  }
  if (app.pantalla === 'levels' && boton.dataset.nivel !== undefined) {
    seleccionarNivel(Number(boton.dataset.nivel));
  }
});

el.pause.addEventListener('click', () => {
  audio.unlock();
  soltarFoco();
  alternarPausa();
});

el.mute.addEventListener('click', () => {
  soltarFoco();
  alternarSonido();
});

el.lang.addEventListener('change', cambiarIdioma);

// dentro de un iframe el teclado no llega hasta que alguien hace clic dentro
let focoResuelto = false;

function resolverFoco() {
  if (focoResuelto) return;
  focoResuelto = true;
  if (el.avisoFoco) el.avisoFoco.hidden = true;
}

window.addEventListener('keydown', resolverFoco);
window.addEventListener('pointerdown', resolverFoco, true);

setTimeout(() => {
  const incrustado = window.self !== window.top;
  if (!focoResuelto && el.avisoFoco && incrustado) el.avisoFoco.hidden = false;
}, 1200);

document.addEventListener('visibilitychange', () => {
  if (document.hidden && app.pantalla === 'playing') pausar();
});

window.addEventListener('blur', () => {
  if (app.pantalla === 'playing') pausar();
});

attachInput({ stage: el.stage, actions: accion, canTurbo: turboPermitido });

/* ---------------------------------------------------------- bucle */

function bucle(t) {
  const dt = app.reloj ? t - app.reloj : 16;
  app.reloj = t;

  pasoBarrido(dt);

  if (app.pantalla === 'home' || app.pantalla === 'modes') {
    pasoDemo(dt);
    dibujarMarca(dt);
  } else if (app.juego) {
    app.juego.update(dt);
    app.juego.draw(pincel, vista);
    actualizarMarcador();
  }

  requestAnimationFrame(bucle);
}

function arrancar() {
  if (!comprobarPiezas()) return;

  document.documentElement.classList.toggle('trama', guardado.crt);
  aplicarIdiomaBase();
  restaurarRuta();
  ajustarLienzo();

  if (window.ResizeObserver) {
    try {
      new ResizeObserver(() => ajustarLienzo()).observe(el.stage);
    } catch (err) {
      window.addEventListener('resize', ajustarLienzo);
    }
  } else {
    window.addEventListener('resize', ajustarLienzo);
  }
  window.addEventListener('orientationchange', () => setTimeout(ajustarLienzo, 140));

  app.reloj = 0;
  requestAnimationFrame(bucle);
  if (typeof window.__snakeArrancado === 'function') window.__snakeArrancado();
}

try {
  arrancar();
} catch (err) {
  avisar('error al arrancar: ' + (err && err.message ? err.message : err));
  throw err;
}

if (location.hash === '#debug') {
  window.__snake = { app, guardado, accion, empezarPartida, mostrarInicio, crearDemo, mostrarFin };
  // rótulo: para poder mirarlo desde las pruebas
  window.__snake.marca = marca;
  window.__snake.serpientesMarca = SERPIENTES_NOMBRE;
  window.__snake.mejorGlobal = mejorGlobal;
  window.__snake.dibujarMarca = dibujarMarca;
}
})(modulos['main']);
})();
