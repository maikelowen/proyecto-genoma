/** Hilo de la búsqueda de sales v0.4: cada mensaje trae la variante (sales) y el trabajo. */
import { parentPort } from "node:worker_threads";
import { registerVariant } from "./configs.ts";
import { runVJob, type VJob } from "./games.ts";
import type { Variant } from "./setup.ts";

const port = parentPort;
if (!port) throw new Error("salts-worker.ts debe ejecutarse como worker");
port.on("message", (m: { v: Variant; job: VJob }) => {
  registerVariant(m.v);
  port.postMessage(runVJob(m.job));
});
