/**
 * Generación procedural de movimientos (spec movimientos v0.2 §4):
 * gen → movimiento, función pura de la clave `familia|locus|firma`.
 * Consume siempre `tiradas_por_movimiento` (8) tiradas de un RNG propio
 * sembrado con la clave, así que no toca ningún otro RNG.
 */
import { createRng } from "../rng.ts";
import { geneKey } from "../genetics/gene.ts";
import { LOCUS_IDS, type FamilyId, type Gene, type LocusId } from "../genetics/types.ts";
import {
  ARCHETYPE_IDS,
  CONDITION_IDS,
  MODIFIER_IDS,
  OFFENSIVE_STATUS_IDS,
  POSITIVE_STATUS_IDS,
  type ArchetypeId,
  type ConditionId,
  type FamilyWeightTable,
  type ModifierId,
  type MovesConfig,
  type MoveStatusId,
  type MoveTarget,
  type ScalableId,
} from "./config.ts";

/** movimientos §1.1 (nombres de campo en inglés; valores de datos en español). */
export interface Move {
  /** Campo `movimiento` del gen (p. ej. "mov:llama.cabeza.1" o "mov:prov:…"). */
  readonly id: string;
  /** Clave del gen que lo genera (familia|locus|firma). */
  readonly key: string;
  /** Familia del movimiento = familia del gen (combate §5, `fam`). */
  readonly family: FamilyId;
  readonly locus: LocusId;
  readonly name: string;
  /** Coste de energía c ∈ 1..5; 0 = movimiento gratis (movimientos v0.4 §2, locus `gratis.locus`). */
  readonly cost: number;
  readonly archetype: ArchetypeId;
  readonly scalable: ScalableId;
  readonly power: number;
  readonly target: MoveTarget;
  readonly area: boolean;
  readonly status: MoveStatusId | null;
  /** 0 | 1: lleva energía extra (táctico con c ≥ 3). */
  readonly extraEnergy: 0 | 1;
  readonly modifier: ModifierId | null;
  readonly condition: ConditionId | null;
  /** Puntos asignados al escalable (`pts` de §4.1). */
  readonly scalablePoints: number;
  readonly points: number;
  readonly budget: number;
  /**
   * variantes v0.3 §2 V4: lleva la pieza "provocar" (al usuario). El campo solo
   * existe (`true`) en los movimientos que la llevan: con la variante
   * desactivada ningún movimiento cambia.
   */
  readonly taunt?: true;
  /** §4.1 [v0.2]: 0 sin respaldo; 1 quitó condición; 2 quitó modificador; 3 quitó estado/energía; 4 pasó a golpe. */
  readonly fallback: 0 | 1 | 2 | 3 | 4;
}

/** Descompone una clave de gen y obtiene la forma desde la firma (genética v0.2 §8). */
export function parseGeneKey(key: string, mcfg: MovesConfig): { family: FamilyId; locus: LocusId; signature: string; shape: number[] } {
  const g = mcfg.genetics;
  const parts = key.split("|");
  if (parts.length !== 3) throw new RangeError(`clave de gen inválida '${key}'`);
  const [family, locus, signature] = parts as [string, string, string];
  if (!g.baseFamilies.includes(family) && !g.hybridById.has(family)) throw new RangeError(`familia desconocida en '${key}'`);
  if (!(LOCUS_IDS as readonly string[]).includes(locus)) throw new RangeError(`locus desconocido en '${key}'`);
  const steps = g.shape.levels - 1;
  if (signature.length !== 4) throw new RangeError(`firma inválida en '${key}'`);
  const shape: number[] = [];
  for (const ch of signature) {
    const d = ch.charCodeAt(0) - 48;
    if (d < 0 || d > steps || d > 9) throw new RangeError(`firma inválida en '${key}'`);
    shape.push(d * g.shape.gridStep);
  }
  return { family, locus: locus as LocusId, signature, shape };
}

