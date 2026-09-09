# Autorización por plantel — catálogo, asignación y lectura/escritura separadas

**Fecha:** 2026-09-09
**Estado:** para aprobar
**Migración:** `0016_autorizacion_por_plantel.sql` (siguiente disponible)

## El problema

La autorización vive únicamente en `miembro_club (user_id, club_id, rol)`. Quien
tiene una fila ahí ve **todos los planteles del club**. Verificado contra la base
real: dos cuentas sobre `20000000-…-001`, ambas `rol = 'entrenador'`, ambas ven
U17M y U21M sin que nadie se los asignara.

En un club hay un profe por categoría. Cada uno debe ver lo suyo. Y hay un rol de
coordinador que necesita la foto completa para control, pero **no toma decisiones
técnicas**.

---

## 1. Catálogo de categorías

Tabla, no `enum` de Postgres: un `enum` obliga a migración para agregar una
categoría, y al replicar a otros clubes cada uno tiene su grilla.

```sql
categoria (codigo text primary key, nombre text not null, orden integer not null)
```

| codigo | nombre | orden |
|---|---|---|
| `U13M` | Sub-13 Masculino | 10 |
| `U15M` | Sub-15 Masculino | 20 |
| `U17M` | Sub-17 Masculino | 30 |
| `U21M` | Sub-21 Masculino | 40 |
| `MAY_M` | Mayores Masculino | 50 |
| `MAY_F` | Mayores Femenino | 60 |

Huecos de 10 para intercalar sin renumerar. El `codigo` es interno: el matcheo
con la CABB lo sigue haciendo `plantel.codigo_cabb`, que ya existe y no se toca.

### Migración de `plantel.categoria` a FK

`plantel.categoria` es `text not null` y hoy guarda `'U17M'` / `'U21M'` en las
cuatro filas existentes (dos clubes × dos planteles). **Mapea limpio contra el
catálogo, sin adivinar nada.**

Orden dentro de la migración:

1. Crear `categoria` y sembrarla.
2. Agregar `plantel.categoria_codigo text` **nullable**.
3. Backfill: `update plantel set categoria_codigo = categoria`.
4. **Verificar antes de apretar**: si queda algún `categoria_codigo is null`, la
   migración aborta con `raise exception`. Un plantel sin categoría del catálogo
   es un dato que se perdería en silencio.
5. Recién ahí: `not null` + FK a `categoria(codigo)`.
6. La columna vieja `categoria` **se conserva**. No se dropea en esta migración.

**Por qué no se dropea `categoria`:** `unique (club_id, temporada_id, categoria)`
cuelga de ella, la UI la lee por todos lados (`plantel.categoria` aparece en
chips, títulos y toasts) y el prompt prohíbe tocar `src/ui/`. Dropearla obligaría
a tocar la UI en la misma tanda. Queda como columna espejo, con un comentario
SQL que dice que la fuente de verdad pasó a ser `categoria_codigo`. Sacarla es
una tarea posterior, junto con el cambio de UI.

---

## 2. Asignación entrenador → plantel

```sql
asignacion_plantel (
  id uuid primary key default gen_random_uuid(),
  miembro_club_user_id uuid not null,
  miembro_club_club_id uuid not null,
  plantel_id uuid not null,
  creado_en timestamptz not null default now(),
  unique (miembro_club_user_id, miembro_club_club_id, plantel_id),
  foreign key (miembro_club_user_id, miembro_club_club_id)
    references miembro_club (user_id, club_id) on delete cascade,
  foreign key (miembro_club_club_id, plantel_id)
    references plantel (club_id, id) on delete cascade
)
```

**Nota sobre la forma:** el prompt pide `(id, miembro_club_id, plantel_id)`, pero
`miembro_club` tiene **PK compuesta `(user_id, club_id)`** — no existe un
`miembro_club.id` al que apuntar. Se usa la PK real. El beneficio es mayor que la
incomodidad: la segunda FK compuesta obliga a que el club del plantel coincida
con el club de la membresía, cosa que un `miembro_club_id` de una sola columna no
podría garantizar. Es el mismo patrón que ya usa todo el esquema.

Se asigna a **plantel**, no a categoría: un profe puede tener U15M una temporada
y U17M la siguiente. Asignar a categoría arrastraría el acceso entre temporadas;
asignar a plantel hace que caduque con la temporada, que es el comportamiento
correcto para datos de menores. Costo asumido: reasignar cada temporada.

**Sin policy de insert para el cliente autenticado**, igual que `miembro_club` y
por el mismo motivo. Solo `select` de lo propio.

---

## 3. Los dos ejes: ver y escribir

