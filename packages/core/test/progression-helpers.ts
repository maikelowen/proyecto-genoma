/** Utilidades de los tests de progresión v0.1 (no es un test). */
import rawCombat05 from "../../../config/combate.v0.5.json" with { type: "json" };
import rawMoves05 from "../../../config/movimientos.v0.5.json" with { type: "json" };
import rawProg from "../../../config/progresion.v0.1.json" with { type: "json" };
import { parseCombatConfig, parseMovesConfig, parseProgressionConfig, type BattleConfig, type ProgressionConfig } from "../src/index.ts";
import { CFG as GCFG } from "./genetics-helpers.ts";

export const rawProgClone = (): any => structuredClone(rawProg);
/** Combate v0.5 + movimientos v0.5 (configs del juego). */
export function loadBattle05(patchCombat?: (raw: any) => void): BattleConfig {
  const c = structuredClone(rawCombat05) as any;
  if (patchCombat) patchCombat(c);
  return { combat: parseCombatConfig(c), moves: parseMovesConfig(structuredClone(rawMoves05), GCFG) };
}
export const B05 = loadBattle05();
/** Progresión v0.1 real; `patch` modifica una copia del JSON crudo antes de validar. */
export function loadProg(patch?: (raw: any) => void, battle: BattleConfig = B05): ProgressionConfig {
  const r = rawProgClone();
  if (patch) patch(r);
  return parseProgressionConfig(r, battle);
}
export const P = loadProg();
