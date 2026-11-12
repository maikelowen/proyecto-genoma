# Revisión de diseño — escena de combate v0.1

Fecha: 2026-11-12. Revisor: director de arte / UI invitado (no ha participado en la producción).
Material revisado: `docs/arte/direccion-visual.md`, `docs/arte/referencia-almas.svg` (renderizada), 10 de las 16 capturas `/tmp/escena-*.png` (plan, embestida, fin y turno, en 380 y 1100 px), `docs/jugable/combate.html` abierto con Playwright (pantalla de equipo y de órdenes en 380 y 1100 px) y el código de `client/combat/` (`style.css`, `anim.ts`, `souls.ts`, partes de `main.ts`).
Límite de la revisión: las animaciones se han juzgado leyendo `anim.ts` y viendo fotogramas sueltos, no en movimiento ni en un móvil real. Los contrastes son estimaciones a ojo, no medidos.

## Veredicto

1. **Las almas aguantan; la escena y la interfaz, todavía no.** Los personajes tienen la actitud pedida (cejas en V, ojos de color, dientes con gracia, trazo fino) y no se leen como infantiles. Lo que rodea a las almas sí rebaja el tono: el disco de halo las convierte en "pegatinas en una burbuja", y la interfaz parece un panel de administración (azul genérico, `system-ui`, tarjetas de texto).
2. **El objetivo "que no haya que leer" no se cumple.** El estado se da en pastillas de texto de 9,5 px, la acción en un subtítulo fuera de la escena, y las órdenes en una lista de 20 movimientos con descripción (2 700 px de alto en móvil) que queda debajo del campo: se ordena sin ver la batalla.
3. **Al movimiento le falta peso.** Hay embestida, sacudida y anillo, pero sin anticipación sostenida, sin parada de impacto, sin temblor de escena y con un KO que es un simple fundido a gris. Es correcto, no satisfactorio. Casi todo se arregla con CSS y `anim.ts`, sin artista.

## Top 10 recomendaciones (ordenadas por impacto/esfuerzo)

"Victoria rápida" = 30 min o menos.

### 1. Arreglar los solapes de la información sobre la cabeza — victoria rápida
**Problema.** (a) El rayo de Voltio y las hojas de Brote tapan el nombre y la barra ("Brala", "Kusk", "Dofo" y "Harux" ilegibles en las capturas), porque `.ico` se pinta después de `.info`. (b) Los números flotantes nacen encima del nombre y de las pastillas ("-10 ¡Eficaz!" sobre "Mask"; "Poco eficaz" sobre "Dozen").
**Cambio (`style.css`).**
- `.info{z-index:2;margin-bottom:2px}` (ahora `-8px`), y `.ico{z-index:1}`.
- `.float{top:auto;bottom:calc(100% + 34px)}` para que nazcan por encima del bloque de nombre y barra, no dentro.
- En `anim.ts`, `floater()`: quitar el desplazamiento `el.style.top` y escalonar solo en horizontal (`±26px`) y con 90 ms de retraso entre flotantes de la misma unidad, en vez de apilarlos a la vez.

### 2. Quitar el disco de halo y sustituirlo por un aura pegada a la silueta — victoria rápida
**Problema.** Cada dibujo de `souls.ts` empieza con un `<circle opacity=".12">` de la referencia; sumado a `drop-shadow(0 0 10px var(--fam))` produce una burbuja redonda del color de la familia. Es justo el "todo redondo" que se rechazó, iguala las siluetas (que son la regla clave de la dirección visual) y ensucia el solape entre almas vecinas.
**Cambio (`style.css`).**
- `.unit .ico svg>circle:first-child{display:none}` (solo en combate; el retrato de las tarjetas puede conservarlo).
- `.ico svg{filter:drop-shadow(0 0 2px var(--fam)) drop-shadow(0 0 9px color-mix(in srgb,var(--fam) 55%,transparent))}`: un borde de luz fino más un resplandor corto que sigue la forma.
- Alma que actúa: segundo radio a 18 px y `brightness(1.15)`.

