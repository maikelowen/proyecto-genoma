/** Hilo de trabajo del estudio de variantes. El primer mensaje registra las candidatas de ajuste; los demás son trabajos. */
import { parentPort } from "node:worker_threads";
import type { Candidate } from "./adjust.ts";
import { registerCombo } from "./combos.ts";
import { runVJob, type VJob } from "./games.ts";

const port = parentPort;
if (!port) throw new Error("worker.ts debe ejecutarse como worker");
port.on("message", (m: VJob | { extra: readonly Candidate[] }) => {
  if ("extra" in m) for (const c of m.extra) registerCombo(c.base, c.id, c.label, c.combat, c.moves, c.adjust);
  else port.postMessage(runVJob(m));
});
