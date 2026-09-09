# Autorización por plantel — plan de implementación

**Spec:** `docs/superpowers/specs/2026-09-09-autorizacion-por-plantel-design.md`

**Goal:** que la visibilidad y la escritura pasen por una asignación
entrenador → plantel, con lectura y escritura como ejes separados.

**Arquitectura:** una migración (`0016`) que crea el catálogo de categorías, la
tabla de asignación y dos helpers `security definer`, y reescribe las policies de
las diez tablas con datos de jugador. Una función `security definer` aparte
preserva el dedup del import. Un cambio acotado en `src/data/repositorio.js` la
consume sin que la UI se entere.

## Restricciones globales

- **Una sola migración**, `supabase/migrations/0016_autorizacion_por_plantel.sql`.
- **No correr nada contra la base.** Los scripts se entregan, no se ejecutan.
- **No tocar `src/ui/`.** `src/data/repositorio.js` sí, solo el dedup.
- Toda función `security definer` lleva `set search_path = ''`, nombres de tabla
  calificados con `public.`, `revoke execute from public` y
  `grant execute to authenticated`.
- Club del piloto: `20000000-0000-0000-0000-000000000001`. El otro club
  (`00000000-…-001`) se usa como control de aislamiento.
- Los tests de Node existentes tienen que seguir pasando (151).

---

### Tarea 1 — Catálogo de categorías y FK de `plantel`

**Archivo:** crear `supabase/migrations/0016_autorizacion_por_plantel.sql`

- [ ] **Paso 1: catálogo y seed**

```sql
create table categoria (
  codigo text primary key,
  nombre text not null,
  orden integer not null unique
);

comment on table categoria is
  'Catálogo de categorías. Tabla y no enum: un enum obliga a migración para '
  'agregar una categoría, y al replicar a otros clubes cada uno tiene su grilla. '
  'El orden va de 10 en 10 para poder intercalar sin renumerar.';

insert into categoria (codigo, nombre, orden) values
  ('U13M',  'Sub-13 Masculino', 10),
  ('U15M',  'Sub-15 Masculino', 20),
  ('U17M',  'Sub-17 Masculino', 30),
  ('U21M',  'Sub-21 Masculino', 40),
  ('MAY_M', 'Mayores Masculino', 50),
  ('MAY_F', 'Mayores Femenino',  60);

alter table categoria enable row level security;
create policy categoria_lectura on categoria for select to authenticated using (true);
grant select on categoria to authenticated;
```

- [ ] **Paso 2: columna nueva, backfill y guarda**

```sql
alter table plantel add column categoria_codigo text;
update plantel set categoria_codigo = categoria;

-- Aborta antes de apretar nada si algún plantel no mapea al catálogo: un
-- plantel sin categoría es un dato que se perdería en silencio.
do $$
declare huerfanos integer;
begin
  select count(*) into huerfanos
  from plantel p
  where p.categoria_codigo is null
     or not exists (select 1 from categoria c where c.codigo = p.categoria_codigo);
  if huerfanos > 0 then
    raise exception 'Hay % plantel(es) cuya categoria no está en el catálogo. Migración abortada.', huerfanos;
  end if;
end $$;

alter table plantel alter column categoria_codigo set not null;
alter table plantel add constraint plantel_categoria_fk
  foreign key (categoria_codigo) references categoria (codigo);

comment on column plantel.categoria is
  'Columna espejo. La fuente de verdad pasó a ser categoria_codigo (0016). No se '
  'dropea acá porque unique(club_id,temporada_id,categoria) cuelga de ella y la UI '
  'la lee por todos lados; sacarla es una tarea posterior junto al cambio de UI.';
```

- [ ] **Paso 3: verificar sin correr la migración**

Confirmar leyendo el archivo que las cuatro filas conocidas (`U17M` y `U21M` en
los dos clubes) mapean, y que el bloque `do $$` está **antes** del `set not null`.

---

### Tarea 2 — `asignacion_plantel` y CHECK del rol

**Archivo:** seguir en `0016_autorizacion_por_plantel.sql`

- [ ] **Paso 1: el CHECK del rol**

```sql
-- Sin esto, un 'Entrenador' con mayúscula entra igual, no matchea ninguna
-- policy, y el síntoma (no ve nada) aparece lejos de su causa.
alter table miembro_club add constraint miembro_club_rol_valido
  check (rol in ('entrenador','coordinador'));
```

- [ ] **Paso 2: la tabla**

