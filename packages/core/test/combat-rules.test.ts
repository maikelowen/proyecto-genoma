/** Tests de reglas del motor de combate v0.2 (spec docs/spec/combate-v0.2.md). */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildCombatant,
  createBattle,
  createRng,
  damageAmount,
  deriveStats,
  eligibleActors,
  planSynergy,
  resolveTurn,
  validatePlan,
  type Action,
  type BattleConfig,
  type BattleEvent,
  type BattleState,
  type Combatant,
  type FighterState,
  type Move,
  type Plan,
  type TurnResult,
} from "../src/index.ts";
import { ALL, BCFG, loadBattleConfig, mkFighter, mkMove, mkTeam, planOf } from "./combat-helpers.ts";
import { pureCreature } from "./genetics-helpers.ts";

/** var = 1, sin jitter, golpe básico de potencia 0: solo cuentan los movimientos. */
const FLAT = loadBattleConfig((r) => {
  r.dano.varianza = 0;
  r.orden.jitter = 0;
  r.dano.golpe_basico.potencia = 0;
});
/** var = 1 y sin jitter, golpe básico normal (10). */
const FLAT10 = loadBattleConfig((r) => {
  r.dano.varianza = 0;
  r.orden.jitter = 0;
});

function play(state: BattleState, a: Plan, b: Plan, cfg: BattleConfig = FLAT): TurnResult {
  return resolveTurn(state, a, b, createRng(`t${state.turn}`), cfg);
}
function evs<T extends BattleEvent["type"]>(r: TurnResult, type: T): Extract<BattleEvent, { type: T }>[] {
  return r.events.filter((e): e is Extract<BattleEvent, { type: T }> => e.type === type);
}
const basics = (target = 1): Action[] => planOf(ALL, 0, target);
/** Plan: actor 1 usa `move` sobre `target`; el resto, golpe básico. */
const lead = (move: number, target: number, rest = 1): Action[] => [{ actor: 1, move, target }, ...planOf([2, 3, 4], 0, rest)];
function fighter(state: BattleState, side: 0 | 1, pos: number): FighterState {
  return state.fighters[side][pos - 1] as FighterState;
}
function withFighters(state: BattleState, side: 0 | 1, patch: (fs: FighterState[]) => void): BattleState {
  const fs = state.fighters[side].map((f) => ({ ...f }));
  patch(fs);
  return { ...state, fighters: side === 0 ? [fs, state.fighters[1]] : [state.fighters[0], fs] };
}

describe("estadísticas derivadas (combate §1)", () => {
  it("equilibrada: vida 220, fA 1, iniciativa 100; cuotas y q con β", () => {
    const d = deriveStats(120, 120, 120, BCFG.combat);
    assert.equal(d.maxHp, 220);
    assert.ok(Math.abs(d.attack - 1) < 1e-12);
    assert.ok(Math.abs(d.initiative - 100) < 1e-12);
    // [v0.2] σP = 0,5, σV = σR = 0,25 ⇒ dP = 0,5, dV = dR = −0,25
    const sp = deriveStats(180, 90, 90, BCFG.combat);
    assert.ok(Math.abs(sp.attack - (1 + 0.5 * 0.5 + 0.1 * -0.25)) < 1e-12); // 1,225
    assert.equal(sp.maxHp, 190); // 220 · (1 − 0,45·0,25 − 0,10·0,25) = 189,75
    assert.ok(Math.abs(sp.initiative - (100 - 50 * 0.25)) < 1e-12);
    // velocidad: aporta vida, ataque e iniciativa (σV = 0,5)
    const sv = deriveStats(90, 180, 90, BCFG.combat);
    assert.equal(sv.maxHp, Math.round(220 * (1 + 0.45 * -0.25 + 0.1 * 0.5)));
    assert.ok(Math.abs(sv.attack - (1 + 0.5 * -0.25 + 0.1 * 0.5)) < 1e-12);
    assert.ok(Math.abs(sv.initiative - 125) < 1e-12);
    // matriz configurable: con coef = 0 todo es la base
    const flat = loadBattleConfig((r) => {
      for (const d of ["vida", "ataque", "iniciativa"]) for (const k of ["potencia", "velocidad", "resistencia"]) r.estadisticas[d].coef[k] = 0;
    }).combat;
    const z = deriveStats(300, 30, 30, flat);
    assert.deepEqual([z.maxHp, z.initiative], [Math.round(220 * z.stats.q), 100]);
    const hi = deriveStats(126, 126, 126, BCFG.combat); // T = 378
    assert.ok(Math.abs(hi.stats.q - (1 + (0.04 * 18) / 360)) < 1e-12);
    const b0 = loadBattleConfig((r) => (r.estadisticas.beta_calidad = 0)).combat;
    assert.equal(deriveStats(126, 126, 126, b0).stats.q, 1);
    assert.equal(deriveStats(126, 126, 126, b0).maxHp, 220);
  });

  it("buildCombatant: 4 movimientos por locus, grupos de sinergia y familia", () => {
    const c = buildCombatant(pureCreature("p", "roca"), BCFG);
    assert.equal(c.moves.length, 4);
    assert.deepEqual(c.moves.map((m) => m.locus), ["cabeza", "cuerpo", "extremidades", "cola"]);
    assert.deepEqual(c.groups, ["roca"]);
    assert.equal(c.maxHp, deriveStats(c.stats.P, c.stats.V, c.stats.R, BCFG.combat).maxHp);
    assert.deepEqual(mkFighter("v", "vapor").groups, ["vapor", "llama", "marea"]);
  });
});

