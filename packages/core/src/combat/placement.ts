/**
 * Colocación en la cuadrícula 2×2 (combate v0.4 §1 y §7). Sin tiradas.
 *
 * Una colocación es la lista de casillas (1–4) de cada alma, en el orden del
 * equipo: `[1, 2, 3]` pone la 1.ª alma en la casilla 1, la 2.ª en la 2 y la
 * 3.ª en la 3 (forma "2+1"). La casilla que falta queda vacía (`null` en el estado).
 */
import type { CombatConfig } from "./config.ts";
import type { Combatant } from "./combatant.ts";

/** Casilla (1–4) de cada alma del equipo, en orden. */
export type Placement = readonly number[];

/** combate v0.4 §1 — forma "d+t" (almas delante + detrás) de una colocación. */
export function placementShape(placement: Placement, cfg: CombatConfig): string {
  const front = placement.filter((p) => cfg.frontRow.includes(p)).length;
  return `${front}+${placement.length - front}`;
}

/**
 * combate v0.4 §1 — valida una colocación sin tiradas: exactamente `tamano`
 * casillas enteras de 1 a `casillas`, sin repetir, y forma ∈ `equipo.colocaciones`.
 * Devuelve null si es válida o el motivo.
 */
export function validatePlacement(placement: unknown, cfg: CombatConfig): string | null {
  if (!Array.isArray(placement)) return "la colocación no es una lista";
  if (placement.length !== cfg.teamSize) return `deben ser ${cfg.teamSize} casillas`;
  for (const p of placement) if (!Number.isInteger(p) || p < 1 || p > cfg.slots) return `casilla inválida ${String(p)}`;
  if (new Set(placement).size !== placement.length) return "casilla repetida";
  const shape = placementShape(placement as number[], cfg);
  if (!cfg.placements.includes(shape)) return `forma ${shape} no permitida (${cfg.placements.join(", ")})`;
  return null;
}

/** combate v0.4 §1 — todas las colocaciones válidas (24 con 3 almas), en orden lexicográfico. */
export function allPlacements(cfg: CombatConfig): number[][] {
  const out: number[][] = [];
  const cur: number[] = [];
  const rec = (): void => {
    if (cur.length === cfg.teamSize) {
      if (validatePlacement(cur, cfg) === null) out.push(cur.slice());
      return;
    }
    for (let p = 1; p <= cfg.slots; p++) {
      if (cur.includes(p)) continue;
      cur.push(p);
      rec();
      cur.pop();
    }
  };
  rec();
  return out;
}

/**
 * combate v0.4 §7 — colocación de la IA de referencia (determinista, sin tiradas):
 * almas por vida máxima descendente (empate: índice en el equipo); si
 * vida(1.ª) ≥ umbral_1_2 · vida(2.ª), "1+2" (1.ª en 1, 2.ª en 3, 3.ª en 4);
 * si no, "2+1" (1.ª en 1, 2.ª en 2, 3.ª en 3). Sin casilla vacía: orden del equipo.
 */
export function referencePlacement(team: readonly Combatant[], cfg: CombatConfig): number[] {
  const rule = cfg.ai.placement;
  if (rule === null || team.length !== 3) return team.map((_, i) => i + 1);
  const rank = team.map((c, i) => ({ hp: c.maxHp, i }));
  rank.sort((a, b) => b.hp - a.hp || a.i - b.i);
  const [first, second, third] = rank as [{ hp: number; i: number }, { hp: number; i: number }, { hp: number; i: number }];
  const slotsFor = first.hp >= rule.threshold12 * second.hp ? [1, 3, 4] : [1, 2, 3];
  const out: number[] = [0, 0, 0];
  out[first.i] = slotsFor[0] as number;
  out[second.i] = slotsFor[1] as number;
  out[third.i] = slotsFor[2] as number;
  // si la forma elegida no está permitida en la config, la primera colocación válida
  return validatePlacement(out, cfg) === null ? out : ((allPlacements(cfg)[0] as number[]) ?? out);
}
