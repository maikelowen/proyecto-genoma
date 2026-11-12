/**
 * Motor de combate v0.2 (spec docs/spec/combate-v0.2.md).
 *
 * Estado inmutable: `resolveTurn` no modifica el estado de entrada y
 * devuelve uno nuevo más el registro de eventos del turno. Consume
 * exactamente `tiradas.por_turno` (24) tiradas por turno, siempre en el
 * mismo orden (combate §11), se usen o no.
 */
import { cyrb128, type Rng } from "../rng.ts";
import type { Move } from "../moves/generate.ts";
import { STATUS_IDS, type BasicEffect, type CombatConfig, type StatusId } from "./config.ts";
import type { BattleConfig, Combatant } from "./combatant.ts";

export type SideId = "A" | "B";
export const SIDE_IDS = ["A", "B"] as const;
export type BattleResult = "A" | "B" | "empate";

/** Estado activo. `value` = pilas (quemadura), cantidad (escudo); 0 en el resto. */
export interface StatusInstance {
  readonly id: StatusId;
  readonly turns: number;
  readonly value: number;
}

/** Parte dinámica de una criatura en combate. */
export interface FighterState {
  readonly hp: number;
  readonly ko: boolean;
  /** Ordenados según STATUS_IDS (orden canónico). */
  readonly statuses: readonly StatusInstance[];
  /** Turno en el que no puede elegir acción (aturdida tras haber actuado), o 0. */
  readonly skipTurn: number;
  /** Último turno con inmunidad a aturdir, o 0. */
  readonly stunImmuneUntil: number;
  /**
   * variantes v0.3 V2 — turnos de descanso que le quedan a cada movimiento
   * (índice = movimiento − 1; 0 = disponible). Solo existe con `variantes.descanso` activo.
   */
  readonly rest?: readonly number[];
  /** variantes v0.3 V4 — finales de turno que le quedan a "provocar". Solo existe si es > 0. */
  readonly taunt?: number;
}

export interface BattleState {
  /** Turno por jugar (o el último jugado si `result` ≠ null). */
  readonly turn: number;
  /** Energía disponible de cada bando para el turno `turn` (A, B). */
  readonly energy: readonly [number, number];
  readonly teams: readonly [readonly Combatant[], readonly Combatant[]];
  readonly fighters: readonly [readonly FighterState[], readonly FighterState[]];
  readonly result: BattleResult | null;
}

/**
 * Acción de una criatura: `actor` y `target` son posiciones 1–4;
 * `move` = 0 golpe básico, 1–4 movimiento por locus. El bando del
 * objetivo lo fija el movimiento (enemigo o aliado).
 * variantes v0.3 V4 (objetivo automático): `target` se ignora (puede faltar
 * en la entrada; por convenio, 0) y el motor lo normaliza a 0.
 */
export interface Action {
  readonly actor: number;
  readonly move: number;
  readonly target: number;
}
export type Plan = readonly Action[];

export type BattleEvent =
  | { readonly type: "turn"; readonly turn: number; readonly energy: readonly [number, number] }
  | {
      readonly type: "plan";
      readonly side: SideId;
      readonly valid: boolean;
      readonly reason: string | null;
      readonly actions: Plan;
      readonly cost: number;
      readonly energy: number;
      readonly synergy: readonly number[];
    }
  | { readonly type: "order"; readonly queue: readonly { readonly side: SideId; readonly actor: number; readonly priority: number; readonly initiative: number }[] }
  | { readonly type: "action"; readonly side: SideId; readonly actor: number; readonly move: number; readonly moveId: string | null; readonly targetSide: SideId; readonly targets: readonly number[] }
  | { readonly type: "cancel"; readonly side: SideId; readonly actor: number; readonly reason: "ko" | "aturdido"; readonly refund: number }
  | { readonly type: "lost"; readonly side: SideId; readonly actor: number }
  | { readonly type: "damage"; readonly side: SideId; readonly pos: number; readonly amount: number; readonly absorbed: number; readonly hp: number; readonly condition: boolean }
  | { readonly type: "drain"; readonly side: SideId; readonly pos: number; readonly amount: number; readonly hp: number }
  | { readonly type: "status"; readonly side: SideId; readonly pos: number; readonly status: StatusId; readonly turns: number; readonly value: number }
  | { readonly type: "immune"; readonly side: SideId; readonly pos: number; readonly status: StatusId }
  | { readonly type: "heal"; readonly side: SideId; readonly pos: number; readonly amount: number; readonly hp: number; readonly condition: boolean }
  | { readonly type: "shield"; readonly side: SideId; readonly pos: number; readonly amount: number; readonly total: number; readonly condition: boolean }
  | { readonly type: "energy"; readonly side: SideId; readonly amount: number; readonly energy: number }
  /** variantes v0.3 V4 — `pos` provoca durante `turns` finales de turno. */
  | { readonly type: "taunt"; readonly side: SideId; readonly pos: number; readonly turns: number }
  | { readonly type: "ko"; readonly side: SideId; readonly pos: number }
  | { readonly type: "burn"; readonly side: SideId; readonly pos: number; readonly amount: number; readonly hp: number }
  | { readonly type: "regen"; readonly side: SideId; readonly pos: number; readonly amount: number; readonly hp: number }
  | { readonly type: "expire"; readonly side: SideId; readonly pos: number; readonly status: StatusId }
  | { readonly type: "end"; readonly result: BattleResult };

