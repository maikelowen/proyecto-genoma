import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import rawV01 from "../../../config/genetica.v0.1.json" with { type: "json" };
import {
  allGenes,
  checkInvariants,
  ConfigError,
  createRng,
  createWildCreature,
  createWildPopulation,
  creatureFamily,
  creatureQuality,
  distribute,
  geneKey,
  isCatalogKey,
  LOCUS_IDS,
  parseGeneticsConfig,
  qualityPercent,
  STAT_IDS,
  wildQuality,
  type Gene,
} from "../src/index.ts";
import { CFG, catalogGene, drawsConsumed, hybridGene, loadConfig, makeCreature, tol5 } from "./genetics-helpers.ts";

const sum3 = (s: { potencia: number; velocidad: number; resistencia: number }): number => s.potencia + s.velocidad + s.resistencia;

describe("config v0.2 (parseGeneticsConfig, spec §9.3)", () => {
  it("carga la config real: 72 genes, 6 base, 7 híbridas, claves únicas, F = 100", () => {
    assert.equal(CFG.version, "0.2");
    assert.equal(CFG.catalog.length, 72);
    assert.equal(CFG.baseFamilies.length, 6);
    assert.equal(CFG.hybrids.length, 7);
    assert.equal(CFG.catalogByKey.size, 72);
    assert.equal(CFG.hybridByPair.get("llama|marea")?.id, "vapor");
    assert.ok(isCatalogKey("llama|cabeza|2332", CFG));
    assert.equal(CFG.roundFactor, 100);
    assert.deepEqual([CFG.quality.min, CFG.quality.max], [85.5, 94.5]);
    assert.equal(CFG.invariantTolerance, 0.01);
    assert.deepEqual(CFG.familyWeights, { base: 1, hybrid: 2 });
  });

  it("rechaza la config v0.1 (sin soporte retroactivo)", () => {
    assert.throws(() => parseGeneticsConfig(structuredClone(rawV01)), ConfigError);
  });

  it("rechaza configs incoherentes (incluye QA-04, QA-06, QA-07 y calidad)", () => {
    const bad: Array<[string, (r: any) => void]> = [
      ["tiradas salvaje v0.1", (r) => (r.salvaje.tiradas_por_criatura = 181)],
      ["tiradas cría", (r) => (r.herencia.tiradas_por_cria = 279)],
      ["n_uniformes", (r) => (r.normal.n_uniformes = 3)],
      ["QA-04 centro", (r) => (r.normal.centro = 0)],
      ["QA-04 factor", (r) => (r.normal.factor = 1.7)],
      ["prob > 1", (r) => (r.mutacion.prob_por_locus = 1.5)],
      ["pesos_R", (r) => (r.herencia.pesos_R = { D: 1, R1: 0, R2: 0 })],
      ["peso negativo", (r) => (r.herencia.pesos_D.R1 = -0.1)],
      ["orden loci", (r) => (r.orden_loci = ["cuerpo", "cabeza", "extremidades", "cola"])],
      ["firma", (r) => (r.catalogo_base.genes[0].firma = "0000")],
      ["ancla ≠ calidad.base", (r) => (r.catalogo_base.genes[0].ancla.potencia = 44)],
      ["catálogo incompleto", (r) => r.catalogo_base.genes.pop()],
      ["híbrida de segundo orden", (r) => (r.familias.hibridas[0].componentes = ["llama", "vapor"])],
      ["QA-06 max_crias 0", (r) => (r.limites_sim.max_crias_por_criatura = 0)],
      ["QA-07 id con |", (r) => (r.familias.hibridas[0].id = "va|por")],
      ["QA-07 id con .", (r) => (r.familias.base[0] = "lla.ma")],
      ["calidad.min", (r) => (r.calidad.min = 85)],
      ["calidad.max", (r) => (r.calidad.max = 95)],
      ["calidad inalcanzable", (r) => (r.valores.ancla_max = 30)],
      ["distribución", (r) => (r.calidad.distribucion_salvaje = "normal")],
      ["calidad.mutacion", (r) => (r.calidad.mutacion = "con_ruido")],
      ["paso_respaldo_max", (r) => (r.mutacion.paso_respaldo_max = 3)],
      ["peso familia 0", (r) => (r.familia_criatura.peso_gen_hibrido = 0)],
      ["sin tolerancia", (r) => delete r.criterios_sim.invariantes.tolerancia_suma],
      ["versión", (r) => (r.version = "0.1")],
    ];
    for (const [name, patch] of bad) assert.throws(() => loadConfig(patch), ConfigError, name);
  });

  it("admite overrides de barrido válidos (§11)", () => {
    const c = loadConfig((r) => {
      r.mutacion.prob_por_locus = 0;
      r.mutacion.prob_hibrida_afinidad = 0.75;
      r.familia_criatura.peso_gen_hibrido = 3;
      r.calidad.distribucion_salvaje = "uniforme";
      r.deriva.kappa = 0.15;
    });
    assert.equal(c.mutation.probPerLocus, 0);
    assert.equal(c.familyWeights.hybrid, 3);
    assert.equal(c.quality.wildDistribution, "uniforme");
  });
});

