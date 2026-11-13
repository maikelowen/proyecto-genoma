# Plan del videojuego de criaturas (breeding + PvP + mercado)

Documento de visión. Copiado del proyecto de Claude el 2026-11-13 (versión del 10 nov, tarde). Las specs de `docs/spec/` y las decisiones de `DECISIONES.md` mandan sobre este documento.

## Vigencia: lo que ha cambiado desde que se escribió

Léelo con estas correcciones. Si algo de abajo choca con esta lista, manda la lista.

| Sección | Lo que dice el documento | Lo vigente |
| --- | --- | --- |
| 1, 4 | Equipos de 4 | **Equipos de 3 en cuadrícula 2×2**, colocación a ciegas (D-043) |
| 4 | 4 movimientos + golpe básico; elegir objetivo; energía +3 | **4 botones por alma: 1 gratis (gen de extremidades) + 3 de pago** (D-033); **objetivo automático por fila y carril**, provocar desde cualquier fila (D-042, D-043); energía 4/turno; energía rival oculta (D-034); descanso de un turno (D-039). Spec: `docs/spec/combate-v0.4.md` |
| 3.3 | Deriva genética activa | **Desactivada** por configuración (D-027) |
| 3.3, 9 | "Criaturas"; arte con contorno grueso, tono 3 de 10 | **Ánimas** (D-046), concepto de almas "pequeños diablos" para 18–40 años (D-025); **arte v3** sin contorno, un gen = una zona, bocas, temperamentos (D-037, D-048, D-050). Ver `docs/arte/direccion-visual.md` |
| 5 | Mapa de casillas | **Lista de zonas** (D-028) |
| 8, 11 | Mercado en la Fase 4 de la beta | **Mercado fuera de la beta** (D-028) |
| 11 | Fase 0 semana 3: simulador de economía | Sustituido por una **hoja de metas en días de juego** antes de la Fase 3 (D-032) |
| 11 | Hoja de ruta por semanas | Planificación **por cuota de uso** (D-032). Hoja de ruta vigente: `docs/proyecto/HOJA-DE-RUTA.md` |
| 12 | Memoria en el proyecto de Claude | **El repositorio es la fuente de verdad**; los chats del proyecto son para decisiones (D-051) |
| 13 | Decisiones pendientes | Lista viva en `docs/proyecto/PREGUNTAS.md` |
| — | Nuevo, no estaba | Progresión que desbloquea movimientos, no estadísticas (D-029); habilidades enseñables por familia en santuarios (D-036); complementos equipables (D-049); PvP asíncrono resuelto en servidor sin entregar la semilla (D-030) |

---

Título de trabajo: **Proyecto Genoma**. Documento vivo: lo iremos ampliando fase a fase. Este documento recoge la visión y las reglas de alto nivel. Las reglas detalladas con todos sus números viven en las especificaciones del repositorio (`docs/spec/`), que mandan en caso de duda.

## 1. Resumen y viabilidad

Un juego web (móvil y PC) de coleccionar y combatir criaturas originales, con una historia ligera, combate por turnos de equipos de 4, un sistema de **breeding genético con mutaciones impredecibles**, PvP con ranking y un mercado interno sin dinero real.

**Veredicto:** con 10 h/semana y Claude escribiendo la mayor parte del código, es realista llegar a una **beta cerrada jugable en unos 7 meses**. Lo que no cubre Claude: arte final, música, probar con personas reales, dar de alta cuentas e infraestructura, y asesoría legal cuando haya dinero de por medio.

La jugada clave de este plan: **el arte se genera a partir de los genes**. Cada parte del cuerpo es un gen, así que una mutación nueva produce automáticamente un aspecto nuevo. Esto resuelve el problema del arte en el prototipo y es justo lo que hace que el breeding sea emocionante.

## 2. Decisiones ya tomadas

