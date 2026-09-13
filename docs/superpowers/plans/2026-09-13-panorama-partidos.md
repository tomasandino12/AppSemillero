# Panorama con tiro en partidos — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que el Panorama de coordinación muestre, por categoría, triples y libres de batería **y** de partidos lado a lado, con el detalle colapsado y el número principal destacado.

**Architecture:** una migración (`0022`) extiende `panorama_del_club` con una lista de partidos con tiros sumados; dos funciones puras nuevas en `estadisticas.js` y la forma nueva de `armarPanorama` en `coordinacion.js`; `coordPanorama.js` reescribe la tarjeta con resumen de dos fuentes y un `<details>` nativo.

**Tech Stack:** Postgres/Supabase (plpgsql, security definer), HTML/CSS/JS vanilla, `node:test`.

**Spec:** `docs/superpowers/specs/2026-09-13-panorama-partidos-design.md`

## Global Constraints

- **Migraciones:** sólo nuevas. Todo se aplica en el **Docker local** (`npx supabase migration up`, nunca `--linked`); a producción lo sube Tomás.
- **Parada obligatoria** al terminar la Tarea 1: mostrar a Tomás el SQL completo de `0022` antes de seguir.
- **`variacion.js` no se toca.**
- La base devuelve **sólo sumas**; porcentaje, umbral (`UMBRAL_INTENTOS`) y margen (`compararPorcentajes`, Agresti-Caffo al 95%) se calculan en `estadisticas.js`.
- Batería y partido **nunca** se suman, promedian ni restan.
- Ningún ranking, promedio del club ni comparación entre categorías; orden de catálogo.
- `tests/coordinacionSinDatosIndividuales.test.js` tiene que seguir pasando sin cambios.
- Número principal: `--rojo` fijo, igual para todas las tarjetas, fuentes y valores.
- Táctil: `summary` de 44px (`--tap`), nada depende de `hover`. Breakpoints sólo en `layout.css`.
- Sin dependencias nuevas. `npm test` completo en verde, incluido `importsResueltos`.

---

## Mapa de archivos

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `supabase/migrations/0022_panorama_partidos.sql` | crear | `panorama_del_club` con la clave `partidos` |
| `tests/rollback0022.sql` | crear | vuelve `panorama_del_club` a su forma de 0017 |
| `tests/verificarCoordinacion.sql` | modificar | caso 9: sumas por partido; caso 10: el partido nuevo |
| `src/data/estadisticas.js` | modificar | `serieDePartidosAgregada`, `ejeComun` |
| `src/ui/pantallas/fichaJugador.js` | modificar | importa `ejeComun` (sin cambio visible) |
| `tests/estadisticas.test.js` | modificar | casos nuevos |
| `src/data/coordinacion.js` | modificar | forma `bateria`/`partido`, `textoSinDatos`, `hayAlgoParaMostrar` |
| `tests/coordinacion.test.js` | modificar | forma nueva y estados vacíos |
| `src/ui/pantallas/coordPanorama.js` | modificar | resumen de dos fuentes, `<details>`, gráfico y tablas |
| `public/css/componentes.css` | modificar | fuente, número, summary, `.panorama{align-items:start}` |
| `supabase/ESQUEMA.md`, `docs/COORDINACION.md` | modificar | la clave nueva y el orden de despliegue |

---

### Tarea 1: Migración 0022 y su verificación

**Riesgo alto. Al terminar, PARAR y mostrar el SQL completo.**

**Files:**
- Create: `supabase/migrations/0022_panorama_partidos.sql`
- Create: `tests/rollback0022.sql`
- Modify: `tests/verificarCoordinacion.sql`

**Interfaces:**
- Produces: `panorama_del_club(uuid) → jsonb` con `{ planteles, tiro, partidos }`; cada elemento de `partidos` es `{ plantelId, partidoId, fecha, rival, tresAnotados, tresIntentados, libresAnotados, libresIntentados }` (enteros o `null`).

- [ ] **Step 1: Escribir la migración**

