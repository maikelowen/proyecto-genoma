/** Combate v0.5 (docs/spec/combate-v0.5.md): energía pagada al confirmar (D-054) y última ánima (D-053, D-056). */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import rawCombat05 from "../../../config/combate.v0.5.json" with { type: "json" };
import {
  ConfigError,
  createBattle,
  createReferenceAi,
  createRng,
  createSearchAi,
  createWildPopulation,
  damageAmount,
  eligibleActors,
  energyLost,
  lastAnimaPlans,
  lastAnimaPos,
  parseCombatConfig,
  parseMovesConfig,
  planSynergy,
  resolveTurn,
  restingMoves,
  runBattle,
  validatePlan,
  type Action,
  type BattleConfig,
  type BattleEvent,
  type BattleState,
  type Combatant,
  type FighterState,
  type Plan,
  type TurnResult,
} from "../src/index.ts";
import { BCFG04, GCFG, mk04, mkMove, rawCombat04Clone, rawMoves04Clone } from "./combat-helpers.ts";
import { drawsConsumed } from "./genetics-helpers.ts";

const raw05 = (): any => structuredClone(rawCombat05);
const build = (c: any): BattleConfig => ({ combat: parseCombatConfig(c), moves: parseMovesConfig(rawMoves04Clone(), GCFG) });
/** v0.5 real (ambas mecánicas activas), con cambios opcionales. */
const cfg05 = (patch?: (r: any) => void): BattleConfig => {
  const c = raw05();
  if (patch) patch(c);
  return build(c);
};
/** v0.5 sin azar en orden ni daño y sin desgaste: daño = potencia (llama contra llama, stats equilibradas). */
const flat05 = (patch?: (r: any) => void): BattleConfig =>
  cfg05((r) => {
    r.dano.varianza = 0;
    r.orden.jitter = 0;
    r.desgaste.desde_turno = 99;
    if (patch) patch(r);
  });
const BOTH = flat05();
const NO_PAY = flat05((r) => (r.energia.pago_al_confirmar = false));
const NO_LAST = flat05((r) => (r.variantes.ultima_anima.activo = false));
const FIRST = flat05((r) => (r.variantes.ultima_anima.aturdir = "primero"));
const FIRST_NO_PAY = flat05((r) => {
  r.variantes.ultima_anima.aturdir = "primero";
  r.energia.pago_al_confirmar = false;
});

type Moves = Parameters<typeof mk04>[1];
const team = (p: string, moves: Moves = {}): Combatant[] => [1, 2, 3].map((i) => mk04(`${p}${i}`, moves));
const withFighters = (s: BattleState, side: 0 | 1, f: (x: FighterState, pos: number) => FighterState): BattleState => {
  const fs = s.fighters.map((t, k) => (k === side ? t.map((x, i) => f(x, i + 1)) : t)) as unknown as BattleState["fighters"];
  return { ...s, fighters: fs };
};
const ko = (x: FighterState): FighterState => ({ ...x, hp: 0, ko: true, statuses: [] });
/** Estado con A reducido a una sola ánima viva en `lastPos` (colocación 1, 2, 3) y B completo salvo `bKo`. */
function lastState(cfg: BattleConfig, aMoves: Moves = {}, bMoves: Moves = {}, opts: { lastPos?: number; energy?: [number, number]; turn?: number; bKo?: number[]; aHp?: number; bHp?: Record<number, number> } = {}): BattleState {
  const lp = opts.lastPos ?? 1;
  let s = createBattle(team("a", aMoves), team("b", bMoves), cfg, [1, 2, 3], [1, 2, 3]);
  s = withFighters(s, 0, (x, p) => (p === lp ? (opts.aHp !== undefined ? { ...x, hp: opts.aHp } : x) : ko(x)));
  s = withFighters(s, 1, (x, p) => ((opts.bKo ?? []).includes(p) ? ko(x) : opts.bHp?.[p] !== undefined ? { ...x, hp: opts.bHp[p] as number } : x));
  return { ...s, energy: opts.energy ?? [10, 10], turn: opts.turn ?? 1 };
}
const seq = (actor: number, moves: number[]): Action[] => moves.map((move) => ({ actor, move, target: 0 }));
const free = (actors: number[]): Action[] => actors.map((actor) => ({ actor, move: 3, target: 0 }));
const play = (s: BattleState, a: Plan, b: Plan, cfg: BattleConfig): TurnResult => resolveTurn(s, a, b, createRng("t"), cfg);
const of = <T extends BattleEvent["type"]>(r: TurnResult, type: T, side?: "A" | "B"): Extract<BattleEvent, { type: T }>[] =>
  r.events.filter((e): e is Extract<BattleEvent, { type: T }> => e.type === type && (side === undefined || (e as { side?: string }).side === side));
