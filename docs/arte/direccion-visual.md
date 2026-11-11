# Dirección visual — Proyecto Genoma

Definida por Miguel (dueño del juego). Es la referencia obligatoria para todo el arte, procedural o dibujado. Todo diseño debe ser 100 % original: las referencias marcan el tono, nunca se copian formas, personajes ni paletas concretas.

> **v2 (2026-11-11): cambio de concepto en exploración, preferido por Miguel: de "criaturas" a "almas".** El primer avance procedural (criaturas cuadrúpedas, contorno grueso) fue rechazado por infantil. Tras dos rondas de bocetos, Miguel prefiere almas con estética de anime. Pendiente de confirmar como decisión definitiva al ver el siguiente avance. La versión anterior de esta guía está en el historial de git.

## Público y tono
- Público objetivo: 18–40 años.
- Estética de anime: lo que hace que no resulte infantil es la **actitud**, no la anatomía. Expresiones con carácter: párpados a media asta, miradas de lado, sonrisas chulescas, colmillos, ceño fruncido, aburrimiento, euforia. Nunca grotescas.
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
- Bocetos de referencia aprobados como dirección: los del chat del 2026-11-11 (almas sobre fondo oscuro), con la corrección de formas de cuerpo por familia.
