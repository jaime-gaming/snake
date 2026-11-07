// comprobaciones del juego, sin navegador.
//   node tools/check.mjs
// valida los niveles, deja a las serpientes jugarlos y prueba las reglas
// básicas del motor. sale con código 1 si algo falla.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Game, POWER_INFO } from '../js/engine.js';
import { MODES, LEVELS, GROUPS, MODE_ORDER, COLS, ROWS, POWER_POOLS } from '../js/levels.js';
import { setLanguage, t, routeSlug, routeWords, levelName, fruitUnit, appleUnit, rankName, rankInfo, rankList } from '../js/i18n.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const K = (x, y) => y * 4096 + x;
let fallos = 0;

function comprobar(condicion, mensaje) {
  if (!condicion) {
    fallos++;
    process.stdout.write(`  falla: ${mensaje}\n`);
  }
}

function lienzoFalso() {
  const llamadas = [];
  const ctx = {
    llamadas,
    fillStyle: '#000',
    strokeStyle: '#000',
    globalAlpha: 1,
    setTransform() {},
    save() {},
    restore() {},
    translate() {},
    setLineDash() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    fillRect(...args) { llamadas.push({ tipo: 'fillRect', color: this.fillStyle, args }); },
    strokeRect(...args) { llamadas.push({ tipo: 'strokeRect', color: this.strokeStyle, args }); },
  };
  return ctx;
}

function configNivel(nivel) {
  return {
    cols: COLS,
    rows: ROWS,
    walls: nivel.walls,
    startSpeed: nivel.speed,
    minSpeed: nivel.minSpeed,
    accelPerFood: nivel.accelPerFood,
    wrap: false,
    goal: nivel.goal,
    scoring: false,
    bonusEvery: nivel.bonusEvery,
    powerEvery: nivel.powerEvery,
    powerPool: nivel.powerPool,
    chainWindow: nivel.chainWindow,
    // modificadores del mapa (muros que salen, reloj, cazador, sin turbo)
    ...(nivel.mods ? { mods: nivel.mods.slice() } : {}),
    ...(nivel.noTurbo ? { noTurbo: true } : {}),
    ...(nivel.timeAttack ? { timeAttack: nivel.timeAttack } : {}),
    ...(nivel.wallFrom ? {
      wallFrom: nivel.wallFrom,
      wallEvery: nivel.wallEvery,
      wallMax: nivel.wallMax,
    } : {}),
    ...(nivel.hunter ? {
      hunter: true,
      hunterPellets: nivel.hunterPellets,
      hunterCap: nivel.hunterCap,
      hunterSight: nivel.hunterSight,
    } : {}),
  };
}

// estructura: grupos del menú, 30 niveles y velocidades coherentes
process.stdout.write('estructura\n');
{
  comprobar(GROUPS.length === 3, 'grupos: v2.0 tiene tres grupos (progreso, infinitos, competitivo)');
  comprobar(GROUPS[0].modes[0] === 'campaign', 'grupos: la campaña va primero');
  comprobar(GROUPS[2].modes.includes('competitive'), 'grupos: el competitivo cuelga del tercer grupo');
  const planos = GROUPS.flatMap((g) => g.modes);
  comprobar(planos.length === MODE_ORDER.length, 'grupos: MODE_ORDER no coincide con los grupos');
  comprobar(new Set(planos).size === planos.length, 'grupos: hay un modo repetido');
  comprobar(Object.keys(MODES).length === 5, 'modos: v2.0 tiene cinco modos (clásico, frenesí, cazador, contrarreloj, competitivo)');
  comprobar(!!MODES.timed && !!MODES.competitive, 'modos: faltan contrarreloj o competitivo');
  comprobar(!!MODES.timed.timeAttack && MODES.timed.timeAttack.start >= 20000
    && MODES.timed.timeAttack.start <= 45000
    && MODES.timed.timeAttack.perFruit >= 1000, 'contrarreloj: deberían ser unos 30 s iniciales');

  const asignados = new Set(Object.values(POWER_POOLS).flat());
  comprobar(Object.keys(POWER_INFO).every((kind) => asignados.has(kind)),
    'potenciadores: hay alguno sin asignar a un modo');
  comprobar(Object.values(POWER_POOLS).some((pool) => pool.length < Object.keys(POWER_INFO).length),
    'potenciadores: todos siguen activos en todos los modos');
  comprobar(!POWER_POOLS.classic.includes('shield') && !POWER_POOLS.frenzy.includes('ghost')
    && !POWER_POOLS.hunter.includes('slow') && !POWER_POOLS.campaign.includes('double'),
  'potenciadores: no se respetan las exclusiones por modo');
  comprobar(POWER_POOLS.timed.length > 0 && POWER_POOLS.competitive.length > 0,
    'potenciadores: contrarreloj y competitivo necesitan su propio pool');
  comprobar(
    Object.keys(MODES).every((id) => planos.includes(id)),
    'grupos: algún modo se queda fuera de los grupos',
  );
  process.stdout.write(`  ${GROUPS.length} grupos · ${planos.length} modos · ${LEVELS.length} niveles\n`);
}
{
  comprobar(LEVELS.length === 30, `campaña: tiene ${LEVELS.length} niveles y deberían ser 30`);
  const CON_MODS = [7, 11, 15, 20, 25, 29]; // niveles 8, 12, 16, 21, 26 y 30 (0-based)
  CON_MODS.forEach((i) => comprobar(Array.isArray(LEVELS[i].mods) && LEVELS[i].mods.length > 0,
    `nivel ${i + 1}: le falta el modificador asignado al mapa`));
  comprobar(LEVELS.every((n, i) => !n.mods || CON_MODS.includes(i)),
    'campaña: hay modificadores en niveles que no les tocan');
  comprobar(LEVELS.every((n) => {
    const muros = new Set(n.walls.map(([x, y]) => `${x},${y}`));
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (muros.has(`${x},${y}`)) continue;
        let ciegos = 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS || muros.has(`${nx},${ny}`)) ciegos++;
        }
        if (ciegos >= 3) return false;
      }
    }
    return true;
  }), 'campaña: hay celdas de una sola salida (callejones que atrapan al entrar)');

  comprobar(LEVELS.every((n) => n.minSpeed >= 118)
    && LEVELS.every((n) => n.speed >= n.minSpeed)
    && LEVELS[LEVELS.length - 1].speed >= 132
    && LEVELS[LEVELS.length - 1].speed <= 140
    && LEVELS.every((n) => n.goal <= 15),
  'campaña: el ritmo final sigue siendo demasiado rápido, lento o largo de completar');
  const MODS_VALIDOS = ['muros', 'reloj', 'cazador', 'turbo'];
  comprobar(LEVELS.every((n) => !n.mods || n.mods.every((m) => MODS_VALIDOS.includes(m))),
    'campaña: algún modificador no está en la lista permitida');
  let ultimo = Infinity;
  LEVELS.forEach((nivel, i) => {
    const etiqueta = `nivel ${String(i + 1).padStart(2)}`;
    comprobar(nivel.speed >= nivel.minSpeed, `${etiqueta}: arranca más lento que su mínimo`);
    comprobar(nivel.minSpeed >= 42, `${etiqueta}: baja del suelo de velocidad`);
    comprobar(nivel.speed <= ultimo, `${etiqueta}: rompe el orden de velocidad`);
    ultimo = nivel.speed;
    comprobar(nivel.goal >= 4 && nivel.goal <= 18, `${etiqueta}: meta fuera de rango`);
    comprobar(configNivel(nivel).scoring === false, `${etiqueta}: la campaña activa la puntuación`);
  });
  for (const [id, modo] of Object.entries(MODES)) {
    comprobar(modo.startSpeed >= modo.minSpeed, `${id}: arranca más lento que su mínimo`);
    comprobar(modo.minSpeed >= 42, `${id}: baja del suelo de velocidad`);
  }
  comprobar(MODES.frenzy.wrap && MODES.frenzy.rampPerSec <= 0.4 && MODES.frenzy.minSpeed >= 60,
    'frenesí: la aceleración o el ritmo mínimo no están equilibrados');
  comprobar(MODES.hunter.hunterPellets >= 2 && MODES.hunter.hunterCap <= 18 && MODES.hunter.hunterSight <= 4,
    'cazador: la presión supera los límites de equilibrio');
  process.stdout.write('  velocidades dentro de rango y en orden\n');
}
{
  // ningún rincón cerrado: la comida siempre se puede alcanzar
  let rincones = 0;
  LEVELS.forEach((nivel) => {
    const muro = new Set(nivel.walls.map(([x, y]) => K(x, y)));
    const libres = [];
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) if (!muro.has(K(x, y))) libres.push({ x, y });
    }
    const visto = new Set([K(libres[0].x, libres[0].y)]);
    const cola = [libres[0]];
    for (let c = 0; c < cola.length; c++) {
      const p = cola[c];
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        const nx = p.x + dx;
        const ny = p.y + dy;
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
        if (muro.has(K(nx, ny)) || visto.has(K(nx, ny))) continue;
        visto.add(K(nx, ny));
        cola.push({ x: nx, y: ny });
      }
    }
    rincones += libres.length - visto.size;
  });
  comprobar(rincones === 0, `niveles: ${rincones} casillas encerradas sin salida`);
  process.stdout.write('  todos los niveles conectados\n');
}

// niveles: muros dentro, sin duplicados, arranque limpio y comida alcanzable
process.stdout.write('niveles\n');
LEVELS.forEach((nivel, i) => {
  const cfg = configNivel(nivel);
  const juego = new Game(cfg, () => {});
  const etiqueta = `${String(i + 1).padStart(2)} ${nivel.name}`;

  const duplicados = nivel.walls.length - new Set(nivel.walls.map(([x, y]) => K(x, y))).size;
  comprobar(duplicados === 0, `${etiqueta}: ${duplicados} muros duplicados`);
  comprobar(
    nivel.walls.every(([x, y]) => x >= 0 && y >= 0 && x < COLS && y < ROWS),
    `${etiqueta}: muro fuera de la rejilla`,
  );
  comprobar(
    juego.body.every((s) => !juego.wallSet.has(K(s.x, s.y))),
    `${etiqueta}: la serpiente arranca dentro de un muro`,
  );
  comprobar(!!juego.food, `${etiqueta}: sin comida`);
  comprobar(!juego.food || !juego.wallSet.has(K(juego.food.x, juego.food.y)), `${etiqueta}: comida dentro de un muro`);

  // la serpiente debe poder terminarlo. la fruta sale al azar, así que
  // se juega con una semilla fija por nivel: la batería no depende de la suerte
  let semilla = 7000 + i * 37;
  const azarOriginal = Math.random;
  Math.random = () => {
    semilla = (semilla * 1664525 + 1013904223) >>> 0;
    return semilla / 4294967296;
  };
  try {
    let intento = 0;
    let ms = 0;
    let frutas = 0;
    while (intento < 4) {
      intento++;
      const partida = new Game(cfg, () => {});
      ms = 0;
      while (partida.state !== 'cleared' && partida.state !== 'dead' && ms < 120000) {
        partida.decidir();
        partida.update(30);
        ms += 30;
      }
      frutas = partida.fruits;
      if (partida.state === 'cleared') {
        process.stdout.write(
          `  ${etiqueta}: cleared en ${Math.round(ms / 1000)} s, ${frutas}/${nivel.goal} frutas`
          + `${intento > 1 ? ` (intento ${intento})` : ''}\n`,
        );
        break;
      }
      if (intento === 4) {
        comprobar(false, `${etiqueta}: la serpiente no lo termina (${partida.state})`);
        process.stdout.write(`  ${etiqueta}: ${partida.state} en ${Math.round(ms / 1000)} s, ${frutas}/${nivel.goal} frutas\n`);
      }
    }
  } finally {
    Math.random = azarOriginal;
  }
});