describe("repartir (spec §1.5)", () => {
  it("suma exacta, dentro de límites y con 2 decimales (fuzz)", () => {
    const rng = createRng("repartir");
    for (let i = 0; i < 20_000; i++) {
      const S = Math.round((85.5 + rng.next() * 9) * 100) / 100;
      const x = [0, 1, 2].map(() => rng.float(-20, 90));
      const out = distribute(x, [12, 12, 12], [50, 50, 50], S, CFG);
      assert.ok(Math.abs(out[0]! + out[1]! + out[2]! - S) < 1e-9, `${out} → ${S}`);
      for (const v of out) assert.ok(v >= 12 && v <= 50 && Math.round(v * 100) / 100 === v, `${out}`);
    }
  });

  it("casos límite: todo en los bordes y ajuste de redondeo de ±0,01", () => {
    assert.deepEqual(distribute([50, 50, 50], [12, 12, 12], [50, 50, 50], 94.5, CFG).reduce((a, b) => a + b), 94.5);
    const r = distribute([31.666, 31.666, 31.666], [12, 12, 12], [50, 50, 50], 94.99, CFG);
    assert.ok(Math.abs(r[0]! + r[1]! + r[2]! - 94.99) < 1e-9, `${r}`);
    const tight = distribute([0, 0, 0], [5, 30, 40], [6, 31, 41], 76, CFG);
    assert.ok(Math.abs(tight[0]! + tight[1]! + tight[2]! - 76) < 1e-9 && tight[0]! <= 6, `${tight}`);
  });
});

