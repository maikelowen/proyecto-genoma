/**
 * Estado de partida y reglas del bucle de progresión v0.1 (docs/spec/progresion-v0.1.md).
 * Todas las funciones son puras: reciben el estado y devuelven uno nuevo (nunca mutan).
 * Único azar: `createRng(semilla + "|" + flujo + "|" + contador)` (§7.1), con tiradas fijas.
 */
import { createRng, type Rng } from "../rng.ts";
import { createBattle, resolveTurn, battleHash, type BattleEvent, type BattleState, type Plan, type SideId } from "../combat/engine.ts";
import { createReferenceAi, type Ai } from "../combat/ai.ts";
import type { Combatant } from "../combat/combatant.ts";
import type { Placement } from "../combat/placement.ts";
import { breed, type BreedResult } from "../genetics/breed.ts";
import { createWildCreature, creatureQuality } from "../genetics/creature.ts";
import { geneKey } from "../genetics/gene.ts";
import { LOCUS_IDS, type Creature, type FamilyId, type LocusId } from "../genetics/types.ts";
import type { ProgressionConfig, Zone } from "./config.ts";
import {
  animaId,
  combatantAtLevel,
  combatantOf,
  isMature,
  levelOf,
  openSlots,
  pendingVariants,
  revealedByLevel,
  xpForLevel,
  type Anima,
  type AnimaOrigin,
  type ChosenVariant,
  type MoveSlot,
  type MoveSlots,
} from "./anima.ts";
import type { VariantOffer } from "./variants.ts";
import { wildAi } from "./wild-ai.ts";

// ---------------------------------------------------------------- estado (§7.1)

export interface CodexMutation {
  readonly clave: string;
  readonly id: string;
  /** Número de la resonancia (1 = la primera de la partida). */
  readonly resonancia: number;
  readonly animaId: string;
}
export interface LineageEntry {
  readonly id: string;
  readonly nombre: string;
  readonly familia: FamilyId;
  readonly genesD: readonly string[];
}

/** progresión §7.1 — estado mínimo (formato `genoma-partida`). Es lo que se guarda tal cual. */
export interface GameState {
  readonly formato: string;
  readonly version: number;
  readonly semilla: string;
  readonly config: { readonly progresion: string; readonly genetica: string; readonly movimientos: string; readonly combate: string };
  readonly contadores: { readonly encuentros: number; readonly faroles: number; readonly resonancias: number; readonly nacimientos: number };
  readonly recursos: { readonly faroles: number; readonly esencia: number };
  readonly nivel_max_alcanzado: number;
  /** `elegida` = null hasta elegir la inicial. */
  readonly inicial: { readonly elegida: 0 | 1 | 2 | null; readonly intro_vista: boolean };
  readonly animas: readonly Anima[];
  readonly equipo: readonly string[];
  readonly codex: { readonly genes: readonly string[]; readonly mutaciones: readonly CodexMutation[]; readonly familias: readonly FamilyId[] };
  readonly linaje: readonly LineageEntry[];
  readonly registro: { readonly sesiones: number; readonly combates: number; readonly victorias: number; readonly capturas: number; readonly intentos: number; readonly resonancias: number };
}

/** Error de regla (acción no permitida). No consume tiradas ni cambia el estado. */
export class GameRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GameRuleError";
  }
}
function rule(cond: boolean, msg: string): void {
  if (!cond) throw new GameRuleError(msg);
}

/** progresión §7.1 — único azar: `createRng(semilla|flujo|contador)`. */
export function streamRng(game: Pick<GameState, "semilla">, flow: string, counter: number | string): Rng {
  return createRng(`${game.semilla}|${flow}|${counter}`);
}

/** progresión §7.1 — partida nueva (la semilla la crea el cliente). */
export function newGame(seed: string, cfg: ProgressionConfig): GameState {
  rule(typeof seed === "string" && seed.length > 0, "la semilla debe ser un texto no vacío");
  return {
    formato: cfg.save.format,
    version: cfg.save.formatVersion,
    semilla: seed,
    config: { ...cfg.versions },
    contadores: { encuentros: 0, faroles: 0, resonancias: 0, nacimientos: 0 },
    recursos: { faroles: cfg.resources.lanternsStart, esencia: cfg.resources.essenceStart },
    nivel_max_alcanzado: 0,
    inicial: { elegida: null, intro_vista: false },
    animas: [],
    equipo: [],
    codex: { genes: [], mutaciones: [], familias: [] },
    linaje: [],
    registro: { sesiones: 0, combates: 0, victorias: 0, capturas: 0, intentos: 0, resonancias: 0 },
  };
}

export function findAnima(game: GameState, id: string): Anima | undefined {
  return game.animas.find((a) => a.id === id);
}
function getAnima(game: GameState, id: string): Anima {
  const a = findAnima(game, id);
  rule(a !== undefined, `no existe el ánima '${id}'`);
  return a as Anima;
}
function replaceAnima(game: GameState, a: Anima): GameState {
  return { ...game, animas: game.animas.map((x) => (x.id === a.id ? a : x)) };
}

