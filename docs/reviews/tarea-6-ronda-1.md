# Tarea 6 · Ronda 1 · Veredicto: APROBADA

## Puerta de calidad
| Paso | Resultado |
|---|---|
| lint | ✅ sin errores ni warnings |
| typecheck | ✅ `next typegen && tsc --noEmit` limpio |
| test | ✅ 323 tests (8 archivos) |
| build | ✅ `/facturas`, `/facturas/nueva` y `/facturas/[id]` como Partial Prerender, sin avisos |

## Fallos
| # | Directriz | Severidad | Archivo:línea | Problema | Corrección esperada |
|---|---|---|---|---|---|
| F1 | UX-2 | menor | src/lib/domain/validation.ts (superRefine) · src/components/InvoiceEditor.tsx:188 | Cuando una línea tiene un dato inválido de rango (cantidad `0`, precio `-1`, IVA `NaN` o cantidad `2147483648`), además del error del campo sale el banner de líneas "Los importes de la factura son inválidos o exceden el límite permitido". Es engañoso, porque no hay ningún exceso. Demostrado en vivo con `qty 0`, `precio -1` y `vat NaN`. | En `saveDraft`, descartar el issue `lines` si ya hay errores por línea (`lines.N.*`), o mostrarlo solo cuando no los haya. |
| F2 | ALC-2 (D12) | menor | src/lib/actions/invoices.ts | El alta de borradores no es idempotente: el id lo genera la RPC (`p_invoice_id = null`). Un reintento tras un fallo de red puede crear un borrador duplicado. El candado `locked` solo evita el doble clic. Está declarado: no se puede corregir sin cambiar el SQL. | **Decisión del Orquestador:** o se añade una excepción explícita a D12 en PLAN.md para las facturas, o se crea una migración `0004` que acepte un id generado por el cliente (antes de la tarea 7, cuyo "No hacer" prohíbe tocar el SQL). |

## Evaluación de las desviaciones declaradas
- **`layout.tsx` (AppNav en Suspense):** justificada (ALC-1). Sin ella, `usePathname()` en una ruta con param dinámico rompe el prerender (D10). El fallback reserva la altura de la barra en móvil. ✅
- **Placeholder `[id]/page.tsx`:** justificado para que la redirección llegue a una página real. Valida el UUID, comprueba la sesión, lee en Suspense y muestra "no existe o no tienes acceso" para un id basura, inexistente o de QA_B, sin fugas. La tarea 7 debe **sustituirlo** entero. ✅
- **`?guardado=1`:** es la confirmación de UX-2. Solo se muestra si la factura sigue en `draft`, y se renderiza como texto fijo (no se refleja el parámetro). ✅
- **Idempotencia de altas:** ver F2.
- **"El error de vencimiento solo aparece si el resto es válido":** **no es cierto, y es mejor de lo declarado.** En vivo, `due < issue` junto con una línea con `qty 0` devuelve los dos errores, `due_date` y `lines.0.quantity`.
- **`overrideTypes` en el join:** correcto, porque el embed many-to-one devuelve un objeto. El acceso es nulo-seguro (`customers?.name ?? …`). ✅
- **375 px no comprobado en navegador:** revisión estática OK (ver más abajo). Queda pendiente una comprobación visual, que no bloquea.

## Pruebas en vivo
`npm run dev -- -p 3253`, sesión real de QA_A (cookies `@supabase/ssr`) y `saveDraft` invocada por HTTP (`Next-Action` + `encodeReply`). Los efectos se comprobaron por REST. Log del servidor: 0 errores o avisos. Al terminar se apagó el servidor (puerto libre) y se borraron todos los borradores, productos y clientes creados. QA_A y QA_B quedaron con los mismos datos que al principio (A: 4 facturas, 1 cliente y 0 productos; B: 1 factura, 1 cliente y 0 productos).

