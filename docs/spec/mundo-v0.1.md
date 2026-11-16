# Especificación del mundo caminable v0.1 — el Prado en cuadrícula (D-074)

Estado: propuesta. Autor: Diseñador de sistemas. Fecha: 2026-11-16.
Primera versión (todo es **[v0.1]**). Configuración: `config/mundo.v0.1.json` (**MCFG**); cita `[ruta]`. Si no coinciden, **manda MCFG**.
Usa sin cambiarlas: `progresion-v0.1` (**PROG**, con `config/progresion.v0.1.json`) y, a través de ella, combate v0.5. **No cambia ninguna regla de progresión ni de combate**: el mapa solo decide *cuándo* se llama a `rollEncounter` del Prado. `config/progresion.v0.1.json` **no se toca**.
Decisiones: D-074 (mundo caminable, empezando por el Prado), D-062 (datos separados de la presentación), D-028/D-062 revisadas, D-032 (lo visual lo valida Miguel jugando), D-037/D-050 (tono de arte).

Notación: `u` = `rng.next()` (1 tirada). Solo `+ − * /`, comparaciones y `Math.round/floor/min/max/abs`. Las cifras marcadas **(estimación)** son cálculos a mano o del script de comprobación del mapa, no simulación con combate.

---

## 0. Resumen

| Pieza | Regla v0.1 |
|---|---|
| Mundo | Un mapa: **Prado de la Linde**, 30 × 24 casillas, vista desde arriba. Marismas y Cantil siguen en lista, a la que se llega por la salida este del Prado |
| Datos | Mapa como filas de caracteres + leyenda de casillas + entidades con coordenadas, en MCFG; la presentación va aparte (`presentacion`, solo cliente) |
| Movimiento | Casilla a casilla en 4 direcciones, 200 ms por paso; teclado (flechas/WASD) y, en táctil, **tocar la casilla de destino** |
| Encuentros | Al terminar un paso en hierba alta, 1 tirada: 5 % (hierba alta) o 10 % (hierba espesa); 4 pasos de gracia tras un encuentro, 6 al salir del santuario; garantía a los 40 pasos sin encuentro. El encuentro es el `rollEncounter("prado_linde")` de siempre |
| Ritmo | ≈ 21 pasos de hierba alta por encuentro (≈ 4,3 s andando), ≈ 14 en la espesa (≈ 2,8 s) (estimación). La sesión sigue en ≈ 6 combates y 10–20 min |
| Santuario | Edificio con puerta; entrar abre las pantallas de progresión. Arnal, fuera, da la intro y la inicial la primera vez. No cura (no hace falta: PROG cura tras cada combate) |
| Guardado | Clave propia `genoma.mundo` (formato `genoma-mundo` v1) con posición, orientación, contadores y gracia; la partida de progresión no cambia. Sin guardado de mundo ⇒ se empieza delante del santuario |
| Arte | Dibujado por código con acabado cuidado: variación por casilla, transiciones entre terrenos, hierba que se mece, agua con brillos, luciérnagas, copas que tapan al jugador, farolero animado con su luz, transición al combate. 60 fps en móvil medio |

---

## 1. El mapa como datos `[mapas]`, `[casillas]`

### 1.1 Formato
Un mapa es un registro de MCFG `mapas[]`:

| Campo | Tipo | Qué es |
|---|---|---|
| `id` | id | Identidad del mapa (`prado_linde`) |
| `zona` | id de zona de PROG | Zona cuyos encuentros salen en su hierba alta (`rollEncounter(game, zona)`) |
| `ancho`, `alto` | enteros | Tamaño en casillas (≤ `[validacion_config.ancho_max]`, `alto_max` = 64) |
| `filas` | `alto` cadenas de `ancho` caracteres | Terreno. Fila 0 arriba, columna 0 a la izquierda; posición `(x, y)` = (columna, fila) |
| `inicio` | `{x, y, mira}` | Dónde aparece el jugador en una partida nueva o sin guardado de mundo |
| `salida_santuario` | `{x, y, mira}` | Dónde aparece al salir del santuario |
| `llegada_desde_lista` | `{x, y, mira}` | Dónde aparece al volver de la lista de zonas |
| `activadores` | lista | Casillas no pisables que disparan una acción al intentar entrar: `puerta` (→ santuario) y `salida` (→ lista de zonas, con condición) |
| `entidades` | lista | Personajes, vecinos, carteles y objetos, cada uno en una casilla pisable que pasan a ocupar (no se atraviesan) |

`mira` ∈ `n, e, s, o` `[movimiento.orden_direcciones]`.

### 1.2 Tipos de casilla (leyenda) `[casillas]`
| Carácter | Tipo | Pisable | Encuentro por paso | Coste de ruta |
|---|---|---|---|---|
| `.` | hierba | sí | 0 | 1 |
| `*` | flores | sí | 0 | 1 |
| `=` | camino | sí | 0 | 1 |
| `+` | puente | sí | 0 | 1 |
| `,` | hierba alta | sí | **5 %** | 4 |
| `;` | hierba espesa | sí | **10 %** | 4 |
| `~` | agua | no | — | — |
| `T` | árbol | no | — | — |
| `R` | roca | no | — | — |
| `H` | muro del santuario | no | — | — |
| `P` | puerta del santuario | no (activa: `puerta`) | — | 1 |
| `S` | salida a otras zonas | no (activa: `salida`) | — | 1 |

