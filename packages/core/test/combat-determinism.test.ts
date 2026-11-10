/** Determinismo, vector dorado, simetría e IA de referencia v0.2 (combate §10, §11). */
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
  energyPrice,
  resolveTurn,
  runBattle,
  validatePlan,
  type BattleEvent,
  type Creature,
  type BattleState,
  type FighterState,
  type Plan,
} from "../src/index.ts";
import { ALL, BCFG, GCFG, loadBattleConfig, mkFighter, mkMove, mkTeam, planOf } from "./combat-helpers.ts";
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
// Regenerado en v0.2 (energía +3, estadísticas por matriz, prioridad de aliado, IA con λ, movimientos v0.2).
// Regenerado otra vez con la propuesta de balance v0.2.1 (presupuestos, topes y sales de movimientos; escudo máx. 300):
// el algoritmo no cambia, solo los datos de config (mismas 24 tiradas por turno y 8 por movimiento).
const GOLDEN = { result: "A", turns: 12, hash: "424eb410a64fdf1ca58e5304c4aa2dac" };

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

describe("IA v0.2: precio de la energía, ahorro, remate y valor de estados (combate §10)", () => {
  /** Sin varianza, jitter ni ruido: el valor de los planes se calcula a mano. */
  const Q = loadBattleConfig((r) => {
    r.dano.varianza = 0;
    r.orden.jitter = 0;
  });
  const withHp = (st: BattleState, side: 0 | 1, hp: number[]): BattleState => {
    const fs = st.fighters[side].map((f, i) => ({ ...f, hp: hp[i] as number }));
    return { ...st, fighters: side === 0 ? [fs, st.fighters[1]] : [st.fighters[0], fs] };
  };

  it("energyPrice: λ = κ·máx (v̂ − 10·fA)/c, c* del mejor, v̂ de daño acotado por H (vida + escudo media)", () => {
    const small = mkMove({ power: 40, cost: 1 }); // r = 30
    const big = mkMove({ power: 250, cost: 5 }); // r = (min(250, H) − 10)/5
    const s = createBattle(mkTeam("a", "llama", [small, big, small, small]), mkTeam("b", "llama"), Q);
    const p = energyPrice(s, "A", Q);
    assert.ok(Math.abs(p.bestRate - (220 - 10) / 5) < 1e-9); // H = 220
    assert.ok(Math.abs(p.lambda - 0.9 * 42) < 1e-9);
    assert.equal(p.targetCost, 5);
    // enemigos casi muertos: H = 60 ⇒ el golpe grande ya no rinde más que el pequeño
    const low = withHp(s, 1, [60, 60, 60, 60]);
    const q = energyPrice(low, "A", Q);
    assert.deepEqual([q.bestRate, q.targetCost], [30, 1]);
    // el escudo enemigo cuenta en H; κ por opción
    const sh = { ...low, fighters: [low.fighters[0], low.fighters[1].map((f) => ({ ...f, statuses: [{ id: "escudo" as const, turns: 2, value: 100 }] }))] as const };
    assert.equal(energyPrice(sh, "A", Q).bestRate, (160 - 10) / 5);
    assert.equal(energyPrice(s, "A", Q, 0).lambda, 0);
    // cura, escudo, área y condición con sus estimaciones de config
    const heal = mkMove({ archetype: "curacion", scalable: "cura", target: "aliado", power: 100, cost: 2, area: true });
    const shield = mkMove({ archetype: "proteccion", scalable: "escudo", target: "aliado", power: 200, cost: 2, condition: "reserva" });
    const h = energyPrice(createBattle(mkTeam("a", "llama", [heal, heal, heal, heal]), mkTeam("b", "llama"), Q), "A", Q);
    assert.ok(Math.abs(h.bestRate - (100 * 0.6 * 1.5 - 10) / 2) < 1e-9);
    const e = energyPrice(createBattle(mkTeam("a", "llama", [shield, shield, shield, shield]), mkTeam("b", "llama"), Q), "A", Q);
    assert.ok(Math.abs(e.bestRate - (90 * 1.25 - 10) / 2) < 1e-9);
    // sin ningún movimiento que rinda más que el golpe: λ = 0 (no se penaliza guardar)
    const junk = mkMove({ power: 5, cost: 1 });
    assert.equal(energyPrice(createBattle(mkTeam("a", "llama", [junk, junk, junk, junk]), mkTeam("b", "llama"), Q), "A", Q).lambda, 0);
  });

  it("ahorra solo si el movimiento caro rinde más por energía (κ); con κ = 0 gasta", () => {
    // un solo actor con energía: el resto KO (así el valor de cada plan es fácil de calcular)
    const cheap = mkMove({ power: 60, cost: 3 }); // r = 50/3 ≈ 16,7
    const big = mkMove({ power: 220, cost: 5 }); // r = 42 ⇒ λ = 37,8, c* = 5
    let s = createBattle(mkTeam("a", "llama", [cheap, big, big, big]), mkTeam("b", "llama"), Q);
    s = { ...s, fighters: [s.fighters[0].map((f, i) => (i === 0 ? f : { ...f, ko: true, hp: 0 })), s.fighters[1]] };
    // e = 3: gastar (60 + 0) vale menos que guardar (10 + λ·3 = 123,4)
    assert.deepEqual(createReferenceAi()(s, "A", Q), [{ actor: 1, move: 0, target: 1 }]);
    assert.deepEqual(createReferenceAi({ kappa: 0 })(s, "A", Q), [{ actor: 1, move: 1, target: 1 }]);
    // e = 5: el caro se paga
    assert.equal(createReferenceAi()({ ...s, energy: [5, 5] }, "A", Q)[0]?.move, 2);
    // si el caro no rinde más por energía que el barato (rendimiento casi lineal), gasta
    const flatBig = mkMove({ power: 95, cost: 5 }); // r = 17 ⇒ λ = 15,3: 60 > 10 + 45,9
    const t = { ...s, teams: [s.teams[0].map((c) => ({ ...c, moves: [cheap, flatBig, flatBig, flatBig] })), s.teams[1]] as const };
    assert.equal(createReferenceAi()(t, "A", Q)[0]?.move, 1);
  });

  it("guardar vale como mucho c* y máx − por_turno; la energía extra vale λ", () => {
    const big = mkMove({ power: 220, cost: 5 });
    const s = createBattle(mkTeam("a", "llama", [big, big, big, big]), mkTeam("b", "llama"), Q);
    const one = { ...s, fighters: [s.fighters[0].map((f, i) => (i === 0 ? f : { ...f, ko: true, hp: 0 })), s.fighters[1]] as const };
    // táctico de coste 3 con +1 energía y daño 50: 50 + λ·(1 + min(e−3, 5, 7)) frente a golpe 10 + λ·min(e, 5, 7)
    const tac = mkMove({ archetype: "tactico", power: 50, cost: 3, extraEnergy: 1 });
    const t = { ...one, energy: [8, 8] as const, teams: [one.teams[0].map((c) => ({ ...c, moves: [tac, mkMove({ power: 10, cost: 9 }), mkMove({ power: 10, cost: 9 }), mkMove({ power: 10, cost: 9 })] })), one.teams[1]] as const };
    const p = energyPrice(t, "A", Q);
    assert.equal(p.targetCost, 3); // solo cuenta el táctico (r = 40/3)
    // golpe: 10 + λ·3; táctico: 50 + λ·(1 + 3) ⇒ elige el táctico
    assert.equal(createReferenceAi()(t, "A", Q)[0]?.move, 1);
  });

  it("objetivo de daño = el que maximiza daño útil + bonus de KO (remata), no el de más daño bruto", () => {
    const hit = mkMove({ family: "marea", power: 80, cost: 1 });
    // B1 es llama (marea ×1,25 ⇒ 100 de daño) con vida llena; B2 es marea con 60 de vida (80 ⇒ KO)
    const B = [mkFighter("b1", "llama"), mkFighter("b2", "marea"), mkFighter("b3", "marea"), mkFighter("b4", "marea")];
    let s = createBattle(mkTeam("a", "roca", [hit]), B, Q);
    s = withHp(s, 1, [220, 60, 220, 220]);
    s = { ...s, fighters: [s.fighters[0].map((f, i) => (i === 0 ? f : { ...f, ko: true, hp: 0 })), s.fighters[1]] };
    const plan = createReferenceAi({ kappa: 0 })(s, "A", Q);
    assert.deepEqual(plan, [{ actor: 1, move: 1, target: 2 }]); // 60 + 50 > 100
    // sin bonus de KO, el de más daño
    const noKo = loadBattleConfig((r) => {
      r.dano.varianza = 0;
      r.orden.jitter = 0;
      r.ia.bonus_ko = 0;
    });
    assert.deepEqual(createReferenceAi({ kappa: 0 })(s, "A", noKo), [{ actor: 1, move: 1, target: 1 }]);
  });

  it("valor de estados en vida; escudo descontando el que ya tiene; regenerar con tope por vida que falta", () => {
    const X = mkMove({ power: 10, cost: 9 }); // relleno inasequible
    const burn = mkMove({ archetype: "golpe_estado", status: "quemadura", power: 10, cost: 1 }); // 10 + 36
    const plain = mkMove({ power: 40, cost: 1 }); // 40
    let s = createBattle(mkTeam("a", "llama", [burn, plain, X, X]), mkTeam("b", "llama"), Q);
    s = { ...s, fighters: [s.fighters[0].map((f, i) => (i === 0 ? f : { ...f, ko: true, hp: 0 })), s.fighters[1]] };
    assert.equal(createReferenceAi({ kappa: 0 })(s, "A", Q)[0]?.move, 1);
    const cheap = loadBattleConfig((r) => {
      r.dano.varianza = 0;
      r.ia.valor_estado.quemadura = 20;
    });
    assert.equal(createReferenceAi({ kappa: 0 })(s, "A", cheap)[0]?.move, 2);
    // escudo: con 60 ya puestos, un escudo de 50 vale min(50, 90 − 60) = 30 < golpe de 40
    const shield = mkMove({ archetype: "proteccion", scalable: "escudo", target: "aliado", power: 50, cost: 1 });
    let t = createBattle(mkTeam("a", "llama", [shield, plain, X, X]), mkTeam("b", "llama"), Q);
    t = { ...t, fighters: [t.fighters[0].map((f, i) => (i === 0 ? f : { ...f, ko: true, hp: 0 })), t.fighters[1]] };
    assert.equal(createReferenceAi({ kappa: 0 })(t, "A", Q)[0]?.move, 1); // sin escudo: 50 > 40
    const sh: FighterState[] = t.fighters[0].map((f, i) => (i === 0 ? { ...f, statuses: [{ id: "escudo", turns: 2, value: 60 }] } : f));
    assert.equal(createReferenceAi({ kappa: 0 })({ ...t, fighters: [sh, t.fighters[1]] }, "A", Q)[0]?.move, 2);
    // regenerar con vida llena: min(45, 0 + 15) = 15; con 100 de vida que falta: 45
    const regen = mkMove({ archetype: "curacion", scalable: "cura", target: "aliado", status: "regenerar", power: 5, cost: 1 });
    const mid = mkMove({ power: 30, cost: 1 });
    let u = createBattle(mkTeam("a", "llama", [regen, mid, X, X]), mkTeam("b", "llama"), Q);
    u = { ...u, fighters: [u.fighters[0].map((f, i) => (i === 0 ? f : { ...f, ko: true, hp: 0 })), u.fighters[1]] };
    assert.equal(createReferenceAi({ kappa: 0 })(u, "A", Q)[0]?.move, 2); // 0 + 15 < 30
    assert.equal(createReferenceAi({ kappa: 0 })(withHp(u, 0, [120, 0, 0, 0]), "A", Q)[0]?.move, 1); // 5 + 45 > 30
  });

  it("partidas IA contra IA: con energía +3 se usan movimientos de coste 4–5 cuando se pueden pagar", () => {
    const rng = createRng("uso-caros");
    let affordable = 0;
    let used = 0;
    for (let i = 0; i < 40; i++) {
      const pop = createWildPopulation(rng, GCFG, 8);
      const r = runBattle(pop.slice(0, 4), pop.slice(4), `u${i}`, BCFG);
      for (const turn of r.log) {
        const energy = (turn[0] as Extract<BattleEvent, { type: "turn" }>).energy;
        for (const e of turn) {
          if (e.type !== "plan") continue;
          const side = e.side === "A" ? 0 : 1;
          if ((energy[side] as number) >= 4) affordable++;
          if (e.cost >= 4) used++;
        }
      }
    }
    assert.ok(affordable > 0 && used > 0, `${used}/${affordable}`);
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