// ---------------------------------------------------------------- Codex (§6.3)

function addUnique<T>(list: readonly T[], items: readonly T[]): readonly T[] {
  const out = list.slice();
  for (const x of items) if (!out.includes(x)) out.push(x);
  return out;
}
/** Claves de los D y de los ocultos revelados de un ánima. */
function seenKeys(a: Pick<Anima, "criatura" | "revelados">): string[] {
  const keys = LOCUS_IDS.map((L) => geneKey(a.criatura.genome[L].D));
  for (const pos of a.revelados) {
    const [L, slot] = pos.split(".") as [LocusId, "R1" | "R2"];
    keys.push(geneKey(a.criatura.genome[L][slot]));
  }
  return keys;
}
function withSeen(game: GameState, a: Anima): GameState {
  return { ...game, codex: { ...game.codex, genes: addUnique(game.codex.genes, seenKeys(a)), familias: addUnique(game.codex.familias, [a.criatura.family]) } };
}

// ---------------------------------------------------------------- nombres y altas (§1.4)

/** progresión §1.4 — nombre por defecto: prefijo + sufijo, 2 tiradas del flujo `nombre|nacimiento`. */
export function defaultName(game: Pick<GameState, "semilla">, birth: number, cfg: ProgressionConfig): string {
  const rng = streamRng(game, "nombre", birth);
  const p = cfg.names.prefixes[Math.floor(rng.next() * cfg.names.prefixes.length)] as string;
  const s = cfg.names.suffixes[Math.floor(rng.next() * cfg.names.suffixes.length)] as string;
  return p + s;
}

function checkName(name: string, cfg: ProgressionConfig): string {
  rule(typeof name === "string", "nombre inválido");
  const n = name.trim();
  const len = [...n].length;
  rule(len >= 1 && len <= cfg.collection.nameMaxChars, `el nombre debe tener de 1 a ${cfg.collection.nameMaxChars} caracteres`);
  return n;
}

/** Ánima nueva a partir de una criatura ya con su id y nacimiento definitivos. */
function makeAnima(game: GameState, c: Creature, origin: AnimaOrigin, place: string | null, level: number, cfg: ProgressionConfig, name?: string): Anima {
  return {
    id: c.id,
    nombre: name !== undefined ? checkName(name, cfg) : defaultName(game, c.birth, cfg),
    criatura: c,
    xp: xpForLevel(level, cfg),
    origen: origin,
    lugar: place,
    nacimiento: c.birth,
    huecos: openSlots(null, level, cfg),
    revelados: revealedByLevel(level, cfg),
    aprendidas: [],
    variantes: {},
  };
}

function addAnima(game: GameState, a: Anima, cfg: ProgressionConfig): GameState {
  const g: GameState = {
    ...game,
    animas: [...game.animas, a],
    nivel_max_alcanzado: Math.max(game.nivel_max_alcanzado, levelOf(a.xp, cfg)),
  };
  return withSeen(g, a);
}

// ---------------------------------------------------------------- inicio (§1.3)

/** progresión §1.3 — las 3 iniciales (205 tiradas cada una, flujo `inicial|k`); ids temporales. */
export function starterOptions(game: Pick<GameState, "semilla">, cfg: ProgressionConfig): Creature[] {
  return cfg.world.starterFamilies.map((family, k) =>
    createWildCreature(streamRng(game, "inicial", k), cfg.genetics, { id: `inicial-${k}`, birth: 0, family, pure: cfg.world.starterPure }),
  );
}

/** progresión §1.3 y §2.3 (QA B-04) — elige la inicial k: nacimiento m = 1, equipo = [ella]. */
export function chooseStarter(game: GameState, k: number, cfg: ProgressionConfig, name?: string): GameState {
  rule(game.inicial.elegida === null, "la inicial ya está elegida");
  rule(k === 0 || k === 1 || k === 2, `inicial ${k} inválida`);
  const m = game.contadores.nacimientos + 1;
  const c = starterOptions(game, cfg)[k] as Creature;
  const a = makeAnima(game, { ...c, id: animaId(m), birth: m }, "inicial", null, cfg.levels.starterLevel, cfg, name);
  const g: GameState = { ...game, contadores: { ...game.contadores, nacimientos: m }, inicial: { ...game.inicial, elegida: k as 0 | 1 | 2 }, equipo: [a.id] };
  return addAnima(g, a, cfg);
}

export function markIntroSeen(game: GameState): GameState {
  return { ...game, inicial: { ...game.inicial, intro_vista: true } };
}

// ---------------------------------------------------------------- acompañante (§2.4)

