/**
 * Carga y validación de `config/movimientos.v0.2.json` (spec movimientos v0.2).
 * Solo admite el formato v0.2; la v0.1 ya no se carga.
 *
 * Función pura: recibe el JSON ya parseado y la config de genética
 * validada (para las 13 familias, híbridas, rejilla de forma y catálogo,
 * que la generación necesita) y devuelve una `MovesConfig` inmutable.
 */
import { LOCUS_IDS, type FamilyId, type GeneticsConfig, type LocusId } from "../genetics/types.ts";
import { arr, bool, checkId, dataKeys, fail, int, num, obj, onlyKeys, sameList, str } from "../combat/parse.ts";

/** movimientos §2.6 — orden fijo (`orden_arquetipos`). */
export const ARCHETYPE_IDS = ["golpe", "golpe_estado", "maldicion", "proteccion", "curacion", "tactico"] as const;
export type ArchetypeId = (typeof ARCHETYPE_IDS)[number];
/** movimientos §2.2 */
export const OFFENSIVE_STATUS_IDS = ["quemadura", "ralentizar", "aturdir", "marca", "debilitar"] as const;
export type OffensiveStatusId = (typeof OFFENSIVE_STATUS_IDS)[number];
export const POSITIVE_STATUS_IDS = ["prisa", "regenerar", "ninguno"] as const;
export type PositiveStatusId = (typeof POSITIVE_STATUS_IDS)[number];
/** Estado que puede llevar un movimiento (sin "ninguno": eso es `null`). */
export type MoveStatusId = OffensiveStatusId | "prisa" | "regenerar";
/** movimientos §2.4 */
export const MODIFIER_IDS = ["alcance", "prioridad", "perforar", "area", "drenaje"] as const;
export type ModifierId = (typeof MODIFIER_IDS)[number];
/** movimientos §2.5 */
export const CONDITION_IDS = ["objetivo_con_estado", "vida_baja", "combo_familia", "reserva", "antes_que_objetivo"] as const;
export type ConditionId = (typeof CONDITION_IDS)[number];
export type ScalableId = "dano" | "cura" | "escudo";
export type MoveTarget = "enemigo" | "aliado";

export interface ArchetypeRule {
  readonly scalable: ScalableId;
  readonly target: MoveTarget;
  /** "ofensivos" | "positivos" | lista explícita (curación, táctico). */
  readonly statusPool: "ofensivos" | "positivos" | readonly PositiveStatusId[];
  readonly modifiers: readonly ModifierId[];
  readonly forcedArea: boolean;
  /** Táctico: con c ≥ energia_extra.coste_min lleva +1 energía en vez de prisa. */
  readonly energyIfMinCost: boolean;
  /** [v0.2] `coste_min`: con c menor, el arquetipo pasa a golpe_estado (movimientos §4). */
  readonly minCost: number;
}

