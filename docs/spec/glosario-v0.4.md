# Glosario de interfaz v0.4 — palabras clave y descripciones cortas

Autor: Diseñador de sistemas. Fecha: 2026-11-13. Para el Ingeniero de cliente. Reglas de juego: `combate-v0.4.md`, `movimientos-v0.4.md`.

## 1. Palabras clave

| Palabra | Significado (una frase) | Pieza |
|---|---|---|
| **Gratis** | No gasta energía ni descansa; todas las almas tienen uno. | movimiento de extremidades |
| **Descansa** | No se puede usar el turno siguiente al usarlo. | V2 |
| **a la fila** | Afecta a todas las almas de una fila (la delantera enemiga, o la tuya expuesta si es de apoyo). | `area` |
| **atrás** | Salta la fila delantera y golpea a la trasera (si no hay nadie detrás, a la delantera). | `alcance` |
| **Provoca** | Este turno, todos los ataques enemigos a un solo objetivo van a esta alma. | provocar |
| **Escudo** | Absorbe daño antes que la vida durante 2 turnos. | escudo |
| **Cura** | Recupera vida al aliado más herido. | cura |
| **Drena** | Recupera el 30 % del daño hecho. | drenaje |
| **Quema** | Pierde 12 de vida por pila al final de cada turno (3 turnos, hasta 3 pilas). | quemadura |
| **Aturde** | Pierde su próxima acción. | aturdir |
| **Marca** | Recibe un 20 % más de daño. | marca |
| **Debilita** | Hace un 20 % menos de daño. | debilitar |
| **Ralentiza** / **Prisa** | Actúa más tarde / antes. | ralentizar / prisa |
| **Regenera** | Recupera 15 de vida al final de cada turno durante 3 turnos. | regenerar |
| **Primero** | Actúa antes que los movimientos normales. | prioridad |
| **Perfora** | Ignora el escudo. | perforar |
| **+1 energía** | Devuelve 1 de energía al bando. | energía extra |

Condiciones (siempre como "×1,5 …"): **en combo** (otra alma de su familia usa un movimiento de pago este turno) · **si está afectado** (el objetivo tiene un estado negativo) · **si herido** (el usuario está por debajo del 50 %) · **si va antes** (el objetivo aún no ha actuado) · **con reserva** (quedan ≥ 3 de energía tras pagar).

## 2. Regla para escribir la descripción corta (≤ 3 fragmentos, separados por " · ")

```
F1 = número principal + calificador de alcance
     daño: "190"; escudo: "Escudo 95"; cura: "Cura 60"
     + " a la fila" si área; + " atrás" si alcance; + " primero" si prioridad (en ese orden; como mucho dos)
F2 = efecto: estado ("Quema", "Marca"…), "Provoca", "Prisa", "Regenera", "+1 energía",
     o, si no hay estado, "Drena" / "Perfora"
F3 = condición: "×1,5 en combo" | "×1,5 si está afectado" | "×1,5 si herido" | "×1,5 si va antes" | "×1,5 con reserva"
Omitir los fragmentos vacíos. El coste (o "Gratis") va en la esquina del botón, nunca en el texto.
```
- Por la gramática (máx. 1 estado, 1 modificador, 1 condición; drenaje y perforar solo en golpes sin estado) **nunca hay más de 3 fragmentos**.
- Números: la **potencia base** del movimiento (sin estadísticas, familia ni sinergia), con coma decimal española.
- Todo lo demás (duración exacta, a quién va, valores de estado) va en la ficha ampliada al mantener pulsado.

Ejemplos: "190 · Drena" · "35 · Quema · ×1,5 en combo" · "Escudo 95 a la fila · Prisa" · "60 atrás · Marca" · "Escudo 120 · Provoca" · "15" (gratis) · "Escudo 20" (gratis) · "45 a la fila atrás · Debilita · ×1,5 con reserva".
