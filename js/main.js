import { Game } from './engine.js';
import { MODES, LEVELS, COLS, ROWS } from './levels.js';
import { audio } from './audio.js';
import { attachInput } from './input.js';

const $ = (sel) => document.querySelector(sel);

const MODE_ORDER = ['campaign', 'classic', 'frenzy', 'portals'];
const SAVE_KEY = 'snake.frenzy.v1';
const PER_ROW = 4;

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
  turboLabel: $('#turbo-label'),
  mute: $('#btn-mute'),
  pause: $('#btn-pause'),
  hint: $('#hint'),
};

const ctx = el.canvas.getContext('2d', { alpha: false });

/* --------------------------------------------------------------- guardado */

function loadSave() {
  const base = {
    best: { classic: 0, frenzy: 0, portals: 0 },
    campaign: { unlocked: 1, best: {} },
    muted: false,
  };
  try {
    const raw = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (raw && typeof raw === 'object') {
      if (raw.best) {
        for (const k of Object.keys(base.best)) {
          base.best[k] = Number(raw.best[k]) || 0;
        }
      }
      if (raw.campaign) {
        base.campaign.unlocked = Math.min(
          LEVELS.length,
          Math.max(1, parseInt(raw.campaign.unlocked, 10) || 1),
        );
        if (raw.campaign.best && typeof raw.campaign.best === 'object') {
          for (const [k, v] of Object.entries(raw.campaign.best)) {
            base.campaign.best[k] = Number(v) || 0;
          }
        }
      }
      base.muted = !!raw.muted;
    }
  } catch (err) {
    /* almacenamiento no disponible: se juega igual */
  }
  return base;
}

const saved = loadSave();
audio.setMuted(saved.muted);

function persist() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(saved));
  } catch (err) {
    /* ignora */
  }
}

/* ----------------------------------------------------------------- estado */

const app = {
  screen: 'home',
  game: null,
  modeId: 'classic',
  level: 0,
  menuIndex: 0,
  levelIndex: 0,
  prevBest: 0,
  timer: 0,
  last: 0,
};

let view = { cell: 24, ox: 0, oy: 0, width: 480, height: 480, dpr: 1 };

/* ------------------------------------------------------------------ utils */

const pad2 = (n) => String(n).padStart(2, '0');
const score = (n) => String(Math.max(0, Math.round(n || 0))).padStart(6, '0');

function clearTimer() {
  if (app.timer) {
    clearTimeout(app.timer);
    app.timer = 0;
  }
}

function currentBest() {
  if (app.modeId === 'campaign') return saved.campaign.best[app.level] || 0;
  return saved.best[app.modeId] || 0;
}

function isCoarse() {
  return window.matchMedia('(pointer: coarse)').matches;
}

/* ------------------------------------------------------------------ canvas */

function resize() {
  const rect = el.stage.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const avail = Math.max(140, Math.min(rect.width, rect.height) - 2);
  const cell = Math.max(8, Math.floor(avail / Math.max(COLS, ROWS)));
  const w = cell * COLS;
  const h = cell * ROWS;
  el.canvas.style.width = `${w}px`;
  el.canvas.style.height = `${h}px`;
  el.canvas.width = Math.round(w * dpr);
  el.canvas.height = Math.round(h * dpr);
  view = { cell, ox: 0, oy: 0, width: w, height: h, dpr };
}

/* -------------------------------------------------------------------- HUD */

function syncHud() {
  const g = app.game;
  if (!g) return;

  const val = String(g.score);
  if (el.score.textContent !== val) el.score.textContent = val;

  let meta;
  if (app.modeId === 'campaign') {
    const lv = LEVELS[app.level];
    meta = `${pad2(app.level + 1)} ${lv.name} · ${Math.min(g.fruits, lv.goal)}/${lv.goal}`;
  } else {
    meta = `${MODES[app.modeId].name} · ${g.fruits} FRUTAS`;
  }
  if (el.meta.textContent !== meta) el.meta.textContent = meta;

  const bestTxt = `MEJOR ${currentBest()}`;
  if (el.best.textContent !== bestTxt) el.best.textContent = bestTxt;

  const m = g.multiplier;
  const multTxt = m > 1 ? `×${m}` : '';
  if (el.mult.textContent !== multTxt) el.mult.textContent = multTxt;
  el.mult.classList.toggle('is-hot', m > 1);

  const full = g.chainTimer > 0 ? (g.chainTimer / g.chainWindow) * 100 : 0;
  el.chain.style.width = `${full.toFixed(1)}%`;

  el.turboLabel.classList.toggle('is-on', g.turbo);
  el.prompt.classList.toggle('is-on', g.state === 'ready');
  el.pause.textContent = g.state === 'paused' ? 'SEGUIR' : 'PAUSA';
  el.pause.disabled = app.screen !== 'playing' && app.screen !== 'paused';
}

