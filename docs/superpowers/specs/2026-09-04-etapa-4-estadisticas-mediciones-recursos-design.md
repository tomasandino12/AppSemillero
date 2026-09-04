# Etapa 4 — Estadísticas, mediciones y recursos

**Fecha:** 2026-09-04
**Estado:** aprobado para planificar
**Etapa previa:** `2026-09-03-etapa-3-app-completa-design.md` (mergeada, tag `pre-etapa-4`)

## Objetivo

Reemplazar los datos de ejemplo de MEDIR, RECURSOS y HOY por funcionalidad real, y
construir las vistas de estadísticas sobre los partidos ya importados. Al terminar no
queda ninguna franja de "datos de ejemplo" en la app, porque el componente que la
dibuja deja de existir.

## Principio rector

No romper lo que funciona. El parser, las migraciones existentes y el flujo de import
verificado de punta a punta **no se tocan**. `repositorio.js` sólo suma funciones: no se
modifica ninguna de las existentes.

---

## 1. Hallazgo que corrige la Decisión 5 del prompt

El prompt pide, para la ficha del jugador, "serie temporal de tiro **por posición**:
mediciones de práctica y rendimiento en partido, dos series".

Al medir la geometría del SVG ya portado (`src/ui/componentes/graficos.js`, función
`cancha()`), el arco de triples se dibuja en `M28 284 L28 232 A126 126 0 0 1 272 232
L272 284` y las cinco posiciones caen sobre él:

| Posición | x, y | Arco en esa x |
|---|---|---|
| `esq_izq` | 32, 236 | esquina, y=232 |
| `c45_izq` | 58, 158 | y≈146 |
| `frontal` | 150, 118 | y=106 |
| `c45_der` | 242, 158 | y≈146 |
| `esq_der` | 268, 236 | esquina, y=232 |

**Las cinco posiciones de la batería son tiros de tres.** El desfasaje de ~12px hacia
adentro es padding visual para que los círculos de r=21 no se salgan de la cancha.

**Consecuencia:** el boxscore de la CABB trae `2P`, `3P` y `TL`, nunca desde dónde se
tiró (ver `PARSER.md`). No existe dato de partido por posición, así que **no se puede
superponer el rendimiento en partido sobre las cinco posiciones de la cancha**.

Las parejas legítimas, al mismo nivel de granularidad, son dos:

| Serie | Práctica | Partido |
|---|---|---|
| **Triples** | las 5 posiciones sumadas de una sesión (x/50) | `tres_anotados / tres_intentados` |
| **Libres** | la posición `libres` (x/10) | `libres_anotados / libres_intentados` |

Libres es una pareja exacta: el mismo tiro, misma distancia, sin defensa posible en
ninguno de los dos casos — la única diferencia es la presión, que es exactamente lo que
el entrenador quiere leer. Triples es una pareja legítima porque las cinco posiciones
son triples, aunque el partido no diga desde cuál.

`2P` de partido no tiene equivalente en la batería. No se le inventa uno: vive en la
tabla partido a partido de la ficha, no en una comparación de dos series.

---

## 2. Principios de presentación de datos

Rigen cada número que la app muestre.

1. **Ningún porcentaje sin su denominador.** Se hace estructuralmente imposible: la
   función pura `porcentaje()` nunca devuelve un número pelado, siempre devuelve
   `{ pct, anotados, intentos, muestraChica }`. Una vista que quiera pintar un `31%`
   tiene el `11/35` en la mano sí o sí.
2. **Muestra chica marcada.** `UMBRAL_INTENTOS = 10`, definido y documentado en un solo
   lugar (`src/data/estadisticas.js`), exportado. Por debajo de 10 intentos el número se
   muestra atenuado y con la marca "pocos datos".
3. **`NULL` y cero nunca son lo mismo.** Se chequea siempre con `== null`, nunca con
   `!valor` — un `0/10` real es un dato, y se ve distinto de "sin medir".
4. **Sin normas externas por edad.** Cada jugador se compara contra sí mismo a lo largo
   del tiempo. No se inventa ningún rango de referencia.
