# Guías del salto y de las medidas corporales: diseño

**Origen:** maquetas de Stitch que trajo Tomás el 2026-09-24 (panel CMJ, "Guía de interpretación", "Protocolo antropométrico"). Se toman **las ideas de UI**, no los datos: Stitch no tenía contexto y varios números estaban mal (ver "Qué no se copia").

## Objetivo

Que el profe entienda **qué mide el salto, cuál es el número que importa y por qué**, y **cómo tomar bien las medidas** que necesita la potencia. Todo con menos datos en pantalla que la maqueta, porque saturaba, y con una etiqueta que muestre que el método es del club ("METODOLOGÍA LEPROSA").

## Decisiones tomadas

- **Se mantiene la identidad actual** (DESIGN.md): Barlow Condensed, Inter, Plex Mono, rojo del club y papel. No entran Oswald, el azul marino ni el fondo frío.
- **Etiqueta de metodología con apodos del club**: dos o tres palabras clave del club ("Leproso", "NOB") que van rotando. Quedan en la base (`club.apodos`), no en el código, porque la app es para varios clubes. Si un club no tiene apodos, se usa `club.nombre`.
- **Las guías se abren en la hoja que ya existe** (`abrirHoja`): no se crea un sistema de modales nuevo.

## Qué no se copia de Stitch

- La potencia sale con **Samozino** (`potenciaSamozino` en `src/data/salto.js`), no con Sayers.
- **L0 va del trocánter mayor a la punta del pie**, con el tobillo en flexión plantar, no hasta el talón.
- **No hay tabla de rangos de referencia, ni percentiles, ni metas por categoría**: no hay normas validadas. Si aparecen, van en otro spec.
- **No se muestra "+X cm contra la sesión anterior"**. Marcar mal un cuadro en el despegue y otro en el aterrizaje mueve la altura hasta unos 2 cm a 120 fps (1 cm a 240 fps): una diferencia de ese tamaño no es una mejora.

## Piezas

### 1. `club.apodos` (migración 0046)
- Columna `text[]` que admite null (null quiere decir "no tiene"). Van de 1 a 3 apodos, cada uno sin espacios en los extremos, no vacío y de 20 caracteres como máximo. Lo hace cumplir un `check` con una función inmutable `apodos_validos(text[])`.
- No se agrega ningún grant de escritura: `club` sigue siendo de sólo lectura para `authenticated` (0027). Los apodos se cargan por SQL, y los de Newell's (`'Leproso'`, `'NOB'`) van en la misma migración.
- Los límites se repiten en JS (`MAX_APODOS`, `LARGO_APODO`), así que lleva un test de contrato.

### 2. Etiqueta: `src/data/metodologia.js` (puro)
- `etiquetaMetodologia(club, azar = Math.random)` → `"Metodología Leproso"` (las mayúsculas las pone el CSS). Elige un apodo válido al azar. Si no hay apodos o son inválidos, usa `club.nombre`. Sin club, devuelve `"Metodología del club"`.
- Se elige una vez por cada apertura de la hoja, así el texto no cambia mientras se está leyendo.
- El jugador que entra con su cuenta no trae apodos (`main.js:159`), así que cae en `club.nombre`. Es aceptable: las guías son para los profes.

### 3. Sección Salto de la ficha, con menos información
- **Tarjeta del último CMJ**: **W/kg** como cifra héroe, con la etiqueta "Parámetro clave", y debajo tres datos chicos: altura (cm), tiempo en el aire (s) y potencia (W). Una línea de consistencia: "3 intentos · 1,8 cm entre el mejor y el peor". Arriba a la derecha, el botón "¿Cómo interpretarlo?", que abre la guía.
- Si falta la potencia: la cifra héroe pasa a ser la **altura**, y en vez de W/kg aparece "Sin potencia: falta peso o medidas de pierna" con un enlace "¿Cómo medirlas?" que abre el protocolo corporal. El dato que falta se muestra como falta (`.sin`), nunca como 0.
- **Sesiones anteriores**: una lista compacta (fecha · altura · W/kg) sin barras ni flechas.
- **Abalakov**: la misma tarjeta en un bloque aparte y más chica, porque no se compara con CMJ.

