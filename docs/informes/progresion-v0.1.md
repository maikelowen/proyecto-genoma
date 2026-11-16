# Informe de progresión v0.1 con combate real

Generado por `sim/progresion` desde el commit `657e6b2` (más cambios locales si los hay), config `config/progresion.v0.1.json` + combate v0.5 + movimientos v0.5 + genética v0.2, huella sha256 `b792c98692f4…`. Modo completo: 500 partidas por perfil, semillas `prog04-<perfil>-<i>` (nunca usadas para elegir números), tope de 120 combates por partida, 127 s con 4 hilos. Todo lo de abajo sale de `sim/out/progresion/progresion.json`.

Alcance: economía de la progresión (§9.2 filas de ritmo, atrapar, victorias, turnos, esencia, colección, liberar) con el núcleo real: `newGame`, `chooseStarter`, `rollEncounter`, `playEncounterBattle` (IA de referencia por tu lado, «instinto» en el salvaje), `applyBattleResult`, `throwLantern`, `resonate`, `release`, `setTeam`, `chooseVariant`. **No medido aquí** (otro encargo): espejos 4 contra 3 y 4 contra 2 movimientos, espejo de nivel 30 con variantes, pieza gratis, candidatos por locus, hashes 3 contra 3 (los cubre el test del núcleo).

## Perfiles

- **normal**: modelo de la spec §9.1: equipo = 3 de más nivel; zona abierta más alta; faroles a la más pura, 2 por salvaje y varias salvajes solo con ≥ 6 faroles; resuena mientras pueda; variante A.
- **cuidadoso**: como normal, pero solo sube de zona cuando el nivel medio del equipo ≥ nivel máx. de la zona − 2; elige la variante B si existe.
- **impaciente**: zona más alta siempre; 1 farol por salvaje (sin reintento); resuena mientras pueda.
- **cuidador**: variante «cuidador» de la spec: el eco más reciente ocupa el 3.er puesto del equipo.
- **liberador**: como normal, y tras cada combate libera toda ánima madura (las inmaduras no dan esencia) que no esté en el equipo ni entre las 6 mejores candidatas a resonar (spec §9.1 «Liberar»).

Todos juegan sesiones de 6 combates, la inicial rota entre las tres (i mod 3), meten en el equipo a sus 3 mejores ánimas con `setTeam` antes de cada combate (por nivel; empate por nacimiento) y eligen las variantes pendientes. Cada combate se juega con la IA de referencia. Todas las cifras de victoria cuentan los combates jugados hasta nivel 30 (no se fuerza una zona).

## Resumen ejecutivo

Se miden 16 criterios en 5 perfiles. **Cumplen 15, frágiles 0, fallan 1.** **El veredicto oficial de cada fila es el del perfil «normal»** (el modelo de la spec §9.1; LIB: el del «liberador»). Los otros perfiles miden sensibilidad: la columna «Otros perfiles» dice cuáles fallan.

- **Falla PC — Primer combate (inicial + acompañante)** (umbral ≥ 90 %): normal 89,6 % [86,6 %; 92,0 %].

Sensibilidad (cumple el modelo normal pero falla otro perfil): R3 (cuidadoso); NIV (cuidadoso); A2 (cuidadoso); BE (cuidador).

## Veredicto por criterio (§9.2)

