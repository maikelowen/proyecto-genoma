# Informe de combate v0.4 — Proyecto Genoma

Generado por `sim/v04` desde el commit `c6d1835` (más cambios locales si los hay). Huellas sha256 de la config efectiva (combate + movimientos): base `74f9b545ddb3`, A `fff9c16de2e3`, B `6c3e0b368659`, C `2c1c71b3a72c`, D `9ddc141f60d6`, E `13230eef4576`, F `19ed134d27f5`, ajuste `13230eef4576`, sinprov `387fd22d4a65`. Propuesta `config/propuestas/combate-v0.4.1.json` con huella `478bd0cc3bb5`. Semillas: base `base04`, elegir `elige03`, validar `valida04`; ninguna se había usado antes. Tiempos: base 82 s (completo), elegir 181 s (completo), validar 230 s (completo).

## Resumen ejecutivo

- **v0.4 base (base04):** aprueba 8 de 12 criterios; suspende remontada (72,7 %); remontada (71,1 %); uso de pago (1,98); familias (c2) (2).
- **Ajuste v0.4.1 (valida04, semillas nuevas):** aprueba 9 de 12 (la base, con las mismas semillas: 8). Gana: pagos. Pierde: nada. Empeora aunque ya suspendía: primer_ko, familias. Suspende: primer_ko, lider_t3, familias.
- **Profundidad:** 81,6 % (77,9 %–85,4 %) en la base y 83,3 % (79,6 %–86,9 %) en el ajuste (400 partidas cada una): supera el 60 % con holgura; el plan B (recuperar la elección de objetivo) no hace falta.
- **Control R-02 (sin provocar):** profundidad 78,5 % (74,5 %–82,5 %) frente a 81,6 % (77,9 %–85,4 %) con provocar: provocar suma 3,1 puntos a favor de la búsqueda, pero sin provocar también supera el umbral.
- **Recomendación:** no adoptar el parche tal cual: arregla pagos pero empeora primer_ko, familias; siguen suspendidas primer_ko, lider_t3, familias, que las palancas de config no resuelven (decisión de diseño abajo).

## Criterios: base frente a ajuste

| Criterio | Umbral | Base (base04) | Base (valida04) | Ajuste v0.4.1 (valida04) |
|---|---|---|---|---|
| Profundidad: Búsqueda vs mejor IA de reglas (400 partidas) | > 60 % | 82,1 % (78,4 %–85,9 %) · aprobado | 81,6 % (77,9 %–85,4 %) · aprobado | 83,3 % (79,6 %–86,9 %) · aprobado |
| Remontada: Gana quien hace el primer KO | < 65 % | 72,7 % (71,6 %–73,8 %) · suspendido | 73,3 % (72,1 %–74,4 %) · suspendido | 74,7 % (73,6 %–75,8 %) · suspendido |
| Remontada: Gana el líder de vida tras el turno 3 | < 65 % | 71,1 % (69,9 %–72,3 %) · suspendido | 72,3 % (71,2 %–73,5 %) · suspendido | 70,8 % (69,6 %–72,0 %) · suspendido |
| Duración: Turnos medios (C1) | 6–10 | 7,57 (7,50–7,65) · aprobado | 7,61 (7,54–7,69) · aprobado | 8,32 (8,25–8,40) · aprobado |
| Duración: Turnos p90 (C1) | ≤ 14 | 12,00 · aprobado | 12,00 · aprobado | 13,00 · aprobado |
| Duración: Empates (C1) | ≤ 3 % | 0,7 % (0,5 %–0,9 %) · aprobado | 0,8 % (0,6 %–1,1 %) · aprobado | 0,7 % (0,5 %–0,9 %) · aprobado |
| Gratis: Acciones que son el movimiento gratis | ≤ 50 % | 48,6 % (48,4 %–48,8 %) · aprobado | 48,6 % (48,4 %–48,8 %) · aprobado | 39,6 % (39,4 %–39,8 %) · aprobado |
| Uso de pago: Movimientos de pago distintos por alma (de 3; almas con ≥ 4 acciones) | ≥ 2 | 1,98 (1,97–1,99) · suspendido | 1,98 (1,97–1,99) · suspendido | 2,15 (2,14–2,16) · aprobado |
| Provocar: Usos de provocar por partida (informativo) | ≥ 0.3 | 0,89 · informativo | 0,91 · informativo | 1,12 · informativo |
| Colocación: Mayor tasa de una colocación contra otra (1+2 vs 2+1) | ≤ 60 % | 54,8 % (51,4 %–58,2 %) · aprobado | 56,0 % (52,6 %–59,4 %) · aprobado | 52,9 % (49,5 %–56,4 %) · aprobado |
| Tanque: Turnos medios con tanque y apoyo detrás | ≤ 10 | 8,09 (7,96–8,23) · aprobado | 8,38 (8,24–8,53) · aprobado | 8,83 (8,69–8,97) · aprobado |
| Catálogo: Familias sin ningún movimiento de alcance o área | 0 de 13 | 0 · aprobado | 0 · aprobado | 0 · aprobado |
| Familias (C2): Familias fuera de 43 %–57 % (de 13) | 0 | 2 · suspendido (frágil) | 3 · suspendido (frágil) | 4 · suspendido (frágil) |
| Remontada: Primer KO, partidas espejo (informativo) | < 65 % | — | 69,9 % (68,3 %–71,6 %) · informativo | 72,7 % (71,0 %–74,2 %) · informativo |
| Remontada: Líder de vida T3, partidas espejo (informativo) | < 65 % | — | 66,0 % (64,2 %–67,7 %) · informativo | 67,4 % (65,7 %–69,1 %) · informativo |

