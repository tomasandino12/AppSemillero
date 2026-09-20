# Cuenta de jugador — plan de implementación

**Spec:** `docs/superpowers/specs/2026-09-20-cuenta-jugador-design.md` (leerlo antes; el plan argumenta desde ahí).

**Objetivo:** que un jugador tenga cuenta propia de sólo lectura y vea, sólo de él, los recursos que le mandaron, el plan físico de su categoría y su progreso.

**Arquitectura:** la cuenta de jugador no recibe `select` sobre ninguna tabla de dominio. Lee por cuatro funciones `security definer` que resuelven `auth.uid()` → `jugador_id` con `mi_jugador()`. La RLS del cuerpo técnico no se toca.

**Stack:** JS vanilla con módulos ES, Supabase (Postgres + RLS), `node --test`.

## Restricciones globales

- Una migración aplicada no se edita: si 0029 ya se pusheó, lo que falte va en una nueva.
- Tabla nueva = `revoke all` + `grant` mínimo por columna + RLS + trigger de sellado (patrón `0026_material.sql`).
- Repo devuelve dominio en camelCase; la UI pide todo por `repositorio.js`; HTML nuevo con `html\`...\`` de `ui/html.js`; `$` de `ui/dom.js`; errores con los helpers de `ui/errores.js`.
- Números tecleados con `decimalEstricto`; `NULL` es "no se sabe", nunca `0`.
- Refactor y feature no van en el mismo commit. `npm run test:q` en verde antes de cada commit.
- Ejecución en la sesión, sin subagentes (regla del proyecto). Antes de `npx supabase db push`, pedir confirmación.

---

### Task 1 — Migración 0029: solicitud, cuenta y flujo de alta

**Archivos:** crear `supabase/migrations/0029_cuenta_jugador.sql`.

Tablas `solicitud_jugador` y `cuenta_jugador` como las describe la sección 4 del spec, con sus únicos parciales, RLS, grants por columna y el trigger de sellado del cierre. Funciones: `clubes_para_solicitar()`, `crear_solicitud_jugador(club, plantel)`, `solicitudes_del_plantel(plantel)` (definer, lee el nombre de los metadatos de Auth como `usuarios_pendientes()`), `aprobar_solicitud_jugador(payload)` (invoker, los dos caminos del spec en una transacción), `rechazar_solicitud_jugador(id)`, `revocar_cuenta_jugador(jugador)`. `miembro_club` y `alta_jugador_manual` no se tocan.

**Aceptación:** la migración corre limpia sobre una base local recién migrada; el camino "crear ficha" deja jugador + pertenencia vigente + cuenta vinculada, y si algo falla no queda nada; un entrenador sin asignación al plantel de la solicitud recibe error.

**Tests:** `tests/verificarCuentaJugador.sql` (parte de alta), con usuarios sintéticos, al modelo de `tests/verificarCoordinacion.sql`.

---

### Task 2 — Migración 0030: la frontera de lectura del jugador

**Archivos:** crear `supabase/migrations/0030_lectura_jugador.sql`; crear `tests/contratoAccesoJugador.test.js`; crear `src/data/accesoJugador.js` (la lista declarada de funciones otorgadas al jugador, sin lógica).

`mi_jugador()` (definer, `search_path = ''`, null si no hay cuenta vigente) y las cuatro funciones de lectura: `mi_ficha()`, `mis_recursos()`, `mi_plan()`, `mi_progreso()`. Todas arrancan chequeando el null de `mi_jugador()`. `mi_plan()` elige el plan vigente por plantel con el mismo criterio que `elegirPlanVisible` de `escalones.js`.

**Aceptación:** un jugador consultando cualquier tabla por PostgREST obtiene cero filas; las cuatro funciones devuelven sólo lo suyo; con la cuenta cerrada devuelven vacío.

**Tests:** `tests/contratoAccesoJugador.test.js` (lee 0029 y 0030 y compara los `grant execute` contra la lista de `accesoJugador.js`; falla si hay uno de más o de menos, modelo `tests/contratoMaterial.test.js`); `tests/verificarCuentaJugador.sql` (parte de lectura y aislamiento entre dos chicos).

---

### Task 3 — Repos y fachada

**Archivos:** crear `src/data/repos/miCuenta.js`; modificar `src/data/repositorio.js` (una línea) y `src/data/repos/jugadores.js`.

`miCuenta.js`: `obtenerMiFicha`, `obtenerMisRecursos`, `obtenerMiPlan`, `obtenerMiProgreso`, cada una llamando a su RPC y mapeando a camelCase con su `xDesdeFila`. En `jugadores.js`, las del lado del profe: `obtenerSolicitudesDelPlantel`, `aprobarSolicitud`, `rechazarSolicitud`, `revocarCuentaJugador`. En `repos/clubes.js`, `obtenerClubesParaSolicitar` y `crearSolicitudJugador`.

**Aceptación:** ninguna función devuelve filas crudas; nada de lógica de más de ~10 líneas adentro de un repo.

**Tests:** `npm run test:q` — `tests/arquitectura.test.js` ya exige el archivo nuevo en `repos/` más su línea en la fachada.

---

### Task 4 — Lógica pura del plan del jugador

**Archivos:** crear `src/data/planDelJugador.js` y `tests/planDelJugador.test.js`.

`proximaSesion(sesiones, hoy)` devuelve la sesión de hoy si la hay, si no la primera futura, y null si todas pasaron. `sesionesOrdenadas(sesiones)` por fecha. Sin DOM ni red.

**Aceptación:** cubre hay sesión hoy / no hay y viene una / todas pasadas / lista vacía / dos planteles mezclados.

**Tests:** `tests/planDelJugador.test.js`.

---

### Task 5 — El shell del modo jugador