Los porcentajes son enteros (`encuentro_pct`, escala `[encuentros.escala_pct]` = 100). Solo la hierba alta y la espesa tienen encuentros: **por camino, hierba baja y flores se puede explorar sin combatir**. Es la decisión de ritmo más importante del mapa.

### 1.3 El Prado de la Linde `[mapas[0]]`
30 × 24 (copia ilustrativa; manda MCFG):
```
   x 0         1         2
     012345678901234567890123456789
 0   TTTTTTTTTTTTTTTTTTTTTTTTTTTTTT
 1   T;;*;TTTT..THHHHHT...TT,,,,,TT
 2   T;;;;;TTT...HHHHH....T,,;;;,,T
 3   T*;;;;TTT...HHPHH..*.T,;;;;;,T
 4   TTTT;TTT......=......,,;;;;,,T
 5   T,,,,,,.......=.......,,;;;,,T
 6   T,,,,,,,......=........,,,,,TT
 7   T,,,,,,,..*...=.........,,,TTT
 8   T,,,,,,..~~~..=..........RR..T
 9   T.,,,,..~~~~~.=...*.......R..T
10   TR.,,..~~~~~~.=..............T
11   T.....~~~~~~..=..............T
12   T......~~~~...===============S
13   T.......~~....=..........R...T
14   T,,,,,,..~....=.....,,,,.....T
15   T,,,,,,,.~....=....,,,,,,....T
16   T,,,,,,,.+=====....,,;;,,,...T
17   T,,,,,,,.~.........,,;;;;,,..T
18   T,,,,,,..~..R......,,;;;;,,..T
19   T,,,,,,..~.........,,,;;,,,..T
20   T.,,,,...~..*.......,,,,,....T
21   T..,,....~...........,,.....RT
22   T........~..................TT
23   TTTTTTTTTTTTTTTTTTTTTTTTTTTTTT
```
Zonas del mapa (lectura de diseño):

| Lugar | Dónde | Para qué |
|---|---|---|
| Santuario | edificio en x 12–16, y 1–3; puerta (14, 3) | Inicio a un paso; Arnal en (15, 4), junto al jugador al empezar (mira al este, hacia él) |
| Camino norte–sur y este | x 14, y 4–16; y 12 hasta la salida (29, 12); ramal al puente (9, 16) | Recorrer el mapa sin combates |
| Campo del oeste | hierba alta, x 1–7, y 5–9 | Primeros encuentros: está a **9 pasos** del inicio (estimación del script) |
| Campo del suroeste | hierba alta, x 1–7, y 14–21, al otro lado del arroyo | Mismo ritmo; se llega por el puente o rodeando el estanque |
| Hierba espesa del noreste | x 22–28, y 1–6, rodeada de hierba alta | El doble de encuentros, a 13 pasos |
| Hierba espesa del sureste | x 19–26, y 14–21, con Gorio al lado | Igual, más lejos (20 pasos) |
| Estanque y arroyo | x 6–12, y 8–13 y x 9, y 13–22 | Paisaje y obstáculo; el puente acorta |
| **Rincón escondido** | x 1–5, y 1–3, tras una brecha en la arboleda (4, 4) a la que solo se llega cruzando el campo del oeste | Lleno de hierba espesa; un farol perdido y un cartel con historia |
| Salida este | (29, 12), con cartel en (27, 11) | A la lista de zonas; cerrada con niebla hasta que se abran las Marismas |

Recuento (script de comprobación): 527 casillas pisables, **todas alcanzables** desde el inicio; 140 de hierba alta y 40 de espesa. Recorrer todo el mapa andando cuesta ≈ 2 min; con los 4–6 encuentros que salen por el camino, la primera exploración completa ocupa **≈ 10–15 min** (estimación), que es la primera sesión de PROG §1.1.

### 1.4 Entidades `[mapas[].entidades]`
| `tipo` | Campos | Comportamiento |
|---|---|---|
| `personaje` | `personaje` (id de `progresion.mundo.personajes`), textos propios | Arnal: §4.2 |
| `vecino` | `nombre`, `texto` (1 frase) | Interactuar muestra su frase. Tasia (16, 8) y Gorio (18, 18) |
| `cartel` | `texto` | Igual que un vecino, sin nombre. Este (27, 11) y rincón (1, 3) |
| `objeto` | `da: {faroles}`, `texto`, `texto_lleno` | Se recoge al interactuar, **una vez por partida**; suma con el tope de PROG (`recursos.faroles_max`). En el tope no se recoge y queda ahí. Desaparece al recogerlo |

Todas ocupan su casilla (bloquean el paso) y se usan desde una casilla vecina mirando hacia ellas.

**El farol perdido (+1, una vez).** Es el premio del rincón escondido. Efecto en la economía de PROG: +1 farol en toda la partida (frente a 6 iniciales y +1 por victoria): despreciable, no cambia ningún criterio de §9 de PROG. Recortable si se quiere el mapa sin economía.

### 1.5 Salida a otras zonas `[mapas[].activadores]`
- Intentar entrar en `S` con la zona `abre_con_zona` (Marismas) **cerrada** (`zoneUnlocked` de PROG) muestra `texto_cerrada` y el jugador no se mueve. El cliente dibuja niebla.
- Abierta: abre la **lista de zonas** de hoy filtrada a `zonas` (Marismas y Cantil, cada una con su candado de PROG). Desde la lista se combate como hoy. Al volver, el jugador aparece en `llegada_desde_lista` con gracia `[encuentros.gracia_al_volver_de_lista]` = 4.
- El Prado **sale de la lista**: solo se juega andando.

