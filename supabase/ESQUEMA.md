# ESQUEMA.md — Modelo de datos

Estado al día de la migración `0019_nombre_y_categorias.sql`, más la sección de
escalones de fuerza de `0023_escalones_fuerza.sql`, el inventario de
`0026_material.sql`, la cuenta de jugador de `0029` y `0030` y los errores del
cliente de `0031_error_cliente.sql` y las jugadas de `0035_jugadas.sql`. Las tablas del plan físico de 0020–0022
todavía no están documentadas acá (ver la Tarea 7 del
plan de import), y `recurso`/`envio_recurso`/`apertura_recurso` (0009, 0033, 0034) tampoco tienen sección propia todavía.

- `recurso`: desde 0042, quien lo creó puede borrarlo (`recurso_borrar_lo_propio`); se lleva puesto `envio_recurso` y `apertura_recurso` por `on delete cascade`.

## Diagrama en texto

```
club (1) ──< temporada (1) ──< plantel >── (N) pertenencia >── (1) jugador
  │                                │                                  │
  │                                └──< partido                       │
  │                                        │                          │
  │                                        └──< estadistica_jugador_partido
  │                                                      │
  │                                                      └── (referencia) jugador
  │
  ├──< miembro_club >── auth.users
  │          │
  │          └──< asignacion_plantel >── plantel
  ├──< cuenta_jugador >── auth.users      (el jugador, 0029; nunca en miembro_club)
  ├──< solicitud_jugador >── plantel      (el pedido de acceso, 0029)
  └──< importacion ──(1:1)── partido

categoria (catálogo global, sin club_id) ──< plantel
```

- Un `club` tiene muchas `temporada`s, cada `temporada` tiene muchos `plantel`es (uno por categoría).
- Un `jugador` pertenece a un `club` para siempre; su relación con un `plantel` en una `temporada` puntual vive en `pertenencia`, y puede tener varias a la vez (citado a más de una categoría).
- Un `partido` pertenece a un `plantel` (la categoría que jugó) y nace de exactamente una `importacion` (relación 1:1).
- `estadistica_jugador_partido` es la fila de planilla de un jugador propio en un partido puntual — el número de camiseta y el nombre crudo de ESE partido viven acá, no en `jugador`.

## Tablas

### `club`
El club. Multi-club desde el día uno aunque el piloto sea uno solo.
- `id`, `nombre`.

### `temporada`
Una temporada de un club (p.ej. "2026"). `unique(club_id, nombre)`.

### `plantel`
Un plantel: una categoría dentro de una temporada de un club (p.ej. "U21M 2026").
- `codigo_cabb`: mapeo sugerido desde la categoría que trae el título del parser (`U21M`, `U17M`, ...). Nunca se usa para asignar sola — si no matchea ningún plantel, el import (Etapa 2B) le pregunta al entrenador.
- `unique(club_id, temporada_id, categoria)`.
- Newell's tiene sus seis categorías en la temporada 2026 desde 0019: `U13M`, `U15M`, `U17M`, `U21M`, `MAY_M`, `MAY_F`. Las cuatro agregadas en 0019 tienen `codigo_cabb` en NULL porque no se conoce el texto exacto de sus planillas; el import pregunta a qué categoría va el partido. No hay flujo en la app para crear categorías: se hace por SQL.
- `categoria_codigo` (0016): FK a `categoria`. **Es la fuente de verdad.** `categoria` quedó como columna espejo con los mismos valores: el `unique` de arriba cuelga de ella y la UI la lee en chips, títulos y toasts, así que sacarla requiere tocar `src/ui/` y es una tarea aparte.

### `jugador`
**Decisión central del esquema:** único por `club_id` + `nombre_clave` + `desambiguador`, **nunca** por plantel/categoría.

Razón: si la unicidad fuera por plantel, un chico citado de U17 a U21 generaría dos perfiles de jugador distintos, y se rompería la trazabilidad de por vida que es la razón de existir de la app (el problema de negocio es la pérdida de memoria institucional cuando cambia el cuerpo técnico). `desambiguador` (default `''`) existe únicamente para el caso real de homónimos dentro del mismo club — lo resuelve el entrenador a mano, no el sistema.

El número de camiseta **no** vive acá — está verificado (Etapa 1) que cambia entre partidos para el mismo jugador, así que no es un dato de identidad.

### `pertenencia`
La membresía de un jugador a un plantel en una temporada, con rango `desde`/`hasta` (`hasta` NULL = vigente). Un jugador puede tener más de una pertenencia vigente a la vez (citado a dos categorías) — es el caso normal en inferiores, no una excepción.

- `cerrado_por` (0040): quién lo sacó del plantel. Mismo mecanismo que `asignacion_plantel` — el cliente manda cualquier `hasta` para pedir el cierre, y el trigger `pertenencia_sellar_cierre` lo pisa con la fecha de hoy y `auth.uid()`, sin RPC nueva (la tabla ya tenía grant de update completo desde 0006). No borra la ficha ni su historia; si el jugador vuelve, se lo suma de nuevo en vez de duplicarlo.

