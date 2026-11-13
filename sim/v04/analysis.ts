/**
 * Métricas y criterios de combate v0.4 (combate-v0.4.md §9, D-043). Los umbrales se leen de `criterios_sim.v04`
 * del JSON efectivo de cada configuración; aquí no hay números de criterio.
 */
import { generateMoveForKey, LOCUS_IDS, createRng, type FamilyId } from "../../packages/core/src/index.ts";
import { quantileCI } from "../genetics/stats.ts";
import { allFamilies, battleConfig, effectiveRaw, GCFG, type Variant } from "./setup.ts";
import { PLACEMENTS, type VResult } from "./games.ts";

export interface Interval {
  readonly value: number;
  readonly lo: number;
  readonly hi: number;
}

/** Tasa de victorias con empates = ½ e IC 95 % normal sobre los resultados 1 / ½ / 0. */
export function winRate(wins: number, draws: number, n: number): Interval {
  if (n === 0) return { value: NaN, lo: NaN, hi: NaN };
  const p = (wins + 0.5 * draws) / n;
  const v = Math.max(0, (wins + 0.25 * draws) / n - p * p);
  const h = 1.96 * Math.sqrt(v / n);
  return { value: p, lo: p - h, hi: p + h };
}

export function wilson(k: number, n: number): Interval {
  if (n === 0) return { value: NaN, lo: NaN, hi: NaN };
  const z = 1.96;
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return { value: p, lo: Math.max(0, c - h), hi: Math.min(1, c + h) };
}

export function expandHist(h: readonly number[]): number[] {
  const xs: number[] = [];
  h.forEach((c, t) => {
    for (let i = 0; i < (c ?? 0); i++) xs.push(t);
  });
  return xs;
}

export interface Duration {
  readonly n: number;
  readonly mean: Interval;
  readonly p90: Interval;
  readonly draws: Interval;
}
export function duration(r: VResult): Duration {
  const xs = expandHist(r.turnsHist);
  const n = xs.length;
  const m = xs.reduce((s, x) => s + x, 0) / n;
  const sd = Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, n - 1));
  const h = 1.96 * (sd / Math.sqrt(n));
  const sorted = [...xs].sort((a, b) => a - b);
  const q = quantileCI(xs, 0.9);
  const p90 = sorted[Math.min(n - 1, Math.floor(0.9 * n))]!;
  return { n, mean: { value: m, lo: m - h, hi: m + h }, p90: { value: p90, lo: q.lo, hi: q.hi }, draws: wilson(r.draws, n) };
}

/** Datos de una configuración. */
export interface ConfigData {
  C1?: VResult;
  C2?: Record<string, VResult>;
  PLACE?: Record<string, VResult>;
  ESPEJO?: VResult;
  TANK?: VResult;
  PROF?: VResult;
  /** Movimientos con alcance o área por familia (catálogo, estático). */
  reach?: Record<string, { n: number; reach: number; area: number; exact: boolean }>;
  /** Cuota de provocar en el catálogo base. */
  tauntCatalog?: number;
}

export interface Criterion {
  readonly id: string;
  readonly group: string;
  readonly label: string;
  readonly threshold: string;
  readonly value: number;
  readonly lo: number;
  readonly hi: number;
  readonly fmt: "pct" | "num" | "int";
  readonly pass: boolean;
  /** El IC cruza el umbral. */
  readonly fragile: boolean;
  readonly informative: boolean;
  readonly detail?: string;
}

export const pct = (x: number, d = 1): string => `${(x * 100).toFixed(d).replace(".", ",")} %`;
export const num = (x: number, d = 2): string => x.toFixed(d).replace(".", ",");
export function fmtC(c: Criterion, x: number): string {
  return c.fmt === "pct" ? pct(x) : c.fmt === "int" ? String(Math.round(x)) : num(x);
}

