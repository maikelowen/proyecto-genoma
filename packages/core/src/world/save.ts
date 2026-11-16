/**
 * Guardado del mundo `genoma-mundo` v1 (spec mundo v0.1 §5). Clave propia, enlazada por la semilla.
 * `parseWorldSave` no lanza: si algo falla, rehace el mundo con `newWorld` y lo cuenta en `notes` (la partida no se toca).
 */
import type { GameState } from "../progression/game.ts";
import { DIRS, mapById, type Dir, type WorldConfig } from "./config.ts";
import { activeEntities, newWorld, type WorldState } from "./world.ts";

/** mundo §5.1 — texto del guardado (JSON; el orden de claves es el de construcción). */
export function serializeWorld(world: WorldState): string {
  return JSON.stringify(world);
}

class WorldSaveError extends Error {}
const bad = (p: string, m: string): never => {
  throw new WorldSaveError(`${p}: ${m}`);
};
type O = Record<string, unknown>;
function o(v: unknown, p: string, keys: readonly string[]): O {
  if (typeof v !== "object" || v === null || Array.isArray(v)) bad(p, "se esperaba un objeto");
  for (const k of Object.keys(v as O)) if (!keys.includes(k)) bad(`${p}.${k}`, "clave desconocida");
  for (const k of keys) if (!(k in (v as O))) bad(`${p}.${k}`, "falta la clave");
  return v as O;
}
function n(v: unknown, p: string, min: number, max: number): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) bad(p, `se esperaba un entero en [${min}, ${max}]`);
  return v as number;
}

/**
 * mundo §5.1 — carga sin tiradas. `text` null/undefined (sin clave) = mundo nuevo sin aviso.
 * Valida formato y versión, semilla igual a la de la partida, mapa, posición pisable y sin entidad,
 * orientación, rangos de contadores, `recogidos` ⊂ objetos del mapa y `charlas` ⊂ entidades.
 */
export function parseWorldSave(text: string | null | undefined, game: Pick<GameState, "semilla">, wcfg: WorldConfig): { world: WorldState; notes: string[] } {
  if (text === null || text === undefined) return { world: newWorld(game, wcfg), notes: [] };
  try {
    return { world: parseStrict(text, game, wcfg), notes: [] };
  } catch (e) {
    if (!(e instanceof WorldSaveError) && !(e instanceof SyntaxError)) throw e;
    return { world: newWorld(game, wcfg), notes: [`Guardado del mundo descartado (${e.message}): empiezas delante del santuario. La partida no cambia.`] };
  }
}

function parseStrict(text: string, game: Pick<GameState, "semilla">, wcfg: WorldConfig): WorldState {
  const raw: unknown = JSON.parse(text);
  const r = o(raw, "mundo", ["formato", "version", "semilla", "config", "mapa", "pos", "mira", "contadores", "gracia_restante", "pasos_sin_encuentro", "recogidos", "charlas"]);
  if (r["formato"] !== wcfg.save.format) bad("formato", `se esperaba '${wcfg.save.format}'`);
  if (r["version"] !== wcfg.save.formatVersion) bad("version", `versión no soportada: ${String(r["version"])}`);
  if (r["semilla"] !== game.semilla) bad("semilla", "no es la de la partida cargada");
  const cfg = o(r["config"], "config", ["mundo"]);
  if (cfg["mundo"] !== wcfg.version) bad("config.mundo", `se esperaba '${wcfg.version}'`);
  const map = wcfg.maps.find((m) => m.id === r["mapa"]);
  if (map === undefined) return bad("mapa", "el mapa no existe");
  const pos = o(r["pos"], "pos", ["x", "y"]);
  const x = n(pos["x"], "pos.x", 0, map.width - 1);
  const y = n(pos["y"], "pos.y", 0, map.height - 1);
  const mira = r["mira"];
  if (typeof mira !== "string" || !(DIRS as readonly string[]).includes(mira)) bad("mira", "orientación inválida");
  const c = o(r["contadores"], "contadores", ["pasos_hierba", "pasos_totales"]);
  const E = wcfg.encounters;
  const graceMax = Math.max(E.graceAfterEncounter, E.graceLeavingSanctuary, E.graceReturningFromList);
  const gracia = n(r["gracia_restante"], "gracia_restante", 0, graceMax);
  const sin = n(r["pasos_sin_encuentro"], "pasos_sin_encuentro", 0, E.maxStepsWithoutEncounter - 1);
  if (!Array.isArray(r["recogidos"])) bad("recogidos", "se esperaba una lista");
  const objects = new Set(map.entities.filter((e) => e.kind === "objeto").map((e) => e.id));
  const recogidos = (r["recogidos"] as unknown[]).map((id, i) => {
    if (typeof id !== "string" || !objects.has(id)) bad(`recogidos[${i}]`, "no es un objeto del mapa");
    return id as string;
  });
  if (new Set(recogidos).size !== recogidos.length) bad("recogidos", "elementos repetidos");
  const ch = r["charlas"];
  if (typeof ch !== "object" || ch === null || Array.isArray(ch)) bad("charlas", "se esperaba un objeto");
  const ids = new Set(map.entities.map((e) => e.id));
  const charlas: Record<string, number> = {};
  for (const [k, v] of Object.entries(ch as O)) {
    if (!ids.has(k)) bad(`charlas.${k}`, "no es una entidad del mapa");
    charlas[k] = n(v, `charlas.${k}`, 0, Number.MAX_SAFE_INTEGER);
  }
  const world: WorldState = {
    formato: wcfg.save.format,
    version: wcfg.save.formatVersion,
    semilla: game.semilla,
    config: { mundo: wcfg.version },
    mapa: map.id,
    pos: { x, y },
    mira: mira as Dir,
    contadores: { pasos_hierba: n(c["pasos_hierba"], "contadores.pasos_hierba", 0, Number.MAX_SAFE_INTEGER), pasos_totales: n(c["pasos_totales"], "contadores.pasos_totales", 0, Number.MAX_SAFE_INTEGER) },
    gracia_restante: gracia,
    pasos_sin_encuentro: sin,
    recogidos,
    charlas,
  };
  // posición pisable, sin entidad y sin ser un activador
  const tile = mapById(wcfg, map.id).cells[y * map.width + x];
  if (tile === undefined || !tile.walkable) bad("pos", `(${x}, ${y}) no es pisable`);
  if (activeEntities(world, wcfg).some((e) => e.x === x && e.y === y)) bad("pos", `(${x}, ${y}) está ocupada por una entidad`);
  return world;
}