// campaña: progreso por manzanas, nunca por puntos
process.stdout.write('campaña sin puntuación\n');
{
  const juego = new Game({ ...configNivel(LEVELS[0]), goal: null }, () => {});
  juego.state = 'running';
  juego.body = [{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 3, y: 5 }, { x: 2, y: 5 }];
  juego.prevBody = juego.body.map((p) => ({ ...p }));
  juego.dir = { x: 1, y: 0 };
  juego.queue = [];
  juego.food = { x: 6, y: 5 };
  juego.step();
  comprobar(juego.fruits === 1 && juego.score === 0, 'campaña: sumar una manzana concede puntos');
  comprobar(juego.multiplier === 1 && juego.scoreFactor === 0, 'campaña: hay multiplicador de puntuación');
  juego.bonus = { x: 3, y: 3, ttl: 9000 };
  juego.eatBonus();
  comprobar(juego.score === 0, 'campaña: un bonus concede puntos');
  juego.power = { x: 3, y: 3, kind: 'shrink', ttl: 9000 };
  juego.takePower();
  comprobar(juego.score === 0, 'campaña: un potenciador concede puntos');
}

// modos infinitos: varias partidas reproducibles para medir estabilidad y ritmo
process.stdout.write('modos\n');
const SEMILLAS = { classic: 101, frenzy: 201, hunter: 301, timed: 401, competitive: 501 };
for (const id of ['classic', 'frenzy', 'hunter', 'timed', 'competitive']) {
  let supervivientes = 0;
  let frutasTotales = 0;
  let puntosTotales = 0;
  const randomOriginal = Math.random;
  try {
    for (let intento = 1; intento <= 8; intento++) {
      let semilla = SEMILLAS[id] + intento;
      Math.random = () => {
        semilla = (semilla * 1664525 + 1013904223) >>> 0;
        return semilla / 4294967296;
      };
      const juego = new Game({ ...MODES[id] }, () => {});
      let ms = 0;
      let poderes = 0;
      juego.onEvent = (tipo) => {
        if (tipo === 'power') poderes++;
      };
      while (juego.state !== 'dead' && ms < 30000) {
        juego.decidir();
        juego.update(30);
        ms += 30;
      }
      if (ms >= 30000) supervivientes++;
      comprobar(juego.score >= 0 && juego.body.length >= 1, `${id}: estado incoherente`);
      comprobar(juego.speed >= juego.cfg.minSpeed - 0.01, `${id}: la velocidad se sale por debajo del mínimo`);
      comprobar(juego.chainTimer >= 0, `${id}: temporizador de cadena negativo`);
      if (id === 'hunter') comprobar(!!juego.hunter, 'hunter: no hay cazador');
      frutasTotales += juego.fruits;
      puntosTotales += juego.score;
    }
  } finally {
    Math.random = randomOriginal;
  }
  // el competitivo es una arena de cuatro: morir antes de 30 s entra en el juego
  const MINIMO = { competitive: 3 };
  comprobar(supervivientes >= (MINIMO[id] || 6), `${id}: sólo ${supervivientes}/8 simulaciones pasan de 30 s`);
  process.stdout.write(
    `  ${id}: ${supervivientes}/8 a 30 s · ${Math.round(frutasTotales / 8)} frutas · ${Math.round(puntosTotales / 8)} puntos de media\n`,
  );
}

// reglas sueltas
process.stdout.write('reglas\n');
{
  const juego = new Game({ ...MODES.hunter }, () => {});
  juego.state = 'running';
  juego.fx.ghost = 1e9;
  let vivo = true;
  for (let i = 0; i < 200; i++) {
    juego.fx.ghost = 1e9;
    juego.decidir();
    juego.update(40);
    if (juego.state !== 'running') {
      vivo = false;
      break;
    }
  }
  comprobar(vivo, 'fantasma: muere mientras debería atravesarlo todo');
}
{
  const juego = new Game({ ...MODES.classic }, () => {});
  juego.body = [{ x: 5, y: 5 }];
  juego.power = { x: 5, y: 5, kind: 'shrink', ttl: 1000 };
  juego.takePower();
  comprobar(juego.body.length === 1, 'recorte: deja el cuerpo vacío');
}
{
  const juego = new Game({ ...MODES.classic }, () => {});
  juego.setDirection(1, 0);
  juego.update(400);
  const antes = juego.body[0].x;
  juego.pause();
  juego.update(3000);
  comprobar(juego.body[0].x === antes, 'pausa: el juego sigue avanzando');
  juego.resume();
  juego.update(400);
  comprobar(juego.body[0].x !== antes, 'pausa: no reanuda');
}
{
  const juego = new Game({ ...MODES.classic }, () => {});
  juego.chain = 1;
  comprobar(juego.multiplier === 1, 'cadena: ×1 al empezar');
  juego.chain = 9;
  comprobar(juego.multiplier === 5, 'cadena: el multiplicador no tope a ×5');
}

// potenciadores: catálogo, selección por modo, efectos, puntuación y protección
process.stdout.write('potenciadores\n');
{
  for (const [id, modo] of Object.entries(MODES)) {
    const juego = new Game({ ...modo }, () => {});
    for (let i = 0; i < 16; i++) {
      juego.power = null;
      juego.spawnPower();
      comprobar(!juego.power || modo.powerPool.includes(juego.power.kind),
        `${id}: salió un potenciador excluido`);
    }
  }
  const campaña = new Game(configNivel(LEVELS[0]), () => {});
  campaña.spawnPower();
  comprobar(!campaña.power || POWER_POOLS.campaign.includes(campaña.power.kind),
    'campaña: salió un potenciador excluido');

  const poderes = ['ghost', 'slow', 'shrink', 'shield', 'double'];
  comprobar(poderes.every((kind) => POWER_INFO[kind]), 'potenciadores: falta información de un poder');
  for (const kind of poderes) {
    const juego = new Game({ ...MODES.classic }, () => {});
    juego.body = Array.from({ length: 8 }, (_, i) => ({ x: 10 - i, y: 10 }));
    juego.prevBody = juego.body.map((p) => ({ ...p }));
    juego.power = { x: 3, y: 3, kind, ttl: 9000 };
    juego.draw(lienzoFalso(), { cell: 10, ox: 0, oy: 0, width: 200, height: 200, dpr: 1 });
    juego.takePower();
    if (kind === 'ghost') comprobar(juego.fx.ghost === POWER_INFO.ghost.ms, 'fantasma: no activa su temporizador');
    if (kind === 'slow') comprobar(juego.fx.slow === POWER_INFO.slow.ms, 'lento: no activa su temporizador');
    if (kind === 'shield') comprobar(juego.fx.shield === POWER_INFO.shield.ms, 'escudo: no activa su temporizador');
    if (kind === 'double') comprobar(juego.fx.double === POWER_INFO.double.ms, 'doble: no activa su temporizador');
    if (kind === 'shrink') {
      comprobar(juego.body.length === 3, 'recorte: no conserva el mínimo seguro de anillos');
      comprobar(juego.score === 30, 'recorte: no concede los puntos esperados');
    }
  }

  const doble = new Game({ ...MODES.classic }, () => {});
  doble.state = 'running';
  doble.body = [{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 3, y: 5 }];
  doble.prevBody = doble.body.map((p) => ({ ...p }));
  doble.dir = { x: 1, y: 0 };
  doble.queue = [];
  doble.food = { x: 6, y: 5 };
  doble.fx.double = POWER_INFO.double.ms;
  doble.step();
  comprobar(doble.score === 20, 'doble: no duplica los puntos de fruta');

  let salvaciones = 0;
  const escudo = new Game({ ...MODES.classic }, (tipo) => { if (tipo === 'shield') salvaciones++; });
  escudo.state = 'running';
  escudo.body = [{ x: 0, y: 5 }, { x: 1, y: 5 }, { x: 2, y: 5 }, { x: 3, y: 5 }];
  escudo.prevBody = escudo.body.map((p) => ({ ...p }));
  escudo.dir = { x: -1, y: 0 };
  escudo.queue = [];
  escudo.fx.shield = POWER_INFO.shield.ms;
  escudo.step();
  comprobar(escudo.state === 'running' && escudo.fx.shield === 0 && escudo.fx.ghost > 0,
    'escudo: el primer choque no activa la salida de emergencia');
  comprobar(salvaciones === 1, 'escudo: no informa del choque salvado');
  escudo.step();
  comprobar(escudo.state === 'running' && escudo.body[0].x === escudo.cols - 1,
    'escudo: no deja atravesar el peligro tras salvarte');
  escudo.fx.ghost = 0;
  escudo.die('wall');
  comprobar(escudo.state === 'dead', 'escudo: salva más de un choque');

  const protegido = new Game({ ...MODES.hunter }, () => {});
  protegido.fx.shield = POWER_INFO.shield.ms;
  const lienzo = lienzoFalso();
  protegido.draw(lienzo, { cell: 10, ox: 0, oy: 0, width: 200, height: 200, dpr: 1 });
  comprobar(lienzo.llamadas.some((llamada) => llamada.color.startsWith('rgba(185,244,255')),
    'escudo: falta el contorno visible de protección');
  process.stdout.write('  5 poderes · selección por modo, doble puntuación y escudo de un uso verificados\n');
}