```sql
-- Panorama de coordinación: tiro en partidos, además del de batería.
-- Ver docs/superpowers/specs/2026-09-13-panorama-partidos-design.md.
--
-- Desde 0018 el coordinador no lee partido ni estadistica_jugador_partido: la
-- serie no se puede armar en el cliente. Llega por panorama_del_club, que ya
-- es la única puerta del panorama: security definer, sólo coordinación de ese
-- club, sólo sumas.
--
-- Misma firma y mismas dos claves que en 0017 ('planteles' y 'tiro', copiadas
-- sin cambios); se agrega 'partidos'. create or replace conserva los grants.

do $$
begin
  if to_regprocedure('public.panorama_del_club(uuid)') is null then
    raise exception '0022 necesita 0017 aplicada (no existe panorama_del_club).';
  end if;
end $$;

-- partidos: una fila por partido de los planteles del club, con los tiros
-- sumados entre los jugadores de ese partido.
--
-- Anotados e intentados se suman DE A PARES: una fila entra a la suma de un
-- tipo sólo si trae los dos números. Una fracción tiene que salir de las
-- mismas filas arriba y abajo; un jugador con intentados leídos y anotados no
-- leídos inflaría el denominador.
--
-- left join: un partido importado sin ninguna estadística aparece igual, con
-- las sumas en null. No genera punto en la serie, pero existe.
--
-- rival es información pública de competencia (ver ESQUEMA.md, partido), no
-- un dato de menores. Ningún nombre de jugador sale de acá.
create or replace function panorama_del_club(p_club_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_resultado jsonb;
begin
  if not public.es_coordinador_de(p_club_id) then
    raise exception 'Sólo coordinación de ese club.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'planteles', coalesce((
      select jsonb_agg(jsonb_build_object(
        'plantelId', pl.id,
        'jugadores', (select count(distinct pe.jugador_id) from public.pertenencia pe
                      where pe.plantel_id = pl.id and pe.hasta is null),
        'partidos', (select count(*) from public.partido pa where pa.plantel_id = pl.id),
        'ultimoPartido', (select max(pa.fecha) from public.partido pa where pa.plantel_id = pl.id),
        'ultimaMedicion', (select max(s.fecha) from public.sesion_medicion s where s.plantel_id = pl.id)
      ))
      from public.plantel pl
      where pl.club_id = p_club_id
    ), '[]'::jsonb),
    'tiro', coalesce((
      select jsonb_agg(jsonb_build_object(
        'plantelId', t.plantel_id,
        'sesionId', t.sesion_id,
        'fecha', t.fecha,
        'posicion', t.posicion,
        'anotados', t.anotados,
        'intentos', t.intentos,
        'jugadoresQueMidieron', t.jugadores
      ) order by t.fecha, t.posicion)
      from (
        select s.plantel_id, s.id as sesion_id, s.fecha, mt.posicion,
               sum(mt.anotados)::int as anotados,
               sum(mt.intentos)::int as intentos,
               (select count(distinct m2.jugador_id)::int
                  from public.medicion_tiro m2
                 where m2.sesion_id = s.id and m2.anotados is not null) as jugadores
        from public.sesion_medicion s
        join public.plantel pl on pl.id = s.plantel_id and pl.club_id = p_club_id
        join public.medicion_tiro mt on mt.sesion_id = s.id and mt.anotados is not null
        where s.tipo = 'tiro'
        group by s.plantel_id, s.id, s.fecha, mt.posicion
      ) t
    ), '[]'::jsonb),
    'partidos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'plantelId', p.plantel_id,
        'partidoId', p.partido_id,
        'fecha', p.fecha,
        'rival', p.rival,
        'tresAnotados', p.tres_anotados,
        'tresIntentados', p.tres_intentados,
        'libresAnotados', p.libres_anotados,
        'libresIntentados', p.libres_intentados
      ) order by p.fecha, p.partido_id)
      from (
        select pa.plantel_id, pa.id as partido_id, pa.fecha, pa.rival_nombre as rival,
               (sum(e.tres_anotados)
                  filter (where e.tres_anotados is not null and e.tres_intentados is not null))::int
                 as tres_anotados,
               (sum(e.tres_intentados)
                  filter (where e.tres_anotados is not null and e.tres_intentados is not null))::int
                 as tres_intentados,
               (sum(e.libres_anotados)
                  filter (where e.libres_anotados is not null and e.libres_intentados is not null))::int
                 as libres_anotados,
               (sum(e.libres_intentados)
                  filter (where e.libres_anotados is not null and e.libres_intentados is not null))::int
                 as libres_intentados
        from public.partido pa
        join public.plantel pl on pl.id = pa.plantel_id and pl.club_id = p_club_id
        left join public.estadistica_jugador_partido e on e.partido_id = pa.id
        group by pa.plantel_id, pa.id, pa.fecha, pa.rival_nombre
      ) p
    ), '[]'::jsonb)
  ) into v_resultado;

  return v_resultado;
end;
$fn$;
```

- [ ] **Step 2: `tests/rollback0022.sql`** — el mismo `create or replace` con sólo `planteles` y `tiro` (cuerpo idéntico al de 0017), dentro de `begin; … commit;`.

- [ ] **Step 3: `tests/verificarCoordinacion.sql`**

En `declare`, sumar `v_imp17 uuid; v_par17 uuid; q integer;`.

En el setup, después de las mediciones de `v_ses17`:

```sql
    -- Partido de U17M para el panorama: triples 2/5 + 1/4 = 3/9; libres 3/4
    -- y un par con intentados en null, que NO tiene que sumar: 3/4.
    insert into importacion (club_id, hash_archivo, nombre_archivo)
      values (v_club, 'zztest-coord17-' || gen_random_uuid(), 'zztest17.xlsx') returning id into v_imp17;
    insert into partido (club_id, plantel_id, importacion_id, fecha, condicion_propia, rival_nombre)
      values (v_club, v_u17, v_imp17, '2020-01-02', 'local', 'ZZTEST RIVAL') returning id into v_par17;
    insert into estadistica_jugador_partido
      (club_id, partido_id, jugador_id, nombre_crudo, tres_anotados, tres_intentados, libres_anotados, libres_intentados)
    values
      (v_club, v_par17, v_j17,  'ZZTEST', 2, 5, 3, 4),
      (v_club, v_par17, v_j17b, 'ZZTEST', 1, 4, 2, null);
```

En el caso 9, antes del chequeo de claves:

```sql
      select (e->>'tresAnotados')::int, (e->>'tresIntentados')::int,
             (e->>'libresAnotados')::int, (e->>'libresIntentados')::int
        into n, m, k, q
        from jsonb_array_elements(v_json->'partidos') e
       where e->>'partidoId' = v_par17::text;
      if n is distinct from 3 or m is distinct from 9 or k is distinct from 3 or q is distinct from 4 then
        txt := txt || format('partido U17M triples %s/%s libres %s/%s, esperaba 3/9 y 3/4; ', n, m, k, q);
      end if;
      select count(*) into n
        from jsonb_array_elements(v_json->'partidos') e
       where e->>'partidoId' = v_par::text
         and e->'tresIntentados' = 'null'::jsonb and e->'libresIntentados' = 'null'::jsonb;
      if n <> 1 then
        txt := txt || 'el partido sin estadísticas no aparece con sumas null; ';
      end if;
```

Y el chequeo de claves suma dos condiciones:

```sql
      or exists (select 1 from jsonb_array_elements(v_json->'partidos') e, jsonb_object_keys(e) clave
                 where clave not in ('plantelId','partidoId','fecha','rival','tresAnotados','tresIntentados','libresAnotados','libresIntentados'))
      or exists (select 1 from jsonb_object_keys(v_json) clave
                 where clave not in ('planteles','tiro','partidos'))
```

En el caso 10, la suma de `estadistica_jugador_partido` pasa a `partido_id in (v_par, v_par17)`.

- [ ] **Step 4: Aplicar en local y verificar**

Run: `npx supabase migration up` (local) y, dentro del contenedor, `psql -f tests/verificarCoordinacion.sql`.
Expected: los 12 casos en `OK` (0018 está aplicada en local).

- [ ] **Step 5: Commit** — `feat(db): panorama_del_club con tiro en partidos`

- [ ] **Step 6: PARAR.** Mostrar a Tomás el SQL completo de `0022` y esperar.

---

### Tarea 2: Funciones puras de series

**Riesgo bajo. TDD.**

**Files:**
- Modify: `src/data/estadisticas.js` (al final)
- Modify: `src/ui/pantallas/fichaJugador.js:8` y `:38-52`, `:102-108`
- Test: `tests/estadisticas.test.js`

**Interfaces:**
- Produces:
  - `serieDePartidosAgregada(filas, tipo) → [{ partidoId, fecha, rival, valor }]`, `tipo` ∈ `'tres' | 'libres'`, ordenada por fecha, sin puntos `null`.
  - `ejeComun(serieA, serieB) → { fechas: string[], a: (valor|null)[], b: (valor|null)[] }`, donde `valor` es el objeto de `porcentaje()`.

- [ ] **Step 1: Tests (sumar `serieDePartidosAgregada, ejeComun` al import)**