describe("salvajes (spec §2.2 v0.2)", () => {
  it("misma semilla => misma criatura (JSON)", () => {
    const a = createWildCreature(createRng("w1"), CFG, { id: "x" });
    const b = createWildCreature(createRng("w1"), CFG, { id: "x" });
    assert.equal(JSON.stringify(a), JSON.stringify(b));
    const c = createWildCreature(createRng("w2"), CFG, { id: "x" });
    assert.notEqual(JSON.stringify(a), JSON.stringify(c));
  });

  it("consume exactamente 205 tiradas (normal, forzada, pura y calidad uniforme)", () => {
    const uni = loadConfig((r) => (r.calidad.distribucion_salvaje = "uniforme"));
    assert.equal(drawsConsumed("t", (r) => createWildCreature(r, CFG, { id: "a" })), 205);
    assert.equal(drawsConsumed("t", (r) => createWildCreature(r, CFG, { id: "a", family: "roca" })), 205);
    assert.equal(drawsConsumed("t", (r) => createWildCreature(r, CFG, { id: "a", family: "roca", pure: true })), 205);
    assert.equal(drawsConsumed("t", (r) => createWildCreature(r, uni, { id: "a" })), 205);
    assert.equal(drawsConsumed("t", (r) => createWildPopulation(r, CFG, 5), 2000), 1025);
  });

  it("puro => los 12 genes de la familia principal; sin mutados ni híbridas", () => {
    const c = createWildCreature(createRng("p"), CFG, { id: "a", family: "voltio", pure: true });
    assert.ok(allGenes(c).every((g) => g.family === "voltio" && g.origin === "base"));
    assert.equal(c.family, "voltio");
    assert.equal(c.generation, 0);
    assert.equal(c.parents, null);
  });

  it("calidad triangular: ∈ [85,5; 94,5], media ≈ 90, P(≥ 93,6) ≈ 2 %; Σancla = Σvalores = calidad", () => {
    let n = 0;
    let high = 0;
    let low = 0;
    let sum = 0;
    for (const c of createWildPopulation(createRng("calidad"), CFG, 3000)) {
      assert.deepEqual(checkInvariants(c, CFG), []);
      for (const g of allGenes(c)) {
        n++;
        sum += g.quality;
        if (g.quality >= 93.6) high++;
        if (g.quality <= 87.3) low++;
        assert.ok(g.quality >= 85.5 && g.quality <= 94.5);
        assert.ok(Math.abs(sum3(g.anchor) - g.quality) < 1e-9 && Math.abs(sum3(g.values) - g.quality) < 1e-9);
      }
    }
    // P(T ≥ 0,7989) con T triangular en [−1, 1] y el redondeo r2 ⇒ 0,0202 (spec dice ≈ 2 %)
    const pHigh = (1 - (93.595 - 90) / 4.5) ** 2 / 2;
    const pLow = (1 + (87.305 - 90) / 4.5) ** 2 / 2;
    assert.ok(Math.abs(high / n - pHigh) < tol5(pHigh, n), `alta ${high / n}`);
    assert.ok(Math.abs(low / n - pLow) < tol5(pLow, n), `baja ${low / n}`);
    assert.ok(Math.abs(sum / n - 90) < 0.05, `media ${sum / n}`);
  });

  it("wildQuality: extremos de la triangular y de la uniforme", () => {
    assert.equal(wildQuality(0, 0, CFG), 85.5);
    assert.equal(wildQuality(0.5, 0.5, CFG), 90);
    assert.ok(wildQuality(0.999999, 0.999999, CFG) <= 94.5);
    const uni = loadConfig((r) => (r.calidad.distribucion_salvaje = "uniforme"));
    assert.equal(wildQuality(0, 0.9, uni), 85.5);
    assert.equal(wildQuality(0.5, 0, uni), 90);
  });

  it("frecuencias de familia: D de la principal ≈ 70 %, R ≈ 40 % + 60 %/6 = 50 %", () => {
    let dMain = 0;
    let rMain = 0;
    let dTotal = 0;
    const r2 = createRng("pob3");
    for (let i = 0; i < 3000; i++) {
      const c = createWildCreature(r2, CFG, { id: `f${i}`, family: "brote" });
      assert.ok(allGenes(c).every((g) => g.origin === "base" && CFG.baseFamilies.includes(g.family)));
      for (const L of LOCUS_IDS) {
        dTotal++;
        if (c.genome[L].D.family === "brote") dMain++;
        if (c.genome[L].R1.family === "brote") rMain++;
        if (c.genome[L].R2.family === "brote") rMain++;
      }
    }
    assert.ok(Math.abs(dMain / dTotal - 0.7) < tol5(0.7, dTotal), `D ${dMain / dTotal}`);
    assert.ok(Math.abs(rMain / (2 * dTotal) - 0.5) < tol5(0.5, 2 * dTotal), `R ${rMain / (2 * dTotal)}`);
  });

  it("genes congelados (QA-08) y familia forzada no base rechazada", () => {
    const c = createWildCreature(createRng("frz"), CFG, { id: "a" });
    for (const g of allGenes(c)) {
      assert.ok(Object.isFrozen(g) && Object.isFrozen(g.anchor) && Object.isFrozen(g.values) && Object.isFrozen(g.shape));
    }
    assert.throws(() => createWildCreature(createRng("z"), CFG, { id: "a", family: "vapor" }), RangeError);
  });

  it("vector dorado de salvaje", () => {
    const c = createWildCreature(createRng("dorado-salvaje"), CFG, { id: "s1" });
    assert.equal(JSON.stringify(c.genome.cabeza), GOLDEN_WILD_HEAD);
    assert.equal(JSON.stringify(allGenes(c).map((g) => [g.id, g.quality])), GOLDEN_WILD_IDS);
  });
});

