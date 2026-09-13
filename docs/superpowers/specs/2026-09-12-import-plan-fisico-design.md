# Importación del plan físico (fuerza)

**Fecha:** 2026-09-12
**Estado:** para aprobar
**Etapa:** 6
**Depende de:** `src/parser/parserFisico.js` (commit a531a04), que no se toca.

---

## 1. Qué resuelve

El profe de físico arma el plan de fuerza en un `.xlsx` con dos rutinas por
semana. Hoy ese archivo vive en un WhatsApp y no está en ningún lado más. Esta
etapa lo persiste: el profe elige la categoría, sube el archivo, ve lo que el
parser entendió, resuelve a mano los nombres de ejercicio que no matchearon, y
confirma. O entra todo, o no entra nada.

**Lo que esta etapa NO hace, a propósito:** no muestra el plan guardado en
ninguna pantalla. Ni al jugador (no tiene cuenta) ni al profe. Los criterios de
aceptación piden verlo con una consulta directa a la base. Es una etapa de
escritura; la lectura es otra.

---

## 2. El matcheo tiene dos pasos, no uno

Esto no estaba en el prompt y cambia el diseño, así que va primero.

**El parser no matchea contra la base: matchea contra el archivo.** La
`referencia` que devuelve apunta a una fila de la hoja "Ejercicios" del propio
`.xlsx`, que no tiene ids. Entonces importar es:

1. **Reconciliar la biblioteca del archivo contra la del club.** Las 39 filas de
   la hoja "Ejercicios" se buscan en `ejercicio_fuerza` por nombre normalizado.
   Las que ya están se reusan; las que no, se crean. Es automático y no adivina
   nada: la coincidencia es exacta sobre el nombre normalizado, el mismo
   criterio del parser.
2. **Resolver a mano lo que quedó afuera.** Los ejercicios de sesión que el
   parser no pudo referenciar (57 de 135 en el archivo real, 43 nombres
   distintos) los resuelve el profe contra la biblioteca del club — que para ese
   momento ya tiene las 39 del paso 1.

El orden importa: sin el paso 1, el profe tendría que dar de alta a mano
ejercicios que el archivo ya traía con nombre y link.

---

## 3. Esquema — `0020_plan_fisico.sql`

Cuatro tablas. Todas llevan `club_id` y FK compuestas contra `(club_id, id)`,
que es la decisión de 0001 que no se reabre.

### `ejercicio_fuerza` — la biblioteca

**Tabla nueva y no la `ejercicio` de la Etapa 5**, que es otra cosa: la
biblioteca de ejercicios de básquet que cargan los profes a mano, con `tema` (de
`src/data/temas.js`), material, jugadores, autoría y notas. Tres razones:

- El eje es distinto: acá manda `bloque` (POTENCIA, FUERZA, AUXILIAR, CORE,
  AUX/CORE), allá `tema`.
- La RLS de `ejercicio` deja editar sólo a quien creó la fila. Una entrada que
  nace de importar un archivo quedaría atada a quien subió ese mes.
- RECURSOS lista `ejercicio` con sus notas y su autoría. Inyectarle 39
  ejercicios de gimnasio le tapa la función a la pantalla.

| Columna | Por qué |
|---|---|
| `clave` | El nombre normalizado (`clavearNombre`). Es lo que hace que el import del mes siguiente reconcilie solo. |
| `nombre` | Como lo escribió el profe, sin tocar. |
| `bloque`, `link` | Nullable: un alta a mano puede no tener video. |
| `unique (club_id, clave)` | Dos entradas con el mismo nombre normalizado son la misma. |

Sin `check` sobre `bloque`: la lista de bloques la manda el archivo del club, y
un `check` la ataría a una migración cada vez que el profe invente uno (mismo
criterio que `tema` en 0015).

### `plan_fisico` — un archivo importado

`plantel_id`, `nombre_archivo`, `hash_archivo`, `advertencias jsonb`.

- **`unique (plantel_id, hash_archivo)`, no por club.** Si U15 y U17 hacen la
  misma rutina, el profe la sube para las dos. Reimportar el mismo archivo en la
  **misma** categoría falla con mensaje claro, que es lo que hay que evitar.
- **El hash no va a `importacion`.** Hoy una fila de `importacion` sin `partido`
  significa "algo se rompió a mitad de camino" — justo el estado que la RPC de
  0005 vino a cerrar. Si el plan físico reusa esa tabla, ese diagnóstico se
  pierde.
- Sin columna de mes ni de rango de fechas: las fechas están en las sesiones.

### `sesion_fisico` — un día de entrenamiento

`plan_id`, `fecha`.

- **Sin `dia_semana`:** se deriva de la fecha. Guardarlo es guardar dos veces el
  mismo dato y dejar que se contradigan.