```js
test('la serie de partidos sale de las sumas de cada partido, ordenada por fecha', () => {
  const filas = [
    { partidoId: 'p2', fecha: '2026-05-10', rival: 'B', tresAnotados: 8, tresIntentados: 30, libresAnotados: 10, libresIntentados: 14 },
    { partidoId: 'p1', fecha: '2026-05-03', rival: 'A', tresAnotados: 6, tresIntentados: 25, libresAnotados: 7, libresIntentados: 12 },
  ];
  const tres = serieDePartidosAgregada(filas, 'tres');
  assert.deepEqual(tres.map((p) => p.partidoId), ['p1', 'p2']);
  assert.deepEqual(tres.map((p) => [p.valor.anotados, p.valor.intentos]), [[6, 25], [8, 30]]);
  assert.equal(tres[0].rival, 'A');
  const libres = serieDePartidosAgregada(filas, 'libres');
  assert.deepEqual(libres.map((p) => [p.valor.anotados, p.valor.intentos]), [[7, 12], [10, 14]]);
});

test('un partido sin intentos o sin estadísticas no genera punto: un hueco no es un cero', () => {
  const filas = [
    { partidoId: 'p1', fecha: '2026-05-03', rival: 'A', tresAnotados: 0, tresIntentados: 0, libresAnotados: 4, libresIntentados: 6 },
    { partidoId: 'p2', fecha: '2026-05-10', rival: 'B', tresAnotados: null, tresIntentados: null, libresAnotados: null, libresIntentados: null },
  ];
  assert.deepEqual(serieDePartidosAgregada(filas, 'tres'), []);
  assert.deepEqual(serieDePartidosAgregada(filas, 'libres').map((p) => p.partidoId), ['p1']);
  assert.deepEqual(serieDePartidosAgregada(null, 'tres'), []);
  assert.deepEqual(serieDePartidosAgregada(filas, 'dos'), []);
});

test('un partido con pocos intentos queda marcado con el umbral único', () => {
  const [p] = serieDePartidosAgregada(
    [{ partidoId: 'p1', fecha: '2026-05-03', tresAnotados: 2, tresIntentados: UMBRAL_INTENTOS - 1 }], 'tres');
  assert.equal(p.valor.muestraChica, true);
});

test('ejeComun une las fechas y alinea cada serie con huecos', () => {
  const a = [{ fecha: '2026-05-01', valor: porcentaje(3, 10) }, { fecha: '2026-05-20', valor: porcentaje(5, 10) }];
  const b = [{ fecha: '2026-05-10', valor: porcentaje(2, 8) }];
  const eje = ejeComun(a, b);
  assert.deepEqual(eje.fechas, ['2026-05-01', '2026-05-10', '2026-05-20']);
  assert.deepEqual(eje.a.map((v) => v?.pct ?? null), [30, null, 50]);
  assert.deepEqual(eje.b.map((v) => v?.pct ?? null), [null, 25, null]);
  assert.equal(eje.b[1].anotados, 2);
});
```

- [ ] **Step 2: Correr y ver que falla** — `node --test tests/estadisticas.test.js` → falta el export.

- [ ] **Step 3: Implementar en `estadisticas.js`**

```js
const CAMPOS_DE_PARTIDO = {
  tres: ['tresAnotados', 'tresIntentados'],
  libres: ['libresAnotados', 'libresIntentados'],
};

/**
 * La serie de tiro en partidos de una categoría, un punto por partido, a
 * partir de las SUMAS que devuelve panorama_del_club (0022). Es lo que ve
 * coordinación, que no tiene acceso a las filas de cada jugador.
 *
 * Un partido sin intentos de ese tipo, o sin estadísticas leídas, no genera
 * punto: un hueco no es un cero. Nunca se mezcla con la serie de batería.
 */
export function serieDePartidosAgregada(filas, tipo) {
  const campos = CAMPOS_DE_PARTIDO[tipo];
  if (!campos) return [];
  const [anotados, intentados] = campos;
  return [...(filas ?? [])]
    .sort((x, y) => x.fecha.localeCompare(y.fecha))
    .map((f) => ({
      partidoId: f.partidoId,
      fecha: f.fecha,
      rival: f.rival ?? null,
      valor: porcentaje(f[anotados], f[intentados]),
    }))
    .filter((p) => p.valor != null);
}

/**
 * Une las fechas de dos series en un solo eje y devuelve cada una alineada a
 * ese eje, con null donde no tiene punto. Práctica y partido pasan en días
 * distintos: sin esto, el punto 3 de una caería sobre el punto 3 de la otra
 * aunque sean de meses distintos.
 *
 * Devuelve el objeto `valor` completo (no sólo el porcentaje) para que quien
 * dibuja pueda marcar la muestra chica. Si una serie tiene dos puntos en la
 * misma fecha, queda el último.
 */
export function ejeComun(serieA, serieB) {
  const fechas = [...new Set([...serieA.map((p) => p.fecha), ...serieB.map((p) => p.fecha)])].sort();
  const alinear = (serie) => {
    const porFecha = new Map(serie.map((p) => [p.fecha, p.valor]));
    return fechas.map((f) => porFecha.get(f) ?? null);
  };
  return { fechas, a: alinear(serieA), b: alinear(serieB) };
}
```

- [ ] **Step 4: `fichaJugador.js`** — sumar `ejeComun` al import de `estadisticas.js`, borrar la función local (comentario incluido) y en `dibujarSerie` usar `d: a.map((v) => v?.pct ?? null)` y `d: b.map((v) => v?.pct ?? null)`. Sin `chico`: la ficha se ve igual que antes.

- [ ] **Step 5:** `npm test` en verde.
- [ ] **Step 6: Commit** — `feat(estadisticas): serie de partidos agregada y eje común compartido`

---

### Tarea 3: `armarPanorama` con dos fuentes

**Riesgo medio. TDD.**

**Files:**
- Modify: `src/data/coordinacion.js`
- Test: `tests/coordinacion.test.js`

