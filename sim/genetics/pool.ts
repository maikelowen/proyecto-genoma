/**
 * Reparto de ejecuciones entre hilos (worker_threads). Cada ejecución es
 * independiente y determinista (su propia semilla), así que el resultado
 * no depende del nº de hilos ni del orden: se reordena por índice de job.
 */
import { Worker } from "node:worker_threads";
import type { Variant } from "./cfg.ts";
import { runScenario, type Plan, type ScenarioId, type ScenarioRun } from "./runner.ts";
import { findStrategy } from "./strategies.ts";

export interface Job {
  readonly expId: string;
  readonly strategyId: string;
  readonly variant: Variant;
  readonly scenario: ScenarioId;
  readonly seed: string;
  readonly plan: Plan;
  readonly scenariosOfExp: readonly ScenarioId[];
}

export function runJob(j: Job): ScenarioRun {
  const exp = { id: j.expId, label: "", variants: [j.variant], scenarios: j.scenariosOfExp, strategy: findStrategy(j.strategyId) };
  return runScenario(exp, j.variant, j.scenario, j.seed, j.plan);
}

export async function runJobs(jobs: readonly Job[], threads: number, onProgress: (done: number, total: number) => void): Promise<ScenarioRun[]> {
  const results = new Array<ScenarioRun>(jobs.length);
  let done = 0;
  if (threads <= 1) {
    jobs.forEach((j, i) => {
      results[i] = runJob(j);
      onProgress(++done, jobs.length);
    });
    return results;
  }
  // Los jobs más caros primero (E1/E2) para equilibrar la carga.
  const cost = (j: Job): number => (j.scenario === "E1" || j.scenario === "E2" ? j.plan.e1.N * j.plan.e1.gens : j.scenario === "E4" ? j.plan.e4.trialsPerSeed * 30 : 250 * j.plan.e3.gens);
  const order = jobs.map((_, i) => i).sort((a, b) => cost(jobs[b] as Job) - cost(jobs[a] as Job) || a - b);
  let next = 0;
  await new Promise<void>((resolve, reject) => {
    let alive = 0;
    const n = Math.min(threads, jobs.length);
    for (let t = 0; t < n; t++) {
      const w = new Worker(new URL("./pool-worker.ts", import.meta.url));
      alive++;
      let current = -1;
      const feed = (): void => {
        if (next >= order.length) {
          void w.terminate();
          if (--alive === 0) resolve();
          return;
        }
        current = order[next++] as number;
        w.postMessage(jobs[current]);
      };
      w.on("message", (r: ScenarioRun) => {
        results[current] = r;
        onProgress(++done, jobs.length);
        feed();
      });
      w.on("error", reject);
      feed();
    }
  });
  return results;
}
