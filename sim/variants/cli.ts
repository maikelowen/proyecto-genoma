/**
 * Estudio de variantes de combate v0.3 (docs/spec/combate-variantes-v0.3.md §4). Uso:
 *   npm run sim:variantes -- [--quick] [--fase evaluar|elegir|validar] [--semilla P] [--hilos N]
 *                            [--out DIR] [--sin-informe] [--informe-desde DIR]
 * Fases: `evaluar` (por defecto) mide la base y las 8 combinaciones; `diagnostico` mide V4 sin provocar (C1 y C2); `elegir` mide las candidatas del
 * ajuste ligero (sim/variants/adjust.ts) con semillas de elegir; `validar` mide la candidata elegida con
 * semillas nuevas. Cada fase escribe <out>/<fase>.json y el informe se genera desde los JSON que haya.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { Worker } from "node:worker_threads";
import { provenance } from "../combat/report.ts";
import { allFamilies } from "../combat/setup.ts";
import { CANDIDATES, chosenCandidate, ADJUST_KINDS } from "./adjust.ts";
import type { ComboData } from "./analysis.ts";
import { checkCombos, comboById, comboSha, DIAG_COMBOS, MAIN_COMBOS, registerCombo, type Combo } from "./combos.ts";
import { emptyResult, mergeResults, type Kind, type VJob, type VResult } from "./games.ts";
import { writeVariantReports } from "./report.ts";

export type Phase = "evaluar" | "diagnostico" | "elegir" | "validar";
const PHASES: readonly Phase[] = ["evaluar", "diagnostico", "elegir", "validar"];

/** Prefijos de semilla ya usados en informes anteriores o para ajustar la IA: no valen aquí. */
export const BURNED_SEEDS = ["genoma", "combate01", "elige01", "valida01", "explora02", "elige02", "valida02", "valida03", "prof01", "tune1", "tune2", "test-det"];
export const PHASE_SEED: Record<Phase, string> = { evaluar: "var03", diagnostico: "var03", elegir: "elige03", validar: "valida04" };

export interface Sizes {
  readonly c1: number;
  readonly mirror: number;
  readonly c2PerPair: number;
  readonly depth: number;
  readonly form: number;
}

