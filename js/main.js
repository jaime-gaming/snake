import { Game, POWER_INFO } from './engine.js?v=6';
import { MODES, LEVELS, GROUPS, MODE_ORDER, COLS, ROWS, RIVAL_NAMES } from './levels.js?v=6';
import { audio } from './audio.js?v=3';
import { attachInput } from './input.js?v=5';
import { t, getLanguage, setLanguage, modeName, modeTag, groupName, groupTag, levelName, fruitUnit, appleUnit, routeSlug, routeWords, rankName, rankInfo, rankList } from './i18n.js?v=21';

const $ = (sel) => document.querySelector(sel);

// si algo se rompe, que se vea en pantalla en vez de quedarse en negro
function avisar(mensaje) {
  if (typeof window.__snakeFallo === 'function') window.__snakeFallo(mensaje);
}

function comprobarPiezas() {
  const faltan = [];
  if (!MODES || !MODES.classic || !MODES.frenzy || !MODES.hunter || !MODES.timed || !MODES.competitive) faltan.push('modos');
  if (!Array.isArray(LEVELS) || LEVELS.length !== 30) faltan.push('niveles');
  if (typeof Game !== 'function') faltan.push('motor');
  if (faltan.length) {
    avisar(t('missingPieces', { pieces: faltan.join(', ') }));
    return false;
  }
  return true;
}

const ORDEN = MODE_ORDER;
const CLAVE = 'snake.v2';
const CLAVE_ANTIGUA = 'snake.frenzy.v1';

const el = {
  stage: $('#stage'),
  topbar: $('#topbar'),
  canvas: $('#board'),
  overlay: $('#overlay'),
  senal: $('#senal'),
  reloj: $('#reloj'),
  relojFase: $('#reloj-fase'),
  arena: $('#arena'),
  cuenta: $('#cuenta'),
  tableros: [...document.querySelectorAll('#arena .tablero')],
  meta: $('#hud-meta'),
  score: $('#hud-score'),
  best: $('#hud-best'),
  compVentaja: $('#comp-ventaja'),
  compVentajaTexto: $('#comp-ventaja-texto'),
  compVentajaDetalle: $('#comp-ventaja-detalle'),
  compPublico: $('#comp-publico'),
  mult: $('#hud-mult'),
  chain: $('#chain-bar'),
  combo: $('#combo'),
  effects: $('#effects'),
  mute: $('#btn-mute'),
  pause: $('#btn-pause'),
  lang: $('#lang-switch'),
  hint: $('#hint'),
  avisoFoco: $('#aviso-foco'),
  barrido: $('#barrido'), // transición de bloques entre pantallas
};

const pincel = el.canvas.getContext('2d', { alpha: false });

/* ---------------------------------------------------------- récords */

function nuevaStats() {
  return { games: 0, wins: 0, fruits: 0, timeMs: 0, bestChain: 0 };
}

