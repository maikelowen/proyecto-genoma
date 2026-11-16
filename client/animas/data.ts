/** Config de progresión y textos del juego de ánimas. Solo usa la API pública del núcleo. */
import rawP from "../../config/progresion.v0.1.json" with { type: "json" };
import { parseProgressionConfig, type ProgressionConfig } from "../../packages/core/src/index.ts";
import { cfg } from "../combat/data.ts";

export const pcfg: ProgressionConfig = parseProgressionConfig(rawP, cfg);

interface Personaje {
  readonly id: string;
  readonly nombre: string;
  readonly titulo: string;
  readonly texto_inicio: readonly string[];
}
const mundo = (rawP as unknown as { mundo: { personajes: Personaje[] } }).mundo;
/** Arnal, el farolero del santuario (config `mundo.personajes`, texto provisional). */
export const ARNAL: Personaje = mundo.personajes[0] as Personaje;

/** Ánima del hechicero que lucha a tu lado (no se guarda). */
export const COMPANION_NAME = "Umbra de Arnal";

/** Hito D-066 de la fase: lo que se muestra como progreso de la prueba. */
export const HITO = { sesiones: 3, resonancias: 20, nivelAlto: 20 };

export const ZONE_BLURB: Record<string, string> = {
  prado_linde: "Hierba baja y farolillos apagados. Ánimas jóvenes y poco tímidas.",
  marismas_quietas: "Agua quieta y niebla. Ánimas ya maduras que se defienden.",
  cantil_farol_roto: "El borde donde se rompió el Gran Farol. Grupos grandes y de mucho carácter.",
};

export const ESSENCE_NOTE = "La esencia es lo que cuesta resonar; se gana al apagar salvajes y al liberar ánimas maduras.";
