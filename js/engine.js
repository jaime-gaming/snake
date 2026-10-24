import { K, DIRS, bfsStep } from './grid.js?v=3';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rand = (n) => Math.floor(Math.random() * n);

const POWER = ['ghost', 'slow', 'shrink'];

export const POWER_INFO = {
  ghost: { label: 'fantasma', ms: 5200 },
  slow: { label: 'lento', ms: 6000 },
  shrink: { label: 'recorte', ms: 0 },
};

export class Game {
  constructor(cfg, onEvent = () => {}) {
    this.cfg = cfg;
    this.onEvent = onEvent;
    this.cols = cfg.cols;
    this.rows = cfg.rows;
    this.walls = cfg.walls || [];
    this.reset();
  }

  emit(type, data) {
    this.onEvent(type, data);
  }

  reset() {
    const cfg = this.cfg;
    this.wallSet = new Set(this.walls.map(([x, y]) => K(x, y)));
    const start = this.findStart();
    this.body = [];
    for (let i = 0; i < 4; i++) {
      this.body.push({ x: start.x - start.dir.x * i, y: start.y - start.dir.y * i });
    }
    this.prevBody = this.body.map((p) => ({ ...p }));
    this.dir = { ...start.dir };
    this.queue = [];
    this.grow = 0;
    this.speed = cfg.startSpeed;
    this.acc = 0;
    this.state = 'ready';
    this.savedState = 'ready';
    this.score = 0;
    this.fruits = 0;
    this.chain = 0;
    this.chainTimer = 0;
    this.chainWindow = cfg.chainWindow || 2800;
    this.fx = { ghost: 0, slow: 0 };
    this.bonus = null;
    this.power = null;
    this.portals = null;
    this.hunter = null;
    this.hunterTick = 0;
    this.pellets = [];
    this.reveal = 0;
    this.turbo = false;
    this.time = 0;
    this.shake = 0;
    this.flash = 0;
    this.particles = [];
    this.food = null;
    this.spawnFood();
    if (cfg.portals) this.placePortals();
    if (cfg.hunter) {
      this.placeHunter();
      for (let i = 0; i < 2; i++) this.spawnPellet();
    }
  }

