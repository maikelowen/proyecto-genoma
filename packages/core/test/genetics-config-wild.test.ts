import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import {
  allGenes,
  checkInvariants,
  ConfigError,
  createRng,
  createWildCreature,
  createWildPopulation,
  creatureFamily,
  geneKey,
  isCatalogKey,
  LOCUS_IDS,
} from "../src/index.ts";
import { CFG, catalogGene, drawsConsumed, hybridGene, loadConfig, makeCreature, tol5 } from "./genetics-helpers.ts";

describe("config (parseGeneticsConfig)", () => {
  it("carga la config real: 72 genes, 6 base, 7 híbridas, claves únicas", () => {
    assert.equal(CFG.catalog.length, 72);
    assert.equal(CFG.baseFamilies.length, 6);
    assert.equal(CFG.hybrids.length, 7);
    assert.equal(CFG.catalogByKey.size, 72);
    assert.equal(CFG.hybridByPair.get("llama|marea")?.id, "vapor");
    assert.ok(isCatalogKey("llama|cabeza|2332", CFG));
  });

  it("rechaza configs incoherentes", () => {
    const bad: Array<(r: any) => void> = [
      (r) => (r.salvaje.tiradas_por_criatura = 180),
      (r) => (r.herencia.tiradas_por_cria = 279),
      (r) => (r.normal.n_uniformes = 3),
      (r) => (r.mutacion.prob_por_locus = 1.5),
      (r) => (r.herencia.pesos_R = { D: 1, R1: 0, R2: 0 }),
      (r) => (r.herencia.pesos_D.R1 = -0.1),
      (r) => (r.orden_loci = ["cuerpo", "cabeza", "extremidades", "cola"]),
      (r) => (r.catalogo_base.genes[0].firma = "0000"),
      (r) => (r.catalogo_base.genes[0].ancla.potencia = 44),
      (r) => r.catalogo_base.genes.pop(),
      (r) => (r.familias.hibridas[0].componentes = ["llama", "vapor"]),
    ];
    for (const patch of bad) assert.throws(() => loadConfig(patch), ConfigError);
  });

  it("admite overrides de barrido válidos", () => {
    const c = loadConfig((r) => {
      r.mutacion.prob_por_locus = 0;
      r.herencia.pesos_D = { D: 0.47, R1: 0.025, R2: 0.005 };
    });
    assert.equal(c.mutation.probPerLocus, 0);
    assert.equal(c.inheritance.weightsD.D, 0.47);
  });
});