- **Sin `unique (plan_id, fecha)`:** si un archivo repitiera una fecha, la
  constraint abortaría el import entero con un mensaje opaco. El archivo se
  guarda como es; el parser ya avisa de lo que no cierra.

### `ejercicio_asignado` — una línea de la rutina

`sesion_id`, `ejercicio_fuerza_id` (nullable), `orden`, `bloque`,
`nombre_original`, `series`, `reps`, `carga_sugerida`, `pausa`, `notas`,
`escalon_kg`.

- **`ejercicio_fuerza_id` nullable es el estado "pendiente".** La FK compuesta
  `(club_id, ejercicio_fuerza_id)` usa MATCH SIMPLE (el default): con la columna
  en NULL no se chequea nada, y con valor obliga a que el club coincida. Es
  exactamente el comportamiento que hace falta.
- **`nombre_original`** es el texto exacto del archivo, igual que
  `estadistica_jugador_partido.nombre_crudo`: es lo que permite auditar contra
  el original y lo único que queda si el nombre nunca se resuelve.
- **`reps`, `carga_sugerida` y `pausa` son `text`**, porque el archivo dice
  `5xL`, `45''`, `Fallo-2`, `PC`, `Barra + Disc`. Convertirlos a número sería
  fabricar precisión que el dato no tiene.
- **`escalon_kg` queda siempre NULL y la RPC no lo escribe** ni aunque venga en
  el payload. Dos avisos: (1) es el manejo de peso, que depende de cuentas de
  jugador, hoy bloqueadas; (2) esta columna guarda **un** valor por línea de
  rutina, o sea para todo el grupo. El escalón individual del que hablamos es
  por jugador, y cuando se destrabe va a necesitar su propia tabla. Esta columna
  no es esa.

---

## 4. RLS

Mismo patrón que 0016, sin excepciones nuevas.

| Tabla | Camino al plantel | Lectura | Escritura |
|---|---|---|---|
| `plan_fisico` | `plantel_id` directo | `puede_ver_plantel` | `puede_escribir_plantel` |
| `sesion_fisico` | vía `plan_id` | la del plan | la del plan |
| `ejercicio_asignado` | vía `sesion_id` → `plan_id` | la del plan | la del plan |
| `ejercicio_fuerza` | — (nivel club) | cualquier miembro del club | sólo `es_entrenador` (desde 0017; la columna `rol` ya no existe) |

La biblioteca queda a nivel club por la misma razón que `ejercicio` en 0015: el
beneficio de cargarla es que quede para todos. El coordinador la lee y no la
escribe, que es la regla de 0016.

`ejercicio_asignado` lleva policy de `update` aunque esta etapa no actualice
nada: es lo que va a necesitar la pantalla que resuelva pendientes más adelante
(ver sección 8). `ejercicio_fuerza` **no** lleva update ni delete — todavía nada
los usa, y se agregan cuando haya quién.

---

## 5. La RPC — `0021_rpc_importar_plan_fisico.sql`

`importar_plan_fisico(payload jsonb)`, `security invoker`, mismo molde que
`importar_partido`: una llamada RPC vía PostgREST es una transacción, y
cualquier excepción aborta todo.

Orden adentro: primero las entradas nuevas de biblioteca (las referencian los
ejercicios), después el plan, después las sesiones y sus ejercicios. Las claves
nuevas se resuelven con una tabla temporal `on commit drop`, igual que
`jugadores_resueltos` en 0005.

```
{
  clubId, plantelId, nombreArchivo, hashArchivo, advertencias: [...],
  ejerciciosNuevos: [ { clave, nombre, bloque, link } ],
  sesiones: [ {
    fecha,
    ejercicios: [ {
      orden, bloque, nombreOriginal, series, reps, cargaSugerida, pausa, notas,
      ejercicioFuerzaId,   // id existente, o null
      claveNueva           // clave de ejerciciosNuevos, o null
    } ]
  } ]
}
```

Un ejercicio con los dos en null es un pendiente, y es válido.

| Error | Cuándo |
|---|---|
| `PLAN_DUPLICADO` | Ya se importó ese archivo en esa categoría. |
| `EJERCICIO_DUPLICADO` | Un alta nueva choca con una `clave` que ya está en la biblioteca. |
| `PLAN_VACIO` | El payload no trae ninguna sesión: un import vacío es un bug, no un estado. |

Devuelve `{ planId, sesiones, ejercicios, pendientes }` para que la pantalla de
resultado no tenga que recontar.

---

## 6. La función pura — `src/data/prepararPayloadPlanFisico.js`

Sin red, sin cliente de base, sin generar ids; mismo molde que
`prepararPayloadImportacion`. Firma:

