/**
 * CLI del simulador de genética. Uso:
 *   npm run sim -- [--quick] [--semillas N] [--semilla PREFIJO] [--generaciones N]
 *                  [--poblacion N] [--barrido id,id|todos] [--config id,id]
 *                  [--escenario E1,E2,E3a,E3a_control,E3b,E3c,E4,E5] [--estrategia id]
 *                  [--hilos N] [--out DIR] [--sin-informe]
 * Barridos (spec v0.2, presupuesto ajustado): v02, afinidad, arreglo_*.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { toCsv, sha256 } from "./csv.ts";
import type { Row } from "./engine.ts";
import { writeReports } from "./report.ts";
import {
  evaluateCriteria,
  experiments,
  makePlan,
  DEFAULT_SEED_PREFIX,
  runDeterminism,
  runKey,
  seedsFor,
  V01_SEED_PREFIX,
  summarize,
  type Experiment,
  type ScenarioId,
  type ScenarioRun,
  type VariantSummary,
} from "./runner.ts";
import { runJobs, type Job } from "./pool.ts";
import { findStrategy, randomStrategy } from "./strategies.ts";

interface Args {
  quick: boolean;
  seeds?: number;
  seedPrefix: string;
  gens?: number;
  pop?: number;
  sweeps?: string[];
  configs?: string[];
  scenarios?: string[];
  strategy?: string;
  threads: number;
  out?: string;
  report: boolean;
}

function parseArgs(argv: readonly string[]): Args {
  const a: Args = { quick: false, seedPrefix: DEFAULT_SEED_PREFIX, threads: 2, report: true };
  const list = (s: string | undefined): string[] => (s ?? "").split(",").filter(Boolean);
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const val = (): string => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`falta valor para ${k}`);
      return v;
    };
    const int = (): number => {
      const n = Number(val());
      if (!Number.isInteger(n) || n <= 0) throw new Error(`${k} necesita un entero > 0`);
      return n;
    };
    switch (k) {
      case "--quick":
      case "--rapido":
        a.quick = true;
        break;
      case "--semillas":
        a.seeds = int();
        break;
      case "--semilla":
        a.seedPrefix = val();
        break;
      case "--generaciones":
        a.gens = int();
        break;
      case "--poblacion":
        a.pop = int();
        break;
      case "--barrido":
        a.sweeps = list(val());
        break;
      case "--config":
        a.configs = list(val());
        break;
      case "--escenario":
        a.scenarios = list(val());
        break;
      case "--estrategia":
        a.strategy = val();
        break;
      case "--hilos":
        a.threads = int();
        break;
      case "--out":
        a.out = val();
        break;
      case "--sin-informe":
        a.report = false;
        break;
      case "--help":
      case "-h":
        console.log(HELP);
        process.exitCode = 0;
        throw new HelpShown();
      default:
        throw new Error(`opción desconocida: ${k}\n${HELP}`);
    }
  }
  if (a.gens !== undefined && a.gens < 20) throw new Error("--generaciones debe ser ≥ 20 (la sorpresa se mide en gen 1–20)");
  return a;
}

class HelpShown extends Error {}

const HELP = `Simulador de genética v0.1 (Proyecto Genoma)
  --quick               ejecución reducida (<30 s): N=200, 40 gen, 2 semillas, E4 1000 ensayos
  --semillas N          nº de semillas por configuración (completo: 5)
  --semilla P           prefijo de semilla (semillas = P-1..P-N; por defecto "${DEFAULT_SEED_PREFIX}",
                        distinto del usado para elegir parámetros en v0.1, "${V01_SEED_PREFIX}")
  --generaciones N      generaciones de E1/E2 (≥20)
  --poblacion N         tamaño de población de E1/E2
  --barrido a,b|todos   v02 (config por defecto, todos los escenarios), afinidad (0,75 vs 0,5 en E1/E2), arreglo_* (si los hay)
  --config a,b          limita configuraciones (p. ej. v02)
  --escenario a,b       E1, E2, E3a, E3a_control, E3b, E3c, E4, E5
  --estrategia id       E1 con esa estrategia (azar, velocidad, purista, hibridas) sobre la config por defecto
  --hilos N             procesos en paralelo (por defecto 2)
  --out DIR             carpeta de salida (por defecto sim/out/<modo>)
  --sin-informe         no genera informe HTML/MD`;

function selectExperiments(a: Args): Experiment[] {
  let exps = experiments();
  if (a.strategy) {
    const s = findStrategy(a.strategy);
    const principal = exps[0] as Experiment;
    exps = [{ id: s.id === "azar" ? "v02" : `estrategia_${s.id}`, label: `Estrategia: ${s.label}`, variants: principal.variants, scenarios: ["E1"], strategy: s }];
  } else if (a.sweeps && !a.sweeps.includes("todos")) {
    const want = a.sweeps;
    const unknown = want.filter((w) => !exps.some((e) => e.id === w));
    if (unknown.length) throw new Error(`barrido desconocido: ${unknown.join(", ")}. Disponibles: ${exps.map((e) => e.id).join(", ")}`);
    exps = exps.filter((e) => want.includes(e.id));
  }
  return exps
    .map((e) => ({
      ...e,
      variants: a.configs ? e.variants.filter((v) => a.configs!.some((c) => v.id === c || v.id.startsWith(`${c}-`))) : e.variants,
      scenarios: a.scenarios ? e.scenarios.filter((s) => a.scenarios!.includes(s)) : e.scenarios,
    }))
    .filter((e) => e.variants.length > 0 && e.scenarios.length > 0);
}

async function main(): Promise<void> {
  const t0 = performance.now();
  let args: Args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    if (e instanceof HelpShown) return;
    throw e;
  }
  const plan = makePlan(args);
  if (args.seedPrefix === V01_SEED_PREFIX) console.log(`AVISO: "${V01_SEED_PREFIX}" son las semillas con las que se eligieron los parámetros en v0.1; para validar usa otras (QA S-02).`);
  const exps = selectExperiments(args);
  if (exps.length === 0) throw new Error("nada que ejecutar con esos filtros");
  const outDir = args.out ?? `sim/out/${plan.mode}`;
  mkdirSync(outDir, { recursive: true });

  const jobs: Job[] = [];
  for (const e of exps) for (const v of e.variants) for (const sc of e.scenarios) for (const seed of seedsFor(plan, sc)) jobs.push({ expId: e.id, strategyId: e.strategy.id, variant: v, scenario: sc, seed, plan, scenariosOfExp: e.scenarios });
  console.log(`Modo ${plan.mode}: ${exps.length} barridos, ${jobs.length} ejecuciones, semillas ${plan.seeds.join(" ")}, ${args.threads} hilos`);

  // Deduplicación: ejecuciones idénticas (misma config efectiva, escenario, estrategia y semilla) se calculan una vez.
  const keys = jobs.map((j) => runKey(j.strategyId, j.variant, j.scenario, j.seed));
  const uniqueIdx = new Map<string, number>();
  const unique: Job[] = [];
  keys.forEach((k, i) => {
    if (!uniqueIdx.has(k)) {
      uniqueIdx.set(k, unique.length);
      unique.push(jobs[i] as Job);
    }
  });
  console.log(`  ${unique.length} ejecuciones únicas (${jobs.length - unique.length} reutilizadas)`);
  const uniqueRuns = await runJobs(unique, args.threads, (done, total) => {
    if (done === total || done % Math.max(1, Math.ceil(total / 10)) === 0) console.log(`  ${done}/${total} ejecuciones (${((performance.now() - t0) / 1000).toFixed(0)} s)`);
  });
  const runs: ScenarioRun[] = jobs.map((j, i) => {
    const r = uniqueRuns[uniqueIdx.get(keys[i] as string) as number] as ScenarioRun;
    if (r.experiment === j.expId && r.variant.id === j.variant.id) return r;
    return { ...r, experiment: j.expId, variant: j.variant, rows: r.rows.map((row) => ({ ...row, config: j.variant.id })) };
  });
  const tRuns = performance.now();

  // CSV por (barrido, escenario, config): todas las semillas juntas.
  const hashes: string[] = [];
  const summaries: VariantSummary[] = [];
  for (const e of exps) {
    mkdirSync(`${outDir}/${e.id}`, { recursive: true });
    for (const v of e.variants) {
      const mine = runs.filter((r) => r.experiment === e.id && r.variant.id === v.id);
      for (const sc of e.scenarios) {
        const rows: Row[] = mine.filter((r) => r.scenario === sc).flatMap((r) => r.rows);
        const csv = toCsv(rows);
        const name = `${e.id}/${sc}__${v.id}.csv`;
        writeFileSync(`${outDir}/${name}`, csv);
        hashes.push(`${sha256(csv)}  ${name}`);
      }
      summaries.push(summarize({ ...e, strategy: e.strategy ?? randomStrategy }, v, mine));
    }
  }
  writeFileSync(`${outDir}/hashes.sha256`, hashes.join("\n") + "\n");

  // Resumen de criterios
  const critRows: Row[] = [];
  for (const s of summaries) {
    for (const c of evaluateCriteria(s)) {
      critRows.push({
        barrido: s.experiment,
        config: s.variant.id,
        criterio: c.id,
        grupo: c.group,
        descripcion: c.label,
        umbral: c.threshold,
        valor: c.value,
        ic95_lo: c.ci ? c.ci.lo : "",
        ic95_hi: c.ci ? c.ci.hi : "",
        semillas_ok: c.seedsPass ? `${c.seedsPass[0]}/${c.seedsPass[1]}` : "",
        resultado: (c.pass ? (c.fragile ? "aprobado (frágil)" : "aprobado") : c.fragile ? "suspendido (frágil)" : "suspendido") + (c.informative ? " [informativo]" : ""),
      });
    }
  }
  writeFileSync(`${outDir}/resumen-criterios.csv`, toCsv(critRows));

  const det = runDeterminism(plan, toCsv);
  const violations = runs.reduce((s, r) => s + r.violations, 0);
  const samples = runs.flatMap((r) => r.violationSamples).slice(0, 5);
  const elapsed = (performance.now() - t0) / 1000;
  writeFileSync(
    `${outDir}/resumen.json`,
    JSON.stringify({ plan, determinismo: det, violaciones: violations, muestras_violaciones: samples, summaries }, (_k, v) => (v === Infinity ? "inf" : v), 1),
  );

  console.log(`Simulación: ${((tRuns - t0) / 1000).toFixed(1)} s. Violaciones de invariantes: ${violations}.`);
  console.log(
    `Determinismo: re-ejecución hash ${det.rerunHashEqual ? "igual" : "DISTINTO"}, CSV ${det.rerunCsvEqual ? "igual" : "DISTINTO"}; otra semilla ${det.differentSeedDiffers ? "distinta" : "IGUAL"}; pareado 2 % vs 3 %: ${det.pairedIdentical}/${det.pairedCompared} crías idénticas.`,
  );
  if (args.report) {
    const paths = writeReports({ plan, summaries, det, violations, elapsedSec: elapsed, outDir, runs, fullSet: !args.sweeps && !args.configs && !args.scenarios && !args.strategy && !args.gens && !args.pop && !args.seeds });
    for (const p of paths) console.log(`Informe: ${p}`);
  }
  // Tabla breve en consola
  console.log("\nCriterios: barrido/config  aprobados/total (sin informativos)  suspendidos");
  for (const s of summaries) {
    const cs = evaluateCriteria(s).filter((c) => !c.informative);
    console.log(`  ${`${s.experiment}/${s.variant.id}`.padEnd(18)} ${cs.filter((c) => c.pass).length}/${cs.length}  ${cs.filter((c) => !c.pass).map((c) => c.id).join(" ")}`);
  }
  console.log(`\nTotal: ${((performance.now() - t0) / 1000).toFixed(1)} s. Salida: ${outDir}/`);
}

export type { ScenarioId, ScenarioRun };
main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