---

## 2. Movimiento `[movimiento]`

### 2.1 Reglas (núcleo)
- Un paso mueve una casilla en `n/e/s/o`. No hay diagonales ni carrera.
- `step(dir)`: la orientación pasa a `dir` siempre. La casilla destino `(x+dx, y+dy)` se comprueba en este orden:
  1. fuera del mapa → bloqueado;
  2. ocupada por una entidad → bloqueado (no interactúa: para eso está «usar»);
  3. activador → evento (`puerta` o `salida`, §1.5, §4); no se mueve;
  4. no pisable → bloqueado;
  5. hierba alta o espesa sin inicial elegida (`inicial.elegida = null`) → bloqueado con motivo `sin_anima` (el cliente muestra `texto_sin_anima` de Arnal);
  6. si no, se mueve; `pasos_totales++`; si la casilla tiene `encuentro_pct > 0`, se resuelve el encuentro (§3).
- Bloquear no consume tiradas ni cambia contadores (solo la orientación).

### 2.2 Ritmo (cliente)
- `[movimiento.ms_por_paso]` = **200 ms** (5 casillas/s), interpolado. Mantener la tecla o el dedo encadena pasos sin pausa.
- Durante un paso se guarda **1** entrada en cola `[cola_entradas]`; se ignoran más (no hay "deslizamiento" tras soltar).
- Girar sin moverse: pulsar hacia una casilla bloqueada solo gira (con un pequeño empujón visual de 80 ms).

### 2.3 Controles
| Entrada | Acción |
|---|---|
| Flechas / WASD | Andar (mantener = seguir andando) |
| Espacio / Intro / E | Usar: hablar, leer, recoger, abrir la puerta si se mira hacia ella |
| Esc / M | Menú (equipo, colección, guardar y salir) |
| **Táctil: tocar una casilla** | Ir hasta ella por la ruta de §2.4; tocar a un personaje/cartel/objeto/puerta/salida = ir a su lado y usarlo |
| Táctil: tocar al jugador | Abre el menú |

**Recomendación para móvil: tocar la casilla de destino, sin cruceta.** Motivos: en 380 px una cruceta tapa un tercio del mapa y el pulgar tapa al jugador; un toque es una intención completa («ve allí», «habla con él»); y la ruta que evita la hierba alta (§2.4) hace que andar por el mapa no meta combates sin querer. Para buscar encuentros, se toca una casilla dentro de la hierba. Alternativa descartada: cruceta virtual (§8, M3). Si en la prueba se echa de menos, se añade una cruceta opcional sin tocar el núcleo.

### 2.4 Ruta táctil (núcleo, pura)
`planRoute(world, game, destino, mcfg)` → lista de direcciones o `null`:
- Dijkstra con coste entero `[casillas.*.coste_ruta]` (1 normal, **4 en hierba alta y espesa**): prefiere rodear la hierba si el rodeo cuesta menos de 4 pasos por casilla de hierba evitada. Si el destino es hierba, entra en ella.
- Desempate fijo: menor coste, después menor número de pasos, después orden `[orden_direcciones]` (n, e, s, o) al expandir. Determinista.
- Destino no pisable (entidad, activador): la ruta lleva a la casilla vecina pisable de menor coste (desempate por el orden de direcciones) y termina mirando al destino; el cliente ejecuta «usar» al llegar.
- Sin ruta o más de `[ruta_max_pasos]` = 80 pasos → `null` (el cliente marca la casilla con una cruz breve).
- La ruta **se cancela** si un paso da un encuentro, un evento o queda bloqueado, o si llega otra entrada. Cada paso se ejecuta con `step` (la ruta no salta reglas).

---

## 3. Encuentros por paso en hierba alta `[encuentros]`

### 3.1 Regla
Al **terminar** un paso en una casilla con `pct = encuentro_pct > 0`:
```
k   = mundo.contadores.pasos_hierba                         // valor ANTES de incrementar (igual que PROG I-03)
u   = createRng(semilla + "|paso|" + k).next()               // 1 tirada, SIEMPRE (también en gracia)
mundo.contadores.pasos_hierba = k + 1
si mundo.gracia_restante > 0:
    mundo.gracia_restante −= 1                               // en gracia: nunca hay encuentro
                                                             // (pasos_sin_encuentro no cambia: el tope cuenta solo pasos fuera de gracia)
si no:
    hay = floor(u · 100) < pct  o  mundo.pasos_sin_encuentro + 1 >= pasos_max_sin_encuentro
    si hay:
        (game, enc) = rollEncounter(game, mapa.zona, PROG)   // PROG §2.3 sin cambios: 622 tiradas de su flujo encuentro|n
        mundo.gracia_restante     = gracia_tras_encuentro    // se aplica YA (§3.3)
        mundo.pasos_sin_encuentro = 0
    si no:
        mundo.pasos_sin_encuentro += 1
```
- `semilla` = la de la partida de PROG (única fuente de azar; flujo nuevo `paso` `[guardado.flujos_rng]`, que no choca con los de PROG).
- **1 tirada por paso de hierba, siempre**: el resultado del paso k no depende de la gracia ni de qué casilla fue (salvo por su `pct`). El contenido del encuentro sale de otro flujo (`encuentro|n` de PROG), así que el mapa no altera qué ánimas salen ni sus reglas (nivel, grupo, familias del Prado).
- `gracia_restante` y `pasos_sin_encuentro` solo cuentan **pasos de hierba** (andar por el camino no gasta gracia).
- Si `rollEncounter` lanza `GameRuleError` (no debería: el Prado siempre está abierto y el paso 5 de §2.1 exige inicial), el paso queda hecho sin encuentro y el error se registra en consola.