function nuevoRegistro() {
  return {
    best: { classic: 0, frenzy: 0, hunter: 0, timed: 0, competitive: 0 },
    campaign: { unlocked: 1 },
    competitive: { points: 0 },
    stats: nuevaStats(),
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
  const comp = bruto.competitive || {};
  // «cups» era el nombre antiguo: se sigue leyendo para no perder el progreso
  datos.competitive.points = Math.max(0, parseInt(comp.points ?? comp.cups, 10) || 0);
  // las estadísticas del perfil también vuelven al recargar
  const st = bruto.stats || {};
  for (const campo of ['games', 'wins', 'fruits', 'timeMs', 'bestChain']) {
    datos.stats[campo] = Math.max(0, parseInt(st[campo], 10) || 0);
  }
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
  settingsReturn: 'modes',
  marca: 0,
  reloj: 0,
  temporizador: 0,
  sorteoRuleta: 0,
  record: false,
  statsAcum: 0,
  chips: new Map(),
  arena: null, // mapa + modificador sorteados en la partida competitiva
  copas: null, // resultado de copas al cerrar la partida
  tableros: [], // un tablero por serpiente en el competitivo
  cuenta: 0, // cuenta atrás de 3 s antes de salir
  puestoMuerte: 0,
  fase: null, // apertura, presión o sprint
};

const rutas = { listas: false, restaurando: false };
// La base sale de la página: raíz en el dominio y /snake/ para enlaces antiguos.
const BASE_PATH = (() => {
  if (location.protocol === 'file:') return './';
  return location.pathname === '/snake' || location.pathname.startsWith('/snake/') ? '/snake/' : '/';
})();

const vista = { cell: 24, ox: 0, oy: 0, width: 480, height: 480, dpr: 1 };
const vistaDemo = { cell: 10, ox: 0, oy: 0, width: 200, height: 200, dpr: 1 };

const dosDigitos = (n) => String(n).padStart(2, '0');
const puntos = (n) => String(Math.max(0, Math.round(n || 0)));

function mejorActual() {
  if (app.modo === 'campaign') return 0;
  return guardado.best[app.modo] || 0;
}

function esTactil() {
  return window.matchMedia('(pointer: coarse)').matches;
}

function turboPermitido() {
  return app.pantalla === 'playing' && app.modo !== 'hunter' && app.modo !== 'timed'
    && !(app.juego && app.juego.cfg && app.juego.cfg.noTurbo);
}

function pararTemporizador() {
  if (app.temporizador) {
    clearTimeout(app.temporizador);
    app.temporizador = 0;
  }
  if (app.sorteoRuleta) {
    clearInterval(app.sorteoRuleta);
    app.sorteoRuleta = 0;
  }
}

/* ---------------------------------------------------------- rótulo
   "snake." dibujado con cinco serpientes: una por letra. Sólo la de la e tiene
   manzana y estira el último tramo del cuerpo para alcanzarla. */

// glifos de bloques; cada letra tiene cuerpo y cabeza independientes
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
    // las otras letras se quedan en su sitio; sólo la e va a por la manzana final
    const ultimo = i === caracteres.length - 1 && letra === 'e';
    const objetivo = ultimo ? { x: x0 + 5, y: 4 } : cabeza;
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

const CICLO_NOMBRE = 10000;
const CICLO_RECORD = 3000;

// el récord más alto de todo lo jugado: es lo que escribe la serpiente
function mejorGlobal() {
  let mejor = 0;
  for (const valor of Object.values(guardado.best || {})) mejor = Math.max(mejor, Number(valor) || 0);
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

  // cinco serpientes, pero sólo la última tiene manzana y anima la mordida
  const cicloSerpientes = (serpientes, t) => {
    serpientes.forEach((serp) => {
      // El ciclo largo deja ver cómo la e avanza, bloque a bloque, hacia la manzana.
      const tt = t % CICLO_NOMBRE;
      let avance = 0;
      let comido = false;
      if (serp.punto) {
        if (tt >= 800 && tt < 6200) avance = (tt - 800) / 5400;
        else if (tt >= 6200 && tt < 8000) { avance = 1; comido = true; }
        else if (tt >= 8000) avance = 1 - (tt - 8000) / 2000;
      }

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

      // El cuerpo se extiende de forma continua y lenta hasta la manzana.
      if (serp.punto && avance > 0) {
        bloque(base.x, base.y, '#cfcfcf');
        const dx = destino.x - base.x;
        const dy = destino.y - base.y;
        const x1 = aire + (base.x + 0.5) * lado;
        const y1 = base.y * lado + lado / 2;
        const x2 = aire + (cx + 0.5) * lado;
        const y2 = cy * lado + lado / 2;
        ctx.fillStyle = '#cfcfcf';
        if (dx) {
          ctx.fillRect(Math.min(x1, x2), y1 - tam / 2, Math.max(1, Math.abs(x2 - x1)), tam);
        } else {
          ctx.fillRect(x1 - tam / 2, Math.min(y1, y2), tam, Math.max(1, Math.abs(y2 - y1)));
        }
      }
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

// los cuatro tableros del competitivo: cada uno en su celda de la rejilla
function ajustarArena() {
  if (!el.arena || !app.tableros.length) return;
  const caja = el.arena.getBoundingClientRect();
  const ancho = caja.width || el.stage.getBoundingClientRect().width || 480;
  const alto = caja.height || el.stage.getBoundingClientRect().height || 480;
  const hueco = 6;
  // la rejilla da más sitio a tu tablero: 1.7 partes frente a 1 de cada rival
  const anchoMio = ((ancho - hueco) * 1.7) / 2.7;
  const anchoRival = ((ancho - hueco) * 1.0) / 2.7;
  const altoRival = (alto - hueco * 2) / 3;
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  for (const tab of app.tableros) {
    const fig = el.tableros[tab.i];
    if (!fig) continue;
    const disponible = tab.esJugador
      ? Math.min(anchoMio, alto - 16)
      : Math.min(anchoRival, altoRival - 16);
    const lado = Math.max(70, disponible);
    const lienzo = fig.querySelector('canvas');
    if (!lienzo) continue;
    lienzo.style.width = `${lado}px`;
    lienzo.style.height = `${lado}px`;
    lienzo.width = Math.round(lado * dpr);
    lienzo.height = Math.round(lado * dpr);
    tab.pincel = lienzo.getContext('2d', { alpha: false });
    tab.vista = { cell: lado / Math.max(COLS, ROWS), ox: 0, oy: 0, width: lado, height: lado, dpr };
  }
}

function ajustarLienzo() {
  const caja = el.stage.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  // si el contenedor aún no tiene tamaño (pestaña oculta, iframe recién creado),
  // tiramos de la ventana para no quedarnos con un tablero de 0 px
  const anchoCaja = caja.width || window.innerWidth || 480;
  const altoCaja = (caja.height || Math.max(240, (window.innerHeight || 720) * 0.6)) - reservaReloj;
  // el tablero ocupa todo el hueco: celdas fraccionarias, sin bordes muertos
  const lado = Math.max(160, Math.min(anchoCaja, altoCaja) - 2);
  const celda = lado / Math.max(COLS, ROWS);
  const ancho = lado;
  const alto = lado;

  el.canvas.style.width = `${ancho}px`;
  el.canvas.style.height = `${alto}px`;
  el.canvas.width = Math.round(ancho * dpr);
  el.canvas.height = Math.round(alto * dpr);
  Object.assign(vista, { cell: celda, ox: 0, oy: 0, width: ancho, height: alto, dpr });

  ajustarMarca();
  if (!el.arena.hidden) ajustarArena();

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
// tablero se pinte, así que nunca se ve la pantalla nueva a medio montar
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
  // en partida competitiva la barra lleva el acto y la ventaja en dos recuadros;
  // fuera de la partida vuelve a su aspecto normal
  const enArena = app.modo === 'competitive' && ['playing', 'paused', 'countdown'].includes(nombre);
  if (el.topbar) el.topbar.classList.toggle('competitivo', enArena);
  if (el.compVentaja) el.compVentaja.hidden = !enArena;
  if (el.stage && !enArena) {
    delete el.stage.dataset.fase;
    delete el.stage.dataset.rango;
  }
  if (!app.juego) actualizarEfectos(null);
  if (el.arena) {
    el.arena.hidden = !enArena;
    if (!el.arena.hidden) ajustarArena();
  }
  // el lienzo de un solo tablero sólo se aparta cuando manda la arena
  if (el.canvas) el.canvas.hidden = !el.arena.hidden;
  if (el.cuenta && nombre !== 'countdown') el.cuenta.hidden = true;
  actualizarReloj(app.juego);
  if (antes !== nombre) taparPantalla();
  actualizarPista();
  if (rutas.listas && !rutas.restaurando) sincronizarRuta(false);
}

const PISTAS = {
  home: 'hintHome',
  modes: 'hintModes',
  settings: 'hintSettings',
  levels: 'hintLevels',
  help: 'hintHelp',
  paused: 'hintPaused',
  dead: 'hintDead',
  cleared: 'hintCleared',
};

function actualizarPista() {
  if (app.pantalla === 'playing') {
    el.hint.textContent = esTactil()
      ? t('hintSwipe')
      : t(turboPermitido() ? 'hintGameTurbo' : 'hintGame');
    return;
  }
  el.hint.textContent = PISTAS[app.pantalla] ? t(PISTAS[app.pantalla]) : '';
}

const ALIAS_RUTA = routeWords();

function coincideRuta(segmento, clave) {
  return (ALIAS_RUTA[clave] || []).includes(segmento);
}

function rutaActual() {
  let camino = location.pathname;
  try {
    camino = decodeURIComponent(camino);
  } catch (error) {
    // Usamos la ruta sin decodificar si contiene escapes inválidos.
  }
  camino = camino.replace(/\/+$/, '');
  if (camino === '/snake' || camino === '/' || camino === '') return [];
  if (camino.startsWith('/snake/')) camino = camino.slice('/snake/'.length);
  else if (camino.startsWith('/')) camino = camino.slice(1);
  return camino.split('/').filter(Boolean).map((parte) => parte.toLowerCase());
}

function pantallaDeRuta() {
  const partes = rutaActual();
  const [primera, segunda] = partes;
  if (!primera) return { tipo: 'home' };

  if (coincideRuta(primera, 'modes')) {
    const grupo = coincideRuta(segunda || '', 'campaign') ? 0
      : coincideRuta(segunda || '', 'competitive') ? 2 : 1;
    return { tipo: 'modes', grupo };
  }
  if (coincideRuta(primera, 'help')) return { tipo: 'help' };
  if (coincideRuta(primera, 'settings')) return { tipo: 'settings' };
  if (coincideRuta(primera, 'profile')) return { tipo: 'profile' };
  if (coincideRuta(primera, 'campaign')) {
    const nivel = /^(?:nivel|level)-?(\d{1,2})$/.exec(segunda || '');
    return nivel
      ? { tipo: 'campaign-level', nivel: Number(nivel[1]) - 1 }
      : { tipo: 'levels' };
  }
  for (const modo of ['classic', 'frenzy', 'hunter', 'timed', 'competitive']) {
    if (coincideRuta(primera, modo)) return { tipo: 'game', modo };
  }
  if (coincideRuta(primera, 'endless')) return { tipo: 'modes', grupo: 1 };
  if (coincideRuta(primera, 'competitive')) return { tipo: 'modes', grupo: 2 };
  return { tipo: 'home' };
}

function rutaDeEstado() {
  if (app.pantalla === 'home') return BASE_PATH;
  if (app.pantalla === 'modes') {
    const grupo = app.grupo === 0 ? 'campaign' : app.grupo === 2 ? 'competitive' : 'endless';
    return `${BASE_PATH}${routeSlug('modes')}/${routeSlug(grupo)}`;
  }
  if (app.pantalla === 'help') return `${BASE_PATH}${routeSlug('help')}`;
  if (app.pantalla === 'settings') return `${BASE_PATH}${routeSlug('settings')}`;
  if (app.pantalla === 'profile') return `${BASE_PATH}${routeSlug('profile')}`;
  if (app.pantalla === 'levels') return `${BASE_PATH}${routeSlug('campaign')}`;
  if (['compmenu', 'preview', 'countdown', 'won', 'dead'].includes(app.pantalla)
    && app.modo === 'competitive') {
    return `${BASE_PATH}${routeSlug('competitive')}`;
  }
  if (app.modo === 'campaign') {
    return `${BASE_PATH}${routeSlug('campaign')}/nivel-${dosDigitos(app.nivel + 1)}`;
  }
  return `${BASE_PATH}${routeSlug(app.modo)}`;
}

function sincronizarRuta(reemplazar = false) {
  if (location.protocol === 'file:') return;
  const destino = `${rutaDeEstado()}${location.hash}`;
  const actual = `${location.pathname}${location.search}${location.hash}`;
  if (actual === destino) return;
  const metodo = reemplazar ? 'replaceState' : 'pushState';
  history[metodo]({ snake: true }, '', destino);
}

function mostrarRuta(ruta) {
  if (ruta.tipo === 'modes') {
    mostrarModos(ruta.grupo);
  } else if (ruta.tipo === 'levels') {
    mostrarNiveles();
  } else if (ruta.tipo === 'help') {
    mostrarAyuda();
  } else if (ruta.tipo === 'settings') {
    mostrarAjustes('modes');
  } else if (ruta.tipo === 'profile') {
    mostrarPerfil();
  } else if (ruta.tipo === 'game' && ruta.modo === 'competitive') {
    menuCompetitivo();
  } else if (ruta.tipo === 'game') {
    empezarPartida(ruta.modo, 0);
  } else if (ruta.tipo === 'campaign-level') {
    if (ruta.nivel >= 0 && ruta.nivel < LEVELS.length && ruta.nivel < guardado.campaign.unlocked) {
      empezarPartida('campaign', ruta.nivel);
    } else if (ruta.nivel >= 0 && ruta.nivel < LEVELS.length) {
      mostrarNiveles();
    } else {
      mostrarInicio();
    }
  } else {
    mostrarInicio();
  }
}

function restaurarRuta() {
  rutas.restaurando = true;
  mostrarRuta(pantallaDeRuta());
  rutas.restaurando = false;
  rutas.listas = true;
  sincronizarRuta(true);
}

window.addEventListener('popstate', () => {
  rutas.restaurando = true;
  mostrarRuta(pantallaDeRuta());
  rutas.restaurando = false;
  sincronizarRuta(true);
});

/* ---------------------------------------------------------- marcador */

function actualizarMarcador() {
  const juego = app.juego;
  if (!juego) {
    actualizarEfectos(null);
    return;
  }

  const esCampana = app.modo === 'campaign';
  if (el.combo) el.combo.hidden = esCampana;

  let meta;
  let valor;
  let marca;
  if (esCampana) {
    const nivel = LEVELS[app.nivel];
    const recogidas = Math.min(juego.fruits, nivel.goal);
    const restantes = Math.max(0, nivel.goal - recogidas);
    valor = puntos(recogidas);
    meta = t('campaignLevel', {
      number: dosDigitos(app.nivel + 1),
      name: levelName(nivel.name),
    }) + (nivel.mods && nivel.mods.length
      ? ' · ' + nivel.mods.map((m) => t('mod_' + m)).join(' + ')
      : '');
    marca = t('applesRemaining', { count: restantes, unit: appleUnit(restantes) });
    el.mult.textContent = appleUnit(recogidas);
    el.mult.classList.remove('activo');
    el.chain.style.width = '0%';
    delete el.meta.dataset.fase;
  } else {
    valor = puntos(juego.score);
    marca = t('best', { score: mejorActual() });
    const mult = juego.multiplier;
    el.mult.textContent = mult > 1 ? `×${mult}` : '';
    el.mult.classList.toggle('activo', mult > 1);
    el.chain.style.width = `${((juego.chainTimer / juego.chainWindow) * 100 || 0).toFixed(1)}%`;
    // en contrarreloj la meta es el reloj; en competitivo, cuántos quedan vivos
    if (app.modo === 'timed') {
      const s = Math.max(0, Math.ceil(juego.timeLeft / 1000));
      meta = t('timeLeft', { s });
      el.meta.classList.toggle('urgente', s <= 10 && juego.state === 'running');
    } else if (app.modo === 'competitive') {
      // el hueco libre de la barra superior: acto, recta final y ventaja.
      // nada de carteles encima de los tableros.
      const fase = faseDeRonda();
      const final = app.tiempoPartida <= 10000;
      const nombre = final
        ? t('phaseFinal')
        : t(fase.id === 'presion' ? 'phasePressure' : fase.id === 'sprint' ? 'phaseSprint' : 'phaseOpening');
      meta = `${nombre} ×${fase.boost}`;
      el.meta.dataset.fase = final ? 'final' : fase.id;
      const jugador = app.tableros[0];
      const ventaja = jugador ? textoVentaja(jugador, ordenCompetitivo()) : '';
      const lider = !!jugador && jugador.puesto === 1 && jugador.juego.score > 0;
      // la ventaja deja la barra pequeña y pasa a la banda grande de estado
      marca = '';
      if (el.compVentaja) {
        const estado = lider ? 'lider' : 'persigue';
        if (el.compVentaja.dataset.estado !== estado) el.compVentaja.dataset.estado = estado;
        const rango = String(nivelDeRango());
        if (el.compVentaja.dataset.rango !== rango) el.compVentaja.dataset.rango = rango;
        const texto = ventaja || t('compTied');
        if (el.compVentajaTexto.textContent !== texto) el.compVentajaTexto.textContent = texto;
        const detalle = jugador
          ? `${rankName(guardado.competitive.points)} · #${jugador.puesto} · ${puntos(jugador.juego.score)}`
          : '';
        if (el.compVentajaDetalle.textContent !== detalle) el.compVentajaDetalle.textContent = detalle;
        if (el.compPublico) {
          const cuenta = Number(el.compPublico.dataset.cuenta) || 0;
          const etiqueta = t('compCrowd', { count: cuenta });
          if (el.compPublico.getAttribute('aria-label') !== etiqueta) {
            el.compPublico.setAttribute('aria-label', etiqueta);
          }
        }
      }
      el.best.classList.toggle('vivo', lider);
      el.meta.classList.remove('urgente');
      if (el.best.title) el.best.removeAttribute('title');
    } else {
      meta = t('fruitScore', { mode: modeName(app.modo), fruits: juego.fruits, unit: fruitUnit(juego.fruits) });
      el.meta.classList.remove('urgente');
      delete el.meta.dataset.fase;
      el.best.classList.remove('vivo');
    }
  }
  if (app.modo !== 'timed') el.meta.classList.remove('urgente');

  if (el.score.textContent !== valor) el.score.textContent = valor;
  if (el.meta.textContent !== meta) el.meta.textContent = meta;
  if (el.best.textContent !== marca) el.best.textContent = marca;
  if (esCampana) el.mult.setAttribute('aria-label', appleUnit(juego.fruits));
  else el.mult.removeAttribute('aria-label');
  if (app.modo !== 'competitive' && el.best.title) el.best.removeAttribute('title');

  el.senal.classList.toggle('visible', juego.state === 'ready');
  el.pause.textContent = t(app.pantalla === 'paused' ? 'resume' : 'pause');
  el.pause.title = t(app.pantalla === 'paused' ? 'resumeTitle' : 'pauseTitle');
  el.pause.disabled = app.pantalla !== 'playing' && app.pantalla !== 'paused';

  actualizarReloj(juego);
  actualizarEfectos(juego);
}

// el reloj grande tiene su propio hueco: el tablero se encoge para no taparse
let reservaReloj = 0;

function reservarReloj(visible) {
  const nodo = el.reloj;
  if (!nodo) return;
  nodo.hidden = !visible;
  el.stage.classList.toggle('con-reloj', visible);
  reservaReloj = visible
    ? Math.max(0, Math.round(nodo.getBoundingClientRect().height || 0) + 8)
    : 0;
  el.stage.style.paddingTop = reservaReloj ? `${reservaReloj}px` : '';
  ajustarLienzo();
}

// contrarreloj: el tiempo va en grande encima del tablero (también si el
// modificador de una arena competitiva es el reloj)
function actualizarReloj(juego) {
  const nodo = el.reloj;
  if (!nodo) return;
  const ronda = app.modo === 'competitive' && app.tableros.length > 0;
  const conReloj = ronda || (juego && juego.cfg && juego.cfg.timeAttack && app.modo === 'timed');
  const visible = !!conReloj && (app.pantalla === 'playing' || app.pantalla === 'paused');
  if (nodo.hidden === visible || el.stage.classList.contains('con-reloj') !== visible) {
    reservarReloj(visible);
  }
  if (!visible) return;
  const s = ronda
    ? Math.max(0, Math.ceil((app.tiempoPartida || 0) / 1000))
    : Math.max(0, Math.ceil(juego.timeLeft / 1000));
  const cifra = nodo.querySelector('b');
  if (cifra && cifra.textContent !== String(s)) cifra.textContent = String(s);
  const fase = faseDeRonda();
  nodo.classList.toggle('sprint', ronda && fase.id === 'sprint');
  if (el.relojFase) {
    const texto = ronda ? `×${fase.boost}` : '';
    if (el.relojFase.textContent !== texto) el.relojFase.textContent = texto;
  }
  nodo.classList.toggle('urgente', s <= 10 && juego.state === 'running');
  nodo.classList.toggle('parado', juego.state !== 'running');
}

function actualizarEfectos(juego) {
  const activos = [];
  if (juego) {
    if (juego.fx.ghost > 0) activos.push([t('ghost'), juego.fx.ghost / POWER_INFO.ghost.ms]);
    if (juego.fx.slow > 0) activos.push([t('slow'), juego.fx.slow / POWER_INFO.slow.ms]);
    if (juego.fx.shield > 0) activos.push([t('shield'), juego.fx.shield / POWER_INFO.shield.ms]);
    if (juego.fx.double > 0) activos.push([t('double'), juego.fx.double / POWER_INFO.double.ms]);
    if (juego.turbo && app.modo !== 'hunter') activos.push([t('turboEffect'), 1]);
    if (juego.cfg && juego.cfg.hunter && juego.hunter && juego.hunterPelea) {
      const tope = juego.cfg.hunterCap || 18;
      const umbral = juego.hunterUmbral();
      const largo = juego.hunter.body.length;
      activos.push([t('hunted'), largo >= tope ? 1 : (largo - umbral) / Math.max(1, tope - umbral)]);
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

// desplaza la capa abierta: las flechas también mueven la UI en zonas de scroll
function desplazarUI(paso, repetido = false) {
  const caja = el.overlay;
  if (!caja || !caja.classList.contains('abierto')) return false;
  const salto = repetido
    ? Math.max(18, Math.round((caja.clientHeight || 480) * 0.07))
    : Math.max(60, Math.round((caja.clientHeight || 480) * 0.32));
  const antes = caja.scrollTop;
  const tope = Math.max(0, caja.scrollHeight - caja.clientHeight);
  caja.scrollTop = Math.max(0, Math.min(tope, antes + paso * salto));
  return caja.scrollTop !== antes;
}

function llevarALaVista(nodo) {
  const caja = el.overlay;
  if (!caja || !caja.classList.contains('abierto') || typeof nodo.getBoundingClientRect !== 'function') {
    if (nodo && typeof nodo.scrollIntoView === 'function') {
      try {
        nodo.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      } catch (err) {
        /* sin scroll, no pasa nada */
      }
    }
    return;
  }
  const cajaRect = caja.getBoundingClientRect();
  const nodoRect = nodo.getBoundingClientRect();
  const margen = Math.min(84, Math.max(24, (cajaRect.height || 480) * 0.12));
  if (nodoRect.top < cajaRect.top + margen) {
    caja.scrollTop -= cajaRect.top + margen - nodoRect.top;
  } else if (nodoRect.bottom > cajaRect.bottom - margen) {
    caja.scrollTop += nodoRect.bottom - (cajaRect.bottom - margen);
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
  llevarALaVista(lista[foco.indice]);
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
  if (app.pantalla === 'modes') return todos.filter((b) => b.dataset.modo !== undefined || b.dataset.accion === 'settings');
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
  llevarALaVista(boton);
}

// flechas: recorren el anillo de la pantalla; en la rejilla, ↑↓ saltan de fila
function moverFoco(dx, dy, repetido = false) {
  const anillo = anilloFoco();
  if (!anillo.length) return;
  // con un solo botón (ayuda, perfil) las flechas mueven la propia capa
  if (anillo.length === 1 && desplazarUI(dy || dx, repetido)) return;
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

function descripcion(modo) {
  if (modo === 'campaign') {
    return t('campaignDescription', { cleared: guardado.campaign.unlocked - 1 });
  }
  return modeTag(modo);
}

function valorDerecha(modo) {
  if (modo === 'campaign') return `${guardado.campaign.unlocked - 1}/${LEVELS.length}`;
  const mejor = guardado.best[modo] || 0;
  return mejor ? String(mejor) : '—';
}

function resumenGrupo(indice) {
  const grupo = GROUPS[indice];
  if (indice === 0) return `${guardado.campaign.unlocked - 1}/${LEVELS.length}`;
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
    <span class="row-name">${modeName(modo)}<small>${descripcion(modo)}</small></span>
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
      <span class="row-name">${groupName(i)}<small>${groupTag(i)}${grupo.modes.length > 1 ? ` · ${grupo.modes.length} ${t('modes')}` : ''}</small></span>
      <span class="row-right">${resumenGrupo(i)}</span>
    </button>`).join('');

  ponerOverlay(`<div class="panel inicio portada">
    <div class="inicio-texto">
      <header class="inicio-cabeza">
        <h1 class="marca"><canvas id="marca" role="img" aria-label="snake"></canvas></h1>
        <p class="kicker">${t('menuSubtitle')}</p>
      </header>
      <nav class="filas" aria-label="${t('groupAria')}">${filas}</nav>
      <p class="pie">
        <button class="link" type="button" data-accion="help">${t('controls')}</button>
        <button class="link" type="button" data-accion="profile">${t('profile')}</button>
      </p>
    </div>
    <aside class="inicio-demo">
      <p class="kicker" id="demo-titulo">${t('preview')}</p>
      <canvas id="demo" aria-label="${t('preview')}"></canvas>
      <p class="nota" id="demo-nota">${t('previewGroupHint')}</p>
    </aside>
  </div>`);

  el.score.textContent = '—';
  el.meta.textContent = t('chooseGroup');
  el.best.textContent = '';
  el.mult.textContent = '';
  el.chain.style.width = '0%';
  el.pause.disabled = true;
  el.pause.textContent = t('pause');
  el.pause.title = t('pauseTitle');
  el.senal.classList.remove('visible');
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
    `<button class="tab${i === app.grupo ? ' sel' : ''}" type="button" data-tab="${i}">${groupName(i)}</button>`).join('');

  ponerOverlay(`<div class="panel modos">
    <div class="niveles-cabeza">
      <div>
        <p class="kicker">${t('menuNumber', { number: dosDigitos(app.grupo + 1) })}</p>
        <h2>${groupName(app.grupo)}</h2>
      </div>
      <button class="ghost" type="button" data-accion="home">${t('groups')} <kbd>esc</kbd></button>
    </div>
    <nav class="tabs" aria-label="${t('switchGroup')}">${tabs}</nav>
    <div class="modos-cuerpo">
      <div>
        <nav class="filas" aria-label="${t('modes')}">${filas}</nav>
        <p class="pie"><button class="link" type="button" data-accion="settings">${t('settings')}</button></p>
      </div>
      <aside class="inicio-demo">
        <p class="kicker" id="demo-titulo">${t('preview')}</p>
        <canvas id="demo" aria-label="${t('previewMode')}"></canvas>
        <p class="nota" id="demo-nota"></p>
      </aside>
    </div>
    <p class="pie"><span>${t('chooseMode')}</span></p>
  </div>`);

  el.score.textContent = '—';
  el.meta.textContent = groupName(app.grupo);
  el.best.textContent = '';
  el.mult.textContent = '';
  el.chain.style.width = '0%';
  el.pause.disabled = true;
  el.pause.textContent = t('pause');
  el.pause.title = t('pauseTitle');
  el.senal.classList.remove('visible');
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
  else if (modo === 'competitive') menuCompetitivo();
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
  el.meta.textContent = t('campaign');
  el.best.textContent = '';
  el.mult.textContent = '';
  el.chain.style.width = '0%';
  el.pause.disabled = true;
  el.pause.textContent = t('pause');
  el.pause.title = t('pauseTitle');
  el.senal.classList.remove('visible');
}

function pintarNiveles() {
  el.score.textContent = '—';
  el.meta.textContent = t('campaign');
  el.best.textContent = '';
  el.mult.textContent = '';
  el.chain.style.width = '0%';
  el.pause.disabled = true;
  el.pause.textContent = t('pause');
  el.pause.title = t('pauseTitle');
  el.senal.classList.remove('visible');

  const celdas = LEVELS.map((nivel, i) => {
    const bloqueado = i >= guardado.campaign.unlocked;
    const hecho = i < guardado.campaign.unlocked - 1;
    return `<button class="celda${bloqueado ? ' bloqueada' : ''}${hecho ? ' hecha' : ''}"
      type="button" data-nivel="${i}"${bloqueado ? ' aria-disabled="true"' : ''}>
      <span class="celda-top"><span class="celda-num">${dosDigitos(i + 1)}</span>${hecho ? '<span class="celda-tick">✓</span>' : ''}</span>
      <span class="celda-nombre">${bloqueado ? '· · ·' : levelName(nivel.name)}</span>
      <span class="celda-meta">${bloqueado ? t('blocked') : t('fruits', { count: nivel.goal, unit: appleUnit(nivel.goal) })}</span>
    </button>`;
  }).join('');

  ponerOverlay(`<div class="panel niveles">
    <div class="niveles-cabeza">
      <div>
        <p class="kicker">${t('campaign')} · ${t('campaignProgress', { cleared: guardado.campaign.unlocked - 1, total: LEVELS.length })}</p>
        <h2>${t('chooseLevel')}</h2>
      </div>
      <button class="ghost" type="button" data-accion="modos">${t('groups')} <kbd>esc</kbd></button>
    </div>
    <div class="niveles-cuerpo">
      <div class="rejilla">${celdas}</div>
      <aside class="vistazo">
        <canvas id="preview" aria-label="${t('preview')}"></canvas>
        <p class="kicker" id="vistazo-nombre"></p>
        <p class="nota" id="vistazo-datos"></p>
      </aside>
    </div>
    <p class="pie"><span>${t('levelControls')}</span></p>
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
  if (nombre) nombre.textContent = t('levelNumberName', { number: dosDigitos(indice + 1), name: levelName(nivel.name) });
  if (datos) {
    datos.textContent = t('levelPreviewData', {
      goal: nivel.goal,
      speed: nivel.speed,
      unit: appleUnit(nivel.goal),
    });
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
  el.score.textContent = '—';
  el.meta.textContent = t('controls');
  el.best.textContent = '';
  el.mult.textContent = '';
  el.chain.style.width = '0%';
  el.pause.disabled = true;
  el.pause.textContent = t('pause');
  el.pause.title = t('pauseTitle');
  el.senal.classList.remove('visible');

  ponerOverlay(`<div class="panel ayuda">
    <div class="niveles-cabeza">
      <div>
        <p class="kicker">${t('helpTitle')}</p>
        <h2>${t('helpHeading')}</h2>
      </div>
      <button class="ghost" type="button" data-accion="home">${t('back')}</button>
    </div>
    <table class="tabla">
      <tbody>
        <tr><th>${t('turn')}</th><td>${t('turnKeys')}</td></tr>
        <tr><th>${t('turbo')}</th><td>${t('turboKeys')}</td></tr>
        <tr><th>${t('pauseHelp')}</th><td>${t('pauseKeys')}</td></tr>
        <tr><th>${t('restart')}</th><td>${t('restartKeys')}</td></tr>
        <tr><th>${t('menus')}</th><td>${t('menuKeys')}</td></tr>
      </tbody>
    </table>
    <p class="kicker">${t('gameRules')}</p>
    <ul class="reglas">
      <li>${t('ruleChain')}</li>
      <li>${t('rulePoison')}</li>
      <li>${t('ruleCampaign')}</li>
      <li>${t('ruleModes')}</li>
      <li>${t('ruleHunter')}</li>
      <li>${t('ruleTimed')}</li>
      <li>${t('ruleCompetitive')}</li>
      <li>${t('ruleMods')}</li>
      <li>${t('powerBasics')}</li>
      <li>${t('powerAdvanced')}</li>
    </ul>
  </div>`);
  pantalla('help');
  enfocarPrimero('button[data-accion="home"]');
}

function ajustesDesde() {
  if (app.settingsReturn === 'modes') mostrarModos(app.grupo);
  else mostrarInicio();
}

function mostrarAjustes(desde = app.pantalla, focoInicial = 'button[data-accion="settingsBack"]') {
  app.settingsReturn = desde === 'home' ? 'home' : 'modes';
  pararTemporizador();
  app.juego = null;
  app.demo = null;

  const sonido = guardado.sound;
  const trama = guardado.crt;
  const botonEstado = (activo) => t(activo ? 'enabled' : 'disabled');

  ponerOverlay(`<div class="panel niveles">
    <div class="niveles-cabeza">
      <h2>${t('settings')}</h2>
      <button class="ghost" type="button" data-accion="settingsBack">${t('back')} <kbd>esc</kbd></button>
    </div>
    <nav class="filas" aria-label="${t('settings')}">
      <button class="row" type="button" data-accion="toggleSound" aria-pressed="${sonido}">
        <span class="row-idx">01</span>
        <span class="row-name">${t('sound')}</span>
        <span class="row-right">${botonEstado(sonido)}</span>
      </button>
      <button class="row" type="button" data-accion="crt" aria-pressed="${trama}">
        <span class="row-idx">02</span>
        <span class="row-name">${t('scanlines')}</span>
        <span class="row-right">${botonEstado(trama)}</span>
      </button>
      <button class="row" type="button" data-accion="wipe">
        <span class="row-idx">03</span>
        <span class="row-name">${t('clearRecords')}</span>
      </button>
    </nav>
  </div>`);

  el.score.textContent = '—';
  el.meta.textContent = t('settings');
  el.best.textContent = '';
  el.mult.textContent = '';
  el.chain.style.width = '0%';
  el.pause.disabled = true;
  el.pause.textContent = t('pause');
  el.pause.title = t('pauseTitle');
  el.senal.classList.remove('visible');
  pantalla('settings');
  enfocarPrimero(focoInicial);
}


/* ---------------------------------------------------------- perfil
   estadísticas globales de todo lo jugado */

function formatoTiempo(ms) {
  const total = Math.floor(Math.max(0, ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}h ${dosDigitos(m)}m` : `${m}m ${dosDigitos(s)}s`;
}

function mostrarPerfil() {
  pararTemporizador();
  app.juego = null;
  app.demo = null;
  const s = guardado.stats;
  const fila = (indice, nombre, valor) => `<div class="row stat">
    <span class="row-idx">${indice}</span>
    <span class="row-name">${nombre}</span>
    <span class="row-right">${valor}</span>
  </div>`;

  ponerOverlay(`<div class="panel niveles">
    <div class="niveles-cabeza">
      <div>
        <p class="kicker">${t('profileHint')}</p>
        <h2>${t('profileTitle')}</h2>
      </div>
      <button class="ghost" type="button" data-accion="home">${t('back')} <kbd>esc</kbd></button>
    </div>
    <div class="filas">
      ${fila('01', t('statsGames'), puntos(s.games))}
      ${fila('02', t('statsWins'), puntos(s.wins))}
      ${fila('03', t('statsFruits'), puntos(s.fruits))}
      ${fila('04', t('statsTime'), formatoTiempo(s.timeMs))}
      ${fila('05', t('statsChain'), `×${Math.max(1, s.bestChain)}`)}
      ${fila('06', t('statsBest'), puntos(mejorGlobal()))}
      ${fila('07', t('statsPoints'), puntos(guardado.competitive.points))}
      ${fila('08', t('statsRank'), rankName(guardado.competitive.points))}
    </div>
  </div>`);

  el.score.textContent = '—';
  el.meta.textContent = t('profile');
  el.best.textContent = '';
  el.mult.textContent = '';
  el.chain.style.width = '0%';
  el.pause.disabled = true;
  el.pause.textContent = t('pause');
  el.pause.title = t('pauseTitle');
  el.senal.classList.remove('visible');
  pantalla('profile');
  enfocarPrimero('button[data-accion="home"]');
}

/* ---------------------------------------------------------- partida */

/* ---------------------------------------------------------- competitivo
   partida rápida al estilo de siempre: mapa y modificador se sortean en cada
   partida (los mismos para todos), cada serpiente nace en su parcela y al
   final se ganan copas que suben de rango. */

// la escalera del competitivo: cada rango abre mapas más cerrados y deja
// entrar modificadores nuevos; la intensidad también sube peldaño a peldaño
const ESCALERA_ARENAS = [
  [2, 3, 4, 5],
  [4, 5, 6, 7],
  [6, 7, 8, 9, 10],
  [10, 11, 12, 13, 14, 15],
  [16, 17, 18, 19, 20, 21],
  [22, 23, 24, 25, 26, 27, 28, 29],
];
const ESCALERA_MODS = [
  ['muros'],
  ['muros', 'reloj'],
  ['muros', 'reloj', 'cazador'],
  ['muros', 'reloj', 'cazador', 'turbo'],
  ['muros', 'reloj', 'cazador', 'turbo', 'veneno'],
  ['muros', 'reloj', 'cazador', 'turbo', 'veneno'],
];
const COPAS_POR_PUESTO = [25, 10, 5, 0];
const BONO_POR_PUNTOS = { cada: 250, tope: 3 };

function elegir(lista) {
  return lista[Math.floor(Math.random() * lista.length)];
}

function nivelDeRango() {
  return rankInfo(guardado.competitive.points).nivel;
}

function arenasDelRango() {
  return ESCALERA_ARENAS[nivelDeRango()] || ESCALERA_ARENAS[0];
}

function modsDelRango() {
  return ESCALERA_MODS[nivelDeRango()] || ESCALERA_MODS[0];
}

function ajusteDeRango() {
  const nivel = nivelDeRango();
  const t = nivel / (ESCALERA_ARENAS.length - 1);
  return {
    startSpeed: Math.min(150, 130 + nivel * 4),
    wallFrom: Math.round(6 - 3 * t),
    wallEvery: Math.round(6 - 2 * t),
    wallMax: Math.round(8 + 6 * t),
    relojStart: Math.round(52000 - 12000 * t),
    hunterSight: Math.round(3 + 3 * t),
    hunterCap: Math.round(10 + 6 * t),
    venenoChance: Number((0.1 + 0.14 * t).toFixed(2)),
  };
}

function sortearArena() {
  const indice = elegir(arenasDelRango());
  return { indice, mods: [elegir(modsDelRango())] };
}

// cada tablero recibe la misma arena y el mismo modificador: la carrera es justa
function configuracionArena() {
  const nivel = LEVELS[app.arena.indice];
  const rango = ajusteDeRango();
  const cfg = {
    ...MODES.competitive,
    walls: nivel.walls.slice(),
    startSpeed: rango.startSpeed,
    mods: app.arena.mods.slice(),
  };
  if (app.arena.mods.includes('muros')) {
    Object.assign(cfg, { wallFrom: rango.wallFrom, wallEvery: rango.wallEvery, wallMax: rango.wallMax });
  }
  if (app.arena.mods.includes('reloj')) {
    cfg.timeAttack = { start: rango.relojStart, perFruit: 3200, max: 120000, rampMs: 60000 };
  }
  if (app.arena.mods.includes('cazador')) {
    Object.assign(cfg, { hunter: true, hunterPellets: 2, hunterCap: rango.hunterCap, hunterSight: rango.hunterSight });
  }
  if (app.arena.mods.includes('turbo')) cfg.noTurbo = true;
  // el veneno no está por defecto: entra como modificador sorteado
  if (app.arena.mods.includes('veneno')) cfg.veneno = { chance: rango.venenoChance, puntos: 20 };
  return cfg;
}


function configuracionSuelta(modo) {
  return { ...MODES[modo] };
}

function camposMods(datos) {
  return {
    ...(datos.mods ? { mods: datos.mods.slice() } : {}),
    ...(datos.noTurbo ? { noTurbo: true } : {}),
    ...(datos.timeAttack ? { timeAttack: datos.timeAttack } : {}),
    ...(datos.wallFrom ? {
      wallFrom: datos.wallFrom,
      wallEvery: datos.wallEvery,
      wallMax: datos.wallMax,
    } : {}),
    ...(datos.hunter ? {
      hunter: true,
      hunterPellets: datos.hunterPellets,
      hunterCap: datos.hunterCap,
      hunterSight: datos.hunterSight,
    } : {}),
  };
}

// una bonificación mínima por el marcador de la partida, además del puesto
function bonoPuntosCompetitivo() {
  const marcador = app.tableros[0] ? app.tableros[0].juego.score : app.juego ? app.juego.score : 0;
  return Math.min(BONO_POR_PUNTOS.tope, Math.floor(Math.max(0, marcador) / BONO_POR_PUNTOS.cada));
}

// copas de la partida: se suman una vez, al cerrar el resultado
// la subida de rango se celebra una vez, con el icono nuevo y sin llenar la pantalla
const CHISPAS_RANGO = [
  [-58, -26], [-40, 22], [-22, -40], [12, -36], [44, -24],
  [60, 8], [34, 30], [-30, 34], [6, 40], [-62, 2],
];

function bloqueSubidaRango(copas) {
  if (!copas || !copas.subio) return '';
  const info = rankInfo(copas.total);
  const antes = Number.isInteger(copas.nivelAntes) ? copas.nivelAntes : info.nivel;
  const chispas = CHISPAS_RANGO.map(([x, y], i) =>
    `<i style="--x:${x}px;--y:${y}px;--i:${i};--d:${120 + i * 24}ms"></i>`).join('');
  return `<div class="subida-rango" data-rango="${info.nivel}" role="status">
      <span class="subida-halo" aria-hidden="true"></span>
      <span class="subida-iconos" aria-hidden="true">
        <span class="subida-viejo">${iconoRango(antes)}</span>
        <b class="subida-flecha">→</b>
        <span class="subida-nuevo">${iconoRango(info.nivel)}</span>
      </span>
      <span class="subida-texto">
        <b>${t('rankUp')}</b>
        <strong>${copas.subio}</strong>
        <em>${puntos(copas.total)} ${t('statsPoints')}</em>
      </span>
      <span class="subida-chispas" aria-hidden="true">${chispas}</span>
    </div>`;
}

function copasDePartida(puesto) {
  if (!app.copas) {
    const antes = guardado.competitive.points;
    const infoAntes = rankInfo(antes);
    const rangoAntes = infoAntes.nombre;
    const base = COPAS_POR_PUESTO[Math.min(3, Math.max(0, (puesto || 4) - 1))] || 0;
    const bono = bonoPuntosCompetitivo();
    const ganadas = base + bono;
    guardado.competitive.points = Math.max(0, antes + ganadas);
    guardar();
    const infoAhora = rankInfo(guardado.competitive.points);
    const rangoAhora = infoAhora.nombre;
    app.copas = {
      base,
      bono,
      ganadas,
      total: guardado.competitive.points,
      subio: rangoAhora !== rangoAntes ? rangoAhora : '',
      nivelAntes: infoAntes.nivel,
      nivelAhora: infoAhora.nivel,
    };
  }
  return app.copas;
}

/* ---------------------------------------------------------- competitivo
   cuatro tableros separados, uno por serpiente: el mismo mapa, el mismo
   modificador y la misma dificultad para todos. gana quien aguanta más. */

const TOTAL_TABLEROS = 4;
const DURACION_RONDA = 60000; // 60 s por partida
const CASTIGO_CAIDA = 10; // puntos que se pierden al chocar
const GRACIA_MS = 1800; // protección al volver de una caída

// tres actos de 20 s: la recta final paga el doble, así que hay que elegir
// cuándo arriesgar la racha y cuándo guardarla
const FASES_RONDA = [
  { id: 'apertura', boost: 1 },
  { id: 'presion', boost: 1.5 },
  { id: 'sprint', boost: 2 },
];

function faseDeRonda() {
  const restante = Number(app.tiempoPartida) || 0;
  if (restante > 40000) return FASES_RONDA[0];
  if (restante > 20000) return FASES_RONDA[1];
  return FASES_RONDA[2];
}

function aplicarFase() {
  const fase = faseDeRonda();
  const cambio = app.fase !== fase.id;
  app.fase = fase.id;
  for (const tab of app.tableros) tab.juego.cfg.scoreBoost = fase.boost;
  if (el.relojFase) el.relojFase.textContent = `×${fase.boost}`;
  // la luz del escenario sigue al acto: blanco tenue, presión y recta final roja
  if (el.stage) el.stage.dataset.fase = app.tiempoPartida <= 10000 ? 'final' : fase.id;
  // el cambio de acto se marca en la barra de arriba, sin tapar ningún tablero;
  // el aviso de verdad vive en el marcador en vivo de cada tablero
  if (cambio && app.pantalla === 'playing') {
    parpadear(el.meta);
    if (fase.id === 'sprint') audio.play('turbo');
    else if (fase.id === 'presion') audio.play('power');
  }
}

function ordenCompetitivo() {
  return [...app.tableros].sort((a, b) => b.juego.score - a.juego.score || a.i - b.i);
}

function textoVentaja(jugador, orden) {
  if (!jugador || !orden.length) return '';
  if (!orden.some((tab) => tab.juego.score > 0)) return '';
  const puesto = jugador.puesto || orden.length;
  if (puesto === 1) {
    const segundo = orden[1];
    if (segundo && Math.abs(segundo.juego.score - jugador.juego.score) < 0.5) return t('compTied');
    return t('compLead');
  }
  const delante = orden[puesto - 2];
  if (!delante) return '';
  const diferencia = Math.max(0, Math.round(delante.juego.score - jugador.juego.score));
  if (diferencia < 1) return t('compTied');
  return t('compGap', { count: diferencia, place: `#${puesto - 1}` });
}

// variable interna: con el rango suben la reacción y la puntería, pero la
// velocidad es exactamente la misma que la tuya. no se enseña en el menú.
const DIFICULTAD_RIVALES = [
  { cada: 190, fallo: 0.26 }, // bronce
  { cada: 175, fallo: 0.22 }, // plata
  { cada: 160, fallo: 0.18 }, // oro
  { cada: 145, fallo: 0.14 }, // platino
  { cada: 130, fallo: 0.1 }, // diamante
  { cada: 115, fallo: 0.06 }, // maestro
];

function dificultadRivales(nivel) {
  const i = Math.max(0, Math.min(DIFICULTAD_RIVALES.length - 1, Number(nivel) || 0));
  return DIFICULTAD_RIVALES[i];
}

// el icono del rango: una figura de bloques distinta por cada peldaño
const DIBUJOS_RANGO = [
  ['.....', '.....', '.###.', '.###.', '.....'], // bronce
  ['.....', '..#..', '.###.', '..#..', '.....'], // plata
  ['..#..', '.###.', '#####', '.###.', '..#..'], // oro
  ['#...#', '.#.#.', '..#..', '.#.#.', '#...#'], // platino
  ['.###.', '#...#', '#...#', '#...#', '.###.'], // diamante
  ['#.#.#', '#####', '#####', '.###.', '..#..'], // maestro
];

// la grada crece con el rango: más bloques de público en la banda de estado
const PUBLICO_POR_RANGO = [4, 6, 8, 10, 13, 16];

function bloquesPublico(nivel) {
  const n = Math.max(0, Math.min(PUBLICO_POR_RANGO.length - 1, Math.floor(Number(nivel) || 0)));
  const total = PUBLICO_POR_RANGO[n];
  return {
    total,
    html: Array.from({ length: total }, (_, i) =>
      `<i style="--i:${i};--d:${i * 70}ms"></i>`).join(''),
  };
}

function pintarPublico(nivel) {
  if (!el.compPublico) return;
  const { total, html } = bloquesPublico(nivel);
  if (el.compPublico.dataset.cuenta === String(total)) return;
  el.compPublico.innerHTML = html;
  el.compPublico.dataset.cuenta = String(total);
  el.compPublico.setAttribute('aria-label', t('compCrowd', { count: total }));
}

function iconoRango(nivel) {
  const n = Math.max(0, Math.min(DIBUJOS_RANGO.length - 1, Math.floor(Number(nivel) || 0)));
  let celdas = '';
  let indice = 0;
  for (const fila of DIBUJOS_RANGO[n]) {
    for (const celda of fila) {
      const lleno = celda === '#';
      celdas += `<i${lleno ? ` class="lleno" style="--i:${indice};--d:${140 + indice * 18}ms"` : ''}></i>`;
      indice++;
    }
  }
  return `<span class="rango-icono" data-rango="${n}" aria-hidden="true">${celdas}</span>`;
}

function nombreTablero(i) {
  return i === 0 ? t('you') : RIVAL_NAMES[i - 1];
}

function tableroPorIndice(i) {
  return app.tableros.find((tab) => tab.i === i) || null;
}

// menú previo: rango, copas y reglas del modo
function menuCompetitivo() {
  pararTemporizador();
  app.juego = null;
  app.demo = null;
  app.tableros = [];
  app.arena = null;
  el.arena.hidden = true;

  const puntosYa = guardado.competitive.points;
  const info = rankInfo(puntosYa);
  const meta = info.siguiente
    ? t('pointsToNext', { count: info.falta, rank: info.siguiente })
    : t('maxRank');
  const tramo = info.tramo || 0;
  const avance = tramo > 0 ? Math.min(100, Math.round(((tramo - info.falta) / tramo) * 100)) : 100;
  const dato = (valor, etiqueta) => `<div class="comp-dato"><b>${valor}</b><span>${etiqueta}</span></div>`;
  const grada = bloquesPublico(info.nivel);

  // la escalera de rangos: los seis peldaños, con el actual enmarcado
  const escalera = rankList().map((r) => {
    const clase = r.nivel === info.nivel ? ' aqui' : r.nivel < info.nivel ? ' hecho' : '';
    const actual = r.nivel === info.nivel ? ' aria-current="step"' : '';
    return `<span class="escalon${clase}" title="${r.nombre} · ${r.puntos}"${actual}>${iconoRango(r.nivel)}<em>${r.nombre}</em><small>${r.puntos}</small></span>`;
  }).join('');

  ponerOverlay(`<div class="panel competitivo">
    <div class="comp-top">
      <span>${t('modeCompetitive')}</span>
      <span>${t('compBoards')}</span>
    </div>
    <div class="comp-cabeza">
      ${iconoRango(info.nivel)}
      <div class="comp-datos">
        <p class="comp-rango">${t('compYourRank')} · ${info.nombre}</p>
        <p class="comp-puntos">${puntos(puntosYa)}<small>${t('statsPoints')}</small></p>
      </div>
    </div>
    <div class="comp-barra" aria-hidden="true"><i style="width:${avance}%"></i></div>
    <p class="comp-nota">${meta}</p>
    <p class="comp-escala">${t('compRankScale')}</p>
    <div class="comp-escalera">${escalera}</div>
    <div class="comp-mini">
      ${dato(puntos(guardado.stats.games), t('labelGames'))}
      ${dato(puntos(guardado.stats.wins), t('labelWins'))}
      ${dato('60<small>s</small>', t('labelRound'))}
    </div>
    <div class="comp-fases" aria-label="${t('compActs')}">
      <span><b>×1</b><i>20 s · ${t('phaseOpening')}</i></span>
      <span><b>×1.5</b><i>20 s · ${t('phasePressure')}</i></span>
      <span><b>×2</b><i>20 s · ${t('phaseSprint')}</i></span>
    </div>
    <p class="comp-rivales"><span>${t('compRivals')}</span><span>${RIVAL_NAMES.join(' · ')}</span></p>
    <p class="comp-grada"><span>${t('compCrowd', { count: grada.total })}</span><span class="comp-grada-bloques" aria-hidden="true">${grada.html}</span></p>
    <p class="comp-reglas"><span>60 s</span><span>${t('compDrop')}</span><span>${t('compProtected')}</span></p>
    <div class="acciones">
      <button class="principal" type="button" data-accion="jugarCompetitivo">${t('play')} <kbd>↵</kbd></button>
      <button type="button" data-accion="home">${t('back')} <kbd>esc</kbd></button>
    </div>
  </div>`);

  el.score.textContent = '—';
  el.meta.textContent = t('modeCompetitive');
  el.best.textContent = info.nombre;
  el.mult.textContent = '';
  el.chain.style.width = '0%';
  el.pause.disabled = true;
  el.senal.classList.remove('visible');
  pantalla('compmenu');
  enfocarPrimero('button[data-accion="jugarCompetitivo"]');
}

// sorteo: mapa y modificador, los mismos para los cuatro tableros. los nombres
// giran unos instantes, se fijan con un golpe de bloque y la partida arranca sola
function prepararCompetitivo() {
  pararTemporizador();
  app.juego = null;
  app.demo = null;
  app.tableros = [];
  app.modo = 'competitive';
  app.arena = sortearArena();
  el.arena.hidden = true;

  const nivel = LEVELS[app.arena.indice];
  const mod = app.arena.mods[0];
  const nombres = arenasDelRango().map((i) => levelName(LEVELS[i].name));
  const azar = (lista) => lista[Math.floor(Math.random() * lista.length)];

  ponerOverlay(`<div class="panel sorteo">
    <p class="sorteo-etiqueta">${t('competitiveDraw')}</p>
    <div class="sorteo-caja">
      <p class="sorteo-mapa girando" id="sorteo-mapa">${azar(nombres)}</p>
      <p class="sorteo-mod girando" id="sorteo-mod">${t('mod_' + azar(modsDelRango()))}</p>
    </div>
    <div class="sorteo-linea" aria-hidden="true"><i></i></div>
    <p class="sorteo-pie">${t('compBoards')} · ${t('compActs')} · 60 s</p>
  </div>`);

  el.meta.textContent = t('modeCompetitive');
  el.best.textContent = '';
  el.score.textContent = '—';
  el.pause.disabled = true;
  el.senal.classList.remove('visible');
  pantalla('preview');

  const mapa = document.getElementById('sorteo-mapa');
  const modo = document.getElementById('sorteo-mod');
  const fijar = () => {
    if (mapa) {
      mapa.textContent = levelName(nivel.name);
      mapa.classList.remove('girando');
      mapa.classList.add('fija');
    }
    if (modo) {
      modo.textContent = t('mod_' + mod);
      modo.classList.remove('girando');
      modo.classList.add('fija');
    }
    el.best.textContent = `${levelName(nivel.name)} · ${t('mod_' + mod)}`;
    audio.play('tick');
  };

  if (sinMovimiento()) {
    fijar();
    app.temporizador = setTimeout(() => {
      app.temporizador = 0;
      if (app.pantalla === 'preview') empezarCompetitivo();
    }, 1100);
    return;
  }

  // ruleta corta: cambia de nombre sin saltos y luego se queda el sorteado
  let vueltas = 0;
  app.sorteoRuleta = setInterval(() => {
    vueltas++;
    if (vueltas >= 11) {
      clearInterval(app.sorteoRuleta);
      app.sorteoRuleta = 0;
      fijar();
      return;
    }
    if (mapa) mapa.textContent = azar(nombres);
    if (modo) modo.textContent = t('mod_' + azar(modsDelRango()));
  }, 85);

  // sin botón: la ruleta se fija y empieza la cuenta atrás
  app.temporizador = setTimeout(() => {
    app.temporizador = 0;
    if (app.sorteoRuleta) {
      clearInterval(app.sorteoRuleta);
      app.sorteoRuleta = 0;
    }
    if (app.pantalla === 'preview') empezarCompetitivo();
  }, 2050);
}

// cuatro tableros iguales, cada uno con su serpiente
function empezarCompetitivo() {
  pararTemporizador();
  audio.unlock();
  if (!app.arena) app.arena = sortearArena();
  app.modo = 'competitive';
  app.copas = null;
  app.puestoMuerte = 0;
  app.motivoMuerte = null;
  app.record = false;
  app.tableros = [];
  app.fase = null;
  ponerOverlay(null);

  const nivelRivales = rankInfo(guardado.competitive.points).nivel;
  const dificultad = dificultadRivales(nivelRivales);
  // el rango no sólo cambia la dificultad: también llena la grada y sube la luz
  pintarPublico(nivelRivales);
  if (el.compVentaja) el.compVentaja.dataset.rango = String(nivelRivales);
  if (el.stage) el.stage.dataset.rango = String(nivelRivales);
  for (let i = 0; i < TOTAL_TABLEROS; i++) {
    // misma velocidad, mismo mapa y mismo modificador para los cuatro
    const cfg = { ...configuracionArena(), graciaMs: GRACIA_MS };
    const juego = new Game(
      cfg,
      i === 0 ? eventosJuego : (tipo, datos) => eventoRival(i, tipo, datos),
    );
    app.tableros.push({
      i,
      nombre: nombreTablero(i),
      esJugador: i === 0,
      juego,
      vivo: true,
      puesto: 0,
      acum: 0,
      cada: i === 0 ? 0 : dificultad.cada,
      fallo: i === 0 ? 0 : dificultad.fallo,
    });
  }
  app.juego = app.tableros[0].juego;
  app.marca = mejorActual();
  app.cuenta = 3000;
  app.tiempoPartida = DURACION_RONDA;
  aplicarFase();

  el.arena.hidden = false;
  pantalla('countdown');
  ajustarLienzo();
  actualizarTableros();
  actualizarMarcador();
  for (const tab of app.tableros) tab.revivirEn = 0;
}

// la cuenta atrás pinta 3 · 2 · 1 sobre el tablero
function pasoCuenta(dt) {
  if (app.cuenta <= 0) return false;
  const antes = Math.ceil(app.cuenta / 1000);
  app.cuenta -= dt;
  const ahora = Math.max(0, Math.ceil(app.cuenta / 1000));
  if (ahora !== antes) audio.play('tick');
  if (el.cuenta) {
    el.cuenta.hidden = false;
    const cifra = el.cuenta.querySelector('b');
    const texto = String(Math.max(1, ahora));
    if (cifra && cifra.textContent !== texto) cifra.textContent = texto;
  }
  if (app.cuenta <= 0) {
    if (el.cuenta) el.cuenta.hidden = true;
    for (const tab of app.tableros) tab.juego.start();
    aplicarFase();
    pantalla('playing');
    actualizarMarcador();
  }
  return true;
}

function eventoRival(i, tipo, datos) {
  const tab = tableroPorIndice(i);
  if (!tab) return;
  if (tipo === 'die') {
    perderPuntos(tab);
    audio.play('rivalDie');
    parpadear(el.tableros[i]);
    actualizarTableros();
  }
}

// un paso de los cuatro tableros: los rivales deciden y todos avanzan igual
function pasoCompetitivo(dt) {
  if (pasoCuenta(dt)) {
    // durante la cuenta atrás ya se ve tu serpiente en su tablero
    dibujarArena();
    actualizarTableros();
    return;
  }
  if (app.pantalla !== 'playing') return;

  app.tiempoPartida = Math.max(0, app.tiempoPartida - dt);
  aplicarFase();
  if (app.tiempoPartida <= 0) {
    dibujarArena();
    actualizarTableros();
    actualizarReloj(app.juego);
    terminarCompetitivo();
    return;
  }

  for (const tab of app.tableros) {
    const juego = tab.juego;
    if (juego.state === 'dead') {
      tab.revivirEn = Math.max(0, (tab.revivirEn || 0) - dt);
      if (tab.revivirEn <= 0 && app.tiempoPartida > 1500) juego.revive();
    }
    if (!tab.esJugador && juego.state === 'running') {
      tab.acum += dt;
      if (tab.acum >= (tab.cada || 60)) {
        tab.acum = 0;
        juego.decidir({ error: tab.fallo || 0 });
      }
    }
    juego.update(dt);
  }
  dibujarArena();
  actualizarTableros();
  actualizarMarcador();
  if (app.tableros[0].juego.state === 'running') {
    guardado.stats.timeMs += dt;
    app.statsAcum += dt;
    if (app.statsAcum > 5000) {
      app.statsAcum = 0;
      guardar();
    }
  }
}

function dibujarArena() {
  for (const tab of app.tableros) {
    const fig = el.tableros[tab.i];
    if (!fig || !tab.vista) continue;
    const lienzo = fig.querySelector('canvas');
    if (!lienzo || !tab.pincel) continue;
    tab.juego.draw(tab.pincel, tab.vista);
  }
}

function actualizarTableros() {
  const orden = ordenCompetitivo();
  orden.forEach((tab, k) => { tab.puesto = k + 1; });

  app.tableros.forEach((tab) => {
    const fig = el.tableros[tab.i];
    if (!fig) return;
    if (tab.nombre !== fig.dataset.nombre) {
      fig.dataset.nombre = tab.nombre;
      const nombre = fig.querySelector('.tablero-nombre');
      if (nombre) nombre.textContent = tab.nombre;
    }
    fig.classList.toggle('mio', tab.esJugador);
    fig.classList.toggle('caido', !tab.vivo);
    fig.classList.toggle('lider', tab.puesto === 1 && tab.juego.score > 0);

    const puesto = fig.querySelector('.tablero-puesto');
    if (puesto) {
      const texto = `#${tab.puesto}`;
      if (puesto.textContent !== texto) puesto.textContent = texto;
    }

    const datos = fig.querySelector('.tablero-datos');
    if (datos) {
      const texto = String(Math.round(tab.juego.score));
      if (datos.textContent !== texto) datos.textContent = texto;
    }
    fig.classList.toggle('revive', tab.juego.state === 'dead');

    const protegido = tab.juego.gracia > 0;
    fig.classList.toggle('protegido', protegido);
    const estado = fig.querySelector('.tablero-estado');
    if (estado) {
      const texto = protegido ? t('compProtected') : '';
      if (estado.textContent !== texto) estado.textContent = texto;
    }
  });
}

function vivosCompetitivo() {
  return app.tableros.filter((tab) => tab.vivo).length;
}

// caer cuesta puntos y la serpiente vuelve al rato
function perderPuntos(tab) {
  if (!tab) return;
  tab.juego.score = Math.max(0, tab.juego.score - CASTIGO_CAIDA);
  tab.caidas = (tab.caidas || 0) + 1;
  tab.revivirEn = 800;
}

// fin de la ronda: manda quien tenga más puntos
function terminarCompetitivo() {
  if (app.pantalla !== 'playing') return;
  const orden = [...app.tableros].sort((a, b) => b.juego.score - a.juego.score);
  app.puestoMuerte = orden.findIndex((tab) => tab.esJugador) + 1;
  app.totalMuerte = TOTAL_TABLEROS;
  guardarMarca();
  guardado.stats.games++;
  guardar();
  audio.play('level');
  mostrarFinCompetitivo();
}

function configuracion(modo, nivel) {
  if (modo !== 'campaign') return configuracionSuelta(modo);
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
    scoring: false,
    bonusEvery: datos.bonusEvery,
    powerEvery: datos.powerEvery,
    powerPool: datos.powerPool,
    chainWindow: datos.chainWindow,
    // modificadores asignados al mapa: muros que salen, reloj, cazador, sin turbo
    ...camposMods(datos),
  };
}

function empezarPartida(modo, nivel = 0) {
  if (modo === 'competitive') {
    menuCompetitivo();
    return;
  }
  pararTemporizador();
  audio.unlock();
  app.demo = null;
  app.modo = modo;
  app.nivel = nivel;
  app.record = false;
  app.motivoMuerte = null;
  app.copas = null;
  app.arena = modo === 'competitive' ? sortearArena() : null;
  app.juego = new Game(configuracion(modo, nivel), eventosJuego);
  app.marca = mejorActual();

  ponerOverlay(null);
  pantalla('playing');
  ajustarLienzo();
  actualizarMarcador();
}

function eventosJuego(tipo, datos) {
  switch (tipo) {
    case 'start':
      audio.play('start');
      break;
    case 'eat':
      audio.play('bite', datos);
      parpadear(el.score);
      guardado.stats.fruits++;
      break;
    case 'combo':
      guardado.stats.bestChain = Math.max(guardado.stats.bestChain, datos.multiplier || 1);
      break;
    case 'tick':
      audio.play('tick');
      break;
    case 'veneno':
      audio.play('alerta');
      parpadear(el.meta);
      parpadear(el.score);
      break;
    case 'win':
      audio.play('win');
      guardarMarca();
      guardado.stats.games++;
      guardado.stats.wins++;
      guardar();
      app.temporizador = setTimeout(mostrarVictoria, 700);
      break;
    case 'bonus':
      audio.play('bonus');
      parpadear(el.score);
      break;
    case 'power':
      audio.play('power', datos);
      parpadear(el.score);
      break;
    case 'shield':
      audio.play('shield', datos);
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
    case 'wave':
      audio.play('bonus');
      parpadear(el.score);
      break;
    case 'pulse':
      audio.play('turbo');
      break;
    case 'wallSoon':
      audio.play('alerta');
      break;
    case 'pellet':
      audio.play('pellet');
      parpadear(el.score);
      parpadear(el.mult);
      break;
    case 'bite':
      audio.play('hunterEat');
      parpadear(el.score);
      parpadear(el.mult);
      break;
    case 'hunterHunt':
      audio.play('alerta');
      parpadear(el.meta);
      break;
    case 'hunterDies':
      audio.play('hunterDies');
      parpadear(el.score);
      break;
    case 'combo':
      audio.play('combo', datos);
      parpadear(el.mult);
      break;
    case 'die':
      audio.play('death');
      guardarMarca();
      guardado.stats.games++;
      guardar();
      app.motivoMuerte = datos.reason;
      if (app.modo === 'competitive') {
        perderPuntos(app.tableros[0]);
        parpadear(el.score);
        parpadear(el.tableros[0]);
        break;
      }
      app.temporizador = setTimeout(mostrarFin, 900);
      break;
    case 'clear':
      audio.play(app.nivel >= LEVELS.length - 1 ? 'campaignComplete' : 'level');
      guardarMarca();
      guardado.stats.games++;
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
  if (!juego || app.modo === 'campaign') return;
  guardado.best[app.modo] = Math.max(guardado.best[app.modo] || 0, juego.score);
  guardar();
}

function resumenManzanas(juego) {
  const objetivo = LEVELS[app.nivel].goal;
  const recogidas = Math.min(juego.fruits, objetivo);
  const restantes = Math.max(0, objetivo - recogidas);
  return t('campaignRunSummary', {
    collected: recogidas,
    remaining: restantes,
  });
}

function mostrarFin() {
  const juego = app.juego;
  if (!juego || juego.state !== 'dead') return;
  const esCampana = app.modo === 'campaign';
  app.record = !esCampana && juego.score > app.marca;
  let meta;
  if (esCampana && app.motivoMuerte === 'tiempo') {
    meta = `${t('timeUp')} · ${resumenManzanas(juego)}`;
  } else if (esCampana) {
    meta = resumenManzanas(juego);
  } else if (app.modo === 'timed' && app.motivoMuerte === 'tiempo') {
    meta = `${t('timeUp')} · ${t('fruits', { count: juego.fruits, unit: fruitUnit(juego.fruits) })}`;
  } else {
    meta = t('recordFruitMeta', {
      record: Math.max(app.marca, juego.score),
      fruits: juego.fruits,
      unit: fruitUnit(juego.fruits),
    });
  }
  const cifra = esCampana ? puntos(juego.fruits) : puntos(juego.score);

  ponerOverlay(`<div class="panel fin">
    <div class="fin-cabeza">
      <p class="kicker">${t(!esCampana && app.record ? 'recordNew' : 'end')}</p>
      <p class="cifra" data-cifra>${cifra}</p>
      <p class="nota">${meta}</p>
    </div>
    <div class="acciones">
      <button class="principal" type="button" data-accion="retry">${t('retry')} <kbd>R</kbd></button>
      <button type="button" data-accion="home">${t('menu')} <kbd>esc</kbd></button>
    </div>
  </div>`);
  pantalla('dead');
  if (!esCampana) animarCifra(el.overlay.querySelector('[data-cifra]'), juego.score);
  enfocarPrimero('button[data-accion="retry"]');
  el.pause.disabled = true;
  el.senal.classList.remove('visible');
  actualizarMarcador();
}

function mostrarNivelSuperado() {
  const juego = app.juego;
  if (!juego || juego.state !== 'cleared') return;
  const ultimo = app.nivel >= LEVELS.length - 1;

  // nivel superado: solo el aviso y los botones, sin resumen de manzanas
  ponerOverlay(`<div class="panel fin">
    <div class="fin-cabeza">
      <p class="cifra superado">${t('levelCleared', { number: dosDigitos(app.nivel + 1) })}</p>
      ${ultimo ? `<p class="nota">${t('campaignComplete')}</p>` : ''}
    </div>
    <div class="acciones">
      ${ultimo ? '' : `<button class="principal" type="button" data-accion="next">${t('next')} <kbd>↵</kbd></button>`}
      <button${ultimo ? ' class="principal"' : ''} type="button" data-accion="retry">${t('repeat')} <kbd>R</kbd></button>
      <button type="button" data-accion="home">${t('menu')} <kbd>esc</kbd></button>
    </div>
  </div>`);
  pantalla('cleared');
  enfocarPrimero('button.principal');
  el.pause.disabled = true;
  el.senal.classList.remove('visible');
}

function mostrarFinCompetitivo() {
  const juego = app.juego;
  if (!juego) return;
  const puesto = app.puestoMuerte || TOTAL_TABLEROS;
  const copas = copasDePartida(puesto);
  app.record = juego.score > app.marca;
  const notas = [
    t('competitiveRank', { rank: puesto, total: TOTAL_TABLEROS }),
    t('pointsWon', { count: copas.ganadas }),
    rankName(copas.total),
  ];
  if (copas.bono > 0) notas.push(t('pointsBonus', { count: copas.bono }));
  const orden = ordenCompetitivo();
  const podio = orden.map((tab, i) => `<li class="${tab.esJugador ? 'tu' : ''}"><b>#${i + 1}</b><span>${tab.nombre}</span><em>${puntos(tab.juego.score)}</em></li>`).join('');
  const caidas = (app.tableros[0] && app.tableros[0].caidas) || 0;
  const resumen = [
    t('fruits', { count: juego.fruits, unit: fruitUnit(juego.fruits) }),
    t('compChain', { count: juego.mejorRacha || 1 }),
    t('compFalls', { count: caidas }),
  ].join(' · ');
  ponerOverlay(`<div class="panel fin">
    <div class="fin-cabeza">
      <p class="kicker">${t('end')}</p>
      <p class="cifra" data-cifra>${puntos(juego.score)}</p>
      <p class="nota">${notas.join(' · ')}</p>
    </div>
    ${bloqueSubidaRango(copas)}
    <ol class="podio">${podio}</ol>
    <p class="nota comp-resumen">${resumen}</p>
    <div class="acciones">
      <button class="principal" type="button" data-accion="retry">${t('retry')} <kbd>R</kbd></button>
      <button type="button" data-accion="jugarCompetitivo">${t('redraw')}</button>
      <button type="button" data-accion="home">${t('menu')} <kbd>esc</kbd></button>
    </div>
  </div>`);
  pantalla('dead');
  animarCifra(el.overlay.querySelector('[data-cifra]'), juego.score);
  enfocarPrimero('button[data-accion="retry"]');
  el.pause.disabled = true;
  el.senal.classList.remove('visible');
}

// victoria — los tres rivales han caído y tú sigues en pie
function mostrarVictoria() {
  const juego = app.juego;
  if (!juego || juego.state !== 'running') return;
  const caidos = TOTAL_TABLEROS - 1;
  const copas = copasDePartida(1);
  const copasTexto = `${t('pointsWon', { count: copas.ganadas })}${copas.bono > 0 ? ` · ${t('pointsBonus', { count: copas.bono })}` : ''} · ${rankName(copas.total)}`;
  ponerOverlay(`<div class="panel fin">
    <div class="fin-cabeza">
      <p class="kicker">${t('win')} · ${t('competitiveWin')}</p>
      <p class="cifra" data-cifra>${puntos(juego.score)}</p>
      <p class="nota">${t('fruits', { count: juego.fruits, unit: fruitUnit(juego.fruits) })} · ${t('competitiveDown', { count: caidos })}</p>
      <p class="nota">${copasTexto}</p>
    </div>
    ${bloqueSubidaRango(copas)}
    <div class="acciones">
      <button class="principal" type="button" data-accion="retry">${t('retry')} <kbd>R</kbd></button>
      <button type="button" data-accion="home">${t('menu')} <kbd>esc</kbd></button>
    </div>
  </div>`);
  pantalla('won');
  animarCifra(el.overlay.querySelector('[data-cifra]'), juego.score);
  enfocarPrimero('button[data-accion="retry"]');
  el.pause.disabled = true;
  el.senal.classList.remove('visible');
  actualizarMarcador();
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
  // si el tablero no repinta a tiempo, al menos queda la cifra buena
  setTimeout(() => {
    if (nodo.isConnected) nodo.textContent = puntos(objetivo);
  }, duracion + 80);
}

/* ---------------------------------------------------------- pausa */

function mostrarPausa() {
  const juego = app.juego;
  if (!juego) return;
  const esCampana = app.modo === 'campaign';
  const cifra = puntos(esCampana ? juego.fruits : juego.score);
  const nota = esCampana
    ? resumenManzanas(juego)
    : t('fruitsRecord', {
      fruits: juego.fruits,
      record: Math.max(app.marca, juego.score),
      unit: fruitUnit(juego.fruits),
    });

  ponerOverlay(`<div class="panel fin">
    <div class="fin-cabeza">
      <p class="kicker">${t('paused')}</p>
      <p class="cifra">${cifra}</p>
      <p class="nota">${nota}</p>
    </div>
    <div class="acciones">
      <button class="principal" type="button" data-accion="resume">${t('resume')} <kbd>P</kbd></button>
      <button type="button" data-accion="retry">${t('restart')} <kbd>R</kbd></button>
      <button type="button" data-accion="home">${t('menu')} <kbd>esc</kbd></button>
    </div>
  </div>`);
  enfocarPrimero('button[data-accion="resume"]');
  el.pause.textContent = t('resume');
  el.pause.title = t('resumeTitle');
  el.pause.disabled = false;
  el.senal.classList.remove('visible');
}

function pausar() {
  if (!app.juego || app.pantalla !== 'playing') return;
  for (const tab of app.tableros) tab.juego.pause();
  app.juego.pause();
  if (app.juego.state !== 'paused') return;
  audio.play('ui');
  pantalla('paused');
  mostrarPausa();
}

function reanudar() {
  if (!app.juego) return;
  for (const tab of app.tableros) tab.juego.resume();
  app.juego.resume();
  ponerOverlay(null);
  foco.indice = -1;
  pantalla('playing');
  el.pause.textContent = t('pause');
  el.pause.title = t('pauseTitle');
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

function accion(nombre, repetido = false) {
  if (nombre === 'mute') {
    alternarSonido();
    return;
  }

  audio.unlock();


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
    el.hint.textContent = t('gamepadConnected');
    return;
  }

  if (nombre === 'scrollUp' || nombre === 'scrollDown' || nombre === 'scrollTop' || nombre === 'scrollBottom') {
    const caja = el.overlay;
    if (!caja || !caja.classList.contains('abierto')) return;
    if (nombre === 'scrollTop') caja.scrollTop = 0;
    else if (nombre === 'scrollBottom') caja.scrollTop = caja.scrollHeight;
    else {
      const salto = repetido
        ? Math.max(28, Math.round(caja.clientHeight * 0.1))
        : Math.max(120, Math.round(caja.clientHeight * 0.8));
      caja.scrollTop += (nombre === 'scrollUp' ? -1 : 1) * salto;
    }
    return;
  }

  const esDireccion = ['up', 'down', 'left', 'right'].includes(nombre);

  if (app.pantalla === 'home') {
    if (nombre === 'up') moverFoco(0, -1, repetido);
    else if (nombre === 'down') moverFoco(0, 1, repetido);
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
    if (nombre === 'up') moverFoco(0, -1, repetido);
    else if (nombre === 'down') moverFoco(0, 1, repetido);
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

  if (app.pantalla === 'levels') {
    if (nombre === 'up') moverFoco(0, -1, repetido);
    else if (nombre === 'down') moverFoco(0, 1, repetido);
    else if (nombre === 'left') moverFoco(-1, 0, repetido);
    else if (nombre === 'right') moverFoco(1, 0, repetido);
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
      moverFoco(nombre === 'left' ? -1 : nombre === 'right' ? 1 : 0, nombre === 'up' ? -1 : nombre === 'down' ? 1 : 0, repetido);
    } else if (nombre === 'back' || nombre === 'pause' || nombre === 'confirm') mostrarInicio();
    return;
  }

  if (app.pantalla === 'settings') {
    if (nombre === 'up' || nombre === 'down' || nombre === 'left' || nombre === 'right') {
      moverFoco(nombre === 'left' ? -1 : nombre === 'right' ? 1 : 0, nombre === 'up' ? -1 : nombre === 'down' ? 1 : 0, repetido);
    } else if (nombre === 'confirm') activarFoco();
    else if (nombre === 'back' || nombre === 'pause') ajustesDesde();
    return;
  }

  if (app.pantalla === 'compmenu' || app.pantalla === 'preview') {
    if (esDireccion) {
      moverFoco(nombre === 'left' ? -1 : nombre === 'right' ? 1 : 0, nombre === 'up' ? -1 : nombre === 'down' ? 1 : 0, repetido);
      return;
    }
    if (app.pantalla === 'compmenu') {
      if (nombre === 'confirm') activarFoco();
      else if (nombre === 'jugarCompetitivo') prepararCompetitivo();
      else if (nombre === 'back' || nombre === 'pause') mostrarInicio();
      return;
    }
    // sorteo en marcha: no se puede cambiar, se espera a la cuenta atrás
    return;
  }

  if (app.pantalla === 'countdown') return;

  if (app.pantalla === 'won') {
    if (esDireccion) {
      moverFoco(nombre === 'left' ? -1 : nombre === 'right' ? 1 : 0, nombre === 'up' ? -1 : nombre === 'down' ? 1 : 0, repetido);
      return;
    }
    if (nombre === 'confirm') activarFoco();
    else if (nombre === 'restart') prepararCompetitivo();
    else if (nombre === 'back') mostrarInicio();
    return;
  }

  if (app.pantalla === 'paused' || app.pantalla === 'dead' || app.pantalla === 'cleared') {
    if (esDireccion) {
      moverFoco(nombre === 'left' ? -1 : nombre === 'right' ? 1 : 0, nombre === 'up' ? -1 : nombre === 'down' ? 1 : 0, repetido);
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
    if (app.modo === 'competitive') prepararCompetitivo();
    else if (app.juego) empezarPartida(app.modo, app.nivel);
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
      if (app.modo === 'competitive') prepararCompetitivo();
      else empezarPartida(app.modo, app.nivel);
      break;
    case 'jugarCompetitivo':
      prepararCompetitivo();
      break;
    case 'empezarCompetitivo':
      empezarCompetitivo();
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
      mostrarInicio();
      break;
    case 'help':
      mostrarAyuda();
      break;
    case 'profile':
      mostrarPerfil();
      break;
    case 'settings':
      mostrarAjustes(app.pantalla);
      break;
    case 'settingsBack':
      ajustesDesde();
      break;
    case 'toggleSound':
      alternarSonido();
      mostrarAjustes(app.settingsReturn, 'button[data-accion="toggleSound"]');
      break;
    case 'crt':
      guardado.crt = !guardado.crt;
      guardar();
      document.documentElement.classList.toggle('trama', guardado.crt);
      if (app.pantalla === 'settings') mostrarAjustes(app.settingsReturn, 'button[data-accion="crt"]');
      else mostrarInicio();
      break;
    case 'wipe':
      borrarRecords();
      break;
    default:
      break;
  }
}

function borrarRecords() {
  if (!window.confirm(t('eraseConfirm'))) return;
  guardado.best = { classic: 0, frenzy: 0, hunter: 0, timed: 0, competitive: 0 };
  guardado.campaign = { unlocked: 1 };
  guardado.competitive = { points: 0 };
  guardar();
  audio.play('ui');
  if (app.pantalla === 'settings') mostrarAjustes(app.settingsReturn, 'button[data-accion="wipe"]');
  else mostrarInicio();
}

/* ---------------------------------------------------------- sonido */

function aplicarSonido() {
  audio.set(guardado.sound);
  el.mute.classList.toggle('apagado', !guardado.sound);
  el.mute.setAttribute('aria-pressed', String(guardado.sound));
  el.mute.title = t(guardado.sound ? 'soundTitleOn' : 'soundTitleOff');
  el.mute.setAttribute('aria-label', el.mute.title);
}

function alternarSonido() {
  audio.unlock();
  guardado.sound = !guardado.sound;
  guardar();
  aplicarSonido();
  if (guardado.sound) audio.play('ui');
}

function aplicarIdiomaBase() {
  document.documentElement.lang = getLanguage();
  document.title = t('documentTitle');
  const descripcionPagina = document.getElementById('meta-description');
  if (descripcionPagina) descripcionPagina.content = t('description');
  document.querySelectorAll('[data-i18n]').forEach((nodo) => {
    nodo.textContent = t(nodo.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-title]').forEach((nodo) => {
    nodo.title = t(nodo.dataset.i18nTitle);
  });
  document.querySelectorAll('[data-i18n-aria]').forEach((nodo) => {
    nodo.setAttribute('aria-label', t(nodo.dataset.i18nAria));
  });
  if (el.lang) el.lang.value = getLanguage();
  const efectos = document.getElementById('effects');
  if (efectos) efectos.setAttribute('aria-label', t('activeEffects'));
  if (el.pause) el.pause.title = t(app.pantalla === 'paused' ? 'resumeTitle' : 'pauseTitle');
  aplicarSonido();
}

function cambiarIdioma() {
  setLanguage(el.lang.value);
  aplicarIdiomaBase();
  rutas.restaurando = true;
  if (app.pantalla === 'home') mostrarInicio();
  else if (app.pantalla === 'modes') mostrarModos(app.grupo);
  else if (app.pantalla === 'levels') pintarNiveles();
  else if (app.pantalla === 'help') mostrarAyuda();
  else if (app.pantalla === 'settings') mostrarAjustes(app.settingsReturn);
  else if (app.pantalla === 'playing') {
    actualizarPista();
    actualizarMarcador();
  } else if (app.pantalla === 'paused') {
    actualizarMarcador();
    mostrarPausa();
  } else if (app.pantalla === 'dead') mostrarFin();
  else if (app.pantalla === 'cleared') {
    mostrarNivelSuperado();
    actualizarMarcador();
  }
  rutas.restaurando = false;
  sincronizarRuta(true);
  if (el.lang && typeof el.lang.focus === 'function') el.lang.focus({ preventScroll: true });
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
    titulo.textContent = t('previewCampaign', { number: dosDigitos(indice + 1), name: levelName(nivel.name) });
    nota.textContent = contexto === 'grupo'
      ? t('campaignAt', { cleared: guardado.campaign.unlocked - 1, total: LEVELS.length })
      : t('nextCampaignLevel');
  } else {
    titulo.textContent = t('previewModeTitle', { mode: modeName(modo) });
    nota.textContent = contexto === 'grupo'
      ? t('enterForModes', { tag: modeTag(modo) })
      : modeTag(modo);
  }
}

function pasoDemo(dt) {
  const demo = app.demo;
  if (!demo) return;
  demo.update(dt);
  app.demoAcum += dt;
  if (app.demoAcum > 60) {
    app.demoAcum = 0;
    demo.decidir();
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
    if (grupo && grupo.modes.length === 1) {
      elegirModo(grupo.modes[0]);
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

el.lang.addEventListener('change', cambiarIdioma);

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

  pasoBarrido(dt);

  if (app.pantalla === 'home' || app.pantalla === 'modes') {
    pasoDemo(dt);
    dibujarMarca(dt);
  } else if (app.juego && app.modo === 'competitive' && app.tableros.length) {
    pasoCompetitivo(dt);
  } else if (app.juego) {
    app.juego.update(dt);
    app.juego.draw(pincel, vista);
    actualizarMarcador();
    // el perfil cuenta el tiempo realmente jugado (guardado de vez en cuando)
    if (app.juego.state === 'running') {
      guardado.stats.timeMs += dt;
      app.statsAcum += dt;
      if (app.statsAcum > 5000) {
        app.statsAcum = 0;
        guardar();
      }
    }
  }

  requestAnimationFrame(bucle);
}

function arrancar() {
  if (!comprobarPiezas()) return;

  document.documentElement.classList.toggle('trama', guardado.crt);
  aplicarIdiomaBase();
  restaurarRuta();
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
  window.__snake = { app, guardado, accion, ejecutar, empezarPartida, mostrarInicio, crearDemo, mostrarFin, mostrarNivelSuperado, mostrarVictoria };
  // rótulo: para poder mirarlo desde las pruebas
  window.__snake.marca = marca;
  window.__snake.serpientesMarca = SERPIENTES_NOMBRE;
  window.__snake.mejorGlobal = mejorGlobal;
  window.__snake.dibujarMarca = dibujarMarca;
}
