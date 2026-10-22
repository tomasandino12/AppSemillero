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
  textoMision: 150,
  comentarioMision: 300,
  numeroCamiseta: 20,
  titulo: 150,
  tema: 100,
  descripcion: 2000,
  enlace: 2048,
  material: 200,
  listaCorta: 200,
  nota: 2000,
  bloque: 100,
  // RFC 5321: un mail no pasa de 254 caracteres.
  mail: 254,
  corto: 100,
  nombreLinea: 200,
  notasLinea: 1000,
  detalleMaterial: 120,
  notaPaso: 300,
  nombreRubro: 60,
  descripcionMovimiento: 300,
  telefono: 30,
  contactoUrgencia: 80,
  textoSalud: 300,
  obraSocial: 60,
  // Línea de ayuda de un formulario del portal: para qué es y qué tener a mano.
  // Va entera en la tarjeta que ve cualquiera, así que no es texto libre largo.
  textoFormulario: 500,
  // Noticias del portal (0064): el título y el resumen van en la tarjeta, el
  // cuerpo es la nota entera. altFoto es la descripción de cada foto (qué se
  // ve, sin nombres de chicos): vive dentro del jsonb `fotos`, así que la
  // compara tests/contratoNoticia.test.js y no contratoLimites.
  tituloNoticia: 120,
  resumenNoticia: 200,
  cuerpoNoticia: 8000,
  altFoto: 150,
};

/** 'tabla.columna' → largo máximo. Es el espejo exacto de 0028 y de los checks en línea de las tablas nuevas (0035, 0052, 0054, 0055, 0057, 0058, 0059, 0064). */
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
  'jugada.nombre': LIMITE.titulo,
  'variacion_ejercicio.eje': LIMITE.corto,
  'variacion_ejercicio.titulo': LIMITE.titulo,
  'variacion_ejercicio.descripcion': LIMITE.descripcion,
  'rubro.nombre': LIMITE.nombreRubro,
  'movimiento.descripcion': LIMITE.descripcionMovimiento,
  'movimiento.comprobante_url': LIMITE.enlace,
  'previa_partido.rival': LIMITE.rival,
  'mision_jugador.texto': LIMITE.textoMision,
  'mision_jugador.comentario': LIMITE.comentarioMision,
  'mision_equipo.texto': LIMITE.textoMision,
  'mision_equipo.comentario': LIMITE.comentarioMision,
  'responsable_jugador.email': LIMITE.mail,
  'emergencia_jugador.telefono_adulto': LIMITE.telefono,
  'emergencia_jugador.contacto_urgencia': LIMITE.contactoUrgencia,
  'emergencia_jugador.alergias': LIMITE.textoSalud,
  'emergencia_jugador.medicacion': LIMITE.textoSalud,
  'emergencia_jugador.indicacion': LIMITE.textoSalud,
  'emergencia_jugador.obra_social': LIMITE.obraSocial,
  'formulario_portal.titulo': LIMITE.titulo,
  'formulario_portal.texto': LIMITE.textoFormulario,
  'formulario_portal.enlace': LIMITE.enlace,
  'noticia.titulo': LIMITE.tituloNoticia,
  'noticia.resumen': LIMITE.resumenNoticia,
  'noticia.cuerpo': LIMITE.cuerpoNoticia,
};