### 3.2 Números `[encuentros]`
| Clave | Valor | Motivo |
|---|---|---|
| `encuentro_pct` hierba alta / espesa | 5 / 10 | Un combate dura 1,5–2 min: andar debe ser un respiro corto, no la parte larga; la espesa da al jugador un "quiero combatir ya" |
| `gracia_tras_encuentro` | 4 | Tras combatir (o huir) puedes dar unos pasos y salir de la hierba sin otro combate encadenado |
| `gracia_al_salir_santuario` | 6 | Tras resonar y ordenar el equipo, cruzar hasta la hierba que quieras sin que te paren a la entrada |
| `gracia_al_volver_de_lista` | 4 | Igual que tras un encuentro |
| `pasos_max_sin_encuentro` | 40 | Corta las rachas largas (con 5 %, sin tope, 1 de cada 20 rachas pasaría de 58 pasos) |

Al aplicar gracia: `gracia_restante = max(gracia_restante, valor)`.

### 3.3 Ritmo (estimación exacta de la regla, sin combate)
Pasos de hierba hasta el encuentro = gracia + `Σ_{i=0}^{39} (1 − p)^i`:

| Casilla | Pasos medios (con gracia 4) | Tiempo andando (200 ms/paso) | Rachas que llegan al tope de 40 |
|---|---|---|---|
| Hierba alta (5 %) | **21,4** | **≈ 4,3 s** | 12,9 % |
| Hierba espesa (10 %) | **13,9** | **≈ 2,8 s** | 1,5 % |

Más el trayecto: la hierba alta más cercana está a 9 pasos del santuario (≈ 2 s). **Sesión típica de PROG §1.5** (6 combates de ≈ 105 s, 6–10 resonancias de 40 s, 2 viajes al santuario): andar suma ≈ 6 × 4,3 s + 2 × 2 × 9 × 0,2 s ≈ **35 s** por sesión; la sesión pasa de ≈ 15 a ≈ 15,5 min (estimación) y sigue en **≈ 6 combates y 10–20 min**: los criterios de PROG §9.2 no cambian, porque el número de combates lo decide el tiempo de combate, no el de andar. Lo que sí cambia: «huir antes del turno 1 para rebuscar» (PROG §2.2, B-12) cuesta ahora ≈ 21 pasos más; es un pequeño freno a favor.

### 3.4 Determinismo y recarga
- El contador `pasos_hierba` se guarda (§5). Como el paso `k` siempre da el mismo `u`, **recargar no cambia el siguiente encuentro**: si el guardado está unos pasos atrás, se repiten las mismas tiradas en el mismo orden (no hay forma de "volver a tirar").
- Orden de escritura al saltar un encuentro: **primero el mundo** (con `pasos_hierba`, gracia y `pasos_sin_encuentro` ya aplicados) **y después la partida** (con `contadores.encuentros` ya incrementado, como hoy). Si se corta entre las dos, se pierde ese encuentro sin repetirlo (equivale a huir). Cerrar a mitad de combate = huida (PROG §7.1); la gracia ya está aplicada.
- No se usa reloj ni `Math.random` en ninguna regla del mapa.

---

## 4. Santuario y Arnal

### 4.1 Santuario
- Intentar entrar en la puerta `P` abre la **pantalla de santuario** de hoy (`animas.html`): Resonar, Colección (con equipo y variantes), Codex. El botón «Salir a explorar» pasa a ser **«Salir al Prado»**.
- Al salir, el jugador aparece en `salida_santuario` (14, 4) mirando al sur, con gracia 6.
- **No cura.** PROG §2.2 (`curacion_tras_combate` = completa) deja la vida llena al acabar cada combate y no hay vida persistente ni objetos de curación: fuera del combate las ánimas siempre están enteras. Curar al entrar no haría nada; si algún día la vida persiste (PROG PR12 descartado), el santuario es el sitio natural para curar.
- Guardar: entrar y salir del santuario guarda las dos claves.

### 4.2 Arnal (`arnal`, en (15, 4))
- **Primera vez** (`inicial.elegida = null`): «usar» frente a él da las 5 líneas de `progresion.mundo.personajes[hechicero].texto_inicio` y, a continuación, la elección de inicial y el nombre (pantallas de hoy, PROG §1.2–1.4). Después `markIntroSeen`. Hasta entonces Arnal lleva un «!» encima y la hierba alta está cerrada (§2.1, paso 5); la salida este ya lo está por su condición.
- Después: `texto_despues` en ciclo (índice `mundo.charlas.arnal mod 3`, que se incrementa al hablar). Son pistas: dónde salen ánimas, la niebla del este, qué hay dentro del santuario.
- Partida nueva: el jugador aparece en `inicio` (14, 4) mirando a Arnal, con el aviso «Habla con Arnal» (toca o pulsa Espacio).

