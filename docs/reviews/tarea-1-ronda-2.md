# Tarea 1 · Ronda 2 · Veredicto: APROBADA

Revisión de `supabase/migrations/0002_hardening.sql` (rama `tarea-1-migracion-sql`, implementada por Codex), que corrige F1-F3 de la ronda 1 y A1-A2 de la revisión adversarial. Se revisa también contra la nueva directriz DOM-7.

Alcance (ALC-1): los cambios son `supabase/migrations/0002_hardening.sql` (nuevo), más `PLAN.md`, `docs/BITACORA.md` y `DIRECTRICES-TESTING.md`, que tocaron el Orquestador y Testing. `0001_init.sql` no ha cambiado: su fecha de modificación (14:51) es anterior al informe de la ronda 1 (14:55), y las líneas que citaba ese informe (172, 197 y 289) siguen con el mismo contenido. No hay `src/lib/`, así que DOM-7 solo se aplica a SQL en esta tarea.

## Puerta de calidad
| Paso | Resultado |
|---|---|
| lint | ✅ sin errores ni warnings |
| typecheck | ✅ sin errores |
| test | ✅ 0 tests (la tarea no añade lógica de dominio en TS) |
| build | ✅ compila |

## Fallos
No hay fallos bloqueantes, mayores ni menores nuevos.

## Fallos de la ronda anterior
- **F1 (precio con más de 2 decimales) ✅ corregido.** Se valida con `numeric` sin escala y `scale(v_unit_price) > 2` (0002:80-87). En vivo, `unit_price` 0.005 (como número y como cadena) devuelve `INVALID_LINE` y no se crea ninguna factura ni línea.
- **F2 (errores crudos de Postgres) ✅ corregido.** Todas las líneas se validan antes de escribir (0002:70-101), y un bloque `exception` convierte `data_exception` e `integrity_constraint_violation` en `INVALID_LINE` (0002:148-151). En vivo, estos casos devuelven `{"code":"P0001","details":null,"hint":null,"message":"INVALID_LINE"}`, sin `owner_id`, sin UUID y sin `Failing row contains`:
  - descripción vacía, ausente o de 201 caracteres;
  - cantidad 0, −1, 1.5, `"abc"` o 99999999999;
  - IVA 7, 5 o ausente;
  - precio −1;
  - `product_id` vacío;
  - desbordamiento de `numeric(12,2)` (2147483647 × 9999999999.99);
  - una línea que no es un objeto;
  - `due_date < issue_date`.

  Un `product_id` inexistente o ajeno sigue devolviendo `NOT_FOUND`. Una lista con una línea válida y otra inválida no persiste nada. Al editar un borrador existente con líneas inválidas, la cabecera (notas) y sus líneas quedan intactas.
- **F3 (`issue_date` null) ✅ corregido.** Se usa `coalesce(p_issue_date, current_date)` (0002:24), tanto al crear como al actualizar. En vivo, con `p_issue_date: null` se crea un borrador con fecha 2026-11-23 (hoy).
- **A1 (`lpad` trunca 10000) ✅ corregido** (revisión estática, ver abajo).
- **A2 (NaN) ✅ corregido.**
  - **RPC:** `unit_price` `"NaN"` devuelve `INVALID_LINE` (0002:85) y no persiste nada. También se rechazan `"Infinity"`, `quantity` `"NaN"` y `vat_rate` `"NaN"`. Esto cumple DOM-7.
  - **Tabla `products`, como usuario A:** un insert o un PATCH con `unit_price` `"NaN"` da 400 por el constraint `products_unit_price_not_nan` (0002:3-4), y el precio sigue en 1.00. Con `Infinity` o `-Infinity` da 400, porque `numeric(12,2)` no admite infinitos.
  - **Tabla `invoice_lines`:** tiene el mismo constraint (0002:5-6). La escritura directa está revocada, así que es una defensa en profundidad.

