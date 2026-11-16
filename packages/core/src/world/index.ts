/** API pública del mundo caminable v0.1 (docs/spec/mundo-v0.1.md; notas en docs/spec/notas-implementacion-mundo-v0.1.md). */
export { DIRS, mapById, parseWorldConfig, tileAt } from "./config.ts";
export type { ActivatorKind, Activator, CharacterEntity, Dir, MapDef, NeighborEntity, ObjectEntity, SpawnPoint, SignEntity, Tile, WorldConfig, WorldEntity } from "./config.ts";
export { activatorAt, activeEntities, entityAt, exitOpen, facingTarget, interact, leaveSanctuary, newWorld, planRoute, returnFromZoneList, step, worldHash } from "./world.ts";
export type { InteractOutcome, StepOutcome, WorldState } from "./world.ts";
export { parseWorldSave, serializeWorld } from "./save.ts";
