/** Determinismo, vector dorado, simetría e IA de referencia (combate §10, §11). */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import {
  battleHash,
  buildCombatant,
  createBattle,
  createReferenceAi,
  createRng,
  createWildPopulation,
  resolveTurn,
  runBattle,
  validatePlan,
  type BattleEvent,
  type Creature,
  type Plan,
} from "../src/index.ts";
import { ALL, BCFG, GCFG, mkMove, mkTeam, planOf } from "./combat-helpers.ts";
import { drawsConsumed, tol5 } from "./genetics-helpers.ts";

function teams(seed: string): [Creature[], Creature[]] {
  const pop = createWildPopulation(createRng(seed), GCFG, 8);
  return [pop.slice(0, 4), pop.slice(4)];
}

describe("determinismo (combate §11)", () => {
  const [A, B] = teams("det");
  const cA = A.map((c) => buildCombatant(c, BCFG));
  const cB = B.map((c) => buildCombatant(c, BCFG));

  it("24 tiradas por turno exactas: plan normal, plan inválido y turno con KO", () => {
    const s = createBattle(cA, cB, BCFG);
    const ai = createReferenceAi();
    const cases: [string, Plan, Plan][] = [
      ["ia", ai(s, "A", BCFG), ai(s, "B", BCFG)],
      ["inválido", [{ actor: 9, move: 0, target: 1 }], []],
      ["básicos", planOf(ALL, 0, 1), planOf(ALL, 0, 2)],
    ];
    for (const [name, a, b] of cases) assert.equal(drawsConsumed("t", (rng) => resolveTurn(s, a, b, rng, BCFG)), 24, name);
    const tiny = createBattle(mkTeam("a", "llama"), mkTeam("b", "llama").map((c) => ({ ...c, maxHp: 1 })), BCFG);
    assert.equal(drawsConsumed("k", (rng) => resolveTurn(tiny, planOf(ALL, 0, 1), planOf(ALL, 0, 1), rng, BCFG)), 24);
  });

  it("misma semilla + mismas acciones ⇒ mismo registro (JSON idéntico); no muta la entrada", () => {
    const s = createBattle(cA, cB, BCFG);
    const before = JSON.stringify(s);
    const ai = createReferenceAi();
    const pa = ai(s, "A", BCFG);
    const pb = ai(s, "B", BCFG);
    assert.equal(JSON.stringify(s), before, "la IA no muta el estado");
    const r1 = resolveTurn(s, pa, pb, createRng("x"), BCFG);
    const r2 = resolveTurn(s, pa, pb, createRng("x"), BCFG);
    assert.equal(JSON.stringify(s), before, "resolveTurn no muta el estado");
    assert.equal(JSON.stringify(r1), JSON.stringify(r2));
    const b1 = runBattle(A, B, 7, BCFG);
    const b2 = runBattle(A, B, "7", BCFG);
    assert.equal(JSON.stringify(b1.log), JSON.stringify(b2.log));
    assert.equal(b1.hash, battleHash(b1.log));
    assert.notEqual(runBattle(A, B, 8, BCFG).hash, b1.hash);
  });

  it("repetición: rejugar los planes registrados con la misma semilla reproduce el combate", () => {
    const rec = runBattle(A, B, "replay", BCFG);
    let s = createBattle(cA, cB, BCFG);
    const rng = createRng(BCFG.combat.seedPrefix + "replay");
    const log: (readonly BattleEvent[])[] = [];
    for (const turn of rec.log) {
      const plans = turn.filter((e): e is Extract<BattleEvent, { type: "plan" }> => e.type === "plan").map((p) => p.actions);
      const r = resolveTurn(s, plans[0] as Plan, plans[1] as Plan, rng, BCFG);
      log.push(r.events);
      s = r.state;
    }
    assert.equal(battleHash(log), rec.hash);
    assert.equal(s.result, rec.result);
  });
});

// Vector dorado (combate §11). Si falla, ha cambiado el algoritmo, el orden de
// tiradas, la IA o la generación de movimientos: rompe repeticiones guardadas.
const GOLDEN = { result: "B", turns: 9, hash: "d66e4bb22e10714893d1211c0f5d0e9c" };