```
prepararPayloadPlanFisico(resultadoParser, bibliotecaDelClub, decisiones, contexto)
  → { error, payload }
```

- Reconcilia la biblioteca del archivo contra `bibliotecaDelClub` por `clave`.
- Aplica las decisiones del profe, que son **por nombre normalizado, no por
  ocurrencia**: resolver "Press Plano" una vez resuelve las 6 apariciones.
- Una decisión puede ser `existente` (id de la biblioteca), `nueva` (bloque +
  nombre + link) o ausente, que significa pendiente.
- Normaliza los nombres de las altas nuevas con `clavearNombre`, importada del
  parser: una sola fuente para el criterio, igual que hace `parserFisico`.

Devuelve `error` (nunca lanza) si: el parser trajo errores; una decisión apunta
a un id que no está en la biblioteca; un alta nueva choca con una clave
existente (hay que elegir la existente, no crear un duplicado); o falta
`clubId`, `plantelId` o `hashArchivo`.

---

## 7. La pantalla

Una sola pantalla nueva, `p-plan-fisico` (`src/ui/pantallas/planFisico.js`), con
pasos que se renderizan en el mismo contenedor y un objeto de estado — igual que
`confirmacionImport.js`.

1. **Archivo y categoría.** Punto de entrada en DATOS, al lado de "Cargar
   partido", con su propio `<input type="file">`. La categoría arranca en la del
   chip del chrome y se muestra con todas las letras ("se guarda en U17M"), con
   opción de cambiarla: importar escribe, y escribir en la categoría equivocada
   no se deshace desde la app.
2. **Preview.** Cuántas sesiones y de qué fechas, cuántos ejercicios, las
   advertencias del parser tal cual las devuelve, y cuántos nombres hay para
   resolver.
3. **Resolución.** Un grupo colapsable (`.grupo`, el de `confirmacionImport`)
   con una fila por nombre sin resolver. Cada fila: buscar en la biblioteca,
   crear nuevo, o dejar pendiente (que es el default). Un contador arriba dice
   cuántos quedan.
4. **Confirmación y resultado.** "Se guardaron N sesiones y M ejercicios; K
   quedaron sin link."

Reusa `.grupo`, `.jug-sugerencia`, `.campo`, `.al`, `.pie-fijo` y `.btn`. CSS
nuevo sólo si algo no existe, y cualquier breakpoint va en `layout.css` (regla
del proyecto). Todo lo táctil ya llega a 44px porque `--tap` es el `min-height`
de `.btn`, `.opt` y `.campo`; nada depende de `hover`.

---

## 8. Consecuencias de "permitir guardar con pendientes"

Elegimos que el profe pueda guardar sin resolver los 43. Hay que decir qué
implica, porque no es gratis:

- **Esta etapa no construye la pantalla para resolverlos después.** El plan
  queda guardado y completo (nombres, series, reps, pausas); lo que falta en
  esos 57 ejercicios es el link al video.
- **Y no se arregla reimportando:** el mismo archivo en la misma categoría choca
  con el hash. Hasta que exista esa pantalla, un pendiente se resuelve por SQL.
- **El arreglo más barato sigue siendo el archivo.** Si el club completa la hoja
  "Ejercicios" del `.xlsx` con los 43 nombres que faltan, el import siguiente
  entra con cero pendientes y sin escribir una línea de código. La pantalla de
  resolución es la red, no el plan A.

---

## 9. Fuera de alcance

Nada para que el jugador vea su rutina o marque completado. Ninguna pantalla
para editar `escalon_kg`. Ningún matcheo automático por similitud (Levenshtein
existe en `mapearImportacion.js` para nombres de jugador y **no** se usa acá: en
ejercicios, "Press Plano" y "Press Banca" están a poca distancia y son cosas
distintas). Las hojas "Intermitente". Tocar `parserFisico.js`. Leer el plan
guardado desde la app. El layout de PLANTEL y DATOS más allá del botón nuevo.

---

## 10. Cómo se verifica

- Migración y RPC aplicadas en el Docker local, nunca contra producción.
- `tests/prepararPayloadPlanFisico.test.js`: la función pura, sin base.
- `tests/verificarImportarPlanFisico.js`: contra el Docker local, con un payload
  roto a propósito (un `ejercicioFuerzaId` inexistente) para confirmar que no
  queda ninguna fila parcial, y una segunda importación del mismo archivo para
  confirmar `PLAN_DUPLICADO`.
- `tests/rollbackPlanFisico.sql`: deshace 0020 y 0021 para poder reintentar en
  local.
- Import del `Físico.xlsx` real de punta a punta, contando las filas en la base.
- La pantalla mirada a 375px con el banco de pruebas.
