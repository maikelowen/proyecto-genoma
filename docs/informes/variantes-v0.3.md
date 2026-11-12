# Variantes de combate v0.3: estudio de balance — Proyecto Genoma

Generado por `npm run sim:variantes` desde el commit `2bfd957` (más cambios locales si los hay), configs combate + movimientos + genética v0.2 (balance v0.2.1) sin cambios, huella sha256 `8a133591b8a4…`; cada combinación es un parche por ruta con su propia huella (tabla de método). Modo completo, semillas `var03|…`, 2 hilos, 485 s.

## Avisos de fiabilidad (Revisor)

- **Q-01 — las cifras con V1 (marcadas con †) no son fiables en Roca ni en el equilibrio de familias.** Con V1 activa, el escudo de 6 del golpe básico de Roca renueva la duración de los escudos previos (`packages/core/src/combat/engine.ts`, efecto `escudo` del golpe básico), así que un escudo grande se vuelve permanente. Afecta a V1 †, V1+V2 †, V1+V2+V3 †, V4+prov.+V1+V2 † y V4+prov.+V1+V2+V3 †: sus columnas de familias (y, en menor medida, remontada y duración) son **provisionales** hasta que se arregle el núcleo y se repitan. La base, V2 y V4+provocar no llevan V1 y no están afectadas; V3 solo se ha medido combinada con V1, así que su efecto se lee de la diferencia entre combinaciones que comparten el defecto.
- **Q-02 — las combinaciones con V4 miden casi «V4 sin provocar».** Solo 2 de los 72 movimientos del catálogo llevan provocar; en equipos de salvajes se usa 0,08 veces por partida (V4+provocar), 0,08 veces por partida (V4+prov.+V1+V2 †), 0,15 veces por partida (V4+prov.+V1+V2+V3 †). La profundidad, la remontada, la variedad y la duración de V4 son, en la práctica, las del objetivo automático sin su contrapeso. Provocar solo pesa en el escenario de familias (equipos monofamilia), y ahí hace daño (ver diagnóstico).

## Resumen ejecutivo

- **Profundidad.** Base: 87,7 % (83,9 %–91,4 %). Todas las combinaciones superan el 60 % con el IC entero por encima. La más baja es V1 † (82,7 % (78,4 %–87,0 %)).
- **¿El objetivo automático mantiene la profundidad > 60 %?** **Sí**: V4+provocar 89,3 % (85,8 %–92,8 %); V4+prov.+V1+V2 † 89,0 % (85,5 %–92,5 %); V4+prov.+V1+V2+V3 † 86,3 % (82,4 %–90,2 %). Ninguna diferencia con la base es significativa con este tamaño de muestra.
- **¿El descanso (V2) empobrece la variedad?** **No: la aumenta**. Entropía de uso por alma 1,05 → 1,16 bits (+0,11, significativo); sobre V1, 1,05 → 1,15 (+0,10, significativo). Golpes básicos 62,4 % → 62,7 % (+0,4 pt). Cada alma tiene de media 3,70 de sus 4 movimientos disponibles (no 3: con el 63 % de golpes básicos casi nunca hay un movimiento en descanso), y 3,00 que además puede pagar (base: 3,25). 
- **Remontada.** Base: gana quien hace el primer KO en el 63,9 % (62,5 %–65,2 %) (aprobado (frágil)) y quien lidera en vida tras el turno 3 en el 62,2 % (60,8 %–63,5 %) (aprobado). Suspenden alguna de las dos: V1+V2 †, V1+V2+V3 †, V4+prov.+V1+V2 † y V4+prov.+V1+V2+V3 †. En partidas espejo (mismo equipo en los dos lados, sin ventaja de equipo) la base da 62,0 % (59,9 %–64,1 %) y 62,2 % (60,0 %–64,3 %): la medida casi no depende de la diferencia de equipos.
- **Familias.** Base: 13/13 en banda (la más alejada, magma 54,8 % (52,6 %–57,0 %)). Con alguna familia fuera: V1 † (8/13; marea 43,5 %, brote 43,5 %, sombra 55,7 %, vapor 57,0 %, magma 60,1 %), V1+V2 † (6/13; marea 44,2 %, voltio 44,0 %, sombra 56,3 %, vapor 56,7 %, magma 58,5 %, espora 44,9 %, tormenta 43,9 %), V1+V2+V3 † (9/13; marea 44,9 %, roca 57,6 %, magma 55,3 %, espora 44,5 %), V4+provocar (10/13; brote 32,1 %, voltio 55,8 %, magma 55,9 %), V4+prov.+V1+V2 † (8/13; brote 34,0 %, sombra 56,9 %, vapor 58,9 %, magma 59,6 %, espora 43,2 %) y V4+prov.+V1+V2+V3 † (9/13; brote 34,1 %, roca 59,5 %, vapor 55,3 %, espora 42,5 %).
- **Duración.** Base: media 9,70, p90 14, empates 0,4 %. Todas en banda.

### Tabla resumen (✓ aprobado, ✗ suspendido; «frágil» = el IC 95 % cruza el umbral)

