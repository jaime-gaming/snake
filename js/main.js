import { Game, POWER_INFO } from './engine.js?v=3';
import {
  MODES, LEVELS, GROUPS, MODE_ORDER, COLS, ROWS,
  // BORRAR-COMPETITIVO
  COMPETITIVE, mapaDePartida, modificadorDePartida, configCompetitivo,
  ajustarRango, rangoInfo, escalaBots, castigoMuerte,
} from './levels.js?v=3';
import { audio } from './audio.js?v=3';
import { attachInput } from './input.js?v=3';

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
  barrido: $('#barrido'), // transición de bloques entre pantallas
  festejo: $('#festejo'), // BORRAR-COMPETITIVO
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

function turboPermitido() {
  return app.pantalla === 'playing' && app.modo !== 'hunter' && app.modo !== 'competitive';
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

/* ---------------------------------------------------------- rótulo
   "snake." dibujado con cinco serpientes: una por letra, cada una con su
   cuerpo, su cabeza y un punto que alcanza de vez en cuando. */

// letras de 3x5 bloques; cada serpiente escribe su carácter y alcanza su punto
const MARCA_GLIFOS = {
  s: ['.###', '#...', '.##.', '...#', '###.'],
  n: ['#..#', '##.#', '#.##', '#..#', '#..#'],
  a: ['.##.', '...#', '.###', '#..#', '.###'],
  k: ['#..#', '#.#.', '##..', '#.#.', '#..#'],
  e: ['###.', '#...', '##..', '#...', '###.'],
};
const MARCA_PALABRA = 'snake';
const ANCHO_GLIFO = 4;
const COLS_MARCA = 26; // 4 columnas por letra, 1 de hueco y el punto
const FILAS_MARCA = 5;
const marca = { t: 0, ancho: 0, alto: 0, dpr: 1 };

// construye una serpiente independiente por cada carácter (una por letra/dígito)
const serpientesDe = (texto, glifos) => {
  const serpientes = [];
  const caracteres = texto.split('');
  const desplazamiento = Math.max(0, Math.floor((COLS_MARCA - (caracteres.length * 5 + 1)) / 2));
  caracteres.forEach((letra, i) => {
    const glifo = glifos[letra];
    if (!glifo) return;
    const x0 = desplazamiento + i * 5;
    const cuerpo = [];
    let cabeza = null;
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < ANCHO_GLIFO; x++) {
        if (glifo[y][x] !== '#') continue;
        const celda = { x: x0 + x, y };
        if (cabeza) cuerpo.push(cabeza);
        cabeza = celda;
      }
    }
    // las cuatro primeras serpientes alcanzan el hueco de su letra; la última, el punto final
    const ultimo = i === caracteres.length - 1;
    const objetivo = ultimo ? { x: x0 + 5, y: 4 } : { x: x0 + 4, y: 2 };
    const punto = ultimo ? { ...objetivo } : null;
    if (cabeza) serpientes.push({ cuerpo, cabeza, objetivo, punto });
  });
  return serpientes;
};
const SERPIENTES_NOMBRE = serpientesDe(MARCA_PALABRA, MARCA_GLIFOS);

function ajustarMarca() {
  const lienzo = document.getElementById('marca');
  if (!lienzo) return;
  const caja = lienzo.parentElement ? lienzo.parentElement.getBoundingClientRect() : null;
  const ancho = Math.max(150, Math.min(caja && caja.width ? caja.width : 240, 300));
  const alto = Math.round((ancho * FILAS_MARCA) / COLS_MARCA);
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  lienzo.style.width = `${ancho}px`;
  lienzo.style.height = `${alto}px`;
  lienzo.width = Math.round(ancho * dpr);
  lienzo.height = Math.round(alto * dpr);
  Object.assign(marca, { ancho, alto, dpr });
}

