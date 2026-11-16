/**
 * Carga y validación de `config/progresion.v0.1.json` (spec progresión v0.1, §10.1).
 * Función pura: recibe el JSON ya parseado y la config de combate + movimientos
 * (con la genética dentro) y devuelve una `ProgressionConfig` inmutable. No lee ficheros.
 */
import { arr, bool, checkId, dataKeys, fail, int, num, obj, onlyKeys, str } from "../combat/parse.ts";
import { validatePlacement } from "../combat/placement.ts";
import type { BattleConfig, SideSizeRules } from "../combat/combatant.ts";
import { CONDITION_IDS, MODIFIER_IDS, OFFENSIVE_STATUS_IDS, POSITIVE_STATUS_IDS } from "../moves/config.ts";
import { LOCUS_IDS, type FamilyId, type GeneticsConfig, type LocusId } from "../genetics/types.ts";

/** progresión §4.5 — ejes de una variante (orden fijo de la spec). */
export const VARIANT_AXES = ["modificador", "estado", "condicion"] as const;
export type VariantAxis = (typeof VARIANT_AXES)[number];
/** Posición de un gen oculto ("cabeza.R1"). */
export interface HiddenPos {
  readonly locus: LocusId;
  readonly slot: "R1" | "R2";
}

export interface Zone {
  readonly id: string;
  readonly name: string;
  readonly minLevel: number;
  readonly maxLevel: number;
  /** Pesos del tamaño de grupo 1..grupo_max. */
  readonly groupWeights: readonly number[];
  /** Familias y pesos, en el orden de claves de la config (§2.3). */
  readonly families: readonly FamilyId[];
  readonly familyWeights: readonly number[];
  readonly unlockLevel: number;
}

export interface PaidSlotRule {
  readonly slot: number;
  readonly level: number;
  readonly defaultLocus: LocusId;
}

export interface ProgressionConfig {
  readonly version: string;
  /** Versiones de las configs de las que depende (para el guardado §7.1). */
  readonly versions: { readonly progresion: string; readonly genetica: string; readonly movimientos: string; readonly combate: string };
  readonly levels: { readonly max: number; readonly xpTotal: readonly number[]; readonly echoLevel: number; readonly starterLevel: number };
  readonly xp: { readonly base: number; readonly perLevel: number; readonly defeatDivisor: number };
  readonly unlocks: {
    readonly freeLocus: LocusId;
    readonly paidSlots: readonly PaidSlotRule[];
    readonly matureLevel: number;
    readonly revealLevels: readonly number[];
    readonly revealOrder: readonly HiddenPos[];
  };
  readonly variants: {
    readonly levels: readonly number[];
    readonly locusByLevel: Readonly<Record<number, LocusId>>;
    readonly fallbackOrder: readonly LocusId[];
    readonly axes: readonly VariantAxis[];
    readonly excluded: readonly string[];
    readonly seedPrefix: string;
    readonly draws: number;
    readonly slack: number;
    /** D-072: un punto efectivo más que el original como máximo (un paso de redondeo). */
    readonly tolerancePoints: number;
    readonly tolerance: number;
  };
  readonly resources: {
    readonly lanternsStart: number;
    readonly lanternsPerWin: number;
    readonly lanternsMax: number;
    readonly essenceStart: number;
    readonly essencePerWildBase: number;
    readonly essencePerWildDivisor: number;
    readonly essenceMax: number;
  };
  readonly catching: {
    readonly basePct: number;
    readonly lifeBonusPct: number;
    readonly levelPenaltyPct: number;
    readonly purityPenaltyPct: number;
    readonly c100Min: number;
    readonly c100Range: number;
    readonly pctMin: number;
    readonly pctMax: number;
    readonly retryBonusPct: number;
    readonly maxAttempts: number;
  };
  readonly resonance: { readonly baseCost: number; readonly costPerEcho: number };
  readonly collection: {
    readonly max: number;
    readonly teamMin: number;
    readonly teamMax: number;
    readonly release: { readonly active: boolean; readonly essenceBase: number; readonly levelDivisor: number; readonly minLevel: number };
    readonly nameMaxChars: number;
  };
  readonly names: { readonly prefixes: readonly string[]; readonly suffixes: readonly string[] };
  readonly world: {
    readonly zones: readonly Zone[];
    readonly groupMax: number;
    readonly drawsPerEncounter: number;
    readonly wildPure: boolean;
    readonly wildBirth: number;
    readonly starterFamilies: readonly FamilyId[];
    readonly starterPure: boolean;
    readonly companion: { readonly active: boolean; readonly seed: string; readonly family: FamilyId; readonly level: number; readonly whileFewerThan: number };
  };
  readonly wildAi: "instinto" | "referencia";
  readonly save: { readonly storageKey: string; readonly format: string; readonly formatVersion: number; readonly streams: readonly string[] };
  /** Combate + movimientos con la extensión de bandos de 1 a `tamano` (§2.2). */
  readonly battle: BattleConfig;
  readonly genetics: GeneticsConfig;
}

