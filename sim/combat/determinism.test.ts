/**
 * Determinismo del simulador de combate: misma semilla ⇒ mismo resultado;
 * el troceo en trabajos no cambia nada (independiente del nº de hilos);
 * otra semilla ⇒ resultado distinto. Tamaño mínimo (< 3 s).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { merge, runJob, type Job } from "./jobs.ts";
import { BASE_VARIANT } from "./setup.ts";

const c1: Job = { kind: "C1", variant: BASE_VARIANT, seed: "test-det", from: 0, to: 6 };

test("sim combate: misma semilla ⇒ mismo resultado, y el troceo no cambia nada", () => {
  const a = merge([runJob(c1)]);
  const b = merge([runJob(c1)]);
  assert.deepEqual(a, b);
  const split = merge([runJob({ ...c1, to: 3 }), runJob({ ...c1, from: 3 })]);
  assert.deepEqual(split, a);
});

test("sim combate: otra semilla ⇒ otro resultado", () => {
  const a = merge([runJob(c1)]);
  const b = merge([runJob({ ...c1, seed: "test-det-2" })]);
  assert.notDeepEqual(a, b);
});

test("sim combate: sustitución de movimiento reproducible", () => {
  const j: Job = { kind: "MOV", variant: BASE_VARIANT, seed: "test-det", from: 0, to: 2, moveKey: "llama|cabeza|0000" };
  assert.deepEqual(merge([runJob(j)]), merge([runJob(j)]));
});
