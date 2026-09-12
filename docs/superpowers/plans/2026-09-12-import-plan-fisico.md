# Importación del plan físico — plan de implementación

**Spec:** `docs/superpowers/specs/2026-09-12-import-plan-fisico-design.md`

**Goal:** que el profe suba el `.xlsx` de fuerza, resuelva los nombres que no
matchearon y quede guardado para un plantel, de punta a punta o nada.

**Arquitectura:** dos migraciones (`0017` tablas y RLS, `0018` la RPC
transaccional), una función pura en `src/data/` que arma el payload, dos
funciones en `repositorio.js` y una pantalla nueva con el punto de entrada en
DATOS.

## Restricciones globales

- **No tocar `src/parser/parserFisico.js`.** Está cerrado y probado (a531a04).
- **Nada contra producción.** Todo se prueba en el Docker local; `npx supabase
  db push` lo corre Tomás.
- **`escalon_kg` no se escribe nunca**, ni aunque venga en el payload.
- **Reps, carga y pausa son texto.** Ninguna conversión a número, en ningún lado.
- **Sin matcheo por similitud.** La única coincidencia automática es exacta
  sobre el nombre normalizado.
- Breakpoints sólo en `layout.css`; `hover` sólo dentro de `@media (hover:hover)`.
- Club del piloto: `20000000-0000-0000-0000-000000000001`.
- Los 151 tests actuales siguen en verde, más los nuevos.

---

### Tarea 1 — Migración `0017`: tablas, RLS y rollback

**Archivos:** crear `supabase/migrations/0017_plan_fisico.sql` y
`tests/rollbackPlanFisico.sql`.

- [ ] **Paso 1: las cuatro tablas**

```sql
-- Etapa 6: plan físico (fuerza). Persiste el .xlsx que arma el profe de físico.
-- Ver docs/superpowers/specs/2026-09-12-import-plan-fisico-design.md.

-- Biblioteca de ejercicios de fuerza.
--
-- Tabla nueva y NO la `ejercicio` de 0015: esa es la biblioteca de básquet
-- (tema, material, jugadores, notas, autoría), su eje es `tema` y no `bloque`,
-- y su RLS deja editar sólo a quien creó la fila — que no sirve para un
-- catálogo que nace de importar un archivo.
create table ejercicio_fuerza (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references club(id),
  -- Nombre normalizado (clavearNombre: mayúsculas, sin acentos, espacios
  -- colapsados). Es lo que hace que el import del mes siguiente reconcilie
  -- solo contra lo que ya está cargado.
  clave text not null,
  nombre text not null,
  -- Sin check: la lista de bloques la manda el archivo del club, igual que
  -- `tema` en 0015. Un check obliga a una migración por cada bloque nuevo.
  bloque text,
  link text,
  creado_por uuid not null default auth.uid() references auth.users(id),
  creado_en timestamptz not null default now(),
  unique (club_id, clave),
  -- Target de la FK compuesta de ejercicio_asignado.
  unique (club_id, id)
);

-- Un archivo importado, para un plantel.
create table plan_fisico (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references club(id),
  plantel_id uuid not null,
  nombre_archivo text not null,
  -- SHA-256 de los bytes, igual que importacion (0001) y por el mismo motivo:
  -- sobrevive el renombrado (un archivo reenviado por WhatsApp).
  hash_archivo text not null,
  advertencias jsonb not null default '[]'::jsonb,
  creado_por uuid not null default auth.uid() references auth.users(id),
  creado_en timestamptz not null default now(),
  -- Por PLANTEL y no por club: si dos categorías hacen la misma rutina, el
  -- profe sube el mismo archivo para las dos. Lo que hay que impedir es
  -- duplicar las sesiones de UNA categoría.
  unique (plantel_id, hash_archivo),
  unique (club_id, id),
  foreign key (club_id, plantel_id) references plantel (club_id, id)
);

-- Un día de entrenamiento. Sin dia_semana: se deriva de la fecha.
create table sesion_fisico (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references club(id),
  plan_id uuid not null,
  fecha date not null,
  unique (club_id, id),
  foreign key (club_id, plan_id) references plan_fisico (club_id, id) on delete cascade
);

-- Una línea de la rutina.
create table ejercicio_asignado (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references club(id),
  sesion_id uuid not null,
  -- NULL = pendiente de resolver, y es un estado válido. La FK compuesta es
  -- MATCH SIMPLE (el default): con la columna en NULL no chequea nada; con
  -- valor, obliga a que el club coincida.
  ejercicio_fuerza_id uuid,
  orden integer,
  bloque text,
  -- El texto exacto del archivo, como nombre_crudo en estadistica_*: permite
  -- auditar contra el original y es lo único que queda si nunca se resuelve.
  nombre_original text not null,
  series integer,
  -- text y no números: el archivo dice 5xL, 45'', Fallo-2, PC, Barra + Disc.
  -- Convertirlos sería fabricar una precisión que el dato no tiene.
  reps text,
  carga_sugerida text,
  pausa text,
  notas text,
  -- Siempre NULL en esta etapa: la RPC no la escribe. Además guarda UN valor
  -- por línea, o sea para todo el grupo; el escalón por jugador, cuando se
  -- destrabe, va a ser otra tabla.
  escalon_kg numeric,
  foreign key (club_id, sesion_id) references sesion_fisico (club_id, id) on delete cascade,
  foreign key (club_id, ejercicio_fuerza_id) references ejercicio_fuerza (club_id, id)
);

create index ejercicio_fuerza_club_id_idx on ejercicio_fuerza(club_id);
create index plan_fisico_club_id_idx on plan_fisico(club_id);
create index plan_fisico_plantel_id_idx on plan_fisico(plantel_id);
create index sesion_fisico_plan_id_idx on sesion_fisico(plan_id);
create index ejercicio_asignado_sesion_id_idx on ejercicio_asignado(sesion_id);
create index ejercicio_asignado_ejercicio_fuerza_id_idx on ejercicio_asignado(ejercicio_fuerza_id);
```

