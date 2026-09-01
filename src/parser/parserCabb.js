import * as XLSX from 'xlsx';

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

const TEXTOS_ESPERADOS = [
  'Num.', 'Nombre', 'MIN', 'PTS',
  'A/I', '%', 'A/I', '%', 'A/I', '%',
  'DEF', 'OF', 'Tot.', 'AST', 'REC', 'PER', 'TC', 'TR', 'FC', 'FR', 'VAL', '+/-',
];

const CAMPOS_ESPERADOS = [
  'numero', 'nombre', 'minTexto', 'pts',
  'dosAI', 'dosPct', 'tresAI', 'tresPct', 'libresAI', 'libresPct',
  'def', 'of', 'tot', 'ast', 'rec', 'per', 'tc', 'tr', 'fc', 'fr', 'val', 'masMenos',
];

function extraerIdPartidoCabb(nombreArchivo) {
  if (typeof nombreArchivo !== 'string') return null;
  const m = nombreArchivo.match(/estadisticaPartido_(\d+)/i);
  return m ? m[1] : null;
}

function leerCelda(filaDatos, col) {
  if (col === undefined || !filaDatos) return '';
  return String(filaDatos[col] ?? '').trim();
}

function resolverColumnas(filaHeaders, filaAgrupadores) {
  const celdas = (filaHeaders ?? [])
    .map((texto, col) => ({ texto: String(texto ?? '').trim(), col }))
    .filter((c) => c.texto !== '');

  if (celdas.length !== TEXTOS_ESPERADOS.length) {
    return { error: `[HEADERS_INVALIDOS] se esperaban ${TEXTOS_ESPERADOS.length} columnas de datos, se encontraron ${celdas.length}` };
  }
  for (let i = 0; i < TEXTOS_ESPERADOS.length; i++) {
    if (celdas[i].texto !== TEXTOS_ESPERADOS[i]) {
      return { error: `[HEADERS_INVALIDOS] columna ${i + 1}: se esperaba "${TEXTOS_ESPERADOS[i]}", se encontró "${celdas[i].texto}"` };
    }
  }

  const agrupadores = (filaAgrupadores ?? [])
    .map((texto) => String(texto ?? '').trim())
    .filter((texto) => ['TC 2P', 'TC 3P', 'TL'].includes(texto));
  const ordenEsperado = ['TC 2P', 'TC 3P', 'TL'];
  const ordenValido = agrupadores.length === 3 && ordenEsperado.every((t, i) => agrupadores[i] === t);
  if (!ordenValido) {
    return { error: `[ORDEN_AGRUPADORES_INVALIDO] el orden esperado es "TC 2P, TC 3P, TL", se encontró "${agrupadores.join(', ')}"` };
  }

  const columnas = {};
  CAMPOS_ESPERADOS.forEach((campo, i) => { columnas[campo] = celdas[i].col; });
  return { columnas };
}

function encontrarNombreEquipo(grilla, filaHeaderIdx) {
  for (let f = filaHeaderIdx - 2; f >= 0; f--) {
    const texto = leerCelda(grilla[f], 0);
    if (texto === '') continue;
    if (texto === 'TOTALES') continue;
    if (texto === 'CONFEDERACIÓN ARGENTINA DE BASQUETBOL') continue;
    if (texto.startsWith('Estadísticas - ')) continue;
    return { nombre: texto, fila: f + 1 };
  }
  return { nombre: null, fila: null };
}

function parsearCampoEntero(filaDatos, columnas, campo, fila, nombreCampo, advertencias) {
  const texto = leerCelda(filaDatos, columnas[campo]);
  const valor = parsearEntero(texto);
  if (valor === null && texto !== '') {
    advertencias.push({ fila, campo: nombreCampo, mensaje: `[CAMPO_INVALIDO] "${texto}" no es un entero válido` });
  }
  return valor;
}

function parsearCampoFraccion(filaDatos, columnas, campoAI, campoPct, fila, nombreGrupo, advertencias) {
  const textoAI = leerCelda(filaDatos, columnas[campoAI]);
  const fraccion = parsearFraccion(textoAI);
  if (fraccion === null && textoAI !== '') {
    advertencias.push({ fila, campo: nombreGrupo, mensaje: `[CAMPO_INVALIDO] "${textoAI}" no es una fracción válida` });
  }
  const textoPct = leerCelda(filaDatos, columnas[campoPct]);
  const porcentaje = parsearEntero(textoPct);
  if (porcentaje === null && textoPct !== '') {
    advertencias.push({ fila, campo: `${nombreGrupo}.porcentaje`, mensaje: `[CAMPO_INVALIDO] "${textoPct}" no es un porcentaje válido` });
  }
  if (fraccion && porcentaje !== null) {
    const calculado = fraccion.intentados > 0 ? Math.round((fraccion.anotados / fraccion.intentados) * 100) : 0;
    if (Math.abs(calculado - porcentaje) > 1) {
      advertencias.push({
        fila, campo: `${nombreGrupo}.porcentaje`,
        mensaje: `[PORCENTAJE_INCONSISTENTE] ${fraccion.anotados}/${fraccion.intentados} da ${calculado}%, la planilla dice ${porcentaje}%`,
      });
    }
  }
  return {
    anotados: fraccion ? fraccion.anotados : null,
    intentados: fraccion ? fraccion.intentados : null,
    porcentaje,
  };
}

