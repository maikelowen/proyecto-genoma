# HOJA DE RUTA — Proyecto Genoma

Actualizada: 2026-11-13. Sustituye a la sección 11 de `plan-diseno.md`. Se planifica **por cuota de uso** (D-032): cada ciclo termina en algo que Miguel puede probar. Los costes son estimaciones del director en tokens de agentes (un encargo típico: 150–400 k); se corrigen con el coste real al cerrar cada fase.

## Fases

| Fase | Estado | Qué se construye | Hito para pasar | Coste est. |
| --- | --- | --- | --- | --- |
| 0. Reglas y simuladores | **Hecha** | Genética v0.2, gramática de movimientos, motor de combate, IA, simuladores | Las reglas aguantan en números | (gastado ~4,6 M) |
| 1. Prototipo de combate | **En prueba** | Combate v0.4 jugable en el navegador contra la IA; arte v3 en rama | **3–5 amigos dicen que pelear es divertido** | 0,3–0,8 M para cerrarla |
| 2. Colección y resonancia | Siguiente | Ver abajo | El bucle completo funciona sin conexión y Miguel quiere seguir jugando | 2–3 M |
| 3. Online y PvP asíncrono | — | Cuentas (Supabase), guardado en la nube, PvP asíncrono resuelto en servidor (D-030), ranking y temporadas; hoja de metas en días de juego antes de empezar (D-032) | Partidas entre jugadores reales | 2–3 M |
| 4. Contenido y beta cerrada | — | 8 santuarios, historia ligera, misiones, balance, beta cerrada. **Sin mercado** (D-028) | Retención y diversión medidas | 2–3 M |
| 5. Lanzamiento | Después | Mercado, tiempo real (Colyseus), monetización cosmética, arte final, tiendas | — | — |

## Fase 1 — lo que falta para cerrarla
1. Prueba con 3–5 amigos (`prueba-amigos.md`) y diagnóstico con sus respuestas.
2. Si notan bola de nieve: mecánica "Brasa" (spec + núcleo + medida). Si el combate no gusta: hasta dos iteraciones de reglas y luego replantear el modelo (D-026).
3. Fusionar `arte-v3` en `main` y aplicar el nombre Ánimas a los textos.
4. **Hito:** Miguel declara la Fase 1 cerrada (es una decisión suya).

## Fase 2 — alcance propuesto (a confirmar por Miguel antes de empezar)
Objetivo: el bucle "capturar → combatir → resonar (criar) → ver qué sale" funcionando sin servidor, con guardado local.

| Bloque | Contenido | Decisiones de base |
| --- | --- | --- |
| Zonas | Lista de 2–3 zonas con ánimas salvajes por familia (sin mapa de casillas) | D-028 |
| Captura | Encuentro → combate → captura; dos capturas nunca son idénticas | — |
| Colección | Lista de ánimas con sus genes visibles (D) y ocultos (descubiertos) | D-048 (un gen = una zona) |
| Resonancia (cría) | Elegir dos ánimas, ver la cría, límite de 5 por ánima; prueba de herencia legible | D-008, D-010, D-011 |
| Progresión | Nivel que desbloquea un movimiento o variante, no estadísticas | D-029 B |
| Santuarios | 2 santuarios con combate especial; dan habilidades enseñables por familia y complementos | D-036, D-049 |
| Mutaciones situacionales | Movimientos de mutación que brillan en ciertas situaciones | D-029 A |
| Guardado | `localStorage` con exportar/importar | D-016 |

Orden recomendado: colección + captura → resonancia → progresión → santuarios → mutaciones situacionales. Cada bloque termina en algo jugable.

## Fuera de alcance hasta nuevo aviso
Mercado (D-028), economía con monedas y gemas, música, tiempo real, movimientos con sabor por parte del cuerpo (D-024, sin fecha), board externo (D-009).
