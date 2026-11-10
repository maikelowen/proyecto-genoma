/**
 * IA de referencia determinista (combate §10) y partida completa.
 * La IA no consume tiradas: solo lee el estado.
 */
import { createRng } from "../rng.ts";
import type { Creature } from "../genetics/types.ts";
import type { Move } from "../moves/generate.ts";
import { buildCombatant, type BattleConfig, type Combatant } from "./combatant.ts";
import {
  actionMove,
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
  /** combate §10 `reserva` (por defecto `ia.reserva_por_defecto`). */
  readonly reserve?: number;
}

/** Simulación hipotética del turno (orden de posición, var = 1). */
interface Sim {
  hp: [number[], number[]];
  neg: [boolean[], boolean[]];
  mark: [boolean[], boolean[]];
  acted: [boolean[], boolean[]];
}

function hasStatus(f: FighterState, id: string): boolean {
  return f.statuses.some((s) => s.id === id);
}

/** combate §10 — IA de referencia. */
export function createReferenceAi(opts: ReferenceAiOptions = {}): Ai {
  return (state, side, cfg) => referencePlan(state, side, cfg, opts.reserve ?? cfg.combat.ai.defaultReserve);
}

function referencePlan(state: BattleState, side: SideId, cfg: BattleConfig, reserve: number): Plan {
  const C = cfg.combat;
  const M = cfg.moves;
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

  // Evalúa una combinación (índices de movimiento por actor). Devuelve valor y objetivos.
  const evaluate = (combo: readonly number[], withSynergy: boolean): { value: number; targets: number[] } => {
    const sim: Sim = {
      hp: [state.fighters[0].map((f) => f.hp), state.fighters[1].map((f) => f.hp)],
      neg: [negOf(state.fighters[0]), negOf(state.fighters[1])],
      mark: [state.fighters[0].map((f) => hasStatus(f, "marca")), state.fighters[1].map((f) => hasStatus(f, "marca"))],
      acted: [[false, false, false, false], [false, false, false, false]],
    };
    const plan: Action[] = actors.map((a, i) => ({ actor: a, move: combo[i] as number, target: 1 }));
    const syn = withSynergy ? planSynergy(team, plan, C) : { bonus: [0, 0, 0, 0], combo: [false, false, false, false] };
    let cost = 0;
    for (const a of plan) {
      const m = actionMove(team[a.actor - 1] as Combatant, a.move);
      cost += m ? m.cost : C.damage.basicCost;
    }
    const afterPay = e - cost;
    let value = -C.ai.costPenalty * cost; // [penalizacion_coste]
    const targets: number[] = [];
    const statusValue = (id: keyof typeof M.statusCost): number => C.ai.statusPointValue * M.statusCost[id];

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

      if (!m || m.scalable === "dano") {
        // daño: el enemigo válido con más daño esperado; empate → menos vida → menor posición
        // candidatos válidos AHORA (combate §3.2); la simulación solo puntúa
        const cands = validTargetPositions(m, state.fighters[o].map((f) => !f.ko), C);
        if (cands.length === 0) {
          targets.push(1);
          return;
        }
        const dmgTo = (p: number): number =>
          damageAmount(pot(o, p - 1), c.attack, m ? m.family : c.family, (enemyTeam[p - 1] as Combatant).family, sim.mark[o][p - 1] as boolean, weakened[idx] as boolean, 1, t, C);
        let best = cands[0] as number;
        let bestD = -Infinity;
        for (const p of cands) {
          let d = 0;
          for (const q of affectedOf(o, p)) d += dmgTo(q);
          const better = d > bestD || (d === bestD && (sim.hp[o][p - 1] as number) < (sim.hp[o][best - 1] as number));
          if (better) {
            best = p;
            bestD = d;
          }
        }
        targets.push(best);
        for (const q of affectedOf(o, best)) {
          const hp = sim.hp[o][q - 1] as number;
          const d = dmgTo(q);
          value += Math.min(d, hp);
          if (d >= hp) value += C.ai.koBonus; // [bonus_ko]
          sim.hp[o][q - 1] = hp - Math.min(d, hp);
          if (m && m.status && m.status !== "prisa" && d < hp) {
            if (!(m.status === "aturdir" && immune[q - 1])) value += statusValue(m.status);
            sim.neg[o][q - 1] = true;
            if (m.status === "marca") sim.mark[o][q - 1] = true;
          }
        }
        if (m && m.status === "prisa") value += statusValue("prisa");
        return;
      }
      // aliados: cura → menor vida/máx; escudo → delantero con menos vida
      const alive = sim.hp[s].map((h) => h > 0);
      let best = -1;
      if (m.scalable === "cura") {
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
        if (m.scalable === "cura") {
          const missing = (team[q - 1] as Combatant).maxHp - (sim.hp[s][q - 1] as number);
          const heal = Math.min(amount, missing);
          value += heal;
          sim.hp[s][q - 1] = (sim.hp[s][q - 1] as number) + heal;
        } else {
          value += Math.min(amount, C.ai.maxShieldValue); // [valor_max_escudo]
        }
        if (m.status === "regenerar") value += statusValue("regenerar");
      }
      if (m.status === "prisa") value += statusValue("prisa");
    });
    return { value, targets };
  };

  const toPlan = (combo: readonly number[], targets: readonly number[]): Action[] =>
    actors.map((actor, i) => ({ actor, move: combo[i] as number, target: targets[i] as number }));

  // combate §10.1 — ¿algún movimiento asequible, solo, deja KO a un enemigo? (estado actual, var = 1, sin sinergia)
  const moveCanKo = (c: Combatant, pos: number, m: Move): boolean => {
    const me = state.fighters[s][pos - 1] as FighterState;
    for (const p of validTargetPositions(m, state.fighters[o].map((f) => !f.ko), C)) {
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
      return c.moves.some((m) => m.cost <= e && m.scalable === "dano" && moveCanKo(c, pos, m));
    });
    if (!canKo) {
      const zeros = actors.map(() => 0);
      return toPlan(zeros, evaluate(zeros, false).targets);
    }
  }

  // combate §10.2 — enumeración lexicográfica (golpe = 0, movimientos 1–4), Σcoste ≤ e
  const options = actors.map((pos) => {
    const c = team[pos - 1] as Combatant;
    const list = [0];
    c.moves.forEach((m, k) => {
      if (m.cost <= e) list.push(k + 1);
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