/** progresión §2.4 — la ánima del hechicero (fija para todas las partidas). */
export function companionCreature(cfg: ProgressionConfig): Creature {
  const w = cfg.world.companion;
  return createWildCreature(createRng(w.seed), cfg.genetics, { id: "acompanante", birth: 0, family: w.family, pure: true });
}
export function companionCombatant(cfg: ProgressionConfig): Combatant {
  return combatantAtLevel(companionCreature(cfg), cfg.world.companion.level, cfg);
}
/** ¿Lucha el acompañante? (mientras tengas menos de `mientras_animas_menos_de` ánimas). */
export function companionJoins(game: GameState, cfg: ProgressionConfig): boolean {
  const w = cfg.world.companion;
  return w.active && game.animas.length < w.whileFewerThan;
}

// ---------------------------------------------------------------- zonas y encuentros (§2)

export function zoneById(zoneId: string, cfg: ProgressionConfig): Zone {
  const z = cfg.world.zones.find((x) => x.id === zoneId);
  rule(z !== undefined, `zona desconocida '${zoneId}'`);
  return z as Zone;
}
/** progresión §2.1 — abierta si max(nivel de tus ánimas, nivel_max_alcanzado) ≥ desbloqueo_nivel. */
export function zoneUnlocked(game: GameState, zoneId: string, cfg: ProgressionConfig): boolean {
  let top = game.nivel_max_alcanzado;
  for (const a of game.animas) top = Math.max(top, levelOf(a.xp, cfg));
  return top >= zoneById(zoneId, cfg).unlockLevel;
}

export interface WildEntry {
  /** Id temporal `w<n>-<i>` y birth 0 (QA B-04). */
  readonly creature: Creature;
  readonly level: number;
  /** Faroles ya lanzados a esta salvaje. */
  readonly attempts: number;
  readonly state: "libre" | "atrapada" | "escapada";
  /** Se apagó en el combate. */
  readonly ko: boolean;
}

/** Encuentro en curso (no se guarda: cerrar = huida, §7.1). */
export interface Encounter {
  readonly n: number;
  readonly zone: string;
  readonly wilds: readonly WildEntry[];
  /** Ids de tus ánimas del equipo al empezar (sin el acompañante). */
  readonly team: readonly string[];
  readonly companion: boolean;
  readonly outcome: null | "victoria" | "derrota" | "huida";
  /** Vida de tu equipo al acabar (sin el acompañante), para atrapar (§3.2). */
  readonly teamHp: { readonly sv: number; readonly sm: number } | null;
}

/**
 * progresión §2.3 — grupo de salvajes con un RNG dado: 1 + grupo_max·(2 + 205) tiradas (622),
 * siempre las 3, se usen o no. Devuelve el grupo (los primeros g).
 */
export function rollWildGroup(rng: Rng, zone: Zone, n: number, cfg: ProgressionConfig): { creature: Creature; level: number }[] {
  const g = 1 + rng.weightedIndex(zone.groupWeights); // 1 tirada
  const all: { creature: Creature; level: number }[] = [];
  for (let i = 0; i < cfg.world.groupMax; i++) {
    const family = zone.families[rng.weightedIndex(zone.familyWeights)] as FamilyId; // 1 tirada (orden de claves)
    const level = zone.minLevel + Math.floor(rng.next() * (zone.maxLevel - zone.minLevel + 1)); // 1 tirada
    const creature = createWildCreature(rng, cfg.genetics, { id: `w${n}-${i}`, birth: cfg.world.wildBirth, family, pure: cfg.world.wildPure }); // 205
    all.push({ creature, level });
  }
  return all.slice(0, g);
}

/**
 * progresión §2.3 — empieza un encuentro en una zona abierta: n = contadores.encuentros, que se
 * incrementa ya (recargar no repite el encuentro). 622 tiradas del flujo `encuentro|n`.
 */
export function rollEncounter(game: GameState, zoneId: string, cfg: ProgressionConfig): { game: GameState; encounter: Encounter } {
  rule(game.inicial.elegida !== null && game.equipo.length > 0, "primero hay que elegir la inicial");
  const zone = zoneById(zoneId, cfg);
  rule(zoneUnlocked(game, zoneId, cfg), `la zona '${zoneId}' está cerrada`);
  const n = game.contadores.encuentros;
  const wilds = rollWildGroup(streamRng(game, "encuentro", n), zone, n, cfg).map((w): WildEntry => ({ ...w, attempts: 0, state: "libre", ko: false }));
  const encounter: Encounter = { n, zone: zone.id, wilds, team: game.equipo.slice(), companion: companionJoins(game, cfg), outcome: null, teamHp: null };
  return { game: { ...game, contadores: { ...game.contadores, encuentros: n + 1 } }, encounter };
}

