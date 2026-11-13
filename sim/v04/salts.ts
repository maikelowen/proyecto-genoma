/**
 * Búsqueda de sales de familias para el catálogo v0.4 (informe familias-v0.4). Procedimiento fijo:
 *  ronda r: medir C2 de las 13 familias (n_medida por pareja, semilla `<semilla>-r<r>`); las familias BASE fuera de la banda
 *  de búsqueda (banda del criterio + margen), de la más alejada del 50 % a la menos (máx. `por_ronda`), prueban cada gen de pago
 *  (cabeza, cuerpo, cola; extremidades = movimiento gratis, no se salan) con c1…c4 (sin repetir la sal actual) que cumpla las
 *  cuotas del catálogo v0.4; se mide F contra las otras 12 con n_candidata por pareja (pareado) y se aplica la que más acerca F
 *  al 50 % si mejora ≥ mejora_min. Para al estar las 13 en banda, sin mejora o en rondas_max.
 * Uso: node sim/v04/salts.ts [--semilla elige05] [--out DIR] [--n-medida N] [--n-candidata N] [--margen M] [--rondas N]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { Worker } from "node:worker_threads";
import { generateMoveForKey } from "../../packages/core/src/index.ts";
import { allFamilies, BASE, battleConfig, GCFG, RAW_COMBAT, RAW_MOVES, type Variant } from "./setup.ts";
// copia de BURNED_SEEDS de cli.ts (importarlo ejecutaría el estudio)
const BURNED_SEEDS = ["genoma", "combate01", "elige01", "valida01", "explora02", "elige02", "valida02", "valida03", "prof01", "tune1", "tune2", "test-det", "var03", "test-var", "base04", "elige03", "valida04"];
import { emptyResult, mergeResults, type VJob, type VResult } from "./games.ts";

export const PAYING_LOCI = ["cabeza", "cuerpo", "cola"] as const;
export const SALT_CHOICES = ["c1", "c2", "c3", "c4"] as const;
const fams = allFamilies();
const baseSet = new Set(GCFG.baseFamilies as readonly string[]);
const pairs: [string, string][] = [];
for (let i = 0; i < fams.length; i++) for (let j = i + 1; j < fams.length; j++) pairs.push([fams[i]!, fams[j]!]);

export function withSalts(salts: Record<string, string>): Variant {
  const id = "s" + createHash("sha256").update(JSON.stringify(Object.entries(salts).sort())).digest("hex").slice(0, 10);
  return { ...BASE, id, label: `sales ${id}`, salts };
}

export function currentSalts(extra: Record<string, string>): Record<string, string> {
  return { ...(RAW_MOVES.overrides_catalogo.sales as Record<string, string>), ...extra };
}

/** Cuotas del catálogo v0.4 de una familia base (sobre los 9 genes de pago) con las sales de v. */
export function quotasOk(v: Variant, fam: string): boolean {
  const q = RAW_MOVES.criterios_sim.cuotas_catalogo;
  const cfg = battleConfig(v);
  const n: Record<string, number> = {};
  for (const t of GCFG.catalogById.values()) {
    if (t.family !== fam || !(PAYING_LOCI as readonly string[]).includes(t.locus)) continue;
    const a = generateMoveForKey(`${t.family}|${t.locus}|${t.signature}`, cfg.moves, t.move).archetype;
    n[a] = (n[a] ?? 0) + 1;
  }
  const apoyo = (n["proteccion"] ?? 0) + (n["curacion"] ?? 0);
  return apoyo >= q.apoyo_min && apoyo <= q.apoyo_max && Object.values(n).every((x) => x <= q.max_por_arquetipo) && (n["golpe"] ?? 0) >= q.golpe_min && (n["golpe_estado"] ?? 0) >= q.golpe_estado_min;
}