/** movimientos §4: W(tabla, fam); híbrida = suma de sus 2 componentes. */
function familyWeights(table: FamilyWeightTable, family: FamilyId, mcfg: MovesConfig): number[] {
  const t = mcfg.familyWeights[table];
  const h = mcfg.genetics.hybridById.get(family);
  if (!h) return (t[family] as readonly number[]).slice();
  const a = t[h.components[0]] as readonly number[];
  const b = t[h.components[1]] as readonly number[];
  return a.map((x, i) => x + (b[i] as number));
}

/**
 * movimientos §4 `índice ponderado(w, u)`: el primer i con u·Σw < Σ_{j≤i} w_j.
 * Devuelve −1 si Σw = 0. Por redondeo devuelve el último peso > 0.
 */
export function weightedPick(w: readonly number[], u: number): number {
  let total = 0;
  for (const x of w) total += x;
  if (!(total > 0)) return -1;
  const target = u * total;
  let acc = 0;
  let last = -1;
  for (let i = 0; i < w.length; i++) {
    const x = w[i] as number;
    if (x <= 0) continue;
    acc += x;
    last = i;
    if (target < acc) return i;
  }
  return last;
}

/** movimientos §4: el movimiento de un gen (usa `gene.move` como id). */
export function generateMove(gene: Pick<Gene, "family" | "locus" | "signature" | "move">, mcfg: MovesConfig): Move {
  return generateMoveForKey(geneKey(gene), mcfg, gene.move);
}

/**
 * movimientos §4 `generarMovimiento`: pura en (clave, MCFG, sal). Para el
 * catálogo, el id es el `movimiento` del gen base; para mutados se
 * reconstruye como en genética (`mov:prov:familia.locus.mFIRMA`).
 */
