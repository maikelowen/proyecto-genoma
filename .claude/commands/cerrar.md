---
description: Cierra la sesión (verifica, actualiza ESTADO/BACKLOG/DECISIONES/PREGUNTAS, commit y push)
---
Cierra la sesión de trabajo de Proyecto Genoma:

1. Ejecuta `npm run check`. Si falla, no cierres como hecho: déjalo en ESTADO como pendiente.
2. Actualiza `docs/proyecto/ESTADO.md` (situación, hecho en esta sesión con hashes de commit y coste real en tokens de agentes, siguiente paso), `BACKLOG.md` (tareas hechas fuera, nuevas dentro, con coste estimado) y, si las hubo, `DECISIONES.md` (decisiones tuyas con fecha, motivo y alternativas).
3. Pasa a `docs/proyecto/PREGUNTAS.md` toda decisión que sea de Miguel, con contexto, opciones, recomendación y qué bloquea.
4. Añade a las guías de `docs/equipo/` las lecciones que sirvan a futuras sesiones (pocas líneas).
5. Commit y push. Comprueba que `git status` queda limpio.
6. Responde a Miguel con: qué se hizo, cómo probarlo (enlace o fichero), coste de la sesión y las preguntas abiertas que debe llevar al chat de decisiones.
