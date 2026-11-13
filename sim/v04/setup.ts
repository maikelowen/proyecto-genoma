/**
 * Configuración y equipos del simulador de combate v0.4 (equipos de 3, cuadrícula 2x2, movimiento gratis).
 * Carga `config/combate.v0.4.json` + `config/movimientos.v0.4.json` y aplica parches por ruta sobre una COPIA.
 * Los ficheros de config/ no se modifican nunca; el ajuste vive en `config/propuestas/combate-v0.4.1.json`.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import rawCombat from "../../config/combate.v0.4.json" with { type: "json" };
import rawMoves from "../../config/movimientos.v0.4.json" with { type: "json" };
import rawGenetics from "../../config/genetica.v0.2.json" with { type: "json" };
import {
  buildBattleConfig,
  buildCombatant,
  createWildCreature,
  deriveStats,
  expressedGenes,
  generateMoveForKey,
  LOCUS_IDS,
  parseGeneticsConfig,
  synergyGroups,
  type BattleConfig,
  type Combatant,
  type ConfigChanges,
  type FamilyId,
  type GeneticsConfig,
  type Move,
  type Rng,
} from "../../packages/core/src/index.ts";

export type RawConfig = Record<string, any>;
export const RAW_COMBAT: RawConfig = rawCombat as RawConfig;
export const RAW_MOVES: RawConfig = rawMoves as RawConfig;
export const RAW_GENETICS: RawConfig = rawGenetics as RawConfig;
export const GCFG: GeneticsConfig = parseGeneticsConfig(RAW_GENETICS);

/** Variante = parche por ruta sobre combate y movimientos + sales de catálogo (id de gen → sal | null). */
export interface Variant {
  readonly id: string;
  readonly label: string;
  readonly combat: Readonly<Record<string, unknown>>;
  readonly moves: Readonly<Record<string, unknown>>;
  readonly salts: Readonly<Record<string, string | null>>;
}

export const BASE: Variant = { id: "base", label: "v0.4 base", combat: {}, moves: {}, salts: {} };

/**
 * Control R-02: sin la pieza provocar (la IA de referencia nunca la "ve": dura 1 turno y con elección simultánea ya caducó al decidir),
 * para ver si sesga la profundidad a favor de la búsqueda. Se quitan sus cuotas y sales.
 */
export const CONTROL: Variant = {
  id: "sinprov",
  label: "Control: base sin provocar",
  combat: {},
  moves: { "provocar.activo": false, "criterios_sim.cuotas_catalogo.provocar.total_min": 0, "criterios_sim.cuotas_catalogo.provocar.roca_min": 0, "criterios_sim.cuotas_catalogo.provocar.marea_min": 0, "criterios_sim.cuotas_catalogo.provocar.brote_min": 0 },
  salts: { "roca.cabeza.2": null, "brote.cuerpo.1": null },
};

function movesChanges(v: Variant): ConfigChanges | undefined {
  // QA K-02: la forma larga crea claves; una sal con id mal escrito no haría nada
  for (const id of Object.keys(v.salts)) if (!GCFG.catalogById.has(id)) throw new Error(`sal para un gen que no existe en el catálogo: ${id}`);
  const sets = Object.entries(v.moves).map(([p, x]) => [p.split("."), x] as const);
  const salts = Object.entries(v.salts).map(([id, x]) => [["overrides_catalogo", "sales", id], x === null ? undefined : x] as const);
  const all = [...sets, ...salts];
  return all.length ? all : undefined;
}

const cache = new Map<string, BattleConfig>();
export function battleConfig(v: Variant): BattleConfig {
  const k = JSON.stringify([v.combat, v.moves, v.salts]);
  let c = cache.get(k);
  if (!c) {
    const mc = movesChanges(v);
    c = buildBattleConfig(RAW_COMBAT, RAW_MOVES, GCFG, { ...(Object.keys(v.combat).length ? { combat: v.combat } : {}), ...(mc ? { moves: mc } : {}) });
    cache.set(k, c);
  }
  return c;
}

/** JSON efectivo de una variante (para que el informe cite valores de la config, no del código). */
export function effectiveRaw(v: Variant): { combat: RawConfig; moves: RawConfig } {
  const mc = movesChanges(v);
  // buildBattleConfig valida; aquí solo se necesita el JSON parcheado
  return { combat: Object.keys(v.combat).length ? patch(RAW_COMBAT, v.combat) : RAW_COMBAT, moves: mc ? patch(RAW_MOVES, mc) : RAW_MOVES };
}
import { patchRawConfig } from "../../packages/core/src/index.ts";
const patch = (raw: RawConfig, ch: ConfigChanges): RawConfig => patchRawConfig(raw, ch);