### `miembro_club`
`(user_id, club_id)`, PK compuesta. Dice **a qué club** pertenece una cuenta y **con qué rol**; a qué categorías dentro de ese club lo dice `asignacion_plantel`. **Es sólo del cuerpo técnico.** Los jugadores tienen cuenta propia desde 0029, pero en otra tabla (`cuenta_jugador`, abajo): un jugador nunca es staff y el check de esta tabla no se toca.

- `es_entrenador`, `es_coordinador` (0017), con `check (es_entrenador or es_coordinador)`. Una persona puede tener los dos. Son dos booleanos y no un rol de texto porque son exactamente dos roles fijos: se leen en una policy sin join, y el check hace imposible una membresía sin rol. La columna `rol` de 0016 se eliminó en 0017.
- `habilitado_por`, `habilitado_en`: quién y cuándo, cuando se habilita desde el panel. Null = a mano por SQL, o antes de 0017.

### El nombre de cada persona (0019)

**No vive en ninguna tabla de `public`:** está en los metadatos del usuario de Supabase Auth, `auth.users.raw_user_meta_data->>'nombre'`.

- Se escribe al crear la cuenta (`signUp` con `options.data`). En ese momento no hay sesión si el proyecto exige confirmar el mail, así que ninguna tabla podía recibirlo: una tabla propia sólo sumaba un trigger sobre `auth.users`, policies y una copia más.
- La persona lo edita con `auth.updateUser` desde Mi perfil. No puede tocar el de otro.
- Los demás lo leen sólo por `nombres_del_club`, `miembros_del_club` y `usuarios_pendientes`, que exigen ser del club o coordinación.
- Toda cuenta nueva sin nombre (en la práctica, la primera entrada con Google) pasa por un paso único antes de entrar. Las cuentas que existían antes de 0019 y no tenían nombre quedaron con `cuenta_anterior_al_nombre: true` y no se las frena.
- `perfil_entrenador` (0015) quedó **obsoleta**: 0019 copió sus nombres a los metadatos y la app ya no la lee ni la escribe. Se conserva para no perder datos.

### `categoria`
Catálogo global de categorías: `(codigo, nombre, orden)`. **No lleva `club_id`** y no es una tabla de dominio.

Tabla y no un `enum` de Postgres: un `enum` obliga a una migración cada vez que alguien quiere agregar una categoría, y al replicar a otros clubes cada uno tiene su propia grilla. El `codigo` es interno (`U13M`, `U15M`, `U17M`, `U21M`, `MAY_M`, `MAY_F`); el matcheo contra los títulos de la CABB lo sigue haciendo `plantel.codigo_cabb`. `orden` va de 10 en 10 para poder intercalar sin renumerar.

Lectura para cualquier autenticado, sin escritura: agregar una categoría es un acto administrativo.

### `asignacion_plantel`
Qué planteles ve y edita un entrenador: `(miembro_club_user_id, miembro_club_club_id, plantel_id)`, con historia (0017):

- `desde`, `hasta` (null = vigente). **Única vigente** por persona y plantel (índice único parcial `where hasta is null`); las cerradas pueden repetirse, así alguien que vuelve a una categoría que ya tuvo suma una fila.
- `asignado_por`, `cerrado_por`, `origen` (`panel` | `manual` | `migracion`).
- **No se borran, se cierran.** Es memoria institucional: dentro de dos años tiene que poder saberse quién estuvo a cargo de una categoría. Estructuralmente: sin policy ni grant de `delete`; `insert` sólo de `(miembro_club_user_id, miembro_club_club_id, plantel_id)`, así `desde` no se puede antedatar; `update` sólo de `hasta`, y el trigger `asignacion_sellar_cierre` pone `hasta = now()` y `cerrado_por = auth.uid()` sin importar lo que mande el cliente, y rechaza tocar una fila ya cerrada.
- Las dos FK son `on delete restrict` desde 0017 (antes cascade): borrar una membresía por SQL no puede llevarse la historia.
- Al cerrar una asignación, lo que esa persona cargó queda en el club: ninguna tabla de datos referencia a la asignación.

**Se asigna a un `plantel`, no a una `categoria`.** Un profe puede tener U15M una temporada y U17M la siguiente; asignar a categoría arrastraría el acceso entre temporadas, mientras que asignar a plantel hace que caduque con la temporada — que es el comportamiento correcto cuando se trata de datos de menores. El costo asumido es reasignar cada temporada.

Apunta a la PK compuesta de `miembro_club` porque esa tabla no tiene un `id` de una sola columna. La segunda FK, `(club_id, plantel_id)`, obliga a que el club del plantel sea el mismo de la membresía.

Sólo un coordinador escribe acá, y nunca sobre sí mismo. Ver "Policies del coordinador" abajo.

### `importacion`
Un registro de "este archivo .xlsx se procesó". Guarda:
- `hash_archivo` (SHA-256 de los bytes del archivo): defensa **principal** contra reimportar el mismo partido — sobrevive el renombrado (p.ej. un archivo reenviado por WhatsApp con otro nombre tiene el mismo hash).
- `id_partido_cabb` (nullable): refuerzo secundario, viene del nombre de archivo real de la CABB cuando matchea el patrón (ver `PARSER.md`).
- `advertencias` (jsonb): las advertencias que devolvió el parser para este archivo. Sirven para dos cosas: detectar que la CABB cambió el formato de exportación, y (a futuro) mostrarle al entrenador qué tan confiable es una planilla.
- `unique(club_id, hash_archivo)`.

