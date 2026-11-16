/**
 * Búsqueda de sales de familias para el combate v0.5 (config `ambas`), mismo procedimiento voraz que v0.4 (`sim/v04/salts.ts`).
 * Parte de `config/movimientos.v0.4.json` (sales de D-045) y puede cambiar o añadir sales; el resultado va a `config/movimientos.v0.5.json`.
 * Uso: node sim/v05/reequilibrio-buscar.ts [--semilla elige06] [--out DIR] [--n-medida N] [--n-candidata N] [--rondas N] [--por-ronda N] [--margen M]
 */
process.env["SIM_COMBAT_CONFIG"] = "config/combate.v0.5.json";
process.env["SIM_MOVES_CONFIG"] = "config/movimientos.v0.4.json";
import { mkdirSync, writeFileSync } from "node:fs";
const { search, setBaseCombat } = await import("../v04/salts.ts");
const { RAW_COMBAT, RAW_MOVES } = await import("../v04/setup.ts");

const arg = (k: string, d: string): string => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1]! : d; };
const seed = arg("--semilla", "elige06");
const BURNED = ["genoma", "combate01", "elige01", "valida01", "explora02", "elige02", "valida02", "valida03", "prof01", "tune1", "tune2", "test-det", "var03", "test-var", "base04", "elige03", "valida04", "elige05", "valida05", "v05", "miguelE3"];
if (BURNED.some((b) => seed.startsWith(b))) throw new Error(`semilla quemada: ${seed}`);
const out = arg("--out", "sim/out/v05r/busqueda");
setBaseCombat((RAW_COMBAT["escenarios_sim"].configs_v05.ambas) as Record<string, unknown>);
const opts = { seed, nMeasure: Number(arg("--n-medida", "100")), nCandidate: Number(arg("--n-candidata", "120")), rounds: Number(arg("--rondas", "3")), perRound: Number(arg("--por-ronda", "2")), margin: Number(arg("--margen", "0.035")), minGain: 0.01 };
const t0 = performance.now();
const r = await search(opts, console.log);
mkdirSync(out, { recursive: true });
const base = RAW_MOVES.overrides_catalogo.sales as Record<string, string>;
const nuevas: Record<string, string> = {};
for (const [g, s] of Object.entries(r.salts)) if (base[g] !== s) nuevas[g] = s;
writeFileSync(`${out}/busqueda.json`, JSON.stringify({ seed, opts, salts: r.salts, nuevas, steps: r.steps, elapsedSec: (performance.now() - t0) / 1000 }, null, 1));
console.log(`sales nuevas/cambiadas: ${JSON.stringify(nuevas)} (${((performance.now() - t0) / 1000).toFixed(0)} s)`);
