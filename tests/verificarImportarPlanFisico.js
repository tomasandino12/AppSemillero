import { createClient } from '@supabase/supabase-js';

/**
 * Verificación de importar_plan_fisico (0021) contra el Docker LOCAL, con el
 * mismo cliente que usa la app y un usuario real de esa base. Nunca contra
 * producción.
 *
 * Cuatro casos:
 *   1. Payload roto: un ejercicioFuerzaId inexistente rompe la FK. La RPC
 *      tiene que fallar y NO dejar la fila de plan_fisico ni nada de la siembra
 *      de pesos — si queda algo, el rollback de la transacción no está
 *      funcionando.
 *   2. Import válido: devuelve {planId, sesiones, ejercicios, pendientes,
 *      pesosSembrados} y las filas están en la base.
 *   3. La siembra del peso inicial (0025): cada chico del plantel arranca con el
 *      número de la carga sugerida, salvo el que ya tenía un peso propio en ese
 *      ejercicio, que no se toca.
 *   4. Reimportación del mismo archivo en la misma categoría: PLAN_DUPLICADO,
 *      y sigue habiendo un solo plan con ese hash.
 *
 * Uso:
 *   SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_PUBLISHABLE_KEY=<anon local> \
 *   VERIFICAR_RPC_EMAIL=... VERIFICAR_RPC_PASSWORD=... \
 *   node tests/verificarImportarPlanFisico.js
 */

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_PUBLISHABLE_KEY;
const email = process.env.VERIFICAR_RPC_EMAIL;
const password = process.env.VERIFICAR_RPC_PASSWORD;

if (!url || !key || !email || !password) {
  console.error('Uso: SUPABASE_URL=... SUPABASE_PUBLISHABLE_KEY=... VERIFICAR_RPC_EMAIL=... VERIFICAR_RPC_PASSWORD=... node tests/verificarImportarPlanFisico.js');
  process.exit(1);
}
if (!/localhost|127\.0\.0\.1/.test(url)) {
  console.error('Este script escribe: sólo contra la base local. SUPABASE_URL apunta a otro lado.');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });
let fallas = 0;
const ok = (m) => console.log('OK   ', m);
const falla = (m) => { fallas += 1; console.error('FALLA', m); };

const hash = `verificar-plan-fisico-${Date.now()}`;
// La clave del ejercicio para el peso es la del NOMBRE DE LA LÍNEA, el mismo
// espacio de nombres que usa paso_fuerza. Va con el hash para que cada corrida
// arranque sin historia previa.
const CLAVE = `ZZTEST SENTADILLA ${hash}`;
const KG_DEL_ARCHIVO = 40;
const KG_PROPIO = 99;

function payload(clubId, plantelId, { ejercicioRoto = false } = {}) {
  return {
    clubId,
    plantelId,
    nombreArchivo: 'Físico.xlsx',
    hashArchivo: hash,
    advertencias: [{ tipo: 'ZZTEST', detalle: 'verificación' }],
    ejerciciosNuevos: [
      { clave: CLAVE, nombre: 'ZZtest Sentadilla', bloque: 'FUERZA', link: null },
    ],
    // Un ejercicio con carga numérica siembra; "Plancha", sin carga, no aparece
    // acá y no tiene que sembrar nada.
    pesosIniciales: [
      { clave: CLAVE, nombre: 'ZZtest Sentadilla', kg: KG_DEL_ARCHIVO },
    ],
    sesiones: [
      {
        fecha: '2026-09-01',
        ejercicios: [
          {
            orden: 1, bloque: 'FUERZA', nombreOriginal: 'Sentadilla', series: 4,
            reps: '5xL', cargaSugerida: 'Barra Ol + 40 kg', pausa: "45''", notas: null,
            // Un id inexistente rompe la FK compuesta y tiene que abortar todo.
            ejercicioFuerzaId: ejercicioRoto ? '00000000-0000-0000-0000-000000000000' : null,
            claveNueva: ejercicioRoto ? null : CLAVE,
            // escalon_kg viaja a propósito: la RPC no la escribe nunca.
            escalonKg: 40,
          },
          {
            orden: 2, bloque: 'CORE', nombreOriginal: 'Plancha', series: 3,
            reps: "30''", cargaSugerida: null, pausa: null, notas: 'sin resolver',
            ejercicioFuerzaId: null, claveNueva: null,
          },
        ],
      },
      { fecha: '2026-09-03', ejercicios: [] },
    ],
  };
}