const stun = mkMove({ status: "aturdir", power: 10 });
const shield = mkMove({ archetype: "proteccion", target: "aliado", scalable: "escudo", power: 20 });

describe("config v0.5 (§0, §8)", () => {
  it("carga; las claves nuevas son obligatorias en v0.5 y valen false en v0.4", () => {
    const C = cfg05().combat;
    assert.equal(C.energy.payOnConfirm, true);
    assert.deepEqual(C.variants.lastAnima, { active: true, stun: "turno", slotPriority: "primero" });
    assert.equal(BCFG04.combat.energy.payOnConfirm, false);
    assert.equal(BCFG04.combat.variants.lastAnima.active, false);
    for (const [path, f] of [
      ["energia.pago_al_confirmar", (r: any) => delete r.energia.pago_al_confirmar],
      ["variantes.ultima_anima", (r: any) => delete r.variantes.ultima_anima],
      ["variantes.ultima_anima.aturdir", (r: any) => (r.variantes.ultima_anima.aturdir = "todo")],
      ["variantes.ultima_anima.prioridad_hueco", (r: any) => (r.variantes.ultima_anima.prioridad_hueco = "maximo")],
      ["variantes.ultima_anima.activo", (r: any) => (r.variantes.ultima_anima.activo = 1)],
      ["variantes.ultima_anima.tope", (r: any) => (r.variantes.ultima_anima.tope = 2)],
      ["energia.pago_al_confirmar", (r: any) => (r.energia.pago_al_confirmar = "si")],
      ["energia.reserva", (r: any) => (r.energia.reserva = 1)],
      ["variantes.descanso.gratis_descansa", (r: any) => delete r.variantes.descanso.gratis_descansa],
    ] as const) {
      const r = raw05();
      f(r);
      assert.throws(() => parseCombatConfig(r), (e: unknown) => e instanceof ConfigError && e.message.startsWith(path), path);
    }
    // en v0.4 el bloque es opcional (para estudiarlo) pero se valida igual
    const r4 = rawCombat04Clone();
    r4.variantes.ultima_anima = { activo: true, aturdir: "primero", prioridad_hueco: "minimo" };
    assert.deepEqual(parseCombatConfig(r4).variants.lastAnima, { active: true, stun: "primero", slotPriority: "minimo" });
  });
});

// Garantía de regresión (§0): con las dos claves a false, v0.5 es v0.4 con energía 3: mismo dorado, sin tocarlo.
const GOLDEN04 = { result: "B", turns: 8, hash: "c93573688987eaf1fecd172ab90cee91" };
// Vector dorado v0.5 nuevo (ambas mecánicas activas, config real). Si falla, ha cambiado el algoritmo o la config.
const GOLDEN05 = { result: "B", turns: 6, hash: "70cee9fd987adfe1c41615c4d04beda1" };
describe("vectores dorados v0.5", () => {
  const pop = createWildPopulation(createRng("dorado-combate-v04"), GCFG, 6);
  it("con pago_al_confirmar = false y ultima_anima.activo = false ⇒ el dorado de v0.4 sin cambios", () => {
    const cfg = cfg05((r) => {
      r.energia.pago_al_confirmar = false;
      r.variantes.ultima_anima.activo = false;
    });
    const r = runBattle(pop.slice(0, 3), pop.slice(3), "dorado", cfg);
    assert.deepEqual({ result: r.result, turns: r.turns, hash: r.hash }, GOLDEN04);
  });
  it("con ambas activas (config v0.5 real)", () => {
    const r = runBattle(pop.slice(0, 3), pop.slice(3), "dorado", cfg05());
    assert.deepEqual({ result: r.result, turns: r.turns, hash: r.hash }, GOLDEN05);
  });
});

