/**
 * Búsqueda de sales dirigida por C2 (movimientos §5.2), con el simulador real.
 * Procedimiento fijo (sin criterio a ojo), con semillas de ELEGIR:
 *   ronda r: medir C2 de las 13 familias (n_medida por pareja); para las familias base fuera de banda,
 *   de la más alejada a la menos (máx. 2 por ronda), probar cada gen de su catálogo con c1…c4
 *   (sin repetir la sal actual y respetando las cuotas §5.1) midiendo F contra las otras 12 (n_candidata por pareja,
 *   equipos pareados) y aplicar la sal que más acerca F al 50 % si mejora al menos `mejora_min`.
 *   Para cuando las 13 están en banda, no hay mejora o se llega a `rondas_max`.
 * Uso: node sim/combat/search.ts --patch FICHERO [--semilla elige02] [--out DIR]
 *        [--desde-parche] [--n-medida N] [--n-candidata N] [--rondas N] [--margen M]
 *   Sin --desde-parche toma del parche todo salvo las sales, que se buscan partiendo de las de la config;
 *   con --desde-parche parte también de las sales del parche (rondas de refinado con más combates).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { generateMoveForKey } from "../../packages/core/src/index.ts";
import { chunks, merge, type Job, type JobResult } from "./jobs.ts";
import { runJobs } from "./pool.ts";
import { allFamilies, battleConfig, catalogKeys, extend, GCFG, loadProposal, RAW_COMBAT, RAW_MOVES, type Variant } from "./setup.ts";

export const SEARCH: { nMeasure: number; nCandidate: number; maxRounds: number; perRound: number; salts: string[]; minGain: number; chunk: number; margin: number } = { nMeasure: 40, nCandidate: 30, maxRounds: 4, perRound: 2, salts: ["c1", "c2", "c3", "c4"], minGain: 0.01, chunk: 120, margin: 0 };

const fams = allFamilies();
const pairs: [string, string][] = [];
for (let i = 0; i < fams.length; i++) for (let j = i + 1; j < fams.length; j++) pairs.push([fams[i]!, fams[j]!]);

/** Cuotas §5.1 del catálogo de una familia base con la config de la variante. */
export function quotasOk(v: Variant, fam: string): boolean {
  const q = RAW_MOVES.criterios_sim.cuotas_catalogo;
  const cfg = battleConfig(v);
  const n: Record<string, number> = {};
  for (const k of catalogKeys().filter((k) => k.key.startsWith(fam + "|"))) {
    const a = generateMoveForKey(k.key, cfg.moves, k.id).archetype;
    n[a] = (n[a] ?? 0) + 1;
  }
  const apoyo = (n["proteccion"] ?? 0) + (n["curacion"] ?? 0);
  return apoyo >= q.apoyo_min && apoyo <= q.apoyo_max && Object.values(n).every((x) => x <= q.max_por_arquetipo) && (n["golpe"] ?? 0) >= q.golpe_min && (n["golpe_estado"] ?? 0) >= q.golpe_estado_min;
}

async function familyRates(tasks: { v: Variant; only?: string; n: number; seed: string }[]): Promise<Record<string, number>[]> {
  const jobs: { t: number; job: Job }[] = [];
  tasks.forEach((t, ti) => {
    for (const pair of pairs) if (!t.only || pair.includes(t.only)) for (const job of chunks({ kind: "C2", variant: t.v, seed: t.seed, pair }, t.n, SEARCH.chunk)) jobs.push({ t: ti, job });
  });
  const rs = await runJobs(jobs.map((j) => j.job), 2, () => {});
  return tasks.map((t, ti) => {
    const by = new Map<string, JobResult[]>();
    rs.forEach((r, i) => {
      if (jobs[i]!.t !== ti) return;
      const k = r.job.pair!.join("-");
      (by.get(k) ?? by.set(k, []).get(k)!).push(r);
    });
    const out: Record<string, number> = {};
    for (const f of fams) {
      if (t.only && f !== t.only) continue;
      let w = 0;
      let n = 0;
      for (const [k, l] of by) {
        const a = merge(l);
        const [F, G] = k.split("-");
        if (F === f) (w += a.xWins + a.draws / 2), (n += a.n);
        else if (G === f) (w += a.yWins + a.draws / 2), (n += a.n);
      }
      out[f] = w / n;
    }
    return out;
  });
}

export interface SearchStep {
  round: number;
  rates: Record<string, number>;
  changes: { family: string; gene: string; from: string | null; to: string; before: number; after: number; tried: number }[];
}

