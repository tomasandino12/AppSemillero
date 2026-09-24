import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * La base es la que impide que el coordinador lea datos individuales (0018).
 * Este test es la segunda línea: que la UI de coordinación ni siquiera los
 * pida. Si alguien suma "ver el plantel" al panorama, que se entere acá y no
 * cuando la pantalla aparezca vacía en producción.
 */
const ARCHIVOS = [
  'src/ui/pantallas/coordPanorama.js',
  'src/ui/pantallas/coordProfes.js',
  'src/data/coordinacion.js',
];

const LECTURAS_INDIVIDUALES = [
  'obtenerJugadoresDelClub', 'obtenerJugadoresDelPlantel', 'obtenerPartidosDelPlantel',
  'obtenerPertenenciasDeJugador', 'obtenerSesionesDeMedicion', 'obtenerMedicionesTiroDelPlantel',
  'obtenerMedicionesSaltoDelPlantel', 'obtenerMedicionesSprintDelPlantel', 'obtenerMedicionesYoyoDelPlantel',
  'obtenerEstadisticasDelPlantel', 'obtenerEnviosDeJugador',
  'obtenerMedicionesCorporalesDeJugador', 'obtenerMedicionesCorporalesDelClub', 'obtenerMetasDelPlantel',
  'obtenerEjercicios', 'obtenerRecursos',
];

test('las pantallas de coordinación no piden datos individuales', () => {
  const ofensas = [];
  for (const archivo of ARCHIVOS) {
    const src = readFileSync(archivo, 'utf8');
    for (const nombre of LECTURAS_INDIVIDUALES) {
      if (new RegExp(`\\b${nombre}\\b`).test(src)) ofensas.push(`${archivo} usa ${nombre}`);
    }
    if (/\.from\(|\.rpc\(/.test(src)) ofensas.push(`${archivo} habla con la base directo`);
  }
  assert.deepEqual(ofensas, []);
});

test('el panorama no usa palabras de ranking ni de juicio', () => {
  // Los comentarios se sacan: ahí se explica justamente lo que NO se hace.
  const src = readFileSync('src/ui/pantallas/coordPanorama.js', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
  const palabras = src.match(/\b(mejor|peor|ranking|rinde|atenci[oó]n|promedio|destacad[ao]|del arco)\b/gi) ?? [];
  assert.deepEqual(palabras, []);
});
