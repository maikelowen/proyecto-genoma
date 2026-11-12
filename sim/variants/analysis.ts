/**
 * Medidas y criterios del estudio de variantes v0.3 a partir de los contadores de games.ts.
 * Umbrales: duración y familias salen de `criterios_sim` de la config de combate; profundidad y
 * remontada no están en la config (son de docs/spec/combate-variantes-v0.3.md §4) y se declaran aquí una sola vez.
 */
import { quantile, quantileCI } from "../genetics/stats.ts";
import { expandHist, wilson, winRate, type Interval } from "../combat/analysis.ts";
import { allFamilies, RAW_COMBAT } from "../combat/setup.ts";
import type { VResult } from "./games.ts";

/** Umbrales de la spec de variantes §4 que no están en config/. */
export const SPEC_V03 = { depthMin: 0.6, comebackMax: 0.65 } as const;

export interface ComboData {
  readonly C1: VResult;
  readonly ESPEJO?: VResult;
  readonly PROF?: VResult;
  readonly C2?: Readonly<Record<string, VResult>>;
  readonly FORM_gen?: VResult;
  readonly FORM_inv?: VResult;
}

export interface Crit {
  readonly id: string;
  readonly label: string;
  readonly threshold: string;
  readonly iv: Interval;
  readonly pass: boolean;
  readonly fragile: boolean;
  readonly fmt: "pct" | "num";
  /** Texto extra (p. ej. "12/13"). */
  readonly extra?: string;
}

export interface FamilyRate {
  readonly family: string;
  readonly rate: Interval;
  readonly n: number;
}

export interface Metrics {
  readonly depth: Interval | null;
  readonly depthN: number;
  readonly depthDiffers: number;
  readonly depthBasic: number;
  readonly depthTurns: number;
  readonly firstKo: Interval;
  readonly lead3: Interval;
  readonly lead0: Interval;
  readonly mirrorFirstKo: Interval | null;
  readonly mirrorLead3: Interval | null;
  readonly entropy: Interval;
  readonly aggEntropy: number;
  readonly basic: Interval;
  readonly shares: readonly number[];
  readonly avail: number;
  readonly payable: number;
  readonly unspent: number;
  readonly tauntsPerGame: number;
  readonly families: readonly FamilyRate[] | null;
  readonly famOk: number;
  readonly famWorst: FamilyRate | null;
  readonly mean: Interval;
  readonly p90: Interval;
  readonly draws: Interval;
  readonly sideA: Interval;
  readonly invalid: number;
  readonly formGen: Interval | null;
  readonly formInv: Interval | null;
  readonly n: number;
  readonly crit: readonly Crit[];
}

const sum = (xs: readonly number[]): number => xs.reduce((s, x) => s + x, 0);

function meanTurns(r: VResult): Interval {
  const xs = expandHist(r.turnsHist);
  const m = sum(xs) / xs.length;
  const sd = Math.sqrt(sum(xs.map((x) => (x - m) * (x - m))) / Math.max(1, xs.length - 1));
  const h = (1.96 * sd) / Math.sqrt(xs.length);
  return { value: m, lo: m - h, hi: m + h };
}

export function entropyBits(r: VResult): Interval {
  if (r.entN === 0) return { value: NaN, lo: NaN, hi: NaN };
  const m = r.entSum / r.entN;
  const v = Math.max(0, r.entSq / r.entN - m * m);
  const h = 1.96 * Math.sqrt(v / r.entN);
  return { value: m / 1000, lo: (m - h) / 1000, hi: (m + h) / 1000 };
}

export function familyRates(c2: Readonly<Record<string, VResult>>): FamilyRate[] {
  return allFamilies().map((fam) => {
    let w = 0;
    let d = 0;
    let n = 0;
    for (const [k, r] of Object.entries(c2)) {
      const [F, G] = k.split("-");
      if (F === fam) w += r.xWins;
      else if (G === fam) w += r.n - r.xWins - r.draws;
      else continue;
      d += r.draws;
      n += r.n;
    }
    return { family: fam, rate: winRate(w, d, n), n };
  });
}

function crit(id: string, label: string, iv: Interval, min: number, max: number, fmt: "pct" | "num", strict: boolean, extra?: string, passOverride?: boolean): Crit {
  const pass = passOverride ?? (strict ? iv.value > min && iv.value < max : iv.value >= min && iv.value <= max);
  const fragile = (Number.isFinite(min) && iv.lo <= min && iv.hi >= min) || (Number.isFinite(max) && iv.lo <= max && iv.hi >= max);
  const f = (x: number): string => (fmt === "pct" ? `${(x * 100).toLocaleString("es", { maximumFractionDigits: 1 })} %` : x.toLocaleString("es"));
  const threshold = min === -Infinity ? `${strict ? "<" : "≤"} ${f(max)}` : max === Infinity ? `${strict ? ">" : "≥"} ${f(min)}` : `${f(min)}–${f(max)}`;
  return { id, label, threshold, iv, pass, fragile, fmt, ...(extra ? { extra } : {}) };
}

