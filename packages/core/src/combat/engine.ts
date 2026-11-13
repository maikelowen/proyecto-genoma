/**
 * Motor de combate v0.4 (spec docs/spec/combate-v0.4.md sobre combate-v0.2.md
 * y variantes v0.3). Con una config v0.2 reproduce v0.2.1 + variantes v0.3.
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
import { referencePlacement, validatePlacement, type Placement } from "./placement.ts";

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
  /**
   * Casillas 1–4 de cada bando (índice = casilla − 1). combate v0.4 §1: con equipos
   * de 3, una casilla es `null` (vacía); su `FighterState` es `ko: true` con vida 0
   * y nunca emite eventos.
   */
  readonly teams: readonly [readonly (Combatant | null)[], readonly (Combatant | null)[]];
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

/** combate v0.4 §2 — hueco (1–4) del movimiento gratis (coste 0) de un alma, o 0 si no tiene. */
export function freeMoveSlot(c: Combatant): number {
  return c.moves.findIndex((m) => m.cost === 0) + 1;
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
  /** [v0.4] escudo actual (para el escudo automático a la fila expuesta); 0 si falta. */
  readonly shield?: readonly number[];
}

/** combate v0.4 §3 `filaAtacable`: casillas vivas de la delantera; si no hay, de la trasera. */
export function exposedRow(alive: readonly boolean[], cfg: CombatConfig): number[] {
  const front = cfg.frontRow.filter((p) => alive[p - 1]);
  return front.length > 0 ? front : cfg.backRow.filter((p) => alive[p - 1]);
}
/** combate v0.4 §3 `filaTrasera` (para `alcance`): casillas vivas de la trasera; si no hay, de la delantera. */
export function backRowFirst(alive: readonly boolean[], cfg: CombatConfig): number[] {
  const back = cfg.backRow.filter((p) => alive[p - 1]);
  return back.length > 0 ? back : cfg.frontRow.filter((p) => alive[p - 1]);
}
/** combate v0.4 §3 `elegirEn`: la del carril del actor; si no hay, la de menor casilla. */
function pickByLane(candidates: readonly number[], actorPos: number): number | undefined {
  return candidates.find((p) => laneOf(p) === laneOf(actorPos)) ?? candidates[0];
}

/**
 * Objetivo automático (variantes v0.3 V4 y combate v0.4 §3): casilla 1–4, o
 * undefined si no hay ninguno, del movimiento `m` (null = golpe básico) usado
 * por `actorPos`. `targetTeam`/`view` son del bando objetivo (el propio en
 * movimientos de aliado). En área, la casilla devuelta es el "ancla": la acción
 * afecta a las vivas de su fila (`rowOf`).
 * - Enemigo, v0.4 (`prioridad_fila`): provocadores (carril del actor; si no, menor
 *   casilla) salvo en área; si no, `elegirEnFila` en la fila atacable (o la trasera
 *   con `alcance`). v0.3: `laneOrder`.
 * - Cura: menor vida/máx (sin dividir); si todos están llenos y
 *   `cura_si_todos_llenos` = usuario, el usuario. Escudo: con `escudo_fila_expuesta`,
 *   la fila propia expuesta con menos vida + escudo; si no (v0.3), delantero con
 *   menos vida. Empates: menor casilla. Escudo con provocar: el usuario.
 *   v0.4: cura y escudo de área van a la fila propia expuesta.
 */
