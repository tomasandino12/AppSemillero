# Panorama de coordinación: tiro en partidos, detalle colapsado y número principal

**Fecha:** 2026-09-13
**Estado:** para aprobar — sin código todavía
**Pantalla:** `src/ui/pantallas/coordPanorama.js` (Panorama, modo coordinación)
**Depende de:** `0017_coordinacion.sql` (panorama_del_club), `0018_endurecer_coordinador.sql` (el coordinador no lee filas de jugador)

---

## 0. Qué cambia y qué no

Tres cambios pedidos por Tomás después de ver la pantalla en producción:

1. **Tiro en partidos.** Por categoría, una serie de triples y una de libres
   calculadas desde los partidos importados, **al lado** de las de batería,
   nunca mezcladas ni promediadas con ellas.
2. **Detalle colapsado.** Siempre visibles: último valor, fracción, variación
   y el gráfico de evolución de cada tipo. Detrás de "Ver detalles", que se
   abre en la misma tarjeta, van sólo las tablas fecha por fecha.
   *(Cambiado el 2026-09-14 a pedido de Tomás: la primera versión escondía
   también el gráfico. Donde este spec dice que el gráfico está en el detalle
   — wireframes de §4, §4.3 y §5 — rige esto.)*
3. **Jerarquía del número principal.** Más grande, más peso, un color de
   acento fijo. El color no dice si mejoró: eso lo sigue diciendo sólo
   `variacionHtml`.

**No cambia:** cada categoría se compara sólo consigo misma; orden fijo del
catálogo; ningún ranking, promedio del club ni etiqueta; ningún porcentaje sin
denominador; el umbral de muestra chica y el margen de error siguen viviendo en
`estadisticas.js`. `variacion.js` **no se toca** (§6).

---

## 1. De dónde sale la serie de partidos

### 1.1 Por qué hace falta tocar la base

Desde 0018 el coordinador **no puede leer** `partido` ni
`estadistica_jugador_partido`: las policies pasan por `puede_ver_plantel`, que
ya no tiene rama de coordinador. Esto no se resuelve del lado del cliente —
`obtenerEstadisticasDelPlantel` le devuelve cero filas, y además la guarda de
arquitectura (`tests/coordinacionSinDatosIndividuales.test.js`) prohíbe que las
pantallas de coordinación la llamen.

La serie tiene que llegar por `panorama_del_club` (0017), que es `security
definer`, exige ser coordinación de ese club y devuelve **sólo sumas**. Es la
misma puerta por la que ya llega el tiro de batería.

### 1.2 Propuesta: extender `panorama_del_club` con una clave `partidos`

**Migración aparte: `0022_panorama_partidos.sql`.** (0020 es el plan físico,
aplicado sólo en local; 0021 está reservada para su RPC. Si ese orden cambia al
implementar, se toma el próximo número libre.)

`create or replace function panorama_del_club(p_club_id uuid) returns jsonb`,
misma firma, mismo chequeo de entrada, mismas dos claves de hoy, y una tercera:

```json
{
  "planteles": [ ...sin cambios... ],
  "tiro":      [ ...sin cambios... ],
  "partidos": [
    { "plantelId", "partidoId", "fecha", "rival",
      "tresAnotados", "tresIntentados", "libresAnotados", "libresIntentados" }
  ]
}
```

Una fila **por partido** de los planteles del club, con los tiros **sumados
entre los jugadores de ese partido**:

```sql
select pa.plantel_id, pa.id, pa.fecha, pa.rival_nombre,
  sum(e.tres_anotados)     filter (where e.tres_anotados   is not null and e.tres_intentados   is not null),
  sum(e.tres_intentados)   filter (where e.tres_anotados   is not null and e.tres_intentados   is not null),
  sum(e.libres_anotados)   filter (where e.libres_anotados is not null and e.libres_intentados is not null),
  sum(e.libres_intentados) filter (where e.libres_anotados is not null and e.libres_intentados is not null)
from public.partido pa
join public.plantel pl on pl.id = pa.plantel_id and pl.club_id = p_club_id
left join public.estadistica_jugador_partido e on e.partido_id = pa.id
group by pa.plantel_id, pa.id, pa.fecha, pa.rival_nombre
```

**Por qué así y no de otra forma:**

