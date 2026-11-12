/**
 * Medida de profundidad del combate (punto A del consultor): IA con búsqueda
 * contra la mejor IA de reglas. Si la búsqueda no gana más del 60 %, el combate es superficial.
 *   npm run sim:profundidad -- [--partidas N] [--extra N] [--hilos N] [--semilla P]
 * Escribe sim/out/profundidad/resumen.json y docs/informes/profundidad-v0.1.md (todo sale de los datos).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { createBattle, createReferenceAi, createRng, createSearchAi, runBattle, type Ai, type ReferenceAiOptions, type SearchAiOptions } from "../../packages/core/src/index.ts";
import { winRate, type Interval } from "../combat/analysis.ts";
import { provenance } from "../combat/report.ts";
import { BASE_VARIANT, battleConfig, RAW_COMBAT, wildTeam } from "../combat/setup.ts";
import { runDepthJob, type DepthJob, type DepthResult } from "./games.ts";
import { Worker } from "node:worker_threads";

/** Semillas con las que se ajustó la IA (no valen para medir). */
const TUNING_SEEDS = ["tune1", "tune2"];
const THRESHOLD = 0.6;
const CHUNK = 20;

interface Args {
  games: number;
  extra: number;
  threads: number;
  seed: string;
}

function parseArgs(argv: readonly string[]): Args {
  const a: Args = { games: 800, extra: 400, threads: 2, seed: "prof01" };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[++i];
    if (v === undefined) throw new Error(`falta valor para ${k}`);
    if (k === "--semilla") {
      if (TUNING_SEEDS.some((t) => v.startsWith(t))) throw new Error(`la semilla ${v} se usó para ajustar la IA`);
      a.seed = v;
      continue;
    }
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0) throw new Error(`${k} necesita un entero ≥ 0`);
    if (k === "--partidas") a.games = n;
    else if (k === "--extra") a.extra = n;
    else if (k === "--hilos") a.threads = Math.max(1, n);
    else throw new Error(`opción desconocida: ${k}`);
  }
  if (a.games < 400 || a.games % 2 !== 0) throw new Error("--partidas debe ser par y ≥ 400");
  if (a.extra % 2 !== 0) throw new Error("--extra debe ser par");
  return a;
}

async function runAll(jobs: readonly DepthJob[], threads: number): Promise<DepthResult[]> {
  const results = new Array<DepthResult>(jobs.length);
  let next = 0;
  let done = 0;
  await new Promise<void>((resolve, reject) => {
    let alive = 0;
    for (let t = 0; t < Math.min(threads, jobs.length); t++) {
      const w = new Worker(new URL("./worker.ts", import.meta.url));
      alive++;
      let cur = -1;
      const feed = (): void => {
        if (next >= jobs.length) {
          void w.terminate();
          if (--alive === 0) resolve();
          return;
        }
        cur = next++;
        w.postMessage(jobs[cur]);
      };
      w.on("message", (r: DepthResult) => {
        results[cur] = r;
        if (++done % 10 === 0 || done === jobs.length) console.log(`  ${done}/${jobs.length} bloques`);
        feed();
      });
      w.on("error", reject);
      feed();
    }
  });
  return results;
}

function sum(rs: readonly DepthResult[]): DepthResult {
  const t: DepthResult = { n: 0, wins: 0, draws: 0, turns: 0, decisions: 0, differs: 0 };
  for (const r of rs) for (const k of Object.keys(t) as (keyof DepthResult)[]) t[k] += r[k];
  return t;
}

async function measure(prefix: string, games: number, search: SearchAiOptions, rival: ReferenceAiOptions, threads: number): Promise<DepthResult> {
  const jobs: DepthJob[] = [];
  for (let f = 0; f < games; f += CHUNK) jobs.push({ prefix, from: f, to: Math.min(games, f + CHUNK), search, rival });
  return sum(await runAll(jobs, threads));
}

