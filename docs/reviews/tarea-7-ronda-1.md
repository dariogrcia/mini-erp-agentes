# Tarea 7 · Ronda 1 · Veredicto: APROBADA

Rama `tarea-7-ciclo-factura`. Cambios sin commit revisados con `git diff HEAD` y los archivos sin seguimiento. `git diff main` no se usó porque la rama parte de antes del merge de la tarea 8 y mostraría como borrado `dashboard/kpis`. Develop: Codex.

## Puerta de calidad
| Paso | Resultado |
|---|---|
| lint | ✅ sin errores ni warnings |
| typecheck | ✅ |
| test | ✅ 359 tests (11 archivos) |
| build | ✅ `/facturas/[id]` y `/editar` como PPR (◐) y `/api/facturas/export` dinámico (ƒ) |

## Fallos
| # | Directriz | Severidad | Archivo:línea | Problema | Corrección esperada |
|---|---|---|---|---|---|
| F1 | ALC-1 | menor | `PLAN.md:261` | Codex editó `PLAN.md`, aunque AGENTS.md lo prohíbe (implementa la tarea; el estado lo lleva el Orquestador). El Orquestador lo revirtió y lo dejó como "en curso". No cuenta contra este entregable. | No tocar `PLAN.md` desde Develop. |
| F2 | ALC-1 | menor | `src/app/(app)/layout.tsx:24-25` | El archivo no está en la lista de la tarea. El cambio está justificado: solo añade `print:pb-0 print:pl-0 print:max-w-none print:p-0` para que la impresión no deje el hueco de 240 px de la barra lateral. No toca el `<Suspense>` de `AppNav` ni `RequireUser`. La navegación sigue funcionando (todas las páginas recorridas en vivo cargan con su menú). | Ninguna. Basta con que el Orquestador lo mencione en el commit. |
| F3 | UX | menor | `src/app/api/facturas/export/route.ts:27` | El CSV sale ordenado por `id` (UUID), porque la paginación por clave usa ese campo. Para el usuario, las filas aparecen en orden aleatorio (p. ej. 2026-0005, 0011, 0004…). | Opcional: ordenar por `issue_date, number` (manteniendo el keyset) u ordenar `rows` en memoria antes de `invoicesToCsv`. |
| F4 | TST-3 | menor | `src/app/(app)/facturas/[id]/invoice-detail.test.ts:79-80` | Comprueba cadenas de clases CSS (`md:hidden print:hidden`), es decir, implementación y no comportamiento. Los demás tests del archivo sí son de comportamiento. | Opcional: quitar esas aserciones o comprobar la estructura (tarjetas y tabla presentes). |

No hay fallos bloqueantes ni mayores.

## Revisión por directriz
- **SEG-2:** las 4 acciones (`issueInvoice`, `markPaid`, `cancelInvoice` y `deleteDraft`) validan el `id` con `uuidSchema` (Zod) y comprueban `auth.getUser()` antes de llamar a la RPC o hacer el DELETE. El export comprueba la sesión. No recibe entrada: el propietario sale de la sesión. ✅
- **SEG-5:** los errores pasan por `toUserMessage`, y en el export un importe corrupto o un error a mitad de paginación devuelve un 500 genérico en JSON, no un CSV parcial. ✅
- **SEG-6:** se valida el UUID en las acciones, en `/facturas/[id]` y en `/editar`. ✅
- **D3:** las transiciones usan solo las RPC `security definer`. `deleteDraft` hace un DELETE directo, lo que el esquema permite (política de delete solo si está en `draft`). Además filtra `status='draft'` en la propia sentencia, así que no hay carrera con una emisión simultánea. ✅
- **DOM-3, DOM-4, DOM-5 y D6:** se comprobaron en vivo (ver abajo). ✅
- **UX-6:** Anular y Eliminar usan `ConfirmButton` (confirmación en dos pasos). ✅
- **ALC-5 y D10:** la página exterior es síncrona y `params`, `searchParams` y la sesión se leen dentro de `<Suspense>` con skeleton, tanto en el detalle como en `/editar`. ✅
- **Botones según el estado:** dependen de `canTransition`. Borrador: Editar, Emitir, Eliminar e Imprimir. Emitida: Marcar pagada, Anular e Imprimir. Pagada y anulada: solo Imprimir. Hay test para los 4 estados. ✅
- **Impresión:** `print:hidden` en las acciones, en "Volver a facturas", en "Borrador guardado" y en el botón Imprimir. La navegación (`AppNav`: aside, header y barra inferior) ya estaba oculta con `print:hidden`. En impresión, las líneas salen como tabla (`print:table`) y no como tarjetas. ✅
- **Mobile-first:** en móvil, las líneas son tarjetas (`md:hidden`) y la tabla aparece desde `md`. Hay `min-w-0` y `break-words` en los textos largos y los botones van en `flex-wrap`. No hay riesgo de scroll horizontal a 375 px (revisión estática). ✅
- **ALC-3:** no hay `console.*`, `any` ni `@ts-ignore` en los archivos nuevos. ✅