| Tema | Decisión |
| --- | --- |
| Objetivo | Publicar y monetizar, empezando como proyecto personal sin dinero |
| Dedicación | 10 h/semana |
| Plataforma | Web que funcione en móvil y PC (después, tiendas) |
| Economía | Mercado interno, sin retirar dinero |
| Monetización | Free-to-play; cosméticos y quizá algo ligado al breeding |
| Núcleo | Coleccionar y combatir, con algo de historia |
| Combate | Por turnos, más profundo que Pokémon; equipos de 4 |
| Obtención | Inicial + captura + premios de peleas y misiones (santuarios tipo gimnasio) + breeding + mercado |
| Breeding | Límite por criatura; mezcla de atributos; genes dominantes y ocultos; mutaciones impredecibles |
| PvP | Primero asíncrono, después tiempo real |
| Ranking | Puntos por PvP y misiones |
| Mercado | Solo criaturas; subasta o precio fijo |
| Arte | Sencillo, generado por código al principio; dirección visual en `docs/arte/direccion-visual.md` |
| Experiencia | Programas, pero nunca has hecho un videojuego |
| Código | Repositorio en GitHub: `maikelowen/proyecto-genoma` |
| Coste del MVP | Cero: Phaser, arte por código, GitHub Pages; sin servidor hasta la Fase 3 |
| Forma de trabajo | Claude dirige un equipo de agentes; Miguel decide diseño de fondo, alcance y monetización (ver sección 12) |

## 3. Pilar de diseño: genética y breeding

Es lo que diferencia al juego, así que es lo primero que diseñamos y simulamos. Detalle completo: `docs/spec/genetica-v0.2.md` y `config/genetica.v0.2.json` en el repositorio.

### 3.1 El genoma

Cada criatura tiene **4 loci**: Cabeza, Cuerpo, Extremidades y Cola. Cada locus tiene **3 genes**:

- **D (dominante):** el que se expresa. Define el aspecto de esa parte y **uno de los 4 movimientos** de la criatura.
- **R1 y R2 (ocultos):** no se ven en combate, pero se pueden heredar. Al principio el jugador no los conoce; se revelan con un objeto o al criar.

Cada gen pertenece a una **familia** (elemento). Familias base: Llama, Marea, Brote, Roca, Voltio y Sombra. La familia de la criatura es la que más se repite en sus genes D (un gen híbrido cuenta doble); en caso de empate decide la cabeza.

Cada gen lleva **valores numéricos ocultos** (potencia, velocidad, resistencia) y unos **parámetros de forma** que usa el arte procedural.

**Presupuesto fijo con margen de calidad (decisión de Miguel, D-008):** los tres valores de un gen suman 90 ± 5 % (entre 85,5 y 94,5). Esa "calidad" se fija al nacer el gen y se hereda intacta; la deriva y las mutaciones solo reparten puntos, nunca los añaden. Especializarse en velocidad cuesta potencia o resistencia. En combate, la calidad solo actúa como desempate leve (D-018). El margen podrá ampliarse, pero no reducirse una vez abierto el mercado.

El catálogo de partida tiene **72 genes base** (6 familias × 4 loci × 3 variantes). Las criaturas salvajes se generan a partir de él con genes ocultos aleatorios.

### 3.2 Cómo se hereda

Para cada locus, la cría toma 3 genes distintos de entre los 6 de los padres. El D de la cría da más peso a los dominantes de los padres; R1 y R2 usan pesos más planos para que los genes ocultos no se pierdan.

Con los pesos originales (D 37,5 %, R1 9,4 %, R2 3,1 % por padre) el 67 % de las crías mostraba algún rasgo que ningún padre mostraba: el breeding era una lotería. **Pesos adoptados (v0.2):** D 47 %, R1 2,5 %, R2 0,5 % por padre → un 26 % de crías sorprende, dentro del objetivo del 15–30 %.

Resultado buscado: dos padres iguales por fuera pueden tener crías distintas por lo que llevan oculto, pero de forma suficientemente legible como para que criar con intención compense.

### 3.3 La evolución propia (lo impredecible)

Estas cuatro mecánicas hacen que ni el diseñador sepa qué saldrá:

