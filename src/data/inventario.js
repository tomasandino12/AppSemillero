import { parsearPeso, formatearKg } from './escalones.js';

/*
 * Lógica pura del inventario de material: los tipos, la validación del alta y
 * la edición, y cómo se agrupa y se nombra cada fila. Sin red, sin DOM. Ver
 * docs/superpowers/specs/2026-09-18-inventario-material-design.md.
 *
 * Los tipos y sus reglas de peso son los mismos que los check de
 * 0026_material.sql: si se suma un tipo, cambian los dos juntos.
 */

export const TIPOS = [
  { clave: 'mancuerna', nombre: 'Mancuerna', grupo: 'Mancuernas', peso: 'obligatorio' },
  { clave: 'disco', nombre: 'Disco', grupo: 'Discos', peso: 'obligatorio' },
  { clave: 'barra', nombre: 'Barra', grupo: 'Barras', peso: 'obligatorio' },
  { clave: 'pesa_rusa', nombre: 'Pesa rusa', grupo: 'Pesas rusas', peso: 'obligatorio' },
  { clave: 'balon_medicinal', nombre: 'Balón medicinal', grupo: 'Balones medicinales', peso: 'obligatorio' },
  { clave: 'pelota', nombre: 'Pelota', grupo: 'Pelotas', peso: 'no' },
  { clave: 'cono', nombre: 'Cono', grupo: 'Conos', peso: 'no' },
  { clave: 'soga', nombre: 'Soga', grupo: 'Sogas', peso: 'no' },
  { clave: 'escalerita', nombre: 'Escalerita', grupo: 'Escaleritas', peso: 'no' },
  { clave: 'banda', nombre: 'Banda elástica', grupo: 'Bandas elásticas', peso: 'no' },
  { clave: 'otro', nombre: 'Otro', grupo: 'Otros', peso: 'opcional' },
];

const SECCIONES = [
  { titulo: 'Con peso', peso: 'obligatorio' },
  { titulo: 'Sin peso', peso: 'no' },
  { titulo: 'Otros', peso: 'opcional' },
];

export function tipoDe(clave) {
  return TIPOS.find((t) => t.clave === clave) ?? null;
}

/**
 * Lo que escribió el coordinador → la fila a guardar, o el primer error. En
 * un tipo sin peso, lo que venga en `peso` se ignora: el campo ni se muestra.
 */
export function validarMaterial({ tipo, peso, detalle, cantidad }) {
  const t = tipoDe(tipo);
  if (!t) return { error: 'Elegí un tipo.', fila: null };

  const det = typeof detalle === 'string' ? detalle.trim() : '';
  if (t.peso === 'opcional' && !det) return { error: 'Escribí qué es.', fila: null };

  let pesoKg = null;
  const textoPeso = typeof peso === 'string' ? peso.trim() : '';
  if (t.peso === 'obligatorio' || (t.peso === 'opcional' && textoPeso)) {
    const r = parsearPeso(textoPeso);
    if (r.error) return { error: r.error, fila: null };
    pesoKg = r.kg;
  }

  const textoCantidad = String(cantidad ?? '').trim();
  const n = /^\d+$/.test(textoCantidad) ? Number(textoCantidad) : NaN;
  if (!(n >= 1)) return { error: 'La cantidad tiene que ser un número entero, de 1 para arriba.', fila: null };

  return { error: null, fila: { tipo: t.clave, pesoKg, detalle: det, cantidad: n } };
}

/** La fila que el índice único material_unico tomaría como la misma variante. */
export function buscarIgual(filas, fila) {
  const det = fila.detalle.toLowerCase();
  return filas.find((f) => f.tipo === fila.tipo
    && (f.pesoKg ?? null) === (fila.pesoKg ?? null)
    && f.detalle.toLowerCase() === det) ?? null;
}

function compararFilas(a, b) {
  const pa = a.pesoKg ?? -1;
  const pb = b.pesoKg ?? -1;
  if (pa !== pb) return pa - pb;
  return a.detalle.localeCompare(b.detalle, 'es');
}

function compararOtros(a, b) {
  return a.detalle.localeCompare(b.detalle, 'es') || (a.pesoKg ?? -1) - (b.pesoKg ?? -1);
}

/** Con peso, sin peso y otros; dentro, los tipos en el orden de TIPOS. */
export function agruparInventario(filas) {
  return SECCIONES.map((s) => ({
    titulo: s.titulo,
    grupos: TIPOS.filter((t) => t.peso === s.peso)
      .map((t) => ({
        tipo: t.clave,
        titulo: t.grupo,
        filas: filas.filter((f) => f.tipo === t.clave)
          .sort(t.peso === 'opcional' ? compararOtros : compararFilas),
      }))
      .filter((g) => g.filas.length),
  })).filter((s) => s.grupos.length);
}

/** Lo que distingue a la fila dentro de su grupo. '' si no tiene nada. */
export function etiquetaDeFila(fila) {
  const kg = fila.pesoKg != null ? `${formatearKg(fila.pesoKg)} kg` : '';
  const partes = fila.tipo === 'otro' ? [fila.detalle, kg] : [kg, fila.detalle];
  return partes.filter(Boolean).join(' · ');
}

export function ultimoCambio(filas) {
  let ultimo = null;
  for (const f of filas) {
    if (!ultimo || Date.parse(f.actualizadoEn) > Date.parse(ultimo.actualizadoEn)) ultimo = f;
  }
  return ultimo;
}

export function textoYaExiste(fila) {
  const etiqueta = etiquetaDeFila(fila);
  const grupo = tipoDe(fila.tipo)?.grupo ?? fila.tipo;
  return `Ya está en el inventario: ${grupo}${etiqueta ? ` · ${etiqueta}` : ''} (${fila.cantidad} unid.).`;
}
