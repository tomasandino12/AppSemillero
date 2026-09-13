import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  temporadaMasReciente, plantelesEnOrdenDeCatalogo, etiquetaDeMiembro, armarPanorama, armarProfes,
} from '../src/data/coordinacion.js';

const catalogo = [
  { codigo: 'U13M', nombre: 'Sub-13 Masculino', orden: 10 },
  { codigo: 'U17M', nombre: 'Sub-17 Masculino', orden: 30 },
  { codigo: 'U21M', nombre: 'Sub-21 Masculino', orden: 40 },
];
const temporadas = [{ id: 't25', nombre: '2025' }, { id: 't26', nombre: '2026' }];
const planteles = [
  { id: 'p21', categoria: 'U21M', categoriaCodigo: 'U21M', temporadaId: 't26' },
  { id: 'p13', categoria: 'U13M', categoriaCodigo: 'U13M', temporadaId: 't26' },
  { id: 'p17', categoria: 'U17M', categoriaCodigo: 'U17M', temporadaId: 't26' },
  { id: 'p17viejo', categoria: 'U17M', categoriaCodigo: 'U17M', temporadaId: 't25' },
];
const miembros = [
  { userId: 'ana', email: 'ana@x.com', nombre: 'Ana', esEntrenador: true, esCoordinador: false },
  { userId: 'beto', email: 'beto@x.com', nombre: null, esEntrenador: true, esCoordinador: false },
  { userId: 'coord', email: 'coord@x.com', nombre: 'Coordi', esEntrenador: false, esCoordinador: true },
];
const fila = (plantelId, sesionId, fecha, posicion, anotados, intentos) => (
  { plantelId, sesionId, fecha, posicion, anotados, intentos, jugadoresQueMidieron: 3 }
);
const sinDatos = { planteles: [], tiro: [] };

test('la temporada más reciente sale del nombre', () => {
  assert.equal(temporadaMasReciente(temporadas).id, 't26');
  assert.equal(temporadaMasReciente([]), null);
});

test('los planteles van en el orden del catálogo y sólo de la temporada pedida', () => {
  assert.deepEqual(plantelesEnOrdenDeCatalogo(planteles, catalogo, 't26').map((p) => p.id), ['p13', 'p17', 'p21']);
});

test('la etiqueta de un miembro es el nombre, o el mail si no cargó nombre', () => {
  assert.equal(etiquetaDeMiembro(miembros[0]), 'Ana');
  assert.equal(etiquetaDeMiembro(miembros[1]), 'beto@x.com');
});

test('el panorama ordena por catálogo aunque los números digan otra cosa', () => {
  // U21M tira muchísimo mejor que U13M: igual va última. Ordenar por valor
  // sería un ranking de categorías, y con eso, de entrenadores.
  const panorama = {
    planteles: [],
    tiro: [fila('p21', 's1', '2026-03-01', 'frontal', 90, 100), fila('p13', 's2', '2026-03-01', 'frontal', 10, 100)],
  };
  const { tarjetas } = armarPanorama({ planteles, catalogo, temporadas, panorama, miembros, asignaciones: [] });
  assert.deepEqual(tarjetas.map((t) => t.plantelId), ['p13', 'p17', 'p21']);
});

test('una tarjeta no trae ningún campo de comparación entre categorías', () => {
  const { tarjetas } = armarPanorama({ planteles, catalogo, temporadas, panorama: sinDatos, miembros, asignaciones: [] });
  assert.deepEqual(Object.keys(tarjetas[0]).sort(), [
    'aCargo', 'categoria', 'jugadores', 'libres', 'nombreCategoria', 'partidos', 'plantelId', 'triples', 'ultimaMedicion',
  ]);
  assert.deepEqual(Object.keys(tarjetas[0].triples).sort(), ['serie', 'variacion']);
  assert.deepEqual(Object.keys(tarjetas[0].libres).sort(), ['serie', 'variacion']);
});