/** Cuotas de provocar y alcance/área del catálogo completo con las sales de v. */
export function catalogOk(v: Variant): { ok: boolean; detail: string } {
  const cfg = battleConfig(v);
  const t = RAW_MOVES.criterios_sim.cuotas_catalogo.provocar as Record<string, number>;
  const by: Record<string, number> = {};
  let total = 0;
  const reach: Record<string, number> = {};
  let freeOff = 0;
  for (const g of GCFG.catalogById.values()) {
    const m = generateMoveForKey(`${g.family}|${g.locus}|${g.signature}`, cfg.moves, g.move);
    if (m.taunt) (by[g.family] = (by[g.family] ?? 0) + 1), total++;
    if (m.modifier === "alcance" || m.area) reach[g.family] = (reach[g.family] ?? 0) + 1;
    if (g.locus === "extremidades" && ["golpe", "golpe_estado"].includes(m.archetype)) freeOff++;
  }
  const bad: string[] = [];
  if (total < t["total_min"]! || total > t["total_max"]!) bad.push(`provocar total ${total}`);
  for (const f of ["roca", "marea", "brote"]) if ((by[f] ?? 0) < t[`${f}_min`]!) bad.push(`provocar ${f} ${by[f] ?? 0}`);
  for (const f of GCFG.baseFamilies as readonly string[]) if (!(reach[f] ?? 0)) bad.push(`sin alcance ${f}`);
  return { ok: bad.length === 0, detail: bad.join("; ") || `provocar ${total}, alcance/área mín ${Math.min(...(GCFG.baseFamilies as readonly string[]).map((f) => reach[f] ?? 0))}` };
}

// ------------------------------------------------------------------ pool
interface Task { v: Variant; job: VJob }
async function runTasks(tasks: Task[], threads = 2): Promise<VResult[]> {
  const out = new Array<VResult>(tasks.length);
  let next = 0;
  await new Promise<void>((resolve, reject) => {
    let alive = 0;
    for (let k = 0; k < Math.min(threads, tasks.length); k++) {
      const w = new Worker(new URL("./salts-worker.ts", import.meta.url));
      alive++;
      let cur = -1;
      const feed = (): void => {
        if (next >= tasks.length) { void w.terminate(); if (--alive === 0) resolve(); return; }
        cur = next++;
        w.postMessage(tasks[cur]);
      };
      w.on("message", (r: VResult) => { out[cur] = r; feed(); });
      w.on("error", reject);
      feed();
    }
  });
  return out;
}

export interface Measure { rates: Record<string, number>; n: Record<string, number> }

/** Tasa de cada familia (o de `only`) contra las otras 12 para cada variante, con las mismas semillas. */
export async function measure(vs: Variant[], seed: string, n: number, only?: string): Promise<Record<string, number>[]> {
  const tasks: Task[] = [];
  const idx: { vi: number; pair: [string, string] }[] = [];
  const chunk = 120;
  vs.forEach((v, vi) => {
    for (const pair of pairs) {
      if (only && !pair.includes(only)) continue;
      for (let f = 0; f < n; f += chunk) { tasks.push({ v, job: { kind: "C2", config: v.id, seed, from: f, to: Math.min(n, f + chunk), pair: pair as never } }); idx.push({ vi, pair }); }
    }
  });
  const rs = await runTasks(tasks);
  const groups = new Map<string, VResult[]>();
  rs.forEach((r, i) => { const k = `${idx[i]!.vi}|${idx[i]!.pair.join("|")}`; (groups.get(k) ?? groups.set(k, []).get(k)!).push(r); });
  return vs.map((_, vi) => {
    const rates: Record<string, number> = {};
    for (const f of fams) {
      if (only && f !== only) continue;
      let w = 0, m = 0;
      for (const [k, l] of groups) {
        const [kv, a, b] = k.split("|");
        if (Number(kv) !== vi) continue;
        const r = mergeResults(l);
        if (a === f) { w += r.xWins + r.draws / 2; m += r.n; }
        else if (b === f) { w += r.n - r.xWins - r.draws + r.draws / 2; m += r.n; }
      }
      rates[f] = w / m;
    }
    return rates;
  });
}
void emptyResult;

export interface Step { round: number; rates: Record<string, number>; changes: { family: string; gene: string; from: string | null; to: string; before: number; after: number; tried: number }[] }