export function generateMoveForKey(key: string, mcfg: MovesConfig, id?: string): Move {
  const { family, locus, signature, shape } = parseGeneKey(key, mcfg);
  const catalog = mcfg.genetics.catalogByKey.get(key);
  const moveId = id ?? (catalog ? catalog.move : `mov:prov:${family}.${locus}.m${signature}`);
  // movimientos §5: la sal solo se aplica a genes del catálogo
  const salt = catalog ? mcfg.salts[catalog.id] : undefined;
  const rng = createRng(mcfg.seedPrefix + key + (salt !== undefined ? `|${salt}` : ""));
  // movimientos §4: u1..u8, consumidas siempre
  const u: number[] = [];
  for (let i = 0; i < mcfg.drawsPerMove; i++) u.push(rng.next());
  const [u1, u2, u3, u4, u5, u6, u7, u8] = u as [number, number, number, number, number, number, number, number];
  const [size, elong, angular, ornament] = shape as [number, number, number, number];

  // movimientos v0.4 §2–3: locus del gratis y locus con alcance garantizado
  const free = mcfg.free && locus === mcfg.free.locus ? mcfg.free : null;
  const tail = mcfg.tailGuarantee && locus === mcfg.tailGuarantee.locus ? mcfg.tailGuarantee : null;
  // §4 coste [v0.2]: c = clamp(1 + floor(desplazamiento + forma[0]·escala_tamano + u1·escala_azar), 1, 5)
  // [v0.4] el gratis cuesta 0 (u1 se consume y no se usa)
  const cc = mcfg.cost;
  const c = free ? 0 : Math.min(cc.max, Math.max(cc.min, 1 + Math.floor(cc.offset + size * cc.sizeScale + u1 * cc.randomScale)));

  // §4 arquetipo: familia + locus + forma[2] (ofensivo/defensivo)
  const wA = familyWeights("arquetipo", family, mcfg);
  const lw = mcfg.locusWeights[locus];
  ARCHETYPE_IDS.forEach((a, i) => {
    let w = (wA[i] as number) + (lw[i] as number);
    if (a === "golpe" || a === "golpe_estado") w += mcfg.shapeWeights.offensive * angular;
    if (a === "proteccion" || a === "curacion") w += mcfg.shapeWeights.defensive * (1 - angular);
    wA[i] = w;
  });
  if (free) {
    // movimientos v0.4 §2: reasignar (maldición → golpe_estado, táctico → golpe) y 0 en los no permitidos
    ARCHETYPE_IDS.forEach((a, i) => {
      const to = free.reassign[a];
      if (to !== undefined) {
        wA[ARCHETYPE_IDS.indexOf(to)] = (wA[ARCHETYPE_IDS.indexOf(to)] as number) + (wA[i] as number);
        wA[i] = 0;
      }
    });
    ARCHETYPE_IDS.forEach((a, i) => { if (!free.archetypes.includes(a)) wA[i] = 0; });
  }
  // movimientos v0.4 §3: la cola es siempre ofensiva
  if (tail) ARCHETYPE_IDS.forEach((a, i) => { if (tail.forbiddenArchetypes.includes(a)) wA[i] = 0; });
  const ai = weightedPick(wA, u2);
  // respaldo determinista si todos los pesos quedan a 0 (no ocurre con la config vigente)
  let archetype = (ai < 0 ? "golpe" : ARCHETYPE_IDS[ai]) as ArchetypeId;
  // §4 [v0.2] coste_min (maldición: c ≥ 2); si no llega, golpe_estado, sin tiradas ([v0.4] no aplica al gratis)
  if (!free && c < mcfg.archetypes[archetype].minCost) archetype = "golpe_estado";
  const rule = mcfg.archetypes[archetype];
  // movimientos v0.4 §4: ¿puede llevar provocar este movimiento?
  const T = mcfg.taunt;
  const tauntOk = !free && T.active && T.archetypes.includes(archetype) && (T.loci === null || T.loci.includes(locus));
  const pTaunt = tauntOk && T.draw === "probabilidad" ? tauntProb(family, mcfg) : 0;

  // §4 estado (u3)
  let status: MoveStatusId | null = null;
  let extraEnergy: 0 | 1 = 0;
  let taunt = false;
  if (rule.energyIfMinCost) {
    // táctico: prisa; con c ≥ 3, energía extra en su lugar (u3 no se usa)
    if (c >= mcfg.extraEnergy.minCost) extraEnergy = 1;
    else if (pTaunt > 0 && u3 < pTaunt) taunt = true; // movimientos v0.4 §4: provocar ocupa el hueco de prisa ("Desafío")
    else status = (rule.statusPool as readonly string[])[0] as MoveStatusId;
  } else if (rule.statusPool === "ofensivos") {
    const w = familyWeights("estado_ofensivo", family, mcfg);
    if (c < mcfg.stunMinCost) w[OFFENSIVE_STATUS_IDS.indexOf("aturdir")] = 0; // §2.2 aturdir solo con c ≥ 3
    // movimientos v0.4 §2: en el gratis, solo estados de coste ≤ coste_max_estado
    if (free) OFFENSIVE_STATUS_IDS.forEach((id, k) => { if (mcfg.statusCost[id] > free.maxStatusCost) w[k] = 0; });
    const i = weightedPick(w, u3);
    status = i < 0 ? null : (OFFENSIVE_STATUS_IDS[i] as MoveStatusId);
  } else if (free) {
    status = null; // movimientos v0.4 §2: positivos del gratis → "ninguno" (u3 no se usa)
  } else if (pTaunt > 0 && u3 < pTaunt) {
    taunt = true; // movimientos v0.4 §4: u3 < p_fam → provocar en el hueco del estado
  } else {
    const all = familyWeights("estado_positivo", family, mcfg);
    const pool = rule.statusPool === "positivos" ? POSITIVE_STATUS_IDS : rule.statusPool;
    const w = pool.map((s) => all[POSITIVE_STATUS_IDS.indexOf(s)] as number);
    // movimientos v0.4 §4: si no sale provocar, el estado se sortea con u3' = (u3 − p)/(1 − p) (sin tiradas extra)
    const uS = pTaunt > 0 ? (u3 - pTaunt) / (1 - pTaunt) : u3;
    const i = weightedPick(w, uS);
    const s = i < 0 ? "ninguno" : (pool[i] as string);
    status = s === "ninguno" ? null : (s as MoveStatusId);
    // variantes v0.3 §2 V4 — provocar ocupa el hueco del estado con la misma u3 (sin tiradas
    // extra): si u3 ≥ T/(T + w) sustituye al estado sorteado; por debajo, nada cambia.
    if (tauntOk && T.draw === "umbral") {
      const wp = tauntWeight(family, mcfg);
      let total = 0;
      for (const x of w) total += x;
      if (wp > 0 && u3 * (total + wp) >= total) {
        status = null;
        taunt = true;
      }
    }
  }

  // §4 modificador (u4, u5): pesos con 0 en los no permitidos
  const pr = mcfg.probabilities;
  let modifier: ModifierId | null = null;
  if (u4 < pr.modBase + pr.modScale * elong) {
    const w = familyWeights("modificador", family, mcfg).map((x, i) =>
      rule.modifiers.includes(MODIFIER_IDS[i] as ModifierId) && (!free || free.modifiers.includes(MODIFIER_IDS[i] as ModifierId)) ? x : 0,
    );
    const i = weightedPick(w, u5);
    modifier = i < 0 ? null : (MODIFIER_IDS[i] as ModifierId);
  }
  // §4 condición (u6, u7)
  let condition: ConditionId | null = null;
  if (u6 < pr.condBase + pr.condScale * ornament) {
    const i = weightedPick(familyWeights("condicion", family, mcfg), u7);
    condition = i < 0 ? null : (CONDITION_IDS[i] as ConditionId);
  }
  const rootIdx = Math.floor(u8 * 4);
  // movimientos v0.4 §3: cola con alcance salvo que ya tenga área (sustituye al modificador sorteado o al null)
  let forcedMod = false;
  if (tail && !((tail.unless.includes("area_forzada") && rule.forcedArea) || (tail.unless.includes("area") && modifier === "area"))) {
    modifier = tail.forcedModifier;
    forcedMod = true;
  }

  // §4.1 [v0.2] ensamblado con respaldo (sin tiradas extra)
  const md = mcfg.modifiers;
  const budget = free ? free.budget : (mcfg.budget[c] as number);
  let fallback: 0 | 1 | 2 | 3 | 4 = 0;
  let area = false;
  let fac = 1;
  let fixed = 0;
  let fEsc = 1;
  let extra = 0;
  let pts = 0;
  for (;;) {
    const ar = mcfg.archetypes[archetype];
    area = ar.forcedArea || modifier === "area";
    fac = area ? md.areaFactor : 1;
    fixed = modifier === "alcance" || modifier === "prioridad" || modifier === "perforar" ? md[modifier] : 0;
    fEsc = (condition ? 1 + mcfg.conditions.bonus * mcfg.conditions.factor[condition] : 1) * (modifier === "drenaje" ? md.drainFactor : 1);
    extra = (status ? mcfg.statusCost[status] : 0) + (extraEnergy ? mcfg.extraEnergy.cost : 0) + (taunt ? mcfg.taunt.cost : 0);
    const L = budget - fixed - fac * extra;
    pts = L > 0 ? Math.floor(L / (fac * fEsc)) : 0;
    // §2.1 [v0.2]: pts ≥ mínimo y el escalable se lleva ≥ fraccion_minima del presupuesto
    // movimientos v0.4 §4: una protección con provocar exige además escudo ≥ fraccion_minima_escudo·presupuesto
    const tauntShield = taunt && ar.scalable === "escudo" ? fac * fEsc * pts >= mcfg.taunt.minShieldFraction * budget : true;
    if (pts >= mcfg.scalables.minPoints && fac * fEsc * pts >= mcfg.scalables.minFraction * budget && tauntShield) break;
    if (condition) {
      condition = null; // 1.º se quita la condición
      fallback = 1;
    } else if (modifier && !forcedMod) {
      // [v0.4] el modificador forzado de la cola no se quita: se pasa al paso 3
      // 2.º se quita el modificador. [v0.4] En la cola, si el que se quita es el área que la
      // eximía, se pone el forzado (la garantía de alcance o área no se pierde nunca)
      const tailArea = tail !== null && modifier === "area" && !mcfg.archetypes[archetype].forcedArea;
      modifier = tailArea ? tail.forcedModifier : null;
      forcedMod = tailArea;
      fallback = 2;
    } else if (status || extraEnergy || taunt) {
      status = null; // 3.º [v0.2] se quitan estado y energía (conserva el arquetipo); [v0.3] y provocar
      extraEnergy = 0;
      taunt = false;
      fallback = 3;
    } else {
      archetype = "golpe"; // 4.º pasa a golpe (con el parser actual no se llega)
      fallback = 4;
    }
  }
  const fr = mcfg.archetypes[archetype];
  const power = Math.min(Math.floor((pts * scalablePerPoint(fr.scalable, mcfg)) / mcfg.scalables.step) * mcfg.scalables.step, scalableCap(fr.scalable, area, mcfg));
  const points = fixed + fac * extra + fac * fEsc * pts;
  const roots = mcfg.names.roots[family] as readonly string[];
  // Nombre con el arquetipo final (tras el respaldo); ver notas de implementación.
  // movimientos v0.4 §4: un táctico con provocar se llama "Desafío de …"
  const name = `${taunt && archetype === "tactico" ? mcfg.taunt.tacticName : mcfg.names.core[archetype]} de ${roots[rootIdx] as string}`;

  return Object.freeze({
    id: moveId,
    key,
    family,
    locus,
    name,
    cost: c,
    archetype,
    scalable: fr.scalable,
    power,
    target: fr.target,
    area,
    status,
    extraEnergy,
    modifier,
    condition,
    scalablePoints: pts,
    points,
    budget,
    fallback,
    ...(taunt ? { taunt: true as const } : {}),
  });
}