test('triples y libres son dos series separadas, cada una contra su batería anterior', () => {
  const panorama = {
    planteles: [{ plantelId: 'p17', jugadores: 14, partidos: 3, ultimaMedicion: '2026-04-01', ultimoPartido: '2026-03-20' }],
    tiro: [
      fila('p17', 's1', '2026-03-01', 'frontal', 300, 700),
      fila('p17', 's1', '2026-03-01', 'libres', 70, 140),
      fila('p17', 's2', '2026-04-01', 'frontal', 310, 700),
      fila('p17', 's2', '2026-04-01', 'libres', 105, 140),
      fila('p21', 's3', '2026-04-01', 'frontal', 600, 700),
    ],
  };
  const { tarjetas } = armarPanorama({ planteles, catalogo, temporadas, panorama, miembros, asignaciones: [] });
  const u17 = tarjetas.find((t) => t.plantelId === 'p17');

  assert.deepEqual(u17.triples.serie.map((p) => [p.valor.anotados, p.valor.intentos]), [[300, 700], [310, 700]]);
  assert.equal(u17.triples.variacion.pp, 1);
  assert.equal(u17.triples.variacion.concluyente, false);

  // Libres no suma a triples ni triples a libres.
  assert.deepEqual(u17.libres.serie.map((p) => [p.valor.anotados, p.valor.intentos]), [[70, 140], [105, 140]]);
  assert.equal(u17.libres.variacion.pp, 25);
  assert.equal(u17.libres.variacion.concluyente, true);

  assert.equal(u17.jugadores, 14);
  assert.equal(u17.partidos, 3);
  assert.equal(u17.ultimaMedicion, '2026-04-01');

  const u13 = tarjetas.find((t) => t.plantelId === 'p13');
  assert.deepEqual(u13.triples, { serie: [], variacion: null });
  assert.deepEqual(u13.libres, { serie: [], variacion: null });
  assert.equal(u13.jugadores, 0);
});

test('a cargo: sólo entrenadores con asignación vigente', () => {
  const asignaciones = [
    { id: 'a1', userId: 'ana', plantelId: 'p17', hasta: null, origen: 'panel' },
    { id: 'a2', userId: 'beto', plantelId: 'p17', hasta: '2026-05-01T00:00:00Z', origen: 'panel' },
    { id: 'a3', userId: 'coord', plantelId: 'p21', hasta: null, origen: 'manual' },
  ];
  const { tarjetas } = armarPanorama({ planteles, catalogo, temporadas, panorama: sinDatos, miembros, asignaciones });
  assert.deepEqual(tarjetas.find((t) => t.plantelId === 'p17').aCargo, ['Ana']);
  assert.deepEqual(tarjetas.find((t) => t.plantelId === 'p21').aCargo, []);
});

test('profes: categorías sin profe, uno mismo, y asignaciones de otra temporada', () => {
  const asignaciones = [
    { id: 'a1', userId: 'ana', plantelId: 'p17', hasta: null, origen: 'migracion' },
    { id: 'a2', userId: 'ana', plantelId: 'p17viejo', hasta: null, origen: 'manual' },
    { id: 'a3', userId: 'beto', plantelId: 'p13', hasta: null, origen: 'panel' },
  ];
  const vista = armarProfes({
    planteles, catalogo, temporadas, miembros, asignaciones,
    pendientes: [{ userId: 'nuevo', email: 'nuevo@x.com', registradoEn: '2026-09-10T12:00:00Z' }],
    usuarioActualId: 'coord',
  });
  assert.deepEqual(vista.sinProfe.map((p) => p.id), ['p21']);
  assert.deepEqual(vista.plantelesDeLaTemporada.map((p) => p.id), ['p13', 'p17', 'p21']);
  assert.equal(vista.pendientes.length, 1);
  const ana = vista.profes.find((p) => p.userId === 'ana');
  assert.deepEqual(ana.categorias.map((c) => c.etiqueta), ['U17M', 'U17M 2025']);
  assert.equal(ana.categorias[0].origen, 'migracion');
  assert.equal(vista.profes.find((p) => p.userId === 'coord').esUnoMismo, true);
  assert.equal(ana.esUnoMismo, false);
});
