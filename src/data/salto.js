/**
 * Salto vertical por video: del par de cuadros que marca el profe al tiempo
 * de vuelo, la altura y la potencia. Funciones puras: sin red, sin DOM.
 *
 * Fundamento y verificaciones con el S24 FE: docs/evaluaciones-fisicas/FUNDAMENTO.md.
 * En la base se guarda el tiempo de vuelo crudo, nunca la altura: la fórmula
 * vive sólo acá, así una corrección recalcula todo el histórico.
 */

export const G = 9.81;

/**
 * Tiempos de vuelo posibles para un chico: 0,10 s son 1,2 cm y 1,00 s son
 * 123 cm. Fuera de eso casi siempre son los fps equivocados (un video de 240
 * tomado como 30 da ocho veces más). Los mismos números están como check en
 * la base (0043, en ms); tests/contratoSalto.test.js los compara.
 */
export const TV_MIN_S = 0.10;
export const TV_MAX_S = 1.00;

/** Debajo de 120 fps cada cuadro de error ya son ±2 cm o más: no se mide. */
export const FPS_MIN = 120;
export const FPS_MAX = 960;

/** Una sesión es de un solo test (0043): CMJ y Abalakov no se comparan entre sí. */
export const TESTS_SALTO = ['cmj', 'abalakov'];
export const INTENTOS_SALTO = 3;

/**
 * Cuadros entre dos `mediaTime` del archivo. Se divide por el intervalo del
 * archivo (no por los fps de captura) porque Samsung guarda la cámara lenta
 * estirada a 30 fps: así da igual cómo esté codificado.
 */
export function cuadrosEntre(t1, t2, intervaloArchivoS) {
  return Math.round((t2 - t1) / intervaloArchivoS);
}

export function tiempoDeVuelo(nCuadros, fpsCaptura) {
  return nCuadros / fpsCaptura;
}

/** h = g·tv²/8, en cm. */
export function alturaDeSalto(tvS) {
  return ((G * tvS * tvS) / 8) * 100;
}

export function validarTiempoDeVuelo(tvS) {
  if (typeof tvS !== 'number' || !Number.isFinite(tvS)) {
    return { ok: false, motivo: 'Falta marcar el despegue y el aterrizaje.' };
  }
  if (tvS <= 0) return { ok: false, motivo: 'El aterrizaje tiene que ser después del despegue.' };
  if (tvS < TV_MIN_S) {
    return { ok: false, motivo: 'Es un vuelo demasiado corto. Revisá los cuadros marcados y los fps del video.' };
  }
  if (tvS > TV_MAX_S) {
    return { ok: false, motivo: 'Es un vuelo demasiado largo. Casi seguro los fps no son los del video: revisalos.' };
  }
  return { ok: true, motivo: null };
}

const sabido = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * Método de Samozino: con el largo de pierna extendida (L0) y en cuclillas
 * (hpush) sale la distancia de empuje, y de ahí fuerza, velocidad y potencia
 * media del despegue. Sin cualquiera de los datos es null ("no se sabe"),
 * nunca 0.
 */
export function potenciaSamozino({
  masaKg, alturaCm, piernaCm, piernaFlexionadaCm,
}) {
  if (![masaKg, alturaCm, piernaCm, piernaFlexionadaCm].every(sabido)) return null;
  const hpo = (piernaCm - piernaFlexionadaCm) / 100;
  if (hpo <= 0 || masaKg <= 0 || alturaCm < 0) return null;
  const h = alturaCm / 100;
  const fuerzaN = masaKg * G * (h / hpo + 1);
  const velocidadMs = Math.sqrt((G * h) / 2);
  const potenciaW = fuerzaN * velocidadMs;
  return {
    fuerzaN, velocidadMs, potenciaW, potenciaWKg: potenciaW / masaKg,
  };
}

const intentosValidos = (intentos) => (intentos ?? []).filter((i) => sabido(i?.tiempoVueloMs));

/** El de mayor altura, que es el de mayor tiempo de vuelo. null si no saltó. */
export function mejorIntento(intentos) {
  const validos = intentosValidos(intentos);
  if (!validos.length) return null;
  return validos.reduce((mejor, i) => (i.tiempoVueloMs > mejor.tiempoVueloMs ? i : mejor));
}

/** Diferencia de altura (cm) entre el mejor y el peor intento del día. Con menos de dos, null. */
export function rangoDeIntentos(intentos) {
  const alturas = intentosValidos(intentos).map((i) => alturaDeSalto(i.tiempoVueloMs / 1000));
  if (alturas.length < 2) return null;
  return Math.max(...alturas) - Math.min(...alturas);
}

/**
 * El valor de `campo` en la medición corporal más reciente con fecha ≤ la del
 * salto y ese dato cargado. Una medición posterior no vale: el chico pudo
 * haber crecido entre el salto y la medición.
 */
export function vigenteALaFecha(medicionesCorporales, fechaIso, campo) {
  let vigente = null;
  for (const m of medicionesCorporales ?? []) {
    if (!sabido(m[campo]) || m.fechaMedicion > fechaIso) continue;
    if (!vigente || m.fechaMedicion > vigente.fechaMedicion) vigente = m;
  }
  return vigente ? vigente[campo] : null;
}
