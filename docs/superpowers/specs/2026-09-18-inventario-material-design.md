# Inventario de material físico del club

**Fecha:** 2026-09-18
**Estado:** para aprobar
**Depende de:** `0017_coordinacion.sql` (`es_coordinador_de`), el modo
coordinación de la navegación (`TABS_COORDINACION` en `src/ui/chrome.js`) y la
hoja inferior (`src/ui/componentes/hoja.js`). No toca `paso_fuerza`,
`movimiento_escalon`, el plan físico ni la pestaña FÍSICO más allá de un enlace
de lectura (6.3).

---

## 1. Qué resuelve

Hoy nadie en el club sabe con certeza qué material hay. Esta etapa suma el
**inventario**: una lista única, del club entero, de lo que existe. Incluye el
material de fuerza con su peso (mancuernas, discos, barras, pesas rusas, balones
medicinales), el que no tiene peso
(pelotas, conos, sogas, escalerita, bandas elásticas) y cualquier otra cosa que
el club quiera registrar. La carga el coordinador y la leen todos.

**Hacia dónde va, fuera de este alcance:** más adelante se quiere poder decir si
un ejercicio se puede hacer con el material que hay. Por ejemplo, si hay
mancuernas del peso que le toca a un chico, o si hay una escalerita para un
ejercicio de coordinación. La tabla se diseña para eso:

- el **tipo** es una clave fija y comparable, no un texto que cada uno escribe
  distinto;
- el **peso** va en `numeric`, en kg, igual que `paso_fuerza.paso`;
- lo que **hay** es exactamente lo que está en la tabla, sin filas "dadas de
  baja" que haya que filtrar (ver 4.3).

Ese cruce no se implementa acá: no hay avisos de "no hay material" ni
referencias desde o hacia `paso_fuerza`.

---

## 2. Decisiones dadas

Vienen del prompt y de la revisión del spec. El resto del documento se apoya en
ellas y no las reabre.

1. **La cantidad es de unidades sueltas, no de pares.** "2 mancuernas de 10 kg"
   son 2 unidades; un ejercicio bilateral usa las dos.
2. **No modela quién usa qué ni cuándo.** El inventario es del club entero, no
   por plantel ni por turno. Dos categorías entrenando a la vez se turnan por
   estaciones, como ya hacen sin la app.
3. **Los discos se combinan** (5 + 5 = 10); mancuernas, barras, pesas rusas y
   balones medicinales no.
4. **Con peso:** mancuernas, discos, barras, pesas rusas (kettlebell), balones
   medicinales. **Sin peso:** pelotas (se
   identifican por número), conos, sogas, escalerita, bandas elásticas.
5. **Más el tipo "otro", con nombre libre**, para lo que no está en la lista. Los
   diez tipos fijos están para no tener que escribir lo más común; "otro" está
   para que nada quede afuera.
6. **Lo edita el rol coordinador**, no una persona fija.
7. **Se guarda quién hizo el último cambio y cuándo**, con el patrón del resto
   del esquema. No se guarda responsable de custodia por objeto.
8. **La pantalla se llama "Inventario".** Es para controlar qué se tiene.

---

## 3. Permisos: la función ya existe

El pedido suponía que no había ningún caso de "sólo el coordinador escribe" y que
`es_coordinador_de` sólo se usaba para lectura agregada. Las dos cosas ya
existen en el esquema:

- en `miembro_club` y `asignacion_plantel` escribe **sólo** el coordinador
  (ESQUEMA.md, "Policies del coordinador (0017)");
- `es_coordinador_de` se usa en `with check` de escritura:
  `miembro_club_coordinador_habilita` (insert), `asignacion_coordinador_asigna`
  (insert) y `asignacion_coordinador_cierra` (update), en `0017_coordinacion.sql`.

`material` sería la primera tabla **de datos del club** —no de administración de
cuentas— con esa regla, pero **no hace falta una función nueva**:
`es_coordinador_de(club_id)` decide exactamente el rol del que llama en ese club,
y ya está probada para escritura en `tests/verificarCoordinacion.sql`.

---

## 4. La tabla `material`

La pantalla se llama "Inventario"; la tabla, `material`, porque cada fila es un
material, no un inventario.

### 4.1 Esquema

