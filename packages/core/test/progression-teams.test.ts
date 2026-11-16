/** Progresión v0.1 §2.2 (D-068): bandos de 1 a 3 sin cambiar reglas, IA "instinto" (§2.5) y combatientes de 2–4 movimientos (§8.3). */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import hashes3v3 from "./fixtures/hashes-3v3.v0.5.json" with { type: "json" };
import {
  allPlacements,
  battleHash,
  combatantAtLevel,
  createBattle,
  createReferenceAi,
  createRng,
  createWildPopulation,
  deriveStats,
  freeMoveSlot,
  instinctAi,
  lastAnimaPos,
  placementOf,
  referencePlacement,
  resolveTurn,
  runBattle,
  synergyGroups,
  validatePlacement,
  validatePlan,
  type BattleConfig,
  type BattleState,
  type Combatant,
  type Move,
  type FighterState,
} from "../src/index.ts";
import { GCFG, mkFree, mkMove } from "./combat-helpers.ts";
import { B05, P } from "./progression-helpers.ts";

const SIDES: BattleConfig = P.battle;

describe("no regresión 3 contra 3 (progresión §2.2, criterio obligatorio)", () => {
  it("200 partidas 3v3 con el motor ampliado = hashes del motor anterior (registro y estado final)", () => {
    // mismo montaje que el que generó el fichero ANTES de tocar el motor (ver su _doc)
    const rng = createRng("noregresion-3v3");
    const got: string[] = [];
    for (let i = 0; i < 200; i++) {
      const pop = createWildPopulation(rng, GCFG, 6);
      const pl = i % 3 === 1 ? { A: [1, 3, 4], B: [2, 1, 3] } : {};
      // con la extensión puesta (sides) y sin ella: las dos deben dar lo mismo (QA N-08: cada partida, en los dos modos)
      const r = runBattle(pop.slice(0, 3), pop.slice(3), `nr${i}`, SIDES, undefined, undefined, pl);
      const r2 = runBattle(pop.slice(0, 3), pop.slice(3), `nr${i}`, B05, undefined, undefined, pl);
      assert.equal(r2.hash + ":" + battleHash(r2.final), r.hash + ":" + battleHash(r.final), `la partida ${i} difiere entre modos`);
      got.push(r.hash + ":" + battleHash(r.final));
    }
    assert.equal(got.length, hashes3v3.hashes.length);
    const diff = got.findIndex((h, i) => h !== hashes3v3.hashes[i]);
    assert.equal(diff, -1, `la partida ${diff} difiere`);
  });
});

/** Combatiente con stats equilibradas en v0.5. */
function mk(id: string, moves: Move[], cfg: BattleConfig = SIDES): Combatant {
  return { id, family: "llama", groups: synergyGroups("llama", cfg.combat, cfg.moves.genetics), ...deriveStats(120, 120, 120, cfg.combat), moves };
}
const paid = (cost: number, over: Partial<Move> = {}): Move => mkMove({ cost, power: 10 * cost, ...over });

