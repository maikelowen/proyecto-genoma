/**
 * Carga y validación de `config/combate.v0.2.json` (spec combate v0.2).
 * Solo admite el formato v0.2; la v0.1 ya no se carga.
 *
 * Función pura: recibe el objeto JSON ya parseado y devuelve una
 * `CombatConfig` tipada e inmutable, o lanza `ConfigError` con la ruta.
 * Barridos: clonar el JSON crudo, cambiar el número y volver a parsear
 * (p. ej. `raw.estadisticas.beta_calidad = 0`). Para barrer
 * `familias.fuerte/debil` hay que borrar `familias.tabla` (se deriva de
 * los anillos) o reescribirla: si existe, debe cuadrar con los anillos.
 */
import { STAT_IDS, type FamilyId, type StatId } from "../genetics/types.ts";
import { arr, bool, checkId, dataKeys, fail, int, num, obj, sameList, str } from "./parse.ts";

/** combate §8 — lista cerrada de estados, en este orden (orden canónico). */
export const STATUS_IDS = ["quemadura", "ralentizar", "aturdir", "marca", "debilitar", "escudo", "prisa", "regenerar"] as const;
export type StatusId = (typeof STATUS_IDS)[number];
export type StatusKind = "negativo" | "positivo";
export type Stacking = "refresca" | "pilas" | "suma";

/** combate §8: semántica fija que implementa el motor (el parser la exige). */
const STATUS_SHAPE: Record<StatusId, { kind: StatusKind; stacking: Stacking; field: string | null }> = {
  quemadura: { kind: "negativo", stacking: "pilas", field: "dano_por_pila" },
  ralentizar: { kind: "negativo", stacking: "refresca", field: "iniciativa" },
  aturdir: { kind: "negativo", stacking: "refresca", field: "inmunidad_turnos" },
  marca: { kind: "negativo", stacking: "refresca", field: "dano_recibido" },
  debilitar: { kind: "negativo", stacking: "refresca", field: "dano_infligido" },
  escudo: { kind: "positivo", stacking: "suma", field: "maximo" },
  prisa: { kind: "positivo", stacking: "refresca", field: "iniciativa" },
  regenerar: { kind: "positivo", stacking: "refresca", field: "cura_por_turno" },
};

export interface StatusRule {
  readonly kind: StatusKind;
  readonly duration: number;
  readonly stacking: Stacking;
  /** Parámetro principal (ver STATUS_SHAPE): daño por pila, iniciativa, inmunidad, ×daño, máximo, cura. */
  readonly value: number;
  /** Solo quemadura. */
  readonly maxStacks: number;
}

/** Derivada lineal en las desviaciones de cuota dX = 3σX − 1. */
export interface DerivedStatRule {
  readonly base: number;
  readonly coef: Readonly<Record<StatId, number>>;
}

/** combate §10 [v0.2] — estados que valora la IA (ofensivos + prisa y regenerar). */
export const AI_STATUS_IDS = ["quemadura", "ralentizar", "aturdir", "marca", "debilitar", "prisa", "regenerar"] as const;
export type AiStatusId = (typeof AI_STATUS_IDS)[number];

/** variantes v0.3 §2 V1 — estados que puede aplicar el golpe básico (ofensivos al objetivo; prisa y regenerar al usuario). */
export const BASIC_EFFECT_STATUS_IDS = ["quemadura", "ralentizar", "aturdir", "marca", "debilitar", "prisa", "regenerar"] as const;
export type BasicEffectStatusId = (typeof BASIC_EFFECT_STATUS_IDS)[number];

/**
 * variantes v0.3 §2 V1 — efecto menor del golpe básico de una familia base.
 * `estado`: lo aplica con probabilidad `chance` (usa la 2.ª tirada de varianza
 * de la posición, que un golpe de un solo objetivo no gasta: sin tiradas extra).
 * `cura` / `escudo`: cantidad fija sobre el usuario.
 */
export type BasicEffect =
  | { readonly kind: "ninguno" }
  | { readonly kind: "estado"; readonly status: BasicEffectStatusId; readonly chance: number }
  | { readonly kind: "cura"; readonly amount: number }
  | { readonly kind: "escudo"; readonly amount: number };

