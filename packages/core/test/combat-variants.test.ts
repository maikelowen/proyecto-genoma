/** Variantes de combate v0.3 (docs/spec/combate-variantes-v0.3.md §2): V1 efecto del golpe básico, V2 descanso, V3 energía, V4 objetivo automático y provocar. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  autoTarget,
  basicEffectOf,
  buildBattleConfig,
  buildCombatant,
  ConfigError,
  createBattle,
  createReferenceAi,
  createRng,
  createSearchAi,
  createWildPopulation,
  describeMove,
  generateMove,
  generateMoveForKey,
  laneOf,
  laneOrder,
  parseCombatConfig,
  parseMovesConfig,
  resolveTurn,
  restingMoves,
  runBattle,
  suggestFormation,
  validateMove,
  validatePlan,
  type Action,
  type BattleConfig,
  type BattleEvent,
  type BattleState,
  type Creature,
  type FighterState,
  type Plan,
  type TurnResult,
} from "../src/index.ts";
import { ALL, BCFG, GCFG, loadBattleConfig, mkFighter, mkMove, mkTeam, planOf, rawCombatClone, rawMovesClone } from "./combat-helpers.ts";
import { drawsConsumed } from "./genetics-helpers.ts";

type Raw = any;
/** var = 1 y sin jitter (golpe básico normal, 10) + los cambios de la variante. */
function flat(patch: (r: Raw) => void = () => {}, patchMoves?: (m: Raw) => void): BattleConfig {
  return loadBattleConfig((r) => {
    r.dano.varianza = 0;
    r.orden.jitter = 0;
    patch(r);
  }, patchMoves);
}
const V1 = (r: Raw): void => void (r.variantes.golpe_basico_efecto.activo = true);
const V2 = (r: Raw): void => void (r.variantes.descanso.activo = true);
const V3 = (r: Raw): void => void (r.energia.por_turno = 4);
const V4 = (r: Raw): void => void (r.variantes.objetivo_automatico.activo = true);
const TAUNT = (m: Raw): void => void (m.provocar.activo = true);

function play(state: BattleState, a: Plan, b: Plan, cfg: BattleConfig, seed = `t${state.turn}`): TurnResult {
  return resolveTurn(state, a, b, createRng(seed), cfg);
}
function evs<T extends BattleEvent["type"]>(r: TurnResult, type: T): Extract<BattleEvent, { type: T }>[] {
  return r.events.filter((e): e is Extract<BattleEvent, { type: T }> => e.type === type);
}
/** Objetivos de la acción del actor `actor` del bando `side`. */
function targetsOf(r: TurnResult, side: "A" | "B", actor: number): readonly number[] | undefined {
  return evs(r, "action").find((e) => e.side === side && e.actor === actor)?.targets;
}
function withFighters(state: BattleState, side: 0 | 1, patch: (fs: FighterState[]) => void): BattleState {
  const fs = state.fighters[side].map((f) => ({ ...f }));
  patch(fs);
  return { ...state, fighters: side === 0 ? [fs, state.fighters[1]] : [state.fighters[0], fs] };
}
const ko = (f: FighterState): FighterState => ({ ...f, hp: 0, ko: true, statuses: [] });
/** Plan sin objetivo (V4): `target` 0. */
const auto = (moves: readonly number[]): Action[] => moves.map((move, i) => ({ actor: i + 1, move, target: 0 }));
const basics = (target = 1): Action[] => planOf(ALL, 0, target);

// ------------------------------------------------------------------ config

