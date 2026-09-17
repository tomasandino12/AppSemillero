# Pantalla FÍSICO: ver el plan y manejar escalones

**Fecha:** 2026-09-15
**Estado:** para aprobar
**Depende de:** `0020_plan_fisico.sql`, `0021_rpc_importar_plan_fisico.sql`, la
pestaña FÍSICO (`src/ui/pantallas/fisico.js`) y el import de plan físico
(`planFisico.js`, que no se toca).

> **Corrección del 2026-09-16 — migración `0024_paso_fuerza.sql`.** La escalera
> (la lista de pesos válidos de un ejercicio) era la idea equivocada: el profe no
> trabaja con una lista, define **cuánto sube o baja por vez**. Donde este spec
> decía "escalera", ahora hay **un número por ejercicio, el escalón** (2 kg), y
> **un peso actual por jugador** (un número, no una posición dentro de una
> lista). No hay mínimo, no hay máximo, y el estado "fuera de la escalera" no
> existe más. Están reescritas con ese modelo las secciones 2, 3, 4, 5.1, 5.6, 6,
> 7, 8, 10.4, 11 y 12; el resto —el plan visible, la sesión, la RLS, el historial
> de movimientos, la vista `escalon_actual`— vale tal cual, y 5.7 queda como el
> SQL histórico de 0023. En la base y en el código la tabla se llama `paso_fuerza`
> y su columna, `paso`; en pantalla se lee siempre **"escalón"**, que es la
> palabra que usa el profe.

---

## 1. Qué resuelve

La pestaña FÍSICO hoy sólo importa: `fisico.js` pinta siempre el mismo estado
vacío, sin preguntarle a la base si la categoría ya tiene un plan. Esta etapa
suma dos cosas:

1. **Ver el plan cargado** de la categoría activa: sus sesiones, sus fechas, sus
   ejercicios y cuáles tienen video. El estado vacío pasa a ser un caso más.
2. **Manejar los escalones de peso por jugador**, que 0020 dejó explícitamente
   para después.

---

## 2. Decisiones dadas

Vienen del prompt y de la ronda de preguntas; el resto del documento se apoya en
ellas y no las reabre.

1. **El escalón es del ejercicio, el peso es del jugador.** El profe define por
   ejercicio de cuánto es el salto (press plano: 2 kg). Lo individual es con
   cuánto peso trabaja hoy cada chico.
2. **Un escalón por ejercicio para todo el club** (no por categoría ni por
   plantel). El jugador conserva su peso de por vida, sea cual sea su categoría o
   temporada: el mismo criterio que rige el resto del esquema, donde el jugador
   es del club y no de un plantel.
3. **El profe mueve a cada jugador con + y −, mirando su técnica.** La app no
   calcula, no sugiere y no propone ningún valor: + suma el escalón y − lo resta,
   y nada más. Subir de peso es decisión de un adulto que está mirando, nunca
   automática.
4. **Video y escalón son atributos independientes.** Un ejercicio sin video puede
   tener escalón, y uno con video puede no tenerlo.
5. **No hacen falta cuentas de jugador.** El jugador acá es un dato que carga el
   profe, igual que una medición de tiro. Cuando existan cuentas, lo que va a
   cambiar es quién pide el ajuste, no quién lo autoriza.

---

## 3. Las cinco preguntas, respondidas

| Pregunta | Respuesta | Sección |
|---|---|---|
| ¿Dónde vive el escalón? | En una tabla propia, `paso_fuerza`, del club, identificada por el nombre normalizado del ejercicio. Ni en la biblioteca ni en la línea del plan. | 4 |
| ¿Qué pasa con `escalon_kg`? | Se elimina en 0023, con una guarda que aborta si alguna fila no está en NULL. | 5.4 |
| ¿De dónde salen los valores? | Primero de la app. El Excel, si hace falta, después y en su propio spec. | 6 |
| ¿Qué pasa con un plan nuevo? | El jugador conserva su peso: no depende del plan. Cada movimiento queda guardado, así que se acumula historia. | 7 |
| ¿Cómo se ve el plan cargado? | Pantalla FÍSICO con el plan visible, sus sesiones y los otros planes; sesión con sus ejercicios; escalones de un ejercicio. | 9 y 10 |

---

## 4. Dónde vive el escalón

**En una tabla propia, `paso_fuerza`: una fila por ejercicio del club, con su
`clave` (el nombre normalizado con `clavearNombre`) y su escalón en kg.**

Por qué no en los dos lugares candidatos:

- **No en `ejercicio_fuerza` (la biblioteca).** Esa tabla es el anexo de videos:
  sólo tiene fila un ejercicio que vino con link en la hoja "Ejercicios" o al que
  el profe le cargó uno. En el archivo real, 57 de las 135 líneas no tienen fila
  ahí. Para darles escalón habría que crearles una entrada sin link, y eso
  rompe lo que se fijó en el import: el buscador de videos oculta las entradas
  sin link, el resumen cuenta "con video" a las líneas con referencia a la
  biblioteca, y un ejercicio sin video es un ejercicio normal. Video y escalón
  son independientes (decisión 4); guardarlos en la misma fila los ata.
