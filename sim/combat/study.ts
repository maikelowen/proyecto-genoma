/**
 * Plan de ejecución del simulador de combate y montaje de resultados.
 * Fase 1: v0.1 en C1–C4 + prueba de sustitución (1.ª tanda) + candidatas de arreglo y diagnóstico (semillas de ELEGIR).
 * Fase 2: 2.ª tanda de movimientos dudosos + validación de la candidata elegida en C1–C4 (semillas de VALIDAR).
 */
import { describeMove, generateMoveForKey } from "../../packages/core/src/index.ts";
import {
  archetypeCriterion,
  c1Criteria,
  duration,
  energyCriteria,
  familyCriteria,
  familyRates,
  initiativeCriterion,
  moveCriteria,
  moveVerdict,
  needsMore,
  qualityCriteria,
  winRate,
  type Agg,
  type Criterion,
  type Duration,
  type FamilyRate,
  type Interval,
  type MoveRow,
} from "./analysis.ts";
import { chunks, merge, type Job, type JobResult } from "./jobs.ts";
import { allFamilies, BASE_VARIANT, battleConfig, catalogKeys, GCFG, mutatedSample, RAW_COMBAT, RAW_MOVES, type Variant } from "./setup.ts";

export interface Plan {
  readonly mode: "completo" | "rapido";
  /** Prefijos de semilla: base (v0.1), elegir (candidatas) y validar (candidata elegida). */
  readonly seed: string;
  readonly chooseSeed: string;
  readonly validateSeed: string;
  readonly c1Seeds: number;
  readonly c1PerSeed: number;
  readonly c2PerPair: number;
  readonly c3: readonly { readonly beta: number; readonly n: number }[];
  readonly c4Reserves: readonly number[];
  readonly c4PerReserve: number;
  readonly movSample: number;
  readonly movStage1: number;
  readonly movStage2: number;
  readonly fixPerVariant: number;
  readonly diagPerVariant: number;
  readonly diagC2PerPair: number;
  readonly val: { readonly c1Seeds: number; readonly c1PerSeed: number; readonly c2PerPair: number; readonly c3: number; readonly c4PerReserve: number };
  readonly chunk: number;
}

export const DEFAULT_SEED = "combate01";
export const DEFAULT_CHOOSE_SEED = "elige01";
export const DEFAULT_VALIDATE_SEED = "valida01";

export function makePlan(quick: boolean, o: { seed?: string; choose?: string; validate?: string; c1PerSeed?: number }): Plan {
  const S = RAW_COMBAT.escenarios_sim;
  const betas = (RAW_COMBAT.barridos_sim["estadisticas.beta_calidad"] as number[]).filter((b) => b !== 0.02);
  const beta0 = RAW_COMBAT.estadisticas.beta_calidad as number;
  const reserves = (S.C4_energia.reservas as number[]).filter((u) => u > 0);
  const common = { seed: o.seed ?? DEFAULT_SEED, chooseSeed: o.choose ?? DEFAULT_CHOOSE_SEED, validateSeed: o.validate ?? DEFAULT_VALIDATE_SEED, c4Reserves: reserves };
  if (quick)
    return {
      mode: "rapido",
      ...common,
      c1Seeds: 2,
      c1PerSeed: o.c1PerSeed ?? 300,
      c2PerPair: 16,
      c3: betas.map((beta) => ({ beta, n: 300 })),
      c4PerReserve: 300,
      movSample: 20,
      movStage1: 40,
      movStage2: 0,
      fixPerVariant: 300,
      diagPerVariant: 150,
      diagC2PerPair: 8,
      val: { c1Seeds: 2, c1PerSeed: 200, c2PerPair: 8, c3: 300, c4PerReserve: 150 },
      chunk: 100,
    };
  // Completo. Reducciones respecto a la spec, por presupuesto (< 10 min, 2 hilos), declaradas en el informe:
  // C2 500 por pareja (spec 1000); C3 β ≠ 0,04 con 4000; sustitución en 2 tandas (400, +1600 si el IC cruza un umbral) y 200 mutados (spec 500).
  return {
    mode: "completo",
    ...common,
    c1Seeds: S.C1_aleatorio.semillas as number,
    c1PerSeed: o.c1PerSeed ?? (S.C1_aleatorio.combates as number) / (S.C1_aleatorio.semillas as number),
    c2PerPair: 500,
    c3: betas.map((beta) => ({ beta, n: beta === beta0 ? (S.C3_calidad.combates as number) : 4000 })),
    c4PerReserve: S.C4_energia.combates_por_pareja as number,
    movSample: 200,
    movStage1: 400,
    movStage2: 1600,
    fixPerVariant: 4000,
    diagPerVariant: 2000,
    diagC2PerPair: 100,
    val: { c1Seeds: 5, c1PerSeed: 2000, c2PerPair: 200, c3: 4000, c4PerReserve: 2000 },
    chunk: 250,
  };
}

