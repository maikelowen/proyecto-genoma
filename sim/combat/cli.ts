/**
 * CLI del simulador de combate v0.1. Uso:
 *   npm run sim:combat -- [--quick] [--semilla P] [--elegir P] [--validar P] [--partidas N]
 *                         [--hilos N] [--out DIR] [--sin-informe]
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { sha256, toCsv } from "../genetics/csv.ts";
import type { Row } from "../genetics/engine.ts";
import { duration } from "./analysis.ts";
import { runJobs } from "./pool.ts";
import { writeReports } from "./report.ts";
import {
  candidateSummaries,
  chooseVariant,
  familyDiagVariants,
  familyRatesOf,
  DEFAULT_CHOOSE_SEED,
  DEFAULT_SEED,
  DEFAULT_VALIDATE_SEED,
  Groups,
  makePlan,
  moveRows,
  moveSummary,
  phase1Jobs,
  phase2Jobs,
  scenarioSummary,
  type TaggedJob,
} from "./study.ts";
import { BASE_VARIANT, RAW_COMBAT } from "./setup.ts";
import { merge } from "./jobs.ts";

interface Args {
  quick: boolean;
  seed?: string;
  choose?: string;
  validate?: string;
  c1PerSeed?: number;
  threads: number;
  out?: string;
  report: boolean;
  /** Regenera el informe desde resumen.json de esa carpeta, sin simular. */
  fromJson?: string;
}

class HelpShown extends Error {}

const HELP = `Simulador de combate v0.1 (Proyecto Genoma)
  --quick          ejecución reducida (< 30 s) para depurar; no sirve para concluir
  --semilla P      prefijo de semillas de la evaluación de v0.1 (por defecto "${DEFAULT_SEED}")
  --elegir P       prefijo con el que se eligen las candidatas de arreglo (por defecto "${DEFAULT_CHOOSE_SEED}")
  --validar P      prefijo con el que se valida la elegida (por defecto "${DEFAULT_VALIDATE_SEED}"; distinto de --elegir)
  --partidas N     combates por semilla en C1 (completo: 4000)
  --hilos N        procesos en paralelo (por defecto 2)
  --out DIR        carpeta de salida (por defecto sim/out/combate/<modo>)
  --sin-informe    no genera el informe HTML/MD
  --informe-desde DIR  regenera el informe desde DIR/resumen.json sin simular`;

function parseArgs(argv: readonly string[]): Args {
  const a: Args = { quick: false, threads: 2, report: true };
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
      case "--semilla":
        a.seed = val();
        break;
      case "--elegir":
        a.choose = val();
        break;
      case "--validar":
        a.validate = val();
        break;
      case "--partidas":
        a.c1PerSeed = int();
        break;
      case "--hilos":
        a.threads = int();
        break;
      case "--out":
        a.out = val();
        break;
      case "--informe-desde":
        a.fromJson = val();
        break;
      case "--sin-informe":
        a.report = false;
        break;
      case "--help":
      case "-h":
        console.log(HELP);
        throw new HelpShown();
      default:
        throw new Error(`opción desconocida: ${k}\n${HELP}`);
    }
  }
  return a;
}

