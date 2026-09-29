# Pizarra de ejercicio (Fase 2)

Baja a tasks la sección "Fase 2" de `C:\Users\PC\.claude\plans\vi-que-los-profes-quiet-island.md`. Rama `feat/pizarra-ejercicio`. Un commit por task; `npm run test:q` antes de cada uno.

## Decisiones de forma (cierran lo que el esbozo dejaba abierto)
- **Mismo pizarrón, otro modelo.** El JSON es el de la jugada (`cancha`, `fichas`, `pasos[].acciones/nota`) más `modo:'ejercicio'`, `pelotas:[fichaId]` (en vez de `pelota`) y `rotacion:[{ficha, a:{x,y}}]`.
- **Fichas nuevas:** `fila` (`cantidad` 2–9; el que actúa es "el primero", el resto queda en la fila) y `entrenador`. El número de atacante/defensor pasa a ser opcional.
- **Pelotas:** cada pelota tiene dueño (ataque, fila o entrenador). `tiro` la deja suelta en el aro; la acción nueva `rebote` se la da a una ficha (necesita una pelota suelta al empezar el paso). Un paso admite varios pases a la vez, pero cada pelota se usa una vez por paso.
- **Rotación:** flechas punteadas "al terminar" desde donde quedó cada ficha hasta un punto (al tocar una fila, se ajusta a ella). El visor reproduce los pasos, muestra la rotación y **vuelve a empezar**.
- **Dónde vive el código:** reglas y estado en `src/data/pizarraEjercicio.js`; `jugadas.js` sólo despacha `validarJugada` y `estadoAlInicioDelPaso` cuando `modo==='ejercicio'` (las jugadas siguen igual). Animación en `src/data/animacionEjercicio.js`. El editor y el visor son los mismos, con herramientas extra según el modo.
- **Quién edita:** la pizarra es parte del ejercicio, así que la edita quien creó el ejercicio (policy de 0015). Variaciones siguen abiertas a todos. Editor sólo en tablet/PC (`pantallaAptaParaEditar`); el visor en todos lados.

## Tasks
1. **Migración `0053_pizarra_ejercicio.sql`.** `ejercicio.pizarra jsonb` con checks de objeto, ≤64 KB y `jugada_notas_validas`; grant de update sólo de esa columna. Tests: `tests/contratoPizarraEjercicio.test.js` (tope de bytes y notas iguales en SQL y JS; grant de update sin insert).
2. **Reglas puras `pizarraEjercicio.js` + despacho en `jugadas.js`.** Validación, estado de pelotas al inicio del paso, alta/baja de fichas, pelotas, rotación. Tests: `tests/pizarraEjercicio.test.js`.
3. **Animación `animacionEjercicio.js`.** `estadoEjercicioEn` con varias pelotas, rebote y fase de rotación. Tests: `tests/animacionEjercicio.test.js`.
4. **Repo.** `obtenerEjercicio` devuelve `pizarra`; `guardarPizarraEjercicio` (tira `NO_ES_TUYO`). La lista no la trae (pesa).
5. **Dibujo.** `pizarra.js` + CSS: fila apilada con "×N", entrenador, varias pelotas, trazo de rebote, flechas de rotación.
6. **Visor.** Fase "Al terminar" y bucle.
7. **Editor en modo ejercicio.** Herramientas Fila, Entrenador, Pelota (varias), Rebote, Rotación y cantidad de la fila; guarda en el ejercicio.
8. **Ficha del ejercicio.** Sección "Pizarra": visor para todos, "Dibujar en la pizarra" para quien lo creó.

## Verificación
`npm run test:q` en verde (incluye `arquitectura`). Vista de un ejercicio de ejemplo en el preview (visor con bucle, 375×812 y desktop). `db push` de 0053 sólo con confirmación.
