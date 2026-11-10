# Informe de combate v0.1 — Proyecto Genoma

Generado por `sim/combat` desde el commit `64a2bb1` (más cambios locales), configs combate + movimientos + genética v0.2 con huella sha256 `3822a3ee3d7e…`. Modo completo, 367 s. Semillas: evaluación de v0.1 `combate01-*`; elección de candidatas `elige01-*`; validación de la elegida `valida01-*` (con estas no se ha elegido nada).

## Resumen ejecutivo

- **La duración de v0.1 no cumple**: media 12,58 turnos, mediana 12, p90 17, empates 4,2 % (20.000 combates C1). Causa: falta energía; el 60 % de las acciones son golpes básicos y la IA casi nunca junta energía para movimientos de coste 5 (los usa en el 6 % de los turnos en que podría).
- **Familias desequilibradas**: 6 de 13 fuera de 45 %–55 % (de voltio 23,1 % a roca 72,4 %). Igualando las estadísticas (diagnóstico) el rango se estrecha a 30,0 %–60,3 %, pero quedan 9 fuera: pesan el perfil (la resistencia da más vida de lo que la velocidad da en iniciativa) y los movimientos. El arreglo de duración no lo corrige.
- Lado A 50,3 % (aprobado). Calidad máx. vs mín.: β 0 → 50,4 %, β 0,04 → 51,6 %, β 0,06 → 52,2 % (cumple D-008). Energía: guardar (u = 3) gana el 63,6 % (cumple).
- Movimientos (272: 72 del catálogo y 200 mutados): 0 rotos, 25 inútiles (10 del catálogo, 22 de coste 2), 0 de uso sospechoso. 40 de coste 4–5 no se usan nunca con la IA u = 0, así que la prueba no ve esos costes.
- **Recomendación v0.2: `energia.por_turno` 2 → **3**.** Arregla la duración (validada con `valida01`), pero sigue suspendiendo: familia más alejada del 50 % (voltio). Las familias necesitan una decisión aparte (abajo).

## Criterios de v0.1

8 de 13 criterios aprobados (sin contar informativos). "Frágil" = el IC 95 % cruza el umbral. Empate = ½ victoria en todas las tasas.

| Criterio | Umbral | Valor | IC 95 % | Semillas/grupos OK | Resultado |
|---|---|---:|---|---|---|
| Duración C1: Turnos, media | 7–12 | 12,58 | 12,53 – 12,62 | 0/5 | suspendido |
| Duración C1: Turnos, mediana | 7–11 | 12 | — | 0/5 | suspendido |
| Duración C1: Turnos, p90 | ≤ 15 | 17 | — | 0/5 | suspendido |
| Duración C1: Empates | ≤ 3 % | 4,2 % | 3,9 % – 4,5 % | 0/5 | suspendido |
| Lado C1: Victorias de A (empate = ½) | 48,5 %–51,5 % | 50,3 % | 49,6 % – 51,0 % | 5/5 | aprobado |
| Iniciativa (inf.): Actúa antes la de más iniciativa base (Δ ≤ 5) | 50 %–65 % | 53,6 % | 53,5 % – 53,7 % | — | aprobado [inf.] |
| Familias C2: Familia más alejada del 50 % (voltio) | 45 %–55 % | 23,1 % | 22,0 % – 24,1 % | 7/13 | suspendido |
| D-008 C3: Calidad máx. vs mín., β = 0 (objetivo) | ≤ 55 % | 50,4 % | 48,9 % – 51,8 % | — | aprobado [inf.] |
| D-008 C3: Calidad máx. vs mín., β = 0 (límite) | ≤ 60 % | 50,4 % | 48,9 % – 51,8 % | — | aprobado [inf.] |
| D-008 C3: Calidad máx. vs mín., β = 0,04 (objetivo) | ≤ 55 % | 51,6 % | 50,7 % – 52,6 % | — | aprobado |
| D-008 C3: Calidad máx. vs mín., β = 0,04 (límite) | ≤ 60 % | 51,6 % | 50,7 % – 52,6 % | — | aprobado |
| D-008 C3: Calidad máx. vs mín., β = 0,06 (objetivo) | ≤ 55 % | 52,2 % | 50,7 % – 53,6 % | — | aprobado [inf.] |
| D-008 C3: Calidad máx. vs mín., β = 0,06 (límite) | ≤ 60 % | 52,2 % | 50,7 % – 53,6 % | — | aprobado [inf.] |
| Energía C4: Mejor reserva u > 0 contra u = 0 (u = 3) | ≥ 52 % | 63,6 % | 62,3 % – 64,9 % | — | aprobado |
| Energía C4: u = 0 contra su peor rival (u = 3) | ≥ 35 % | 36,4 % | 35,1 % – 37,7 % | — | aprobado |
| Movimientos §7: Catálogo roto (0 de 72) | ≤ 2 % | 0,0 % | 0,0 % – 5,1 % | — | aprobado (frágil) |
| Movimientos §7: Rotos graves (catálogo + muestra) | ≤ 0 | 0 | — | — | aprobado |
| Movimientos §5: Arquetipos distintos por familia del catálogo (mín.: llama) | ≥ 3 | 3 | — | 6/6 | aprobado |

