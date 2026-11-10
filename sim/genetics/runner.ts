/**
 * Orquestación (spec v0.2): planes (rápido/completo), experimentos,
 * extracción de métricas por semilla y evaluación de criterios §10.2.
 */
import type { GeneticsConfig } from "../../packages/core/src/index.ts";
import { buildConfig, buildRaw, DEFAULT_VARIANT, oneParam, RAW, type Variant } from "./cfg.ts";
import { runE4, runPopulation, type PopRunResult, type Row } from "./engine.ts";
import { geometricMLE, meanCI, quantile, quantileCI, type MeanCI } from "./stats.ts";
import { findStrategy, randomStrategy, speedStrategy, type Strategy } from "./strategies.ts";

const ESC = RAW["escenarios_sim"];
const CRIT = RAW["criterios_sim"];

/**
 * Prefijo de semillas por defecto: siempre uno NO usado para elegir nada
 * (QA S-02, V-01). Historial: `genoma-*` eligió los parámetros de v0.1;
 * `valida02-*` validó v0.2 y con ellas se eligió κ 0,075; `valida03-*`
 * revalida κ 0,075. Al elegir algo con unas semillas, añádelas a USED_SEED_PREFIXES.
 */
export const DEFAULT_SEED_PREFIX = "valida03";
export const V01_SEED_PREFIX = "genoma";
export const USED_SEED_PREFIXES: readonly string[] = ["genoma", "valida02"];

export interface Plan {
  readonly mode: "rapido" | "completo";
  readonly seeds: readonly string[];
  readonly e1: { readonly N: number; readonly gens: number };
  readonly e3: { readonly N: number; readonly gens: number };
  readonly e4: { readonly trialsPerSeed: number; readonly cap: number };
  /** Generaciones del ensayo pareado 2 % vs 3 %. */
  readonly pairedGens: number;
  /**
   * Semillas de E5: su resultado depende de si hay o no un barrido selectivo
   * (varía 37–88 % entre semillas), así que en modo completo usa las 20 de
   * la spec (`E5_estrategia_velocidad.semillas`); el resto, `seeds`.
   */
  readonly e5Seeds: readonly string[];
}

export function seedsFor(plan: Plan, sc: ScenarioId): readonly string[] {
  return sc === "E5" ? plan.e5Seeds : plan.seeds;
}

export function makePlan(o: { quick: boolean; seeds?: number; seedPrefix: string; gens?: number; pop?: number }): Plan {
  const nSeeds = o.seeds ?? (o.quick ? 2 : 5);
  const seeds = Array.from({ length: nSeeds }, (_, i) => `${o.seedPrefix}-${i + 1}`);
  const e4Total = o.quick ? 1000 : (ESC["E4_primera_hibrida"].ensayos as number);
  return {
    mode: o.quick ? "rapido" : "completo",
    seeds,
    e1: { N: o.pop ?? (o.quick ? 200 : ESC["E1_cerrada"].poblacion), gens: o.gens ?? (o.quick ? 40 : ESC["E1_cerrada"].generaciones) },
    e3: { N: ESC["E3a_deriva_homocigoto"].poblacion, gens: o.quick ? 30 : ESC["E3a_deriva_homocigoto"].generaciones },
    e4: { trialsPerSeed: Math.ceil(e4Total / nSeeds), cap: ESC["E4_primera_hibrida"].tope_crias },
    pairedGens: o.quick ? 5 : 20,
    e5Seeds: o.quick || o.seeds !== undefined ? seeds : Array.from({ length: Math.max(nSeeds, ESC["E5_estrategia_velocidad"].semillas as number) }, (_, i) => `${o.seedPrefix}-${i + 1}`),
  };
}

/** Escenarios v0.2 (spec §10.1). E3a = homocigoto; E3c = heterocigoto (antigua E3a v0.1). */
export type ScenarioId = "E1" | "E2" | "E3a" | "E3a_control" | "E3b" | "E3c" | "E4" | "E5";
export const ALL_SCENARIOS: readonly ScenarioId[] = ["E1", "E2", "E3a", "E3a_control", "E3b", "E3c", "E4", "E5"];