describe("energía y golpe básico (combate §3)", () => {
  it("inicio 3, +3 por turno [v0.2], máximo 10; se paga el plan", () => {
    let s = createBattle(mkTeam("a", "llama"), mkTeam("b", "llama"), FLAT);
    assert.deepEqual(s.energy, [3, 3]);
    const seen: number[] = [];
    for (let i = 0; i < 5; i++) {
      s = play(s, basics(), basics()).state;
      seen.push(s.energy[0]);
    }
    assert.deepEqual(seen, [6, 9, 10, 10, 10]);
    const t = createBattle(mkTeam("a", "llama", [mkMove({ cost: 3 })]), mkTeam("b", "llama"), FLAT);
    const r = play(t, lead(1, 1), basics());
    assert.equal(evs(r, "plan")[0]?.energy, 0);
    assert.deepEqual(r.state.energy, [3, 6]);
  });

  it("golpe básico: coste 0 (válido con energía 0), potencia 10, familia de la criatura", () => {
    let s = createBattle(mkTeam("a", "llama", [mkMove({ cost: 3 })]), mkTeam("b", "brote"), FLAT10);
    s = play(s, lead(1, 1), basics(), FLAT10).state; // A gasta 3 ⇒ 0 + 3
    s = { ...s, energy: [0, s.energy[1]] };
    assert.equal(validatePlan(s, "A", basics(), FLAT10), null);
    const r = play(s, basics(), basics(), FLAT10);
    const dmg = evs(r, "damage");
    assert.ok(dmg.some((d) => d.side === "B" && d.amount === 13)); // 10 · 1,25 (llama → brote)
    assert.ok(dmg.some((d) => d.side === "A" && d.amount === 8)); // 10 · 0,8 (brote → llama)
  });
});

describe("familias: dos anillos (combate §6)", () => {
  const C = BCFG.combat;
  const d = (a: string, b: string): number => damageAmount(100, 1, a, b, false, false, 1, 1, C);
  it("anillo base y anillo híbrido en ambos sentidos; base ↔ híbrida neutral", () => {
    const base = ["marea", "llama", "brote", "roca", "voltio", "sombra"];
    const hyb = ["vapor", "magma", "espora", "liquen", "plasma", "tormenta", "abismo"];
    for (const ring of [base, hyb]) {
      ring.forEach((f, i) => {
        const next = ring[(i + 1) % ring.length] as string;
        assert.equal(d(f, next), 125, `${f}→${next}`);
        assert.equal(d(next, f), 80, `${next}→${f}`);
        assert.equal(d(f, f), 100);
      });
    }
    for (const b of base) for (const h of hyb) assert.ok(d(b, h) === 100 && d(h, b) === 100, `${b}/${h}`);
    assert.equal(d("llama", "roca"), 100);
    // ventaja media 0 para todas (13 familias, 1 presa y 1 depredador)
    for (const a of [...base, ...hyb]) {
      let s = 0;
      for (const b of [...base, ...hyb]) s += C.families.table[a]?.[b] as number;
      assert.ok(Math.abs(s - 13 - 0.05) < 1e-9, a);
    }
  });
  it("en el motor: el movimiento usa su familia (no la de la criatura)", () => {
    const s = createBattle(mkTeam("a", "llama", [mkMove({ family: "marea", power: 100 })]), mkTeam("b", "llama"), FLAT);
    const r = play(s, lead(1, 1), basics());
    assert.equal(evs(r, "damage").find((e) => e.side === "B")?.amount, 125);
  });
});

