/** Hilo de trabajo del estudio v0.4. El primer mensaje registra las configuraciones extra; los demás son trabajos. */
import { parentPort } from "node:worker_threads";
import { registerVariant } from "./configs.ts";
import { runVJob, type VJob } from "./games.ts";
import type { Variant } from "./setup.ts";

const port = parentPort;
if (!port) throw new Error("worker.ts debe ejecutarse como worker");
port.on("message", (m: VJob | { extra: readonly Variant[] }) => {
  if ("extra" in m) for (const v of m.extra) registerVariant(v);
  else port.postMessage(runVJob(m));
});
