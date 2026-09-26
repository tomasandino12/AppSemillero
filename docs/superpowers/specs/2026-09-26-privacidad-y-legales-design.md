# Privacidad y textos legales

Contexto: antes de abrir la app a familias y jugadores falta el costado legal
(Ley 25.326). La app guarda datos de menores, incluidos datos físicos que se
tratan como sensibles.

## Decisiones tomadas con Tomás (26/09)

- **El club es el responsable del tratamiento** y Tomás es quien presta la
  herramienta (encargado). Los pedidos de acceso, corrección o borrado van al
  club. No hay mail propio de la app por ahora.
- **Datos alojados en Supabase São Paulo.** Brasil no figura entre los países
  adecuados (Disp. AAIP 60/2016), así que la política lo informa y la
  aceptación lo cubre.
- **Jugadores (probablemente menores):** un único checkbox para todos, que
  dice *"Leí y acepto los Términos y la Política de privacidad. Si soy menor de
  18, un adulto responsable los leyó y me autorizó."* El consentimiento de las
  familias de chicos sin cuenta lo junta el club en su ficha de inscripción.
- **Sin acuerdo comercial todavía.** El acuerdo con el club es sólo sobre
  datos y uso del escudo; el de servicio y precio se arma aparte más adelante.

## Qué se construye

1. **Páginas legales**: `public/legal/privacidad.html` y `terminos.html`, HTML
   estático con los tokens de la app, servidas en `/privacidad` y `/terminos`,
   visibles sin sesión. Cada una muestra su versión (fecha). Se linkean desde
   la landing, el formulario de alta, la pantalla de aceptación y Mi perfil.
2. **Aceptación registrada**: tabla `aceptacion_legal` (migración 0051) con
   `usuario`, `version`, `aceptado_en`. El usuario sólo inserta su propia fila
   y lee las suyas; no hay update ni delete. Autoría y fecha las sella un
   trigger.
3. **Pantalla "Antes de seguir"** (vista pública `v-legal`): en
   `entrarConSesion`, después del nombre y antes del club, si no hay
   aceptación de `VERSION_LEGAL` se muestra la vista. Cubre el alta por mail,
   Google y las cuentas existentes. Sin tildar, el botón no avanza. Tiene la
   opción de salir de la cuenta.
4. **`src/data/legal.js`**: `VERSION_LEGAL` y el texto del consentimiento.
   Test de contrato: la versión que muestran las dos páginas coincide con
   `VERSION_LEGAL`.
5. **Fuentes propias**: los `.woff2` de Inter, Barlow Condensed e IBM Plex
   Mono en `public/fonts/`, `@font-face` en `tokens.css`, sin links a Google.
   La CSP deja de permitir `fonts.googleapis.com` y `fonts.gstatic.com`.
6. **Aviso en evaluaciones físicas**: una línea en la ficha y en el progreso
   del jugador: *"Valores estimados para orientar el entrenamiento; no
   reemplazan una evaluación médica."*
7. **Contraste**: un script mide los pares de color de `tokens.css` contra
   WCAG AA (4.5:1 texto, 3:1 texto grande y UI) y se corrigen los que fallen.
8. **Docs para el club** en `docs/legal/`: párrafo de consentimiento para la
   ficha de inscripción, acuerdo de datos club ↔ Tomás y checklist del club
   (registro en la AAIP, entre otros).

## Fuera de alcance

Mail de contacto propio, confirmación por mail del adulto, acuerdo comercial
y banner de cookies (no hay cookies de seguimiento ni analíticas).

## Riesgos

- Deploy antes del `db push` de 0051: la pantalla nueva falla al leer la
  tabla. Si la consulta falla por red se avisa y se vuelve a la landing,
  igual que el resto de `entrarConSesion`; el orden correcto es push y
  después deploy.
- Esto no es asesoramiento legal: los textos se revisan con el club.
