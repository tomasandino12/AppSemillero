export function limpiarNombre(nombreCrudo) {
  if (typeof nombreCrudo !== 'string') return '';
  let limpio = nombreCrudo.trim();
  limpio = limpio.replace(/\s+/g, ' ');
  limpio = limpio.replace(/\s+,/g, ',');
  limpio = limpio.replace(/,+/g, ',');
  limpio = limpio.replace(/,\s*/g, ', ');
  return limpio.trim();
}

export function clavearNombre(nombreLimpio) {
  if (typeof nombreLimpio !== 'string') return '';
  return nombreLimpio
    .toUpperCase()
    .normalize('NFD')
    .replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
    .replace(/,/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parsearFraccion(texto) {
  if (typeof texto !== 'string') return null;
  const m = texto.trim().match(/^(\d+)\/(\d+)$/);
  if (!m) return null;
  return { anotados: parseInt(m[1], 10), intentados: parseInt(m[2], 10) };
}

export function parsearEntero(texto) {
  if (typeof texto !== 'string') return null;
  const t = texto.trim();
  if (!/^-?\d+$/.test(t)) return null;
  return parseInt(t, 10);
}

export function parsearMinutos(texto) {
  if (typeof texto !== 'string') return null;
  const m = texto.trim().match(/^(\d{1,3}):([0-5]\d)$/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

export function parsearTitulo(tituloCrudo) {
  const resultado = { local: null, visitante: null, categoria: null, competencia: null, anio: null, error: null };
  if (typeof tituloCrudo !== 'string') {
    resultado.error = 'el título no es un string';
    return resultado;
  }
  const prefijo = 'Estadísticas - ';
  if (!tituloCrudo.startsWith(prefijo)) {
    resultado.error = 'el título no empieza con "Estadísticas - "';
    return resultado;
  }
  const partes = tituloCrudo.slice(prefijo.length).split(' - ').map((p) => p.trim());
  const [equipos, categoria, competencia, , anioTexto] = partes;
  if (!equipos || !equipos.includes(' vs ')) {
    resultado.error = 'no se encontró " vs " para separar local de visitante';
    return resultado;
  }
  const idx = equipos.indexOf(' vs ');
  resultado.local = equipos.slice(0, idx).trim();
  resultado.visitante = equipos.slice(idx + 4).trim();
  resultado.categoria = categoria || null;
  resultado.competencia = competencia || null;
  const anio = anioTexto ? parseInt(anioTexto, 10) : NaN;
  resultado.anio = Number.isFinite(anio) ? anio : null;
  return resultado;
}