| Alternativa | Por qué no |
|---|---|
| Función nueva `tiro_en_partidos_del_club` | Dos llamadas, dos chequeos de permiso idénticos, y dos lugares para mantener el contrato "sólo sumas". La pantalla ya hace una sola lectura de panorama. |
| Vista SQL | Una vista hereda la RLS de las tablas: el coordinador vería cero filas, igual que desde el cliente. Habría que hacerla `security_barrier` con dueño privilegiado, que es una función con otro nombre. |
| Sumar en la base y devolver porcentajes | Rompe la regla de 0017: el porcentaje, el umbral y el margen se calculan en `estadisticas.js`. La base devuelve sumas. |
| Agregar por mes en vez de por partido | Introduce una ventana de tiempo que no existe en ningún otro lado de la app, y "mes" mezcla partidos con rivales muy distintos en un solo punto. Partido a partido es lo que ya muestra DATOS. |

**Detalles de la agregación:**

- **Pares anotados/intentados juntos.** El `filter` suma una fila sólo si
  tiene los dos números. Una fracción tiene que salir de las mismas filas
  arriba y abajo; un jugador con intentados leídos y anotados no leídos
  inflaría el denominador. (DATOS suma cada campo por separado en
  `evolucionDeTiroDelEquipo`. La diferencia sólo aparece si el parser leyó uno
  de los dos campos de una fila y no el otro. No se cambia DATOS: fuera de
  alcance.)
- **`left join`:** un partido importado sin ninguna estadística aparece con las
  sumas en `null`. No genera punto (§2), pero cuenta como "hay partidos".
- **`rival`** es el nombre del rival: información pública de competencia, no un
  dato de menores (ESQUEMA.md, `partido`). Sirve para reconocer el partido en el
  detalle.
- **Sin nombres de jugadores, sin filas individuales.** Mismo contrato que
  `tiro`. Con uno o dos jugadores en planilla la suma se parece a un dato
  individual; es el mismo caso que ya se aceptó para la batería, y se decidió no
  sumar un segundo umbral (Decisión 3 del panel de coordinación).
- **Todas las temporadas.** Igual que `tiro`: el filtro por temporada más
  reciente lo hace `armarPanorama` en el cliente.

**Verificación en la base:** `tests/verificarCoordinacion.sql`, caso 9, suma:
un partido sintético en U17M con dos filas de estadística (2/5 y 1/4 en triples,
3/4 y un par con `libres_intentados` en null) → `tresAnotados 3`,
`tresIntentados 9`, `libresAnotados 3`, `libresIntentados 4`; el partido de U21M
sin números aparece con sumas `null`; y la lista de claves permitidas se amplía
a las ocho de `partidos`. El caso 3 ya cubre que un entrenador no puede llamar a
la función.

---

## 2. Cómo se calcula lo que se muestra

Todo en `src/data/`, puro y testeado.

### 2.1 La serie

`serieDePartidosAgregada(filas, tipo)` en `estadisticas.js`, con `tipo` =
`'tres'` o `'libres'`:

```
[{ partidoId, fecha, rival, valor: porcentaje(anotados, intentados) }]
```

Ordenada de la más vieja a la más nueva. **Un partido sin intentos de ese tipo
no genera punto** — `porcentaje()` devuelve `null` con 0 intentos o sumas
`null`, y la serie lo descarta. Un hueco no es un cero: un partido de U13 sin
ningún triple intentado no es "0% en triples".

### 2.2 Margen de error

La misma de toda la app, sin fórmula nueva: `compararPorcentajes(último,
anterior)` de `estadisticas.js`, que usa `margenDeDiferencia`:

```
p̃ = (anotados + 1) / (intentos + 2)        ← ajuste Agresti-Caffo
varianza = p̃A(1 − p̃A)/(nA + 2) + p̃B(1 − p̃B)/(nB + 2)
margen (pp) = 1,96 · √varianza · 100          ← 95%
concluyente = |pp| > margen
```

**Qué esperar, dicho con números:** un equipo de inferiores intenta del orden
de 15 a 30 triples por partido. Con 25 intentos al 30% en cada partido el
margen de la diferencia ronda los **±25 pp**. La serie de partidos va a decir
"sin diferencia clara" casi siempre. Es el comportamiento correcto: el número
se muestra igual, con su fracción, y la forma de la serie en el detalle es lo
que se lee. Lo mismo, más marcado, para partidos con pocos intentos: con menos
de 10 (`UMBRAL_INTENTOS`) el punto se marca "pocos datos" y se dibuja hueco.