Tamaños: C1 5 semillas × 4000; C2 500 por pareja (78 parejas; la spec pide 1000, reducido por presupuesto); C3 β 0: 4000, β 0,04: 10.000, β 0,06: 4000; C4 5000 por reserva; sustitución 400 por movimiento y +1600 si el IC cruza un umbral (spec: 2000), con 200 mutados (spec: 500).

## Duración (C1) y su causa

*Gráfico en el informe HTML: Distribución de turnos en C1.* La barra del turno 20 incluye los empates por tope.

| Config | Cambio | Semillas | N | Media | Mediana | p90 | Empates | …por tope | Golpes básicos |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|
| v01 | — | combate01 | 20.000 | 12,58 | 12 | 17 | 4,2 % | 3,9 % | 60 % |
| diag_vida180 | `estadisticas.vida_base` 220 → **180** | elige01 | 2000 | 11,1 | 11 | 16 | 3,8 % | 3,4 % | 58 % |
| diag_tope40 | `fin.turnos_max` 20 → **40** | elige01 | 2000 | 12,61 | 12 | 17 | 0,7 % | 0,2 % | 59 % |
| diag_ia_reserva3 | `ia.reserva_por_defecto` 0 → **3** | elige01 | 2000 | 10,19 | 10 | 14 | 0,9 % | 0,8 % | 66 % |
| energia3 | `energia.por_turno` 2 → **3** | elige01 | 4000 | 9,14 | 8 | 14 | 2,4 % | 2,2 % | 53 % |
| golpe20_desg8 | `dano.golpe_basico.potencia` 10 → **20**; `desgaste.desde_turno` 10 → **8** | elige01 | 4000 | 10,2 | 10 | 14 | 0,7 % | 0,5 % | 61 % |
| golpe20_desg050 | `dano.golpe_basico.potencia` 10 → **20**; `desgaste.por_turno` 0,25 → **0,5** | elige01 | 4000 | 10,55 | 11 | 14 | 0,6 % | 0,2 % | 61 % |
| energia3 | `energia.por_turno` 2 → **3** | valida01 (validación) | 10.000 | 9,14 | 8 | 15 | 2,6 % | 2,4 % | 53 % |