describe("sinergia (combate §7)", () => {
  it("grupo más numeroso; híbrida cuenta en sus componentes; el golpe no cuenta", () => {
    const team = [mkFighter("1", "llama"), mkFighter("2", "llama"), mkFighter("3", "vapor"), mkFighter("4", "roca")];
    assert.deepEqual(planSynergy(team, planOf(ALL, 1, 1), BCFG.combat).bonus, [0.2, 0.2, 0.2, 0]);
    assert.deepEqual(planSynergy(team, [...planOf([1, 3], 1, 1), ...planOf([2, 4], 0, 1)], BCFG.combat).bonus, [0.1, 0, 0.1, 0]);
    const t2 = [mkFighter("1", "vapor"), mkFighter("2", "tormenta"), mkFighter("3", "roca"), mkFighter("4", "roca")];
    const s2 = planSynergy(t2, planOf(ALL, 1, 1), BCFG.combat);
    assert.deepEqual(s2.bonus, [0.1, 0.1, 0.1, 0.1]);
    assert.deepEqual(s2.combo, [true, true, true, true]);
    assert.deepEqual(planSynergy(mkTeam("x", "llama"), planOf(ALL, 1, 1), BCFG.combat).bonus, [0.3, 0.3, 0.3, 0.3]);
    assert.deepEqual(planSynergy(mkTeam("x", "llama"), basics(), BCFG.combat).bonus, [0, 0, 0, 0]);
  });
  it("en el motor: +10 % de potencia con 2 del mismo grupo", () => {
    const s = createBattle(mkTeam("a", "roca", [mkMove({ family: "roca", power: 100 })]), mkTeam("b", "roca"), FLAT);
    const r = play(s, [...planOf([1, 2], 1, 1), ...planOf([3, 4], 0, 1)], basics());
    assert.deepEqual(evs(r, "plan")[0]?.synergy, [0.1, 0.1, 0, 0]);
    assert.deepEqual(evs(r, "damage").filter((e) => e.side === "B" && e.amount > 0).map((e) => e.amount), [110, 110]);
  });
});

