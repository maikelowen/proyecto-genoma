/**
 * Partidas del estudio de combate v0.4. Cada trabajo es un tramo [from, to) de un escenario y una configuración;
 * determinista (semillas por partida) e independiente del troceo: todos los contadores son enteros.
 *
 *   C1     equipos de 3 salvajes distintos, colocación de la IA (referencePlacement), IA de reglas en los dos lados.
 *   ESPEJO el mismo equipo en los dos lados (remontada sin diferencia de equipos; informativo).
 *   C2     equipos monofamilia F contra G (3 almas), lados alternos.
 *   PLACE  mismo equipo en los dos lados con colocaciones distintas (par P,Q de PLACEMENTS), IA de reglas.
 *   TANK   equipo con un alma de vida ≥ p90 delante y un apoyo detrás contra un equipo C1.
 *   PROF   IA de búsqueda contra la mejor IA de reglas, equipo espejo, cada equipo dos veces (búsqueda en A y en B).
 * Semillas: equipos `<semilla>|<escenario>|equipos|i` (compartidos entre configuraciones: pareado);
 * partida `<semilla>|<escenario>|<config>|i` (flujo propio por configuración).
 */
import {
  createBattle,
  createReferenceAi,
  createRng,
  createSearchAi,
  referencePlacement,
  resolveTurn,
  type Ai,
  type BattleConfig,
  type BattleResult,
  type Combatant,
  type FamilyId,
  type Plan,
} from "../../packages/core/src/index.ts";
import { battleConfig, GCFG, monoFamilyTeam, wildTeam, type Variant } from "./setup.ts";
import { createWildCreature, buildCombatant } from "../../packages/core/src/index.ts";
import { variantById } from "./configs.ts";

export type Kind = "C1" | "ESPEJO" | "C2" | "PLACE" | "TANK" | "PROF";

/** Colocaciones comparadas (mismo equipo en el orden dado): 2+1 y 1+2 y sus variantes de carril, y la regla de la IA. */
export const PLACEMENTS = ["2+1", "1+2", "ia", "2+1c", "1+2c"] as const;
export type PlacementName = (typeof PLACEMENTS)[number];
export function placementOf(name: PlacementName, team: readonly Combatant[], cfg: BattleConfig): number[] {
  switch (name) {
    case "2+1": return [1, 2, 3];
    case "1+2": return [1, 3, 4];
    case "2+1c": return [1, 2, 4]; // la trasera pasa al carril derecho
    case "1+2c": return [2, 3, 4]; // la delantera pasa al carril derecho
    case "ia": return referencePlacement(team, cfg.combat);
  }
}

export interface VJob {
  readonly kind: Kind;
  readonly config: string;
  readonly seed: string;
  readonly from: number;
  readonly to: number;
  readonly pair?: readonly [FamilyId, FamilyId] | readonly [PlacementName, PlacementName];
}

export interface VResult {
  n: number;
  aWins: number;
  bWins: number;
  draws: number;
  /** Victorias del bando medido X (C1: A; C2: familia F; PLACE: 1.ª colocación; TANK: equipo tanque; PROF: la búsqueda). */
  xWins: number;
  turnsHist: number[];
  firstKoN: number;
  firstKoWins: number;
  lead3N: number;
  lead3Wins: number;
  /** Acciones ejecutadas y cuántas son el movimiento gratis. */
  actions: number;
  freeActions: number;
  /** Almas con ≥ MIN_ACTIONS acciones: nº y Σ de movimientos de pago distintos usados. */
  soulN: number;
  soulDistinct: number;
  soulDistinctSq: number;
  /** Planes inválidos y usos de provocar. */
  invalid: number;
  taunts: number;
  decisions: number;
  differs: number;
}

export const MIN_ACTIONS = 4;

export function emptyResult(): VResult {
  return { n: 0, aWins: 0, bWins: 0, draws: 0, xWins: 0, turnsHist: [], firstKoN: 0, firstKoWins: 0, lead3N: 0, lead3Wins: 0, actions: 0, freeActions: 0, soulN: 0, soulDistinct: 0, soulDistinctSq: 0, invalid: 0, taunts: 0, decisions: 0, differs: 0 };
}

