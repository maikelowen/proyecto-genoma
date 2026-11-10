/** Identidad de gen, copia con deriva y construcción de genes congelados. */
import { distribute, mean3, statsFrom, statsToArray, valueBoundsOf } from "./math.ts";
import type { FamilyId, Gene, GeneticsConfig, GeneOrigin, LocusId, Shape, Stats } from "./types.ts";

/**
 * spec §8: mismo gen ⇔ misma clave `familia|locus|firma` (clave Genedex).
 * Calidad, ancla, valores y linaje no cuentan.
 */
export function geneKey(g: { readonly family: FamilyId; readonly locus: LocusId; readonly signature: string }): string {
  return `${g.family}|${g.locus}|${g.signature}`;
}

/** spec §8: ¿la clave es de un gen del catálogo base (no entra en Genedex)? */
export function isCatalogKey(key: string, config: GeneticsConfig): boolean {
  return config.catalogByKey.has(key);
}

/** Campos de tipo de un gen (spec §1.2). */
export interface GeneTypeFields {
  readonly id: string;
  readonly family: FamilyId;
  readonly locus: LocusId;
  readonly shape: Shape;
  readonly signature: string;
  readonly move: string;
}

/**
 * Crea un gen congelado (spec §1.2, QA-08): el propio gen, su forma,
 * ancla y valores quedan inmutables.
 */
export function makeGene(t: GeneTypeFields, quality: number, anchor: Stats, values: Stats, origin: GeneOrigin): Gene {
  return Object.freeze({
    id: t.id,
    family: t.family,
    locus: t.locus,
    shape: Object.isFrozen(t.shape) ? t.shape : (Object.freeze(t.shape.slice()) as unknown as Shape),
    signature: t.signature,
    move: t.move,
    quality,
    anchor: Object.isFrozen(anchor) ? anchor : Object.freeze({ ...anchor }),
    values: Object.isFrozen(values) ? values : Object.freeze({ ...values }),
    origin,
  });
}

/**
 * spec §6 `copiarConDeriva(g, n[3])` [v0.2]: conserva tipo, calidad, ancla
 * y origen; deriva de suma cero d' = (1−κ)·d + σ·(n − media(n)) y reparto
 * a la calidad del gen dentro de los límites de valores.
 */
export function copyWithDrift(g: Gene, n: readonly number[], config: GeneticsConfig): Gene {
  const { kappa, sigma } = config.drift;
  const a = statsToArray(g.anchor);
  const v = statsToArray(g.values);
  const mn = mean3(n);
  const target = a.map((ak, k) => ak + ((1 - kappa) * ((v[k] as number) - ak) + sigma * ((n[k] as number) - mn)));
  const [lo, hi] = valueBoundsOf(a, config);
  const values = distribute(target, lo, hi, g.quality, config);
  return makeGene(g, g.quality, g.anchor, statsFrom(values), g.origin);
}
