import { test } from 'node:test';
import assert from 'node:assert/strict';
import { html, crudo } from '../src/ui/html.js';

test('html escapa lo que se interpola', () => {
  const nombre = `<img src=x onerror="alert('x')"> & Cía`;
  assert.equal(
    String(html`<b>${nombre}</b>`),
    '<b>&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt; &amp; Cía</b>',
  );
});

test('html no escapa el texto fijo de la plantilla, sólo lo interpolado', () => {
  assert.equal(String(html`<p class="a">${'ok'}</p>`), '<p class="a">ok</p>');
});

test('un fragmento de html dentro de otro no se escapa dos veces', () => {
  const interno = html`<i>${'a & b'}</i>`;
  assert.equal(String(html`<p>${interno}</p>`), '<p><i>a &amp; b</i></p>');
});

test('una lista de fragmentos se une sin separador y cada dato se escapa', () => {
  const filas = ['<a>', 'b'].map((x) => html`<li>${x}</li>`);
  assert.equal(String(html`<ul>${filas}</ul>`), '<ul><li>&lt;a&gt;</li><li>b</li></ul>');
});

test('una lista de strings sueltos también se escapa', () => {
  assert.equal(String(html`${['<', '>']}`), '&lt;&gt;');
});

test('null, undefined y false quedan vacíos: sirve para `${condicion && html`...`}`', () => {
  assert.equal(String(html`[${null}][${undefined}][${false}]`), '[][][]');
  assert.equal(String(html`[${false && html`<b></b>`}]`), '[]');
});

test('los números se escriben tal cual y el cero no desaparece', () => {
  assert.equal(String(html`${0}/${12.5}`), '0/12.5');
});

test('crudo() deja pasar HTML propio y sólo eso', () => {
  assert.equal(String(html`<p>${crudo('<b>x</b>')}</p>`), '<p><b>x</b></p>');
  assert.equal(String(html`<p>${'<b>x</b>'}</p>`), '<p>&lt;b&gt;x&lt;/b&gt;</p>');
});

test('el resultado sirve directo para innerHTML: se convierte a texto solo', () => {
  assert.equal(`${html`<b>${'x'}</b>`}`, '<b>x</b>');
});
