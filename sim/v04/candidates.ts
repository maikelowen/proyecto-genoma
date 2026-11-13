/**
 * Candidatas de la ronda de ajuste (una sola). Parches por ruta sobre la base v0.4 (nunca sobre config/).
 * Se miden con semillas de elegir (`elige03`) y la elegida se escribe en `config/propuestas/combate-v0.4.1.json`.
 * Motivo (base04): suspenden remontada (primer KO 72,7 %, líder T3 71,1 %), uso de pago (1,98 de 2) y familias (llama y roca).
 *   A  vida 340: partidas más largas, cada KO pesa menos del total.
 *   B  A + presupuesto del coste 1 = 8: pagar vale más que el gratis (uso de pago).
 *   C  B + roca con provocar 0,4 (cuota roca_min 1): diagnóstico y arreglo de roca (60,3 %).
 *   D  C + brote sin provocar (cuota brote_min 0, sin la sal p2): "si provocar hunde a Brote, quítaselo".
 *   E  energía 5, vida 390, coste 1 = 7: más pagos por turno (V3 rompía la remontada en v0.3).
 *   F  B + sinergia 0,05 / 0,15: menos ventaja del equipo que ya va por delante.
 */
import type { Variant } from "./setup.ts";

const v = (id: string, label: string, combat: Record<string, unknown>, moves: Record<string, unknown>, salts: Record<string, string | null> = {}): Variant => ({ id, label, combat, moves, salts });

const A = { "estadisticas.vida.base": 340 };
const B_M = { "presupuesto_por_coste.1": 8 };
const ROCA = { "provocar.probabilidad_familia.roca": 0.4, "criterios_sim.cuotas_catalogo.provocar.roca_min": 1, "criterios_sim.cuotas_catalogo.provocar.total_min": 3 };
const BROTE = { "provocar.probabilidad_familia.brote": 0, "criterios_sim.cuotas_catalogo.provocar.brote_min": 0 };

export const CANDIDATES: readonly Variant[] = [
  v("A", "A: vida 340", A, {}),
  v("B", "B: A + coste 1 = 8", A, B_M),
  v("C", "C: B + roca provocar 0,4", A, { ...B_M, ...ROCA }),
  v("D", "D: C + brote sin provocar", A, { ...B_M, ...ROCA, ...BROTE }, { "brote.cuerpo.1": null }),
  v("E", "E: energía 5, vida 390", { "energia.por_turno": 5, "energia.inicial": 5, "estadisticas.vida.base": 390 }, {}),
  v("F", "F: B + sinergia 0,05/0,15", { ...A, "sinergia.bonus_por_n": { "2": 0.05, "3": 0.15 } }, B_M),
];
