# BACKLOG — Proyecto Genoma

Planificado por cuota (D-032). Coste de referencia: un encargo típico de agente cuesta 150–400 k tokens. Fases e hitos: `HOJA-DE-RUTA.md`. Lo que espera una decisión de Miguel lleva su pregunta (`PREGUNTAS.md`).

## Ahora — cerrar la Fase 1
| # | Tarea | Quién | Coste | Bloqueada por |
| --- | --- | --- | --- | --- |
| 4b | Reequilibrio único de familias de v0.5 (sales, como D-045) y fusionar `combate-v0.5` en `main` (D-064) | analista (Sonnet) + revisor + director | 150–250 k | — |
| 5 | Fusionar `arte-v3` en `main` (ver nota de conflicto en ESTADO) y comprobar el combate a 380/1100 px | Director / cliente (Sonnet) | bajo | — |
| 6 | Aplicar el vocabulario D-063 a los textos del juego | cliente (Sonnet) | 50–100 k | 5 |

## Después — Fase 2, paso 1 (D-062, D-065, D-066; coste 1,3–1,6 M, tope 1,8 M)
| # | Bloque | Agentes | Coste est. |
| --- | --- | --- | --- |
| 7 | Spec: inicio con el hechicero, captura con farol, colección, resonancia (ecos, límite 5, madurar), **experiencia y niveles que desbloquean movimientos** y guardado mínimo; datos separados de la presentación | disenador | 200–250 k |
| 8 | Núcleo de lo anterior + guardado local, con revisión | nucleo + revisor | 400–500 k |
| 9 | Pantallas: santuario inicial, encuentro → combate → farol, colección/Codex, resonancia y subida de nivel | cliente (Sonnet; Opus si hay arte) | 500–600 k |
| 10 | Prueba del hito D-066 (Miguel 3 sesiones; 2 amigos 30 min) | Miguel | — |

## Fase 2, paso 2 (solo si se cumple el hito)
| # | Bloque | Agentes | Coste est. |
| --- | --- | --- | --- |
| 11 | Mapa de la región + zonas como escenas ilustradas con puntos tocables (camino con encuentros, santuario) | disenador + cliente | 600–900 k |
| 12 | Santuarios con habilidades enseñables y complementos (D-036, D-049), mutaciones situacionales (D-029 A): ordenar al llegar | varios | por estimar |

## Pendientes menores (hacerlos solo si se toca esa zona)
- QA R-01, R-02, `placement.ts:61`, tests de provocador que cae a mitad de turno.
- Retoques de arte listados en ESTADO.

## Aparcado
Simulador de economía (sustituido por hoja de metas en días de juego, antes de la Fase 3). Mercado (fuera de la beta). Música. Board externo. Movimientos con sabor por parte del cuerpo (D-024, sin fecha).
