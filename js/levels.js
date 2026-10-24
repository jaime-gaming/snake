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

export const MODES = {
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
    tag: 'una serpiente roja te caza',
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

export const LEVELS = [
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
