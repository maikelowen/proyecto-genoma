/**
 * Orquestación: planes (rápido/completo), experimentos (barridos),
 * extracción de métricas por semilla y evaluación de criterios §10.2.
 */
import type { GeneticsConfig } from "../../packages/core/src/index.ts";
import { buildConfig, buildRaw, driftSweep, hybridSweep, mainGrid, pesosRSweep, RAW, shapeSigmaSweep, type Variant } from "./cfg.ts";
import { runE4, runPopulation, type PopRunResult, type Row } from "./engine.ts";
import { meanCI, quantile, type MeanCI } from "./stats.ts";
import { findStrategy, randomStrategy, STRATEGIES, type Strategy } from "./strategies.ts";

const ESC = RAW["escenarios_sim"];
const CRIT = RAW["criterios_sim"];

export interface Plan {
  readonly mode: "rapido" | "completo";
  readonly seeds: readonly string[];
  readonly e1: { readonly N: number; readonly gens: number };
  readonly e3: { readonly N: number; readonly gens: number };
  readonly e4: { readonly trialsPerSeed: number; readonly creatureTrials: number; readonly creatureCap: number };
  /** Generaciones del ensayo pareado 2 % vs 3 %. */
  readonly pairedGens: number;
}

export function makePlan(o: { quick: boolean; seeds?: number; seedPrefix: string; gens?: number; pop?: number }): Plan {
  const nSeeds = o.seeds ?? (o.quick ? 2 : 5);
  const seeds = Array.from({ length: nSeeds }, (_, i) => `${o.seedPrefix}-${i + 1}`);
  const e4Total = o.quick ? 1000 : (ESC["E4_primera_hibrida"].ensayos as number);
  return {
    mode: o.quick ? "rapido" : "completo",
    seeds,
    e1: { N: o.pop ?? (o.quick ? 200 : ESC["E1_cerrada"].poblacion), gens: o.gens ?? (o.quick ? 40 : ESC["E1_cerrada"].generaciones) },
    e3: { N: ESC["E3a_deriva_pura"].poblacion, gens: o.quick ? 30 : ESC["E3a_deriva_pura"].generaciones },
    e4: { trialsPerSeed: Math.ceil(e4Total / nSeeds), creatureTrials: o.quick ? 5 : 20, creatureCap: 5000 },
    pairedGens: o.quick ? 5 : 20,
  };
}

export type ScenarioId = "E1" | "E2" | "E3a" | "E3a_control" | "E3a_homo" | "E3b" | "E4";
/** E3a_homo: diagnóstico (no está en la spec): como E3a pero con clones homocigotos (D = R1 = R2), para aislar la deriva de la selección de tipos de gen. */
export const ALL_SCENARIOS: readonly ScenarioId[] = ["E1", "E2", "E3a", "E3a_control", "E3a_homo", "E3b", "E4"];

export interface Experiment {
  readonly id: string;
  readonly label: string;
  readonly variants: readonly Variant[];
  readonly scenarios: readonly ScenarioId[];
  readonly strategy: Strategy;
}

/**
 * Configuración base para los barridos secundarios. Elegida a partir del
 * barrido principal (ver informe): pesos_D C, mutación 2 % (única que
 * aprueba sorpresa y mutación con margen).
 */
export const SECONDARY_BASE_ID = "C-m2";

/**
 * Recomendación para v0.2 (combinación validada en todos los escenarios):
 * pesos_D C, mutación 2 %, σ forma 0,25, κ deriva 0,10. El resto igual que v0.1.
 */
export const RECOMMENDED: Variant = {
  id: "v02",
  label: "v0.2 recomendada: pesos_D C · mutación 2 % · σ forma 0,25 · κ 0,10",
  set: {
    "herencia.pesos_D": RAW["barridos_sim"]["herencia.pesos_D"]["C"],
    "mutacion.prob_por_locus": 0.02,
    "mutacion.sigma_forma": 0.25,
    "deriva.kappa": 0.1,
  },
};

