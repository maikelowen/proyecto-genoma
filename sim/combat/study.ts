/**
 * Plan del estudio de combate v0.2 y montaje de resultados.
 * Se evalúan la base v0.2 (JSON sin cambios) y, si se da `--patch`, la propuesta, con las MISMAS semillas
 * (comparación pareada) y en todos los escenarios: C1 (duración, lado, uso de lo caro), C2 (familias),
 * C3 (calidad, β de la config), C4 (ahorrar energía) y prueba de sustitución de movimientos.
 * Las semillas de evaluación no se han usado para elegir nada (la búsqueda usa `explora02*` y `elige02*`).
 */
import { describeMove, generateMoveForKey, validateMove } from "../../packages/core/src/index.ts";
import {
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
  studyCriteria,
  wilson,
  winRate,
  type Agg,
  type Criterion,
  type Duration,
  type FamilyRate,
  type Interval,
  type MoveRow,
} from "./analysis.ts";
import { chunks, merge, type AiSpec, type Job, type JobResult } from "./jobs.ts";
import { quotasOk } from "./search.ts";
import { allFamilies, battleConfig, catalogKeys, GCFG, mutatedSample, RAW_COMBAT, type Variant } from "./setup.ts";

export interface Plan {
  readonly mode: "completo" | "rapido";
  readonly seed: string;
  readonly c1Seeds: number;
  readonly c1PerSeed: number;
  readonly c2PerPair: number;
  readonly c3: number;
  readonly c4PerRival: number;
  readonly movCatalog: number;
  readonly movSample: number;
  readonly movStage1: number;
  readonly movStage2: number;
  readonly chunk: number;
}

export const DEFAULT_SEED = "valida03";
/**
 * Prefijos con los que se ha explorado o elegido algo: no valen para evaluar (QA V-01).
 * `valida02` validó la 1.ª versión de la propuesta y motivó el refinado de sombra (`elige02c/d`): ya no es de validación.
 */
export const CHOOSING_SEEDS = ["explora02", "elige02", "valida02"];

export function makePlan(quick: boolean, o: { seed?: string; c1PerSeed?: number }): Plan {
  const S = RAW_COMBAT.escenarios_sim;
  const seed = o.seed ?? DEFAULT_SEED;
  if (quick) return { mode: "rapido", seed, c1Seeds: 2, c1PerSeed: o.c1PerSeed ?? 150, c2PerPair: 6, c3: 200, c4PerRival: 100, movCatalog: 12, movSample: 4, movStage1: 24, movStage2: 0, chunk: 50 };
  // Completo. Reducciones frente a la spec por presupuesto (< 25 min para todo el trabajo, 2 hilos), declaradas en el informe:
  // C1 10.000 (spec 20.000); C2 250 por pareja (spec 1000); C3 4000 (spec 10.000); C4 2500 por rival (spec 5000);
  // sustitución en 2 tandas (400, +1600 si el IC cruza un umbral) con 60 mutados (spec 2000 y 500).
  return { mode: "completo", seed, c1Seeds: S.C1_aleatorio.semillas as number, c1PerSeed: o.c1PerSeed ?? 2000, c2PerPair: 250, c3: 4000, c4PerRival: 2500, movCatalog: 72, movSample: 60, movStage1: 400, movStage2: 1600, chunk: 250 };
}

/** C4 [v0.2.1]: la IA que no ahorra (κ = 0, sin reserva) contra las que ahorran. */
export const SPENDER: AiSpec = { id: "gastador", kappa: 0, reserve: 0 };
export function savers(): (AiSpec & { label: string })[] {
  const reserves = (RAW_COMBAT.escenarios_sim.C4_energia.reservas as number[]).filter((u) => u > 0);
  return [{ id: "lambda", label: "precio de la energía, κ de la config" }, ...reserves.map((u) => ({ id: `u${u}`, label: `reserva fija ${u}, κ = 0`, reserve: u, kappa: 0 }))];
}

const pairsOf = (fams: readonly string[]): [string, string][] => {
  const out: [string, string][] = [];
  for (let i = 0; i < fams.length; i++) for (let j = i + 1; j < fams.length; j++) out.push([fams[i]!, fams[j]!]);
  return out;
};

export function groupKey(j: Job, phase: string): string {
  const extra = j.kind === "C2" ? j.pair!.join("-") : j.kind === "C4" ? j.aiX!.id : j.kind === "MOV" ? j.moveKey! : "";
  return `${phase}|${j.kind}|${j.variant.id}|${j.seed}|${extra}`;
}

