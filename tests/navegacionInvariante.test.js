import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fuente = (rel) => readFileSync(path.join(__dirname, '..', rel), 'utf8');

test('confirmacionImport nunca appendea botonVolver() con beforeend', () => {
  const lineas = fuente('src/ui/pantallas/confirmacionImport.js').split('\n');
  const ofensivas = lineas.filter((l) => l.includes('botonVolver()') && l.includes("insertAdjacentHTML('beforeend'"));
  assert.deepStrictEqual(
    ofensivas,
    [],
    'appendear botonVolver() con beforeend apila un segundo .pie-fijo sobre el existente: es el bug de footers superpuestos de la Etapa 2B',
  );
});

test('avanzarAJugadores limpia los restos del intento anterior antes de reinsertar', () => {
  const src = fuente('src/ui/pantallas/confirmacionImport.js');
  const idxRemoveCargando = src.indexOf("getElementById('cargando-jugadores')?.remove()");
  const idxRemoveBoton = src.indexOf("getElementById('btn-volver-inicio')?.remove()");
  const idxReinsercion = src.indexOf("insertAdjacentHTML('beforeend'");
  assert.notStrictEqual(idxRemoveCargando, -1, 'falta el remove() de #cargando-jugadores al tope de avanzarAJugadores');
  assert.notStrictEqual(idxRemoveBoton, -1, 'falta el remove() de #btn-volver-inicio al tope de avanzarAJugadores');
  assert.notStrictEqual(idxReinsercion, -1, 'falta la reinserción de #cargando-jugadores vía insertAdjacentHTML(\'beforeend\', ...)');
  assert.ok(
    idxRemoveCargando < idxReinsercion,
    'el remove() de #cargando-jugadores debe ejecutarse ANTES de la reinserción: si se mueve después (o a otra función), un segundo intento fallido deja dos nodos #cargando-jugadores y el mensaje de error se escribe en el que quedó muerto e invisible',
  );
  assert.ok(
    idxRemoveBoton < idxReinsercion,
    'el remove() de #btn-volver-inicio debe ejecutarse ANTES de la reinserción: es exactamente el bug de footers superpuestos de la Etapa 2B — si se mueve después de reinsertar, dos intentos fallidos seguidos apilan dos botones "Volver" con el mismo id y el que queda visible es el muerto',
  );
});

test('el router no conoce ni toca el botón de volver del contenido', () => {
  const src = fuente('src/ui/main.js');
  assert.ok(
    !src.includes('btn-volver-inicio'),
    'un solo dueño por afordancia: la vuelta del chrome es del router, la del contenido es de la pantalla',
  );
});

test('DATOS no tiene ningún rastro del plan físico: vive en la pestaña FÍSICO', () => {
  const src = fuente('src/ui/pantallas/datos.js');
  assert.doesNotMatch(src, /plan.?f[ií]sico|planFisico|plan-fisico/i);
});

test('FÍSICO va entre MEDIR y RECURSOS, con un ícono que no repite el de otra pestaña', async () => {
  const { TABS } = await import('../src/ui/chrome.js');
  const ids = TABS.map((t) => t.id);
  assert.ok(ids.includes('p-fisico'), 'falta la pestaña FÍSICO');
  assert.equal(ids.indexOf('p-fisico'), ids.indexOf('p-medir') + 1);
  assert.equal(ids.indexOf('p-recursos'), ids.indexOf('p-fisico') + 1);
  const iconos = TABS.map((t) => t.icono);
  assert.equal(new Set(iconos).size, iconos.length);
});

test('el plan físico vuelve por su propio retorno; el import de partido sigue con el suyo', () => {
  const plan = fuente('src/ui/pantallas/planFisico.js');
  assert.match(plan, /from '\.\/retornoPlanFisico\.js'/);
  assert.doesNotMatch(plan, /retornoImport\.js/);
  for (const archivo of ['confirmacionImport.js', 'resultadoImport.js']) {
    assert.match(fuente(`src/ui/pantallas/${archivo}`), /from '\.\/retornoImport\.js'/);
  }
});

