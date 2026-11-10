/**
 * CLI del simulador de combate v0.2. Uso:
 *   npm run sim:combat -- [--patch config/propuestas/X.json] [--quick] [--semilla P] [--partidas N]
 *                         [--hilos N] [--out DIR] [--sin-informe] [--informe-desde DIR]
 * Sin --patch evalúa la v0.2 base; con --patch, la base y la propuesta con las mismas semillas.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { sha256, toCsv } from "../genetics/csv.ts";
import type { Row } from "../genetics/engine.ts";
import { duration, moveCriteria, setStudyCriteria, type Criterion } from "./analysis.ts";
import { merge } from "./jobs.ts";
import { runJobs } from "./pool.ts";
import { writeReports } from "./report.ts";
import { BASE_VARIANT, loadProposal, type Proposal } from "./setup.ts";
import { CHOOSING_SEEDS, DEFAULT_SEED, Groups, makePlan, phase1Jobs, phase2Jobs, summarize, type TaggedJob } from "./study.ts";

interface Args {
  quick: boolean;
  patch?: string;
  seed?: string;
  c1PerSeed?: number;
  threads: number;
  out?: string;
  report: boolean;
  fromJson?: string;
}

class HelpShown extends Error {}

const HELP = `Simulador de combate v0.2 (Proyecto Genoma)
  --patch F        fichero de propuesta (config/propuestas/*.json): evalúa base y propuesta
  --quick          ejecución reducida (< 30 s) para depurar; no sirve para concluir
  --semilla P      prefijo de semillas de evaluación (por defecto "${DEFAULT_SEED}"; no uses ${CHOOSING_SEEDS.join("/")}: con ellas se eligió)
  --partidas N     combates por semilla en C1 (completo: 2000)
  --hilos N        procesos en paralelo (por defecto 2)
  --out DIR        carpeta de salida (por defecto sim/out/combate-v0.2/<modo>)
  --sin-informe    no genera el informe HTML/MD
  --informe-desde DIR  regenera el informe desde DIR/resumen.json sin simular
Búsqueda de sales (movimientos §5.2): node sim/combat/search.ts --patch F [--semilla elige02]`;

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
      case "--patch":
        a.patch = val();
        break;
      case "--semilla":
        a.seed = val();
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

const critRow = (scope: string, c: Criterion): Row => ({ ambito: scope, criterio: c.id, grupo: c.group, descripcion: c.label, umbral: c.threshold, valor: c.value, ic95_lo: c.lo, ic95_hi: c.hi, semillas_ok: c.seedsOk ? `${c.seedsOk[0]}/${c.seedsOk[1]}` : "", resultado: (c.pass ? "aprobado" : "suspendido") + (c.fragile ? " (frágil)" : "") + (c.informative ? " [informativo]" : "") });

function loadSearch(dir: string): unknown[] {
  return ["busqueda.json", "busqueda-refinado.json", "busqueda-refinado-margen.json"].filter((f) => existsSync(`${dir}/${f}`)).map((f) => JSON.parse(readFileSync(`${dir}/${f}`, "utf8")));
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
    if (r.proposal) setStudyCriteria(r.proposal.criteria);
    // los criterios de movimientos se recalculan desde las filas guardadas (cambio de método sin volver a simular)
    for (const s of r.sums) s.crit = [...s.crit.filter((c: Criterion) => !c.id.startsWith("mov_")), ...moveCriteria(s.moves, s.valid)];
    const csv = toCsv(r.sums.flatMap((s: any) => s.crit.map((c: Criterion) => critRow(s.variant.id, c))));
    writeFileSync(`${args.fromJson}/criterios.csv`, csv);
    const hp = `${args.fromJson}/hashes.sha256`;
    if (existsSync(hp)) writeFileSync(hp, readFileSync(hp, "utf8").replace(/^\S+ {2}criterios\.csv$/m, `${sha256(csv)}  criterios.csv`));
    writeFileSync(`${args.fromJson}/resumen.json`, JSON.stringify(r, (_k, v) => (v === Infinity ? 1e308 : v === -Infinity ? -1e308 : v), 1));
    for (const p of writeReports({ ...r, outDir: args.fromJson })) console.log(`Informe: ${p}`);
    return;
  }
  const proposal: Proposal | null = args.patch ? loadProposal(args.patch) : null;
  if (proposal) setStudyCriteria(proposal.criteria);
  const plan = makePlan(args.quick, { ...(args.seed ? { seed: args.seed } : {}), ...(args.c1PerSeed ? { c1PerSeed: args.c1PerSeed } : {}) });
  if (CHOOSING_SEEDS.some((s) => plan.seed.startsWith(s))) throw new Error(`--semilla ${plan.seed}: con ese prefijo se eligió la propuesta (QA V-01: no se valida con las semillas con que se elige)`);
  const outDir = args.out ?? `sim/out/combate-v0.2/${plan.mode}`;
  mkdirSync(outDir, { recursive: true });
  const variants = proposal ? [BASE_VARIANT, proposal.variant] : [BASE_VARIANT];
  console.log(`Modo ${plan.mode}; semillas "${plan.seed}-*"; variantes: ${variants.map((v) => v.id).join(", ")}; ${args.threads} hilos`);

  const g = new Groups();
  await runPhase("Fase 1 (C1–C4 + sustitución, 1.ª tanda)", phase1Jobs(plan, variants), args.threads, g, t0);
  await runPhase("Fase 2 (sustitución, movimientos dudosos)", phase2Jobs(plan, variants, g), args.threads, g, t0);
  const sums = variants.map((v) => summarize(g, plan, v));

  // ---- CSV
  const hashes: string[] = [];
  const write = (name: string, rows: readonly Row[]): void => {
    const csv = toCsv(rows);
    writeFileSync(`${outDir}/${name}`, csv);
    hashes.push(`${sha256(csv)}  ${name}`);
  };
  const groupRows: Row[] = [];
  for (const [k, l] of [...g.map].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const [, kind, variant, seed, extra] = k.split("|");
    const a = merge(l);
    groupRows.push({ escenario: kind!, variante: variant!, semilla: seed!, grupo: extra ?? "", combates: a.n, victorias_X: a.xWins, victorias_Y: a.yWins, empates: a.draws, empates_tope: a.drawsCap, victorias_A: a.aWins, victorias_B: a.bWins, turnos_media: kind === "C1" ? duration(a).mean.value : "", usable: a.usable, usado: a.used });
  }
  write("grupos.csv", groupRows);
  write("movimientos.csv", sums.flatMap((s) => s.moves.map((m) => ({ variante: s.variant.id, clave: m.key, id: m.id, origen: m.source, coste: m.cost, arquetipo: m.archetype, combates: m.n, wr: m.wr.value, ic95_lo: m.wr.lo, ic95_hi: m.wr.hi, uso: m.use, veredicto: m.verdict, dudoso: m.uncertain ? "sí" : "no", descripcion: m.desc }))));
  write("criterios.csv", sums.flatMap((s) => s.crit.map((c) => critRow(s.variant.id, c))));
  writeFileSync(`${outDir}/hashes.sha256`, hashes.join("\n") + "\n");
  const elapsed = (performance.now() - t0) / 1000;
  const official = plan.mode === "completo" && !args.seed && !args.c1PerSeed && proposal !== null;
  const search = proposal ? loadSearch("sim/out/combate-v0.2/busqueda") : [];
  const results = { plan, sums, proposal: proposal ? { path: proposal.path, variant: proposal.variant, criteria: proposal.criteria } : null, search, elapsedSec: elapsed, official };
  writeFileSync(`${outDir}/resumen.json`, JSON.stringify(results, (_k, v) => (v === Infinity ? 1e308 : v === -Infinity ? -1e308 : v), 1));
  if (args.report) for (const p of writeReports({ ...results, outDir })) console.log(`Informe: ${p}`);

  console.log("\nCriterios:");
  for (const s of sums) for (const c of s.crit) console.log(`  ${s.variant.id.padEnd(10)} ${`${c.group}: ${c.label}`.padEnd(78)} ${(c.fmt === "pct" ? (c.value * 100).toFixed(1) + " %" : String(+c.value.toFixed(2))).padStart(8)}  ${c.pass ? "aprobado" : "SUSPENDIDO"}${c.fragile ? " (frágil)" : ""}`);
  console.log(`\nTotal: ${elapsed.toFixed(1)} s. Salida: ${outDir}/`);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? (e.stack ?? e.message) : e);
  process.exitCode = 1;
});
