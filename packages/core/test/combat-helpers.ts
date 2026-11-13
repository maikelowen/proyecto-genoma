/** Utilidades compartidas por los tests de combate y movimientos (no es un test). */
import rawCombat from "../../../config/combate.v0.2.json" with { type: "json" };
import rawMoves from "../../../config/movimientos.v0.2.json" with { type: "json" };
import {
  deriveStats,
  parseCombatConfig,
  parseMovesConfig,
  synergyGroups,
  type Action,
  type BattleConfig,
  type Combatant,
  type FamilyId,
  type Move,
} from "../src/index.ts";
import { CFG as GCFG } from "./genetics-helpers.ts";

export { GCFG };

/** Configs reales; los `patch` modifican una copia del JSON crudo antes de validar. */
/** Copia del JSON de combate con el descanso (V2) fijado en desactivado: los tests de reglas lo asumen; el JSON del juego lo activa (nov 2026). */
function baseCombatClone(): any {
  const c = structuredClone(rawCombat) as any;
  c.variantes.descanso.activo = false;
  return c;
}
export function loadBattleConfig(patchCombat?: (raw: any) => void, patchMoves?: (raw: any) => void): BattleConfig {
  const c = baseCombatClone();
  const m = structuredClone(rawMoves) as any;
  if (patchCombat) patchCombat(c);
  if (patchMoves) patchMoves(m);
  return { combat: parseCombatConfig(c), moves: parseMovesConfig(m, GCFG) };
}
export const BCFG = loadBattleConfig();
export const rawCombatClone = (): any => baseCombatClone();
export const rawMovesClone = (): any => structuredClone(rawMoves);

/** Movimiento hecho a mano (el motor no lo valida; solo lo usa). */
export function mkMove(over: Partial<Move> = {}): Move {
  return {
    id: "mov:test",
    key: "llama|cabeza|0000",
    family: "llama",
    locus: "cabeza",
    name: "Prueba",
    cost: 1,
    archetype: "golpe",
    scalable: "dano",
    power: 50,
    target: "enemigo",
    area: false,
    status: null,
    extraEnergy: 0,
    modifier: null,
    condition: null,
    scalablePoints: 10,
    points: 10,
    budget: 8,
    fallback: 0,
    ...over,
  };
}

/** Combatiente equilibrado (P = V = R ⇒ vida 220, fA 1, iniciativa 100) con movimientos dados. */
export function mkFighter(id: string, family: FamilyId, moves: Move[] = [], over: Partial<Combatant> = {}, cfg: BattleConfig = BCFG): Combatant {
  const filler = [mkMove({ family }), mkMove({ family }), mkMove({ family }), mkMove({ family })];
  return {
    id,
    family,
    groups: synergyGroups(family, cfg.combat, cfg.moves.genetics),
    ...deriveStats(120, 120, 120, cfg.combat),
    moves: [...moves, ...filler].slice(0, 4),
    ...over,
  };
}

/** Equipo de 4 de la misma familia. */
export function mkTeam(prefix: string, family: FamilyId, moves: Move[] = [], cfg: BattleConfig = BCFG): Combatant[] {
  return [1, 2, 3, 4].map((i) => mkFighter(`${prefix}${i}`, family, moves, {}, cfg));
}

/** Plan con la misma acción para las posiciones dadas. */
export function planOf(actors: number[], move: number, target: number): Action[] {
  return actors.map((actor) => ({ actor, move, target }));
}
export const ALL = [1, 2, 3, 4];

// ---------------------------------------------------------------- combate v0.4 (config vigente)
import rawCombat04 from "../../../config/combate.v0.4.json" with { type: "json" };
import rawMoves04 from "../../../config/movimientos.v0.4.json" with { type: "json" };
export const rawCombat04Clone = (): any => structuredClone(rawCombat04);
export const rawMoves04Clone = (): any => structuredClone(rawMoves04);
/** Configs v0.4 (vigentes); los `patch` modifican una copia del JSON crudo antes de validar. */
export function loadBattleConfig04(patchCombat?: (raw: any) => void, patchMoves?: (raw: any) => void): BattleConfig {
  const c = rawCombat04Clone();
  const m = rawMoves04Clone();
  if (patchCombat) patchCombat(c);
  if (patchMoves) patchMoves(m);
  return { combat: parseCombatConfig(c), moves: parseMovesConfig(m, GCFG) };
}
export const BCFG04 = loadBattleConfig04();
/** v0.4 sin azar en el orden ni en el daño, sin desgaste: daño = potencia (stats equilibradas, llama vs llama). */
export const FLAT04 = loadBattleConfig04((r) => {
  r.dano.varianza = 0;
  r.orden.jitter = 0;
  r.desgaste.desde_turno = 99;
});
/** Movimiento gratis hecho a mano (coste 0, locus extremidades). */
export function mkFree(over: Partial<Move> = {}): Move {
  return mkMove({ id: "mov:gratis", locus: "extremidades", cost: 0, power: 15, budget: 3, points: 3, scalablePoints: 3, ...over });
}
/** Alma v0.4: [m1, m2, gratis, m4] (por defecto, golpes de 50 de coste 1 y gratis de 15). */
export function mk04(id: string, moves: Partial<Record<1 | 2 | 3 | 4, Move>> = {}, over: Partial<Combatant> = {}, cfg: BattleConfig = FLAT04): Combatant {
  return mkFighter(id, "llama", [moves[1] ?? mkMove(), moves[2] ?? mkMove(), moves[3] ?? mkFree(), moves[4] ?? mkMove()], over, cfg);
}
