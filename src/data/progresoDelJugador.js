import { porcentaje } from './estadisticas.js';
import { fechaLocal, claveDeEjercicio } from './escalones.js';
import { SIN_BLOQUE, bloquesPorClave } from './cargas.js';
import { sesionesDeLosPlanes } from './planDelJugador.js';

/*
 * Lógica pura de "Mi progreso": arma lo que mi_progreso() (0030) devuelve con
 * la forma que esperan las funciones de estadisticas.js, y suma lo que esas
 * funciones no hacen (acumulados de la temporada, progresión de pesos). Sin
 * red, sin DOM.
 *
 * Todo es del propio jugador y se compara con él mismo: ninguna función de acá
 * recibe filas de otros ni calcula un promedio del plantel.
 */

/**
 * Los cuatro insumos de estadisticas.js (sesiones, medicionesTiro, partidos,
 * estadisticas) desde el jsonb de mi_progreso(), con el jugadorId puesto: esas
 * funciones filtran por jugador, y acá todas las filas ya son suyas.
 */
export function insumosDeEstadisticas(progreso, jugadorId) {
  const sesiones = [...new Map((progreso.tiro ?? []).map((m) => [m.sesionId, { id: m.sesionId, fecha: m.fecha, tipo: 'tiro' }])).values()];
  return {
    jugadorId,
    sesiones,
    medicionesTiro: (progreso.tiro ?? []).map((m) => ({
      sesionId: m.sesionId, jugadorId, posicion: m.posicion, anotados: m.anotados, intentos: m.intentos,
    })),
    partidos: (progreso.partidos ?? []).map((p) => ({ id: p.partidoId, fecha: p.fecha, rivalNombre: p.rivalNombre })),
    estadisticas: (progreso.partidos ?? []).map((p) => ({ ...p, jugadorId })),
  };
}

// Suma sólo los pares donde los dos números se leyeron: un intento sin anotados
// (o al revés) inflaría o desinflaría el porcentaje.
function sumaDePares(filas, anotados, intentados) {
  let a = 0;
  let i = 0;
  for (const f of filas) {
    if (f[anotados] == null || f[intentados] == null) continue;
    a += f[anotados];
    i += f[intentados];
  }
  return porcentaje(a, i);
}

/**
 * Lo que lleva acumulado en la temporada. `porcentaje()` no devuelve un número
 * pelado: trae sus intentos y si la muestra es chica, así que la pantalla no
 * puede mostrar un 2P de 3 tiros como si fuera señal. Un dato que no se pudo
 * leer (null) no suma ni cuenta como cero: se cuenta aparte en `sinDato`.
 */
export function acumuladosDePartidos(partidos) {
  const filas = partidos ?? [];
  const conPuntos = filas.filter((f) => f.pts != null);
  const conMinutos = filas.filter((f) => f.minSegundos != null);
  return {
    partidos: filas.length,
    puntos: { total: conPuntos.reduce((s, f) => s + f.pts, 0), partidos: conPuntos.length },
    minutos: { total: Math.round(conMinutos.reduce((s, f) => s + f.minSegundos, 0) / 60), partidos: conMinutos.length },
    sinDato: { puntos: filas.length - conPuntos.length, minutos: filas.length - conMinutos.length },
    dos: sumaDePares(filas, 'dosAnotados', 'dosIntentados'),
    tres: sumaDePares(filas, 'tresAnotados', 'tresIntentados'),
    libres: sumaDePares(filas, 'libresAnotados', 'libresIntentados'),
  };
}

/**
 * Cómo se movió su peso en cada ejercicio, del primer movimiento al último.
 * `escalones` viene en orden de llegada (mi_progreso). La fecha es la del
 * dispositivo, como en FÍSICO: un peso anotado a las 22 en Argentina es de ese
 * día. `variacionKg` es null con un solo movimiento: no hay con qué comparar.
 * `bloquePorClave` (bloquesPorClave de cargas.js) le pone a cada ejercicio su
 * bloque del plan; sin dato queda null y se agrupa como "Sin bloque".
 */
