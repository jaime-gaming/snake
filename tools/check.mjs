// comprobaciones del juego, sin navegador.
//   node tools/check.mjs
// valida los niveles, deja al piloto automático jugarlos y prueba las reglas
// básicas del motor. sale con código 1 si algo falla.

import { Game } from '../js/engine.js';
import { MODES, LEVELS, GROUPS, MODE_ORDER, COLS, ROWS } from '../js/levels.js';

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
for (const id of ['classic', 'frenzy', 'hunter', 'blind']) {
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

// ciego: la niebla existe y la partida sigue viva
process.stdout.write('ciego\n');
{
  const juego = new Game({ ...MODES.blind }, () => {});
  comprobar(juego.cfg.vision > 0, 'ciego: sin radio de visión');
  juego.state = 'running';
  juego.setDirection(1, 0);
  for (let i = 0; i < 120; i++) {
    juego.botTurn();
    juego.update(40);
    if (juego.state !== 'running') break;
  }
  comprobar(juego.reveal > 0.5, 'ciego: el revelado no avanza');
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
// borde: sin muro no se marca hasta que te acercas, y se enciende la salida
process.stdout.write('borde\n');
{
  const juego = new Game({ ...MODES.classic }, () => {});
  juego.walls = [];
  juego.wallSet.clear();
  juego.reveal = 1;
  juego.body = [{ x: 10, y: 10 }, { x: 9, y: 10 }];
  juego.dir = { x: 1, y: 0 };
  comprobar(juego.alfaBorde(2, 0, 'arriba') === 0, 'borde: se marca lejos sin muro');
  comprobar(juego.alfaBorde(8, 0, 'arriba') === 0, 'borde: se marca a media distancia sin muro');

  // cabeza pegada al borde de arriba, subiendo: ahí está la salida
  juego.body = [{ x: 10, y: 2 }, { x: 10, y: 3 }];
  juego.dir = { x: 0, y: -1 };
  comprobar(juego.alfaBorde(10, 0, 'arriba') >= 0.5, 'borde: no enciende la salida al acercarse');
  comprobar(juego.alfaBorde(8, 0, 'arriba') > 0 && juego.alfaBorde(8, 0, 'arriba') < 0.5,
    'borde: no marca cerca de la cabeza');

  // con muro en el borde, se marca siempre
  juego.body = [{ x: 10, y: 10 }, { x: 9, y: 10 }];
  juego.walls.push([5, 0]);
  juego.wallSet.add(K(5, 0));
  comprobar(juego.alfaBorde(5, 0, 'arriba') === 0.5, 'borde: no marca donde hay muro');
  // la onda de arranque sí lo enciende a su paso
  juego.wallSet.clear();
  juego.reveal = 0.4;
  juego.body = [{ x: 10, y: 4 }, { x: 10, y: 5 }];
  juego.dir = { x: 0, y: -1 };
  const conLuz = juego.alfaBorde(8, 0, 'arriba');
  comprobar(conLuz > 0 && conLuz < 0.26, 'borde: la luz de arranque no lo ilumina');
  juego.reveal = 1;
  comprobar(juego.alfaBorde(8, 0, 'arriba') !== conLuz, 'borde: sigue iluminado con el mapa ya encendido');
  process.stdout.write('  borde: mudo lejos, avisa cerca y enciende la salida\n');
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
  process.stdout.write('  cazador: rodea el cuerpo en vez de atravesarlo\n');
}

process.stdout.write(fallos ? `\n${fallos} fallos\n` : '\ntodo en orden\n');
process.exit(fallos ? 1 : 0);
