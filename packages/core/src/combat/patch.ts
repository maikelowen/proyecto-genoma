/**
 * Configs modificadas para barridos de balance (sin tocar los JSON de config/).
 *
 * El núcleo no lee ficheros: el simulador importa el JSON crudo, aplica
 * cambios por ruta sobre una COPIA con `patchRawConfig` y vuelve a validar
 * con el parser. Así cualquier palanca de balance (README) se barre sin
 * tocar el núcleo, y el parser sigue siendo la primera línea de defensa.
 */
import type { GeneticsConfig } from "../genetics/types.ts";
import { parseMovesConfig } from "../moves/config.ts";
import type { BattleConfig } from "./combatant.ts";
import { parseCombatConfig } from "./config.ts";
import { fail } from "./parse.ts";

/**
 * Cambios por ruta. Forma corta: `{"ia.kappa": 0, "presupuesto_por_coste.5": 60}`
 * (todas las claves deben existir: detecta erratas). Forma larga, para claves
 * con puntos o nuevas: `[[["overrides_catalogo", "sales", "llama.cabeza.1"], "r2"]]`
 * (la última clave de un objeto se puede crear). `undefined` borra la clave.
 */
export type ConfigChanges = Readonly<Record<string, unknown>> | readonly (readonly [readonly string[], unknown])[];

/**
 * Copia profunda del JSON crudo con los cambios aplicados, en orden. Los
 * índices de array van como números (`pesos_familia.arquetipo.llama.0`).
 * Lanza `ConfigError` con la ruta si no existe. No valida: hay que parsear después.
 */
export function patchRawConfig<T>(raw: T, changes: ConfigChanges): T {
  const out = JSON.parse(JSON.stringify(raw)) as T;
  const list: [readonly string[], unknown, boolean][] = Array.isArray(changes)
    ? (changes as readonly (readonly [readonly string[], unknown])[]).map(([p, v]) => [p, v, true])
    : Object.entries(changes as Readonly<Record<string, unknown>>).map(([p, v]) => [p.split("."), v, false]);
  for (const [parts, value, canCreate] of list) {
    const path = parts.join(".");
    if (parts.length === 0) fail("(vacía)", "ruta vacía");
    let o: unknown = out;
    for (const p of parts.slice(0, -1)) {
      if (typeof o !== "object" || o === null || !(p in o)) fail(path, "ruta desconocida");
      o = (o as Record<string, unknown>)[p];
    }
    const last = parts[parts.length - 1] as string;
    if (typeof o !== "object" || o === null) fail(path, "ruta desconocida");
    const target = o as Record<string, unknown>;
    const exists = last in target;
    if (value === undefined) {
      if (!exists || Array.isArray(o)) fail(path, "solo se pueden borrar claves de objeto existentes");
      delete target[last];
      continue;
    }
    if (!exists && (Array.isArray(o) || !canCreate)) fail(path, "ruta desconocida (para crear una clave, usa la forma larga)");
    target[last] = JSON.parse(JSON.stringify(value)) as unknown;
  }
  return out;
}

/**
 * Atajo: parsea combate y movimientos con cambios opcionales en cada JSON.
 * `buildBattleConfig(rawC, rawM, gcfg, { combat: {"ia.kappa": 0}, moves: {"presupuesto_por_coste.5": 60} })`.
 */
export function buildBattleConfig(
  rawCombat: unknown,
  rawMoves: unknown,
  genetics: GeneticsConfig,
  changes: { readonly combat?: ConfigChanges; readonly moves?: ConfigChanges } = {},
): BattleConfig {
  return {
    combat: parseCombatConfig(changes.combat ? patchRawConfig(rawCombat, changes.combat) : rawCombat),
    moves: parseMovesConfig(changes.moves ? patchRawConfig(rawMoves, changes.moves) : rawMoves, genetics),
  };
}