| Combinación | Profundidad (> 60 %) | Gana 1.er KO (< 65 %) | Gana líder de vida T3 (< 65 %) | Familias en 45 %–55 % | Turnos, media (7–12) | p90 (≤ 15) | Empates (≤ 3 %) | Criterios |
|---|---|---|---|---|---|---|---|---|
| Base v0.2.1 | 87,7 % (83,9 %–91,4 %) ✓ | 63,9 % (62,5 %–65,2 %) ✓ frágil | 62,2 % (60,8 %–63,5 %) ✓ | 13/13 ✓ frágil | 9,70 ✓ | 14 ✓ | 0,4 % ✓ | 7/7 |
| V1 † | 82,7 % (78,4 %–87,0 %) ✓ | 63,7 % (62,3 %–65,0 %) ✓ | 62,8 % (61,4 %–64,1 %) ✓ | 8/13 ✗ | 9,40 ✓ | 14 ✓ | 0,5 % ✓ | 6/7 |
| V2 | 88,5 % (84,9 %–92,1 %) ✓ | 64,2 % (62,9 %–65,5 %) ✓ frágil | 61,8 % (60,5 %–63,2 %) ✓ | 13/13 ✓ frágil | 9,85 ✓ | 14 ✓ | 0,3 % ✓ | 7/7 |
| V1+V2 † | 86,2 % (82,3 %–90,1 %) ✓ | 65,4 % (64,1 %–66,7 %) ✗ frágil | 63,8 % (62,4 %–65,1 %) ✓ frágil | 6/13 ✗ | 9,43 ✓ | 14 ✓ | 0,3 % ✓ | 5/7 |
| V1+V2+V3 † | 85,7 % (81,7 %–89,6 %) ✓ | 65,2 % (63,9 %–66,6 %) ✗ frágil | 66,2 % (64,8 %–67,5 %) ✗ frágil | 9/13 ✗ | 7,95 ✓ | 12 ✓ | 0,2 % ✓ | 4/7 |
| V4+provocar | 89,3 % (85,8 %–92,8 %) ✓ | 63,8 % (62,4 %–65,1 %) ✓ frágil | 61,7 % (60,3 %–63,0 %) ✓ | 10/13 ✗ | 9,96 ✓ | 14 ✓ | 0,6 % ✓ | 6/7 |
| V4+prov.+V1+V2 † | 89,0 % (85,5 %–92,5 %) ✓ | 66,3 % (65,0 %–67,6 %) ✗ | 63,9 % (62,6 %–65,3 %) ✓ frágil | 8/13 ✗ | 9,54 ✓ | 14 ✓ | 0,5 % ✓ | 5/7 |
| V4+prov.+V1+V2+V3 † | 86,3 % (82,4 %–90,2 %) ✓ | 67,9 % (66,6 %–69,2 %) ✗ | 69,1 % (67,8 %–70,4 %) ✗ | 9/13 ✗ | 7,70 ✓ | 12 ✓ | 0,3 % ✓ | 4/7 |

*Gráfico en el informe HTML: Profundidad: victorias de la IA de búsqueda contra la mejor IA de reglas (IC 95 %).* Línea discontinua: umbral 60 %.

*Gráfico en el informe HTML: Remontada: % de partidas que gana quien hace el primer KO y quien lidera en vida tras el turno 3 (IC 95 %).* Línea discontinua: umbral 65 % (debe quedar a la izquierda).

## Recomendación

- **La base v0.2.1 cumple los 7 criterios.** De las 7 combinaciones, solo V2 los cumple también; las demás suspenden algo que la base aprueba: V1 † → familias (8/13); V1+V2 † → primer KO (65,4 %), familias (6/13); V1+V2+V3 † → primer KO (65,2 %), líder de vida T3 (66,2 %), familias (9/13); V4+provocar → familias (10/13); V4+prov.+V1+V2 † → primer KO (66,3 %), familias (8/13); V4+prov.+V1+V2+V3 † → primer KO (67,9 %), líder de vida T3 (69,1 %), familias (9/13).
- **V2 (descanso): adoptable sin tocar nada más, con beneficio pequeño.** No rompe ningún criterio; la entropía por alma sube +0,11 bits (de 2,08 a 2,24 opciones efectivas), el reparto global de acciones no cambia (entropía agregada 1,70 → 1,69; básicos 62,4 % → 62,7 %) y profundidad, remontada, familias y duración quedan como en la base. Es decir: reparte el uso entre los movimientos de cada alma, pero no hace que se usen más movimientos.
- **V1 (golpe básico con efecto): no adoptar con estos números, y repetir tras el arreglo de Q-01.** Sola no aporta nada medible a la variedad (entropía 1,05 → 1,05, básicos 62,4 % → 62,8 %) ni a la profundidad (−5,0 pt, no significativo) y deja 8/13 familias en banda. Parte de ese desequilibrio puede ser el defecto del escudo de Roca (Q-01), pero también salen de banda familias base que no son Roca (marea 43,5 %, brote 43,5 %, sombra 55,7 %): aunque se arregle, V1 pedirá una ronda de equilibrio de familias (sales o magnitud de los efectos). Su valor es de sabor (que el básico «sea de su familia»), no de balance.
- **V3 (+1 de energía): es la única variante que de verdad cambia qué se juega, pero rompe la remontada.** Efecto de añadirla — sobre V1+V2 †: básicos −7,8 pt, entropía agregada +0,20, turnos −1,48, líder de vida T3 +2,4 pt (66,2 %), primer KO −0,1 pt (65,2 %); sobre V4+prov.+V1+V2 †: básicos −7,6 pt, entropía agregada +0,20, turnos −1,84, líder de vida T3 +5,2 pt (69,1 %), primer KO +1,5 pt (67,9 %). Más energía = menos golpes básicos y más movimientos caros, pero partidas más cortas y más decididas por quien se adelanta: no adoptar tal cual. Si se quiere su efecto sobre la variedad, habría que compensar la bola de nieve (p. ej. más vida o energía 4 solo desde cierto turno), y eso es un estudio aparte.
- **V4 (objetivo automático): cumple su criterio de adopción** (profundidad 89,3 % (85,8 %–92,8 %), primer KO 63,8 % frágil, igual que la base, líder T3 61,7 %). Quitar la elección de objetivo no hace el combate más superficial ni más bola de nieve para las IA. **Pero no está lista para adoptarse:** rompe el equilibrio de familias (10/13; brote cae al 32,1 %). El diagnóstico separa dos causas: sin la pieza provocar, V4 deja 11/13 (fuera: marea 43,7 %, magma 56,6 %) y brote en 49,0 %; con provocar pero sin peso en brote, 10/13 (fuera: marea 43,9 %, voltio 55,5 %, magma 56,1 %) y brote en 48,6 %. Es decir, **el hundimiento de brote lo causa el movimiento con provocar de brote** (según las notas de implementación, `brote.cabeza`: escudo de fila 50 → 30 + provocar; atrae todos los golpes hacia un alma que no los aguanta), y el objetivo automático por sí solo deja 2 familias fuera de banda, que habría que reequilibrar con sales. Además, la formación pesa poco (la sugerida gana el 55,6 % a su inversa) y provocar casi no se ha podido probar (Q-02).