```sql
create table asignacion_plantel (
  id uuid primary key default gen_random_uuid(),
  miembro_club_user_id uuid not null,
  miembro_club_club_id uuid not null,
  plantel_id uuid not null,
  creado_en timestamptz not null default now(),
  unique (miembro_club_user_id, miembro_club_club_id, plantel_id),
  foreign key (miembro_club_user_id, miembro_club_club_id)
    references miembro_club (user_id, club_id) on delete cascade,
  -- Compuesta: obliga a que el club del plantel coincida con el de la membresía.
  foreign key (miembro_club_club_id, plantel_id)
    references plantel (club_id, id) on delete cascade
);

create index asignacion_plantel_usuario_idx
  on asignacion_plantel (miembro_club_user_id, miembro_club_club_id);

alter table asignacion_plantel enable row level security;

-- Solo lectura de lo propio. Sin insert/update/delete para el cliente
-- autenticado, misma decisión que miembro_club y por el mismo motivo: quién
-- entra a qué categoría lo decide una persona, no el frontend.
create policy asignacion_propia on asignacion_plantel
  for select using (miembro_club_user_id = auth.uid());

grant select on asignacion_plantel to authenticated;
```

**Nota:** el prompt pedía `miembro_club_id`, pero `miembro_club` tiene PK
compuesta `(user_id, club_id)` y no existe tal columna. Se usa la PK real.

---

### Tarea 3 — Helpers `puede_ver_plantel` / `puede_escribir_plantel`

- [ ] **Paso 1: las dos funciones**

```sql
-- security definer, no invoker: estas funciones se llaman DESDE las policies de
-- las tablas de dominio y consultan miembro_club y asignacion_plantel. Como
-- invoker quedarían sujetas a las policies de esas tablas y habría recursión.
create function puede_ver_plantel(p_plantel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.plantel pl
    join public.miembro_club m on m.club_id = pl.club_id
    where pl.id = p_plantel_id
      and m.user_id = auth.uid()
      and (
        m.rol = 'coordinador'
        or exists (
          select 1 from public.asignacion_plantel a
          where a.miembro_club_user_id = m.user_id
            and a.miembro_club_club_id = m.club_id
            and a.plantel_id = pl.id
        )
      )
  );
$$;

-- El coordinador NUNCA escribe, ni siquiera en lo que ve: necesita la foto del
-- club para controlar el trabajo, pero qué se entrena, qué recursos se mandan y
-- qué metas se fijan es del cuerpo técnico.
create function puede_escribir_plantel(p_plantel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.plantel pl
    join public.miembro_club m on m.club_id = pl.club_id
    join public.asignacion_plantel a
      on a.miembro_club_user_id = m.user_id
     and a.miembro_club_club_id = m.club_id
     and a.plantel_id = pl.id
    where pl.id = p_plantel_id
      and m.user_id = auth.uid()
      and m.rol = 'entrenador'
  );
$$;

revoke execute on function puede_ver_plantel(uuid) from public;
revoke execute on function puede_escribir_plantel(uuid) from public;
grant execute on function puede_ver_plantel(uuid) to authenticated;
grant execute on function puede_escribir_plantel(uuid) to authenticated;
```

---

### Tarea 4 — Función de dedup

- [ ] **Paso 1: la función**

```sql
/*
 * Con jugador scopeado por pertenencia, el dedup del import dejaría de ver a un
 * chico citado desde otra categoría y crearía un DUPLICADO, rompiendo la
 * trazabilidad de por vida que es la tesis del producto. Esta función es la
 * única excepción, y es una función y no una policy para exponer exactamente el
 * mínimo, de forma auditable.
 *
 * planteles_visibles va FILTRADO: se aprende que el chico existe en el club y si
 * está en un plantel tuyo; NO en qué otras categorías está.
 */
create function jugadores_del_club_para_dedup(p_club_id uuid)
returns table (id uuid, nombre_clave text, nombre_limpio text, planteles_visibles uuid[])
language sql
stable
security definer
set search_path = ''
as $$
  select
    j.id,
    j.nombre_clave,
    j.nombre_limpio,
    coalesce(array_agg(p.plantel_id) filter (where p.plantel_id is not null), '{}')
  from public.jugador j
  left join public.pertenencia p
    on p.jugador_id = j.id
   and p.hasta is null
   and public.puede_ver_plantel(p.plantel_id)
  where j.club_id = p_club_id
    -- Sin este exists la función sería un agujero: security definer saltea RLS.
    and exists (
      select 1 from public.miembro_club m
      where m.club_id = p_club_id and m.user_id = auth.uid()
    )
  group by j.id, j.nombre_clave, j.nombre_limpio;
$$;

revoke execute on function jugadores_del_club_para_dedup(uuid) from public;
grant execute on function jugadores_del_club_para_dedup(uuid) to authenticated;
```

---

### Tarea 5 — Reescribir las policies

- [ ] **Paso 1: dropear las viejas**