### `partido`
Un partido, siempre asociado a exactamente una `importacion` (`unique(importacion_id)`) y a un `plantel` (la categoría propia que jugó). No tiene fecha propia del archivo — el archivo de la CABB nunca trae fecha; la carga el entrenador al confirmar el import (Etapa 2B).
- `condicion_propia`: `'local'` o `'visitante'` — cuál de los dos bloques del archivo es el del club propio. Lo decide el entrenador en la pantalla de confirmación (Etapa 2B); nunca se infiere comparando nombres de club.
- `rival_nombre`, `puntos_propios`, `puntos_rival`: del bloque rival **no se guarda ningún jugador**, sólo esto. El nombre del rival es información pública de competencia; los `puntos_*` son nullable porque si el parser no pudo leer la fila `TOTALES` de ese bloque (advertencia `SIN_TOTALES`), el marcador real es "no se sabe", no `0`.

### `estadistica_jugador_partido`
Todo lo que trae el parser para un jugador **propio** en un partido: minutos en segundos, puntos, los tres tipos de tiro con anotados/intentados/porcentaje, rebotes, asistencias, recuperos, pérdidas, tapones cometidos/recibidos, faltas cometidas/recibidas, valoración y diferencial — cada campo numérico nullable de forma independiente, igual que en el contrato del parser (`PARSER.md`): un `NULL` significa "no se pudo leer", nunca se confunde con `0`.
- `numero`: el número de camiseta de ESE partido (nunca en `jugador`).
- `nombre_crudo`: el string exacto del archivo para esa fila, para poder auditar contra el original.
- `unique(partido_id, jugador_id)`: una sola fila de estadística por jugador por partido.

### `paso_fuerza` (0023 como `escalera_fuerza`, renombrada en 0024)
Cuánto sube o baja de peso un ejercicio de fuerza por vez —el **"escalón"** que
dice la pantalla—, **uno para todo el club**: `(club_id, clave, nombre, paso
numeric)`, único por `(club_id, clave)`.

- `clave` es `clavearNombre` del nombre de la línea del plan: una línea y su
  escalón coinciden sólo por nombre normalizado exacto. Es independiente de
  `ejercicio_fuerza` (el anexo de videos): un ejercicio sin video puede tener
  escalón y viceversa.
- `paso` en kg, mayor que cero, con decimales (2,5 kg es un escalón real). Lo
  escribe el profe en la app; ni el archivo ni la app lo proponen. **Nulo =
  todavía sin definir**: la fila existe para colgarle los movimientos, el peso de
  cada chico se escribe igual y no hay + ni −. Así es como la crea el import
  cuando siembra el peso inicial de un ejercicio nuevo (0025).
- 0024 la renombró (con su índice, su trigger, sus policies y sus constraints) y
  cambió `pesos numeric[]` por `paso`: una lista de pesos válidos resultó no ser
  cómo trabaja el profe. Se fue con ella la función `pesos_validos`. La tabla
  estaba vacía en producción y en local, y la migración se frena si no lo está.
- La lee cualquier miembro del club y la escriben los entrenadores. El update
  está otorgado sólo sobre `paso`; `actualizado_por` y `actualizado_en` los pone
  un trigger. Sin delete.

### `movimiento_escalon` (0023)
Cada vez que el profe le anota, sube o baja el peso a un chico en un ejercicio:
`(club_id, jugador_id, escalera_id, kg, creado_por, creado_en, orden)`.

- **Sólo inserts.** Sin update ni delete: un error se corrige con otro
  movimiento, y la historia queda completa.
- **El primer movimiento de cada chico lo siembra el import** (0025), con el
  número de la carga sugerida del archivo, y sólo donde todavía no hay nada: una
  progresión ya empezada no se pisa. El resto los escribe el profe desde la
  pantalla de escalones.
- `escalera_id` apunta a `paso_fuerza` y **conserva el nombre de 0023 a
  propósito** (0024): cambia la tabla a la que apunta, no la historia ya escrita.
- `kg` absolutos: si el escalón del ejercicio cambia, la historia sigue diciendo
  lo mismo. Lo único que valida la base es `kg > 0`.
- `orden` (identity) define cuál es el último; `creado_en` es para mostrar.
- El peso es del jugador y del ejercicio, no del plan ni de la categoría: se
  conserva de por vida, igual que `jugador` es del club y no de un plantel.
- RLS como `medicion_corporal`: por pertenencia vigente y plantel asignado.
  Coordinación no lo ve.

### `escalon_actual` (vista, 0023)
El último movimiento de cada `(jugador_id, escalera_id)`. Con
`security_invoker = true`: aplica la RLS de `movimiento_escalon` con los permisos
de quien consulta. Es la primera vista del esquema.

### `ejercicio_asignado.escalon_kg` (eliminada en 0023)
Guardaba un número por línea, o sea para todo el grupo, y nunca se escribió. El
peso de cada jugador vive en `movimiento_escalon`.