function parsearFilaMetricas(filaDatos, columnas, fila, advertencias) {
  const minTexto = leerCelda(filaDatos, columnas.minTexto);
  const segundos = parsearMinutos(minTexto);
  if (segundos === null && minTexto !== '') {
    advertencias.push({ fila, campo: 'min', mensaje: `[CAMPO_INVALIDO] "${minTexto}" no tiene formato mm:ss` });
  }

  const def = parsearCampoEntero(filaDatos, columnas, 'def', fila, 'reb.def', advertencias);
  const of = parsearCampoEntero(filaDatos, columnas, 'of', fila, 'reb.of', advertencias);
  const tot = parsearCampoEntero(filaDatos, columnas, 'tot', fila, 'reb.tot', advertencias);
  if (def !== null && of !== null && tot !== null && tot !== def + of) {
    advertencias.push({ fila, campo: 'reb.tot', mensaje: `[REBOTES_INCONSISTENTES] tot=${tot} pero def+of=${def + of}` });
  }

  return {
    min: segundos === null ? null : { texto: minTexto, segundos },
    pts: parsearCampoEntero(filaDatos, columnas, 'pts', fila, 'pts', advertencias),
    dos: parsearCampoFraccion(filaDatos, columnas, 'dosAI', 'dosPct', fila, 'dos', advertencias),
    tres: parsearCampoFraccion(filaDatos, columnas, 'tresAI', 'tresPct', fila, 'tres', advertencias),
    libres: parsearCampoFraccion(filaDatos, columnas, 'libresAI', 'libresPct', fila, 'libres', advertencias),
    reb: { def, of, tot },
    ast: parsearCampoEntero(filaDatos, columnas, 'ast', fila, 'ast', advertencias),
    rec: parsearCampoEntero(filaDatos, columnas, 'rec', fila, 'rec', advertencias),
    per: parsearCampoEntero(filaDatos, columnas, 'per', fila, 'per', advertencias),
    tap: {
      cometidos: parsearCampoEntero(filaDatos, columnas, 'tc', fila, 'tap.cometidos', advertencias),
      recibidos: parsearCampoEntero(filaDatos, columnas, 'tr', fila, 'tap.recibidos', advertencias),
    },
    fal: {
      cometidas: parsearCampoEntero(filaDatos, columnas, 'fc', fila, 'fal.cometidas', advertencias),
      recibidas: parsearCampoEntero(filaDatos, columnas, 'fr', fila, 'fal.recibidas', advertencias),
    },
    val: parsearCampoEntero(filaDatos, columnas, 'val', fila, 'val', advertencias),
    masMenos: parsearCampoEntero(filaDatos, columnas, 'masMenos', fila, 'masMenos', advertencias),
  };
}

function parsearJugador(filaDatos, columnas, fila, advertencias) {
  const numeroTexto = leerCelda(filaDatos, columnas.numero);
  if (numeroTexto === '') {
    advertencias.push({ fila, campo: 'numero', mensaje: '[SIN_NUMERO] falta el número de camiseta' });
  }
  const nombreCrudo = leerCelda(filaDatos, columnas.nombre);
  const nombreLimpio = limpiarNombre(nombreCrudo);
  const idxComa = nombreLimpio.indexOf(',');
  let apellido, nombre;
  if (idxComa === -1) {
    apellido = nombreLimpio;
    nombre = '';
    advertencias.push({ fila, campo: 'nombre', mensaje: `[NOMBRE_SIN_COMA] "${nombreLimpio}" no tiene coma` });
  } else {
    apellido = nombreLimpio.slice(0, idxComa).trim();
    nombre = nombreLimpio.slice(idxComa + 1).trim();
  }

  return {
    fila,
    numero: numeroTexto === '' ? null : numeroTexto,
    nombreCrudo,
    nombreLimpio,
    apellido,
    nombre,
    nombreClave: clavearNombre(nombreLimpio),
    ...parsearFilaMetricas(filaDatos, columnas, fila, advertencias),
  };
}

function extraerFilasDelBloque(grilla, filaHeaderIdx, columnas, advertencias) {
  const jugadores = [];
  let totales = null;
  let f = filaHeaderIdx + 1;
  while (f < grilla.length) {
    const filaDatos = grilla[f] ?? [];
    const nombreTexto = leerCelda(filaDatos, columnas.nombre);
    if (nombreTexto === '') { f++; continue; }
    if (nombreTexto === 'TOTALES') {
      totales = { fila: f + 1, ...parsearFilaMetricas(filaDatos, columnas, f + 1, advertencias) };
      break;
    }
    jugadores.push(parsearJugador(filaDatos, columnas, f + 1, advertencias));
    f++;
  }
  return { jugadores, totales };
}