/** Candidatas de ARREGLO de la duración (máx. 3) y variantes de DIAGNÓSTICO (¿cuál es la causa?). */
export const FIX_VARIANTS: readonly Variant[] = [
  { id: "energia3", label: "energía +3 por turno", set: { "energia.por_turno": 3 } },
  { id: "golpe20_desg8", label: "golpe básico 20 y desgaste desde el turno 9", set: { "dano.golpe_basico.potencia": 20, "desgaste.desde_turno": 8 } },
  { id: "golpe20_desg050", label: "golpe básico 20 y desgaste +50 %/turno", set: { "dano.golpe_basico.potencia": 20, "desgaste.por_turno": 0.5 } },
];
export const DIAG_VARIANTS: readonly Variant[] = [
  { id: "diag_vida180", label: "diagnóstico: vida base 180 (¿es la vida?)", set: { "estadisticas.vida.base": 180 } },
  { id: "diag_tope40", label: "diagnóstico: tope de 40 turnos (¿cuánto durarían los empates?)", set: { "fin.turnos_max": 40 } },
  { id: "diag_ia_reserva3", label: "diagnóstico: ambas IA con reserva 3 (¿es la IA que gasta todo?)", set: { "ia.reserva_por_defecto": 3 } },
];

export function betaVariant(base: Variant, beta: number): Variant {
  return { id: `${base.id}_b${beta}`, label: `${base.label}, β = ${beta}`, set: { ...base.set, "estadisticas.beta_calidad": beta } };
}

const pairsOf = (fams: readonly string[]): [string, string][] => {
  const out: [string, string][] = [];
  for (let i = 0; i < fams.length; i++) for (let j = i + 1; j < fams.length; j++) out.push([fams[i]!, fams[j]!]);
  return out;
};

/** Etiqueta de grupo de un trabajo (para agregar). */
export function groupKey(j: Job, phase: string): string {
  const extra = j.kind === "C2" ? j.pair!.join("-") : j.kind === "C4" ? `u${j.reserve}` : j.kind === "MOV" ? j.moveKey! : "";
  return `${phase}|${j.kind}|${j.variant.id}|${j.seed}|${extra}`;
}

export interface TaggedJob {
  readonly phase: string;
  readonly job: Job;
}

/** Trabajos de los escenarios C1–C4 para una variante y un prefijo de semilla. */
function scenarioJobs(phase: string, v: Variant, seedPrefix: string, c1Seeds: number, c1PerSeed: number, c2PerPair: number, c3: readonly { beta: number; n: number }[], c4: readonly number[], c4n: number, chunk: number): TaggedJob[] {
  const out: TaggedJob[] = [];
  const push = (js: Job[]): void => {
    for (const job of js) out.push({ phase, job });
  };
  for (let s = 1; s <= c1Seeds; s++) push(chunks({ kind: "C1", variant: v, seed: `${seedPrefix}-${s}` }, c1PerSeed, chunk));
  if (c2PerPair > 0) for (const pair of pairsOf(allFamilies())) push(chunks({ kind: "C2", variant: v, seed: `${seedPrefix}-1`, pair }, c2PerPair, chunk));
  for (const { beta, n } of c3) push(chunks({ kind: "C3", variant: betaVariant(v, beta), seed: `${seedPrefix}-1` }, n, chunk));
  for (const u of c4) push(chunks({ kind: "C4", variant: v, seed: `${seedPrefix}-1`, reserve: u }, c4n, chunk));
  return out;
}

export interface MoveSpec {
  readonly key: string;
  readonly id: string | undefined;
  readonly source: "catálogo" | "mutado";
}

