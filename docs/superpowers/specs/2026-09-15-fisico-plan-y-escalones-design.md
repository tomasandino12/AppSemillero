# Pantalla FÍSICO: ver el plan y manejar escalones

**Fecha:** 2026-09-15
**Estado:** para aprobar
**Depende de:** `0020_plan_fisico.sql`, `0021_rpc_importar_plan_fisico.sql`, la
pestaña FÍSICO (`src/ui/pantallas/fisico.js`) y el import de plan físico
(`planFisico.js`, que no se toca).

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

1. **La escalera de pesos es del ejercicio, no del jugador.** El profe define una
   progresión por ejercicio (press plano: 8/10/12/14 kg). Lo individual es en qué
   escalón está parado cada chico.
2. **Una escalera por ejercicio para todo el club** (no por categoría ni por
   plantel). El jugador conserva su escalón de por vida, sea cual sea su
   categoría o temporada: el mismo criterio que rige el resto del esquema, donde
   el jugador es del club y no de un plantel.
3. **El profe mueve a cada jugador con + y −, mirando su técnica.** La app no
   calcula, no sugiere y no propone ningún valor: sólo mueve al jugador entre los
   escalones que el profe escribió. Subir de peso es decisión de un adulto que
   está mirando, nunca automática.
4. **Video y escalera son atributos independientes.** Un ejercicio sin video
   puede tener escalera, y uno con video puede no tenerla.
5. **No hacen falta cuentas de jugador.** El jugador acá es un dato que carga el
   profe, igual que una medición de tiro. Cuando existan cuentas, lo que va a
   cambiar es quién pide el ajuste, no quién lo autoriza.

---

## 3. Las cinco preguntas, respondidas

| Pregunta | Respuesta | Sección |
|---|---|---|
| ¿Dónde vive la escalera? | En una tabla propia, `escalera_fuerza`, del club, identificada por el nombre normalizado del ejercicio. Ni en la biblioteca ni en la línea del plan. | 4 |
| ¿Qué pasa con `escalon_kg`? | Se elimina en 0023, con una guarda que aborta si alguna fila no está en NULL. | 5.4 |
| ¿De dónde salen los valores? | Primero de la app. El Excel, si hace falta, después y en su propio spec. | 6 |
| ¿Qué pasa con un plan nuevo? | El jugador conserva su escalón: no depende del plan. Cada movimiento queda guardado, así que se acumula historia. | 7 |
| ¿Cómo se ve el plan cargado? | Pantalla FÍSICO con el plan visible, sus sesiones y los otros planes; sesión con sus ejercicios; escalones de un ejercicio. | 9 y 10 |

---

## 4. Dónde vive la escalera

**En una tabla propia, `escalera_fuerza`: una fila por ejercicio del club, con su
`clave` (el nombre normalizado con `clavearNombre`) y la lista de pesos.**

Por qué no en los dos lugares candidatos:

- **No en `ejercicio_fuerza` (la biblioteca).** Esa tabla es el anexo de videos:
  sólo tiene fila un ejercicio que vino con link en la hoja "Ejercicios" o al que
  el profe le cargó uno. En el archivo real, 57 de las 135 líneas no tienen fila
  ahí. Para darles escalera habría que crearles una entrada sin link, y eso
  rompe lo que se fijó en el import: el buscador de videos oculta las entradas
  sin link, el resumen cuenta "con video" a las líneas con referencia a la
  biblioteca, y un ejercicio sin video es un ejercicio normal. Video y escalera
  son independientes (decisión 4); guardarlos en la misma fila los ata.
- **No en `ejercicio_asignado` (la línea del plan).** La línea nace de un import
  y se redefine con el siguiente. El profe define la escalera "una vez"
  (decisión 1); guardarla en la línea obligaría a reescribirla cada dos meses, y
  una misma progresión quedaría copiada en cada sesión donde aparece el
  ejercicio.

**Cómo se vincula una línea del plan con su escalera: por nombre normalizado
exacto.** `clavearNombre(ejercicio_asignado.nombre_original) === escalera_fuerza.clave`,
el mismo criterio que usa el matcheo de videos y la misma función. Sin parecidos:
"Press Plano", "Press Plano (Manc)" y "Press Plano Alternado" son tres escaleras
distintas, porque pueden ser tres movimientos distintos y ponerle a un chico el
peso de otro ejercicio es peor que no tener escalera.

La clave sale del **nombre de la línea**, no del video que tenga. Si al importar
el profe le eligió a "Cargada + Empuje" el video de "Cargada + Empuje (Barra)",
la escalera sigue siendo la de "Cargada + Empuje". Es la consecuencia directa de
que sean atributos independientes.