**Propuesta del analista:** mantener la base v0.2.1 como configuración de referencia; **V2 (descanso) es la única variante que se puede activar ya sin romper nada**, con una mejora pequeña de la variedad por alma. Ninguna combinación mejora a la base en los criterios de §4 (profundidad, remontada, familias, duración): V2 los iguala y el resto los empeora. No adoptar V1 ni V3 con los números actuales. V4 supera sus dos condiciones (profundidad y remontada), así que la decisión de adoptarla es de diseño y no de balance, pero antes necesita: (1) quitar provocar de brote o corregir cómo lo valora la IA, (2) una ronda de sales para las familias que descoloca y (3) medir provocar con equipos que lo lleven.

### Decisiones para el director

- **Descanso (V2):** (a) activarlo en v0.3 — recomendado si se busca que cada alma no repita movimiento; coste de balance nulo; (b) dejarlo fuera: el efecto medido es pequeño y añade una regla que explicar. Recomendación del analista: (a), sabiendo que no reduce los golpes básicos.
- **Objetivo automático (V4):** (a) seguir con la elección de objetivo (base); (b) invertir una ronda más (arreglo de provocar en brote + sales + medida con provocar presente) y decidir entonces. Los datos no obligan a ninguna: la profundidad no cae. Recomendación: (b) solo si la interfaz sin objetivos es una prioridad de producto; si no, (a).
- **Más energía (V3) y golpe básico con efecto (V1):** aparcar. V3 es la palanca que reduce los golpes básicos (el problema de fondo de la variedad: más del 60 % de las acciones), pero necesita su propio estudio contra la bola de nieve; V1 se repite cuando el núcleo arregle Q-01.

## Qué mejora y qué empeora cada combinación frente a la base

| Combinación | Profundidad | Gana 1.er KO | Gana líder T3 | Entropía por alma (bits) | % golpes básicos | Familias en banda | Turnos (media) |
|---|---|---|---|---|---|---|---|
| V1 † | −5,0 pt ≈ | −0,2 pt ≈ | +0,6 pt ≈ | −0,00 ≈ | +0,4 pt empeora | −5 (desv. máx. +5,3 pt) empeora | −0,31 (en banda) |
| V2 | +0,8 pt ≈ | +0,3 pt ≈ | −0,3 pt ≈ | +0,11 mejora | +0,4 pt empeora | +0 (desv. máx. −0,9 pt) ≈ | +0,15 (en banda) |
| V1+V2 † | −1,5 pt ≈ | +1,5 pt ≈ | +1,6 pt ≈ | +0,10 mejora | +0,9 pt empeora | −7 (desv. máx. +3,7 pt) empeora | −0,27 (en banda) |
| V1+V2+V3 † | −2,0 pt ≈ | +1,4 pt ≈ | +4,0 pt empeora | +0,27 mejora | −6,9 pt mejora | −4 (desv. máx. +2,8 pt) empeora | −1,75 (en banda) |
| V4+provocar | +1,7 pt ≈ | −0,1 pt ≈ | −0,5 pt ≈ | −0,03 empeora | +1,3 pt empeora | −3 (desv. máx. +13,0 pt) empeora | +0,26 (en banda) |
| V4+prov.+V1+V2 † | +1,3 pt ≈ | +2,5 pt empeora | +1,8 pt ≈ | +0,06 mejora | +1,9 pt empeora | −5 (desv. máx. +11,1 pt) empeora | −0,16 (en banda) |
| V4+prov.+V1+V2+V3 † | −1,3 pt ≈ | +4,0 pt empeora | +7,0 pt empeora | +0,24 mejora | −5,7 pt mejora | −4 (desv. máx. +11,1 pt) empeora | −2,00 (en banda) |

