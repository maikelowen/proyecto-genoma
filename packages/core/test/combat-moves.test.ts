/** Tests de movimientos v0.1 (spec docs/spec/movimientos-v0.1.md) y parsers de config. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import goldenCatalog from "./fixtures/movimientos-catalogo.v0.1.json" with { type: "json" };
import {
  ARCHETYPE_IDS,
  ConfigError,
  describeMove,
  generateMove,
  generateMoveForKey,
  geneKey,
  parseCombatConfig,
  parseMovesConfig,
  validateMove,
  weightedPick,
  type Move,
} from "../src/index.ts";
import { BCFG, GCFG, loadBattleConfig, rawCombatClone, rawMovesClone } from "./combat-helpers.ts";
import { hybridGene } from "./genetics-helpers.ts";

const MC = BCFG.moves;

describe("parsers de config (combate y movimientos)", () => {
  it("las configs reales se cargan; β y tabla de familias accesibles", () => {
    assert.equal(BCFG.combat.stats.betaQuality, 0.04);
    assert.equal(BCFG.combat.draws.perTurn, 24);
    assert.equal(BCFG.combat.families.table["llama"]?.["brote"], 1.25);
    assert.deepEqual(MC.budget, [0, 8, 18, 29, 42, 56]);
    assert.equal(MC.drawsPerMove, 8);
  });

  it("β configurable (0 / 0,06) y tabla derivada al borrarla (barrido de fuerte)", () => {
    for (const b of [0, 0.06]) assert.equal(loadBattleConfig((r) => (r.estadisticas.beta_calidad = b)).combat.stats.betaQuality, b);
    const swept = loadBattleConfig((r) => {
      delete r.familias.tabla;
      r.familias.fuerte = 1.3;
    }).combat;
    assert.equal(swept.families.table["roca"]?.["voltio"], 1.3);
    assert.equal(swept.families.table["voltio"]?.["roca"], 0.8);
    assert.equal(swept.families.table["roca"]?.["magma"], 1);
  });

  it("combate: rechaza configs incoherentes", () => {
    const bad: [string, (r: any) => void][] = [
      ["version", (r) => (r.version = "0.2")],
      ["tiradas.por_turno", (r) => (r.tiradas.por_turno = 23)],
      ["familias.tabla", (r) => (r.familias.fuerte = 1.3)], // tabla desfasada
      ["familias.tabla.llama.marea", (r) => (r.familias.tabla.llama.marea = 1)],
      ["estados.quemadura.apilado", (r) => (r.estados.quemadura.apilado = "refresca")],
      ["estados", (r) => delete r.estados.prisa],
      ["energia.inicial", (r) => (r.energia.inicial = 11)],
      ["sinergia.bonus_por_n.3", (r) => (r.sinergia.bonus_por_n["3"] = 0.05)],
      ["equipo.tamano", (r) => (r.equipo.tamano = 3)],
    ];
    for (const [path, patch] of bad) {
      const raw = rawCombatClone();
      patch(raw);
      assert.throws(() => parseCombatConfig(raw), (e: unknown) => e instanceof ConfigError && e.message.startsWith(path), path);
    }
  });

  it("movimientos: rechaza configs incoherentes (movimientos §3)", () => {
    const bad: [string, (r: any) => void][] = [
      ["tiradas_por_movimiento", (r) => (r.tiradas_por_movimiento = 7)],
      ["presupuesto_por_coste.3", (r) => (r.presupuesto_por_coste["3"] = 18)],
      ["pesos_familia.arquetipo.llama", (r) => (r.pesos_familia.arquetipo.llama = [0, 0, 0, 0, 0, 0])],
      ["pesos_familia.condicion.roca[1]", (r) => (r.pesos_familia.condicion.roca[1] = -1)],
      ["nombres.raiz.vapor", (r) => r.nombres.raiz.vapor.pop()],
      ["nombres.raiz", (r) => delete r.nombres.raiz.liquen],
      ["orden_modificadores", (r) => r.orden_modificadores.reverse()],
      ["overrides_catalogo.sales.no.existe", (r) => (r.overrides_catalogo.sales["no.existe"] = "x")],
      ["arquetipos.golpe.modificadores", (r) => r.arquetipos.golpe.modificadores.push("volar")],
    ];
    for (const [path, patch] of bad) {
      const raw = rawMovesClone();
      patch(raw);
      assert.throws(() => parseMovesConfig(raw, GCFG), (e: unknown) => e instanceof ConfigError && e.message.startsWith(path), path);
    }
  });
});

describe("generación de movimientos (movimientos §4)", () => {
  const catalog = GCFG.catalog.map((t) => generateMove(t, MC));

  it("los 72 del catálogo se generan, son válidos y caben en su presupuesto", () => {
    assert.equal(catalog.length, 72);
    for (const m of catalog) {
      assert.deepEqual(validateMove(m, MC), [], `${m.id}: ${validateMove(m, MC).join("; ")}`);
      assert.ok(m.points <= (MC.budget[m.cost] as number) + 1e-9);
      assert.ok(m.cost >= 1 && m.cost <= 5);
    }
  });

  it("vector dorado: la lista de 72 coincide con el fixture (movimientos §5)", () => {
    assert.deepEqual(JSON.parse(JSON.stringify(catalog)), goldenCatalog);
  });

  it("id = movimiento del gen base; ≥ 3 arquetipos por familia [criterios_sim]", () => {
    const byFam = new Map<string, Set<string>>();
    GCFG.catalog.forEach((t, i) => {
      const m = catalog[i] as Move;
      assert.equal(m.id, t.move);
      assert.equal(m.key, geneKey(t));
      assert.equal(m.family, t.family);
      if (!byFam.has(t.family)) byFam.set(t.family, new Set());
      byFam.get(t.family)?.add(m.archetype);
    });
    for (const [f, s] of byFam) assert.ok(s.size >= 3, `${f}: ${[...s].join(",")}`);
  });

  it("misma clave ⇒ mismo movimiento; pura (no depende de llamadas previas)", () => {
    const t = GCFG.catalogById.get("roca.cola.2");
    assert.ok(t);
    const a = generateMoveForKey(geneKey(t), MC);
    generateMoveForKey("voltio|cabeza|1234", MC);
    assert.deepEqual(generateMoveForKey(geneKey(t), MC), a);
    assert.deepEqual(generateMove(t, MC), a);
  });

  it("gen mutado (híbrido y base fuera de catálogo) ⇒ movimiento válido con id provisional", () => {
    const keys = ["vapor|cabeza|1234", "abismo|cola|4040", "liquen|cuerpo|0000", "llama|cabeza|0000", "sombra|extremidades|4444"];
    for (const k of keys) {
      const m = generateMoveForKey(k, MC);
      assert.deepEqual(validateMove(m, MC), [], k);
      assert.ok(m.id.startsWith("mov:prov:"), m.id);
    }
    const g1 = hybridGene("tormenta", "cuerpo", [0.25, 0.5, 0.75, 1]);
    const g2 = { ...g1, id: "otro", move: "mov:prov:otro" };
    const m1 = generateMove(g1, MC);
    const m2 = generateMove(g2, MC);
    assert.deepEqual(validateMove(m1, MC), []);
    assert.deepEqual({ ...m1, id: "" }, { ...m2, id: "" }); // misma clave ⇒ mismo movimiento (salvo el id del gen)
    assert.ok(MC.names.roots["tormenta"]?.some((r) => m1.name.endsWith(` de ${r}`)));
  });

  it("muestra de 2.000 claves al azar: todas válidas; aturdir solo con c ≥ 3; energía solo en táctico c ≥ 3", () => {
    const fams = [...GCFG.baseFamilies, ...GCFG.hybrids.map((h) => h.id)];
    const loci = ["cabeza", "cuerpo", "extremidades", "cola"];
    let n = 0;
    for (let i = 0; i < 2000; i++) {
      const sig = [i % 5, (i >> 2) % 5, (i * 7) % 5, (i * 13) % 5].join("");
      const m = generateMoveForKey(`${fams[i % fams.length]}|${loci[(i >> 3) % 4]}|${sig}`, MC);
      assert.deepEqual(validateMove(m, MC), [], m.key);
      if (m.status === "aturdir") assert.ok(m.cost >= 3);
      if (m.extraEnergy) assert.ok(m.archetype === "tactico" && m.cost >= 3 && !m.area);
      if (m.archetype === "maldicion") assert.equal(m.area, true);
      n++;
    }
    assert.equal(n, 2000);
  });

  it("claves inválidas lanzan", () => {
    for (const k of ["llama|cabeza", "fuego|cabeza|0000", "llama|ala|0000", "llama|cabeza|0005", "llama|cabeza|000"]) {
      assert.throws(() => generateMoveForKey(k, MC), RangeError, k);
    }
  });

  it("respaldo §4.1 (sin tiradas extra): con piezas caras se quita condición/modificador o pasa a golpe", () => {
    const cfg = loadBattleConfig(undefined, (r) => {
      r.modificadores.alcance.coste = 60;
      r.modificadores.prioridad.coste = 60;
      r.estados.ofensivos.marca = 60;
      r.condiciones.reserva.factor = 60;
    }).moves;
    const levels = new Set<number>();
    for (const t of GCFG.catalog) {
      const m = generateMove(t, cfg);
      assert.deepEqual(validateMove(m, cfg), [], m.id);
      levels.add(m.fallback);
      if (m.fallback === 3) assert.equal(m.archetype, "golpe");
    }
    assert.ok(levels.has(2) && levels.has(3), [...levels].join(","));
  });

  it("sal de revisión: cambia solo ese movimiento (movimientos §5)", () => {
    const cfg = loadBattleConfig(undefined, (r) => (r.overrides_catalogo.sales["llama.cabeza.1"] = "rev1")).moves;
    let changed = 0;
    GCFG.catalog.forEach((t, i) => {
      const m = generateMove(t, cfg);
      if (t.id === "llama.cabeza.1") changed += JSON.stringify(m) !== JSON.stringify(catalog[i]) ? 1 : 0;
      else assert.deepEqual(m, catalog[i]);
    });
    assert.equal(changed, 1);
  });

  it("weightedPick: primer i con u·Σw < Σw≤i; pesos 0 nunca salen; Σw = 0 ⇒ −1", () => {
    assert.equal(weightedPick([1, 1, 2], 0), 0);
    assert.equal(weightedPick([1, 1, 2], 0.25), 1);
    assert.equal(weightedPick([1, 1, 2], 0.5), 2);
    assert.equal(weightedPick([0, 3, 0], 0.99), 1);
    assert.equal(weightedPick([0, 0], 0.3), -1);
  });

  it("validateMove detecta movimientos rotos", () => {
    const m = catalog.find((x) => x.archetype === "golpe" && !x.area) as Move;
    assert.ok(validateMove({ ...m, power: 500 }, MC).length > 0);
    assert.ok(validateMove({ ...m, points: 999 }, MC).length > 0);
    assert.ok(validateMove({ ...m, modifier: "area" }, MC).length > 0); // área incoherente
    assert.ok(validateMove({ ...m, archetype: "maldicion" }, MC).length > 0);
    assert.ok(validateMove({ ...m, status: "aturdir", cost: 1, budget: 8 }, MC).length > 0);
    assert.ok(validateMove({ ...m, extraEnergy: 1 }, MC).length > 0);
  });

  it("describeMove: texto corto en español con nombre, coste y piezas", () => {
    for (const m of catalog) {
      const d = describeMove(m, MC);
      assert.ok(d.startsWith(`${m.name} (coste ${m.cost}): `), d);
      assert.ok(d.length < 200, d);
      if (m.status) assert.ok(d.includes(m.status === "prisa" ? "prisa" : m.status), d);
      if (m.condition) assert.ok(d.includes("+50 % si"), d);
    }
    const tac = generateMoveForKey("voltio|extremidades|4404", MC);
    assert.ok(ARCHETYPE_IDS.includes(tac.archetype));
  });
});
