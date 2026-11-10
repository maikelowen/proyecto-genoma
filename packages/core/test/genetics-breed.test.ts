import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  allGenes,
  breed,
  breedingBlocker,
  BreedingError,
  checkInvariants,
  createGenedex,
  createRng,
  createWildCreature,
  createWildPopulation,
  expressedStats,
  geneKey,
  LOCUS_IDS,
  recordMutations,
  type Creature,
  type Gene,
  type GeneticsConfig,
} from "../src/index.ts";
import { mutateGene, mutationAnchor, mutationShape } from "../src/genetics/mutation.ts";
import { distribute, valueBoundsOf } from "../src/genetics/math.ts";
import { CFG, catalogGene, drawsConsumed, hybridGene, keysOf, loadConfig, makeCreature, pureCreature, tol5 } from "./genetics-helpers.ts";

const ALWAYS = loadConfig((r) => (r.mutacion.prob_por_locus = 1));
const NEVER = loadConfig((r) => (r.mutacion.prob_por_locus = 0));

function wildPair(seed: string): [Creature, Creature] {
  const rng = createRng(seed);
  return [createWildCreature(rng, CFG, { id: "a" }), createWildCreature(rng, CFG, { id: "b" })];
}

/** Cría `n` veces la misma pareja (padres frescos: breed es pura). */
function breedMany(p1: Creature, p2: Creature, n: number, config: GeneticsConfig, seed: string) {
  const rng = createRng(seed);
  const out = [];
  for (let i = 0; i < n; i++) out.push(breed(p1, p2, rng, config, { id: `c${i}`, birth: 1 }));
  return out;
}

/** Las 6 claves de los padres en un locus, calculadas a partir de sus genomas. */
function parentKeySet(p: Creature, q: Creature, L: (typeof LOCUS_IDS)[number]): Set<string> {
  return new Set([...keysOf(p, L), ...keysOf(q, L)]);
}

describe("determinismo y consumo (spec §9)", () => {
  it("misma semilla => misma cría (JSON); breed(x,y) == breed(y,x)", () => {
    const [a, b] = wildPair("par");
    const c1 = breed(a, b, createRng("s"), CFG, { id: "c", birth: 1 }).child;
    const c2 = breed(a, b, createRng("s"), CFG, { id: "c", birth: 1 }).child;
    const c3 = breed(b, a, createRng("s"), CFG, { id: "c", birth: 1 }).child;
    assert.equal(JSON.stringify(c1), JSON.stringify(c2));
    assert.equal(JSON.stringify(c1), JSON.stringify(c3));
  });

  it("consume exactamente 280 tiradas, mute o no", () => {
    const [a, b] = wildPair("par");
    for (const cfg of [CFG, ALWAYS, NEVER]) {
      for (const seed of ["k1", "k2", "k3"]) {
        assert.equal(drawsConsumed(seed, (r) => breed(a, b, r, cfg, { id: "c", birth: 1 })), 280);
      }
    }
  });

  it("barrido pareado 2 % vs 3 %: crías sin mutación en ambas son idénticas", () => {
    const cfg3 = loadConfig((r) => (r.mutacion.prob_por_locus = 0.03));
    const pop = createWildPopulation(createRng("pob"), CFG, 40);
    const r2 = createRng("sweep");
    const r3 = createRng("sweep");
    let compared = 0;
    for (let i = 0; i < 500; i++) {
      const p = pop[i % 40] as Creature;
      const q = pop[(i * 7 + 1) % 40] as Creature;
      if (p.id === q.id) continue;
      const x = breed(p, q, r2, CFG, { id: `c${i}`, birth: 1 });
      const y = breed(p, q, r3, cfg3, { id: `c${i}`, birth: 1 });
      if (x.mutations.length === 0 && y.mutations.length === 0) {
        assert.equal(JSON.stringify(x.child), JSON.stringify(y.child));
        compared++;
      }
    }
    assert.ok(compared > 400);
  });

  it("no muta a los padres, devuelve copias con crías + 1 y genes congelados", () => {
    const [a, b] = wildPair("par");
    const before = JSON.stringify([a, b]);
    const res = breed(b, a, createRng("s"), ALWAYS, { id: "c", birth: 3 });
    assert.equal(JSON.stringify([a, b]), before);
    assert.equal(res.parent1.id, "b");
    assert.equal(res.parent1.offspringCount, 1);
    assert.equal(res.parent2.offspringCount, 1);
    assert.deepEqual(res.child.parents, ["a", "b"]);
    assert.equal(res.child.generation, 1);
    assert.equal(res.child.birth, 3);
    assert.equal(res.child.offspringCount, 0);
    for (const g of allGenes(res.child)) {
      assert.ok(Object.isFrozen(g) && Object.isFrozen(g.anchor) && Object.isFrozen(g.values) && Object.isFrozen(g.shape));
    }
  });
});

