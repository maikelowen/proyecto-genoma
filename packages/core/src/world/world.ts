/**
 * Estado del mundo caminable, paso, interacción y ruta (spec mundo v0.1 §2–§4).
 * Funciones puras: devuelven estados nuevos. Único azar: `createRng(semilla|paso|k)` (1 tirada por paso de hierba).
 */
import { cyrb128, createRng } from "../rng.ts";
import type { ProgressionConfig } from "../progression/config.ts";
import { GameRuleError, rollEncounter, zoneUnlocked, type Encounter, type GameState } from "../progression/game.ts";
import { mapById, type Activator, type Dir, type MapDef, type Tile, type WorldConfig, type WorldEntity } from "./config.ts";

export interface WorldState {
  readonly formato: string;
  readonly version: number;
  /** Semilla de la partida de progresión: enlaza las dos claves de guardado (§5.1). */
  readonly semilla: string;
  readonly config: { readonly mundo: string };
  readonly mapa: string;
  readonly pos: { readonly x: number; readonly y: number };
  readonly mira: Dir;
  readonly contadores: { readonly pasos_hierba: number; readonly pasos_totales: number };
  readonly gracia_restante: number;
  readonly pasos_sin_encuentro: number;
  readonly recogidos: readonly string[];
  readonly charlas: Readonly<Record<string, number>>;
}

export function worldHash(world: WorldState): string {
  return cyrb128(JSON.stringify(world)).map((w) => w.toString(16).padStart(8, "0")).join("");
}

/** mundo §5.2 — mundo nuevo: en `inicio`, contadores a 0, gracia de salir del santuario, nada recogido. El mapa inicial es el primero de la config. */
export function newWorld(game: Pick<GameState, "semilla">, wcfg: WorldConfig): WorldState {
  const map = wcfg.maps[0] as MapDef;
  return {
    formato: wcfg.save.format,
    version: wcfg.save.formatVersion,
    semilla: game.semilla,
    config: { mundo: wcfg.version },
    mapa: map.id,
    pos: { x: map.start.x, y: map.start.y },
    mira: map.start.facing,
    contadores: { pasos_hierba: 0, pasos_totales: 0 },
    gracia_restante: wcfg.encounters.graceLeavingSanctuary,
    pasos_sin_encuentro: 0,
    recogidos: [],
    charlas: {},
  };
}

// ---------------------------------------------------------------- consultas

/** Entidades presentes ahora (un objeto recogido desaparece). */
export function activeEntities(world: WorldState, wcfg: WorldConfig): readonly WorldEntity[] {
  return mapById(wcfg, world.mapa).entities.filter((e) => !(e.kind === "objeto" && world.recogidos.includes(e.id)));
}
export function entityAt(world: WorldState, wcfg: WorldConfig, x: number, y: number): WorldEntity | null {
  return activeEntities(world, wcfg).find((e) => e.x === x && e.y === y) ?? null;
}
export function activatorAt(wcfg: WorldConfig, mapId: string, x: number, y: number): Activator | null {
  return mapById(wcfg, mapId).activators.find((a) => a.x === x && a.y === y) ?? null;
}
/** ¿Está abierta la salida? (`zoneUnlocked` de progresión, §1.5). */
export function exitOpen(game: GameState, a: Activator, prog: ProgressionConfig): boolean {
  return a.kind !== "salida" || a.opensWithZone === null || zoneUnlocked(game, a.opensWithZone, prog);
}
/** Casilla hacia la que mira el jugador, con lo que hay en ella. */
export function facingTarget(world: WorldState, wcfg: WorldConfig): { x: number; y: number; tile: Tile | null; entity: WorldEntity | null; activator: Activator | null } {
  const v = wcfg.movement.vec[world.mira];
  const x = world.pos.x + v.dx;
  const y = world.pos.y + v.dy;
  const map = mapById(wcfg, world.mapa);
  const inside = x >= 0 && y >= 0 && x < map.width && y < map.height;
  return {
    x,
    y,
    tile: inside ? (map.cells[y * map.width + x] as Tile) : null,
    entity: inside ? entityAt(world, wcfg, x, y) : null,
    activator: inside ? activatorAt(wcfg, world.mapa, x, y) : null,
  };
}

// ---------------------------------------------------------------- paso (§2.1, §3)