### `solicitud_jugador` (0029)
Un chico que se registró pide entrar a una categoría: `(id, user_id, club_id, plantel_id, estado, creado_en, resuelto_por, resuelto_en)`.

- `estado`: `pendiente` | `aprobada` | `rechazada`. Índice único parcial: **una sola pendiente por cuenta**. Las resueltas pueden repetirse (a quien le rechazaron una por error le queda pedir de nuevo).
- **No guarda el nombre.** Ya está en los metadatos de Auth (0019), y una copia más del nombre de un menor no aporta nada; `solicitudes_del_plantel()` lo lee de ahí, como `usuarios_pendientes()`.
- El chico no lee ni escribe la tabla: crea la solicitud con `crear_solicitud_jugador()` y ve la suya con `mi_solicitud_jugador()`. La leen y la resuelven los entrenadores con asignación vigente al plantel de la solicitud (`puede_escribir_plantel`).
- Update otorgado sólo sobre `estado`; un trigger sella `resuelto_por` y `resuelto_en`, y una solicitud resuelta no se vuelve a tocar. Sin insert directo ni delete.
- `fecha_nacimiento` (0041): la escribe el chico al pedir acceso — `crear_solicitud_jugador()` la exige, a diferencia del nombre acá no hay "no se sabe" razonable. El profe la ve precargada en `solicitudes_del_plantel()` y la puede corregir antes de confirmar; `aprobar_solicitud_jugador()` también la exige al crear una ficha nueva. Sin grant de select, como `codigo` (0037): sólo la leen las funciones.

### `cuenta_jugador` (0029)
Qué cuenta de Auth ve a qué jugador: `(id, user_id, club_id, jugador_id, desde, hasta, aprobado_por, revocado_por)`.

- **Con historia, como `asignacion_plantel`.** Únicos parciales `where hasta is null`: una cuenta vigente por jugador y una por cuenta. **No se borra, se cierra**: dentro de dos años tiene que poder saberse quién le dio acceso a qué chico. Sin delete; el cierre lo sella un trigger (`hasta = now()`, `revocado_por = auth.uid()`) y una fila cerrada no se toca.
- Vincular es un insert de `(user_id, club_id, jugador_id)` y la policy exige una **solicitud pendiente de esa misma cuenta** y una ficha con **pertenencia vigente al plantel al que pidió entrar**. Lo hace `aprobar_solicitud_jugador()`; el sistema nunca compara nombres para decidir qué ficha es cuál, lo decide el profe.
- La leen y la cierran los entrenadores de los planteles del chico. Ni coordinación ni el propio chico.

### La lectura del jugador (0030): funciones, no tablas
**El jugador no tiene `select` sobre ninguna tabla de dominio.** Comparte el rol `authenticated` con el cuerpo técnico, pero todas las policies de datos de jugador exigen ser miembro del club, así que consultando cualquier tabla obtiene cero filas (`categoria`, el catálogo global, es la excepción: no lleva datos de nadie). Lee por cuatro funciones `security definer` con `set search_path = ''`, todas arrancando por `mi_jugador()` (`auth.uid()` → `jugador_id` con cuenta vigente, o null; interna, no se otorga):

| Función | Devuelve |
|---|---|
| `mi_ficha()` | club, nombre propio y planteles con pertenencia vigente. Null si no hay cuenta vigente: es lo que arranca la app. |
| `mis_recursos()` | sólo los `envio_recurso` dirigidos a él. |
| `mi_plan()` | por cada plantel suyo, el plan vigente (mismo criterio que `elegirPlanVisible`) con sus sesiones y líneas, más `pesos`: **su** último peso en cada ejercicio, con la clave para unirlo a la línea en el cliente (`clavearNombre` es JS y no se reproduce en SQL). |
| `mi_progreso()` | `partidos`, `tiro`, `saltos` (0044: por sesión, `test` e `intentos` con `tiempoVueloMs`) y `escalones`, todo propio. Sin medidas corporales, sin promedios ni nombres de otros. |

Con la cuenta cerrada devuelven null o cero filas, y no se borra nada. `src/data/accesoJugador.js` declara todo lo que 0029 y 0030 otorgan con `grant execute`, y `tests/contratoAccesoJugador.test.js` falla si aparece un grant que no está ahí. Sumar una función para el jugador es una RPC, una pantalla y una línea en `TABS_JUGADOR`; sacarla es `revoke execute`.

### `material` (0026)
El inventario de material del club: una fila por variante, con `cantidad` en
unidades sueltas (dos mancuernas de 10 kg son `cantidad = 2`).

- `tipo`: lista cerrada — `mancuerna`, `disco`, `barra`, `pesa_rusa`,
  `balon_medicinal` (con peso obligatorio), `pelota`, `cono`, `soga`,
  `escalerita`, `banda` (sin peso) y `otro` (peso opcional, `detalle`
  obligatorio como nombre). Sumar un tipo es una migración: el tipo decide si
  lleva peso y si se combina (sólo `disco`), y el cruce futuro con los
  ejercicios busca por tipo.
