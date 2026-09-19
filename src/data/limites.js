/*
 * Largo máximo de cada texto que escribe un usuario. Lógica pura, sin red.
 *
 * Los mismos números que los `check (char_length(...) <= N)` de
 * supabase/migrations/0028_limites_de_largo.sql: la base es la que hace
 * cumplir el límite, y la interfaz lo usa para no dejar escribir de más
 * (`maxlength`). tests/contratoLimites.test.js compara las dos listas: si se
 * cambia un número de un lado sólo, el test falla.
 *
 * Los límites son holgados a propósito: cortan el abuso (un texto de
 * megabytes que se le manda a todo el club en cada lectura), no recortan lo
 * que la gente escribe de verdad.
 */

export const LIMITE = {
  nombrePersona: 150,
  desambiguador: 60,
  archivo: 255,
  rival: 120,
  numeroCamiseta: 20,
  titulo: 150,
  tema: 100,
  descripcion: 2000,
  enlace: 2048,
  material: 200,
  listaCorta: 200,
  nota: 2000,
  bloque: 100,
  corto: 100,
  nombreLinea: 200,
  notasLinea: 1000,
  detalleMaterial: 120,
};

/** 'tabla.columna' → largo máximo. Es el espejo exacto de 0028. */
export const LIMITES_POR_COLUMNA = {
  'jugador.nombre_clave': LIMITE.nombrePersona,
  'jugador.nombre_limpio': LIMITE.nombrePersona,
  'jugador.desambiguador': LIMITE.desambiguador,
  'importacion.nombre_archivo': LIMITE.archivo,
  'partido.rival_nombre': LIMITE.rival,
  'estadistica_jugador_partido.nombre_crudo': LIMITE.nombrePersona,
  'estadistica_jugador_partido.numero': LIMITE.numeroCamiseta,
  'recurso.titulo': LIMITE.titulo,
  'recurso.descripcion': LIMITE.descripcion,
  'recurso.enlace': LIMITE.enlace,
  'ejercicio.titulo': LIMITE.titulo,
  'ejercicio.tema': LIMITE.tema,
  'ejercicio.descripcion': LIMITE.descripcion,
  'ejercicio.enlace': LIMITE.enlace,
  'ejercicio.material': LIMITE.material,
  'ejercicio.jugadores': LIMITE.listaCorta,
  'ejercicio.categorias': LIMITE.listaCorta,
  'nota_ejercicio.texto': LIMITE.nota,
  'ejercicio_fuerza.nombre': LIMITE.titulo,
  'ejercicio_fuerza.bloque': LIMITE.bloque,
  'ejercicio_fuerza.link': LIMITE.enlace,
  'plan_fisico.nombre_archivo': LIMITE.archivo,
  'ejercicio_asignado.bloque': LIMITE.bloque,
  'ejercicio_asignado.nombre_original': LIMITE.nombreLinea,
  'ejercicio_asignado.reps': LIMITE.corto,
  'ejercicio_asignado.carga_sugerida': LIMITE.corto,
  'ejercicio_asignado.pausa': LIMITE.corto,
  'ejercicio_asignado.notas': LIMITE.notasLinea,
  'paso_fuerza.nombre': LIMITE.titulo,
  'material.detalle': LIMITE.detalleMaterial,
};