«mejora» / «empeora» = diferencia significativa al 95 % en el sentido bueno / malo; «≈» = no significativa. El contraste trata las muestras como independientes (los equipos son los mismos en todas las combinaciones, así que es conservador). En familias cuenta el nº de familias en banda. En «% golpes básicos» el contraste cuenta cada acción como independiente (son decenas de miles), así que marca como significativas diferencias de menos de 1 punto que no tienen importancia práctica.

## Criterios por combinación

| Combinación | Criterio | Umbral | Valor (IC 95 %) | Resultado |
|---|---|---|---|---|
| Base v0.2.1 | Profundidad: búsqueda vs mejor IA de reglas | > 60 % | 87,7 % (83,9 %–91,4 %) | aprobado |
| Base v0.2.1 | Remontada: gana quien hace el primer KO | < 65 % | 63,9 % (62,5 %–65,2 %) | aprobado (frágil) |
| Base v0.2.1 | Remontada: gana quien lidera en vida tras el turno 3 | < 65 % | 62,2 % (60,8 %–63,5 %) | aprobado |
| Base v0.2.1 | Familias: la más alejada del 50 % (magma) — 13/13 en banda | 45 %–55 % | 54,8 % (52,6 %–57,0 %) | aprobado (frágil) |
| Base v0.2.1 | Duración: media de turnos | 7–12 | 9,70 (9,61–9,79) | aprobado |
| Base v0.2.1 | Duración: p90 de turnos | ≤ 15 | 14 | aprobado |
| Base v0.2.1 | Empates | ≤ 3 % | 0,4 % (0,3 %–0,6 %) | aprobado |
| V1 † | Profundidad: búsqueda vs mejor IA de reglas | > 60 % | 82,7 % (78,4 %–87,0 %) | aprobado |
| V1 † | Remontada: gana quien hace el primer KO | < 65 % | 63,7 % (62,3 %–65,0 %) | aprobado |
| V1 † | Remontada: gana quien lidera en vida tras el turno 3 | < 65 % | 62,8 % (61,4 %–64,1 %) | aprobado |
| V1 † | Familias: la más alejada del 50 % (magma) — 8/13 en banda | 45 %–55 % | 60,1 % (57,9 %–62,3 %) | suspendido |
| V1 † | Duración: media de turnos | 7–12 | 9,40 (9,31–9,48) | aprobado |
| V1 † | Duración: p90 de turnos | ≤ 15 | 14,00 (13,00–14,00) | aprobado |
| V1 † | Empates | ≤ 3 % | 0,5 % (0,4 %–0,8 %) | aprobado |
| V2 | Profundidad: búsqueda vs mejor IA de reglas | > 60 % | 88,5 % (84,9 %–92,1 %) | aprobado |
| V2 | Remontada: gana quien hace el primer KO | < 65 % | 64,2 % (62,9 %–65,5 %) | aprobado (frágil) |
| V2 | Remontada: gana quien lidera en vida tras el turno 3 | < 65 % | 61,8 % (60,5 %–63,2 %) | aprobado |
| V2 | Familias: la más alejada del 50 % (liquen) — 13/13 en banda | 45 %–55 % | 54,0 % (51,7 %–56,2 %) | aprobado (frágil) |
| V2 | Duración: media de turnos | 7–12 | 9,85 (9,76–9,94) | aprobado |
| V2 | Duración: p90 de turnos | ≤ 15 | 14 | aprobado |
| V2 | Empates | ≤ 3 % | 0,3 % (0,2 %–0,5 %) | aprobado |
| V1+V2 † | Profundidad: búsqueda vs mejor IA de reglas | > 60 % | 86,2 % (82,3 %–90,1 %) | aprobado |
| V1+V2 † | Remontada: gana quien hace el primer KO | < 65 % | 65,4 % (64,1 %–66,7 %) | suspendido (frágil) |
| V1+V2 † | Remontada: gana quien lidera en vida tras el turno 3 | < 65 % | 63,8 % (62,4 %–65,1 %) | aprobado (frágil) |
| V1+V2 † | Familias: la más alejada del 50 % (magma) — 6/13 en banda | 45 %–55 % | 58,5 % (56,3 %–60,7 %) | suspendido |
| V1+V2 † | Duración: media de turnos | 7–12 | 9,43 (9,35–9,51) | aprobado |
| V1+V2 † | Duración: p90 de turnos | ≤ 15 | 14,00 (13,00–14,00) | aprobado |
| V1+V2 † | Empates | ≤ 3 % | 0,3 % (0,2 %–0,5 %) | aprobado |
| V1+V2+V3 † | Profundidad: búsqueda vs mejor IA de reglas | > 60 % | 85,7 % (81,7 %–89,6 %) | aprobado |
| V1+V2+V3 † | Remontada: gana quien hace el primer KO | < 65 % | 65,2 % (63,9 %–66,6 %) | suspendido (frágil) |
| V1+V2+V3 † | Remontada: gana quien lidera en vida tras el turno 3 | < 65 % | 66,2 % (64,8 %–67,5 %) | suspendido (frágil) |
| V1+V2+V3 † | Familias: la más alejada del 50 % (roca) — 9/13 en banda | 45 %–55 % | 57,6 % (55,4 %–59,8 %) | suspendido |
| V1+V2+V3 † | Duración: media de turnos | 7–12 | 7,95 (7,87–8,03) | aprobado |
| V1+V2+V3 † | Duración: p90 de turnos | ≤ 15 | 12 | aprobado |
| V1+V2+V3 † | Empates | ≤ 3 % | 0,2 % (0,1 %–0,3 %) | aprobado |
| V4+provocar | Profundidad: búsqueda vs mejor IA de reglas | > 60 % | 89,3 % (85,8 %–92,8 %) | aprobado |
| V4+provocar | Remontada: gana quien hace el primer KO | < 65 % | 63,8 % (62,4 %–65,1 %) | aprobado (frágil) |
| V4+provocar | Remontada: gana quien lidera en vida tras el turno 3 | < 65 % | 61,7 % (60,3 %–63,0 %) | aprobado |
| V4+provocar | Familias: la más alejada del 50 % (brote) — 10/13 en banda | 45 %–55 % | 32,1 % (30,0 %–34,2 %) | suspendido |
| V4+provocar | Duración: media de turnos | 7–12 | 9,96 (9,87–10,05) | aprobado |
| V4+provocar | Duración: p90 de turnos | ≤ 15 | 14 | aprobado |
| V4+provocar | Empates | ≤ 3 % | 0,6 % (0,4 %–0,8 %) | aprobado |
| V4+prov.+V1+V2 † | Profundidad: búsqueda vs mejor IA de reglas | > 60 % | 89,0 % (85,5 %–92,5 %) | aprobado |
| V4+prov.+V1+V2 † | Remontada: gana quien hace el primer KO | < 65 % | 66,3 % (65,0 %–67,6 %) | suspendido |
| V4+prov.+V1+V2 † | Remontada: gana quien lidera en vida tras el turno 3 | < 65 % | 63,9 % (62,6 %–65,3 %) | aprobado (frágil) |
| V4+prov.+V1+V2 † | Familias: la más alejada del 50 % (brote) — 8/13 en banda | 45 %–55 % | 34,0 % (31,9 %–36,2 %) | suspendido |
| V4+prov.+V1+V2 † | Duración: media de turnos | 7–12 | 9,54 (9,46–9,62) | aprobado |
| V4+prov.+V1+V2 † | Duración: p90 de turnos | ≤ 15 | 14 | aprobado |
| V4+prov.+V1+V2 † | Empates | ≤ 3 % | 0,5 % (0,3 %–0,7 %) | aprobado |
| V4+prov.+V1+V2+V3 † | Profundidad: búsqueda vs mejor IA de reglas | > 60 % | 86,3 % (82,4 %–90,2 %) | aprobado |
| V4+prov.+V1+V2+V3 † | Remontada: gana quien hace el primer KO | < 65 % | 67,9 % (66,6 %–69,2 %) | suspendido |
| V4+prov.+V1+V2+V3 † | Remontada: gana quien lidera en vida tras el turno 3 | < 65 % | 69,1 % (67,8 %–70,4 %) | suspendido |
| V4+prov.+V1+V2+V3 † | Familias: la más alejada del 50 % (brote) — 9/13 en banda | 45 %–55 % | 34,1 % (32,0 %–36,2 %) | suspendido |
| V4+prov.+V1+V2+V3 † | Duración: media de turnos | 7–12 | 7,70 (7,63–7,78) | aprobado |
| V4+prov.+V1+V2+V3 † | Duración: p90 de turnos | ≤ 15 | 12,00 (11,00–12,00) | aprobado |
| V4+prov.+V1+V2+V3 † | Empates | ≤ 3 % | 0,3 % (0,2 %–0,5 %) | aprobado |