function updateHint() {
  const hints = {
    home: '↑↓ ELEGIR · ENTER JUGAR · M SONIDO',
    levels: 'FLECHAS NAVEGAR · ENTER JUGAR · ESC VOLVER',
    playing: isCoarse() ? 'DESLIZA PARA GIRAR · TOCA PARA TURBO' : 'ESPACIO TURBO · P PAUSA · M SONIDO',
    paused: 'P SEGUIR · R REINICIAR · ESC MENÚ',
    dead: 'R REINTENTAR · ESC MENÚ',
    cleared: 'ENTER SIGUIENTE · ESC MENÚ',
  };
  el.hint.textContent = hints[app.screen] || '';
}

function setScreen(screen) {
  app.screen = screen;
  document.body.dataset.screen = screen;
  updateHint();
}

/* ----------------------------------------------------------------- overlay */

function setOverlay(html) {
  if (!html) {
    el.overlay.classList.remove('is-open');
    el.overlay.innerHTML = '';
    return;
  }
  el.overlay.innerHTML = html;
  el.overlay.classList.add('is-open');
  el.overlay.scrollTop = 0;
}

/* ------------------------------------------------------------------- menú */

function showHome() {
  clearTimer();
  app.game = null;
  app.menuIndex = 0;
  document.body.dataset.screen = 'home';

  const rows = MODE_ORDER.map((id, i) => {
    const info = id === 'campaign'
      ? {
        name: 'CAMPAÑA',
        tag: `${LEVELS.length} NIVELES · DIFICULTAD CRECIENTE`,
        right: `${saved.campaign.unlocked - 1}/${LEVELS.length}`,
      }
      : {
        name: MODES[id].name,
        tag: MODES[id].tag,
        right: String(saved.best[id] || 0),
      };
    return `<button class="row" data-mode="${id}" data-i="${i}">
      <span class="row-idx">${pad2(i + 1)}</span>
      <span class="row-name">${info.name}<small>${info.tag}</small></span>
      <span class="row-right">${info.right}</span>
    </button>`;
  }).join('');

  setOverlay(`<div class="panel home">
    <header class="home-head">
      <p class="kicker">20×20 · ULTRA FRENÉTICO</p>
      <h1>SNAKE<span class="dot">.</span></h1>
    </header>
    <nav class="rows">${rows}</nav>
    <p class="keys">${isCoarse() ? 'TOCA UN MODO' : '↑↓ ELEGIR · ENTER JUGAR · M SONIDO'}</p>
  </div>`);

  setScreen('home');
  selectMenu(0);
  el.score.textContent = '—';
  el.meta.textContent = 'ELIGE UN MODO';
  el.best.textContent = '';
  el.mult.textContent = '';
  el.chain.style.width = '0%';
  el.pause.disabled = true;
  el.pause.textContent = 'PAUSA';
  el.prompt.classList.remove('is-on');
}

function selectMenu(i) {
  const n = MODE_ORDER.length;
  app.menuIndex = ((i % n) + n) % n;
  const rows = el.overlay.querySelectorAll('.row');
  rows.forEach((node, idx) => node.classList.toggle('is-sel', idx === app.menuIndex));
}

function chooseMode(id) {
  if (id === 'campaign') showLevels();
  else startGame(id, 0);
}

function showLevels() {
  clearTimer();
  app.game = null;
  app.levelIndex = Math.min(saved.campaign.unlocked - 1, LEVELS.length - 1);
  renderLevels();
  el.score.textContent = '—';
  el.meta.textContent = 'CAMPAÑA';
  el.best.textContent = '';
  el.mult.textContent = '';
  el.chain.style.width = '0%';
  el.pause.disabled = true;
  el.pause.textContent = 'PAUSA';
  el.prompt.classList.remove('is-on');
}

