# Tarea 4 · Ronda 2 · Veredicto: APROBADA

## Puerta de calidad
| Paso | Resultado |
|---|---|
| lint | ✅ sin errores ni warnings |
| typecheck | ✅ `next typegen && tsc --noEmit` limpio |
| test | ✅ 323 tests (8 archivos; nuevo `uuid.test.ts`) |
| build | ✅ `/clientes` como Partial Prerender (◐), sin avisos |

## Fallos
| # | Directriz | Severidad | Archivo:línea | Problema | Corrección esperada |
|---|---|---|---|---|---|
| F1 | ALC-2 (D12) | menor | src/lib/actions/customers.ts:96-99 | El replay de D12 se da por bueno con que exista una fila propia con ese id, sin mirar su contenido. Si un `id` ya usado vuelve a enviarse con **otros** datos, la acción responde "Cliente creado" y no guarda nada: es una pérdida silenciosa. Con el id generado en servidor (desviación 1) hay un camino teórico para que pase: que el router de Next restaure un payload RSC antiguo de `?nuevo=1` (atrás/adelante) con el `newId` ya consumido. No lo he podido demostrar sin navegador: `revalidatePath` purga la caché del router tras el alta, así que es poco probable. | En el replay, comparar la fila existente con lo enviado (al menos `name`, `tax_id` y `email`). Si no coincide, devolver un error recuperable y, si es posible, un id nuevo. Otra opción es generar el id inicial en cliente después del montaje (`useEffect`). |

## Fallos de la ronda anterior
- **F1** (`*` como comodín) corregido ✅. `ilikeAnyFilter` elimina `*` y tiene test (`a*b` → `%ab%` y `**` → null). En vivo, `?q=<tag>*lock` ya no encuentra "<tag> lock" (0 resultados). `?q=*` equivale a una búsqueda vacía (ver notas).
- **F2** (desbordamiento en la confirmación) corregido ✅. `ConfirmButton.tsx:71` lleva `min-w-0 break-words`.
- **Adversarial 1** (cambios perdidos entre pestañas) corregido ✅ con D11 (ver pruebas).
- **Adversarial 2** (duplicado al reintentar) corregido ✅ con D12 (ver pruebas y F1).

## Migración 0003
- La función del trigger tiene `set search_path = ''` y usa solo `now()` (pg_catalog). No es `security definer` ✅.
- `revoke all … from public, anon, authenticated` ✅. Por REST, `rpc('set_updated_at')` da `PGRST202`: no está expuesta.
- Los triggers `before update` en `customers` y `products` son idempotentes (`drop trigger if exists`) y la migración va en una transacción ✅.
- **Prueba de manipulación como QA_A (REST directo):**
  - PATCH con `updated_at = 2000-01-01` → el trigger lo sobrescribe con `now()` ✅.
  - PATCH reenviando el `updated_at` actual → se incrementa igualmente ✅.
  - Un cliente no puede fijar ni conservar una versión en UPDATE.
- En INSERT sí se acepta un `updated_at` arbitrario (no hay trigger de insert). No es explotable, porque cualquier UPDATE posterior lo pisa y el formulario envía el valor leído, pero ver notas.

## Pruebas en vivo
`npm run dev -- -p 3251` con sesión real de QA_A (cookies `@supabase/ssr`). Las acciones se invocaron por HTTP con `encodeReply`, y los efectos se comprobaron por REST. Al terminar se apagó el servidor (puerto libre).

