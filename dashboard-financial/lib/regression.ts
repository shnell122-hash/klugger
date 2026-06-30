// lib/regression.ts — OLS lineal + bins dinámicos

export interface OLSResult {
  slope: number;
  intercept: number;
  r2: number;
  n: number;
}

/** Ordinary Least Squares on (x, y) points. Returns slope, intercept, R². */
export function ols(points: { x: number; y: number }[]): OLSResult {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: 0, r2: 0, n };

  const meanX = points.reduce((s, p) => s + p.x, 0) / n;
  const meanY = points.reduce((s, p) => s + p.y, 0) / n;

  let ssXY = 0, ssXX = 0, ssTot = 0;
  for (const p of points) {
    ssXY += (p.x - meanX) * (p.y - meanY);
    ssXX += (p.x - meanX) ** 2;
    ssTot += (p.y - meanY) ** 2;
  }

  const slope = ssXX !== 0 ? ssXY / ssXX : 0;
  const intercept = meanY - slope * meanX;

  const ssRes = points.reduce((s, p) => {
    return s + (p.y - (slope * p.x + intercept)) ** 2;
  }, 0);

  const r2 = ssTot !== 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;

  return { slope, intercept, r2: Math.round(r2 * 1000) / 1000, n };
}

export interface HistBin {
  range: string;
  count: number;
  mid: number;
}

/** Dynamic equal-width histogram bins computed from actual data range. */
export function dynamicBins(values: number[], numBins = 8): HistBin[] {
  const valid = values.filter(v => isFinite(v) && v > 0);
  if (valid.length === 0) return [];

  const sorted = [...valid].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  if (min === max) {
    return [{ range: `${min.toFixed(1)}M`, count: valid.length, mid: min }];
  }

  const step = (max - min) / numBins;
  return Array.from({ length: numBins }, (_, i) => {
    const lo = min + i * step;
    const hi = i === numBins - 1 ? max + 0.001 : lo + step;
    const count = valid.filter(v => v >= lo && v < hi).length;
    const fmt = (v: number) => v >= 1 ? `${v.toFixed(1)}M` : `${(v * 1000).toFixed(0)}k`;
    return { range: `${fmt(lo)}-${fmt(hi)}`, count, mid: (lo + hi) / 2 };
  });
}
