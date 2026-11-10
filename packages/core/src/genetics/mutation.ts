/** spec §4 [v0.2] — mutación del gen D de la cría. Sin tiradas propias. */
import { pairKey } from "./config.ts";
import { geneKey, makeGene } from "./gene.ts";
import { anchorBounds, clamp, distribute, mean3, roundTo, signatureOf, statsFrom, statsToArray, valueBoundsOf } from "./math.ts";
import type { FamilyId, Gene, GeneticsConfig, Shape } from "./types.ts";

/**
 * spec §4.1 — familia del gen mutado a partir de las familias de los D
 * de los padres (fA = padre A, el de id menor).
 */
export function mutationFamily(fA: FamilyId, fB: FamilyId, uh: number, up: number, config: GeneticsConfig): FamilyId {
  const mc = config.mutation;
  const choose = (): FamilyId => (up < mc.probPickParentA ? fA : fB); // elegir(fA, fB)
  if (fA === fB) return fA;
  const hA = config.hybridById.get(fA);
  const hB = config.hybridById.get(fB);
  if (!hA && !hB) {
    // ambas base: híbrida si el par está en la tabla (spec §5)
    const h = config.hybridByPair.get(pairKey(fA, fB));
    if (h) return uh < mc.probNewHybrid ? h.id : choose();
    return choose();
  }
  if (hA && hB) return choose(); // ambas híbridas distintas: sin segundo orden
  const H = (hA ?? hB) as NonNullable<typeof hA>;
  const Z = hA ? fB : fA;
  if (H.components.includes(Z)) return uh < mc.probHybridAffinity ? H.id : Z; // retrocruce [v0.2: 0,5]
  return choose();
}

/** spec §4.2 [v0.2] — calidad mutada = r2(media de las calidades de los D). */
export function mutationQuality(gA: Gene, gB: Gene, config: GeneticsConfig): number {
  return roundTo((gA.quality + gB.quality) / 2, config);
}

/**
 * spec §4.3 — ancla mutada: media de padres + ruido de suma 0, repartida
 * a la calidad mutada dentro de [ancla_min, ancla_max].
 */
export function mutationAnchor(gA: Gene, gB: Gene, nAn: readonly number[], config: GeneticsConfig): number[] {
  const Q = mutationQuality(gA, gB, config);
  const sigma = config.mutation.sigmaAnchor;
  const mn = mean3(nAn);
  const a = statsToArray(gA.anchor);
  const b = statsToArray(gB.anchor);
  const x = a.map((ak, k) => (ak + (b[k] as number)) / 2 + sigma * ((nAn[k] as number) - mn));
  const [lo, hi] = anchorBounds(config);
  return distribute(x, lo, hi, Q, config);
}

/** Nivel del respaldo de forma usado (spec §4.5): 0 = f0, 1 = N1, 2 = N2, 3 = N3. */
export type ShapeFallbackLevel = 0 | 1 | 2 | 3;

/** Rejilla completa ordenada por firma (para N3); se calcula una vez por nº de niveles. */
const gridCache = new Map<number, number[][]>();
function fullGrid(levels: number): number[][] {
  let g = gridCache.get(levels);
  if (!g) {
    g = [];
    const steps = levels - 1;
    for (let a = 0; a < levels; a++)
      for (let b = 0; b < levels; b++)
        for (let c = 0; c < levels; c++) for (let d = 0; d < levels; d++) g.push([a / steps, b / steps, c / steps, d / steps]);
    gridCache.set(levels, g); // orden lexicográfico de dígitos = firma ascendente
  }
  return g;
}

/**
 * spec §4.5 [v0.2] (D-007) — forma del gen mutado. La clave resultante
 * nunca está en `blocked` (claves de los 6 genes de los padres). Respaldo
 * determinista N0 → N1 → N2 → N3, sin tiradas extra.
 */
