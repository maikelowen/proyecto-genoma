/**
 * Tests añadidos por el Revisor/QA (revisión qa-core-genetica-v0.1).
 * Cubren huecos de la batería original: pureza con padres congelados,
 * distribución de R1/R2, híbrida × base no componente, reparto de ancla
 * en casos límite y salvajes con D de otra familia.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { breed, createRng, createWildCreature, LOCUS_IDS, type Creature, type Gene } from "../src/index.ts";
import { mutationAnchor } from "../src/genetics/mutation.ts";
import { CFG, hybridGene, loadConfig, makeCreature, pureCreature, tol5 } from "./genetics-helpers.ts";

const ALWAYS = loadConfig((r) => (r.mutacion.prob_por_locus = 1));
const NEVER = loadConfig((r) => (r.mutacion.prob_por_locus = 0));

function deepFreeze<T>(o: T): T {
  if (o !== null && typeof o === "object") {
    for (const k of Object.keys(o)) deepFreeze((o as Record<string, unknown>)[k]);
    Object.freeze(o);
  }
  return o;
}

describe("QA: pureza", () => {
  it("breed funciona con padres congelados en profundidad (no escribe en ellos)", () => {
    const rng = createRng("qa-freeze");
    const a = deepFreeze(createWildCreature(rng, CFG, { id: "a" }));
    const b = deepFreeze(createWildCreature(rng, CFG, { id: "b" }));
    for (let i = 0; i < 200; i++) breed(a, b, rng, ALWAYS, { id: `c${i}`, birth: 1 });
  });
});

describe("QA: herencia R1/R2 (spec §3.1)", () => {
  it("frecuencias de slot de R1 y R2 ≈ sorteo sin reemplazo con pesos_R", () => {
    const wd = CFG.inheritance.weightsD;
    const wr = CFG.inheritance.weightsR;
    const WD = [wd.D, wd.R1, wd.R2, wd.D, wd.R1, wd.R2];
    const WR = [wr.D, wr.R1, wr.R2, wr.D, wr.R1, wr.R2];
    const sum = (x: number[]) => x.reduce((s, v) => s + v, 0);
    const e1 = [0, 0, 0, 0, 0, 0];
    const e2 = [0, 0, 0, 0, 0, 0];
    const sd = sum(WD);
    for (let d = 0; d < 6; d++) {
      const w1 = WR.map((x, i) => (i === d ? 0 : x));
      for (let j = 0; j < 6; j++) {
        const pj = (((WD[d] as number) / sd) * (w1[j] as number)) / sum(w1);
        e1[j] = (e1[j] as number) + pj;
        const w2 = w1.map((x, i) => (i === j ? 0 : x));
        for (let k = 0; k < 6; k++) e2[k] = (e2[k] as number) + (pj * (w2[k] as number)) / sum(w2);
      }
    }
    const rng = createRng("qa-r");
    const a = createWildCreature(rng, CFG, { id: "a" });
    const b = createWildCreature(rng, CFG, { id: "b" });
    const c1 = [0, 0, 0, 0, 0, 0];
    const c2 = [0, 0, 0, 0, 0, 0];
    let n = 0;
    for (let i = 0; i < 10_000; i++) {
      for (const t of breed(a, b, rng, NEVER, { id: "c", birth: 1 }).trace) {
        c1[t.r1Slot] = (c1[t.r1Slot] as number) + 1;
        c2[t.r2Slot] = (c2[t.r2Slot] as number) + 1;
        n++;
      }
    }
    for (let i = 0; i < 6; i++) {
      const p1 = e1[i] as number;
      const p2 = e2[i] as number;
      assert.ok(Math.abs((c1[i] as number) / n - p1) < tol5(p1, n), `R1 slot ${i}`);
      assert.ok(Math.abs((c2[i] as number) / n - p2) < tol5(p2, n), `R2 slot ${i}`);
    }
  });
});

describe("QA: familia de la mutación (spec §4.1)", () => {
  const hyb = (id: string, f: string): Creature =>
    makeCreature(id, (L) => {
      const g = hybridGene(f, L, [0.5, 0.5, 0.5, 0.5]);
      return { D: g, R1: g, R2: g };
    });

  it("híbrida × base no componente (vapor × roca) ≈ 50/50 por elegir(); nunca otra", () => {
    const rng = createRng("qa-hz");
    let v = 0;
    let n = 0;
    for (let i = 0; i < 2500; i++) {
      for (const m of breed(hyb("a", "vapor"), pureCreature("b", "roca"), rng, ALWAYS, { id: "c", birth: 1 }).mutations) {
        n++;
        if (m.family === "vapor") v++;
        else assert.equal(m.family, "roca");
      }
    }
    const p = CFG.mutation.probPickParentA;
    assert.ok(Math.abs(v / n - p) < tol5(p, n), `${v / n}`);
  });

  it("par base sin híbrida (llama × brote) ≈ 50/50 entre padres", () => {
    const rng = createRng("qa-lb");
    let l = 0;
    let n = 0;
    for (let i = 0; i < 2500; i++) {
      for (const m of breed(pureCreature("a", "llama"), pureCreature("b", "brote"), rng, ALWAYS, { id: "c", birth: 1 }).mutations) {
        n++;
        if (m.family === "llama") l++;
      }
    }
    const p = CFG.mutation.probPickParentA;
    assert.ok(Math.abs(l / n - p) < tol5(p, n), `${l / n}`);
  });
});

describe("QA: ancla mutada (spec §4.2)", () => {
  const g = (anc: [number, number, number]): Gene => {
    const anchor = { potencia: anc[0], velocidad: anc[1], resistencia: anc[2] };
    return { id: "x", family: "llama", locus: "cabeza", shape: [0.5, 0.5, 0.5, 0.5], signature: "2222", move: "m", anchor, values: anchor, origin: "base" };
  };

  it("casos en los bordes [12, 50]: suma 90, en rango, 2 decimales", () => {
    const cases: Array<[[number, number, number], [number, number, number], number[]]> = [
      [[50, 28, 12], [50, 28, 12], [3.46, -3.46, -3.46]],
      [[50, 28, 12], [50, 28, 12], [3.46, 3.46, -3.46]],
      [[50, 12, 28], [50, 12, 28], [3.46, -3.46, 3.46]],
      [[12.01, 38.99, 39], [12.01, 38.99, 39], [0, 0, 0]],
      [[33.33, 33.33, 33.34], [33.34, 33.33, 33.33], [0.001, 0.002, -0.003]],
    ];
    for (const [x, y, n] of cases) {
      const m = mutationAnchor(g(x), g(y), n, CFG);
      assert.ok(Math.abs(m[0]! + m[1]! + m[2]! - 90) < 1e-9, JSON.stringify(m));
      for (const v of m) assert.ok(v >= 12 && v <= 50 && Math.round(v * 100) / 100 === v, JSON.stringify(m));
    }
  });

  it("fuzz con sigma_ancla = 30: nunca sale de rango ni lanza", () => {
    const big = loadConfig((r) => (r.mutacion.sigma_ancla = 30));
    const rng = createRng("qa-fuzz");
    const rnd = (): [number, number, number] => {
      for (;;) {
        const a = Math.round((12 + rng.next() * 38) * 100) / 100;
        const b = Math.round((12 + rng.next() * 38) * 100) / 100;
        const c = Math.round((90 - a - b) * 100) / 100;
        if (c >= 12 && c <= 50) return [a, b, c];
      }
    };
    for (let i = 0; i < 20_000; i++) {
      const n = [0, 0, 0].map(() => (rng.next() + rng.next() + rng.next() + rng.next() - 2) * 1.7320508075688772);
      const m = mutationAnchor(g(rnd()), g(rnd()), n, big);
      assert.ok(Math.abs(m[0]! + m[1]! + m[2]! - 90) <= 0.01, JSON.stringify(m));
      for (const v of m) assert.ok(v >= 12 && v <= 50, JSON.stringify(m));
    }
  });
});

describe("QA: salvajes (spec §2.2)", () => {
  it("un D que no es de la principal nunca es de la principal; variantes ≈ uniformes", () => {
    const rng = createRng("qa-wild");
    const variants = [0, 0, 0];
    let n = 0;
    for (let i = 0; i < 2000; i++) {
      const c = createWildCreature(rng, CFG, { id: `w${i}`, family: "sombra" });
      for (const L of LOCUS_IDS) {
        for (const slot of ["D", "R1", "R2"] as const) {
          const v = Number(c.genome[L][slot].id.split(".")[2]);
          variants[v - 1] = (variants[v - 1] as number) + 1;
          n++;
        }
      }
    }
    for (const x of variants) assert.ok(Math.abs(x / n - 1 / 3) < tol5(1 / 3, n));
    // D no principal: con prob_D_familia_principal = 0 todos los D deben ser de otra familia.
    const noMain = loadConfig((r) => (r.salvaje.prob_D_familia_principal = 0));
    for (let i = 0; i < 500; i++) {
      const c = createWildCreature(rng, noMain, { id: `z${i}`, family: "sombra" });
      for (const L of LOCUS_IDS) assert.notEqual(c.genome[L].D.family, "sombra");
    }
  });
});