// cazador: serpiente roja que come puntos azules y crece
process.stdout.write('cazador\n');
{
  const juego = new Game({ ...MODES.hunter }, () => {});
  comprobar(!!juego.hunter && juego.hunter.body.length === 3, 'cazador: no nace como serpiente visible de tres anillos');
  comprobar(
    juego.pellets.length === (MODES.hunter.hunterPellets || 2),
    'cazador: no salen todos los puntos azules al empezar',
  );
  comprobar(
    juego.pellets.every((p) => !juego.wallSet.has(K(p.x, p.y))),
    'cazador: un punto cae dentro de un muro',
  );

  for (let intento = 0; intento < 40; intento++) {
    const partida = new Game({ ...MODES.hunter }, () => {});
    const celdas = partida.hunter.body;
    const ocupadas = new Set(celdas.map((c) => K(c.x, c.y)));
    comprobar(celdas.length === 3, `cazador: inicio ${intento + 1} invisible/incompleto`);
    comprobar(celdas.every((c) => c.x > 0 && c.y > 0 && c.x < COLS - 1 && c.y < ROWS - 1),
      `cazador: inicio ${intento + 1} fuera del tablero`);
    comprobar(celdas.every((c) => !partida.wallSet.has(K(c.x, c.y))
      && !partida.body.some((s) => s.x === c.x && s.y === c.y)
      && !partida.pellets.some((p) => p.x === c.x && p.y === c.y)
      && (!partida.food || partida.food.x !== c.x || partida.food.y !== c.y)),
    `cazador: inicio ${intento + 1} se solapa con el tablero`);
    comprobar(celdas.slice(1).every((c, i) =>
      Math.abs(c.x - celdas[i].x) + Math.abs(c.y - celdas[i].y) === 1)
      && ocupadas.size === celdas.length, `cazador: inicio ${intento + 1} no forma un cuerpo continuo`);
  }

  // el jugador se queda quieto y el cazador va a por los puntos azules
  const nacimiento = juego.hunter.body.length;
  let comidos = 0;
  juego.onEvent = (tipo) => {
    if (tipo === 'hunterEat') comidos++;
  };
  juego.state = 'running';
  juego.hunterCadence = () => 1;
  // un punto azul pegado a su cabeza: tiene que comérselo
  const jefe = juego.hunter.body[0];
  const vecino = [[1, 0], [-1, 0], [0, 1], [0, -1]]
    .map(([dx, dy]) => ({ x: jefe.x + dx, y: jefe.y + dy }))
    .find((p) => p.x >= 0 && p.y >= 0 && p.x < COLS && p.y < ROWS
      && !juego.wallSet.has(K(p.x, p.y))
      && !juego.body.some((c) => c.x === p.x && c.y === p.y)
      && !juego.hunter.body.some((c) => c.x === p.x && c.y === p.y)
      && (!juego.food || juego.food.x !== p.x || juego.food.y !== p.y));
  if (vecino) juego.pellets = [vecino, ...juego.pellets.slice(1)];
  for (let i = 0; i < 400; i++) juego.moveHunter();
  comprobar(comidos > 0, 'cazador: no llega a comerse ningún punto azul');
  comprobar(
    juego.hunter.body.length > nacimiento,
    'cazador: come pero no crece',
  );
  comprobar(
    juego.pellets.length === (MODES.hunter.hunterPellets || 2),
    'cazador: se queda sin puntos azules',
  );
  process.stdout.write(`  cazador: ${comidos} puntos comidos, ${juego.hunter.body.length} anillos\n`);
}
{
  // el cuerpo del cazador no te mata: le muerdes un anillo y sigues
  const juego = new Game({ ...MODES.hunter }, () => {});
  juego.state = 'running';
  const anillo = juego.hunter.body[juego.hunter.body.length - 1];
  const anillos = juego.hunter.body.length;
  juego.body = [{ x: anillo.x, y: anillo.y - 1 }];
  juego.dir = { x: 0, y: 1 };
  juego.queue = [];
  juego.step();
  comprobar(juego.state === 'running', 'cazador: rozar su cuerpo te mata');
  comprobar(juego.hunter.body.length === anillos - 1, 'cazador: morderle no le quita un anillo');
}
{
  // pero su cabeza sí
  const juego = new Game({ ...MODES.hunter }, () => {});
  juego.state = 'running';
  const testa = juego.hunter.body[0];
  juego.body = [{ x: testa.x, y: testa.y - 1 }];
  juego.dir = { x: 0, y: 1 };
  juego.queue = [];
  juego.step();
  comprobar(juego.state === 'dead', 'cazador: su cabeza no te mata');
}
{
  // con fantasma se le puede atravesar
  const juego = new Game({ ...MODES.hunter }, () => {});
  juego.state = 'running';
  juego.fx.ghost = 5000;
  const anillo = juego.hunter.body[juego.hunter.body.length - 1];
  juego.body = [{ x: anillo.x, y: anillo.y - 1 }];
  juego.dir = { x: 0, y: 1 };
  juego.queue = [];
  juego.step();
  comprobar(juego.state === 'running', 'cazador: el fantasma no le atraviesa');
}

// onda de luz al cargar el mapa
process.stdout.write('revelado\n');
{
  const juego = new Game({ ...MODES.classic }, () => {});
  comprobar(juego.reveal === 0, 'revelado: no empieza a cero');
  const avanzar = (ms) => {
    for (let t = 0; t < ms; t += 50) juego.update(50);
  };
  avanzar(300);
  const medio = juego.reveal;
  comprobar(medio > 0 && medio < 1, 'revelado: no avanza con el tiempo');
  avanzar(700);
  comprobar(juego.reveal === 1, 'revelado: no termina');
  process.stdout.write(`  revelado: ${medio.toFixed(2)} a los 300 ms, ${juego.reveal.toFixed(2)} a los 900 ms\n`);
}


// renderizado del cazador: siempre queda por encima de la capa de oscuridad
process.stdout.write('visibilidad del cazador\n');
{
  const juego = new Game({ ...MODES.hunter }, () => {});
  juego.reveal = 0.08;
  const ctx = lienzoFalso();
  juego.draw(ctx, { cell: 10, ox: 0, oy: 0, width: 200, height: 200, dpr: 1 });
  const ultimaSombra = ctx.llamadas.reduce((ultimo, llamada, i) =>
    llamada.tipo === 'fillRect' && llamada.color.startsWith('rgba(0,0,0,') ? i : ultimo, -1);
  const cabezaVisible = ctx.llamadas.findIndex((llamada, i) =>
    i > ultimaSombra && llamada.tipo === 'fillRect' && llamada.color === '#ff2b2b');
  comprobar(ultimaSombra >= 0 && cabezaVisible > ultimaSombra,
    'cazador: la sombra tapa su cabeza y lo hace invisible');

  juego.hunter.recarga = 400;
  const respawn = lienzoFalso();
  juego.draw(respawn, { cell: 10, ox: 0, oy: 0, width: 200, height: 200, dpr: 1 });
  const ultimaSombraRespawn = respawn.llamadas.reduce((ultimo, llamada, i) =>
    llamada.tipo === 'fillRect' && llamada.color.startsWith('rgba(0,0,0,') ? i : ultimo, -1);
  comprobar(respawn.llamadas.some((llamada, i) => i > ultimaSombraRespawn
    && llamada.tipo === 'strokeRect' && llamada.color.startsWith('rgba(255,43,43,')),
  'cazador: su recarga no deja una señal visible');
  process.stdout.write('  el cazador activo y su reaparición se dibujan sobre la niebla\n');
}

// choque: deja marca y congela un instante
process.stdout.write('choque\n');
{
  const juego = new Game({ ...MODES.classic }, () => {});
  juego.state = 'running';
  juego.body = [{ x: 0, y: 5 }, { x: 1, y: 5 }];
  juego.dir = { x: -1, y: 0 };
  juego.queue = [];
  juego.step();
  comprobar(juego.state === 'dead', 'choque: no muere contra el borde');
  comprobar(!!juego.crash && juego.crash.t === 0, 'choque: no hay marca de impacto');
  comprobar(juego.hitStop > 0, 'choque: no hay congelación');
  const congelado = juego.crash.t;
  juego.update(1000);
  comprobar(juego.crash.t > congelado, 'choque: la marca no avanza');
}

// el cazador va a por los puntos que tiene cerca
process.stdout.write('hunter behavior\n');
{
  const impulso = new Game({ ...MODES.hunter }, () => {});
  impulso.state = 'running';
  impulso.hunter.body = [{ x: 3, y: 3 }, { x: 2, y: 3 }, { x: 1, y: 3 }];
  impulso.pellets = [{ x: 4, y: 3 }];
  const lejos = impulso.hunterCadence();
  impulso.pellets = [{ x: 16, y: 16 }];
  const normal = impulso.hunterCadence();
  comprobar(lejos < normal, 'hunter behavior: no acelera al ir por un punto cercano');

  // una duda dura exactamente una oportunidad de movimiento
  impulso.hunterTick = 3;
  impulso.hunter.botSiguienteFallo = 0;
  impulso.hunter.body = [{ x: 3, y: 3 }, { x: 2, y: 3 }, { x: 1, y: 3 }];
  impulso.pellets = [{ x: 16, y: 16 }];
  const antes = impulso.hunter.body.map((c) => ({ ...c }));
  const randomOriginal = Math.random;
  Math.random = () => 0.01;
  try {
    impulso.moveHunter();
  } finally {
    Math.random = randomOriginal;
  }
  comprobar(impulso.hunter.body.every((c, i) => c.x === antes[i].x && c.y === antes[i].y),
    'hunter behavior: no titubea de vez en cuando');

  // un mal giro le aparta del camino más corto al punto
  const malGirado = new Game({ ...MODES.hunter }, () => {});
  malGirado.state = 'running';
  malGirado.hunter.body = [{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 3, y: 5 }];
  malGirado.hunter.dir = { x: 1, y: 0 };
  malGirado.hunterTick = 3;
  malGirado.hunter.botSiguienteFallo = 0;
  malGirado.pellets = [{ x: 10, y: 5 }];
  const randomAntesGiro = Math.random;
  const secuenciaGiro = [0.5, 0.2];
  Math.random = () => secuenciaGiro.shift() ?? 0.5;
  try {
    malGirado.moveHunter();
  } finally {
    Math.random = randomAntesGiro;
  }
  comprobar(malGirado.hunter.body[0].x !== 6 || malGirado.hunter.body[0].y !== 5,
    'hunter behavior: nunca se equivoca de giro');

  // si elige un hueco bloqueado puede chocarse y volver más corto
  const choque = new Game({ ...MODES.hunter }, () => {});
  choque.state = 'running';
  choque.hunter.body = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }];
  choque.hunter.dir = { x: 0, y: -1 };
  choque.hunterTick = 3;
  choque.hunter.botSiguienteFallo = 0;
  choque.pellets = [{ x: 16, y: 16 }];
  const randomAntesChoque = Math.random;
  const secuenciaChoque = [0, 0.08];
  Math.random = () => secuenciaChoque.shift() ?? 0;
  try {
    choque.moveHunter();
  } finally {
    Math.random = randomAntesChoque;
  }
  comprobar(choque.hunter.recarga > 0, 'hunter behavior: nunca choca por error');
}
{
  const distanciaAPunto = (juego) => {
    const jefe = juego.hunter.body[0];
    let mejor = Infinity;
    for (const p of juego.pellets) {
      mejor = Math.min(mejor, Math.abs(jefe.x - p.x) + Math.abs(jefe.y - p.y));
    }
    return mejor;
  };
  let acercamientos = 0;
  let pruebas = 0;
  for (let n = 0; n < 12; n++) {
    let comidos = 0;
    const juego = new Game({ ...MODES.hunter }, (tipo) => {
      if (tipo === 'hunterEat') comidos++;
    });
    juego.state = 'running';
    const antes = distanciaAPunto(juego);
    for (let i = 0; i < 12; i++) juego.moveHunter();
    const despues = distanciaAPunto(juego);
    pruebas++;
    if (despues < antes || comidos > 0) acercamientos++;
    comprobar(juego.hunter.body.length >= 3, 'hunter behavior: se ha quedado sin cuerpo');
  }
  comprobar(acercamientos >= pruebas - 2, `hunter behavior: sólo acierta ${acercamientos}/${pruebas} veces`);
  process.stdout.write(`  cazador: va a por su punto (o se lo come) en ${acercamientos}/${pruebas} arranques\n`);
}
{
  // corto: come puntos; al pasar el umbral: te caza
  const juego = new Game({ ...MODES.hunter }, () => {});
  juego.state = 'running';
  const crecer = (n) => {
    while (juego.hunter.body.length < n) {
      juego.hunter.body.push({ ...juego.hunter.body[juego.hunter.body.length - 1] });
    }
  };
  const umbral = juego.hunterUmbral();
  crecer(umbral - 1);
  const comida = juego.hunterTarget();
  comprobar(
    juego.pellets.some((p) => p.x === comida.x && p.y === comida.y),
    'hunter behavior: con el cuerpo corto no va a comer',
  );
  crecer(umbral);
  const objetivo = juego.hunterTarget();
  const cabeza = juego.body[0];
  // apunta a unas casillas por delante del jugador, o a su cabeza si no cabe
  const delante = objetivo.x !== cabeza.x || objetivo.y !== cabeza.y;
  comprobar(delante, 'hunter behavior: con cuerpo largo no corta el paso al jugador');
  const camino = Math.abs(objetivo.x - cabeza.x) + Math.abs(objetivo.y - cabeza.y);
  comprobar(
    camino <= (MODES.hunter.hunterSight || 4),
    'hunter behavior: el corte queda demasiado lejos',
  );
}

