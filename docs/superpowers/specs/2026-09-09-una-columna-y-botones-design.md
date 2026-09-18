# HOY y DATOS en una columna, y los botones del final

**Fecha:** 2026-09-09
**Estado:** para aprobar
**Alcance:** sólo presentación. Ninguna consulta, ningún cálculo, ninguna policy.

Incluye el plan de tareas al final.

---

## 1. Qué se saca, y por qué no se rebalancea

`.dos-col` se enciende a `min-width:80rem` y reparte `HOY` en dos columnas: el
arco completo más las cinco filas de zona a la izquierda, y tiros libres,
altura y peso y los botones a la derecha. La izquierda termina siendo tres
veces más larga y queda un hueco vertical grande del lado derecho.

**No se rebalancea qué va de cada lado.** Mover bloques arregla el hueco para
el estado actual de los datos y lo vuelve a abrir apenas cambia la cantidad de
zonas medidas o aparece un plantel con más historia. Una sola columna no tiene
ese modo de fallar.

### Las cinco condiciones de parada, verificadas

| Qué había que chequear | Resultado |
|---|---|
| ¿Sacar `.dos-col` cambia el orden de los bloques? | **No.** Aplanar las dos `.col` da exactamente el orden previo a la grilla, en las dos pantallas. |
| ¿`.col` hace algo más que armar la grilla? | **No.** Los cinco selectores que la mencionan son `.dos-col > .col`; nada de `componentes.css` cuelga de ella. |
| ¿`--max-ancho-2col` se usa en otro lado? | **No.** Un solo uso, `layout.css:250`, dentro del bloque que se saca. Queda huérfano y se borra. |
| ¿Algo más depende de la grilla? | **No.** `.dos-col` sólo aparece en `hoy.js` y `datos.js`. |
| ¿`.btn.osc` sigue en uso? | **No, está muerta.** Definida en `componentes.css:20`, cero usos en `src/`. Se borra. |

---

## 2. El ancho de la columna única

Acá hay una tensión real que conviene decir en voz alta, porque ya nos hizo ir
y volver una vez.

- **Columna angosta** (46rem, lo que hay hoy abajo de 80rem): las filas se leen
  bien, pero sobra margen al costado. Fue el reclamo que llevó a las dos
  columnas.
- **Columna ancha** (72rem): las filas de zona se estiran, la barra de una zona
  se vuelve una cinta de 800px y el nombre queda a un metro de su fracción. Fue
  el reclamo que llevó a angostarla.

El punto medio existe porque las filas ya tienen su propio tope
(`.zona,.curva{max-width:40rem}`). La columna puede crecer más que eso sin que
las filas se estiren; lo que aparece entonces es una franja vacía **adentro**
de la columna, a la derecha de cada fila.

**Cómo se decide:** no a ojo. Se prueban tres anchos con capturas reales a
1280px y 1920px, igual que se hizo para elegir los 46rem, y se elige mirando.
El candidato de partida es **52rem** (832px) con el tope de fila subido en
proporción, para que las filas llenen la columna y no quede franja adentro.

El criterio que ordena la decisión es el mismo de siempre: **blanco al costado
de la columna es margen de página y está bien; blanco adentro de una fila es
un defecto.**

---

## 3. Los botones del final de HOY

Hoy son tres `.btn sec`: contorno negro de 1.5px sobre fondo transparente.
"Ver el plantel" vive en `.pie-hoy` (el bloque de altura y peso, que ya tiene
su `border-top`), y "Cargar otra medición" y "Editar las metas" en
`.acciones-hoy`.

**Ninguno es la acción principal**, y eso no se toca: en `HOY` el profe puede
venir a cargar una medición, a mirar el plantel o a tocar las metas. Poner uno
en rojo relleno inventaría una prioridad que no existe.

El problema no es la falta de jerarquía, es el **peso**: tres contornos negros
seguidos son tres losas. La propuesta es aligerar la variante para que se lea
como un control y no como un bloque, usando el mismo lenguaje que ya tienen las
tarjetas del proyecto:

```
.btn.sec  →  fondo --blanco, borde 1px --gris-cl, sombra --sombra, texto --tinta
```

**Corrección posterior a la aprobación.** La primera versión de este spec
proponía el borde en `--linea`. Medido: **1.22:1 contra `--papel`**, muy lejos
del 3:1 que pide WCAG 1.4.11 para el contorno de un control. Con ese borde, la
sombra habría sido la única señal de que ahí hay un botón — y es lo primero que
desaparece en una pantalla con poco brillo. `--gris-cl` da **4.50:1 contra el papel y 5.08:1 contra el
blanco**, ya es un token del proyecto, y se verificó sobre la captura que el
borde de 1px se renderiza en exactamente ese color, sin antialiasing que lo
aclare.

