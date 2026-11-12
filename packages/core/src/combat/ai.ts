/**
 * IA de referencia determinista v0.2 (combate §10) y partida completa.
 * La IA no consume tiradas: solo lee el estado.
 */
import { createRng } from "../rng.ts";
import type { Creature } from "../genetics/types.ts";
import type { Move } from "../moves/generate.ts";
import { buildCombatant, type BattleConfig, type Combatant } from "./combatant.ts";
import type { AiStatusId } from "./config.ts";
import {
  actionMove,
  autoTargetPosition,
  basicEffectOf,
  battleHash,
  createBattle,
  damageAmount,
  eligibleActors,
  planSynergy,
  resolveTurn,
  rowOf,
  sideIndex,
  validTargetPositions,
  type Action,
  type BattleEvent,
  type BattleResult,
  type BattleState,
  type FighterState,
  type Plan,
  type SideId,
} from "./engine.ts";

/** Una IA recibe el estado y su bando y devuelve un plan (puede ser inválido: el motor lo sustituye). */
export type Ai = (state: BattleState, side: SideId, cfg: BattleConfig) => Plan;

export interface ReferenceAiOptions {
  /** combate §10.2 `reserva` (por defecto `ia.reserva_por_defecto`). */
  readonly reserve?: number;
  /** combate §10.1 κ (por defecto `ia.kappa`): para enfrentar IA que ahorran y que no en la misma partida. */
  readonly kappa?: number;
}

/** combate §10.1 [v0.2] — precio sombra de la energía de un bando en el turno actual. */
export interface EnergyPrice {
  /** λ = max(0, κ · máx r(m)), en vida equivalente por unidad de energía. */
  readonly lambda: number;
  /** c* = coste del movimiento con máximo r(m) (0 si no hay movimientos). */
  readonly targetCost: number;
  /** máx r(m) (−Infinity si no hay movimientos). */
  readonly bestRate: number;
}

/** Simulación hipotética del turno (orden de posición, var = 1). */
interface Sim {
  hp: [number[], number[]];
  neg: [boolean[], boolean[]];
  mark: [boolean[], boolean[]];
  acted: [boolean[], boolean[]];
  /** Escudo de cada criatura del propio bando (combate §10.3, valor del escudo). */
  shield: number[];
}

function hasStatus(f: FighterState, id: string): boolean {
  return f.statuses.some((s) => s.id === id);
}
function shieldOf(f: FighterState): number {
  const sh = f.statuses.find((s) => s.id === "escudo");
  return sh ? sh.value : 0;
}

/** combate §10 [v0.2] — IA de referencia. */
export function createReferenceAi(opts: ReferenceAiOptions = {}): Ai {
  return (state, side, cfg) => referencePlan(state, side, cfg, opts.reserve ?? cfg.combat.ai.defaultReserve, opts.kappa ?? cfg.combat.ai.kappa);
}

/**
 * combate §10.1 [v0.2] — precio de la energía, una vez por turno y sin tiradas.
 * H = media de (vida + escudo) de los enemigos vivos; para cada movimiento m
 * de cada criatura viva del bando (orden de posición y locus):
 * r(m) = (v̂ − potencia_golpe·fA) / coste. λ = κ · máx r; c* = coste del primero que lo alcanza.
 */
export function energyPrice(state: BattleState, side: SideId, cfg: BattleConfig, kappa: number = cfg.combat.ai.kappa): EnergyPrice {
  const C = cfg.combat;
  const M = cfg.moves;
  const A = C.ai;
  const s = sideIndex(side);
  const enemies = state.fighters[1 - s] as readonly FighterState[];
  let sum = 0;
  let n = 0;
  for (const f of enemies) {
    if (f.ko) continue;
    sum += f.hp + shieldOf(f);
    n++;
  }
  const H = n > 0 ? sum / n : 0;
  let bestRate = -Infinity;
  let targetCost = 0;
  state.teams[s].forEach((c, i) => {
    if ((state.fighters[s][i] as FighterState).ko) return;
    const fx = basicEffectOf(c, cfg);
    const basicFx = !fx ? 0 : fx.kind === "estado" ? fx.chance * A.statusValue[fx.status] : fx.kind === "cura" ? fx.amount * A.healFactorEstimate : fx.kind === "escudo" ? Math.min(fx.amount, A.maxShieldValue) : 0;
    for (const m of c.moves) {
      const k = m.area ? A.areaTargetsEstimate : 1;
      let v = m.scalable === "dano" ? Math.min(m.power * c.attack, H) * k : m.scalable === "cura" ? m.power * A.healFactorEstimate * k : Math.min(m.power, A.maxShieldValue) * k;
      if (m.condition) v *= 1 + M.conditions.bonus * A.conditionProbEstimate;
      // rendimiento neto por energía: descuenta el golpe básico al que sustituye
      // (variantes v0.3 V1: también el valor estimado de su efecto; 0 con la variante desactivada)
      const r = (v - C.damage.basicPower * c.attack - basicFx) / m.cost;
      if (r > bestRate) {
        bestRate = r;
        targetCost = m.cost;
      }
    }
  });
  // λ < 0 penalizaría guardar lo que no se puede gastar: se acota en 0 (notas v0.2)
  const lambda = bestRate > 0 ? kappa * bestRate : 0;
  return { lambda, targetCost, bestRate };
}