/** Flujos de azar de §7.1 (orden de la spec). */
const STREAMS = ["inicial", "encuentro", "combate", "farol", "resonancia", "nombre"] as const;

function locus(v: unknown, path: string): LocusId {
  const s = str(v, path);
  if (!(LOCUS_IDS as readonly string[]).includes(s)) fail(path, `locus desconocido '${s}'`);
  return s as LocusId;
}
function exact(v: unknown, expected: unknown, path: string, why: string): void {
  if (v !== expected) fail(path, `solo se admite ${JSON.stringify(expected)} (${why})`);
}
function intList(v: unknown, path: string, min = -Infinity, max = Infinity): number[] {
  return arr(v, path).map((x, i) => int(x, `${path}[${i}]`, min, max));
}
function increasing(xs: readonly number[], path: string): void {
  for (let i = 1; i < xs.length; i++) if (!((xs[i] as number) > (xs[i - 1] as number))) fail(path, "debe ser estrictamente creciente");
}

/**
 * progresión §10.1 — valida la config de progresión contra la de combate y movimientos
 * (genética incluida). Lanza `ConfigError` con la ruta del campo.
 */
export function parseProgressionConfig(raw: unknown, battle: BattleConfig): ProgressionConfig {
  const r = obj(raw, "progresion");
  // QA N-02 (como Q-03 en combate): una errata en una clave no puede pasar en silencio
  onlyKeys(r, ["version", "depende_de", "niveles", "experiencia", "desbloqueos", "variantes", "recursos", "atrapar", "resonancia", "coleccion", "nombres", "mundo", "ia_salvaje", "combate_salvaje", "guardado", "validacion_config", "escenarios_sim", "criterios_sim"], "progresion");
  const G = battle.moves.genetics;
  const C = battle.combat;
  const M = battle.moves;
  const version = str(r["version"], "version");
  const dep = obj(r["depende_de"], "depende_de");
  onlyKeys(dep, ["genetica", "movimientos", "combate"], "depende_de");
  const verOf = (file: unknown, path: string): string => {
    const m = /\.v(\d+\.\d+)\.json$/.exec(str(file, path));
    if (!m) fail(path, "se esperaba '<nombre>.vX.Y.json'");
    return m[1] as string;
  };
  const versions = {
    progresion: version,
    genetica: verOf(dep["genetica"], "depende_de.genetica"),
    movimientos: verOf(dep["movimientos"], "depende_de.movimientos"),
    combate: verOf(dep["combate"], "depende_de.combate"),
  };
  if (versions.genetica !== G.version) fail("depende_de.genetica", `la genética cargada es v${G.version}`);
  if (versions.combate !== C.version) fail("depende_de.combate", `el combate cargado es v${C.version}`);

  // §4.1 niveles
  const nv = obj(r["niveles"], "niveles");
  onlyKeys(nv, ["nivel_max", "xp_total", "nivel_eco_al_nacer", "nivel_inicial"], "niveles");
  const maxLevel = int(nv["nivel_max"], "niveles.nivel_max", 1);
  const xpTotal = intList(nv["xp_total"], "niveles.xp_total", 0);
  if (xpTotal.length !== maxLevel) fail("niveles.xp_total", `longitud ${xpTotal.length} ≠ nivel_max ${maxLevel}`);
  if (xpTotal[0] !== 0) fail("niveles.xp_total", "debe empezar en 0");
  increasing(xpTotal, "niveles.xp_total");
  const echoLevel = int(nv["nivel_eco_al_nacer"], "niveles.nivel_eco_al_nacer", 1, maxLevel);
  const starterLevel = int(nv["nivel_inicial"], "niveles.nivel_inicial", 1, maxLevel);

  // §4.2 experiencia
  const ex = obj(r["experiencia"], "experiencia");
  onlyKeys(ex, ["base", "por_nivel", "reparto", "divisor_derrota"], "experiencia");
  exact(ex["reparto"], "completo", "experiencia.reparto", "§4.2");
  const xp = {
    base: int(ex["base"], "experiencia.base", 0),
    perLevel: int(ex["por_nivel"], "experiencia.por_nivel", 0),
    defeatDivisor: int(ex["divisor_derrota"], "experiencia.divisor_derrota", 1),
  };

  // §4.3 desbloqueos y §8 huecos
  const de = obj(r["desbloqueos"], "desbloqueos");
  onlyKeys(de, ["hueco_gratis_locus", "huecos_pago", "nivel_madurar", "revelar_ocultos"], "desbloqueos");
  const freeLocus = locus(de["hueco_gratis_locus"], "desbloqueos.hueco_gratis_locus");
  if (M.free === null || M.free.locus !== freeLocus) fail("desbloqueos.hueco_gratis_locus", "debe ser el locus del gratis de movimientos");
  const paidSlots = arr(de["huecos_pago"], "desbloqueos.huecos_pago").map((x, i): PaidSlotRule => {
    const p = `desbloqueos.huecos_pago[${i}]`;
    const o = obj(x, p);
    onlyKeys(o, ["hueco", "nivel", "locus_por_defecto"], p);
    const slot = int(o["hueco"], `${p}.hueco`, 1, 3);
    if (slot !== i + 1) fail(`${p}.hueco`, `debe ser ${i + 1}`);
    const dl = locus(o["locus_por_defecto"], `${p}.locus_por_defecto`);
    if (dl === freeLocus) fail(`${p}.locus_por_defecto`, "un hueco de pago no apunta al gratis");
    return Object.freeze({ slot, level: int(o["nivel"], `${p}.nivel`, 1, maxLevel), defaultLocus: dl });
  });
  // 4 huecos estructurales: gratis + 3 de pago (D-067)
  if (paidSlots.length !== 3) fail("desbloqueos.huecos_pago", "deben ser 3 huecos de pago");
  if (paidSlots[0]?.level !== 1) fail("desbloqueos.huecos_pago[0].nivel", "el primer hueco de pago se abre a nivel 1 (D-067)");
  for (let i = 1; i < 3; i++) if (!((paidSlots[i] as PaidSlotRule).level > (paidSlots[i - 1] as PaidSlotRule).level)) fail(`desbloqueos.huecos_pago[${i}].nivel`, "niveles crecientes");
  if (new Set(paidSlots.map((p) => p.defaultLocus)).size !== 3) fail("desbloqueos.huecos_pago", "loci de pago distintos");
  const matureLevel = int(de["nivel_madurar"], "desbloqueos.nivel_madurar", 1, maxLevel);
  const ro = obj(de["revelar_ocultos"], "desbloqueos.revelar_ocultos");
  onlyKeys(ro, ["niveles", "orden"], "desbloqueos.revelar_ocultos");
  const revealLevels = intList(ro["niveles"], "desbloqueos.revelar_ocultos.niveles", 1, maxLevel);
  increasing(revealLevels, "desbloqueos.revelar_ocultos.niveles");
  const revealOrder = arr(ro["orden"], "desbloqueos.revelar_ocultos.orden").map((x, i) => hiddenPos(x, `desbloqueos.revelar_ocultos.orden[${i}]`));
  if (revealOrder.length !== revealLevels.length) fail("desbloqueos.revelar_ocultos", "niveles y orden con la misma longitud");
  if (new Set(revealOrder.map(posKey)).size !== revealOrder.length) fail("desbloqueos.revelar_ocultos.orden", "posiciones repetidas");

  // §4.5 variantes
  const va = obj(r["variantes"], "variantes");
  onlyKeys(va, ["niveles", "locus_por_nivel", "orden_respaldo", "ejes", "piezas_excluidas", "prefijo_semilla", "tiradas", "eleccion_definitiva", "conmutar_con_original", "heredable", "holgura_puntos", "tolerancia_puntos", "tolerancia", "guardar_como"], "variantes");
  const vLevels = intList(va["niveles"], "variantes.niveles", 1, maxLevel);
  increasing(vLevels, "variantes.niveles");
  const lpl = obj(va["locus_por_nivel"], "variantes.locus_por_nivel");
  if (dataKeys(lpl).length !== vLevels.length) fail("variantes.locus_por_nivel", "una entrada por nivel");
  const locusByLevel: Record<number, LocusId> = {};
  for (const L of vLevels) locusByLevel[L] = locus(lpl[String(L)], `variantes.locus_por_nivel.${L}`);
  if (new Set(Object.values(locusByLevel)).size !== vLevels.length) fail("variantes.locus_por_nivel", "un locus distinto por nivel");
  const fallbackOrder = arr(va["orden_respaldo"], "variantes.orden_respaldo").map((x, i) => locus(x, `variantes.orden_respaldo[${i}]`));
  if (fallbackOrder.length !== LOCUS_IDS.length || new Set(fallbackOrder).size !== LOCUS_IDS.length) fail("variantes.orden_respaldo", "permutación de los 4 loci");
  const axes = arr(va["ejes"], "variantes.ejes").map((x, i) => {
    const s = str(x, `variantes.ejes[${i}]`);
    if (!(VARIANT_AXES as readonly string[]).includes(s)) fail(`variantes.ejes[${i}]`, `eje desconocido '${s}'`);
    return s as VariantAxis;
  });
  if (axes.length === 0 || new Set(axes).size !== axes.length) fail("variantes.ejes", "lista no vacía y sin repetidos");
  const knownPieces = new Set<string>([...MODIFIER_IDS, ...OFFENSIVE_STATUS_IDS, ...POSITIVE_STATUS_IDS, ...CONDITION_IDS]);
  const excluded = arr(va["piezas_excluidas"], "variantes.piezas_excluidas").map((x, i) => {
    const s = str(x, `variantes.piezas_excluidas[${i}]`);
    if (!knownPieces.has(s) || s === "ninguno") fail(`variantes.piezas_excluidas[${i}]`, `pieza '${s}' no existe en movimientos`);
    return s;
  });
  const draws = int(va["tiradas"], "variantes.tiradas");
  if (draws !== 2) fail("variantes.tiradas", "deben ser 2 (§4.5)");
  exact(va["eleccion_definitiva"], true, "variantes.eleccion_definitiva", "§4.5");
  exact(va["conmutar_con_original"], true, "variantes.conmutar_con_original", "§4.5");
  exact(va["heredable"], false, "variantes.heredable", "§4.5");
  exact(va["guardar_como"], "eje_pieza", "variantes.guardar_como", "QA B-08");
  const variants = {
    levels: Object.freeze(vLevels),
    locusByLevel: Object.freeze(locusByLevel),
    fallbackOrder: Object.freeze(fallbackOrder),
    axes: Object.freeze(axes),
    excluded: Object.freeze(excluded),
    seedPrefix: str(va["prefijo_semilla"], "variantes.prefijo_semilla"),
    draws,
    slack: num(va["holgura_puntos"], "variantes.holgura_puntos", 0),
    tolerancePoints: num(va["tolerancia_puntos"], "variantes.tolerancia_puntos", 0),
    tolerance: num(va["tolerancia"], "variantes.tolerancia", 0),
  };

  // §3.3 y §5.2 recursos
  const re = obj(r["recursos"], "recursos");
  onlyKeys(re, ["faroles_iniciales", "faroles_por_victoria", "faroles_max", "esencia_inicial", "esencia_por_salvaje", "esencia_max"], "recursos");
  const eps = obj(re["esencia_por_salvaje"], "recursos.esencia_por_salvaje");
  onlyKeys(eps, ["base", "divisor_nivel"], "recursos.esencia_por_salvaje");
  const resources = {
    lanternsStart: int(re["faroles_iniciales"], "recursos.faroles_iniciales", 0),
    lanternsPerWin: int(re["faroles_por_victoria"], "recursos.faroles_por_victoria", 0),
    lanternsMax: int(re["faroles_max"], "recursos.faroles_max", 0),
    essenceStart: int(re["esencia_inicial"], "recursos.esencia_inicial", 0),
    essencePerWildBase: int(eps["base"], "recursos.esencia_por_salvaje.base", 0),
    essencePerWildDivisor: int(eps["divisor_nivel"], "recursos.esencia_por_salvaje.divisor_nivel", 1),
    essenceMax: int(re["esencia_max"], "recursos.esencia_max", 0),
  };
  if (resources.lanternsStart > resources.lanternsMax) fail("recursos.faroles_iniciales", "mayor que faroles_max");
  if (resources.essenceStart > resources.essenceMax) fail("recursos.esencia_inicial", "mayor que esencia_max");

  // §3.2 atrapar (enteros, QA B-07)
  const at = obj(r["atrapar"], "atrapar");
  onlyKeys(at, ["base_pct", "bono_vida_pct", "penal_nivel_pct", "penal_pureza_pct", "c100_min", "c100_rango", "pct_min", "pct_max", "bono_reintento_pct", "intentos_max_por_salvaje", "tiradas_por_intento"], "atrapar");
  const catching = {
    basePct: int(at["base_pct"], "atrapar.base_pct", 0, 100),
    lifeBonusPct: int(at["bono_vida_pct"], "atrapar.bono_vida_pct", 0, 100),
    levelPenaltyPct: int(at["penal_nivel_pct"], "atrapar.penal_nivel_pct", 0, 100),
    purityPenaltyPct: int(at["penal_pureza_pct"], "atrapar.penal_pureza_pct", 0, 100),
    c100Min: int(at["c100_min"], "atrapar.c100_min"),
    c100Range: int(at["c100_rango"], "atrapar.c100_rango", 1),
    pctMin: int(at["pct_min"], "atrapar.pct_min", 0, 100),
    pctMax: int(at["pct_max"], "atrapar.pct_max", 0, 100),
    retryBonusPct: int(at["bono_reintento_pct"], "atrapar.bono_reintento_pct", 0, 100),
    maxAttempts: int(at["intentos_max_por_salvaje"], "atrapar.intentos_max_por_salvaje", 1, 2),
  };
  if (catching.pctMin > catching.pctMax) fail("atrapar.pct_min", "mayor que pct_max");
  if (int(at["tiradas_por_intento"], "atrapar.tiradas_por_intento") !== 1) fail("atrapar.tiradas_por_intento", "debe ser 1");

  // §5 resonancia
  const rs = obj(r["resonancia"], "resonancia");
  onlyKeys(rs, ["coste_base", "coste_por_eco_previo", "tiradas_por_resonancia"], "resonancia");
  const resonance = { baseCost: int(rs["coste_base"], "resonancia.coste_base", 0), costPerEcho: int(rs["coste_por_eco_previo"], "resonancia.coste_por_eco_previo", 0) };
  if (int(rs["tiradas_por_resonancia"], "resonancia.tiradas_por_resonancia") !== G.inheritance.drawsPerChild) fail("resonancia.tiradas_por_resonancia", `debe ser ${G.inheritance.drawsPerChild} (genética)`);

  // §6 colección
  const co = obj(r["coleccion"], "coleccion");
  onlyKeys(co, ["tamano_max", "equipo_max", "equipo_min", "liberar", "nombre_max_caracteres"], "coleccion");
  const li = obj(co["liberar"], "coleccion.liberar");
  onlyKeys(li, ["activo", "esencia_base", "divisor_nivel", "nivel_minimo"], "coleccion.liberar");
  const collection = {
    max: int(co["tamano_max"], "coleccion.tamano_max", 1),
    teamMax: int(co["equipo_max"], "coleccion.equipo_max", 1, C.teamSize),
    teamMin: int(co["equipo_min"], "coleccion.equipo_min", 1),
    release: {
      active: bool(li["activo"], "coleccion.liberar.activo"),
      essenceBase: int(li["esencia_base"], "coleccion.liberar.esencia_base", 0),
      levelDivisor: int(li["divisor_nivel"], "coleccion.liberar.divisor_nivel", 1),
      minLevel: int(li["nivel_minimo"], "coleccion.liberar.nivel_minimo", 1),
    },
    nameMaxChars: int(co["nombre_max_caracteres"], "coleccion.nombre_max_caracteres", 1),
  };
  if (collection.teamMin > collection.teamMax) fail("coleccion.equipo_min", "mayor que equipo_max");

  // §1.4 nombres
  const no = obj(r["nombres"], "nombres");
  onlyKeys(no, ["prefijos", "sufijos", "tiradas"], "nombres");
  const names = {
    prefixes: arr(no["prefijos"], "nombres.prefijos").map((x, i) => str(x, `nombres.prefijos[${i}]`)),
    suffixes: arr(no["sufijos"], "nombres.sufijos").map((x, i) => str(x, `nombres.sufijos[${i}]`)),
  };
  if (names.prefixes.length === 0 || names.suffixes.length === 0) fail("nombres", "prefijos y sufijos no vacíos");
  if (int(no["tiradas"], "nombres.tiradas") !== 2) fail("nombres.tiradas", "deben ser 2");
  for (const p of names.prefixes) for (const s of names.suffixes) if ([...(p + s)].length > collection.nameMaxChars) fail("nombres", `'${p + s}' supera nombre_max_caracteres`);

  // §2 mundo
  const mu = obj(r["mundo"], "mundo");
  onlyKeys(mu, ["zonas", "encuentro", "iniciales", "acompanante", "personajes", "nombres_provisionales"], "mundo");
  const en = obj(mu["encuentro"], "mundo.encuentro");
  onlyKeys(en, ["grupo_max", "tiradas_por_salvaje_extra", "tiradas_por_encuentro", "salvaje_puro", "id_temporal", "birth_temporal"], "mundo.encuentro");
  const groupMax = int(en["grupo_max"], "mundo.encuentro.grupo_max", 1, C.teamSize);
  const extraDraws = int(en["tiradas_por_salvaje_extra"], "mundo.encuentro.tiradas_por_salvaje_extra");
  if (extraDraws !== 2) fail("mundo.encuentro.tiradas_por_salvaje_extra", "deben ser 2 (familia y nivel, §2.3)");
  const drawsPerEncounter = int(en["tiradas_por_encuentro"], "mundo.encuentro.tiradas_por_encuentro");
  // validacion_config.formula_tiradas_encuentro: 1 + grupo_max · (extra + salvaje.tiradas_por_criatura)
  const expected = 1 + groupMax * (extraDraws + G.wild.drawsPerCreature);
  if (drawsPerEncounter !== expected) fail("mundo.encuentro.tiradas_por_encuentro", `${drawsPerEncounter} ≠ fórmula ${expected}`);
  const vc = obj(r["validacion_config"], "validacion_config");
  onlyKeys(vc, ["regex_ids", "formula_tiradas_encuentro"], "validacion_config");
  const regex = str(vc["regex_ids"], "validacion_config.regex_ids");
  if (regex !== "^[a-z0-9_]+$") fail("validacion_config.regex_ids", "debe ser ^[a-z0-9_]+$");
  const family = (v: unknown, path: string, baseOnly: boolean): FamilyId => {
    const f = str(v, path);
    if (!G.baseFamilies.includes(f) && (baseOnly || !G.hybridById.has(f))) fail(path, `familia '${f}' no es base`);
    return f;
  };
  const zones = arr(mu["zonas"], "mundo.zonas").map((x, i): Zone => {
    const p = `mundo.zonas[${i}]`;
    const z = obj(x, p);
    onlyKeys(z, ["id", "nombre", "nivel_min", "nivel_max", "grupo_pesos", "familias_pesos", "desbloqueo_nivel", "provisional"], p);
    const id = str(z["id"], `${p}.id`);
    checkId(id, `${p}.id`);
    const minL = int(z["nivel_min"], `${p}.nivel_min`, 1, maxLevel);
    const maxL = int(z["nivel_max"], `${p}.nivel_max`, minL, maxLevel);
    const gw = arr(z["grupo_pesos"], `${p}.grupo_pesos`).map((y, k) => num(y, `${p}.grupo_pesos[${k}]`, 0));
    if (gw.length !== groupMax) fail(`${p}.grupo_pesos`, `longitud ${gw.length} ≠ grupo_max ${groupMax}`);
    if (!(gw.reduce((a, b) => a + b, 0) > 0)) fail(`${p}.grupo_pesos`, "suma > 0");
    const fw = obj(z["familias_pesos"], `${p}.familias_pesos`);
    const fams = dataKeys(fw);
    // las salvajes solo son de familias base (GEN §2): híbridas y mutadas, solo por resonancia
    for (const f of fams) family(f, `${p}.familias_pesos.${f}`, true);
    const ws = fams.map((f) => num(fw[f], `${p}.familias_pesos.${f}`, 0));
    if (!(ws.reduce((a, b) => a + b, 0) > 0)) fail(`${p}.familias_pesos`, "suma > 0");
    return Object.freeze({
      id,
      name: str(z["nombre"], `${p}.nombre`),
      minLevel: minL,
      maxLevel: maxL,
      groupWeights: Object.freeze(gw),
      families: Object.freeze(fams),
      familyWeights: Object.freeze(ws),
      unlockLevel: int(z["desbloqueo_nivel"], `${p}.desbloqueo_nivel`, 0, maxLevel),
    });
  });
  if (zones.length === 0 || new Set(zones.map((z) => z.id)).size !== zones.length) fail("mundo.zonas", "lista no vacía con ids distintos");
  const ini = obj(mu["iniciales"], "mundo.iniciales");
  onlyKeys(ini, ["familias", "puras"], "mundo.iniciales");
  const starterFamilies = arr(ini["familias"], "mundo.iniciales.familias").map((x, i) => family(x, `mundo.iniciales.familias[${i}]`, true));
  if (starterFamilies.length !== 3) fail("mundo.iniciales.familias", "deben ser 3 (§1.3)");
  const ac = obj(mu["acompanante"], "mundo.acompanante");
  onlyKeys(ac, ["activo", "semilla", "familia", "nivel", "mientras_animas_menos_de"], "mundo.acompanante");
  const world = {
    zones: Object.freeze(zones),
    groupMax,
    drawsPerEncounter,
    wildPure: bool(en["salvaje_puro"], "mundo.encuentro.salvaje_puro"),
    wildBirth: int(en["birth_temporal"], "mundo.encuentro.birth_temporal", 0, 0),
    starterFamilies: Object.freeze(starterFamilies),
    starterPure: bool(ini["puras"], "mundo.iniciales.puras"),
    companion: Object.freeze({
      active: bool(ac["activo"], "mundo.acompanante.activo"),
      seed: str(ac["semilla"], "mundo.acompanante.semilla"),
      family: family(ac["familia"], "mundo.acompanante.familia", true),
      level: int(ac["nivel"], "mundo.acompanante.nivel", 1, maxLevel),
      whileFewerThan: int(ac["mientras_animas_menos_de"], "mundo.acompanante.mientras_animas_menos_de", 0, C.teamSize),
    }),
  };

  // §2.5 IA salvaje
  const ia = obj(r["ia_salvaje"], "ia_salvaje");
  onlyKeys(ia, ["modo"], "ia_salvaje");
  const modo = str(ia["modo"], "ia_salvaje.modo");
  if (modo !== "instinto" && modo !== "referencia") fail("ia_salvaje.modo", "instinto | referencia");

  // §2.2 extensión de tamaño de bando
  const cs = obj(r["combate_salvaje"], "combate_salvaje");
  onlyKeys(cs, ["tamano_min", "colocaciones_por_tamano", "colocacion_ia_por_tamano", "curacion_tras_combate"], "combate_salvaje");
  exact(cs["curacion_tras_combate"], "completa", "combate_salvaje.curacion_tras_combate", "§2.2");
  const minSize = int(cs["tamano_min"], "combate_salvaje.tamano_min", 1, C.teamSize);
  const cpt = obj(cs["colocaciones_por_tamano"], "combate_salvaje.colocaciones_por_tamano");
  const cia = obj(cs["colocacion_ia_por_tamano"], "combate_salvaje.colocacion_ia_por_tamano");
  const placementsBySize: Record<number, readonly string[]> = {};
  const aiPlacementBySize: Record<number, readonly number[]> = {};
  for (let n = minSize; n <= C.teamSize; n++) {
    const p = `combate_salvaje.colocaciones_por_tamano.${n}`;
    const shapes = arr(cpt[String(n)], p).map((x, i) => str(x, `${p}[${i}]`));
    if (shapes.length === 0 || new Set(shapes).size !== shapes.length) fail(p, "lista no vacía y sin repetidos");
    for (const f of shapes) {
      const m = /^(\d)\+(\d)$/.exec(f);
      if (!m || Number(m[1]) + Number(m[2]) !== n || Number(m[1]) === 0 || Number(m[1]) > C.frontRow.length || Number(m[2]) > C.backRow.length) fail(p, `forma '${f}' inválida`);
    }
    // con n = tamano las formas son las de combate (COM no se edita)
    if (n === C.teamSize) {
      if (shapes.length !== C.placements.length || shapes.some((s) => !C.placements.includes(s))) fail(p, `deben ser las de combate (${C.placements.join(", ")})`);
      continue;
    }
    placementsBySize[n] = Object.freeze(shapes);
    const ap = `combate_salvaje.colocacion_ia_por_tamano.${n}`;
    const aiPlace = intList(cia[String(n)], ap, 1, C.slots);
    // QA N-05: la colocación de la IA tiene que ser válida para ese tamaño de bando
    const bad = validatePlacement(aiPlace, C, n, { minSize, placementsBySize: placementsBySize as Record<number, readonly string[]>, aiPlacementBySize: {} });
    if (bad !== null) fail(ap, bad);
    aiPlacementBySize[n] = Object.freeze(aiPlace);
  }
  if (dataKeys(cpt).length !== C.teamSize - minSize + 1) fail("combate_salvaje.colocaciones_por_tamano", `claves ${minSize}..${C.teamSize}`);
  if (dataKeys(cia).length !== C.teamSize - minSize) fail("combate_salvaje.colocacion_ia_por_tamano", `claves ${minSize}..${C.teamSize - 1}`);
  const sides: SideSizeRules = Object.freeze({ minSize, placementsBySize: Object.freeze(placementsBySize), aiPlacementBySize: Object.freeze(aiPlacementBySize) });

  // §7 guardado
  const gu = obj(r["guardado"], "guardado");
  onlyKeys(gu, ["clave_almacen", "formato", "version_formato", "flujos_rng"], "guardado");
  const streams = arr(gu["flujos_rng"], "guardado.flujos_rng").map((x, i) => str(x, `guardado.flujos_rng[${i}]`));
  if (streams.length !== STREAMS.length || streams.some((s, i) => s !== STREAMS[i])) fail("guardado.flujos_rng", `deben ser ${STREAMS.join(", ")}`);
  const save = {
    storageKey: str(gu["clave_almacen"], "guardado.clave_almacen"),
    format: str(gu["formato"], "guardado.formato"),
    formatVersion: int(gu["version_formato"], "guardado.version_formato", 1),
    streams: Object.freeze(streams),
  };

  const out: ProgressionConfig = {
    version,
    versions: Object.freeze(versions),
    levels: Object.freeze({ max: maxLevel, xpTotal: Object.freeze(xpTotal), echoLevel, starterLevel }),
    xp: Object.freeze(xp),
    unlocks: Object.freeze({ freeLocus, paidSlots: Object.freeze(paidSlots), matureLevel, revealLevels: Object.freeze(revealLevels), revealOrder: Object.freeze(revealOrder) }),
    variants: Object.freeze(variants),
    resources: Object.freeze(resources),
    catching: Object.freeze(catching),
    resonance: Object.freeze(resonance),
    collection: Object.freeze({ ...collection, release: Object.freeze(collection.release) }),
    names: Object.freeze({ prefixes: Object.freeze(names.prefixes), suffixes: Object.freeze(names.suffixes) }),
    world: Object.freeze(world),
    wildAi: modo,
    save: Object.freeze(save),
    battle: Object.freeze({ combat: C, moves: M, sides }),
    genetics: G,
  };
  return Object.freeze(out);
}

function hiddenPos(v: unknown, path: string): HiddenPos {
  const s = str(v, path);
  const [l, slot, ...rest] = s.split(".");
  if (rest.length > 0 || !(LOCUS_IDS as readonly string[]).includes(l as string) || (slot !== "R1" && slot !== "R2")) fail(path, `posición '${s}' inválida (locus.R1 | locus.R2)`);
  return Object.freeze({ locus: l as LocusId, slot });
}
/** "cabeza.R1" */
export function posKey(p: HiddenPos): string {
  return `${p.locus}.${p.slot}`;
}
