# ESQUEMA.md — Modelo de datos (Etapa 2A)

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
  └──< importacion ──(1:1)── partido
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

### `jugador`
**Decisión central del esquema:** único por `club_id` + `nombre_clave` + `desambiguador`, **nunca** por plantel/categoría.

Razón: si la unicidad fuera por plantel, un chico citado de U17 a U21 generaría dos perfiles de jugador distintos, y se rompería la trazabilidad de por vida que es la razón de existir de la app (el problema de negocio es la pérdida de memoria institucional cuando cambia el cuerpo técnico). `desambiguador` (default `''`) existe únicamente para el caso real de homónimos dentro del mismo club — lo resuelve el entrenador a mano, no el sistema.

El número de camiseta **no** vive acá — está verificado (Etapa 1) que cambia entre partidos para el mismo jugador, así que no es un dato de identidad.

### `pertenencia`
La membresía de un jugador a un plantel en una temporada, con rango `desde`/`hasta` (`hasta` NULL = vigente). Un jugador puede tener más de una pertenencia vigente a la vez (citado a dos categorías) — es el caso normal en inferiores, no una excepción.

### `miembro_club`
`(user_id, club_id, rol)`, PK compuesta. Resuelve permisos: sólo el entrenador se autentica (Supabase Auth, email+contraseña); los jugadores no tienen cuenta en v1.

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

## Políticas RLS

Ver `migrations/0002_rls.sql`. Un usuario ve/edita únicamente filas cuyo `club_id` aparece en una fila de `miembro_club` con `user_id = auth.uid()`. Como toda tabla de dominio lleva `club_id` (decisión de la Etapa 2A), la política es literalmente la misma forma en las ocho tablas de dominio — todas menos `miembro_club`, que es la excepción descrita abajo.

`miembro_club` es la única tabla sin esa forma de política: un usuario ve únicamente sus propias filas (`user_id = auth.uid()`), y **no existe política de insert/update/delete** para el cliente autenticado — dar de alta la membresía de un entrenador en un club es un acto administrativo, se hace desde el panel de Supabase o con un rol de servicio, nunca desde el cliente RLS-restringido. Para el piloto (un solo club, un puñado de entrenadores) esto es simple y suficiente; automatizar el alta de entrenadores es un problema de un estadio posterior del producto, no de esta etapa.

## Orden de persistencia de una importación

`src/data/repositorio.js` expone una función por operación de base de datos, sin transacción que las envuelva. Persistir un partido importado requiere, en este orden:

1. Resolver el `jugadorId` de cada jugador propio: `obtenerJugadoresDelClub` + la clasificación de `mapearImportacion` (creando `jugador`/`pertenencia` nuevos donde corresponda, vía `crearJugador`/`crearPertenencia`, para cualquier `jugadoresNuevos`/`sugerencias` confirmadas por el entrenador).
2. `crearImportacion`.
3. `crearPartido`.
4. `crearEstadisticas` al final — requiere que **todos** los `jugadorId` ya estén resueltos (ver la guarda en `repositorio.js`; `estadistica_jugador_partido.jugador_id` es `not null`).

**Gap de atomicidad conocido:** estas son llamadas separadas, no una transacción. Si un paso falla, lo persistido en los pasos anteriores queda en la base — y como `importacion` tiene `unique(club_id, hash_archivo)`, reintentar el mismo archivo falla como "duplicado" aunque los datos estén incompletos. Envolver el import completo en una única transacción de base de datos (por ejemplo, una función Postgres `security invoker`) es un ítem abierto deliberado para la próxima etapa del proyecto, no resuelto acá.

## Cómo probar localmente

1. `supabase/migrations/0003_seed_dev.sql` no crea ninguna fila de `miembro_club` porque requiere un `auth.users.id` real.
2. Levantar Supabase local (`npx supabase start`, requiere Docker corriendo), aplicar las 3 migraciones en orden.
3. Crear un usuario de prueba (signup por la Auth API o el Studio local).
4. Insertar a mano: `insert into miembro_club (user_id, club_id, rol) values ('<uuid del usuario creado>', '00000000-0000-0000-0000-000000000001', 'entrenador');`
5. Con ese usuario autenticado, confirmar que sólo ve las filas del "Club de Prueba" sembrado.