**No se compara batería contra partido.** Nunca se resta una serie de la otra
(mismo criterio que `serieDeTiroDelJugador`): se muestran lado a lado y la
lectura la hace la persona. La comparación práctica-vs-partido es legítima a
nivel triples totales y libres porque el boxscore no dice desde dónde se tiró;
por eso los bloques son **Triples** y **Libres**, y adentro de cada uno van las
dos fuentes.

### 2.3 Lo que devuelve `armarPanorama`

Cada tarjeta pasa de `triples: { serie, variacion }` a:

```
triples: {
  bateria: { serie, variacion },
  partido: { serie, variacion },
},
libres: { bateria: {…}, partido: {…} },
```

Más `partidos` (el conteo que ya existe) para distinguir los estados vacíos.
Sin ningún campo que compare con otra categoría; el test de claves de la
tarjeta se actualiza con la forma nueva.

---

## 3. Estados vacíos: nunca un 0% engañoso

Por fuente, dentro de cada bloque:

| Situación | Qué se muestra en el lugar del número |
|---|---|
| Sin baterías de tiro | "Sin baterías" |
| **Sin partidos importados** (`partidos = 0`) | "Sin partidos importados" |
| Hay partidos pero ninguno con intentos de ese tipo | "Ningún partido con triples intentados" (o "con libres") |
| Un solo punto | El número con su fracción, y en el lugar de la variación: "Un solo partido: todavía no hay con qué comparar" (o "Una sola batería…", el texto de hoy) |
| Dos o más puntos | Número, fracción y `variacionHtml` |

En gris, tamaño de texto normal, sin número grande: un estado vacío no puede
ocupar el lugar visual de un dato.

**Categoría sin nada** (sin baterías y sin partidos con intentos): la tarjeta
muestra los datos operativos, "A cargo", y una sola línea "Todavía no hay
baterías ni partidos con tiros en U13M". Sin bloques Triples/Libres y **sin
"Ver detalles"**: no hay nada que desplegar.

---

## 4. La tarjeta

### 4.1 Wireframe — cerrada (el default)

```
┌─────────────────────────────────────────────┐
│ U17M  Sub-17 Masculino                      │
│ 14 jugadores · 6 partidos importados ·      │
│ última medición 14/06                       │
│ A cargo: Cuenta de prueba                   │
├─────────────────────────────────────────────┤
│ TRIPLES                                     │
│ BATERÍA · 14/06        PARTIDOS · 20/06     │
│ 38%  266/700           31%  12/39           │
│ ▲ +5 pp vs 12/05       +4 pp · sin          │
│                        diferencia clara     │
├─────────────────────────────────────────────┤
│ LIBRES                                      │
│ BATERÍA · 14/06        PARTIDOS             │
│ 71%  99/140            Sin partidos         │
│ −2 pp · sin            importados           │
│ diferencia clara                            │
├─────────────────────────────────────────────┤
│ [ Ver detalles                          ▾ ] │ ← botón de 44px, ancho completo
└─────────────────────────────────────────────┘
```

- **Dos columnas dentro de cada bloque, batería a la izquierda y partidos a la
  derecha**, siempre en ese orden. Entran a 375px: el ancho útil de la tarjeta
  es ~311px, cada columna ~150px; el número (`38%`) mide ~60px y la fracción va
  al lado en tamaño chico. Si la variación no entra en una línea, baja a la
  siguiente — nunca se corta.
- **Etiqueta de fuente** (`BATERÍA · 14/06`): la fecha es la del último punto.
  Sin ella, "38%" no dice de cuándo es.
- **Un solo "Ver detalles" por tarjeta**, no uno por bloque: la tarjeta cerrada
  tiene un único control, y abrirla muestra todo lo de esa categoría.

### 4.2 Wireframe — abierta

