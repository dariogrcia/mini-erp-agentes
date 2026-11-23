# Tarea 1 · Ronda 1 · Veredicto: APROBADA

Revisión de `supabase/migrations/0001_init.sql` (rama `tarea-1-migracion-sql` frente a `main`, implementada por Codex).
Cambios en la rama: `supabase/migrations/0001_init.sql` (nuevo) y `PLAN.md` (solo el estado pasa a "en curso", lo cambió el Orquestador). ALC-1 cumplido.

## Puerta de calidad
| Paso | Resultado |
|---|---|
| lint | ✅ sin errores ni warnings |
| typecheck | ✅ sin errores |
| test | ✅ 0 tests (aún no hay `src/**/*.test.ts`; la tarea no añade lógica de dominio) |
| build | ✅ compila |

## Fallos
No hay fallos bloqueantes ni mayores. Fallos menores:

| # | Directriz | Severidad | Archivo:línea | Problema | Corrección esperada |
|---|---|---|---|---|---|
| F1 | DOM-2 / D4 | menor | supabase/migrations/0001_init.sql:197 | `unit_price` con más de 2 decimales se redondea sin avisar al convertirlo a `numeric(12,2)`. Probado: `"0.005"` se guarda como `0.01`. | Rechazar líneas con escala mayor de 2 (por ejemplo, `raise exception 'INVALID_LINE'`) en vez de redondear. Zod lo filtrará en la tarea 6, pero la BD es la última barrera (D3). |
| F2 | SEG-5 | menor | supabase/migrations/0001_init.sql:184-211 | Si la entrada es inválida (cantidad ≤ 0, IVA 5, precio negativo, sin descripción, cantidad 1.5, `product_id` vacío, `due_date < issue_date`), la RPC devuelve errores crudos de Postgres (23514, 23502, 22P02) con `Failing row contains (…)`, que incluyen el `owner_id` y otros UUID. No es una fuga entre usuarios, porque son datos propios. | Validar cada línea al principio de la función y lanzar un código semántico (`INVALID_LINE`), o como mínimo asegurar que `toUserMessage` (tarea 3) nunca muestre `message`/`details` crudos. |
| F3 | DOM-6 | menor | supabase/migrations/0001_init.sql:172 | Si `p_issue_date` llega como null explícito, la función falla con not-null (23502) en vez de aplicar el `default current_date`. | `coalesce(p_issue_date, current_date)` o un error semántico. |

## Pruebas en vivo (Supabase remoto, API REST con la anon key y dos usuarios A y B)
Todas con el resultado esperado salvo lo anotado en F1 a F3:

- **Aislamiento (SEG-3):**
  - B lista `customers`, `products`, `invoices` e `invoice_lines` y recibe `[]`. Lee `invoice_counters` y recibe 403.
  - B hace PATCH o DELETE sobre el cliente, el producto o la factura de A: 0 filas afectadas, y A confirma que nada cambió.
  - B llama a `issue_invoice`, `mark_invoice_paid`, `cancel_invoice` y `save_draft_invoice` sobre la factura de A: `NOT_FOUND`.
  - B crea un borrador con el cliente de A (`NOT_FOUND`) o con su propio cliente y el producto de A (`NOT_FOUND`).
  - A no ve la factura de B y no puede anularla (`NOT_FOUND`).
  - Un insert con un `owner_id` ajeno da 403 por RLS.
- **Escritura directa (D3):**
  - A no puede insertar ni actualizar en `invoices` (403).
  - A no puede insertar, actualizar ni borrar en `invoice_lines` (403).
  - A no puede insertar en `invoice_counters` (403).
- **Anon sin token:** recibe 401 en las 5 tablas, en el insert y en la RPC `issue_invoice`.
- **DOM-2 (redondeo):**
  - 1 × 0,50 € al 21 % da IVA 0,105, que queda en **0,11**, y un total de 0,61.
  - 1 × 0,05 € al 10 % da 0,005, que queda en **0,01**.
  - 3 × 0,50 € al 21 % da 0,315, que queda en **0,32**.
  - 2 × 0,25 € al 4 % da 0,02.
  - Los totales de la cabecera son la suma de las líneas (1,05 + 0,14 = 1,19).
- **DOM-3:**
  - Emitir con stock insuficiente (3 > 2) da `INSUFFICIENT_STOCK` con `detail = sku`, y el stock queda intacto.
  - Con dos líneas del mismo producto (1 + 2 con stock 2) también da `INSUFFICIENT_STOCK` y el stock no cambia, es decir, se revierte de forma atómica.
  - `p_lines` vacío o null da `INVOICE_EMPTY`.
- **DOM-4:**
  - Desde borrador, pagar o anular da `INVALID_TRANSITION`.
  - Desde emitida, volver a emitir o guardar el borrador da `INVOICE_NOT_DRAFT`, y DELETE afecta a 0 filas.
  - Al anular, el stock se repone (de 1 vuelve a 2).
  - Desde pagada, anular o pagar da `INVALID_TRANSITION`, y DELETE afecta a 0 filas.
  - Desde anulada, pagar o anular da `INVALID_TRANSITION`, y emitir da `INVOICE_NOT_DRAFT`.
  - Al borrar un borrador, sus líneas se eliminan en cascada.
- **DOM-5:** las facturas de A son `2026-0001` y `2026-0002`. B empieza su propia serie en `2026-0001`.
- **DOM-6 (checks):** la BD rechaza una cantidad 0 o negativa, un IVA del 5 %, un precio negativo, un stock negativo y `due_date < issue_date`. Borrar un cliente con facturas falla por la FK restrict.
- **Revisión estática:**
  - Las 4 funciones son `security definer` con `set search_path = ''` y comprueban `auth.uid()` y la propiedad.
  - El EXECUTE se revoca a `public` y `anon` y se concede solo a `authenticated`.
  - Se hace `revoke all` (incluido TRUNCATE) antes de los grants mínimos.
  - Los productos se bloquean en orden por `product_id`, lo que evita interbloqueos.
  - El contador se actualiza con un upsert atómico.
  - Tablas, checks, índices y políticas coinciden con el contrato de `PLAN.md`.

## Datos de prueba que quedan en Supabase
RLS y las reglas de negocio no dejan borrar:
- **Usuario A:**
  - 1 cliente ("QA Cliente A"), que no se puede borrar porque lo referencian facturas.
  - La factura `2026-0001` (anulada) y la `2026-0002` (pagada), con sus 4 líneas (`product_id` a null).
  - Su contador de 2026 está en 2.
- **Usuario B:**
  - 1 cliente ("QA Cliente B").
  - La factura `2026-0001` (emitida).
  - Su contador de 2026 está en 1.

Se borraron el producto de prueba y todos los borradores. Para dejarlo limpio hace falta acceso de administrador (SQL editor): borrar esas facturas, los clientes y las filas de `invoice_counters` de los dos usuarios QA.

## Notas (no bloqueantes)
- La integridad `invoices.customer_id` y `invoice_lines.product_id` del mismo propietario solo la garantizan las funciones (no hay FK compuesta con `owner_id`). Es aceptable porque la escritura directa está revocada. Si en el futuro se abre algún grant, habrá que revisarlo.
- La equivalencia de cálculo entre TS y SQL (DOM-2) se comprobará en la tarea 2. Conviene reutilizar estos mismos casos (0,105 → 0,11 y 0,005 → 0,01) en `invoice.test.ts`.
- El año de la numeración sale de `issue_date` (según D6). Un borrador con fecha de un año anterior que se emita más tarde consumirá número de ese año. Es lo especificado, pero conviene tenerlo presente en la UI.
