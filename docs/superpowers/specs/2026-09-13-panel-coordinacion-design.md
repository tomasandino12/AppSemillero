# Panel de coordinación y asignación por categoría

**Fecha:** 2026-09-13
**Estado:** aprobado 2026-09-13, con las respuestas de §9 — no se aplicó nada contra la base
**Tag de partida:** `pre-coordinacion`
**Migraciones:** `0017_coordinacion.sql` (aditiva) y `0018_endurecer_coordinador.sql` (restrictiva), en pasos separados

---

## 0. Punto de partida: el prompt describe un estado anterior a 0016

El prompt dice que la asignación de un profe a una categoría "no existe en el
modelo de datos" y que las policies filtran sólo por club. **En el repo eso dejó
de ser cierto el 2026-09-09**: `0016_autorizacion_por_plantel.sql` ya creó
`asignacion_plantel`, el `check (rol in ('entrenador','coordinador'))` y las dos
funciones `puede_ver_plantel` / `puede_escribir_plantel` que usan las policies de
las diez tablas con datos de jugador.

Lo que hay en `0016` **choca con las decisiones de este prompt** en cinco puntos:

| # | Hoy (0016) | Lo que pide este prompt |
|---|---|---|
| 1 | El coordinador **lee todos los datos individuales** de su club (sólo lectura) | El coordinador **no accede** a fichas ni mediciones |
| 2 | `miembro_club` tiene PK `(user_id, club_id)` y **un** `rol` | Una persona puede ser entrenador **y** coordinador |
| 3 | `asignacion_plantel` sin fechas, `unique` total y FK `on delete cascade` | Asignaciones con desde/hasta que **no se borran** |
| 4 | Ninguna policy de escritura en `miembro_club` ni `asignacion_plantel` | El coordinador habilita y asigna desde la app |
| 5 | `jugadores_del_club_para_dedup` sólo chequea membresía al club | Un coordinador no puede leer nombres de chicos |

Y un dato que **no puedo ver desde el repo**: si `0016` está aplicada en
producción y si se cargaron las asignaciones. La estrategia de migración (§5)
arranca por averiguarlo con una consulta de sólo lectura.

Todo lo de `0016` que no está en esa tabla **se conserva**: el catálogo
`categoria`, que la asignación sea a **plantel** (y por eso caduque con la
temporada), el mapa de cómo llega cada tabla a su plantel, y que `ejercicio`,
`nota_ejercicio`, `recurso`, `importacion` y `perfil_entrenador` sigan a nivel
club.

---

## 1. Modelo de datos

### 1.1 Roles: dos booleanos en `miembro_club`

```sql
miembro_club (
  user_id, club_id,                     -- PK, sin cambios
  es_entrenador  boolean not null default false,
  es_coordinador boolean not null default false,
  habilitado_por uuid references auth.users(id),  -- null = a mano o antes del panel
  habilitado_en  timestamptz,                     -- null = antes del panel
  check (es_entrenador or es_coordinador)
)
```

- Backfill: `es_entrenador = (rol = 'entrenador')`, `es_coordinador = (rol = 'coordinador')`.
- Después se dropea `miembro_club_rol_valido` y la columna `rol`. Dos fuentes
  de verdad para el rol es la receta para que una policy mire una y la UI la otra.
- `habilitado_en` se agrega **sin default** y se le pone `default now()` después:
  así las filas existentes quedan en null ("antes del panel") en vez de
  aparentar que se habilitaron el día de la migración.

**Por qué booleanos y no una tabla `rol_miembro` o un `text[]`:** son exactamente
dos roles fijos. Los booleanos se leen en una policy sin `join` ni `any()`, y el
`check` hace imposible una membresía sin rol. Una tabla aparte suma un join a
cada chequeo de RLS para modelar una flexibilidad que nadie pidió.

Nada en `src/` lee `rol` (verificado con grep); en SQL, sólo `0016`
(las dos funciones y la policy `jugador_crear`), y las tres se reescriben acá.

### 1.2 Asignaciones con historia