/** movimientos v0.4 §4: probabilidad de provocar de una familia (híbridas: máximo o suma de sus 2 componentes, ≤ 1). */
function tauntProb(family: FamilyId, mcfg: MovesConfig): number {
  const t = mcfg.taunt.familyProb;
  const h = mcfg.genetics.hybridById.get(family);
  if (!h) return t[family] ?? 0;
  const a = t[h.components[0]] ?? 0;
  const b = t[h.components[1]] ?? 0;
  return mcfg.taunt.hybrids === "max" ? Math.max(a, b) : Math.min(1, a + b);
}

/** ¿Es el movimiento gratis? (movimientos v0.4 §2: coste 0, solo en el locus del gratis) */
export function isFreeMove(m: Pick<Move, "cost">): boolean {
  return m.cost === 0;
}

/** variantes v0.3 §2 V4: peso de provocar de una familia (híbrida = suma de sus 2 componentes). */
function tauntWeight(family: FamilyId, mcfg: MovesConfig): number {
  const t = mcfg.taunt.familyWeights;
  const h = mcfg.genetics.hybridById.get(family);
  if (!h) return t[family] ?? 0;
  return (t[h.components[0]] ?? 0) + (t[h.components[1]] ?? 0);
}

function scalablePerPoint(s: ScalableId, mcfg: MovesConfig): number {
  return mcfg.scalables[s].perPoint;
}
/** movimientos §2.1: tope del escalable (daño en área: tope por objetivo). */
function scalableCap(s: ScalableId, area: boolean, mcfg: MovesConfig): number {
  if (s === "dano") return area ? mcfg.scalables.dano.maxArea : mcfg.scalables.dano.max;
  return mcfg.scalables[s].max;
}

