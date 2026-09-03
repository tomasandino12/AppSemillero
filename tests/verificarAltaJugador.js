import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const email = process.env.VERIFICAR_RPC_EMAIL;
const password = process.env.VERIFICAR_RPC_PASSWORD;

if (!url || !publishableKey || !email || !password) {
  console.error('Uso: SUPABASE_URL=... SUPABASE_PUBLISHABLE_KEY=... VERIFICAR_RPC_EMAIL=... VERIFICAR_RPC_PASSWORD=... node tests/verificarAltaJugador.js');
  process.exit(1);
}

const supabase = createClient(url, publishableKey);

async function main() {
  const { error: errorLogin } = await supabase.auth.signInWithPassword({ email, password });
  if (errorLogin) { console.error('No se pudo iniciar sesión:', errorLogin.message); process.exit(1); }

  const { data: clubes, error: errorClubes } = await supabase.from('club').select('id');
  if (errorClubes || !clubes?.length) { console.error('No se encontró ningún club:', errorClubes?.message); process.exit(1); }
  const clubId = clubes[0].id;

  const { data: planteles, error: errorPlanteles } = await supabase.from('plantel').select('id, temporada_id').eq('club_id', clubId).limit(1);
  if (errorPlanteles || !planteles?.length) { console.error('No se encontró ningún plantel:', errorPlanteles?.message); process.exit(1); }
  const plantelId = planteles[0].id;

  const nombreClave = 'VERIFICAR ALTA ' + Date.now();

  // temporadaId inexistente a propósito: el insert de jugador va a andar y el
  // de pertenencia va a violar la FK compuesta (club_id, temporada_id).
  // Toda la transacción debe abortar y no dejar el jugador huérfano.
  const payloadRoto = {
    clubId,
    nombreClave,
    nombreLimpio: nombreClave,
    plantelId,
    temporadaId: '00000000-0000-0000-0000-000000000000',
    desde: '2026-01-01',
  };

  const { error: errorRpc } = await supabase.rpc('alta_jugador_manual', { payload: payloadRoto });
  if (!errorRpc) { console.error('FALLO: el RPC no tiró error con una temporada inexistente — el rollback no se está probando.'); process.exit(1); }
  console.log('OK: el RPC rechazó el payload roto:', errorRpc.message);

  const { data: huerfano, error: errorHuerfano } = await supabase
    .from('jugador').select('id').eq('club_id', clubId).eq('nombre_clave', nombreClave).maybeSingle();
  if (errorHuerfano) { console.error('No se pudo verificar si quedó un jugador huérfano:', errorHuerfano.message); process.exit(1); }
  if (huerfano) { console.error('FALLO: quedó un jugador sin pertenencia — el rollback no funcionó.'); process.exit(1); }
  console.log('OK: no quedó ningún jugador — el rollback fue completo.');

  console.log('\nVerificación de rollback del alta manual: PASS');
}

main();