function renderLevels() {
  const cells = LEVELS.map((lv, i) => {
    const locked = i >= saved.campaign.unlocked;
    const done = i < saved.campaign.unlocked - 1;
    const best = saved.campaign.best[i] || 0;
    return `<button class="lvl${locked ? ' is-locked' : ''}${done ? ' is-done' : ''}"
      data-lvl="${i}"${locked ? ' aria-disabled="true"' : ''}>
      <span class="lvl-top"><span class="lvl-num">${pad2(i + 1)}</span>${done ? '<span class="lvl-tick">✓</span>' : ''}</span>
      <span class="lvl-name">${locked ? '· · ·' : lv.name}</span>
      <span class="lvl-meta">${locked ? 'BLOQUEADO' : best ? `RÉCORD ${best}` : `${lv.goal} FRUTAS`}</span>
    </button>`;
  }).join('');

  setOverlay(`<div class="panel levels">
    <div class="levels-head">
      <div>
        <p class="kicker">CAMPAÑA · ${saved.campaign.unlocked - 1}/${LEVELS.length} SUPERADOS</p>
        <h2>ELIGE NIVEL</h2>
      </div>
      <button class="ghost" data-action="menu">← MENÚ</button>
    </div>
    <div class="grid">${cells}</div>
    <p class="keys">FLECHAS NAVEGAR · ENTER JUGAR · ESC MENÚ</p>
  </div>`);

  setScreen('levels');
  selectLevel(app.levelIndex);
}

function selectLevel(i) {
  const n = LEVELS.length;
  app.levelIndex = ((i % n) + n) % n;
  const nodes = el.overlay.querySelectorAll('.lvl');
  nodes.forEach((node, idx) => node.classList.toggle('is-sel', idx === app.levelIndex));
}

function chooseLevel(i) {
  if (i >= saved.campaign.unlocked) {
    audio.play('locked');
    return;
  }
  startGame('campaign', i);
}

/* -------------------------------------------------------------- partida */

function startGame(modeId, levelIndex = 0) {
  clearTimer();
  audio.unlock();

  let cfg;
  if (modeId === 'campaign') {
    const lv = LEVELS[levelIndex];
    cfg = {
      cols: COLS,
      rows: ROWS,
      walls: lv.walls,
      startSpeed: lv.speed,
      minSpeed: lv.minSpeed,
      accelPerFood: lv.accelPerFood,
      wrap: false,
      goal: lv.goal,
      bonusEvery: lv.bonusEvery,
      chainWindow: 2600,
    };
  } else {
    cfg = { ...MODES[modeId] };
  }

  app.modeId = modeId;
  app.level = levelIndex;
  app.game = new Game(cfg, onGameEvent);
  app.prevBest = currentBest();

  setScreen('playing');
  setOverlay(null);
  document.body.dataset.screen = 'playing';
  syncHud();
  updateHint();
}

function onGameEvent(type, data) {
  switch (type) {
    case 'start':
      audio.play('start');
      break;
    case 'eat':
      audio.play('eat', data);
      break;
    case 'bonus':
      audio.play('bonus');
      break;
    case 'portal':
      audio.play('portal');
      break;
    case 'turbo':
      audio.play('turbo');
      break;
    case 'die':
      audio.play('die');
      saveScore();
      app.timer = setTimeout(showDead, 440);
      break;
    case 'clear':
      audio.play('clear');
      saveScore();
      saved.campaign.unlocked = Math.max(
        saved.campaign.unlocked,
        Math.min(LEVELS.length, app.level + 2),
      );
      persist();
      app.timer = setTimeout(showCleared, 560);
      break;
    default:
      break;
  }
}

function saveScore() {
  const g = app.game;
  if (!g) return;
  if (app.modeId === 'campaign') {
    const k = String(app.level);
    saved.campaign.best[k] = Math.max(saved.campaign.best[k] || 0, g.score);
  } else {
    saved.best[app.modeId] = Math.max(saved.best[app.modeId] || 0, g.score);
  }
  persist();
}

