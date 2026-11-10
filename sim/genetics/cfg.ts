/**
 * Configuraciones del simulador: carga el JSON de genética, aplica
 * cambios por ruta ("mutacion.prob_por_locus") sobre una COPIA y vuelve a
 * validar con parseGeneticsConfig. Nunca modifica config/genetica.v0.2.json.
 */
import rawConfig from "../../config/genetica.v0.2.json" with { type: "json" };
import { parseGeneticsConfig, type GeneticsConfig } from "../../packages/core/src/index.ts";

export type RawConfig = Record<string, any>;
export const RAW: RawConfig = rawConfig as RawConfig;

/** Una configuración del barrido: id corto + cambios por ruta. */
export interface Variant {
  readonly id: string;
  readonly label: string;
  readonly set: Readonly<Record<string, unknown>>;
}

function setPath(obj: RawConfig, path: string, value: unknown): void {
  const parts = path.split(".");
  let o: RawConfig = obj;
  for (const p of parts.slice(0, -1)) {
    if (typeof o[p] !== "object" || o[p] === null) throw new Error(`ruta desconocida: ${path}`);
    o = o[p];
  }
  const last = parts[parts.length - 1] as string;
  if (!(last in o)) throw new Error(`ruta desconocida: ${path}`);
  o[last] = structuredClone(value);
}

/** Resuelve referencias "=pesos_D" (barridos_sim) a una copia del objeto. */
function resolveRefs(raw: RawConfig): void {
  const h = raw["herencia"];
  for (const k of ["pesos_D", "pesos_R"]) {
    const v = h[k];
    if (typeof v === "string" && v.startsWith("=")) h[k] = structuredClone(h[v.slice(1)]);
  }
}

export function buildRaw(set: Readonly<Record<string, unknown>>): RawConfig {
  const raw = structuredClone(RAW);
  for (const [path, value] of Object.entries(set)) setPath(raw, path, value);
  resolveRefs(raw);
  return raw;
}

export function buildConfig(set: Readonly<Record<string, unknown>>): GeneticsConfig {
  return parseGeneticsConfig(buildRaw(set));
}

/** Configuración por defecto v0.2 (sin cambios sobre el JSON). */
export const DEFAULT_VARIANT: Variant = { id: "v02", label: "v0.2 por defecto", set: {} };

/** Variante de un solo parámetro sobre la config por defecto. */
export function oneParam(id: string, label: string, path: string, value: unknown): Variant {
  return { id, label, set: { [path]: value } };
}

export function findVariant(id: string, all: readonly Variant[]): Variant {
  const v = all.find((x) => x.id === id);
  if (!v) throw new Error(`configuración desconocida: ${id}. Disponibles: ${all.map((x) => x.id).join(", ")}`);
  return v;
}