export function autoTargetPosition(m: Move | null, actorPos: number, targetTeam: readonly (Combatant | null)[], view: TargetView, cfg: CombatConfig): number | undefined {
  const alive = [1, 2, 3, 4].filter((p) => view.alive[p - 1]);
  if (alive.length === 0) return undefined;
  const AT = cfg.variants.autoTarget;
  if (m && m.target === "aliado") {
    if (m.taunt && m.scalable === "escudo" && AT.tauntShieldsSelf && view.alive[actorPos - 1]) return actorPos;
    if (m.area && AT.rowPriority) return exposedRow(view.alive, cfg)[0]; // combate v0.4 §3.1: área a la fila expuesta
    if (m.scalable === "cura") {
      let best = alive[0] as number;
      for (const p of alive) {
        // vida/máx sin dividir: hp_p · máx_best < hp_best · máx_p
        if ((view.hp[p - 1] as number) * (targetTeam[best - 1] as Combatant).maxHp < (view.hp[best - 1] as number) * (targetTeam[p - 1] as Combatant).maxHp) best = p;
      }
      // combate v0.4 §3.1: si nadie la necesita, va al usuario (y no cura)
      if (AT.healIfAllFull === "usuario" && (view.hp[best - 1] as number) >= (targetTeam[best - 1] as Combatant).maxHp && view.alive[actorPos - 1]) return actorPos;
      return best;
    }
    if (AT.shieldExposedRow) {
      // combate v0.4 §3.1: fila propia expuesta, menor vida + escudo
      const total = (p: number): number => (view.hp[p - 1] as number) + (view.shield ? (view.shield[p - 1] as number) : 0);
      const pool = exposedRow(view.alive, cfg);
      let best = pool[0] as number;
      for (const p of pool) if (total(p) < total(best)) best = p;
      return best;
    }
    const front = cfg.frontRow.filter((p) => view.alive[p - 1]);
    const pool = front.length > 0 ? front : alive;
    let best = pool[0] as number;
    for (const p of pool) if ((view.hp[p - 1] as number) < (view.hp[best - 1] as number)) best = p;
    return best;
  }
  const reach = m !== null && m.modifier === "alcance";
  if (AT.rowPriority) {
    // combate v0.4 §3 objetivoUnico / objetivoArea
    if (!(m && m.area)) {
      const taunters = alive.filter((p) => view.taunting[p - 1]);
      if (taunters.length > 0) return pickByLane(taunters, actorPos);
    }
    return pickByLane(reach ? backRowFirst(view.alive, cfg) : exposedRow(view.alive, cfg), actorPos);
  }
  const order = laneOrder(actorPos, reach, cfg);
  if (!(m && m.area)) {
    const taunter = order.find((p) => view.alive[p - 1] && view.taunting[p - 1]);
    if (taunter !== undefined) return taunter;
  }
  return order.find((p) => view.alive[p - 1]);
}

function viewOf(fs: readonly FighterState[]): TargetView {
  return {
    alive: aliveMask(fs),
    hp: fs.map((f) => f.hp),
    taunting: fs.map((f) => !f.ko && (f.taunt ?? 0) > 0),
    shield: fs.map((f) => f.statuses.find((x) => x.id === "escudo")?.value ?? 0),
  };
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
  return autoTargetPosition(m, actor, state.teams[tSide], viewOf(state.fighters[tSide]), cfg.combat) ?? null;
}

/**
 * combate v0.4 §3 — previsión para la interfaz: a quién iría AHORA la acción
 * (bando y casillas; en área, todas las vivas de la fila). El motor lo decide al
 * ejecutar: puede cambiar si alguien cae antes o un enemigo provoca. null si no hay objetivo.
 */
export function forecastTargets(state: BattleState, side: SideId, actor: number, move: number, cfg: BattleConfig): { readonly side: SideId; readonly positions: readonly number[] } | null {
  const s = sideIndex(side);
  const m = actionMove(state.teams[s][actor - 1] as Combatant, move);
  const tSide = m && m.target === "aliado" ? s : ((1 - s) as 0 | 1);
  const anchor = autoTarget(state, side, actor, move, cfg);
  if (anchor === null) return null;
  const alive = aliveMask(state.fighters[tSide]);
  return { side: SIDE_IDS[tSide], positions: m && m.area ? rowOf(anchor, cfg.combat).filter((p) => alive[p - 1]) : [anchor] };
}

/**
 * combate v0.4 §3 — quién es atacable en el bando `side` ahora mismo:
 * `row` = fila atacable (golpes normales), `back` = lo que alcanza `alcance`,
 * `taunting` = almas que provocan (reciben todos los ataques de un objetivo).
 */
export function attackable(state: BattleState, side: SideId, cfg: BattleConfig): { readonly row: readonly number[]; readonly back: readonly number[]; readonly taunting: readonly number[] } {
  const v = viewOf(state.fighters[sideIndex(side)]);
  return {
    row: exposedRow(v.alive, cfg.combat),
    back: backRowFirst(v.alive, cfg.combat),
    taunting: [1, 2, 3, 4].filter((p) => v.taunting[p - 1]),
  };
}