---

## 5. Guardado `[guardado]`

### 5.1 Formato `genoma-mundo` v1 (clave `genoma.mundo`, aparte de `genoma.partida`)
```
{
  formato: "genoma-mundo", version: 1,
  semilla: string,                       // copia de la semilla de la partida: enlaza las dos claves
  config: { mundo: "0.1" },
  mapa: "prado_linde",
  pos: { x, y }, mira: "n"|"e"|"s"|"o",
  contadores: { pasos_hierba, pasos_totales },        // enteros ≥ 0
  gracia_restante: entero 0..max(gracias),
  pasos_sin_encuentro: entero 0..pasos_max_sin_encuentro − 1,
  recogidos: [ id de objeto ],           // sin repetir
  charlas: { [id de entidad]: entero ≥ 0 }
}
```
- Se guarda: al saltar un encuentro (antes que la partida, §3.4), al entrar/salir del santuario y de la lista, al usar una entidad, y como mucho cada **10 pasos** andando (para no escribir en cada paso; perder hasta 9 pasos al recargar es inofensivo por §3.4).
- **Carga** (sin tiradas): formato y versión; `semilla` igual a la de la partida cargada; `mapa` existe; `pos` dentro del mapa, pisable y sin entidad (salvo objetos ya recogidos); `mira` válida; enteros en rango; `recogidos` ⊂ ids de objetos del mapa; claves de `charlas` ⊂ ids de entidades.
- **Si algo falla, no se borra la partida:** el mundo se rehace con `newWorld` (inicio, contadores a 0) y se avisa en `notes`. Lo único que se pierde es la posición y el farol perdido (que se podría recoger otra vez: +1 farol, aceptable). Contadores a 0 no permite elegir encuentros: la secuencia de `paso|k` es fija.

### 5.2 Migración desde el guardado de progresión v0.1
- La partida `genoma-partida` v1 **no cambia** (ni formato, ni versión, ni `config/progresion.v0.1.json`).
- Partida existente sin clave `genoma.mundo` → `newWorld(game)`: en `inicio`, contadores a 0, gracia 6, nada recogido. Si ya tenía inicial, Arnal no repite la intro (lo decide `inicial.elegida`, no el mundo).
- Partida nueva: el cliente borra `genoma.mundo` al crearla.
- Exportar/importar (recortable en PROG): cuando se haga, exporta `{ partida, mundo }`.

---

## 6. Núcleo y cliente

### 6.1 Reparto
| Núcleo (`packages/core/src/world/`, nombres internos en inglés, puro y con tests) | Cliente (`client/animas/`) |
|---|---|
| Parsear y validar MCFG (§6.2) | Dibujar mapa, personajes y efectos; cámara; animación de pasos (§7) |
| Estado del mundo, `step` (colisión, eventos, tirada de encuentro, llamada a `rollEncounter`) | Teclado, toques, cola de entrada, ejecución de rutas paso a paso |
| `planRoute` (Dijkstra determinista) | Diálogos, avisos, transiciones, menú |
| `interact` (vecinos, carteles, objeto con tope de faroles, Arnal y su ciclo) | Llamar a las pantallas existentes (santuario, lista, combate, inicial) |
| Serializar y cargar `genoma-mundo` con validación y respaldo | `localStorage`, orden de escritura (§3.4), guardado cada 10 pasos |

### 6.2 Validación de MCFG (sin tiradas)
Claves desconocidas rechazadas (como PROG N-02), salvo `presentacion` y los `_doc*`, que se admiten sin mirar dentro. Leyenda: un carácter por clave, ids `^[a-z0-9_]+$`, `encuentro_pct` entero 0..100 y > 0 solo si pisable, `coste_ruta` entero ≥ 1 si pisable o activa, `activa` ∈ {puerta, salida} solo en no pisables. Mapa: `filas.length = alto`, cada fila de longitud `ancho`, todos los caracteres en la leyenda, **borde no pisable**, `inicio`/`salida_santuario`/`llegada_desde_lista` pisables y libres, `zona` existe en PROG, activadores sobre casillas con su `activa` y viceversa (toda `P`/`S` tiene activador), `zonas` de la salida existen en PROG, entidades sobre pisables sin repetir casilla ni id, `personaje` existe en `progresion.mundo.personajes`, **todas las casillas pisables alcanzables desde `inicio`** y toda entidad/activador con una vecina alcanzable. Encuentros: gracias enteras ≥ 0, `pasos_max_sin_encuentro` ≥ 1, `tiradas_por_paso_hierba` = 1, `escala_pct` = 100. Movimiento: `orden_direcciones` = permutación de n/e/s/o con vectores unitarios.
(El script de comprobación del diseñador ya pasa todo esto con el Prado.)

