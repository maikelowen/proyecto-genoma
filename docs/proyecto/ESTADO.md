# ESTADO — Proyecto Genoma

Actualizado: 2026-11-16. Fuente de verdad: este fichero (el repositorio).

## Situación
- **Fase 1 cerrada (D-064)** sin feedback formal: a los amigos no les engancha el combate suelto.
- **Fase 2, paso 1 jugable** en https://maikelowen.github.io/proyecto-genoma/jugable/animas.html: **mundo caminable del Prado** (D-074) con arte por código, encuentros en hierba alta, farol para atrapar, niveles hasta 30 con movimientos que se desbloquean y variantes, resonancia, Codex y guardado local. Marismas y Cantil, en lista.
- **Combate v0.5** con catálogo reequilibrado es el juego principal (D-060, D-069) y el arte v3 está en `main`. No quedan ramas pendientes.
- **Desarrollo en Claude Code** (D-051); los chats del proyecto de Claude son para decisiones.

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

- **14–16 nov — Fase 1 cerrada y Fase 2 paso 1 + mundo:**
  - Fusiones de `combate-v0.5` y `arte-v3` (a22e9b4, 078c758); reequilibrio v0.5 con 6 sales, 13/13 familias (8782112, QA aprobada); juego principal en v0.5 (91f0481).
  - Spec de progresión v0.1 (2a836af → 5c8ddce, con QA y respuestas de Miguel D-067, D-068, D-070, D-071).
  - Núcleo de progresión (e336c68) + QA (49ac604) + ajustes D-072/D-073 (9555e10). Simulación con combate real (5cea644; validación `prog04`: 15/16 criterios, 28/22 resonancias en 3 sesiones, nivel 30 en 36 combates; falla por poco el primer combate, 89,6 % frente a ≥ 90 %, D-075).
  - Pantallas del paso 1 (2f50d46). Miguel: "esto no es el juego que esperaba" → **D-074 mundo caminable**.
  - Spec del mundo (6b31f1d), núcleo del mundo (320b596, QA a754b33) y cliente del mundo con arte cuidado (8c3e5c6). 456 tests.
  - **Coste real:** agentes ≈ 2,24 M (paso 1 ≈ 1,6 M: diseñador 250 k, núcleo 304 + 153 k, revisor 167 + 193 k, analista 100 + 185 k, cliente 232 k; mundo ≈ 0,65 M: diseñador 153 k, núcleo 148 k, revisor 86 k, cliente 267 k) + director ≈ 150 k. El paso 1 quedó en su tope (1,8 M); el mundo, por debajo de su presupuesto (0,8–1,1 M).

## Siguiente paso
1. **Miguel juega `animas.html`** (al menos una sesión) y dice qué le parece: luz del atardecer, hierba alta, transición al combate, ruta tocando en el móvil, santuario, si el arranque es justo, si engancha. Hito D-066: 3 sesiones, 20 resonancias, un ánima a nivel ~20, y 2 amigos 30 min sin pedírselo.
2. Con su opinión: pulido del mundo (BACKLOG 13) y, si engancha, Marismas y Cantil caminables (BACKLOG 14).
3. Antes de tocar el núcleo otra vez: separar tests lentos (`npm run check` está en ~18–24,5 s de 25).

## Pendientes menores
- Mundo: ojos de la transición planos, orilla del estanque escalonada en diagonal, cabecera del santuario en móvil corta a Arnal, mucho margen vacío a 1100 px; QA mundo M-01 (farol perdido repetible borrando la clave) y M-04.
- Progresión: textos de variantes casi en bruto; recargar a mitad de combate cuenta como huida; `battle.ts` duplica la UI de combate.
- QA v0.5 M-01–M-05 (desempates de la IA, test de provocar en U10). QA R-01 (claves desconocidas en bloques antiguos de config) y R-02 (la IA de referencia no ve el provocar del turno); `placement.ts:61` con un 3 fijo; tests de provocador que cae a mitad de turno.
- Arte (si se retoma): mueca altiva y boca cosida justas a 48 px; ojos de Sombra con poco contraste; grietas de Llama raras sobre cuerpos de otro color; cara quizá pequeña en combate; galería de 955 KB.
