# Analista de balance — convenciones y lecciones

## Herramienta
- `npm run sim -- --quick` (< 30 s) mientras desarrollas; `npm run sim` para la ejecución completa (≈ 5 min, 2 hilos). `--help` lista los filtros (`--barrido`, `--config`, `--escenario`, `--semilla`, `--semillas`).
- Salida en `sim/out/` (ignorado por git): un CSV por escenario y configuración, `resumen-criterios.csv`, `resumen.json` y `hashes.sha256`. El informe se genera a partir de esos mismos datos (`sim/genetics/narrative.ts`) y se copia en `docs/informes/`.
- Los criterios y umbrales se leen de `criterios_sim` en la config. No se copian números al código.
- Tres flujos RNG por semilla (`|cria`, `|sim`, `|salvaje`), así que los barridos son pareados. Las ejecuciones con la misma config efectiva se calculan una vez.

## Método
- **Semillas distintas para elegir y para validar.** Lo que se decide mirando unas semillas se valida con otras (v0.1 eligió con `genoma-*`, v0.2 validó con `valida02-*`). La CLI avisa si se reutilizan.
- **Bastantes ensayos para las colas.** Medianas y p90 llevan IC (estadísticos de orden), y para tiempos hasta un suceso hay contraste con el MLE geométrico con censura. Con 100 ensayos, una mediana puede desviarse un 30 % (QA S-01).
- **Censura explícita**: "> tope", nunca "∞". Se informa de cuántos ensayos quedaron censurados.
- **Cada configuración con su propio flujo** en métricas raras. Si se comparte, el error de muestreo va en la misma dirección en todas y parece una señal.
- **Métricas con resultado bimodal** (barrido selectivo sí/no, como el monocultivo de E5): mirar la distribución por semilla, no solo la media. Hacen falta 20 semillas o más.
- **"Frágil"** = el IC cruza el umbral. Se dice en el resumen, no solo en la tabla.

## Criterios que midan lo que pretenden
- Antes de dar por bueno un criterio, comprobar que no mezcla dos efectos. El E3a de v0.1 medía deriva y selección de recesivos a la vez; se arregló con clones homocigotos y Δ en puntos.
- Medir en unidades absolutas (puntos por gen) cuando el porcentaje depende del genoma de partida.
- Buscar el riesgo contrario al que vigila el criterio. Por ejemplo, los criterios de diversidad solo detectaban colapso, no inflación ni la absorción por híbridas.
- Comprobar las premisas de la spec con datos. "La selección por velocidad no selecciona calidad" era falsa, porque Σvalores = calidad.

## Presupuesto y honestidad
- Solo se barre lo que decide algo. Si un criterio suspende, se prueban 1 o 2 variantes del parámetro implicado. Si se hace alguna más, se declara en el informe.
- Variantes de diagnóstico (¿cuál es la causa?) aparte de las de arreglo (¿qué valor proponemos?).
- Cada cifra del informe sale del CSV. Si una cifra antigua resulta errónea, se corrige citando de dónde sale la corrección.
- Las decisiones de fondo (umbrales, márgenes irreversibles) se plantean como pregunta con opciones y una recomendación; no se deciden en el informe.

## Lecciones (v0.1 → v0.2)
- La estimación analítica del diseñador acertó dos veces (sorpresa y E4). Merece la pena pedirla siempre antes de simular, porque detecta fallos del simulador.
- Un cambio "pequeño" de parámetro (κ 0,05 → 0,10) puede romper un criterio en otro escenario. Al validar, se valida la combinación en **todos** los escenarios.
- El modo rápido sirve para depurar, no para concluir: con N = 200 y 40 generaciones, algunos criterios (Genedex) cambian de veredicto.