describe("familia de la criatura (spec §7 v0.2)", () => {
  const slot = (f: string, L: (typeof LOCUS_IDS)[number]) => {
    const g: Gene = CFG.baseFamilies.includes(f) ? catalogGene(`${f}.${L}.1`) : hybridGene(f, L, [0.5, 0.5, 0.5, 0.5]);
    return { D: g, R1: g, R2: g };
  };
  const fams = (list: string[], cfg = CFG) =>
    creatureFamily(makeCreature("x", (L) => slot(list[LOCUS_IDS.indexOf(L)] as string, L)).genome, cfg);

  it("ejemplos de la spec", () => {
    assert.equal(fams(["vapor", "llama", "llama", "marea"]), "vapor"); // 2-2-1, empate gana híbrida
    assert.equal(fams(["vapor", "llama", "llama", "llama"]), "llama"); // 2 vs 3
    assert.equal(fams(["vapor", "magma", "llama", "roca"]), "vapor"); // empate de híbridas: cabeza
  });

  it("empates: gana la híbrida aunque no esté en la cabeza; entre híbridas, primer locus", () => {
    assert.equal(fams(["llama", "llama", "vapor", "marea"]), "vapor");
    assert.equal(fams(["llama", "magma", "vapor", "roca"]), "magma");
    assert.equal(fams(["marea", "vapor", "vapor", "marea"]), "vapor"); // 4 vs 2
  });

  it("solo base: mayoría y, en empate, la cabeza (o el primer locus de las empatadas)", () => {
    assert.equal(fams(["brote", "llama", "llama", "roca"]), "llama");
    assert.equal(fams(["marea", "llama", "llama", "marea"]), "marea");
    assert.equal(fams(["roca", "brote", "voltio", "sombra"]), "roca");
    assert.equal(fams(["roca", "llama", "marea", "marea"]), "marea");
  });

  it("peso de la híbrida configurable (barrido 1 · 2 · 3)", () => {
    const w1 = loadConfig((r) => (r.familia_criatura.peso_gen_hibrido = 1));
    const w3 = loadConfig((r) => (r.familia_criatura.peso_gen_hibrido = 3));
    assert.equal(fams(["vapor", "llama", "llama", "marea"], w1), "llama");
    assert.equal(fams(["llama", "llama", "vapor", "marea"], w1), "llama");
    assert.equal(fams(["vapor", "llama", "llama", "llama"], w3), "vapor"); // 3 vs 3: gana híbrida
  });

  it("calidad de la criatura = media de los 4 D; porcentaje 0..100", () => {
    const c = createWildCreature(createRng("q"), CFG, { id: "q" });
    const m = LOCUS_IDS.reduce((s, L) => s + c.genome[L].D.quality, 0) / 4;
    assert.equal(creatureQuality(c), m);
    assert.equal(qualityPercent(85.5, CFG), 0);
    assert.equal(qualityPercent(94.5, CFG), 100);
    assert.equal(qualityPercent(90, CFG), 50);
  });
});

