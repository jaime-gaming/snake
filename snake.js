/* snake — un solo fichero, sin módulos. generado por tools/build.mjs (2026-10-24 · v4).
   no lo edites a mano: cambia js/*.js y vuelve a ejecutar node tools/build.mjs */
(function () {
'use strict';
const modulos = { grid: {}, levels: {}, audio: {}, input: {}, engine: {}, duel: {}, main: {} };

// ---- grid ----
(function (modulo) {
'use strict';
// utilidades de rejilla compartidas por el motor y el duelo

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
      if (seen.has(nk)) continue;
      if (blocked.has(nk) && nk !== goalK) continue;
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

const MODES = {
  classic: {
    id: 'classic',
    name: 'CLÁSICO',
    tag: 'muros, sin fin',
    cols: COLS,
    rows: ROWS,
    walls: [],
    startSpeed: 118,
    minSpeed: 55,
    accelPerFood: 3,
    wrap: false,
    bonusEvery: 5,
    powerEvery: 6,
    chainWindow: 2800,
  },
  frenzy: {
    id: 'frenzy',
    name: 'FRENESÍ',
    tag: 'bordes abiertos, acelera',
    cols: COLS,
    rows: ROWS,
    walls: [],
    startSpeed: 92,
    minSpeed: 32,
    accelPerFood: 1.5,
    rampPerSec: 1.15,
    wrap: true,
    bonusEvery: 4,
    powerEvery: 7,
    chainWindow: 2800,
  },
  portals: {
    id: 'portals',
    name: 'PORTALES',
    tag: 'dos portales que se mueven',
    cols: COLS,
    rows: ROWS,
    walls: [],
    startSpeed: 114,
    minSpeed: 50,
    accelPerFood: 2.5,
    wrap: false,
    portals: true,
    portalEvery: 3,
    bonusEvery: 5,
    powerEvery: 6,
    chainWindow: 2800,
  },
  hunter: {
    id: 'hunter',
    name: 'CAZADOR',
    tag: 'algo te sigue',
    cols: COLS,
    rows: ROWS,
    walls: [],
    startSpeed: 118,
    minSpeed: 58,
    accelPerFood: 2,
    wrap: false,
    hunter: true,
    bonusEvery: 4,
    powerEvery: 5,
    chainWindow: 2800,
  },
};

const level = (name, goal, speed, walls, extra = {}) => ({
  name,
  goal,
  speed,
  walls,
  minSpeed: 58,
  accelPerFood: 2.5,
  bonusEvery: 4,
  powerEvery: 6,
  chainWindow: 2600,
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

  level('FINAL', 12, 92, [
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

  Object.assign(modulo, { COLS, ROWS, MODES, LEVELS });
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
  duelEnd() {
    [392, 523, 659].forEach((f, i) => tono(f, 0.1, { vol: 0.18, delay: i * 0.06 }));
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
  KeyW: 'up2',
  KeyS: 'down2',
  KeyA: 'left2',
  KeyD: 'right2',
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

  // mando: dos mandos, el segundo juega como WASD
  const previo = [{}, {}];
  let conectados = 0;

  function leerMando() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const lista = [pads && pads[0], pads && pads[1]];
    let cuantos = 0;

    lista.forEach((pad, indice) => {
      const sufijo = indice === 1 ? '2' : '';
      const actual = {};
      if (!pad) {
        if (previo[indice].turbo) fire('turboOff');
        previo[indice] = actual;
        return;
      }
      cuantos++;
      const UMBRAL = 0.55;
      const ejeX = pad.axes[0] || 0;
      const ejeY = pad.axes[1] || 0;
      if (ejeX < -UMBRAL) actual.left = true;
      if (ejeX > UMBRAL) actual.right = true;
      if (ejeY < -UMBRAL) actual.up = true;
      if (ejeY > UMBRAL) actual.down = true;

      for (const [indiceBoton, nombre] of Object.entries(BOTONES)) {
        const boton = pad.buttons[indiceBoton];
        if (boton && (boton.pressed || boton.value > 0.5)) actual[nombre] = true;
      }
      [0, 1].forEach((n) => {
        const boton = pad.buttons[n];
        if (boton && (boton.pressed || boton.value > 0.5)) actual.turbo = true;
      });
      for (const nombre of ['up', 'down', 'left', 'right']) {
        if (actual[nombre] && !previo[indice][nombre]) fire(nombre + sufijo);
      }
      if (indice === 0) {
        if (actual.turbo && !previo[0].turbo) fire('turboOn');
        if (!actual.turbo && previo[0].turbo) fire('turboOff');
      }

      previo[indice] = actual;
    });

    if (cuantos && !conectados) fire('padConectado');
    if (!cuantos && conectados) conectados = 0;
    if (cuantos) conectados = cuantos;

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
    this.walls = cfg.walls || [];
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
    this.chainWindow = cfg.chainWindow || 2800;
    this.fx = { ghost: 0, slow: 0 };
    this.bonus = null;
    this.power = null;
    this.portals = null;
    this.hunter = null;
    this.hunterTick = 0;
    this.turbo = false;
    this.time = 0;
    this.shake = 0;
    this.flash = 0;
    this.particles = [];
    this.food = null;
    this.spawnFood();
    if (cfg.portals) this.placePortals();
    if (cfg.hunter) this.placeHunter();
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
    if (!ghost && this.hunter && hx === this.hunter.x && hy === this.hunter.y) {
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
    this.shake = 12;
    this.burst((x ?? 0) + 0.5, (y ?? 0) + 0.5, 26, '#ffffff', 11);
    this.emit('die', { reason, score: this.score, fruits: this.fruits });
  }

  blockedSet({ omitTail = false, walls = true, hunter = true } = {}) {
    const set = new Set();
    if (walls) for (const k of this.wallSet) set.add(k);
    const end = omitTail ? this.body.length - 1 : this.body.length;
    for (let i = 0; i < end; i++) set.add(K(this.body[i].x, this.body[i].y));
    if (hunter && this.hunter) set.add(K(this.hunter.x, this.hunter.y));
    return set;
  }

  // piloto automático: se usa en la demo del menú y en las pruebas
  botTurn() {
    if (this.state !== 'ready' && this.state !== 'running') return;
    const head = this.body[0];
    const blocked = this.blockedSet({ omitTail: true });
    const wrap = !!this.cfg.wrap || this.ghosting;
    if (this.food) {
      const step = bfsStep({ start: head, goal: this.food, blocked, cols: this.cols, rows: this.rows, wrap });
      if (step) {
        this.setDirection(step.x, step.y);
        return;
      }
    }
    for (const [dx, dy] of DIRS) {
      const nx = head.x + dx;
      const ny = head.y + dy;
      if (!wrap && (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows)) continue;
      const k = K((nx + this.cols) % this.cols, (ny + this.rows) % this.rows);
      if (blocked.has(k)) continue;
      if (dx === -this.dir.x && dy === -this.dir.y) continue;
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
      if (this.hunter && this.hunter.x === x && this.hunter.y === y) return true;
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

  placePortals() {
    const a = this.freeCell(2);
    if (!a) return;
    let b = null;
    for (let i = 0; i < 60; i++) {
      const c = this.freeCell(2);
      if (!c) break;
      if (Math.abs(c.x - a.x) + Math.abs(c.y - a.y) >= 6) {
        b = c;
        break;
      }
    }
    if (!b) return;
    this.portals = [{ a, b }];
    this.emit('portals', { a, b });
  }

  placeHunter() {
    const head = this.body[0];
    for (let i = 0; i < 200; i++) {
      const c = this.freeCell(1);
      if (!c) break;
      if (Math.abs(c.x - head.x) + Math.abs(c.y - head.y) >= 8) {
        this.hunter = c;
        return;
      }
    }
    this.hunter = this.freeCell(1);
  }

  moveHunter() {
    if (!this.hunter) return;
    const every = Math.max(3, 5 - Math.floor(this.fruits / 8));
    this.hunterTick++;
    if (this.hunterTick % every !== 0) return;

    const head = this.body[0];
    const blocked = new Set(this.wallSet);
    for (const s of this.body) blocked.add(K(s.x, s.y));
    const step = bfsStep({
      start: this.hunter,
      goal: head,
      blocked,
      cols: this.cols,
      rows: this.rows,
      wrap: false,
    });
    if (step) {
      this.hunter = { x: this.hunter.x + step.x, y: this.hunter.y + step.y };
      this.emit('hunter');
    }
    if (!this.ghosting && this.body.some((s) => s.x === this.hunter.x && s.y === this.hunter.y)) {
      this.die('cazador', this.hunter.x, this.hunter.y);
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

    if (this.hunter) {
      const hx = ox + this.hunter.x * cell;
      const hy = oy + this.hunter.y * cell;
      const pad = Math.max(1, Math.round(cell * 0.09));
      const x0 = hx + pad;
      const y0 = hy + pad;
      const x1 = hx + cell - pad;
      const y1 = hy + cell - pad;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = Math.max(1.5, cell * 0.09);
      ctx.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0 - 1, y1 - y0 - 1);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.moveTo(x1, y0);
      ctx.lineTo(x0, y1);
      ctx.stroke();
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
  }
}

  Object.assign(modulo, { POWER_INFO, Game });
})(modulos['engine']);

// ---- duel ----
(function (modulo) {
'use strict';
const { K } = modulos['grid'];

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

const DUEL_CFG = {
  cols: 20,
  rows: 20,
  wrap: false,
  startSpeed: 118,
  minSpeed: 74,
  walls: [[9, 9], [10, 9], [9, 10], [10, 10]],
};

const START = [
  { x: 4, y: 6, dir: { x: 1, y: 0 } },
  { x: 15, y: 13, dir: { x: -1, y: 0 } },
];

class Duel {
  constructor(cfg, onEvent = () => {}) {
    this.cfg = cfg;
    this.onEvent = onEvent;
    this.cols = cfg.cols;
    this.rows = cfg.rows;
    this.reset();
  }

  emit(type, data) {
    this.onEvent(type, data);
  }

  reset() {
    this.wallSet = new Set(this.cfg.walls.map(([x, y]) => K(x, y)));
    this.snakes = START.map((sp) => {
      const body = [];
      for (let i = 0; i < 4; i++) body.push({ x: sp.x - sp.dir.x * i, y: sp.y - sp.dir.y * i });
      return {
        body,
        prev: body.map((p) => ({ ...p })),
        dir: { ...sp.dir },
        queue: [],
        grow: 0,
        score: 0,
        fruits: 0,
        alive: true,
      };
    });
    this.speed = this.cfg.startSpeed;
    this.acc = 0;
    this.state = 'ready';
    this.time = 0;
    this.shake = 0;
    this.food = null;
    this.particles = [];
    this.winner = null;
    this.spawnFood();
  }

  interval() {
    return Math.max(46, this.speed);
  }

  setDirection(i, dx, dy) {
    const snake = this.snakes[i];
    if (!snake || !snake.alive || this.state === 'over') return;
    if (this.state === 'ready') {
      this.state = 'running';
      this.emit('start');
    }
    const last = snake.queue.length ? snake.queue[snake.queue.length - 1] : snake.dir;
    if (dx === -last.x && dy === -last.y) return;
    if (dx === last.x && dy === last.y) return;
    if (snake.queue.length < 2) snake.queue.push({ x: dx, y: dy });
  }

  pause() {
    if (this.state === 'running' || this.state === 'ready') {
      this.savedState = this.state;
      this.state = 'paused';
    }
  }

  resume() {
    if (this.state === 'paused') this.state = this.savedState;
  }

  update(dtRaw) {
    const dt = Math.min(dtRaw, 120);
    this.time += dt;
    if (this.state === 'running') {
      this.acc += dt;
      let guard = 0;
      while (this.state === 'running' && this.acc >= this.interval() && guard++ < 6) {
        this.acc -= this.interval();
        this.step();
      }
    }
    this.shake = Math.max(0, this.shake - dt * 0.05);
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += (p.vx * dt) / 1000;
      p.y += (p.vy * dt) / 1000;
      p.vx *= 0.94;
      p.vy *= 0.94;
      p.life -= dt;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
  }

  step() {
    for (const snake of this.snakes) {
      if (snake.queue.length) {
        const d = snake.queue.shift();
        if (!(d.x === -snake.dir.x && d.y === -snake.dir.y)) snake.dir = d;
      }
      snake.prev = snake.body.map((p) => ({ ...p }));
    }

    const next = this.snakes.map((snake) => {
      let x = snake.body[0].x + snake.dir.x;
      let y = snake.body[0].y + snake.dir.y;
      if (this.cfg.wrap) {
        x = (x + this.cols) % this.cols;
        y = (y + this.rows) % this.rows;
      }
      return { x, y };
    });

    const dying = [false, false];
    const eating = [false, false];

    for (let i = 0; i < 2; i++) {
      const snake = this.snakes[i];
      if (!snake.alive) continue;
      const n = next[i];
      if (n.x < 0 || n.y < 0 || n.x >= this.cols || n.y >= this.rows) {
        dying[i] = true;
        continue;
      }
      eating[i] = !!(this.food && n.x === this.food.x && n.y === this.food.y);
      if (this.wallSet.has(K(n.x, n.y))) {
        dying[i] = true;
        continue;
      }

      const growing = snake.grow > 0 || eating[i];
      for (let j = 0; j < snake.body.length; j++) {
        if (!growing && j === snake.body.length - 1) continue;
        if (snake.body[j].x === n.x && snake.body[j].y === n.y) {
          dying[i] = true;
          break;
        }
      }
      if (dying[i]) continue;

      const other = this.snakes[1 - i];
      for (let j = 0; j < other.body.length - 1; j++) {
        if (other.body[j].x === n.x && other.body[j].y === n.y) {
          dying[i] = true;
          break;
        }
      }
    }

    if (next[0].x === next[1].x && next[0].y === next[1].y) dying[0] = dying[1] = true;
    if (
      (next[0].x === this.snakes[1].body[0].x && next[0].y === this.snakes[1].body[0].y) &&
      (next[1].x === this.snakes[0].body[0].x && next[1].y === this.snakes[0].body[0].y)
    ) {
      dying[0] = dying[1] = true;
    }

    for (let i = 0; i < 2; i++) {
      const snake = this.snakes[i];
      if (!snake.alive || dying[i]) continue;
      snake.body.unshift(next[i]);
      if (snake.grow > 0) snake.grow--;
      else snake.body.pop();
      if (eating[i] && this.food) {
        snake.score += 10;
        snake.fruits++;
        snake.grow++;
        this.speed = Math.max(this.cfg.minSpeed, this.speed - 1.4);
        this.burst(next[i].x + 0.5, next[i].y + 0.5, 12, '#ff2b2b');
        this.emit('eat', { player: i, score: snake.score });
        this.spawnFood();
      }
    }

    for (let i = 0; i < 2; i++) {
      if (!dying[i]) continue;
      const snake = this.snakes[i];
      snake.alive = false;
      this.shake = 10;
      const head = snake.body[0];
      this.burst(head.x + 0.5, head.y + 0.5, 22, '#ffffff');
      this.emit('death', { player: i });
    }

    if (dying[0] || dying[1]) {
      this.state = 'over';
      if (dying[0] && dying[1]) this.winner = null;
      else this.winner = dying[0] ? 1 : 0;
      this.emit('over', { winner: this.winner });
    }
  }

  freeCell() {
    const blocked = (x, y) => {
      if (this.wallSet.has(K(x, y))) return true;
      if (this.food && this.food.x === x && this.food.y === y) return true;
      return this.snakes.some((s) =>
        s.alive && s.body.some((b) => b.x === x && b.y === y));
    };
    for (let i = 0; i < 400; i++) {
      const x = Math.floor(Math.random() * this.cols);
      const y = Math.floor(Math.random() * this.rows);
      if (!blocked(x, y)) return { x, y };
    }
    return null;
  }

  spawnFood() {
    const cell = this.freeCell();
    if (cell) this.food = cell;
  }

  burst(x, y, n, color) {
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = 3 + Math.random() * 6;
      this.particles.push({
        x,
        y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        life: 240 + Math.random() * 280,
        max: 520,
        color,
      });
    }
  }

  posAt(snake, i, alpha) {
    const cur = snake.body[i];
    if (!cur) return null;
    const prev = snake.prev[i] || cur;
    const dx = cur.x - prev.x;
    const dy = cur.y - prev.y;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) return cur;
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
      ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    }

    ctx.fillStyle = '#141414';
    for (let x = 1; x < this.cols; x++) ctx.fillRect(Math.round(ox + x * cell), oy, 1, H);
    for (let y = 1; y < this.rows; y++) ctx.fillRect(ox, Math.round(oy + y * cell), W, 1);

    const inset = Math.max(1, Math.round(cell * 0.06));
    for (const [x, y] of this.cfg.walls) {
      const px = Math.round(ox + x * cell);
      const py = Math.round(oy + y * cell);
      ctx.strokeStyle = 'rgba(255,255,255,0.34)';
      ctx.lineWidth = 1;
      ctx.strokeRect(px + inset + 0.5, py + inset + 0.5, cell - inset * 2 - 1, cell - inset * 2 - 1);
    }

    if (this.food) {
      const pad = cell * 0.16;
      ctx.fillStyle = '#ff2b2b';
      ctx.fillRect(
        Math.round(ox + this.food.x * cell + pad),
        Math.round(oy + this.food.y * cell + pad),
        Math.round(cell - pad * 2),
        Math.round(cell - pad * 2),
      );
    }

    const alpha = this.state === 'running' ? clamp(this.acc / this.interval(), 0, 1) : 1;
    const gap = Math.max(1, Math.round(cell * 0.07));

    this.snakes.forEach((snake, idx) => {
      const filled = idx === 0;
      for (let i = snake.body.length - 1; i >= 0; i--) {
        const p = this.posAt(snake, i, alpha);
        if (!p) continue;
        const px = Math.round(ox + p.x * cell);
        const py = Math.round(oy + p.y * cell);
        if (filled) {
          ctx.fillStyle = snake.alive ? (i === 0 ? '#ffffff' : '#d8d8d8') : '#3a3a3a';
          ctx.fillRect(px + gap, py + gap, cell - gap * 2, cell - gap * 2);
        } else {
          ctx.strokeStyle = snake.alive ? '#ffffff' : '#3a3a3a';
          ctx.lineWidth = Math.max(1, cell * 0.1);
          ctx.strokeRect(
            px + gap + 0.5,
            py + gap + 0.5,
            cell - gap * 2 - 1,
            cell - gap * 2 - 1,
          );
          if (!snake.alive) {
            ctx.fillStyle = 'rgba(255,255,255,0.06)';
            ctx.fillRect(px + gap, py + gap, cell - gap * 2, cell - gap * 2);
          }
        }
      }
      const head = this.posAt(snake, 0, alpha);
      if (head) {
        const size = Math.max(2, Math.round(cell * 0.17));
        const cx = ox + (head.x + 0.5) * cell + snake.dir.x * cell * 0.19;
        const cy = oy + (head.y + 0.5) * cell + snake.dir.y * cell * 0.19;
        ctx.fillStyle = filled ? '#000' : '#fff';
        ctx.fillRect(Math.round(cx - size / 2), Math.round(cy - size / 2), size, size);
      }
    });

    ctx.save();
    for (const p of this.particles) {
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(ox + p.x * cell), Math.round(oy + p.y * cell), 1, 1);
    }
    ctx.restore();

    ctx.restore();
  }
}

  Object.assign(modulo, { DUEL_CFG, Duel });
})(modulos['duel']);

// ---- main ----
(function (modulo) {
'use strict';
const { Game, POWER_INFO } = modulos['engine'];
const { Duel, DUEL_CFG } = modulos['duel'];
const { MODES, LEVELS, COLS, ROWS } = modulos['levels'];
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
  if (typeof Duel !== 'function') faltan.push('duelo');
  if (faltan.length) {
    avisar(`faltan piezas (${faltan.join(', ')}). casi seguro hay ficheros viejos en caché: pulsa recargar limpio.`);
    return false;
  }
  return true;
}

const ORDEN = ['campaign', 'classic', 'frenzy', 'portals', 'hunter', 'duel'];
const CLAVE = 'snake.v2';
const CLAVE_ANTIGUA = 'snake.frenzy.v1';
const COLUMNAS_NIVELES = 4;

const el = {
  stage: $('#stage'),
  canvas: $('#board'),
  overlay: $('#overlay'),
  prompt: $('#prompt'),
  hud: $('#hud'),
  hudDuel: $('#hud-duel'),
  meta: $('#hud-meta'),
  score: $('#hud-score'),
  best: $('#hud-best'),
  mult: $('#hud-mult'),
  duel0: $('#duel-score-0'),
  duel1: $('#duel-score-1'),
  chain: $('#chain-bar'),
  effects: $('#effects'),
  mute: $('#btn-mute'),
  full: $('#btn-full'),
  pause: $('#btn-pause'),
  hint: $('#hint'),
};

const pincel = el.canvas.getContext('2d', { alpha: false });

/* ---------------------------------------------------------- récords */

function nuevoRegistro() {
  return {
    best: { classic: 0, frenzy: 0, portals: 0, hunter: 0 },
    campaign: { unlocked: 1, best: {} },
    duel: { wins: 0, losses: 0, draws: 0 },
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
  const duelo = bruto.duel || {};
  datos.duel.wins = Number(duelo.wins) || 0;
  datos.duel.losses = Number(duelo.losses) || 0;
  datos.duel.draws = Number(duelo.draws) || 0;
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
  duelo: null,
  demo: null,
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
  const lado = Math.max(140, Math.min(anchoCaja, altoCaja) - 2);
  const celda = Math.max(8, Math.floor(lado / Math.max(COLS, ROWS)));
  const ancho = celda * COLS;
  const alto = celda * ROWS;

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
  home: '↑↓ elegir · enter jugar · M sonido',
  levels: 'flechas nav · enter jugar · esc menú',
  help: 'esc volver',
  playing: '',
  paused: 'P seguir · R reiniciar · esc menú',
  dead: 'R reintentar · esc menú',
  cleared: 'enter siguiente · esc menú',
  duelover: 'R revancha · esc menú',
};

function actualizarPista() {
  if (app.pantalla === 'playing') {
    el.hint.textContent = app.duelo
      ? 'p1 flechas · p2 WASD · P pausa'
      : esTactil()
        ? 'desliza para girar · toca para turbo'
        : 'espacio turbo · P pausa · R reiniciar · M sonido';
    return;
  }
  el.hint.textContent = PISTAS[app.pantalla] || '';
}

/* ---------------------------------------------------------- marcador */

function actualizarMarcador() {
  if (app.duelo) {
    el.hud.hidden = true;
    el.hudDuel.hidden = false;
    const [a, b] = app.duelo.snakes;
    const cero = puntos(a.score);
    const uno = puntos(b.score);
    if (el.duel0.textContent !== cero) el.duel0.textContent = cero;
    if (el.duel1.textContent !== uno) el.duel1.textContent = uno;
    el.prompt.classList.toggle('visible', app.duelo.state === 'ready');
    el.pause.textContent = app.pantalla === 'paused' ? 'seguir' : 'pausa';
    el.pause.disabled = app.pantalla !== 'playing' && app.pantalla !== 'paused';
    actualizarEfectos(null);
    return;
  }

  el.hud.hidden = false;
  el.hudDuel.hidden = true;

  const juego = app.juego;
  if (!juego) {
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
  if (modo === 'duel') return `${guardado.duel.wins}–${guardado.duel.losses}`;
  const mejor = guardado.best[modo] || 0;
  return mejor ? String(mejor) : '—';
}

function nombreModo(modo) {
  if (modo === 'campaign') return 'campaña';
  if (modo === 'duel') return 'duelo';
  return MODES[modo].name.toLowerCase();
}

function descripcion(modo) {
  if (modo === 'campaign') {
    return `campaña: ${LEVELS.length} niveles con muros`;
  }
  if (modo === 'duel') return 'duelo local a dos manos';
  return MODES[modo].name.toLowerCase() + ': ' + MODES[modo].tag;
}

function mostrarInicio() {
  pararTemporizador();
  app.juego = null;
  app.duelo = null;
  app.menuSel = 0;
  crearDemo();

  const filas = ORDEN.map((modo, i) => {
    return `<button class="row" type="button" data-modo="${modo}" data-i="${i}">
      <span class="row-idx">${dosDigitos(i + 1)}</span>
      <span class="row-name">${nombreModo(modo)}<small>${descripcion(modo)}</small></span>
      <span class="row-right">${valorDerecha(modo)}</span>
    </button>`;
  }).join('');

  ponerOverlay(`<div class="panel inicio">
    <div class="inicio-texto">
      <header class="inicio-cabeza">
        <h1>snake<span class="dot">.</span></h1>
        <p class="kicker">rejilla 20×20 · seis formas de morir</p>
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
    <aside class="inicio-demo" aria-hidden="true">
      <p class="kicker">en directo · frenesí</p>
      <canvas id="demo"></canvas>
      <p class="nota">alguien juega por ti<br>mientras decides</p>
    </aside>
  </div>`);

  el.score.textContent = '—';
  el.meta.textContent = 'elige un modo';
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
}

function elegirModo(modo) {
  if (modo === 'campaign') mostrarNiveles();
  else if (modo === 'duel') empezarDuelo();
  else empezarPartida(modo, 0);
}

/* ---------------------------------------------------------- niveles */

function mostrarNiveles() {
  pararTemporizador();
  app.juego = null;
  app.duelo = null;
  app.demo = null;
  app.nivelSel = Math.min(guardado.campaign.unlocked - 1, LEVELS.length - 1);
  pintarNiveles();
  el.score.textContent = '—';
  el.meta.textContent = 'campaña';
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
        <tr><th>sonido</th><td>M</td></tr>
        <tr><th>duelo</th><td>jugador 1 flechas · jugador 2 WASD</td></tr>
        <tr><th>mando</th><td>d-pad y sticks · A turbo · start pausa</td></tr>
      </tbody>
    </table>
    <p class="kicker">reglas</p>
    <ul class="reglas">
      <li>la comida encadena: dos frutas seguidas suben el multiplicador hasta ×5</li>
      <li>el rombo rojo caduca y da dos anillos de largo</li>
      <li>los iconos blancos dan poderes: círculo discontinuo fantasma (atraviesas todo), dos barras lento, cuadrado recorte</li>
      <li>el recuadro blanco que parpadea es el cazador: te persigue y acelera</li>
      <li>en los portales, entrar por uno te saca por el otro</li>
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
  app.duelo = null;
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

function empezarDuelo() {
  pararTemporizador();
  audio.unlock();
  app.juego = null;
  app.demo = null;
  app.duelo = new Duel(DUEL_CFG, eventosDuelo);
  app.modo = 'duel';
  app.record = false;

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
    case 'hunter':
      if (!juego || app.reloj - (juego.ultimoAcecho || 0) > 240) {
        audio.play('hunter');
        if (juego) juego.ultimoAcecho = app.reloj;
      }
      break;
    case 'die':
      audio.play('death');
      guardarMarca();
      app.temporizador = setTimeout(mostrarFin, 430);
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

function eventosDuelo(tipo, datos) {
  switch (tipo) {
    case 'start':
      audio.play('start');
      break;
    case 'eat':
      audio.play('bite', { multiplier: 1 });
      break;
    case 'death':
      audio.play('death');
      break;
    case 'over': {
      audio.play('duelEnd');
      const duelo = app.duelo;
      if (duelo) {
        if (duelo.winner === 0) guardado.duel.wins++;
        else if (duelo.winner === 1) guardado.duel.losses++;
        else guardado.duel.draws++;
        guardar();
      }
      app.temporizador = setTimeout(mostrarFinDuelo, 520);
      break;
    }
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

function mostrarFinDuelo() {
  const duelo = app.duelo;
  if (!duelo || duelo.state !== 'over') return;
  const [a, b] = duelo.snakes;
  const titulo = duelo.winner === 0 ? 'gana el jugador 1' : duelo.winner === 1 ? 'gana el jugador 2' : 'empate';

  ponerOverlay(`<div class="panel fin">
    <div class="fin-cabeza">
      <p class="kicker">${titulo}</p>
      <p class="cifra">${a.score}<span class="guion">—</span>${b.score}</p>
      <p class="nota">duelos ${guardado.duel.wins}–${guardado.duel.losses}${guardado.duel.draws ? ` · ${guardado.duel.draws} empates` : ''}</p>
    </div>
    <div class="acciones">
      <button class="principal" type="button" data-accion="rematch">revancha <kbd>R</kbd></button>
      <button type="button" data-accion="home">menú <kbd>esc</kbd></button>
    </div>
  </div>`);
  pantalla('duelover');
  el.pause.disabled = true;
}

/* ---------------------------------------------------------- pausa */

function pausar() {
  const enCurso = app.duelo || app.juego;
  if (!enCurso || app.pantalla !== 'playing') return;
  enCurso.pause();
  if (enCurso.state !== 'paused') return;
  audio.play('ui');

  let cifra;
  let nota;
  if (app.duelo) {
    const [a, b] = app.duelo.snakes;
    cifra = `${a.score}<span class="guion">—</span>${b.score}`;
    nota = 'duelo en pausa';
  } else {
    cifra = puntos(app.juego.score);
    nota = `${app.juego.fruits} frutas · récord ${Math.max(app.marca, app.juego.score)}`;
  }

  ponerOverlay(`<div class="panel fin">
    <div class="fin-cabeza">
      <p class="kicker">en pausa</p>
      <p class="cifra">${cifra}</p>
      <p class="nota">${nota}</p>
    </div>
    <div class="acciones">
      <button class="principal" type="button" data-accion="resume">seguir <kbd>P</kbd></button>
      <button type="button" data-accion="retry">${app.duelo ? 'revancha' : 'reiniciar'} <kbd>R</kbd></button>
      <button type="button" data-accion="home">menú <kbd>esc</kbd></button>
    </div>
  </div>`);
  pantalla('paused');
  el.pause.textContent = 'seguir';
  el.pause.disabled = false;
  el.prompt.classList.remove('visible');
}

function reanudar() {
  const enCurso = app.duelo || app.juego;
  if (!enCurso) return;
  enCurso.resume();
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

  // WASD en solitario y en menús se comporta como las flechas
  if (!app.duelo && nombre.endsWith('2')) nombre = nombre.slice(0, -1);

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

  const esDireccion = ['up', 'down', 'left', 'right', 'up2', 'down2', 'left2', 'right2'].includes(nombre);

  if (app.pantalla === 'home') {
    if (nombre === 'up') seleccionarModo(app.menuSel - 1);
    else if (nombre === 'down') seleccionarModo(app.menuSel + 1);
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
    else if (nombre === 'restart') {
      if (app.duelo) empezarDuelo();
      else empezarPartida(app.modo, app.nivel);
    }
    return;
  }

  if (app.pantalla === 'dead' || app.pantalla === 'duelover') {
    if (nombre === 'confirm' || nombre === 'restart') {
      if (app.pantalla === 'duelover') empezarDuelo();
      else empezarPartida(app.modo, app.nivel);
    } else if (nombre === 'back') mostrarInicio();
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
    if (app.duelo) empezarDuelo();
    else if (app.juego) empezarPartida(app.modo, app.nivel);
    return;
  }
  if (!esDireccion) return;

  const direcciones = {
    up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0],
    up2: [0, -1], down2: [0, 1], left2: [-1, 0], right2: [1, 0],
  };
  const [dx, dy] = direcciones[nombre];
  if (app.duelo) {
    app.duelo.setDirection(nombre.endsWith('2') ? 1 : 0, dx, dy);
  } else if (app.juego) {
    app.juego.setDirection(dx, dy);
  }
}

function ejecutar(nombre) {
  switch (nombre) {
    case 'retry':
      if (app.duelo) empezarDuelo();
      else empezarPartida(app.modo, app.nivel);
      break;
    case 'next':
      empezarPartida('campaign', Math.min(app.nivel + 1, LEVELS.length - 1));
      break;
    case 'rematch':
      empezarDuelo();
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
  guardado.best = { classic: 0, frenzy: 0, portals: 0, hunter: 0 };
  guardado.campaign = { unlocked: 1, best: {} };
  guardado.duel = { wins: 0, losses: 0, draws: 0 };
  guardar();
  audio.play('ui');
  mostrarInicio();
}

/* ---------------------------------------------------------- sonido y pantalla */

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

function pantallaCompleta() {
  const doc = document.documentElement;
  const pedir = doc.requestFullscreen || doc.webkitRequestFullscreen;
  const salir = document.exitFullscreen || document.webkitExitFullscreen;
  if (!pedir) {
    el.full.disabled = true;
    return;
  }
  if (doc.fullscreenElement) salir.call(document).catch(() => {});
  else pedir.call(doc).catch(() => {});
}

/* ---------------------------------------------------------- demo del menú */

function crearDemo() {
  const cfg = { ...MODES.frenzy, startSpeed: 96, rampPerSec: 0.4, goal: null, powerEvery: 4 };
  const juego = new Game(cfg, () => {});
  juego.state = 'running';
  app.demo = juego;
  app.demoAcum = 0;
  ajustarLienzo();
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
  if (demo.state === 'dead' || demo.state === 'cleared') crearDemo();

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

el.full.addEventListener('click', () => {
  soltarFoco();
  pantallaCompleta();
});

document.addEventListener('fullscreenchange', () => {
  el.full.classList.toggle('apagado', !!document.fullscreenElement);
});

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
  } else if (app.duelo) {
    app.duelo.update(dt);
    app.duelo.draw(pincel, vista);
    actualizarMarcador();
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
  window.__snake = { app, guardado, accion, empezarPartida, empezarDuelo, mostrarInicio };
}
})(modulos['main']);
})();
