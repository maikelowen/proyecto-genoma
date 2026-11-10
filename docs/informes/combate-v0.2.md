# Informe de combate v0.2 y propuesta de balance v0.2.1 — Proyecto Genoma

Generado por `sim/combat` desde el commit `a0c8cc3` (más cambios locales si los hay), configs combate + movimientos + genética v0.2 con huella sha256 `0af29e068101…`; propuesta `config/propuestas/combate-balance-v0.2.1.json` con huella `950b254d1412…`. Modo completo, 257 s. Semillas de evaluación `valida03-*` (las mismas para base y propuesta); la propuesta se eligió con `explora02*`, `elige02*` y `valida02*` (validación de la 1.ª versión, que motivó un refinado), que no se usan aquí.

## Resumen ejecutivo

- **Base v0.2:** aprueba 14 de 15 criterios; suspende Familias C2: Familia más alejada del 50 % (roca) (41,4 %).
- **Propuesta v0.2.1:** aprueba 15 de 15 (todos). Frágiles (el IC cruza el umbral): Familias C2: Familia más alejada del 50 % (magma) (54,7 %).
- **Ahorrar energía:** la mejor IA que ahorra gana a la que no ahorra el 52,1 % con la base y el 55,4 % con la propuesta; uso de coste 4–5 cuando se puede pagar: 16,8 % → 22,3 %.
- **Familias:** 11/13 en banda con la base y 13/13 con la propuesta.
- **Duración:** media 8,77 → 9,78 turnos, p90 13 → 14, empates 0,5 % → 0,4 %.

## Criterios: base v0.2 frente a propuesta (validación)

Umbrales de `criterios_sim` de las configs, con la sección `criterios` de la propuesta por encima (criterios del director: lado 48–52 %, ahorro de energía como en v0.1, movimientos sin rotos y ≤ 5 % de inútiles). Se aplican igual a la base y a la propuesta. "Frágil" = el IC 95 % cruza el umbral. Empate = ½ victoria.

| Criterio | Umbral | Base v0.2 (IC 95 %) | Base | Propuesta (IC 95 %) | Propuesta |
|---|---|---:|---|---|---|
| Duración C1: Turnos, media | 7–12 | 8,77 (8,71–8,83) | aprobado | 9,78 (9,72–9,84) | aprobado |
| Duración C1: Turnos, mediana | 7–11 | 8 | aprobado | 9 | aprobado |
| Duración C1: Turnos, p90 | ≤ 15 | 13 | aprobado | 14 | aprobado |
| Duración C1: Empates | ≤ 3 % | 0,5 % (0,4 %–0,6 %) | aprobado | 0,4 % (0,3 %–0,5 %) | aprobado |
| Lado C1: Victorias de A (empate = ½) | 48 %–52 % | 49,5 % (48,5 %–50,5 %) | aprobado | 49,7 % (48,7 %–50,7 %) | aprobado |
| Iniciativa (inf.): Actúa antes la de más iniciativa base (Δ ≤ 5) | 50 %–65 % | 53,8 % (53,6 %–54,1 %) | aprobado [inf.] | 54,1 % (53,8 %–54,3 %) | aprobado [inf.] |
| Familias C2: Familia más alejada del 50 % | 45 %–55 % | 41,4 % (39,7 %–43,2 %) [roca] | suspendido | 54,7 % (52,9 %–56,4 %) [magma] | aprobado (frágil) |
| D-008 C3: Calidad máx. vs mín., β = 0,04 (objetivo) | ≤ 55 % | 52,0 % (50,4 %–53,5 %) | aprobado | 50,6 % (49,1 %–52,2 %) | aprobado |
| D-008 C3: Calidad máx. vs mín., β = 0,04 (límite) | ≤ 60 % | 52,0 % (50,4 %–53,5 %) | aprobado | 50,6 % (49,1 %–52,2 %) | aprobado |
| Energía C4: Mejor IA que ahorra contra la que no (precio de la energía, κ de la config) | ≥ 52 % | 52,1 % (50,1 %–54,1 %) | aprobado (frágil) | 55,4 % (53,5 %–57,4 %) | aprobado |
| Energía C4: IA sin reserva contra su peor rival (precio de la energía, κ de la config) | ≥ 35 % | 47,9 % (45,9 %–49,9 %) | aprobado | 44,6 % (42,6 %–46,5 %) | aprobado |
| Energía C1: Uso de coste 4–5 cuando se puede pagar (IA de referencia) | ≥ 15 % | 16,8 % (16,6 %–17,0 %) | aprobado | 22,3 % (22,1 %–22,5 %) | aprobado |
| Movimientos §7: Catálogo roto (0 de 72) | ≤ 0 % | 0,0 % | aprobado | 0,0 % | aprobado |
| Movimientos §7: Rotos graves (catálogo + muestra) | ≤ 0 | 0 | aprobado | 0 | aprobado |
| Movimientos §7: Catálogo inútil (0 de 72) | ≤ 5 % | 0,0 % | aprobado | 0,0 % | aprobado |
| Movimientos §3: Catálogo válido y con cuotas §5.1 (72 de 72) | ≥ 72 | 72 | aprobado | 72 | aprobado |

