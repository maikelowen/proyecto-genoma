import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRng, fromState, type Rng } from "../src/index.ts";

function take(rng: Rng, n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(rng.next());
  return out;
}

describe("determinismo", () => {
  it("misma semilla => misma secuencia (1.000 valores)", () => {
    assert.deepEqual(take(createRng("abc"), 1000), take(createRng("abc"), 1000));
    assert.deepEqual(take(createRng(12345), 1000), take(createRng(12345), 1000));
  });

  it("semillas distintas => secuencias distintas", () => {
    assert.notDeepEqual(take(createRng("abc"), 1000), take(createRng("abd"), 1000));
    assert.notDeepEqual(take(createRng(1), 1000), take(createRng(2), 1000));
  });

  it("semilla numérica equivale a su string", () => {
    assert.deepEqual(take(createRng(42), 10), take(createRng("42"), 10));
  });

  it("vector de referencia de createRng('genoma')", () => {
    // Si este test falla, ha cambiado el algoritmo, el hash o el
    // calentamiento: rompe la reproducibilidad de partidas guardadas.
    assert.deepEqual(take(createRng("genoma"), 5), [
      0.190010828897357, 0.01642170501872897, 0.8382162384223193,
      0.4279249971732497, 0.7733124429360032,
    ]);
  });

  it("next() siempre en [0, 1)", () => {
    const rng = createRng("rango");
    for (let i = 0; i < 100_000; i++) {
      const x = rng.next();
      assert.ok(x >= 0 && x < 1);
    }
  });
});

describe("fork y serialización", () => {
  it("mismo estado + mismo label => mismo hijo", () => {
    const a = createRng("padre");
    const b = createRng("padre");
    assert.deepEqual(take(a.fork("combate"), 100), take(b.fork("combate"), 100));
  });

  it("labels distintos => secuencias distintas", () => {
    const p = createRng("padre");
    assert.notDeepEqual(take(p.fork("combate"), 100), take(p.fork("breeding"), 100));
  });

  it("fork no modifica el estado del padre", () => {
    const p = createRng("padre");
    const before = p.getState();
    p.fork("x");
    assert.deepEqual(p.getState(), before);
    assert.deepEqual(take(p, 50), take(createRng("padre"), 50));
  });

  it("el hijo es distinto del padre y depende del estado del padre", () => {
    const p = createRng("padre");
    const c1 = p.fork("x");
    assert.notDeepEqual(take(c1, 50), take(createRng("padre"), 50));
    p.next();
    const c2 = p.fork("x");
    assert.notDeepEqual(take(c2, 50), take(createRng("padre").fork("x"), 50));
  });

  it("getState/fromState reanuda la misma secuencia (también vía JSON)", () => {
    const rng = createRng("guardar");
    take(rng, 37);
    const saved = JSON.parse(JSON.stringify(rng.getState()));
    const resumed = fromState(saved);
    assert.deepEqual(take(resumed, 1000), take(rng, 1000));
  });

  it("getState devuelve una copia", () => {
    const rng = createRng("copia");
    const s = rng.getState() as unknown as number[];
    s[0] = 0;
    assert.notEqual(rng.getState()[0], 0);
  });

  it("fromState rechaza estados inválidos", () => {
    assert.throws(() => fromState([1, 2, 3] as unknown as [number, number, number, number]));
    assert.throws(() => fromState([1, 2, 3, -1]));
    assert.throws(() => fromState([1, 2, 3, 2 ** 32]));
    assert.throws(() => fromState([1, 2, 3, 1.5]));
  });
});