function verificarSumas(jugadores, totales, advertencias) {
  if (!totales) return;
  const campos = [
    ['pts', (j) => j.pts],
    ['reb.def', (j) => j.reb.def],
    ['reb.of', (j) => j.reb.of],
    ['reb.tot', (j) => j.reb.tot],
    ['ast', (j) => j.ast],
    ['rec', (j) => j.rec],
    ['per', (j) => j.per],
    ['fal.cometidas', (j) => j.fal.cometidas],
    ['fal.recibidas', (j) => j.fal.recibidas],
  ];
  for (const [nombreCampo, obtener] of campos) {
    const valores = jugadores.map(obtener);
    if (valores.some((v) => v === null)) continue;
    const valorTotales = obtener(totales);
    if (valorTotales === null) continue;
    const suma = valores.reduce((a, b) => a + b, 0);
    if (suma !== valorTotales) {
      advertencias.push({
        fila: totales.fila, campo: nombreCampo,
        mensaje: `[SUMA_INCONSISTENTE] la suma de los jugadores (${suma}) no coincide con TOTALES (${valorTotales})`,
      });
    }
  }
}

export function parsearPartidoCabb(datos, nombreArchivo) {
  const salida = {
    contrato: '1.0',
    origen: {
      archivo: typeof nombreArchivo === 'string' ? nombreArchivo : null,
      idPartidoCabb: extraerIdPartidoCabb(nombreArchivo),
      hoja: null,
    },
    partido: { tituloCrudo: null, local: null, visitante: null, categoria: null, competencia: null, anio: null },
    equipos: [],
    advertencias: [],
    errores: [],
  };

  try {
    let workbook;
    try {
      const bytes = datos instanceof ArrayBuffer ? new Uint8Array(datos) : datos;
      workbook = XLSX.read(bytes, { type: 'array' });
    } catch (e) {
      salida.errores.push({ fila: null, campo: null, mensaje: `[LECTURA_FALLIDA] no se pudo leer el archivo: ${e.message}` });
      return salida;
    }

    const nombreHoja = workbook.SheetNames.find((n) => n.startsWith('Estadísticas'));
    if (!nombreHoja) {
      salida.errores.push({ fila: null, campo: null, mensaje: '[SIN_HOJA_ESTADISTICAS] no se encontró un worksheet que empiece con "Estadísticas"' });
      return salida;
    }
    salida.origen.hoja = nombreHoja;

    const grilla = XLSX.utils.sheet_to_json(workbook.Sheets[nombreHoja], { header: 1, defval: '', raw: false });

    let tituloCrudo = null;
    for (const fila of grilla) {
      const encontrado = (fila ?? []).map((c) => String(c ?? '').trim()).find((t) => t.startsWith('Estadísticas - '));
      if (encontrado) { tituloCrudo = encontrado; break; }
    }
    if (tituloCrudo === null) {
      salida.errores.push({ fila: null, campo: 'titulo', mensaje: '[TITULO_INVALIDO] no se encontró una celda que empiece con "Estadísticas - "' });
    } else {
      salida.partido.tituloCrudo = tituloCrudo;
      const titulo = parsearTitulo(tituloCrudo);
      if (titulo.error) {
        salida.errores.push({ fila: null, campo: 'titulo', mensaje: `[TITULO_INVALIDO] ${titulo.error}` });
      }
      salida.partido.local = titulo.local;
      salida.partido.visitante = titulo.visitante;
      salida.partido.categoria = titulo.categoria;
      salida.partido.competencia = titulo.competencia;
      salida.partido.anio = titulo.anio;
    }

    const filasHeader = [];
    grilla.forEach((fila, idx) => {
      const colNum = (fila ?? []).findIndex((c) => String(c ?? '').trim() === 'Num.');
      if (colNum !== -1) filasHeader.push(idx);
    });

    if (filasHeader.length !== 2) {
      salida.errores.push({ fila: null, campo: null, mensaje: `[HEADERS_INVALIDOS] se esperaban 2 filas de headers ("Num."), se encontraron ${filasHeader.length}` });
      return salida;
    }

    const condiciones = ['local', 'visitante'];
    filasHeader.forEach((filaHeaderIdx, i) => {
      const filaHeaders = grilla[filaHeaderIdx] ?? [];
      const filaAgrupadores = grilla[filaHeaderIdx - 1] ?? [];
      const resuelto = resolverColumnas(filaHeaders, filaAgrupadores);
      if (resuelto.error) {
        salida.errores.push({ fila: filaHeaderIdx + 1, campo: null, mensaje: resuelto.error });
        return;
      }
      const { nombre, fila: filaNombre } = encontrarNombreEquipo(grilla, filaHeaderIdx);
      const { jugadores, totales } = extraerFilasDelBloque(grilla, filaHeaderIdx, resuelto.columnas, salida.advertencias);
      verificarSumas(jugadores, totales, salida.advertencias);
      salida.equipos.push({ condicion: condiciones[i], nombre, filaNombre, jugadores, totales });
    });
  } catch (e) {
    salida.errores.push({ fila: null, campo: null, mensaje: `[LECTURA_FALLIDA] error inesperado: ${e.message}` });
  }

  return salida;
}