- `peso_kg`: de **una** unidad, `numeric`, como `paso_fuerza.paso`.
- `detalle`: lo que distingue dos filas del mismo tipo ("N° 7", "EZ"); `''` si
  no hace falta.
- Único por `(club_id, tipo, peso_kg, lower(detalle))` con `nulls not
  distinct`: la segunda carga de una variante es editar la primera.
- **Lo que ya no se tiene se borra**, no se archiva: la tabla dice lo que hay
  hoy, y ninguna consulta tiene que acordarse de filtrar bajas.
- `actualizado_por`/`actualizado_en` los sella un trigger; `creado_*` por
  default.
- La lee cualquier miembro del club; la escribe sólo `es_coordinador_de`, tenga
  o no además el rol de entrenador. Insert y update con grant por columna: el
  tipo y el club de una fila no cambian.

### `jugada` y `jugada_plantel` (0035)
La pizarra táctica del club (spec `docs/superpowers/specs/2026-09-21-jugadas-design.md`). No hay datos de menores.

- `jugada`: `nombre` (≤ 150), `tipo` (`ataque`, `presion`, `defensa`, `lateral`, `otro`, igual que `TIPOS_JUGADA`) y `datos jsonb` con la jugada entera (cancha, fichas, pelota y pasos). **La forma de `datos` la valida `src/data/jugadas.js`**. La base sólo impone que sea un objeto, que no pase de 65536 bytes (`TOPES.bytes`, medido sobre `datos::text`) y que ninguna `pasos[].nota` pase de 300 caracteres (`jugada_notas_validas`, inmutable). `tests/contratoJugada.test.js` compara los números con el JS.
- La ve todo el cuerpo técnico del club (`es_entrenador_de`); la crea cualquier entrenador y **sólo el autor** la edita o la borra (quien quiera otra versión la duplica). Update por columna: `nombre`, `tipo`, `datos`. Un trigger sella `creado_por`, `creado_en` y `actualizado_en`, y no deja cambiar `club_id`. Sin `actualizado_por`: siempre sería el autor.
- `jugada_plantel` (`club_id`, `jugada_id`, `plantel_id`, PK de los dos ids, FKs compuestas por club): a qué planteles se le muestra. La escribe quien tiene el plantel a cargo (`puede_escribir_plantel`), sea o no el autor: asignar no modifica la jugada. No se edita: se borra y se vuelve a crear. Borrar la jugada borra sus asignaciones (cascade).
- El jugador no tiene acceso a las tablas: lee por `mis_jugadas()` (`security definer`, arranca por `mi_jugador()`), que devuelve `jugada_id`, `nombre`, `tipo` y `datos` de lo asignado a sus planteles con pertenencia vigente. Nunca el autor. No está en `accesoJugador.js` porque ese contrato es de 0029 y 0030; lo cubre `contratoJugada.test.js`.
- Verificación contra la base: `tests/verificarJugadas.sql` en el SQL Editor.

### Salto: `medicion_salto` y pierna en `medicion_corporal` (0043)
CMJ y Abalakov medidos con video en cámara lenta (spec `docs/superpowers/specs/2026-09-23-evaluacion-salto-design.md`). El video nunca llega a la base.

- `sesion_medicion.tipo` suma `salto`, y `test_salto` (`cmj` | `abalakov`) es obligatorio sólo en ese tipo (`(tipo = 'salto') = (test_salto is not null)`). Una sesión es de un solo test.
- `medicion_salto`: `intento` (1–3), `tiempo_vuelo_ms` (`numeric(6,2)`, 100–1000) y `fps_captura` (120–960), `unique (sesion_id, jugador_id, intento)`. **Se guarda el dato crudo, nunca la altura**: `src/data/salto.js` la calcula (y la potencia), así corregir una fórmula recalcula todo el histórico. `tiempo_vuelo_ms` NULL = ausente, en una sola fila (intento 1) y sin fps.
- RLS por el plantel de la sesión, como `medicion_tiro`; el insert exige además que la sesión sea de tipo `salto`. `revoke all` + `select` + `insert` por columna, sin update ni delete. Un trigger sella `creado_por` y `creado_en`.
- `medicion_corporal` suma `pierna_cm` (L0, 60–130) y `pierna_flexionada_cm` (hpush, 30–110), `numeric(4,1)` y nullable, con la flexionada menor que la extendida. Son para la potencia de Samozino; como el peso, el jugador no las ve.
- `guardar_sesion_medicion` (0044) suma la rama `salto`: `testSalto` obligatorio (y prohibido en tiro), mediciones `{ jugadorId, intento, tiempoVueloMs, fpsCaptura }`, misma idempotencia por `sesionId` de 0038 (el reintento tiene que coincidir también en el test).
- `tests/contratoSalto.test.js` compara los rangos con `salto.js` y `antropometria.js`; `tests/contratoRpcSalto.test.js`, que 0044 no haya perdido ninguna rama de 0038 ni ninguna garantía de 0030.