- **Energía, no vida.** Con 2 de energía por turno, el 60 % de las acciones son golpes básicos y los movimientos que se pagan son sobre todo baratos: los de coste 4–5 apenas se usan (tabla de abajo). Uso por arquetipo, en % de acciones: golpe 11 %, golpe_estado 10 %, proteccion 7 %, curacion 6 %, tactico 6 %, maldicion 1 %.
- Bajar la vida un 18 % (diagnóstico) deja la media en 11,1 y el p90 en 16: no basta.
- Sin tope efectivo (40 turnos, diagnóstico), los combates que hoy empatan por tope acaban casi todos: empates por tope 0,2 %, p90 17. Son combates lentos, no bloqueados: el desgaste llega tarde.
- Si las dos IA guardan energía (reserva 3, diagnóstico), la media baja a 10,19 y el p90 a 14: la IA de referencia, que gasta todo cada turno, alarga los combates porque malgasta el presupuesto convexo en movimientos baratos.
- La IA de referencia no puntúa la energía extra del táctico (nota de implementación 17d); el táctico es el 6 % de las acciones.
- Arreglo elegido: subir la energía por turno, que ataca la causa (más movimientos pagados por turno) con un solo parámetro. Las otras candidatas (golpe básico más fuerte + desgaste) acortan por fuerza bruta y dejan los movimientos igual de raros.

| Coste | Movimientos probados | Uso cuando puede pagarlo (IA u = 0) | Nunca usados | Victorias medias |
|---|---:|---:|---:|---:|
| 1 | 39 | 16 % | 0 | 48,4 % |
| 2 | 57 | 23 % | 0 | 43,8 % |
| 3 | 67 | 19 % | 3 | 47,7 % |
| 4 | 68 | 14 % | 12 | 50,0 % |
| 5 | 41 | 6 % | 28 | 50,1 % |

## Familias (C2)

*Gráfico en el informe HTML: Tasa de victoria de cada familia contra las otras 12 (v0.1).* Base: equipos de 4 salvajes puros. Híbridas: decisión del analista (la spec no fija las estadísticas del D híbrido): 2 D híbridos con firma al azar y valores = media de los D de sus componentes, más 1 D de cada componente.

| Familia | v0.1 (combate01) | energia3 (valida01) | Diag.: energia3_statsiguales (elige01) | Diag.: energia3_vida025 (elige01) |
|---|---:|---:|---:|---:|
| roca | 72,4 % (71,3 %–73,5 %) | 67,7 % | 59,3 % | 57,1 % |
| magma | 69,8 % (68,6 %–70,9 %) | 67,4 % | 60,3 % | 63,2 % |
| vapor | 61,4 % (60,2 %–62,7 %) | 64,3 % | 59,1 % | 59,3 % |
| liquen | 53,7 % (52,5 %–54,9 %) | 50,9 % | 49,5 % | 47,1 % |
| abismo | 48,9 % (47,7 %–50,2 %) | 50,2 % | 51,9 % | 50,5 % |
| plasma | 48,9 % (47,6 %–50,1 %) | 50,1 % | 55,2 % | 58,6 % |
| brote | 46,9 % (45,7 %–48,1 %) | 38,0 % | 38,9 % | 38,5 % |
| llama | 46,1 % (44,8 %–47,3 %) | 49,1 % | 49,8 % | 56,0 % |
| sombra | 46,0 % (44,7 %–47,2 %) | 38,1 % | 42,6 % | 47,1 % |
| marea | 45,6 % (44,4 %–46,9 %) | 61,2 % | 59,2 % | 54,0 % |
| espora | 44,2 % (42,9 %–45,4 %) | 43,3 % | 44,1 % | 45,6 % |
| tormenta | 43,1 % (41,9 %–44,3 %) | 46,3 % | 50,0 % | 45,8 % |
| voltio | 23,1 % (22,0 %–24,1 %) | 23,4 % | 30,0 % | 27,0 % |

Diagnósticos: **energia3_statsiguales**: mismas estadísticas para todas (P = V = R): queda solo el efecto de los movimientos; **energia3_vida025**: `estadisticas.alfa_vida` 0,5 → 0,25 (menos vida por especializarse en resistencia). Con 100 combates por pareja (IC por familia ≈ ±3 %).

