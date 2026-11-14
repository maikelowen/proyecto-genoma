/** Estadística pareada del estudio v0.5: diferencia de razones entre dos configs sobre las mismas partidas (linealización). */
export interface Delta {
  readonly a: number;
  readonly b: number;
  readonly diff: number;
  /** Error estándar de (a − b) con el pareado partida a partida. */
  readonly se: number;
  readonly n: number;
}

/** Por partida: [y, m] (m = 1 si cuenta en el denominador). Razón = Σy / Σm. */
export type Obs = readonly [number, number];

function ratio(xs: readonly Obs[]): number {
  let y = 0;
  let m = 0;
  for (const [a, b] of xs) {
    y += a;
    m += b;
  }
  return m ? y / m : NaN;
}

export function pairedDelta(xs: readonly Obs[], base: readonly Obs[]): Delta {
  if (xs.length !== base.length) throw new Error("las configs no tienen las mismas partidas");
  const n = xs.length;
  const p1 = ratio(xs);
  const p0 = ratio(base);
  const m1 = xs.reduce((s, o) => s + o[1], 0) / n;
  const m0 = base.reduce((s, o) => s + o[1], 0) / n;
  const z = xs.map((o, i) => (o[0] - p1 * o[1]) / m1 - (base[i]![0] - p0 * base[i]![1]) / m0);
  const mean = z.reduce((s, v) => s + v, 0) / n;
  const v = z.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(1, n - 1);
  return { a: p1, b: p0, diff: p1 - p0, se: Math.sqrt(v / n), n };
}

/** Diferencia de dos proporciones independientes (profundidad: no hay pareado partida a partida). */
export function indepDelta(k1: number, n1: number, k0: number, n0: number): Delta {
  const p1 = k1 / n1;
  const p0 = k0 / n0;
  return { a: p1, b: p0, diff: p1 - p0, se: Math.sqrt((p1 * (1 - p1)) / n1 + (p0 * (1 - p0)) / n0), n: Math.min(n1, n0) };
}

export interface Metrics {
  readonly primerKo: Obs[];
  readonly lider3: Obs[];
  readonly remontada: Obs[];
  readonly empate: Obs[];
  readonly turnos: Obs[];
}

/** Descodifica `codes` (gameCode, 4 caracteres por partida). */
export function decodeCodes(codes: string): Metrics {
  const out: Metrics = { primerKo: [], lider3: [], remontada: [], empate: [], turnos: [] };
  for (let i = 0; i + 3 < codes.length + 0 && i < codes.length; i += 4) {
    const ko = codes.charCodeAt(i) - 48;
    const l3 = codes.charCodeAt(i + 1) - 48;
    const dr = codes.charCodeAt(i + 2) - 48;
    const t = codes.charCodeAt(i + 3) - 33;
    out.primerKo.push([ko === 1 ? 1 : 0, ko === 1 || ko === 2 ? 1 : 0]);
    out.lider3.push([l3 === 1 ? 1 : 0, l3 === 1 || l3 === 2 ? 1 : 0]);
    out.remontada.push([ko === 2 ? 1 : 0, ko >= 1 ? 1 : 0]);
    out.empate.push([dr, 1]);
    out.turnos.push([t, 1]);
  }
  return out;
}
