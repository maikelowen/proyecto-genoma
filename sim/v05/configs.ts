/**
 * Configuraciones del estudio v0.5 (combate-v0.5 §9.1). Las claves se leen de `escenarios_sim.configs_v05` de
 * `config/combate.v0.5.json`: aquí no hay parches escritos a mano. Las 4 primeras se miden siempre; la 5.ª, solo si toca (§9.4).
 */
import { readFileSync } from "node:fs";
import type { Variant } from "../v04/setup.ts";

export const V05_PATH = "config/combate.v0.5.json";
export const CORE_IDS = ["base_E3", "solo_D053", "solo_D054", "ambas"] as const;
export const PLAN_B_ID = "ambas_aturdir_primero";

export function loadV05Configs(): { seedPrefix: string; variants: Variant[] } {
  const raw = JSON.parse(readFileSync(V05_PATH, "utf8"));
  const cfg = raw.escenarios_sim.configs_v05 as Record<string, any>;
  const variants = [...CORE_IDS, PLAN_B_ID].map((id) => {
    const patch = cfg[id] as Record<string, unknown>;
    if (!patch) throw new Error(`falta ${id} en escenarios_sim.configs_v05`);
    return { id, label: id, combat: patch, moves: {}, salts: {} } as Variant;
  });
  return { seedPrefix: String(cfg.semillas_prefijo), variants };
}
