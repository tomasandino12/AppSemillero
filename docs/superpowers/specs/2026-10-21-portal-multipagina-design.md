# Portal multipágina con Noticias — diseño

Fecha: 2026-10-21 · Referencia visual: newellsoldboys.com.ar · Base: commit 010afc2

## Por qué

El portal (`/`, `public/portal.html` + `src/ui/portal.js`) es una sola página larga. El club quiere un sitio con identidad del sitio oficial de Newell's, con páginas propias para **Noticias** (que escribe la coordinación, con fotos), **Categorías** (más detalle), **Ayuda** (preguntas frecuentes y contacto) y **Calendario**. Lo que más usan las familias sigue siendo lo mismo: **"Quiero jugar en Newell's"** y, con la inscripción abierta, **"Inscribir a mi hijo o hija"** y **"Enviar comprobante"**. Esas acciones se tienen que ver **sin scrollear**, en cualquier página.

## Objetivos

1. Cinco páginas públicas con un mismo encabezado, pie y barra de acciones: Inicio `/`, Noticias `/noticias`, Categorías `/categorias`, Calendario `/calendario`, Ayuda `/ayuda`.
2. Las acciones principales en el primer pantallazo de un celular de 360×640, en todas las páginas.
3. Noticias con fotos que publica el coordinador desde el panel de Semillero (`/app`), con la seguridad en RLS.
4. **Todo lo que hoy anda sigue andando** (ver "Lo que no se rompe").

## No objetivos / anti-objetivos

- **No se inventa nada.** Sólo se muestra lo que ya está en `src/data/portal.js`, en la base o en Google Calendar. Lo que falta queda oculto: nunca "Próximamente", nunca cifras, historia, profes ni horarios que el club no pasó (las dos Primeras siguen "Horario a confirmar").
- Nada de lo decorativo del sitio oficial que prohíbe `DESIGN.md`: la cinta que corre ("HACETE SOCIO" en loop), la cuenta regresiva por segundo, el parallax y los contadores animados. Tampoco se agregan fuentes.
- Noticias sin comentarios, likes, programación de publicación ni editor de texto enriquecido.
- No cambia la lógica de formularios: `formularios_publicos`, los destinos (0061–0063) y el panel de formularios quedan como están.

## Lo que no se rompe

- URLs: `/`, `/app`, `/consultas` (el QR impreso), `/privacidad`, `/terminos`. `portalEntrada.js` sigue primero en `/` (los mails de Supabase apuntan ahí).
- Links viejos que circulan por WhatsApp: `/#ayuda` → `/ayuda`, `/#categorias` → `/categorias`, `/#calendario` → `/calendario` (un `location.replace` en el arranque del portal).
- La regla de la primera tarjeta: inscripción activa → "Inscribir a mi hijo o hija"; si no, "Quiero jugar en Newell's" (consultas); sin formulario, la tarjeta maciza con "Pronto". "Enviar comprobante" siempre al lado, con el alias y Copiar.
- Si la base no tiene todavía la migración de noticias (frontend publicado antes que el `db push`) o no responde, la sección de noticias **se oculta** y el resto del portal anda igual.
- CSP: el mismo import map en todas las páginas (mismo hash). Sin script inline nuevo.
- Los tests existentes pasan; los que cambian (Ayuda como `<dialog>`, orden de secciones del inicio) se reescriben a propósito y cada cambio se anota en el commit.

## Diseño

### Marco común (todas las páginas)