**Archivos:** modificar `src/ui/sesion.js`, `src/ui/chrome.js`, `src/ui/main.js`, `src/ui/pantallas/registro.js`; crear `tests/sesionJugador.test.js`.

`esJugador` en los roles, `modo = 'jugar'`, `TABS_JUGADOR` (Recursos, Físico, Mi progreso) sin chips de categoría ni botón de cambio de modo. En `main.js`: si `obtenerClubesDelEntrenador()` vuelve vacío, consultar `mi_ficha()` antes de mostrar "sin club". Las tres pantallas se registran vacías todavía.

**Aceptación:** para el staff el arranque no suma ni una llamada; un jugador entra directo a su shell; un usuario sin nada sigue viendo "sin club".

**Tests:** `tests/sesionJugador.test.js` — `setRoles`/`setModo`/`obtenerModo` con `esJugador`, y que `setModo('coordinar')` no haga nada para un jugador. Para probar a mano: insertar una fila de `cuenta_jugador` por SQL, como hace la guía de `ESQUEMA.md`.

---

### Task 6 — Pantalla Recursos del jugador

**Archivos:** crear `src/ui/pantallas/jugRecursos.js`; modificar `registro.js`.

Lista de `obtenerMisRecursos()`, más nuevo primero, con fecha, descripción, el botón "Ver video" de `ui/componentes/video.js` tal cual y el link común cuando no es YouTube. Vacío con su mensaje propio; error con `avisoDeError`.

**Aceptación:** sólo aparecen recursos enviados a él; el reproductor abre en la hoja.

**Tests:** `npm run test:q` (incluye `tests/css.test.js` y arquitectura). Verificación a mano en el navegador.

---

### Task 7 — Pantalla Físico y detalle de sesión

**Archivos:** crear `src/ui/pantallas/jugFisico.js` y `src/ui/pantallas/jugSesion.js`; modificar `registro.js`.

Arriba la próxima sesión (`proximaSesion`) destacada, abajo todas por fecha con su categoría cuando hay dos planteles. El detalle agrupa por bloque con `agruparPorBloque`, muestra series/reps/pausa/notas, su kg actual con `formatearKg` donde lo haya, y el video del ejercicio.

**Aceptación:** un martes sin entrenamiento muestra la del miércoles; sin plan importado, el vacío explica que todavía no hay nada cargado.

**Tests:** `npm run test:q`. Verificación a mano.

---

### Task 8 — Pantalla Mi progreso

**Archivos:** crear `src/ui/pantallas/jugProgreso.js`; modificar `registro.js`.

Cuatro secciones desde `obtenerMiProgreso()`: tiro por zona (`serieDeTiroDelJugador`, `ultimaBateriaDeJugador`), velocidad, partido a partido con acumulados (`historialDePartidosDelJugador`) y progresión de pesos por ejercicio. Sin ranking ni promedio del plantel.

**Aceptación:** con `UMBRAL_INTENTOS` sin alcanzar avisa muestra chica en vez de mostrar un porcentaje engañoso; nunca aparece el nombre de otro jugador.

**Tests:** `npm run test:q` (la lógica pura ya tiene sus tests). Verificación a mano.

---

### Task 9 — Pedir acceso desde "todavía no tenés club"

**Archivos:** modificar `src/ui/publico.js` y `public/index.html` (vista `v-sin-club` y el texto del campo `cr-nombre`); crear `src/ui/pantallas/solicitudJugador.js`.

Botón "Soy jugador de un club" en la vista `v-sin-club`; formulario con club y categoría desde `obtenerClubesParaSolicitar()`; estado pendiente visible al volver a entrar. En el alta de cuenta, el campo nombre pide **nombre completo como figura en el documento** y explica por qué (de ahí puede salir la ficha).

Ojo con la CSP de `vercel.json`: el `script-src` lleva un `sha256` del inline de `index.html`; si se toca ese script hay que recalcularlo.

**Aceptación:** una segunda solicitud pendiente se rechaza con un mensaje claro; un miembro del staff no ve el botón.

**Tests:** `npm run test:q`. Verificación a mano.

---

### Task 10 — Aprobar la solicitud desde Plantel

**Archivos:** modificar `src/ui/pantallas/plantel.js`; crear `src/ui/pantallas/aprobarJugador.js`.

Aviso arriba de Plantel cuando hay pendientes del plantel activo. La hoja muestra el nombre que escribió el chico y la fecha, y ofrece los dos caminos, **con "crear la ficha" como opción primaria**: crear ficha nueva con ese nombre (`clavearNombre` de `parserCabb.js`, como `altaJugador.js`) o elegir una ficha existente del plantel. Rechazar y revocar desde la ficha del jugador.

**Aceptación:** `JUGADOR_YA_EXISTE` ofrece elegir la ficha existente en vez de mostrar el error crudo; aprobada, el chico entra y ve sus datos.

**Tests:** `npm run test:q`. Verificación a mano de punta a punta: registrar un chico, pedir acceso, aprobar creando ficha, entrar y ver las tres pantallas.

---

### Task 11 — Documentación

**Archivos:** modificar `supabase/ESQUEMA.md`, `docs/COORDINACION.md`, `docs/SEGURIDAD-LANZAMIENTO.md`.

En `ESQUEMA.md`: sección de las dos tablas nuevas, la fila del jugador en la tabla de policies, y corregir la línea "los jugadores no tienen cuenta". En `COORDINACION.md`: el límite de `clubes_para_solicitar()` junto al de `usuarios_pendientes()`. En `SEGURIDAD-LANZAMIENTO.md`: el consentimiento de los padres como pendiente de lanzamiento, y que revocar es cerrar.

**Aceptación:** nadie que lea `ESQUEMA.md` después de esto cree que el jugador lee tablas.

**Tests:** `npm run test:q`.
