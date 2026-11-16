/** Hilo de trabajo del simulador de progresión: cada mensaje es un lote de partidas. */
import { parentPort } from "node:worker_threads";
import { runBatch, type Batch } from "./lote.ts";

const port = parentPort;
if (!port) throw new Error("worker.ts debe ejecutarse como worker");
port.on("message", (b: Batch) => port.postMessage(runBatch(b)));