### 3. Que el estado se entienda sin leer: barras con forma por bando e iconos de estado
**Problema.** La barra de vida mide 70×5 px (56 px en móvil), es verde en los dos bandos y pasa a rojo por debajo del 30 %: verde/rojo es el par peor para daltonismo. El bando solo se distingue por el color del nombre (azul claro / rosa claro) y el de la plataforma. Las pastillas ("escudo 87 1t", "debilitar 1t") van a 9,5 px.
**Cambio (`style.css`, `anim.ts` → `paintUnit`/`chipText`).**
- Barra: `width:84px;height:8px` (móvil `64×7`), borde `1px solid #000`, fondo `#05060c`.
- Bando por forma además de color: aliados con barra inclinada a la derecha (`transform:skewX(-18deg)`) y relleno `#5fd4ff`; rivales inclinada al revés (`skewX(18deg)`) y relleno `#ff5d7a`. Así el verde deja de significar nada y el bando se lee sin color.
- Vida baja (<30 %): no cambiar a rojo; mantener el color del bando y añadir parpadeo (`animation:low 700ms steps(2) infinite` entre opacidad 1 y .45) y un borde `#ffd166`.
- Escudo: en lugar de pastilla, segmento `#cfe6ff` superpuesto al final de la barra con rayado (`repeating-linear-gradient(45deg,#fff8 0 2px,transparent 2px 4px)`).
- Estados: glifo de 14×14 px en círculo de 16 px con el número de turnos como subíndice de 9 px; el nombre solo al tocar el alma (`.peek`). Glifos sugeridos (SVG de un solo trazo): quemadura = llama, aturdir = estrella de 4 puntas, ralentizar = flecha abajo, debilitar = espada partida, marca = diana, prisa = flecha doble arriba, regenerar = cruz. Positivos con borde redondo `#6fd08c`, negativos con borde en rombo `#ff8a5c` (otra vez forma además de color).
- Objetivo seleccionado: además del anillo rojo, `border-style:dashed` y giro lento (`animation:spin 6s linear infinite`); el del actor, continuo. Hoy se distinguen solo por color.

### 4. Dar peso al golpe: anticipación, parada de impacto y temblor (`anim.ts`)
**Problema.** La embestida dura 420 ms con `ease-in-out` y un retroceso del 8 % que no se llega a ver; el impacto no detiene nada; todos los golpes pesan igual.
**Cambio.**
- Embestida en tres fases en `attackAnim()`: anticipación 140 ms (retroceso del 14 % de la distancia, `scale(.92,1.08)`, `cubic-bezier(.3,0,.7,1)`), ataque 110 ms (`cubic-bezier(.7,0,1,.6)`, `scale(1.18,.9)` estirado hacia el objetivo), **parada de impacto** 70 ms sin moverse (110 ms si es eficaz o KO), regreso 240 ms con `cubic-bezier(.2,.9,.3,1.2)` (un rebote leve). Devolver 250 ms hasta el impacto.
- Objetivo: retroceso de 10–14 px en la dirección del golpe y aplastamiento `scale(1.12,.88)` durante 90 ms antes de la sacudida actual; destello blanco plano de 60 ms (`brightness(3) saturate(0)`) en vez del `brightness(2.2)` suave.
- Temblor de escena en `field.el`: 4 px durante 160 ms en golpes normales, 8 px durante 260 ms en eficaz y KO (`translate` en 5 fotogramas, decreciente). Desactivado con `prefers-reduced-motion`.
- Chispas de impacto: 6 trazos de 2×10 px del color del movimiento que salen en radial 28 px y se desvanecen en 220 ms; sustituyen al anillo `.ring` en golpes normales. Reservar el anillo para eficaz y KO.
- Daño por tamaño: número a 20 px si es menos del 10 % de la vida máxima, 26 px normal, 34 px si es eficaz o supera el 30 %. Entrada con escala `1.6 → 1` en 120 ms, `cubic-bezier(.2,1.4,.4,1)`.
- Proyectil: añadir estela (3 copias con 30 ms de retraso y opacidad .5/.3/.15) y forma de lágrima (`border-radius:50% 50% 50% 0` orientada con `rotate`).

