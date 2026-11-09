/** Utilidades compartidas por los tests de genética (no es un test). */
import rawConfig from "../../../config/genetica.v0.1.json" with { type: "json" };
import {
  createRng,
  creatureFamily,
  geneKey,
  parseGeneticsConfig,
  LOCUS_IDS,
  type Creature,
  type FamilyId,
  type Gene,
  type GeneticsConfig,
  type LocusId,
  type Rng,
  type Shape,
} from "../src/index.ts";

/** Config real; `patch` modifica una copia del JSON crudo antes de validar. */
export function loadConfig(patch?: (raw: any) => void): GeneticsConfig {
  const raw = structuredClone(rawConfig) as any;
  if (patch) patch(raw);
  return parseGeneticsConfig(raw);
}

export const CFG = loadConfig();

/** Cuántas tiradas consumió `fn` (comparando estado contra next() repetido). */
export function drawsConsumed(seed: string, fn: (rng: Rng) => void, maxDraws = 2000): number {
  const rng = createRng(seed);
  fn(rng);
  const target = JSON.stringify(rng.getState());
  const probe = createRng(seed);
  for (let k = 0; k <= maxDraws; k++) {
    if (JSON.stringify(probe.getState()) === target) return k;
    probe.next();
  }
  return -1;
}

/** Gen de catálogo con valores = ancla. */
export function catalogGene(id: string, config: GeneticsConfig = CFG): Gene {
  const t = config.catalogById.get(id);
  if (!t) throw new Error(`no existe ${id}`);
  return { ...t, values: t.anchor, origin: "base" };
}

/** Gen híbrido artificial (las híbridas no tienen catálogo). */
export function hybridGene(family: FamilyId, locus: LocusId, shape: Shape): Gene {
  const signature = shape.map((x) => String(Math.round(x * 4))).join("");
  const id = `${family}.${locus}.m${signature}`;
  const anchor = { potencia: 30, velocidad: 30, resistencia: 30 };
  return { id, family, locus, shape, signature, move: `mov:prov:${id}`, anchor, values: anchor, origin: "mutacion" };
}

/** Criatura con los 3 slots de cada locus dados por `slotGene(locus)`. */
export function makeCreature(
  id: string,
  slotGene: (locus: LocusId) => { D: Gene; R1: Gene; R2: Gene },
  extra: Partial<Pick<Creature, "generation" | "offspringCount" | "birth">> = {},
): Creature {
  const genome = Object.fromEntries(LOCUS_IDS.map((L) => [L, slotGene(L)])) as Creature["genome"];
  return {
    id,
    genome,
    family: creatureFamily(genome),
    generation: extra.generation ?? 0,
    parents: null,
    offspringCount: extra.offspringCount ?? 0,
    birth: extra.birth ?? 0,
  };
}

/** Criatura homocigota de variante 1 de `family` en todos los loci. */
export function pureCreature(id: string, family: FamilyId): Creature {
  return makeCreature(id, (L) => {
    const g = catalogGene(`${family}.${L}.1`);
    return { D: g, R1: g, R2: g };
  });
}

export function keysOf(c: Creature, L: LocusId): string[] {
  const l = c.genome[L];
  return [geneKey(l.D), geneKey(l.R1), geneKey(l.R2)];
}

/** Tolerancia de 5 errores estándar para una proporción. */
export function tol5(p: number, n: number): number {
  return 5 * Math.sqrt((p * (1 - p)) / n);
}