1. **Mutación (2 % por locus, validado con simulación):** aparece un gen nuevo que no tenía ningún padre. Se genera fusionando los genes D de ambos padres: la familia se hereda o se combina, los valores se reparten de nuevo con ruido, la forma se mezcla y el **movimiento se construye por procedimiento** (ver 3.4). Aproximadamente 1 de cada 13 crías trae alguna mutación, y el gen mutado nunca coincide con ninguno de los genes de los padres.
2. **Familias híbridas:** solo aparecen por breeding cuando se cruzan ciertas familias. 7 híbridas: **Vapor** (Llama + Marea), **Magma** (Llama + Roca), **Tormenta** (Voltio + Marea), **Plasma** (Llama + Voltio), **Espora** (Brote + Sombra), **Abismo** (Marea + Sombra) y **Liquen** (Brote + Roca). No se pueden capturar y no hay híbridas de segunda generación. Cruzar una híbrida con una de sus familias de origen da la híbrida el 50 % de las veces. Conseguir la primera criatura híbrida cuesta unas 24 crías desde padres puros.
3. **Deriva genética:** los valores ocultos se desplazan un poco en cada generación y tienden a volver a su punto de partida. Si un jugador cría siempre buscando velocidad, su linaje se especializa poco a poco, con un tope de ±10 sobre el valor base y límites absolutos de 5 a 60.
4. **Genedex de descubrimientos:** la primera vez que aparece un gen mutado en todo el juego queda registrado con el nombre de quien lo descubrió. Dos genes son "el mismo" si coinciden en familia, locus y forma, así que el mismo gen siempre se ve igual.

### 3.4 Movimientos generados con presupuesto

Para que las mutaciones sean sorprendentes pero no rompan el equilibrio, cada movimiento se compone de piezas, como una gramática:

- **Efecto base:** daño, escudo, curación, robar energía…
- **Condición:** "si el objetivo está quemado", "si eres el primero en actuar"…
- **Modificador:** golpea a dos objetivos, ignora la fila delantera, aplica ralentizar…

Cada pieza tiene un coste en puntos y cada movimiento debe caber en un **presupuesto** según su coste de energía (1 a 5). El presupuesto crece más deprisa que el coste (6/15/27/42/60), así que un movimiento caro rinde más por punto de energía: ahorrar compensa. El movimiento de cada gen se genera a partir del propio gen, así que el mismo gen tiene siempre el mismo movimiento. Validado en simulación: ningún movimiento del catálogo sale roto ni inútil. Detalle: `docs/spec/movimientos-v0.2.md`.

### 3.5 Límites y freno de la economía

- Máximo **5 crías por criatura**.
- Coste creciente por cada cría (por ejemplo 100 → 150 → 250 → 400 → 650 monedas) más un material, **Esencia**, que solo se gana jugando PvP y misiones, con tope diario.
- Una cría **no puede criar hasta alcanzar cierto nivel**. Esto evita las granjas en bucle que hundieron la economía de Axie.
- Todo se resuelve **en el servidor** con semilla aleatoria registrada, para evitar trampas.

## 4. Combate

Objetivo: partidas de 3 a 5 minutos, más tácticas que Pokémon y sin dejar de ser legibles en el móvil. Detalle: `docs/spec/combate-v0.2.md`. Validado en simulación (balance v0.2.1): unos 10 turnos por partida, todas las familias entre el 45 y el 55 % de victorias, sin ventaja de lado.

- **Equipo de 4, todos en el campo**, en dos filas: delantera y trasera. Por defecto se ataca a la fila delantera.
- **Turnos simultáneos:** los dos equipos eligen a la vez y después se resuelve por iniciativa. Sirve igual contra la IA, en PvP asíncrono y en tiempo real.
- **Energía compartida por equipo:** empiezas con 3, recuperas 3 por turno y el máximo es 10. Cada criatura tiene además un golpe básico gratuito. Cada turno decides qué criaturas actúan y con qué movimiento. Gastar mucho ahora o guardar para un combo es la decisión central.
- **Orden por iniciativa** (velocidad más un pequeño azar), con efectos que lo alteran. Así un punto de velocidad no decide siempre quién actúa primero.
- **Ventajas entre familias** en dos anillos, uno de familias base y otro de híbridas; cada familia tiene una presa y un depredador.
- **Sinergias:** bonus si varias criaturas de la misma familia actúan en el mismo turno.
- **Estados:** quemadura, ralentizar, escudo, aturdir, marca…
- **Final de partida:** desde el turno 11 el daño crece cada turno; en el 20 hay empate.
- **Motor determinista:** con la misma semilla y las mismas acciones el resultado es idéntico. Esto permite simulaciones, repeticiones y PvP sin trampas.

## 5. Mundo, historia y captura

- Una región pequeña con **8 santuarios** (equivalentes a los gimnasios). Cada uno se centra en una familia, desbloquea zonas y da recompensas para el ranking.
- **Historia ligera:** por qué las criaturas mutan (una energía antigua que se despierta) y un rival recurrente. Pocos textos y bien escritos.
- **Captura:** criaturas básicas en cada zona, con genes ocultos aleatorios, así que dos capturas de la misma especie nunca son idénticas.
- **Inicial:** una de tres, como manda la tradición.
- **Misiones diarias y semanales** que dan Esencia y puntos de temporada.
- **Mapa (Fase 2):** casillas dibujadas por código con el mismo estilo que las criaturas; mapas guardados como datos.

