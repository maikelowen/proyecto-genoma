/**
 * Métricas y criterios del combate v0.1 (combate §12, movimientos §7).
 * Los umbrales se leen de `criterios_sim` de las configs; aquí no hay números de criterio.
 */
import { quantile, quantileCI } from "../genetics/stats.ts";
import type { JobResult } from "./jobs.ts";
import { RAW_COMBAT, RAW_MOVES } from "./setup.ts";

export type Agg = Omit<JobResult, "job">;

export interface Interval {
  readonly value: number;
  readonly lo: number;
  readonly hi: number;
}

/** Tasa de victorias con empates = ½ e IC 95 % normal sobre los resultados 1 / ½ / 0. */
export function winRate(wins: number, draws: number, n: number): Interval {
  if (n === 0) return { value: NaN, lo: NaN, hi: NaN };
  const p = (wins + 0.5 * draws) / n;
  const v = Math.max(0, (wins + 0.25 * draws) / n - p * p);
  const h = 1.96 * Math.sqrt(v / n);
  return { value: p, lo: p - h, hi: p + h };
}

/** Proporción con IC de Wilson 95 %. */
export function wilson(k: number, n: number): Interval {
  if (n === 0) return { value: NaN, lo: NaN, hi: NaN };
  const z = 1.96;
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return { value: p, lo: Math.max(0, c - h), hi: Math.min(1, c + h) };
}

export interface Duration {
  readonly n: number;
  readonly mean: Interval;
  readonly median: Interval;
  readonly p90: Interval;
  readonly draws: Interval;
  readonly drawsCap: Interval;
  readonly basicShare: number;
  readonly archetypeShare: Record<string, number>;
}

export function expandHist(h: readonly number[]): number[] {
  const xs: number[] = [];
  h.forEach((c, t) => {
    for (let i = 0; i < (c ?? 0); i++) xs.push(t);
  });
  return xs;
}

export function duration(a: Agg): Duration {
  const xs = expandHist(a.turnsHist);
  const n = xs.length;
  const m = xs.reduce((s, x) => s + x, 0) / n;
  const sd = Math.sqrt(xs.reduce((s, x) => s + (x - m) * (x - m), 0) / Math.max(1, n - 1));
  const med = quantileCI(xs, 0.5);
  const p90 = quantileCI(xs, 0.9);
  const acts = a.basic + Object.values(a.byArchetype).reduce((s, x) => s + x, 0);
  const share: Record<string, number> = {};
  for (const [k, v] of Object.entries(a.byArchetype)) share[k] = acts ? v / acts : 0;
  return {
    n,
    mean: { value: m, lo: m - (1.96 * sd) / Math.sqrt(n), hi: m + (1.96 * sd) / Math.sqrt(n) },
    median: { value: quantile(xs, 0.5), lo: med.lo, hi: med.hi },
    p90: { value: quantile(xs, 0.9), lo: p90.lo, hi: p90.hi },
    draws: wilson(a.draws, a.n),
    drawsCap: wilson(a.drawsCap, a.n),
    basicShare: acts ? a.basic / acts : NaN,
    archetypeShare: share,
  };
}

export interface Criterion {
  readonly id: string;
  readonly group: string;
  readonly label: string;
  readonly threshold: string;
  readonly value: number;
  readonly lo: number;
  readonly hi: number;
  readonly pass: boolean;
  /** El IC cruza el umbral. */
  readonly fragile: boolean;
  readonly informative?: boolean;
  /** Semillas que aprueban por separado, si aplica. */
  readonly seedsOk?: readonly [number, number];
  /** Formato: "pct" (porcentaje) o "num". */
  readonly fmt: "pct" | "num";
}

const CC = RAW_COMBAT.criterios_sim;
const MC = RAW_MOVES.criterios_sim;