/** Tiempo por decisión (un hilo, sin otros procesos de la medida): solo aquí se usa el reloj, nunca dentro de la IA. */
function timing(prefix: string, games: number): { n: number; mean: number; p95: number; max: number } {
  const cfg = battleConfig(BASE_VARIANT);
  const search = createSearchAi();
  const times: number[] = [];
  const timed: Ai = (st, side, c) => {
    const t0 = performance.now();
    const p = search(st, side, c);
    times.push(performance.now() - t0);
    return p;
  };
  const warm = wildTeam(createRng("calentamiento"), cfg, "w");
  for (let i = 0; i < 5; i++) search(createBattle(warm, warm, cfg), "A", cfg); // calentamiento del JIT
  for (let i = 0; i < games; i++) {
    const team = wildTeam(createRng(`${prefix}|tiempo|${i}`), cfg, "t");
    runBattle(team, team, `${prefix}|tiempo|${i}`, cfg, i % 2 === 0 ? timed : createReferenceAi(), i % 2 === 0 ? createReferenceAi() : timed);
  }
  times.sort((a, b) => a - b);
  const mean = times.reduce((s, x) => s + x, 0) / times.length;
  return { n: times.length, mean, p95: times[Math.floor(0.95 * (times.length - 1))] as number, max: times[times.length - 1] as number };
}

