/**
 * Partidas del estudio de variantes v0.3. Cada trabajo es un tramo [from, to) de un escenario
 * y una combinación; determinista (semillas por partida) e independiente del troceo: todos los
 * contadores son enteros, así que sumar tramos da exactamente lo mismo.
 *
 * Escenarios:
 *   C1      equipos de salvajes distintos, IA de reglas en los dos lados (duración, remontada, variedad).
 *   ESPEJO  el mismo equipo en los dos lados, IA de reglas (remontada sin diferencia de equipos).
 *   C2      equipos monofamilia F contra G, lados alternos (equilibrio de familias).
 *   PROF    IA de búsqueda contra la mejor IA de reglas, equipo espejo, cada equipo dos veces (búsqueda en A y en B).
 *   FORM    solo V4: mismo equipo, X con `suggestFormation` contra Y con otra formación (`rival`).
 * Semillas: equipos `<semilla>|<escenario>|equipos|i` (compartidos entre combinaciones: pareado);
 * partida `<semilla>|<escenario>|<combinación>|i` (flujo propio por combinación).
 * Con V4, los equipos se colocan con `suggestFormation`; sin V4, en orden de generación (como en v0.2.1).
 */
import {
  createBattle,
  createReferenceAi,
  createRng,
  createSearchAi,
  eligibleActors,
  resolveTurn,
  restingMoves,
  suggestFormation,
  type Ai,
  type BattleConfig,
  type BattleResult,
  type Combatant,
  type FamilyId,
  type Plan,
} from "../../packages/core/src/index.ts";
import { battleConfig, monoFamilyTeam, wildTeam } from "../combat/setup.ts";
import { comboById } from "./combos.ts";

export type Kind = "C1" | "ESPEJO" | "C2" | "PROF" | "FORM";

export interface VJob {
  readonly kind: Kind;
  readonly combo: string;
  readonly seed: string;
  readonly from: number;
  readonly to: number;
  readonly pair?: readonly [FamilyId, FamilyId];
  /** FORM: formación del rival: "gen" (orden de generación) o "inv" (la sugerida, invertida). */
  readonly rival?: "gen" | "inv";
}

/** Contadores (todos enteros). `x` = bando medido (C2: familia F; PROF: búsqueda; FORM: formación sugerida). */
export interface VResult {
  n: number;
  aWins: number;
  bWins: number;
  draws: number;
  xWins: number;
  turnsHist: number[];
  /** Remontada. Partidas con ganador y primer KO / con ganador y líder de vida tras el turno 3 / con líder de vida máxima inicial. */
  firstKoN: number;
  firstKoWins: number;
  lead3N: number;
  lead3Wins: number;
  lead0N: number;
  lead0Wins: number;
  /** Variedad. Acciones ejecutadas: [básico, movimiento más barato, …, más caro] (orden por coste, empate por hueco). */
  byCostRank: number[];
  /** Entropía por alma (almas con ≥ MIN_ACTIONS acciones), en milibits: Σ, Σ² y nº de almas. */
  entN: number;
  entSum: number;
  entSq: number;
  /** Decisiones de almas que pueden actuar: nº, Σ movimientos no en descanso y Σ de los que además se pueden pagar. */
  decN: number;
  availSum: number;
  payableSum: number;
  /** Planes (bando y turno): nº, energía que queda tras pagar, e inválidos. */
  plans: number;
  unspent: number;
  invalid: number;
  taunts: number;
  /** PROF: decisiones de la búsqueda y cuántas difieren de la IA de referencia. */
  decisions: number;
  differs: number;
}

export const MIN_ACTIONS = 4;

export function emptyResult(): VResult {
  return { n: 0, aWins: 0, bWins: 0, draws: 0, xWins: 0, turnsHist: [], firstKoN: 0, firstKoWins: 0, lead3N: 0, lead3Wins: 0, lead0N: 0, lead0Wins: 0, byCostRank: [0, 0, 0, 0, 0], entN: 0, entSum: 0, entSq: 0, decN: 0, availSum: 0, payableSum: 0, plans: 0, unspent: 0, invalid: 0, taunts: 0, decisions: 0, differs: 0 };
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
    r.byCostRank.forEach((c, k) => (out.byCostRank[k]! += c));
  }
  for (let t = 0; t < out.turnsHist.length; t++) out.turnsHist[t] ??= 0;
  return out;
}

const hpSum = (fs: readonly { hp: number; ko: boolean }[]): number => fs.reduce((s, f) => s + (f.ko ? 0 : f.hp), 0);

/** Rango por coste de cada hueco (1–4) de un alma: 1 = el más barato. */
function costRanks(c: Combatant): number[] {
  const order = c.moves.map((m, k) => ({ k, cost: m.cost })).sort((a, b) => a.cost - b.cost || a.k - b.k);
  const rank = [0, 0, 0, 0];
  order.forEach((o, i) => (rank[o.k] = i + 1));
  return rank;
}