export function experiments(): Experiment[] {
  const grid = mainGrid();
  const base = grid.find((v) => v.id === SECONDARY_BASE_ID) as Variant;
  const docBase = grid.find((v) => v.id === "A-m2") as Variant;
  const out: Experiment[] = [
    { id: "principal", label: "pesos_D × prob. mutación", variants: grid, scenarios: ALL_SCENARIOS, strategy: randomStrategy },
  ];
  for (const s of STRATEGIES.filter((x) => x.id !== "azar")) {
    out.push({ id: `estrategia_${s.id}`, label: `Estrategia: ${s.label}`, variants: [docBase, base], scenarios: ["E1"], strategy: s });
  }
  out.push({ id: "pesos_R", label: "pesos_R (con base " + base.id + ")", variants: pesosRSweep(base), scenarios: ["E1"], strategy: randomStrategy });
  out.push({ id: "forma", label: "σ forma de la mutación (con base " + base.id + ")", variants: shapeSigmaSweep(base), scenarios: ["E2"], strategy: randomStrategy });
  out.push({ id: "deriva", label: "deriva κ × σ (con base " + base.id + ")", variants: driftSweep(base), scenarios: ["E3a", "E3a_control", "E3a_homo"], strategy: randomStrategy });
  out.push({ id: "recomendada", label: "Recomendación v0.2 (combinada)", variants: [RECOMMENDED], scenarios: ALL_SCENARIOS, strategy: randomStrategy });
  out.push({ id: "hibrida", label: "prob. híbrida nueva (con base " + base.id + ")", variants: hybridSweep(base), scenarios: ["E2", "E4"], strategy: randomStrategy });
  return out;
}

/** Config efectiva de un escenario (E3a* fuerza mutación 0). */
export function effectiveSet(v: Variant, sc: ScenarioId): Record<string, unknown> {
  return sc === "E3a" || sc === "E3a_control" || sc === "E3a_homo" ? { ...v.set, "mutacion.prob_por_locus": ESC["E3a_deriva_pura"].prob_mutacion_override } : { ...v.set };
}

/** Clave de deduplicación: dos ejecuciones con la misma clave dan exactamente el mismo resultado. */
export function runKey(strategyId: string, v: Variant, sc: ScenarioId, seed: string): string {
  return `${sc}|${strategyId}|${seed}|${JSON.stringify(buildRaw(effectiveSet(v, sc)))}`;
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
  /** Solo E4. */
  readonly geneCounts?: number[];
  readonly creatureCounts?: number[];
}