function showDead() {
  const g = app.game;
  if (!g || g.state !== 'dead') return;
  const record = g.score > app.prevBest;
  const isCampaign = app.modeId === 'campaign';
  const goal = isCampaign ? LEVELS[app.level].goal : 0;

  setOverlay(`<div class="panel end">
    <p class="kicker">${record ? 'NUEVO RÉCORD' : 'FIN DE LA PARTIDA'}</p>
    <p class="huge">${score(g.score)}</p>
    <p class="sub">MEJOR ${Math.max(app.prevBest, g.score)} · FRUTAS ${g.fruits}${isCampaign ? ` / ${goal}` : ''}</p>
    <div class="actions">
      <button data-action="retry">REINTENTAR <kbd>R</kbd></button>
      <button data-action="menu">MENÚ <kbd>ESC</kbd></button>
    </div>
  </div>`);
  setScreen('dead');
  el.pause.disabled = true;
  el.prompt.classList.remove('is-on');
}

function showCleared() {
  const g = app.game;
  if (!g || g.state !== 'cleared') return;
  const last = app.level >= LEVELS.length - 1;
  const next = LEVELS[Math.min(app.level + 1, LEVELS.length - 1)];

  setOverlay(`<div class="panel end">
    <p class="kicker">NIVEL ${pad2(app.level + 1)} SUPERADO</p>
    <p class="huge">${score(g.score)}</p>
    <p class="sub">${last ? 'CAMPAÑA COMPLETA. YA ERES RÁPIDO.' : `SIGUIENTE · ${next.name} · ${next.goal} FRUTAS`}</p>
    <div class="actions">
      ${last ? '' : '<button data-action="next">SIGUIENTE <kbd>↵</kbd></button>'}
      <button data-action="retry">REPETIR <kbd>R</kbd></button>
      <button data-action="menu">MENÚ <kbd>ESC</kbd></button>
    </div>
  </div>`);
  setScreen('cleared');
  el.pause.disabled = true;
  el.prompt.classList.remove('is-on');
}

/* ----------------------------------------------------------------- pausa */

function togglePause() {
  const g = app.game;
  if (!g) return;
  if (app.screen === 'paused') {
    resumeGame();
    return;
  }
  if (app.screen !== 'playing') return;
  if (g.state === 'running' || g.state === 'ready') {
    g.pause();
    audio.play('ui');
    setOverlay(`<div class="panel pause">
      <p class="kicker">EN PAUSA</p>
      <p class="huge">${score(g.score)}</p>
      <div class="actions">
        <button data-action="resume">SEGUIR <kbd>P</kbd></button>
        <button data-action="retry">REINICIAR <kbd>R</kbd></button>
        <button data-action="menu">MENÚ <kbd>ESC</kbd></button>
      </div>
    </div>`);
    setScreen('paused');
    el.pause.textContent = 'SEGUIR';
    el.pause.disabled = false;
    el.prompt.classList.remove('is-on');
  }
}

function resumeGame() {
  const g = app.game;
  if (!g) return;
  g.resume();
  setOverlay(null);
  setScreen('playing');
  el.pause.textContent = 'PAUSA';
  el.pause.disabled = false;
}

/* --------------------------------------------------------------- acciones */

function doAction(action) {
  switch (action) {
    case 'retry':
      startGame(app.modeId, app.modeId === 'campaign' ? app.level : 0);
      break;
    case 'next':
      startGame('campaign', Math.min(app.level + 1, LEVELS.length - 1));
      break;
    case 'resume':
      resumeGame();
      break;
    case 'menu':
      showHome();
      break;
    default:
      break;
  }
}

function steer(dx, dy) {
  if (app.screen === 'paused') resumeGame();
  if (app.screen !== 'playing' || !app.game) return;
  app.game.setDirection(dx, dy);
}

function toggleMute() {
  audio.unlock();
  const muted = !audio.muted;
  audio.setMuted(muted);
  saved.muted = muted;
  persist();
  el.mute.classList.toggle('is-off', muted);
  el.mute.setAttribute('aria-pressed', String(muted));
  el.mute.title = muted ? 'Sonido desactivado (M)' : 'Sonido activado (M)';
  if (!muted) audio.play('ui');
}

