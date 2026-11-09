/** Criatura: familia (spec §7), salvajes (spec §2.2) y consultas. */
import type { Rng } from "../rng.ts";
import { geneFromType, geneKey, valueBounds } from "./gene.ts";
import { clamp, roundTo, sampleNormals, statsFrom, statSum } from "./math.ts";
import {
  LOCUS_IDS,
  STAT_IDS,
  type Creature,
  type FamilyId,
  type Gene,
  type GeneticsConfig,
  type Genome,
  type Locus,
  type LocusId,
  type Stats,
} from "./types.ts";

/**
 * spec §7 — familia de la criatura: la más frecuente entre los 4 D
 * (híbrida = su propia familia); empate ⇒ la del primer locus en orden
 * cabeza > cuerpo > extremidades > cola entre las empatadas. Sin tiradas.
 */
export function creatureFamily(genome: Genome): FamilyId {
  const counts = new Map<FamilyId, number>();
  for (const L of LOCUS_IDS) {
    const f = genome[L].D.family;
    counts.set(f, (counts.get(f) ?? 0) + 1);
  }
  let best = 0;
  for (const c of counts.values()) best = Math.max(best, c);
  for (const L of LOCUS_IDS) {
    const f = genome[L].D.family;
    if (counts.get(f) === best) return f;
  }
  throw new Error("creatureFamily: genoma vacío");
}

export interface WildOptions {
  /** Id único de la criatura (lo asigna quien llama). */
  readonly id: string;
  /** Tick de nacimiento; por defecto 0. */
  readonly birth?: number;
  /** spec §2.2 `familiaForzada`: fuerza la familia principal (debe ser base). */
  readonly family?: FamilyId;
  /** spec §2.2 `puro`: todos los genes de la familia principal (solo simulador, E4). */
  readonly pure?: boolean;
}

/**
 * spec §2.2 `salvaje(rng, familiaForzada?, puro?)`. Consume exactamente
 * `salvaje.tiradas_por_criatura` (181) tiradas, siempre en el mismo orden.
 */
export function createWildCreature(rng: Rng, config: GeneticsConfig, opts: WildOptions): Creature {
  const base = config.baseFamilies;
  if (opts.family !== undefined && !base.includes(opts.family)) {
    throw new RangeError(`createWildCreature: '${opts.family}' no es familia base`);
  }
  const w = config.wild;
  const t = rng.next(); // 1 tirada, siempre se consume
  const main = opts.family ?? (base[Math.floor(t * base.length)] as FamilyId);
  const others = base.filter((f) => f !== main);

  const genome = {} as Record<LocusId, Locus>;
  for (const L of LOCUS_IDS) {
    const slots = {} as Record<"D" | "R1" | "R2", Gene>;
    for (const slot of ["D", "R1", "R2"] as const) {
      const uc = rng.next(); // 3 tiradas
      const uf = rng.next();
      const uv = rng.next();
      const n = sampleNormals(rng, 3, config); // 12 tiradas
      const p = slot === "D" ? w.probDMain : w.probRMain;
      let fam: FamilyId;
      if (opts.pure === true) fam = main;
      else if (uc < p) fam = main;
      else if (slot === "D") fam = others[Math.floor(uf * others.length)] as FamilyId; // otra, uniforme
      else fam = base[Math.floor(uf * base.length)] as FamilyId; // cualquiera
      const variant = Math.floor(uv * w.variantsPerFamilyLocus) + 1;
      const type = config.catalogById.get(`${fam}.${L}.${variant}`);
      if (!type) throw new Error(`createWildCreature: falta ${fam}.${L}.${variant} en catálogo`);
      const values = STAT_IDS.map((k, i) => {
        const a = type.anchor[k];
        const [lo, hi] = valueBounds(a, config);
        return roundTo(clamp(a + w.sigma * (n[i] as number), lo, hi), config);
      });
      slots[slot] = geneFromType(type, statsFrom(values));
    }
    genome[L] = slots;
  }
  return {
    id: opts.id,
    genome,
    family: creatureFamily(genome),
    generation: 0,
    parents: null,
    offspringCount: 0,
    birth: opts.birth ?? 0,
  };
}

/** Atajo para simuladores: `count` salvajes con ids `${idPrefix}${i}`. */
export function createWildPopulation(
  rng: Rng,
  config: GeneticsConfig,
  count: number,
  opts: { readonly idPrefix?: string; readonly birth?: number } = {},
): Creature[] {
  const out: Creature[] = [];
  const prefix = opts.idPrefix ?? "w";
  for (let i = 0; i < count; i++) out.push(createWildCreature(rng, config, { id: `${prefix}${i}`, birth: opts.birth ?? 0 }));
  return out;
}

/** Los 4 genes D (expresados) en orden de loci. */
export function expressedGenes(c: Creature): Gene[] {
  return LOCUS_IDS.map((L) => c.genome[L].D);
}

/** Suma de `values` de los 4 D (p. ej. "velocidad total" de E3a). */
export function expressedStats(c: Creature): Stats {
  const acc = [0, 0, 0];
  for (const g of expressedGenes(c)) STAT_IDS.forEach((k, i) => (acc[i] = (acc[i] as number) + g.values[k]));
  return statsFrom(acc);
}

/** Claves de gen de un locus: { D, R1, R2 }. */
export function locusKeys(c: Creature, locus: LocusId): { D: string; R1: string; R2: string } {
  const l = c.genome[locus];
  return { D: geneKey(l.D), R1: geneKey(l.R1), R2: geneKey(l.R2) };
}

/** Todos los genes (12) en orden locus × (D, R1, R2). */
export function allGenes(c: Creature): Gene[] {
  return LOCUS_IDS.flatMap((L) => [c.genome[L].D, c.genome[L].R1, c.genome[L].R2]);
}

/**
 * Invariantes de la spec §10.2 sobre una criatura. Devuelve la lista de
 * violaciones (vacía si todo cumple). `sumTolerance` por defecto 0,01
 * (`criterios_sim.invariantes.tolerancia_suma_ancla`).
 */
export function checkInvariants(c: Creature, config: GeneticsConfig, sumTolerance = 0.01): string[] {
  const v = config.values;
  const errs: string[] = [];
  const eps = 1e-9;
  for (const L of LOCUS_IDS) {
    for (const slot of ["D", "R1", "R2"] as const) {
      const g = c.genome[L][slot];
      const where = `${c.id}.${L}.${slot}`;
      if (g.locus !== L) errs.push(`${where}: locus ${g.locus}`);
      if (Math.abs(statSum(g.anchor) - v.anchorSum) > sumTolerance) errs.push(`${where}: Σancla=${statSum(g.anchor)}`);
      for (const k of STAT_IDS) {
        const a = g.anchor[k];
        const x = g.values[k];
        if (a < v.anchorMin - eps || a > v.anchorMax + eps) errs.push(`${where}: ancla.${k}=${a}`);
        if (x < v.absMin - eps || x > v.absMax + eps) errs.push(`${where}: valor.${k}=${x}`);
        if (Math.abs(x - a) > v.maxDeviation + eps) errs.push(`${where}: |${k}−ancla|=${Math.abs(x - a)}`);
      }
    }
  }
  return errs;
}