- **No en `ejercicio_asignado` (la línea del plan).** La línea nace de un import
  y se redefine con el siguiente. El profe define el escalón "una vez"
  (decisión 1); guardarlo en la línea obligaría a reescribirlo cada dos meses, y
  el mismo número quedaría copiado en cada sesión donde aparece el ejercicio.

**Cómo se vincula una línea del plan con su escalón: por nombre normalizado
exacto.** `clavearNombre(ejercicio_asignado.nombre_original) === paso_fuerza.clave`,
el mismo criterio que usa el matcheo de videos y la misma función. Sin parecidos:
"Press Plano", "Press Plano (Manc)" y "Press Plano Alternado" son tres ejercicios
distintos, porque pueden ser tres movimientos distintos y ponerle a un chico el
peso de otro ejercicio es peor que no tener escalón.

La clave sale del **nombre de la línea**, no del video que tenga. Si al importar
el profe le eligió a "Cargada + Empuje" el video de "Cargada + Empuje (Barra)",
el escalón sigue siendo el de "Cargada + Empuje". Es la consecuencia directa de
que sean atributos independientes.

El vínculo se calcula en JavaScript al leer, no con una columna nueva en
`ejercicio_asignado`: agregarla obligaría a tocar el import (fuera de alcance) y
a duplicar `clavearNombre` en SQL, con el riesgo de que las dos normalizaciones
diverjan. Un plan tiene del orden de 135 líneas; resolverlo al leer no cuesta
nada.

---

## 5. Esquema — `0023_escalones_fuerza.sql`

### 5.1 `paso_fuerza`

Una fila por ejercicio del club, con `paso numeric check (paso > 0)`: cuántos kg
suma + y resta −.

- **`numeric` y no texto**, a diferencia de reps, carga y pausa del import.
  Aquellos son texto porque copian lo que dice el archivo ("5xL", "PC") y
  convertirlos fabricaría una precisión que el dato no tiene. Acá el número lo
  escribe el profe en la app, en kg, justamente para sumarlo y restarlo. Admite
  decimales: 2,5 kg es un escalón real.
- **`paso` admite nulo**, y no por descuido: es la fila del ejercicio con el
  escalón todavía sin definir. Como `movimiento_escalon.escalera_id` es
  `not null`, anotarle el peso a un chico exige que la fila exista; con `paso`
  nulo el peso se escribe igual y no hay + ni −.
- **Un número y no una lista:** no hay pesos válidos, así que no hay mínimo, ni
  máximo, ni el estado "este peso no está en la escalera".
- **Sin historia de versiones del escalón.** Lo que tiene historia es con cuánto
  peso trabajó cada chico (5.2), y esa historia guarda los kg absolutos: sigue
  siendo legible aunque el escalón cambie después.
- `actualizado_por` y `actualizado_en` los pone un trigger, no el cliente. Es la
  misma idea que el trigger de cierre de `asignacion_plantel` en 0017.

### 5.2 `movimiento_escalon`

**Solo se agregan filas.** Cada vez que el profe ubica, sube o baja a un chico se
agrega una fila con los kg donde quedó, cuándo y quién. No hay update ni delete:
un toque equivocado se corrige con el botón contrario, y los dos quedan en la
historia.

- **Guarda kg absolutos.** Es el peso con el que trabajó el chico ese día;
  cambiar después el escalón del ejercicio no reescribe nada de lo anotado.
- **Los kg no se validan en la base contra nada más que `kg > 0`.** El escalón se
  puede editar después y la historia no debe romperse ni volverse inválida por
  eso.
- FK compuestas `(club_id, jugador_id)` y `(club_id, escalera_id)`, como el resto
  del esquema: un movimiento no puede cruzar clubes.
- **El último movimiento lo define `orden`** (una identity), no `creado_en`.
  `now()` es la hora de inicio de la transacción: dos movimientos en la misma
  transacción empatan, y una que empezó antes puede terminar después. Se
  encontró al probar este SQL en el Docker local: con `creado_en` la vista
  devolvía el movimiento anterior. `creado_en` queda para mostrar la fecha.

### 5.3 `escalon_actual` (vista)

El peso vigente de cada chico en cada ejercicio es su último movimiento.

```sql
select distinct on (jugador_id, escalera_id) ...
order by jugador_id, escalera_id, orden desc
```

Vista y no una tabla de "estado actual" mantenida a mano: no hay dos fuentes que
se puedan desincronizar, y cada movimiento sigue siendo una sola escritura.
Vista y no una lectura de toda la historia en el cliente: PostgREST pagina a 1000
filas, y la historia de un club crece sin techo.

**`security_invoker = true`** (Postgres 15+, el proyecto está en 17): la vista
aplica la RLS de `movimiento_escalon` con los permisos de quien consulta. Sin eso
correría como su dueño y se saltearía las policies. Es la primera vista del
esquema; queda comentada en la migración por qué lleva esa opción.

### 5.4 `escalon_kg`: se elimina

