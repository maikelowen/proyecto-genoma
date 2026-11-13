# ESTADO — Proyecto Genoma

Actualizado: 2026-11-13 (noche). Fuente de verdad: este fichero (el repositorio).

## Situación
- **Fase 1 (prototipo de combate) en prueba.** Combate v0.4 publicado en https://maikelowen.github.io/proyecto-genoma/ y con **reglas congeladas** hasta el feedback de los amigos (D-045).
- **Arte v3 terminado y congelado** en la rama `arte-v3` (D-050); se fusiona tras la prueba.
- **Desde hoy se desarrolla en Claude Code** (D-051); los chats del proyecto de Claude son para decisiones.

## Hecho
- **Fase 0:** genética v0.2 validada; gramática de movimientos, motor de combate, IA normal y de búsqueda, simuladores.
- **Combate v0.4** (último commit de reglas: cc7915d): 3 ánimas en cuadrícula 2×2 con colocación a ciegas; 4 botones por ánima (1 gratis + 3 de pago); objetivo automático por fila y carril; provocar; descanso; energía rival oculta. Medido: profundidad 82 %, 7,3 turnos, gratis 48,9 %, 13/13 familias en banda. Aceptado con bola de nieve (~72 % gana el primer KO, D-044).
- **13 nov:**
  - GitHub Pages activo; mensaje y preguntas para la prueba (`prueba-amigos.md`).
  - Nombre **Ánimas** (D-046).
  - Arte v3 en dos iteraciones (commit 848fa3b en `arte-v3`; 436 k): un gen = una zona, 18 siluetas, 8 bocas, Llama redibujada, 4 complementos de muestra. Galería `docs/arte/galeria-v3.html` (en la rama).
  - **Arreglo:** la escena dibujaba al rival girado 180°, así que el objetivo automático por carril parecía atacar al ánima del lado opuesto. Ahora se dibuja en espejo (d2ebf98, en `main` y publicado).
  - Medida con **energía 3 por turno** (semillas nuevas `miguelE3`, sin adoptar): menos bola de nieve pero más golpes gratis; ver P-00.
  - Preparación para Claude Code: `CLAUDE.md`, subagentes en `.claude/agents/`, comandos `/empezar`, `/cerrar`, `/preguntas`, `/decision`; `plan-diseno.md`, `HOJA-DE-RUTA.md`, `PREGUNTAS.md`, `vocabulario.md` y `DECISIONES.md` completo en el repositorio.

## Siguiente paso
1. **Miguel decide P-00** (energía 3 o 4) antes de mandar el juego a los amigos.
2. **Miguel envía el juego a 3–5 amigos** (`prueba-amigos.md`) y trae las respuestas.
3. Con el feedback (P-01): cerrar la Fase 1 o iterar reglas; fusionar `arte-v3` (al fusionar, hay conflicto esperado en `client/combat/main.ts` y en `docs/jugable/combate.html`: conservar el SPOT en espejo de `main` y regenerar con `npm run build:combate`); aplicar el nombre Ánimas a los textos.
4. Fase 2 según `HOJA-DE-RUTA.md`, cuando Miguel confirme su alcance (P-02).

## Pendientes menores
- QA R-01 (claves desconocidas en bloques antiguos de config) y R-02 (la IA de referencia no ve el provocar del turno); `placement.ts:61` con un 3 fijo; tests de provocador que cae a mitad de turno.
- Arte (si se retoma): mueca altiva y boca cosida justas a 48 px; ojos de Sombra con poco contraste; grietas de Llama raras sobre cuerpos de otro color; cara quizá pequeña en combate; galería de 955 KB.