5. **Sin jerga estadística en pantalla.** Nada de "coeficiente de variación" ni
   "índice de concentración". La lectura de una línea del reparto dice *"Los primeros 4
   jugadores concentran más de la mitad de los minutos"*, que es castellano llano.
6. **Sin librerías de gráficos.** SVG a mano, reusando `cancha()` y `grafico()`.

### Qué NO se construye, y por qué

Las alertas del prototipo del tipo *"3 chicos sin mejora en tiro desde marzo"* **no se
construyen**. Marcar a un chico como "sin mejora" necesita un umbral de qué cuenta como
mejora, y el prompt prohíbe explícitamente inventar umbrales. Mostrar la serie para que
el entrenador vea el movimiento entra; ponerle una etiqueta binaria a un adolescente
basada en un número inventado, no.

---

## 3. Diseñar para cero datos

**El club arranca sin una sola medición ni un solo partido cargado.** Las vistas se
diseñan para esa curva, no para el estado maduro:

| Datos disponibles | Qué se muestra |
|---|---|
| 0 | Estado vacío honesto, que dice qué hacer para empezar |
| 1 | El número con su denominador. **Sin línea de tendencia** — una línea de un punto no dice nada |
| ≥2 | La serie completa |

Esto obliga a un cambio concreto en `grafico()`: hoy calcula la posición horizontal con
`X = ml + i * (W - ml - mr) / (FECHAS.length - 1)`, que **divide por cero con un solo
punto**, y hace `Math.min(...todos)` que da `Infinity` con la serie vacía. La versión
generalizada tiene que manejar n=0, n=1 y n≥2 explícitamente.

Con una sola medición cargada las vistas van a decir poco, y está bien. Mes a mes cobran
sentido solas.

---

## 4. Modelo de datos — migración `0009_mediciones_y_recursos.sql`

Cinco tablas nuevas. Mismas convenciones que `0001`: `club_id` en toda tabla de dominio,
FKs compuestas `(club_id, x_id)` para que un payload a mano no pueda mezclar clubes, y
`unique (club_id, id)` en las tablas que son target de una FK compuesta.

```sql
create table sesion_medicion (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references club(id),
  plantel_id uuid not null,
  fecha date not null,
  tipo text not null check (tipo in ('tiro', 'velocidad')),
  creado_en timestamptz not null default now(),
  unique (club_id, id),
  foreign key (club_id, plantel_id) references plantel (club_id, id)
);

create table medicion_tiro (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references club(id),
  sesion_id uuid not null,
  jugador_id uuid not null,
  posicion text not null check (posicion in ('esq_izq','c45_izq','frontal','c45_der','esq_der','libres')),
  -- anotados NULL = el jugador estuvo pero no midió (ausente). Nunca 0.
  anotados integer,
  intentos integer not null default 10 check (intentos > 0),
  check (anotados is null or (anotados >= 0 and anotados <= intentos)),
  unique (sesion_id, jugador_id, posicion),
  foreign key (club_id, sesion_id) references sesion_medicion (club_id, id) on delete cascade,
  foreign key (club_id, jugador_id) references jugador (club_id, id)
);

create table medicion_velocidad (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references club(id),
  sesion_id uuid not null,
  jugador_id uuid not null,
  -- numeric(4,1): un decimal, impuesto por el tipo. Un cronómetro a mano tiene
  -- error humano de ~0.2s; guardar centésimas sería precisión falsa.
  segundos numeric(4,1) check (segundos is null or segundos > 0),
  unique (sesion_id, jugador_id),
  foreign key (club_id, sesion_id) references sesion_medicion (club_id, id) on delete cascade,
  foreign key (club_id, jugador_id) references jugador (club_id, id)
);

create table recurso (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references club(id),
  titulo text not null,
  descripcion text not null,
  enlace text,
  creado_por uuid not null default auth.uid() references auth.users(id),
  creado_en timestamptz not null default now(),
  unique (club_id, id)
);

create table envio_recurso (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references club(id),
  recurso_id uuid not null,
  jugador_id uuid not null,
  fecha date not null,
  unique (recurso_id, jugador_id),
  foreign key (club_id, recurso_id) references recurso (club_id, id) on delete cascade,
  foreign key (club_id, jugador_id) references jugador (club_id, id)
);
```

