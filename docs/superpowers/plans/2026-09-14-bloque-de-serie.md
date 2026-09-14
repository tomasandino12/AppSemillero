# Bloque de serie compartido — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que el Panorama y la ficha del jugador usen un único componente para "Ver detalles", y que en la ficha las tablas de práctica y partido dejen de estar siempre desplegadas.

**Architecture:** un componente nuevo, `src/ui/componentes/detalleColapsable.js`, que recibe tablas ya armadas y devuelve el `<details>`. Las dos pantallas lo usan; el CSS de `.detalles-cat` pasa a `.detalle-colapsable` y deja de ser propiedad del Panorama.

**Tech Stack:** HTML/CSS/JS vanilla, ES modules, `node:test`.

**Spec:** `docs/superpowers/specs/2026-09-14-bloque-de-serie-design.md`

## Global Constraints

- El componente **no sabe de tiro, partidos ni jugadores**: recibe `{ nombre, html }` y nada más.
- **No cambia qué datos entran en cada tabla.** No se tocan `estadisticas.js`, `coordinacion.js` ni `variacion.js`.
- **No se tocan HOY, MEDIR ni DATOS.**
- Botón: "Ver detalles" / "Ocultar detalles" en las dos pantallas, sin parámetro.
- Cerrado al renderizar, siempre. No se recuerda el estado.
- 44px (`--tap`), nada dependiente de `hover`, foco por la regla global de `base.css`.
- El gráfico queda **afuera** del colapsable, siempre visible.
- `npm test` completo en verde, incluidos `importsResueltos` y `coordinacionSinDatosIndividuales`.
- Sin dependencias nuevas.

---

## Mapa de archivos

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `src/ui/componentes/detalleColapsable.js` | crear | el `<details>` con tablas nombradas |
| `tests/detalleColapsable.test.js` | crear | el componente, puro |
| `tests/detalleUnico.test.js` | crear | ninguna pantalla escribe su propio `<details>` |
| `src/ui/pantallas/coordPanorama.js` | modificar | usa el componente; tablas con nombre completo |
| `src/ui/pantallas/fichaJugador.js` | modificar | resumen visible + tablas colapsadas |
| `public/css/componentes.css` | modificar | `.detalles-cat` → `.detalle-colapsable`; resumen de la ficha |
| `package.json` | modificar | los dos tests nuevos |

---

### Tarea 1: El componente

**Files:**
- Create: `src/ui/componentes/detalleColapsable.js`
- Create: `tests/detalleColapsable.test.js`
- Modify: `package.json`

**Interfaces:**
- Produces: `detalleColapsableHtml(tablas) → string`, con `tablas = [{ nombre, html }]`.

- [ ] **Step 1: El test, primero**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detalleColapsableHtml } from '../src/ui/componentes/detalleColapsable.js';

test('sin tablas no hay botón', () => {
  assert.equal(detalleColapsableHtml([]), '');
  assert.equal(detalleColapsableHtml(null), '');
  assert.equal(detalleColapsableHtml([{ nombre: 'Práctica', html: '' }]), '');
});

test('arranca cerrado y nombra cada tabla', () => {
  const html = detalleColapsableHtml([
    { nombre: 'Práctica', html: '<div class="tabla-ev">A</div>' },
    { nombre: 'Partido', html: '<div class="tabla-ev">B</div>' },
  ]);
  assert.match(html, /<details class="detalle-colapsable">/);
  assert.doesNotMatch(html, /\sopen[\s>]/);
  assert.match(html, />Práctica</);
  assert.match(html, />Partido</);
  assert.ok(html.includes('<div class="tabla-ev">A</div>'));
  assert.ok(html.includes('<div class="tabla-ev">B</div>'));
});

test('el texto del botón es el mismo en toda la app', () => {
  const html = detalleColapsableHtml([{ nombre: 'X', html: '<p>x</p>' }]);
  assert.match(html, /Ver detalles/);
  assert.match(html, /Ocultar detalles/);
});

test('una tabla vacía no entra, las demás sí', () => {
  const html = detalleColapsableHtml([
    { nombre: 'Práctica', html: '' },
    { nombre: 'Partido', html: '<div>B</div>' },
  ]);
  assert.doesNotMatch(html, />Práctica</);
  assert.match(html, />Partido</);
});

test('el nombre se escapa: viene de datos, no del código', () => {
  const html = detalleColapsableHtml([{ nombre: '<script>', html: '<div>B</div>' }]);
  assert.doesNotMatch(html, /<script>/);
});
```

Sumar `tests/detalleColapsable.test.js` al script `test` de `package.json`.

- [ ] **Step 2: Correr y ver que falla** — `node --test tests/detalleColapsable.test.js`.

- [ ] **Step 3: El componente**

```js
import { escaparHtml } from '../nav.js';