export interface Experiment {
  readonly id: string;
  readonly label: string;
  readonly variants: readonly Variant[];
  readonly scenarios: readonly ScenarioId[];
  /** Estrategia de E1/E2 (E5 usa siempre la de velocidad). */
  readonly strategy: Strategy;
}

/** κ de la config por defecto (se lee del JSON, nunca se escribe a mano: QA V-02). */
export function defaultKappa(): number {
  return buildConfig(DEFAULT_VARIANT.set).drift.kappa;
}

export function kappaVariant(k: number): Variant {
  return oneParam(`kappa${k}`, `κ ${String(k).replace(".", ",")}`, "deriva.kappa", k);
}

/**
 * Referencias de κ para la trayectoria del monocultivo (QA V-03): los
 * valores vecinos del de por defecto en `barridos_sim["deriva.kappa"]`.
 * No se elige nada con ellas: solo describen cómo responde E5 a κ.
 */
export function kappaReferences(): Variant[] {
  const ks = [...(RAW["barridos_sim"]["deriva.kappa"] as number[])].sort((a, b) => a - b);
  const k0 = defaultKappa();
  const below = ks.filter((k) => k < k0).pop();
  const above = ks.find((k) => k > k0);
  return [below, above].filter((k): k is number => k !== undefined).map(kappaVariant);
}

export function experiments(): Experiment[] {
  const k0 = String(defaultKappa()).replace(".", ",");
  return [
    { id: "v02", label: `Configuración por defecto del JSON (κ ${k0})`, variants: [{ ...DEFAULT_VARIANT, label: `por defecto (κ ${k0})` }], scenarios: ALL_SCENARIOS, strategy: randomStrategy },
    { id: "referencia_kappa", label: "Referencias de κ (solo E5 y E3a, para la trayectoria del monocultivo)", variants: kappaReferences(), scenarios: ["E5", "E3a", "E3a_control"], strategy: randomStrategy },
  ];
}

/** Config efectiva de un escenario (E3a/E3c fuerzan la mutación indicada en el JSON). */
export function effectiveSet(v: Variant, sc: ScenarioId): Record<string, unknown> {
  if (sc === "E3a" || sc === "E3a_control") return { ...v.set, "mutacion.prob_por_locus": ESC["E3a_deriva_homocigoto"].prob_mutacion_override };
  if (sc === "E3c") return { ...v.set, "mutacion.prob_por_locus": ESC["E3c_deriva_heterocigoto"].prob_mutacion_override };
  return { ...v.set };
}

/** Clave de deduplicación: misma clave ⇒ mismo resultado exacto (E4 lleva el id de config en su flujo RNG). */
export function runKey(strategyId: string, v: Variant, sc: ScenarioId, seed: string): string {
  return `${sc}|${sc === "E5" ? speedStrategy.id : strategyId}|${seed}|${sc === "E4" ? v.id : ""}|${JSON.stringify(buildRaw(effectiveSet(v, sc)))}`;
}

export function strategyById(id: string): Strategy {
  return findStrategy(id);
}

// ---------------------------------------------------------------------------
// Ejecución
// ---------------------------------------------------------------------------

export interface ScenarioRun {
  readonly experiment: string;
  readonly variant: Variant;
  readonly scenario: ScenarioId;
  readonly seed: string;
  readonly rows: Row[];
  readonly hash: string;
  readonly violations: number;
  readonly violationSamples: string[];
  readonly fallbackPairs: number;
  /** Solo E4 (Infinity = censurado al tope). */
  readonly geneCounts?: number[];
  readonly creatureCounts?: number[];
}