describe("determinismo y tiradas (§3.4)", () => {
  it("misma semilla ⇒ mismo registro; 24 tiradas por turno con secuencias y cancelaciones", () => {
    const cfg = cfg05();
    const r1 = runBattle(createWildPopulation(createRng("d1"), GCFG, 3), createWildPopulation(createRng("d2"), GCFG, 3), "x", cfg);
    const r2 = runBattle(createWildPopulation(createRng("d1"), GCFG, 3), createWildPopulation(createRng("d2"), GCFG, 3), "x", cfg);
    assert.equal(r1.hash, r2.hash);
    const s = lastState(BOTH, {}, { 1: stun }, { turn: 2 });
    for (const [a, b] of [
      [seq(1, [1, 2, 4]), free([1, 2, 3])],
      [seq(1, [1, 2, 4]), seq(1, [1])], // aturdida antes de su hueco: se cancela todo
      [seq(1, [3]), free([1, 2, 3])],
      [seq(1, [3, 1]), free([1, 2, 3])], // inválido ⇒ gratis
    ] as const) {
      for (const cfg of [BOTH, FIRST, NO_PAY, NO_LAST]) assert.equal(drawsConsumed("d", (rng) => resolveTurn(s, a, b, rng, cfg)), 24);
    }
  });

  it("§3.4: el movimiento j de la secuencia usa la varianza de la casilla L[j] (última en 3 ⇒ 3, 1, 2)", () => {
    const cfg = cfg05((r) => {
      r.orden.jitter = 0;
      r.desgaste.desde_turno = 99;
    });
    const s = lastState(cfg, {}, {}, { lastPos: 3 });
    const r = resolveTurn(s, seq(3, [1, 2, 4]), free([1, 2, 3]), createRng("v"), cfg);
    const u = createRng("v");
    const draws: number[] = [];
    for (let i = 0; i < 24; i++) draws.push(u.next());
    const C = cfg.combat;
    const c = s.teams[0][2] as Combatant;
    const expect = [2, 0, 1].map((slot) => damageAmount(50, c.attack, "llama", "llama", false, false, 1 - C.damage.variance + 2 * C.damage.variance * (draws[8 + slot * 2] as number), 1, C));
    assert.deepEqual(of(r, "damage", "B").map((e) => e.amount), expect);
  });
});

describe("D-054 aislada: energía pagada al confirmar (§1, U18)", () => {
  it("si cae antes de actuar, la energía se pierde; sin la clave, se devuelve", () => {
    const base = (cfg: BattleConfig): BattleState => withFighters(createBattle(team("a"), team("b"), cfg, [1, 2, 3], [1, 2, 3]), 1, (x, p) => (p === 1 ? { ...x, hp: 10 } : x));
    const aPlan: Action[] = [{ actor: 1, move: 1, target: 0 }, ...free([2, 3])];
    const bPlan: Action[] = [{ actor: 1, move: 1, target: 0 }, ...free([2, 3])];
    const lostR = play(base(NO_LAST), aPlan, bPlan, NO_LAST);
    assert.deepEqual(of(lostR, "cancel", "B"), [{ type: "cancel", side: "B", actor: 1, reason: "ko", refund: 0, lost: 1 }]);
    assert.equal(lostR.state.energy[1], 3 - 1 + 3);
    assert.deepEqual(energyLost([lostR.events]).B, { ko: 1, aturdido: 0, last: 0 });
    const v04 = flat05((r) => {
      r.energia.pago_al_confirmar = false;
      r.variantes.ultima_anima.activo = false;
    });
    const back = play(base(v04), aPlan, bPlan, v04);
    assert.deepEqual(of(back, "cancel", "B"), [{ type: "cancel", side: "B", actor: 1, reason: "ko", refund: 1 }]);
    assert.equal(back.state.energy[1], 3 + 3);
  });
});