/**
 * El historial completo detrás de "Ver detalles". Recibe las tablas ya armadas
 * por la pantalla: el componente no sabe de tiro, de partidos ni de jugadores,
 * sólo muestra y oculta.
 *
 * <details> nativo: se abre con el dedo, con teclado y con lector de pantalla
 * —que lo anuncia como botón expandible con su estado— sin una línea de JS y
 * sin estado que sincronizar. Sin `open`: siempre arranca cerrado.
 *
 * El gráfico queda AFUERA, siempre visible: lo colapsado es el detalle fecha
 * por fecha, no la forma de la serie.
 *
 * tablas: [{ nombre, html }]. Una tabla sin html no entra, y sin ninguna no se
 * dibuja el botón: no hay nada que desplegar.
 */
export function detalleColapsableHtml(tablas) {
  const conContenido = (tablas ?? []).filter((t) => t && t.html);
  if (!conContenido.length) return '';
  return `
    <details class="detalle-colapsable">
      <summary>
        <span class="ver">Ver detalles</span><span class="ocultar">Ocultar detalles</span>
        <span class="flecha" aria-hidden="true">▾</span>
      </summary>
      ${conContenido.map((t) => `
        <div class="tabla-nombrada">
          <div class="sub-fuente">${escaparHtml(t.nombre)}</div>
          ${t.html}
        </div>
      `).join('')}
    </details>
  `;
}
```

- [ ] **Step 4:** `npm test` en verde.
- [ ] **Step 5: Commit** — `feat(ui): componente de detalle colapsable`

---

### Tarea 2: El Panorama usa el componente

**Files:**
- Modify: `src/ui/pantallas/coordPanorama.js`
- Modify: `public/css/componentes.css`

- [ ] **Step 1: `coordPanorama.js`**

Import: `import { detalleColapsableHtml } from '../componentes/detalleColapsable.js';`

Reemplazar `detalleTipoHtml` y `detallesHtml` por:

```js
/**
 * Las cuatro tablas de la tarjeta, con el nombre completo de cada una: el
 * detalle ya no agrupa por tipo con un subtítulo, lo dice el nombre.
 */
function tablasDeTarjeta(t) {
  const tablas = [];
  for (const tipo of TIPOS) {
    const bateria = t[tipo.clave].bateria.serie;
    const partido = t[tipo.clave].partido.serie;
    if (bateria.length) {
      tablas.push({ nombre: `${tipo.titulo} · Batería`, html: `<div class="tabla-ev">${tablaBateriaHtml(bateria)}</div>` });
    }
    if (partido.length) {
      tablas.push({ nombre: `${tipo.titulo} · Partidos`, html: `<div class="tabla-ev">${tablaPartidosHtml(partido)}</div>` });
    }
  }
  return tablas;
}
```

En `tarjetaHtml`, `${detallesHtml(t)}` pasa a `${detalleColapsableHtml(tablasDeTarjeta(t))}`.

- [ ] **Step 2: CSS** — en `componentes.css`, renombrar el bloque de `.detalles-cat` a `.detalle-colapsable` (mismos valores), reemplazar `.detalle-tipo`/`.detalle-tipo .k`/`.detalle-tipo .sub-fuente` por:

```css
.detalle-colapsable .tabla-nombrada{padding-top:var(--sp-3)}
.detalle-colapsable .sub-fuente{font-family:var(--ff-titulo);font-size:var(--fs-115);letter-spacing:.06em;text-transform:uppercase;color:var(--gris-cl)}
```

- [ ] **Step 3:** `npm test` en verde (incluida la guarda de coordinación).
- [ ] **Step 4: Commit** — `refactor(ui): el panorama usa el detalle colapsable compartido`

---

### Tarea 3: La ficha del jugador

**Files:**
- Modify: `src/ui/pantallas/fichaJugador.js:56-83`
- Modify: `public/css/componentes.css`

**Interfaces:**
- Consumes: `detalleColapsableHtml`, `variacionHtml`, `compararPorcentajes`.

- [ ] **Step 1: Imports**

```js
import { detalleColapsableHtml } from '../componentes/detalleColapsable.js';
import { variacionHtml } from '../componentes/variacion.js';
```
y sumar `compararPorcentajes` al import de `estadisticas.js`.

- [ ] **Step 2: Resumen y bloque**

```js
/**
 * El último punto de una fuente, siempre visible: fecha, porcentaje con su
 * fracción, y la variación contra el punto anterior de la MISMA fuente.
 *
 * La variación va aunque casi siempre diga "sin diferencia clara": una batería
 * individual son ~50 tiros de arco y ~10 libres, así que el margen es ancho. El
 * número se muestra igual; la afirmación no se hace. Es la misma regla que el
 * Panorama, y el día que un jugador acumule una diferencia real, se ve.
 */