**Interfaces:**
- Consumes: `serieDeZonasAgregada`, `serieDePartidosAgregada`, `compararPorcentajes`.
- Produces:
  - Tarjeta: `{ plantelId, categoria, nombreCategoria, jugadores, partidos, ultimaMedicion, aCargo, triples: { bateria, partido }, libres: { bateria, partido } }`, cada fuente `{ serie, variacion }`.
  - `textoSinDatos({ fuente, tipo, partidosImportados }) → string` (`fuente` ∈ `'bateria' | 'partido'`, `tipo` ∈ `'triples' | 'libres'`).
  - `hayAlgoParaMostrar(tarjeta) → boolean`.

- [ ] **Step 1: Tests.** Actualizar en `tests/coordinacion.test.js`:
  - `una tarjeta no trae ningún campo…`: las claves siguen siendo las nueve de hoy; además `Object.keys(t.triples).sort()` y `Object.keys(t.libres).sort()` son `['bateria', 'partido']`, y cada fuente `['serie', 'variacion']`.
  - `triples y libres son dos series separadas…`: donde decía `u17.triples.serie` pasa a `u17.triples.bateria.serie` (idem `libres`), y `u13.triples` es `{ bateria: { serie: [], variacion: null }, partido: { serie: [], variacion: null } }`.

  Y sumar:

```js
const partido = (plantelId, partidoId, fecha, tres, libres) => ({
  plantelId, partidoId, fecha, rival: 'RIVAL',
  tresAnotados: tres?.[0] ?? null, tresIntentados: tres?.[1] ?? null,
  libresAnotados: libres?.[0] ?? null, libresIntentados: libres?.[1] ?? null,
});

test('los partidos son su propia serie, al lado de la batería y sin mezclarse', () => {
  const panorama = {
    planteles: [{ plantelId: 'p17', jugadores: 14, partidos: 2 }],
    tiro: [fila('p17', 's1', '2026-03-01', 'frontal', 300, 700)],
    partidos: [
      partido('p17', 'm1', '2026-03-05', [6, 25], [7, 12]),
      partido('p17', 'm2', '2026-03-12', [8, 30], [10, 14]),
      partido('p21', 'm3', '2026-03-12', [20, 30], [10, 10]),
      partido('p17viejo', 'm4', '2025-03-12', [1, 30], [1, 10]),
    ],
  };
  const { tarjetas } = armarPanorama({ planteles, catalogo, temporadas, panorama, miembros, asignaciones: [] });
  const u17 = tarjetas.find((t) => t.plantelId === 'p17');
  assert.deepEqual(u17.triples.bateria.serie.map((p) => p.valor.intentos), [700]);
  assert.deepEqual(u17.triples.partido.serie.map((p) => p.partidoId), ['m1', 'm2']);
  assert.deepEqual(u17.libres.partido.serie.map((p) => p.valor.anotados), [7, 10]);
  assert.equal(u17.triples.bateria.variacion, null);
  assert.equal(u17.triples.partido.variacion.concluyente, false);
});

test('una categoría sin partidos no inventa un cero', () => {
  const { tarjetas } = armarPanorama({ planteles, catalogo, temporadas, panorama: sinDatos, miembros, asignaciones: [] });
  assert.deepEqual(tarjetas[0].triples.partido, { serie: [], variacion: null });
});

test('el texto de una fuente vacía distingue sin partidos de partidos sin intentos', () => {
  assert.equal(textoSinDatos({ fuente: 'bateria', tipo: 'triples', partidosImportados: 3 }), 'Sin baterías');
  assert.equal(textoSinDatos({ fuente: 'partido', tipo: 'triples', partidosImportados: 0 }), 'Sin partidos importados');
  assert.equal(textoSinDatos({ fuente: 'partido', tipo: 'triples', partidosImportados: 2 }), 'Ningún partido con triples intentados');
  assert.equal(textoSinDatos({ fuente: 'partido', tipo: 'libres', partidosImportados: 2 }), 'Ningún partido con libres intentados');
});

test('hay algo para mostrar si cualquiera de las cuatro series tiene un punto', () => {
  const vacia = { serie: [], variacion: null };
  const conPunto = { serie: [{ fecha: '2026-03-01' }], variacion: null };
  assert.equal(hayAlgoParaMostrar({ triples: { bateria: vacia, partido: vacia }, libres: { bateria: vacia, partido: vacia } }), false);
  assert.equal(hayAlgoParaMostrar({ triples: { bateria: vacia, partido: vacia }, libres: { bateria: vacia, partido: conPunto } }), true);
});
```

  (Sumar `textoSinDatos, hayAlgoParaMostrar` al import. `sinDatos` pasa a `{ planteles: [], tiro: [], partidos: [] }`.)

- [ ] **Step 2: Correr y ver que falla.**