export interface TaggedJob {
  readonly phase: string;
  readonly job: Job;
}

export interface MoveSpec {
  readonly key: string;
  readonly id: string | undefined;
  readonly source: "catálogo" | "mutado";
}

export function moveSpecs(plan: Plan): MoveSpec[] {
  const cat: MoveSpec[] = catalogKeys()
    .filter((_, i, a) => plan.movCatalog >= a.length || i % Math.ceil(a.length / plan.movCatalog) === 0)
    .map((k) => ({ key: k.key, id: k.id, source: "catálogo" }));
  const mut: MoveSpec[] = mutatedSample(plan.movSample, `${plan.seed}|muestra_mutados`).map((key) => ({ key, id: undefined, source: "mutado" }));
  return [...cat, ...mut];
}

function moveJobs(plan: Plan, v: Variant, specs: readonly MoveSpec[], n: number, offset: number): TaggedJob[] {
  const out: TaggedJob[] = [];
  for (const m of specs) for (const job of chunks({ kind: "MOV", variant: v, seed: `${plan.seed}-1`, moveKey: m.key, ...(m.id ? { moveId: m.id } : {}) }, n, Math.max(plan.chunk, 200), offset)) out.push({ phase: "eval", job });
  return out;
}

/** Fase 1: escenarios C1–C4 y 1.ª tanda de sustitución para cada variante. */
export function phase1Jobs(plan: Plan, variants: readonly Variant[]): TaggedJob[] {
  const out: TaggedJob[] = [];
  const push = (js: Job[]): void => {
    for (const job of js) out.push({ phase: "eval", job });
  };
  for (const v of variants) {
    for (let s = 1; s <= plan.c1Seeds; s++) push(chunks({ kind: "C1", variant: v, seed: `${plan.seed}-${s}` }, plan.c1PerSeed, plan.chunk));
    for (const pair of pairsOf(allFamilies())) push(chunks({ kind: "C2", variant: v, seed: `${plan.seed}-1`, pair }, plan.c2PerPair, plan.chunk));
    push(chunks({ kind: "C3", variant: v, seed: `${plan.seed}-1` }, plan.c3, plan.chunk));
    for (const sv of savers()) push(chunks({ kind: "C4", variant: v, seed: `${plan.seed}-1`, aiX: sv, aiY: SPENDER }, plan.c4PerRival, plan.chunk));
    out.push(...moveJobs(plan, v, moveSpecs(plan), plan.movStage1, 0));
  }
  return out;
}

/** Fase 2: 2.ª tanda solo para los movimientos cuyo IC cruza un umbral de veredicto. */
export function phase2Jobs(plan: Plan, variants: readonly Variant[], g: Groups): TaggedJob[] {
  if (plan.movStage2 <= 0) return [];
  return variants.flatMap((v) =>
    moveJobs(
      plan,
      v,
      moveSpecs(plan).filter((m) => {
        const a = g.agg((_ph, j) => j.kind === "MOV" && j.variant.id === v.id && j.moveKey === m.key);
        return a !== null && needsMore(a);
      }),
      plan.movStage2,
      plan.movStage1,
    ),
  );
}

export class Groups {
  readonly map = new Map<string, JobResult[]>();
  add(tj: TaggedJob, r: JobResult): void {
    const k = groupKey(tj.job, tj.phase);
    const l = this.map.get(k);
    if (l) l.push(r);
    else this.map.set(k, [r]);
  }
  agg(f: (phase: string, j: Job) => boolean): Agg | null {
    const rs: JobResult[] = [];
    for (const [k, l] of this.map) if (f(k.split("|")[0]!, l[0]!.job)) rs.push(...l);
    return rs.length ? merge(rs) : null;
  }
}

// --------------------------------------------------------------- resultados

export interface Summary {
  readonly variant: Variant;
  readonly duration: Duration;
  readonly perSeed: readonly Duration[];
  readonly use: { cost: string; payable: number; rate: Interval }[];
  readonly families: readonly FamilyRate[];
  readonly quality: { wr: Interval; n: number };
  readonly energy: readonly { id: string; label: string; wr: Interval; n: number }[];
  readonly moves: readonly MoveRow[];
  readonly valid: readonly [number, number];
  readonly pieces: { piece: string; value: string; n: number; meanWr: number; broken: number; useless: number }[];
  readonly crit: readonly Criterion[];
  readonly turnsHist: readonly number[];
}

