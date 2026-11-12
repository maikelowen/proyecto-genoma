# Profundidad del combate v0.1 — Proyecto Genoma

Generado por `npm run sim:profundidad` desde el commit `e651095` (más cambios locales si los hay), configs combate + movimientos + genética v0.2 sin cambios, huella sha256 `6221c8620957…`. Semilla `prof01`, 2 hilos, 287 s.

## Resultado

- **IA con búsqueda contra la mejor IA de reglas: 86,8 % (IC 95 % 84,4 %–89,1 %)** en 800 partidas (694 victorias, 0 empates; empate = ½).
- Criterio del consultor (> 60,0 %): **supera**. Pensar más gana: el combate tiene profundidad que la IA de reglas no aprovecha.
- Control con un rival que la búsqueda no modela (IA de referencia con reserva 3): 86,5 % (IC 95 % 83,2 %–89,8 %) en 400 partidas. Similar: la ventaja no sale solo de conocer la política exacta del rival.
- La búsqueda eligió un plan distinto del de la IA de referencia en el 65,0 % de sus 6750 decisiones. Duración media: 8,44 turnos.
- Tiempo por decisión con las opciones por defecto (Node, un hilo, 92 decisiones): media 47 ms, p95 137 ms, máx. 298 ms. Objetivo: ≤ 400 ms en Node (≈ 800 ms en un navegador normal).

## Método

- **Rival:** la mejor IA de reglas según `docs/informes/combate-v0.2.md` (C4): la de referencia con precio de la energía (κ = 0.9 de la config) y reserva 0, que es `createReferenceAi()` sin opciones (y la del cliente).
- **IA con búsqueda** (`createSearchAi()`, opciones por defecto: 24 simulaciones, horizonte 2, topK 3, 10 candidatos): candidatos = planes de la IA de referencia (κ de la config y κ = 0) + las mejores combinaciones de las 3 mejores acciones por criatura (heurística rápida, Σcoste ≤ energía); el rival se modela con la IA de referencia (κ de la config y κ = 0, alternando); cada candidato se juega 24 veces (turno actual + 1 turno con la IA de referencia en los dos lados) y se puntúa el estado (vida, escudo, criaturas vivas, estados y energía a su precio). Números aleatorios comunes entre candidatos.
- **Honestidad:** la búsqueda no recibe el RNG de la partida; su azar sale de `createRng("search|bando|turno|hash del estado")`. Un test comprueba que cambiar la semilla de la partida no cambia su decisión en el mismo estado.
- **Equipos espejo:** el mismo equipo de 4 almas salvajes en los dos lados; cada equipo se juega dos veces con la misma semilla de partida, con la búsqueda en A y en B. IC 95 % normal sobre resultados 1 / ½ / 0.
- **Semillas nuevas:** `prof01|…`. La IA se ajustó (horizonte, simulaciones, peso de estar viva) con `tune1`, `tune2`, que la CLI no deja usar aquí.

## Limitaciones

- En la medida principal el modelo del rival coincide con el rival real (la IA de referencia): es el mejor caso para la búsqueda. El control fuera del modelo acota cuánto depende de eso.
- La búsqueda solo explora el turno actual; los turnos siguientes los juega la IA de referencia. Una IA más fuerte daría una cota más alta de la profundidad, no más baja.
- Mide la profundidad contra IA, no contra personas: un humano experto no tiene por qué jugar como la IA de referencia.
