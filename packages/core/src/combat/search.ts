/**
 * IA con búsqueda (Monte Carlo con horizonte corto) — no es una regla del
 * combate, es un jugador más. Interfaz `Ai` (la misma que `runBattle` y el cliente).
 *
 * 1. Candidatos: los planes de la IA de referencia (κ de la config y κ = 0)
 *    + combinaciones de las `topK` mejores acciones (movimiento + objetivo)
 *    de cada criatura según una heurística rápida, con Σcoste ≤ energía,
 *    ordenadas por una simulación hipotética sin azar; se quedan `candidates`.
 * 2. Rival: su plan del turno no depende del nuestro (elección simultánea),
 *    así que se modela una vez con la IA de referencia (κ de la config y κ = 0, alternando).
 * 3. Cada candidato se juega `simulations` veces: turno actual con el plan
 *    candidato y `horizon − 1` turnos más con la IA de referencia en los dos
 *    lados; después, evaluación heurística del estado. Números aleatorios
 *    comunes: la simulación i usa la misma semilla para todos los candidatos.
 *
 * Honestidad: la IA no ve el RNG de la partida (no lo recibe). Su azar sale
 * de `createRng("search|" + bando + "|" + turno + "|" + hash del estado)`;
 * sin `Math.random` ni reloj: el presupuesto es un nº de simulaciones.
 */
import { createRng, cyrb128 } from "../rng.ts";
import type { Move } from "../moves/generate.ts";
import type { BattleConfig, Combatant } from "./combatant.ts";
import type { AiStatusId } from "./config.ts";
import { createReferenceAi, energyPrice, type Ai } from "./ai.ts";
import {
  actionMove,
  autoTarget,
  damageAmount,
  eligibleActors,
  resolveTurn,
  rowOf,
  sideIndex,
  validatePlan,
  validTargetPositions,
  type Action,
  type BattleState,
  type FighterState,
  type Plan,
  type SideId,
} from "./engine.ts";

export interface SearchAiOptions {
  /** Simulaciones por candidato (presupuesto; por defecto 24). */
  readonly simulations?: number;
  /** Turnos simulados hacia delante, contando el actual (por defecto 2). */
  readonly horizon?: number;
  /** Acciones (movimiento + objetivo) por criatura que entran en las combinaciones (por defecto 3). */
  readonly topK?: number;
  /** Candidatos que se simulan, además de los de la IA de referencia (por defecto 10). */
  readonly candidates?: number;
  /** Valor de tener viva una criatura, en múltiplos de `ia.bonus_ko` (por defecto 2). */
  readonly aliveWeight?: number;
}

const DEFAULTS = { simulations: 24, horizon: 2, topK: 3, candidates: 10, aliveWeight: 2 } as const;
/** Valor de ganar o perder (domina cualquier diferencia de vida). */
const WIN_VALUE = 1e6;

function shieldOf(f: FighterState): number {
  const sh = f.statuses.find((x) => x.id === "escudo");
  return sh ? sh.value : 0;
}

/** Huella del estado dinámico (lo que cambia durante la partida); los equipos se identifican por id. */
export function searchStateKey(state: BattleState): string {
  const ids = state.teams.map((t) => t.map((c) => c.id).join(","));
  return cyrb128(JSON.stringify([state.turn, state.energy, ids, state.fighters]))
    .map((w) => w.toString(16).padStart(8, "0"))
    .join("");
}

/**
 * Evaluación heurística del estado desde el bando `s`, en vida equivalente:
 * Σ(vida + escudo + vivo·peso·bonus_ko ± estados) propia − la del rival
 * + λ·energía de cada bando (precio de la energía, combate §10.1). Ganar/perder = ±WIN_VALUE.
 */
export function evaluateState(state: BattleState, s: 0 | 1, cfg: BattleConfig, aliveWeight: number = DEFAULTS.aliveWeight): number {
  if (state.result !== null) {
    if (state.result === "empate") return 0;
    return sideIndex(state.result) === s ? WIN_VALUE : -WIN_VALUE;
  }
  const C = cfg.combat;
  const A = C.ai;
  const sideValue = (k: 0 | 1): number => {
    let v = 0;
    for (const f of state.fighters[k]) {
      if (f.ko) continue;
      v += f.hp + Math.min(shieldOf(f), A.maxShieldValue) + aliveWeight * A.koBonus;
      for (const st of f.statuses) {
        if (st.id === "escudo") continue;
        const val = A.statusValue[st.id as AiStatusId];
        // los negativos restan a quien los sufre; los positivos suman
        v += C.statuses[st.id].kind === "negativo" ? -val : val;
      }
    }
    const price = energyPrice(state, k === 0 ? "A" : "B", cfg);
    return v + price.lambda * (state.energy[k] as number);
  };
  return sideValue(s) - sideValue((1 - s) as 0 | 1);
}

interface Option {
  readonly move: number;
  readonly target: number;
  readonly cost: number;
  readonly value: number;
}