describe("orden e iniciativa (combate §4)", () => {
  it("empates de iniciativa: A primero en turnos impares, B en pares; luego posición", () => {
    let s = createBattle(mkTeam("a", "llama"), mkTeam("b", "llama"), FLAT);
    const r1 = play(s, basics(), basics());
    assert.deepEqual(evs(r1, "order")[0]?.queue.map((q) => `${q.side}${q.actor}`), ["A1", "A2", "A3", "A4", "B1", "B2", "B3", "B4"]);
    s = r1.state;
    const r2 = play(s, basics(), basics());
    assert.deepEqual(evs(r2, "order")[0]?.queue.map((q) => `${q.side}${q.actor}`), ["B1", "B2", "B3", "B4", "A1", "A2", "A3", "A4"]);
  });
  it("prioridad antes que iniciativa; prisa +30 y ralentizar −30 (se suman)", () => {
    const team = mkTeam("a", "llama", [mkMove({ modifier: "prioridad" })]);
    const s = createBattle(team, mkTeam("b", "llama").map((c) => ({ ...c, initiative: 140 })), FLAT);
    const r = play(s, [{ actor: 4, move: 1, target: 1 }, ...planOf([1, 2, 3], 0, 1)], basics());
    const q = evs(r, "order")[0]?.queue ?? [];
    assert.equal(`${q[0]?.side}${q[0]?.actor}`, "A4");
    assert.equal(q[0]?.priority, 1);
    const st = withFighters(s, 0, (fs) => {
      fs[0] = { ...(fs[0] as FighterState), statuses: [{ id: "prisa", turns: 2, value: 0 }] };
      fs[1] = { ...(fs[1] as FighterState), statuses: [{ id: "ralentizar", turns: 2, value: 0 }] };
      fs[2] = { ...(fs[2] as FighterState), statuses: [{ id: "ralentizar", turns: 2, value: 0 }, { id: "prisa", turns: 1, value: 0 }] };
    });
    const ini = (evs(play(st, basics(), basics()), "order")[0]?.queue ?? []).filter((x) => x.side === "A").map((x) => [x.actor, x.initiative]);
    assert.deepEqual(new Map(ini as [number, number][]), new Map([[1, 130], [2, 70], [3, 100], [4, 100]]));
  });
  it("[v0.2] movimientos de aliado (curación y protección) con prioridad 1 implícita; el golpe básico, 0", () => {
    const heal = mkMove({ archetype: "curacion", scalable: "cura", target: "aliado", power: 50 });
    const shield = mkMove({ archetype: "proteccion", scalable: "escudo", target: "aliado", power: 50 });
    const slow = mkTeam("a", "llama", [heal, shield]).map((c) => ({ ...c, initiative: 10 }));
    const fast = mkTeam("b", "llama", [mkMove({ modifier: "prioridad" })]).map((c) => ({ ...c, initiative: 190 }));
    const s = createBattle(slow, fast, FLAT);
    const plan: Action[] = [{ actor: 3, move: 1, target: 1 }, { actor: 4, move: 2, target: 1 }, ...planOf([1, 2], 0, 1)];
    const q = evs(play(s, plan, basics()), "order")[0]?.queue ?? [];
    assert.deepEqual(q.slice(0, 2).map((x) => `${x.side}${x.actor}:${x.priority}`), ["A3:1", "A4:1"]);
    assert.ok(q.filter((x) => x.side === "A" && x.actor <= 2).every((x) => x.priority === 0));
    // con `prioridad` el rival empata a nivel 1 y decide la iniciativa
    const q2 = evs(play(s, plan, [{ actor: 1, move: 1, target: 1 }, ...planOf([2, 3, 4], 0, 1)]), "order")[0]?.queue ?? [];
    assert.equal(`${q2[0]?.side}${q2[0]?.actor}`, "B1");
    // palanca: orden.prioridad_movimientos_aliado = 0 ⇒ actúan por iniciativa
    const off = loadBattleConfig((r) => {
      r.dano.varianza = 0;
      r.orden.jitter = 0;
      r.dano.golpe_basico.potencia = 0;
      r.orden.prioridad_movimientos_aliado = 0;
    });
    const q3 = evs(play(createBattle(slow, fast, off), plan, basics(), off), "order")[0]?.queue ?? [];
    assert.equal(q3[0]?.side, "B");
  });
  it("con jitter: misma iniciativa base ⇒ cada lado primero ≈ 50 % (C1 informativo)", () => {
    const s = createBattle(mkTeam("a", "llama"), mkTeam("b", "llama"), BCFG);
    const rng = createRng("ini");
    const cfg0 = loadBattleConfig((x) => (x.dano.golpe_basico.potencia = 0));
    let aFirst = 0;
    const n = 400;
    for (let i = 0; i < n; i++) {
      const r = resolveTurn({ ...s, turn: 1 }, basics(), basics(), rng, cfg0);
      const q = evs(r, "order")[0]?.queue ?? [];
      const a1 = q.findIndex((x) => x.side === "A" && x.actor === 1);
      const b1 = q.findIndex((x) => x.side === "B" && x.actor === 1);
      if (a1 < b1) aFirst++;
    }
    assert.ok(Math.abs(aFirst / n - 0.5) < 5 * Math.sqrt(0.25 / n), `${aFirst}`);
  });
});

