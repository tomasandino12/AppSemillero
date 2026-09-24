# Prompt para Stitch: sprint y Yo-Yo

Pegar en Stitch (modo mobile, 375 px). Es referencia visual: al implementar mandan DESIGN.md y las clases que ya existen.

---

App móvil para profes de básquet formativo que la usan **en la cancha, con el celular en una mano, a pleno sol**. Diseñá 5 pantallas mobile (375 px de ancho) en español rioplatense (voseo).

**Estilo (obligatorio):** tema claro, sin modo oscuro. Fondo papel `#F3F1ED`, tarjetas blancas con sombra suave y radio 12 px, texto `#131316`, gris secundario `#6E6B66`. Un solo color de marca, rojo `#D9122E`, usado con avaricia (botón principal, unidad de una cifra, relleno de barra). Verde para "mejoró" y ámbar para "empeoró" (no dependen del rojo). Títulos y rótulos en **Barlow Condensed**, mayúsculas, con aire entre letras; texto en **Inter**; todos los números en **IBM Plex Mono** con dígitos de ancho fijo. Sin ilustraciones, sin degradados, sin íconos decorativos. Botones de al menos 48 px de alto; los de uso durante la prueba, enormes. Un dato que falta se muestra como "—" en gris, nunca como 0.

**1. Medir sprint (lista).** Cabecera oscura "SPRINT · U15M". Fila con la fecha y un selector segmentado de distancia **30 m / 20 m** (30 elegido). Botón secundario chico "¿Cómo medir?". Lista del plantel: cada jugador en una tarjeta con nombre ("Pérez, Juan"), y dos casillas de intento ("1" y "2"): una vacía con un botón "Correr", la otra con un tiempo cargado "4,6 s" en mono. El mejor intento resaltado. Un jugador marcado "ausente" en gris. Pie fijo con botón principal rojo "Guardar sesión".

**2. Cronómetro de salida (pantalla completa, fondo oscuro `#131316`).** Arriba: "Pérez, Juan · intento 1 · 30 m". Centro: tres estados en tres cuadros: (a) "EN SUS MARCAS… LISTOS…" en grande, esperando el pitido; (b) corriendo: reloj enorme en mono "3,4" que avanza y, ocupando toda la mitad inferior, un botón rojo gigante "LLEGÓ"; (c) terminado: "4,6 s" enorme, debajo "6,5 m/s", y dos botones "Guardar" (principal) y "Repetir" (secundario). Una X para cancelar arriba a la izquierda.

**3. Sprint en la ficha del jugador.** Rótulo "SPRINT" y botón chico "¿Cómo interpretarlo?". Tarjeta de la última sesión de 30 m: fecha, mejor tiempo "4,6 s" grande, "6,5 m/s", y un chip verde "−0,2 s vs 12/08". Debajo, una tabla compacta con sesiones anteriores (fecha · tiempo · m/s). Una fila de otra sesión lleva una etiqueta chica con borde "CReAR · más exacto".

**4. Yo-Yo en curso (pantalla completa).** Arriba, enorme y en mono: "NIVEL 7 · IDA 4", con "11,0 km/h" y una barra fina de progreso del nivel. Debajo, una grilla de 2 columnas con los jugadores que corren como botones grandes: normales en blanco, uno con aviso en ámbar ("aviso"), dos afuera en gris con su marca "6.9" y "7.2". Botones abajo: "Deshacer" (secundario) y "Terminar" (principal).

**5. Resumen del Yo-Yo.** Lista de jugadores con su resultado "7.4 · 1.300 m" en mono, un campo para corregir a mano, un ausente en gris, y el botón "Guardar sesión".