const pct = (x: number): string => `${(x * 100).toLocaleString("es", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
const ivp = (i: Interval): string => `${pct(i.value)} (IC 95 % ${pct(i.lo)}–${pct(i.hi)})`;
const ms = (x: number): string => `${x.toLocaleString("es", { maximumFractionDigits: 0 })} ms`;

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const t0 = performance.now();
  const kappa = (RAW_COMBAT.ia as Record<string, unknown>)["kappa"];
  const best: ReferenceAiOptions = {}; // reserva 0 y κ de la config: la mejor IA de reglas (informe combate v0.2, C4)
  const unmodeled: ReferenceAiOptions = { reserve: 3 }; // no está en el modelo del rival de la búsqueda
  console.log(`Profundidad: ${args.games} partidas contra la mejor IA de reglas (semilla ${args.seed}, ${args.threads} hilos)`);
  const main = await measure(`${args.seed}|mejor`, args.games, {}, best, args.threads);
  let extra: DepthResult | null = null;
  if (args.extra > 0) {
    console.log(`Control: ${args.extra} partidas contra una IA de reglas fuera del modelo (reserva 3)`);
    extra = await measure(`${args.seed}|fuera`, args.extra, {}, unmodeled, args.threads);
  }
  console.log("Tiempo por decisión (1 hilo)…");
  const time = timing(args.seed, 10);
  const elapsed = (performance.now() - t0) / 1000;

  const wr = winRate(main.wins, main.draws, main.n);
  const wrX = extra ? winRate(extra.wins, extra.draws, extra.n) : null;
  const verdict = wr.lo > THRESHOLD ? "supera" : wr.hi < THRESHOLD ? "no supera" : "no se puede afirmar (el IC cruza el umbral)";
  const { commit, configSha } = provenance();
  const out = "sim/out/profundidad";
  mkdirSync(out, { recursive: true });
  writeFileSync(`${out}/resumen.json`, JSON.stringify({ args, commit, configSha, main, extra, wr, wrX, time, elapsed }, null, 1));

  const md: string[] = [
    "# Profundidad del combate v0.1 — Proyecto Genoma",
    "",
    `Generado por \`npm run sim:profundidad\` desde el commit \`${commit}\` (más cambios locales si los hay), configs combate + movimientos + genética v0.2 sin cambios, huella sha256 \`${configSha}…\`. Semilla \`${args.seed}\`, ${args.threads} hilos, ${elapsed.toFixed(0)} s.`,
    "",
    "## Resultado",
    "",
    `- **IA con búsqueda contra la mejor IA de reglas: ${ivp(wr)}** en ${main.n.toLocaleString("es")} partidas (${main.wins} victorias, ${main.draws} empates; empate = ½).`,
    `- Criterio del consultor (> ${pct(THRESHOLD)}): **${verdict}**. ${wr.lo > THRESHOLD ? "Pensar más gana: el combate tiene profundidad que la IA de reglas no aprovecha." : "Pensar más apenas gana: el combate sería superficial con estas reglas."}`,
    wrX ? `- Control con un rival que la búsqueda no modela (IA de referencia con reserva 3): ${ivp(wrX)} en ${extra!.n} partidas. ${Math.abs(wrX.value - wr.value) < 0.05 ? "Similar: la ventaja no sale solo de conocer la política exacta del rival." : "Distinta: parte de la ventaja depende del modelo del rival."}` : "",
    `- La búsqueda eligió un plan distinto del de la IA de referencia en el ${pct(main.differs / main.decisions)} de sus ${main.decisions.toLocaleString("es")} decisiones. Duración media: ${(main.turns / main.n).toLocaleString("es", { maximumFractionDigits: 2 })} turnos.`,
    `- Tiempo por decisión con las opciones por defecto (Node, un hilo, ${time.n} decisiones): media ${ms(time.mean)}, p95 ${ms(time.p95)}, máx. ${ms(time.max)}. Objetivo: ≤ 400 ms en Node (≈ 800 ms en un navegador normal).`,
    "",
    "## Método",
    "",
    `- **Rival:** la mejor IA de reglas según \`docs/informes/combate-v0.2.md\` (C4): la de referencia con precio de la energía (κ = ${String(kappa)} de la config) y reserva 0, que es \`createReferenceAi()\` sin opciones (y la del cliente).`,
    "- **IA con búsqueda** (`createSearchAi()`, opciones por defecto: 24 simulaciones, horizonte 2, topK 3, 10 candidatos): candidatos = planes de la IA de referencia (κ de la config y κ = 0) + las mejores combinaciones de las 3 mejores acciones por criatura (heurística rápida, Σcoste ≤ energía); el rival se modela con la IA de referencia (κ de la config y κ = 0, alternando); cada candidato se juega 24 veces (turno actual + 1 turno con la IA de referencia en los dos lados) y se puntúa el estado (vida, escudo, criaturas vivas, estados y energía a su precio). Números aleatorios comunes entre candidatos.",
    "- **Honestidad:** la búsqueda no recibe el RNG de la partida; su azar sale de `createRng(\"search|bando|turno|hash del estado\")`. Un test comprueba que cambiar la semilla de la partida no cambia su decisión en el mismo estado.",
    "- **Equipos espejo:** el mismo equipo de 4 almas salvajes en los dos lados; cada equipo se juega dos veces con la misma semilla de partida, con la búsqueda en A y en B. IC 95 % normal sobre resultados 1 / ½ / 0.",
    `- **Semillas nuevas:** \`${args.seed}|…\`. La IA se ajustó (horizonte, simulaciones, peso de estar viva) con \`${TUNING_SEEDS.join("`, `")}\`, que la CLI no deja usar aquí.`,
    "",
    "## Limitaciones",
    "",
    "- En la medida principal el modelo del rival coincide con el rival real (la IA de referencia): es el mejor caso para la búsqueda. El control fuera del modelo acota cuánto depende de eso.",
    "- La búsqueda solo explora el turno actual; los turnos siguientes los juega la IA de referencia. Una IA más fuerte daría una cota más alta de la profundidad, no más baja.",
    "- Mide la profundidad contra IA, no contra personas: un humano experto no tiene por qué jugar como la IA de referencia.",
    "",
  ].filter((l, i, a) => l !== "" || a[i - 1] !== "");
  writeFileSync("docs/informes/profundidad-v0.1.md", md.join("\n"));
  console.log(`Búsqueda vs mejor IA de reglas: ${ivp(wr)} → ${verdict} el 60 %`);
  if (wrX) console.log(`Control fuera del modelo: ${ivp(wrX)}`);
  console.log(`Tiempo por decisión: media ${ms(time.mean)}, p95 ${ms(time.p95)}, máx. ${ms(time.max)}`);
  console.log("Informe: docs/informes/profundidad-v0.1.md");
}

await main();