export interface MovesConfig {
  readonly version: string;
  readonly seedPrefix: string;
  readonly drawsPerMove: number;
  /** budget[c] para c = 1..5 (budget[0] = 0). */
  readonly budget: readonly number[];
  /** [v0.2] c = clamp(1 + floor(offset + forma[0]·sizeScale + u1·randomScale), min, max). */
  readonly cost: { readonly min: number; readonly max: number; readonly offset: number; readonly sizeScale: number; readonly randomScale: number };
  readonly scalables: {
    readonly dano: { readonly perPoint: number; readonly max: number; readonly maxArea: number };
    readonly cura: { readonly perPoint: number; readonly max: number };
    readonly escudo: { readonly perPoint: number; readonly max: number };
    readonly step: number;
    readonly minPoints: number;
    /** [v0.2] fac·fEsc·pts ≥ minFraction·presupuesto[c]. */
    readonly minFraction: number;
  };
  readonly statusCost: Readonly<Record<OffensiveStatusId | PositiveStatusId, number>>;
  readonly stunMinCost: number;
  readonly extraEnergy: { readonly cost: number; readonly amount: number; readonly minCost: number };
  /** Coste fijo (alcance, prioridad, perforar) o factor (area, drenaje). */
  readonly modifiers: {
    readonly alcance: number;
    readonly prioridad: number;
    readonly perforar: number;
    readonly areaFactor: number;
    readonly drainFactor: number;
    readonly drainFraction: number;
  };
  readonly conditions: {
    readonly bonus: number;
    readonly factor: Readonly<Record<ConditionId, number>>;
    readonly lowHpThreshold: number;
    readonly reserveThreshold: number;
  };
  readonly probabilities: { readonly modBase: number; readonly modScale: number; readonly condBase: number; readonly condScale: number };
  readonly archetypes: Readonly<Record<ArchetypeId, ArchetypeRule>>;
  /** Pesos por familia base (orden = orden_* correspondiente). */
  readonly familyWeights: {
    readonly arquetipo: Readonly<Record<FamilyId, readonly number[]>>;
    readonly estado_ofensivo: Readonly<Record<FamilyId, readonly number[]>>;
    readonly estado_positivo: Readonly<Record<FamilyId, readonly number[]>>;
    readonly modificador: Readonly<Record<FamilyId, readonly number[]>>;
    readonly condicion: Readonly<Record<FamilyId, readonly number[]>>;
  };
  readonly locusWeights: Readonly<Record<LocusId, readonly number[]>>;
  readonly shapeWeights: { readonly offensive: number; readonly defensive: number };
  readonly names: {
    readonly core: Readonly<Record<ArchetypeId, string>>;
    readonly roots: Readonly<Record<FamilyId, readonly string[]>>;
  };
  /**
   * variantes v0.3 §2 V4 — pieza "provocar" (desactivada por defecto). Ocupa el
   * hueco del estado en `archetypes`; `familyWeights` por familia base.
   */
  readonly taunt: {
    readonly active: boolean;
    readonly cost: number;
    readonly archetypes: readonly ArchetypeId[];
    /** v0.3: pesos con umbral sobre u3 (`sorteo` "umbral"). */
    readonly familyWeights: Readonly<Record<FamilyId, number>>;
    /** [v0.4] "umbral" (v0.3) | "probabilidad" (u3 < p_fam). */
    readonly draw: "umbral" | "probabilidad";
    /** [v0.4] loci donde puede salir (null = todos). */
    readonly loci: readonly LocusId[] | null;
    /** [v0.4] probabilidad por familia base. */
    readonly familyProb: Readonly<Record<FamilyId, number>>;
    /** [v0.4] híbridas: "suma" de componentes (v0.3) o "max". */
    readonly hybrids: "suma" | "max";
    /** [v0.4] protección con provocar: fac·fEsc·pts ≥ esta fracción del presupuesto (0 = sin mínimo). */
    readonly minShieldFraction: number;
    /** [v0.4] núcleo del nombre de un táctico con provocar ("Desafío"). */
    readonly tacticName: string;
  };
  /** movimientos v0.4 §2 — movimiento gratis (null en v0.2). */
  readonly free: {
    readonly locus: LocusId;
    readonly budget: number;
    readonly archetypes: readonly ArchetypeId[];
    /** arquetipo no permitido → arquetipo al que suma su peso. */
    readonly reassign: Readonly<Partial<Record<ArchetypeId, ArchetypeId>>>;
    readonly maxStatusCost: number;
    readonly modifiers: readonly ModifierId[];
  } | null;
  /** movimientos v0.4 §3 — garantía de alcance/área (null en v0.2). */
  readonly tailGuarantee: {
    readonly locus: LocusId;
    readonly forbiddenArchetypes: readonly ArchetypeId[];
    readonly forcedModifier: ModifierId;
    /** "area_forzada" (arquetipo con área forzada) y/o "area" (modificador área sorteado). */
    readonly unless: readonly ("area_forzada" | "area")[];
  } | null;
  /** overrides_catalogo.sales: id de gen del catálogo → sal. */
  readonly salts: Readonly<Record<string, string>>;
  /** Genética validada (familias, híbridas, rejilla, catálogo). */
  readonly genetics: GeneticsConfig;
}

export type FamilyWeightTable = keyof MovesConfig["familyWeights"];
const WEIGHT_TABLES: readonly [FamilyWeightTable, number][] = [
  ["arquetipo", ARCHETYPE_IDS.length],
  ["estado_ofensivo", OFFENSIVE_STATUS_IDS.length],
  ["estado_positivo", POSITIVE_STATUS_IDS.length],
  ["modificador", MODIFIER_IDS.length],
  ["condicion", CONDITION_IDS.length],
];

function weights(v: unknown, path: string, len: number, needPositive: boolean): number[] {
  const a = arr(v, path).map((x, i) => num(x, `${path}[${i}]`, 0));
  if (a.length !== len) fail(path, `deben ser ${len} pesos`);
  if (needPositive && !a.some((x) => x > 0)) fail(path, "al menos un peso debe ser > 0");
  return a;
}

