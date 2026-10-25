/* snake — un solo fichero, sin módulos. generado por tools/build.mjs (2026-10-25 · v14).
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
const GROUPS = [
  { name: 'progreso', tag: 'campaña de 20 niveles', modes: ['campaign'] },
  { name: 'infinitos', tag: 'puntuación sin final', modes: ['classic', 'frenzy', 'hunter'] },
  // BORRAR-COMPETITIVO · el grupo entero se va con el modo
  { name: 'competitivo', tag: '1 vs 1 vs 1 vs 1 contra bots', modes: ['competitive'] },
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
    tag: 'cada fruta acelera · pasados 30 puntos empiezan a salir muros',
    startSpeed: 142,
    minSpeed: 82,
    accelPerFood: 1.5,
    wallFrom: 30,
    wallEvery: 6,
    wallMax: 18,
  },
  frenzy: {
    ...base,
    id: 'frenzy',
    name: 'FRENESÍ',
    tag: 'bordes abiertos y la velocidad sube sola',
    startSpeed: 124,
    minSpeed: 56,
    accelPerFood: 0.8,
    rampPerSec: 0.5,
    wrap: true,
    bonusEvery: 4,
    powerEvery: 5,
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
    hunterPellets: 3,
    hunterCap: 18,
    hunterSight: 5,
    bonusEvery: 6,
    powerEvery: 5,
  },
  // ── BORRAR-COMPETITIVO ──────────────────────────────────────────────
  competitive: {
    ...base,
    id: 'competitive',
    name: 'COMPETITIVO',
    tag: '1 vs 1 vs 1 vs 1 contra bots · 60 s · mapa y modificador',
    startSpeed: 132,
    minSpeed: 78,
    accelPerFood: 1.1,
    competitive: true,
  },
  // ── fin BORRAR-COMPETITIVO ──────────────────────────────────────────
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


/* ═════════════════════════════════════════════════════════════════════════════
   BORRAR-COMPETITIVO · TODO ESTE BLOQUE ES TEMPORAL

   el competitivo es un modo que se puede quitar entero cuando ya no haga falta.
   para saber exactamente qué borrar (datos, pantallas, estilos, pruebas y readme):

       grep -rn BORRAR-COMPETITIVO .

   cada trozo está marcado con esa etiqueta. si borras esto, borra también el
   modo `competitive` de arriba y el grupo del menú que lo abre.
   ═════════════════════════════════════════════════════════════════════════════ */

// BORRAR-COMPETITIVO: siete rangos, de hierro a obsidiana
const COMPETITIVE = {
  tiempo: 60000,
  jugadores: 4,
  porRango: 12,
  // BORRAR-COMPETITIVO: siete peldaños, de hierro a obsidiana
  rangos: ['hierro', 'cobre', 'bronce', 'plata', 'oro', 'platino', 'obsidiana'],
  // lo que cuesta morirse: un 20 % de lo que llevas, con un mínimo
  castigo: { fraccion: 0.2, minimo: 40 },
  // puntos que da cada puesto al terminar: 1º, 2º, 3º y 4º
  premios: [3, 1, -1, -2],
  bots: ['pulso', 'ruido', 'onda'],
  // BORRAR-COMPETITIVO: mapas propios del modo (además de los 20 de la campaña)
  arenas: [
    { nombre: 'abierta', walls: [] },
    {
      nombre: 'cruz',
      walls: [...vline(10, 0, 7), ...vline(10, 13, 7), ...hline(0, 10, 7), ...hline(13, 10, 7)],
    },
    {
      nombre: 'anillos',
      walls: holes(ring(6, 6, 8, 8), [[6, 10], [13, 10], [10, 6], [10, 13]]),
    },
    {
      nombre: 'esquinas',
      walls: [...rect(2, 2, 2, 2), ...rect(16, 2, 2, 2), ...rect(2, 16, 2, 2), ...rect(16, 16, 2, 2)],
    },
    {
      nombre: 'pasillos',
      walls: [
        ...holes(vline(5, 1, 18), [[5, 9], [5, 10]]),
        ...holes(vline(14, 1, 18), [[14, 9], [14, 10]]),
      ],
    },
  ],
  // BORRAR-COMPETITIVO: un modificador por partida, encima del mapa
  modificadores: [
    {
      id: 'limpio',
      nombre: 'sin muros',
      tag: 'el mapa va vacío',
      aplicar: (cfg) => { cfg.walls = []; },
    },
    {
      id: 'muros',
      nombre: 'muros',
      tag: 'salen muros desde la sexta fruta',
      aplicar: (cfg) => { cfg.wallFrom = 6; cfg.wallEvery = 7; cfg.wallMax = 24; },
    },
    {
      id: 'rapido',
      nombre: 'rápido',
      tag: 'todo va un 15 % más rápido',
      aplicar: (cfg) => {
        cfg.startSpeed = Math.round(cfg.startSpeed * 0.85);
        cfg.minSpeed = Math.round(cfg.minSpeed * 0.85);
      },
    },
    {
      id: 'lento',
      nombre: 'lento',
      tag: 'todo va más tranquilo',
      aplicar: (cfg) => {
        cfg.startSpeed = Math.round(cfg.startSpeed * 1.25);
        cfg.minSpeed = Math.round(cfg.minSpeed * 1.15);
      },
    },
    {
      id: 'hambre',
      nombre: 'hambre',
      tag: 'un poder cada tres frutas',
      aplicar: (cfg) => { cfg.powerEvery = 3; },
    },
    {
      id: 'sobrio',
      nombre: 'sin premios',
      tag: 'no sale el cubo rojo hueco',
      aplicar: (cfg) => { cfg.bonusEvery = 0; },
    },
  ],
};

// BORRAR-COMPETITIVO: un mapa al azar entre las arenas y los 20 niveles
function mapaDePartida(azar = Math.random) {
  const lista = [
    ...COMPETITIVE.arenas.map((a) => ({ nombre: a.nombre, walls: a.walls })),
    ...LEVELS.map((n, i) => ({ nombre: `nivel ${String(i + 1).padStart(2, '0')}`, walls: n.walls })),
  ];
  return lista[Math.min(lista.length - 1, Math.floor(azar() * lista.length))];
}

// BORRAR-COMPETITIVO
function modificadorDePartida(azar = Math.random) {
  const lista = COMPETITIVE.modificadores;
  return lista[Math.min(lista.length - 1, Math.floor(azar() * lista.length))];
}

// BORRAR-COMPETITIVO: la rejilla de cada jugador sale de aquí (mismo mapa y modificador)
function configCompetitivo(mapa, modificador, extra = {}) {
  const cfg = {
    ...MODES.competitive,
    walls: (mapa && mapa.walls ? mapa.walls : []).map((c) => [c[0], c[1]]),
    ...extra,
  };
  cfg.goal = null;
  if (modificador && modificador.aplicar) modificador.aplicar(cfg);
  return cfg;
}

