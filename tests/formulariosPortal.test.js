import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIMITE } from '../src/data/limites.js';
import { readFileSync } from 'node:fs';
import { validarFormulario, moverFormulario, ordenarFormularios, formularioDesdeFila, formularioPublicoDesdeFila, resolverFormularios, resolverConsultas, DESTINOS, separarFormularios, quienTieneElDestino, enlaceDeConsultas, accionesPrincipales } from '../src/data/formulariosPortal.js';

/**
 * Lo que la coordinación escribe en el panel termina en una tarjeta de la
 * página pública, así que se valida acá y otra vez en la base (el check de
 * 0058). Estas pruebas no tocan red ni DOM.
 */

const valido = { titulo: 'Comprobante de rifas', texto: 'Tené a mano la foto del comprobante de pago.', enlace: 'https://forms.gle/AbC123' };

test('un formulario válido pasa y queda recortado de espacios', () => {
  const r = validarFormulario({ titulo: '  Comprobante de rifas ', texto: '  Tené a mano la foto.  ', enlace: '  https://forms.gle/AbC123  ' });
  assert.equal(r.error, null);
  assert.deepEqual(r.formulario, { titulo: 'Comprobante de rifas', texto: 'Tené a mano la foto.', enlace: 'https://forms.gle/AbC123', destino: null });
});

test('rechaza título o texto vacío o sólo de espacios', () => {
  assert.match(validarFormulario({ ...valido, titulo: '' }).error, /título/i);
  assert.match(validarFormulario({ ...valido, titulo: '   ' }).error, /título/i);
  assert.match(validarFormulario({ ...valido, texto: '' }).error, /para qué es/i);
  assert.match(validarFormulario({ ...valido, texto: '  ' }).error, /para qué es/i);
  assert.match(validarFormulario({}).error, /título/i);
});

test('rechaza título o texto más largos que el límite de la base', () => {
  assert.match(validarFormulario({ ...valido, titulo: 'x'.repeat(LIMITE.titulo + 1) }).error, /título/i);
  assert.equal(validarFormulario({ ...valido, titulo: 'x'.repeat(LIMITE.titulo) }).error, null);
  assert.match(validarFormulario({ ...valido, texto: 'x'.repeat(LIMITE.textoFormulario + 1) }).error, /texto|largo|corto/i);
  assert.equal(validarFormulario({ ...valido, texto: 'x'.repeat(LIMITE.textoFormulario) }).error, null);
});

test('rechaza enlaces fuera de Google Forms', () => {
  for (const malo of ['', 'forms.gle/AbC123', 'http://forms.gle/AbC123', 'javascript:alert(1)', 'https://evil.com/forms/x',
    'https://docs.google.com/document/d/1', 'https://forms.gle.evil.com/x', null]) {
    const r = validarFormulario({ ...valido, enlace: malo });
    assert.match(r.error ?? '', /Google Forms/, String(malo));
    assert.equal(r.formulario, null);
  }
});

test('acepta el enlace corto y el largo de Google Forms', () => {
  assert.equal(validarFormulario({ ...valido, enlace: 'https://docs.google.com/forms/d/e/1FAIpQ/viewform' }).error, null);
  assert.equal(validarFormulario({ ...valido, enlace: 'https://forms.gle/AbC123' }).error, null);
});

const lista = () => [
  { id: 'a', titulo: 'Inscripción', orden: 1 },
  { id: 'b', titulo: 'Pase', orden: 2 },
  { id: 'c', titulo: 'Aranceles', orden: 3 },
];

test('ordenarFormularios ordena por orden y desempata por título, sin tocar la lista original', () => {
  const desordenada = [{ id: 'z', titulo: 'B', orden: 2 }, { id: 'y', titulo: 'A', orden: 2 }, { id: 'x', titulo: 'C', orden: 1 }];
  assert.deepEqual(ordenarFormularios(desordenada).map((f) => f.id), ['x', 'y', 'z']);
  assert.deepEqual(desordenada.map((f) => f.id), ['z', 'y', 'x']);
});

