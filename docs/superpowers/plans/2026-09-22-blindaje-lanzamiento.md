# Blindaje antes del lanzamiento (octubre) — plan

Origen: auditoría del 2026-09-22 (hallazgos #1–#8 y #10). Lo demás (#9 parcial, #11–#15) queda para después del lanzamiento.

**Estado (2026-09-22):** bloque A **hecho** en la rama `blindaje-lanzamiento` (commits 697f1de, 847c1b8, 8e15841, d516ef1): 0036–0039 aplicadas y verificadas en la base **local**, con todos los `verificar*.sql` en OK. **Falta el `db push` a producción.** Sigue el bloque B, con las notas del final.

**Cómo se ejecuta:** en la sesión, sin subagentes, una task = un commit, `npm run test:q` verde antes de cada commit. Bloque A (SQL/RLS) con **Opus**; bloque B (cliente) con **Sonnet**. B1–B3 no dependen de A. B4–B7 usan RPC nuevas: no se deployan hasta que el `db push` de A esté hecho y verificado.

**Reglas que valen para todo:** migración aplicada no se edita (se agrega otra); tabla/columna nueva con `revoke` + grant mínimo por columna; funciones `security definer` con `set search_path = ''` y `revoke execute ... from public, anon`; código de error propio con `errcode = 'P0001'`; HTML nuevo con `html\`\``; errores al usuario con `mensajeAlGuardar`; `db push` sólo con confirmación del usuario.

**Verificación SQL:** Cada migración lleva su `tests/verificarX.sql` que corre **como `authenticated`** (`set local role authenticated` + `request.jwt.claims`, modelo `tests/verificarAutorizacionPlantel.sql`), dentro de `begin … rollback`. Se corre en el SQL Editor después del push, o con `npx supabase start` si se prende Docker.

---

## Bloque A — base (Opus)

> Hecho. Lo implementado se aparta del texto de abajo en tres cosas: el código de solicitud es al azar (no se deriva del id, que el profe recibe); la baja apaga `es_entrenador` en vez de agregar `baja_en is null` a los helpers; y las pertenencias previas quedan con `-infinity`, no con `desde`. Lo que vale para B está en "Notas para el bloque B".

### A1. Crear jugadores sin `insert … returning` (#1, y la parte SQL de #9)
- **Archivos:** `supabase/migrations/0036_crear_jugador_sin_returning.sql`; `src/data/repos/jugadores.js` (borrar `crearJugador`, que es código muerto con el mismo defecto); `tests/verificarAltaJugador.js` (sumar el camino feliz: alta real de un jugador de prueba como profe asignado y chequeo de que quedó con su pertenencia); `tests/verificarCrearJugador.sql`.
- **Qué:** `create or replace` de `alta_jugador_manual` e `importar_partido` generando el id con `gen_random_uuid()` antes del insert (el patrón de `aprobar_solicitud_jugador`, 0029). En `importar_partido`, `unique_violation` al insertar un jugador nuevo → `JUGADOR_YA_EXISTE: <nombreClave>`; al insertar una pertenencia → `PERTENENCIA_YA_VIGENTE`. Revocar/otorgar execute igual que 0028.
- **Aceptación:** como entrenador asignado, el alta manual y un import con un jugador nuevo andan; como entrenador de otro plantel, fallan por RLS; no queda ningún jugador suelto después de un rollback.
- **Test:** `tests/contratoCrearJugador.test.js`: en la **última** definición de cada función de `supabase/migrations/` que hace `insert into jugador`, no aparece `returning`; los códigos `JUGADOR_YA_EXISTE` y `PERTENENCIA_YA_VIGENTE` están en 0036.

### A2. Pendientes sin chicos y código de solicitud en persona (#2 y #3, parte SQL)
- **Archivos:** `supabase/migrations/0037_pendientes_y_codigo_solicitud.sql`; `src/data/accesoJugador.js` (sólo si cambia alguna función del jugador); `tests/verificarPendientesYCodigo.sql`.
- **Qué:**
  - `usuarios_pendientes()`, misma firma: excluye a quien tiene `cuenta_jugador` vigente **y** a quien tiene una `solicitud_jugador` pendiente. `es_jugador` queda en la firma (siempre false) para no romper al cliente.
  - Nueva `buscar_jugador_para_habilitar(p_club_id uuid, p_email text)` (definer, sólo coordinación de ese club): devuelve `(user_id, email, nombre)` sólo si el mail coincide exacto (sin distinguir mayúsculas) con una cuenta de jugador vigente de ese club. Es la única puerta para el caso "jugador que pasa a profe" (0032).
  - Código de solicitud: 6 caracteres derivados del id de la solicitud (en mayúsculas, sin guiones). `mi_solicitud_jugador()` lo devuelve (drop y create, con los grants de nuevo). `solicitudes_del_plantel()` **no** lo devuelve (el profe lo tiene que pedir en persona), pero suma `email_enmascarado` (primera letra + `***@dominio`).
  - `aprobar_solicitud_jugador`: exige `payload.codigo` igual al de la solicitud; si no, `CODIGO_INCORRECTO`.
- **Aceptación:** un chico con solicitud pendiente o con cuenta no figura en pendientes; aprobar sin código o con un código equivocado falla y no deja nada; el profe no puede leer el código por ninguna función.
- **Test:** `tests/contratoPendientesYCodigo.test.js` (lee 0037 y los repos): las dos exclusiones están en `usuarios_pendientes`; `solicitudes_del_plantel` no devuelve `codigo`; `CODIGO_INCORRECTO` existe; la función nueva empieza con el chequeo de coordinación.

### A3. Guardados idempotentes (#6, parte SQL)
- **Archivos:** `supabase/migrations/0038_guardados_idempotentes.sql`; `tests/verificarIdempotencia.sql`.
- **Qué:** `guardar_sesion_medicion` acepta `payload.sesionId`. Si ya existe una sesión con ese id **del mismo plantel y tipo**, devuelve `{sesionId, filas: 0, yaGuardada: true}` sin insertar nada; si existe con otro plantel, `SESION_AJENA`; sin `sesionId`, se comporta como hoy. `guardar_recurso` acepta `payload.recursoIdNuevo` con la misma regla, más `grant insert (id) on recurso`.
- **Aceptación:** mandar dos veces el mismo payload deja una sola sesión con sus filas; un id que pertenece a otro plantel se rechaza.
- **Test:** `tests/contratoIdempotencia.test.js`: 0038 maneja `sesionId`, `recursoIdNuevo`, `yaGuardada` y `SESION_AJENA`, y otorga el insert de `id` sobre `recurso`.

### A4. Baja de un profe y ventana del historial corporal (#7 y #8)
- **Archivos:** `supabase/migrations/0039_baja_profe_y_ventana.sql`; `tests/verificarBajaProfe.sql`.
- **Qué:**
  - Columna `miembro_club.baja_en timestamptz` (sin grant al cliente). `es_entrenador_de`, `puede_ver_plantel` y `puede_escribir_plantel` exigen `baja_en is null`.
  - `dar_de_baja_profe(p_user_id, p_club_id)` (definer, coordinación de ese club, nunca a uno mismo): cierra todas sus asignaciones vigentes y sella `baja_en`. `asignar_planteles` sobre alguien dado de baja → `DADO_DE_BAJA` (reactivarlo queda por SQL).
  - `jugadores_del_club_para_dedup` exige además al menos una asignación vigente.
  - `pertenencia.registrada_en timestamptz`: las filas existentes se completan con `desde` (nadie pierde nada de lo que ve hoy) y las nuevas toman `now()` por trigger. `corporal_ver`, `corporal_editar` y `corporal_borrar` sólo alcanzan medidas con `creado_en >= registrada_en` (o cargadas por uno mismo), y `creado_en` lo sella un trigger.
- **Aceptación:** un profe dado de baja no ve la lista de jugadores ni crea filas; si un profe "adopta" a un chico de otra categoría, no ve las medidas anteriores a la adopción.
- **Test:** `tests/contratoBajaProfe.test.js`: los tres helpers mencionan `baja_en is null`; el dedup exige una asignación vigente; `DADO_DE_BAJA` existe; `baja_en` no aparece en ningún grant.

**Cierre de A:** `npx supabase db push` (con confirmación), correr los 4 `verificar*.sql` y anotar el resultado en `docs/SEGURIDAD-LANZAMIENTO.md`.

---

## Bloque B — cliente (Sonnet)

### B1. Paginación con orden (#10) — sin dependencias
- **Archivos:** `src/data/repos/mediciones.js` (`obtenerMedicionesTiroDelPlantel`, `obtenerMedicionesCorporalesDelClub`), `src/data/repos/partidos.js` (`obtenerEstadisticasDelPlantel`): `.order('id')` antes de `.range()` (sumar `id` al select si falta).
- **Test:** `tests/paginacionOrdenada.test.js`: en `src/data/repos/*.js`, toda cadena `.from(…)` con `.range(` tiene un `.order(`.

### B2. Sesión cerrada ≠ "sin permiso" (#4) — sin dependencias
- **Archivos:** `src/ui/errores.js`: exportar `marcarSesionCerrada()` y `SESION_CERRADA` ("Tu sesión se cerró. Volvé a entrar: lo que cargaste sigue en el celular."). `mensajeAlGuardar` y `textoDeError` la devuelven, antes que "sin permiso", mientras la marca esté puesta. En el arranque de la app (junto a `alCambiarAuth` en `src/ui/publico.js`): ante `SIGNED_OUT` sin que el usuario haya tocado "salir", marcar y mostrar un aviso fijo con un botón para volver a entrar.
- **Test:** `tests/errores.test.js`: con la marca puesta, un 42501 da `SESION_CERRADA`; sin la marca, sigue dando "sin permiso".

### B3. Errores con rastro y con código (#5, y el mensaje del import) — sin dependencias
- **Archivos:** `src/ui/errores.js`: `alReportarError(fn)` registra un reportero; en la rama de permiso y en la genérica, `mensajeAlGuardar` lo llama con `{codigo, mensaje}` y agrega al texto ` (código X)` cuando hay `e.code`. `src/ui/main.js` registra un reportero que depura con `src/data/errorDeCliente.js` y guarda con `guardarErrorDeCliente`. `src/ui/pantallas/confirmacionImport.js`: pasar a `mensajeAlGuardar` con reglas para `IMPORTACION_DUPLICADA`, `JUGADOR_YA_EXISTE` y `PERTENENCIA_YA_VIGENTE`; en estas dos últimas, volver a leer `obtenerJugadoresDelClub` y remapear antes de dejar reintentar. En el mismo commit va el diff de `altaJugador.js` que está sin commitear.
- **Test:** `tests/errores.test.js`: se llama al reportero en las ramas genérica y de permiso (y no en la de red), y aparece el código en el texto. `tests/importsResueltos.test.js` sigue verde.

### B4. Pendientes limpios y buscar a un jugador por mail (#3) — necesita A2
- **Archivos:** `src/data/repos/coordinacion.js` (`buscarJugadorParaHabilitar({clubId, email})`); `src/ui/pantallas/coordProfes.js`: debajo de "Esperando acceso", un campo "¿Un jugador va a ser profe? Buscalo por mail" que, si encuentra a alguien, abre el mismo `abrirHabilitar` con `esJugador: true`.
- **Test:** `tests/contratoPendientesYCodigo.test.js` (extender): el repo llama a `buscar_jugador_para_habilitar`.

### B5. Código de solicitud en la práctica (#2) — necesita A2
- **Archivos:** `src/data/repos/clubes.js` (`obtenerMiSolicitud` lee `codigo`); `src/ui/pantallas/solicitudJugador.js`: muestra el código grande, con el texto "Mostráselo a tu profe en la práctica". `src/data/repos/jugadores.js` lee `email_enmascarado`; `src/ui/pantallas/aprobarJugador.js`: muestra el mail enmascarado, pide el código (obligatorio) antes de "Crear la ficha" y antes de "Es él", y lo manda en el payload; regla `CODIGO_INCORRECTO` → "Ese código no es el de esta solicitud. Pedíselo al chico en persona."
- **Test:** `tests/solicitudJugador.test.js` (lógica pura nueva en `src/data/solicitudJugador.js`: `normalizarCodigo` saca espacios y pasa a mayúsculas; si no tiene 6 caracteres, da null).

### B6. Guardados idempotentes en el cliente (#6) — necesita A3
- **Archivos:** `src/ui/borradorMedicion.js` / `medirBateria.js` / `medirVelocidad.js`: el borrador guarda un `sesionId` (`crypto.randomUUID()`) que se genera al crearse y se reutiliza en cada reintento; `src/data/prepararPayloadMedicion.js` lo incluye. Con `yaGuardada: true`, se toma como éxito. Alta de recurso (`src/ui/pantallas/recursos.js`): un `recursoIdNuevo` por formulario abierto.
- **Test:** `tests/prepararPayloadMedicion.test.js` (el `sesionId` del estado pasa al payload); `tests/borradorMedicion.test.js` (el `sesionId` sobrevive a guardar y leer el borrador).

### B7. Dar de baja a un profe (#7) — necesita A4
- **Archivos:** `src/data/repos/coordinacion.js` (`darDeBajaProfe({userId, clubId})`); `src/ui/pantallas/coordProfes.js`: "Dar de baja" en la fila del profe, con confirmación ("deja de ver todo; su historia queda"), y la regla `DADO_DE_BAJA` en `mensajeDeError`.
- **Test:** `tests/contratoBajaProfe.test.js` (extender): el repo llama a `dar_de_baja_profe`.

---

## Notas para el bloque B (lo que dejó hecho A)

- **Base local:** `npx supabase start -x studio,realtime,storage-api,imgproxy,edge-runtime,logflare,vector,mailpit,postgres-meta,supavisor` (Docker con 2 GB no da para más). Verificar: `docker exec -i supabase_db_modelo-datos-supabase psql -U postgres < tests/verificarX.sql`.
- **Nombres reales (usar tal cual):**
  - `importar_partido` → errores `JUGADOR_YA_EXISTE: <nombreClave>` y `PERTENENCIA_YA_VIGENTE` (B3). El alta manual sigue con `JUGADOR_YA_EXISTE` exacto.
  - `usuarios_pendientes()` mantiene la forma de siempre (`es_jugador` siempre false). `buscar_jugador_para_habilitar(p_club_id, p_email)` devuelve esas mismas columnas con `es_jugador = true` (B4).
  - `mi_solicitud_jugador()` suma `codigo` (6 caracteres hexadecimales, mayúsculas). `solicitudes_del_plantel()` suma `email_enmascarado` y **no** trae el código. `aprobar_solicitud_jugador` exige `payload.codigo` (la base ya saca espacios y pasa a mayúsculas) y, si falta o es otro, responde `CODIGO_INCORRECTO` (B5).
  - `guardar_sesion_medicion`: `payload.sesionId` → `{sesionId, filas, yaGuardada}`, error `SESION_AJENA`. `guardar_recurso`: `payload.recursoIdNuevo` → `{recursoId, yaGuardado}`, error `RECURSO_AJENO` (B6).
  - `dar_de_baja_profe(p_user_id, p_club_id)` → `{asignacionesCerradas}`, con errores `NO_ES_UNO_MISMO`, `YA_DADO_DE_BAJA`, `ES_COORDINACION` y `NO_ES_DEL_CLUB`. `asignar_planteles` responde `DADO_DE_BAJA`, y `miembros_del_club` suma `baja_en`: en el panel hay que mostrarlo como "dado de baja" y no ofrecer asignarle (B7).
- **Orden de deploy:** después del `db push` de 0037, aprobar una solicitud sin código falla. B5 tiene que salir el mismo día del push. B1–B3 se pueden deployar antes.
- **Qué se sacó de A1:** no se sumó el camino feliz a `tests/verificarAltaJugador.js`, porque corre contra producción y dejaría una ficha que no se puede borrar. Lo cubre `tests/verificarCrearJugador.sql`.
- **Decisión de A4 (resuelta):** la ventana se mide por **cuándo se cargó** la medida (`creado_en`), no por `fecha_medicion`. Quien suma a un chico no ve lo que otros cargaron antes; sí ve lo que carga él, aunque la fecha sea vieja. Nadie pierde lo que ve hoy.