export async function searchSalts(start: Variant, seed: string, log: (s: string) => void): Promise<{ salts: Record<string, string>; steps: SearchStep[] }> {
  // margen: la búsqueda apunta a una banda más estrecha que la del criterio (deja sitio al error de muestreo)
  const min = RAW_COMBAT.criterios_sim.familias.min + SEARCH.margin;
  const max = RAW_COMBAT.criterios_sim.familias.max - SEARCH.margin;
  let v = start;
  const steps: SearchStep[] = [];
  const base = new Set(GCFG.baseFamilies as readonly string[]);
  for (let round = 1; round <= SEARCH.maxRounds + 1; round++) {
    const [rates] = await familyRates([{ v, n: SEARCH.nMeasure, seed: `${seed}-r${round}` }]);
    const out = fams.filter((f) => rates![f]! < min || rates![f]! > max);
    log(`ronda ${round}: fuera de banda ${out.map((f) => `${f} ${(rates![f]! * 100).toFixed(1)}`).join(", ") || "ninguna"}`);
    const step: SearchStep = { round, rates: rates!, changes: [] };
    steps.push(step);
    const targets = out.filter((f) => base.has(f)).sort((a, b) => Math.abs(rates![b]! - 0.5) - Math.abs(rates![a]! - 0.5)).slice(0, SEARCH.perRound);
    if (!targets.length || round > SEARCH.maxRounds) break;
    for (const fam of targets) {
      const cands: { gene: string; salt: string; v: Variant }[] = [];
      for (const k of catalogKeys().filter((k) => k.key.startsWith(fam + "|"))) {
        const cur = (v.salts ?? {})[k.gene] ?? RAW_MOVES.overrides_catalogo.sales[k.gene] ?? null;
        for (const salt of SEARCH.salts) {
          if (salt === cur) continue;
          const cv = extend(v, { id: `s_${k.gene}_${salt}`, salts: { [k.gene]: salt } });
          if (quotasOk(cv, fam)) cands.push({ gene: k.gene, salt, v: cv });
        }
      }
      // referencia y candidatas con las mismas semillas (pareado)
      const res = await familyRates([{ v, only: fam, n: SEARCH.nCandidate, seed: `${seed}-r${round}-${fam}` }, ...cands.map((c) => ({ v: c.v, only: fam, n: SEARCH.nCandidate, seed: `${seed}-r${round}-${fam}` }))]);
      const ref = res[0]![fam]!;
      let best = -1;
      let bestD = Math.abs(ref - 0.5) - SEARCH.minGain;
      res.slice(1).forEach((r, i) => {
        const d = Math.abs(r[fam]! - 0.5);
        if (d < bestD) (bestD = d), (best = i);
      });
      if (best < 0) {
        log(`  ${fam}: ${cands.length} candidatas, ninguna mejora (ref ${(ref * 100).toFixed(1)})`);
        continue;
      }
      const c = cands[best]!;
      const from = (v.salts ?? {})[c.gene] ?? RAW_MOVES.overrides_catalogo.sales[c.gene] ?? null;
      step.changes.push({ family: fam, gene: c.gene, from, to: c.salt, before: ref, after: res[best + 1]![fam]!, tried: cands.length });
      log(`  ${fam}: ${c.gene} ${from ?? "—"} → ${c.salt}: ${(ref * 100).toFixed(1)} → ${(res[best + 1]![fam]! * 100).toFixed(1)} (${cands.length} candidatas)`);
      v = extend(v, { id: v.id, salts: { [c.gene]: c.salt } });
    }
  }
  const salts: Record<string, string> = {};
  for (const [g, s] of Object.entries(v.salts ?? {})) if (s !== null && s !== RAW_MOVES.overrides_catalogo.sales[g]) salts[g] = s;
  return { salts, steps };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (k: string, d?: string): string | undefined => {
    const i = process.argv.indexOf(k);
    return i >= 0 ? process.argv[i + 1] : d;
  };
  const patch = arg("--patch");
  if (!patch) throw new Error("falta --patch");
  const seed = arg("--semilla", "elige02")!;
  const out = arg("--out", "sim/out/combate-v0.2/busqueda")!;
  const p = loadProposal(patch);
  const cont = process.argv.includes("--desde-parche");
  for (const [k, f] of [["--n-medida", "nMeasure"], ["--n-candidata", "nCandidate"], ["--rondas", "maxRounds"], ["--margen", "margin"]] as const) if (arg(k)) SEARCH[f] = Number(arg(k));
  const start: Variant = { ...p.variant, id: "busqueda", salts: cont ? p.variant.salts ?? {} : {} };
  const t0 = performance.now();
  const r = await searchSalts(start, seed, console.log);
  mkdirSync(out, { recursive: true });
  writeFileSync(`${out}/busqueda${cont ? `-refinado${SEARCH.margin ? "-margen" : ""}` : ""}.json`, JSON.stringify({ patch, seed, params: SEARCH, ...r, elapsedSec: (performance.now() - t0) / 1000 }, null, 1));
  console.log(`sales nuevas: ${JSON.stringify(r.salts)}  (${((performance.now() - t0) / 1000).toFixed(0)} s)`);
}