```sql
puede_ver_plantel(p_plantel_id uuid) returns boolean
puede_escribir_plantel(p_plantel_id uuid) returns boolean
```

Ambas `security definer`, `stable`, `set search_path = ''`, con
`revoke execute from public` y `grant execute to authenticated`.

**Por qué `security definer`:** las policies de las tablas de dominio consultan
`miembro_club` y `asignacion_plantel`. Si las funciones fueran `invoker`, esas
consultas quedarían sujetas a las policies de esas tablas y habría recursión.

| | `entrenador` | `coordinador` |
|---|---|---|
| `puede_ver_plantel` | tiene asignación a ese plantel | es miembro del club de ese plantel |
| `puede_escribir_plantel` | tiene asignación a ese plantel | **nunca** |

El coordinador ve todo su club y no escribe nada, ni siquiera lo que ve. Necesita
la foto para controlar cómo va el trabajo; qué se entrena, qué recursos se mandan
y qué metas se fijan es del cuerpo técnico.

`CHECK (rol in ('entrenador','coordinador'))` en `miembro_club`: las dos filas
actuales lo cumplen. Sin la constraint, un `'Entrenador'` con mayúscula entra
igual, no matchea ninguna policy, y el síntoma aparece lejos de la causa.

---

## 4. Mapa de policies

### Por plantel — camino directo
`pertenencia`, `partido`, `sesion_medicion`, `meta_zona` tienen `plantel_id`.

```sql
for select using (puede_ver_plantel(plantel_id))
for insert with check (puede_escribir_plantel(plantel_id))
for update using (...) with check (...)
for delete using (puede_escribir_plantel(plantel_id))
```

### Por plantel — camino indirecto

| Tabla | Camino |
|---|---|
| `estadistica_jugador_partido` | `exists (select 1 from partido p where p.id = partido_id and puede_*_plantel(p.plantel_id))` |
| `medicion_tiro`, `medicion_velocidad` | vía `sesion_id` → `sesion_medicion.plantel_id` |
| `medicion_corporal`, `envio_recurso` | vía `jugador_id` → `pertenencia.plantel_id` (`exists`, así un chico citado en dos planteles se resuelve con que **alguno** dé acceso) |

### `plantel` — se suma a la lista

No estaba en el scope del prompt, pero el criterio 4 lo exige: *"un coordinador
ve todos los planteles de su club"*. Sin scopar `plantel`, un entrenador sigue
viendo todas las categorías en los chips. `select` por `puede_ver_plantel(id)`.
Sin write: nada en la app crea planteles, se siembran por SQL.

### `jugador` — el caso con forma propia

- **SELECT**: `exists` de una `pertenencia` a un plantel visible.
- **UPDATE / DELETE**: `exists` de una `pertenencia` a un plantel escribible.
- **INSERT**: solo `rol = 'entrenador'` + miembro del club. **Sin chequeo de
  plantel.**

**Por qué el INSERT no puede chequear plantel** — y esto es un hallazgo, no una
concesión: en `importar_partido` el `insert into jugador` está en la línea 55 y
el `insert into pertenencia` en la 64. **Cuando se inserta el jugador todavía no
existe su pertenencia**, así que no hay plantel contra el cual chequear. Es la
misma forma del problema de `importacion`. `alta_jugador_manual` (0008) hace lo
mismo.

Qué queda expuesto: un entrenador puede crear filas huérfanas de `jugador` en su
club. **No puede** colgarlas de un plantel ajeno (la policy de `pertenencia` lo
bloquea) ni volver a leerlas si no caen en uno suyo. Es acotado y no evitable sin
reescribir los dos RPCs, que está fuera de scope.

### Sin tocar, a nivel club
`club`, `temporada`, `importacion`, `recurso`, `ejercicio`, `nota_ejercicio`,
`perfil_entrenador`, `miembro_club`.

`importacion` porque se inserta antes que el partido y no tiene `plantel_id` que
chequear; además no contiene datos de menores (hash, nombre de archivo y
advertencias del parser). Las cuatro de la biblioteca porque el beneficio que
justifica que un profe cargue un ejercicio es que quede para todos: scoparlas las
vacía de sentido.

---

## 5. La función de dedup

Con `jugador` scopeado, el dedup del import dejaría de ver a un chico citado
desde otra categoría y **crearía un duplicado**, rompiendo la trazabilidad de por
vida que es la tesis del producto. Por eso la excepción, y por eso es una
función y no una policy: se expone exactamente el mínimo, y se expone auditado.

```sql
jugadores_del_club_para_dedup(p_club_id uuid)
  returns table (id uuid, nombre_clave text, nombre_limpio text, planteles_visibles uuid[])
security definer, stable, set search_path = ''
```