export interface PhaseFile {
  readonly phase: Phase;
  readonly mode: "completo" | "rapido";
  readonly seed: string;
  readonly sizes: Sizes;
  readonly threads: number;
  readonly elapsedSec: number;
  readonly commit: string;
  readonly configSha: string;
  readonly combos: readonly { id: string; label: string; sha: string; combat: Record<string, unknown>; moves: Record<string, unknown>; adjust?: string }[];
  readonly data: Readonly<Record<string, ComboData>>;
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

const HELP = `Estudio de variantes de combate v0.3 (Proyecto Genoma)
  --quick             ejecución reducida (< 30 s) para depurar; no sirve para concluir
  --fase F            evaluar (por defecto) | diagnostico (V4 sin provocar; C1 y C2) | elegir (candidatas del ajuste) | validar (candidata elegida, semillas nuevas)
  --semilla P         prefijo de semillas (por defecto: evaluar ${PHASE_SEED.evaluar}, elegir ${PHASE_SEED.elegir}, validar ${PHASE_SEED.validar})
  --hilos N           hilos (por defecto 2)
  --out DIR           carpeta de salida (por defecto sim/out/variantes/<modo>)
  --sin-informe       no genera el informe
  --informe-desde DIR regenera el informe desde los JSON de DIR sin simular`;

function parseArgs(argv: readonly string[]): Args | null {
  const a: Args = { quick: false, phase: "evaluar", threads: 2, report: true };
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

/** Tamaños. Completo: reducido frente a la spec solo donde se declara en el informe. */
export function sizesFor(quick: boolean, phase: Phase): Sizes {
  if (quick) return { c1: 150, mirror: 40, c2PerPair: 4, depth: 4, form: 30 };
  if (phase === "diagnostico") return { c1: 2000, mirror: 0, c2PerPair: 160, depth: 0, form: 0 };
  if (phase === "elegir") return { c1: 3000, mirror: 0, c2PerPair: 120, depth: 0, form: 0 };
  return { c1: 5000, mirror: 2000, c2PerPair: 160, depth: 300, form: 1000 };
}

interface Tagged {
  readonly slot: string;
  readonly job: VJob;
}

export function jobsFor(combos: readonly Combo[], seed: string, z: Sizes, kinds: readonly Kind[]): Tagged[] {
  const out: Tagged[] = [];
  const chunked = (slot: string, base: Omit<VJob, "from" | "to">, n: number, chunk: number): void => {
    for (let f = 0; f < n; f += chunk) out.push({ slot, job: { ...base, from: f, to: Math.min(n, f + chunk) } });
  };
  const fams = allFamilies();
  // primero lo caro (búsqueda), para que los dos hilos lo repartan
  if (kinds.includes("PROF")) for (const c of combos) chunked(`${c.id}|PROF`, { kind: "PROF", combo: c.id, seed }, z.depth, 20);
  for (const c of combos) {
    if (kinds.includes("C1")) chunked(`${c.id}|C1`, { kind: "C1", combo: c.id, seed }, z.c1, 250);
    if (kinds.includes("ESPEJO")) chunked(`${c.id}|ESPEJO`, { kind: "ESPEJO", combo: c.id, seed }, z.mirror, 250);
    if (kinds.includes("C2")) for (let i = 0; i < fams.length; i++) for (let j = i + 1; j < fams.length; j++) chunked(`${c.id}|C2|${fams[i]}-${fams[j]}`, { kind: "C2", combo: c.id, seed, pair: [fams[i]!, fams[j]!] }, z.c2PerPair, 250);
    if (kinds.includes("FORM") && c.v4) for (const rival of ["gen", "inv"] as const) chunked(`${c.id}|FORM_${rival}`, { kind: "FORM", combo: c.id, seed, rival }, z.form, 250);
  }
  return out;
}

async function runAll(jobs: readonly Tagged[], threads: number): Promise<VResult[]> {
  const results = new Array<VResult>(jobs.length);
  let next = 0;
  let done = 0;
  const step = Math.max(1, Math.floor(jobs.length / 10));
  await new Promise<void>((resolve, reject) => {
    let alive = 0;
    for (let t = 0; t < Math.min(threads, jobs.length); t++) {
      const w = new Worker(new URL("./worker.ts", import.meta.url));
      w.postMessage({ extra: CANDIDATES }); // las candidatas de ajuste se registran en cada hilo antes del primer trabajo
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

export function collect(jobs: readonly Tagged[], results: readonly VResult[]): Record<string, ComboData> {
  const groups = new Map<string, VResult[]>();
  jobs.forEach((j, i) => {
    const l = groups.get(j.slot);
    if (l) l.push(results[i]!);
    else groups.set(j.slot, [results[i]!]);
  });
  const data: Record<string, Record<string, unknown>> = {};
  for (const [slot, rs] of groups) {
    const [id, kind, pair] = slot.split("|") as [string, string, string | undefined];
    const d = (data[id] ??= {});
    if (kind === "C2") ((d["C2"] ??= {}) as Record<string, VResult>)[pair!] = mergeResults(rs);
    else d[kind] = mergeResults(rs);
  }
  for (const d of Object.values(data)) d["C1"] ??= emptyResult();
  return data as unknown as Record<string, ComboData>;
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
  for (const c of CANDIDATES) registerCombo(c.base, c.id, c.label, c.combat, c.moves, c.adjust);
  const mode = args.quick ? "rapido" : "completo";
  const dir = args.from ?? args.out ?? `sim/out/variantes/${mode}`;
  const official = !args.quick && args.out === undefined;
  if (args.from) {
    for (const f of writeVariantReports(readPhases(dir), dir, !dir.includes("rapido"))) console.log(`Informe: ${f}`);
    return;
  }
  const seed = args.seed ?? PHASE_SEED[args.phase];
  if (BURNED_SEEDS.some((b) => seed.startsWith(b))) throw new Error(`la semilla ${seed} ya se usó en un informe anterior`);
  for (const p of PHASES) if (PHASE_SEED[p] !== PHASE_SEED[args.phase] && seed.startsWith(PHASE_SEED[p])) throw new Error(`la semilla ${seed} es de la fase ${p}`);
  mkdirSync(dir, { recursive: true });
  let combos: Combo[];
  let kinds: readonly Kind[] = ["C1", "ESPEJO", "C2", "PROF", "FORM"];
  if (args.phase === "evaluar") combos = [...MAIN_COMBOS];
  else if (args.phase === "diagnostico") {
    combos = [...DIAG_COMBOS];
    kinds = ["C1", "C2"];
  }
  else if (args.phase === "elegir") {
    if (CANDIDATES.length === 0) throw new Error("no hay candidatas de ajuste declaradas en sim/variants/adjust.ts");
    combos = [...new Set(CANDIDATES.map((c) => c.base))].map(comboById).concat(CANDIDATES.map((c) => comboById(c.id)));
    kinds = ADJUST_KINDS;
  } else {
    const picked = readPhases(dir).elegir;
    if (!picked) throw new Error(`falta ${dir}/elegir.json: ejecuta antes --fase elegir`);
    const ch = chosenCandidate(picked);
    if (!ch) throw new Error("ninguna candidata cumple la regla de elección: no hay nada que validar");
    combos = [comboById(ch.base), comboById(ch.id)];
  }
  checkCombos(combos);
  const z = sizesFor(args.quick, args.phase);
  const jobs = jobsFor(combos, seed, z, kinds);
  console.log(`Variantes v0.3, fase ${args.phase}, modo ${mode}: ${combos.length} combinaciones, ${jobs.length} trabajos, semilla ${seed}, ${args.threads} hilos`);
  const t0 = performance.now();
  const results = await runAll(jobs, args.threads);
  const elapsedSec = (performance.now() - t0) / 1000;
  const { commit, configSha } = provenance();
  const file: PhaseFile = {
    phase: args.phase,
    mode,
    seed,
    sizes: z,
    threads: args.threads,
    elapsedSec,
    commit,
    configSha,
    combos: combos.map((c) => ({ id: c.id, label: c.label, sha: comboSha(c), combat: { ...c.variant.combat }, moves: { ...c.variant.moves }, ...(c.adjust ? { adjust: c.adjust } : {}) })),
    data: collect(jobs, results),
  };
  writeFileSync(`${dir}/${args.phase}.json`, JSON.stringify(file));
  console.log(`Hecho en ${elapsedSec.toFixed(0)} s → ${dir}/${args.phase}.json`);
  if (args.report) for (const f of writeVariantReports(readPhases(dir), dir, official)) console.log(`Informe: ${f}`);
}

await main();
