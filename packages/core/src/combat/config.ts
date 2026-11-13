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
import { arr, bool, checkId, dataKeys, fail, int, num, obj, onlyKeys, sameList, str } from "./parse.ts";

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
  /** V2 — el movimiento usado descansa `turns` turnos (el golpe básico no descansa). [v0.4] `freeRests`: el gratis descansa (false). */
  readonly rest: { readonly active: boolean; readonly turns: number; readonly freeRests: boolean };
  /**
   * V4 — objetivo automático; `tauntShieldsSelf`: el escudo de un movimiento con provocar va al usuario.
   * [v0.4] `rowPriority`: reglas de combate v0.4 §3 (fila atacable, carril, provocar por carril y
   * apoyo de área a la fila propia expuesta); `shieldExposedRow`: escudo individual a la fila expuesta
   * con menos vida + escudo; `healIfAllFull`: a quién va una cura si nadie la necesita.
   */
  readonly autoTarget: {
    readonly active: boolean;
    readonly tauntShieldsSelf: boolean;
    readonly rowPriority: boolean;
    readonly shieldExposedRow: boolean;
    readonly healIfAllFull: "usuario" | "primero";
  };
  /** V4 — pieza provocar: nº de finales de turno que dura y valor para la IA (vida equivalente). [v0.4] `aiRequiresEndurance` (combate §8). */
  readonly taunt: { readonly duration: number; readonly aiValue: number; readonly aiRequiresEndurance: boolean };
  /**
   * combate v0.5 §2 (D-053, D-056) — última ánima: gratis solo o secuencia de 1–3 pagos distintos
   * en un único hueco, sin descanso. `stun`: "turno" (pierde la secuencia) o "primero" (plan B:
   * solo el 1.º movimiento); `slotPriority`: nivel del hueco ("primero" o "minimo", §3.1).
   */
  readonly lastAnima: { readonly active: boolean; readonly stun: "turno" | "primero"; readonly slotPriority: "primero" | "minimo" };
}

/** combate v0.4 §7 — regla de colocación de la IA (null en configs sin casilla vacía). */
export interface PlacementRule {
  readonly rule: "mas_vida_delante";
  readonly threshold12: number;
}

export interface CombatConfig {
  readonly version: string;
  /** combate v0.4 §1 — almas por equipo (3; v0.2: 4). */
  readonly teamSize: number;
  /** combate v0.4 §1 — casillas de la cuadrícula (estructural: 4; delantera 1–2, trasera 3–4). */
  readonly slots: number;
  /** combate v0.4 §1 — formas válidas "delanteras+traseras" (v0.4: "2+1", "1+2"; v0.2: "2+2"). */
  readonly placements: readonly string[];
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
  /** [v0.5] `payOnConfirm` (D-054): la energía de una acción cancelada se pierde (false: se devuelve, v0.2–v0.4). */
  readonly energy: { readonly initial: number; readonly perTurn: number; readonly max: number; readonly payOnConfirm: boolean };
  /** combate §4 */
  readonly order: {
    readonly jitter: number;
    readonly priorityLevels: readonly [number, number];
    /** [v0.2] nivel de los movimientos de aliado (curación y protección). */
    readonly allyPriority: number;
  };
  /** combate §5 */
  readonly damage: {
    readonly variance: number;
    readonly min: number;
    readonly basicCost: number;
    readonly basicPower: number;
    /** [v0.4] `dano.golpe_basico.activo`: false = no hay golpe básico; su papel lo hace el movimiento gratis. */
    readonly basicActive: boolean;
  };
  /** combate §6 — tabla[atacante][defensor]. */
  readonly families: {
    readonly baseRing: readonly FamilyId[];
    readonly hybridRing: readonly FamilyId[];
    readonly strong: number;
    readonly weak: number;
    readonly neutral: number;
    readonly table: Readonly<Record<FamilyId, Readonly<Record<FamilyId, number>>>>;
  };
  /** combate §7 — bonusByCount[n] para n = 0..tamano (0 si n < 2). [v0.4] `countsFree`: el gratis cuenta (false). */
  readonly synergy: { readonly bonusByCount: readonly number[]; readonly hybridsCountComponents: boolean; readonly countsFree: boolean };
  /** combate §8 */
  readonly statuses: Readonly<Record<StatusId, StatusRule>>;
  /** combate v0.4 §3.4 — renovación de la duración del escudo al sumar: "siempre" (v0.2) o "si_aporte_mayor_o_igual" (Q-01). */
  readonly shieldRenew: "siempre" | "si_aporte_mayor_o_igual";
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
    /** combate v0.4 §7 — `ia.colocacion` (null si no hay casilla vacía). */
    readonly placement: PlacementRule | null;
  };
  /** variantes v0.3 §2 (V3 no tiene bloque: es `energia.por_turno`). */
  readonly variants: CombatVariants;
}