function between(id: string, group: string, label: string, iv: Interval, min: number, max: number, fmt: "pct" | "num", seedsOk?: [number, number], informative = false): Criterion {
  const pass = iv.value >= min && iv.value <= max;
  const fragile = (Number.isFinite(min) && iv.lo < min && iv.hi >= min) || (Number.isFinite(max) && iv.lo <= max && iv.hi > max);
  const f = (x: number): string => (fmt === "pct" ? `${(x * 100).toLocaleString("es", { maximumFractionDigits: 1 })} %` : x.toLocaleString("es"));
  const thr = min === -Infinity ? `≤ ${f(max)}` : max === Infinity ? `≥ ${f(min)}` : `${f(min)}–${f(max)}`;
  return { id, group, label, threshold: thr, value: iv.value, lo: iv.lo, hi: iv.hi, pass, fragile, fmt, informative, ...(seedsOk ? { seedsOk } : {}) };
}

/** Criterios de duración y lado de C1 para un conjunto de semillas (una Agg por semilla). */
export function c1Criteria(perSeed: readonly Agg[], all: Agg): Criterion[] {
  const D = CC.duracion;
  const d = duration(all);
  const ds = perSeed.map(duration);
  const ok = (f: (x: Duration) => boolean): [number, number] => [ds.filter(f).length, ds.length];
  const side = winRate(all.aWins, all.draws, all.n);
  const sideSeeds = perSeed.map((a) => winRate(a.aWins, a.draws, a.n).value);
  return [
    between("dur_media", "Duración C1", "Turnos, media", d.mean, D.media_min, D.media_max, "num", ok((x) => x.mean.value >= D.media_min && x.mean.value <= D.media_max)),
    between("dur_mediana", "Duración C1", "Turnos, mediana", d.median, D.mediana_min, D.mediana_max, "num", ok((x) => x.median.value >= D.mediana_min && x.median.value <= D.mediana_max)),
    between("dur_p90", "Duración C1", "Turnos, p90", d.p90, -Infinity, D.p90_max, "num", ok((x) => x.p90.value <= D.p90_max)),
    between("dur_empates", "Duración C1", "Empates", d.draws, -Infinity, D.max_empates, "pct", ok((x) => x.draws.value <= D.max_empates)),
    between("lado_A", "Lado C1", "Victorias de A (empate = ½)", side, CC.lado.min, CC.lado.max, "pct", [sideSeeds.filter((x) => x >= CC.lado.min && x <= CC.lado.max).length, sideSeeds.length]),
  ];
}

export function initiativeCriterion(all: Agg): Criterion {
  const [lo, hi] = CC.iniciativa.rango_informativo as [number, number];
  return between("iniciativa", "Iniciativa (inf.)", "Actúa antes la de más iniciativa base (Δ ≤ 5)", wilson(all.initHigherFirst, all.initPairs), lo, hi, "pct", undefined, true);
}

export interface FamilyRate {
  readonly family: string;
  readonly rate: Interval;
  readonly n: number;
}

/** C2: tasa de cada familia contra el conjunto de las otras 12 (empate = ½). */
export function familyRates(pairs: readonly { F: string; G: string; a: Agg }[], families: readonly string[]): FamilyRate[] {
  return families.map((fam) => {
    let w = 0;
    let d = 0;
    let n = 0;
    for (const p of pairs) {
      if (p.F === fam) {
        w += p.a.xWins;
        d += p.a.draws;
        n += p.a.n;
      } else if (p.G === fam) {
        w += p.a.yWins;
        d += p.a.draws;
        n += p.a.n;
      }
    }
    return { family: fam, rate: winRate(w, d, n), n };
  });
}

export function familyCriteria(rates: readonly FamilyRate[]): Criterion[] {
  const worst = [...rates].sort((a, b) => Math.abs(b.rate.value - 0.5) - Math.abs(a.rate.value - 0.5))[0]!;
  const nOk = rates.filter((r) => r.rate.value >= CC.familias.min && r.rate.value <= CC.familias.max).length;
  return [between("familias", "Familias C2", `Familia más alejada del 50 % (${worst.family})`, worst.rate, CC.familias.min, CC.familias.max, "pct", [nOk, rates.length])];
}

export function qualityCriteria(beta: number, a: Agg, informative: boolean): Criterion[] {
  const q = CC.calidad_D008;
  const wr = winRate(a.xWins, a.draws, a.n);
  const b = beta.toLocaleString("es");
  return [
    between(`calidad_obj_b${beta}`, "D-008 C3", `Calidad máx. vs mín., β = ${b} (objetivo)`, wr, -Infinity, q.objetivo_max, "pct", undefined, informative),
    between(`calidad_lim_b${beta}`, "D-008 C3", `Calidad máx. vs mín., β = ${b} (límite)`, wr, -Infinity, q.limite_max, "pct", undefined, informative),
  ];
}