/** variantes v0.3 §2 — opciones en estudio; todas desactivadas por defecto (también si falta el bloque `variantes`). */
export interface CombatVariants {
  /** V1 — golpe básico con efecto por familia base (las híbridas usan el de su componente `hybridComponent`). */
  readonly basicEffect: { readonly active: boolean; readonly hybridComponent: 0 | 1; readonly effects: Readonly<Record<FamilyId, BasicEffect>> };
  /** V2 — el movimiento usado descansa `turns` turnos (el golpe básico no descansa). */
  readonly rest: { readonly active: boolean; readonly turns: number };
  /** V4 — objetivo automático por carriles; `tauntShieldsSelf`: el escudo de un movimiento con provocar va al usuario. */
  readonly autoTarget: { readonly active: boolean; readonly tauntShieldsSelf: boolean };
  /** V4 — pieza provocar: nº de finales de turno que dura y valor para la IA (vida equivalente). */
  readonly taunt: { readonly duration: number; readonly aiValue: number };
}

export interface CombatConfig {
  readonly version: string;
  /** combate §2 — estructural: 4 posiciones, delantera 1–2, trasera 3–4. */
  readonly teamSize: number;
  readonly frontRow: readonly number[];
  readonly backRow: readonly number[];
  /** combate §1 */
  readonly stats: {
    readonly totalRef: number;
    /** [v0.2] vida = base·(1 + Σ coef·d)·q */
    readonly hp: DerivedStatRule;
    /** [v0.2] fA = base·(1 + Σ coef·d)·q */
    readonly attack: DerivedStatRule;
    /** [v0.2] iniciativa = base + Σ coef·d (sin q) */
    readonly initiative: DerivedStatRule;
    /** β del término de calidad (0, 0,04 o 0,06 según decida el dueño). */
    readonly betaQuality: number;
  };
  /** combate §3 */
  readonly energy: { readonly initial: number; readonly perTurn: number; readonly max: number };
  /** combate §4 */
  readonly order: {
    readonly jitter: number;
    readonly priorityLevels: readonly [number, number];
    /** [v0.2] nivel de los movimientos de aliado (curación y protección). */
    readonly allyPriority: number;
  };
  /** combate §5 */
  readonly damage: { readonly variance: number; readonly min: number; readonly basicCost: number; readonly basicPower: number };
  /** combate §6 — tabla[atacante][defensor]. */
  readonly families: {
    readonly baseRing: readonly FamilyId[];
    readonly hybridRing: readonly FamilyId[];
    readonly strong: number;
    readonly weak: number;
    readonly neutral: number;
    readonly table: Readonly<Record<FamilyId, Readonly<Record<FamilyId, number>>>>;
  };
  /** combate §7 — bonusByCount[n] para n = 0..4 (0 si n < 2). */
  readonly synergy: { readonly bonusByCount: readonly number[]; readonly hybridsCountComponents: boolean };
  /** combate §8 */
  readonly statuses: Readonly<Record<StatusId, StatusRule>>;
  /** combate §5/§9 — desgaste = 1 + perTurn·max(0, t − fromTurn). */
  readonly wear: { readonly fromTurn: number; readonly perTurn: number };
  /** combate §9 */
  readonly maxTurns: number;
  /** combate §11 */
  readonly draws: { readonly jitterPerTurn: number; readonly variancePerAction: number; readonly perTurn: number };
  readonly seedPrefix: string;
  /** combate §10 */
  readonly ai: {
    readonly defaultReserve: number;
    readonly koBonus: number;
    /** [v0.2] κ del precio sombra λ = κ·máx r(m). */
    readonly kappa: number;
    /** [v0.2] valor en vida de cada estado aplicado. */
    readonly statusValue: Readonly<Record<AiStatusId, number>>;
    readonly regenSlack: number;
    readonly maxShieldValue: number;
    readonly areaTargetsEstimate: number;
    readonly healFactorEstimate: number;
    readonly conditionProbEstimate: number;
    readonly costPenalty: number;
  };
  /** variantes v0.3 §2 (V3 no tiene bloque: es `energia.por_turno`). */
  readonly variants: CombatVariants;
}

