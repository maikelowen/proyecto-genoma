# ESTADO — Proyecto Genoma

Actualizado: 2026-11-13 (tarde). Fuente de verdad: este fichero (el repositorio).

## Situación
**Combate v0.4 terminado; reglas congeladas** hasta tener feedback de los amigos (D-043, D-045). **Publicado en GitHub Pages** (13 nov). Siguiente: prueba con 3–5 amigos (`docs/proyecto/prueba-amigos.md`).

## Hecho (último commit con el juego: cc7915d; 225 tests)
- Genética v0.2 validada (Fase 0, semanas 1–2).
- Combate jugable en el navegador: escena de batalla, almas flotando, IA Normal y Difícil (IA de búsqueda), bandeja de órdenes sin scroll, pulido visual (revisión de diseño en `docs/revisiones/diseno-escena-v0.1.md`).
- **Combate v0.4:** 3 almas en cuadrícula 2×2 con colocación a ciegas; 4 botones por alma (1 gratis desde el gen de extremidades + 3 de pago); objetivo automático por fila y carril; provocar; descanso de un turno; energía rival oculta; descripciones cortas y glosario.
- Resultado v0.4: profundidad 82 %; 7,3 turnos; gratis 48,9 %; colocaciones 54,6 %; tanque 8 turnos; 13/13 familias en 47,9–53,0 %. Aceptado para la prueba (D-044): bola de nieve (~72 % gana quien hace el primer KO) y variedad justa (1,96 de 3 movimientos de pago por alma).
- Página de Pages: `docs/index.html` → `jugable/combate.html`.

## Siguiente paso
1. Hecho: GitHub Pages activo en `https://maikelowen.github.io/proyecto-genoma/`.
2. **Miguel envía el juego a 3–5 amigos** con el mensaje y las preguntas de `docs/proyecto/prueba-amigos.md` y trae las respuestas.
3. Con su feedback: si notan bola de nieve, primera candidata la mecánica "Brasa" (+energía al caer un alma propia).
4. Después: arte de almas v3 (`docs/arte/direccion-visual.md` §v3; dos iteraciones como máximo, prueba ciega a 48 px); Fase 2 (zonas, captura, resonancia, progresión, habilidades enseñables, guardado local); hoja de ruta con coste en cuota.

## Pendientes menores
- QA R-01 (claves desconocidas en bloques antiguos de config) y R-02 (la IA de referencia no ve el provocar del turno); `placement.ts:61` con un 3 fijo; tests de provocador que cae a mitad de turno.
- Nombre de las almas (Fatuos recomendado) y vocabulario: `docs/proyecto/coherencia-almas.md` si se copia, o el doc del proyecto.

## Forma de trabajar
Ver `CLAUDE.md`. Empezar una conversación nueva en cada sesión para ahorrar cuota.