function referencePlan(state: BattleState, side: SideId, cfg: BattleConfig, reserve: number, kappa: number): Plan {
  const C = cfg.combat;
  const M = cfg.moves;
  const A = C.ai;
  const s = sideIndex(side);
  const o = (1 - s) as 0 | 1;
  const team = state.teams[s];
  const enemyTeam = state.teams[o];
  const actors = eligibleActors(state, side);
  if (actors.length === 0) return [];
  const e = state.energy[s];
  const t = state.turn;
  const negOf = (fs: readonly FighterState[]): boolean[] => fs.map((f) => f.statuses.some((x) => C.statuses[x.id].kind === "negativo"));
  const weakened = team.map((_, i) => hasStatus(state.fighters[s][i] as FighterState, "debilitar"));
  const immune = state.fighters[o].map((f) => f.stunImmuneUntil >= t || hasStatus(f, "aturdir"));
  // combate §10.1 — precio de la energía y tope de lo que vale guardar
  const price = energyPrice(state, side, cfg, kappa);
  const saveCap = Math.max(0, Math.min(price.targetCost, C.energy.max - C.energy.perTurn));
  // variantes v0.3: V4 (no se elige objetivo; se predice con la regla de carriles sobre la simulación) y V2 (descanso)
  const auto = C.variants.autoTarget.active;
  const enemyTaunting = state.fighters[o].map((f) => !f.ko && (f.taunt ?? 0) > 0);
  const noTaunt = [false, false, false, false];
  const resting = (pos: number, slot: number): boolean => C.variants.rest.active && (((state.fighters[s][pos - 1] as FighterState).rest ?? [])[slot - 1] ?? 0) > 0;

  // combate §10.3 — evalúa una combinación (índices de movimiento por actor). Devuelve valor y objetivos.
  const evaluate = (combo: readonly number[], withSynergy: boolean): { value: number; targets: number[] } => {
    const sim: Sim = {
      hp: [state.fighters[0].map((f) => f.hp), state.fighters[1].map((f) => f.hp)],
      neg: [negOf(state.fighters[0]), negOf(state.fighters[1])],
      mark: [state.fighters[0].map((f) => hasStatus(f, "marca")), state.fighters[1].map((f) => hasStatus(f, "marca"))],
      acted: [[false, false, false, false], [false, false, false, false]],
      shield: state.fighters[s].map(shieldOf),
    };
    const plan: Action[] = actors.map((a, i) => ({ actor: a, move: combo[i] as number, target: 1 }));
    const syn = withSynergy ? planSynergy(team, plan, C) : { bonus: [0, 0, 0, 0], combo: [false, false, false, false] };
    let cost = 0;
    for (const a of plan) {
      const m = actionMove(team[a.actor - 1] as Combatant, a.move);
      cost += m ? m.cost : C.damage.basicCost;
    }
    const afterPay = e - cost;
    // [v0.2] valor de lo que se guarda: λ · min(e − Σcoste, c*, máx − por_turno); − penalización (desempate)
    let value = price.lambda * Math.min(afterPay, saveCap) - A.costPenalty * cost;
    const targets: number[] = [];

    actors.forEach((pos, i) => {
      const idx = pos - 1;
      const c = team[idx] as Combatant;
      const m = actionMove(c, combo[i] as number);
      sim.acted[s][idx] = true;
      const synMult = m ? 1 + (syn.bonus[idx] as number) : 1;
      const cond = (m: Move | null, tSide: 0 | 1, tIdx: number): boolean => {
        if (!m || !m.condition) return false;
        switch (m.condition) {
          case "objetivo_con_estado":
            return sim.neg[tSide][tIdx] as boolean;
          case "vida_baja":
            return (sim.hp[s][idx] as number) < M.conditions.lowHpThreshold * c.maxHp;
          case "combo_familia":
            return syn.combo[idx] as boolean;
          case "reserva":
            return afterPay >= M.conditions.reserveThreshold;
          case "antes_que_objetivo":
            return !sim.acted[tSide][tIdx];
        }
      };
      const pot = (tSide: 0 | 1, tIdx: number): number => (m ? m.power : C.damage.basicPower) * (cond(m, tSide, tIdx) ? 1 + M.conditions.bonus : 1) * synMult;
      // objetivos afectados que siguen vivos en la simulación
      const affectedOf = (tSide: 0 | 1, tPos: number): number[] =>
        (m && m.area ? rowOf(tPos, C) : [tPos]).filter((p) => (sim.hp[tSide][p - 1] as number) > 0);
      if (m && m.extraEnergy) value += price.lambda * M.extraEnergy.amount; // [v0.2] λ por energía extra
      if (m && m.taunt) value += C.variants.taunt.aiValue; // variantes v0.3 V4 [variantes.provocar.valor_ia]

      if (!m || m.scalable === "dano") {
        // candidatos válidos AHORA (combate §3.2); la simulación solo puntúa
        // variantes v0.3 V4: un único candidato, el que daría la regla de carriles tras las acciones anteriores del plan
        const autoPos = auto ? autoTargetPosition(m, pos, enemyTeam, { alive: sim.hp[o].map((h) => h > 0), hp: sim.hp[o], taunting: enemyTaunting }, C) : undefined;
        const cands = auto ? (autoPos === undefined ? [] : [autoPos]) : validTargetPositions(m, state.fighters[o].map((f) => !f.ko), C);
        if (cands.length === 0) {
          targets.push(1);
          return;
        }
        const dmgTo = (p: number): number =>
          damageAmount(pot(o, p - 1), c.attack, m ? m.family : c.family, (enemyTeam[p - 1] as Combatant).family, sim.mark[o][p - 1] as boolean, weakened[idx] as boolean, 1, t, C);
        // [v0.2] objetivo = el que maximiza Σ [min(daño, vida) + bonus_ko si daño ≥ vida];
        // empate → menos vida → menor posición
        let best = cands[0] as number;
        let bestV = -Infinity;
        for (const p of cands) {
          let v = 0;
          for (const q of affectedOf(o, p)) {
            const hp = sim.hp[o][q - 1] as number;
            const d = dmgTo(q);
            v += Math.min(d, hp) + (d >= hp ? A.koBonus : 0);
          }
          const better = v > bestV || (v === bestV && (sim.hp[o][p - 1] as number) < (sim.hp[o][best - 1] as number));
          if (better) {
            best = p;
            bestV = v;
          }
        }
        targets.push(best);
        for (const q of affectedOf(o, best)) {
          const hp = sim.hp[o][q - 1] as number;
          const d = dmgTo(q);
          value += Math.min(d, hp);
          if (d >= hp) value += A.koBonus; // [bonus_ko]
          sim.hp[o][q - 1] = hp - Math.min(d, hp);
          if (m && m.status && m.status !== "prisa" && d < hp) {
            // [v0.2] valor_estado por estado ofensivo sobre un objetivo que sobrevive (aturdir sobre inmune: 0)
            if (!(m.status === "aturdir" && immune[q - 1])) value += A.statusValue[m.status as AiStatusId];
            sim.neg[o][q - 1] = true;
            if (m.status === "marca") sim.mark[o][q - 1] = true;
          }
        }
        if (m && m.status === "prisa") value += A.statusValue.prisa;
        // variantes v0.3 V1: valor esperado del efecto del golpe básico
        const fx = m ? null : basicEffectOf(c, cfg);
        if (fx && fx.kind === "estado") {
          if (fx.status === "prisa" || fx.status === "regenerar") value += fx.chance * A.statusValue[fx.status];
          else if ((sim.hp[o][best - 1] as number) > 0 && !(fx.status === "aturdir" && immune[best - 1])) value += fx.chance * A.statusValue[fx.status];
        } else if (fx && fx.kind === "cura") {
          const heal = Math.min(fx.amount, c.maxHp - (sim.hp[s][idx] as number));
          value += heal;
          sim.hp[s][idx] = (sim.hp[s][idx] as number) + heal;
        } else if (fx && fx.kind === "escudo") {
          const cur = sim.shield[idx] as number;
          value += Math.max(0, Math.min(fx.amount, A.maxShieldValue - cur));
          sim.shield[idx] = Math.min(C.statuses.escudo.value, cur + fx.amount);
        }
        return;
      }
      // aliados: cura → menor vida/máx; escudo → delantero con menos vida (si no hay, trasero)
      const alive = sim.hp[s].map((h) => h > 0);
      let best = -1;
      if (auto) {
        best = autoTargetPosition(m, pos, team, { alive, hp: sim.hp[s], taunting: noTaunt }, C) ?? -1;
      } else if (m.scalable === "cura") {
        let bestR = Infinity;
        for (const p of validTargetPositions(m, alive, C)) {
          const r = (sim.hp[s][p - 1] as number) / (team[p - 1] as Combatant).maxHp;
          if (r < bestR) {
            bestR = r;
            best = p;
          }
        }
      } else {
        const front = C.frontRow.filter((p) => alive[p - 1]);
        const pool = front.length > 0 ? front : C.backRow.filter((p) => alive[p - 1]);
        let bestH = Infinity;
        for (const p of pool) {
          const h = sim.hp[s][p - 1] as number;
          if (h < bestH) {
            bestH = h;
            best = p;
          }
        }
      }
      if (best < 0) {
        targets.push(pos);
        return;
      }
      targets.push(best);
      for (const q of affectedOf(s, best)) {
        const amount = Math.round(pot(s, q - 1));
        const maxHp = (team[q - 1] as Combatant).maxHp;
        if (m.scalable === "cura") {
          const heal = Math.min(amount, maxHp - (sim.hp[s][q - 1] as number));
          value += heal;
          sim.hp[s][q - 1] = (sim.hp[s][q - 1] as number) + heal;
        } else {
          // [v0.2] descuenta el escudo que ya tiene (incluido el puesto antes en este plan)
          const cur = sim.shield[q - 1] as number;
          value += Math.max(0, Math.min(amount, A.maxShieldValue - cur));
          sim.shield[q - 1] = Math.min(C.statuses.escudo.value, cur + amount);
        }
        // [v0.2] regenerar: min(valor, vida que falta tras la cura + holgura)
        if (m.status === "regenerar") value += Math.min(A.statusValue.regenerar, maxHp - (sim.hp[s][q - 1] as number) + A.regenSlack);
      }
      if (m.status === "prisa") value += A.statusValue.prisa;
    });
    return { value, targets };
  };

  const toPlan = (combo: readonly number[], targets: readonly number[]): Action[] =>
    actors.map((actor, i) => ({ actor, move: combo[i] as number, target: auto ? 0 : (targets[i] as number) }));

  // combate §10.2 — ¿algún movimiento asequible, solo, deja KO a un enemigo? (estado actual, var = 1, sin sinergia)
  const moveCanKo = (c: Combatant, pos: number, m: Move): boolean => {
    const me = state.fighters[s][pos - 1] as FighterState;
    const autoPos = auto ? autoTargetPosition(m, pos, enemyTeam, { alive: state.fighters[o].map((f) => !f.ko), hp: state.fighters[o].map((f) => f.hp), taunting: enemyTaunting }, C) : undefined;
    for (const p of auto ? (autoPos === undefined ? [] : [autoPos]) : validTargetPositions(m, state.fighters[o].map((f) => !f.ko), C)) {
      const aff = m.area ? rowOf(p, C).filter((q) => !(state.fighters[o][q - 1] as FighterState).ko) : [p];
      for (const q of aff) {
        const f = state.fighters[o][q - 1] as FighterState;
        const met =
          m.condition === "objetivo_con_estado"
            ? f.statuses.some((x) => C.statuses[x.id].kind === "negativo")
            : m.condition === "vida_baja"
              ? me.hp < M.conditions.lowHpThreshold * c.maxHp
              : m.condition === "reserva"
                ? e - m.cost >= M.conditions.reserveThreshold
                : m.condition === "antes_que_objetivo"; // combo_familia: falso (va solo)
        const pot = m.power * (met ? 1 + M.conditions.bonus : 1);
        const d = damageAmount(pot, c.attack, m.family, (enemyTeam[q - 1] as Combatant).family, hasStatus(f, "marca"), weakened[pos - 1] as boolean, 1, t, C);
        if (d >= f.hp) return true;
      }
    }
    return false;
  };
  if (e < reserve && e + C.energy.perTurn <= C.energy.max) {
    const canKo = actors.some((pos) => {
      const c = team[pos - 1] as Combatant;
      return c.moves.some((m, k) => m.cost <= e && !resting(pos, k + 1) && m.scalable === "dano" && moveCanKo(c, pos, m));
    });
    if (!canKo) {
      const zeros = actors.map(() => 0);
      return toPlan(zeros, evaluate(zeros, false).targets);
    }
  }

  // combate §10.3 — enumeración lexicográfica (golpe = 0, movimientos 1–4), Σcoste ≤ e
  const options = actors.map((pos) => {
    const c = team[pos - 1] as Combatant;
    const list = [0];
    c.moves.forEach((m, k) => {
      if (m.cost <= e && !resting(pos, k + 1)) list.push(k + 1);
    });
    return list;
  });
  let bestValue = -Infinity;
  let bestCombo: number[] = actors.map(() => 0);
  let bestTargets: number[] = [];
  const combo: number[] = actors.map(() => 0);
  const rec = (i: number, spent: number): void => {
    if (i === actors.length) {
      const r = evaluate(combo, true);
      if (r.value > bestValue) {
        bestValue = r.value;
        bestCombo = combo.slice();
        bestTargets = r.targets;
      }
      return;
    }
    const c = team[(actors[i] as number) - 1] as Combatant;
    for (const k of options[i] as number[]) {
      const cost = k === 0 ? C.damage.basicCost : (c.moves[k - 1] as Move).cost;
      if (spent + cost > e) continue;
      combo[i] = k;
      rec(i + 1, spent + cost);
    }
    combo[i] = 0;
  };
  rec(0, 0);
  return toPlan(bestCombo, bestTargets);
}