```sql
create table material (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references club(id),
  tipo text not null check (tipo in (
    'mancuerna', 'disco', 'barra', 'pesa_rusa', 'balon_medicinal',
    'pelota', 'cono', 'soga', 'escalerita', 'banda',
    'otro')),
  -- Kg de UNA unidad.
  peso_kg numeric check (peso_kg > 0),
  -- En los tipos fijos, lo que distingue dos filas del mismo tipo: "N° 7" en
  -- una pelota, "roja, fuerte" en una banda, "EZ" en una barra. Vacío si no hace
  -- falta. En "otro", es el nombre del material y es obligatorio.
  detalle text not null default '',
  cantidad integer not null check (cantidad > 0),
  creado_por uuid not null default auth.uid() references auth.users(id),
  creado_en timestamptz not null default now(),
  actualizado_por uuid not null default auth.uid() references auth.users(id),
  actualizado_en timestamptz not null default now(),
  -- Con peso: obligatorio. Sin peso: prohibido. Otro: opcional.
  check (tipo not in ('mancuerna', 'disco', 'barra', 'pesa_rusa', 'balon_medicinal')
         or peso_kg is not null),
  check (tipo not in ('pelota', 'cono', 'soga', 'escalerita', 'banda') or peso_kg is null),
  check (tipo <> 'otro' or detalle <> ''),
  check (detalle = btrim(detalle))
);

create unique index material_unico
  on material (club_id, tipo, peso_kg, lower(detalle)) nulls not distinct;
create index material_club_id_idx on material(club_id);
```

### 4.2 Campo por campo

| Campo | Por qué así |
|---|---|
| `club_id` | Decisión 2: es del club. Sin `plantel_id` ni temporada. |
| `tipo` | Los diez de la decisión 4 más `'otro'`. Es `text` + `check` y no una tabla catálogo porque el tipo **decide reglas**: si lleva peso y si se combina. El cruce futuro va a buscar por tipo ("¿hay mancuerna de 12 kg?"), así que tiene que ser una clave fija, no texto libre. Pasar un material de "otro" a tipo propio (un chaleco lastrado, por ejemplo) es una migración, porque hay que decidir sus reglas. |
| `'otro'` | Nombre libre en `detalle`, obligatorio. Peso opcional: una valla no tiene peso, un chaleco lastrado sí. **Costo asumido:** el cruce futuro no puede razonar sobre un "otro", porque no sabe qué es. Sirve para contar lo que hay, no para decidir ejercicios. Si algo cargado como "otro" empieza a aparecer en los planes, eso indica que tiene que pasar a ser un tipo propio. |
| *(sin `tiene_peso`)* | Se deduce de `tipo`. Guardarlo aparte permitiría una mancuerna "sin peso"; los `check` de la tabla lo hacen imposible. Lo mismo con "se combina": es `tipo = 'disco'`, y lo va a leer el cruce futuro, no la tabla. |
| `peso_kg` | `numeric` sin escala, en kg, como `paso_fuerza.paso`: 1,25 y 2,5 son discos reales, y así el cruce futuro compara números del mismo tipo. Es el **peso de una unidad**, nunca del par (decisión 1). |
| `detalle` | Texto libre para lo que el tipo solo no dice. Cubre el número de las pelotas (decisión 4) sin una columna que sólo sirve para un tipo, y el nombre de los "otro". Es `not null default ''` para que el índice único no trate dos detalles vacíos como distintos. |
| `cantidad` | Unidades sueltas (decisión 1). Es `> 0`: una fila dice que algo **hay** (ver 4.3). |
| `creado_*`, `actualizado_*` | Decisión 7. `creado_*` con default, como `recurso` y `plan_fisico`. `actualizado_*` los sella un trigger, como en `paso_fuerza`, porque el default sólo actúa en el insert. |

**Una fila por variante.** El índice único impide tener "mancuerna 10 kg × 2" dos
veces: la segunda carga tiene que editar la cantidad de la primera. Con
`nulls not distinct` (Postgres 15+; el proyecto está en 17), dos conos sin peso y
sin detalle chocan en vez de pasar como distintos. `lower(detalle)` evita que
"EZ" y "ez" cuenten como dos barras.

**Trigger de sellado**, copia de `sellar_paso_fuerza`:

```sql
create function sellar_material()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.actualizado_por := auth.uid();
  new.actualizado_en := now();
  return new;
end;
$$;

create trigger material_sellar
  before insert or update on material
  for each row execute function sellar_material();
```

### 4.3 Lo que ya no se tiene se borra

Si se rompen las dos mancuernas de 10 kg, hay dos formas de registrarlo:

- **Borrar la fila** (la que propone este spec). La tabla dice sólo lo que hay
  hoy.
- **Archivarla:** dejarla con una marca de "ya no está" y la fecha, como se
  cierran las `asignacion_plantel`.

