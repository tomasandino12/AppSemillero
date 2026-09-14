import { createClient } from '@supabase/supabase-js';

/**
 * Verificación de importar_plan_fisico (0021) contra el Docker LOCAL, con el
 * mismo cliente que usa la app y un usuario real de esa base. Nunca contra
 * producción.
 *
 * Tres casos:
 *   1. Payload roto: un ejercicioFuerzaId inexistente rompe la FK. La RPC
 *      tiene que fallar y NO dejar la fila de plan_fisico — si queda, el
 *      rollback de la transacción no está funcionando.
 *   2. Import válido: devuelve {planId, sesiones, ejercicios, pendientes} y
 *      las filas están en la base.
 *   3. Reimportación del mismo archivo en la misma categoría: PLAN_DUPLICADO,
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

function payload(clubId, plantelId, { ejercicioRoto = false } = {}) {
  return {
    clubId,
    plantelId,
    nombreArchivo: 'Físico.xlsx',
    hashArchivo: hash,
    advertencias: [{ tipo: 'ZZTEST', detalle: 'verificación' }],
    ejerciciosNuevos: [
      { clave: `ZZTEST SENTADILLA ${hash}`, nombre: 'ZZtest Sentadilla', bloque: 'FUERZA', link: null },
    ],
    sesiones: [
      {
        fecha: '2026-09-01',
        ejercicios: [
          {
            orden: 1, bloque: 'FUERZA', nombreOriginal: 'Sentadilla', series: 4,
            reps: '5xL', cargaSugerida: 'PC', pausa: "45''", notas: null,
            // Un id inexistente rompe la FK compuesta y tiene que abortar todo.
            ejercicioFuerzaId: ejercicioRoto ? '00000000-0000-0000-0000-000000000000' : null,
            claveNueva: ejercicioRoto ? null : `ZZTEST SENTADILLA ${hash}`,
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

  const { data: planteles, error: errorPlantel } = await supabase.from('plantel').select('id').limit(1);
  if (errorPlantel || !planteles?.length) { console.error('Sin plantel visible:', errorPlantel?.message); process.exit(1); }
  const plantelId = planteles[0].id;

  // 1. Payload roto
  const { error: errorRoto } = await supabase.rpc('importar_plan_fisico', { payload: payload(clubId, plantelId, { ejercicioRoto: true }) });
  if (!errorRoto) falla('el payload roto no falló: la FK no está atajando nada');
  else ok(`el payload roto falló (${errorRoto.code ?? errorRoto.message})`);

  const { data: huerfano } = await supabase.from('plan_fisico').select('id').eq('hash_archivo', hash);
  if (huerfano?.length) falla(`quedaron ${huerfano.length} plan(es) del intento roto: el rollback no funcionó`);
  else ok('no quedó ninguna fila del intento roto');

  // 2. Import válido
  const { data: resultado, error: errorOk } = await supabase.rpc('importar_plan_fisico', { payload: payload(clubId, plantelId) });
  if (errorOk) { falla(`el import válido falló: ${errorOk.message}`); }
  else {
    const esperado = { sesiones: 2, ejercicios: 2, pendientes: 1 };
    const igual = resultado.sesiones === esperado.sesiones
      && resultado.ejercicios === esperado.ejercicios
      && resultado.pendientes === esperado.pendientes;
    if (igual) ok(`import válido: ${JSON.stringify(resultado)}`);
    else falla(`el import devolvió ${JSON.stringify(resultado)}, esperaba ${JSON.stringify(esperado)}`);

    const { data: sesiones } = await supabase.from('sesion_fisico').select('id').eq('plan_id', resultado.planId);
    if (sesiones?.length === 2) ok('las 2 sesiones están en la base');
    else falla(`hay ${sesiones?.length ?? 0} sesiones guardadas, esperaba 2`);

    const { data: asignados } = await supabase
      .from('ejercicio_asignado')
      .select('nombre_original, reps, carga_sugerida, pausa, escalon_kg, ejercicio_fuerza_id')
      .in('sesion_id', (sesiones ?? []).map((s) => s.id));
    const conEscalon = (asignados ?? []).filter((a) => a.escalon_kg != null);
    if (conEscalon.length) falla('escalon_kg se escribió, y la RPC no debe escribirla nunca');
    else ok('escalon_kg quedó en null aunque el payload la traía');

    const pendiente = (asignados ?? []).find((a) => a.nombre_original === 'Plancha');
    if (pendiente && pendiente.ejercicio_fuerza_id === null) ok('el ejercicio sin resolver quedó pendiente, con su nombre original');
    else falla('el ejercicio sin resolver no quedó como pendiente');

    const texto = (asignados ?? []).find((a) => a.nombre_original === 'Sentadilla');
    if (texto?.reps === '5xL' && texto?.carga_sugerida === 'PC' && texto?.pausa === "45''") ok('reps, carga y pausa se guardaron como texto, sin convertir');
    else falla(`reps/carga/pausa llegaron mal: ${JSON.stringify(texto)}`);
  }

  // 3. Reimportación
  const { error: errorDup } = await supabase.rpc('importar_plan_fisico', { payload: payload(clubId, plantelId) });
  if (errorDup && /PLAN_DUPLICADO/.test(errorDup.message)) ok('reimportar el mismo archivo en la misma categoría da PLAN_DUPLICADO');
  else falla(`la reimportación devolvió ${errorDup ? errorDup.message : 'éxito'}, esperaba PLAN_DUPLICADO`);

  const { data: planes } = await supabase.from('plan_fisico').select('id').eq('hash_archivo', hash);
  if (planes?.length === 1) ok('sigue habiendo un solo plan con ese hash');
  else falla(`hay ${planes?.length ?? 0} planes con ese hash, esperaba 1`);

  console.log(fallas ? `\n${fallas} FALLA(S)` : '\nTodo OK');
  process.exit(fallas ? 1 : 0);
}

main();