Tamaños (por variante): C1 5 semillas × 2000; C2 250 por pareja (78 parejas); C3 4000; C4 2500 por rival; sustitución 72 del catálogo + 60 mutados, 400 combates y +1600 si el IC cruza un umbral. Reducidos frente a la spec (C1 20.000, C2 1000, C3 10.000, C4 5000, sustitución 2000 y 500 mutados) para caber en el presupuesto de cómputo; los IC de la tabla reflejan esos tamaños.

## Qué cambia la propuesta

Parche `config/propuestas/combate-balance-v0.2.1.json` (no toca `config/`): 17 cambios.

| Config | Ruta | v0.2 | Propuesta |
|---|---|---|---|
| combate | `estados.escudo.maximo` | 200 | **300** |
| movimientos | `presupuesto_por_coste.1` | 11 | **6** |
| movimientos | `presupuesto_por_coste.2` | 20 | **15** |
| movimientos | `presupuesto_por_coste.3` | 30 | **27** |
| movimientos | `presupuesto_por_coste.4` | 41 | **42** |
| movimientos | `presupuesto_por_coste.5` | 53 | **60** |
| movimientos | `escalables.dano.max_individual` | 250 | **350** |
| movimientos | `escalables.dano.max_area_por_objetivo` | 125 | **175** |
| movimientos | `escalables.cura.max` | 180 | **330** |
| movimientos | `escalables.escudo.max` | 200 | **300** |
| sal de catálogo | `brote.extremidades.2` | — | **"c4"** |
| sal de catálogo | `marea.cuerpo.3` | "r1" | **"c2"** |
| sal de catálogo | `brote.cabeza.3` | — | **"c1"** |
| sal de catálogo | `roca.cola.1` | — | **"c2"** |
| sal de catálogo | `brote.cola.3` | — | **"c4"** |
| sal de catálogo | `sombra.cabeza.1` | "r4" | **"c1"** |
| sal de catálogo | `sombra.cabeza.3` | — | **"c2"** |

- **Curva de presupuesto convexa** (como v0.1, algo más marcada arriba): el rendimiento neto por energía crece con el coste, así que guardar para un movimiento caro compensa (decisión del director).
- **Topes de potencia** subidos (aviso K-01 del revisor): con la curva convexa, los topes de v0.2 (daño 250, área 125, cura 180, escudo 200) recortaban justo los movimientos caros y anulaban la convexidad. `estados.escudo.maximo` sube con el tope del escudo.
- **Sales de catálogo**: salen de la búsqueda §5.2 con el simulador real (sección Búsqueda); arreglan las familias que la curva nueva desplaza (los kits baratos pierden potencia).

## Duración y lado (C1)