## Pruebas en vivo
`npm run dev -- -p 3255`, con sesión real de QA_A (cookies de `@supabase/ssr`) y Server Actions llamadas por HTTP (`Next-Action` + `encodeReply`, ids del `server-reference-manifest` de `/facturas/[id]`). Los efectos se comprobaron por REST. El log del servidor terminó con 0 errores.

- **Ciclo 1:** producto QA7-A con stock 3 y borrador de 2 uds. Emitir dio `2026-0008` con stock 3→1. Marcar pagada puso `status=paid` y `paid_at`. ✅
- **Ciclo 2:** borrador de 1 ud. Emitir dio `2026-0009` con stock 1→0. Anular puso `cancelled` y repuso el stock 0→1. ✅
- **Stock insuficiente:** 5 uds con stock 1 → "Stock insuficiente de QA7-A". La factura sigue en `draft`, sin número, y el stock sigue en 1. ✅
- **Transiciones inválidas:**
  - Pagar o anular un borrador → "Esta acción no está permitida en el estado actual de la factura."
  - Anular una pagada → mismo mensaje, sin cambios y sin reponer stock.
  - Eliminar una pagada → "No se ha eliminado la factura: …", y la factura sigue existiendo.
  - Emitir una pagada o una anulada → "La factura ya no es un borrador…".
  - Pagar o anular una anulada → mensaje controlado, sin doble reposición de stock.
  - `/facturas/<pagada>/editar` → "La factura ya no es un borrador y no se puede editar", sin formulario.

  Todo ✅.
- **Doble envío concurrente de "Emitir"** (dos POST en paralelo sobre la misma factura): uno devuelve `ok:true` (`2026-0010`) y el otro "La factura ya no es un borrador…". El stock bajó una sola vez (1→0) y la siguiente emisión recibió `2026-0011`, sin huecos ni duplicados. ✅
- **Carrera por la última unidad** (dos borradores distintos de 1 ud con stock 1, en paralelo): uno se emite (`2026-0012`) y el otro recibe "Stock insuficiente de QA7-A". El stock queda en 0, nunca en negativo. ✅
- **Ids ajenos e inválidos** (borrador de QA_B, emitida de QA_B, `not-a-uuid`, UUID inexistente, vacío y campo ausente) × las 4 acciones:
  - "No se ha encontrado el registro…", "No se ha eliminado la factura…" o "No se ha podido identificar la factura…".
  - Las facturas de QA_B quedan intactas.
  - `/facturas/<B>`, `/facturas/abc`, `/facturas/<inexistente>`, `/facturas/<B>/editar` y `/facturas/abc/editar` → "La factura no existe o no tienes acceso a ella", sin fugar el nombre del cliente de B.

  Todo ✅.
- **Export CSV:**
  - Sin sesión: 401 en JSON (lo responde el proxy).
  - Con sesión: 200 con `text/csv; charset=utf-8`, `attachment; filename="facturas.csv"`, `private, no-store`, BOM `EF BB BF`, separador `;`, CRLF y decimales con coma.
  - Sin borradores (QA_A tenía 2 borradores en ese momento y no aparecen) y sin facturas de QA_B.
  - Un cliente llamado `=HYPERLINK("http://evil";"x")` sale como `"'=HYPERLINK(""http://evil"";""x"")"`.

  ✅
- **XSS:** `<script>alert(1)</script><img src=x onerror=alert(2)>` en las notas y en la descripción sale escapado en el detalle (`&lt;script&gt;`) y no aparece el marcado crudo. ✅
- **Eliminar borrador:** redirige a `/facturas` (`x-action-redirect`) y la fila desaparece. ✅

**Limpieza:**
- Se borraron los borradores y los productos de prueba de A y B, y se anularon todas las facturas emitidas de prueba.
- Se borraron 3 clientes huérfanos (de una segunda ejecución accidental del script de prueba).
- Quedan, porque la BD no permite borrarlas: la factura **pagada** `2026-0008` de QA_A, las anuladas de QA_A (`2026-0009` a `0013`) y la anulada `2026-0002` de QA_B, junto con sus clientes (FK `restrict`): "QA7 cliente A", el cliente fórmula de QA_A y "QA7 cliente B".
- Estado final: QA_A tiene 13 facturas (4 pagadas y 9 anuladas), 3 clientes y 0 productos. QA_B tiene 2 facturas (1 emitida previa y 1 anulada), 2 clientes y 0 productos.
- Servidor apagado y puerto 3255 libre.

## Notas (no bloqueantes)
- Mensajes de las acciones: el éxito se muestra en `InvoiceActions` y los errores de Anular y Eliminar en el propio `ConfirmButton`. Mientras se ejecuta, "Emitir" queda deshabilitado (bloqueo de doble clic en el cliente). El servidor también es seguro ante el doble envío, como se demostró arriba.
- La fecha del CSV sale en ISO (`2026-11-23`). Viene de `invoicesToCsv` (tarea 2), fuera de alcance. Es razonable para importar en hojas de cálculo.