describe("D-053 aislada: varios movimientos de la última ánima (§2, §3)", () => {
  it("1–3 pagos distintos seguidos en un solo hueco, en el orden elegido; nadie actúa entre medias", () => {
    const s = lastState(NO_PAY, {}, {}, { turn: 2 });
    const r = play(s, seq(1, [4, 1, 2]), free([1, 2, 3]), NO_PAY);
    const order = of(r, "order")[0]?.queue ?? [];
    assert.deepEqual(order.filter((q) => q.side === "A"), [{ side: "A", actor: 1, priority: 0, initiative: 100, moves: [4, 1, 2] }]);
    assert.ok(order.filter((q) => q.side === "B").every((q) => q.moves === undefined));
    const acts = r.events.map((e, i) => ({ e, i })).filter((x) => x.e.type === "action" && x.e.side === "A");
    assert.deepEqual(acts.map((x) => [(x.e as { move: number }).move, (x.e as { seq?: unknown }).seq]), [[4, { index: 1, of: 3 }], [1, { index: 2, of: 3 }], [2, { index: 3, of: 3 }]]);
    // seguidos: entre la 1.ª y la última acción de A no hay acciones de B
    const lo = (acts[0] as { i: number }).i;
    const hi = (acts[2] as { i: number }).i;
    assert.ok(r.events.slice(lo, hi).every((e) => !(e.type === "action" && e.side === "B")));
    assert.equal(of(r, "plan", "A")[0]?.cost, 3);
    assert.equal(r.state.energy[0], 10 - 3 + 3);
  });

  it("(h) gratis + pago, pago repetido o más entradas de otra ánima ⇒ inválido ⇒ gratis; sin la variante, actor repetido", () => {
    const s = lastState(BOTH);
    assert.match(validatePlan(s, "A", seq(1, [3, 1]), BOTH) ?? "", /gratis va solo/);
    assert.match(validatePlan(s, "A", seq(1, [1, 1]), BOTH) ?? "", /repetido/);
    assert.match(validatePlan(s, "A", [...seq(1, [1]), { actor: 2, move: 1, target: 0 }], BOTH) ?? "", /no puede actuar/);
    assert.match(validatePlan(s, "A", [], BOTH) ?? "", /falta/);
    assert.equal(validatePlan(s, "A", seq(1, [3]), BOTH), null);
    assert.equal(validatePlan(s, "A", seq(1, [2, 4, 1]), BOTH), null);
    assert.match(validatePlan(s, "A", seq(1, [1, 2]), NO_LAST) ?? "", /actor 1 repetido/);
    const r = play(s, seq(1, [1, 1]), free([1, 2, 3]), BOTH);
    const plan = of(r, "plan", "A")[0];
    assert.equal(plan?.valid, false);
    assert.deepEqual(plan?.actions, [{ actor: 1, move: 3, target: 0 }]);
  });

  it("U17: sin energía para ningún pago solo le queda el gratis", () => {
    const s = lastState(BOTH, {}, {}, { energy: [0, 3] });
    assert.deepEqual(lastAnimaPlans(s, "A", BOTH), [seq(1, [3])]);
    assert.match(validatePlan(s, "A", seq(1, [1]), BOTH) ?? "", /energía insuficiente/);
  });

  it("U1 y (g): la compañera cae en t ⇒ en t acción normal; en t + 1 última, con el descanso pendiente ignorado", () => {
    let s = createBattle(team("a"), team("b"), BOTH, [1, 2, 3], [1, 2, 3]);
    s = withFighters(s, 0, (x, p) => (p === 3 ? ko(x) : p === 2 ? { ...x, hp: 10 } : x));
    assert.equal(lastAnimaPos(s, "A", BOTH), 0);
    assert.match(validatePlan(s, "A", [...seq(1, [1, 2]), { actor: 2, move: 3, target: 0 }], BOTH) ?? "", /actor 1 repetido/);
    const r = play(s, [{ actor: 1, move: 1, target: 0 }, { actor: 2, move: 3, target: 0 }], [{ actor: 1, move: 1, target: 0 }, { actor: 2, move: 1, target: 0 }, ...free([3])], BOTH);
    assert.ok(of(r, "ko", "A").some((e) => e.pos === 2));
    const s2 = r.state;
    assert.equal(lastAnimaPos(s2, "A", BOTH), 1);
    assert.deepEqual(restingMoves(s2, "A", 1), [1]); // el contador sigue en el estado…
    assert.deepEqual(restingMoves(s2, "A", 1, BOTH), []); // …pero la última lo ignora
    assert.equal(validatePlan(s2, "A", seq(1, [1, 2, 4]), BOTH), null);
    const r2 = play(s2, seq(1, [1, 2]), free([1, 2, 3]), BOTH);
    assert.deepEqual(of(r2, "action", "A").map((e) => e.move), [1, 2]);
    assert.deepEqual(restingMoves(r2.state, "A", 1), []); // lo que ejecuta la última no descansa
  });

  it("U9 / §8: planSynergy cuenta ánimas distintas (tres entradas de la misma ⇒ 0; combo_familia falsa)", () => {
    const t = team("a");
    const C = BOTH.combat;
    assert.deepEqual(planSynergy(t, seq(1, [1, 2, 4]), C), { bonus: [0, 0, 0, 0], combo: [false, false, false, false] });
    const three = planSynergy(t, [{ actor: 1, move: 1, target: 0 }, { actor: 2, move: 1, target: 0 }, { actor: 3, move: 1, target: 0 }], C);
    assert.ok((three.bonus[0] as number) > 0); // control: tres ánimas distintas sí suman
  });
});