export function energyCriteria(byReserve: readonly { u: number; a: Agg }[]): Criterion[] {
  const E = CC.energia;
  const rates = byReserve.map((r) => ({ u: r.u, wr: winRate(r.a.xWins, r.a.draws, r.a.n) }));
  const best = [...rates].sort((x, y) => y.wr.value - x.wr.value)[0]!;
  const worstForZero = [...rates].sort((x, y) => y.wr.value - x.wr.value)[0]!;
  const zero = { value: 1 - worstForZero.wr.value, lo: 1 - worstForZero.wr.hi, hi: 1 - worstForZero.wr.lo };
  return [
    // [v0.2] criterio invertido: ninguna reserva u > 0 debe dominar (max_mejor_reserva_vs_0). Falta el de uso de coste 4–5 (min_uso_coste_4_5_si_pagable).
    between("energia_mejor", "Energía C4", `Mejor reserva u > 0 contra u = 0 (u = ${best.u})`, best.wr, -Infinity, E.max_mejor_reserva_vs_0, "pct"),
    between("energia_cero", "Energía C4", `u = 0 contra su peor rival (u = ${worstForZero.u})`, zero, E.min_reserva0_vs_cualquiera, Infinity, "pct"),
  ];
}

// --------------------------------------------------------------- movimientos

export type Verdict = "roto grave" | "roto" | "inútil" | "normal";

export interface MoveRow {
  readonly key: string;
  readonly id: string;
  readonly source: "catálogo" | "mutado";
  readonly name: string;
  readonly desc: string;
  readonly cost: number;
  readonly archetype: string;
  readonly status: string;
  readonly modifier: string;
  readonly condition: string;
  readonly family: string;
  readonly n: number;
  readonly wr: Interval;
  readonly use: number;
  readonly verdict: Verdict;
  readonly suspicious: boolean;
  /** El IC cruza algún umbral de veredicto. */
  readonly uncertain: boolean;
}

export function moveVerdict(wr: Interval): { verdict: Verdict; uncertain: boolean } {
  const cuts = [MC.inutil_wr, MC.roto_wr, MC.roto_grave_wr] as number[];
  const verdict: Verdict = wr.value > MC.roto_grave_wr ? "roto grave" : wr.value > MC.roto_wr ? "roto" : wr.value < MC.inutil_wr ? "inútil" : "normal";
  return { verdict, uncertain: cuts.some((c) => wr.lo < c && wr.hi > c) };
}

export function needsMore(a: Agg): boolean {
  return moveVerdict(winRate(a.xWins, a.draws, a.n)).uncertain;
}

export function moveCriteria(rows: readonly MoveRow[]): Criterion[] {
  const cat = rows.filter((r) => r.source === "catálogo");
  const broken = cat.filter((r) => r.verdict === "roto" || r.verdict === "roto grave").length;
  const graves = rows.filter((r) => r.verdict === "roto grave").length;
  const frac = wilson(broken, cat.length);
  return [
    between("mov_rotos_catalogo", "Movimientos §7", `Catálogo roto (${broken} de ${cat.length})`, frac, -Infinity, MC.max_frac_rotos_catalogo, "pct"),
    between("mov_rotos_graves", "Movimientos §7", "Rotos graves (catálogo + muestra)", { value: graves, lo: graves, hi: graves }, -Infinity, MC.max_rotos_graves, "num"),
  ];
}

export function archetypeCriterion(perFamily: readonly { family: string; n: number }[]): Criterion {
  const min = MC.min_arquetipos_por_familia_catalogo as number;
  const worst = [...perFamily].sort((a, b) => a.n - b.n)[0]!;
  return { ...between("mov_arquetipos", "Movimientos §5", `Arquetipos distintos por familia del catálogo (mín.: ${worst.family})`, { value: worst.n, lo: worst.n, hi: worst.n }, min, Infinity, "num"), seedsOk: [perFamily.filter((f) => f.n >= min).length, perFamily.length] };
}
