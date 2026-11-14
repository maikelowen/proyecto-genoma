# ESTADO — Proyecto Genoma

Actualizado: 2026-11-14. Fuente de verdad: este fichero (el repositorio).

## Situación
- **Fase 1 (prototipo de combate) en prueba.** Combate v0.4 publicado en https://maikelowen.github.io/proyecto-genoma/ y con **reglas congeladas** hasta el feedback de los amigos (D-045).
- **Arte v3 terminado y congelado** en la rama `arte-v3` (D-050); se fusiona tras la prueba.
- **Desarrollo en Claude Code** (D-051); los chats del proyecto de Claude son para decisiones.
- **Combate v0.5 terminado en la rama `combate-v0.5`** y en prueba solo por Miguel: https://maikelowen.github.io/proyecto-genoma/jugable/combate-v05.html. Ninguna de sus reglas mejora la bola de nieve con claridad; **pendiente P-08**.

## Hecho
- **Fase 0:** genética v0.2 validada; gramática de movimientos, motor de combate, IA normal y de búsqueda, simuladores.
- **Combate v0.4** (último commit de reglas: cc7915d): 3 ánimas en cuadrícula 2×2 con colocación a ciegas; 4 botones por ánima (1 gratis + 3 de pago); objetivo automático por fila y carril; provocar; descanso; energía rival oculta. Medido: profundidad 82 %, 7,3 turnos, gratis 48,9 %, 13/13 familias en banda. Aceptado con bola de nieve (~72 % gana el primer KO, D-044).
- **13 nov:**
  - GitHub Pages activo; mensaje y preguntas para la prueba (`prueba-amigos.md`).
  - Nombre **Ánimas** (D-046).
  - Arte v3 en dos iteraciones (commit 848fa3b en `arte-v3`; 436 k): un gen = una zona, 18 siluetas, 8 bocas, Llama redibujada, 4 complementos de muestra. Galería `docs/arte/galeria-v3.html` (en la rama).
  - **Arreglo:** la escena dibujaba al rival girado 180°, así que el objetivo automático por carril parecía atacar al ánima del lado opuesto. Ahora se dibuja en espejo (d2ebf98, en `main` y publicado).
  - **Energía 3 por turno** (D-052), aplicada antes de que nadie jugara: menos bola de nieve, pero el gratis sube al 59 % (criterio ≤ 50 % aceptado para la prueba). Vector dorado regenerado (con energía 4 se reproduce el anterior).
  - Preparación para Claude Code: `CLAUDE.md`, subagentes en `.claude/agents/`, comandos `/empezar`, `/cerrar`, `/preguntas`, `/decision`; `plan-diseno.md`, `HOJA-DE-RUTA.md`, `PREGUNTAS.md`, `vocabulario.md` y `DECISIONES.md` completo en el repositorio.
- **13–14 nov — ciclo v0.5 (D-053 a D-058), rama `combate-v0.5`:**
  - Spec `combate-v0.5.md` + `config/combate.v0.5.json`, cada mecánica activable por separado (91e776f).
  - Núcleo, IA y 24 tests; con las dos claves apagadas es exactamente v0.4 (de939ea).
  - QA: aceptar con cambios, sin bloqueantes (77eb4cf, `docs/revisiones/qa-combate-v0.5.md`). Aplicado I-01 (`cfg` obligatorio) y corregido el rango de energía perdida (I-02). Quedan menores M-01–M-05.
  - Simulación de 4 configs con semillas `v05|`, 12 000 partidas cada una (abf3626, `docs/informes/combate-v0.5.md`): primer KO → gana 69,7 % base; **solo D-053 68,5 % (−1,2 pp, neutra)**; **solo D-054 71,5 % (+1,8 pp, empeora)**; **ambas 70,3 % (+0,6 pp, neutra)**. Turnos 8,6–8,9; profundidad 86 %; familias fuera de banda 0 / 2 / 3 (base / D-054 / ambas). Energía perdida ≈ 4,8 por partida (≈ 3,1 útil). Aturdir a la última: 4,3 % de partidas; el plan B no cambia la bola de nieve (+0,1 pp) → se mantiene A (D-058).
  - Interfaz de varios pagos numerados y aviso de energía perdida; página `docs/jugable/combate-v05.html` (d46d99a; publicada sola en `main`, 61aa8c4). `combate.html` sin tocar.
  - Coste real: agentes ≈ 730 k (disenador 117 k, nucleo 226 k, revisor 128 k, analista Sonnet 143 k, cliente Sonnet 115 k) + director ≈ 100 k. Por encima de los ~650 k previstos (el corte por límite obligó a reanudar tres agentes).

## Siguiente paso
1. Hecho: enlace enviado a los amigos (13 nov, noche). **Miguel trae las respuestas** tal cual.
2. **Miguel juega `combate-v05.html`** y contesta P-08 (qué hacer con D-053 y D-054). Nada de la rama llega a `main` hasta el feedback de los amigos (D-055).
3. Mirar en el feedback: bola de nieve (P-01) y si sobran rondas de ataque gratis (efecto de D-052).
4. Con el feedback (P-01): cerrar la Fase 1 o iterar reglas; fusionar `arte-v3` (al fusionar, hay conflicto esperado en `client/combat/main.ts` y en `docs/jugable/combate.html`: conservar el SPOT en espejo de `main` y regenerar con `npm run build:combate`); aplicar el nombre Ánimas a los textos.
5. Fase 2 según `HOJA-DE-RUTA.md`, cuando Miguel confirme su alcance (P-02).

## Pendientes menores
- QA v0.5 M-01–M-05 (desempates de la IA, test de provocar en U10). QA R-01 (claves desconocidas en bloques antiguos de config) y R-02 (la IA de referencia no ve el provocar del turno); `placement.ts:61` con un 3 fijo; tests de provocador que cae a mitad de turno.
- Arte (si se retoma): mueca altiva y boca cosida justas a 48 px; ojos de Sombra con poco contraste; grietas de Llama raras sobre cuerpos de otro color; cara quizá pequeña en combate; galería de 955 KB.