## 6. Economía (versión simple)

Tres recursos, y ninguno se puede retirar:

| Recurso | Cómo se gana | En qué se gasta |
| --- | --- | --- |
| Monedas | Jugando: combates, misiones, ventas en el mercado | Breeding, entrenamiento, comisión del mercado, algunos cosméticos |
| Esencia | PvP y misiones, con tope diario | Breeding |
| Gemas | Pago con dinero real | Cosméticos y comodidad |

**Regla de oro:** todo lo que da poder se consigue jugando. El pago es para aspecto y comodidad.

**Sumideros** (retiran monedas para evitar inflación): coste creciente del breeding, comisión del 5–8 % en el mercado y entrenamiento.

**Sobre cobrar por el breeding:** mi recomendación es no vender breeding con resultado aleatorio por dinero real, porque se parece a una caja de botín (las loot boxes están bajo escrutinio regulatorio en España y la UE). Alternativas más seguras: una incubadora extra (criar dos a la vez), nidos y marcos cosméticos, o ver los genes ocultos sin gastar el objeto. Queda como decisión pendiente.

## 7. PvP y ranking

**Fase asíncrona (primero):**

- Cada jugador configura un **equipo de defensa**.
- Al atacar, te enfrentas a ese equipo controlado por la IA. El servidor valida el combate con el motor determinista.
- Rating tipo **Elo/Glicko** para emparejar.

**Ranking con dos capas:**

- **Liga:** rating de PvP; mide la habilidad.
- **Puntos de temporada:** victorias PvP más misiones y santuarios; premia la constancia. Recompensas al cierre de cada temporada mensual.

**Fase en tiempo real (después):** ambos jugadores eligen acciones a la vez con un temporizador de 30 s por turno. Usa el mismo motor de combate, así que no se rehace nada.

## 8. Mercado

- Solo criaturas, con **precio fijo o subasta** (24/48 h).
- **Comisión** del 5–8 % al vendedor (sumidero de monedas).
- **Antiabuso:** el mercado se desbloquea a partir de cierto nivel de cuenta; las crías recién nacidas no se pueden vender durante 72 h; límite de anuncios activos.
- **Historial de precios** visible por familia y rareza, para que el mercado sea legible.

## 9. Arte generado por código

- Cada criatura se **ensambla por partes** (cabeza, cuerpo, extremidades, cola). Cada gen define la forma de su parte con parámetros, y la familia define la paleta.
- **Dirección visual (Miguel):** criaturas amables con carácter (3 en una escala de 1 muy mona a 10 bestia), cabeza grande, ojos expresivos, formas curvas, contorno grueso oscuro del color principal, 2–3 colores más un acento, sombreado plano y más detalle con la rareza. Detalle: `docs/arte/direccion-visual.md`. Diseños 100 % originales.
- Una mutación genera un aspecto nuevo sin dibujar nada.
- Más adelante, un artista dibuja **juegos de partes** con el mismo sistema modular, y el juego mejora sin tocar la lógica.

## 10. Arquitectura técnica

Todo en **TypeScript**, para aprovechar tu experiencia programando:

- **Núcleo compartido (core):** genética, motor de combate, reglas de economía. Código puro y determinista con aleatoriedad por semilla y tests. Se usa igual en el cliente y en el servidor.
  - **Sin dependencias:** Node 22.18 o superior ejecuta TypeScript directamente y los tests usan el ejecutor nativo de Node. Para probarlo basta con `npm run check`, sin `npm install`.
  - **Determinismo estricto:** generador aleatorio propio con semilla (sfc32), número fijo de tiradas por operación y sin funciones matemáticas que puedan dar resultados distintos en cada navegador (como `Math.log` o `Math.sin`) dentro de las reglas.
  - Los **simuladores** usan exactamente el mismo núcleo que usará el juego: lo que se valida es lo que se programa. Los números de balance viven en ficheros de configuración.
