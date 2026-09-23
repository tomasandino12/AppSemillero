# Evaluación de salto por video (v1): plan

**Spec:** `docs/superpowers/specs/2026-09-23-evaluacion-salto-design.md`
(fundamento: `docs/evaluaciones-fisicas/FUNDAMENTO.md`).

**Cómo se ejecuta:** en esta sesión, sin subagentes. Cada task es un commit,
con TDD donde hay lógica, y `npm run test:q` antes de commitear.

## Restricciones globales
- Capas: pantalla → `repositorio.js` → `repos/mediciones.js` → `cliente.js`.
  Las fórmulas van sólo en `src/data/salto.js`, que es puro.
- HTML nuevo con `html\`...\`` (`ui/html.js`); errores con
  `ui/errores.js`; `$` desde `ui/dom.js`.
- Números tecleados con `decimalEstricto`. Rangos en JS y en SQL, con test de
  contrato.
- `NULL` = no se sabe. La potencia sin datos es `null`, nunca 0.
- El video nunca se sube ni se guarda: sólo un `objectURL`, que se revoca al
  salir del marcador.
- Migraciones nuevas, porque las aplicadas no se editan (patrón `0026`), y
  **`db push` sólo con confirmación de Tomás**. Ojo: 0032–0042 quizás
  tampoco están aplicadas (memoria del proyecto).
- UI y comentarios en voseo. Antes de CSS o de una pantalla nueva, leer
  `DESIGN.md`.

---

### Task 0: prueba en el celular (descartable, no toca `src/`)
**Archivos:** una página HTML suelta en el scratchpad, publicada como
Artifact privado para abrirla desde el S24 FE.

**Qué prueba:**
- (a) Botón `<input type="file" accept="video/*" capture="environment">`:
  ¿la cámara que se abre permite "Cámara lenta"?
- (b) Botón "Elegir video" con el archivo del día: lee la metadata con
  `file.slice`, avanza cuadro por cuadro con `requestVideoFrameCallback` y
  muestra el `mediaTime` de cada cuadro y el intervalo medido.
- (c) Marcar dos cuadros → muestra tv y h.

**Criterio de aceptación:** Tomás marca un salto y un video de la pelota en
su celular; el intervalo medido da ~33,3 ms y h coincide ±1 cuadro con el
análisis en PC.
- Resultado anotado en `FUNDAMENTO.md` §10.
- Si (b) falla → parar y re-diseñar (WebCodecs).
- Si (a) no permite cámara lenta → sólo "Elegir video".

**Commit:** `docs(evaluaciones): resultado de la prueba en el navegador`.

### Task 1: lógica pura del salto
**Archivos:** crear `src/data/salto.js` y `tests/salto.test.js`.

**Produce:**
- `cuadrosEntre(t1, t2, intervaloArchivoS)` → entero.
- `tiempoDeVuelo(nCuadros, fpsCaptura)` → segundos.
- `alturaDeSalto(tvS)` → cm.
- `validarTiempoDeVuelo(tvS)` → `{ ok, motivo }`, rango 0,10–1,00 s.
- `potenciaSamozino({ masaKg, alturaCm, piernaCm, piernaFlexionadaCm })` →
  `{ fuerzaN, velocidadMs, potenciaW, potenciaWKg }` o `null`.
- `mejorIntento(intentos)`.
- `rangoDeIntentos(intentos)`.
- `vigenteALaFecha(medicionesCorporales, fechaIso, campo)`.
- Constantes `G = 9.81`, `TV_MIN_S`, `TV_MAX_S`, `FPS_MIN = 120`.

**Tests:**
- `tv 0,5 s da 30,66 cm`
- `cuadros se redondean al entero más cercano`
- `tv fuera de rango se rechaza con motivo`
- `potencia null si falta peso o pierna`
- `potencia de un caso a mano`
- `mejor intento ignora ausentes`
- `vigente toma el último con fecha menor o igual`

### Task 2: leer los fps de captura del archivo
**Archivos:** crear `src/data/metadatosVideo.js` y
`tests/metadatosVideo.test.js`.

**Produce:** `fpsDeCaptura(bytes: Uint8Array)` → número o `null`. Busca
`com.android.capture.fps` y parsea el valor ASCII que le sigue. Es puro: la
pantalla le pasa los primeros y los últimos 4 MB leídos con `file.slice`.

**Tests:**
- `encuentra 240 en un buffer sintético`
- `devuelve null sin la clave`
- `ignora valores no numéricos`
- `acepta la clave cerca del final`

### Task 3: migración de datos de salto
**Archivos:** `supabase/migrations/0043_salto.sql` (usar `/nueva-migracion`),
`supabase/ESQUEMA.md`, `src/data/limites.js` o `src/data/antropometria.js`,
y `tests/contratoSalto.test.js`.

**Qué cambia:**
- `sesion_medicion`: `tipo` suma `'salto'`; nueva columna `test_salto` con
  el check `(tipo = 'salto') = (test_salto is not null)`.
- Tabla `medicion_salto` (spec §Datos) con RLS por plantel, `revoke` +
  grants por columna, sellado y `unique (sesion_id, jugador_id, intento)`.