function crit(c: Omit<Criterion, "fragile" | "pass"> & { pass?: boolean; limits: readonly number[]; cmp: "max" | "min" | "band" }): Criterion {
  const { limits, cmp, ...rest } = c;
  let pass: boolean;
  let fragile: boolean;
  if (cmp === "max") {
    pass = c.value <= limits[0]!;
    fragile = c.hi > c.lo && c.lo <= limits[0]! && c.hi >= limits[0]!;
  } else if (cmp === "min") {
    pass = c.value >= limits[0]!;
    fragile = c.hi > c.lo && c.lo <= limits[0]! && c.hi >= limits[0]!;
  } else {
    pass = c.value >= limits[0]! && c.value <= limits[1]!;
    fragile = (c.lo <= limits[0]! && c.hi >= limits[0]!) || (c.lo <= limits[1]! && c.hi >= limits[1]!);
  }
  return { ...rest, pass: c.pass ?? pass, fragile };
}

export interface FamilyRate {
  readonly family: string;
  readonly rate: Interval;
  readonly n: number;
}

/** C2: tasa de cada familia contra el conjunto de las otras 12 (parejas "F|G": xWins = F). */
export function familyRates(c2: Record<string, VResult>): FamilyRate[] {
  const fams = allFamilies();
  return fams.map((f) => {
    let wins = 0;
    let draws = 0;
    let n = 0;
    for (const [key, r] of Object.entries(c2)) {
      const [a, b] = key.split("|") as [string, string];
      if (a === f) {
        wins += r.xWins;
        draws += r.draws;
        n += r.n;
      } else if (b === f) {
        wins += r.n - r.draws - r.xWins;
        draws += r.draws;
        n += r.n;
      }
    }
    return { family: f, rate: winRate(wins, draws, n), n };
  });
}

/** Pares de colocaciones medidos: [P, Q] con P ≠ Q. */
export function placementPairs(): [string, string][] {
  const out: [string, string][] = [];
  for (let i = 0; i < PLACEMENTS.length; i++) for (let j = i + 1; j < PLACEMENTS.length; j++) out.push([PLACEMENTS[i]!, PLACEMENTS[j]!]);
  return out;
}

/** Alcance o área por familia en el catálogo: exacto para las 6 base (72 genes); muestra de claves para las 7 híbridas. */
export function reachByFamily(v: Variant): NonNullable<ConfigData["reach"]> {
  const cfg = battleConfig(v);
  const out: NonNullable<ConfigData["reach"]> = {};
  const note = (f: string, mv: { modifier: string | null; area: boolean }, exact: boolean): void => {
    const o = (out[f] ??= { n: 0, reach: 0, area: 0, exact });
    o.n++;
    if (mv.modifier === "alcance") o.reach++;
    if (mv.area) o.area++;
  };
  for (const t of GCFG.catalogById.values()) note(t.family, generateMoveForKey(`${t.family}|${t.locus}|${t.signature}`, cfg.moves, t.move), true);
  const rng = createRng("alcance|muestra");
  const levels = GCFG.shape.levels;
  for (const h of allFamilies().filter((f) => GCFG.hybridById.has(f))) {
    for (let k = 0; k < 300; k++) {
      const L = LOCUS_IDS[Math.floor(rng.next() * LOCUS_IDS.length)]!;
      let sig = "";
      for (let i = 0; i < 4; i++) sig += String(Math.floor(rng.next() * levels));
      note(h, generateMoveForKey(`${h}|${L}|${sig}`, cfg.moves), false);
    }
  }
  return out;
}

export function tauntCatalogCount(v: Variant): number {
  const cfg = battleConfig(v);
  let n = 0;
  for (const t of GCFG.catalogById.values()) if (generateMoveForKey(`${t.family}|${t.locus}|${t.signature}`, cfg.moves, t.move).taunt === true) n++;
  return n;
}