describe("variantes v0.3 — config", () => {
  it("todas desactivadas por defecto, también si faltan los bloques (JSON anterior)", () => {
    const v = BCFG.combat.variants;
    assert.equal(v.basicEffect.active, false);
    assert.equal(v.rest.active, false);
    assert.equal(v.autoTarget.active, false);
    assert.equal(BCFG.moves.taunt.active, false);
    assert.equal(BCFG.combat.energy.perTurn, 3);
    const rc = rawCombatClone();
    delete rc.variantes;
    const rm = rawMovesClone();
    delete rm.provocar;
    const old = { combat: parseCombatConfig(rc), moves: parseMovesConfig(rm, GCFG) };
    assert.equal(old.combat.variants.basicEffect.active || old.combat.variants.rest.active || old.combat.variants.autoTarget.active || old.moves.taunt.active, false);
    // sin los bloques, una partida completa es idéntica
    const pop = createWildPopulation(createRng("var-cfg"), GCFG, 8);
    assert.equal(runBattle(pop.slice(0, 4), pop.slice(4), "s", old).hash, runBattle(pop.slice(0, 4), pop.slice(4), "s", BCFG).hash);
  });

  it("se activan con rutas de patchRawConfig/buildBattleConfig (forma corta)", () => {
    const cfg = buildBattleConfig(rawCombatClone(), rawMovesClone(), GCFG, {
      combat: {
        "variantes.golpe_basico_efecto.activo": true,
        "variantes.golpe_basico_efecto.efectos.brote.cantidad": 8,
        "variantes.descanso.activo": true,
        "variantes.objetivo_automatico.activo": true,
        "variantes.provocar.duracion": 2,
        "energia.por_turno": 4,
      },
      moves: { "provocar.activo": true, "provocar.coste": 4, "provocar.pesos_familia.roca": 5 },
    });
    assert.deepEqual(cfg.combat.variants.basicEffect.effects["brote"], { kind: "cura", amount: 8 });
    assert.equal(cfg.combat.variants.rest.active && cfg.combat.variants.autoTarget.active && cfg.moves.taunt.active, true);
    assert.equal(cfg.combat.variants.taunt.duration, 2);
    assert.equal(cfg.moves.taunt.cost, 4);
    assert.equal(cfg.combat.energy.perTurn, 4);
  });

  it("el parser rechaza valores incoherentes", () => {
    const bad: [string, (r: Raw) => void][] = [
      ["variantes.golpe_basico_efecto.efectos.llama.probabilidad", (r) => (r.variantes.golpe_basico_efecto.efectos.llama.probabilidad = 1.5)],
      ["variantes.golpe_basico_efecto.efectos.llama.estado", (r) => (r.variantes.golpe_basico_efecto.efectos.llama.estado = "escudo")],
      ["variantes.golpe_basico_efecto.efectos.brote.tipo", (r) => (r.variantes.golpe_basico_efecto.efectos.brote.tipo = "veneno")],
      ["variantes.golpe_basico_efecto.efectos", (r) => delete r.variantes.golpe_basico_efecto.efectos.roca],
      ["variantes.golpe_basico_efecto.componente_hibrida", (r) => (r.variantes.golpe_basico_efecto.componente_hibrida = 2)],
      ["variantes.descanso.turnos", (r) => (r.variantes.descanso.turnos = 0)],
      ["variantes.descanso.activo", (r) => (r.variantes.descanso.activo = 1)],
      ["variantes.provocar.duracion", (r) => (r.variantes.provocar.duracion = 0)],
    ];
    for (const [path, patch] of bad) {
      const raw = rawCombatClone();
      patch(raw);
      assert.throws(() => parseCombatConfig(raw), (e: unknown) => e instanceof ConfigError && e.message.startsWith(path), path);
    }
    const badMoves: [string, (m: Raw) => void][] = [
      ["provocar.coste", (m) => (m.provocar.coste = -1)],
      ["provocar.arquetipos", (m) => (m.provocar.arquetipos = ["golpe"])],
      ["provocar.pesos_familia", (m) => delete m.provocar.pesos_familia.roca],
    ];
    for (const [path, patch] of badMoves) {
      const raw = rawMovesClone();
      patch(raw);
      assert.throws(() => parseMovesConfig(raw, GCFG), (e: unknown) => e instanceof ConfigError && e.message.startsWith(path), path);
    }
  });
});

// ------------------------------------------------------------------ V1

