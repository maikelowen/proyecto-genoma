# Ajuste de familias (sales v0.4.1) — Proyecto Genoma

Generado por `sim/v04/salts.ts` (búsqueda) y `sim/v04/validar-sales.ts` (validación). Huella de la config efectiva (combate + movimientos): base `74f9b545ddb3`, con sales `7a7258726cba`. Semillas: búsqueda `elige05`, validación `valida05` (nuevas; ninguna de base04, elige03, valida04 ni anteriores). Modo completo; validación 48 s; búsqueda 81 s.

## Resumen

- Familias fuera de 43,0 %–57,0 % con la base: 2 (llama, roca); con las sales: **0** (ninguna), en validación con semillas nuevas.
- Solo cambian sales de genes del catálogo (`overrides_catalogo.sales`); energía, vida y demás palancas no se tocan.

## Sales de la búsqueda

Procedimiento fijo (sin criterio a ojo): cada ronda mide C2 de las 13 familias; para las familias base fuera de la banda de búsqueda, cada gen de pago (cabeza, cuerpo, cola; extremidades = movimiento gratis, no se sala) prueba c1…c4 respetando las cuotas del catálogo, y se queda la que más acerca la familia al 50 % si mejora ≥ 1 punto.

Parámetros: banda de búsqueda 46,5 %–53,5 %, 100 combates por pareja para medir y 100 por candidata, 2 rondas como máximo.

| Ronda | Familia | Gen | Sal (antes → después) | Tasa antes → después (búsqueda) | Candidatas |
|---|---|---|---|---|---|
| 1 | llama | `llama.cabeza.3` | — → c4 | 39,9 % → 50,3 % | 15 |
| 1 | brote | `brote.cola.2` | — → c1 | 41,5 % → 47,8 % | 19 |
| 1 | roca | `roca.cola.2` | — → c4 | 60,8 % → 50,3 % | 22 |
| 2 | brote | `brote.cuerpo.2` | — → c3 | 42,0 % → 46,8 % | 20 |

Sales nuevas o cambiadas aplicadas: `llama.cabeza.3` = c4, `brote.cola.2` = c1, `roca.cola.2` = c4, `brote.cuerpo.2` = c3.

## Familias antes y después (validación, tasa contra las otras 12)

| Familia | Base | Con sales | En banda |
|---|---|---|---|
| marea | 50,8 % | 49,2 % (47,8 %–50,6 %) | sí |
| llama | 41,0 % | 50,2 % (48,8 %–51,6 %) | sí |
| brote | 44,2 % | 49,9 % (48,5 %–51,3 %) | sí |
| roca | 60,2 % | 49,5 % (48,1 %–50,9 %) | sí |
| voltio | 49,5 % | 48,4 % (47,0 %–49,8 %) | sí |
| sombra | 48,8 % | 47,9 % (46,5 %–49,3 %) | sí |
| vapor | 50,3 % | 51,2 % (49,8 %–52,6 %) | sí |
| magma | 53,2 % | 53,0 % (51,6 %–54,4 %) | sí |
| espora | 46,8 % | 48,5 % (47,1 %–49,9 %) | sí |
| liquen | 51,8 % | 50,5 % (49,1 %–52,0 %) | sí |
| plasma | 49,4 % | 50,2 % (48,8 %–51,6 %) | sí |
| tormenta | 51,5 % | 51,6 % (50,2 %–53,0 %) | sí |
| abismo | 52,5 % | 49,9 % (48,5 %–51,3 %) | sí |

400 combates por pareja (78 parejas), lados alternos, mismas semillas en las dos configuraciones.

## Criterios (misma validación)

| Criterio | Umbral | Base | Con sales |
|---|---|---|---|
| Duración: Turnos medios (C1) | 6–10 | 7,62 (7,52–7,71) · aprobado | 7,28 (7,19–7,37) · aprobado |
| Duración: Turnos p90 (C1) | ≤ 14 | 12,00 · aprobado | 12,00 (11,00–12,00) · aprobado |
| Duración: Empates (C1) | ≤ 3 % | 0,9 % (0,7 %–1,3 %) · aprobado | 0,8 % (0,6 %–1,2 %) · aprobado |
| Gratis: Acciones que son el movimiento gratis | ≤ 50 % | 48,6 % (48,3 %–48,8 %) · aprobado | 48,9 % (48,6 %–49,2 %) · aprobado |
| Colocación: Mayor tasa de una colocación contra otra (1+2 vs 2+1) | ≤ 60 % | 58,0 % (54,4 %–61,6 %) · aprobado (frágil) | 54,6 % (51,0 %–58,3 %) · aprobado |
| Tanque: Turnos medios con tanque y apoyo detrás | ≤ 10 | 8,24 (8,10–8,39) · aprobado | 8,00 (7,86–8,13) · aprobado |
| Catálogo: Familias sin ningún movimiento de alcance o área | 0 de 13 | 0 · aprobado | 0 · aprobado |
| Familias (C2): Familias fuera de 43 %–57 % (de 13) | 0 | 2 · suspendido (frágil) | 0 · aprobado |
| Uso de pago: Movimientos de pago distintos por alma (de 3; almas con ≥ 4 acciones) | ≥ 2 | 1,97 (1,96–1,98) · suspendido | 1,96 (1,95–1,97) · suspendido |
| Provocar: Usos de provocar por partida (informativo) | ≥ 0.3 | 0,93 · informativo | 0,90 · informativo |
| Remontada: Gana quien hace el primer KO | < 65 % | 71,5 % (70,0 %–72,8 %) · suspendido | 72,1 % (70,7 %–73,4 %) · suspendido |
| Remontada: Gana el líder de vida tras el turno 3 | < 65 % | 71,4 % (70,0 %–72,8 %) · suspendido | 71,5 % (70,1 %–72,9 %) · suspendido |

Cuotas del catálogo con las sales: provocar 4, alcance/área mín 4; cuotas por familia base (apoyo, máximo por arquetipo, golpe, golpe_estado): incumple sombra. Remontada (primer KO y líder T3) y pagos son criterios abiertos de v0.4 que esta ronda no pretende resolver; profundidad no se remide porque no cambian reglas.

**Ningún criterio que la base aprobaba pasa a suspender con las sales.**