/** variantes v0.3 — valores con el bloque `variantes` ausente: todo desactivado. */
const NO_EFFECT: BasicEffect = Object.freeze({ kind: "ninguno" });

/** variantes v0.3 §2 — bloque `variantes` (opcional). Los efectos se definen para las familias del anillo base, exactamente. */
function parseVariants(v: unknown, baseRing: readonly string[]): CombatVariants {
  const effects: Record<FamilyId, BasicEffect> = {};
  for (const f of baseRing) effects[f] = NO_EFFECT;
  if (v === undefined) {
    return Object.freeze({
      basicEffect: Object.freeze({ active: false, hybridComponent: 0 as const, effects: Object.freeze(effects) }),
      rest: Object.freeze({ active: false, turns: 1 }),
      autoTarget: Object.freeze({ active: false, tauntShieldsSelf: true }),
      taunt: Object.freeze({ duration: 1, aiValue: 0 }),
    });
  }
  const r = obj(v, "variantes");
  // V1
  const gb = obj(r["golpe_basico_efecto"], "variantes.golpe_basico_efecto");
  const ef = obj(gb["efectos"], "variantes.golpe_basico_efecto.efectos");
  sameList(dataKeys(ef).slice().sort(), baseRing.slice().sort(), "variantes.golpe_basico_efecto.efectos");
  for (const f of baseRing) {
    const p = `variantes.golpe_basico_efecto.efectos.${f}`;
    const o = obj(ef[f], p);
    const kind = str(o["tipo"], `${p}.tipo`);
    if (kind === "ninguno") effects[f] = NO_EFFECT;
    else if (kind === "estado") {
      const status = str(o["estado"], `${p}.estado`);
      if (!(BASIC_EFFECT_STATUS_IDS as readonly string[]).includes(status)) fail(`${p}.estado`, `debe ser uno de ${BASIC_EFFECT_STATUS_IDS.join(", ")}`);
      effects[f] = Object.freeze({ kind, status: status as BasicEffectStatusId, chance: num(o["probabilidad"], `${p}.probabilidad`, 0, 1) });
    } else if (kind === "cura" || kind === "escudo") {
      effects[f] = Object.freeze({ kind, amount: int(o["cantidad"], `${p}.cantidad`, 0) });
    } else fail(`${p}.tipo`, "debe ser ninguno|estado|cura|escudo");
  }
  const hc = int(gb["componente_hibrida"], "variantes.golpe_basico_efecto.componente_hibrida", 0, 1) as 0 | 1;
  // V2
  const de = obj(r["descanso"], "variantes.descanso");
  // V4
  const oa = obj(r["objetivo_automatico"], "variantes.objetivo_automatico");
  const pv = obj(r["provocar"], "variantes.provocar");
  return Object.freeze({
    basicEffect: Object.freeze({ active: bool(gb["activo"], "variantes.golpe_basico_efecto.activo"), hybridComponent: hc, effects: Object.freeze(effects) }),
    rest: Object.freeze({ active: bool(de["activo"], "variantes.descanso.activo"), turns: int(de["turnos"], "variantes.descanso.turnos", 1) }),
    autoTarget: Object.freeze({
      active: bool(oa["activo"], "variantes.objetivo_automatico.activo"),
      tauntShieldsSelf: bool(oa["escudo_provocar_al_usuario"], "variantes.objetivo_automatico.escudo_provocar_al_usuario"),
    }),
    taunt: Object.freeze({ duration: int(pv["duracion"], "variantes.provocar.duracion", 1), aiValue: num(pv["valor_ia"], "variantes.provocar.valor_ia", 0) }),
  });
}

/** combate §6: tabla derivada de los anillos (siguiente = fuerte, anterior = débil). */
function ringTable(
  baseRing: readonly string[],
  hybridRing: readonly string[],
  strong: number,
  weak: number,
  neutral: number,
): Record<string, Record<string, number>> {
  const all = [...baseRing, ...hybridRing];
  const t: Record<string, Record<string, number>> = {};
  for (const a of all) {
    t[a] = {};
    for (const d of all) (t[a] as Record<string, number>)[d] = neutral;
  }
  for (const ring of [baseRing, hybridRing]) {
    const n = ring.length;
    ring.forEach((f, i) => {
      const next = ring[(i + 1) % n] as string;
      const prev = ring[(i + n - 1) % n] as string;
      (t[f] as Record<string, number>)[next] = strong;
      (t[f] as Record<string, number>)[prev] = weak;
    });
  }
  return t;
}

