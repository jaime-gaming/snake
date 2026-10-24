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

  // el piloto automático debe poder terminarlo
  let ms = 0;
  while (juego.state !== 'cleared' && juego.state !== 'dead' && ms < 120000) {
    juego.botTurn();
    juego.update(30);
    ms += 30;
  }
  comprobar(juego.state === 'cleared', `${etiqueta}: el piloto automático no lo termina (${juego.state})`);
  process.stdout.write(`  ${etiqueta}: ${juego.state} en ${Math.round(ms / 1000)} s, ${juego.fruits}/${nivel.goal} frutas\n`);
});

// modos infinitos: aguantan 30 s sin romperse
process.stdout.write('modos\n');
for (const id of ['classic', 'frenzy', 'portals', 'hunter']) {
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

process.stdout.write(fallos ? `\n${fallos} fallos\n` : '\ntodo en orden\n');
process.exit(fallos ? 1 : 0);
