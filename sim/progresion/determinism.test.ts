/** Determinismo del simulador de progresión: misma semilla ⇒ mismo resultado; semillas distintas ⇒ resultados distintos. Tamaño mínimo (6 combates). */
import assert from "node:assert/strict";
import { test } from "node:test";
import { runBatch } from "./lote.ts";

const b = { prefix: "test-prog", profile: "normal" as const, from: 0, to: 2, maxCombats: 6, minCombats: 6, config: "config/progresion.v0.1.json" };

test("progresión: determinista, troceo neutro y semillas distintas difieren", () => {
  const a = runBatch(b);
  assert.deepEqual(runBatch(b), a);
  assert.deepEqual([...runBatch({ ...b, to: 1 }), ...runBatch({ ...b, from: 1 })], a);
  assert.notEqual(a[0]!.hash, a[1]!.hash);
  assert.equal(a[0]!.combats, 6);
  assert.equal(a[0]!.snaps.length, 1);
});