- **Encabezado** fijo arriba, negro: escudo + "Newell's Básquet" y la navegación (Noticias · Categorías · Calendario · Ayuda). En celular, la navegación pasa a un menú (`<details>`, sin JS). "Soy profe o jugador" (Semillero, con cómo instalarla) queda como hoy. El HTML del encabezado y del pie está escrito en cada página, así se ve sin JS. Un test verifica que sea igual en las cinco.
- **Barra de acciones**: dos botones, la primera acción (Inscribir o Quiero jugar, misma regla) y "Enviar comprobante". El que no tiene formulario activo se ve apagado, con "Pronto". Si ninguno de los dos tiene formulario, la barra no aparece. En celular queda fija abajo (`position: fixed`), así se ve desde el primer pantallazo sin scrollear. En compu va pegada arriba (`position: sticky`). En el inicio se esconde mientras se ven las tarjetas del hero y aparece cuando salen de pantalla (IntersectionObserver; entra con `transform`).
- **Pie** negro: escudo, la navegación repetida, sede con "Cómo llegar", Semillero, Privacidad y Términos.
- Cada página pide `formularios_publicos` una vez. La decisión de qué acción mostrar sale de `htmlHeroe` y pasa a una función pura en `src/data/formulariosPortal.js` (`accionesPrincipales`), que usan el hero y la barra.

### Identidad visual (tomada del sitio oficial)

Las reglas `.portal-*` que ya existen se quedan en `publico.css`. Lo nuevo va en `public/css/portal.css`, y sus cortes de ancho en `layout.css`, como pide `DESIGN.md`.

El ritmo del sitio oficial: hero negro (con la foto del club si `PORTAL.foto` existe; si no, la banda roja y negra de hoy), secciones sobre **papel claro** con títulos grandes en Barlow Condensed mayúscula, **bandas rojas** a todo el ancho (recaudación) y pie negro. Las tarjetas de noticia copian ese patrón: foto arriba, etiqueta roja, título condensado en mayúscula, fecha en mono y "LEER →". "Lo que viene" toma la forma del bloque de partido del sitio oficial (fecha grande, cuándo y dónde), estático: dice "Mañana" o "En 3 días" con `cuandoEs`. Los colores salen de tokens (`--club`, `--negro`, `--papel`). `DESIGN.md` se actualiza: lo público deja de ser sólo oscuro y pasa a alternar negro, papel y rojo.

### Páginas

- **Inicio** (el resumen de todo): hero (título, temporada y las dos tarjetas, todo dentro de 640 px de alto en celular) → últimas 3 noticias + "Ver todas" (oculta si no hay) → "Lo que viene" + "Ver calendario" → "¿En qué categoría juega?" + "Ver todas las categorías" → banda de recaudación → Sumate/colaborar → otros formularios → franja "¿Dudas?" a `/ayuda` → foto → sponsors. La fila de atajos desaparece: la navegación del encabezado la reemplaza.
- **Noticias** (`/noticias`): grilla de tarjetas, de a 12, con "Ver más". Detalle en `/noticias?n=<id>`: título, fecha, etiqueta, fotos con su texto alternativo y el cuerpo en párrafos (texto plano escapado, sin HTML). Una noticia que no existe o está despublicada muestra "Esta noticia ya no está" y vuelve a la lista.
- **Categorías** (`/categorias`): el buscador por año de nacimiento arriba. Después, una sección por categoría con ancla (`#u13`, `#primera-femenino`…): nombre, rama, años de la temporada, cada horario con día, hora y lugar, y la sede con "Cómo llegar". La acción principal la da la barra de acciones, que está en todas las páginas. Sin horario: "Horario a confirmar". Un campo opcional `detalle` en `PORTAL.categorias` (texto que pase el club) arranca en `null` y no se muestra.
- **Calendario** (`/calendario`): el calendario de hoy (grilla, día elegido, agregar, suscribirse), movido entero.
- **Ayuda** (`/ayuda`): las seis preguntas de hoy en acordeón, con el mismo texto y la misma lógica según lo que esté abierto. Después, **Contacto**: WhatsApp del coordinador (la única vez que aparece en el sitio), sede con mapa y alias para transferir. El `<dialog>` de ayuda desaparece: "Ayuda" del encabezado lleva a `/ayuda`.

### Noticias: datos y seguridad (migración 0064)