describe("salvajes (spec §2.2)", () => {
  it("misma semilla => misma criatura (JSON)", () => {
    const a = createWildCreature(createRng("w1"), CFG, { id: "x" });
    const b = createWildCreature(createRng("w1"), CFG, { id: "x" });
    assert.equal(JSON.stringify(a), JSON.stringify(b));
    const c = createWildCreature(createRng("w2"), CFG, { id: "x" });
    assert.notEqual(JSON.stringify(a), JSON.stringify(c));
  });

  it("consume exactamente 181 tiradas (normal, forzada y pura)", () => {
    assert.equal(drawsConsumed("t", (r) => createWildCreature(r, CFG, { id: "a" })), 181);
    assert.equal(drawsConsumed("t", (r) => createWildCreature(r, CFG, { id: "a", family: "roca" })), 181);
    assert.equal(drawsConsumed("t", (r) => createWildCreature(r, CFG, { id: "a", family: "roca", pure: true })), 181);
    assert.equal(drawsConsumed("t", (r) => createWildPopulation(r, CFG, 5)), 905);
  });

  it("puro => los 12 genes de la familia principal; sin mutados ni híbridas", () => {
    const c = createWildCreature(createRng("p"), CFG, { id: "a", family: "voltio", pure: true });
    assert.ok(allGenes(c).every((g) => g.family === "voltio" && g.origin === "base"));
    assert.equal(c.family, "voltio");
    assert.equal(c.generation, 0);
    assert.equal(c.parents, null);
  });

  it("frecuencias: D de la principal ≈ 70 %, R ≈ 40 % + 60 %/6 = 50 %; invariantes", () => {
    for (const c of createWildPopulation(createRng("pob"), CFG, 3000)) {
      assert.deepEqual(checkInvariants(c, CFG), []);
    }
    // Para medir frecuencias se fuerza la principal (mismo consumo y reglas).
    let dMain = 0;
    let rMain = 0;
    let dTotal = 0;
    const r2 = createRng("pob3");
    for (let i = 0; i < 3000; i++) {
      const c = createWildCreature(r2, CFG, { id: `f${i}`, family: "brote" });
      for (const L of LOCUS_IDS) {
        dTotal++;
        if (c.genome[L].D.family === "brote") dMain++;
        if (c.genome[L].R1.family === "brote") rMain++;
        if (c.genome[L].R2.family === "brote") rMain++;
        assert.ok(allGenes(c).every((g) => g.origin === "base" && CFG.baseFamilies.includes(g.family)));
      }
    }
    assert.ok(Math.abs(dMain / dTotal - 0.7) < tol5(0.7, dTotal), `D ${dMain / dTotal}`);
    assert.ok(Math.abs(rMain / (2 * dTotal) - 0.5) < tol5(0.5, 2 * dTotal), `R ${rMain / (2 * dTotal)}`);
  });

  it("rechaza familia forzada no base", () => {
    assert.throws(() => createWildCreature(createRng("z"), CFG, { id: "a", family: "vapor" }), RangeError);
  });
});

describe("familia de la criatura (spec §7)", () => {
  const D = (f: string, L: (typeof LOCUS_IDS)[number]) => {
    const g = CFG.baseFamilies.includes(f) ? catalogGene(`${f}.${L}.1`) : hybridGene(f, L, [0.5, 0.5, 0.5, 0.5]);
    return { D: g, R1: g, R2: g };
  };
  const fams = (list: string[]) =>
    creatureFamily(makeCreature("x", (L) => D(list[LOCUS_IDS.indexOf(L)] as string, L)).genome);

  it("gana la mayoría", () => {
    assert.equal(fams(["brote", "llama", "llama", "roca"]), "llama");
    assert.equal(fams(["vapor", "vapor", "vapor", "llama"]), "vapor");
  });

  it("empate: manda la cabeza (o el primer locus de las empatadas)", () => {
    assert.equal(fams(["marea", "llama", "llama", "marea"]), "marea");
    assert.equal(fams(["roca", "brote", "voltio", "sombra"]), "roca");
    // la cabeza no está empatada: gana la del primer locus entre las empatadas
    assert.equal(fams(["roca", "llama", "marea", "marea"]), "marea");
    assert.equal(fams(["roca", "llama", "marea", "llama"]), "llama");
  });

  it("la híbrida cuenta como su propia familia", () => {
    assert.equal(fams(["vapor", "llama", "marea", "vapor"]), "vapor");
  });
});

describe("higiene del núcleo", () => {
  it("genética y RNG sin Math.random, reloj ni funciones trascendentes en genética", () => {
    const srcDir = new URL("../src/", import.meta.url);
    for (const rel of readdirSync(srcDir, { recursive: true })) {
      if (!rel.endsWith(".ts")) continue;
      const code = readFileSync(new URL(rel, srcDir), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
      assert.ok(!/Math\.random|Date\.|Date\(|performance\.now/.test(code), `${rel}: azar/reloj`);
      if (rel.startsWith("genetics")) {
        assert.ok(!/Math\.(log|exp|sin|cos|tan|pow|sqrt)|\.normal\(/.test(code), `${rel}: no determinista entre motores`);
      }
    }
  });

  it("geneKey = familia|locus|firma", () => {
    assert.equal(geneKey(catalogGene("llama.cabeza.1")), "llama|cabeza|2332");
  });
});