// premios, tope de muros, cazador lleno y deshacer del choque
process.stdout.write('extras\n');
{
  const juego = new Game({ ...MODES.classic }, () => {});
  juego.state = 'running';
  const tope = MODES.classic.wallFrom + MODES.classic.wallEvery * 2;
  for (let i = 0; i < tope; i++) {
    juego.fruits++;
    juego.food = { ...juego.body[0] };
    juego.eatFood();
  }
  comprobar(juego.pendingWalls.length > 0, 'clásico: no avisa de ningún muro');
  juego.updateFx(900);
  comprobar(juego.walls.length > 0, 'clásico: no salen muros con el tiempo');
  comprobar(juego.walls.length <= MODES.classic.wallMax, 'clásico: se pasa del tope de muros');
  comprobar(
    juego.walls.every(([x, y]) => !juego.body.some((c) => c.x === x && c.y === y)),
    'clásico: un muro sale encima de la serpiente',
  );
}
{
  const juego = new Game({ ...MODES.classic }, () => {});
  juego.state = 'running';
  const tope = 26;
  juego.cfg = { ...MODES.classic, wallMax: tope };
  juego.walls.length = 0;
  juego.wallSet.clear();
  for (let r = 0; r < 60; r++) {
    for (let i = 0; i < 40; i++) juego.raiseWall();
    juego.updateFx(900);
  }
  comprobar(juego.walls.length <= tope, 'muro: ignora el tope de muros');
  comprobar(juego.walls.length > 0, 'muro: no levanta nada');
  comprobar(juego.pendingWalls.length === 0, 'muro: se quedan avisos colgados');
  comprobar(
    juego.walls.every(([x, y]) => !juego.body.some((c) => c.x === x && c.y === y)),
    'muro: un muro cae encima de la serpiente',
  );
}
{
  const juego = new Game({ ...MODES.hunter }, () => {});
  juego.state = 'running';
  const tope = MODES.hunter.hunterCap;
  while (juego.hunter.body.length < tope) {
    juego.hunter.body.push({ ...juego.hunter.body[juego.hunter.body.length - 1] });
  }
  comprobar(juego.hunterCadence() === 1, 'cazador: lleno no acelera');
  const objetivo = juego.hunterTarget();
  comprobar(
    objetivo.x === juego.body[0].x && objetivo.y === juego.body[0].y,
    'cazador: lleno no va directo a por ti',
  );
  for (let i = 0; i < 120; i++) juego.moveHunter();
  comprobar(
    juego.hunter.body.length <= tope,
    'cazador: se salta el tope de largo',
  );
  // puede haber uno menos si no queda hueco libre lejos del jugador, pero nunca se vacía
  comprobar(
    juego.pellets.length >= (MODES.hunter.hunterPellets || 2) - 1,
    'cazador: deja de reponer los puntos azules',
  );
  const libres = juego.reachableFree().filter((c) => !juego.ocupada(c.x, c.y));
  comprobar(
    juego.pellets.length === (MODES.hunter.hunterPellets || 2) || libres.length < 6,
    'cazador: había hueco y no repuso los puntos azules',
  );
}
{
  // acorralado: se muda en vez de quedarse clavado
  const juego = new Game({ ...MODES.hunter }, () => {});
  juego.state = 'running';
  const cuerpo = [{ x: 0, y: 0 }, { x: 1, y: 0 }];
  juego.walls = [];
  juego.wallSet = new Set();
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) juego.wallSet.add(K(x, y));
  }
  for (const c of [...cuerpo, { x: 0, y: 1 }, { x: 1, y: 1 }]) juego.wallSet.delete(K(c.x, c.y));
  juego.hunter = {
    body: cuerpo.map((p) => ({ ...p })),
    prev: cuerpo.map((p) => ({ ...p })),
    dir: { x: 1, y: 0 },
    grow: 0,
  };
  juego.hunterTick = 1;
  juego.moveHunter();
  comprobar(
    juego.hunter.body.length >= 2 && !juego.hunter.body.every((p) => juego.wallSet.has(K(p.x, p.y))),
    'cazador: acorralado se queda metido en un muro',
  );
}
{
  // choque: la serpiente se deshace de la cabeza a la cola
  const juego = new Game({ ...MODES.classic }, () => {});
  juego.state = 'running';
  juego.body = [{ x: 0, y: 5 }, { x: 1, y: 5 }, { x: 2, y: 5 }, { x: 3, y: 5 }, { x: 4, y: 5 }];
  juego.prevBody = juego.body.map((p) => ({ ...p }));
  juego.dir = { x: -1, y: 0 };
  juego.step();
  comprobar(juego.state === 'dead' && !!juego.crash, 'choque: no hay impacto');
  comprobar(juego.crash.popped === 0, 'choque: empieza a deshacerse antes de tiempo');
  juego.hitStop = 0;
  juego.update(120);
  comprobar(juego.crash.popped >= 3, 'choque: la serpiente no se deshace');
  comprobar(
    juego.particles.length > 0,
    'choque: no suelta chispas al deshacerse',
  );
  process.stdout.write(
    `  extras: muros con tope, cazador al tope y choque que se deshace (${juego.crash.popped} anillos)\n`,
  );
}

// juego justo: avisos, puntos robados, cazador que come y borde que no engaña
process.stdout.write('juego justo\n');
{
  const juego = new Game({ ...MODES.classic }, () => {});
  juego.state = 'running';
  let pideAviso = 0;
  juego.onEvent = (tipo) => { if (tipo === 'wallSoon') pideAviso++; };
  juego.raiseWall();
  comprobar(pideAviso === 1, 'muro: no avisa antes de salir');
  comprobar(juego.walls.length === 0, 'muro: aparece de golpe sin avisar');
  const aviso = juego.pendingWalls[0];
  comprobar(
    Math.abs(aviso.x - juego.body[0].x) + Math.abs(aviso.y - juego.body[0].y) >= 5,
    'muro: el aviso sale demasiado cerca de la cabeza',
  );
  juego.updateFx(800);
  comprobar(juego.walls.length === 1, 'muro: el aviso no se convierte en muro');
  process.stdout.write('  muros: avisan 700 ms antes y no caen cerca\n');
}
{
  // puntos azules robados: suman y no engordan al cazador
  const juego = new Game({ ...MODES.hunter }, () => {});
  juego.state = 'running';
  juego.pellets = [{ x: juego.body[0].x, y: juego.body[0].y }];
  const largo = juego.hunter.body.length;
  const puntos = juego.score;
  juego.robaPunto();
  comprobar(juego.score > puntos, 'puntos: robarlos no suma');
  comprobar(juego.pellets.length >= 1, 'puntos: no repone el punto robado');
  comprobar(juego.hunter.body.length === largo, 'puntos: el cazador crece sin comer');
  process.stdout.write('  puntos azules: se los puedes quitar\n');
}
{
  // el cazador también te come a ti
  const juego = new Game({ ...MODES.hunter }, () => {});
  juego.state = 'running';
  juego.body = [{ x: 5, y: 10 }, { x: 4, y: 10 }, { x: 3, y: 10 }];
  juego.prevBody = juego.body.map((c) => ({ ...c }));
  juego.dir = { x: 1, y: 0 };
  const cabezaJugador = juego.body[0];
  const anillos = Array.from({ length: juego.hunterUmbral() }, (_, i) => ({
    x: cabezaJugador.x + 1,
    y: cabezaJugador.y + i,
  }));
  juego.hunter = {
    body: anillos,
    prev: anillos.map((c) => ({ ...c })),
    dir: { x: 0, y: 0 },
    grow: 0,
    recarga: 0,
  };
  juego.hunterTick = 0;
  juego.hunterCadence = () => 1;
  juego.moveHunter();
  comprobar(juego.state === 'dead', 'cazador: puede pisarte y no pasa nada');
  process.stdout.write('  cazador: si te pisa, te come\n');
}
{
  // el cazador ya no deja marcado su objetivo
  const juego = new Game({ ...MODES.hunter }, () => {});
  juego.state = 'running';
  juego.hunterCadence = () => 1;
  juego.moveHunter();
  comprobar(!juego.hunter.aim, 'cazador: sigue marcando su objetivo');
  process.stdout.write('  cazador: ya no marca su objetivo\n');
}
// el premio recoloca al cazador, pero no lo deja invisible
{
  const juego = new Game({ ...MODES.hunter }, () => {});
  juego.state = 'running';
  juego.bonus = { x: juego.body[0].x, y: juego.body[0].y, ttl: 6000 };
  juego.eatBonus();
  const ctx = lienzoFalso();
  juego.draw(ctx, { cell: 10, ox: 0, oy: 0, width: 200, height: 200, dpr: 1 });
  const rojos = ctx.llamadas.filter((c) => c.tipo === 'fillRect' && c.color === '#ff2b2b');
  comprobar(!!juego.hunter && typeof juego.hunter.recarga === 'number'
    && juego.hunter.recarga <= 0 && rojos.length >= 1,
  'cazador: coger el premio lo deja existiendo pero invisible');
  process.stdout.write('  cazador: el premio lo recoloca y sigue visible\n');
}