### 6.3 API orientativa
```
parseWorldConfig(json, progCfg) → WorldConfig
newWorld(game, wcfg) → WorldState
step(world, game, dir, wcfg, progCfg) → { world, game, outcome }
   outcome = { kind: "moved" } | { kind: "blocked", reason: "edge"|"solid"|"entity"|"no_starter"|"exit_locked" }
           | { kind: "door", to: "santuario" } | { kind: "exit", zones: [...] }
           | { kind: "encounter", encounter }           // ya con rollEncounter aplicado en game
interact(world, game, wcfg, progCfg) → { world, game, outcome }   // talk | sign | pickup | pickup_full | arnal_intro | door | exit | nothing
planRoute(world, game, target{x,y}, wcfg) → Dir[] | null
leaveSanctuary(world, wcfg) / returnFromZoneList(world, wcfg) → WorldState
tileAt(wcfg, mapId, x, y), facingTarget(world, wcfg)              // ayudas para el cliente
serializeWorld(world) / parseWorldSave(text, game, wcfg) → { world, notes }
```
Tests mínimos: mismo `k` ⇒ misma tirada; 1 tirada por paso de hierba también en gracia; ninguna tirada al chocar ni en camino; gracia que solo baja en hierba; tope de 40 garantiza encuentro; el encuentro del mapa es idéntico al de `rollEncounter` con el mismo `n`; hierba cerrada sin inicial; salida cerrada/abierta según `zoneUnlocked`; objeto con tope de faroles y una sola vez; ruta determinista que rodea la hierba y termina mirando a la entidad; carga con semilla distinta o posición inválida → mundo nuevo con nota; ida y vuelta de guardado con el mismo hash; config con fila corta, carácter desconocido, borde abierto o casilla inalcanzable → error. Dorado: una partida con 300 pasos guionizados por el Prado (hash del mundo y de la partida).

---

## 7. Arte del mapa (para el cliente) `[presentacion]`

**Nivel de acabado: cuidado, no provisional** (Miguel: «haz algo bonito»). Todo dibujado por código en `<canvas>`, sin imágenes externas, con estética propia: el lenguaje del arte v3 de las ánimas (capas planas de la misma forma de oscuro a claro, **sin contorno**, sin degradados en las formas, luz como recorte) aplicado al paisaje. Tono: un prado al **atardecer fijo**, sereno pero con algo travieso en la hierba; colores vivos sobre un fondo que tiende a oscuro, y la luz cálida de los faroles como hilo conductor (el Gran Farol roto, Arnal farolero, el jugador aprendiz). Nada que recuerde a un juego concreto: ni casillas de hierba con el patrón de otro juego, ni personajes con gorra y mochila, ni la paleta de una franquicia.

### 7.1 Escala y nitidez `[presentacion.escala]`
| Ventana | Casilla (px CSS) | Vista (casillas) | Lienzo (px CSS) |
|---|---|---|---|
| Móvil (< 720 px, p. ej. 380) | **32** | 11 × 13 | 352 × 416 (cabe con 14 px de margen) |
| Escritorio (≥ 720 px, p. ej. 1100) | **48** | 17 × 13 | 816 × 624 |
- El lienzo se dibuja a `devicePixelRatio` (tope 2): backing store = CSS × dpr, `ctx.scale(dpr, dpr)`. Posiciones de formas estáticas redondeadas a medio píxel de dispositivo; las líneas finas (briznas) con grosor ≥ 1 px de dispositivo.
- Todo se dibuja en "unidades de casilla" (0..1) y se escala: el mismo código para 32 y 48 px.

### 7.2 Terreno con variación y transiciones `[presentacion.casillas]`
- **Variación determinista por casilla:** `h = hash32(x, y, semilla_visual)` (entero, sin `Math.random`) elige posición, cantidad y color de los detalles: matas de 2–4 briznas, flores de dos colores, guijarros en el camino, musgo en las rocas, tono de la hierba entre `colores[0]` y `colores[2]` en 3 pasos. Ninguna casilla igual que la de al lado; el mapa se ve igual cada vez.
- **Transiciones, no cuadrados:** cada casilla mira a sus 4 vecinas (y las 4 diagonales para las esquinas). Entre terrenos distintos el borde es una **curva irregular** (3–4 puntos con desplazamiento por hash) en lugar de la línea recta: el camino se "come" un poco la hierba con bordes ondulados y guijarros sueltos; el agua tiene orilla de arena clara de ~0,12 casilla y una línea de espuma; la hierba alta nace en una mancha más oscura que se funde con la hierba baja. Esquinas interiores redondeadas.
- **Hierba alta y espesa:** 5–7 briznas en V por casilla que sobresalen **1/3 de casilla por arriba** de su casilla; se dibujan **en la capa de entidades por fila** (§7.4) para que tapen los pies del jugador cuando está dentro. La espesa, más densa, con puntas violeta (`#7b63a3`) que la distinguen a simple vista.
- **Árboles:** tronco en su casilla y copa redonda de 3 capas que sube una casilla hacia arriba; la copa va en la capa `copas` (por encima del jugador): al pasar detrás, el jugador queda tapado y la copa se vuelve semitransparente (alfa 0,55) mientras lo tape. Sombra elíptica de la copa sobre el suelo.
- **Santuario:** piedra en hiladas con tejado a dos aguas que ocupa la fila de arriba, un farol colgado junto a la puerta y la puerta como arco con luz cálida que **respira** (alfa 0,6–0,9, 2,6 s).
- **Salida:** cerrada, niebla fría en 3 velos que se desplazan despacio hacia dentro; abierta, el camino se pierde en luz azulada.
- Paleta por tipo en `[presentacion.casillas.*.colores]` (base, sombra, luz, acento).

