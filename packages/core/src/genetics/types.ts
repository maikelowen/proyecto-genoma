/**
 * Tipos de la genética v0.1 (spec docs/spec/genetica-v0.1.md).
 *
 * Convención: los NOMBRES de campos van en inglés; los VALORES de datos
 * (ids de familia, locus y estadística) son los de la spec/config, en
 * español ("llama", "cabeza", "potencia"...). Equivalencias spec → código:
 *   familia→family, forma→shape, firma→signature, movimiento→move,
 *   ancla→anchor, valores→values, origen→origin, genoma→genome,
 *   generacion→generation, padres→parents, crias→offspringCount,
 *   nacimiento→birth.
 */

/** spec §1.1 — orden fijo de loci (validado contra `orden_loci`). */
export const LOCUS_IDS = ["cabeza", "cuerpo", "extremidades", "cola"] as const;
export type LocusId = (typeof LOCUS_IDS)[number];

/** spec §1.1 — orden fijo de valores (validado contra `orden_valores`). */
export const STAT_IDS = ["potencia", "velocidad", "resistencia"] as const;
export type StatId = (typeof STAT_IDS)[number];

/** Familia base o híbrida; el universo lo define la config (spec §5). */
export type FamilyId = string;

export type Stats = { readonly [K in StatId]: number };

/** 4 parámetros de forma en rejilla 0,25 (spec §1.2). */
export type Shape = readonly [number, number, number, number];

/** spec §1.2 — cómo nació esta línea del gen. */
export type GeneOrigin = "base" | "mutacion";

/** Tipo de gen del catálogo base (spec §2.1). */
export interface GeneType {
  readonly id: string;
  readonly family: FamilyId;
  readonly locus: LocusId;
  readonly shape: Shape;
  readonly signature: string;
  readonly move: string;
  readonly anchor: Stats;
}

/**
 * Instancia de gen dentro de una criatura (spec §1.2).
 * id/family/locus/shape/signature/move son del TIPO; anchor/values/origin
 * son de la instancia.
 */
export interface Gene {
  readonly id: string;
  readonly family: FamilyId;
  readonly locus: LocusId;
  readonly shape: Shape;
  readonly signature: string;
  readonly move: string;
  readonly anchor: Stats;
  readonly values: Stats;
  readonly origin: GeneOrigin;
}

/** spec §1.3 — D expresado, R1/R2 recesivos. */
export interface Locus {
  readonly D: Gene;
  readonly R1: Gene;
  readonly R2: Gene;
}

export type Genome = { readonly [L in LocusId]: Locus };

/** spec §1.3 */
export interface Creature {
  readonly id: string;
  readonly genome: Genome;
  /** Derivada del genoma (spec §7). */
  readonly family: FamilyId;
  /** Salvaje = 0; cría = max(padres) + 1. */
  readonly generation: number;
  /** [idA, idB] ordenados por id (A = menor), o null si es salvaje. */
  readonly parents: readonly [string, string] | null;
  /** Nº de crías ya tenidas (0..max_crias_por_criatura). */
  readonly offspringCount: number;
  /** Tick/generación de nacimiento. */
  readonly birth: number;
}

export interface SlotWeights {
  readonly D: number;
  readonly R1: number;
  readonly R2: number;
}

export interface HybridFamily {
  readonly id: FamilyId;
  readonly name: string;
  readonly components: readonly [FamilyId, FamilyId];
}

/** Config validada y tipada (ver parseGeneticsConfig). */
export interface GeneticsConfig {
  readonly version: string;
  readonly baseFamilies: readonly FamilyId[];
  readonly hybrids: readonly HybridFamily[];
  readonly normal: { readonly uniforms: number; readonly center: number; readonly factor: number };
  readonly decimals: number;
  readonly values: {
    readonly anchorSum: number;
    readonly anchorMin: number;
    readonly anchorMax: number;
    readonly absMin: number;
    readonly absMax: number;
    readonly maxDeviation: number;
  };
  readonly shape: { readonly gridStep: number; readonly levels: number };
  readonly wild: {
    readonly probDMain: number;
    readonly probRMain: number;
    readonly sigma: number;
    readonly variantsPerFamilyLocus: number;
    readonly drawsPerCreature: number;
  };
  readonly inheritance: {
    readonly weightsD: SlotWeights;
    readonly weightsR: SlotWeights;
    readonly drawsPerLocus: number;
    readonly drawsPerChild: number;
  };
  readonly mutation: {
    readonly probPerLocus: number;
    readonly probNewHybrid: number;
    readonly probHybridAffinity: number;
    readonly probPickParentA: number;
    readonly sigmaAnchor: number;
    readonly sigmaShape: number;
    readonly sumRetries: number;
    readonly sumEpsilon: number;
  };
  readonly drift: { readonly kappa: number; readonly sigma: number };
  readonly limits: { readonly maxOffspring: number; readonly minAgeGenerations: number };
  readonly catalog: readonly GeneType[];
  /** Índices derivados. */
  readonly catalogById: ReadonlyMap<string, GeneType>;
  readonly catalogByKey: ReadonlyMap<string, GeneType>;
  readonly hybridById: ReadonlyMap<FamilyId, HybridFamily>;
  /** Clave "a|b" con a < b. */
  readonly hybridByPair: ReadonlyMap<string, HybridFamily>;
}
