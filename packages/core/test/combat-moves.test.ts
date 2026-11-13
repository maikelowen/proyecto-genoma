/** Tests de movimientos v0.2 (spec docs/spec/movimientos-v0.2.md) y parsers de config. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import goldenCatalog from "./fixtures/movimientos-catalogo.v0.2.json" with { type: "json" };
import {
  ARCHETYPE_IDS,
  ConfigError,
  describeMove,
  generateMove,
  generateMoveForKey,
  geneKey,
  buildBattleConfig,
  parseCombatConfig,
  parseMovesConfig,
  patchRawConfig,
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
    // el presupuesto se lee de la config cruda: aquí se comprueba el parseo, no un valor de balance
    assert.deepEqual(MC.budget, [0, ...[1, 2, 3, 4, 5].map((c) => rawMovesClone().presupuesto_por_coste[String(c)])]);
    assert.equal(MC.drawsPerMove, 8);
    assert.equal(MC.scalables.minFraction, 0.4);
    assert.equal(MC.archetypes.maldicion.minCost, 2);
    assert.equal(BCFG.combat.energy.perTurn, 3);
    assert.equal(BCFG.combat.order.allyPriority, 1);
    assert.equal(BCFG.combat.statuses.escudo.value, rawCombatClone().estados.escudo.maximo);
    assert.equal(BCFG.combat.ai.kappa, 0.9);
    assert.equal(BCFG.combat.ai.statusValue.quemadura, 36);
  });

  it("patchRawConfig / buildBattleConfig: copia con cambios por ruta, sin tocar el original", () => {
    const raw = rawMovesClone();
    const before = JSON.stringify(raw);
    const p = patchRawConfig(raw, { "presupuesto_por_coste.5": 60, "pesos_familia.arquetipo.llama.0": 9 });
    assert.equal(JSON.stringify(raw), before);
    assert.equal(p.presupuesto_por_coste["5"], 60);
    assert.equal(p.pesos_familia.arquetipo.llama[0], 9);
    const long = patchRawConfig(raw, [[["overrides_catalogo", "sales", "llama.cola.2"], "r9"]]);
    assert.equal(long.overrides_catalogo.sales["llama.cola.2"], "r9");
    assert.throws(() => patchRawConfig(raw, { "ia.kapa": 1 }), ConfigError); // errata: la ruta no existe
    assert.throws(() => patchRawConfig(raw, { "pesos_familia.arquetipo.llama.9": 1 }), ConfigError);
    assert.throws(() => patchRawConfig(raw, { "no.existe.nada": 1 }), ConfigError);
    const cfg = buildBattleConfig(rawCombatClone(), raw, GCFG, { combat: { "ia.kappa": 0, "familias.tabla": undefined }, moves: { "presupuesto_por_coste.5": 60 } });
    assert.equal(cfg.combat.ai.kappa, 0);
    assert.equal(cfg.moves.budget[5], 60);
    assert.equal(cfg.combat.families.table["llama"]?.["brote"], 1.25); // tabla derivada de los anillos
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
      ["version", (r) => (r.version = "0.1")],
      ["estadisticas.vida.coef", (r) => delete r.estadisticas.vida.coef.potencia],
      ["estadisticas.ataque.coef", (r) => (r.estadisticas.ataque.coef.potencia = -0.6)], // fA ≤ 0 con todo en velocidad
      ["estadisticas.iniciativa.coef.velocidad", (r) => (r.estadisticas.iniciativa.coef.velocidad = "50")],
      ["orden.prioridad_movimientos_aliado", (r) => (r.orden.prioridad_movimientos_aliado = 2)],
      ["ia.valor_estado", (r) => delete r.ia.valor_estado.prisa],
      ["ia.valor_estado.quemadura", (r) => (r.ia.valor_estado.quemadura = -1)],
      ["ia.kappa", (r) => (r.ia.kappa = -0.1)],
      ["ia.prob_condicion_estimada", (r) => (r.ia.prob_condicion_estimada = 1.5)],
      ["tiradas.por_turno", (r) => (r.tiradas.por_turno = 23)],
      ["familias.tabla", (r) => (r.familias.fuerte = 1.3)], // tabla desfasada
      ["familias.tabla.llama.marea", (r) => (r.familias.tabla.llama.marea = 1)],
      ["estados.quemadura.apilado", (r) => (r.estados.quemadura.apilado = "refresca")],
      ["estados", (r) => delete r.estados.prisa],
      ["energia.inicial", (r) => (r.energia.inicial = 11)],
      ["sinergia.bonus_por_n.3", (r) => (r.sinergia.bonus_por_n["3"] = 0.05)],
      ["equipo.tamano", (r) => (r.equipo.tamano = 5)], // v0.4: 3 es válido (con casilla vacía); > casillas no
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
      ["presupuesto_por_coste.3", (r) => (r.presupuesto_por_coste["3"] = r.presupuesto_por_coste["2"])], // no creciente
      ["pesos_familia.arquetipo.llama", (r) => (r.pesos_familia.arquetipo.llama = [0, 0, 0, 0, 0, 0])],
      ["pesos_familia.condicion.roca[1]", (r) => (r.pesos_familia.condicion.roca[1] = -1)],
      ["nombres.raiz.vapor", (r) => r.nombres.raiz.vapor.pop()],
      ["nombres.raiz", (r) => delete r.nombres.raiz.liquen],
      ["orden_modificadores", (r) => r.orden_modificadores.reverse()],
      ["overrides_catalogo.sales.no.existe", (r) => (r.overrides_catalogo.sales["no.existe"] = "x")],
      ["arquetipos.golpe.modificadores", (r) => r.arquetipos.golpe.modificadores.push("volar")],
      ["version", (r) => (r.version = "0.1")],
      ["escalables.fraccion_minima", (r) => (r.escalables.fraccion_minima = 0)],
      ["escalables.fraccion_minima", (r) => (r.escalables.fraccion_minima = 1)],
      ["presupuesto_por_coste.1", (r) => (r.escalables.fraccion_minima = 0.9)], // 0,9·B1 > B1 − 1,75: respaldo sin salida
      ["escalables.minimo_puntos", (r) => (r.escalables.minimo_puntos = 7)], // > floor(B1 / 1,75)
      ["arquetipos.maldicion.coste_min", (r) => (r.arquetipos.maldicion.coste_min = 6)],
      ["arquetipos.golpe_estado.coste_min", (r) => (r.arquetipos.golpe_estado.coste_min = 2)],
      ["arquetipos.curacion.modificadores", (r) => r.arquetipos.curacion.modificadores.push("prioridad")],
      ["coste_energia.desplazamiento", (r) => delete r.coste_energia.desplazamiento],
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

  it("respaldo §4.1 [v0.2] (sin tiradas extra): quita condición, modificador y estado/energía conservando el arquetipo", () => {
    const cfg = loadBattleConfig(undefined, (r) => {
      r.modificadores.alcance.coste = 60;
      r.modificadores.prioridad.coste = 60;
      r.estados.ofensivos.marca = 60;
      r.estados.ofensivos.debilitar = 60;
      r.estados.positivos.regenerar = 60;
      r.energia_extra.coste = 60;
      r.condiciones.reserva.factor = 60;
    }).moves;
    const levels = new Set<number>();
    const fams = [...GCFG.baseFamilies, ...GCFG.hybrids.map((h) => h.id)];
    for (let i = 0; i < 600; i++) {
      const sig = [i % 5, (i >> 1) % 5, (i * 3) % 5, (i * 7) % 5].join("");
      const m = generateMoveForKey(`${fams[i % fams.length]}|${["cabeza", "cuerpo", "extremidades", "cola"][(i >> 2) % 4]}|${sig}`, cfg);
      assert.deepEqual(validateMove(m, cfg), [], m.key);
      levels.add(m.fallback);
      if (m.fallback === 3) {
        assert.equal(m.status, null);
        assert.equal(m.extraEnergy, 0);
        assert.equal(m.modifier, null);
        assert.equal(m.condition, null);
      }
    }
    assert.ok(levels.has(1) && levels.has(2) && levels.has(3), [...levels].join(","));
    assert.ok(!levels.has(4), "con un parser válido nunca pasa a golpe");
    // el arquetipo se conserva en el nivel 3 (p. ej. un táctico sin energía o una curación sin regenerar)
    const arch3 = new Set<string>();
    for (let i = 0; i < 600; i++) {
      const sig = [i % 5, (i >> 1) % 5, (i * 3) % 5, (i * 7) % 5].join("");
      const m = generateMoveForKey(`${fams[i % fams.length]}|${["cabeza", "cuerpo", "extremidades", "cola"][(i >> 2) % 4]}|${sig}`, cfg);
      if (m.fallback === 3) arch3.add(m.archetype);
    }
    assert.ok([...arch3].some((a) => a !== "golpe"), [...arch3].join(","));
  });

  it("regla del 40 % [v0.2]: el escalable se lleva ≥ fraccion_minima·presupuesto en toda la muestra", () => {
    const fams = [...GCFG.baseFamilies, ...GCFG.hybrids.map((h) => h.id)];
    for (let i = 0; i < 1500; i++) {
      const sig = [(i * 11) % 5, (i >> 1) % 5, (i * 3) % 5, (i >> 3) % 5].join("");
      const m = generateMoveForKey(`${fams[i % fams.length]}|${["cabeza", "cuerpo", "extremidades", "cola"][i % 4]}|${sig}`, MC);
      const fac = m.area ? MC.modifiers.areaFactor : 1;
      const fEsc = (m.condition ? 1 + MC.conditions.bonus * MC.conditions.factor[m.condition] : 1) * (m.modifier === "drenaje" ? MC.modifiers.drainFactor : 1);
      assert.ok(fac * fEsc * m.scalablePoints >= 0.4 * m.budget, m.key);
      if (m.archetype === "maldicion") assert.ok(m.cost >= 2, m.key); // coste_min
    }
  });

  it("coste [v0.2]: c medio ≈ 2 + 2·forma[0] (spec §4: 2,0 / 2,5 / 3,0 / 3,5 / 4,0)", () => {
    // c = clamp(1 + floor(0,25 + 2·f + 2,5·u)); con u uniforme la media exacta es la de la tabla
    const fams = [...GCFG.baseFamilies, ...GCFG.hybrids.map((h) => h.id)];
    for (const d of [0, 1, 2, 3, 4]) {
      let sum = 0;
      let n = 0;
      for (let i = 0; i < 1250; i++) {
        const sig = `${d}${i % 5}${(i >> 2) % 5}${(i >> 4) % 5}`;
        sum += generateMoveForKey(`${fams[i % fams.length]}|${["cabeza", "cuerpo", "extremidades", "cola"][(i >> 6) % 4]}|${sig}`, MC).cost;
        n++;
      }
      const expected = 2 + 0.5 * d;
      assert.ok(Math.abs(sum / n - expected) < 0.12, `forma ${d}: ${sum / n} (esperado ${expected})`);
    }
  });

  it("ejemplos de la spec (movimientos §8) y cuotas del catálogo (§5.1)", () => {
    // Los ejemplos de la spec §8 se calcularon con los presupuestos y topes de la spec (11/20/30/41/53;
    // daño 250/125, cura 180, escudo 200, sin sales). Son una fuente independiente: se anclan a esos valores aunque
    // el balance de config cambie (v0.2.1), fijándolos en una copia de la config.
    const specCfg = loadBattleConfig(undefined, (r) => {
      r.presupuesto_por_coste = { "1": 11, "2": 20, "3": 30, "4": 41, "5": 53 };
      r.escalables.dano.max_individual = 250;
      r.escalables.dano.max_area_por_objetivo = 125;
      r.escalables.cura.max = 180;
      r.escalables.escudo.max = 200;
      r.overrides_catalogo.sales = {}; // sin sales: los ejemplos son claves puras (v0.2.1 añadió sales sobre esas claves)
    }).moves;
    const ex = (k: string): Move => generateMoveForKey(k, specCfg);
    const a = ex("brote|cabeza|0222");
    assert.deepEqual([a.cost, a.archetype, a.power, a.area, a.status, a.condition], [2, "maldicion", 45, true, "debilitar", "reserva"]);
    const b = ex("brote|extremidades|0321");
    assert.deepEqual([b.cost, b.archetype, b.power, b.area, b.status, b.condition], [3, "curacion", 60, true, "regenerar", "reserva"]);
    const c = ex("roca|cabeza|3131");
    assert.deepEqual([c.cost, c.archetype, c.power, c.target], [4, "proteccion", 200, "aliado"]);
    const d = ex("llama|cola|2423");
    assert.deepEqual([d.cost, d.archetype, d.power, d.status], [3, "golpe_estado", 120, "quemadura"]);
    const q = { apoyo_min: 2, apoyo_max: 4, max_por_arquetipo: 4, golpe_min: 2, golpe_estado_min: 2 };
    for (const f of GCFG.baseFamilies) {
      const n = (a: string): number => catalog.filter((m) => m.family === f && m.archetype === a).length;
      const apoyo = n("proteccion") + n("curacion");
      assert.ok(apoyo >= q.apoyo_min && apoyo <= q.apoyo_max, `${f}: apoyo ${apoyo}`);
      for (const a of ARCHETYPE_IDS) assert.ok(n(a) <= q.max_por_arquetipo, `${f}: ${a} ${n(a)}`);
      assert.ok(n("golpe") >= q.golpe_min && n("golpe_estado") >= q.golpe_estado_min, f);
    }
    assert.equal(Object.keys(MC.salts).length, Object.keys(rawMovesClone().overrides_catalogo.sales).length);
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
    // [v0.2] maldición con c < 2 y escalable por debajo del 40 %
    assert.ok(validateMove({ ...m, archetype: "maldicion", area: true, cost: 1, budget: 11 }, MC).some((e) => e.includes("mínimo")));
    const small = { ...m, power: 10, scalablePoints: 2, points: 2 };
    assert.ok(validateMove(small, MC).some((e) => e.includes("presupuesto")));
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