export function metrics(d: ComboData): Metrics {
  const c1 = d.C1;
  const acts = sum(c1.byCostRank);
  const shares = c1.byCostRank.map((x) => x / acts);
  const aggEntropy = -sum(shares.filter((p) => p > 0).map((p) => p * Math.log2(p)));
  const xs = expandHist(c1.turnsHist);
  const p90ci = quantileCI(xs, 0.9);
  const mean = meanTurns(c1);
  const p90: Interval = { value: quantile(xs, 0.9), lo: p90ci.lo, hi: p90ci.hi };
  const draws = wilson(c1.draws, c1.n);
  const firstKo = wilson(c1.firstKoWins, c1.firstKoN);
  const lead3 = wilson(c1.lead3Wins, c1.lead3N);
  const P = d.PROF;
  const depth = P ? winRate(P.xWins, P.draws, P.n) : null;
  const families = d.C2 ? familyRates(d.C2) : null;
  const D = RAW_COMBAT.criterios_sim.duracion;
  const F = RAW_COMBAT.criterios_sim.familias;
  const famOk = families ? families.filter((f) => f.rate.value >= F.min && f.rate.value <= F.max).length : 0;
  const famWorst = families ? [...families].sort((a, b) => Math.abs(b.rate.value - 0.5) - Math.abs(a.rate.value - 0.5))[0]! : null;
  const cs: Crit[] = [];
  if (depth) cs.push(crit("prof", "Profundidad: búsqueda vs mejor IA de reglas", depth, SPEC_V03.depthMin, Infinity, "pct", true));
  cs.push(crit("ko1", "Remontada: gana quien hace el primer KO", firstKo, -Infinity, SPEC_V03.comebackMax, "pct", true));
  cs.push(crit("vida3", "Remontada: gana quien lidera en vida tras el turno 3", lead3, -Infinity, SPEC_V03.comebackMax, "pct", true));
  if (families && famWorst) cs.push(crit("fam", `Familias: la más alejada del 50 % (${famWorst.family})`, famWorst.rate, F.min, F.max, "pct", false, `${famOk}/${families.length}`, famOk === families.length));
  cs.push(crit("dur_media", "Duración: media de turnos", mean, D.media_min, D.media_max, "num", false));
  cs.push(crit("dur_p90", "Duración: p90 de turnos", p90, -Infinity, D.p90_max, "num", false));
  cs.push(crit("empates", "Empates", draws, -Infinity, D.max_empates, "pct", false));
  const pa = P ? sum(P.byCostRank) : 0;
  return {
    depth,
    depthN: P?.n ?? 0,
    depthDiffers: P && P.decisions ? P.differs / P.decisions : NaN,
    depthBasic: P && pa ? P.byCostRank[0]! / pa : NaN,
    depthTurns: P ? meanTurns(P).value : NaN,
    firstKo,
    lead3,
    lead0: wilson(c1.lead0Wins, c1.lead0N),
    mirrorFirstKo: d.ESPEJO ? wilson(d.ESPEJO.firstKoWins, d.ESPEJO.firstKoN) : null,
    mirrorLead3: d.ESPEJO ? wilson(d.ESPEJO.lead3Wins, d.ESPEJO.lead3N) : null,
    entropy: entropyBits(c1),
    aggEntropy,
    basic: wilson(c1.byCostRank[0]!, acts),
    shares,
    avail: c1.availSum / c1.decN,
    payable: c1.payableSum / c1.decN,
    unspent: c1.unspent / c1.plans,
    tauntsPerGame: c1.taunts / c1.n,
    families,
    famOk,
    famWorst,
    mean,
    p90,
    draws,
    sideA: winRate(c1.aWins, c1.draws, c1.n),
    invalid: c1.invalid + (P?.invalid ?? 0) + (d.ESPEJO?.invalid ?? 0),
    formGen: d.FORM_gen ? winRate(d.FORM_gen.xWins, d.FORM_gen.draws, d.FORM_gen.n) : null,
    formInv: d.FORM_inv ? winRate(d.FORM_inv.xWins, d.FORM_inv.draws, d.FORM_inv.n) : null,
    n: c1.n,
    crit: cs,
  };
}

/** Diferencia frente a la base con error típico a partir de los IC (muestras tratadas como independientes: conservador, los equipos son pareados). */
export function delta(x: Interval, base: Interval): { d: number; sig: boolean } {
  const se = Math.hypot((x.hi - x.lo) / 3.92, (base.hi - base.lo) / 3.92);
  const d = x.value - base.value;
  return { d, sig: se > 0 && Math.abs(d) > 1.96 * se };
}
