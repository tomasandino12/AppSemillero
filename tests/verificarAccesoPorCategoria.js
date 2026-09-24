import { createClient } from '@supabase/supabase-js';

/**
 * Verificación con una sesión REAL, no impersonada: el mismo cliente que usa
 * la app, contra la base de verdad.
 *
 * SÓLO LECTURAS, a propósito. Una escritura que debería fallar, si por un error
 * de policy no falla, queda escrita en producción. Las escrituras prohibidas se
 * prueban en tests/verificarCoordinacion.sql, que se deshace entero.
 *
 * Uso:
 *   SUPABASE_URL=... SUPABASE_PUBLISHABLE_KEY=... \
 *   VERIFICAR_EMAIL=<entrenador> VERIFICAR_PASSWORD=... \
 *   [VERIFICAR_COORD_EMAIL=<coordinador> VERIFICAR_COORD_PASSWORD=...] \
 *   node tests/verificarAccesoPorCategoria.js
 */

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_PUBLISHABLE_KEY;
const entrenador = { email: process.env.VERIFICAR_EMAIL, password: process.env.VERIFICAR_PASSWORD };
const coordinador = { email: process.env.VERIFICAR_COORD_EMAIL, password: process.env.VERIFICAR_COORD_PASSWORD };

if (!url || !key || !entrenador.email || !entrenador.password) {
  console.error('Faltan SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, VERIFICAR_EMAIL o VERIFICAR_PASSWORD.');
  process.exit(1);
}

let fallas = 0;
const ok = (m) => console.log('OK   ', m);
const falla = (m) => { fallas += 1; console.error('FALLA', m); };

async function sesion({ email, password }) {
  const cliente = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await cliente.auth.signInWithPassword({ email, password });
  if (error) { console.error(`No se pudo iniciar sesión con ${email}:`, error.message); process.exit(1); }
  return { cliente, userId: data.user.id };
}

async function ids(consulta, columna) {
  const { data, error } = await consulta;
  if (error) throw error;
  return new Set(data.map((f) => f[columna]));
}

const subconjunto = (a, b) => [...a].every((x) => b.has(x));

async function rechaza(nombre, promesa) {
  const { error } = await promesa;
  if (error) ok(`${nombre} rechazado (${error.code ?? error.message})`);
  else falla(`${nombre} NO fue rechazado`);
}

async function verificarEntrenador() {
  console.log(`\n== Entrenador: ${entrenador.email}`);
  const { cliente, userId } = await sesion(entrenador);

  const { data: club, error: errorClub } = await cliente.from('club').select('id').limit(1).single();
  if (errorClub) { falla(`no se pudo leer el club: ${errorClub.message}`); return; }

  const asignados = await ids(
    cliente.from('asignacion_plantel').select('plantel_id')
      .eq('miembro_club_user_id', userId).is('hasta', null),
    'plantel_id');
  console.log(`   ${asignados.size} categoría(s) asignada(s) vigente(s)`);

  const tablas = [
    ['plantel', 'id'],
    ['pertenencia', 'plantel_id'],
    ['partido', 'plantel_id'],
    ['sesion_medicion', 'plantel_id'],
  ];
  for (const [tabla, columna] of tablas) {
    const vistos = await ids(cliente.from(tabla).select(columna), columna);
    if (subconjunto(vistos, asignados)) ok(`${tabla}: todo lo que ve (${vistos.size}) es de sus categorías`);
    else falla(`${tabla}: ve planteles que no tiene asignados`);
  }

  const jugadores = await ids(cliente.from('jugador').select('id'), 'id');
  const deSusCategorias = await ids(
    cliente.from('pertenencia').select('jugador_id').is('hasta', null), 'jugador_id');
  if (subconjunto(jugadores, deSusCategorias)) ok(`jugador: los ${jugadores.size} que ve están en sus categorías`);
  else falla('jugador: ve chicos fuera de sus categorías');

  const ejercicios = await ids(cliente.from('ejercicio').select('id'), 'id');
  ok(`ejercicio: ve ${ejercicios.size} de la biblioteca del club (sin restricción por categoría)`);

  await rechaza('usuarios_pendientes', cliente.rpc('usuarios_pendientes'));
  await rechaza('miembros_del_club', cliente.rpc('miembros_del_club', { p_club_id: club.id }));
  await rechaza('panorama_del_club', cliente.rpc('panorama_del_club', { p_club_id: club.id }));
}

async function verificarCoordinador() {
  if (!coordinador.email || !coordinador.password) {
    console.log('\n(sin credenciales de coordinador: se saltea)');
    return;
  }
  console.log(`\n== Coordinador: ${coordinador.email}`);
  const { cliente } = await sesion(coordinador);
  const { data: club, error: errorClub } = await cliente.from('club').select('id').limit(1).single();
  if (errorClub) { falla(`no se pudo leer el club: ${errorClub.message}`); return; }

  for (const tabla of ['jugador', 'pertenencia', 'partido', 'estadistica_jugador_partido',
    'sesion_medicion', 'medicion_tiro', 'medicion_salto', 'medicion_corporal']) {
    const { data, error } = await cliente.from(tabla).select('id').limit(1);
    if (error) falla(`${tabla}: error inesperado ${error.message}`);
    else if (data.length) falla(`${tabla}: el coordinador lee filas (¿0018 sin aplicar?)`);
    else ok(`${tabla}: 0 filas`);
  }

  await rechaza('jugadores_del_club_para_dedup', cliente.rpc('jugadores_del_club_para_dedup', { p_club_id: club.id }));

  const { data: panorama, error } = await cliente.rpc('panorama_del_club', { p_club_id: club.id });
  if (error) falla(`panorama_del_club: ${error.message}`);
  else ok(`panorama_del_club: ${panorama.planteles.length} plantel(es), ${panorama.tiro.length} fila(s) de tiro`);
}

await verificarEntrenador();
await verificarCoordinador();
console.log(fallas ? `\n${fallas} FALLA(S)` : '\nTodo OK');
process.exit(fallas ? 1 : 0);
