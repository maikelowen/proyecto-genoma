/**
 * Determinismo del estudio v0.4: misma semilla ⇒ mismo resultado, el troceo no cambia nada, otra semilla cambia
 * el resultado, y la comprobación de parches rechaza erratas y parches sin efecto (R-01). Tamaño mínimo.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { CANDIDATES } from "./candidates.ts";
import { checkVariants } from "./check.ts";
import { registerVariant } from "./configs.ts";
import { mergeResults, runVJob, type VJob } from "./games.ts";
import { BASE, CONTROL } from "./setup.ts";

const c1: VJob = { kind: "C1", config: "base", seed: "test-v04", from: 0, to: 6 };

test("v04: misma semilla ⇒ mismo resultado y el troceo no cambia nada", () => {
  const a = mergeResults([runVJob(c1)]);
  assert.deepEqual(mergeResults([runVJob(c1)]), a);
  assert.deepEqual(mergeResults([runVJob({ ...c1, to: 3 }), runVJob({ ...c1, from: 3 })]), a);
  assert.equal(a.invalid, 0);
  assert.notDeepEqual(mergeResults([runVJob({ ...c1, seed: "test-v04-2" })]), a);
  for (const kind of ["ESPEJO", "TANK"] as const) assert.deepEqual(runVJob({ ...c1, kind }), runVJob({ ...c1, kind }));
  const pl: VJob = { kind: "PLACE", config: "base", seed: "test-v04", from: 0, to: 4, pair: ["2+1", "1+2"] as never };
  assert.deepEqual(runVJob(pl), runVJob(pl));
});

test("v04: los parches cambian la config (y las erratas se rechazan)", () => {
  checkVariants([BASE, ...CANDIDATES, CONTROL]);
  const bad = { id: "mala", label: "x", combat: {}, moves: { "presupuesto_por_coste.9": 3 }, salts: {} };
  assert.throws(() => checkVariants([bad]), /no existe/);
  const noop = { id: "nada", label: "x", combat: { "energia.por_turno": 4 }, moves: {}, salts: {} };
  assert.throws(() => checkVariants([noop]), /no cambia la config efectiva/);
  registerVariant(CONTROL);
  const r = runVJob({ ...c1, config: CONTROL.id });
  assert.equal(r.taunts, 0);
});