/** Bandos del combate: A = tu equipo (+ acompañante al final), B = las salvajes con los movimientos de su nivel. */
export function encounterSides(game: GameState, enc: Encounter, cfg: ProgressionConfig): { A: Combatant[]; B: Combatant[] } {
  const A = enc.team.map((id) => combatantOf(getAnima(game, id), cfg));
  if (enc.companion) A.push(companionCombatant(cfg));
  const B = enc.wilds.map((w) => combatantAtLevel(w.creature, w.level, cfg));
  return { A, B };
}

/** progresión §2.2 — estado inicial del combate (colocación de las salvajes: la de la IA por tamaño). */
export function startEncounterBattle(game: GameState, enc: Encounter, cfg: ProgressionConfig, placementA?: Placement): BattleState {
  const { A, B } = encounterSides(game, enc, cfg);
  return createBattle(A, B, cfg.battle, placementA);
}
/** progresión §2.3 — RNG del combate: flujo `combate|n`. */
export function encounterBattleRng(game: GameState, enc: Encounter): Rng {
  return streamRng(game, "combate", enc.n);
}

/** Juega el combate entero con IA en los dos bandos (simuladores, tests y la "partida" dorada). */
export function playEncounterBattle(
  game: GameState,
  enc: Encounter,
  cfg: ProgressionConfig,
  playerAi: Ai = createReferenceAi(),
  placementA?: Placement,
): { final: BattleState; log: (readonly BattleEvent[])[]; hash: string } {
  let state = startEncounterBattle(game, enc, cfg, placementA);
  const rng = encounterBattleRng(game, enc);
  const foe = wildAi(cfg);
  const log: (readonly BattleEvent[])[] = [];
  while (state.result === null) {
    const r = resolveTurn(state, playerAi(state, "A", cfg.battle) as Plan, foe(state, "B", cfg.battle), rng, cfg.battle);
    log.push(r.events);
    state = r.state;
  }
  return { final: state, log, hash: battleHash(log) };
}

// ---------------------------------------------------------------- experiencia y niveles (§4)

/** Lo que pasó a un ánima al ganar experiencia (para la pantalla de después del combate). */
export interface AnimaProgress {
  readonly id: string;
  readonly xpGained: number;
  readonly levelBefore: number;
  readonly levelAfter: number;
  /** Loci de los huecos que se abren. */
  readonly newSlots: readonly LocusId[];
  readonly matured: boolean;
  /** Posiciones de ocultos que se revelan. */
  readonly revealed: readonly string[];
  /** Niveles de variante alcanzados (la oferta: `pendingVariants`). */
  readonly variantLevels: readonly number[];
}

/** progresión §4.1–4.4 — suma experiencia (tope: la del nivel máximo), abre huecos y revela ocultos. */
export function gainXp(a: Anima, amount: number, cfg: ProgressionConfig): { anima: Anima; progress: AnimaProgress } {
  rule(Number.isInteger(amount) && amount >= 0, `experiencia inválida ${amount}`);
  const before = levelOf(a.xp, cfg);
  const xp = Math.min(a.xp + amount, xpForLevel(cfg.levels.max, cfg)); // §4.1: lo que pasa del tope se descarta
  const after = levelOf(xp, cfg);
  const huecos = openSlots(a.huecos, after, cfg);
  const newSlots: LocusId[] = [];
  huecos.forEach((s, k) => {
    if (s !== null && a.huecos[k] === null && s.fuente === "gen") newSlots.push(s.locus);
  });
  const revealed = revealedByLevel(after, cfg).filter((p) => !a.revelados.includes(p));
  const anima: Anima = { ...a, xp, huecos, revelados: [...a.revelados, ...revealed] };
  return {
    anima,
    progress: {
      id: a.id,
      xpGained: xp - a.xp,
      levelBefore: before,
      levelAfter: after,
      newSlots,
      matured: !isMature(before, cfg) && isMature(after, cfg),
      revealed,
      variantLevels: cfg.variants.levels.filter((L) => L > before && L <= after),
    },
  };
}

/** progresión §4.2 — experiencia de una salvaje apagada: base + por_nivel · nivel. */
export function wildXp(level: number, cfg: ProgressionConfig): number {
  return cfg.xp.base + cfg.xp.perLevel * level;
}
/** progresión §5.2 — esencia de una salvaje apagada en victoria: base + floor(nivel / divisor). */
export function wildEssence(level: number, cfg: ProgressionConfig): number {
  return cfg.resources.essencePerWildBase + Math.floor(level / cfg.resources.essencePerWildDivisor);
}

export interface BattleReport {
  readonly outcome: "victoria" | "derrota" | "huida";
  readonly xpEach: number;
  readonly essence: number;
  readonly lanterns: number;
  readonly progress: readonly AnimaProgress[];
}

/**
 * progresión §2.2, §3.3, §4.2, §5.2 — aplica el final del combate. `end` = estado final del
 * combate, o "huida" (también cerrar a mitad). Victoria: cada ánima de tu equipo (también las
 * apagadas; nunca el acompañante) recibe la suma entera; derrota: floor(suma de las apagadas /
 * divisor_derrota); huida: 0. El empate (límite de turnos) cuenta como derrota (ver notas).
 * Victoria: +faroles_por_victoria y esencia por salvaje (con topes). Sin tiradas.
 */