describe("daño, escudo, cura y drenaje (combate §5)", () => {
  it("varianza: var ∈ [0,8; 1,2]; mínimo 1 si pot > 0; desgaste desde el turno 11", () => {
    const C = BCFG.combat;
    assert.equal(damageAmount(100, 1, "llama", "llama", false, false, 0.8, 1, C), 80);
    assert.equal(damageAmount(100, 1, "llama", "llama", false, false, 1.2, 1, C), 120);
    assert.equal(damageAmount(1, 0.1, "llama", "marea", false, false, 0.8, 1, C), 1);
    assert.equal(damageAmount(0, 1, "llama", "llama", false, false, 1, 1, C), 0);
    assert.equal(damageAmount(100, 1, "llama", "llama", false, false, 1, 10, C), 100);
    assert.equal(damageAmount(100, 1, "llama", "llama", false, false, 1, 12, C), 150);
    const s = createBattle(mkTeam("a", "llama", [mkMove({ power: 100 })]), mkTeam("b", "llama"), BCFG);
    for (let i = 0; i < 30; i++) {
      const amt = evs(resolveTurn(s, lead(1, 1), basics(), createRng(`v${i}`), BCFG), "damage").find((e) => e.side === "B" && e.amount > 15)?.amount as number;
      assert.ok(amt >= 80 && amt <= 120, `${amt}`);
    }
  });
  it("escudo absorbe primero, suma con el máximo de la config [v0.2], perforar lo ignora", () => {
    // El máximo sale de la config (los ajustes de balance no deben romper este test de reglas).
    // Dos escudos suman más que el máximo (S = 0,6·M ⇒ 2S > M), y el golpe supera al escudo en 50.
    const M = FLAT.combat.statuses.escudo.value;
    const S = Math.round(M * 0.6);
    const shield = mkMove({ archetype: "proteccion", scalable: "escudo", target: "aliado", power: S });
    const hit = mkMove({ power: S + 50 });
    const pierce = mkMove({ power: 150, modifier: "perforar" });
    // B es más rápido: el escudo llega antes solo por la prioridad de los movimientos de aliado
    let s = createBattle(mkTeam("a", "llama", [shield]), mkTeam("b", "llama", [hit, pierce]).map((c) => ({ ...c, initiative: 150 })), FLAT);
    let r = play(s, lead(1, 1), lead(1, 1));
    assert.deepEqual(evs(r, "shield")[0], { type: "shield", side: "A", pos: 1, amount: S, total: S, condition: false });
    const dm = evs(r, "damage").find((e) => e.side === "A" && e.pos === 1);
    assert.deepEqual([dm?.amount, dm?.absorbed, dm?.hp], [S + 50, S, 170]);
    assert.equal(fighter(r.state, 0, 1).statuses.length, 0); // escudo agotado
    s = { ...r.state, energy: [10, 10] };
    r = play(s, lead(1, 1), basics()); // escudo S
    r = play({ ...r.state, energy: [10, 10] }, lead(1, 1), lead(2, 1)); // +S ⇒ min(2S, M) = M; perforar
    assert.equal(evs(r, "shield")[0]?.total, M);
    const pd = evs(r, "damage").find((e) => e.side === "A" && e.pos === 1);
    assert.deepEqual([pd?.absorbed, pd?.hp], [0, 20]);
    assert.equal(fighter(r.state, 0, 1).statuses.find((x) => x.id === "escudo")?.value, M);
    r = play({ ...r.state, energy: [10, 10] }, lead(1, 1), basics()); // +S con M ⇒ sigue M
    assert.equal(evs(r, "shield")[0]?.total, M);
  });
  it("cura hasta el máximo y drenaje = round(0,30 · vida perdida)", () => {
    const heal = mkMove({ archetype: "curacion", scalable: "cura", target: "aliado", power: 100 });
    const drain = mkMove({ power: 100, modifier: "drenaje" });
    let s = createBattle(mkTeam("a", "llama", [heal, drain]), mkTeam("b", "llama"), FLAT);
    s = withFighters(s, 0, (fs) => {
      fs[1] = { ...(fs[1] as FighterState), hp: 150 };
      fs[2] = { ...(fs[2] as FighterState), hp: 50 };
    });
    s = withFighters(s, 1, (fs) => {
      fs[0] = { ...(fs[0] as FighterState), hp: 40 };
    });
    s = { ...s, energy: [10, 10] };
    const r = play(s, [{ actor: 1, move: 1, target: 2 }, { actor: 3, move: 2, target: 1 }, ...planOf([2, 4], 0, 1)], basics());
    assert.equal(evs(r, "heal")[0]?.amount, 70); // 150 → 220 (máx.)
    assert.deepEqual(evs(r, "drain")[0], { type: "drain", side: "A", pos: 3, amount: 12, hp: 62 }); // 0,3 · 40
  });
  it("área: toda la fila delantera; con delantera vacía, la trasera", () => {
    const area = mkMove({ power: 50, area: true, modifier: "area" });
    let s = createBattle(mkTeam("a", "llama", [area]), mkTeam("b", "llama"), FLAT);
    let r = play(s, lead(1, 2), basics());
    assert.deepEqual(evs(r, "action")[0]?.targets, [1, 2]);
    s = withFighters(r.state, 1, (fs) => {
      fs[0] = { ...(fs[0] as FighterState), ko: true, hp: 0 };
      fs[1] = { ...(fs[1] as FighterState), ko: true, hp: 0 };
    });
    r = play(s, lead(1, 3, 3), planOf([3, 4], 0, 1));
    assert.deepEqual(evs(r, "action").find((e) => e.side === "A" && e.actor === 1)?.targets, [3, 4]);
  });
  it("energía extra: +1 al ejecutarse, sin pasar de 10", () => {
    const tac = mkMove({ archetype: "tactico", extraEnergy: 1, cost: 3, power: 20 });
    const s = createBattle(mkTeam("a", "llama", [tac]), mkTeam("b", "llama"), FLAT);
    const r = play(s, lead(1, 1), basics());
    assert.deepEqual(evs(r, "energy")[0], { type: "energy", side: "A", amount: 1, energy: 1 });
    assert.deepEqual(r.state.energy, [4, 6]);
    const r2 = play({ ...s, energy: [10, 3] }, lead(1, 1), basics());
    assert.equal(evs(r2, "energy")[0]?.energy, 8);
  });
});

