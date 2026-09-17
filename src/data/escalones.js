// Mismo criterio de normalización que el import y el matcheo de videos, y de la
// misma fuente: una línea y su escalón coinciden sólo por nombre exacto.
import { clavearNombre } from '../parser/parserCabb.js';

/*
 * Lógica pura de la pantalla FÍSICO: el plan que se muestra y los escalones de
 * peso. Sin red, sin DOM. Ver
 * docs/superpowers/specs/2026-09-15-fisico-plan-y-escalones-design.md.
 *
 * Nada de acá propone un peso. El ejercicio tiene un escalón (cuánto se mueve
 * por vez, lo escribe el profe) y el chico un peso actual; + y − sólo suman o
 * restan ese escalón, y sin peso o sin escalón no devuelven nada.
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

/**
 * Un número solo: el peso de un chico o el escalón de un ejercicio. Una coma
 * entre dígitos es decimal ("12,5"), el mismo criterio de siempre. No propone
 * nada: si está vacío, devuelve error.
 */
export function parsearPeso(texto) {
  const crudo = typeof texto === 'string' ? texto.trim() : '';
  if (!crudo) return { error: 'Escribí un número.', kg: null };
  if (!/^\d+([.,]\d+)?$/.test(crudo)) {
    return { error: `"${crudo}" no es un número en kg.`, kg: null };
  }
  const kg = Number(crudo.replace(',', '.'));
  if (!(kg > 0)) return { error: 'Tiene que ser mayor que cero.', kg: null };
  return { error: null, kg: redondearKg(kg) };
}

/**
 * Los kg de destino de + o −: el peso actual más o menos el escalón del
 * ejercicio. Devuelve null cuando no hay adónde ir — sin peso cargado, sin
 * escalón definido, o si restar dejaría el peso en cero o menos. No hay piso ni
 * techo inventados: el único límite es que un peso sea mayor que cero.
 */
export function nuevoPeso(kg, paso, direccion) {
  if (kg == null || paso == null) return null;
  const actual = Number(kg);
  const salto = Number(paso);
  if (!(salto > 0)) return null;
  if (direccion !== 'subir' && direccion !== 'bajar') return null;
  const destino = redondearKg(direccion === 'subir' ? actual + salto : actual - salto);
  return destino > 0 ? destino : null;
}

// Sumar y restar decimales en punto flotante deja colas (12,3 − 2,1 = 10,199…).
// Dos decimales es más de lo que distingue una pesa.
function redondearKg(kg) {
  return Math.round(kg * 100) / 100;
}

// El número pegado a "kg", sin importar qué venga antes ("Barra Ol + 10 kg",
// "Manc. 10kg (x2)"). El primero, si el texto trae más de uno.
const KG_EN_CARGA = /(\d+(?:[.,]\d+)?)\s*kg/i;

/**
 * Con qué número arranca el campo cuando el profe le pone el peso a un chico
 * por primera vez: el de la carga sugerida de esa línea del plan, que ya está
 * escrita en kg. No lo guarda nadie: el profe lo confirma o lo cambia antes de
 * guardar. Sin número pegado a "kg" ("PC", "Fallo", "5xL") devuelve null y el
 * campo arranca vacío — de esos textos no se adivina nada.
 */
export function pesoSugeridoDeCarga(cargaSugerida) {
  const texto = typeof cargaSugerida === 'string' ? cargaSugerida : '';
  const encontrado = texto.match(KG_EN_CARGA);
  if (!encontrado) return null;
  const kg = redondearKg(Number(encontrado[1].replace(',', '.')));
  return kg > 0 ? kg : null;
}

export function claveDeEjercicio(nombre) {
  return clavearNombre(nombre ?? '');
}

export function pasoDeLinea(nombreOriginal, pasos) {
  const clave = claveDeEjercicio(nombreOriginal);
  return pasos.find((p) => p.clave === clave) ?? null;
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