export function runScenario(exp: Experiment, v: Variant, sc: ScenarioId, seed: string, plan: Plan): ScenarioRun {
  const cfg: GeneticsConfig = buildConfig(effectiveSet(v, sc));
  if (sc === "E4") {
    const e = ESC["E4_primera_hibrida"];
    const r = runE4({ variantId: v.id, cfg, seed, trials: plan.e4.trialsPerSeed, famA: e.familia_A, famB: e.familia_B, target: e.hibrida_objetivo, cpp: e.crias_por_pareja, cap: plan.e4.cap });
    return { experiment: exp.id, variant: v, scenario: sc, seed, rows: r.rows, hash: "", violations: r.violations, violationSamples: [], fallbackPairs: 0, geneCounts: r.geneCounts, creatureCounts: r.creatureCounts };
  }
  const strategy = sc === "E5" ? speedStrategy : exp.strategy;
  const scenarioName = sc === "E5" || strategy.id === "azar" ? sc : `${sc}_${strategy.id}`;
  const common = { scenario: scenarioName, variantId: v.id, cfg, seed, strategy, wildFrac: 0, select: "top_speed" as const, init: "wild" as const };
  let res: PopRunResult;
  if (sc === "E1" || sc === "E2" || sc === "E5") {
    const N = plan.e1.N;
    res = runPopulation({
      ...common,
      N,
      gens: plan.e1.gens,
      cpp: ESC["E1_cerrada"].crias_por_pareja,
      children: N,
      wildFrac: sc === "E2" ? ESC["E2_con_capturas"].fraccion_salvajes_por_generacion : 0,
    });
  } else {
    const e = ESC["E3a_deriva_homocigoto"];
    res = runPopulation({
      ...common,
      N: plan.e3.N,
      gens: plan.e3.gens,
      cpp: e.crias_por_pareja,
      children: e.parejas * e.crias_por_pareja,
      init: sc === "E3b" ? "wild" : sc === "E3c" ? "clones" : "clones_homo",
      homoGenome: e.genoma_clon,
      select: sc === "E3a_control" ? "random" : "top_speed",
    });
  }
  return { experiment: exp.id, variant: v, scenario: sc, seed, rows: res.rows, hash: res.finalHash, violations: res.violations, violationSamples: res.violationSamples, fallbackPairs: res.fallbackPairs };
}

// ---------------------------------------------------------------------------
// Métricas por semilla
// ---------------------------------------------------------------------------

const LOCI = ["cabeza", "cuerpo", "extremidades", "cola"] as const;
const num = (r: Row | undefined, k: string): number => Number(r?.[k] ?? NaN);
const sumRange = (rows: readonly Row[], k: string, g0: number, g1: number): number =>
  rows.filter((r) => num(r, "gen") >= g0 && num(r, "gen") <= g1).reduce((s, r) => s + num(r, k), 0);
const meanRange = (rows: readonly Row[], k: string, g0: number, g1: number): number => {
  const sel = rows.filter((r) => num(r, "gen") >= g0 && num(r, "gen") <= g1);
  return sel.reduce((s, r) => s + num(r, k), 0) / sel.length;
};

export type SeedMetrics = Record<string, number>;

