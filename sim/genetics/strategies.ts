/**
 * Estrategias de cría. Cada estrategia PROPONE parejas (índices en la
 * población) en orden de preferencia; el motor (engine.ts) cría de cada
 * pareja hasta `cpp` crías y se salta las parejas bloqueadas por el núcleo
 * (breedingBlocker: máx. crías, edad mínima). Si las propuestas se agotan
 * antes de llegar al objetivo, el motor rellena con parejas al azar entre
 * las criaturas aún elegibles (se cuenta como "fallback").
 *
 * Toda la aleatoriedad usa `simRng` (flujo separado del de cría, para que
 * los barridos de la misma semilla sigan pareados en la cría).
 */
import { expressedStats, type Creature, type GeneticsConfig, type Rng } from "../../packages/core/src/index.ts";

export interface StrategyCtx {
  readonly cfg: GeneticsConfig;
  readonly simRng: Rng;
}

export interface Strategy {
  readonly id: string;
  readonly label: string;
  /** `pop` es el array vivo (el motor actualiza los contadores de crías). */
  propose(pop: readonly Creature[], ctx: StrategyCtx): Iterable<[number, number]>;
}

const MAX_PASSES = 6;

function* consecutivePairs(order: readonly number[]): Generator<[number, number]> {
  for (let i = 0; i + 1 < order.length; i += 2) yield [order[i] as number, order[i + 1] as number];
}

function indices(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}

/** Cría al azar: barajar y emparejar consecutivos (spec E1); otra pasada si faltan. */
export const randomStrategy: Strategy = {
  id: "azar",
  label: "Cría al azar",
  *propose(pop, ctx) {
    for (let p = 0; p < MAX_PASSES; p++) yield* consecutivePairs(ctx.simRng.shuffle(indices(pop.length)));
  },
};

/**
 * Selectiva por velocidad: élite = 40 % de mayor velocidad total (Σ
 * velocidad de los 4 D; empate por índice); apareamiento al azar dentro
 * de la élite, varias pasadas hasta agotar el límite de 5 crías.
 */
export const ELITE_FRACTION = 0.4;
export const speedStrategy: Strategy = {
  id: "velocidad",
  label: "Selectiva por velocidad (élite 40 %)",
  *propose(pop, ctx) {
    const speed = pop.map((c) => expressedStats(c).velocidad);
    const ranked = indices(pop.length).sort((a, b) => (speed[b] as number) - (speed[a] as number) || a - b);
    const elite = ranked.slice(0, Math.ceil(pop.length * ELITE_FRACTION));
    for (let p = 0; p < MAX_PASSES; p++) yield* consecutivePairs(ctx.simRng.shuffle(elite));
  },
};

/**
 * Purista de familia: solo cruza criaturas de la misma familia
 * (spec §7). En cada pasada baraja cada grupo, forma parejas y baraja el
 * conjunto de parejas para no favorecer a ninguna familia.
 */
export const puristStrategy: Strategy = {
  id: "purista",
  label: "Purista de familia",
  *propose(pop, ctx) {
    const groups = new Map<string, number[]>();
    pop.forEach((c, i) => {
      const g = groups.get(c.family);
      if (g) g.push(i);
      else groups.set(c.family, [i]);
    });
    const fams = [...groups.keys()].sort();
    for (let p = 0; p < MAX_PASSES; p++) {
      const pairs: [number, number][] = [];
      for (const f of fams) pairs.push(...consecutivePairs(ctx.simRng.shuffle(groups.get(f) as number[])));
      yield* ctx.simRng.shuffle(pairs);
    }
  },
};

/**
 * Buscador de híbridas: puntúa cada pareja por locus según el D de cada
 * padre: par base con híbrida en la tabla = 1; híbrida × su componente
 * (retrocruce, 75 %) = 1; misma híbrida en ambos = 0,5 (la conserva);
 * resto 0. Emparejamiento voraz: recorre la población barajada y elige,
 * entre los siguientes 50 sin pareja, el de mayor puntuación (empate: el
 * primero).
 */
export const HYBRID_WINDOW = 50;
function hybridScore(fa: string, fb: string, cfg: GeneticsConfig): number {
  if (fa === fb) return cfg.hybridById.has(fa) ? 0.5 : 0;
  const ha = cfg.hybridById.get(fa);
  const hb = cfg.hybridById.get(fb);
  if (!ha && !hb) return cfg.hybridByPair.has(fa < fb ? `${fa}|${fb}` : `${fb}|${fa}`) ? 1 : 0;
  if (ha && !hb) return ha.components.includes(fb) ? 1 : 0;
  if (hb && !ha) return hb.components.includes(fa) ? 1 : 0;
  return 0;
}
export const hybridStrategy: Strategy = {
  id: "hibridas",
  label: "Buscador de híbridas",
  *propose(pop, ctx) {
    const fams = pop.map((c) => [c.genome.cabeza.D.family, c.genome.cuerpo.D.family, c.genome.extremidades.D.family, c.genome.cola.D.family]);
    const score = (a: number, b: number): number => {
      const fa = fams[a] as string[];
      const fb = fams[b] as string[];
      let s = 0;
      for (let l = 0; l < 4; l++) s += hybridScore(fa[l] as string, fb[l] as string, ctx.cfg);
      return s;
    };
    for (let p = 0; p < MAX_PASSES; p++) {
      const order = ctx.simRng.shuffle(indices(pop.length));
      const used = new Uint8Array(pop.length);
      for (let i = 0; i < order.length; i++) {
        const a = order[i] as number;
        if (used[a]) continue;
        let best = -1;
        let bestScore = -1;
        let seen = 0;
        for (let j = i + 1; j < order.length && seen < HYBRID_WINDOW; j++) {
          const b = order[j] as number;
          if (used[b]) continue;
          seen++;
          const s = score(a, b);
          if (s > bestScore) {
            bestScore = s;
            best = b;
          }
        }
        if (best < 0) break;
        used[a] = 1;
        used[best] = 1;
        yield [a, best];
      }
    }
  },
};

export const STRATEGIES: readonly Strategy[] = [randomStrategy, speedStrategy, puristStrategy, hybridStrategy];

export function findStrategy(id: string): Strategy {
  const s = STRATEGIES.find((x) => x.id === id);
  if (!s) throw new Error(`estrategia desconocida: ${id}. Disponibles: ${STRATEGIES.map((x) => x.id).join(", ")}`);
  return s;
}
