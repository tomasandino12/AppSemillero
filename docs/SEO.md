# Visibilidad en buscadores

La app tiene **una sola URL pública**: la landing en `/`. No hay ruteo —
navegar muestra y esconde secciones del mismo documento— así que no existen
rutas de la app que un buscador pueda pedir. Todo lo demás está detrás de la
sesión, y son datos de menores.

Eso ordena el resto: no hay "páginas importantes" que priorizar ni sitemap
que crezca. Lo único que se busca es que la landing se indexe bien y que el
link se vea decente cuando alguien lo comparte.

## Qué hay en el repo

| Archivo | Para qué |
|---|---|
| `public/index.html` | `<title>`, `description`, `canonical` y las etiquetas `og:*` |
| `public/robots.txt` | Deja rastrear todo y declara el sitemap |
| `public/sitemap.xml` | La única URL, `/` |
| `vercel.json` | Los rewrites que sirven robots y sitemap **desde la raíz** |
| `tests/metadatos.test.js` | Compara el dominio en los cuatro lados donde está escrito |

El dominio de producción está escrito a mano en varios archivos. Si alguna
vez cambia (dominio propio en vez de `app-semillero.vercel.app`), hay que
tocarlos todos: el test dice cuáles.

Sobre `/public/index.html`: devuelve 200 y es la misma página que `/`. No se
bloquea con `Disallow` a propósito, porque eso le impediría a Google leer el
`canonical` que resuelve el duplicado —y de paso le escondería el CSS y el
JS, dejándole una landing rota. El canonical es la herramienta correcta acá.

## El paso que queda, y es manual

Dar de alta el sitio en **Google Search Console**
(https://search.google.com/search-console). No se puede hacer desde el repo:
el token de verificación sale de la cuenta de Google del dueño del sitio.

1. Agregar una propiedad de tipo **Prefijo de URL**:
   `https://app-semillero.vercel.app`
2. Elegir verificación por **etiqueta HTML**. Google da un
   `<meta name="google-site-verification" content="...">`.
3. Pegarlo en el `<head>` de `public/index.html`, junto a los otros `meta`, y
   desplegar. **No** hace falta tocar la CSP: es una etiqueta, no un script.
4. Volver a Search Console y confirmar.
5. En **Sitemaps**, enviar `sitemap.xml`.
6. En **Inspección de URL**, pedir la indexación de `/` y mirar el render:
   ahí se ve lo que Google realmente dibuja, no el HTML crudo.

Ese punto 6 es el que importa más de todos. El markup de la landing está en
el HTML estático, pero el shell arranca con `hidden` y se muestra recién
cuando resuelve la sesión: si Google renderiza antes de tiempo, ve una
página en blanco. La inspección de URL es la única forma de comprobarlo.

## Expectativa realista

Esto no va a traer tráfico de búsqueda: nadie googlea "app de seguimiento de
inferiores de básquet". La app se reparte porque el coordinador pasa el
link. Por eso las etiquetas `og:*` —cómo se ve el link en WhatsApp— valen
más acá que cualquier cosa de ranking.