- [ ] **Step 3: Implementar en `coordinacion.js`**

Import: `import { serieDeZonasAgregada, serieDePartidosAgregada, compararPorcentajes } from './estadisticas.js';`

Reemplazar `serieConVariacion` por:

```js
/** Una serie y su último punto contra el anterior. */
function conVariacion(serie) {
  const variacion = serie.length >= 2
    ? compararPorcentajes(serie[serie.length - 1].valor, serie[serie.length - 2].valor)
    : null;
  return { serie, variacion };
}
```

En `armarPanorama`, dentro del `map` de planteles:

```js
    const filasTiro = (panorama?.tiro ?? []).filter((t) => t.plantelId === p.id);
    const filasPartidos = (panorama?.partidos ?? []).filter((t) => t.plantelId === p.id);
    return {
      // …los siete campos de hoy sin cambios…
      // Por tipo de tiro, las dos fuentes lado a lado y nunca mezcladas: la
      // comparación práctica-partido sólo es legítima a nivel triples totales
      // y libres, porque el boxscore no dice desde dónde se tiró.
      triples: {
        bateria: conVariacion(serieDeZonasAgregada(filasTiro, IDS_TRIPLES)),
        partido: conVariacion(serieDePartidosAgregada(filasPartidos, 'tres')),
      },
      libres: {
        bateria: conVariacion(serieDeZonasAgregada(filasTiro, IDS_LIBRES)),
        partido: conVariacion(serieDePartidosAgregada(filasPartidos, 'libres')),
      },
    };
```

Y al final del archivo:

```js
/**
 * Qué decir en el lugar del número cuando una fuente no tiene puntos. Nunca
 * un 0%: "sin partidos importados" y "partidos sin triples intentados" son
 * hechos distintos y los dos son distintos de cero.
 */
export function textoSinDatos({ fuente, tipo, partidosImportados }) {
  if (fuente === 'bateria') return 'Sin baterías';
  if (!partidosImportados) return 'Sin partidos importados';
  return `Ningún partido con ${tipo === 'libres' ? 'libres' : 'triples'} intentados`;
}

/** Si la tarjeta tiene al menos un punto en alguna de sus cuatro series. */
export function hayAlgoParaMostrar(tarjeta) {
  return ['triples', 'libres'].some((tipo) =>
    ['bateria', 'partido'].some((fuente) => (tarjeta?.[tipo]?.[fuente]?.serie?.length ?? 0) > 0));
}
```

- [ ] **Step 4:** `npm test` en verde.
- [ ] **Step 5: Commit** — `feat(coordinacion): panorama con batería y partido por tipo de tiro`

---

### Tarea 4: La tarjeta

**Riesgo medio** (presentación: reglas del proyecto).

**Files:**
- Modify: `src/ui/pantallas/coordPanorama.js`
- Modify: `public/css/componentes.css`

**Interfaces:**
- Consumes: `armarPanorama`, `textoSinDatos`, `hayAlgoParaMostrar` (Tarea 3); `ejeComun` (Tarea 2); `variacionHtml`, `textoPorcentaje`, `grafico`.

- [ ] **Step 1: Reescribir la parte de dibujo de `coordPanorama.js`** (imports, carga y `renderPanorama` quedan; cambian las funciones de HTML y el dibujo de gráficos)