```sql
asignacion_plantel (
  id, miembro_club_user_id, miembro_club_club_id, plantel_id, creado_en,  -- existentes
  desde        timestamptz not null default now(),   -- backfill = creado_en
  hasta        timestamptz,                          -- null = vigente
  asignado_por uuid references auth.users(id),       -- null = a mano o migración
  cerrado_por  uuid references auth.users(id),
  origen       text not null default 'panel'
               check (origen in ('panel', 'manual', 'migracion')),
  check (hasta is null or hasta >= desde)
)
```

- **Vigente = `hasta is null`.** Cerrar corta el acceso en el momento.
- Se reemplaza el `unique (user, club, plantel)` por un **índice único parcial
  `where hasta is null`**: se puede volver a asignar a alguien a una categoría
  que ya tuvo, y queda una fila nueva al lado de la cerrada.
- Las dos FK pasan de `on delete cascade` a `on delete restrict`. Con cascade,
  borrar una membresía por SQL se lleva puesta la historia de quién estuvo a
  cargo de qué — que es justamente la memoria institucional que se quiere guardar.
- Filas existentes: `origen = 'manual'`. Filas que crea el backfill de §5:
  `origen = 'migracion'`, y el panel las muestra como tales para que el
  coordinador confirme que corresponden.

**Que no se borren es estructural, no una convención:**
- Sin policy de `delete` y sin `grant delete` para `authenticated`.
- `grant insert` **por columna** (`miembro_club_user_id, miembro_club_club_id, plantel_id`):
  el cliente no puede mandar `desde`, `hasta`, `asignado_por` ni `origen`, así que
  toman sus defaults (`now()`, null, `auth.uid()`, `'panel'`). No se puede
  antedatar una asignación.
- `grant update (hasta)` y nada más. Un trigger `before update` **sella** el
  cierre: pone `hasta = now()` y `cerrado_por = auth.uid()` sin importar qué
  mandó el cliente, y rechaza cualquier update sobre una fila ya cerrada
  (no se puede reabrir ni correr la fecha).

### 1.3 Al desasignar, lo cargado queda

No hay nada que construir: ninguna fila de `jugador`, `sesion_medicion`,
`medicion_*`, `partido`, `ejercicio` ni `nota_ejercicio` referencia a la
asignación. `creado_por` de ejercicios y notas apunta a `auth.users`, que no se
toca. Se verifica igual en el script (§6, caso 6).

---

## 2. Autorización

### 2.1 Quién ve qué, después de los dos pasos

| | Entrenador | Coordinador (sólo) | Ambos roles |
|---|---|---|---|
| `plantel` (nombre de la categoría) | sus asignadas vigentes | todos los de su club | la unión |
| `jugador`, `pertenencia`, `partido`, `estadistica_*`, `sesion_medicion`, `medicion_*`, `medicion_corporal`, `envio_recurso`, `meta_zona` | sus asignadas vigentes | **nada** | sus asignadas vigentes |
| `jugadores_del_club_para_dedup` | sí | **rechaza (42501)** | sí |
| `ejercicio`, `nota_ejercicio`, `recurso`, `perfil_entrenador` | todo el club | todo el club (RLS sin cambios; la UI de coordinación no lo muestra) | todo el club |
| Panel: pendientes, miembros, asignaciones, panorama agregado | **rechaza** | su club | su club |
| Habilitar / asignar / cerrar | **nunca** | a otros, en su club | a otros, en su club |

La biblioteca **no se toca en RLS** (el prompt lo prohíbe y no es dato de
menores). Que el coordinador "no la use" se resuelve en la interfaz, no
restringiendo la tabla.

### 2.2 Las funciones

Todas `security definer`, `stable`, `set search_path = ''`, nombres calificados,
`revoke execute from public`, `grant execute to authenticated` — el mismo
criterio de `0016` y por el mismo motivo (se llaman desde policies; como
`invoker` habría recursión).

```text
es_coordinador_de(p_club_id)     → miembro_club.es_coordinador del que llama, en ese club
es_entrenador_de(p_club_id)      → idem con es_entrenador
puede_escribir_plantel(p)        → es_entrenador y asignación VIGENTE a p
puede_ver_plantel(p)             → 0017: es_entrenador y asignación vigente, O es_coordinador  (igual que hoy)
                                   0018: es_entrenador y asignación vigente                    (sin rama coordinador)
```

