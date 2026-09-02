# Etapa 2B: Orquestación y pantalla de import — Design Spec

## Contexto

App móvil para seguimiento del desarrollo de jugadores en categorías inferiores de clubes de básquet argentinos. Piloto gratuito en Newell's Old Boys (Rosario), dos categorías (U21M, U17M). El problema de negocio: pérdida de memoria institucional cuando cambia el cuerpo técnico.

**Restricción de diseño dura:** el usuario es un entrenador con el celular, al aire libre, con una mano, durante la práctica. Sol directo, pantalla chica, dedo gordo, apuro. Toda decisión de UI se resuelve contra ese escenario.

**Ya construido y verificado (Etapas 1 y 2A, mergeadas a `main`):**
- `src/parser/parserCabb.js` / `PARSER.md` — parser CABB club-agnóstico, nunca lanza excepción, 16 tests.
- `supabase/migrations/0001-0003` + `supabase/ESQUEMA.md` — esquema, RLS, decisiones de la Etapa 2A. 33 tests (los que no tocan DB corren en Node puro).
- `src/data/mapearImportacion.js` — función pura, clasifica jugadores en coincidentes / `requierePertenenciaNueva` / sugerencias / nuevos. Nunca resuelve una sugerencia sola. Nunca infiere `condicionPropia`.
- `src/data/repositorio.js`, `src/data/cliente.js` — capa de acceso a Supabase, una función por operación, sin transacción que las envuelva (deuda conocida, ver abajo).
- Raíz del repo (`index.html`, `css/tokens.css`, `css/app.css`, `js/app.js`, `manifest.webmanifest`) — prototipo visual más amplio (mediciones, ficha de jugador, estadísticas), **no se toca**. Es solo la referencia de sistema de diseño: tokens de color/tipografía y los patrones de interacción (`.pant`/`.pant.on` para pantallas, `.sheet`/`.velo` para modales, `.btn`/`.opt`/`.campo`/`.tarj`/`.eyebrow`/`.toast`).

**Stack:** HTML/CSS/JS vanilla, ES modules, sin frameworks, sin build step. Google Fonts (Barlow Condensed + Inter + IBM Plex Mono, mismo stack que la raíz). Supabase (proyecto real ya creado). Deploy futuro: Vercel (fuera de alcance acá).

**Proyecto Supabase real:**
- URL: `https://lseqvbtdzebomxwtqhwu.supabase.co`
- Publishable key (pública, va en el frontend): `sb_publishable_nuPVo5yqsAFzY1uf6qcWBA_quRRgUFF`
- La contraseña de la base y la secret key nunca se commitean ni se guardan en ningún archivo del repo.

## Objetivo

Flujo completo de import de un partido, de punta a punta, en el navegador: el entrenador entra, elige un `.xlsx` de la CABB, confirma qué equipo es el suyo y qué jugadores se dan de alta, y los datos quedan guardados en Supabase — o no se guarda nada, sin estados intermedios.

## Decisiones de arquitectura

### 1. Paso 0 — Migraciones contra la base real

Las 3 migraciones existentes (`0001`, `0002`, `0003`) se aplican tal cual están, sin modificarlas, contra el proyecto real (`lseqvbtdzebomxwtqhwu`), corridas por el usuario en su propia terminal (`supabase login` / `link` / `db push`) — el agente no tiene el token de acceso a la API de Supabase necesario para correrlas de forma no interactiva, y la contraseña de la base nunca se pide ni se pega en el chat de nuevo.

`0003_seed_dev.sql` (club/jugadores de prueba falsos) se aplica igual que las otras dos: no tiene fila en `miembro_club`, así que bajo RLS queda inerte — invisible para cualquier usuario autenticado, incluido el entrenador piloto. No vale el riesgo de intentar saltearla con `migration repair` contra una base real.

Después de confirmar que las 3 corrieron limpias, se agrega:

**`supabase/migrations/0004_seed_piloto.sql`** — datos mínimos reales de configuración (no jugadores):
- `club`: "Newell's Old Boys"
- `temporada`: "2026" (del mismo club)
- `plantel` × 2: categoría `U21M` con `codigo_cabb='U21M'`, categoría `U17M` con `codigo_cabb='U17M'` (misma temporada)

No incluye ninguna fila de `miembro_club` (igual que `0003` — dar de alta al entrenador piloto es un acto administrativo manual desde el dashboard, ya documentado en `ESQUEMA.md`).

### 2. Deuda de la Etapa 2A — RPC transaccional

**`supabase/migrations/0005_rpc_importar_partido.sql`**

```sql
create or replace function importar_partido(payload jsonb)
returns jsonb
language plpgsql
security invoker
as $$
declare
  v_importacion_id uuid;
  v_partido_id uuid;
  v_jugador_id uuid;
  j jsonb;
  e jsonb;
begin
  begin
    insert into importacion (club_id, hash_archivo, id_partido_cabb, nombre_archivo, advertencias)
    values (
      (payload->>'clubId')::uuid,
      payload->>'hashArchivo',
      payload->>'idPartidoCabb',
      payload->>'nombreArchivo',
      coalesce(payload->'advertencias', '[]'::jsonb)
    )
    returning id into v_importacion_id;
  exception when unique_violation then
    raise exception 'IMPORTACION_DUPLICADA' using errcode = 'P0001';
  end;

  insert into partido (club_id, plantel_id, importacion_id, fecha, condicion_propia, rival_nombre, puntos_propios, puntos_rival)
  values (
    (payload->>'clubId')::uuid,
    (payload->'partido'->>'plantelId')::uuid,
    v_importacion_id,
    (payload->'partido'->>'fecha')::date,
    payload->'partido'->>'condicionPropia',
    payload->'partido'->>'rivalNombre',
    (payload->'partido'->>'puntosPropios')::int,
    (payload->'partido'->>'puntosRival')::int
  )
  returning id into v_partido_id;

  -- crea tabla temporal en memoria de la transacción: nombreClave -> jugador_id,
  -- para los jugadores nuevos creados en este mismo llamado.
  create temporary table jugadores_resueltos (nombre_clave text primary key, jugador_id uuid) on commit drop;

  for j in select * from jsonb_array_elements(coalesce(payload->'jugadoresNuevos', '[]'::jsonb))
  loop
    insert into jugador (club_id, nombre_clave, nombre_limpio, desambiguador)
    values (
      (payload->>'clubId')::uuid,
      j->>'nombreClave',
      j->>'nombreLimpio',
      coalesce(j->>'desambiguador', '')
    )
    returning id into v_jugador_id;

    insert into pertenencia (club_id, jugador_id, plantel_id, temporada_id, desde)
    values (
      (payload->>'clubId')::uuid,
      v_jugador_id,
      (j->'pertenenciaPropuesta'->>'plantelId')::uuid,
      (j->'pertenenciaPropuesta'->>'temporadaId')::uuid,
      (j->'pertenenciaPropuesta'->>'desde')::date
    );

    insert into jugadores_resueltos (nombre_clave, jugador_id) values (j->>'nombreClave', v_jugador_id);
  end loop;

  for j in select * from jsonb_array_elements(coalesce(payload->'pertenenciasNuevas', '[]'::jsonb))
  loop
    insert into pertenencia (club_id, jugador_id, plantel_id, temporada_id, desde)
    values (
      (payload->>'clubId')::uuid,
      (j->>'jugadorId')::uuid,
      (j->>'plantelId')::uuid,
      (j->>'temporadaId')::uuid,
      (j->>'desde')::date
    );
  end loop;

  for e in select * from jsonb_array_elements(payload->'estadisticas')
  loop
    insert into estadistica_jugador_partido (
      club_id, partido_id, jugador_id, numero, nombre_crudo, min_segundos, pts,
      dos_anotados, dos_intentados, dos_porcentaje,
      tres_anotados, tres_intentados, tres_porcentaje,
      libres_anotados, libres_intentados, libres_porcentaje,
      reb_def, reb_of, reb_tot, ast, rec, per,
      tap_cometidos, tap_recibidos, fal_cometidas, fal_recibidas, val, mas_menos
    )
    values (
      (payload->>'clubId')::uuid,
      v_partido_id,
      coalesce((e->>'jugadorId')::uuid, (select jugador_id from jugadores_resueltos where nombre_clave = e->>'nombreClave')),
      e->>'numero', e->>'nombreCrudo', (e->>'minSegundos')::int, (e->>'pts')::int,
      (e->>'dosAnotados')::int, (e->>'dosIntentados')::int, (e->>'dosPorcentaje')::int,
      (e->>'tresAnotados')::int, (e->>'tresIntentados')::int, (e->>'tresPorcentaje')::int,
      (e->>'libresAnotados')::int, (e->>'libresIntentados')::int, (e->>'libresPorcentaje')::int,
      (e->>'rebDef')::int, (e->>'rebOf')::int, (e->>'rebTot')::int,
      (e->>'ast')::int, (e->>'rec')::int, (e->>'per')::int,
      (e->>'tapCometidos')::int, (e->>'tapRecibidos')::int,
      (e->>'falCometidas')::int, (e->>'falRecibidas')::int,
      (e->>'val')::int, (e->>'masMenos')::int
    );
  end loop;

  return jsonb_build_object('partidoId', v_partido_id, 'importacionId', v_importacion_id);
end;
$$;
```