### Sin velocidad (0045)
La medición de velocidad de 0009 (largo de cancha con cronómetro) se borró: daba ruido y lo cargado era de prueba (lo sembraba `tests/sembrarEntrenamientos.js`). 0045 borra `medicion_velocidad` y sus sesiones, deja `sesion_medicion.tipo` en `tiro` | `salto` y reemplaza `guardar_sesion_medicion` y `mi_progreso` sin esa rama ni esa clave. El sprint vuelve rediseñado, por video, con su propia tabla.

## Políticas RLS

Hasta 0015 la autorización era sólo por club: quien tenía una fila en `miembro_club` veía **todos los planteles**. Desde 0016 pasa por la asignación, y **lectura y escritura son ejes separados**. Desde 0018 el coordinador no lee datos individuales.

| | Entrenador | Coordinador (sólo) | Los dos roles |
|---|---|---|---|
| `plantel` (nombre de la categoría) | sus asignadas vigentes | todos los de su club | la unión |
| `jugador`, `pertenencia`, `partido`, `estadistica_*`, `sesion_medicion`, `medicion_*`, `medicion_corporal`, `envio_recurso`, `meta_zona` | sus asignadas vigentes | **nada** | sus asignadas vigentes |
| `jugadores_del_club_para_dedup` | sí | **rechaza** | sí |
| `ejercicio`, `nota_ejercicio`, `recurso`, `perfil_entrenador` | todo el club | todo el club (la UI de coordinación no lo muestra) | todo el club |
| `material` (inventario) | lee todo el club | lee y **escribe** todo el club | lee y escribe |
| Panel: pendientes, miembros, asignaciones, panorama | **rechaza** | su club | su club |
| Habilitar, asignar, cerrar | **nunca** | a otros, en su club | a otros, en su club |
| `solicitud_jugador`, `cuenta_jugador` (0029) | sus planteles asignados | **nada** | sus planteles asignados |

**El jugador** (cuenta en `cuenta_jugador`, no en `miembro_club`) no aparece en ninguna columna de la tabla de arriba: **cero filas en todas las tablas**. Lee sólo por `mi_ficha`, `mis_recursos`, `mi_plan` y `mi_progreso` (0030), y sólo lo suyo.

El coordinador ve el panorama agregado (`panorama_del_club`), que devuelve sólo conteos y sumas, nunca una fila de jugador. Menos gente con acceso a datos de menores, y la coordinación no lo necesita para su función.

Las funciones, todas `security definer` con `set search_path = ''`:

| Función | Qué decide |
|---|---|
| `puede_ver_plantel(uuid)` | entrenador con asignación vigente a ese plantel (0018; en 0017 también el coordinador) |
| `puede_escribir_plantel(uuid)` | entrenador con asignación vigente a ese plantel |
| `es_coordinador_de(club)`, `es_entrenador_de(club)` | el rol de quien llama en ese club |
| `usuarios_pendientes()` | cuentas con mail confirmado y sin club, con su nombre; sólo coordinación |
| `miembros_del_club(club)` | membresías con mail y nombre; sólo coordinación de ese club |
| `nombres_del_club(club)` | el nombre de cada miembro, para la autoría de ejercicios y notas; cualquier miembro de ese club (0019) |
| `clubes_para_solicitar()` | el catálogo de clubes y categorías vigentes (los de la temporada de nombre más alto) para el formulario "Soy jugador de un club"; sólo cuentas sin club (0029) |
| `crear_solicitud_jugador(club, plantel)`, `mi_solicitud_jugador()` | quien no es staff ni tiene cuenta, con mail confirmado y una sola pendiente; el plantel debe ser de la temporada vigente (0029) |
| `solicitudes_del_plantel(plantel)` | el entrenador de ese plantel; el nombre que escribió el chico sale de los metadatos de Auth (0029) |
| `panorama_del_club(club)` | por plantel: jugadores, partidos, última medición; tiro de batería sumado por (sesión, posición); y desde 0022, tiro en partidos sumado por partido (triples y libres, anotados e intentados de a pares, con el rival). Sin porcentajes: los calcula `estadisticas.js` |

**Límite conocido:** `usuarios_pendientes()` muestra a cualquier coordinador todas las cuentas sin club de la plataforma. Con un solo club (hoy) es exacto. Desde 0029 no lista a quien ya tiene una cuenta de jugador vigente: sin ese filtro, un chico figuraría entre los "pendientes de habilitar", a un toque de quedar como entrenador con acceso a datos de otros menores. `clubes_para_solicitar()` tiene el límite equivalente. Ver `docs/COORDINACION.md`.

Las funciones invoker de 0029 (`aprobar_solicitud_jugador(payload)`, `rechazar_solicitud_jugador(id)`, `revocar_cuenta_jugador(jugador)`) quedan sujetas a RLS: un entrenador sin asignación al plantel de la solicitud ni siquiera la ve. `aprobar_solicitud_jugador` hace en **una transacción** los dos caminos —`{solicitudId, jugadorId}` vincula a una ficha del plantel; `{solicitudId, nombreClave, nombreLimpio}` crea la ficha, su pertenencia vigente y vincula— y falla con `JUGADOR_YA_EXISTE`, `JUGADOR_YA_TIENE_CUENTA`, `FICHA_FUERA_DEL_PLANTEL` o `SOLICITUD_NO_ENCONTRADA`, sin dejar nada a medias.

