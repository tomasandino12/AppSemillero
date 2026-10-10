/**
 * Guía de primer uso: los pasos de la intro de cada modo y las pistas de una
 * vez. Ver docs/superpowers/specs/2026-10-10-guia-primer-uso-design.md.
 *
 * Las claves son los modos de sesion.js ('entrenar', 'coordinar', 'jugar'),
 * así la UI no traduce nada. Cada paso apunta a la pestaña de la que habla
 * por su id: ICONOS es privado de chrome.js y la UI saca el ícono de TABS.
 *
 * Tope de tres pasos: una intro más larga se saltea sin leer, y entonces no
 * sirvió de nada. Subir `version` la vuelve a mostrar a todos.
 */

const LINEA_CAMBIO_DE_MODO = 'Con el botón de arriba pasás a coordinar.';

export const GUIAS = {
  entrenar: {
    version: 1,
    pasos: [
      {
        pestana: 'p-plantel',
        titulo: 'Tu categoría y tu plantel',
        texto: 'Arriba elegís la categoría. En Plantel están tus jugadores, con la ficha de cada uno.',
      },
      {
        pestana: 'p-medir',
        titulo: 'Medir y Físico',
        texto: 'En Medir tomás salto, sprint, Yo-Yo y batería; si se corta internet, lo medido queda en este celular. En Físico cargás el plan de fuerza de la categoría.',
      },
      {
        pestana: 'p-datos',
        titulo: 'Datos, Recursos y Hoy',
        texto: 'En Datos subís la planilla del partido que exporta la CABB y ves las estadísticas. En Recursos, ejercicios y jugadas para tus jugadores. Hoy junta lo del día.',
      },
    ],
  },
  coordinar: {
    version: 1,
    pasos: [
      {
        pestana: 'p-coord-panorama',
        titulo: 'Panorama',
        texto: 'Cómo viene cada categoría a lo largo de la temporada, contra sí misma. Números del grupo, nunca de un chico en particular.',
      },
      {
        pestana: 'p-coord-profes',
        titulo: 'Profes',
        texto: 'Quién tiene acceso y qué categorías tiene a cargo cada uno. Es el único lugar desde donde se cambia.',
      },
      {
        pestana: 'p-coord-inventario',
        titulo: 'Inventario',
        texto: 'El material del club: lo que hay, cuánto y dónde. Los profes lo ven; lo editás vos.',
      },
    ],
  },
  jugar: {
    version: 1,
    pasos: [
      {
        pestana: 'p-jug-recursos',
        titulo: 'Recursos y Jugadas',
        texto: 'Lo que te manda tu profe para practicar, y las jugadas del equipo para mirarlas a pantalla completa.',
      },
      {
        pestana: 'p-jug-progreso',
        titulo: 'Físico y Mi progreso',
        texto: 'Tu plan de físico con la sesión de hoy, y cómo vienen tus mediciones. Sólo vos ves lo tuyo.',
      },
    ],
  },
};

export const PISTAS = {
  medir: 'Elegí la prueba y a quién medís. Lo que vas cargando se guarda en este celular hasta que lo envíes.',
  'jugada-editor': 'Tocá una ficha para elegirla y arrastrala para moverla. Una acción (pase, corte) se arma tocando primero quién la hace.',
};

/** Los pasos de la guía de un modo; quien entrena y coordina se entera del cambio de modo. */
export function pasosDeGuia(guiaId, roles = {}) {
  const guia = GUIAS[guiaId];
  if (!guia) return [];
  const pasos = guia.pasos.map((p) => ({ ...p }));
  if (guiaId === 'entrenar' && roles.esCoordinador) {
    const ultimo = pasos.at(-1);
    ultimo.texto = `${ultimo.texto} ${LINEA_CAMBIO_DE_MODO}`;
  }
  return pasos;
}

/** Lo que muestran el contador y los botones en el paso `indice` (desde 0). */
export function estadoDePaso(indice, total) {
  return {
    contador: `${indice + 1} de ${total}`,
    hayAnterior: indice > 0,
    textoSiguiente: indice >= total - 1 ? 'Empezar' : 'Siguiente',
  };
}