### 5. KO con personalidad en vez de fundido a gris — victoria rápida si se limita a lo básico
**Problema.** El alma derrotada queda como fantasma gris al 30 % con nombre y barra vacía: ensucia el campo (4 fantasmas en la captura de derrota) y el momento no se celebra.
**Cambio (`anim.ts` caso `ko`, `style.css`).**
- Secuencia: destello blanco 80 ms → parada 120 ms → el alma se encoge en vertical (`scale(1.15,.2)`, 180 ms, `ease-in`) → sube como hilo de humo (`translateY(-46px) scale(.25,1.3)`, opacidad 0, 320 ms). Tiene sentido con el concepto: un alma se apaga.
- Estado final: `.unit.ko .ico{opacity:0}`, `.unit.ko .info{display:none}`, y en el sitio queda solo la sombra más una brasa de 8 px del color de la familia al 40 %. Subir la espera del evento de 250 a 520 ms.
- Fin de combate: los ganadores hacen un salto (`translateY(-18px)` 260 ms, escalonados 80 ms) y el texto "Victoria"/"Derrota" aparece dentro de la escena a 44 px, no en el subtítulo.

### 6. Marcar de quién es el turno y nombrar el movimiento dentro de la escena
**Problema.** El actor solo gana un 20 % de brillo. La frase "Mask (rival) usa golpe básico sobre Tuzen" va a 14 px debajo del campo: obliga a apartar la vista y a leer.
**Cambio (`anim.ts` caso `action`, `style.css`).**
- Actor: sube 8 px, escala 1,08 y recibe debajo un anillo del color de su bando (reutilizar `.selring`) durante todo su grupo de efectos; el resto del campo baja a `brightness(.72)` con transición de 120 ms.
- Rótulo del movimiento dentro de `.stage`, pegado al borde del bando que actúa (izquierda si es tuyo, derecha si es rival): solo el nombre, 18 px, peso 800, cursiva, fondo `#0b0d13e6`, borde lateral de 4 px del color de la familia; entra deslizando 24 px en 140 ms y sale en 120 ms. El subtítulo actual se queda como texto accesible (`aria-live`) y para el modo sin animación.

### 7. Reordenar profundidad, plataformas y espacio muerto (`main.ts` → `SPOT`, `style.css`)
**Problema.** La trasera rival (y: 15 % y 23 %) flota fuera de su plataforma (que empieza en el 21 %); en móvil queda del todo fuera. Los dos bandos tienen el mismo tamaño, así que la perspectiva del suelo no se cree. En escritorio, las esquinas superior izquierda e inferior derecha están vacías; el horizonte es una línea dura al 36–37 %.
**Cambio.**
- Tamaño según profundidad en vez de por fila: `--s:calc(72px + var(--y) * .75px)` en escritorio (rival trasero ≈ 84 px, aliado delantero ≈ 130 px) y `calc(52px + var(--y) * .45px)` en móvil; pasar `--y` como número sin unidad desde `main.ts`.
- `SPOT` orientativo: rival `[[50,40],[72,46],[62,22],[84,27]]`, aliado `[[50,68],[28,62],[38,88],[16,82]]`; plataformas `pf{left:68%;top:38%;width:58%;height:30%}` y `pm{left:32%;top:76%;width:62%;height:32%}`. Comprobar que ninguna caja de nombre se corta por arriba.
- Trasera rival: `filter:saturate(.85) brightness(.9)` para alejarla.
- Horizonte: sustituir el corte `36% → 37%` por un degradado de 8 % de alto y añadir viñeta `box-shadow:inset 0 0 120px #000a` en `.bg`.
- Plataformas: quitar el relleno plano; dejar solo un aro de 2 px del color del bando con degradado radial al 25 % de opacidad y una sombra elíptica bajo cada alma. Hoy son dos manchas opacas que compiten con los personajes.
- Mirada: espejar a los aliados (`.unit.mine .ico svg{scale:-1 1}`) para que las miradas de reojo apunten al rival. Comprobar familia por familia que el espejo no estropea la expresión.

