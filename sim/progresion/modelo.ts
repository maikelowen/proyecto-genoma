/**
 * Jugador modelo de la progresión v0.1 (docs/spec/progresion-v0.1.md §9.1) con combate real del núcleo.
 * `playGame` juega una partida completa y devuelve sus registros; no hay azar propio: todo sale de la semilla de la partida.
 */
import { readFileSync } from "node:fs";
import rawGenetics from "../../config/genetica.v0.2.json" with { type: "json" };
import rawCombat from "../../config/combate.v0.5.json" with { type: "json" };
import rawMoves from "../../config/movimientos.v0.5.json" with { type: "json" };
import {
  animaLevel, animaPendingVariants, applyBattleResult, canResonate, catchBlocker, chooseStarter, chooseVariant, creatureQuality,
  newGame, parseCombatConfig, parseGeneticsConfig, parseMovesConfig, parseProgressionConfig, playEncounterBattle, release,
  releaseBlocker, releaseEssence, resonanceCost, resonate, rollEncounter, setTeam, throwLantern, zoneUnlocked,
  type Anima, type Encounter, type GameState, type ProgressionConfig,
} from "../../packages/core/src/index.ts";

export const PROG_PATH = "config/progresion.v0.1.json";
export function loadCfg(path: string = PROG_PATH): { cfg: ProgressionConfig; raw: any } {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  const g = parseGeneticsConfig(structuredClone(rawGenetics));
  const battle = { combat: parseCombatConfig(structuredClone(rawCombat) as any), moves: parseMovesConfig(structuredClone(rawMoves) as any, g) };
  return { cfg: parseProgressionConfig(raw, battle), raw };
}

export const PROFILES = ["normal", "cuidadoso", "impaciente", "cuidador", "liberador"] as const;
export type Profile = (typeof PROFILES)[number];
/** Descripción corta de cada perfil (va al informe). */
export const PROFILE_DOC: Record<Profile, string> = {
  normal: "modelo de la spec §9.1: equipo = 3 de más nivel; zona abierta más alta; faroles a la más pura, 2 por salvaje y varias salvajes solo con ≥ 6 faroles; resuena mientras pueda; variante A",
  cuidadoso: "como normal, pero solo sube de zona cuando el nivel medio del equipo ≥ nivel máx. de la zona − 2; elige la variante B si existe",
  impaciente: "zona más alta siempre; 1 farol por salvaje (sin reintento); resuena mientras pueda",
  cuidador: "variante «cuidador» de la spec: el eco más reciente ocupa el 3.er puesto del equipo",
  liberador: "como normal, y tras cada combate libera toda ánima madura (las inmaduras no dan esencia) que no esté en el equipo ni entre las 6 mejores candidatas a resonar (spec §9.1 «Liberar»)",
};

export const SESSION_COMBATS = 6;
export const CHECKPOINTS = [6, 12, 18] as const;

export interface Snapshot { readonly res: number; readonly favLevel: number; readonly coll: number; readonly essence: number; readonly lanterns: number; readonly minutes: number }
export interface GameResult {
  readonly seed: string;
  readonly profile: Profile;
  readonly starter: number;
  /** Por combate: zona (0..2), tamaño de tu equipo sin acompañante, salvajes, resultado (0 victoria, 1 derrota, 2 empate), turnos, dn (nivel máx. salvaje − nivel máx. equipo, puede ser < 0). */
  readonly z: number[]; readonly tn: number[]; readonly wn: number[]; readonly out: number[]; readonly turns: number[]; readonly dn: number[];
  readonly snaps: Snapshot[];
  /** Combate (1-based) en que el favorito llegó a nivel 30, o null (censurado al tope). */
  readonly c30: number | null;
  readonly combats: number;
  readonly firstZone: [number, number];
  /** Atrapar: [intentos 1.º, aciertos 1.º, intentos 2.º, aciertos 2.º, salvajes sin farol para intentarlas]. */
  readonly catchStats: [number, number, number, number, number];
  /** Salvajes derrotadas en victoria y salvajes a las que se lanzó al menos 1 farol. */
  readonly wilds: [number, number];
  readonly lanternsMin: number;
  readonly combatsNoLanterns: number;
  readonly blocked: number;
  readonly resMoments: number;
  readonly essence: { start: number; combat: number; release: number; spent: number };
  readonly full: boolean;
  readonly hash: string;
}