```js
import { armarPanorama, textoSinDatos, hayAlgoParaMostrar } from '../../data/coordinacion.js';
import { ejeComun } from '../../data/estadisticas.js';

const TIPOS = [
  { clave: 'triples', titulo: 'Triples' },
  { clave: 'libres', titulo: 'Libres' },
];

// Siempre en este orden, en el resumen, la leyenda y las tablas: el ojo
// aprende dónde está cada cosa.
const FUENTES = [
  { clave: 'bateria', etiqueta: 'Batería', unPunto: 'Una sola batería: todavía no hay con qué comparar' },
  { clave: 'partido', etiqueta: 'Partidos', unPunto: 'Un solo partido: todavía no hay con qué comparar' },
];

function fecha(iso) {
  return escaparHtml(formatearFechaCorta(iso));
}

/**
 * El resumen de una fuente: último valor grande, su fracción al lado, y la
 * variación contra el punto anterior de la MISMA fuente y categoría.
 *
 * El número va en --rojo SIEMPRE, con cualquier valor: es jerarquía, no una
 * señal. La única señal de mejora sigue siendo variacionHtml, con su flecha.
 * Un estado vacío nunca usa el estilo del número.
 */
function resumenFuenteHtml(t, tipo, fuente) {
  const { serie, variacion } = t[tipo.clave][fuente.clave];
  if (!serie.length) {
    const texto = textoSinDatos({ fuente: fuente.clave, tipo: tipo.clave, partidosImportados: t.partidos });
    return `
      <div class="fuente">
        <div class="k">${fuente.etiqueta}</div>
        <div class="vacio">${escaparHtml(texto)}</div>
      </div>`;
  }
  const ultimo = serie[serie.length - 1];
  const anterior = serie.length >= 2 ? serie[serie.length - 2] : null;
  return `
    <div class="fuente">
      <div class="k">${fuente.etiqueta} · ${fecha(ultimo.fecha)}</div>
      <div class="numero">
        <span class="n">${ultimo.valor.pct}<span class="u">%</span></span>
        <span class="frac">${ultimo.valor.anotados}/${ultimo.valor.intentos}</span>
      </div>
      ${ultimo.valor.muestraChica ? '<span class="poco-tag">pocos datos</span>' : ''}
      <div>${anterior
        ? `${variacionHtml(variacion)} <span class="det">vs ${fecha(anterior.fecha)}</span>`
        : `<span class="var neutra">${fuente.unPunto}</span>`}</div>
    </div>`;
}

function resumenTipoHtml(t, tipo) {
  return `
    <div class="serie-cat">
      <div class="k">${tipo.titulo}</div>
      <div class="fuentes">${FUENTES.map((f) => resumenFuenteHtml(t, tipo, f)).join('')}</div>
    </div>`;
}

function idSvg(t, tipo) {
  return `svg-panorama-${tipo.clave}-${t.plantelId}`;
}

function tablaBateriaHtml(serie) {
  return [...serie].reverse().map((p) => `
    <div class="fila-ev tres">
      <div class="f">${fecha(p.fecha)}</div>
      <div>${textoPorcentaje(p.valor)}</div>
      <div class="f">${p.jugadoresQueMidieron} ${p.jugadoresQueMidieron === 1 ? 'jugador' : 'jugadores'}</div>
    </div>`).join('');
}

function tablaPartidosHtml(serie) {
  return [...serie].reverse().map((p) => `
    <div class="fila-ev tres">
      <div class="f">${fecha(p.fecha)}</div>
      <div>${textoPorcentaje(p.valor)}</div>
      <div class="rival">${p.rival ? `vs ${escaparHtml(p.rival)}` : ''}</div>
    </div>`).join('');
}

function detalleTipoHtml(t, tipo) {
  const bateria = t[tipo.clave].bateria.serie;
  const partido = t[tipo.clave].partido.serie;
  if (!bateria.length && !partido.length) return '';
  return `
    <div class="detalle-tipo">
      <div class="k">${tipo.titulo} · batería por batería y partido a partido</div>
      <svg class="g" id="${idSvg(t, tipo)}"></svg>
      <div class="leyenda">
        ${bateria.length ? '<span class="linea-practica">Batería</span>' : ''}
        ${partido.length ? '<span class="linea-partido">Partidos</span>' : ''}
      </div>
      ${bateria.length ? `<div class="sub-fuente">Batería</div><div class="tabla-ev">${tablaBateriaHtml(bateria)}</div>` : ''}
      ${partido.length ? `<div class="sub-fuente">Partidos</div><div class="tabla-ev">${tablaPartidosHtml(partido)}</div>` : ''}
    </div>`;
}

/**
 * <details> nativo: se abre sin JS, con teclado y con lector de pantalla, y no
 * hay estado que sincronizar. Sin `open`: cada visita arranca en resumen. El
 * texto del botón cambia sólo con CSS (details[open]).
 */
function detallesHtml(t) {
  return `
    <details class="detalles-cat">
      <summary>
        <span class="ver">Ver detalles</span><span class="ocultar">Ocultar detalles</span>
        <span class="flecha" aria-hidden="true">▾</span>
      </summary>
      ${TIPOS.map((tipo) => detalleTipoHtml(t, tipo)).join('')}
    </details>`;
}

function tarjetaHtml(t) {
  const cuerpo = hayAlgoParaMostrar(t)
    ? `${TIPOS.map((tipo) => resumenTipoHtml(t, tipo)).join('')}${detallesHtml(t)}`
    : `<div class="det sin-tiros">Todavía no hay baterías ni partidos con tiros en ${escaparHtml(t.categoria)}.</div>`;
  return `
    <article class="tarjeta-cat">
      <h2 class="nom">${escaparHtml(t.categoria)} <span class="det">${escaparHtml(t.nombreCategoria)}</span></h2>
      ${operativosHtml(t)}
      ${aCargoHtml(t)}
      ${cuerpo}
    </article>
  `;
}
```

Y el dibujo, al final de `renderPanorama` (reemplaza el `for` de hoy). El gráfico se dibuja aunque el `<details>` esté cerrado: `grafico()` usa un `viewBox` fijo y no mide el DOM.