### 8. Panel de órdenes compacto, con el campo siempre a la vista (el cambio más caro y el que más aporta)
**Problema.** Cuatro tarjetas con cinco movimientos y descripción cada una: 2 700 px en móvil, 1 100 px en escritorio, todo por debajo del campo. El botón fijo "Confirmar turno" tapa la cabecera de la primera tarjeta. La energía se muestra tres veces (celdas, "Energía rival: 3" y las etiquetas de las esquinas). La "D" de "Dofo D" no se entiende.
**Cambio (`main.ts`, `style.css`).**
- Una sola bandeja fija bajo el campo (alto máx. 190 px): fila de 4 retratos de 44 px (el activo con borde `--acc`; un punto `#6fd08c` si ya tiene orden) y, debajo, los 5 movimientos del alma activa como botones de 2 columnas con nombre, coste e icono de tipo (daño, escudo, cura, estado). La descripción aparece solo para el movimiento seleccionado, en una línea.
- Elegir alma y objetivo tocando en el campo (ya existe `onPick`); eliminar la fila "Objetivo:" o dejarla solo para teclado.
- En móvil, limitar `.stage` a `clamp(300px,52svh,420px)` para que quepan campo y bandeja sin desplazarse.
- Quitar "Energía rival" de `.turnbar` y dejar las etiquetas de las esquinas; pintar ahí también 10 celdas pequeñas (8 px) en vez del número.
- Movimientos sin energía suficiente: en lugar de `opacity:.4` (texto casi ilegible), texto `#7d859c` y el coste en `#ff8a5c`.

### 9. Tipografía e identidad de la interfaz
**Problema.** Todo va en `system-ui` y el botón principal es un azul `#2d6cdf` de formulario web. Nada dice "anime" ni "diablos". Los números de daño tienen sombra pero no contorno y pierden fuerza sobre almas claras (Voltio, Roca).
**Cambio (`style.css`).**
- Titulares, nombres, números y botones con una pila condensada del sistema, sin cargar fuentes: `font-family:"Bahnschrift","DIN Condensed","Roboto Condensed","Arial Narrow",system-ui,sans-serif;font-stretch:condensed`, peso 800, cursiva (`font-style:italic` o `transform:skewX(-8deg)`), mayúsculas con `letter-spacing:.04em`. El cuerpo de texto sigue en `system-ui`.
- Números flotantes: `-webkit-text-stroke:3px #0b0d13;paint-order:stroke fill` y quitar el `text-shadow` difuso.
- Botones: esquinas en corte en vez de redondeadas (`clip-path:polygon(8px 0,100% 0,calc(100% - 8px) 100%,0 100%)`), que encajan con las cejas en V y los colmillos.
- Color de acento: ver la pregunta 1 al dueño; no cambiarlo sin su visto bueno.
- Unificar radios (hoy conviven 4, 6, 8, 10, 12 y 14 px): 4 px para elementos pequeños, 10 px para paneles.

### 10. Pantalla de equipo: que mande el alma, no la ficha
**Problema.** El retrato mide 48 px dentro de una tarjeta de 300 px de alto llena de texto; es una hoja de datos. Dos almas de la misma familia son idénticas (dibujo estático), y eso se nota aún más en el campo (dos Brotes o dos Rocas clónicos).
**Cambio (`main.ts`, `style.css`).**
- Tarjeta compacta: retrato de 96 px arriba sobre fondo `radial-gradient(var(--fam) 0,transparent 70%)` al 18 %, nombre a 18 px, las tres estadísticas como barras cortas (no números sueltos) y los movimientos reducidos a 4 iconos con coste; la descripción completa al tocar. Rejilla `minmax(160px,1fr)`: caben 2 columnas en móvil.
- Variación barata mientras no llegue el arte por genes: por alma, a partir de su semilla, `scale` entre .88 y 1.12, estirado vertical entre .94 y 1.08 y `hue-rotate` de ±10°. Es un parche, no el sistema de genes; señalarlo como tal en el backlog.
- Seleccionada: además del borde azul, insignia "DEL" / "TRAS" en la esquina (forma, no solo color).