export type StepOutcome =
  | { readonly kind: "moved"; readonly tile: Tile; readonly error?: string }
  | { readonly kind: "blocked"; readonly reason: "edge" | "solid" | "entity" | "no_starter" | "exit_locked"; readonly text?: string }
  | { readonly kind: "door"; readonly to: string }
  | { readonly kind: "exit"; readonly zones: readonly string[] }
  | { readonly kind: "encounter"; readonly tile: Tile; readonly encounter: Encounter };

function sameSeed(world: WorldState, game: GameState): void {
  if (world.semilla !== game.semilla) throw new GameRuleError("el mundo y la partida tienen semillas distintas");
}

/**
 * mundo §2.1 — un paso. La orientación pasa a `dir` siempre. Orden de comprobación: borde, entidad,
 * activador, no pisable, hierba sin inicial, mover. Bloquear no consume tiradas ni toca contadores.
 */
export function step(world: WorldState, game: GameState, dir: Dir, wcfg: WorldConfig, prog: ProgressionConfig): { world: WorldState; game: GameState; outcome: StepOutcome } {
  sameSeed(world, game);
  const map = mapById(wcfg, world.mapa);
  const turned: WorldState = world.mira === dir ? world : { ...world, mira: dir };
  const v = wcfg.movement.vec[dir];
  const x = world.pos.x + v.dx;
  const y = world.pos.y + v.dy;
  const blocked = (reason: "edge" | "solid" | "entity" | "no_starter" | "exit_locked", text?: string) => ({
    world: turned,
    game,
    outcome: (text === undefined ? { kind: "blocked", reason } : { kind: "blocked", reason, text }) as StepOutcome,
  });
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return blocked("edge"); // 1
  if (entityAt(world, wcfg, x, y) !== null) return blocked("entity"); // 2
  const act = activatorAt(wcfg, world.mapa, x, y);
  if (act !== null) { // 3
    if (act.kind === "puerta") return { world: turned, game, outcome: { kind: "door", to: act.destination } };
    if (!exitOpen(game, act, prog)) return blocked("exit_locked", act.closedText ?? undefined);
    return { world: turned, game, outcome: { kind: "exit", zones: act.zones } };
  }
  const tile = map.cells[y * map.width + x] as Tile;
  if (!tile.walkable) return blocked("solid"); // 4
  if (tile.encounterPct > 0 && game.inicial.elegida === null) return blocked("no_starter"); // 5

  // 6: se mueve
  const moved: WorldState = { ...turned, pos: { x, y }, contadores: { ...world.contadores, pasos_totales: world.contadores.pasos_totales + 1 } };
  if (tile.encounterPct === 0) return { world: moved, game, outcome: { kind: "moved", tile } };
  return grassStep(moved, game, tile, map, wcfg, prog);
}

/** mundo §3.1 — 1 tirada fija por paso de hierba, también en gracia. */
function grassStep(moved: WorldState, game: GameState, tile: Tile, map: MapDef, wcfg: WorldConfig, prog: ProgressionConfig): { world: WorldState; game: GameState; outcome: StepOutcome } {
  const E = wcfg.encounters;
  const k = moved.contadores.pasos_hierba; // valor ANTES de incrementar
  const u = createRng(`${game.semilla}|${E.flow}|${k}`).next();
  const counters = { ...moved.contadores, pasos_hierba: k + 1 };
  if (moved.gracia_restante > 0) {
    // en gracia nunca hay encuentro; pasos_sin_encuentro no cambia
    return { world: { ...moved, contadores: counters, gracia_restante: moved.gracia_restante - 1 }, game, outcome: { kind: "moved", tile } };
  }
  const hit = Math.floor(u * E.scale) < tile.encounterPct || moved.pasos_sin_encuentro + 1 >= E.maxStepsWithoutEncounter;
  if (hit) {
    try {
      const r = rollEncounter(game, map.zone, prog); // progresión §2.3, sin cambios
      const w: WorldState = { ...moved, contadores: counters, gracia_restante: Math.max(moved.gracia_restante, E.graceAfterEncounter), pasos_sin_encuentro: 0 };
      return { world: w, game: r.game, outcome: { kind: "encounter", tile, encounter: r.encounter } };
    } catch (e) {
      // §3.1: si rollEncounter lanza GameRuleError el paso queda hecho sin encuentro
      if (!(e instanceof GameRuleError)) throw e;
      return { world: { ...moved, contadores: counters, pasos_sin_encuentro: moved.pasos_sin_encuentro + 1 }, game, outcome: { kind: "moved", tile, error: e.message } };
    }
  }
  return { world: { ...moved, contadores: counters, pasos_sin_encuentro: moved.pasos_sin_encuentro + 1 }, game, outcome: { kind: "moved", tile } };
}

