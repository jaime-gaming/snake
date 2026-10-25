// comprobaciones del juego, sin navegador.
//   node tools/check.mjs
// valida los niveles, deja al piloto automático jugarlos y prueba las reglas
// básicas del motor. sale con código 1 si algo falla.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Game } from '../js/engine.js';
import {
  MODES, LEVELS, GROUPS, MODE_ORDER, COLS, ROWS,
  // BORRAR-COMPETITIVO
  COMPETITIVE, mapaDePartida, modificadorDePartida, configCompetitivo,
  ajustarRango, rangoInfo, escalaBots, castigoMuerte,
} from '../js/levels.js';

const K = (x, y) => y * 4096 + x;
let fallos = 0;

function comprobar(condicion, mensaje) {
  if (!condicion) {
    fallos++;
    process.stdout.write(`  falla: ${mensaje}\n`);
  }
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
    bonusEvery: nivel.bonusEvery,
    powerEvery: nivel.powerEvery,
    chainWindow: nivel.chainWindow,
  };
}

// estructura: grupos del menú, 20 niveles y velocidades coherentes
process.stdout.write('estructura\n');
{
  comprobar(GROUPS.length === 3, 'grupos: tienen que ser tres');
  comprobar(GROUPS[0].modes[0] === 'campaign', 'grupos: la campaña va primero');
  const planos = GROUPS.flatMap((g) => g.modes);
  comprobar(planos.length === MODE_ORDER.length, 'grupos: MODE_ORDER no coincide con los grupos');
  comprobar(new Set(planos).size === planos.length, 'grupos: hay un modo repetido');
  comprobar(Object.keys(MODES).length === 4, 'modos: no son cuatro');
  comprobar(!MODES.blind, 'modos: el modo ciego sigue ahí');
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
  });
  for (const [id, modo] of Object.entries(MODES)) {
    comprobar(modo.startSpeed >= modo.minSpeed, `${id}: arranca más lento que su mínimo`);
    comprobar(modo.minSpeed >= 42, `${id}: baja del suelo de velocidad`);
  }
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

