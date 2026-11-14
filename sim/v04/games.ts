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
  lastAnimaPos,
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
  /** v0.5: la semilla de la partida no incluye la config (partidas pareadas entre configs). */
  readonly paired?: boolean;
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
  // --- v0.5 (cero en v0.4) ---
  /** Turnos-bando con una última ánima actuando, y de ellos los que reparten 0/1/2/3 movimientos de pago. */
  lastTurns: number;
  lastPay0: number;
  lastPay1: number;
  lastPay2: number;
  lastPay3: number;
  /** Σ energía del bando al empezar los turnos en que es última (la variante activa) y nº de esos turnos. */
  lastEnergySum: number;
  lastEnergyN: number;
  /** Energía perdida (cancel.lost): por caer, por aturdir y parte de últimas ánimas. */
  lostKo: number;
  lostStun: number;
  lostLast: number;
  /** Energía perdida por aturdir a una última y nº de partidas con alguna. */
  lostStunLast: number;
  /** Bandos que llegan a una sola ánima viva y cuántos de ellos ganan. */
  soloReached: number;
  soloWon: number;
  /** Secuencias de ≥ 2 movimientos de la última y cuántas tienen hueco de prioridad 1. */
  seqMulti: number;
  seqPrio1: number;
  /** Partidas con una última aturdida (antes de actuar) y KO totales. */
  stunLastGames: number;
  kos: number;
  /** Energía perdida en el turno final por el bando que se queda sin ánimas (cae su última): no es "útil". */
  lostFinal: number;
  /** Una cadena de 4 caracteres por partida (solo C1): ver gameCode. */
  codes: string;
}

/** Código de partida (C1): KO 0 ninguno / 1 gana el que hizo el primero / 2 gana el que lo sufrió / 3 empate con KO; T3 0 sin líder / 1 gana el líder / 2 pierde; empate 0/1; turnos = 33 + n. */
export const gameCode = (ko: number, l3: number, draw: number, turns: number): string => "" + ko + l3 + draw + String.fromCharCode(33 + Math.min(turns, 90));

export const MIN_ACTIONS = 4;

export function emptyResult(): VResult {
  return { n: 0, aWins: 0, bWins: 0, draws: 0, xWins: 0, turnsHist: [], firstKoN: 0, firstKoWins: 0, lead3N: 0, lead3Wins: 0, actions: 0, freeActions: 0, soulN: 0, soulDistinct: 0, soulDistinctSq: 0, invalid: 0, taunts: 0, decisions: 0, differs: 0, lastTurns: 0, lastPay0: 0, lastPay1: 0, lastPay2: 0, lastPay3: 0, lastEnergySum: 0, lastEnergyN: 0, lostKo: 0, lostStun: 0, lostLast: 0, lostStunLast: 0, soloReached: 0, soloWon: 0, seqMulti: 0, seqPrio1: 0, stunLastGames: 0, kos: 0, lostFinal: 0, codes: "" };
}

export function mergeResults(rs: readonly VResult[]): VResult {
  const out = emptyResult();
  for (const r of rs) {
    for (const k of Object.keys(out) as (keyof VResult)[]) {
      const v = r[k];
      if (typeof v === "number") (out[k] as number) += v;
    }
    out.codes += r.codes ?? "";
    r.turnsHist.forEach((c, t) => {
      if (c) out.turnsHist[t] = (out.turnsHist[t] ?? 0) + c;
    });
  }
  for (let t = 0; t < out.turnsHist.length; t++) out.turnsHist[t] ??= 0;
  return out;
}

const hpSum = (fs: readonly { hp: number; ko: boolean }[]): number => fs.reduce((s, f) => s + (f.ko ? 0 : f.hp), 0);

