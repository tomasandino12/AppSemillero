# Evaluación de salto por video (v1) — spec

Fundamento, fuentes y verificaciones: `docs/evaluaciones-fisicas/FUNDAMENTO.md`.

## Qué es
El profe mide el **CMJ** y el **Abalakov** de su plantel con el celular en
cámara lenta. En el video marca a mano el cuadro del despegue y el del
aterrizaje, y la app calcula el tiempo de vuelo, la altura y la potencia
(método de Samozino).
- El video se procesa en el celular y **nunca se sube**. A la base van sólo
  números.
- Son los mismos tests que el CReAR tomó al ~100 % de sus evaluados en 2025.

**Queda afuera de la v1:**
- sprint por video, perfil fuerza-velocidad, drop jump y detección automática;
- carga de resultados oficiales: sale un botón "Próximamente", deshabilitado;
- borrar el video de la galería: la web no puede hacerlo, así que el
  protocolo lo pide.

## Flujo del profe
1. **MEDIR → "Salto".** Elige el test de la sesión (CMJ o Abalakov) y la
   fecha. Ve la lista del plantel con el estado de cada chico (vacío,
   parcial, completo o ausente), igual que en velocidad.
2. **Por jugador, hasta 3 intentos.** Cada intento:
   - **"Grabar"** (`<input capture>`) o **"Elegir video"**. El primero se
     ofrece sólo si la prueba de la task 0 demuestra que permite cámara lenta.
   - Se abre el **marcador de cuadros**: botones de −10/−1/+1/+10 cuadros,
     "Despegue" y "Aterrizaje".
   - Muestra el tiempo de vuelo y la altura. "Usar" guarda el intento y
     libera el video con `revokeObjectURL`.
3. **Botón "¿Cómo se mide?"** en la pantalla y en el marcador, con el
   protocolo (abajo).
4. **Borrador en cada toque**, con `borradorMedicion`, y guardado idempotente
   con `sesionId`, como en las demás sesiones.

## Protocolo (texto del botón de info)
- **Cámara:** modo "Cámara lenta" común, nunca "instantánea" ni con IA. De
  costado al chico, al ras del piso (0–10 cm), a 2–3 m, en horizontal y fija.
  Tienen que verse los dos pies y el piso.
- **Grabación:** mucha luz; zapatillas; grabar, esperar 2 s y recién ahí
  saltar; no editar ni recortar.
- **CMJ:** manos en la cadera toda la ejecución. **Abalakov:** brazos libres.
- **Salto:** contramovimiento a la profundidad que elija el chico. Piernas
  extendidas en el aire y al aterrizar.
- **Intentos:** 3 válidos, con 30–60 s de pausa. Cuenta el mejor.
- **Marcado:** despegue = último cuadro con la punta del pie tocando el piso;
  aterrizaje = primer cuadro en que vuelve a tocar.
- **Después:** borrar el video de la galería.
- **Medidas de pierna:** `L0` = trocánter mayor → punta del pie, con la
  pierna extendida y el tobillo en flexión plantar. `hpush` = trocánter →
  piso, en cuclillas con la rodilla a 90°.

## Cálculos (módulo puro `src/data/salto.js`)
- **Cuadros:** `n = round(ΔmediaTime / intervaloDelArchivo)` y
  `tv = n / fpsCaptura`. Así da igual si el archivo es de 30 fps estirado
  (Samsung) o guarda los tiempos reales.
- **Altura:** `h = g·tv²/8`, con g = 9,81.
- **Potencia (Samozino):** `hpo = L0 − hpush`; `F = m·g·(h/hpo + 1)`;
  `v = √(g·h/2)`; `P = F·v`. También W/kg.
  - `m` = el último peso con fecha ≤ la del salto. `L0` y `hpush` = la
    última medición de pierna con esa misma regla.
  - Si falta cualquiera de los tres, la potencia es `null` ("no se sabe"),
    nunca 0.
- **Sentido común:** un tv fuera de 0,10–1,00 s se rechaza con un mensaje.
  Casi siempre significa que los fps están mal.
- **fps de captura:** `src/data/metadatosVideo.js` busca
  `com.android.capture.fps` en el principio y el final del archivo, leyendo
  con `file.slice`, sin cargarlo entero.
  - Si no lo encuentra, el profe elige 240 o 120. Se recuerda el último
    elegido.
  - Por debajo de 120 fps no se mide: el error sería ±2 cm o más por cuadro.
- **Mejor intento** = mayor altura. **Variabilidad** = rango entre los
  intentos del día; se muestra y queda como base para el "cambio real" de
  una v2.

## Datos (migraciones nuevas)
- **`sesion_medicion.tipo`** suma `'salto'`. Se agrega la columna
  `test_salto` (`'cmj'` / `'abalakov'`), obligatoria sólo cuando el tipo es
  salto.
- **Tabla `medicion_salto`**, con el patrón de 0026: `club_id`,
  `sesion_id`, `jugador_id`, `intento` (1–3), `tiempo_vuelo_ms`,
  `fps_captura`.
  - `tiempo_vuelo_ms` es `numeric(6,2)`, entre 100 y 1000, o `null` =
    ausente.
  - `fps_captura` va entre 120 y 960.
  - Se guarda **el dato crudo, no la altura**: la fórmula vive sólo en JS y
    una corrección recalcula todo el histórico.
  - Sellado, RLS por plantel, `revoke all` más grants por columna.
- **`medicion_corporal`** suma `pierna_cm` (60–130) y
  `pierna_flexionada_cm` (30–110), nullable, con `check` de que la
  flexionada sea menor que la extendida.
- **RPC `guardar_sesion_medicion`:** se reemplaza en una migración nueva con
  la rama `'salto'`, idempotente por `sesionId`.
- **`mi_progreso`:** suma `saltos` (fecha, test, intentos con
  `tiempo_vuelo_ms`), sin datos corporales.
- **Contrato:** los rangos viven en SQL y en JS (`limites.js` /
  `antropometria.js`). Un test compara los dos.

## Dónde se ve
- **Ficha del jugador (profe):** sección "Salto". Por test, el mejor intento
  de cada sesión (altura, tv, potencia y W/kg si hay datos), el historial
  con gráfico como el de velocidad y el rango de los intentos.
  - En "Medidas corporales" se suman los dos campos de pierna con su info.
- **Progreso (jugador):** sección "Salto" con la altura y el historial.
  **Sin potencia**, porque sale del peso y la regla de 0030 deja las medidas
  corporales fuera de la vista del jugador.

## Riesgos que se verifican primero (task 0)
- ¿`<input capture>` en el S24 FE deja elegir cámara lenta? Si no, sólo
  queda "Elegir video".
- ¿Chrome Android avanza cuadro por cuadro un HEVC de 240 fps con
  `requestVideoFrameCallback`? ¿`intervaloDelArchivo` se puede medir en el
  navegador?
- Plan B, si el paso cuadro por cuadro falla: WebCodecs más un lector de
  MP4. Sería otro spec.

## Tests
- `salto.test.js`: fórmulas con casos a mano (tv 0,5 s → 30,66 cm),
  redondeo de cuadros, rechazo por sentido común, potencia `null` cuando
  falta un dato, mejor intento y elección del corporal "vigente a la fecha".
- `metadatosVideo.test.js`: buffers sintéticos con y sin la clave.
- `contratoSalto.test.js`: rangos de SQL contra JS.
- `prepararPayloadMedicion` extendido: payload de salto y ausente.
- `arquitectura.test.js` corre solo.