test('subir y bajar renumera sin huecos ni repetidos', () => {
  const r = moverFormulario(lista(), 'c', 'subir');
  assert.deepEqual(r.lista.map((f) => [f.id, f.orden]), [['a', 1], ['c', 2], ['b', 3]]);
  const r2 = moverFormulario(r.lista, 'a', 'bajar');
  assert.deepEqual(r2.lista.map((f) => [f.id, f.orden]), [['c', 1], ['a', 2], ['b', 3]]);
});

test('devuelve sólo los que cambiaron de lugar, para guardar lo mínimo', () => {
  const r = moverFormulario(lista(), 'b', 'bajar');
  assert.deepEqual(r.cambios, [{ id: 'b', orden: 3 }, { id: 'c', orden: 2 }]);
});

test('el primero no sube y el último no baja: no cambia nada', () => {
  for (const [id, dir] of [['a', 'subir'], ['c', 'bajar']]) {
    const r = moverFormulario(lista(), id, dir);
    assert.deepEqual(r.cambios, []);
    assert.deepEqual(r.lista.map((f) => f.id), ['a', 'b', 'c']);
  }
});

test('con huecos o repetidos en orden, igual deja 1..n y cuenta el arreglo como cambio', () => {
  const rota = [{ id: 'a', orden: 5 }, { id: 'b', orden: 5 }, { id: 'c', orden: 9 }];
  const r = moverFormulario(rota, 'b', 'subir');
  assert.deepEqual(r.lista.map((f) => f.orden), [1, 2, 3]);
  assert.ok(r.cambios.length >= 1);
});

test('un id que no existe no cambia nada', () => {
  const r = moverFormulario(lista(), 'nope', 'subir');
  assert.deepEqual(r.cambios, []);
});

test('formularioDesdeFila pasa de la fila de la base al objeto de dominio, sin columnas de más', () => {
  const fila = {
    id: 'f1', club_id: 'c1', titulo: 'Inscripción', texto: 'Tené a mano el DNI.', enlace: 'https://forms.gle/AbC', orden: 2, activo: false,
    creado_por: 'u1', creado_en: '2026-10-18T10:00:00Z', actualizado_por: 'u2', actualizado_en: '2026-10-19T10:00:00Z',
  };
  assert.deepEqual(formularioDesdeFila(fila), {
    id: 'f1', titulo: 'Inscripción', texto: 'Tené a mano el DNI.', enlace: 'https://forms.gle/AbC', orden: 2, activo: false, destino: null,
    actualizadoPor: 'u2', actualizadoEn: '2026-10-19T10:00:00Z',
  });
  assert.equal(formularioDesdeFila({ ...fila, destino: 'consultas' }).destino, 'consultas');
});

test('formularioPublicoDesdeFila sólo trae título, texto, enlace y destino; sin destino (base vieja) es común', () => {
  assert.deepEqual(formularioPublicoDesdeFila({ titulo: 'T', texto: 'x', enlace: 'https://forms.gle/a', destino: 'colaboradores', orden: 3, id: 'z' }),
    { titulo: 'T', texto: 'x', enlace: 'https://forms.gle/a', destino: 'colaboradores' });
  assert.equal(formularioPublicoDesdeFila({ titulo: 'T', texto: 'x', enlace: 'https://forms.gle/a' }).destino, null);
});

test('validarFormulario: el destino es opcional y sólo admite los de la app; vacío es sin destino', () => {
  const base = { titulo: 'T', texto: 'x', enlace: 'https://forms.gle/AbC' };
  for (const sin of [undefined, null, '']) assert.equal(validarFormulario({ ...base, destino: sin }).formulario.destino, null, String(sin));
  for (const { clave } of DESTINOS) assert.equal(validarFormulario({ ...base, destino: clave }).formulario.destino, clave);
  for (const malo of ['otra-cosa', 'CONSULTAS', ' consultas', 7]) {
    const r = validarFormulario({ ...base, destino: malo });
    assert.match(r.error ?? '', /cómo se muestra/i, String(malo));
    assert.equal(r.formulario, null);
  }
});

