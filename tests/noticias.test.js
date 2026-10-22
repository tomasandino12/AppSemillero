import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIMITE } from '../src/data/limites.js';
import {
  ETIQUETAS_NOTICIA, MAX_FOTOS, MAX_BYTES_ORIGINAL, TIPOS_FOTO_ORIGINAL,
  validarNoticia, validarArchivoFoto, medidasAchicadas, rutaFoto, parrafos, esIdNoticia, rotuloDeEtiqueta,
  fechaDeNoticia, textoFechaCorta, urlFotoValida, noticiaDesdeFila, noticiaResumenDesdeFila, noticiaPublicaDesdeFila,
} from '../src/data/noticias.js';

/**
 * Lo que escribe la coordinación en una noticia termina en una página que ve
 * cualquiera, con fotos de un club formativo. Se valida acá y otra vez en la
 * base (los checks de 0064, comparados en contratoNoticia). Sin red ni DOM.
 */

const BASE = { titulo: ' Ganó la U13 ', resumen: ' Resumen ', cuerpo: ' Texto ', etiqueta: 'partidos', fotos: [], autorizacionImagen: false };
const C = '11111111-1111-4111-8111-111111111111';
const N = '22222222-2222-4222-8222-222222222222';
const F = '33333333-3333-4333-8333-333333333333';

test('validarNoticia: una noticia sin fotos pasa, recortada', () => {
  assert.deepEqual(validarNoticia(BASE), {
    error: null, campo: null, foto: null,
    noticia: { titulo: 'Ganó la U13', resumen: 'Resumen', cuerpo: 'Texto', etiqueta: 'partidos', alts: [], autorizacionImagen: false },
  });
});

test('validarNoticia: título, resumen y cuerpo son obligatorios y tienen el largo de la base', () => {
  for (const [campo, limite] of [['titulo', LIMITE.tituloNoticia], ['resumen', LIMITE.resumenNoticia], ['cuerpo', LIMITE.cuerpoNoticia]]) {
    for (const vacio of ['', '   ', undefined]) {
      const r = validarNoticia({ ...BASE, [campo]: vacio });
      assert.equal(r.campo, campo, `${campo} vacío`);
      assert.equal(r.noticia, null);
    }
    assert.equal(validarNoticia({ ...BASE, [campo]: 'x'.repeat(limite + 1) }).campo, campo, `${campo} largo`);
    assert.equal(validarNoticia({ ...BASE, [campo]: 'x'.repeat(limite) }).error, null, `${campo} justo`);
  }
});

test('validarNoticia: la etiqueta tiene que ser de la lista', () => {
  for (const { clave } of ETIQUETAS_NOTICIA) assert.equal(validarNoticia({ ...BASE, etiqueta: clave }).error, null, clave);
  for (const otra of ['otra', '', null, 'Club']) assert.equal(validarNoticia({ ...BASE, etiqueta: otra }).campo, 'etiqueta', String(otra));
});

test('validarNoticia: con fotos y sin la autorización de imagen, no pasa (sólo true cuenta)', () => {
  const sin = validarNoticia({ ...BASE, fotos: [{ alt: 'La cancha' }] });
  assert.equal(sin.campo, 'autorizacion');
  assert.match(sin.error, /autorización de imagen/);
  assert.equal(validarNoticia({ ...BASE, fotos: [{ alt: 'La cancha' }], autorizacionImagen: 'true' }).campo, 'autorizacion');
  assert.equal(validarNoticia({ ...BASE, fotos: [{ alt: 'La cancha' }], autorizacionImagen: true }).error, null);
});

test('validarNoticia: cada foto con su descripción, del largo de la base; hasta 6', () => {
  const sinAlt = validarNoticia({ ...BASE, fotos: [{ alt: 'Una' }, { alt: '  ' }], autorizacionImagen: true });
  assert.deepEqual([sinAlt.campo, sinAlt.foto], ['fotos', 1]);
  assert.match(sinAlt.error, /foto 2/);
  assert.match(sinAlt.error, /sin nombres/);
  assert.equal(validarNoticia({ ...BASE, fotos: [{ alt: 'x'.repeat(LIMITE.altFoto + 1) }], autorizacionImagen: true }).foto, 0);
  const siete = validarNoticia({ ...BASE, fotos: Array.from({ length: MAX_FOTOS + 1 }, () => ({ alt: 'x' })), autorizacionImagen: true });
  assert.deepEqual([siete.campo, siete.foto], ['fotos', null]);
  assert.deepEqual(validarNoticia({ ...BASE, fotos: [{ alt: ' La cancha ' }], autorizacionImagen: true }).noticia.alts, ['La cancha']);
});

test('validarArchivoFoto: jpg, png o webp de hasta 15 MB; HEIC, PDF, sin tipo o de 20 MB, con un mensaje claro', () => {
  for (const type of TIPOS_FOTO_ORIGINAL) assert.equal(validarArchivoFoto({ type, size: 1000 }), null, type);
  for (const type of ['image/heic', 'application/pdf', '', undefined]) assert.match(validarArchivoFoto({ type, size: 1000 }), /JPG, PNG o WEBP/, String(type));
  assert.match(validarArchivoFoto({ type: 'image/jpeg', size: 20 * 1048576 }), /15 MB/);
  assert.equal(validarArchivoFoto({ type: 'image/jpeg', size: MAX_BYTES_ORIGINAL }), null);
  assert.match(validarArchivoFoto(null), /JPG, PNG o WEBP/);
});

test('medidasAchicadas: el lado largo a 1600, proporcional; una foto chica no se agranda', () => {
  assert.deepEqual(medidasAchicadas(4000, 3000), { ancho: 1600, alto: 1200 });
  assert.deepEqual(medidasAchicadas(3000, 4000), { ancho: 1200, alto: 1600 });
  assert.deepEqual(medidasAchicadas(800, 600), { ancho: 800, alto: 600 });
  assert.deepEqual(medidasAchicadas(4000, 1), { ancho: 1600, alto: 1 }, 'nunca 0 px');
});