La columna guarda un número por línea, o sea para todo el grupo, y lo que hace
falta es un peso por chico. No sirve como está y no hay
forma útil de reutilizarla. Dejarla sin uso es peor que sacarla: es una columna
que parece decir dónde va el peso y no lo dice.

- **Guarda:** la migración aborta si alguna fila tiene `escalon_kg` distinto de
  NULL. Hoy nunca se escribió (la RPC 0021 no la incluye en el insert), así que
  la guarda no debería saltar; si salta, hay que mirar antes de perder un dato.
- **0021 no se toca:** la RPC no nombra la columna en su insert, así que sigue
  funcionando.
- **Sí hay que actualizar `tests/verificarImportarPlanFisico.js`:** hoy hace
  `select ... escalon_kg` para comprobar que quedó en NULL. Con la columna
  eliminada, ese select falla. El chequeo pasa a ser que el payload con
  `escalonKg: 40` se importa igual y no deja rastro.
- **`parserFisico.js` no se toca:** sigue emitiendo `escalonKg: null` en cada
  ejercicio. Es un campo de JavaScript que nadie persiste; el parser está cerrado.
- `tests/rollback0023.sql` vuelve a agregar la columna (`numeric`, nula) además
  de sacar las tablas, la vista, el trigger y la función.

### 5.5 RLS y grants

Mismo modelo que el resto:

- **El escalón se lee por membresía al club y lo escriben los entrenadores**,
  igual que `ejercicio_fuerza`. No tiene datos de ningún chico, así que el
  coordinador puede leerlo (hoy no tiene pantalla que lo muestre). Es de todo el
  club (decisión 2): cualquier entrenador del club lo edita. Sin delete: un
  ejercicio con historia no se borra, y la FK de los movimientos lo impide igual.
- **El peso de cada chico es un dato individual** y se protege como
  `medicion_corporal` (0016): lo lee y lo escribe un entrenador con asignación
  vigente a algún plantel donde el chico tiene pertenencia vigente. Por
  `puede_ver_plantel` / `puede_escribir_plantel`, que desde 0018 excluyen al
  coordinador: **coordinación nunca ve pesos individuales.**
- **Un chico citado a dos categorías tiene un solo peso** (decisión 2) y aparece
  con ese mismo peso en las dos listas. Lo pueden mover los profes de las dos.
- **Consecuencia aceptada:** la historia de un chico sin ninguna pertenencia
  vigente no la ve nadie desde la app, igual que sus mediciones corporales. No
  se pierde; vuelve a verse si se lo vuelve a sumar a un plantel.
- `creado_por` tiene que ser `auth.uid()`: nadie registra un movimiento a nombre
  de otro.
- Primero se revoca todo a `anon` y `authenticated` (Supabase concede ALL por
  defecto, ver 0017) y después se otorga sólo lo que alguna policy habilita. En
  `paso_fuerza` el update se otorga **sólo sobre `paso`**: la clave, el club y
  el nombre no se editan.

### 5.6 Sin RPC

Cada escritura toca una sola fila:

- anotar, subir o bajar el peso de un chico = un insert en `movimiento_escalon`
  (más, la primera vez, el insert de la fila del ejercicio si todavía no existe);
- definir un escalón = un insert de una fila de `paso_fuerza`; editarlo = un
  update de `paso` en esa fila. **No es un upsert:** el update está otorgado
  sólo sobre `paso` (5.5), y el upsert de PostgREST reescribe todas las columnas
  que manda, así que chocaría con ese permiso.

No hay nada que tenga que entrar todo junto o nada, así que no hace falta una
RPC. Si más adelante aparece "subir a todos un escalón", eso sí escribe varias
filas y va con RPC (fuera de alcance, sección 13).

### 5.7 El SQL

**Histórico: es el SQL de 0023, tal como se aprobó.** La tabla que crea acá se
llama `escalera_fuerza` y tiene `pesos numeric[]`; `0024_paso_fuerza.sql` la
renombra a `paso_fuerza` y cambia esa columna por `paso`, sin tocar
`movimiento_escalon` ni `escalon_actual`. Se deja como está para que se lea de
dónde viene cada objeto.

Se mostró completo acá para aprobarlo; al implementarlo se volvió a mostrar
antes de `db push`, igual que siempre.

