# Combate v0.3 — variantes a estudiar (especificación del director, 2026-11-12)

Origen: feedback de Miguel tras jugar el combate y revisión del consultor externo. Ninguna variante está adoptada: **todas se implementan como opciones de configuración desactivadas por defecto** y se deciden con el estudio (§4). La spec de referencia sigue siendo `combate-v0.2.md` + `movimientos-v0.2.md` con el balance v0.2.1.

## 1. Decisiones ya tomadas (no se estudian)
- **4 movimientos por alma.** No habrá quinto movimiento (la variedad vendrá de poder cambiarlos con habilidades enseñables en la Fase 2).
- **Energía del rival oculta** en la interfaz. La IA puede seguir conociendo la energía del jugador: no cambies su lógica. El coste de los movimientos del rival es consultable y el registro muestra qué usó.

## 2. Variantes (cada una con su opción de config)
V1. **Golpe básico con efecto pequeño por familia** (sigue costando 0). Un efecto menor y temático por familia base (p. ej. Llama: quemadura débil con baja probabilidad o pequeña; Marea: ralentiza; Brote: se cura un poco; Roca: escudo mínimo; Voltio: +iniciativa el turno siguiente; Sombra: marca). Las híbridas usan el de una de sus componentes. Valores pequeños: el básico no debe superar a los movimientos de coste 1.
V2. **Descanso de un turno:** el movimiento recién usado no se puede usar el turno siguiente (el golpe básico no descansa). Con 4 movimientos, cada alma tendrá 3 disponibles la mayoría de los turnos: el estudio debe confirmar que no empobrece el juego.
V3. **Más energía:** probar +1 de energía por turno (de 3 a 4) **combinada** con V1 y/o V2 (con descanso, puede faltar en qué gastar o sobrar).
V4. **Objetivo automático (prueba, no decisión):** el jugador no elige objetivo.
  - Ataques de un solo objetivo: cada alma ataca a la enemiga de **su mismo carril** en la fila delantera; si ha caído, a la otra delantera; después, a la trasera de su carril; después, a la otra trasera. (Carril = posición izquierda/derecha; definir de forma determinista con la posición en el equipo.)
  - Movimientos de aliado: cura → aliado con menos vida (proporcional); escudo → aliado delantero con menos vida (si no hay delanteros, el aliado con menos vida). Si ves motivo para mantener ahí la elección, documéntalo.
  - `alcance` pasa a significar "ataca primero a la fila trasera" (con la misma regla de carriles); `area` no cambia.
  - **Habilidad nueva "provocar"**: pieza de la gramática con su coste en presupuesto; durante un turno, los ataques enemigos de un solo objetivo van a esa alma. Debe aparecer en el catálogo de familias con perfil defensivo (Roca seguro; otras si encaja) sin romper el equilibrio por familias.
  - La formación (quién va delante y en qué carril) se elige antes del combate y pasa a ser decisión importante.
  - Criterio para adoptarla: profundidad (IA con búsqueda vs mejor IA de reglas) **> 60 %** y remontada (§4) dentro de umbral. Si no se cumple, se mantiene la elección de objetivo.

## 3. IA
- La IA de referencia y la de búsqueda deben funcionar con cualquier combinación de variantes (con V4 no eligen objetivo, pero sí movimiento y formación si aplica).
- La IA de búsqueda sigue sin conocer el azar real de la partida.

## 4. Estudio (Analista)
Para la base v0.2.1 y para cada variante sola y en las combinaciones razonables (al menos V1, V2, V1+V2, V1+V2+V3, V4, V4+V1+V2, V4+V1+V2+V3), con semillas nuevas, medir:
- **Profundidad:** IA de búsqueda vs mejor IA de reglas (≥ 400 partidas, IC 95 %). Umbral > 60 %.
- **Remontada:** % de partidas que gana quien hace el **primer KO**, y % que gana quien **lidera en vida total tras el turno 3**. Umbral: ambos **< 65 %**.
- **Variedad:** distribución de uso de los 4 movimientos + básico (entropía por alma y % de turnos con básico); nº medio de movimientos disponibles por turno con V2.
- **Equilibrio de familias:** 13 familias en 45–55 % (como en v0.2.1).
- **Duración:** media 7–12 turnos, p90 ≤ 15, empates ≤ 3 %.
- Recomendación: qué combinación adoptar, con datos; si ninguna mejora a la base, decirlo.

## 5. Para más adelante (no ahora)
- Mutaciones situacionales (D-029 A): aplazadas a la Fase 2.
- Habilidades enseñables por familia, ganadas en santuarios y misiones: sustituyen a uno de los 4 movimientos, usan la gramática y el presupuesto actuales y no se heredan al criar (Fase 2).
- Bandeja de órdenes (interfaz): se diseña después de este estudio.
