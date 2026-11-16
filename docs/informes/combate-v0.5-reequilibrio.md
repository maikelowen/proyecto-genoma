# Reequilibrio de familias para el combate v0.5 — Proyecto Genoma

Generado por `sim/v05/reequilibrio-buscar.ts` (búsqueda) y `sim/v05/reequilibrio-validar.ts` (validación) desde el commit `2a836af` (más cambios locales si los hay). Huellas (sha256 de la config efectiva, 12 hex): combate `config/combate.v0.5.json` + `ambas` con movimientos v0.4 `9b7286111b3f`; con las sales `fbed27e979b5`; fichero `config/movimientos.v0.5.json` `a6b5f06daa85` (sales idénticas a las validadas). Semillas: búsqueda `elige06`, validación `valida06` (nuevas, ni `v05|` ni las de v0.4). Modo completo, 129 s con 4 hilos.

## Resumen

- Familias fuera de 43,0 %–57,0 % con `ambas` sin las sales: **4** (llama, brote, roca, sombra); con 6 sales: **0** (ninguna), en validación con semillas nuevas.
- Ningún criterio que aprobaba con `ambas` pasa a suspender con las sales.
- Solo cambian sales de genes del catálogo (`overrides_catalogo.sales`); reglas, energía y vida no se tocan. Las sales viven en `config/movimientos.v0.5.json`; `config/movimientos.v0.4.json` queda intacto.

## Sales

Procedimiento (el de v0.4, `sim/v04/salts.ts`): cada ronda mide C2 de las 13 familias (200 combates por pareja); las familias base fuera de la banda de búsqueda (46,5 %–53,5 %), de la más alejada a la menos (máx. 2 por ronda), prueban cada gen de pago con c1…c4 respetando las cuotas del catálogo, con 160 combates por pareja y candidata, y se aplica la que más acerca la familia al 50 % (mejora ≥ 1 punto). Se permite sustituir sales existentes.

| Ronda | Familia | Gen | Sal (antes → después) | Tasa antes → después (búsqueda) | Candidatas |
|---|---|---|---|---|---|
| 1 | sombra | `sombra.cuerpo.3` | c3 → c4 | 64,0 % → 62,1 % | 8 |
| 1 | brote | `brote.cuerpo.2` | c3 → c1 | 40,2 % → 51,3 % | 19 |
| 2 | roca | `roca.cuerpo.2` | — → c1 | 40,3 % → 48,5 % | 18 |
| 2 | sombra | `sombra.cola.2` | — → c2 | 58,4 % → 50,6 % | 27 |
| 3 | llama | `llama.cola.2` | — → c2 | 41,1 % → 49,7 % | 28 |
| 3 | sombra | `sombra.cuerpo.1` | r2 → c3 | 52,7 % → 50,0 % | 24 |

Sales aplicadas sobre el catálogo v0.4: `sombra.cuerpo.1` = c3, `sombra.cuerpo.3` = c4, `brote.cuerpo.2` = c1, `roca.cuerpo.2` = c1, `sombra.cola.2` = c2, `llama.cola.2` = c2.

## Familias antes y después (validación, tasa contra las otras 12)

| Familia | ambas sin sales | ambas con sales | En banda |
|---|---|---|---|
| marea | 50,7 % | 46,1 % (44,5 %–47,7 %) | sí |
| llama | 41,3 % (fuera) | 47,8 % (46,2 %–49,4 %) | sí |
| brote | 39,9 % (fuera) | 50,9 % (49,3 %–52,5 %) | sí |
| roca | 40,4 % (fuera) | 48,3 % (46,6 %–49,9 %) | sí |
| voltio | 53,3 % | 52,6 % (51,0 %–54,2 %) | sí |
| sombra | 63,2 % (fuera) | 50,0 % (48,4 %–51,6 %) | sí |
| vapor | 52,2 % | 50,2 % (48,6 %–51,9 %) | sí |
| magma | 48,5 % | 48,8 % (47,1 %–50,4 %) | sí |
| espora | 52,1 % | 53,3 % (51,6 %–54,9 %) | sí |
| liquen | 47,9 % | 49,1 % (47,5 %–50,7 %) | sí |
| plasma | 54,0 % | 52,0 % (50,3 %–53,6 %) | sí |
| tormenta | 54,1 % | 51,4 % (49,8 %–53,0 %) | sí |
| abismo | 52,4 % | 49,6 % (48,0 %–51,2 %) | sí |

300 combates por pareja (78 parejas), lados alternos, mismos equipos y partidas en las dos configuraciones.

## Criterios (misma validación)

| Criterio | Umbral | ambas sin sales | ambas con sales |
|---|---|---|---|
| Duración: Turnos medios (C1) | 6–10 | 8,63 (8,56–8,69) · aprobado | 8,19 (8,12–8,25) · aprobado |
| Duración: Turnos p90 (C1) | ≤ 14 | 12,00 (12,00–13,00) · aprobado | 12,00 · aprobado |
| Duración: Empates (C1) | ≤ 3 % | 0,4 % (0,3 %–0,6 %) · aprobado | 0,3 % (0,2 %–0,5 %) · aprobado |
| Gratis: Acciones que son el movimiento gratis | ≤ 50 % | 60,2 % (60,0 %–60,4 %) · suspendido | 62,3 % (62,1 %–62,5 %) · suspendido |
| Uso de pago: Movimientos de pago distintos por alma (de 3; almas con ≥ 4 acciones) | ≥ 2 | 1,64 (1,63–1,65) · suspendido | 1,61 (1,60–1,62) · suspendido |
| Remontada: Gana quien hace el primer KO | < 65 % | 70,2 % (69,1 %–71,4 %) · suspendido | 71,2 % (70,0 %–72,3 %) · suspendido |
| Remontada: Gana el líder de vida tras el turno 3 | < 65 % | 65,8 % (64,5 %–67,0 %) · suspendido (frágil) | 64,4 % (63,1 %–65,6 %) · aprobado (frágil) |
| Profundidad: Búsqueda vs mejor IA de reglas (400 partidas) | > 60 % | 84,6 % (81,1 %–88,2 %) · aprobado | 85,3 % (81,8 %–88,7 %) · aprobado |
| Catálogo: Familias sin ningún movimiento de alcance o área | 0 de 13 | 0 · aprobado | 0 · aprobado |
| Provocar: Usos de provocar por partida (informativo) | ≥ 0.3 | 0,81 · informativo | 0,80 · informativo |
| Familias (C2): Familias fuera de 43 %–57 % (de 13) | 0 | 4 · suspendido | 0 · aprobado |

Tamaños: C1 6000, espejo 1000, profundidad 400 partidas por config. Colocación y tanque no se miden (como en el informe v0.5).

## Conclusión

**Cumple:** 13/13 familias en banda con semillas nuevas.

Criterios que suspenden con las sales: primer_ko, gratis, pagos (en `ambas` sin sales: primer_ko, lider_t3, gratis, pagos, familias).