describe("precondiciones (spec §3.2, QA-02)", () => {
  const [a, b] = wildPair("pre");
  it("misma criatura, 5 crías, edad < 1 o entradas no enteras => error sin consumir tiradas", () => {
    const cases: Array<[Creature, Creature, number]> = [
      [a, a, 1],
      [a, { ...b, offspringCount: 5 }, 1],
      [a, b, 0],
      [a, { ...b, birth: 4 }, 4],
      [a, b, Number.NaN],
      [a, b, 1.5],
      [a, b, undefined as unknown as number],
      [a, { ...b, birth: Number.NaN }, 1],
      [a, { ...b, birth: undefined as unknown as number }, 1],
      [a, { ...b, offspringCount: Number.NaN }, 1],
      [a, { ...b, offspringCount: -1 }, 1],
      [a, { ...b, offspringCount: 0.5 }, 1],
    ];
    for (const [p, q, birth] of cases) {
      assert.notEqual(breedingBlocker(p, q, CFG, birth), null, `${birth} ${q.birth} ${q.offspringCount}`);
      const rng = createRng("e");
      assert.throws(() => breed(p, q, rng, CFG, { id: "c", birth }), BreedingError);
      assert.deepEqual(rng.getState(), createRng("e").getState());
    }
    assert.equal(breedingBlocker(a, { ...b, offspringCount: 4 }, CFG, 1), null);
  });

  it("generación = max(padres) + 1", () => {
    const res = breed({ ...a, generation: 7 }, { ...b, generation: 3 }, createRng("g"), CFG, { id: "c", birth: 1 });
    assert.equal(res.child.generation, 8);
  });
});