// modos infinitos: aguantan 30 s sin romperse
process.stdout.write('modos\n');
// BORRAR-COMPETITIVO · el competitivo también aguanta 30 s con el piloto
for (const id of ['classic', 'frenzy', 'hunter', 'competitive']) {
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
  comprobar(juego.score >= 0 && juego.body.length >= 1, `${id}: estado incoherente`);
  comprobar(juego.speed >= juego.cfg.minSpeed - 0.01, `${id}: la velocidad se sale por debajo del mínimo`);
  comprobar(juego.chainTimer >= 0, `${id}: temporizador de cadena negativo`);
  if (id === 'hunter') comprobar(!!juego.hunter, 'hunter: no hay cazador');
  process.stdout.write(`  ${id}: ${Math.round(ms / 1000)} s, ${juego.fruits} frutas, ${juego.score} puntos, ${poderes} poderes\n`);
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

// cazador: serpiente roja que come puntos azules y crece
process.stdout.write('cazador\n');
{
  const juego = new Game({ ...MODES.hunter }, () => {});
  comprobar(!!juego.hunter && juego.hunter.body.length >= 2, 'cazador: no nace como serpiente');
  comprobar(
    juego.pellets.length === (MODES.hunter.hunterPellets || 2),
    'cazador: no salen todos los puntos azules al empezar',
  );
  comprobar(
    juego.pellets.every((p) => !juego.wallSet.has(K(p.x, p.y))),
    'cazador: un punto cae dentro de un muro',
  );

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
      && !juego.hunter.body.some((c) => c.x === p.x && c.y === p.y));
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
process.stdout.write('ia del cazador\n');
{
  const impulso = new Game({ ...MODES.hunter }, () => {});
  impulso.state = 'running';
  impulso.hunter.body = [{ x: 3, y: 3 }, { x: 2, y: 3 }, { x: 1, y: 3 }];
  impulso.pellets = [{ x: 4, y: 3 }];
  const lejos = impulso.hunterCadence();
  impulso.pellets = [{ x: 16, y: 16 }];
  const normal = impulso.hunterCadence();
  comprobar(lejos < normal, 'ia del cazador: no acelera al ir por un punto cercano');

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
    'ia del cazador: no titubea de vez en cuando');

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
    'ia del cazador: nunca se equivoca de giro');

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
  comprobar(choque.hunter.recarga > 0, 'ia del cazador: nunca choca por error');
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
    comprobar(juego.hunter.body.length >= 3, 'ia del cazador: se ha quedado sin cuerpo');
  }
  comprobar(acercamientos >= pruebas - 2, `ia del cazador: sólo acierta ${acercamientos}/${pruebas} veces`);
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
    'ia del cazador: con el cuerpo corto no va a comer',
  );
  crecer(umbral);
  const objetivo = juego.hunterTarget();
  const cabeza = juego.body[0];
  // apunta a unas casillas por delante del jugador, o a su cabeza si no cabe
  const delante = objetivo.x !== cabeza.x || objetivo.y !== cabeza.y;
  comprobar(delante, 'ia del cazador: con cuerpo largo no corta el paso al jugador');
  const camino = Math.abs(objetivo.x - cabeza.x) + Math.abs(objetivo.y - cabeza.y);
  comprobar(
    camino <= (MODES.hunter.hunterSight || 4),
    'ia del cazador: el corte queda demasiado lejos',
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
  const juego = new Game({ ...MODES.campaign, goal: 5 }, () => {});
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
   BORRAR-COMPETITIVO · pruebas del modo competitivo. se van con el modo.
   ═══════════════════════════════════════════════════════════════════════════ */
process.stdout.write('competitivo\n');
// BORRAR-COMPETITIVO · raíz del repo, para leer los ficheros con la marca
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
{
  comprobar(COMPETITIVE.rangos.length === 7, 'competitivo: no hay siete rangos');
  comprobar(
    COMPETITIVE.rangos.every((r) => typeof r === 'string' && r.length > 2),
    'competitivo: algún rango no tiene nombre',
  );
  comprobar(new Set(COMPETITIVE.rangos).size === 7, 'competitivo: hay rangos repetidos');
  comprobar(COMPETITIVE.jugadores === 4, 'competitivo: no es 1 vs 1 vs 1 vs 1');
  comprobar(COMPETITIVE.bots.length === 3, 'competitivo: no hay tres bots');
  comprobar(COMPETITIVE.tiempo > 10000, 'competitivo: el límite de tiempo es absurdo');
  comprobar(COMPETITIVE.premios.length === 4, 'competitivo: faltan premios por puesto');
  comprobar(COMPETITIVE.premios[0] > 0 && COMPETITIVE.premios[3] < 0, 'competitivo: ganar no sube y perder no baja');
  process.stdout.write(`  rangos: ${COMPETITIVE.rangos.join(' · ')}\n`);

  // mapas y modificadores: siempre válidos, con muros dentro del tablero
  const azar = (v) => () => v;
  for (const v of [0, 0.2, 0.4, 0.6, 0.8, 0.999]) {
    const mapa = mapaDePartida(azar(v));
    comprobar(mapa && typeof mapa.nombre === 'string', 'competitivo: mapa sin nombre');
    comprobar(
      mapa.walls.every(([x, y]) => x >= 0 && y >= 0 && x < COLS && y < ROWS),
      `competitivo: el mapa ${mapa.nombre} tiene muros fuera`,
    );
  }
  comprobar(COMPETITIVE.modificadores.length >= 4, 'competitivo: hay muy pocos modificadores');
  for (const mod of COMPETITIVE.modificadores) {
    const cfg = configCompetitivo(mapaDePartida(azar(0.3)), mod);
    comprobar(typeof mod.nombre === 'string' && mod.nombre.length > 2, 'competitivo: modificador sin nombre');
    comprobar(typeof mod.tag === 'string' && mod.tag.length > 4, 'competitivo: modificador sin explicación');
    comprobar(cfg.startSpeed >= 60 && cfg.startSpeed <= 260, `competitivo: ${mod.nombre} deja una velocidad rara`);
    comprobar(cfg.minSpeed <= cfg.startSpeed, `competitivo: ${mod.nombre} deja el mínimo por encima del inicio`);
    comprobar(!cfg.goal, `competitivo: ${mod.nombre} pone meta`);
    comprobar(cfg.competitive === true, `competitivo: ${mod.nombre} pierde la marca del modo`);
    comprobar(cfg.tiempoTotal === COMPETITIVE.tiempo && cfg.fondoBrillo,
      `competitivo: ${mod.nombre} pierde el brillo de fondo temporizado`);
  }
  process.stdout.write(`  ${COMPETITIVE.modificadores.length} modificadores y ${COMPETITIVE.arenas.length} arenas\n`);

  // los bots aceleran cerca de la comida, pero su error no se aplica a la campaña
  {
    const bot = new Game(configCompetitivo({ nombre: 'abierta', walls: [] }, null), () => {});
    bot.state = 'running';
    bot.body = [{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 3, y: 5 }, { x: 2, y: 5 }];
    bot.prevBody = bot.body.map((c) => ({ ...c }));
    bot.dir = { x: 1, y: 0 };
    bot.food = { x: 8, y: 5 };
    bot.botTurn();
    comprobar(bot.turbo, 'bot competitivo: no usa el boost al acercarse a la comida');
    bot.food = { x: 17, y: 17 };
    bot.botTurn();
    comprobar(!bot.turbo, 'bot competitivo: deja el boost encendido lejos de la comida');

    // reproducible: forzar un fallo poco frecuente hacia una pared y comprobar el choque
    const distraido = new Game(configCompetitivo({ nombre: 'abierta', walls: [] }, null), () => {});
    distraido.state = 'running';
    distraido.body = [{ x: 10, y: 0 }, { x: 9, y: 0 }, { x: 8, y: 0 }, { x: 7, y: 0 }];
    distraido.prevBody = distraido.body.map((c) => ({ ...c }));
    distraido.dir = { x: 1, y: 0 };
    distraido.food = { x: 17, y: 10 };
    distraido.botPausaHasta = 0;
    distraido.botSiguienteFallo = 0;
    const randomOriginal = Math.random;
    const secuencia = [0, 0.08, 0];
    Math.random = () => secuencia.shift() ?? 0;
    try {
      distraido.botTurn();
    } finally {
      Math.random = randomOriginal;
    }
    distraido.step();
    comprobar(distraido.state === 'dead', 'bot competitivo: no puede cometer un choque ocasional');
  }

  // cada jugador recibe su propia cuadrícula: cambiar una no toca las demás
  const mapa = mapaDePartida(azar(0.5));
  const mod = modificadorDePartida(azar(0.1));
  const a = configCompetitivo(mapa, mod);
  const b = configCompetitivo(mapa, mod);
  comprobar(a.walls !== b.walls, 'competitivo: los jugadores comparten el array de muros');
  comprobar(a.walls !== mapa.walls, 'competitivo: el mapa se comparte con la configuración');
  const juegoA = new Game(a, () => {});
  const juegoB = new Game(b, () => {});
  juegoA.raiseWall();
  juegoA.updateFx(900);
  comprobar(juegoA.walls.length !== juegoB.walls.length || juegoA.walls.length === 0,
    'competitivo: lo que pasa en una cuadrícula se ve en la otra');

  // ascensos y descensos
  comprobar(ajustarRango({ rango: 0, dentro: 10 }, 3).rango === 1, 'competitivo: ganar no asciende');
  comprobar(ajustarRango({ rango: 3, dentro: 1 }, -2).rango === 2, 'competitivo: perder no desciende');
  const tope = ajustarRango({ rango: 6, dentro: 11 }, 3);
  comprobar(tope.rango === 6 && tope.dentro < COMPETITIVE.porRango, 'competitivo: se sube por encima del último rango');
  const suelo = ajustarRango({ rango: 0, dentro: 0 }, -2);
  comprobar(suelo.rango === 0 && suelo.dentro === 0, 'competitivo: se baja por debajo del primer rango');
  const info = rangoInfo({ rango: 2, dentro: 6 });
  comprobar(info.nombre === COMPETITIVE.rangos[2], 'competitivo: el rango no coincide con su nombre');
  comprobar(info.siguiente === COMPETITIVE.rangos[3], 'competitivo: no dice cuál es el siguiente');
  comprobar(Math.abs(info.progreso - 0.5) < 1e-9, 'competitivo: la barra del rango miente');
  comprobar(info.nivel === 3 && info.total === 7, 'competitivo: el rango no dice en qué peldaño está');
  comprobar(COMPETITIVE.rangos.every((r) => r.length <= 10), 'competitivo: algún rango se va de largo');
  comprobar(rangoInfo({ rango: 6, dentro: 11 }).siguiente === null, 'competitivo: el último rango tiene siguiente');

  // los bots aprietan más según tu rango
  comprobar(escalaBots(0) > escalaBots(3) && escalaBots(3) > escalaBots(6), 'competitivo: los bots no escalan con el rango');
  comprobar(escalaBots(99) === escalaBots(6), 'competitivo: la escala de bots se sale');

  // una partida entera con el piloto, con reloj propio: 4 cuadrículas a la vez
  const jugadores = [0, 1, 2, 3].map(() => new Game(configCompetitivo(mapa, mod), () => {}));
  for (const j of jugadores) j.state = 'running';
  let t = 0;
  while (t < 12000) {
    for (const j of jugadores) {
      if (j.state === 'running') {
        j.botTurn();
        j.update(30);
      }
    }
    t += 30;
  }
  comprobar(jugadores.every((j) => j.score >= 0), 'competitivo: puntuación negativa');
  comprobar(jugadores.slice(1).every((j) => j.walls !== jugadores[0].walls), 'competitivo: dos jugadores con la misma cuadrícula');
  process.stdout.write(`  partida de prueba: ${jugadores.map((j) => j.score).join(' · ')} puntos\n`);

  // morirse no cierra la partida: revives, sigues con tus frutas y pagas puntos
  {
    const juego = new Game(configCompetitivo(mapa, mod), () => {});
    juego.state = 'running';
    let revives = 0;
    juego.onEvent = (tipo) => { if (tipo === 'revive') revives++; };
    juego.score = 300;
    juego.fruits = 9;
    juego.body = [{ x: 19, y: 10 }, { x: 18, y: 10 }, { x: 17, y: 10 }, { x: 16, y: 10 }];
    juego.dir = { x: 1, y: 0 };
    juego.prevBody = juego.body.map((c) => ({ ...c }));
    juego.step(); // se sale del tablero
    comprobar(juego.state === 'dead', 'competitivo: morirse no te mata');

    const castigo = castigoMuerte(juego.score);
    comprobar(castigo === Math.max(COMPETITIVE.castigo.minimo, Math.round(300 * 0.2)),
      'competitivo: el castigo no es un 20 % con mínimo');
    const puntosAntes = juego.score;
    const pagado = juego.revivir(castigo);
    comprobar(revives === 1, 'competitivo: revivir no avisa');
    comprobar(pagado === castigo && juego.score === puntosAntes - castigo, 'competitivo: revivir no descuenta puntos');
    comprobar(juego.state === 'running', 'competitivo: no vuelves a jugar tras morir');
    comprobar(juego.fruits === 9, 'competitivo: revivir te borra las frutas');
    comprobar(juego.gracia > 0, 'competitivo: revives sin gracia y te matas otra vez');
    comprobar(!juego.crash, 'competitivo: el choque se queda colgado al revivir');

    // durante la gracia no te matas
    juego.body = [{ x: 19, y: 10 }, { x: 18, y: 10 }, { x: 17, y: 10 }, { x: 16, y: 10 }];
    juego.dir = { x: 1, y: 0 };
    juego.prevBody = juego.body.map((c) => ({ ...c }));
    juego.step();
    comprobar(juego.state === 'running', 'competitivo: la gracia no te protege al revivir');
    juego.gracia = 0;

    // el castigo nunca deja la puntuación por debajo de cero
    juego.score = 10;
    const pagado2 = juego.revivir(castigoMuerte(juego.score));
    comprobar(juego.score === 0 && pagado2 === 10, 'competitivo: el castigo deja puntos negativos');
    process.stdout.write(`  revivir: ${castigo} puntos de castigo, ${juego.gracia} ms de gracia\n`);
  }

  // poco texto: la ayuda no puede volver a llenarse de párrafos
  {
    const fuente = fs.readFileSync(path.join(RAIZ, 'js/main.js'), 'utf8');
    const entrada = fs.readFileSync(path.join(RAIZ, 'js/input.js'), 'utf8');
    const pagina = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
    comprobar(fuente.includes('const SERPIENTES_NOMBRE = serpientesDe(MARCA_PALABRA, MARCA_GLIFOS)')
      && fuente.includes('cuerpo, cabeza, objetivo, punto'), 'marca: no hay una serpiente independiente por letra');
    comprobar(pagina.includes('snake.js?v=16') && pagina.includes('styles.css?v=16'),
      'caché: falta la versión v16 en la página');
    const preferenciaAmbiente = ['guardado', 'ambiente'].join('.');
    const accionAmbiente = ['comp', 'ambiente'].join('-');
    comprobar(!fuente.includes(preferenciaAmbiente) && !fuente.includes(accionAmbiente),
      'ambiente: sigue siendo configurable desde la pantalla de rangos');
    comprobar(fuente.includes("app.modo !== 'hunter' && app.modo !== 'competitive'")
      && entrada.includes('canTurbo'), 'turbo: no está bloqueado en cazador y competitivo');
    comprobar(fuente.includes('finRestante = 1000') && fuente.includes("c.fase === 'fin'"),
      'competitivo: falta el segundo de congelación antes de la tabla');
    const bloque = fuente.slice(fuente.indexOf('<ul class="reglas">'), fuente.indexOf('</ul>', fuente.indexOf('<ul class="reglas">')));
    const reglas = [...bloque.matchAll(/<li>([^<]+)<\/li>/g)].map((m) => m[1]);
    comprobar(reglas.length > 4 && reglas.length <= 12, `minimalismo: ${reglas.length} reglas en la ayuda`);
    const larga = reglas.find((r) => r.length > 80);
    comprobar(!larga, `minimalismo: una regla pasa de 80 letras («${larga}»)`);
    const sala = fuente.slice(fuente.indexOf('class="panel versus"'), fuente.indexOf('function crearRivales'));
    comprobar(!/<p class="nota">[^<]{90,}/.test(sala), 'minimalismo: la sala del competitivo tiene un párrafo largo');
    process.stdout.write(`  ${reglas.length} reglas de ${Math.max(...reglas.map((r) => r.length))} letras como mucho\n`);
  }

  // la marca de borrado tiene que seguir ahí, en todos los ficheros que toca
  const marcados = ['js/levels.js', 'js/main.js', 'js/engine.js', 'index.html', 'styles.css', 'tools/check.mjs', 'README.md'];
  for (const rel of marcados) {
    const texto = fs.readFileSync(path.join(RAIZ, rel), 'utf8');
    comprobar(texto.includes('BORRAR-COMPETITIVO'), `competitivo: falta la marca BORRAR-COMPETITIVO en ${rel}`);
  }
  process.stdout.write(`  marca de borrado en ${marcados.length} ficheros\n`);
}

process.stdout.write(fallos ? `\n${fallos} fallos\n` : '\ntodo en orden\n');
process.exit(fallos ? 1 : 0);