const levelsOf = (g: GameState, cfg: ProgressionConfig): { a: Anima; l: number }[] => g.animas.map((a) => ({ a, l: animaLevel(a, cfg) }));
const favLevel = (g: GameState, cfg: ProgressionConfig): number => levelsOf(g, cfg).reduce((m, x) => Math.max(m, x.l), 0);

function pickTeam(g: GameState, cfg: ProgressionConfig, profile: Profile): GameState {
  const ls = levelsOf(g, cfg).sort((x, y) => y.l - x.l || x.a.nacimiento - y.a.nacimiento);
  let ids = ls.slice(0, 3).map((x) => x.a.id);
  if (profile === "cuidador") {
    const echo = g.animas.filter((a) => a.origen === "eco").sort((x, y) => y.nacimiento - x.nacimiento)[0];
    if (echo && ids.length >= 3 && !ids.includes(echo.id)) ids = [ids[0]!, ids[1]!, echo.id];
  }
  return setTeam(g, ids, cfg);
}

function pickVariants(g: GameState, cfg: ProgressionConfig, profile: Profile): GameState {
  let out = g;
  for (const id of g.equipo) {
    for (const o of animaPendingVariants(out, id, cfg)) out = chooseVariant(out, id, o.level, profile === "cuidadoso" && o.B !== null ? "B" : "A", cfg);
  }
  return out;
}

function pickZone(g: GameState, cfg: ProgressionConfig, profile: Profile): number {
  let best = 0;
  cfg.world.zones.forEach((z, i) => {
    if (!zoneUnlocked(g, z.id, cfg)) return;
    if (profile === "cuidadoso") {
      const ls = g.equipo.map((id) => animaLevel(g.animas.find((a) => a.id === id)!, cfg));
      const mean = ls.reduce((s, x) => s + x, 0) / ls.length;
      if (i > 0 && mean < z.maxLevel - 2) return;
    }
    best = i;
  });
  return best;
}

/** Candidatas a resonar: maduras con ecos libres, por menos ecos y luego más nivel. */
function parents(g: GameState, cfg: ProgressionConfig): Anima[] {
  return g.animas
    .filter((a) => animaLevel(a, cfg) >= cfg.unlocks.matureLevel && a.criatura.offspringCount < cfg.genetics.limits.maxOffspring)
    .sort((x, y) => x.criatura.offspringCount - y.criatura.offspringCount || animaLevel(y, cfg) - animaLevel(x, cfg) || x.nacimiento - y.nacimiento);
}