| Id | Criterio | Umbral | normal | cuidadoso | impaciente | cuidador | liberador | Veredicto (normal) | Otros perfiles que fallan |
|---|---|---|---|---|---|---|---|---|---|
| R3 | Resonancias tras 3 sesiones (mediana / p10) | mediana ≥ 20, p10 ≥ 15 | 28 / 22 (cumple) | 15 / 10 (**FALLA**) | 22 / 15 (cumple) | 34 / 26 (cumple) | 28 / 21 (cumple) | cumple | cuidadoso |
| R1 | Resonancias en la sesión 1 (mediana) | ≥ 2 | 8 (p10 5) (cumple) | 5 (p10 0) (cumple) | 7 (p10 0) (cumple) | 7 (p10 5) (cumple) | 8 (p10 5) (cumple) | cumple | — |
| MIN | Minutos por sesión (modelo de tiempo, mediana de las 3 sesiones) | 10–20 min | 15,2 min (p10 11,0, p90 19,2) (cumple) | 10,5 min (p10 6,2, p90 16,7) (cumple) | 13,5 min (p10 9,7, p90 17,7) (cumple) | 16,8 min (p10 10,3, p90 21,5) (cumple) | 15,2 min (p10 11,0, p90 19,0) (cumple) | cumple | — |
| NIV | Nivel del favorito tras 3 sesiones (mediana) | 15–22 | 20 (p10 17, p90 22) (cumple) | 12 (p10 11, p90 14) (**FALLA**) | 19 (p10 17, p90 22) (cumple) | 19 (p10 17, p90 22) (cumple) | 20 (p10 17, p90 22) (cumple) | cumple | cuidadoso |
| N30 | Combates hasta nivel 30 (favorito, mediana) | 28–70 | 36 [35; 36] (0 censuradas) (cumple) | 47 [46; 47] (0 censuradas) (cumple) | 37 [36; 37] (0 censuradas) (cumple) | 37 [37; 38] (0 censuradas) (cumple) | 36 [35; 36] (0 censuradas) (cumple) | cumple | — |
| A1 | Atrapar al 1.er intento | 60–80 % | 63,5 % [62,7 %; 64,3 %] (cumple) | 65,9 % [65,2 %; 66,6 %] (cumple) | 62,9 % [62,1 %; 63,7 %] (cumple) | 62,4 % [61,6 %; 63,2 %] (cumple) | 62,6 % [61,8 %; 63,3 %] (cumple) | cumple | — |
| A2 | Atrapada con reintento (salvajes a las que se les lanzó 1.er farol) | 85–97 % | 95,8 % [95,4 %; 96,1 %] (cumple) | 97,6 % [97,4 %; 97,9 %] (**FALLA**) | sin reintento (cumple) | 95,4 % [95,0 %; 95,8 %] (cumple) | 95,4 % [95,1 %; 95,8 %] (cumple) | cumple | cuidadoso |
| V1 | Victorias en Prado de la Linde | ≥ 80 % | 96,8 % [96,1 %; 97,5 %] (n=2437) (cumple) | 98,6 % [98,2 %; 98,8 %] (n=6373) (cumple) | 96,6 % [95,9 %; 97,3 %] (n=2475) (cumple) | 97,2 % [96,5 %; 97,8 %] (n=2427) (cumple) | 97,4 % [96,7 %; 98,0 %] (n=2419) (cumple) | cumple | — |
| V2 | Victorias en Marismas Quietas | ≥ 70 % | 88,4 % [86,9 %; 89,9 %] (n=1731) (cumple) | 89,5 % [88,5 %; 90,4 %] (n=4130) (cumple) | 87,3 % [85,7 %; 88,6 %] (n=2024) (cumple) | 86,1 % [84,4 %; 87,6 %] (n=1850) (cumple) | 86,8 % [85,2 %; 88,3 %] (n=1782) (cumple) | cumple | — |
| V3 | Victorias en Cantil del Farol Roto | 55–80 % | 74,3 % [73,5 %; 75,0 %] (n=13647) (cumple) | 70,5 % [69,7 %; 71,2 %] (n=12964) (cumple) | 73,7 % [73,0 %; 74,4 %] (n=13868) (cumple) | 69,6 % [68,9 %; 70,4 %] (n=14454) (cumple) | 73,3 % [72,5 %; 74,0 %] (n=13740) (cumple) | cumple | — |
| PC | Primer combate (inicial + acompañante) | ≥ 90 % | 89,6 % [86,6 %; 92,0 %] (**FALLA**) | 92,4 % [89,7 %; 94,4 %] (frágil) | 91,0 % [88,2 %; 93,2 %] (frágil) | 91,2 % [88,4 %; 93,4 %] (frágil) | 92,0 % [89,3 %; 94,1 %] (frágil) | **FALLA** | — |
| T1 | Turnos por combate en el Prado (media) y empates | ≤ 6 turnos; empates ≤ 2 % | 3,5 turnos; empates 0,1 % (cumple) | 3,6 turnos; empates 0,0 % (cumple) | 3,3 turnos; empates 0,0 % (cumple) | 3,5 turnos; empates 0,0 % (cumple) | 3,5 turnos; empates 0,0 % (cumple) | cumple | — |
| T3 | Turnos por combate en el Cantil (media) y empates | ≤ 9 turnos; empates ≤ 2 % | 6,8 turnos; empates 0,1 % (cumple) | 7,0 turnos; empates 0,2 % (cumple) | 6,8 turnos; empates 0,1 % (cumple) | 6,8 turnos; empates 0,1 % (cumple) | 6,8 turnos; empates 0,1 % (cumple) | cumple | — |
| BE | Bloqueo por esencia (% de momentos con pareja madura pero sin esencia) | ≤ 50 % | 20,3 % (cumple) | 2,2 % (cumple) | 6,3 % (cumple) | 79,6 % (**FALLA**) | 14,0 % (cumple) | cumple | cuidador |
| CL | Colección llena en 3 sesiones | 0 % de partidas | 0,0 % (cumple) | 0,0 % (cumple) | 0,0 % (cumple) | 0,0 % (cumple) | 0,0 % (cumple) | cumple | — |
| LIB | Esencia de liberar / esencia total | ≤ 15 % | — | — | — | — | 7,4 % (cumple) | cumple | — |

