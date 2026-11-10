/**
 * Configuración y construcción de equipos del simulador de combate (configs v0.2).
 * Variantes = cambios por ruta en combate y movimientos + sales de catálogo (forma de la propuesta).
 * Carga los JSON (combate, movimientos, genética v0.2) y aplica cambios por
 * ruta sobre una COPIA; nunca modifica los ficheros de config/.
 */
import rawCombat from "../../config/combate.v0.2.json" with { type: "json" };
import rawMoves from "../../config/movimientos.v0.2.json" with { type: "json" };
import rawGenetics from "../../config/genetica.v0.2.json" with { type: "json" };
import { readFileSync } from "node:fs";
import {
  buildBattleConfig,
  buildCombatant,
  patchRawConfig,
  type ConfigChanges,
  createRng,
  createWildCreature,
  deriveStats,
  distribute,
  expressedGenes,
  generateMoveForKey,
  LOCUS_IDS,
  parseGeneticsConfig,
  synergyGroups,
  type BattleConfig,
  type Combatant,
  type Creature,
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

/** Cambios por ruta (forma corta de `patchRawConfig`: "energia.por_turno"). */
export type Changes = Readonly<Record<string, unknown>>;

/**
 * Variante: id corto + cambios por ruta en el JSON de combate y en el de movimientos,
 * y sales de catálogo (`overrides_catalogo.sales[id]`, forma larga porque los ids llevan puntos).
 */
export interface Variant {
  readonly id: string;
  readonly label: string;
  readonly combat?: Changes;
  readonly moves?: Changes;
  readonly salts?: Readonly<Record<string, string | null>>;
}

export const BASE_VARIANT: Variant = { id: "v02", label: "v0.2 (JSON sin cambios)" };

/** Une variantes: los cambios de `b` pisan los de `a`. */
export function extend(a: Variant, b: Omit<Variant, "label"> & { label?: string }): Variant {
  return {
    id: b.id,
    label: b.label ?? a.label,
    combat: { ...a.combat, ...b.combat },
    moves: { ...a.moves, ...b.moves },
    salts: { ...a.salts, ...b.salts },
  };
}

function movesChanges(v: Variant): ConfigChanges | undefined {
  // QA K-02: la forma larga crea claves; una sal con id mal escrito no haría nada. Se exige que el gen exista.
  for (const id of Object.keys(v.salts ?? {})) if (!GCFG.catalogById.has(id)) throw new Error(`sal para un gen que no existe en el catálogo: ${id}`);
  const sets = Object.entries(v.moves ?? {}).map(([p, x]) => [p.split("."), x] as const);
  // sal null = quitar la sal del JSON (vuelve al flujo sin sal)
  const salts = Object.entries(v.salts ?? {}).map(([id, x]) => [["overrides_catalogo", "sales", id], x === null ? undefined : x] as const);
  const all = [...sets, ...salts];
  return all.length ? all : undefined;
}

export function rawCombatFor(v: Variant): RawConfig {
  return v.combat && Object.keys(v.combat).length ? patchRawConfig(RAW_COMBAT, v.combat) : RAW_COMBAT;
}
export function rawMovesFor(v: Variant): RawConfig {
  const ch = movesChanges(v);
  return ch ? patchRawConfig(RAW_MOVES, ch) : RAW_MOVES;
}

/** Valor de una ruta en el JSON efectivo de la variante (para que el informe cite la config, no el código). */
export function readPath(raw: RawConfig, path: string): unknown {
  return path.split(".").reduce<any>((o, p) => (o == null ? undefined : o[p]), raw);
}

const cache = new Map<string, BattleConfig>();
export function battleConfig(v: Variant): BattleConfig {
  const k = JSON.stringify([v.combat ?? {}, v.moves ?? {}, v.salts ?? {}]);
  let c = cache.get(k);
  if (!c) {
    const mc = movesChanges(v);
    c = buildBattleConfig(RAW_COMBAT, RAW_MOVES, GCFG, { ...(v.combat && Object.keys(v.combat).length ? { combat: v.combat } : {}), ...(mc ? { moves: mc } : {}) });
    cache.set(k, c);
  }
  return c;
}

/**
 * Fichero de propuesta (`config/propuestas/*.json`): parche de palancas, sin tocar config/.
 * { "combate": {ruta: valor}, "movimientos": {ruta: valor}, "sales": {id: sal|null}, "criterios": {...} }.
 * `criterios` son los del estudio (decisión del director); se aplican a la base y a la propuesta.
 */
export interface Proposal {
  readonly path: string;
  readonly variant: Variant;
  readonly criteria: RawConfig;
  readonly raw: RawConfig;
}

export function loadProposal(path: string): Proposal {
  const raw = JSON.parse(readFileSync(path, "utf8")) as RawConfig;
  const variant: Variant = { id: "propuesta", label: raw["_titulo"] ?? path, combat: raw["combate"] ?? {}, moves: raw["movimientos"] ?? {}, salts: raw["sales"] ?? {} };
  battleConfig(variant); // valida con los parsers del núcleo (lanza ConfigError si algo no cuadra)
  return { path, variant, criteria: raw["criterios"] ?? {}, raw };
}

/** Familias: 6 base + 7 híbridas, en el orden de los anillos de la config de combate. */
export function allFamilies(): FamilyId[] {
  return [...(RAW_COMBAT.familias.anillo_base as string[]), ...(RAW_COMBAT.familias.anillo_hibridas as string[])];
}

// --------------------------------------------------------------- equipos

/** C1: 4 salvajes en orden de generación. */
export function wildTeam(rng: Rng, cfg: BattleConfig, prefix: string): Combatant[] {
  return [0, 1, 2, 3].map((k) => buildCombatant(createWildCreature(rng, GCFG, { id: `${prefix}${k}` }), cfg));
}

export function wildCreatures(rng: Rng, prefix: string): Creature[] {
  return [0, 1, 2, 3].map((k) => createWildCreature(rng, GCFG, { id: `${prefix}${k}` }));
}

/** Firma aleatoria (4 dígitos de la rejilla de forma). */
function randomSignature(rng: Rng): string {
  const levels = GCFG.shape.levels;
  let s = "";
  for (let i = 0; i < 4; i++) s += String(Math.floor(rng.next() * levels));
  return s;
}

/**
 * C2: equipo monofamilia. Base: 4 salvajes `puro` de F.
 * Híbrida H = (a, b): 2 loci al azar con D híbrido (clave H|locus|firma al azar,
 * valores = media de los D de a y b en ese locus) y los otros 2 con un D de a y
 * uno de b (de salvajes puros). Decisión del analista: la spec no fija las
 * estadísticas del D híbrido; la media de los componentes es la del ancla de mutación.
 */
export function monoFamilyTeam(fam: FamilyId, rng: Rng, cfg: BattleConfig, prefix: string): Combatant[] {
  const h = GCFG.hybridById.get(fam);
  if (!h) return [0, 1, 2, 3].map((k) => buildCombatant(createWildCreature(rng, GCFG, { id: `${prefix}${k}`, family: fam, pure: true }), cfg));
  const out: Combatant[] = [];
  for (let k = 0; k < 4; k++) {
    const ca = expressedGenes(createWildCreature(rng, GCFG, { id: `${prefix}${k}a`, family: h.components[0], pure: true }));
    const cb = expressedGenes(createWildCreature(rng, GCFG, { id: `${prefix}${k}b`, family: h.components[1], pure: true }));
    // orden de loci al azar: los 2 primeros híbridos, el 3.º de a, el 4.º de b
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
    out.push(
      Object.freeze({
        id: `${prefix}${k}`,
        family: fam,
        groups: Object.freeze(synergyGroups(fam, cfg.combat, GCFG)),
        ...deriveStats(P, V, R, cfg.combat),
        moves: Object.freeze(moves),
      }),
    );
  }
  return out;
}

/** Calidades extremas de genética (base·(1 ± margen)), leídas de la config. */
export function qualityExtremes(): { hi: number; lo: number } {
  const { base, margin } = GCFG.quality;
  return { hi: base * (1 + margin), lo: base * (1 - margin) };
}

/**
 * C3: misma criatura con todos sus D a calidad Q (ancla y valores = ancla del
 * catálogo escalada a Q y repartida con los límites de ancla, §1.5).
 */
export function atQuality(c: Creature, Q: number, cfg: BattleConfig): Combatant {
  const base = buildCombatant(c, cfg);
  const lo = [GCFG.values.anchorMin, GCFG.values.anchorMin, GCFG.values.anchorMin];
  const hi = [GCFG.values.anchorMax, GCFG.values.anchorMax, GCFG.values.anchorMax];
  let P = 0;
  let V = 0;
  let R = 0;
  for (const g of expressedGenes(c)) {
    const t = GCFG.catalogById.get(g.id);
    if (!t) throw new Error(`atQuality: gen ${g.id} fuera de catálogo`);
    const a = distribute([t.anchor.potencia, t.anchor.velocidad, t.anchor.resistencia].map((x) => (x * Q) / GCFG.quality.base), lo, hi, Q, GCFG);
    P += a[0] as number;
    V += a[1] as number;
    R += a[2] as number;
  }
  return Object.freeze({ ...base, ...deriveStats(P, V, R, cfg.combat) });
}

/** Movimiento de referencia (movimientos §7): golpe puro con todo el presupuesto de coste c, con tope. */
export function referenceMove(cost: number, family: FamilyId, cfg: BattleConfig, M: RawConfig = RAW_MOVES): Move {
  const budget = M.presupuesto_por_coste[String(cost)] as number;
  const ppp = M.escalables.dano.potencia_por_punto as number;
  const step = M.escalables.paso as number;
  const power = Math.min(Math.floor((budget * ppp) / step) * step, M.escalables.dano.max_individual as number);
  void cfg;
  return Object.freeze({
    id: `ref:c${cost}`,
    key: `${family}|cabeza|ref${cost}`,
    family,
    locus: "cabeza",
    name: `Referencia c${cost}`,
    cost,
    archetype: "golpe",
    scalable: "dano",
    power,
    target: "enemigo",
    area: false,
    status: null,
    extraEnergy: 0,
    modifier: null,
    condition: null,
    scalablePoints: budget,
    points: budget,
    budget,
    fallback: 0,
  }) as Move;
}

/** Hueco de la criatura 1 donde se sustituye m: el de su mismo coste; si no hay, el de su locus. */
export function substitutionSlot(c: Combatant, m: Move): number {
  const k = c.moves.findIndex((x) => x.cost === m.cost);
  return k >= 0 ? k + 1 : LOCUS_IDS.indexOf(m.locus) + 1;
}

/** Claves de los 72 genes del catálogo base. */
export function catalogKeys(): { key: string; id: string; gene: string }[] {
  return [...GCFG.catalogById.values()].map((t) => ({ key: `${t.family}|${t.locus}|${t.signature}`, id: t.move, gene: t.id }));
}

/** Muestra de claves mutadas (familia de las 13, locus y firma al azar, fuera del catálogo, sin repetir). */
export function mutatedSample(n: number, seed: string): string[] {
  const rng = createRng(seed);
  const fams = allFamilies();
  const catalog = new Set(catalogKeys().map((k) => k.key));
  const out = new Set<string>();
  let guard = 0;
  while (out.size < n && guard++ < n * 100) {
    const f = fams[Math.floor(rng.next() * fams.length)] as FamilyId;
    const L = LOCUS_IDS[Math.floor(rng.next() * LOCUS_IDS.length)] as string;
    const key = `${f}|${L}|${randomSignature(rng)}`;
    if (!catalog.has(key)) out.add(key);
  }
  return [...out];
}
