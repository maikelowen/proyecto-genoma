/**
 * Variantes de movimiento de los niveles 15/20/25/30 (progresión v0.1 §4.5, D-068, D-070).
 * Funciones puras: dependen solo de la clave del gen, el nivel y las configs.
 * Consumo fijo: 2 tiradas de `createRng(prefijo + clave + "|" + nivel)` por oferta.
 */
import { createRng } from "../rng.ts";
import { geneKey } from "../genetics/gene.ts";
import type { Creature, LocusId } from "../genetics/types.ts";
import {
  CONDITION_IDS,
  MODIFIER_IDS,
  OFFENSIVE_STATUS_IDS,
  type ConditionId,
  type ModifierId,
  type MovesConfig,
  type MoveStatusId,
} from "../moves/config.ts";
import { generateMove, validateMove, type Move } from "../moves/generate.ts";
import type { ProgressionConfig, VariantAxis } from "./config.ts";

/** Pieza que quita la que había ("potencia en vez de estado", D-070). */
export const NO_PIECE = "ninguno";

/** Cambio de una pieza: lo que se guarda (QA B-08). */
export interface PieceChange {
  readonly eje: VariantAxis;
  readonly pieza: string;
}

/** Movimiento variante: el original con una pieza cambiada; `variant` solo existe en variantes. */
export type VariantMove = Move & { readonly variant: PieceChange };

export interface VariantCandidate {
  readonly change: PieceChange;
  readonly move: VariantMove;
  readonly effectivePoints: number;
}

/** Oferta de variante de un nivel (A y, si hay, B). */
export interface VariantOffer {
  readonly level: number;
  /** Locus final (el del nivel o el del respaldo, QA B-09). */
  readonly locus: LocusId;
  readonly key: string;
  readonly original: Move;
  readonly A: VariantCandidate;
  /** null si el locus solo tiene un candidato (se ofrece solo A). */
  readonly B: VariantCandidate | null;
}

function fixedOf(modifier: ModifierId | null, mcfg: MovesConfig): number {
  return modifier === "alcance" || modifier === "prioridad" || modifier === "perforar" ? mcfg.modifiers[modifier] : 0;
}
function fEscOf(condition: ConditionId | null, modifier: ModifierId | null, mcfg: MovesConfig): number {
  return (condition ? 1 + mcfg.conditions.bonus * mcfg.conditions.factor[condition] : 1) * (modifier === "drenaje" ? mcfg.modifiers.drainFactor : 1);
}
function extraOf(m: { readonly status: MoveStatusId | null; readonly extraEnergy: 0 | 1; readonly taunt?: true | undefined }, mcfg: MovesConfig): number {
  return (m.status ? mcfg.statusCost[m.status] : 0) + (m.extraEnergy ? mcfg.extraEnergy.cost : 0) + (m.taunt ? mcfg.taunt.cost : 0);
}
function capOf(m: Pick<Move, "scalable" | "area">, mcfg: MovesConfig): number {
  if (m.scalable === "dano") return m.area ? mcfg.scalables.dano.maxArea : mcfg.scalables.dano.max;
  return mcfg.scalables[m.scalable].max;
}

/**
 * progresión §4.5 (QA B-01) — puntos efectivos: los puntos que de verdad rinde el movimiento,
 * contando el tope y el redondeo de la potencia.
 * ptsEf = min(potencia, tope) / potencia_por_punto; puntosEf = fijo + fac·extra + fac·fEsc·ptsEf.
 */
export function effectivePoints(m: Move, mcfg: MovesConfig): number {
  const fac = m.area ? mcfg.modifiers.areaFactor : 1;
  const ptsEf = Math.min(m.power, capOf(m, mcfg)) / mcfg.scalables[m.scalable].perPoint;
  return fixedOf(m.modifier, mcfg) + fac * extraOf(m, mcfg) + fac * fEscOf(m.condition, m.modifier, mcfg) * ptsEf;
}

