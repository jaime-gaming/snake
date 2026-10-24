import { K } from './grid.js?v=3';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export const DUEL_CFG = {
  cols: 20,
  rows: 20,
  wrap: false,
  startSpeed: 118,
  minSpeed: 74,
  walls: [[9, 9], [10, 9], [9, 10], [10, 10]],
};

const START = [
  { x: 4, y: 6, dir: { x: 1, y: 0 } },
  { x: 15, y: 13, dir: { x: -1, y: 0 } },
];

export class Duel {
  constructor(cfg, onEvent = () => {}) {
    this.cfg = cfg;
    this.onEvent = onEvent;
    this.cols = cfg.cols;
    this.rows = cfg.rows;
    this.reset();
  }

  emit(type, data) {
    this.onEvent(type, data);
  }

  reset() {
    this.wallSet = new Set(this.cfg.walls.map(([x, y]) => K(x, y)));
    this.snakes = START.map((sp) => {
      const body = [];
      for (let i = 0; i < 4; i++) body.push({ x: sp.x - sp.dir.x * i, y: sp.y - sp.dir.y * i });
      return {
        body,
        prev: body.map((p) => ({ ...p })),
        dir: { ...sp.dir },
        queue: [],
        grow: 0,
        score: 0,
        fruits: 0,
        alive: true,
      };
    });
    this.speed = this.cfg.startSpeed;
    this.acc = 0;
    this.state = 'ready';
    this.time = 0;
    this.shake = 0;
    this.food = null;
    this.particles = [];
    this.winner = null;
    this.spawnFood();
  }

  interval() {
    return Math.max(46, this.speed);
  }

  setDirection(i, dx, dy) {
    const snake = this.snakes[i];
    if (!snake || !snake.alive || this.state === 'over') return;
    if (this.state === 'ready') {
      this.state = 'running';
      this.emit('start');
    }
    const last = snake.queue.length ? snake.queue[snake.queue.length - 1] : snake.dir;
    if (dx === -last.x && dy === -last.y) return;
    if (dx === last.x && dy === last.y) return;
    if (snake.queue.length < 2) snake.queue.push({ x: dx, y: dy });
  }

  pause() {
    if (this.state === 'running' || this.state === 'ready') {
      this.savedState = this.state;
      this.state = 'paused';
    }
  }

  resume() {
    if (this.state === 'paused') this.state = this.savedState;
  }

  update(dtRaw) {
    const dt = Math.min(dtRaw, 120);
    this.time += dt;
    if (this.state === 'running') {
      this.acc += dt;
      let guard = 0;
      while (this.state === 'running' && this.acc >= this.interval() && guard++ < 6) {
        this.acc -= this.interval();
        this.step();
      }
    }
    this.shake = Math.max(0, this.shake - dt * 0.05);
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += (p.vx * dt) / 1000;
      p.y += (p.vy * dt) / 1000;
      p.vx *= 0.94;
      p.vy *= 0.94;
      p.life -= dt;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
  }

  step() {
    for (const snake of this.snakes) {
      if (snake.queue.length) {
        const d = snake.queue.shift();
        if (!(d.x === -snake.dir.x && d.y === -snake.dir.y)) snake.dir = d;
      }
      snake.prev = snake.body.map((p) => ({ ...p }));
    }

    const next = this.snakes.map((snake) => {
      let x = snake.body[0].x + snake.dir.x;
      let y = snake.body[0].y + snake.dir.y;
      if (this.cfg.wrap) {
        x = (x + this.cols) % this.cols;
        y = (y + this.rows) % this.rows;
      }
      return { x, y };
    });

    const dying = [false, false];
    const eating = [false, false];

    for (let i = 0; i < 2; i++) {
      const snake = this.snakes[i];
      if (!snake.alive) continue;
      const n = next[i];
      if (n.x < 0 || n.y < 0 || n.x >= this.cols || n.y >= this.rows) {
        dying[i] = true;
        continue;
      }
      eating[i] = !!(this.food && n.x === this.food.x && n.y === this.food.y);
      if (this.wallSet.has(K(n.x, n.y))) {
        dying[i] = true;
        continue;
      }

      const growing = snake.grow > 0 || eating[i];
      for (let j = 0; j < snake.body.length; j++) {
        if (!growing && j === snake.body.length - 1) continue;
        if (snake.body[j].x === n.x && snake.body[j].y === n.y) {
          dying[i] = true;
          break;
        }
      }
      if (dying[i]) continue;

      const other = this.snakes[1 - i];
      for (let j = 0; j < other.body.length - 1; j++) {
        if (other.body[j].x === n.x && other.body[j].y === n.y) {
          dying[i] = true;
          break;
        }
      }
    }

    if (next[0].x === next[1].x && next[0].y === next[1].y) dying[0] = dying[1] = true;
    if (
      (next[0].x === this.snakes[1].body[0].x && next[0].y === this.snakes[1].body[0].y) &&
      (next[1].x === this.snakes[0].body[0].x && next[1].y === this.snakes[0].body[0].y)
    ) {
      dying[0] = dying[1] = true;
    }

    for (let i = 0; i < 2; i++) {
      const snake = this.snakes[i];
      if (!snake.alive || dying[i]) continue;
      snake.body.unshift(next[i]);
      if (snake.grow > 0) snake.grow--;
      else snake.body.pop();
      if (eating[i] && this.food) {
        snake.score += 10;
        snake.fruits++;
        snake.grow++;
        this.speed = Math.max(this.cfg.minSpeed, this.speed - 1.4);
        this.burst(next[i].x + 0.5, next[i].y + 0.5, 12, '#ff2b2b');
        this.emit('eat', { player: i, score: snake.score });
        this.spawnFood();
      }
    }

    for (let i = 0; i < 2; i++) {
      if (!dying[i]) continue;
      const snake = this.snakes[i];
      snake.alive = false;
      this.shake = 10;
      const head = snake.body[0];
      this.burst(head.x + 0.5, head.y + 0.5, 22, '#ffffff');
      this.emit('death', { player: i });
    }

    if (dying[0] || dying[1]) {
      this.state = 'over';
      if (dying[0] && dying[1]) this.winner = null;
      else this.winner = dying[0] ? 1 : 0;
      this.emit('over', { winner: this.winner });
    }
  }