export function applyBattleResult(game: GameState, enc: Encounter, end: BattleState | "huida", cfg: ProgressionConfig): { game: GameState; encounter: Encounter; report: BattleReport } {
  rule(enc.outcome === null, "el combate de este encuentro ya terminó");
  let outcome: "victoria" | "derrota" | "huida";
  let wilds = enc.wilds;
  let teamHp: { sv: number; sm: number } | null = null;
  if (end === "huida") outcome = "huida";
  else {
    rule(end.result !== null, "el combate no ha terminado");
    outcome = end.result === "A" ? "victoria" : "derrota";
    const koOf = (id: string): boolean => {
      const i = end.teams[1].findIndex((c) => c !== null && c.id === id);
      return i >= 0 && (end.fighters[1][i] as { ko: boolean }).ko;
    };
    wilds = enc.wilds.map((w) => ({ ...w, ko: koOf(w.creature.id) }));
    // §3.2: SV y SM de TU equipo al acabar (apagadas cuentan 0; sin el acompañante)
    let sv = 0;
    let sm = 0;
    end.teams[0].forEach((c, i) => {
      if (c === null || !enc.team.includes(c.id)) return;
      const f = end.fighters[0][i] as { hp: number; ko: boolean };
      sv += f.ko ? 0 : f.hp;
      sm += c.maxHp;
    });
    teamHp = { sv, sm };
  }
  let sum = 0;
  let essence = 0;
  for (const w of wilds) if (w.ko) {
    sum += wildXp(w.level, cfg);
    essence += wildEssence(w.level, cfg);
  }
  const xpEach = outcome === "victoria" ? sum : outcome === "derrota" ? Math.floor(sum / cfg.xp.defeatDivisor) : 0;
  const win = outcome === "victoria";
  const progress: AnimaProgress[] = [];
  let g: GameState = game;
  for (const id of enc.team) {
    const a = findAnima(g, id);
    if (a === undefined) continue;
    const r = gainXp(a, xpEach, cfg);
    progress.push(r.progress);
    g = withSeen(replaceAnima(g, r.anima), r.anima);
    g = { ...g, nivel_max_alcanzado: Math.max(g.nivel_max_alcanzado, r.progress.levelAfter) };
  }
  const lanterns = win ? Math.min(cfg.resources.lanternsMax, g.recursos.faroles + cfg.resources.lanternsPerWin) - g.recursos.faroles : 0;
  const ess = win ? Math.min(cfg.resources.essenceMax, g.recursos.esencia + essence) - g.recursos.esencia : 0;
  g = {
    ...g,
    recursos: { faroles: g.recursos.faroles + lanterns, esencia: g.recursos.esencia + ess },
    registro: { ...g.registro, combates: g.registro.combates + (outcome === "huida" ? 0 : 1), victorias: g.registro.victorias + (win ? 1 : 0) },
  };
  return { game: g, encounter: { ...enc, wilds, outcome, teamHp }, report: { outcome, xpEach, essence: ess, lanterns, progress } };
}

// ---------------------------------------------------------------- atrapar (§3)

/** Nivel máximo de tus ánimas del equipo del encuentro (sin el acompañante, QA B-16), con su nivel actual. */
function teamTopLevel(game: GameState, enc: Encounter, cfg: ProgressionConfig): number {
  let top = 0;
  for (const id of enc.team) {
    const a = findAnima(game, id);
    if (a) top = Math.max(top, levelOf(a.xp, cfg));
  }
  return top;
}

/**
 * progresión §3.2 (QA B-07) — % entero de atrapar (el que se muestra y el que se usa):
 * pct1 = clamp(base + floor(bono_vida·SV/SM) − penal_nivel·dn − floor(penal_pureza·(c100 − c100_min)/c100_rango), pct_min, pct_max);
 * pct2 = min(pct_max, pct1 + bono_reintento).
 */
export function catchPercent(sv: number, sm: number, wildLevel: number, teamLevel: number, wild: Creature, attempt: number, cfg: ProgressionConfig): number {
  const k = cfg.catching;
  const dn = Math.max(0, wildLevel - teamLevel);
  const c100 = Math.round(creatureQuality(wild) * 100);
  const life = sm > 0 ? Math.floor((k.lifeBonusPct * sv) / sm) : 0;
  const pct1 = Math.min(k.pctMax, Math.max(k.pctMin, k.basePct + life - k.levelPenaltyPct * dn - Math.floor((k.purityPenaltyPct * (c100 - k.c100Min)) / k.c100Range)));
  return attempt === 0 ? pct1 : Math.min(k.pctMax, pct1 + k.retryBonusPct);
}

