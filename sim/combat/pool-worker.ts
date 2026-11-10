/** Hilo de trabajo: recibe un Job de combate y devuelve su JobResult. */
import { parentPort } from "node:worker_threads";
import { runJob, type Job } from "./jobs.ts";

const port = parentPort;
if (!port) throw new Error("pool-worker.ts debe ejecutarse como worker");
port.on("message", (j: Job) => port.postMessage(runJob(j)));