/**
 * combate §1 [v0.2] — regla de una derivada: `base` y `coef` con exactamente
 * potencia, velocidad y resistencia. Si `multiplicative`, comprueba que
 * 1 + Σ coef·d > 0 en los 3 vértices de las cuotas (σ = 1 en una stat),
 * así la vida y el ataque son positivos para cualquier criatura (es lineal en σ).
 */
function derivedRule(v: unknown, path: string, multiplicative: boolean): DerivedStatRule {
  const o = obj(v, path);
  const base = num(o["base"], `${path}.base`, multiplicative ? Number.MIN_VALUE : -Infinity);
  const co = obj(o["coef"], `${path}.coef`);
  sameList(dataKeys(co).slice().sort(), STAT_IDS.slice().sort(), `${path}.coef`);
  const coef = {} as Record<StatId, number>;
  for (const s of STAT_IDS) coef[s] = num(co[s], `${path}.coef.${s}`);
  if (multiplicative) {
    for (const top of STAT_IDS) {
      let f = 1;
      for (const s of STAT_IDS) f += coef[s] * (s === top ? 2 : -1); // d = 3σ − 1 con σ = 1 / 0
      if (!(f > 0)) fail(`${path}.coef`, `deja la derivada ≤ 0 con todo en ${top}`);
    }
  }
  return Object.freeze({ base, coef: Object.freeze(coef) });
}