describe("casos borde con aturdir y KO (U2–U5)", () => {
  // Turno 2: favorece a B, que actúa antes que la última de A (iniciativas iguales, jitter 0).
  const s = lastState(BOTH, {}, { 1: stun }, { turn: 2, energy: [5, 5] });
  const bStun: Action[] = [{ actor: 1, move: 1, target: 0 }, ...free([2, 3])];

  it("U2 \"turno\": aturdida antes de su hueco pierde la secuencia; con pago, toda la energía comprometida", () => {
    const r = play(s, seq(1, [1, 2, 4]), bStun, BOTH);
    assert.deepEqual(of(r, "cancel", "A").map((e) => [e.reason, e.move, e.refund, e.lost, e.seq?.index]), [["aturdido", 1, 0, 1, 1], ["aturdido", 2, 0, 1, 2], ["aturdido", 4, 0, 1, 3]]);
    assert.equal(of(r, "action", "A").length, 0);
    assert.equal(r.state.energy[0], 5 - 3 + 3);
    assert.deepEqual(energyLost([r.events]).A, { ko: 0, aturdido: 3, last: 3 });
    const back = play(lastState(NO_PAY, {}, { 1: stun }, { turn: 2, energy: [5, 5] }), seq(1, [1, 2, 4]), bStun, NO_PAY);
    assert.deepEqual(of(back, "cancel", "A").map((e) => [e.refund, e.lost]), [[1, undefined], [1, undefined], [1, undefined]]);
    assert.equal(back.state.energy[0], 5 + 3);
  });

  it("U3 \"primero\": solo se cancela el 1.º; el resto se ejecuta en el mismo hueco", () => {
    for (const cfg of [FIRST, FIRST_NO_PAY]) {
      const st = lastState(cfg, {}, { 1: stun }, { turn: 2, energy: [5, 5] });
      const r = play(st, seq(1, [1, 2, 4]), bStun, cfg);
      const c = of(r, "cancel", "A");
      assert.equal(c.length, 1);
      assert.deepEqual([c[0]?.move, c[0]?.reason, c[0]?.refund], [1, "aturdido", cfg === FIRST ? 0 : 1]);
      assert.deepEqual(of(r, "action", "A").map((e) => [e.move, e.seq?.index]), [[2, 2], [4, 3]]);
      assert.equal(r.state.energy[0], 5 - 3 + (cfg === FIRST ? 0 : 1) + 3);
    }
  });

  it("U4: aturdida después de actuar — \"turno\": no elige el turno siguiente; \"primero\": elige y se cancela su 1.º", () => {
    // turno 1: A (favorecida) actúa y después B la aturde ⇒ skipTurn = 2
    for (const cfg of [BOTH, FIRST]) {
      const st = lastState(cfg, {}, { 1: stun }, { energy: [5, 5] });
      const r = play(st, seq(1, [1, 2]), bStun, cfg);
      assert.equal(of(r, "action", "A").length, 2);
      assert.equal(r.state.fighters[0][0]?.skipTurn, 2);
      if (cfg === BOTH) {
        assert.deepEqual(eligibleActors(r.state, "A", cfg), []);
        assert.deepEqual(lastAnimaPlans(r.state, "A", cfg), []);
        assert.equal(validatePlan(r.state, "A", [], cfg), null);
        const r2 = play(r.state, [], free([1, 2, 3]), cfg);
        assert.equal(of(r2, "cancel", "A").length + of(r2, "action", "A").length, 0);
      } else {
        assert.deepEqual(eligibleActors(r.state, "A"), []); // sin cfg, la regla de v0.4
        assert.deepEqual(eligibleActors(r.state, "A", cfg), [1]);
        // B1 tiene el aturdir en descanso: aturde B2 (mismo movimiento) para ver la inmunidad
        const r2 = play(r.state, seq(1, [1, 2]), [{ actor: 2, move: 1, target: 0 }, ...free([1, 3])], cfg);
        assert.deepEqual(of(r2, "cancel", "A").map((e) => [e.move, e.reason, e.lost]), [[1, "aturdido", 1]]);
        assert.deepEqual(of(r2, "action", "A").map((e) => e.move), [2]);
        assert.ok(of(r2, "immune", "A").length === 1); // inmunidad de siempre
      }
    }
  });

  it("U5: cae antes de su hueco ⇒ se cancela la secuencia entera (un evento por movimiento)", () => {
    const st = lastState(BOTH, {}, {}, { turn: 2, energy: [5, 5], aHp: 10 });
    const r = play(st, seq(1, [1, 2, 4]), [{ actor: 1, move: 1, target: 0 }, ...free([2, 3])], BOTH);
    assert.deepEqual(of(r, "cancel", "A").map((e) => [e.reason, e.lost]), [["ko", 1], ["ko", 1], ["ko", 1]]);
    assert.equal(r.state.result, "B");
    assert.deepEqual(energyLost([r.events]).A, { ko: 3, aturdido: 0, last: 3 });
  });
});

