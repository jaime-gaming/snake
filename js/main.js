import { Game, POWER_INFO } from './engine.js';
import { Duel, DUEL_CFG } from './duel.js';
import { MODES, LEVELS, COLS, ROWS } from './levels.js';
import { audio } from './audio.js';
import { attachInput } from './input.js';

const $ = (sel) => document.querySelector(sel);

const ORDEN = ['campaign', 'classic', 'frenzy', 'portals', 'hunter', 'duel'];
const CLAVE = 'snake.v2';
const CLAVE_ANTIGUA = 'snake.frenzy.v1';
const COLUMNAS_NIVELES = 4;

const el = {
  stage: $('#stage'),
  canvas: $('#board'),
  overlay: $('#overlay'),
  prompt: $('#prompt'),
  hud: $('#hud'),
  hudDuel: $('#hud-duel'),
  meta: $('#hud-meta'),
  score: $('#hud-score'),
  best: $('#hud-best'),
  mult: $('#hud-mult'),
  duel0: $('#duel-score-0'),
  duel1: $('#duel-score-1'),
  chain: $('#chain-bar'),
  effects: $('#effects'),
  mute: $('#btn-mute'),
  full: $('#btn-full'),
  pause: $('#btn-pause'),
  hint: $('#hint'),
};

const pincel = el.canvas.getContext('2d', { alpha: false });

/* ---------------------------------------------------------- récords */

function nuevoRegistro() {
  return {
    best: { classic: 0, frenzy: 0, portals: 0, hunter: 0 },
    campaign: { unlocked: 1, best: {} },
    duel: { wins: 0, losses: 0, draws: 0 },
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
  const duelo = bruto.duel || {};
  datos.duel.wins = Number(duelo.wins) || 0;
  datos.duel.losses = Number(duelo.losses) || 0;
  datos.duel.draws = Number(duelo.draws) || 0;
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
  duelo: null,
  demo: null,
  demoAcum: 0,
  menuSel: 0,
  nivelSel: 0,
  marca: 0,
  reloj: 0,
  temporizador: 0,
  record: false,
  chips: new Map(),
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
  const lado = Math.max(140, Math.min(caja.width || 480, caja.height || 480) - 2);
  const celda = Math.max(8, Math.floor(lado / Math.max(COLS, ROWS)));
  const ancho = celda * COLS;
  const alto = celda * ROWS;

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
    return;
  }
  el.overlay.innerHTML = html;
  el.overlay.classList.add('abierto');
  el.overlay.scrollTop = 0;
}

function pantalla(nombre) {
  app.pantalla = nombre;
  document.body.dataset.screen = nombre;
  actualizarPista();
}

const PISTAS = {
  home: '↑↓ elegir · enter jugar · M sonido',
  levels: 'flechas nav · enter jugar · esc menú',
  help: 'esc volver',
  playing: '',
  paused: 'P seguir · R reiniciar · esc menú',
  dead: 'R reintentar · esc menú',
  cleared: 'enter siguiente · esc menú',
  duelover: 'R revancha · esc menú',
};

function actualizarPista() {
  if (app.pantalla === 'playing') {
    el.hint.textContent = app.duelo
      ? 'p1 flechas · p2 WASD · P pausa'
      : esTactil()
        ? 'desliza para girar · toca para turbo'
        : 'espacio turbo · P pausa · R reiniciar · M sonido';
    return;
  }
  el.hint.textContent = PISTAS[app.pantalla] || '';
}

/* ---------------------------------------------------------- marcador */