/** Motivo por el que no se puede lanzar un farol a la salvaje `i`, o null. Sin tiradas. */
export function catchBlocker(game: GameState, enc: Encounter, i: number, cfg: ProgressionConfig): string | null {
  if (enc.outcome !== "victoria" || enc.teamHp === null) return "solo se atrapa tras una victoria";
  const w = enc.wilds[i];
  if (!Number.isInteger(i) || w === undefined) return `salvaje ${i} inválida`;
  if (w.state !== "libre") return `la salvaje ya está ${w.state}`;
  if (w.attempts >= cfg.catching.maxAttempts) return "sin intentos";
  if (game.recursos.faroles <= 0) return "no quedan faroles";
  if (game.animas.length >= cfg.collection.max) return "la colección está llena";
  return null;
}

/** progresión §3.2 — % del próximo farol a la salvaje `i` (null si no se puede lanzar). */
export function catchChance(game: GameState, enc: Encounter, i: number, cfg: ProgressionConfig): number | null {
  if (catchBlocker(game, enc, i, cfg) !== null) return null;
  const w = enc.wilds[i] as WildEntry;
  const hp = enc.teamHp as { sv: number; sm: number };
  return catchPercent(hp.sv, hp.sm, w.level, teamTopLevel(game, enc, cfg), w.creature, w.attempts, cfg);
}

export interface ThrowResult {
  readonly game: GameState;
  readonly encounter: Encounter;
  readonly pct: number;
  /** floor(u·100), la tirada. */
  readonly roll: number;
  readonly caught: boolean;
  /** Falló el último intento: se va (§3.5). */
  readonly escaped: boolean;
  readonly anima: Anima | null;
}

/**
 * progresión §3 — lanza un farol (1 tirada, flujo `farol|k`, k = contadores.faroles):
 * atrapada si floor(u·100) < pct. Atrapada: nacimiento m = ++nacimientos, id `idAnima(m)`
 * (QA B-04), con su nivel y lo que este desbloquea; las variantes de niveles superados quedan
 * pendientes (QA B-03). Si falla el 2.º farol, se escapa.
 */
export function throwLantern(game: GameState, enc: Encounter, i: number, cfg: ProgressionConfig, name?: string): ThrowResult {
  const why = catchBlocker(game, enc, i, cfg);
  rule(why === null, why ?? "");
  const pct = catchChance(game, enc, i, cfg) as number;
  const w = enc.wilds[i] as WildEntry;
  const k = game.contadores.faroles;
  const roll = Math.floor(streamRng(game, "farol", k).next() * 100);
  const caught = roll < pct;
  let g: GameState = {
    ...game,
    contadores: { ...game.contadores, faroles: k + 1 },
    recursos: { ...game.recursos, faroles: game.recursos.faroles - 1 },
    registro: { ...game.registro, intentos: game.registro.intentos + 1, capturas: game.registro.capturas + (caught ? 1 : 0) },
  };
  let anima: Anima | null = null;
  const attempts = w.attempts + 1;
  let state: WildEntry["state"] = "libre";
  if (caught) {
    const m = g.contadores.nacimientos + 1;
    anima = makeAnima(g, { ...w.creature, id: animaId(m), birth: m }, "captura", enc.zone, w.level, cfg, name);
    g = addAnima({ ...g, contadores: { ...g.contadores, nacimientos: m } }, anima, cfg);
    state = "atrapada";
  } else if (attempts >= cfg.catching.maxAttempts) state = "escapada";
  const wilds = enc.wilds.map((x, j) => (j === i ? { ...x, attempts, state } : x));
  return { game: g, encounter: { ...enc, wilds }, pct, roll, caught, escaped: state === "escapada", anima };
}

// ---------------------------------------------------------------- resonancia (§5)

/** progresión §5.2 — coste = base + por_eco_previo · (ecos previos de A + de B). */
export function resonanceCost(a: Anima, b: Anima, cfg: ProgressionConfig): number {
  return cfg.resonance.baseCost + cfg.resonance.costPerEcho * (a.criatura.offspringCount + b.criatura.offspringCount);
}

/** progresión §5.1 — motivo por el que no pueden resonar, o null. Sin tiradas. */
export function canResonate(game: GameState, idA: string, idB: string, cfg: ProgressionConfig): string | null {
  if (idA === idB) return "hacen falta dos ánimas distintas";
  const a = findAnima(game, idA);
  const b = findAnima(game, idB);
  if (!a || !b) return "ánima desconocida";
  for (const x of [a, b]) {
    if (!isMature(levelOf(x.xp, cfg), cfg)) return `${x.nombre} aún no ha madurado (nivel ${cfg.unlocks.matureLevel})`;
    if (x.criatura.offspringCount >= cfg.genetics.limits.maxOffspring) return `${x.nombre} ya tiene ${cfg.genetics.limits.maxOffspring} ecos`;
  }
  if (game.animas.length >= cfg.collection.max) return "la colección está llena";
  const cost = resonanceCost(a, b, cfg);
  if (game.recursos.esencia < cost) return `falta esencia (${game.recursos.esencia} de ${cost})`;
  return null;
}