- [ ] **Paso 2: RLS, en el mismo archivo**

```sql
alter table ejercicio_fuerza enable row level security;
alter table plan_fisico enable row level security;
alter table sesion_fisico enable row level security;
alter table ejercicio_asignado enable row level security;

-- La biblioteca es del club, no de un plantel: el beneficio de cargarla es que
-- quede para todos (mismo criterio que `ejercicio` en 0015). Crear es sólo del
-- entrenador — el coordinador nunca escribe (0016).
create policy ejercicio_fuerza_leer on ejercicio_fuerza
  for select using (exists (
    select 1 from miembro_club m
    where m.club_id = ejercicio_fuerza.club_id and m.user_id = auth.uid()));
create policy ejercicio_fuerza_crear on ejercicio_fuerza
  for insert with check (exists (
    select 1 from miembro_club m
    where m.club_id = ejercicio_fuerza.club_id and m.user_id = auth.uid()
      and m.rol = 'entrenador'));

create policy plan_fisico_ver on plan_fisico
  for select using (puede_ver_plantel(plan_fisico.plantel_id));
create policy plan_fisico_crear on plan_fisico
  for insert with check (puede_escribir_plantel(plan_fisico.plantel_id));
create policy plan_fisico_borrar on plan_fisico
  for delete using (puede_escribir_plantel(plan_fisico.plantel_id));

create policy sesion_fisico_ver on sesion_fisico
  for select using (exists (
    select 1 from plan_fisico p
    where p.id = sesion_fisico.plan_id and puede_ver_plantel(p.plantel_id)));
create policy sesion_fisico_crear on sesion_fisico
  for insert with check (exists (
    select 1 from plan_fisico p
    where p.id = sesion_fisico.plan_id and puede_escribir_plantel(p.plantel_id)));
create policy sesion_fisico_borrar on sesion_fisico
  for delete using (exists (
    select 1 from plan_fisico p
    where p.id = sesion_fisico.plan_id and puede_escribir_plantel(p.plantel_id)));

-- update va aunque esta etapa no actualice nada: es lo que va a necesitar la
-- pantalla que resuelva los pendientes (spec, sección 8).
create policy ejercicio_asignado_ver on ejercicio_asignado
  for select using (exists (
    select 1 from sesion_fisico s join plan_fisico p on p.id = s.plan_id
    where s.id = ejercicio_asignado.sesion_id and puede_ver_plantel(p.plantel_id)));
create policy ejercicio_asignado_crear on ejercicio_asignado
  for insert with check (exists (
    select 1 from sesion_fisico s join plan_fisico p on p.id = s.plan_id
    where s.id = ejercicio_asignado.sesion_id and puede_escribir_plantel(p.plantel_id)));
create policy ejercicio_asignado_editar on ejercicio_asignado
  for update using (exists (
    select 1 from sesion_fisico s join plan_fisico p on p.id = s.plan_id
    where s.id = ejercicio_asignado.sesion_id and puede_escribir_plantel(p.plantel_id)))
  with check (exists (
    select 1 from sesion_fisico s join plan_fisico p on p.id = s.plan_id
    where s.id = ejercicio_asignado.sesion_id and puede_escribir_plantel(p.plantel_id)));
create policy ejercicio_asignado_borrar on ejercicio_asignado
  for delete using (exists (
    select 1 from sesion_fisico s join plan_fisico p on p.id = s.plan_id
    where s.id = ejercicio_asignado.sesion_id and puede_escribir_plantel(p.plantel_id)));

-- Postgres exige el GRANT además de la policy (ver 0006). Se otorga sólo lo
-- que alguna policy habilita.
grant select, insert on ejercicio_fuerza to authenticated;
grant select, insert, delete on plan_fisico, sesion_fisico to authenticated;
grant select, insert, update, delete on ejercicio_asignado to authenticated;
```

