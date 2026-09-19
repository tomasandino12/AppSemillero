---
name: nueva-pantalla
description: Crea una pantalla o función de datos nueva de App formativa respetando las capas, el escapado automático de HTML y los helpers compartidos.
---

Crear lo pedido en `$ARGUMENTS`. Las reglas completas están en `CLAUDE.md` (sección Arquitectura) y las verifica `tests/arquitectura.test.js`. No leas `docs/superpowers/`.

**Orden de trabajo** (un commit por paso, tests primero donde se puede):
1. **Datos.** Si hace falta una función de acceso, va en `src/data/repos/<área>.js` (devuelve objetos camelCase, nunca filas crudas). La lógica de más de ~10 líneas sin red va a un módulo puro en `src/data/` con su test. Repo nuevo → línea `export * from './repos/<área>.js';` en `src/data/repositorio.js`.
2. **Contenedor.** En `public/index.html`: `<section class="pant" id="p-x"><div id="x-contenido"></div></section>`.
3. **Pantalla** en `src/ui/pantallas/x.js`, con esta forma:

```js
import { obtenerAlgo } from '../../data/repositorio.js';
import { obtenerClubActual } from '../sesion.js';
import { $ } from '../dom.js';
import { html } from '../html.js';
import { avisoDeError } from '../errores.js';

const contenedor = () => $('x-contenido');

export async function renderX() {
  const club = obtenerClubActual();
  if (!club) return;
  contenedor().innerHTML = html`<div class="pad"><div class="p">Cargando...</div></div>`;
  let datos;
  try {
    datos = await obtenerAlgo(club.id);
  } catch (e) {
    contenedor().innerHTML = avisoDeError(e, 'No se pudo cargar X.');
    return;
  }
  // Todo dato interpolado en html`` se escapa solo; no llamar a escaparHtml acá.
  contenedor().innerHTML = html`<div class="pad">${datos.map((d) => html`<div class="nom">${d.nombre}</div>`)}</div>`;
}
```

4. **Registro** en `src/ui/pantallas/registro.js`: `registrarPantalla('p-x', { titulo: 'X', render: renderX });`
5. **Guardados**: `mensajeAlGuardar(e, { reglas, permiso })` de `../errores.js` para el toast de error; deshabilitar el botón mientras guarda.
6. Correr `npm run test:q` y `graphify update .`.

Lo que puede ver o hacer cada rol lo decide la base (RLS): la pantalla sólo evita ofrecer lo que la base rechazaría.