Son `security definer` por obligación, no por comodidad: se llaman desde las policies de las tablas de dominio y consultan `plantel`, así que como `invoker` la consulta a `plantel` quedaría sujeta a la policy de `plantel`, que llama a esta función — recursión infinita.

**Cómo llega cada tabla a su plantel:**

| Camino | Tablas |
|---|---|
| `plantel_id` directo | `plantel`, `pertenencia`, `partido`, `sesion_medicion`, `meta_zona` |
| vía `partido_id` | `estadistica_jugador_partido` |
| vía `sesion_id` | `medicion_tiro`, `medicion_salto` |
| vía `pertenencia` del jugador | `jugador`, `medicion_corporal`, `envio_recurso` |

Un chico citado en dos categorías tiene dos pertenencias vigentes: con que **alguna** dé acceso alcanza.

**Siguen siendo a nivel club, a propósito:** `club`, `temporada`, `importacion`, `recurso`, `ejercicio`, `nota_ejercicio`, `perfil_entrenador`, `material`. `importacion` porque se inserta **antes** que el partido y en ese momento no hay plantel contra el cual chequear (y no contiene datos de menores: hash, nombre de archivo y advertencias). La biblioteca de ejercicios porque el beneficio que justifica que un profe se tome el trabajo de cargar es que quede para todos: scoparla por plantel la vacía de sentido. `material` porque el inventario es del club entero, no de una categoría ni de un turno.

**Dos formas que no siguen el patrón, y por qué:**

- **`jugador` no chequea plantel en el `insert`**, sólo que quien inserta sea `entrenador` del club. No es una concesión sino una imposibilidad: en `importar_partido` el insert de `jugador` va **antes** que el de `pertenencia`, así que todavía no existe un plantel contra el cual chequear (`alta_jugador_manual` hace lo mismo). Queda expuesto crear filas huérfanas en el club propio; **no** colgarlas de un plantel ajeno —lo bloquea la policy de `pertenencia`— ni volver a leerlas.
- **`jugadores_del_club_para_dedup(club_id)`** es la única excepción a que `jugador` esté scopeado. Con `jugador` por pertenencia, el dedup del import dejaría de ver a un chico citado desde otra categoría y crearía un **duplicado**, rompiendo la trazabilidad de por vida que es la razón de ser de la app. La función devuelve cuatro campos y nada más, rechaza clubes de los que quien llama no es miembro, y devuelve los planteles del jugador **filtrados** a los que puede ver: se aprende que el chico existe en el club y si está en una categoría propia, no en cuáles otras. Desde 0018 exige `es_entrenador`: un coordinador no importa partidos ni da de alta jugadores, y la función expone nombres de chicos.

### Policies del coordinador (0017)

Quién entra a un club, y a qué categorías, lo decide el coordinador. **Un entrenador no tiene ninguna vía**: no hay policy de escritura que lo incluya.

- `plantel_coordinador_ver`: ve los planteles de su club.
- `miembro_club`: además de la fila propia, ve las de su club. **Insert** sólo de entrenadores (`es_entrenador and not es_coordinador`), nunca de sí mismo. Sin update ni delete. Grant de insert sólo por columna `(user_id, club_id, es_entrenador)`.
- `asignacion_plantel`: ve las de su club. **Insert** a otro entrenador del club, nunca a sí mismo. **Update** sólo para cerrar una vigente de otro.

Que el coordinador no pueda asignarse a sí mismo es a propósito: si pudiera, "el coordinador no accede a datos individuales" se saltearía con dos toques. Crear un coordinador, o darle además el rol de entrenador, es SQL (`docs/COORDINACION.md`).

### RPC `asignar_planteles(user, club, plantel_ids[])`

`security invoker`. En una sola transacción: si la persona no tiene membresía en el club, la crea como entrenador (habilitar); si es un coordinador puro, falla con `NO_ES_ENTRENADOR`; asigna cada plantel que no tenga ya vigente. Sin categorías, `SIN_CATEGORIAS`. Si algo falla —RLS, un plantel de otro club— no queda nada, tampoco la membresía. Verificado en `tests/verificarCoordinacion.sql`, caso 8.

Cerrar una asignación es un update de una fila y va directo, sin RPC.

## Límites de largo (0028)

Todo texto que escribe un usuario tiene un `check (char_length(col) <= N)`
(`not valid`, con límites holgados): sin él, un usuario habilitado podía guardar
megabytes en un título o una nota, que se le manda a todo el club en cada
lectura. Los números están en `src/data/limites.js` y
`tests/contratoLimites.test.js` los compara con la migración. Los checks no
revisan lo que ya estaba guardado; para revisarlo:
`alter table <t> validate constraint <c>;`. 0028 también quita a `anon` el
permiso de ejecutar los RPC de escritura.

## Errores del cliente (0031)

`error_cliente` guarda lo que se rompió en el teléfono de un profe y nadie
atrapó: `mensaje`, `stack`, `pantalla`, `agente` (userAgent), `creado_por` y
`creado_en`, más un `club_id` **opcional** (la app puede romperse antes de
saber a qué club pertenece la cuenta).

