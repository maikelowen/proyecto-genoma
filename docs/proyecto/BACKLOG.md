# BACKLOG — Proyecto Genoma

Planificado por cuota (D-032). Coste de referencia: un encargo típico de agente cuesta 150–400 k tokens. Fases e hitos: `HOJA-DE-RUTA.md`. Lo que espera una decisión de Miguel lleva su pregunta (`PREGUNTAS.md`).

## Ahora — cerrar la Fase 1
| # | Tarea | Quién | Coste | Bloqueada por |
| --- | --- | --- | --- | --- |
| 2 | Prueba con 3–5 amigos (enlace enviado); traer las respuestas tal cual | Miguel | — | — |
| 3 | Diagnóstico del feedback y propuesta de cierre de la Fase 1, **el 18 nov** (D-061) | Director | bajo | 2 |
| 4b | Tras el feedback: reequilibrio único (familias fuera de banda de v0.5 + cambios del feedback; si hay bola de nieve, revisar D-054 o "Brasa") y llevar v0.5 a `main` (D-060) | disenador + nucleo + analista (Sonnet) + revisor + cliente (Sonnet) | 200–400 k | 2, 3 |
| 5 | Fusionar `arte-v3` en `main` (ver nota de conflicto en ESTADO) y comprobar el combate a 380/1100 px | Director / cliente (Sonnet) | bajo | 3 |
| 6 | Aplicar el vocabulario D-063 a los textos del juego | cliente (Sonnet) | 50–100 k | 5 |

## Después — Fase 2, paso 1 (D-062; coste 1,0–1,3 M, tope 1,5 M)
| # | Bloque | Agentes | Coste est. |
| --- | --- | --- | --- |
| 7 | Spec: inicio con el hechicero, captura con farol, colección, resonancia (ecos, límite 5, madurar) y guardado mínimo; datos separados de la presentación | disenador | 150–200 k |
| 8 | Núcleo de lo anterior + guardado local, con revisión | nucleo + revisor | 300–400 k |
| 9 | Pantallas: santuario inicial, encuentro → combate → farol, colección/Codex y resonancia | cliente (Sonnet; Opus si hay arte) | 400–500 k |
| 10 | Prueba del hito: Miguel resuena 20 veces | Miguel | — |

## Fase 2, paso 2 (solo si se cumple el hito)
| # | Bloque | Agentes | Coste est. |
| --- | --- | --- | --- |
| 11 | Mapa de la región + zonas como escenas ilustradas con puntos tocables (camino con encuentros, santuario) | disenador + cliente | 600–900 k |
| 12 | Progresión (D-029 B), santuarios con habilidades enseñables y complementos (D-036, D-049), mutaciones situacionales (D-029 A): ordenar al llegar | varios | por estimar |

## Pendientes menores (hacerlos solo si se toca esa zona)
- QA R-01, R-02, `placement.ts:61`, tests de provocador que cae a mitad de turno.
- Retoques de arte listados en ESTADO.

## Aparcado
Simulador de economía (sustituido por hoja de metas en días de juego, antes de la Fase 3). Mercado (fuera de la beta). Música. Board externo. Movimientos con sabor por parte del cuerpo (D-024, sin fecha).