## Variedad de uso

| Combinación | Entropía por alma, bits (IC) | Opciones efectivas (2^H) | Entropía agregada | Básico | Mov. más barato | 2.º | 3.º | Más caro | Mov. disponibles (de 4) | …y pagables | Energía sin gastar por turno | Provocar por partida |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Base v0.2.1 | 1,05 (1,05–1,06) | 2,08 | 1,70 | 62,4 % | 9,8 % | 10,8 % | 10,2 % | 6,8 % | 4,00 | 3,25 | 1,22 | 0,00 |
| V1 † | 1,05 (1,05–1,06) | 2,07 | 1,69 | 62,8 % | 9,2 % | 10,7 % | 10,4 % | 6,9 % | 4,00 | 3,25 | 1,25 | 0,00 |
| V2 | 1,16 (1,16–1,17) | 2,24 | 1,69 | 62,7 % | 9,5 % | 10,6 % | 10,2 % | 6,9 % | 3,70 | 3,00 | 1,34 | 0,00 |
| V1+V2 † | 1,15 (1,15–1,16) | 2,22 | 1,68 | 63,3 % | 9,0 % | 10,4 % | 10,2 % | 7,0 % | 3,71 | 3,02 | 1,41 | 0,00 |
| V1+V2+V3 † | 1,33 (1,32–1,34) | 2,51 | 1,88 | 55,5 % | 10,2 % | 11,5 % | 12,2 % | 10,7 % | 3,66 | 3,37 | 1,97 | 0,00 |
| V4+provocar | 1,02 (1,01–1,03) | 2,03 | 1,66 | 63,6 % | 8,3 % | 10,9 % | 10,5 % | 6,7 % | 4,00 | 3,22 | 1,07 | 0,08 |
| V4+prov.+V1+V2 † | 1,11 (1,11–1,12) | 2,16 | 1,65 | 64,3 % | 7,8 % | 10,4 % | 10,6 % | 6,9 % | 3,72 | 3,01 | 1,25 | 0,08 |
| V4+prov.+V1+V2+V3 † | 1,30 (1,29–1,30) | 2,46 | 1,85 | 56,6 % | 8,6 % | 11,1 % | 12,7 % | 11,0 % | 3,68 | 3,37 | 1,85 | 0,15 |

