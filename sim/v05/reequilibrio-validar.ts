/**
 * Validación (semillas nuevas) de las sales de familias v0.5 y generación de docs/informes/combate-v0.5-reequilibrio.md.
 * Compara `ambas` (config/combate.v0.5.json, ambas) sin y con las sales de la búsqueda, con los mismos equipos y partidas (pareado).
 * Uso: node sim/v05/reequilibrio-validar.ts --busqueda sim/out/v05r/busqueda/busqueda.json [--semilla valida06] [--out DIR] [--hilos N] [--quick] [--informe-desde DIR]
 * Las sales se aplican como parche sobre movimientos.v0.4.json (equivale al fichero movimientos.v0.5.json, cuya huella se comprueba).
 */
process.env["SIM_COMBAT_CONFIG"] = "config/combate.v0.5.json";
process.env["SIM_MOVES_CONFIG"] = "config/movimientos.v0.4.json";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { Worker } from "node:worker_threads";
const { criteria, familyRates, fmtC, reachByFamily, tauntCatalogCount } = await import("../v04/analysis.ts");
const { allFamilies, effectiveRaw, variantSha, RAW_COMBAT, RAW_MOVES } = await import("../v04/setup.ts");
const { mergeResults } = await import("../v04/games.ts");
const { provenance } = await import("../combat/report.ts");
import type { ConfigData, Criterion } from "../v04/analysis.ts";
import type { Kind, VJob, VResult } from "../v04/games.ts";
import type { Variant } from "../v04/setup.ts";

const arg = (k: string, d?: string): string | undefined => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const quick = process.argv.includes("--quick");
const seed = arg("--semilla", "valida06")!;
const BURNED = ["genoma", "combate01", "elige01", "valida01", "explora02", "elige02", "valida02", "valida03", "prof01", "tune1", "tune2", "test-det", "var03", "test-var", "base04", "elige03", "valida04", "elige05", "valida05", "elige06", "v05", "miguelE3"];
if (BURNED.some((b) => seed.startsWith(b))) throw new Error(`semilla quemada: ${seed}`);
const threads = Number(arg("--hilos", "4"));
const z = quick ? { c1: 150, mirror: 40, c2: 3, depth: 4 } : { c1: 6000, mirror: 1000, c2: 300, depth: 400 };

const combat = RAW_COMBAT["escenarios_sim"].configs_v05.ambas as Record<string, unknown>;
const bsq = JSON.parse(readFileSync(arg("--busqueda", "sim/out/v05r/busqueda/busqueda.json")!, "utf8"));
const base: Variant = { id: "ambas", label: "ambas (sin sales nuevas)", combat, moves: {}, salts: {} };
const nuevo: Variant = { id: "ambas_sales", label: "ambas + sales v0.5", combat, moves: {}, salts: bsq.nuevas };

interface Task { v: Variant; slot: string; job: VJob }
function jobs(): Task[] {
  const t: Task[] = [];
  const fams = allFamilies();
  for (const v of [base, nuevo]) {
    const add = (slot: string, b: Omit<VJob, "from" | "to">, n: number, chunk: number): void => { for (let f = 0; f < n; f += chunk) t.push({ v, slot: `${v.id}|${slot}`, job: { ...b, from: f, to: Math.min(n, f + chunk) } }); };
    const b = { config: v.id, seed, paired: true };
    add("PROF", { ...b, kind: "PROF" as Kind }, z.depth, 20);
    add("C1", { ...b, kind: "C1" as Kind }, z.c1, 250);
    add("ESPEJO", { ...b, kind: "ESPEJO" as Kind }, z.mirror, 250);
    for (let i = 0; i < fams.length; i++) for (let j = i + 1; j < fams.length; j++) add(`C2|${fams[i]}|${fams[j]}`, { ...b, kind: "C2" as Kind, pair: [fams[i]!, fams[j]!] as never }, z.c2, 150);
  }
  return t;
}
async function run(tasks: Task[]): Promise<VResult[]> {
  const res = new Array<VResult>(tasks.length);
  let next = 0, done = 0;
  await new Promise<void>((resolve, reject) => {
    let alive = 0;
    for (let k = 0; k < threads; k++) {
      const w = new Worker(new URL("../v04/salts-worker.ts", import.meta.url));
      alive++;
      let cur = -1;
      const feed = (): void => { if (next >= tasks.length) { void w.terminate(); if (--alive === 0) resolve(); return; } cur = next++; w.postMessage({ v: tasks[cur]!.v, job: tasks[cur]!.job }); };
      w.on("message", (r: VResult) => { res[cur] = r; if (++done % 200 === 0) console.log(`  ${done}/${tasks.length}`); feed(); });
      w.on("error", reject);
      feed();
    }
  });
  return res;
}
function gather(tasks: Task[], rs: VResult[]): Record<string, ConfigData> {
  const g = new Map<string, VResult[]>();
  tasks.forEach((t, i) => (g.get(t.slot) ?? g.set(t.slot, []).get(t.slot)!).push(rs[i]!));
  const data: Record<string, any> = {};
  for (const [slot, l] of g) {
    const [id, kind, p, q] = slot.split("|") as [string, string, string?, string?];
    const d = (data[id] ??= {});
    if (kind === "C2") (d[kind] ??= {})[`${p}|${q}`] = mergeResults(l);
    else d[kind] = mergeResults(l);
  }
  return data as Record<string, ConfigData>;
}