| Variante | N | Media | Mediana | p90 | Empates | …por tope | Golpes básicos | Victorias de A |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| v02 | 10.000 | 8,77 | 8 | 13 | 0,5 % | 0,2 % | 56 % | 49,5 % (48,5 %–50,5 %) |
| propuesta | 10.000 | 9,78 | 9 | 14 | 0,4 % | 0,4 % | 62 % | 49,7 % (48,7 %–50,7 %) |

*Gráfico en el informe HTML: Distribución de turnos en C1.*

## Ahorrar energía (C4) y uso de lo caro (C1)

IA sin reserva = IA de referencia con κ = 0 y reserva 0 (gasta lo mejor que puede pagar cada turno). IA que ahorra: la de referencia con precio de la energía (κ de la config) y las de reserva fija u con κ = 0. Equipos C1, lados alternos. El criterio toma la mejor; "sin reserva contra su peor rival" es el complemento.

| IA que ahorra | v02: victorias contra la IA sin reserva | propuesta: victorias contra la IA sin reserva |
|---|---|---|
| precio de la energía, κ de la config | 52,1 % (50,1 %–54,1 %) | 55,4 % (53,5 %–57,4 %) |
| reserva fija 3, κ = 0 | 49,9 % (48,0 %–51,9 %) | 49,5 % (47,5 %–51,4 %) |
| reserva fija 5, κ = 0 | 44,7 % (42,8 %–46,7 %) | 50,0 % (48,0 %–51,9 %) |
| reserva fija 7, κ = 0 | 40,7 % (38,8 %–42,6 %) | 48,3 % (46,3 %–50,2 %) |

| Coste | v02: veces pagable | v02: uso | propuesta: veces pagable | propuesta: uso |
|---|---:|---:|---:|---:|
| 1 | 125.644 | 28,5 % | 142.401 | 7,7 % |
| 2 | 315.655 | 20,9 % | 354.354 | 13,6 % |
| 3 | 413.153 | 22,5 % | 474.960 | 23,1 % |
| 4 | 110.260 | 17,2 % | 165.522 | 23,1 % |
| 5 | 17.311 | 4,5 % | 31.209 | 4,5 % |
| 4–5 | 117.441 | 16,8 % | 177.552 | 22,3 % |

Uso = acciones de una criatura que pagó un movimiento suyo de ese coste / acciones en que tenía uno de ese coste y había energía para él (IA de referencia, C1).

## Familias (C2)

| Familia | v02 (IC 95 %) | propuesta (IC 95 %) |
|---|---|---|
| marea | 48,9 % (47,1 %–50,6 %) | 46,3 % (44,5 %–48,0 %) |
| llama | 45,3 % (43,5 %–47,0 %) | 48,9 % (47,1 %–50,7 %) |
| brote | 49,7 % (47,9 %–51,4 %) | 47,8 % (46,1 %–49,6 %) |
| roca | 41,4 % (39,7 %–43,2 %) | 49,0 % (47,2 %–50,8 %) |
| voltio | 45,9 % (44,1 %–47,6 %) | 50,5 % (48,7 %–52,3 %) |
| sombra | 47,4 % (45,6 %–49,2 %) | 50,6 % (48,8 %–52,3 %) |
| vapor | 53,3 % (51,6 %–55,1 %) | 52,9 % (51,1 %–54,7 %) |
| magma | 54,1 % (52,3 %–55,8 %) | 54,7 % (52,9 %–56,4 %) |
| espora | 57,4 % (55,7 %–59,2 %) | 48,5 % (46,7 %–50,3 %) |
| liquen | 52,6 % (50,8 %–54,4 %) | 52,7 % (51,0 %–54,5 %) |
| plasma | 50,8 % (49,0 %–52,5 %) | 49,2 % (47,4 %–51,0 %) |
| tormenta | 52,1 % (50,3 %–53,9 %) | 49,5 % (47,8 %–51,3 %) |
| abismo | 51,2 % (49,4 %–53,0 %) | 49,5 % (47,7 %–51,2 %) |