export function moveSpecs(plan: Plan): MoveSpec[] {
  const cat: MoveSpec[] = catalogKeys().map((k) => ({ key: k.key, id: k.id, source: "catálogo" }));
  const mut: MoveSpec[] = mutatedSample(plan.movSample, `${plan.seed}|muestra_mutados`).map((key) => ({ key, id: undefined, source: "mutado" }));
  return [...cat, ...mut];
}

function moveJobs(plan: Plan, specs: readonly MoveSpec[], n: number, offset: number): TaggedJob[] {
  const out: TaggedJob[] = [];
  for (const m of specs) for (const job of chunks({ kind: "MOV", variant: BASE_VARIANT, seed: `${plan.seed}-1`, moveKey: m.key, ...(m.id ? { moveId: m.id } : {}) }, n, Math.max(plan.chunk, 200), offset)) out.push({ phase: "base", job });
  return out;
}

export function phase1Jobs(plan: Plan): TaggedJob[] {
  return [
    ...scenarioJobs("base", BASE_VARIANT, plan.seed, plan.c1Seeds, plan.c1PerSeed, plan.c2PerPair, plan.c3, plan.c4Reserves, plan.c4PerReserve, plan.chunk),
    ...moveJobs(plan, moveSpecs(plan), plan.movStage1, 0),
    ...[...FIX_VARIANTS, ...DIAG_VARIANTS].flatMap((v) =>
      chunks({ kind: "C1", variant: v, seed: `${plan.chooseSeed}-1` }, DIAG_VARIANTS.includes(v) ? plan.diagPerVariant : plan.fixPerVariant, plan.chunk).map((job) => ({ phase: "elegir", job })),
    ),
  ];
}

// --------------------------------------------------------------- agregación

export class Groups {
  readonly map = new Map<string, JobResult[]>();
  add(tj: TaggedJob, r: JobResult): void {
    const k = groupKey(tj.job, tj.phase);
    const l = this.map.get(k);
    if (l) l.push(r);
    else this.map.set(k, [r]);
  }
  /** Agrega todos los grupos que cumplen el filtro. */
  agg(f: (phase: string, j: Job) => boolean, phaseOf: (k: string) => string = (k) => k.split("|")[0]!): Agg | null {
    const rs: JobResult[] = [];
    for (const [k, l] of this.map) if (f(phaseOf(k), l[0]!.job)) rs.push(...l);
    return rs.length ? merge(rs) : null;
  }
}

/** Diagnóstico de familias (C2, semillas de ELEGIR): ¿perfil de estadísticas o movimientos? */
export function familyDiagVariants(chosen: Variant): { variant: Variant; equalStats: boolean; label: string }[] {
  return [
    { variant: { id: `${chosen.id}_statsiguales`, label: "", set: chosen.set }, equalStats: true, label: "mismas estadísticas para todas (P = V = R): queda solo el efecto de los movimientos" },
    { variant: { id: `${chosen.id}_vida025`, label: "", set: { ...chosen.set, "estadisticas.vida.coef.resistencia": 0.25 } }, equalStats: false, label: "`estadisticas.alfa_vida` 0,5 → 0,25 (menos vida por especializarse en resistencia)" },
  ];
}

export function phase2Jobs(plan: Plan, g: Groups, chosen: Variant | null): TaggedJob[] {
  const out: TaggedJob[] = [];
  if (chosen && plan.diagC2PerPair > 0)
    for (const d of familyDiagVariants(chosen))
      for (const pair of pairsOf(allFamilies()))
        for (const job of chunks({ kind: "C2", variant: d.variant, seed: `${plan.chooseSeed}-1`, pair, ...(d.equalStats ? { equalStats: true } : {}) }, plan.diagC2PerPair, plan.chunk)) out.push({ phase: "elegir", job });
  if (plan.movStage2 > 0) {
    const doubtful = moveSpecs(plan).filter((m) => {
      const a = g.agg((ph, j) => ph === "base" && j.kind === "MOV" && j.moveKey === m.key);
      return a !== null && needsMore(a);
    });
    out.push(...moveJobs(plan, doubtful, plan.movStage2, plan.movStage1));
  }
  if (chosen) {
    const beta0 = RAW_COMBAT.estadisticas.beta_calidad as number;
    out.push(
      ...scenarioJobs("validar", chosen, plan.validateSeed, plan.val.c1Seeds, plan.val.c1PerSeed, plan.val.c2PerPair, [{ beta: beta0, n: plan.val.c3 }], plan.c4Reserves, plan.val.c4PerReserve, plan.chunk),
    );
  }
  return out;
}