- Entropía por alma: de la distribución de sus acciones ejecutadas entre golpe básico y sus 4 movimientos (máximo log₂ 5 = 2,32 bits), media de las almas con ≥ 4 acciones en la partida. Con pocas acciones por alma el estimador queda sesgado a la baja, más en partidas cortas (V3): por eso se da también la **entropía agregada** (de la distribución conjunta por rango de coste), que no tiene ese sesgo.
- «Mov. disponibles»: movimientos que no están en descanso al decidir; «pagables»: además, con coste ≤ energía del bando. Medido con la IA de reglas en los dos lados (C1).
- En las partidas de profundidad (búsqueda contra reglas, los dos bandos mezclados) el golpe básico supone: Base v0.2.1 64,6 %; V1 † 64,7 %; V2 64,3 %; V1+V2 † 64,5 %; V1+V2+V3 † 57,4 %; V4+provocar 65,6 %; V4+prov.+V1+V2 † 66,1 %; V4+prov.+V1+V2+V3 † 58,7 %. Pensar más no reduce el uso del básico: el límite es la energía (3–4 por turno para 4 almas), no la IA. El básico solo baja de forma clara con V3 (más energía).

## Remontada: controles

| Combinación | 1.er KO (equipos distintos) | 1.er KO (espejo) | Líder T3 (equipos distintos) | Líder T3 (espejo) | Gana el equipo con más vida máxima inicial |
|---|---|---|---|---|---|
| Base v0.2.1 | 63,9 % (62,5 %–65,2 %) | 62,0 % (59,9 %–64,1 %) | 62,2 % (60,8 %–63,5 %) | 62,2 % (60,0 %–64,3 %) | 50,2 % (48,8 %–51,6 %) |
| V1 † | 63,7 % (62,3 %–65,0 %) | 62,8 % (60,6 %–64,9 %) | 62,8 % (61,4 %–64,1 %) | 64,5 % (62,4 %–66,6 %) | 48,7 % (47,4 %–50,1 %) |
| V2 | 64,2 % (62,9 %–65,5 %) | 62,8 % (60,6 %–64,9 %) | 61,8 % (60,5 %–63,2 %) | 60,5 % (58,3 %–62,7 %) | 50,5 % (49,1 %–51,9 %) |
| V1+V2 † | 65,4 % (64,1 %–66,7 %) | 63,8 % (61,6 %–65,9 %) | 63,8 % (62,4 %–65,1 %) | 63,7 % (61,5 %–65,8 %) | 49,6 % (48,2 %–50,9 %) |
| V1+V2+V3 † | 65,2 % (63,9 %–66,6 %) | 65,5 % (63,4 %–67,5 %) | 66,2 % (64,8 %–67,5 %) | 67,1 % (65,0 %–69,2 %) | 48,7 % (47,3 %–50,1 %) |
| V4+provocar | 63,8 % (62,4 %–65,1 %) | 62,2 % (60,1 %–64,3 %) | 61,7 % (60,3 %–63,0 %) | 61,6 % (59,4 %–63,8 %) | 48,7 % (47,3 %–50,1 %) |
| V4+prov.+V1+V2 † | 66,3 % (65,0 %–67,6 %) | 66,8 % (64,7 %–68,8 %) | 63,9 % (62,6 %–65,3 %) | 64,5 % (62,3 %–66,6 %) | 47,8 % (46,4 %–49,2 %) |
| V4+prov.+V1+V2+V3 † | 67,9 % (66,6 %–69,2 %) | 68,7 % (66,6 %–70,7 %) | 69,1 % (67,8 %–70,4 %) | 68,7 % (66,6 %–70,7 %) | 50,9 % (49,5 %–52,3 %) |

El criterio se aplica a la columna de equipos distintos (C1, 5000 partidas), que es la lectura literal de la spec. Esa medida mezcla dos cosas: bola de nieve (ir por delante ayuda a ganar) y que el mejor equipo suele ir por delante **y** ganar. El control espejo (2000 partidas, mismo equipo en los dos lados) quita lo segundo; la última columna indica cuánto predice el resultado un dato anterior al combate. Se excluyen los empates, las partidas sin líder (vida igual) y, en «líder T3», las que acaban antes del turno 4.

## Equilibrio de familias (C2)