- Con anillos simétricos la ventaja de tabla es 0 para todas; lo que separa a las familias es su perfil de estadísticas (pesos de catálogo) y su catálogo de movimientos.
- **Perfil**: igualando estadísticas (con energia3), el rango pasa de 23,4 %–67,7 % a 30,0 %–60,3 % (9 fuera de banda: marea 59,2 %, brote 38,9 %, roca 59,3 %, voltio 30,0 %, sombra 42,6 %, vapor 59,1 %, magma 60,3 %, espora 44,1 %, plasma 55,2 %). Lo que queda es efecto de los movimientos.
- **Vida**: con `alfa_vida` 0,25, 7 familias fuera de banda (llama 56,0 %, brote 38,5 %, roca 57,1 %, voltio 27,0 %, vapor 59,3 %, magma 63,2 %, plasma 58,6 %). Ayuda, pero no basta: no se propone sin el arreglo de movimientos.
- Con energia3 (validación): 8 fuera de banda (roca 67,7 %, magma 67,4 %, vapor 64,3 %, marea 61,2 %, espora 43,3 %, sombra 38,1 %, brote 38,0 %, voltio 23,4 %). El arreglo de duración no toca este problema.

## Calidad (D-008 / D-018, C3)

| β | N | Victorias de calidad máx. | IC 95 % | Objetivo ≤ 55 % | Límite ≤ 60 % |
|---|---:|---:|---|---|---|
| 0 | 4000 | 50,4 % | 48,9 %–51,8 % | sí | sí |
| 0,04 (actual) | 10.000 | 51,6 % | 50,7 %–52,6 % | sí | sí |
| 0,06 | 4000 | 52,2 % | 50,7 %–53,6 % | sí | sí |

Equipos espejo de 4 salvajes con todos los D a calidad máxima (94,5) frente a mínima (85,5) (ancla del catálogo escalada y repartida). Como la calidad no cambia las cuotas σ, su único efecto es q = 1 ± β·(ΔT/T). La curva es plana en el rango estudiado: la calidad no decide combates, como pide D-008. Con la candidata: 52,9 %.

## Energía (C4), lado e iniciativa

| Reserva u | N | Victorias de u contra u = 0 (v0.1) | Con energia3 (validación) |
|---|---:|---|---|
| 3 | 5000 | 63,6 % (62,3 %–64,9 %) | 52,1 % (49,9 %–54,2 %) |
| 5 | 5000 | 61,0 % (59,6 %–62,3 %) | 44,0 % (41,8 %–46,1 %) |
| 7 | 5000 | 58,4 % (57,0 %–59,7 %) | 41,6 % (39,4 %–43,7 %) |

Con v0.1 guardar energía compensa: la IA u = 0 gasta todo cada turno y casi nunca paga los movimientos caros, que dan más puntos por energía (presupuesto convexo). Con energia3 la ventaja de guardar baja a 52,1 % (u = 3); sigue cumpliendo los dos criterios (frágil: el IC cruza el umbral).

Lado A (C1): 50,3 % (aprobado). Iniciativa (informativo): con Δ base ≤ 5 actúa antes la de más iniciativa el 53,6 % de las veces (rango esperado 50 %–65 %).

## Movimientos: prueba de sustitución

*Gráfico en el informe HTML: Victorias del equipo con el movimiento frente al golpe de referencia del mismo coste.*

