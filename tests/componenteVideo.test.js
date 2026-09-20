import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reproductorHtml, esVideoEmbebible } from '../src/ui/componentes/video.js';

const ID = 'dQw4w9WgXcQ';

test('un video de YouTube da un iframe de youtube-nocookie', () => {
  const h = reproductorHtml(`https://youtu.be/${ID}`, 'Tiro libre');
  assert.ok(h.includes(`<iframe src="https://www.youtube-nocookie.com/embed/${ID}?rel=0&amp;`), h);
  assert.equal(esVideoEmbebible(`https://youtu.be/${ID}`), true);
});

test('cualquier otro link no da iframe: la pantalla sigue con el link común', () => {
  for (const url of ['https://example.com/video.mp4', 'https://drive.google.com/file/d/1/view', '', null, undefined]) {
    assert.equal(reproductorHtml(url, 'x'), '', String(url));
    assert.equal(esVideoEmbebible(url), false, String(url));
  }
});

test('el título se escapa: no puede cerrar el atributo ni abrir una etiqueta', () => {
  const h = reproductorHtml(`https://youtu.be/${ID}`, '"><script>alert(1)</script>');
  assert.ok(!h.includes('<script>'));
  assert.ok(!h.includes('title=""'));
});
