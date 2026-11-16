/**
 * Determinismo del estudio v0.5: misma semilla ⇒ mismo resultado (con las métricas nuevas y los códigos de partida),
 * el troceo no cambia nada, las partidas pareadas no dependen de la config y las 5 configs llevan sus claves. Tamaño mínimo.
 */
process.env["SIM_COMBAT_CONFIG"] = "config/combate.v0.5.json";
import assert from "node:assert/strict";
import { test } from "node:test";
const { mergeResults, runVJob } = await import("../v04/games.ts");
const { registerVariant } = await import("../v04/configs.ts");
const { loadV05Configs } = await import("./configs.ts");
const { checkV05 } = await import("./cli-check.ts");
const { decodeCodes, pairedDelta } = await import("./stats.ts");

const { variants } = loadV05Configs();
for (const v of variants) registerVariant(v);
const job = (config: string, to = 8) => ({ kind: "C1" as const, config, seed: "test-v05", from: 0, to, paired: true });

test("v05: determinista, troceo neutro y códigos coherentes", () => {
  const a = mergeResults([runVJob(job("ambas"))]);
  assert.deepEqual(mergeResults([runVJob(job("ambas"))]), a);
  assert.deepEqual(mergeResults([runVJob({ ...job("ambas"), to: 3 }), runVJob({ ...job("ambas"), from: 3 })]), a);
  assert.equal(a.invalid, 0);
  assert.equal(a.codes.length, 4 * a.n);
  assert.notDeepEqual(mergeResults([runVJob({ ...job("ambas"), seed: "test-v05-2" })]), a);
  const d = pairedDelta(decodeCodes(a.codes).turnos, decodeCodes(a.codes).turnos);
  assert.equal(d.diff, 0);
  assert.equal(d.se, 0);
});

test("v05: pareado (mismo equipo y semilla) y configs con sus claves", () => {
  checkV05(variants);
  const b = runVJob(job("base_E3"));
  const s = runVJob(job("solo_D053"));
  assert.equal(b.n, s.n);
  assert.equal(b.lostKo + b.lostStun, 0); // sin D-054 no hay pérdida
  assert.equal(b.lastTurns, 0); // sin D-053 no hay últimas con secuencia
  const p = runVJob(job("solo_D054", 20));
  assert.ok(p.lostKo + p.lostStun > 0);
});
