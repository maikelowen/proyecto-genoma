import { loadCfg, playGame, type GameResult, type Profile } from "./modelo.ts";

export interface Batch { readonly prefix: string; readonly profile: Profile; readonly from: number; readonly to: number; readonly maxCombats: number; readonly minCombats: number; readonly config: string }

/** Partida i de un perfil: semilla `<prefijo>-<perfil>-<i>`, inicial i mod 3 (las 3 por igual). */
export function runBatch(b: Batch): GameResult[] {
  const { cfg, raw } = loadCfg(b.config);
  const secRes = raw.escenarios_sim.segundos_por_resonancia as number;
  const out: GameResult[] = [];
  for (let i = b.from; i < b.to; i++) out.push(playGame(`${b.prefix}-${b.profile}-${i}`, b.profile, i % 3, b.maxCombats, b.minCombats, cfg, secRes));
  return out;
}