describe("estadística de herencia (spec §3)", () => {
  it("origen del D ≈ pesos_D (C); R1 ≠ D ≠ R2 de slot; tasa de mutación ≈ 2 %/locus", () => {
    const [a, b] = wildPair("stats");
    const N = 15_000;
    const results = breedMany(a, b, N, CFG, "herencia");
    const wd = CFG.inheritance.weightsD;
    const w = [wd.D, wd.R1, wd.R2, wd.D, wd.R1, wd.R2];
    const total = w.reduce((s, x) => s + x, 0);
    const dCounts = [0, 0, 0, 0, 0, 0];
    let loci = 0;
    let mutated = 0;
    let childrenMutated = 0;
    for (const r of results) {
      if (r.mutations.length > 0) childrenMutated++;
      for (const t of r.trace) {
        loci++;
        dCounts[t.dSlot] = (dCounts[t.dSlot] ?? 0) + 1;
        if (t.mutated) mutated++;
        else assert.ok(t.r1Slot !== t.dSlot && t.r2Slot !== t.dSlot);
        assert.notEqual(t.r1Slot, t.r2Slot);
      }
    }
    w.forEach((wi, i) => {
      const p = wi / total;
      const obs = (dCounts[i] ?? 0) / loci;
      assert.ok(Math.abs(obs - p) < tol5(p, loci), `slot ${i}: ${obs} vs ${p}`);
    });
    const pm = CFG.mutation.probPerLocus;
    assert.ok(Math.abs(mutated / loci - pm) < tol5(pm, loci), `mut/locus ${mutated / loci}`);
    const pc = 1 - (1 - pm) * (1 - pm) * (1 - pm) * (1 - pm); // spec §4: 7,8 %
    assert.ok(Math.abs(childrenMutated / N - pc) < tol5(pc, N), `crías mutadas ${childrenMutated / N}`);
  });

  it("calidad: se hereda intacta; la mutada = r2(media de los D de los padres)", () => {
    const pop = createWildPopulation(createRng("qpop"), CFG, 20);
    const rng = createRng("qual");
    const hot = loadConfig((r) => (r.mutacion.prob_por_locus = 0.3));
    let checked = 0;
    for (let i = 0; i < 400; i++) {
      const p = pop[i % 20] as Creature;
      const q = pop[(i * 3 + 1) % 20] as Creature;
      if (p.id === q.id) continue;
      const r = breed(p, q, rng, hot, { id: `q${i}`, birth: 1 });
      const [A, B] = p.id < q.id ? [p, q] : [q, p];
      for (const t of r.trace) {
        const la = A.genome[t.locus];
        const lb = B.genome[t.locus];
        const S: Gene[] = [la.D, la.R1, la.R2, lb.D, lb.R1, lb.R2];
        const l = r.child.genome[t.locus];
        const expD = t.mutated ? Math.round(((la.D.quality + lb.D.quality) / 2) * 100) / 100 : (S[t.dSlot] as Gene).quality;
        assert.equal(l.D.quality, expD);
        assert.equal(l.R1.quality, (S[t.r1Slot] as Gene).quality);
        assert.equal(l.R2.quality, (S[t.r2Slot] as Gene).quality);
        if (!t.mutated) assert.deepEqual(l.D.anchor, (S[t.dSlot] as Gene).anchor);
        checked++;
      }
    }
    assert.ok(checked > 1500);
  });

  it("puro llama × puro marea con mutación: ≈ 50 % Vapor (prob_hibrida_nueva)", () => {
    const res = breedMany(pureCreature("a", "llama"), pureCreature("b", "marea"), 2500, ALWAYS, "vapor");
    let vapor = 0;
    let n = 0;
    for (const r of res) {
      for (const m of r.mutations) {
        n++;
        if (m.family === "vapor") vapor++;
        else assert.ok(m.family === "llama" || m.family === "marea");
      }
    }
    const p = CFG.mutation.probNewHybrid;
    assert.equal(n, 10_000);
    assert.ok(Math.abs(vapor / n - p) < tol5(p, n), `${vapor / n}`);
  });

  it("híbrida × su componente: ≈ 50 % híbrida [v0.2], resto el componente", () => {
    const hyb = makeCreature("a", (L) => {
      const g = hybridGene("vapor", L, [0.5, 0.5, 0.5, 0.5]);
      return { D: g, R1: g, R2: g };
    });
    const res = breedMany(hyb, pureCreature("b", "marea"), 2500, ALWAYS, "retro");
    let h = 0;
    let n = 0;
    for (const r of res) {
      for (const m of r.mutations) {
        n++;
        if (m.family === "vapor") h++;
        else assert.equal(m.family, "marea");
      }
    }
    const p = CFG.mutation.probHybridAffinity;
    assert.equal(p, 0.5);
    assert.ok(Math.abs(h / n - p) < tol5(p, n), `${h / n}`);
  });

  it("invariantes v0.2 tras 40 generaciones con mutación alta: calidad ∈ [85,5; 94,5], Σancla = Σvalores = calidad", () => {
    const hot = loadConfig((r) => (r.mutacion.prob_por_locus = 0.25));
    const rng = createRng("evol");
    let pop = createWildPopulation(rng, hot, 120);
    let mutatedGenes = 0;
    for (let gen = 1; gen <= 40; gen++) {
      const sh = rng.shuffle(pop);
      const next: Creature[] = [];
      for (let i = 0; i + 1 < sh.length; i += 2) {
        const p = sh[i] as Creature;
        const q = sh[i + 1] as Creature;
        for (let k = 0; k < 2; k++) {
          const r = breed(p, q, rng, hot, { id: `g${gen}-${i}-${k}`, birth: gen });
          next.push(r.child);
          mutatedGenes += r.mutations.length;
          for (const m of r.mutations) assert.ok(!parentKeySet(p, q, m.locus).has(m.key), `${m.key} repite gen de padre`);
        }
      }
      for (const c of next) {
        assert.deepEqual(checkInvariants(c, hot), []);
        for (const g of allGenes(c)) {
          assert.ok(g.quality >= 85.5 && g.quality <= 94.5, `calidad ${g.quality}`);
          const sa = g.anchor.potencia + g.anchor.velocidad + g.anchor.resistencia;
          const sv = g.values.potencia + g.values.velocidad + g.values.resistencia;
          assert.ok(Math.abs(sa - g.quality) < 1e-9 && Math.abs(sv - g.quality) < 1e-9, `${sa} ${sv} ${g.quality}`);
        }
      }
      pop = next;
    }
    assert.ok(mutatedGenes > 1000);
  });

  it("deriva sin mutación: valores se alejan del ancla, nunca rompen ±10 ni [5,60] y la calidad no cambia", () => {
    let pop = [pureCreature("a", "voltio"), pureCreature("b", "voltio")];
    const rng = createRng("deriva");
    let maxDev = 0;
    for (let gen = 1; gen <= 300; gen++) {
      const r = breed(pop[0] as Creature, pop[1] as Creature, rng, NEVER, { id: `x${gen}`, birth: gen });
      const r2 = breed(pop[0] as Creature, pop[1] as Creature, rng, NEVER, { id: `y${gen}`, birth: gen });
      pop = [r.child, r2.child];
      for (const c of pop) {
        assert.deepEqual(checkInvariants(c, NEVER), []);
        for (const g of allGenes(c)) {
          assert.equal(g.quality, 90);
          maxDev = Math.max(maxDev, Math.abs(g.values.potencia - g.anchor.potencia), Math.abs(g.values.velocidad - g.anchor.velocidad));
        }
      }
    }
    assert.ok(maxDev > 2 && maxDev <= 10, `máx desviación ${maxDev}`);
  });
});