export function progresionDePesos(escalones, bloquePorClave = new Map()) {
  const porEjercicio = new Map();
  for (const e of escalones ?? []) {
    if (!porEjercicio.has(e.clave)) porEjercicio.set(e.clave, { clave: e.clave, nombre: e.nombre, movimientos: [] });
    // `fecha` (ya local, la que trae la ficha del profe) no se vuelve a convertir:
    // new Date('2026-04-01') es UTC y en Argentina cae el día anterior.
    porEjercicio.get(e.clave).movimientos.push({ kg: Number(e.kg), fecha: e.fecha ?? fechaLocal(new Date(e.creadoEn)) });
  }
  return [...porEjercicio.values()]
    .map((x) => {
      const primero = x.movimientos[0].kg;
      const ultimo = x.movimientos[x.movimientos.length - 1].kg;
      return {
        ...x,
        bloque: bloquePorClave.get(x.clave) ?? null,
        inicialKg: primero,
        actualKg: ultimo,
        variacionKg: x.movimientos.length > 1 ? Math.round((ultimo - primero) * 100) / 100 : null,
      };
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

/**
 * Los ejercicios de progresionDePesos agrupados por bloque, para el desplegable
 * de cada uno. Los bloques van en el orden en que los trae el plan (el del mapa
 * de bloquesPorClave); "Sin bloque" siempre al final. `subieron` cuenta los
 * ejercicios con variación positiva: uno con una sola marca o que bajó no suma,
 * porque "subió" es una afirmación y ahí no hay con qué hacerla.
 */
export function pesosPorBloque(ejercicios, bloquePorClave = new Map()) {
  const orden = [...new Set(bloquePorClave?.values() ?? [])];
  const grupos = new Map();
  for (const e of ejercicios ?? []) {
    const bloque = e.bloque ?? SIN_BLOQUE;
    if (!grupos.has(bloque)) grupos.set(bloque, []);
    grupos.get(bloque).push(e);
  }
  const posicion = (b) => (b === SIN_BLOQUE ? Infinity : orden.indexOf(b) === -1 ? orden.length : orden.indexOf(b));
  return [...grupos]
    .map(([bloque, lista]) => ({
      bloque,
      ejercicios: lista,
      subieron: lista.filter((e) => e.variacionKg > 0).length,
    }))
    .sort((a, b) => posicion(a.bloque) - posicion(b.bloque));
}

/**
 * El bloque de cada ejercicio (por clave) según los planes del propio jugador
 * (mi_plan). mi_progreso no trae el bloque y la unión por nombre es JavaScript
 * (claveDeEjercicio), así que se arma acá. El orden del mapa es el del plan:
 * sesiones por fecha y, dentro de cada una, por `orden`.
 */
export function bloquePorClaveDePlanes(planes) {
  const lineas = sesionesDeLosPlanes(planes).flatMap((s) =>
    [...(s.lineas ?? [])]
      .sort((a, b) => a.orden - b.orden)
      .map((l) => ({ clave: claveDeEjercicio(l.nombreOriginal), bloque: l.bloque, fecha: s.fecha, orden: l.orden })));
  return bloquesPorClave(lineas);
}

/**
 * Lo que lee el profe de un chico (obtenerCargasDelPlantel con un solo jugador)
 * con la forma de progresionDePesos: `escalones` por fecha y orden de llegada, y
 * el mapa ejercicio→bloque. Como esa función agrupa por `clave`, acá la clave es
 * el pasoId. Los bloques quedan en el orden en que aparecen sus movimientos,
 * igual que en DATOS.
 */
export function pesosDeMovimientos(movimientos, ejercicios) {
  const porPaso = new Map((ejercicios ?? []).map((e) => [e.pasoId, e]));
  const ordenados = [...(movimientos ?? [])]
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.orden - b.orden);
  const bloquePorClave = new Map();
  for (const m of ordenados) {
    const bloque = porPaso.get(m.pasoId)?.bloque;
    if (bloque && !bloquePorClave.has(m.pasoId)) bloquePorClave.set(m.pasoId, bloque);
  }
  return {
    escalones: ordenados.map((m) => ({ clave: m.pasoId, nombre: porPaso.get(m.pasoId)?.nombre ?? m.pasoId, kg: m.kg, fecha: m.fecha })),
    bloquePorClave,
  };
}