describe("V1 — golpe básico con efecto por familia", () => {
  /** Probabilidades a 1 para aislar la regla. */
  const SURE = flat((r) => {
    V1(r);
    for (const f of ["llama", "marea", "voltio", "sombra"]) r.variantes.golpe_basico_efecto.efectos[f].probabilidad = 1;
  });
  const basicTurn = (family: string, cfg: BattleConfig = SURE, hpLost = 0): TurnResult => {
    let s = createBattle(mkTeam("a", family, [], cfg), mkTeam("b", "vapor", [], cfg), cfg);
    if (hpLost > 0) s = withFighters(s, 0, (fs) => fs.forEach((f, i) => (fs[i] = { ...f, hp: f.hp - hpLost })));
    return play(s, basics(1), basics(1), cfg);
  };

  it("desactivada: el golpe básico no aplica nada", () => {
    const r = basicTurn("llama", flat());
    assert.equal(evs(r, "status").length + evs(r, "heal").length + evs(r, "shield").length, 0);
  });

  it("llama quema, marea ralentiza y sombra marca al objetivo; voltio se da prisa", () => {
    for (const [family, status] of [["llama", "quemadura"], ["marea", "ralentizar"], ["sombra", "marca"]] as const) {
      const r = basicTurn(family);
      const st = evs(r, "status").filter((e) => e.side === "B");
      assert.equal(st.length, 4, family);
      assert.ok(st.every((e) => e.status === status && e.pos === 1), family);
    }
    const r = basicTurn("voltio");
    // (el rival, vapor, quema con el efecto de llama: se mira solo la prisa)
    assert.deepEqual(evs(r, "status").filter((e) => e.status === "prisa").map((e) => [e.side, e.pos]), ALL.map((p) => ["A", p]));
    // prisa dura 2 finales de turno: sigue activa en el turno siguiente (+iniciativa)
    assert.ok(r.state.fighters[0].every((f) => f.statuses.some((x) => x.id === "prisa" && x.turns === 1)));
  });

  it("brote se cura la cantidad (sin pasar del máximo) y roca se pone el escudo, sobre el usuario", () => {
    const r = basicTurn("brote", SURE, 3);
    // faltan 3: se cura 3, no 5 (A actúa antes: lado favorecido en el turno 1, sin jitter)
    assert.deepEqual(evs(r, "heal").map((e) => [e.side, e.pos, e.amount]), ALL.map((p) => ["A", p, 3]));
    const big = basicTurn("brote", SURE, 100);
    assert.deepEqual(evs(big, "heal").map((e) => e.amount), [5, 5, 5, 5]);
    const rock = basicTurn("roca");
    assert.deepEqual(evs(rock, "shield").map((e) => [e.side, e.pos, e.amount, e.total]), ALL.map((p) => ["A", p, 6, 6]));
  });

  it("las híbridas usan el efecto de la componente configurada", () => {
    const h = GCFG.hybridById.get("vapor")!;
    const eff = SURE.combat.variants.basicEffect.effects;
    assert.deepEqual(basicEffectOf(mkFighter("v", "vapor", [], {}, SURE), SURE), eff[h.components[0]]);
    const other = flat((r) => {
      V1(r);
      r.variantes.golpe_basico_efecto.componente_hibrida = 1;
    });
    assert.deepEqual(basicEffectOf(mkFighter("v", "vapor", [], {}, other), other), other.combat.variants.basicEffect.effects[h.components[1]]);
    assert.equal(basicEffectOf(mkFighter("v", "vapor"), BCFG), null);
  });

  it("la probabilidad usa la 2.ª tirada de varianza de la posición (sin tiradas extra) y no afecta a los movimientos", () => {
    const cfg = flat((r) => {
      V1(r);
      r.variantes.golpe_basico_efecto.efectos.sombra.probabilidad = 0.5;
    });
    const s = createBattle(mkTeam("a", "sombra", [], cfg), mkTeam("b", "vapor", [], cfg), cfg);
    let applied = 0;
    for (let k = 0; k < 12; k++) {
      const seed = `p${k}`;
      const rng = createRng(seed);
      const u: number[] = [];
      for (let i = 0; i < 24; i++) u.push(rng.next());
      // cada actor golpea a un enemigo distinto para ver quién marca
      const r = play(s, basics(1).map((a) => ({ ...a, target: a.actor <= 2 ? a.actor : 1 })), basics(1), cfg, seed);
      // t9–t24: dos por posición (A1a, A1b, …); la "b" de A1 es u[9], la de A2 u[11]
      const marked = evs(r, "status").filter((e) => e.side === "B" && e.status === "marca").length;
      const expected = [0, 1, 2, 3].filter((i) => (u[8 + 2 * i + 1] as number) < 0.5).length;
      assert.equal(marked > 0, expected > 0, seed);
      assert.equal(evs(r, "status").filter((e) => e.status === "marca").length, expected, seed);
      applied += expected;
      assert.equal(drawsConsumed(seed, (g) => resolveTurn(s, basics(1), basics(1), g, cfg)), 24);
    }
    assert.ok(applied > 10 && applied < 38, `≈ la mitad de 48 (${applied})`);
    // un movimiento (no golpe) no lleva el efecto
    const mv = play(s, [{ actor: 1, move: 1, target: 1 }, ...planOf([2, 3, 4], 0, 2)], basics(1), SURE);
    assert.equal(evs(mv, "plan")[0]!.valid, true);
    assert.deepEqual(evs(mv, "status").filter((e) => e.side === "B").map((e) => e.pos), [2, 2, 2]);
  });
});

// ------------------------------------------------------------------ V2