/** variantes v0.3 — valores con el bloque `variantes` ausente: todo desactivado. */
const NO_EFFECT: BasicEffect = Object.freeze({ kind: "ninguno" });

/**
 * Clave nueva de v0.4: obligatoria si la config es v0.4; en v0.2 puede faltar y
 * toma el valor que reproduce el comportamiento anterior (`legacy`).
 */
function v04<T>(v04: boolean, value: unknown, path: string, legacy: T, parse: (x: unknown) => T): T {
  if (value === undefined) {
    if (v04) fail(path, "obligatoria en la config v0.4");
    return legacy;
  }
  return parse(value);
}

/** combate v0.5 §8 — clave nueva de v0.5: obligatoria en la config v0.5; antes, el valor de regresión (`legacy`). */
function v05<T>(is05: boolean, value: unknown, path: string, legacy: T, parse: (x: unknown) => T): T {
  if (value === undefined) {
    if (is05) fail(path, "obligatoria en la config v0.5");
    return legacy;
  }
  return parse(value);
}

/** combate v0.5 §0/§8 — bloque `variantes.ultima_anima` (desactivado si falta antes de v0.5). */
const LAST_OFF = Object.freeze({ active: false, stun: "turno" as const, slotPriority: "primero" as const });
function parseLastAnima(v: unknown): CombatVariants["lastAnima"] {
  const P = "variantes.ultima_anima";
  const o = obj(v, P);
  onlyKeys(o, ["activo", "aturdir", "prioridad_hueco"], P);
  const stun = str(o["aturdir"], `${P}.aturdir`);
  if (stun !== "turno" && stun !== "primero") fail(`${P}.aturdir`, "debe ser turno|primero");
  const sp = str(o["prioridad_hueco"], `${P}.prioridad_hueco`);
  if (sp !== "primero" && sp !== "minimo") fail(`${P}.prioridad_hueco`, "debe ser primero|minimo");
  return Object.freeze({ active: bool(o["activo"], `${P}.activo`), stun, slotPriority: sp });
}