Las diez tablas con datos de jugador **no cambian de policy**: todas llaman a
`puede_ver_plantel` / `puede_escribir_plantel`, así que reescribir las funciones
cambia a todas juntas. Es la ventaja del diseño de `0016` y el motivo por el que
esta etapa no toca una policy por tabla.

Sí se reescriben:
- `jugador_crear`: `m.rol = 'entrenador'` → `m.es_entrenador`.
- `jugadores_del_club_para_dedup` (en 0018): el chequeo de entrada pasa de "es
  miembro" a `es_entrenador_de(p_club_id)`. Hoy un coordinador podría pedir el
  padrón completo de nombres del club.

### 2.3 Policies nuevas (sólo para el coordinador)

**`plantel`** — `plantel_coordinador_ver`: `select using (es_coordinador_de(club_id))`.
Sin esto, tras 0018 el coordinador no sabría qué categorías existen. Un plantel
es "U17M 2026", no un dato de menores.

**`miembro_club`**
- `select using (es_coordinador_de(club_id))` — ve las membresías de su club.
- `insert with check (es_coordinador_de(club_id) and user_id <> auth.uid() and es_entrenador and not es_coordinador)`.
  Sólo crea **entrenadores**, nunca coordinadores, y nunca a sí mismo.
- Sin `update` ni `delete`. Se revocan `update, delete` del `grant` amplio de
  `0006` (defensa en profundidad: hoy los frena la falta de policy; mañana una
  policy nueva descuidada no los abre). `insert` queda por columna:
  `(user_id, club_id, es_entrenador)`.

**`asignacion_plantel`**
- `select using (es_coordinador_de(miembro_club_club_id))` — además de la propia que ya existe.
- `insert with check (es_coordinador_de(club) and miembro_club_user_id <> auth.uid() and <el destino es_entrenador en ese club>)`.
- `update using (es_coordinador_de(club) and hasta is null and miembro_club_user_id <> auth.uid())
  with check (hasta is not null)`.

**Un entrenador no tiene ninguna vía:** no hay policy de escritura que lo
incluya, el RPC es `security invoker` (lo frena la misma RLS), y las funciones de
lectura del panel rechazan con 42501 a quien no es coordinador.

**El coordinador tampoco se puede dar acceso a sí mismo** (`user_id <> auth.uid()`
en las tres policies). Si no, el coordinador se asigna una categoría y llega a
los datos individuales, que es lo que la Decisión 1 prohíbe. Ver pregunta P2.

### 2.4 Funciones de lectura del panel

Las tres `security definer`, rechazan con 42501 si `not es_coordinador_de(p_club_id)`
(o, en la primera, si no es coordinador de ningún club).

**`usuarios_pendientes()`** → `(user_id, email, registrado_en)` de `auth.users`
con **mail confirmado** y sin ninguna fila en `miembro_club`. Los no confirmados
quedan afuera: cualquiera puede crear una cuenta con un mail ajeno, y el
coordinador habilitaría a quien no es. (Ver P4 sobre multi-club.)

**`miembros_del_club(p_club_id)`** → `(user_id, email, nombre, es_entrenador, es_coordinador, habilitado_en)`.
`auth.users` no es legible desde el cliente, y `perfil_entrenador.nombre` puede
no existir todavía: la UI muestra el nombre si hay, el mail si no.

**`panorama_del_club(p_club_id)`** → jsonb con **sólo conteos y sumas**, nunca
una fila de jugador:

```json
{
  "planteles": [{ "plantelId", "jugadores", "partidos", "ultimaMedicion", "ultimoPartido" }],
  "tiro": [{ "plantelId", "sesionId", "fecha", "posicion", "anotados", "intentos", "jugadoresQueMidieron" }]
}
```