describe("mutación: bloqueo de las 6 claves (spec §4.5, D-007)", () => {
  it("la clave mutada nunca es ninguna de las 6 de los padres; id/movimiento correctos", () => {
    const pop = createWildPopulation(createRng("mpop"), CFG, 30);
    const rng = createRng("mut");
    let catalogHits = 0;
    let fresh = 0;
    const levels = [0, 0, 0, 0];
    for (let i = 0; i < 3000; i++) {
      const p = pop[i % 30] as Creature;
      const q = pop[(i * 11 + 3) % 30] as Creature;
      if (p.id === q.id) continue;
      const r = breed(p, q, rng, ALWAYS, { id: `m${i}`, birth: 1 });
      for (const m of r.mutations) {
        const g = r.child.genome[m.locus].D;
        assert.equal(g.origin, "mutacion");
        assert.equal(geneKey(g), m.key);
        assert.ok(!parentKeySet(p, q, m.locus).has(m.key), `${m.key} repite un gen de los padres`);
        assert.deepEqual(new Set(m.parentKeys), parentKeySet(p, q, m.locus));
        levels[m.fallbackLevel] = (levels[m.fallbackLevel] as number) + 1;
        if (m.matchesCatalog) {
          catalogHits++;
          assert.equal(g.id, CFG.catalogByKey.get(m.key)?.id);
          assert.equal(g.move, `mov:${g.id}`);
        } else {
          fresh++;
          assert.equal(g.id, `${g.family}.${g.locus}.m${g.signature}`);
          assert.equal(g.move, `mov:prov:${g.id}`);
        }
      }
    }
    assert.ok(catalogHits > 0 && fresh > 0, `${catalogHits} / ${fresh}`);
    assert.ok((levels[0] as number) > 0 && (levels[1] as number) > 0, `niveles ${levels}`);
  });

  it("padres homocigotos idénticos: la mutación cambia la firma y conserva la familia", () => {
    const a = pureCreature("a", "roca");
    const twin = { ...a, id: "twin" };
    for (const r of breedMany(a, twin, 300, ALWAYS, "gem-mut")) {
      for (const m of r.mutations) {
        assert.ok(!keysOf(a, m.locus).includes(m.key));
        assert.equal(m.family, "roca");
      }
    }
  });

  it("respaldo N1 → N2 → N3 determinista (prueba directa de mutationShape)", () => {
    const g = hybridGene("vapor", "cabeza", [0.5, 0.5, 0.5, 0.5]); // firma 2222
    const key = (sig: string) => `vapor|cabeza|${sig}`;
    const zero = [0, 0, 0, 0];
    assert.deepEqual(mutationShape(g, g, "vapor", new Set(), zero, CFG), { shape: [0.5, 0.5, 0.5, 0.5], level: 0 });
    // N0 bloqueado ⇒ N1: |nFo| todos 0 ⇒ orden por índice, dirección + ⇒ 3222
    const n1 = mutationShape(g, g, "vapor", new Set([key("2222")]), zero, CFG);
    assert.deepEqual(n1, { shape: [0.75, 0.5, 0.5, 0.5], level: 1 });
    // orden por |nFo| desc: el índice 2 (|−0,4|) primero, dirección −  (f0 sigue siendo 2222)
    const nFo = [0.1, 0.2, -0.4, 0.3];
    assert.deepEqual(mutationShape(g, g, "vapor", new Set([key("2222")]), nFo, CFG).shape, [0.5, 0.5, 0.25, 0.5]);
    // N1 bloqueado entero ⇒ N2 (sentido contrario, mismo orden)
    const n1all = [key("2222"), key("2212"), key("2223"), key("2322"), key("3222")];
    assert.deepEqual(mutationShape(g, g, "vapor", new Set(n1all), nFo, CFG), { shape: [0.5, 0.5, 0.75, 0.5], level: 2 });
    // N1 y N2 bloqueados ⇒ N3: distancia 2 y firma ascendente ⇒ 0222
    const ring = ["2222", "3222", "1222", "2322", "2122", "2232", "2212", "2223", "2221"].map(key);
    assert.deepEqual(mutationShape(g, g, "vapor", new Set(ring), zero, CFG), { shape: [0, 0.5, 0.5, 0.5], level: 3 });
    // las claves de otra familia no bloquean
    assert.equal(mutationShape(g, g, "llama", new Set(ring), zero, CFG).level, 0);
  });

  it("bordes de la rejilla: el vecino que sale de [0,1] se salta", () => {
    const g = hybridGene("vapor", "cola", [1, 1, 1, 1]); // 4444
    const r = mutationShape(g, g, "vapor", new Set(["vapor|cola|4444"]), [1, 1, 1, 1], CFG);
    assert.deepEqual(r, { shape: [0.75, 1, 1, 1], level: 2 }); // N1 (+) imposible ⇒ N2 (−)
  });
});

