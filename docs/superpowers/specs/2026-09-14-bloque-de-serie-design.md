# Bloque de serie compartido: gráfico visible y detalle colapsado

**Fecha:** 2026-09-14
**Estado:** para aprobar — sin código todavía
**Pantallas:** `src/ui/pantallas/coordPanorama.js`, `src/ui/pantallas/fichaJugador.js`
**Componente nuevo:** `src/ui/componentes/detalleColapsable.js`

---

## 0. Qué problema resuelve

El Panorama ya tiene el patrón: gráfico siempre visible, el último dato en
texto, y el historial completo detrás de "Ver detalles" (`<details>` nativo).

La ficha del jugador tiene la mitad: gráfico y leyenda, y debajo las dos tablas
—práctica y partido— **siempre desplegadas**, cada una encabezada por su propia
leyenda. Como la leyenda del gráfico dice "Práctica · Partido" y la primera
tabla arranca con "Práctica", el encabezado se lee repetido. No es un problema
de texto: es que la tabla está a la vista cuando debería estar guardada.

Hoy hay dos implementaciones del mismo comportamiento, y sólo una está completa.

---

## 1. Qué se comparte y qué no

**Se comparte un solo componente: el colapsable.** Recibe tablas ya armadas y se
ocupa nada más de mostrarlas y ocultarlas.

**No se comparte el bloque entero** (título + gráfico + leyenda + resumen +
detalle) aunque el nombre del pedido lo sugiera. El motivo es concreto:

| | Panorama | Ficha |
|---|---|---|
| Título | `.k` adentro de la tarjeta de categoría | `.eyebrow`, con fecha a la derecha |
| Resumen | dos columnas (batería y partidos) con número grande | una línea por fuente, tamaño normal |
| Gráficos por colapsable | **dos** (triples y libres) bajo un único "Ver detalles" | **uno** por bloque |
| Tablas | 4 (2 tipos × 2 fuentes) | 2 (práctica y partido) |

Un componente que abarcara todo eso necesitaría opciones para el tipo de
título, el formato del resumen y la cantidad de gráficos por botón: terminaría
siendo dos componentes con un `if`. Esto es lo que la condición de parada del
pedido pide avisar, y la salida es partir más fino, no forzarlo.

**Consecuencia buscada:** el Panorama conserva **un** "Ver detalles" por
tarjeta, y la ficha tiene uno por bloque (tres y libres). Las dos pantallas
comparten el mismo comportamiento y el mismo CSS, que es el criterio de
aceptación: una sola implementación de "ver detalle".

---

## 2. El componente

`src/ui/componentes/detalleColapsable.js`

```js
detalleColapsableHtml(tablas) → string
```

| Parámetro | Qué es |
|---|---|
| `tablas` | `[{ nombre, html }]`, una o más. `nombre` es el encabezado que se ve al desplegar ("Práctica", "Partido", "Triples · Batería"). `html` es la tabla ya armada por la pantalla. |

**Un solo texto de botón, sin parámetro: "Ver detalles" / "Ocultar detalles".**
Es la misma acción en las dos pantallas —desplegar el historial— y dos textos
distintos para lo mismo es la clase de inconsistencia que se nota sin saber por
qué. Una etiqueta configurable existiría hoy sin un solo uso.

Reglas:

- **Sin tablas, devuelve string vacío.** Sin nada que desplegar no hay botón: es
  lo que ya hace el Panorama con una categoría sin datos.
- **Una tabla con `html` vacío no entra.** Que la pantalla decida no armar una
  fuente sin puntos no obliga a filtrar dos veces.
- **Siempre cerrado al renderizar.** Sin `open`, en las dos pantallas. No se
  recuerda el estado entre visitas.
- **El componente no sabe de tiro, de partidos ni de jugadores.** Recibe HTML y
  nombres. Lo que va adentro de cada tabla se sigue decidiendo en
  `fichaJugador.js` y `coordPanorama.js`, y los datos en `estadisticas.js` y
  `coordinacion.js`.
- **No dibuja gráficos ni recibe el `<svg>`.** El gráfico queda afuera, siempre
  visible, que es la decisión 1 del pedido y ya rige en el Panorama.

### Marcado y táctil

`<details>` + `<summary>` nativos, como hoy en el Panorama:

- Se abre con el dedo, con teclado (Enter/Espacio) y con lector de pantalla, que
  lo anuncia como botón expandible con su estado. Sin JS, sin estado que
  sincronizar.
- `summary` de `min-height: var(--tap)` (44px), ancho completo, tocable en toda
  la franja.
- El texto cambia con CSS (`details[open]`), no con JS: dos `span`, y la flecha
  rota con el mismo selector. **Nada depende de `hover`.**
- Foco visible por la regla global `*:focus-visible` de `base.css`.
- Sin el marcador nativo (`list-style:none` y `::-webkit-details-marker`, que es
  lo que dibuja Safari en iOS).

### CSS

