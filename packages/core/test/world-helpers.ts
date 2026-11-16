/** Utilidades de los tests del mundo caminable v0.1 (no es un test). */
import rawWorld from "../../../config/mundo.v0.1.json" with { type: "json" };
import { chooseStarter, newGame, parseWorldConfig, type GameState, type WorldConfig } from "../src/index.ts";
import { P, rawProgClone } from "./progression-helpers.ts";

export const rawWorldClone = (): any => structuredClone(rawWorld);
export const CHARS: string[] = rawProgClone().mundo.personajes.map((p: any) => p.id);
/** Mundo v0.1 real; `patch` modifica una copia del JSON crudo antes de validar. */
export function loadWorld(patch?: (raw: any) => void): WorldConfig {
  const r = rawWorldClone();
  if (patch) patch(r);
  return parseWorldConfig(r, P, CHARS);
}
export const W = loadWorld();
export const withStarter = (seed: string): GameState => chooseStarter(newGame(seed, P), 0, P);

/** Mapa pequeño (sin P/S ni entidades salvo que se den) para casos exactos. */
export function miniWorld(rows: string[], opts: { start?: { x: number; y: number; mira?: string }; entities?: any[]; patch?: (raw: any) => void } = {}): WorldConfig {
  return loadWorld((r) => {
    const m = r.mapas[0];
    m.ancho = rows[0]!.length;
    m.alto = rows.length;
    m.filas = rows;
    const s = opts.start ?? { x: 1, y: 1 };
    const at = { x: s.x, y: s.y, mira: s.mira ?? "e" };
    m.inicio = { ...at };
    m.salida_santuario = { ...at };
    m.llegada_desde_lista = { ...at };
    m.activadores = [];
    m.entidades = opts.entities ?? [];
    opts.patch?.(r);
  });
}
