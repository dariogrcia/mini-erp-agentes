# Tarea 5 · Ronda 1 · Veredicto: APROBADA

## Puerta de calidad
| Paso | Resultado |
|---|---|
| lint | ✅ sin errores ni warnings |
| typecheck | ✅ `next typegen && tsc --noEmit` limpio |
| test | ✅ 323 tests (8 archivos; la tarea no añade lógica de dominio nueva) |
| build | ✅ `/productos` como Partial Prerender (◐) |

## Fallos
| # | Directriz | Severidad | Archivo:línea | Problema | Corrección esperada |
|---|---|---|---|---|---|
| F1 | SEG-5 / UX-2 (mensaje correcto) | menor | src/lib/actions/products.ts:64-68 y 25-28 | Un alta cuyo `id` ya existe pero es de **otro** usuario (23505 sobre la PK, sin fila propia) se responde con "Ya existe un producto con ese SKU" y un error en el campo `sku`, aunque el SKU sea único. No es un éxito, no crea fila y no filtra datos de B (verificado), pero el mensaje es falso. Solo se alcanza manipulando el id oculto, porque el formulario genera un UUID v4. En clientes el mismo caso da "Ya existe un registro con esos datos." | Distinguir la restricción: usar `DUPLICATE_SKU` solo cuando el 23505 es del unique `(owner_id, sku)` (p. ej., mirar `error.message`/`details` por el nombre de la constraint o la columna `sku`), y en los demás casos devolver `toUserMessage(error)` sin error de campo. |

## Pruebas en vivo
`npm run dev -- -p 3252` con sesión real de QA_A (cookies de `@supabase/ssr`). Las Server Actions se invocaron por HTTP con el `encodeReply` real de React, y los efectos se comprobaron por REST con supabase-js como QA_A y QA_B. Al terminar se apagó el servidor (puerto libre). En el log del dev server no hay errores propios de la app (los únicos son de una primera ejecución del script con un id de acción vacío).

| Caso | Resultado |
|---|---|
| Precio `12,50` / `12.5` / ` 7 ` / `0` / `9999999999.99` | ✅ creado; en BD 12.5, 12.5, 7, 0 y 9999999999.99 |
| Precio `1,005` / `NaN` / `-1` / `1e3` / vacío / `Infinity` / `10000000000.00` | ✅ rechazado con error en `unit_price` y valores conservados |
| Stock `-1`, `1.5`, `1e3`, `2147483648`, vacío; umbral `-3`, `2.5` | ✅ error por campo "Introduce un entero entre 0 y 2147483647." |
| IVA `7`, `abc`, `21.0` | ✅ "El IVA debe ser 0, 4, 10 o 21." |
| SKU vacío o de 41; nombre vacío o de 121 | ✅ errores por campo |
| D12: alta ×2 con el mismo id | ✅ "Producto creado" ambas veces y **1** fila |
| SKU duplicado con id nuevo | ✅ "Ya existe un producto con ese SKU" (mensaje y campo), `ok:false` y 0 filas con ese id: **no** se trata como replay |
| Editar a un SKU ya usado | ✅ mismo mensaje, sin cambios |
| Mismo SKU en A y en B | ✅ permitido (unique por propietario) |
| Alta con el id de un producto de B | ⚠️ `ok:false`, sin fila en A, B intacto y sin fuga, pero con el mensaje de SKU (F1) |
| `?edit=` muestra el hidden `updated_at` idéntico al de BD (microsegundos) y el precio como `12.50` | ✅ |
| D11 edición 1 / edición 2 con la misma versión | ✅ "Producto guardado" / mensaje exacto de D11, `values` conservados. En BD queda la edición 1 (13 €, IVA 10, stock 20) y la versión subió |
| Tras editar, la respuesta RSC lleva la versión nueva y no la antigua | ✅ (no hay conflicto falso en una segunda edición desde la misma pantalla) |
| `updated_at` ausente o basura; id no UUID | ✅ "No se ha podido identificar el producto…" sin llegar a la BD |
| Editar o borrar un producto de B; `?edit=<id de B>`; `?edit=nope` | ✅ "El producto no existe o ya se ha eliminado.", B intacto y sin fuga |
| Borrar con id no UUID o sin id | ✅ NOT_FOUND sin llegar a la BD |
| XSS en nombre y SKU (`<script>`, `<img onerror>`, `<b>`) | ✅ solo aparece escapado |
| Filtro `?stock=bajo` (stock 3/5, 5/5, 6/5 y 0/0) | ✅ muestra Bajo, Igual y Cero (`stock <= umbral`); oculta Alto; 3 insignias "Stock bajo"; checkbox marcado; sin datos de B. `stock=BAJO` o `x` no filtran |
| Estado vacío con filtros | ✅ "Ningún producto coincide…" con "Ver todos los productos" |
| Búsqueda por nombre, SKU y sin distinguir mayúsculas | ✅ |
| `q` con `*` intermedio, `%`, `_`, `\`, `'`, `"`, `a,b`, `a)`, `).or(id.neq.x)`, `name.eq.x,owner_id.neq.x` | ✅ 200, literales, sin inyección y sin datos de B. `(` encuentra solo el producto cuyo nombre lo contiene. `<tag>*Alpha` → 0 (el `*` ya no es comodín) |
| Borrar un producto referenciado en una línea de un borrador | ✅ "Producto eliminado"; la línea queda con `product_id = null`, conserva "Línea Alpha QA5" y su total |
| `?nuevo=1` pone un hidden `id` UUID distinto en cada petición | ✅ |
| Limpieza | ✅ 0 filas `QA5%` en A y B; factura y cliente de prueba borrados |

