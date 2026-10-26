// comprobaciones del juego, sin navegador.
//   node tools/check.mjs
// valida los niveles, deja al piloto automático jugarlos y prueba las reglas
// básicas del motor. sale con código 1 si algo falla.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Game, POWER_INFO } from '../js/engine.js';
import { MODES, LEVELS, GROUPS, MODE_ORDER, COLS, ROWS, POWER_POOLS } from '../js/levels.js';
import { setLanguage, t, routeSlug, routeWords, levelName, fruitUnit, appleUnit } from '../js/i18n.js';

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
  };
}

// estructura: grupos del menú, 20 niveles y velocidades coherentes
process.stdout.write('estructura\n');
{
  comprobar(GROUPS.length === 2, 'grupos: tienen que ser dos');
  comprobar(GROUPS[0].modes[0] === 'campaign', 'grupos: la campaña va primero');
  const planos = GROUPS.flatMap((g) => g.modes);
  comprobar(planos.length === MODE_ORDER.length, 'grupos: MODE_ORDER no coincide con los grupos');
  comprobar(new Set(planos).size === planos.length, 'grupos: hay un modo repetido');
  comprobar(Object.keys(MODES).length === 3, 'modos: la versión 1.0 conserva tres modos');
  comprobar(!MODES.blind, 'modos: el modo ciego sigue ahí');
  const asignados = new Set(Object.values(POWER_POOLS).flat());
  comprobar(Object.keys(POWER_INFO).every((kind) => asignados.has(kind)),
    'potenciadores: hay alguno sin asignar a un modo');
  comprobar(Object.values(POWER_POOLS).some((pool) => pool.length < Object.keys(POWER_INFO).length),
    'potenciadores: todos siguen activos en todos los modos');
  comprobar(!POWER_POOLS.classic.includes('shield') && !POWER_POOLS.frenzy.includes('ghost')
    && !POWER_POOLS.hunter.includes('slow') && !POWER_POOLS.campaign.includes('double'),
  'potenciadores: no se respetan las exclusiones por modo');
  comprobar(
    Object.keys(MODES).every((id) => planos.includes(id)),
    'grupos: algún modo se queda fuera de los grupos',
  );
  process.stdout.write(`  ${GROUPS.length} grupos · ${planos.length} modos · ${LEVELS.length} niveles\n`);
}
{
  comprobar(LEVELS.length === 20, `campaña: tiene ${LEVELS.length} niveles y deberían ser 20`);
  let ultimo = Infinity;
  LEVELS.forEach((nivel, i) => {
    const etiqueta = `nivel ${String(i + 1).padStart(2)}`;
    comprobar(nivel.speed >= nivel.minSpeed, `${etiqueta}: arranca más lento que su mínimo`);
    comprobar(nivel.minSpeed >= 42, `${etiqueta}: baja del suelo de velocidad`);
    comprobar(nivel.speed <= ultimo, `${etiqueta}: rompe el orden de velocidad`);
    ultimo = nivel.speed;
    comprobar(nivel.goal >= 4 && nivel.goal <= 16, `${etiqueta}: meta fuera de rango`);
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

  // el piloto automático debe poder terminarlo (la fruta sale al azar: hasta 3 intentos)
  let intento = 0;
  let ms = 0;
  let frutas = 0;
  while (intento < 3) {
    intento++;
    const partida = new Game(cfg, () => {});
    ms = 0;
    while (partida.state !== 'cleared' && partida.state !== 'dead' && ms < 120000) {
      partida.botTurn();
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
    frutas = partida.fruits;
    if (intento === 3) {
      comprobar(false, `${etiqueta}: el piloto automático no lo termina (${partida.state})`);
      process.stdout.write(`  ${etiqueta}: ${partida.state} en ${Math.round(ms / 1000)} s, ${frutas}/${nivel.goal} frutas\n`);
    }
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
// BORRAR-COMPETITIVO · sólo se prueban los modos publicados en v1.0.
for (const id of ['classic', 'frenzy', 'hunter']) {
  let supervivientes = 0;
  let frutasTotales = 0;
  let puntosTotales = 0;
  const randomOriginal = Math.random;
  try {
    for (let intento = 1; intento <= 8; intento++) {
      let semilla = (id === 'classic' ? 101 : id === 'frenzy' ? 201 : 301) + intento;
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
        juego.botTurn();
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
  comprobar(supervivientes >= 6, `${id}: sólo ${supervivientes}/8 simulaciones pasan de 30 s`);
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
    juego.botTurn();
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
    aim: null,
    recarga: 0,
  };
  juego.hunterTick = 0;
  juego.hunterCadence = () => 1;
  juego.moveHunter();
  comprobar(juego.state === 'dead', 'cazador: puede pisarte y no pasa nada');
  process.stdout.write('  cazador: si te pisa, te come\n');
}
{
  // el cazador deja marcado su objetivo
  const juego = new Game({ ...MODES.hunter }, () => {});
  juego.state = 'running';
  juego.hunterCadence = () => 1;
  juego.moveHunter();
  comprobar(!!juego.hunter.aim, 'cazador: no marca a dónde va');
  process.stdout.write('  cazador: marca su corte antes de llegar\n');
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
    aim: null,
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
    aim: null,
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
   BORRAR-COMPETITIVO · el modo y sus pruebas se retiraron para v1.0.
   ═══════════════════════════════════════════════════════════════════════════ */
process.stdout.write('v1.0, idioma y publicación\n');
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
  const fallback = fs.readFileSync(path.join(RAIZ, '404.html'), 'utf8');

  comprobar(!MODES.competitive && !GROUPS.flatMap((g) => g.modes).includes('competitive'),
    'v1.0: el modo competitivo sigue disponible');
  comprobar(!/COMPETITIVE|configCompetitivo|mapaDePartida|modificadorDePartida/.test(niveles),
    'v1.0: quedan configuraciones competitivas en levels.js');
  comprobar(!/id="(?:reloj|minis|sorteo|cuenta|festejo)"/.test(pagina),
    'v1.0: quedan nodos del modo competitivo en index.html');
  comprobar(!/crearRivales|configCompetitivo|revivir\(|\.revive\(/.test(main + motor),
    'v1.0: queda una rama funcional del competitivo');
  comprobar(!/ambienteParar|ambienteIniciar|sorteo\(|cuenta\(/.test(audio),
    'v1.0: queda audio del competitivo');
  comprobar(!/comp-barra|#reloj|#minis|#sorteo|#cuenta|#festejo/.test(css),
    'v1.0: quedan estilos exclusivos del competitivo');
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

  comprobar(pagina.includes('snake.js?v=16') && pagina.includes('styles.css?v=16'),
    'caché: falta la versión v16 en la página');
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
  setLanguage('es');
  comprobar(t('campaign') === 'campaña' && routeSlug('campaign') === 'campaña'
    && routeSlug('settings') === 'ajustes' && routeWords().settings.includes('settings')
    && fruitUnit(1) === 'fruta' && fruitUnit(2) === 'frutas'
    && appleUnit(1) === 'manzana' && appleUnit(2) === 'manzanas'
    && t('applesRemaining', { count: 1, unit: appleUnit(1) }) === '1 manzana por recoger',
    'idioma: el español no restaura sus textos y rutas');
  comprobar(main.includes('scoring: false') && main.includes('resumenManzanas(juego)')
    && main.includes("el.mult.textContent = appleUnit(recogidas)")
    && motor.includes('if (this.cfg.scoring === false) return 0;')
    && !/campaign\.best|levelGoalRecord|levelScore/.test(main + idiomas),
  'campaña: se muestra o se guarda puntuación en lugar de manzanas recogidas/restantes');
  comprobar(main.includes('data-accion="settings"') && main.includes("case 'toggleSound':")
    && main.includes("routeSlug('settings')"), 'ajustes: falta el acceso compacto o su navegación');
  comprobar(!/fruta a fruta|fruit to fruit|gridSummary|20×20 grid|rejilla 20×20/.test(main + idiomas + pagina),
    'interfaz: vuelve a mostrar alguno de los lemas retirados');

  comprobar(main.includes("const BASE_PATH = '/snake/'")
    && main.includes("window.addEventListener('popstate'")
    && main.includes("coincideRuta(primera, 'settings')")
    && main.includes("history[metodo]") && main.includes('decodeURIComponent(camino)'),
  'rutas: falta navegación interna o carga directa bajo /snake/');
  comprobar(servidor.includes("rutaOriginal.startsWith('/snake/')")
    && servidor.includes('(fallback)'), 'servidor local: falta el fallback de rutas');
  const raizPages = ['.nojekyll', 'index.html', '404.html', 'styles.css', 'snake.js'];
  comprobar(fallback.includes("var base = '/snake/'") && fallback.includes("'?route='")
    && workflow.includes('branches: [main]')
    && workflow.includes('node tools/build.mjs --check')
    && workflow.includes('node tools/check.mjs')
    && !/configure-pages|upload-pages-artifact|deploy-pages/.test(workflow)
    && !fs.existsSync(path.join(RAIZ, '.github/workflows/pages.yml'))
    && raizPages.every((archivo) => fs.existsSync(path.join(RAIZ, archivo)))
    && readme.includes('Deploy from a branch') && readme.includes('`/(root)`'),
  'GitHub Pages: direct branch publishing, root files, checks, or route recovery are not configured');

  const bloque = main.slice(main.indexOf('<ul class="reglas">'), main.indexOf('</ul>', main.indexOf('<ul class="reglas">')));
  const reglas = [...bloque.matchAll(/<li>([^<]+)<\/li>/g)].map((match) => match[1]);
  comprobar(reglas.length >= 4 && reglas.length <= 12, `minimalismo: ${reglas.length} reglas en la ayuda`);
  const larga = reglas.find((regla) => regla.length > 80);
  comprobar(!larga, `minimalismo: una regla pasa de 80 letras («${larga}»)`);

  // La marca se conserva como rastro de la retirada, no como funcionalidad.
  const marcados = [
    'js/levels.js', 'js/main.js', 'js/engine.js', 'js/audio.js', 'index.html',
    'styles.css', 'tools/check.mjs', 'README.md',
  ];
  for (const rel of marcados) {
    const texto = fs.readFileSync(path.join(RAIZ, rel), 'utf8');
    comprobar(texto.includes('BORRAR-COMPETITIVO'), `v1.0: falta BORRAR-COMPETITIVO en ${rel}`);
  }
  process.stdout.write(`  ${reglas.length} reglas de ayuda · marca de retirada en ${marcados.length} ficheros\n`);
}

process.stdout.write(fallos ? `\n${fallos} fallos\n` : '\ntodo en orden\n');
process.exit(fallos ? 1 : 0);