Las reglas de `.detalles-cat` que hoy viven en `componentes.css` pasan a
llamarse `.detalle-colapsable`, sin cambiar valores. Es el mismo bloque, con un
nombre que ya no habla de categorías. El Panorama deja de tener CSS propio para
esto.

---

## 3. Qué cambia en la ficha del jugador

Los dos bloques de serie —**Tiro de tres** y **Tiro libre**— pasan a:

1. Título (`.eyebrow`) y gráfico: **igual que hoy**. **La leyenda aparte
   desaparece:** cada línea del resumen lleva la marca de su curva (raya llena
   para práctica, punteada roja para partido). Con leyenda arriba y resumen
   abajo, "Práctica" quedaba dicho dos veces seguidas — el mismo defecto que
   esta tarea vino a sacar, con otro texto.
2. **Resumen nuevo, siempre visible:** una línea por fuente con la fecha del
   último punto y su fracción. Reemplaza a la tabla completa como "lo que se ve
   sin tocar nada".
3. **Detalle colapsado:** las dos tablas de hoy (práctica y partido), con sus
   nombres, detrás del botón.

> **Aclaración sobre el pedido:** dice "las series de tiro (por zona y de
> tres)". En la ficha no hay series por zona: hay **Tiro de tres** y **Tiro
> libre**, más la cancha por posición, que no es una serie en el tiempo y no se
> toca. Las curvas por zona están en DATOS, fuera de este alcance (§6).

### La variación en la ficha: qué se muestra y qué no

La decisión 1 pide "variación si corresponde". Acá corresponde poco:

- Se muestra **sólo cuando esa fuente tiene dos puntos o más**, con
  `variacionHtml` y `compararPorcentajes`, exactamente la misma regla de margen
  que el resto de la app (Agresti-Caffo al 95%).
- Una batería individual son ~50 tiros de arco y ~10 libres, así que el margen
  es ancho y casi siempre va a decir "sin diferencia clara". **Eso es lo
  correcto** y es la razón por la que se muestra el número igual, con su
  fracción: el dato se ve, la afirmación no se hace.
- Con un solo punto: "Una sola medición: todavía no hay con qué comparar",
  mismo criterio que el Panorama.

**Confirmado el 2026-09-14: la variación queda.** Sacarla de la ficha y dejarla
en el Panorama trataría el dato individual distinto del agregado sin una razón
real, y el día que un jugador acumule una diferencia que sí supera el margen,
tiene que verse. Que diga "sin diferencia clara" casi siempre no es ruido: es la
misma honestidad que la marca de muestra chica.

### Estado vacío

Sin ningún punto en las dos fuentes, el bloque sigue mostrando el texto de hoy
("Todavía no hay datos de triples, ni de práctica ni de partido") y **no** se
dibuja gráfico ni botón. Sin cambios.

---

## 4. Qué cambia en el Panorama

Poco, y nada visible:

- El `<details>` escrito a mano en `coordPanorama.js` se reemplaza por el
  componente, con cuatro tablas nombradas: `Triples · Batería`,
  `Triples · Partidos`, `Libres · Batería`, `Libres · Partidos`.
- **Se pierde el subtítulo por tipo** que hoy agrupa las tablas adentro del
  detalle ("Triples · fecha por fecha"). Lo reemplaza el nombre de cada tabla,
  que dice lo mismo en una línea en vez de dos. Es el único cambio que se ve.
- Todo lo demás —resumen de dos columnas, gráfico siempre visible, estados
  vacíos, un solo botón por tarjeta— queda igual.

---

## 5. Cómo se verifica

- **Tests que ya existen y tienen que seguir pasando:** `importsResueltos`
  (imports nuevos), `coordinacionSinDatosIndividuales` (la pantalla de
  coordinación no pide datos de jugador ni usa palabras de ranking), y el resto
  de `npm test`.
- **Test nuevo del componente**, puro, sin DOM: sin tablas devuelve `''`; con
  dos tablas devuelve un `<details>` sin `open`, con los dos nombres; una tabla
  con `html` vacío no aparece.
- **Guarda de comportamiento:** un test que lea las dos pantallas y verifique
  que ninguna escribe `<details` a mano — que es lo que evita que vuelvan a
  existir dos implementaciones.
- **Capturas** con el banco de pruebas, a 375px y en escritorio: ficha con las
  dos fuentes, ficha con una sola, Panorama cerrado y abierto. Medir que cada
  `summary` mida 44px.

---

## 6. Fuera de alcance

- **DATOS.** Sus curvas por zona (`.curva-zona`) muestran la tabla completa
  debajo del gráfico y son el próximo candidato natural del componente, pero
  cambiarlas ahora amplía el alcance y toca una pantalla que nadie pidió.
- HOY y MEDIR.
- La cancha por posición de la ficha: no es una serie en el tiempo.
- Rediseñar el gráfico, cambiar qué datos entran en cada tabla, o tocar
  `variacion.js`, `estadisticas.js` y `coordinacion.js`.
- Recordar qué bloques quedaron abiertos.
