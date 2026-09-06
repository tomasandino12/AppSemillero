import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const email = process.env.VERIFICAR_RPC_EMAIL;
const password = process.env.VERIFICAR_RPC_PASSWORD;

if (!url || !publishableKey || !email || !password) {
  console.error('Uso: SUPABASE_URL=... SUPABASE_PUBLISHABLE_KEY=... VERIFICAR_RPC_EMAIL=... VERIFICAR_RPC_PASSWORD=... node tests/verificarMetas.js');
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

  // Las 2 primeras metas son válidas; la 3ra tiene un porcentaje fuera del
  // check (0-100) y hace fallar el insert. Si la transacción funciona, las 2
  // primeras tampoco quedan.
  const payloadRoto = {
    clubId,
    plantelId,
    metas: [
      { zona: 'esq_izq', objetivoPct: 25 },
      { zona: 'c45_izq', objetivoPct: 28 },
      { zona: 'frontal', objetivoPct: 999 },
    ],
  };

  const { error: errorRpc } = await supabase.rpc('guardar_metas_plantel', { payload: payloadRoto });
  if (!errorRpc) { console.error('FALLO: el RPC no tiró error con un porcentaje fuera de rango — el rollback no se está probando.'); process.exit(1); }
  console.log('OK: el RPC rechazó el payload roto:', errorRpc.message);

  const { data: metas, error: errorMetas } = await supabase
    .from('meta_zona').select('zona').eq('club_id', clubId).eq('plantel_id', plantelId);
  if (errorMetas) { console.error('No se pudo verificar si quedaron metas:', errorMetas.message); process.exit(1); }

  const huerfanas = metas.filter((m) => m.zona === 'esq_izq' || m.zona === 'c45_izq');
  if (huerfanas.length) { console.error('FALLO: quedaron metas de las zonas válidas — el rollback no funcionó.'); process.exit(1); }
  console.log('OK: no quedó ninguna meta de las zonas válidas — el rollback fue completo.');

  console.log('\nVerificación de rollback de las metas: PASS');
}

main();