### A1: razonamiento estático
- `issue_invoice` (0002:217-218) ahora forma el número con `lpad(v_last_number::text, greatest(4, length(v_last_number::text)), '0')`:
  - 1 → `0001`;
  - 9999 → `9999`;
  - 10000 → `10000`;
  - 10001 → `10001`.

  Como la anchura nunca es menor que la longitud del valor, `lpad` ya no trunca, y los números siguen siendo únicos dentro del año.
- `last_number` es `integer`, así que no hay desbordamiento práctico.
- `invoices.number` es `text` sin un CHECK de formato, por lo que `2026-10000` no choca con ninguna restricción.
- Comparado con 0001, este es el único cambio en `issue_invoice`. El resto es idéntico.
- No se puede probar en vivo:
  - `invoice_counters` devuelve 403 a `authenticated` (comprobado), así que no se puede situar el contador en 9999.
  - Emitir 10000 facturas por la API no es razonable.
  - La API no deja ejecutar SQL arbitrario.

  Para probarlo de verdad hace falta una base aislada o el SQL editor con un administrador. Por ejemplo, poner `last_number = 9999` para un usuario de prueba, emitir dos facturas y comprobar que salen `AAAA-10000` y `AAAA-10001`.

## Regresión (en vivo, Supabase remoto, usuarios A y B)
- **Flujo feliz:**
  - borrador (2 × 0,50 € al 21 %: total 1,21) → emitir (`2026-0003`, el stock baja de 5 a 3) → pagar;
  - después, volver a emitir da `INVOICE_NOT_DRAFT`, anular una factura pagada da `INVALID_TRANSITION` y DELETE afecta a 0 filas.
- **Redondeo:** 1 × 0,50 € al 21 % da un IVA de 0,11 y un total de 0,61.
- **Stock:**
  - emitir con stock insuficiente da `INSUFFICIENT_STOCK` (con el SKU en `detail`) y el stock queda intacto;
  - al anular, el stock se repone de 2 a 3;
  - la emisión fallida no consume número: la siguiente es `2026-0004`, sin huecos.
- **Aislamiento:**
  - B no puede editar el borrador de A ni emitir su factura: `NOT_FOUND`;
  - B tampoco puede usar el cliente ni el producto de A: `NOT_FOUND`;
  - B lee la factura y el producto de A y recibe `[]`;
  - su PATCH sobre el producto de A afecta a 0 filas.
- **Permisos:**
  - sin token (anon), `issue_invoice` y `save_draft_invoice` devuelven 401 (`permission denied`);
  - `invoice_counters` devuelve 403;
  - los grants de 0002 se rehacen con `revoke all … from public, anon, authenticated` y `grant execute … to authenticated`.

## Datos de prueba
Se borraron el producto `QA-R2` y el borrador de prueba. Quedan dos facturas nuevas de A que RLS y las reglas de negocio no dejan borrar: `2026-0003` (pagada) y `2026-0004` (anulada). El contador de A en 2026 está en 4. Se suman a los restos de la ronda 1. La limpieza completa necesita un administrador (SQL editor).

## Notas (no bloqueantes)
- **Errores de escritura directa en `products`:** siguen devolviendo errores crudos de Postgres (23514 con el nombre del constraint, 22003). No incluyen `owner_id`, pero la tarea 3 (`toUserMessage`) no debe mostrarlos tal cual (SEG-5).
- **Escala del precio:** se mira cómo llega el valor, no su importe. `1.500` se rechaza aunque valga 1.50. `JSON.stringify` no genera ceros finales, pero conviene que la tarea 6 envíe el precio normalizado.
- **Descripciones en blanco:** una descripción solo con espacios se acepta. Zod (tarea 6) debería aplicar `trim`.
- **Código de `due_date < issue_date`:** este caso devuelve `INVALID_LINE`. Funciona, pero el nombre engaña. Se puede tener en cuenta al mapear los mensajes en la UI.
- **Contrato D6 en `PLAN.md`:** sigue diciendo `AAAA-NNNN`. Conviene aclarar "como mínimo 4 dígitos", como recomendaba la revisión adversarial (lo cambia el Orquestador).
- **DOM-7 en TS:** se aplicará desde la tarea 2 (`money.ts` con `Number.isFinite`).
