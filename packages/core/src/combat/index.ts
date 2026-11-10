/** API pública de combate v0.2. */
export { AI_STATUS_IDS, parseCombatConfig, STATUS_IDS } from "./config.ts";
export type { AiStatusId, CombatConfig, DerivedStatRule, StatusId, StatusKind, StatusRule, Stacking } from "./config.ts";
export { buildBattleConfig, patchRawConfig } from "./patch.ts";
export type { ConfigChanges } from "./patch.ts";
export { buildCombatant, deriveStats, synergyGroups, withMove } from "./combatant.ts";
export type { BattleConfig, Combatant } from "./combatant.ts";
export {
  actionCost,
  actionMove,
  actionPriority,
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
export { createReferenceAi, energyPrice, runBattle } from "./ai.ts";
export type { Ai, BattleRecord, EnergyPrice, ReferenceAiOptions, TeamInput } from "./ai.ts";
