# HOJA DE RUTA — Proyecto Genoma

Actualizada: 2026-11-14. Sustituye a la sección 11 de `plan-diseno.md`. Se planifica **por cuota de uso** (D-032): cada ciclo termina en algo que Miguel puede probar. Los costes son estimaciones del director en tokens de agentes (un encargo típico: 150–400 k); se corrigen con el coste real al cerrar cada fase.

## Fases

| Fase | Estado | Qué se construye | Hito para pasar | Coste est. |
| --- | --- | --- | --- | --- |
| 0. Reglas y simuladores | **Hecha** | Genética v0.2, gramática de movimientos, motor de combate, IA, simuladores | Las reglas aguantan en números | (gastado ~4,6 M) |
| 1. Prototipo de combate | **Cerrada** (D-064) | Combate v0.4 jugable; v0.5 adoptado en rama (D-060); arte v3 en rama | **3–5 amigos dicen que pelear es divertido** | 0,3–0,8 M para cerrarla |
| 2. Colección y resonancia | Siguiente, en dos pasos (D-062) | Ver abajo | Paso 1: hito D-066; paso 2: el mundo se recorre a gusto | Paso 1: 1,3–1,6 M (tope 1,8 M); paso 2: 1–1,5 M |
| 3. Online y PvP asíncrono | — | Cuentas (Supabase), guardado en la nube, PvP asíncrono resuelto en servidor (D-030), ranking y temporadas; hoja de metas en días de juego antes de empezar (D-032) | Partidas entre jugadores reales | 2–3 M |
| 4. Contenido y beta cerrada | — | 8 santuarios, historia ligera, misiones, balance, beta cerrada. **Sin mercado** (D-028) | Retención y diversión medidas | 2–3 M |
| 5. Lanzamiento | Después | Mercado, tiempo real (Colyseus), monetización cosmética, arte final, tiendas | — | — |

## Fase 1 — lo que falta para cerrarla
1. Prueba con 3–5 amigos (`prueba-amigos.md`) y diagnóstico con sus respuestas.
2. Si notan bola de nieve: mecánica "Brasa" (spec + núcleo + medida). Si el combate no gusta: hasta dos iteraciones de reglas y luego replantear el modelo (D-026).
3. Fusionar `arte-v3` en `main` y aplicar el nombre Ánimas a los textos.
4. **Hito:** Miguel declara la Fase 1 cerrada (es una decisión suya).

## Fase 2 — en dos pasos (D-062)
Objetivo: el bucle "atrapar → combatir → resonar → ver qué eco sale" sin servidor, con guardado local. Vocabulario: D-063.

### Paso 1 — resonancia jugable cuanto antes
| Bloque | Contenido | Decisiones de base |
| --- | --- | --- |
| Inicio | Un hechicero en un santuario te da tu primer ánima | D-062 |
| Captura mínima | Ganar a un ánima salvaje → gastar un farol para intentar atraparla; dos capturas nunca son idénticas | D-062 |
| Colección | Lista de ánimas con genes visibles (D) y ocultos descubiertos | D-048 (un gen = una zona) |
| Resonancia | Elegir dos ánimas, ver el eco, límite de 5 por ánima; herencia legible | D-008, D-010, D-011 |
| Subir de nivel | Experiencia al combatir; cada nivel clave desbloquea un movimiento o variante, nunca estadísticas | D-029 B, D-065 |
| Guardado mínimo | `localStorage` (exportar/importar si cabe) | D-016 |

**Hito (D-066):** Miguel juega 3 sesiones, resuena 20 veces, sube un ánima a nivel alto y quiere seguir; y 2 amigos juegan al menos 30 min sin que se lo pida. **Coste estimado 1,3–1,6 M, tope 1,8 M** (spec ~250 k; núcleo + revisión ~500 k; cliente ~500–600 k; fusiones y textos ~100 k). Si se acerca al tope, se recorta antes el exportar/importar y el pulido visual que la resonancia.

### Paso 2 — el mundo (solo si se cumple el hito)
- **Mapa de la región** para viajar entre zonas; cada zona, una **escena ilustrada con puntos tocables**: camino con encuentros según la zona y santuario. Tienda y aldeanos esperan a que haya moneda y misiones.
- Datos de zonas, encuentros y personajes **separados de la presentación**, para pasar a un mapa caminable sin rehacer contenido. El mapa caminable es una decisión posterior, con el bucle validado (revisa D-028).
- Pendiente de ordenar dentro del paso 2 o después: santuarios con habilidades enseñables y complementos (D-036, D-049), mutaciones situacionales (D-029 A).

## Fuera de alcance hasta nuevo aviso
Mercado (D-028), economía con monedas y gemas, música, tiempo real, movimientos con sabor por parte del cuerpo (D-024, sin fecha), board externo (D-009).