Se conserva el `min-height` de 44px y el hover adentro de
`@media (hover:hover)`. El `:active` **no** se hereda: `.btn:active` pinta
`--rojo-osc`, y sobre fondo blanco con texto casi negro un secundario apretado
destellaba rojo oscuro. Tiene el suyo, en `--papel`.

**Dos arreglos que salieron al verificar**, fuera de lo que el spec preveía:

- **`.btn.chico` tenía `min-height:40px`**, que viola el criterio 5 desde antes
  de esta tanda. "Ver el plantel" es chico. Pasa a `--tap`.
- **`publico.css` tenía dos media queries de ancho**, que violan el criterio 7.
  Las introduje en la tanda de la landing. Se mueven a `layout.css` prefijadas
  con `.publico`: sin el prefijo, las reglas base de `publico.css` —que se
  carga después— les ganarían por orden de cascada.

A `.acciones-hoy` se le suma un `border-top` como el de `.pie-hoy`, para que el
par cierre la pantalla como grupo en vez de flotar.

### La única decisión abierta

**`.btn.sec` tiene 29 usos en 11 archivos.** Cambiarla toca casi todas las
pantallas, y el prompt dice "no rediseñar el resto de las pantallas de paso".

Dos caminos:

**A. Cambiar `.btn.sec` para toda la app.** Es el mismo componente haciendo el
mismo trabajo en todos lados; aligerarlo mejora todas las pantallas de forma
consistente. Contra: 11 archivos cambian de aspecto en una tanda que se pedía
acotada, y hay que mirarlos.

**B. Una clase nueva sólo para el grupo de HOY.** Cambio quirúrgico, cero
riesgo afuera. Contra: los botones de `HOY` quedan distintos de los del resto
de la app, que es otra inconsistencia — y la que más se nota, porque `HOY` es
la primera pantalla que ve el profe.

**Recomiendo A**, entendiendo "no rediseñar las pantallas de paso" como no
tocarles la estructura ni el contenido, no como congelar un componente
compartido. Pero es tu llamada: si preferís B, lo hago sin discutir.

---

## 4. Fuera de alcance

`src/data/`, `src/parser/`, `supabase/`. Qué datos se muestran, los textos y el
orden de los bloques. El CSS base de celular — todo el cambio de disposición
vive dentro de `@media (min-width:…)`. Breakpoints fuera de `layout.css`.
Dependencias, animaciones y transiciones nuevas.

---

## 5. Plan de tareas

### Tarea 1 — Capturar el estado previo de móvil
Antes de tocar nada, capturas de `HOY` y `DATOS` a 375px con el banco de
pruebas y Chrome headless. El criterio 2 pide comparar contra el estado
previo, no confiar en la vista.

### Tarea 2 — Sacar la grilla
- `layout.css`: borrar el bloque `@media (min-width:80rem)` entero.
- `tokens.css`: borrar `--max-ancho-2col`, que queda huérfano.
- `hoy.js` y `datos.js`: sacar los envoltorios `.dos-col` y `.col`.
- **El `.sep` vuelve a su lugar en el flujo**, entre el arco y los libres. Ya no
  hay `gap` que lo reemplace, así que separa en todos los anchos (criterio 3).
- `npm test`.

### Tarea 3 — Elegir el ancho, mirando
Generar `HOY` a 1280px y 1920px con tres anchos (46 / 52 / 58rem) y su tope de
fila correspondiente. Elegir por captura, no por criterio abstracto. Ajustar
`--max-ancho` y `.zona,.curva` en consecuencia.

### Tarea 4 — Los botones
- `componentes.css`: aligerar `.btn.sec` (o crear la clase nueva, según la
  decisión de la sección 3), y `border-top` en `.acciones-hoy`.
- Borrar `.btn.osc`, que está muerta.
- Capturas de `HOY` a 1280px para confirmar que los tres se leen parejo.

### Tarea 5 — Verificar y reportar
- Capturas a **375, 768, 1280 y 1920**, y decir qué se ve en cada uno.
- **Diff de píxeles contra las capturas de la Tarea 1** para probar que 375px no
  cambió, en vez de afirmarlo.
- Grep: breakpoints sólo en `layout.css`; `hover` sólo dentro de
  `@media (hover:hover)`; ningún `src/ui/` importando `@supabase/supabase-js`.
- `npm test` en verde.