IC 95 % entre paréntesis (Wilson para proporciones, normal para medias, estadísticos de orden para el p90). «Frágil» = el IC cruza el umbral. Colocación: máxima tasa de una colocación contra otra entre los 10 pares de {2+1, 1+2, regla IA y las variantes de carril 2+1c y 1+2c}, mismo equipo en los dos lados; es el máximo de 10 comparaciones, así que tiende a sobrestimar. Catálogo: exacto para las 6 familias base (72 genes); para las 7 híbridas, muestra de 300 claves.

- **base · Colocación:** 1+2 vs 2+1 56,0 %; ia vs 2+1 50,6 %; 2+1 vs 2+1c 51,2 %; 1+2c vs 2+1 53,0 %; 1+2 vs ia 52,1 %; 1+2 vs 2+1c 51,8 %; 1+2c vs 1+2 52,1 %; ia vs 2+1c 51,6 %; 1+2c vs ia 54,4 %; 1+2c vs 2+1c 52,9 %
- **base · Catálogo:** mínimo por familia: 4 movimientos
- **base · Familias (C2):** de 40,0 % (llama) a 60,1 % (roca); fuera: llama 40,0 %, brote 42,3 %, roca 60,1 %

- **ajuste · Colocación:** 1+2 vs 2+1 51,6 %; ia vs 2+1 51,4 %; 2+1 vs 2+1c 52,9 %; 1+2c vs 2+1 51,3 %; ia vs 1+2 51,8 %; 1+2 vs 2+1c 50,1 %; 1+2 vs 1+2c 51,1 %; 2+1c vs ia 51,2 %; ia vs 1+2c 50,4 %; 2+1c vs 1+2c 51,4 %
- **ajuste · Catálogo:** mínimo por familia: 4 movimientos
- **ajuste · Familias (C2):** de 31,7 % (llama) a 60,6 % (roca); fuera: llama 31,7 %, roca 60,6 %, voltio 41,0 %, liquen 59,0 %

### Familias (C2): tasa contra las otras 12

| Familia | Base | Ajuste |
|---|---|---|
| marea | 51,1 % | 50,1 % |
| llama | 40,0 % | 31,7 % |
| brote | 42,3 % | 51,8 % |
| roca | 60,1 % | 60,6 % |
| voltio | 49,7 % | 41,0 % |
| sombra | 47,8 % | 45,3 % |
| vapor | 50,1 % | 50,4 % |
| magma | 53,4 % | 56,0 % |
| espora | 48,8 % | 52,5 % |
| liquen | 53,0 % | 59,0 % |
| plasma | 49,6 % | 45,3 % |
| tormenta | 51,0 % | 50,7 % |
| abismo | 53,0 % | 55,4 % |

**Remontada.** Con equipos distintos gana el primer KO el 73,3 % y con el mismo equipo en los dos lados (sin diferencia de fuerza) el 69,9 %: casi todo el efecto es bola de nieve de la propia mecánica de 3 almas, no diferencias de equipo. En v0.3 la base (4 almas) daba 63,9 % y 62,0 % en espejo. Con 3 almas cada KO quita un tercio del equipo y la energía compartida no compensa.

## Qué se ajustó (una sola ronda)

Seis candidatas contra la base, con semillas de elegir `elige03` (C1 4000, espejo 2000, C2 250/pareja, colocación 600/par, tanque 1500; sin profundidad). Regla de elección escrita antes de ver los datos de elegir: más criterios aprobados (de los medidos en esta fase); desempate, menos familias fuera de banda.