Chequea que quien llama sea miembro de `p_club_id` y **aborta si no**. Sin eso, la
función sería un agujero: `security definer` saltea RLS por definición.

### Los campos: dos correcciones a lo cerrado

El prompt fija `id`, `nombre_clave` y `desambiguador`. Verificado contra los dos
consumidores reales, esa lista **no alcanza y a la vez sobra**:

| Campo | ¿Se usa? | Dónde |
|---|---|---|
| `id` | sí | resolver el jugador |
| `nombre_clave` | sí | match exacto y distancia de Levenshtein |
| `nombre_limpio` | **sí, falta en la lista** | `extraerApellido()` en `mapearImportacion.js:84`, para las coincidencias posibles |
| `desambiguador` | **no, sobra** | cero usos en `mapearImportacion.js` y en `altaJugador.js` |
| planteles del jugador | **sí, falta en la lista** | `mapearImportacion.js:158` y `altaJugador.js:78` deciden si hace falta una pertenencia nueva |

`nombre_limpio` no agrega exposición: `nombre_clave` ya es el nombre normalizado,
quien tiene uno tiene el otro.

Los planteles sí agregaban, y por eso **el campo se devuelve filtrado**:
`planteles_visibles` trae únicamente los planteles del jugador que quien llama
puede ver. Se aprende que el chico existe en el club y si está en *tu* categoría;
**no** se aprende en qué otras está.

### Por qué esto no toca `src/ui/`

`obtenerJugadoresDelClub()` conserva su nombre y su forma de retorno
(`{id, nombreClave, nombreLimpio, plantelesActuales}`); lo único que cambia es
que por dentro llama al RPC en vez de a `from('jugador')`. Sus dos consumidores
—`confirmacionImport.js:193` y `altaJugador.js:68`— no se enteran.

Efecto colateral deseable en `altaJugador.js`: un chico de una categoría que no
ves cae en la rama que ya existe, *"ya está cargado en el club, en otra
categoría"*. Es cierto y no dice cuál.

---

## 6. Verificación y rollback

**`tests/verificarAutorizacionPlantel.sql`** — corre con rol de servicio, crea
dos usuarios de prueba y datos sintéticos (nunca datos reales de menores), y
prueba con `set local role` + `set local request.jwt.claims`:

1. Entrenador asignado solo a U17M: `select from pertenencia` da **cero** filas
   de U21M.
2. Ese entrenador inserta `sesion_medicion` en U17M ✅ y falla por RLS en U21M.
3. Coordinador sin asignaciones: ve los dos planteles; **todo** insert, update y
   delete falla.
4. Ese entrenador no obtiene por `select * from jugador` jugadores de planteles
   no asignados.
5. La función de dedup, llamada por ese mismo entrenador, sí devuelve los
   `nombre_clave` de todo el club, y solo los cuatro campos.
6. Un chico con pertenencia a dos planteles se resuelve como coincidencia
   existente, no como jugador nuevo.
7. Ningún usuario ve nada del club `00000000-…-001`.

Al final imprime los `INSERT` de asignación listos para pegar, apuntando al club
del piloto `20000000-0000-0000-0000-000000000001`.

**No se auto-siembran asignaciones**: sembrar "todos ven todo" reinstala el bug
que esto arregla. La consecuencia es que en el momento de correr la migración las
dos cuentas dejan de ver U17M y U21M hasta insertar sus asignaciones, y por eso
los `INSERT` salen del mismo script.

**`tests/rollbackAutorizacionPlantel.sql`** — dropea en orden inverso, restaura
las policies `for all` de `0002`/`0009`/`0012`/`0013` tal cual estaban, saca el
CHECK y la FK, y deja `plantel.categoria` intacta (nunca se tocó). Verifica al
final que el conteo de filas de `plantel`, `pertenencia`, `partido`,
`sesion_medicion` y `jugador` es el mismo que antes.

---

## 7. Fuera de alcance

- Pantalla de administración de accesos. La asignación es por SQL.
- Policy de insert en `miembro_club` o `asignacion_plantel`.
- Cambiar el modelo de identidad de jugador o la lógica de dedup en sí — solo por
  dónde pasa la consulta.
- Dropear `plantel.categoria` (requiere tocar `src/ui/`).
- Roles más allá de `entrenador` y `coordinador`.
- Correr migraciones contra la base.

## 8. Condiciones de parada

Parar y preguntar antes de: tocar algo de `src/ui/`; cambiar un RPC existente;
dropear `plantel.categoria`; o si aparece una tabla con datos de jugador fuera
del mapa de la sección 4.