```sql
-- Etapa 7: escalones de peso por jugador.
-- Ver docs/superpowers/specs/2026-09-15-fisico-plan-y-escalones-design.md.

-- Pesos de una escalera: al menos uno, sin nulos, positivos, estrictamente
-- crecientes. Función aparte porque un CHECK no admite subconsultas.
create or replace function pesos_validos(p numeric[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p is not null
     and cardinality(p) >= 1
     and array_position(p, null) is null
     and not exists (
       select 1
       from unnest(p) with ordinality as x(v, i)
       -- ordinality es bigint y un subíndice de array tiene que ser integer.
       where v <= 0 or (i > 1 and v <= p[(i - 1)::int])
     );
$$;

-- Una escalera por ejercicio para todo el club. `clave` es clavearNombre del
-- nombre de la línea del plan: el mismo espacio de claves que ejercicio_fuerza,
-- pero tabla aparte porque video y escalera son independientes (spec, 4).
create table escalera_fuerza (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references club(id),
  clave text not null,
  -- Como lo escribió el archivo cuando se definió; sólo para mostrar.
  nombre text not null,
  -- numeric y no texto: los escribe el profe en la app, en kg, para que + y −
  -- tengan orden. Distinto de reps/carga/pausa del import, que copian el archivo.
  pesos numeric[] not null check (public.pesos_validos(pesos)),
  actualizado_por uuid not null default auth.uid() references auth.users(id),
  actualizado_en timestamptz not null default now(),
  unique (club_id, clave),
  unique (club_id, id)
);

create or replace function sellar_escalera_fuerza()
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

create trigger escalera_fuerza_sellar
  before insert or update on escalera_fuerza
  for each row execute function sellar_escalera_fuerza();

-- Dónde quedó un chico en una escalera, cada vez que el profe lo ubicó, subió o
-- bajó. Sólo se agrega: sin update ni delete. kg absolutos y no posición: si
-- la escalera cambia, la historia sigue diciendo lo mismo. No se valida contra
-- la escalera por la misma razón.
create table movimiento_escalon (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references club(id),
  jugador_id uuid not null,
  escalera_id uuid not null,
  kg numeric not null check (kg > 0),
  creado_por uuid not null default auth.uid() references auth.users(id),
  creado_en timestamptz not null default now(),
  -- Orden de llegada: define cuál es el último movimiento. creado_en no
  -- alcanza: now() es la hora de inicio de la transacción, así que dos
  -- movimientos de la misma transacción empatan, y una transacción que empezó
  -- antes puede terminar después.
  orden bigint generated always as identity,
  foreign key (club_id, jugador_id) references jugador (club_id, id),
  foreign key (club_id, escalera_id) references escalera_fuerza (club_id, id)
);

create index escalera_fuerza_club_id_idx on escalera_fuerza(club_id);
create index movimiento_escalon_ultimo_idx
  on movimiento_escalon (jugador_id, escalera_id, orden desc);
create index movimiento_escalon_escalera_id_idx on movimiento_escalon(escalera_id);

-- El escalón vigente = el último movimiento. security_invoker: la vista aplica
-- la RLS de movimiento_escalon con los permisos de quien consulta; sin esto
-- correría como su dueño y se saltearía las policies. Primera vista del esquema.
create view escalon_actual
with (security_invoker = true) as
  select distinct on (jugador_id, escalera_id)
    club_id, jugador_id, escalera_id, kg, creado_por, creado_en
  from movimiento_escalon
  order by jugador_id, escalera_id, orden desc;

-- escalon_kg (0020) guardaba un número por línea, para todo el grupo: no sirve
-- para una escalera por jugador. Nunca se escribió; si alguna fila tiene valor,
-- se frena para mirar antes de perderlo.
do $$
begin
  if exists (select 1 from public.ejercicio_asignado where escalon_kg is not null) then
    raise exception 'ejercicio_asignado.escalon_kg tiene valores: revisar antes de eliminar la columna';
  end if;
end;
$$;

alter table ejercicio_asignado drop column escalon_kg;


/* ---------- RLS ---------- */

alter table escalera_fuerza enable row level security;
alter table movimiento_escalon enable row level security;

-- La escalera es del club y no tiene datos de ningún chico: la lee cualquier
-- miembro y la escriben los entrenadores, igual que ejercicio_fuerza (0020).
create policy escalera_fuerza_leer on escalera_fuerza
  for select using (exists (
    select 1 from miembro_club m
    where m.club_id = escalera_fuerza.club_id and m.user_id = auth.uid()));
create policy escalera_fuerza_crear on escalera_fuerza
  for insert with check (exists (
    select 1 from miembro_club m
    where m.club_id = escalera_fuerza.club_id and m.user_id = auth.uid()
      and m.es_entrenador));
create policy escalera_fuerza_editar on escalera_fuerza
  for update using (exists (
    select 1 from miembro_club m
    where m.club_id = escalera_fuerza.club_id and m.user_id = auth.uid()
      and m.es_entrenador))
  with check (exists (
    select 1 from miembro_club m
    where m.club_id = escalera_fuerza.club_id and m.user_id = auth.uid()
      and m.es_entrenador));

-- El escalón de un chico es un dato individual: como medicion_corporal (0016),
-- por pertenencia vigente y plantel asignado. Las funciones de 0018 excluyen al
-- coordinador.
create policy movimiento_escalon_ver on movimiento_escalon
  for select using (exists (
    select 1 from pertenencia pe
    where pe.jugador_id = movimiento_escalon.jugador_id and pe.hasta is null
      and puede_ver_plantel(pe.plantel_id)));
create policy movimiento_escalon_crear on movimiento_escalon
  for insert with check (
    movimiento_escalon.creado_por = auth.uid()
    and exists (
      select 1 from pertenencia pe
      where pe.jugador_id = movimiento_escalon.jugador_id and pe.hasta is null
        and puede_escribir_plantel(pe.plantel_id)));

revoke all on escalera_fuerza, movimiento_escalon, escalon_actual from anon, authenticated;
grant select, insert on escalera_fuerza to authenticated;
grant update (pesos) on escalera_fuerza to authenticated;
grant select, insert on movimiento_escalon to authenticated;
grant select on escalon_actual to authenticated;
revoke execute on function pesos_validos(numeric[]) from public, anon;
revoke execute on function sellar_escalera_fuerza() from public, anon, authenticated;
```