/** mundo §4.1 — al salir del santuario: `salida_santuario` y gracia (nunca baja la que hubiera). */
export function leaveSanctuary(world: WorldState, wcfg: WorldConfig): WorldState {
  const p = mapById(wcfg, world.mapa).sanctuaryExit;
  return { ...world, pos: { x: p.x, y: p.y }, mira: p.facing, gracia_restante: Math.max(world.gracia_restante, wcfg.encounters.graceLeavingSanctuary) };
}
/** mundo §1.5 — al volver de la lista de zonas: `llegada_desde_lista` y gracia. */
export function returnFromZoneList(world: WorldState, wcfg: WorldConfig): WorldState {
  const p = mapById(wcfg, world.mapa).arrivalFromList;
  return { ...world, pos: { x: p.x, y: p.y }, mira: p.facing, gracia_restante: Math.max(world.gracia_restante, wcfg.encounters.graceReturningFromList) };
}

// ---------------------------------------------------------------- interacción (§1.4, §4.2)

export type InteractOutcome =
  | { readonly kind: "nothing" }
  | { readonly kind: "talk"; readonly id: string; readonly name: string | null; readonly text: readonly string[] }
  | { readonly kind: "sign"; readonly id: string; readonly text: readonly string[] }
  | { readonly kind: "pickup"; readonly id: string; readonly text: readonly string[]; readonly faroles: number }
  | { readonly kind: "pickup_full"; readonly id: string; readonly text: string }
  | { readonly kind: "arnal_intro"; readonly id: string; readonly character: string }
  | { readonly kind: "door"; readonly to: string }
  | { readonly kind: "exit"; readonly zones: readonly string[] }
  | { readonly kind: "exit_locked"; readonly text: string };

/** mundo §6.3 — «usar» sobre la casilla a la que se mira. */
export function interact(world: WorldState, game: GameState, wcfg: WorldConfig, prog: ProgressionConfig): { world: WorldState; game: GameState; outcome: InteractOutcome } {
  sameSeed(world, game);
  const t = facingTarget(world, wcfg);
  const out = (outcome: InteractOutcome, w: WorldState = world, g: GameState = game) => ({ world: w, game: g, outcome });
  if (t.activator !== null) {
    if (t.activator.kind === "puerta") return out({ kind: "door", to: t.activator.destination });
    if (!exitOpen(game, t.activator, prog)) return out({ kind: "exit_locked", text: t.activator.closedText ?? "" });
    return out({ kind: "exit", zones: t.activator.zones });
  }
  const e = t.entity;
  if (e === null) return out({ kind: "nothing" });
  switch (e.kind) {
    case "personaje": {
      // §4.2: la primera vez (sin inicial) la intro; después, texto_despues en ciclo (índice charlas mod nº de textos)
      if (game.inicial.elegida === null) return out({ kind: "arnal_intro", id: e.id, character: e.character });
      const n = world.charlas[e.id] ?? 0;
      const w: WorldState = { ...world, charlas: { ...world.charlas, [e.id]: n + 1 } };
      return out({ kind: "talk", id: e.id, name: null, text: [e.afterTexts[n % e.afterTexts.length] as string] }, w);
    }
    case "vecino":
      return out({ kind: "talk", id: e.id, name: e.name, text: e.texts });
    case "cartel":
      return out({ kind: "sign", id: e.id, text: e.texts });
    case "objeto": {
      // §1.4: una vez por partida; con el tope de faroles no se recoge y queda ahí
      const max = prog.resources.lanternsMax;
      if (game.recursos.faroles >= max) return out({ kind: "pickup_full", id: e.id, text: e.fullText });
      const gained = Math.min(e.gives.faroles, max - game.recursos.faroles);
      const g: GameState = { ...game, recursos: { ...game.recursos, faroles: game.recursos.faroles + gained } };
      const w: WorldState = { ...world, recogidos: [...world.recogidos, e.id] };
      return out({ kind: "pickup", id: e.id, text: e.texts, faroles: gained }, w, g);
    }
  }
}

// ---------------------------------------------------------------- ruta táctil (§2.4)