*Gráfico en el informe HTML: Tasa de victoria de cada familia contra las otras 12 (propuesta).*

## Calidad (D-008 / D-018, C3)

v02: calidad máx. contra mín. 52,0 % (50,4 %–53,5 %) (N = 4000); propuesta: calidad máx. contra mín. 50,6 % (49,1 %–52,2 %) (N = 4000). β = 0,04 sin tocar (decisión del dueño).

## Movimientos: prueba de sustitución

v02: 0 rotos y 0 inútiles de 132 (catálogo: 0 rotos, 0 inútiles de 72); catálogo válido 72/72. propuesta: 0 rotos y 0 inútiles de 132 (catálogo: 0 rotos, 0 inútiles de 72); catálogo válido 72/72.

| Pieza | Valor | v02: victorias medias | v02: rotos/inútiles | propuesta: victorias medias | propuesta: rotos/inútiles |
|---|---|---:|---:|---:|---:|
| arquetipo | curacion | 49,6 % | 0/0 | 49,5 % | 0/0 |
| arquetipo | golpe | 49,9 % | 0/0 | 49,6 % | 0/0 |
| arquetipo | golpe_estado | 49,6 % | 0/0 | 49,4 % | 0/0 |
| arquetipo | maldicion | 49,9 % | 0/0 | 50,0 % | 0/0 |
| arquetipo | proteccion | 50,0 % | 0/0 | 50,2 % | 0/0 |
| arquetipo | tactico | 49,8 % | 0/0 | 49,9 % | 0/0 |
| coste | 1 | 49,2 % | 0/0 | 50,4 % | 0/0 |
| coste | 2 | 50,7 % | 0/0 | 50,5 % | 0/0 |
| coste | 3 | 49,2 % | 0/0 | 49,0 % | 0/0 |
| coste | 4 | 49,9 % | 0/0 | 49,8 % | 0/0 |
| coste | 5 | 49,7 % | 0/0 | 49,6 % | 0/0 |

*Gráfico en el informe HTML: Victorias del equipo con el movimiento frente al golpe de referencia del mismo coste (propuesta).*

## Búsqueda (semillas de elegir)

- **Exploración de energía** (semillas `explora02*`, 500–4000 combates por variante, solo para elegir qué probar): curvas lineal (v0.2), convexa de v0.1 y más convexas, curvas convexas solo arriba, κ entre 0,6 y 1,1, reservas fijas, compresión de `coste_energia` y topes de potencia. La compresión del coste por forma se descartó (desaparecen los costes 1 y 5 y cae el valor de ahorrar). Con los topes de v0.2, las curvas convexas solo arriba no cambiaban nada porque el tope de daño recorta los costes 5. κ apenas mueve el resultado: se deja en 0,9.
- **Sales (movimientos §5.2)** con `sim/combat/search.ts`, procedimiento fijo: por ronda, las 2 familias base más alejadas; cada gen con c1…c4 respetando las cuotas §5.1; F contra las otras 12 con equipos pareados; se aplica la sal que más acerca F al 50 %.

Semilla `elige02`: 40 combates por pareja para medir y 30 por candidata; 153 s.

| Ronda | Fuera de banda al medir | Cambio aplicado | F antes → después (candidata) |
|---|---|---|---|
| 1 | marea 39,8 %, brote 32,9 %, roca 58,2 %, sombra 43,4 %, magma 60,6 %, plasma 55,7 % | `brote.extremidades.2` NaN → c4; `marea.cuerpo.3` r1 → c2 | brote 29,2 % → 44,0 %; marea 42,5 % → 50,1 % |
| 2 | brote 35,8 %, roca 55,5 %, magma 60,3 % | `brote.cabeza.3` NaN → c1; `roca.cola.1` NaN → c2 | brote 41,3 % → 48,1 %; roca 58,9 % → 48,8 % |
| 3 | marea 44,6 %, voltio 55,3 %, sombra 44,8 %, vapor 55,6 % | — | — |
| 4 | marea 43,3 %, brote 44,8 %, magma 55,7 % | `brote.cola.3` NaN → c4 | brote 46,5 % → 50,6 % |
| 5 | brote 44,6 %, liquen 55,5 %, tormenta 55,2 % | — | — |