export function readPath(raw: RawConfig, path: string): unknown {
  return path.split(".").reduce<any>((o, p) => (o == null ? undefined : o[p]), raw);
}

/** Huella de una variante: de su JSON efectivo (combate + movimientos), no de su descripción. */
export function variantSha(v: Variant): string {
  const e = effectiveRaw(v);
  return createHash("sha256").update(JSON.stringify([e.combat, e.moves])).digest("hex").slice(0, 12);
}

export function loadProposal(path: string): Variant {
  const raw = JSON.parse(readFileSync(path, "utf8")) as RawConfig;
  const v: Variant = { id: "ajuste", label: String(raw["_titulo"] ?? path), combat: raw["combate"] ?? {}, moves: raw["movimientos"] ?? {}, salts: raw["sales"] ?? {} };
  battleConfig(v);
  return v;
}

export function fileSha(path: string): string {
  try {
    return createHash("sha256").update(readFileSync(path, "utf8")).digest("hex").slice(0, 12);
  } catch {
    return "—";
  }
}

export function allFamilies(): FamilyId[] {
  return [...(RAW_COMBAT.familias.anillo_base as string[]), ...(RAW_COMBAT.familias.anillo_hibridas as string[])];
}

// --------------------------------------------------------------- equipos de 3

export const TEAM = 3;
const ids = [0, 1, 2];

export function wildTeam(rng: Rng, cfg: BattleConfig, prefix: string): Combatant[] {
  return ids.map((k) => buildCombatant(createWildCreature(rng, GCFG, { id: `${prefix}${k}` }), cfg));
}

function randomSignature(rng: Rng): string {
  const levels = GCFG.shape.levels;
  let s = "";
  for (let i = 0; i < 4; i++) s += String(Math.floor(rng.next() * levels));
  return s;
}

/**
 * C2: equipo monofamilia de 3. Base: 3 salvajes `puro` de F. Híbrida H = (a, b): 2 loci al azar con D híbrido
 * (clave H|locus|firma al azar) y los otros 2 con un D de a y uno de b (misma construcción que v0.2, con 3 almas).
 */
export function monoFamilyTeam(fam: FamilyId, rng: Rng, cfg: BattleConfig, prefix: string): Combatant[] {
  const h = GCFG.hybridById.get(fam);
  if (!h) return ids.map((k) => buildCombatant(createWildCreature(rng, GCFG, { id: `${prefix}${k}`, family: fam, pure: true }), cfg));
  const out: Combatant[] = [];
  for (const k of ids) {
    const ca = expressedGenes(createWildCreature(rng, GCFG, { id: `${prefix}${k}a`, family: h.components[0], pure: true }));
    const cb = expressedGenes(createWildCreature(rng, GCFG, { id: `${prefix}${k}b`, family: h.components[1], pure: true }));
    const order = [0, 1, 2, 3];
    for (let i = 3; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      [order[i], order[j]] = [order[j] as number, order[i] as number];
    }
    const moves: Move[] = new Array(4);
    let P = 0;
    let V = 0;
    let R = 0;
    order.forEach((li, rank) => {
      const L = LOCUS_IDS[li] as (typeof LOCUS_IDS)[number];
      const ga = ca[li]!;
      const gb = cb[li]!;
      if (rank < 2) {
        moves[li] = generateMoveForKey(`${fam}|${L}|${randomSignature(rng)}`, cfg.moves);
        P += (ga.values.potencia + gb.values.potencia) / 2;
        V += (ga.values.velocidad + gb.values.velocidad) / 2;
        R += (ga.values.resistencia + gb.values.resistencia) / 2;
      } else {
        const g = rank === 2 ? ga : gb;
        moves[li] = generateMoveForKey(`${g.family}|${L}|${g.signature}`, cfg.moves, g.move);
        P += g.values.potencia;
        V += g.values.velocidad;
        R += g.values.resistencia;
      }
    });
    out.push(Object.freeze({ id: `${prefix}${k}`, family: fam, groups: Object.freeze(synergyGroups(fam, cfg.combat, GCFG)), ...deriveStats(P, V, R, cfg.combat), moves: Object.freeze(moves) }));
  }
  return out;
}
