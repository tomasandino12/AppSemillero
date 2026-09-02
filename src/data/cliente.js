import { createClient } from '@supabase/supabase-js';

function leerVariableEntorno(nombre) {
  if (typeof process !== 'undefined' && process.env && process.env[nombre]) {
    return process.env[nombre];
  }
  if (typeof window !== 'undefined' && window[nombre]) {
    return window[nombre];
  }
  return undefined;
}

export function crearClienteSupabase() {
  const url = leerVariableEntorno('SUPABASE_URL');
  const anonKey = leerVariableEntorno('SUPABASE_ANON_KEY');
  if (!url || !anonKey) {
    throw new Error('Faltan las variables de entorno SUPABASE_URL / SUPABASE_ANON_KEY');
  }
  return createClient(url, anonKey);
}