- `medicion_corporal`: suma `pierna_cm` y `pierna_flexionada_cm` con sus
  checks, y se actualiza el grant de la tabla si hace falta.

**Criterio de aceptación:** el test de contrato lee la migración y compara
tv, fps y los rangos de pierna con las constantes de JS.

**Tests:**
- `rangos de tiempo de vuelo coinciden`
- `rangos de pierna coinciden`
- `fps mínimo coincide`

### Task 4: RPCs de guardado y lectura
**Archivos:** `supabase/migrations/0044_rpc_salto.sql`.

**Qué cambia:**
- Se reemplaza `guardar_sesion_medicion`, partiendo de la versión de 0038:
  rama `'salto'` con idempotencia por `sesionId` y `test_salto`
  obligatorio.
- Se reemplaza `mi_progreso` (0030 → la última versión que haya): suma
  `saltos`, sólo del jugador y sin datos corporales.

**Criterio de aceptación:** revisión línea por línea contra la versión
anterior de cada función, sin perder ramas. Después, **pedir confirmación**
y correr `npx supabase db push`, revisando antes qué migraciones pendientes
entran (0032–0044). Las tasks 7 y 8 necesitan la base actualizada.

### Task 5: payload y repositorio
**Archivos:** `src/data/prepararPayloadMedicion.js` (+ su test existente) y
`src/data/repos/mediciones.js`.

**Produce:**
- `prepararPayloadSalto({ sesionId, clubId, plantelId, fecha, testSalto, valores })`.
  `valores[jugadorId] = { ausente }` o `{ intentos: [{ tiempoVueloMs, fpsCaptura }] }`.
- `obtenerMedicionesSaltoDelPlantel(clubId, plantelId)` → objetos en
  camelCase (`saltoDesdeFila`).
- `crearMedicionCorporal` acepta `piernaCm` y `piernaFlexionadaCm`, y la
  lectura corporal los devuelve.

**Tests:**
- `payload de salto con 3 intentos`
- `ausente va sin intentos`
- `intento sin tiempo no viaja`

### Task 6: marcador de cuadros y protocolo
**Archivos:** crear `src/ui/componentes/marcadorCuadros.js` y
`src/ui/componentes/protocoloSalto.js`, y agregar su CSS según `DESIGN.md`.

**Produce:**
- `abrirMarcador({ archivo, fpsCaptura })` → `Promise<{ tiempoVueloMs, fpsCaptura } | null>`.
  - Crea y revoca el `objectURL` y mide el intervalo del archivo con rVFC.
  - Botones −10/−1/+1/+10, "Despegue", "Aterrizaje" y "Usar".
  - Valida con `validarTiempoDeVuelo`.
- `botonProtocolo()` → abre la hoja con el texto del protocolo del spec.

**Criterio de aceptación:** con el video del S24 FE, en el navegador del
celular, se marcan dos cuadros y el resultado coincide con la task 0.
Verificación manual con Tomás; no hay test automático de DOM.

### Task 7: pantalla MEDIR → Salto
**Archivos:** crear `src/ui/pantallas/medirSalto.js`, y modificar
`src/ui/pantallas/medir.js`, `src/ui/main.js` y `public/index.html` (la
sección de la pantalla). Usar `/nueva-pantalla`.

**Qué hace:**
- Selector CMJ/Abalakov, fecha, lista del plantel con estado y hasta 3
  intentos por chico.
- Botones "Elegir video" (y "Grabar" sólo si la task 0 lo habilitó) y
  "Ausente".
- Botón "¿Cómo se mide?" y "Cargar resultado oficial — Próximamente",
  deshabilitado.
- fps: los lee con `fpsDeCaptura`; si no están, un selector 240/120
  recordado en `localStorage` (con try/catch).
- Borrador en cada toque y guardado con `guardarSesionMedicion`.

**Criterio de aceptación:** una sesión completa (1 ausente, 1 con 3
intentos) se guarda, y el reintento con el mismo `sesionId` no duplica.
Verificación en el celular.

### Task 8: dónde se ve (profe y jugador)
**Archivos:** `src/ui/pantallas/fichaJugador.js` y
`src/ui/pantallas/jugProgreso.js`. Si hace falta una función pura de
armado de series, en `src/data/salto.js`, con su test.

**Qué hace:**
- **Ficha:** sección "Salto" por test, con el mejor de cada sesión (h, tv,
  P y W/kg si hay datos), historial y rango de intentos. En "Medidas
  corporales" suma los campos de pierna con info de cómo medirlos.
- **Progreso del jugador:** altura e historial, sin potencia.

**Test (si se crea la función):** `serie de salto toma el mejor por sesión`.

**Criterio de aceptación:** se ve correcto con datos reales guardados en la
task 7, en el celular y en modo oscuro.

### Task 9: cierre
- Probar de punta a punta las tasks 7 y 8 en el celular.
- `graphify update .`
- Actualizar el `FUNDAMENTO.md` §10 y la memoria del proyecto.

**Commit:** `docs(evaluaciones): v1 de salto aplicada y verificada`.