// BORRAR-COMPETITIVO: ascensos y descensos. delta son los puntos del puesto
function ajustarRango(estado, delta) {
  const total = COMPETITIVE.rangos.length;
  let rango = Math.min(total - 1, Math.max(0, Math.round(estado.rango || 0)));
  let dentro = (Number(estado.dentro) || 0) + delta;
  let sube = false;
  let baja = false;
  while (dentro >= COMPETITIVE.porRango && rango < total - 1) {
    dentro -= COMPETITIVE.porRango;
    rango++;
    sube = true;
  }
  while (dentro < 0 && rango > 0) {
    dentro += COMPETITIVE.porRango;
    rango--;
    baja = true;
  }
  // en el último rango no se sube más y en el primero no se baja
  if (rango === total - 1) dentro = Math.min(dentro, COMPETITIVE.porRango - 1);
  if (rango === 0) dentro = Math.max(0, dentro);
  return { rango, dentro, sube, baja };
}

// BORRAR-COMPETITIVO: lo que se enseña del rango (nombre, siguiente y barra)
function rangoInfo(estado) {
  const total = COMPETITIVE.rangos.length;
  const rango = Math.min(total - 1, Math.max(0, Math.round((estado && estado.rango) || 0)));
  const dentro = Math.min(COMPETITIVE.porRango, Math.max(0, Number(estado && estado.dentro) || 0));
  return {
    rango,
    nivel: rango + 1,
    total,
    nombre: COMPETITIVE.rangos[rango],
    siguiente: rango < total - 1 ? COMPETITIVE.rangos[rango + 1] : null,
    dentro,
    falta: COMPETITIVE.porRango - dentro,
    progreso: dentro / COMPETITIVE.porRango,
  };
}

// BORRAR-COMPETITIVO: lo que te cuesta morirte en la partida
function castigoMuerte(puntos) {
  const { fraccion, minimo } = COMPETITIVE.castigo;
  if (!(puntos > 0)) return minimo;
  return Math.max(minimo, Math.round(puntos * fraccion));
}