test('FÍSICO pregunta a la base si hay un plan antes de mostrar el estado vacío', () => {
  const src = fuente('src/ui/pantallas/fisico.js');
  assert.match(src, /obtenerPlanesFisicos\(/);
  assert.match(src, /elegirPlanVisible\(/);
});

test('sesión y escalones vuelven a FÍSICO si cambia la categoría: lo que se veía es de otro plantel', () => {
  for (const archivo of ['fisicoSesion.js', 'fisicoEscalones.js']) {
    const src = fuente(`src/ui/pantallas/${archivo}`);
    assert.match(src, /plantel\.id !== actual\.plantelId/, archivo);
    assert.match(src, /ir\('p-fisico'\)/, archivo);
  }
});

test('la sesión no dice nada de los ejercicios sin video', () => {
  const src = fuente('src/ui/pantallas/fisicoSesion.js');
  assert.doesNotMatch(src, /sin video/i);
});

test('los escalones no proponen pesos de la nada: ni placeholder, ni escalón sugerido', () => {
  const src = fuente('src/ui/pantallas/fisicoEscalones.js');
  assert.doesNotMatch(src, /placeholder=/);
  // El escalón del ejercicio nunca arranca con un número: sólo con el guardado.
  assert.match(src, /existente\?\.paso != null \? escaparHtml\(formatearKg\(existente\.paso\)\) : ''/);
});

test('la escalera de pesos ya no existe: ni el estado "fuera", ni la palabra', () => {
  for (const archivo of ['src/ui/pantallas/fisicoEscalones.js', 'src/ui/pantallas/fisicoSesion.js', 'src/data/escalones.js']) {
    assert.doesNotMatch(fuente(archivo), /escalera/i, archivo);
  }
});

test('el primer peso arranca con el de la carga del plan, y nunca pisa uno guardado', () => {
  const src = fuente('src/ui/pantallas/fisicoEscalones.js');
  assert.match(src, /data-accion="escribir"/);
  assert.match(src, /escalon \? null : pesoSugeridoDeCarga\(actual\.linea\.cargaSugerida\)/);
  assert.match(src, /escalon \? formatearKg\(escalon\.kg\)/);
});

test('− se apaga sólo cuando bajar no daría un peso mayor que cero, sin piso inventado', () => {
  const src = fuente('src/ui/pantallas/fisicoEscalones.js');
  assert.match(src, /const bajar = nuevoPeso\(escalon\.kg, paso, 'bajar'\)/);
  assert.match(src, /bajar == null \? 'disabled' : ''/);
});

test('sin escalón definido no hay + ni −, pero el peso se anota igual', () => {
  const src = fuente('src/ui/pantallas/fisicoEscalones.js');
  assert.match(src, /if \(paso == null\)/);
  assert.match(src, /paso: null/);
});

test('coordinación tiene INVENTARIO después de Profes, y cada pestaña tiene su sección', async () => {
  const { TABS_COORDINACION } = await import('../src/ui/chrome.js');
  assert.deepEqual(TABS_COORDINACION.map((t) => t.id), ['p-coord-panorama', 'p-coord-profes', 'p-coord-inventario']);
  assert.equal(TABS_COORDINACION[2].texto, 'Inventario');
  const html = fuente('public/index.html');
  for (const t of TABS_COORDINACION) assert.match(html, new RegExp(`<section class="pant" id="${t.id}">`), t.id);
  assert.match(html, /id="coord-inventario-contenido"/);
});

test('la pestaña INVENTARIO está registrada con su render', () => {
  const src = fuente('src/ui/pantallas/registro.js');
  assert.match(src, /registrarPantalla\('p-coord-inventario', \{ titulo: 'Inventario', render: renderInventarioCoordinacion \}\)/);
});

test('el profe llega al inventario desde el pie de FÍSICO, en una pantalla sólo de lectura', () => {
  const registro = fuente('src/ui/pantallas/registro.js');
  assert.match(registro, /registrarPantalla\('p-inventario', \{ titulo: 'Inventario', render: renderInventarioLectura \}\)/);
  const html = fuente('public/index.html');
  assert.match(html, /<section class="pant" id="p-inventario"><div id="inventario-contenido"><\/div><\/section>/);
  const fisico = fuente('src/ui/pantallas/fisico.js');
  assert.match(fisico, /id="btn-ver-inventario"/);
  assert.match(fisico, /ir\('p-inventario', \{ push: true \}\)/);
});

// ---- Atrás del sistema (src/ui/historial.js) ----

/** `history` simulado: registra las llamadas y lleva la cuenta de entradas. */
function historiaFalsa() {
  const llamadas = [];
  return {
    llamadas,
    pushState: (estado) => llamadas.push(['push', estado.n]),
    replaceState: (estado) => llamadas.push(['replace', estado.n]),
    go: (n) => llamadas.push(['go', n]),
  };
}

test('ir con push apila una entrada de historial por pantalla apilada', async () => {
  const { crearHistorial } = await import('../src/ui/historial.js');
  const h = historiaFalsa();
  const historial = crearHistorial(h);
  historial.iniciar();
  historial.ajustar(1);
  historial.ajustar(2);
  assert.deepEqual(h.llamadas, [['replace', 0], ['push', 1], ['push', 2]]);
});

test('abrir y cerrar una hoja apila una entrada y la retira; el eco no mueve la app', async () => {
  const { crearHistorial } = await import('../src/ui/historial.js');
  const h = historiaFalsa();
  const historial = crearHistorial(h);
  historial.ajustar(1);
  historial.ajustar(0);
  assert.deepEqual(h.llamadas, [['push', 1], ['go', -1]]);
  assert.equal(historial.alPop({ n: 0 }), 0, 'el popstate de nuestro propio go() no es un Atrás de la persona');
});

test('Atrás del sistema pide un paso y no vuelve a empujar la entrada gastada', async () => {
  const { crearHistorial } = await import('../src/ui/historial.js');
  const h = historiaFalsa();
  const historial = crearHistorial(h);
  historial.ajustar(2);
  assert.equal(historial.alPop({ n: 1 }), 1);
  historial.ajustar(1); // la app ya volvió una pantalla
  assert.deepEqual(h.llamadas, [['push', 1], ['push', 2]], 'no hay go() ni push extra');
});

test('Atrás del sistema con una confirmación que frena la salida repone la entrada', async () => {
  const { crearHistorial } = await import('../src/ui/historial.js');
  const h = historiaFalsa();
  const historial = crearHistorial(h);
  historial.ajustar(1);
  assert.equal(historial.alPop(null), 1);
  historial.ajustar(1); // la app no se movió: hay que reponer la entrada
  assert.deepEqual(h.llamadas, [['push', 1], ['push', 1]]);
});

test('el menú largo del historial puede saltar varias entradas de una vez', async () => {
  const { crearHistorial } = await import('../src/ui/historial.js');
  const historial = crearHistorial(historiaFalsa());
  historial.ajustar(3);
  assert.equal(historial.alPop({ n: 0 }), 3);
});

test('no se empuja nada mientras una retirada está en vuelo', async () => {
  const { crearHistorial } = await import('../src/ui/historial.js');
  const h = historiaFalsa();
  const historial = crearHistorial(h);
  historial.ajustar(1);
  historial.ajustar(0); // cierra la hoja…
  historial.ajustar(1); // …y abre otra en el mismo tick
  assert.deepEqual(h.llamadas, [['push', 1], ['go', -1]]);
  assert.equal(historial.alPop({ n: 0 }), 0);
  assert.deepEqual(h.llamadas, [['push', 1], ['go', -1], ['push', 1]]);
});

test('sin pantallas apiladas Atrás no se intercepta: sale de la app', async () => {
  const { crearHistorial } = await import('../src/ui/historial.js');
  const historial = crearHistorial(historiaFalsa());
  assert.equal(historial.alPop({ n: 0 }), 0);
});

test('main.js y hoja.js conectan la pila y la hoja con el historial', () => {
  const main = fuente('src/ui/main.js');
  assert.match(main, /addEventListener\('popstate'/);
  assert.match(main, /pila\.length \+ capasAbiertas\(\)/);
  assert.match(main, /alCambiarHoja\(sincronizarHistorial\)/);
  const hoja = fuente('src/ui/componentes/hoja.js');
  assert.equal((hoja.match(/alCambiar\?\.\(\)/g) ?? []).length, 4, 'abrir/cerrar la hoja y registrar/liberar una capa avisan');
});

test('Adelante del navegador no desincroniza: el historial vuelve a lo que la app quiere', async () => {
  const { crearHistorial } = await import('../src/ui/historial.js');
  const h = historiaFalsa();
  const historial = crearHistorial(h);
  historial.ajustar(1);
  assert.equal(historial.alPop({ n: 0 }), 1); // Atrás: la app vuelve
  historial.ajustar(0);
  assert.equal(historial.alPop({ n: 1 }), 0, 'Adelante no es un paso hacia atrás');
  assert.deepEqual(h.llamadas.slice(-1), [['go', -1]], 'se retira la entrada que ya no corresponde');
});

test('las capas a pantalla completa cuentan para Atrás del sistema', () => {
  for (const archivo of ['componentes/cronometroSalida', 'componentes/marcadorCuadros', 'pantallas/jugJugadas']) {
    assert.match(fuente(`src/ui/${archivo}.js`), /registrarCapa\(/, archivo);
  }
  assert.match(fuente('src/ui/main.js'), /cerrarUltimaCapa\(\)/);
});

test('el editor de jugadas confirma al salir con cambios, también con Atrás del sistema', () => {
  assert.match(fuente('src/ui/pantallas/registro.js'), /p-jugada-editor.*confirmarSalida: confirmarSalidaEditor/);
  assert.match(fuente('src/ui/pantallas/jugadaEditor.js'), /export function confirmarSalidaEditor/);
});

test('cambiar de modo pasa por la confirmación de salida antes de fijar el modo', () => {
  const main = fuente('src/ui/main.js');
  const cuerpo = main.slice(main.indexOf('async function cambiarModo'));
  assert.ok(cuerpo.indexOf('frenaLaSalida') < cuerpo.indexOf('setModo('));
});