Más: índices por `club_id` (la columna que usa toda política RLS), por `sesion_id`,
`jugador_id` y `recurso_id`; RLS habilitado en las cinco tablas con el mismo patrón de
membresía de `0002_rls.sql`; y **los `GRANT` a `authenticated`**, que es el gap de
infraestructura que apareció en la Etapa 2B (`0006`) y que Postgres exige además de RLS.

### Decisiones del esquema

**Ausente son 6 filas en `NULL`, no la ausencia de filas.** Un jugador marcado ausente
guarda una fila por posición con `anotados = NULL`. Un jugador al que la sesión nunca
llegó no guarda ninguna fila. Así el historial distingue tres cosas que son distintas:
"midió 0 de 10", "estuvo y no midió", y "esa sesión no lo incluyó".

**Completar la medición otro día es una sesión nueva.** Si tres chicos faltaron el 5 de
marzo y se los mide el 8, eso es una `sesion_medicion` nueva con fecha 8 de marzo y sólo
esas tres personas. No se reabre ni se edita la sesión vieja: las filas en `NULL` del 5
de marzo son verdad histórica y quedan. Esto no requiere nada especial en el esquema —
sale gratis de que una sesión pueda tener un solo jugador.

**`unique (recurso_id, jugador_id)`** con `on conflict do nothing` en la RPC: reenviar un
recurso a "todo el plantel" cuando la mitad ya lo tenía suma sólo a los que faltaban, sin
error y sin duplicar el registro.

**`segundos numeric(4,1)`**: el máximo de un decimal queda impuesto por el tipo de dato,
no por una validación de la UI que alguien pueda saltear.

---

## 5. RPCs transaccionales

La regla del proyecto sigue sin excepciones: toda operación que escriba más de una fila
va por una RPC `security invoker`, con su script de verificación de rollback.

### `0010_rpc_guardar_sesion_medicion.sql`

`guardar_sesion_medicion(payload jsonb) returns jsonb`

Inserta la `sesion_medicion` y sus filas hijas —hasta ~84 en una batería de 14
jugadores— en una única transacción. Despacha a `medicion_tiro` o `medicion_velocidad`
según `payload->>'tipo'`; un tipo desconocido levanta `TIPO_DE_SESION_INVALIDO` con
`errcode = 'P0001'`. Cualquier excepción no capturada aborta todo, incluida la sesión.

Payload:

```json
{
  "clubId": "...", "plantelId": "...", "fecha": "2026-03-05", "tipo": "tiro",
  "mediciones": [
    { "jugadorId": "...", "posicion": "esq_izq", "anotados": 7, "intentos": 10 },
    { "jugadorId": "...", "posicion": "frontal", "anotados": null, "intentos": 10 }
  ]
}
```

Devuelve `{ "sesionId": "...", "filas": 84 }`.

### `0011_rpc_guardar_recurso.sql`

`guardar_recurso(payload jsonb) returns jsonb`

Crea el recurso y sus N envíos en una transacción. Si el payload trae `recursoId`, no
crea recurso: sólo agrega envíos a uno existente (reenviar a más jugadores). Devuelve
`{ "recursoId": "..." }`.

### Scripts de verificación

`tests/verificarSesionMedicion.js` y `tests/verificarRecurso.js`, con el mismo patrón que
`tests/verificarRpc.js` y `tests/verificarAltaJugador.js`: mandan un payload con un
`jugadorId` inexistente en la última fila, confirman que la RPC falla, y confirman que
**no quedó la sesión ni ninguna fila hija**. Leen credenciales de variables de entorno,
no van en `npm test` y no se commitea ninguna credencial.

---

## 6. MEDIR

Es la pantalla más difícil de la app. El escenario real: el entrenador de pie en la
cancha, con una mano, los chicos tirando, preguntando y cargando sobre la marcha.

### Home de MEDIR

Dos entradas —Batería de tiro y Velocidad—, el borrador sin terminar si existe
("Sesión sin terminar del 5/3, 8 de 14 jugadores · Continuar · Descartar"), y la lista de
sesiones ya guardadas. Sin datos: estado vacío que explica qué es la batería.

### Batería de tiro