async function runPhase(name: string, tjs: readonly TaggedJob[], threads: number, g: Groups, t0: number): Promise<void> {
  const battles = tjs.reduce((s, t) => s + t.job.to - t.job.from, 0);
  console.log(`${name}: ${tjs.length} trabajos, ${battles.toLocaleString("es")} combates`);
  const rs = await runJobs(
    tjs.map((t) => t.job),
    threads,
    (done, total) => {
      if (done === total || done % Math.max(1, Math.ceil(total / 10)) === 0) console.log(`  ${done}/${total} (${((performance.now() - t0) / 1000).toFixed(0)} s)`);
    },
  );
  rs.forEach((r, i) => g.add(tjs[i]!, r));
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
  if (args.fromJson) {
    const r = JSON.parse(readFileSync(`${args.fromJson}/resumen.json`, "utf8"), (_k, v) => (v === null ? NaN : v));
    for (const p of writeReports({ ...r, outDir: args.fromJson, official: r.plan.mode === "completo" && r.official === true })) console.log(`Informe: ${p}`);
    return;
  }
  const plan = makePlan(args.quick, { ...(args.seed ? { seed: args.seed } : {}), ...(args.choose ? { choose: args.choose } : {}), ...(args.validate ? { validate: args.validate } : {}), ...(args.c1PerSeed ? { c1PerSeed: args.c1PerSeed } : {}) });
  if (plan.chooseSeed === plan.validateSeed || plan.seed === plan.validateSeed) throw new Error("--validar debe ser distinto de --elegir y de --semilla (QA V-01: no se valida con las semillas con que se elige)");
  const outDir = args.out ?? `sim/out/combate/${plan.mode}`;
  mkdirSync(outDir, { recursive: true });
  console.log(`Modo ${plan.mode}; semillas: v0.1 "${plan.seed}-*", elegir "${plan.chooseSeed}-*", validar "${plan.validateSeed}-*"; ${args.threads} hilos`);

  const g = new Groups();
  await runPhase("Fase 1 (v0.1 + candidatas)", phase1Jobs(plan), args.threads, g, t0);
  const cands = candidateSummaries(g, plan);
  const choice = chooseVariant(cands);
  console.log(`Candidata elegida con "${plan.chooseSeed}": ${choice.chosen.variant.id}${choice.allPass ? "" : " (ninguna aprobaba todo)"}`);
  await runPhase("Fase 2 (movimientos dudosos + validación)", phase2Jobs(plan, g, choice.chosen.variant), args.threads, g, t0);

  const betas = plan.c3.map((c) => c.beta);
  const beta0 = RAW_COMBAT.estadisticas.beta_calidad as number;
  const base = scenarioSummary(g, "base", BASE_VARIANT, plan.seed, plan.c1Seeds, betas, plan.c4Reserves);
  const val = scenarioSummary(g, "validar", choice.chosen.variant, plan.validateSeed, plan.val.c1Seeds, [beta0], plan.c4Reserves);
  const famDiag = familyDiagVariants(choice.chosen.variant).map((d) => ({ id: d.variant.id, label: d.label, rates: familyRatesOf(g, "elegir", d.variant.id) }));
  const moves = moveRows(g, plan);
  const ms = moveSummary(moves);

  // ---- CSV
  const hashes: string[] = [];
  const write = (name: string, rows: readonly Row[]): void => {
    const csv = toCsv(rows);
    writeFileSync(`${outDir}/${name}`, csv);
    hashes.push(`${sha256(csv)}  ${name}`);
  };
  const groupRows: Row[] = [];
  const histRows: Row[] = [];
  for (const [k, l] of [...g.map].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const [phase, kind, variant, seed, extra] = k.split("|");
    const a = merge(l);
    const d = duration(a);
    groupRows.push({ fase: phase!, escenario: kind!, variante: variant!, semilla: seed!, grupo: extra ?? "", combates: a.n, victorias_X: a.xWins, victorias_Y: a.yWins, empates: a.draws, empates_tope: a.drawsCap, victorias_A: a.aWins, victorias_B: a.bWins, turnos_media: d.mean.value, usable: a.usable, usado: a.used });
    if (kind === "C1") a.turnsHist.forEach((c, t) => c && histRows.push({ fase: phase!, variante: variant!, semilla: seed!, turnos: t, combates: c }));
  }
  write("grupos.csv", groupRows);
  write("c1-turnos.csv", histRows);
  write(
    "movimientos.csv",
    moves.map((m) => ({ clave: m.key, id: m.id, origen: m.source, nombre: m.name, coste: m.cost, arquetipo: m.archetype, estado: m.status, modificador: m.modifier, condicion: m.condition, combates: m.n, wr: m.wr.value, ic95_lo: m.wr.lo, ic95_hi: m.wr.hi, uso: m.use, veredicto: m.verdict, dudoso: m.uncertain ? "sí" : "no", uso_sospechoso: m.suspicious ? "sí" : "no", descripcion: m.desc })),
  );
  const critRows: Row[] = [];
  const pushCrit = (scope: string, cs: readonly import("./analysis.ts").Criterion[]): void => {
    for (const c of cs) critRows.push({ ambito: scope, criterio: c.id, grupo: c.group, descripcion: c.label, umbral: c.threshold, valor: c.value, ic95_lo: c.lo, ic95_hi: c.hi, semillas_ok: c.seedsOk ? `${c.seedsOk[0]}/${c.seedsOk[1]}` : "", resultado: (c.pass ? "aprobado" : "suspendido") + (c.fragile ? " (frágil)" : "") + (c.informative ? " [informativo]" : "") });
  };
  pushCrit("v0.1", [...base.c1, base.init, ...base.familyCrit, ...base.qualityCrit, ...base.energyCrit, ...ms.crit, ms.arch]);
  for (const c of cands) pushCrit(`elegir:${c.variant.id}`, c.c1);
  pushCrit(`validar:${choice.chosen.variant.id}`, [...val.c1, val.init, ...val.familyCrit, ...val.qualityCrit, ...val.energyCrit]);
  write("criterios.csv", critRows);
  writeFileSync(`${outDir}/hashes.sha256`, hashes.join("\n") + "\n");
  const elapsed = (performance.now() - t0) / 1000;
  const official = plan.mode === "completo" && !args.seed && !args.choose && !args.validate && !args.c1PerSeed;
  const results = { plan, base, val, cands, choice: { id: choice.chosen.variant.id, allPass: choice.allPass }, moves, moveSummary: ms, famDiag, elapsedSec: elapsed, official };
  writeFileSync(`${outDir}/resumen.json`, JSON.stringify(results, (_k, v) => (v === Infinity ? 1e308 : v === -Infinity ? -1e308 : v), 1));

  if (args.report) for (const p of writeReports({ ...results, outDir })) console.log(`Informe: ${p}`);

  console.log("\nCriterios (v0.1):");
  for (const r of critRows.filter((r) => r["ambito"] === "v0.1" || String(r["ambito"]).startsWith("validar"))) console.log(`  ${String(r["ambito"]).padEnd(20)} ${String(r["descripcion"]).padEnd(58)} ${String(r["valor"]).slice(0, 7).padStart(7)}  ${r["resultado"]}`);
  console.log(`\nTotal: ${elapsed.toFixed(1)} s. Salida: ${outDir}/`);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.stack ?? e.message : e);
  process.exitCode = 1;
});