- [ ] **Paso 3: `tests/rollbackPlanFisico.sql`**

```sql
-- Deshace 0017 y 0018 para poder reintentar en local. NUNCA contra producción.
drop function if exists importar_plan_fisico(jsonb);
drop table if exists ejercicio_asignado;
drop table if exists sesion_fisico;
drop table if exists plan_fisico;
drop table if exists ejercicio_fuerza;
```

- [ ] **Paso 4: aplicarla en el Docker local y verificar**

`npx supabase db reset` (aplica las 17 en orden) y comprobar con
`\d ejercicio_asignado` que las FK compuestas están, y que
`insert into ejercicio_asignado ... ejercicio_fuerza_id = null` entra.

- [ ] **Paso 5: commit** — `feat(db): tablas del plan físico`

---

### Tarea 2 — Migración `0018`: la RPC transaccional

**Archivo:** crear `supabase/migrations/0018_rpc_importar_plan_fisico.sql`.

- [ ] **Paso 1: la función**

```sql
-- Etapa 6: un import de plan físico, entero o nada.
--
-- Mismo molde que importar_partido (0005): una llamada RPC vía PostgREST es
-- una única transacción, cualquier excepción aborta todo. security invoker,
-- sujeta a las mismas policies que un insert directo — sin elevación.
create or replace function importar_plan_fisico(payload jsonb)
returns jsonb
language plpgsql
security invoker
as $$
declare
  v_club_id uuid;
  v_plan_id uuid;
  v_sesion_id uuid;
  v_ejercicio_id uuid;
  v_sesiones int := 0;
  v_ejercicios int := 0;
  v_pendientes int := 0;
  e jsonb;
  s jsonb;
  a jsonb;
begin
  v_club_id := (payload->>'clubId')::uuid;

  if coalesce(jsonb_array_length(payload->'sesiones'), 0) = 0 then
    raise exception 'PLAN_VACIO' using errcode = 'P0001';
  end if;

  -- Primero la biblioteca: los ejercicios de las sesiones la referencian.
  create temporary table ejercicios_nuevos_resueltos (
    clave text primary key,
    ejercicio_id uuid not null
  ) on commit drop;

  for e in select * from jsonb_array_elements(coalesce(payload->'ejerciciosNuevos', '[]'::jsonb))
  loop
    begin
      insert into ejercicio_fuerza (club_id, clave, nombre, bloque, link)
      values (v_club_id, e->>'clave', e->>'nombre', e->>'bloque', e->>'link')
      returning id into v_ejercicio_id;
    exception when unique_violation then
      raise exception 'EJERCICIO_DUPLICADO: %', e->>'nombre' using errcode = 'P0001';
    end;
    insert into ejercicios_nuevos_resueltos values (e->>'clave', v_ejercicio_id);
  end loop;

  begin
    insert into plan_fisico (club_id, plantel_id, nombre_archivo, hash_archivo, advertencias)
    values (
      v_club_id,
      (payload->>'plantelId')::uuid,
      payload->>'nombreArchivo',
      payload->>'hashArchivo',
      coalesce(payload->'advertencias', '[]'::jsonb)
    )
    returning id into v_plan_id;
  exception when unique_violation then
    raise exception 'PLAN_DUPLICADO' using errcode = 'P0001';
  end;

  for s in select * from jsonb_array_elements(payload->'sesiones')
  loop
    insert into sesion_fisico (club_id, plan_id, fecha)
    values (v_club_id, v_plan_id, (s->>'fecha')::date)
    returning id into v_sesion_id;
    v_sesiones := v_sesiones + 1;

    for a in select * from jsonb_array_elements(coalesce(s->'ejercicios', '[]'::jsonb))
    loop
      -- escalon_kg NO está en esta lista a propósito: queda NULL aunque el
      -- payload la traiga. El manejo de peso es por jugador y todavía no existe.
      insert into ejercicio_asignado (
        club_id, sesion_id, ejercicio_fuerza_id, orden, bloque,
        nombre_original, series, reps, carga_sugerida, pausa, notas
      )
      values (
        v_club_id,
        v_sesion_id,
        coalesce(
          (a->>'ejercicioFuerzaId')::uuid,
          (select ejercicio_id from ejercicios_nuevos_resueltos where clave = a->>'claveNueva')
        ),
        (a->>'orden')::int,
        a->>'bloque',
        a->>'nombreOriginal',
        (a->>'series')::int,
        a->>'reps',
        a->>'cargaSugerida',
        a->>'pausa',
        a->>'notas'
      );
      v_ejercicios := v_ejercicios + 1;
      if a->>'ejercicioFuerzaId' is null and a->>'claveNueva' is null then
        v_pendientes := v_pendientes + 1;
      end if;
    end loop;
  end loop;

  return jsonb_build_object(
    'planId', v_plan_id,
    'sesiones', v_sesiones,
    'ejercicios', v_ejercicios,
    'pendientes', v_pendientes
  );
end;
$$;
```