Notas de diseño (a verificar/ajustar durante la implementación, esto es la intención, no SQL final sin revisar):
- **Atomicidad gratis:** una llamada RPC vía PostgREST es una transacción. Cualquier excepción no capturada aborta todo — no hace falta `BEGIN`/`ROLLBACK` manual salvo para el caso de duplicado, donde se re-lanza con un código propio (`IMPORTACION_DUPLICADA`) para que el frontend lo distinga de un error genérico.
- **Procedural, no CTEs anidados:** dado que no hay forma de iterar rápido contra una base real, se prioriza código auditable a mano por sobre SQL compacto.
- **Correlación por `nombreClave`:** las filas de `estadisticas` para jugadores nuevos no traen `jugadorId` (no existe todavía cuando el frontend arma el payload) — se resuelven contra la tabla temporal `jugadores_resueltos` armada en el mismo `for` que los crea, usando `nombreClave` (único por club, ver `jugador.unique(club_id, nombre_clave, desambiguador)`).
- **`security invoker`:** el RPC corre con los permisos del usuario que lo llama, no con privilegios elevados — sigue estando sujeto a RLS exactamente igual que si el cliente insertara cada fila por separado.

**Verificación del rollback:** no hay forma de escribirlo como test de `node --test` sin una base conectada (mismo criterio que el resto de lo que toca Supabase en la Etapa 2A). Se resuelve con `tests/verificarRpc.js`, un script de verificación manual (mismo espíritu que `tests/inspect.js`) que llama al RPC con un payload que falla a propósito en el último paso (p.ej. un `jugadorId` que no existe en `estadisticas`) y confirma por consulta directa que no quedó ninguna fila de `importacion`/`partido`/`jugador` de esa corrida. Se corre una vez a mano contra el proyecto real — no queda enganchado a `npm test`.

**Test unitario adicional (Paso 1 del prompt original):** arreglar `tests/mapearImportacion.test.js` → `'resultadoParser con errores no se mapea'`, agregándole los campos de `contexto` que hoy le faltan (`clubId`, `plantelId`, `temporadaId`, `fecha`) para que efectivamente ejercite la rama de `resultadoParser.errores.length > 0` en vez de cortar antes en la validación de `contexto`.