/** E1 y E5 (misma estructura: diversidad en la última generación, etc.). */
export function e1Metrics(rows: readonly Row[]): SeedMetrics {
  const [g0a, g0b] = CRIT["sorpresa"].generaciones as [number, number];
  const last = rows[rows.length - 1] as Row;
  const first = rows[0] as Row;
  const F = num(last, "gen");
  const muts = sumRange(rows, "mutaciones", 1, F);
  const m: SeedMetrics = {
    sorpresa: meanRange(rows, "sorpresa", g0a, g0b),
    sorpresa_sin_mutacion: meanRange(rows, "sorpresa_sin_mutacion", g0a, g0b),
    sorpresa_final10: meanRange(rows, "sorpresa", F - 9, F),
    div_distintas_min: Math.min(...LOCI.map((L) => num(last, `dist_todos_${L}`))),
    div_H_todos_min: Math.min(...LOCI.map((L) => num(last, `H_todos_${L}`))),
    div_H_D_min: Math.min(...LOCI.map((L) => num(last, `H_D_${L}`))),
    div_H_ratio_min: Math.min(...LOCI.flatMap((L) => [num(last, `H_todos_${L}`) / num(first, `H_todos_${L}`), num(last, `H_D_${L}`) / num(first, `H_D_${L}`)])),
    div_maxfrec_D_max: Math.max(...LOCI.map((L) => num(last, `maxfrec_D_${L}`))),
    mut_por_1000: (1000 * muts) / sumRange(rows, "n_crias", 1, F),
    frac_crias_mutadas: sumRange(rows, "crias_con_mutacion", 1, F) / sumRange(rows, "n_crias", 1, F),
    mutaciones: muts,
    frac_mut_coincide_R: sumRange(rows, "mut_coincide_R_padre", 1, F) / muts,
    frac_mut_catalogo: sumRange(rows, "mut_en_catalogo", 1, F) / muts,
    mut_clave_de_padre: sumRange(rows, "mut_clave_de_padre", 1, F),
    respaldo_N0: sumRange(rows, "mut_respaldo_N0", 1, F),
    respaldo_N1: sumRange(rows, "mut_respaldo_N1", 1, F),
    respaldo_N2: sumRange(rows, "mut_respaldo_N2", 1, F),
    respaldo_N3: sumRange(rows, "mut_respaldo_N3", 1, F),
    genedex_final: num(last, "genedex_total"),
    frac_D_hibrido_final: num(last, "frac_D_hibrido"),
    frac_criaturas_hibridas_final: num(last, "frac_criaturas_hibridas"),
    vel_delta_final: num(last, "vel_total_media") / num(first, "vel_total_media") - 1,
    vel_D_delta_pts_final: num(last, "vel_D_media") - num(first, "vel_D_media"),
    calidad_0: num(first, "calidad_media"),
    calidad_final: num(last, "calidad_media"),
    calidad_delta_final: num(last, "calidad_media") - num(first, "calidad_media"),
    gen_final: F,
  };
  for (const L of LOCI) m[`sorpresa_${L}`] = meanRange(rows, `sorpresa_${L}`, g0a, g0b);
  for (const k of Object.keys(last)) if (k.startsWith("fam_")) m[k] = num(last, k);
  return m;
}

export function e2Metrics(rows: readonly Row[]): SeedMetrics {
  const last = rows[rows.length - 1] as Row;
  const F = num(last, "gen");
  const newLast = sumRange(rows, "genedex_nuevas", F - 9, F);
  const redLast = sumRange(rows, "genedex_redescubiertas", F - 9, F);
  return {
    genedex_nuevas_1_10: (1000 * sumRange(rows, "genedex_nuevas", 1, 10)) / sumRange(rows, "n_crias", 1, 10),
    genedex_nuevas_final10: (1000 * newLast) / sumRange(rows, "n_crias", F - 9, F),
    genedex_repetidas_final10: newLast + redLast > 0 ? redLast / (newLast + redLast) : NaN,
    hibridas_vistas: num(last, "hibridas_distintas_vistas"),
    genedex_final: num(last, "genedex_total"),
    sorpresa: meanRange(rows, "sorpresa", 1, 20),
    frac_D_hibrido_final: num(last, "frac_D_hibrido"),
    frac_criaturas_hibridas_final: num(last, "frac_criaturas_hibridas"),
    calidad_final: num(last, "calidad_media"),
    gen_final: F,
  };
}

/** E3a/E3b/E3c: Δ velocidad en puntos por gen D (spec v0.2) y en % (como v0.1). */
export function e3Metrics(rows: readonly Row[]): SeedMetrics {
  const first = rows[0] as Row;
  const last = rows[rows.length - 1] as Row;
  const at = (g: number): Row | undefined => rows.find((r) => num(r, "gen") === g);
  const v0 = num(first, "vel_D_media");
  const d0 = num(first, "desv_vel_D_media");
  return {
    delta_pts_20: num(at(20), "vel_D_media") - v0,
    delta_pts_final: num(last, "vel_D_media") - v0,
    /** Parte de deriva de valores (valor − ancla); el resto es cambio de tipo/ancla (QA S-05). */
    deriva_pts_20: num(at(20), "desv_vel_D_media") - d0,
    deriva_pts_final: num(last, "desv_vel_D_media") - d0,
    delta_pct_20: num(at(20), "vel_D_media") / v0 - 1,
    delta_pct_final: num(last, "vel_D_media") / v0 - 1,
    calidad_delta_final: num(last, "calidad_media") - num(first, "calidad_media"),
    vel0_D: v0,
    gen_final: num(last, "gen"),
  };
}