```
├─────────────────────────────────────────────┤
│ [ Ocultar detalles                      ▴ ] │
│ TRIPLES · batería por batería y partido     │
│ a partido                                   │
│  100 ┤                                      │
│      │   ●──●        ●                      │
│   50 ┤  ○‐ ‐ ‐○‐ ‐ ‐ ‐ ‐○                    │
│    0 ┼──────────────────────                │
│      12/05 20/05 14/06 20/06                │
│  ━ Batería   ┅ Partidos                     │
│  BATERÍA                                    │
│  14/06   38% · 266/700   14 jugadores       │
│  12/05   33% · 231/700   13 jugadores       │
│  PARTIDOS                                   │
│  20/06   31% · 12/39     vs Rosario Central │
│  03/06   27% · 8/30      vs Atlético Fisherton
│ LIBRES · …igual…                            │
└─────────────────────────────────────────────┘
```

- **Un gráfico por tipo con las dos fuentes**, en el mismo eje de fechas: la
  unión de las fechas de batería y de partido, cada serie con huecos donde no
  tiene punto. Es `ejeComun` de `fichaJugador.js`, que se mueve a
  `estadisticas.js` para usarlo desde las dos pantallas (§7).
- **Mismo lenguaje visual que la ficha del jugador:** batería en `--tinta`
  sólida, partidos en `--rojo` punteada, con las leyendas `.linea-practica` y
  `.linea-partido` que ya existen. Eje fijo 0–100 como hoy. Muestra chica, punto
  hueco.
- **Tablas debajo del gráfico, una por fuente**, del más reciente al más viejo.
  Batería con "N jugadores" (como hoy); partidos con el rival, cortado con
  puntos suspensivos si no entra.

### 4.3 Cómo conviven las dos fuentes sin saturar

- **Cerrada** la tarjeta tiene, por tipo, dos números y dos variaciones. Nada
  de gráficos ni tablas: con seis categorías, hoy la pantalla son seis
  gráficos y seis tablas por tipo; cerrada pasan a ser seis resúmenes.
- **Las fuentes nunca se unen en un número.** No hay "total", "promedio" ni
  "diferencia batería − partido".
- **Orden fijo** batería → partidos en el resumen, en la leyenda y en las
  tablas, en todas las tarjetas. El ojo aprende dónde está cada cosa.

---

## 5. "Ver detalles": interacción y táctil

**Elemento nativo `<details>` + `<summary>`**, no un botón con JS:

- Se abre y cierra sin código, con teclado (Enter/Espacio) y con lector de
  pantalla (el `summary` se anuncia como botón expandible con su estado). No
  hay estado que sincronizar.
- Ya se usa en la app (`resultadoImport.js`, advertencias del import).
- **Colapsado por defecto** en cada visita: sin `open` en el HTML. No se
  recuerda si estaba abierto; volver a entrar al Panorama arranca en resumen.
- Se abre **en la misma tarjeta**, empujando hacia abajo. Sin hoja, sin modal.

**Táctil (resuelto acá, no al programar):**

- `summary` con `min-height: var(--tap)` (44px), ancho completo de la tarjeta,
  área tocable en toda la franja y no sólo en el texto.
- Texto que cambia con el estado **sólo con CSS**: dos `span` ("Ver detalles" /
  "Ocultar detalles") y `details[open]` decide cuál se ve. Flecha ▾/▴ con el
  mismo selector. Nada depende de `hover`.
- Sin el marcador nativo: `summary{list-style:none}` y
  `summary::-webkit-details-marker{display:none}` (Safari iOS lo dibuja aparte).
- Foco visible sin CSS nuevo: la regla global `*:focus-visible` de `base.css`
  ya le pone el contorno rojo al `summary`, como a cualquier botón.

**Dos consecuencias de diseño:**

- **Gráficos dibujados al renderizar, aunque estén cerrados.** `grafico()` no
  mide el DOM (usa `viewBox` fijo de 320 de ancho), así que dibujar dentro de un
  `<details>` cerrado funciona y al abrir ya está. No hace falta dibujar al
  abrir.
- **En escritorio la grilla no estira a las vecinas.** Hoy `.panorama` es una
  grilla de columnas; abrir una tarjeta alargaría la fila entera. Se agrega
  `align-items: start` a `.panorama` (no es un breakpoint, va en
  `componentes.css`).

---

## 6. El número principal y el color

**Estilo:** el número del resumen pasa a IBM Plex Mono, `--fs-300` (1,875rem,
el mismo tamaño que el total de HOY), peso 600, con el `%` en `--fs-190` y
`--gris-cl`. La fracción al lado en `--fs-135`, `--gris-cl`.

**Color: `--rojo`, fijo.** Es el único acento de la paleta (el resto son
neutros y los semánticos `--sube`/`--baja`, que sí significan algo).