export function criteria(v: Variant, d: ConfigData): Criterion[] {
  const K = effectiveRaw(v).combat.criterios_sim.v04 as Record<string, number>;
  const out: Criterion[] = [];
  const C1 = d.C1;
  if (d.PROF && d.PROF.n > 0) {
    const w = winRate(d.PROF.xWins, d.PROF.draws, d.PROF.n);
    const strict = { ...w };
    out.push(crit({ id: "profundidad", group: "Profundidad", label: `Búsqueda vs mejor IA de reglas (${d.PROF.n} partidas)`, threshold: `> ${pct(K["profundidad_min"]!, 0)}`, value: strict.value, lo: strict.lo, hi: strict.hi, fmt: "pct", informative: false, limits: [K["profundidad_min"]!], cmp: "min" }));
  }
  if (C1 && C1.n > 0) {
    const fk = wilson(C1.firstKoWins, C1.firstKoN);
    out.push(crit({ id: "primer_ko", group: "Remontada", label: "Gana quien hace el primer KO", threshold: `< ${pct(K["primer_ko_max"]!, 0)}`, ...fk, fmt: "pct", informative: false, limits: [K["primer_ko_max"]!], cmp: "max" }));
    const l3 = wilson(C1.lead3Wins, C1.lead3N);
    out.push(crit({ id: "lider_t3", group: "Remontada", label: "Gana el líder de vida tras el turno 3", threshold: `< ${pct(K["lider_t3_max"]!, 0)}`, ...l3, fmt: "pct", informative: false, limits: [K["lider_t3_max"]!], cmp: "max" }));
    const du = duration(C1);
    out.push(crit({ id: "turnos", group: "Duración", label: "Turnos medios (C1)", threshold: `${K["turnos_media_min"]}–${K["turnos_media_max"]}`, ...du.mean, fmt: "num", informative: false, limits: [K["turnos_media_min"]!, K["turnos_media_max"]!], cmp: "band" }));
    out.push(crit({ id: "p90", group: "Duración", label: "Turnos p90 (C1)", threshold: `≤ ${K["turnos_p90_max"]}`, ...du.p90, fmt: "num", informative: false, limits: [K["turnos_p90_max"]!], cmp: "max" }));
    out.push(crit({ id: "empates", group: "Duración", label: "Empates (C1)", threshold: `≤ ${pct(K["empates_max"]!, 0)}`, ...du.draws, fmt: "pct", informative: false, limits: [K["empates_max"]!], cmp: "max" }));
    const fr = wilson(C1.freeActions, C1.actions);
    out.push(crit({ id: "gratis", group: "Gratis", label: "Acciones que son el movimiento gratis", threshold: `≤ ${pct(K["gratis_frac_max"]!, 0)}`, ...fr, fmt: "pct", informative: false, limits: [K["gratis_frac_max"]!], cmp: "max" }));
    const m = C1.soulDistinct / C1.soulN;
    const sd = Math.sqrt(Math.max(0, C1.soulDistinctSq / C1.soulN - m * m));
    const h = 1.96 * (sd / Math.sqrt(C1.soulN));
    out.push(crit({ id: "pagos", group: "Uso de pago", label: `Movimientos de pago distintos por alma (de 3; almas con ≥ ${K["pagos_distintos_min_acciones"]} acciones)`, threshold: `≥ ${K["pagos_distintos_por_alma_min"]}`, value: m, lo: m - h, hi: m + h, fmt: "num", informative: false, limits: [K["pagos_distintos_por_alma_min"]!], cmp: "min" }));
    const tp = C1.taunts / C1.n;
    out.push(crit({ id: "provocar", group: "Provocar", label: "Usos de provocar por partida (informativo)", threshold: `≥ ${K["provocar_por_partida_inf"]}`, value: tp, lo: tp, hi: tp, fmt: "num", informative: true, limits: [K["provocar_por_partida_inf"]!], cmp: "min" }));
  }
  if (d.ESPEJO && d.ESPEJO.n > 0) {
    const e = d.ESPEJO;
    const fk = wilson(e.firstKoWins, e.firstKoN);
    out.push(crit({ id: "primer_ko_espejo", group: "Remontada", label: "Primer KO, partidas espejo (informativo)", threshold: `< ${pct(K["primer_ko_max"]!, 0)}`, ...fk, fmt: "pct", informative: true, limits: [K["primer_ko_max"]!], cmp: "max" }));
    const l3 = wilson(e.lead3Wins, e.lead3N);
    out.push(crit({ id: "lider_t3_espejo", group: "Remontada", label: "Líder de vida T3, partidas espejo (informativo)", threshold: `< ${pct(K["lider_t3_max"]!, 0)}`, ...l3, fmt: "pct", informative: true, limits: [K["lider_t3_max"]!], cmp: "max" }));
  }
  if (d.PLACE && Object.keys(d.PLACE).length) {
    let worst: { pair: string; w: Interval } | null = null;
    const rows: string[] = [];
    for (const [pair, r] of Object.entries(d.PLACE)) {
      const w = winRate(r.xWins, r.draws, r.n);
      const [p, q] = pair.split("|") as [string, string];
      const win = w.value >= 0.5 ? { name: `${p} vs ${q}`, iv: w } : { name: `${q} vs ${p}`, iv: { value: 1 - w.value, lo: 1 - w.hi, hi: 1 - w.lo } };
      rows.push(`${win.name} ${pct(win.iv.value)}`);
      if (!worst || win.iv.value > worst.w.value) worst = { pair: win.name, w: win.iv };
    }
    out.push(crit({ id: "colocacion", group: "Colocación", label: `Mayor tasa de una colocación contra otra (${worst!.pair})`, threshold: `≤ ${pct(K["colocacion_wr_max"]!, 0)}`, ...worst!.w, fmt: "pct", informative: false, limits: [K["colocacion_wr_max"]!], cmp: "max", detail: rows.join("; ") }));
  }
  if (d.TANK && d.TANK.n > 0) {
    const du = duration(d.TANK);
    out.push(crit({ id: "tanque", group: "Tanque", label: "Turnos medios con tanque y apoyo detrás", threshold: `≤ ${K["tanque_turnos_media_max"]}`, ...du.mean, fmt: "num", informative: false, limits: [K["tanque_turnos_media_max"]!], cmp: "max" }));
  }
  if (d.reach) {
    const fams = allFamilies();
    const without = fams.filter((f) => !((d.reach![f]?.reach ?? 0) + (d.reach![f]?.area ?? 0) > 0));
    const minCount = Math.min(...fams.map((f) => (d.reach![f]?.reach ?? 0) + (d.reach![f]?.area ?? 0)));
    out.push(crit({ id: "alcance", group: "Catálogo", label: "Familias sin ningún movimiento de alcance o área", threshold: "0 de 13", value: without.length, lo: without.length, hi: without.length, fmt: "int", informative: false, limits: [0], cmp: "max", detail: `mínimo por familia: ${minCount} movimientos${without.length ? `; sin: ${without.join(", ")}` : ""}` }));
  }
  if (d.C2 && Object.keys(d.C2).length) {
    const rates = familyRates(d.C2);
    const out13 = rates.filter((f) => f.rate.value < K["familias_min"]! || f.rate.value > K["familias_max"]!);
    const lowest = rates.reduce((a, b) => (a.rate.value < b.rate.value ? a : b));
    const highest = rates.reduce((a, b) => (a.rate.value > b.rate.value ? a : b));
    const frag = rates.some((f) => (f.rate.lo < K["familias_min"]! && f.rate.hi > K["familias_min"]!) || (f.rate.lo < K["familias_max"]! && f.rate.hi > K["familias_max"]!));
    const c = crit({ id: "familias", group: "Familias (C2)", label: `Familias fuera de ${pct(K["familias_min"]!, 0)}–${pct(K["familias_max"]!, 0)} (de 13)`, threshold: "0", value: out13.length, lo: out13.length, hi: out13.length, fmt: "int", informative: false, limits: [0], cmp: "max", detail: `de ${pct(lowest.rate.value)} (${lowest.family}) a ${pct(highest.rate.value)} (${highest.family}); fuera: ${out13.map((f) => `${f.family} ${pct(f.rate.value)}`).join(", ") || "ninguna"}` });
    out.push({ ...c, fragile: frag });
  }
  return out;
}

export const judged = (cs: readonly Criterion[]): Criterion[] => cs.filter((c) => !c.informative);
export const failing = (cs: readonly Criterion[]): Criterion[] => judged(cs).filter((c) => !c.pass);
export type { FamilyId };