/**
 * progresión §4.5 / §10.1 `assembleExact` — reensambla `move` con una pieza cambiada, con el
 * presupuesto de `move` y la fórmula de movimientos §4.1 **sin respaldo**: si no cabe o el
 * resultado no es válido (movimientos §3), null. Mismo arquetipo, coste, escalable, nombre e id.
 */
export function assembleExact(move: Move, change: PieceChange, mcfg: MovesConfig): VariantMove | null {
  const none = change.pieza === NO_PIECE;
  let modifier = move.modifier;
  let status = move.status;
  let condition = move.condition;
  if (change.eje === "modificador") {
    if (!none && !(MODIFIER_IDS as readonly string[]).includes(change.pieza)) return null;
    modifier = none ? null : (change.pieza as ModifierId);
  } else if (change.eje === "estado") {
    if (move.extraEnergy || move.taunt) return null; // la energía y provocar no se tocan (§4.5)
    if (!none && !(OFFENSIVE_STATUS_IDS as readonly string[]).includes(change.pieza) && change.pieza !== "prisa" && change.pieza !== "regenerar") return null;
    status = none ? null : (change.pieza as MoveStatusId);
  } else if (change.eje === "condicion") {
    if (!none && !(CONDITION_IDS as readonly string[]).includes(change.pieza)) return null;
    condition = none ? null : (change.pieza as ConditionId);
  } else return null;
  if (modifier === move.modifier && status === move.status && condition === move.condition) return null; // no cambia nada
  const rule = mcfg.archetypes[move.archetype];
  const area = rule.forcedArea || modifier === "area";
  const fac = area ? mcfg.modifiers.areaFactor : 1;
  const fixed = fixedOf(modifier, mcfg);
  const fEsc = fEscOf(condition, modifier, mcfg);
  const extra = extraOf({ status, extraEnergy: move.extraEnergy, taunt: move.taunt }, mcfg);
  const budget = move.budget;
  // movimientos §4.1 (sin respaldo): pts = floor((presupuesto − fijo − fac·extra) / (fac·fEsc))
  const L = budget - fixed - fac * extra;
  const pts = L > 0 ? Math.floor(L / (fac * fEsc)) : 0;
  if (pts < mcfg.scalables.minPoints || fac * fEsc * pts < mcfg.scalables.minFraction * budget) return null;
  if (move.taunt && rule.scalable === "escudo" && fac * fEsc * pts < mcfg.taunt.minShieldFraction * budget) return null;
  const step = mcfg.scalables.step;
  const power = Math.min(Math.floor((pts * mcfg.scalables[rule.scalable].perPoint) / step) * step, capOf({ scalable: rule.scalable, area }, mcfg));
  const out: VariantMove = Object.freeze({
    ...move,
    area,
    status,
    modifier,
    condition,
    power,
    scalablePoints: pts,
    points: fixed + fac * extra + fac * fEsc * pts,
    fallback: 0 as const,
    variant: Object.freeze({ eje: change.eje, pieza: change.pieza }),
  });
  // movimientos §3: reglas de validez (incluidas fraccion_minima, topes, gratis y cola)
  return validateMove(out, mcfg).length === 0 ? out : null;
}

/**
 * progresión §4.5 — alternativas de cada eje (tabla cerrada, QA B-05), en el orden de los ejes
 * de la config y, dentro de cada eje, en el orden de movimientos con "ninguno" al final.
 * Excluye la pieza que ya tiene el movimiento y las de `piezas_excluidas`.
 */
