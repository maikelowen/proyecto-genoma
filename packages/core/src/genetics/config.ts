/**
 * Carga y validación de `config/genetica.v0.2.json` (spec v0.2 §9.3).
 * Solo admite el formato v0.2 (calidad por gen); la v0.1 ya no se carga.
 *
 * Función pura: recibe el objeto JSON ya parseado (el núcleo no lee
 * ficheros) y devuelve una GeneticsConfig tipada e inmutable, o lanza
 * ConfigError con la ruta del campo problemático.
 *
 * Para barridos: clonar el JSON crudo, cambiar el número y volver a
 * llamar a parseGeneticsConfig (p. ej. raw.mutacion.prob_por_locus = 0.03).
 */
import { geneKey } from "./gene.ts";
import { signatureOf, statSum } from "./math.ts";
import {
  LOCUS_IDS,
  STAT_IDS,
  type FamilyId,
  type GeneticsConfig,
  type GeneType,
  type HybridFamily,
  type LocusId,
  type Shape,
  type SlotWeights,
  type Stats,
} from "./types.ts";

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

type Obj = Record<string, unknown>;

function fail(path: string, msg: string): never {
  throw new ConfigError(`${path}: ${msg}`);
}
function obj(v: unknown, path: string): Obj {
  if (typeof v !== "object" || v === null || Array.isArray(v)) fail(path, "se esperaba un objeto");
  return v as Obj;
}
function arr(v: unknown, path: string): unknown[] {
  if (!Array.isArray(v)) fail(path, "se esperaba un array");
  return v;
}
function num(v: unknown, path: string, min = -Infinity, max = Infinity): number {
  if (typeof v !== "number" || !Number.isFinite(v)) fail(path, "se esperaba un número finito");
  if (v < min || v > max) fail(path, `fuera de rango [${min}, ${max}]: ${v}`);
  return v;
}
function int(v: unknown, path: string, min = -Infinity, max = Infinity): number {
  const n = num(v, path, min, max);
  if (!Number.isInteger(n)) fail(path, `se esperaba un entero: ${n}`);
  return n;
}
function prob(v: unknown, path: string): number {
  return num(v, path, 0, 1);
}
function str(v: unknown, path: string): string {
  if (typeof v !== "string" || v.length === 0) fail(path, "se esperaba un string no vacío");
  return v;
}
function sameList(actual: unknown[], expected: readonly string[], path: string): void {
  if (actual.length !== expected.length || actual.some((x, i) => x !== expected[i])) {
    fail(path, `debe ser exactamente ${JSON.stringify(expected)}`);
  }
}

function slotWeights(v: unknown, path: string): SlotWeights {
  const o = obj(v, path);
  return {
    D: num(o["D"], `${path}.D`, 0),
    R1: num(o["R1"], `${path}.R1`, 0),
    R2: num(o["R2"], `${path}.R2`, 0),
  };
}

function stats(v: unknown, path: string): Stats {
  const o = obj(v, path);
  return {
    potencia: num(o["potencia"], `${path}.potencia`),
    velocidad: num(o["velocidad"], `${path}.velocidad`),
    resistencia: num(o["resistencia"], `${path}.resistencia`),
  };
}