function actualizarMarcador() {
  if (app.duelo) {
    el.hud.hidden = true;
    el.hudDuel.hidden = false;
    const [a, b] = app.duelo.snakes;
    const cero = puntos(a.score);
    const uno = puntos(b.score);
    if (el.duel0.textContent !== cero) el.duel0.textContent = cero;
    if (el.duel1.textContent !== uno) el.duel1.textContent = uno;
    el.prompt.classList.toggle('visible', app.duelo.state === 'ready');
    el.pause.textContent = app.pantalla === 'paused' ? 'seguir' : 'pausa';
    el.pause.disabled = app.pantalla !== 'playing' && app.pantalla !== 'paused';
    actualizarEfectos(null);
    return;
  }

  el.hud.hidden = false;
  el.hudDuel.hidden = true;

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
    meta = `${dosDigitos(app.nivel + 1)} ${nivel.name.toLowerCase()} · ${Math.min(juego.fruits, nivel.goal)}/${nivel.goal}`;
  } else {
    meta = `${MODES[app.modo].name.toLowerCase()} · ${juego.fruits} frutas`;
  }
  if (el.meta.textContent !== meta) el.meta.textContent = meta;

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

/* ---------------------------------------------------------- menú */

function valorDerecha(modo) {
  if (modo === 'campaign') return `${guardado.campaign.unlocked - 1}/${LEVELS.length}`;
  if (modo === 'duel') return `${guardado.duel.wins}–${guardado.duel.losses}`;
  const mejor = guardado.best[modo] || 0;
  return mejor ? String(mejor) : '—';
}

function nombreModo(modo) {
  if (modo === 'campaign') return 'campaña';
  if (modo === 'duel') return 'duelo';
  return MODES[modo].name.toLowerCase();
}

function descripcion(modo) {
  if (modo === 'campaign') {
    return `campaña: ${LEVELS.length} niveles con muros`;
  }
  if (modo === 'duel') return 'duelo local a dos manos';
  return MODES[modo].name.toLowerCase() + ': ' + MODES[modo].tag;
}

function mostrarInicio() {
  pararTemporizador();
  app.juego = null;
  app.duelo = null;
  app.menuSel = 0;
  crearDemo();

  const filas = ORDEN.map((modo, i) => {
    return `<button class="row" type="button" data-modo="${modo}" data-i="${i}">
      <span class="row-idx">${dosDigitos(i + 1)}</span>
      <span class="row-name">${nombreModo(modo)}<small>${descripcion(modo)}</small></span>
      <span class="row-right">${valorDerecha(modo)}</span>
    </button>`;
  }).join('');

  ponerOverlay(`<div class="panel inicio">
    <div class="inicio-texto">
      <header class="inicio-cabeza">
        <h1>snake<span class="dot">.</span></h1>
        <p class="kicker">rejilla 20×20 · seis formas de morir</p>
      </header>
      <nav class="filas">${filas}</nav>
      <p class="pie">
        <button class="link" type="button" data-accion="help">controles</button>
        <span aria-hidden="true">·</span>
        <button class="link" type="button" data-accion="crt">${guardado.crt ? 'quitar' : 'poner'} trama</button>
        <span aria-hidden="true">·</span>
        <button class="link" type="button" data-accion="wipe">borrar récords</button>
      </p>
    </div>
    <aside class="inicio-demo" aria-hidden="true">
      <p class="kicker">en directo · frenesí</p>
      <canvas id="demo"></canvas>
      <p class="nota">alguien juega por ti<br>mientras decides</p>
    </aside>
  </div>`);

  el.score.textContent = '—';
  el.meta.textContent = 'elige un modo';
  el.best.textContent = '';
  el.mult.textContent = '';
  el.chain.style.width = '0%';
  el.pause.disabled = true;
  el.pause.textContent = 'pausa';
  el.prompt.classList.remove('visible');
  pantalla('home');
  seleccionarModo(0);
  ajustarLienzo();
}

function seleccionarModo(i) {
  const total = ORDEN.length;
  app.menuSel = ((i % total) + total) % total;
  el.overlay.querySelectorAll('.row').forEach((nodo, j) => {
    nodo.classList.toggle('sel', j === app.menuSel);
  });
}

function elegirModo(modo) {
  if (modo === 'campaign') mostrarNiveles();
  else if (modo === 'duel') empezarDuelo();
  else empezarPartida(modo, 0);
}

/* ---------------------------------------------------------- niveles */