// --------------------------------------------------------------- resultados

export interface ScenarioSummary {
  readonly variant: Variant;
  readonly seedPrefix: string;
  readonly duration: Duration;
  readonly perSeed: readonly Duration[];
  readonly c1: readonly Criterion[];
  readonly init: Criterion;
  readonly families: readonly FamilyRate[];
  readonly familyCrit: readonly Criterion[];
  readonly quality: readonly { beta: number; wr: Interval; n: number }[];
  readonly qualityCrit: readonly Criterion[];
  readonly energy: readonly { u: number; wr: Interval; n: number }[];
  readonly energyCrit: readonly Criterion[];
  readonly turnsHist: readonly number[];
}

export function scenarioSummary(g: Groups, phase: string, v: Variant, seedPrefix: string, c1Seeds: number, betas: readonly number[], reserves: readonly number[]): ScenarioSummary {
  const seeds = Array.from({ length: c1Seeds }, (_, i) => `${seedPrefix}-${i + 1}`);
  const perSeedAgg = seeds.map((s) => g.agg((ph, j) => ph === phase && j.kind === "C1" && j.variant.id === v.id && j.seed === s)!);
  const all = g.agg((ph, j) => ph === phase && j.kind === "C1" && j.variant.id === v.id && seeds.includes(j.seed))!;
  const fams = allFamilies();
  const pairs: { F: string; G: string; a: Agg }[] = [];
  for (const [k, l] of g.map) {
    const j = l[0]!.job;
    if (k.startsWith(`${phase}|C2|${v.id}|`)) pairs.push({ F: j.pair![0], G: j.pair![1], a: merge(l) });
  }
  const families = pairs.length ? familyRates(pairs, fams) : [];
  const beta0 = RAW_COMBAT.estadisticas.beta_calidad as number;
  const quality = betas.flatMap((beta) => {
    const a = g.agg((ph, j) => ph === phase && j.kind === "C3" && j.variant.id === betaVariant(v, beta).id);
    return a ? [{ beta, wr: winRate(a.xWins, a.draws, a.n), n: a.n, a }] : [];
  });
  const energy = reserves.flatMap((u) => {
    const a = g.agg((ph, j) => ph === phase && j.kind === "C4" && j.variant.id === v.id && j.reserve === u);
    return a ? [{ u, wr: winRate(a.xWins, a.draws, a.n), n: a.n, a }] : [];
  });
  return {
    variant: v,
    seedPrefix,
    duration: duration(all),
    perSeed: perSeedAgg.map(duration),
    c1: c1Criteria(perSeedAgg, all),
    init: initiativeCriterion(all),
    families,
    familyCrit: families.length ? familyCriteria(families) : [],
    quality: quality.map(({ beta, wr, n }) => ({ beta, wr, n })),
    qualityCrit: quality.flatMap((q) => qualityCriteria(q.beta, q.a, q.beta !== beta0)),
    energy: energy.map(({ u, wr, n }) => ({ u, wr, n })),
    energyCrit: energy.length ? energyCriteria(energy) : [],
    turnsHist: Array.from(all.turnsHist, (x) => x ?? 0),
  };
}

export interface CandidateSummary {
  readonly variant: Variant;
  readonly duration: Duration;
  readonly c1: readonly Criterion[];
  readonly diagnostic: boolean;
  readonly turnsHist: readonly number[];
}

export function candidateSummaries(g: Groups, plan: Plan): CandidateSummary[] {
  return [...FIX_VARIANTS, ...DIAG_VARIANTS].map((v) => {
    const a = g.agg((ph, j) => ph === "elegir" && j.kind === "C1" && j.variant.id === v.id)!;
    return { variant: v, duration: duration(a), c1: c1Criteria([a], a), diagnostic: DIAG_VARIANTS.includes(v), turnsHist: Array.from(a.turnsHist, (x) => x ?? 0) };
  });
}

/**
 * Regla de elección (fijada antes de ver los datos de validación): entre las candidatas de arreglo que
 * aprueban todos los criterios de duración y lado con las semillas de ELEGIR, la de menos parámetros
 * cambiados; empate → menos empates. Si ninguna aprueba todo: la que más aprueba; empate → menos empates.
 */
