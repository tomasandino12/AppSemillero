/*
 * Fachada del acceso a Supabase. Las pantallas importan de acá; el código vive en
 * src/data/repos/, un archivo por área. Una función nueva va en el archivo de su
 * área (o en uno nuevo) y se re-exporta acá con una línea.
 */
export * from './repos/auth.js';
export * from './repos/clubes.js';
export * from './repos/coordinacion.js';
export * from './repos/jugadores.js';
export * from './repos/partidos.js';
export * from './repos/mediciones.js';
export * from './repos/recursos.js';
export * from './repos/ejercicios.js';
export * from './repos/fisico.js';
export * from './repos/inventario.js';
