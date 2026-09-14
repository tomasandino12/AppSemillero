import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  temporadaMasReciente, plantelesEnOrdenDeCatalogo, etiquetaDeMiembro, armarPanorama, armarProfes,
  textoSinDatos, hayAlgoParaMostrar,
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
const sinDatos = { planteles: [], tiro: [], partidos: [] };
const partido = (plantelId, partidoId, fecha, tres, libres) => ({
  plantelId, partidoId, fecha, rival: 'RIVAL',
  tresAnotados: tres?.[0] ?? null, tresIntentados: tres?.[1] ?? null,
  libresAnotados: libres?.[0] ?? null, libresIntentados: libres?.[1] ?? null,
});
const fuenteVacia = { serie: [], variacion: null };

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
  for (const tipo of ['triples', 'libres']) {
    assert.deepEqual(Object.keys(tarjetas[0][tipo]).sort(), ['bateria', 'partido']);
    assert.deepEqual(Object.keys(tarjetas[0][tipo].bateria).sort(), ['serie', 'variacion']);
    assert.deepEqual(Object.keys(tarjetas[0][tipo].partido).sort(), ['serie', 'variacion']);
  }
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

  assert.deepEqual(u17.triples.bateria.serie.map((p) => [p.valor.anotados, p.valor.intentos]), [[300, 700], [310, 700]]);
  assert.equal(u17.triples.bateria.variacion.pp, 1);
  assert.equal(u17.triples.bateria.variacion.concluyente, false);

  // Libres no suma a triples ni triples a libres.
  assert.deepEqual(u17.libres.bateria.serie.map((p) => [p.valor.anotados, p.valor.intentos]), [[70, 140], [105, 140]]);
  assert.equal(u17.libres.bateria.variacion.pp, 25);
  assert.equal(u17.libres.bateria.variacion.concluyente, true);

  assert.equal(u17.jugadores, 14);
  assert.equal(u17.partidos, 3);
  assert.equal(u17.ultimaMedicion, '2026-04-01');

  const u13 = tarjetas.find((t) => t.plantelId === 'p13');
  assert.deepEqual(u13.triples, { bateria: fuenteVacia, partido: fuenteVacia });
  assert.deepEqual(u13.libres, { bateria: fuenteVacia, partido: fuenteVacia });
  assert.equal(u13.jugadores, 0);
});

test('los partidos son su propia serie, al lado de la batería y sin mezclarse', () => {
  const panorama = {
    planteles: [{ plantelId: 'p17', jugadores: 14, partidos: 2 }],
    tiro: [fila('p17', 's1', '2026-03-01', 'frontal', 300, 700)],
    partidos: [
      partido('p17', 'm1', '2026-03-05', [6, 25], [7, 12]),
      partido('p17', 'm2', '2026-03-12', [8, 30], [10, 14]),
      partido('p21', 'm3', '2026-03-12', [20, 30], [10, 10]),
      partido('p17viejo', 'm4', '2025-03-12', [1, 30], [1, 10]),
    ],
  };
  const { tarjetas } = armarPanorama({ planteles, catalogo, temporadas, panorama, miembros, asignaciones: [] });
  const u17 = tarjetas.find((t) => t.plantelId === 'p17');
  // La batería sigue siendo sólo la batería.
  assert.deepEqual(u17.triples.bateria.serie.map((p) => p.valor.intentos), [700]);
  assert.equal(u17.triples.bateria.variacion, null);
  // Los partidos, sólo los de esta categoría y esta temporada.
  assert.deepEqual(u17.triples.partido.serie.map((p) => p.partidoId), ['m1', 'm2']);
  assert.deepEqual(u17.libres.partido.serie.map((p) => p.valor.anotados), [7, 10]);
  // 6/25 contra 8/30: 3 pp de diferencia, muy lejos del margen de ~25 pp.
  assert.equal(u17.triples.partido.variacion.concluyente, false);
});

test('una categoría sin partidos no inventa un cero', () => {
  const { tarjetas } = armarPanorama({ planteles, catalogo, temporadas, panorama: sinDatos, miembros, asignaciones: [] });
  assert.deepEqual(tarjetas[0].triples.partido, fuenteVacia);
  // Y un panorama anterior a 0022, sin la clave partidos, tampoco rompe.
  const viejo = armarPanorama({ planteles, catalogo, temporadas, panorama: { planteles: [], tiro: [] }, miembros, asignaciones: [] });
  assert.deepEqual(viejo.tarjetas[0].libres.partido, fuenteVacia);
});

test('el texto de una fuente vacía distingue sin partidos de partidos sin intentos', () => {
  assert.equal(textoSinDatos({ fuente: 'bateria', tipo: 'triples', partidosImportados: 3 }), 'Sin baterías');
  assert.equal(textoSinDatos({ fuente: 'partido', tipo: 'triples', partidosImportados: 0 }), 'Sin partidos importados');
  assert.equal(textoSinDatos({ fuente: 'partido', tipo: 'triples', partidosImportados: 2 }), 'Ningún partido con triples intentados');
  assert.equal(textoSinDatos({ fuente: 'partido', tipo: 'libres', partidosImportados: 2 }), 'Ningún partido con libres intentados');
});

test('hay algo para mostrar si cualquiera de las cuatro series tiene un punto', () => {
  const conPunto = { serie: [{ fecha: '2026-03-01' }], variacion: null };
  const vacia = { triples: { bateria: fuenteVacia, partido: fuenteVacia }, libres: { bateria: fuenteVacia, partido: fuenteVacia } };
  assert.equal(hayAlgoParaMostrar(vacia), false);
  assert.equal(hayAlgoParaMostrar({ ...vacia, libres: { bateria: fuenteVacia, partido: conPunto } }), true);
  assert.equal(hayAlgoParaMostrar(null), false);
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