/** movimientos §3: lista de violaciones (vacía si es válido). */
export function validateMove(m: Move, mcfg: MovesConfig): string[] {
  const errs: string[] = [];
  const eps = 1e-9;
  // 1. coste, presupuesto, escalable ([v0.4] coste 0 solo en el locus del gratis, con su presupuesto)
  const free = mcfg.free && m.locus === mcfg.free.locus ? mcfg.free : null;
  if (free) {
    if (m.cost !== 0) errs.push(`el gratis debe costar 0 (coste ${m.cost})`);
  } else if (!Number.isInteger(m.cost) || m.cost < mcfg.cost.min || m.cost > mcfg.cost.max) errs.push(`coste ${m.cost} fuera de rango`);
  const budget = free ? free.budget : mcfg.budget[m.cost];
  if (budget === undefined || m.budget !== budget) errs.push(`presupuesto ${m.budget} ≠ ${budget}`);
  else if (m.points > budget + eps) errs.push(`puntos ${m.points} > presupuesto ${budget}`);
  if (!Number.isInteger(m.scalablePoints) || m.scalablePoints < mcfg.scalables.minPoints) errs.push(`escalable con ${m.scalablePoints} puntos`);
  const rule = mcfg.archetypes[m.archetype];
  if (!rule) return [...errs, `arquetipo desconocido '${m.archetype}'`];
  if (!free && m.cost < rule.minCost) errs.push(`${m.archetype} con coste ${m.cost} < mínimo ${rule.minCost}`); // §3.3 [v0.2]
  // movimientos v0.4 §2: piezas del gratis
  if (free) {
    if (!free.archetypes.includes(m.archetype)) errs.push(`arquetipo '${m.archetype}' no permitido en el gratis`);
    if (m.modifier !== null && !free.modifiers.includes(m.modifier)) errs.push(`modificador '${m.modifier}' no permitido en el gratis`);
    if (m.status !== null && (rule.statusPool !== "ofensivos" || mcfg.statusCost[m.status] > free.maxStatusCost)) errs.push(`estado '${m.status}' no permitido en el gratis`);
    if (m.taunt || m.extraEnergy) errs.push("el gratis no lleva provocar ni energía");
  }
  // movimientos v0.4 §3: cola siempre ofensiva y con alcance o área
  const tail = mcfg.tailGuarantee && m.locus === mcfg.tailGuarantee.locus ? mcfg.tailGuarantee : null;
  if (tail) {
    if (tail.forbiddenArchetypes.includes(m.archetype)) errs.push(`arquetipo '${m.archetype}' prohibido en ${m.locus}`);
    if (!m.area && m.modifier !== tail.forcedModifier) errs.push(`${m.locus} sin ${tail.forcedModifier} ni área`);
  }
  if (m.scalable !== rule.scalable || m.target !== rule.target) errs.push("escalable u objetivo no corresponden al arquetipo");
  const cap = scalableCap(m.scalable, m.area, mcfg);
  if (!(m.power > 0) || m.power > cap || m.power > m.scalablePoints * scalablePerPoint(m.scalable, mcfg) + eps) errs.push(`potencia ${m.power} inválida (tope ${cap})`);
  if (m.power % mcfg.scalables.step !== 0) errs.push(`potencia ${m.power} no es múltiplo de ${mcfg.scalables.step}`);
  // 2–3. piezas permitidas
  if (m.status !== null) {
    if (rule.energyIfMinCost) {
      if (m.status !== (rule.statusPool as readonly string[])[0]) errs.push(`estado '${m.status}' no permitido`);
    } else if (rule.statusPool === "ofensivos") {
      if (!(OFFENSIVE_STATUS_IDS as readonly string[]).includes(m.status)) errs.push(`estado '${m.status}' no es ofensivo`);
    } else {
      const pool = rule.statusPool === "positivos" ? POSITIVE_STATUS_IDS : rule.statusPool;
      if (!(pool as readonly string[]).includes(m.status)) errs.push(`estado '${m.status}' no permitido en ${m.archetype}`);
    }
    if (m.status === "aturdir" && m.cost < mcfg.stunMinCost) errs.push("aturdir con coste < mínimo");
  }
  if (m.extraEnergy !== 0) {
    if (!rule.energyIfMinCost || m.cost < mcfg.extraEnergy.minCost) errs.push("energía extra no permitida");
    if (m.area) errs.push("energía extra con área");
    if (m.status !== null) errs.push("energía extra y estado a la vez");
  }
  // variantes v0.3 §2 V4: provocar solo con la variante activa, en sus arquetipos y en el hueco del estado
  if (m.taunt !== undefined) {
    if (m.taunt !== true || !mcfg.taunt.active || !mcfg.taunt.archetypes.includes(m.archetype) || (mcfg.taunt.loci !== null && !mcfg.taunt.loci.includes(m.locus))) errs.push("provocar no permitido");
    if (m.status !== null || m.extraEnergy) errs.push("provocar y estado (o energía) a la vez");
    // movimientos v0.4 §4: escudo mínimo de una protección con provocar
    if (m.scalable === "escudo" && budget !== undefined) {
      const fac = m.area ? mcfg.modifiers.areaFactor : 1;
      const fEsc = m.condition ? 1 + mcfg.conditions.bonus * mcfg.conditions.factor[m.condition] : 1;
      if (fac * fEsc * m.scalablePoints < mcfg.taunt.minShieldFraction * budget - 1e-9) errs.push("escudo de provocar por debajo del mínimo");
    }
  }
  if (m.modifier !== null && !rule.modifiers.includes(m.modifier)) errs.push(`modificador '${m.modifier}' no permitido en ${m.archetype}`);
  if (m.condition !== null && !(CONDITION_IDS as readonly string[]).includes(m.condition)) errs.push(`condición '${m.condition}' desconocida`);
  if (m.area !== (rule.forcedArea || m.modifier === "area")) errs.push("área incoherente con arquetipo/modificador");
  // 4. fórmula de puntos
  const md = mcfg.modifiers;
  const fac = m.area ? md.areaFactor : 1;
  const fixed = m.modifier === "alcance" || m.modifier === "prioridad" || m.modifier === "perforar" ? md[m.modifier] : 0;
  const fEsc = (m.condition ? 1 + mcfg.conditions.bonus * mcfg.conditions.factor[m.condition] : 1) * (m.modifier === "drenaje" ? md.drainFactor : 1);
  const extra = (m.status ? mcfg.statusCost[m.status] : 0) + (m.extraEnergy ? mcfg.extraEnergy.cost : 0) + (m.taunt ? mcfg.taunt.cost : 0);
  const expected = fixed + fac * extra + fac * fEsc * m.scalablePoints;
  if (Math.abs(expected - m.points) > eps) errs.push(`puntos ${m.points} ≠ fórmula ${expected}`);
  // §3.1 [v0.2]: el escalable se lleva al menos fraccion_minima del presupuesto
  if (budget !== undefined && fac * fEsc * m.scalablePoints < mcfg.scalables.minFraction * budget - eps) errs.push(`escalable por debajo del ${mcfg.scalables.minFraction} del presupuesto`);
  return errs;
}

