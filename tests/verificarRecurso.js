import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const email = process.env.VERIFICAR_RPC_EMAIL;
const password = process.env.VERIFICAR_RPC_PASSWORD;

if (!url || !publishableKey || !email || !password) {
  console.error('Uso: SUPABASE_URL=... SUPABASE_PUBLISHABLE_KEY=... VERIFICAR_RPC_EMAIL=... VERIFICAR_RPC_PASSWORD=... node tests/verificarRecurso.js');
  process.exit(1);
}

const supabase = createClient(url, publishableKey);

async function main() {
  const { error: errorLogin } = await supabase.auth.signInWithPassword({ email, password });
  if (errorLogin) { console.error('No se pudo iniciar sesión:', errorLogin.message); process.exit(1); }

  const { data: clubes, error: errorClubes } = await supabase.from('club').select('id');
  if (errorClubes || !clubes?.length) { console.error('No se encontró ningún club:', errorClubes?.message); process.exit(1); }
  const clubId = clubes[0].id;

  const titulo = 'VERIFICAR RECURSO ' + Date.now();

  // El recurso se inserta bien; el envío viola la FK compuesta
  // (club_id, jugador_id). Toda la transacción debe abortar y el recurso
  // no puede quedar sin sus envíos.
  const payloadRoto = {
    clubId,
    titulo,
    descripcion: 'Payload de verificación de rollback.',
    enlace: null,
    fecha: '1999-01-01',
    jugadorIds: ['00000000-0000-0000-0000-000000000000'],
  };

  const { error: errorRpc } = await supabase.rpc('guardar_recurso', { payload: payloadRoto });
  if (!errorRpc) { console.error('FALLO: el RPC no tiró error con un jugador inexistente — el rollback no se está probando.'); process.exit(1); }
  console.log('OK: el RPC rechazó el payload roto:', errorRpc.message);

  const { data: recursos, error: errorRecursos } = await supabase
    .from('recurso').select('id').eq('club_id', clubId).eq('titulo', titulo);
  if (errorRecursos) { console.error('No se pudo verificar si quedó el recurso:', errorRecursos.message); process.exit(1); }
  if (recursos.length) { console.error('FALLO: quedó el recurso sin envíos — el rollback no funcionó.'); process.exit(1); }
  console.log('OK: no quedó ningún recurso — el rollback fue completo.');

  console.log('\nVerificación de rollback del recurso: PASS');
}

main();