```js
  for (const t of vista.tarjetas) {
    for (const tipo of TIPOS) {
      const svg = $(idSvg(t, tipo));
      if (!svg) continue;
      // Mismo lenguaje que la ficha del jugador: batería sólida, partidos
      // punteada y roja. Eje fijo 0–100 en todas las tarjetas.
      const { fechas, a, b } = ejeComun(t[tipo.clave].bateria.serie, t[tipo.clave].partido.serie);
      grafico(svg, {
        etiquetas: fechas.map(formatearFechaCorta),
        series: [
          { nombre: 'Batería', c: '#131316', d: a.map((v) => v?.pct ?? null), chico: a.map((v) => v?.muestraChica === true) },
          { nombre: 'Partidos', c: '#D9122E', dash: true, d: b.map((v) => v?.pct ?? null), chico: b.map((v) => v?.muestraChica === true) },
        ],
      }, { alto: 140, min: 0, max: 100 });
    }
  }
```

Borrar `SERIES`, `serieHtml` y el `idSvg` viejo. El texto introductorio de la pantalla y `operativosHtml` / `aCargoHtml` no cambian.

- [ ] **Step 2: CSS** — al final del bloque "coordinación" de `componentes.css`:

```css
/* Abrir una tarjeta no estira a las vecinas de la grilla (escritorio). */
.panorama{align-items:start}

.serie-cat .fuentes{display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-3);margin-top:var(--sp-2)}
.fuente{min-width:0}
.fuente .k{font-family:var(--ff-titulo);font-size:var(--fs-115);letter-spacing:.06em;text-transform:uppercase;color:var(--gris-cl)}
.fuente .numero{display:flex;flex-wrap:wrap;align-items:baseline;gap:0 var(--sp-2);margin-top:.125rem}
/* Jerarquía, no señal: el mismo rojo con cualquier valor (spec §6). */
.fuente .n{font-family:var(--ff-mono);font-size:var(--fs-300);font-weight:600;line-height:1;color:var(--rojo)}
.fuente .n .u{font-size:var(--fs-190);color:var(--gris-cl)}
.fuente .frac{font-family:var(--ff-mono);font-size:var(--fs-135);color:var(--gris-cl)}
.fuente .vacio{font-size:var(--fs-135);color:var(--gris-cl);margin-top:var(--sp-1)}

.detalles-cat{border-top:1px solid var(--linea);margin-top:var(--sp-3)}
.detalles-cat > summary{
  list-style:none;min-height:var(--tap);cursor:pointer;
  display:flex;align-items:center;justify-content:space-between;gap:var(--sp-2);
  font-family:var(--ff-titulo);font-size:var(--fs-135);font-weight:600;
  letter-spacing:.06em;text-transform:uppercase;color:var(--tinta);
}
.detalles-cat > summary::-webkit-details-marker{display:none}
.detalles-cat .ocultar{display:none}
.detalles-cat[open] .ver{display:none}
.detalles-cat[open] .ocultar{display:inline}
.detalles-cat .flecha{transition:transform .15s}
.detalles-cat[open] .flecha{transform:rotate(180deg)}
.detalle-tipo{padding-top:var(--sp-3)}
.detalle-tipo .k{font-family:var(--ff-titulo);font-size:var(--fs-125);letter-spacing:.06em;text-transform:uppercase;color:var(--gris-cl)}
.detalle-tipo .sub-fuente{font-family:var(--ff-titulo);font-size:var(--fs-115);letter-spacing:.06em;text-transform:uppercase;color:var(--gris-cl);margin-top:var(--sp-3)}
.fila-ev .rival{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--gris-cl)}
```

- [ ] **Step 3:** `npm test` en verde (incluye `importsResueltos` y la guarda de coordinación, sin cambios).
- [ ] **Step 4: Commit** — `feat(ui): panorama con batería y partidos, detalle colapsado y número destacado`

---

### Tarea 5: Verificación visual

- [ ] Actualizar el simulador de Supabase del arnés de capturas (scratchpad, fuera del repo) para que `panorama_del_club` devuelva planteles, `tiro` y `partidos` con: una categoría con todo, una sin partidos, una con partidos sin triples intentados y una sin nada.
- [ ] Capturas a 375px y a 1280px: Panorama cerrado, y una tarjeta abierta (clic al `summary` desde el script de la escena).
- [ ] Medir que el `summary` tenga al menos 44px de alto.
- [ ] Mirar las capturas de verdad: dos columnas que entran a 375, estado vacío sin número grande, número rojo al lado de una variación gris, grilla de escritorio sin tarjetas estiradas.

---

### Tarea 6: Documentación y cierre

- [ ] `supabase/ESQUEMA.md`: en la tabla de funciones, `panorama_del_club` suma "y tiro sumado por partido (0022)".
- [ ] `docs/COORDINACION.md`: 0022 va antes que el frontend que la usa.
- [ ] `npm test` completo. Commit — `docs: panorama con tiro en partidos`. **No pushear.**