/** Juega una partida (mismo flujo RNG que `runBattle`) y acumula las medidas en `r`. Devuelve el resultado. */
export function play(A: readonly Combatant[], B: readonly Combatant[], seed: string, cfg: BattleConfig, aiA: Ai, aiB: Ai, r: VResult): BattleResult {
  let state = createBattle(A, B, cfg);
  const rng = createRng(cfg.combat.seedPrefix + seed);
  const max0 = [A.reduce((s, c) => s + c.maxHp, 0), B.reduce((s, c) => s + c.maxHp, 0)];
  const ranks = [A.map(costRanks), B.map(costRanks)];
  const use = [A.map(() => [0, 0, 0, 0, 0]), B.map(() => [0, 0, 0, 0, 0])];
  let firstKo: 0 | 1 | null = null; // bando que hace el primer KO
  let lead3: 0 | 1 | null = null;
  let turns = 0;
  while (state.result === null) {
    for (const s of [0, 1] as const) {
      const side = s === 0 ? "A" : "B";
      for (const pos of eligibleActors(state, side)) {
        const resting = restingMoves(state, side, pos);
        const c = state.teams[s][pos - 1]!;
        r.decN++;
        r.availSum += 4 - resting.length;
        r.payableSum += c.moves.filter((m, k) => !resting.includes(k + 1) && m.cost <= state.energy[s]).length;
      }
    }
    const res = resolveTurn(state, aiA(state, "A", cfg), aiB(state, "B", cfg), rng, cfg);
    state = res.state;
    turns++;
    for (const ev of res.events) {
      if (ev.type === "plan") {
        r.plans++;
        r.unspent += ev.energy;
        if (!ev.valid) r.invalid++;
      } else if (ev.type === "action") {
        const s = ev.side === "A" ? 0 : 1;
        const k = ev.move === 0 ? 0 : ranks[s]![ev.actor - 1]![ev.move - 1]!;
        r.byCostRank[k]!++;
        use[s]![ev.actor - 1]![ev.move]!++;
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
    if (max0[0] !== max0[1]) {
      r.lead0N++;
      if ((max0[0]! > max0[1]! ? 0 : 1) === w) r.lead0Wins++;
    }
  }
  for (const side of use)
    for (const u of side) {
      const tot = u.reduce((s, x) => s + x, 0);
      if (tot < MIN_ACTIONS) continue;
      let h = 0;
      for (const x of u) if (x > 0) h -= (x / tot) * Math.log2(x / tot);
      const mb = Math.round(h * 1000);
      r.entN++;
      r.entSum += mb;
      r.entSq += mb * mb;
    }
  return state.result;
}

const planKey = (p: Plan): string => p.map((a) => `${a.actor}:${a.move}:${a.target}`).join("|");

export function runVJob(job: VJob): VResult {
  const combo = comboById(job.combo);
  const cfg = battleConfig(combo.variant);
  const r = emptyResult();
  const ref = createReferenceAi();
  const form = <T extends Combatant>(t: T[]): T[] => (combo.v4 ? suggestFormation(t) : t);
  const scope = job.kind === "C2" ? `C2|${job.pair![0]}|${job.pair![1]}` : job.kind === "FORM" ? `FORM|${job.rival}` : job.kind;
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
      const team = form(wildTeam(createRng(`${job.seed}|PROF|equipos|${k}`), cfg, "e"));
      const xIsA = i % 2 === 0;
      const res = play(team, team, `${job.seed}|PROF|${combo.id}|${k}`, cfg, xIsA ? counted : ref, xIsA ? ref : counted, r);
      if (res !== "empate" && (res === "A") === xIsA) r.xWins++;
    }
    return r;
  }
  for (let i = job.from; i < job.to; i++) {
    const trng = createRng(`${job.seed}|${job.kind === "C2" ? scope : job.kind === "FORM" ? "FORM" : job.kind}|equipos|${i}`);
    const bseed = `${job.seed}|${scope}|${combo.id}|${i}`;
    const xIsA = i % 2 === 0;
    let X: Combatant[];
    let Y: Combatant[];
    switch (job.kind) {
      case "C1": {
        X = form(wildTeam(trng, cfg, "a"));
        Y = form(wildTeam(trng, cfg, "b"));
        if (play(X, Y, bseed, cfg, ref, ref, r) === "A") r.xWins++;
        continue;
      }
      case "ESPEJO": {
        X = form(wildTeam(trng, cfg, "e"));
        if (play(X, X, bseed, cfg, ref, ref, r) === "A") r.xWins++;
        continue;
      }
      case "C2":
        X = form(monoFamilyTeam(job.pair![0], trng, cfg, "x"));
        Y = form(monoFamilyTeam(job.pair![1], trng, cfg, "y"));
        break;
      case "FORM": {
        const team = wildTeam(trng, cfg, "f");
        X = suggestFormation(team);
        Y = job.rival === "inv" ? [...X].reverse() : team;
        break;
      }
    }
    const res = xIsA ? play(X, Y, bseed, cfg, ref, ref, r) : play(Y, X, bseed, cfg, ref, ref, r);
    if (res !== "empate" && (res === "A") === xIsA) r.xWins++;
  }
  return r;
}