export function playGame(seed: string, profile: Profile, starter: number, maxCombats: number, minCombats: number, cfg: ProgressionConfig, secRes = 40): GameResult {
  let g = chooseStarter(newGame(seed, cfg), starter, cfg);
  const R: GameResult = {
    seed, profile, starter, z: [], tn: [], wn: [], out: [], turns: [], dn: [], snaps: [], c30: null, combats: 0, firstZone: [0, 0],
    catchStats: [0, 0, 0, 0, 0], wilds: [0, 0], lanternsMin: g.recursos.faroles, combatsNoLanterns: 0, blocked: 0, resMoments: 0,
    essence: { start: g.recursos.esencia, combat: 0, release: 0, spent: 0 }, full: false, hash: "",
  } as unknown as GameResult;
  const mut = R as { -readonly [K in keyof GameResult]: GameResult[K] };
  let minutes = 0;
  let sessionStart = 0;
  for (let c = 1; c <= maxCombats; c++) {
    // D-072/N-03: con menos de 3 en el equipo el núcleo mete solo las capturas; el modelo elige equipo solo con el equipo lleno
    if (g.equipo.length >= cfg.collection.teamMax) g = pickTeam(g, cfg, profile);
    g = pickVariants(g, cfg, profile);
    const zi = pickZone(g, cfg, profile);
    if (zi >= 1 && mut.firstZone[0] === 0) mut.firstZone[0] = c;
    if (zi >= 2 && mut.firstZone[1] === 0) mut.firstZone[1] = c;
    if (g.recursos.faroles === 0) mut.combatsNoLanterns++;
    const zone = cfg.world.zones[zi]!;
    const r0 = rollEncounter(g, zone.id, cfg);
    g = r0.game;
    let enc: Encounter = r0.encounter;
    const teamTop = Math.max(...enc.team.map((id) => animaLevel(g.animas.find((a) => a.id === id)!, cfg)));
    const bat = playEncounterBattle(g, enc, cfg);
    const ar = applyBattleResult(g, enc, bat.final, cfg);
    g = ar.game;
    enc = ar.encounter;
    mut.essence.combat += ar.report.essence;
    const win = ar.report.outcome === "victoria";
    mut.z.push(zi); mut.tn.push(enc.team.length); mut.wn.push(enc.wilds.length);
    mut.out.push(win ? 0 : bat.final.result === "empate" ? 2 : 1);
    mut.turns.push(bat.final.turn);
    mut.dn.push(Math.max(...enc.wilds.map((w) => w.level)) - teamTop);
    minutes += bat.final.turn * 10 + 30;
    if (win) {
      const order = enc.wilds.map((w, i) => ({ i, q: creatureQuality(w.creature), l: w.level })).sort((x, y) => y.q - x.q || y.l - x.l);
      let first = true;
      mut.wilds[0] += enc.wilds.length;
      for (const { i } of order) {
        if (!first && g.recursos.faroles < 6) break;
        first = false;
        const tries0 = mut.catchStats[0];
        const maxTries = profile === "impaciente" ? 1 : cfg.catching.maxAttempts;
        for (let t = 0; t < maxTries; t++) {
          if (catchBlocker(g, enc, i, cfg) !== null) { if (t === 0 && g.recursos.faroles <= 0) mut.catchStats[4]++; break; }
          const th = throwLantern(g, enc, i, cfg);
          g = th.game; enc = th.encounter;
          const s = mut.catchStats;
          if (t === 0) { s[0]++; if (th.caught) s[1]++; } else { s[2]++; if (th.caught) s[3]++; }
          if (th.caught) break;
        }
        if (mut.catchStats[0] > tries0) mut.wilds[1]++;
        mut.lanternsMin = Math.min(mut.lanternsMin, g.recursos.faroles);
      }
    }
    mut.lanternsMin = Math.min(mut.lanternsMin, g.recursos.faroles);
    // resonar mientras pueda
    for (;;) {
      const p = parents(g, cfg);
      if (p.length < 2) break;
      if (canResonate(g, p[0]!.id, p[1]!.id, cfg) !== null) {
        if (g.animas.length < cfg.collection.max && g.recursos.esencia < resonanceCost(p[0]!, p[1]!, cfg)) mut.blocked++;
        break;
      }
      const before = g.recursos.esencia;
      g = resonate(g, p[0]!.id, p[1]!.id, cfg).game;
      mut.essence.spent += before - g.recursos.esencia;
      minutes += secRes;
    }
    mut.resMoments++;
    if (profile === "liberador") {
      const keep = new Set([...g.equipo, ...parents(g, cfg).slice(0, 6).map((a) => a.id)]);
      for (const a of g.animas.slice()) {
        if (keep.has(a.id) || animaLevel(a, cfg) < cfg.unlocks.matureLevel || releaseBlocker(g, a.id, cfg) !== null) continue;
        const e = releaseEssence(a, cfg);
        g = release(g, a.id, cfg).game;
        mut.essence.release += e;
      }
    }
    const fav = favLevel(g, cfg);
    if (mut.c30 === null && fav >= cfg.levels.max) mut.c30 = c;
    if ((CHECKPOINTS as readonly number[]).includes(c)) {
      mut.snaps.push({ res: g.registro.resonancias, favLevel: fav, coll: g.animas.length, essence: g.recursos.esencia, lanterns: g.recursos.faroles, minutes: minutes - sessionStart });
    }
    if (c % SESSION_COMBATS === 0) sessionStart = minutes;
    mut.combats = c;
    if (g.animas.length >= cfg.collection.max) mut.full = true;
    if (c >= minCombats && mut.c30 !== null) break;
  }
  mut.hash = (g.contadores.encuentros + ":" + g.contadores.nacimientos + ":" + g.recursos.esencia + ":" + g.recursos.faroles + ":" + g.registro.resonancias + ":" + g.animas.length);
  return R;
}
