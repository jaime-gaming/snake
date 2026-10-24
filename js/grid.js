// utilidades de rejilla compartidas por el motor y el duelo

export const K = (x, y) => y * 4096 + x;
export const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export function inBounds(x, y, cols, rows) {
  return x >= 0 && y >= 0 && x < cols && y < rows;
}

// primer paso (en celdas, signo) desde start hasta goal esquivando blocked
export function bfsStep({ start, goal, blocked, cols, rows, wrap }) {
  const startK = K(start.x, start.y);
  const goalK = K(goal.x, goal.y);
  if (startK === goalK) return null;

  const prev = new Map();
  const seen = new Set([startK]);
  const queue = [{ x: start.x, y: start.y }];
  let head = 0;

  while (head < queue.length) {
    const cell = queue[head++];
    for (const [dx, dy] of DIRS) {
      let nx = cell.x + dx;
      let ny = cell.y + dy;
      if (wrap) {
        nx = (nx + cols) % cols;
        ny = (ny + rows) % rows;
      } else if (!inBounds(nx, ny, cols, rows)) {
        continue;
      }
      const nk = K(nx, ny);
      if (seen.has(nk)) continue;
      if (blocked.has(nk) && nk !== goalK) continue;
      seen.add(nk);
      prev.set(nk, { x: cell.x, y: cell.y });

      if (nk === goalK) {
        let puntero = nk;
        for (let guarda = 0; guarda < cols * rows + 2; guarda++) {
          const anterior = prev.get(puntero);
          if (!anterior) return null;
          if (K(anterior.x, anterior.y) === startK) {
            const celda = { x: puntero % 4096, y: Math.floor(puntero / 4096) };
            return { x: Math.sign(celda.x - start.x), y: Math.sign(celda.y - start.y) };
          }
          puntero = K(anterior.x, anterior.y);
        }
        return null;
      }
      queue.push({ x: nx, y: ny });
    }
  }
  return null;
}
