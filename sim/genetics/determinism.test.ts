/**
 * Determinismo del simulador (spec §10.2): misma semilla ⇒ mismo CSV
 * (hash); semilla distinta ⇒ CSV distinto; barrido 2 % vs 3 % pareado:
 * las crías que no mutan en ninguna de las dos configs son idénticas.
 * Tamaño reducido para que tarde < 5 s.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildConfig, mainGrid } from "./cfg.ts";
import { sha256, toCsv } from "./csv.ts";
import { runE4, runPopulation, type PopRunOptions } from "./engine.ts";
import { STRATEGIES, randomStrategy } from "./strategies.ts";

const [v2, v3] = [mainGrid([0.02])[2], mainGrid([0.03])[2]]; // C-m2, C-m3
const cfg2 = buildConfig(v2!.set);
const base: PopRunOptions = {
  scenario: "E2",
  variantId: v2!.id,
  cfg: cfg2,
  seed: "test-det",
  strategy: randomStrategy,
  N: 60,
  gens: 8,
  cpp: 2,
  children: 60,
  init: "wild",
  wildFrac: 0.1,
  select: "top_speed",
};

test("misma semilla ⇒ mismo hash de CSV y de población (todas las estrategias)", () => {
  for (const strategy of STRATEGIES) {
    const a = runPopulation({ ...base, strategy });
    const b = runPopulation({ ...base, strategy });
    assert.equal(sha256(toCsv(a.rows)), sha256(toCsv(b.rows)), strategy.id);
    assert.equal(a.finalHash, b.finalHash, strategy.id);
    assert.equal(a.violations, 0, strategy.id);
  }
});

test("semilla distinta ⇒ CSV distinto", () => {
  const a = runPopulation(base);
  const c = runPopulation({ ...base, seed: "test-det-2" });
  assert.notEqual(sha256(toCsv(a.rows)), sha256(toCsv(c.rows)));
});

test("E3a con clones y selección: determinista y sin violaciones", () => {
  const o: PopRunOptions = { ...base, scenario: "E3a", N: 20, gens: 5, cpp: 5, children: 50, init: "clones", wildFrac: 0 };
  const a = runPopulation(o);
  const b = runPopulation(o);
  assert.equal(sha256(toCsv(a.rows)), sha256(toCsv(b.rows)));
  assert.equal(a.violations, 0);
});

test("barrido pareado 2 % vs 3 %: crías sin mutación idénticas", () => {
  const r = runPopulation({ ...base, wildFrac: 0, pairedCfg: buildConfig(v3!.set) });
  assert.ok(r.paired.compared > 300, `comparadas ${r.paired.compared}`);
  assert.equal(r.paired.identical, r.paired.compared);
});

test("E4 determinista", () => {
  const o = { variantId: v2!.id, cfg: cfg2, seed: "test-e4", trials: 30, famA: "llama", famB: "marea", target: "vapor", cpp: 5, creatureTrials: 0, creatureCap: 0 };
  assert.equal(sha256(toCsv(runE4(o).rows)), sha256(toCsv(runE4(o).rows)));
});
