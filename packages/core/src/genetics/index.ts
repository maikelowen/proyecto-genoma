/** API pública de la genética v0.1. */
export { ConfigError, parseGeneticsConfig } from "./config.ts";
export { geneKey, isCatalogKey } from "./gene.ts";
export {
  allGenes,
  checkInvariants,
  createWildCreature,
  createWildPopulation,
  creatureFamily,
  expressedGenes,
  expressedStats,
  locusKeys,
} from "./creature.ts";
export { breed, breedingBlocker, BreedingError } from "./breed.ts";
export { createGenedex, recordMutations } from "./genedex.ts";
export { LOCUS_IDS, STAT_IDS } from "./types.ts";

export type { BreedOptions, BreedResult, LocusTrace, MutationEvent } from "./breed.ts";
export type { WildOptions } from "./creature.ts";
export type { Genedex, GenedexEntry, RecordOutcome } from "./genedex.ts";
export type {
  Creature,
  FamilyId,
  Gene,
  GeneOrigin,
  GeneticsConfig,
  GeneType,
  Genome,
  HybridFamily,
  Locus,
  LocusId,
  Shape,
  SlotWeights,
  StatId,
  Stats,
} from "./types.ts";
