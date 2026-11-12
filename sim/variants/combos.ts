/**
 * Combinaciones del estudio de variantes v0.3 (docs/spec/combate-variantes-v0.3.md §4).
 * Cada combinación es un parche por ruta sobre los JSON de config/ (nunca se modifican).
 * Los ajustes ligeros (candidatas) también viven aquí, como parches sobre una combinación.
 */
import { createHash } from "node:crypto";
import { battleConfig, extend, rawCombatFor, rawMovesFor, readPath, type Variant } from "../combat/setup.ts";

export interface Combo {
  readonly id: string;
  readonly label: string;
  readonly variant: Variant;
  /** Objetivo automático: los equipos se colocan con `suggestFormation`. */
  readonly v4: boolean;
  readonly v2: boolean;
  /** Candidata de ajuste (no forma parte de las 8 combinaciones del encargo). */
  readonly adjust?: string;
}

const V1 = { "variantes.golpe_basico_efecto.activo": true } as const;
const V2 = { "variantes.descanso.activo": true } as const;
const V3 = { "energia.por_turno": 4 } as const;
const V4 = { "variantes.objetivo_automatico.activo": true } as const;
const TAUNT = { "provocar.activo": true } as const;

function combo(id: string, label: string, combat: Record<string, unknown>, moves: Record<string, unknown> = {}, adjust?: string): Combo {
  return {
    id,
    label,
    variant: { id, label, combat, moves },
    v4: combat["variantes.objetivo_automatico.activo"] === true,
    v2: combat["variantes.descanso.activo"] === true,
    ...(adjust ? { adjust } : {}),
  };
}

/** Las 8 combinaciones del encargo, en el orden de la tabla. */
export const MAIN_COMBOS: readonly Combo[] = [
  combo("base", "Base v0.2.1", {}),
  combo("v1", "V1", { ...V1 }),
  combo("v2", "V2", { ...V2 }),
  combo("v1v2", "V1+V2", { ...V1, ...V2 }),
  combo("v1v2v3", "V1+V2+V3", { ...V1, ...V2, ...V3 }),
  combo("v4p", "V4+provocar", { ...V4 }, { ...TAUNT }),
  combo("v4p_v1v2", "V4+prov.+V1+V2", { ...V4, ...V1, ...V2 }, { ...TAUNT }),
  combo("v4p_v1v2v3", "V4+prov.+V1+V2+V3", { ...V4, ...V1, ...V2, ...V3 }, { ...TAUNT }),
];

/**
 * Diagnóstico (¿cuál es la causa?, no arreglos): V4 sin la pieza provocar, y V4 con provocar pero sin peso en brote.
 * Solo se miden en C1 y C2, con las semillas de la evaluación (pareado con ella).
 */
export const DIAG_COMBOS: readonly Combo[] = [
  combo("v4", "V4 sin provocar", { ...V4 }),
  combo("v4p_brote0", "V4+provocar, brote sin provocar", { ...V4 }, { ...TAUNT, "provocar.pesos_familia.brote": 0 }),
];

/** Candidatas del ajuste ligero (se rellenan en adjust.ts). */
const EXTRA: Combo[] = [];
export function registerCombo(base: string, id: string, label: string, combat: Record<string, unknown>, moves: Record<string, unknown>, adjust: string): Combo {
  const b = comboById(base);
  const v = extend(b.variant, { id, label, combat, moves });
  const c: Combo = { id, label, variant: v, v4: b.v4, v2: b.v2, adjust };
  if (!EXTRA.some((x) => x.id === id)) EXTRA.push(c);
  return c;
}

export function comboById(id: string): Combo {
  const c = MAIN_COMBOS.find((x) => x.id === id) ?? DIAG_COMBOS.find((x) => x.id === id) ?? EXTRA.find((x) => x.id === id);
  if (!c) throw new Error(`combinación desconocida: ${id}`);
  return c;
}
export function allCombos(): readonly Combo[] {
  return [...MAIN_COMBOS, ...DIAG_COMBOS, ...EXTRA];
}

/** Huella de la config efectiva (combate + movimientos ya parcheados). */
export function comboSha(c: Combo): string {
  return createHash("sha256").update(JSON.stringify([rawCombatFor(c.variant), rawMovesFor(c.variant)])).digest("hex").slice(0, 12);
}

/**
 * Comprueba que cada parche cambia de verdad la config (lección QA K-02): cada ruta se lee
 * de vuelta del JSON efectivo con el valor pedido, la config se construye con los parsers del
 * núcleo y la huella es distinta de la de cualquier otra combinación.
 */
export function checkCombos(cs: readonly Combo[]): void {
  const seen = new Map<string, string>();
  for (const c of cs) {
    const rc = rawCombatFor(c.variant);
    const rm = rawMovesFor(c.variant);
    for (const [p, x] of Object.entries(c.variant.combat ?? {})) if (JSON.stringify(readPath(rc, p)) !== JSON.stringify(x)) throw new Error(`${c.id}: la ruta de combate ${p} no ha cambiado`);
    for (const [p, x] of Object.entries(c.variant.moves ?? {})) if (JSON.stringify(readPath(rm, p)) !== JSON.stringify(x)) throw new Error(`${c.id}: la ruta de movimientos ${p} no ha cambiado`);
    battleConfig(c.variant);
    const sha = comboSha(c);
    const dup = seen.get(sha);
    if (dup) throw new Error(`${c.id} y ${dup} tienen la misma config efectiva`);
    seen.set(sha, c.id);
  }
}