| Candidata | Cambios | Aprobados | 1.er KO | Líder T3 | Turnos | Gratis | Pago/alma | Familias fuera | Tanque |
|---|---|---|---|---|---|---|---|---|---|
| v0.4 base | sin cambios | 7/11 | 72,6 % | 71,7 % | 7,59 | 48,8 % | 1,97 | 3 | 8,14 |
| A: vida 340 | `estadisticas.vida.base` = 340 | 7/11 | 72,5 % | 69,7 % | 8,53 | 49,2 % | 1,97 | 2 | 9,03 |
| B: A + coste 1 = 8 | `estadisticas.vida.base` = 340; `presupuesto_por_coste.1` = 8 | 7/11 | 74,5 % | 70,5 % | 8,49 | 49,3 % | 1,96 | 2 | 9,07 |
| C: B + roca provocar 0,4 | `estadisticas.vida.base` = 340; `presupuesto_por_coste.1` = 8; `provocar.probabilidad_familia.roca` = 0.4; `criterios_sim.cuotas_catalogo.provocar.roca_min` = 1; `criterios_sim.cuotas_catalogo.provocar.total_min` = 3 | 7/11 | 71,3 % | 69,8 % | 8,61 | 49,0 % | 1,98 | 3 | 9,18 |
| D: C + brote sin provocar | `estadisticas.vida.base` = 340; `presupuesto_por_coste.1` = 8; `provocar.probabilidad_familia.roca` = 0.4; `criterios_sim.cuotas_catalogo.provocar.roca_min` = 1; `criterios_sim.cuotas_catalogo.provocar.total_min` = 3; `provocar.probabilidad_familia.brote` = 0; `criterios_sim.cuotas_catalogo.provocar.brote_min` = 0; sal `brote.cuerpo.1` = null | 7/11 | 71,6 % | 69,2 % | 8,34 | 49,7 % | 1,96 | 2 | 8,85 |
| E: energía 5, vida 390 | `energia.por_turno` = 5; `energia.inicial` = 5; `estadisticas.vida.base` = 390 | 8/11 | 75,6 % | 71,1 % | 8,22 | 39,8 % | 2,13 | 4 | 8,50 |
| F: B + sinergia 0,05/0,15 | `estadisticas.vida.base` = 340; `sinergia.bonus_por_n` = {"2":0.05,"3":0.15}; `presupuesto_por_coste.1` = 8 | 7/11 | 73,0 % | 68,5 % | 8,53 | 49,5 % | 1,96 | 3 | 9,04 |

Elegida por la regla: **E: energía 5, vida 390**. Candidatas que aprueban remontada: ninguna; que aprueban familias: ninguna.

**Parche validado:** `energia.inicial` = 5; `energia.por_turno` = 5; `estadisticas.vida.base` = 390. Se comprobó, antes de simular, que cada ruta existe en la base (no se crea), que su valor cambia y que la config parseada cambia de verdad (catálogo de movimientos, estadísticas y una partida de prueba) (Revisor R-01).

## Notas metodológicas y limitaciones

- **R-02: la IA de referencia nunca ve un provocar.** Dura 1 turno y con elección simultánea ya caducó cuando decide, y se provoca ~0,9 veces por partida: eso sesga la profundidad a favor de la búsqueda (que sí simula el turno). El control sin provocar (arriba) acota ese sesgo.
- Profundidad = búsqueda contra `createReferenceAi()` con equipos espejo y colocación de la IA, cada equipo en A y en B; el rival modela la política exacta, el mejor caso para la búsqueda. Mide profundidad contra IA, no contra personas.
- La colocación se compara con orden de equipo fijo (no «la mejor de las 24»): una colocación puede valer más con otra asignación de almas.
- Familias: equipos monofamilia con salvajes puros; las híbridas se construyen como en v0.2 con 3 almas. No se repitieron las sales r*/c* del catálogo §5.2 (fuera del presupuesto de una ronda); es la palanca que queda para llama y roca.
- Uso de pago mide movimientos de pago distintos usados por alma con ≥ 4 acciones; la base queda en el límite del umbral (1,98 frente a 2).

## Decisión que necesita el dueño

**Remontada (primer KO y líder T3 < 65 %) no se resuelve con palancas de config en equipos de 3.** Opciones: (a) relajar el umbral a 75 % para 3 almas (recomendado si se acepta que el combate corto es decisivo), (b) un mecanismo de remontada (p. ej. energía extra al bando con menos almas, o curar al volver a la fila), a especificar y simular, (c) volver a 4 almas. Para familias, repetir la búsqueda de sales §5.2 con el catálogo v0.4 (llama 32–40 %, roca ≈ 60 %).
