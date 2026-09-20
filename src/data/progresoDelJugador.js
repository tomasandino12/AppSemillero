import { porcentaje } from './estadisticas.js';
import { fechaLocal } from './escalones.js';

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
 */
export function progresionDePesos(escalones) {
  const porEjercicio = new Map();
  for (const e of escalones ?? []) {
    if (!porEjercicio.has(e.clave)) porEjercicio.set(e.clave, { clave: e.clave, nombre: e.nombre, movimientos: [] });
    porEjercicio.get(e.clave).movimientos.push({ kg: Number(e.kg), fecha: fechaLocal(new Date(e.creadoEn)) });
  }
  return [...porEjercicio.values()]
    .map((x) => {
      const primero = x.movimientos[0].kg;
      const ultimo = x.movimientos[x.movimientos.length - 1].kg;
      return {
        ...x,
        inicialKg: primero,
        actualKg: ultimo,
        variacionKg: x.movimientos.length > 1 ? Math.round((ultimo - primero) * 100) / 100 : null,
      };
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}
