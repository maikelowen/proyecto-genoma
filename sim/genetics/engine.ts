/**
 * Motor de población y métricas por generación.
 *
 * Modelo (documentado también en el informe):
 * - Generaciones DISCRETAS (spec §10.1): en la generación g se crían
 *   `children` crías (nacimiento = g) a partir de la población g−1 y, al
 *   terminar, las crías sustituyen a TODA la población anterior. Así N es
 *   fijo y la edad mínima (1 generación) siempre se cumple.
 * - Si hay más crías que N (E3a/E3b: 250 → 100), se quedan las N de mayor
 *   velocidad total (empate: orden de nacimiento) o N al azar (control).
 * - E2: tras el reemplazo, una fracción al azar se sustituye por salvajes
 *   nuevos (nacimiento = g, pueden criar en g+1).
 * - Límite de crías (5) y edad: los aplica el núcleo; las estrategias
 *   proponen parejas y se salta las bloqueadas (ver strategies.ts).
 *
 * Flujos RNG (todos derivados de la semilla, nada de Math.random):
 *   `${seed}|cria` → solo breed() (consumo fijo de 280 tiradas/cría);
 *   `${seed}|sim`  → barajados y selección; `${seed}|salvaje` → salvajes.
 * Separarlos mantiene los barridos pareados: con la misma semilla, cambiar
 * prob_por_locus no desalinea los sorteos de la estrategia.
 */
import { createHash } from "node:crypto";
import {
  breed,
  breedingBlocker,
  checkInvariants,
  createGenedex,
  createRng,
  createWildCreature,
  createWildPopulation,
  expressedStats,
  fromState,
  geneKey,
  LOCUS_IDS,
  recordMutations,
  STAT_IDS,
  type BreedResult,
  type Creature,
  type Gene,
  type GeneticsConfig,
  type Genome,
  type Locus,
  type LocusId,
  type Rng,
} from "../../packages/core/src/index.ts";
import type { Strategy } from "./strategies.ts";

export type Row = Record<string, number | string>;

export interface PopRunOptions {
  readonly scenario: string;
  readonly variantId: string;
  readonly cfg: GeneticsConfig;
  readonly seed: string;
  readonly strategy: Strategy;
  readonly N: number;
  readonly gens: number;
  /** Crías por pareja. */
  readonly cpp: number;
  /** Crías a producir por generación. */
  readonly children: number;
  readonly init: "wild" | "clones" | "clones_homo";
  /** Fracción reemplazada por salvajes nuevos cada generación (E2). */
  readonly wildFrac: number;
  /** Supervivencia si children > N. */
  readonly select: "top_speed" | "random";
  /** Si se da, comprueba en cada cría que el mismo breed con esta otra config da la misma cría cuando ninguna muta (spec §10.2 determinismo). */
  readonly pairedCfg?: GeneticsConfig;
}

export interface PopRunResult {
  readonly rows: Row[];
  readonly finalHash: string;
  readonly violations: number;
  readonly violationSamples: string[];
  readonly fallbackPairs: number;
  readonly paired: { readonly compared: number; readonly identical: number };
}

interface Rec {
  readonly r: BreedResult;
  readonly pa: Creature;
  readonly pb: Creature;
}

export function familyList(cfg: GeneticsConfig): string[] {
  return [...cfg.baseFamilies, ...cfg.hybrids.map((h) => h.id)];
}

/** Normal Irwin–Hall con los parámetros de la config (como el núcleo). */
function normal(rng: Rng, cfg: GeneticsConfig): number {
  let s = 0;
  for (let i = 0; i < cfg.normal.uniforms; i++) s += rng.next();
  return (s - cfg.normal.center) * cfg.normal.factor;
}

/**
 * E3a: N clones del mismo genoma salvaje; mismos tipos de gen y anclas,
 * valores re-muestreados con el ruido salvaje (σ = salvaje.sigma_valores).
 */
export function createClones(rng: Rng, cfg: GeneticsConfig, n: number, homozygous = false): Creature[] {
  const tpl = createWildCreature(rng, cfg, { id: "tpl" });
  const f = 10 ** cfg.decimals;
  const v = cfg.values;
  const out: Creature[] = [];
  for (let i = 0; i < n; i++) {
    const genome = {} as Record<LocusId, Locus>;
    for (const L of LOCUS_IDS) {
      const slot = (g: Gene): Gene => {
        const vals = STAT_IDS.map((k) => {
          const a = g.anchor[k];
          const x = a + cfg.wild.sigma * normal(rng, cfg);
          return Math.round(Math.min(Math.max(x, Math.max(v.absMin, a - v.maxDeviation)), Math.min(v.absMax, a + v.maxDeviation)) * f) / f;
        });
        return { ...g, values: { potencia: vals[0] as number, velocidad: vals[1] as number, resistencia: vals[2] as number } };
      };
      const l = tpl.genome[L];
      // homocigoto (diagnóstico E3a_homo): D, R1 y R2 son el tipo del D de la plantilla
      genome[L] = homozygous ? { D: slot(l.D), R1: slot(l.D), R2: slot(l.D) } : { D: slot(l.D), R1: slot(l.R1), R2: slot(l.R2) };
    }
    out.push({ ...tpl, id: `c${i}`, genome: genome as Genome });
  }
  return out;
}