export interface TurnResult {
  readonly state: BattleState;
  readonly events: readonly BattleEvent[];
}

// ---------------------------------------------------------------- utilidades

export function sideIndex(side: SideId): 0 | 1 {
  if (side !== "A" && side !== "B") throw new RangeError(`bando inválido '${String(side)}'`);
  return side === "A" ? 0 : 1;
}

/** Movimiento de la acción (null = golpe básico). */
export function actionMove(c: Combatant, move: number): Move | null {
  return move === 0 ? null : (c.moves[move - 1] ?? null);
}

/** Coste de energía de una acción (golpe básico: `dano.golpe_basico.coste`). */
export function actionCost(c: Combatant, move: number, cfg: CombatConfig): number {
  const m = actionMove(c, move);
  return m ? m.cost : cfg.damage.basicCost;
}

/** combate §2: fila de una posición (delantera 1–2, trasera 3–4). */
export function rowOf(pos: number, cfg: CombatConfig): readonly number[] {
  return cfg.frontRow.includes(pos) ? cfg.frontRow : cfg.backRow;
}

/**
 * combate §2 — objetivos válidos (posiciones 1–4, ascendentes) para un
 * movimiento (null = golpe básico) contra el bando `targets`, dado quién
 * está vivo (`alive[i]` para la posición i + 1).
 */
export function validTargetPositions(move: Move | null, alive: readonly boolean[], cfg: CombatConfig): number[] {
  const all = [1, 2, 3, 4].filter((p) => alive[p - 1]);
  if (move && (move.target === "aliado" || move.modifier === "alcance")) return all;
  const front = cfg.frontRow.filter((p) => alive[p - 1]);
  return front.length > 0 ? front : cfg.backRow.filter((p) => alive[p - 1]);
}

/** ¿Puede la criatura elegir acción este turno? (viva y no aturdida) */
export function canAct(state: BattleState, side: 0 | 1, idx: number): boolean {
  const f = state.fighters[side][idx] as FighterState;
  return !f.ko && f.skipTurn !== state.turn;
}

/** Posiciones (1–4) que deben recibir acción en el plan de `side`. */
export function eligibleActors(state: BattleState, side: SideId): number[] {
  const s = sideIndex(side);
  return [1, 2, 3, 4].filter((p) => canAct(state, s, p - 1));
}

function aliveMask(fs: readonly { readonly ko: boolean }[]): boolean[] {
  return fs.map((f) => !f.ko);
}

// ---------------------------------------------------------------- variantes v0.3

/** variantes v0.3 V2 — movimientos (1–4) de la criatura `pos` que están en descanso este turno. */
export function restingMoves(state: BattleState, side: SideId, pos: number): number[] {
  const rest = (state.fighters[sideIndex(side)][pos - 1] as FighterState).rest;
  const out: number[] = [];
  if (rest) rest.forEach((n, k) => { if (n > 0) out.push(k + 1); });
  return out;
}

/** variantes v0.3 V1 — efecto del golpe básico de un combatiente (híbridas: el de su componente configurada). */
export function basicEffectOf(c: Combatant, cfg: BattleConfig): BasicEffect | null {
  const be = cfg.combat.variants.basicEffect;
  if (!be.active) return null;
  const own = be.effects[c.family];
  if (own) return own;
  const h = cfg.moves.genetics.hybridById.get(c.family);
  return (h ? be.effects[h.components[be.hybridComponent]] : undefined) ?? null;
}

/** variantes v0.3 V4 — carril de una posición: 0 izquierda (1 y 3), 1 derecha (2 y 4). */
export function laneOf(pos: number): 0 | 1 {
  return ((pos - 1) % 2) as 0 | 1;
}

/**
 * variantes v0.3 V4 — orden de preferencia de objetivos enemigos para el actor
 * en `actorPos`: delantera de su carril, la otra delantera, trasera de su
 * carril, la otra trasera. Con `backFirst` (`alcance`), primero las traseras.
 */
export function laneOrder(actorPos: number, backFirst: boolean, cfg: CombatConfig): number[] {
  const lane = laneOf(actorPos);
  const front = [cfg.frontRow[lane] as number, cfg.frontRow[1 - lane] as number];
  const back = [cfg.backRow[lane] as number, cfg.backRow[1 - lane] as number];
  return backFirst ? [...back, ...front] : [...front, ...back];
}

