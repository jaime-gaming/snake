// Motor del juego. Rejilla pura + interpolación en el render.
// Sin dependencias: se puede probar en Node con un canvas falso.

const key = (x, y) => y * 4096 + x;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

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

  /* ---------------------------------------------------------------- estado */

  reset() {
    const cfg = this.cfg;
    this.wallSet = new Set(this.walls.map(([x, y]) => key(x, y)));
    const start = this.findStart();
    this.body = [];
    for (let i = 0; i < 4; i++) {
      this.body.push({ x: start.x - start.dir.x * i, y: start.y - start.dir.y * i });
    }
    this.prevBody = this.body.map((s) => ({ ...s }));
    this.dir = { x: start.dir.x, y: start.dir.y };
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
    this.bonus = null;
    this.portals = null;
    this.turbo = false;
    this.time = 0;
    this.shake = 0;
    this.flash = 0;
    this.particles = [];
    this.food = null;
    this.spawnFood();
    if (cfg.portals) this.placePortals();
  }

  findStart() {
    const free = (x, y) =>
      x >= 0 && y >= 0 && x < this.cols && y < this.rows && !this.wallSet.has(key(x, y));
    const mid = Math.floor(this.rows / 2);
    const near = (n, c) => {
      const out = [];
      for (let d = 0; d < n; d++) {
        if (c - d >= 0) out.push(c - d);
        if (d > 0 && c + d < n) out.push(c + d);
      }
      return out;
    };
    const rowOrder = near(this.rows, mid);
    const colOrder = near(this.cols, Math.floor(this.cols / 2));

    // primero en horizontal, cerca del centro
    for (const y of rowOrder) {
      for (let x = 0; x + 4 < this.cols; x++) {
        if (free(x, y) && free(x + 1, y) && free(x + 2, y) && free(x + 3, y) && free(x + 4, y)) {
          return { x: x + 3, y, dir: { x: 1, y: 0 } };
        }
      }
    }
    // si no, en vertical (cabeza abajo, sube)
    for (const x of colOrder) {
      for (let y = 0; y + 4 < this.rows; y++) {
        if (free(x, y) && free(x, y + 1) && free(x, y + 2) && free(x, y + 3) && free(x, y + 4)) {
          return { x, y: y + 3, dir: { x: 0, y: -1 } };
        }
      }
    }
    // último recurso
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        if (free(x, y)) return { x, y, dir: { x: 1, y: 0 } };
      }
    }
    return { x: 4, y: mid, dir: { x: 1, y: 0 } };
  }

  get multiplier() {
    return Math.min(5, 1 + Math.floor(this.chain / 2));
  }

  interval() {
    return Math.max(24, this.speed * (this.turbo ? 0.62 : 1));
  }

  /* --------------------------------------------------------------- control */

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

  /* ----------------------------------------------------------------- bucle */

  update(dtRaw) {
    const dt = Math.min(dtRaw, 120);
    this.time += dt;
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

  /* ----------------------------------------------------------------- paso */

  step() {
    const cfg = this.cfg;
    if (this.queue.length) {
      const d = this.queue.shift();
      if (!(d.x === -this.dir.x && d.y === -this.dir.y)) this.dir = d;
    }

    this.prevBody = this.body.map((s) => ({ ...s }));

    let hx = this.body[0].x + this.dir.x;
    let hy = this.body[0].y + this.dir.y;

    if (cfg.wrap) {
      hx = (hx + this.cols) % this.cols;
      hy = (hy + this.rows) % this.rows;
    } else if (hx < 0 || hy < 0 || hx >= this.cols || hy >= this.rows) {
      return this.die('muro', this.body[0].x, this.body[0].y);
    }

    if (this.portals) {
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

    if (this.wallSet.has(key(hx, hy))) return this.die('muro', hx, hy);

    const eats = this.food && hx === this.food.x && hy === this.food.y;
    const takesBonus = this.bonus && hx === this.bonus.x && hy === this.bonus.y;
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
    if (this.portals && cfg.portalEvery && this.fruits % cfg.portalEvery === 0) this.placePortals();
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
    this.emit('bonus', { score: this.score });
  }

  die(reason, x, y) {
    if (this.state !== 'running') return;
    this.state = 'dead';
    this.turbo = false;
    this.shake = 12;
    this.burst((x ?? 0) + 0.5, (y ?? 0) + 0.5, 26, '#ffffff', 11);
    this.emit('die', { reason, score: this.score, fruits: this.fruits });
  }

  /* ---------------------------------------------------------------- piezas */

  freeCell(pad = 0) {
    const cfg = this.cfg;
    const blocked = (x, y) => {
      if (this.wallSet.has(key(x, y))) return true;
      if (this.body.some((s) => s.x === x && s.y === y)) return true;
      if (this.food && this.food.x === x && this.food.y === y) return true;
      if (this.bonus && this.bonus.x === x && this.bonus.y === y) return true;
      if (this.portals && this.portals.some((p) =>
        (p.a.x === x && p.a.y === y) || (p.b.x === x && p.b.y === y))) return true;
      return false;
    };
    for (let i = 0; i < 600; i++) {
      const x = pad + Math.floor(Math.random() * (this.cols - pad * 2));
      const y = pad + Math.floor(Math.random() * (this.rows - pad * 2));
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

  placePortals() {
    const a = this.freeCell(2);
    let b = null;
    for (let i = 0; i < 60; i++) {
      const c = this.freeCell(2);
      if (!c) break;
      if (Math.abs(c.x - a.x) + Math.abs(c.y - a.y) >= 6) { b = c; break; }
    }
    if (!a || !b) return;
    this.portals = [{ a, b }];
    this.emit('portals', { a, b });
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

  /* ---------------------------------------------------------------- dibujo */

  posAt(i, alpha) {
    const cur = this.body[i];
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

    // rejilla
    ctx.fillStyle = '#131313';
    for (let x = 1; x < this.cols; x++) {
      ctx.fillRect(Math.round(ox + x * cell), oy, 1, H);
    }
    for (let y = 1; y < this.rows; y++) {
      ctx.fillRect(ox, Math.round(oy + y * cell), W, 1);
    }

    // muros
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

    // portales
    if (this.portals) {
      const t = this.time / 260;
      for (const p of this.portals) {
        for (const c of [p.a, p.b]) {
          const cx = ox + (c.x + 0.5) * cell;
          const cy = oy + (c.y + 0.5) * cell;
          const r = cell * (0.3 + 0.03 * Math.sin(t));
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = Math.max(1, cell * 0.055);
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = '#fff';
          ctx.fillRect(Math.round(cx - 1), Math.round(cy - 1), 2, 2);
        }
      }
    }

    // comida
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

    // bonus
    if (this.bonus) {
      const blink = this.bonus.ttl < 1800 && Math.floor(this.time / 130) % 2 === 0;
      if (!blink) {
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
    }

    // serpiente
    const alpha = this.state === 'running' ? clamp(this.acc / this.interval(), 0, 1) : 1;
    const gap = Math.max(1, Math.round(cell * 0.07));
    for (let i = this.body.length - 1; i >= 0; i--) {
      const p = this.posAt(i, alpha);
      const px = Math.round(ox + p.x * cell);
      const py = Math.round(oy + p.y * cell);
      const shade = i === 0 ? '#ffffff' : i < 3 ? '#f2f2f2' : '#dcdcdc';
      ctx.fillStyle = shade;
      ctx.fillRect(px + gap, py + gap, cell - gap * 2, cell - gap * 2);
    }

    // ojo / dirección en la cabeza
    if (this.body.length) {
      const h = this.posAt(0, this.state === 'running' ? clamp(this.acc / this.interval(), 0, 1) : 1);
      const size = Math.max(2, Math.round(cell * 0.17));
      const cx = ox + (h.x + 0.5) * cell + this.dir.x * cell * 0.19;
      const cy = oy + (h.y + 0.5) * cell + this.dir.y * cell * 0.19;
      ctx.fillStyle = '#000';
      ctx.fillRect(Math.round(cx - size / 2), Math.round(cy - size / 2), size, size);
    }

    // partículas
    for (const p of this.particles) {
      const a = clamp(p.life / p.max, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      const s = Math.max(1, p.size);
      ctx.fillRect(Math.round(ox + p.x * cell), Math.round(oy + p.y * cell), s, s);
    }
    ctx.globalAlpha = 1;

    ctx.restore();

    // destello de portal
    if (this.flash > 0.01) {
      ctx.fillStyle = `rgba(255,255,255,${this.flash * 0.07})`;
      ctx.fillRect(0, 0, view.width, view.height);
    }
  }
}