describe("V2 — descanso de un turno", () => {
  const cfg = flat(V2);
  const start = (): BattleState => createBattle(mkTeam("a", "llama", [], cfg), mkTeam("b", "vapor", [], cfg), cfg);
  const lead = (move: number): Action[] => [{ actor: 1, move, target: 1 }, ...planOf([2, 3, 4], 0, 1)];

  it("el estado expone los descansos; sin la variante no existe el campo", () => {
    const r = play(start(), lead(2), basics(), cfg);
    assert.deepEqual(r.state.fighters[0][0]!.rest, [0, 1, 0, 0]);
    assert.deepEqual(r.state.fighters[0][1]!.rest, [0, 0, 0, 0]);
    assert.deepEqual(restingMoves(r.state, "A", 1), [2]);
    assert.deepEqual(restingMoves(r.state, "A", 2), []);
    const off = flat();
    const r0 = play(createBattle(mkTeam("a", "llama", [], off), mkTeam("b", "vapor", [], off), off), lead(2), basics(), off);
    assert.equal("rest" in r0.state.fighters[0][0]!, false);
    assert.deepEqual(restingMoves(r0.state, "A", 1), []);
  });

  it("repetir el movimiento en descanso invalida el plan (⇒ golpes básicos); al turno siguiente vuelve", () => {
    const r1 = play(start(), lead(2), basics(), cfg);
    assert.match(validatePlan(r1.state, "A", lead(2), cfg) ?? "", /descanso/);
    assert.equal(validatePlan(r1.state, "A", lead(1), cfg), null);
    const r2 = play(r1.state, lead(2), basics(), cfg);
    const plan = evs(r2, "plan").find((e) => e.side === "A")!;
    assert.equal(plan.valid, false);
    assert.ok(plan.actions.every((a) => a.move === 0));
    // en el turno 2 no se usó: en el 3 está disponible
    assert.deepEqual(r2.state.fighters[0][0]!.rest, [0, 0, 0, 0]);
    assert.equal(validatePlan(r2.state, "A", lead(2), cfg), null);
  });

  it("el golpe básico no descansa y otro movimiento sí se puede usar", () => {
    let s = start();
    for (let t = 0; t < 3; t++) {
      const r = play(s, basics(), basics(), cfg);
      assert.ok(evs(r, "plan").every((e) => e.valid));
      s = r.state;
    }
    const r1 = play(start(), lead(2), basics(), cfg);
    const r2 = play(r1.state, lead(3), basics(), cfg);
    assert.equal(evs(r2, "plan").find((e) => e.side === "A")!.valid, true);
    assert.deepEqual(r2.state.fighters[0][0]!.rest, [0, 0, 1, 0]);
  });

  it("una acción cancelada por aturdimiento (con devolución) no descansa", () => {
    const stun = mkMove({ status: "aturdir", modifier: "prioridad", cost: 3, power: 5, family: "vapor" });
    const s = createBattle(mkTeam("a", "llama", [], cfg), mkTeam("b", "vapor", [stun], cfg), cfg);
    const r = play(s, lead(2), [{ actor: 1, move: 1, target: 1 }, ...planOf([2, 3, 4], 0, 1)], cfg);
    assert.equal(evs(r, "cancel").filter((e) => e.side === "A" && e.actor === 1).length, 1);
    assert.deepEqual(r.state.fighters[0][0]!.rest, [0, 0, 0, 0]);
    assert.deepEqual(r.state.fighters[1][0]!.rest, [1, 0, 0, 0]);
  });

  it("`turnos` = 2: descansa dos turnos", () => {
    const two = flat((r) => {
      V2(r);
      r.variantes.descanso.turnos = 2;
    });
    const s = createBattle(mkTeam("a", "llama", [], two), mkTeam("b", "vapor", [], two), two);
    const r1 = play(s, lead(1), basics(), two);
    assert.deepEqual(r1.state.fighters[0][0]!.rest, [2, 0, 0, 0]);
    const r2 = play(r1.state, basics(), basics(), two);
    assert.match(validatePlan(r2.state, "A", lead(1), two) ?? "", /descanso/);
    const r3 = play(r2.state, basics(), basics(), two);
    assert.equal(validatePlan(r3.state, "A", lead(1), two), null);
  });
});

// ------------------------------------------------------------------ V3

describe("V3 — energía por turno configurable", () => {
  it("con `energia.por_turno` = 4 la energía sube de 4 en 4 hasta el máximo", () => {
    const cfg = flat(V3);
    let s = createBattle(mkTeam("a", "llama", [], cfg), mkTeam("b", "vapor", [], cfg), cfg);
    const seen = [s.energy[0]];
    for (let t = 0; t < 3; t++) {
      s = play(s, basics(), basics(), cfg).state;
      seen.push(s.energy[0]);
    }
    assert.deepEqual(seen, [3, 7, 10, 10]);
  });
});

// ------------------------------------------------------------------ V4