### 3. `src/data/prepararPayloadImportacion.js` (pieza pura nueva)

Entre lo que devuelve `mapearImportacion` (clasificación cruda) y lo que espera el RPC hay un paso de reconciliación que no existe todavía: las decisiones del entrenador sobre cada `sugerencia` ("es el mismo jugador" → se trata como coincidente con `requierePertenenciaNueva` recalculado / "es otro" → se trata como nuevo) y los checkboxes desmarcados en "nuevos" (se excluyen del payload, y sus filas de `estadisticas` correspondientes también).

```js
export function prepararPayloadImportacion(resultadoMapeo, decisiones, contexto) {
  // resultadoMapeo: la salida de mapearImportacion (ya sin error)
  // decisiones: { sugerencias: { [nombreClave]: 'mismo' | 'otro' }, nuevosExcluidos: Set<nombreClave> }
  // contexto: { clubId, hashArchivo, idPartidoCabb, nombreArchivo, advertencias }
  // devuelve: { payload } | { error }
}
```

Responsabilidades:
- Cada `sugerencia` **debe** tener una decisión explícita en `decisiones.sugerencias` — si falta alguna, devuelve `error` (nunca asume). Si es `'mismo'`: se calcula `requierePertenenciaNueva` igual que para una coincidencia exacta (contra el `jugadorId` del candidato), y — importante — se busca la fila de `estadisticas` de ese `nombreClave` (que salió de `mapearImportacion` con `jugadorId: null`, por ser sugerencia) y se le completa `jugadorId` con el del candidato confirmado. Si es `'otro'`: se mueve a la lógica de nuevo (mismo `pertenenciaPropuesta` que ya trae la sugerencia); su fila de `estadisticas` queda con `jugadorId: null` y se resuelve del lado del RPC por `nombreClave`, igual que cualquier otro nuevo.
- Cada `nombreClave` en `decisiones.nuevosExcluidos` se saca de `jugadoresNuevos` y de `estadisticas`.
- Arma el `payload` final: `{ clubId, hashArchivo, idPartidoCabb, nombreArchivo, advertencias, partido, jugadoresNuevos, pertenenciasNuevas, estadisticas }` — `pertenenciasNuevas` junta las `pertenenciaPropuesta` de los coincidentes con `requierePertenenciaNueva: true` (los originales de `mapearImportacion` más los reclasificados desde sugerencias).
- Pura, sin red, sin `crypto`, sin generar IDs — mismo criterio que `mapearImportacion.js`. Tests en `tests/prepararPayloadImportacion.test.js`, sin DB.

### 4. Módulos en el navegador sin build step

`public/index.html` sirve de raíz de la app. El server de archivos estáticos sirve **la raíz del repo completa** (no solo `public/`), para que el HTML pueda importar `../src/parser/parserCabb.js`, `../src/data/*.js` y `/css/tokens.css` (el mismo archivo de la raíz, sin copiarlo) directo por ES modules nativos, sin bundler. Se abre en `http://localhost:PORT/public/`.

Para servir sin escribir server propio ni tocar `package.json`: `npx serve .` (paquete efímero vía `npx`, no se agrega como dependencia — mismo trato que ya recibe `npx supabase` en este proyecto).

Import map en `public/index.html`, porque `src/parser/parserCabb.js` importa `xlsx` con specifier pelado y `src/data/cliente.js` importa `@supabase/supabase-js` de la misma forma — ninguno de los dos resuelve solo en el navegador:

```html
<script type="importmap">
{
  "imports": {
    "xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs",
    "@supabase/supabase-js": "https://esm.sh/@supabase/supabase-js@2.112.4"
  }
}
</script>
```

`xlsx-0.20.3` es la versión publicada en el CDN propio de SheetJS (verificado — no la `0.18.5` desactualizada de npm, que sí queda para los tests en Node). `@supabase/supabase-js@2.112.4` es la versión exacta ya resuelta en `package-lock.json`, para que Node y navegador corran el mismo código.

