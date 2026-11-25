# Tarea 7 · Ronda 2 · Veredicto: APROBADA

Alcance: corrección tras la revisión adversarial (D13 y D14, `PLAN.md` "Tarea 7 — Corrección tras la revisión adversarial"). Rama `tarea-7-ciclo-factura`. Revisé los cambios sin commit con `git diff` y los archivos sin seguimiento (`0004_invoice_version_snapshot.sql`, `InvoiceEditor.test.ts` e `invoice-list.test.ts`). La migración 0004 ya estaba aplicada en Supabase. No la toqué. Todas las pruebas en vivo se hicieron solo con la anon key y el login de QA_A y QA_B.

## Puerta de calidad
| Paso | Resultado |
|---|---|
| lint | ✅ sin errores ni warnings |
| typecheck | ✅ `next typegen && tsc --noEmit` limpio |
| test | ✅ 382 tests (13 archivos; nuevos `InvoiceEditor.test.ts` e `invoice-list.test.ts`) |
| build | ✅ `/facturas`, `/facturas/[id]` y `/editar` como PPR (◐); `/api/facturas/export` dinámico (ƒ) |

## Fallos
| # | Directriz | Severidad | Archivo:línea | Problema | Corrección esperada |
|---|---|---|---|---|---|
| F1 | TST-3 | menor | `src/components/InvoiceEditor.test.ts:22-23` | La aserción busca la cadena literal `type="hidden" name="updated_at" value="…"`, así que depende del orden en que React serializa los atributos. Si cambia ese orden, el test falla aunque el comportamiento sea correcto. Lo que comprueba (el valor exacto) sí es lo que pide el plan. | Opcional: parsear el campo (regex sobre `name="updated_at"` y extraer `value`) en lugar de comparar el fragmento entero. |
| F2 | ALC-3 | menor | `src/lib/actions/state.ts:25`, `customers.ts:13`, `products.ts:14` | El texto de conflicto de D11 está copiado en tres sitios. Ahora coincide al carácter, pero puede divergir en el futuro. | Opcional: exportar una única constante `CONFLICT_MESSAGE` y reutilizarla. |

No hay fallos bloqueantes ni mayores.

## Fallos de la ronda anterior
- **Adversarial F1** (pérdida silenciosa entre pestañas) corregido ✅ con D13 (ver las pruebas en vivo).
- **Adversarial F2** (destinatario mutable tras emitir) corregido ✅ con D14 (ver las pruebas en vivo).
- **Ronda 1 · F1 y F2** (ALC-1, menores, del Orquestador) siguen sin aplicar en este alcance ✅.
- **Ronda 1 · F3** (orden del CSV) corregido ✅: `route.ts:46` ordena `rows` en memoria.
- **Ronda 1 · F4** (TST-3, menor y opcional) no corregido: `invoice-detail.test.ts:98` sigue comprobando `md:hidden print:hidden`. No bloquea.

## Revisión estática
- **Migración 0004 contra el contrato:**
  - `updated_at timestamptz not null default now()` con el trigger `set_updated_at` ✅.
  - Las 3 columnas de copia se rellenan para `status <> 'draft'` y después se crea `invoices_snapshot_check` ✅.
  - `drop function` de la firma de 6 argumentos ✅.
  - La nueva `save_draft_invoice` conserva las validaciones de `0002`, `security definer`, `search_path = ''` y el bloque `exception`. `STALE_DRAFT` se lanza como P0001, así que no lo convierte en `INVALID_LINE` ✅.
  - Orden de errores `NOT_FOUND` → `INVOICE_NOT_DRAFT` → `STALE_DRAFT`, comprobado bajo `for update` antes de tocar nada ✅.
  - `revoke`/`grant` repetidos con la firma nueva ✅.
  - `0001`–`0003` sin tocar ✅.
- **`if not found then raise exception 'NOT_FOUND'` en `issue_invoice` (0004:250-252), añadido por el Orquestador:** correcto ✅.
  - `found` refleja el `UPDATE … FROM customers`, no el `insert … on conflict` del contador, porque el UPDATE lo sobrescribe.
  - La excepción revierte toda la transacción de la función: descuento de stock, contador y estado. Así nunca queda un borrador con stock descontado ni un número consumido.
  - En la práctica es inalcanzable: la FK es `restrict` y `save_draft_invoice` exige que el cliente sea del mismo dueño. Aun así, es la defensa correcta.
  - En la prueba en vivo, la emisión normal funciona (`2026-0014`).
- **App (D13):**
  - `editar/page.tsx:76` pasa `invoice.updated_at` tal como lo devuelve PostgREST.
  - `InvoiceEditor.tsx:177` lo envía en el campo oculto, sin pasar por `Date`.
  - `saveDraft` lo valida con `z.iso.datetime({ offset: true })` y solo al editar. Si falta o no es válido, devuelve error sin llamar a Supabase.
  - `STALE_DRAFT` se traduce exactamente al mensaje de D11.
  - El editor no pierde lo escrito: `handleSubmit` hace `preventDefault` y llama a `formAction`, así que React no resetea el formulario. Las líneas viven en estado. La acción tampoco revalida ni redirige (test).

  Todo ✅.