- **Cliente:** Phaser (motor 2D para web), instalable como PWA en el móvil. Más adelante se empaqueta para tiendas (Capacitor) y PC (Tauri o Electron).
- **Backend fases 3–4:** Supabase (Postgres, autenticación, funciones). El servidor manda en breeding, mercado y recompensas.
- **Tiempo real (fase 6):** Colyseus (servidor de salas en Node).
- **Coste inicial:** prácticamente cero con planes gratuitos.

## 11. Hoja de ruta (a 10 h/semana)

| Fase | Semanas | Qué se construye | Hito para pasar a la siguiente |
| --- | --- | --- | --- |
| 0. Reglas y simuladores | 1–3 | Simulador de genética (miles de generaciones), de combate (miles de partidas) y de economía; prototipo visual de criaturas | Las reglas aguantan en números |
| 1. Prototipo de combate | 4–8 | Combate jugable en el navegador contra IA, con criaturas dibujadas por código | 3–5 amigos dicen que pelear es divertido |
| 2. Colección y breeding | 9–14 | Mapa pequeño, captura, 2 santuarios, breeding, guardado local | El bucle completo funciona sin conexión |
| 3. Online y PvP asíncrono | 15–20 | Cuentas, guardado en la nube, PvP asíncrono, ranking y temporadas | Partidas entre jugadores reales |
| 4. Mercado | 21–24 | Compraventa y subastas con antiabuso | Economía estable en una prueba cerrada |
| 5. Contenido y beta | 25–30 | 8 santuarios, historia, balance, beta cerrada | Retención y diversión medidas |
| 6. Lanzamiento | Después | Tiempo real, monetización, arte final, tiendas | — |

Estimación honesta: al ser tu primer juego habrá curva de aprendizaje, así que cuenta con un margen del 30 %.

## 12. Reparto del trabajo

| Tarea | Claude | Tú |
| --- | --- | --- |
| Diseño, reglas, balance | Propone, documenta y simula | Decide y prueba |
| Código (core, cliente, servidor) | Escribe casi todo | Ejecuta, revisa, reporta fallos |
| Arte del prototipo | Lo genera por código | Da dirección visual |
| Arte final y sonido | — | Artista o herramientas externas |
| Pruebas con jugadores | Prepara métricas y encuestas | Recluta y observa |
| Cuentas e infraestructura | Prepara configuración y pasos | Da de alta servicios |
| Legal y pagos | Señala riesgos | Asesoría profesional |

**Cómo trabajamos:**

- Claude actúa como director: planifica, reparte encargos entre agentes especializados (Diseñador de sistemas, Analista de balance, Ingeniero del núcleo, Ingeniero de cliente y Revisor/QA), integra y rinde cuentas.
- Cada rol usa el modelo que más le conviene (D-019): Opus donde hace falta criterio y Sonnet en tareas acotadas, para no agotar la cuota de uso.
- Las reglas importantes se validan con simulación antes de programar la mecánica en el juego, y siempre con semillas distintas de las usadas para elegir los valores.

## 13. Riesgos y decisiones pendientes

**Riesgos principales:**

- **Alcance:** el mayor enemigo. Cada fase tiene un hito y no se avanza sin cumplirlo.
- **Balance de movimientos generados:** mitigado con el presupuesto por piezas y los simuladores. Vigilar los movimientos de genes mutados de Brote y Marea, que salen algo débiles, y la familia Magma, al borde de la banda.
- **Criaderos que convergen:** criar siempre buscando una estadística acaba en criaturas casi iguales. Capturas y mercado deberían reintroducir variedad.
- **Arte procedural poco atractivo:** validado por Miguel con el arte v3.
- **Bots y multicuentas** que inflen el mercado: topes diarios, nivel mínimo y antigüedad de cuenta.
- **Inflación de criaturas:** límite de crías, nivel mínimo para criar y sumideros.
- **Tiempo real:** es la parte técnica más difícil; por eso va al final.

Las decisiones pendientes viven en `docs/proyecto/PREGUNTAS.md`.

## Registro de cambios

- **13 nov 2026:** copiado al repositorio con la tabla de vigencia.
- **10 nov 2026 (tarde):** genética v0.2, combate y movimientos v0.2.1 validados; dirección visual y MVP de coste cero; semanas 1 y 2 de la Fase 0 cerradas; resuelta D-008.
- **10 nov 2026:** resultados de la especificación de genética v0.1; arquitectura sin dependencias, repositorio, forma de trabajo con agentes.
- **9 nov 2026:** versión inicial.