function entropy(counts: Map<string, number>, total: number): number {
  let h = 0;
  for (const c of counts.values()) {
    const p = c / total;
    h -= p * Math.log2(p);
  }
  return h;
}

function inc(m: Map<string, number>, k: string): void {
  m.set(k, (m.get(k) ?? 0) + 1);
}

/** Métricas de la población (diversidad, familias, valores). */
export function popMetrics(pop: readonly Creature[], cfg: GeneticsConfig, fams: readonly string[]): Row {
  const row: Row = { n_pop: pop.length };
  for (const L of LOCUS_IDS) {
    const all = new Map<string, number>();
    const d = new Map<string, number>();
    for (const c of pop) {
      const l = c.genome[L];
      const kd = geneKey(l.D);
      inc(d, kd);
      inc(all, kd);
      inc(all, geneKey(l.R1));
      inc(all, geneKey(l.R2));
    }
    let maxD = 0;
    for (const x of d.values()) maxD = Math.max(maxD, x);
    row[`dist_todos_${L}`] = all.size;
    row[`dist_D_${L}`] = d.size;
    row[`H_todos_${L}`] = entropy(all, pop.length * 3);
    row[`H_D_${L}`] = entropy(d, pop.length);
    row[`maxfrec_D_${L}`] = maxD / pop.length;
  }
  const famCount = new Map<string, number>();
  let hybD = 0;
  let withHyb = 0;
  let mutatedD = 0;
  const sums = [0, 0, 0];
  let devVel = 0;
  for (const c of pop) {
    inc(famCount, c.family);
    let any = false;
    for (const L of LOCUS_IDS) {
      const l = c.genome[L];
      if (cfg.hybridById.has(l.D.family)) hybD++;
      if (l.D.origin === "mutacion") mutatedD++;
      if (cfg.hybridById.has(l.D.family) || cfg.hybridById.has(l.R1.family) || cfg.hybridById.has(l.R2.family)) any = true;
      devVel += l.D.values.velocidad - l.D.anchor.velocidad;
    }
    if (any) withHyb++;
    const s = expressedStats(c);
    sums[0] = (sums[0] as number) + s.potencia;
    sums[1] = (sums[1] as number) + s.velocidad;
    sums[2] = (sums[2] as number) + s.resistencia;
  }
  for (const f of fams) row[`fam_${f}`] = (famCount.get(f) ?? 0) / pop.length;
  row["frac_D_hibrido"] = hybD / (pop.length * 4);
  row["frac_criaturas_con_gen_hibrido"] = withHyb / pop.length;
  row["frac_D_mutado"] = mutatedD / (pop.length * 4);
  row["pot_total_media"] = (sums[0] as number) / pop.length;
  row["vel_total_media"] = (sums[1] as number) / pop.length;
  row["res_total_media"] = (sums[2] as number) / pop.length;
  row["desv_vel_D_media"] = devVel / (pop.length * 4);
  return row;
}

interface DexState {
  readonly dex: ReturnType<typeof createGenedex>;
  readonly hybridsSeen: Set<string>;
  counter: number;
}