/** progresión §5.4 — probabilidad de cada origen del D del eco por zona del cuerpo (de pesos_D y mutación de GEN). */
export function resonanceOdds(cfg: ProgressionConfig): { readonly fromA: number; readonly fromB: number; readonly surprise: number } {
  const w = cfg.genetics.inheritance.weightsD;
  const pm = cfg.genetics.mutation.probPerLocus;
  const total = 2 * (w.D + w.R1 + w.R2);
  const d = ((1 - pm) * w.D) / total;
  return { fromA: d, fromB: d, surprise: 1 - 2 * d };
}

/** Origen del D del eco en un locus (§5.4): de qué padre y de qué posición, o mutación. */
export interface EchoOrigin {
  readonly locus: LocusId;
  readonly parentId: string | null;
  readonly slot: "D" | "R1" | "R2" | null;
  readonly mutated: boolean;
}

export interface ResonanceResult {
  readonly game: GameState;
  readonly echo: Anima;
  readonly cost: number;
  readonly origins: readonly EchoOrigin[];
  readonly breed: BreedResult;
}

/**
 * progresión §5.3 — resonar: n = nacimientos + 1; rng = flujo `resonancia|r`
 * (r = contadores.resonancias); `breed` (280 tiradas); eco a nivel 1 con huecos por defecto y sin
 * variantes; los padres suman un eco; se revela en el padre de origen cada R1/R2 que pase a D
 * del eco; Codex con los D del eco y las mutaciones nuevas ("descubierta por ti").
 */
export function resonate(game: GameState, idA: string, idB: string, cfg: ProgressionConfig, name?: string): ResonanceResult {
  const why = canResonate(game, idA, idB, cfg);
  rule(why === null, why ?? "");
  const A = getAnima(game, idA);
  const B = getAnima(game, idB);
  const cost = resonanceCost(A, B, cfg);
  const n = game.contadores.nacimientos + 1;
  const r = game.contadores.resonancias;
  const res = breed(A.criatura, B.criatura, streamRng(game, "resonancia", r), cfg.genetics, { id: animaId(n), birth: n });
  let g: GameState = {
    ...game,
    contadores: { ...game.contadores, resonancias: r + 1, nacimientos: n },
    recursos: { ...game.recursos, esencia: game.recursos.esencia - cost },
    registro: { ...game.registro, resonancias: game.registro.resonancias + 1 },
  };
  // breed ordena los padres por id: slots 0..2 = el de id menor, 3..5 = el otro
  const [lo, hi] = A.id < B.id ? [A, B] : [B, A];
  const reveal = new Map<string, string[]>([[lo.id, []], [hi.id, []]]);
  const origins: EchoOrigin[] = res.trace.map((t) => {
    if (t.mutated) return { locus: t.locus, parentId: null, slot: null, mutated: true };
    const parent = t.dSlot < 3 ? lo : hi;
    const slot = (["D", "R1", "R2"] as const)[t.dSlot % 3] as "D" | "R1" | "R2";
    if (slot !== "D") (reveal.get(parent.id) as string[]).push(`${t.locus}.${slot}`);
    return { locus: t.locus, parentId: parent.id, slot, mutated: false };
  });
  for (const [x, crias] of [[A, res.parent1.offspringCount], [B, res.parent2.offspringCount]] as const) {
    const cur = getAnima(g, x.id);
    const updated: Anima = { ...cur, criatura: { ...cur.criatura, offspringCount: crias }, revelados: addUnique(cur.revelados, reveal.get(x.id) ?? []) };
    g = withSeen(replaceAnima(g, updated), updated);
  }
  const echo = makeAnima(g, res.child, "eco", null, cfg.levels.echoLevel, cfg, name);
  g = addAnima(g, echo, cfg);
  const muts = res.mutations.filter((m) => !m.matchesCatalog && !g.codex.mutaciones.some((x) => x.clave === m.key));
  if (muts.length > 0) {
    g = { ...g, codex: { ...g.codex, mutaciones: [...g.codex.mutaciones, ...muts.map((m) => ({ clave: m.key, id: m.geneId, resonancia: r + 1, animaId: echo.id }))] } };
  }
  return { game: g, echo, cost, origins, breed: res };
}

// ---------------------------------------------------------------- colección (§6)