## Lo que está bien y conviene no tocar

- **Las seis almas de la referencia**: siluetas distintas por familia, trazo fino, ojos de color y bocas con carácter. Son lo mejor del juego; no redondearlas ni engrosar el trazo.
- **Fondo oscuro con colores de familia vivos**: la paleta general cumple la dirección visual.
- **Sin cartas en el campo**: almas flotando con sombra que respira y fases desfasadas entre unidades (`--d`); es el cambio que pidió el dueño y funciona.
- **Anillos de selección en el suelo** (actor, objetivo, aliado): buena idea; solo les falta diferenciarse por forma.
- **Embestida cuerpo a cuerpo frente a proyectil a distancia**: la distinción es correcta y se entiende.
- **Controles ×1 / ×2 / Saltar y el respeto a `prefers-reduced-motion`**: mantenerlos en cualquier cambio de animación.
- **Vida numérica solo al tocar**: buen criterio; aplicarlo también a los nombres de estado.
- **Tope de 7 s por turno** en `playTurn`: protege el ritmo. Si las recomendaciones 4 y 5 alargan el turno, subir el tope a 8,5 s antes que recortar la parada de impacto.

## Preguntas para el dueño (chocan o rozan su dirección visual; no las decido yo)

1. **Color de acento de la interfaz.** El azul actual (`#2d6cdf` / `#6db1ff`) coincide con la familia Marea y con el color del bando aliado, y da aire de aplicación de oficina. Opciones: (a) amarillo ácido `#e8ff4a` con texto oscuro, el más "diablillo" y el que no pisa a ninguna familia salvo algo a Voltio; (b) magenta `#ff4fa3`; (c) dejar el azul. Recomiendo (a).
2. **Sombra recuerda a un fantasma morado muy conocido.** Cuerpo violeta rechoncho, picos en la cabeza y sonrisa ancha de media luna: a 80 px la asociación con Gengar es inmediata, aunque el dibujo no lo copie. La referencia está aprobada, así que es decisión suya: ¿se mantiene, o se empuja hacia el "humo irregular con bordes que se deshacen" que describe su propia guía (silueta más alta y deshilachada, sin picos simétricos, sonrisa torcida a un lado)?
3. **Disposición y vocabulario del combate.** Rival arriba a la derecha y propio abajo a la izquierda sobre dos elipses, más los avisos "¡Eficaz!" y "Poco eficaz", son la firma de Pokémon. Con 4 contra 4 se diluye, pero la primera impresión está ahí. Opciones: (a) mantener la diagonal y cambiar solo los textos por un icono de flecha doble arriba/abajo junto al número (además cumple "no leer"); (b) también pasar a un enfrentamiento lateral izquierda/derecha en escritorio. Recomiendo (a) ahora y valorar (b) más adelante.
4. **Suelo de rejilla en perspectiva.** Es un recurso de estética tecnológica/retro y el concepto es folclore (hitodama). ¿Prefiere que el escenario sea neutro como ahora, o que se cambie la rejilla por niebla baja y brasas flotando (hacible con degradados CSS)? No está definido en la guía.
5. **Clones de familia.** La guía pide tamaños y proporciones distintos por alma. El parche de la recomendación 10 (escala y tono) lo disimula pero no lo cumple. ¿Vale como provisional para la prueba de combate, o prefiere ver antes el arte generado desde los genes?

## Orden de trabajo sugerido

- Tanda 1 (≈ 1,5 h, todo victorias rápidas): recomendaciones 1, 2 y la parte básica de la 5.
- Tanda 2 (≈ 4–5 h): 3, 4 y 6. Es donde el combate pasa de correcto a satisfactorio.
- Tanda 3 (≈ 3 h): 7 y 9.
- Tanda 4 (≈ 6–8 h, conviene decidir antes las preguntas 1 y 3): 8 y 10.
