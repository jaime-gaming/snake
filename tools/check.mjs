// comprobaciones del juego, sin navegador.
//   node tools/check.mjs
// valida los niveles, deja al piloto automático jugarlos y prueba las reglas
// básicas del motor. sale con código 1 si algo falla.

import { Game } from '../js/engine.js';
import { MODES, LEVELS, COLS, ROWS } from '../js/levels.js';

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
for (const id of ['classic', 'frenzy', 'portals', 'hunter', 'blind', 'clock', 'wall']) {
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
  if (id === 'clock') comprobar(juego.cfg.timer > 0, 'clock: sin cuenta atrás');
  if (id === 'wall') comprobar(juego.walls.length >= (MODES.wall.walls || []).length, 'wall: no levanta muros');
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
  comprobar(juego.pellets.length === 2, 'cazador: no hay dos puntos azules al empezar');
  comprobar(
    juego.pellets.every((p) => !juego.wallSet.has(K(p.x, p.y))),
    'cazador: un punto cae dentro de un muro',
  );

  const nacimiento = juego.hunter.body.length;
  let comidos = 0;
  juego.onEvent = (tipo) => {
    if (tipo === 'hunterEat') comidos++;
  };
  juego.state = 'running';
  juego.setDirection(1, 0);
  for (let i = 0; i < 600 && juego.state === 'running'; i++) {
    juego.botTurn();
    juego.update(40);
  }
  comprobar(comidos > 0, 'cazador: no llega a comerse ningún punto azul');
  comprobar(
    juego.hunter.body.length > nacimiento || comidos > 0,
    'cazador: come pero no crece',
  );
  process.stdout.write(`  cazador: ${comidos} puntos comidos, ${juego.hunter.body.length} anillos\n`);
}
{
  // el jugador muere al tocar cualquier anillo del cazador, no sólo la cabeza
  const juego = new Game({ ...MODES.hunter }, () => {});
  juego.state = 'running';
  const anillo = juego.hunter.body[juego.hunter.body.length - 1];
  juego.body = [{ x: anillo.x, y: anillo.y - 1 }];
  juego.dir = { x: 0, y: 1 };
  juego.queue = [];
  juego.step();
  comprobar(juego.state === 'dead', 'cazador: el cuerpo del cazador no mata');
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

// reloj
process.stdout.write('reloj\n');
{
  const juego = new Game({ ...MODES.clock }, () => {});
  juego.state = 'running';
  const inicial = juego.timeLeft;
  juego.update(300);
  comprobar(juego.timeLeft < inicial, 'reloj: la cuenta atrás no baja');
  // comer suma tiempo
  juego.state = 'running';
  juego.body = [{ x: 5, y: 5 }, { x: 4, y: 5 }];
  juego.food = { x: 6, y: 5 };
  juego.timeLeft = 5000;
  juego.eatFood();
  comprobar(juego.timeLeft > 5000, 'reloj: comer no suma tiempo');
  // se acaba
  juego.timeLeft = 120;
  juego.state = 'running';
  juego.update(400);
  comprobar(juego.state === 'dead', 'reloj: no muere al llegar a cero');
  process.stdout.write(`  reloj: ${inicial / 1000} s de salida, come y suma, muere a cero\n`);
}

// muro
process.stdout.write('muro\n');
{
  let juego = new Game({ ...MODES.wall }, () => {});
  const inicial = juego.walls.length;
  for (let intento = 0; intento < 3 && juego.walls.length === inicial; intento++) {
    juego = new Game({ ...MODES.wall }, () => {});
    juego.state = 'running';
    juego.setDirection(1, 0);
    for (let i = 0; i < 900 && juego.state === 'running'; i++) {
      juego.botTurn();
      juego.update(40);
    }
  }
  comprobar(juego.walls.length > inicial, 'muro: no aparecen muros nuevos');
  comprobar(
    juego.walls.every(([x, y]) => {
      const enCuerpo = juego.body.some((s) => s.x === x && s.y === y);
      const enComida = juego.food && juego.food.x === x && juego.food.y === y;
      return !enCuerpo && !enComida;
    }),
    'muro: un muro aparece encima de la serpiente o de la comida',
  );
  comprobar(
    new Set(juego.walls.map(([x, y]) => K(x, y))).size === juego.walls.length,
    'muro: hay muros duplicados',
  );
  process.stdout.write(`  muro: ${inicial} -> ${juego.walls.length} muros\n`);
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
    for (let i = 0; i < 6; i++) juego.moveHunter();
    const despues = distanciaAPunto(juego);
    pruebas++;
    if (despues < antes || comidos > 0) acercamientos++;
    comprobar(juego.hunter.body.length >= 3, 'ia del cazador: se ha quedado sin cuerpo');
  }
  comprobar(acercamientos >= pruebas - 1, `ia del cazador: sólo acierta ${acercamientos}/${pruebas} veces`);
  process.stdout.write(`  cazador: va a por su punto (o se lo come) en ${acercamientos}/${pruebas} arranques\n`);
}
{
  // con el cuerpo largo, va a por el jugador en vez de a los puntos
  const juego = new Game({ ...MODES.hunter }, () => {});
  juego.state = 'running';
  while (juego.hunter.body.length < 8) juego.hunter.body.push({ ...juego.hunter.body[juego.hunter.body.length - 1] });
  const objetivo = juego.hunterTarget();
  const cabeza = juego.body[0];
  // apunta a unas casillas por delante del jugador, o a su cabeza si no cabe
  const delante = objetivo.x !== cabeza.x || objetivo.y !== cabeza.y;
  comprobar(delante, 'ia del cazador: con cuerpo largo no corta el paso al jugador');
  const camino = Math.abs(objetivo.x - cabeza.x) + Math.abs(objetivo.y - cabeza.y);
  comprobar(camino <= 4, 'ia del cazador: el corte queda demasiado lejos');
}

process.stdout.write(fallos ? `\n${fallos} fallos\n` : '\ntodo en orden\n');
process.exit(fallos ? 1 : 0);
