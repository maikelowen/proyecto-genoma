/**
 * Simulador de la economía de progresión v0.1 con combate real (progresion-v0.1 §9). Uso:
 *   npm run sim:progresion -- [--quick] [--propuesta CONFIG [--semilla-propuesta P]] [--partidas N] [--semilla PREFIJO] [--config RUTA] [--hilos N] [--out DIR] [--informe RUTA] [--perfiles a,b] [--informe-desde DIR]
 * Juega N partidas por perfil (sesiones de 6 combates, hasta nivel 30 o el tope de combates) y escribe <out>/progresion.json y el informe desde esos datos.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { Worker } from "node:worker_threads";
import { createHash } from "node:crypto";
import { PROFILES, loadCfg, PROG_PATH, type GameResult, type Profile } from "./modelo.ts";
import type { Batch } from "./lote.ts";
import { buildReport, type Data } from "./informe.ts";

/** Semillas ya usadas para elegir números de esta economía (ninguna: la spec reserva `prog01` para medir). */
const BURNED = ["genoma", "combate01", "elige01", "valida01", "explora02", "elige02", "valida02", "valida03", "valida04", "base04", "elige03", "prof01", "var03", "v05"];

function commit(): string {
  try {
    const head = readFileSync(".git/HEAD", "utf8").trim();
    if (!head.startsWith("ref: ")) return head.slice(0, 7);
    const ref = head.slice(5);
    try { return readFileSync(`.git/${ref}`, "utf8").trim().slice(0, 7); } catch {
      const l = readFileSync(".git/packed-refs", "utf8").split("\n").find((x) => x.endsWith(` ${ref}`));
      return l ? l.split(" ")[0]!.slice(0, 7) : "desconocido";
    }
  } catch { return "desconocido"; }
}
const sha = (...files: string[]): string => createHash("sha256").update(JSON.stringify(files.map((f) => readFileSync(f, "utf8")))).digest("hex").slice(0, 12);

interface Args { quick: boolean; n?: number; seed?: string; config: string; threads: number; out: string; report: string; profiles: Profile[]; from?: string; proposal?: string; seedProposal: string }
function parseArgs(argv: readonly string[]): Args {
  const a: Args = { quick: false, config: PROG_PATH, threads: 4, out: "sim/out/progresion", report: "docs/informes/progresion-v0.1.md", profiles: [...PROFILES], seedProposal: "prog03" };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i]!;
    if (k === "--quick") a.quick = true;
    else if (k === "--partidas") a.n = Number(argv[++i]);
    else if (k === "--semilla") a.seed = argv[++i]!;
    else if (k === "--config") a.config = argv[++i]!;
    else if (k === "--hilos") a.threads = Number(argv[++i]);
    else if (k === "--out") a.out = argv[++i]!;
    else if (k === "--informe") a.report = argv[++i]!;
    else if (k === "--perfiles") a.profiles = argv[++i]!.split(",") as Profile[];
    else if (k === "--propuesta") a.proposal = argv[++i]!;
    else if (k === "--semilla-propuesta") a.seedProposal = argv[++i]!;
    else if (k === "--informe-desde") a.from = argv[++i]!;
    else throw new Error(`argumento desconocido: ${k}`);
  }
  return a;
}

async function run(batches: readonly Batch[], threads: number): Promise<GameResult[][]> {
  const res = new Array<GameResult[]>(batches.length);
  let next = 0, done = 0, alive = 0;
  await new Promise<void>((resolve, reject) => {
    for (let t = 0; t < Math.min(threads, batches.length); t++) {
      const w = new Worker(new URL("./worker.ts", import.meta.url));
      alive++;
      let cur = -1;
      const feed = (): void => {
        if (next >= batches.length) { void w.terminate(); if (--alive === 0) resolve(); return; }
        cur = next++;
        w.postMessage(batches[cur]);
      };
      w.on("message", (r: GameResult[]) => { res[cur] = r; if (++done % 10 === 0 || done === batches.length) console.log(`  ${done}/${batches.length} lotes`); feed(); });
      w.on("error", reject);
      feed();
    }
  });
  return res;
}

const args = parseArgs(process.argv.slice(2));
mkdirSync(args.out, { recursive: true });
async function simulate(config: string, prefix: string): Promise<{ meta: Data["meta"]; results: Record<string, GameResult[]>; raw: any }> {
  const { raw } = loadCfg(config);
  const es = raw.escenarios_sim;
  if (BURNED.some((b) => prefix === b || prefix.startsWith(b + "-"))) throw new Error(`la semilla '${prefix}' ya se usó para elegir números: usa otra`);
  const n = args.n ?? (args.quick ? 24 : es.partidas);
  const maxCombats = args.quick ? 60 : 120;
  const t0 = performance.now();
  const batches: Batch[] = [];
  for (const profile of args.profiles) for (let f = 0; f < n; f += 10) batches.push({ prefix, profile, from: f, to: Math.min(n, f + 10), maxCombats, minCombats: es.sesiones * es.combates_por_sesion, config });
  const out = await run(batches, args.threads);
  const results: Record<string, GameResult[]> = {};
  batches.forEach((b, i) => ((results[b.profile] ??= []).push(...out[i]!)));
  const meta = { commit: commit(), configSha: sha(config, "config/combate.v0.5.json", "config/movimientos.v0.5.json", "config/genetica.v0.2.json"), configPath: config, prefix, partidas: n, maxCombats, mode: args.quick ? "rapido" : "completo", elapsedSec: Math.round((performance.now() - t0) / 1000), threads: args.threads };
  return { meta, results, raw };
}

/** Rutas de hoja que difieren entre dos JSON (para listar el cambio de la propuesta sin escribirlo a mano). */
function diffLeaves(a: any, b: any, path = ""): string[] {
  if (typeof a === "object" && a !== null && typeof b === "object" && b !== null && !Array.isArray(a)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].filter((k) => !k.startsWith("_")).flatMap((k) => diffLeaves(a[k], b[k], path ? `${path}.${k}` : k));
  }
  if (Array.isArray(a) && Array.isArray(b) && a.some((x: any) => typeof x === "object")) return a.flatMap((x: any, i: number) => diffLeaves(x, b[i], `${path}[${x?.id ?? i}]`));
  return JSON.stringify(a) === JSON.stringify(b) ? [] : [`${path}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`];
}

let data: Data;
if (args.from) data = JSON.parse(readFileSync(`${args.from}/progresion.json`, "utf8"));
else {
  const base = await simulate(args.config, args.seed ?? loadCfg(args.config).raw.escenarios_sim.semilla_prefijo);
  data = { meta: base.meta, criteria: base.raw.criterios_sim, sim: base.raw.escenarios_sim, results: base.results };
  if (args.proposal) {
    const p = await simulate(args.proposal, args.seedProposal);
    data = { ...data, proposal: { meta: p.meta, results: p.results, diff: diffLeaves(base.raw, p.raw), note: String(p.raw._propuesta ?? "") } };
  }
  writeFileSync(`${args.out}/progresion.json`, JSON.stringify(data));
}
const md = buildReport(data);
writeFileSync(args.report, md);
console.log(`informe: ${args.report} (${data.meta.elapsedSec} s)`);