describe("V4 — objetivo automático por carriles", () => {
  const cfg = flat(V4);
  const reach = mkMove({ modifier: "alcance", power: 20 });
  const area = mkMove({ area: true, modifier: "area", power: 20 });
  const reachArea = mkMove({ area: true, modifier: "alcance", archetype: "maldicion", power: 20 });
  const heal = mkMove({ archetype: "curacion", scalable: "cura", target: "aliado", power: 30 });
  const shield = mkMove({ archetype: "proteccion", scalable: "escudo", target: "aliado", power: 30 });
  const kit = [reach, area, heal, shield];
  const start = (c: BattleConfig = cfg, movesA = kit): BattleState => createBattle(mkTeam("a", "llama", movesA, c), mkTeam("b", "vapor", [reachArea], c), c);

  it("carriles: 1 y 3 izquierda, 2 y 4 derecha; orden de preferencia con y sin alcance", () => {
    assert.deepEqual(ALL.map(laneOf), [0, 1, 0, 1]);
    assert.deepEqual(ALL.map((p) => laneOrder(p, false, cfg.combat)), [[1, 2, 3, 4], [2, 1, 4, 3], [1, 2, 3, 4], [2, 1, 4, 3]]);
    assert.deepEqual(ALL.map((p) => laneOrder(p, true, cfg.combat)), [[3, 4, 1, 2], [4, 3, 2, 1], [3, 4, 1, 2], [4, 3, 2, 1]]);
  });

  it("validatePlan no mira el objetivo (puede faltar) y el plan se normaliza a objetivo 0", () => {
    const s = start();
    assert.equal(validatePlan(s, "A", auto([0, 0, 0, 0]), cfg), null);
    assert.equal(validatePlan(s, "A", planOf(ALL, 0, 99), cfg), null);
    const noTarget = ALL.map((actor) => ({ actor, move: 0 })) as unknown as Plan;
    assert.equal(validatePlan(s, "A", noTarget, cfg), null);
    assert.match(validatePlan(s, "A", auto([0, 0, 0]), cfg) ?? "", /falta/);
    const r = play(s, noTarget, [{ actor: 9, move: 0, target: 1 }], cfg);
    const [pa, pb] = evs(r, "plan");
    assert.equal(pa!.valid, true);
    assert.equal(pb!.valid, false);
    assert.ok([...pa!.actions, ...pb!.actions].every((a) => a.target === 0));
  });

  it("golpe de un objetivo: delantera de su carril → otra delantera → trasera de su carril → otra trasera", () => {
    const expectTargets = (dead: number[], expected: number[]): void => {
      const s = withFighters(start(), 1, (fs) => dead.forEach((p) => (fs[p - 1] = ko(fs[p - 1]!))));
      const r = play(s, auto([0, 0, 0, 0]), auto(ALL.map((p) => (dead.includes(p) ? -1 : 0)).filter((m) => m === 0)).map((a, i) => ({ ...a, actor: ALL.filter((p) => !dead.includes(p))[i]! })), cfg);
      assert.deepEqual(ALL.map((p) => targetsOf(r, "A", p)?.[0]), expected, `caídas ${dead.join(",")}`);
      ALL.forEach((p) => assert.equal(autoTarget(s, "A", p, 0, cfg), expected[p - 1]));
    };
    expectTargets([], [1, 2, 1, 2]);
    expectTargets([2], [1, 1, 1, 1]);
    expectTargets([1], [2, 2, 2, 2]);
    expectTargets([1, 2], [3, 4, 3, 4]);
    expectTargets([1, 2, 4], [3, 3, 3, 3]);
    expectTargets([1, 2, 3], [4, 4, 4, 4]);
  });

  it("alcance: primero la fila trasera, con la misma regla de carriles", () => {
    const s = start();
    const r = play(s, auto([1, 1, 0, 0]), auto([0, 0, 0, 0]), cfg);
    assert.equal(evs(r, "plan")[0]!.valid, true);
    assert.deepEqual(ALL.map((p) => targetsOf(r, "A", p)?.[0]), [3, 4, 1, 2]);
    assert.deepEqual(ALL.map((p) => autoTarget(s, "A", p, 1, cfg)), [3, 4, 3, 4]);
    const s2 = withFighters(s, 1, (fs) => (fs[3] = ko(fs[3]!)));
    assert.deepEqual(ALL.map((p) => autoTarget(s2, "A", p, 1, cfg)), [3, 3, 3, 3]);
    const s3 = withFighters(s2, 1, (fs) => (fs[2] = ko(fs[2]!)));
    assert.deepEqual(ALL.map((p) => autoTarget(s3, "A", p, 1, cfg)), [1, 2, 1, 2]);
  });

  it("área: la fila delantera (la trasera si está vacía); con alcance, la trasera", () => {
    const s = start();
    const r = play(s, [{ actor: 1, move: 2, target: 0 }, ...planOf([2, 3, 4], 0, 0)], [{ actor: 1, move: 1, target: 0 }, ...planOf([2, 3, 4], 0, 0)], cfg);
    assert.deepEqual(targetsOf(r, "A", 1), [1, 2]);
    assert.deepEqual(targetsOf(r, "B", 1), [3, 4]);
    const s2 = withFighters(s, 1, (fs) => {
      fs[0] = ko(fs[0]!);
      fs[1] = ko(fs[1]!);
    });
    const r2 = play(s2, [{ actor: 1, move: 2, target: 0 }, ...planOf([2, 3, 4], 0, 0)], planOf([3, 4], 0, 0), cfg);
    assert.deepEqual(targetsOf(r2, "A", 1), [3, 4]);
  });

  it("se decide al ejecutar: si el objetivo de su carril cae antes, pasa al siguiente (la acción no se pierde)", () => {
    const s = withFighters(start(), 1, (fs) => (fs[0] = { ...fs[0]!, hp: 5 }));
    const r = play(s, auto([0, 0, 0, 0]), auto([0, 0, 0, 0]), cfg);
    // A1 remata a B1; A3 (mismo carril) pasa a B2
    assert.deepEqual(ALL.map((p) => targetsOf(r, "A", p)?.[0]), [1, 2, 2, 2]);
    assert.equal(evs(r, "lost").length, 0);
  });

  it("cura: aliado con menor vida/máx; escudo: delantero con menos vida y, sin delanteros, el aliado con menos vida", () => {
    const team = mkTeam("a", "llama", kit, cfg).map((c, i) => (i === 3 ? { ...c, maxHp: 400 } : c));
    let s = createBattle(team, mkTeam("b", "vapor", [], cfg), cfg);
    // vidas: 150/220, 200/220, 140/220 y 200/400 (la menor proporción)
    s = withFighters(s, 0, (fs) => [150, 200, 140, 200].forEach((hp, i) => (fs[i] = { ...fs[i]!, hp })));
    assert.equal(autoTarget(s, "A", 1, 3, cfg), 4);
    assert.equal(autoTarget(s, "A", 1, 4, cfg), 1);
    const r = play(s, [{ actor: 1, move: 3, target: 0 }, { actor: 2, move: 4, target: 0 }, ...planOf([3, 4], 0, 0)], auto([0, 0, 0, 0]), cfg);
    assert.deepEqual(targetsOf(r, "A", 1), [4]);
    assert.deepEqual(targetsOf(r, "A", 2), [1]);
    // empate de proporción ⇒ menor posición
    const tie = withFighters(s, 0, (fs) => [110, 220, 110, 200].forEach((hp, i) => (fs[i] = { ...fs[i]!, hp })));
    assert.equal(autoTarget(tie, "A", 2, 3, cfg), 1);
    // sin delanteros: el aliado con menos vida (absoluta)
    const back = withFighters(s, 0, (fs) => {
      fs[0] = ko(fs[0]!);
      fs[1] = ko(fs[1]!);
    });
    assert.equal(autoTarget(back, "A", 4, 4, cfg), 3);
  });

  describe("provocar", () => {
    const taunt = mkMove({ archetype: "proteccion", scalable: "escudo", target: "aliado", power: 20, taunt: true });
    const kitT = [taunt, area, reach, shield];
    const tauntPlan = (pos: number): Action[] => ALL.map((actor) => ({ actor, move: actor === pos ? 1 : 0, target: 0 }));

    it("los ataques enemigos de un solo objetivo van a quien provoca (también con alcance); los de área no", () => {
      const s = createBattle(mkTeam("a", "llama", kitT, cfg), mkTeam("b", "vapor", kitT, cfg), cfg);
      // A4 (trasera) provoca con prioridad; B: golpe, área, alcance, golpe
      const r = play(s, tauntPlan(4), auto([0, 2, 3, 0]), cfg);
      assert.deepEqual(evs(r, "taunt").map((e) => [e.side, e.pos, e.turns]), [["A", 4, 1]]);
      assert.deepEqual(targetsOf(r, "A", 4), [4], "el escudo de provocar va al usuario");
      assert.deepEqual(targetsOf(r, "B", 1), [4]);
      assert.deepEqual(targetsOf(r, "B", 2), [1, 2]);
      assert.deepEqual(targetsOf(r, "B", 3), [4]);
      assert.deepEqual(targetsOf(r, "B", 4), [4]);
      // dura un turno: al acabar ya no provoca (ni aparece en el estado)
      assert.equal("taunt" in r.state.fighters[0][3]!, false);
      const r2 = play(r.state, auto([0, 0, 0, 0]), auto([0, 0, 0, 0]), cfg);
      assert.deepEqual(ALL.map((p) => targetsOf(r2, "B", p)?.[0]), [1, 2, 1, 2]);
    });

    it("`duracion` = 2 se ve en el estado y sigue desviando el turno siguiente; `escudo_provocar_al_usuario` = false usa la regla del escudo", () => {
      const two = flat((r) => {
        V4(r);
        r.variantes.provocar.duracion = 2;
        r.variantes.objetivo_automatico.escudo_provocar_al_usuario = false;
      });
      const s = createBattle(mkTeam("a", "llama", kitT, two), mkTeam("b", "vapor", kitT, two), two);
      const r = play(s, tauntPlan(4), auto([0, 0, 0, 0]), two);
      assert.deepEqual(targetsOf(r, "A", 4), [1], "delantero con menos vida (empate: posición 1)");
      assert.equal(r.state.fighters[0][3]!.taunt, 1);
      assert.equal(autoTarget(r.state, "B", 1, 0, two), 4);
      const r2 = play(r.state, auto([0, 0, 0, 0]), auto([0, 0, 0, 0]), two);
      assert.deepEqual(ALL.map((p) => targetsOf(r2, "B", p)?.[0]), [4, 4, 4, 4]);
      assert.equal("taunt" in r2.state.fighters[0][3]!, false);
    });

    it("dos almas provocando: cada atacante va a la primera de su orden de carriles", () => {
      const s = createBattle(mkTeam("a", "llama", kitT, cfg), mkTeam("b", "vapor", kitT, cfg), cfg);
      const r = play(s, ALL.map((actor) => ({ actor, move: actor >= 3 ? 1 : 0, target: 0 })), auto([0, 0, 0, 0]), cfg);
      assert.deepEqual(ALL.map((p) => targetsOf(r, "B", p)?.[0]), [3, 4, 3, 4]);
    });

    it("con objetivo manual también desvía al ejecutar los ataques de un solo objetivo", () => {
      const manual = flat();
      const s = createBattle(mkTeam("a", "llama", kitT, manual), mkTeam("b", "vapor", kitT, manual), manual);
      const r = play(s, ALL.map((actor) => ({ actor, move: actor === 3 ? 1 : 0, target: actor === 3 ? 3 : 1 })), [{ actor: 1, move: 0, target: 2 }, { actor: 2, move: 2, target: 1 }, { actor: 3, move: 3, target: 4 }, { actor: 4, move: 0, target: 1 }], manual);
      assert.deepEqual(ALL.map((p) => targetsOf(r, "B", p)), [[3], [1, 2], [3], [3]]);
    });

    it("gramática: desactivada no cambia ningún movimiento; activada es determinista, válida y Roca la lleva", () => {
      const on = loadBattleConfig(undefined, TAUNT);
      const off = GCFG.catalog.map((t) => generateMove(t, BCFG.moves));
      const cat = GCFG.catalog.map((t) => generateMove(t, on.moves));
      assert.ok(off.every((m) => !("taunt" in m)));
      assert.deepEqual(JSON.parse(JSON.stringify(cat)), JSON.parse(JSON.stringify(GCFG.catalog.map((t) => generateMove(t, loadBattleConfig(undefined, TAUNT).moves)))));
      const changed = cat.filter((m, i) => JSON.stringify(m) !== JSON.stringify(off[i]));
      assert.ok(changed.length >= 1 && changed.length <= 6, `cambian ${changed.length}`);
      for (const m of changed) {
        assert.equal(m.taunt, true);
        assert.equal(m.status, null);
        assert.equal(m.archetype, "proteccion");
        assert.match(describeMove(m, on.moves), /provocar/);
      }
      for (const m of cat) assert.deepEqual(validateMove(m, on.moves), [], m.id);
      assert.ok(cat.some((m) => m.taunt && m.family === "roca"), "Roca lleva provocar en su catálogo");
      assert.ok(cat.every((m) => !m.taunt || ["roca", "marea", "brote"].includes(m.family)), "solo familias con peso > 0");
      // el coste sale del presupuesto: mismo movimiento con menos escudo
      const m = changed.find((x) => x.family === "roca")!;
      const before = off.find((x) => x.id === m.id)!;
      assert.ok(m.power < before.power && m.cost === before.cost && m.points <= m.budget + 1e-9);
      // con la variante desactivada, un movimiento con provocar no es válido
      assert.ok(validateMove(m, BCFG.moves).some((e) => e.includes("provocar")));
      // mutados: pura en la clave y con 8 tiradas propias (no toca otros RNG)
      const key = "roca|cuerpo|4040";
      assert.deepEqual(generateMoveForKey(key, on.moves), generateMoveForKey(key, on.moves));
    });
  });

  it("formación de referencia: provocar y más vida, delante", () => {
    const taunt = mkMove({ archetype: "proteccion", scalable: "escudo", target: "aliado", taunt: true });
    const team = [mkFighter("p", "llama", [], { maxHp: 180 }), mkFighter("q", "llama", [], { maxHp: 260 }), mkFighter("r", "roca", [taunt], { maxHp: 200 }), mkFighter("s", "llama", [], { maxHp: 260 })];
    assert.deepEqual(suggestFormation(team).map((c) => c.id), ["r", "q", "s", "p"]);
  });
});

