/**
 * Estudio de combate v0.4 (criterios D-043). Uso:
 *   npm run sim:v04 -- [--quick] [--fase base|elegir|validar] [--semilla P] [--hilos N] [--out DIR]
 *                      [--sin-informe] [--informe-desde DIR]
 * Fases: `base` mide la v0.4 sin tocar (semilla base04); `elegir` mide la base y las candidatas de
 * `sim/v04/candidates.ts` con semillas de elegir (elige03); `validar` mide la base y la propuesta
 * `config/propuestas/combate-v0.4.1.json` con semillas nuevas (valida04). Cada fase escribe <out>/<fase>.json
 * y el informe se genera desde los JSON que haya.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { Worker } from "node:worker_threads";
import { provenance } from "../combat/report.ts";
import { criteria, reachByFamily, tauntCatalogCount, placementPairs, type ConfigData } from "./analysis.ts";
import { CANDIDATES } from "./candidates.ts";
import { registerVariant, variantById } from "./configs.ts";
import { emptyResult, mergeResults, PLACEMENTS, type Kind, type VJob, type VResult } from "./games.ts";
import { writeV04Reports } from "./report.ts";
import { checkVariants } from "./check.ts";
import { allFamilies, BASE, CONTROL, fileSha, loadProposal, variantSha, type Variant } from "./setup.ts";

export type Phase = "base" | "elegir" | "validar";
const PHASES: readonly Phase[] = ["base", "elegir", "validar"];
export const PROPOSAL_PATH = "config/propuestas/combate-v0.4.1.json";

/** Prefijos de semilla ya usados en informes anteriores o para ajustar la IA: no valen aquí. */
export const BURNED_SEEDS = ["genoma", "combate01", "elige01", "valida01", "explora02", "elige02", "valida02", "valida03", "prof01", "tune1", "tune2", "test-det", "var03", "test-var"];
export const PHASE_SEED: Record<Phase, string> = { base: "base04", elegir: "elige03", validar: "valida04" };

export interface Sizes {
  readonly c1: number;
  readonly c2PerPair: number;
  readonly mirror: number;
  readonly place: number;
  readonly tank: number;
  readonly depth: number;
}

export interface PhaseFile {
  readonly phase: Phase;
  readonly mode: "completo" | "rapido";
  readonly seed: string;
  readonly sizes: Sizes;
  readonly threads: number;
  readonly elapsedSec: number;
  readonly commit: string;
  readonly kinds: readonly Kind[];
  readonly configs: readonly { id: string; label: string; sha: string; combat: Record<string, unknown>; moves: Record<string, unknown>; salts: Record<string, unknown> }[];
  readonly data: Readonly<Record<string, ConfigData>>;
}

interface Args {
  quick: boolean;
  phase: Phase;
  seed?: string;
  threads: number;
  out?: string;
  report: boolean;
  from?: string;
}

const HELP = `Estudio de combate v0.4 (Proyecto Genoma)
  --quick             ejecución reducida (< 30 s) para depurar; no sirve para concluir
  --fase F            base (por defecto) | elegir (candidatas de sim/v04/candidates.ts) | validar (${PROPOSAL_PATH}, semillas nuevas)
  --semilla P         prefijo de semillas (por defecto: base ${PHASE_SEED.base}, elegir ${PHASE_SEED.elegir}, validar ${PHASE_SEED.validar})
  --hilos N           hilos (por defecto 2)
  --out DIR           carpeta de salida (por defecto sim/out/v04/<modo>)
  --sin-informe       no genera el informe
  --informe-desde DIR regenera el informe desde los JSON de DIR sin simular`;

function parseArgs(argv: readonly string[]): Args | null {
  const a: Args = { quick: false, phase: "base", threads: 2, report: true };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--help") return null;
    if (k === "--quick") a.quick = true;
    else if (k === "--sin-informe") a.report = false;
    else {
      const v = argv[++i];
      if (v === undefined) throw new Error(`falta valor para ${k}`);
      if (k === "--fase") {
        if (!(PHASES as readonly string[]).includes(v)) throw new Error(`--fase: ${PHASES.join(" | ")}`);
        a.phase = v as Phase;
      } else if (k === "--semilla") a.seed = v;
      else if (k === "--hilos") a.threads = Math.max(1, Number(v) | 0);
      else if (k === "--out") a.out = v;
      else if (k === "--informe-desde") a.from = v;
      else throw new Error(`opción desconocida: ${k}`);
    }
  }
  return a;
}

