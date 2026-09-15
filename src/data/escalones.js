// Mismo criterio de normalización que el import y el matcheo de videos, y de la
// misma fuente: una línea y su escalera coinciden sólo por nombre exacto.
import { clavearNombre } from '../parser/parserCabb.js';

/*
 * Lógica pura de la pantalla FÍSICO: el plan que se muestra y los escalones de
 * peso. Sin red, sin DOM. Ver
 * docs/superpowers/specs/2026-09-15-fisico-plan-y-escalones-design.md.
 *
 * Nada de acá propone un peso. pasoDeEscalon sólo se mueve entre valores que
 * escribió el profe, y con un chico sin escalón no devuelve nada.
 */

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const KG = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });

/** 'AAAA-MM-DD' en la zona del dispositivo: "hoy" es el día del profe, no el de UTC. */
export function fechaLocal(fecha = new Date()) {
  const dos = (n) => String(n).padStart(2, '0');
  return `${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())}`;
}

/** Se arma en UTC a mano: new Date('2026-04-06') es UTC y en Argentina se corre al día anterior. */
export function diaDeLaSemana(iso) {
  const [anio, mes, dia] = iso.split('-').map(Number);
  return DIAS[new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay()];
}

export function formatearKg(kg) {
  return KG.format(Number(kg));
}

export function textoDeEscalera(pesos) {
  if (pesos.length === 1) return `${formatearKg(pesos[0])} kg`;
  return `${formatearKg(pesos[0])}–${formatearKg(pesos[pesos.length - 1])} kg`;
}

/**
 * Separan el espacio, el punto y coma o la coma seguida de espacio. Una coma
 * entre dígitos es decimal ("22,5"); por eso "8,10" es 8,1 y la hoja muestra
 * cómo se leyó antes de guardar. Ordena y saca repetidos: son los valores del
 * profe, no una sugerencia.
 */
export function parsearPesos(texto) {
  const crudo = typeof texto === 'string' ? texto.trim() : '';
  if (!crudo) return { error: 'Escribí al menos un peso.', pesos: null };
  const partes = crudo.split(/\s*;\s*|,\s+|\s+/).filter(Boolean);
  const pesos = [];
  for (const parte of partes) {
    if (!/^\d+([.,]\d+)?$/.test(parte)) {
      return { error: `"${parte}" no es un peso. Separá los pesos con espacio o con coma y espacio.`, pesos: null };
    }
    const kg = Number(parte.replace(',', '.'));
    if (!(kg > 0)) return { error: `${parte} no es mayor que cero.`, pesos: null };
    pesos.push(kg);
  }
  return { error: null, pesos: [...new Set(pesos)].sort((a, b) => a - b) };
}

export function estadoDelEscalon(pesos, kg) {
  if (kg == null) return 'sin';
  return pesos.map(Number).includes(Number(kg)) ? 'en' : 'fuera';
}

/**
 * Los kg de destino para + o −: el valor contiguo de la escalera, o el más
 * cercano de ese lado si el peso actual ya no está en ella. Sin escalón no hay
 * paso: ubicar a un chico es un toque explícito del profe.
 */
export function pasoDeEscalon(pesos, kg, direccion) {
  if (kg == null || !Array.isArray(pesos) || !pesos.length) return null;
  const actual = Number(kg);
  const valores = pesos.map(Number);
  if (direccion === 'subir') return valores.find((p) => p > actual) ?? null;
  if (direccion === 'bajar') return [...valores].reverse().find((p) => p < actual) ?? null;
  return null;
}

export function quedanFuera(pesosNuevos, escalones) {
  const valores = pesosNuevos.map(Number);
  return escalones.filter((e) => e.kg != null && !valores.includes(Number(e.kg)));
}

export function claveDeEjercicio(nombre) {
  return clavearNombre(nombre ?? '');
}

export function escaleraDeLinea(nombreOriginal, escaleras) {
  const clave = claveDeEjercicio(nombreOriginal);
  return escaleras.find((e) => e.clave === clave) ?? null;
}

export function estadoDePlan(plan, hoy) {
  if (plan.desde > hoy) return 'proximo';
  if (plan.hasta < hoy) return 'terminado';
  return 'en_curso';
}

/**
 * El plan que se muestra: el que contiene hoy; si no, el próximo; si no, el
 * último. En un empate, el importado más recientemente. Los demás, en "otros",
 * del más nuevo al más viejo.
 */
export function elegirPlanVisible(planes, hoy) {
  const conRango = (planes ?? [])
    .filter((p) => Array.isArray(p.fechas) && p.fechas.length)
    .map((p) => {
      const fechas = [...p.fechas].sort();
      return { ...p, desde: fechas[0], hasta: fechas[fechas.length - 1] };
    });
  if (!conRango.length) return { visible: null, estado: null, otros: [] };

  const masReciente = (a, b) => (b.creadoEn > a.creadoEn ? b : a);
  const enCurso = conRango.filter((p) => estadoDePlan(p, hoy) === 'en_curso');
  const proximos = conRango.filter((p) => estadoDePlan(p, hoy) === 'proximo');

  let visible;
  let estado;
  if (enCurso.length) {
    visible = enCurso.reduce(masReciente);
    estado = 'en_curso';
  } else if (proximos.length) {
    const inicio = proximos.map((p) => p.desde).sort()[0];
    visible = proximos.filter((p) => p.desde === inicio).reduce(masReciente);
    estado = 'proximo';
  } else {
    const fin = conRango.map((p) => p.hasta).sort()[conRango.length - 1];
    visible = conRango.filter((p) => p.hasta === fin).reduce(masReciente);
    estado = 'terminado';
  }

  const otros = conRango
    .filter((p) => p.id !== visible.id)
    .sort((a, b) => (a.desde < b.desde ? 1 : a.desde > b.desde ? -1 : 0));
  return { visible, estado, otros };
}

export function bloquesDeLineas(lineas) {
  const bloques = [];
  for (const l of lineas) {
    if (l.bloque && !bloques.includes(l.bloque)) bloques.push(l.bloque);
  }
  return bloques;
}

export function agruparPorBloque(lineas) {
  const grupos = [];
  for (const l of lineas) {
    const bloque = l.bloque ?? null;
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.bloque === bloque) ultimo.lineas.push(l);
    else grupos.push({ bloque, lineas: [l] });
  }
  return grupos;
}

/** Series, reps, carga y pausa como vienen del archivo; lo que falta no se muestra. */
export function detalleDeLinea(linea) {
  return [
    linea.series != null ? `${linea.series} ${linea.series === 1 ? 'serie' : 'series'}` : null,
    linea.reps,
    linea.cargaSugerida,
    linea.pausa ? `pausa ${linea.pausa}` : null,
  ].filter(Boolean).join(' · ');
}
