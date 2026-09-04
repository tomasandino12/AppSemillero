# Etapa 4 — Estadísticas, mediciones y recursos — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar los datos de ejemplo de MEDIR, RECURSOS y HOY por funcionalidad real, y construir las vistas de estadísticas sobre los partidos importados, sin tocar el flujo de import verificado.

**Architecture:** Cinco tablas nuevas con RLS y dos RPCs transaccionales `security invoker`. Todos los cálculos son funciones puras en `src/data/`, testeadas en Node sin base de datos; las vistas sólo dibujan lo que esas funciones devuelven. La carga en cancha guarda un borrador en `localStorage` en cada tap y manda la sesión entera en una transacción al cerrar.

**Tech Stack:** HTML/CSS/JS vanilla, ES modules nativos, sin build step, sin frameworks, sin bundlers, sin librerías de gráficos. Supabase (Postgres + Auth + RLS + RPC). `node --test` para los tests.

**Spec:** `docs/superpowers/specs/2026-09-04-etapa-4-estadisticas-mediciones-recursos-design.md`

## Global Constraints

- **No se toca `src/parser/parserCabb.js`.** Ni una línea.
- **No se tocan las migraciones `0001`–`0008`.** Las nuevas son `0009`, `0010`, `0011`.
- **No se modifica ninguna función existente de `src/data/repositorio.js`.** Sólo se agregan al final.
- **No se toca la lógica del import:** `mapearImportacion.js`, `prepararPayloadImportacion.js`, `pantallas/confirmacionImport.js`, `pantallas/resultadoImport.js`, `pantallas/retornoImport.js`.
- **Ningún archivo de `src/ui/` importa `@supabase/supabase-js` ni llama a `fetch`.** Todo pasa por `repositorio.js`.
- **Ningún archivo de `src/data/` toca el DOM.**
- **Todos los breakpoints viven en `public/css/layout.css`.** Ninguna media query de ancho en otro archivo.
- **`UMBRAL_INTENTOS = 10`**, definido una sola vez en `src/data/estadisticas.js`.
- **Ningún porcentaje se muestra sin sus intentos al lado.**
- **`NULL` nunca se convierte en `0`.** Se chequea con `== null`, nunca con `!valor`.
- **Toda escritura de más de una fila va por una RPC `security invoker`.**
- **No se agregan dependencias** a `package.json`. Ninguna.
- **Sin jerga estadística en pantalla.** Nada de "índice", "coeficiente", "desviación".
- Todo texto de interfaz en castellano rioplatense, igual que el resto de la app.
- Cada task termina con `npm test` en verde y un commit.

---

## Estructura de archivos

```
supabase/migrations/
  0009_mediciones_y_recursos.sql        Task 1   tablas + RLS + grants + índices
  0010_rpc_guardar_sesion_medicion.sql  Task 2
  0011_rpc_guardar_recurso.sql          Task 3

tests/
  verificarSesionMedicion.js  Task 2   manual, NO va en npm test
  verificarRecurso.js         Task 3   manual, NO va en npm test
  estadisticas.test.js        Tasks 4,5,6
  prepararPayloadMedicion.test.js Task 7
  borradorMedicion.test.js    Task 10
  sinDatosDeEjemplo.test.js   Task 17  guarda de regresión

src/data/
  posiciones.js               Task 4   POSICIONES, POSICIONES_BATERIA, INTENTOS_POR_POSICION
  estadisticas.js             Tasks 4,5,6  (append-only entre tasks)
  prepararPayloadMedicion.js  Task 7
  repositorio.js              Task 8   SÓLO se agregan funciones al final

src/ui/
  borradorMedicion.js         Task 10
  componentes/graficos.js     Task 9   cancha() y grafico() generalizados
  componentes/barras.js       Task 9
  pantallas/medir.js          Task 11  reescrita
  pantallas/medirBateria.js   Task 12
  pantallas/medirVelocidad.js Task 13
  pantallas/datos.js          Task 14  se le agregan secciones
  pantallas/fichaJugador.js   Task 15  se le agregan secciones
  pantallas/recursos.js       Task 16  reescrita
  pantallas/hoy.js            Task 17  reescrita
  pantallas/registro.js       Tasks 11,12,13  append-only

public/index.html             Task 11  2 secciones nuevas
public/css/componentes.css    Tasks 9,11,12,13,14,15,16  clases nuevas

BORRAR en Task 17: src/ui/datosEjemplo.js, src/ui/componentes/bannerEjemplo.js,
                   la regla .banner-ejemplo de componentes.css
```

**Archivos tocados por varias tasks** — `estadisticas.js`, `repositorio.js`, `registro.js`, `index.html`, `componentes.css`. En todos: **agregar, nunca reescribir**. Cada task que los toca debe preservar íntegro lo que ya está.

---

## Task 1: Migración de tablas, RLS y grants

**Modelo sugerido:** capaz — es esquema, y un error acá se arrastra a todo lo demás.

**Files:**
- Create: `supabase/migrations/0009_mediciones_y_recursos.sql`

**Interfaces:**
- Produces: las tablas `sesion_medicion`, `medicion_tiro`, `medicion_velocidad`, `recurso`, `envio_recurso`, que consumen las Tasks 2, 3 y 8.

- [ ] **Step 1: Escribir la migración**

Seguí exactamente las convenciones de `0001_esquema_inicial.sql`: `club_id` en toda tabla, FKs compuestas `(club_id, x_id)` para que un payload a mano no pueda mezclar clubes, y `unique (club_id, id)` en las tablas que son target de una FK compuesta.

```sql
-- Etapa 4: mediciones (batería de tiro y velocidad) y recursos.
--
-- Mismas convenciones que 0001_esquema_inicial.sql: toda tabla de dominio
-- lleva club_id, y las FKs son compuestas (club_id, x_id) para que Postgres
-- garantice que el club coincide, cosa que una FK de una sola columna no
-- puede verificar y que RLS no cubre (RLS no aplica a chequeos de FK).

create table sesion_medicion (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references club(id),
  plantel_id uuid not null,
  fecha date not null,
  tipo text not null check (tipo in ('tiro', 'velocidad')),
  creado_en timestamptz not null default now(),
  unique (club_id, id),
  foreign key (club_id, plantel_id) references plantel (club_id, id)
);

create table medicion_tiro (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references club(id),
  sesion_id uuid not null,
  jugador_id uuid not null,
  posicion text not null check (posicion in ('esq_izq','c45_izq','frontal','c45_der','esq_der','libres')),
  -- anotados NULL = el jugador estuvo pero no midió (ausente). NUNCA 0.
  -- 0 de 10 es un dato real y distinto. Un jugador al que la sesión nunca
  -- llegó no tiene fila: son tres estados y el esquema los distingue.
  anotados integer,
  intentos integer not null default 10 check (intentos > 0),
  check (anotados is null or (anotados >= 0 and anotados <= intentos)),
  unique (sesion_id, jugador_id, posicion),
  foreign key (club_id, sesion_id) references sesion_medicion (club_id, id) on delete cascade,
  foreign key (club_id, jugador_id) references jugador (club_id, id)
);

create table medicion_velocidad (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references club(id),
  sesion_id uuid not null,
  jugador_id uuid not null,
  -- numeric(4,1): el máximo de un decimal queda impuesto por el tipo, no por
  -- una validación de la UI que alguien pueda saltear. Un cronómetro a mano
  -- tiene error humano de ~0.2s; guardar centésimas sería precisión falsa.
  segundos numeric(4,1) check (segundos is null or segundos > 0),
  unique (sesion_id, jugador_id),
  foreign key (club_id, sesion_id) references sesion_medicion (club_id, id) on delete cascade,
  foreign key (club_id, jugador_id) references jugador (club_id, id)
);

create table recurso (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references club(id),
  titulo text not null,
  descripcion text not null,
  -- Nullable: un recurso puede ser sólo instrucciones, sin link.
  enlace text,
  creado_por uuid not null default auth.uid() references auth.users(id),
  creado_en timestamptz not null default now(),
  unique (club_id, id)
);

create table envio_recurso (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references club(id),
  recurso_id uuid not null,
  jugador_id uuid not null,
  fecha date not null,
  -- Reenviar a "todo el plantel" cuando la mitad ya lo tenía suma sólo a los
  -- que faltaban: la RPC usa on conflict do nothing sobre este unique.
  unique (recurso_id, jugador_id),
  foreign key (club_id, recurso_id) references recurso (club_id, id) on delete cascade,
  foreign key (club_id, jugador_id) references jugador (club_id, id)
);

-- Índices: club_id es la columna que usa toda política RLS para el join
-- contra miembro_club; el resto son los patrones de lectura reales
-- (mediciones de una sesión, historial de un jugador, envíos de un recurso).
create index sesion_medicion_club_id_idx on sesion_medicion(club_id);
create index sesion_medicion_plantel_id_idx on sesion_medicion(plantel_id);
create index medicion_tiro_club_id_idx on medicion_tiro(club_id);
create index medicion_tiro_sesion_id_idx on medicion_tiro(sesion_id);
create index medicion_tiro_jugador_id_idx on medicion_tiro(jugador_id);
create index medicion_velocidad_club_id_idx on medicion_velocidad(club_id);
create index medicion_velocidad_sesion_id_idx on medicion_velocidad(sesion_id);
create index medicion_velocidad_jugador_id_idx on medicion_velocidad(jugador_id);
create index recurso_club_id_idx on recurso(club_id);
create index envio_recurso_club_id_idx on envio_recurso(club_id);
create index envio_recurso_recurso_id_idx on envio_recurso(recurso_id);
create index envio_recurso_jugador_id_idx on envio_recurso(jugador_id);

-- RLS: mismo patrón que 0002_rls.sql en las cinco tablas.
alter table sesion_medicion enable row level security;
alter table medicion_tiro enable row level security;
alter table medicion_velocidad enable row level security;
alter table recurso enable row level security;
alter table envio_recurso enable row level security;

create policy sesion_medicion_miembros on sesion_medicion
  for all
  using (exists (select 1 from miembro_club m where m.club_id = sesion_medicion.club_id and m.user_id = auth.uid()))
  with check (exists (select 1 from miembro_club m where m.club_id = sesion_medicion.club_id and m.user_id = auth.uid()));

create policy medicion_tiro_miembros on medicion_tiro
  for all
  using (exists (select 1 from miembro_club m where m.club_id = medicion_tiro.club_id and m.user_id = auth.uid()))
  with check (exists (select 1 from miembro_club m where m.club_id = medicion_tiro.club_id and m.user_id = auth.uid()));

create policy medicion_velocidad_miembros on medicion_velocidad
  for all
  using (exists (select 1 from miembro_club m where m.club_id = medicion_velocidad.club_id and m.user_id = auth.uid()))
  with check (exists (select 1 from miembro_club m where m.club_id = medicion_velocidad.club_id and m.user_id = auth.uid()));

create policy recurso_miembros on recurso
  for all
  using (exists (select 1 from miembro_club m where m.club_id = recurso.club_id and m.user_id = auth.uid()))
  with check (exists (select 1 from miembro_club m where m.club_id = recurso.club_id and m.user_id = auth.uid()));

create policy envio_recurso_miembros on envio_recurso
  for all
  using (exists (select 1 from miembro_club m where m.club_id = envio_recurso.club_id and m.user_id = auth.uid()))
  with check (exists (select 1 from miembro_club m where m.club_id = envio_recurso.club_id and m.user_id = auth.uid()));

-- Postgres exige AMBAS cosas: el GRANT de tabla y una policy de RLS. Faltó
-- en 0002 y apareció en producción como 42501 (ver 0006_grants_authenticated.sql).
grant select, insert, update, delete on
  sesion_medicion,
  medicion_tiro,
  medicion_velocidad,
  recurso,
  envio_recurso
to authenticated;
```

- [ ] **Step 2: Verificar que no se tocó ninguna migración existente**

Run: `git status --short supabase/migrations/`
Expected: exactamente una línea, `?? supabase/migrations/0009_mediciones_y_recursos.sql`. Si aparece cualquier `M` sobre `0001`–`0008`, revertilo.

- [ ] **Step 3: Verificar que `npm test` sigue verde**

Run: `npm test`
Expected: `# fail 0`. La migración no afecta los tests (no hay base en `npm test`), pero confirma que no se rompió nada.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0009_mediciones_y_recursos.sql
git commit -m "feat: add measurement and resource tables with RLS and grants"
```

---

## Task 2: RPC de sesión de medición + script de rollback

**Modelo sugerido:** capaz — es la transaccionalidad de ~84 filas, el caso más crítico de la etapa.

**Files:**
- Create: `supabase/migrations/0010_rpc_guardar_sesion_medicion.sql`
- Create: `tests/verificarSesionMedicion.js`

**Interfaces:**
- Consumes: las tablas de la Task 1.
- Produces: la función Postgres `guardar_sesion_medicion(payload jsonb) returns jsonb`, que consume `repositorio.guardarSesionMedicion` en la Task 8.

- [ ] **Step 1: Escribir la RPC**

Mirá `0005_rpc_importar_partido.sql` y `0008_rpc_alta_jugador.sql` para el patrón exacto. `security invoker` siempre — nunca `security definer`, porque eso saltearía RLS.

```sql
-- Etapa 4: guardar una sesión de medición entera en una transacción.
--
-- Una batería de 14 jugadores son ~84 filas. El entrenador está en el
-- gimnasio con wifi inestable: o se guarda todo, o no se guarda nada y el
-- borrador local sigue intacto para reintentar. Una llamada RPC vía
-- PostgREST es una única transacción: cualquier excepción no capturada
-- aborta el bloque completo, incluida la sesión ya insertada.
--
-- security invoker: corre con los permisos del que llama, sujeto a las
-- mismas políticas RLS que un insert directo (0009). Sin elevación.
create or replace function guardar_sesion_medicion(payload jsonb)
returns jsonb
language plpgsql
security invoker
as $$
declare
  v_sesion_id uuid;
  v_tipo text;
  v_club_id uuid;
  m jsonb;
begin
  v_tipo := payload->>'tipo';
  v_club_id := (payload->>'clubId')::uuid;

  if v_tipo not in ('tiro', 'velocidad') then
    raise exception 'TIPO_DE_SESION_INVALIDO' using errcode = 'P0001';
  end if;

  insert into sesion_medicion (club_id, plantel_id, fecha, tipo)
  values (
    v_club_id,
    (payload->>'plantelId')::uuid,
    (payload->>'fecha')::date,
    v_tipo
  )
  returning id into v_sesion_id;

  if v_tipo = 'tiro' then
    for m in select * from jsonb_array_elements(coalesce(payload->'mediciones', '[]'::jsonb))
    loop
      -- m->>'anotados' devuelve NULL tanto si la clave falta como si su
      -- valor es JSON null: los dos casos son "no midió", y NULL::int es NULL.
      insert into medicion_tiro (club_id, sesion_id, jugador_id, posicion, anotados, intentos)
      values (
        v_club_id,
        v_sesion_id,
        (m->>'jugadorId')::uuid,
        m->>'posicion',
        (m->>'anotados')::int,
        coalesce((m->>'intentos')::int, 10)
      );
    end loop;
  else
    for m in select * from jsonb_array_elements(coalesce(payload->'mediciones', '[]'::jsonb))
    loop
      insert into medicion_velocidad (club_id, sesion_id, jugador_id, segundos)
      values (
        v_club_id,
        v_sesion_id,
        (m->>'jugadorId')::uuid,
        (m->>'segundos')::numeric
      );
    end loop;
  end if;

  return jsonb_build_object(
    'sesionId', v_sesion_id,
    'filas', jsonb_array_length(coalesce(payload->'mediciones', '[]'::jsonb))
  );
end;
$$;
```

- [ ] **Step 2: Escribir el script de verificación de rollback**

Copiá la forma de `tests/verificarAltaJugador.js`. La idea: mandar un payload donde la ÚLTIMA fila tiene un `jugadorId` inexistente, confirmar que la RPC falla, y confirmar que **no quedó ni la sesión ni ninguna de las filas anteriores**.

```js
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const email = process.env.VERIFICAR_RPC_EMAIL;
const password = process.env.VERIFICAR_RPC_PASSWORD;

if (!url || !publishableKey || !email || !password) {
  console.error('Uso: SUPABASE_URL=... SUPABASE_PUBLISHABLE_KEY=... VERIFICAR_RPC_EMAIL=... VERIFICAR_RPC_PASSWORD=... node tests/verificarSesionMedicion.js');
  process.exit(1);
}

const supabase = createClient(url, publishableKey);

