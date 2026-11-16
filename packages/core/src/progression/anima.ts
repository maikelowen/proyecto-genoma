/**
 * Ánima del jugador: niveles, huecos de movimiento (D-067), revelaciones y combatiente
 * (progresión v0.1 §4, §8). Sin tiradas.
 */
import { buildCombatant, type Combatant } from "../combat/combatant.ts";
import type { Creature, LocusId } from "../genetics/types.ts";
import type { Move } from "../moves/generate.ts";
import { posKey, type ProgressionConfig, type VariantAxis } from "./config.ts";
import { assembleExact, geneMove, variantOffer, type VariantOffer } from "./variants.ts";

/** progresión §8.1 — hueco de movimiento. `null` = cerrado por nivel. */
export type MoveSlot =
  | null
  | { readonly fuente: "gen"; readonly locus: LocusId; readonly variante: boolean }
  | { readonly fuente: "habilidad"; readonly id: string };
export type MoveSlots = readonly [MoveSlot, MoveSlot, MoveSlot, MoveSlot];

/** progresión §4.5 / §8.1 — variante elegida (definitiva), guardada como la pieza cambiada (QA B-08). */
export interface ChosenVariant {
  readonly nivel: number;
  readonly eje: VariantAxis;
  readonly pieza: string;
}

export type AnimaOrigin = "inicial" | "captura" | "eco";

/** progresión §8.1 `AnimaGuardada` (claves del formato de guardado §7.1). */
export interface Anima {
  readonly id: string;
  readonly nombre: string;
  /** GEN, inmutable: `criatura.id` = `id` y `criatura.birth` = `nacimiento`. */
  readonly criatura: Creature;
  /** Experiencia total; el nivel se deriva (§4.1). */
  readonly xp: number;
  readonly origen: AnimaOrigin;
  /** Zona de captura, o null (inicial, eco). */
  readonly lugar: string | null;
  readonly nacimiento: number;
  readonly huecos: MoveSlots;
  /** Posiciones de ocultos reveladas ("cabeza.R1"), en orden de revelación. */
  readonly revelados: readonly string[];
  /** Habilidades enseñables (vacío en el paso 1). */
  readonly aprendidas: readonly string[];
  readonly variantes: Readonly<Partial<Record<LocusId, ChosenVariant>>>;
}

/** progresión §7.1 — id de ánima: "a" + nacimiento con 6 dígitos. */
export function animaId(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 999999) throw new RangeError(`animaId: ${n}`);
  return "a" + String(n).padStart(6, "0");
}

/** progresión §4.1 — nivel = mayor L con xp ≥ xp_total[L − 1]. */
export function levelOf(xp: number, cfg: ProgressionConfig): number {
  const t = cfg.levels.xpTotal;
  let L = 1;
  while (L < t.length && xp >= (t[L] as number)) L++;
  return L;
}
/** progresión §4.1 — experiencia total para estar en el nivel `level`. */
export function xpForLevel(level: number, cfg: ProgressionConfig): number {
  const x = cfg.levels.xpTotal[level - 1];
  if (x === undefined) throw new RangeError(`xpForLevel: nivel ${level}`);
  return x;
}
export function animaLevel(a: Anima, cfg: ProgressionConfig): number {
  return levelOf(a.xp, cfg);
}
/** progresión §4.3 — madura (puede resonar) desde `nivel_madurar`. */
export function isMature(level: number, cfg: ProgressionConfig): boolean {
  return level >= cfg.unlocks.matureLevel;
}

/** progresión §4.3 — huecos abiertos a un nivel: [gratis, pago 1, pago 2, pago 3]. */
export function unlockedSlots(level: number, cfg: ProgressionConfig): [boolean, boolean, boolean, boolean] {
  const p = cfg.unlocks.paidSlots;
  return [true, level >= (p[0] as { level: number }).level, level >= (p[1] as { level: number }).level, level >= (p[2] as { level: number }).level];
}

/**
 * progresión §8.1 — abre los huecos que tocan a `level`: cada hueco nuevo se rellena con su
 * `locus_por_defecto` si no está ya en otro hueco; si lo está, con el primer locus de pago libre
 * en el orden de los huecos de pago (cola, cabeza, cuerpo). Los ya abiertos no cambian.
 */
