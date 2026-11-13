/** Combate v0.4 (reglas por defecto): cuadrícula 2×2 con casilla vacía, gratis, prioridad de fila, provocar, Q-01, Q-03, IA. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import goldenCatalog04 from "./fixtures/movimientos-catalogo.v0.4.json" with { type: "json" };
import {
  allPlacements,
  attackable,
  buildCombatant,
  ConfigError,
  createBattle,
  createReferenceAi,
  createRng,
  createSearchAi,
  createWildPopulation,
  describeMoveShort,
  forecastTargets,
  generateMove,
  generateMoveForKey,
  parseCombatConfig,
  parseMovesConfig,
  patchRawConfig,
  placementOf,
  placementShape,
  referencePlacement,
  resolveTurn,
  restingMoves,
  runBattle,
  validatePlacement,
  validatePlan,
  validateMove,
  type Action,
  type BattleEvent,
  type BattleState,
  type Combatant,
  type FighterState,
  type Plan,
  type TurnResult,
} from "../src/index.ts";
import { BCFG04, FLAT04, GCFG, mk04, mkFree, mkMove, rawCombat04Clone, rawCombatClone, rawMoves04Clone } from "./combat-helpers.ts";
import { drawsConsumed } from "./genetics-helpers.ts";

const team = (p: string, moves: Parameters<typeof mk04>[1] = {}, over: Partial<Combatant>[] = []): Combatant[] => [1, 2, 3].map((i) => mk04(`${p}${i}`, moves, over[i - 1] ?? {}));
const free = (actors: number[]): Action[] => actors.map((actor) => ({ actor, move: 3, target: 0 }));
const use = (actors: number[], move: number): Action[] => actors.map((actor) => ({ actor, move, target: 0 }));
const play = (s: BattleState, a: Plan, b: Plan): TurnResult => resolveTurn(s, a, b, createRng("t"), FLAT04);
const acts = (r: TurnResult, side: "A" | "B"): Record<number, readonly number[]> =>
  Object.fromEntries(r.events.filter((e): e is Extract<BattleEvent, { type: "action" }> => e.type === "action" && e.side === side).map((e) => [e.actor, e.targets]));
const withFighters = (s: BattleState, side: 0 | 1, f: (x: FighterState, pos: number) => FighterState): BattleState => {
  const fs = s.fighters.map((t, k) => (k === side ? t.map((x, i) => f(x, i + 1)) : t)) as unknown as BattleState["fighters"];
  return { ...s, fighters: fs };
};
const shieldOf = (f: FighterState | undefined): { value: number; turns: number } | undefined => f?.statuses.find((x) => x.id === "escudo");
const golpe = mkMove({ power: 50 });
const alcance = mkMove({ power: 50, modifier: "alcance" });
const area = mkMove({ power: 50, area: true });
const areaAtras = mkMove({ archetype: "maldicion", power: 50, area: true, modifier: "alcance", cost: 2 });
const tauntShield = mkMove({ archetype: "proteccion", target: "aliado", scalable: "escudo", power: 20, taunt: true });

describe("config v0.4 y Q-03", () => {
  it("la config vigente carga; las claves nuevas son obligatorias en v0.4", () => {
    assert.equal(BCFG04.combat.teamSize, 3);
    assert.equal(BCFG04.combat.slots, 4);
    assert.equal(BCFG04.combat.draws.perTurn, 24);
    assert.equal(BCFG04.moves.drawsPerMove, 8);
    assert.deepEqual(BCFG04.combat.synergy.bonusByCount, [0, 0, 0.1, 0.25]);
    assert.equal(BCFG04.combat.energy.perTurn, 4);
    for (const [path, del] of [
      ["equipo.casillas", (r: any) => delete r.equipo.casillas],
      ["dano.golpe_basico.activo", (r: any) => delete r.dano.golpe_basico.activo],
      ["ia.colocacion", (r: any) => delete r.ia.colocacion],
      ["variantes.descanso.gratis_descansa", (r: any) => delete r.variantes.descanso.gratis_descansa],
      ["equipo.tamano", (r: any) => (r.equipo.tamano = 5)],
      ["equipo.colocaciones", (r: any) => (r.equipo.colocaciones = ["3+0"])],
    ] as const) {
      const raw = rawCombat04Clone();
      del(raw);
      assert.throws(() => parseCombatConfig(raw), (e: unknown) => e instanceof ConfigError && e.message.startsWith(path), path);
    }
    const m = rawMoves04Clone();
    delete m.gratis;
    assert.throws(() => parseMovesConfig(m, GCFG), (e: unknown) => e instanceof ConfigError && e.message.startsWith("gratis"));
    const m2 = rawMoves04Clone();
    m2.gratis.permite_provocar = true;
    assert.throws(() => parseMovesConfig(m2, GCFG), ConfigError);
  });

  it("Q-03: una ruta mal escrita en forma larga falla (variantes, provocar, gratis, raíz, efectos)", () => {
    const combat: (readonly [readonly string[], unknown])[] = [
      [["variantes", "descanso", "actvo"], true],
      [["variantes", "objetivo_automatico", "prioridad_fil"], true],
      [["variantes", "provocar", "duración"], 2],
      [["variantes", "golpe_basico"], { activo: true }],
      [["equipo", "casilla"], 4],
      [["dano", "golpe_basico", "activa"], true],
      [["estados", "escudo", "renueva"], "siempre"],
      [["ia", "colocacion", "umbral"], 1],
      [["varaintes"], {}],
    ];
    for (const ch of combat) assert.throws(() => parseCombatConfig(patchRawConfig(rawCombat04Clone(), [ch])), ConfigError, ch[0].join("."));
    const moves: (readonly [readonly string[], unknown])[] = [
      [["provocar", "costo"], 9],
      [["provocar", "activa"], true],
      [["gratis", "presupuest"], 3],
      [["garantia_alcance", "locu"], "cola"],
      [["gratiss"], {}],
    ];
    for (const ch of moves) assert.throws(() => parseMovesConfig(patchRawConfig(rawMoves04Clone(), [ch]), GCFG), ConfigError, ch[0].join("."));
    // config v0.2 (regresión): también en los efectos de V1
    assert.throws(() => parseCombatConfig(patchRawConfig(rawCombatClone(), [[["variantes", "golpe_basico_efecto", "efectos", "brote", "probabilidad"], 0.1]])), ConfigError);
  });
});

describe("colocación (combate v0.4 §1, §7)", () => {
  const C = FLAT04.combat;
  it("24 colocaciones válidas, 12 de cada forma; validación sin tiradas", () => {
    const all = allPlacements(C);
    assert.equal(all.length, 24);
    assert.equal(all.filter((p) => placementShape(p, C) === "2+1").length, 12);
    assert.equal(all.filter((p) => placementShape(p, C) === "1+2").length, 12);
    assert.equal(validatePlacement([1, 3, 4], C), null);
    for (const bad of [[1, 2], [1, 1, 2], [0, 1, 2], [1, 2, 5], [1.5, 2, 3], "123", [1, 2, 3, 4]]) assert.notEqual(validatePlacement(bad, C), null, JSON.stringify(bad));
  });

  it("el estado guarda la casilla vacía como null (KO sin eventos); colocación inválida → regla de la IA", () => {
    const s = createBattle(team("a"), team("b"), FLAT04, [2, 3, 4], [1, 2, 3]);
    assert.equal(s.teams[0][0], null);
    assert.equal(s.fighters[0][0]?.ko, true);
    assert.deepEqual(placementOf(s, "A", FLAT04), { positions: [2, 3, 4], shape: "1+2" });
    assert.deepEqual(placementOf(s, "B", FLAT04), { positions: [1, 2, 3], shape: "2+1" });
    const bad = createBattle(team("a"), team("b"), FLAT04, [1, 1, 2]);
    assert.deepEqual(placementOf(bad, "A", FLAT04).positions, [1, 2, 3]); // misma vida ⇒ 2+1 en orden
  });

  it("regla de la IA: más vida delante; 1+2 si vida(1.ª) ≥ 1,15·vida(2.ª)", () => {
    const hp = (a: number, b: number, c: number): Combatant[] => [a, b, c].map((h, i) => mk04(`x${i}`, {}, { maxHp: h }));
    assert.deepEqual(referencePlacement(hp(290, 400, 300), C), [4, 1, 3]); // 400 ≥ 345 ⇒ 1+2
    assert.deepEqual(referencePlacement(hp(290, 330, 300), C), [3, 1, 2]); // 330 < 345 ⇒ 2+1
    assert.deepEqual(referencePlacement(hp(300, 300, 300), C), [1, 2, 3]); // empate: índice
    const strict = loadUmbral(1.0);
    assert.deepEqual(referencePlacement(hp(300, 300, 300), strict.combat), [1, 3, 4]);
  });
});

function loadUmbral(u: number) {
  const c = rawCombat04Clone();
  c.ia.colocacion.umbral_1_2 = u;
  return { combat: parseCombatConfig(c), moves: FLAT04.moves };
}

describe("objetivo automático con prioridad de fila (combate v0.4 §3)", () => {
  it("carriles con casilla vacía: 1+2 concentra los golpes en la única delantera", () => {
    const r = play(createBattle(team("a", { 1: golpe }), team("b"), FLAT04, [1, 2, 3], [1, 3, 4]), use([1, 2, 3], 1), free([1, 3, 4]));
    assert.deepEqual(acts(r, "A"), { 1: [1], 2: [1], 3: [1] });
    const r2 = play(createBattle(team("a", { 1: golpe }), team("b"), FLAT04, [1, 2, 4], [1, 2, 3]), use([1, 2, 4], 1), free([1, 2, 3]));
    assert.deepEqual(acts(r2, "A"), { 1: [1], 2: [2], 4: [2] }); // la trasera usa su carril igual
  });

  it("KO a mitad de turno: las acciones siguientes ven la trasera; la acción no se pierde", () => {
    const B = team("b", {}, [{ maxHp: 40 }]);
    const s = createBattle(team("a", { 1: golpe }), B, FLAT04, [1, 2, 3], [1, 3, 4]);
    const r = play(s, use([1, 2, 3], 1), free([1, 3, 4]));
    assert.deepEqual(acts(r, "A"), { 1: [1], 2: [4], 3: [3] });
    assert.ok(r.events.some((e) => e.type === "ko" && e.side === "B" && e.pos === 1));
    assert.ok(!r.events.some((e) => e.type === "lost"));
  });

  it("alcance salta la delantera (si no hay trasera viva, la delantera); área a toda la fila", () => {
    const s = createBattle(team("a", { 1: alcance, 2: area, 4: areaAtras }), team("b"), FLAT04, [1, 2, 3], [1, 2, 3]);
    assert.deepEqual(acts(play(s, [...use([1, 2], 1), ...free([3])], free([1, 2, 3])), "A"), { 1: [3], 2: [3], 3: [1] });
    const noBack = withFighters(s, 1, (f, p) => (p === 3 ? { ...f, hp: 0, ko: true } : f));
    assert.deepEqual(acts(play(noBack, [...use([1, 2], 1), ...free([3])], free([1, 2])), "A"), { 1: [1], 2: [2], 3: [1] });
    assert.deepEqual(acts(play(s, [{ actor: 1, move: 2, target: 0 }, { actor: 2, move: 4, target: 0 }, { actor: 3, move: 3, target: 0 }], free([1, 2, 3])), "A"), { 1: [1, 2], 2: [3], 3: [1] });
  });

  it("provocar desde la fila trasera desvía todos los ataques de un objetivo (no el área); dos provocadores: el del carril", () => {
    const B = [mk04("b1"), mk04("b2", { 1: tauntShield }), mk04("b3", { 1: tauntShield })];
    const s = createBattle(team("a", { 1: golpe, 2: area, 4: alcance }), B, FLAT04, [1, 2, 3], [1, 2, 3]);
    const one = play(s, [{ actor: 1, move: 1, target: 0 }, { actor: 2, move: 4, target: 0 }, { actor: 3, move: 2, target: 0 }], [...free([1, 2]), { actor: 3, move: 1, target: 0 }]);
    assert.deepEqual(acts(one, "A"), { 1: [3], 2: [3], 3: [1, 2] });
    assert.ok(one.events.some((e) => e.type === "shield" && e.side === "B" && e.pos === 3)); // escudo con provocar: al usuario
    const two = play(s, use([1, 2, 3], 1), [{ actor: 1, move: 3, target: 0 }, { actor: 2, move: 1, target: 0 }, { actor: 3, move: 1, target: 0 }]);
    assert.deepEqual(acts(two, "A"), { 1: [3], 2: [2], 3: [3] }); // carril 0 → B3; carril 1 → B2
  });

  it("cura y escudo automáticos: menor vida/máx; llenos → usuario sin curar; escudo a la fila expuesta con menos vida + escudo; área a la fila expuesta", () => {
    const cure = mkMove({ archetype: "curacion", target: "aliado", scalable: "cura", power: 30 });
    const shield = mkMove({ archetype: "proteccion", target: "aliado", scalable: "escudo", power: 30 });
    const areaCure = mkMove({ archetype: "curacion", target: "aliado", scalable: "cura", power: 30, area: true });
    const base = createBattle(team("a", { 1: cure, 2: shield, 4: areaCure }), team("b", { 3: mkFree({ archetype: "curacion", target: "aliado", scalable: "cura" }) }), FLAT04, [1, 2, 3], [1, 2, 3]);
    const hurt = withFighters(base, 0, (f, p) => ({ ...f, hp: [200, 100, 50][p - 1] as number }));
    const r = play(hurt, [{ actor: 1, move: 1, target: 0 }, { actor: 3, move: 2, target: 0 }, { actor: 2, move: 4, target: 0 }], free([1, 2, 3]));
    assert.deepEqual(acts(r, "A"), { 1: [3], 3: [2], 2: [1, 2] });
    const full = play(base, use([2], 1).concat(free([1, 3])), free([1, 2, 3]));
    assert.deepEqual(acts(full, "A")[2], [2]);
    assert.equal((full.events.find((e) => e.type === "heal" && e.side === "A") as Extract<BattleEvent, { type: "heal" }>).amount, 0);
    const shielded = withFighters(hurt, 0, (f, p) => (p === 2 ? { ...f, statuses: [{ id: "escudo", turns: 2, value: 150 }] } : f));
    assert.deepEqual(acts(play(shielded, use([3], 2).concat(free([1, 2])), free([1, 2, 3])), "A")[3], [1]); // 200 + 0 < 100 + 150
  });

  it("Q-01: un escudo pequeño suma pero no renueva; uno ≥ el actual renueva (todos los escudos, también el gratis)", () => {
    const freeShield = mkFree({ archetype: "proteccion", target: "aliado", scalable: "escudo", power: 20 });
    const s0 = createBattle(team("a", { 3: freeShield }), team("b", { 3: mkFree({ archetype: "curacion", target: "aliado", scalable: "cura" }) }), FLAT04, [1, 2, 3], [1, 2, 3]);
    const sh = (v1: number, t1: number): BattleState =>
      withFighters(s0, 0, (f, p) => (p === 1 ? { ...f, statuses: [{ id: "escudo", turns: t1, value: v1 }] } : p === 2 ? { ...f, statuses: [{ id: "escudo", turns: 2, value: 300 }] } : f));
    const big = play(sh(200, 1), [...use([1, 2], 1), ...free([3])], free([1, 2, 3]));
    // A3 escuda a A1 (200 + 290 < 300 + 290): 220, no renueva ⇒ desaparece al final de este turno
    assert.equal((big.events.find((e) => e.type === "shield" && e.side === "A") as Extract<BattleEvent, { type: "shield" }>).total, 220);
    assert.ok(big.events.some((e) => e.type === "expire" && e.side === "A" && e.pos === 1 && e.status === "escudo"));
    assert.equal(shieldOf(big.state.fighters[0][0]), undefined);
    const small = play(sh(10, 1), free([1, 2, 3]), free([1, 2, 3]));
    // 10 + 20 (≥ 10: renueva a 2) + 20 (< 30: no) + 20 = 70; tras el final de turno le queda 1
    assert.deepEqual(shieldOf(small.state.fighters[0][0]), { id: "escudo", turns: 1, value: 70 });
  });
});

describe("movimiento gratis y botones (combate v0.4 §2, §5)", () => {
  it("sin golpe básico: move 0 es inválido; plan inválido ⇒ todas usan el gratis", () => {
    const s = createBattle(team("a"), team("b"), FLAT04);
    assert.match(validatePlan(s, "A", use([1, 2, 3], 0), FLAT04) ?? "", /movimiento inválido 0/);
    const r = play(s, [{ actor: 9, move: 1, target: 0 }], free([1, 2, 3]));
    const plan = r.events.find((e): e is Extract<BattleEvent, { type: "plan" }> => e.type === "plan" && e.side === "A");
    assert.equal(plan?.valid, false);
    assert.deepEqual(plan?.actions.map((a) => a.move), [3, 3, 3]);
    assert.throws(() => createBattle([mk04("x", { 3: mkMove() }), mk04("y"), mk04("z")], team("b"), FLAT04), RangeError);
  });

  it("el gratis nunca descansa; los de pago sí", () => {
    let s = createBattle(team("a"), team("b"), FLAT04);
    for (let t = 0; t < 3; t++) {
      const r = play(s, [{ actor: 1, move: 3, target: 0 }, { actor: 2, move: t % 2 === 0 ? 1 : 2, target: 0 }, { actor: 3, move: 3, target: 0 }], free([1, 2, 3]));
      assert.ok(r.events.some((e) => e.type === "plan" && e.side === "A" && e.valid));
      s = r.state;
      assert.deepEqual(restingMoves(s, "A", 1), []);
      assert.deepEqual(restingMoves(s, "A", 2), [t % 2 === 0 ? 1 : 2]);
    }
    assert.match(validatePlan(s, "A", [{ actor: 1, move: 3, target: 0 }, { actor: 2, move: 1, target: 0 }, { actor: 3, move: 3, target: 0 }], FLAT04) ?? "", /descanso/);
  });

  it("sinergia con 2 y 3 almas de pago; el gratis ni cuenta ni la recibe", () => {
    const s = createBattle(team("a"), team("b"), FLAT04);
    const syn = (plan: Plan): readonly number[] => (play(s, plan, free([1, 2, 3])).events.find((e) => e.type === "plan" && e.side === "A") as Extract<BattleEvent, { type: "plan" }>).synergy;
    assert.deepEqual(syn(use([1, 2, 3], 1)), [0.25, 0.25, 0.25, 0]);
    assert.deepEqual(syn([...use([1, 2], 1), ...free([3])]), [0.1, 0.1, 0, 0]);
    assert.deepEqual(syn([...use([1], 1), ...free([2, 3])]), [0, 0, 0, 0]);
  });

  it("24 tiradas por turno con casilla vacía, en todas las formas", () => {
    for (const p of [[1, 2, 3], [2, 3, 4], [1, 2, 4], [1, 3, 4]]) {
      const s = createBattle(team("a", { 1: golpe }), team("b"), FLAT04, p, [4, 1, 3]);
      assert.equal(drawsConsumed("d", (rng) => resolveTurn(s, use([1, 2, 3, 4].filter((x) => p.includes(x)), 1), [{ actor: 7, move: 1, target: 0 }], rng, FLAT04)), 24, p.join());
    }
  });
});

describe("movimientos v0.4 (gratis, cola, provocar, descripción corta)", () => {
  const M = BCFG04.moves;
  const catalog = GCFG.catalog.map((g) => generateMove(g, M));

  it("catálogo de 72: válido; gratis en extremidades (coste 0, presupuesto 3); cola ofensiva con alcance o área", () => {
    for (const m of catalog) {
      assert.deepEqual(validateMove(m, M), [], m.id);
      if (m.locus === "extremidades") {
        assert.equal(m.cost, 0);
        assert.equal(m.budget, 3);
        assert.ok(["golpe", "golpe_estado", "proteccion", "curacion"].includes(m.archetype), m.id);
        assert.ok(m.power <= 20 && !m.taunt && !m.area, m.id);
      } else assert.ok(m.cost >= 1, m.id);
      if (m.locus === "cola") assert.ok(m.target === "enemigo" && (m.area || m.modifier === "alcance"), m.id);
    }
  });

  it("cuota de provocar (≥ 4: roca ≥ 2, marea ≥ 1, brote ≥ 1; ≤ 6) con las sales p*", () => {
    const t = catalog.filter((m) => m.taunt);
    const by = (f: string): number => t.filter((m) => m.family === f).length;
    assert.ok(t.length >= 4 && t.length <= 6);
    assert.ok(by("roca") >= 2 && by("marea") >= 1 && by("brote") >= 1);
    for (const m of t) assert.ok(["cabeza", "cuerpo"].includes(m.locus) && ["proteccion", "tactico"].includes(m.archetype));
  });

  it("genes mutados e híbridos: 4 000 claves válidas, gratis y garantía de alcance siempre", () => {
    const fams = [...GCFG.baseFamilies, ...GCFG.hybrids.map((h) => h.id)];
    const rng = createRng("mut04");
    const L = GCFG.shape.levels - 1;
    let taunts = 0;
    for (let i = 0; i < 4000; i++) {
      const f = fams[Math.floor(rng.next() * fams.length)] as string;
      const locus = ["cabeza", "cuerpo", "extremidades", "cola"][i % 4] as string;
      const sig = [0, 0, 0, 0].map(() => String(Math.floor(rng.next() * (L + 1)))).join("");
      const m = generateMoveForKey(`${f}|${locus}|${sig}`, M);
      assert.deepEqual(validateMove(m, M), [], m.key);
      if (locus === "extremidades") assert.equal(m.cost, 0);
      if (locus === "cola") assert.ok(m.area || m.modifier === "alcance", m.key);
      if (m.taunt) taunts++;
    }
    assert.ok(taunts > 0);
  });

  it("vector dorado del catálogo v0.4 (regenerado: cambian gratis, cola, provocar, alcance y presupuesto 1)", () => {
    assert.deepEqual(JSON.parse(JSON.stringify(catalog)), goldenCatalog04);
  });

  it("descripción corta (glosario §2): ejemplos y ≤ 3 fragmentos en todo el catálogo", () => {
    const d = (o: Parameters<typeof mkMove>[0]): string => describeMoveShort(mkMove(o), M);
    assert.equal(d({ power: 190, modifier: "drenaje" }), "190 · Drena");
    assert.equal(d({ archetype: "golpe_estado", power: 35, status: "quemadura", condition: "combo_familia" }), "35 · Quema · ×1,5 en combo");
    assert.equal(d({ archetype: "proteccion", target: "aliado", scalable: "escudo", power: 95, area: true, status: "prisa" }), "Escudo 95 a la fila · Prisa");
    assert.equal(d({ archetype: "golpe_estado", power: 60, modifier: "alcance", status: "marca" }), "60 atrás · Marca");
    assert.equal(d({ archetype: "proteccion", target: "aliado", scalable: "escudo", power: 120, taunt: true }), "Escudo 120 · Provoca");
    assert.equal(d({ archetype: "maldicion", power: 45, area: true, modifier: "alcance", status: "debilitar", condition: "reserva" }), "45 a la fila atrás · Debilita · ×1,5 con reserva");
    assert.equal(d({ power: 15, cost: 0 }), "15");
    assert.equal(d({ archetype: "tactico", power: 30, extraEnergy: 1, modifier: "prioridad" }), "30 primero · +1 energía");
    for (const m of catalog) assert.ok(describeMoveShort(m, M).split(" · ").length <= 3, m.id);
  });
});

describe("IA v0.4 (referencia y búsqueda)", () => {
  const pop = createWildPopulation(createRng("ia04"), GCFG, 6).map((c) => buildCombatant(c, BCFG04));
  const A = pop.slice(0, 3);
  const B = pop.slice(3);
  const planValid = (log: readonly (readonly BattleEvent[])[]): boolean => log.every((t) => t.every((e) => e.type !== "plan" || e.valid));

  it("la IA de referencia da planes válidos con las 24 colocaciones", () => {
    allPlacements(BCFG04.combat).forEach((p, i) => {
      const r = runBattle(A, B, `col${i}`, BCFG04, createReferenceAi(), createReferenceAi(), { A: p, B: allPlacements(BCFG04.combat)[23 - i] as number[] });
      assert.ok(planValid(r.log), p.join());
    });
  });

  it("la IA de búsqueda da planes válidos con las reglas nuevas (colocaciones de las dos formas)", () => {
    for (const p of [[1, 2, 3], [2, 3, 4], [1, 2, 4], [1, 3, 4]]) {
      const r = runBattle(A, B, `bus${p.join("")}`, BCFG04, createSearchAi({ simulations: 3, candidates: 4 }), createReferenceAi(), { A: p });
      assert.ok(planValid(r.log), p.join());
    }
  });

  it("honestidad: la búsqueda no toca el RNG de la partida, ni Math.random ni el reloj; mismo estado ⇒ mismo plan", () => {
    const s = createBattle(A, B, BCFG04, [1, 3, 4]);
    const g = globalThis as unknown as { Math: { random: () => number }; Date: { now: () => number } };
    const saved = { random: g.Math.random, now: g.Date.now };
    const boom = (): number => {
      throw new Error("prohibido");
    };
    g.Math.random = boom;
    g.Date.now = boom;
    try {
      const ai = createSearchAi({ simulations: 4 });
      const p1 = ai(s, "A", BCFG04);
      assert.deepEqual(ai(s, "A", BCFG04), p1);
      assert.equal(validatePlan(s, "A", p1, BCFG04), null);
    } finally {
      g.Math.random = saved.random;
      g.Date.now = saved.now;
    }
  });

  it("previsión y atacables para la interfaz coinciden con lo que ejecuta el motor", () => {
    const s = createBattle(team("a", { 1: golpe, 2: area, 4: alcance }), team("b"), FLAT04, [1, 2, 3], [1, 3, 4]);
    assert.deepEqual(attackable(s, "B", FLAT04), { row: [1], back: [3, 4], taunting: [] });
    assert.deepEqual(forecastTargets(s, "A", 2, 4, FLAT04), { side: "B", positions: [4] });
    assert.deepEqual(forecastTargets(s, "A", 1, 2, FLAT04), { side: "B", positions: [1] });
    const r = play(s, [{ actor: 2, move: 4, target: 0 }, ...free([1, 3])], free([1, 3, 4]));
    assert.deepEqual(acts(r, "A")[2], [4]);
  });
});

// Vector dorado de partida v0.4 (regenerado: reglas nuevas; v0.4.1: sales de familias). Si falla, ha cambiado el algoritmo o la config vigente.
const GOLDEN04 = { result: "A", turns: 5, hash: "e0a3b31ec5ba57115c1f37d390d02d6c" };
describe("vector dorado v0.4", () => {
  it("partida completa con semilla fija y colocación de la IA", () => {
    const pop = createWildPopulation(createRng("dorado-combate-v04"), GCFG, 6);
    const r = runBattle(pop.slice(0, 3), pop.slice(3), "dorado", BCFG04);
    assert.deepEqual({ result: r.result, turns: r.turns, hash: r.hash }, GOLDEN04);
  });
});