El vínculo se calcula en JavaScript al leer, no con una columna nueva en
`ejercicio_asignado`: agregarla obligaría a tocar el import (fuera de alcance) y
a duplicar `clavearNombre` en SQL, con el riesgo de que las dos normalizaciones
diverjan. Un plan tiene del orden de 135 líneas; resolverlo al leer no cuesta
nada.

---

## 5. Esquema — `0023_escalones_fuerza.sql`

### 5.1 `escalera_fuerza`

Una fila por ejercicio del club. `pesos` es un `numeric[]` estrictamente
creciente y no vacío: una escalera sin valores no es una fila.

- **`numeric` y no texto**, a diferencia de reps, carga y pausa del import.
  Aquellos son texto porque copian lo que dice el archivo ("5xL", "PC") y
  convertirlos fabricaría una precisión que el dato no tiene. Acá los valores
  los escribe el profe en la app, en kg, justamente para que + y − tengan un
  orden; son números por definición.
- **Array y no una fila por escalón:** la escalera se lee y se guarda entera, y
  así guardarla es escribir una sola fila (ver 5.6).
- **Sin historia de versiones de la escalera.** Lo que tiene historia es dónde
  estuvo cada chico (5.2), y esa historia guarda los kg absolutos: sigue siendo
  legible aunque la escalera cambie después.
- `actualizado_por` y `actualizado_en` los pone un trigger, no el cliente. Es la
  misma idea que el trigger de cierre de `asignacion_plantel` en 0017.

### 5.2 `movimiento_escalon`

**Solo se agregan filas.** Cada vez que el profe ubica, sube o baja a un chico se
agrega una fila con los kg donde quedó, cuándo y quién. No hay update ni delete:
un toque equivocado se corrige con el botón contrario, y los dos quedan en la
historia.

- **Guarda kg y no la posición en la escalera.** Si el profe corrige la escalera
  (cambia 12 por 12,5, o agrega un escalón intermedio), una posición guardada
  pasaría a apuntar a otro peso sin que nadie lo moviera. Los kg no.
- **Los kg no se validan en la base contra la escalera.** Sólo `kg > 0`. La
  escalera se puede editar después y la historia no debe romperse ni volverse
  inválida por eso. Que el valor salga de la escalera lo garantiza la app, que
  nunca manda un número que no leyó de ahí.
- FK compuestas `(club_id, jugador_id)` y `(club_id, escalera_id)`, como el resto
  del esquema: un movimiento no puede cruzar clubes.
- **El último movimiento lo define `orden`** (una identity), no `creado_en`.
  `now()` es la hora de inicio de la transacción: dos movimientos en la misma
  transacción empatan, y una que empezó antes puede terminar después. Se
  encontró al probar este SQL en el Docker local: con `creado_en` la vista
  devolvía el movimiento anterior. `creado_en` queda para mostrar la fecha.

### 5.3 `escalon_actual` (vista)

El escalón vigente de cada chico en cada escalera es su último movimiento.

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

La columna guarda un número por línea, o sea para todo el grupo, y una escalera
son varios valores por ejercicio para todo el club. No sirve como está y no hay
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

- **La escalera se lee por membresía al club y la escriben los entrenadores**,
  igual que `ejercicio_fuerza`. No tiene datos de ningún chico, así que el
  coordinador puede leerla (hoy no tiene pantalla que la muestre). Es de todo el
  club (decisión 2): cualquier entrenador del club la edita. Sin delete: una
  escalera con historia no se borra, y la FK de los movimientos lo impide igual.
- **El escalón de cada chico es un dato individual** y se protege como
  `medicion_corporal` (0016): lo lee y lo escribe un entrenador con asignación
  vigente a algún plantel donde el chico tiene pertenencia vigente. Por
  `puede_ver_plantel` / `puede_escribir_plantel`, que desde 0018 excluyen al
  coordinador: **coordinación nunca ve escalones individuales.**
- **Un chico citado a dos categorías tiene un solo escalón** (decisión 2) y
  aparece con ese mismo escalón en las dos listas. Lo pueden mover los profes de
  las dos.
- **Consecuencia aceptada:** la historia de un chico sin ninguna pertenencia
  vigente no la ve nadie desde la app, igual que sus mediciones corporales. No
  se pierde; vuelve a verse si se lo vuelve a sumar a un plantel.
- `creado_por` tiene que ser `auth.uid()`: nadie registra un movimiento a nombre
  de otro.