`tiro` es una fila por **(sesión, posición)** con anotados e intentos **sumados
entre jugadores** y `jugadoresQueMidieron` de la sesión (distintos con al menos
un dato no nulo, el mismo criterio de `zonasDeSesion`). **La base no calcula
ningún porcentaje**: devuelve sumas, y el porcentaje, el umbral y el margen se
calculan en `estadisticas.js`, que sigue siendo el único lugar donde viven.
La base tampoco sabe qué posiciones son "del arco": eso lo sigue diciendo
`posiciones.js`.

---

## 3. El RPC transaccional

```sql
asignar_planteles(p_user_id uuid, p_club_id uuid, p_plantel_ids uuid[]) returns jsonb
language plpgsql security invoker
```

1. `p_plantel_ids` vacío → `raise 'SIN_CATEGORIAS'`.
2. Si no hay `miembro_club (p_user_id, p_club_id)` → lo inserta con `es_entrenador = true`
   (esto es "habilitar").
3. Si existe pero `not es_entrenador` (un coordinador puro) → `raise 'NO_ES_ENTRENADOR'`.
   Convertir a un coordinador en entrenador es SQL (P2).
4. Por cada plantel: si ya tiene asignación vigente, lo saltea; si no, inserta.
5. Devuelve `{ habilitado: bool, asignadas: n, yaVigentes: n }`.

Todo sujeto a RLS: si quien llama no es coordinador, el paso 2 o el 4 falla por
policy y aborta la transacción entera. Un `plantel_id` de otro club rompe la FK
compuesta y aborta todo, **incluida la membresía del paso 2**: no queda un profe
"habilitado a medias" sin categorías.

Cerrar una asignación es **un update de una fila** (`hasta`), así que no va por
RPC, igual que el resto de las escrituras de una fila del proyecto. El trigger de
§1.2 garantiza la fecha y el autor.

---

## 4. Interfaz

### 4.1 Cómo entra cada uno

`entrarConSesion` lee, después del club, la fila propia de `miembro_club`
(policy `miembro_club_propio`, ya existe) y decide:

| Roles | Arranca en | Navegación |
|---|---|---|
| sólo entrenador | PLANTEL (como hoy) | las 5 pestañas de hoy, chips de categoría |
| sólo coordinador | Panorama | 2 pestañas: **Panorama** · **Profes**. Sin chips de categoría |
| ambos | PLANTEL | las 5 de hoy + botón **Coordinar** en la cabecera, que cambia al modo coordinación (y ahí, **Entrenar** para volver) |

El cambio de modo vive en el chrome, junto a Salir, respetando la invariante de
que las afordancias globales son del chrome y no de cada pantalla.

**Entrenador sin categorías vigentes:** PLANTEL dice "Todavía no tenés
categorías asignadas. Pedíselas al coordinador del club." en vez de
"No hay una categoría seleccionada".

**Cuenta sin club** (`v-sin-club`): el texto deja de decir que se habilita "a
mano" y pasa a "lo habilita el coordinador de tu club. Pasale este mail".

### 4.2 Panorama

Una tarjeta por plantel de la **temporada más reciente** (orden por
`temporada.nombre` desc, que hoy es el año), **en el orden del catálogo**
(`categoria.orden`: U13M, U15M, …). **Nunca ordenadas por ningún valor.**

Cada tarjeta:
- **Datos operativos:** `N jugadores · M partidos importados · última medición DD/MM`
  (o "sin mediciones"). A cargo: nombres de los profes vigentes, o
  **"Sin profe asignado"**.
- **Dos series, batería por batería, siempre separadas** (igual que HOY, que
  nunca las mezcla):
  - **Triples:** las 5 posiciones de la batería sumadas (todas caen sobre la
    línea de tres, ver `posiciones.js`).
  - **Libres:** la posición `libres`.

  Cada una es la serie de esa categoría contra sí misma: gráfico con
  `grafico()` y debajo la tabla de puntos con `textoPorcentaje()` (siempre
  `x% · a/i`, marca "pocos datos" con el umbral único) y cuántos jugadores
  midieron. En pantalla se dice **"triples"**, nunca "del arco".