async function main() {
  const { error: errorLogin } = await supabase.auth.signInWithPassword({ email, password });
  if (errorLogin) { console.error('No se pudo iniciar sesión:', errorLogin.message); process.exit(1); }

  const { data: clubes, error: errorClubes } = await supabase.from('club').select('id');
  if (errorClubes || !clubes?.length) { console.error('No se encontró ningún club:', errorClubes?.message); process.exit(1); }
  const clubId = clubes[0].id;

  const { data: planteles, error: errorPlanteles } = await supabase.from('plantel').select('id').eq('club_id', clubId).limit(1);
  if (errorPlanteles || !planteles?.length) { console.error('No se encontró ningún plantel:', errorPlanteles?.message); process.exit(1); }
  const plantelId = planteles[0].id;

  const { data: jugadores, error: errorJugadores } = await supabase.from('jugador').select('id').eq('club_id', clubId).limit(1);
  if (errorJugadores || !jugadores?.length) { console.error('No se encontró ningún jugador — cargá al menos uno antes de correr esto:', errorJugadores?.message); process.exit(1); }
  const jugadorId = jugadores[0].id;

  // Fecha marcadora: sirve para buscar la sesión después y confirmar que no quedó.
  const fecha = '1999-01-01';

  // Las 2 primeras filas son válidas; la 3ra tiene un jugador inexistente y
  // viola la FK compuesta (club_id, jugador_id). Si la transacción funciona,
  // las 2 primeras tampoco quedan, y la sesión tampoco.
  const payloadRoto = {
    clubId,
    plantelId,
    fecha,
    tipo: 'tiro',
    mediciones: [
      { jugadorId, posicion: 'esq_izq', anotados: 7, intentos: 10 },
      { jugadorId, posicion: 'frontal', anotados: null, intentos: 10 },
      { jugadorId: '00000000-0000-0000-0000-000000000000', posicion: 'libres', anotados: 5, intentos: 10 },
    ],
  };

  const { error: errorRpc } = await supabase.rpc('guardar_sesion_medicion', { payload: payloadRoto });
  if (!errorRpc) { console.error('FALLO: el RPC no tiró error con un jugador inexistente — el rollback no se está probando.'); process.exit(1); }
  console.log('OK: el RPC rechazó el payload roto:', errorRpc.message);

  const { data: sesiones, error: errorSesiones } = await supabase
    .from('sesion_medicion').select('id').eq('club_id', clubId).eq('fecha', fecha);
  if (errorSesiones) { console.error('No se pudo verificar si quedó la sesión:', errorSesiones.message); process.exit(1); }
  if (sesiones.length) { console.error('FALLO: quedó la sesión huérfana — el rollback no funcionó.'); process.exit(1); }
  console.log('OK: no quedó ninguna sesión — el rollback fue completo.');

  console.log('\nVerificación de rollback de la sesión de medición: PASS');
}

main();
```

- [ ] **Step 3: Verificar la sintaxis del script**

Run: `node --check tests/verificarSesionMedicion.js`
Expected: sin salida (sintaxis válida).

- [ ] **Step 4: Confirmar que NO se agregó a `npm test`**

Run: `grep -c "verificarSesionMedicion" package.json`
Expected: `0`. Este script necesita base de datos y credenciales; `npm test` tiene que correr sin conexión.

- [ ] **Step 5: `npm test` verde y commit**

```bash
npm test
git add supabase/migrations/0010_rpc_guardar_sesion_medicion.sql tests/verificarSesionMedicion.js
git commit -m "feat: add transactional RPC for saving a measurement session"
```

---

## Task 3: RPC de recurso + script de rollback

**Modelo sugerido:** medio — es la misma forma que la Task 2, más chica.

**Files:**
- Create: `supabase/migrations/0011_rpc_guardar_recurso.sql`
- Create: `tests/verificarRecurso.js`

**Interfaces:**
- Consumes: las tablas de la Task 1.
- Produces: `guardar_recurso(payload jsonb) returns jsonb`, que consume `repositorio.guardarRecurso` en la Task 8.

- [ ] **Step 1: Escribir la RPC**

```sql
-- Etapa 4: crear un recurso y sus envíos en una sola transacción.
--
-- Crear el recurso y no registrar a quién se le mandó deja exactamente el
-- agujero de memoria que la app existe para tapar. security invoker, igual
-- que el resto (ver 0005 y 0008).
create or replace function guardar_recurso(payload jsonb)
returns jsonb
language plpgsql
security invoker
as $$
declare
  v_recurso_id uuid;
  v_club_id uuid;
  j jsonb;