// números de 4x5 para cuando el rótulo escribe el récord
const MARCA_DIGITOS = {
  0: ['.##.', '#..#', '#..#', '#..#', '.##.'],
  1: ['..#.', '.##.', '..#.', '..#.', '.###'],
  2: ['.##.', '#..#', '..#.', '.#..', '####'],
  3: ['###.', '...#', '.##.', '...#', '###.'],
  4: ['#..#', '#..#', '####', '...#', '...#'],
  5: ['###.', '#...', '###.', '...#', '###.'],
  6: ['.##.', '#...', '###.', '#..#', '.##.'],
  7: ['###.', '...#', '..#.', '.#..', '.#..'],
  8: ['.##.', '#..#', '.##.', '#..#', '.##.'],
  9: ['.##.', '#..#', '.###', '...#', '.##.'],
};

const CICLO_NOMBRE = 3200;
const CICLO_RECORD = 3000;

// el récord más alto de todo lo jugado: es lo que escribe la serpiente
function mejorGlobal() {
  let mejor = 0;
  for (const valor of Object.values(guardado.best || {})) mejor = Math.max(mejor, Number(valor) || 0);
  for (const valor of Object.values(guardado.campaign.best || {})) mejor = Math.max(mejor, Number(valor) || 0);
  return Math.round(mejor);
}

function dibujarMarca(dt) {
  const lienzo = document.getElementById('marca');
  if (!lienzo || !marca.ancho) return;
  const ctx = lienzo.getContext('2d');

  // el rótulo alterna: el nombre y, si ya hay récord, la cifra escrita igual
  const record = mejorGlobal();
  const total = record > 0 ? CICLO_NOMBRE * 2 + CICLO_RECORD : CICLO_NOMBRE;
  marca.t = (marca.t + dt) % total;

  const lado = Math.floor(marca.ancho / COLS_MARCA);
  const sep = Math.max(1, Math.round(lado * 0.16));
  const tam = lado - sep * 2;
  const aire = Math.round((marca.ancho - lado * COLS_MARCA) / 2);

  ctx.setTransform(marca.dpr, 0, 0, marca.dpr, 0, 0);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, marca.ancho, marca.alto);

  const bloque = (cx, cy, color) => {
    ctx.fillStyle = color;
    ctx.fillRect(
      aire + Math.round(cx * lado) + sep,
      Math.round(cy * lado) + sep,
      tam,
      tam,
    );
  };

  // la cabeza: un bloque blanco con dos ojos negros que miran al punto
  const cara = (cx, cy, mira) => {
    bloque(cx, cy, '#ffffff');
    const ojo = Math.max(2, Math.round(tam * 0.2));
    for (const s of [-1, 1]) {
      const ex = aire + Math.round(cx * lado) + sep + tam / 2 + tam * mira;
      const ey = Math.round(cy * lado) + sep + tam / 2 + s * tam * 0.2;
      ctx.fillStyle = '#000';
      ctx.fillRect(Math.round(ex - ojo / 2), Math.round(ey - ojo / 2), ojo, ojo);
    }
  };

  // dibuja varias serpientes (una por carácter), cada una con su punto,
  // su propio ciclo y desfazada respecto a las demás
  const cicloSerpientes = (serpientes, t) => {
    serpientes.forEach((serp, i) => {
      const tt = (t + i * 700) % 3200;
      let avance = 0;
      let comido = false;
      if (tt >= 400 && tt < 700) avance = Math.round(((tt - 400) / 300) * 3) / 3;
      else if (tt >= 700 && tt < 1900) { avance = 1; comido = !!serp.punto; }
      else if (tt >= 1900 && tt < 2200) avance = Math.round((1 - (tt - 1900) / 300) * 3) / 3;

      serp.cuerpo.forEach((c, k) => {
        bloque(c.x, c.y, k % 5 === 4 ? '#cfcfcf' : '#e8e8e8');
      });

      if (serp.punto && !comido) {
        const m = Math.round(sep * 1.1);
        ctx.fillStyle = '#ff2b2b';
        ctx.fillRect(
          aire + Math.round(serp.punto.x * lado) + m,
          Math.round(serp.punto.y * lado) + m,
          lado - m * 2,
          lado - m * 2,
        );
      }

      const base = serp.cabeza;
      const destino = serp.objetivo || base;
      const cx = base.x + avance * (destino.x - base.x);
      const cy = base.y + avance * (destino.y - base.y);
      cara(cx, cy, avance > 0.05 ? 0.24 : 0.14);
    });
  };

  const t = marca.t;
  if (record > 0 && t >= CICLO_NOMBRE * 2) {
    const cifra = String(record).slice(-5);
    cicloSerpientes(serpientesDe(cifra, MARCA_DIGITOS), t - CICLO_NOMBRE * 2);
    return;
  }
  cicloSerpientes(SERPIENTES_NOMBRE, t);
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

  ajustarMarca();

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

