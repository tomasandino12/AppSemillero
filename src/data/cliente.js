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
  const publishableKey = leerVariableEntorno('SUPABASE_PUBLISHABLE_KEY');
  if (!url || !publishableKey) {
    throw new Error('Faltan las variables de entorno SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY');
  }
  return createClient(url, publishableKey);
}
