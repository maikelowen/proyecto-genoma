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
  STAT_IDS,
  type Creature,
  type GeneticsConfig,
} from "../src/index.ts";
import { CFG, drawsConsumed, hybridGene, keysOf, loadConfig, makeCreature, pureCreature, tol5 } from "./genetics-helpers.ts";

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

  it("no muta a los padres y devuelve copias con crías + 1", () => {
    const [a, b] = wildPair("par");
    const before = JSON.stringify([a, b]);
    const res = breed(b, a, createRng("s"), CFG, { id: "c", birth: 3 });
    assert.equal(JSON.stringify([a, b]), before);
    assert.equal(res.parent1.id, "b");
    assert.equal(res.parent1.offspringCount, 1);
    assert.equal(res.parent2.offspringCount, 1);
    assert.deepEqual(res.child.parents, ["a", "b"]);
    assert.equal(res.child.generation, 1);
    assert.equal(res.child.birth, 3);
    assert.equal(res.child.offspringCount, 0);
  });
});

describe("precondiciones (spec §3.2)", () => {
  const [a, b] = wildPair("pre");
  it("misma criatura, 5 crías o edad < 1 => error sin consumir tiradas", () => {
    const cases: Array<[Creature, Creature, number]> = [
      [a, a, 1],
      [a, { ...b, offspringCount: 5 }, 1],
      [a, b, 0],
      [a, { ...b, birth: 4 }, 4],
    ];
    for (const [p, q, birth] of cases) {
      assert.notEqual(breedingBlocker(p, q, CFG, birth), null);
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
  it("origen del D ≈ pesos_D; R1 ≠ D ≠ R2 de slot; tasa de mutación ≈ 2 %/locus", () => {
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
    const pc = 1 - (1 - pm) ** 4; // spec §4: 7,8 %
    assert.ok(Math.abs(childrenMutated / N - pc) < tol5(pc, N), `crías mutadas ${childrenMutated / N}`);
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

  it("híbrida × su componente: ≈ 75 % híbrida, resto el componente", () => {
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
    assert.ok(Math.abs(h / n - p) < tol5(p, n), `${h / n}`);
  });

  it("invariantes y Σancla = 90 tras 40 generaciones con mutación alta", () => {
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
        }
      }
      for (const c of next) {
        assert.deepEqual(checkInvariants(c, hot), []);
        for (const g of allGenes(c)) {
          const s = STAT_IDS.reduce((t, k) => t + g.anchor[k], 0);
          assert.ok(Math.abs(s - 90) <= 0.01 + 1e-9, `Σancla ${s}`);
          for (const k of STAT_IDS) assert.ok(Math.abs(g.values[k] - g.anchor[k]) <= 10 + 1e-9);
        }
      }
      pop = next;
    }
    assert.ok(mutatedGenes > 1000);
  });

  it("deriva sin mutación: valores se alejan del ancla pero nunca rompen ±10 ni [5,60]", () => {
    let pop = [pureCreature("a", "voltio"), pureCreature("b", "voltio")];
    const rng = createRng("deriva");
    let maxDev = 0;
    for (let gen = 1; gen <= 300; gen++) {
      const r = breed(pop[0] as Creature, pop[1] as Creature, rng, NEVER, { id: `x${gen}`, birth: gen });
      const r2 = breed(pop[0] as Creature, pop[1] as Creature, rng, NEVER, { id: `y${gen}`, birth: gen });
      pop = [r.child, r2.child];
      for (const c of pop) {
        assert.deepEqual(checkInvariants(c, NEVER), []);
        for (const g of allGenes(c)) for (const k of STAT_IDS) maxDev = Math.max(maxDev, Math.abs(g.values[k] - g.anchor[k]));
      }
    }
    assert.ok(maxDev > 3 && maxDev <= 10, `máx desviación ${maxDev}`);
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

  it("padres idénticos con mutación: el D mutado difiere del D de los padres", () => {
    const [a] = wildPair("id");
    const twin = { ...a, id: "twin" };
    for (const r of breedMany(a, twin, 300, ALWAYS, "gem-mut")) {
      for (const m of r.mutations) {
        assert.ok(!m.parentDKeys.includes(m.key));
        // familias iguales => la mutación conserva familia (spec §4.1)
        assert.equal(m.family, a.genome[m.locus].D.family);
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
        assert.notEqual(m.key, "vapor|" + m.locus + "|1232");
      }
    }
  });

  it("mutación: nunca igual a un D de los padres; id/movimiento según catálogo o provisional", () => {
    const pop = createWildPopulation(createRng("mpop"), CFG, 30);
    const rng = createRng("mut");
    let catalogHits = 0;
    let fresh = 0;
    for (let i = 0; i < 1500; i++) {
      const p = pop[i % 30] as Creature;
      const q = pop[(i * 11 + 3) % 30] as Creature;
      if (p.id === q.id) continue;
      const r = breed(p, q, rng, ALWAYS, { id: `m${i}`, birth: 1 });
      for (const m of r.mutations) {
        const g = r.child.genome[m.locus].D;
        assert.equal(g.origin, "mutacion");
        assert.equal(geneKey(g), m.key);
        assert.ok(!m.parentDKeys.includes(m.key), `${m.key} repite un D de los padres`);
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
    assert.equal(JSON.stringify(res.child), GOLDEN_CHILD);
    assert.equal(JSON.stringify(expressedStats(res.child)), GOLDEN_STATS);
  });
});

// Si estos cambian, ha cambiado el algoritmo o el orden de tiradas: rompe
// la reproducibilidad de partidas y simulaciones ya registradas.
const GOLDEN_CHILD = "{\"id\":\"cria\",\"genome\":{\"cabeza\":{\"D\":{\"id\":\"voltio.cabeza.2\",\"family\":\"voltio\",\"locus\":\"cabeza\",\"shape\":[0.5,0.75,0.75,0.75],\"signature\":\"2333\",\"move\":\"mov:voltio.cabeza.2\",\"anchor\":{\"potencia\":35,\"velocidad\":40,\"resistencia\":15},\"values\":{\"potencia\":35.88,\"velocidad\":40.25,\"resistencia\":13.2},\"origin\":\"base\"},\"R1\":{\"id\":\"voltio.cabeza.1\",\"family\":\"voltio\",\"locus\":\"cabeza\",\"shape\":[0.25,0.75,1,0.5],\"signature\":\"1342\",\"move\":\"mov:voltio.cabeza.1\",\"anchor\":{\"potencia\":31,\"velocidad\":42,\"resistencia\":17},\"values\":{\"potencia\":29.83,\"velocidad\":44.25,\"resistencia\":16.54},\"origin\":\"base\"},\"R2\":{\"id\":\"roca.cabeza.1\",\"family\":\"roca\",\"locus\":\"cabeza\",\"shape\":[0.75,0.25,0.75,0.25],\"signature\":\"3131\",\"move\":\"mov:roca.cabeza.1\",\"anchor\":{\"potencia\":35,\"velocidad\":18,\"resistencia\":37},\"values\":{\"potencia\":31.28,\"velocidad\":16.08,\"resistencia\":38.58},\"origin\":\"base\"}},\"cuerpo\":{\"D\":{\"id\":\"roca.cuerpo.1\",\"family\":\"roca\",\"locus\":\"cuerpo\",\"shape\":[1,0,0.75,0.25],\"signature\":\"4031\",\"move\":\"mov:roca.cuerpo.1\",\"anchor\":{\"potencia\":30,\"velocidad\":16,\"resistencia\":44},\"values\":{\"potencia\":28.88,\"velocidad\":11.99,\"resistencia\":44.43},\"origin\":\"base\"},\"R1\":{\"id\":\"voltio.cuerpo.2\",\"family\":\"voltio\",\"locus\":\"cuerpo\",\"shape\":[0.75,0.5,0.75,0.75],\"signature\":\"3233\",\"move\":\"mov:voltio.cuerpo.2\",\"anchor\":{\"potencia\":30,\"velocidad\":38,\"resistencia\":22},\"values\":{\"potencia\":29.68,\"velocidad\":35.9,\"resistencia\":22.79},\"origin\":\"base\"},\"R2\":{\"id\":\"roca.cuerpo.3\",\"family\":\"roca\",\"locus\":\"cuerpo\",\"shape\":[0.75,0,1,0],\"signature\":\"3040\",\"move\":\"mov:roca.cuerpo.3\",\"anchor\":{\"potencia\":28,\"velocidad\":20,\"resistencia\":42},\"values\":{\"potencia\":24.81,\"velocidad\":17.64,\"resistencia\":41.46},\"origin\":\"base\"}},\"extremidades\":{\"D\":{\"id\":\"roca.extremidades.1\",\"family\":\"roca\",\"locus\":\"extremidades\",\"shape\":[0.75,0.5,0.75,0],\"signature\":\"3230\",\"move\":\"mov:roca.extremidades.1\",\"anchor\":{\"potencia\":31,\"velocidad\":21,\"resistencia\":38},\"values\":{\"potencia\":30.61,\"velocidad\":14.99,\"resistencia\":36.87},\"origin\":\"base\"},\"R1\":{\"id\":\"roca.extremidades.2\",\"family\":\"roca\",\"locus\":\"extremidades\",\"shape\":[1,0.5,0.5,0.25],\"signature\":\"4221\",\"move\":\"mov:roca.extremidades.2\",\"anchor\":{\"potencia\":35,\"velocidad\":19,\"resistencia\":36},\"values\":{\"potencia\":36.43,\"velocidad\":17.88,\"resistencia\":32.43},\"origin\":\"base\"},\"R2\":{\"id\":\"brote.extremidades.1\",\"family\":\"brote\",\"locus\":\"extremidades\",\"shape\":[0.25,0.75,0.25,0.5],\"signature\":\"1312\",\"move\":\"mov:brote.extremidades.1\",\"anchor\":{\"potencia\":29,\"velocidad\":33,\"resistencia\":28},\"values\":{\"potencia\":29.69,\"velocidad\":35.47,\"resistencia\":25.26},\"origin\":\"base\"}},\"cola\":{\"D\":{\"id\":\"brote.cola.m1323\",\"family\":\"brote\",\"locus\":\"cola\",\"shape\":[0.25,0.75,0.5,0.75],\"signature\":\"1323\",\"move\":\"mov:prov:brote.cola.m1323\",\"anchor\":{\"potencia\":30.35,\"velocidad\":20.85,\"resistencia\":38.8},\"values\":{\"potencia\":26.85,\"velocidad\":22.79,\"resistencia\":38.36},\"origin\":\"mutacion\"},\"R1\":{\"id\":\"voltio.cola.1\",\"family\":\"voltio\",\"locus\":\"cola\",\"shape\":[0,1,1,0.5],\"signature\":\"0442\",\"move\":\"mov:voltio.cola.1\",\"anchor\":{\"potencia\":28,\"velocidad\":41,\"resistencia\":21},\"values\":{\"potencia\":26.33,\"velocidad\":40.04,\"resistencia\":18.54},\"origin\":\"base\"},\"R2\":{\"id\":\"brote.cola.2\",\"family\":\"brote\",\"locus\":\"cola\",\"shape\":[0.25,0.75,0,1],\"signature\":\"1304\",\"move\":\"mov:brote.cola.2\",\"anchor\":{\"potencia\":34,\"velocidad\":27,\"resistencia\":29},\"values\":{\"potencia\":31.33,\"velocidad\":26.68,\"resistencia\":32.66},\"origin\":\"base\"}}},\"family\":\"roca\",\"generation\":1,\"parents\":[\"padreA\",\"padreB\"],\"offspringCount\":0,\"birth\":1}";
const GOLDEN_STATS = "{\"potencia\":122.22,\"velocidad\":90.02000000000001,\"resistencia\":132.86}";
