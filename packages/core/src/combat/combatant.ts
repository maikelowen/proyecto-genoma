/** Combatiente: estadísticas derivadas de una criatura (combate §1) y sus 4 movimientos. */
import { expressedGenes, expressedStats } from "../genetics/creature.ts";
import type { Creature, FamilyId, GeneticsConfig } from "../genetics/types.ts";
import { generateMove, type Move } from "../moves/generate.ts";
import type { MovesConfig } from "../moves/config.ts";
import type { CombatConfig } from "./config.ts";

/** Configs necesarias para combatir (motor + movimientos; genética vía moves.genetics). */
export interface BattleConfig {
  readonly combat: CombatConfig;
  readonly moves: MovesConfig;
}

/** Parte estática de una criatura en combate (no cambia durante la partida). */
export interface Combatant {
  readonly id: string;
  readonly family: FamilyId;
  /** combate §7: grupos de sinergia (su familia y, si es híbrida, sus 2 componentes). */
  readonly groups: readonly FamilyId[];
  /** combate §1: P, V, R, T y q. */
  readonly stats: { readonly P: number; readonly V: number; readonly R: number; readonly T: number; readonly q: number };
  readonly maxHp: number;
  /** Factor de ataque fA. */
  readonly attack: number;
  /** Iniciativa base. */
  readonly initiative: number;
  /** Movimientos 1–4 por locus (cabeza, cuerpo, extremidades, cola). */
  readonly moves: readonly Move[];
}

/** combate §1 — estadísticas derivadas a partir de P, V, R (sin funciones trascendentes). */
export function deriveStats(P: number, V: number, R: number, cfg: CombatConfig): Pick<Combatant, "stats" | "maxHp" | "attack" | "initiative"> {
  const s = cfg.stats;
  const T = P + V + R;
  if (!(T > 0)) throw new RangeError(`deriveStats: total no positivo (${T})`);
  const sP = P / T;
  const sV = V / T;
  const sR = R / T;
  const q = 1 + (s.betaQuality * (T - s.totalRef)) / s.totalRef; // combate §1 factor de calidad
  return {
    stats: { P, V, R, T, q },
    maxHp: Math.round(s.baseHp * (1 + s.alphaHp * (3 * sR - 1)) * q), // combate §1 vida máxima
    attack: (1 + s.alphaPower * (3 * sP - 1)) * q, // combate §1 fA
    initiative: s.baseInitiative + s.initiativeScale * (3 * sV - 1), // combate §1 iniciativa base
  };
}

/** combate §7: grupos de sinergia de una familia. */
export function synergyGroups(family: FamilyId, combat: CombatConfig, genetics: GeneticsConfig): FamilyId[] {
  const h = genetics.hybridById.get(family);
  return h && combat.synergy.hybridsCountComponents ? [family, h.components[0], h.components[1]] : [family];
}

/** Construye el combatiente de una criatura: estadísticas (§1) y movimientos de sus 4 D. */
export function buildCombatant(creature: Creature, cfg: BattleConfig): Combatant {
  const combat = cfg.combat;
  if (!combat.families.table[creature.family]) throw new RangeError(`buildCombatant: familia '${creature.family}' sin fila en la tabla de familias`);
  const st = expressedStats(creature);
  const d = deriveStats(st.potencia, st.velocidad, st.resistencia, combat);
  return Object.freeze({
    id: creature.id,
    family: creature.family,
    groups: Object.freeze(synergyGroups(creature.family, combat, cfg.moves.genetics)),
    ...d,
    moves: Object.freeze(expressedGenes(creature).map((g) => generateMove(g, cfg.moves))),
  });
}

/** Sustituye un movimiento (1–4) de un combatiente (prueba de sustitución, movimientos §7). */
export function withMove(c: Combatant, slot: number, move: Move): Combatant {
  if (!Number.isInteger(slot) || slot < 1 || slot > c.moves.length) throw new RangeError(`withMove: hueco ${slot}`);
  const moves = c.moves.slice();
  moves[slot - 1] = move;
  return Object.freeze({ ...c, moves: Object.freeze(moves) });
}