function resumenDeFuente(nombre, serie) {
  if (!serie.length) return '';
  const ultimo = serie[serie.length - 1];
  const anterior = serie.length >= 2 ? serie[serie.length - 2] : null;
  return `
    <div class="resumen-fuente">
      <span class="k">${nombre} · ${escaparHtml(formatearFechaCorta(ultimo.fecha))}</span>
      <span>${textoPorcentaje(ultimo.valor)}</span>
      ${anterior
        ? `${variacionHtml(compararPorcentajes(ultimo.valor, anterior.valor))} <span class="det">vs ${escaparHtml(formatearFechaCorta(anterior.fecha))}</span>`
        : '<span class="var neutra">Una sola medición: todavía no hay con qué comparar</span>'}
    </div>
  `;
}

function bloqueDeSerie(id, titulo, serie, ayuda) {
  const total = serie.practica.length + serie.partido.length;
  if (total === 0) {
    return `<div class="eyebrow">${titulo}</div><div class="p">${ayuda}</div>`;
  }
  // Más reciente primero, igual que el resto de las tablas de la ficha
  // (partidos, velocidad).
  const tabla = (s) => (s.length ? `<div class="tabla-ev">${[...s].reverse().map(filaDePunto).join('')}</div>` : '');
  return `
    <div class="eyebrow">${titulo}</div>
    <svg class="g" id="${id}"></svg>
    <div class="leyenda">
      ${serie.practica.length ? '<span class="linea-practica">Práctica</span>' : ''}
      ${serie.partido.length ? '<span class="linea-partido">Partido</span>' : ''}
    </div>
    <div class="resumen-serie">
      ${resumenDeFuente('Práctica', serie.practica)}
      ${resumenDeFuente('Partido', serie.partido)}
    </div>
    ${detalleColapsableHtml([
      { nombre: 'Práctica', html: tabla(serie.practica) },
      { nombre: 'Partido', html: tabla(serie.partido) },
    ])}
  `;
}
```

(La leyenda pasa a mostrar sólo las fuentes que tienen puntos: hoy anuncia las dos siempre, incluso cuando el jugador nunca jugó un partido cargado.)

- [ ] **Step 3: CSS** — reemplazar la regla `.detalle-serie` (queda sin uso) por:

```css
.resumen-serie{display:flex;flex-direction:column;gap:var(--sp-2);margin-top:var(--sp-3)}
.resumen-fuente{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px var(--sp-2)}
.resumen-fuente .k{font-family:var(--ff-titulo);font-size:var(--fs-115);letter-spacing:.06em;text-transform:uppercase;color:var(--gris-cl)}
```

- [ ] **Step 4:** `npm test` en verde.
- [ ] **Step 5: Commit** — `feat(ui): la ficha muestra el último dato y colapsa el historial`

---

### Tarea 4: La guarda

**Files:**
- Create: `tests/detalleUnico.test.js`
- Modify: `package.json`

- [ ] **Step 1: El test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * El "ver detalle" es un componente y no un patrón que cada pantalla copia.
 * Dos implementaciones fue exactamente el problema: una quedó a medias y la
 * ficha mostraba el historial siempre desplegado.
 */
const PANTALLAS = ['src/ui/pantallas/coordPanorama.js', 'src/ui/pantallas/fichaJugador.js'];

test('ninguna pantalla escribe su propio <details>', () => {
  const ofensores = PANTALLAS.filter((p) => /<details/.test(readFileSync(p, 'utf8')));
  assert.deepEqual(ofensores, []);
});

test('las dos pantallas usan el componente compartido', () => {
  for (const p of PANTALLAS) {
    assert.match(readFileSync(p, 'utf8'), /detalleColapsableHtml/, `${p} no usa el componente`);
  }
});
```

Sumarlo al script `test` de `package.json`.

- [ ] **Step 2:** `npm test` en verde.
- [ ] **Step 3: Commit** — `test: el detalle colapsable es uno solo`

---

### Tarea 5: Verificación visual

- [ ] Extender el Supabase simulado del arnés (scratchpad, fuera del repo) para la ficha de un jugador: plantel, sesiones de tiro, mediciones, partidos y estadísticas, con un caso de dos fuentes y otro sólo de práctica.
- [ ] Capturas a 375px y en escritorio: ficha con las tablas cerradas y abiertas, y Panorama cerrado y abierto.
- [ ] Medir en el DOM dibujado: cada `summary` de 44px, y cero `<svg class="g">` adentro de un `<details>`.
- [ ] Mirar las capturas: que "Práctica" ya no aparezca dos veces seguidas bajo el gráfico.