const pct = (x: number): string => `${(x * 100).toFixed(1).replace(".", ",")} %`;
const verdict = (c: Criterion | undefined): string => (!c ? "—" : c.informative ? "informativo" : `${c.pass ? "aprobado" : "suspendido"}${c.fragile ? " (frágil)" : ""}`);
const iv = (c: Criterion): string => (c.hi > c.lo ? `${fmtC(c, c.value)} (${fmtC(c, c.lo)}–${fmtC(c, c.hi)})` : fmtC(c, c.value));

interface File { seed: string; quick: boolean; sizes: typeof z; elapsedSec: number; threads: number; bsq: any; data: Record<string, ConfigData>; commit: string; shas: { base: string; nuevo: string; fichero: string; combate: string }; salts: Record<string, string> }

function report(f: File): string {
  const K = RAW_COMBAT["criterios_sim"].v04 as Record<string, number>;
  const cb = criteria(base, f.data["ambas"]!), ca = criteria(nuevo, f.data["ambas_sales"]!);
  const find = (cs: Criterion[], id: string): Criterion | undefined => cs.find((c) => c.id === id);
  const rb = familyRates(f.data["ambas"]!.C2!), ra = familyRates(f.data["ambas_sales"]!.C2!);
  const inBand = (x: number): boolean => x >= K["familias_min"]! && x <= K["familias_max"]!;
  const outB = rb.filter((r) => !inBand(r.rate.value)).map((r) => r.family), outA = ra.filter((r) => !inBand(r.rate.value)).map((r) => r.family);
  const L: string[] = [];
  L.push("# Reequilibrio de familias para el combate v0.5 — Proyecto Genoma", "");
  L.push(`Generado por \`sim/v05/reequilibrio-buscar.ts\` (búsqueda) y \`sim/v05/reequilibrio-validar.ts\` (validación) desde el commit \`${f.commit}\` (más cambios locales si los hay). Huellas (sha256 de la config efectiva, 12 hex): combate \`config/combate.v0.5.json\` + \`ambas\` con movimientos v0.4 \`${f.shas.base}\`; con las sales \`${f.shas.nuevo}\`; fichero \`config/movimientos.v0.5.json\` ${f.shas.fichero}. Semillas: búsqueda \`${f.bsq.seed}\`, validación \`${f.seed}\` (nuevas, ni \`v05|\` ni las de v0.4). Modo ${f.quick ? "rápido" : "completo"}, ${Math.round(f.elapsedSec)} s con ${f.threads} hilos.`, "");
  L.push("## Resumen", "");
  const nSal = Object.keys(f.salts).length;
  L.push(`- Familias fuera de ${pct(K["familias_min"]!)}–${pct(K["familias_max"]!)} con \`ambas\` sin las sales: **${outB.length}** (${outB.join(", ") || "ninguna"}); con ${nSal} sales: **${outA.length}** (${outA.join(", ") || "ninguna"}), en validación con semillas nuevas.`);
  const worse = ca.filter((c) => !c.informative && !c.pass && cb.find((b) => b.id === c.id)?.pass).map((c) => c.id);
  L.push(`- ${worse.length ? `Criterios que empeoran (aprobaba y ya no): ${worse.join(", ")}.` : "Ningún criterio que aprobaba con `ambas` pasa a suspender con las sales."}`);
  L.push(`- Solo cambian sales de genes del catálogo (\`overrides_catalogo.sales\`); reglas, energía y vida no se tocan. Las sales viven en \`config/movimientos.v0.5.json\`; \`config/movimientos.v0.4.json\` queda intacto.`, "");
  L.push("## Sales", "", `Procedimiento (el de v0.4, \`sim/v04/salts.ts\`): cada ronda mide C2 de las 13 familias (${f.bsq.opts.nMeasure} combates por pareja); las familias base fuera de la banda de búsqueda (${pct(K["familias_min"]! + f.bsq.opts.margin)}–${pct(K["familias_max"]! - f.bsq.opts.margin)}), de la más alejada a la menos (máx. ${f.bsq.opts.perRound} por ronda), prueban cada gen de pago con c1…c4 respetando las cuotas del catálogo, con ${f.bsq.opts.nCandidate} combates por pareja y candidata, y se aplica la que más acerca la familia al 50 % (mejora ≥ 1 punto). Se permite sustituir sales existentes.`, "");
  L.push("| Ronda | Familia | Gen | Sal (antes → después) | Tasa antes → después (búsqueda) | Candidatas |", "|---|---|---|---|---|---|");
  for (const s of f.bsq.steps) for (const c of s.changes) L.push(`| ${s.round} | ${c.family} | \`${c.gene}\` | ${c.from ?? "—"} → ${c.to} | ${pct(c.before)} → ${pct(c.after)} | ${c.tried} |`);
  L.push("", `Sales aplicadas sobre el catálogo v0.4: ${Object.entries(f.salts).map(([g, s]) => `\`${g}\` = ${s}`).join(", ") || "ninguna"}.`, "");
  L.push("## Familias antes y después (validación, tasa contra las otras 12)", "", "| Familia | ambas sin sales | ambas con sales | En banda |", "|---|---|---|---|");
  rb.forEach((r, i) => { const x = ra[i]!; L.push(`| ${r.family} | ${pct(r.rate.value)}${inBand(r.rate.value) ? "" : " (fuera)"} | ${pct(x.rate.value)} (${pct(x.rate.lo)}–${pct(x.rate.hi)}) | ${inBand(x.rate.value) ? "sí" : "no"} |`); });
  L.push("", `${f.sizes.c2} combates por pareja (78 parejas), lados alternos, mismos equipos y partidas en las dos configuraciones.`, "");
  L.push("## Criterios (misma validación)", "", "| Criterio | Umbral | ambas sin sales | ambas con sales |", "|---|---|---|---|");
  for (const id of ["turnos", "p90", "empates", "gratis", "pagos", "primer_ko", "lider_t3", "profundidad", "alcance", "provocar", "familias"]) { const x = find(cb, id), y = find(ca, id); if (x && y) L.push(`| ${x.group}: ${x.label} | ${x.threshold} | ${iv(x)} · ${verdict(x)} | ${iv(y)} · ${verdict(y)} |`); }
  L.push("", `Tamaños: C1 ${f.sizes.c1}, espejo ${f.sizes.mirror}, profundidad ${f.sizes.depth} partidas por config. Colocación y tanque no se miden (como en el informe v0.5).`, "");
  const open = ca.filter((c) => !c.informative && !c.pass).map((c) => c.id);
  L.push("## Conclusión", "", outA.length === 0 ? `**Cumple:** 13/13 familias en banda con semillas nuevas.` : `**No cumple:** quedan fuera de banda ${outA.join(", ")}.`, "", open.length ? `Criterios que suspenden con las sales: ${open.join(", ")} (en \`ambas\` sin sales: ${cb.filter((c) => !c.informative && !c.pass).map((c) => c.id).join(", ") || "ninguno"}).` : "Todos los criterios no informativos medidos aprueban con las sales.", "");
  return L.join("\n");
}