/** combate §10.3 simplificado — valor rápido de una acción aislada (sin sinergia ni condiciones de orden). */
function actionOptions(state: BattleState, s: 0 | 1, pos: number, cfg: BattleConfig, lambda: number): Option[] {
  const C = cfg.combat;
  const M = cfg.moves;
  const A = C.ai;
  const o = (1 - s) as 0 | 1;
  const c = state.teams[s][pos - 1] as Combatant;
  const me = state.fighters[s][pos - 1] as FighterState;
  const e = state.energy[s];
  const t = state.turn;
  const weakened = me.statuses.some((x) => x.id === "debilitar");
  const out: Option[] = [];
  const moves: (Move | null)[] = [null, ...c.moves];
  moves.forEach((m, k) => {
    const cost = m ? m.cost : C.damage.basicCost;
    if (cost > e) return;
    // variantes v0.3 V2: un movimiento en descanso no es una opción
    if (m && C.variants.rest.active && ((me.rest ?? [])[k - 1] ?? 0) > 0) return;
    const ally = m !== null && m.target === "aliado";
    const tSide = ally ? s : o;
    const fs = state.fighters[tSide];
    // variantes v0.3 V4: una sola opción por movimiento, con el objetivo que daría ahora la regla automática (solo para puntuar)
    const autoPos = C.variants.autoTarget.active ? autoTarget(state, s === 0 ? "A" : "B", pos, k, cfg) : null;
    for (const p of C.variants.autoTarget.active ? (autoPos === null ? [] : [autoPos]) : validTargetPositions(m, fs.map((f) => !f.ko), C)) {
      const affected = (m && m.area ? rowOf(p, C) : [p]).filter((q) => !(fs[q - 1] as FighterState).ko);
      let v = -lambda * cost;
      if (m && m.extraEnergy) v += lambda * M.extraEnergy.amount;
      if (m && m.status === "prisa") v += A.statusValue.prisa;
      if (m && m.taunt) v += C.variants.taunt.aiValue; // variantes v0.3 V4
      for (const q of affected) {
        const f = fs[q - 1] as FighterState;
        const tc = state.teams[tSide][q - 1] as Combatant;
        if (!m || m.scalable === "dano") {
          const neg = f.statuses.some((x) => C.statuses[x.id].kind === "negativo");
          const met = m !== null && ((m.condition === "objetivo_con_estado" && neg) || (m.condition === "vida_baja" && me.hp < M.conditions.lowHpThreshold * c.maxHp) || (m.condition === "reserva" && e - cost >= M.conditions.reserveThreshold));
          const pot = (m ? m.power : C.damage.basicPower) * (met ? 1 + M.conditions.bonus : 1);
          const marked = f.statuses.some((x) => x.id === "marca");
          const d = damageAmount(pot, c.attack, m ? m.family : c.family, tc.family, marked, weakened, 1, t, C);
          const hp = f.hp + shieldOf(f);
          v += Math.min(d, hp) + (d >= hp ? A.koBonus : 0);
          if (m && m.status && m.status !== "prisa" && d < hp) v += A.statusValue[m.status as AiStatusId];
        } else if (m.scalable === "cura") {
          v += Math.min(m.power, tc.maxHp - f.hp);
          if (m.status === "regenerar") v += Math.min(A.statusValue.regenerar, tc.maxHp - f.hp + A.regenSlack);
        } else {
          v += Math.max(0, Math.min(m.power, A.maxShieldValue - shieldOf(f)));
        }
      }
      out.push({ move: k, target: p, cost, value: v });
    }
  });
  // mejor primero; desempate total (movimiento, objetivo)
  out.sort((a, b) => b.value - a.value || a.move - b.move || a.target - b.target);
  return out;
}

/** Puntuación de una combinación sin azar: daño acumulado sobre la vida que queda (evita rematar dos veces). */
function comboScore(state: BattleState, s: 0 | 1, actors: readonly number[], combo: readonly Option[], cfg: BattleConfig): number {
  const C = cfg.combat;
  const o = (1 - s) as 0 | 1;
  const hp = state.fighters[o].map((f) => (f.ko ? 0 : f.hp + shieldOf(f)));
  let v = 0;
  combo.forEach((op, i) => {
    const c = state.teams[s][(actors[i] as number) - 1] as Combatant;
    const m = actionMove(c, op.move);
    if (m && m.target === "aliado") {
      v += op.value;
      return;
    }
    const affected = m && m.area ? rowOf(op.target, C) : [op.target];
    let dealt = 0;
    let raw = 0;
    for (const q of affected) {
      const h = hp[q - 1] as number;
      if (h <= 0) continue;
      const tc = state.teams[o][q - 1] as Combatant;
      const d = damageAmount(m ? m.power : C.damage.basicPower, c.attack, m ? m.family : c.family, tc.family, false, false, 1, state.turn, C);
      raw += Math.min(d, (state.fighters[o][q - 1] as FighterState).hp);
      dealt += Math.min(d, h) + (d >= h ? C.ai.koBonus : 0);
      hp[q - 1] = Math.max(0, h - d);
    }
    // el valor aislado ya incluye estados y energía: se corrige solo la parte de daño
    v += op.value - raw + dealt;
  });
  return v;
}

