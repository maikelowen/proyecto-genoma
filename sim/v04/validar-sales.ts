/**
 * Validación de las sales de familias v0.4.1 con semillas nuevas (valida05) y generación de docs/informes/familias-v0.4.md.
 * Uso: node sim/v04/validar-sales.ts --busqueda sim/out/v04/sales/busqueda.json [--semilla valida05] [--out DIR] [--quick] [--informe-desde DIR]
 * Compara la base v0.4 con la base + sales (solo `overrides_catalogo.sales`), con las mismas semillas. No toca config/.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { Worker } from "node:worker_threads";
import { criteria, familyRates, fmtC, placementPairs, reachByFamily, tauntCatalogCount, winRate, type ConfigData, type Criterion } from "./analysis.ts";
import { effectiveRaw, allFamilies, BASE, GCFG, RAW_MOVES, variantSha, type Variant } from "./setup.ts";
import { checkVariants } from "./check.ts";
import { mergeResults, type Kind, type VJob, type VResult } from "./games.ts";
import { catalogOk, quotasOk, withSalts, PAYING_LOCI } from "./salts.ts";

const arg = (k: string, d?: string): string | undefined => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const quick = process.argv.includes("--quick");
const seed = arg("--semilla", "valida05")!;
const BURNED = ["genoma", "combate01", "elige01", "valida01", "explora02", "elige02", "valida02", "valida03", "prof01", "tune1", "tune2", "test-det", "var03", "test-var", "base04", "elige03", "valida04", "elige05"];
if (BURNED.some((b) => seed.startsWith(b))) throw new Error(`semilla quemada: ${seed}`);
const out = arg("--out", quick ? "sim/out/v04/sales-validar-rapido" : "sim/out/v04/sales-validar")!;
const z: { c1: number; c2: number; place: number; tank: number } = quick ? { c1: 150, c2: 4, place: 20, tank: 30 } : { c1: 4000, c2: 400, place: 700, tank: 2000 };

interface Task { v: Variant; job: VJob; slot: string }

function jobs(configs: Variant[]): Task[] {
  const t: Task[] = [];
  const add = (v: Variant, slot: string, base: Omit<VJob, "from" | "to">, n: number, chunk: number): void => { for (let f = 0; f < n; f += chunk) t.push({ v, slot, job: { ...base, from: f, to: Math.min(n, f + chunk) } }); };
  const fams = allFamilies();
  for (const v of configs) {
    add(v, `${v.id}|C1`, { kind: "C1", config: v.id, seed }, z.c1, 250);
    add(v, `${v.id}|TANK`, { kind: "TANK", config: v.id, seed }, z.tank, 250);
    for (const [p, q] of placementPairs()) add(v, `${v.id}|PLACE|${p}|${q}`, { kind: "PLACE", config: v.id, seed, pair: [p, q] as never }, z.place, 250);
    for (let i = 0; i < fams.length; i++) for (let j = i + 1; j < fams.length; j++) add(v, `${v.id}|C2|${fams[i]}|${fams[j]}`, { kind: "C2", config: v.id, seed, pair: [fams[i]!, fams[j]!] }, z.c2, 250);
  }
  return t;
}

async function run(tasks: Task[]): Promise<VResult[]> {
  const res = new Array<VResult>(tasks.length);
  let next = 0, done = 0;
  await new Promise<void>((resolve, reject) => {
    let alive = 0;
    for (let k = 0; k < 2; k++) {
      const w = new Worker(new URL("./salts-worker.ts", import.meta.url));
      alive++;
      let cur = -1;
      const feed = (): void => { if (next >= tasks.length) { void w.terminate(); if (--alive === 0) resolve(); return; } cur = next++; w.postMessage({ v: tasks[cur]!.v, job: tasks[cur]!.job }); };
      w.on("message", (r: VResult) => { res[cur] = r; if (++done % 100 === 0) console.log(`  ${done}/${tasks.length}`); feed(); });
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
    if (kind === "C2" || kind === "PLACE") (d[kind] ??= {})[`${p}|${q}`] = mergeResults(l);
    else d[kind] = mergeResults(l);
  }
  return data as Record<string, ConfigData>;
}

interface File { seed: string; quick: boolean; sizes: typeof z; elapsedSec: number; search: any; salts: Record<string, string>; configs: { id: string; sha: string; salts: Record<string, string | null> }[]; data: Record<string, ConfigData>; quotas: { family: string; ok: boolean }[]; catalog: string; baseSha: string }

const pct = (x: number): string => `${(x * 100).toFixed(1).replace(".", ",")} %`;
const verdict = (c: Criterion | undefined): string => (!c ? "—" : c.informative ? "informativo" : `${c.pass ? "aprobado" : "suspendido"}${c.fragile ? " (frágil)" : ""}`);
const iv = (c: Criterion): string => (c.hi > c.lo ? `${fmtC(c, c.value)} (${fmtC(c, c.lo)}–${fmtC(c, c.hi)})` : fmtC(c, c.value));

function report(f: File, nv: Variant, b: ConfigData, a: ConfigData): string {
  const K = effectiveRaw(BASE).combat.criterios_sim.v04 as Record<string, number>;
  const cb = criteria(BASE, b);
  const ca = criteria(nv, a);
  const find = (cs: Criterion[], id: string): Criterion | undefined => cs.find((c) => c.id === id);
  const rb = familyRates(b.C2!);
  const ra = familyRates(a.C2!);
  const outOf = (rs: typeof rb): string[] => rs.filter((r) => r.rate.value < K["familias_min"]! || r.rate.value > K["familias_max"]!).map((r) => r.family);
  const ids = ["turnos", "p90", "empates", "gratis", "colocacion", "tanque", "alcance", "familias", "pagos", "provocar", "primer_ko", "lider_t3"];
  const L: string[] = [];
  L.push("# Ajuste de familias (sales v0.4.1) — Proyecto Genoma", "");
  L.push(`Generado por \`sim/v04/salts.ts\` (búsqueda) y \`sim/v04/validar-sales.ts\` (validación). Huella de la config efectiva (combate + movimientos): base \`${f.baseSha}\`, con sales \`${f.configs.find((c) => c.id !== "base")!.sha}\`. Semillas: búsqueda \`${f.search.seed}\`, validación \`${f.seed}\` (nuevas; ninguna de base04, elige03, valida04 ni anteriores). Modo ${f.quick ? "rápido" : "completo"}; validación ${Math.round(f.elapsedSec)} s; búsqueda ${Math.round(f.search.elapsedSec)} s.`, "");
  L.push("## Resumen", "");
  L.push(`- Familias fuera de ${pct(K["familias_min"]!)}–${pct(K["familias_max"]!)} con la base: ${outOf(rb).length} (${outOf(rb).join(", ") || "ninguna"}); con las sales: **${outOf(ra).length}** (${outOf(ra).join(", ") || "ninguna"}), en validación con semillas nuevas.`);
  L.push(`- Solo cambian sales de genes del catálogo (\`overrides_catalogo.sales\`); energía, vida y demás palancas no se tocan.`, "");
  L.push("## Sales de la búsqueda", "", "Procedimiento fijo (sin criterio a ojo): cada ronda mide C2 de las 13 familias; para las familias base fuera de la banda de búsqueda, cada gen de pago (cabeza, cuerpo, cola; extremidades = movimiento gratis, no se sala) prueba c1…c4 respetando las cuotas del catálogo, y se queda la que más acerca la familia al 50 % si mejora ≥ 1 punto.", "");
  L.push(`Parámetros: banda de búsqueda ${pct(K["familias_min"]! + f.search.opts.margin)}–${pct(K["familias_max"]! - f.search.opts.margin)}, ${f.search.opts.nMeasure} combates por pareja para medir y ${f.search.opts.nCandidate} por candidata, ${f.search.opts.rounds} rondas como máximo.`, "");
  L.push("| Ronda | Familia | Gen | Sal (antes → después) | Tasa antes → después (búsqueda) | Candidatas |", "|---|---|---|---|---|---|");
  for (const s of f.search.steps) for (const c of s.changes) L.push(`| ${s.round} | ${c.family} | \`${c.gene}\` | ${c.from ?? "—"} → ${c.to} | ${pct(c.before)} → ${pct(c.after)} | ${c.tried} |`);
  L.push("", `Sales nuevas o cambiadas aplicadas: ${Object.entries(f.salts).map(([g, s]) => `\`${g}\` = ${s}`).join(", ") || "ninguna"}.`, "");
  L.push("## Familias antes y después (validación, tasa contra las otras 12)", "", "| Familia | Base | Con sales | En banda |", "|---|---|---|---|");
  rb.forEach((r, i) => { const x = ra[i]!; const inb = x.rate.value >= K["familias_min"]! && x.rate.value <= K["familias_max"]!; L.push(`| ${r.family} | ${pct(r.rate.value)} | ${pct(x.rate.value)} (${pct(x.rate.lo)}–${pct(x.rate.hi)}) | ${inb ? "sí" : "no"} |`); });
  L.push("", `${f.sizes.c2} combates por pareja (78 parejas), lados alternos, mismas semillas en las dos configuraciones.`, "");
  L.push("## Criterios (misma validación)", "", "| Criterio | Umbral | Base | Con sales |", "|---|---|---|---|");
  for (const id of ids) { const x = find(cb, id), y = find(ca, id); if (x && y) L.push(`| ${x.group}: ${x.label} | ${x.threshold} | ${iv(x)} · ${verdict(x)} | ${iv(y)} · ${verdict(y)} |`); }
  L.push("", `Cuotas del catálogo con las sales: ${f.catalog}; cuotas por familia base (apoyo, máximo por arquetipo, golpe, golpe_estado): ${f.quotas.every((q) => q.ok) ? "las 6 cumplen" : "incumple " + f.quotas.filter((q) => !q.ok).map((q) => q.family).join(", ")}. Remontada (primer KO y líder T3) y pagos son criterios abiertos de v0.4 que esta ronda no pretende resolver; profundidad no se remide porque no cambian reglas.`, "");
  const bad = judgedFail(ca, cb);
  L.push(bad.length ? `**Criterios que empeoran con las sales respecto a la base (aprobaba y ya no):** ${bad.join(", ")}.` : "**Ningún criterio que la base aprobaba pasa a suspender con las sales.**", "");
  return L.join("\n");
}
function judgedFail(after: Criterion[], before: Criterion[]): string[] {
  return after.filter((c) => !c.informative && !c.pass && before.find((b) => b.id === c.id)?.pass).map((c) => c.id);
}

async function main(): Promise<void> {
  const searchFile = arg("--busqueda", "sim/out/v04/sales/busqueda.json")!;
  const search = JSON.parse(readFileSync(searchFile, "utf8"));
  const baseSalts = RAW_MOVES.overrides_catalogo.sales as Record<string, string>;
  const nv = withSalts(search.salts as Record<string, string>);
  const cfgVariant: Variant = { ...nv, id: "ajuste" };
  checkVariants([BASE, cfgVariant]);
  const from = arg("--informe-desde");
  const dir = from ?? out;
  let file: File;
  if (from) file = JSON.parse(readFileSync(`${from}/validar.json`, "utf8"));
  else {
    const configs = [BASE, cfgVariant];
    const tasks = jobs(configs);
    console.log(`validación: ${tasks.length} trabajos, semilla ${seed}`);
    const t0 = performance.now();
    const rs = await run(tasks);
    const data = gather(tasks, rs);
    for (const c of configs) { data[c.id]!.reach = reachByFamily(c); data[c.id]!.tauntCatalog = tauntCatalogCount(c); }
    const fams = (GCFG.baseFamilies as readonly string[]);
    file = { seed, quick, sizes: z, elapsedSec: (performance.now() - t0) / 1000, search, salts: Object.fromEntries(Object.entries(search.salts as Record<string, string>).filter(([g, s]) => baseSalts[g] !== s)), configs: configs.map((c) => ({ id: c.id, sha: variantSha(c), salts: { ...c.salts } })), data, quotas: fams.map((f) => ({ family: f, ok: quotasOk(cfgVariant, f) })), catalog: catalogOk(cfgVariant).detail, baseSha: variantSha(BASE) };
    mkdirSync(dir, { recursive: true });
    writeFileSync(`${dir}/validar.json`, JSON.stringify(file));
  }
  const md = report(file, cfgVariant, file.data["base"]!, file.data["ajuste"]!);
  const dest = quick || from?.includes("rapido") ? `${dir}/familias-v0.4.md` : "docs/informes/familias-v0.4.md";
  writeFileSync(dest, md);
  console.log(`Informe: ${dest}`);
  const ca = criteria(cfgVariant, file.data["ajuste"]!), cb = criteria(BASE, file.data["base"]!);
  for (const [n, cs] of [["base", cb], ["ajuste", ca]] as const) console.log(`${n}: ${cs.filter((c) => !c.informative && c.pass).length}/${cs.filter((c) => !c.informative).length}; suspende: ${cs.filter((c) => !c.informative && !c.pass).map((c) => c.id).join(", ") || "—"}`);
  console.log(`familias con sales: ${familyRates(file.data["ajuste"]!.C2!).map((r) => `${r.family} ${(r.rate.value * 100).toFixed(1)}`).join(", ")}`);
}
void createHash; void existsSync; void PAYING_LOCI; void winRate; void (null as unknown as Kind);
await main();
