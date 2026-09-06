/**
 * Siembra sesiones de entrenamiento (batería de tiro y velocidad) en la base
 * real, para poder ver la app con varios meses de datos sin cargar cada tiro
 * a mano.
 *
 * NO toca partidos ni estadísticas de partido: eso viene del import de la
 * CABB y no se inventa.
 *
 * ATENCIÓN: esto ESCRIBE en la base de datos real. Por defecto corre en seco
 * y sólo imprime lo que haría. Para escribir de verdad hay que pasar
 * --escribir explícitamente.
 *
 * Uso:
 *   SUPABASE_URL=... SUPABASE_PUBLISHABLE_KEY=... VERIFICAR_RPC_EMAIL=... \
 *   VERIFICAR_RPC_PASSWORD=... node tests/sembrarEntrenamientos.js [--escribir]
 *
 * Es re-ejecutable: si ya existe una sesión de ese plantel en esa fecha, la
 * saltea en vez de duplicarla.
 *
 * ---
 * Sobre los números que genera, para que nadie los lea como reales:
 *
 * - Triples: cada tiro es un intento independiente con ~30% de chance, así
 *   que lo más probable es 3 de 10 y la probabilidad baja hacia los costados.
 *   No se fuerza el 3: sale de la moneda.
 * - Libres: lo mismo con ~45%, así que caen sobre todo en 4 y 5 de 10.
 * - Velocidad: alrededor de 5,0 s con dispersión chica, un decimal.
 * - Cada jugador tiene una habilidad propia estable, derivada de su id, así
 *   que el mismo chico es parecido de una sesión a la otra en vez de saltar
 *   al azar.
 * - Hay una MEJORA LEVE inducida a lo largo de los meses (~1 punto por mes en
 *   la probabilidad). Es deliberada, para que las curvas tengan algo que
 *   mostrar. Si mirás la app y ves que el equipo mejora, eso lo puse yo acá,
 *   no lo descubrió la app.
 * - Cada sesión tiene uno o dos ausentes, que se guardan como NULL igual que
 *   los carga la app.
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const email = process.env.VERIFICAR_RPC_EMAIL;
const password = process.env.VERIFICAR_RPC_PASSWORD;
const ESCRIBIR = process.argv.includes('--escribir');

if (!url || !publishableKey || !email || !password) {
  console.error('Uso: SUPABASE_URL=... SUPABASE_PUBLISHABLE_KEY=... VERIFICAR_RPC_EMAIL=... VERIFICAR_RPC_PASSWORD=... node tests/sembrarEntrenamientos.js [--escribir]');
  process.exit(1);
}

const supabase = createClient(url, publishableKey);

const ZONAS_ARCO = ['esq_izq', 'c45_izq', 'frontal', 'c45_der', 'esq_der'];
const INTENTOS = 10;

/** Fechas de las baterías y de las sesiones de velocidad, de la más vieja a la más nueva. */
const FECHAS_BATERIA = ['2026-04-07', '2026-05-05', '2026-06-02', '2026-07-07', '2026-08-04', '2026-09-01'];
const FECHAS_VELOCIDAD = ['2026-04-07', '2026-06-02', '2026-08-04'];

/**
 * Generador determinístico: la misma semilla da siempre la misma secuencia.
 *
 * Hash FNV-1a + mulberry32. Importa que el hash disperse bien: con un hash
 * débil, semillas parecidas ("j1|2026-04-07" y "j1|2026-05-05") arrancan en
 * puntos cercanos del generador y los jugadores de una misma sesión se
 * desvían todos para el mismo lado. Eso infla la variación entre sesiones
 * muy por encima de lo binomial y hace que la serie parezca ruido puro.
 */