/** Movimientos del catálogo válidos (movimientos §3) y familias base con las cuotas §5.1. */
export function catalogValidity(v: Variant): [number, number] {
  const cfg = battleConfig(v);
  const keys = catalogKeys();
  const okFam = new Set((GCFG.baseFamilies as readonly string[]).filter((f) => quotasOk(v, f)));
  const ok = keys.filter((k) => validateMove(generateMoveForKey(k.key, cfg.moves, k.id), cfg.moves).length === 0 && okFam.has(k.key.split("|")[0]!)).length;
  return [ok, keys.length];
}

export function summarize(g: Groups, plan: Plan, v: Variant): Summary {
  const seeds = Array.from({ length: plan.c1Seeds }, (_, i) => `${plan.seed}-${i + 1}`);
  const perSeedAgg = seeds.map((s) => g.agg((_p, j) => j.kind === "C1" && j.variant.id === v.id && j.seed === s)!);
  const all = g.agg((_p, j) => j.kind === "C1" && j.variant.id === v.id)!;
  const pairs: { F: string; G: string; a: Agg }[] = [];
  for (const [k, l] of g.map) if (k.startsWith(`eval|C2|${v.id}|`)) pairs.push({ F: l[0]!.job.pair![0], G: l[0]!.job.pair![1], a: merge(l) });
  const families = familyRates(pairs, allFamilies());
  const q = g.agg((_p, j) => j.kind === "C3" && j.variant.id === v.id)!;
  const energy = savers().map((sv) => {
    const a = g.agg((_p, j) => j.kind === "C4" && j.variant.id === v.id && j.aiX!.id === sv.id)!;
    return { id: sv.id, label: sv.label, wr: winRate(a.xWins, a.draws, a.n), n: a.n };
  });
  const use = [1, 2, 3, 4, 5, 6].map((k) => ({ cost: k === 6 ? "4–5" : String(k), payable: all.payable[k]!, rate: wilson(all.paid[k]!, all.payable[k]!) }));
  const cfg = battleConfig(v);
  const { moves: MC } = studyCriteria();
  const moves: MoveRow[] = moveSpecs(plan).map((m) => {
    const a = g.agg((_p, j) => j.kind === "MOV" && j.variant.id === v.id && j.moveKey === m.key)!;
    const mv = generateMoveForKey(m.key, cfg.moves, m.id);
    const wr = winRate(a.xWins, a.draws, a.n);
    const vd = moveVerdict(wr);
    const u = a.usable ? a.used / a.usable : NaN;
    return { key: m.key, id: mv.id, source: m.source, name: mv.name, desc: describeMove(mv, cfg.moves), cost: mv.cost, archetype: mv.archetype, status: mv.status ?? "—", modifier: mv.modifier ?? "—", condition: mv.condition ?? "—", family: mv.family, n: a.n, wr, use: u, verdict: vd.verdict, suspicious: u > MC["uso_sospechoso"], uncertain: vd.uncertain };
  });
  const pieces: Summary["pieces"] = [];
  const fields: [string, (r: MoveRow) => string][] = [
    ["arquetipo", (r) => r.archetype],
    ["coste", (r) => String(r.cost)],
  ];
  for (const [piece, f] of fields)
    for (const value of [...new Set(moves.map(f))].sort()) {
      const rs = moves.filter((r) => f(r) === value);
      pieces.push({ piece, value, n: rs.length, meanWr: rs.reduce((s, r) => s + r.wr.value, 0) / rs.length, broken: rs.filter((r) => r.verdict.startsWith("roto")).length, useless: rs.filter((r) => r.verdict === "inútil").length });
    }
  const valid = catalogValidity(v);
  const qwr = winRate(q.xWins, q.draws, q.n);
  const crit = [
    ...c1Criteria(perSeedAgg, all),
    initiativeCriterion(all),
    ...familyCriteria(families),
    ...qualityCriteria(RAW_COMBAT.estadisticas.beta_calidad as number, q, false),
    ...energyCriteria(energy, use[5]!.rate),
    ...moveCriteria(moves, valid),
  ];
  return { variant: v, duration: duration(all), perSeed: perSeedAgg.map(duration), use, families, quality: { wr: qwr, n: q.n }, energy, moves, valid, pieces, crit, turnsHist: Array.from(all.turnsHist, (x) => x ?? 0) };
}