// ---------------------------------------------------------------------------
// Resumen y criterios
// ---------------------------------------------------------------------------

export interface QuantileSummary {
  readonly median: number;
  readonly p90: number;
  readonly medCI: { lo: number; hi: number };
  readonly p90CI: { lo: number; hi: number };
  readonly censored: number;
  readonly mle: ReturnType<typeof geometricMLE>;
  /** Cubetas de 10 crías (la última = ≥ 200), en nº de ensayos. */
  readonly hist: number[];
}

export interface E4Summary {
  readonly n: number;
  readonly cap: number;
  readonly gene: QuantileSummary;
  readonly creature: QuantileSummary;
}

export interface VariantSummary {
  readonly experiment: string;
  readonly variant: Variant;
  readonly probMut: number;
  readonly perSeed: Partial<Record<ScenarioId, SeedMetrics[]>>;
  readonly e4?: E4Summary;
  readonly violations: number;
  readonly violationSamples: string[];
  readonly fallbackPairs: number;
}

function qsum(xs: readonly number[], cap: number): QuantileSummary {
  const h = new Array<number>(21).fill(0);
  for (const x of xs) h[Math.min(20, Math.floor((x - 1) / 10))]! += 1;
  return {
    median: quantile(xs, 0.5),
    p90: quantile(xs, 0.9),
    medCI: quantileCI(xs, 0.5),
    p90CI: quantileCI(xs, 0.9),
    censored: xs.filter((x) => !Number.isFinite(x)).length,
    mle: geometricMLE(xs, cap),
    hist: h,
  };
}

export function summarize(exp: Experiment, v: Variant, runs: readonly ScenarioRun[]): VariantSummary {
  const perSeed: Partial<Record<ScenarioId, SeedMetrics[]>> = {};
  let violations = 0;
  let fallbackPairs = 0;
  const violationSamples: string[] = [];
  let e4: E4Summary | undefined;
  for (const sc of exp.scenarios) {
    const rs = runs.filter((r) => r.scenario === sc);
    for (const r of rs) {
      violations += r.violations;
      fallbackPairs += r.fallbackPairs;
      violationSamples.push(...r.violationSamples);
    }
    if (sc === "E1" || sc === "E5") perSeed[sc] = rs.map((r) => e1Metrics(r.rows));
    else if (sc === "E2") perSeed.E2 = rs.map((r) => e2Metrics(r.rows));
    else if (sc === "E4") {
      const cap = ESC["E4_primera_hibrida"].tope_crias as number;
      const g = rs.flatMap((r) => r.geneCounts ?? []);
      const c = rs.flatMap((r) => r.creatureCounts ?? []);
      e4 = { n: g.length, cap, gene: qsum(g, cap), creature: qsum(c, cap) };
    } else perSeed[sc] = rs.map((r) => e3Metrics(r.rows));
  }
  return { experiment: exp.id, variant: v, probMut: buildConfig(v.set).mutation.probPerLocus, perSeed, ...(e4 ? { e4 } : {}), violations, violationSamples: violationSamples.slice(0, 5), fallbackPairs };
}

export interface Criterion {
  readonly id: string;
  readonly group: string;
  readonly label: string;
  readonly threshold: string;
  readonly value: number;
  readonly ci?: MeanCI | { readonly lo: number; readonly hi: number };
  readonly pass: boolean;
  readonly seedsPass?: [number, number];
  /** El IC cruza el umbral. */
  readonly fragile: boolean;
  readonly fmt: "pct" | "num" | "int" | "pts";
  /** Informativo (sin umbral en la spec): no cuenta en aprobados. */
  readonly informative?: boolean;
}