describe("mutación: valores (spec §4.4, QA-09)", () => {
  it("valores mutados = repartir(m + media de las desviaciones de los padres, límites(m), Q)", () => {
    const pop = createWildPopulation(createRng("v44"), CFG, 10);
    const rng = createRng("v44b");
    for (let i = 0; i < 500; i++) {
      const p = pop[i % 10] as Creature;
      const q = pop[(i + 3) % 10] as Creature;
      const L = LOCUS_IDS[i % 4] as (typeof LOCUS_IDS)[number];
      const gA = p.genome[L].D;
      const gB = q.genome[L].D;
      const nAn = [rng.float(-3, 3), rng.float(-3, 3), rng.float(-3, 3)];
      const nFo = [rng.float(-3, 3), rng.float(-3, 3), rng.float(-3, 3), rng.float(-3, 3)];
      const S = [gA, p.genome[L].R1, p.genome[L].R2, gB, q.genome[L].R1, q.genome[L].R2];
      const out = mutateGene(gA, gB, S, rng.next(), rng.next(), nAn, nFo, CFG).gene;
      const m = mutationAnchor(gA, gB, nAn, CFG);
      const k3 = ["potencia", "velocidad", "resistencia"] as const;
      const target = m.map((mk, k) => mk + (gA.values[k3[k]!] - gA.anchor[k3[k]!] + (gB.values[k3[k]!] - gB.anchor[k3[k]!])) / 2);
      const [lo, hi] = valueBoundsOf(m, CFG);
      const Q = Math.round(((gA.quality + gB.quality) / 2) * 100) / 100;
      assert.deepEqual([out.anchor.potencia, out.anchor.velocidad, out.anchor.resistencia], m);
      assert.deepEqual([out.values.potencia, out.values.velocidad, out.values.resistencia], distribute(target, lo, hi, Q, CFG));
      assert.equal(out.quality, Q);
    }
  });
});