- **App (D14):** en facturas no borrador, cada vista usa solo la copia ✅:
  - `InvoiceDocument` (detalle e impresión) usa solo la copia, sin email ni teléfono.
  - El listado usa `customer_name`, con "Cliente no disponible" si falta.
  - El CSV ya no hace join a `customers`.

  Los borradores siguen usando el join ✅. No queda otro lector del nombre del cliente de una factura. `dashboard/page.tsx` es el placeholder de la tarea 3 y no lee facturas.
- **SEG-2, SEG-5 y SEG-6:** se mantienen (`auth.getUser()`, Zod, UUID y `toUserMessage`) ✅.
- **ALC-1 y ALC-2:** solo se tocaron los archivos de la lista y sus tests. `PLAN.md` lo cambió el Orquestador (D13, D14 y el estado). D1–D12 intactas ✅.
- **ALC-3:** no hay `console.*`, `any` ni `@ts-ignore` ✅.

## Pruebas en vivo (API de Supabase, como la app)
Scripts en `/private/tmp/claude-501/-Users-dariogarcia/52527651-31d2-4a3b-9a11-f3fb00b50ecf/scratchpad/t7r2.mjs` (35/35 OK) y `/private/tmp/claude-501/-Users-dariogarcia/52527651-31d2-4a3b-9a11-f3fb00b50ecf/scratchpad/t7r2b.mjs` (concurrencia).

- **D13, dos pestañas:** las dos leen el mismo `updated_at`.
  - A guarda 2 líneas y "notas A": OK.
  - B guarda 1 línea con la versión vieja: `STALE_DRAFT` (P0001).
  - Las líneas siguen siendo `A1,A2` y las notas "notas A" ✅.
- **D13, versión null** en un borrador existente: `STALE_DRAFT` ✅.
- **D13, sin falsos conflictos:** PostgREST devuelve `2026-11-25T22:41:57.466866+00:00`.
  - Zod la acepta.
  - 12 guardados seguidos, reenviando cada vez la cadena tal cual, sin ningún falso conflicto.
  - El mismo instante escrito con `Z` en vez de `+00:00` tampoco da conflicto.
  - `updated_at` cambia tras cada guardado.

  ✅
- **D13, carrera real:** 5 rondas de dos guardados en paralelo con la misma versión. Siempre hay exactamente 1 OK y 1 `STALE_DRAFT`, y las líneas y notas quedan coherentes con el ganador (nunca mezcladas) ✅.
- **D13, firma antigua:** llamar con 6 argumentos da `PGRST202` (la función no existe) ✅.
- **D13, orden de errores:**
  - id inexistente con versión null: `NOT_FOUND`.
  - Factura emitida con versión correcta o null: `INVOICE_NOT_DRAFT`.

  ✅
- **D13, anon:** no puede ejecutar `save_draft_invoice` (42501) ✅.
- **D14, copia al emitir:** se emite `2026-0014` y la copia coincide con el cliente (nombre, `12345678Z` y "Calle Original 1").
  - Después se edita el cliente (nombre "…CAMBIADO", NIF `87654321X` y otra dirección): la copia de la factura no cambia y su `updated_at` tampoco. El join sí muestra el nombre nuevo.
  - Marcarla como pagada conserva la copia.

  ✅
- **D14, permisos:** como QA_A, todo da `42501 permission denied for table invoices` ✅:
  - PATCH de `customer_name`.
  - PATCH de `updated_at`.
  - INSERT directo en `invoices`.
- **D14, backfill y check:**
  - Las 14 facturas no borrador de QA_A y las 2 de QA_B tienen `customer_name`. Los borradores no tienen copia.
  - El catálogo no se puede leer con la anon key, así que la existencia de `invoices_snapshot_check` se verificó en la migración (`0004:20-21`) y por sus efectos.

  ✅
- **Aislamiento:**
  - QA_B intenta guardar el borrador de QA_A con la versión correcta: `NOT_FOUND`.
  - Con versión null también da `NOT_FOUND`, no `STALE_DRAFT`, así que no filtra que el borrador existe.
  - QA_B intenta emitirlo: `NOT_FOUND`.
  - QA_B no puede leerlo.
  - El borrador de A sigue intacto: `draft`, sin número, mismo `updated_at` y sin copia.

  ✅

**Limpieza:**
- Se borraron los 6 borradores de prueba con DELETE `status='draft'`: el de aislamiento de `t7r2` y los 5 de `t7r2b`. QA_A queda sin borradores de prueba.
- Quedan, porque RLS no permite borrar facturas no borrador y la FK es `restrict`:
  - La factura **pagada** `2026-0014` de QA_A.
  - Su cliente "QA7R2-1795646516960 CAMBIADO".

## Notas (no bloqueantes)
- La factura `2026-0014` está pagada y no anulada, porque así se comprobó que la copia sobrevive a `mark_invoice_paid`. Si se prefiere, el Orquestador puede dejarlo así: ya hay otras pagadas de rondas anteriores.
- Al mergear con la tarea 8, el dashboard real tendrá que usar `customer_name` en las facturas no borrador (D14), tal como dice el "No hacer".
