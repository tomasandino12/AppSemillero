---
name: nueva-migracion
description: Crea una migración de Supabase siguiendo las reglas de seguridad de App formativa (RLS, grants por columna, sellado de autoría).
disable-model-invocation: true
---

Crear la migración pedida en `$ARGUMENTS`. No leas los planes viejos de `docs/`.

1. **Número**: `ls supabase/migrations | tail -1` y sumar 1. Archivo `NNNN_descripcion_corta.sql`. Una migración aplicada nunca se edita.
2. **Patrón**: si no lo tenés fresco, leé `supabase/migrations/0026_material.sql` (es el más completo). Helpers de permisos ya existentes: `es_coordinador_de(club_id)`, `es_entrenador_de(club_id)`, `puede_ver_plantel(plantel_id)`, `puede_escribir_plantel(plantel_id)` (definidos en 0016/0017/0018; leer sólo el que haga falta, con `Grep`).
3. **Checklist de tabla nueva**:
   - Comentario de cabecera con el link al spec en `docs/superpowers/specs/`.
   - `club_id uuid not null references club(id)`; si hay datos de un chico, referencia a `jugador` y a su plantel.
   - `creado_por` / `actualizado_por` con `default auth.uid()` + trigger de sellado con `set search_path = ''`.
   - `enable row level security` y una policy por operación, con el rol correcto (entrenador por plantel, coordinador por club). El coordinador **no** ve datos individuales de chicos: sólo agregados.
   - `revoke all ... from anon, authenticated` y luego `grant` mínimo **por columna** (el cliente no manda autoría, fechas, `club_id` en update).
   - Si es memoria institucional: sin `delete` (se cierra, no se borra).
   - `comment on table` con el número de migración.
4. **Documentar**: agregar la sección en `supabase/ESQUEMA.md`.
5. **Cliente**: la función de acceso va en el repo de su área, `src/data/repos/<área>.js` (la fachada `repositorio.js` sólo re-exporta); la lógica pura, en un módulo de `src/data/` con su test. Si una regla vive en SQL y en JS (lista de tipos, rangos), agregar un test de contrato como `tests/contratoMaterial.test.js`. Correr `npm run test:q`.
6. **No correr `supabase db push`** sin que Tomás lo confirme: aplica a la base real.