Un jugador por vez. Nombre grande, contador de avance ("3 de 14"), y las seis posiciones
—las cinco del arco más libres— como filas.

Cada fila es una **tira tocable de 0 a 10** que envuelve en dos líneas, ~52×48px por
botón a 375px. Un tap carga el valor, otro tap lo corrige. Sin teclado, sin input de
texto, todo alcanzable con el pulgar.

- **"Ausente"** por jugador: marca las seis posiciones en `NULL` y avanza.
- **"Siguiente"** avanza en orden; una tira compacta de progreso permite saltar a
  cualquier jugador sin volver a una lista de catorce.
- **"Cerrar sesión"** está disponible siempre. Nunca hace falta completar a los catorce
  para poder guardar.

### Velocidad

Lista del plantel con un campo por jugador, `inputmode="decimal"`, teclado numérico con
punto. Es la excepción explícita a la regla de "contador, no teclado" de la batería: el
valor es un decimal, el cuerpo técnico ya lo venía cargando en Excel, y las teclas del
teclado numérico del celular son más grandes que una fila de décimas. La app redondea a
un decimal al guardar y al mostrar, y el tipo `numeric(4,1)` lo garantiza en la base.

Arriba, el texto del protocolo, fijo y editable en una constante del código:

> Largo de cancha completo, un intento, cronómetro a mano. El protocolo todavía no está
> cerrado por el cuerpo técnico.

**No se grafica evolución de velocidad.** Con un intento por sesión y ~0.2s de error
humano, una línea de tendencia mentiría. Se listan los valores con su fecha.

### Borrador local

Una sesión lleva media hora larga, el celular se bloquea y el wifi del club se corta.

- La sesión en curso se escribe en `localStorage` en cada tap.
- Clave por `(clubId, plantelId, tipo)`, así cambiar de categoría no pisa el borrador de
  la otra.
- Se manda a Supabase **entera, en una sola transacción**, al cerrar la sesión.
- El borrador se borra **sólo cuando la RPC confirma**. Si el envío falla, sigue ahí y se
  puede reintentar.
- Todo acceso a `localStorage` va envuelto en `try/catch`: en modo privado tira.

---

## 7. DATOS

Se conserva la lista de partidos tal como está. Se agregan dos secciones debajo.

**Reparto del equipo.** Una barra por jugador sobre el total del equipo, ordenadas de
mayor a menor, para minutos y para puntos, sobre los partidos de la temporada del plantel
activo. Más la lectura de una línea: *"Los primeros 4 jugadores concentran más de la
mitad de los minutos."* Se calcula acumulando de mayor a menor hasta pasar el 50% y
contando cuántos jugadores hicieron falta — es literalmente "la mayoría", no un índice.

En inferiores los minutos **son** la oportunidad de desarrollo. Se presenta como una foto
de a quién le está tocando desarrollarse, no como una auditoría: el destinatario es el
propio entrenador.

`min_segundos` es nullable en el esquema. Los `NULL` no suman al total y se informan
aparte; nunca se cuentan como cero.

**Evolución del equipo.** 2P, 3P y TL del equipo partido a partido, siempre con los
intentos al lado. Los totales del equipo no están guardados: se suman las filas de
`estadistica_jugador_partido` de ese partido, que son sólo jugadores propios.

---

## 8. Ficha del jugador

A lo que ya existe (nombre, categorías vigentes, talla/peso) se le suma su historia:

1. **Cancha de la última batería** — foto espacial por posición, sólo práctica. El
   partido no puede entrar acá (sección 1).
2. **Triples: dos series sobre el eje temporal** — práctica (las 5 posiciones sumadas por
   sesión) contra partido. Visualmente distinguibles.
3. **Libres: dos series sobre el eje temporal** — práctica contra partido.
4. **Tabla partido a partido** — fecha, rival, minutos, puntos, y 2P/3P/TL con sus
   intentos. Es tabla y no gráfico a propósito: son seis métricas por partido, y un
   gráfico de seis líneas se vuelve ilegible antes de decir nada.
5. **Mediciones con fecha** — talla, peso, velocidad. `NULL` = "sin medir".
6. **Recursos que se le enviaron, con fecha.**