- **Última contra la anterior de la misma categoría**, por serie, con
  `compararPorcentajes()` y el mismo texto de HOY: flecha sólo si supera el
  margen; si no, "± n pp · sin diferencia clara". Libres tiene ~140 intentos
  por punto contra ~700 de triples, así que el margen es más ancho y va a decir
  "sin diferencia clara" más seguido: es el comportamiento correcto.

**Lo que la pantalla no hace, a propósito:**
- No compara una categoría con otra: sin tabla cruzada, sin "promedio del club",
  sin ranking, sin color distinto por categoría, sin palabras como "mejor",
  "rinde" o "atención".
- **Eje Y fijo 0–100 en todas las tarjetas.** Con la escala automática de
  `grafico()`, una categoría que se movió 3 puntos se ve igual de "dramática"
  que una que se movió 20, y dos tarjetas lado a lado invitan a leerlas como
  comparables. Se agrega a `grafico()` una opción `{ min, max }`; sin pasarla,
  todo lo existente se dibuja igual.
- Sin líneas de tendencia, proyecciones ni normas por edad (ya es así en `grafico()`).

Celular: tarjetas apiladas. Escritorio (≥64rem): grilla de columnas
`repeat(auto-fill, minmax(18rem, 1fr))`, "una al lado de la otra".

### 4.3 Profes

Tres bloques:

1. **Pendientes** — cuentas confirmadas sin club: mail y fecha de registro.
   Botón **Habilitar** → hoja con las categorías de la temporada como casillas
   (táctiles, 44px) → **Habilitar y asignar** (llama al RPC). Sin categorías
   marcadas, el botón queda deshabilitado.
2. **Categorías sin profe** — lista corta; cada una con **Asignar** → hoja con
   los entrenadores del club.
3. **Profes del club** — nombre (o mail), y sus categorías vigentes como chips.
   Cada chip tiene **Quitar** → hoja de confirmación:
   *"Quitarle U13M a Juan. Deja de ver U13M desde ahora. Lo que cargó queda en
   el club, y la asignación queda registrada con fecha de cierre."*
   Botón **Asignar categorías** → hoja con las no asignadas.
   Las asignaciones con `origen = 'migracion'` llevan la nota *"asignada al
   activar el panel — confirmá que corresponde"*.
   El propio coordinador aparece con la etiqueta "coordinación" y sin botones.

La confirmación va en **Quitar** y no en **Habilitar**: cortarle el acceso a
alguien en medio de su trabajo es lo que duele si fue un dedazo.

---

## 5. Estrategia de migración — lo que hay que aprobar

### Principio

Dos migraciones y un despliegue en el medio, no una:

- **0017 es aditiva.** Nadie puede hacer menos de lo que hace hoy. Agrega
  columnas, funciones, policies para el coordinador y el RPC, y crea las
  asignaciones que hagan falta para que ningún entrenador actual pierda nada.
- **0018 es la única restrictiva**, chica y explícita: le saca al coordinador la
  lectura individual. Se aplica recién cuando el panel ya está andando y se
  verificó que cada persona tiene lo que necesita.

Así el paso que puede dejar a alguien afuera está aislado, se puede leer entero
en una pantalla, y tiene su rollback propio.

### Paso 0 — Diagnóstico (sólo lectura, antes de todo)

Pegar en el SQL Editor de producción y pasarme el resultado:

```sql
select
  to_regclass('public.asignacion_plantel') is not null                    as hay_0016,
  exists (select 1 from pg_policies where policyname = 'plantel_ver')      as policies_0016;

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

(Si `hay_0016` es false, la segunda consulta falla: en ese caso alcanza con
`select u.email, m.club_id, m.rol from miembro_club m join auth.users u on u.id = m.user_id;`.)

Lo que sale define el caso:

| Caso | Diagnóstico | Qué pasa al aplicar |
|---|---|---|
| **A** | 0016 no aplicada | Se aplican 0016 y 0017 juntas (`supabase db push`, cada una en su transacción, segundos de diferencia). El backfill de 0017 asigna a cada entrenador todas las categorías de su club: **ve exactamente lo mismo que hoy**. |
| **B** | 0016 aplicada, cada entrenador con sus asignaciones | El backfill no hace nada. Nadie nota el cambio. |
| **C** | 0016 aplicada, algún entrenador **sin** asignaciones | Hoy esa persona **ya no ve nada**. El backfill le devolvería todas las categorías: es lo que el prompt pide ("nadie pierde acceso") pero reabre lo que 0016 cerró para esa persona. **Lo decidimos con el diagnóstico en la mano** (P1). |

### El backfill, dentro de 0017

```sql
insert into asignacion_plantel (miembro_club_user_id, miembro_club_club_id, plantel_id, origen, desde)
select m.user_id, m.club_id, p.id, 'migracion', now()
from miembro_club m
join plantel p on p.club_id = m.club_id
where m.es_entrenador
  and not exists (select 1 from asignacion_plantel a
                  where a.miembro_club_user_id = m.user_id
                    and a.miembro_club_club_id = m.club_id);