/** Juega una partida (mismo flujo RNG que `runBattle`) con colocaciones y acumula las medidas en `r`. */
export function play(A: readonly Combatant[], B: readonly Combatant[], pa: readonly number[], pb: readonly number[], seed: string, cfg: BattleConfig, aiA: Ai, aiB: Ai, r: VResult, code = false): BattleResult {
  let state = createBattle(A, B, cfg, pa, pb);
  const rng = createRng(cfg.combat.seedPrefix + seed);
  const teams = [A, B];
  const used = [A.map(() => new Set<number>()), B.map(() => new Set<number>())];
  const acts = [A.map(() => 0), B.map(() => 0)];
  let firstKo: 0 | 1 | null = null;
  let lead3: 0 | 1 | null = null;
  let turns = 0;
  const reachedSolo = [false, false];
  let stunnedLast = false;
  let turnLost = [0, 0];
  // posición (casilla 1–4) → índice del alma en el equipo
  const idx = [pa, pb].map((p) => new Map(p.map((slot, i) => [slot, i] as const)));
  while (state.result === null) {
    for (const s of [0, 1] as const) if (lastAnimaPos(state, s === 0 ? "A" : "B", cfg) > 0) {
      r.lastEnergySum += state.energy[s];
      r.lastEnergyN++;
    }
    const res = resolveTurn(state, aiA(state, "A", cfg), aiB(state, "B", cfg), rng, cfg);
    state = res.state;
    turns++;
    const pays = [0, 0];
    turnLost = [0, 0];
    const acted = [false, false];
    for (const ev of res.events) {
      if (ev.type === "order") {
        for (const q of ev.queue) if (q.moves && q.moves.length >= 2) {
          r.seqMulti++;
          if (q.priority === 1) r.seqPrio1++;
        }
      } else if (ev.type === "cancel") {
        const lost = ev.lost ?? 0;
        turnLost[ev.side === "A" ? 0 : 1]! += lost;
        if (ev.reason === "ko") r.lostKo += lost;
        else r.lostStun += lost;
        if (ev.seq) {
          r.lostLast += lost;
          if (ev.reason === "aturdido") {
            r.lostStunLast += lost;
            stunnedLast = true;
          }
        }
      } else if (ev.type === "plan") {
        if (!ev.valid) r.invalid++;
      } else if (ev.type === "action") {
        const s = ev.side === "A" ? 0 : 1;
        const i = idx[s]!.get(ev.actor)!;
        const mv = teams[s]![i]!.moves[ev.move - 1]!;
        r.actions++;
        acts[s]![i]!++;
        if (mv.cost === 0) r.freeActions++;
        else used[s]![i]!.add(ev.move);
        if (ev.seq) {
          acted[s] = true;
          if (mv.cost > 0) pays[s]!++;
        }
      } else if (ev.type === "ko") {
        r.kos++;
        if (firstKo === null) firstKo = ev.side === "A" ? 1 : 0;
      } else if (ev.type === "taunt") r.taunts++;
    }
    for (const s of [0, 1]) if (acted[s]) {
      r.lastTurns++;
      const k = Math.min(3, pays[s]!);
      if (k === 0) r.lastPay0++;
      else if (k === 1) r.lastPay1++;
      else if (k === 2) r.lastPay2++;
      else r.lastPay3++;
    }
    for (const s of [0, 1]) if (state.fighters[s]!.filter((f) => !f.ko).length === 1) reachedSolo[s] = true;
    if (turns === 3 && state.result === null) {
      const a = hpSum(state.fighters[0]);
      const b = hpSum(state.fighters[1]);
      lead3 = a > b ? 0 : b > a ? 1 : null;
    }
  }
  r.n++;
  if (stunnedLast) r.stunLastGames++;
  for (const s of [0, 1]) if (state.fighters[s]!.every((f) => f.ko)) r.lostFinal += turnLost[s]!;
  let koCode = 0;
  let l3Code = 0;
  r.turnsHist[turns] = (r.turnsHist[turns] ?? 0) + 1;
  if (state.result === "empate") {
    r.draws++;
    for (const s of [0, 1]) if (reachedSolo[s]) r.soloReached++;
    if (firstKo !== null) koCode = 3;
  } else {
    const w = state.result === "A" ? 0 : 1;
    if (w === 0) r.aWins++;
    else r.bWins++;
    if (firstKo !== null) {
      r.firstKoN++;
      if (firstKo === w) r.firstKoWins++;
      koCode = firstKo === w ? 1 : 2;
    }
    if (lead3 !== null) {
      r.lead3N++;
      if (lead3 === w) r.lead3Wins++;
      l3Code = lead3 === w ? 1 : 2;
    }
    for (const s of [0, 1]) if (reachedSolo[s]) {
      r.soloReached++;
      if (s === w) r.soloWon++;
    }
  }
  if (code) r.codes += gameCode(koCode, l3Code, state.result === "empate" ? 1 : 0, turns);
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
      const res = play(team, team, pl, pl, `${job.seed}|PROF|${job.paired ? "par" : job.config}|${k}`, cfg, xIsA ? counted : ref, xIsA ? ref : counted, r);
      if (res !== "empate" && (res === "A") === xIsA) r.xWins++;
    }
    return r;
  }
  const p90 = job.kind === "TANK" ? hpP90(cfg, job.config) : 0;
  for (let i = job.from; i < job.to; i++) {
    const trng = createRng(`${job.seed}|${scope}|equipos|${i}`);
    const bseed = `${job.seed}|${scope}|${job.paired ? "par" : job.config}|${i}`;
    const xIsA = i % 2 === 0;
    let X: Combatant[];
    let Y: Combatant[];
    let px: number[];
    let py: number[];
    switch (job.kind) {
      case "C1": {
        X = wildTeam(trng, cfg, "a");
        Y = wildTeam(trng, cfg, "b");
        if (play(X, Y, place(X), place(Y), bseed, cfg, ref, ref, r, job.paired === true) === "A") r.xWins++;
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