export function chooseVariant(cands: readonly CandidateSummary[]): { chosen: CandidateSummary; allPass: boolean } {
  const fix = cands.filter((c) => !c.diagnostic);
  const passes = (c: CandidateSummary): number => c.c1.filter((x) => x.pass).length;
  const allPass = fix.filter((c) => passes(c) === c.c1.length);
  const pool = allPass.length ? allPass : fix;
  const sorted = [...pool].sort(
    (a, b) => (allPass.length ? Object.keys(a.variant.set).length - Object.keys(b.variant.set).length : passes(b) - passes(a)) || a.duration.draws.value - b.duration.draws.value,
  );
  return { chosen: sorted[0]!, allPass: allPass.length > 0 };
}

export function moveRows(g: Groups, plan: Plan): MoveRow[] {
  const cfg = battleConfig(BASE_VARIANT);
  return moveSpecs(plan).map((m) => {
    const a = g.agg((ph, j) => ph === "base" && j.kind === "MOV" && j.moveKey === m.key)!;
    const mv = generateMoveForKey(m.key, cfg.moves, m.id);
    const wr = winRate(a.xWins, a.draws, a.n);
    const v = moveVerdict(wr);
    const use = a.usable ? a.used / a.usable : NaN;
    return {
      key: m.key,
      id: mv.id,
      source: m.source,
      name: mv.name,
      desc: describeMove(mv, cfg.moves),
      cost: mv.cost,
      archetype: mv.archetype,
      status: mv.status ?? "—",
      modifier: mv.modifier ?? "—",
      condition: mv.condition ?? "—",
      family: mv.family,
      n: a.n,
      wr,
      use,
      verdict: v.verdict,
      suspicious: use > (RAW_MOVES.criterios_sim.uso_sospechoso as number),
      uncertain: v.uncertain,
    };
  });
}

export function catalogArchetypes(): { family: string; n: number }[] {
  const cfg = battleConfig(BASE_VARIANT);
  const by = new Map<string, Set<string>>();
  for (const k of catalogKeys()) {
    const m = generateMoveForKey(k.key, cfg.moves, k.id);
    const f = k.key.split("|")[0]!;
    if (!by.has(f)) by.set(f, new Set());
    by.get(f)!.add(m.archetype);
  }
  return GCFG.baseFamilies.map((f) => ({ family: f, n: by.get(f)?.size ?? 0 }));
}

export function moveSummary(rows: readonly MoveRow[]): { crit: Criterion[]; arch: Criterion; pieces: { piece: string; value: string; n: number; meanWr: number; broken: number; useless: number }[]; perFamily: { family: string; n: number }[] } {
  const perFamily = catalogArchetypes();
  const pieces: { piece: string; value: string; n: number; meanWr: number; broken: number; useless: number }[] = [];
  const fields: [string, (r: MoveRow) => string][] = [
    ["arquetipo", (r) => r.archetype],
    ["estado", (r) => r.status],
    ["modificador", (r) => r.modifier],
    ["condición", (r) => r.condition],
    ["coste", (r) => String(r.cost)],
  ];
  for (const [piece, f] of fields) {
    const vals = [...new Set(rows.map(f))].sort();
    for (const value of vals) {
      const rs = rows.filter((r) => f(r) === value);
      pieces.push({
        piece,
        value,
        n: rs.length,
        meanWr: rs.reduce((s, r) => s + r.wr.value, 0) / rs.length,
        broken: rs.filter((r) => r.verdict === "roto" || r.verdict === "roto grave").length,
        useless: rs.filter((r) => r.verdict === "inútil").length,
      });
    }
  }
  return { crit: moveCriteria(rows), arch: archetypeCriterion(perFamily), pieces, perFamily };
}

/** Tasas por familia de un conjunto de trabajos C2. */
export function familyRatesOf(g: Groups, phase: string, variantId: string): FamilyRate[] {
  const pairs: { F: string; G: string; a: Agg }[] = [];
  for (const [k, l] of g.map) {
    const j = l[0]!.job;
    if (k.startsWith(`${phase}|C2|${variantId}|`)) pairs.push({ F: j.pair![0], G: j.pair![1], a: merge(l) });
  }
  return pairs.length ? familyRates(pairs, allFamilies()) : [];
}
