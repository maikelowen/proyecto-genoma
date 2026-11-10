/**
 * Primitivas numéricas de la genética. Solo + − * /, comparaciones,
 * Math.round/floor/min/max/abs (spec §9.1): deterministas bit a bit en
 * cualquier motor JS. Prohibidos `**`, Math.pow/sqrt/log/exp,
 * trigonométricas y rng.normal.
 */
import type { Rng } from "../rng.ts";
import { STAT_IDS, type GeneticsConfig, type Shape, type Stats } from "./types.ts";

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(Math.max(x, lo), hi);
}

/** spec notación `r2(x)` = Math.round(x·F)/F con F = config.roundFactor. */
export function roundTo(x: number, config: GeneticsConfig): number {
  const f = config.roundFactor;
  return Math.round(x * f) / f;
}

/**
 * spec §9.1 `N()`: normal estándar aproximada Irwin–Hall,
 * (u1+…+un − centro) × factor. Consume `normal.n_uniformes` tiradas (4).
 */
export function sampleNormal(rng: Rng, config: GeneticsConfig): number {
  const { uniforms, center, factor } = config.normal;
  let s = 0;
  for (let i = 0; i < uniforms; i++) s += rng.next();
  return (s - center) * factor;
}

export function sampleNormals(rng: Rng, count: number, config: GeneticsConfig): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push(sampleNormal(rng, config));
  return out;
}

/** Media aritmética de un vector de 3 (spec notación `media(n)`). */
export function mean3(n: readonly number[]): number {
  return ((n[0] as number) + (n[1] as number) + (n[2] as number)) / 3;
}

/** Construye Stats congelado desde un array en orden pot, vel, res. */
export function statsFrom(arr: readonly number[]): Stats {
  return Object.freeze({ potencia: arr[0] as number, velocidad: arr[1] as number, resistencia: arr[2] as number });
}

export function statsToArray(s: Stats): [number, number, number] {
  return [s.potencia, s.velocidad, s.resistencia];
}

export function statSum(s: Stats): number {
  let t = 0;
  for (const k of STAT_IDS) t += s[k];
  return t;
}

/** spec §1.2 `firma`: 4 dígitos round(forma[i]·(niveles−1)). */
export function signatureOf(shape: readonly number[], config: GeneticsConfig): string {
  const steps = config.shape.levels - 1;
  return shape.map((x) => String(Math.round(x * steps))).join("");
}

/** Límites de anclas (spec §1.5): [ancla_min, ancla_max] para las 3. */
export function anchorBounds(config: GeneticsConfig): [number[], number[]] {
  const { anchorMin, anchorMax } = config.values;
  return [
    [anchorMin, anchorMin, anchorMin],
    [anchorMax, anchorMax, anchorMax],
  ];
}

/** Límites de valores (spec §1.5): [max(5, a−10), min(60, a+10)] por estadística. */
export function valueBoundsOf(anchor: readonly number[], config: GeneticsConfig): [number[], number[]] {
  const v = config.values;
  return [
    anchor.map((a) => Math.max(v.absMin, a - v.maxDeviation)),
    anchor.map((a) => Math.min(v.absMax, a + v.maxDeviation)),
  ];
}

/**
 * spec §1.5 `repartir(x, lo, hi, S)`: ajusta x a suma S dentro de
 * límites, sin tiradas. Precondición: Σlo ≤ S ≤ Σhi.
 * Resultado con `decimals` decimales y suma exacta a S en esos decimales.
 */
export function distribute(
  input: readonly number[],
  lo: readonly number[],
  hi: readonly number[],
  S: number,
  config: GeneticsConfig,
): number[] {
  const { sumRetries, sumEpsilon } = config.mutation;
  const n = input.length;
  const x = input.map((v, k) => clamp(v, lo[k] as number, hi[k] as number));
  const sum = (): number => x.reduce((s, v) => s + v, 0);

  for (let r = 0; r < sumRetries; r++) {
    const e = S - sum();
    if (Math.abs(e) < sumEpsilon) break;
    const free: number[] = [];
    for (let k = 0; k < n; k++) if (e > 0 ? (x[k] as number) < (hi[k] as number) : (x[k] as number) > (lo[k] as number)) free.push(k);
    if (free.length === 0) break; // solo si Σlo > S o S > Σhi (precondición rota)
    for (const k of free) x[k] = clamp((x[k] as number) + e / free.length, lo[k] as number, hi[k] as number);
  }

  for (let k = 0; k < n; k++) x[k] = roundTo(x[k] as number, config);
  // Ajuste de redondeo en pasos de 1/F (0,01), orden pot → vel → res.
  const unit = 1 / config.roundFactor;
  let rest = roundTo(S - sum(), config);
  let guard = 0;
  while (rest !== 0) {
    const s = rest > 0 ? unit : -unit;
    let k = 0;
    while (k < n) {
      const c = roundTo((x[k] as number) + s, config);
      if (c >= (lo[k] as number) && c <= (hi[k] as number)) break;
      k++;
    }
    if (k === n || ++guard > 1000) throw new Error(`distribute: sin hueco para ajustar (S=${S})`);
    x[k] = roundTo((x[k] as number) + s, config);
    rest = roundTo(rest - s, config);
  }
  return x;
}