**No se calcula ni se muestra ninguna diferencia numérica entre práctica y partido.** La
brecha la lee el entrenador mirando las dos series. Quien tira bien en práctica y mal en
partido no tiene un problema de mecánica, y ese diagnóstico es del entrenador, no de una
resta que sugeriría una precisión que no existe.

---

## 9. RECURSOS

Un recurso es instrucciones + texto + link. No se alojan videos.

- Lista de los recursos creados, con a cuántos jugadores se envió y cuándo.
- Alta: título, descripción, link opcional.
- Envío: lista del plantel con selección múltiple, más "todo el plantel". Uno, varios o
  todos.
- Reenvío de un recurso existente a más jugadores.

**En esta etapa no hay cuentas de jugador.** El chico recibe el material por donde ya se
comunican hoy (WhatsApp). Lo que hace la app es registrar qué se envió, a quién y cuándo
— que es precisamente la memoria que hoy se pierde.

**No se construye seguimiento de cumplimiento, ni rachas, ni marcas de "visto".** Es una
decisión de producto tomada: con adolescentes, el seguimiento estricto convierte una
herramienta de desarrollo en una de vigilancia, y una racha motiva al que la mantiene
pero expulsa al que la corta.

---

## 10. HOY

Se arma sola con lo que haya cargado.

- Sin datos: estado vacío honesto, con el camino para empezar.
- Con datos: la cancha de la categoría con el promedio real por posición de la última
  batería —con intentos—, y qué falta medir.

Sin las alertas de "sin mejora" ni "el promedio subió X puntos" (sección 2).

---

## 11. Arquitectura

Se mantienen las reglas de la Etapa 3, todas verificables por `grep`:

- Ningún archivo de `src/ui/` importa `@supabase/supabase-js` ni llama a la red. Todo
  pasa por `repositorio.js`.
- Ningún archivo de `src/data/` toca el DOM.
- Todos los breakpoints viven en `layout.css`.
- Los cálculos estadísticos son **funciones puras** en `src/data/`, sin red y sin DOM,
  testeadas en Node.

### Archivos

```
supabase/migrations/
  0009_mediciones_y_recursos.sql       tablas + RLS + grants + índices
  0010_rpc_guardar_sesion_medicion.sql
  0011_rpc_guardar_recurso.sql

src/data/
  posiciones.js              POSICIONES: las 6 posiciones con su geometría (dato real,
                             no de ejemplo). Sale de datosEjemplo.js, que se borra.
  estadisticas.js            UMBRAL_INTENTOS y todos los cálculos puros
  prepararPayloadMedicion.js borrador → payload de RPC (espeja prepararPayloadImportacion)
  repositorio.js             SÓLO se le agregan funciones

src/ui/
  borradorMedicion.js        localStorage, con try/catch
  componentes/graficos.js    cancha() sin cambios de forma; grafico() generalizado
                             (etiquetas reales, n=0 y n=1)
  componentes/barras.js      barras horizontales del reparto
  pantallas/medir.js         home de MEDIR (reescrita)
  pantallas/medirBateria.js  flujo jugador por jugador
  pantallas/medirVelocidad.js
  pantallas/recursos.js      (reescrita)
  pantallas/datos.js         + reparto y evolución
  pantallas/fichaJugador.js  + historia
  pantallas/hoy.js           (reescrita)

BORRAR: src/ui/datosEjemplo.js, src/ui/componentes/bannerEjemplo.js,
        y la regla .banner-ejemplo de componentes.css
```

### Superficie de las funciones puras

```js
// src/data/estadisticas.js
export const UMBRAL_INTENTOS = 10;
export function esMuestraChica(intentos)
export function porcentaje(anotados, intentos)   // null | {pct, anotados, intentos, muestraChica}
export function repartoPorJugador(estadisticas, campo)
export function evolucionDeTiroDelEquipo(partidos, estadisticas)
export function serieDeTiroDelJugador({ sesiones, medicionesTiro, partidos, estadisticas, jugadorId })
export function ultimaBateriaDeJugador(sesiones, medicionesTiro, jugadorId)
export function historialDePartidosDelJugador(partidos, estadisticas, jugadorId)
export function promedioDeCanchaDelPlantel(sesiones, medicionesTiro)
```

