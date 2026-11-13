# PREGUNTAS — decisiones pendientes de Miguel

Cola de decisiones que **solo puede tomar Miguel** (diseño de fondo, alcance, monetización, lo irreversible). Claude Code las escribe aquí y sigue con lo que no dependa de ellas; Miguel las trata en un chat del proyecto de Claude y trae la respuesta. Al resolverse, la pregunta se borra de aquí y la respuesta se registra en `DECISIONES.md`.

Formato de cada pregunta: contexto en 2–3 líneas, opciones con su consecuencia, recomendación del director y qué queda bloqueado mientras no se decide.

## Abiertas

### P-00 · Energía por turno: 3 o 4 (antes de la prueba con amigos)
- **Contexto:** Miguel siente que 4 por turno es demasiado. Medido el 13 nov con semillas nuevas (`miguelE3`), mismo simulador v0.4, solo cambia la energía (inicial y por turno):

  | Medida | Energía 4 (vigente) | Energía 3 | Objetivo |
  | --- | --- | --- | --- |
  | Gana quien hace el primer KO | 72,0 % | **69,2 %** | < 65 % |
  | Gana el líder de vida tras el turno 3 | 71,6 % | **63,9 %** ✔ | < 65 % |
  | Turnos por partida | 7,3 | 8,9 | 6–10 |
  | Acciones con el movimiento gratis | **48,7 %** ✔ | 59,0 % ✘ | ≤ 50 % |
  | Movimientos de pago distintos por ánima | 1,95 | 1,72 | ≥ 2 |
  | Familias fuera de banda | 0 | 1 | 0 |
  | Profundidad | 80,3 % | 83,5 % | > 60 % |
- **Opciones:** A) mantener 4; B) bajar a 3 (menos bola de nieve y partidas más largas, pero 6 de cada 10 acciones serían el ataque gratis, lo que Miguel ya criticó como "muchas rondas de golpes básicos"); C) 3 por turno abaratando los movimientos de pago (otra ronda de reglas, ~300 k).
- **Recomendación del director:** A para la prueba con amigos (una pregunta de la encuesta ya mide si la partida se decide pronto); si confirman bola de nieve, comparar B/C con "Brasa".
- **Bloquea:** enviar el juego a los amigos (cambiarlo a mitad de prueba mezcla resultados).


### P-01 · Cierre de la Fase 1 tras la prueba con amigos
- **Contexto:** el combate v0.4 está publicado y en prueba (`prueba-amigos.md`). Riesgo conocido: bola de nieve (~72 % gana quien hace el primer KO, D-044).
- **Opciones:** A) los amigos se divierten → cerrar la Fase 1 y empezar la 2; B) notan bola de nieve → mecánica "Brasa" y cerrar; C) no se divierten → hasta dos iteraciones de reglas (D-026).
- **Recomendación:** decidir con las respuestas en la mano.
- **Bloquea:** fusionar `arte-v3`, empezar la Fase 2.

### P-02 · Alcance de la Fase 2
- **Contexto:** propuesta en `HOJA-DE-RUTA.md` (zonas, captura, colección, resonancia, progresión, 2 santuarios, mutaciones situacionales, guardado local). Estimación: 2–3 M de tokens.
- **Opciones:** A) todo; B) sin mutaciones situacionales ni complementos (se dejan para la Fase 4); C) solo captura + colección + resonancia primero y luego decidir.
- **Recomendación:** C, porque llega antes a algo jugable y la resonancia es el pilar del juego.
- **Bloquea:** empezar la Fase 2.

### P-03 · Vocabulario de las Ánimas
- **Contexto:** con Ánimas (D-046) faltan los demás términos que ve el jugador. Propuesta del director en `vocabulario.md`: cría → **resonancia**, captura → **farol**, Genedex → **Códice**, vida → **intensidad**. El código interno no se renombra.
- **Opciones:** aceptar la propuesta, cambiar términos sueltos o dejar los genéricos (criar, capturar).
- **Recomendación:** aceptar; se puede cambiar más adelante porque solo afecta a textos.
- **Bloquea:** textos de la Fase 2 (no bloquea el código).

### P-04 · Título del juego
- **Contexto:** "Ánimas" no sirve como título (ya hay juegos con "anima" y Aniimo). "Proyecto Genoma" vale hasta la beta.
- **Recomendación:** decidir antes de la beta cerrada (Fase 4) y comprobar marcas antes.
- **Bloquea:** nada todavía.

### P-05 · Qué se cobra alrededor de la cría
- **Contexto:** cobrar por resultados aleatorios se parece a una caja de botín (riesgo regulatorio en España y la UE). La incubadora extra y ver los genes ocultos dan ventaja. Los complementos equipables (D-049) son buen candidato cosmético.
- **Recomendación:** solo cosméticos (complementos, faroles, fondos, marcos). Decidir antes de la Fase 3.
- **Bloquea:** nada todavía.

### P-06 · Pendientes menores del documento de diseño (sin prisa)
Duración de temporadas y recompensas; si se puede liberar o fusionar ánimas para retirarlas de la economía; nombre y temática de la región. Antes de la Fase 3–4.
