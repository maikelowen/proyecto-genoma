/** Hilo de trabajo de la medida de profundidad. */
import { parentPort } from "node:worker_threads";
import { runDepthJob, type DepthJob } from "./games.ts";

const port = parentPort;
if (!port) throw new Error("worker.ts debe ejecutarse como worker");
port.on("message", (j: DepthJob) => port.postMessage(runDepthJob(j)));
