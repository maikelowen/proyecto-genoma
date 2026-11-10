/**
 * Determinismo del simulador (spec §10.2): misma semilla ⇒ mismo CSV
 * (hash); semilla distinta ⇒ CSV distinto; barrido 2 % vs 3 % pareado:
 * las crías que no mutan en ninguna de las dos configs son idénticas.
 * Tamaño reducido para que tarde < 5 s.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildConfig, DEFAULT_VARIANT } from "./cfg.ts";
import { sha256, toCsv } from "./csv.ts";
import { runE4, runPopulation, type PopRunOptions } from "./engine.ts";
import { STRATEGIES, randomStrategy } from "./strategies.ts";

const v2 = DEFAULT_VARIANT; // v0.2 por defecto (mutación 2 %)
const cfg2 = buildConfig(v2.set);
const cfg3 = buildConfig({ "mutacion.prob_por_locus": 0.03 });
const base: PopRunOptions = {
  scenario: "E2",
  variantId: v2.id,
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

test("E3a (homocigoto) y E3c (heterocigoto) con selección: deterministas y sin violaciones", () => {
  const homo = { cabeza: "brote.cabeza.1", cuerpo: "brote.cuerpo.1", extremidades: "brote.extremidades.1", cola: "brote.cola.1" };
  for (const init of ["clones_homo", "clones"] as const) {
    const o: PopRunOptions = { ...base, scenario: "E3", N: 20, gens: 5, cpp: 5, children: 50, init, homoGenome: homo, wildFrac: 0, cfg: buildConfig({ "mutacion.prob_por_locus": 0 }) };
    const a = runPopulation(o);
    const b = runPopulation(o);
    assert.equal(sha256(toCsv(a.rows)), sha256(toCsv(b.rows)), init);
    assert.equal(a.violations, 0, init);
  }
});

test("E3a homocigoto: gen 0 = clones idénticos con valores = ancla y calidad base", () => {
  const homo = { cabeza: "brote.cabeza.1", cuerpo: "brote.cuerpo.1", extremidades: "brote.extremidades.1", cola: "brote.cola.1" };
  const r = runPopulation({ ...base, scenario: "E3a", N: 10, gens: 1, cpp: 5, children: 25, init: "clones_homo", homoGenome: homo, wildFrac: 0, cfg: buildConfig({ "mutacion.prob_por_locus": 0 }) });
  const g0 = r.rows[0]!;
  assert.equal(g0["desv_vel_D_media"], 0);
  assert.equal(g0["calidad_media"], cfg2.quality.base);
  assert.equal(g0["dist_todos_cabeza"], 1);
});

test("barrido pareado 2 % vs 3 %: crías sin mutación idénticas", () => {
  const r = runPopulation({ ...base, wildFrac: 0, pairedCfg: cfg3 });
  assert.ok(r.paired.compared > 300, `comparadas ${r.paired.compared}`);
  assert.equal(r.paired.identical, r.paired.compared);
});

test("E4 determinista", () => {
  const o = { variantId: v2.id, cfg: cfg2, seed: "test-e4", trials: 30, famA: "llama", famB: "marea", target: "vapor", cpp: 5, cap: 5000 };
  const a = runE4(o);
  assert.equal(sha256(toCsv(a.rows)), sha256(toCsv(runE4(o).rows)));
  assert.equal(a.violations, 0);
  // Flujo propio por configuración (QA S-01): otro id de config ⇒ otros ensayos.
  assert.notEqual(sha256(toCsv(a.rows.map((r) => ({ ...r, config: "x" })))), sha256(toCsv(runE4({ ...o, variantId: "otra" }).rows.map((r) => ({ ...r, config: "x" })))));
});