| Familia | Base v0.2.1 | V1 † | V2 | V1+V2 † | V1+V2+V3 † | V4+provocar | V4+prov.+V1+V2 † | V4+prov.+V1+V2+V3 † |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| marea | 45,8 % | 43,5 % ✗ | 46,7 % | 44,2 % ✗ | 44,9 % ✗ | 49,2 % | 46,7 % | 53,9 % |
| llama | 48,3 % | 51,1 % | 47,1 % | 50,7 % | 47,6 % | 49,6 % | 49,4 % | 48,5 % |
| brote | 48,7 % | 43,5 % ✗ | 50,3 % | 45,1 % | 48,9 % | 32,1 % ✗ | 34,0 % ✗ | 34,1 % ✗ |
| roca | 50,7 % | 52,5 % | 51,6 % | 54,8 % | 57,6 % ✗ | 48,6 % | 52,4 % | 59,5 % ✗ |
| voltio | 51,6 % | 47,5 % | 48,2 % | 44,0 % ✗ | 48,2 % | 55,8 % ✗ | 50,9 % | 52,2 % |
| sombra | 47,9 % | 55,7 % ✗ | 49,9 % | 56,3 % ✗ | 50,6 % | 47,7 % | 56,9 % ✗ | 47,4 % |
| vapor | 53,1 % | 57,0 % ✗ | 50,9 % | 56,7 % ✗ | 54,0 % | 53,1 % | 58,9 % ✗ | 55,3 % ✗ |
| magma | 54,8 % | 60,1 % ✗ | 53,4 % | 58,5 % ✗ | 55,3 % ✗ | 55,9 % ✗ | 59,6 % ✗ | 52,6 % |
| espora | 49,9 % | 46,0 % | 52,2 % | 44,9 % ✗ | 44,5 % ✗ | 46,3 % | 43,2 % ✗ | 42,5 % ✗ |
| liquen | 53,6 % | 48,8 % | 54,0 % | 49,4 % | 51,2 % | 51,7 % | 46,8 % | 46,3 % |
| plasma | 47,8 % | 51,7 % | 46,7 % | 54,1 % | 50,1 % | 53,6 % | 54,0 % | 51,1 % |
| tormenta | 48,7 % | 46,1 % | 48,2 % | 43,9 % ✗ | 48,8 % | 52,8 % | 47,3 % | 52,3 % |
| abismo | 49,1 % | 46,5 % | 50,8 % | 47,4 % | 48,4 % | 53,7 % | 49,9 % | 54,3 % |

160 partidas por pareja (78 parejas, 1920 por familia): el IC 95 % de cada celda es de ± 2,2 pt. Una familia a menos de esa distancia del borde puede cambiar de lado con otras semillas (en v0.2.1, magma ya estaba al borde: 54,7 %).

## Objetivo automático (V4): formación y provocar

| Combinación | Formación sugerida vs orden de generación | Formación sugerida vs invertida | Usos de provocar por partida (C1) | Planes de la búsqueda distintos de la IA de reglas | Turnos con búsqueda |
|---|---|---|---|---|---|
| Base v0.2.1 | — | — | 0,00 | 64,9 % | 8,62 |
| V1 † | — | — | 0,00 | 64,8 % | 8,31 |
| V2 | — | — | 0,00 | 62,7 % | 9,02 |
| V1+V2 † | — | — | 0,00 | 66,0 % | 8,63 |
| V1+V2+V3 † | — | — | 0,00 | 67,2 % | 7,33 |
| V4+provocar | 52,9 % (49,9 %–56,0 %) | 55,6 % (52,5 %–58,7 %) | 0,08 | 68,5 % | 8,70 |
| V4+prov.+V1+V2 † | 54,3 % (51,2 %–57,4 %) | 56,7 % (53,6 %–59,8 %) | 0,08 | 65,2 % | 8,32 |
| V4+prov.+V1+V2+V3 † | 51,1 % (48,0 %–54,2 %) | 57,5 % (54,4 %–60,5 %) | 0,15 | 66,9 % | 6,98 |

- **¿La formación pasa a ser una decisión importante?** Con el mismo equipo y la IA de reglas en los dos lados, la formación de `suggestFormation` gana el 52,9 % (49,9 %–56,0 %) a la de orden de generación y el 55,6 % (52,5 %–58,7 %) a su inversa (1000 partidas cada una, V4+provocar). La formación cuenta, pero poco.
- **Provocar apenas aparece** en equipos de salvajes: 0,08 usos por partida en V4+provocar; 0,08 usos por partida en V4+prov.+V1+V2 †; 0,15 usos por partida en V4+prov.+V1+V2+V3 †. Solo 2 de los 72 movimientos del catálogo lo llevan (notas de implementación, n.º 20). La medida de V4 es, en la práctica, la de «objetivo automático casi sin provocar».
- La IA de búsqueda elige un plan distinto del de la IA de reglas en el 64,9 % de sus decisiones en la base y en el 68,5 % (V4+provocar), 65,2 % (V4+prov.+V1+V2 †), 66,9 % (V4+prov.+V1+V2+V3 †) con V4: aunque no se elige objetivo, sigue habiendo tantas decisiones de movimiento y energía en las que pensar más cambia el plan.

## Diagnóstico: ¿por qué V4+provocar hunde a brote?

| Variante de diagnóstico | Familias en banda | Fuera de banda | Brote |
|---|---|---|---|
| V4 sin provocar | 11/13 | marea 43,7 %, magma 56,6 % | 49,0 % (46,8 %–51,2 %) |
| V4+provocar, brote sin provocar | 10/13 | marea 43,9 %, voltio 55,5 %, magma 56,1 % | 48,6 % (46,4 %–50,8 %) |