### 7.3 Ambiente animado `[presentacion.ambiente]`
- **Hierba alta que se mece:** desplazamiento de la punta de cada brizna `= A · onda(t / periodo + fase(h))`, con la onda como tabla precalculada de 32 valores (no hace falta trigonometría ni en el cliente) y periodo 1,4 s (espesa 1,9 s). Al pisarla, las briznas de esa casilla se apartan 250 ms.
- **Agua:** brillos de 1–2 px que aparecen y se apagan (2,2 s) en posiciones por hash; ondas lentas en la orilla.
- **Luciérnagas** (≤ 14) que flotan cerca de la hierba alta y el agua; motas de luz alrededor del farol del jugador (≤ 6); alguna hoja que cae de los árboles (≤ 4). Tope total de partículas `[rendimiento.particulas_max]` = 40.
- **Luz:** velo de atardecer azulado (`luz_ambiente.velo`, alfa 0,28) sobre todo el mapa y viñeta suave; los faroles (jugador, puerta, Arnal) "abren" el velo en un círculo de luz cálida (halo del jugador `halo_radio_casillas` = 2,5). Es la firma visual del mapa.
- `prefers-reduced-motion`: sin mecido ni partículas, solo la luz.

### 7.4 Profundidad y orden de dibujo `[presentacion.rendimiento.capas]`
`suelo_cache` (terreno estático) → `agua_anim` → `hierba_anim` (base de la hierba) → `sombras` (elipses bajo personajes, troncos y rocas) → **`entidades_por_fila`** (para cada fila de arriba abajo: briznas altas de esa fila, troncos, rocas, personajes y jugador ordenados por `y`, así el de más abajo tapa al de arriba) → `copas` → `luz` (velo y halos) → `particulas` → `ui` (bocadillos, «!», marcador de destino).

### 7.5 El farolero aprendiz (jugador) y los personajes `[presentacion.personajes]`
- **Farolero:** figura pequeña (≈ 0,8 casilla de alto) con **capa con capucha** en tono óxido (`#b4532f`) en 2–3 capas planas, interior de la capucha oscuro con **dos ojos de luz** (como las ánimas: recortes, sin cara dibujada), y un **bastón con farol** que da luz cálida. Silueta legible a 32 px: triángulo de capa + farol a un lado.
- **4 direcciones** (de espaldas: se ve la capucha y el farol asomando; de lado: el bastón delante) y **andar de 4 frames** por paso (balanceo de la capa y del farol, que se columpia con retraso). Quieto: respira (1,8 s) y el farol oscila un poco. Al chocar: pequeño empujón.
- **Arnal:** más alto, capa violeta, barba clara, farol grande; ojos de luz azul pálida. «!» dorado sobre él hasta la intro.
- **Tasia y Gorio:** misma familia de formas que el farolero (capa y ojos de luz), cada uno con su color y un rasgo (Tasia, sombrero de ala; Gorio, encorvado con cayado). **Cartel:** poste de madera con tablilla. **Farol perdido:** pequeño farol entre flores con luz tenue que parpadea.
- Texto en bocadillo sobre un panel oscuro con borde fino del color del hablante; avanza con Espacio o toque.

### 7.6 Pistas y transición al combate `[presentacion.asomo]`, `[transicion_encuentro]`
- **Ánimas que asoman (decorativo):** cada 6–11 s, en una casilla de hierba alta visible a 2–5 casillas del jugador, asoman un instante (0,9 s) **dos ojos de luz** del color de una familia del Prado y la hierba tiembla. Dice «aquí hay ánimas», **no predice nada**: la casilla y el momento salen de un hash del tiempo de pantalla y la posición, nunca del flujo `paso`. (Una pista que predijera el encuentro obligaría a enseñar la tirada; descartado, §8 M7.)
- **Transición al saltar un ánima** (1,1 s en total): el jugador se para; las briznas de su casilla saltan (180 ms); asoman unos ojos de luz del color de la familia de la **primera salvaje del encuentro** (ya generado, no revela nada que el combate no muestre a continuación; 350 ms); destello claro (120 ms); viñeta que se cierra hacia el jugador (450 ms) y entra la pantalla de combate. Al volver, la viñeta se abre desde el jugador.

### 7.7 Cámara
Centrada en el jugador, interpolada con el paso (sin retraso propio: se mueve igual que él), y **recortada a los bordes del mapa** (nunca enseña fuera). Con mapas menores que la vista, centrado.

### 7.8 Presupuesto de rendimiento `[presentacion.rendimiento]`
- **60 fps en un móvil medio** (objetivo: ≤ 8 ms por frame de dibujo). `requestAnimationFrame`; se pausa con la pestaña oculta.
- Terreno estático pre-dibujado en bloques de 8 × 8 casillas en lienzos fuera de pantalla (por escala y dpr), dibujados con `drawImage` solo los visibles (≤ 6 bloques). En móvil: 8 × 8 × 32 × 2 = 512 px de lado por bloque.
- Cada frame solo se redibuja lo animado y visible: hierba alta (≤ ~60 casillas en vista), brillos del agua, entidades, luz y ≤ 40 partículas. Sin `shadowBlur` ni filtros por frame; los halos de luz son círculos pre-renderizados.
- Si la media de un frame pasa de 14 ms durante 2 s, **modo reducido**: menos briznas, sin hojas ni luciérnagas.
- Verificación del cliente (Playwright, `file://`, 380 y 1100 px, sin errores de consola) y medida de ms/frame con 4× de ralentización de CPU.