| Veredicto | Origen | Gen | Movimiento | N | Victorias (IC 95 %) | Uso |
|---|---|---|---|---:|---|---|
| inútil (dudoso) | mutado | abismo\|cuerpo\|2222 | Bálsamo de Sima (coste 2): cura 55 a un aliado; +50 % si el objetivo tiene un estado negativo | 2000 | 41,7 % (39,6 %–43,7 %) | 4 % |
| inútil (dudoso) | mutado | marea\|cola\|2413 | Maleficio de Rocío (coste 3): 25 de daño a la fila delantera enemiga + aturdir; +50 % si otro de su grupo de familia usa un movimiento | 2000 | 41,6 % (39,5 %–43,7 %) | 27 % |
| inútil (dudoso) | mutado | voltio\|cuerpo\|3320 | Mordida de Destello (coste 3): 85 de daño a un enemigo + aturdir | 2000 | 41,6 % (39,6 %–43,6 %) | 17 % |
| inútil (dudoso) | catálogo | marea\|cuerpo\|2120 | Bálsamo de Resaca (coste 2): cura 40 a un aliado + regenerar | 2000 | 41,5 % (39,4 %–43,5 %) | 9 % |
| inútil (dudoso) | catálogo | voltio\|cabeza\|0341 | Ardid de Destello (coste 2): 55 de daño a un enemigo + prisa al usuario; prioridad | 2000 | 41,4 % (39,4 %–43,5 %) | 15 % |
| inútil (dudoso) | mutado | liquen\|extremidades\|2111 | Égida de Musgo (coste 2): escudo de 90 a un aliado; +50 % si el usuario tiene menos del 50 % de vida | 2000 | 41,4 % (39,3 %–43,4 %) | 7 % |
| inútil (dudoso) | mutado | tormenta\|cabeza\|1114 | Embate de Trueno (coste 2): 65 de daño a un enemigo; +50 % si quedan ≥ 3 de energía tras pagar | 2000 | 41,3 % (39,3 %–43,4 %) | 9 % |
| inútil (dudoso) | mutado | tormenta\|cuerpo\|1043 | Égida de Centella (coste 2): escudo de 70 a un aliado + prisa al usuario; +50 % si el objetivo tiene un estado negativo | 2000 | 41,2 % (39,1 %–43,2 %) | 19 % |
| inútil (dudoso) | mutado | brote\|cabeza\|1104 | Égida de Zarcillo (coste 2): escudo de 50 a una fila aliada; +50 % si quedan ≥ 3 de energía tras pagar | 2000 | 41,2 % (39,1 %–43,2 %) | 36 % |
| inútil (dudoso) | catálogo | brote\|cabeza\|1213 | Bálsamo de Savia (coste 2): cura 35 a un aliado + regenerar; +50 % si el usuario tiene menos del 50 % de vida | 2000 | 41,1 % (39,1 %–43,2 %) | 17 % |
| inútil (dudoso) | mutado | roca\|cabeza\|0332 | Égida de Lasca (coste 2): escudo de 105 a un aliado | 2000 | 41,1 % (39,1 %–43,1 %) | 6 % |
| inútil (dudoso) | mutado | sombra\|extremidades\|1321 | Mordida de Penumbra (coste 2): 45 de daño a un enemigo + quemadura; +50 % si otro de su grupo de familia usa un movimiento | 2000 | 40,9 % (38,9 %–43,0 %) | 16 % |
| inútil (dudoso) | catálogo | marea\|cabeza\|1220 | Bálsamo de Oleaje (coste 2): cura 70 a un aliado | 2000 | 40,8 % (38,8 %–42,9 %) | 4 % |
| inútil (dudoso) | catálogo | voltio\|extremidades\|1441 | Égida de Arco (coste 2): escudo de 90 a un aliado + prisa al usuario | 2000 | 40,8 % (38,7 %–42,8 %) | 19 % |
| inútil (dudoso) | catálogo | llama\|cola\|1432 | Mordida de Chispa (coste 2): 45 de daño a cualquier enemigo + quemadura | 2000 | 40,7 % (38,6 %–42,8 %) | 20 % |
| inútil (dudoso) | mutado | plasma\|cola\|1431 | Ardid de Radiante (coste 2): 40 de daño a un enemigo + prisa al usuario; prioridad; +50 % si el objetivo tiene un estado negativo | 2000 | 40,7 % (38,6 %–42,7 %) | 10 % |
| inútil (dudoso) | catálogo | marea\|extremidades\|2310 | Bálsamo de Oleaje (coste 2): cura 40 a un aliado + regenerar | 2000 | 40,0 % (37,9 %–42,0 %) | 9 % |
| inútil | mutado | liquen\|cabeza\|0004 | Ardid de Pátina (coste 2): 55 de daño a un enemigo + prisa al usuario; +50 % si otro de su grupo de familia usa un movimiento | 2000 | 39,8 % (37,7 %–41,8 %) | 14 % |
| inútil | mutado | brote\|extremidades\|1221 | Bálsamo de Raíz (coste 2): cura 40 a un aliado + regenerar | 2000 | 39,7 % (37,7 %–41,8 %) | 10 % |
| inútil | mutado | brote\|cola\|1004 | Bálsamo de Raíz (coste 2): cura 30 a un aliado + regenerar; +50 % si otro de su grupo de familia usa un movimiento | 2000 | 39,1 % (37,0 %–41,1 %) | 3 % |
| inútil | catálogo | brote\|cola\|0313 | Ardid de Savia (coste 2): 60 de daño a cualquier enemigo + prisa al usuario | 2000 | 39,0 % (37,0 %–41,1 %) | 24 % |
| inútil | catálogo | sombra\|extremidades\|1431 | Bálsamo de Eco (coste 2): cura 25 a un aliado + regenerar; prioridad | 2000 | 38,5 % (36,5 %–40,6 %) | 3 % |
| inútil | mutado | roca\|extremidades\|1303 | Maleficio de Lasca (coste 3): 20 de daño a una fila enemiga + aturdir; +50 % si otro de su grupo de familia usa un movimiento | 2000 | 38,0 % (36,0 %–40,0 %) | 25 % |
| inútil | catálogo | brote\|extremidades\|0321 | Bálsamo de Savia (coste 2): cura 10 a una fila aliada + regenerar; +50 % si quedan ≥ 3 de energía tras pagar | 2000 | 37,6 % (35,5 %–39,6 %) | 10 % |
| inútil | mutado | abismo\|cabeza\|2412 | Ardid de Sima (coste 2): 60 de daño a cualquier enemigo + prisa al usuario | 400 | 37,0 % (32,4 %–41,6 %) | 19 % |