/** variantes v0.3 §2 — bloque `variantes` (opcional en v0.2). Q-03: rechaza claves desconocidas en todos sus bloques. */
function parseVariants(v: unknown, baseRing: readonly string[], is04: boolean, is05: boolean): CombatVariants {
  const effects: Record<FamilyId, BasicEffect> = {};
  for (const f of baseRing) effects[f] = NO_EFFECT;
  if (v === undefined) {
    if (is04) fail("variantes", "obligatoria en la config v0.4");
    return Object.freeze({
      basicEffect: Object.freeze({ active: false, hybridComponent: 0 as const, effects: Object.freeze(effects) }),
      rest: Object.freeze({ active: false, turns: 1, freeRests: true }),
      autoTarget: Object.freeze({ active: false, tauntShieldsSelf: true, rowPriority: false, shieldExposedRow: false, healIfAllFull: "primero" as const }),
      taunt: Object.freeze({ duration: 1, aiValue: 0, aiRequiresEndurance: false }),
      lastAnima: LAST_OFF,
    });
  }
  const r = obj(v, "variantes");
  onlyKeys(r, ["golpe_basico_efecto", "descanso", "objetivo_automatico", "provocar", "ultima_anima"], "variantes");
  // V1
  const gb = obj(r["golpe_basico_efecto"], "variantes.golpe_basico_efecto");
  onlyKeys(gb, ["activo", "componente_hibrida", "efectos"], "variantes.golpe_basico_efecto");
  const ef = obj(gb["efectos"], "variantes.golpe_basico_efecto.efectos");
  sameList(dataKeys(ef).slice().sort(), baseRing.slice().sort(), "variantes.golpe_basico_efecto.efectos");
  for (const f of baseRing) {
    const p = `variantes.golpe_basico_efecto.efectos.${f}`;
    const o = obj(ef[f], p);
    const kind = str(o["tipo"], `${p}.tipo`);
    if (kind === "ninguno") {
      onlyKeys(o, ["tipo"], p);
      effects[f] = NO_EFFECT;
    } else if (kind === "estado") {
      onlyKeys(o, ["tipo", "estado", "probabilidad"], p);
      const status = str(o["estado"], `${p}.estado`);
      if (!(BASIC_EFFECT_STATUS_IDS as readonly string[]).includes(status)) fail(`${p}.estado`, `debe ser uno de ${BASIC_EFFECT_STATUS_IDS.join(", ")}`);
      effects[f] = Object.freeze({ kind, status: status as BasicEffectStatusId, chance: num(o["probabilidad"], `${p}.probabilidad`, 0, 1) });
    } else if (kind === "cura" || kind === "escudo") {
      onlyKeys(o, ["tipo", "cantidad"], p);
      effects[f] = Object.freeze({ kind, amount: int(o["cantidad"], `${p}.cantidad`, 0) });
    } else fail(`${p}.tipo`, "debe ser ninguno|estado|cura|escudo");
  }
  const hc = int(gb["componente_hibrida"], "variantes.golpe_basico_efecto.componente_hibrida", 0, 1) as 0 | 1;
  // V2
  const de = obj(r["descanso"], "variantes.descanso");
  onlyKeys(de, ["activo", "turnos", "gratis_descansa"], "variantes.descanso");
  // V4
  const oa = obj(r["objetivo_automatico"], "variantes.objetivo_automatico");
  onlyKeys(oa, ["activo", "escudo_provocar_al_usuario", "prioridad_fila", "escudo_fila_expuesta", "cura_si_todos_llenos"], "variantes.objetivo_automatico");
  const pv = obj(r["provocar"], "variantes.provocar");
  onlyKeys(pv, ["duracion", "valor_ia", "ia_exige_aguante"], "variantes.provocar");
  const P = "variantes.objetivo_automatico";
  return Object.freeze({
    basicEffect: Object.freeze({ active: bool(gb["activo"], "variantes.golpe_basico_efecto.activo"), hybridComponent: hc, effects: Object.freeze(effects) }),
    rest: Object.freeze({
      active: bool(de["activo"], "variantes.descanso.activo"),
      turns: int(de["turnos"], "variantes.descanso.turnos", 1),
      freeRests: v04(is04, de["gratis_descansa"], "variantes.descanso.gratis_descansa", true, (x) => bool(x, "variantes.descanso.gratis_descansa")),
    }),
    autoTarget: Object.freeze({
      active: bool(oa["activo"], `${P}.activo`),
      tauntShieldsSelf: bool(oa["escudo_provocar_al_usuario"], `${P}.escudo_provocar_al_usuario`),
      rowPriority: v04(is04, oa["prioridad_fila"], `${P}.prioridad_fila`, false, (x) => bool(x, `${P}.prioridad_fila`)),
      shieldExposedRow: v04(is04, oa["escudo_fila_expuesta"], `${P}.escudo_fila_expuesta`, false, (x) => bool(x, `${P}.escudo_fila_expuesta`)),
      healIfAllFull: v04(is04, oa["cura_si_todos_llenos"], `${P}.cura_si_todos_llenos`, "primero" as const, (x) => {
        const h = str(x, `${P}.cura_si_todos_llenos`);
        if (h !== "usuario" && h !== "primero") fail(`${P}.cura_si_todos_llenos`, "debe ser usuario|primero");
        return h;
      }),
    }),
    taunt: Object.freeze({
      duration: int(pv["duracion"], "variantes.provocar.duracion", 1),
      aiValue: num(pv["valor_ia"], "variantes.provocar.valor_ia", 0),
      aiRequiresEndurance: v04(is04, pv["ia_exige_aguante"], "variantes.provocar.ia_exige_aguante", false, (x) => bool(x, "variantes.provocar.ia_exige_aguante")),
    }),
    // combate v0.5 §0: obligatoria en v0.5; antes puede faltar (desactivada) o venir para estudiarla
    lastAnima: v05(is05, r["ultima_anima"], "variantes.ultima_anima", LAST_OFF, parseLastAnima),
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
  // v0.4 es la vigente; v0.2 se sigue cargando (claves nuevas opcionales con su valor anterior) para los tests de regresión
  // combate v0.5 §8: la v0.5 exige todo lo de v0.4 más sus dos claves nuevas
  if (version !== "0.2" && version !== "0.4" && version !== "0.5") fail("version", `solo se admiten las configs de combate v0.2, v0.4 y v0.5 (recibida '${version}')`);
  const is04 = version === "0.4" || version === "0.5";
  const is05 = version === "0.5";
  // Q-03: claves desconocidas en la raíz
  onlyKeys(
    r,
    ["version", "equipo", "estadisticas", "energia", "orden", "dano", "familias", "sinergia", "estados", "desgaste", "fin", "tiradas", "semilla", "ia", "variantes", "escenarios_sim", "criterios_sim", "barridos_sim"],
    "config",
  );

  // combate v0.4 §1 — cuadrícula 2×2 fija (4 casillas); el equipo ocupa `tamano` casillas
  const eq = obj(r["equipo"], "equipo");
  onlyKeys(eq, ["tamano", "casillas", "colocaciones", "delantera", "trasera"], "equipo");
  const slots = v04(is04, eq["casillas"], "equipo.casillas", 4, (x) => int(x, "equipo.casillas", 4, 4));
  const teamSize = int(eq["tamano"], "equipo.tamano", 1, slots);
  sameList(arr(eq["delantera"], "equipo.delantera"), [1, 2], "equipo.delantera");
  sameList(arr(eq["trasera"], "equipo.trasera"), [3, 4], "equipo.trasera");
  // combate v0.4 §1: forma "d+t" (almas delante + detrás); v0.2: un equipo lleno ("2+2")
  const placements = v04(is04, eq["colocaciones"], "equipo.colocaciones", ["2+2"], (x) => arr(x, "equipo.colocaciones").map((y, i) => str(y, `equipo.colocaciones[${i}]`)));
  if (placements.length === 0 || new Set(placements).size !== placements.length) fail("equipo.colocaciones", "lista no vacía y sin repetidos");
  for (const f of placements) {
    const m = /^([0-2])\+([0-2])$/.exec(f);
    if (!m || Number(m[1]) + Number(m[2]) !== teamSize || Number(m[1]) === 0) fail("equipo.colocaciones", `forma '${f}' inválida (d+t con d ≥ 1, d, t ≤ 2 y d + t = tamano)`);
  }

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
  onlyKeys(en, ["inicial", "por_turno", "maximo", "pago_al_confirmar"], "energia"); // combate v0.5 §8
  const energy = {
    initial: int(en["inicial"], "energia.inicial", 0),
    perTurn: int(en["por_turno"], "energia.por_turno", 0),
    max: int(en["maximo"], "energia.maximo", 1),
    // combate v0.5 §1 (D-054): obligatoria en v0.5; en v0.2/v0.4, false (se devuelve)
    payOnConfirm: v05(is05, en["pago_al_confirmar"], "energia.pago_al_confirmar", false, (x) => bool(x, "energia.pago_al_confirmar")),
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
  onlyKeys(gb, ["coste", "potencia", "activo"], "dano.golpe_basico");
  const damage = {
    variance: num(da["varianza"], "dano.varianza", 0, 0.99),
    min: int(da["minimo"], "dano.minimo", 0),
    basicCost: int(gb["coste"], "dano.golpe_basico.coste", 0, 0),
    basicPower: num(gb["potencia"], "dano.golpe_basico.potencia", 0),
    basicActive: v04(is04, gb["activo"], "dano.golpe_basico.activo", true, (x) => bool(x, "dano.golpe_basico.activo")), // combate v0.4 §2
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
  onlyKeys(si, ["bonus_por_n", "hibridas_cuentan_componentes", "cuenta_gratis"], "sinergia");
  const countsFree = v04(is04, si["cuenta_gratis"], "sinergia.cuenta_gratis", true, (x) => bool(x, "sinergia.cuenta_gratis")); // combate v0.4 §5
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
    onlyKeys(o, ["tipo", "duracion", "apilado", field, ...(id === "quemadura" ? ["max_pilas"] : []), ...(id === "escudo" ? ["renovar"] : [])], p);
    statuses[id] = Object.freeze({ kind: shape.kind, duration, stacking: shape.stacking, value, maxStacks });
  }

  // combate v0.4 §3.4 (Q-01): el escudo suma siempre y renueva la duración solo si el aporte ≥ el actual
  const shieldRenew = v04(is04, obj(es["escudo"], "estados.escudo")["renovar"], "estados.escudo.renovar", "siempre" as const, (x) => {
    const v = str(x, "estados.escudo.renovar");
    if (v !== "siempre" && v !== "si_aporte_mayor_o_igual") fail("estados.escudo.renovar", "debe ser siempre|si_aporte_mayor_o_igual");
    return v;
  });

  const de = obj(r["desgaste"], "desgaste");
  const wear = { fromTurn: int(de["desde_turno"], "desgaste.desde_turno", 0), perTurn: num(de["por_turno"], "desgaste.por_turno", 0) };
  const maxTurns = int(obj(r["fin"], "fin")["turnos_max"], "fin.turnos_max", 1);

  // combate §11 — 8 de jitter + 2 de varianza por casilla = 24 (v0.4 §1: también las de la casilla vacía)
  const ti = obj(r["tiradas"], "tiradas");
  const draws = {
    jitterPerTurn: int(ti["jitter_por_turno"], "tiradas.jitter_por_turno", 0),
    variancePerAction: int(ti["varianza_por_accion"], "tiradas.varianza_por_accion", 0),
    perTurn: int(ti["por_turno"], "tiradas.por_turno", 0),
  };
  if (draws.jitterPerTurn !== 2 * slots) fail("tiradas.jitter_por_turno", `debería ser ${2 * slots}`);
  // combate §5: en área se usan las 2 de la acción (máx. 2 objetivos por fila)
  if (draws.variancePerAction !== 2) fail("tiradas.varianza_por_accion", "debería ser 2 (una por posición de la fila)");
  if (draws.perTurn !== draws.jitterPerTurn + 2 * slots * draws.variancePerAction) {
    fail("tiradas.por_turno", `debería ser ${draws.jitterPerTurn + 2 * slots * draws.variancePerAction}`);
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
    // combate v0.4 §7 — solo tiene sentido con casilla vacía
    placement:
      teamSize < slots
        ? v04(is04, ia["colocacion"], "ia.colocacion", null, (x) => {
            const o = obj(x, "ia.colocacion");
            onlyKeys(o, ["regla", "umbral_1_2"], "ia.colocacion");
            if (o["regla"] !== "mas_vida_delante") fail("ia.colocacion.regla", "debe ser mas_vida_delante");
            return Object.freeze({ rule: "mas_vida_delante" as const, threshold12: num(o["umbral_1_2"], "ia.colocacion.umbral_1_2", 0) });
          })
        : null,
  };
  if (teamSize < slots && ai.placement === null) fail("ia.colocacion", "obligatoria con casilla vacía (tamano < casillas)");
  onlyKeys(ia, ["reserva_por_defecto", "bonus_ko", "kappa", "valor_estado", "holgura_regenerar", "valor_max_escudo", "objetivos_area_estimados", "factor_cura_estimada", "prob_condicion_estimada", "penalizacion_coste", "colocacion"], "ia");

  const variants = parseVariants(r["variantes"], baseRing, is04, is05);
  // combate v0.4 §2: sin golpe básico no hay a qué ponerle efecto (V1)
  if (!damage.basicActive && variants.basicEffect.active) fail("variantes.golpe_basico_efecto.activo", "requiere dano.golpe_basico.activo = true");

  return Object.freeze({
    version,
    teamSize,
    slots,
    placements: Object.freeze(placements),
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
    synergy: Object.freeze({ bonusByCount: Object.freeze(bonusByCount), hybridsCountComponents, countsFree }),
    statuses: Object.freeze(statuses),
    shieldRenew,
    wear: Object.freeze(wear),
    maxTurns,
    draws: Object.freeze(draws),
    seedPrefix,
    ai: Object.freeze(ai),
    variants,
  });
}
