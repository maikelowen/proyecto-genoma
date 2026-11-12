# Dirección visual — Proyecto Genoma

Definida por Miguel (dueño del juego). Es la referencia obligatoria para todo el arte, procedural o dibujado. Todo diseño debe ser 100 % original: las referencias marcan el tono, nunca se copian formas, personajes ni paletas concretas.

> **v2 (2026-11-11): cambio de concepto en exploración, preferido por Miguel: de "criaturas" a "almas".** El primer avance procedural (criaturas cuadrúpedas, contorno grueso) fue rechazado por infantil. Tras dos rondas de bocetos, Miguel prefiere almas con estética de anime. Pendiente de confirmar como decisión definitiva al ver el siguiente avance. La versión anterior de esta guía está en el historial de git.

## Público y tono
- Público objetivo: 18–40 años.
- Estética de anime: lo que hace que no resulte infantil es la **actitud**, no la anatomía. Expresiones con carácter: párpados a media asta, miradas de lado, sonrisas chulescas, colmillos, ceño fruncido, aburrimiento, euforia. Nunca grotescas.
- **Actitud de "pequeños diablos" (Miguel, 2026-11-11):** lo oscuro es la **actitud**, no el color (los colores siguen vivos). Siniestras, traviesas, con malas intenciones: cejas en V, miradas de reojo, pupilas rasgadas, sonrisas torcidas. **Dientes con gracia**: colmillos marcados, un diente torcido o separado, sonrisa de media luna, colmillos inferiores… pocos y con personalidad, no una fila de sierra. Pequeños cuernos o detalles diabólicos son bienvenidos.
- **Ojos de color (Miguel, 2026-11-11):** el ojo no es blanco; es de un color luminoso que contrasta con el cuerpo (p. ej. amarillo en Llama, cian en Marea, lila en Sombra), con pupila rasgada oscura. Forma de almendra o triángulo según la actitud.
- **Base aprobada como punto de partida (2026-11-11):** el último boceto del chat ("pequeños diablos": colores vivos, silueta por familia, cejas en V, cuernos pequeños, dientes con personalidad) combinado con los ojos de color del boceto anterior. Algunas cute están bien como variedad (minoría). Nunca grotescas ni gore.
- Trazo **fino y limpio** (no contorno grueso uniforme), del color oscuro de la familia.
- Colores planos con un tono de sombra o de luz; **brillo/aura** alrededor del alma; se presentan sobre **fondo oscuro**.

## Concepto: almas (inspiradas en el hitodama, la llama-alma del folclore japonés)
- Un alma es un núcleo con llama superior, rostro expresivo y apéndices que crecen con la rareza.
- Referencias de tono aportadas por Miguel: almas de un anime conocido (*Soul Eater*) y una ilustración de almas que evolucionan (orbe con llama, luego patas, alas o halo). **Prohibido copiar el diseño de *Soul Eater***: bola con rizo de llama y cara. Nuestro lenguaje propio: forma de cuerpo por familia, núcleo brillante interior y apéndices como evolución.

## Silueta por familia (regla clave)
Cada familia se reconoce por la **forma del cuerpo**, no solo por el color. Ninguna alma comparte silueta base con otra familia.

| Familia | Forma del cuerpo | Llama superior | Paleta |
| --- | --- | --- | --- |
| Llama | Cuerpo de llama: alto, ondulante, asimétrico | Lenguas de fuego dentadas | Rojos y naranjas |
| Marea | Gota u ola, blanda, con remolino | Cresta en ola | Azules y turquesas |
| Brote | Semilla o bulbo con hojas o raíces | Brote con hoja | Verdes y amarillos |
| Roca | Peñasco facetado con grietas y cristales | Esquirlas de cristal | Piedra y turquesa |
| Voltio | Cristal o cápsula angular con chispas | Rayo en zigzag | Amarillos con acento azul |
| Sombra | Humo irregular, bordes que se deshacen | Penacho de humo | Violetas e índigo |

Híbridas: mezcla de forma y paleta de sus dos familias, con más detalle.

## Variación individual (desde los genes)
- **Tamaño y proporciones distintos**: almas pequeñas y compactas, grandes y estiradas, anchas, finas. No todas del mismo tamaño ni forma.
- Correspondencia con el genoma:
  - Cabeza → **rostro**: ojos, párpados, cejas y boca (la actitud).
  - Cuerpo → **núcleo**: forma dentro de la silueta de su familia, brillo, grietas o facetas.
  - Cola → **llama superior**.
  - Extremidades → **apéndices**: brazos de energía, alas, patas, cuernos, halo… Discretos en las comunes; grandes y llamativos en las raras y mutadas.

## Evolución con la rareza
- Comunes: forma de familia limpia, apéndices discretos.
- Raras, híbridas y mutadas: apéndices llamativos (alas, halos, patas), más detalle, brillo más intenso. Siempre con la misma actitud de anime.

## Implicaciones técnicas (director)
- Arte vectorial generado por código a partir de los genes; determinista.
- Validación: avance pequeño (2 almas por familia + mutada + híbrida + fila a 48 px) revisado por Miguel antes del visor completo.
- **Referencia visual aprobada: `docs/arte/referencia-almas.svg`** (boceto a mano del 2026-11-11; marca el tono, no el acabado). El avance anterior de criaturas (`docs/arte/avance-estilo.html`, `client/art/`) queda descartado como estilo; se puede reutilizar su estructura técnica.

## v3 — dirección para las dos iteraciones de arte previstas (Miguel + consultor, 2026-11-12; NO aplicar antes)
A Miguel le gusta más un boceto del consultor que el arte actual, pero aún ve las almas faltas de personalidad.
- **Base:** cuerpo en 2–3 capas de la misma silueta, de oscuro a claro, **sin contorno** y sin degradados. Ojos como **recortes de luz**. **Sin boca por defecto.** Núcleo visible en el pecho con forma según el gen de cuerpo. Flotan con cola o restos debajo (gotas, esquirlas, chispas) y vaivén lento. Fondo oscuro y halo suave del color de la familia.
- **Personalidad:** 6–8 **temperamentos** por gen de cabeza (altivo, aburrido, travieso, feroz, tímido, desquiciado…) que definen forma de ojos, párpado e inclinación del cuerpo. **Asimetría** (un ojo distinto del otro, cuerpo ladeado). El temperamento también se mueve (vaivén nervioso, perezoso o quieto). **Reacciones en combate:** los ojos cambian al atacar, al recibir, con poca vida y al caer. **Rasgo propio por gen de extremidades** (cuernos, halo roto, bracitos, orejas de llama), discreto en comunes y llamativo en raras. Boca solo en algunos temperamentos, como línea de luz.
- **Límites:** pocas piezas bien dibujadas por locus (6–8) con variación de tamaño y proporción, no formas totalmente paramétricas. Diseños originales; no reproducir almas de ningún anime.
- **Prueba:** a 48 px Miguel distingue familia y temperamento, y dos almas de la misma familia no parecen la misma.