describe("condiciones (movimientos §2.5)", () => {
  const C = (cond: Move["condition"]): Move => mkMove({ power: 100, condition: cond });
  it("antes_que_objetivo, objetivo_con_estado, vida_baja, reserva", () => {
    const A = mkTeam("a", "llama", [C("antes_que_objetivo"), C("objetivo_con_estado"), C("vida_baja"), C("reserva")]).map((c) => ({ ...c, initiative: 150 }));
    const B = mkTeam("b", "llama").map((c) => ({ ...c, initiative: 50 }));
    let s: BattleState = { ...createBattle(A, B, FLAT), energy: [10, 10] };
    let r = play(s, lead(1, 1), basics());
    assert.equal(evs(r, "damage").find((e) => e.side === "B")?.amount, 150); // aún no ha actuado
    r = play({ ...s, teams: [s.teams[0], s.teams[1].map((c) => ({ ...(c as Combatant), initiative: 200 }))] }, lead(1, 1), basics());
    assert.equal(evs(r, "damage").find((e) => e.side === "B" && e.amount > 0)?.amount, 100); // ya actuó
    r = play(s, lead(2, 1), basics());
    assert.equal(evs(r, "damage").find((e) => e.side === "B")?.amount, 100);
    s = withFighters(s, 1, (fs) => (fs[0] = { ...(fs[0] as FighterState), statuses: [{ id: "ralentizar", turns: 1, value: 0 }] }));
    r = play(s, lead(2, 1), basics());
    assert.equal(evs(r, "damage").find((e) => e.side === "B")?.amount, 150);
    const low = withFighters(s, 0, (fs) => (fs[0] = { ...(fs[0] as FighterState), hp: 100 }));
    assert.equal(evs(play(low, lead(3, 1), basics()), "damage").find((e) => e.side === "B")?.amount, 150);
    assert.equal(evs(play(s, lead(3, 1), basics()), "damage").find((e) => e.side === "B")?.amount, 100);
    // reserva: energía tras pagar ≥ 3
    assert.equal(evs(play({ ...s, energy: [4, 3] }, lead(4, 1), basics()), "damage").find((e) => e.side === "B")?.amount, 150);
    assert.equal(evs(play({ ...s, energy: [3, 3] }, lead(4, 1), basics()), "damage").find((e) => e.side === "B")?.amount, 100);
  });
});