- Primero se revoca todo a `anon` y `authenticated` (Supabase concede ALL por
  defecto, ver 0017) y después se otorga sólo lo que alguna policy habilita. En
  `escalera_fuerza` el update se otorga **sólo sobre `pesos`**: la clave, el
  club y el nombre no se editan.

### 5.6 Sin RPC

Cada escritura toca una sola fila:

- ubicar, subir o bajar a un chico = un insert en `movimiento_escalon`;
- definir una escalera = un insert de una fila de `escalera_fuerza`; editarla =
  un update de `pesos` en esa fila. **No es un upsert:** el update está otorgado
  sólo sobre `pesos` (5.5), y el upsert de PostgREST reescribe todas las
  columnas que manda, así que chocaría con ese permiso.

No hay nada que tenga que entrar todo junto o nada, así que no hace falta una
RPC. Si más adelante aparece "subir a todos un escalón", eso sí escribe varias
filas y va con RPC (fuera de alcance, sección 13).

### 5.7 El SQL

Se muestra completo acá para aprobarlo; al implementarlo se vuelve a mostrar
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
  before update on escalera_fuerza
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

- **La escalera sobrevive a los planes y el archivo no.** El `.xlsx` llega cada
  dos meses; la escalera se define una vez (decisión 1). Si viniera en el
  archivo, cada import tendría que decidir qué hacer cuando el archivo dice otra
  cosa que lo guardado: ¿pisa lo que el profe ajustó en la app?, ¿avisa?, ¿se
  ignora? Esa regla es una decisión de producto que hoy no está tomada.
- **El parser está cerrado y la plantilla es del profe.** Una columna nueva
  obliga a reabrir `parserFisico.js` y a acordar con el cuerpo técnico un cambio
  en un archivo que hoy arma a su manera.
- **En la app se ve el efecto al escribir.** El editor muestra cómo queda la
  escalera y muestra si algún chico está en un peso que no queda en ella
  (sección 10.4). Desde el Excel eso
  recién aparecería al importar.

Si después conviene sumar el Excel, la tabla no cambia: sería otra forma de
escribir la misma fila de `escalera_fuerza`, y lo nuevo sería la regla de
conflicto.

---

## 7. Qué pasa cuando llega un plan nuevo

**El jugador conserva su escalón.** El escalón es de `(jugador, escalera)` y la
escalera es del club, no del plan: un plan nuevo no toca ninguna de las dos.

- **Se acumula historia.** Cada movimiento es una fila con fecha y autor; nada se
  reinicia con un import.
- **Un ejercicio que se repite** en el plan nuevo, con el mismo nombre
  normalizado, muestra su escalera y los escalones donde los chicos quedaron.
- **Un ejercicio que no está en el plan nuevo** no pierde nada: su escalera y los
  escalones siguen guardados y reaparecen el día que vuelva a un plan.
- **Un ejercicio renombrado en el archivo es otro ejercicio** ("Press Plano" →
  "Press Plano Manc"), con otra escalera y sin escalones. Es el mismo criterio
  exacto que los videos. Unir los dos nombres sería un alias, y queda fuera de
  alcance (sección 13).
- **Si la escalera cambia** entre un plan y otro, los chicos no se mueven solos:
  quedan en sus kg, y si ese valor ya no está en la escalera la fila lo dice
  como un dato ("este peso ya no está en la escalera actual") hasta que el
  profe los mueva (10.4).

---

## 8. Reglas del escalón

1. **Un chico sin escalón no tiene peso asignado**, y la app no le asigna uno.
   No arranca en el escalón más liviano por defecto: ubicarlo es un toque
   explícito del profe sobre un valor de la escalera (10.3). Decisión 3 y la
   regla de seguridad.
2. **+ lleva al valor inmediatamente superior de la escalera y − al inferior.**
   En el extremo, el botón correspondiente se ve deshabilitado (no desaparece:
   que no cambie la fila de lugar).