```

Sólo toca entrenadores **sin ninguna** asignación. En local y en una base nueva
`miembro_club` está vacía y no hace nada. Las filas quedan marcadas
`'migracion'` y el panel las señala, así que "todos ven todo" no queda
escondido: queda como una tarea visible del coordinador.

### Orden de despliegue

1. **Diagnóstico** (paso 0) → elegimos caso.
2. **Aplicar 0017.** Correr `tests/verificarCoordinacion.sql`: los casos de
   coordinador que dependen de 0018 salen como `PENDIENTE`, el resto `OK`.
3. **Primer coordinador**, si el diagnóstico no mostró uno: una fila a mano
   (`docs/COORDINACION.md`). Si ya hay una fila `rol = 'coordinador'`, 0017 la
   convierte sola.
4. **Deploy del frontend.** Funciona igual con 0017 sola o con 0018: la UI de
   coordinación nunca pide datos individuales, así que no depende de que la base
   se los niegue.
5. El coordinador **revisa en Profes** las asignaciones `migracion` y quita las
   que no correspondan.
6. **Si el coordinador también entrena**, darle `es_entrenador` y sus categorías
   por SQL **antes** del paso 7, o se queda sin sus datos (P2).
7. **Aplicar 0018.** Aborta sola si hay un club con miembros y sin ningún
   coordinador (nadie podría administrarlo). Correr de nuevo
   `verificarCoordinacion.sql`: todo `OK`, nada `PENDIENTE`.

### Rollback

- **`tests/rollback0018.sql`** — vuelve `puede_ver_plantel` y el dedup a su forma de
  0017. Trivial y sin datos en juego.
- **`tests/rollback0017.sql`** — vuelve a la forma de 0016: recrea `rol` desde los
  booleanos, restaura las funciones, policies, grants, el `unique` y el cascade.
  **Aborta** (no adivina) si hay alguien con los dos roles o alguna asignación
  cerrada, porque la forma de 0016 no los puede representar sin perder historia
  o sin reabrir un acceso; en ese caso dice cuáles son. Compara conteos de
  `miembro_club`, `asignacion_plantel`, `plantel`, `jugador` y
  `sesion_medicion` antes y después.

---

## 6. Verificación

### `tests/verificarCoordinacion.sql` (SQL Editor, service role, no deja nada)

Mismo patrón que `verificarAutorizacionPlantel.sql`: todo dentro de un sub-bloque
que se deshace con un SQLSTATE reservado, resultados como tabla, impersonación con
`set_config('role','authenticated')` + `request.jwt.claims`, que es exactamente
como PostgREST evalúa RLS para una sesión real. **Usuarios y datos sintéticos**
creados adentro (incluidas filas en `auth.users`), así no depende de cuántas
cuentas reales haya. Detecta si 0018 está aplicada (por el `comment` que 0018 le
pone a `puede_ver_plantel`) y marca `PENDIENTE` lo que depende de ella.

| # | Caso | Criterio |
|---|---|---|
| 1 | Entrenador A (sólo U17M) lee **cero** filas de U21M en `jugador`, `pertenencia`, `partido`, `estadistica_jugador_partido`, `sesion_medicion`, `medicion_tiro`, `medicion_velocidad`, `medicion_corporal` | no lee otra categoría |
| 2 | A lee los ejercicios y notas creados por el entrenador B (U21M) | biblioteca sin restricción |
| 3 | A **no puede**: insertar `miembro_club`, insertar asignación, cerrar una asignación, llamar `asignar_planteles` (ni para otro ni para sí), llamar `usuarios_pendientes` / `miembros_del_club` / `panorama_del_club` | entrenador sin vía |
| 4 | Coordinador C ve al pendiente P (confirmado) y **no** al pendiente Q (sin confirmar) | pendientes |
| 5 | C asigna a P U17M y U21M en una llamada → 1 membresía, 2 vigentes. U17M queda con A y P | varios por categoría y varias por profe |
| 6 | P carga una sesión en U21M; C le cierra U21M → la fila sigue, `hasta` y `cerrado_por = C` seteados aunque el cliente mande otra fecha; P ya no ve U21M; la sesión de P sigue existiendo | cerrar sin borrar |
| 7 | C **no puede**: borrar una asignación, reabrir una cerrada, mandar `desde`, asignarse a sí mismo, crear un coordinador, habilitar en otro club | límites del coordinador |
| 8 | `asignar_planteles(P2, club, [U17M, plantel_de_otro_club])` falla y **no deja nada**: ni membresía ni la asignación a U17M | rollback del RPC |
| 9 | `panorama_del_club` devuelve las sumas correctas de una sesión sintética (3/10 + 5/10 = 8/20, 2 jugadores), no trae posiciones sin medir, y no trae ninguna clave fuera de las listadas en §2.4 | panorama agregado |
| 10 | *(0018)* C lee **cero** filas en las tablas del caso 1, y el dedup lo rechaza; **sí** lee `plantel` de su club | coordinador sin datos individuales |
| 11 | Persona con ambos roles: ve sus categorías, escribe en ellas, y usa el panel; *(0018)* no ve las categorías que no tiene asignadas | ambos roles |
| 12 | Nadie ve nada del otro club, ni por tablas ni por las funciones del panel | aislamiento |

### `tests/verificarAccesoPorCategoria.js` (Node, sesión real)

Para el criterio "verificado con su propia sesión, no sólo por la interfaz",
literal: con el mail y la clave de un entrenador real y su cliente
`@supabase/supabase-js`, igual que `verificarRpc.js`. Lista los planteles que ve,
confirma que `jugador` no devuelve a nadie fuera de ellos, y confirma que
`usuarios_pendientes`, `miembros_del_club` y `panorama_del_club` lo rechazan.
Con credenciales de coordinador (opcionales) confirma que no lee ninguna fila
de las tablas con datos de jugador y que el panorama sí responde.

**Sólo lecturas, a propósito.** Una escritura que *debería* fallar, si por un
error de policy no falla, queda escrita en producción (por ejemplo, un profe
que se cierra su propia categoría). Las escrituras prohibidas se prueban en el
script SQL, que se deshace entero.

### `npm test`

- `estadisticas.test.js`: la serie agregada por plantel reproduce, con sumas, el
  mismo resultado que `serieDeZonas` con filas individuales; sesiones sin arco no
  generan punto; umbral y margen salen de las funciones existentes.
- `graficos.test.js`: con `{min:0, max:100}` la escala no se mueve; sin la opción
  todo igual que antes.
- `coordinacion.test.js` (nuevo, `src/data/coordinacion.js` puro): categorías sin
  profe, orden por catálogo y no por valor, agrupado de asignaciones vigentes.
- **Guarda de arquitectura** (nuevo): ningún archivo de las pantallas de
  coordinación importa lecturas individuales de `repositorio.js`
  (`obtenerJugadoresDelPlantel`, `obtenerMedicionesTiroDelPlantel`, …).
- `importsResueltos.test.js` sigue pasando con los módulos nuevos.

---

## 7. Documentación

- **`docs/COORDINACION.md`** (nuevo): qué puede cada rol, el diagnóstico, el orden
  de despliegue, cómo se crea **el primer coordinador** a mano, cómo darle
  además el rol de entrenador a un coordinador, y cómo consultar la historia de
  asignaciones por SQL.
- **`docs/CONFIGURAR-AUTH.md` §6**: deja de decir "a mano" y remite al panel y a
  `COORDINACION.md`.
- **`supabase/ESQUEMA.md`**: estado al día de 0018; roles, asignación con
  historia, tabla de §2.1, policies del coordinador, funciones del panel.

Primer coordinador:

```sql
insert into miembro_club (user_id, club_id, es_coordinador)
values ('<uuid de Authentication → Users>', '<uuid del club>', true)
on conflict (user_id, club_id) do update set es_coordinador = true;
```

---

## 8. Fuera de alcance

- Crear coordinadores desde el panel (es SQL; ver P3).
- Sacar a alguien del club entero. Cerrarle todas las categorías le deja sólo la
  biblioteca; borrar la membresía queda como SQL y ahora está frenado por el
  `restrict` si tiene historia.
- Ver la historia de asignaciones en pantalla (queda en la base y se consulta
  por SQL; `COORDINACION.md` trae la consulta).
- Series de partidos en el panorama, velocidad, antropometría.
- Temporadas anteriores en el panorama y selector de temporada.
- Pre-asignación por mail, invitaciones, creación de categorías o temporadas.
- Parser, import, migraciones existentes.

---

## 9. Preguntas — respondidas el 2026-09-13

- **P1 → caso B.** Diagnóstico de producción: Nacho (entrenador, U13M), cuenta
  de prueba (entrenador, U17M y U21M), Tomás (coordinador puro, sin
  asignaciones). Ningún entrenador sin asignaciones: el backfill de 0017 no
  hace nada en producción. Se conserva igual porque es inocuo y cubre a
  alguien que se habilite por SQL entre hoy y el día que se aplique.
- **P2 → se sostiene.** Nadie tiene los dos roles. El panel no permite
  autoasignarse. Tomás es coordinador puro a propósito: tras 0018 no lee datos
  individuales, y usa la cuenta de prueba para lo de entrenador.
- **P3 → sí.** Coordinadores nuevos sólo por SQL, los habilita Tomás.
- **P4 → sólo Newell's por ahora.** El límite queda documentado; multi-club se
  piensa después de probar con usuarios reales.
- **P5 → triples y libres, las dos**, separadas como en HOY. Ver §4.2.

Texto original de las preguntas:

**P1 — Estado de producción.** Necesito el resultado del diagnóstico del paso 0.
Si sale caso C, ¿el backfill le devuelve todas las categorías a quien hoy no ve
nada (marcadas `migracion` para revisar), o esa persona espera a que el
coordinador le asigne desde el panel?
*Recomendación:* backfill igual. Es lo que pide el prompt y queda visible.

**P2 — El coordinador que también entrena.** Propongo que el panel **no** permita
autoasignarse: si no, "el coordinador no accede a datos individuales" se
desactiva con dos toques. Quien tiene los dos roles recibe su rol de entrenador y
sus categorías **por SQL** (o de otro coordinador). ¿Hay hoy alguien en esa
situación en el piloto?

**P3 — Coordinadores nuevos.** Propongo que sólo se creen por SQL: dar el rol que
reparte accesos es la decisión más sensible de todas, y pasa pocas veces.

**P4 — Pendientes con varios clubes.** `usuarios_pendientes()` muestra a
**cualquier** coordinador todas las cuentas confirmadas sin club, porque una
cuenta nueva no pertenece a ningún club todavía y no hay forma de saber a cuál
va. Para el piloto, con un club, es exacto. Con un segundo club, un coordinador
vería los mails de quien se registró para el otro. Lo dejo documentado como
límite conocido, sin resolver ahora.

**P5 — Qué serie mostrar.** Propongo sólo **tiro del arco en baterías**: es la
única medida con muestra suficiente por punto (~700 intentos) y la misma que ya
usa HOY. Tiro en partidos varía con el rival y la cantidad de partidos;
velocidad y antropometría son por jugador. ¿Alcanza con esa, o querés también
libres en batería?