describe("casos borde", () => {
  it("padres idénticos (sin mutación): la cría solo tiene genes de los padres", () => {
    const [a] = wildPair("id");
    const twin = { ...a, id: "twin" };
    for (const r of breedMany(a, twin, 200, NEVER, "gemelos")) {
      for (const L of LOCUS_IDS) {
        const parentKeys = new Set(keysOf(a, L));
        for (const k of keysOf(r.child, L)) assert.ok(parentKeys.has(k));
      }
    }
  });

  it("familias sin híbrida (llama × brote): nunca sale híbrida", () => {
    for (const r of breedMany(pureCreature("a", "llama"), pureCreature("b", "brote"), 500, ALWAYS, "nohib")) {
      for (const m of r.mutations) assert.ok(m.family === "llama" || m.family === "brote", m.family);
    }
  });

  it("híbrida × híbrida: distintas => una de las dos; iguales => la misma", () => {
    const hyb = (id: string, f: string) =>
      makeCreature(id, (L) => {
        const g = hybridGene(f, L, [0.25, 0.5, 0.75, 0.5]);
        return { D: g, R1: g, R2: g };
      });
    const seen = new Set<string>();
    for (const r of breedMany(hyb("a", "vapor"), hyb("b", "magma"), 300, ALWAYS, "hh")) {
      for (const m of r.mutations) seen.add(m.family);
    }
    assert.deepEqual([...seen].sort(), ["magma", "vapor"]);
    for (const r of breedMany(hyb("a", "vapor"), hyb("b", "vapor"), 100, ALWAYS, "hh2")) {
      for (const m of r.mutations) {
        assert.equal(m.family, "vapor");
        assert.notEqual(m.key, `vapor|${m.locus}|1232`);
      }
    }
  });

  it("familia de la cría en F1 llama × marea: un solo D Vapor basta si no hay 3 de otra (spec §7)", () => {
    let oneVaporFamily = 0;
    for (const r of breedMany(pureCreature("a", "llama"), pureCreature("b", "marea"), 400, ALWAYS, "f1")) {
      const ds = LOCUS_IDS.map((L) => r.child.genome[L].D.family);
      const vap = ds.filter((f) => f === "vapor").length;
      if (vap === 1 && r.child.family === "vapor") oneVaporFamily++;
      if (vap > 0) {
        const maxOther = Math.max(...["llama", "marea"].map((f) => ds.filter((o) => o === f).length));
        assert.equal(r.child.family === "vapor", 2 * vap >= maxOther, ds.join(","));
      }
    }
    assert.ok(oneVaporFamily > 0);
  });

  it("mutación que cae en el catálogo conserva calidad mutada y origen (spec §1.2)", () => {
    const pop = createWildPopulation(createRng("cat"), CFG, 30);
    const rng = createRng("cat2");
    let seen = 0;
    for (let i = 0; i < 3000 && seen < 20; i++) {
      const p = pop[i % 30] as Creature;
      const q = pop[(i * 7 + 2) % 30] as Creature;
      if (p.id === q.id) continue;
      const r = breed(p, q, rng, ALWAYS, { id: `k${i}`, birth: 1 });
      for (const m of r.mutations.filter((x) => x.matchesCatalog)) {
        const g = r.child.genome[m.locus].D;
        assert.equal(g.origin, "mutacion");
        assert.equal(g.quality, Math.round(((p.genome[m.locus].D.quality + q.genome[m.locus].D.quality) / 2) * 100) / 100);
        seen++;
      }
    }
    assert.ok(seen > 0);
    assert.equal(catalogGene("llama.cabeza.1").quality, 90);
  });
});