/** Vista del bando objetivo para decidir objetivos (estado real o simulación de la IA). */
export interface TargetView {
  readonly alive: readonly boolean[];
  readonly hp: readonly number[];
  /** Criaturas que están provocando (solo cuenta para ataques enemigos de un objetivo). */
  readonly taunting: readonly boolean[];
}

/**
 * variantes v0.3 V4 — objetivo automático (posición 1–4, o undefined si no hay
 * ninguno) del movimiento `m` (null = golpe básico) usado por `actorPos`.
 * `targetTeam`/`view` son del bando objetivo (el propio en movimientos de aliado).
 * - Enemigo: `laneOrder`; si es de un solo objetivo y hay enemigos provocando, solo entre ellos.
 * - Cura: aliado con menor vida/máx. Escudo: delantero con menos vida; sin delanteros,
 *   el aliado con menos vida. Empates: menor posición. Con provocar y
 *   `escudo_provocar_al_usuario`, el escudo va al usuario.
 */
export function autoTargetPosition(m: Move | null, actorPos: number, targetTeam: readonly Combatant[], view: TargetView, cfg: CombatConfig): number | undefined {
  const alive = [1, 2, 3, 4].filter((p) => view.alive[p - 1]);
  if (alive.length === 0) return undefined;
  if (m && m.target === "aliado") {
    if (m.taunt && m.scalable === "escudo" && cfg.variants.autoTarget.tauntShieldsSelf && view.alive[actorPos - 1]) return actorPos;
    if (m.scalable === "cura") {
      let best = alive[0] as number;
      for (const p of alive) {
        // vida/máx sin dividir: hp_p · máx_best < hp_best · máx_p
        if ((view.hp[p - 1] as number) * (targetTeam[best - 1] as Combatant).maxHp < (view.hp[best - 1] as number) * (targetTeam[p - 1] as Combatant).maxHp) best = p;
      }
      return best;
    }
    const front = cfg.frontRow.filter((p) => view.alive[p - 1]);
    const pool = front.length > 0 ? front : alive;
    let best = pool[0] as number;
    for (const p of pool) if ((view.hp[p - 1] as number) < (view.hp[best - 1] as number)) best = p;
    return best;
  }
  const order = laneOrder(actorPos, m !== null && m.modifier === "alcance", cfg);
  if (!(m && m.area)) {
    const taunter = order.find((p) => view.alive[p - 1] && view.taunting[p - 1]);
    if (taunter !== undefined) return taunter;
  }
  return order.find((p) => view.alive[p - 1]);
}

/**
 * variantes v0.3 V4 — objetivo que tendría AHORA la acción (para la interfaz y
 * la IA). El motor lo decide al ejecutar, así que puede cambiar si alguien cae
 * antes o un enemigo provoca. Devuelve null si no hay objetivo.
 */
export function autoTarget(state: BattleState, side: SideId, actor: number, move: number, cfg: BattleConfig): number | null {
  const s = sideIndex(side);
  const m = actionMove(state.teams[s][actor - 1] as Combatant, move);
  const tSide = m && m.target === "aliado" ? s : ((1 - s) as 0 | 1);
  const fs = state.fighters[tSide];
  return autoTargetPosition(m, actor, state.teams[tSide], { alive: aliveMask(fs), hp: fs.map((f) => f.hp), taunting: fs.map((f) => !f.ko && (f.taunt ?? 0) > 0) }, cfg.combat) ?? null;
}

/**
 * combate §7 — bonus de sinergia por posición (0 para quien usa golpe o no
 * actúa) y si cada criatura tiene compañero de grupo (condición combo_familia).
 */
export function planSynergy(team: readonly Combatant[], plan: Plan, cfg: CombatConfig): { bonus: number[]; combo: boolean[] } {
  const users = plan.filter((a) => a.move !== 0);
  const count = new Map<string, number>();
  for (const a of users) for (const g of (team[a.actor - 1] as Combatant).groups) count.set(g, (count.get(g) ?? 0) + 1);
  const bonus = [0, 0, 0, 0];
  const combo = [false, false, false, false];
  for (const a of users) {
    let best = 0;
    for (const g of (team[a.actor - 1] as Combatant).groups) best = Math.max(best, count.get(g) as number);
    bonus[a.actor - 1] = cfg.synergy.bonusByCount[best] as number;
    combo[a.actor - 1] = best >= 2;
  }
  return { bonus, combo };
}

/**
 * combate §3.2 — valida un plan. Devuelve null si es válido o el motivo.
 * Válido: una acción por criatura viva no aturdida (ni más ni menos),
 * movimiento existente, objetivo válido ahora y Σcoste ≤ energía.
 * variantes v0.3: con objetivo automático (V4) no se mira `target`; con
 * descanso (V2) un movimiento en descanso invalida el plan.
 */
