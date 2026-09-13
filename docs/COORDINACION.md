# Coordinación: roles, asignaciones y despliegue

## Qué puede cada uno

| | Entrenador | Coordinador | Los dos roles |
|---|---|---|---|
| Jugadores, plantel, fichas, mediciones, partidos | sólo sus categorías asignadas | nada | sus categorías asignadas |
| Biblioteca de ejercicios y notas | todo el club | (no se muestra en su pantalla) | todo el club |
| Panorama agregado y Profes | no | sí | sí, con el botón **Coordinar** |
| Habilitar, asignar, quitar | nunca | a otros, en su club | a otros, en su club |

Todo esto lo hace cumplir la base (RLS), no la interfaz. Detalle en
`supabase/ESQUEMA.md`.

Lo que **no** se hace desde la app, a propósito:
- Crear un coordinador.
- Darle el rol de entrenador a alguien que ya es coordinador (ni a uno mismo).
- Sacar a alguien del club entero.

## Estado de producción al 2026-09-13

Diagnóstico corrido antes de escribir 0017:

| Cuenta | Rol | Categorías |
|---|---|---|
| Nacho | entrenador | U13M |
| Tomás | coordinador | — |
| Cuenta de prueba | entrenador | U17M, U21M |

Ningún entrenador sin asignaciones: el backfill de 0017 no hace nada. Tomás es
coordinador puro a propósito; lo de entrenador se prueba con la cuenta de prueba.

## Desplegar

**En este orden.** Ningún paso se saltea.

### 1. Diagnóstico (sólo lectura)

Si pasó tiempo desde la tabla de arriba, repetirlo en el SQL Editor:

```sql
select u.email, m.club_id, m.rol,
       count(a.*) as asignaciones,
       string_agg(p.categoria, ', ' order by p.categoria) as categorias
from miembro_club m
join auth.users u on u.id = m.user_id
left join asignacion_plantel a
       on a.miembro_club_user_id = m.user_id and a.miembro_club_club_id = m.club_id
left join plantel p on p.id = a.plantel_id
group by u.email, m.club_id, m.rol
order by m.club_id, u.email;
```

(Después de 0017 la columna `rol` ya no existe: la consulta equivalente usa
`m.es_entrenador, m.es_coordinador`.)

### 2. Aplicar 0017 y 0019

`npx supabase db push` aplica lo que falte, cada migración en su transacción.
Conviene hacerlo cuando nadie esté usando la app.

0019 (nombre en los metadatos de Auth y las cuatro categorías que faltaban)
depende sólo de 0017, y **tiene que estar antes del deploy del frontend**: sin
ella la biblioteca no muestra autores y a las cuentas viejas sin nombre (Nacho)
se les pediría el nombre antes de entrar, en vez de dejarlas pasar.

Si `db push` quiere aplicar también 0018 en el mismo paso, aplicar 0017 y 0019
a mano desde el SQL Editor y dejar 0018 para el paso 7.

Correr `tests/verificarCoordinacion.sql` en el SQL Editor: todo `OK`, salvo los
casos 10 y 11 en `PENDIENTE`.

### 3. Primer coordinador

Ya existe (Tomás, `rol = 'coordinador'`): 0017 lo convierte solo en
`es_coordinador = true`. Para cualquier coordinador futuro, a mano:

```sql
insert into miembro_club (user_id, club_id, es_coordinador)
values ('<uuid de Authentication → Users>', '<uuid de la tabla club>', true)
on conflict (user_id, club_id) do update set es_coordinador = true;
```

### 4. Deploy del frontend

### 5. Revisar asignaciones de la migración

Entrar como coordinador → **Profes**. Las marcadas *"asignada al activar el
panel"* las creó la migración para que nadie perdiera acceso: quitar las que
no correspondan. (Al 2026-09-13 no debería haber ninguna.)

### 6. Si un coordinador también entrena

Antes del paso 7, o se queda sin sus datos. Hoy no aplica a nadie.

```sql
update miembro_club set es_entrenador = true
where user_id = '<uuid>' and club_id = '<uuid del club>';

insert into asignacion_plantel (miembro_club_user_id, miembro_club_club_id, plantel_id, origen)
select '<uuid>', club_id, id, 'manual' from plantel
where club_id = '<uuid del club>' and categoria in ('U13M');   -- sus categorías
```

### 7. Aplicar 0018

Aborta sola si hay un club con miembros y sin coordinador. Correr de nuevo
`tests/verificarCoordinacion.sql`: todo `OK`, nada `PENDIENTE`.

Y con credenciales reales (sólo lee, no escribe nada):

```bash
SUPABASE_URL=... SUPABASE_PUBLISHABLE_KEY=... \
VERIFICAR_EMAIL=<cuenta de prueba> VERIFICAR_PASSWORD=... \
VERIFICAR_COORD_EMAIL=<coordinador> VERIFICAR_COORD_PASSWORD=... \
node tests/verificarAccesoPorCategoria.js
```

## Volver atrás

- `tests/rollback0018.sql` — el coordinador vuelve a leer datos individuales.
- `tests/rollback0017.sql` — vuelve a la forma de 0016. Aborta si hay alguien
  con los dos roles o asignaciones cerradas, y dice cuáles.

## Consultar la historia

Quién estuvo a cargo de cada categoría, incluidas las cerradas:

```sql
select p.categoria, t.nombre as temporada, u.email,
       a.desde, a.hasta, a.origen,
       ua.email as asignado_por, uc.email as cerrado_por
from asignacion_plantel a
join plantel p     on p.id = a.plantel_id
join temporada t   on t.id = p.temporada_id
join auth.users u  on u.id = a.miembro_club_user_id
left join auth.users ua on ua.id = a.asignado_por
left join auth.users uc on uc.id = a.cerrado_por
order by t.nombre desc, p.categoria, a.desde;
```

## Límite conocido: un solo club

La lista de **Esperando acceso** muestra todas las cuentas confirmadas sin club
de toda la plataforma: una cuenta recién creada no pertenece a ningún club y no
hay forma de saber a cuál va. Con Newell's solo, es exacta. Con un segundo
club, un coordinador vería los mails de quien se registró para el otro. Se
decidió probar primero con usuarios reales y pensarlo recién si hace falta más
de un club.