describe("Genedex (spec §8)", () => {
  it("registra la primera aparición, cuenta redescubrimientos e ignora el catálogo", () => {
    const dex = createGenedex();
    const [a, b] = wildPair("dex");
    let added = 0;
    let again = 0;
    let cat = 0;
    let n = 0;
    for (const r of breedMany(a, b, 400, ALWAYS, "dex")) {
      const o = recordMutations(dex, r, { firstSeen: n++ });
      added += o.added.length;
      again += o.rediscovered.length;
      cat += o.catalog.length;
      for (const e of o.added) {
        assert.equal(e.creatureId, r.child.id);
        assert.deepEqual(e.parents, ["a", "b"]);
        assert.equal(e.ownerId, null);
      }
    }
    assert.equal(added, dex.size);
    assert.equal(added + again + cat, 1600);
    assert.ok(again > 0);
    for (const k of dex.keys()) assert.ok(!CFG.catalogByKey.has(k));
  });
});

describe("vector dorado", () => {
  it("cría concreta con semilla fija (incluye una mutación)", () => {
    const rng = createRng("dorado");
    const a = createWildCreature(rng, CFG, { id: "padreA" });
    const b = createWildCreature(rng, CFG, { id: "padreB" });
    const cfg = loadConfig((r) => (r.mutacion.prob_por_locus = 0.3));
    const res = breed(a, b, rng, cfg, { id: "cria", birth: 1 });
    assert.ok(res.mutations.length > 0);
    assert.equal(JSON.stringify(res.child), GOLDEN_CHILD);
    assert.equal(JSON.stringify(expressedStats(res.child)), GOLDEN_STATS);
  });
});

