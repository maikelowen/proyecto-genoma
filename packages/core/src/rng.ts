/**
 * Generador de números aleatorios determinista con semilla.
 *
 * Algoritmo: sfc32 (Small Fast Counting, Chris Doty-Humphrey, PractRand).
 * Estado de 128 bits (a, b, c, contador d), periodo mínimo 2^32 y
 * típicamente ~2^127. Toda la aritmética es entera de 32 bits
 * (`>>> 0`, `| 0`, `Math.imul`), así que el resultado es idéntico en
 * cualquier motor JS (navegador o servidor).
 *
 * Semilla: un string (o número, que se convierte con `String(n)`, de modo
 * que `createRng(42)` y `createRng("42")` son el mismo generador) se pasa
 * por el hash cyrb128 para obtener los 4 palabras de estado. Después se
 * descartan WARMUP_ROUNDS salidas para mezclar bien semillas parecidas.
 *
 * Contrato de consumo (importante para reproducibilidad): cada método
 * documenta cuántas "tiradas" (llamadas internas a sfc32) consume. Ese
 * número es fijo e independiente de los valores obtenidos, salvo en
 * `shuffle`, que consume exactamente `length - 1` tiradas.
 *
 * Nada en este módulo usa `Math.random` ni el reloj.
 */

/** Estado serializable del generador: 4 enteros sin signo de 32 bits. */
export type RngState = readonly [number, number, number, number];

export interface Rng {
  /** Float uniforme en [0, 1) con 32 bits de resolución. 1 tirada. */
  next(): number;
  /** Entero uniforme en [min, maxInclusive]. 1 tirada. */
  int(min: number, maxInclusive: number): number;
  /** Float uniforme en [min, max). 1 tirada. */
  float(min: number, max: number): number;
  /** `true` con probabilidad p (p se recorta a [0, 1]). 1 tirada siempre. */
  chance(p: number): boolean;
  /** Elemento uniforme de un array no vacío. 1 tirada. */
  pick<T>(items: readonly T[]): T;
  /**
   * Índice elegido con probabilidad proporcional a su peso. Los pesos no
   * tienen que sumar 1. Lanza si hay pesos negativos/NaN/infinitos, si el
   * array está vacío o si todos son 0. Un peso 0 nunca sale. 1 tirada.
   */
  weightedIndex(weights: readonly number[]): number;
  /** Normal(mean, sd) por Box–Muller. 2 tiradas siempre (sin caché). */
  normal(mean: number, sd: number): number;
  /** Copia barajada (Fisher–Yates). No modifica la entrada. length-1 tiradas. */
  shuffle<T>(items: readonly T[]): T[];
  /**
   * Crea un generador hijo independiente a partir del estado ACTUAL del
   * padre y de `label`. NO modifica el estado del padre (0 tiradas): la
   * semilla del hijo es cyrb128(label + "|" + estado del padre en hex).
   * Consecuencias: mismo estado + mismo label => mismo hijo; si quieres
   * dos hijos distintos desde el mismo punto usa labels distintos.
   */
  fork(label: string): Rng;
  /** Copia del estado actual, apta para JSON. */
  getState(): RngState;
}

const WARMUP_ROUNDS = 15;
const TWO_POW_32 = 4294967296;

/**
 * Hash cyrb128 (bryc): string -> 4 palabras de 32 bits bien mezcladas.
 * Se usa para derivar el estado inicial de sfc32.
 */
