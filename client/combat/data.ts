/** Configs del juego y utilidades de presentación (nombres, paletas). Solo usa la API pública del núcleo. */
import rawG from "../../config/genetica.v0.2.json" with { type: "json" };
import rawC from "../../config/combate.v0.4.json" with { type: "json" };
import rawM from "../../config/movimientos.v0.4.json" with { type: "json" };
import { parseCombatConfig, parseGeneticsConfig, parseMovesConfig, type BattleConfig, type GeneticsConfig } from "../../packages/core/src/index.ts";
import { paletteOf, type Palette } from "../art/palette.ts";

export const gcfg: GeneticsConfig = parseGeneticsConfig(rawG);
export const cfg: BattleConfig = { combat: parseCombatConfig(rawC), moves: parseMovesConfig(rawM, gcfg) };

const SYL_A = ["Pi", "Ku", "Zo", "Ma", "Ve", "Lu", "Ni", "Ta", "Ro", "Ka", "Sy", "Do", "Fe", "Ha", "Mi", "Tu", "Bra", "Cre", "Gli", "Oru"];
const SYL_B = ["rux", "mo", "la", "zen", "ko", "vi", "dra", "nu", "sk", "bel", "tor", "qui", "lis", "fo"];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Nombre corto pronunciable, determinista en (id, semilla). `taken` evita repetidos. */
export function soulName(id: string, seed: string, taken: Set<string>): string {
  let h = hash(id + "|" + seed);
  for (let i = 0; i < 200; i++) {
    const n = (SYL_A[h % SYL_A.length] as string) + (SYL_B[(h >>> 8) % SYL_B.length] as string);
    if (!taken.has(n)) {
      taken.add(n);
      return n;
    }
    h = hash(String(h) + i);
  }
  const n = id;
  taken.add(n);
  return n;
}

export function familyLabel(f: string): string {
  const h = gcfg.hybridById.get(f);
  if (h) return h.name;
  return f.charAt(0).toUpperCase() + f.slice(1);
}

export function palette(f: string): Palette {
  return paletteOf(f, gcfg.hybridById.get(f)?.components);
}
