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

## En curso (13 nov, noche)
- **Arte v3 terminado (2 iteraciones)** en la rama `arte-v3` (commit 848fa3b; 225 tests; coste 218 k + 218 k). Un gen = una zona (cabeza: cara y boca; cuerpo: silueta y núcleo; extremidades: rasgo; cola: lo de debajo); 18 siluetas; 8 bocas (6 de 18 genes de cabeza sin boca); Llama redibujada; asimetría solo en desquiciado; 4 complementos de muestra fuera de los genes. Galería `docs/arte/galeria-v3.html` con prueba de herencia (7 tríos).
- **Pendiente de Miguel:** veredicto de la galería y decidir si la silueta sale del gen de cuerpo (ahora; ~30 % de salvajes llevan silueta de otra familia con su color) o de la familia del ánima.
- **No fusionar en `main` hasta que contesten los amigos.** Flojo conocido: mueca altiva y boca cosida justas a 48 px; ojos de Sombra con poco contraste; grietas/fuego de Llama raros sobre cuerpos de otro color; galería de 955 KB; quizá la cara deba verse más grande en combate.
- Nombre: **Ánimas** (D-046). Falta aplicarlo a los textos del juego.

## Siguiente paso
1. Hecho: GitHub Pages activo en `https://maikelowen.github.io/proyecto-genoma/`.
2. **Miguel envía el juego a 3–5 amigos** con el mensaje y las preguntas de `docs/proyecto/prueba-amigos.md` y trae las respuestas.
3. Con su feedback: si notan bola de nieve, primera candidata la mecánica "Brasa" (+energía al caer un alma propia).
4. Después: arte de almas v3 (`docs/arte/direccion-visual.md` §v3; dos iteraciones como máximo, prueba ciega a 48 px); Fase 2 (zonas, captura, resonancia, progresión, habilidades enseñables, guardado local); hoja de ruta con coste en cuota.

## Pendientes menores
- QA R-01 (claves desconocidas en bloques antiguos de config) y R-02 (la IA de referencia no ve el provocar del turno); `placement.ts:61` con un 3 fijo; tests de provocador que cae a mitad de turno.
- Vocabulario de las Ánimas: revisar `coherencia-almas.md` (doc del proyecto de Claude) con el nombre nuevo.

## Forma de trabajar
Ver `CLAUDE.md`. Empezar una conversación nueva en cada sesión para ahorrar cuota.