function onAction(action) {
  if (action === 'mute') {
    toggleMute();
    return;
  }
  audio.unlock();

  if (action === 'tap') {
    if (app.screen === 'playing' && app.game) app.game.toggleTurbo();
    return;
  }
  if (action === 'turboOn') {
    if (app.screen === 'playing' && app.game) app.game.setTurbo(true);
    return;
  }
  if (action === 'turboOff') {
    if (app.game) app.game.setTurbo(false);
    return;
  }

  if (app.screen === 'home') {
    if (action === 'up') selectMenu(app.menuIndex - 1);
    else if (action === 'down') selectMenu(app.menuIndex + 1);
    else if (action === 'confirm') {
      audio.play('ui');
      chooseMode(MODE_ORDER[app.menuIndex]);
    }
    return;
  }

  if (app.screen === 'levels') {
    if (action === 'up') selectLevel(app.levelIndex - PER_ROW);
    else if (action === 'down') selectLevel(app.levelIndex + PER_ROW);
    else if (action === 'left') selectLevel(app.levelIndex - 1);
    else if (action === 'right') selectLevel(app.levelIndex + 1);
    else if (action === 'confirm') {
      audio.play('ui');
      chooseLevel(app.levelIndex);
    } else if (action === 'back' || action === 'pause') showHome();
    return;
  }

  if (action === 'pause') {
    togglePause();
    return;
  }
  if (action === 'back') {
    if (app.screen === 'playing') togglePause();
    else showHome();
    return;
  }
  if (action === 'restart') {
    if (app.game) startGame(app.modeId, app.modeId === 'campaign' ? app.level : 0);
    return;
  }
  if (action === 'confirm') {
    if (app.screen === 'dead') startGame(app.modeId, app.modeId === 'campaign' ? app.level : 0);
    else if (app.screen === 'cleared') {
      if (app.level >= LEVELS.length - 1) showHome();
      else startGame('campaign', app.level + 1);
    } else if (app.screen === 'paused') resumeGame();
    return;
  }

  const dirs = {
    up: [0, -1],
    down: [0, 1],
    left: [-1, 0],
    right: [1, 0],
  };
  if (dirs[action]) steer(dirs[action][0], dirs[action][1]);
}

/* ----------------------------------------------------------------- eventos */

function dropFocus() {
  const active = document.activeElement;
  if (active && active !== document.body && active.blur) active.blur();
}

el.overlay.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  audio.unlock();
  dropFocus();
  if (btn.dataset.mode) {
    audio.play('ui');
    chooseMode(btn.dataset.mode);
    return;
  }
  if (btn.dataset.lvl !== undefined) {
    chooseLevel(Number(btn.dataset.lvl));
    return;
  }
  if (btn.dataset.action) doAction(btn.dataset.action);
});

el.pause.addEventListener('click', () => {
  audio.unlock();
  dropFocus();
  if (app.screen === 'paused') resumeGame();
  else if (app.screen === 'playing') togglePause();
});

el.mute.addEventListener('click', () => {
  dropFocus();
  toggleMute();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && app.screen === 'playing') togglePause();
});

attachInput({ stage: el.stage, actions: onAction });

/* ------------------------------------------------------------------ bucle */

function frame(t) {
  const dt = app.last ? t - app.last : 16;
  app.last = t;
  if (app.game) {
    app.game.update(dt);
    app.game.draw(ctx, view);
    syncHud();
  }
  requestAnimationFrame(frame);
}

function boot() {
  el.prompt.textContent = isCoarse() ? 'DESLIZA PARA EMPEZAR' : 'PULSA UNA DIRECCIÓN';
  el.mute.classList.toggle('is-off', audio.muted);
  el.mute.setAttribute('aria-pressed', String(audio.muted));
  showHome();
  resize();
  if (window.ResizeObserver) {
    new ResizeObserver(() => resize()).observe(el.stage);
  } else {
    window.addEventListener('resize', resize);
  }
  window.addEventListener('orientationchange', () => setTimeout(resize, 120));
  requestAnimationFrame(frame);
}

boot();

// gancho de depuración: abre la página con #debug para inspeccionar la partida
if (location.hash === '#debug') {
  window.__snake = { app, saved, startGame, showHome, showLevels };
}
