import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * 0039: coordinación da de baja a un profe (sin borrar su historia) y sumar a
 * un chico a una categoría no abre las medidas corporales cargadas antes. La
 * prueba contra una base es tests/verificarBajaProfe.sql; esto evita que una
 * migración futura afloje las piezas sin que nada falle en Node.
 */

const sql = readFileSync('supabase/migrations/0039_baja_profe_y_ventana.sql', 'utf8')
  .replace(/\r\n/g, '\n').replace(/--.*$/gm, '');

const cuerpoDe = (nombre) => {
  const m = sql.match(new RegExp(`create (?:or replace )?function ${nombre}\\([\\s\\S]*?as (\\$\\w*\\$)([\\s\\S]*?)\\1`));
  assert.ok(m, `falta la función ${nombre} en 0039`);
  return m[2];
};

test('la baja apaga el rol, cierra categorías y es sólo de coordinación', () => {
  const cuerpo = cuerpoDe('dar_de_baja_profe');
  assert.match(cuerpo, /^\s*declare[\s\S]*?begin\s+if not public\.es_coordinador_de\(p_club_id\)/);
  assert.match(cuerpo, /set es_entrenador = false, baja_en = now\(\), baja_por = auth\.uid\(\)/);
  assert.match(cuerpo, /update public\.asignacion_plantel\s+set hasta = now\(\)/);
  for (const codigo of ['NO_ES_UNO_MISMO', 'YA_DADO_DE_BAJA', 'ES_COORDINACION']) assert.match(cuerpo, new RegExp(codigo));
});

test('a un dado de baja no se lo reasigna desde la app', () => {
  assert.match(cuerpoDe('asignar_planteles'), /'DADO_DE_BAJA'/);
});

test('el padrón del club pide una categoría vigente', () => {
  assert.match(cuerpoDe('jugadores_del_club_para_dedup'), /a\.hasta is null[\s\S]*?m\.es_entrenador/);
});

test('baja_en no es escribible desde el cliente', () => {
  assert.doesNotMatch(sql, /grant [^;]*baja_(en|por)/);
});

test('ver, editar y borrar medidas corporales llevan la ventana', () => {
  for (const policy of ['corporal_ver', 'corporal_editar', 'corporal_borrar']) {
    const m = sql.match(new RegExp(`create policy ${policy} on medicion_corporal[\\s\\S]*?;`));
    assert.ok(m, `falta ${policy}`);
    assert.match(m[0], /medicion_corporal\.creado_en >= pe\.registrada_en/, policy);
  }
});

test('registrada_en y creado_en los sella el servidor', () => {
  assert.match(cuerpoDe('sellar_pertenencia'), /new\.registrada_en := old\.registrada_en/);
  assert.match(cuerpoDe('sellar_medicion_corporal'), /new\.creado_en := old\.creado_en/);
  assert.match(sql, /update pertenencia set registrada_en = '-infinity';/);
});