export function runScenario(exp: Experiment, v: Variant, sc: ScenarioId, seed: string, plan: Plan): ScenarioRun {
  const cfg: GeneticsConfig = buildConfig(effectiveSet(v, sc));
  const scenarioName = exp.strategy.id === "azar" ? sc : `${sc}_${exp.strategy.id}`;
  if (sc === "E4") {
    const e = ESC["E4_primera_hibrida"];
    const r = runE4({
      variantId: v.id,
      cfg,
      seed,
      trials: plan.e4.trialsPerSeed,
      famA: e.familia_A,
      famB: e.familia_B,
      target: e.hibrida_objetivo,
      cpp: e.crias_por_pareja,
      creatureTrials: plan.e4.creatureTrials,
      creatureCap: plan.e4.creatureCap,
    });
    return {
      experiment: exp.id,
      variant: v,
      scenario: sc,
      seed,
      rows: r.rows,
      hash: "",
      violations: r.violations,
      violationSamples: [],
      fallbackPairs: 0,
      geneCounts: r.geneCounts,
      creatureCounts: r.creatureCounts,
    };
  }
  let res: PopRunResult;
  const common = { scenario: scenarioName, variantId: v.id, cfg, seed, strategy: exp.strategy, wildFrac: 0, select: "top_speed" as const, init: "wild" as const };
  if (sc === "E1" || sc === "E2") {
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
    const e = ESC["E3a_deriva_pura"];
    res = runPopulation({
      ...common,
      N: plan.e3.N,
      gens: plan.e3.gens,
      cpp: e.crias_por_pareja,
      children: e.parejas * e.crias_por_pareja,
      init: sc === "E3b" ? "wild" : sc === "E3a_homo" ? "clones_homo" : "clones",
      select: sc === "E3a_control" ? "random" : "top_speed",
    });
  }
  return {
    experiment: exp.id,
    variant: v,
    scenario: sc,
    seed,
    rows: res.rows,
    hash: res.finalHash,
    violations: res.violations,
    violationSamples: res.violationSamples,
    fallbackPairs: res.fallbackPairs,
  };
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

export function e1Metrics(rows: readonly Row[]): SeedMetrics {
  const [g0a, g0b] = CRIT["sorpresa"].generaciones as [number, number];
  const last = rows[rows.length - 1] as Row;
  const first = rows[0] as Row;
  const F = num(last, "gen");
  const m: SeedMetrics = {
    sorpresa: meanRange(rows, "sorpresa", g0a, g0b),
    sorpresa_sin_mutacion: meanRange(rows, "sorpresa_sin_mutacion", g0a, g0b),
    sorpresa_final10: meanRange(rows, "sorpresa", F - 9, F),
    div_distintas_min: Math.min(...LOCI.map((L) => num(last, `dist_todos_${L}`))),
    div_H_todos_min: Math.min(...LOCI.map((L) => num(last, `H_todos_${L}`))),
    div_H_D_min: Math.min(...LOCI.map((L) => num(last, `H_D_${L}`))),
    div_H_ratio_min: Math.min(
      ...LOCI.flatMap((L) => [num(last, `H_todos_${L}`) / num(first, `H_todos_${L}`), num(last, `H_D_${L}`) / num(first, `H_D_${L}`)]),
    ),
    div_maxfrec_D_max: Math.max(...LOCI.map((L) => num(last, `maxfrec_D_${L}`))),
    mut_por_1000: (1000 * sumRange(rows, "mutaciones", 1, F)) / sumRange(rows, "n_crias", 1, F),
    frac_crias_mutadas: sumRange(rows, "crias_con_mutacion", 1, F) / sumRange(rows, "n_crias", 1, F),
    frac_mut_coincide_R: sumRange(rows, "mut_coincide_R_padre", 1, F) / sumRange(rows, "mutaciones", 1, F),
    frac_mut_catalogo: sumRange(rows, "mut_en_catalogo", 1, F) / sumRange(rows, "mutaciones", 1, F),
    genedex_final: num(last, "genedex_total"),
    frac_D_hibrido_final: num(last, "frac_D_hibrido"),
    frac_D_mutado_final: num(last, "frac_D_mutado"),
    vel_delta_final: num(last, "vel_total_media") / num(first, "vel_total_media") - 1,
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
    gen_final: F,
  };
}

export function e3Metrics(rows: readonly Row[]): SeedMetrics {
  const first = rows[0] as Row;
  const last = rows[rows.length - 1] as Row;
  const at = (g: number): Row | undefined => rows.find((r) => num(r, "gen") === g);
  const v0 = num(first, "vel_total_media");
  return {
    delta_20: num(at(20), "vel_total_media") / v0 - 1,
    delta_final: num(last, "vel_total_media") / v0 - 1,
    desv_vel_D_final: num(last, "desv_vel_D_media"),
    /** Parte de Δ debida a deriva de valores (Σ de valor − ancla en los 4 D); el resto es cambio de tipo de gen (ancla). */
    delta_deriva_20: (4 * (num(at(20), "desv_vel_D_media") - num(first, "desv_vel_D_media"))) / v0,
    delta_deriva_final: (4 * (num(last, "desv_vel_D_media") - num(first, "desv_vel_D_media"))) / v0,
    vel0: v0,
    gen_final: num(last, "gen"),
  };
}

// ---------------------------------------------------------------------------
// Resumen y criterios
// ---------------------------------------------------------------------------

export interface VariantSummary {
  readonly experiment: string;
  readonly variant: Variant;
  readonly probMut: number;
  /** Métricas por escenario: nombre → lista por semilla. */
  readonly perSeed: Partial<Record<ScenarioId, SeedMetrics[]>>;
  readonly e4?: {
    readonly n: number;
    readonly median: number;
    readonly p90: number;
    readonly seedMedians: number[];
    readonly creatureMedian: number;
    readonly creatureCensored: number;
    readonly creatureN: number;
    readonly histogram: number[];
  };
  readonly violations: number;
  readonly fallbackPairs: number;
}

export function summarize(exp: Experiment, v: Variant, runs: readonly ScenarioRun[]): VariantSummary {
  const perSeed: Partial<Record<ScenarioId, SeedMetrics[]>> = {};
  let violations = 0;
  let fallbackPairs = 0;
  let e4: VariantSummary["e4"];
  for (const sc of exp.scenarios) {
    const rs = runs.filter((r) => r.scenario === sc);
    for (const r of rs) {
      violations += r.violations;
      fallbackPairs += r.fallbackPairs;
    }
    if (sc === "E1") perSeed.E1 = rs.map((r) => e1Metrics(r.rows));
    else if (sc === "E2") perSeed.E2 = rs.map((r) => e2Metrics(r.rows));
    else if (sc === "E4") {
      const all = rs.flatMap((r) => r.geneCounts ?? []);
      const cr = rs.flatMap((r) => r.creatureCounts ?? []);
      const hist = new Array<number>(21).fill(0); // cubetas de 10 crías; la última = ≥200
      for (const x of all) hist[Math.min(20, Math.floor((x - 1) / 10))]! += 1;
      e4 = {
        n: all.length,
        median: quantile(all, 0.5),
        p90: quantile(all, 0.9),
        seedMedians: rs.map((r) => quantile(r.geneCounts ?? [], 0.5)),
        creatureMedian: quantile(cr, 0.5),
        creatureCensored: cr.filter((x) => !Number.isFinite(x)).length,
        creatureN: cr.length,
        histogram: hist,
      };
    } else perSeed[sc] = rs.map((r) => e3Metrics(r.rows));
  }
  return {
    experiment: exp.id,
    variant: v,
    probMut: buildConfig(v.set).mutation.probPerLocus,
    perSeed,
    ...(e4 ? { e4 } : {}),
    violations,
    fallbackPairs,
  };
}

export interface Criterion {
  readonly id: string;
  readonly group: string;
  readonly label: string;
  readonly threshold: string;
  readonly value: number;
  readonly ci?: MeanCI;
  readonly pass: boolean;
  /** Semillas que cumplen / total (si aplica). */
  readonly seedsPass?: [number, number];
  /** El IC cruza el umbral: resultado frágil. */
  readonly fragile: boolean;
  readonly fmt: "pct" | "num" | "int";
}

function crit(
  id: string,
  group: string,
  label: string,
  threshold: string,
  xs: readonly number[],
  ok: (x: number) => boolean,
  fmt: Criterion["fmt"],
): Criterion {
  const ci = meanCI(xs);
  const pass = ok(ci.mean);
  return {
    id,
    group,
    label,
    threshold,
    value: ci.mean,
    ci,
    pass,
    seedsPass: [xs.filter(ok).length, xs.length],
    fragile: xs.length > 1 && ok(ci.lo) !== ok(ci.hi),
    fmt,
  };
}

export function evaluateCriteria(s: VariantSummary): Criterion[] {
  const out: Criterion[] = [];
  const e1 = s.perSeed.E1;
  const pct = (x: number): string => `${Math.round(x * 1000) / 10} %`;
  if (e1) {
    const c = CRIT["sorpresa"];
    const col = (k: string): number[] => e1.map((m) => m[k] as number);
    out.push(crit("sorpresa", "Sorpresa", "E1 % crías con D nuevo (gen 1–20)", `${pct(c.min)}–${pct(c.max)}`, col("sorpresa"), (x) => x >= c.min && x <= c.max, "pct"));
    const d = CRIT["diversidad"];
    const F = e1[0]?.["gen_final"];
    out.push(crit("div_distintas", "Diversidad", `E1 gen ${F}: mín. claves distintas por locus`, `≥ ${d.min_identidades_distintas_todos}`, col("div_distintas_min"), (x) => x >= d.min_identidades_distintas_todos, "num"));
    out.push(crit("div_H_todos", "Diversidad", `E1 gen ${F}: mín. H todos los slots (bits)`, `≥ ${d.min_entropia_bits_todos}`, col("div_H_todos_min"), (x) => x >= d.min_entropia_bits_todos, "num"));
    out.push(crit("div_H_D", "Diversidad", `E1 gen ${F}: mín. H solo D (bits)`, `≥ ${d.min_entropia_bits_D}`, col("div_H_D_min"), (x) => x >= d.min_entropia_bits_D, "num"));
    out.push(crit("div_H_ratio", "Diversidad", `E1 gen ${F}: mín. H / H gen 0`, `≥ ${pct(d.min_fraccion_entropia_gen0)}`, col("div_H_ratio_min"), (x) => x >= d.min_fraccion_entropia_gen0, "pct"));
    out.push(crit("div_maxfrec", "Diversidad", `E1 gen ${F}: máx. frecuencia de una clave en D`, `≤ ${pct(d.max_frecuencia_identidad_D)}`, col("div_maxfrec_D_max"), (x) => x <= d.max_frecuencia_identidad_D, "pct"));
    const mu = CRIT["mutacion"];
    const exp = 4000 * s.probMut;
    out.push(crit("mut_1000", "Mutación", "E1 mutaciones / 1000 crías", `${Math.round(exp)} ± ${pct(mu.tolerancia_relativa)}`, col("mut_por_1000"), (x) => Math.abs(x - exp) <= mu.tolerancia_relativa * exp, "num"));
    out.push(crit("mut_frac", "Mutación", "E1 % crías con ≥1 mutación", `${pct(mu.min_frac_crias_mutadas)}–${pct(mu.max_frac_crias_mutadas)}`, col("frac_crias_mutadas"), (x) => x >= mu.min_frac_crias_mutadas && x <= mu.max_frac_crias_mutadas, "pct"));
  }
  const e2 = s.perSeed.E2;
  if (e2) {
    const g = CRIT["genedex"];
    const col = (k: string): number[] => e2.map((m) => m[k] as number);
    const F = e2[0]?.["gen_final"] as number;
    out.push(crit("dex_1_10", "Genedex", "E2 claves nuevas / 1000 crías (gen 1–10)", `≥ ${g.min_nuevas_por_1000_crias_gen_1_10}`, col("genedex_nuevas_1_10"), (x) => x >= g.min_nuevas_por_1000_crias_gen_1_10, "num"));
    out.push(crit("dex_final", "Genedex", `E2 claves nuevas / 1000 crías (gen ${F - 9}–${F})`, `≥ ${g.min_nuevas_por_1000_crias_gen_291_300}`, col("genedex_nuevas_final10"), (x) => x >= g.min_nuevas_por_1000_crias_gen_291_300, "num"));
    out.push(crit("dex_rep", "Genedex", `E2 % mutaciones en clave ya registrada (gen ${F - 9}–${F})`, `${pct(g.min_frac_mutaciones_repetidas_gen_291_300)}–${pct(g.max_frac_mutaciones_repetidas_gen_291_300)}`, col("genedex_repetidas_final10"), (x) => x >= g.min_frac_mutaciones_repetidas_gen_291_300 && x <= g.max_frac_mutaciones_repetidas_gen_291_300, "pct"));
    out.push(crit("dex_hib", "Genedex", "E2 híbridas distintas vistas", `= ${g.min_hibridas_distintas_vistas}`, col("hibridas_vistas"), (x) => x >= g.min_hibridas_distintas_vistas, "int"));
  }
  if (s.e4) {
    const p = CRIT["primera_hibrida"];
    const ci = meanCI(s.e4.seedMedians);
    out.push({ id: "e4_med", group: "Primera híbrida", label: `E4 mediana crías hasta gen Vapor (${s.e4.n} ensayos)`, threshold: `${p.mediana_min}–${p.mediana_max}`, value: s.e4.median, ci, pass: s.e4.median >= p.mediana_min && s.e4.median <= p.mediana_max, fragile: false, fmt: "num" });
    out.push({ id: "e4_p90", group: "Primera híbrida", label: "E4 p90 crías hasta gen Vapor", threshold: `≤ ${p.p90_max}`, value: s.e4.p90, pass: s.e4.p90 <= p.p90_max, fragile: false, fmt: "num" });
  }
  const dc = CRIT["deriva"];
  const e3a = s.perSeed.E3a;
  if (e3a) {
    const col = (k: string): number[] => e3a.map((m) => m[k] as number);
    const F = e3a[0]?.["gen_final"];
    out.push(crit("der_20", "Deriva", "E3a Δ velocidad total gen 20", `+${pct(dc.gen20_min)}…+${pct(dc.gen20_max)}`, col("delta_20"), (x) => x >= dc.gen20_min && x <= dc.gen20_max, "pct"));
    out.push(crit("der_final", "Deriva", `E3a Δ velocidad total gen ${F}`, `≤ +${pct(dc.gen100_max)}`, col("delta_final"), (x) => x <= dc.gen100_max, "pct"));
  }
  const ctl = s.perSeed.E3a_control;
  if (ctl) {
    const F = ctl[0]?.["gen_final"];
    out.push(crit("der_ctl", "Deriva", `E3a control |Δ| gen ${F}`, `≤ ${pct(dc.control_gen100_max_abs)}`, ctl.map((m) => Math.abs(m["delta_final"] as number)), (x) => x <= dc.control_gen100_max_abs, "pct"));
  }
  const homo = s.perSeed.E3a_homo;
  if (homo) {
    const col = (k: string): number[] => homo.map((m) => m[k] as number);
    const F = homo[0]?.["gen_final"];
    out.push(crit("der_homo_20", "Deriva (diagnóstico)", "E3a homocigoto Δ velocidad gen 20 (solo deriva de valores)", `+${pct(dc.gen20_min)}…+${pct(dc.gen20_max)}`, col("delta_20"), (x) => x >= dc.gen20_min && x <= dc.gen20_max, "pct"));
    out.push(crit("der_homo_final", "Deriva (diagnóstico)", `E3a homocigoto Δ velocidad gen ${F}`, `≤ +${pct(dc.gen100_max)}`, col("delta_final"), (x) => x <= dc.gen100_max, "pct"));
  }
  out.push({ id: "inv", group: "Invariantes", label: "Violaciones (todas las escenas)", threshold: "0", value: s.violations, pass: s.violations <= CRIT["invariantes"].max_violaciones, fragile: false, fmt: "int" });
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
  const v = mainGrid([0.02])[0] as Variant;
  const v3 = mainGrid([0.03])[0] as Variant;
  const cfg = buildConfig(v.set);
  const opts = {
    scenario: "E1",
    variantId: v.id,
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
  const p = runPopulation({ ...opts, pairedCfg: buildConfig(v3.set) });
  return {
    rerunHashEqual: a.finalHash === b.finalHash,
    rerunCsvEqual: csvOf(a.rows) === csvOf(b.rows),
    differentSeedDiffers: a.finalHash !== c.finalHash,
    pairedCompared: p.paired.compared,
    pairedIdentical: p.paired.identical,
  };
}