describe("higiene del núcleo (spec §9.1)", () => {
  it("sin Math.random ni reloj; en genética tampoco **, pow/sqrt/log/exp/trig ni rng.normal", () => {
    const srcDir = new URL("../src/", import.meta.url);
    let scanned = 0;
    for (const rel of readdirSync(srcDir, { recursive: true })) {
      if (!rel.endsWith(".ts")) continue;
      scanned++;
      const code = readFileSync(new URL(rel, srcDir), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
      assert.ok(!/Math\.random|Date\.|Date\(|performance\.now/.test(code), `${rel}: azar/reloj`);
      if (rel.startsWith("genetics")) {
        assert.ok(!/\*\*|Math\.(log|exp|sin|cos|tan|atan|pow|sqrt|cbrt|hypot)|\.normal\(/.test(code), `${rel}: operación no permitida`);
      }
    }
    assert.ok(scanned >= 10);
  });

  it("geneKey = familia|locus|firma; invariantes detectan una suma rota", () => {
    assert.equal(geneKey(catalogGene("llama.cabeza.1")), "llama|cabeza|2332");
    const g = catalogGene("llama.cabeza.1");
    const broken = { ...g, quality: 91 };
    const c = makeCreature("x", () => ({ D: broken, R1: g, R2: g }));
    assert.ok(checkInvariants(c, CFG).length >= 4); // Σancla y Σvalores ≠ calidad en los 4 loci
    for (const k of STAT_IDS) assert.equal(typeof g.values[k], "number");
  });
});

// Vectores dorados (spec §14: cambian con v0.2). Si fallan, ha cambiado el
// algoritmo o el orden de tiradas: rompe partidas y simulaciones registradas.
const GOLDEN_WILD_HEAD = "{\"D\":{\"id\":\"brote.cabeza.3\",\"family\":\"brote\",\"locus\":\"cabeza\",\"shape\":[0,0.5,0.5,0.5],\"signature\":\"0222\",\"move\":\"mov:brote.cabeza.3\",\"quality\":89.83,\"anchor\":{\"potencia\":30.94,\"velocidad\":33.94,\"resistencia\":24.95},\"values\":{\"potencia\":33.27,\"velocidad\":33.51,\"resistencia\":23.05},\"origin\":\"base\"},\"R1\":{\"id\":\"brote.cabeza.2\",\"family\":\"brote\",\"locus\":\"cabeza\",\"shape\":[0.5,0.5,0,1],\"signature\":\"2204\",\"move\":\"mov:brote.cabeza.2\",\"quality\":93.96,\"anchor\":{\"potencia\":38.63,\"velocidad\":29.23,\"resistencia\":26.1},\"values\":{\"potencia\":38.24,\"velocidad\":30.84,\"resistencia\":24.88},\"origin\":\"base\"},\"R2\":{\"id\":\"roca.cabeza.1\",\"family\":\"roca\",\"locus\":\"cabeza\",\"shape\":[0.75,0.25,0.75,0.25],\"signature\":\"3131\",\"move\":\"mov:roca.cabeza.1\",\"quality\":89.56,\"anchor\":{\"potencia\":34.83,\"velocidad\":17.91,\"resistencia\":36.82},\"values\":{\"potencia\":34.8,\"velocidad\":18.82,\"resistencia\":35.94},\"origin\":\"base\"}}";
const GOLDEN_WILD_IDS = "[[\"brote.cabeza.3\",89.83],[\"brote.cabeza.2\",93.96],[\"roca.cabeza.1\",89.56],[\"roca.cuerpo.2\",89.97],[\"llama.cuerpo.3\",88.35],[\"voltio.cuerpo.2\",89.74],[\"brote.extremidades.3\",89.73],[\"llama.extremidades.2\",89.65],[\"brote.extremidades.3\",90.84],[\"brote.cola.1\",90.68],[\"llama.cola.2\",86.79],[\"brote.cola.2\",88.46]]";