const STATUS_TEXT: Record<MoveStatusId, string> = {
  quemadura: "quemadura",
  ralentizar: "ralentizar",
  aturdir: "aturdir",
  marca: "marca",
  debilitar: "debilitar",
  prisa: "prisa al usuario",
  regenerar: "regenerar",
};

/**
 * Descripción larga en español (ficha ampliada del cliente y depuración).
 * Con la config v0.4 usa la semántica de combate v0.4 §3 (fila atacable, "atrás", fila propia expuesta).
 */
export function describeMove(m: Move, mcfg: MovesConfig): string {
  const pct = (x: number): string => `${Math.round(x * 100)} %`;
  const enemy = m.target === "enemigo";
  const v04 = mcfg.version === "0.4";
  const anyRow = m.modifier === "alcance" || !enemy;
  let who: string;
  if (v04) {
    const back = m.modifier === "alcance";
    who = m.area
      ? enemy
        ? `a toda la fila ${back ? "trasera" : "atacable"} enemiga`
        : "a toda tu fila expuesta"
      : enemy
        ? back
          ? "a un enemigo de la fila trasera (si no hay, de la delantera)"
          : "a un enemigo de la fila atacable"
        : m.taunt && m.scalable === "escudo"
          ? "a sí misma"
          : m.scalable === "cura"
            ? "al aliado más herido"
            : "al aliado de la fila expuesta con menos vida + escudo";
  } else {
    who = m.area
      ? `a ${anyRow ? "una fila" : "la fila delantera"} ${enemy ? "enemiga" : "aliada"}`
      : enemy
        ? anyRow
          ? "a cualquier enemigo"
          : "a un enemigo"
        : "a un aliado";
  }
  const main = m.scalable === "dano" ? `${m.power} de daño ${who}` : m.scalable === "cura" ? `cura ${m.power} ${who}` : `escudo de ${m.power} ${who}`;
  const parts = [`${m.name} (${m.cost === 0 && v04 ? "gratis" : `coste ${m.cost}`}): ${main}`];
  if (m.status) parts.push(`+ ${STATUS_TEXT[m.status]}`);
  if (m.extraEnergy) parts.push(`+ ${mcfg.extraEnergy.amount} de energía al bando`);
  if (m.taunt) parts.push("+ provocar (los ataques enemigos de un objetivo van al usuario)");
  let text = parts.join(" ");
  const notes: string[] = [];
  if (m.modifier === "prioridad") notes.push("prioridad");
  if (m.modifier === "perforar") notes.push("ignora escudos");
  if (m.modifier === "drenaje") notes.push(`drena un ${pct(mcfg.modifiers.drainFraction)}`);
  if (m.condition) {
    const cond: Record<ConditionId, string> = {
      objetivo_con_estado: "el objetivo tiene un estado negativo",
      vida_baja: `el usuario tiene menos del ${pct(mcfg.conditions.lowHpThreshold)} de vida`,
      combo_familia: "otro de su grupo de familia usa un movimiento",
      reserva: `quedan ≥ ${mcfg.conditions.reserveThreshold} de energía tras pagar`,
      antes_que_objetivo: "actúa antes que el objetivo",
    };
    notes.push(`+${pct(mcfg.conditions.bonus)} si ${cond[m.condition]}`);
  }
  if (notes.length > 0) text += `; ${notes.join("; ")}`;
  return text;
}