begin
  v_club_id := (payload->>'clubId')::uuid;
  v_recurso_id := (payload->>'recursoId')::uuid;

  -- Sin recursoId se crea uno nuevo; con recursoId se agregan envíos a uno
  -- que ya existe (reenviar a más jugadores sin duplicar el recurso).
  if v_recurso_id is null then
    insert into recurso (club_id, titulo, descripcion, enlace)
    values (
      v_club_id,
      payload->>'titulo',
      payload->>'descripcion',
      payload->>'enlace'
    )
    returning id into v_recurso_id;
  end if;

  for j in select * from jsonb_array_elements(coalesce(payload->'jugadorIds', '[]'::jsonb))
  loop
    insert into envio_recurso (club_id, recurso_id, jugador_id, fecha)
    values (
      v_club_id,
      v_recurso_id,
      (j#>>'{}')::uuid,
      (payload->>'fecha')::date
    )
    -- Reenviar a quien ya lo tenía no es un error: la intención "estos
    -- jugadores tienen que tener este recurso" queda satisfecha igual.
    on conflict (recurso_id, jugador_id) do nothing;
  end loop;

  return jsonb_build_object('recursoId', v_recurso_id);
end;
$$;
```

- [ ] **Step 2: Escribir el script de verificación**

Misma forma que la Task 2: el recurso se crea y el envío falla por FK, así que **no puede quedar el recurso**.

```js
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const email = process.env.VERIFICAR_RPC_EMAIL;
const password = process.env.VERIFICAR_RPC_PASSWORD;

if (!url || !publishableKey || !email || !password) {
  console.error('Uso: SUPABASE_URL=... SUPABASE_PUBLISHABLE_KEY=... VERIFICAR_RPC_EMAIL=... VERIFICAR_RPC_PASSWORD=... node tests/verificarRecurso.js');
  process.exit(1);
}

const supabase = createClient(url, publishableKey);

async function main() {
  const { error: errorLogin } = await supabase.auth.signInWithPassword({ email, password });
  if (errorLogin) { console.error('No se pudo iniciar sesión:', errorLogin.message); process.exit(1); }

  const { data: clubes, error: errorClubes } = await supabase.from('club').select('id');
  if (errorClubes || !clubes?.length) { console.error('No se encontró ningún club:', errorClubes?.message); process.exit(1); }
  const clubId = clubes[0].id;

  const titulo = 'VERIFICAR RECURSO ' + Date.now();

  // El recurso se inserta bien; el envío viola la FK compuesta
  // (club_id, jugador_id). Toda la transacción debe abortar y el recurso
  // no puede quedar sin sus envíos.
  const payloadRoto = {
    clubId,
    titulo,
    descripcion: 'Payload de verificación de rollback.',
    enlace: null,
    fecha: '1999-01-01',
    jugadorIds: ['00000000-0000-0000-0000-000000000000'],
  };

  const { error: errorRpc } = await supabase.rpc('guardar_recurso', { payload: payloadRoto });
  if (!errorRpc) { console.error('FALLO: el RPC no tiró error con un jugador inexistente — el rollback no se está probando.'); process.exit(1); }
  console.log('OK: el RPC rechazó el payload roto:', errorRpc.message);

  const { data: recursos, error: errorRecursos } = await supabase
    .from('recurso').select('id').eq('club_id', clubId).eq('titulo', titulo);
  if (errorRecursos) { console.error('No se pudo verificar si quedó el recurso:', errorRecursos.message); process.exit(1); }
  if (recursos.length) { console.error('FALLO: quedó el recurso sin envíos — el rollback no funcionó.'); process.exit(1); }
  console.log('OK: no quedó ningún recurso — el rollback fue completo.');

  console.log('\nVerificación de rollback del recurso: PASS');
}

main();
```

- [ ] **Step 3: Verificar sintaxis, que no está en `npm test`, y commit**

```bash
node --check tests/verificarRecurso.js
grep -c "verificarRecurso" package.json   # Expected: 0
npm test
git add supabase/migrations/0011_rpc_guardar_recurso.sql tests/verificarRecurso.js
git commit -m "feat: add transactional RPC for creating and sending a resource"
```

---

## Task 4: Posiciones y núcleo de estadísticas

**Modelo sugerido:** barato — el código está entero acá abajo, es transcripción más tests.

**Files:**
- Create: `src/data/posiciones.js`
- Create: `src/data/estadisticas.js`
- Create: `tests/estadisticas.test.js`
- Modify: `package.json` (agregar el test nuevo al script)

**Interfaces:**
- Produces:
  - `POSICIONES` — array de `{id, nombre, corto, x, y}`, las 5 del arco.
  - `POSICIONES_BATERIA` — las 5 más `{id:'libres', nombre:'Tiros libres', corto:'LIBRES'}`.
  - `INTENTOS_POR_POSICION = 10`.
  - `UMBRAL_INTENTOS = 10`, `esMuestraChica(intentos)`, `porcentaje(anotados, intentos)`.

- [ ] **Step 1: Escribir `src/data/posiciones.js`**

```js
/**
 * Las posiciones de la batería de tiro, con la geometría que usa cancha()
 * para dibujarlas.
 *
 * Es dato real de la app, no de ejemplo: sale de datosEjemplo.js (que se
 * borra en la Task 17) porque nunca fue un dato inventado, sólo estaba
 * guardado en el archivo equivocado.
 *
 * Las 5 caen sobre el arco de triples: el arco se dibuja en
 * "M28 284 L28 232 A126 126 0 0 1 272 232 L272 284" y cada posición está
 * sobre él (el desfasaje de ~12px hacia adentro es padding visual para que
 * los círculos de r=21 no se salgan de la cancha). Por eso la pareja
 * honesta contra el partido es `tres`, y no una posición contra otra: el
 * boxscore de la CABB no dice desde dónde se tiró. Ver el spec, sección 1.
 */
export const POSICIONES = [
  { id: 'esq_izq', nombre: 'Esquina izquierda', corto: 'ESQ IZQ', x: 32, y: 236 },
  { id: 'c45_izq', nombre: '45° izquierda', corto: '45 IZQ', x: 58, y: 158 },
  { id: 'frontal', nombre: 'Frontal', corto: 'FRONTAL', x: 150, y: 118 },
  { id: 'c45_der', nombre: '45° derecha', corto: '45 DER', x: 242, y: 158 },
  { id: 'esq_der', nombre: 'Esquina derecha', corto: 'ESQ DER', x: 268, y: 236 },
];

/** Libres no se dibuja en la cancha: se mide y se grafica aparte. */
export const LIBRES = { id: 'libres', nombre: 'Tiros libres', corto: 'LIBRES' };

/** Las 6 que se cargan en una batería. */
export const POSICIONES_BATERIA = [...POSICIONES, LIBRES];

/** Siempre 10 intentos por posición. Es lo que define el protocolo. */
export const INTENTOS_POR_POSICION = 10;
```

- [ ] **Step 2: Escribir el test que falla**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UMBRAL_INTENTOS, esMuestraChica, porcentaje } from '../src/data/estadisticas.js';
import { POSICIONES, POSICIONES_BATERIA, INTENTOS_POR_POSICION } from '../src/data/posiciones.js';

test('la batería tiene 5 posiciones de arco más libres', () => {
  assert.equal(POSICIONES.length, 5);
  assert.equal(POSICIONES_BATERIA.length, 6);
  assert.equal(POSICIONES_BATERIA[5].id, 'libres');
  assert.equal(INTENTOS_POR_POSICION, 10);
});

test('el umbral de muestra chica es 10 intentos', () => {
  assert.equal(UMBRAL_INTENTOS, 10);
  assert.equal(esMuestraChica(9), true);
  assert.equal(esMuestraChica(10), false);
  assert.equal(esMuestraChica(35), false);
  assert.equal(esMuestraChica(null), true);
});

test('porcentaje devuelve el denominador junto al porcentaje, nunca un número pelado', () => {
  assert.deepEqual(porcentaje(7, 10), { pct: 70, anotados: 7, intentos: 10, muestraChica: false });
  assert.deepEqual(porcentaje(11, 35), { pct: 31, anotados: 11, intentos: 35, muestraChica: false });
});

test('una muestra por debajo del umbral queda marcada', () => {
  assert.equal(porcentaje(1, 2).muestraChica, true);
  assert.equal(porcentaje(9, 9).muestraChica, true);
});

test('cero anotados es un dato real, no ausencia de dato', () => {
  assert.deepEqual(porcentaje(0, 10), { pct: 0, anotados: 0, intentos: 10, muestraChica: false });
});

test('sin medir devuelve null, y nunca se confunde con cero', () => {
  assert.equal(porcentaje(null, 10), null);
  assert.equal(porcentaje(undefined, 10), null);
  assert.equal(porcentaje(5, null), null);
  assert.equal(porcentaje(5, 0), null);
  // La diferencia que importa: 0/10 SÍ es un dato, null/10 NO lo es.
  assert.notEqual(porcentaje(0, 10), null);
});
```

- [ ] **Step 3: Correr el test para verificar que falla**

Run: `node --test tests/estadisticas.test.js`
Expected: FAIL — `Cannot find module '.../src/data/estadisticas.js'`.

- [ ] **Step 4: Escribir `src/data/estadisticas.js`**

```js
/**
 * Cálculos estadísticos. Funciones puras: sin red, sin DOM, sin estado.
 * Las vistas sólo dibujan lo que estas funciones devuelven.
 */

/**
 * Umbral de muestra chica: por debajo de esta cantidad de intentos, un
 * porcentaje se muestra atenuado y marcado como "pocos datos".
 *
 * 10 es el tamaño fijo de una posición de la batería. Un chico de U17 tira
 * pocos triples por partido: mostrar un 50% que sale de 1 de 2 le enseña al
 * entrenador a leer ruido como si fuera señal.
 *
 * Es el ÚNICO lugar donde vive este número. Para ajustarlo, se cambia acá.
 */
export const UMBRAL_INTENTOS = 10;

export function esMuestraChica(intentos) {
  return intentos == null || intentos < UMBRAL_INTENTOS;
}

/**
 * Nunca devuelve un número pelado: quien quiera pintar el porcentaje tiene
 * el denominador en la mano sí o sí. Es la forma de que "ningún porcentaje
 * sin sus intentos" sea estructural y no una regla que alguien recuerde.
 *
 * Devuelve null cuando no hay nada que mostrar (sin intentos, o sin medir).
 * OJO: 0 anotados sobre 10 intentos NO es null — es un dato real.
 */
export function porcentaje(anotados, intentos) {
  if (anotados == null || intentos == null || intentos === 0) return null;
  return {
    pct: Math.round((anotados / intentos) * 100),
    anotados,
    intentos,
    muestraChica: esMuestraChica(intentos),
  };
}
```

- [ ] **Step 5: Correr el test para verificar que pasa**

Run: `node --test tests/estadisticas.test.js`
Expected: `# fail 0`.

- [ ] **Step 6: Agregar el test al script de `npm test`**

En `package.json`, agregá `tests/estadisticas.test.js` al final de la lista del script `test`. Preservá los cuatro archivos que ya están.

Run: `npm test`
Expected: `# fail 0`, y el total de tests sube.

- [ ] **Step 7: Commit**

```bash
git add src/data/posiciones.js src/data/estadisticas.js tests/estadisticas.test.js package.json
git commit -m "feat: add shooting positions and the small-sample threshold"
```

---

## Task 5: Estadísticas de equipo

**Modelo sugerido:** barato — código completo abajo más tests.

**Files:**
- Modify: `src/data/estadisticas.js` (**append-only**: no toques `UMBRAL_INTENTOS`, `esMuestraChica` ni `porcentaje`)
- Modify: `tests/estadisticas.test.js` (append-only)

**Interfaces:**
- Consumes: `porcentaje()` de la Task 4.
- Produces:
  - `repartoPorJugador(estadisticas, campo)` → `{ total, filas: [{jugadorId, valor, porcentajeDelTotal}], jugadoresQueConcentranLaMitad, filasSinDato }`
  - `evolucionDeTiroDelEquipo(partidos, estadisticas)` → `[{partidoId, fecha, dos, tres, libres}]` ordenado por fecha ascendente, donde cada campo es el objeto de `porcentaje()` o null.

`estadisticas` son filas con la forma que devuelve `repositorio.obtenerEstadisticasDelPlantel` (Task 8): `{jugadorId, partidoId, minSegundos, pts, dosAnotados, dosIntentados, tresAnotados, tresIntentados, libresAnotados, libresIntentados}`. `partidos` son `{id, fecha, rivalNombre}`.

- [ ] **Step 1: Escribir los tests que fallan**

Agregalos al final de `tests/estadisticas.test.js`, y sumá los nombres nuevos al `import` de arriba.

```js
test('el reparto ordena de mayor a menor y calcula el porcentaje del total', () => {
  const estadisticas = [
    { jugadorId: 'a', partidoId: 'p1', pts: 10 },
    { jugadorId: 'b', partidoId: 'p1', pts: 5 },
    { jugadorId: 'a', partidoId: 'p2', pts: 5 },
  ];
  const r = repartoPorJugador(estadisticas, 'pts');
  assert.equal(r.total, 20);
  assert.deepEqual(r.filas.map((f) => f.jugadorId), ['a', 'b']);
  assert.equal(r.filas[0].valor, 15);
  assert.equal(r.filas[0].porcentajeDelTotal, 75);
});

test('los NULL no suman al reparto y se cuentan aparte', () => {
  const estadisticas = [
    { jugadorId: 'a', partidoId: 'p1', minSegundos: 600 },
    { jugadorId: 'b', partidoId: 'p1', minSegundos: null },
  ];
  const r = repartoPorJugador(estadisticas, 'minSegundos');
  assert.equal(r.total, 600);
  assert.equal(r.filasSinDato, 1);
  assert.equal(r.filas.length, 1);
});

test('cuántos jugadores concentran más de la mitad', () => {
  // 10+5+3+2 = 20. El primero tiene exactamente la mitad, que NO es "más de
  // la mitad": hacen falta dos.
  const estadisticas = [
    { jugadorId: 'a', partidoId: 'p1', pts: 10 },
    { jugadorId: 'b', partidoId: 'p1', pts: 5 },
    { jugadorId: 'c', partidoId: 'p1', pts: 3 },
    { jugadorId: 'd', partidoId: 'p1', pts: 2 },
  ];
  assert.equal(repartoPorJugador(estadisticas, 'pts').jugadoresQueConcentranLaMitad, 2);
});

test('el reparto vacío no rompe', () => {
  const r = repartoPorJugador([], 'pts');
  assert.equal(r.total, 0);
  assert.deepEqual(r.filas, []);
  assert.equal(r.jugadoresQueConcentranLaMitad, 0);
});

test('la evolución del equipo suma las filas de cada partido y ordena por fecha', () => {
  const partidos = [
    { id: 'p2', fecha: '2026-05-10' },
    { id: 'p1', fecha: '2026-05-01' },
  ];
  const estadisticas = [
    { jugadorId: 'a', partidoId: 'p1', tresAnotados: 2, tresIntentados: 6, dosAnotados: 3, dosIntentados: 5, libresAnotados: 1, libresIntentados: 2 },
    { jugadorId: 'b', partidoId: 'p1', tresAnotados: 1, tresIntentados: 4, dosAnotados: 2, dosIntentados: 5, libresAnotados: 0, libresIntentados: 0 },
    { jugadorId: 'a', partidoId: 'p2', tresAnotados: 4, tresIntentados: 10, dosAnotados: 1, dosIntentados: 2, libresAnotados: 3, libresIntentados: 4 },
  ];
  const ev = evolucionDeTiroDelEquipo(partidos, estadisticas);
  assert.deepEqual(ev.map((e) => e.fecha), ['2026-05-01', '2026-05-10']);
  // p1: 3 de 10 triples entre los dos jugadores.
  assert.equal(ev[0].tres.anotados, 3);
  assert.equal(ev[0].tres.intentos, 10);
  assert.equal(ev[0].tres.pct, 30);
  assert.equal(ev[0].tres.muestraChica, false);
  // p2: 4 de 10, y los libres del partido son 3 de 4 → muestra chica.
  assert.equal(ev[1].libres.muestraChica, true);
});

test('un partido sin estadísticas cargadas no rompe la evolución', () => {
  const ev = evolucionDeTiroDelEquipo([{ id: 'p1', fecha: '2026-05-01' }], []);
  assert.equal(ev.length, 1);
  assert.equal(ev[0].tres, null);
});
```

- [ ] **Step 2: Correr para verificar que falla**

Run: `node --test tests/estadisticas.test.js`
Expected: FAIL — `repartoPorJugador is not defined`.

- [ ] **Step 3: Agregar las funciones al final de `src/data/estadisticas.js`**

```js
/**
 * Reparto de un campo acumulable (minutos, puntos) entre los jugadores del
 * plantel, ordenado de mayor a menor.
 *
 * Los NULL no suman y se cuentan aparte: un minuto que no se pudo leer del
 * archivo no es un minuto que no se jugó.
 */
export function repartoPorJugador(estadisticas, campo) {
  const porJugador = new Map();
  let filasSinDato = 0;

  for (const e of estadisticas) {
    const valor = e[campo];
    if (valor == null) { filasSinDato += 1; continue; }
    porJugador.set(e.jugadorId, (porJugador.get(e.jugadorId) ?? 0) + valor);
  }

  const total = [...porJugador.values()].reduce((s, v) => s + v, 0);
  const filas = [...porJugador.entries()]
    .map(([jugadorId, valor]) => ({
      jugadorId,
      valor,
      porcentajeDelTotal: total === 0 ? 0 : (valor / total) * 100,
    }))
    .sort((a, b) => b.valor - a.valor);

  // "Cuántos concentran la mayoría": se acumula de mayor a menor hasta pasar
  // el 50%. Es literalmente "más de la mitad" — no un índice estadístico, que
  // es justo lo que no queremos mostrarle a un entrenador.
  let acumulado = 0;
  let jugadoresQueConcentranLaMitad = 0;
  if (total > 0) {
    for (const fila of filas) {
      acumulado += fila.valor;
      jugadoresQueConcentranLaMitad += 1;
      if (acumulado > total / 2) break;
    }
  }

  return { total, filas, jugadoresQueConcentranLaMitad, filasSinDato };
}

const CAMPOS_DE_TIRO = [
  'dosAnotados', 'dosIntentados',
  'tresAnotados', 'tresIntentados',
  'libresAnotados', 'libresIntentados',
];

/**
 * Porcentajes de tiro del equipo, partido a partido, ordenados por fecha.
 *
 * Los totales del equipo no están guardados en ningún lado: se suman las
 * filas de estadistica_jugador_partido de ese partido, que por diseño son
 * sólo jugadores propios (del rival nunca se guarda un jugador).
 */
export function evolucionDeTiroDelEquipo(partidos, estadisticas) {
  const porPartido = new Map();

  for (const e of estadisticas) {
    if (!porPartido.has(e.partidoId)) {
      porPartido.set(e.partidoId, Object.fromEntries(CAMPOS_DE_TIRO.map((c) => [c, 0])));
    }
    const acum = porPartido.get(e.partidoId);
    for (const campo of CAMPOS_DE_TIRO) {
      if (e[campo] != null) acum[campo] += e[campo];
    }
  }

  return [...partidos]
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .map((p) => {
      const a = porPartido.get(p.id) ?? Object.fromEntries(CAMPOS_DE_TIRO.map((c) => [c, 0]));
      return {
        partidoId: p.id,
        fecha: p.fecha,
        dos: porcentaje(a.dosAnotados, a.dosIntentados),
        tres: porcentaje(a.tresAnotados, a.tresIntentados),
        libres: porcentaje(a.libresAnotados, a.libresIntentados),
      };
    });
}
```

- [ ] **Step 4: Correr los tests y commitear**

```bash
npm test          # Expected: # fail 0
git add src/data/estadisticas.js tests/estadisticas.test.js
git commit -m "feat: add team distribution and shooting evolution calculations"
```

---

## Task 6: Estadísticas por jugador

**Modelo sugerido:** medio — `serieDeTiroDelJugador` es la función con más lógica de la etapa.

**Files:**
- Modify: `src/data/estadisticas.js` (**append-only**)
- Modify: `tests/estadisticas.test.js` (append-only)

**Interfaces:**
- Consumes: `porcentaje()` de la Task 4.
- Produces:
  - `serieDeTiroDelJugador({sesiones, medicionesTiro, partidos, estadisticas, jugadorId})` → `{triples: {practica: [{fecha, valor}], partido: [{fecha, valor}]}, libres: {...}}`
  - `ultimaBateriaDeJugador(sesiones, medicionesTiro, jugadorId)` → `{sesionId, fecha, porPosicion}` o null
  - `historialDePartidosDelJugador(partidos, estadisticas, jugadorId)` → array, más reciente primero
  - `promedioDeCanchaDelPlantel(sesiones, medicionesTiro)` → `{sesionId, fecha, porPosicion}` o null

`sesiones` son `{id, fecha, tipo}`; `medicionesTiro` son `{sesionId, jugadorId, posicion, anotados, intentos}`.

- [ ] **Step 1: Escribir los tests que fallan**

```js
const SESIONES = [
  { id: 's1', fecha: '2026-03-05', tipo: 'tiro' },
  { id: 's2', fecha: '2026-04-05', tipo: 'tiro' },
  { id: 's3', fecha: '2026-04-05', tipo: 'velocidad' },
];

// s1: 5 posiciones de arco a 4/10 cada una = 20/50, y libres 8/10.
// s2: sólo libres, 6/10 (el chico faltó a lo demás no: simplemente no se midió).
const MEDICIONES = [
  ...['esq_izq', 'c45_izq', 'frontal', 'c45_der', 'esq_der'].map((posicion) => (
    { sesionId: 's1', jugadorId: 'j1', posicion, anotados: 4, intentos: 10 }
  )),
  { sesionId: 's1', jugadorId: 'j1', posicion: 'libres', anotados: 8, intentos: 10 },
  { sesionId: 's2', jugadorId: 'j1', posicion: 'libres', anotados: 6, intentos: 10 },
  // Otro jugador, ausente en s1: filas en NULL.
  ...['esq_izq', 'libres'].map((posicion) => (
    { sesionId: 's1', jugadorId: 'j2', posicion, anotados: null, intentos: 10 }
  )),
];

const PARTIDOS = [
  { id: 'p1', fecha: '2026-03-20', rivalNombre: 'Rival A' },
  { id: 'p2', fecha: '2026-04-20', rivalNombre: 'Rival B' },
];

const ESTADISTICAS = [
  { jugadorId: 'j1', partidoId: 'p1', minSegundos: 1200, pts: 9, dosAnotados: 2, dosIntentados: 4, tresAnotados: 1, tresIntentados: 5, libresAnotados: 2, libresIntentados: 2 },
  { jugadorId: 'j1', partidoId: 'p2', minSegundos: 900, pts: 5, dosAnotados: 1, dosIntentados: 3, tresAnotados: 1, tresIntentados: 2, libresAnotados: 0, libresIntentados: 1 },
];

test('la serie de triples suma las 5 posiciones del arco de cada sesión', () => {
  const s = serieDeTiroDelJugador({ sesiones: SESIONES, medicionesTiro: MEDICIONES, partidos: PARTIDOS, estadisticas: ESTADISTICAS, jugadorId: 'j1' });
  assert.equal(s.triples.practica.length, 1);
  assert.equal(s.triples.practica[0].fecha, '2026-03-05');
  assert.equal(s.triples.practica[0].valor.anotados, 20);
  assert.equal(s.triples.practica[0].valor.intentos, 50);
  assert.equal(s.triples.practica[0].valor.pct, 40);
});

test('libres es su propia serie y no entra en triples', () => {
  const s = serieDeTiroDelJugador({ sesiones: SESIONES, medicionesTiro: MEDICIONES, partidos: PARTIDOS, estadisticas: ESTADISTICAS, jugadorId: 'j1' });
  assert.deepEqual(s.libres.practica.map((p) => p.valor.anotados), [8, 6]);
  assert.deepEqual(s.libres.practica.map((p) => p.fecha), ['2026-03-05', '2026-04-05']);
});

test('la serie de partido sale de las estadísticas importadas, ordenada por fecha', () => {
  const s = serieDeTiroDelJugador({ sesiones: SESIONES, medicionesTiro: MEDICIONES, partidos: PARTIDOS, estadisticas: ESTADISTICAS, jugadorId: 'j1' });
  assert.deepEqual(s.triples.partido.map((p) => p.fecha), ['2026-03-20', '2026-04-20']);
  assert.equal(s.triples.partido[0].valor.intentos, 5);
  assert.equal(s.triples.partido[0].valor.muestraChica, true);
});

test('un jugador ausente no aporta puntos a la serie', () => {
  const s = serieDeTiroDelJugador({ sesiones: SESIONES, medicionesTiro: MEDICIONES, partidos: PARTIDOS, estadisticas: ESTADISTICAS, jugadorId: 'j2' });
  assert.deepEqual(s.triples.practica, []);
  assert.deepEqual(s.libres.practica, []);
});

test('un jugador sin nada devuelve series vacías, no rompe', () => {
  const s = serieDeTiroDelJugador({ sesiones: [], medicionesTiro: [], partidos: [], estadisticas: [], jugadorId: 'j9' });
  assert.deepEqual(s.triples.practica, []);
  assert.deepEqual(s.libres.partido, []);
});

test('la última batería es la sesión de tiro más reciente donde el jugador midió', () => {
  const b = ultimaBateriaDeJugador(SESIONES, MEDICIONES, 'j1');
  assert.equal(b.fecha, '2026-04-05');
  assert.equal(b.porPosicion.libres.anotados, 6);
});

test('un jugador ausente tiene batería con la posición en null, no en cero', () => {
  const b = ultimaBateriaDeJugador(SESIONES, MEDICIONES, 'j2');
  assert.equal(b.fecha, '2026-03-05');
  assert.equal(b.porPosicion.esq_izq, null);
});

test('sin ninguna batería devuelve null', () => {
  assert.equal(ultimaBateriaDeJugador([], [], 'j1'), null);
  assert.equal(promedioDeCanchaDelPlantel([], []), null);
});

test('el historial de partidos va del más reciente al más viejo', () => {
  const h = historialDePartidosDelJugador(PARTIDOS, ESTADISTICAS, 'j1');
  assert.deepEqual(h.map((x) => x.fecha), ['2026-04-20', '2026-03-20']);
  assert.equal(h[0].rivalNombre, 'Rival B');
  assert.equal(h[0].pts, 5);
  assert.equal(h[0].libres.pct, 0);       // 0 de 1: dato real
  assert.equal(h[1].libres.pct, 100);
});

test('el promedio del plantel usa la última sesión de tiro y saltea los ausentes', () => {
  const p = promedioDeCanchaDelPlantel(SESIONES, MEDICIONES);
  assert.equal(p.fecha, '2026-04-05');
  assert.equal(p.porPosicion.libres.anotados, 6);
  assert.equal(p.porPosicion.esq_izq, undefined);
});
```

- [ ] **Step 2: Correr para verificar que falla**

Run: `node --test tests/estadisticas.test.js`
Expected: FAIL — `serieDeTiroDelJugador is not defined`.

- [ ] **Step 3: Agregar las funciones al final de `src/data/estadisticas.js`**

```js
/**
 * Las dos series de la ficha del jugador: triples y libres, cada una con
 * práctica y partido sobre el mismo eje temporal.
 *
 * Práctica de triples = las 5 posiciones del arco SUMADAS en esa sesión
 * (x/50). Las 5 posiciones de la batería caen sobre el arco (ver
 * posiciones.js), y el boxscore de la CABB no trae desde dónde se tiró
 * (PARSER.md), así que ésta es la única pareja honesta a esa granularidad.
 *
 * NUNCA se resta una serie de la otra: la brecha la lee el entrenador
 * mirando, y una resta sugeriría una precisión que no existe.
 *
 * Los puntos sin intentos se descartan — un punto sin valor no es un punto.
 */
export function serieDeTiroDelJugador({ sesiones, medicionesTiro, partidos, estadisticas, jugadorId }) {
  const sesionesPorId = new Map(sesiones.map((s) => [s.id, s]));
  const porSesion = new Map();

  for (const m of medicionesTiro) {
    if (m.jugadorId !== jugadorId) continue;
    if (m.anotados == null) continue;   // ausente: no aporta a la serie
    const sesion = sesionesPorId.get(m.sesionId);
    if (!sesion || sesion.tipo !== 'tiro') continue;

    if (!porSesion.has(m.sesionId)) {
      porSesion.set(m.sesionId, {
        fecha: sesion.fecha,
        triplesAnotados: 0, triplesIntentados: 0,
        libresAnotados: 0, libresIntentados: 0,
      });
    }
    const acum = porSesion.get(m.sesionId);
    if (m.posicion === 'libres') {
      acum.libresAnotados += m.anotados;
      acum.libresIntentados += m.intentos;
    } else {
      acum.triplesAnotados += m.anotados;
      acum.triplesIntentados += m.intentos;
    }
  }

  const practica = [...porSesion.values()].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const partidosPorId = new Map(partidos.map((p) => [p.id, p]));
  const delJugador = estadisticas
    .filter((e) => e.jugadorId === jugadorId && partidosPorId.has(e.partidoId))
    .map((e) => ({ ...e, fecha: partidosPorId.get(e.partidoId).fecha }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  const serie = (fuente, anotados, intentos) => fuente
    .map((x) => ({ fecha: x.fecha, valor: porcentaje(x[anotados], x[intentos]) }))
    .filter((p) => p.valor != null);

  return {
    triples: {
      practica: serie(practica, 'triplesAnotados', 'triplesIntentados'),
      partido: serie(delJugador, 'tresAnotados', 'tresIntentados'),
    },
    libres: {
      practica: serie(practica, 'libresAnotados', 'libresIntentados'),
      partido: serie(delJugador, 'libresAnotados', 'libresIntentados'),
    },
  };
}

/**
 * La batería de tiro más reciente de un jugador, posición por posición.
 * `porPosicion[id]` es null cuando esa posición quedó en NULL (ausente),
 * que es distinto de 0 de 10.
 */
export function ultimaBateriaDeJugador(sesiones, medicionesTiro, jugadorId) {
  const conMedicion = new Set(
    medicionesTiro.filter((m) => m.jugadorId === jugadorId).map((m) => m.sesionId)
  );
  const candidatas = sesiones
    .filter((s) => s.tipo === 'tiro' && conMedicion.has(s.id))
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
  if (!candidatas.length) return null;

  const sesion = candidatas[0];
  const porPosicion = {};
  for (const m of medicionesTiro) {
    if (m.jugadorId !== jugadorId || m.sesionId !== sesion.id) continue;
    porPosicion[m.posicion] = porcentaje(m.anotados, m.intentos);
  }
  return { sesionId: sesion.id, fecha: sesion.fecha, porPosicion };
}

/** Partido a partido de un jugador, del más reciente al más viejo. */
export function historialDePartidosDelJugador(partidos, estadisticas, jugadorId) {
  const partidosPorId = new Map(partidos.map((p) => [p.id, p]));
  return estadisticas
    .filter((e) => e.jugadorId === jugadorId && partidosPorId.has(e.partidoId))
    .map((e) => {
      const p = partidosPorId.get(e.partidoId);
      return {
        partidoId: e.partidoId,
        fecha: p.fecha,
        rivalNombre: p.rivalNombre,
        minSegundos: e.minSegundos,
        pts: e.pts,
        dos: porcentaje(e.dosAnotados, e.dosIntentados),
        tres: porcentaje(e.tresAnotados, e.tresIntentados),
        libres: porcentaje(e.libresAnotados, e.libresIntentados),
      };
    })
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
}

/**
 * Promedio del plantel por posición sobre la última sesión de tiro, para HOY.
 * Los ausentes (anotados null) no entran en el promedio.
 */
export function promedioDeCanchaDelPlantel(sesiones, medicionesTiro) {
  const sesionesTiro = sesiones
    .filter((s) => s.tipo === 'tiro')
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
  if (!sesionesTiro.length) return null;

  const sesion = sesionesTiro[0];
  const acum = {};
  for (const m of medicionesTiro) {
    if (m.sesionId !== sesion.id || m.anotados == null) continue;
    if (!acum[m.posicion]) acum[m.posicion] = { anotados: 0, intentos: 0 };
    acum[m.posicion].anotados += m.anotados;
    acum[m.posicion].intentos += m.intentos;
  }

  const porPosicion = {};
  for (const [posicion, a] of Object.entries(acum)) {
    porPosicion[posicion] = porcentaje(a.anotados, a.intentos);
  }
  return { sesionId: sesion.id, fecha: sesion.fecha, porPosicion };
}
```

- [ ] **Step 4: Correr los tests y commitear**

```bash
npm test          # Expected: # fail 0
git add src/data/estadisticas.js tests/estadisticas.test.js
git commit -m "feat: add per-player shooting series and match history"
```

---

## Task 7: Payload de medición

**Modelo sugerido:** barato — código completo abajo más tests.

**Files:**
- Create: `src/data/prepararPayloadMedicion.js`
- Create: `tests/prepararPayloadMedicion.test.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: `POSICIONES_BATERIA`, `INTENTOS_POR_POSICION` de la Task 4.
- Produces: `prepararPayloadBateria({clubId, plantelId, fecha, valores})`, `prepararPayloadVelocidad({...})`, `redondearSegundos(valor)`.

- [ ] **Step 1: Escribir el test que falla**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararPayloadBateria, prepararPayloadVelocidad, redondearSegundos } from '../src/data/prepararPayloadMedicion.js';

const BASE = { clubId: 'c1', plantelId: 'pl1', fecha: '2026-03-05' };

test('un jugador medido genera una fila por posición cargada', () => {
  const p = prepararPayloadBateria({ ...BASE, valores: { j1: { esq_izq: 7, frontal: 4 } } });
  assert.equal(p.tipo, 'tiro');
  assert.equal(p.mediciones.length, 2);
  assert.deepEqual(p.mediciones[0], { jugadorId: 'j1', posicion: 'esq_izq', anotados: 7, intentos: 10 });
});

test('cero es un valor cargado, no una posición vacía', () => {
  const p = prepararPayloadBateria({ ...BASE, valores: { j1: { esq_izq: 0 } } });
  assert.equal(p.mediciones.length, 1);
  assert.equal(p.mediciones[0].anotados, 0);
});

test('un jugador ausente genera las 6 posiciones en null', () => {
  const p = prepararPayloadBateria({ ...BASE, valores: { j1: { ausente: true } } });
  assert.equal(p.mediciones.length, 6);
  assert.ok(p.mediciones.every((m) => m.anotados === null));
  assert.ok(p.mediciones.every((m) => m.intentos === 10));
});

test('ausente pisa cualquier valor que hubiera quedado cargado antes', () => {
  const p = prepararPayloadBateria({ ...BASE, valores: { j1: { ausente: true, esq_izq: 7 } } });
  assert.equal(p.mediciones.length, 6);
  assert.ok(p.mediciones.every((m) => m.anotados === null));
});

test('un jugador al que la sesión nunca llegó no genera ninguna fila', () => {
  const p = prepararPayloadBateria({ ...BASE, valores: { j1: {}, j2: { esq_izq: 5 } } });
  assert.deepEqual(p.mediciones.map((m) => m.jugadorId), ['j2']);
});

test('el borrador vacío no rompe', () => {
  assert.deepEqual(prepararPayloadBateria({ ...BASE, valores: {} }).mediciones, []);
  assert.deepEqual(prepararPayloadBateria({ ...BASE, valores: undefined }).mediciones, []);
});

test('la velocidad se redondea a un decimal', () => {
  assert.equal(redondearSegundos('4.73'), 4.7);
  assert.equal(redondearSegundos('4.75'), 4.8);
  assert.equal(redondearSegundos(5), 5);
});

test('una velocidad inválida o vacía no genera fila', () => {
  assert.equal(redondearSegundos(''), null);
  assert.equal(redondearSegundos(null), null);
  assert.equal(redondearSegundos('abc'), null);
  assert.equal(redondearSegundos('-3'), null);
  assert.equal(redondearSegundos('0'), null);
  const p = prepararPayloadVelocidad({ ...BASE, valores: { j1: '', j2: '4.62' } });
  assert.deepEqual(p.mediciones, [{ jugadorId: 'j2', segundos: 4.6 }]);
  assert.equal(p.tipo, 'velocidad');
});
```

- [ ] **Step 2: Correr para verificar que falla**

Run: `node --test tests/prepararPayloadMedicion.test.js`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 3: Escribir `src/data/prepararPayloadMedicion.js`**

```js
import { POSICIONES_BATERIA, INTENTOS_POR_POSICION } from './posiciones.js';

/**
 * Borrador de batería → payload de guardar_sesion_medicion.
 *
 * `valores` es { [jugadorId]: { ausente?: boolean, esq_izq?: 0..10, ... } }.
 *
 * Tres estados distintos, y el esquema los distingue a propósito:
 * - Jugador ausente        → 6 filas con anotados null (estuvo, no midió).
 * - Posición sin cargar    → sin fila (no se llegó a medir esa posición).
 * - Jugador sin nada       → sin ninguna fila (la sesión nunca llegó a él).
 *
 * Un 0 cargado SÍ genera fila: 0 de 10 es un dato real.
 */
export function prepararPayloadBateria({ clubId, plantelId, fecha, valores }) {
  const mediciones = [];

  for (const [jugadorId, datos] of Object.entries(valores ?? {})) {
    if (datos?.ausente) {
      for (const pos of POSICIONES_BATERIA) {
        mediciones.push({ jugadorId, posicion: pos.id, anotados: null, intentos: INTENTOS_POR_POSICION });
      }
      continue;
    }
    for (const pos of POSICIONES_BATERIA) {
      const anotados = datos?.[pos.id];
      if (anotados == null) continue;
      mediciones.push({ jugadorId, posicion: pos.id, anotados, intentos: INTENTOS_POR_POSICION });
    }
  }

  return { clubId, plantelId, fecha, tipo: 'tiro', mediciones };
}

/**
 * Un decimal, siempre. Un cronómetro a mano tiene error humano de ~0.2s;
 * sobre 5 segundos eso es 4%. Mostrar centésimas sería precisión falsa.
 * Devuelve null para cualquier cosa que no sea un tiempo positivo.
 */
export function redondearSegundos(valor) {
  if (valor == null || valor === '') return null;
  const n = Number(valor);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 10) / 10;
}

/** Borrador de velocidad → payload. `valores` es { [jugadorId]: '4.7' }. */
export function prepararPayloadVelocidad({ clubId, plantelId, fecha, valores }) {
  const mediciones = [];
  for (const [jugadorId, crudo] of Object.entries(valores ?? {})) {
    const segundos = redondearSegundos(crudo);
    if (segundos == null) continue;
    mediciones.push({ jugadorId, segundos });
  }
  return { clubId, plantelId, fecha, tipo: 'velocidad', mediciones };
}
```

- [ ] **Step 4: Pasar los tests, agregarlos a `npm test`, commitear**

Agregá `tests/prepararPayloadMedicion.test.js` al script `test` de `package.json`, preservando los que ya están.

```bash
npm test          # Expected: # fail 0
git add src/data/prepararPayloadMedicion.js tests/prepararPayloadMedicion.test.js package.json
git commit -m "feat: add measurement payload builders with the absent-vs-zero distinction"
```

---

## Task 8: Funciones nuevas del repositorio

**Modelo sugerido:** medio — son consultas con joins y hay que mapear snake_case a camelCase sin equivocarse.

**Files:**
- Modify: `src/data/repositorio.js` (**agregar al final; no modificar ni una función existente**)

**Interfaces:**
- Consumes: las tablas de la Task 1 y las RPCs de las Tasks 2 y 3.
- Produces: las funciones que consumen todas las pantallas de las Tasks 11–17.

- [ ] **Step 1: Agregar las funciones al final de `src/data/repositorio.js`**

Fijate en `obtenerJugadoresDelPlantel` (línea 213) para el patrón de `select` con join y el mapeo a camelCase.

```js
/* ---------- Etapa 4: mediciones ---------- */

export async function obtenerSesionesDeMedicion(clubId, plantelId) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('sesion_medicion')
    .select('id, fecha, tipo')
    .eq('club_id', clubId)
    .eq('plantel_id', plantelId)
    .order('fecha', { ascending: false });
  if (error) throw error;
  return data.map((f) => ({ id: f.id, fecha: f.fecha, tipo: f.tipo }));
}

/**
 * Todas las mediciones de tiro del plantel. El filtro por plantel va por el
 * join contra sesion_medicion con !inner, igual que obtenerJugadoresDelPlantel
 * filtra por pertenencia.
 */
export async function obtenerMedicionesTiroDelPlantel(clubId, plantelId) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('medicion_tiro')
    .select('sesion_id, jugador_id, posicion, anotados, intentos, sesion_medicion!inner(plantel_id)')
    .eq('club_id', clubId)
    .eq('sesion_medicion.plantel_id', plantelId);
  if (error) throw error;
  return data.map((f) => ({
    sesionId: f.sesion_id,
    jugadorId: f.jugador_id,
    posicion: f.posicion,
    anotados: f.anotados,
    intentos: f.intentos,
  }));
}

export async function obtenerMedicionesVelocidadDelPlantel(clubId, plantelId) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('medicion_velocidad')
    .select('sesion_id, jugador_id, segundos, sesion_medicion!inner(plantel_id, fecha)')
    .eq('club_id', clubId)
    .eq('sesion_medicion.plantel_id', plantelId);
  if (error) throw error;
  return data.map((f) => ({
    sesionId: f.sesion_id,
    jugadorId: f.jugador_id,
    // numeric de Postgres llega como string por PostgREST: se convierte acá,
    // en la capa de datos, para que las vistas reciban números.
    segundos: f.segundos == null ? null : Number(f.segundos),
    fecha: f.sesion_medicion?.fecha ?? null,
  }));
}

/**
 * Estadísticas de todos los partidos del plantel, con la fecha del partido
 * ya resuelta. Es la entrada de repartoPorJugador y evolucionDeTiroDelEquipo.
 */
export async function obtenerEstadisticasDelPlantel(clubId, plantelId) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('estadistica_jugador_partido')
    .select('partido_id, jugador_id, min_segundos, pts, dos_anotados, dos_intentados, tres_anotados, tres_intentados, libres_anotados, libres_intentados, partido!inner(plantel_id)')
    .eq('club_id', clubId)
    .eq('partido.plantel_id', plantelId);
  if (error) throw error;
  return data.map((f) => ({
    partidoId: f.partido_id,
    jugadorId: f.jugador_id,
    minSegundos: f.min_segundos,
    pts: f.pts,
    dosAnotados: f.dos_anotados,
    dosIntentados: f.dos_intentados,
    tresAnotados: f.tres_anotados,
    tresIntentados: f.tres_intentados,
    libresAnotados: f.libres_anotados,
    libresIntentados: f.libres_intentados,
  }));
}

export async function guardarSesionMedicion(payload) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase.rpc('guardar_sesion_medicion', { payload });
  if (error) throw error;
  return data;
}

/* ---------- Etapa 4: recursos ---------- */

export async function obtenerRecursos(clubId) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('recurso')
    .select('id, titulo, descripcion, enlace, creado_en, envio_recurso(jugador_id, fecha)')
    .eq('club_id', clubId)
    .order('creado_en', { ascending: false });
  if (error) throw error;
  return data.map((f) => ({
    id: f.id,
    titulo: f.titulo,
    descripcion: f.descripcion,
    enlace: f.enlace,
    creadoEn: f.creado_en,
    envios: (f.envio_recurso ?? []).map((e) => ({ jugadorId: e.jugador_id, fecha: e.fecha })),
  }));
}

/** Recursos que se le enviaron a un jugador, para su ficha. */
export async function obtenerEnviosDeJugador(clubId, jugadorId) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('envio_recurso')
    .select('fecha, recurso(id, titulo, enlace)')
    .eq('club_id', clubId)
    .eq('jugador_id', jugadorId)
    .order('fecha', { ascending: false });
  if (error) throw error;
  return data.map((f) => ({
    fecha: f.fecha,
    recursoId: f.recurso?.id ?? null,
    titulo: f.recurso?.titulo ?? null,
    enlace: f.recurso?.enlace ?? null,
  }));
}

export async function guardarRecurso(payload) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase.rpc('guardar_recurso', { payload });
  if (error) throw error;
  return data;
}
```

- [ ] **Step 2: Verificar que no se modificó nada existente**

Run: `git diff --stat src/data/repositorio.js`
Expected: sólo inserciones, cero borrados. Si aparece cualquier número en la columna de borrados, se modificó algo que no correspondía.

Run: `git diff -U0 src/data/repositorio.js | grep "^-" | grep -v "^---"`
Expected: sin salida.

- [ ] **Step 3: Verificar sintaxis, tests y commit**

```bash
node --check src/data/repositorio.js
npm test          # Expected: # fail 0
git add src/data/repositorio.js
git commit -m "feat: add repository reads and RPC calls for measurements and resources"
```

---

## Task 9: Gráficos generalizados y barras

**Modelo sugerido:** medio — el bug de división por cero con un solo punto es el corazón de esta task.

**Files:**
- Modify: `src/ui/componentes/graficos.js`
- Create: `src/ui/componentes/barras.js`
- Modify: `public/css/componentes.css` (agregar clases; no borrar ninguna)

**Interfaces:**
- Consumes: `POSICIONES` de la Task 4; los objetos de `porcentaje()`.
- Produces:
  - `cancha(svg, valores, {alto})` — `valores` es `{[posicionId]: objetoDePorcentaje | null}`. Devuelve `true` si dibujó algo.
  - `grafico(svg, {etiquetas, series}, {u, alto, dec})` — devuelve `false` si no había nada que dibujar.
  - `barras(filas, {formatearValor})` → string de HTML; `filas` es `[{etiqueta, valor}]`.

- [ ] **Step 1: Reescribir `cancha()` en `src/ui/componentes/graficos.js`**

Cambia el import (`POS` de `datosEjemplo.js` → `POSICIONES` de `../../data/posiciones.js`) y la forma de `valores`: antes era un número suelto, ahora es el objeto de `porcentaje()`. El dibujo de la cancha en sí (las líneas, el aro, el arco) **no se toca**.

```js
import { POSICIONES } from '../../data/posiciones.js';

const COL_MUTED = '#726E65'; // mismo tono que --gris-cl (auditoría de accesibilidad del prototipo)

/**
 * Cancha con marcadores por posición. El dibujo viene del prototipo sin
 * cambios; lo que cambió en la Etapa 4 es que `valores` ahora trae el objeto
 * completo de porcentaje() y no un número suelto, para poder mostrar los
 * intentos debajo de cada posición — ningún porcentaje sin su denominador.
 *
 * valores: { [posicionId]: {pct, anotados, intentos, muestraChica} | null }
 * Una posición en null se dibuja vacía con un guión: es "sin medir", no cero.
 */
export function cancha(svg, valores, { alto = 200 } = {}) {
  const W = 300, H = 300;
  const L = '#C9C5BE', T = '#131316';
  let g = `<rect x="6" y="6" width="288" height="278" fill="#FBFAF8" stroke="${L}" stroke-width="1.5"/>`;
  g += `<rect x="104" y="176" width="92" height="108" fill="none" stroke="${L}" stroke-width="1.5"/>`;
  g += `<circle cx="150" cy="176" r="34" fill="none" stroke="${L}" stroke-width="1.5"/>`;
  g += `<line x1="134" y1="272" x2="166" y2="272" stroke="${T}" stroke-width="2.5"/>`;
  g += `<line x1="150" y1="272" x2="150" y2="266" stroke="${T}" stroke-width="2"/>`;
  g += `<circle cx="150" cy="262" r="6" fill="none" stroke="${T}" stroke-width="2"/>`;
  g += `<path d="M28 284 L28 232 A126 126 0 0 1 272 232 L272 284" fill="none" stroke="${L}" stroke-width="1.5"/>`;

  let hayAlguno = false;
  POSICIONES.forEach((p) => {
    const v = valores?.[p.id] ?? null;
    const pct = v?.pct ?? null;
    if (pct != null) hayAlguno = true;
    const op = pct == null ? 0 : Math.max(0.18, Math.min(1, (pct - 15) / 55));
    g += `<circle cx="${p.x}" cy="${p.y}" r="21" fill="#D9122E" opacity="${op}"/>`;
    // Muestra chica: contorno punteado. Es una señal que no depende del color
    // ni del hover, así que sobrevive en cualquier pantalla.
    g += `<circle cx="${p.x}" cy="${p.y}" r="21" fill="none" stroke="#D9122E" stroke-width="1.6"${v?.muestraChica ? ' stroke-dasharray="4 3"' : ''}/>`;
    g += `<text x="${p.x}" y="${p.y + 5}" text-anchor="middle" font-family="IBM Plex Mono" font-size="14.5" font-weight="600" fill="${op > 0.55 ? '#fff' : '#131316'}">${pct == null ? '—' : pct}</text>`;
    g += `<text x="${p.x}" y="${p.y + 34}" text-anchor="middle" font-family="Barlow Condensed" font-size="10" letter-spacing="1" fill="#6E6B66">${p.corto}</text>`;
    if (v) {
      g += `<text x="${p.x}" y="${p.y + 45}" text-anchor="middle" font-family="IBM Plex Mono" font-size="9.5" fill="${COL_MUTED}">${v.anotados}/${v.intentos}</text>`;
    }
  });

  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.style.height = alto + 'px';
  svg.innerHTML = g;
  return hayAlguno;
}
```

- [ ] **Step 2: Reescribir `grafico()`**

El bug que hay que cerrar: la versión vieja calcula `X = ml + i * (W - ml - mr) / (FECHAS.length - 1)`, que **divide por cero con un solo punto**, y hace `Math.min(...todos)` que devuelve `Infinity` con la serie vacía. Arrancamos sin datos: los dos casos van a pasar de verdad.

```js
/**
 * Gráfico de líneas. Generalizado en la Etapa 4: recibe las etiquetas del eje
 * X en vez de importarlas de un array fijo, y maneja explícitamente 0 y 1
 * punto. El club arranca sin un solo dato cargado, así que los casos chicos
 * son el caso normal, no el borde.
 *
 * datos.etiquetas: string[]  — el eje X ya formateado
 * datos.series: [{ nombre, c: color, dash?: boolean, d: (number|null)[] }]
 *   Cada `d` tiene el mismo largo que `etiquetas`. Los null son huecos.
 *
 * Devuelve false si no había nada que dibujar, para que la pantalla muestre
 * su estado vacío en vez de un cuadro en blanco.
 */
export function grafico(svg, { etiquetas, series }, { u = '%', alto = 170, dec = 0 } = {}) {
  const n = etiquetas?.length ?? 0;
  const todos = (series ?? []).flatMap((s) => s.d).filter((v) => v != null);
  if (n === 0 || todos.length === 0) {
    svg.innerHTML = '';
    svg.removeAttribute('viewBox');
    svg.style.height = '0px';
    return false;
  }

  const W = 320, H = alto, ml = 30, mr = 8, mt = 12, mb = 24;
  let min = Math.min(...todos), max = Math.max(...todos);
  const pad = (max - min) * 0.25 || 1;
  min = min - pad; max = max + pad;
  if (u === '%') min = Math.max(0, min);

  // Con un solo punto no hay eje que repartir: se centra. La versión vieja
  // dividía por (n - 1) y se rompía acá.
  const X = n === 1
    ? () => (ml + (W - mr)) / 2
    : (i) => ml + i * (W - ml - mr) / (n - 1);
  const Y = (v) => mt + (1 - (v - min) / (max - min)) * (H - mt - mb);

  let g = '';
  for (let k = 0; k <= 3; k++) {
    const v = min + (max - min) * k / 3, y = Y(v);
    g += `<line x1="${ml}" y1="${y}" x2="${W - mr}" y2="${y}" stroke="#EAE6DF" stroke-width="1"/>`;
    g += `<text x="${ml - 6}" y="${y + 3.5}" text-anchor="end" font-family="IBM Plex Mono" font-size="10" fill="${COL_MUTED}">${v.toFixed(dec)}</text>`;
  }
  g += `<line x1="${ml}" y1="${Y(min)}" x2="${W - mr}" y2="${Y(min)}" stroke="#C9C5BE" stroke-width="1.2"/>`;
  etiquetas.forEach((f, i) => {
    g += `<text x="${X(i)}" y="${H - 8}" text-anchor="middle" font-family="Barlow Condensed" font-size="11.5" letter-spacing=".7" fill="#6E6B66">${String(f).toUpperCase()}</text>`;
  });
  g += `<text x="4" y="9" font-family="Barlow Condensed" font-size="10" letter-spacing="1" fill="${COL_MUTED}">${u.toUpperCase()}</text>`;

  series.forEach((s) => {
    const puntos = s.d
      .map((v, i) => (v == null ? null : { x: X(i), y: Y(v), ultimo: i === s.d.length - 1 }))
      .filter(Boolean);
    if (puntos.length > 1) {
      g += `<polyline points="${puntos.map((p) => `${p.x},${p.y}`).join(' ')}" fill="none" stroke="${s.c}" stroke-width="${s.w || 2.4}" ${s.dash ? 'stroke-dasharray="5 4"' : ''} stroke-linejoin="round"/>`;
    }
    puntos.forEach((p) => {
      g += `<circle cx="${p.x}" cy="${p.y}" r="${p.ultimo ? 4 : 2.8}" fill="${p.ultimo ? s.c : '#fff'}" stroke="${s.c}" stroke-width="1.8"/>`;
    });
  });

  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.style.height = alto + 'px';
  svg.innerHTML = g;
  return true;
}
```

- [ ] **Step 3: Escribir `src/ui/componentes/barras.js`**

```js
import { escaparHtml } from '../nav.js';

/**
 * Barras horizontales del reparto: una por jugador, sobre el total del
 * equipo. No es SVG a propósito — son divs con ancho porcentual, que escalan
 * solos con el contenedor y no necesitan viewBox ni recalcularse al rotar
 * el celular.
 *
 * El ancho es relativo al mayor (la barra más larga llena la pista), y el
 * número que se muestra al costado es el valor real.
 */
export function barras(filas, { formatearValor }) {
  if (!filas.length) return '';
  const maximo = filas[0].valor;
  return `<div class="barras">${filas.map((f) => `
    <div class="barra">
      <div class="et">${escaparHtml(f.etiqueta)}</div>
      <div class="pista"><div class="relleno" style="width:${maximo === 0 ? 0 : (f.valor / maximo) * 100}%"></div></div>
      <div class="val">${escaparHtml(formatearValor(f.valor))}</div>
    </div>
  `).join('')}</div>`;
}
```

- [ ] **Step 4: Agregar el CSS de barras y de muestra chica**

Al final de `public/css/componentes.css`, sin borrar ninguna regla existente. Usá los tokens que ya existen en `tokens.css`, ningún hex suelto, y **ninguna media query** (van todas en `layout.css`).

```css
/* Etapa 4 — barras de reparto */
.barras{display:flex;flex-direction:column;gap:8px;margin:12px 0}
.barra{display:grid;grid-template-columns:minmax(0,4.5rem) 1fr auto;align-items:center;gap:8px}
.barra .et{font-size:var(--fs-140);color:var(--tinta);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.barra .pista{height:14px;background:var(--linea);border-radius:7px;overflow:hidden}
.barra .relleno{height:100%;background:var(--rojo);border-radius:7px}
.barra .val{font-family:'IBM Plex Mono',monospace;font-size:var(--fs-130);color:var(--gris-cl)}

/* Etapa 4 — muestra chica: atenuada y marcada. La marca es texto, no sólo
   color, para que no dependa de que alguien distinga dos grises. */
.poco{opacity:.55}
.poco-tag{display:inline-block;margin-left:6px;font-family:'Barlow Condensed',sans-serif;font-size:var(--fs-120);letter-spacing:.06em;text-transform:uppercase;color:var(--gris-cl)}
```

> Antes de escribir, abrí `public/css/tokens.css` y usá los nombres de variable que existan ahí. Si alguno de `--tinta`, `--linea`, `--rojo`, `--gris-cl`, `--fs-120`, `--fs-130`, `--fs-140` no existe con ese nombre, usá el equivalente real del archivo — no inventes tokens nuevos ni pongas hex sueltos.

- [ ] **Step 5: Verificar y commitear**

```bash
node --check src/ui/componentes/graficos.js
node --check src/ui/componentes/barras.js
grep -c "@media" public/css/componentes.css     # Expected: 0
grep -c "datosEjemplo" src/ui/componentes/graficos.js   # Expected: 0
npm test
git add src/ui/componentes/graficos.js src/ui/componentes/barras.js public/css/componentes.css
git commit -m "feat: generalize charts for real dates and handle zero and one data points"
```

---

## Task 10: Borrador local de la sesión

**Modelo sugerido:** barato — un módulo chico con su test.

**Files:**
- Create: `src/ui/borradorMedicion.js`
- Create: `tests/borradorMedicion.test.js`
- Modify: `package.json`

**Interfaces:**
- Produces: `claveBorrador(clubId, plantelId, tipo)`, `guardarBorrador(clave, estado, almacen?)`, `leerBorrador(clave, almacen?)`, `borrarBorrador(clave, almacen?)`.

El parámetro `almacen` existe para poder testear en Node sin navegador. En la app nadie lo pasa.

- [ ] **Step 1: Escribir el test que falla**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claveBorrador, guardarBorrador, leerBorrador, borrarBorrador } from '../src/ui/borradorMedicion.js';