// borde: si mata, se ve siempre; si no mata, sólo al acercarse
process.stdout.write('borde\n');
{
  const juego = new Game({ ...MODES.classic }, () => {});
  juego.walls = [];
  juego.wallSet.clear();
  juego.reveal = 1;
  juego.body = [{ x: 10, y: 10 }, { x: 9, y: 10 }];
  juego.dir = { x: 1, y: 0 };
  const lejos = juego.alfaBorde(2, 0, 'arriba');
  comprobar(lejos > 0.2 && lejos < 0.5, 'borde: el borde que mata no se ve siempre');

  // de cerca, el bloque por el que vas a salir se enciende
  juego.body = [{ x: 17, y: 10 }, { x: 16, y: 10 }];
  comprobar(juego.alfaBorde(19, 10, 'der') >= 0.5, 'borde: no enciende la salida al acercarse');
  comprobar(juego.alfaBorde(19, 4, 'der') > 0 && juego.alfaBorde(19, 4, 'der') < 0.5,
    'borde: marca la salida donde no toca');
  const fijo = juego.alfaBorde(19, 10, 'der');
  juego.time += 1200;
  comprobar(juego.alfaBorde(19, 10, 'der') === fijo, 'borde: parpadea al acercarse');

  // con muro, siempre marcado
  juego.body = [{ x: 10, y: 10 }, { x: 9, y: 10 }];
  juego.walls.push([5, 0]);
  juego.wallSet.add(K(5, 0));
  comprobar(juego.alfaBorde(5, 0, 'arriba') === 0.5, 'borde: no marca donde hay muro');

  // si no mata (frenesí da la vuelta), no se marca de lejos
  const giro = new Game({ ...MODES.frenzy }, () => {});
  giro.reveal = 1;
  giro.body = [{ x: 10, y: 10 }, { x: 9, y: 10 }];
  giro.dir = { x: 1, y: 0 };
  comprobar(giro.alfaBorde(2, 0, 'arriba') === 0, 'borde: se marca de lejos aunque no mate');

  // con fantasma tampoco mata
  const fantasma = new Game({ ...MODES.classic }, () => {});
  fantasma.reveal = 1;
  fantasma.fx.ghost = 4000;
  fantasma.body = [{ x: 10, y: 10 }, { x: 9, y: 10 }];
  comprobar(fantasma.alfaBorde(2, 0, 'arriba') === 0, 'borde: el fantasma no apaga el borde');

  // la onda de arranque lo enciende a su paso cuando no mata
  giro.reveal = 0.4;
  giro.body = [{ x: 10, y: 4 }, { x: 10, y: 5 }];
  giro.dir = { x: 0, y: -1 };
  const conLuz = giro.alfaBorde(8, 0, 'arriba');
  comprobar(conLuz > 0 && conLuz < 0.26, 'borde: la luz de arranque no lo ilumina');
  process.stdout.write('  borde: visible si mata, al acercarse si no, y la luz lo enciende\n');
}

// fantasma: se apaga a escalones, no de golpe
process.stdout.write('fantasma\n');
{
  const juego = new Game({ ...MODES.classic }, () => {});
  juego.state = 'running';
  juego.power = { kind: 'ghost', x: juego.body[0].x, y: juego.body[0].y };
  juego.takePower();
  comprobar(juego.ghostPaso === 1, 'fantasma: no empieza entero');
  const pasos = [];
  for (const resto of [1500, 1200, 700, 400]) {
    juego.fx.ghost = resto;
    pasos.push(juego.ghostPaso);
  }
  comprobar(pasos.every((p, i) => i === 0 || p < pasos[i - 1]), 'fantasma: no baja escalón a escalón');
  comprobar(new Set(pasos).size >= 4, 'fantasma: se apaga de golpe');
  comprobar(Math.max(...pasos) <= 1 && Math.min(...pasos) > 0, 'fantasma: se sale de rango');
  juego.fx.ghost = 0;
  comprobar(juego.ghostPaso === 0, 'fantasma: sigue encendido sin tiempo');
  process.stdout.write(`  fantasma: ${pasos.map((p) => p.toFixed(2)).join(' → ')}\n`);
}

// fantasma: atravesarte a ti mismo no te mata
process.stdout.write('fantasma y tu cuerpo\n');
{
  const montar = (fantasma) => {
    const juego = new Game({ ...MODES.classic }, () => {});
    juego.state = 'running';
    juego.walls = [];
    juego.wallSet.clear();
    // la cabeza va a (6,6), que es un anillo del medio (la cola está en 5,6)
    juego.body = [{ x: 6, y: 5 }, { x: 7, y: 5 }, { x: 7, y: 6 }, { x: 6, y: 6 }, { x: 5, y: 6 }];
    juego.prevBody = juego.body.map((c) => ({ ...c }));
    juego.dir = { x: 0, y: 1 };
    juego.food = { x: 0, y: 0 };
    juego.grow = 0;
    if (fantasma) juego.fx.ghost = 4000;
    juego.step();
    return juego;
  };
  const vivo = montar(true);
  comprobar(vivo.state === 'running', 'fantasma: te matas al pasar por tu propio cuerpo');
  comprobar(vivo.body[0].x === 6 && vivo.body[0].y === 6, 'fantasma: no has atravesado tu cuerpo');
  const muerto = montar(false);
  comprobar(muerto.state === 'dead', 'sin fantasma: atravesarte a ti mismo no te mata');
  process.stdout.write('  fantasma: pasas por encima de ti, sin poder te matas\n');
}

// la fruta que cierra el nivel va en amarillo
process.stdout.write('última fruta\n');
{
  const juego = new Game({ ...configNivel(LEVELS[0]), goal: 5 }, () => {});
  comprobar(juego.ultimaFruta === false, 'última fruta: se marca antes de tiempo');
  juego.fruits = 3;
  comprobar(juego.ultimaFruta === false, 'última fruta: se marca con dos frutas por delante');
  juego.fruits = 4;
  comprobar(juego.ultimaFruta === true, 'última fruta: no se marca la que cierra el nivel');
  const libre = new Game({ ...MODES.classic }, () => {});
  libre.fruits = 99;
  comprobar(libre.ultimaFruta === false, 'última fruta: se marca en un modo sin final');
  process.stdout.write('  última fruta: sólo la que cierra el nivel\n');
}

// el cazador rodea tu cuerpo, no se te mete dentro
process.stdout.write('cazador esquivando\n');
{
  const juego = new Game({ ...MODES.hunter }, () => {});
  juego.state = 'running';
  juego.cuerpo = null;
  juego.body = [{ x: 7, y: 5 }, { x: 6, y: 5 }, { x: 6, y: 6 }, { x: 5, y: 6 }];
  juego.prevBody = juego.body.map((c) => ({ ...c }));
  juego.dir = { x: 1, y: 0 };
  juego.hunter = {
    body: [{ x: 5, y: 5 }, { x: 5, y: 4 }],
    prev: [{ x: 5, y: 5 }, { x: 5, y: 4 }],
    dir: { x: 0, y: 1 },
    grow: 0,
  };
  juego.hunterTick = 0;
  juego.hunterCadence = () => 1;
  juego.moveHunter();
  const cabeza = juego.hunter.body[0];
  const dentro = juego.body.slice(0, -1).some((c) => c.x === cabeza.x && c.y === cabeza.y);
  comprobar(!dentro, 'cazador: se mete dentro de tu cuerpo');
  process.stdout.write('  cazador: rodea tu cuerpo cuando puede\n');
}

// el cazador se estrella contra ti y revienta; y se mueve interpolado, no a saltos
process.stdout.write('cazador al choque\n');
{
  const juego = new Game({ ...MODES.hunter }, () => {});
  juego.state = 'running';
  juego.body = [{ x: 5, y: 5 }, { x: 9, y: 10 }, { x: 10, y: 11 }, { x: 11, y: 10 }];
  juego.prevBody = juego.body.map((c) => ({ ...c }));
  juego.dir = { x: 1, y: 0 };
  juego.walls = [[10, 9]];
  juego.wallSet = new Set([K(10, 9)]);
  const anillosMuertos = Array.from({ length: 10 }, (_, i) => ({ x: 10, y: 10 + i }));
  juego.hunter = {
    body: anillosMuertos,
    prev: anillosMuertos.map((c) => ({ ...c })),
    dir: { x: 0, y: 1 },
    grow: 0,
    recarga: 0,
  };
  juego.hunterTick = 0;
  juego.hunterCadence = () => 1;
  const puntos = juego.score;
  juego.moveHunter();
  comprobar(juego.state === 'running', 'cazador: su choque contigo te mata a ti');
  comprobar(juego.hunter.recarga > 0, 'cazador: se estrella contigo y no se muere');
  comprobar(juego.score > puntos, 'cazador: matarlo no suma');
  comprobar(juego.particles.length > 0, 'cazador: no estalla al morir');
  const esperado = 5;
  juego.updateFx(1200);
  comprobar(juego.hunter.recarga <= 0, 'cazador: no vuelve nunca');
  comprobar(juego.hunter.body.length === esperado, 'cazador: vuelve con otro largo');
  comprobar(
    Math.abs(juego.hunter.body[0].x - juego.body[0].x) + Math.abs(juego.hunter.body[0].y - juego.body[0].y) >= 5,
    'cazador: vuelve a nacer encima de ti',
  );
  process.stdout.write('  cazador: se estrella, estalla y vuelve corto y lejos\n');
}
{
  // movimiento interpolado: 0 justo al moverse, 1 cuando toca el siguiente paso
  const juego = new Game({ ...MODES.hunter }, () => {});
  juego.state = 'running';
  juego.hunterCadence = () => 2;
  juego.moveHunter();
  juego.moveHunter();
  const paso = juego.hunter.paso;
  comprobar(paso > 0, 'cazador: no guarda cuánto dura su paso');
  comprobar(juego.hunterAvance <= 0.02, 'cazador: empieza el paso ya avanzado');
  juego.time += paso / 2;
  comprobar(juego.hunterAvance > 0.4 && juego.hunterAvance < 0.6, 'cazador: no avanza suave a mitad de paso');
  juego.time += paso;
  comprobar(juego.hunterAvance === 1, 'cazador: no cierra el paso');
  process.stdout.write('  cazador: avanza interpolado entre casillas\n');
}
/* ═══════════════════════════════════════════════════════════════════════════
   v2.0: competitivo, contrarreloj, perfil, idioma y publicación
   ═══════════════════════════════════════════════════════════════════════════ */