// BORRAR-COMPETITIVO: cuánto aprietan los bots según tu rango (1,30 lento → 0,93 rápido)
function escalaBots(rango) {
  const total = COMPETITIVE.rangos.length;
  const r = Math.min(total - 1, Math.max(0, rango || 0));
  return 1.3 - (r / (total - 1)) * 0.37;
}

  Object.assign(modulo, { COLS, ROWS, GROUPS, MODE_ORDER, MODES, LEVELS, COMPETITIVE, mapaDePartida, modificadorDePartida, configCompetitivo, ajustarRango, rangoInfo, castigoMuerte, escalaBots });
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
    this.hitStop = 0;
    this.crash = null;
    this.wallTicks = 0;
    this.fx = { ghost: 0, slow: 0 };
    this.bonus = null;
    this.power = null;
    this.hunter = null;
    this.hunterTick = 0;
    this.pellets = [];
    this.reveal = 0;
    this.chomp = 0;
    this.gracia = 0; // BORRAR-COMPETITIVO
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
    return Math.min(5, 1 + Math.floor(this.chain / 2));
  }

  get ghosting() {
    return this.fx.ghost > 0;
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
    if (this.reveal < 1) this.reveal = Math.min(1, this.reveal + dt / 1000);
    if (this.gracia > 0) this.gracia = Math.max(0, this.gracia - dt); // BORRAR-COMPETITIVO
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

    // BORRAR-COMPETITIVO: al revivir hay 1,4 s de gracia en los que nada te mata
    const gracia = this.gracia > 0;
    if (cfg.wrap || ghost || gracia) {
      hx = (hx + this.cols) % this.cols;
      hy = (hy + this.rows) % this.rows;
    } else if (hx < 0 || hy < 0 || hx >= this.cols || hy >= this.rows) {
      return this.die('borde', clamp(hx, 0, this.cols - 1), clamp(hy, 0, this.rows - 1));
    }

    if (!ghost && !gracia && this.wallSet.has(K(hx, hy))) return this.die('muro', hx, hy);
    // el cuerpo del cazador no te mata: le muerdes el anillo y sigues.
    // sólo su cabeza puede comerte (y sólo si cae sobre la tuya)
    if (!ghost && !gracia && this.hunter) {
      const golpe = this.hunter.body.findIndex((c) => c.x === hx && c.y === hy);
      if (golpe === 0) return this.die('cazador', hx, hy);
      if (golpe > 0) {
        this.hunter.body.splice(golpe, 1);
        this.hunter.prev.splice(golpe, 1);
        this.burst(hx + 0.5, hy + 0.5, 10, '#c21414', 5);
        this.score += 20;
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
    if (!ghost && !gracia) {
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
    this.score += 10 * this.multiplier + (rapido ? 5 * this.multiplier : 0);
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
    if (cfg.wallFrom && this.fruits > cfg.wallFrom && cfg.wallEvery &&
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
    this.score += 15 * this.multiplier;
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

  // BORRAR-COMPETITIVO · en competitivo morirse no cierra la partida:
  // vuelves al centro, conservas tus frutas y pagas puntos
  revivir(castigo = 0) {
    const pagado = Math.min(this.score, Math.max(0, Math.round(castigo)));
    this.score -= pagado;
    this.crash = null;
    this.particles.length = 0;
    this.hitStop = 0;
    this.shake = 0;
    const start = this.findStart();
    this.body = [];
    for (let i = 0; i < 4; i++) {
      this.body.push({ x: start.x - start.dir.x * i, y: start.y - start.dir.y * i });
    }
    this.prevBody = this.body.map((p) => ({ ...p }));
    this.dir = { ...start.dir };
    this.queue = [];
    this.grow = 0;
    this.acc = 0;
    this.turbo = false;
    this.gracia = 1400;
    this.state = 'running';
    this.savedState = 'running';
    this.emit('revive', { castigo: pagado, score: this.score });
    return pagado;
  }

  die(reason, x, y) {
    if (this.state !== 'running') return;
    this.state = 'dead';
    this.turbo = false;
    this.shake = 11;
    this.flash = 0.8;
    this.hitStop = 90;
    const impactox = x ?? this.body[0].x;
    const impactoY = y ?? this.body[0].y;
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
    if (this.power) return;
    const cell = this.freeCell(0);
    if (!cell) return;
    const kind = POWER[rand(POWER.length)];
    this.power = { ...cell, kind, ttl: 9000 };
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
    this.score += 100;
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
      !this.body.some((c) => c.x === x && c.y === y);
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
      aim: null,
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
    const dist = Math.abs(jefe.x - cabeza.x) + Math.abs(jefe.y - cabeza.y);
    if (h.body.length >= this.hunterUmbral() && dist <= 3) return 1;
    // corto: se toma su tiempo; largo: aprieta
    return h.body.length >= this.hunterUmbral() ? 2 : 4;
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
    // a partir de siete anillos ya te caza, y ahí sí puede caer sobre ti
    const agresivo = this.hunterPelea;
    const bloqueado = new Set([...this.wallSet, ...ocupadoCuerpo]);
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

    for (const [dx, dy] of DIRS) {
      const nx = cabeza.x + dx;
      const ny = cabeza.y + dy;
      if (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows) continue;
      const k = K(nx, ny);
      if (bloqueado.has(k)) continue;
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

      if (puntos > mejorPunto) {
        mejorPunto = puntos;
        elegido = { x: nx, y: ny };
      }
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
    const pulso = Math.floor(this.time / 160) % 2 === 0 ? 0.95 : 0.6;
    // si darse contra él mata, el borde es una pared y se ve siempre
    if (!(this.cfg.wrap || this.ghosting)) {
      return esSalida && dist <= 4 ? pulso : 0.34;
    }
    // si no mata (frenesí, fantasma), sólo se marca al acercarse
    if (this.reveal < 1) {
      const luz = 1.2 + this.reveal * 17;
      const lejos = Math.max(Math.abs(cx - cabeza.x), Math.abs(cy - cabeza.y));
      if (lejos <= luz + 1) return 0.26 * (1 - this.reveal);
    }
    if (dist > 4) return 0;
    return esSalida ? pulso : 0.16;
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

    // BORRAR-COMPETITIVO · miniatura: sin rejilla, sin luz ni adornos, sólo lo que importa
    const mini = !!view.mini;

    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, view.width, view.height);

    ctx.save();
    if (this.shake > 0.2) {
      const s = this.shake;
      ctx.translate(Math.round((Math.random() - 0.5) * s), Math.round((Math.random() - 0.5) * s));
    }

    // rejilla de 1 px (en la miniatura sobra: se come la serpiente)
    if (!mini) {
      ctx.fillStyle = '#141414';
      for (let x = 1; x < this.cols; x++) ctx.fillRect(Math.round(ox + x * cell), oy, 1, H);
      for (let y = 1; y < this.rows; y++) ctx.fillRect(ox, Math.round(oy + y * cell), W, 1);
    }

    // ---- borde: bloques. donde hay muro se marca; donde no, sólo al acercarte,
    // y el bloque por el que vas a salir se enciende (aviso de salida)
    const grosor = Math.max(2, Math.round(cell * 0.2));
    const tramoBorde = (x0, y0, w, h, cx, cy, sentido) => {
      const alfa = mini ? 0.3 : this.alfaBorde(cx, cy, sentido);
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
      if (mini) {
        // un muro es un bloque gris, sin contorno de 1 px
        const [mx, my, mw] = caja(x, y, Math.round(cell * 0.12), lado - Math.round(cell * 0.24));
        ctx.fillStyle = 'rgba(255,255,255,0.26)';
        ctx.fillRect(mx, my, mw, mw);
        continue;
      }
      const [px, py, w] = caja(x, y, inset, lado - inset * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(px, py, w, w);
      ctx.strokeStyle = 'rgba(255,255,255,0.36)';
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 0.5, py + 0.5, w - 1, w - 1);
    }

    // muros que van a salir: un cubo hueco que parpadea y se cierra
    for (const w of (mini ? [] : this.pendingWalls)) {
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
      } else {
        ctx.strokeRect(px + 0.5, py + 0.5, w - 1, w - 1);
        ctx.fillStyle = '#fff';
        ctx.fillRect(Math.round(px + w * 0.36), Math.round(py + w * 0.36), Math.max(2, Math.round(w * 0.28)), Math.max(2, Math.round(w * 0.28)));
      }
    }

    // el cazador avisa de por dónde va a cortar
    if (this.hunter && this.hunter.aim) {
      const aim = this.hunter.aim;
      const dist = Math.abs(aim.x - this.body[0].x) + Math.abs(aim.y - this.body[0].y);
      if (dist <= (this.cfg.hunterAimShow || 7) && Math.floor(this.time / 110) % 2 === 0) {
        const m = Math.round(cell * 0.2);
        const [px, py, w] = caja(aim.x, aim.y, m, lado - m * 2);
        ctx.strokeStyle = 'rgba(255,43,43,0.85)';
        ctx.lineWidth = Math.max(1, Math.round(cell * 0.07));
        ctx.strokeRect(px + 0.5, py + 0.5, w - 1, w - 1);
      }
    }

    // puntos azules del cazador
    for (const punto of this.pellets) {
      const [px, py, w] = caja(punto.x, punto.y, Math.round(cell * 0.33), lado - Math.round(cell * 0.66));
      ctx.fillStyle = '#3d7bff';
      ctx.fillRect(px, py, w, w);
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

    if (this.reveal < 1 && !mini) {
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
    else if (this.gracia > 0) {
      // BORRAR-COMPETITIVO: parpadeo por bloques mientras dura la gracia
      ctx.globalAlpha = Math.floor(this.gracia / 110) % 2 === 0 ? 0.45 : 1;
    }
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

    // chispas: también cuadradas (en la miniatura, fuera)
    if (mini) this.particles.length = 0;
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

// ---- main ----
(function (modulo) {
'use strict';
const { Game, POWER_INFO } = modulos['engine'];
const { MODES, LEVELS, GROUPS, MODE_ORDER, COLS, ROWS, // BORRAR-COMPETITIVO
  COMPETITIVE, mapaDePartida, modificadorDePartida, configCompetitivo, ajustarRango, rangoInfo, escalaBots, castigoMuerte } = modulos['levels'];
const { audio } = modulos['audio'];
const { attachInput } = modulos['input'];

const $ = (sel) => document.querySelector(sel);

// si algo se rompe, que se vea en pantalla en vez de quedarse en negro
function avisar(mensaje) {
  if (typeof window.__snakeFallo === 'function') window.__snakeFallo(mensaje);
}

function comprobarPiezas() {
  const faltan = [];
  // BORRAR-COMPETITIVO (la parte de competitive se puede quitar)
  if (!MODES || !MODES.classic || !MODES.frenzy || !MODES.hunter || !MODES.competitive) faltan.push('modos');
  if (!COMPETITIVE || !COMPETITIVE.rangos || COMPETITIVE.rangos.length !== 7) faltan.push('competitivo');
  if (!Array.isArray(LEVELS) || LEVELS.length !== 20) faltan.push('niveles');
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

const el = {
  stage: $('#stage'),
  canvas: $('#board'),
  overlay: $('#overlay'),
  prompt: $('#prompt'),
  meta: $('#hud-meta'),
  score: $('#hud-score'),
  reloj: $('#reloj'), // BORRAR-COMPETITIVO
  minis: $('#minis'), // BORRAR-COMPETITIVO
  aviso: $('#aviso'), // BORRAR-COMPETITIVO
  sorteo: $('#sorteo'), // BORRAR-COMPETITIVO
  sorteoMapa: $('#sorteo-mapa'), // BORRAR-COMPETITIVO
  sorteoMod: $('#sorteo-mod'), // BORRAR-COMPETITIVO
  cuenta: $('#cuenta'), // BORRAR-COMPETITIVO
  pila: $('#pila'), // BORRAR-COMPETITIVO
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
    best: { classic: 0, frenzy: 0, hunter: 0, competitive: 0 },
    campaign: { unlocked: 1, best: {} },
    // BORRAR-COMPETITIVO
    comp: { rango: 0, dentro: 0, partidas: 0, victorias: 0 },
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
  // BORRAR-COMPETITIVO
  const comp = bruto.comp || {};
  datos.comp = {
    rango: Math.min(COMPETITIVE.rangos.length - 1, Math.max(0, parseInt(comp.rango, 10) || 0)),
    dentro: Math.min(COMPETITIVE.porRango, Math.max(0, parseInt(comp.dentro, 10) || 0)),
    partidas: Math.max(0, parseInt(comp.partidas, 10) || 0),
    victorias: Math.max(0, parseInt(comp.victorias, 10) || 0),
  };
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
  marca: 0,
  reloj: 0,
  temporizador: 0,
  record: false,
  chips: new Map(),
  comp: null, // BORRAR-COMPETITIVO
  mapasComp: [], // BORRAR-COMPETITIVO
  mapaComp: null, // BORRAR-COMPETITIVO
  modComp: null, // BORRAR-COMPETITIVO
  intervalo: 0, // BORRAR-COMPETITIVO
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
  // BORRAR-COMPETITIVO · el sorteo va con intervalo propio
  if (app.intervalo) {
    clearInterval(app.intervalo);
    app.intervalo = 0;
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
  // BORRAR-COMPETITIVO · con las minis al lado, el tablero les deja su columna
  const conMinis = !!(app.comp && app.comp.activo && el.minis && !el.minis.hidden);
  const apilado = conMinis && esApilado();
  if (el.pila) el.pila.classList.toggle('apilado', apilado);
  const hueco = conMinis ? (apilado ? 96 : 106) : 0;
  const anchoUtil = apilado ? anchoCaja : anchoCaja - hueco;
  const altoUtil = apilado ? altoCaja - hueco : altoCaja;
  // el tablero ocupa todo el hueco: celdas fraccionarias, sin bordes muertos
  const lado = Math.max(160, Math.min(anchoUtil, altoUtil) - 2);
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
    foco.indice = -1;
    return;
  }
  el.overlay.innerHTML = html;
  el.overlay.classList.add('abierto');
  el.overlay.scrollTop = 0;
}

function pantalla(nombre) {
  app.pantalla = nombre;
  document.body.dataset.screen = nombre;
  // BORRAR-COMPETITIVO · el reloj, las minis y la cuenta sólo existen jugando
  if (nombre !== 'playing' && nombre !== 'paused') {
    if (el.reloj) el.reloj.hidden = true;
    if (el.minis) el.minis.hidden = true;
    if (el.cuenta) el.cuenta.hidden = true;
    if (el.sorteo) el.sorteo.hidden = true;
  }
  actualizarPista();
}

const PISTAS = {
  home: '↑↓ grupo · enter abrir',
  modes: '↑↓ modo · ←→ grupo · enter jugar · esc volver',
  levels: 'flechas nav · enter jugar · esc grupos',
  help: 'esc volver',
  playing: '',
  paused: 'P seguir · R reiniciar · esc menú',
  dead: 'R reintentar · esc menú',
  cleared: 'enter siguiente · esc menú',
  // BORRAR-COMPETITIVO
  sorteo: 'sorteando mapa y modificador…',
  'versus-fin': 'enter revancha · esc menú',
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
      actualizarEfectos(null);
    return;
  }

  const valor = puntos(juego.score);
  if (el.score.textContent !== valor) el.score.textContent = valor;

  let meta;
  // BORRAR-COMPETITIVO
  if (app.modo === 'competitive' && app.comp) {
    const info = rangoInfo(guardado.comp);
    const puestos = tablaCompetitivo(app.comp);
    const puesto = Math.max(1, puestos.findIndex((f) => f.yo) + 1);
    meta = `${info.nombre} · ${puesto}º/${puestos.length}`;
  } else if (app.modo === 'campaign') {
    const nivel = LEVELS[app.nivel];
    meta = `${dosDigitos(app.nivel + 1)} ${nivel.name.toLowerCase()} · ${Math.min(juego.fruits, nivel.goal)}/${nivel.goal}`;
  } else {
    meta = `${MODES[app.modo].name.toLowerCase()} · ${juego.fruits} frutas`;
  }
  if (el.meta.textContent !== meta) el.meta.textContent = meta;

  // BORRAR-COMPETITIVO · cuenta atrás centrada sobre el tablero
  if (el.reloj) {
    const conReloj = app.modo === 'competitive' && !!app.comp && app.comp.activo;
    el.reloj.hidden = !conReloj;
    if (conReloj) {
      const segundos = Math.max(0, Math.ceil(app.comp.restante / 1000));
      const texto = String(segundos);
      if (el.reloj.textContent !== texto) el.reloj.textContent = texto;
      el.reloj.classList.toggle('apurado', app.comp.restante <= 10000);
    }
  }

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
    if (juego.cfg && juego.cfg.hunter && juego.hunter && juego.hunterPelea) {
      const tope = juego.cfg.hunterCap || 18;
      const umbral = juego.hunterUmbral();
      const largo = juego.hunter.body.length;
      activos.push(['te caza', largo >= tope ? 1 : (largo - umbral) / Math.max(1, tope - umbral)]);
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
  if (app.pantalla === 'modes') return todos.filter((b) => b.dataset.modo !== undefined);
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

function nombreModo(modo) {
  if (modo === 'campaign') return 'campaña';
  return MODES[modo].name.toLowerCase();
}

function descripcion(modo) {
  if (modo === 'campaign') return `20 niveles con muros · ${guardado.campaign.unlocked - 1} superados`;
  return MODES[modo].tag;
}

function valorDerecha(modo) {
  if (modo === 'campaign') return `${guardado.campaign.unlocked - 1}/${LEVELS.length}`;
  const mejor = guardado.best[modo] || 0;
  return mejor ? String(mejor) : '—';
}

function resumenGrupo(indice) {
  const grupo = GROUPS[indice];
  if (indice === 0) return `${guardado.campaign.unlocked - 1}/${LEVELS.length}`;
  // BORRAR-COMPETITIVO
  if (grupo.modes.includes('competitive')) {
    const info = rangoInfo(guardado.comp);
    return `${icoRango(info.rango)}${info.nombre} ${info.dentro}/${COMPETITIVE.porRango}`;
  }
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
    <span class="row-name">${nombreModo(modo)}<small>${descripcion(modo)}</small></span>
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
      <span class="row-name">${grupo.name}<small>${grupo.tag}${grupo.modes.length > 1 ? ` · ${grupo.modes.length} modos` : ''}</small></span>
      <span class="row-right">${resumenGrupo(i)}</span>
    </button>`).join('');

  ponerOverlay(`<div class="panel inicio portada">
    <div class="inicio-texto">
      <header class="inicio-cabeza">
        <h1>snake<span class="dot">.</span></h1>
        <p class="kicker">rejilla 20×20 · ${LEVELS.length} niveles · ${MODE_ORDER.length - 1} modos</p>
      </header>
      <nav class="filas" aria-label="grupos">${filas}</nav>
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
      <canvas id="demo" aria-label="vista previa"></canvas>
      <p class="nota" id="demo-nota">elige un grupo para ver sus modos</p>
    </aside>
  </div>`);

  el.score.textContent = '—';
  el.meta.textContent = 'elige un grupo';
  el.best.textContent = '';
  el.mult.textContent = '';
  el.chain.style.width = '0%';
  el.pause.disabled = true;
  el.pause.textContent = 'pausa';
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
    `<button class="tab${i === app.grupo ? ' sel' : ''}" type="button" data-tab="${i}">${g.name}</button>`).join('');

  ponerOverlay(`<div class="panel modos">
    <div class="niveles-cabeza">
      <div>
        <p class="kicker">menú · ${dosDigitos(app.grupo + 1)}</p>
        <h2>${grupo.name}</h2>
      </div>
      <button class="ghost" type="button" data-accion="home">grupos <kbd>esc</kbd></button>
    </div>
    <nav class="tabs" aria-label="cambiar de grupo">${tabs}</nav>
    <div class="modos-cuerpo">
      <nav class="filas" aria-label="modos">${filas}</nav>
      <aside class="inicio-demo">
        <p class="kicker" id="demo-titulo">vista previa</p>
        <canvas id="demo" aria-label="vista previa del modo"></canvas>
        <p class="nota" id="demo-nota"></p>
      </aside>
    </div>
    <p class="pie"><span>↑↓ elegir · ←→ cambiar de grupo · enter jugar</span></p>
  </div>`);

  el.score.textContent = '—';
  el.meta.textContent = grupo.name;
  el.best.textContent = '';
  el.mult.textContent = '';
  el.chain.style.width = '0%';
  el.pause.disabled = true;
  el.pause.textContent = 'pausa';
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
  // BORRAR-COMPETITIVO
  else if (modo === 'competitive') sorteoCompetitivo(); // BORRAR-COMPETITIVO
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
      <button class="ghost" type="button" data-accion="modos">grupos <kbd>esc</kbd></button>
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
        <tr><th>menú</th><td>↑↓ grupo o modo · ←→ cambiar de grupo</td></tr>
        <tr><th>sonido</th><td>M</td></tr>
        <tr><th>mando</th><td>d-pad y sticks · A turbo · start pausa</td></tr>
      </tbody>
    </table>
    <p class="kicker">reglas</p>
    <ul class="reglas">
      <li>dos frutas seguidas suben el multiplicador hasta ×5</li>
      <li>cubo rojo hueco: caduca y alarga dos anillos</li>
      <li>cuadros blancos: fantasma, lento y recorte</li>
      <li>el fantasma atraviesa todo, también tu cuerpo</li>
      <li>el borde que mata se ve siempre</li>
      <li>campaña: la fruta que cierra el nivel es amarilla</li>
      <li>clásico: pasadas 30 frutas salen muros</li>
      <li>frenesí: los bordes dan la vuelta</li>
      <li>cazador: come puntos hasta 12 anillos y luego te caza</li>
      <li>cazador: su cuerpo no te mata; si choca contigo, revienta</li>
      <li>competitivo: 4 cuadrículas, 60 s, gana el que más puntos tiene</li>
      <li>competitivo: si te matas revives, pero pierdes un 20 %</li>
    </ul>
    <p class="pie"><span>osciladores y ruido en directo · sin ficheros de audio</span></p>
  </div>`);
  pantalla('help');
  enfocarPrimero('button[data-accion="home"]');
}

/* ------------------------------------------- competitivo (BORRAR-COMPETITIVO)
   modo temporal: 1 vs 1 vs 1 vs 1 contra bots, con sorteo de mapa y modificador,
   cuenta atrás para que los cuatro empiecen a la vez y las cuadrículas rivales
   en directo. para quitarlo entero:  grep -rn BORRAR-COMPETITIVO .
--------------------------------------------------------------------------- */

// BORRAR-COMPETITIVO · iconos de rango: cubos, sin degradados ni adornos
const RANGO_ICONO = [
  '<rect x="10" y="10" width="8" height="8"/>',
  '<rect x="10" y="4" width="8" height="8"/><rect x="10" y="16" width="8" height="8"/>',
  '<rect x="4" y="4" width="8" height="8"/><rect x="4" y="16" width="8" height="8"/><rect x="16" y="16" width="8" height="8"/>',
  '<rect x="4" y="4" width="8" height="8"/><rect x="16" y="4" width="8" height="8"/><rect x="4" y="16" width="8" height="8"/><rect x="16" y="16" width="8" height="8"/>',
  '<rect x="4" y="4" width="8" height="8"/><rect x="16" y="4" width="8" height="8"/><rect x="10" y="10" width="8" height="8"/><rect x="4" y="16" width="8" height="8"/><rect x="16" y="16" width="8" height="8"/>',
  '<rect x="10" y="2" width="8" height="8"/><rect x="2" y="10" width="8" height="8"/><rect x="18" y="10" width="8" height="8"/><rect x="10" y="18" width="8" height="8"/>',
  '<rect x="10" y="2" width="8" height="8"/><rect x="2" y="10" width="8" height="8"/><rect x="10" y="10" width="8" height="8"/><rect x="18" y="10" width="8" height="8"/><rect x="10" y="18" width="8" height="8"/>',
];

function icoRango(indice, clase = '') {
  return `<svg class="ico-rango${clase ? ` ${clase}` : ''}" viewBox="0 0 28 28" aria-hidden="true" focusable="false">${RANGO_ICONO[indice] || ''}</svg>`;
}

// los siete iconos, con el actual marcado
function tiraRangos(rangoActual) {
  return `<div class="rangos" aria-label="rango ${rangoActual + 1} de ${COMPETITIVE.rangos.length}">${
    COMPETITIVE.rangos.map((nombre, i) => {
      const clase = i === rangoActual ? ' aqui' : i < rangoActual ? ' hecho' : '';
      return `<span class="bloque${clase}" title="${nombre}">${icoRango(i)}</span>`;
    }).join('')
  }</div>`;
}

function nombresDeMapas() {
  if (!app.mapasComp.length) {
    app.mapasComp = [
      ...COMPETITIVE.arenas.map((a) => a.nombre),
      ...LEVELS.map((n, i) => `nivel ${dosDigitos(i + 1)}`),
    ];
  }
  return app.mapasComp;
}

/* BORRAR-COMPETITIVO · sorteo de mapa y modificador, ya en el tablero */

function sorteoCompetitivo() {
  pararTemporizador();
  audio.unlock();
  app.demo = null;
  app.juego = null;
  app.comp = null;
  app.modo = 'competitive';
  app.mapaComp = mapaDePartida();
  app.modComp = modificadorDePartida();

  el.score.textContent = '—';
  el.meta.textContent = 'competitivo · sorteando';
  el.best.textContent = '';
  el.mult.textContent = '';
  el.chain.style.width = '0%';
  el.pause.disabled = true;
  el.prompt.classList.remove('visible');
  ponerOverlay(null);
  pantalla('sorteo');

  const mapas = nombresDeMapas();
  const mods = COMPETITIVE.modificadores.map((m) => m.nombre);
  const alAzar = (lista) => lista[Math.floor(Math.random() * lista.length)];
  if (el.sorteo) {
    el.sorteo.hidden = false;
    el.sorteo.classList.remove('fijo');
  }
  const pintar = () => {
    if (el.sorteoMapa) el.sorteoMapa.textContent = alAzar(mapas);
    if (el.sorteoMod) el.sorteoMod.textContent = alAzar(mods);
  };
  pintar();
  let paso = 0;
  const total = 16;
  app.intervalo = setInterval(() => {
    paso += 1;
    if (paso < total) {
      pintar();
      audio.play('ui');
      return;
    }
    clearInterval(app.intervalo);
    app.intervalo = 0;
    // se queda con lo sorteado
    if (el.sorteoMapa) el.sorteoMapa.textContent = app.mapaComp.nombre;
    if (el.sorteoMod) el.sorteoMod.textContent = app.modComp.nombre;
    if (el.sorteo) el.sorteo.classList.add('fijo');
    audio.play('bonus');
    app.temporizador = setTimeout(() => {
      if (el.sorteo) {
        el.sorteo.hidden = true;
        el.sorteo.classList.remove('fijo');
      }
      empezarCompetitivo();
    }, 780);
  }, 85);
}

/* BORRAR-COMPETITIVO · partida: cuenta atrás y los cuatro a la vez */

function empezarCompetitivo() {
  if (!app.mapaComp) app.mapaComp = mapaDePartida();
  if (!app.modComp) app.modComp = modificadorDePartida();
  pararTemporizador();
  audio.unlock();
  app.demo = null;

  const cfg = configCompetitivo(app.mapaComp, app.modComp);
  app.comp = {
    activo: true,
    fase: 'cuenta',
    cuenta: 3000,
    restante: COMPETITIVE.tiempo,
    mapa: app.mapaComp,
    mod: app.modComp,
    rivales: [],
    muertes: 0,
    minis: null,
    resultado: null,
  };
  app.comp.rivales = crearRivales(cfg);
  app.modo = 'competitive';
  app.nivel = 0;
  app.record = false;
  app.juego = new Game(cfg, eventosJuego);
  app.marca = mejorActual();

  ponerOverlay(null);
  pantalla('playing');
  if (el.reloj) {
    el.reloj.hidden = false;
    el.reloj.textContent = String(COMPETITIVE.tiempo / 1000);
    el.reloj.classList.remove('apurado');
  }
  if (el.cuenta) {
    el.cuenta.hidden = false;
    el.cuenta.textContent = '3';
  }
  montarMinis();
  ajustarLienzo();
  actualizarMarcador();
}

function crearRivales(cfg) {
  const escala = escalaBots(guardado.comp.rango);
  const ajustes = [0.97, 1, 1.04];
  return COMPETITIVE.bots.slice(0, COMPETITIVE.jugadores - 1).map((nombre, i) => {
    const ajuste = ajustes[i % ajustes.length] * escala;
    const juego = new Game(configCompetitivo(app.mapaComp, app.modComp, {
      startSpeed: Math.round(cfg.startSpeed * ajuste),
      minSpeed: Math.round(cfg.minSpeed * ajuste),
    }), () => {});
    juego.state = 'running';
    return { nombre, juego };
  });
}

/* BORRAR-COMPETITIVO · las cuadrículas rivales, en vivo a la derecha */

function montarMinis() {
  if (!el.minis || !app.comp) return;
  const gente = app.comp.rivales.map((r) => ({ nombre: r.nombre, juego: r.juego }));
  el.minis.innerHTML = gente.map((p, i) => `<figure class="mini" data-i="${i}">
      <figcaption><span>${p.nombre}</span><b>0</b></figcaption>
      <canvas aria-hidden="true"></canvas>
    </figure>`).join('');
  el.minis.hidden = false;
  if (el.pila) {
    el.pila.classList.add('con-minis');
    el.pila.classList.toggle('apilado', esApilado());
  }
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  app.comp.minis = gente.map((p, i) => {
    const figura = el.minis.querySelector(`.mini[data-i="${i}"]`);
    const lienzo = figura.querySelector('canvas');
    const ancho = Math.round(figura.getBoundingClientRect().width) || 72;
    lienzo.style.width = `${ancho}px`;
    lienzo.style.height = `${ancho}px`;
    lienzo.width = Math.round(ancho * dpr);
    lienzo.height = Math.round(ancho * dpr);
    return {
      figura,
      lienzo,
      ctx: lienzo.getContext('2d'),
      juego: p.juego,
      lado: ancho,
      dpr,
      marca: figura.querySelector('b'),
      ultimo: -1,
    };
  });
}

function esApilado() {
  const caja = el.stage.getBoundingClientRect();
  return (caja.width || window.innerWidth || 480) < 560;
}

function dibujarMinis() {
  const c = app.comp;
  if (!c || !c.minis || !el.minis || el.minis.hidden) return;
  for (const m of c.minis) {
    m.juego.draw(m.ctx, {
      cell: m.lado / COLS,
      ox: 0,
      oy: 0,
      width: m.lado,
      height: m.lado,
      dpr: m.dpr,
      mini: true,
    });
    const valor = m.juego.score;
    if (valor !== m.ultimo) {
      m.ultimo = valor;
      if (m.marca) m.marca.textContent = puntos(valor);
    }
  }
}

function quitarMinis() {
  if (!el.minis) return;
  el.minis.hidden = true;
  el.minis.innerHTML = '';
  if (el.pila) {
    el.pila.classList.remove('con-minis', 'apilado');
  }
  if (app.comp) app.comp.minis = null;
}

function avisarCastigo(mensaje) {
  if (!el.aviso) return;
  el.aviso.textContent = mensaje;
  el.aviso.classList.add('ver');
  clearTimeout(avisarCastigo.turno);
  avisarCastigo.turno = setTimeout(() => el.aviso.classList.remove('ver'), 1100);
}

/* BORRAR-COMPETITIVO · clasificación y reloj */

function tablaCompetitivo(c) {
  const filas = [{
    nombre: 'tú',
    puntos: app.juego ? app.juego.score : 0,
    vivo: !!app.juego && app.juego.state === 'running',
    yo: true,
  }];
  for (const rival of c.rivales) {
    filas.push({
      nombre: rival.nombre,
      puntos: rival.juego.score,
      vivo: rival.juego.state === 'running',
    });
  }
  return filas.sort((a, b) => b.puntos - a.puntos);
}

function pintarReloj() {
  const c = app.comp;
  if (!el.reloj || !c || !c.activo) return;
  const segundos = c.fase === 'cuenta'
    ? Math.ceil(COMPETITIVE.tiempo / 1000)
    : Math.max(0, Math.ceil(c.restante / 1000));
  const texto = String(segundos);
  if (el.reloj.textContent !== texto) el.reloj.textContent = texto;
  el.reloj.classList.toggle('apurado', c.fase === 'juego' && c.restante <= 10000);
}

function pintarCuenta() {
  const c = app.comp;
  if (!el.cuenta || !c) return;
  if (c.fase !== 'cuenta') {
    el.cuenta.hidden = true;
    return;
  }
  el.cuenta.hidden = false;
  const texto = c.cuenta > 300 ? String(Math.max(1, Math.ceil(c.cuenta / 1000))) : 'ya';
  if (el.cuenta.textContent !== texto) {
    el.cuenta.textContent = texto;
    el.cuenta.classList.remove('pop');
    // reinicia la animación del número
    void el.cuenta.offsetWidth;
    el.cuenta.classList.add('pop');
  }
}

function pasoCompetitivo(dt) {
  const c = app.comp;
  if (!c || !c.activo) return;

  // cuenta atrás: nadie se mueve hasta el mismo instante
  if (c.fase === 'cuenta') {
    c.cuenta = Math.max(0, c.cuenta - dt);
    pintarCuenta();
    pintarReloj();
    if (c.cuenta <= 0) {
      c.fase = 'juego';
      // al acabar la cuenta, todos arrancan solos: también tú
      if (app.juego.state === 'ready') {
        app.juego.state = 'running';
        app.juego.savedState = 'running';
      }
      el.prompt.classList.remove('visible');
      pintarCuenta();
      audio.play('start');
    }
    return;
  }

  c.restante = Math.max(0, c.restante - dt);
  app.juego.update(dt);
  for (const rival of c.rivales) {
    if (rival.juego.state === 'running') {
      rival.juego.botTurn();
      rival.juego.update(dt);
    }
  }
  pintarReloj();
  if (c.restante <= 0) finCompetitivo();
}

function finCompetitivo() {
  const c = app.comp;
  if (!c || !c.activo) return;
  c.activo = false;
  pararTemporizador();

  const filas = tablaCompetitivo(c).map((f, i) => ({ ...f, puesto: i + 1 }));
  const yo = filas.find((f) => f.yo) || { puesto: filas.length };
  const delta = COMPETITIVE.premios[Math.min(COMPETITIVE.premios.length - 1, yo.puesto - 1)];
  const cambio = ajustarRango(guardado.comp, delta);
  guardado.comp = {
    rango: cambio.rango,
    dentro: cambio.dentro,
    partidas: (guardado.comp.partidas || 0) + 1,
    victorias: (guardado.comp.victorias || 0) + (yo.puesto === 1 ? 1 : 0),
  };
  guardado.best.competitive = Math.max(guardado.best.competitive || 0, app.juego ? app.juego.score : 0);
  guardar();

  const despues = rangoInfo(guardado.comp);
  c.resultado = { filas, puesto: yo.puesto, delta, antes: despues };
  const signo = delta > 0 ? `+${delta}` : String(delta);
  const titulo = yo.puesto === 1 ? 'has ganado' : `${yo.puesto}º de ${filas.length}`;
  const movimiento = cambio.sube
    ? `subes a ${despues.nombre}`
    : cambio.baja
      ? `bajas a ${despues.nombre}`
      : `${despues.dentro}/${COMPETITIVE.porRango} para ${despues.siguiente || 'nada'}`;

  const tabla = filas.map((f) => `<li${f.yo ? ' class="propio"' : ''}>
      <span class="p">${f.puesto}</span>
      <span class="n">${f.nombre}</span>
      <span class="s">${puntos(f.puntos)}</span>
    </li>`).join('');

  ponerOverlay(`<div class="panel versus fin-comp">
    <div class="fin-cabeza">
      <div class="rango-cabeza">
        ${icoRango(despues.rango, ' grande')}
        <div>
          <p class="kicker">competitivo · ${c.mod.nombre} · ${c.mapa.nombre}</p>
          <p class="cifra">${titulo}</p>
        </div>
      </div>
      <p class="nota">${signo} de rango · ${movimiento}${c.muertes ? ` · reviviste ${c.muertes}×` : ''}</p>
    </div>
    ${tiraRangos(despues.rango)}
    <ol class="comp-tabla">${tabla}</ol>
    <div class="acciones">
      <button class="principal" type="button" data-accion="comp-again">revancha <kbd>enter</kbd></button>
      <button type="button" data-accion="home">menú <kbd>esc</kbd></button>
    </div>
  </div>`);
  pantalla('versus-fin');
  quitarMinis();
  enfocarPrimero('button[data-accion="comp-again"]');
  if (el.reloj) el.reloj.hidden = true;
  if (el.cuenta) el.cuenta.hidden = true;
  el.pause.disabled = true;
  el.prompt.classList.remove('visible');
  audio.play(yo.puesto === 1 ? 'level' : 'ui');
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
  app.comp = null; // BORRAR-COMPETITIVO
  if (el.reloj) el.reloj.hidden = true; // BORRAR-COMPETITIVO
  if (el.minis) el.minis.innerHTML = ''; // BORRAR-COMPETITIVO
  if (el.minis) el.minis.hidden = true; // BORRAR-COMPETITIVO
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
    case 'wallSoon':
      audio.play('alerta');
      break;
    case 'pellet':
      audio.play('pellet');
      parpadear(el.mult);
      break;
    case 'bite':
      audio.play('hunterEat');
      parpadear(el.mult);
      break;
    case 'hunterHunt':
      audio.play('alerta');
      parpadear(el.mult);
      break;
    case 'hunterDies':
      audio.play('bonus');
      parpadear(el.score);
      break;
    case 'combo':
      parpadear(el.mult);
      break;
    case 'die':
      audio.play('death');
      // BORRAR-COMPETITIVO · en competitivo te mueres y vuelves, pagando puntos
      if (app.comp && app.comp.activo) {
        const castigo = castigoMuerte(app.juego ? app.juego.score : 0);
        app.temporizador = setTimeout(() => {
          if (!app.comp || !app.comp.activo || !app.juego) return;
          const pagado = app.juego.revivir(castigo);
          app.comp.muertes += 1;
          avisarCastigo(`−${pagado}`);
        }, 620);
      } else {
        guardarMarca();
        app.temporizador = setTimeout(mostrarFin, 900);
      }
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
      <p class="cifra" data-cifra>${puntos(juego.score)}</p>
      <p class="nota">${meta}</p>
    </div>
    <div class="acciones">
      <button class="principal" type="button" data-accion="retry">reintentar <kbd>R</kbd></button>
      <button type="button" data-accion="home">menú <kbd>esc</kbd></button>
    </div>
  </div>`);
  pantalla('dead');
  animarCifra(el.overlay.querySelector('[data-cifra]'), juego.score);
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

  ponerOverlay(`<div class="panel fin">
    <div class="fin-cabeza">
      <p class="kicker">nivel ${dosDigitos(app.nivel + 1)} superado</p>
      <p class="cifra" data-cifra>${puntos(juego.score)}</p>
      <p class="nota">${ultimo ? 'campaña completa · ya no hay margen' : `siguiente · ${siguiente.name.toLowerCase()} · ${siguiente.goal} frutas`}</p>
    </div>
    <div class="acciones">
      ${ultimo ? '' : '<button class="principal" type="button" data-accion="next">siguiente <kbd>↵</kbd></button>'}
      <button${ultimo ? ' class="principal"' : ''} type="button" data-accion="retry">repetir <kbd>R</kbd></button>
      <button type="button" data-accion="home">menú <kbd>esc</kbd></button>
    </div>
  </div>`);
  pantalla('cleared');
  animarCifra(el.overlay.querySelector('[data-cifra]'), juego.score);
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

function pausar() {
  if (!app.juego || app.pantalla !== 'playing') return;
  app.juego.pause();
  if (app.juego.state !== 'paused') return;
  audio.play('ui');

  const juego = app.juego;
  const cifra = puntos(juego.score);
  // BORRAR-COMPETITIVO
  const nota = app.comp
    ? `${juego.fruits} frutas · ${Math.ceil(app.comp.restante / 1000)} s de partida`
    : `${juego.fruits} frutas · récord ${Math.max(app.marca, juego.score)}`;

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
  enfocarPrimero('button[data-accion="resume"]');
  el.pause.textContent = 'seguir';
  el.pause.disabled = false;
  el.prompt.classList.remove('visible');
}

function reanudar() {
  if (!app.juego) return;
  app.juego.resume();
  ponerOverlay(null);
  foco.indice = -1;
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

  // BORRAR-COMPETITIVO
  if (app.pantalla === 'sorteo') {
    // BORRAR-COMPETITIVO · mientras se sortea, sólo se puede salir
    if (nombre === 'back' || nombre === 'pause') {
      pararTemporizador();
      mostrarInicio();
    }
    return;
  }

  if (app.pantalla === 'versus-fin') {
    if (esDireccion) {
      moverFoco(nombre === 'left' ? -1 : nombre === 'right' ? 1 : 0, nombre === 'up' ? -1 : nombre === 'down' ? 1 : 0);
      return;
    }
    if (nombre === 'confirm') {
      activarFoco();
      return;
    }
    if (nombre === 'restart') {
      sorteoCompetitivo();
      return;
    }
    if (nombre === 'back') mostrarInicio();
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
    // BORRAR-COMPETITIVO
    if (app.comp && app.comp.activo) {
      sorteoCompetitivo();
      return;
    }
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
      mostrarModos(0);
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
    // BORRAR-COMPETITIVO
    case 'comp-again':
      sorteoCompetitivo();
      break;
    default:
      break;
  }
}

function borrarRecords() {
  if (!window.confirm('¿borrar récords y progreso?')) return;
  guardado.best = { classic: 0, frenzy: 0, hunter: 0, blind: 0 };
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
    titulo.textContent = `vista previa · nivel ${dosDigitos(indice + 1)} ${nivel.name.toLowerCase()}`;
    nota.textContent = contexto === 'grupo'
      ? `la campaña sigue por aquí · ${guardado.campaign.unlocked - 1} de ${LEVELS.length} superados`
      : 'así es el siguiente nivel de la campaña';
  } else {
    titulo.textContent = `vista previa · ${nombreModo(modo)}`;
    nota.textContent = contexto === 'grupo'
      ? `${MODES[modo].tag} · entra para ver los demás`
      : MODES[modo].tag;
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
    // BORRAR-COMPETITIVO · competitivo va directo, sin subpágina de un solo modo
    if (grupo && grupo.modes.length === 1 && grupo.modes[0] === 'competitive') {
      sorteoCompetitivo();
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

  if (app.pantalla === 'home' || app.pantalla === 'modes') {
    pasoDemo(dt);
  } else if (app.juego) {
    // BORRAR-COMPETITIVO · con partida de competitivo corren también los tres bots
    if (app.comp && app.comp.activo) {
      if (app.pantalla === 'playing') pasoCompetitivo(dt);
    } else {
      app.juego.update(dt);
    }
    app.juego.draw(pincel, vista);
    if (app.comp && app.comp.activo) dibujarMinis(); // BORRAR-COMPETITIVO
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
  // BORRAR-COMPETITIVO
  window.__snake.sorteoCompetitivo = sorteoCompetitivo;
  window.__snake.empezarCompetitivo = empezarCompetitivo;
  window.__snake.finCompetitivo = finCompetitivo;
}
})(modulos['main']);
})();