/** Métricas de las crías de una generación (sorpresa, mutaciones, Genedex). */
function breedMetrics(recs: readonly Rec[], cfg: GeneticsConfig, ds: DexState): Row {
  let surprise = 0;
  let surpriseNoMut = 0;
  const byLocus = [0, 0, 0, 0];
  let muts = 0;
  let withMut = 0;
  let coincR = 0;
  let catalog = 0;
  let added = 0;
  let rediscovered = 0;
  for (const { r, pa, pb } of recs) {
    let any = false;
    let anyNoMut = false;
    LOCUS_IDS.forEach((L, li) => {
      const k = geneKey(r.child.genome[L].D);
      if (k !== geneKey(pa.genome[L].D) && k !== geneKey(pb.genome[L].D)) {
        any = true;
        byLocus[li] = (byLocus[li] as number) + 1;
        if (!(r.trace[li] as { mutated: boolean }).mutated) anyNoMut = true;
      }
    });
    if (any) surprise++;
    if (anyNoMut) surpriseNoMut++;
    if (r.mutations.length > 0) withMut++;
    for (const m of r.mutations) {
      muts++;
      if (m.matchesCatalog) catalog++;
      const la = pa.genome[m.locus];
      const lb = pb.genome[m.locus];
      if ([la.R1, la.R2, lb.R1, lb.R2].some((g) => geneKey(g) === m.key)) coincR++;
    }
    const out = recordMutations(ds.dex, r, { firstSeen: ds.counter++ });
    added += out.added.length;
    rediscovered += out.rediscovered.length;
    for (const e of out.added) {
      const fam = e.key.split("|")[0] as string;
      if (cfg.hybridById.has(fam)) ds.hybridsSeen.add(fam);
    }
  }
  const n = recs.length;
  const row: Row = {
    n_crias: n,
    sorpresa: n ? surprise / n : 0,
    sorpresa_sin_mutacion: n ? surpriseNoMut / n : 0,
  };
  LOCUS_IDS.forEach((L, li) => (row[`sorpresa_${L}`] = n ? (byLocus[li] as number) / n : 0));
  Object.assign(row, {
    mutaciones: muts,
    crias_con_mutacion: withMut,
    mut_por_1000_crias: n ? (1000 * muts) / n : 0,
    frac_crias_mutadas: n ? withMut / n : 0,
    mut_coincide_R_padre: coincR,
    frac_mut_coincide_R_padre: muts ? coincR / muts : 0,
    mut_en_catalogo: catalog,
    genedex_nuevas: added,
    genedex_redescubiertas: rediscovered,
    genedex_total: ds.dex.size,
    hibridas_distintas_vistas: ds.hybridsSeen.size,
  });
  return row;
}

export function populationHash(pop: readonly Creature[]): string {
  return createHash("sha256").update(JSON.stringify(pop)).digest("hex");
}

/** Ejecuta un escenario de población completo y devuelve una fila por generación (gen 0 incluida). */
export function runPopulation(o: PopRunOptions): PopRunResult {
  const { cfg } = o;
  const fams = familyList(cfg);
  const breedRng = createRng(`${o.seed}|cria`);
  const simRng = createRng(`${o.seed}|sim`);
  const wildRng = createRng(`${o.seed}|salvaje`);
  const ds: DexState = { dex: createGenedex(), hybridsSeen: new Set(), counter: 0 };
  const rows: Row[] = [];
  let violations = 0;
  const violationSamples: string[] = [];
  let fallbackPairs = 0;
  let pairedCompared = 0;
  let pairedIdentical = 0;
  const check = (c: Creature): void => {
    const e = checkInvariants(c, cfg);
    if (e.length) {
      violations += e.length;
      if (violationSamples.length < 5) violationSamples.push(`${o.scenario} ${o.variantId} ${o.seed}: ${e[0]}`);
    }
  };

  let pop: Creature[] = o.init === "wild" ? createWildPopulation(wildRng, cfg, o.N, { idPrefix: "w0_" }) : createClones(wildRng, cfg, o.N, o.init === "clones_homo");
  pop.forEach(check);
  const base = (gen: number): Row => ({ escenario: o.scenario, config: o.variantId, semilla: o.seed, estrategia: o.strategy.id, gen });
  rows.push({ ...base(0), ...breedMetrics([], cfg, ds), ...popMetrics(pop, cfg, fams), violaciones: violations });

  for (let g = 1; g <= o.gens; g++) {
    const recs: Rec[] = [];
    const children: Creature[] = [];
    const tryPair = (i: number, j: number): void => {
      for (let k = 0; k < o.cpp && children.length < o.children; k++) {
        const pa = pop[i] as Creature;
        const pb = pop[j] as Creature;
        if (breedingBlocker(pa, pb, cfg, g) !== null) return;
        const state = o.pairedCfg ? breedRng.getState() : null;
        const r = breed(pa, pb, breedRng, cfg, { id: `g${g}_${children.length}`, birth: g });
        if (o.pairedCfg && state) {
          const r2 = breed(pa, pb, fromState(state), o.pairedCfg, { id: `g${g}_${children.length}`, birth: g });
          if (r.mutations.length === 0 && r2.mutations.length === 0) {
            pairedCompared++;
            if (JSON.stringify(r.child) === JSON.stringify(r2.child)) pairedIdentical++;
          }
        }
        pop[i] = r.parent1;
        pop[j] = r.parent2;
        children.push(r.child);
        recs.push({ r, pa, pb });
      }
    };
    for (const [i, j] of o.strategy.propose(pop, { cfg, simRng })) {
      if (children.length >= o.children) break;
      tryPair(i, j);
    }
    // Relleno: parejas al azar entre las elegibles (estrategia agotada).
    while (children.length < o.children) {
      const elig = pop.map((_, i) => i).filter((i) => (pop[i] as Creature).offspringCount < cfg.limits.maxOffspring);
      if (elig.length < 2) throw new Error(`${o.scenario} gen ${g}: no quedan parejas elegibles (${children.length}/${o.children} crías)`);
      const order = simRng.shuffle(elig);
      const before = children.length;
      for (let p = 0; p + 1 < order.length && children.length < o.children; p += 2) {
        fallbackPairs++;
        tryPair(order[p] as number, order[p + 1] as number);
      }
      if (children.length === before) throw new Error(`${o.scenario} gen ${g}: relleno sin progreso`);
    }
    children.forEach(check);

    // Supervivencia
    let next: Creature[];
    if (children.length <= o.N) next = children;
    else if (o.select === "top_speed") {
      const sp = children.map((c) => expressedStats(c).velocidad);
      next = children
        .map((_, i) => i)
        .sort((a, b) => (sp[b] as number) - (sp[a] as number) || a - b)
        .slice(0, o.N)
        .map((i) => children[i] as Creature);
    } else next = simRng.shuffle(children).slice(0, o.N);

    // E2: capturas
    if (o.wildFrac > 0) {
      const k = Math.round(o.N * o.wildFrac);
      const idx = simRng.shuffle(next.map((_, i) => i)).slice(0, k);
      idx.forEach((i, n) => {
        const w = createWildCreature(wildRng, cfg, { id: `w${g}_${n}`, birth: g });
        check(w);
        next[i] = w;
      });
    }
    pop = next;
    rows.push({ ...base(g), ...breedMetrics(recs, cfg, ds), ...popMetrics(pop, cfg, fams), violaciones: violations });
  }
  return {
    rows,
    finalHash: populationHash(pop),
    violations,
    violationSamples,
    fallbackPairs,
    paired: { compared: pairedCompared, identical: pairedIdentical },
  };
}