describe("ejecución de la secuencia (U7, U8, U10–U14, U16)", () => {
  it("U7: si cae la delantera rival con el 1.º, el 2.º ya va a la trasera", () => {
    const s = lastState(BOTH, {}, {}, { bKo: [2], bHp: { 1: 30 } });
    const r = play(s, seq(1, [1, 2]), free([1, 3]), BOTH);
    assert.deepEqual(of(r, "action", "A").map((e) => e.targets), [[1], [3]]);
  });

  it("U8: sin rivales vivos, los ofensivos restantes se pierden (pagados) y los de aliado se ejecutan", () => {
    const s = lastState(BOTH, { 2: shield }, {}, { bKo: [2, 3], bHp: { 1: 30 } });
    const r = play(s, seq(1, [1, 4, 2]), free([1]), BOTH);
    assert.deepEqual(of(r, "lost", "A"), [{ type: "lost", side: "A", actor: 1, move: 4, seq: { index: 2, of: 3 } }]);
    assert.deepEqual(of(r, "shield", "A").map((e) => e.total), [20]);
    assert.equal(r.state.result, "A");
    assert.equal(r.state.energy[0], 10 - 3);
  });

  it("U11: dos escudos seguidos se apilan con Q-01; U10: provocar sale con su evento", () => {
    const s = lastState(BOTH, { 1: shield, 2: mkMove({ archetype: "proteccion", target: "aliado", scalable: "escudo", power: 20, taunt: true }) });
    const r = play(s, seq(1, [1, 2]), free([1, 2, 3]), BOTH);
    assert.deepEqual(of(r, "shield", "A").map((e) => e.total), [20, 40]);
    assert.equal(of(r, "taunt", "A").length, 1);
  });

  it("U12 / (d): la energía extra se suma al ejecutarse pero no paga la secuencia", () => {
    const extra = mkMove({ extraEnergy: 1 });
    const s = lastState(BOTH, { 1: extra, 2: mkMove({ cost: 2 }) }, {}, { energy: [3, 3] });
    assert.match(validatePlan(s, "A", seq(1, [1, 2, 4]), BOTH) ?? "", /energía insuficiente/);
    const r = play(s, seq(1, [1, 2]), free([1, 2, 3]), BOTH);
    assert.equal(of(r, "plan", "A")[0]?.valid, true);
    assert.deepEqual(of(r, "energy", "A").map((e) => e.energy), [1]);
    assert.equal(r.state.energy[0], 0 + 1 + 3);
  });

  it("U14: una marca puesta por el 1.º ya cuenta en el golpe del 2.º", () => {
    const s = lastState(BOTH, { 1: mkMove({ status: "marca", power: 10 }) });
    const r = play(s, seq(1, [1, 2]), free([1, 2, 3]), BOTH);
    assert.deepEqual(of(r, "damage", "B").map((e) => e.amount), [10, Math.round(50 * BOTH.combat.statuses.marca.value)]);
  });

  it("§3.1: el hueco toma la prioridad del 1.º movimiento (\"primero\") o la menor (\"minimo\"); U16 dos últimas", () => {
    const s = lastState(BOTH, { 1: shield }, {}, { turn: 2, bKo: [2, 3] }); // turno par: B favorecida
    const MIN = flat05((r) => (r.variantes.ultima_anima.prioridad_hueco = "minimo"));
    const r1 = play(s, seq(1, [1, 2]), seq(1, [1, 2]), BOTH);
    const q1 = of(r1, "order")[0]?.queue ?? [];
    assert.deepEqual(q1.map((q) => [q.side, q.priority, q.moves]), [["A", 1, [1, 2]], ["B", 0, [1, 2]]]);
    const r2 = play(s, seq(1, [1, 2]), seq(1, [1, 2]), MIN);
    assert.deepEqual((of(r2, "order")[0]?.queue ?? []).map((q) => [q.side, q.priority]), [["B", 0], ["A", 0]]);
    const r3 = play(s, seq(1, [2, 1]), seq(1, [1, 2]), BOTH); // el escudo en 2.º lugar no adelanta el hueco
    assert.deepEqual((of(r3, "order")[0]?.queue ?? []).map((q) => q.side), ["B", "A"]);
  });
});

