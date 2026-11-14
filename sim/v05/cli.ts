/**
 * Estudio de combate v0.5 (combate-v0.5 §9, D-053/D-054). Uso:
 *   npm run sim:v05 -- [--quick] [--semilla P] [--hilos N] [--out DIR] [--sin-informe] [--informe-desde DIR] [--forzar-plan-b]
 * Corre base_E3, solo_D053, solo_D054 y ambas (y ambas_aturdir_primero solo si se cumple §9.4) con los MISMOS equipos
 * y la misma semilla de partida (pareado). Escenarios: C1, ESPEJO, C2 y PROF (PLACE y TANK no se miden: no son de §9.2).
 * Escribe <out>/v05.json y el informe docs/informes/combate-v0.5.md desde esos datos.
 */
process.env["SIM_COMBAT_CONFIG"] = "config/combate.v0.5.json";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { Worker } from "node:worker_threads";
const { provenance } = await import("../combat/report.ts");
const { reachByFamily, tauntCatalogCount } = await import("../v04/analysis.ts");
const { emptyResult, mergeResults } = await import("../v04/games.ts");
const { allFamilies, variantSha, battleConfig, fileSha } = await import("../v04/setup.ts");
const { registerVariant } = await import("../v04/configs.ts");
const { loadV05Configs, CORE_IDS, PLAN_B_ID, V05_PATH } = await import("./configs.ts");
const { checkV05 } = await import("./cli-check.ts");
const { planBNeeded, writeV05Report } = await import("./report.ts");
import type { ConfigData } from "../v04/analysis.ts";
import type { Kind, VJob, VResult } from "../v04/games.ts";
import type { Variant } from "../v04/setup.ts";

/** Semillas ya usadas (informes anteriores o ajuste) y las que el diseño prohíbe para v0.5. */
const BURNED = ["genoma", "combate01", "elige01", "valida01", "explora02", "elige02", "valida02", "valida03", "valida04", "base04", "elige03", "prof01", "tune1", "tune2", "test-det", "var03", "test-var", "miguelE3"];

export interface Sizes { c1: number; mirror: number; c2PerPair: number; depth: number }
export interface V05File {
  readonly mode: "completo" | "rapido";
  readonly seed: string;
  readonly sizes: Sizes;
  readonly threads: number;
  readonly elapsedSec: number;
  readonly commit: string;
  readonly configSha: string;
  readonly profIds: readonly string[];
  readonly configs: readonly { id: string; sha: string; combat: Record<string, unknown> }[];
  readonly data: Readonly<Record<string, ConfigData>>;
}

export const sizesFor = (quick: boolean): Sizes => (quick ? { c1: 150, mirror: 40, c2PerPair: 3, depth: 4 } : { c1: 12000, mirror: 2000, c2PerPair: 150, depth: 400 });

interface Tagged { slot: string; job: VJob }

export function jobsFor(configs: readonly Variant[], seed: string, z: Sizes, profIds: readonly string[]): Tagged[] {
  const out: Tagged[] = [];
  const chunked = (slot: string, base: Omit<VJob, "from" | "to">, n: number, chunk: number): void => {
    for (let f = 0; f < n; f += chunk) out.push({ slot, job: { ...base, from: f, to: Math.min(n, f + chunk) } });
  };
  const fams = allFamilies();
  for (const c of configs) {
    const b = { config: c.id, seed, paired: true };
    if (profIds.includes(c.id)) chunked(`${c.id}|PROF`, { ...b, kind: "PROF" as Kind }, z.depth, 20);
    chunked(`${c.id}|C1`, { ...b, kind: "C1" as Kind }, z.c1, 250);
    chunked(`${c.id}|ESPEJO`, { ...b, kind: "ESPEJO" as Kind }, z.mirror, 250);
    for (let i = 0; i < fams.length; i++) for (let j = i + 1; j < fams.length; j++) chunked(`${c.id}|C2|${fams[i]}|${fams[j]}`, { ...b, kind: "C2" as Kind, pair: [fams[i]!, fams[j]!] }, z.c2PerPair, 250);
  }
  return out;
}

async function runAll(jobs: readonly Tagged[], threads: number, extra: readonly Variant[]): Promise<VResult[]> {
  const results = new Array<VResult>(jobs.length);
  let next = 0;
  let done = 0;
  const step = Math.max(1, Math.floor(jobs.length / 10));
  await new Promise<void>((resolve, reject) => {
    let alive = 0;
    for (let t = 0; t < Math.min(threads, jobs.length); t++) {
      const w = new Worker(new URL("../v04/worker.ts", import.meta.url));
      w.postMessage({ extra });
      alive++;
      let cur = -1;
      const feed = (): void => {
        if (next >= jobs.length) {
          void w.terminate();
          if (--alive === 0) resolve();
          return;
        }
        cur = next++;
        w.postMessage(jobs[cur]!.job);
      };
      w.on("message", (r: VResult) => {
        results[cur] = r;
        if (++done % step === 0 || done === jobs.length) console.log(`  ${done}/${jobs.length} trabajos`);
        feed();
      });
      w.on("error", reject);
      feed();
    }
  });
  return results;
}