export function parseCombatConfig(raw: unknown): CombatConfig {
  const r = obj(raw, "config");
  const version = str(r["version"], "version");
  if (version !== "0.2") fail("version", `solo se admite la config de combate v0.2 (recibida '${version}')`);

  // combate §2 — estructura fija del equipo
  const eq = obj(r["equipo"], "equipo");
  const teamSize = int(eq["tamano"], "equipo.tamano", 4, 4);
  sameList(arr(eq["delantera"], "equipo.delantera"), [1, 2], "equipo.delantera");
  sameList(arr(eq["trasera"], "equipo.trasera"), [3, 4], "equipo.trasera");

  // combate §1
  // combate §1 [v0.2]
  const st = obj(r["estadisticas"], "estadisticas");
  const stats = {
    totalRef: num(st["total_ref"], "estadisticas.total_ref", Number.MIN_VALUE),
    hp: derivedRule(st["vida"], "estadisticas.vida", true),
    attack: derivedRule(st["ataque"], "estadisticas.ataque", true),
    initiative: derivedRule(st["iniciativa"], "estadisticas.iniciativa", false),
    betaQuality: num(st["beta_calidad"], "estadisticas.beta_calidad", 0, 1),
  };
  if (st["nivel"] !== false) fail("estadisticas.nivel", "v0.2 no tiene nivel (debe ser false)");

  // combate §3
  const en = obj(r["energia"], "energia");
  const energy = {
    initial: int(en["inicial"], "energia.inicial", 0),
    perTurn: int(en["por_turno"], "energia.por_turno", 0),
    max: int(en["maximo"], "energia.maximo", 1),
  };
  if (energy.initial > energy.max) fail("energia.inicial", "mayor que el máximo");

  // combate §4
  const or = obj(r["orden"], "orden");
  sameList(arr(or["niveles_prioridad"], "orden.niveles_prioridad"), [0, 1], "orden.niveles_prioridad");
  const order = {
    jitter: num(or["jitter"], "orden.jitter", 0),
    priorityLevels: [0, 1] as const,
    allyPriority: int(or["prioridad_movimientos_aliado"], "orden.prioridad_movimientos_aliado", 0, 1), // combate §4 [v0.2]
  };

  // combate §5
  const da = obj(r["dano"], "dano");
  const gb = obj(da["golpe_basico"], "dano.golpe_basico");
  const damage = {
    variance: num(da["varianza"], "dano.varianza", 0, 0.99),
    min: int(da["minimo"], "dano.minimo", 0),
    basicCost: int(gb["coste"], "dano.golpe_basico.coste", 0, 0),
    basicPower: num(gb["potencia"], "dano.golpe_basico.potencia", 0),
  };

  // combate §6 — dos anillos
  const fa = obj(r["familias"], "familias");
  const baseRing = arr(fa["anillo_base"], "familias.anillo_base").map((x, i) => str(x, `familias.anillo_base[${i}]`));
  const hybridRing = arr(fa["anillo_hibridas"], "familias.anillo_hibridas").map((x, i) => str(x, `familias.anillo_hibridas[${i}]`));
  const all = [...baseRing, ...hybridRing];
  all.forEach((f, i) => checkId(f, `familias[${i}]`));
  if (new Set(all).size !== all.length) fail("familias", "familias repetidas en los anillos");
  if (baseRing.length < 3 || hybridRing.length < 3) fail("familias", "cada anillo necesita al menos 3 familias");
  const strong = num(fa["fuerte"], "familias.fuerte", 1);
  const weak = num(fa["debil"], "familias.debil", Number.MIN_VALUE, 1);
  const neutral = num(fa["neutral"], "familias.neutral", 1, 1);
  const derived = ringTable(baseRing, hybridRing, strong, weak, neutral);
  if (fa["tabla"] !== undefined) {
    // combate §6: la tabla es la autoridad, pero debe cuadrar con los anillos.
    const tb = obj(fa["tabla"], "familias.tabla");
    if (dataKeys(tb).length !== all.length) fail("familias.tabla", `debe tener ${all.length} filas`);
    for (const a of all) {
      const row = obj(tb[a], `familias.tabla.${a}`);
      if (dataKeys(row).length !== all.length) fail(`familias.tabla.${a}`, `debe tener ${all.length} columnas`);
      for (const d of all) {
        const v = num(row[d], `familias.tabla.${a}.${d}`, Number.MIN_VALUE);
        const e = (derived[a] as Record<string, number>)[d] as number;
        if (Math.abs(v - e) > 1e-12) fail(`familias.tabla.${a}.${d}`, `${v} no cuadra con los anillos (${e}); bórrala para derivarla`);
      }
    }
  }
  const table: Record<string, Readonly<Record<string, number>>> = {};
  for (const a of all) table[a] = Object.freeze(derived[a] as Record<string, number>);

  // combate §7
  const si = obj(r["sinergia"], "sinergia");
  const bn = obj(si["bonus_por_n"], "sinergia.bonus_por_n");
  if (dataKeys(bn).length !== teamSize - 1) fail("sinergia.bonus_por_n", "claves esperadas: 2..tamano");
  const bonusByCount = [0, 0];
  for (let n = 2; n <= teamSize; n++) {
    const b = num(bn[String(n)], `sinergia.bonus_por_n.${n}`, 0);
    if (b < (bonusByCount[n - 1] as number)) fail(`sinergia.bonus_por_n.${n}`, "debe ser no decreciente");
    bonusByCount.push(b);
  }
  const hybridsCountComponents = bool(si["hibridas_cuentan_componentes"], "sinergia.hibridas_cuentan_componentes");

  // combate §8 — estados
  const es = obj(r["estados"], "estados");
  if (dataKeys(es).length !== STATUS_IDS.length) fail("estados", `deben ser exactamente ${STATUS_IDS.join(", ")}`);
  const statuses = {} as Record<StatusId, StatusRule>;
  for (const id of STATUS_IDS) {
    const p = `estados.${id}`;
    const o = obj(es[id], p);
    const shape = STATUS_SHAPE[id];
    if (o["tipo"] !== shape.kind) fail(`${p}.tipo`, `debe ser '${shape.kind}'`);
    if (o["apilado"] !== shape.stacking) fail(`${p}.apilado`, `debe ser '${shape.stacking}'`);
    const duration = int(o["duracion"], `${p}.duracion`, 1);
    const field = shape.field as string;
    const value =
      id === "aturdir" ? int(o[field], `${p}.${field}`, 0) : id === "ralentizar" ? num(o[field], `${p}.${field}`, -Infinity, 0) : num(o[field], `${p}.${field}`, 0);
    const maxStacks = id === "quemadura" ? int(o["max_pilas"], `${p}.max_pilas`, 1) : 1;
    statuses[id] = Object.freeze({ kind: shape.kind, duration, stacking: shape.stacking, value, maxStacks });
  }

  const de = obj(r["desgaste"], "desgaste");
  const wear = { fromTurn: int(de["desde_turno"], "desgaste.desde_turno", 0), perTurn: num(de["por_turno"], "desgaste.por_turno", 0) };
  const maxTurns = int(obj(r["fin"], "fin")["turnos_max"], "fin.turnos_max", 1);

  // combate §11 — 8 de jitter + 2 de varianza por posición = 24
  const ti = obj(r["tiradas"], "tiradas");
  const draws = {
    jitterPerTurn: int(ti["jitter_por_turno"], "tiradas.jitter_por_turno", 0),
    variancePerAction: int(ti["varianza_por_accion"], "tiradas.varianza_por_accion", 0),
    perTurn: int(ti["por_turno"], "tiradas.por_turno", 0),
  };
  if (draws.jitterPerTurn !== 2 * teamSize) fail("tiradas.jitter_por_turno", `debería ser ${2 * teamSize}`);
  // combate §5: en área se usan las 2 de la acción (máx. 2 objetivos por fila)
  if (draws.variancePerAction !== 2) fail("tiradas.varianza_por_accion", "debería ser 2 (una por posición de la fila)");
  if (draws.perTurn !== draws.jitterPerTurn + 2 * teamSize * draws.variancePerAction) {
    fail("tiradas.por_turno", `debería ser ${draws.jitterPerTurn + 2 * teamSize * draws.variancePerAction}`);
  }
  const seedPrefix = str(obj(r["semilla"], "semilla")["prefijo"], "semilla.prefijo");

  // combate §10 [v0.2]
  const ia = obj(r["ia"], "ia");
  const ve = obj(ia["valor_estado"], "ia.valor_estado");
  if (dataKeys(ve).length !== AI_STATUS_IDS.length) fail("ia.valor_estado", `claves esperadas: ${AI_STATUS_IDS.join(", ")}`);
  const statusValue = {} as Record<AiStatusId, number>;
  for (const id of AI_STATUS_IDS) statusValue[id] = num(ve[id], `ia.valor_estado.${id}`, 0);
  const ai = {
    defaultReserve: int(ia["reserva_por_defecto"], "ia.reserva_por_defecto", 0, energy.max),
    koBonus: num(ia["bonus_ko"], "ia.bonus_ko", 0),
    kappa: num(ia["kappa"], "ia.kappa", 0),
    statusValue: Object.freeze(statusValue),
    regenSlack: num(ia["holgura_regenerar"], "ia.holgura_regenerar", 0),
    maxShieldValue: num(ia["valor_max_escudo"], "ia.valor_max_escudo", 0),
    areaTargetsEstimate: num(ia["objetivos_area_estimados"], "ia.objetivos_area_estimados", 0),
    healFactorEstimate: num(ia["factor_cura_estimada"], "ia.factor_cura_estimada", 0),
    conditionProbEstimate: num(ia["prob_condicion_estimada"], "ia.prob_condicion_estimada", 0, 1),
    costPenalty: num(ia["penalizacion_coste"], "ia.penalizacion_coste", 0),
  };

  return Object.freeze({
    version,
    teamSize,
    frontRow: Object.freeze([1, 2]),
    backRow: Object.freeze([3, 4]),
    stats: Object.freeze(stats),
    energy: Object.freeze(energy),
    order: Object.freeze(order),
    damage: Object.freeze(damage),
    families: Object.freeze({
      baseRing: Object.freeze(baseRing),
      hybridRing: Object.freeze(hybridRing),
      strong,
      weak,
      neutral,
      table: Object.freeze(table),
    }),
    synergy: Object.freeze({ bonusByCount: Object.freeze(bonusByCount), hybridsCountComponents }),
    statuses: Object.freeze(statuses),
    wear: Object.freeze(wear),
    maxTurns,
    draws: Object.freeze(draws),
    seedPrefix,
    ai: Object.freeze(ai),
    variants: parseVariants(r["variantes"], baseRing),
  });
}
