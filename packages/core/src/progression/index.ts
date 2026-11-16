/** API pública de progresión v0.1 (docs/spec/progresion-v0.1.md; notas en docs/spec/notas-implementacion-progresion-v0.1.md). */
export { parseProgressionConfig, posKey, VARIANT_AXES } from "./config.ts";
export type { HiddenPos, PaidSlotRule, ProgressionConfig, VariantAxis, Zone } from "./config.ts";
export {
  animaId,
  animaLevel,
  combatantAtLevel,
  combatantOf,
  isMature,
  levelOf,
  openSlots,
  pendingVariants,
  revealedByLevel,
  slotMove,
  unlockedSlots,
  xpForLevel,
} from "./anima.ts";
export type { Anima, AnimaOrigin, ChosenVariant, MoveSlot, MoveSlots } from "./anima.ts";
export { assembleExact, effectivePoints, geneMove, moveVariants, NO_PIECE, variantAlternatives, variantCandidates, variantOffer } from "./variants.ts";
export type { PieceChange, VariantCandidate, VariantMove, VariantOffer } from "./variants.ts";
export { instinctAi, wildAi } from "./wild-ai.ts";
export {
  animaPendingVariants,
  applyBattleResult,
  canResonate,
  catchBlocker,
  catchChance,
  catchPercent,
  chooseStarter,
  chooseVariant,
  companionCombatant,
  companionCreature,
  companionJoins,
  defaultName,
  encounterBattleRng,
  encounterSides,
  findAnima,
  gainXp,
  GameRuleError,
  markIntroSeen,
  newGame,
  playEncounterBattle,
  release,
  releaseBlocker,
  releaseEssence,
  rename,
  resonanceCost,
  resonanceOdds,
  resonate,
  rollEncounter,
  rollWildGroup,
  setTeam,
  starterOptions,
  startEncounterBattle,
  streamRng,
  throwLantern,
  toggleVariant,
  wildEssence,
  wildXp,
  zoneById,
  zoneUnlocked,
  PLAYER_SIDE,
} from "./game.ts";
export type { AnimaProgress, BattleReport, CodexMutation, EchoOrigin, Encounter, GameState, LineageEntry, ResonanceResult, ThrowResult, WildEntry } from "./game.ts";
export { gameHash, parseSave, SaveError, serialize } from "./save.ts";
