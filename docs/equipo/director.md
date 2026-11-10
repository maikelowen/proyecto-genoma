# Guía del rol: Director / jefe de proyecto

Lecciones y convenciones de dirección. Se lee al empezar cada sesión y se amplía al terminar.

## Al empezar
- Leer ESTADO.md (proyecto) y comprobar `git status` / último commit antes de lanzar nada.
- Si una tarea quedó a medias por cuota, mirar qué hay sin commit en el entorno antes de relanzarla desde cero.

## Encargos
- Cada encargo: objetivo, ficheros de entrada, entregable exacto, criterios de aceptación y límite de respuesta en líneas.
- Agentes nuevos leen primero su guía `docs/equipo/<rol>.md`: es más barato que retomar un agente con un contexto enorme.
- Retomar un agente (en lugar de uno nuevo) solo si el contexto que tiene es imprescindible y reciente.
- Modelo por rol (D-019): Diseñador, Revisor y Núcleo en Opus; Analista en Opus para simuladores nuevos y Sonnet para adaptar o repetir; Cliente en Opus para el arte y Sonnet para la interfaz.
- Ejecutar en paralelo lo independiente (p. ej. Revisor del núcleo mientras el Analista simula).

## Integración
- Verificar `npm run check` y hacer commit + push en cuanto llega cada entrega: lo que no está en GitHub puede perderse si el entorno se reinicia o se acaba la cuota.
- Leer las entregas buscando contradicciones con decisiones de Miguel: una spec propuso corregir el exceso de victorias en el combate en vez de en el margen, contra D-008. Las decisiones de Miguel mandan sobre cualquier spec.
- Un cambio de parámetro en config rompe vectores dorados: regenerarlos y comprobar que solo cambia lo esperado.

## Validación
- Nunca validar con las semillas con las que se eligió un valor; siempre un juego de semillas nuevo.
- Los informes se generan desde los datos (commit + huella de config); nada de cifras escritas a mano.

## Cuota de uso
- Encargos acotados, sin barridos amplios salvo necesidad, y revisiones en lote.
- Guardar ESTADO.md como punto de control a mitad de sesión cuando haya trabajo largo en curso.
- Sesiones repartidas en la semana (límite de 5 h).

## Con Miguel
- Él decide diseño de fondo, alcance, monetización y lo irreversible: pregunta concreta, opciones y recomendación.
- Ajustes numéricos dentro del diseño los decide el director y los registra en DECISIONES.md.
- Avisar pronto y con claridad de lo que va mal o va lento.
