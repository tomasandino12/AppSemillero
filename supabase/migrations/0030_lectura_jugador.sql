-- Cuenta de jugador, parte 2: la frontera de lectura.
-- Ver docs/superpowers/specs/2026-09-20-cuenta-jugador-design.md (sección 3).
--
-- La cuenta de jugador NO recibe `select` sobre ninguna tabla de dominio: esta
-- migración no otorga ni una policy ni un grant de tabla. Lee lo suyo por
-- cuatro funciones que corren como dueño, y las cuatro empiezan por el mismo
-- helper, mi_jugador(): auth.uid() -> jugador con cuenta vigente, o null.
--
-- La RLS del cuerpo técnico no se toca en una sola línea. Las funciones
-- nuevas van a la lista declarada de src/data/accesoJugador.js, y
-- tests/contratoAccesoJugador.test.js falla si se otorga algo que no está ahí.
--
-- Son datos de menores: cada función devuelve SÓLO filas de ese jugador (o del
-- plan de su categoría, que es del grupo). Ninguna devuelve un nombre, un
-- promedio ni un peso de otro chico, y ninguna toca las medidas corporales.

do $$
begin
  if to_regclass('public.cuenta_jugador') is null then
    raise exception '0030 necesita 0029 aplicada (no existe cuenta_jugador).';
  end if;
end $$;


/* =====================================================================
   1. El helper
   ===================================================================== */

-- Null si quien llama no tiene cuenta vigente: eso incluye a una cuenta
-- cerrada (hasta no nulo), que deja de ver todo sin borrar nada.
--
-- Interna: no se otorga a nadie. Sólo la llaman las funciones de abajo, que
-- corren como dueño.
create function mi_jugador()
returns uuid
language sql
stable
security definer
set search_path = ''
as $fn$
  select c.jugador_id
  from public.cuenta_jugador c
  where c.user_id = auth.uid() and c.hasta is null;
$fn$;

revoke execute on function mi_jugador() from public, anon, authenticated;


/* =====================================================================
   2. mi_ficha(): lo que arranca la app
   ===================================================================== */

-- Club, nombre propio y planteles con pertenencia vigente. Null si no hay
-- cuenta: es la señal con la que main.js decide entre el shell del jugador y
-- "todavía no tenés club".
create function mi_ficha()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_jugador uuid := public.mi_jugador();
begin
  if v_jugador is null then
    return null;
  end if;

  return (
    select jsonb_build_object(
      'jugadorId', j.id,
      'clubId', j.club_id,
      'clubNombre', c.nombre,
      'nombre', j.nombre_limpio,
      'planteles', coalesce((
        select jsonb_agg(jsonb_build_object(
          'plantelId', pl.id,
          'categoriaCodigo', pl.categoria_codigo,
          'categoria', ca.nombre
        ) order by ca.orden)
        from public.pertenencia pe
        join public.plantel pl on pl.id = pe.plantel_id
        join public.categoria ca on ca.codigo = pl.categoria_codigo
        where pe.jugador_id = j.id and pe.hasta is null
      ), '[]'::jsonb)
    )
    from public.jugador j
    join public.club c on c.id = j.club_id
    where j.id = v_jugador
  );
end;
$fn$;


/* =====================================================================
   3. mis_recursos(): sólo los que le mandaron a él
   ===================================================================== */

-- `recurso` es de lectura para todo el club: acá sale únicamente lo que tiene
-- un envio_recurso a este jugador. Más nuevo primero.
create function mis_recursos()
returns table (recurso_id uuid, titulo text, descripcion text, enlace text, fecha date)
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_jugador uuid := public.mi_jugador();
begin
  if v_jugador is null then
    return;
  end if;

  return query
    select r.id, r.titulo, r.descripcion, r.enlace, e.fecha
    from public.envio_recurso e
    join public.recurso r on r.id = e.recurso_id
    where e.jugador_id = v_jugador
    order by e.fecha desc, r.creado_en desc;
end;
$fn$;


/* =====================================================================
   4. mi_plan(): el plan vigente de cada uno de sus planteles
   ===================================================================== */

-- Por cada plantel con pertenencia vigente, UN plan: el mismo criterio que
-- elegirPlanVisible (src/data/escalones.js) —el que contiene hoy; si no, el que
-- empieza antes; si no, el último que terminó; en un empate, el importado más
-- recientemente—. Con sus sesiones y las líneas de cada una.
--
-- Devuelve además `pesos`: el último peso de este jugador en cada ejercicio, con
-- la clave del ejercicio. La línea y su escalón se unen por clavearNombre del
-- nombre de la línea (escalones.js), que es JavaScript y no se reproduce acá;
-- la unión la hace planDelJugador.js. Sólo pesos propios.
--
-- "Hoy" es la fecha de Argentina, no la de UTC.
create function mi_plan()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_jugador uuid := public.mi_jugador();
  v_hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
