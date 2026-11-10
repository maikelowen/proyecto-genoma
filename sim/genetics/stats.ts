/** Estadística básica para agregar semillas (sin dependencias). */

export function mean(xs: readonly number[]): number {
  if (xs.length === 0) return NaN;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

export function sd(xs: readonly number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  let s = 0;
  for (const x of xs) s += (x - m) * (x - m);
  return Math.sqrt(s / (xs.length - 1));
}

/** t de Student bilateral 95 % para gl = n−1 (tabla; ≥30 ⇒ 1,96 aprox.). */
const T95 = [NaN, 12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145, 2.131, 2.12, 2.11, 2.101, 2.093, 2.086];
export function t95(df: number): number {
  if (df < 1) return NaN;
  return df < T95.length ? (T95[df] as number) : df < 30 ? 2.06 : 1.96;
}

/** Media e intervalo de confianza 95 % de la media entre semillas. */
export interface MeanCI {
  readonly mean: number;
  readonly lo: number;
  readonly hi: number;
  readonly n: number;
  readonly min: number;
  readonly max: number;
}
export function meanCI(xs: readonly number[]): MeanCI {
  const m = mean(xs);
  const h = xs.length > 1 ? (t95(xs.length - 1) * sd(xs)) / Math.sqrt(xs.length) : 0;
  return { mean: m, lo: m - h, hi: m + h, n: xs.length, min: Math.min(...xs), max: Math.max(...xs) };
}

/** Cuantil con interpolación lineal (tipo 7). Infinity se ordena al final. */
export function quantile(xs: readonly number[], q: number): number {
  const s = [...xs].sort((a, b) => a - b);
  if (s.length === 0) return NaN;
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const a = s[lo] as number;
  const b = s[hi] as number;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return lo === hi ? a : Number.isFinite(a) ? Infinity : a;
  return a + (b - a) * (pos - lo);
}