/* ------------------------------------------------- barrido de pantallas

   cada cambio de pantalla tapa la vieja con una cortina de cubos y la vuelve a
   descubrir en escalera. son bloques enteros: no hay fundidos ni medios tonos. */

const barrido = { ctx: null, ancho: 0, alto: 0, dpr: 1, t: 0, activo: false, celdas: null };
const DURACION_BARRIDO = 260;

function sinMovimiento() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (err) {
    return false;
  }
}

function ajustarBarrido() {
  const lienzo = el.barrido;
  if (!lienzo) return false;
  const ancho = Math.max(1, Math.round(window.innerWidth || 480));
  const alto = Math.max(1, Math.round(window.innerHeight || 480));
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (barrido.ctx && barrido.ancho === ancho && barrido.alto === alto && barrido.dpr === dpr) return true;

  lienzo.style.width = `${ancho}px`;
  lienzo.style.height = `${alto}px`;
  lienzo.width = Math.round(ancho * dpr);
  lienzo.height = Math.round(alto * dpr);
  barrido.ctx = lienzo.getContext('2d');
  Object.assign(barrido, { ancho, alto, dpr });

  // cubos de unos 56 px: pocos y grandes, se leen como bloques
  const cols = Math.max(6, Math.round(ancho / 56));
  const filas = Math.max(4, Math.round(alto / 56));
  const cw = ancho / cols;
  const ch = alto / filas;
  const celdas = [];
  for (let y = 0; y < filas; y++) {
    for (let x = 0; x < cols; x++) {
      celdas.push({
        x: Math.floor(x * cw),
        y: Math.floor(y * ch),
        w: Math.ceil(cw) + 1,
        h: Math.ceil(ch) + 1,
        // el escalón va de la esquina de arriba a la izquierda a la de abajo a la derecha
        orden: (x + y) / Math.max(1, cols + filas - 2),
      });
    }
  }
  barrido.celdas = celdas;
  return true;
}

function pintarBarrido(quitado) {
  const ctx = barrido.ctx;
  if (!ctx || !barrido.celdas) return;
  ctx.setTransform(barrido.dpr, 0, 0, barrido.dpr, 0, 0);
  ctx.clearRect(0, 0, barrido.ancho, barrido.alto);
  ctx.fillStyle = '#000';
  for (const c of barrido.celdas) {
    if (c.orden < quitado) continue;
    ctx.fillRect(c.x, c.y, c.w, c.h);
  }
}

// se llama al cambiar de pantalla: la cortina ya está pintada antes de que el
// navegador dibuje, así que nunca se ve la pantalla nueva a medio montar
function taparPantalla() {
  if (!el.barrido || sinMovimiento()) return;
  if (!ajustarBarrido()) return;
  barrido.activo = true;
  barrido.t = 0;
  el.barrido.hidden = false;
  pintarBarrido(0);
}

function pasoBarrido(dt) {
  if (!barrido.activo) return;
  barrido.t += dt;
  const avance = Math.min(1, barrido.t / DURACION_BARRIDO);
  pintarBarrido(avance);
  if (avance >= 1) {
    barrido.activo = false;
    if (el.barrido) el.barrido.hidden = true;
  }
}