```sql
drop policy plantel_miembros on plantel;
drop policy jugador_miembros on jugador;
drop policy pertenencia_miembros on pertenencia;
drop policy partido_miembros on partido;
drop policy estadistica_miembros on estadistica_jugador_partido;
drop policy sesion_medicion_miembros on sesion_medicion;
drop policy medicion_tiro_miembros on medicion_tiro;
drop policy medicion_velocidad_miembros on medicion_velocidad;
drop policy medicion_corporal_miembros on medicion_corporal;
drop policy envio_recurso_miembros on envio_recurso;
drop policy meta_zona_miembros on meta_zona;
```

**No se tocan:** `club_miembros`, `temporada_miembros`, `importacion_miembros`,
`recurso_miembros`, `miembro_club_propio`, y las siete de `0015`.

- [ ] **Paso 2: plantel (solo lectura)**

```sql
create policy plantel_ver on plantel for select using (puede_ver_plantel(id));
```

- [ ] **Paso 3: las cuatro con `plantel_id` directo**

Repetir este bloque, cambiando el nombre de tabla, para `pertenencia`,
`partido`, `sesion_medicion` y `meta_zona`:

```sql
create policy pertenencia_ver on pertenencia
  for select using (puede_ver_plantel(plantel_id));
create policy pertenencia_crear on pertenencia
  for insert with check (puede_escribir_plantel(plantel_id));
create policy pertenencia_editar on pertenencia
  for update using (puede_escribir_plantel(plantel_id))
          with check (puede_escribir_plantel(plantel_id));
create policy pertenencia_borrar on pertenencia
  for delete using (puede_escribir_plantel(plantel_id));
```

- [ ] **Paso 4: las de camino indirecto**

```sql
create policy estadistica_ver on estadistica_jugador_partido for select
  using (exists (select 1 from partido p where p.id = partido_id and puede_ver_plantel(p.plantel_id)));
create policy estadistica_crear on estadistica_jugador_partido for insert
  with check (exists (select 1 from partido p where p.id = partido_id and puede_escribir_plantel(p.plantel_id)));
create policy estadistica_editar on estadistica_jugador_partido for update
  using (exists (select 1 from partido p where p.id = partido_id and puede_escribir_plantel(p.plantel_id)))
  with check (exists (select 1 from partido p where p.id = partido_id and puede_escribir_plantel(p.plantel_id)));
create policy estadistica_borrar on estadistica_jugador_partido for delete
  using (exists (select 1 from partido p where p.id = partido_id and puede_escribir_plantel(p.plantel_id)));
```

Igual forma para `medicion_tiro` y `medicion_velocidad`, con
`exists (select 1 from sesion_medicion s where s.id = sesion_id and puede_*_plantel(s.plantel_id))`.

Y para `medicion_corporal` y `envio_recurso`, con
`exists (select 1 from pertenencia pe where pe.jugador_id = jugador_id and pe.hasta is null and puede_*_plantel(pe.plantel_id))`
— un chico citado en dos planteles queda accesible si **alguno** da acceso.

- [ ] **Paso 5: `jugador`, que tiene forma propia**

```sql
create policy jugador_ver on jugador for select
  using (exists (select 1 from pertenencia pe
                 where pe.jugador_id = jugador.id and pe.hasta is null
                   and puede_ver_plantel(pe.plantel_id)));

-- INSERT sin chequeo de plantel a propósito: en importar_partido el insert de
-- jugador (línea 55) va ANTES del de pertenencia (línea 64), así que en ese
-- momento no hay plantel contra el cual chequear. Lo mismo alta_jugador_manual.
-- Queda expuesto crear filas huérfanas en el propio club; NO colgarlas de un
-- plantel ajeno (lo bloquea la policy de pertenencia) ni releerlas después.
create policy jugador_crear on jugador for insert
  with check (exists (select 1 from miembro_club m
                      where m.club_id = jugador.club_id
                        and m.user_id = auth.uid() and m.rol = 'entrenador'));

create policy jugador_editar on jugador for update
  using (exists (select 1 from pertenencia pe
                 where pe.jugador_id = jugador.id and pe.hasta is null
                   and puede_escribir_plantel(pe.plantel_id)))
  with check (exists (select 1 from pertenencia pe
                 where pe.jugador_id = jugador.id and pe.hasta is null
                   and puede_escribir_plantel(pe.plantel_id)));
```

Sin policy de delete en `jugador`: hoy nada de la app borra jugadores.

- [ ] **Paso 6: commit**

```bash
git add supabase/migrations/0016_autorizacion_por_plantel.sql
git commit -m "feat(db): catálogo de categorías, asignación por plantel y policies separadas"
```

---

### Tarea 6 — `repositorio.js` consume la función

**Archivo:** modificar `src/data/repositorio.js:11-31`

- [ ] **Paso 1: reemplazar el cuerpo, conservando nombre y forma de retorno**