describe("IA con la última ánima (§5)", () => {
  it("enumera ≤ 16 opciones: gratis + subconjuntos asequibles × órdenes", () => {
    assert.equal(lastAnimaPlans(lastState(BOTH, {}, {}, { energy: [3, 3] }), "A", BOTH).length, 16);
    assert.equal(lastAnimaPlans(lastState(BOTH, {}, {}, { energy: [2, 3] }), "A", BOTH).length, 10);
    assert.equal(lastAnimaPlans(lastState(BOTH, {}, {}, { energy: [1, 3] }), "A", BOTH).length, 4);
    assert.deepEqual(lastAnimaPlans(createBattle(team("a"), team("b"), BOTH, [1, 2, 3], [1, 2, 3]), "A", BOTH), []);
  });

  it("la IA de referencia encadena pagos con energía de sobra y desempata por prioridad del hueco", () => {
    const ai = createReferenceAi();
    const s = lastState(BOTH);
    const p = ai(s, "A", BOTH);
    assert.equal(validatePlan(s, "A", p, BOTH), null);
    assert.equal(p.length, 3);
    // golpe (1) y escudo (4) valen lo mismo en cualquier orden ⇒ el que da prioridad al hueco: escudo primero
    // (golpe de 100 y escudo de 80: ambos valen más que guardar 1 de energía, λ = 0,9 · (100 − 15))
    const big = mkMove({ archetype: "proteccion", target: "aliado", scalable: "escudo", power: 80 });
    const s2 = lastState(BOTH, { 1: mkMove({ power: 100 }), 2: mkMove({ cost: 9 }), 4: big }, {}, { energy: [2, 3] });
    assert.deepEqual(ai(s2, "A", BOTH).map((a) => a.move), [4, 1]);
    // control: con "minimo" los dos órdenes dan nivel 0 ⇒ empate total ⇒ orden lexicográfico
    const MIN = flat05((r) => (r.variantes.ultima_anima.prioridad_hueco = "minimo"));
    assert.deepEqual(ai(lastState(MIN, { 1: mkMove({ power: 100 }), 2: mkMove({ cost: 9 }), 4: big }, {}, { energy: [2, 3] }), "A", MIN).map((a) => a.move), [1, 4]);
  });

  it("partidas completas v0.5: todos los planes válidos y la última encadena a veces; la de búsqueda también", () => {
    const cfg = cfg05();
    let chained = 0;
    for (let i = 0; i < 30; i++) {
      const r = runBattle(createWildPopulation(createRng(`v05a${i}`), GCFG, 3), createWildPopulation(createRng(`v05b${i}`), GCFG, 3), `s${i}`, cfg);
      for (const t of r.log) {
        for (const e of t) {
          if (e.type === "plan") assert.ok(e.valid, e.reason ?? "");
          if (e.type === "order") for (const q of e.queue) if (q.moves && q.moves.length >= 2) chained++;
        }
      }
    }
    assert.ok(chained > 0);
    const s = lastState(cfg, {}, {}, { energy: [6, 6] });
    const p = createSearchAi({ simulations: 2 })(s, "A", cfg);
    assert.equal(validatePlan(s, "A", p, cfg), null);
  });
});

// No alcanzables con el catálogo actual (ver notas): U6 (caer en mitad de la propia secuencia; el bucle comprueba
// KO antes de cada movimiento, como U5). U13 y U15 no tienen código propio (orden fijado antes de ejecutar; drenaje por movimiento).