export interface BattleRecord {
  readonly result: BattleResult;
  /** Turnos jugados. */
  readonly turns: number;
  /** Eventos por turno (log[i] = turno i + 1). */
  readonly log: readonly (readonly BattleEvent[])[];
  /** battleHash(log). */
  readonly hash: string;
  readonly final: BattleState;
}

/** Equipo de criaturas o combatientes ya construidos (p. ej. con un movimiento sustituido). */
export type TeamInput = readonly (Creature | Combatant)[];

function toCombatants(team: TeamInput, cfg: BattleConfig): Combatant[] {
  return team.map((x) => ("genome" in x ? buildCombatant(x, cfg) : x));
}

/**
 * Juega una partida completa: rng = createRng(semilla.prefijo + seed)
 * (combate §11) y planes de `aiA`/`aiB` (por defecto, la IA de referencia).
 */
export function runBattle(teamA: TeamInput, teamB: TeamInput, seed: string | number, cfg: BattleConfig, aiA: Ai = createReferenceAi(), aiB: Ai = createReferenceAi()): BattleRecord {
  let state = createBattle(toCombatants(teamA, cfg), toCombatants(teamB, cfg), cfg);
  const rng = createRng(cfg.combat.seedPrefix + String(seed));
  const log: (readonly BattleEvent[])[] = [];
  while (state.result === null) {
    const planA = aiA(state, "A", cfg);
    const planB = aiB(state, "B", cfg);
    const r = resolveTurn(state, planA, planB, rng, cfg);
    log.push(r.events);
    state = r.state;
  }
  return { result: state.result, turns: log.length, log, hash: battleHash(log), final: state };
}

/**
 * variantes v0.3 V4 — formación de referencia (determinista, sin tiradas): las
 * almas que llevan "provocar" y, después, las de más vida máxima van delante
 * (posiciones 1 y 2); el resto, detrás. Empates: orden de entrada. Con V4 la
 * formación decide a quién ataca cada alma (carriles), así que es una decisión del jugador;
 * esta función solo da un punto de partida razonable para la IA y el simulador.
 */
export function suggestFormation<T extends Combatant>(team: readonly T[]): T[] {
  const rank = team.map((c, i) => ({ c, i, taunt: c.moves.some((m) => m.taunt === true) ? 1 : 0 }));
  rank.sort((a, b) => b.taunt - a.taunt || b.c.maxHp - a.c.maxHp || a.i - b.i);
  return rank.map((r) => r.c);
}