// ---------------------------------------------------------------------------
// E4: primera híbrida
// ---------------------------------------------------------------------------

export interface E4Options {
  readonly variantId: string;
  readonly cfg: GeneticsConfig;
  readonly seed: string;
  readonly trials: number;
  readonly famA: string;
  readonly famB: string;
  readonly target: string;
  readonly cpp: number;
  /** Ensayos (los primeros) en los que además se busca la primera CRIATURA de la familia objetivo. */
  readonly creatureTrials: number;
  /** Tope de crías por ensayo en la búsqueda de criatura (censura). */
  readonly creatureCap: number;
}

export interface E4Result {
  readonly rows: Row[];
  readonly geneCounts: number[];
  /** Crías hasta la primera criatura objetivo; Infinity = censurado (no apareció antes del tope). */
  readonly creatureCounts: number[];
  readonly violations: number;
}

/** E4: salvaje puro famA × puro famB; pareja nueva cada `cpp` crías; contar crías hasta el primer gen `target`. */
export function runE4(o: E4Options): E4Result {
  const rows: Row[] = [];
  const geneCounts: number[] = [];
  const creatureCounts: number[] = [];
  let violations = 0;
  const HARD_CAP = 100000;
  for (let t = 0; t < o.trials; t++) {
    const rng = createRng(`${o.seed}|E4|${t}`);
    const wantCreature = t < o.creatureTrials;
    let n = 0;
    let firstGene = -1;
    let firstCreature = -1;
    let pairNo = 0;
    while (firstGene < 0 || (wantCreature && firstCreature < 0 && n < o.creatureCap)) {
      if (n >= HARD_CAP) throw new Error(`E4: ${HARD_CAP} crías sin gen ${o.target}`);
      let a = createWildCreature(rng, o.cfg, { id: `a${pairNo}`, family: o.famA, pure: true });
      let b = createWildCreature(rng, o.cfg, { id: `b${pairNo}`, family: o.famB, pure: true });
      pairNo++;
      for (let k = 0; k < o.cpp; k++) {
        const r = breed(a, b, rng, o.cfg, { id: `x${n}`, birth: 1 });
        a = r.parent1;
        b = r.parent2;
        n++;
        violations += checkInvariants(r.child, o.cfg).length;
        if (firstGene < 0 && LOCUS_IDS.some((L) => r.child.genome[L].D.family === o.target)) firstGene = n;
        if (firstCreature < 0 && r.child.family === o.target) firstCreature = n;
      }
    }
    geneCounts.push(firstGene);
    if (wantCreature) creatureCounts.push(firstCreature < 0 ? Infinity : firstCreature);
    rows.push({
      escenario: "E4",
      config: o.variantId,
      semilla: o.seed,
      ensayo: t,
      crias_hasta_gen_objetivo: firstGene,
      crias_hasta_criatura_objetivo: wantCreature ? (firstCreature < 0 ? `>${o.creatureCap}` : firstCreature) : "",
    });
  }
  return { rows, geneCounts, creatureCounts, violations };
}
