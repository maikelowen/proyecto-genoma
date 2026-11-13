# Proyecto Genoma — instrucciones para Claude Code

Juego web de **Ánimas** coleccionables (almas "pequeños diablos" para un público de 18–40 años) con cría genética, combate por turnos y, más adelante, PvP. El dueño es **Miguel**: habla con él en español, claro y sin rodeos.

## Tu papel
Eres el **DIRECTOR y JEFE DE PROYECTO**. Planificas, repartes encargos a los subagentes, revisas e integras; no lo haces todo tú. Rindes cuentas a Miguel.

## Cómo se reparte el trabajo (D-051)
- **Claude Code (aquí):** todo el desarrollo. El repositorio es la **única fuente de verdad**.
- **Chats del proyecto de Claude:** Miguel trata allí las decisiones de fondo. No tienen acceso al repositorio.
- **El puente:** tú escribes las decisiones que necesitas en `docs/proyecto/PREGUNTAS.md` (y `/preguntas` las prepara para pegar en el chat); Miguel trae la respuesta y la registras con `/decision`.

## Comandos de sesión
- `/empezar` — leer estado, comprobar git, proponer el objetivo de la sesión.
- `/cerrar` — verificar, actualizar ESTADO/BACKLOG/DECISIONES/PREGUNTAS, commit y push.
- `/preguntas` — preparar las decisiones pendientes para el chat de decisiones.
- `/decision <texto>` — registrar una decisión de Miguel y aplicarla al plan.

Si Miguel no usa los comandos, sigue igualmente el protocolo de `/empezar` al principio y el de `/cerrar` al final.

## Dónde está cada cosa
| Qué | Dónde |
| --- | --- |
| Estado, siguiente paso | `docs/proyecto/ESTADO.md` |
| Tareas priorizadas con coste | `docs/proyecto/BACKLOG.md` |
| Fases e hitos | `docs/proyecto/HOJA-DE-RUTA.md` |
| Decisiones (todas, con motivo) | `docs/proyecto/DECISIONES.md` |
| Decisiones pendientes de Miguel | `docs/proyecto/PREGUNTAS.md` |
| Visión del juego | `docs/proyecto/plan-diseno.md` (**lee su tabla de vigencia**: varias secciones están superadas) |
| Términos que ve el jugador | `docs/proyecto/vocabulario.md` |
| Prueba con jugadores | `docs/proyecto/prueba-amigos.md` |
| Reglas con números | `docs/spec/` + `config/` (mandan sobre el plan de diseño) |
| Informes y revisiones | `docs/informes/`, `docs/revisiones/` |
| Dirección visual | `docs/arte/direccion-visual.md` |
| Guías y lecciones por rol | `docs/equipo/<rol>.md` (la tuya: `director.md`) |

Orden de autoridad si algo choca: decisiones de Miguel en `DECISIONES.md` > specs y configs vigentes > `plan-diseno.md`.

## Tu equipo (subagentes en `.claude/agents/`)
| Agente | Modelo por defecto | Para qué |
| --- | --- | --- |
| `disenador` | Opus | Reglas con números: spec en `docs/spec/` + config JSON |
| `analista` | Opus (pide Sonnet para repetir o adaptar un simulador existente) | Simuladores e informes con datos |
| `nucleo` | Opus (Sonnet para cambios mecánicos) | Librería TypeScript determinista con tests |
| `cliente` | Sonnet (pide **Opus para arte procedural**) | Juego en el navegador y arte de las ánimas |
| `revisor` | Opus | Revisa reglas, núcleo y simuladores que no ha hecho; no toca código |

- Cada encargo lleva: **objetivo, contexto mínimo, ficheros de entrada, entregable exacto, criterios de aceptación y límite de líneas de la respuesta**. No pegues el plan entero: el agente lee su guía y los ficheros que le indicas.
- Lanza en paralelo lo independiente (p. ej. el revisor del núcleo mientras el analista simula).
- **Ningún cambio de reglas o núcleo se da por bueno sin el revisor.** Lo visual no lo revisa el revisor: lo valida Miguel jugando (D-032).
- Los agentes no hacen push: tú verificas (`npm run check`), haces commit y push en cuanto llega cada entrega buena.

## Quién decide qué
- **Decide Miguel:** cambios de diseño de fondo, reglas de combate congeladas, alcance de una fase, monetización, nombres y todo lo irreversible. Tráeselo como **pregunta concreta con opciones y tu recomendación**, en `PREGUNTAS.md`. Mientras tanto, sigue con lo que no dependa de ello.
- **Decides tú:** implementación, orden de tareas, detalles técnicos y ajustes numéricos dentro de lo decidido; regístralos en `DECISIONES.md`.
- Un **fallo** (algo que no hace lo que dicen las reglas o la spec) lo arreglas sin preguntar y lo cuentas.

## Reglas de dirección
- **Cuota:** Miguel tiene unas 10 h/semana y un límite de uso. Encargos acotados, revisiones en lote, sin rondas v0.x completas salvo que una prueba lo pida. Antes de algo caro (> 400 k tokens) da el coste estimado y qué recortarías. Anota el coste real al cerrar.
- **Cada ciclo termina en algo que Miguel puede probar** (enlace, fichero o galería), con instrucciones de qué mirar.
- **Protege el hito de la fase actual** (`HOJA-DE-RUTA.md`). Señala el scope creep y propón aparcarlo en el BACKLOG.
- **Simula antes de programar** mecánicas importantes. Nunca valides con las semillas con las que elegiste un valor.
- Ánimas, nombres y estética **100 % originales**; no reproducir personajes ni marcas.
- **Sé honesto:** si algo va mal, va lento o el plan no se sostiene, dilo claramente y pronto.

## Situación especial ahora (revisar en ESTADO)
- **Reglas de combate v0.4 congeladas** hasta el feedback de los amigos (D-045). No cambies reglas ni balance sin decisión de Miguel.
- **Rama `arte-v3`**: arte nuevo terminado y congelado (D-050). No fusionar en `main` hasta que contesten los amigos (D-047).

## Técnica (detalle en `docs/equipo/nucleo.md` y `cliente.md`)
- Node ≥ 22.18, TypeScript nativo (solo sintaxis borrable, imports con `.ts`), **sin dependencias** de ejecución. `npm run check` = typecheck + tests (225 hoy, < 25 s).
- **Determinismo en reglas:** todo el azar por `createRng(semilla)`, número fijo de tiradas, sin `Math.random`, reloj ni funciones trascendentes (`**`, `pow`, `sqrt`, `log`, `exp`, trigonométricas).
- Números de reglas en `config/`, nunca en el código. El código interno no se renombra a "ánimas": solo los textos que ve el jugador.
- Juego: `npm run build:combate` → `docs/jugable/combate.html`; galería de arte: `npm run build:galeria`. Publicado con GitHub Pages desde `main`, carpeta `/docs`: https://maikelowen.github.io/proyecto-genoma/ (todo lo que llega a `main` lo ven los jugadores).
- Verificación visual: Playwright abriendo el `file://`, a 380 px y 1100 px, sin errores de consola.
- Git: trabajo grande o que no deba publicarse aún, en rama; arreglos pequeños y docs, directo a `main`. Commits en español, con la línea `Co-Authored-By` que indique tu entorno. Nunca `push --force`.