export function cyrb128(str: string): RngState {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/** Crea un generador a partir de una semilla (string o número). */
export function createRng(seed: string | number): Rng {
  if (typeof seed === "number" && !Number.isFinite(seed)) {
    throw new RangeError(`Semilla numérica no finita: ${seed}`);
  }
  const rng = new Sfc32Rng(cyrb128(String(seed)));
  for (let i = 0; i < WARMUP_ROUNDS; i++) rng.nextUint32();
  return rng;
}

/**
 * Reanuda un generador desde un estado guardado con `getState()`.
 * No aplica calentamiento: continúa exactamente donde se dejó.
 */
export function fromState(state: RngState): Rng {
  if (!Array.isArray(state) || state.length !== 4) {
    throw new TypeError("El estado del RNG debe ser un array de 4 enteros");
  }
  for (const w of state) {
    if (!Number.isInteger(w) || w < 0 || w >= TWO_POW_32) {
      throw new RangeError(`Palabra de estado fuera de uint32: ${w}`);
    }
  }
  return new Sfc32Rng(state);
}

function toHex8(n: number): string {
  return n.toString(16).padStart(8, "0");
}

class Sfc32Rng implements Rng {
  // Estado mutable interno; hacia fuera solo se expone como copia.
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(state: RngState) {
    this.a = state[0] >>> 0;
    this.b = state[1] >>> 0;
    this.c = state[2] >>> 0;
    this.d = state[3] >>> 0;
  }

  /** Una tirada de sfc32: entero sin signo de 32 bits. */
  nextUint32(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return t >>> 0;
  }

  next(): number {
    return this.nextUint32() / TWO_POW_32;
  }

  int(min: number, maxInclusive: number): number {
    if (!Number.isSafeInteger(min) || !Number.isSafeInteger(maxInclusive)) {
      throw new RangeError(`int() requiere enteros: (${min}, ${maxInclusive})`);
    }
    if (maxInclusive < min) {
      throw new RangeError(`int(): max (${maxInclusive}) < min (${min})`);
    }
    const range = maxInclusive - min + 1;
    if (range > TWO_POW_32) {
      throw new RangeError(`int(): rango mayor que 2^32 (${range})`);
    }
    // Multiplicar y truncar: sesgo <= range / 2^32, despreciable para los
    // rangos del juego, y garantiza consumo fijo de 1 tirada (sin rechazo).
    return min + Math.floor((this.nextUint32() * range) / TWO_POW_32);
  }

  float(min: number, max: number): number {
    if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) {
      throw new RangeError(`float(): intervalo inválido (${min}, ${max})`);
    }
    return min + this.next() * (max - min);
  }

  chance(p: number): boolean {
    if (Number.isNaN(p)) throw new RangeError("chance(): p es NaN");
    // Siempre consume 1 tirada, aunque p sea 0 o 1, para no desalinear.
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new RangeError("pick(): array vacío");
    return items[this.int(0, items.length - 1)] as T;
  }

  weightedIndex(weights: readonly number[]): number {
    if (weights.length === 0) throw new RangeError("weightedIndex(): sin pesos");
    let total = 0;
    for (const w of weights) {
      if (!Number.isFinite(w) || w < 0) {
        throw new RangeError(`weightedIndex(): peso inválido ${w}`);
      }
      total += w;
    }
    if (total <= 0) throw new RangeError("weightedIndex(): todos los pesos son 0");

    const target = this.next() * total;
    let acc = 0;
    let lastPositive = -1;
    for (let i = 0; i < weights.length; i++) {
      const w = weights[i] as number;
      if (w === 0) continue;
      acc += w;
      lastPositive = i;
      if (target < acc) return i;
    }
    // Solo por redondeo de coma flotante: devuelve el último peso > 0.
    return lastPositive;
  }

  normal(mean: number, sd: number): number {
    if (!Number.isFinite(mean) || !Number.isFinite(sd) || sd < 0) {
      throw new RangeError(`normal(): parámetros inválidos (${mean}, ${sd})`);
    }
    // u1 en (0, 1] para evitar log(0). Se descarta el segundo valor de
    // Box–Muller para que el consumo sea siempre 2 tiradas y el estado
    // serializable no tenga que guardar una caché.
    const u1 = 1 - this.next();
    const u2 = this.next();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + sd * z;
  }

  shuffle<T>(items: readonly T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      const tmp = out[i] as T;
      out[i] = out[j] as T;
      out[j] = tmp;
    }
    return out;
  }

  fork(label: string): Rng {
    const s = this.getState();
    const seed = `${label}|${toHex8(s[0])}${toHex8(s[1])}${toHex8(s[2])}${toHex8(s[3])}`;
    const child = new Sfc32Rng(cyrb128(seed));
    for (let i = 0; i < WARMUP_ROUNDS; i++) child.nextUint32();
    return child;
  }

  getState(): RngState {
    return [this.a >>> 0, this.b >>> 0, this.c >>> 0, this.d >>> 0];
  }
}
