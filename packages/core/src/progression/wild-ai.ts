/**
 * IA salvaje "instinto" (progresión v0.1 §2.5). Sin tiradas y sin simulación: legible.
 */
import { createReferenceAi, type Ai } from "../combat/ai.ts";
import type { Combatant } from "../combat/combatant.ts";
import { autoTarget, eligibleActors, freeMoveSlot, restingMoves, sideIndex, validTargetPositions, actionMove, type Action } from "../combat/engine.ts";
import type { ProgressionConfig } from "./config.ts";

/**
 * progresión §2.5 — cada ánima que puede actuar, en orden de casilla, usa el movimiento de pago
 * más caro que pueda pagar con la energía que dejan las anteriores y que no esté descansando
 * (empate: hueco menor); si no puede, su gratis. Nunca ahorra. La última ánima hace un solo
 * movimiento (una entrada). Objetivo: el automático de combate (V4, QA B-13).
 */
export const instinctAi: Ai = (state, side, cfg) => {
  const s = sideIndex(side);
  const C = cfg.combat;
  let e = state.energy[s];
  const plan: Action[] = [];
  for (const pos of eligibleActors(state, side, cfg)) {
    const c = state.teams[s][pos - 1] as Combatant;
    const resting = restingMoves(state, side, pos, cfg);
    let move = 0;
    let best = 0;
    c.moves.forEach((m, k) => {
      if (m.cost > 0 && m.cost <= e && m.cost > best && !resting.includes(k + 1)) {
        best = m.cost;
        move = k + 1;
      }
    });
    if (move === 0) move = C.damage.basicActive ? 0 : freeMoveSlot(c);
    e -= best;
    let target = 0;
    if (!C.variants.autoTarget.active) {
      // sin V4, el objetivo que daría la regla automática ahora (o el primero válido)
      const m = actionMove(c, move);
      const tSide = m && m.target === "aliado" ? s : 1 - s;
      target = autoTarget(state, side, pos, move, cfg) ?? validTargetPositions(m, (state.fighters[tSide] ?? []).map((f) => !f.ko), C)[0] ?? 1;
    }
    plan.push({ actor: pos, move, target });
  }
  return plan;
};

/** progresión §2.5 `[ia_salvaje.modo]` — IA de las salvajes según la config. */
export function wildAi(cfg: ProgressionConfig): Ai {
  return cfg.wildAi === "instinto" ? instinctAi : createReferenceAi();
}