- R3: Se evalúa en todos los perfiles (la spec lo pide en todo el rango de victorias).
- MIN: Tiempo = turnos × 10 s + 30 s por combate + 40 s por resonancia; no cuenta lanzar faroles ni menús.
- N30: Censura: las partidas que no llegan al tope de combates cuentan como «> tope».
- A2: «impaciente» no reintenta: no se evalúa.
- LIB: Solo el perfil «liberador» libera; en los demás es 0.

«Frágil» = el valor está dentro del umbral pero el intervalo de confianza al 95 % (Wilson para proporciones; estadísticos de orden para medianas y p10) lo cruza.

## Resonancias, nivel y colección por sesión (acumulado)

| Perfil | Partidas sin resonancia en la sesión 1 | Res. ses. 1 mediana (p10) | ses. 2 | ses. 3 | IC mediana ses. 3 | IC p10 ses. 3 | Colección ses. 3 (mediana, p90) | Esencia ses. 3 (mediana) | Faroles ses. 3 (mediana) |
|---|---|---|---|---|---|---|---|---|---|
| normal | 7,8 % | 8 (5) | 19 (14) | 28 (22) | [28; 29] | [21; 23] | 43, 51 | 31 | 0 |
| cuidadoso | 14,8 % | 5 (0) | 5 (5) | 15 (10) | [15; 17] | [10; 10] | 34, 40 | 45 | 0 |
| impaciente | 16,8 % | 7 (0) | 15 (10) | 22 (15) | [21; 22] | [15; 15] | 33, 42 | 90 | 5 |
| cuidador | 8,4 % | 7 (5) | 20 (15) | 34 (26) | [33; 34] | [25; 27] | 48, 58 | 5 | 0 |
| liberador | 9,0 % | 8 (5) | 18 (14) | 28 (21) | [28; 29] | [20; 21] | 35, 41 | 56 | 0 |

## Victorias, turnos y diferencia de nivel por zona