| Caso | Resultado |
|---|---|
| `?edit=<id>` renderiza el hidden `updated_at` idéntico al de BD (microsegundos) | ✅ |
| D11 edición 1 con la versión leída | ✅ "Cliente guardado" |
| D11 edición 2 con la **misma** versión | ✅ mensaje exacto de D11, `values` conservados ("C/ Nueva 2"). En BD sigue el cambio de la edición 1 (`phone=600111222`) y la versión subió: nada perdido |
| Tras una edición correcta, el payload RSC de respuesta trae la versión nueva (y no la antigua) | ✅ (una segunda edición en la misma pantalla no dará conflicto falso) |
| `updated_at` ausente, basura (`' or 1=1`) o `mode` ausente | ✅ "No se ha podido identificar el cliente…", sin llegar a la BD |
| Editar un id inexistente o de QA_B | ✅ "El cliente no existe o ya se ha eliminado." La fila de B sigue intacta |
| D12 alta ×2 con el mismo id | ✅ "Cliente creado" ambas veces y **1** sola fila |
| Alta con el id de un cliente de QA_B | ✅ `ok:false` con "Ya existe un registro con esos datos.": sin éxito, sin crear fila en A, B intacto y sin filtrar datos de B |
| Alta con id no UUID o sin id | ✅ error de identificación |
| `?nuevo=1` incluye un hidden `id` UUID distinto en cada petición | ✅ |
| Log del dev server al renderizar `/clientes`, `?nuevo=1` y `?edit=` (13 GET) | ✅ 0 avisos o errores (ni de `cacheComponents` ni de valores aleatorios en render) |
| Regresión: XSS en name | ✅ solo aparece escapado (`&lt;script&gt;`) |
| Regresión: búsqueda `a,b`, `).or(id.neq.x)`, `%`, `_` | ✅ 200, 0 resultados y sin fuga de B |
| Regresión: borrar con factura (borrador con 1 línea) | ✅ "No se puede eliminar: tiene facturas asociadas" |
| Regresión: borrar el propio cliente | ✅ "Cliente eliminado" |
| Limpieza | ✅ 0 filas `QA4%` en A y en B, y la factura de prueba borrada |

## Desviaciones declaradas
1. **Id inicial del alta generado en servidor** (`newUuid()` en `CustomersSection`, tras `await searchParams` y `getCurrentUser()`). Aceptable. Evita el mismatch de hidratación, no genera avisos de Next (está detrás de datos dinámicos y dentro de `<Suspense>`) y es distinto por petición. Después de un alta correcta el cliente rota el id (`setCreateId(newUuid())`). La debilidad residual es la de F1 (menor).
2. **El formulario ya no funciona sin JS**, porque `useActionState` envuelve `saveCustomer` en una función de cliente. Aceptable. Ni las directrices ni PLAN.md exigen mejora progresiva, y la app ya depende de JS (ConfirmButton, navegación). Se pierde algo que funcionaba en la ronda 1. Para recuperarlo, la acción podría devolver `nextId` en `ActionState` y el formulario usar `state.nextId ?? newId`, sin envolver la acción.

## Revisión por directriz (cambios de esta ronda)
- **SEG-2** ✅ orden validación → `getUser()`. Zod con `discriminatedUnion` para mode/id/updated_at. **SEG-3** ✅ RLS sin cambios y se filtra por `owner_id`. `customerExists` filtra por `owner_id`. **SEG-5** ✅ todo pasa por `toUserMessage` o constantes. **SEG-6** ✅ `id` validado como UUID en los dos modos.
- **ALC-1** ✅ archivos nuevos (`uuid.ts`+test, `0003`) justificados por D11 y D12. `products.updated_at` también forma parte de D11. **ALC-2** ✅ D11 y D12 cumplidos (salvo el matiz de F1). **ALC-3** ✅. **ALC-5** ✅ sin `use cache` y lecturas dentro de `<Suspense>`.
- **TST-1/2/3** ✅ `newUuid` cubre randomUUID, el fallback con bytes extremos (0x00 y 0xff, que fijan versión y variante) y la unicidad.
- **UX-2** ✅ el conflicto se muestra como mensaje de formulario y conserva lo escrito.

## Notas (no bloqueantes)
- `?q=*` (o solo asteriscos) muestra "5 clientes encontrados" y el buscador conserva `*`: lo trata como búsqueda vacía pero lo rotula como resultado de búsqueda. Es cosmético. Se puede normalizar `q` sin `*` antes de pintar.
- La versión se compara por igualdad exacta: un `updated_at` con precisión de milisegundos (`toISOString()`) de la versión **actual** da conflicto falso. Con el formulario no pasa, porque reenvía la cadena exacta de BD. Hay que tenerlo en cuenta en la tarea 5 (productos): no convertir `updated_at` a `Date`.
- INSERT acepta `updated_at` arbitrario. Si se quiere cerrar del todo, se puede usar `before insert or update` en el mismo trigger. No es necesario para D11.
- D12 protege el caso de la revisión adversarial (Supabase confirma, pero la respuesta al servidor se pierde y la acción devuelve error). Si falla la red entre navegador y servidor, la promesa de la acción se rechaza y el error sube al error boundary. Al volver al formulario se pierde el id: es el mismo comportamiento que en la ronda 1.
- Tarea crítica: conviene que Darío relance `/codex:adversarial-review` sobre D11/D12 antes del merge.