function crit(id: string, group: string, label: string, threshold: string, xs: readonly number[], ok: (x: number) => boolean, fmt: Criterion["fmt"], informative = false): Criterion {
  const ci = meanCI(xs);
  return { id, group, label, threshold, value: ci.mean, ci, pass: ok(ci.mean), seedsPass: [xs.filter(ok).length, xs.length], fragile: xs.length > 1 && ok(ci.lo) !== ok(ci.hi), fmt, ...(informative ? { informative } : {}) };
}

function fixed(id: string, group: string, label: string, threshold: string, value: number, ci: { lo: number; hi: number }, ok: (x: number) => boolean, fmt: Criterion["fmt"]): Criterion {
  return { id, group, label, threshold, value, ci, pass: ok(value), fragile: ok(ci.lo) !== ok(ci.hi), fmt };
}

const pctS = (x: number): string => `${Math.round(x * 1000) / 10} %`.replace(".", ",");
const numS = (x: number): string => String(x).replace(".", ",");

export function evaluateCriteria(s: VariantSummary): Criterion[] {
  const out: Criterion[] = [];
  const e1 = s.perSeed.E1;
  if (e1) {
    const c = CRIT["sorpresa"];
    const col = (k: string): number[] => e1.map((m) => m[k] as number);
    out.push(crit("sorpresa", "Sorpresa", "E1 % crías con D nuevo (gen 1–20)", `${pctS(c.min)}–${pctS(c.max)}`, col("sorpresa"), (x) => x >= c.min && x <= c.max, "pct"));
    const d = CRIT["diversidad"];
    const F = e1[0]?.["gen_final"];
    out.push(crit("div_distintas", "Diversidad", `E1 gen ${F}: mín. claves distintas por locus`, `≥ ${d.min_identidades_distintas_todos}`, col("div_distintas_min"), (x) => x >= d.min_identidades_distintas_todos, "num"));
    out.push(crit("div_H_todos", "Diversidad", `E1 gen ${F}: mín. H todos los slots (bits)`, `≥ ${numS(d.min_entropia_bits_todos)}`, col("div_H_todos_min"), (x) => x >= d.min_entropia_bits_todos, "num"));
    out.push(crit("div_H_D", "Diversidad", `E1 gen ${F}: mín. H solo D (bits)`, `≥ ${numS(d.min_entropia_bits_D)}`, col("div_H_D_min"), (x) => x >= d.min_entropia_bits_D, "num"));
    out.push(crit("div_H_ratio", "Diversidad", `E1 gen ${F}: mín. H / H gen 0`, `≥ ${pctS(d.min_fraccion_entropia_gen0)}`, col("div_H_ratio_min"), (x) => x >= d.min_fraccion_entropia_gen0, "pct"));
    out.push(crit("div_maxfrec", "Diversidad", `E1 gen ${F}: máx. frecuencia de una clave en D`, `≤ ${pctS(d.max_frecuencia_identidad_D)}`, col("div_maxfrec_D_max"), (x) => x <= d.max_frecuencia_identidad_D, "pct"));
    const mu = CRIT["mutacion"];
    const exp = 4000 * s.probMut;
    out.push(crit("mut_1000", "Mutación", "E1 mutaciones / 1000 crías", `4000·p = ${numS(Math.round(exp * 10) / 10)} ± ${pctS(mu.tolerancia_relativa)}`, col("mut_por_1000"), (x) => Math.abs(x - exp) <= mu.tolerancia_relativa * exp, "num"));
    out.push(crit("mut_frac", "Mutación", "E1 % crías con ≥1 mutación", `${pctS(mu.min_frac_crias_mutadas)}–${pctS(mu.max_frac_crias_mutadas)}`, col("frac_crias_mutadas"), (x) => x >= mu.min_frac_crias_mutadas && x <= mu.max_frac_crias_mutadas, "pct"));
  }
  const e5 = s.perSeed.E5;
  if (e5) {
    const mo = CRIT["monocultivo_estrategia"];
    const col = (k: string): number[] => e5.map((m) => m[k] as number);
    const F = e5[0]?.["gen_final"];
    out.push(crit("mono_distintas", "Monocultivo dirigido", `E5 gen ${F}: mín. claves distintas por locus`, `≥ ${mo.min_identidades_distintas_todos}`, col("div_distintas_min"), (x) => x >= mo.min_identidades_distintas_todos, "num"));
    out.push(crit("mono_H_D", "Monocultivo dirigido", `E5 gen ${F}: mín. H solo D (bits)`, `≥ ${numS(mo.min_entropia_bits_D)}`, col("div_H_D_min"), (x) => x >= mo.min_entropia_bits_D, "num"));
    out.push(crit("mono_maxfrec", "Monocultivo dirigido", `E5 gen ${F}: máx. frecuencia de una clave en D`, `≤ ${pctS(mo.max_frecuencia_identidad_D)}`, col("div_maxfrec_D_max"), (x) => x <= mo.max_frecuencia_identidad_D, "pct"));
    out.push(crit("e5_calidad", "Calidad (§15.6)", `E5 Δ calidad media de las criaturas, gen ${F} − gen 0 (puntos)`, "no debe subir (≤ 0)", col("calidad_delta_final"), (x) => x <= 0, "pts", true));
  }
  const e2 = s.perSeed.E2;
  if (e2) {
    const g = CRIT["genedex"];
    const col = (k: string): number[] => e2.map((m) => m[k] as number);
    const F = e2[0]?.["gen_final"] as number;
    out.push(crit("dex_1_10", "Genedex", "E2 claves nuevas / 1000 crías (gen 1–10)", `≥ ${g.min_nuevas_por_1000_crias_gen_1_10}`, col("genedex_nuevas_1_10"), (x) => x >= g.min_nuevas_por_1000_crias_gen_1_10, "num"));
    out.push(crit("dex_final", "Genedex", `E2 claves nuevas / 1000 crías (gen ${F - 9}–${F})`, `≥ ${g.min_nuevas_por_1000_crias_gen_291_300}`, col("genedex_nuevas_final10"), (x) => x >= g.min_nuevas_por_1000_crias_gen_291_300, "num"));
    out.push(crit("dex_rep", "Genedex", `E2 % mutaciones en clave ya registrada (gen ${F - 9}–${F})`, `${pctS(g.min_frac_mutaciones_repetidas_gen_291_300)}–${pctS(g.max_frac_mutaciones_repetidas_gen_291_300)}`, col("genedex_repetidas_final10"), (x) => x >= g.min_frac_mutaciones_repetidas_gen_291_300 && x <= g.max_frac_mutaciones_repetidas_gen_291_300, "pct"));
    out.push(crit("dex_hib", "Genedex", "E2 híbridas distintas vistas", `= ${g.min_hibridas_distintas_vistas}`, col("hibridas_vistas"), (x) => x >= g.min_hibridas_distintas_vistas, "int"));
    const h = CRIT["hibridas_vigilancia"];
    out.push(crit("hib_D", "Vigilancia de híbridas", `E2 gen ${F}: % de D híbridos`, `≤ ${pctS(h.max_frac_D_hibridos)}`, col("frac_D_hibrido_final"), (x) => x <= h.max_frac_D_hibridos, "pct"));
    out.push(crit("hib_cri", "Vigilancia de híbridas", `E2 gen ${F}: % de criaturas de familia híbrida`, `${pctS(h.min_frac_criaturas_hibridas)}–${pctS(h.max_frac_criaturas_hibridas)}`, col("frac_criaturas_hibridas_final"), (x) => x >= h.min_frac_criaturas_hibridas && x <= h.max_frac_criaturas_hibridas, "pct"));
  }
  if (s.e4) {
    const p = CRIT["primera_hibrida"];
    const e = s.e4;
    out.push(fixed("e4_gen_med", "Primer gen híbrido", `E4 mediana crías hasta gen Vapor (${e.n} ensayos)`, `${p.gen_mediana_min}–${p.gen_mediana_max}`, e.gene.median, e.gene.medCI, (x) => x >= p.gen_mediana_min && x <= p.gen_mediana_max, "num"));
    out.push(fixed("e4_gen_p90", "Primer gen híbrido", "E4 p90 crías hasta gen Vapor", `≤ ${p.gen_p90_max}`, e.gene.p90, e.gene.p90CI, (x) => x <= p.gen_p90_max, "num"));
    out.push(fixed("e4_cri_med", "Primera criatura híbrida", `E4 mediana crías hasta criatura Vapor (${e.n} ensayos)`, `≤ ${p.criatura_mediana_max}`, e.creature.median, e.creature.medCI, (x) => x <= p.criatura_mediana_max, "num"));
    out.push(fixed("e4_cri_p90", "Primera criatura híbrida", "E4 p90 crías hasta criatura Vapor", `≤ ${p.criatura_p90_max}`, e.creature.p90, e.creature.p90CI, (x) => x <= p.criatura_p90_max, "num"));
  }
  const dc = CRIT["deriva"];
  const e3a = s.perSeed.E3a;
  if (e3a) {
    const col = (k: string): number[] => e3a.map((m) => m[k] as number);
    const F = e3a[0]?.["gen_final"];
    out.push(crit("der_20", "Deriva", "E3a homocigoto: Δ velocidad por gen D, gen 20 (puntos)", `+${numS(dc.gen20_min_puntos)} a +${numS(dc.gen20_max_puntos)}`, col("delta_pts_20"), (x) => x >= dc.gen20_min_puntos && x <= dc.gen20_max_puntos, "pts"));
    out.push(crit("der_final", "Deriva", `E3a homocigoto: Δ velocidad por gen D, gen ${F} (puntos)`, `≤ +${numS(dc.gen100_max_puntos)}`, col("delta_pts_final"), (x) => x <= dc.gen100_max_puntos, "pts"));
  }
  const ctl = s.perSeed.E3a_control;
  if (ctl) {
    const F = ctl[0]?.["gen_final"];
    out.push(crit("der_ctl", "Deriva", `E3a control al azar: |Δ| gen ${F} (puntos)`, `≤ ${numS(dc.control_gen100_max_abs_puntos)}`, ctl.map((m) => Math.abs(m["delta_pts_final"] as number)), (x) => x <= dc.control_gen100_max_abs_puntos, "pts"));
  }
  out.push({ id: "inv", group: "Invariantes", label: "Violaciones (todas las escenas; incluye clave mutada ∈ claves de los padres)", threshold: "0", value: s.violations, pass: s.violations <= CRIT["invariantes"].max_violaciones, fragile: false, fmt: "int" });
  return out;
}