// Vectores dorados v0.2 (spec §14). Si cambian, ha cambiado el algoritmo o
// el orden de tiradas: rompe partidas y simulaciones ya registradas.
const GOLDEN_CHILD = "{\"id\":\"cria\",\"genome\":{\"cabeza\":{\"D\":{\"id\":\"liquen.cabeza.m2132\",\"family\":\"liquen\",\"locus\":\"cabeza\",\"shape\":[0.5,0.25,0.75,0.5],\"signature\":\"2132\",\"move\":\"mov:prov:liquen.cabeza.m2132\",\"quality\":88.87,\"anchor\":{\"potencia\":34.64,\"velocidad\":27.69,\"resistencia\":26.54},\"values\":{\"potencia\":34.01,\"velocidad\":28.19,\"resistencia\":26.67},\"origin\":\"mutacion\"},\"R1\":{\"id\":\"roca.cabeza.2\",\"family\":\"roca\",\"locus\":\"cabeza\",\"shape\":[1,0.25,0.5,0.5],\"signature\":\"4122\",\"move\":\"mov:roca.cabeza.2\",\"quality\":87.22,\"anchor\":{\"potencia\":37.79,\"velocidad\":15.51,\"resistencia\":33.92},\"values\":{\"potencia\":36.53,\"velocidad\":14.74,\"resistencia\":35.95},\"origin\":\"base\"},\"R2\":{\"id\":\"roca.cabeza.2\",\"family\":\"roca\",\"locus\":\"cabeza\",\"shape\":[1,0.25,0.5,0.5],\"signature\":\"4122\",\"move\":\"mov:roca.cabeza.2\",\"quality\":91.68,\"anchor\":{\"potencia\":39.73,\"velocidad\":16.3,\"resistencia\":35.65},\"values\":{\"potencia\":41.43,\"velocidad\":16.54,\"resistencia\":33.71},\"origin\":\"base\"}},\"cuerpo\":{\"D\":{\"id\":\"sombra.cuerpo.1\",\"family\":\"sombra\",\"locus\":\"cuerpo\",\"shape\":[0.75,0.5,0.5,0.75],\"signature\":\"3223\",\"move\":\"mov:sombra.cuerpo.1\",\"quality\":91.19,\"anchor\":{\"potencia\":33.43,\"velocidad\":33.44,\"resistencia\":24.32},\"values\":{\"potencia\":30.9,\"velocidad\":34.98,\"resistencia\":25.31},\"origin\":\"base\"},\"R1\":{\"id\":\"roca.cuerpo.2\",\"family\":\"roca\",\"locus\":\"cuerpo\",\"shape\":[1,0,0.5,0.5],\"signature\":\"4022\",\"move\":\"mov:roca.cuerpo.2\",\"quality\":88.26,\"anchor\":{\"potencia\":33.34,\"velocidad\":13.73,\"resistencia\":41.19},\"values\":{\"potencia\":32.63,\"velocidad\":13.58,\"resistencia\":42.05},\"origin\":\"base\"},\"R2\":{\"id\":\"roca.cuerpo.2\",\"family\":\"roca\",\"locus\":\"cuerpo\",\"shape\":[1,0,0.5,0.5],\"signature\":\"4022\",\"move\":\"mov:roca.cuerpo.2\",\"quality\":89.68,\"anchor\":{\"potencia\":33.88,\"velocidad\":13.95,\"resistencia\":41.85},\"values\":{\"potencia\":35.48,\"velocidad\":14.53,\"resistencia\":39.67},\"origin\":\"base\"}},\"extremidades\":{\"D\":{\"id\":\"brote.extremidades.m4222\",\"family\":\"brote\",\"locus\":\"extremidades\",\"shape\":[1,0.5,0.5,0.5],\"signature\":\"4222\",\"move\":\"mov:prov:brote.extremidades.m4222\",\"quality\":90.35,\"anchor\":{\"potencia\":37.7,\"velocidad\":21.6,\"resistencia\":31.05},\"values\":{\"potencia\":39.52,\"velocidad\":22.09,\"resistencia\":28.74},\"origin\":\"mutacion\"},\"R1\":{\"id\":\"brote.extremidades.2\",\"family\":\"brote\",\"locus\":\"extremidades\",\"shape\":[0.5,0.75,0,0.75],\"signature\":\"2303\",\"move\":\"mov:brote.extremidades.2\",\"quality\":91.49,\"anchor\":{\"potencia\":33.55,\"velocidad\":31.51,\"resistencia\":26.43},\"values\":{\"potencia\":34.2,\"velocidad\":32.29,\"resistencia\":25},\"origin\":\"base\"},\"R2\":{\"id\":\"brote.extremidades.3\",\"family\":\"brote\",\"locus\":\"extremidades\",\"shape\":[0,0.75,0.5,0.25],\"signature\":\"0321\",\"move\":\"mov:brote.extremidades.3\",\"quality\":89.61,\"anchor\":{\"potencia\":26.88,\"velocidad\":36.84,\"resistencia\":25.89},\"values\":{\"potencia\":28.75,\"velocidad\":36.02,\"resistencia\":24.84},\"origin\":\"base\"}},\"cola\":{\"D\":{\"id\":\"brote.cola.m2132\",\"family\":\"brote\",\"locus\":\"cola\",\"shape\":[0.5,0.25,0.75,0.5],\"signature\":\"2132\",\"move\":\"mov:prov:brote.cola.m2132\",\"quality\":92.81,\"anchor\":{\"potencia\":30.71,\"velocidad\":24.37,\"resistencia\":37.73},\"values\":{\"potencia\":28.74,\"velocidad\":26.36,\"resistencia\":37.71},\"origin\":\"mutacion\"},\"R1\":{\"id\":\"llama.cola.2\",\"family\":\"llama\",\"locus\":\"cola\",\"shape\":[0.5,1,0.5,0.75],\"signature\":\"2423\",\"move\":\"mov:llama.cola.2\",\"quality\":86.76,\"anchor\":{\"potencia\":42.42,\"velocidad\":24.1,\"resistencia\":20.24},\"values\":{\"potencia\":43.79,\"velocidad\":21.85,\"resistencia\":21.12},\"origin\":\"base\"},\"R2\":{\"id\":\"sombra.cola.1\",\"family\":\"sombra\",\"locus\":\"cola\",\"shape\":[0.25,1,0.5,0.75],\"signature\":\"1423\",\"move\":\"mov:sombra.cola.1\",\"quality\":90.09,\"anchor\":{\"potencia\":35.04,\"velocidad\":34.03,\"resistencia\":21.02},\"values\":{\"potencia\":34.36,\"velocidad\":33.27,\"resistencia\":22.46},\"origin\":\"base\"}}},\"family\":\"liquen\",\"generation\":1,\"parents\":[\"padreA\",\"padreB\"],\"offspringCount\":0,\"birth\":1}";
const GOLDEN_STATS = "{\"potencia\":133.17000000000002,\"velocidad\":111.62,\"resistencia\":118.43}";