| Perfil | Zona | Combates | Victorias | Empates | Turnos (media) | Nivel máx. salvaje − nivel máx. equipo (media) | % con salvaje de más nivel que tu equipo |
|---|---|---|---|---|---|---|---|
| normal | Prado de la Linde | 2437 | 96,8 % [96,1 %; 97,5 %] | 0,1 % | 3,5 | -0,6 | 23,6 % |
| normal | Marismas Quietas | 1731 | 88,4 % [86,9 %; 89,9 %] | 0,1 % | 6,1 | 1,3 | 64,0 % |
| normal | Cantil del Farol Roto | 13647 | 74,3 % [73,5 %; 75,0 %] | 0,1 % | 6,8 | -7,0 | 11,7 % |
| cuidadoso | Prado de la Linde | 6373 | 98,6 % [98,2 %; 98,8 %] | 0,0 % | 3,6 | -2,9 | 8,6 % |
| cuidadoso | Marismas Quietas | 4130 | 89,5 % [88,5 %; 90,4 %] | 0,2 % | 5,9 | -2,7 | 9,5 % |
| cuidadoso | Cantil del Farol Roto | 12964 | 70,5 % [69,7 %; 71,2 %] | 0,2 % | 7,0 | -8,2 | 3,3 % |
| impaciente | Prado de la Linde | 2475 | 96,6 % [95,9 %; 97,3 %] | 0,0 % | 3,3 | -0,6 | 23,8 % |
| impaciente | Marismas Quietas | 2024 | 87,3 % [85,7 %; 88,6 %] | 0,0 % | 6,1 | 1,3 | 64,8 % |
| impaciente | Cantil del Farol Roto | 13868 | 73,7 % [73,0 %; 74,4 %] | 0,1 % | 6,8 | -7,0 | 12,5 % |
| cuidador | Prado de la Linde | 2427 | 97,2 % [96,5 %; 97,8 %] | 0,0 % | 3,5 | -0,6 | 22,9 % |
| cuidador | Marismas Quietas | 1850 | 86,1 % [84,4 %; 87,6 %] | 0,1 % | 6,1 | 1,2 | 63,0 % |
| cuidador | Cantil del Farol Roto | 14454 | 69,6 % [68,9 %; 70,4 %] | 0,1 % | 6,8 | -7,1 | 11,2 % |
| liberador | Prado de la Linde | 2419 | 97,4 % [96,7 %; 98,0 %] | 0,0 % | 3,5 | -0,6 | 23,4 % |
| liberador | Marismas Quietas | 1782 | 86,8 % [85,2 %; 88,3 %] | 0,1 % | 6,2 | 1,4 | 65,7 % |
| liberador | Cantil del Farol Roto | 13740 | 73,3 % [72,5 %; 74,0 %] | 0,1 % | 6,8 | -7,0 | 11,8 % |

Solo los 18 primeros combates (las 3 sesiones del hito D-066), victorias por zona:

| Perfil | Prado | Marismas | Cantil |
|---|---|---|---|
| normal | 96,8 % (n=2437) | 88,4 % (n=1731) | 74,6 % (n=4832) |
| cuidadoso | 98,6 % (n=6373) | 88,6 % (n=2601) | 88,5 % (n=26) |
| impaciente | 96,6 % (n=2475) | 87,3 % (n=2024) | 73,8 % (n=4501) |
| cuidador | 97,2 % (n=2427) | 86,1 % (n=1850) | 69,6 % (n=4723) |
| liberador | 97,4 % (n=2419) | 86,8 % (n=1782) | 73,5 % (n=4799) |

## Dónde se atasca el jugador

Derrotas por tipo de combate (tamaño de tu equipo sin acompañante contra número de salvajes), solo celdas con ≥ 30 combates y menos de 70 % de victorias o las 3 peores de cada perfil.

| Perfil | Zona | Tu equipo | Salvajes | Combates | Victorias |
|---|---|---|---|---|---|
| normal | Cantil del Farol Roto | 3 | 3 | 6104 | 49,0 % [47,8 %; 50,3 %] |
| normal | Marismas Quietas | 3 | 3 | 331 | 52,0 % [46,6 %; 57,3 %] |
| normal | Prado de la Linde | 1 | 2 | 165 | 64,8 % [57,3 %; 71,7 %] |
| cuidadoso | Cantil del Farol Roto | 3 | 3 | 5911 | 43,5 % [42,2 %; 44,7 %] |
| cuidadoso | Marismas Quietas | 3 | 3 | 832 | 58,2 % [54,8 %; 61,5 %] |
| cuidadoso | Prado de la Linde | 1 | 2 | 179 | 73,7 % [66,8 %; 79,6 %] |
| impaciente | Cantil del Farol Roto | 3 | 3 | 6312 | 48,7 % [47,5 %; 50,0 %] |
| impaciente | Marismas Quietas | 3 | 3 | 406 | 52,5 % [47,6 %; 57,3 %] |
| impaciente | Prado de la Linde | 1 | 2 | 227 | 70,5 % [64,2 %; 76,0 %] |
| cuidador | Cantil del Farol Roto | 3 | 3 | 6500 | 42,5 % [41,3 %; 43,7 %] |
| cuidador | Marismas Quietas | 3 | 3 | 353 | 44,2 % [39,1 %; 49,4 %] |
| cuidador | Prado de la Linde | 1 | 2 | 172 | 69,2 % [61,9 %; 75,6 %] |
| liberador | Cantil del Farol Roto | 3 | 3 | 6286 | 47,9 % [46,7 %; 49,1 %] |
| liberador | Marismas Quietas | 3 | 3 | 347 | 48,4 % [43,2 %; 53,7 %] |
| liberador | Prado de la Linde | 1 | 2 | 178 | 71,9 % [64,9 %; 78,0 %] |

