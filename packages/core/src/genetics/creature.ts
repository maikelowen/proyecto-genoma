/** Criatura: familia (spec §7), salvajes (spec §2.2) y consultas. */
import type { Rng } from "../rng.ts";
import { geneKey, makeGene } from "./gene.ts";
import { anchorBounds, distribute, mean3, roundTo, sampleNormals, statsFrom, statsToArray, statSum, valueBoundsOf } from "./math.ts";
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
 * spec §7 [v0.2] — familia de la criatura: puntuación por familia sobre
 * los 4 D (gen base `peso_gen_base`, gen híbrido `peso_gen_hibrido`).
 * Gana la mayor; empate ⇒ gana una híbrida si hay alguna entre las
 * empatadas; si siguen empatadas, la del primer locus (cabeza > … > cola).
 */
export function creatureFamily(genome: Genome, config: GeneticsConfig): FamilyId {
  const score = new Map<FamilyId, number>();
  for (const L of LOCUS_IDS) {
    const f = genome[L].D.family;
    const w = config.hybridById.has(f) ? config.familyWeights.hybrid : config.familyWeights.base;
    score.set(f, (score.get(f) ?? 0) + w);
  }
  let best = -Infinity;
  for (const L of LOCUS_IDS) best = Math.max(best, score.get(genome[L].D.family) as number);
  const tied = LOCUS_IDS.map((L) => genome[L].D.family).filter((f) => score.get(f) === best);
  const hybrids = tied.filter((f) => config.hybridById.has(f));
  const pool = hybrids.length > 0 ? hybrids : tied; // en orden de loci
  return pool[0] as FamilyId;
}

/**
 * spec §2.2 [v0.2] — calidad de un gen salvaje con 2 uniformes:
 * triangular r2(base + base·margen·(uq1 + uq2 − 1)) ∈ [min, max];
 * "uniforme" (solo barrido §11) usa r2(base + base·margen·(2·uq1 − 1)) e
 * ignora uq2, que se consume igualmente (ver notas v0.2).
 */
export function wildQuality(uq1: number, uq2: number, config: GeneticsConfig): number {
  const { base, margin } = config.quality;
  const t = config.quality.wildDistribution === "triangular" ? uq1 + uq2 - 1 : 2 * uq1 - 1;
  return roundTo(base + base * margin * t, config);
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
 * spec §2.2 `salvaje(rng, familiaForzada?, puro?)` [v0.2]. Consume
 * exactamente `salvaje.tiradas_por_criatura` (205) tiradas, siempre en el
 * mismo orden: `t`, y por locus × slot `uc, uf, uv, uq1, uq2, 3×N`.
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
      const uq1 = rng.next(); // [v0.2] calidad
      const uq2 = rng.next();
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
      const Q = wildQuality(uq1, uq2, config);
      // ancla del catálogo (calidad base) escalada a Q y repartida (spec §1.5)
      const [alo, ahi] = anchorBounds(config);
      const anchor = distribute(
        statsToArray(type.anchor).map((a) => (a * Q) / config.quality.base),
        alo,
        ahi,
        Q,
        config,
      );
      // valores: ruido de suma cero y reparto a Q
      const mn = mean3(n);
      const [vlo, vhi] = valueBoundsOf(anchor, config);
      const values = distribute(
        anchor.map((a, k) => a + w.sigma * ((n[k] as number) - mn)),
        vlo,
        vhi,
        Q,
        config,
      );
      slots[slot] = makeGene(type, Q, statsFrom(anchor), statsFrom(values), "base");
    }
    genome[L] = Object.freeze(slots);
  }
  return {
    id: opts.id,
    genome,
    family: creatureFamily(genome, config),
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

/** spec §1.3 [v0.2] — calidad de la criatura = media de la calidad de los 4 D. */
export function creatureQuality(c: Creature): number {
  let s = 0;
  for (const L of LOCUS_IDS) s += c.genome[L].D.quality;
  return s / LOCUS_IDS.length;
}

/** spec §1.3 [v0.2] — porcentaje mostrado: (calidad − min) / (max − min) × 100. */
export function qualityPercent(quality: number, config: GeneticsConfig): number {
  const { min, max } = config.quality;
  return ((quality - min) / (max - min)) * 100;
}

/**
 * Invariantes por gen de la spec §10.2 [v0.2]. Devuelve la lista de
 * violaciones (vacía si todo cumple). Tolerancia de sumas por defecto:
 * `criterios_sim.invariantes.tolerancia_suma` (QA-05).
 */
export function checkInvariants(c: Creature, config: GeneticsConfig, sumTolerance = config.invariantTolerance): string[] {
  const v = config.values;
  const q = config.quality;
  const errs: string[] = [];
  const eps = 1e-9;
  for (const L of LOCUS_IDS) {
    for (const slot of ["D", "R1", "R2"] as const) {
      const g = c.genome[L][slot];
      const where = `${c.id}.${L}.${slot}`;
      if (g.locus !== L) errs.push(`${where}: locus ${g.locus}`);
      if (!(g.quality >= q.min - eps && g.quality <= q.max + eps)) errs.push(`${where}: calidad=${g.quality}`);
      if (!(Math.abs(statSum(g.anchor) - g.quality) <= sumTolerance)) errs.push(`${where}: Σancla=${statSum(g.anchor)} ≠ ${g.quality}`);
      if (!(Math.abs(statSum(g.values) - g.quality) <= sumTolerance)) errs.push(`${where}: Σvalores=${statSum(g.values)} ≠ ${g.quality}`);
      for (const k of STAT_IDS) {
        const a = g.anchor[k];
        const x = g.values[k];
        if (!(a >= v.anchorMin - eps && a <= v.anchorMax + eps)) errs.push(`${where}: ancla.${k}=${a}`);
        if (!(x >= Math.max(v.absMin, a - v.maxDeviation) - eps && x <= Math.min(v.absMax, a + v.maxDeviation) + eps)) {
          errs.push(`${where}: valor.${k}=${x} (ancla ${a})`);
        }
      }
    }
  }
  return errs;
}