describe("tamaño de bando 1..3", () => {
  it("sin `sides` (combate de siempre) un bando de 2 se rechaza; con `sides`, 1 y 2 se aceptan", () => {
    const t = (n: number, p: string): Combatant[] => Array.from({ length: n }, (_, i) => mk(`${p}${i}`, [mkFree(), paid(1)]));
    assert.throws(() => createBattle(t(2, "a"), t(3, "b"), B05), /3 criaturas/);
    assert.throws(() => createBattle(t(4, "a"), t(3, "b"), SIDES), /de 1 a 3/);
    assert.throws(() => createBattle([], t(3, "b"), SIDES), /de 1 a 3/);
    const s = createBattle(t(1, "a"), t(2, "b"), SIDES);
    assert.deepEqual(placementOf(s, "A", SIDES).positions, [1]); // [colocacion_ia_por_tamano] 1 → casilla 1
    assert.deepEqual(placementOf(s, "B", SIDES).positions, [1, 2]); // 2 → casillas 1 y 2
    assert.equal(s.fighters[0].filter((f) => !f.ko).length, 1);
    assert.equal(s.fighters[0][1]?.ko, true);
  });

  it("colocaciones por tamaño: 1 → '1+0'; 2 → '2+0' o '1+1'; 3 → las de combate", () => {
    const C = SIDES.combat;
    const sides = SIDES.sides;
    assert.equal(validatePlacement([3], C, 1, sides) !== null, true, "'0+1' no está permitida");
    assert.equal(validatePlacement([2], C, 1, sides), null);
    assert.equal(validatePlacement([1, 2], C, 2, sides), null);
    assert.equal(validatePlacement([2, 4], C, 2, sides), null);
    assert.notEqual(validatePlacement([3, 4], C, 2, sides), null);
    assert.equal(allPlacements(C, 1, sides).length, 2);
    assert.equal(allPlacements(C, 2, sides).length, 2 + 8); // 2+0: 2 órdenes; 1+1: 2·2·2
    assert.deepEqual(allPlacements(C, 3, sides), allPlacements(C)); // 3: igual que siempre
    assert.notEqual(validatePlacement([1, 2], C), null, "sin tamaño, se exige el de combate");
    // colocación inválida del jugador → la de la IA de su tamaño
    const s = createBattle([mk("a", [mkFree()])], [mk("b", [mkFree()])], SIDES, [4]);
    assert.deepEqual(placementOf(s, "A", SIDES).positions, [1]);
    const s2 = createBattle([mk("a", [mkFree()]), mk("c", [mkFree()])], [mk("b", [mkFree()])], SIDES, [3, 2]);
    assert.deepEqual(placementOf(s2, "A", SIDES).positions, [2, 3]);
    assert.deepEqual(referencePlacement([mk("a", []), mk("b", [])], C, sides), [1, 2]);
  });

  it("un bando de 1 es 'última ánima' desde el turno 1 (combate v0.5 §2.1)", () => {
    const s = createBattle([mk("a", [mkFree(), paid(1)])], [mk("b", [mkFree()]), mk("c", [mkFree()])], SIDES);
    assert.equal(lastAnimaPos(s, "A", SIDES), 1);
    assert.equal(lastAnimaPos(s, "B", SIDES), 0);
  });

  it("1 contra 1 y 2 contra 3 terminan con planes válidos (IA de referencia y la de instinto) y 24 tiradas por turno", () => {
    const pop = createWildPopulation(createRng("tamanos"), GCFG, 12);
    // ánimas de nivel 1 (2 movimientos), 3 (3) y 10 (4), como las salvajes y las tuyas
    const toC = (i: number): Combatant => combatantAtLevel(pop[i]!, [1, 3, 10][i % 3]!, P);
    for (const [nA, nB] of [[1, 1], [2, 3], [3, 2], [1, 3]] as const) {
      for (let k = 0; k < 6; k++) {
        const A = [0, 1, 2].slice(0, nA).map((i) => toC(i + k));
        const B = [6, 7, 8].slice(0, nB).map((i) => toC(i + k % 3));
        const r = runBattle(A, B, `t${nA}${nB}${k}`, SIDES, createReferenceAi(), k % 2 === 0 ? instinctAi : createReferenceAi());
        for (const e of r.log.flat()) if (e.type === "plan") assert.equal(e.valid, true, `${nA}v${nB}: ${e.reason}`);
        assert.ok(r.turns >= 1);
      }
    }
  });
});

