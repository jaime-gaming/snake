import { Game, POWER_INFO } from './engine.js?v=3';
import { MODES, LEVELS, GROUPS, MODE_ORDER, COLS, ROWS } from './levels.js?v=3';
import { audio } from './audio.js?v=3';
import { attachInput } from './input.js?v=3';
import { t, getLanguage, setLanguage, modeName, modeTag, groupName, groupTag, levelName, fruitUnit, routeSlug, routeWords } from './i18n.js?v=16';

const $ = (sel) => document.querySelector(sel);

// si algo se rompe, que se vea en pantalla en vez de quedarse en negro
function avisar(mensaje) {
  if (typeof window.__snakeFallo === 'function') window.__snakeFallo(mensaje);
}

function comprobarPiezas() {
  const faltan = [];
  // BORRAR-COMPETITIVO · retirado en v1.0; sólo quedan los modos publicados.
  if (!MODES || !MODES.classic || !MODES.frenzy || !MODES.hunter || MODES.competitive) faltan.push('modos');
  if (!Array.isArray(LEVELS) || LEVELS.length !== 20) faltan.push('niveles');
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
  canvas: $('#board'),
  overlay: $('#overlay'),
  prompt: $('#prompt'),
  meta: $('#hud-meta'),
  score: $('#hud-score'),
  best: $('#hud-best'),
  mult: $('#hud-mult'),
  chain: $('#chain-bar'),
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

function nuevoRegistro() {
  return {
    best: { classic: 0, frenzy: 0, hunter: 0 },
    campaign: { unlocked: 1, best: {} },
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
};

const rutas = { listas: false, restaurando: false };
const BASE_PATH = '/snake/';

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
  return app.pantalla === 'playing' && app.modo !== 'hunter';
}

function pararTemporizador() {
  if (app.temporizador) {
    clearTimeout(app.temporizador);
    app.temporizador = 0;
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

function ajustarLienzo() {
  const caja = el.stage.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  // si el contenedor aún no tiene tamaño (pestaña oculta, iframe recién creado),
  // tiramos de la ventana para no quedarnos con un tablero de 0 px
  const anchoCaja = caja.width || window.innerWidth || 480;
  const altoCaja = caja.height || Math.max(240, (window.innerHeight || 720) * 0.6);
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
  // BORRAR-COMPETITIVO · pantallas y audio del modo retirados para v1.0.
  if (antes !== nombre) taparPantalla();
  actualizarPista();
  if (rutas.listas && !rutas.restaurando) sincronizarRuta(false);
}

const PISTAS = {
  home: 'hintHome',
  modes: 'hintModes',
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
      : t(app.modo === 'hunter' ? 'hintGame' : 'hintGameTurbo');
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
    const grupo = coincideRuta(segunda || '', 'campaign') ? 0 : 1;
    return { tipo: 'modes', grupo };
  }
  if (coincideRuta(primera, 'help')) return { tipo: 'help' };
  if (coincideRuta(primera, 'campaign')) {
    const nivel = /^(?:nivel|level)-?(\d{1,2})$/.exec(segunda || '');
    return nivel
      ? { tipo: 'campaign-level', nivel: Number(nivel[1]) - 1 }
      : { tipo: 'levels' };
  }
  for (const modo of ['classic', 'frenzy', 'hunter']) {
    if (coincideRuta(primera, modo)) return { tipo: 'game', modo };
  }
  if (coincideRuta(primera, 'endless')) return { tipo: 'modes', grupo: 1 };
  return { tipo: 'home' };
}

function rutaDeEstado() {
  if (app.pantalla === 'home') return BASE_PATH;
  if (app.pantalla === 'modes') {
    const grupo = app.grupo === 0 ? 'campaign' : 'endless';
    return `${BASE_PATH}${routeSlug('modes')}/${routeSlug(grupo)}`;
  }
  if (app.pantalla === 'help') return `${BASE_PATH}${routeSlug('help')}`;
  if (app.pantalla === 'levels') return `${BASE_PATH}${routeSlug('campaign')}`;
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

  const valor = puntos(juego.score);
  if (el.score.textContent !== valor) el.score.textContent = valor;

  let meta;
  if (app.modo === 'campaign') {
    const nivel = LEVELS[app.nivel];
    meta = t('levelScore', {
      number: dosDigitos(app.nivel + 1),
      name: levelName(nivel.name),
      fruits: Math.min(juego.fruits, nivel.goal),
      goal: nivel.goal,
    });
  } else {
    meta = t('fruitScore', { mode: modeName(app.modo), fruits: juego.fruits, unit: fruitUnit(juego.fruits) });
  }
  if (el.meta.textContent !== meta) el.meta.textContent = meta;

  const marca = t('best', { score: mejorActual() });
  if (el.best.textContent !== marca) el.best.textContent = marca;

  const mult = juego.multiplier;
  const texto = mult > 1 ? `×${mult}` : '';
  if (el.mult.textContent !== texto) el.mult.textContent = texto;
  el.mult.classList.toggle('activo', mult > 1);

  el.chain.style.width = `${((juego.chainTimer / juego.chainWindow) * 100 || 0).toFixed(1)}%`;

  el.prompt.classList.toggle('visible', juego.state === 'ready');
  el.pause.textContent = t(app.pantalla === 'paused' ? 'resume' : 'pause');
  el.pause.title = t(app.pantalla === 'paused' ? 'resumeTitle' : 'pauseTitle');
  el.pause.disabled = app.pantalla !== 'playing' && app.pantalla !== 'paused';

  actualizarEfectos(juego);
}

function actualizarEfectos(juego) {
  const activos = [];
  if (juego) {
    if (juego.fx.ghost > 0) activos.push([t('ghost'), juego.fx.ghost / POWER_INFO.ghost.ms]);
    if (juego.fx.slow > 0) activos.push([t('slow'), juego.fx.slow / POWER_INFO.slow.ms]);
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
        <p class="tagline">${t('tagline')}</p>
        <p class="kicker">${t('gridSummary', { levels: LEVELS.length, modes: MODE_ORDER.length - 1 })}</p>
      </header>
      <nav class="filas" aria-label="${t('groupAria')}">${filas}</nav>
      <p class="pie">
        <button class="link" type="button" data-accion="help">${t('controls')}</button>
        <span aria-hidden="true">·</span>
        <button class="link" type="button" data-accion="crt">${t(guardado.crt ? 'hideGrid' : 'showGrid')}</button>
        <span aria-hidden="true">·</span>
        <button class="link" type="button" data-accion="wipe">${t('clearRecords')}</button>
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
      <nav class="filas" aria-label="${t('modes')}">${filas}</nav>
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
  el.prompt.classList.remove('visible');
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
  el.prompt.classList.remove('visible');

  const celdas = LEVELS.map((nivel, i) => {
    const bloqueado = i >= guardado.campaign.unlocked;
    const hecho = i < guardado.campaign.unlocked - 1;
    const marca = guardado.campaign.best[i] || 0;
    return `<button class="celda${bloqueado ? ' bloqueada' : ''}${hecho ? ' hecha' : ''}"
      type="button" data-nivel="${i}"${bloqueado ? ' aria-disabled="true"' : ''}>
      <span class="celda-top"><span class="celda-num">${dosDigitos(i + 1)}</span>${hecho ? '<span class="celda-tick">✓</span>' : ''}</span>
      <span class="celda-nombre">${bloqueado ? '· · ·' : levelName(nivel.name)}</span>
      <span class="celda-meta">${bloqueado ? t('blocked') : marca ? t('best', { score: marca }) : t('fruits', { count: nivel.goal, unit: fruitUnit(nivel.goal) })}</span>
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
    const marca = guardado.campaign.best[indice] || 0;
    datos.textContent = marca
      ? t('levelPreviewDataWithRecord', { goal: nivel.goal, speed: nivel.speed, record: marca, unit: fruitUnit(nivel.goal) })
      : t('levelPreviewData', { goal: nivel.goal, speed: nivel.speed, unit: fruitUnit(nivel.goal) });
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
  el.prompt.classList.remove('visible');

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
    <p class="kicker">${t('comingSoon')}</p>
    <ul class="reglas">
      <li>${t('ruleChain')}</li>
      <li>${t('ruleCampaign')}</li>
      <li>${t('ruleModes')}</li>
      <li>${t('ruleHunter')}</li>
    </ul>
  </div>`);
  pantalla('help');
  enfocarPrimero('button[data-accion="home"]');
}

// BORRAR-COMPETITIVO · rangos y salas eliminados en v1.0.

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
      guardarMarca();
      app.temporizador = setTimeout(mostrarFin, 900);
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
    ? t('levelGoalRecord', {
      goal: LEVELS[app.nivel].goal,
      record: Math.max(app.marca, juego.score),
      unit: fruitUnit(LEVELS[app.nivel].goal),
    })
    : t('recordFruitMeta', {
      record: Math.max(app.marca, juego.score),
      fruits: juego.fruits,
      unit: fruitUnit(juego.fruits),
    });

  ponerOverlay(`<div class="panel fin">
    <div class="fin-cabeza">
      <p class="kicker">${t(app.record ? 'recordNew' : 'end')}</p>
      <p class="cifra" data-cifra>${puntos(juego.score)}</p>
      <p class="nota">${meta}</p>
    </div>
    <div class="acciones">
      <button class="principal" type="button" data-accion="retry">${t('retry')} <kbd>R</kbd></button>
      <button type="button" data-accion="home">${t('menu')} <kbd>esc</kbd></button>
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
      <p class="kicker">${t('levelCleared', { number: dosDigitos(app.nivel + 1) })}</p>
      <p class="cifra" data-cifra>${puntos(juego.score)}</p>
      <p class="nota">${ultimo ? t('campaignComplete') : t('nextLevelMeta', { name: levelName(siguiente.name), goal: siguiente.goal, unit: fruitUnit(siguiente.goal) })}</p>
    </div>
    <div class="acciones">
      ${ultimo ? '' : `<button class="principal" type="button" data-accion="next">${t('next')} <kbd>↵</kbd></button>`}
      <button${ultimo ? ' class="principal"' : ''} type="button" data-accion="retry">${t('repeat')} <kbd>R</kbd></button>
      <button type="button" data-accion="home">${t('menu')} <kbd>esc</kbd></button>
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

function mostrarPausa() {
  const juego = app.juego;
  if (!juego) return;
  const cifra = puntos(juego.score);
  const nota = t('fruitsRecord', {
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
  el.prompt.classList.remove('visible');
}

function pausar() {
  if (!app.juego || app.pantalla !== 'playing') return;
  app.juego.pause();
  if (app.juego.state !== 'paused') return;
  audio.play('ui');
  pantalla('paused');
  mostrarPausa();
}

function reanudar() {
  if (!app.juego) return;
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

function accion(nombre) {
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
      mostrarInicio();
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
    default:
      break;
  }
}

function borrarRecords() {
  if (!window.confirm(t('eraseConfirm'))) return;
  guardado.best = { classic: 0, frenzy: 0, hunter: 0 };
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
  } else if (app.juego) {
    app.juego.update(dt);
    app.juego.draw(pincel, vista);
    actualizarMarcador();
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
  window.__snake = { app, guardado, accion, empezarPartida, mostrarInicio, crearDemo, mostrarFin };
  // rótulo: para poder mirarlo desde las pruebas
  window.__snake.marca = marca;
  window.__snake.serpientesMarca = SERPIENTES_NOMBRE;
  window.__snake.mejorGlobal = mejorGlobal;
  window.__snake.dibujarMarca = dibujarMarca;
}
