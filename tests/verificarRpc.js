import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const email = process.env.VERIFICAR_RPC_EMAIL;
const password = process.env.VERIFICAR_RPC_PASSWORD;

if (!url || !publishableKey || !email || !password) {
  console.error('Uso: SUPABASE_URL=... SUPABASE_PUBLISHABLE_KEY=... VERIFICAR_RPC_EMAIL=... VERIFICAR_RPC_PASSWORD=... node tests/verificarRpc.js');
  process.exit(1);
}

const supabase = createClient(url, publishableKey);

async function main() {
  const { error: errorLogin } = await supabase.auth.signInWithPassword({ email, password });
  if (errorLogin) { console.error('No se pudo iniciar sesión:', errorLogin.message); process.exit(1); }

  const { data: clubes, error: errorClubes } = await supabase.from('club').select('id');
  if (errorClubes || !clubes?.length) { console.error('No se encontró ningún club para este usuario:', errorClubes?.message); process.exit(1); }
  const clubId = clubes[0].id;

  const { data: planteles, error: errorPlanteles } = await supabase.from('plantel').select('id, temporada_id').eq('club_id', clubId).limit(1);
  if (errorPlanteles || !planteles?.length) { console.error('No se encontró ningún plantel:', errorPlanteles?.message); process.exit(1); }
  const { id: plantelId, temporada_id: temporadaId } = planteles[0];

  const hashUnico = 'verificar-rpc-' + Date.now();
  const payloadRoto = {
    clubId,
    hashArchivo: hashUnico,
    idPartidoCabb: null,
    nombreArchivo: 'verificarRpc.xlsx',
    advertencias: [],
    partido: { clubId, plantelId, fecha: '2026-01-01', condicionPropia: 'local', rivalNombre: 'RIVAL DE PRUEBA', puntosPropios: 10, puntosRival: 5 },
    jugadoresNuevos: [],
    pertenenciasNuevas: [],
    // jugadorId inexistente a propósito: esto debe romper la FK de
    // estadistica_jugador_partido y abortar TODA la transacción.
    estadisticas: [{
      jugadorId: '00000000-0000-0000-0000-000000000000',
      nombreClave: 'INEXISTENTE', numero: '99', nombreCrudo: 'INEXISTENTE',
      minSegundos: 0, pts: 0, dosAnotados: 0, dosIntentados: 0, dosPorcentaje: 0,
      tresAnotados: 0, tresIntentados: 0, tresPorcentaje: 0,
      libresAnotados: 0, libresIntentados: 0, libresPorcentaje: 0,
      rebDef: 0, rebOf: 0, rebTot: 0, ast: 0, rec: 0, per: 0,
      tapCometidos: 0, tapRecibidos: 0, falCometidas: 0, falRecibidas: 0, val: 0, masMenos: 0,
    }],
  };

  const { error: errorRpc } = await supabase.rpc('importar_partido', { payload: payloadRoto });
  if (!errorRpc) { console.error('FALLO: el RPC no tiró error con un jugadorId inexistente — el rollback no se está probando.'); process.exit(1); }
  console.log('OK: el RPC rechazó el payload roto:', errorRpc.message);

  const { data: importacionHuerfana, error: errorHuerfana } = await supabase.from('importacion').select('id').eq('hash_archivo', hashUnico).maybeSingle();
  if (errorHuerfana) { console.error('No se pudo verificar si quedó una fila de importacion:', errorHuerfana.message); process.exit(1); }
  if (importacionHuerfana) { console.error('FALLO: quedó una fila de importacion sin partido — el rollback no funcionó.'); process.exit(1); }
  console.log('OK: no quedó ninguna fila de importacion — el rollback fue completo.');

  console.log('\nVerificación de rollback: PASS');
}

main();