```js
/**
 * El dedup del import y el alta manual necesitan ver a TODO el club para no
 * duplicar a un chico citado desde otra categoría. Con jugador scopeado por
 * pertenencia (0016) eso ya no se puede pedir por tabla, así que pasa por una
 * función security definer que expone sólo cuatro campos y filtra los planteles
 * a los que quien llama puede ver.
 *
 * La forma de retorno NO cambia: sus dos consumidores (confirmacionImport y
 * altaJugador) siguen igual.
 */
export async function obtenerJugadoresDelClub(clubId) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase.rpc('jugadores_del_club_para_dedup', { p_club_id: clubId });
  if (error) throw error;
  return data.map((fila) => ({
    id: fila.id,
    nombreClave: fila.nombre_clave,
    nombreLimpio: fila.nombre_limpio,
    plantelesActuales: fila.planteles_visibles ?? [],
  }));
}
```

- [ ] **Paso 2: verificar que no quedó paginación colgando**

La versión vieja paginaba de a 1000 con `TAMANIO_PAGINA`. Confirmar con
`grep -n "TAMANIO_PAGINA" src/data/repositorio.js` que la constante sigue en uso
en otro lado; si quedó sin usar, borrarla.

- [ ] **Paso 3: tests**

```bash
npm test
```
Esperado: 151/151. `importsResueltos` cubre que el import sigue resolviendo.

- [ ] **Paso 4: commit**

```bash
git add src/data/repositorio.js
git commit -m "refactor(data): el dedup del club pasa por la función security definer"
```

---

### Tarea 7 — Script de verificación

**Archivo:** crear `tests/verificarAutorizacionPlantel.sql`

- [ ] **Paso 1: escribirlo**

Con rol de servicio. Crea dos usuarios de prueba en `auth.users`, los mete en
`miembro_club` del club del piloto (uno `entrenador`, uno `coordinador`), asigna
al entrenador **solo** a U17M, y prueba cada caso con
`set local role authenticated` + `set local request.jwt.claims`.

Los siete casos, cada uno con `raise exception` si falla:

1. Entrenador: `select count(*) from pertenencia` donde plantel = U21M → **0**.
2. Entrenador: `insert into sesion_medicion` en U17M → **pasa**; en U21M → **falla**.
3. Coordinador: ve los dos planteles; insert/update/delete en cualquiera → **falla**.
4. Entrenador: `select * from jugador` no trae jugadores solo de U21M.
5. `jugadores_del_club_para_dedup` llamada por el entrenador trae los
   `nombre_clave` de todo el club, y exactamente cuatro columnas.
6. Un chico con pertenencia a U17M y U21M aparece en el dedup con
   `planteles_visibles` = solo U17M.
7. Ningún usuario ve filas del club `00000000-…-001`.

Termina con `rollback` — el script **no deja nada** en la base — y con un
`raise notice` que imprime los `INSERT` de asignación para el piloto:

```sql
insert into asignacion_plantel (miembro_club_user_id, miembro_club_club_id, plantel_id)
values ('<user_id>', '20000000-0000-0000-0000-000000000001', '<plantel_id>');
```

- [ ] **Paso 2: commit**

---

### Tarea 8 — Script de rollback

**Archivo:** crear `tests/rollbackAutorizacionPlantel.sql`

- [ ] **Paso 1:** dropear en orden inverso — las 30 policies nuevas, las tres
      funciones, `asignacion_plantel`, el CHECK del rol, la FK y
      `plantel.categoria_codigo`, y `categoria`.
- [ ] **Paso 2:** recrear las 11 policies `for all` de `0002`/`0009`/`0012`/`0013`
      copiadas textualmente de esos archivos.
- [ ] **Paso 3:** verificar al final que el conteo de `plantel`, `pertenencia`,
      `partido`, `sesion_medicion` y `jugador` coincide con el de antes, con
      `raise exception` si no.
- [ ] **Paso 4:** commit.

---

### Tarea 9 — `ESQUEMA.md`

**Archivo:** modificar `supabase/ESQUEMA.md`

- [ ] **Paso 1:** agregar `categoria` y `asignacion_plantel` al diagrama y a la
      lista de tablas.
- [ ] **Paso 2:** reescribir la sección de RLS: los dos ejes, la tabla de qué
      puede cada rol, las tres funciones, y por qué `importacion` y la biblioteca
      quedan a nivel club.
- [ ] **Paso 3:** documentar que asignar un entrenador a un plantel es un acto
      manual por SQL, con el `INSERT` de ejemplo.
- [ ] **Paso 4:** anotar que `plantel.categoria` quedó como columna espejo y que
      sacarla es tarea posterior.
- [ ] **Paso 5:** commit.