export function variantAlternatives(move: Move, cfg: ProgressionConfig): PieceChange[] {
  const mcfg = cfg.battle.moves;
  const rule = mcfg.archetypes[move.archetype];
  const free = mcfg.free !== null && move.locus === mcfg.free.locus ? mcfg.free : null;
  const tail = mcfg.tailGuarantee !== null && move.locus === mcfg.tailGuarantee.locus ? mcfg.tailGuarantee : null;
  const byAxis: Record<VariantAxis, (string | null)[]> = { modificador: [], estado: [], condicion: [] };

  // eje modificador
  if (free) {
    // gratis: solo alcance, drenaje + ninguno
    byAxis.modificador = [...MODIFIER_IDS.filter((x) => free.modifiers.includes(x) && rule.modifiers.includes(x)), null];
  } else if (tail && !rule.forcedArea) {
    // cola (no maldición): solo alcance ↔ área, si el arquetipo admite área
    if (move.modifier === tail.forcedModifier && rule.modifiers.includes("area")) byAxis.modificador = ["area"];
    else if (move.modifier === "area" && rule.modifiers.includes(tail.forcedModifier)) byAxis.modificador = [tail.forcedModifier];
  } else {
    byAxis.modificador = [...MODIFIER_IDS.filter((x) => rule.modifiers.includes(x)), null];
  }

  // eje estado: sin eje con energía extra o provocar
  if (!move.extraEnergy && !move.taunt) {
    let pool: string[];
    if (free) {
      // gratis: golpe_estado → estados ofensivos de coste ≤ coste_max_estado; protección y curación sin eje
      pool = rule.statusPool === "ofensivos" ? OFFENSIVE_STATUS_IDS.filter((s) => mcfg.statusCost[s] <= free.maxStatusCost && (s !== "aturdir" || move.cost >= mcfg.stunMinCost)) : [];
    } else if (rule.statusPool === "ofensivos") {
      pool = OFFENSIVE_STATUS_IDS.filter((s) => s !== "aturdir" || move.cost >= mcfg.stunMinCost); // aturdir solo con c ≥ 3
    } else if (rule.statusPool === "positivos") {
      pool = ["prisa", "regenerar"];
    } else {
      pool = rule.statusPool.filter((s) => s !== NO_PIECE);
    }
    // golpe: sin eje (añadir estado lo haría golpe_estado)
    if (pool.length > 0) byAxis.estado = [...pool, null];
  }

  // eje condición: las 5 + ninguna
  byAxis.condicion = [...CONDITION_IDS, null];

  const current: Record<VariantAxis, string | null> = { modificador: move.modifier, estado: move.status, condicion: move.condition };
  const out: PieceChange[] = [];
  for (const axis of cfg.variants.axes) {
    for (const p of byAxis[axis]) {
      if (p === current[axis]) continue;
      if (p !== null && cfg.variants.excluded.includes(p)) continue;
      out.push({ eje: axis, pieza: p ?? NO_PIECE });
    }
  }
  return out;
}

/**
 * progresión §4.5 — candidatos válidos `C` (orden: eje, luego pieza): ensamblado exacto,
 * válido según movimientos §3 y puntosEf(M) − holgura ≤ puntosEf(c) ≤ puntosEf(M) + tolerancia_puntos
 * (D-070, QA B-01; D-072/N-01: hasta 1 punto más, un paso de redondeo). Además, una variante que
 * AÑADE una pieza en un eje vacío tiene que perder potencia (nunca una pieza gratis).
 */
export function variantCandidates(move: Move, cfg: ProgressionConfig): VariantCandidate[] {
  const mcfg = cfg.battle.moves;
  const tol = cfg.variants.tolerance;
  const base = effectivePoints(move, mcfg);
  const out: VariantCandidate[] = [];
  for (const change of variantAlternatives(move, cfg)) {
    const m = assembleExact(move, change, mcfg);
    if (m === null) continue;
    const pe = effectivePoints(m, mcfg);
    if (pe > base + cfg.variants.tolerancePoints + tol || pe < base - cfg.variants.slack - tol) continue;
    if (addsPiece(move, change) && !(m.power < move.power)) continue; // D-072/N-01: sin pieza gratis
    out.push(Object.freeze({ change: m.variant, move: m, effectivePoints: pe }));
  }
  return out;
}

