/**
 * Configuraciones del simulador: carga el JSON de genética, aplica
 * cambios por ruta ("mutacion.prob_por_locus") sobre una COPIA y vuelve a
 * validar con parseGeneticsConfig. Nunca modifica config/genetica.v0.1.json.
 */
import rawConfig from "../../config/genetica.v0.1.json" with { type: "json" };
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

const B = RAW["barridos_sim"];
export const PESOS_D: Record<string, unknown> = B["herencia.pesos_D"];
export const PESOS_R: Record<string, unknown> = B["herencia.pesos_R"];

const PD_SHORT: Record<string, string> = { A_doc: "A", B: "B", C: "C" };

function fmtPct(p: number): string {
  return String(Math.round(p * 1000) / 10).replace(".", ",");
}

/** pesos_D × prob_por_locus (barrido principal, §11 prioridad 1). */
export function mainGrid(muts: readonly number[] = [0.01, 0.02, 0.03]): Variant[] {
  const out: Variant[] = [];
  for (const pd of ["A_doc", "B", "C"]) {
    for (const m of muts) {
      out.push({
        id: `${PD_SHORT[pd]}-m${Math.round(m * 100)}`,
        label: `pesos_D ${PD_SHORT[pd]} · mutación ${fmtPct(m)} %`,
        set: { "herencia.pesos_D": PESOS_D[pd], "mutacion.prob_por_locus": m },
      });
    }
  }
  return out;
}

/** pesos_R con un pesos_D/mutación fijos. */
export function pesosRSweep(base: Variant): Variant[] {
  const short: Record<string, string> = { R0: "R0", R_uniforme: "Runi", R_igual_D: "RigD" };
  return Object.keys(PESOS_R).map((k) => ({
    id: `${base.id}-${short[k] ?? k}`,
    label: `${base.label} · pesos_R ${k}`,
    set: { ...base.set, "herencia.pesos_R": PESOS_R[k] },
  }));
}

/** deriva.kappa × deriva.sigma (para E3a). */
export function driftSweep(base: Variant): Variant[] {
  const out: Variant[] = [];
  for (const k of B["deriva.kappa"] as number[]) {
    for (const s of B["deriva.sigma"] as number[]) {
      out.push({
        id: `${base.id}-k${k}-s${s}`,
        label: `${base.label} · κ ${k} · σ ${s}`,
        set: { ...base.set, "deriva.kappa": k, "deriva.sigma": s },
      });
    }
  }
  return out;
}

/** mutacion.prob_hibrida_nueva (para E2/E4). */
export function hybridSweep(base: Variant): Variant[] {
  return (B["mutacion.prob_hibrida_nueva"] as number[]).map((h) => ({
    id: `${base.id}-h${h}`,
    label: `${base.label} · híbrida nueva ${fmtPct(h)} %`,
    set: { ...base.set, "mutacion.prob_hibrida_nueva": h },
  }));
}

export function findVariant(id: string, all: readonly Variant[]): Variant {
  const v = all.find((x) => x.id === id);
  if (!v) throw new Error(`configuración desconocida: ${id}. Disponibles: ${all.map((x) => x.id).join(", ")}`);
  return v;
}

/** mutacion.sigma_forma (afecta a cuánto se repiten las claves mutadas, E2). */
export function shapeSigmaSweep(base: Variant): Variant[] {
  return (B["mutacion.sigma_forma"] as number[]).map((x) => ({
    id: `${base.id}-f${x}`,
    label: `${base.label} · σ forma ${x}`,
    set: { ...base.set, "mutacion.sigma_forma": x },
  }));
}
