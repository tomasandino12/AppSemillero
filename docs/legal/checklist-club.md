# Checklist legal antes de abrir la app a familias y jugadores

> No es asesoramiento legal. Es la lista de lo que falta para que lo que dice
> la Política de privacidad sea cierto.

## En la reunión con el club

Con alguien que pueda firmar por el club (comisión directiva, secretaría o
quien tenga poder para obligarlo; un profe no alcanza).

- [ ] Firmar dos copias de `acuerdo-datos-club.md`, una para cada parte.
- [ ] Acordar quién atiende los pedidos de las familias (ver, corregir,
      borrar datos): la coordinación de básquet, la secretaría, etc.
- [ ] Confirmar que el club autoriza el uso del nombre y el escudo (cláusula 7).

## Lo que hace el club

- [ ] Sumar el texto de `consentimiento-familias.md` a la ficha de
      inscripción.
- [ ] Juntar esa firma **también para los jugadores que ya están cargados**.
- [ ] Inscribir la base de datos en el Registro Nacional de Bases de Datos de
      la AAIP. El trámite es gratuito y se hace online por Trámites a
      Distancia (TAD).
- [ ] Pedirles a los profes que no saquen datos de la app (capturas por
      WhatsApp, planillas propias).
- [ ] Al empezar cada temporada, dar de baja en la app a los profes que ya no
      están.

## Lo que hace Tomás

- [ ] `npx supabase db push` para aplicar 0051, **antes** de desplegar la
      pantalla de aceptación.
- [ ] Correr `tests/verificarAceptacionLegal.sql` en el SQL Editor: los seis
      casos tienen que dar OK.
- [ ] Desplegar y entrar con una cuenta de prueba: tiene que aparecer "Antes
      de seguir" una sola vez.
- [ ] Si el club pide cambios a los textos de `/privacidad` o `/terminos`,
      cambiar la fecha en las dos páginas y en `VERSION_LEGAL`
      (`src/data/legal.js`): todos vuelven a aceptar.