**Vista previa (`computeLine`/`computeTotals`) frente a la BD:** coinciden en línea a línea y en los totales en todos los casos:
| Caso | TS (céntimos) | BD | |
|---|---|---|---|
| 1 × 0,50 @21 (10,5 → 11) | 50/11/61 | 0.5/0.11/0.61 | ✅ |
| 3 × 0,05 @10 (1,5 → 2) | 15/2/17 | 0.15/0.02/0.17 | ✅ |
| 2 × 0,13 @4 (1,04 → 1) | 26/1/27 | ✅ | ✅ |
| 1 × 0,25 @10 (2,5 → 3) | 25/3/28 | ✅ | ✅ |
| 3 líneas mixtas | 1300/273/1573 | ✅ | ✅ |
| 2147483647 × 0,01 @21 | 2147483647/450971566/2598455213 | ✅ | ✅ |
| 1 × 8264462809,91 @21 (total = máx. exacto) | …/999999999999 | 9999999999.99 | ✅ |
| 1 × `-0` | 0/0/0 | ✅ | ✅ (precio 0 permitido) |
| 1000000 × 9999,99 @21, overflow simple y overflow en la suma | rechazados con el error de límite | sin fila | ✅ |

**Entradas hostiles:** arrays de distinta longitud, 201 líneas (200 sí se aceptan), precios `NaN`/`1e3`/`1,005`/`-1`/`Infinity`, cantidades `1e3`/`0`/`1.5`/`-1`/`2147483648`, IVA `5`/`NaN`, sin líneas, descripción vacía o de 201 caracteres, `product_id` no UUID, notas de 2001 caracteres y de 1 MB, fechas `2026-02-30`/`3000-01-01` e `invoice_id` basura. Todas se rechazan con un error por campo en español, sin llegar a la BD. Ninguna crea filas ✅.
**Recursos ajenos:** `product_id` de QA_B, `customer_id` de QA_B, `invoice_id` de un borrador de QA_B e `invoice_id` inexistente → "No se ha encontrado el registro…". El borrador de B queda intacto ✅. `invoice_id` de una factura **pagada** de A → "La factura ya no es un borrador…", sin cambios en BD ✅. Editar un borrador propio actualiza las líneas, el `product_id` y el total (2 × 3,33 @10 = 7,33) ✅.
**XSS** (`<script>`/`<img onerror>`) en la descripción y en el nombre del cliente: escapado en el listado y en `[id]` ✅.
**`?estado=`:** `foo`, `DRAFT`, `draft,issued`, `estado[]`, `' or 1=1`, `status.neq.x` y `draft)&or=(id.neq.0` → se tratan como "todas" (lista blanca D5) ✅. Con un valor repetido se usa el primero. Ninguna fuga de B ✅.
**Sin sesión:** `GET /facturas` y POST de la acción → `307 /login?next=…` ✅.

## Revisión estática
- SEG-2 ✅ (`getUser()` y Zod; la sesión se comprueba después de validar, pero antes de tocar la BD). SEG-5 ✅ (`toUserMessage`). SEG-6 ✅ (UUID en `invoice_id`, `customer_id`, `product_id` y `params.id`). D3 ✅ (solo la RPC escribe). D4/DOM-1 ✅ (céntimos y `fromCents` a string, sin floats). D5 ✅. D10/ALC-5 ✅ (shells síncronos y lecturas en Suspense). ALC-3 ✅ (sin `console`, `any` ni `@ts-ignore`).
- UX-1 (estático): la tabla del listado está `hidden lg:block` y en móvil y tablet hay tarjetas. Los anchos fijos (`w-36`/`w-32`) solo están en la tabla de escritorio (`table-fixed`). Las líneas del editor son una rejilla de 3 columnas en móvil (unos 95 px por campo a 375 px), los inputs son `w-full min-w-0`, y los filtros y la vista previa usan `flex-wrap`. No se detecta desbordamiento.
- UX-2 ✅ (errores por campo, "Guardando…" y la confirmación). UX-3 ✅ (vacío con CTA, también por filtro y sin clientes). UX-4 ✅ (labels y `aria-label` en "Quitar"). UX-5 ✅ (`es-ES` en la moneda y en las fechas UTC).

## Notas (no bloqueantes)
- Tarea 7: al editar con `initial`, si una línea apunta a un producto borrado (`product_id` ya null) o a uno que no está en `products`, el select se queda sin opción coincidente. Conviene contemplarlo.
- `StatusBadge` asume un estado válido. Lo garantiza el CHECK de la BD.