---

## 6. De dónde salen los valores: la app primero

**Esta etapa los carga en la app.** El Excel queda como posibilidad para después,
con su propio spec.

Por qué la app primero:

- **El escalón sobrevive a los planes y el archivo no.** El `.xlsx` llega cada
  dos meses; el escalón se define una vez (decisión 1). Si viniera en el
  archivo, cada import tendría que decidir qué hacer cuando el archivo dice otra
  cosa que lo guardado: ¿pisa lo que el profe ajustó en la app?, ¿avisa?, ¿se
  ignora? Esa regla es una decisión de producto que hoy no está tomada.
- **El parser está cerrado y la plantilla es del profe.** Una columna nueva
  obliga a reabrir `parserFisico.js` y a acordar con el cuerpo técnico un cambio
  en un archivo que hoy arma a su manera.
- **En la app se ve el efecto al escribir.** Definido el escalón, las filas de
  los chicos muestran enseguida a qué peso llevan + y −. Desde el Excel eso
  recién aparecería al importar.

Si después conviene sumar el Excel, la tabla no cambia: sería otra forma de
escribir la misma fila de `paso_fuerza`, y lo nuevo sería la regla de conflicto.

---

## 7. Qué pasa cuando llega un plan nuevo

**El jugador conserva su peso.** El peso es de `(jugador, ejercicio)` y el
ejercicio es del club, no del plan: un plan nuevo no toca ninguno de los dos.

- **Se acumula historia.** Cada movimiento es una fila con fecha y autor; nada se
  reinicia con un import.
- **Un ejercicio que se repite** en el plan nuevo, con el mismo nombre
  normalizado, muestra su escalón y los pesos donde los chicos quedaron.
- **Un ejercicio que no está en el plan nuevo** no pierde nada: su escalón y los
  pesos siguen guardados y reaparecen el día que vuelva a un plan.
- **Un ejercicio renombrado en el archivo es otro ejercicio** ("Press Plano" →
  "Press Plano Manc"), con otro escalón y sin pesos. Es el mismo criterio exacto
  que los videos. Unir los dos nombres sería un alias, y queda fuera de alcance
  (sección 13).
- **Si el escalón cambia** entre un plan y otro, los chicos no se mueven solos:
  quedan en sus kg, y el escalón nuevo rige desde el próximo + o −.

---

## 8. Reglas del escalón

1. **Un chico sin peso no tiene peso asignado**, y la app no le asigna uno. No
   arranca en un peso liviano por defecto: el profe escribe el número (10.4).
   Decisión 3 y la regla de seguridad.
2. **+ suma el escalón al peso actual y − lo resta.** Nada más: no hay mínimo ni
   máximo. + nunca se apaga; − se apaga sólo cuando restar daría cero o menos,
   que no es un peso (no desaparece, para que la fila no cambie de lugar). Ese
   piso no es inventado: es el mismo `kg > 0` que exige la base.
3. **Se puede anotar el peso de un chico aunque el ejercicio todavía no tenga
   escalón.** En ese caso la fila muestra el peso y no muestra + ni −: el profe
   todavía no dijo de a cuánto se mueve.
4. **El peso también se corrige escribiéndolo.** El número de la fila es un
   botón: abre la misma hoja, con el valor actual. Un peso mal anotado se arregla
   ahí, sin ir sumando y restando escalones hasta llegar.
5. **Cada toque se guarda en el momento**, sin botón "guardar". Mientras se
   escribe, los botones de esa fila se deshabilitan; si falla, se avisa y la fila
   vuelve a lo que estaba.
6. **El cliente manda los kg de destino, no "+1".** Si dos profes mueven al mismo
   chico a la vez, gana el último y los dos movimientos quedan en la historia.
   Después de escribir, la fila muestra lo que devolvió la base.
7. **Ningún número inventado por la app.** El editor del escalón arranca vacío,
   las dos hojas van sin placeholder numérico (un "ej. 2,5" también es proponer
   valores) y no hay pesos por defecto ni referencias por edad en ningún lado.
   La única excepción, y no es un invento de la app: **el primer peso de un chico
   arranca con el número de la carga sugerida de esa línea**, que el archivo ya
   escribió en kg ("Barra Ol + 10 kg" → 10). Es el valor de arranque de un campo
   que el profe confirma o cambia antes de guardar; si la carga no trae un número
   pegado a "kg" ("PC", "Fallo", "Manc 10"), el campo arranca vacío.

---

## 9. Qué plan se muestra

Una categoría acumula un plan cada dos meses. El **rango** de un plan va de su
primera a su última fecha de sesión. "Hoy" es la fecha local del dispositivo, no
UTC (mismo criterio que la fecha del import de partido).