describe("estados (combate §8)", () => {
  it("quemadura: 12 por pila, pilas máx. 3, cada aplicación reinicia la duración (3)", () => {
    const burn = mkMove({ archetype: "golpe_estado", status: "quemadura", power: 5 });
    let s = createBattle(mkTeam("a", "llama", [burn]), mkTeam("b", "llama"), FLAT);
    const burns: number[] = [];
    for (let t = 1; t <= 6; t++) {
      const r = play(s, t <= 4 ? lead(1, 1) : basics(), basics());
      burns.push(evs(r, "burn").find((e) => e.side === "B")?.amount ?? 0);
      if (t === 6) assert.ok(evs(r, "expire").some((e) => e.side === "B" && e.status === "quemadura"));
      s = r.state;
    }
    assert.deepEqual(burns, [12, 24, 36, 36, 36, 36]);
    assert.equal(fighter(s, 1, 1).statuses.length, 0);
  });
  it("ralentizar, marca, debilitar y prisa duran 2; marca ×1,2 recibido, debilitar ×0,8 infligido", () => {
    const mark = mkMove({ archetype: "golpe_estado", status: "marca", power: 50 });
    const weak = mkMove({ archetype: "golpe_estado", status: "debilitar", power: 5 });
    const hit = mkMove({ power: 100 });
    // familias distintas: sin sinergia entre los 3 que usan movimiento
    const A = ["llama", "marea", "roca", "sombra"].map((f, i) => mkFighter(`a${i}`, f, [mark, hit, weak], { initiative: 200 - i }));
    let s = createBattle(A, mkTeam("b", "llama", [hit]), FLAT);
    const r = play(s, [{ actor: 1, move: 1, target: 1 }, { actor: 2, move: 2, target: 1 }, { actor: 3, move: 3, target: 2 }, { actor: 4, move: 0, target: 1 }], [{ actor: 2, move: 1, target: 1 }, ...planOf([1, 3, 4], 0, 1)]);
    const dmg = evs(r, "damage");
    assert.deepEqual(dmg.filter((e) => e.side === "B" && e.pos === 1).map((e) => e.amount), [50, 120, 0]);
    assert.equal(dmg.find((e) => e.side === "A" && e.amount > 0)?.amount, 80);
    assert.deepEqual(fighter(r.state, 1, 1).statuses, [{ id: "marca", turns: 1, value: 0 }]);
    s = play(r.state, basics(), basics()).state;
    assert.equal(fighter(s, 1, 1).statuses.length, 0);
    assert.equal(fighter(s, 1, 2).statuses.length, 0);
  });
  it("regenerar: +15 al final de cada turno durante 3, sin pasar del máximo", () => {
    const regen = mkMove({ archetype: "curacion", scalable: "cura", target: "aliado", status: "regenerar", power: 5 });
    let s = createBattle(mkTeam("a", "llama", [regen]), mkTeam("b", "llama"), FLAT);
    s = withFighters(s, 0, (fs) => (fs[1] = { ...(fs[1] as FighterState), hp: 180 }));
    const hp: number[] = [];
    for (let t = 1; t <= 4; t++) {
      const r = play(s, t === 1 ? [{ actor: 1, move: 1, target: 2 }, ...planOf([2, 3, 4], 0, 1)] : basics(), basics());
      s = r.state;
      hp.push(fighter(s, 0, 2).hp);
    }
    assert.deepEqual(hp, [200, 215, 220, 220]);
    assert.equal(fighter(s, 0, 2).statuses.length, 0);
  });
  it("aturdir sin haber actuado: acción cancelada y energía devuelta", () => {
    const stun = mkMove({ archetype: "golpe_estado", status: "aturdir", cost: 3, power: 5 });
    const A = mkTeam("a", "llama", [stun]).map((c) => ({ ...c, initiative: 150 }));
    const s = createBattle(A, mkTeam("b", "llama", [mkMove({ cost: 1 })]), FLAT);
    const r = play(s, lead(1, 1), lead(1, 1));
    assert.deepEqual(evs(r, "cancel")[0], { type: "cancel", side: "B", actor: 1, reason: "aturdido", refund: 1 });
    assert.deepEqual(r.state.energy, [3, 6]);
    assert.equal(fighter(r.state, 1, 1).skipTurn, 0);
  });
  it("aturdir tras actuar: pierde la acción siguiente; después, inmune 2 turnos", () => {
    const stun = mkMove({ archetype: "golpe_estado", status: "aturdir", cost: 1, power: 5 });
    const A = mkTeam("a", "llama", [stun]).map((c) => ({ ...c, initiative: 50 }));
    let s = createBattle(A, mkTeam("b", "llama"), FLAT);
    let r = play(s, lead(1, 1), basics());
    assert.ok(evs(r, "status").some((e) => e.status === "aturdir" && e.side === "B" && e.pos === 1));
    s = r.state;
    assert.deepEqual(eligibleActors(s, "B"), [2, 3, 4]);
    assert.match(validatePlan(s, "B", basics(), FLAT) ?? "", /no puede actuar/);
    for (const t of [2, 3]) {
      r = play(s, lead(1, 1), t === 2 ? planOf([2, 3, 4], 0, 1) : basics());
      assert.ok(evs(r, "immune").some((e) => e.side === "B" && e.pos === 1), `turno ${t}`);
      s = r.state;
    }
    assert.deepEqual(eligibleActors(s, "B"), ALL);
    r = play(s, lead(1, 1), basics());
    assert.ok(evs(r, "status").some((e) => e.status === "aturdir"));
  });
});