export function validatePlan(state: BattleState, side: SideId, plan: Plan, cfg: BattleConfig): string | null {
  const s = sideIndex(side);
  if (state.result !== null) return "la partida ha terminado";
  if (!Array.isArray(plan)) return "el plan no es una lista";
  const team = state.teams[s];
  const eligible = eligibleActors(state, side);
  const seen = new Set<number>();
  let cost = 0;
  for (const a of plan) {
    if (typeof a !== "object" || a === null) return "acción mal formada";
    const { actor, move, target } = a;
    if (!Number.isInteger(actor) || actor < 1 || actor > 4) return `actor inválido ${actor}`;
    if (seen.has(actor)) return `actor ${actor} repetido`;
    seen.add(actor);
    if (!eligible.includes(actor)) return `la criatura ${actor} no puede actuar (KO o aturdida)`;
    const c = team[actor - 1] as Combatant;
    if (!Number.isInteger(move) || move < 0 || move > c.moves.length) return `movimiento inválido ${move} (actor ${actor})`;
    const m = actionMove(c, move);
    const tSide = m && m.target === "aliado" ? s : ((1 - s) as 0 | 1);
    if (!cfg.combat.variants.autoTarget.active) {
      const valid = validTargetPositions(m, aliveMask(state.fighters[tSide]), cfg.combat);
      if (!Number.isInteger(target) || !valid.includes(target)) return `objetivo inválido ${target} (actor ${actor})`;
    }
    // variantes v0.3 V2: el movimiento usado no se puede repetir mientras descansa
    if (move !== 0 && cfg.combat.variants.rest.active && (((state.fighters[s][actor - 1] as FighterState).rest ?? [])[move - 1] ?? 0) > 0) {
      return `movimiento ${move} en descanso (actor ${actor})`;
    }
    cost += actionCost(c, move, cfg.combat);
  }
  if (seen.size !== eligible.length) return "falta la acción de alguna criatura";
  if (cost > state.energy[s]) return `energía insuficiente (${cost} > ${state.energy[s]})`;
  return null;
}

/** combate §3.2 — plan de respaldo: golpe básico contra el primer objetivo válido. */
export function fallbackPlan(state: BattleState, side: SideId, cfg: CombatConfig): Action[] {
  const s = sideIndex(side);
  // variantes v0.3 V4: sin objetivo (0)
  if (cfg.variants.autoTarget.active) return eligibleActors(state, side).map((actor) => ({ actor, move: 0, target: 0 }));
  const valid = validTargetPositions(null, aliveMask(state.fighters[1 - s] as readonly FighterState[]), cfg);
  return eligibleActors(state, side).map((actor) => ({ actor, move: 0, target: valid[0] ?? 1 }));
}

/** Estado inicial (turno 1, energía inicial, vida al máximo). */
export function createBattle(teamA: readonly Combatant[], teamB: readonly Combatant[], cfg: BattleConfig): BattleState {
  const n = cfg.combat.teamSize;
  if (teamA.length !== n || teamB.length !== n) throw new RangeError(`createBattle: cada equipo debe tener ${n} criaturas`);
  const fresh = (c: Combatant): FighterState => ({ hp: c.maxHp, ko: false, statuses: [], skipTurn: 0, stunImmuneUntil: 0 });
  return {
    turn: 1,
    energy: [cfg.combat.energy.initial, cfg.combat.energy.initial], // combate §3.1: t = 1 → inicial
    teams: [Object.freeze(teamA.slice()), Object.freeze(teamB.slice())],
    fighters: [teamA.map(fresh), teamB.map(fresh)],
    result: null,
  };
}

// ---------------------------------------------------------------- resolución

interface Work {
  hp: number;
  ko: boolean;
  statuses: { id: StatusId; turns: number; value: number }[];
  skipTurn: number;
  stunImmuneUntil: number;
  /** Transitorios del turno. */
  acted: boolean;
  stunnedNow: boolean;
  hasAction: boolean;
  /** variantes v0.3: descanso por movimiento, provocar y movimiento ejecutado este turno (0 = ninguno). */
  rest: number[];
  taunt: number;
  usedSlot: number;
}

interface Entry {
  side: 0 | 1;
  idx: number;
  action: Action;
  move: Move | null;
  cost: number;
  priority: number;
  initiative: number;
}

function getStatus(w: Work, id: StatusId): { id: StatusId; turns: number; value: number } | undefined {
  return w.statuses.find((s) => s.id === id);
}
function putStatus(w: Work, id: StatusId, turns: number, value: number): void {
  const cur = getStatus(w, id);
  if (cur) {
    cur.turns = turns;
    cur.value = value;
    return;
  }
  w.statuses.push({ id, turns, value });
  w.statuses.sort((a, b) => STATUS_IDS.indexOf(a.id) - STATUS_IDS.indexOf(b.id));
}
function hasNegative(w: Work, cfg: CombatConfig): boolean {
  return w.statuses.some((s) => cfg.statuses[s.id].kind === "negativo");
}

/**
 * combate §4 [v0.2] — nivel de prioridad: 1 con `prioridad`; los movimientos
 * de aliado, `orden.prioridad_movimientos_aliado`; el resto (y el golpe), 0.
 */