/** glosario v0.4 §1 — palabra del estado (F2). */
const SHORT_STATUS: Record<MoveStatusId, string> = {
  quemadura: "Quema",
  ralentizar: "Ralentiza",
  aturdir: "Aturde",
  marca: "Marca",
  debilitar: "Debilita",
  prisa: "Prisa",
  regenerar: "Regenera",
};
/** glosario v0.4 §1 — texto de la condición (F3), tras "×1,5". */
const SHORT_CONDITION: Record<ConditionId, string> = {
  combo_familia: "en combo",
  objetivo_con_estado: "si está afectado",
  vida_baja: "si herido",
  antes_que_objetivo: "si va antes",
  reserva: "con reserva",
};
/** Número con coma decimal española (sin separador de miles). */
function esNumber(x: number): string {
  return String(Math.round(x * 100) / 100).replace(".", ",");
}

/**
 * glosario v0.4 §2 — descripción corta del botón (≤ 3 fragmentos separados por " · "):
 * F1 número principal (+ " a la fila" / " atrás" / " primero"), F2 efecto, F3 condición.
 * El coste ("Gratis") va en la esquina del botón, no aquí. Potencia base, sin estadísticas.
 */
export function describeMoveShort(m: Move, mcfg: MovesConfig): string {
  const n = esNumber(m.power);
  let f1 = m.scalable === "dano" ? n : m.scalable === "cura" ? `Cura ${n}` : `Escudo ${n}`;
  if (m.area) f1 += " a la fila";
  if (m.modifier === "alcance") f1 += " atrás";
  if (m.modifier === "prioridad") f1 += " primero";
  const f2 = m.status
    ? SHORT_STATUS[m.status]
    : m.taunt
      ? "Provoca"
      : m.extraEnergy
        ? `+${mcfg.extraEnergy.amount} energía`
        : m.modifier === "drenaje"
          ? "Drena"
          : m.modifier === "perforar"
            ? "Perfora"
            : "";
  const f3 = m.condition ? `×${esNumber(1 + mcfg.conditions.bonus)} ${SHORT_CONDITION[m.condition]}` : "";
  return [f1, f2, f3].filter((x) => x.length > 0).join(" · ");
}
