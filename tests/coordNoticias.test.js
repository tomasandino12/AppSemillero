import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Coordinación → Noticias: escribir, publicar, despublicar y borrar las
 * noticias del portal, con fotos. Como Formularios, es una pantalla secundaria
 * que se abre desde Familias. Sin navegador en los tests: se atan por el texto
 * las promesas que se rompen sin avisar (sobre todo las de privacidad).
 */
const fuente = (ruta) => readFileSync(ruta, 'utf8');
const pantalla = fuente('src/ui/pantallas/coordNoticias.js');
const cuerpoDe = (nombre) => {
  const desde = pantalla.search(new RegExp(`(async )?function ${nombre}\\(`));
  assert.ok(desde >= 0, `falta ${nombre}`);
  return pantalla.slice(desde, pantalla.indexOf('\n}\n', desde));
};

test('es una pantalla secundaria: tiene su sección, está registrada y no suma pestaña', async () => {
  assert.match(fuente('public/index.html'), /<section class="pant" id="p-coord-noticias"><div id="coord-noticias-contenido"><\/div><\/section>/);
  assert.match(fuente('src/ui/pantallas/registro.js'), /registrarPantalla\('p-coord-noticias', \{ titulo: 'Noticias', render: renderNoticias \}\)/);
  const { TABS_COORDINACION } = await import('../src/ui/chrome.js');
  assert.ok(!TABS_COORDINACION.some((t) => t.id === 'p-coord-noticias'));
});

test('se llega desde Familias, al lado de Formularios', () => {
  const familias = fuente('src/ui/pantallas/coordFamilias.js');
  assert.equal((familias.match(/id="fam-ir-noticias"/g) ?? []).length, 1);
  assert.match(familias, /ir\('p-coord-noticias', \{ push: true \}\)/);
});

test('avisa que lo publicado lo ve cualquiera, sin nombres de chicos, y que las fotos van con autorización', () => {
  assert.match(pantalla, /lo ve cualquiera/i);
  assert.match(pantalla, /nombres de chicos/i);
  assert.match(pantalla, /autorización de imagen/i);
});

test('los campos usan los límites de la base y la validación pura', () => {
  for (const limite of ['tituloNoticia', 'resumenNoticia', 'cuerpoNoticia', 'altFoto']) {
    assert.match(pantalla, new RegExp(`maxlength="\\$\\{LIMITE\\.${limite}\\}"`), limite);
  }
  assert.match(pantalla, /validarNoticia\(/);
  assert.match(pantalla, /validarArchivoFoto\(/);
  assert.match(pantalla, /accept="\$\{TIPOS_FOTO_ORIGINAL\.join\(','\)\}"/);
});

test('la casilla de la autorización arranca como estaba guardada (nueva: destildada)', () => {
  assert.match(pantalla, /<input id="not-autorizacion" type="checkbox"\$\{v\.autorizacionImagen && html` checked`\}>/);
  assert.match(pantalla, /autorizacionImagen: \$\('not-autorizacion'\)\.checked/);
});

test('el id de una noticia nueva lo pone el navegador, y las fotos se suben a su carpeta antes de crear la fila', () => {
  const g = cuerpoDe('guardar');
  assert.match(g, /const id = noticia\?\.id \?\? crypto\.randomUUID\(\);/);
  assert.ok(g.indexOf('subirFotoNoticia(') < g.indexOf('crearNoticia('));
  assert.match(g, /rutaFoto\(club\.id, id, crypto\.randomUUID\(\), f\.blob\.type\)/);
});

test('si falla el guardado, borra las fotos que alcanzó a subir; las quitadas, recién después de guardar', () => {
  const g = cuerpoDe('guardar');
  const captura = g.indexOf('} catch (e) {');
  assert.ok(captura > 0 && g.indexOf('borrarFotosNoticia(subidas)') > captura);
  assert.ok(g.indexOf('borrarFotosNoticia(quitadas)') > g.indexOf('crearNoticia('), 'las quitadas, cuando la noticia ya no las nombra');
});

test('cada foto se achica en el navegador antes de subirla', () => {
  const a = cuerpoDe('achicarFoto');
  assert.match(a, /validarArchivoFoto\(archivo\)/);
  assert.match(a, /medidasAchicadas\(/);
  assert.match(a, /for \(const calidad of CALIDADES_FOTO\)/);
  assert.match(a, /'image\/webp'/);
  assert.match(a, /'image\/jpeg'/);
  assert.match(a, /MAX_BYTES_FOTO/);
});

test('borrar pide confirmación con el verbo, y la vista previa usa la misma plantilla que el portal', () => {
  assert.match(cuerpoDe('borrar'), /confirmarEnHoja\(\{[\s\S]*verbo: 'Borrar'/);
  assert.match(pantalla, /htmlDetalleNoticia\([\s\S]*\{ previa: true \}\)/);
  assert.match(fuente('public/index.html'), /<link rel="stylesheet" href="\/public\/css\/portal\.css">/);
});

test('mientras guarda se deshabilitan todos los botones de la hoja (un doble toque no crea dos noticias)', () => {
  const g = cuerpoDe('guardar');
  assert.match(g, /querySelectorAll\('\.acciones-hoja button'\)/);
  assert.ok(g.indexOf('deshabilitar(true)') < g.indexOf('subirFotoNoticia('), 'antes de subir nada');
  assert.ok(g.indexOf('deshabilitar(false)') > g.indexOf('} catch (e) {'), 'se rehabilitan si falla');
});

test('si el guardado falla por la red, no borra las fotos subidas: quizá la fila ya las nombra', () => {
  const g = cuerpoDe('guardar');
  const captura = g.slice(g.indexOf('} catch (e) {'));
  assert.match(captura, /esErrorDeRed\(e\)/);
  assert.ok(captura.indexOf('esErrorDeRed(e)') < captura.indexOf('borrarFotosNoticia(subidas)'));
});

test('al elegir fotos avisa de las que no entran (más de 6) y junta todos los errores', () => {
  const a = cuerpoDe('agregarFotos');
  assert.match(a, /MAX_FOTOS/);
  assert.match(a, /avisos\.push\(/);
  assert.match(a, /avisos\.join\(/);
});
