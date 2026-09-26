# Privacidad y textos legales — plan

**Spec:** `docs/superpowers/specs/2026-09-26-privacidad-y-legales-design.md`
**Ejecución:** en la sesión, sin subagentes. `npm run test:q` antes de cada commit.

## Restricciones globales

- Versión legal inicial: `2026-09-26`.
- Texto del checkbox, literal: *Leí y acepto los Términos y la Política de privacidad. Si soy menor de 18, un adulto responsable los leyó y me autorizó.*
- Aviso de evaluaciones, literal: *Valores estimados para orientar el entrenamiento; no reemplazan una evaluación médica.*
- Responsable: el club. Encargado: Tomás. Datos en Supabase, región São Paulo (Brasil).
- Capas: la UI pide todo por `repositorio.js`; lógica pura en `src/data/`. HTML nuevo con `html\`\`` de `ui/html.js`.
- Tabla nueva: `revoke all` + grant mínimo por columna + RLS + trigger de sellado (patrón `0031_error_cliente.sql`).

## Estado

| Task | Estado |
|---|---|
| 1. Páginas legales + `legal.js` + contrato | pendiente |
| 2. Migración 0051 + repo | pendiente |
| 3. Vista "Antes de seguir" + enlaces | pendiente |
| 4. Fuentes propias + CSP | pendiente |
| 5. Aviso en evaluaciones | pendiente |
| 6. Contraste WCAG | pendiente |
| 7. Docs para el club + SEGURIDAD-LANZAMIENTO | pendiente |

### Task 1: páginas legales

- **Archivos:** crear `public/legal/privacidad.html`, `public/legal/terminos.html`, `public/css/legal.css`, `src/data/legal.js`, `tests/contratoLegal.test.js`; modificar `vercel.json` (rewrites `/privacidad`, `/terminos`), `public/sitemap.xml`.
- `legal.js` exporta `VERSION_LEGAL` y `TEXTO_ACEPTACION`.
- Cada página muestra la versión en un elemento `data-version="2026-09-26"`. Sin JS inline (la CSP no lo permite).
- **Acepta:** las páginas abren sin sesión y se leen bien en celular, en claro y oscuro.
- **Tests:** `contratoLegal.test.js` → "las dos páginas declaran VERSION_LEGAL", "vercel.json sirve /privacidad y /terminos".

### Task 2: migración y repo

- **Archivos:** crear `supabase/migrations/0051_aceptacion_legal.sql`, `src/data/repos/legal.js`; modificar la fachada `src/data/repositorio.js`, `supabase/ESQUEMA.md`.
- Tabla `aceptacion_legal(id, version text check largo ≤ 20, usuario uuid default auth.uid(), aceptado_en timestamptz)`, `unique (usuario, version)`. Grant: `insert (version)` y `select` a authenticated. Policies: insert y select sólo `usuario = auth.uid()`. Trigger que sella `usuario` y `aceptado_en`.
- Repo: `yaAceptoLegal(version) → boolean` y `aceptarLegal(version) → void`. Un insert repetido (23505) cuenta como aceptado.
- **Acepta:** la migración corre en la base local (`npx supabase db reset` si está levantada; si no, se revisa a mano) y la arquitectura pasa.
- **Tests:** `contratoLegal.test.js` → "el check de largo de version en 0051 alcanza para VERSION_LEGAL"; `arquitectura.test.js` sigue verde con el repo nuevo.

### Task 3: vista "Antes de seguir"

- **Archivos:** modificar `public/index.html` (sección `v-legal`; línea con links debajo de "Crear cuenta"; pie con links en la landing), `src/ui/publico.js` (`mostrarAceptarLegal`), `src/ui/main.js` (`entrarConSesion`, después del nombre), `src/ui/pantallas/miPerfil.js` (links), `public/css/publico.css`.
- El botón "Continuar" exige el checkbox tildado. Si falla el guardado se muestra `mensajeAlGuardar`. "Salir de esta cuenta" como en `v-nombre`.
- **Acepta:** con una cuenta sin aceptación aparece la vista; al aceptar sigue al club; la segunda vez no aparece. Se verifica en el preview.
- **Tests:** ninguno nuevo de lógica (es cableado); `test:q` verde.

### Task 4: fuentes propias

- **Archivos:** crear `public/fonts/*.woff2` (sólo los pesos usados: Barlow Condensed 400–700, Inter 400–700, IBM Plex Mono 500–600, subconjunto latin); modificar `public/css/tokens.css` (`@font-face`), `public/index.html` (sacar los links a Google), `vercel.json` (CSP: `font-src 'self'`, `style-src` sin googleapis).
- **Requiere permiso** para descargar los archivos.
- **Acepta:** el preview no hace ningún pedido a Google y las fuentes se ven iguales.
- **Tests:** `contratoLegal.test.js` o el test de CSP existente → "index.html no pide fonts.googleapis.com".

### Task 5: aviso en evaluaciones

- **Archivos:** `src/ui/pantallas/fichaJugador.js`, `src/ui/pantallas/jugProgreso.js` (una línea al pie de la sección física), CSS si hace falta.
- **Acepta:** la línea aparece una vez por pantalla, en el mismo tono que las notas existentes.

### Task 6: contraste

- **Archivos:** crear `tests/contraste.test.js` (lee los tokens de `tokens.css` y calcula la razón WCAG de los pares texto/fondo que usa `DESIGN.md`); modificar `public/css/tokens.css` si algo falla.
- **Acepta:** todos los pares de texto normal ≥ 4.5:1 y los de texto grande/UI ≥ 3:1, en claro y oscuro.
- **Tests:** "texto sobre fondo cumple AA en claro", "…en oscuro".

### Task 7: docs para el club

- **Archivos:** crear `docs/legal/consentimiento-familias.md`, `docs/legal/acuerdo-datos-club.md`, `docs/legal/checklist-club.md`; actualizar `docs/SEGURIDAD-LANZAMIENTO.md` (sección "Datos de menores").
- **Acepta:** se pueden imprimir y firmar sin editar nada salvo los datos del club marcados entre corchetes.

## Despliegue

`npx supabase db push` (0051) **antes** de desplegar la Task 3. Pedir confirmación.
