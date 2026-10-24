/* snake — un solo fichero, sin módulos. generado por tools/build.mjs (2026-10-24 · v7).
   no lo edites a mano: cambia js/*.js y vuelve a ejecutar node tools/build.mjs */
(function () {
'use strict';
const modulos = { grid: {}, levels: {}, audio: {}, input: {}, engine: {}, main: {} };

// ---- grid ----
(function (modulo) {
'use strict';
// utilidades de rejilla que usan el motor y el piloto automático

const K = (x, y) => y * 4096 + x;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function inBounds(x, y, cols, rows) {
  return x >= 0 && y >= 0 && x < cols && y < rows;
}

// primer paso (en celdas, signo) desde start hasta goal esquivando blocked.
// links: pares [[origen, destino], ...] en clave K, para portales
function bfsStep({ start, goal, blocked, cols, rows, wrap, links }) {
  const startK = K(start.x, start.y);
  const goalK = K(goal.x, goal.y);
  if (startK === goalK) return null;

  const prev = new Map();
  const seen = new Set([startK]);
  const queue = [{ x: start.x, y: start.y }];
  let head = 0;

  while (head < queue.length) {
    const cell = queue[head++];
    const saltos = links && links.get ? links.get(K(cell.x, cell.y)) : null;
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
    if (saltos) {
      for (const destino of saltos) {
        vecinos.push({ nx: destino % 4096, ny: Math.floor(destino / 4096), nk: destino });
      }
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

// grupos del menú: se navega en plano, se ve por secciones
const GROUPS = [
  { name: 'progreso', modes: ['campaign'] },
  { name: 'infinitos', modes: ['classic', 'frenzy', 'portals', 'hunter'] },
  { name: 'especiales', modes: ['blind', 'clock', 'wall'] },
];

const MODE_ORDER = GROUPS.flatMap((g) => g.modes);

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
    tag: 'muros, cada fruta acelera',
    startSpeed: 126,
    minSpeed: 60,
    accelPerFood: 2.2,
  },
  frenzy: {
    ...base,
    id: 'frenzy',
    name: 'FRENESÍ',
    tag: 'bordes abiertos, acelera solo',
    startSpeed: 102,
    minSpeed: 34,
    accelPerFood: 1.2,
    rampPerSec: 0.8,
    bonusEvery: 4,
  },
  portals: {
    ...base,
    id: 'portals',
    name: 'PORTALES',
    tag: 'dos aros que cambian de sitio',
    startSpeed: 120,
    minSpeed: 54,
    accelPerFood: 1.8,
    portals: true,
    portalEvery: 3,
  },
  hunter: {
    ...base,
    id: 'hunter',
    name: 'CAZADOR',
    tag: 'una serpiente roja te caza',
    startSpeed: 122,
    minSpeed: 62,
    accelPerFood: 1.6,
    hunter: true,
    bonusEvery: 6,
    powerEvery: 5,
  },
  blind: {
    ...base,
    id: 'blind',
    name: 'CIEGO',
    tag: 'solo ves lo que tienes cerca',
    startSpeed: 124,
    minSpeed: 66,
    accelPerFood: 1.8,
    vision: 4.2,
    chainWindow: 3600,
  },
  clock: {
    ...base,
    id: 'clock',
    name: 'RELOJ',
    tag: '45 segundos, cada fruta suma',
    startSpeed: 118,
    minSpeed: 58,
    accelPerFood: 1.6,
    timer: 45000,
    timePerFood: 2600,
    bonusEvery: 4,
  },
  wall: {
    ...base,
    id: 'wall',
    name: 'MURO',
    tag: 'el mapa se llena de muros',
    startSpeed: 128,
    minSpeed: 62,
    accelPerFood: 1.8,
    spawnWalls: true,
    wallEvery: 3,
    powerEvery: 5,
  },
};

const level = (name, goal, speed, walls, extra = {}) => ({
  name,
  goal,
  speed,
  walls,
  minSpeed: 62,
  accelPerFood: 2,
  bonusEvery: 4,
  powerEvery: 6,
  chainWindow: 3000,
  ...extra,
});

const LEVELS = [
  level('LLANO', 4, 140, []),

  level('CRUZ', 5, 134, [...hline(9, 5, 8), ...vline(13, 2, 3), ...vline(13, 6, 4)]),

  level('PILARES', 6, 128, [
    ...rect(4, 4, 2, 2),
    ...rect(14, 4, 2, 2),
    ...rect(4, 14, 2, 2),
    ...rect(14, 14, 2, 2),
  ]),

  level('ANILLO', 6, 124, [
    ...holes(ring(6, 4, 8, 12), [[6, 9], [6, 10], [13, 9], [13, 10]]),
  ]),

  level('ZIGZAG', 7, 120, [
    ...hline(0, 4, 13),
    ...hline(7, 8, 13),
    ...hline(0, 12, 13),
    ...hline(7, 16, 13),
  ]),

  level('COLUMNAS', 8, 116, [
    ...vline(4, 0, 6),
    ...vline(9, 0, 6),
    ...vline(14, 0, 6),
    ...vline(4, 14, 6),
    ...vline(9, 14, 6),
    ...vline(14, 14, 6),
  ]),

  level('DOBLE ANILLO', 8, 112, [
    ...holes(ring(2, 2, 16, 16), [
      [2, 9], [2, 10], [17, 9], [17, 10],
      [9, 2], [10, 2], [9, 17], [10, 17],
    ]),
    ...holes(ring(7, 7, 6, 6), [[7, 9], [7, 10], [12, 9], [12, 10]]),
  ]),

  level('REJILLA', 9, 108, [
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

  level('JAULA', 9, 104, [
    ...holes(ring(3, 3, 14, 14), [
      [3, 9], [3, 10], [16, 9], [16, 10],
      [6, 3], [7, 3], [12, 3], [13, 3],
      [6, 16], [7, 16], [12, 16], [13, 16],
    ]),
  ]),

  level('ASPAS', 10, 100, [
    ...holes(diagonal(3, 5, 5, 1), [[5, 7]]),
    ...holes(diagonal(12, 5, 5, 1), [[14, 7]]),
    ...holes(diagonal(3, 14, 4, -1), [[4, 13]]),
    ...holes(diagonal(12, 14, 4, -1), [[13, 13]]),
  ]),

  level('CUATRO ESQUINAS', 10, 96, [
    ...rect(0, 0, 5, 5),
    ...rect(15, 0, 5, 5),
    ...rect(0, 15, 5, 5),
    ...rect(15, 15, 5, 5),
    ...rect(9, 5, 2, 2),
    ...rect(9, 13, 2, 2),
  ]),

  level('FINAL', 12, 98, [
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
  ]),
];

  Object.assign(modulo, { COLS, ROWS, GROUPS, MODE_ORDER, MODES, LEVELS });
})(modulos['levels']);

// ---- audio ----
(function (modulo) {
'use strict';
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
  portal() {
    tono(900, 0.06, { tipo: 'triangle', vol: 0.16, fin: 1400 });
  },
  power() {
    tono(480, 0.08, { tipo: 'triangle', vol: 0.2 });
    tono(720, 0.1, { tipo: 'triangle', vol: 0.16, delay: 0.07 });
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
  hunterEat() {
    tono(300, 0.06, { tipo: 'triangle', vol: 0.14, fin: 220 });
  },
  ui() {
    tono(440, 0.03, { vol: 0.1 });
  },
  locked() {
    tono(120, 0.08, { vol: 0.14 });
  },
};

const audio = {
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

function attachInput({ stage, actions }) {
  const fire = (accion) => actions(accion);

  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const accion = TECLAS[e.code];
    if (!accion) return;
    if (e.code === 'Space' || e.code === 'Enter' || e.code.startsWith('Arrow')) e.preventDefault();
    if (e.repeat) return;
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
      fire('tap');
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
      [0, 1].forEach((n) => {
        const boton = pad.buttons[n];
        if (boton && (boton.pressed || boton.value > 0.5)) actual.turbo = true;
      });
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

const POWER = ['ghost', 'slow', 'shrink'];

const POWER_INFO = {
  ghost: { label: 'fantasma', ms: 5200 },
  slow: { label: 'lento', ms: 6000 },
  shrink: { label: 'recorte', ms: 0 },
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
    this.timeLeft = cfg.timer || 0;
    this.hitStop = 0;
    this.crash = null;
    this.wallTicks = 0;
    this.fx = { ghost: 0, slow: 0 };
    this.bonus = null;
    this.power = null;
    this.portals = null;
    this.hunter = null;
    this.hunterTick = 0;
    this.pellets = [];
    this.reveal = 0;
    this.turbo = false;
    this.time = 0;
    this.shake = 0;
    this.flash = 0;
    this.particles = [];
    this.food = null;
    this.spawnFood();
    if (cfg.portals) this.placePortals();
    if (cfg.hunter) {
      this.placeHunter();
      for (let i = 0; i < 2; i++) this.spawnPellet();
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
    return Math.min(5, 1 + Math.floor(this.chain / 2));
  }

  get ghosting() {
    return this.fx.ghost > 0;
  }

  interval() {
    const slow = this.fx.slow > 0 ? 1.55 : 1;
    return Math.max(24, this.speed * (this.turbo ? 0.62 : 1) * slow);
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
    for (const k of ['ghost', 'slow']) {
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
      if (cfg.timer) {
        this.timeLeft = Math.max(0, this.timeLeft - dt);
        if (this.timeLeft <= 0) {
          this.die('tiempo', this.body[0].x, this.body[0].y);
          this.updateFx(dt);
          return;
        }
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
    if (this.crash) this.crash.t = Math.min(700, this.crash.t + dt);
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

    if (!ghost && this.portals) {
      for (const p of this.portals) {
        if (hx === p.a.x && hy === p.a.y) {
          hx = p.b.x;
          hy = p.b.y;
          this.emit('portal', { x: hx, y: hy });
          this.flash = 0.6;
          break;
        }
        if (hx === p.b.x && hy === p.b.y) {
          hx = p.a.x;
          hy = p.a.y;
          this.emit('portal', { x: hx, y: hy });
          this.flash = 0.6;
          break;
        }
      }
    }

    if (!ghost && this.wallSet.has(K(hx, hy))) return this.die('muro', hx, hy);
    if (!ghost && this.hunter && this.hunter.body.some((s) => s.x === hx && s.y === hy)) {
      return this.die('cazador', hx, hy);
    }

    const eats = this.food && hx === this.food.x && hy === this.food.y;
    const takesBonus = this.bonus && hx === this.bonus.x && hy === this.bonus.y;
    const takesPower = this.power && hx === this.power.x && hy === this.power.y;
    const willGrow = this.grow > 0 || eats || takesBonus;

    for (let i = 0; i < this.body.length; i++) {
      if (!willGrow && i === this.body.length - 1) continue;
      if (this.body[i].x === hx && this.body[i].y === hy) return this.die('cola', hx, hy);
    }

    this.body.unshift({ x: hx, y: hy });
    if (this.grow > 0) this.grow--;
    else this.body.pop();

    if (eats) this.eatFood();
    if (takesBonus) this.eatBonus();
    if (takesPower) this.takePower();
    if (this.cfg.hunter) this.moveHunter();
  }

  eatFood() {
    const cfg = this.cfg;
    const food = this.food;
    this.fruits++;
    this.grow += 1;
    this.chain = Math.min(this.chain + 1, 30);
    this.chainTimer = this.chainWindow;
    this.score += 10 * this.multiplier;
    this.speed = Math.max(cfg.minSpeed, this.speed - (cfg.accelPerFood || 0));
    this.shake = 2.6;
    this.burst(food.x + 0.5, food.y + 0.5, 10, '#ff2b2b', 7);
    if (cfg.timePerFood) this.timeLeft = Math.min((cfg.timer || 0) * 2, this.timeLeft + cfg.timePerFood);
    if (cfg.spawnWalls && cfg.wallEvery && this.fruits % cfg.wallEvery === 0) this.raiseWall();
    this.emit('eat', { chain: this.chain, multiplier: this.multiplier });
    this.spawnFood();
    if (cfg.bonusEvery && this.fruits % cfg.bonusEvery === 0) this.spawnBonus();
    if (cfg.powerEvery && this.fruits % cfg.powerEvery === 0) this.spawnPower();
    if (cfg.portalEvery && this.portals && this.fruits % cfg.portalEvery === 0) this.placePortals();
    if (cfg.goal && this.fruits >= cfg.goal) {
      this.state = 'cleared';
      this.emit('clear', { fruits: this.fruits, score: this.score });
    }
  }

  eatBonus() {
    const b = this.bonus;
    this.bonus = null;
    this.grow += 2;
    this.chain = Math.min(this.chain + 2, 30);
    this.chainTimer = this.chainWindow;
    this.score += 50 * this.multiplier;
    this.shake = 5;
    this.burst(b.x + 0.5, b.y + 0.5, 18, '#ffffff', 9);
    if (this.cfg.hunter) this.placeHunter();
    this.emit('bonus', { score: this.score });
  }

  takePower() {
    const p = this.power;
    this.power = null;
    this.shake = 4;
    this.burst(p.x + 0.5, p.y + 0.5, 14, '#ffffff', 8);
    if (p.kind === 'ghost') {
      this.fx.ghost = POWER_INFO.ghost.ms;
    } else if (p.kind === 'slow') {
      this.fx.slow = POWER_INFO.slow.ms;
    } else {
      const cut = Math.min(5, Math.max(0, this.body.length - 3));
      if (cut > 0) this.body.splice(this.body.length - cut, cut);
      this.score += 30;
    }
    this.emit('power', { kind: p.kind, label: POWER_INFO[p.kind].label });
  }

  die(reason, x, y) {
    if (this.state !== 'running') return;
    this.state = 'dead';
    this.turbo = false;
    this.shake = 16;
    this.flash = 1.4;
    this.hitStop = 160;
    const cx = (x ?? 0) + 0.5;
    const cy = (y ?? 0) + 0.5;
    this.crash = { x: cx, y: cy, t: 0, reason };
    this.burst(cx, cy, 26, '#ffffff', 11);
    // la serpiente se deshace en chispas desde la cola
    this.body.forEach((c, i) => {
      if (i % 2 === 0) this.burst(c.x + 0.5, c.y + 0.5, 3, '#ffffff', 5);
    });
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

  portalExit(x, y) {
    if (!this.portals) return null;
    for (const p of this.portals) {
      if (p.a.x === x && p.a.y === y) return p.b;
      if (p.b.x === x && p.b.y === y) return p.a;
    }
    return null;
  }

  portalLinks() {
    const enlaces = new Map();
    if (!this.portals) return enlaces;
    for (const p of this.portals) {
      enlaces.set(K(p.a.x, p.a.y), [K(p.b.x, p.b.y)]);
      enlaces.set(K(p.b.x, p.b.y), [K(p.a.x, p.a.y)]);
    }
    return enlaces;
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

  // piloto automático: demo del menú y pruebas. no es perfecto, pero no se encierra
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
        links: this.portalLinks(),
      })
      : null;

    // memoria corta: no dar vueltas sobre las mismas casillas
    if (!this.botTrail) this.botTrail = new Map();
    for (const [k, v] of this.botTrail) this.botTrail.set(k, v - 1);
    this.botTrail.set(K(cabeza.x, cabeza.y), 14);

    let mejor = null;
    let mejorPunto = -Infinity;

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
      if (ocupado.has(K(nx, ny))) continue;
      // si es un portal, sales por el otro lado: ahí tampoco puede haber nada
      const salida = this.portalExit(nx, ny);
      if (salida && ocupado.has(K(salida.x, salida.y))) continue;
      const destino = salida || { x: nx, y: ny };

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
      if (this.cfg.vision) puntos += Math.random() * 2;

      if (puntos > mejorPunto) {
        mejorPunto = puntos;
        mejor = { dx, dy };
      }
    }

    if (mejor) {
      this.setDirection(mejor.dx, mejor.dy);
      return;
    }
    // sin salida: cualquier casilla libre
    for (const [dx, dy] of DIRS) {
      const nx = cabeza.x + dx;
      const ny = cabeza.y + dy;
      if (!wrap && (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows)) continue;
      if (ocupado.has(K((nx + this.cols) % this.cols, (ny + this.rows) % this.rows))) continue;
      this.setDirection(dx, dy);
      return;
    }
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
      if (this.portals && this.portals.some((p) =>
        (p.a.x === x && p.a.y === y) || (p.b.x === x && p.b.y === y))) return true;
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
    const cell = this.freeCell(0);
    if (cell) this.food = cell;
  }

  spawnBonus() {
    const cell = this.freeCell(0);
    if (cell) this.bonus = { ...cell, ttl: 6500 };
  }

  spawnPower() {
    if (this.power) return;
    const cell = this.freeCell(0);
    if (!cell) return;
    const kind = POWER[rand(POWER.length)];
    this.power = { ...cell, kind, ttl: 9000 };
  }

  raiseWall() {
    const cabeza = this.body[0];
    for (let i = 0; i < 80; i++) {
      const c = this.freeCell(1);
      if (!c) return;
      const lejos = Math.abs(c.x - cabeza.x) + Math.abs(c.y - cabeza.y) >= 5;
      const hueco = DIRS.some(([dx, dy]) => !this.wallSet.has(K(c.x + dx, c.y + dy)));
      if (!lejos || !hueco) continue;
      this.walls.push([c.x, c.y]);
      this.wallSet.add(K(c.x, c.y));
      this.burst(c.x + 0.5, c.y + 0.5, 8, 'rgba(255,255,255,0.8)', 4);
      this.shake = 2;
      this.emit('wall', { x: c.x, y: c.y });
      return;
    }
  }

  placePortals() {
    const a = this.freeCell(2);
    if (!a) return;
    let b = null;
    for (let i = 0; i < 60; i++) {
      const c = this.freeCell(2);
      if (!c) break;
      const lejos = Math.abs(c.x - a.x) + Math.abs(c.y - a.y) >= 9;
      const estorba = Math.abs(c.x - this.body[0].x) + Math.abs(c.y - this.body[0].y) <= 2;
      if (lejos && !estorba) {
        b = c;
        break;
      }
    }
    if (!b) return;
    this.portals = [{ a, b }];
    this.emit('portals', { a, b });
  }

  // el cazador es una serpiente: empieza con tres anillos y crece comiendo
  placeHunter() {
    const cabeza = this.body[0];
    const libre = (x, y) =>
      x >= 0 && y >= 0 && x < this.cols && y < this.rows &&
      !this.wallSet.has(K(x, y)) &&
      !this.body.some((s) => s.x === x && s.y === y) &&
      !this.pellets.some((p) => p.x === x && p.y === y);

    let origen = null;
    for (let i = 0; i < 300; i++) {
      const c = this.freeCell(1);
      if (!c) break;
      if (Math.abs(c.x - cabeza.x) + Math.abs(c.y - cabeza.y) >= 8) {
        origen = c;
        break;
      }
    }
    if (!origen) origen = this.freeCell(1) || { x: 0, y: 0 };

    const cuerpo = [origen];
    for (const [dx, dy] of DIRS) {
      if (cuerpo.length >= 3) break;
      for (let n = 1; n <= 2; n++) {
        const x = origen.x + dx * n;
        const y = origen.y + dy * n;
        if (!libre(x, y)) break;
        cuerpo.push({ x, y });
      }
    }

    this.hunter = {
      body: cuerpo,
      prev: cuerpo.map((p) => ({ ...p })),
      dir: { x: 0, y: 0 },
      grow: 0,
    };
    this.hunterTick = 0;
  }

  spawnPellet() {
    if (!this.hunter) return;
    const cabeza = this.body[0];
    let sitio = null;
    for (let i = 0; i < 120; i++) {
      const c = this.freeCell(1);
      if (!c) break;
      if (Math.abs(c.x - cabeza.x) + Math.abs(c.y - cabeza.y) >= 4) {
        sitio = c;
        break;
      }
    }
    if (!sitio) sitio = this.freeCell(1);
    if (sitio) this.pellets.push(sitio);
  }

  // ritmo del cazador: acelera cuando ya es largo y lo tiene cerca
  hunterCadence() {
    const h = this.hunter;
    if (!h) return 2;
    const cabeza = this.body[0];
    const jefe = h.body[0];
    const dist = Math.abs(jefe.x - cabeza.x) + Math.abs(jefe.y - cabeza.y);
    return h.body.length >= 7 && dist <= 3 ? 1 : 2;
  }

  // a qué va: a comer si es corta, a cortarte el paso si ya es larga
  hunterTarget() {
    const h = this.hunter;
    const cabeza = this.body[0];
    if (h.body.length >= 7) {
      let x = cabeza.x;
      let y = cabeza.y;
      for (let i = 0; i < 4; i++) {
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
    if (this.hunterTick % this.hunterCadence() !== 0) return;

    h.prev = h.body.map((p) => ({ ...p }));
    const cabeza = h.body[0];
    const objetivo = this.hunterTarget();

    const ocupadoCuerpo = new Set();
    for (let i = 0; i < h.body.length - 1; i++) ocupadoCuerpo.add(K(h.body[i].x, h.body[i].y));
    const bloqueado = new Set([...this.wallSet, ...ocupadoCuerpo]);
    const cuerpoJugador = new Set(this.body.map((s) => K(s.x, s.y)));

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

    for (const [dx, dy] of DIRS) {
      const nx = cabeza.x + dx;
      const ny = cabeza.y + dy;
      if (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows) continue;
      const k = K(nx, ny);
      if (bloqueado.has(k)) continue;
      const reversa = dx === -h.dir.x && dy === -h.dir.y;

      let puntos = 0;
      // rematar: si pisa al jugador, gana
      if (cuerpoJugador.has(k)) puntos += 1200;
      puntos -= (Math.abs(nx - objetivo.x) + Math.abs(ny - objetivo.y)) * 12;
      if (ideal && dx === ideal.x && dy === ideal.y) puntos += 46;
      if (reversa) puntos -= 40;

      const ocupadoDestino = new Set([...bloqueado, ...cuerpoJugador]);
      ocupadoDestino.delete(K(cabeza.x, cabeza.y));
      const espacio = this.hunterSpace({ x: nx, y: ny }, ocupadoDestino);
      puntos += Math.min(espacio, 60) * 0.7;
      if (espacio < 8) puntos -= 300;
      // no meterse justo al lado de la cabeza del jugador si aún es corta
      if (Math.abs(nx - this.body[0].x) + Math.abs(ny - this.body[0].y) === 1 && h.body.length < 5) {
        puntos -= 60;
      }

      if (puntos > mejorPunto) {
        mejorPunto = puntos;
        elegido = { x: nx, y: ny };
      }
    }

    if (!elegido) return;

    h.dir = { x: elegido.x - cabeza.x, y: elegido.y - cabeza.y };
    h.body.unshift(elegido);
    if (h.grow > 0) h.grow--;
    else h.body.pop();

    const indice = this.pellets.findIndex((p) => p.x === elegido.x && p.y === elegido.y);
    if (indice >= 0) {
      this.pellets.splice(indice, 1);
      if (h.body.length < 16) h.grow += 1;
      this.burst(elegido.x + 0.5, elegido.y + 0.5, 8, '#3d7bff', 5);
      this.spawnPellet();
      this.emit('hunterEat');
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

  draw(ctx, view) {
    const { cell, ox, oy } = view;
    const W = this.cols * cell;
    const H = this.rows * cell;

    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, view.width, view.height);

    ctx.save();
    if (this.shake > 0.2) {
      const s = this.shake;
      ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
    }

    ctx.fillStyle = '#141414';
    for (let x = 1; x < this.cols; x++) ctx.fillRect(Math.round(ox + x * cell), oy, 1, H);
    for (let y = 1; y < this.rows; y++) ctx.fillRect(ox, Math.round(oy + y * cell), W, 1);

    const inset = Math.max(1, Math.round(cell * 0.06));
    for (const [x, y] of this.walls) {
      const px = Math.round(ox + x * cell);
      const py = Math.round(oy + y * cell);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(px + inset, py + inset, cell - inset * 2, cell - inset * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.34)';
      ctx.lineWidth = 1;
      ctx.strokeRect(px + inset + 0.5, py + inset + 0.5, cell - inset * 2 - 1, cell - inset * 2 - 1);
    }

    if (this.portals) {
      const t = this.time / 260;
      for (const p of this.portals) {
        for (const c of [p.a, p.b]) {
          const cx = ox + (c.x + 0.5) * cell;
          const cy = oy + (c.y + 0.5) * cell;
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = Math.max(1, cell * 0.055);
          ctx.beginPath();
          ctx.arc(cx, cy, cell * (0.3 + 0.03 * Math.sin(t)), 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = '#fff';
          ctx.fillRect(Math.round(cx - 1), Math.round(cy - 1), 2, 2);
        }
      }
    }

    if (this.food) {
      const pulse = 0.5 + 0.5 * Math.sin(this.time / 220);
      const pad = cell * (0.2 - pulse * 0.045);
      ctx.fillStyle = '#ff2b2b';
      ctx.fillRect(
        Math.round(ox + this.food.x * cell + pad),
        Math.round(oy + this.food.y * cell + pad),
        Math.round(cell - pad * 2),
        Math.round(cell - pad * 2),
      );
    }

    if (this.bonus && !(this.bonus.ttl < 1800 && Math.floor(this.time / 130) % 2 === 0)) {
      const cx = ox + (this.bonus.x + 0.5) * cell;
      const cy = oy + (this.bonus.y + 0.5) * cell;
      const r = cell * 0.36;
      ctx.beginPath();
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r, cy);
      ctx.lineTo(cx, cy + r);
      ctx.lineTo(cx - r, cy);
      ctx.closePath();
      ctx.fillStyle = '#ff2b2b';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    if (this.power && !(this.power.ttl < 2200 && Math.floor(this.time / 140) % 2 === 0)) {
      const { kind } = this.power;
      const cx = ox + (this.power.x + 0.5) * cell;
      const cy = oy + (this.power.y + 0.5) * cell;
      const r = cell * 0.3;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = Math.max(1, cell * 0.06);
      if (kind === 'ghost') {
        ctx.setLineDash([Math.max(2, cell * 0.14), Math.max(2, cell * 0.14)]);
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (kind === 'slow') {
        ctx.beginPath();
        ctx.moveTo(cx - r * 0.7, cy - r * 0.32);
        ctx.lineTo(cx + r * 0.7, cy - r * 0.32);
        ctx.moveTo(cx - r * 0.7, cy + r * 0.32);
        ctx.lineTo(cx + r * 0.7, cy + r * 0.32);
        ctx.stroke();
      } else {
        ctx.strokeRect(cx - r, cy - r, r * 2, r * 2);
      }
    }

    // puntos azules del cazador
    for (const punto of this.pellets) {
      const pad = cell * 0.33;
      ctx.fillStyle = '#3d7bff';
      ctx.fillRect(
        Math.round(ox + punto.x * cell + pad),
        Math.round(oy + punto.y * cell + pad),
        Math.round(cell - pad * 2),
        Math.round(cell - pad * 2),
      );
    }

    // el cazador: serpiente roja, crece con los puntos
    if (this.hunter) {
      const ritmo = 2;
      const hAlpha = ((this.hunterTick % ritmo) + (this.state === 'running' ? clamp(this.acc / this.interval(), 0, 1) : 1)) / ritmo;
      for (let i = this.hunter.body.length - 1; i >= 0; i--) {
        const actual = this.hunter.body[i];
        const previo = this.hunter.prev[i] || actual;
        const salto = Math.abs(actual.x - previo.x) > 1 || Math.abs(actual.y - previo.y) > 1;
        const px = Math.round(ox + (salto ? actual.x : previo.x + (actual.x - previo.x) * hAlpha) * cell);
        const py = Math.round(oy + (salto ? actual.y : previo.y + (actual.y - previo.y) * hAlpha) * cell);
        const margen = Math.max(1, Math.round(cell * 0.07));
        ctx.fillStyle = i === 0 ? '#ff2b2b' : '#c91616';
        ctx.fillRect(px + margen, py + margen, cell - margen * 2, cell - margen * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 1;
        ctx.strokeRect(px + margen + 0.5, py + margen + 0.5, cell - margen * 2 - 1, cell - margen * 2 - 1);
      }
      const cabeza = this.hunter.body[0];
      const tam = Math.max(2, Math.round(cell * 0.16));
      ctx.fillStyle = '#000';
      ctx.fillRect(
        Math.round(ox + (cabeza.x + 0.5) * cell - tam / 2),
        Math.round(oy + (cabeza.y + 0.5) * cell - tam / 2),
        tam,
        tam,
      );
    }

    // ---- luz ----
    const cabeza = this.body[0];
    const centroX = ox + (cabeza.x + 0.5) * cell;
    const centroY = oy + (cabeza.y + 0.5) * cell;

    // sombra: un solo degradado radial sobre el tablero (suave y barato)
    const sombra = (cx, cy, dentro, fuera, tramos) => {
      const radioDentro = Math.max(0, dentro) * cell;
      const radioFuera = Math.max(radioDentro + cell * 0.5, fuera * cell);
      const g = ctx.createRadialGradient(cx, cy, radioDentro, cx, cy, radioFuera);
      for (const [parada, alfa] of tramos) {
        g.addColorStop(parada, `rgba(0,0,0,${alfa})`);
      }
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, view.width, view.height);
    };

    if (this.cfg.vision) {
      // modo ciego: sólo se ve lo que tienes cerca, y la claridad crece al arrancar
      const radio = this.cfg.vision * (0.35 + 0.65 * this.reveal);
      sombra(centroX, centroY, radio * 0.6, radio * 1.25, [
        [0, 0], [0.45, 0], [0.72, 0.72], [1, 0.97],
      ]);
      for (let i = 1; i < Math.min(this.body.length, 7); i++) {
        const tramo = this.body[i];
        const opaco = clamp(0.42 - i * 0.06, 0, 1);
        if (opaco < 0.04) continue;
        sombra(ox + (tramo.x + 0.5) * cell, oy + (tramo.y + 0.5) * cell, cell * 0.4, cell * 2, [
          [0, 0], [0.5, opaco * 0.5], [1, opaco],
        ]);
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(centroX, centroY, radio * cell, 0, Math.PI * 2);
      ctx.stroke();
    } else if (this.reveal < 1) {
      // arranque: una onda de luz enciende el tablero desde la cabeza
      const alcance = 1.2 + this.reveal * 17;
      sombra(centroX, centroY, alcance, alcance + 3.2, [
        [0, 0], [0.55, 0.35], [1, 1],
      ]);

      const filo = Math.sin(Math.PI * Math.min(1, this.reveal * 1.15));
      if (filo > 0.03) {
        ctx.strokeStyle = `rgba(255,255,255,${(filo * 0.5).toFixed(3)})`;
        ctx.lineWidth = Math.max(1.5, cell * 0.06);
        ctx.beginPath();
        ctx.arc(centroX, centroY, alcance * cell, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    const alpha = this.state === 'running' ? clamp(this.acc / this.interval(), 0, 1) : 1;
    const gap = Math.max(1, Math.round(cell * 0.07));
    const ghost = this.ghosting;
    for (let i = this.body.length - 1; i >= 0; i--) {
      const p = this.posAt(i, alpha);
      if (!p) continue;
      const px = Math.round(ox + p.x * cell);
      const py = Math.round(oy + p.y * cell);
      if (ghost) {
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(px + gap, py + gap, cell - gap * 2, cell - gap * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.92)';
        ctx.lineWidth = Math.max(1, cell * 0.05);
        ctx.strokeRect(px + gap + 0.5, py + gap + 0.5, cell - gap * 2 - 1, cell - gap * 2 - 1);
      } else {
        ctx.fillStyle = i === 0 ? '#ffffff' : i < 3 ? '#f0f0f0' : '#d8d8d8';
        ctx.fillRect(px + gap, py + gap, cell - gap * 2, cell - gap * 2);
      }
    }

    const head = this.posAt(0, alpha);
    if (head) {
      const size = Math.max(2, Math.round(cell * 0.17));
      const cx = ox + (head.x + 0.5) * cell + this.dir.x * cell * 0.19;
      const cy = oy + (head.y + 0.5) * cell + this.dir.y * cell * 0.19;
      ctx.fillStyle = ghost ? 'rgba(255,255,255,0.75)' : '#000';
      ctx.fillRect(Math.round(cx - size / 2), Math.round(cy - size / 2), size, size);
    }

    ctx.save();
    for (const p of this.particles) {
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.color;
      const s = Math.max(1, p.size);
      ctx.fillRect(Math.round(ox + p.x * cell), Math.round(oy + p.y * cell), s, s);
    }
    ctx.restore();

    ctx.restore();

    if (this.flash > 0.01) {
      ctx.fillStyle = `rgba(255,255,255,${this.flash * 0.07})`;
      ctx.fillRect(0, 0, view.width, view.height);
    }

    // ---- impacto: anillo y cruz donde te la pegaste ----
    if (this.crash) {
      const c = this.crash;
      const avance = clamp(c.t / 460, 0, 1);
      const radio = cell * (0.4 + avance * 3.2);
      const alpha = 1 - avance;
      const cx = ox + (c.x + 0.5) * cell;
      const cy = oy + (c.y + 0.5) * cell;
      ctx.strokeStyle = `rgba(255,255,255,${(alpha * 0.9).toFixed(3)})`;
      ctx.lineWidth = Math.max(1, 3 * (1 - avance));
      ctx.beginPath();
      ctx.arc(cx, cy, radio, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = `rgba(255,255,255,${(alpha * 0.45).toFixed(3)})`;
      ctx.lineWidth = 1;
      const largo = cell * (0.6 + avance * 1.8);
      ctx.beginPath();
      ctx.moveTo(cx - largo, cy);
      ctx.lineTo(cx + largo, cy);
      ctx.moveTo(cx, cy - largo);
      ctx.lineTo(cx, cy + largo);
      ctx.stroke();
      ctx.fillStyle = `rgba(255,255,255,${(alpha * alpha * 0.85).toFixed(3)})`;
      ctx.fillRect(cx - cell * 0.18, cy - cell * 0.18, cell * 0.36, cell * 0.36);
    }
  }
}

  Object.assign(modulo, { POWER_INFO, Game });
})(modulos['engine']);

// ---- main ----
(function (modulo) {
'use strict';
const { Game, POWER_INFO } = modulos['engine'];
const { MODES, LEVELS, GROUPS, MODE_ORDER, COLS, ROWS } = modulos['levels'];
const { audio } = modulos['audio'];
const { attachInput } = modulos['input'];

const $ = (sel) => document.querySelector(sel);

// si algo se rompe, que se vea en pantalla en vez de quedarse en negro
function avisar(mensaje) {
  if (typeof window.__snakeFallo === 'function') window.__snakeFallo(mensaje);
}

function comprobarPiezas() {
  const faltan = [];
  if (!MODES || !MODES.classic || !MODES.frenzy || !MODES.portals || !MODES.hunter) faltan.push('modos');
  if (!Array.isArray(LEVELS) || LEVELS.length !== 12) faltan.push('niveles');
  if (typeof Game !== 'function') faltan.push('motor');
  if (faltan.length) {
    avisar(`faltan piezas (${faltan.join(', ')}). casi seguro hay ficheros viejos en caché: pulsa recargar limpio.`);
    return false;
  }
  return true;
}

const ORDEN = MODE_ORDER;
const CLAVE = 'snake.v2';
const CLAVE_ANTIGUA = 'snake.frenzy.v1';
const COLUMNAS_NIVELES = 4;

const el = {
  stage: $('#stage'),
  canvas: $('#board'),
  overlay: $('#overlay'),
  prompt: $('#prompt'),
  meta: $('#hud-meta'),
  timer: $('#hud-timer'),
  score: $('#hud-score'),
  best: $('#hud-best'),
  mult: $('#hud-mult'),
  chain: $('#chain-bar'),
  effects: $('#effects'),
  mute: $('#btn-mute'),
  pause: $('#btn-pause'),
  hint: $('#hint'),
  avisoFoco: $('#aviso-foco'),
};

const pincel = el.canvas.getContext('2d', { alpha: false });

/* ---------------------------------------------------------- récords */

function nuevoRegistro() {
  return {
    best: { classic: 0, frenzy: 0, portals: 0, hunter: 0, blind: 0, clock: 0, wall: 0 },
    campaign: { unlocked: 1, best: {} },
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
  if (camp.best && typeof camp.best === 'object') {
    for (const [nivel, valor] of Object.entries(camp.best)) {
      datos.campaign.best[nivel] = Number(valor) || 0;
    }
  }
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
  nivelSel: 0,
  marca: 0,
  reloj: 0,
  temporizador: 0,
  record: false,
  chips: new Map(),
};

const vista = { cell: 24, ox: 0, oy: 0, width: 480, height: 480, dpr: 1 };
const vistaDemo = { cell: 10, ox: 0, oy: 0, width: 200, height: 200, dpr: 1 };

const dosDigitos = (n) => String(n).padStart(2, '0');
const puntos = (n) => String(Math.max(0, Math.round(n || 0)));

function mejorActual() {
  if (app.modo === 'campaign') return guardado.campaign.best[app.nivel] || 0;
  return guardado.best[app.modo] || 0;
}

function esTactil() {
  return window.matchMedia('(pointer: coarse)').matches;
}

function pararTemporizador() {
  if (app.temporizador) {
    clearTimeout(app.temporizador);
    app.temporizador = 0;
  }
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
    return;
  }
  el.overlay.innerHTML = html;
  el.overlay.classList.add('abierto');
  el.overlay.scrollTop = 0;
}

function pantalla(nombre) {
  app.pantalla = nombre;
  document.body.dataset.screen = nombre;
  actualizarPista();
}

const PISTAS = {
  home: '↑↓ elegir · ←→ saltar de grupo · enter jugar',
  levels: 'flechas nav · enter jugar · esc menú',
  help: 'esc volver',
  playing: '',
  paused: 'P seguir · R reiniciar · esc menú',
  dead: 'R reintentar · esc menú',
  cleared: 'enter siguiente · esc menú',
};

function actualizarPista() {
  if (app.pantalla === 'playing') {
    el.hint.textContent = esTactil()
      ? 'desliza para girar · toca para turbo'
      : 'espacio turbo · P pausa · R reiniciar · M sonido';
    return;
  }
  el.hint.textContent = PISTAS[app.pantalla] || '';
}

/* ---------------------------------------------------------- marcador */

function actualizarMarcador() {
  const juego = app.juego;
  if (!juego) {
    if (el.timer) el.timer.hidden = true;
    actualizarEfectos(null);
    return;
  }

  const valor = puntos(juego.score);
  if (el.score.textContent !== valor) el.score.textContent = valor;

  let meta;
  if (app.modo === 'campaign') {
    const nivel = LEVELS[app.nivel];
    meta = `${dosDigitos(app.nivel + 1)} ${nivel.name.toLowerCase()} · ${Math.min(juego.fruits, nivel.goal)}/${nivel.goal}`;
  } else {
    meta = `${MODES[app.modo].name.toLowerCase()} · ${juego.fruits} frutas`;
  }
  if (el.timer) {
    const conReloj = !!(juego.cfg && juego.cfg.timer);
    el.timer.hidden = !conReloj;
    if (conReloj) {
      const segundos = Math.ceil(juego.timeLeft / 1000);
      const texto = `${segundos} s`;
      if (el.timer.textContent !== texto) el.timer.textContent = texto;
      el.timer.classList.toggle('apurado', juego.timeLeft < 8000);
    }
  }
  if (el.meta.textContent !== meta) el.meta.textContent = meta;

  const marca = `récord ${mejorActual()}`;
  if (el.best.textContent !== marca) el.best.textContent = marca;

  const mult = juego.multiplier;
  const texto = mult > 1 ? `×${mult}` : '';
  if (el.mult.textContent !== texto) el.mult.textContent = texto;
  el.mult.classList.toggle('activo', mult > 1);

  el.chain.style.width = `${((juego.chainTimer / juego.chainWindow) * 100 || 0).toFixed(1)}%`;

  el.prompt.classList.toggle('visible', juego.state === 'ready');
  el.pause.textContent = app.pantalla === 'paused' ? 'seguir' : 'pausa';
  el.pause.disabled = app.pantalla !== 'playing' && app.pantalla !== 'paused';

  actualizarEfectos(juego);
}

function actualizarEfectos(juego) {
  const activos = [];
  if (juego) {
    if (juego.fx.ghost > 0) activos.push(['fantasma', juego.fx.ghost / POWER_INFO.ghost.ms]);
    if (juego.fx.slow > 0) activos.push(['lento', juego.fx.slow / POWER_INFO.slow.ms]);
    if (juego.turbo) activos.push(['turbo', 1]);
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

/* ---------------------------------------------------------- menú */

function valorDerecha(modo) {
  if (modo === 'campaign') return `${guardado.campaign.unlocked - 1}/${LEVELS.length}`;
  const mejor = guardado.best[modo] || 0;
  return mejor ? String(mejor) : '—';
}

// izquierda y derecha saltan de grupo
function grupoDe(modo) {
  return GROUPS.findIndex((g) => g.modes.includes(modo));
}

function primerModoDelGrupo(indice) {
  const total = GROUPS.length;
  const grupo = GROUPS[((indice % total) + total) % total];
  return ORDEN.indexOf(grupo.modes[0]);
}

function nombreModo(modo) {
  if (modo === 'campaign') return 'campaña';
  return MODES[modo].name.toLowerCase();
}

function descripcion(modo) {
  if (modo === 'campaign') {
    return `campaña: ${LEVELS.length} niveles con muros`;
  }
  return MODES[modo].name.toLowerCase() + ': ' + MODES[modo].tag;
}

function mostrarInicio() {
  pararTemporizador();
  app.juego = null;
  app.menuSel = 0;
  app.demoModo = null;

  let indice = 0;
  const filas = GROUPS.map((grupo) => {
    const botones = grupo.modes.map((modo) => {
      const i = indice++;
      return `<button class="row" type="button" data-modo="${modo}" data-i="${i}">
        <span class="row-idx">${dosDigitos(i + 1)}</span>
        <span class="row-name">${nombreModo(modo)}<small>${descripcion(modo)}</small></span>
        <span class="row-right">${valorDerecha(modo)}</span>
      </button>`;
    }).join('');
    return `<p class="grupo">${grupo.name}</p>${botones}`;
  }).join('');

  ponerOverlay(`<div class="panel inicio">
    <div class="inicio-texto">
      <header class="inicio-cabeza">
        <h1>snake<span class="dot">.</span></h1>
        <p class="kicker">rejilla 20×20 · ${ORDEN.length} modos y una campaña</p>
      </header>
      <nav class="filas">${filas}</nav>
      <p class="pie">
        <button class="link" type="button" data-accion="help">controles</button>
        <span aria-hidden="true">·</span>
        <button class="link" type="button" data-accion="crt">${guardado.crt ? 'quitar' : 'poner'} trama</button>
        <span aria-hidden="true">·</span>
        <button class="link" type="button" data-accion="wipe">borrar récords</button>
      </p>
    </div>
    <aside class="inicio-demo">
      <p class="kicker" id="demo-titulo">vista previa</p>
      <canvas id="demo" aria-label="vista previa del modo elegido"></canvas>
      <p class="nota" id="demo-nota">así se juega el modo que tienes marcado</p>
    </aside>
  </div>`);

  el.score.textContent = '—';
  el.meta.textContent = 'elige un modo';
  if (el.timer) el.timer.hidden = true;
  el.best.textContent = '';
  el.mult.textContent = '';
  el.chain.style.width = '0%';
  el.pause.disabled = true;
  el.pause.textContent = 'pausa';
  el.prompt.classList.remove('visible');
  pantalla('home');
  seleccionarModo(0);
  ajustarLienzo();
}

function seleccionarModo(i) {
  const total = ORDEN.length;
  app.menuSel = ((i % total) + total) % total;
  el.overlay.querySelectorAll('.row').forEach((nodo, j) => {
    nodo.classList.toggle('sel', j === app.menuSel);
  });
  const modo = ORDEN[app.menuSel];
  if (app.demoModo !== modo) crearDemo(modo);
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
  el.meta.textContent = 'campaña';
  if (el.timer) el.timer.hidden = true;
  el.best.textContent = '';
  el.mult.textContent = '';
  el.chain.style.width = '0%';
  el.pause.disabled = true;
  el.pause.textContent = 'pausa';
  el.prompt.classList.remove('visible');
}

function pintarNiveles() {
  const celdas = LEVELS.map((nivel, i) => {
    const bloqueado = i >= guardado.campaign.unlocked;
    const hecho = i < guardado.campaign.unlocked - 1;
    const marca = guardado.campaign.best[i] || 0;
    return `<button class="celda${bloqueado ? ' bloqueada' : ''}${hecho ? ' hecha' : ''}"
      type="button" data-nivel="${i}"${bloqueado ? ' aria-disabled="true"' : ''}>
      <span class="celda-top"><span class="celda-num">${dosDigitos(i + 1)}</span>${hecho ? '<span class="celda-tick">✓</span>' : ''}</span>
      <span class="celda-nombre">${bloqueado ? '· · ·' : nivel.name.toLowerCase()}</span>
      <span class="celda-meta">${bloqueado ? 'bloqueado' : marca ? `récord ${marca}` : `${nivel.goal} frutas`}</span>
    </button>`;
  }).join('');

  ponerOverlay(`<div class="panel niveles">
    <div class="niveles-cabeza">
      <div>
        <p class="kicker">campaña · ${guardado.campaign.unlocked - 1}/${LEVELS.length} superados</p>
        <h2>elige nivel</h2>
      </div>
      <button class="ghost" type="button" data-accion="home">menú</button>
    </div>
    <div class="niveles-cuerpo">
      <div class="rejilla">${celdas}</div>
      <aside class="vistazo">
        <canvas id="preview"></canvas>
        <p class="kicker" id="vistazo-nombre"></p>
        <p class="nota" id="vistazo-datos"></p>
      </aside>
    </div>
    <p class="pie"><span>flechas para moverte · enter para jugar</span></p>
  </div>`);

  pantalla('levels');
  seleccionarNivel(app.nivelSel);
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
  if (nombre) nombre.textContent = `${dosDigitos(indice + 1)} ${nivel.name.toLowerCase()}`;
  if (datos) {
    const marca = guardado.campaign.best[indice] || 0;
    datos.textContent = `${nivel.goal} frutas · ritmo ${nivel.speed}${marca ? ` · récord ${marca}` : ''}`;
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
  ponerOverlay(`<div class="panel ayuda">
    <div class="niveles-cabeza">
      <div>
        <p class="kicker">cómo se juega</p>
        <h2>controles</h2>
      </div>
      <button class="ghost" type="button" data-accion="home">volver</button>
    </div>
    <table class="tabla">
      <tbody>
        <tr><th>girar</th><td>flechas o WASD · desliza en móvil</td></tr>
        <tr><th>turbo</th><td>espacio o mayús · toca el tablero</td></tr>
        <tr><th>pausa</th><td>P o esc</td></tr>
        <tr><th>reiniciar</th><td>R</td></tr>
        <tr><th>menú</th><td>↑↓ elegir · ←→ saltar de grupo</td></tr>
        <tr><th>sonido</th><td>M</td></tr>
        <tr><th>mando</th><td>d-pad y sticks · A turbo · start pausa</td></tr>
      </tbody>
    </table>
    <p class="kicker">reglas</p>
    <ul class="reglas">
      <li>la comida encadena: dos frutas seguidas suben el multiplicador hasta ×5</li>
      <li>el rombo rojo caduca y da dos anillos de largo</li>
      <li>los iconos blancos dan poderes: círculo discontinuo fantasma (atraviesas todo), dos barras lento, cuadrado recorte</li>
      <li>en cazador hay una serpiente roja: come los puntos azules y se hace más larga</li>
      <li>si te toca cualquier anillo suyo, o su cabeza, pierdes; con el fantasma la atraviesas</li>
      <li>en los portales, entrar por uno te saca por el otro</li>
      <li>en ciego sólo ves un círculo a tu alrededor</li>
      <li>en reloj empiezas con 45 segundos y cada fruta te da 2,6 más</li>
      <li>en muro el mapa se llena de muros cada tres frutas</li>
      <li>al empezar cada partida el mapa se enciende desde tu cabeza</li>
    </ul>
    <p class="pie"><span>osciladores y ruido en directo · sin ficheros de audio</span></p>
  </div>`);
  pantalla('help');
}

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
    bonusEvery: datos.bonusEvery,
    powerEvery: datos.powerEvery,
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
  const juego = app.juego;
  switch (tipo) {
    case 'start':
      audio.play('start');
      break;
    case 'eat':
      audio.play('bite', datos);
      break;
    case 'bonus':
      audio.play('bonus');
      break;
    case 'portal':
      audio.play('portal');
      break;
    case 'power':
      audio.play('power');
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
    case 'die':
      audio.play('death');
      guardarMarca();
      app.temporizador = setTimeout(mostrarFin, 900);
      break;
    case 'clear':
      audio.play('level');
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
  if (!juego) return;
  if (app.modo === 'campaign') {
    const clave = String(app.nivel);
    guardado.campaign.best[clave] = Math.max(guardado.campaign.best[clave] || 0, juego.score);
  } else {
    guardado.best[app.modo] = Math.max(guardado.best[app.modo] || 0, juego.score);
  }
  guardar();
}

function mostrarFin() {
  const juego = app.juego;
  if (!juego || juego.state !== 'dead') return;
  app.record = juego.score > app.marca;
  const esCampana = app.modo === 'campaign';
  const meta = esCampana
    ? `nivel ${LEVELS[app.nivel].goal} frutas · récord ${Math.max(app.marca, juego.score)}`
    : `récord ${Math.max(app.marca, juego.score)} · ${juego.fruits} frutas`;

  ponerOverlay(`<div class="panel fin">
    <div class="fin-cabeza">
      <p class="kicker">${app.record ? 'récord nuevo' : 'fin'}</p>
      <p class="cifra">${puntos(juego.score)}</p>
      <p class="nota">${meta}</p>
    </div>
    <div class="acciones">
      <button class="principal" type="button" data-accion="retry">reintentar <kbd>R</kbd></button>
      <button type="button" data-accion="home">menú <kbd>esc</kbd></button>
    </div>
  </div>`);
  pantalla('dead');
  el.pause.disabled = true;
  el.prompt.classList.remove('visible');
  actualizarMarcador();
}

function mostrarNivelSuperado() {
  const juego = app.juego;
  if (!juego || juego.state !== 'cleared') return;
  const ultimo = app.nivel >= LEVELS.length - 1;
  const siguiente = LEVELS[Math.min(app.nivel + 1, LEVELS.length - 1)];

  ponerOverlay(`<div class="panel fin">
    <div class="fin-cabeza">
      <p class="kicker">nivel ${dosDigitos(app.nivel + 1)} superado</p>
      <p class="cifra">${puntos(juego.score)}</p>
      <p class="nota">${ultimo ? 'campaña completa · ya no hay margen' : `siguiente · ${siguiente.name.toLowerCase()} · ${siguiente.goal} frutas`}</p>
    </div>
    <div class="acciones">
      ${ultimo ? '' : '<button class="principal" type="button" data-accion="next">siguiente <kbd>↵</kbd></button>'}
      <button${ultimo ? ' class="principal"' : ''} type="button" data-accion="retry">repetir <kbd>R</kbd></button>
      <button type="button" data-accion="home">menú <kbd>esc</kbd></button>
    </div>
  </div>`);
  pantalla('cleared');
  el.pause.disabled = true;
  el.prompt.classList.remove('visible');
}

/* ---------------------------------------------------------- pausa */

function pausar() {
  if (!app.juego || app.pantalla !== 'playing') return;
  app.juego.pause();
  if (app.juego.state !== 'paused') return;
  audio.play('ui');

  const juego = app.juego;
  const cifra = puntos(juego.score);
  const nota = `${juego.fruits} frutas · récord ${Math.max(app.marca, juego.score)}`;

  ponerOverlay(`<div class="panel fin">
    <div class="fin-cabeza">
      <p class="kicker">en pausa</p>
      <p class="cifra">${cifra}</p>
      <p class="nota">${nota}</p>
    </div>
    <div class="acciones">
      <button class="principal" type="button" data-accion="resume">seguir <kbd>P</kbd></button>
      <button type="button" data-accion="retry">reiniciar <kbd>R</kbd></button>
      <button type="button" data-accion="home">menú <kbd>esc</kbd></button>
    </div>
  </div>`);
  pantalla('paused');
  el.pause.textContent = 'seguir';
  el.pause.disabled = false;
  el.prompt.classList.remove('visible');
}

function reanudar() {
  if (!app.juego) return;
  app.juego.resume();
  ponerOverlay(null);
  pantalla('playing');
  el.pause.textContent = 'pausa';
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
    if (app.pantalla === 'playing' && app.juego) app.juego.toggleTurbo();
    return;
  }
  if (nombre === 'turboOn') {
    if (app.pantalla === 'playing' && app.juego) app.juego.setTurbo(true);
    return;
  }
  if (nombre === 'turboOff') {
    if (app.juego) app.juego.setTurbo(false);
    return;
  }
  if (nombre === 'padConectado') {
    el.hint.textContent = 'mando conectado';
    return;
  }

  const esDireccion = ['up', 'down', 'left', 'right'].includes(nombre);

  if (app.pantalla === 'home') {
    if (nombre === 'up') seleccionarModo(app.menuSel - 1);
    else if (nombre === 'down') seleccionarModo(app.menuSel + 1);
    else if (nombre === 'right') seleccionarModo(primerModoDelGrupo(grupoDe(ORDEN[app.menuSel]) + 1));
    else if (nombre === 'left') seleccionarModo(primerModoDelGrupo(grupoDe(ORDEN[app.menuSel]) - 1));
    else if (nombre === 'confirm') {
      audio.play('ui');
      elegirModo(ORDEN[app.menuSel]);
    }
    return;
  }

  if (app.pantalla === 'levels') {
    if (nombre === 'up') seleccionarNivel(app.nivelSel - COLUMNAS_NIVELES);
    else if (nombre === 'down') seleccionarNivel(app.nivelSel + COLUMNAS_NIVELES);
    else if (nombre === 'left') seleccionarNivel(app.nivelSel - 1);
    else if (nombre === 'right') seleccionarNivel(app.nivelSel + 1);
    else if (nombre === 'confirm') {
      audio.play('ui');
      elegirNivel(app.nivelSel);
    } else if (nombre === 'back' || nombre === 'pause') mostrarInicio();
    return;
  }

  if (app.pantalla === 'help') {
    if (nombre === 'back' || nombre === 'pause' || nombre === 'confirm') mostrarInicio();
    return;
  }

  if (app.pantalla === 'paused') {
    if (nombre === 'pause' || nombre === 'confirm') reanudar();
    else if (nombre === 'back') mostrarInicio();
    else if (nombre === 'restart') empezarPartida(app.modo, app.nivel);
    return;
  }

  if (app.pantalla === 'dead') {
    if (nombre === 'confirm' || nombre === 'restart') empezarPartida(app.modo, app.nivel);
    else if (nombre === 'back') mostrarInicio();
    return;
  }

  if (app.pantalla === 'cleared') {
    if (nombre === 'confirm') {
      if (app.nivel >= LEVELS.length - 1) mostrarInicio();
      else empezarPartida('campaign', app.nivel + 1);
    } else if (nombre === 'restart') empezarPartida('campaign', app.nivel);
    else if (nombre === 'back') mostrarInicio();
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
    case 'help':
      mostrarAyuda();
      break;
    case 'crt':
      guardado.crt = !guardado.crt;
      guardar();
      document.documentElement.classList.toggle('trama', guardado.crt);
      mostrarInicio();
      break;
    case 'wipe':
      borrarRecords();
      break;
    default:
      break;
  }
}

function borrarRecords() {
  if (!window.confirm('¿borrar récords y progreso?')) return;
  guardado.best = { classic: 0, frenzy: 0, portals: 0, hunter: 0, blind: 0, clock: 0, wall: 0 };
  guardado.campaign = { unlocked: 1, best: {} };
  guardar();
  audio.play('ui');
  mostrarInicio();
}

/* ---------------------------------------------------------- sonido */

function aplicarSonido() {
  audio.set(guardado.sound);
  el.mute.classList.toggle('apagado', !guardado.sound);
  el.mute.setAttribute('aria-pressed', String(guardado.sound));
  el.mute.title = guardado.sound ? 'sonido activo (M)' : 'sonido apagado (M)';
}

function alternarSonido() {
  audio.unlock();
  guardado.sound = !guardado.sound;
  guardar();
  aplicarSonido();
  if (guardado.sound) audio.play('ui');
}

/* ---------------------------------------------------------- demo del menú */

function configDemo(modo) {
  if (modo === 'campaign') {
    const nivel = LEVELS[Math.min(guardado.campaign.unlocked - 1, LEVELS.length - 1)];
    return { ...configuracion('campaign', LEVELS.indexOf(nivel)), goal: null };
  }
  const base = { ...MODES[modo] };
  base.goal = null;
  // la vista previa no puede morir de reloj ni cegarse del todo
  if (base.timer) base.timer = 600000;
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

function pintarTituloDemo(modo) {
  const titulo = document.getElementById('demo-titulo');
  const nota = document.getElementById('demo-nota');
  if (!titulo) return;
  if (modo === 'campaign') {
    const nivel = LEVELS[Math.min(guardado.campaign.unlocked - 1, LEVELS.length - 1)];
    titulo.textContent = `vista previa · nivel ${dosDigitos(LEVELS.indexOf(nivel) + 1)} ${nivel.name.toLowerCase()}`;
    nota.textContent = 'así es el siguiente nivel de la campaña';
  } else {
    titulo.textContent = `vista previa · ${nombreModo(modo)}`;
    nota.textContent = MODES[modo].tag;
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
  if (app.pantalla === 'home' && boton.dataset.i) seleccionarModo(Number(boton.dataset.i));
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

attachInput({ stage: el.stage, actions: accion });

/* ---------------------------------------------------------- bucle */

function bucle(t) {
  const dt = app.reloj ? t - app.reloj : 16;
  app.reloj = t;

  if (app.pantalla === 'home') {
    pasoDemo(dt);
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
  aplicarSonido();
  mostrarInicio();
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
}
})(modulos['main']);
})();