/** progresión §6.2 (QA B-06) — esencia de liberar: 0 por debajo de nivel_minimo; si no, base + floor(nivel / divisor). */
export function releaseEssence(a: Anima, cfg: ProgressionConfig): number {
  const r = cfg.collection.release;
  const L = levelOf(a.xp, cfg);
  return L < r.minLevel ? 0 : r.essenceBase + Math.floor(L / r.levelDivisor);
}
export function releaseBlocker(game: GameState, id: string, cfg: ProgressionConfig): string | null {
  if (!cfg.collection.release.active) return "liberar está desactivado";
  if (!findAnima(game, id)) return "ánima desconocida";
  if (game.animas.length <= 1) return "no se puede liberar la última ánima";
  if (game.equipo.includes(id)) return "no se puede liberar un ánima del equipo";
  return null;
}
/** progresión §6.2 — libera (irreversible). Si es madre/padre de otra, queda su ficha mínima en `linaje`. */
export function release(game: GameState, id: string, cfg: ProgressionConfig): { game: GameState; essence: number } {
  const why = releaseBlocker(game, id, cfg);
  rule(why === null, why ?? "");
  const a = getAnima(game, id);
  const animas = game.animas.filter((x) => x.id !== id);
  const isParent = animas.some((x) => x.criatura.parents !== null && x.criatura.parents.includes(id));
  const linaje = isParent && !game.linaje.some((l) => l.id === id)
    ? [...game.linaje, { id, nombre: a.nombre, familia: a.criatura.family, genesD: LOCUS_IDS.map((L) => geneKey(a.criatura.genome[L].D)) }]
    : game.linaje;
  const essence = Math.min(cfg.resources.essenceMax, game.recursos.esencia + releaseEssence(a, cfg)) - game.recursos.esencia;
  return { game: { ...game, animas, linaje, recursos: { ...game.recursos, esencia: game.recursos.esencia + essence } }, essence };
}

/** progresión §6.1 — equipo de equipo_min a equipo_max ánimas de la colección, sin repetir, en orden. */
export function setTeam(game: GameState, ids: readonly string[], cfg: ProgressionConfig): GameState {
  rule(Array.isArray(ids) && ids.length >= cfg.collection.teamMin && ids.length <= cfg.collection.teamMax, `el equipo debe tener de ${cfg.collection.teamMin} a ${cfg.collection.teamMax} ánimas`);
  rule(new Set(ids).size === ids.length, "ánima repetida en el equipo");
  for (const id of ids) getAnima(game, id);
  return { ...game, equipo: ids.slice() };
}
export function rename(game: GameState, id: string, name: string, cfg: ProgressionConfig): GameState {
  return replaceAnima(game, { ...getAnima(game, id), nombre: checkName(name, cfg) });
}

// ---------------------------------------------------------------- variantes (§4.5, §8)

/** Ofertas de variante pendientes de un ánima de la partida. */
export function animaPendingVariants(game: GameState, id: string, cfg: ProgressionConfig): VariantOffer[] {
  return pendingVariants(getAnima(game, id), cfg);
}

/**
 * progresión §4.5 — elección definitiva de la variante del nivel `level` ("A" o "B"). Se guarda
 * `{nivel, eje, pieza}` y el hueco de ese locus pasa a usar la variante (se puede volver al
 * original con `toggleVariant`).
 */
export function chooseVariant(game: GameState, id: string, level: number, pick: "A" | "B", cfg: ProgressionConfig): GameState {
  const a = getAnima(game, id);
  const offer = pendingVariants(a, cfg).find((o) => o.level === level);
  rule(offer !== undefined, `no hay variante pendiente de nivel ${level}`);
  const o = offer as VariantOffer;
  const c = pick === "A" ? o.A : pick === "B" ? o.B : null;
  rule(c !== null, `la opción ${pick} no existe`);
  const ch = (c as NonNullable<typeof c>).change;
  const chosen: ChosenVariant = { nivel: level, eje: ch.eje, pieza: ch.pieza };
  const huecos = a.huecos.map((s): MoveSlot => (s !== null && s.fuente === "gen" && s.locus === o.locus ? { ...s, variante: true } : s)) as unknown as MoveSlots;
  return replaceAnima(game, { ...a, variantes: { ...a.variantes, [o.locus]: chosen }, huecos });
}

/** progresión §4.5 / §8.1 — cambia el hueco `slot` (0–3) entre el movimiento original y su variante elegida. */
export function toggleVariant(game: GameState, id: string, slot: number, cfg: ProgressionConfig): GameState {
  void cfg;
  const a = getAnima(game, id);
  const s = a.huecos[slot];
  rule(Number.isInteger(slot) && s !== undefined && s !== null && s.fuente === "gen", `hueco ${slot} sin movimiento de gen`);
  const g = s as Extract<MoveSlot, { fuente: "gen" }>;
  rule(a.variantes[g.locus] !== undefined, "ese movimiento no tiene variante elegida");
  const huecos = a.huecos.map((x, k) => (k === slot ? { ...g, variante: !g.variante } : x)) as unknown as MoveSlots;
  return replaceAnima(game, { ...a, huecos });
}

/** Lado del jugador en los encuentros (para quien use `resolveTurn` directamente). */
export const PLAYER_SIDE: SideId = "A";
