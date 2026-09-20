import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * 0032 (jugador que pasa a profe, rechazo reversible de un pedido de acceso).
 * La migración y el cliente tienen que hablar de las mismas funciones y de las
 * mismas columnas; esto lee los dos lados y falla si se separan.
 */

const leer = (ruta) => readFileSync(ruta, 'utf8').replace(/\r\n/g, '\n');
const sql = leer('supabase/migrations/0032_profe_y_jugador.sql');
const repo = leer('src/data/repos/coordinacion.js');
const sinComentarios = (t) => t.replace(/--.*$/gm, '');
const codigo = sinComentarios(sql);

test('cada rpc que llama el cliente existe en la migración', () => {
  for (const nombre of ['descartar_cuenta', 'mi_pedido_descartado', 'volver_a_pedir_acceso', 'usuarios_pendientes']) {
    assert.match(codigo, new RegExp(`create function ${nombre}\\(`), `falta la función ${nombre}`);
    assert.match(repo, new RegExp(`rpc\\('${nombre}'`), `el repo no llama a ${nombre}`);
  }
});

test('usuarios_pendientes devuelve es_jugador y el repo lo lee', () => {
  assert.match(codigo, /returns table \([^)]*es_jugador boolean\)/);
  assert.match(repo, /esJugador: f\.es_jugador/);
});

test('cuenta_descartada no se toca desde el cliente: RLS, sin policies y sin grants', () => {
  assert.match(codigo, /alter table cuenta_descartada enable row level security/);
  assert.match(codigo, /revoke all on cuenta_descartada from anon, authenticated/);
  assert.doesNotMatch(codigo, /create policy/);
  assert.doesNotMatch(codigo, /grant (select|insert|update|delete|all)[^;]* on cuenta_descartada/);
});

test('las funciones nuevas sólo se otorgan a authenticated y las de trigger a nadie', () => {
  const otorgadas = [...codigo.matchAll(/grant execute on function (\w+)\([^)]*\)\s+to (\w+)/g)];
  assert.deepEqual(
    otorgadas.map((m) => m[1]).sort(),
    ['descartar_cuenta', 'mi_pedido_descartado', 'usuarios_pendientes', 'volver_a_pedir_acceso'],
  );
  assert.ok(otorgadas.every((m) => m[2] === 'authenticated'));
  for (const trig of ['cerrar_cuenta_jugador_al_habilitar', 'impedir_cuenta_jugador_de_staff', 'sellar_cuenta_descartada']) {
    assert.match(codigo, new RegExp(`revoke execute on function ${trig}\\(\\)\\s+from public, anon, authenticated`));
  }
});

test('las funciones security definer fijan search_path', () => {
  const definer = [...codigo.matchAll(/security definer\s+set search_path = ''/g)].length;
  assert.equal([...codigo.matchAll(/security definer/g)].length, definer);
});

test('habilitar a alguien cierra su cuenta de jugador y la inversa no se puede', () => {
  assert.match(codigo, /after insert on miembro_club/);
  assert.match(codigo, /before insert on cuenta_jugador/);
  assert.match(codigo, /raise exception 'ES_DEL_CUERPO_TECNICO'/);
});