const out = arg("--out", quick ? "sim/out/v05r/validar-rapido" : "sim/out/v05r/validar")!;
const from = arg("--informe-desde");
const sha = (o: unknown): string => createHash("sha256").update(JSON.stringify(o)).digest("hex").slice(0, 12);
let file: File;
if (from) file = JSON.parse(readFileSync(`${from}/validar.json`, "utf8"));
else {
  const tasks = jobs();
  console.log(`validación: ${tasks.length} trabajos, semilla ${seed}, ${threads} hilos`);
  const t0 = performance.now();
  const data = gather(tasks, await run(tasks));
  data["ambas"]!.reach = reachByFamily(base); data["ambas"]!.tauntCatalog = tauntCatalogCount(base);
  data["ambas_sales"]!.reach = reachByFamily(nuevo); data["ambas_sales"]!.tauntCatalog = tauntCatalogCount(nuevo);
  file = { seed, quick, sizes: z, elapsedSec: (performance.now() - t0) / 1000, threads, bsq, data, commit: provenance().commit, shas: { base: variantSha(base), nuevo: variantSha(nuevo), fichero: "", combate: sha(RAW_COMBAT) }, salts: bsq.nuevas };
  mkdirSync(out, { recursive: true });
  writeFileSync(`${out}/validar.json`, JSON.stringify(file));
}
// el fichero del catálogo v0.5 se lee al generar el informe: su huella y que sus sales sean exactamente las validadas
try {
  const m = JSON.parse(readFileSync("config/movimientos.v0.5.json", "utf8"));
  const same = JSON.stringify(Object.entries(m.overrides_catalogo.sales).sort()) === JSON.stringify(Object.entries(effectiveRaw(nuevo).moves["overrides_catalogo"].sales).sort());
  file.shas.fichero = `\`${createHash("sha256").update(readFileSync("config/movimientos.v0.5.json", "utf8")).digest("hex").slice(0, 12)}\` (sales ${same ? "idénticas a las validadas" : "**DISTINTAS de las validadas**"})`;
} catch { file.shas.fichero = "no existe"; }
const dest = quick ? `${out}/combate-v0.5-reequilibrio.md` : "docs/informes/combate-v0.5-reequilibrio.md";
writeFileSync(dest, report(file));
console.log(`Informe: ${dest}`);
void RAW_MOVES;