test('rutaFoto: <club>/<noticia>/<nombre>.<ext> según el tipo guardado; lo demás, null', () => {
  assert.equal(rutaFoto(C, N, F, 'image/webp'), `${C}/${N}/${F}.webp`);
  assert.equal(rutaFoto(C, N, F, 'image/jpeg'), `${C}/${N}/${F}.jpg`);
  assert.equal(rutaFoto(C, N, F, 'image/png'), null, 'png no se guarda: se pasa a webp o jpeg');
  assert.equal(rutaFoto('../x', N, F, 'image/webp'), null);
});

test('parrafos: separados por línea en blanco, recortados y sin vacíos; un salto simple queda adentro', () => {
  assert.deepEqual(parrafos('Uno\nsigue\n\n\n  Dos  \n \nTres'), ['Uno\nsigue', 'Dos', 'Tres']);
  assert.deepEqual(parrafos('Uno\r\n\r\nDos'), ['Uno', 'Dos']);
  assert.deepEqual(parrafos(''), []);
  assert.deepEqual(parrafos(null), []);
});

test('esIdNoticia: sólo un uuid (el ?n= de la URL no llega a la base si no lo es)', () => {
  assert.equal(esIdNoticia(N), true);
  for (const malo of ['abc', '', null, `${N}x`, "1' or '1'='1", N.toUpperCase().replace(/-/g, '')]) assert.equal(esIdNoticia(malo), false, String(malo));
});

test('rotuloDeEtiqueta: el texto de la etiqueta, o null', () => {
  assert.deepEqual(ETIQUETAS_NOTICIA.map((e) => e.clave), ['club', 'partidos', 'eventos', 'inscripcion']);
  assert.equal(rotuloDeEtiqueta('inscripcion'), 'Inscripción');
  assert.equal(rotuloDeEtiqueta('otra'), null);
});

test('fechas: el día de la publicación en Rosario y el texto corto de la tarjeta', () => {
  assert.equal(fechaDeNoticia('2026-10-21T02:30:00Z'), '2026-10-20', 'las 23:30 del 20 en Rosario');
  assert.equal(fechaDeNoticia('2026-10-21T15:00:00+00:00'), '2026-10-21');
  assert.equal(fechaDeNoticia('nada'), null);
  assert.equal(fechaDeNoticia(null), null);
  assert.equal(textoFechaCorta('2026-10-21'), 'mié, 21 oct');
  assert.equal(textoFechaCorta(null), '');
});

test('urlFotoValida: sólo del bucket de noticias del proyecto; blob: sólo en la vista previa', () => {
  const base = 'https://x.supabase.co';
  const ok = `${base}/storage/v1/object/public/noticias/${C}/${N}/${F}.webp`;
  assert.equal(urlFotoValida(ok, base), ok);
  assert.equal(urlFotoValida(`https://evil.com/storage/v1/object/public/noticias/${F}.webp`, base), null);
  assert.equal(urlFotoValida(`${base}/storage/v1/object/public/otro/${F}.webp`, base), null);
  assert.equal(urlFotoValida(`${ok}" onerror="alert(1)`, base), null);
  assert.equal(urlFotoValida(ok, undefined), null);
  assert.equal(urlFotoValida('blob:http://localhost:5174/abc', base), null);
  assert.equal(urlFotoValida('blob:http://localhost:5174/abc', base, { previa: true }), 'blob:http://localhost:5174/abc');
});

test('mappers: de la fila al dominio en camelCase, con la URL de cada foto', () => {
  const urlDe = (ruta) => `https://x/${ruta}`;
  assert.deepEqual(noticiaDesdeFila({
    id: N, titulo: 't', resumen: 'r', cuerpo: 'c', etiqueta: 'club', fotos: [{ ruta: 'a.webp', alt: 'A' }],
    autorizacion_imagen: true, publicada: false, publicada_en: null, actualizado_en: '2026-10-21T10:00:00Z',
  }), {
    id: N, titulo: 't', resumen: 'r', cuerpo: 'c', etiqueta: 'club', fotos: [{ ruta: 'a.webp', alt: 'A' }],
    autorizacionImagen: true, publicada: false, publicadaEn: null, actualizadoEn: '2026-10-21T10:00:00Z',
  });
  assert.deepEqual(noticiaResumenDesdeFila({ id: N, titulo: 't', resumen: 'r', etiqueta: 'club', foto: { ruta: 'a.webp', alt: 'A' }, publicada_en: '2026-10-21T15:00:00Z' }, urlDe), {
    id: N, titulo: 't', resumen: 'r', etiqueta: 'club', foto: { url: 'https://x/a.webp', alt: 'A' }, publicadaEn: '2026-10-21T15:00:00Z', fecha: '2026-10-21',
  });
  assert.equal(noticiaResumenDesdeFila({ id: N, titulo: 't', resumen: 'r', etiqueta: 'club', foto: null, publicada_en: null }, urlDe).foto, null);
  assert.deepEqual(noticiaPublicaDesdeFila({ id: N, titulo: 't', resumen: 'r', cuerpo: 'c', etiqueta: 'club', fotos: [{ ruta: 'a.webp', alt: 'A' }], publicada_en: '2026-10-21T15:00:00Z' }, urlDe), {
    id: N, titulo: 't', resumen: 'r', cuerpo: 'c', etiqueta: 'club', fotos: [{ url: 'https://x/a.webp', alt: 'A' }], publicadaEn: '2026-10-21T15:00:00Z', fecha: '2026-10-21',
  });
});