function pantalla(nombre) {
  const antes = app.pantalla;
  app.pantalla = nombre;
  document.body.dataset.screen = nombre;
  // BORRAR-COMPETITIVO · el reloj, las minis y la cuenta sólo existen jugando
  if (nombre !== 'playing' && nombre !== 'paused') {
    if (el.reloj) el.reloj.hidden = true;
    if (el.minis) el.minis.hidden = true;
    if (el.cuenta) el.cuenta.hidden = true;
    if (el.sorteo) el.sorteo.hidden = true;
  }
  if (nombre !== 'playing') audio.ambienteParar(); // BORRAR-COMPETITIVO · pausa/menú/final
  if (antes === 'versus-fin' && nombre !== 'versus-fin') pararFestejo(); // BORRAR-COMPETITIVO
  if (antes !== nombre) taparPantalla();
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
  rango: 'enter jugar · esc menú',
  sorteo: 'sorteando mapa y modificador…',
  'versus-fin': 'enter revancha · esc menú',
};

function actualizarPista() {
  if (app.pantalla === 'playing') {
    const sinTurbo = app.modo === 'hunter' || app.modo === 'competitive';
    el.hint.textContent = esTactil()
      ? 'desliza para girar'
      : sinTurbo
        ? 'flechas girar · P pausa · R reiniciar · M sonido'
        : 'flechas girar · espacio turbo · P pausa · R reiniciar · M sonido';
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
  el.pause.disabled = (app.pantalla !== 'playing' && app.pantalla !== 'paused') || !!(app.comp && app.comp.fase === 'fin');

  actualizarEfectos(juego);
}

function actualizarEfectos(juego) {
  const activos = [];
  if (juego) {
    if (juego.fx.ghost > 0) activos.push(['fantasma', juego.fx.ghost / POWER_INFO.ghost.ms]);
    if (juego.fx.slow > 0) activos.push(['lento', juego.fx.slow / POWER_INFO.slow.ms]);
    if (juego.turbo && app.modo !== 'hunter' && app.modo !== 'competitive') activos.push(['turbo', 1]);
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
        <h1 class="marca"><canvas id="marca" role="img" aria-label="snake"></canvas></h1>
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
  else if (modo === 'competitive') mostrarRangos(); // BORRAR-COMPETITIVO
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
        <tr><th>girar</th><td>flechas o WASD · desliza</td></tr>
        <tr><th>turbo</th><td>espacio / mayús / A · salvo cazador y competitivo</td></tr>
        <tr><th>pausa</th><td>P o esc · mando: start</td></tr>
        <tr><th>reiniciar</th><td>R · sonido M</td></tr>
        <tr><th>menús</th><td>flechas + enter · ←→ cambia de grupo</td></tr>
      </tbody>
    </table>
    <p class="kicker">en breve</p>
    <ul class="reglas">
      <li>encadena frutas para subir hasta ×5; los cubos dan premios o poderes.</li>
      <li>campaña: 20 niveles; la fruta final es amarilla.</li>
      <li>frenesí: los bordes dan la vuelta. cazador: come puntos y después te persigue.</li>
      <li>cazador: su cabeza te mata; su cuerpo y los puntos son seguros.</li>
      <li>competitivo: cuatro jugadores, 60 s; al chocar revives con penalización.</li>
    </ul>
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

/* BORRAR-COMPETITIVO · subir de rango se festeja con cubos: caen desde arriba y
   el icono nuevo se completa bloque a bloque justo en su hueco */

const festejo = {
  ctx: null, ancho: 0, alto: 0, dpr: 1, t: 0, activo: false,
  cubos: [], celdas: null, caja: null, icono: null,
};
const DURACION_FESTEJO = 2200;

function ajustarFestejo() {
  const lienzo = el.festejo;
  if (!lienzo) return false;
  const ancho = Math.max(1, Math.round(window.innerWidth || 480));
  const alto = Math.max(1, Math.round(window.innerHeight || 480));
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (festejo.ctx && festejo.ancho === ancho && festejo.alto === alto && festejo.dpr === dpr) return true;
  lienzo.style.width = `${ancho}px`;
  lienzo.style.height = `${alto}px`;
  lienzo.width = Math.round(ancho * dpr);
  lienzo.height = Math.round(alto * dpr);
  festejo.ctx = lienzo.getContext('2d');
  Object.assign(festejo, { ancho, alto, dpr });
  return true;
}

function pararFestejo() {
  festejo.activo = false;
  festejo.caja = null;
  festejo.celdas = null;
  if (festejo.ctx) festejo.ctx.clearRect(0, 0, festejo.ancho, festejo.alto);
  if (el.festejo) el.festejo.hidden = true;
  if (festejo.icono) festejo.icono.style.visibility = '';
  festejo.icono = null;
}

function festejar(indice) {
  if (!el.festejo || sinMovimiento()) return;
  if (!ajustarFestejo()) return;

  const ancho = festejo.ancho;
  const alto = festejo.alto;
  festejo.cubos = [];
  for (let i = 0; i < 84; i++) {
    const lado = 6 + (i % 3) * 6; // 6, 12 o 18 px: siempre cubos enteros
    festejo.cubos.push({
      x: Math.random() * Math.max(1, ancho - lado),
      y: -Math.random() * alto,
      v: 170 + Math.random() * 340,
      lado,
      gris: i % 5 === 0 ? '#8a8a8a' : '#ffffff',
    });
  }

  // el icono grande del resultado se tapa y se va dibujando encima, bloque a bloque
  const svg = el.overlay.querySelector('.ico-rango.grande');
  festejo.icono = svg || null;
  festejo.caja = null;
  festejo.celdas = null;
  if (svg) {
    const caja = svg.getBoundingClientRect();
    if (caja.width > 0) {
      const celdas = [];
      for (const trozo of (RANGO_ICONO[indice] || '').match(/<rect[^>]*>/g) || []) {
        const x = Number((trozo.match(/x="(-?[\d.]+)"/) || [])[1] || 0);
        const y = Number((trozo.match(/y="(-?[\d.]+)"/) || [])[1] || 0);
        celdas.push({ x, y });
      }
      festejo.caja = { x: caja.left, y: caja.top, lado: caja.width };
      festejo.celdas = celdas;
      svg.style.visibility = 'hidden';
    }
  }

  festejo.t = 0;
  festejo.activo = true;
  el.festejo.hidden = false;
}

function pasoFestejo(dt) {
  if (!festejo.activo) return;
  const ctx = festejo.ctx;
  if (!ctx) {
    pararFestejo();
    return;
  }
  festejo.t += dt;
  const t = festejo.t;
  ctx.setTransform(festejo.dpr, 0, 0, festejo.dpr, 0, 0);
  ctx.clearRect(0, 0, festejo.ancho, festejo.alto);

  for (const c of festejo.cubos) {
    c.y += (c.v * dt) / 1000;
    if (c.y > festejo.alto) c.y = -c.lado * 2;
    ctx.fillStyle = c.gris;
    ctx.fillRect(Math.round(c.x), Math.round(c.y), c.lado, c.lado);
  }

  if (festejo.caja && festejo.celdas) {
    // el SVG mide 28 y los cubos van a 8 desde 2: se copia la misma rejilla
    const u = festejo.caja.lado / 28;
    const escritos = Math.min(festejo.celdas.length, Math.floor(t / 70));
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < escritos; i++) {
      const celda = festejo.celdas[i];
      ctx.fillRect(
        Math.round(festejo.caja.x + celda.x * u),
        Math.round(festejo.caja.y + celda.y * u),
        Math.max(1, Math.round(8 * u)),
        Math.max(1, Math.round(8 * u)),
      );
    }
  }

  if (t >= DURACION_FESTEJO) pararFestejo();
}

// BORRAR-COMPETITIVO · ambiente automático durante el juego, si el sonido está activo
function empezarAmbiente() {
  if (app.pantalla !== 'playing') return;
  if (!app.comp || !app.comp.activo || app.comp.fase !== 'juego') return;
  audio.ambienteEmpezar();
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

/* BORRAR-COMPETITIVO · los rangos, antes de darle a jugar */

function mostrarRangos() {
  pararTemporizador();
  audio.unlock();
  app.juego = null;
  app.demo = null;
  app.comp = null;
  app.modo = 'competitive';
  const info = rangoInfo(guardado.comp);

  const iconos = COMPETITIVE.rangos.map((nombre, i) => {
    const clase = i === info.rango ? ' aqui' : i < info.rango ? ' hecho' : '';
    return `<figure class="escalon${clase}">
        ${icoRango(i)}
        <figcaption>${nombre}</figcaption>
      </figure>`;
  }).join('');

  ponerOverlay(`<div class="panel versus rangos-comp">
    <div class="niveles-cabeza">
      <div>
        <p class="kicker">competitivo · 4 jugadores · ${COMPETITIVE.tiempo / 1000} s</p>
        <h2>${info.nombre}</h2>
      </div>
      <button class="ghost" type="button" data-accion="modos">grupos <kbd>esc</kbd></button>
    </div>
    <div class="escalera" style="--paso:${info.rango}">${iconos}</div>
    <div class="comp-barra"><i style="width:${(info.progreso * 100).toFixed(0)}%"></i></div>
    <p class="nota">${info.siguiente ? `${info.dentro}/${COMPETITIVE.porRango} para ${info.siguiente}` : 'rango máximo'}</p>
    <p class="pie"><span>1º +3 · 2º +1 · 3º −1 · 4º −2</span></p>
    <div class="acciones">
      <button class="principal" type="button" data-accion="comp-start">jugar <kbd>enter</kbd></button>
      <button type="button" data-accion="home">menú <kbd>esc</kbd></button>
    </div>
  </div>`);

  el.score.textContent = '—';
  el.meta.textContent = `competitivo · ${info.nombre}`;
  el.best.textContent = '';
  el.mult.textContent = '';
  el.chain.style.width = '0%';
  el.pause.disabled = true;
  el.prompt.classList.remove('visible');
  pantalla('rango');
  enfocarPrimero('button[data-accion="comp-start"]');
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
      // cada giro suena y da un salto de un bloque
      if (el.sorteo) {
        el.sorteo.classList.remove('gira');
        void el.sorteo.offsetWidth;
        el.sorteo.classList.add('gira');
      }
      audio.play('sorteo');
      return;
    }
    clearInterval(app.intervalo);
    app.intervalo = 0;
    // se queda con lo sorteado
    if (el.sorteoMapa) el.sorteoMapa.textContent = app.mapaComp.nombre;
    if (el.sorteoMod) el.sorteoMod.textContent = app.modComp.nombre;
    if (el.sorteo) {
      el.sorteo.classList.add('fijo');
      el.sorteo.classList.remove('gira');
    }
    audio.play('fija');
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
      const sube = valor > m.ultimo && m.ultimo >= 0;
      m.ultimo = valor;
      if (m.marca) m.marca.textContent = puntos(valor);
      // BORRAR-COMPETITIVO · cuando un bot come, su cuadrícula da un salto
      if (sube && m.figura) {
        m.figura.classList.remove('suma');
        void m.figura.offsetWidth;
        m.figura.classList.add('suma');
      }
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
  const apurado = c.fase === 'juego' && c.restante <= 10000;
  el.reloj.classList.toggle('apurado', apurado);
  audio.ambienteApurado(apurado); // BORRAR-COMPETITIVO · el pulso se acelera al final
}

function pintarCuenta() {
  const c = app.comp;
  if (!el.cuenta || !c) return;
  if (c.fase !== 'cuenta') {
    el.cuenta.hidden = true;
    return;
  }
  el.cuenta.hidden = false;
  const paso = Math.max(1, Math.ceil(c.cuenta / 1000));
  const texto = c.cuenta > 300 ? String(paso) : 'ya';
  if (el.cuenta.textContent !== texto) {
    el.cuenta.textContent = texto;
    el.cuenta.classList.remove('pop');
    // reinicia la animación del número
    void el.cuenta.offsetWidth;
    el.cuenta.classList.add('pop');
    if (texto !== 'ya') audio.play('cuenta', paso);
  }
}

function congelarCompetitivo(c) {
  if (!c || c.fase === 'fin') return;
  c.fase = 'fin';
  c.finRestante = 1000;
  c.restante = 0;
  pararTemporizador();
  audio.ambienteParar();
  // el último temblor no debe seguir desplazando una pantalla que ya está quieta
  if (app.juego) app.juego.shake = 0;
  for (const rival of c.rivales) rival.juego.shake = 0;
  if (el.minis) el.minis.querySelectorAll('.suma').forEach((nodo) => nodo.classList.remove('suma'));
}

function pasoCompetitivo(dt) {
  const c = app.comp;
  if (!c || !c.activo) return;

  // al acabarse el reloj, jugador y bots quedan inmóviles un segundo antes del resultado
  if (c.fase === 'fin') {
    c.finRestante = Math.max(0, c.finRestante - dt);
    if (c.finRestante <= 0) finCompetitivo();
    return;
  }

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
      empezarAmbiente();
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
  if (c.restante <= 0) {
    congelarCompetitivo(c);
    pintarReloj();
  }
}

function finCompetitivo() {
  const c = app.comp;
  if (!c || !c.activo) return;
  if (c.fase !== 'fin') {
    congelarCompetitivo(c);
    return;
  }
  c.activo = false;

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
  if (cambio.sube || cambio.baja) audio.play('rango', cambio.sube);
  else audio.play(yo.puesto === 1 ? 'level' : 'ui');
  if (cambio.sube) festejar(despues.rango); // BORRAR-COMPETITIVO · cubos al subir
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
          audio.play('revive');
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
  if (app.comp && app.comp.fase === 'fin') return;
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
  empezarAmbiente(); // BORRAR-COMPETITIVO · al seguir, vuelve el pulso
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

  if (app.pantalla === 'playing' && app.comp && app.comp.fase === 'fin') return;

  if (nombre === 'tap') {
    if (turboPermitido() && app.juego) app.juego.toggleTurbo();
    return;
  }
  if (nombre === 'turboOn') {
    if (turboPermitido() && app.juego) app.juego.setTurbo(true);
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
  // BORRAR-COMPETITIVO · pantalla de rangos
  if (app.pantalla === 'rango') {
    if (esDireccion) {
      moverFoco(nombre === 'left' ? -1 : nombre === 'right' ? 1 : 0, nombre === 'up' ? -1 : nombre === 'down' ? 1 : 0);
      return;
    }
    if (nombre === 'confirm') {
      if (!activarFoco()) sorteoCompetitivo();
      return;
    }
    if (nombre === 'back') mostrarInicio();
    return;
  }

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
      mostrarRangos();
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
    case 'comp-start':
      sorteoCompetitivo();
      break;
    case 'comp-again':
      mostrarRangos();
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
  empezarAmbiente(); // BORRAR-COMPETITIVO
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
    // BORRAR-COMPETITIVO · competitivo va directo a los rangos, sin subpágina de un solo modo
    if (grupo && grupo.modes.length === 1 && grupo.modes[0] === 'competitive') {
      mostrarRangos();
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

attachInput({ stage: el.stage, actions: accion, canTurbo: turboPermitido });

/* ---------------------------------------------------------- bucle */

function bucle(t) {
  const dt = app.reloj ? t - app.reloj : 16;
  app.reloj = t;

  // transición de pantallas y festejo del rango, siempre por encima del resto
  pasoBarrido(dt);
  pasoFestejo(dt); // BORRAR-COMPETITIVO

  if (app.pantalla === 'home' || app.pantalla === 'modes') {
    pasoDemo(dt);
    dibujarMarca(dt);
  } else if (app.juego) {
    // BORRAR-COMPETITIVO · con partida de competitivo corren también los tres bots
    if (app.comp) {
      if (app.comp.activo && app.pantalla === 'playing') pasoCompetitivo(dt);
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
  window.__snake.mostrarRangos = mostrarRangos;
  // rótulo y festejo: para poder mirarlos desde las pruebas
  window.__snake.marca = marca;
  window.__snake.serpientesMarca = SERPIENTES_NOMBRE;
  window.__snake.mejorGlobal = mejorGlobal;
  window.__snake.festejar = festejar;
  window.__snake.dibujarMarca = dibujarMarca;
  window.__snake.sorteoCompetitivo = sorteoCompetitivo;
  window.__snake.empezarCompetitivo = empezarCompetitivo;
  window.__snake.finCompetitivo = finCompetitivo;
  window.__snake.pasoCompetitivo = pasoCompetitivo;
}