async function main() {
  const { error: errorLogin } = await supabase.auth.signInWithPassword({ email, password });
  if (errorLogin) { console.error('No se pudo iniciar sesión:', errorLogin.message); process.exit(1); }

  const { data: clubes, error: errorClub } = await supabase.from('club').select('id');
  if (errorClub || !clubes?.length) { console.error('Sin club para este usuario:', errorClub?.message); process.exit(1); }
  const clubId = clubes[0].id;

  // Un plantel CON chicos: sin pertenencias vigentes no hay a quién sembrarle.
  const { data: planteles, error: errorPlantel } = await supabase.from('plantel').select('id');
  if (errorPlantel || !planteles?.length) { console.error('Sin plantel visible:', errorPlantel?.message); process.exit(1); }
  let plantelId = null;
  let jugadores = [];
  for (const p of planteles) {
    const { data: pertenencias } = await supabase
      .from('pertenencia').select('jugador_id').eq('plantel_id', p.id).is('hasta', null);
    const ids = [...new Set((pertenencias ?? []).map((x) => x.jugador_id))];
    if (ids.length >= 2) { plantelId = p.id; jugadores = ids; break; }
  }
  if (!plantelId) { console.error('Ningún plantel visible tiene 2 o más jugadores vigentes: no se puede verificar la siembra.'); process.exit(1); }
  console.log(`     plantel ${plantelId} con ${jugadores.length} jugador(es)`);

  // 1. Payload roto
  const { error: errorRoto } = await supabase.rpc('importar_plan_fisico', { payload: payload(clubId, plantelId, { ejercicioRoto: true }) });
  if (!errorRoto) falla('el payload roto no falló: la FK no está atajando nada');
  else ok(`el payload roto falló (${errorRoto.code ?? errorRoto.message})`);

  const { data: huerfano } = await supabase.from('plan_fisico').select('id').eq('hash_archivo', hash);
  if (huerfano?.length) falla(`quedaron ${huerfano.length} plan(es) del intento roto: el rollback no funcionó`);
  else ok('no quedó ninguna fila del intento roto');

  const { data: pasoHuerfano } = await supabase.from('paso_fuerza').select('id').eq('clave', CLAVE);
  if (pasoHuerfano?.length) falla('el intento roto dejó la fila de paso_fuerza: la siembra no se deshizo');
  else ok('el intento roto tampoco dejó nada de la siembra');

  // 2. Un chico que ya venía trabajando en ese ejercicio: su peso no se toca.
  const { data: pasoPrevio, error: errorPaso } = await supabase
    .from('paso_fuerza')
    .insert({ club_id: clubId, clave: CLAVE, nombre: 'ZZtest Sentadilla' })
    .select('id, paso')
    .single();
  if (errorPaso) { console.error('No se pudo crear el ejercicio previo:', errorPaso.message); process.exit(1); }
  if (pasoPrevio.paso === null) ok('se puede crear el ejercicio sin escalón definido (paso null)');
  else falla(`el ejercicio se creó con paso ${pasoPrevio.paso}, esperaba null`);
  const { error: errorMov } = await supabase.from('movimiento_escalon').insert({
    club_id: clubId, jugador_id: jugadores[0], escalera_id: pasoPrevio.id, kg: KG_PROPIO,
  });
  if (errorMov) { console.error('No se pudo sembrar el peso previo:', errorMov.message); process.exit(1); }

  // 2. Import válido
  const { data: resultado, error: errorOk } = await supabase.rpc('importar_plan_fisico', { payload: payload(clubId, plantelId) });
  if (errorOk) { falla(`el import válido falló: ${errorOk.message}`); }
  else {
    const esperado = { sesiones: 2, ejercicios: 2, pendientes: 1, pesosSembrados: jugadores.length - 1 };
    const igual = resultado.sesiones === esperado.sesiones
      && resultado.ejercicios === esperado.ejercicios
      && resultado.pendientes === esperado.pendientes
      && resultado.pesosSembrados === esperado.pesosSembrados;
    if (igual) ok(`import válido: ${JSON.stringify(resultado)}`);
    else falla(`el import devolvió ${JSON.stringify(resultado)}, esperaba ${JSON.stringify(esperado)}`);

    const { data: sesiones } = await supabase.from('sesion_fisico').select('id').eq('plan_id', resultado.planId);
    if (sesiones?.length === 2) ok('las 2 sesiones están en la base');
    else falla(`hay ${sesiones?.length ?? 0} sesiones guardadas, esperaba 2`);

    const { data: asignados } = await supabase
      .from('ejercicio_asignado')
      .select('nombre_original, reps, carga_sugerida, pausa, ejercicio_fuerza_id')
      .in('sesion_id', (sesiones ?? []).map((s) => s.id));
    // Desde 0023 escalon_kg no existe. El payload la sigue trayendo a propósito
    // (escalonKg: 40) y el import tiene que entrar igual, sin rastro del valor.
    if ((asignados ?? []).length === 2) ok('el import entra aunque el payload traiga escalonKg (la columna ya no existe)');
    else falla(`hay ${asignados?.length ?? 0} líneas guardadas, esperaba 2`);

    const pendiente = (asignados ?? []).find((a) => a.nombre_original === 'Plancha');
    if (pendiente && pendiente.ejercicio_fuerza_id === null) ok('el ejercicio sin resolver quedó pendiente, con su nombre original');
    else falla('el ejercicio sin resolver no quedó como pendiente');

    const texto = (asignados ?? []).find((a) => a.nombre_original === 'Sentadilla');
    if (texto?.reps === '5xL' && texto?.carga_sugerida === 'Barra Ol + 40 kg' && texto?.pausa === "45''") ok('reps, carga y pausa se guardaron como texto, sin convertir');
    else falla(`reps/carga/pausa llegaron mal: ${JSON.stringify(texto)}`);

    // 3. La siembra
    const { data: pesos } = await supabase
      .from('escalon_actual')
      .select('jugador_id, kg')
      .eq('escalera_id', pasoPrevio.id);
    const porJugador = new Map((pesos ?? []).map((x) => [x.jugador_id, Number(x.kg)]));

    if (porJugador.get(jugadores[0]) === KG_PROPIO) ok('el chico que ya tenía peso propio no se pisó');
    else falla(`el chico con peso propio quedó en ${porJugador.get(jugadores[0])}, esperaba ${KG_PROPIO}`);

    const sembrados = jugadores.slice(1);
    const bien = sembrados.filter((id) => porJugador.get(id) === KG_DEL_ARCHIVO);
    if (bien.length === sembrados.length) ok(`los otros ${sembrados.length} arrancaron en ${KG_DEL_ARCHIVO} kg, el número de la carga sugerida`);
    else falla(`sólo ${bien.length} de ${sembrados.length} arrancaron en ${KG_DEL_ARCHIVO} kg: ${JSON.stringify([...porJugador])}`);

    const { data: pasoDespues } = await supabase.from('paso_fuerza').select('id, paso').eq('clave', CLAVE);
    if (pasoDespues?.length === 1 && pasoDespues[0].paso === null) ok('el ejercicio sigue siendo uno solo y sin escalón: el archivo no lo define');
    else falla(`paso_fuerza quedó ${JSON.stringify(pasoDespues)}, esperaba una fila con paso null`);
  }

  // 4. Reimportación
  const { error: errorDup } = await supabase.rpc('importar_plan_fisico', { payload: payload(clubId, plantelId) });
  if (errorDup && /PLAN_DUPLICADO/.test(errorDup.message)) ok('reimportar el mismo archivo en la misma categoría da PLAN_DUPLICADO');
  else falla(`la reimportación devolvió ${errorDup ? errorDup.message : 'éxito'}, esperaba PLAN_DUPLICADO`);

  const { data: planes } = await supabase.from('plan_fisico').select('id').eq('hash_archivo', hash);
  if (planes?.length === 1) ok('sigue habiendo un solo plan con ese hash');
  else falla(`hay ${planes?.length ?? 0} planes con ese hash, esperaba 1`);

  const { data: movimientos } = await supabase
    .from('movimiento_escalon')
    .select('id', { count: 'exact' })
    .eq('escalera_id', pasoPrevio.id);
  if ((movimientos ?? []).length === jugadores.length) ok('el import fallido no volvió a sembrar: un movimiento por chico');
  else falla(`hay ${movimientos?.length ?? 0} movimientos, esperaba ${jugadores.length}`);

  console.log(fallas ? `\n${fallas} FALLA(S)` : '\nTodo OK');
  process.exit(fallas ? 1 : 0);
}

main();