### 4. Guía de interpretación del salto (hoja)
La cabecera tiene ícono, título "Cómo leer el salto" y la etiqueta de metodología. Siguen tres secciones numeradas:
1. **Altura y tiempo en el aire.** La altura sale del tiempo en el aire, h = g·t²/8 (0,45 s ≈ 24,8 cm). Hay que aclarar el error de marcado (unos 2 cm a 120 fps) y que por eso 1–2 cm entre sesiones no significan nada.
2. **¿Por qué W/kg? (bloque destacado, el "parámetro clave").** Mide la potencia en relación con el propio peso, así que sirve para comparar chicos de distinto tamaño. Ejemplo calculado con `potenciaSamozino`:
   - Pivot: 95 kg, salta 30 cm, L0 105, hpush 58 → **1852 W · 19,5 W/kg**.
   - Base: 65 kg, salta 35 cm, L0 95, hpush 50 → **1485 W · 22,9 W/kg**.
   - El pivot tiene más watts, pero la base tiene más potencia para su cuerpo.
3. **Watts contra W/kg, y cómo comparar.** Qué usa Samozino (peso, pierna extendida y flexionada, todo vigente a la fecha del salto) y por qué aparece "sin datos". Para comparar: el chico consigo mismo, con el mismo test (CMJ con CMJ) y el mismo protocolo.

Cierra con el botón "Entendido".

### 5. Protocolo de medidas corporales (hoja)
Cabecera como la de la guía, con título "Cómo medir el cuerpo" y la etiqueta de metodología. Siguen tarjetas:
- **Pierna extendida (L0)**: dibujo SVG simple de la pierna recta y chip con el rango `60–130 cm`. Se mide del trocánter mayor a la punta del pie, con el tobillo estirado (flexión plantar), al medio centímetro.
- **Pierna flexionada (hpush)**: dibujo SVG en cuclillas y chip `30–110 cm`. Se mide del trocánter mayor al piso, en cuclillas con la rodilla a 90°.
- **Altura y peso**: `120–230 cm` descalzo, contra la pared; `25–150 kg` con poca ropa.
- **Nota final**: cualquiera de los cuatro datos se puede dejar vacío; sin las dos medidas de pierna y el peso no hay potencia.

Los rangos se leen de las constantes de `src/data/antropometria.js`, no se escriben a mano. Se abre con "¿Cómo medir?" desde "Agregar una medición" en la ficha (reemplaza el texto largo de `.ayuda` de la línea 574 por una ayuda corta más el botón) y desde el "sin potencia" de la pieza 3.

### 6. Protocolo del salto por video, en tarjetas
`protocoloHtml()` pasa de viñetas a tarjetas numeradas con el mismo estilo que la pieza 5: cámara, grabación, test, salto, intentos, marcado y después. El contenido no cambia. Sigue siendo un fragmento, porque el marcador lo muestra adentro de un `<details>`. Cuando se abre en la hoja, lleva la cabecera con la etiqueta.

## Estilo (componentes nuevos, sólo tokens)

- `.tag-metodo`: etiqueta en `--ff-titulo`, en mayúsculas, con fondo `--primario-tenue`, texto `--primario-osc` y radio `--r-s`.
- `.guia-cab`: ícono, título y etiqueta, más el subtítulo.
- `.guia-paso`: tarjeta numerada (número en Plex Mono).
- `.guia-clave`: bloque destacado con el filete del club, igual que `.al`.
- `.chip-rango`: el rango en mono.
- `.cifra-clave`: la cifra héroe con su unidad en `--primario`.
- Los SVG de pierna van con `currentColor` y viven en `iconos.js`.
- `tests/estilosTokens.test.js` tiene que seguir en verde. Todo se documenta en DESIGN.md.

## Fuera de alcance

Cambio de identidad global, rangos de referencia, sigla o color del club editable desde la app, guías en la vista del jugador (`jugProgreso.js`) y rediseño del sprint.