function mostrarNiveles() {
  pararTemporizador();
  app.juego = null;
  app.duelo = null;
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
      <button class="ghost" type="button" data-accion="home">menú</button>
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
        <tr><th>sonido</th><td>M</td></tr>
        <tr><th>duelo</th><td>jugador 1 flechas · jugador 2 WASD</td></tr>
        <tr><th>mando</th><td>d-pad y sticks · A turbo · start pausa</td></tr>
      </tbody>
    </table>
    <p class="kicker">reglas</p>
    <ul class="reglas">
      <li>la comida encadena: dos frutas seguidas suben el multiplicador hasta ×5</li>
      <li>el rombo rojo caduca y da dos anillos de largo</li>
      <li>los iconos blancos dan poderes: círculo discontinuo fantasma (atraviesas todo), dos barras lento, cuadrado recorte</li>
      <li>el recuadro blanco que parpadea es el cazador: te persigue y acelera</li>
      <li>en los portales, entrar por uno te saca por el otro</li>
    </ul>
    <p class="pie"><span>osciladores y ruido en directo · sin ficheros de audio</span></p>
  </div>`);
  pantalla('help');
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
  app.duelo = null;
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

function empezarDuelo() {
  pararTemporizador();
  audio.unlock();
  app.juego = null;
  app.demo = null;
  app.duelo = new Duel(DUEL_CFG, eventosDuelo);
  app.modo = 'duel';
  app.record = false;

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
    case 'portal':
      audio.play('portal');
      break;
    case 'power':
      audio.play('power');
      break;
    case 'turbo':
      audio.play('turbo');
      break;
    case 'hunter':
      if (!juego || app.reloj - (juego.ultimoAcecho || 0) > 240) {
        audio.play('hunter');
        if (juego) juego.ultimoAcecho = app.reloj;
      }
      break;
    case 'die':
      audio.play('death');
      guardarMarca();
      app.temporizador = setTimeout(mostrarFin, 430);
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

function eventosDuelo(tipo, datos) {
  switch (tipo) {
    case 'start':
      audio.play('start');
      break;
    case 'eat':
      audio.play('bite', { multiplier: 1 });
      break;
    case 'death':
      audio.play('death');
      break;
    case 'over': {
      audio.play('duelEnd');
      const duelo = app.duelo;
      if (duelo) {
        if (duelo.winner === 0) guardado.duel.wins++;
        else if (duelo.winner === 1) guardado.duel.losses++;
        else guardado.duel.draws++;
        guardar();
      }
      app.temporizador = setTimeout(mostrarFinDuelo, 520);
      break;
    }
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
      <p class="cifra">${puntos(juego.score)}</p>
      <p class="nota">${meta}</p>
    </div>
    <div class="acciones">
      <button class="principal" type="button" data-accion="retry">reintentar <kbd>R</kbd></button>
      <button type="button" data-accion="home">menú <kbd>esc</kbd></button>
    </div>
  </div>`);
  pantalla('dead');
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
      <p class="cifra">${puntos(juego.score)}</p>
      <p class="nota">${ultimo ? 'campaña completa · ya no hay margen' : `siguiente · ${siguiente.name.toLowerCase()} · ${siguiente.goal} frutas`}</p>
    </div>
    <div class="acciones">
      ${ultimo ? '' : '<button class="principal" type="button" data-accion="next">siguiente <kbd>↵</kbd></button>'}
      <button${ultimo ? ' class="principal"' : ''} type="button" data-accion="retry">repetir <kbd>R</kbd></button>
      <button type="button" data-accion="home">menú <kbd>esc</kbd></button>
    </div>
  </div>`);
  pantalla('cleared');
  el.pause.disabled = true;
  el.prompt.classList.remove('visible');
}

function mostrarFinDuelo() {
  const duelo = app.duelo;
  if (!duelo || duelo.state !== 'over') return;
  const [a, b] = duelo.snakes;
  const titulo = duelo.winner === 0 ? 'gana el jugador 1' : duelo.winner === 1 ? 'gana el jugador 2' : 'empate';

  ponerOverlay(`<div class="panel fin">
    <div class="fin-cabeza">
      <p class="kicker">${titulo}</p>
      <p class="cifra">${a.score}<span class="guion">—</span>${b.score}</p>
      <p class="nota">duelos ${guardado.duel.wins}–${guardado.duel.losses}${guardado.duel.draws ? ` · ${guardado.duel.draws} empates` : ''}</p>
    </div>
    <div class="acciones">
      <button class="principal" type="button" data-accion="rematch">revancha <kbd>R</kbd></button>
      <button type="button" data-accion="home">menú <kbd>esc</kbd></button>
    </div>
  </div>`);
  pantalla('duelover');
  el.pause.disabled = true;
}

/* ---------------------------------------------------------- pausa */

function pausar() {
  const enCurso = app.duelo || app.juego;
  if (!enCurso || app.pantalla !== 'playing') return;
  enCurso.pause();
  if (enCurso.state !== 'paused') return;
  audio.play('ui');

  let cifra;
  let nota;
  if (app.duelo) {
    const [a, b] = app.duelo.snakes;
    cifra = `${a.score}<span class="guion">—</span>${b.score}`;
    nota = 'duelo en pausa';
  } else {
    cifra = puntos(app.juego.score);
    nota = `${app.juego.fruits} frutas · récord ${Math.max(app.marca, app.juego.score)}`;
  }

  ponerOverlay(`<div class="panel fin">
    <div class="fin-cabeza">
      <p class="kicker">en pausa</p>
      <p class="cifra">${cifra}</p>
      <p class="nota">${nota}</p>
    </div>
    <div class="acciones">
      <button class="principal" type="button" data-accion="resume">seguir <kbd>P</kbd></button>
      <button type="button" data-accion="retry">${app.duelo ? 'revancha' : 'reiniciar'} <kbd>R</kbd></button>
      <button type="button" data-accion="home">menú <kbd>esc</kbd></button>
    </div>
  </div>`);
  pantalla('paused');
  el.pause.textContent = 'seguir';
  el.pause.disabled = false;
  el.prompt.classList.remove('visible');
}

function reanudar() {
  const enCurso = app.duelo || app.juego;
  if (!enCurso) return;
  enCurso.resume();
  ponerOverlay(null);
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

  // WASD en solitario y en menús se comporta como las flechas
  if (!app.duelo && nombre.endsWith('2')) nombre = nombre.slice(0, -1);

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

  const esDireccion = ['up', 'down', 'left', 'right', 'up2', 'down2', 'left2', 'right2'].includes(nombre);

  if (app.pantalla === 'home') {
    if (nombre === 'up') seleccionarModo(app.menuSel - 1);
    else if (nombre === 'down') seleccionarModo(app.menuSel + 1);
    else if (nombre === 'confirm') {
      audio.play('ui');
      elegirModo(ORDEN[app.menuSel]);
    }
    return;
  }

  if (app.pantalla === 'levels') {
    if (nombre === 'up') seleccionarNivel(app.nivelSel - COLUMNAS_NIVELES);
    else if (nombre === 'down') seleccionarNivel(app.nivelSel + COLUMNAS_NIVELES);
    else if (nombre === 'left') seleccionarNivel(app.nivelSel - 1);
    else if (nombre === 'right') seleccionarNivel(app.nivelSel + 1);
    else if (nombre === 'confirm') {
      audio.play('ui');
      elegirNivel(app.nivelSel);
    } else if (nombre === 'back' || nombre === 'pause') mostrarInicio();
    return;
  }

  if (app.pantalla === 'help') {
    if (nombre === 'back' || nombre === 'pause' || nombre === 'confirm') mostrarInicio();
    return;
  }

  if (app.pantalla === 'paused') {
    if (nombre === 'pause' || nombre === 'confirm') reanudar();
    else if (nombre === 'back') mostrarInicio();
    else if (nombre === 'restart') {
      if (app.duelo) empezarDuelo();
      else empezarPartida(app.modo, app.nivel);
    }
    return;
  }

  if (app.pantalla === 'dead' || app.pantalla === 'duelover') {
    if (nombre === 'confirm' || nombre === 'restart') {
      if (app.pantalla === 'duelover') empezarDuelo();
      else empezarPartida(app.modo, app.nivel);
    } else if (nombre === 'back') mostrarInicio();
    return;
  }

  if (app.pantalla === 'cleared') {
    if (nombre === 'confirm') {
      if (app.nivel >= LEVELS.length - 1) mostrarInicio();
      else empezarPartida('campaign', app.nivel + 1);
    } else if (nombre === 'restart') empezarPartida('campaign', app.nivel);
    else if (nombre === 'back') mostrarInicio();
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
    if (app.duelo) empezarDuelo();
    else if (app.juego) empezarPartida(app.modo, app.nivel);
    return;
  }
  if (!esDireccion) return;

  const direcciones = {
    up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0],
    up2: [0, -1], down2: [0, 1], left2: [-1, 0], right2: [1, 0],
  };
  const [dx, dy] = direcciones[nombre];
  if (app.duelo) {
    app.duelo.setDirection(nombre.endsWith('2') ? 1 : 0, dx, dy);
  } else if (app.juego) {
    app.juego.setDirection(dx, dy);
  }
}

function ejecutar(nombre) {
  switch (nombre) {
    case 'retry':
      if (app.duelo) empezarDuelo();
      else empezarPartida(app.modo, app.nivel);
      break;
    case 'next':
      empezarPartida('campaign', Math.min(app.nivel + 1, LEVELS.length - 1));
      break;
    case 'rematch':
      empezarDuelo();
      break;
    case 'resume':
      reanudar();
      break;
    case 'home':
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
  if (!window.confirm('¿borrar récords y progreso?')) return;
  guardado.best = { classic: 0, frenzy: 0, portals: 0, hunter: 0 };
  guardado.campaign = { unlocked: 1, best: {} };
  guardado.duel = { wins: 0, losses: 0, draws: 0 };
  guardar();
  audio.play('ui');
  mostrarInicio();
}

/* ---------------------------------------------------------- sonido y pantalla */

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

function pantallaCompleta() {
  const doc = document.documentElement;
  const pedir = doc.requestFullscreen || doc.webkitRequestFullscreen;
  const salir = document.exitFullscreen || document.webkitExitFullscreen;
  if (!pedir) {
    el.full.disabled = true;
    return;
  }
  if (doc.fullscreenElement) salir.call(document).catch(() => {});
  else pedir.call(doc).catch(() => {});
}

/* ---------------------------------------------------------- demo del menú */

function crearDemo() {
  const cfg = { ...MODES.frenzy, startSpeed: 96, rampPerSec: 0.4, goal: null, powerEvery: 4 };
  const juego = new Game(cfg, () => {});
  juego.state = 'running';
  app.demo = juego;
  app.demoAcum = 0;
  ajustarLienzo();
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
  if (demo.state === 'dead' || demo.state === 'cleared') crearDemo();

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
  if (app.pantalla === 'home' && boton.dataset.i) seleccionarModo(Number(boton.dataset.i));
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

el.full.addEventListener('click', () => {
  soltarFoco();
  pantallaCompleta();
});

document.addEventListener('fullscreenchange', () => {
  el.full.classList.toggle('apagado', !!document.fullscreenElement);
});

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

  if (app.pantalla === 'home') {
    pasoDemo(dt);
  } else if (app.duelo) {
    app.duelo.update(dt);
    app.duelo.draw(pincel, vista);
    actualizarMarcador();
  } else if (app.juego) {
    app.juego.update(dt);
    app.juego.draw(pincel, vista);
    actualizarMarcador();
  }

  requestAnimationFrame(bucle);
}

function arrancar() {
  document.documentElement.classList.toggle('trama', guardado.crt);
  aplicarSonido();
  mostrarInicio();
  ajustarLienzo();

  if (window.ResizeObserver) new ResizeObserver(() => ajustarLienzo()).observe(el.stage);
  else window.addEventListener('resize', ajustarLienzo);
  window.addEventListener('orientationchange', () => setTimeout(ajustarLienzo, 140));

  requestAnimationFrame(bucle);
}

arrancar();

if (location.hash === '#debug') {
  window.__snake = { app, guardado, accion, empezarPartida, empezarDuelo, mostrarInicio };
}