1. **En curso:** el plan cuyo rango contiene hoy.
2. **Si no hay, el próximo:** el de fecha de inicio más cercana después de hoy
   (el profe cargó el plan que viene antes de que empiece).
3. **Si tampoco, el último:** el de fecha de fin más reciente.

Si dos planes empatan (dos archivos distintos para el mismo período), se muestra
el importado más recientemente (`creado_en`). Los demás planes de la categoría
quedan en "Otros planes", con su rango, y se abren igual.

---

## 10. Pantallas

Todas reusan lo que ya existe (`.tarj`, `.jug`, `.jug-fila`, `.fila-menor`,
`.eyebrow`, `.al`, `.pie-fijo`, `.btn`, la hoja de `hoja.js`). CSS nuevo sólo si
algo no existe; los breakpoints, en `layout.css`. Todo lo táctil a 44px y nada
que dependa de hover. Wireframes a 375px.

### 10.1 FÍSICO (`p-fisico`), con plan

```
┌─────────────────────────────────────┐
│ [escudo]  FÍSICO               (NA) │
│ [U17M] [U21M]                       │
├─────────────────────────────────────┤
│ ■ PLAN DE FUERZA                    │
│ ┌─────────────────────────────────┐ │
│ │ Físico.xlsx                     │ │
│ │ 02/03 al 27/04 · 17 sesiones    │ │
│ │ En curso                        │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ■ PRÓXIMA SESIÓN                    │
│ ┌─────────────────────────────────┐ │
│ │ Hoy · lun 06/04               › │ │
│ │ 8 ejercicios · Potencia, Fuerza │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ■ SESIONES                          │
│ ┌─────────────────────────────────┐ │
│ │ lun 02/03   8 ejercicios      › │ │
│ │ jue 05/03   7 ejercicios      › │ │
│ │ lun 09/03   8 ejercicios      › │ │
│ │ …                               │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ■ OTROS PLANES                      │
│ ┌─────────────────────────────────┐ │
│ │ Físico-mayo.xlsx                │ │
│ │ 04/05 al 29/06 · Empieza el 04/05 ›│
│ └─────────────────────────────────┘ │
├─────────────────────────────────────┤
│ [    CARGAR PLAN DE FUERZA    ]     │
└─────────────────────────────────────┘
```

- El estado del plan dice "En curso", "Empieza el 04/05" o "Terminó el 27/04".
- **Próxima sesión:** la primera con fecha igual o posterior a hoy ("Hoy · …" si
  es hoy). Si el plan ya terminó, este bloque no aparece.
- **Sesiones:** todas, en orden de fecha, con día de la semana derivado de la
  fecha. Los bloques de cada sesión, en el orden en que aparecen.
- Tocar un plan de "Otros planes" lo muestra en lugar del visible; el visible
  pasa a esa lista. No se guarda como preferencia: al volver a entrar se aplica
  otra vez la regla de la sección 9.
- **Cambiar el chip de categoría** vuelve a leer y aplica la regla para esa
  categoría.
- "Cargar plan de fuerza" abre el import de siempre, que al terminar vuelve acá
  y ya muestra el plan nuevo.

### 10.2 FÍSICO, sin plan y cargando

- **Sin plan:** el estado vacío de hoy ("Plan de fuerza", texto y el mismo
  botón). Ahora aparece sólo si la categoría no tiene ningún plan.
- **Cargando:** "Cargando el plan…".
- **Error de red:** el mensaje de `esErrorDeRed` y el botón de cargar igual
  disponible.

### 10.3 Sesión (`p-fisico-sesion`)

Se llega tocando una sesión. Título "Sesión"; volver lleva a FÍSICO.