export async function search(opts: { seed: string; nMeasure: number; nCandidate: number; rounds: number; perRound: number; margin: number; minGain: number }, log: (s: string) => void): Promise<{ salts: Record<string, string>; steps: Step[] }> {
  const min = RAW_COMBAT.criterios_sim.v04.familias_min + opts.margin;
  const max = RAW_COMBAT.criterios_sim.v04.familias_max - opts.margin;
  let added: Record<string, string> = {};
  const steps: Step[] = [];
  const cur = (): Record<string, string> => currentSalts(added);
  for (let round = 1; round <= opts.rounds + 1; round++) {
    const v = withSalts(cur());
    const [rates] = await measure([v], `${opts.seed}-r${round}`, opts.nMeasure);
    const out = fams.filter((f) => rates![f]! < min || rates![f]! > max);
    log(`ronda ${round}: fuera de banda ${out.map((f) => `${f} ${(rates![f]! * 100).toFixed(1)}`).join(", ") || "ninguna"}`);
    const step: Step = { round, rates: rates!, changes: [] };
    steps.push(step);
    const targets = out.filter((f) => baseSet.has(f)).sort((a, b) => Math.abs(rates![b]! - 0.5) - Math.abs(rates![a]! - 0.5)).slice(0, opts.perRound);
    if (!targets.length || round > opts.rounds) break;
    for (const fam of targets) {
      const cands: { gene: string; salt: string; v: Variant }[] = [];
      for (const g of GCFG.catalogById.values()) {
        if (g.family !== fam || !(PAYING_LOCI as readonly string[]).includes(g.locus)) continue;
        for (const salt of SALT_CHOICES) {
          if (cur()[g.id] === salt) continue;
          const cv = withSalts({ ...cur(), [g.id]: salt });
          if (quotasOk(cv, fam) && catalogOk(cv).ok) cands.push({ gene: g.id, salt, v: cv });
        }
      }
      const res = await measure([withSalts(cur()), ...cands.map((c) => c.v)], `${opts.seed}-r${round}-${fam}`, opts.nCandidate, fam);
      const ref = res[0]![fam]!;
      let best = -1;
      let bestD = Math.abs(ref - 0.5) - opts.minGain;
      res.slice(1).forEach((r, i) => { const d = Math.abs(r[fam]! - 0.5); if (d < bestD) (bestD = d), (best = i); });
      if (best < 0) { log(`  ${fam}: ${cands.length} candidatas, ninguna mejora (ref ${(ref * 100).toFixed(1)})`); continue; }
      const c = cands[best]!;
      const from = cur()[c.gene] ?? null;
      step.changes.push({ family: fam, gene: c.gene, from, to: c.salt, before: ref, after: res[best + 1]![fam]!, tried: cands.length });
      log(`  ${fam}: ${c.gene} ${from ?? "—"} → ${c.salt}: ${(ref * 100).toFixed(1)} → ${(res[best + 1]![fam]! * 100).toFixed(1)} (${cands.length} candidatas)`);
      added = { ...added, [c.gene]: c.salt };
    }
  }
  return { salts: cur(), steps };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (k: string, d: string): string => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1]! : d; };
  const seed = arg("--semilla", "elige05");
  if (BURNED_SEEDS.some((b) => seed.startsWith(b))) throw new Error(`semilla quemada: ${seed}`);
  const out = arg("--out", "sim/out/v04/sales");
  const opts = { seed, nMeasure: Number(arg("--n-medida", "100")), nCandidate: Number(arg("--n-candidata", "120")), rounds: Number(arg("--rondas", "3")), perRound: Number(arg("--por-ronda", "3")), margin: Number(arg("--margen", "0.035")), minGain: 0.01 };
  const t0 = performance.now();
  const r = await search(opts, console.log);
  mkdirSync(out, { recursive: true });
  const base = RAW_MOVES.overrides_catalogo.sales as Record<string, string>;
  const newSalts: Record<string, string> = {};
  for (const [g, s] of Object.entries(r.salts)) if (base[g] !== s) newSalts[g] = s;
  writeFileSync(`${out}/busqueda.json`, JSON.stringify({ seed, opts, salts: r.salts, nuevas: newSalts, steps: r.steps, elapsedSec: (performance.now() - t0) / 1000 }, null, 1));
  console.log(`sales nuevas: ${JSON.stringify(newSalts)} (${((performance.now() - t0) / 1000).toFixed(0)} s)`);
}
