import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const email = process.env.VERIFICAR_RPC_EMAIL;
const password = process.env.VERIFICAR_RPC_PASSWORD;

if (!url || !publishableKey || !email || !password) {
  console.error('Uso: SUPABASE_URL=... SUPABASE_PUBLISHABLE_KEY=... VERIFICAR_RPC_EMAIL=... VERIFICAR_RPC_PASSWORD=... node tests/verificarSesionMedicion.js');
  process.exit(1);
}

const supabase = createClient(url, publishableKey);

async function main() {
  const { error: errorLogin } = await supabase.auth.signInWithPassword({ email, password });
  if (errorLogin) { console.error('No se pudo iniciar sesión:', errorLogin.message); process.exit(1); }

  const { data: clubes, error: errorClubes } = await supabase.from('club').select('id');
  if (errorClubes || !clubes?.length) { console.error('No se encontró ningún club:', errorClubes?.message); process.exit(1); }
  const clubId = clubes[0].id;

  const { data: planteles, error: errorPlanteles } = await supabase.from('plantel').select('id').eq('club_id', clubId).limit(1);
  if (errorPlanteles || !planteles?.length) { console.error('No se encontró ningún plantel:', errorPlanteles?.message); process.exit(1); }
  const plantelId = planteles[0].id;

  const { data: jugadores, error: errorJugadores } = await supabase.from('jugador').select('id').eq('club_id', clubId).limit(1);
  if (errorJugadores || !jugadores?.length) { console.error('No se encontró ningún jugador — cargá al menos uno antes de correr esto:', errorJugadores?.message); process.exit(1); }
  const jugadorId = jugadores[0].id;

  // Fecha marcadora: sirve para buscar la sesión después y confirmar que no quedó.
  const fecha = '1999-01-01';

  // Las 2 primeras filas son válidas; la 3ra tiene un jugador inexistente y
  // viola la FK compuesta (club_id, jugador_id). Si la transacción funciona,
  // las 2 primeras tampoco quedan, y la sesión tampoco.
  const payloadRoto = {
    clubId,
    plantelId,
    fecha,
    tipo: 'tiro',
    mediciones: [
      { jugadorId, posicion: 'esq_izq', anotados: 7, intentos: 10 },
      { jugadorId, posicion: 'frontal', anotados: null, intentos: 10 },
      { jugadorId: '00000000-0000-0000-0000-000000000000', posicion: 'libres', anotados: 5, intentos: 10 },
    ],
  };

  const { error: errorRpc } = await supabase.rpc('guardar_sesion_medicion', { payload: payloadRoto });
  if (!errorRpc) { console.error('FALLO: el RPC no tiró error con un jugador inexistente — el rollback no se está probando.'); process.exit(1); }
  console.log('OK: el RPC rechazó el payload roto:', errorRpc.message);

  const { data: sesiones, error: errorSesiones } = await supabase
    .from('sesion_medicion').select('id').eq('club_id', clubId).eq('fecha', fecha);
  if (errorSesiones) { console.error('No se pudo verificar si quedó la sesión:', errorSesiones.message); process.exit(1); }
  if (sesiones.length) { console.error('FALLO: quedó la sesión huérfana — el rollback no funcionó.'); process.exit(1); }
  console.log('OK: no quedó ninguna sesión — el rollback fue completo.');

  console.log('\nVerificación de rollback de la sesión de medición: PASS');
}

main();
