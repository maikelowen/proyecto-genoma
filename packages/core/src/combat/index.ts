/** API pública de combate v0.4/v0.5 (también carga configs v0.2, con variantes v0.3). */
export { AI_STATUS_IDS, BASIC_EFFECT_STATUS_IDS, parseCombatConfig, STATUS_IDS } from "./config.ts";
export type { AiStatusId, PlacementRule, BasicEffect, BasicEffectStatusId, CombatVariants, CombatConfig, DerivedStatRule, StatusId, StatusKind, StatusRule, Stacking } from "./config.ts";
export { buildBattleConfig, patchRawConfig } from "./patch.ts";
export type { ConfigChanges } from "./patch.ts";
export { buildCombatant, deriveStats, synergyGroups, withMove } from "./combatant.ts";
export type { BattleConfig, Combatant } from "./combatant.ts";
export {
  actionCost,
  actionMove,
  actionPriority,
  attackable,
  autoTarget,
  backRowFirst,
  autoTargetPosition,
  basicEffectOf,
  battleHash,
  canAct,
  createBattle,
  damageAmount,
  eligibleActors,
  energyLost,
  exposedRow,
  fallbackPlan,
  forecastTargets,
  freeMoveSlot,
  laneOf,
  laneOrder,
  lastAnimaPlans,
  lastAnimaPos,
  placementOf,
  planSynergy,
  resolveTurn,
  restingMoves,
  rowOf,
  SIDE_IDS,
  slotPriority,
  validatePlan,
  validTargetPositions,
  wearFactor,
} from "./engine.ts";
export type { Action, SeqInfo, BattleEvent, BattleResult, BattleState, FighterState, Plan, SideId, StatusInstance, TargetView, TurnResult } from "./engine.ts";
export { createReferenceAi, energyPrice, runBattle, suggestFormation } from "./ai.ts";
export type { Ai, BattleRecord, EnergyPrice, ReferenceAiOptions, TeamInput } from "./ai.ts";
export { createSearchAi, evaluateState, searchStateKey } from "./search.ts";
export type { SearchAiOptions } from "./search.ts";
export { allPlacements, placementShape, referencePlacement, validatePlacement } from "./placement.ts";
export type { Placement } from "./placement.ts";