0 rotos y 25 inútiles de 272. Piezas presentes en más de la mitad de los marcados: coste = 2 (0 rotos, 22 inútiles de 57). Arquetipos distintos por familia en el catálogo: llama 3, marea 5, brote 4, roca 5, voltio 4, sombra 5.

**Límite de la prueba**: con la IA u = 0, 40 de los 109 movimientos de coste 4–5 no se llegan a usar nunca (ni el de referencia), así que su ~50 % no dice nada. Hay que repetir la sustitución con la energía de v0.2. Los inútiles se concentran en coste 2 (22 de 25), sobre todo curas y escudos con estado (`regenerar` cuesta 7 de 18 puntos) frente a un golpe de referencia de 90 de daño.

| Pieza | Valor | Movimientos | Victorias medias | Rotos | Inútiles |
|---|---|---:|---:|---:|---:|
| arquetipo | curacion | 38 | 47,2 % | 0 | 9 |
| arquetipo | golpe | 69 | 49,2 % | 0 | 1 |
| arquetipo | golpe_estado | 56 | 47,1 % | 0 | 3 |
| arquetipo | maldicion | 23 | 48,7 % | 0 | 2 |
| arquetipo | proteccion | 53 | 47,9 % | 0 | 5 |
| arquetipo | tactico | 33 | 47,1 % | 0 | 5 |
| estado | aturdir | 11 | 45,2 % | 0 | 3 |
| estado | debilitar | 10 | 45,9 % | 0 | 0 |
| estado | marca | 18 | 48,0 % | 0 | 0 |
| estado | prisa | 28 | 46,1 % | 0 | 7 |
| estado | quemadura | 16 | 48,1 % | 0 | 2 |
| estado | ralentizar | 24 | 48,5 % | 0 | 0 |
| estado | regenerar | 38 | 47,3 % | 0 | 7 |
| estado | — | 127 | 48,8 % | 0 | 6 |
| modificador | alcance | 23 | 46,1 % | 0 | 4 |
| modificador | area | 30 | 48,8 % | 0 | 2 |
| modificador | drenaje | 2 | 45,4 % | 0 | 0 |
| modificador | perforar | 5 | 49,7 % | 0 | 0 |
| modificador | prioridad | 24 | 48,0 % | 0 | 3 |
| modificador | — | 188 | 48,0 % | 0 | 16 |
| condición | antes_que_objetivo | 17 | 48,9 % | 0 | 0 |
| condición | combo_familia | 13 | 43,9 % | 0 | 5 |
| condición | objetivo_con_estado | 17 | 47,3 % | 0 | 3 |
| condición | reserva | 14 | 45,8 % | 0 | 3 |
| condición | vida_baja | 19 | 47,6 % | 0 | 2 |
| condición | — | 192 | 48,4 % | 0 | 12 |
| coste | 1 | 39 | 48,4 % | 0 | 0 |
| coste | 2 | 57 | 43,8 % | 0 | 22 |
| coste | 3 | 67 | 47,7 % | 0 | 3 |
| coste | 4 | 68 | 50,0 % | 0 | 0 |
| coste | 5 | 41 | 50,1 % | 0 | 0 |