function rng(semilla) {
  let h = 2166136261;
  for (const c of String(semilla)) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  let x = h >>> 0;
  return () => {
    x = (x + 0x6D2B79F5) >>> 0;
    let t = Math.imul(x ^ (x >>> 15), 1 | x);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Habilidad propia de cada jugador, estable entre sesiones. Aprox -0.06 a +0.06. */
function habilidad(jugadorId) {
  const r = rng('hab' + jugadorId);
  return (r() - 0.5) * 0.12;
}

/** Cuántos de `n` tiros entran si cada uno tiene probabilidad `p`. */
function tirosAcertados(r, n, p) {
  let entraron = 0;
  for (let i = 0; i < n; i++) if (r() < p) entraron += 1;
  return entraron;
}

/** Normal aproximada por suma de uniformes, que alcanza y sobra para esto. */
function normal(r, media, desvio) {
  const s = r() + r() + r() - 1.5;
  return media + s * desvio * 1.4;
}

function payloadBateria({ clubId, plantelId, fecha, jugadores, mes }) {
  const mediciones = [];
  const rSesion = rng(plantelId + fecha);
  // Uno o dos ausentes por sesión, como en cualquier práctica real.
  const ausentes = new Set();
  const cuantos = 1 + Math.floor(rSesion() * 2);
  while (ausentes.size < Math.min(cuantos, jugadores.length)) {
    ausentes.add(jugadores[Math.floor(rSesion() * jugadores.length)].id);
  }

  for (const j of jugadores) {
    if (ausentes.has(j.id)) {
      for (const zona of [...ZONAS_ARCO, 'libres']) {
        mediciones.push({ jugadorId: j.id, posicion: zona, anotados: null, intentos: INTENTOS });
      }
      continue;
    }
    const r = rng(j.id + fecha);
    const deriva = mes * 0.01;          // mejora leve inducida, ver la nota de arriba
    const hab = habilidad(j.id);
    for (const zona of ZONAS_ARCO) {
      const p = Math.min(0.5, Math.max(0.12, 0.30 + hab + deriva));
      mediciones.push({ jugadorId: j.id, posicion: zona, anotados: tirosAcertados(r, INTENTOS, p), intentos: INTENTOS });
    }
    const pLibres = Math.min(0.72, Math.max(0.25, 0.45 + hab * 1.2 + deriva));
    mediciones.push({ jugadorId: j.id, posicion: 'libres', anotados: tirosAcertados(r, INTENTOS, pLibres), intentos: INTENTOS });
  }
  return { clubId, plantelId, fecha, tipo: 'tiro', mediciones };
}

function payloadVelocidad({ clubId, plantelId, fecha, jugadores, mes }) {
  const rSesion = rng('vel' + plantelId + fecha);
  const ausente = jugadores[Math.floor(rSesion() * jugadores.length)]?.id;
  const mediciones = [];
  for (const j of jugadores) {
    if (j.id === ausente) continue;     // sin fila: no se lo midió ese día
    const r = rng('v' + j.id + fecha);
    const base = 5.0 + habilidad(j.id) * -3;   // el que tira mejor tiende a correr un poco más rápido
    const segundos = Math.min(6.2, Math.max(4.2, normal(r, base - mes * 0.02, 0.22)));
    mediciones.push({ jugadorId: j.id, segundos: Math.round(segundos * 10) / 10 });
  }
  return { clubId, plantelId, fecha, tipo: 'velocidad', mediciones };
}

function resumen(payload) {
  if (payload.tipo === 'velocidad') {
    const v = payload.mediciones.map((m) => m.segundos);
    return `${v.length} tiempos, de ${Math.min(...v).toFixed(1)} a ${Math.max(...v).toFixed(1)} s`;
  }
  const reales = payload.mediciones.filter((m) => m.anotados != null);
  const ausentes = new Set(payload.mediciones.filter((m) => m.anotados == null).map((m) => m.jugadorId));
  const arco = reales.filter((m) => m.posicion !== 'libres');
  const libres = reales.filter((m) => m.posicion === 'libres');
  const pct = (f) => Math.round((f.reduce((s, m) => s + m.anotados, 0) / (f.length * INTENTOS)) * 100);
  return `${payload.mediciones.length} filas · arco ${pct(arco)}% · libres ${pct(libres)}% · ${ausentes.size} ausente(s)`;
}

async function main() {
  const { error: errorLogin } = await supabase.auth.signInWithPassword({ email, password });
  if (errorLogin) { console.error('No se pudo iniciar sesión:', errorLogin.message); process.exit(1); }

  const { data: planteles, error: errorPlanteles } = await supabase
    .from('plantel').select('id, categoria, club_id').order('categoria');
  if (errorPlanteles || !planteles?.length) { console.error('No se pudieron leer los planteles:', errorPlanteles?.message); process.exit(1); }

  const { data: existentes, error: errorExistentes } = await supabase
    .from('sesion_medicion').select('plantel_id, fecha, tipo');
  if (errorExistentes) { console.error('No se pudieron leer las sesiones existentes:', errorExistentes.message); process.exit(1); }
  const yaHay = new Set(existentes.map((s) => `${s.plantel_id}|${s.fecha}|${s.tipo}`));

  console.log(ESCRIBIR ? '>>> ESCRIBIENDO EN LA BASE REAL <<<\n' : '>>> Prueba en seco: no se escribe nada. Agregá --escribir para hacerlo. <<<\n');

  for (const plantel of planteles) {
    const { data: jugadores, error: errorJugadores } = await supabase
      .from('jugador')
      .select('id, nombre_limpio, pertenencia!inner(plantel_id, hasta)')
      .eq('club_id', plantel.club_id)
      .eq('pertenencia.plantel_id', plantel.id)
      .is('pertenencia.hasta', null);
    if (errorJugadores) { console.error('No se pudo leer el plantel:', errorJugadores.message); process.exit(1); }

    console.log(`--- ${plantel.categoria}: ${jugadores.length} jugadores ---`);
    if (!jugadores.length) { console.log('   (sin jugadores, se saltea)\n'); continue; }

    const tareas = [
      ...FECHAS_BATERIA.map((fecha, mes) => ({ tipo: 'tiro', fecha, mes, arma: payloadBateria })),
      ...FECHAS_VELOCIDAD.map((fecha) => ({
        tipo: 'velocidad', fecha, mes: FECHAS_BATERIA.indexOf(fecha), arma: payloadVelocidad,
      })),
    ].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.tipo.localeCompare(b.tipo));

    for (const t of tareas) {
      if (yaHay.has(`${plantel.id}|${t.fecha}|${t.tipo}`)) {
        console.log(`   ${t.fecha}  ${t.tipo.padEnd(9)} ya existe, se saltea`);
        continue;
      }
      const payload = t.arma({ clubId: plantel.club_id, plantelId: plantel.id, fecha: t.fecha, jugadores, mes: t.mes });
      console.log(`   ${t.fecha}  ${t.tipo.padEnd(9)} ${resumen(payload)}`);
      if (!ESCRIBIR) continue;
      const { error } = await supabase.rpc('guardar_sesion_medicion', { payload });
      if (error) { console.error('      ERROR al guardar:', error.message); process.exit(1); }
    }
    console.log('');
  }

  console.log(ESCRIBIR ? 'Listo.' : 'Nada escrito. Volvé a correrlo con --escribir si los números te cierran.');
}

main();
