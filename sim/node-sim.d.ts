/**
 * Declaraciones mínimas de Node que usa el simulador (complementa
 * types/node-shim.d.ts; mismo motivo: sin red ni @types/node). Si
 * instalas @types/node, borra este fichero.
 */
declare module "node:fs" {
  export function writeFileSync(path: string | URL, data: string): void;
  export function mkdirSync(path: string | URL, options?: { recursive?: boolean }): void;
  export function existsSync(path: string | URL): boolean;
}

declare module "node:crypto" {
  interface Hash {
    update(data: string): Hash;
    digest(encoding: "hex"): string;
  }
  export function createHash(algorithm: string): Hash;
}

declare const process: {
  readonly argv: string[];
  exitCode: number | undefined;
  readonly stdout: { write(s: string): boolean };
};

declare const console: {
  log(...args: unknown[]): void;
  error(...args: unknown[]): void;
};

declare const performance: { now(): number };

declare module "node:worker_threads" {
  interface Port {
    on(event: "message", fn: (value: any) => void): void;
    postMessage(value: unknown): void;
  }
  export const parentPort: Port | null;
  export class Worker {
    constructor(url: URL);
    on(event: "message", fn: (value: any) => void): void;
    on(event: "error", fn: (err: unknown) => void): void;
    postMessage(value: unknown): void;
    terminate(): Promise<number>;
  }
}