## Recomendación para combate v0.2

Candidatas de arreglo (máx. 3) evaluadas en C1 con `elige01`. Regla fijada antes de validar: entre las que aprueban todos los criterios de duración y lado, la de menos parámetros cambiados; empate → menos empates.  Elegida: **energia3** (`energia.por_turno` 2 → **3**).

### Validación de energia3 con semillas nuevas (`valida01-*`) en todos los escenarios

| Criterio | Umbral | Valor | IC 95 % | Semillas/grupos OK | Resultado |
|---|---|---:|---|---|---|
| Duración C1: Turnos, media | 7–12 | 9,14 | 9,06 – 9,21 | 5/5 | aprobado |
| Duración C1: Turnos, mediana | 7–11 | 8 | — | 5/5 | aprobado |
| Duración C1: Turnos, p90 | ≤ 15 | 15 | 14 – 15 | 5/5 | aprobado |
| Duración C1: Empates | ≤ 3 % | 2,6 % | 2,3 % – 2,9 % | 5/5 | aprobado |
| Lado C1: Victorias de A (empate = ½) | 48,5 %–51,5 % | 51,0 % | 50,0 % – 51,9 % | 4/5 | aprobado (frágil) |
| Iniciativa (inf.): Actúa antes la de más iniciativa base (Δ ≤ 5) | 50 %–65 % | 54,0 % | 53,7 % – 54,2 % | — | aprobado [inf.] |
| Familias C2: Familia más alejada del 50 % (voltio) | 45 %–55 % | 23,4 % | 21,7 % – 25,1 % | 5/13 | suspendido |
| D-008 C3: Calidad máx. vs mín., β = 0,04 (objetivo) | ≤ 55 % | 52,9 % | 51,4 % – 54,4 % | — | aprobado |
| D-008 C3: Calidad máx. vs mín., β = 0,04 (límite) | ≤ 60 % | 52,9 % | 51,4 % – 54,4 % | — | aprobado |
| Energía C4: Mejor reserva u > 0 contra u = 0 (u = 3) | ≥ 52 % | 52,1 % | 49,9 % – 54,2 % | — | aprobado (frágil) |
| Energía C4: u = 0 contra su peor rival (u = 3) | ≥ 35 % | 47,9 % | 45,8 % – 50,1 % | — | aprobado |