const planKey = (p: Plan): string => p.map((a) => `${a.actor}:${a.move}:${a.target}`).join("|");

/** IA con búsqueda (Monte Carlo con horizonte corto). Determinista: mismo estado ⇒ mismo plan. */
export function createSearchAi(options: SearchAiOptions = {}): Ai {
  const sims = options.simulations ?? DEFAULTS.simulations;
  const horizon = options.horizon ?? DEFAULTS.horizon;
  const topK = options.topK ?? DEFAULTS.topK;
  const maxCand = options.candidates ?? DEFAULTS.candidates;
  const aliveWeight = options.aliveWeight ?? DEFAULTS.aliveWeight;
  for (const [k, v] of [["simulations", sims], ["horizon", horizon], ["topK", topK]] as const) {
    if (!Number.isInteger(v) || v < 1) throw new RangeError(`createSearchAi: ${k} debe ser un entero ≥ 1`);
  }
  if (!Number.isInteger(maxCand) || maxCand < 0) throw new RangeError("createSearchAi: candidates debe ser un entero ≥ 0");
  const refDefault = createReferenceAi();
  const refGreedy = createReferenceAi({ kappa: 0, reserve: 0 });

  return (state, side, cfg) => {
    const s = sideIndex(side);
    const other: SideId = s === 0 ? "B" : "A";
    if (state.result !== null) return [];
    const actors = eligibleActors(state, side);
    if (actors.length === 0) return [];
    const auto = cfg.combat.variants.autoTarget.active;

    // 1. candidatos (sin duplicados, en orden determinista)
    const cands: Plan[] = [];
    const seen = new Set<string>();
    const add = (p: Plan): void => {
      const k = planKey(p);
      if (seen.has(k) || validatePlan(state, side, p, cfg) !== null) return;
      seen.add(k);
      cands.push(p);
    };
    add(refDefault(state, side, cfg));
    add(refGreedy(state, side, cfg));
    const lambda = energyPrice(state, side, cfg).lambda;
    const opts = actors.map((pos) => {
      const all = actionOptions(state, s, pos, cfg, lambda);
      const top = all.slice(0, topK);
      // siempre hay un golpe básico (coste mínimo) para que existan combinaciones asequibles
      const basic = all.find((x) => x.move === 0);
      if (basic && !top.includes(basic)) top.push(basic);
      return top;
    });
    const combos: { plan: Action[]; score: number; idx: number }[] = [];
    const cur: Option[] = [];
    const rec = (i: number, spent: number): void => {
      if (i === actors.length) {
        // variantes v0.3 V4: el plan no lleva objetivo (0); `op.target` solo sirve para puntuar
        combos.push({ plan: cur.map((op, j) => ({ actor: actors[j] as number, move: op.move, target: auto ? 0 : op.target })), score: comboScore(state, s, actors, cur, cfg), idx: combos.length });
        return;
      }
      for (const op of opts[i] as Option[]) {
        if (spent + op.cost > state.energy[s]) continue;
        cur.push(op);
        rec(i + 1, spent + op.cost);
        cur.pop();
      }
    };
    rec(0, 0);
    combos.sort((a, b) => b.score - a.score || a.idx - b.idx);
    const fixed = cands.length;
    for (const c of combos) {
      if (cands.length >= fixed + maxCand) break;
      add(c.plan);
    }
    if (cands.length === 1) return cands[0] as Plan;

    // 2. modelo del rival (no depende de nuestro plan)
    const rivalPlans: Plan[] = [refDefault(state, other, cfg), refGreedy(state, other, cfg)];

    // 3. simulaciones con el RNG propio de la IA (nunca el de la partida)
    const seedBase = `search|${side}|${state.turn}|${searchStateKey(state)}`;
    let best = 0;
    let bestValue = -Infinity;
    cands.forEach((plan, ci) => {
      let total = 0;
      for (let i = 0; i < sims; i++) {
        const rng = createRng(`${seedBase}|${i}`); // misma semilla para todos los candidatos
        const rival = rivalPlans[i % rivalPlans.length] as Plan;
        let st = resolveTurn(state, s === 0 ? plan : rival, s === 0 ? rival : plan, rng, cfg).state;
        for (let h = 1; h < horizon && st.result === null; h++) {
          const pa = refDefault(st, "A", cfg);
          const pb = refDefault(st, "B", cfg);
          st = resolveTurn(st, pa, pb, rng, cfg).state;
        }
        total += evaluateState(st, s, cfg, aliveWeight);
      }
      // estrictamente mejor: en empate gana el primero (la IA de referencia va delante)
      if (total > bestValue) {
        bestValue = total;
        best = ci;
      }
    });
    return cands[best] as Plan;
  };
}
