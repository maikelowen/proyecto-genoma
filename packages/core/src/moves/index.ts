/** API pública de movimientos v0.2. */
export {
  ARCHETYPE_IDS,
  CONDITION_IDS,
  MODIFIER_IDS,
  OFFENSIVE_STATUS_IDS,
  POSITIVE_STATUS_IDS,
  parseMovesConfig,
} from "./config.ts";
export type {
  ArchetypeId,
  ArchetypeRule,
  ConditionId,
  ModifierId,
  MovesConfig,
  MoveStatusId,
  MoveTarget,
  OffensiveStatusId,
  PositiveStatusId,
  ScalableId,
} from "./config.ts";
export { describeMove, generateMove, generateMoveForKey, parseGeneKey, validateMove, weightedPick } from "./generate.ts";
export type { Move } from "./generate.ts";