  findStart() {
    const free = (x, y) =>
      x >= 0 && y >= 0 && x < this.cols && y < this.rows && !this.wallSet.has(K(x, y));
    const ring = (n, c) => {
      const out = [];
      for (let d = 0; d < n; d++) {
        if (c - d >= 0) out.push(c - d);
        if (d > 0 && c + d < n) out.push(c + d);
      }
      return out;
    };
    const rowOrder = ring(this.rows, Math.floor(this.rows / 2));
    const colOrder = ring(this.cols, Math.floor(this.cols / 2));

    for (const y of rowOrder) {
      for (let x = 0; x + 4 < this.cols; x++) {
        if (free(x, y) && free(x + 1, y) && free(x + 2, y) && free(x + 3, y) && free(x + 4, y)) {
          return { x: x + 3, y, dir: { x: 1, y: 0 } };
        }
      }
    }
    for (const x of colOrder) {
      for (let y = 0; y + 4 < this.rows; y++) {
        if (free(x, y) && free(x, y + 1) && free(x, y + 2) && free(x, y + 3) && free(x, y + 4)) {
          return { x, y: y + 3, dir: { x: 0, y: -1 } };
        }
      }
    }
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        if (free(x, y)) return { x, y, dir: { x: 1, y: 0 } };
      }
    }
    return { x: 4, y: Math.floor(this.rows / 2), dir: { x: 1, y: 0 } };
  }

  get multiplier() {
    return Math.min(5, 1 + Math.floor(this.chain / 2));
  }

  get ghosting() {
    return this.fx.ghost > 0;
  }

  interval() {
    const slow = this.fx.slow > 0 ? 1.55 : 1;
    return Math.max(24, this.speed * (this.turbo ? 0.62 : 1) * slow);
  }

  setDirection(dx, dy) {
    if (this.state === 'dead' || this.state === 'cleared' || this.state === 'paused') return;
    if (this.state === 'ready') {
      this.state = 'running';
      this.emit('start');
    }
    const last = this.queue.length ? this.queue[this.queue.length - 1] : this.dir;
    if (dx === -last.x && dy === -last.y) return;
    if (dx === last.x && dy === last.y) return;
    if (this.queue.length < 2) this.queue.push({ x: dx, y: dy });
  }

  setTurbo(on) {
    if (this.state !== 'running' || this.turbo === on) return;
    this.turbo = on;
    if (on) this.emit('turbo');
  }

  toggleTurbo() {
    this.setTurbo(!this.turbo);
  }

  pause() {
    if (this.state === 'running' || this.state === 'ready') {
      this.savedState = this.state;
      this.state = 'paused';
      this.turbo = false;
    }
  }

  resume() {
    if (this.state === 'paused') this.state = this.savedState;
  }

  update(dtRaw) {
    const dt = Math.min(dtRaw, 120);
    this.time += dt;
    for (const k of ['ghost', 'slow']) {
      if (this.fx[k] > 0) this.fx[k] = Math.max(0, this.fx[k] - dt);
    }
    if (this.state === 'running') {
      const cfg = this.cfg;
      if (cfg.rampPerSec) {
        this.speed = Math.max(cfg.minSpeed, this.speed - (cfg.rampPerSec * dt) / 1000);
      }
      if (this.chainTimer > 0) {
        this.chainTimer -= dt;
        if (this.chainTimer <= 0) {
          this.chainTimer = 0;
          this.chain = 0;
        }
      }
      if (this.bonus) {
        this.bonus.ttl -= dt;
        if (this.bonus.ttl <= 0) this.bonus = null;
      }
      if (this.power) {
        this.power.ttl -= dt;
        if (this.power.ttl <= 0) this.power = null;
      }
      this.acc += dt;
      let guard = 0;
      while (this.state === 'running' && this.acc >= this.interval() && guard++ < 8) {
        this.acc -= this.interval();
        this.step();
      }
    }
    this.updateFx(dt);
  }

  updateFx(dt) {
    const k = dt / 1000;
    if (this.reveal < 1) this.reveal = Math.min(1, this.reveal + dt / 620);
    this.shake = Math.max(0, this.shake - dt * 0.05);
    this.flash = Math.max(0, this.flash - dt * 0.004);
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * k;
      p.y += p.vy * k;
      p.vx *= 0.94;
      p.vy *= 0.94;
      p.life -= dt;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
  }

  step() {
    const cfg = this.cfg;
    const ghost = this.ghosting;
    if (this.queue.length) {
      const d = this.queue.shift();
      if (!(d.x === -this.dir.x && d.y === -this.dir.y)) this.dir = d;
    }

    this.prevBody = this.body.map((s) => ({ ...s }));

    let hx = this.body[0].x + this.dir.x;
    let hy = this.body[0].y + this.dir.y;

    if (cfg.wrap || ghost) {
      hx = (hx + this.cols) % this.cols;
      hy = (hy + this.rows) % this.rows;
    } else if (hx < 0 || hy < 0 || hx >= this.cols || hy >= this.rows) {
      return this.die('borde', clamp(hx, 0, this.cols - 1), clamp(hy, 0, this.rows - 1));
    }

    if (!ghost && this.portals) {
      for (const p of this.portals) {
        if (hx === p.a.x && hy === p.a.y) {
          hx = p.b.x;
          hy = p.b.y;
          this.emit('portal', { x: hx, y: hy });
          this.flash = 0.6;
          break;
        }
        if (hx === p.b.x && hy === p.b.y) {
          hx = p.a.x;
          hy = p.a.y;
          this.emit('portal', { x: hx, y: hy });
          this.flash = 0.6;
          break;
        }
      }
    }

    if (!ghost && this.wallSet.has(K(hx, hy))) return this.die('muro', hx, hy);
    if (!ghost && this.hunter && this.hunter.body.some((s) => s.x === hx && s.y === hy)) {
      return this.die('cazador', hx, hy);
    }

    const eats = this.food && hx === this.food.x && hy === this.food.y;
    const takesBonus = this.bonus && hx === this.bonus.x && hy === this.bonus.y;
    const takesPower = this.power && hx === this.power.x && hy === this.power.y;
    const willGrow = this.grow > 0 || eats || takesBonus;

    for (let i = 0; i < this.body.length; i++) {
      if (!willGrow && i === this.body.length - 1) continue;
      if (this.body[i].x === hx && this.body[i].y === hy) return this.die('cola', hx, hy);
    }

    this.body.unshift({ x: hx, y: hy });
    if (this.grow > 0) this.grow--;
    else this.body.pop();

    if (eats) this.eatFood();
    if (takesBonus) this.eatBonus();
    if (takesPower) this.takePower();
    if (this.cfg.hunter) this.moveHunter();
  }

  eatFood() {
    const cfg = this.cfg;
    const food = this.food;
    this.fruits++;
    this.grow += 1;
    this.chain = Math.min(this.chain + 1, 30);
    this.chainTimer = this.chainWindow;
    this.score += 10 * this.multiplier;
    this.speed = Math.max(cfg.minSpeed, this.speed - (cfg.accelPerFood || 0));
    this.shake = 2.6;
    this.burst(food.x + 0.5, food.y + 0.5, 10, '#ff2b2b', 7);
    this.emit('eat', { chain: this.chain, multiplier: this.multiplier });
    this.spawnFood();
    if (cfg.bonusEvery && this.fruits % cfg.bonusEvery === 0) this.spawnBonus();
    if (cfg.powerEvery && this.fruits % cfg.powerEvery === 0) this.spawnPower();
    if (cfg.portalEvery && this.portals && this.fruits % cfg.portalEvery === 0) this.placePortals();
    if (cfg.goal && this.fruits >= cfg.goal) {
      this.state = 'cleared';
      this.emit('clear', { fruits: this.fruits, score: this.score });
    }
  }

  eatBonus() {
    const b = this.bonus;
    this.bonus = null;
    this.grow += 2;
    this.chain = Math.min(this.chain + 2, 30);
    this.chainTimer = this.chainWindow;
    this.score += 50 * this.multiplier;
    this.shake = 5;
    this.burst(b.x + 0.5, b.y + 0.5, 18, '#ffffff', 9);
    if (this.cfg.hunter) this.placeHunter();
    this.emit('bonus', { score: this.score });
  }

  takePower() {
    const p = this.power;
    this.power = null;
    this.shake = 4;
    this.burst(p.x + 0.5, p.y + 0.5, 14, '#ffffff', 8);
    if (p.kind === 'ghost') {
      this.fx.ghost = POWER_INFO.ghost.ms;
    } else if (p.kind === 'slow') {
      this.fx.slow = POWER_INFO.slow.ms;
    } else {
      const cut = Math.min(5, Math.max(0, this.body.length - 3));
      if (cut > 0) this.body.splice(this.body.length - cut, cut);
      this.score += 30;
    }
    this.emit('power', { kind: p.kind, label: POWER_INFO[p.kind].label });
  }

  die(reason, x, y) {
    if (this.state !== 'running') return;
    this.state = 'dead';
    this.turbo = false;
    this.shake = 12;
    this.burst((x ?? 0) + 0.5, (y ?? 0) + 0.5, 26, '#ffffff', 11);
    this.emit('die', { reason, score: this.score, fruits: this.fruits });
  }

  blockedSet({ omitTail = false, walls = true, hunter = true } = {}) {
    const set = new Set();
    if (walls) for (const k of this.wallSet) set.add(k);
    const end = omitTail ? this.body.length - 1 : this.body.length;
    for (let i = 0; i < end; i++) set.add(K(this.body[i].x, this.body[i].y));
    if (hunter && this.hunter) {
      for (const p of this.hunter.body) set.add(K(p.x, p.y));
    }
    return set;
  }

  // piloto automático: se usa en la demo del menú y en las pruebas
  botTurn() {
    if (this.state !== 'ready' && this.state !== 'running') return;
    const head = this.body[0];
    const blocked = this.blockedSet({ omitTail: true });
    const wrap = !!this.cfg.wrap || this.ghosting;
    if (this.food) {
      const step = bfsStep({ start: head, goal: this.food, blocked, cols: this.cols, rows: this.rows, wrap });
      if (step) {
        this.setDirection(step.x, step.y);
        return;
      }
    }
    for (const [dx, dy] of DIRS) {
      const nx = head.x + dx;
      const ny = head.y + dy;
      if (!wrap && (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows)) continue;
      const k = K((nx + this.cols) % this.cols, (ny + this.rows) % this.rows);
      if (blocked.has(k)) continue;
      if (dx === -this.dir.x && dy === -this.dir.y) continue;
      this.setDirection(dx, dy);
      return;
    }
  }

  freeCell(pad = 0) {
    const blocked = (x, y) => {
      if (this.wallSet.has(K(x, y))) return true;
      if (this.body.some((s) => s.x === x && s.y === y)) return true;
      if (this.food && this.food.x === x && this.food.y === y) return true;
      if (this.bonus && this.bonus.x === x && this.bonus.y === y) return true;
      if (this.power && this.power.x === x && this.power.y === y) return true;
      if (this.hunter && this.hunter.body.some((p) => p.x === x && p.y === y)) return true;
      if (this.pellets.some((p) => p.x === x && p.y === y)) return true;
      if (this.portals && this.portals.some((p) =>
        (p.a.x === x && p.a.y === y) || (p.b.x === x && p.b.y === y))) return true;
      return false;
    };
    for (let i = 0; i < 600; i++) {
      const x = pad + rand(this.cols - pad * 2);
      const y = pad + rand(this.rows - pad * 2);
      if (!blocked(x, y)) return { x, y };
    }
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) if (!blocked(x, y)) return { x, y };
    }
    return null;
  }

  spawnFood() {
    const cell = this.freeCell(0);
    if (cell) this.food = cell;
  }

  spawnBonus() {
    const cell = this.freeCell(0);
    if (cell) this.bonus = { ...cell, ttl: 6500 };
  }

  spawnPower() {
    if (this.power) return;
    const cell = this.freeCell(0);
    if (!cell) return;
    const kind = POWER[rand(POWER.length)];
    this.power = { ...cell, kind, ttl: 9000 };
  }

  placePortals() {
    const a = this.freeCell(2);
    if (!a) return;
    let b = null;
    for (let i = 0; i < 60; i++) {
      const c = this.freeCell(2);
      if (!c) break;
      if (Math.abs(c.x - a.x) + Math.abs(c.y - a.y) >= 6) {
        b = c;
        break;
      }
    }
    if (!b) return;
    this.portals = [{ a, b }];
    this.emit('portals', { a, b });
  }

  // el cazador es una serpiente: empieza con tres anillos y crece comiendo
  placeHunter() {
    const cabeza = this.body[0];
    const libre = (x, y) =>
      x >= 0 && y >= 0 && x < this.cols && y < this.rows &&
      !this.wallSet.has(K(x, y)) &&
      !this.body.some((s) => s.x === x && s.y === y) &&
      !this.pellets.some((p) => p.x === x && p.y === y);

    let origen = null;
    for (let i = 0; i < 300; i++) {
      const c = this.freeCell(1);
      if (!c) break;
      if (Math.abs(c.x - cabeza.x) + Math.abs(c.y - cabeza.y) >= 8) {
        origen = c;
        break;
      }
    }
    if (!origen) origen = this.freeCell(1) || { x: 0, y: 0 };

    const cuerpo = [origen];
    for (const [dx, dy] of DIRS) {
      if (cuerpo.length >= 3) break;
      for (let n = 1; n <= 2; n++) {
        const x = origen.x + dx * n;
        const y = origen.y + dy * n;
        if (!libre(x, y)) break;
        cuerpo.push({ x, y });
      }
    }

    this.hunter = {
      body: cuerpo,
      prev: cuerpo.map((p) => ({ ...p })),
      dir: { x: 0, y: 0 },
      grow: 0,
    };
    this.hunterTick = 0;
  }

  spawnPellet() {
    if (!this.hunter) return;
    const cabeza = this.body[0];
    let sitio = null;
    for (let i = 0; i < 120; i++) {
      const c = this.freeCell(1);
      if (!c) break;
      if (Math.abs(c.x - cabeza.x) + Math.abs(c.y - cabeza.y) >= 4) {
        sitio = c;
        break;
      }
    }
    if (!sitio) sitio = this.freeCell(1);
    if (sitio) this.pellets.push(sitio);
  }

  moveHunter() {
    const h = this.hunter;
    if (!h) return;
    const every = 2;
    this.hunterTick++;
    if (this.hunterTick % every !== 0) return;

    h.prev = h.body.map((p) => ({ ...p }));
    const cabeza = h.body[0];

    const ocupado = new Set(this.wallSet);
    for (let i = 0; i < h.body.length - 1; i++) ocupado.add(K(h.body[i].x, h.body[i].y));
    for (const s of this.body) ocupado.add(K(s.x, s.y));

    // primero los puntos azules; si no queda camino, a por el jugador
    let objetivo = null;
    let distancia = Infinity;
    for (const punto of this.pellets) {
      const d = Math.abs(punto.x - cabeza.x) + Math.abs(punto.y - cabeza.y);
      if (d < distancia) {
        distancia = d;
        objetivo = punto;
      }
    }
    const haciaJugador = objetivo === null;
    if (!objetivo) objetivo = this.body[0];

    let paso = bfsStep({
      start: cabeza,
      goal: objetivo,
      blocked: ocupado,
      cols: this.cols,
      rows: this.rows,
      wrap: false,
    });
    if (!paso && !haciaJugador) {
      paso = bfsStep({
        start: cabeza,
        goal: this.body[0],
        blocked: ocupado,
        cols: this.cols,
        rows: this.rows,
        wrap: false,
      });
    }

    let siguiente = paso ? { x: cabeza.x + paso.x, y: cabeza.y + paso.y } : null;
    if (!siguiente || ocupado.has(K(siguiente.x, siguiente.y))) {
      siguiente = null;
      for (const [dx, dy] of DIRS) {
        const nx = cabeza.x + dx;
        const ny = cabeza.y + dy;
        if (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows) continue;
        if (ocupado.has(K(nx, ny))) continue;
        siguiente = { x: nx, y: ny };
        break;
      }
    }
    if (!siguiente) return;

    h.dir = { x: siguiente.x - cabeza.x, y: siguiente.y - cabeza.y };
    h.body.unshift(siguiente);
    if (h.grow > 0) h.grow--;
    else h.body.pop();

    const indice = this.pellets.findIndex((p) => p.x === siguiente.x && p.y === siguiente.y);
    if (indice >= 0) {
      this.pellets.splice(indice, 1);
      if (h.body.length < 18) h.grow += 1;
      this.burst(siguiente.x + 0.5, siguiente.y + 0.5, 8, '#3d7bff', 5);
      this.spawnPellet();
      this.emit('hunterEat');
    }
  }

  burst(x, y, n, color, power) {
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = (0.35 + Math.random() * 0.65) * power;
      this.particles.push({
        x,
        y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        life: 260 + Math.random() * 320,
        max: 580,
        color,
        size: Math.random() < 0.25 ? 2 : 1,
      });
    }
  }

  posAt(i, alpha) {
    const cur = this.body[i];
    if (!cur) return null;
    const prev = this.prevBody[i] || cur;
    const dx = cur.x - prev.x;
    const dy = cur.y - prev.y;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) return { x: cur.x, y: cur.y };
    return { x: prev.x + dx * alpha, y: prev.y + dy * alpha };
  }

  draw(ctx, view) {
    const { cell, ox, oy } = view;
    const W = this.cols * cell;
    const H = this.rows * cell;

    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, view.width, view.height);

    ctx.save();
    if (this.shake > 0.2) {
      const s = this.shake;
      ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
    }

    ctx.fillStyle = '#141414';
    for (let x = 1; x < this.cols; x++) ctx.fillRect(Math.round(ox + x * cell), oy, 1, H);
    for (let y = 1; y < this.rows; y++) ctx.fillRect(ox, Math.round(oy + y * cell), W, 1);

    const inset = Math.max(1, Math.round(cell * 0.06));
    for (const [x, y] of this.walls) {
      const px = Math.round(ox + x * cell);
      const py = Math.round(oy + y * cell);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(px + inset, py + inset, cell - inset * 2, cell - inset * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.34)';
      ctx.lineWidth = 1;
      ctx.strokeRect(px + inset + 0.5, py + inset + 0.5, cell - inset * 2 - 1, cell - inset * 2 - 1);
    }

    if (this.portals) {
      const t = this.time / 260;
      for (const p of this.portals) {
        for (const c of [p.a, p.b]) {
          const cx = ox + (c.x + 0.5) * cell;
          const cy = oy + (c.y + 0.5) * cell;
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = Math.max(1, cell * 0.055);
          ctx.beginPath();
          ctx.arc(cx, cy, cell * (0.3 + 0.03 * Math.sin(t)), 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = '#fff';
          ctx.fillRect(Math.round(cx - 1), Math.round(cy - 1), 2, 2);
        }
      }
    }

    if (this.food) {
      const pulse = 0.5 + 0.5 * Math.sin(this.time / 220);
      const pad = cell * (0.2 - pulse * 0.045);
      ctx.fillStyle = '#ff2b2b';
      ctx.fillRect(
        Math.round(ox + this.food.x * cell + pad),
        Math.round(oy + this.food.y * cell + pad),
        Math.round(cell - pad * 2),
        Math.round(cell - pad * 2),
      );
    }

    if (this.bonus && !(this.bonus.ttl < 1800 && Math.floor(this.time / 130) % 2 === 0)) {
      const cx = ox + (this.bonus.x + 0.5) * cell;
      const cy = oy + (this.bonus.y + 0.5) * cell;
      const r = cell * 0.36;
      ctx.beginPath();
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r, cy);
      ctx.lineTo(cx, cy + r);
      ctx.lineTo(cx - r, cy);
      ctx.closePath();
      ctx.fillStyle = '#ff2b2b';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    if (this.power && !(this.power.ttl < 2200 && Math.floor(this.time / 140) % 2 === 0)) {
      const { kind } = this.power;
      const cx = ox + (this.power.x + 0.5) * cell;
      const cy = oy + (this.power.y + 0.5) * cell;
      const r = cell * 0.3;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = Math.max(1, cell * 0.06);
      if (kind === 'ghost') {
        ctx.setLineDash([Math.max(2, cell * 0.14), Math.max(2, cell * 0.14)]);
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (kind === 'slow') {
        ctx.beginPath();
        ctx.moveTo(cx - r * 0.7, cy - r * 0.32);
        ctx.lineTo(cx + r * 0.7, cy - r * 0.32);
        ctx.moveTo(cx - r * 0.7, cy + r * 0.32);
        ctx.lineTo(cx + r * 0.7, cy + r * 0.32);
        ctx.stroke();
      } else {
        ctx.strokeRect(cx - r, cy - r, r * 2, r * 2);
      }
    }

    // puntos azules del cazador
    for (const punto of this.pellets) {
      const pad = cell * 0.33;
      ctx.fillStyle = '#3d7bff';
      ctx.fillRect(
        Math.round(ox + punto.x * cell + pad),
        Math.round(oy + punto.y * cell + pad),
        Math.round(cell - pad * 2),
        Math.round(cell - pad * 2),
      );
    }

    // el cazador: serpiente roja, crece con los puntos
    if (this.hunter) {
      const ritmo = 2;
      const hAlpha = ((this.hunterTick % ritmo) + (this.state === 'running' ? clamp(this.acc / this.interval(), 0, 1) : 1)) / ritmo;
      for (let i = this.hunter.body.length - 1; i >= 0; i--) {
        const actual = this.hunter.body[i];
        const previo = this.hunter.prev[i] || actual;
        const salto = Math.abs(actual.x - previo.x) > 1 || Math.abs(actual.y - previo.y) > 1;
        const px = Math.round(ox + (salto ? actual.x : previo.x + (actual.x - previo.x) * hAlpha) * cell);
        const py = Math.round(oy + (salto ? actual.y : previo.y + (actual.y - previo.y) * hAlpha) * cell);
        const margen = Math.max(1, Math.round(cell * 0.07));
        ctx.fillStyle = i === 0 ? '#ff2b2b' : '#c91616';
        ctx.fillRect(px + margen, py + margen, cell - margen * 2, cell - margen * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 1;
        ctx.strokeRect(px + margen + 0.5, py + margen + 0.5, cell - margen * 2 - 1, cell - margen * 2 - 1);
      }
      const cabeza = this.hunter.body[0];
      const tam = Math.max(2, Math.round(cell * 0.16));
      ctx.fillStyle = '#000';
      ctx.fillRect(
        Math.round(ox + (cabeza.x + 0.5) * cell - tam / 2),
        Math.round(oy + (cabeza.y + 0.5) * cell - tam / 2),
        tam,
        tam,
      );
    }

    const alpha = this.state === 'running' ? clamp(this.acc / this.interval(), 0, 1) : 1;
    const gap = Math.max(1, Math.round(cell * 0.07));
    const ghost = this.ghosting;
    for (let i = this.body.length - 1; i >= 0; i--) {
      const p = this.posAt(i, alpha);
      if (!p) continue;
      const px = Math.round(ox + p.x * cell);
      const py = Math.round(oy + p.y * cell);
      if (ghost) {
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(px + gap, py + gap, cell - gap * 2, cell - gap * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.92)';
        ctx.lineWidth = Math.max(1, cell * 0.05);
        ctx.strokeRect(px + gap + 0.5, py + gap + 0.5, cell - gap * 2 - 1, cell - gap * 2 - 1);
      } else {
        ctx.fillStyle = i === 0 ? '#ffffff' : i < 3 ? '#f0f0f0' : '#d8d8d8';
        ctx.fillRect(px + gap, py + gap, cell - gap * 2, cell - gap * 2);
      }
    }

    const head = this.posAt(0, alpha);
    if (head) {
      const size = Math.max(2, Math.round(cell * 0.17));
      const cx = ox + (head.x + 0.5) * cell + this.dir.x * cell * 0.19;
      const cy = oy + (head.y + 0.5) * cell + this.dir.y * cell * 0.19;
      ctx.fillStyle = ghost ? 'rgba(255,255,255,0.75)' : '#000';
      ctx.fillRect(Math.round(cx - size / 2), Math.round(cy - size / 2), size, size);
    }

    ctx.save();
    for (const p of this.particles) {
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.color;
      const s = Math.max(1, p.size);
      ctx.fillRect(Math.round(ox + p.x * cell), Math.round(oy + p.y * cell), s, s);
    }
    ctx.restore();

    ctx.restore();

    if (this.flash > 0.01) {
      ctx.fillStyle = `rgba(255,255,255,${this.flash * 0.07})`;
      ctx.fillRect(0, 0, view.width, view.height);
    }

    // onda de luz: al empezar, cada casilla se enciende al alcanzarla
    if (this.reveal < 1) {
      const cabeza = this.body[0];
      const radio = this.reveal * (this.cols + this.rows) * 0.8;
      const borde = 1.15;
      ctx.save();
      ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
      for (let y = 0; y < this.rows; y++) {
        for (let x = 0; x < this.cols; x++) {
          const dx = x + 0.5 - (cabeza.x + 0.5);
          const dy = y + 0.5 - (cabeza.y + 0.5);
          const dist = Math.sqrt(dx * dx + dy * dy);
          // lo que queda por delante de la onda sigue a oscuras
          const oscuro = clamp((dist - radio) / borde, 0, 1);
          if (oscuro <= 0.01) continue;
          ctx.fillStyle = `rgba(0,0,0,${oscuro})`;
          ctx.fillRect(
            Math.round(ox + x * cell),
            Math.round(oy + y * cell),
            Math.ceil(cell),
            Math.ceil(cell),
          );
        }
      }
      // el frente de la onda deja un filo blanco un instante
      const filo = clamp(1 - Math.abs(this.reveal - 0.5) * 3.2, 0, 1) * 0.65;
      if (filo > 0.02) {
        ctx.strokeStyle = `rgba(255,255,255,${filo})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(ox + (cabeza.x + 0.5) * cell, oy + (cabeza.y + 0.5) * cell, Math.max(1, radio * cell), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }
}