Semilla `elige02b`: 120 combates por pareja para medir y 60 por candidata; 48 s.

| Ronda | Fuera de banda al medir | Cambio aplicado | F antes → después (candidata) |
|---|---|---|---|
| 1 | sombra 44,3 % | `sombra.cabeza.1` r4 → c1 | sombra 44,3 % → 50,2 % |
| 2 | ninguna | — | — |

Semilla `elige02d`: 150 combates por pareja para medir y 120 por candidata; banda de búsqueda 46,5 %–53,5 % (margen de 1,5 puntos); 82 s.

| Ronda | Fuera de banda al medir | Cambio aplicado | F antes → después (candidata) |
|---|---|---|---|
| 1 | sombra 46,0 %, magma 54,3 %, liquen 54,4 % | `sombra.cabeza.3` NaN → c2 | sombra 47,8 % → 49,9 % |
| 2 | marea 46,2 %, llama 46,4 %, liquen 54,1 % | — | — |

## Compromisos

- La propuesta arregla: Familias C2: Familia más alejada del 50 % (roca).
- Al borde (frágil): Familias C2: Familia más alejada del 50 % (magma) (54,7 %). Con otras semillas puede cambiar de veredicto.
- La curva convexa hace que los kits baratos pierdan potencia: sin las sales nuevas, las familias base con formas pequeñas salen de banda (sección Búsqueda, ronda 1). Las sales lo compensan movimiento a movimiento en el catálogo; los mutados de esas familias siguen la curva sin compensación.
- No hay criterio que ceda: los seis objetivos se cumplen a la vez con estas semillas.

## Recomendación

- **Adoptar la propuesta v0.2.1** en `config/combate` y `config/movimientos` (regenerar el vector dorado del catálogo): cumple todos los criterios con semillas nuevas, con 1 al borde.
- No se ha tocado β (D-008/D-018), la energía por turno (D-020) ni el núcleo.

### Decisiones pendientes

- **Familias C2: Familia más alejada del 50 % (magma)** (54,7 %, umbral 45 %–55 %): (a) aceptarlo en v0.2.1 y vigilarlo; (b) una ronda más de la palanca implicada con semillas nuevas. Recomendación: (b) si suspende, (a) si solo es frágil.

## Método y limitaciones

- Semillas por combate: equipos `<prefijo>|<escenario>|equipos|i` (los mismos para todas las variantes: comparación pareada) y combate `<prefijo>|<escenario>|<variante>|i`. Lados alternos en C2–C4 y en la sustitución; C1 deja A = primer equipo generado.
- Empate = ½ victoria. Medias con IC normal; mediana y p90 con IC por estadísticos de orden; proporciones con Wilson. El IC del recuento de rotos/inútiles del catálogo es de Wilson sobre 72.
- Sustitución con la IA de referencia (κ de la config) en ambos lados; el hueco sustituido es el de la criatura 1 con el mismo coste (o el de su locus); referencia = golpe de la familia del movimiento con todo el presupuesto de la variante, con su tope.
- C2 híbridas: 2 D híbridos con firma al azar y valores = media de los D de sus componentes, más 1 D de cada componente (decisión de v0.1).
- La búsqueda y la exploración usan semillas `explora02*` y `elige02*`. La 1.ª versión de la propuesta (6 sales) se validó con `valida02`: 12/13 familias en banda (fuera: sombra 44,5 %); la sal se había elegido como la mejor de varias decenas de candidatas con 60 combates por pareja, así que rendía menos con semillas nuevas (maldición del ganador). Se refinó con `elige02c` y `elige02d` (120 combates por candidata y una banda de búsqueda con margen) y se revalida aquí con `valida03`. La CLI no deja evaluar con ninguna de esas semillas.