### 7.9 Pulido mínimo de las pantallas de `animas.html`
Para que santuario, Codex y resonancia no desentonen con el mapa, sin rehacerlas:
- **Mismo fondo y luz:** fondo `#12141c` con la viñeta del mapa y un halo cálido de farol detrás del título de cada pantalla; los paneles toman un tono de la paleta del santuario (`#433a49` con borde `#655a6b`) en lugar del gris neutro.
- **Santuario como lugar:** cabecera con el interior dibujado por código en el mismo estilo (pared de piedra, farol grande, Arnal a un lado) y los botones como objetos del lugar en fila (Resonar, Colección, Codex, Salir al Prado), con icono simple dibujado por código.
- **Arnal:** el emoji de farol del bocadillo se sustituye por su retrato dibujado (mismo dibujo que en el mapa, a 48 px).
- **Resonancia:** las dos ánimas sobre fondo oscuro con su halo de familia y un hilo de luz que las une durante la confirmación; el eco aparece con un destello del mismo tipo que la transición al combate.
- **Codex:** casillas de gen apagadas como «?» en tono pizarra, encendidas con el color de su familia; mismo radio de esquina y borde fino que el resto.
- **Transiciones:** fundido de 200 ms entre mapa y pantallas (viñeta) en vez de cambio seco.
- Tipografía y botones: los de hoy; solo colores y fondos. Nada de esto toca reglas ni el combate.

---

## 8. Alternativas descartadas (para DECISIONES.md)

| # | Decisión | Alternativas descartadas |
|---|---|---|
| M1 | Mapa como filas de caracteres + leyenda + entidades con coordenadas | Matriz de ids (ilegible a mano); editor de mapas (alcance); mapa generado (no se puede diseñar el rincón ni el ritmo) |
| M2 | Encuentros por paso al terminar en hierba alta, 5 % / 10 %, 1 tirada fija por paso | Contador de pasos fijo hasta el encuentro (predecible, se cuenta); probabilidad por segundo (depende del reloj); ánimas visibles que persiguen (alcance y reglas nuevas); 10 % / 20 % (andar sería solo transición entre combates de 1,5–2 min) |
| M3 | Táctil: tocar la casilla de destino, ruta que evita la hierba | Cruceta virtual (tapa un tercio de la pantalla a 380 px y el pulgar tapa al jugador); deslizar el dedo como joystick (impreciso en cuadrícula) |
| M4 | Gracia de 4 pasos de hierba tras un encuentro y 6 al salir del santuario; tope de 40 | Sin gracia (combates encadenados al salir de uno); gracia por tiempo (reloj); sin tope (rachas largas de 60+ pasos) |
| M5 | Guardado del mundo en clave propia `genoma.mundo`, enlazada por semilla | Subir `genoma-partida` a v2 con un bloque `mundo` (obliga a tocar `progresion.v0.1.json` y el parser de partida, y mezcla presentación con progresión; se puede unificar en v0.2 si conviene) |
| M6 | El santuario no cura | Curar al entrar (no hace nada con la vida completa tras combate de PROG) |
| M7 | Asomos de ánimas decorativos | Asomos que predicen el siguiente encuentro (habría que enseñar la tirada o guardar más estado; promete algo que no es) |
| M8 | Farol perdido +1 una vez, en el rincón | Sin premio (el rincón no tendría motivo); premio de esencia o ánima (toca la economía de PROG) |
| M9 | Hierba alta cerrada hasta elegir inicial; Arnal da la intro al hablarle | Intro automática al cargar (como hoy; el mapa no se estrena); Arnal bloqueando el camino (obliga a hablar, pero el jugador ni ha visto el mapa) |
| M10 | Atardecer fijo con luz de faroles | Ciclo día/noche (necesita reloj o contador; alcance) |

## 9. Pendiente de validar
No necesita simulación de balance: no cambia ningún número de PROG. Se valida **jugando** (D-032):
1. Que 4,3 s / 2,8 s de hierba por encuentro se sientan bien (ni pesados ni "no salen"); ajuste por config (`encuentro_pct`, gracias).
2. Que tocar el destino sea cómodo en móvil y que la ruta que evita la hierba no sorprenda.
3. Que la primera exploración ocupe 10–15 min y que el rincón escondido se encuentre sin pistas forzadas (¿Arnal debería insinuarlo?).
4. 60 fps en el móvil de Miguel y de un amigo; el modo reducido salta solo cuando hace falta.
5. Que la sesión de PROG siga en ≈ 6 combates: el analista puede añadir 35 s por sesión a su modelo de tiempo (no hace falta otra corrida).

## 10. Preguntas para Miguel
Ninguna bloqueante. Una de gusto, con respuesta por defecto:
- **¿El jugador elige aspecto o nombre del farolero aprendiz?** (a) No: figura encapuchada fija, neutra, con ojos de luz (recomendado: encaja con las ánimas, cero pantallas nuevas y nada que pueda salir mal en la prueba); (b) elegir color de capa entre 4 (barato, ~10 k tokens); (c) nombre y aspecto (alcance de paso 2).

## 11. Cambios
Primera versión. Respecto a PROG v0.1 (que no se edita): el Prado deja la lista de zonas y se juega andando (§1.5); «Salir a explorar» del santuario pasa a «Salir al Prado» (§4.1); la intro de Arnal se dispara al hablarle en el mapa (§4.2); flujo de azar nuevo `paso` (§3) en un guardado aparte (§5). Ninguna regla ni número de PROG cambia.