describe("distribuciones", () => {
  it("int(1,6): cada cara a ±3 % de 10.000 en 60.000 tiradas", () => {
    const rng = createRng("dado");
    const counts = [0, 0, 0, 0, 0, 0, 0];
    for (let i = 0; i < 60_000; i++) {
      const v = rng.int(1, 6);
      assert.ok(Number.isInteger(v) && v >= 1 && v <= 6);
      counts[v] = (counts[v] ?? 0) + 1;
    }
    for (let face = 1; face <= 6; face++) {
      const c = counts[face] ?? 0;
      assert.ok(Math.abs(c - 10_000) <= 300, `cara ${face}: ${c}`);
    }
  });

  it("weightedIndex([37.5, 9.4, 3.1]): frecuencias a ±1 pp en 200.000 tiradas", () => {
    const rng = createRng("pesos");
    const weights = [37.5, 9.4, 3.1];
    const total = 50;
    const counts = [0, 0, 0];
    const n = 200_000;
    for (let i = 0; i < n; i++) {
      const k = rng.weightedIndex(weights);
      counts[k] = (counts[k] ?? 0) + 1;
    }
    weights.forEach((w, i) => {
      const observed = ((counts[i] ?? 0) / n) * 100;
      const expected = (w / total) * 100;
      assert.ok(Math.abs(observed - expected) <= 1, `índice ${i}: ${observed}% vs ${expected}%`);
    });
  });

  it("weightedIndex nunca devuelve índices con peso 0", () => {
    const rng = createRng("ceros");
    for (let i = 0; i < 10_000; i++) {
      const k = rng.weightedIndex([0, 1, 0, 2, 0]);
      assert.ok(k === 1 || k === 3);
    }
  });

  it("normal(0,1): media ≈ 0 y sd ≈ 1 en 100.000 muestras", () => {
    const rng = createRng("normal");
    const n = 100_000;
    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < n; i++) {
      const x = rng.normal(0, 1);
      sum += x;
      sumSq += x * x;
    }
    const mean = sum / n;
    const sd = Math.sqrt(sumSq / n - mean * mean);
    assert.ok(Math.abs(mean) < 0.02, `media ${mean}`);
    assert.ok(Math.abs(sd - 1) < 0.02, `sd ${sd}`);
  });

  it("chance(0.03) ≈ 3 %", () => {
    const rng = createRng("suerte");
    const n = 200_000;
    let hits = 0;
    for (let i = 0; i < n; i++) if (rng.chance(0.03)) hits++;
    const pct = (hits / n) * 100;
    assert.ok(Math.abs(pct - 3) < 0.15, `${pct}%`);
  });

  it("float(min,max) dentro del intervalo", () => {
    const rng = createRng("float");
    for (let i = 0; i < 10_000; i++) {
      const x = rng.float(-2.5, 7);
      assert.ok(x >= -2.5 && x < 7);
    }
  });
});

describe("consumo fijo de tiradas", () => {
  // Compara el estado tras la llamada con el de avanzar k veces next().
  function consumes(call: (r: Rng) => unknown, k: number): void {
    const a = createRng("consumo");
    const b = createRng("consumo");
    call(a);
    take(b, k);
    assert.deepEqual(a.getState(), b.getState());
  }

  it("next/int/float/chance/pick/weightedIndex consumen 1; normal 2; shuffle n-1", () => {
    consumes((r) => r.next(), 1);
    consumes((r) => r.int(0, 99), 1);
    consumes((r) => r.float(0, 1), 1);
    consumes((r) => r.chance(0), 1);
    consumes((r) => r.chance(1), 1);
    consumes((r) => r.pick(["a", "b"]), 1);
    consumes((r) => r.weightedIndex([1, 2, 3]), 1);
    consumes((r) => r.normal(0, 1), 2);
    consumes((r) => r.shuffle([1, 2, 3, 4, 5]), 4);
    consumes((r) => r.fork("x"), 0);
  });
});

describe("pick y shuffle", () => {
  it("shuffle devuelve una permutación sin tocar la entrada", () => {
    const input = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8]);
    const out = createRng("baraja").shuffle(input);
    assert.deepEqual([...out].sort((x, y) => x - y), [...input]);
    assert.notEqual(out, input);
  });

  it("shuffle es determinista y cubre permutaciones", () => {
    assert.deepEqual(createRng("s").shuffle([1, 2, 3, 4]), createRng("s").shuffle([1, 2, 3, 4]));
    const rng = createRng("perms");
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) seen.add(rng.shuffle([1, 2, 3]).join(""));
    assert.equal(seen.size, 6);
  });

  it("pick devuelve elementos del array", () => {
    const rng = createRng("pick");
    const items = ["x", "y", "z"];
    for (let i = 0; i < 1000; i++) assert.ok(items.includes(rng.pick(items)));
  });
});

describe("errores", () => {
  const rng = createRng("errores");

  it("weightedIndex lanza con todos ceros, negativos, NaN o vacío", () => {
    assert.throws(() => rng.weightedIndex([0, 0, 0]), RangeError);
    assert.throws(() => rng.weightedIndex([1, -1, 2]), RangeError);
    assert.throws(() => rng.weightedIndex([1, Number.NaN]), RangeError);
    assert.throws(() => rng.weightedIndex([1, Number.POSITIVE_INFINITY]), RangeError);
    assert.throws(() => rng.weightedIndex([]), RangeError);
  });

  it("int, pick, normal y createRng validan argumentos", () => {
    assert.throws(() => rng.int(5, 1), RangeError);
    assert.throws(() => rng.int(0.5, 3), RangeError);
    assert.throws(() => rng.pick([]), RangeError);
    assert.throws(() => rng.normal(0, -1), RangeError);
    assert.throws(() => rng.chance(Number.NaN), RangeError);
    assert.throws(() => createRng(Number.NaN), RangeError);
  });
});