La config pública de Supabase (URL + publishable key, ambas públicas por diseño, no son secretas) va inline en un `<script>` no-module al principio de `public/index.html`, antes de cargar cualquier módulo:

```html
<script>
  window.SUPABASE_URL = 'https://lseqvbtdzebomxwtqhwu.supabase.co';
  window.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_nuPVo5yqsAFzY1uf6qcWBA_quRRgUFF';
</script>
```

### 5. Renombre de variables (nomenclatura nueva de Supabase)

`.env.example` y `src/data/cliente.js`: `SUPABASE_ANON_KEY` → `SUPABASE_PUBLISHABLE_KEY` (nombre de variable y comentarios). `SUPABASE_URL` no cambia. La lectura en el navegador (`window[nombre]`) ya soportada por `leerVariableEntorno` no cambia de forma, solo el nombre que busca.

### 6. Estructura de archivos nuevos

```
public/
  index.html          — import map, config inline, markup de las 3 pantallas, <script type="module" src="/src/ui/main.js">
  css/import.css       — estilos propios de estas pantallas, sobre css/tokens.css de la raíz (sin copiarlo)
src/ui/
  main.js              — bootstrap: revisa sesión, muestra login o pantalla de inicio
  auth.js              — login (email+contraseña), logout, helper de sesión
  pantallaInicio.js     — Pantalla 1
  pantallaConfirmacion.js — Pantalla 2 (la más grande)
  pantallaResultado.js  — Pantalla 3
src/data/
  prepararPayloadImportacion.js  — nuevo, ver sección 3
  repositorio.js        — se le agrega `importarPartido(payload)` → supabase.rpc('importar_partido', { payload })
  cliente.js            — renombre de variable de entorno (sección 5)
supabase/migrations/
  0004_seed_piloto.sql
  0005_rpc_importar_partido.sql
tests/
  prepararPayloadImportacion.test.js  — nuevo, Node puro
  verificarRpc.js                     — script manual, no en npm test
```

### 7. Auth (Paso 3)

Login con email + contraseña vía `supabase.auth.signInWithPassword`. Sin registro público, sin recuperación de contraseña — las cuentas se crean a mano desde el dashboard durante el piloto (ya documentado en `ESQUEMA.md`). Persistencia de sesión: la que trae el cliente de Supabase por defecto (localStorage) — no se cambia. `main.js` revisa sesión al cargar (`supabase.auth.getSession()`); si no hay sesión, muestra el login; si la hay, pasa a Pantalla 1. Logout: un botón simple, no especificado en detalle en el prompt original, mínimo (texto/ícono en la esquina, sin pantalla propia).

Después de login, se resuelve el/los club(s) del entrenador vía `miembro_club` (una consulta simple `select club_id from miembro_club where user_id = auth.uid()`, se agrega como función a `repositorio.js`). Para el piloto (un solo club) se autoselecciona sin pantalla propia — si en el futuro un entrenador pertenece a más de un club, punto abierto no resuelto en esta etapa (no hay multi-club real en el piloto).

### 8. Las 3 pantallas (verbatim del pedido original, sin cambios de producto)

**Pantalla 1 — Inicio.** Un botón grande: "Cargar partido" (dispara un `<input type="file" accept=".xlsx">` oculto). Nada más compitiendo por atención.