/** Resultados de determinismo (globales). */
export interface DeterminismResult {
  readonly rerunHashEqual: boolean;
  readonly rerunCsvEqual: boolean;
  readonly pairedCompared: number;
  readonly pairedIdentical: number;
  readonly differentSeedDiffers: boolean;
}

export function runDeterminism(plan: Plan, csvOf: (rows: readonly Row[]) => string): DeterminismResult {
  const cfg = buildConfig({});
  const opts = {
    scenario: "E1",
    variantId: DEFAULT_VARIANT.id,
    cfg,
    seed: plan.seeds[0] as string,
    strategy: randomStrategy,
    N: plan.e1.N,
    gens: plan.pairedGens,
    cpp: 2,
    children: plan.e1.N,
    init: "wild" as const,
    wildFrac: 0,
    select: "top_speed" as const,
  };
  const a = runPopulation(opts);
  const b = runPopulation(opts);
  const c = runPopulation({ ...opts, seed: `${opts.seed}-otra` });
  const p = runPopulation({ ...opts, pairedCfg: buildConfig({ "mutacion.prob_por_locus": 0.03 }) });
  return {
    rerunHashEqual: a.finalHash === b.finalHash,
    rerunCsvEqual: csvOf(a.rows) === csvOf(b.rows),
    differentSeedDiffers: a.finalHash !== c.finalHash,
    pairedCompared: p.paired.compared,
    pairedIdentical: p.paired.identical,
  };
}
