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

// ------------------------------------------------------------------ mundo caminable (D-074, spec mundo v0.1)
import rawW from "../../config/mundo.v0.1.json" with { type: "json" };
import { parseWorldConfig, type WorldConfig } from "../../packages/core/src/index.ts";

export const wcfg: WorldConfig = parseWorldConfig(rawW, pcfg, mundo.personajes.map((p) => p.id));

/** Bloque `presentacion` del JSON del mundo: solo lo lee el cliente (el núcleo no lo valida). */
export interface WorldLook {
  readonly semilla_visual: string;
  readonly fondo: string;
  readonly luz_ambiente: { readonly velo: string; readonly velo_alfa: number; readonly vineta_alfa: number };
  readonly casillas: Readonly<Record<string, { readonly colores: readonly string[] }>>;
  readonly personajes: {
    readonly farolero: Readonly<Record<string, string | number>>;
    readonly arnal: Readonly<Record<string, string>>;
    readonly vecinos: Readonly<Record<string, Readonly<Record<string, string>>>>;
    readonly aviso: string;
  };
  readonly ambiente: {
    readonly luciernagas: { readonly max: number; readonly colores: readonly string[] };
    readonly motas_farol: { readonly max: number };
    readonly hojas: { readonly max: number };
    readonly hierba_mece_ms: number;
    readonly hierba_espesa_mece_ms: number;
    readonly agua_brillo_ms: number;
    readonly puerta_respira_ms: number;
  };
  readonly asomo: { readonly cada_ms: readonly [number, number]; readonly dura_ms: number; readonly distancia_casillas: readonly [number, number] };
  readonly transicion_encuentro: { readonly temblor_ms: number; readonly ojos_ms: number; readonly destello_ms: number; readonly vineta_ms: number; readonly total_ms: number };
  readonly rendimiento: { readonly particulas_max: number; readonly modo_reducido_si_frame_ms_mayor_que: number };
  readonly escala: { readonly casilla_css_px: { readonly movil: number; readonly escritorio: number }; readonly ancho_corte_css_px: number; readonly bloque_cache_casillas: number; readonly vista_casillas: { readonly movil: readonly number[]; readonly escritorio: readonly number[] } };
  readonly animacion: { readonly respirar_ms: number };
}
export const LOOK: WorldLook = (rawW as unknown as { presentacion: WorldLook }).presentacion;
