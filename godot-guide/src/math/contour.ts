// Marching squares: iso-lines of f(x, y) = level over a rectangle, as line segments in world coords.
export type Seg = [[number, number], [number, number]];

export function contourSegments(f: (x: number, y: number) => number, x0: number, x1: number, y0: number, y1: number, level: number, n = 60): Seg[] {
  const dx = (x1 - x0) / n, dy = (y1 - y0) / n;
  const g: number[][] = [];
  for (let i = 0; i <= n; i++) {
    g.push([]);
    for (let j = 0; j <= n; j++) g[i].push(f(x0 + j * dx, y0 + i * dy));
  }
  const segs: Seg[] = [];
  const interp = (xa: number, ya: number, va: number, xb: number, yb: number, vb: number): [number, number] => {
    const t = va === vb ? 0.5 : (level - va) / (vb - va);
    return [xa + t * (xb - xa), ya + t * (yb - ya)];
  };
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const xa = x0 + j * dx, ya = y0 + i * dy, xb = xa + dx, yb = ya + dy;
      const v00 = g[i][j], v10 = g[i][j + 1], v01 = g[i + 1][j], v11 = g[i + 1][j + 1];
      if (![v00, v10, v01, v11].every(Number.isFinite)) continue;
      const pts: [number, number][] = [];
      // edges: bottom (00-10), right (10-11), top (01-11), left (00-01)
      if (v00 < level !== v10 < level) pts.push(interp(xa, ya, v00, xb, ya, v10));
      if (v10 < level !== v11 < level) pts.push(interp(xb, ya, v10, xb, yb, v11));
      if (v01 < level !== v11 < level) pts.push(interp(xa, yb, v01, xb, yb, v11));
      if (v00 < level !== v01 < level) pts.push(interp(xa, ya, v00, xa, yb, v01));
      if (pts.length === 2) segs.push([pts[0], pts[1]]);
      else if (pts.length === 4) {
        segs.push([pts[0], pts[1]]);
        segs.push([pts[2], pts[3]]);
      }
    }
  return segs;
}

/** Levels spaced so that contours look even for bowl-shaped losses (quantiles of sampled values). */
export function niceLevels(f: (x: number, y: number) => number, x0: number, x1: number, y0: number, y1: number, k = 10): number[] {
  const vals: number[] = [];
  for (let i = 0; i <= 30; i++) for (let j = 0; j <= 30; j++) vals.push(f(x0 + ((x1 - x0) * j) / 30, y0 + ((y1 - y0) * i) / 30));
  const finite = vals.filter(Number.isFinite).sort((a, b) => a - b);
  const lo = finite[0], hi = finite[Math.floor(finite.length * 0.9)];
  return Array.from({ length: k }, (_, i) => lo + (hi - lo) * ((i + 1) / (k + 1)) ** 2);
}
