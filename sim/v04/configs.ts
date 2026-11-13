/**
 * Registro de configuraciones del estudio v0.4: la base, las candidatas de ajuste (`candidates.ts`) y la propuesta
 * (`config/propuestas/combate-v0.4.1.json`). Los hilos de trabajo las registran por mensaje antes del primer trabajo.
 */
import { BASE, type Variant } from "./setup.ts";

const REG = new Map<string, Variant>([[BASE.id, BASE]]);
export function registerVariant(v: Variant): void {
  REG.set(v.id, v);
}
export function variantById(id: string): Variant {
  const v = REG.get(id);
  if (!v) throw new Error(`configuración desconocida: ${id}`);
  return v;
}
