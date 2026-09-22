import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ICONO, botonIcono } from '../src/ui/componentes/iconos.js';

test('botonIcono escapa la etiqueta y pone aria-label y title', () => {
  const out = botonIcono({ id: 'btn-x', icono: ICONO.lapiz, etiqueta: 'Renombrar <script>' }).toString();
  assert.ok(out.includes('id="btn-x"'));
  assert.ok(out.includes('aria-label="Renombrar &lt;script&gt;"'));
  assert.ok(out.includes('title="Renombrar &lt;script&gt;"'));
  assert.ok(!out.includes('<script>'));
  assert.ok(out.includes(ICONO.lapiz));
});

test('cada ICONO es un svg con viewBox 0 0 24 24', () => {
  for (const [nombre, svg] of Object.entries(ICONO)) {
    assert.ok(svg.startsWith('<svg '), `${nombre}: no arranca con <svg `);
    assert.ok(svg.includes('viewBox="0 0 24 24"'), `${nombre}: falta el viewBox`);
    assert.ok(svg.endsWith('</svg>'), `${nombre}: no cierra con </svg>`);
  }
});
