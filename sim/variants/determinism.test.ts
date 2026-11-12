/**
 * Determinismo del estudio de variantes: misma semilla ⇒ mismo resultado, el troceo no cambia nada,
 * cada combinación cambia de verdad la config y el resultado, y los parches no tocan la base. Tamaño mínimo.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { checkCombos, comboSha, MAIN_COMBOS } from "./combos.ts";
import { mergeResults, runVJob, type VJob } from "./games.ts";

const c1 = (combo: string): VJob => ({ kind: "C1", combo, seed: "test-var", from: 0, to: 6 });

test("variantes: misma semilla ⇒ mismo resultado, y el troceo no cambia nada", () => {
  for (const combo of ["base", "v4p_v1v2v3"]) {
    const a = mergeResults([runVJob(c1(combo))]);
    assert.deepEqual(mergeResults([runVJob(c1(combo))]), a);
    assert.deepEqual(mergeResults([runVJob({ ...c1(combo), to: 3 }), runVJob({ ...c1(combo), from: 3 })]), a);
    assert.equal(a.invalid, 0);
  }
  assert.notDeepEqual(mergeResults([runVJob({ ...c1("base"), seed: "test-var-2" })]), mergeResults([runVJob(c1("base"))]));
});

test("variantes: cada combinación cambia la config (huellas distintas) y V2 deja movimientos en descanso", () => {
  checkCombos(MAIN_COMBOS);
  assert.equal(new Set(MAIN_COMBOS.map(comboSha)).size, MAIN_COMBOS.length);
  const base = runVJob(c1("base"));
  const v2 = runVJob(c1("v2"));
  assert.equal(base.availSum, 4 * base.decN);
  assert.ok(v2.availSum < 4 * v2.decN);
  assert.ok(runVJob({ ...c1("v4p"), kind: "FORM", rival: "inv" }).n === 6);
});

test("variantes: profundidad reproducible (búsqueda en A y en B con el mismo equipo)", () => {
  const j: VJob = { kind: "PROF", combo: "v4p_v1v2", seed: "test-var", from: 0, to: 2 };
  const a = runVJob(j);
  assert.deepEqual(runVJob(j), a);
  assert.ok(a.decisions > 0 && a.n === 2);
});
