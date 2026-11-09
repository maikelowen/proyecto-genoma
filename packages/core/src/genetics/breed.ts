/** spec §3 — herencia `criar(p1, p2, rng)`. Función pura. */
import type { Rng } from "../rng.ts";
import { creatureFamily } from "./creature.ts";
import { copyWithDrift, geneKey } from "./gene.ts";
import { sampleNormals } from "./math.ts";
import { mutateGene } from "./mutation.ts";
import { LOCUS_IDS, type Creature, type FamilyId, type Gene, type GeneticsConfig, type Locus, type LocusId } from "./types.ts";

export class BreedingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BreedingError";
  }
}

export interface BreedOptions {
  /** Id único de la cría (lo asigna quien llama). */
  readonly id: string;
  /** Tick de nacimiento de la cría; se usa para la edad mínima de los padres. */
  readonly birth: number;
}

/**
 * Traza de un locus. Índices de slot en orden `orden_slots_padres`
 * (0..2 = A.D/A.R1/A.R2, 3..5 = B.*), con A = padre de id menor.
 */
export interface LocusTrace {
  readonly locus: LocusId;
  readonly mutated: boolean;
  /** Slot sorteado para D (se sortea aunque mute; entonces no se usa). */
  readonly dSlot: number;
  readonly r1Slot: number;
  readonly r2Slot: number;
}

/** Mutación ocurrida en una cría (para métricas y Genedex). */
export interface MutationEvent {
  readonly locus: LocusId;
  readonly key: string;
  readonly geneId: string;
  readonly family: FamilyId;
  /** La clave cayó en un gen del catálogo base (no entra en Genedex, spec §4.5). */
  readonly matchesCatalog: boolean;
  /** Claves de los D de A y B en ese locus. */
  readonly parentDKeys: readonly [string, string];
}

export interface BreedResult {
  readonly child: Creature;
  /** Copia de p1 con offspringCount + 1 (mismo orden que los argumentos). */
  readonly parent1: Creature;
  /** Copia de p2 con offspringCount + 1. */
  readonly parent2: Creature;
  readonly trace: readonly LocusTrace[];
  readonly mutations: readonly MutationEvent[];
}

/**
 * spec §3.2 precondiciones. Devuelve el motivo si NO pueden criar, o
 * null si pueden. No consume tiradas.
 */
export function breedingBlocker(p1: Creature, p2: Creature, config: GeneticsConfig, birth: number): string | null {
  const { maxOffspring, minAgeGenerations } = config.limits;
  if (p1.id === p2.id) return "los padres son la misma criatura";
  for (const p of [p1, p2]) {
    if (p.offspringCount >= maxOffspring) return `${p.id} ya tiene ${p.offspringCount} crías (máx ${maxOffspring})`;
    if (birth - p.birth < minAgeGenerations) return `${p.id} tiene edad ${birth - p.birth} < ${minAgeGenerations}`;
  }
  return null;
}

/**
 * spec §3.2 `criar(p1, p2, rng)`. Consume exactamente
 * `herencia.tiradas_por_cria` (280) tiradas, mute o no. No modifica los
 * padres: devuelve copias con el contador de crías incrementado.
 * Simétrica: breed(x, y) y breed(y, x) dan la misma cría.
 */
export function breed(p1: Creature, p2: Creature, rng: Rng, config: GeneticsConfig, opts: BreedOptions): BreedResult {
  const blocker = breedingBlocker(p1, p2, config, opts.birth);
  if (blocker !== null) throw new BreedingError(blocker); // sin consumir tiradas

  // (A, B) ordenados por id con comparación de code units (no localeCompare)
  const [A, B] = p1.id < p2.id ? [p1, p2] : [p2, p1];
  const wd = config.inheritance.weightsD;
  const wr = config.inheritance.weightsR;
  const wD = [wd.D, wd.R1, wd.R2, wd.D, wd.R1, wd.R2];
  const wR = [wr.D, wr.R1, wr.R2, wr.D, wr.R1, wr.R2];

  const genome = {} as Record<LocusId, Locus>;
  const trace: LocusTrace[] = [];
  const mutations: MutationEvent[] = [];

  for (const L of LOCUS_IDS) {
    const la = A.genome[L];
    const lb = B.genome[L];
    const S: Gene[] = [la.D, la.R1, la.R2, lb.D, lb.R1, lb.R2];

    const muta = rng.next() < config.mutation.probPerLocus; // t1
    const iD = rng.weightedIndex(wD); // t2 (se consume aunque mute)
    const w1 = wR.slice();
    if (!muta) w1[iD] = 0; // ex = muta ? {} : {iD}
    const i1 = rng.weightedIndex(w1); // t3
    const w2 = w1.slice();
    w2[i1] = 0;
    const i2 = rng.weightedIndex(w2); // t4
    const nDer = sampleNormals(rng, 9, config); // t5–t40: gen(D,R1,R2) × valor(pot,vel,res)
    const uh = rng.next(); // t41
    const up = rng.next(); // t42
    const nAn = sampleNormals(rng, 3, config); // t43–t54
    const nFo = sampleNormals(rng, 4, config); // t55–t70

    const D = muta
      ? mutateGene(la.D, lb.D, uh, up, nAn, nFo, config) // spec §4
      : copyWithDrift(S[iD] as Gene, nDer.slice(0, 3), config); // spec §6
    const R1 = copyWithDrift(S[i1] as Gene, nDer.slice(3, 6), config);
    const R2 = copyWithDrift(S[i2] as Gene, nDer.slice(6, 9), config);
    genome[L] = { D, R1, R2 };

    trace.push({ locus: L, mutated: muta, dSlot: iD, r1Slot: i1, r2Slot: i2 });
    if (muta) {
      const key = geneKey(D);
      mutations.push({
        locus: L,
        key,
        geneId: D.id,
        family: D.family,
        matchesCatalog: config.catalogByKey.has(key),
        parentDKeys: [geneKey(la.D), geneKey(lb.D)],
      });
    }
  }

  const child: Creature = {
    id: opts.id,
    genome,
    family: creatureFamily(genome), // spec §7
    generation: Math.max(A.generation, B.generation) + 1,
    parents: [A.id, B.id],
    offspringCount: 0,
    birth: opts.birth,
  };
  return {
    child,
    parent1: { ...p1, offspringCount: p1.offspringCount + 1 },
    parent2: { ...p2, offspringCount: p2.offspringCount + 1 },
    trace,
    mutations,
  };
}