export function actionPriority(m: Move | null, cfg: CombatConfig): number {
  const levels = cfg.order.priorityLevels;
  let p = levels[0];
  if (m && m.modifier === "prioridad") p = levels[1];
  if (m && m.target === "aliado") p = Math.max(p, cfg.order.allyPriority);
  return p;
}

/** combate §5 — desgaste del turno t. */
export function wearFactor(turn: number, cfg: CombatConfig): number {
  return 1 + cfg.wear.perTurn * Math.max(0, turn - cfg.wear.fromTurn);
}

/**
 * combate §5 — daño de una acción contra un objetivo (antes de escudos).
 * `pot` ya incluye condición y sinergia; `variance` es el factor var.
 */
export function damageAmount(
  pot: number,
  attack: number,
  family: string,
  targetFamily: string,
  marked: boolean,
  weakened: boolean,
  variance: number,
  turn: number,
  cfg: CombatConfig,
): number {
  const fam = (cfg.families.table[family] as Readonly<Record<string, number>>)[targetFamily] as number;
  const marca = marked ? cfg.statuses.marca.value : 1;
  const deb = weakened ? cfg.statuses.debilitar.value : 1;
  const d = Math.round(pot * attack * fam * marca * deb * variance * wearFactor(turn, cfg));
  return pot > 0 ? Math.max(cfg.damage.min, d) : d; // combate §5 mínimo 1 si pot > 0
}

/**
 * combate §3 — resuelve un turno completo con elección simultánea.
 * Planes inválidos ⇒ golpe básico de todas contra el primer objetivo
 * válido (sin tiradas extra). Consume exactamente 24 tiradas.
 */
