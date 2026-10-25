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
    this.timeLeft = cfg.timer || 0;
    this.hitStop = 0;
    this.crash = null;
    this.wallTicks = 0;
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
      if (cfg.timer) {
        this.timeLeft = Math.max(0, this.timeLeft - dt);
        if (this.timeLeft <= 0) {
          this.die('tiempo', this.body[0].x, this.body[0].y);
          this.updateFx(dt);
          return;
        }
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
    if (cfg.timePerFood) this.timeLeft = Math.min((cfg.timer || 0) * 2, this.timeLeft + cfg.timePerFood);
    if (cfg.spawnWalls && cfg.wallEvery && this.fruits % cfg.wallEvery === 0) this.raiseWall();
    // clásico: pasada la mitad de la partida empiezan a salir muros sueltos
    if (cfg.wallFrom && this.fruits > cfg.wallFrom && cfg.wallEvery &&
      this.fruits % cfg.wallEvery === 0 && this.walls.length < (cfg.wallMax || 999)) {
      this.raiseWall();
    }
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
    if (this.cfg.bonusTime && this.cfg.timer) {
      this.timeLeft = Math.min((this.cfg.timer || 0) * 2, this.timeLeft + this.cfg.bonusTime);
    }
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

  portalExit(x, y) {
    if (!this.portals) return null;
    for (const p of this.portals) {
      if (p.a.x === x && p.a.y === y) return p.b;
      if (p.b.x === x && p.b.y === y) return p.a;
    }
    return null;
  }

  portalLinks() {
    const enlaces = new Map();
    if (!this.portals) return enlaces;
    for (const p of this.portals) {
      enlaces.set(K(p.a.x, p.a.y), [K(p.b.x, p.b.y)]);
      enlaces.set(K(p.b.x, p.b.y), [K(p.a.x, p.a.y)]);
    }
    return enlaces;
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

  // piloto automático: demo del menú y pruebas. no es perfecto, pero no se encierra
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
        links: this.portalLinks(),
      })
      : null;

    // memoria corta: no dar vueltas sobre las mismas casillas
    if (!this.botTrail) this.botTrail = new Map();
    for (const [k, v] of this.botTrail) this.botTrail.set(k, v - 1);
    this.botTrail.set(K(cabeza.x, cabeza.y), 14);

    let mejor = null;
    let mejorPunto = -Infinity;

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
      if (ocupado.has(K(nx, ny))) continue;
      // si es un portal, sales por el otro lado: ahí tampoco puede haber nada
      const salida = this.portalExit(nx, ny);
      if (salida && ocupado.has(K(salida.x, salida.y))) continue;
      const destino = salida || { x: nx, y: ny };

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
      if (this.cfg.vision) puntos += Math.random() * 2;

      if (puntos > mejorPunto) {
        mejorPunto = puntos;
        mejor = { dx, dy };
      }
    }

    if (mejor) {
      this.setDirection(mejor.dx, mejor.dy);
      return;
    }
    // sin salida: cualquier casilla libre
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
    if (this.portals && this.portals.some((p) =>
      (p.a.x === x && p.a.y === y) || (p.b.x === x && p.b.y === y))) return true;
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

  raiseWall() {
    if (this.cfg.wallMax && this.walls.length >= this.cfg.wallMax) return;
    const cabeza = this.body[0];
    for (let i = 0; i < 80; i++) {
      const c = this.freeCell(1);
      if (!c) return;
      const lejos = Math.abs(c.x - cabeza.x) + Math.abs(c.y - cabeza.y) >= 5;
      const hueco = DIRS.some(([dx, dy]) => !this.wallSet.has(K(c.x + dx, c.y + dy)));
      if (!lejos || !hueco) continue;
      this.walls.push([c.x, c.y]);
      this.wallSet.add(K(c.x, c.y));
      this.burst(c.x + 0.5, c.y + 0.5, 8, 'rgba(255,255,255,0.8)', 4);
      this.shake = 2;
      this.emit('wall', { x: c.x, y: c.y });
      return;
    }
  }

  placePortals() {
    const a = this.freeCell(2);
    if (!a) return;
    let b = null;
    for (let i = 0; i < 60; i++) {
      const c = this.freeCell(2);
      if (!c) break;
      const lejos = Math.abs(c.x - a.x) + Math.abs(c.y - a.y) >= 9;
      const estorba = Math.abs(c.x - this.body[0].x) + Math.abs(c.y - this.body[0].y) <= 2;
      if (lejos && !estorba) {
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
    const tope = Math.max(2, this.cfg.hunterPellets || 2);
    if (this.pellets.length >= tope) return;
    const libres = this.reachableFree().filter((c) => !this.ocupada(c.x, c.y));
    const lejos = libres.filter((c) => Math.abs(c.x - cabeza.x) + Math.abs(c.y - cabeza.y) >= 4);
    const donde = lejos.length ? lejos : libres;
    if (donde.length) this.pellets.push({ ...donde[rand(donde.length)] });
  }

  // ritmo del cazador: acelera cuando ya es largo, cuando lo tiene cerca y del todo al estar lleno
  hunterCadence() {
    const h = this.hunter;
    if (!h) return 2;
    const tope = this.cfg.hunterCap || 18;
    if (h.body.length >= tope) return 1;
    const cabeza = this.body[0];
    const jefe = h.body[0];
    const dist = Math.abs(jefe.x - cabeza.x) + Math.abs(jefe.y - cabeza.y);
    return h.body.length >= 7 && dist <= 3 ? 1 : 2;
  }

  // a qué va: a comer si es corta, a cortarte el paso si es larga y a por ti si ya está llena
  hunterTarget() {
    const h = this.hunter;
    const cabeza = this.body[0];
    const tope = this.cfg.hunterCap || 18;
    if (h.body.length >= tope) return { x: cabeza.x, y: cabeza.y };
    if (h.body.length >= 7) {
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
    if (this.hunterTick % this.hunterCadence() !== 0) return;

    h.prev = h.body.map((p) => ({ ...p }));
    const cabeza = h.body[0];
    const objetivo = this.hunterTarget();

    const ocupadoCuerpo = new Set();
    for (let i = 0; i < h.body.length - 1; i++) ocupadoCuerpo.add(K(h.body[i].x, h.body[i].y));
    const bloqueado = new Set([...this.wallSet, ...ocupadoCuerpo]);
    const cuerpoJugador = new Set(this.body.map((s) => K(s.x, s.y)));

    // por dónde iría si no hubiera trampas: una casilla más cerca del objetivo
    const ideal = bfsStep({
      start: cabeza,
      goal: objetivo,
      blocked: bloqueado,
      cols: this.cols,
      rows: this.rows,
      wrap: false,
      links: this.portalLinks(),
    });

    let elegido = null;
    let mejorPunto = -Infinity;

    for (const [dx, dy] of DIRS) {
      const nx = cabeza.x + dx;
      const ny = cabeza.y + dy;
      if (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows) continue;
      const k = K(nx, ny);
      if (bloqueado.has(k)) continue;
      const reversa = dx === -h.dir.x && dy === -h.dir.y;

      let puntos = 0;
      // rematar: si pisa al jugador, gana
      if (cuerpoJugador.has(k)) puntos += 1200;
      puntos -= (Math.abs(nx - objetivo.x) + Math.abs(ny - objetivo.y)) * 12;
      if (ideal && dx === ideal.x && dy === ideal.y) puntos += 46;
      if (reversa) puntos -= 40;

      const ocupadoDestino = new Set([...bloqueado, ...cuerpoJugador]);
      ocupadoDestino.delete(K(cabeza.x, cabeza.y));
      const espacio = this.hunterSpace({ x: nx, y: ny }, ocupadoDestino);
      puntos += Math.min(espacio, 60) * 0.7;
      if (espacio < 8) puntos -= 300;
      // no meterse justo al lado de la cabeza del jugador si aún es corta
      if (Math.abs(nx - this.body[0].x) + Math.abs(ny - this.body[0].y) === 1 && h.body.length < 5) {
        puntos -= 60;
      }

      if (puntos > mejorPunto) {
        mejorPunto = puntos;
        elegido = { x: nx, y: ny };
      }
    }

    if (!elegido) {
      // acorralado: se muda a otra zona en vez de quedarse clavado
      this.burst(cabeza.x + 0.5, cabeza.y + 0.5, 12, '#c91616', 7);
      this.placeHunter();
      return;
    }

    h.dir = { x: elegido.x - cabeza.x, y: elegido.y - cabeza.y };
    h.body.unshift(elegido);
    if (h.grow > 0) h.grow--;
    else h.body.pop();

    const indice = this.pellets.findIndex((p) => p.x === elegido.x && p.y === elegido.y);
    if (indice >= 0) {
      this.pellets.splice(indice, 1);
      const tope = this.cfg.hunterCap || 18;
      if (h.body.length < tope) h.grow += 1;
      this.burst(elegido.x + 0.5, elegido.y + 0.5, 8, '#3d7bff', 5);
      const cuantos = Math.max(2, this.cfg.hunterPellets || 2);
      while (this.pellets.length < cuantos) this.spawnPellet();
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

    // el cazador: serpiente roja, crece con los puntos azules
    if (this.hunter) {
      const ritmo = 2;
      const avance = ((this.hunterTick % ritmo) +
        (this.state === 'running' ? clamp(this.acc / this.interval(), 0, 1) : 1)) / ritmo;
      const puntosCaza = [];
      for (let i = 0; i < this.hunter.body.length; i++) {
        const actual = this.hunter.body[i];
        const previo = this.hunter.prev[i] || actual;
        const salto = Math.abs(actual.x - previo.x) > 1 || Math.abs(actual.y - previo.y) > 1;
        puntosCaza.push({
          x: salto ? actual.x : previo.x + (actual.x - previo.x) * avance,
          y: salto ? actual.y : previo.y + (actual.y - previo.y) * avance,
        });
      }

      const largoCaza = puntosCaza.length;
      const radioCaza = (i) => {
        const cola = clamp((i - (largoCaza - 3)) / 3, 0, 1);
        return cell * 0.4 * (1 - cola * 0.42);
      };
      const centroCaza = (p) => [ox + (p.x + 0.5) * cell, oy + (p.y + 0.5) * cell];

      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const [extra, color] of [
        [Math.max(2, cell * 0.08), 'rgba(255,255,255,0.32)'],
        [0, '#c21414'],
      ]) {
        ctx.strokeStyle = color;
        for (let i = largoCaza - 1; i >= 1; i--) {
          const a = puntosCaza[i];
          const b = puntosCaza[i - 1];
          if (Math.abs(a.x - b.x) > 1.2 || Math.abs(a.y - b.y) > 1.2) continue;
          const [ax, ay] = centroCaza(a);
          const [bx, by] = centroCaza(b);
          ctx.lineWidth = Math.max(2, radioCaza(i) * 2) + extra;
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
          ctx.stroke();
        }
      }

      // cabeza del cazador: roja, con dos ojos negros
      const jefe = puntosCaza[0];
      if (jefe) {
        const [hx, hy] = centroCaza(jefe);
        const giro = Math.atan2(this.hunter.dir.y || 0, this.hunter.dir.x || 1) || 0;
        const largo = cell * 0.86;
        const alto = cell * 0.74;
        ctx.save();
        ctx.translate(hx, hy);
        ctx.rotate(giro);
        ctx.beginPath();
        ctx.ellipse(0, 0, largo / 2, alto / 2, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#ff2b2b';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.45)';
        ctx.lineWidth = Math.max(1, cell * 0.045);
        ctx.stroke();
        const ojo = Math.max(1, cell * 0.07);
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(cell * 0.1, -cell * 0.17, ojo, 0, Math.PI * 2);
        ctx.arc(cell * 0.1, cell * 0.17, ojo, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // ---- luz ----
    const cabeza = this.body[0];
    const centroX = ox + (cabeza.x + 0.5) * cell;
    const centroY = oy + (cabeza.y + 0.5) * cell;

    // sombra: un solo degradado radial sobre el tablero (suave y barato)
    const sombra = (cx, cy, dentro, fuera, tramos) => {
      const radioDentro = Math.max(0, dentro) * cell;
      const radioFuera = Math.max(radioDentro + cell * 0.5, fuera * cell);
      const g = ctx.createRadialGradient(cx, cy, radioDentro, cx, cy, radioFuera);
      for (const [parada, alfa] of tramos) {
        g.addColorStop(parada, `rgba(0,0,0,${alfa})`);
      }
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, view.width, view.height);
    };

    if (this.cfg.vision) {
      // modo ciego: sólo se ve lo que tienes cerca, y la claridad crece al arrancar
      const radio = this.cfg.vision * (0.35 + 0.65 * this.reveal);
      sombra(centroX, centroY, radio * 0.6, radio * 1.25, [
        [0, 0], [0.45, 0], [0.72, 0.72], [1, 0.97],
      ]);
      for (let i = 1; i < Math.min(this.body.length, 7); i++) {
        const tramo = this.body[i];
        const opaco = clamp(0.42 - i * 0.06, 0, 1);
        if (opaco < 0.04) continue;
        sombra(ox + (tramo.x + 0.5) * cell, oy + (tramo.y + 0.5) * cell, cell * 0.4, cell * 2, [
          [0, 0], [0.5, opaco * 0.5], [1, opaco],
        ]);
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(centroX, centroY, radio * cell, 0, Math.PI * 2);
      ctx.stroke();
    } else if (this.reveal < 1) {
      // arranque: una onda de luz enciende el tablero desde la cabeza
      const alcance = 1.2 + this.reveal * 17;
      sombra(centroX, centroY, alcance, alcance + 3.2, [
        [0, 0], [0.55, 0.35], [1, 1],
      ]);

      const filo = Math.sin(Math.PI * Math.min(1, this.reveal * 1.15));
      if (filo > 0.03) {
        ctx.strokeStyle = `rgba(255,255,255,${(filo * 0.5).toFixed(3)})`;
        ctx.lineWidth = Math.max(1.5, cell * 0.06);
        ctx.beginPath();
        ctx.arc(centroX, centroY, alcance * cell, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    const alpha = this.state === 'running' ? clamp(this.acc / this.interval(), 0, 1) : 1;
    const ghost = this.ghosting;
    const puntos = [];
    for (let i = 0; i < this.body.length; i++) {
      const p = this.posAt(i, alpha);
      if (p) puntos.push(p);
    }

    // cuerpo: una cinta redonda que se afina hacia la cola, sin huecos entre casillas
    const visibles = this.crash ? Math.max(1, puntos.length - this.crash.popped) : puntos.length;
    const radio = (i) => {
      // cuerpo de grosor constante y punta redondeada en los tres últimos anillos
      const cola = clamp((i - (puntos.length - 3)) / 3, 0, 1);
      return cell * 0.44 * (1 - cola * 0.42);
    };
    const ancho = (i) => Math.max(2, radio(i) * 2);
    const centro = (p) => [ox + (p.x + 0.5) * cell, oy + (p.y + 0.5) * cell];
    const saltos = (a, b) => Math.abs(a.x - b.x) > 1.2 || Math.abs(a.y - b.y) > 1.2;

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.save();
    if (this.crash) ctx.globalAlpha = clamp(1 - (this.crash.t - 120) / 520, 0.15, 1);

    const cinta = (extra, color) => {
      ctx.strokeStyle = color;
      for (let i = visibles - 1; i >= 1; i--) {
        const a = puntos[i];
        const b = puntos[i - 1];
        if (!a || !b || saltos(a, b)) continue;
        const [ax, ay] = centro(a);
        const [bx, by] = centro(b);
        ctx.lineWidth = ancho(i) + extra;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
      }
    };

    if (ghost) {
      ctx.setLineDash([Math.max(3, cell * 0.26), Math.max(2, cell * 0.3)]);
      cinta(0, 'rgba(255,255,255,0.82)');
      ctx.setLineDash([]);
    } else {
      cinta(Math.max(2, cell * 0.085), 'rgba(255,255,255,0.16)');
      cinta(0, '#ffffff');
    }

    // cabeza: morro redondeado con dos ojos, mirando hacia donde vas
    const cabezaPos = puntos[0];
    if (cabezaPos && (!this.crash || this.crash.popped < 1)) {
      const [hx, hy] = centro(cabezaPos);
      const giro = Math.atan2(this.dir.y, this.dir.x);
      const largo = cell * 0.92;
      const alto = cell * 0.82;
      const radioEsquina = cell * 0.34;
      const redondo = (x, y, w, h, r) => {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
      };
      ctx.save();
      ctx.translate(hx, hy);
      ctx.rotate(giro);
      redondo(-largo * 0.44, -alto / 2, largo, alto, radioEsquina);
      if (ghost) {
        ctx.fillStyle = 'rgba(6,6,6,0.88)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.95)';
        ctx.lineWidth = Math.max(1.5, cell * 0.09);
        ctx.stroke();
      } else {
        ctx.fillStyle = '#ffffff';
        ctx.fill();
      }
      const ojo = Math.max(1, cell * 0.075);
      const separacion = cell * 0.19;
      const adelante = cell * 0.11;
      ctx.fillStyle = ghost ? '#ffffff' : '#000000';
      ctx.beginPath();
      ctx.arc(adelante, -separacion, ojo, 0, Math.PI * 2);
      ctx.arc(adelante, separacion, ojo, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();

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

    // ---- impacto: la casilla donde chocas queda marcada y saltan las grietas ----
    if (this.crash) {
      const c = this.crash;
      const cx = ox + (c.x + 0.5) * cell;
      const cy = oy + (c.y + 0.5) * cell;

      const marca = clamp(1 - c.t / 200, 0, 1);
      if (marca > 0.01) {
        ctx.fillStyle = '#000';
        ctx.fillRect(cx - cell / 2, cy - cell / 2, cell, cell);
        ctx.strokeStyle = `rgba(255,255,255,${marca.toFixed(3)})`;
        ctx.lineWidth = Math.max(1.5, cell * 0.08);
        ctx.strokeRect(cx - cell / 2 + 1, cy - cell / 2 + 1, cell - 2, cell - 2);
      }

      const avance = clamp((c.t - 30) / 430, 0, 1);
      if (avance > 0 && avance < 1) {
        const alfa = 1 - avance;
        const desde = cell * 0.16;
        const hasta = cell * (0.5 + avance * 1.05);
        ctx.strokeStyle = `rgba(255,255,255,${(alfa * 0.85).toFixed(3)})`;
        ctx.lineWidth = Math.max(1, cell * 0.06 * alfa);
        ctx.beginPath();
        for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
          ctx.moveTo(cx + dx * desde, cy + dy * desde);
          ctx.lineTo(cx + dx * hasta, cy + dy * hasta);
        }
        ctx.stroke();

        const marco = cell * (0.5 + avance * 1.1);
        ctx.strokeStyle = `rgba(255,255,255,${(alfa * 0.45).toFixed(3)})`;
        ctx.lineWidth = 1;
        ctx.strokeRect(cx - marco / 2, cy - marco / 2, marco, marco);
      }
    }
  }
}
