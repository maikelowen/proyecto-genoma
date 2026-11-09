/**
 * spec §8 — Genedex: registro de identidades MUTADAS (las del catálogo
 * base no entran). Solo se guarda la primera aparición; las siguientes
 * son "redescubrimientos".
 *
 * Excepción consciente a la pureza: `recordMutations` modifica el Map que
 * recibe (registro global que crece; copiarlo en cada cría sería O(n²)).
 */
import type { BreedResult, MutationEvent } from "./breed.ts";

export interface GenedexEntry {
  readonly key: string;
  readonly id: string;
  /** Tick o nº de cría global de la primera aparición. */
  readonly firstSeen: number;
  readonly creatureId: string;
  readonly ownerId: string | null;
  readonly parents: readonly [string, string];
}

export type Genedex = Map<string, GenedexEntry>;

export function createGenedex(): Genedex {
  return new Map();
}

export interface RecordOutcome {
  readonly added: readonly GenedexEntry[];
  readonly rediscovered: readonly MutationEvent[];
  /** Mutaciones que cayeron en una clave del catálogo base. */
  readonly catalog: readonly MutationEvent[];
}

/** Registra las mutaciones de una cría en `dex` (lo MODIFICA). */
export function recordMutations(
  dex: Genedex,
  result: BreedResult,
  meta: { readonly firstSeen: number; readonly ownerId?: string | null },
): RecordOutcome {
  const added: GenedexEntry[] = [];
  const rediscovered: MutationEvent[] = [];
  const catalog: MutationEvent[] = [];
  const parents = result.child.parents ?? ["", ""];
  for (const m of result.mutations) {
    if (m.matchesCatalog) catalog.push(m);
    else if (dex.has(m.key)) rediscovered.push(m);
    else {
      const entry: GenedexEntry = {
        key: m.key,
        id: m.geneId,
        firstSeen: meta.firstSeen,
        creatureId: result.child.id,
        ownerId: meta.ownerId ?? null,
        parents: [parents[0], parents[1]],
      };
      dex.set(m.key, entry);
      added.push(entry);
    }
  }
  return { added, rediscovered, catalog };
}