function collect(jobs: readonly Tagged[], results: readonly VResult[]): Record<string, ConfigData> {
  const groups = new Map<string, VResult[]>();
  jobs.forEach((j, i) => (groups.get(j.slot) ?? groups.set(j.slot, []).get(j.slot)!).push(results[i]!));
  const data: Record<string, any> = {};
  for (const [slot, rs] of groups) {
    const [id, kind, p, q] = slot.split("|") as [string, string, string | undefined, string | undefined];
    const d = (data[id] ??= {});
    if (kind === "C2") (d[kind] ??= {})[`${p}|${q}`] = mergeResults(rs);
    else d[kind] = mergeResults(rs);
  }
  return data as Record<string, ConfigData>;
}

function args(argv: readonly string[]): { quick: boolean; seed?: string; threads: number; out?: string; report: boolean; from?: string; planB: boolean } {
  const a = { quick: false, threads: 2, report: true, planB: false } as ReturnType<typeof args>;
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i]!;
    if (k === "--quick") a.quick = true;
    else if (k === "--sin-informe") a.report = false;
    else if (k === "--forzar-plan-b") a.planB = true;
    else {
      const v = argv[++i];
      if (v === undefined) throw new Error(`falta valor para ${k}`);
      if (k === "--semilla") a.seed = v;
      else if (k === "--hilos") a.threads = Math.max(1, Number(v) | 0);
      else if (k === "--out") a.out = v;
      else if (k === "--informe-desde") a.from = v;
      else throw new Error(`opción desconocida: ${k}`);
    }
  }
  return a;
}

async function main(): Promise<void> {
  const a = args(process.argv.slice(2));
  const mode = a.quick ? "rapido" : "completo";
  const dir = a.from ?? a.out ?? `sim/out/v05/${mode}`;
  const official = !a.quick && a.out === undefined;
  if (a.from) {
    console.log(`Informe: ${writeV05Report(JSON.parse(readFileSync(`${dir}/v05.json`, "utf8")), official)}`);
    return;
  }
  const { seedPrefix, variants } = loadV05Configs();
  const seed = a.seed ?? seedPrefix;
  if (BURNED.some((b) => seed.startsWith(b))) throw new Error(`la semilla ${seed} ya se usó`);
  const core = variants.filter((v) => (CORE_IDS as readonly string[]).includes(v.id));
  const planB = variants.find((v) => v.id === PLAN_B_ID)!;
  checkV05([...core, planB]);
  for (const v of [...core, planB]) registerVariant(v);
  mkdirSync(dir, { recursive: true });
  const z = sizesFor(a.quick);
  const profIds = ["base_E3", "ambas"];
  const t0 = performance.now();
  let jobs = jobsFor(core, seed, z, profIds);
  console.log(`Combate v0.5, modo ${mode}: ${core.length} configs, ${jobs.length} trabajos, semilla ${seed}, ${a.threads} hilos`);
  let data = collect(jobs, await runAll(jobs, a.threads, core));
  const ran: Variant[] = [...core];
  if (a.planB || planBNeeded(data)) {
    console.log(`Se cumple la condición de §9.4: se corre ${PLAN_B_ID}`);
    jobs = jobsFor([planB], seed, z, []);
    data = { ...data, ...collect(jobs, await runAll(jobs, a.threads, [planB])) };
    ran.push(planB);
  }
  const elapsedSec = (performance.now() - t0) / 1000;
  for (const c of ran) {
    data[c.id]!.reach = reachByFamily(c);
    data[c.id]!.tauntCatalog = tauntCatalogCount(c);
    data[c.id]!.C1 ??= emptyResult();
  }
  const { commit } = provenance();
  const configSha = fileSha(V05_PATH);
  const file: V05File = {
    mode, seed, sizes: z, threads: a.threads, elapsedSec, commit, configSha, profIds,
    configs: ran.map((c) => ({ id: c.id, sha: variantSha(c), combat: { ...c.combat } })),
    data,
  };
  writeFileSync(`${dir}/v05.json`, JSON.stringify(file));
  console.log(`Hecho en ${elapsedSec.toFixed(0)} s → ${dir}/v05.json`);
  if (a.report) console.log(`Informe: ${writeV05Report(file, official)}`);
}

await main();