**Mobile-first (HTML y fuente):** las tarjetas (`lg:hidden`) no tienen anchos fijos; el nombre lleva `break-words`, el SKU `break-all` y el precio y el stock `break-words`. Los anchos fijos (`w-48`, `w-[20%]`, `table-fixed`) solo están en la tabla `hidden lg:block`. Los botones `whitespace-nowrap` están en contenedores `flex-wrap`. La confirmación de borrado usa `ConfirmButton`, ya corregido en la tarea 4 (`min-w-0 break-words`). No veo scroll horizontal a 375 px.

## Revisión por directriz
- **SEG-1** ✅. **SEG-2** ✅ `saveProduct` y `deleteProduct` validan con Zod y llaman a `auth.getUser()`. La página usa `getCurrentUser()`. **SEG-3** ✅ RLS sin cambios, y las mutaciones filtran además por `owner_id`. **SEG-5** ✅ todo pasa por `toUserMessage` o constantes (salvo el texto engañoso de F1). **SEG-6** ✅ `id` y `?edit=` se validan como UUID. **SEG-7** ✅ no hay redirecciones con destino del usuario.
- **DOM-1/D4** ✅ el precio se parsea con `toCents` y se guarda con `fromCents`, sin floats. **DOM-6** ✅ precio ≥ 0, stock y umbral ≥ 0 y enteros. **DOM-7** ✅ `NaN`, `Infinity` y `1e3` rechazados.
- **D11** ✅ `updated_at` se compara como string tal cual (no se convierte a `Date`). **D12** ✅ el replay solo se acepta si hay una fila propia con ese id; el 23505 del unique de SKU no cuenta como éxito.
- **UX-1** ✅. **UX-2** ✅ errores por campo con `aria-invalid`, "Guardando…" y "Producto creado/guardado/eliminado". **UX-3** ✅ estado vacío con CTA, con filtro y sin él. **UX-4** ✅ labels (también en el `select` y el checkbox), `aria-label` en las acciones de fila. **UX-5** ✅ `formatEUR`. **UX-6** ✅ `ConfirmButton`.
- **ALC-1** ✅ `ProductList.tsx` (no figura en la lista de PLAN.md) separa la lista y el buscador de `page.tsx`, igual que `CustomerList.tsx` en la tarea 4: justificado. No toca clientes ni facturas. **ALC-3** ✅. **ALC-4** ✅ `await searchParams`. **ALC-5** ✅ la página exterior es síncrona, las lecturas van en `<Suspense>` con skeleton y no hay `use cache`.
- **TST** n/a: no hay funciones nuevas en `src/lib/domain/`.

## Notas (no bloqueantes)
- `loadProducts` (page.tsx:37-52), con `?stock=bajo`, recorre todo el catálogo en lotes de 201 hasta reunir 201 coincidencias (PostgREST no compara dos columnas). Con catálogos pequeños es correcto; con miles de productos, una visita hace muchas consultas. Si se quiere evitar, se puede añadir una columna generada o una vista `is_low_stock` en una migración futura.
- `?q=*` se trata como búsqueda vacía, pero el buscador sigue mostrando `*` (mismo comportamiento cosmético que en clientes).
- La consulta de `?edit=` no filtra por `owner_id` y se apoya solo en RLS (verificado: el id de B da "no existe"). Añadir `.eq("owner_id", …)` sería defensa en profundidad.
- Como en clientes, el replay de D12 no compara el contenido (limitación aceptada en D12).