Se elige borrar por el uso futuro: para decidir si un ejercicio se puede hacer,
lo que importa es lo que hay **hoy**. Con filas archivadas, cada consulta
—la pantalla, el cruce con los ejercicios— tendría que acordarse de filtrarlas,
y la que se olvide diría "sí, hay mancuernas de 10" cuando ya no las hay. Borrar
hace imposible ese error.

Lo que se pierde es el registro de que alguna vez las hubo y de quién las quitó.
Es el mismo alcance que ya acepta la decisión 7, que guarda sólo el último
cambio. Si más adelante se quiere saber qué se rompió o se perdió en el año, se
suma una tabla de historial aparte, sin tocar esta.

---

## 5. Permisos

### 5.1 Quién lee y quién escribe

| | Entrenador | Coordinador | Otro club |
|---|---|---|---|
| Leer | sí | sí | no |
| Agregar, editar, quitar | **no** | sí | no |

**Lee todo el club.** El inventario no tiene ningún dato de menores, y el sentido
de tenerlo es que el profe sepa qué hay antes de armar una rutina. Es el mismo
criterio que `paso_fuerza_leer`: cualquier fila de `miembro_club` en ese club.

**Escribe el coordinador**, tenga o no además el rol de entrenador. No hay
exclusión de "a sí mismo" como en `asignacion_plantel`: allá existe para que el
coordinador no se dé acceso a datos individuales; acá no hay ningún acceso que
ganar.

### 5.2 Policies y grants

```sql
alter table material enable row level security;

create policy material_leer on material
  for select using (exists (
    select 1 from miembro_club m
    where m.club_id = material.club_id and m.user_id = auth.uid()));

create policy material_coordinador_agrega on material
  for insert with check (es_coordinador_de(material.club_id));

create policy material_coordinador_edita on material
  for update using (es_coordinador_de(material.club_id))
  with check (es_coordinador_de(material.club_id));

create policy material_coordinador_quita on material
  for delete using (es_coordinador_de(material.club_id));

-- Supabase concede ALL por defecto sobre tablas nuevas (ver 0017): se revoca
-- todo y se concede lo mínimo, por columna.
revoke all on material from anon, authenticated;
grant select, delete on material to authenticated;
grant insert (club_id, tipo, peso_kg, detalle, cantidad) on material to authenticated;
grant update (peso_kg, detalle, cantidad) on material to authenticated;
```

- **Insert por columna:** el cliente no puede mandar `creado_por`,
  `actualizado_*` ni `id`. Toman el default o los pisa el trigger.
- **Update sin `tipo` ni `club_id`:** una mancuerna no se convierte en disco. Si
  se cargó con el tipo equivocado, se quita y se carga de nuevo. `peso_kg` y
  `detalle` sí se editan: "era de 7,5, no de 5" es el error más probable.
- `es_coordinador_de` ya es `security definer` con `search_path = ''` y tiene
  `execute` sólo para `authenticated`. Se usa tal cual, sin tocarla.

### 5.3 ¿RPC? No