export function mergeResults(rs: readonly VResult[]): VResult {
  const out = emptyResult();
  for (const r of rs) {
    for (const k of Object.keys(out) as (keyof VResult)[]) {
      const v = r[k];
      if (typeof v === "number") (out[k] as number) += v;
    }
    r.turnsHist.forEach((c, t) => {
      if (c) out.turnsHist[t] = (out.turnsHist[t] ?? 0) + c;
    });
  }
  for (let t = 0; t < out.turnsHist.length; t++) out.turnsHist[t] ??= 0;
  return out;
}

const hpSum = (fs: readonly { hp: number; ko: boolean }[]): number => fs.reduce((s, f) => s + (f.ko ? 0 : f.hp), 0);

/** Juega una partida (mismo flujo RNG que `runBattle`) con colocaciones y acumula las medidas en `r`. */
export function play(A: readonly Combatant[], B: readonly Combatant[], pa: readonly number[], pb: readonly number[], seed: string, cfg: BattleConfig, aiA: Ai, aiB: Ai, r: VResult): BattleResult {
  let state = createBattle(A, B, cfg, pa, pb);
  const rng = createRng(cfg.combat.seedPrefix + seed);
  const teams = [A, B];
  const used = [A.map(() => new Set<number>()), B.map(() => new Set<number>())];
  const acts = [A.map(() => 0), B.map(() => 0)];
  let firstKo: 0 | 1 | null = null;
  let lead3: 0 | 1 | null = null;
  let turns = 0;
  // posición (casilla 1–4) → índice del alma en el equipo
  const idx = [pa, pb].map((p) => new Map(p.map((slot, i) => [slot, i] as const)));
  while (state.result === null) {
    const res = resolveTurn(state, aiA(state, "A", cfg), aiB(state, "B", cfg), rng, cfg);
    state = res.state;
    turns++;
    for (const ev of res.events) {
      if (ev.type === "plan") {
        if (!ev.valid) r.invalid++;
      } else if (ev.type === "action") {
        const s = ev.side === "A" ? 0 : 1;
        const i = idx[s]!.get(ev.actor)!;
        const mv = teams[s]![i]!.moves[ev.move - 1]!;
        r.actions++;
        acts[s]![i]!++;
        if (mv.cost === 0) r.freeActions++;
        else used[s]![i]!.add(ev.move);
      } else if (ev.type === "ko") {
        if (firstKo === null) firstKo = ev.side === "A" ? 1 : 0;
      } else if (ev.type === "taunt") r.taunts++;
    }
    if (turns === 3 && state.result === null) {
      const a = hpSum(state.fighters[0]);
      const b = hpSum(state.fighters[1]);
      lead3 = a > b ? 0 : b > a ? 1 : null;
    }
  }
  r.n++;
  r.turnsHist[turns] = (r.turnsHist[turns] ?? 0) + 1;
  if (state.result === "empate") r.draws++;
  else {
    const w = state.result === "A" ? 0 : 1;
    if (w === 0) r.aWins++;
    else r.bWins++;
    if (firstKo !== null) {
      r.firstKoN++;
      if (firstKo === w) r.firstKoWins++;
    }
    if (lead3 !== null) {
      r.lead3N++;
      if (lead3 === w) r.lead3Wins++;
    }
  }
  for (const s of [0, 1])
    teams[s]!.forEach((_, i) => {
      if (acts[s]![i]! < MIN_ACTIONS) return;
      r.soulN++;
      r.soulDistinct += used[s]![i]!.size;
      r.soulDistinctSq += used[s]![i]!.size ** 2;
    });
  return state.result;
}

const planKey = (p: Plan): string => p.map((a) => `${a.actor}:${a.move}:${a.target}`).join("|");

const hasSupport = (c: Combatant): boolean => c.moves.some((m) => m.cost > 0 && (m.archetype === "proteccion" || m.archetype === "curacion"));

const p90Cache = new Map<string, number>();
/** p90 de la vida máxima de un salvaje en esa config (muestra fija de 1500, semilla propia). */
export function hpP90(cfg: BattleConfig, key: string): number {
  let v = p90Cache.get(key);
  if (v === undefined) {
    const rng = createRng("tanque|calib");
    const hp = Array.from({ length: 1500 }, (_, k) => buildCombatant(createWildCreature(rng, GCFG, { id: `k${k}` }), cfg).maxHp).sort((a, b) => a - b);
    v = hp[Math.floor(0.9 * hp.length)]!;
    p90Cache.set(key, v);
  }
  return v;
}

