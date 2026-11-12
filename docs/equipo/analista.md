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
- **No se valida con las semillas con que se eligió, ni se escriben a mano cifras o conclusiones en los informes** (QA V-01, V-02, V-04). κ 0,075 se eligió con `valida02-*` y se revalidó con `valida03-*`. El informe lee la config del JSON, indica commit y huella, y sus conclusiones son plantillas condicionales sobre los datos.

## Lecciones (combate v0.1)
- Simulador de combate: `npm run sim:combat` (`--quick` < 30 s; completo ≈ 6–7 min). Elige con `elige01-*`, valida con `valida01-*`, evalúa v0.1 con `combate01-*`; `--informe-desde DIR` regenera el informe sin simular.
- **Mirar el uso además del resultado.** La prueba de sustitución daba ~50 % a los movimientos de coste 4–5 porque la IA u = 0 casi nunca los podía pagar: un "no roto" sin uso no es evidencia. Registrar siempre cuánto se usa lo que se prueba.
- **Separar la causa con un diagnóstico que anule un factor** (estadísticas iguales en C2, tope de 40 turnos, IA con reserva) antes de proponer arreglos; así se vio que la duración es energía y no vida, y las familias son sobre todo perfil.
- Prueba de sustitución en 2 tandas (400, y +1600 solo si el IC cruza un umbral) para caber en el presupuesto; el informe declara cada reducción frente a la spec.
- Un arreglo puede mover otro criterio al borde (energía 3 deja "guardar compensa" en el límite): validar la combinación en todos los escenarios, como en genética.

## Lecciones (combate v0.2 → v0.2.1)
- **Maldición del ganador en búsquedas con muchas candidatas:** la mejor de 34 sales con 60 combates por pareja prometía 50 % y validó en 44,5 %. Para elegir, ≥ 120 por candidata y una banda de búsqueda con margen (46,5–53,5 %); siempre revalidar con semillas nuevas, y las semillas que motivaron un refinado pasan a ser de elegir (`valida02`).
- **Mirar los topes antes de mover una curva:** la convexidad no hacía nada porque los topes de potencia (daño 250, cura 180, escudo 200) recortaban justo los costes altos (QA K-01). Con una curva nueva, comprobar qué fracción de cada coste llega al tope.
- **Población entera ≠ muestra:** el catálogo (72) se cuenta exacto; un IC de Wilson sobre "0 de 72" marca "frágil" un criterio que se cumple. La incertidumbre de cada movimiento va en su veredicto "dudoso".
- Parches por ruta: la forma larga crea claves (QA K-02); el simulador exige que cada sal apunte a un gen del catálogo y la CLI rechaza las semillas con que se eligió.

## Lecciones (variantes de combate v0.3)
- `npm run sim:variantes` (`--quick` < 30 s; completo ≈ 8 min; `--fase diagnostico|elegir|validar`; `--informe-desde DIR`). Evalúa con `var03`; `elige03` y `valida04` quedan reservadas para el ajuste. Cada combinación es un parche con huella propia y se comprueba que cambia la config antes de simular.
- **Un escenario puede no ejercitar la pieza que se estudia:** provocar va en 2 de 72 movimientos y con salvajes casi no sale (Q-02); solo se vio su efecto en C2 (hunde a brote). Registrar el uso de cada pieza nueva y, si un criterio se rompe, quitar la pieza en un diagnóstico pareado antes de culpar a la variante entera.
- **Contar opciones reales, no las teóricas:** con descanso se esperaban 3 de 4 movimientos y son 3,7, porque el 62 % de las acciones son golpes básicos. La entropía por alma tiene sesgo con partidas cortas: dar también una medida agregada.
- Dejar los resultados en disco por fases y lanzar lo largo de forma que un corte no lo pierda (una ejecución entera se perdió); no ajustar números encima de un defecto conocido del núcleo (Q-01): marcar las cifras como provisionales.