/** combate v0.4 §1 — casillas ocupadas (1–4, ascendentes) y forma ("2+1" / "1+2") de un bando. */
export function placementOf(state: BattleState, side: SideId, cfg: BattleConfig): { readonly positions: readonly number[]; readonly shape: string } {
  const positions = [1, 2, 3, 4].filter((p) => state.teams[sideIndex(side)][p - 1] != null);
  const front = positions.filter((p) => cfg.combat.frontRow.includes(p)).length;
  return { positions, shape: `${front}+${positions.length - front}` };
}

/**
 * combate §7 — bonus de sinergia por posición (0 para quien usa golpe o no
 * actúa) y si cada criatura tiene compañero de grupo (condición combo_familia).
 */
export function planSynergy(team: readonly (Combatant | null)[], plan: Plan, cfg: CombatConfig): { bonus: number[]; combo: boolean[] } {
  // combate v0.4 §5: el gratis ni cuenta ni recibe bonus (`sinergia.cuenta_gratis` = false)
  const users = plan.filter((a) => a.move !== 0 && (cfg.synergy.countsFree || ((team[a.actor - 1] as Combatant).moves[a.move - 1] as Move).cost !== 0));
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
    // combate v0.4 §2: sin golpe básico, el movimiento 0 no existe
    if (!Number.isInteger(move) || move < (cfg.combat.damage.basicActive ? 0 : 1) || move > c.moves.length) return `movimiento inválido ${move} (actor ${actor})`;
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

/**
 * combate §3.2 — plan de respaldo: golpe básico contra el primer objetivo válido.
 * combate v0.4 §2: sin golpe básico, todas usan su movimiento gratis.
 */
export function fallbackPlan(state: BattleState, side: SideId, cfg: CombatConfig): Action[] {
  const s = sideIndex(side);
  if (!cfg.damage.basicActive) {
    return eligibleActors(state, side).map((actor) => {
      const c = state.teams[s][actor - 1] as Combatant;
      const move = freeMoveSlot(c);
      if (cfg.variants.autoTarget.active) return { actor, move, target: 0 };
      const m = actionMove(c, move);
      const tSide = m && m.target === "aliado" ? s : 1 - s;
      return { actor, move, target: validTargetPositions(m, aliveMask(state.fighters[tSide] as readonly FighterState[]), cfg)[0] ?? 1 };
    });
  }
  // variantes v0.3 V4: sin objetivo (0)
  if (cfg.variants.autoTarget.active) return eligibleActors(state, side).map((actor) => ({ actor, move: 0, target: 0 }));
  const valid = validTargetPositions(null, aliveMask(state.fighters[1 - s] as readonly FighterState[]), cfg);
  return eligibleActors(state, side).map((actor) => ({ actor, move: 0, target: valid[0] ?? 1 }));
}

/**
 * Estado inicial (turno 1, energía inicial, vida al máximo).
 * combate v0.4 §1: `placementA/B` = casilla de cada alma (elegidas a ciegas y a la
 * vez; se revelan aquí). Si falta o no es válida (`validatePlacement`), se aplica
 * la regla de la IA (`referencePlacement`), sin tiradas. Con equipos llenos (v0.2), el orden del equipo.
 */
export function createBattle(teamA: readonly Combatant[], teamB: readonly Combatant[], cfg: BattleConfig, placementA?: Placement, placementB?: Placement): BattleState {
  const C = cfg.combat;
  const n = C.teamSize;
  if (teamA.length !== n || teamB.length !== n) throw new RangeError(`createBattle: cada equipo debe tener ${n} criaturas`);
  if (!C.damage.basicActive) {
    // combate v0.4 §2: cada alma necesita su movimiento gratis (coste 0)
    for (const c of [...teamA, ...teamB]) if (freeMoveSlot(c) === 0) throw new RangeError(`createBattle: '${c.id}' no tiene movimiento gratis (coste 0) y no hay golpe básico`);
  }
  const place = (team: readonly Combatant[], p: Placement | undefined): (Combatant | null)[] => {
    const pl = p !== undefined && validatePlacement(p, C) === null ? p : referencePlacement(team, C);
    const slots: (Combatant | null)[] = [];
    for (let i = 0; i < C.slots; i++) slots.push(null);
    team.forEach((c, i) => { slots[(pl[i] as number) - 1] = c; });
    return slots;
  };
  const fresh = (c: Combatant | null): FighterState => (c ? { hp: c.maxHp, ko: false, statuses: [], skipTurn: 0, stunImmuneUntil: 0 } : { hp: 0, ko: true, statuses: [], skipTurn: 0, stunImmuneUntil: 0 });
  const tA = place(teamA, placementA);
  const tB = place(teamB, placementB);
  return {
    turn: 1,
    energy: [C.energy.initial, C.energy.initial], // combate §3.1: t = 1 → inicial
    teams: [Object.freeze(tA), Object.freeze(tB)],
    fighters: [tA.map(fresh), tB.map(fresh)],
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
      rest: (state.teams[s as 0 | 1][i]?.moves ?? []).map((_, k) => (f.rest ? (f.rest[k] ?? 0) : 0)),
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

  // 4. tiradas del turno (combate §11): 8 de jitter y 16 de varianza, por casilla
  // (combate v0.4 §1: las de una casilla vacía se consumen y se descartan)
  const jitterU: number[] = [];
  for (let i = 0; i < C.draws.jitterPerTurn; i++) jitterU.push(rng.next());
  const varU: number[] = [];
  for (let i = 0; i < 2 * C.slots * C.draws.variancePerAction; i++) varU.push(rng.next());

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
      ini += C.order.jitter * (2 * (jitterU[s * C.slots + idx] as number) - 1);
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

  /**
   * combate §8 escudo (suma, tope `maximo`). combate v0.4 §3.4 (Q-01, todos los escudos):
   * con "si_aporte_mayor_o_igual" la duración se renueva a max(restante, duración) solo
   * si el aporte ≥ el escudo actual; si no, conserva la que le quedaba. Devuelve el total.
   */
  const addShield = (w: Work, amount: number): number => {
    const cur = getStatus(w, "escudo");
    const actual = cur ? cur.value : 0;
    const total = Math.min(C.statuses.escudo.value, actual + amount);
    const dur = C.statuses.escudo.duration;
    const turns = C.shieldRenew === "siempre" ? dur : !cur || amount >= actual ? Math.max(cur ? cur.turns : 0, dur) : cur.turns;
    putStatus(w, "escudo", turns, total);
    return total;
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
    // variantes v0.3 V2: ejecutado (aunque se pierda) ⇒ descansa; combate v0.4 §2: el gratis no descansa
    if (m && (V.rest.freeRests || m.cost !== 0)) me.usedSlot = e.action.move;
    const tSide: 0 | 1 = m && m.target === "aliado" ? e.side : ((1 - e.side) as 0 | 1);
    const taunting = W[tSide].map((w) => !w.ko && w.taunt > 0);
    let tPos: number | undefined;
    if (V.autoTarget.active) {
      // variantes v0.3 V4: objetivo automático, decidido al ejecutar
      // combate v0.4 §3: todo se decide al ejecutar, con el estado de ese momento (KO a mitad de turno incluidos)
      tPos = autoTargetPosition(m, e.idx + 1, state.teams[tSide], { alive: aliveMask(W[tSide]), hp: W[tSide].map((w) => w.hp), taunting, shield: W[tSide].map((w) => getStatus(w, "escudo")?.value ?? 0) }, C);
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
        const u = varU[(e.side * C.slots + e.idx) * C.draws.variancePerAction + k] as number;
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
        const u = varU[(e.side * C.slots + e.idx) * C.draws.variancePerAction + 1] as number;
        if (u < fx.chance) {
          if (fx.status === "prisa" || fx.status === "regenerar") applyStatus(e.side, e.idx, fx.status);
          else if (!(W[tSide][tPos - 1] as Work).ko) applyStatus(tSide, tPos - 1, fx.status);
        }
      } else if (fx && fx.kind === "cura") {
        const heal = Math.min(fx.amount, c.maxHp - me.hp);
        me.hp += heal;
        events.push({ type: "heal", side, pos: e.idx + 1, amount: heal, hp: me.hp, condition: false });
      } else if (fx && fx.kind === "escudo") {
        const total = addShield(me, fx.amount);
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
          const total = addShield(tw, amount);
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
    for (let i = 0; i < C.slots; i++) {
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