Llegada a las zonas (combate en que se abre y se elige la zona nueva, mediana):

| Perfil | Marismas (combate nº) | Cantil (combate nº) | Partidas que llegan al Cantil |
|---|---|---|---|
| normal | 6 | 9 | 100,0 % |
| cuidadoso | 14 | 22 | 100,0 % |
| impaciente | 6 | 10 | 100,0 % |
| cuidador | 6 | 10 | 100,0 % |
| liberador | 6 | 9 | 100,0 % |

## Atrapar y faroles

| Perfil | 1.er intento (n) | Con reintento | Faroles mínimos (mediana) | Partidas que nunca llegan a 0 faroles | Combates que empiezan con 0 faroles | Salvajes derrotadas a las que se lanza farol | Primer combate ganado |
|---|---|---|---|---|---|---|---|
| normal | 63,5 % (14207) | 95,8 % | 0 | 2,6 % | 47,7 % | 50,2 % | 89,6 % |
| cuidadoso | 65,9 % (19246) | 97,6 % | 0 | 0,4 % | 60,1 % | 55,1 % | 92,4 % |
| impaciente | 62,9 % (14879) | — | 5 | 100,0 % | 0,0 % | 51,3 % | 91,0 % |
| cuidador | 62,4 % (13961) | 95,4 % | 0 | 1,4 % | 49,5 % | 49,9 % | 91,2 % |
| liberador | 62,6 % (14132) | 95,4 % | 0 | 0,6 % | 49,8 % | 50,0 % | 92,0 % |

## Esencia y liberar

| Perfil | Esencia total ingresada por partida (media) | Bloqueo por esencia | % esencia por liberar |
|---|---|---|---|
| normal | 620 | 20,3 % | 0,0 % |
| cuidadoso | 690 | 2,2 % | 0,0 % |
| impaciente | 632 | 6,3 % | 0,0 % |
| cuidador | 612 | 79,6 % | 0,0 % |
| liberador | 669 | 14,0 % | 7,4 % |

## Conclusiones (plantillas sobre los datos)

- **Atasco principal (perfil normal)**: Cantil del Farol Roto, tu equipo de 3 contra 3 salvajes: 49,0 % de victorias en 6104 combates (frente a 74,3 % de la zona entera).
- **Prado, 2 ánimas contra 2 salvajes (perfil normal)**: 99,3 % de victorias en 137 combates.
- **Quien espera a estar fuerte se atasca en el Prado**: el perfil cuidadoso entra en las Marismas en el combate 14 y en el Cantil en el 22 (normal: 6 y 9); tras 3 sesiones tiene 15 resonancias y el favorito está en nivel 12.
- **Faroles**: en el perfil normal el 47,7 % de los combates empieza con 0 faroles y se lanza farol al 50,2 % de las salvajes derrotadas; el 97,4 % de las partidas se queda sin faroles en algún momento. Tras cada victoria siempre hay al menos 1 (+1 por victoria), así que el atrapar nunca queda bloqueado, pero el ritmo lo marcan los faroles, no las salvajes disponibles.
- **Primera sesión**: el 7,8 % de las partidas del perfil normal no resuena en la sesión 1 (la inicial madura al nivel 5 y no siempre llega a tiempo); la mediana cumple, la cola no.

Fallan 1 criterio(s) en el perfil normal: PC. Ejecuta con `--propuesta` para validar un ajuste.

