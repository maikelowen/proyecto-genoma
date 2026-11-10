/**
 * Utilidades de validación compartidas por los parsers de combate y
 * movimientos (mismo estilo que `parseGeneticsConfig`: lanzan
 * `ConfigError` con la ruta del campo problemático).
 */
import { ConfigError } from "../genetics/config.ts";

export type Obj = Record<string, unknown>;

export function fail(path: string, msg: string): never {
  throw new ConfigError(`${path}: ${msg}`);
}
export function obj(v: unknown, path: string): Obj {
  if (typeof v !== "object" || v === null || Array.isArray(v)) fail(path, "se esperaba un objeto");
  return v as Obj;
}
export function arr(v: unknown, path: string): unknown[] {
  if (!Array.isArray(v)) fail(path, "se esperaba un array");
  return v;
}
export function num(v: unknown, path: string, min = -Infinity, max = Infinity): number {
  if (typeof v !== "number" || !Number.isFinite(v)) fail(path, "se esperaba un número finito");
  if (v < min || v > max) fail(path, `fuera de rango [${min}, ${max}]: ${v}`);
  return v;
}
export function int(v: unknown, path: string, min = -Infinity, max = Infinity): number {
  const n = num(v, path, min, max);
  if (!Number.isInteger(n)) fail(path, `se esperaba un entero: ${n}`);
  return n;
}
export function str(v: unknown, path: string): string {
  if (typeof v !== "string" || v.length === 0) fail(path, "se esperaba un string no vacío");
  return v;
}
export function bool(v: unknown, path: string): boolean {
  if (typeof v !== "boolean") fail(path, "se esperaba un booleano");
  return v;
}
export function sameList(actual: unknown[], expected: readonly (string | number)[], path: string): void {
  if (actual.length !== expected.length || actual.some((x, i) => x !== expected[i])) {
    fail(path, `debe ser exactamente ${JSON.stringify(expected)}`);
  }
}
/** Ids de datos: `^[a-z0-9_]+$` (movimientos §3). */
export const ID_REGEX = /^[a-z0-9_]+$/;
export function checkId(id: string, path: string): void {
  if (!ID_REGEX.test(id)) fail(path, `id '${id}' no cumple ${ID_REGEX.source}`);
}
/** Claves de datos de un objeto de config (ignora las de documentación `_…`). */
export function dataKeys(o: Obj): string[] {
  return Object.keys(o).filter((k) => !k.startsWith("_"));
}
