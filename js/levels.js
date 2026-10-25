// modos y niveles. rejilla de 20x20, muros como pares [x, y]

export const COLS = 20;
export const ROWS = 20;

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
export const GROUPS = [
  { name: 'progreso', tag: 'campaña de 20 niveles', modes: ['campaign'] },
  { name: 'infinitos', tag: 'puntuación sin final', modes: ['classic', 'frenzy', 'hunter'] },
  // BORRAR-COMPETITIVO · el grupo entero se va con el modo
  { name: 'competitivo', tag: '1 vs 1 vs 1 vs 1 contra bots', modes: ['competitive'] },
];

export const MODE_ORDER = GROUPS.flatMap((g) => g.modes);

const base = {
  cols: COLS,
  rows: ROWS,
  walls: [],
  bonusEvery: 5,
  powerEvery: 7,
  chainWindow: 3200,
};

export const MODES = {
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

export const LEVELS = [
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
export const COMPETITIVE = {
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
export function mapaDePartida(azar = Math.random) {
  const lista = [
    ...COMPETITIVE.arenas.map((a) => ({ nombre: a.nombre, walls: a.walls })),
    ...LEVELS.map((n, i) => ({ nombre: `nivel ${String(i + 1).padStart(2, '0')}`, walls: n.walls })),
  ];
  return lista[Math.min(lista.length - 1, Math.floor(azar() * lista.length))];
}

// BORRAR-COMPETITIVO
export function modificadorDePartida(azar = Math.random) {
  const lista = COMPETITIVE.modificadores;
  return lista[Math.min(lista.length - 1, Math.floor(azar() * lista.length))];
}

// BORRAR-COMPETITIVO: la rejilla de cada jugador sale de aquí (mismo mapa y modificador)
export function configCompetitivo(mapa, modificador, extra = {}) {
  const cfg = {
    ...MODES.competitive,
    walls: (mapa && mapa.walls ? mapa.walls : []).map((c) => [c[0], c[1]]),
    tiempoTotal: COMPETITIVE.tiempo,
    fondoBrillo: true,
    ...extra,
  };
  cfg.goal = null;
  if (modificador && modificador.aplicar) modificador.aplicar(cfg);
  return cfg;
}

// BORRAR-COMPETITIVO: ascensos y descensos. delta son los puntos del puesto
export function ajustarRango(estado, delta) {
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
export function rangoInfo(estado) {
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
export function castigoMuerte(puntos) {
  const { fraccion, minimo } = COMPETITIVE.castigo;
  if (!(puntos > 0)) return minimo;
  return Math.max(minimo, Math.round(puntos * fraccion));
}

// BORRAR-COMPETITIVO: cuánto aprietan los bots según tu rango (1,30 lento → 0,93 rápido)
export function escalaBots(rango) {
  const total = COMPETITIVE.rangos.length;
  const r = Math.min(total - 1, Math.max(0, rango || 0));
  return 1.3 - (r / (total - 1)) * 0.37;
}