/** D-072/N-01 — ¿el cambio pone una pieza donde el eje estaba vacío? */
function addsPiece(move: Move, change: PieceChange): boolean {
  if (change.pieza === NO_PIECE) return false;
  const current = change.eje === "modificador" ? move.modifier : change.eje === "estado" ? move.status : move.condition;
  return current === null;
}

/** Movimiento de gen del D de un locus (movimientos §4, con la sal del catálogo si la tiene). */
export function geneMove(creature: Creature, locus: LocusId, cfg: ProgressionConfig): Move {
  return generateMove(creature.genome[locus].D, cfg.battle.moves);
}

/**
 * progresión §4.5 — sorteo de A y B sobre los candidatos de un movimiento (2 tiradas fijas,
 * `createRng(prefijo + clave + "|" + nivel)`), sin respaldo: n = 0 → null; n = 1 → solo A.
 */
export function moveVariants(move: Move, level: number, cfg: ProgressionConfig): { readonly A: VariantCandidate; readonly B: VariantCandidate | null } | null {
  const C = variantCandidates(move, cfg);
  return drawPair(C, move.key, level, cfg);
}

function drawPair(C: readonly VariantCandidate[], key: string, level: number, cfg: ProgressionConfig): { readonly A: VariantCandidate; readonly B: VariantCandidate | null } | null {
  const rng = createRng(cfg.variants.seedPrefix + key + "|" + level);
  const u1 = rng.next(); // siempre las 2 tiradas
  const u2 = rng.next();
  const n = C.length;
  if (n === 0) return null;
  const A = C[Math.floor(u1 * n)] as VariantCandidate;
  if (n === 1) return { A, B: null };
  let R = C.filter((c) => c.change.eje !== A.change.eje);
  if (R.length === 0) R = C.filter((c) => c !== A);
  return { A, B: R[Math.floor(u2 * R.length)] as VariantCandidate };
}

/**
 * progresión §4.5 (QA B-09) — oferta de un nivel de variante para una criatura, dados los loci
 * que ya tienen variante (o una oferta pendiente anterior). Locus del nivel si tiene n ≥ 2;
 * si no, el primero de `orden_respaldo` con n ≥ 2 y sin variante; si no, el primero con n = 1
 * (solo A); si no, null (el nivel solo revela). Las 2 tiradas son las del locus final.
 */
export function variantOffer(creature: Creature, level: number, taken: ReadonlySet<LocusId>, cfg: ProgressionConfig): VariantOffer | null {
  const nominal = cfg.variants.locusByLevel[level];
  if (nominal === undefined) throw new RangeError(`variantOffer: ${level} no es nivel de variante`);
  const cands = new Map<LocusId, VariantCandidate[]>();
  const candsOf = (L: LocusId): VariantCandidate[] => {
    let c = cands.get(L);
    if (c === undefined) {
      c = variantCandidates(geneMove(creature, L, cfg), cfg);
      cands.set(L, c);
    }
    return c;
  };
  const order: LocusId[] = [nominal, ...cfg.variants.fallbackOrder.filter((L) => L !== nominal)];
  let chosen: LocusId | null = null;
  for (const L of order) if (!taken.has(L) && candsOf(L).length >= 2) { chosen = L; break; }
  if (chosen === null) for (const L of cfg.variants.fallbackOrder) if (!taken.has(L) && candsOf(L).length === 1) { chosen = L; break; }
  if (chosen === null) return null;
  const original = geneMove(creature, chosen, cfg);
  const pair = drawPair(candsOf(chosen), original.key, level, cfg) as { A: VariantCandidate; B: VariantCandidate | null };
  return Object.freeze({ level, locus: chosen, key: geneKey(creature.genome[chosen].D), original, A: pair.A, B: pair.B });
}
