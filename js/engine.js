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
    this.walls = (cfg.walls || []).slice();
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
    this.chainWindow = cfg.chainWindow || 3200;
    this.hitStop = 0;
    this.crash = null;
    this.wallTicks = 0;
    this.fx = { ghost: 0, slow: 0 };
    this.bonus = null;
    this.power = null;
    this.hunter = null;
    this.hunterTick = 0;
    this.pellets = [];
    this.reveal = 0;
    this.chomp = 0;
    this.pendingWalls = [];
    this.turbo = false;
    this.time = 0;
    this.shake = 0;
    this.flash = 0;
    this.particles = [];
    this.food = null;
    this.spawnFood();
    if (cfg.hunter) {
      this.placeHunter();
      this.hunter.recarga = 0;
      this.hunter.movido = 0;
      this.hunter.paso = 0;
      const cuantos = Math.max(2, cfg.hunterPellets || 2);
      for (let i = 0; i < cuantos; i++) this.spawnPellet();
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
    const slow = this.fx.slow > 0 ? 1.5 : 1;
    return Math.max(42, this.speed * (this.turbo ? 0.68 : 1) * slow);
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
    // golpe congelado: medio segundo de impacto antes de que corran las partículas
    if (this.hitStop > 0) {
      this.hitStop = Math.max(0, this.hitStop - dt);
      this.updateFx(dt * 0.25);
      return;
    }
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
    if (this.reveal < 1) this.reveal = Math.min(1, this.reveal + dt / 1000);
    if (this.hunter && this.hunter.recarga > 0) {
      this.hunter.recarga -= dt;
      if (this.hunter.recarga <= 0) this.renacerCazador();
    }
    if (this.chomp > 0) this.chomp = Math.max(0, this.chomp - dt / 150);
    for (let i = this.pendingWalls.length - 1; i >= 0; i--) {
      const w = this.pendingWalls[i];
      w.t += dt;
      if (w.t >= w.dur) {
        this.pendingWalls.splice(i, 1);
        this.levantarMuro(w);
      }
    }
    if (this.crash) {
      this.crash.t = Math.min(1600, this.crash.t + dt);
      // la serpiente se deshace de la cabeza a la cola, un anillo cada 18 ms
      const objetivo = Math.min(this.body.length, Math.floor(this.crash.t / 18));
      while (this.crash.popped < objetivo) {
        const c = this.body[this.crash.popped];
        this.crash.popped++;
        if (!c) break;
        this.burst(c.x + 0.5, c.y + 0.5, 2, '#ffffff', 5);
      }
    }
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

    if (!ghost && this.wallSet.has(K(hx, hy))) return this.die('muro', hx, hy);
    // el cuerpo del cazador no te mata: le muerdes el anillo y sigues.
    // sólo su cabeza puede comerte (y sólo si cae sobre la tuya)
    if (!ghost && this.hunter) {
      const golpe = this.hunter.body.findIndex((c) => c.x === hx && c.y === hy);
      if (golpe === 0) return this.die('cazador', hx, hy);
      if (golpe > 0) {
        this.hunter.body.splice(golpe, 1);
        this.hunter.prev.splice(golpe, 1);
        this.burst(hx + 0.5, hy + 0.5, 10, '#c21414', 5);
        this.score += 20;
        this.shake = Math.max(this.shake, 3);
        this.chomp = 1;
        this.emit('bite', { x: hx, y: hy });
      }
    }

    const eats = this.food && hx === this.food.x && hy === this.food.y;
    const takesBonus = this.bonus && hx === this.bonus.x && hy === this.bonus.y;
    const takesPower = this.power && hx === this.power.x && hy === this.power.y;
    const willGrow = this.grow > 0 || eats || takesBonus;

    // con el fantasma puesto atraviesas también tu propio cuerpo
    if (!ghost) {
      for (let i = 0; i < this.body.length; i++) {
        if (!willGrow && i === this.body.length - 1) continue;
        if (this.body[i].x === hx && this.body[i].y === hy) return this.die('cola', hx, hy);
      }
    }

    this.body.unshift({ x: hx, y: hy });
    if (this.grow > 0) this.grow--;
    else this.body.pop();

    if (eats) this.eatFood();
    if (takesBonus) this.eatBonus();
    if (takesPower) this.takePower();
    if (this.cfg.hunter) {
      this.robaPunto();
      this.moveHunter();
    }
  }

  eatFood() {
    const cfg = this.cfg;
    const food = this.food;
    this.fruits++;
    this.grow += 1;
    const rapido = this.chainTimer > this.chainWindow * 0.62;
    this.chain = Math.min(this.chain + 1, 30);
    this.chainTimer = this.chainWindow;
    this.score += 10 * this.multiplier + (rapido ? 5 * this.multiplier : 0);
    this.speed = Math.max(cfg.minSpeed, this.speed - (cfg.accelPerFood || 0));
    this.shake = 2.6;
    this.chomp = 1;
    const sube = this.multiplier > 1 && this.chain % 2 === 0;
    if (sube) {
      this.flash = Math.max(this.flash, 0.45);
      this.emit('combo', { multiplier: this.multiplier });
    }
    this.burst(food.x + 0.5, food.y + 0.5, sube ? 16 : 10, '#ff2b2b', 7);
    // clásico: pasada la mitad de la partida empiezan a salir muros sueltos
    if (cfg.wallFrom && this.fruits > cfg.wallFrom && cfg.wallEvery &&
      this.fruits % cfg.wallEvery === 0 && this.walls.length < (cfg.wallMax || 999)) {
      this.raiseWall();
    }
    this.emit('eat', { chain: this.chain, multiplier: this.multiplier });
    this.spawnFood();
    if (cfg.bonusEvery && this.fruits % cfg.bonusEvery === 0) this.spawnBonus();
    if (cfg.powerEvery && this.fruits % cfg.powerEvery === 0) this.spawnPower();
    if (cfg.goal && this.fruits >= cfg.goal) {
      this.state = 'cleared';
      this.emit('clear', { fruits: this.fruits, score: this.score });
    }
  }

  // los puntos azules también son para ti: quitaselo y el cazador no crece
  robaPunto() {
    const indice = this.pellets.findIndex((p) => p.x === this.body[0].x && p.y === this.body[0].y);
    if (indice < 0) return;
    this.pellets.splice(indice, 1);
    this.grow += 1;
    this.score += 15 * this.multiplier;
    this.chain = Math.min(this.chain + 1, 30);
    this.chainTimer = this.chainWindow;
    this.shake = 3;
    this.chomp = 1;
    this.burst(this.body[0].x + 0.5, this.body[0].y + 0.5, 12, '#3d7bff', 6);
    this.spawnPellet();
    this.emit('pellet', { score: this.score });
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

  // BORRAR-COMPETITIVO · la reaparición con penalización se retiró para v1.0.

  die(reason, x, y) {
    if (this.state !== 'running') return;
    this.state = 'dead';
    this.turbo = false;
    this.shake = 11;
    this.flash = 0.8;
    this.hitStop = 90;
    const impactox = x ?? this.body[0].x;
    const impactoY = y ?? this.body[0].y;
    this.crash = { x: impactox, y: impactoY, t: 0, reason, popped: 0 };
    this.burst(impactox + 0.5, impactoY + 0.5, 22, '#ffffff', 10);
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

  // hueco libre alcanzable desde una casilla (con tope para no gastar)
  spaceFrom(celda, bloqueado, tope = 260) {
    const visto = new Set([K(celda.x, celda.y)]);
    const cola = [celda];
    let cabeza = 0;
    while (cabeza < cola.length && visto.size < tope) {
      const c = cola[cabeza++];
      for (const [dx, dy] of DIRS) {
        const nx = c.x + dx;
        const ny = c.y + dy;
        if (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows) continue;
        const k = K(nx, ny);
        if (visto.has(k) || bloqueado.has(k)) continue;
        visto.add(k);
        cola.push({ x: nx, y: ny });
      }
    }
    return visto.size;
  }

  // piloto automático: una demo clara de cada modo en los menús
  botTurn() {
    if (this.state !== 'ready' && this.state !== 'running') return;
    const cabeza = this.body[0];
    const wrap = !!this.cfg.wrap || this.ghosting;
    const ocupado = this.blockedSet({ omitTail: true });
    const haciaComida = this.food
      ? bfsStep({
        start: cabeza,
        goal: this.food,
        blocked: ocupado,
        cols: this.cols,
        rows: this.rows,
        wrap,
      })
      : null;

    // memoria corta: no dar vueltas sobre las mismas casillas
    if (!this.botTrail) this.botTrail = new Map();
    for (const [k, v] of this.botTrail) this.botTrail.set(k, v - 1);
    this.botTrail.set(K(cabeza.x, cabeza.y), 14);

    let mejor = null;
    let mejorPunto = -Infinity;
    const movimientos = [];

    for (const [dx, dy] of DIRS) {
      if (dx === -this.dir.x && dy === -this.dir.y) continue;
      let nx = cabeza.x + dx;
      let ny = cabeza.y + dy;
      if (wrap) {
        nx = (nx + this.cols) % this.cols;
        ny = (ny + this.rows) % this.rows;
      } else if (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows) {
        continue;
      }
      if (ocupado.has(K(nx, ny))) {
        continue;
      }
      const destino = { x: nx, y: ny };

      let puntos = 0;
      if (haciaComida && dx === haciaComida.x && dy === haciaComida.y) puntos += 100;
      if (this.food) {
        puntos -= (Math.abs(destino.x - this.food.x) + Math.abs(destino.y - this.food.y)) * 0.6;
      }
      // aire: no meterse en un callejón sin salida
      const espacio = this.spaceFrom(destino, ocupado);
      puntos += Math.min(espacio, 120) * 1.1;
      if (espacio <= this.body.length + 1) puntos -= 900;
      // el cazador: cuanto más lejos, mejor
      if (this.hunter) {
        const jefe = this.hunter.body[0];
        puntos += Math.min(20, Math.abs(destino.x - jefe.x) + Math.abs(destino.y - jefe.y)) * 1.5;
      }
      const visto = this.botTrail.get(K(nx, ny));
      if (visto > 0) puntos -= visto * 7;

      const movimiento = { dx, dy, puntos };
      movimientos.push(movimiento);
      if (puntos > mejorPunto) {
        mejorPunto = puntos;
        mejor = movimiento;
      }
    }

    if (mejor) {
      this.setDirection(mejor.dx, mejor.dy);
      return;
    }
    // sin salida (o choque sin rumbo peligroso): cualquier casilla libre
    for (const [dx, dy] of DIRS) {
      const nx = cabeza.x + dx;
      const ny = cabeza.y + dy;
      if (!wrap && (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows)) continue;
      if (ocupado.has(K((nx + this.cols) % this.cols, (ny + this.rows) % this.rows))) continue;
      this.setDirection(dx, dy);
      return;
    }
  }

  // casillas libres a las que se puede llegar desde la cabeza: la comida nunca cae en un hueco cerrado
  reachableFree() {
    const muro = new Set(this.wallSet);
    for (let i = 0; i < this.body.length - 1; i++) muro.add(K(this.body[i].x, this.body[i].y));
    if (this.hunter) for (const p of this.hunter.body) muro.add(K(p.x, p.y));
    const inicio = this.body[0];
    const visto = new Set([K(inicio.x, inicio.y)]);
    const cola = [inicio];
    const libres = [];
    for (let c = 0; c < cola.length; c++) {
      const p = cola[c];
      for (const [dx, dy] of DIRS) {
        const nx = p.x + dx;
        const ny = p.y + dy;
        if (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows) continue;
        const k = K(nx, ny);
        if (visto.has(k) || muro.has(k)) continue;
        visto.add(k);
        cola.push({ x: nx, y: ny });
        libres.push({ x: nx, y: ny });
      }
    }
    return libres;
  }

  ocupada(x, y) {
    if (this.body.some((s) => s.x === x && s.y === y)) return true;
    if (this.bonus && this.bonus.x === x && this.bonus.y === y) return true;
    if (this.power && this.power.x === x && this.power.y === y) return true;
    if (this.hunter && this.hunter.body.some((p) => p.x === x && p.y === y)) return true;
    if (this.pellets.some((p) => p.x === x && p.y === y)) return true;
    return false;
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
      if (this.pendingWalls.some((w) => w.x === x && w.y === y)) return true;
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
    const libres = this.reachableFree().filter((c) => !this.ocupada(c.x, c.y));
    if (libres.length) {
      this.food = libres[rand(libres.length)];
      return;
    }
    const celda = this.freeCell(0);
    if (celda) this.food = celda;
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

  // el muro avisa antes de cerrarse: enseña dónde va a salir y da tiempo a apartarse
  raiseWall() {
    const tope = this.cfg.wallMax || 999;
    if (this.walls.length + this.pendingWalls.length >= tope) return;
    const cabeza = this.body[0];
    const cercaDeSerpiente = (c) =>
      this.body.some((s) => Math.abs(s.x - c.x) + Math.abs(s.y - c.y) <= 2);
    for (let i = 0; i < 80; i++) {
      const c = this.freeCell(1);
      if (!c) return;
      const lejos = Math.abs(c.x - cabeza.x) + Math.abs(c.y - cabeza.y) >= 5;
      const hueco = DIRS.some(([dx, dy]) => !this.wallSet.has(K(c.x + dx, c.y + dy)));
      if (!lejos || !hueco || cercaDeSerpiente(c)) continue;
      this.pendingWalls.push({ x: c.x, y: c.y, t: 0, dur: 700 });
      this.emit('wallSoon', { x: c.x, y: c.y });
      return;
    }
  }

  levantarMuro(c) {
    if (this.wallSet.has(K(c.x, c.y))) return;
    if (this.body.some((s) => s.x === c.x && s.y === c.y)) return;
    if (this.food && this.food.x === c.x && this.food.y === c.y) return;
    if (this.hunter && this.hunter.body.some((p) => p.x === c.x && p.y === c.y)) return;
    this.walls.push([c.x, c.y]);
    this.wallSet.add(K(c.x, c.y));
    this.burst(c.x + 0.5, c.y + 0.5, 8, 'rgba(255,255,255,0.8)', 4);
    this.shake = 2;
    this.emit('wall', { x: c.x, y: c.y });
  }

  // el cazador se estrella contra ti: estalla, desaparece un momento y vuelve
  // por la mitad de largo, lejos. matarlo no te da la partida, pero te da aire
  matarCazador() {
    const h = this.hunter;
    for (const c of h.body) this.burst(c.x + 0.5, c.y + 0.5, 5, '#c21414', 4);
    this.score += 100;
    this.flash = 0.75;
    this.shake = 6;
    this.hitStop = 90;
    h.recarga = 1100;
    h.reaparece = Math.max(3, Math.ceil(h.body.length / 2));
    h.aim = null;
    h.cazando = false;
    this.emit('hunterDies', { x: h.body[0].x, y: h.body[0].y });
  }

  renacerCazador() {
    const h = this.hunter;
    const largo = h.reaparece || 3;
    this.placeHunter();
    const nuevo = this.hunter;
    const libre = (x, y) =>
      x >= 0 && y >= 0 && x < this.cols && y < this.rows &&
      !this.wallSet.has(K(x, y)) &&
      !nuevo.body.some((c) => c.x === x && c.y === y) &&
      !this.body.some((c) => c.x === x && c.y === y);
    while (nuevo.body.length < largo) {
      const cola = nuevo.body[nuevo.body.length - 1];
      const antes = nuevo.body[nuevo.body.length - 2];
      let siguiente = null;
      for (const [dx, dy] of DIRS) {
        const nx = cola.x + dx;
        const ny = cola.y + dy;
        if (antes && nx === antes.x && ny === antes.y) continue;
        if (!libre(nx, ny)) continue;
        siguiente = { x: nx, y: ny };
        break;
      }
      if (!siguiente) break;
      nuevo.body.push(siguiente);
      nuevo.prev.push({ ...siguiente });
    }
    nuevo.recarga = 0;
    nuevo.cazando = false;
    nuevo.movido = this.time;
    nuevo.paso = Math.max(1, this.hunterCadence() * this.interval());
    this.flash = 0.3;
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
      aim: null,
      botSiguienteFallo: 48 + rand(30),
    };
    this.hunterTick = 0;
  }

  spawnPellet() {
    if (!this.hunter) return;
    const cabeza = this.body[0];
    const tope = Math.max(2, this.cfg.hunterPellets || 2);
    if (this.pellets.length >= tope) return;
    const libres = this.reachableFree().filter((c) => !this.ocupada(c.x, c.y));
    const lejos = libres.filter((c) => Math.abs(c.x - cabeza.x) + Math.abs(c.y - cabeza.y) >= 4);
    const donde = lejos.length ? lejos : libres;
    if (donde.length) {
      this.pellets.push({ ...donde[rand(donde.length)] });
      return;
    }
    // acorralado: cualquier casilla libre vale, aunque quede cerca
    const c = this.freeCell(0);
    if (c) this.pellets.push({ ...c });
  }

  // ritmo del cazador: acelera cuando ya es largo, cuando lo tiene cerca y del todo al estar lleno
  hunterCadence() {
    const h = this.hunter;
    if (!h) return 2;
    const tope = this.cfg.hunterCap || 18;
    if (h.body.length >= tope) return 1;
    const cabeza = this.body[0];
    const jefe = h.body[0];
    const distancia = Math.abs(jefe.x - cabeza.x) + Math.abs(jefe.y - cabeza.y);
    if (h.body.length >= this.hunterUmbral() && distancia <= 3) return 1;

    const normal = h.body.length >= this.hunterUmbral() ? 2 : 4;
    const objetivo = this.hunterTarget();
    const cercaDelObjetivo = Math.abs(jefe.x - objetivo.x) + Math.abs(jefe.y - objetivo.y) <= 2;
    const cercaDelJugador = this.hunterPelea && distancia <= 5;
    // impulso: acelera una marcha al ir a por un punto o al cerrar sobre ti
    return cercaDelObjetivo || cercaDelJugador ? Math.max(1, normal - 1) : normal;
  }

  // cuánto lleva andado el cazador hacia su casilla nueva (0 a 1), para que no salte
  get hunterAvance() {
    const h = this.hunter;
    if (!h || h.recarga > 0) return 1;
    if (this.state !== 'running') return 1;
    return clamp((this.time - (h.movido || 0)) / Math.max(1, h.paso || 1), 0, 1);
  }

  // ya te está cazando (antes sólo comía puntos)
  get hunterPelea() {
    return !!this.hunter && !(this.hunter.recarga > 0) &&
      this.hunter.body.length >= this.hunterUmbral();
  }

  // cuándo deja de comer y empieza a cazarte: dos tercios de su tope
  hunterUmbral() {
    return Math.max(6, Math.round((this.cfg.hunterCap || 18) * 0.66));
  }

  // a qué va: a comer si es corta, a cortarte el paso si es larga y a por ti si ya está llena
  hunterTarget() {
    const h = this.hunter;
    const cabeza = this.body[0];
    const tope = this.cfg.hunterCap || 18;
    if (h.body.length >= tope) return { x: cabeza.x, y: cabeza.y };
    if (h.body.length >= this.hunterUmbral()) {
      const vista = Math.max(2, this.cfg.hunterSight || 4);
      let x = cabeza.x;
      let y = cabeza.y;
      for (let i = 0; i < vista; i++) {
        const nx = x + this.dir.x;
        const ny = y + this.dir.y;
        if (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows) break;
        if (this.wallSet.has(K(nx, ny))) break;
        x = nx;
        y = ny;
      }
      return { x, y };
    }
    const jefe = h.body[0];
    let mejor = null;
    let cerca = Infinity;
    for (const p of this.pellets) {
      const d = Math.abs(p.x - jefe.x) + Math.abs(p.y - jefe.y);
      if (d < cerca) {
        cerca = d;
        mejor = p;
      }
    }
    return mejor || cabeza;
  }

  // casillas libres que le quedan desde una posición (con tope, para no gastar)
  hunterSpace(origen, ocupado, tope = 90) {
    const visto = new Set([K(origen.x, origen.y)]);
    const cola = [origen];
    let cabeza = 0;
    while (cabeza < cola.length && visto.size < tope) {
      const c = cola[cabeza++];
      for (const [dx, dy] of DIRS) {
        const nx = c.x + dx;
        const ny = c.y + dy;
        if (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows) continue;
        const k = K(nx, ny);
        if (visto.has(k) || ocupado.has(k)) continue;
        visto.add(k);
        cola.push({ x: nx, y: ny });
      }
    }
    return visto.size;
  }

  moveHunter() {
    const h = this.hunter;
    if (!h) return;
    this.hunterTick++;
    if (h.recarga > 0) return;
    if (this.hunterTick % this.hunterCadence() !== 0) return;

    let error = '';
    if (this.hunterTick >= h.botSiguienteFallo) {
      // pequeños titubeos; más raro que elija mal o se estrelle
      h.botSiguienteFallo = this.hunterTick + 48 + rand(40);
      const suerte = Math.random();
      if (suerte < 0.06) return; // se queda pensando y pierde este movimiento
      if (suerte < 0.10) error = 'choque';
      else if (suerte < 0.25) error = 'giro';
    }

    h.prev = h.body.map((p) => ({ ...p }));
    h.movido = this.time;
    h.paso = Math.max(1, this.hunterCadence() * this.interval());
    const cabeza = h.body[0];
    const objetivo = this.hunterTarget();
    // primer aviso: acaba de pasar de comer a cazarte
    if (this.hunterPelea && !h.cazando) {
      h.cazando = true;
      this.flash = 0.6;
      this.shake = 4;
      this.emit('hunterHunt', { x: cabeza.x, y: cabeza.y });
    }

    const ocupadoCuerpo = new Set();
    for (let i = 0; i < h.body.length - 1; i++) ocupadoCuerpo.add(K(h.body[i].x, h.body[i].y));
    // tu cuerpo le cuesta caro: puede cruzarlo, pero si se estrella revienta.
    // la cabeza y la cola no cuentan aquí; la cabeza se mira aparte y la cola se mueve
    const cuerpoJugador = new Set(
      this.body.slice(1, -1).map((s) => K(s.x, s.y)),
    );
    // corto va a comer y no te toca: tu cabeza tampoco es paso para él.
    // a partir de siete anillos ya te caza, y ahí sí puede caer sobre ti
    const agresivo = this.hunterPelea;
    const bloqueado = new Set([...this.wallSet, ...ocupadoCuerpo]);
    const tuCabeza = K(this.body[0].x, this.body[0].y);
    if (!agresivo) bloqueado.add(tuCabeza);

    // por dónde iría si no hubiera trampas: una casilla más cerca del objetivo
    const ideal = bfsStep({
      start: cabeza,
      goal: objetivo,
      blocked: bloqueado,
      cols: this.cols,
      rows: this.rows,
      wrap: false,
    });

    let elegido = null;
    let mejorPunto = -Infinity;
    const movimientos = [];
    let puedeChocar = false;

    for (const [dx, dy] of DIRS) {
      const nx = cabeza.x + dx;
      const ny = cabeza.y + dy;
      if (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows) {
        puedeChocar = true;
        continue;
      }
      const k = K(nx, ny);
      if (bloqueado.has(k)) {
        puedeChocar = true;
        continue;
      }
      const reversa = dx === -h.dir.x && dy === -h.dir.y;

      let puntos = 0;
      // rematar: si cae sobre tu cabeza, gana (sólo cuando ya te caza)
      const sobreCabeza = this.body[0].x === nx && this.body[0].y === ny;
      if (sobreCabeza && agresivo) puntos += 1200;
      puntos -= (Math.abs(nx - objetivo.x) + Math.abs(ny - objetivo.y)) * 12;
      if (ideal && dx === ideal.x && dy === ideal.y) puntos += 46;
      if (reversa) puntos -= 40;

      const ocupadoDestino = new Set([...bloqueado]);
      ocupadoDestino.delete(K(cabeza.x, cabeza.y));
      const espacio = this.hunterSpace({ x: nx, y: ny }, ocupadoDestino);
      puntos += Math.min(espacio, 60) * 0.7;
      if (espacio < 8) puntos -= 300;
      // no meterse justo al lado de la cabeza del jugador si aún es corta
      if (Math.abs(nx - this.body[0].x) + Math.abs(ny - this.body[0].y) === 1 && h.body.length < 5) {
        puntos -= 60;
      }
      // tu cuerpo no le bloquea, pero estrellarse contra él lo revienta
      if (cuerpoJugador.has(k)) puntos -= 400;

      movimientos.push({ x: nx, y: ny, puntos });
      if (puntos > mejorPunto) {
        mejorPunto = puntos;
        elegido = { x: nx, y: ny };
      }
    }

    if (error === 'choque' && puedeChocar) {
      // golpea un muro o su propio cuerpo: estalla y vuelve corto, como cuando te muerde
      this.matarCazador();
      return;
    }
    if (error === 'giro' && movimientos.length > 1) {
      const peor = movimientos.sort((a, b) => a.puntos - b.puntos)[0];
      elegido = { x: peor.x, y: peor.y };
    }

    if (!elegido) {
      // acorralado: se muda a otra zona en vez de quedarse clavado
      this.burst(cabeza.x + 0.5, cabeza.y + 0.5, 12, '#c91616', 7);
      this.placeHunter();
      return;
    }

    // marca a dónde va: el aviso se ve antes de que llegue
    h.aim = { x: objetivo.x, y: objetivo.y };

    h.dir = { x: elegido.x - cabeza.x, y: elegido.y - cabeza.y };
    h.body.unshift(elegido);
    if (h.grow > 0) h.grow--;
    else h.body.pop();

    // te muerde sólo si su cabeza cae sobre la tuya
    if (this.state === 'running' && !this.ghosting &&
      this.body[0].x === elegido.x && this.body[0].y === elegido.y) {
      this.die('cazador', elegido.x, elegido.y);
      return;
    }
    // y si se estrella contra tu cuerpo, revienta: muere y vuelve más corto
    if (this.state === 'running' && this.body.some((c) => c.x === elegido.x && c.y === elegido.y)) {
      this.matarCazador(elegido);
      return;
    }

    const indice = this.pellets.findIndex((p) => p.x === elegido.x && p.y === elegido.y);
    if (indice >= 0) {
      this.pellets.splice(indice, 1);
      const tope = this.cfg.hunterCap || 18;
      if (h.body.length < tope) h.grow += 1;
      this.burst(elegido.x + 0.5, elegido.y + 0.5, 8, '#3d7bff', 5);
      const cuantos = Math.max(2, this.cfg.hunterPellets || 2);
      for (let n = 0; n < cuantos + 2 && this.pellets.length < cuantos; n++) this.spawnPellet();
      this.emit('hunterEat', { largo: h.body.length, lleno: h.body.length >= tope });
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

  // el fantasma se apaga en cuatro escalones durante el último 1,6 s
  get ghostPaso() {
    if (!this.ghosting) return 0;
    return Math.min(1, Math.ceil((this.fx.ghost / 1600) * 4) / 4);
  }

  // la fruta que cierra el nivel
  get ultimaFruta() {
    return !!this.cfg.goal && this.fruits >= this.cfg.goal - 1;
  }

  // el borde no es un marco fijo: donde hay muro se marca, y donde no,
  // sólo aparece cuando te acercas. el bloque por el que vas a salir se enciende
  alfaBorde(cx, cy, sentido) {
    const cabeza = this.body[0] || { x: 0, y: 0 };
    const dist = Math.abs(cx - cabeza.x) + Math.abs(cy - cabeza.y);
    if (this.wallSet.has(K(cx, cy))) return 0.5;
    const rumbo = this.dir || { x: 1, y: 0 };
    const salida = rumbo.x < 0 ? 'izq' : rumbo.x > 0 ? 'der' : rumbo.y < 0 ? 'arriba' : 'abajo';
    const esSalida = sentido === salida &&
      (sentido === 'arriba' || sentido === 'abajo' ? cx === cabeza.x : cy === cabeza.y);
    // si darse contra él mata, el borde se ve siempre con contraste suave y estable
    if (!(this.cfg.wrap || this.ghosting)) {
      return esSalida && dist <= 4 ? 0.58 : 0.28;
    }
    // si no mata (frenesí, fantasma), sólo se marca al acercarse, sin parpadear
    if (this.reveal < 1) {
      const luz = 1.2 + this.reveal * 17;
      const lejos = Math.max(Math.abs(cx - cabeza.x), Math.abs(cy - cabeza.y));
      if (lejos <= luz + 1) return 0.22 * (1 - this.reveal);
    }
    if (dist > 4) return 0;
    return esSalida ? 0.58 : 0.12;
  }

  draw(ctx, view) {
    const { cell, ox, oy } = view;
    const W = this.cols * cell;
    const H = this.rows * cell;
    const lado = Math.round(cell);
    const caja = (x, y, margen, ancho) => [
      Math.round(ox + x * cell) + margen,
      Math.round(oy + y * cell) + margen,
      Math.max(2, ancho),
      Math.max(2, ancho),
    ];

    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, view.width, view.height);

    ctx.save();
    if (this.shake > 0.2) {
      const s = this.shake;
      ctx.translate(Math.round((Math.random() - 0.5) * s), Math.round((Math.random() - 0.5) * s));
    }

    // rejilla de 1 px
    ctx.fillStyle = '#141414';
    for (let x = 1; x < this.cols; x++) ctx.fillRect(Math.round(ox + x * cell), oy, 1, H);
    for (let y = 1; y < this.rows; y++) ctx.fillRect(ox, Math.round(oy + y * cell), W, 1);

    // ---- borde: bloques. donde hay muro se marca; donde no, sólo al acercarte,
    // y el bloque por el que vas a salir se enciende (aviso de salida)
    const grosor = Math.max(2, Math.round(cell * 0.2));
    const tramoBorde = (x0, y0, w, h, cx, cy, sentido) => {
      const alfa = this.alfaBorde(cx, cy, sentido);
      if (alfa < 0.02) return;
      ctx.fillStyle = `rgba(255,255,255,${alfa.toFixed(2)})`;
      ctx.fillRect(Math.round(x0), Math.round(y0), Math.round(w), Math.round(h));
    };
    for (let i = 0; i < this.cols; i++) {
      tramoBorde(ox + i * cell, oy, cell, grosor, i, 0, 'arriba');
      tramoBorde(ox + i * cell, oy + H - grosor, cell, grosor, i, this.rows - 1, 'abajo');
    }
    for (let j = 0; j < this.rows; j++) {
      tramoBorde(ox, oy + j * cell, grosor, cell, 0, j, 'izq');
      tramoBorde(ox + W - grosor, oy + j * cell, grosor, cell, this.cols - 1, j, 'der');
    }

    // muros: cubo hueco
    const inset = Math.max(1, Math.round(cell * 0.08));
    for (const [x, y] of this.walls) {
      const [px, py, w] = caja(x, y, inset, lado - inset * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(px, py, w, w);
      ctx.strokeStyle = 'rgba(255,255,255,0.36)';
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 0.5, py + 0.5, w - 1, w - 1);
    }

    // muros que van a salir: un cubo hueco que parpadea y se cierra
    for (const w of this.pendingWalls) {
      const avance = clamp(w.t / w.dur, 0, 1);
      const [px, py, w2] = caja(w.x, w.y, Math.round(cell * 0.16), lado - Math.round(cell * 0.32));
      ctx.strokeStyle = `rgba(255,255,255,${(0.3 + avance * 0.55).toFixed(2)})`;
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 0.5, py + 0.5, w2 - 1, w2 - 1);
      // el punto del centro crece: cuando llena la casilla, el muro ya está
      const punto = Math.max(2, Math.round(w2 * avance));
      if (punto > 2) {
        ctx.fillStyle = `rgba(255,255,255,${(0.25 + avance * 0.55).toFixed(2)})`;
        ctx.fillRect(
          Math.round(px + (w2 - punto) / 2),
          Math.round(py + (w2 - punto) / 2),
          punto,
          punto,
        );
      }
    }

    // comida: cubo rojo que respira. la que cierra el nivel va en amarillo
    if (this.food) {
      const ultima = this.ultimaFruta;
      const pulso = Math.floor((0.5 + 0.5 * Math.sin(this.time / 220)) * 3);
      const m = Math.round(cell * 0.16) + pulso;
      const [px, py, w] = caja(this.food.x, this.food.y, m, lado - m * 2);
      ctx.fillStyle = ultima ? '#ffd21e' : '#ff2b2b';
      ctx.fillRect(px, py, w, w);
      if (ultima) {
        const hueco = Math.max(2, Math.round(w * 0.34));
        ctx.fillStyle = '#000';
        ctx.fillRect(px + Math.round((w - hueco) / 2), py + Math.round((w - hueco) / 2), hueco, hueco);
      }
    }

    // premio: cubo rojo hueco, distinto de la fruta llena
    if (this.bonus && !(this.bonus.ttl < 1800 && Math.floor(this.time / 130) % 2 === 0)) {
      const m = Math.round(cell * 0.16);
      const [px, py, w] = caja(this.bonus.x, this.bonus.y, m, lado - m * 2);
      ctx.strokeStyle = '#ff2b2b';
      ctx.lineWidth = Math.max(2, Math.round(cell * 0.14));
      ctx.strokeRect(px + 0.5, py + 0.5, w - 1, w - 1);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = Math.max(1, Math.round(cell * 0.05));
      ctx.strokeRect(px + 0.5, py + 0.5, w - 1, w - 1);
    }

    // poderes: cubos con su marca dentro
    if (this.power && !(this.power.ttl < 2200 && Math.floor(this.time / 140) % 2 === 0)) {
      const { kind } = this.power;
      const m = Math.round(cell * 0.2);
      const [px, py, w] = caja(this.power.x, this.power.y, m, lado - m * 2);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = Math.max(1, Math.round(cell * 0.06));
      if (kind === 'ghost') {
        ctx.setLineDash([Math.max(2, Math.round(cell * 0.16)), Math.max(2, Math.round(cell * 0.16))]);
        ctx.strokeRect(px + 0.5, py + 0.5, w - 1, w - 1);
        ctx.setLineDash([]);
      } else if (kind === 'slow') {
        ctx.strokeRect(px + 0.5, py + 0.5, w - 1, w - 1);
        ctx.beginPath();
        ctx.moveTo(px + w * 0.28, py + w * 0.5);
        ctx.lineTo(px + w * 0.72, py + w * 0.5);
        ctx.stroke();
      } else {
        ctx.strokeRect(px + 0.5, py + 0.5, w - 1, w - 1);
        ctx.fillStyle = '#fff';
        ctx.fillRect(Math.round(px + w * 0.36), Math.round(py + w * 0.36), Math.max(2, Math.round(w * 0.28)), Math.max(2, Math.round(w * 0.28)));
      }
    }

    // el cazador avisa de por dónde va a cortar
    if (this.hunter && this.hunter.aim) {
      const aim = this.hunter.aim;
      const dist = Math.abs(aim.x - this.body[0].x) + Math.abs(aim.y - this.body[0].y);
      if (dist <= (this.cfg.hunterAimShow || 7) && Math.floor(this.time / 110) % 2 === 0) {
        const m = Math.round(cell * 0.2);
        const [px, py, w] = caja(aim.x, aim.y, m, lado - m * 2);
        ctx.strokeStyle = 'rgba(255,43,43,0.85)';
        ctx.lineWidth = Math.max(1, Math.round(cell * 0.07));
        ctx.strokeRect(px + 0.5, py + 0.5, w - 1, w - 1);
      }
    }

    // puntos azules del cazador
    for (const punto of this.pellets) {
      const [px, py, w] = caja(punto.x, punto.y, Math.round(cell * 0.33), lado - Math.round(cell * 0.66));
      ctx.fillStyle = '#3d7bff';
      ctx.fillRect(px, py, w, w);
    }

    // el cazador: cubos rojos, uno por anillo, con la cabeza marcada
    if (this.hunter && this.hunter.recarga <= 0) {
      const avance = this.hunterAvance;
      const m = Math.max(1, Math.round(cell * 0.07));
      const ancho = lado - m * 2;
      const centro = Math.max(2, Math.round(ancho * 0.22));
      for (let i = this.hunter.body.length - 1; i >= 0; i--) {
        const actual = this.hunter.body[i];
        const previo = this.hunter.prev[i] || actual;
        const salto = Math.abs(actual.x - previo.x) > 1 || Math.abs(actual.y - previo.y) > 1;
        const px = salto ? actual.x : previo.x + (actual.x - previo.x) * avance;
        const py = salto ? actual.y : previo.y + (actual.y - previo.y) * avance;
        const x0 = Math.round(ox + px * cell) + m;
        const y0 = Math.round(oy + py * cell) + m;
        ctx.fillStyle = i === 0 ? '#ff2b2b' : '#c21414';
        ctx.fillRect(x0, y0, ancho, ancho);
        ctx.strokeStyle = i === 0 ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x0 + 0.5, y0 + 0.5, ancho - 1, ancho - 1);
        if (i === 0 && this.hunterPelea) {
          ctx.strokeStyle = 'rgba(255,255,255,0.9)';
          ctx.lineWidth = Math.max(1, Math.round(cell * 0.06));
          ctx.strokeRect(x0 - 2.5, y0 - 2.5, ancho + 5, ancho + 5);
        }
        if (i === 0) {
          const dx = this.hunter.dir.x || 0;
          const dy = this.hunter.dir.y || 0;
          ctx.fillStyle = '#000';
          for (const ladoOjo of [-1, 1]) {
            const ex = x0 + ancho / 2 + dx * ancho * 0.16 + (dy !== 0 ? ladoOjo * ancho * 0.18 : 0);
            const ey = y0 + ancho / 2 + dy * ancho * 0.16 + (dx !== 0 ? ladoOjo * ancho * 0.18 : 0);
            ctx.fillRect(Math.round(ex - centro / 2), Math.round(ey - centro / 2), centro, centro);
          }
        }
      }
    }

    // ---- luz: todo a bloques, un escalón por casilla ----
    const cabeza = this.body[0];
    const centroX = ox + (cabeza.x + 0.5) * cell;
    const centroY = oy + (cabeza.y + 0.5) * cell;

    const sombra = (cx, cy, dentro, fuera, maxAlpha, pasos) => {
      for (let y = 0; y < this.rows; y++) {
        for (let x = 0; x < this.cols; x++) {
          const dx = Math.abs(x + 0.5 - cx);
          const dy = Math.abs(y + 0.5 - cy);
          const dist = Math.max(dx, dy);
          if (dist <= dentro) continue;
          const bruto = clamp((dist - dentro) / fuera, 0, 1);
          const alpha = (Math.ceil(bruto * pasos) / pasos) * maxAlpha;
          if (alpha < 0.04) continue;
          ctx.fillStyle = `rgba(0,0,0,${alpha.toFixed(2)})`;
          ctx.fillRect(
            Math.floor(ox + x * cell),
            Math.floor(oy + y * cell),
            Math.ceil(cell) + 1,
            Math.ceil(cell) + 1,
          );
        }
      }
    };

    if (this.reveal < 1) {
      // arranque: la luz avanza en cuadros desde la cabeza
      const alcance = 1.2 + this.reveal * 17;
      sombra(cabeza.x + 0.5, cabeza.y + 0.5, alcance, 3.4, 1, 5);
      const filo = Math.sin(Math.PI * Math.min(1, this.reveal * 1.15));
      if (filo > 0.03 && alcance * cell < Math.max(W, H) * 1.4) {
        const r = alcance * cell;
        ctx.strokeStyle = `rgba(255,255,255,${(filo * 0.5).toFixed(3)})`;
        ctx.lineWidth = Math.max(1, Math.round(cell * 0.08));
        ctx.strokeRect(
          Math.round(centroX - r) + 0.5,
          Math.round(centroY - r) + 0.5,
          Math.round(r * 2),
          Math.round(r * 2),
        );
      }
    }

    // la serpiente: un cubo por casilla, todos iguales
    const alpha = this.state === 'running' ? clamp(this.acc / this.interval(), 0, 1) : 1;
    const hueco = Math.max(1, Math.round(cell * 0.1));
    const tamano = lado - hueco * 2;
    // al comer, la cabeza da un mordisco: crece un pelín y vuelve
    const huecoCabeza = Math.max(0, hueco - Math.round(this.chomp * cell * 0.07));
    const tamanoCabeza = lado - huecoCabeza * 2;
    const fantasma = this.ghosting;
    // el fantasma no se corta de golpe: se apaga en cuatro escalones durante
    // el último 1,6 s. primero pierde el relleno, luego el contorno
    const pasoFantasma = this.ghostPaso;
    const rellenoFantasma = (1 - pasoFantasma) * 0.82;
    const contornoFantasma = 0.9;
    const visibles = this.crash ? Math.max(0, this.body.length - this.crash.popped) : this.body.length;

    ctx.save();
    if (this.crash) ctx.globalAlpha = clamp(1 - (this.crash.t - 120) / 520, 0.12, 1);
    for (let i = visibles - 1; i >= 0; i--) {
      const p = this.posAt(i, alpha);
      if (!p) continue;
      const x0 = Math.round(ox + p.x * cell) + hueco;
      const y0 = Math.round(oy + p.y * cell) + hueco;
      if (fantasma) {
        if (rellenoFantasma > 0) {
          ctx.fillStyle = `rgba(255,255,255,${rellenoFantasma.toFixed(3)})`;
          ctx.fillRect(x0, y0, tamano, tamano);
        }
        ctx.strokeStyle = `rgba(255,255,255,${contornoFantasma.toFixed(3)})`;
        ctx.lineWidth = Math.max(1, Math.round(cell * 0.06));
        ctx.strokeRect(x0 + 0.5, y0 + 0.5, tamano - 1, tamano - 1);
      } else {
        ctx.fillStyle = i === 0 ? '#ffffff' : '#e8e8e8';
        ctx.fillRect(x0, y0, tamano, tamano);
      }
    }
    ctx.restore();

    // cabeza: el mismo cubo, con dos ojos cuadrados mirando hacia donde vas
    const punta = visibles > 0 ? this.posAt(0, alpha) : null;
    if (punta) {
      const x0 = Math.round(ox + punta.x * cell) + huecoCabeza;
      const y0 = Math.round(oy + punta.y * cell) + huecoCabeza;
      if (fantasma) {
        if (rellenoFantasma > 0) {
          ctx.fillStyle = `rgba(255,255,255,${rellenoFantasma.toFixed(3)})`;
          ctx.fillRect(x0, y0, tamanoCabeza, tamanoCabeza);
        }
        ctx.strokeStyle = `rgba(255,255,255,${(contornoFantasma + 0.05).toFixed(3)})`;
        ctx.lineWidth = Math.max(1, Math.round(cell * 0.06));
        ctx.strokeRect(x0 + 0.5, y0 + 0.5, tamanoCabeza - 1, tamanoCabeza - 1);
      } else {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x0, y0, tamanoCabeza, tamanoCabeza);
      }
      const ojo = Math.max(2, Math.round(tamanoCabeza * 0.2));
      const dx = this.dir.x;
      const dy = this.dir.y;
      ctx.fillStyle = fantasma
        ? (pasoFantasma > 0.5 ? '#ffffff' : `rgba(0,0,0,${(1 - pasoFantasma).toFixed(2)})`)
        : '#000000';
      for (const s of [-1, 1]) {
        const ex = x0 + tamanoCabeza / 2 + dx * tamanoCabeza * 0.18 + (dy !== 0 ? s * tamanoCabeza * 0.2 : 0);
        const ey = y0 + tamanoCabeza / 2 + dy * tamanoCabeza * 0.18 + (dx !== 0 ? s * tamanoCabeza * 0.2 : 0);
        ctx.fillRect(Math.round(ex - ojo / 2), Math.round(ey - ojo / 2), ojo, ojo);
      }
    }

    // chispas: también cuadradas
    ctx.save();
    for (const p of this.particles) {
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.color;
      const s = Math.max(1, Math.round(p.size));
      ctx.fillRect(Math.round(ox + p.x * cell), Math.round(oy + p.y * cell), s, s);
    }
    ctx.restore();

    ctx.restore();

    if (this.flash > 0.01) {
      ctx.fillStyle = `rgba(255,255,255,${this.flash * 0.07})`;
      ctx.fillRect(0, 0, view.width, view.height);
    }

    // ---- choque: la casilla del golpe y tres marcos cuadrados que se abren ----
    if (this.crash) {
      const c = this.crash;
      const x0 = Math.round(ox + c.x * cell);
      const y0 = Math.round(oy + c.y * cell);

      const marca = clamp(1 - c.t / 220, 0, 1);
      if (marca > 0.01) {
        ctx.fillStyle = '#000';
        ctx.fillRect(x0, y0, lado, lado);
        ctx.strokeStyle = `rgba(255,255,255,${marca.toFixed(3)})`;
        ctx.lineWidth = Math.max(1, Math.round(cell * 0.1));
        ctx.strokeRect(x0 + 0.5, y0 + 0.5, lado - 1, lado - 1);
      }

      const avance = clamp((c.t - 40) / 420, 0, 1);
      if (avance > 0 && avance < 1) {
        for (let n = 0; n < 3; n++) {
          const paso = (avance + n * 0.22) % 1;
          const alfa = (1 - paso) * (1 - n * 0.22);
          if (alfa <= 0.02) continue;
          const crece = lado * (0.5 + paso * 2.6);
          ctx.strokeStyle = `rgba(255,255,255,${(alfa * 0.7).toFixed(3)})`;
          ctx.lineWidth = Math.max(1, Math.round(cell * 0.07 * (1 - paso)));
          ctx.strokeRect(
            Math.round(x0 + lado / 2 - crece / 2) + 0.5,
            Math.round(y0 + lado / 2 - crece / 2) + 0.5,
            Math.round(crece),
            Math.round(crece),
          );
        }
      }
    }
  }
}