- [ ] **Paso 2: `tests/verificarImportarPlanFisico.js`**

Mismo molde que `tests/verificarRpc.js`: toma `SUPABASE_URL`,
`SUPABASE_PUBLISHABLE_KEY`, `VERIFICAR_RPC_EMAIL` y `VERIFICAR_RPC_PASSWORD`,
inicia sesión, y corre tres casos contra el Docker local:

1. **Payload roto:** un `ejercicioFuerzaId` inexistente rompe la FK. Verifica
   que la RPC devolvió error **y** que `plan_fisico` no tiene ninguna fila con
   ese hash — si quedó, el rollback no está funcionando.
2. **Import válido:** devuelve `{ sesiones, ejercicios, pendientes }` y las
   filas están en la base.
3. **Reimportación:** el mismo payload otra vez devuelve `PLAN_DUPLICADO`, y
   `select count(*) from plan_fisico where hash_archivo = ...` sigue en 1.

- [ ] **Paso 3: correrlo contra el Docker local, y commitear** — `feat(db): RPC
  transaccional de import de plan físico`

---

### Tarea 3 — `prepararPayloadPlanFisico` (TDD)

**Archivos:** crear `tests/prepararPayloadPlanFisico.test.js` y
`src/data/prepararPayloadPlanFisico.js`.

- [ ] **Paso 1: los tests primero.** Casos:

| Test | Qué prueba |
|---|---|
| biblioteca del archivo ya cargada | Las 39 entradas que ya están en la base no se duplican: `ejerciciosNuevos` queda vacío y los ejercicios apuntan a los ids existentes. |
| biblioteca del archivo nueva | Las que no están van a `ejerciciosNuevos` una sola vez, aunque aparezcan en varias sesiones. |
| decisión `existente` | Las 6 apariciones de "Press Plano" quedan con el mismo `ejercicioFuerzaId`. |
| decisión `nueva` | Suma una entrada a `ejerciciosNuevos` con su clave normalizada, y los ejercicios la referencian por `claveNueva`. |
| sin decisión | Queda pendiente: `ejercicioFuerzaId` y `claveNueva` en null, y `nombreOriginal` intacto. |
| alta nueva que ya existe | Devuelve error y no arma payload: hay que elegir la existente. |
| decisión a un id inexistente | Devuelve error. |
| parser con errores | Devuelve error, sin payload. |
| sesión sin fecha | Devuelve error nombrando cuántas son (el archivo tiene que decir el año). |
| sin sesiones | Devuelve error: un import vacío es un bug. |
| reps/carga/pausa | Pasan como texto, sin tocar. |
| nunca lanza | Con entradas basura devuelve `error`, no excepción. |

- [ ] **Paso 2: la implementación**

```js
import { clavearNombre } from '../parser/parserCabb.js';

/**
 * Puro: sin red, sin cliente de base, sin generar ids. Toma lo que devolvió
 * parsearPlanFisico, la biblioteca de fuerza del club y las decisiones del
 * profe, y arma el payload exacto que espera importar_plan_fisico
 * (0018_rpc_importar_plan_fisico.sql).
 *
 * Dos pasos, en este orden:
 * 1. La biblioteca del ARCHIVO (la hoja "Ejercicios") se reconcilia contra la
 *    del club por nombre normalizado. Lo que ya está se reusa; lo que no, se
 *    crea. Sin esto, el profe tendría que dar de alta a mano ejercicios que el
 *    archivo ya traía con nombre y link.
 * 2. Los que el parser no pudo referenciar se resuelven con las decisiones,
 *    que son por nombre normalizado y no por ocurrencia: resolver "Press
 *    Plano" una vez resuelve sus 6 apariciones.
 *
 * `decisiones.porClave[nombreClave]` es
 *   { tipo: 'existente', ejercicioId } | { tipo: 'nueva', nombre, bloque, link }
 * y su ausencia significa pendiente, que es un estado válido.
 */
export function prepararPayloadPlanFisico(resultadoParser, bibliotecaDelClub, decisiones, contexto) {
  // ... validaciones, reconciliación, armado (ver tests)
}
```

Devuelve `{ error, payload, resumen }`, donde `resumen` es
`{ sesiones, ejercicios, pendientes, ejerciciosNuevos }` para que la pantalla no
tenga que recontar.

- [ ] **Paso 3:** `node --test tests/prepararPayloadPlanFisico.test.js` en verde.
- [ ] **Paso 4: commit** — `feat(data): payload del import de plan físico`

---

### Tarea 4 — `repositorio.js`

**Archivo:** modificar `src/data/repositorio.js` (sólo agregar, al final).

- [ ] **Paso 1: las dos funciones**

```js
/* ---------- Etapa 6: plan físico ---------- */

/**
 * La biblioteca de fuerza del club, para el buscador de la pantalla de
 * resolución y para reconciliar la del archivo. Es de club, no de plantel
 * (ver ESQUEMA.md).
 */
export async function obtenerEjerciciosFuerza(clubId) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('ejercicio_fuerza')
    .select('id, clave, nombre, bloque, link')
    .eq('club_id', clubId)
    .order('nombre');
  if (error) throw error;
  return data.map((f) => ({ id: f.id, clave: f.clave, nombre: f.nombre, bloque: f.bloque, link: f.link }));
}

/**
 * Única llamada transaccional del import de plan físico: o entran el plan, sus
 * sesiones y sus ejercicios, o no entra nada (0018).
 */
export async function importarPlanFisico(payload) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase.rpc('importar_plan_fisico', { payload });
  if (error) throw error;
  return data;
}
```