export function pairKey(a: FamilyId, b: FamilyId): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function parseGeneticsConfig(raw: unknown): GeneticsConfig {
  const r = obj(raw, "config");

  const version = str(r["version"], "version");
  if (version !== "0.2") fail("version", `solo se admite la config v0.2 (recibida '${version}')`);

  // spec §9.3 — reglas de validación declaradas en la propia config
  const vc = obj(r["validacion_config"], "validacion_config");
  const idRegex = new RegExp(str(vc["regex_ids"], "validacion_config.regex_ids"));
  const maxOffspringMin = int(vc["max_crias_minimo"], "validacion_config.max_crias_minimo", 0);
  const normalTol = num(vc["tolerancia_normal_factor"], "validacion_config.tolerancia_normal_factor", 0);
  const checkId = (id: string, path: string): void => {
    if (!idRegex.test(id)) fail(path, `id '${id}' no cumple ${idRegex.source} (QA-07)`);
  };

  // spec §1.1 — órdenes fijos
  sameList(arr(r["orden_loci"], "orden_loci"), LOCUS_IDS, "orden_loci");
  LOCUS_IDS.forEach((l, i) => checkId(l, `orden_loci[${i}]`));
  sameList(arr(r["orden_valores"], "orden_valores"), STAT_IDS, "orden_valores");
  const slots = arr(obj(r["orden_slots_padres"], "orden_slots_padres")["slots"], "orden_slots_padres.slots");
  sameList(slots, ["A.D", "A.R1", "A.R2", "B.D", "B.R1", "B.R2"], "orden_slots_padres.slots");

  // spec §5 — familias
  const fam = obj(r["familias"], "familias");
  const baseFamilies = arr(fam["base"], "familias.base").map((x, i) => str(x, `familias.base[${i}]`));
  if (baseFamilies.length < 2) fail("familias.base", "se necesitan al menos 2 familias");
  if (new Set(baseFamilies).size !== baseFamilies.length) fail("familias.base", "ids repetidos");
  baseFamilies.forEach((f, i) => checkId(f, `familias.base[${i}]`));
  const hybrids: HybridFamily[] = arr(fam["hibridas"], "familias.hibridas").map((h, i) => {
    const p = `familias.hibridas[${i}]`;
    const o = obj(h, p);
    const comps = arr(o["componentes"], `${p}.componentes`).map((c, j) => str(c, `${p}.componentes[${j}]`));
    if (comps.length !== 2 || comps[0] === comps[1]) fail(`${p}.componentes`, "deben ser 2 familias distintas");
    for (const c of comps) if (!baseFamilies.includes(c)) fail(`${p}.componentes`, `'${c}' no es familia base`);
    checkId(str(o["id"], `${p}.id`), `${p}.id`);
    return { id: str(o["id"], `${p}.id`), name: str(o["nombre"], `${p}.nombre`), components: [comps[0], comps[1]] as [string, string] };
  });
  const hybridById = new Map<FamilyId, HybridFamily>();
  const hybridByPair = new Map<string, HybridFamily>();
  for (const h of hybrids) {
    if (baseFamilies.includes(h.id) || hybridById.has(h.id)) fail("familias.hibridas", `id repetido '${h.id}'`);
    const k = pairKey(h.components[0], h.components[1]);
    if (hybridByPair.has(k)) fail("familias.hibridas", `par repetido ${k}`);
    hybridById.set(h.id, h);
    hybridByPair.set(k, h);
  }

  // spec §9.1 — normal Irwin–Hall
  const n = obj(r["normal"], "normal");
  const normal = {
    uniforms: int(n["n_uniformes"], "normal.n_uniformes", 1),
    center: num(n["centro"], "normal.centro"),
    factor: num(n["factor"], "normal.factor", 0),
  };
  // spec §9.1 (QA-04): la normal debe ser estándar para n_uniformes dado
  if (normal.center !== normal.uniforms / 2) fail("normal.centro", `debe ser n_uniformes/2 = ${normal.uniforms / 2}`);
  if (Math.abs(normal.factor * normal.factor * normal.uniforms - 12) >= normalTol) {
    fail("normal.factor", "factor²·n_uniformes debe ser 12");
  }
  const decimals = int(r["redondeo_decimales"], "redondeo_decimales", 0, 10);
  let roundFactor = 1; // spec §9.1 (QA-03): F = 10^decimales por multiplicación
  for (let i = 0; i < decimals; i++) roundFactor *= 10;

  // spec §1.2 — rangos de valores
  const v = obj(r["valores"], "valores");
  const values = {
    anchorMin: num(v["ancla_min"], "valores.ancla_min"),
    anchorMax: num(v["ancla_max"], "valores.ancla_max"),
    absMin: num(v["absoluto_min"], "valores.absoluto_min"),
    absMax: num(v["absoluto_max"], "valores.absoluto_max"),
    maxDeviation: num(v["desviacion_max"], "valores.desviacion_max", 0),
  };
  if (values.anchorMin > values.anchorMax) fail("valores", "ancla_min > ancla_max");
  if (values.absMin > values.anchorMin || values.absMax < values.anchorMax) fail("valores", "el rango absoluto debe contener al de ancla");

  // spec §1.2/§1.4/§9.3 — calidad por gen
  const q = obj(r["calidad"], "calidad");
  const dist = str(q["distribucion_salvaje"], "calidad.distribucion_salvaje");
  if (dist !== "triangular" && dist !== "uniforme") fail("calidad.distribucion_salvaje", "debe ser 'triangular' o 'uniforme'");
  if (q["mutacion"] !== "media_padres_sin_ruido") fail("calidad.mutacion", "solo se admite 'media_padres_sin_ruido'");
  const quality = {
    base: num(q["base"], "calidad.base", 0),
    margin: num(q["margen"], "calidad.margen", 0, 1),
    min: num(q["min"], "calidad.min"),
    max: num(q["max"], "calidad.max"),
    wildDistribution: dist,
  } as const;
  if (Math.abs(quality.min - quality.base * (1 - quality.margin)) > 1e-9) fail("calidad.min", "debe ser base·(1−margen)");
  if (Math.abs(quality.max - quality.base * (1 + quality.margin)) > 1e-9) fail("calidad.max", "debe ser base·(1+margen)");
  // Σlo ≤ calidad.min y calidad.max ≤ Σhi para anclas ⇒ repartir siempre es factible
  if (values.anchorMin * 3 > quality.min || values.anchorMax * 3 < quality.max) {
    fail("calidad", "rango de calidad inalcanzable con ancla_min/ancla_max");
  }

  const f = obj(r["forma"], "forma");
  sameList(arr(f["parametros"], "forma.parametros"), ["tamano", "alargamiento", "angulosidad", "ornamento"], "forma.parametros");
  const shape = { gridStep: num(f["paso_rejilla"], "forma.paso_rejilla", 0), levels: int(f["niveles"], "forma.niveles", 2, 10) };
  if (Math.abs(shape.gridStep * (shape.levels - 1) - 1) > 1e-12) fail("forma", "paso_rejilla·(niveles−1) debe ser 1");

  const w = obj(r["salvaje"], "salvaje");
  const wild = {
    probDMain: prob(w["prob_D_familia_principal"], "salvaje.prob_D_familia_principal"),
    probRMain: prob(w["prob_R_familia_principal"], "salvaje.prob_R_familia_principal"),
    sigma: num(w["sigma_valores"], "salvaje.sigma_valores", 0),
    variantsPerFamilyLocus: int(w["variantes_por_familia_y_locus"], "salvaje.variantes_por_familia_y_locus", 1),
    drawsPerCreature: int(w["tiradas_por_criatura"], "salvaje.tiradas_por_criatura", 1),
  };

  const h = obj(r["herencia"], "herencia");
  const inheritance = {
    weightsD: slotWeights(h["pesos_D"], "herencia.pesos_D"),
    weightsR: slotWeights(h["pesos_R"], "herencia.pesos_R"),
    drawsPerLocus: int(h["tiradas_por_locus"], "herencia.tiradas_por_locus", 1),
    drawsPerChild: int(h["tiradas_por_cria"], "herencia.tiradas_por_cria", 1),
  };
  const wd = inheritance.weightsD;
  if (wd.D + wd.R1 + wd.R2 <= 0) fail("herencia.pesos_D", "todos los pesos son 0");
  // spec §3.2: R2 se sortea excluyendo hasta 2 slots ⇒ hacen falta ≥ 2 pesos > 0 por padre.
  const wr = inheritance.weightsR;
  if ([wr.D, wr.R1, wr.R2].filter((x) => x > 0).length < 2) fail("herencia.pesos_R", "se necesitan al menos 2 pesos > 0");

  // spec §9.2 — el consumo fijo debe cuadrar con la config
  const nu = normal.uniforms;
  const expectWild = 1 + LOCUS_IDS.length * 3 * (5 + 3 * nu); // spec §9.2: 1 + 12·(5 + 3n)
  const expectLocus = 6 + 16 * nu; // spec §9.2
  if (wild.drawsPerCreature !== expectWild) fail("salvaje.tiradas_por_criatura", `debería ser ${expectWild}`);
  if (inheritance.drawsPerLocus !== expectLocus) fail("herencia.tiradas_por_locus", `debería ser ${expectLocus}`);
  if (inheritance.drawsPerChild !== expectLocus * LOCUS_IDS.length) fail("herencia.tiradas_por_cria", `debería ser ${expectLocus * LOCUS_IDS.length}`);

  const m = obj(r["mutacion"], "mutacion");
  const mutation = {
    probPerLocus: prob(m["prob_por_locus"], "mutacion.prob_por_locus"),
    probNewHybrid: prob(m["prob_hibrida_nueva"], "mutacion.prob_hibrida_nueva"),
    probHybridAffinity: prob(m["prob_hibrida_afinidad"], "mutacion.prob_hibrida_afinidad"),
    probPickParentA: prob(m["prob_eleccion_padre_A"], "mutacion.prob_eleccion_padre_A"),
    sigmaAnchor: num(m["sigma_ancla"], "mutacion.sigma_ancla", 0),
    sigmaShape: num(m["sigma_forma"], "mutacion.sigma_forma", 0),
    sumRetries: int(m["reintentos_reparto_suma"], "mutacion.reintentos_reparto_suma", 1),
    sumEpsilon: num(m["epsilon_suma"], "mutacion.epsilon_suma", 0),
    fallbackMaxStep: int(m["paso_respaldo_max"], "mutacion.paso_respaldo_max", 2, 2),
  };

  const d = obj(r["deriva"], "deriva");
  const drift = { kappa: num(d["kappa"], "deriva.kappa", 0, 1), sigma: num(d["sigma"], "deriva.sigma", 0) };

  const l = obj(r["limites_sim"], "limites_sim");
  const limits = {
    maxOffspring: int(l["max_crias_por_criatura"], "limites_sim.max_crias_por_criatura", Math.max(1, maxOffspringMin)), // QA-06
    minAgeGenerations: int(l["edad_minima_generaciones"], "limites_sim.edad_minima_generaciones", 0),
  };

  // spec §7 — pesos de la familia de la criatura
  const fc = obj(r["familia_criatura"], "familia_criatura");
  const familyWeights = {
    base: num(fc["peso_gen_base"], "familia_criatura.peso_gen_base", Number.MIN_VALUE),
    hybrid: num(fc["peso_gen_hibrido"], "familia_criatura.peso_gen_hibrido", Number.MIN_VALUE),
  };

  // QA-05: tolerancia de invariantes desde la config
  const inv = obj(obj(r["criterios_sim"], "criterios_sim")["invariantes"], "criterios_sim.invariantes");
  const invariantTolerance = num(inv["tolerancia_suma"], "criterios_sim.invariantes.tolerancia_suma", 0);

  // Config parcial para reutilizar helpers (firma) al validar el catálogo.
  const partial = { shape, decimals } as unknown as GeneticsConfig;

  // spec §2.1 — catálogo base (la lista es la autoridad)
  const cat = obj(r["catalogo_base"], "catalogo_base");
  const catalog: GeneType[] = arr(cat["genes"], "catalogo_base.genes").map((g, i) => {
    const p = `catalogo_base.genes[${i}]`;
    const o = obj(g, p);
    const family = str(o["familia"], `${p}.familia`);
    if (!baseFamilies.includes(family)) fail(`${p}.familia`, `'${family}' no es familia base`);
    const locus = str(o["locus"], `${p}.locus`) as LocusId;
    if (!LOCUS_IDS.includes(locus)) fail(`${p}.locus`, `locus desconocido '${locus}'`);
    const shp = arr(o["forma"], `${p}.forma`).map((x, j) => num(x, `${p}.forma[${j}]`, 0, 1));
    if (shp.length !== 4) fail(`${p}.forma`, "deben ser 4 parámetros");
    for (const x of shp) {
      const lv = x / shape.gridStep;
      if (Math.abs(lv - Math.round(lv)) > 1e-9) fail(`${p}.forma`, `fuera de rejilla: ${x}`);
    }
    const shapeT = shp as unknown as Shape;
    const signature = str(o["firma"], `${p}.firma`);
    if (signature !== signatureOf(shapeT, partial)) fail(`${p}.firma`, `no coincide con la forma (${signatureOf(shapeT, partial)})`);
    const anchor = stats(o["ancla"], `${p}.ancla`);
    for (const k of STAT_IDS) num(anchor[k], `${p}.ancla.${k}`, values.anchorMin, values.anchorMax);
    if (Math.abs(statSum(anchor) - quality.base) > 1e-9) fail(`${p}.ancla`, `suma ${statSum(anchor)} ≠ calidad.base ${quality.base}`);
    return {
      id: str(o["id"], `${p}.id`),
      family,
      locus,
      shape: Object.freeze(shp) as unknown as Shape,
      signature,
      move: str(o["movimiento"], `${p}.movimiento`),
      anchor: Object.freeze(anchor),
    };
  });
  const catalogById = new Map<string, GeneType>();
  const catalogByKey = new Map<string, GeneType>();
  for (const g of catalog) {
    if (catalogById.has(g.id)) fail("catalogo_base.genes", `id repetido '${g.id}'`);
    const key = geneKey(g);
    if (catalogByKey.has(key)) fail("catalogo_base.genes", `clave repetida '${key}'`);
    catalogById.set(g.id, g);
    catalogByKey.set(key, g);
  }
  // spec §2.2: el salvaje busca `familia.locus.N` con N ∈ 1..variantes.
  for (const fa of baseFamilies) {
    for (const lo of LOCUS_IDS) {
      for (let k = 1; k <= wild.variantsPerFamilyLocus; k++) {
        const id = `${fa}.${lo}.${k}`;
        const g = catalogById.get(id);
        if (!g || g.family !== fa || g.locus !== lo) fail("catalogo_base.genes", `falta o es incoherente '${id}'`);
      }
    }
  }

  return Object.freeze({
    version,
    baseFamilies: Object.freeze(baseFamilies),
    hybrids: Object.freeze(hybrids),
    normal,
    decimals,
    roundFactor,
    quality,
    values,
    shape,
    wild,
    inheritance,
    mutation,
    drift,
    limits,
    familyWeights,
    invariantTolerance,
    catalog: Object.freeze(catalog),
    catalogById,
    catalogByKey,
    hybridById,
    hybridByPair,
  });
}