export function mutationShape(
  gA: Gene,
  gB: Gene,
  family: FamilyId,
  blocked: ReadonlySet<string>,
  nFo: readonly number[],
  config: GeneticsConfig,
): { shape: Shape; level: ShapeFallbackLevel } {
  const steps = config.shape.levels - 1;
  const step = config.shape.gridStep;
  const sigma = config.mutation.sigmaShape;
  const locus = gA.locus;
  const f0 = gA.shape.map((a, i) => Math.round(clamp((a + (gB.shape[i] as number)) / 2 + sigma * (nFo[i] as number), 0, 1) * steps) / steps);
  const free = (s: readonly number[]): boolean => !blocked.has(geneKey({ family, locus, signature: signatureOf(s, config) }));
  const done = (s: readonly number[], level: ShapeFallbackLevel) => ({ shape: Object.freeze(s.slice()) as unknown as Shape, level });

  if (free(f0)) return done(f0, 0); // N0
  const order = [0, 1, 2, 3].sort((i, j) => {
    const d = Math.abs(nFo[j] as number) - Math.abs(nFo[i] as number);
    return d !== 0 ? d : i - j; // |nFo| desc, empate: índice menor
  });
  const dir = nFo.map((x) => (x >= 0 ? 1 : -1));
  for (const [level, sign] of [
    [1, 1],
    [2, -1],
  ] as const) {
    for (const i of order) {
      const v = (f0[i] as number) + sign * step * (dir[i] as number);
      if (v < 0 || v > 1) continue; // se salta si sale de [0,1]
      const cand = f0.slice();
      cand[i] = Math.round(v * steps) / steps;
      if (free(cand)) return done(cand, level);
    }
  }
  // N3: rejilla entera por (distancia L1 en pasos a f0, firma ascendente)
  const dist = (s: readonly number[]): number => s.reduce((t, x, i) => t + Math.abs(Math.round(x * steps) - Math.round((f0[i] as number) * steps)), 0);
  const ranked = fullGrid(config.shape.levels)
    .map((s, idx) => ({ s, d: dist(s), idx }))
    .sort((p, q) => (p.d !== q.d ? p.d - q.d : p.idx - q.idx));
  for (const { s } of ranked) if (free(s)) return done(s, 3);
  throw new Error("mutationShape: rejilla agotada (no debería ocurrir)");
}

export interface MutationOutcome {
  readonly gene: Gene;
  readonly fallbackLevel: ShapeFallbackLevel;
}

/**
 * spec §4 `mutar(gA, gB, S, uh, up, nAn, nFo)`: gA/gB = genes D de los
 * padres A y B; `parentGenes` = los 6 genes S del locus. Devuelve el nuevo
 * gen D (origen "mutacion") y el nivel de respaldo de forma usado.
 */
export function mutateGene(
  gA: Gene,
  gB: Gene,
  parentGenes: readonly Gene[],
  uh: number,
  up: number,
  nAn: readonly number[],
  nFo: readonly number[],
  config: GeneticsConfig,
): MutationOutcome {
  const family = mutationFamily(gA.family, gB.family, uh, up, config); // §4.1
  const Q = mutationQuality(gA, gB, config); // §4.2
  const m = mutationAnchor(gA, gB, nAn, config); // §4.3

  // §4.4 — valores: ancla nueva + media de las desviaciones de los padres, repartidos a Q
  const aA = statsToArray(gA.anchor);
  const aB = statsToArray(gB.anchor);
  const vA = statsToArray(gA.values);
  const vB = statsToArray(gB.values);
  const target = m.map((mk, k) => mk + ((vA[k] as number) - (aA[k] as number) + ((vB[k] as number) - (aB[k] as number))) / 2);
  const [lo, hi] = valueBoundsOf(m, config);
  const values = distribute(target, lo, hi, Q, config);

  // §4.5 — forma con bloqueo de las 6 claves de los padres
  const blocked = new Set(parentGenes.map(geneKey));
  const { shape, level } = mutationShape(gA, gB, family, blocked, nFo, config);
  const signature = signatureOf(shape, config);
  const locus = gA.locus;

  // §4.6 — identidad: si la clave es del catálogo, toma id y movimiento base
  const base = config.catalogByKey.get(geneKey({ family, locus, signature }));
  const id = base ? base.id : `${family}.${locus}.m${signature}`;
  const gene = makeGene(
    { id, family, locus, shape, signature, move: base ? base.move : `mov:prov:${id}` },
    Q,
    statsFrom(m),
    statsFrom(values),
    "mutacion",
  );
  return { gene, fallbackLevel: level };
}
