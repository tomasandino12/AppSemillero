# Cuenta de jugador — diseño

Estado: aprobado para planificar. Fecha: 2026-09-20.

## 1. Problema y alcance

Hoy la app es sólo para el cuerpo técnico: `miembro_club` tiene
`check (es_entrenador or es_coordinador)` y el esquema dice, con todas las
letras, que los jugadores no tienen cuenta. El profe manda un recurso y el
chico se entera por WhatsApp o no se entera; el plan físico lo ve el profe en
su celular y lo dicta en el gimnasio.

Esta etapa le da cuenta propia al jugador, **de sólo lectura y sólo sobre lo
suyo**: los recursos que le mandaron, el plan físico de su categoría y su
propio progreso. Se compara con él mismo y con nadie más.

Entra en alcance: recursos recibidos, sesiones del plan físico con su peso de
fuerza, estadísticas de partido, batería de tiro y velocidad.

**No** entra: medidas corporales (peso, altura, pliegues), cualquier dato de
otro jugador —ni siquiera un promedio del plantel—, metas, panorama,
notificaciones, y toda forma de escritura. El jugador no marca "hecho", no
comenta y no carga nada.

Son datos de menores de todas las categorías, U13 incluida. El consentimiento
de los padres se gestiona por el canal de papel que el club ya usa para otras
cosas; lo que aporta la app es el rastro de quién dio el acceso y cuándo.

## 2. Identidad: el chico pide, el profe aprueba

El chico se registra como cualquiera (mail o Google). En el registro se le pide
el **nombre completo, como figura en su documento**, con esa instrucción a la
vista: ese texto puede terminar siendo el nombre de su ficha (ver abajo), y
cuanto mejor escrito esté, menos trabajo de deduplicación después.

Sin club no ve nada, y cae en la pantalla "todavía no tenés club" que ya
existe. Ahí aparece un botón nuevo, **"Soy jugador de un club"**: elige club y
categoría de un catálogo y queda una `solicitud_jugador` pendiente.

Del otro lado, el entrenador con asignación vigente a ese plantel ve un aviso
arriba de la pantalla Plantel. Lo abre y resuelve la solicitud por uno de dos
caminos:

1. **La ficha ya existe** (el chico venía jugando y su ficha nació de una
   planilla de la CABB): el profe la elige de la lista de su plantel.
2. **La ficha no existe todavía** — el caso normal de captación: chicos de U13
   que entran en marzo y no tienen ni un partido cargado. El profe crea la
   ficha ahí mismo, desde la solicitud, con el nombre completo que escribió el
   chico, y queda con pertenencia vigente a ese plantel.

El segundo camino es el que manda el diseño de la pantalla: es el que va a
pasar más seguido, no el excepcional.

