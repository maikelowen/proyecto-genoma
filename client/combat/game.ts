/** Lógica de partida (sin DOM): ofertas de almas, equipos y control del combate por turnos. */
import {
  buildCombatant,
  createBattle,
  createReferenceAi,
  createSearchAi,
  referencePlacement,
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

/** Equipo rival: 3 almas con familias al azar (pueden repetirse). */
export function rollRival(seed: string): Soul[] {
  const rng = createRng("rival|" + seed);
  const taken = new Set<string>();
  return [1, 2, 3].map((i) => makeSoul(rng, `r${i}`, seed, taken, rng.pick(gcfg.baseFamilies)));
}

export interface Fight {
  readonly seed: string;
  /** Mi equipo en el orden en que se eligió, y la casilla (1–4) de cada alma. */
  readonly team: readonly Soul[];
  readonly placement: readonly number[];
  /** Almas por casilla (índice = casilla − 1; null = casilla vacía). */
  readonly mine: readonly (Soul | null)[];
  readonly rival: readonly (Soul | null)[];
  state: BattleState;
  readonly rng: Rng;
  readonly names: readonly [readonly string[], readonly string[]];
  readonly ai: ReturnType<typeof createReferenceAi>;
}

function bySlot(souls: readonly Soul[], placement: readonly number[]): (Soul | null)[] {
  const out: (Soul | null)[] = [null, null, null, null];
  souls.forEach((s, i) => (out[(placement[i] as number) - 1] = s));
  return out;
}

/** `team` y `placement` (casilla de cada alma) son los míos; el rival coloca con la regla de referencia (a ciegas). */
export function startFight(team: readonly Soul[], placement: readonly number[], rival: readonly Soul[], seed: string, ai: Fight["ai"] = createReferenceAi()): Fight {
  const rPl = referencePlacement(rival.map((s) => s.combatant), cfg.combat);
  const mine = bySlot(team, placement);
  const foe = bySlot(rival, rPl);
  return {
    seed,
    team,
    placement,
    mine,
    rival: foe,
    state: createBattle(team.map((s) => s.combatant), rival.map((s) => s.combatant), cfg, [...placement], rPl),
    rng: createRng(cfg.combat.seedPrefix + seed),
    names: [mine.map((s) => s?.name ?? ""), foe.map((s) => s?.name ?? "")],
    ai,
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

export type Dificultad = "normal" | "dificil";

/** Presupuesto por decisión de la IA difícil en el navegador (ms). Si una decisión lo supera, el resto de la partida usa la IA normal. */
export const SEARCH_BUDGET_MS = 800;

/** Punto de enganche de la IA rival: "normal" = referencia; "dificil" = búsqueda del núcleo con respaldo por tiempo. */
export function chooseOpponentAi(d: Dificultad): Fight["ai"] {
  const ref = createReferenceAi();
  if (d !== "dificil") return ref;
  const search = createSearchAi();
  let slow = false;
  return (state, side, c) => {
    if (slow) return ref(state, side, c);
    const t = performance.now();
    const plan = search(state, side, c);
    if (performance.now() - t > SEARCH_BUDGET_MS) slow = true;
    return plan;
  };
}