function almacenFalso() {
  const mapa = new Map();
  return {
    getItem: (k) => (mapa.has(k) ? mapa.get(k) : null),
    setItem: (k, v) => mapa.set(k, v),
    removeItem: (k) => mapa.delete(k),
  };
}

function almacenQueTira() {
  return {
    getItem() { throw new Error('modo privado'); },
    setItem() { throw new Error('modo privado'); },
    removeItem() { throw new Error('modo privado'); },
  };
}

test('la clave separa club, plantel y tipo', () => {
  const a = claveBorrador('c1', 'pl1', 'tiro');
  const b = claveBorrador('c1', 'pl2', 'tiro');
  const c = claveBorrador('c1', 'pl1', 'velocidad');
  assert.notEqual(a, b);
  assert.notEqual(a, c);
});

test('lo que se guarda se lee igual', () => {
  const alm = almacenFalso();
  const clave = claveBorrador('c1', 'pl1', 'tiro');
  const estado = { version: 1, fecha: '2026-03-05', valores: { j1: { esq_izq: 7 } } };
  assert.equal(guardarBorrador(clave, estado, alm), true);
  assert.deepEqual(leerBorrador(clave, alm), estado);
});

test('sin borrador guardado devuelve null', () => {
  assert.equal(leerBorrador(claveBorrador('c1', 'pl1', 'tiro'), almacenFalso()), null);
});