- [ ] **Paso 2:** `node --test tests/importsResueltos.test.js` en verde.

---

### Tarea 5 — La pantalla

**Archivos:** crear `src/ui/pantallas/planFisico.js`; modificar
`public/index.html`, `src/ui/pantallas/registro.js` y
`src/ui/pantallas/datos.js`.

- [ ] **Paso 1: el hueco en `index.html`**, al lado de las pantallas del import
  de partido:

```html
<section class="pant" id="p-plan-fisico"><div class="pad" id="plan-fisico-contenido"></div></section>
```

y su input, al lado de `#input-archivo`:

```html
<input type="file" id="input-plan-fisico" accept=".xlsx" class="sr" tabindex="-1" aria-hidden="true">
```

Input propio y no el mismo: `#input-archivo` ya tiene un listener que manda
derecho a la confirmación de partido, y multiplexarlo obligaría a llevar estado
para saber qué flujo lo abrió.

- [ ] **Paso 2: `planFisico.js`.** Un objeto `estado` y pasos que se renderizan
  en `#plan-fisico-contenido`, igual que `confirmacionImport.js`:

```js
let estado = null;   // { archivo, resultadoParser, hashArchivo, planteles,
                     //   plantelId, biblioteca, decisiones, guardando }

export async function iniciarPlanFisico(archivo) { /* leer, parsear, hash, biblioteca */ }
function renderPlantelYPreview() { /* categoría + resumen + advertencias */ }
function renderResolucion() { /* grupo con una fila por nombre sin resolver */ }
async function guardar() { /* prepararPayloadPlanFisico + importarPlanFisico */ }
function renderResultado(r) { /* N sesiones, M ejercicios, K pendientes */ }
```

Reglas de la pantalla:

- La categoría arranca en la del chip (`obtenerPlantelActivo()`) y se muestra
  con todas las letras, con opción de cambiarla antes de guardar.
- Las advertencias del parser se muestran tal cual las devuelve, sin reescribir.
- Cada fila sin resolver ofrece buscar en la biblioteca (hoja con `input` de
  búsqueda, filtrado en memoria sobre `obtenerEjerciciosFuerza`), crear nueva
  (bloque + nombre + link) o dejar pendiente, que es el default.
- Errores: `PLAN_DUPLICADO` → "Este plan ya está cargado en esa categoría";
  `EJERCICIO_DUPLICADO` → nombra el ejercicio; error de red → el mensaje de
  `esErrorDeRed`, con el estado intacto para reintentar sin volver a cargar el
  archivo.
- Nada nuevo en CSS salvo que falte algo; los breakpoints, en `layout.css`.

- [ ] **Paso 3: registro y entrada.** En `registro.js`:
  `registrarPantalla('p-plan-fisico', { titulo: 'Plan físico' })`. En `datos.js`,
  un botón "Cargar plan físico" junto a "Cargar partido", el listener del input
  nuevo, y el retorno a DATOS.

- [ ] **Paso 4: commit** — `feat(ui): pantalla de import de plan físico`

---

### Tarea 6 — Verificación de punta a punta

- [ ] Importar el `Físico.xlsx` real contra el Docker local y contar en la base:
  17 sesiones, 135 ejercicios, 39 entradas de biblioteca, 57 pendientes si no se
  resuelve ninguno.
- [ ] Reimportar el mismo archivo en la misma categoría: falla con mensaje claro
  y no duplica. Importarlo en **otra** categoría: entra.
- [ ] Correr `tests/verificarImportarPlanFisico.js` y que pase limpio.
- [ ] Capturas de la pantalla a 375px (los tres pasos) y mirarlas de verdad.
- [ ] `npm test` completo en verde.

---

### Tarea 7 — Documentación y cierre

- [ ] `supabase/ESQUEMA.md`: las cuatro tablas nuevas, el camino de cada una al
  plantel en la tabla de RLS, y el orden de persistencia del import.
- [ ] `package.json`: sumar al script de test `tests/parserFisico.test.js` y
  `tests/prepararPayloadPlanFisico.test.js`.
- [ ] Commit final y **no pushear**: el push lo hace Tomás.
