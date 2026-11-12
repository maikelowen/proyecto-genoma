/** Lógica de partida (sin DOM): ofertas de almas, equipos y control del combate por turnos. */
import {
  buildCombatant,
  createBattle,
  createReferenceAi,
  createRng,
  createWildCreature,
  resolveTurn,
  validatePlan,
  type Action,
  type BattleEvent,
  type BattleState,
  type Combatant,
  type Creature,
  type Rng,
} from "../../packages/core/src/index.ts";
import { cfg, gcfg, soulName } from "./data.ts";

export interface Soul {
  readonly creature: Creature;
  readonly combatant: Combatant;
  readonly name: string;
}

/** Semilla corta; Math.random solo se usa aquí, para elegir semillas (las reglas usan el RNG del núcleo). */
export function newSeed(): string {
  return Math.random().toString(36).slice(2, 8);
}

function makeSoul(rng: Rng, id: string, seed: string, taken: Set<string>, family?: string): Soul {
  const creature = createWildCreature(rng, gcfg, family === undefined ? { id } : { id, family });
  return { creature, combatant: buildCombatant(creature, cfg), name: soulName(id, seed, taken) };
}

/** 8 almas salvajes: las 6 familias base una vez (barajadas) y 2 extra al azar. */
export function rollOffer(seed: string): Soul[] {
  const rng = createRng("oferta|" + seed);
  const fams = rng.shuffle(gcfg.baseFamilies.slice());
  fams.push(rng.pick(gcfg.baseFamilies), rng.pick(gcfg.baseFamilies));
  const taken = new Set<string>();
  return rng.shuffle(fams).map((f, i) => makeSoul(rng, `o${i + 1}`, seed, taken, f));
}

/** Equipo rival: 4 almas con familias al azar (pueden repetirse). */
export function rollRival(seed: string): Soul[] {
  const rng = createRng("rival|" + seed);
  const taken = new Set<string>();
  return [1, 2, 3, 4].map((i) => makeSoul(rng, `r${i}`, seed, taken, rng.pick(gcfg.baseFamilies)));
}

export interface Fight {
  readonly seed: string;
  readonly mine: readonly Soul[];
  readonly rival: readonly Soul[];
  state: BattleState;
  readonly rng: Rng;
  readonly names: readonly [readonly string[], readonly string[]];
  readonly ai: ReturnType<typeof createReferenceAi>;
}

/** `mine` y `rival` en orden de posición (1–2 delantera, 3–4 trasera). */
export function startFight(mine: readonly Soul[], rival: readonly Soul[], seed: string): Fight {
  return {
    seed,
    mine,
    rival,
    state: createBattle(mine.map((s) => s.combatant), rival.map((s) => s.combatant), cfg),
    rng: createRng(cfg.combat.seedPrefix + seed),
    names: [mine.map((s) => s.name), rival.map((s) => s.name)],
    ai: createReferenceAi(),
  };
}

/** Valida el plan del jugador, pide el del rival a la IA y resuelve el turno. */
export function playTurn(f: Fight, plan: readonly Action[]): { before: BattleState; events: readonly BattleEvent[] } {
  const reason = validatePlan(f.state, "A", plan, cfg);
  if (reason !== null) throw new Error("plan inválido: " + reason);
  const before = f.state;
  const planB = f.ai(before, "B", cfg);
  const r = resolveTurn(before, plan, planB, f.rng, cfg);
  f.state = r.state;
  return { before, events: r.events };
}