3. **Un peso que ya no está en la escalera:** si los kg actuales no están en la
   escalera (porque la escalera se editó), + lleva al menor valor mayor que los
   kg actuales y − al mayor valor menor. Si no hay, ese botón queda
   deshabilitado. **Se muestra como un dato, no como un error:** nadie hizo
   nada mal y el chico sigue en su peso. Va en el texto normal de la fila ("este
   peso ya no está en la escalera actual"), sin rojo, sin ícono de alerta y sin
   `.al`.
4. **Cada toque se guarda en el momento**, sin botón "guardar". Mientras se
   escribe, los botones de esa fila se deshabilitan; si falla, se avisa y la fila
   vuelve a lo que estaba.
5. **El cliente manda los kg de destino, no "+1".** Si dos profes mueven al mismo
   chico a la vez, gana el último y los dos movimientos quedan en la historia.
   Después de escribir, la fila muestra lo que devolvió la base.
6. **Ningún número propuesto por la app.** El editor de escalera arranca vacío y
   sin placeholder numérico (un "ej. 8, 10, 12" también es proponer valores). No
   hay pesos por defecto ni referencias por edad en ningún lado.

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
│ │ [ VER VIDEO ]   Escalera 20–40 kg │
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ 2 · Salto al cajón            › │ │
│ │ 3 series · 6 · pausa 60''       │ │
│ │ Sin escalera                    │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ■ FUERZA                            │
│ ┌─────────────────────────────────┐ │
│ │ 3 · Press Plano               › │ │
│ │ 4 series · 8 · Media            │ │
│ │ Escalera 8–14 kg                │ │
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
- **Escalera:** "Escalera 20–40 kg" (menor y mayor valor) o "Sin escalera".
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
│ ■ ESCALERA                          │
│ ┌─────────────────────────────────┐ │
│ │ 20 · 25 · 30 · 35 · 40 kg       │ │
│ │ [ EDITAR ESCALERA ]             │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ■ U17M · 14 JUGADORES               │
│ ┌─────────────────────────────────┐ │
│ │ DÍAZ, M.        [−] 22,5 kg [+] │ │
│ │ desde el 02/03 · este peso ya   │ │
│ │ no está en la escalera actual   │ │
│ ├─────────────────────────────────┤ │
│ │ GÓMEZ, L.       [−]  25 kg  [+] │ │
│ │ desde el 06/04                  │ │
│ ├─────────────────────────────────┤ │
│ │ PÉREZ, J.       [−]  40 kg  [+] │ │
│ │ desde el 09/03   (+ deshabilitado)│
│ ├─────────────────────────────────┤ │
│ │ ROSSI, T.   sin escalón [UBICAR]│ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

- **Jugadores:** los que tienen pertenencia vigente al plantel de la categoría
  activa, en orden alfabético, con `nombreCorto`. Un chico citado a dos
  categorías aparece en las dos con el mismo escalón.
- **Cada fila:** kg actuales entre − y +, y debajo desde cuándo está ahí (fecha
  del último movimiento). Reglas de + y − en la sección 8.
- **Sin escalón:** "sin escalón" y un botón "Ubicar" que abre una hoja con los
  valores de la escalera como botones ("Elegí el escalón donde está hoy"). Tocar
  un valor lo ubica.
- **Sin escalera:** en lugar de la escalera y la lista, "Este ejercicio todavía
  no tiene escalera" y el botón "Definir escalera". Sin escalera no hay nada que
  mover, así que la lista no aparece.

**Hoja "Escalera de Cargada + Empuje"** (definir o editar):

```
┌─────────────────────────────────────┐
│ ESCALERA DE CARGADA + EMPUJE        │
│ Es la misma para todo el club.      │
│                                     │
│ PESOS (KG)                          │
│ [ 20, 25, 30, 35, 40              ] │
│ De menor a mayor, separados por     │
│ espacio o por coma y espacio.       │
│                                     │
│ Queda: 20 · 25 · 30 · 35 · 40 kg    │
│                                     │
│ 1 jugador está en 22,5 kg, un peso  │
│ que no está en esta escalera. Sigue │
│ en ese peso; + y − lo llevan al     │
│ escalón más cercano.                │
│                                     │
│ [ GUARDAR ESCALERA ] [ CANCELAR ]   │
└─────────────────────────────────────┘
```

- **Arranca vacío** si no hay escalera, **sin placeholder numérico** (sección 8,
  regla 6). Si ya hay, arranca con sus valores.
- Separan el espacio, el punto y coma o la coma seguida de espacio. Una coma
  entre dos dígitos es decimal ("12,5"), así que "8,10" se lee 8,1 kg: por eso
  "Queda:" muestra cómo se leyó antes de guardar. Ordena y saca repetidos de lo
  que el profe escribió (son sus propios valores, no una sugerencia). Rechaza lo
  que no es un número o no es mayor que cero.
- "Es la misma para todo el club": editarla cambia lo que ven todas las
  categorías (decisión 2), y el profe tiene que saberlo antes de tocarla.
- **Chicos en un peso que no está en la escalera nueva:** se dice cuántos, de
  los de esta categoría (los que el profe puede ver), en texto normal y no como
  alerta: nadie hizo nada mal, siguen en su peso, y + y − los llevan al escalón
  más cercano. No impide guardar.

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
| `parsearPesos(texto)` | `{ error, pesos }`. Separan espacio, `;` o coma seguida de espacio; una coma entre dígitos es decimal; ordena, saca repetidos; error si hay algo que no es número o no es > 0, o si queda vacío. |
| `estadoDelEscalon(pesos, kg)` | `'sin'` (kg null), `'en'` (kg está en la escalera) o `'fuera'`. |
| `pasoDeEscalon(pesos, kg, direccion)` | kg de destino para + o −, o `null` si no hay. Con kg null devuelve `null`: no hay subir ni bajar sin ubicar antes. |
| `quedanFuera(pesosNuevos, escalones)` | Los chicos cuyos kg actuales no están en la escalera nueva, para el aviso. |
| `elegirPlanVisible(planes, hoy)` | La regla de la sección 9: `{ visible, estado, otros }`. |
| `escaleraDeLinea(nombreOriginal, escaleras)` | Busca por `clavearNombre` exacto. Importa `clavearNombre` de `parserCabb.js`, la misma fuente que el import. |

### 11.2 `repositorio.js` (sólo agregar)

| Función | Lectura / escritura |
|---|---|
| `obtenerPlanesFisicos(clubId, plantelId)` | Planes de la categoría con sus fechas de sesión, para la regla de la sección 9. |
| `obtenerPlanFisico(planId)` | Sesiones con sus líneas y, de cada línea, el `nombre` y `link` de su `ejercicio_fuerza` si tiene. |
| `obtenerEscaleras(clubId)` | Todas las escaleras del club. |
| `crearEscalera({ clubId, clave, nombre, pesos })` | Insert de la fila. |
| `editarEscalera(escaleraId, pesos)` | Update sólo de `pesos` (ver 5.6: no upsert). |
| `obtenerEscalonesActuales(escaleraId, jugadorIds)` | Desde `escalon_actual`. |
| `moverEscalon({ clubId, jugadorId, escaleraId, kg })` | Insert en `movimiento_escalon`; devuelve la fila. |

---

## 12. Verificación

- **Tests unitarios** de `escalones.js`, incluyendo: `pasoDeEscalon` sin escalón
  devuelve `null` (no hay ubicación implícita), extremos, valores fuera de la
  escalera, `parsearPesos` con coma decimal y con basura, y los tres casos más el
  empate de `elegirPlanVisible`.
- **Test de fuente:** el editor de escalera no tiene placeholder con dígitos.
- **`tests/verificarEscalones.sql`** contra el Docker local, como
  `verificarCoordinacion.sql`:
  - un entrenador asignado define una escalera, ubica, sube y lee el escalón
    actual;
  - dos movimientos seguidos en la misma transacción: el escalón actual es el
    segundo;
  - un entrenador de otro plantel no ve ni escribe escalones de ese chico;
  - un coordinador puro no ve filas de `movimiento_escalon` ni de
    `escalon_actual`, pero sí la escalera;
  - la base rechaza pesos no crecientes, vacíos o ≤ 0, kg ≤ 0, un `creado_por`
    ajeno, y cualquier update o delete de un movimiento;
  - un chico citado a dos categorías tiene un solo escalón, visible desde las dos;
  - `escalon_kg` ya no existe.
- **`tests/verificarImportarPlanFisico.js`** actualizado (5.4) y en verde.
- **`tests/rollback0023.sql`.**
- **Navegador a 375px y en escritorio**, con el plan real importado en el Docker
  local: los tres estados de FÍSICO, una sesión con y sin video, definir una
  escalera, ubicar, subir, bajar, un chico en un peso que ya no está en la escalera y el aviso de la
  hoja.
- **`npm test`** en verde.
- **Nada contra producción.** El SQL completo se muestra antes de `db push`.

---

## 13. Fuera de alcance

- **Cuentas de jugador**, y cualquier cosa que dependa de ellas (pedir un ajuste).
- **Pesos por defecto, sugerencias o normas por edad.** Los escalones los escribe
  el cuerpo técnico, siempre.
- **La escalera desde el Excel** (sección 6).
- **Unidades que no son kg** (bandas, peso corporal, tiempo).
- **Alias entre ejercicios renombrados** (sección 7).
- **Editar o borrar un movimiento.** Se corrige con otro movimiento.
- **Mover a varios chicos a la vez** ("subir a todos"). Escribiría varias filas y
  necesitaría RPC.
- **Una pantalla con la historia de un chico** (su progresión en el tiempo). La
  historia queda guardada desde el primer movimiento; mostrarla es otra etapa.
- **Resistencia y velocidad.**
- **Ponerle video a un ejercicio ya guardado** y **borrar un plan.**
