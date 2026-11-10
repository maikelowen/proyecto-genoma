/**
 * Declaraciones mínimas de los módulos de Node que usan los tests.
 *
 * Existe porque el entorno de desarrollo no tiene red ni @types/node.
 * Si en tu máquina instalas @types/node, borra este fichero y cambia
 * `"types": []` por `"types": ["node"]` en tsconfig.json.
 */
declare module "node:test" {
  type TestFn = () => void | Promise<void>;
  export function test(name: string, fn: TestFn): Promise<void>;
  export function describe(name: string, fn: () => void): Promise<void>;
  export function it(name: string, fn: TestFn): Promise<void>;
}

declare module "node:assert/strict" {
  interface Assert {
    (value: unknown, message?: string): asserts value;
    ok(value: unknown, message?: string): asserts value;
    equal<T>(actual: unknown, expected: T, message?: string): asserts actual is T;
    notEqual(actual: unknown, expected: unknown, message?: string): void;
    deepEqual<T>(actual: unknown, expected: T, message?: string): asserts actual is T;
    notDeepEqual(actual: unknown, expected: unknown, message?: string): void;
    throws(fn: () => unknown, error?: RegExp | Function | object, message?: string): void;
    match(value: string, regExp: RegExp, message?: string): void;
    doesNotThrow(fn: () => unknown, message?: string): void;
  }
  const assert: Assert;
  export default assert;
}

declare module "node:fs" {
  export function readFileSync(path: string | URL, encoding: "utf8"): string;
  export function readdirSync(path: string | URL, options: { recursive: true }): string[];
}

interface ImportMeta {
  readonly url: string;
}

declare class URL {
  constructor(input: string, base?: string | URL);
  readonly href: string;
}

declare function structuredClone<T>(value: T): T;
