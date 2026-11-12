/**
 * Ajuste ligero (encargo: uno, sin búsquedas amplias). Candidatas declaradas aquí como parches sobre una
 * combinación; se miden con semillas de elegir y la elegida (regla escrita en `choose`) se valida con semillas nuevas.
 */
export interface Candidate {
  readonly base: string;
  readonly id: string;
  readonly label: string;
  readonly combat: Record<string, unknown>;
  readonly moves: Record<string, unknown>;
  readonly adjust: string;
}

export const CANDIDATES: readonly Candidate[] = [];

import type { Kind } from "./games.ts";
import type { PhaseFile } from "./cli.ts";

/** Escenarios que se miden al elegir (los que tocan el criterio que se quiere arreglar). */
export const ADJUST_KINDS: readonly Kind[] = ["C1", "C2"];

/** Regla de elección (se rellena junto con las candidatas). */
export function chosenCandidate(_elegir: PhaseFile): Candidate | null {
  return null;
}