- Tabla `noticia`: `club_id`, `titulo`, `resumen`, `cuerpo`, `etiqueta` (lista cerrada con check: Club, Partidos, Eventos, Inscripción), `fotos` jsonb (hasta 6 `{ruta, alt}`, cada `alt` obligatorio), `autorizacion_imagen` (check: con fotos tiene que ser true), `publicada`, `publicada_en` (la pone el trigger la primera vez que se publica), y los campos de sellado. Largos en `limites.js` y en los `check`, con test de contrato. Patrón de 0026/0058: `revoke all`, `grant` por columna, RLS de coordinador (`es_coordinador_de`) para leer, crear, editar y borrar.
- Lectura pública por funciones `security definer`, como `formularios_publicos`: `noticias_publicas(club, limite, antes_de)` y `noticia_publica(club, id)`. Sólo devuelven publicadas.
- Fotos en un bucket de Supabase Storage `noticias`, de lectura pública. Ruta `<club_id>/<noticia_id>/<archivo>.webp`. Subir y borrar sólo puede el coordinador de ese club (policies sobre `storage.objects` con la carpeta del club). Límite de 1 MB por archivo y sólo `image/webp` o `image/jpeg`. El navegador acepta jpeg, png o webp de hasta 15 MB, achica cada foto a 1600 px de lado y la pasa a webp (jpeg si el navegador no sabe hacer webp) antes de subirla. Borrar una noticia borra sus fotos.
- CSP: `img-src` suma el host de Supabase (`connect-src` ya lo tiene). `tests/csp.test.js` se actualiza.
- Código: `src/data/noticias.js` (validar, mapper, párrafos, rutas, medidas al achicar), `src/data/repos/noticias.js` + una línea en la fachada, y la pantalla `coordNoticias.js` en el modo coordinar (lista con borradores y publicadas, editor, fotos con su texto alternativo, checkbox "Tengo la autorización de imagen de las familias", vista previa, publicar/despublicar, borrar con `confirmar`).
- Privacidad: `docs/legal/cambios-portal.md` suma las fotos de noticias como cambio a aprobar por el club. `privacidad.html` no se toca en esta rama: su texto lo aprueba el club.

### Ruteo y SEO

`vercel.json`: rewrites `/noticias`, `/categorias`, `/calendario`, `/ayuda` a sus `.html`, con `no-store` como el portal. `sitemap.xml` con las páginas nuevas. Cada página con su `<title>`, `description` y Open Graph. El detalle de una noticia comparte el OG genérico (sin servidor no hay OG por noticia).

## Cómo se verifica (decidido con el usuario)

- Todo local: repo git local, sin remoto, sin push y sin `db push`.
- Noticias se prueba **sólo con tests unitarios y de contrato** (lógica pura, mappers, contrato SQL↔JS, HTML generado). No hay Supabase local. La prueba punta a punta queda para cuando se aplique 0064 en la base real, con `npm run backup` antes.
- Las páginas se miran en el navegador con el servidor de `.claude/launch.json`. Sin la migración, la sección de noticias tiene que quedar oculta, y eso también se verifica.

## Lo que queda para quien construye

Medidas exactas, el corte del menú, los textos de botón dentro de lo ya escrito en el portal, el orden de los tests y si la grilla de noticias usa 1/2/3 columnas por corte de `layout.css`.

## Decisiones tomadas por Claude (a revisar)

- La lista de etiquetas (Club, Partidos, Eventos, Inscripción).
- El checkbox de autorización de imagen obligatorio para publicar con fotos.
- Achicar las fotos en el navegador (1600 px, webp, máximo 1 MB) y hasta 6 por noticia.
- Calendario como página propia. Colaborar y sponsors siguen en el inicio, sin página.
- Ayuda pasa de hoja (`<dialog>`) a página.
- Barra de acciones pegada abajo en celular.
- Sin cinta animada ni cuenta regresiva, por las reglas de `DESIGN.md`.
- Spec en español, como el resto de `docs/superpowers/`.