// ------------------------------------------------------------------ determinismo e IA con cada combinación

const COMBOS: [string, ((r: Raw) => void)[], boolean][] = [
  ["V1", [V1], false],
  ["V2", [V2], false],
  ["V1+V2", [V1, V2], false],
  ["V1+V2+V3", [V1, V2, V3], false],
  ["V4", [V4], true],
  ["V4+V1+V2", [V4, V1, V2], true],
  ["V4+V1+V2+V3", [V4, V1, V2, V3], true],
];

describe("variantes v0.3 — determinismo, tiradas fijas e IA con cada combinación (§4)", () => {
  const pop = (seed: string): [Creature[], Creature[]] => {
    const p = createWildPopulation(createRng(seed), GCFG, 8);
    return [p.slice(0, 4), p.slice(4)];
  };

  for (const [name, patches, withTaunt] of COMBOS) {
    const cfg = loadBattleConfig((r) => patches.forEach((p) => p(r)), withTaunt ? TAUNT : undefined);

    it(`${name}: 24 tiradas por turno, misma semilla ⇒ mismo registro y la IA de referencia siempre da planes válidos`, () => {
      let moves = 0;
      let taunts = 0;
      for (let g = 0; g < 6; g++) {
        const [A, B] = pop(`var-${name}-${g}`);
        const r1 = runBattle(A, B, g, cfg);
        const r2 = runBattle(A, B, g, cfg);
        assert.equal(r1.hash, r2.hash);
        assert.equal(drawsConsumed(cfg.combat.seedPrefix + String(g), (rng) => {
          // misma partida con el RNG observado
          let s = createBattle(A.map((c) => buildCombatant(c, cfg)), B.map((c) => buildCombatant(c, cfg)), cfg);
          const ai = createReferenceAi();
          while (s.result === null) s = resolveTurn(s, ai(s, "A", cfg), ai(s, "B", cfg), rng, cfg).state;
          assert.equal(JSON.stringify(s), JSON.stringify(r1.final));
        }), 24 * r1.turns, "24 tiradas por turno");
        for (const ev of r1.log.flat()) {
          if (ev.type === "plan") {
            assert.equal(ev.valid, true, `${name} partida ${g}: ${ev.reason}`);
            if (cfg.combat.variants.autoTarget.active) assert.ok(ev.actions.every((a) => a.target === 0));
          }
          if (ev.type === "action" && ev.move !== 0) moves++;
          if (ev.type === "taunt") taunts++;
        }
      }
      assert.ok(moves > 20, "la IA usa movimientos");
      if (!withTaunt) assert.equal(taunts, 0);
    });

    it(`${name}: la IA con búsqueda da planes válidos, es determinista y no depende de la semilla de la partida`, () => {
      const search = createSearchAi({ simulations: 2, horizon: 2, topK: 2, candidates: 3 });
      const ref = createReferenceAi();
      const [A, B] = pop(`busq-${name}`);
      let s = createBattle(A.map((c) => buildCombatant(c, cfg)), B.map((c) => buildCombatant(c, cfg)), cfg);
      const rng = createRng(`partida-${name}`);
      for (let t = 0; t < 6 && s.result === null; t++) {
        const pa = search(s, "A", cfg);
        assert.equal(validatePlan(s, "A", pa, cfg), null, `turno ${s.turn}`);
        if (t === 1) {
          rng.getState(); // el RNG de la partida no entra en la decisión: mismo estado ⇒ mismo plan
          assert.deepEqual(search(JSON.parse(JSON.stringify(s)) as BattleState, "A", cfg), pa);
        }
        const r = resolveTurn(s, pa, ref(s, "B", cfg), rng, cfg);
        assert.ok(evs(r, "plan").every((e) => e.valid));
        s = r.state;
      }
    });
  }

  it("V2: la IA nunca elige un movimiento en descanso y usa menos el mismo movimiento dos turnos seguidos (ninguno)", () => {
    const cfg = loadBattleConfig(V2);
    const [A, B] = pop("var-descanso");
    const r = runBattle(A, B, "d", cfg);
    const last = new Map<string, number>();
    r.log.forEach((turn) => {
      const now = new Map<string, number>();
      for (const ev of turn) {
        if (ev.type !== "action" || ev.move === 0) continue;
        const k = `${ev.side}${ev.actor}`;
        assert.notEqual(last.get(k), ev.move, `repite ${k}`);
        now.set(k, ev.move);
      }
      last.clear();
      now.forEach((v, k) => last.set(k, v));
    });
  });
});
