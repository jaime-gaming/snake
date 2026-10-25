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
  marcador: $('#marcador'), // BORRAR-COMPETITIVO
  best: $('#hud-best'),
  mult: $('#hud-mult'),
  chain: $('#chain-bar'),
  effects: $('#effects'),
  mute: $('#btn-mute'),
  pause: $('#btn-pause'),
  hint: $('#hint'),
  avisoFoco: $('#aviso-foco'),
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
  mapaComp: null, // BORRAR-COMPETITIVO
  modComp: null, // BORRAR-COMPETITIVO
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

function pararTemporizador() {
  if (app.temporizador) {
    clearTimeout(app.temporizador);
    app.temporizador = 0;
  }
}

/* ---------------------------------------------------------- lienzo */

function ajustarLienzo() {
  const caja = el.stage.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  // si el contenedor aún no tiene tamaño (pestaña oculta, iframe recién creado),
  // tiramos de la ventana para no quedarnos con un tablero de 0 px
  const anchoCaja = caja.width || window.innerWidth || 480;
  const altoCaja = caja.height || Math.max(240, (window.innerHeight || 720) * 0.6);
  // BORRAR-COMPETITIVO · con las minis abajo, el tablero les deja su franja
  const franja = app.comp && app.comp.activo && el.minis && !el.minis.hidden ? 96 : 0;
  // el tablero ocupa todo el hueco: celdas fraccionarias, sin bordes muertos
  const lado = Math.max(160, Math.min(anchoCaja, altoCaja - franja) - 2);
  const celda = lado / Math.max(COLS, ROWS);
  const ancho = lado;
  const alto = lado;

  el.canvas.style.width = `${ancho}px`;
  el.canvas.style.height = `${alto}px`;
  el.canvas.width = Math.round(ancho * dpr);
  el.canvas.height = Math.round(alto * dpr);
  Object.assign(vista, { cell: celda, ox: 0, oy: 0, width: ancho, height: alto, dpr });

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

function pantalla(nombre) {
  app.pantalla = nombre;
  document.body.dataset.screen = nombre;
  // BORRAR-COMPETITIVO · el marcador, el reloj y las minis sólo existen jugando
  if (nombre !== 'playing' && nombre !== 'paused') {
    if (el.marcador) el.marcador.hidden = true;
    if (el.reloj) el.reloj.hidden = true;
    if (el.minis) el.minis.hidden = true;
  }
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
  versus: 'enter empezar · R nueva partida · esc menú',
  'versus-fin': 'enter revancha · esc menú',
};

function actualizarPista() {
  if (app.pantalla === 'playing') {
    el.hint.textContent = esTactil()
      ? 'desliza para girar · toca para turbo'
      : 'espacio turbo · P pausa · R reiniciar · M sonido';
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
  el.pause.disabled = app.pantalla !== 'playing' && app.pantalla !== 'paused';

  actualizarEfectos(juego);
}

function actualizarEfectos(juego) {
  const activos = [];
  if (juego) {
    if (juego.fx.ghost > 0) activos.push(['fantasma', juego.fx.ghost / POWER_INFO.ghost.ms]);
    if (juego.fx.slow > 0) activos.push(['lento', juego.fx.slow / POWER_INFO.slow.ms]);
    if (juego.turbo) activos.push(['turbo', 1]);
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
    return `${info.nombre} ${info.dentro}/${COMPETITIVE.porRango}`;
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
      <span class="row-name">${grupo.name}<small>${grupo.tag} · ${grupo.modes.length} ${grupo.modes.length === 1 ? 'modo' : 'modos'}</small></span>
      <span class="row-right">${resumenGrupo(i)}</span>
    </button>`).join('');

  ponerOverlay(`<div class="panel inicio portada">
    <div class="inicio-texto">
      <header class="inicio-cabeza">
        <h1>snake<span class="dot">.</span></h1>
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
  else if (modo === 'competitive') mostrarCompetitivo();
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
        <tr><th>girar</th><td>flechas o WASD · desliza en móvil</td></tr>
        <tr><th>turbo</th><td>espacio o mayús · toca el tablero</td></tr>
        <tr><th>pausa</th><td>P o esc</td></tr>
        <tr><th>reiniciar</th><td>R</td></tr>
        <tr><th>menú</th><td>↑↓ grupo o modo · ←→ cambiar de grupo</td></tr>
        <tr><th>sonido</th><td>M</td></tr>
        <tr><th>mando</th><td>d-pad y sticks · A turbo · start pausa</td></tr>
      </tbody>
    </table>
    <p class="kicker">reglas</p>
    <ul class="reglas">
      <li>dos frutas seguidas suben el multiplicador hasta ×5</li>
      <li>cubo rojo hueco: caduca y alarga dos anillos</li>
      <li>cuadros blancos: fantasma, lento y recorte</li>
      <li>el fantasma atraviesa todo, también tu cuerpo</li>
      <li>el borde que mata se ve siempre</li>
      <li>campaña: la fruta que cierra el nivel es amarilla</li>
      <li>clásico: pasadas 30 frutas salen muros</li>
      <li>frenesí: los bordes dan la vuelta</li>
      <li>cazador: come puntos hasta 12 anillos y luego te caza</li>
      <li>cazador: su cuerpo no te mata; si choca contigo, revienta</li>
      <li>competitivo: 4 cuadrículas, 60 s, gana el que más puntos tiene</li>
      <li>competitivo: si te matas revives, pero pierdes un 20 %</li>
    </ul>
    <p class="pie"><span>osciladores y ruido en directo · sin ficheros de audio</span></p>
  </div>`);
  pantalla('help');
  enfocarPrimero('button[data-accion="home"]');
}

/* ------------------------------------------- competitivo (BORRAR-COMPETITIVO)
   modo temporal: 1 vs 1 vs 1 vs 1 contra bots, con mapa y modificador.
   para quitarlo entero:  grep -rn BORRAR-COMPETITIVO .
--------------------------------------------------------------------------- */

function textoRango(info) {
  return info.siguiente
    ? `${info.nombre} · ${info.dentro}/${COMPETITIVE.porRango} para ${info.siguiente}`
    : `${info.nombre} · rango máximo`;
}

function mostrarCompetitivo() {
  pararTemporizador();
  app.juego = null;
  app.demo = null;
  app.comp = null;
  app.mapaComp = mapaDePartida();
  app.modComp = modificadorDePartida();
  const info = rangoInfo(guardado.comp);

  // BORRAR-COMPETITIVO · siete bloques, sin listas ni párrafos
  const rangos = COMPETITIVE.rangos.map((nombre, i) => {
    const clase = i === info.rango ? ' aqui' : i < info.rango ? ' hecho' : '';
    return `<span class="bloque${clase}" title="${nombre}">${i + 1}</span>`;
  }).join('');

  ponerOverlay(`<div class="panel versus">
    <div class="niveles-cabeza">
      <div>
        <p class="kicker">competitivo · 4 jugadores · ${COMPETITIVE.tiempo / 1000} s</p>
        <h2>${info.nombre}</h2>
      </div>
      <button class="ghost" type="button" data-accion="modos">grupos <kbd>esc</kbd></button>
    </div>
    <div class="rangos" aria-label="rango ${info.nivel} de ${info.total}">${rangos}</div>
    <p class="nota">${info.siguiente ? `${info.falta} para ${info.siguiente}` : 'rango máximo'}</p>
    <div class="sellos">
      <span><b>mapa</b>${app.mapaComp.nombre}</span>
      <span><b>modificador</b>${app.modComp.nombre}</span>
      <span><b>rivales</b>${COMPETITIVE.bots.join(' · ')}</span>
    </div>
    <p class="pie"><span>1º +3 · 2º +1 · 3º −1 · 4º −2 · si te matas, −20 %</span></p>
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
  pantalla('versus');
  enfocarPrimero('button[data-accion="comp-start"]');
}

/* BORRAR-COMPETITIVO · las cuatro cuadrículas en directo */

function montarMinis() {
  if (!el.minis || !app.comp) return;
  const gente = app.comp.rivales.map((r) => ({ nombre: r.nombre, juego: r.juego }));
  el.minis.innerHTML = gente.map((p, i) => `<figure class="mini" data-i="${i}">
      <canvas aria-hidden="true"></canvas>
      <figcaption>${p.nombre}</figcaption>
    </figure>`).join('');
  el.minis.hidden = false;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  app.comp.minis = gente.map((p, i) => {
    const figura = el.minis.querySelector(`.mini[data-i="${i}"]`);
    const lienzo = figura.querySelector('canvas');
    const ancho = Math.round(figura.getBoundingClientRect().width) || 64;
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
      cap: figura.querySelector('figcaption'),
    };
  });
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
  }
}

function quitarMinis() {
  if (!el.minis) return;
  el.minis.hidden = true;
  el.minis.innerHTML = '';
  if (app.comp) app.comp.minis = null;
}

function avisarCastigo(mensaje) {
  if (!el.aviso) return;
  el.aviso.textContent = mensaje;
  el.aviso.classList.add('ver');
  clearTimeout(avisarCastigo.turno);
  avisarCastigo.turno = setTimeout(() => el.aviso.classList.remove('ver'), 1100);
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

function empezarCompetitivo() {
  if (!app.mapaComp) app.mapaComp = mapaDePartida();
  if (!app.modComp) app.modComp = modificadorDePartida();
  pararTemporizador();
  audio.unlock();
  audio.play('ui');
  app.demo = null;

  const cfg = configCompetitivo(app.mapaComp, app.modComp);
  app.comp = {
    activo: true,
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
  if (el.marcador) el.marcador.hidden = false;
  if (el.reloj) el.reloj.hidden = false;
  montarMinis();
  ajustarLienzo();
  pintarMarcador();
  actualizarMarcador();
}

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

function pintarMarcador() {
  const c = app.comp;
  if (!el.marcador || !c || !c.activo) return;
  const html = tablaCompetitivo(c).map((f, i) => {
    const clases = [f.yo ? 'propio' : '', f.vivo ? '' : 'fuera'].filter(Boolean).join(' ');
    return `<p${clases ? ` class="${clases}"` : ''}><span class="p">${i + 1}</span><span class="n">${f.nombre}</span><span class="s">${puntos(f.puntos)}</span></p>`;
  }).join('');
  if (el.marcador.dataset.huella !== html) {
    el.marcador.innerHTML = html;
    el.marcador.dataset.huella = html;
  }
}

function pasoCompetitivo(dt) {
  const c = app.comp;
  if (!c || !c.activo) return;
  c.restante = Math.max(0, c.restante - dt);
  app.juego.update(dt);
  for (const rival of c.rivales) {
    if (rival.juego.state === 'running') {
      rival.juego.botTurn();
      rival.juego.update(dt);
    }
  }
  pintarMarcador();
  if (c.restante <= 0) finCompetitivo();
}

function finCompetitivo() {
  const c = app.comp;
  if (!c || !c.activo) return;
  c.activo = false;
  pararTemporizador();

  const filas = tablaCompetitivo(c).map((f, i) => ({ ...f, puesto: i + 1 }));
  const yo = filas.find((f) => f.yo) || { puesto: filas.length };
  const delta = COMPETITIVE.premios[Math.min(COMPETITIVE.premios.length - 1, yo.puesto - 1)];
  const antes = rangoInfo(guardado.comp);
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
  c.resultado = { filas, puesto: yo.puesto, delta, antes, despues };
  const signo = delta > 0 ? `+${delta}` : String(delta);
  const titulo = yo.puesto === 1 ? 'has ganado' : `${yo.puesto}º de ${filas.length}`;
  const movimiento = cambio.sube
    ? `asciendes a ${despues.nombre}`
    : cambio.baja
      ? `bajas a ${despues.nombre}`
      : textoRango(despues);

  const tabla = filas.map((f) => `<li${f.yo ? ' class="propio"' : ''}>
      <span class="p">${f.puesto}</span>
      <span class="n">${f.nombre}</span>
      <span class="s">${puntos(f.puntos)}</span>
    </li>`).join('');

  ponerOverlay(`<div class="panel versus fin-comp">
    <div class="fin-cabeza">
      <p class="kicker">competitivo · ${c.mod.nombre} · ${c.mapa.nombre}</p>
      <p class="cifra">${titulo}</p>
      <p class="nota">${signo} de rango · ${movimiento}${c.muertes ? ` · reviviste ${c.muertes}×` : ''}</p>
    </div>
    <ol class="comp-tabla">${tabla}</ol>
    <div class="acciones">
      <button class="principal" type="button" data-accion="comp-again">revancha <kbd>enter</kbd></button>
      <button type="button" data-accion="home">menú <kbd>esc</kbd></button>
    </div>
  </div>`);
  pantalla('versus-fin');
  quitarMinis();
  enfocarPrimero('button[data-accion="comp-again"]');
  if (el.marcador) el.marcador.hidden = true;
  if (el.reloj) el.reloj.hidden = true;
  if (el.minis) el.minis.hidden = true;
  el.pause.disabled = true;
  el.prompt.classList.remove('visible');
  audio.play(yo.puesto === 1 ? 'level' : 'ui');
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
  if (el.marcador) el.marcador.hidden = true; // BORRAR-COMPETITIVO
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
    if (app.pantalla === 'playing' && app.juego) app.juego.toggleTurbo();
    return;
  }
  if (nombre === 'turboOn') {
    if (app.pantalla === 'playing' && app.juego) app.juego.setTurbo(true);
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
  if (app.pantalla === 'versus' || app.pantalla === 'versus-fin') {
    if (esDireccion) {
      moverFoco(nombre === 'left' ? -1 : nombre === 'right' ? 1 : 0, nombre === 'up' ? -1 : nombre === 'down' ? 1 : 0);
      return;
    }
    if (nombre === 'confirm') {
      activarFoco();
      return;
    }
    if (nombre === 'restart') {
      if (app.pantalla === 'versus') empezarCompetitivo();
      else mostrarCompetitivo();
      return;
    }
    if (nombre === 'back') {
      if (app.pantalla === 'versus') mostrarModos(2);
      else mostrarInicio();
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
    // BORRAR-COMPETITIVO
    if (app.comp && app.comp.activo) {
      mostrarCompetitivo();
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
      empezarCompetitivo();
      break;
    case 'comp-again':
      mostrarCompetitivo();
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

attachInput({ stage: el.stage, actions: accion });

/* ---------------------------------------------------------- bucle */

function bucle(t) {
  const dt = app.reloj ? t - app.reloj : 16;
  app.reloj = t;

  if (app.pantalla === 'home' || app.pantalla === 'modes') {
    pasoDemo(dt);
  } else if (app.juego) {
    // BORRAR-COMPETITIVO · con partida de competitivo corren también los tres bots
    if (app.comp && app.comp.activo) {
      if (app.pantalla === 'playing') pasoCompetitivo(dt);
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
  window.__snake.mostrarCompetitivo = mostrarCompetitivo;
  window.__snake.empezarCompetitivo = empezarCompetitivo;
  window.__snake.finCompetitivo = finCompetitivo;
}