- **Cambio propuesto en `config/combate` v0.2:** `energia.por_turno` 2 → **3**. Con semillas nuevas cumple la duración: media 9,14, mediana 8, p90 15 (justo en el límite), empates 2,6 %.
- Sigue suspendiendo en validación: Familia más alejada del 50 % (voltio) (23,4 %).
- **Familias (sin arreglo validado):** no hay un parámetro de combate que lo resuelva solo. Propuesta para el diseñador: (1) `estadisticas.alfa_vida` 0,5 → 0,25 como punto de partida; (2) revisar en movimientos v0.2 los pesos de las familias extremas (roca, magma, vapor, marea, espora, sombra, brote, voltio); (3) volver a medir C2 con ambos cambios. Es una decisión del dueño (cambia el valor de especializarse).
- **Movimientos:** sales en `overrides_catalogo.sales` para los del catálogo marcados (mov:llama.cola.1, mov:marea.cabeza.3, mov:marea.cuerpo.3, mov:marea.extremidades.1, mov:brote.cabeza.1, mov:brote.extremidades.3, mov:brote.cola.1, mov:voltio.cabeza.3, mov:voltio.extremidades.1, mov:sombra.extremidades.3). Además, como coste 2 aparece en más de la mitad de los marcados, la spec pide ajustar costes de pieza y no movimiento a movimiento: en coste 2 las piezas de coste fijo pesan mucho sobre 18 puntos; las que más inútiles acumulan son arquetipo curacion (9), estado prisa (7), estado regenerar (7). Propuesta para el diseñador: abaratarlas o subir `presupuesto_por_coste.2`. Queda sin validar: hay que repetir la sustitución con la energía de v0.2.

## Decisiones para el dueño

- **Adoptar `energia.por_turno` 2 → **3** en combate v0.2.** Opciones: (a) sí; (b) `dano.golpe_basico.potencia` 10 → **20**; `desgaste.desde_turno` 10 → **8** (con `elige01`: media 10,2, p90 14, empates 0,7 %); (c) `dano.golpe_basico.potencia` 10 → **20**; `desgaste.por_turno` 0,25 → **0,5** (con `elige01`: media 10,55, p90 14, empates 0,6 %). Recomendación: (a).
- **Familias:** (a) encargar al diseñador perfil (`alfa_vida` 0,25) + pesos de movimientos de las familias extremas y validarlo en la semana siguiente; (b) aceptar el desequilibrio en v0.2 y arreglarlo con la economía. Recomendación: (a), porque con monofamilia hay familias que ganan menos de 1 de cada 3.
- **β de calidad (D-018):** la curva es plana (β 0: 50,4 %; β 0,04: 51,6 %; β 0,06: 52,2 %). Mantener β = 0,04 cumple el objetivo con margen.

## Método y limitaciones

- Semillas por combate: equipos `<prefijo>|<escenario>|equipos|i` (los mismos para todas las variantes: comparación pareada) y combate `<prefijo>|<escenario>|<variante>|i` (flujo propio por variante). Lados alternos en C2–C4 y en la sustitución; C1 deja A = primer equipo generado.
- Empate = ½ victoria. Medias con IC normal; mediana y p90 con IC por estadísticos de orden; proporciones con Wilson.
- Variantes de diagnóstico aparte de las de arreglo, ninguna se propone: diag_vida180, diag_tope40, diag_ia_reserva3, energia3_statsiguales, energia3_vida025.
- Sustitución con la IA de referencia (u = 0) en ambos lados, equipo espejo C1 nuevo en cada combate; el hueco sustituido es el de la criatura 1 con el mismo coste (o el de su locus); referencia = golpe de la familia del movimiento con todo el presupuesto.
- Exploración previa al código (300 combates por variante, semillas `diag*`, no reutilizadas aquí) para escoger qué 3 candidatas probar.
