/** spec §4 — mutación del gen D de la cría. Sin tiradas propias. */
import { pairKey } from "./config.ts";
import { geneKey, valueBounds } from "./gene.ts";
import { clamp, roundTo, signatureOf, statsFrom, statsToArray } from "./math.ts";
import { STAT_IDS, type FamilyId, type Gene, type GeneticsConfig, type Shape } from "./types.ts";

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
  if (H.components.includes(Z)) return uh < mc.probHybridAffinity ? H.id : Z; // retrocruce
  return choose();
}

/**
 * spec §4.2 — ancla mutada: media de padres + ruido de suma 0, recorte,
 * reparto del error de suma (≤ reintentos) y ajuste de redondeo.
 */
export function mutationAnchor(gA: Gene, gB: Gene, nAn: readonly number[], config: GeneticsConfig): number[] {
  const { anchorMin: lo, anchorMax: hi, anchorSum } = config.values;
  const { sigmaAnchor, sumRetries, sumEpsilon } = config.mutation;
  const n0 = nAn[0] as number;
  const n1 = nAn[1] as number;
  const n2 = nAn[2] as number;
  const meanN = (n0 + n1 + n2) / 3;
  const m = STAT_IDS.map((k, i) => clamp((gA.anchor[k] + gB.anchor[k]) / 2 + sigmaAnchor * ((nAn[i] as number) - meanN), lo, hi));
  const sum = (): number => (m[0] as number) + (m[1] as number) + (m[2] as number);

  for (let r = 0; r < sumRetries; r++) {
    const e = anchorSum - sum();
    if (Math.abs(e) < sumEpsilon) break;
    const free = [0, 1, 2].filter((k) => (e > 0 ? (m[k] as number) < hi : (m[k] as number) > lo));
    if (free.length === 0) break; // imposible si la config es válida (suma alcanzable)
    for (const k of free) m[k] = clamp((m[k] as number) + e / free.length, lo, hi);
  }

  for (let k = 0; k < 3; k++) m[k] = roundTo(m[k] as number, config);
  const adj = roundTo(anchorSum - sum(), config);
  if (adj !== 0) {
    // Ajuste de redondeo al primer valor estrictamente interior (spec §4.2)
    // que además siga dentro de [lo, hi] tras el ajuste (ver notas §4.2).
    const k = [0, 1, 2].find((i) => {
      const x = m[i] as number;
      return x > lo && x < hi && x + adj >= lo && x + adj <= hi;
    });
    if (k === undefined) throw new Error("mutationAnchor: no hay valor ajustable (config incoherente)");
    m[k] = roundTo((m[k] as number) + adj, config);
  }
  return m;
}

/**
 * spec §4.4 — forma del gen mutado. Si (familia, firma) coincide con la
 * de algún padre, se mueve un parámetro un paso para garantizar cambio.
 */
export function mutationShape(gA: Gene, gB: Gene, family: FamilyId, nFo: readonly number[], config: GeneticsConfig): Shape {
  const steps = config.shape.levels - 1;
  const step = config.shape.gridStep;
  const sigma = config.mutation.sigmaShape;
  const f = gA.shape.map((a, i) => Math.round(clamp((a + (gB.shape[i] as number)) / 2 + sigma * (nFo[i] as number), 0, 1) * steps) / steps);

  const clashes = (s: readonly number[]): boolean => {
    const sig = signatureOf(s as unknown as Shape, config);
    return (family === gA.family && sig === gA.signature) || (family === gB.family && sig === gB.signature);
  };
  if (clashes(f)) {
    const order = [0, 1, 2, 3].sort((i, j) => {
      const d = Math.abs(nFo[j] as number) - Math.abs(nFo[i] as number);
      return d !== 0 ? d : i - j; // |nFo| desc, empate: índice menor
    });
    let fixed = false;
    for (const i of order) {
      let delta = (nFo[i] as number) >= 0 ? step : -step;
      const fi = f[i] as number;
      if (fi + delta < 0 || fi + delta > 1) delta = -delta;
      const cand = f.slice();
      cand[i] = Math.round((fi + delta) * steps) / steps;
      if (!clashes(cand)) {
        f.splice(0, 4, ...cand);
        fixed = true;
        break;
      }
    }
    if (!fixed) throw new Error("mutationShape: sin forma alternativa (no debería ocurrir)");
  }
  return Object.freeze(f) as unknown as Shape;
}

/**
 * spec §4 `mutar(gA, gB, uh, up, nAn, nFo)`: gA/gB = genes D de los
 * padres A y B en este locus. Devuelve el nuevo gen D (origen "mutacion").
 */
export function mutateGene(
  gA: Gene,
  gB: Gene,
  uh: number,
  up: number,
  nAn: readonly number[],
  nFo: readonly number[],
  config: GeneticsConfig,
): Gene {
  const family = mutationFamily(gA.family, gB.family, uh, up, config); // §4.1
  const m = mutationAnchor(gA, gB, nAn, config); // §4.2

  // §4.3 — valores: ancla nueva + media de las desviaciones de los padres
  const devA = statsToArray(gA.values).map((v, i) => v - (statsToArray(gA.anchor)[i] as number));
  const devB = statsToArray(gB.values).map((v, i) => v - (statsToArray(gB.anchor)[i] as number));
  const values = m.map((mk, i) => {
    const [lo, hi] = valueBounds(mk, config);
    return roundTo(clamp(mk + ((devA[i] as number) + (devB[i] as number)) / 2, lo, hi), config);
  });

  const shape = mutationShape(gA, gB, family, nFo, config); // §4.4
  const signature = signatureOf(shape, config);
  const locus = gA.locus;

  // §4.5 — identidad: si la clave es del catálogo, toma id y movimiento base
  const base = config.catalogByKey.get(geneKey({ family, locus, signature }));
  const id = base ? base.id : `${family}.${locus}.m${signature}`;
  return {
    id,
    family,
    locus,
    shape,
    signature,
    move: base ? base.move : `mov:prov:${id}`,
    anchor: statsFrom(m),
    values: statsFrom(values),
    origin: "mutacion",
  };
}
