# DECISIONES — Proyecto Genoma (resumen vigente)

Versión condensada; el detalle con motivos y alternativas está en el proyecto de Claude ("DECISIONES.md") hasta el 2026-11-13. Las decisiones nuevas se añaden aquí con fecha, motivo y alternativas.

| ID | Decisión vigente | Quién |
| --- | --- | --- |
| D-001/005 | TypeScript nativo en Node ≥ 22.18, sin dependencias; simuladores sobre el mismo núcleo que el juego | Director |
| D-002/006 | RNG propio con semilla (sfc32), tiradas fijas, sin `Math.random` ni funciones trascendentes en reglas | Director |
| D-003 | Todos los números en configuración | Director |
| D-007 | La mutación nunca repite un gen de los padres | Director |
| D-008 | Presupuesto fijo de estadísticas por gen con margen de calidad ±5 %; la calidad no puede dar > 55–60 % de victorias; el margen podrá ampliarse pero no reducirse con el mercado abierto | **Miguel** |
| D-009 | Estado en ESTADO/BACKLOG; sin board externo | Miguel |
| D-010/011 | Herencia v0.2 (pesos D 0,47/0,025/0,005; mutación 2 %; σ forma 0,25); gen híbrido cuenta doble para la familia; híbrida × origen 50 % | Director |
| D-012 | La cría selectiva puede seleccionar calidad dentro del margen | Director |
| D-016 | MVP con coste cero: HTML, arte por código, GitHub Pages; sin servidor hasta la Fase 3 | Miguel |
| D-017 | Turnos de elección simultánea, iniciativa con azar, estadísticas como cuotas, dos anillos de ventaja de familia, daño creciente desde el turno 11, empate en el 20 | Director |
| D-018 | La calidad pesa como desempate leve (β = 0,04) | **Miguel** |
| D-019/038 | Modelo por rol (ver CLAUDE.md); Fable 5.2 usado en el ciclo de variantes | Director / Miguel |
| D-021 | Guardar energía debe compensar (presupuesto creciente con el coste) | Director |
| D-024 | Movimientos con sabor por parte del cuerpo (más adelante); en v0.4 extremidades da el gratis | **Miguel** |
| D-025/037 | Concepto de **almas** (anime, 18–40 años, "pequeños diablos", ojos de color, silueta por familia); arte v3 para las dos iteraciones previstas | **Miguel** |
| D-026 | Primero algo jugable; si el combate no gusta, hasta dos iteraciones de reglas y luego replantear | Director |
| D-027 | Deriva genética desactivada | **Miguel** |
| D-028 | Mapa → lista de zonas; mercado fuera de la beta | **Miguel** |
| D-029/036 | Crías que destacan: mutaciones situacionales (Fase 2) y progresión que desbloquea movimientos, no estadísticas; habilidades enseñables por familia (Fase 2, no se heredan) | **Miguel** |
| D-030 | PvP asíncrono: el servidor resuelve turno a turno y nunca entrega la semilla | Director |
| D-031 | Profundidad > 60 % (IA de búsqueda vs reglas) antes de pulir balance | Director |
| D-032 | Trabajo por cuota: cada ciclo termina en algo jugable; Revisor solo en reglas y núcleo | Director |
| D-033 | 4 botones por alma: 1 gratis + 3 de pago | **Miguel** |
| D-034 | Energía del rival oculta | **Miguel** |
| D-039/040 | Descanso de un turno activado; golpe básico con efecto y energía extra descartados | **Miguel** |
| D-042 | Provocar funciona desde cualquier fila | **Miguel** |
| D-043 | Combate v0.4: 3 almas en 2×2, colocación a ciegas, gratis desde extremidades, objetivo automático por fila y carril, criterios de adopción; última ronda antes de publicar | **Miguel** + consultor |
| D-044 | Bola de nieve aceptada para la prueba (umbral provisional 75 % con 3 almas); candidata "Brasa" si los amigos la notan | **Miguel** |
| D-045 | Balance v0.4 adoptado (base + 4 sales de familias); **reglas congeladas** hasta el feedback de los amigos | Director / Miguel |
| D-046 | Las almas se llaman **Ánimas** (Fatuos descartado). Vale como nombre de las criaturas; el título del juego necesitará un nombre propio más distintivo ("anima" ya se usa en el género) | **Miguel** |
| D-047 | Arte v3, 1.ª iteración, en la rama `arte-v3` (no se publica hasta que contesten los amigos); queda una iteración | Director |
| D-048 | Arte v3, 2.ª iteración: **bocas en mezcla** (unas ánimas con boca y otras sin; las bocas son pieza clave de creatividad: colmillos, sierra, lengua…), asimetría de ojos fuerte solo en desquiciado, Llama redibujada, genes legibles (un gen = una zona; prueba padres/cría), ojos de Roca en turquesa. Sustituye a "sin boca por defecto" | **Miguel** |
| D-049 | Complementos (sombrero, gafas, colgante, monopatín…): objetos equipables que se ganan, en la Fase 2; no salen de los genes. En la 2.ª iteración solo 3–4 de muestra | **Miguel** |