describe("vector dorado", () => {
  it("partida completa con semilla fija: resultado, turnos y hash del registro", () => {
    const [A, B] = teams("dorado-combate");
    const r = runBattle(A, B, "dorado", BCFG);
    assert.deepEqual({ result: r.result, turns: r.turns, hash: r.hash }, GOLDEN);
  });
});

describe("simetría e IA de referencia (combate §10)", () => {
  it("equipos idénticos con lados intercambiados ⇒ A gana ≈ 50 % de las partidas decididas", () => {
    const rng = createRng("simetria");
    let a = 0;
    let decided = 0;
    for (let i = 0; i < 300; i++) {
      const team = createWildPopulation(rng, GCFG, 4);
      const r = runBattle(team, team, `s${i}`, BCFG);
      if (r.result === "empate") continue;
      decided++;
      if (r.result === "A") a++;
    }
    const p = a / decided;
    assert.ok(Math.abs(p - 0.5) < tol5(0.5, decided), `A ${a}/${decided}`);
  });

  it("los planes de la IA son siempre válidos (no hay respaldo) y la partida termina", () => {
    const rng = createRng("ia-valida");
    for (let i = 0; i < 40; i++) {
      const pop = createWildPopulation(rng, GCFG, 8);
      const r = runBattle(pop.slice(0, 4), pop.slice(4), i, BCFG, createReferenceAi({ reserve: i % 8 }), createReferenceAi());
      for (const e of r.log.flat()) if (e.type === "plan") assert.equal(e.valid, true, `${i}: ${e.reason}`);
      assert.ok(r.turns >= 1 && r.turns <= BCFG.combat.maxTurns);
    }
  });

  it("elige la combinación de más valor; con reserva alta ahorra si no hay KO", () => {
    const big = mkMove({ power: 100, cost: 3 });
    const pricey = mkMove({ power: 50, cost: 9 }); // inasequible: solo compiten golpe y `big`
    const s = createBattle(mkTeam("a", "llama", [big, pricey, pricey, pricey]), mkTeam("b", "llama"), BCFG);
    const plan = createReferenceAi()(s, "A", BCFG);
    assert.equal(validatePlan(s, "A", plan, BCFG), null);
    assert.equal(plan.filter((a) => a.move === 1).length, 1); // solo cabe uno (e = 3)
    assert.deepEqual(createReferenceAi({ reserve: 7 })(s, "A", BCFG), planOf(ALL, 0, 1));
    // con un KO al alcance no ahorra
    const weak = { ...s, fighters: [s.fighters[0], s.fighters[1].map((f) => ({ ...f, hp: 50 }))] as const };
    assert.equal(createReferenceAi({ reserve: 7 })(weak, "A", BCFG).filter((a) => a.move === 1).length, 1);
    // sin criaturas que puedan actuar: plan vacío
    const dead = { ...s, fighters: [s.fighters[0].map((f) => ({ ...f, ko: true, hp: 0 })), s.fighters[1]] as const };
    assert.deepEqual(createReferenceAi()(dead, "A", BCFG), []);
  });
});

describe("higiene del núcleo de combate", () => {
  it("combat/ y moves/: sin Math.random, reloj, **, pow/sqrt/log/exp/trig ni rng.normal", () => {
    let scanned = 0;
    for (const dir of ["../src/combat/", "../src/moves/"]) {
      const base = new URL(dir, import.meta.url);
      for (const rel of readdirSync(base, { recursive: true })) {
        if (!rel.endsWith(".ts")) continue;
        scanned++;
        const code = readFileSync(new URL(rel, base), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
        assert.ok(!/Math\.random|Date\.|Date\(|performance\.now/.test(code), `${rel}: azar/reloj`);
        assert.ok(!/\*\*|Math\.(log|exp|sin|cos|tan|atan|pow|sqrt|cbrt|hypot)|\.normal\(/.test(code), `${rel}: operación no permitida`);
      }
    }
    assert.ok(scanned >= 8);
  });
});