describe("objetivos, KO y fin de partida (combate §2, §9)", () => {
  it("reobjetivo a la primera válida por posición; sin objetivos, la acción se pierde", () => {
    const tiny = (t: Combatant[]): Combatant[] => t.map((c) => ({ ...c, maxHp: 10 }));
    const s = createBattle(mkTeam("a", "llama"), tiny(mkTeam("b", "llama")), FLAT10);
    const r = play(s, basics(1), basics(), FLAT10);
    assert.deepEqual(evs(r, "action").filter((e) => e.side === "A").map((e) => e.targets[0]), [1, 2, 3, 4]);
    assert.equal(r.state.result, "A");
    assert.deepEqual(evs(r, "cancel").map((e) => e.reason), ["ko", "ko", "ko", "ko"]);
    assert.deepEqual(r.events.at(-1), { type: "end", result: "A" });
    const s2 = createBattle(mkTeam("a", "llama", [mkMove({ power: 999, area: true })]), tiny(mkTeam("b", "llama")), FLAT10);
    const r2 = play(s2, basics(1), [{ actor: 1, move: 0, target: 1 }, ...planOf([2, 3, 4], 0, 1)], FLAT10);
    assert.equal(evs(r2, "lost").length, 0);
    const r3 = play(s2, [...planOf([1, 2], 1, 1), ...planOf([3, 4], 0, 1)], basics(), FLAT10);
    assert.ok(evs(r3, "lost").length >= 1);
  });
  it("ambos bandos caen en el mismo turno ⇒ empate", () => {
    let s = createBattle(mkTeam("a", "llama"), mkTeam("b", "llama"), FLAT);
    for (const side of [0, 1] as const) s = withFighters(s, side, (fs) => fs.forEach((f, i) => (fs[i] = { ...f, hp: 5, statuses: [{ id: "quemadura", turns: 3, value: 1 }] })));
    const r = play(s, basics(), basics());
    assert.equal(r.state.result, "empate");
  });
  it("límite de 20 turnos ⇒ empate; resolveTurn después lanza", () => {
    let s = createBattle(mkTeam("a", "llama"), mkTeam("b", "llama"), FLAT);
    let last: TurnResult | null = null;
    while (s.result === null) {
      last = play(s, basics(), basics());
      s = last.state;
    }
    assert.equal(s.turn, 20);
    assert.equal(s.result, "empate");
    assert.deepEqual(last?.events.at(-1), { type: "end", result: "empate" });
    assert.throws(() => play(s, basics(), basics()), RangeError);
  });
});

describe("planes inválidos (combate §3.2)", () => {
  const A = mkTeam("a", "llama", [mkMove({ cost: 5 }), mkMove({ cost: 1, target: "aliado", scalable: "cura", archetype: "curacion" }), mkMove({ modifier: "alcance" })]);
  const s0 = createBattle(A, mkTeam("b", "llama"), FLAT);
  it("validatePlan detecta cada error", () => {
    const cases: [Plan, RegExp][] = [
      [lead(1, 1), /energía insuficiente/],
      [lead(0, 3), /objetivo inválido 3/], // trasera con delantera viva
      [lead(3, 3), /^$/], // alcance: cualquier fila
      [lead(2, 4), /^$/], // aliado: cualquiera
      [planOf([1, 2, 3], 0, 1), /falta la acción/],
      [[...basics(), { actor: 1, move: 0, target: 1 }], /repetido/],
      [lead(5, 1), /movimiento inválido/],
      [lead(0, 0), /objetivo inválido/],
      [[{ actor: 7, move: 0, target: 1 }], /actor inválido/],
    ];
    for (const [plan, re] of cases) assert.match(validatePlan(s0, "A", plan, FLAT) ?? "", re, JSON.stringify(plan));
    const ko = withFighters(s0, 0, (fs) => (fs[3] = { ...(fs[3] as FighterState), ko: true, hp: 0 }));
    assert.match(validatePlan(ko, "A", basics(), FLAT) ?? "", /no puede actuar/);
    assert.equal(validatePlan(ko, "A", planOf([1, 2, 3], 0, 1), FLAT), null);
  });
  it("plan inválido ⇒ golpe básico de todas al primer objetivo válido, sin coste", () => {
    const r = play(s0, lead(1, 1), basics());
    const p = evs(r, "plan")[0];
    assert.equal(p?.valid, false);
    assert.match(p?.reason ?? "", /energía/);
    assert.deepEqual(p?.actions, basics(1));
    assert.deepEqual(r.state.energy, [6, 6]);
  });
});
