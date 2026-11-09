/** Identidad de gen, copia con deriva y construcción desde catálogo. */
import { clamp, roundTo, statsFrom } from "./math.ts";
import { STAT_IDS, type FamilyId, type Gene, type GeneticsConfig, type GeneType, type LocusId, type Stats } from "./types.ts";

/**
 * spec §8: mismo gen ⇔ misma clave `familia|locus|firma` (clave Genedex).
 * ancla, valores y linaje no cuentan.
 */
export function geneKey(g: { readonly family: FamilyId; readonly locus: LocusId; readonly signature: string }): string {
  return `${g.family}|${g.locus}|${g.signature}`;
}

/** spec §8: ¿la clave es de un gen del catálogo base (no entra en Genedex)? */
export function isCatalogKey(key: string, config: GeneticsConfig): boolean {
  return config.catalogByKey.has(key);
}

/** Límites de un valor respecto a su ancla (spec §1.2): [max(5, a−10), min(60, a+10)]. */
export function valueBounds(anchor: number, config: GeneticsConfig): [number, number] {
  const v = config.values;
  return [Math.max(v.absMin, anchor - v.maxDeviation), Math.min(v.absMax, anchor + v.maxDeviation)];
}

/** Instancia de un gen del catálogo con valores dados (origen "base"). */
export function geneFromType(t: GeneType, values: Stats): Gene {
  return {
    id: t.id,
    family: t.family,
    locus: t.locus,
    shape: t.shape,
    signature: t.signature,
    move: t.move,
    anchor: t.anchor,
    values,
    origin: "base",
  };
}

/**
 * spec §6 `copiarConDeriva(g, n[3])`: conserva tipo, ancla y origen;
 * v' = r2(clamp(v + κ(a − v) + σ·n, límites)).
 */
export function copyWithDrift(g: Gene, n: readonly number[], config: GeneticsConfig): Gene {
  const { kappa, sigma } = config.drift;
  const out = STAT_IDS.map((k, i) => {
    const a = g.anchor[k];
    const v = g.values[k];
    const [lo, hi] = valueBounds(a, config);
    return roundTo(clamp(v + kappa * (a - v) + sigma * (n[i] as number), lo, hi), config);
  });
  return { ...g, values: statsFrom(out) };
}
