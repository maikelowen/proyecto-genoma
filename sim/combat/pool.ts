/**
 * Reparto de trabajos de combate entre hilos (worker_threads). Cada trabajo es
 * determinista, así que el resultado se reordena por índice y no depende del
 * nº de hilos.
 */
import { Worker } from "node:worker_threads";
import { runJob, type Job, type JobResult } from "./jobs.ts";

export async function runJobs(jobs: readonly Job[], threads: number, onProgress: (done: number, total: number) => void): Promise<JobResult[]> {
  const results = new Array<JobResult>(jobs.length);
  let done = 0;
  if (threads <= 1 || jobs.length <= 1) {
    jobs.forEach((j, i) => {
      results[i] = runJob(j);
      onProgress(++done, jobs.length);
    });
    return results;
  }
  let next = 0;
  await new Promise<void>((resolve, reject) => {
    let alive = 0;
    const n = Math.min(threads, jobs.length);
    for (let t = 0; t < n; t++) {
      const w = new Worker(new URL("./pool-worker.ts", import.meta.url));
      alive++;
      let current = -1;
      const feed = (): void => {
        if (next >= jobs.length) {
          void w.terminate();
          if (--alive === 0) resolve();
          return;
        }
        current = next++;
        w.postMessage(jobs[current]);
      };
      w.on("message", (r: JobResult) => {
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