**El conflicto, dicho explícitamente:** `.var.sube` también es `--rojo` — en HOY
"▲ +5 pp" es rojo. Un número rojo al lado podría leerse como "sube". Se acepta
con estas tres garantías, que el implementador no puede relajar:

1. El número es rojo **en todas las tarjetas, las dos fuentes y los dos tipos,
   con cualquier valor**. Como no cambia nunca, no puede comunicar nada.
2. La variación sigue en su propio elemento, con su **flecha**, que es la señal
   de verdad (comentario de `variacionHtml`: "la flecha es la señal, no el
   color"). Cuando no es concluyente, sale gris, al lado de un número rojo:
   el contraste deja claro que son dos cosas distintas.
3. El estado vacío nunca usa el estilo del número (§3).

Contraste: `--rojo` (#D9122E) sobre blanco da ~5:1, sobra para texto de 30px.

**Si al verlo en la pantalla la confusión con "sube" resulta real**, la
alternativa es `--tinta` con el mismo tamaño y peso: la jerarquía la da el
tamaño, no el color. Se decide mirando capturas, no ahora.

**`variacion.js` no se toca.** Sigue siendo la única fuente de color
condicionado al margen, y el Panorama la sigue usando tal cual. Ninguna clase
nueva repite `.var.sube` / `.var.baja`.

---

## 7. Qué se toca al implementar

| Archivo | Cambio |
|---|---|
| `supabase/migrations/0022_panorama_partidos.sql` | **Nueva.** `create or replace panorama_del_club` con la clave `partidos` (§1.2). |
| `tests/verificarCoordinacion.sql` | Caso 9: partido sintético, sumas por par, sumas `null`, claves permitidas de `partidos`. |
| `src/data/estadisticas.js` | `serieDePartidosAgregada(filas, tipo)`; `ejeComun` movido desde `fichaJugador.js`, devolviendo el objeto `valor` alineado (no sólo `pct`) para poder marcar muestra chica. |
| `src/ui/pantallas/fichaJugador.js` | Importa `ejeComun` y toma `.pct`. **Mismo resultado en pantalla**; es mover una función, no cambiarla. |
| `src/data/coordinacion.js` | `armarPanorama` con `bateria`/`partido` por tipo (§2.3). |
| `src/ui/pantallas/coordPanorama.js` | Resumen de dos columnas, estados vacíos, `<details>`, gráfico de dos fuentes y tablas. |
| `public/css/componentes.css` | Resumen de fuente, número principal, `summary`, `.panorama{align-items:start}`. |
| `tests/estadisticas.test.js` | `serieDePartidosAgregada`: orden, 0 intentos → sin punto, sumas `null` → sin punto, umbral de muestra chica; `ejeComun` con fechas intercaladas. |
| `tests/coordinacion.test.js` | Forma nueva de la tarjeta, variación por fuente, estados vacíos, orden de catálogo sin cambios, partidos de otra temporada afuera. |
| `tests/coordinacionSinDatosIndividuales.test.js` | Sin cambios: tiene que seguir pasando. Es la prueba de que la serie no se armó leyendo estadísticas individuales. |

**Orden sugerido:** migración y verificación SQL → funciones puras con tests →
`armarPanorama` → pantalla y CSS → capturas a 375px y en escritorio (una
categoría con todo, una sin partidos, una sin nada, y una tarjeta abierta).

**Despliegue:** 0022 antes que el frontend. Si el frontend sale primero,
`panorama.partidos` llega `undefined` pero el conteo `partidos` de cada plantel
sí llega: el cliente trata la lista como vacía y, en las categorías con
partidos, muestra "Ningún partido con triples intentados" — falso, aunque la
pantalla no se rompe. Por eso el orden no es opcional.

---

## 8. Fuera de alcance

- Comparar categorías entre sí, promedio del club, ranking, o cualquier etiqueta
  de juicio (sigue prohibido; `coordinacionSinDatosIndividuales.test.js` ya
  busca esas palabras).
- Restar o combinar batería y partido en un número.
- Tiro de dos, puntos, minutos o cualquier otra estadística de partido.
- Recordar qué tarjetas estaban abiertas.
- Cambiar DATOS, HOY o la ficha del jugador más allá de mover `ejeComun`.
- Tocar `variacion.js`.