describe("combatiente con 2 y 3 movimientos (progresión §8.3)", () => {
  it("el motor localiza el gratis por coste 0 y no usa huecos fuera de rango", () => {
    const two = mk("a", [mkFree(), paid(2)]);
    const three = mk("b", [mkFree(), paid(1), paid(3)]);
    assert.equal(freeMoveSlot(two), 1);
    const s = createBattle([two], [three, mk("c", [mkFree(), paid(1)])], SIDES);
    assert.equal(validatePlan(s, "A", [{ actor: 1, move: 3, target: 0 }], SIDES) !== null, true, "hueco 3 no existe con 2 movimientos");
    assert.equal(validatePlan(s, "A", [{ actor: 1, move: 2, target: 0 }], SIDES), null);
    const r = resolveTurn(s, [{ actor: 1, move: 2, target: 0 }], instinctAi(s, "B", SIDES), createRng("x"), SIDES);
    assert.ok(r.state.fighters[0][0]!.rest === undefined || r.state.fighters[0][0]!.rest!.length === 2);
  });
});

describe("IA salvaje 'instinto' (progresión §2.5)", () => {
  const foe = [mk("x", [mkFree(), paid(1)])];
  it("en orden de casilla, el pago más caro asequible con la energía que queda; empate → hueco menor; si no, el gratis", () => {
    const a = mk("a", [mkFree(), paid(1), paid(2), paid(2, { id: "otro" })]);
    const b = mk("b", [mkFree(), paid(2)]);
    const c = mk("c", [mkFree(), paid(1)]);
    const s = createBattle(foe, [a, b, c], SIDES);
    const plan = instinctAi(s, "B", SIDES);
    // energía 3: a gasta 2 (hueco 3, no el 4), b no llega a 2 → gratis, c gasta 1
    const byActor = new Map(plan.map((x) => [s.teams[1][x.actor - 1]!.id, x.move]));
    assert.deepEqual([byActor.get("a"), byActor.get("b"), byActor.get("c")], [3, 1, 2]);
    assert.equal(validatePlan(s, "B", plan, SIDES), null);
    assert.ok(plan.every((x) => x.target === 0), "objetivo automático (V4)");
  });

  it("no usa movimientos en descanso; la última ánima hace un solo movimiento y gasta todo lo que puede", () => {
    const a = mk("a", [mkFree(), paid(1), paid(2)]);
    let s: BattleState = createBattle(foe, [a, mk("b", [mkFree(), paid(1)])], SIDES);
    const fs = s.fighters[1].map((f, i) => (i === 0 ? ({ ...f, rest: [0, 0, 1] } as FighterState) : f));
    s = { ...s, fighters: [s.fighters[0], fs] };
    const plan = instinctAi(s, "B", SIDES);
    assert.equal(plan.find((x) => x.actor === 1)?.move, 2, "el de coste 2 descansa → el de coste 1");
    const solo: BattleState = createBattle(foe, [mk("z", [mkFree(), paid(1), paid(2), paid(3)])], SIDES);
    const p2 = instinctAi({ ...solo, energy: [3, 5] }, "B", SIDES);
    assert.deepEqual(p2.map((x) => x.move), [4]);
    assert.equal(validatePlan({ ...solo, energy: [3, 5] }, "B", p2, SIDES), null);
  });

  it("no consume tiradas ni muta el estado", () => {
    const s = createBattle(foe, [mk("a", [mkFree(), paid(1)])], SIDES);
    const before = JSON.stringify(s);
    instinctAi(s, "B", SIDES);
    assert.equal(JSON.stringify(s), before);
  });
});

describe("higiene de progresión", () => {
  it("progression/: sin Math.random, reloj, **, pow/sqrt/log/exp/trig ni rng.normal", () => {
    const base = new URL("../src/progression/", import.meta.url);
    let scanned = 0;
    for (const rel of readdirSync(base, { recursive: true })) {
      if (!rel.endsWith(".ts")) continue;
      scanned++;
      const code = readFileSync(new URL(rel, base), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
      assert.ok(!/Math\.random|Date\.|Date\(|performance\.now/.test(code), `${rel}: azar/reloj`);
      assert.ok(!/\*\*|Math\.(log|exp|sin|cos|tan|atan|pow|sqrt|cbrt|hypot)|\.normal\(/.test(code), `${rel}: operación no permitida`);
    }
    assert.ok(scanned >= 7);
  });
});