No es una tabla de datos del club, es diagnóstico, y se comporta distinto a
todas las demás:

- **Sólo insert.** No hay policy de update ni de delete: un log que el que lo
  genera puede editar no sirve. Se limpia desde el dashboard.
- **No la lee nadie desde la app.** Sin policy de select y sin `grant select`:
  se lee con la service role desde el dashboard de Supabase. Es lo más fácil
  de filtrar sin querer —Postgres mete el valor adentro del texto del error,
  `Key (nombre_clave)=(Juan Perez) already exists`—, así que el cliente lo
  depura antes de mandarlo (`src/data/errorDeCliente.js`) y además lo lee la
  menor cantidad de gente posible.
- **Sólo `authenticated`.** Un error en la landing, sin sesión, queda en la
  consola: dejar escribir a `anon` sería un endpoint abierto a internet.
- La policy `error_cliente_propio_agrega` exige `creado_por = auth.uid()` (lo
  pone el trigger de sellado, la columna no se concede) y que el `club_id`, si
  viene, sea uno propio.

Los largos de las columnas de texto son los de `LARGO` en
`src/data/errorDeCliente.js` y los compara `tests/contratoErrorCliente.test.js`
(no van en `limites.js`, que es el espejo exacto de 0028).

### Helper `pertenece_al_club(club_id)` (0031)

`stable security definer`, otorgado a `authenticated`. Verdadero si quien llama
está en `miembro_club` de ese club **o** tiene una `cuenta_jugador` vigente.
Tiene que ser `security definer` porque un jugador no puede leer su propia fila
de `cuenta_jugador` (`cuenta_jugador_ver` es para el staff que ve el plantel).
Devuelve un booleano sobre quien llama, nada más.

## Orden de persistencia de una importación

`src/data/repositorio.js` expone una función por operación de base de datos, sin transacción que las envuelva. Persistir un partido importado requiere, en este orden:

1. Resolver el `jugadorId` de cada jugador propio: `obtenerJugadoresDelClub` + la clasificación de `mapearImportacion` (creando `jugador`/`pertenencia` nuevos donde corresponda, vía `crearJugador`/`crearPertenencia`, para cualquier `jugadoresNuevos`/`sugerencias` confirmadas por el entrenador). Desde 0016, `obtenerJugadoresDelClub` no lee la tabla: llama a `jugadores_del_club_para_dedup` (ver arriba). Su forma de retorno no cambió.
2. `crearImportacion`.
3. `crearPartido`.
4. `crearEstadisticas` al final — requiere que **todos** los `jugadorId` ya estén resueltos (ver la guarda en `repositorio.js`; `estadistica_jugador_partido.jugador_id` es `not null`).

**El gap de atomicidad está cerrado desde 0005.** Los cuatro pasos de arriba describen el orden lógico, pero la escritura ocurre en una sola llamada a la RPC `importar_partido` (`security invoker`, sujeta a RLS como cualquier cliente): o se guarda todo, o no se guarda nada. Antes eran llamadas sueltas y un fallo a mitad dejaba una `importacion` sin partido que, por el `unique(club_id, hash_archivo)`, hacía fallar el reintento como "duplicado" con los datos incompletos.

## Cómo probar localmente

1. `supabase/migrations/0003_seed_dev.sql` no crea ninguna fila de `miembro_club` porque requiere un `auth.users.id` real.
2. Levantar Supabase local (`npx supabase start`, requiere Docker corriendo) y aplicar todas las migraciones en orden.
3. Crear un usuario de prueba (signup por la Auth API o el Studio local).
4. Darle el club:
   ```sql
   insert into miembro_club (user_id, club_id, es_entrenador)
   values ('<uuid del usuario>', '00000000-0000-0000-0000-000000000001', true);
   ```
5. **Y darle al menos una categoría**, o no va a ver nada — que es el comportamiento correcto desde 0016, no un error:
   ```sql
   insert into asignacion_plantel (miembro_club_user_id, miembro_club_club_id, plantel_id)
   select '<uuid del usuario>', club_id, id from plantel
   where club_id = '00000000-0000-0000-0000-000000000001' and categoria = 'U17M';
   ```
6. Con ese usuario autenticado, confirmar que ve U17M del "Club de Prueba" y **no** ve U21M.
7. Para probar coordinación, crear otro usuario con `es_coordinador = true` (y `es_entrenador = false`): tiene que entrar al Panorama y a Profes, poder habilitar al primero, y leer cero filas en las tablas de jugador.
8. La verificación completa, con usuarios sintéticos, es `tests/verificarCoordinacion.sql`.
9. Para probar a mano la cuenta de jugador sin pasar por el flujo de solicitud, con un usuario sin fila en `miembro_club` y una ficha existente:
   ```sql
   insert into cuenta_jugador (user_id, club_id, jugador_id, aprobado_por)
   values ('<uuid del usuario>', '<club>', '<uuid de la ficha>', '<uuid de un entrenador>');
   ```
   Ese usuario entra directo al shell del jugador (Recursos, Físico, Mi progreso). La verificación completa es `tests/verificarCuentaJugador.sql`: se pega en el SQL Editor después de aplicar 0029 y otra vez después de 0030.