test('borrar deja el slot vacío', () => {
  const alm = almacenFalso();
  const clave = claveBorrador('c1', 'pl1', 'tiro');
  guardarBorrador(clave, { version: 1, valores: {} }, alm);
  borrarBorrador(clave, alm);
  assert.equal(leerBorrador(clave, alm), null);
});

test('un borrador de otra versión se descarta en vez de romper', () => {
  const alm = almacenFalso();
  const clave = claveBorrador('c1', 'pl1', 'tiro');
  alm.setItem(clave, JSON.stringify({ version: 99, valores: {} }));
  assert.equal(leerBorrador(clave, alm), null);
});

test('un borrador corrupto se descarta en vez de romper', () => {
  const alm = almacenFalso();
  const clave = claveBorrador('c1', 'pl1', 'tiro');
  alm.setItem(clave, 'esto no es json');
  assert.equal(leerBorrador(clave, alm), null);
});

test('si el almacén tira, nada explota', () => {
  const alm = almacenQueTira();
  const clave = claveBorrador('c1', 'pl1', 'tiro');
  assert.equal(guardarBorrador(clave, { version: 1 }, alm), false);
  assert.equal(leerBorrador(clave, alm), null);
  assert.doesNotThrow(() => borrarBorrador(clave, alm));
});
```

- [ ] **Step 2: Correr para verificar que falla, escribir el módulo, y volver a correr**

```js
/**
 * Borrador local de la sesión de medición en curso.
 *
 * Una batería lleva media hora larga, el celular se bloquea y el wifi del
 * club se corta. Se escribe en cada tap y sólo se borra cuando la RPC
 * confirma: si el envío falla, el borrador sigue ahí para reintentar.
 *
 * Una clave por (club, plantel, tipo), así cambiar de categoría no pisa el
 * borrador de la otra.
 *
 * Todo va envuelto en try/catch: en modo privado localStorage tira al
 * escribir, y perder el borrador nunca puede romper la pantalla.
 */
const PREFIJO = 'medicion.borrador.v1';
const VERSION = 1;

export function claveBorrador(clubId, plantelId, tipo) {
  return `${PREFIJO}.${clubId}.${plantelId}.${tipo}`;
}

function almacenPorDefecto() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function guardarBorrador(clave, estado, almacen = almacenPorDefecto()) {
  if (!almacen) return false;
  try {
    almacen.setItem(clave, JSON.stringify({ ...estado, version: VERSION }));
    return true;
  } catch {
    return false;
  }
}

export function leerBorrador(clave, almacen = almacenPorDefecto()) {
  if (!almacen) return null;
  try {
    const crudo = almacen.getItem(clave);
    if (!crudo) return null;
    const estado = JSON.parse(crudo);
    // Un borrador de otra versión se descarta: es preferible perder una
    // sesión a medio cargar que dibujar una pantalla con una forma que el
    // código de hoy no entiende.
    return estado?.version === VERSION ? estado : null;
  } catch {
    return null;
  }
}

export function borrarBorrador(clave, almacen = almacenPorDefecto()) {
  if (!almacen) return;
  try {
    almacen.removeItem(clave);
  } catch {
    // Si no se puede borrar, el borrador va a reaparecer como "sesión sin
    // terminar". Es molesto, no es un error que valga la pena mostrar.
  }
}
```

- [ ] **Step 3: Agregar a `npm test` y commitear**

```bash
npm test          # Expected: # fail 0
git add src/ui/borradorMedicion.js tests/borradorMedicion.test.js package.json
git commit -m "feat: add local draft storage for in-progress measurement sessions"
```

---

## Task 11: MEDIR — pantalla principal

**Modelo sugerido:** medio — toca `index.html` y `registro.js`, que son compartidos.

**Files:**
- Modify: `src/ui/pantallas/medir.js` (reescritura completa)
- Modify: `public/index.html` (**agregar 2 secciones; no tocar las que están**)
- Modify: `src/ui/pantallas/registro.js` (**agregar registros; preservar todos los existentes**)
- Modify: `public/css/componentes.css` (append)

**Interfaces:**
- Consumes: `obtenerSesionesDeMedicion` (Task 8), `claveBorrador`/`leerBorrador`/`borrarBorrador` (Task 10).
- Produces: `renderMedir()`, y las pantallas `p-medir-bateria` y `p-medir-velocidad` registradas para las Tasks 12 y 13.

- [ ] **Step 1: Agregar las dos secciones a `public/index.html`**

Justo después de la línea de `p-recursos` (línea 53), antes del comentario de las pantallas del import. **No toques ninguna otra línea del archivo.**

```html
    <section class="pant" id="p-medir-bateria"><div id="bateria-contenido"></div></section>
    <section class="pant" id="p-medir-velocidad"><div id="velocidad-contenido"></div></section>
```

- [ ] **Step 2: Reescribir `src/ui/pantallas/medir.js`**

Fuera el `bannerEjemplo` y todo lo de `datosEjemplo`. La pantalla ahora muestra: las dos entradas, el borrador sin terminar si existe, y las sesiones ya guardadas.

```js
import { obtenerSesionesDeMedicion } from '../../data/repositorio.js';
import { obtenerClubActual, obtenerPlantelActivo } from '../sesion.js';
import { escaparHtml, esErrorDeRed } from '../nav.js';
import { claveBorrador, leerBorrador, borrarBorrador } from '../borradorMedicion.js';
import { ir } from '../main.js';

const $ = (id) => document.getElementById(id);
const contenedor = () => $('medir-contenido');

