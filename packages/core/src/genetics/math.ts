/**
 * Primitivas numéricas de la genética. Solo + − × /, Math.round,
 * Math.floor, min/max (spec §9.1): deterministas bit a bit en cualquier
 * motor JS. Prohibidos Math.log/exp/sin/cos y rng.normal aquí.
 */
import type { Rng } from "../rng.ts";
import { STAT_IDS, type GeneticsConfig, type Shape, type Stats } from "./types.ts";

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(Math.max(x, lo), hi);
}

/** spec notación `r2(x)` con `redondeo_decimales`. */
export function roundTo(x: number, config: GeneticsConfig): number {
  const f = 10 ** config.decimals;
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

/** Construye Stats desde un array en orden pot, vel, res. */
export function statsFrom(arr: readonly number[]): Stats {
  return { potencia: arr[0] as number, velocidad: arr[1] as number, resistencia: arr[2] as number };
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
export function signatureOf(shape: Shape, config: GeneticsConfig): string {
  const steps = config.shape.levels - 1;
  return shape.map((x) => String(Math.round(x * steps))).join("");
}