export function parseMovesConfig(raw: unknown, genetics: GeneticsConfig): MovesConfig {
  const r = obj(raw, "config");
  const version = str(r["version"], "version");
  if (version !== "0.2" && version !== "0.4") fail("version", `solo se admiten las configs de movimientos v0.2 y v0.4 (recibida '${version}')`);
  const is04 = version === "0.4";
  // Q-03: claves desconocidas en la raíz
  onlyKeys(
    r,
    [
      "version", "semilla", "tiradas_por_movimiento", "presupuesto_por_coste", "coste_energia", "escalables", "estados", "energia_extra",
      "modificadores", "condiciones", "provocar", "probabilidades", "arquetipos", "orden_arquetipos", "orden_estados_ofensivos",
      "orden_estados_positivos", "orden_modificadores", "orden_condiciones", "pesos_familia", "pesos_locus_arquetipo", "pesos_forma_arquetipo",
      "nombres", "overrides_catalogo", "criterios_sim", "gratis", "garantia_alcance",
    ],
    "config",
  );
  const seedPrefix = str(obj(r["semilla"], "semilla")["prefijo"], "semilla.prefijo");
  // movimientos §3: 8 tiradas por movimiento (u1..u8)
  const drawsPerMove = int(r["tiradas_por_movimiento"], "tiradas_por_movimiento", 8, 8);

  // movimientos §1 — presupuestos crecientes para c = min..max
  const ce = obj(r["coste_energia"], "coste_energia");
  const cost = {
    min: int(ce["min"], "coste_energia.min", 1, 1),
    max: int(ce["max"], "coste_energia.max", 1, 9),
    offset: num(ce["desplazamiento"], "coste_energia.desplazamiento", 0),
    sizeScale: num(ce["escala_tamano"], "coste_energia.escala_tamano", 0),
    randomScale: num(ce["escala_azar"], "coste_energia.escala_azar", 0),
  };
  const pb = obj(r["presupuesto_por_coste"], "presupuesto_por_coste");
  if (dataKeys(pb).length !== cost.max) fail("presupuesto_por_coste", `claves esperadas 1..${cost.max}`);
  const budget = [0];
  for (let c = 1; c <= cost.max; c++) {
    const b = num(pb[String(c)], `presupuesto_por_coste.${c}`, 0);
    if (b <= (budget[c - 1] as number)) fail(`presupuesto_por_coste.${c}`, "los presupuestos deben ser crecientes");
    budget.push(b);
  }

  // movimientos §2.1
  const sc = obj(r["escalables"], "escalables");
  const sd = obj(sc["dano"], "escalables.dano");
  const scu = obj(sc["cura"], "escalables.cura");
  const ses = obj(sc["escudo"], "escalables.escudo");
  const scalables = {
    dano: {
      perPoint: num(sd["potencia_por_punto"], "escalables.dano.potencia_por_punto", Number.MIN_VALUE),
      max: num(sd["max_individual"], "escalables.dano.max_individual", 0),
      maxArea: num(sd["max_area_por_objetivo"], "escalables.dano.max_area_por_objetivo", 0),
    },
    cura: { perPoint: num(scu["potencia_por_punto"], "escalables.cura.potencia_por_punto", Number.MIN_VALUE), max: num(scu["max"], "escalables.cura.max", 0) },
    escudo: { perPoint: num(ses["potencia_por_punto"], "escalables.escudo.potencia_por_punto", Number.MIN_VALUE), max: num(ses["max"], "escalables.escudo.max", 0) },
    step: int(sc["paso"], "escalables.paso", 1),
    minPoints: int(sc["minimo_puntos"], "escalables.minimo_puntos", 1),
    minFraction: num(sc["fraccion_minima"], "escalables.fraccion_minima", 0, 1), // [v0.2]
  };
  // movimientos §3 [v0.2]: 0 < fraccion_minima < 1
  if (!(scalables.minFraction > 0 && scalables.minFraction < 1)) fail("escalables.fraccion_minima", "debe estar en (0, 1)");

  // movimientos §2.2
  const es = obj(r["estados"], "estados");
  const of = obj(es["ofensivos"], "estados.ofensivos");
  const po = obj(es["positivos"], "estados.positivos");
  sameList(dataKeys(of), OFFENSIVE_STATUS_IDS, "estados.ofensivos");
  sameList(dataKeys(po), POSITIVE_STATUS_IDS, "estados.positivos");
  const statusCost = {} as Record<OffensiveStatusId | PositiveStatusId, number>;
  for (const id of OFFENSIVE_STATUS_IDS) statusCost[id] = num(of[id], `estados.ofensivos.${id}`, 0);
  for (const id of POSITIVE_STATUS_IDS) statusCost[id] = num(po[id], `estados.positivos.${id}`, 0);
  if (statusCost.ninguno !== 0) fail("estados.positivos.ninguno", "debe costar 0");
  const stunMinCost = int(es["aturdir_coste_min"], "estados.aturdir_coste_min", cost.min, cost.max);

  // movimientos §2.3
  const ee = obj(r["energia_extra"], "energia_extra");
  const extraEnergy = {
    cost: num(ee["coste"], "energia_extra.coste", 0),
    amount: int(ee["cantidad"], "energia_extra.cantidad", 0),
    minCost: int(ee["coste_min"], "energia_extra.coste_min", cost.min, cost.max),
  };

  // movimientos §2.4
  const mo = obj(r["modificadores"], "modificadores");
  sameList(dataKeys(mo), MODIFIER_IDS, "modificadores");
  const modifiers = {
    alcance: num(obj(mo["alcance"], "modificadores.alcance")["coste"], "modificadores.alcance.coste", 0),
    prioridad: num(obj(mo["prioridad"], "modificadores.prioridad")["coste"], "modificadores.prioridad.coste", 0),
    perforar: num(obj(mo["perforar"], "modificadores.perforar")["coste"], "modificadores.perforar.coste", 0),
    areaFactor: num(obj(mo["area"], "modificadores.area")["factor"], "modificadores.area.factor", 1),
    drainFactor: num(obj(mo["drenaje"], "modificadores.drenaje")["factor"], "modificadores.drenaje.factor", 1),
    drainFraction: num(obj(mo["drenaje"], "modificadores.drenaje")["fraccion"], "modificadores.drenaje.fraccion", 0, 1),
  };

  // movimientos §3 [v0.2]: el respaldo §4.1 siempre termina. Tras quitar condición,
  // modificador y estado/energía: L = presupuesto[c] y fac·pts ≥ presupuesto[c] − fac.
  const facMax = modifiers.areaFactor;
  for (let c = 1; c <= cost.max; c++) {
    const b = budget[c] as number;
    if (scalables.minFraction * b > b - facMax) fail(`presupuesto_por_coste.${c}`, `fraccion_minima·presupuesto > presupuesto − factor de área (respaldo §4.1 sin salida)`);
  }
  if (scalables.minPoints > Math.floor((budget[1] as number) / facMax)) fail("escalables.minimo_puntos", "debe ser ≤ floor(presupuesto[1] / factor de área) (respaldo §4.1)");

  // movimientos §2.5
  const co = obj(r["condiciones"], "condiciones");
  const factor = {} as Record<ConditionId, number>;
  for (const id of CONDITION_IDS) factor[id] = num(obj(co[id], `condiciones.${id}`)["factor"], `condiciones.${id}.factor`, 0);
  const conditions = {
    bonus: num(co["bonus"], "condiciones.bonus", 0),
    factor: Object.freeze(factor),
    lowHpThreshold: num(obj(co["vida_baja"], "condiciones.vida_baja")["umbral"], "condiciones.vida_baja.umbral", 0, 1),
    reserveThreshold: num(obj(co["reserva"], "condiciones.reserva")["umbral"], "condiciones.reserva.umbral", 0),
  };

  const pr = obj(r["probabilidades"], "probabilidades");
  const probabilities = {
    modBase: num(pr["mod_base"], "probabilidades.mod_base", 0, 1),
    modScale: num(pr["mod_escala"], "probabilidades.mod_escala", 0, 1),
    condBase: num(pr["cond_base"], "probabilidades.cond_base", 0, 1),
    condScale: num(pr["cond_escala"], "probabilidades.cond_escala", 0, 1),
  };

  // movimientos §2.6 — arquetipos y órdenes fijos
  sameList(arr(r["orden_arquetipos"], "orden_arquetipos"), ARCHETYPE_IDS, "orden_arquetipos");
  sameList(arr(r["orden_estados_ofensivos"], "orden_estados_ofensivos"), OFFENSIVE_STATUS_IDS, "orden_estados_ofensivos");
  sameList(arr(r["orden_estados_positivos"], "orden_estados_positivos"), POSITIVE_STATUS_IDS, "orden_estados_positivos");
  sameList(arr(r["orden_modificadores"], "orden_modificadores"), MODIFIER_IDS, "orden_modificadores");
  sameList(arr(r["orden_condiciones"], "orden_condiciones"), CONDITION_IDS, "orden_condiciones");
  const ar = obj(r["arquetipos"], "arquetipos");
  sameList(dataKeys(ar), ARCHETYPE_IDS, "arquetipos");
  const archetypes = {} as Record<ArchetypeId, ArchetypeRule>;
  for (const id of ARCHETYPE_IDS) {
    const p = `arquetipos.${id}`;
    const o = obj(ar[id], p);
    const scalable = str(o["escalable"], `${p}.escalable`);
    if (scalable !== "dano" && scalable !== "cura" && scalable !== "escudo") fail(`${p}.escalable`, "debe ser dano|cura|escudo");
    const target = str(o["objetivo"], `${p}.objetivo`);
    if (target !== "enemigo" && target !== "aliado") fail(`${p}.objetivo`, "debe ser enemigo|aliado");
    // movimientos §2.6: los escalables de aliado son cura/escudo y los de enemigo, daño
    if ((target === "aliado") !== (scalable !== "dano")) fail(p, "objetivo y escalable incoherentes");
    let statusPool: ArchetypeRule["statusPool"];
    if (o["estados"] === "ofensivos" || o["estados"] === "positivos") statusPool = o["estados"];
    else {
      const list = arr(o["estados"], `${p}.estados`).map((x, i) => str(x, `${p}.estados[${i}]`));
      for (const s of list) if (!(POSITIVE_STATUS_IDS as readonly string[]).includes(s)) fail(`${p}.estados`, `estado '${s}' no admitido en lista`);
      statusPool = Object.freeze(list) as readonly PositiveStatusId[];
    }
    const mods = arr(o["modificadores"], `${p}.modificadores`).map((x, i) => str(x, `${p}.modificadores[${i}]`));
    for (const m of mods) if (!(MODIFIER_IDS as readonly string[]).includes(m)) fail(`${p}.modificadores`, `modificador desconocido '${m}'`);
    const energyIfMinCost = o["energia_si_coste_min"] === undefined ? false : bool(o["energia_si_coste_min"], `${p}.energia_si_coste_min`);
    // [v0.2] coste_min opcional (maldición: 2)
    const minCost = o["coste_min"] === undefined ? cost.min : int(o["coste_min"], `${p}.coste_min`, cost.min, cost.max);
    archetypes[id] = Object.freeze({
      minCost,
      scalable,
      target,
      statusPool,
      modifiers: Object.freeze(mods) as readonly ModifierId[],
      forcedArea: bool(o["area_forzada"], `${p}.area_forzada`),
      energyIfMinCost,
    });
  }
  // movimientos §2.3/§3: la energía extra solo en táctico (sin área); el táctico es [prisa]
  const tac = archetypes.tactico;
  if (!tac.energyIfMinCost || tac.forcedArea || tac.modifiers.includes("area")) fail("arquetipos.tactico", "debe llevar energía con coste mínimo y no admitir área");
  if (!Array.isArray(tac.statusPool) || tac.statusPool.length !== 1 || tac.statusPool[0] !== "prisa") fail("arquetipos.tactico.estados", "debe ser [\"prisa\"]");
  for (const id of ARCHETYPE_IDS) if (id !== "tactico" && archetypes[id].energyIfMinCost) fail(`arquetipos.${id}`, "solo el táctico lleva energía extra");
  for (const id of ARCHETYPE_IDS) {
    const a = archetypes[id];
    if (a.statusPool === "ofensivos" && a.target !== "enemigo") fail(`arquetipos.${id}`, "estados ofensivos requieren objetivo enemigo");
    // combate §4 [v0.2]: los de aliado ya tienen prioridad implícita
    if (a.target === "aliado" && a.modifiers.includes("prioridad")) fail(`arquetipos.${id}.modificadores`, "los movimientos de aliado no admiten 'prioridad' (la tienen implícita)");
  }
  // movimientos §4 [v0.2]: el destino de coste_min (golpe_estado) no puede tener coste_min propio
  if (archetypes.golpe_estado.minCost !== cost.min) fail("arquetipos.golpe_estado.coste_min", "golpe_estado es el destino de coste_min y no puede tenerlo");

  // movimientos §4 — pesos por familia base (≥ 0, alguno > 0) y por locus
  const pf = obj(r["pesos_familia"], "pesos_familia");
  const familyWeights = {} as Record<FamilyWeightTable, Record<FamilyId, readonly number[]>>;
  for (const [table, len] of WEIGHT_TABLES) {
    const t = obj(pf[table], `pesos_familia.${table}`);
    familyWeights[table] = {};
    for (const f of genetics.baseFamilies) {
      familyWeights[table][f] = Object.freeze(weights(t[f], `pesos_familia.${table}.${f}`, len, true));
    }
    if (dataKeys(t).length !== genetics.baseFamilies.length) fail(`pesos_familia.${table}`, "debe tener exactamente las familias base");
  }
  const pl = obj(r["pesos_locus_arquetipo"], "pesos_locus_arquetipo");
  sameList(dataKeys(pl), LOCUS_IDS, "pesos_locus_arquetipo");
  const locusWeights = {} as Record<LocusId, readonly number[]>;
  for (const L of LOCUS_IDS) locusWeights[L] = Object.freeze(weights(pl[L], `pesos_locus_arquetipo.${L}`, ARCHETYPE_IDS.length, false));
  const pfa = obj(r["pesos_forma_arquetipo"], "pesos_forma_arquetipo");
  const shapeWeights = {
    offensive: num(pfa["ofensivo"], "pesos_forma_arquetipo.ofensivo", 0),
    defensive: num(pfa["defensivo"], "pesos_forma_arquetipo.defensivo", 0),
  };

  // movimientos §4 [nombres] — núcleo por arquetipo y 4 raíces por familia (las 13)
  const no = obj(r["nombres"], "nombres");
  const nu = obj(no["nucleo"], "nombres.nucleo");
  const core = {} as Record<ArchetypeId, string>;
  for (const id of ARCHETYPE_IDS) core[id] = str(nu[id], `nombres.nucleo.${id}`);
  const ra = obj(no["raiz"], "nombres.raiz");
  const families = [...genetics.baseFamilies, ...genetics.hybrids.map((h) => h.id)];
  if (dataKeys(ra).length !== families.length) fail("nombres.raiz", `debe tener las ${families.length} familias`);
  const roots: Record<FamilyId, readonly string[]> = {};
  for (const f of families) {
    const list = arr(ra[f], `nombres.raiz.${f}`).map((x, i) => str(x, `nombres.raiz.${f}[${i}]`));
    if (list.length !== 4) fail(`nombres.raiz.${f}`, "deben ser 4 raíces");
    roots[f] = Object.freeze(list);
  }

  // variantes v0.3 §2 V4 / movimientos v0.4 §4 — pieza provocar (bloque opcional en v0.2; ausente = desactivada)
  const tauntWeights: Record<FamilyId, number> = {};
  const tauntProb: Record<FamilyId, number> = {};
  for (const f of genetics.baseFamilies) {
    tauntWeights[f] = 0;
    tauntProb[f] = 0;
  }
  let taunt: MovesConfig["taunt"] = {
    active: false, cost: 0, archetypes: [], familyWeights: tauntWeights, draw: "umbral", loci: null, familyProb: tauntProb, hybrids: "suma", minShieldFraction: 0, tacticName: "",
  };
  if (r["provocar"] === undefined && is04) fail("provocar", "obligatoria en la config v0.4");
  if (r["provocar"] !== undefined) {
    const pv = obj(r["provocar"], "provocar");
    onlyKeys(pv, ["activo", "coste", "arquetipos", "pesos_familia", "sorteo", "loci", "probabilidad_familia", "hibridas", "fraccion_minima_escudo", "nombre_tactico"], "provocar");
    const draw = pv["sorteo"] === undefined && !is04 ? "umbral" : str(pv["sorteo"], "provocar.sorteo");
    if (draw !== "umbral" && draw !== "probabilidad") fail("provocar.sorteo", "debe ser umbral|probabilidad");
    if (draw === "umbral") {
      const pw = obj(pv["pesos_familia"], "provocar.pesos_familia");
      if (dataKeys(pw).length !== genetics.baseFamilies.length) fail("provocar.pesos_familia", "debe tener exactamente las familias base");
      for (const f of genetics.baseFamilies) tauntWeights[f] = num(pw[f], `provocar.pesos_familia.${f}`, 0);
    } else {
      if (pv["pesos_familia"] !== undefined) fail("provocar.pesos_familia", "solo con sorteo 'umbral'");
      const pp = obj(pv["probabilidad_familia"], "provocar.probabilidad_familia");
      if (dataKeys(pp).length !== genetics.baseFamilies.length) fail("provocar.probabilidad_familia", "debe tener exactamente las familias base");
      for (const f of genetics.baseFamilies) tauntProb[f] = num(pp[f], `provocar.probabilidad_familia.${f}`, 0, 1);
    }
    const list = arr(pv["arquetipos"], "provocar.arquetipos").map((x, i) => str(x, `provocar.arquetipos[${i}]`));
    for (const a of list) {
      const rule = (archetypes as Record<string, ArchetypeRule | undefined>)[a];
      // de aliado que sortean su estado (hueco del estado) o, con sorteo por probabilidad, el táctico (hueco de prisa)
      const ok = rule && ((rule.target === "aliado" && !rule.energyIfMinCost) || (draw === "probabilidad" && rule.energyIfMinCost));
      if (!ok) fail("provocar.arquetipos", `'${a}' no admite provocar`);
    }
    if (new Set(list).size !== list.length) fail("provocar.arquetipos", "arquetipos repetidos");
    const loci =
      pv["loci"] === undefined && !is04
        ? null
        : arr(pv["loci"], "provocar.loci").map((x, i) => {
            const L = str(x, `provocar.loci[${i}]`);
            if (!(LOCUS_IDS as readonly string[]).includes(L)) fail(`provocar.loci[${i}]`, `locus desconocido '${L}'`);
            return L as LocusId;
          });
    const hybrids = pv["hibridas"] === undefined && !is04 ? "suma" : str(pv["hibridas"], "provocar.hibridas");
    if (hybrids !== "suma" && hybrids !== "max") fail("provocar.hibridas", "debe ser suma|max");
    const minShieldFraction = pv["fraccion_minima_escudo"] === undefined && !is04 ? 0 : num(pv["fraccion_minima_escudo"], "provocar.fraccion_minima_escudo", 0, 1);
    const tacticName = list.includes("tactico") ? str(pv["nombre_tactico"], "provocar.nombre_tactico") : pv["nombre_tactico"] === undefined ? "" : str(pv["nombre_tactico"], "provocar.nombre_tactico");
    taunt = {
      active: bool(pv["activo"], "provocar.activo"),
      cost: num(pv["coste"], "provocar.coste", 0),
      archetypes: list as ArchetypeId[],
      familyWeights: tauntWeights,
      draw,
      loci: loci ? Object.freeze(loci) : null,
      familyProb: tauntProb,
      hybrids,
      minShieldFraction,
      tacticName,
    };
  }

  // movimientos v0.4 §2 — movimiento gratis
  let free: MovesConfig["free"] = null;
  if (r["gratis"] === undefined && is04) fail("gratis", "obligatoria en la config v0.4");
  if (r["gratis"] !== undefined) {
    const P = "gratis";
    const g = obj(r["gratis"], P);
    onlyKeys(g, ["locus", "presupuesto", "arquetipos", "reasignar", "coste_max_estado", "modificadores", "permite_provocar"], P);
    const locus = str(g["locus"], `${P}.locus`);
    if (!(LOCUS_IDS as readonly string[]).includes(locus)) fail(`${P}.locus`, `locus desconocido '${locus}'`);
    const budgetFree = num(g["presupuesto"], `${P}.presupuesto`, Number.MIN_VALUE);
    const archs = arr(g["arquetipos"], `${P}.arquetipos`).map((x, i) => str(x, `${P}.arquetipos[${i}]`));
    for (const a of archs) if (!(ARCHETYPE_IDS as readonly string[]).includes(a)) fail(`${P}.arquetipos`, `arquetipo desconocido '${a}'`);
    if (archs.length === 0 || new Set(archs).size !== archs.length) fail(`${P}.arquetipos`, "lista no vacía y sin repetidos");
    const ra = obj(g["reasignar"], `${P}.reasignar`);
    const reassign: Partial<Record<ArchetypeId, ArchetypeId>> = {};
    for (const k of dataKeys(ra)) {
      const to = str(ra[k], `${P}.reasignar.${k}`);
      if (!(ARCHETYPE_IDS as readonly string[]).includes(k) || archs.includes(k)) fail(`${P}.reasignar.${k}`, "debe ser un arquetipo no permitido en el gratis");
      if (!archs.includes(to)) fail(`${P}.reasignar.${k}`, `'${to}' no es un arquetipo del gratis`);
      reassign[k as ArchetypeId] = to as ArchetypeId;
    }
    const mods = arr(g["modificadores"], `${P}.modificadores`).map((x, i) => str(x, `${P}.modificadores[${i}]`));
    for (const m of mods) if (!(MODIFIER_IDS as readonly string[]).includes(m)) fail(`${P}.modificadores`, `modificador desconocido '${m}'`);
    // movimientos v0.4 §2: área y prioridad no caben en el gratis
    if (mods.includes("area")) fail(`${P}.modificadores`, "el gratis no admite área");
    for (const a of archs) if (archetypes[a as ArchetypeId].forcedArea || archetypes[a as ArchetypeId].energyIfMinCost) fail(`${P}.arquetipos`, `'${a}' (área forzada o energía) no cabe en el gratis`);
    if (bool(g["permite_provocar"], `${P}.permite_provocar`)) fail(`${P}.permite_provocar`, "el gratis no descansa: provocar sería permanente (movimientos v0.4 §2)");
    // movimientos v0.4 §2 — el respaldo termina: P ≥ mínimo y fraccion_minima·P ≤ P − máx(coste fijo de modificador permitido)
    if (budgetFree < scalables.minPoints) fail(`${P}.presupuesto`, "debe ser ≥ escalables.minimo_puntos");
    let maxFixed = 0;
    for (const m of mods) if (m === "alcance" || m === "prioridad" || m === "perforar") maxFixed = Math.max(maxFixed, modifiers[m]);
    if (scalables.minFraction * budgetFree > budgetFree - maxFixed) fail(`${P}.presupuesto`, "fraccion_minima·presupuesto > presupuesto − coste del modificador (respaldo sin salida)");
    free = Object.freeze({
      locus: locus as LocusId,
      budget: budgetFree,
      archetypes: Object.freeze(archs) as readonly ArchetypeId[],
      reassign: Object.freeze(reassign),
      maxStatusCost: num(g["coste_max_estado"], `${P}.coste_max_estado`, 0),
      modifiers: Object.freeze(mods) as readonly ModifierId[],
    });
  }

  // movimientos v0.4 §3 — garantía de alcance/área
  let tailGuarantee: MovesConfig["tailGuarantee"] = null;
  if (r["garantia_alcance"] === undefined && is04) fail("garantia_alcance", "obligatoria en la config v0.4");
  if (r["garantia_alcance"] !== undefined) {
    const P = "garantia_alcance";
    const g = obj(r["garantia_alcance"], P);
    onlyKeys(g, ["locus", "arquetipos_prohibidos", "modificador_forzado", "salvo_si"], P);
    const locus = str(g["locus"], `${P}.locus`);
    if (!(LOCUS_IDS as readonly string[]).includes(locus)) fail(`${P}.locus`, `locus desconocido '${locus}'`);
    if (free && free.locus === locus) fail(`${P}.locus`, "no puede ser el locus del gratis");
    const forb = arr(g["arquetipos_prohibidos"], `${P}.arquetipos_prohibidos`).map((x, i) => str(x, `${P}.arquetipos_prohibidos[${i}]`));
    for (const a of forb) if (!(ARCHETYPE_IDS as readonly string[]).includes(a)) fail(`${P}.arquetipos_prohibidos`, `arquetipo desconocido '${a}'`);
    if (forb.includes("golpe")) fail(`${P}.arquetipos_prohibidos`, "no puede prohibir golpe (respaldo)");
    const forced = str(g["modificador_forzado"], `${P}.modificador_forzado`);
    if (forced !== "alcance" && forced !== "prioridad" && forced !== "perforar") fail(`${P}.modificador_forzado`, "debe ser un modificador de coste fijo");
    const unless = arr(g["salvo_si"], `${P}.salvo_si`).map((x, i) => {
      const u = str(x, `${P}.salvo_si[${i}]`);
      if (u !== "area_forzada" && u !== "area") fail(`${P}.salvo_si[${i}]`, "debe ser area_forzada|area");
      return u;
    });
    // el modificador forzado debe estar permitido en todo arquetipo que pueda llevarlo
    for (const a of ARCHETYPE_IDS) {
      const rule = archetypes[a];
      if (forb.includes(a) || (rule.forcedArea && unless.includes("area_forzada"))) continue;
      if (!rule.modifiers.includes(forced as ModifierId)) fail(`${P}.modificador_forzado`, `'${forced}' no está permitido en ${a}`);
    }
    // el respaldo (que no quita el forzado) termina: presupuesto[c] − coste ≥ mínimo y ≥ fraccion_minima·presupuesto[c]
    const fc = modifiers[forced as "alcance"];
    for (let c = 1; c <= cost.max; c++) {
      const b = budget[c] as number;
      if (Math.floor(b - fc) < scalables.minPoints || Math.floor(b - fc) < scalables.minFraction * b) fail(`presupuesto_por_coste.${c}`, `no deja sitio al modificador forzado de ${P} (respaldo sin salida)`);
    }
    tailGuarantee = Object.freeze({
      locus: locus as LocusId,
      forbiddenArchetypes: Object.freeze(forb) as readonly ArchetypeId[],
      forcedModifier: forced as ModifierId,
      unless: Object.freeze(unless) as readonly ("area_forzada" | "area")[],
    });
  }

  // movimientos §5 — sales de revisión (solo genes del catálogo)
  const sa = obj(obj(r["overrides_catalogo"], "overrides_catalogo")["sales"], "overrides_catalogo.sales");
  const salts: Record<string, string> = {};
  for (const [id, s] of Object.entries(sa)) {
    if (!genetics.catalogById.has(id)) fail(`overrides_catalogo.sales.${id}`, "no es un gen del catálogo");
    salts[id] = str(s, `overrides_catalogo.sales.${id}`);
  }

  for (const id of [...ARCHETYPE_IDS, ...OFFENSIVE_STATUS_IDS, ...POSITIVE_STATUS_IDS, ...MODIFIER_IDS, ...CONDITION_IDS]) checkId(id, "ids");

  return Object.freeze({
    version,
    seedPrefix,
    drawsPerMove,
    budget: Object.freeze(budget),
    cost: Object.freeze(cost),
    scalables: Object.freeze(scalables),
    statusCost: Object.freeze(statusCost),
    stunMinCost,
    extraEnergy: Object.freeze(extraEnergy),
    modifiers: Object.freeze(modifiers),
    conditions: Object.freeze(conditions),
    probabilities: Object.freeze(probabilities),
    archetypes: Object.freeze(archetypes),
    familyWeights: Object.freeze(familyWeights),
    locusWeights: Object.freeze(locusWeights),
    shapeWeights: Object.freeze(shapeWeights),
    names: Object.freeze({ core: Object.freeze(core), roots: Object.freeze(roots) }),
    taunt: Object.freeze({ ...taunt, archetypes: Object.freeze(taunt.archetypes), familyWeights: Object.freeze(tauntWeights), familyProb: Object.freeze(tauntProb) }),
    free,
    tailGuarantee,
    salts: Object.freeze(salts),
    genetics,
  });
}