/** 'YYYY-MM-DD' → 'DD/MM/YY', a mano para no depender de la zona horaria. */
export function formatearFecha(iso) {
  const [anio, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${anio.slice(2)}`;
}

function cuantosCargados(borrador) {
  return Object.values(borrador?.valores ?? {}).filter((v) => (
    v?.ausente || Object.keys(v ?? {}).some((k) => k !== 'ausente' && v[k] != null)
  )).length;
}

function tarjetaBorrador(borrador, tipo) {
  const cargados = cuantosCargados(borrador);
  const nombre = tipo === 'tiro' ? 'Batería de tiro' : 'Velocidad';
  return `
    <div class="al">
      <div class="ico">!</div>
      <div class="tx">
        <b>Sesión sin terminar</b>
        <div class="mt">${escaparHtml(nombre)} del ${escaparHtml(formatearFecha(borrador.fecha))} · ${cargados} jugador${cargados === 1 ? '' : 'es'} cargado${cargados === 1 ? '' : 's'}</div>
        <div class="acciones-al">
          <button class="btn chico" data-seguir="${tipo}">Continuar</button>
          <button class="btn sec chico" data-descartar="${tipo}">Descartar</button>
        </div>
      </div>
    </div>
  `;
}

export async function renderMedir() {
  const club = obtenerClubActual();
  const plantel = obtenerPlantelActivo();
  if (!club || !plantel) {
    contenedor().innerHTML = `<div class="pad"><div class="p">No hay una categoría seleccionada.</div></div>`;
    return;
  }

  const borradores = {
    tiro: leerBorrador(claveBorrador(club.id, plantel.id, 'tiro')),
    velocidad: leerBorrador(claveBorrador(club.id, plantel.id, 'velocidad')),
  };

  contenedor().innerHTML = `
    <div class="pad">
      <div class="eyebrow">Medir ${escaparHtml(plantel.categoria)}</div>
      <div id="medir-borradores">
        ${borradores.tiro ? tarjetaBorrador(borradores.tiro, 'tiro') : ''}
        ${borradores.velocidad ? tarjetaBorrador(borradores.velocidad, 'velocidad') : ''}
      </div>
      <div class="lista-2col">
        <button class="test-fila" id="btn-medir-bateria">
          <div class="ic">%</div>
          <div><div class="t">Batería de tiro</div><div class="d">6 posiciones, 10 tiros cada una</div></div>
        </button>
        <button class="test-fila" id="btn-medir-velocidad">
          <div class="ic">s</div>
          <div><div class="t">Velocidad</div><div class="d">Largo de cancha, un intento</div></div>
        </button>
      </div>
      <div class="eyebrow">Sesiones cargadas</div>
      <div class="p" id="medir-estado">Cargando sesiones...</div>
      <div id="medir-lista"></div>
    </div>
  `;

  $('btn-medir-bateria').addEventListener('click', () => ir('p-medir-bateria', { push: true }));
  $('btn-medir-velocidad').addEventListener('click', () => ir('p-medir-velocidad', { push: true }));
  contenedor().querySelectorAll('[data-seguir]').forEach((b) => {
    b.addEventListener('click', () => ir(b.dataset.seguir === 'tiro' ? 'p-medir-bateria' : 'p-medir-velocidad', { push: true }));
  });
  contenedor().querySelectorAll('[data-descartar]').forEach((b) => {
    b.addEventListener('click', async () => {
      borrarBorrador(claveBorrador(club.id, plantel.id, b.dataset.descartar));
      await renderMedir();
    });
  });

  let sesiones;
  try {
    sesiones = await obtenerSesionesDeMedicion(club.id, plantel.id);
  } catch (e) {
    $('medir-estado').textContent = esErrorDeRed(e)
      ? 'Sin conexión. Revisá tu wifi/datos e intentá de nuevo.'
      : 'No se pudieron cargar las sesiones.';
    return;
  }

  if (!sesiones.length) {
    $('medir-estado').outerHTML = `
      <div class="estado-vacio">
        <h2>Todavía no hay mediciones</h2>
        <div class="p">La batería son 6 posiciones de 10 tiros cada una. Con una sola sesión ya podés ver desde dónde tira mejor cada chico; recién con la segunda empieza a verse si mejora.</div>
      </div>
    `;
    return;
  }

  $('medir-estado').remove();
  $('medir-lista').innerHTML = `<div class="lista-2col">${sesiones.map((s) => `
    <div class="jug-fila">
      <div style="flex:1">
        <div class="nom">${s.tipo === 'tiro' ? 'Batería de tiro' : 'Velocidad'}</div>
        <div class="det">${escaparHtml(formatearFecha(s.fecha))}</div>
      </div>
    </div>
  `).join('')}</div>`;
}
```

- [ ] **Step 3: Registrar las pantallas nuevas en `src/ui/pantallas/registro.js`**

**Preservá cada `registrarPantalla` y cada llamada de inicialización que ya está.** Agregá los imports y estas dos líneas:

```js
  registrarPantalla('p-medir-bateria', { titulo: 'Batería de tiro', render: renderBateria });
  registrarPantalla('p-medir-velocidad', { titulo: 'Velocidad', render: renderVelocidad });
```

Como `medirBateria.js` y `medirVelocidad.js` todavía no existen (Tasks 12 y 13), creá los dos archivos con un render mínimo que se reemplaza después:

```js
// src/ui/pantallas/medirBateria.js  (esqueleto; la Task 12 lo completa)
export function renderBateria() {
  document.getElementById('bateria-contenido').innerHTML =
    `<div class="pad"><div class="p">En construcción.</div></div>`;
}
```

```js
// src/ui/pantallas/medirVelocidad.js  (esqueleto; la Task 13 lo completa)
export function renderVelocidad() {
  document.getElementById('velocidad-contenido').innerHTML =
    `<div class="pad"><div class="p">En construcción.</div></div>`;
}
```

- [ ] **Step 4: Agregar el CSS que falta**

Al final de `componentes.css`, sin borrar nada:

```css
/* Etapa 4 — acciones dentro de un aviso */
.acciones-al{display:flex;gap:8px;margin-top:10px}
.btn.chico{min-height:40px;padding:0 14px;font-size:var(--fs-140);width:auto}
```

- [ ] **Step 5: Verificar y commitear**

```bash
node --check src/ui/pantallas/medir.js
grep -c "datosEjemplo\|bannerEjemplo" src/ui/pantallas/medir.js   # Expected: 0
grep -c "registrarPantalla" src/ui/pantallas/registro.js          # Expected: 11
npm test
git add src/ui/pantallas/medir.js src/ui/pantallas/medirBateria.js src/ui/pantallas/medirVelocidad.js src/ui/pantallas/registro.js public/index.html public/css/componentes.css
git commit -m "feat: rebuild MEDIR home on real sessions and local drafts"
```

---

## Task 12: MEDIR — batería de tiro

**Modelo sugerido:** capaz — es la pantalla más difícil de la app y la que más criterios de aceptación toca.

**Files:**
- Modify: `src/ui/pantallas/medirBateria.js` (reemplaza el esqueleto)
- Modify: `public/css/componentes.css` (append)

**Interfaces:**
- Consumes: `obtenerJugadoresDelPlantel` y `guardarSesionMedicion` (Task 8), `prepararPayloadBateria` (Task 7), el borrador (Task 10), `POSICIONES_BATERIA`/`INTENTOS_POR_POSICION` (Task 4).
- Produces: `renderBateria()`.

**Requisitos que el reviewer va a verificar uno por uno:**

1. Los valores se cargan con una **tira de botones de 0 a 10**. Ningún `<input>`, ningún teclado.
2. Cada botón mide **al menos 44px de alto**.
3. **"Ausente"** marca al jugador y avanza; se ve distinto de un jugador con 0 cargado.
4. **"Cerrar sesión"** está disponible siempre, con cualquier cantidad de jugadores cargados.
5. El borrador se escribe **en cada tap**, no al final.
6. El borrador se borra **sólo después** de que la RPC confirma.
7. Si la RPC falla, se muestra el error y el borrador queda.
8. Se puede saltar a cualquier jugador sin recorrer la lista entera.

- [ ] **Step 1: Escribir la pantalla**

```js
import { obtenerJugadoresDelPlantel, guardarSesionMedicion } from '../../data/repositorio.js';
import { POSICIONES_BATERIA, INTENTOS_POR_POSICION } from '../../data/posiciones.js';
import { prepararPayloadBateria } from '../../data/prepararPayloadMedicion.js';
import { obtenerClubActual, obtenerPlantelActivo } from '../sesion.js';
import { escaparHtml, toast, esErrorDeRed } from '../nav.js';
import { claveBorrador, guardarBorrador, leerBorrador, borrarBorrador } from '../borradorMedicion.js';
import { ir } from '../main.js';

const $ = (id) => document.getElementById(id);
const contenedor = () => $('bateria-contenido');

let jugadores = [];
let indice = 0;
let valores = {};
let fecha = null;

/** Fecha local, no UTC: después de las 21:00 en Argentina toISOString() ya da mañana. */
function hoyLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function clave() {
  const club = obtenerClubActual();
  const plantel = obtenerPlantelActivo();
  return claveBorrador(club.id, plantel.id, 'tiro');
}

/** Se llama en CADA tap: la sesión en curso no puede depender de que el celular no se bloquee. */
function persistir() {
  guardarBorrador(clave(), { fecha, valores });
}

function estadoDeJugador(jugadorId) {
  const v = valores[jugadorId];
  if (v?.ausente) return 'ausente';
  const cargadas = POSICIONES_BATERIA.filter((p) => v?.[p.id] != null).length;
  if (cargadas === POSICIONES_BATERIA.length) return 'completo';
  if (cargadas > 0) return 'parcial';
  return 'vacio';
}

function tiraDeValores(posicionId, actual) {
  const botones = [];
  for (let n = 0; n <= INTENTOS_POR_POSICION; n++) {
    botones.push(`<button class="num ${actual === n ? 'on' : ''}" data-pos="${posicionId}" data-valor="${n}">${n}</button>`);
  }
  return `<div class="tira">${botones.join('')}</div>`;
}

function render() {
  const jugador = jugadores[indice];
  const v = valores[jugador.id] ?? {};
  const ausente = !!v.ausente;

  contenedor().innerHTML = `
    <div class="pad">
      <div class="progreso-tira" id="progreso-tira">
        ${jugadores.map((j, i) => `
          <button class="paso ${estadoDeJugador(j.id)} ${i === indice ? 'on' : ''}" data-saltar="${i}" aria-label="${escaparHtml(j.nombreLimpio)}">${i + 1}</button>
        `).join('')}
      </div>

      <div class="jug-actual">
        <div class="nom">${escaparHtml(jugador.nombreLimpio)}</div>
        <div class="sub">${indice + 1} de ${jugadores.length} · ${escaparHtml(fecha)}</div>
      </div>

      ${ausente ? `
        <div class="al"><div class="ico">—</div><div class="tx">
          <b>Marcado como ausente.</b>
          <div class="mt">Se guarda como "no midió", no como 0 de 10. Se lo puede medir otro día en una sesión nueva.</div>
        </div></div>
      ` : `
        <div class="posiciones">
          ${POSICIONES_BATERIA.map((p) => `
            <div class="posicion">
              <div class="et">${escaparHtml(p.nombre)}<span class="de">de ${INTENTOS_POR_POSICION}</span></div>
              ${tiraDeValores(p.id, v[p.id] ?? null)}
            </div>
          `).join('')}
        </div>
      `}

      <div class="acciones-bateria">
        <button class="btn sec" id="btn-ausente">${ausente ? 'Estuvo presente' : 'Marcar ausente'}</button>
        <button class="btn" id="btn-siguiente">${indice === jugadores.length - 1 ? 'Terminar' : 'Siguiente'}</button>
      </div>
      <div id="bateria-aviso"></div>
    </div>
    <div class="pie-fijo"><button class="btn sec" id="btn-cerrar-sesion">Cerrar y guardar la sesión</button></div>
  `;

  contenedor().querySelectorAll('[data-valor]').forEach((b) => {
    b.addEventListener('click', () => {
      const pos = b.dataset.pos;
      const n = Number(b.dataset.valor);
      const actual = valores[jugador.id] ?? {};
      // Volver a tocar el mismo número lo borra: es la forma de deshacer un
      // valor cargado por error sin tener que elegir otro que sería mentira.
      const nuevo = actual[pos] === n ? null : n;
      valores[jugador.id] = { ...actual, [pos]: nuevo };
      if (nuevo == null) delete valores[jugador.id][pos];
      delete valores[jugador.id].ausente;
      persistir();
      render();
    });
  });

  contenedor().querySelectorAll('[data-saltar]').forEach((b) => {
    b.addEventListener('click', () => { indice = Number(b.dataset.saltar); render(); });
  });

  $('btn-ausente').addEventListener('click', () => {
    if (valores[jugador.id]?.ausente) {
      delete valores[jugador.id].ausente;
    } else {
      valores[jugador.id] = { ausente: true };
    }
    persistir();
    render();
  });

  $('btn-siguiente').addEventListener('click', () => {
    if (indice < jugadores.length - 1) { indice += 1; render(); }
    else cerrarSesion();
  });

  $('btn-cerrar-sesion').addEventListener('click', cerrarSesion);
}

async function cerrarSesion() {
  const club = obtenerClubActual();
  const plantel = obtenerPlantelActivo();
  const boton = $('btn-cerrar-sesion');
  if (boton.disabled) return;

  const payload = prepararPayloadBateria({ clubId: club.id, plantelId: plantel.id, fecha, valores });
  if (!payload.mediciones.length) {
    $('bateria-aviso').innerHTML = `<div class="al"><div class="tx">Todavía no cargaste ninguna medición.</div></div>`;
    return;
  }

  boton.disabled = true;
  boton.textContent = 'Guardando...';

  try {
    await guardarSesionMedicion(payload);
  } catch (e) {
    // El borrador NO se toca: es lo único que tiene el entrenador si esto
    // falló con el gimnasio sin señal.
    $('bateria-aviso').innerHTML = `<div class="al"><div class="tx">${
      esErrorDeRed(e)
        ? 'Sin conexión. La sesión quedó guardada en el celular: probá de nuevo cuando tengas señal.'
        : 'No se pudo guardar la sesión. Quedó guardada en el celular para reintentar.'
    }</div></div>`;
    boton.disabled = false;
    boton.textContent = 'Cerrar y guardar la sesión';
    return;
  }

  borrarBorrador(clave());
  toast('Sesión guardada');
  await ir('p-medir');
}

export async function renderBateria() {
  const club = obtenerClubActual();
  const plantel = obtenerPlantelActivo();
  if (!club || !plantel) {
    contenedor().innerHTML = `<div class="pad"><div class="p">No hay una categoría seleccionada.</div></div>`;
    return;
  }

  contenedor().innerHTML = `<div class="pad"><div class="p">Cargando plantel...</div></div>`;

  try {
    jugadores = await obtenerJugadoresDelPlantel(club.id, plantel.id);
  } catch (e) {
    contenedor().innerHTML = `<div class="pad"><div class="al"><div class="tx">${
      esErrorDeRed(e) ? 'Sin conexión. Revisá tu wifi/datos e intentá de nuevo.' : 'No se pudo cargar el plantel.'
    }</div></div></div>`;
    return;
  }

  jugadores.sort((a, b) => a.nombreLimpio.localeCompare(b.nombreLimpio));

  if (!jugadores.length) {
    contenedor().innerHTML = `
      <div class="pad"><div class="estado-vacio">
        <h2>${escaparHtml(plantel.categoria)} no tiene jugadores</h2>
        <div class="p">Cargá el plantel antes de medir: desde PLANTEL podés importar una planilla de la CABB o agregar jugadores a mano.</div>
      </div></div>`;
    return;
  }

  const borrador = leerBorrador(clave());
  fecha = borrador?.fecha ?? hoyLocal();
  valores = borrador?.valores ?? {};
  indice = 0;
  render();
}
```

- [ ] **Step 2: Agregar el CSS**

Al final de `componentes.css`. **Ninguna media query** — si hace falta un ajuste por ancho, va en `layout.css`.

```css
/* Etapa 4 — carga de la batería en cancha.
   Targets de 48px: se usa de pie, con una mano, mirando a los chicos y no
   a la pantalla. La tira envuelve sola en dos líneas a 375px. */
.tira{display:flex;flex-wrap:wrap;gap:6px}
.tira .num{flex:1 0 2.6rem;min-height:48px;border:1px solid var(--linea);border-radius:10px;background:var(--papel);color:var(--tinta);font-family:'IBM Plex Mono',monospace;font-size:var(--fs-160);font-weight:600}
.tira .num.on{background:var(--rojo);border-color:var(--rojo);color:#fff}
.posiciones{display:flex;flex-direction:column;gap:16px;margin:14px 0}
.posicion .et{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px;font-size:var(--fs-140);color:var(--tinta)}
.posicion .et .de{font-family:'Barlow Condensed',sans-serif;font-size:var(--fs-120);letter-spacing:.06em;text-transform:uppercase;color:var(--gris-cl)}
.jug-actual{margin:12px 0 4px}
.jug-actual .nom{font-size:var(--fs-220);font-weight:700;color:var(--tinta)}
.jug-actual .sub{font-size:var(--fs-130);color:var(--gris-cl)}
.progreso-tira{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px}
.progreso-tira .paso{min-width:34px;min-height:34px;border-radius:8px;border:1px solid var(--linea);background:var(--papel);color:var(--gris-cl);font-family:'IBM Plex Mono',monospace;font-size:var(--fs-120)}
.progreso-tira .paso.completo{background:var(--rojo);border-color:var(--rojo);color:#fff}
.progreso-tira .paso.parcial{border-color:var(--rojo);color:var(--rojo)}
.progreso-tira .paso.ausente{border-style:dashed}
.progreso-tira .paso.on{outline:2px solid var(--tinta);outline-offset:1px}
.acciones-bateria{display:flex;gap:8px;margin-top:16px}
.acciones-bateria .btn{flex:1}
```

> Igual que en la Task 9: si algún token no existe con ese nombre en `tokens.css`, usá el real. No inventes tokens ni pongas hex sueltos.

- [ ] **Step 3: Verificar los requisitos por grep y commitear**

```bash
node --check src/ui/pantallas/medirBateria.js
# No puede haber ningún input en la pantalla de carga en cancha:
grep -c "<input" src/ui/pantallas/medirBateria.js            # Expected: 0
grep -c "inputmode" src/ui/pantallas/medirBateria.js         # Expected: 0
# El borrador se borra DESPUÉS del await de la RPC, no antes:
grep -n "borrarBorrador\|await guardarSesionMedicion" src/ui/pantallas/medirBateria.js
grep -c "@media" public/css/componentes.css                  # Expected: 0
npm test
git add src/ui/pantallas/medirBateria.js public/css/componentes.css
git commit -m "feat: add the on-court shooting battery capture screen"
```

---

## Task 13: MEDIR — velocidad

**Modelo sugerido:** medio.

**Files:**
- Modify: `src/ui/pantallas/medirVelocidad.js` (reemplaza el esqueleto)
- Modify: `public/css/componentes.css` (append)

**Interfaces:**
- Consumes: `obtenerJugadoresDelPlantel`, `guardarSesionMedicion` (Task 8), `prepararPayloadVelocidad`/`redondearSegundos` (Task 7), el borrador (Task 10).
- Produces: `renderVelocidad()`.

**Decisión que hay que respetar:** acá **sí** va teclado numérico (`inputmode="decimal"`). Es la excepción explícita a la regla de "contador, no teclado" de la batería: el valor es un decimal, el cuerpo técnico ya lo venía cargando en Excel, y las teclas del teclado del celular son más grandes que una fila de décimas. El redondeo a un decimal lo hace `redondearSegundos` al guardar, y `numeric(4,1)` lo garantiza en la base.

- [ ] **Step 1: Escribir la pantalla**

```js
import { obtenerJugadoresDelPlantel, guardarSesionMedicion } from '../../data/repositorio.js';
import { prepararPayloadVelocidad, redondearSegundos } from '../../data/prepararPayloadMedicion.js';
import { obtenerClubActual, obtenerPlantelActivo } from '../sesion.js';
import { escaparHtml, toast, esErrorDeRed } from '../nav.js';
import { claveBorrador, guardarBorrador, leerBorrador, borrarBorrador } from '../borradorMedicion.js';
import { ir } from '../main.js';

const $ = (id) => document.getElementById(id);
const contenedor = () => $('velocidad-contenido');

/**
 * El protocolo todavía no está cerrado por el cuerpo técnico. Se muestra en
 * pantalla y se edita acá cuando lo definan.
 */
export const PROTOCOLO_VELOCIDAD =
  'Largo de cancha completo, un intento, cronómetro a mano. El protocolo todavía no está cerrado por el cuerpo técnico.';

let jugadores = [];
let valores = {};
let fecha = null;

function hoyLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function clave() {
  const club = obtenerClubActual();
  const plantel = obtenerPlantelActivo();
  return claveBorrador(club.id, plantel.id, 'velocidad');
}

function persistir() {
  guardarBorrador(clave(), { fecha, valores });
}

function render() {
  contenedor().innerHTML = `
    <div class="pad">
      <div class="eyebrow">Velocidad · ${escaparHtml(fecha)}</div>
      <div class="p">${escaparHtml(PROTOCOLO_VELOCIDAD)}</div>
      <div class="lista-2col">
        ${jugadores.map((j) => `
          <div class="vel-fila">
            <div class="nom">${escaparHtml(j.nombreLimpio)}</div>
            <div class="campo-vel">
              <input id="vel-${j.id}" data-jugador="${j.id}" type="text" inputmode="decimal"
                     autocomplete="off" placeholder="—" value="${escaparHtml(valores[j.id] ?? '')}"
                     aria-label="Segundos de ${escaparHtml(j.nombreLimpio)}">
              <span class="u">s</span>
            </div>
          </div>
        `).join('')}
      </div>
      <div id="velocidad-aviso"></div>
    </div>
    <div class="pie-fijo"><button class="btn" id="btn-guardar-velocidad">Guardar la sesión</button></div>
  `;

  contenedor().querySelectorAll('[data-jugador]').forEach((input) => {
    input.addEventListener('input', () => {
      valores[input.dataset.jugador] = input.value;
      persistir();
    });
    // Al salir del campo se normaliza a un decimal, para que el entrenador
    // vea exactamente lo que se va a guardar y no una precisión que no existe.
    input.addEventListener('blur', () => {
      const n = redondearSegundos(input.value);
      input.value = n == null ? '' : String(n);
      valores[input.dataset.jugador] = input.value;
      persistir();
    });
  });

  $('btn-guardar-velocidad').addEventListener('click', guardar);
}

async function guardar() {
  const club = obtenerClubActual();
  const plantel = obtenerPlantelActivo();
  const boton = $('btn-guardar-velocidad');
  if (boton.disabled) return;

  const payload = prepararPayloadVelocidad({ clubId: club.id, plantelId: plantel.id, fecha, valores });
  if (!payload.mediciones.length) {
    $('velocidad-aviso').innerHTML = `<div class="al"><div class="tx">Todavía no cargaste ningún tiempo.</div></div>`;
    return;
  }

  boton.disabled = true;
  boton.textContent = 'Guardando...';

  try {
    await guardarSesionMedicion(payload);
  } catch (e) {
    $('velocidad-aviso').innerHTML = `<div class="al"><div class="tx">${
      esErrorDeRed(e)
        ? 'Sin conexión. La sesión quedó guardada en el celular: probá de nuevo cuando tengas señal.'
        : 'No se pudo guardar la sesión. Quedó guardada en el celular para reintentar.'
    }</div></div>`;
    boton.disabled = false;
    boton.textContent = 'Guardar la sesión';
    return;
  }

  borrarBorrador(clave());
  toast('Sesión guardada');
  await ir('p-medir');
}

export async function renderVelocidad() {
  const club = obtenerClubActual();
  const plantel = obtenerPlantelActivo();
  if (!club || !plantel) {
    contenedor().innerHTML = `<div class="pad"><div class="p">No hay una categoría seleccionada.</div></div>`;
    return;
  }

  contenedor().innerHTML = `<div class="pad"><div class="p">Cargando plantel...</div></div>`;

  try {
    jugadores = await obtenerJugadoresDelPlantel(club.id, plantel.id);
  } catch (e) {
    contenedor().innerHTML = `<div class="pad"><div class="al"><div class="tx">${
      esErrorDeRed(e) ? 'Sin conexión. Revisá tu wifi/datos e intentá de nuevo.' : 'No se pudo cargar el plantel.'
    }</div></div></div>`;
    return;
  }

  jugadores.sort((a, b) => a.nombreLimpio.localeCompare(b.nombreLimpio));

  if (!jugadores.length) {
    contenedor().innerHTML = `
      <div class="pad"><div class="estado-vacio">
        <h2>${escaparHtml(plantel.categoria)} no tiene jugadores</h2>
        <div class="p">Cargá el plantel antes de medir.</div>
      </div></div>`;
    return;
  }

  const borrador = leerBorrador(clave());
  fecha = borrador?.fecha ?? hoyLocal();
  valores = borrador?.valores ?? {};
  render();
}
```

- [ ] **Step 2: CSS, verificación y commit**

```css
/* Etapa 4 — carga de velocidad */
.vel-fila{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 0;border-bottom:1px solid var(--linea)}
.vel-fila .nom{font-size:var(--fs-150);color:var(--tinta)}
.campo-vel{display:flex;align-items:center;gap:6px}
.campo-vel input{width:5rem;min-height:48px;text-align:right;border:1px solid var(--linea);border-radius:10px;background:var(--papel);color:var(--tinta);font-family:'IBM Plex Mono',monospace;font-size:var(--fs-160);padding:0 10px}
.campo-vel .u{font-family:'Barlow Condensed',sans-serif;font-size:var(--fs-130);color:var(--gris-cl)}
```

```bash
node --check src/ui/pantallas/medirVelocidad.js
npm test
git add src/ui/pantallas/medirVelocidad.js public/css/componentes.css
git commit -m "feat: add speed measurement capture with one-decimal rounding"
```

---

## Task 14: DATOS — reparto y evolución

**Modelo sugerido:** medio.

**Files:**
- Modify: `src/ui/pantallas/datos.js` (**agregar secciones; `iniciarDatos` y el flujo de import no se tocan**)
- Modify: `public/css/componentes.css` (append)

**Interfaces:**
- Consumes: `obtenerEstadisticasDelPlantel` (Task 8), `repartoPorJugador`/`evolucionDeTiroDelEquipo` (Task 5), `obtenerJugadoresDelPlantel`, `barras` (Task 9), `grafico` (Task 9).
- Produces: nada que consuman otras tasks.

**Cuidado:** `iniciarDatos()` registra el listener del input de archivo y el retorno del import. **No la toques.** `renderDatos` se extiende, no se reescribe: la lista de partidos tiene que seguir funcionando igual.

- [ ] **Step 1: Agregar dos helpers compartidos al final de `src/ui/nav.js`**

Van en `nav.js` porque los usan DATOS (Task 14), la ficha (Task 15) y HOY (Task 17). Definirlos en una pantalla y después moverlos sería duplicarlos primero y arreglarlo después.

```js
/**
 * Un porcentaje SIEMPRE con sus intentos al lado, y la marca de muestra
 * chica cuando corresponde. `p` es lo que devuelve porcentaje() de
 * estadisticas.js: o null, o {pct, anotados, intentos, muestraChica}.
 *
 * Es el único lugar donde se convierte un porcentaje en texto, así que la
 * regla "ningún porcentaje sin su denominador" no depende de que cada
 * pantalla se acuerde.
 */
export function textoPorcentaje(p) {
  if (p == null) return '<span class="sin">sin datos</span>';
  const marca = p.muestraChica ? '<span class="poco-tag">pocos datos</span>' : '';
  return `<span class="${p.muestraChica ? 'poco' : ''}">${p.pct}% · ${p.anotados}/${p.intentos}</span>${marca}`;
}

/** 'YYYY-MM-DD' → 'DD/MM'. A mano: new Date('2026-05-01') es UTC y se corre un día. */
export function formatearFechaCorta(iso) {
  const [, mes, dia] = iso.split('-');
  return `${dia}/${mes}`;
}
```

- [ ] **Step 2: Extender `renderDatos`**

Después de pintar la lista de partidos, agregá las dos secciones. Si no hay partidos, el estado vacío que ya existe se queda como está y no se agrega nada más (no hay nada que repartir).

```js
// Agregar a los imports de arriba, sin sacar ninguno de los que están.
// `escaparHtml` y `esErrorDeRed` ya se importan de nav.js: sumá textoPorcentaje
// a ESE import, no agregues una segunda línea de import del mismo módulo.
import { obtenerEstadisticasDelPlantel, obtenerJugadoresDelPlantel } from '../../data/repositorio.js';
import { repartoPorJugador, evolucionDeTiroDelEquipo } from '../../data/estadisticas.js';
import { barras } from '../componentes/barras.js';
import { grafico } from '../componentes/graficos.js';

function minutosLegibles(segundos) {
  return `${Math.round(segundos / 60)}′`;
}

async function renderSeccionesDeEquipo(club, plantel) {
  const cont = document.getElementById('datos-equipo');
  if (!cont) return;

  let estadisticas = [];
  let jugadores = [];
  let partidos = [];
  try {
    [estadisticas, jugadores, partidos] = await Promise.all([
      obtenerEstadisticasDelPlantel(club.id, plantel.id),
      obtenerJugadoresDelPlantel(club.id, plantel.id),
      obtenerPartidosDelPlantel(club.id, plantel.id),
    ]);
  } catch {
    cont.innerHTML = `<div class="p">No se pudieron cargar las estadísticas del equipo.</div>`;
    return;
  }

  if (!estadisticas.length) {
    cont.innerHTML = `
      <div class="eyebrow">Reparto del equipo</div>
      <div class="p">Cuando cargues un partido va a aparecer acá cuánto juega y cuánto anota cada uno.</div>`;
    return;
  }

  const nombre = new Map(jugadores.map((j) => [j.id, j.nombreLimpio]));
  const etiqueta = (id) => nombre.get(id) ?? 'Jugador de otra categoría';

  const minutos = repartoPorJugador(estadisticas, 'minSegundos');
  const puntos = repartoPorJugador(estadisticas, 'pts');

  const lectura = (r, que) => r.jugadoresQueConcentranLaMitad === 0
    ? ''
    : `<div class="p">Los primeros ${r.jugadoresQueConcentranLaMitad} jugadores concentran más de la mitad de ${que}.</div>`;

  cont.innerHTML = `
    <div class="eyebrow">Reparto de minutos</div>
    ${lectura(minutos, 'los minutos')}
    ${barras(minutos.filas.map((f) => ({ etiqueta: etiqueta(f.jugadorId), valor: f.valor })), { formatearValor: minutosLegibles })}

    <div class="eyebrow">Reparto de puntos</div>
    ${lectura(puntos, 'los puntos')}
    ${barras(puntos.filas.map((f) => ({ etiqueta: etiqueta(f.jugadorId), valor: f.valor })), { formatearValor: (v) => String(v) })}

    <div class="eyebrow">Tiro del equipo, partido a partido</div>
    <div id="datos-evolucion"></div>
  `;

  const evolucion = evolucionDeTiroDelEquipo(partidos, estadisticas);
  document.getElementById('datos-evolucion').innerHTML = `
    <svg class="g" id="svg-evolucion"></svg>
    <div class="leyenda"><span class="s2">2P</span><span class="s3">3P</span><span class="sl">TL</span></div>
    <div class="tabla-ev">
      ${evolucion.map((e) => `
        <div class="fila-ev">
          <div class="f">${escaparHtml(formatearFecha(e.fecha))}</div>
          <div>2P ${textoPorcentaje(e.dos)}</div>
          <div>3P ${textoPorcentaje(e.tres)}</div>
          <div>TL ${textoPorcentaje(e.libres)}</div>
        </div>
      `).join('')}
    </div>
  `;

  // Con un solo partido no se dibuja línea: grafico() devuelve true igual y
  // pinta el punto. Con cero, devuelve false y el svg queda en alto 0.
  grafico(document.getElementById('svg-evolucion'), {
    etiquetas: evolucion.map((e) => formatearFecha(e.fecha)),
    series: [
      { nombre: '2P', c: '#D9122E', d: evolucion.map((e) => e.dos?.pct ?? null) },
      { nombre: '3P', c: '#131316', d: evolucion.map((e) => e.tres?.pct ?? null) },
      { nombre: 'TL', c: '#726E65', dash: true, d: evolucion.map((e) => e.libres?.pct ?? null) },
    ],
  });
}
```

En `renderDatos`, agregá `<div id="datos-equipo"></div>` dentro del `.pad`, después de `<div id="datos-lista"></div>`, y llamá a `renderSeccionesDeEquipo(club, plantel)` al final — **sólo cuando hay partidos**, después de pintar la lista.

- [ ] **Step 3: CSS, verificación y commit**

```css
/* Etapa 4 — evolución del equipo */
.tabla-ev{display:flex;flex-direction:column;gap:6px;margin-top:10px}
.fila-ev{display:grid;grid-template-columns:auto 1fr 1fr 1fr;gap:8px;align-items:baseline;padding:8px 0;border-bottom:1px solid var(--linea);font-size:var(--fs-130)}
.fila-ev .f{font-family:'IBM Plex Mono',monospace;color:var(--gris-cl)}
.fila-ev .sin{color:var(--gris-cl)}
```

```bash
node --check src/ui/pantallas/datos.js
# El flujo de import no se puede haber tocado:
git diff src/ui/pantallas/datos.js | grep -c "^-.*iniciarConfirmacion\|^-.*setRetornoImport\|^-.*input-archivo"   # Expected: 0
npm test
git add src/ui/pantallas/datos.js public/css/componentes.css
git commit -m "feat: add team minute and point distribution and shooting evolution to DATOS"
```

---

## Task 15: Ficha del jugador — su historia

**Modelo sugerido:** capaz — es la pantalla que justifica el proyecto y la que más reglas de presentación toca.

**Files:**
- Modify: `src/ui/pantallas/fichaJugador.js` (**agregar secciones, preservar lo que hay**)
- Modify: `public/css/componentes.css` (append)

**Interfaces:**
- Consumes: `obtenerSesionesDeMedicion`, `obtenerMedicionesTiroDelPlantel`, `obtenerMedicionesVelocidadDelPlantel`, `obtenerEstadisticasDelPlantel`, `obtenerPartidosDelPlantel`, `obtenerEnviosDeJugador` (Task 8); `serieDeTiroDelJugador`, `ultimaBateriaDeJugador`, `historialDePartidosDelJugador` (Task 6); `cancha`, `grafico` (Task 9).

**Reglas que el reviewer verifica:**

1. **Ninguna resta entre práctica y partido.** Ni en el código ni en pantalla.
2. Los dos gráficos tienen práctica y partido como series **visualmente distinguibles** (color y línea punteada, no sólo color).
3. Todo porcentaje va con sus intentos.
4. `NULL` se muestra como "sin medir".
5. Cada sección tiene estado vacío propio: la ficha de un chico sin nada cargado no puede quedar en blanco.

- [ ] **Step 1: Extender `renderFicha`**

Después del bloque que ya existe, agregá las secciones. Las series de práctica y partido tienen fechas distintas, así que el eje se arma con la **unión ordenada** de las dos.

```js
/**
 * Une las fechas de las dos series en un solo eje, y devuelve cada serie
 * alineada a ese eje con null en las fechas donde no tiene punto.
 *
 * Práctica y partido pasan en días distintos: sin esto, el punto 3 de una
 * serie caería sobre el punto 3 de la otra aunque sean de meses distintos.
 */
function ejeComun(serieA, serieB) {
  const fechas = [...new Set([...serieA.map((p) => p.fecha), ...serieB.map((p) => p.fecha)])].sort();
  const alinear = (serie) => {
    const porFecha = new Map(serie.map((p) => [p.fecha, p.valor.pct]));
    return fechas.map((f) => porFecha.get(f) ?? null);
  };
  return { fechas, a: alinear(serieA), b: alinear(serieB) };
}

function bloqueDeSerie(id, titulo, serie, ayuda) {
  const total = serie.practica.length + serie.partido.length;
  if (total === 0) {
    return `<div class="eyebrow">${titulo}</div><div class="p">${ayuda}</div>`;
  }
  return `
    <div class="eyebrow">${titulo}</div>
    <svg class="g" id="${id}"></svg>
    <div class="leyenda">
      <span class="linea-practica">Práctica</span>
      <span class="linea-partido">Partido</span>
    </div>
    <div class="detalle-serie">
      ${serie.practica.length ? `<div>Última práctica: ${textoPorcentaje(serie.practica.at(-1).valor)}</div>` : ''}
      ${serie.partido.length ? `<div>Último partido: ${textoPorcentaje(serie.partido.at(-1).valor)}</div>` : ''}
    </div>
  `;
}

function dibujarSerie(id, serie) {
  const svg = document.getElementById(id);
  if (!svg) return;
  const { fechas, a, b } = ejeComun(serie.practica, serie.partido);
  grafico(svg, {
    etiquetas: fechas.map(formatearFechaCorta),
    series: [
      { nombre: 'Práctica', c: '#131316', d: a },
      { nombre: 'Partido', c: '#D9122E', dash: true, d: b },
    ],
  });
}
```

`textoPorcentaje` y `formatearFechaCorta` ya existen en `src/ui/nav.js` desde la Task 14: importalas, no las redefinas.

El resto de las secciones:

```js
function seccionCancha(bateria) {
  if (!bateria) {
    return `<div class="eyebrow">Tiro por posición</div>
      <div class="p">Todavía no tiene ninguna batería cargada. Se mide desde MEDIR.</div>`;
  }
  return `
    <div class="eyebrow">Tiro por posición <span class="der">${escaparHtml(formatearFechaCorta(bateria.fecha))}</span></div>
    <div class="tarj">
      <svg class="g" id="ficha-cancha"></svg>
      <div class="leyenda"><span>Práctica: 10 tiros por posición. El partido no dice desde dónde se tiró, así que no se superpone acá.</span></div>
    </div>
  `;
}

function seccionPartidos(historial) {
  if (!historial.length) {
    return `<div class="eyebrow">Partido a partido</div>
      <div class="p">Todavía no jugó ningún partido cargado.</div>`;
  }
  return `
    <div class="eyebrow">Partido a partido</div>
    <div class="tabla-part">
      ${historial.map((h) => `
        <div class="fila-part">
          <div class="cab">
            <div class="riv">${escaparHtml(h.rivalNombre ?? 'Rival sin nombre')}</div>
            <div class="f">${escaparHtml(formatearFechaCorta(h.fecha))}</div>
          </div>
          <div class="nums">
            <span>${h.minSegundos == null ? '<span class="sin">sin dato</span>' : `${Math.round(h.minSegundos / 60)}′`}</span>
            <span>${h.pts == null ? '<span class="sin">sin dato</span>' : `${h.pts} pts`}</span>
          </div>
          <div class="tiros">
            <div>2P ${textoPorcentaje(h.dos)}</div>
            <div>3P ${textoPorcentaje(h.tres)}</div>
            <div>TL ${textoPorcentaje(h.libres)}</div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

/**
 * Velocidad: se listan los valores con su fecha y NO se grafica tendencia.
 * Con un intento por sesión y ~0.2s de error humano de cronómetro, una línea
 * de tendencia mentiría (spec, Decisión 6).
 */
function seccionVelocidad(velocidades) {
  if (!velocidades.length) {
    return `<div class="eyebrow">Velocidad</div><div class="p">Sin medir.</div>`;
  }
  return `
    <div class="eyebrow">Velocidad</div>
    <div class="tabla-ev">
      ${velocidades.map((v) => `
        <div class="fila-ev dos">
          <div class="f">${escaparHtml(formatearFechaCorta(v.fecha))}</div>
          <div>${v.segundos.toFixed(1)} s</div>
        </div>
      `).join('')}
    </div>
  `;
}

function seccionRecursos(envios) {
  if (!envios.length) {
    return `<div class="eyebrow">Recursos enviados</div>
      <div class="p">Todavía no se le mandó ningún material.</div>`;
  }
  return `
    <div class="eyebrow">Recursos enviados</div>
    ${envios.map((e) => `
      <div class="rec">
        <div class="t">${escaparHtml(e.titulo ?? 'Recurso borrado')}</div>
        <div class="m"><span class="tag">${escaparHtml(formatearFechaCorta(e.fecha))}</span></div>
      </div>
    `).join('')}
  `;
}
```

En `renderFicha`, después del bloque que ya existe: traé los datos con un solo `Promise.all`, armá el HTML con las secciones, y recién ahí dibujá los SVG (`cancha` y los dos `dibujarSerie`), porque los elementos tienen que existir en el DOM antes.

```js
  const [sesiones, medicionesTiro, velocidades, partidos, estadisticas, envios] = await Promise.all([
    obtenerSesionesDeMedicion(club.id, plantel.id),
    obtenerMedicionesTiroDelPlantel(club.id, plantel.id),
    obtenerMedicionesVelocidadDelPlantel(club.id, plantel.id),
    obtenerPartidosDelPlantel(club.id, plantel.id),
    obtenerEstadisticasDelPlantel(club.id, plantel.id),
    obtenerEnviosDeJugador(club.id, jugadorId),
  ]);

  const bateria = ultimaBateriaDeJugador(sesiones, medicionesTiro, jugadorId);
  const series = serieDeTiroDelJugador({ sesiones, medicionesTiro, partidos, estadisticas, jugadorId });
  const historial = historialDePartidosDelJugador(partidos, estadisticas, jugadorId);
  const velocidadesDelJugador = velocidades
    .filter((v) => v.jugadorId === jugadorId && v.segundos != null)
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
```

Todo ese bloque va dentro de un `try/catch`: si falla, se muestra el mismo mensaje de "sin conexión / no se pudo cargar" que ya usa la ficha, y las secciones nuevas no se dibujan. Los datos básicos del jugador (nombre, categorías, talla, peso) ya se pintaron antes, así que un error de red acá no puede dejar la pantalla en blanco.

- [ ] **Step 2: Verificar que no hay ninguna resta entre series y commitear**

```bash
node --check src/ui/pantallas/fichaJugador.js
# No puede existir ninguna resta entre práctica y partido:
grep -niE "practica.*-.*partido|partido.*-.*practica|brecha|diferencia" src/ui/pantallas/fichaJugador.js
# Expected: sin salida (o sólo comentarios que expliquen por qué NO se calcula)
npm test
git add src/ui/pantallas/fichaJugador.js src/ui/nav.js public/css/componentes.css
git commit -m "feat: add player history with practice and game shooting series"
```

---

## Task 16: RECURSOS

**Modelo sugerido:** medio.

**Files:**
- Modify: `src/ui/pantallas/recursos.js` (reescritura completa)
- Modify: `public/css/componentes.css` (append)

**Interfaces:**
- Consumes: `obtenerRecursos`, `guardarRecurso`, `obtenerJugadoresDelPlantel` (Task 8); `abrirHoja`/`cerrarHoja` (ya existe).

**Reglas:**
1. **Ningún mecanismo de cumplimiento, racha ni "visto".** Nada de "3 lo abrieron".
2. Selección múltiple más "todo el plantel".
3. Queda registrado a quién y cuándo.

- [ ] **Step 1: Reescribir la pantalla**

Fuera `bannerEjemplo` y `BIBLIO`. La lista muestra los recursos reales con a cuántos se les envió y cuándo. El alta abre la hoja, con el mismo patrón que `altaJugador.js`.

```js
import { obtenerRecursos, guardarRecurso, obtenerJugadoresDelPlantel } from '../../data/repositorio.js';
import { obtenerClubActual, obtenerPlantelActivo } from '../sesion.js';
import { escaparHtml, toast, esErrorDeRed, formatearFechaCorta } from '../nav.js';
import { abrirHoja, cerrarHoja } from '../componentes/hoja.js';

const $ = (id) => document.getElementById(id);
const contenedor = () => $('recursos-contenido');

function hoyLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Un recurso muestra a cuántos se les mandó y cuándo. NO muestra quién lo
 * abrió, ni rachas, ni "visto": con adolescentes, el seguimiento estricto
 * convierte una herramienta de desarrollo en una de vigilancia (spec, §9).
 */
function tarjetaRecurso(r) {
  const cuantos = r.envios.length;
  const ultima = cuantos ? r.envios.map((e) => e.fecha).sort().at(-1) : null;
  return `
    <div class="rec">
      <div class="t">${escaparHtml(r.titulo)}</div>
      <div class="d">${escaparHtml(r.descripcion)}</div>
      ${r.enlace ? `<a class="enlace-rec" href="${escaparHtml(r.enlace)}" target="_blank" rel="noopener noreferrer">Abrir el material</a>` : ''}
      <div class="m">
        <span class="tag rojo">${cuantos} jugador${cuantos === 1 ? '' : 'es'}</span>
        ${ultima ? `<span class="tag">${escaparHtml(formatearFechaCorta(ultima))}</span>` : ''}
      </div>
      <button class="btn sec chico" data-reenviar="${r.id}">Enviar a más jugadores</button>
    </div>
  `;
}

function cuerpoDeHoja(jugadores, { conCampos }) {
  return `
    ${conCampos ? `
      <div class="campo"><label for="in-rec-titulo">Título</label>
        <input id="in-rec-titulo" type="text" autocomplete="off"></div>
      <div class="campo"><label for="in-rec-desc">Instrucciones</label>
        <textarea id="in-rec-desc" rows="3"></textarea></div>
      <div class="campo"><label for="in-rec-link">Link (opcional)</label>
        <input id="in-rec-link" type="url" autocomplete="off" inputmode="url" placeholder="https://"></div>
    ` : ''}
    <div class="eyebrow">A quién <button class="btn sec chico" id="btn-todos" type="button">Todo el plantel</button></div>
    <div class="lista-chk">
      ${jugadores.map((j) => `
        <label class="chk-fila">
          <input type="checkbox" class="chk-jug" value="${j.id}">
          <span>${escaparHtml(j.nombreLimpio)}</span>
        </label>
      `).join('')}
    </div>
    <div id="rec-aviso"></div>
    <button class="btn" id="btn-rec-confirmar">Registrar el envío</button>
  `;
}
```

`abrirAltaDeRecurso(recursoId)` abre la hoja con `cuerpoDeHoja(jugadores, {conCampos: recursoId == null})`, engancha "Todo el plantel" (marca todos los checkboxes), y en confirmar:

```js
async function confirmarEnvio(recursoId) {
  const boton = $('btn-rec-confirmar');
  // Misma guarda que altaJugador.js: click y Enter son dos entradas al mismo
  // flujo, y ésta es la única que cubre a las dos con la RPC en vuelo.
  if (boton.disabled) return;

  const jugadorIds = [...document.querySelectorAll('.chk-jug:checked')].map((c) => c.value);
  const titulo = recursoId ? null : $('in-rec-titulo').value.trim();
  const descripcion = recursoId ? null : $('in-rec-desc').value.trim();

  if (!recursoId && (!titulo || !descripcion)) {
    $('rec-aviso').innerHTML = `<div class="al"><div class="tx">Poné un título y las instrucciones.</div></div>`;
    return;
  }
  if (!jugadorIds.length) {
    $('rec-aviso').innerHTML = `<div class="al"><div class="tx">Elegí al menos un jugador.</div></div>`;
    return;
  }

  boton.disabled = true;
  boton.textContent = 'Registrando...';
  try {
    await guardarRecurso({
      clubId: obtenerClubActual().id,
      recursoId: recursoId ?? null,
      titulo,
      descripcion,
      enlace: recursoId ? null : ($('in-rec-link').value.trim() || null),
      fecha: hoyLocal(),
      jugadorIds,
    });
  } catch (e) {
    $('rec-aviso').innerHTML = `<div class="al"><div class="tx">${
      esErrorDeRed(e) ? 'Sin conexión. Revisá tu wifi/datos e intentá de nuevo.' : 'No se pudo registrar el envío.'
    }</div></div>`;
    boton.disabled = false;
    boton.textContent = 'Registrar el envío';
    return;
  }
  cerrarHoja();
  toast('Envío registrado');
  await renderRecursos();
}
```

`renderRecursos` trae `obtenerRecursos(club.id)`, y con la lista vacía muestra:

> **Todavía no compartiste ningún recurso.** El chico lo recibe por donde ya se hablan hoy (WhatsApp). Lo que hace la app es dejar registrado qué se mandó, a quién y cuándo — que es justo lo que se pierde cuando cambia el entrenador.

Y el texto de cabecera mantiene el tono del prototipo: *"Material que dejás disponible para que el que quiera progrese por su cuenta. No es obligación ni control."*

CSS nuevo:

```css
/* Etapa 4 — selección múltiple de jugadores */
.lista-chk{display:flex;flex-direction:column;max-height:40vh;overflow-y:auto;margin:8px 0}
.chk-fila{display:flex;align-items:center;gap:10px;min-height:48px;padding:0 2px;border-bottom:1px solid var(--linea);font-size:var(--fs-150)}
.chk-fila input{width:22px;height:22px;flex:0 0 auto}
.enlace-rec{display:inline-block;margin-top:6px;font-size:var(--fs-140);color:var(--rojo)}
```

- [ ] **Step 2: Verificar que no entró ningún mecanismo de control y commitear**

```bash
node --check src/ui/pantallas/recursos.js
grep -niE "visto|racha|cumplimiento|abrieron|complet[oó]|pendiente" src/ui/pantallas/recursos.js
# Expected: sin salida
grep -c "datosEjemplo\|bannerEjemplo\|BIBLIO" src/ui/pantallas/recursos.js   # Expected: 0
npm test
git add src/ui/pantallas/recursos.js public/css/componentes.css
git commit -m "feat: rebuild RECURSOS on real resources and send records"
```

---

## Task 17: HOY, borrado de los datos de ejemplo y guarda de regresión

**Modelo sugerido:** medio.

**Files:**
- Modify: `src/ui/pantallas/hoy.js` (reescritura completa)
- Delete: `src/ui/datosEjemplo.js`
- Delete: `src/ui/componentes/bannerEjemplo.js`
- Modify: `public/css/componentes.css` (borrar la regla `.banner-ejemplo`)
- Create: `tests/sinDatosDeEjemplo.test.js`
- Modify: `package.json`

- [ ] **Step 1: Reescribir HOY sobre datos reales**

Sin datos cargados: estado vacío honesto con el camino para empezar (cargar el plantel, cargar un partido, hacer la primera medición). Con datos: la cancha del plantel con `promedioDeCanchaDelPlantel` —con los intentos debajo de cada posición, que ya los dibuja `cancha()`— y cuántas posiciones faltan medir.

**No** se construyen las alertas de "chicos sin mejora" ni "el promedio subió X puntos": marcar a un chico como "sin mejora" necesita un umbral de qué cuenta como mejora, y el prompt prohíbe inventar umbrales.

- [ ] **Step 2: Borrar los archivos de ejemplo**

```bash
git rm src/ui/datosEjemplo.js src/ui/componentes/bannerEjemplo.js
```

Y sacá de `componentes.css` el bloque de la regla `.banner-ejemplo` (sólo esa; el resto queda).

- [ ] **Step 3: Escribir la guarda de regresión**

Igual que `navegacionInvariante.test.js` protege el invariante del botón de volver, este test hace que "no queda ninguna franja de datos de ejemplo" no dependa de que alguien se acuerde.

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function archivosJs(dir) {
  return readdirSync(dir).flatMap((entrada) => {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) return archivosJs(ruta);
    return ruta.endsWith('.js') ? [ruta] : [];
  });
}

test('no queda ningún dato de ejemplo en la app', () => {
  const ofensores = archivosJs('src').filter((ruta) => {
    const src = readFileSync(ruta, 'utf8');
    return /datosEjemplo|bannerEjemplo|JUGADORES_EJEMPLO|CARGADOS_EJEMPLO/.test(src);
  });
  assert.deepEqual(ofensores, [], `Estos archivos todavía referencian datos de ejemplo: ${ofensores.join(', ')}`);
});

test('la franja de datos de ejemplo no existe en el CSS', () => {
  const css = readFileSync('public/css/componentes.css', 'utf8');
  assert.equal(/\.banner-ejemplo/.test(css), false);
});
```

- [ ] **Step 4: Verificar que el test discrimina**

Antes de darlo por bueno, comprobá que **falla** si el problema existe: creá un archivo temporal en `src/ui/` que importe `datosEjemplo`, corré el test, confirmá que falla, y borralo. Un test que pasa siempre no protege nada.

- [ ] **Step 5: Correr todo y commitear**

```bash
npm test          # Expected: # fail 0, con los tests nuevos incluidos
grep -rc "datosEjemplo\|bannerEjemplo" src/ | grep -v ":0"   # Expected: sin salida
git add -A src public/css/componentes.css tests/sinDatosDeEjemplo.test.js package.json
git commit -m "feat: rebuild HOY on real data and remove all example data"
```

---

## Task 18: Verificación final

**Modelo sugerido:** los comandos los corre el controlador, sin subagente.

- [ ] **Step 1: Arquitectura por grep**

```bash
# src/ui/ no puede tocar Supabase ni la red:
grep -rn "@supabase/supabase-js" src/ui/          # Expected: sin salida
grep -rn "fetch(" src/ui/                          # Expected: sin salida
# src/data/ no puede tocar el DOM:
grep -rn "document\.\|window\." src/data/          # Expected: sin salida
# Todos los breakpoints en layout.css:
grep -c "@media" public/css/componentes.css        # Expected: 0
grep -c "@media" public/css/base.css               # Expected: 0
# El umbral vive en un solo lugar:
grep -rn "UMBRAL_INTENTOS =" src/                  # Expected: 1 línea, en estadisticas.js
# Toda RPC nueva es security invoker:
grep -c "security invoker" supabase/migrations/0010_rpc_guardar_sesion_medicion.sql   # Expected: 1
grep -c "security invoker" supabase/migrations/0011_rpc_guardar_recurso.sql           # Expected: 1
grep -rc "security definer" supabase/migrations/                                       # Expected: todo en 0
```

- [ ] **Step 2: El import no se tocó**

```bash
git diff pre-etapa-4 --stat -- src/parser/ src/data/mapearImportacion.js src/data/prepararPayloadImportacion.js src/ui/pantallas/confirmacionImport.js src/ui/pantallas/resultadoImport.js supabase/migrations/0001_esquema_inicial.sql supabase/migrations/0002_rls.sql supabase/migrations/0003_seed_dev.sql supabase/migrations/0004_seed_piloto.sql supabase/migrations/0005_rpc_importar_partido.sql supabase/migrations/0006_grants_authenticated.sql supabase/migrations/0007_mediciones_jugador.sql supabase/migrations/0008_rpc_alta_jugador.sql
# Expected: sin salida
```

- [ ] **Step 3: `npm test` completo**

```bash
npm test          # Expected: # fail 0
```

- [ ] **Step 4: Lo que necesita a la persona**

Estos pasos no los puede hacer un agente y quedan para Tomás:

1. `npx supabase db push` — aplica `0009`, `0010` y `0011`.
2. Correr los dos scripts de rollback (los puede correr el agente una vez aplicadas las migraciones):
   ```bash
   SUPABASE_URL=... SUPABASE_PUBLISHABLE_KEY=... VERIFICAR_RPC_EMAIL=... VERIFICAR_RPC_PASSWORD=... node tests/verificarSesionMedicion.js
   SUPABASE_URL=... SUPABASE_PUBLISHABLE_KEY=... VERIFICAR_RPC_EMAIL=... VERIFICAR_RPC_PASSWORD=... node tests/verificarRecurso.js
   ```
3. Recorrido manual a 375px: cargar una batería completa con un ausente, cerrarla, matar la app a mitad de camino y confirmar que el borrador vuelve, y confirmar que el import de partidos sigue funcionando igual.