const mezcla = () => [
  { id: 'a', titulo: 'Inscripción', orden: 1, destino: null },
  { id: 'b', titulo: 'Quiero jugar', orden: 2, destino: 'consultas' },
  { id: 'c', titulo: 'Rifas', orden: 3 },
  { id: 'd', titulo: 'Sponsors', orden: 4, destino: 'colaboradores' },
];

test('separarFormularios aparta los dos destinos y deja el resto, en orden, como comunes', () => {
  const r = separarFormularios(mezcla());
  assert.equal(r.consultas.id, 'b');
  assert.equal(r.colaboradores.id, 'd');
  assert.deepEqual(r.comunes.map((f) => f.id), ['a', 'c']);
});

test('separarFormularios: sin destinos, todo es común; con un destino repetido gana el primero y el otro no se pierde', () => {
  assert.deepEqual(separarFormularios([{ id: 'x' }, { id: 'y' }]), { consultas: null, colaboradores: null, inscripcion: null, comprobante: null, recaudacion: null, comunes: [{ id: 'x' }, { id: 'y' }] });
  const r = separarFormularios([{ id: 'p', destino: 'consultas' }, { id: 'q', destino: 'consultas' }]);
  assert.equal(r.consultas.id, 'p');
  assert.deepEqual(r.comunes.map((f) => f.id), ['q']);
  assert.deepEqual(separarFormularios([]), { consultas: null, colaboradores: null, inscripcion: null, comprobante: null, recaudacion: null, comunes: [] });
});

test('quienTieneElDestino devuelve el formulario que lo usa, salvo el que se está editando', () => {
  assert.equal(quienTieneElDestino(mezcla(), 'consultas')?.id, 'b');
  assert.equal(quienTieneElDestino(mezcla(), 'consultas', 'b'), null);
  assert.equal(quienTieneElDestino(mezcla(), 'colaboradores', 'a')?.id, 'd');
  assert.equal(quienTieneElDestino(mezcla(), null), null);
  assert.equal(quienTieneElDestino([], 'consultas'), null);
});

test('enlaceDeConsultas devuelve el enlace válido del de consultas, o null', () => {
  assert.equal(enlaceDeConsultas([{ destino: 'consultas', enlace: 'https://forms.gle/AbC' }]), 'https://forms.gle/AbC');
  assert.equal(enlaceDeConsultas([{ destino: 'consultas', enlace: 'https://evil.com/forms/x' }]), null);
  assert.equal(enlaceDeConsultas([{ destino: 'colaboradores', enlace: 'https://forms.gle/AbC' }]), null);
  assert.equal(enlaceDeConsultas([]), null);
});

test('el repo del portal usa la función pública y sólo las columnas con grant de update', () => {
  const repo = readFileSync('src/data/repos/portal.js', 'utf8');
  assert.match(repo, /rpc\('formularios_publicos', \{ p_club: clubId \}\)/);
  const updates = [...repo.matchAll(/\.update\(\{([^}]*)\}\)/g)].map((m) => m[1]);
  assert.equal(updates.length, 2, 'reordenar (orden) y asignar destino');
  for (const u of updates) assert.doesNotMatch(u, /club_id|creado_por|actualizado_por/);
  assert.match(repo, /const cambios = \{ titulo, texto, enlace, activo \};/);
  assert.match(repo, /if \(destino !== undefined\) cambios\.destino = destino;/);
  assert.match(repo, /\.update\(cambios\)/);
  assert.match(repo, /export async function asignarDestinoFormulario\(/);
  assert.match(repo, /const COLUMNAS = '[^']*\bdestino\b/);
  assert.doesNotMatch(repo, /\.delete\(\)/);
  assert.match(readFileSync('src/data/repositorio.js', 'utf8'), /export \* from '\.\/repos\/portal\.js';/);
});