export function openSlots(slots: MoveSlots | null, level: number, cfg: ProgressionConfig): MoveSlots {
  const open = unlockedSlots(level, cfg);
  const out: MoveSlot[] = slots ? slots.slice() : [null, null, null, null];
  out[0] = out[0] ?? Object.freeze({ fuente: "gen", locus: cfg.unlocks.freeLocus, variante: false });
  const used = (L: LocusId): boolean => out.some((s) => s !== null && s.fuente === "gen" && s.locus === L);
  const paidOrder = cfg.unlocks.paidSlots.map((p) => p.defaultLocus);
  for (let k = 1; k <= 3; k++) {
    if (!open[k] || out[k] !== null) continue;
    const def = (cfg.unlocks.paidSlots[k - 1] as { defaultLocus: LocusId }).defaultLocus;
    const L = !used(def) ? def : paidOrder.find((x) => !used(x));
    if (L !== undefined) out[k] = Object.freeze({ fuente: "gen", locus: L, variante: false });
  }
  return Object.freeze(out) as unknown as MoveSlots;
}

/** progresión §4.4 — posiciones de ocultos que revela el nivel (todas las de niveles ≤ `level`). */
export function revealedByLevel(level: number, cfg: ProgressionConfig): string[] {
  const out: string[] = [];
  cfg.unlocks.revealLevels.forEach((L, i) => {
    if (L <= level) out.push(posKey(cfg.unlocks.revealOrder[i] as { locus: LocusId; slot: "R1" | "R2" }));
  });
  return out;
}

/** Movimiento de un hueco (variante si `variante = true` y es reensamblable; si no, el original). */
export function slotMove(a: Pick<Anima, "criatura" | "variantes">, slot: MoveSlot, cfg: ProgressionConfig): Move | null {
  if (slot === null) return null;
  if (slot.fuente === "habilidad") throw new RangeError("slotMove: las habilidades llegan en el paso 2");
  const original = geneMove(a.criatura, slot.locus, cfg);
  if (!slot.variante) return original;
  const v = a.variantes[slot.locus];
  return (v ? assembleExact(original, { eje: v.eje, pieza: v.pieza }, cfg.battle.moves) : null) ?? original;
}

/**
 * progresión §8.3 `combatienteDeAnima` — `buildCombatant(criatura)` con los movimientos de los
 * huecos abiertos, en orden de hueco (gratis primero): de 2 a 4 movimientos. Id = id del ánima.
 */
export function combatantFromSlots(a: Pick<Anima, "id" | "criatura" | "variantes" | "huecos">, cfg: ProgressionConfig): Combatant {
  const base = buildCombatant(a.criatura, cfg.battle);
  const moves: Move[] = [];
  for (const s of a.huecos) {
    const m = slotMove(a, s, cfg);
    if (m !== null) moves.push(m);
  }
  return Object.freeze({ ...base, id: a.id, moves: Object.freeze(moves) });
}
export function combatantOf(a: Anima, cfg: ProgressionConfig): Combatant {
  return combatantFromSlots(a, cfg);
}

/** Combatiente de una criatura de nivel dado con los movimientos originales de ese nivel (salvajes, acompañante). */
export function combatantAtLevel(c: Creature, level: number, cfg: ProgressionConfig, id: string = c.id): Combatant {
  return combatantFromSlots({ id, criatura: c, variantes: {}, huecos: openSlots(null, level, cfg) }, cfg);
}

/**
 * progresión §4.3 (QA B-03) y §4.5 — ofertas de variante pendientes: niveles de variante ≤ nivel
 * sin elección guardada, calculados en orden (cada oferta reserva su locus para las siguientes).
 */
export function pendingVariants(a: Pick<Anima, "criatura" | "variantes" | "xp">, cfg: ProgressionConfig): VariantOffer[] {
  const level = levelOf(a.xp, cfg);
  const done = new Set(Object.values(a.variantes).map((v) => (v as ChosenVariant).nivel));
  const taken = new Set(Object.keys(a.variantes) as LocusId[]);
  const out: VariantOffer[] = [];
  for (const L of cfg.variants.levels) {
    if (L > level || done.has(L)) continue;
    const offer = variantOffer(a.criatura, L, taken, cfg);
    if (offer === null) continue;
    out.push(offer);
    taken.add(offer.locus);
  }
  return out;
}