```
┌─────────────────────────────────────┐
│ [escudo] ‹  SESIÓN             (NA) │
│ [U17M] [U21M]                       │
├─────────────────────────────────────┤
│ Lunes 06/04 · Físico.xlsx           │
│                                     │
│ ■ POTENCIA                          │
│ ┌─────────────────────────────────┐ │
│ │ 1 · Cargada + Empuje          › │ │
│ │ 4 series · 5xL · PC · pausa 90''│ │
│ │ Bajar controlado                │ │
│ │ [ VER VIDEO ]     Escalón 2,5 kg│ │
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ 2 · Salto al cajón            › │ │
│ │ 3 series · 6 · pausa 60''       │ │
│ │ Sin escalón                     │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ■ FUERZA                            │
│ ┌─────────────────────────────────┐ │
│ │ 3 · Press Plano               › │ │
│ │ 4 series · 8 · Media            │ │
│ │ Escalón 2 kg                    │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

- Agrupado por bloque, en el orden del archivo. Nombre tal cual lo trae la línea
  (`nombre_original`).
- Series, reps, carga sugerida, pausa y notas **como texto, tal cual**; lo que
  falta no se muestra (nada de "—").
- **"Ver video"** sólo si la línea tiene video (link de su `ejercicio_fuerza`).
  Abre el link en una pestaña nueva. **Sin video no se dice nada:** es el estado
  normal.
- **Escalón:** "Escalón 2,5 kg" o "Sin escalón".
- Tocar la tarjeta (fuera de "Ver video") lleva a los escalones de ese ejercicio.

### 10.4 Escalones de un ejercicio (`p-fisico-escalones`)

Se llega desde una línea de la sesión. Título "Escalones".

```
┌─────────────────────────────────────┐
│ [escudo] ‹  ESCALONES          (NA) │
│ [U17M] [U21M]                       │
├─────────────────────────────────────┤
│ Cargada + Empuje                    │
│ En esta sesión: 4 series · 5xL · PC │
│                                     │
│ ■ ESCALÓN                           │
│ ┌─────────────────────────────────┐ │
│ │ 2,5 kg cada vez que subís o     │ │
│ │ bajás. Es el mismo para todo el │ │
│ │ club.            [ EDITAR ESCALÓN ]│
│ └─────────────────────────────────┘ │
│                                     │
│ ■ U17M · 14 JUGADORES               │
│ ┌─────────────────────────────────┐ │
│ │ DÍAZ, M.        [−] 22,5 kg [+] │ │
│ │ desde el 02/03                  │ │
│ ├─────────────────────────────────┤ │
│ │ GÓMEZ, L.       [−]  25 kg  [+] │ │
│ │ desde el 06/04                  │ │
│ ├─────────────────────────────────┤ │
│ │ PÉREZ, J.       [−]   2 kg  [+] │ │
│ │ desde el 09/03   (− deshabilitado)│
│ ├─────────────────────────────────┤ │
│ │ ROSSI, T.  sin peso [PONER PESO]│ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

- **Jugadores:** los que tienen pertenencia vigente al plantel de la categoría
  activa, en orden alfabético, con `nombreCorto`. Un chico citado a dos
  categorías aparece en las dos con el mismo peso.
- **Cada fila:** los kg actuales entre − y +, y debajo desde cuándo está ahí
  (fecha del último movimiento). Reglas de + y − en la sección 8. El número de
  kg es un botón: abre la hoja del peso con el valor actual.
- **Sin peso:** "sin peso" y un botón "Poner peso", que abre la misma hoja
  vacía.
- **Sin escalón definido:** la tarjeta dice "Todavía no tiene escalón. Podés
  anotar el peso de cada chico igual." y el botón dice "Definir escalón". **La
  lista de jugadores aparece igual**, con sus pesos, y sin + ni −.

**Hoja "Peso de Díaz, M."** (poner o corregir):

```
┌─────────────────────────────────────┐
│ PESO DE DÍAZ, M.                    │
│ El peso con el que trabaja hoy en   │
│ este ejercicio.                     │
│                                     │
│ PESO (KG)                           │
│ [ 22,5                            ] │
│                                     │
│ [ GUARDAR PESO ] [ CANCELAR ]       │
└─────────────────────────────────────┘
```

**Hoja "Escalón de Cargada + Empuje"** (definir o editar):

```
┌─────────────────────────────────────┐
│ ESCALÓN DE CARGADA + EMPUJE         │
│ Cuánto suma + y cuánto resta −. Es  │
│ el mismo para todo el club.         │
│                                     │
│ ESCALÓN (KG)                        │
│ [ 2,5                             ] │
│                                     │
│ [ GUARDAR ESCALÓN ] [ CANCELAR ]    │
└─────────────────────────────────────┘
```

- Las dos hojas van **sin placeholder numérico** (sección 8, regla 7) y
  arrancan con el valor guardado si lo hay. Si el chico **todavía no tiene
  peso**, la hoja del peso arranca con el número de la carga sugerida de la
  línea (`pesoSugeridoDeCarga`), seleccionado para que tipear lo reemplace; sin
  número pegado a "kg", vacía. Un peso ya guardado nunca se pisa con la
  sugerencia.
- **Un solo número**, con coma decimal ("12,5"), el mismo criterio de siempre.
  Rechaza lo que no es un número y lo que no es mayor que cero, con el error
  debajo del campo.
- "Es el mismo para todo el club": editar el escalón cambia lo que ven todas las
  categorías (decisión 2), y el profe tiene que saberlo antes de tocarlo.
- Cambiar el escalón **no mueve a nadie**: los chicos siguen en sus kg y el
  número nuevo rige desde el próximo + o −.

### 10.5 Navegación

- `p-fisico-sesion` y `p-fisico-escalones` se abren con `ir(..., { push: true })`:
  la flecha del chrome vuelve de escalones a sesión y de sesión a FÍSICO.
- Registradas en `registro.js`, con su sección en `index.html`.
- Tocar un chip de categoría en sesión o escalones vuelve a FÍSICO de esa
  categoría: la sesión que se estaba viendo es de otro plantel.
- Coordinación no llega: FÍSICO no está en `TABS_COORDINACION`, y aunque llegara,
  la RLS no le devuelve escalones.

---

## 11. Capa de datos

### 11.1 Funciones puras — `src/data/escalones.js`

Sin red ni DOM, con tests en `tests/escalones.test.js`:

| Función | Qué hace |
|---|---|
| `parsearPeso(texto)` | `{ error, kg }`. Un solo número; una coma entre dígitos es decimal; error si no es un número, si no es > 0 o si está vacío. Sirve para el peso de un chico y para el escalón de un ejercicio. |
| `pesoSugeridoDeCarga(cargaSugerida)` | El número pegado a "kg" en la carga de la línea ("Barra Ol + 10 kg", "Manc. 10kg (x2)" → 10), o `null` si no hay ninguno ("PC", "5xL", "Manc 10"). Sólo para el valor de arranque del campo. |
| `nuevoPeso(kg, paso, direccion)` | kg de destino para + o −, o `null` si no hay adónde ir: sin peso, sin escalón, o si restar daría cero o menos. |
| `elegirPlanVisible(planes, hoy)` | La regla de la sección 9: `{ visible, estado, otros }`. |
| `pasoDeLinea(nombreOriginal, pasos)` | Busca por `clavearNombre` exacto. Importa `clavearNombre` de `parserCabb.js`, la misma fuente que el import. |

### 11.2 `repositorio.js` (sólo agregar)

| Función | Lectura / escritura |
|---|---|
| `obtenerPlanesFisicos(clubId, plantelId)` | Planes de la categoría con sus fechas de sesión, para la regla de la sección 9. |
| `obtenerPlanFisico(planId)` | Sesiones con sus líneas y, de cada línea, el `nombre` y `link` de su `ejercicio_fuerza` si tiene. |
| `obtenerPasos(clubId)` | Todos los escalones del club. `paso` nulo es "sin definir". |
| `crearPaso({ clubId, clave, nombre, paso })` | Insert de la fila; `paso` puede ir nulo (5.1). |
| `editarPaso(pasoId, paso)` | Update sólo de `paso` (ver 5.6: no upsert). |
| `obtenerEscalonesActuales(pasoId, jugadorIds)` | Desde `escalon_actual`. |
| `moverEscalon({ clubId, jugadorId, pasoId, kg })` | Insert en `movimiento_escalon`; devuelve la fila. La columna sigue llamándose `escalera_id` (0024). |

---

## 12. Verificación

- **Tests unitarios** de `escalones.js`, incluyendo: `nuevoPeso` sin peso o sin
  escalón devuelve `null` (no hay + ni − implícitos), no baja a cero ni a
  negativo, no tiene techo y redondea las colas del punto flotante;
  `parsearPeso` con coma decimal y con basura; `pesoSugeridoDeCarga` con y sin
  match, con coma decimal y con texto adelante; y los tres casos más el empate de
  `elegirPlanVisible`.
- **Tests de fuente:** ni la hoja del peso ni la del escalón tienen placeholder
  con dígitos; la palabra "escalera" no quedó en ningún lado; − se apaga sólo
  por `nuevoPeso(...) == null`.
- **`tests/verificarEscalones.sql`** contra el Docker local, como
  `verificarCoordinacion.sql`:
  - un entrenador asignado define el escalón, anota un peso, sube y lee el peso
    actual;
  - dos movimientos seguidos en la misma transacción: el peso actual es el
    segundo;
  - una fila con `paso` nulo acepta movimientos igual (anotar sin escalón);
  - un entrenador de otro plantel no ve ni escribe pesos de ese chico;
  - un coordinador puro no ve filas de `movimiento_escalon` ni de
    `escalon_actual`, pero sí el escalón;
  - la base rechaza `paso` ≤ 0, kg ≤ 0, un `creado_por` ajeno, y cualquier
    update o delete de un movimiento;
  - un chico citado a dos categorías tiene un solo peso, visible desde las dos;
  - `escalon_kg` ya no existe y `pesos_validos` tampoco.
- **`tests/verificarImportarPlanFisico.js`** actualizado (5.4) y en verde.
- **`tests/rollback0023.sql`** y **`tests/rollback0024.sql`.**
- **Navegador a 375px y en escritorio**, con el plan real importado en el Docker
  local: los tres estados de FÍSICO, una sesión con y sin video, anotar un peso
  sin escalón definido, definir el escalón, subir, bajar, − apagado cerca de
  cero, corregir el peso escribiéndolo y un escalón con decimales.
- **`npm test`** en verde.
- **Nada contra producción.** El SQL completo se muestra antes de `db push`.

---

## 13. Fuera de alcance

- **Cuentas de jugador**, y cualquier cosa que dependa de ellas (pedir un ajuste).
- **Pesos por defecto, sugerencias o normas por edad.** Los pesos y los escalones
  los escribe el cuerpo técnico, siempre.
- **El escalón desde el Excel** (sección 6).
- **Unidades que no son kg** (bandas, peso corporal, tiempo).
- **Alias entre ejercicios renombrados** (sección 7).
- **Editar o borrar un movimiento.** Se corrige con otro movimiento.
- **Mover a varios chicos a la vez** ("subir a todos"). Escribiría varias filas y
  necesitaría RPC.
- **Una pantalla con la historia de un chico** (su progresión en el tiempo). La
  historia queda guardada desde el primer movimiento; mostrarla es otra etapa.
- **Resistencia y velocidad.**
- **Ponerle video a un ejercicio ya guardado** y **borrar un plan.**
