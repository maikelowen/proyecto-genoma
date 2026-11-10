/** Hilo de trabajo: recibe un Job, devuelve su ScenarioRun. */
import { parentPort } from "node:worker_threads";
import { runJob, type Job } from "./pool.ts";

const port = parentPort;
if (!port) throw new Error("pool-worker.ts debe ejecutarse como worker");
port.on("message", (j: Job) => port.postMessage(runJob(j)));