export function resolveTurn(state: BattleState, planA: Plan, planB: Plan, rng: Rng, cfg: BattleConfig): TurnResult {
  const C = cfg.combat;
  const M = cfg.moves;
  const V = C.variants;
  if (state.result !== null) throw new RangeError("resolveTurn: la partida ya ha terminado");
  const t = state.turn;
  const events: BattleEvent[] = [];
  const energy: [number, number] = [state.energy[0], state.energy[1]];
  events.push({ type: "turn", turn: t, energy: [energy[0], energy[1]] });

  const W: [Work[], Work[]] = [0, 1].map((s) =>
    state.fighters[s as 0 | 1].map((f, i) => ({
      hp: f.hp,
      ko: f.ko,
      statuses: f.statuses.map((x) => ({ ...x })),
      skipTurn: f.skipTurn,
      stunImmuneUntil: f.stunImmuneUntil,
      acted: false,
      stunnedNow: false,
      hasAction: false,
      rest: (state.teams[s as 0 | 1][i] as Combatant).moves.map((_, k) => (f.rest ? (f.rest[k] ?? 0) : 0)),
      taunt: f.taunt ?? 0,
      usedSlot: 0,
    })),
  ) as [Work[], Work[]];

  // 2–3. validación, pago y sinergia
  const plans: [Plan, Plan] = [planA, planB];
  const synergy: { bonus: number[]; combo: boolean[] }[] = [];
  const afterPay: number[] = [];
  for (const s of [0, 1] as const) {
    const side = SIDE_IDS[s];
    const reason = validatePlan(state, side, plans[s], cfg);
    // variantes v0.3 V4: el objetivo del plan se ignora y se normaliza a 0
    const plan: Plan = reason === null ? plans[s].map((a) => ({ actor: a.actor, move: a.move, target: V.autoTarget.active ? 0 : a.target })) : fallbackPlan(state, side, C);
    plans[s] = plan;
    let cost = 0;
    for (const a of plan) cost += actionCost(state.teams[s][a.actor - 1] as Combatant, a.move, C);
    energy[s] -= cost;
    afterPay[s] = energy[s];
    synergy[s] = planSynergy(state.teams[s], plan, C);
    events.push({ type: "plan", side, valid: reason === null, reason, actions: plan, cost, energy: energy[s], synergy: (synergy[s] as { bonus: number[] }).bonus.slice() });
  }

  // 4. tiradas del turno (combate §11): 8 de jitter y 16 de varianza, por posición
  const jitterU: number[] = [];
  for (let i = 0; i < C.draws.jitterPerTurn; i++) jitterU.push(rng.next());
  const varU: number[] = [];
  for (let i = 0; i < 2 * C.teamSize * C.draws.variancePerAction; i++) varU.push(rng.next());

  // 5. orden (combate §4)
  const entries: Entry[] = [];
  for (const s of [0, 1] as const) {
    for (const a of plans[s]) {
      const idx = a.actor - 1;
      const c = state.teams[s][idx] as Combatant;
      const m = actionMove(c, a.move);
      const w = W[s][idx] as Work;
      w.hasAction = true;
      let ini = c.initiative;
      const pr = getStatus(w, "prisa");
      const sl = getStatus(w, "ralentizar");
      if (pr) ini += C.statuses.prisa.value;
      if (sl) ini += C.statuses.ralentizar.value;
      ini += C.order.jitter * (2 * (jitterU[s * C.teamSize + idx] as number) - 1);
      entries.push({
        side: s,
        idx,
        action: a,
        move: m,
        cost: actionCost(c, a.move, C),
        priority: actionPriority(m, C),
        initiative: ini,
      });
    }
  }
  const favored = t % 2 === 1 ? 0 : 1; // A en impares, B en pares
  entries.sort(
    (x, y) =>
      y.priority - x.priority ||
      y.initiative - x.initiative ||
      (x.side === y.side ? 0 : x.side === favored ? -1 : 1) ||
      x.idx - y.idx ||
      x.side - y.side,
  );
  events.push({ type: "order", queue: entries.map((e) => ({ side: SIDE_IDS[e.side], actor: e.idx + 1, priority: e.priority, initiative: e.initiative })) });

  const knockOut = (s: 0 | 1, i: number): void => {
    const w = W[s][i] as Work;
    w.hp = 0;
    w.ko = true;
    w.statuses = [];
    w.taunt = 0;
    events.push({ type: "ko", side: SIDE_IDS[s], pos: i + 1 });
  };

  const applyStatus = (s: 0 | 1, i: number, id: StatusId): void => {
    const w = W[s][i] as Work;
    const rule = C.statuses[id];
    const cur = getStatus(w, id);
    if (id === "quemadura") {
      // combate §8: +1 pila (máx.) y reinicia duración
      putStatus(w, id, rule.duration, Math.min(rule.maxStacks, (cur ? cur.value : 0) + 1));
    } else if (id === "aturdir") {
      if (cur) putStatus(w, id, rule.duration, 0); // refresca (mismo turno: sin más efecto)
      else if (w.stunImmuneUntil >= t) {
        events.push({ type: "immune", side: SIDE_IDS[s], pos: i + 1, status: id });
        return;
      } else {
        putStatus(w, id, rule.duration, 0);
        // combate §8: si no ha actuado, pierde la acción; si ya actuó, el turno siguiente
        if (!w.acted && w.hasAction) w.stunnedNow = true;
        else w.skipTurn = t + 1;
        w.stunImmuneUntil = t + rule.duration - 1 + rule.value;
      }
    } else {
      putStatus(w, id, rule.duration, 0); // refresca
    }
    const now = getStatus(w, id) as { turns: number; value: number };
    events.push({ type: "status", side: SIDE_IDS[s], pos: i + 1, status: id, turns: now.turns, value: now.value });
  };

  // condiciones (movimientos §2.5), evaluadas al ejecutar
  const condMet = (e: Entry, tSide: 0 | 1, tIdx: number): boolean => {
    const m = e.move;
    if (!m || !m.condition) return false;
    const me = W[e.side][e.idx] as Work;
    const c = state.teams[e.side][e.idx] as Combatant;
    switch (m.condition) {
      case "objetivo_con_estado":
        return hasNegative(W[tSide][tIdx] as Work, C);
      case "vida_baja":
        return me.hp < M.conditions.lowHpThreshold * c.maxHp;
      case "combo_familia":
        return (synergy[e.side] as { combo: boolean[] }).combo[e.idx] as boolean;
      case "reserva":
        return (afterPay[e.side] as number) >= M.conditions.reserveThreshold;
      case "antes_que_objetivo":
        return !(W[tSide][tIdx] as Work).acted;
    }
  };

  for (const e of entries) {
    const side = SIDE_IDS[e.side];
    const me = W[e.side][e.idx] as Work;
    const c = state.teams[e.side][e.idx] as Combatant;
    // combate §3.5: KO o aturdido antes de actuar ⇒ cancelada y se devuelve el coste
    if (me.ko || me.stunnedNow) {
      energy[e.side] = Math.min(C.energy.max, energy[e.side] + e.cost);
      events.push({ type: "cancel", side, actor: e.idx + 1, reason: me.ko ? "ko" : "aturdido", refund: e.cost });
      continue;
    }
    me.acted = true;
    const m = e.move;
    if (m) me.usedSlot = e.action.move; // variantes v0.3 V2: ejecutado (aunque se pierda) ⇒ descansa
    const tSide: 0 | 1 = m && m.target === "aliado" ? e.side : ((1 - e.side) as 0 | 1);
    const taunting = W[tSide].map((w) => !w.ko && w.taunt > 0);
    let tPos: number | undefined;
    if (V.autoTarget.active) {
      // variantes v0.3 V4: objetivo automático, decidido al ejecutar
      tPos = autoTargetPosition(m, e.idx + 1, state.teams[tSide], { alive: aliveMask(W[tSide]), hp: W[tSide].map((w) => w.hp), taunting }, C);
    } else {
      // combate §2: reobjetivo a la primera válida por posición ascendente
      const valid = validTargetPositions(m, aliveMask(W[tSide]), C);
      tPos = valid.includes(e.action.target) ? e.action.target : valid[0];
      // variantes v0.3 (provocar con objetivo manual): un ataque enemigo de un solo objetivo se desvía a quien provoca
      if (tPos !== undefined && tSide !== e.side && !(m && m.area) && !taunting[tPos - 1]) {
        const taunter = laneOrder(e.idx + 1, false, C).find((p) => taunting[p - 1]);
        if (taunter !== undefined) tPos = taunter;
      }
    }
    if (tPos === undefined) {
      events.push({ type: "lost", side, actor: e.idx + 1 });
      continue;
    }
    const row = rowOf(tPos, C);
    const targets = m && m.area ? row.filter((p) => !(W[tSide][p - 1] as Work).ko) : [tPos];
    events.push({ type: "action", side, actor: e.idx + 1, move: e.action.move, moveId: m ? m.id : null, targetSide: SIDE_IDS[tSide], targets });
    const syn = m ? 1 + ((synergy[e.side] as { bonus: number[] }).bonus[e.idx] as number) : 1;
    const basePower = m ? m.power : C.damage.basicPower;
    const potFor = (tIdx: number): { pot: number; met: boolean } => {
      const met = condMet(e, tSide, tIdx);
      return { pot: basePower * (met ? 1 + M.conditions.bonus : 1) * syn, met };
    };

    // daño → drenaje
    if (!m || m.scalable === "dano") {
      let toHp = 0;
      for (const p of targets) {
        const tw = W[tSide][p - 1] as Work;
        if (tw.ko) continue;
        const tc = state.teams[tSide][p - 1] as Combatant;
        const { pot, met } = potFor(p - 1);
        // combate §5/§11: tiradas de varianza de la posición del actor; en área, por orden de posición en la fila
        const k = m && m.area ? row.indexOf(p) : 0;
        const u = varU[(e.side * C.teamSize + e.idx) * C.draws.variancePerAction + k] as number;
        const variance = 1 - C.damage.variance + 2 * C.damage.variance * u;
        const dmg = damageAmount(pot, c.attack, m ? m.family : c.family, tc.family, !!getStatus(tw, "marca"), !!getStatus(me, "debilitar"), variance, t, C);
        let rest = dmg;
        let absorbed = 0;
        const sh = getStatus(tw, "escudo");
        if (sh && !(m && m.modifier === "perforar")) {
          absorbed = Math.min(sh.value, rest);
          sh.value -= absorbed;
          rest -= absorbed;
          if (sh.value <= 0) tw.statuses = tw.statuses.filter((x) => x.id !== "escudo");
        }
        const lost = Math.min(rest, tw.hp);
        toHp += lost;
        tw.hp -= lost;
        events.push({ type: "damage", side: SIDE_IDS[tSide], pos: p, amount: dmg, absorbed, hp: tw.hp, condition: met });
        if (tw.hp <= 0) knockOut(tSide, p - 1);
      }
      if (m && m.modifier === "drenaje" && !me.ko) {
        const heal = Math.min(Math.round(M.modifiers.drainFraction * toHp), c.maxHp - me.hp);
        me.hp += heal;
        events.push({ type: "drain", side, pos: e.idx + 1, amount: heal, hp: me.hp });
      }
    }
    if (!m) {
      // variantes v0.3 V1: efecto menor del golpe básico según la familia base
      const fx = basicEffectOf(c, cfg);
      if (fx && fx.kind === "estado") {
        // probabilidad con la 2.ª tirada de varianza de la posición (el golpe solo gasta la 1.ª)
        const u = varU[(e.side * C.teamSize + e.idx) * C.draws.variancePerAction + 1] as number;
        if (u < fx.chance) {
          if (fx.status === "prisa" || fx.status === "regenerar") applyStatus(e.side, e.idx, fx.status);
          else if (!(W[tSide][tPos - 1] as Work).ko) applyStatus(tSide, tPos - 1, fx.status);
        }
      } else if (fx && fx.kind === "cura") {
        const heal = Math.min(fx.amount, c.maxHp - me.hp);
        me.hp += heal;
        events.push({ type: "heal", side, pos: e.idx + 1, amount: heal, hp: me.hp, condition: false });
      } else if (fx && fx.kind === "escudo") {
        const cur = getStatus(me, "escudo");
        const total = Math.min(C.statuses.escudo.value, (cur ? cur.value : 0) + fx.amount);
        putStatus(me, "escudo", C.statuses.escudo.duration, total);
        events.push({ type: "shield", side, pos: e.idx + 1, amount: fx.amount, total, condition: false });
      }
      continue;
    }
    // estado
    if (m.status === "prisa") {
      if (!me.ko) applyStatus(e.side, e.idx, "prisa"); // movimientos §2.2: prisa al usuario
    } else if (m.status) {
      for (const p of targets) if (!(W[tSide][p - 1] as Work).ko) applyStatus(tSide, p - 1, m.status);
    }
    // escudo / cura
    if (m.scalable === "cura" || m.scalable === "escudo") {
      for (const p of targets) {
        const tw = W[tSide][p - 1] as Work;
        if (tw.ko) continue;
        const { pot, met } = potFor(p - 1);
        const amount = Math.round(pot);
        if (m.scalable === "cura") {
          const tc = state.teams[tSide][p - 1] as Combatant;
          const heal = Math.min(amount, tc.maxHp - tw.hp);
          tw.hp += heal;
          events.push({ type: "heal", side: SIDE_IDS[tSide], pos: p, amount: heal, hp: tw.hp, condition: met });
        } else {
          const cur = getStatus(tw, "escudo");
          const total = Math.min(C.statuses.escudo.value, (cur ? cur.value : 0) + amount);
          putStatus(tw, "escudo", C.statuses.escudo.duration, total);
          events.push({ type: "shield", side: SIDE_IDS[tSide], pos: p, amount, total, condition: met });
        }
      }
    }
    // variantes v0.3 V4: provocar (al usuario)
    if (m.taunt && !me.ko) {
      me.taunt = V.taunt.duration;
      events.push({ type: "taunt", side, pos: e.idx + 1, turns: me.taunt });
    }
    // energía extra (movimientos §2.3)
    if (m.extraEnergy) {
      energy[e.side] = Math.min(C.energy.max, energy[e.side] + M.extraEnergy.amount);
      events.push({ type: "energy", side, amount: M.extraEnergy.amount, energy: energy[e.side] });
    }
  }

  // 6. fin de turno: A1…A4, B1…B4 — quemadura, regeneración, KO, duración −1
  for (const s of [0, 1] as const) {
    for (let i = 0; i < C.teamSize; i++) {
      const w = W[s][i] as Work;
      if (w.ko) continue;
      const c = state.teams[s][i] as Combatant;
      const burn = getStatus(w, "quemadura");
      if (burn) {
        const amount = burn.value * C.statuses.quemadura.value;
        w.hp -= amount;
        events.push({ type: "burn", side: SIDE_IDS[s], pos: i + 1, amount, hp: w.hp });
      }
      if (getStatus(w, "regenerar")) {
        const amount = Math.max(0, Math.min(C.statuses.regenerar.value, c.maxHp - w.hp));
        w.hp += amount;
        events.push({ type: "regen", side: SIDE_IDS[s], pos: i + 1, amount, hp: w.hp });
      }
      if (w.hp <= 0) {
        knockOut(s, i);
        continue;
      }
      for (const st of w.statuses) st.turns -= 1;
      for (const st of w.statuses) if (st.turns <= 0) events.push({ type: "expire", side: SIDE_IDS[s], pos: i + 1, status: st.id });
      w.statuses = w.statuses.filter((st) => st.turns > 0);
    }
  }

  // variantes v0.3: fin de turno de provocar (duración −1) y de los descansos (V2)
  for (const s of [0, 1] as const) {
    for (const w of W[s]) {
      if (w.taunt > 0) w.taunt -= 1;
      if (!V.rest.active) continue;
      for (let k = 0; k < w.rest.length; k++) if ((w.rest[k] as number) > 0) w.rest[k] = (w.rest[k] as number) - 1;
      if (w.usedSlot > 0) w.rest[w.usedSlot - 1] = V.rest.turns;
    }
  }

  // 7. victoria / empate (combate §9)
  const aliveA = W[0].some((w) => !w.ko);
  const aliveB = W[1].some((w) => !w.ko);
  let result: BattleResult | null = null;
  if (!aliveA && !aliveB) result = "empate";
  else if (!aliveB) result = "A";
  else if (!aliveA) result = "B";
  else if (t >= C.maxTurns) result = "empate";
  if (result !== null) events.push({ type: "end", result });

  const freeze = (ws: Work[]): FighterState[] =>
    ws.map((w) => ({
      hp: w.hp,
      ko: w.ko,
      statuses: w.statuses.map((x) => ({ id: x.id, turns: x.turns, value: x.value })),
      skipTurn: w.skipTurn,
      stunImmuneUntil: w.stunImmuneUntil,
      // variantes v0.3: campos solo presentes con la variante en uso (sin ellas, el estado es idéntico al de v0.2)
      ...(V.rest.active ? { rest: w.rest.slice() } : {}),
      ...(w.taunt > 0 ? { taunt: w.taunt } : {}),
    }));
  const next: BattleState = {
    turn: result === null ? t + 1 : t,
    // combate §3.1: e = min(máx, e + por_turno) al empezar el turno siguiente
    energy: result === null ? [Math.min(C.energy.max, energy[0] + C.energy.perTurn), Math.min(C.energy.max, energy[1] + C.energy.perTurn)] : energy,
    teams: state.teams,
    fighters: [freeze(W[0]), freeze(W[1])],
    result,
  };
  return { state: next, events };
}

/** combate §11 — hash canónico de un registro (cyrb128 del JSON, en hex). */
export function battleHash(log: unknown): string {
  return cyrb128(JSON.stringify(log))
    .map((w) => w.toString(16).padStart(8, "0"))
    .join("");
}
