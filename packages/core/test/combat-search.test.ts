/** IA con búsqueda: planes válidos, determinismo y honestidad (no usa el RNG de la partida). Presupuestos pequeños. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildCombatant,
  createBattle,
  createReferenceAi,
  createRng,
  createSearchAi,
  createWildPopulation,
  resolveTurn,
  validatePlan,
  type BattleState,
  type Combatant,
} from "../src/index.ts";
import { BCFG, GCFG } from "./combat-helpers.ts";

const SMALL = { simulations: 3, horizon: 2, topK: 2, candidates: 4 } as const;

function team(seed: string): Combatant[] {
  return createWildPopulation(createRng(seed), GCFG, 4).map((c) => buildCombatant(c, BCFG));
}

/** Estados variados: partidas con planes de referencia de reserva distinta, guardando cada turno. */
function states(n: number): BattleState[] {
  const out: BattleState[] = [];
  for (let g = 0; out.length < n; g++) {
    let s = createBattle(team(`busq-a${g}`), team(`busq-b${g}`), BCFG);
    const rng = createRng(`busq-partida${g}`);
    const a = createReferenceAi({ reserve: g % 6 });
    const b = createReferenceAi({ kappa: 0 });
    while (s.result === null && out.length < n) {
      out.push(s);
      s = resolveTurn(s, a(s, "A", BCFG), b(s, "B", BCFG), rng, BCFG).state;
    }
  }
  return out;
}

describe("IA con búsqueda", () => {
  const sample = states(60);

  it("siempre devuelve un plan válido (validatePlan) en estados variados, en los dos bandos", () => {
    const ai = createSearchAi(SMALL);
    for (const [i, s] of sample.entries()) {
      for (const side of ["A", "B"] as const) assert.equal(validatePlan(s, side, ai(s, side, BCFG), BCFG), null, `estado ${i}, bando ${side}`);
    }
  });

  it("determinista: mismo estado ⇒ mismo plan (también con otra instancia) y no muta el estado", () => {
    const s = sample[7] as BattleState;
    const before = JSON.stringify(s);
    const p1 = createSearchAi(SMALL)(s, "A", BCFG);
    const p2 = createSearchAi(SMALL)(s, "A", BCFG);
    assert.deepEqual(p1, p2);
    assert.equal(JSON.stringify(s), before);
  });

  it("honestidad: la semilla de la partida no cambia la decisión en el mismo estado", () => {
    const A = team("hon-a");
    const B = team("hon-b");
    const ai = createSearchAi(SMALL);
    const ref = createReferenceAi();
    // mismo estado alcanzado con dos semillas de partida distintas (turno 1) y tras un turno con varias semillas
    const start = createBattle(A, B, BCFG);
    const plans = ["s1", "s2", "s3"].map((seed) => {
      const rng = createRng(BCFG.combat.seedPrefix + seed);
      rng.next(); // el RNG de la partida avanza: la IA no debe notarlo
      return JSON.stringify(ai(start, "A", BCFG));
    });
    assert.equal(new Set(plans).size, 1);
    // tras un turno, estados distintos (semillas distintas) se deciden solo por su contenido:
    // el mismo estado clonado da el mismo plan aunque venga de otra semilla
    const s1 = resolveTurn(start, ref(start, "A", BCFG), ref(start, "B", BCFG), createRng("x1"), BCFG).state;
    const clone = JSON.parse(JSON.stringify(s1)) as BattleState;
    assert.deepEqual(ai(s1, "B", BCFG), ai(clone, "B", BCFG));
  });

  it("no usa Math.random ni el reloj al decidir", () => {
    const g = globalThis as unknown as { Math: { random: () => number }; Date: { now: () => number }; performance?: { now: () => number } };
    const saved = { random: g.Math.random, now: g.Date.now, perf: g.performance?.now };
    const boom = (): number => {
      throw new Error("azar o reloj no permitido en la decisión");
    };
    g.Math.random = boom;
    g.Date.now = boom;
    if (g.performance) g.performance.now = boom;
    try {
      const ai = createSearchAi(SMALL);
      for (const s of sample.slice(0, 5)) ai(s, "A", BCFG);
    } finally {
      g.Math.random = saved.random;
      g.Date.now = saved.now;
      if (g.performance && saved.perf) g.performance.now = saved.perf;
    }
  });

  it("partida terminada o sin actores ⇒ plan vacío; opciones inválidas ⇒ error", () => {
    assert.deepEqual(createSearchAi(SMALL)({ ...(sample[0] as BattleState), result: "A" }, "A", BCFG), []);
    assert.throws(() => createSearchAi({ simulations: 0 }), RangeError);
    assert.throws(() => createSearchAi({ horizon: 1.5 }), RangeError);
  });
});