export function sizesFor(quick: boolean, phase: Phase): Sizes {
  if (quick) return { c1: 150, mirror: 40, c2PerPair: 4, place: 20, tank: 30, depth: 4 };
  if (phase === "elegir") return { c1: 4000, mirror: 2000, c2PerPair: 250, place: 600, tank: 1500, depth: 0 };
  return { c1: 6000, mirror: 3000, c2PerPair: 400, place: 800, tank: 2000, depth: 400 };
}

interface Tagged {
  readonly slot: string;
  readonly job: VJob;
}

export function jobsFor(allConfigs: readonly Variant[], seed: string, z: Sizes, allKinds: readonly Kind[]): Tagged[] {
  const out: Tagged[] = [];
  const chunked = (slot: string, base: Omit<VJob, "from" | "to">, n: number, chunk: number): void => {
    for (let f = 0; f < n; f += chunk) out.push({ slot, job: { ...base, from: f, to: Math.min(n, f + chunk) } });
  };
  const fams = allFamilies();
  const kinds = allKinds;
  const configs = allConfigs.filter((c) => c.id !== CONTROL.id);
  if (kinds.includes("PROF")) for (const c of allConfigs) chunked(`${c.id}|PROF`, { kind: "PROF", config: c.id, seed }, z.depth, 20);
  for (const c of configs) {
    if (kinds.includes("C1")) chunked(`${c.id}|C1`, { kind: "C1", config: c.id, seed }, z.c1, 250);
    if (kinds.includes("ESPEJO")) chunked(`${c.id}|ESPEJO`, { kind: "ESPEJO", config: c.id, seed }, z.mirror, 250);
    if (kinds.includes("TANK")) chunked(`${c.id}|TANK`, { kind: "TANK", config: c.id, seed }, z.tank, 250);
    if (kinds.includes("PLACE")) for (const [p, q] of placementPairs()) chunked(`${c.id}|PLACE|${p}|${q}`, { kind: "PLACE", config: c.id, seed, pair: [p, q] as never }, z.place, 250);
    if (kinds.includes("C2")) for (let i = 0; i < fams.length; i++) for (let j = i + 1; j < fams.length; j++) chunked(`${c.id}|C2|${fams[i]}|${fams[j]}`, { kind: "C2", config: c.id, seed, pair: [fams[i]!, fams[j]!] }, z.c2PerPair, 250);
  }
  // control R-02: solo C1 (uso de provocar) y PROF
  for (const c of allConfigs.filter((c) => c.id === CONTROL.id)) if (kinds.includes("C1")) chunked(`${c.id}|C1`, { kind: "C1", config: c.id, seed }, z.c1, 250);
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
      const w = new Worker(new URL("./worker.ts", import.meta.url));
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

export function collect(jobs: readonly Tagged[], results: readonly VResult[]): Record<string, ConfigData> {
  const groups = new Map<string, VResult[]>();
  jobs.forEach((j, i) => {
    const l = groups.get(j.slot);
    if (l) l.push(results[i]!);
    else groups.set(j.slot, [results[i]!]);
  });
  const data: Record<string, any> = {};
  for (const [slot, rs] of groups) {
    const [id, kind, p, q] = slot.split("|") as [string, string, string | undefined, string | undefined];
    const d = (data[id] ??= {});
    if (kind === "C2" || kind === "PLACE") (d[kind] ??= {})[`${p}|${q}`] = mergeResults(rs);
    else d[kind] = mergeResults(rs);
  }
  return data as Record<string, ConfigData>;
}

export function readPhases(dir: string): Partial<Record<Phase, PhaseFile>> {
  const out: Partial<Record<Phase, PhaseFile>> = {};
  for (const p of PHASES) if (existsSync(`${dir}/${p}.json`)) out[p] = JSON.parse(readFileSync(`${dir}/${p}.json`, "utf8")) as PhaseFile;
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args) {
    console.log(HELP);
    return;
  }
  for (const c of CANDIDATES) registerVariant(c);
  const mode = args.quick ? "rapido" : "completo";
  const dir = args.from ?? args.out ?? `sim/out/v04/${mode}`;
  const official = !args.quick && args.out === undefined;
  if (args.from) {
    for (const f of writeV04Reports(readPhases(dir), dir, !dir.includes("rapido"))) console.log(`Informe: ${f}`);
    return;
  }
  const seed = args.seed ?? PHASE_SEED[args.phase];
  if (BURNED_SEEDS.some((b) => seed.startsWith(b))) throw new Error(`la semilla ${seed} ya se usó en un informe anterior`);
  for (const p of PHASES) if (PHASE_SEED[p] !== PHASE_SEED[args.phase] && seed.startsWith(PHASE_SEED[p])) throw new Error(`la semilla ${seed} es de la fase ${p}`);
  mkdirSync(dir, { recursive: true });
  let configs: Variant[] = [BASE];
  let kinds: readonly Kind[] = ["C1", "ESPEJO", "C2", "PLACE", "TANK", "PROF"];
  if (args.phase === "elegir") {
    if (CANDIDATES.length === 0) throw new Error("no hay candidatas declaradas en sim/v04/candidates.ts");
    configs = [BASE, ...CANDIDATES];
    kinds = ["C1", "ESPEJO", "C2", "PLACE", "TANK"];
  } else if (args.phase === "validar") {
    if (!existsSync(PROPOSAL_PATH)) throw new Error(`falta ${PROPOSAL_PATH}: no hay nada que validar`);
    const prop = loadProposal(PROPOSAL_PATH);
    registerVariant(prop);
    registerVariant(CONTROL);
    configs = [BASE, prop, CONTROL];
  }
  checkVariants(configs);
  const z = sizesFor(args.quick, args.phase);
  const jobs = jobsFor(configs, seed, z, kinds);
  console.log(`Combate v0.4, fase ${args.phase}, modo ${mode}: ${configs.length} configuraciones, ${jobs.length} trabajos, semilla ${seed}, ${args.threads} hilos`);
  const t0 = performance.now();
  const results = await runAll(jobs, args.threads, configs.filter((c) => c.id !== BASE.id));
  const elapsedSec = (performance.now() - t0) / 1000;
  const data = collect(jobs, results);
  for (const c of configs) {
    data[c.id] ??= {};
    data[c.id]!.reach = reachByFamily(c);
    data[c.id]!.tauntCatalog = tauntCatalogCount(c);
    data[c.id]!.C1 ??= emptyResult();
  }
  const { commit } = provenance();
  const file: PhaseFile = {
    phase: args.phase,
    mode,
    seed,
    sizes: z,
    threads: args.threads,
    elapsedSec,
    commit,
    kinds,
    configs: configs.map((c) => ({ id: c.id, label: c.label, sha: variantSha(c), combat: { ...c.combat }, moves: { ...c.moves }, salts: { ...c.salts } })),
    data,
  };
  writeFileSync(`${dir}/${args.phase}.json`, JSON.stringify(file));
  console.log(`Hecho en ${elapsedSec.toFixed(0)} s → ${dir}/${args.phase}.json`);
  for (const c of configs) {
    const cs = criteria(variantById(c.id), data[c.id]!);
    console.log(`  ${c.id}: ${cs.filter((x) => !x.informative && x.pass).length}/${cs.filter((x) => !x.informative).length} criterios; suspende: ${cs.filter((x) => !x.informative && !x.pass).map((x) => x.id).join(", ") || "—"}`);
  }
  if (args.report) for (const f of writeV04Reports(readPhases(dir), dir, official)) console.log(`Informe: ${f}`);
}

void PLACEMENTS;
void fileSha;
await main();