process.stdout.write('v2.0, idioma y publicación\n');
{
  const main = fs.readFileSync(path.join(RAIZ, 'js/main.js'), 'utf8');
  const input = fs.readFileSync(path.join(RAIZ, 'js/input.js'), 'utf8');
  const pagina = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
  const niveles = fs.readFileSync(path.join(RAIZ, 'js/levels.js'), 'utf8');
  const motor = fs.readFileSync(path.join(RAIZ, 'js/engine.js'), 'utf8');
  const audio = fs.readFileSync(path.join(RAIZ, 'js/audio.js'), 'utf8');
  const css = fs.readFileSync(path.join(RAIZ, 'styles.css'), 'utf8');
  const servidor = fs.readFileSync(path.join(RAIZ, 'serve.mjs'), 'utf8');
  const workflow = fs.readFileSync(path.join(RAIZ, '.github/workflows/checks.yml'), 'utf8');
  const readme = fs.readFileSync(path.join(RAIZ, 'README.md'), 'utf8');
  const idiomas = fs.readFileSync(path.join(RAIZ, 'js/i18n.js'), 'utf8');
  const wrangler = fs.readFileSync(path.join(RAIZ, 'wrangler.toml'), 'utf8');

  comprobar(!!MODES.competitive && GROUPS.flatMap((g) => g.modes).includes('competitive'),
    'v2.0: falta el modo competitivo en los grupos');
  comprobar(/\n  start\(\) \{/.test(motor) && /\n  decidir\(opciones = \{\}\) \{/.test(motor)
    && !/rivals|cfg\.bots|botTurn/.test(motor),
  'v2.0: el motor debe arrancar tableros y decidir sin rivales dentro de la misma rejilla');
  comprobar(/timeAttack/.test(motor) && /timeLeft/.test(motor),
    'v2.0: falta el reloj de contrarreloj en el motor');
  comprobar(/mostrarVictoria|mostrarPerfil/.test(main) && /stats/.test(main) && idiomas.includes('statsGames'),
    'v2.0: falta la pantalla de perfil con estadísticas');
  const marcaRetirada = 'BORRAR' + '-COMPETITIVO';
  comprobar(!new RegExp(marcaRetirada).test(main + motor + niveles + audio + pagina + css + idiomas + readme + servidor + wrangler),
    'v2.0: todavía quedan marcadores de retirada en el código');
  comprobar(main.includes("app.modo !== 'hunter'") && input.includes('canTurbo'),
    'turbo: no se desactiva para el cazador');

  comprobar(main.includes('const SERPIENTES_NOMBRE = serpientesDe(MARCA_PALABRA, MARCA_GLIFOS)')
    && main.includes('cuerpo, cabeza, objetivo, punto'), 'marca: no hay una serpiente independiente por letra');
  comprobar(main.includes("const ultimo = i === caracteres.length - 1 && letra === 'e';")
    && main.includes('const punto = ultimo ? { ...objetivo } : null;')
    && main.includes('const objetivo = ultimo ? { x: x0 + 5, y: 4 } : cabeza;'),
  'marca: sólo la última serpiente debe tener manzana');
  comprobar(main.includes('tt >= 800 && tt < 6200')
    && main.includes('const CICLO_NOMBRE = 10000;')
    && main.includes('El cuerpo se extiende de forma continua y lenta'),
  'marca: la e no se aproxima despacio y de forma continua a la manzana');

  comprobar(pagina.includes('snake.js?v=25') && pagina.includes('styles.css?v=25') && pagina.includes('Snake — v2.0'),
    'caché: falta la versión v2.0 (v22) en la página');
  comprobar(pagina.includes('id="lang-switch"') && idiomas.includes("en: {")
    && idiomas.includes('export function setLanguage'), 'idioma: falta el selector ES/EN o su traducción');
  setLanguage('en');
  comprobar(t('campaign') === 'campaign' && t('modeHunter') === 'hunter'
    && levelName('LLANO') === 'open field' && routeSlug('campaign') === 'campaign'
    && routeSlug('settings') === 'settings' && routeWords().settings.includes('ajustes')
    && fruitUnit(1) === 'fruit' && fruitUnit(2) === 'fruits'
    && appleUnit(1) === 'apple' && appleUnit(2) === 'apples'
    && t('applesRemaining', { count: 1, unit: appleUnit(1) }) === '1 apple left',
  'idioma: faltan cadenas inglesas o nombres/rutas localizados');
  comprobar(t('modeTimed') === 'time attack' && t('modeCompetitive') === 'competitive' && t('profile') === 'profile'
    && t('competitiveRank', { rank: 2, total: 4 }) === 'you placed 2 of 4'
    && t('competitiveDown', { count: 3 }) === '3 rivals down'
    && t('timeUp') === 'time up' && t('statsWins') === 'competitive wins'
    && t('modeTimedTag').includes('30') && t('mod_muros') === 'walls appear' && t('mod_turbo') === 'no boost'
    && routeSlug('timed') === 'timed' && routeSlug('competitive') === 'competitive' && routeSlug('profile') === 'profile'
    && routeWords().timed.includes('contrarreloj') && routeWords().competitive.includes('competitivo'),
  'idioma: faltan las cadenas inglesas de v2.0 (contrarreloj, competitivo, perfil, modificadores)');
  setLanguage('es');
  comprobar(t('campaign') === 'campaña' && routeSlug('campaign') === 'campaña'
    && routeSlug('settings') === 'ajustes' && routeWords().settings.includes('settings')
    && fruitUnit(1) === 'fruta' && fruitUnit(2) === 'frutas'
    && appleUnit(1) === 'manzana' && appleUnit(2) === 'manzanas'
    && t('applesRemaining', { count: 1, unit: appleUnit(1) }) === '1 manzana por recoger',
    'idioma: el español no restaura sus textos y rutas');
  comprobar(t('modeTimed') === 'contrarreloj' && t('modeCompetitive') === 'competitivo' && t('profile') === 'perfil'
    && t('competitiveAlive', { alive: 2, total: 4 }) === '2 vivos de 4'
    && t('competitiveRank', { rank: 3, total: 4 }) === 'quedaste 3º de 4'
    && t('timeUp') === 'se acabó el tiempo' && t('statsWins') === 'victorias en competitivo'
    && t('modeTimedTag').includes('30 segundos') && t('mod_muros') === 'muros que salen' && t('mod_turbo') === 'sin turbo'
    && t('ruleMods').length > 10
    && routeSlug('timed') === 'contrarreloj' && routeSlug('competitive') === 'competitivo' && routeSlug('profile') === 'perfil'
    && levelName('TÚNEL') === 'túnel' && levelName('GRAN FINAL') === 'gran final',
  'idioma: faltan las cadenas españolas de v2.0 (contrarreloj, competitivo, perfil, modificadores)');
  comprobar(main.includes('scoring: false') && main.includes('resumenManzanas(juego)')
    && main.includes("el.mult.textContent = appleUnit(recogidas)")
    && motor.includes('if (this.cfg.scoring === false) return 0;')
    && !/campaign\.best|levelGoalRecord|levelScore/.test(main + idiomas),
  'campaña: se muestra o se guarda puntuación en lugar de manzanas recogidas/restantes');
  comprobar(main.includes('data-accion="settings"') && main.includes("case 'toggleSound':")
    && main.includes("routeSlug('settings')"), 'ajustes: falta el acceso compacto o su navegación');
  comprobar(!/fruta a fruta|fruit to fruit|gridSummary|20×20 grid|rejilla 20×20/.test(main + idiomas + pagina),
    'interfaz: vuelve a mostrar alguno de los lemas retirados');

  comprobar(main.includes('BASE_PATH = (() =>')
    && main.includes("'/snake/' : '/'")
    && pagina.includes("indexOf('/snake/') === 0")
    && main.includes("window.addEventListener('popstate'")
    && main.includes("coincideRuta(primera, 'settings')")
    && main.includes("coincideRuta(primera, 'competitive')")
    && main.includes("history[metodo]") && main.includes('decodeURIComponent(camino)'),
  'rutas: falta la base dinámica (raíz en el dominio propio) o la navegación interna');
  comprobar(servidor.includes('pareceArchivo') && servidor.includes('(fallback)'),
    'servidor local: falta el fallback SPA en raíz y bajo /snake/');
  comprobar(wrangler.includes('name = "snake"')
    && wrangler.includes('directory = "./"')
    && wrangler.includes('not_found_handling = "single-page-application"'),
    'Workers: wrangler.toml no configura los estáticos con fallback SPA');
  comprobar(!fs.existsSync(path.join(RAIZ, '404.html')) && !fs.existsSync(path.join(RAIZ, '.nojekyll')),
    'Workers: sobran artefactos de GitHub Pages (404.html / .nojekyll)');
  comprobar(['index.html', 'styles.css', 'snake.js', 'wrangler.toml']
    .every((archivo) => fs.existsSync(path.join(RAIZ, archivo))),
    'Workers: faltan ficheros raíz para el despliegue');
  comprobar(pagina.includes('rel="canonical"') && pagina.includes('snake.jaime-gaming.com'),
    'dominio: falta el canonical de snake.jaime-gaming.com en index.html');
  comprobar(workflow.includes('branches: [main]')
    && workflow.includes('node tools/build.mjs --check')
    && workflow.includes('node tools/check.mjs')
    && !/configure-pages|upload-pages-artifact|deploy-pages|wrangler deploy/.test(workflow),
    'workflow: los checks deben validar fuentes sin desplegar');
  comprobar(readme.includes('wrangler deploy') && readme.includes('snake.jaime-gaming.com')
    && readme.includes('not_found_handling'),
    'README: falta la guía de despliegue en Cloudflare Workers con el dominio');

/* ═══════════════════════════════════════════════════════════════════════════
   v2.0: competitivo de cuatro tableros, sorteos, cuenta atrás y copas;
   contrarreloj con reloj que acelera y manzana envenenada
   ═══════════════════════════════════════════════════════════════════════════ */
process.stdout.write('v2.0: cuatro tableros, sorteo y cuenta atrás\n');
{
  comprobar(main.includes('const TOTAL_TABLEROS = 4') && main.includes('function nombreTablero(i)'),
    'competitivo: faltan los cuatro tableros o sus nombres');
  comprobar(main.includes('function menuCompetitivo()') && main.includes('function prepararCompetitivo()')
    && main.includes('function empezarCompetitivo()'),
  'competitivo: falta el menú previo, el anuncio del sorteo o el arranque');
  comprobar(main.includes('function pasoCuenta(dt)') && main.includes('app.cuenta = 3000')
    && main.includes('el.cuenta'),
  'competitivo: falta la cuenta atrás de tres segundos');
  comprobar(main.includes('for (let i = 0; i < TOTAL_TABLEROS; i++)')
    && main.includes('const juego = new Game(')
    && main.includes("i === 0 ? eventosJuego"),
  'competitivo: los tableros no se crean uno por serpiente');
  comprobar(main.includes('function configuracionArena()') && main.includes('walls: nivel.walls.slice()'),
    'competitivo: la arena no toma los muros del mapa sorteado');
  comprobar(main.includes('function terminarCompetitivo()')
    && main.includes('const orden = [...app.tableros].sort((a, b) => b.juego.score - a.juego.score)')
    && main.includes('app.puestoMuerte = orden.findIndex((tab) => tab.esJugador) + 1'),
  'competitivo: al acabar la ronda no se reparte el puesto por puntos');
  comprobar(main.includes('const DURACION_RONDA = 60000') && main.includes('app.tiempoPartida = DURACION_RONDA')
    && main.includes('app.tiempoPartida = Math.max(0, app.tiempoPartida - dt)'),
  'competitivo: la ronda no dura 60 segundos');
  comprobar(main.includes('const CASTIGO_CAIDA = 10') && main.includes('function perderPuntos(tab)')
    && main.includes('juego.revive()') && motor.includes('\n  revive() {'),
  'competitivo: caer no resta puntos o no se revive');
  comprobar(main.includes('const GRACIA_MS = 1800') && main.includes('graciaMs: GRACIA_MS')
    && motor.includes('this.gracia = Math.max(0, Number(this.cfg.graciaMs) || 0)')
    && motor.includes('const intangible = ghost || gracia'),
  'competitivo: al revivir no hay unos instantes de protección');
  comprobar(main.includes('function actualizarTableros()') && main.includes("fig.classList.toggle('protegido'")
    && css.includes('.tablero.protegido canvas'),
  'competitivo: la protección no se ve en el tablero');
  comprobar(main.includes('const DIFICULTAD_RIVALES') && !main.includes('function ajusteRival')
    && !main.includes('configuracionRival') && main.includes('decidir({ error: tab.fallo || 0 })')
    && main.includes('const cfg = { ...configuracionArena(), graciaMs: GRACIA_MS }'),
  'competitivo: la dificultad interna cambia la velocidad o no está oculta');
  {
    const bloque = main.slice(main.indexOf('const DIFICULTAD_RIVALES'), main.indexOf('function dificultadRivales'));
    const filas = [...bloque.matchAll(/cada: (\d+), fallo: ([\d.]+)/g)]
      .map((m) => ({ cada: Number(m[1]), fallo: Number(m[2]) }));
    const ordenado = filas.length === 6
      && filas.every((f, i) => i === 0 || (f.cada < filas[i - 1].cada && f.fallo < filas[i - 1].fallo));
    comprobar(ordenado, 'competitivo: la dificultad interna no sube con el rango');
  }
  comprobar(main.includes("const texto = String(Math.round(tab.juego.score))"),
    'competitivo: los tableros no muestran los puntos de cada jugador');
  comprobar(css.includes('grid-template-columns: minmax(0, 1.7fr)') && main.includes('* 1.7) / 2.7'),
    'competitivo: tu tablero no es más grande que los rivales');
  comprobar(main.includes("meta = '';\n      marca = '';"),
    'competitivo: la barra de arriba sigue cargada de texto');
  comprobar(main.includes('class="comp-barra"') && main.includes('class="comp-mini"')
    && css.includes('.comp-barra i') && css.includes('.comp-dato b')
    && css.includes('.panel.competitivo') && css.includes('display: flex'),
  'competitivo: el menú no tiene barra de rango, datos en pequeño o estructura de tarjeta');
  comprobar(main.includes('class="comp-escalera"') && main.includes('rankList().map')
    && css.includes('.comp-escalera') && css.includes('.escalon.aqui'),
  'competitivo: falta la escalera de rangos en el menú');
  comprobar(main.includes('class="comp-rivales"') && main.includes("RIVAL_NAMES.join(' · ')")
    && !main.includes('fuerzaRival') && !idiomas.includes('compStrength'),
  'competitivo: la dificultad interna de los rivales sigue a la vista');
  comprobar(main.includes('iconoRango(info.nivel)') && css.includes('.rango-icono[data-rango="5"]'),
    'competitivo: falta el icono de rango a bloques');
  comprobar(main.includes('function dibujarArena()') && main.includes('function actualizarTableros()')
    && main.includes('vivosCompetitivo()'),
  'competitivo: faltan el dibujo y los rótulos de los cuatro tableros');
  comprobar(pagina.includes('id="arena"') && pagina.indexOf('class="tablero"') > 0
    && (pagina.match(/class="tablero"/g) || []).length === 4,
  'competitivo: la página no tiene cuatro tableros separados');
  comprobar(css.includes('#arena {') && css.includes('grid-template-columns: minmax(0, 1.7fr)')
    && css.includes('.tablero.mio') && css.includes('#cuenta'),
  'competitivo: falta la rejilla de los tableros o la cuenta atrás en el estilo');
  comprobar(main.includes('rankInfo(puntosYa)') && idiomas.includes('export function rankInfo')
    && idiomas.includes('pointsToNext') && main.includes('iconoRango(info.nivel)'),
  'competitivo: el menú previo no enseña el rango con su icono y lo que falta');
  comprobar(main.includes('class="panel competitivo"') && main.includes('comp-puntos')
    && !main.includes('fila(\'01\', t(\'statsRank\')'),
  'competitivo: el menú sigue cargado de filas de texto en vez de rango y puntos');
  comprobar(main.includes('app.temporizador = setTimeout(() => {') && main.includes('}, 2050)')
    && !main.includes('data-accion="empezarCompetitivo"'),
  'sorteo: debe animarse y arrancar solo, sin botón de empezar ni de sortear otra');
  comprobar(main.includes('class="panel sorteo"') && main.includes('class="sorteo-caja"')
    && main.includes('class="sorteo-linea"') && main.includes('app.sorteoRuleta')
    && css.includes('@keyframes sorteo-sube') && css.includes('@keyframes sorteo-carga')
    && css.includes('@keyframes sorteo-fija'),
  'sorteo: falta la ruleta, la línea de carga o la fijación del mapa y el modificador');
  comprobar(main.includes('function desplazarUI(paso, repetido = false)') && main.includes('function llevarALaVista(nodo)')
    && main.includes("app.sorteoRuleta = setInterval") && css.includes('overflow-y: auto'),
  'interfaz: la UI no se mueve ni se lleva a la vista dentro de las zonas de scroll');
  comprobar(main.includes('const FASES_RONDA') && main.includes('scoreBoost = fase.boost')
    && main.includes('function revisarPuesto()') && main.includes('function textoVentaja(')
    && main.includes('app.finalAnunciado') && main.includes('function mostrarAviso(')
    && css.includes('.comp-fases') && css.includes('#aviso') && css.includes('.podio')
    && pagina.includes('id="aviso"') && pagina.includes('id="reloj-fase"'),
  'competitivo: faltan los tres actos, el marcador en vivo o el aviso de la ronda');
  comprobar(css.includes('flex-direction: column') && css.includes('flex: 0 0 auto') && css.includes('margin: auto 0')
    && input.includes('scrollUp') && input.includes('repetible') && main.includes('repetido = false'),
  'interfaz: la capa de menús no se puede recorrer entera o el teclado no repite el scroll');
  comprobar(main.includes('// durante la cuenta atrás ya se ve tu serpiente en su tablero'),
    'cuenta atrás: no se dibuja tu serpiente mientras corre el 3·2·1');
  comprobar(main.includes('cifra superado') && css.includes('.cifra.superado'),
    'campaña: el aviso de nivel superado no sale en grande');
  comprobar(MODES.timed.veneno.chance === 0.4 && MODES.timed.veneno.ms === 5000
    && motor.includes('Math.random() < (this.cfg.veneno.chance'),
  'contrarreloj: la envenenada perdió su frecuencia o su castigo');
  // sin veneno no debe salir ni una manzana envenenada
  for (const modo of ['classic', 'hunter']) {
    const juego = new Game({ ...MODES[modo] }, () => {});
    juego.start();
    let salio = false;
    for (let i = 0; i < 40; i++) {
      juego.spawnFood();
      if (juego.veneno) salio = true;
    }
    comprobar(!salio, `veneno: ${modo} sigue escupiendo manzanas envenenadas`);
  }
  {
    const juego = new Game({ ...MODES.competitive, veneno: { chance: 1, puntos: 20 } }, () => {});
    juego.start();
    let salio = false;
    for (let i = 0; i < 40; i++) {
      juego.spawnFood();
      if (juego.veneno) salio = true;
    }
    comprobar(salio, 'competitivo: el modificador de veneno no llega a crear la pareja');
  }

  // la fase multiplica los puntos de todos los tableros
  {
    const base = new Game({ ...MODES.competitive, veneno: null }, () => {});
    const doble = new Game({ ...MODES.competitive, veneno: null, scoreBoost: 2 }, () => {});
    base.start();
    doble.start();
    base.food = { x: 0, y: 0 };
    doble.food = { x: 0, y: 0 };
    base.eatFood();
    doble.eatFood();
    comprobar(doble.score === base.score * 2, 'competitivo: la fase no multiplica los puntos');
  }

  comprobar(!MODES.classic.veneno && !MODES.hunter.veneno && !MODES.competitive.veneno
    && MODES.frenzy.veneno && MODES.frenzy.veneno.chance > 0,
  'veneno: clásico y cazador deben quedar limpios; frenesí conserva el suyo');
  comprobar(main.includes("if (app.arena.mods.includes('veneno')) cfg.veneno = { chance: 0.18, puntos: 20 }")
    && motor.includes('this.score = Math.max(0, this.score - puntos)'),
  'competitivo: el veneno no entra como modificador sorteado o no resta puntos');
  comprobar(motor.includes("ctx.fillStyle = '#df1f1f'")
    && motor.includes('const muesca = Math.max(2, Math.round(w * 0.17))')
    && motor.includes('px + w - muesca')
    && !motor.includes('Math.round(w * 0.36)'),
  'contrarreloj: la manzana envenenada no tiene una diferencia sutil con la buena');
  comprobar(motor.includes('>= 6);') && motor.includes('la misma respiración que la fruta'),
    'contrarreloj: la envenenada no aparece lejos ni con la misma animación');
  comprobar(main.includes('const MODS_COMPETITIVO') && main.includes("['muros', 'reloj', 'cazador', 'turbo', 'veneno']"),
    'competitivo: el modificador no se sortea entre muros, reloj, cazador, sin turbo y veneno');
  comprobar(main.includes('const COPAS_POR_PUESTO = [25, 10, 5, 0]')
    && main.includes('guardado.competitive.points') && main.includes('comp.points ?? comp.cups'),
  'competitivo: faltan los puntos por puesto o su guardado');
  // el patrón se arma por partes: la propia búsqueda no debe dejar rastro
  const sobra = new RegExp(['rivals', 'cfg\\.bots', 'botTurn', ['piloto', 'automático'].join(' ')].join('|'));
  comprobar(!sobra.test(main + motor + niveles),
    'sin rastro: queda lenguaje de rivales dentro de la rejilla o de conducción automática');
  comprobar(!/botDie|\bbots\b/.test(main + motor + niveles + idiomas + pagina),
    'sin rastro: quedan restos de la palabra bots en el código o los textos');

  // cuatro partidas iguales, cada una en su tablero: no comparten nada
  const arena = LEVELS[10];
  const cfgArena = () => ({
    ...MODES.competitive,
    walls: arena.walls.slice(),
    startSpeed: 140,
    mods: ['muros'],
    wallFrom: 4,
    wallEvery: 5,
    wallMax: 12,
  });
  let independientes = 0;
  for (let intento = 0; intento < 6; intento++) {
    const tableros = [0, 1, 2, 3].map(() => {
      const juego = new Game(cfgArena(), () => {});
      juego.start();
      return juego;
    });
    let ms = 0;
    while (ms < 20000) {
      tableros.forEach((juego, i) => {
        if (i > 0 && juego.state === 'running') juego.decidir();
        juego.update(30);
      });
      ms += 30;
    }
    const frutas = tableros.map((juego) => juego.fruits);
    const cabezas = tableros.map((juego) => `${juego.body[0].x},${juego.body[0].y}`);
    const cuerpos = tableros.map((juego) => juego.body.length);
    const validos = tableros.every((juego) => Number.isFinite(juego.score) && juego.body.length >= 1);
    const distintos = new Set(cabezas).size > 1 || new Set(frutas).size > 1 || new Set(cuerpos).size > 1;
    if (validos && distintos) independientes++;
  }
  comprobar(independientes === 6, `tableros: sólo ${independientes}/6 partidas tienen los cuatro independientes`);

  // cada modificador aguanta una partida entera en un tablero suelto
  const resultados = [];
  for (const mod of ['muros', 'reloj', 'cazador', 'turbo']) {
    const cfg = {
      ...MODES.competitive,
      walls: LEVELS[6].walls,
      startSpeed: 138,
      mods: [mod],
    };
    if (mod === 'muros') Object.assign(cfg, { wallFrom: 4, wallEvery: 5, wallMax: 12 });
    if (mod === 'reloj') cfg.timeAttack = { start: 45000, perFruit: 3200, max: 120000, rampMs: 60000 };
    if (mod === 'cazador') Object.assign(cfg, { hunter: true, hunterPellets: 2, hunterCap: 12, hunterSight: 4 });
    if (mod === 'turbo') cfg.noTurbo = true;
    const juego = new Game(cfg, () => {});
    juego.start();
    let ms = 0;
    while (juego.state === 'running' && ms < 15000) {
      juego.decidir();
      juego.update(30);
      ms += 30;
    }
    resultados.push(juego.body.length >= 1 && Number.isFinite(juego.score));
  }
  comprobar(resultados.every(Boolean), 'competitivo: algún modificador rompe la partida de un tablero');

  // los rivales van a por los potenciadores que les sirven
  {
    const juego = new Game({ ...MODES.classic }, () => {});
    juego.state = 'running';
    juego.body = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
    juego.prevBody = juego.body.map((p) => ({ ...p }));
    juego.dir = { x: 1, y: 0 };
    juego.queue = [];
    juego.food = { x: 10, y: 16 };
    juego.power = { x: 10, y: 12, kind: 'shield', ttl: 9000 };
    juego.decidir();
    const va = juego.queue[juego.queue.length - 1] || juego.dir;
    comprobar(va.x === 0 && va.y === 1, 'potenciadores: la serpiente no se desvía a por un escudo cercano');
  }

  // frenesí: olas de fruta y picos de velocidad
  comprobar(MODES.frenzy.waveEvery >= 8000 && MODES.frenzy.pulseEvery >= 6000
    && motor.includes('spawnWave()') && motor.includes('eatExtra(idx)') && motor.includes('pulseLeft'),
  'frenesí: faltan las olas de fruta o los picos de velocidad');

  // contrarreloj: reloj grande, aceleración y pareja envenenada
  comprobar(pagina.includes('id="reloj"') && css.includes('#reloj b')
    && main.includes('function actualizarReloj(juego)'),
  'contrarreloj: falta el reloj grande sobre el tablero');
  comprobar(MODES.timed.timeAttack.start === 30000 && MODES.timed.timeAttack.rampMs > 0
    && MODES.timed.veneno && MODES.timed.veneno.ms >= 3000,
  'contrarreloj: faltan la aceleración del reloj o la manzana envenenada');
  comprobar(motor.includes('this.timeRate = (1 + rampa)') && motor.includes('this.fx.slow > 0 ? 0.5 : 1')
    && motor.includes('this.timeLeft -= dt * this.timeRate'),
  'contrarreloj: el reloj no acelera o «lento» no lo frena');
  comprobar(main.includes("app.modo !== 'hunter' && app.modo !== 'timed'")
    && motor.includes('if (this.cfg.noTurbo) on = false;'),
  'contrarreloj: el turbo sigue disponible');
  comprobar(motor.includes('comerVeneno()') && motor.includes('this.chain = 0')
    && motor.includes('this.veneno = null')
    && motor.slice(motor.indexOf('  comerVeneno() {'), motor.indexOf('  spawnBonus() {')).includes('spawnVeneno()'),
  'contrarreloj: la envenenada ya no corta la cadena o ya no vuelve a salir');
  comprobar(pagina.indexOf('id="cuenta"') > 0 && idiomas.includes('sorteoEtiqueta') === false
    && main.includes('sorteo-mod'),
  'interfaz: falta la cuenta atrás o el anuncio del modificador');

  // el veneno resta segundos y corta la racha
  {
    const juego = new Game({ ...MODES.timed }, () => {});
    juego.start();
    const antes = juego.timeLeft;
    juego.chain = 6;
    juego.chainTimer = 900;
    juego.food = { x: 0, y: 0 };
    juego.veneno = { x: 10, y: 10 };
    juego.body = [{ x: 10, y: 9 }, { x: 10, y: 8 }, { x: 10, y: 7 }];
    juego.prevBody = juego.body.map((p) => ({ ...p }));
    juego.dir = { x: 0, y: 1 };
    juego.queue = [];
    juego.step();
    comprobar(juego.timeLeft <= antes - 4900 && juego.chain === 0,
      'contrarreloj: comer la envenenada no cuesta cinco segundos o no corta la cadena');
  }

  // fuera del reloj, la envenenada resta puntos en vez de segundos
  {
    const juego = new Game({ ...MODES.competitive, veneno: { chance: 0.18, puntos: 20 } }, () => {});
    juego.start();
    juego.score = 100;
    juego.chain = 8;
    juego.chainTimer = 900;
    juego.food = { x: 0, y: 0 };
    juego.veneno = { x: 10, y: 10 };
    juego.body = [{ x: 10, y: 9 }, { x: 10, y: 8 }, { x: 10, y: 7 }];
    juego.prevBody = juego.body.map((p) => ({ ...p }));
    juego.dir = { x: 0, y: 1 };
    juego.queue = [];
    juego.step();
    comprobar(juego.score === 80 && juego.chain === 0,
      'veneno: en el competitivo no resta puntos o no corta la cadena');
  }

  // protección al revivir: se atraviesan muros y bordes unos instantes
  {
    const juego = new Game({ ...MODES.competitive, graciaMs: 1200 }, () => {});
    juego.state = 'dead';
    juego.revive();
    comprobar(juego.state === 'running' && juego.gracia === 1200,
      'protección: al revivir no se activa el margen de gracia');
    juego.body = [{ x: 0, y: 10 }, { x: 1, y: 10 }, { x: 2, y: 10 }, { x: 3, y: 10 }];
    juego.prevBody = juego.body.map((p) => ({ ...p }));
    juego.dir = { x: -1, y: 0 };
    juego.queue = [];
    juego.step();
    comprobar(juego.state === 'running' && juego.body[0].x === 19,
      'protección: el borde mata durante el margen de gracia');
    juego.gracia = 0;
    juego.body = [{ x: 0, y: 10 }, { x: 1, y: 10 }, { x: 2, y: 10 }, { x: 3, y: 10 }];
    juego.prevBody = juego.body.map((p) => ({ ...p }));
    juego.dir = { x: -1, y: 0 };
    juego.queue = [];
    juego.step();
    comprobar(juego.state === 'dead', 'protección: al acabar la gracia el borde ya no debe perdonar');
  }

  // el reloj acelera con la partida y se frena con «lento»
  {
    const juego = new Game({ ...MODES.timed }, () => {});
    juego.start();
    juego.timeLeft = 600000; // sin agobios: aquí sólo se mide la marcha del reloj
    for (let i = 0; i < 1000; i++) {
      juego.fx.ghost = 1e9; // la serpiente no muere mientras se mide el reloj
      juego.update(30);
    }
    const rapido = juego.timeRate;
    juego.fx.slow = 3000;
    juego.update(16);
    const lento = juego.timeRate;
    comprobar(rapido > 1.3 && Math.abs(lento - rapido / 2) < 0.02,
      `contrarreloj: el reloj no acelera (${rapido.toFixed(2)}) o «lento» no lo frena (${lento.toFixed(2)})`);
  }

  // idioma: copas, rangos y explicaciones de los modificadores
  setLanguage('es');
  comprobar(rankInfo(120).nombre === 'plata' && rankInfo(120).siguiente === 'oro'
    && rankInfo(120).falta === 130 && rankInfo(1500).siguiente === null,
  'idioma: el rango actual o lo que falta para el siguiente no cuadran');
  comprobar(rankList().length === 6 && rankList()[0].nombre === 'bronce'
    && rankList()[5].nombre === 'maestro' && rankList()[5].nivel === 5,
  'idioma: la escalera de rangos no va de bronce a maestro');
  comprobar(t('you') === 'tú' && t('play') === 'jugar'
    && t('pointsWon', { count: 10 }) === '+10 puntos'
    && t('competitiveRank', { rank: 3, total: 4 }) === 'quedaste 3º de 4'
    && t('statsPoints') === 'puntos' && t('statsRank') === 'rango'
    && t('pointsToNext', { count: 80, rank: 'plata' }) === '80 para plata'
    && t('placedShort', { rank: 2 }) === '2º' && rankInfo(620).nivel === 3
    && t('compRivals') === 'rivales' && t('compDrop') === '−10 al caer',
  'idioma: faltan las cadenas españolas del competitivo de cuatro tableros');
  setLanguage('en');
  comprobar(rankInfo(260).nombre === 'gold' && t('you') === 'you' && t('play') === 'play'
    && t('pointsToNext', { count: 3, rank: 'gold' }) === '3 to gold'
    && t('competitiveAlive', { alive: 4, total: 4 }) === '4 alive of 4'
    && t('statsPoints') === 'points' && t('compRivals') === 'rivals'
    && t('compDrop') === '−10 on crash', 'idioma: faltan las cadenas inglesas del competitivo');
  setLanguage('es');

  // copas por puesto: la tabla baja con el puesto y nunca resta
  const copas = [25, 10, 5, 0];
  comprobar(copas[0] > copas[1] && copas[1] > copas[2] && copas[2] > copas[3] && copas[3] === 0,
    'copas: la tabla por puesto no es decreciente o resta copas');
  comprobar(main.includes("for (const campo of ['games', 'wins', 'fruits', 'timeMs', 'bestChain'])"),
    'perfil: las estadísticas guardadas no se recuperan al recargar');

  // frenesí: las olas llegan y dejan fruta extra en el tablero
  {
    const juego = new Game({ ...MODES.frenzy }, () => {});
    juego.start();
    let olas = 0;
    let extra = 0;
    juego.onEvent = (tipo) => {
      if (tipo === 'wave') olas++;
    };
    let ms = 0;
    while (juego.state === 'running' && ms < 40000) {
      juego.decidir();
      juego.update(30);
      ms += 30;
      extra = Math.max(extra, juego.extraFoods.length);
    }
    comprobar(olas >= 1 && extra >= 1, 'frenesí: no llegan olas de fruta con la partida');
    process.stdout.write(`  frenesí: ${olas} olas · hasta ${extra} frutas extra a la vez\n`);
  }
}

  const bloque = main.slice(main.indexOf('<ul class="reglas">'), main.indexOf('</ul>', main.indexOf('<ul class="reglas">')));
  const reglas = [...bloque.matchAll(/<li>([^<]+)<\/li>/g)].map((match) => match[1]);
  comprobar(reglas.length >= 4 && reglas.length <= 12, `minimalismo: ${reglas.length} reglas en la ayuda`);
  const larga = reglas.find((regla) => regla.length > 80);
  comprobar(!larga, `minimalismo: una regla pasa de 80 letras («${larga}»)`);

  // v2.0 consolida el competitivo: ya no debe quedar ningún rastro de la retirada.
  const vigilados = [
    'js/levels.js', 'js/main.js', 'js/engine.js', 'js/audio.js', 'index.html',
    'styles.css', 'tools/check.mjs', 'README.md', 'serve.mjs', 'wrangler.toml',
  ];
  for (const rel of vigilados) {
    const texto = fs.readFileSync(path.join(RAIZ, rel), 'utf8');
    comprobar(!texto.includes('BORRAR' + '-COMPETITIVO'), `v2.0: queda la marca de retirada en ${rel}`);
  }
  process.stdout.write(`  ${reglas.length} reglas de ayuda · retirada limpia en ${vigilados.length} ficheros\n`);
}

process.stdout.write(fallos ? `\n${fallos} fallos\n` : '\ntodo en orden\n');
process.exit(fallos ? 1 : 0);