**El sistema nunca compara nombres para vincular.** Quien decide qué ficha es
cuál es el profe, que sabe quién es quién. El nombre que escribió el chico es
una pista visual en el camino 1, y el nombre de la ficha nueva en el camino 2.
El cruce contra cómo escribe la CABB ("PÉREZ, Juan M." contra "Juan Manuel
Pérez") ocurre **después**, cuando llega la primera planilla, y lo resuelve el
dedup del import que ya existe: la ficha creada acá aparece como sugerencia y
el profe confirma. No hace falta nada nuevo para eso.

Dar de baja un acceso es cerrarlo, no borrarlo (mismo criterio que
`asignacion_plantel`): dentro de dos años tiene que poder saberse quién le dio
acceso a qué chico.

## 3. La frontera de datos: cuatro funciones y nada más

La cuenta de jugador **no recibe `select` sobre ninguna tabla de dominio**.
Sólo `execute` sobre estas funciones, todas `security definer` con
`set search_path = ''`, todas arrancando por el mismo helper `mi_jugador()`
—`auth.uid()` → `jugador_id` con `cuenta_jugador` vigente, o null—:

| Función | Devuelve |
|---|---|
| `mi_ficha()` | club, nombre propio y planteles con pertenencia vigente. Es lo que arranca la app. |
| `mis_recursos()` | sólo los `envio_recurso` dirigidos a él: título, descripción, enlace, fecha. |
| `mi_plan()` | sesiones del plan vigente de cada uno de sus planteles —el último importado, mismo criterio que `elegirPlanVisible` de `escalones.js`—, con sus líneas (bloque, orden, series, reps, pausa, notas, link del ejercicio) y **su** kg actual en cada una. |
| `mi_progreso()` | jsonb con `partidos`, `tiro`, `velocidad` y `escalones`, todo propio. |

Alternativa descartada: sumar un `select` por tabla para el jugador
(`estadistica_jugador_partido`, `medicion_tiro`, `medicion_velocidad`,
`envio_recurso`, `movimiento_escalon`, `plan_fisico`, `sesion_fisico`,
`ejercicio_asignado`, `jugador`, `plantel`…). Son doce policies nuevas sobre
datos de menores, obliga a que toda tabla futura se acuerde del jugador, y
`recurso` —hoy de lectura para todo el club— le mostraría los recursos de
todos. Con las funciones, **la RLS del cuerpo técnico no se toca en una sola
línea**: esta etapa no puede romper lo que ya anda, y auditar qué ve un chico
es leer un archivo.

Costo asumido: las pantallas del jugador no reusan los repos existentes.

**Flexibilidad.** Sumar una función del jugador (repasar jugadas, recursos
tácticos) es una RPC nueva, una pantalla y una línea en `TABS_JUGADOR`, sin
tocar nada de lo anterior. Sacarla es `revoke execute` y borrar la pantalla;
los datos quedan. Para el caso concreto de jugadas y material táctico: si una
jugada es "un video con una explicación", ya es una fila de `recurso` enviada
por `envio_recurso` y no hace falta función nueva —a lo sumo una columna
`tipo` en `recurso` para separarlas en la pantalla—; si termina necesitando
tabla propia, es `mis_jugadas()` con la misma forma que las otras cuatro.
Para que el enfoque no se erosione, un test de contrato lee la migración y
falla si aparece cualquier `grant` al jugador fuera de una lista declarada.

## 4. Esquema nuevo

`miembro_club` no se toca: un jugador nunca es staff y su `check` sigue igual.

- **`solicitud_jugador`**: `(id, user_id default auth.uid(), club_id,
  plantel_id, estado, creado_en, resuelto_por, resuelto_en)`. `estado` con
  check `pendiente | aprobada | rechazada`; índice único parcial de una sola
  pendiente por cuenta. **No guarda el nombre**: ya está en los metadatos de
  Auth (0019) y una copia más de un nombre de menor no aporta nada.
- **`cuenta_jugador`**: `(user_id, club_id, jugador_id, desde, hasta,
  aprobado_por, revocado_por)`. Únicos parciales `where hasta is null`: una
  cuenta vigente por jugador y una por cuenta. Sin `delete`; el cierre lo
  sella un trigger (`hasta = now()`, `revocado_por = auth.uid()`), como
  `asignacion_plantel`.
- Las dos con `revoke all` + `grant` mínimo por columna, RLS, y trigger de
  sellado donde corresponda (patrón `0026_material.sql`).

Funciones del lado del staff y del alta:

| Función | Quién | Qué hace |
|---|---|---|
| `clubes_para_solicitar()` | autenticado sin club | catálogo de clubes y categorías vigentes para el formulario. Nombres de club y categoría son información pública. |
| `crear_solicitud_jugador(club, plantel)` | autenticado sin club ni cuenta | deja la solicitud pendiente. Rechaza si ya hay una pendiente o si quien llama es miembro del staff. |
| `solicitudes_del_plantel(plantel)` | entrenador del plantel | solicitudes pendientes con el nombre que escribió el chico, leído de los metadatos de Auth (mismo patrón que `usuarios_pendientes()`). `security definer`. |
| `aprobar_solicitud_jugador(payload)` | entrenador del plantel | `security invoker`, sujeta a RLS. Con `jugadorId`: vincula a esa ficha. Con `nombreClave` + `nombreLimpio`: crea la ficha y su pertenencia al plantel de la solicitud (temporada derivada del plantel) y vincula. Todo en una transacción. |
| `rechazar_solicitud_jugador(id)` | entrenador del plantel | marca rechazada. |
| `revocar_cuenta_jugador(jugador)` | entrenador del plantel | cierra la cuenta vigente. |

`alta_jugador_manual` (0008) no se modifica.

## 5. Pantallas

Shell propio: `modo = 'jugar'` en `src/ui/sesion.js` junto a entrenar y
coordinar, y `TABS_JUGADOR` en `chrome.js`. Sin chips de categoría: el chico
tiene la suya y no elige. El arranque de `main.js` cambia en un solo punto:
hoy, sin clubes, muestra "todavía no tenés club"; ahora antes de eso consulta
`mi_ficha()`. Para el staff no agrega ni una llamada.

- **Recursos** — lo que le mandaron, más nuevo primero, con el botón "Ver
  video" del componente compartido `ui/componentes/video.js`, tal cual está.
- **Físico** — arriba la sesión de hoy, o la próxima si hoy no hay, destacada;
  abajo todas las sesiones del plan por fecha. Adentro de una sesión: los
  ejercicios por bloque con series, reps, pausa y notas, **su** peso actual
  donde el ejercicio tenga escalón, y el video si lo tiene.
- **Mi progreso** — evolución de tiro por zona en entrenamiento, tiempos de
  velocidad, partido a partido con acumulados, y la progresión de pesos por
  ejercicio. Sin ranking y sin nadie más en pantalla.

Reusa lógica pura ya testeada de `src/data/estadisticas.js`
(`serieDeTiroDelJugador`, `historialDePartidosDelJugador`,
`ultimaBateriaDeJugador`) y de `escalones.js` (`formatearKg`,
`agruparPorBloque`). Lógica pura nueva: `src/data/planDelJugador.js`, con la
elección de la próxima sesión a partir de la fecha de hoy.

Capas: repo nuevo `src/data/repos/miCuenta.js` para lo que lee el jugador, más
una línea en la fachada; las funciones del lado del profe (solicitudes,
aprobar, rechazar, revocar) van a `repos/jugadores.js`, que es su área.

## 6. Riesgos y decisiones

- **Dos chicos con el mismo nombre en el club.** Ya está resuelto en el
  esquema por `desambiguador`, y lo resuelve el profe a mano como hoy. La
  aprobación que crea ficha puede chocar con `JUGADOR_YA_EXISTE`: la pantalla
  ofrece elegir la ficha existente, que es la respuesta correcta.
- **Un chico que deja el club.** Se le cierra la cuenta y deja de ver todo.
  No se borra nada.
- **Un chico citado a dos categorías** tiene dos pertenencias vigentes: ve las
  sesiones de las dos, cada una con su categoría a la vista.
- **Límite conocido:** `clubes_para_solicitar()` le muestra a cualquier
  autenticado sin club la lista de clubes y categorías de la plataforma. Es
  información pública y con un solo club es exacto, pero queda anotado junto
  al límite equivalente de `usuarios_pendientes()` en `docs/COORDINACION.md`.

## 7. Verificación

- `tests/planDelJugador.test.js` — la próxima sesión, con y sin sesión hoy,
  plan vencido, plan vacío.
- `tests/contratoAccesoJugador.test.js` — lee la migración y compara los
  `grant execute` otorgados con la lista declarada en JS. Falla si alguien
  suma un grant sin declararlo.
- `tests/verificarCuentaJugador.sql` — usuarios sintéticos, como
  `verificarCoordinacion.sql`: un jugador leyendo las tablas directo por
  PostgREST obtiene **cero filas**; las funciones no devuelven nada de otro
  chico; un jugador con la cuenta cerrada no ve nada; un entrenador no puede
  aprobar una solicitud de un plantel que no tiene asignado.
- `npm run test:q` en verde antes de cada commit.
