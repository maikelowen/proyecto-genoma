/** API pública de combate v0.1 y movimientos v0.1. */
export { parseCombatConfig, STATUS_IDS } from "./config.ts";
export type { CombatConfig, StatusId, StatusKind, StatusRule, Stacking } from "./config.ts";
export { buildCombatant, deriveStats, synergyGroups, withMove } from "./combatant.ts";
export type { BattleConfig, Combatant } from "./combatant.ts";
export {
  actionCost,
  actionMove,
  battleHash,
  canAct,
  createBattle,
  damageAmount,
  eligibleActors,
  fallbackPlan,
  planSynergy,
  resolveTurn,
  rowOf,
  SIDE_IDS,
  validatePlan,
  validTargetPositions,
  wearFactor,
} from "./engine.ts";
export type { Action, BattleEvent, BattleResult, BattleState, FighterState, Plan, SideId, StatusInstance, TurnResult } from "./engine.ts";
export { createReferenceAi, runBattle } from "./ai.ts";
export type { Ai, BattleRecord, ReferenceAiOptions, TeamInput } from "./ai.ts";