  freeCell() {
    const blocked = (x, y) => {
      if (this.wallSet.has(K(x, y))) return true;
      if (this.food && this.food.x === x && this.food.y === y) return true;
      return this.snakes.some((s) =>
        s.alive && s.body.some((b) => b.x === x && b.y === y));
    };
    for (let i = 0; i < 400; i++) {
      const x = Math.floor(Math.random() * this.cols);
      const y = Math.floor(Math.random() * this.rows);
      if (!blocked(x, y)) return { x, y };
    }
    return null;
  }

  spawnFood() {
    const cell = this.freeCell();
    if (cell) this.food = cell;
  }

  burst(x, y, n, color) {
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = 3 + Math.random() * 6;
      this.particles.push({
        x,
        y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        life: 240 + Math.random() * 280,
        max: 520,
        color,
      });
    }
  }

  posAt(snake, i, alpha) {
    const cur = snake.body[i];
    if (!cur) return null;
    const prev = snake.prev[i] || cur;
    const dx = cur.x - prev.x;
    const dy = cur.y - prev.y;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) return cur;
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
      ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    }

    ctx.fillStyle = '#141414';
    for (let x = 1; x < this.cols; x++) ctx.fillRect(Math.round(ox + x * cell), oy, 1, H);
    for (let y = 1; y < this.rows; y++) ctx.fillRect(ox, Math.round(oy + y * cell), W, 1);

    const inset = Math.max(1, Math.round(cell * 0.06));
    for (const [x, y] of this.cfg.walls) {
      const px = Math.round(ox + x * cell);
      const py = Math.round(oy + y * cell);
      ctx.strokeStyle = 'rgba(255,255,255,0.34)';
      ctx.lineWidth = 1;
      ctx.strokeRect(px + inset + 0.5, py + inset + 0.5, cell - inset * 2 - 1, cell - inset * 2 - 1);
    }

    if (this.food) {
      const pad = cell * 0.16;
      ctx.fillStyle = '#ff2b2b';
      ctx.fillRect(
        Math.round(ox + this.food.x * cell + pad),
        Math.round(oy + this.food.y * cell + pad),
        Math.round(cell - pad * 2),
        Math.round(cell - pad * 2),
      );
    }

    const alpha = this.state === 'running' ? clamp(this.acc / this.interval(), 0, 1) : 1;
    const gap = Math.max(1, Math.round(cell * 0.07));

    this.snakes.forEach((snake, idx) => {
      const filled = idx === 0;
      for (let i = snake.body.length - 1; i >= 0; i--) {
        const p = this.posAt(snake, i, alpha);
        if (!p) continue;
        const px = Math.round(ox + p.x * cell);
        const py = Math.round(oy + p.y * cell);
        if (filled) {
          ctx.fillStyle = snake.alive ? (i === 0 ? '#ffffff' : '#d8d8d8') : '#3a3a3a';
          ctx.fillRect(px + gap, py + gap, cell - gap * 2, cell - gap * 2);
        } else {
          ctx.strokeStyle = snake.alive ? '#ffffff' : '#3a3a3a';
          ctx.lineWidth = Math.max(1, cell * 0.1);
          ctx.strokeRect(
            px + gap + 0.5,
            py + gap + 0.5,
            cell - gap * 2 - 1,
            cell - gap * 2 - 1,
          );
          if (!snake.alive) {
            ctx.fillStyle = 'rgba(255,255,255,0.06)';
            ctx.fillRect(px + gap, py + gap, cell - gap * 2, cell - gap * 2);
          }
        }
      }
      const head = this.posAt(snake, 0, alpha);
      if (head) {
        const size = Math.max(2, Math.round(cell * 0.17));
        const cx = ox + (head.x + 0.5) * cell + snake.dir.x * cell * 0.19;
        const cy = oy + (head.y + 0.5) * cell + snake.dir.y * cell * 0.19;
        ctx.fillStyle = filled ? '#000' : '#fff';
        ctx.fillRect(Math.round(cx - size / 2), Math.round(cy - size / 2), size, size);
      }
    });

    ctx.save();
    for (const p of this.particles) {
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(ox + p.x * cell), Math.round(oy + p.y * cell), 1, 1);
    }
    ctx.restore();

    ctx.restore();
  }
}