/**
 * mundo §2.4 — Dijkstra con coste entero por casilla de entrada (`coste_ruta`). Desempate: menor coste,
 * menos pasos, y después el orden de inserción (que sigue `orden_direcciones` al expandir). Determinista.
 * - Destino pisable libre: ruta hasta él (sin inicial elegida la hierba alta cuenta como cerrada, como en `step`).
 * - Destino entidad o activador: ruta a la vecina pisable de menor coste (desempate por `orden_direcciones`),
 *   más un último giro hacia el destino si hace falta. Ese último `step` queda bloqueado (entidad) o dispara
 *   el evento (puerta/salida): el cliente ejecuta «usar» al llegar.
 * - Sin ruta o más de `ruta_max_pasos` → `null`.
 */
export function planRoute(world: WorldState, game: GameState, target: { x: number; y: number }, wcfg: WorldConfig): Dir[] | null {
  const map = mapById(wcfg, world.mapa);
  const { width: W, height: H } = map;
  if (!Number.isInteger(target.x) || !Number.isInteger(target.y) || target.x < 0 || target.y < 0 || target.x >= W || target.y >= H) return null;
  const order = wcfg.movement.dirOrder;
  const vec = wcfg.movement.vec;
  const ents = new Set(activeEntities(world, wcfg).map((e) => e.y * W + e.x));
  const noStarter = game.inicial.elegida === null;
  const passable = (i: number): boolean => {
    const t = map.cells[i] as Tile;
    return t.walkable && !ents.has(i) && !(noStarter && t.encounterPct > 0);
  };
  const dist = new Array<number>(W * H).fill(Infinity);
  const steps = new Array<number>(W * H).fill(Infinity);
  const prev = new Array<number>(W * H).fill(-1);
  const prevDir = new Array<Dir | null>(W * H).fill(null);
  const done = new Array<boolean>(W * H).fill(false);
  const start = world.pos.y * W + world.pos.x;
  dist[start] = 0;
  steps[start] = 0;
  // frontera: [coste, pasos, secuencia, casilla]
  const frontier: [number, number, number, number][] = [[0, 0, 0, start]];
  let seq = 1;
  while (frontier.length > 0) {
    let bi = 0;
    for (let i = 1; i < frontier.length; i++) {
      const a = frontier[i] as number[];
      const b = frontier[bi] as number[];
      if (a[0]! < b[0]! || (a[0] === b[0] && (a[1]! < b[1]! || (a[1] === b[1] && a[2]! < b[2]!)))) bi = i;
    }
    const [, , , c] = frontier.splice(bi, 1)[0] as [number, number, number, number];
    if (done[c]) continue;
    done[c] = true;
    const cx = c % W;
    const cy = (c - cx) / W;
    for (const d of order) {
      const nx = cx + vec[d].dx;
      const ny = cy + vec[d].dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const ni = ny * W + nx;
      if (done[ni] || !passable(ni)) continue;
      const nd = (dist[c] as number) + (map.cells[ni] as Tile).routeCost;
      const ns = (steps[c] as number) + 1;
      if (nd < (dist[ni] as number) || (nd === dist[ni] && ns < (steps[ni] as number))) {
        dist[ni] = nd;
        steps[ni] = ns;
        prev[ni] = c;
        prevDir[ni] = d;
        frontier.push([nd, ns, seq++, ni]);
      }
    }
  }
  const pathTo = (i: number): Dir[] => {
    const p: Dir[] = [];
    for (let c = i; c !== start; c = prev[c] as number) p.push(prevDir[c] as Dir);
    return p.reverse();
  };
  const ti = target.y * W + target.x;
  let path: Dir[];
  if (passable(ti)) {
    if (!done[ti]) return null;
    path = pathTo(ti);
  } else if (ents.has(ti) || activatorAt(wcfg, world.mapa, target.x, target.y) !== null) {
    // vecina alcanzable de menor coste (después, menos pasos, después orden de direcciones)
    let best: { i: number; d: Dir } | null = null;
    for (const d of order) {
      // la vecina n del destino se alcanza mirando hacia el destino con la dirección opuesta
      const nx = target.x - vec[d].dx;
      const ny = target.y - vec[d].dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const ni = ny * W + nx;
      if (!done[ni]) continue;
      if (best === null || (dist[ni] as number) < (dist[best.i] as number) || (dist[ni] === dist[best.i] && (steps[ni] as number) < (steps[best.i] as number))) best = { i: ni, d };
    }
    if (best === null) return null;
    path = pathTo(best.i);
    const last = path.length > 0 ? (path[path.length - 1] as Dir) : world.mira;
    if (last !== best.d) path.push(best.d); // giro final hacia el destino
  } else return null;
  return path.length > wcfg.movement.routeMaxSteps ? null : path;
}