**Pantalla 2 — Confirmación.** Después de elegir el archivo:
1. Parsear con `parsearPartidoCabb`. Si hay `errores`, mostrar en castellano y no seguir.
2. Calcular hash (`calcularHashArchivo`) y chequear duplicado (`buscarImportacionPorHash`) — si ya existe, mensaje claro, no error técnico, no sigue a la confirmación.
3. Elegir equipo propio: los dos nombres de club, grandes, uno al lado del otro (patrón `.opt` en dos columnas, sin preselección). Define `condicionPropia`.
4. Fecha del partido, default hoy.
5. Plantel: sugerido por `codigo_cabb` contra la categoría del título, lista completa de planteles del club para confirmar/cambiar — nunca asignación silenciosa. Cada plantel trae su `temporadaId` (no hace falta pantalla de temporada aparte).
6. Resultado arriba: puntaje propio vs. rival, nombre del rival.
7. Recién con equipo + plantel confirmados se corre `obtenerJugadoresDelClub` + `mapearImportacion`, y se muestran los 4 grupos:
   - Ya cargados (coincidentes sin `requierePertenenciaNueva`) — colapsado, sin acción.
   - Ya existen en otra categoría (coincidentes con `requierePertenenciaNueva: true`) — texto explícito "ya está cargado en U17, se lo suma también a U21".
   - Posible coincidencia (`sugerencias`) — candidato visible, el entrenador elige "es el mismo" / "es otro" por cada una. Obligatorio antes de guardar.
   - Nuevos — checkbox para excluir.
8. Un botón para guardar, que dice cuántos jugadores se crean. Al tocarlo: `prepararPayloadImportacion` con las decisiones tomadas, y `repositorio.importarPartido(payload)`. Deshabilitado mientras está en curso, sin doble envío.

**Pantalla 3 — Resultado.** Una línea con lo que se guardó. Advertencias del parser (si las hay) en un desplegable discreto, no un muro de texto.

**Casos de UI:**
- Archivo ya importado → mensaje claro (paso 2 arriba).
- Archivo no-CABB / corrupto → `errores` del parser en castellano.
- Sin conexión → mensaje explícito (chequeo simple antes de llamar al RPC, o capturar el error de red del cliente Supabase y traducirlo).
- Guardado en curso → botón deshabilitado + texto de estado.

### 9. Visual

Reusar `css/tokens.css` de la raíz sin tocarlo. `public/css/import.css` sigue los mismos patrones que `css/app.css` (sin copiarlo completo — solo lo que estas 3 pantallas necesitan): `.pant`/`.pant.on`, `.btn`/`.btn:disabled`, `.opt`/`.opt.on` (elegir equipo, elegir plantel, sugerencias), `.campo`/`label`/`input` (fecha), `.tarj` (resultado), `.eyebrow` (headers de sección), `.al` (avisos de error/sin-conexión), `.toast`. Targets táctiles ≥44px, contraste alto, contenido importante en la mitad inferior, sin hover como única señal de estado — todo eso ya viene dado por seguir los mismos patrones de `app.css`.

## Fuera de alcance (recordatorio, no se toca)

`src/parser/parserCabb.js`, las 3 migraciones existentes (`0001`-`0003`), vistas de estadísticas/gráficos, tests antropométricos, deploy en Vercel, cualquier framework/bundler/build step, cualquier dependencia nueva sin preguntar.

## Hechos verificados antes de escribir este spec

- Node v22.14.0 (soporta `crypto.subtle` nativo, ya usado por `mapearImportacion.js`).
- Fixtures reales presentes localmente en `tests/fixtures/` (4 archivos) — sirven para la prueba de punta a punta.
- `npx supabase --version` → 2.116.0, disponible vía `npx` sin instalación global.
- `supabase db push --project-ref ... --password ...` sin login previo falla (`LegacyPlatformAuthRequiredError`) — necesita `supabase login` primero, incluso pasando la contraseña de la base por flag.
- `supabase db push --db-url ...` con el host de conexión directa (`db.<ref>.supabase.co`) no resuelve DNS desde este entorno — el proyecto expone pooler, no conexión directa; motivo por el que Paso 0 lo corre el usuario con `link` interactivo en vez de que el agente arme una connection string.
- `@supabase/supabase-js` resuelto en `package-lock.json`: `2.112.4`.
- SheetJS CDN: build ESM en `https://cdn.sheetjs.com/xlsx-<version>/package/xlsx.mjs`; versión actual verificada `0.20.3`.