begin
  if v_jugador is null then
    return null;
  end if;

  return jsonb_build_object(
    'planes', coalesce((
      with mis_planteles as (
        select pe.plantel_id
        from public.pertenencia pe
        where pe.jugador_id = v_jugador and pe.hasta is null
      ),
      rangos as (
        select p.id, p.plantel_id, p.nombre_archivo, p.creado_en,
               min(s.fecha) as desde, max(s.fecha) as hasta
        from public.plan_fisico p
        join public.sesion_fisico s on s.plan_id = p.id
        where p.plantel_id in (select plantel_id from mis_planteles)
        group by p.id
      ),
      elegidos as (
        select distinct on (r.plantel_id) r.*
        from rangos r
        order by r.plantel_id,
                 case when r.desde > v_hoy then 1 when r.hasta < v_hoy then 2 else 0 end,
                 case when r.desde > v_hoy then r.desde end asc,
                 case when r.hasta < v_hoy then r.hasta end desc,
                 r.creado_en desc
      )
      select jsonb_agg(jsonb_build_object(
        'planId', e.id,
        'plantelId', e.plantel_id,
        'categoria', ca.nombre,
        'nombreArchivo', e.nombre_archivo,
        'sesiones', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'id', s.id,
            'fecha', s.fecha,
            'lineas', (
              select coalesce(jsonb_agg(jsonb_build_object(
                'id', l.id,
                'orden', l.orden,
                'bloque', l.bloque,
                'nombreOriginal', l.nombre_original,
                'series', l.series,
                'reps', l.reps,
                'cargaSugerida', l.carga_sugerida,
                'pausa', l.pausa,
                'notas', l.notas,
                'video', case when ef.link is not null
                              then jsonb_build_object('nombre', ef.nombre, 'link', ef.link) end
              ) order by l.orden nulls last, l.id), '[]'::jsonb)
              from public.ejercicio_asignado l
              left join public.ejercicio_fuerza ef on ef.id = l.ejercicio_fuerza_id
              where l.sesion_id = s.id
            )
          ) order by s.fecha), '[]'::jsonb)
          from public.sesion_fisico s
          where s.plan_id = e.id
        )
      ) order by ca.orden)
      from elegidos e
      join public.plantel pl on pl.id = e.plantel_id
      join public.categoria ca on ca.codigo = pl.categoria_codigo
    ), '[]'::jsonb),
    'pesos', coalesce((
      select jsonb_agg(jsonb_build_object('clave', pf.clave, 'nombre', pf.nombre, 'kg', u.kg))
      from (
        select distinct on (m.escalera_id) m.escalera_id, m.kg
        from public.movimiento_escalon m
        where m.jugador_id = v_jugador
        order by m.escalera_id, m.orden desc
      ) u
      join public.paso_fuerza pf on pf.id = u.escalera_id
    ), '[]'::jsonb)
  );
end;
$fn$;


/* =====================================================================
   5. mi_progreso(): sólo él, contra sí mismo
   ===================================================================== */

-- Partidos, tiro, velocidad y la historia de pesos, todo de este jugador. No
-- hay ranking ni promedio del plantel, y por eso ninguna consulta de acá suma
-- filas de otros. Las medidas corporales (peso, altura) quedan afuera a
-- propósito (spec, sección 1).
--
-- Los porcentajes no se calculan acá: los calcula estadisticas.js, que es el
-- único lugar donde viven el umbral de muestra chica y el redondeo.
create function mi_progreso()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_jugador uuid := public.mi_jugador();
begin
  if v_jugador is null then
    return null;
  end if;

  return jsonb_build_object(
    'partidos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'partidoId', pa.id,
        'fecha', pa.fecha,
        'rivalNombre', pa.rival_nombre,
        'condicion', pa.condicion_propia,
        'puntosPropios', pa.puntos_propios,
        'puntosRival', pa.puntos_rival,
        'minSegundos', e.min_segundos,
        'pts', e.pts,
        'dosAnotados', e.dos_anotados, 'dosIntentados', e.dos_intentados,
        'tresAnotados', e.tres_anotados, 'tresIntentados', e.tres_intentados,
        'libresAnotados', e.libres_anotados, 'libresIntentados', e.libres_intentados,
        'rebTot', e.reb_tot, 'ast', e.ast, 'val', e.val
      ) order by pa.fecha desc)
      from public.estadistica_jugador_partido e
      join public.partido pa on pa.id = e.partido_id
      where e.jugador_id = v_jugador
    ), '[]'::jsonb),
    'tiro', coalesce((
      select jsonb_agg(jsonb_build_object(
        'sesionId', s.id, 'fecha', s.fecha, 'posicion', mt.posicion,
        'anotados', mt.anotados, 'intentos', mt.intentos
      ) order by s.fecha, mt.posicion)
      from public.medicion_tiro mt
      join public.sesion_medicion s on s.id = mt.sesion_id
      where mt.jugador_id = v_jugador and s.tipo = 'tiro'
    ), '[]'::jsonb),
    'velocidad', coalesce((
      select jsonb_agg(jsonb_build_object(
        'sesionId', s.id, 'fecha', s.fecha, 'segundos', mv.segundos
      ) order by s.fecha)
      from public.medicion_velocidad mv
      join public.sesion_medicion s on s.id = mv.sesion_id
      where mv.jugador_id = v_jugador and s.tipo = 'velocidad'
    ), '[]'::jsonb),
    'escalones', coalesce((
      select jsonb_agg(jsonb_build_object(
        'clave', pf.clave, 'nombre', pf.nombre, 'kg', m.kg, 'creadoEn', m.creado_en
      ) order by m.orden)
      from public.movimiento_escalon m
      join public.paso_fuerza pf on pf.id = m.escalera_id
      where m.jugador_id = v_jugador
    ), '[]'::jsonb)
  );
end;
$fn$;


/* =====================================================================
   6. Permisos de ejecución
   ===================================================================== */

-- Postgres le da EXECUTE a PUBLIC por defecto y Supabase a anon aparte. Quien
-- no tiene cuenta vigente recibe null / cero filas: no hace falta más.
revoke execute on function mi_ficha()      from public, anon;
revoke execute on function mis_recursos()  from public, anon;
revoke execute on function mi_plan()       from public, anon;
revoke execute on function mi_progreso()   from public, anon;

grant execute on function mi_ficha()       to authenticated;
grant execute on function mis_recursos()   to authenticated;
grant execute on function mi_plan()        to authenticated;
grant execute on function mi_progreso()    to authenticated;