### Test de regresión

Igual que `navegacionInvariante.test.js` protege el invariante del botón de volver, un
test estático nuevo verifica que **`bannerEjemplo` y `datosEjemplo` no aparecen en ningún
archivo de `src/`**. Es la forma de que "no queda ninguna franja de datos de ejemplo" no
dependa de que alguien se acuerde.

---

## 12. Fuera de alcance

- Cuentas de jugador, login de jugador, vista JUGADOR.
- Seguimiento de cumplimiento, rachas, gamificación, notificaciones.
- Mapeo automático de debilidad → recurso.
- IA de cualquier tipo.
- Tendencia graficada de velocidad.
- Rangos de referencia por edad.
- Dependencias, librerías de gráficos, frameworks, build steps.
- Deploy en Vercel.

Las cuentas para menores de 13 a 17 traen obligaciones —consentimiento de los padres, qué
ve cada chico, qué pasa con sus datos cuando deja el club— que se resuelven con el club
antes de construirse, no después.

---

## 13. Criterios de aceptación

**Presentación**
- [ ] Ningún porcentaje se muestra sin sus intentos al lado, en ninguna pantalla.
- [ ] Las métricas por debajo de 10 intentos se muestran atenuadas y marcadas. El umbral
      está en un solo lugar y documentado.
- [ ] No aparece jerga estadística en ninguna pantalla.
- [ ] No queda ninguna franja de "datos de ejemplo": el componente no existe, y hay un
      test que lo verifica.
- [ ] Toda vista nueva tiene estado vacío honesto y se comporta bien con 1 solo dato.

**MEDIR**
- [ ] La batería se carga con tiras de 0 a 10, sin teclado ni input de texto, usable con
      una mano a 375px.
- [ ] "Ausente" guarda `NULL` en las 6 posiciones y se distingue visiblemente de `0/10`.
- [ ] Una sesión se puede dejar incompleta y retomar.
- [ ] Un jugador ausente se puede medir otro día, en una sesión nueva.
- [ ] El borrador sobrevive a cerrar y reabrir la app.
- [ ] La sesión se guarda entera en una transacción; si falla, el borrador se conserva y
      se puede reintentar. Verificado con el script de rollback.
- [ ] Velocidad muestra el protocolo y como máximo un decimal.

**DATOS**
- [ ] Reparto de minutos y de puntos, una barra por jugador, con lectura de una línea sin
      jerga.
- [ ] Evolución del equipo con intentos siempre visibles.
- [ ] La lista de partidos sigue funcionando igual.

**Ficha**
- [ ] Triples y libres, cada uno con práctica y partido como dos series distinguibles
      sobre el mismo eje temporal.
- [ ] No se calcula ni se muestra ninguna diferencia numérica entre práctica y partido.
- [ ] Mediciones con fecha; `NULL` como "sin medir".
- [ ] Recursos enviados, con fecha.

**RECURSOS**
- [ ] Se crea un recurso y se envía a uno, varios o todos.
- [ ] Queda registrado a quién y cuándo.
- [ ] No existe ningún mecanismo de cumplimiento, racha ni "visto".

**Arquitectura**
- [ ] Los cálculos estadísticos son funciones puras testeadas en Node sin base de datos.
- [ ] `src/ui/` no importa Supabase; `src/data/` no toca el DOM.
- [ ] RLS activo y `GRANT` a `authenticated` en las cinco tablas nuevas.
- [ ] Toda RPC nueva es `security invoker` y tiene script de rollback verificado.
- [ ] `npm test` pasa completo sin conexión a base de datos.
- [ ] Usable a 375px con una mano; a 1280px se ve como una web.
- [ ] El flujo de import sigue funcionando exactamente igual, verificado de punta a punta.

---

## 14. Condiciones de parada

Parar y preguntar antes de: modificar el parser, las migraciones existentes o la lógica
de import; agregar cualquier dependencia; construir algo de cuentas de jugador; inventar
un umbral, una norma por edad o una métrica que no esté en este documento; escribir algo
fuera del alcance; o si un test falla dos veces por la misma causa.