const respaldo = [{ titulo: 'Inscripción', texto: 'x', enlace: 'https://forms.gle/a' }];

test('resolverFormularios: con filas muestra las de la base, no el respaldo', async () => {
  const filas = [{ titulo: 'Rifas', texto: 'y', enlace: 'https://forms.gle/b' }];
  assert.deepEqual(await resolverFormularios(async () => filas, respaldo), { estado: 'base', formularios: filas });
});

test('resolverFormularios: lista vacía es vacía, no respaldo: la coordinación pudo ocultarlos a propósito', async () => {
  assert.deepEqual(await resolverFormularios(async () => [], respaldo), { estado: 'vacio', formularios: [] });
});

test('resolverFormularios: si la base falla, cae al respaldo y no tira', async () => {
  const r = await resolverFormularios(async () => { throw new Error('sin red'); }, respaldo);
  assert.deepEqual(r, { estado: 'respaldo', formularios: respaldo });
});

// ---- /consultas: a dónde lleva la dirección fija del QR ----

test('resolverConsultas: con el formulario de consultas vigente, redirige a su enlace', async () => {
  const lista = [{ destino: null, enlace: 'https://forms.gle/otro' }, { destino: 'consultas', enlace: 'https://forms.gle/Consultas1' }];
  assert.deepEqual(await resolverConsultas(async () => lista), { estado: 'redirigir', url: 'https://forms.gle/Consultas1' });
});

test('resolverConsultas: sin formulario de consultas (o con enlace no válido) no redirige a ningún lado', async () => {
  assert.deepEqual(await resolverConsultas(async () => []), { estado: 'sin-formulario' });
  assert.deepEqual(await resolverConsultas(async () => [{ destino: 'colaboradores', enlace: 'https://forms.gle/x' }]), { estado: 'sin-formulario' });
  assert.deepEqual(await resolverConsultas(async () => [{ destino: 'consultas', enlace: 'https://evil.com/forms/x' }]), { estado: 'sin-formulario' });
});

test('resolverConsultas: si la base falla, dice error (no inventa un destino) y no tira', async () => {
  assert.deepEqual(await resolverConsultas(async () => { throw new Error('sin red'); }), { estado: 'error' });
});

// ---- Los dos botones principales (hero y barra de acciones) ----

const F = (enlace) => ({ titulo: 'x', texto: 'y', enlace, destino: null });

test('accionesPrincipales: inscripción activa → inscribir, aunque haya consultas', () => {
  assert.deepEqual(
    accionesPrincipales({ inscripcion: F('https://forms.gle/Ins1'), consultas: F('https://forms.gle/Jug1'), comprobante: F('https://forms.gle/Com1') }),
    { primera: { tipo: 'inscribir', url: 'https://forms.gle/Ins1' }, comprobante: { url: 'https://forms.gle/Com1' } },
  );
});

test('accionesPrincipales: inscripción cerrada → "Quiero jugar" al formulario de consultas', () => {
  assert.deepEqual(accionesPrincipales({ consultas: F('https://forms.gle/Jug1') }),
    { primera: { tipo: 'jugar', url: 'https://forms.gle/Jug1' }, comprobante: { url: null } });
});

test('accionesPrincipales: sin formularios, las dos sin url', () => {
  assert.deepEqual(accionesPrincipales({}), { primera: { tipo: 'jugar', url: null }, comprobante: { url: null } });
  assert.deepEqual(accionesPrincipales(), { primera: { tipo: 'jugar', url: null }, comprobante: { url: null } });
});

test('accionesPrincipales: un enlace que no es de Google Forms cuenta como cerrado', () => {
  const r = accionesPrincipales({ inscripcion: F('https://evil.com/forms/x'), consultas: F('https://forms.gle/Jug1'), comprobante: F('javascript:alert(1)') });
  assert.deepEqual(r, { primera: { tipo: 'jugar', url: 'https://forms.gle/Jug1' }, comprobante: { url: null } });
});
