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
  /** Coste de energía c ∈ 1..5. */
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

  // §4 coste [v0.2]: c = clamp(1 + floor(desplazamiento + forma[0]·escala_tamano + u1·escala_azar), 1, 5)
  const cc = mcfg.cost;
  const c = Math.min(cc.max, Math.max(cc.min, 1 + Math.floor(cc.offset + size * cc.sizeScale + u1 * cc.randomScale)));

  // §4 arquetipo: familia + locus + forma[2] (ofensivo/defensivo)
  const wA = familyWeights("arquetipo", family, mcfg);
  const lw = mcfg.locusWeights[locus];
  ARCHETYPE_IDS.forEach((a, i) => {
    let w = (wA[i] as number) + (lw[i] as number);
    if (a === "golpe" || a === "golpe_estado") w += mcfg.shapeWeights.offensive * angular;
    if (a === "proteccion" || a === "curacion") w += mcfg.shapeWeights.defensive * (1 - angular);
    wA[i] = w;
  });
  let archetype = ARCHETYPE_IDS[weightedPick(wA, u2)] as ArchetypeId;
  // §4 [v0.2] coste_min (maldición: c ≥ 2); si no llega, golpe_estado, sin tiradas
  if (c < mcfg.archetypes[archetype].minCost) archetype = "golpe_estado";
  const rule = mcfg.archetypes[archetype];

  // §4 estado (u3)
  let status: MoveStatusId | null = null;
  let extraEnergy: 0 | 1 = 0;
  let taunt = false;
  if (rule.energyIfMinCost) {
    // táctico: prisa; con c ≥ 3, energía extra en su lugar (u3 no se usa)
    if (c >= mcfg.extraEnergy.minCost) extraEnergy = 1;
    else status = (rule.statusPool as readonly string[])[0] as MoveStatusId;
  } else if (rule.statusPool === "ofensivos") {
    const w = familyWeights("estado_ofensivo", family, mcfg);
    if (c < mcfg.stunMinCost) w[OFFENSIVE_STATUS_IDS.indexOf("aturdir")] = 0; // §2.2 aturdir solo con c ≥ 3
    const i = weightedPick(w, u3);
    status = i < 0 ? null : (OFFENSIVE_STATUS_IDS[i] as MoveStatusId);
  } else {
    const all = familyWeights("estado_positivo", family, mcfg);
    const pool = rule.statusPool === "positivos" ? POSITIVE_STATUS_IDS : rule.statusPool;
    const w = pool.map((s) => all[POSITIVE_STATUS_IDS.indexOf(s)] as number);
    const i = weightedPick(w, u3);
    const s = i < 0 ? "ninguno" : (pool[i] as string);
    status = s === "ninguno" ? null : (s as MoveStatusId);
    // variantes v0.3 §2 V4 — provocar ocupa el hueco del estado con la misma u3 (sin tiradas
    // extra): si u3 ≥ T/(T + w) sustituye al estado sorteado; por debajo, nada cambia.
    if (mcfg.taunt.active && mcfg.taunt.archetypes.includes(archetype)) {
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
    const w = familyWeights("modificador", family, mcfg).map((x, i) => (rule.modifiers.includes(MODIFIER_IDS[i] as ModifierId) ? x : 0));
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

  // §4.1 [v0.2] ensamblado con respaldo (sin tiradas extra)
  const md = mcfg.modifiers;
  const budget = mcfg.budget[c] as number;
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
    if (pts >= mcfg.scalables.minPoints && fac * fEsc * pts >= mcfg.scalables.minFraction * budget) break;
    if (condition) {
      condition = null; // 1.º se quita la condición
      fallback = 1;
    } else if (modifier) {
      modifier = null; // 2.º se quita el modificador
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
  const name = `${mcfg.names.core[archetype]} de ${roots[rootIdx] as string}`;

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
  // 1. coste, presupuesto, escalable
  if (!Number.isInteger(m.cost) || m.cost < mcfg.cost.min || m.cost > mcfg.cost.max) errs.push(`coste ${m.cost} fuera de rango`);
  const budget = mcfg.budget[m.cost];
  if (budget === undefined || m.budget !== budget) errs.push(`presupuesto ${m.budget} ≠ ${budget}`);
  else if (m.points > budget + eps) errs.push(`puntos ${m.points} > presupuesto ${budget}`);
  if (!Number.isInteger(m.scalablePoints) || m.scalablePoints < mcfg.scalables.minPoints) errs.push(`escalable con ${m.scalablePoints} puntos`);
  const rule = mcfg.archetypes[m.archetype];
  if (!rule) return [...errs, `arquetipo desconocido '${m.archetype}'`];
  if (m.cost < rule.minCost) errs.push(`${m.archetype} con coste ${m.cost} < mínimo ${rule.minCost}`); // §3.3 [v0.2]
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
    if (m.taunt !== true || !mcfg.taunt.active || !mcfg.taunt.archetypes.includes(m.archetype)) errs.push("provocar no permitido");
    if (m.status !== null) errs.push("provocar y estado a la vez");
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

/** Descripción corta en español (cliente y depuración). */
export function describeMove(m: Move, mcfg: MovesConfig): string {
  const pct = (x: number): string => `${Math.round(x * 100)} %`;
  const enemy = m.target === "enemigo";
  const anyRow = m.modifier === "alcance" || !enemy;
  const who = m.area
    ? `a ${anyRow ? "una fila" : "la fila delantera"} ${enemy ? "enemiga" : "aliada"}`
    : enemy
      ? anyRow
        ? "a cualquier enemigo"
        : "a un enemigo"
      : "a un aliado";
  const main = m.scalable === "dano" ? `${m.power} de daño ${who}` : m.scalable === "cura" ? `cura ${m.power} ${who}` : `escudo de ${m.power} ${who}`;
  const parts = [`${m.name} (coste ${m.cost}): ${main}`];
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