El criterio del esquema es usar una RPC sólo para escrituras de más de una fila
que tienen que ser atómicas (`importar_partido`, `asignar_planteles`); lo que
toca una fila va directo ("Cerrar una asignación es un update de una fila y va
directo, sin RPC", ESQUEMA.md). Acá cada operación toca exactamente una fila:

- **Agregar:** un insert. Si la variante ya existe, el índice único lo rechaza con
  `23505` y la pantalla ofrece editar la existente (6.2). No se hace un upsert
  que sume cantidades: sumar a ciegas es justo lo que infla un inventario.
- **Editar:** un update por `id`.
- **Quitar:** un delete por `id`.

No hay carga masiva en este alcance. Si más adelante hace falta cargar todo el
inventario inicial de una vez, eso sí sería una RPC.

---

## 6. Pantalla

### 6.1 Dónde vive: tercera pestaña de coordinación, "Inventario"

No va dentro de FÍSICO, por dos razones del código actual:

1. **Un coordinador puro nunca ve FÍSICO.** En modo coordinación, la navegación
   es `TABS_COORDINACION` (Panorama, Profes); FÍSICO está en `TABS`, que sólo ve
   quien entrena (`chrome.js`). Una sección "sólo para coordinador" dentro de
   FÍSICO quedaría fuera del alcance de quien tiene que usarla.
2. **FÍSICO es de una categoría.** Arriba está el chip de la categoría activa y
   todo lo que muestra depende de él. El inventario es del club (decisión 2), y
   mostrarlo bajo el chip de U17 sugiere que es de U17.

Quedaría:

```js
export const TABS_COORDINACION = [
  { id: 'p-coord-panorama',   texto: 'Panorama',   icono: ICONOS.datos },
  { id: 'p-coord-profes',     texto: 'Profes',     icono: ICONOS.plantel },
  { id: 'p-coord-inventario', texto: 'Inventario', icono: ICONOS.fisico },
];
```

Quien tiene los dos roles carga el inventario desde el modo Coordinar, con el
botón que ya existe en la cabecera.

### 6.2 La pantalla del coordinador

Lista agrupada. Primero va lo que tiene peso, que es lo que se va a cruzar con los
ejercicios, ordenado por peso dentro de cada tipo. "Otros" va al final, por
nombre:

```
┌─────────────────────────────────────┐
│ Inventario                          │
│ Newell's Old Boys                   │
├─────────────────────────────────────┤
│ CON PESO                            │
│                                     │
│ Mancuernas                          │
│   2,5 kg ............... 4 unid.  › │
│   5 kg ................. 6 unid.  › │
│   10 kg ................ 2 unid.  › │
│                                     │
│ Discos                              │
│   1,25 kg .............. 4 unid.  › │
│   5 kg ................. 8 unid.  › │
│                                     │
│ Barras                              │
│   10 kg · EZ ........... 1 unid.  › │
│   20 kg ................ 2 unid.  › │
│                                     │
│ SIN PESO                            │
│                                     │
│ Pelotas                             │
│   N° 7 ................ 15 unid.  › │
│   N° 6 ................ 10 unid.  › │
│ Conos ................. 20 unid.  › │
│ Escalerita ............. 2 unid.  › │
│                                     │
│ OTROS                               │
│   Chaleco lastrado · 5 kg 3 unid. › │
│   Vallas ............... 8 unid.  › │
│                                     │
│ Último cambio: Tomás A., 18/09      │
├─────────────────────────────────────┤
│        [ + Agregar material ]       │
└─────────────────────────────────────┘
```

- Cada fila abre la hoja de edición. Los tipos sin ninguna fila no se muestran.
- "Último cambio" es la fila con `actualizado_en` más reciente. El nombre sale de
  `nombres_del_club`, que ya usa la biblioteca de ejercicios.
- Estado vacío: *"Todavía no hay nada en el inventario. Agregá lo que tiene el
  club para que los profes sepan con qué cuentan."*, con el mismo botón.
- Sin totales de peso ni combinaciones de discos: eso es parte del cruce futuro.

**Alta** (hoja inferior):

```
┌─────────────────────────────────────┐
│ Agregar material                    │
│                                     │
│ Tipo                                │
│ (Mancuerna)(Disco)(Barra)           │
│ (Pesa rusa)(Balón medicinal)        │
│ (Pelota)(Cono)(Soga)(Escalerita)    │
│ (Banda)(Otro)                       │
│                                     │
│ Nombre                              │  ← sólo "Otro", obligatorio
│ [ Vallas  ]                         │
│                                     │
│ Peso de cada unidad (kg)            │  ← tipos con peso: obligatorio        
│ [ 10      ]                         │     otro: opcional
│                                     │
│ Detalle (opcional)                  │  ← tipos fijos; "Número" si es pelota
│ [         ]                         │
│                                     │
│ Cantidad (unidades sueltas)         │
│  [ − ]   2   [ + ]                  │
│                                     │
│ [ Cancelar ]         [ Guardar ]    │
└─────────────────────────────────────┘
```

- Los campos aparecen y desaparecen según el tipo. En "Otro", el campo
  "Nombre" ocupa el lugar de "Detalle": las dos cosas se guardan en `detalle`.
  Guardar valida al tocarlo, como el resto de las hojas: si falta el peso en un
  tipo con peso o el nombre en "Otro", lo dice con un aviso. El peso acepta
  coma decimal (2,5).
- Los rótulos dicen **"de cada unidad"** y **"unidades sueltas"** a propósito: es
  donde alguien cargaría "1 par de 10", y ahí mismo se corrige (decisión 1).
- Si la variante ya existe (se detecta antes de guardar, y si no, por el
  `23505`): *"Ya está en el inventario: Mancuernas · 10 kg (2 unid.). ¿Editar
  esa fila?"*, con un botón que abre esa fila para editarla.

**Edición** (misma hoja):

```
┌─────────────────────────────────────┐
│ Mancuerna                           │  ← el tipo no se edita
│                                     │
│ Peso de cada unidad (kg)            │
│ [ 10      ]                         │
│ Detalle (opcional)                  │
│ [         ]                         │
│ Cantidad (unidades sueltas)         │
│  [ − ]   2   [ + ]                  │
│                                     │
│ Modificado por Tomás A., 18/09      │
│                                     │
│ [ Quitar del inventario ]           │
│ [ Cancelar ]         [ Guardar ]    │
└─────────────────────────────────────┘
```

- El botón − no baja de 1: llegar a cero es "Quitar del inventario", que pide
  confirmación (*"¿Quitar las mancuernas de 10 kg del inventario?"*).

### 6.3 Lo que ve el profe

Ve la misma lista, **sin botón de agregar y sin hojas**, en una pantalla aparte.
Se llega con un enlace al pie de FÍSICO: *"Inventario del club"*, al lado de
cargar plan. No es una pestaña nueva: la navegación de entrenador ya tiene seis
pestañas a 375 px.

El enlace no depende de la categoría activa. El chip de categoría sigue arriba,
porque el chrome lo muestra en todo el modo entrenar, pero la lista no cambia
con él.
Se puede separar: si se quiere achicar la primera entrega, esta pantalla puede
salir después que la del coordinador, porque la RLS ya le permite leer al profe.

---

## 7. Qué se toca

| Archivo | Cambio |
|---|---|
| `supabase/migrations/0026_material.sql` | tabla, índices, trigger, policies y grants (secciones 4 y 5) |
| `tests/rollback0026.sql` | como los rollback existentes |
| `tests/verificarMaterial.sql` | los casos de la sección 8 |
| `src/data/repositorio.js` | `obtenerMaterial`, `agregarMaterial`, `editarMaterial`, `quitarMaterial` |
| `src/ui/chrome.js` | tercera entrada de `TABS_COORDINACION` |
| `src/ui/pantallas/inventario.js` | la pantalla en sus dos variantes (6.2 y 6.3) y las hojas |
| `src/ui/pantallas/fisico.js` | el enlace del pie (6.3) |
| `supabase/ESQUEMA.md` | sección de `material` y su fila en la tabla de RLS |

No se tocan `paso_fuerza`, `movimiento_escalon`, `escalon_actual`, el import del
plan físico ni `es_coordinador_de`.

---

## 8. Cómo se verifica

`tests/verificarMaterial.sql`, con usuarios sintéticos como
`verificarCoordinacion.sql`:

1. Un coordinador agrega, edita y quita una fila de su club.
2. Un entrenador (sin rol de coordinador) lee todas las filas y **no** puede
   agregar, editar ni quitar: cero filas afectadas o `42501`.
3. Un miembro de otro club no lee nada y no puede escribir con un `club_id`
   ajeno.
4. Una cuenta con los dos roles puede escribir.
5. Los `check` rechazan: una mancuerna sin peso, un cono con peso, un "otro" sin
   nombre, peso 0 y cantidad 0.
6. Un "otro" con peso y uno sin peso se aceptan.
7. Con el índice único: dos "mancuerna 10 kg" en el mismo club dan `23505`; dos
   conos sin detalle también; "otro · Vallas" y "otro · vallas" también.
8. Si el cliente manda `actualizado_por` de otra persona, queda el suyo.
9. El grant rechaza un update de `tipo`.

---

## 9. Afuera de este alcance

- El cruce con los ejercicios y con `paso_fuerza`, y cualquier aviso de material
  faltante.
- Responsable de custodia, préstamos, turnos y uso por categoría.
- Historial de cambios más allá del último (4.3).
- **Que alguien ayude al coordinador a cargar sin ser coordinador.** Hoy la
  única forma sería hacerlo coordinador por SQL, y eso también le da el poder de
  habilitar profes y asignar categorías. Si se quiere, es un permiso nuevo y se
  diseña aparte.
- Carga masiva inicial.

## 10. Tipos que se pueden sumar después

- **Pesa rusa y balón medicinal** entran desde esta migración, con peso
  obligatorio y sin combinarse, igual que las mancuernas. Van en la sección
  "Con peso" de la lista, cada uno con su grupo.
- **Si aparece otro material que se usa en los planes** (chaleco lastrado,
  por ejemplo), se suma como tipo en una migración: se agrega al `check` de
  `tipo`, se decide si lleva peso y si se combina, y se pasan a ese tipo las
  filas que se hayan cargado como "otro". Mientras tanto se carga como "otro".