/** Equipo tanque: el 1.º salvaje con vida ≥ p90, el 1.º con apoyo (distinto), y otro cualquiera; colocación [1, 2, 3] con [tanque, otro, apoyo]. */
export function tankTeam(rng: ReturnType<typeof createRng>, cfg: BattleConfig, p90: number): Combatant[] {
  let tank: Combatant | null = null;
  let support: Combatant | null = null;
  for (let k = 0; k < 400 && (!tank || !support); k++) {
    const c = buildCombatant(createWildCreature(rng, GCFG, { id: `t${k}` }), cfg);
    if (!tank && c.maxHp >= p90) tank = c;
    else if (!support && hasSupport(c)) support = c;
  }
  if (!tank || !support) throw new Error("tankTeam: no se encontró tanque y apoyo");
  const third = buildCombatant(createWildCreature(rng, GCFG, { id: "t-x" }), cfg);
  return [tank, third, support];
}

export function runVJob(job: VJob): VResult {
  const variant: Variant = variantById(job.config);
  const cfg = battleConfig(variant);
  const r = emptyResult();
  const ref = createReferenceAi();
  const place = (t: readonly Combatant[]): number[] => placementOf("ia", t, cfg);
  const scope = job.kind === "C2" || job.kind === "PLACE" ? `${job.kind}|${job.pair![0]}|${job.pair![1]}` : job.kind;
  if (job.kind === "PROF") {
    const search = createSearchAi();
    const counted: Ai = (st, side, c) => {
      const p = search(st, side, c);
      r.decisions++;
      if (planKey(p) !== planKey(ref(st, side, c))) r.differs++;
      return p;
    };
    for (let i = job.from; i < job.to; i++) {
      const k = Math.floor(i / 2);
      const team = wildTeam(createRng(`${job.seed}|PROF|equipos|${k}`), cfg, "e");
      const xIsA = i % 2 === 0;
      const pl = place(team);
      const res = play(team, team, pl, pl, `${job.seed}|PROF|${job.config}|${k}`, cfg, xIsA ? counted : ref, xIsA ? ref : counted, r);
      if (res !== "empate" && (res === "A") === xIsA) r.xWins++;
    }
    return r;
  }
  const p90 = job.kind === "TANK" ? hpP90(cfg, job.config) : 0;
  for (let i = job.from; i < job.to; i++) {
    const trng = createRng(`${job.seed}|${scope}|equipos|${i}`);
    const bseed = `${job.seed}|${scope}|${job.config}|${i}`;
    const xIsA = i % 2 === 0;
    let X: Combatant[];
    let Y: Combatant[];
    let px: number[];
    let py: number[];
    switch (job.kind) {
      case "C1": {
        X = wildTeam(trng, cfg, "a");
        Y = wildTeam(trng, cfg, "b");
        if (play(X, Y, place(X), place(Y), bseed, cfg, ref, ref, r) === "A") r.xWins++;
        continue;
      }
      case "ESPEJO": {
        X = wildTeam(trng, cfg, "e");
        if (play(X, X, place(X), place(X), bseed, cfg, ref, ref, r) === "A") r.xWins++;
        continue;
      }
      case "PLACE": {
        X = wildTeam(trng, cfg, "e");
        Y = X;
        px = placementOf(job.pair![0] as PlacementName, X, cfg);
        py = placementOf(job.pair![1] as PlacementName, Y, cfg);
        break;
      }
      case "TANK": {
        X = tankTeam(trng, cfg, p90);
        Y = wildTeam(trng, cfg, "b");
        px = [1, 2, 3];
        py = place(Y);
        break;
      }
      default: // C2
        X = monoFamilyTeam(job.pair![0] as FamilyId, trng, cfg, "x");
        Y = monoFamilyTeam(job.pair![1] as FamilyId, trng, cfg, "y");
        px = place(X);
        py = place(Y);
    }
    const res = xIsA ? play(X, Y, px, py, bseed, cfg, ref, ref, r) : play(Y, X, py, px, bseed, cfg, ref, ref, r);
    if (res !== "empate" && (res === "A") === xIsA) r.xWins++;
  }
  return r;
}