Dos variantes de diagnóstico (causa, no arreglo), solo en C1 y C2 (160 partidas por pareja), con las mismas semillas `var03` que la evaluación para que la comparación sea pareada; 24 s. Si más adelante se adopta alguna de estas dos configuraciones, `var03` pasa a ser semilla de elegir para ella y hay que validarla con semillas nuevas.

## Ajuste ligero

**No se ha hecho ningún ajuste.** El encargo lo permitía para una combinación prometedora que suspendiera «solo por poco», y no hay ninguna: las que suspenden lo hacen en familias por un margen amplio (V4+provocar, por el movimiento de brote) o llevan V1, cuyas cifras de familias no son fiables hasta que se arregle Q-01 (ajustar pesos sobre un defecto del núcleo sería ajustar ruido). El presupuesto que quedaba se gastó en el diagnóstico de arriba. La CLI conserva las fases `--fase elegir` y `--fase validar` (candidatas en `sim/variants/adjust.ts`, semillas `elige03` y `valida04`, sin usar) para la siguiente ronda.

## Método y limitaciones

| Combinación | Parche de combate | Parche de movimientos | Huella de la config efectiva |
|---|---|---|---|
| Base v0.2.1 | — | — | `0d86f7971590` |
| V1 | `variantes.golpe_basico_efecto.activo` = true | — | `41d285fa119b` |
| V2 | `variantes.descanso.activo` = true | — | `5d9ce919d1ee` |
| V1+V2 | `variantes.golpe_basico_efecto.activo` = true; `variantes.descanso.activo` = true | — | `4282c8042a67` |
| V1+V2+V3 | `variantes.golpe_basico_efecto.activo` = true; `variantes.descanso.activo` = true; `energia.por_turno` = 4 | — | `83f2b5b7522a` |
| V4+provocar | `variantes.objetivo_automatico.activo` = true | `provocar.activo` = true | `13d19e1a099f` |
| V4+prov.+V1+V2 | `variantes.objetivo_automatico.activo` = true; `variantes.golpe_basico_efecto.activo` = true; `variantes.descanso.activo` = true | `provocar.activo` = true | `80842eb665d4` |
| V4+prov.+V1+V2+V3 | `variantes.objetivo_automatico.activo` = true; `variantes.golpe_basico_efecto.activo` = true; `variantes.descanso.activo` = true; `energia.por_turno` = 4 | `provocar.activo` = true | `6bdea94cf24c` |

- **Los parches cambian la config de verdad:** antes de simular, cada ruta se lee de vuelta del JSON efectivo con el valor pedido, la config pasa por los parsers del núcleo y se exige que las huellas de todas las combinaciones sean distintas. Los ficheros de `config/` no se tocan.
- **Tamaños por combinación:** profundidad 300 partidas (la spec pide ≥ 400; reducido por presupuesto); C1 5000 (duración, remontada, variedad); espejo 2000; C2 160 por pareja (v0.2.1 usó 250; reducido por presupuesto, ver el IC en la tabla de familias); formación 1000 por rival y solo con V4.
- **Profundidad:** `createSearchAi()` con las opciones por defecto contra `createReferenceAi()` (la mejor IA de reglas, informe de combate v0.2), mismo equipo de salvajes en los dos lados y cada equipo dos veces (búsqueda en A y en B) con la misma semilla. IC 95 % normal con empate = ½. En la base, 0 empates en 300 partidas. La base mide 87,7 % (83,9 %–91,4 %); `profundidad-v0.1.md` dio 86,8 % con otras semillas (`prof01`).
- **Formación:** con V4, los dos equipos se colocan con `suggestFormation` en todos los escenarios; sin V4, en orden de generación, como en el estudio v0.2.1. La comparación V4 / no V4 incluye por tanto el efecto de colocar el equipo.
- **Semillas:** equipos `<semilla>|<escenario>|equipos|i` (los mismos para todas las combinaciones) y partida `<semilla>|<escenario>|<combinación>|i` (flujo propio por combinación). Ninguna se había usado: quemadas `genoma*`, `combate01`, `elige01/02*`, `explora02*`, `valida01–03`, `prof01`, `tune1/2` (la CLI las rechaza).
- **Planes inválidos:** 0 en todas las combinaciones (las IA no proponen movimientos en descanso).
- **Cómputo:** evaluación 485 s + diagnóstico 24 s con 2 hilos. Una primera ejecución de la evaluación se interrumpió sin dejar datos (corte de la sesión) y se repitió entera con las mismas semillas y tamaños algo menores; de ella no se miró ningún resultado.
- **Limitaciones.** (1) Remontada, variedad, duración y familias se miden con la IA de reglas en los dos lados; una persona no juega igual (con la búsqueda, el básico baja unos puntos). (2) La profundidad se mide contra una IA: es una cota de cuánto gana pensar, no una medida de diversión. (3) Los números de V1 y de provocar son los del Ingeniero (notas v0.3); aquí no se han buscado valores mejores salvo el ajuste declarado. (4) Equipos de salvajes: provocar casi no aparece, así que V4 se ha medido casi sin su contrapeso.
