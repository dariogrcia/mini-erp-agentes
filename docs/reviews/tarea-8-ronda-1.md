# Tarea 8 · Ronda 1 · Veredicto: APROBADA

## Puerta de calidad
| Paso | Resultado |
|---|---|
| lint | ✅ sin errores ni warnings |
| typecheck | ✅ `next typegen && tsc --noEmit` limpio |
| test | ✅ 355 tests (9 archivos), `kpis.test.ts` incluido |
| build | ✅ `/dashboard` como Partial Prerender (◐) |

## Fallos
| # | Directriz | Severidad | Archivo:línea | Problema | Corrección esperada |
|---|---|---|---|---|---|
| F1 | DOM-1 | menor | src/lib/domain/kpis.ts:53-58 | `addCents` tope la **suma** a `MAX_CENTS` (el máximo de un solo `numeric(12,2)`). Dos facturas emitidas cerca del máximo hacen que `computeKpis` lance y todo el bloque de KPIs muestre "No se han podido cargar los datos del panel" de forma permanente. Hoy no es realista, pero el error engaña. | Limitar solo con `Number.isSafeInteger` en la suma (el tope por factura ya lo hace `toCents`), o mostrar el KPI concreto como "—" en vez de tumbar los cuatro. |
| F2 | ALC-5 / D10 | menor | src/app/(app)/dashboard/page.tsx:139 | `<Suspense fallback={null}>` en `GettingStarted`. D10 pide fallback con skeleton. Es intencionado (aparece solo en cuentas nuevas y evita el salto de diseño), pero no está declarado. | Aceptarlo y anotarlo en D10, o poner un skeleton. |
| F3 | — | menor | src/app/(app)/dashboard/page.tsx:46-55, 77-87 | La paginación termina cuando `data.length < PAGE_SIZE` (1000). Si `max-rows` de PostgREST baja de 1000 en el proyecto, la primera página ya vuelve corta y se omiten filas en silencio. Con el valor por defecto (1000) es correcto. Usa el mismo patrón que `productos/page.tsx`. | Opcional: comentario que ate `PAGE_SIZE` a `max-rows`, o usar `count: "exact"` para comprobar. |

No hay fallos bloqueantes ni mayores.

## Verificación en vivo (QA_A, `npm run dev -- -p 3254`)
Hice un cálculo independiente por REST con la sesión de QA_A (paginado, mes de Europe/Madrid, céntimos enteros) y lo comparé con el HTML de `/dashboard` (cookie de sesión `@supabase/ssr`).

Para cubrir todos los KPIs creé estos datos de prueba: 3 productos (stock 3/umbral 5, stock 0/umbral 2 y stock 100) y 4 facturas. Son una emitida de hoy por 1.209.999,99 €, una emitida del 31-10, una pagada del 15-10 y un borrador de hoy.

| KPI | Esperado (REST) | Panel | |
|---|---|---|---|
| Facturado este mes | 1.210.003,20 € | 1.210.003,20 € | ✅ (excluye la pagada de octubre, el borrador y las anuladas) |
| Pendiente de cobro | 1.210.012,09 € | 1.210.012,09 € | ✅ (incluye la emitida de octubre) |
| Clientes | 1 | 1 | ✅ |
| Stock bajo | 2 | 2 | ✅ (umbral incluido; "Agotado" primero, luego "3 ud.") |
| Últimas 5 facturas | Borrador, 0005, 0004, 0003, 0002 | igual y en el mismo orden | ✅ con fecha y moneda en es-ES |

- **Filtro OR de PostgREST:** `status.eq.issued,and(status.eq.paid,issue_date.gte.2026-11-01)` devuelve exactamente las 2 emitidas (de cualquier fecha) y las 2 pagadas de noviembre. No omite facturas que cuenten. Las pagadas de meses futuros se traen, pero `computeKpis` las descarta. **No hay inyección:** el único valor interpolado sale de `Intl.DateTimeFormat` (solo dígitos y guiones) y no de la entrada del usuario.
- **Europe/Madrid:** los tests cubren el cambio de mes en CET (23:00Z), en CEST (22:00Z) y el de año. `monthOf` compara año y mes, así que noviembre de 2025 no se mezcla con el de 2026.
- **Céntimos:** se suman con `toCents` sobre `numeric` (string o number). No hay aritmética flotante en euros.
- **Sin sesión:** `/dashboard` responde 307 a `/login?next=%2Fdashboard`. Todas las cargas llaman a `getCurrentUser()`.
- `Exportar CSV` da 404 hasta la tarea 7 (aceptado).

**Limpieza:** se borraron los 3 productos y el borrador, y se anularon las emitidas 2026-0005 y 2026-0006 (con reposición de stock). **Queda la 2026-0007** (pagada, fecha 15-10-2026, 6,05 €, nota "QA8") porque `pagada` no admite anulación ni borrado (DOM-4). No altera el KPI de este mes. Los KPIs de QA_A volvieron a los valores iniciales (321 céntimos facturados, 0 pendiente, 0 de stock bajo). Servidor apagado y puerto 3254 libre.

## Notas (no bloqueantes)
- **UX-1 / móvil (revisión de clases, sin captura):** la cuadrícula es `grid-cols-2` en móvil y `lg:grid-cols-4` en escritorio. Las tarjetas llevan `min-w-0` y el valor `wrap-anywhere`, que está compilado (`overflow-wrap:anywhere`). Las cabeceras de la cabecera usan `flex-wrap` y las filas `truncate`/`shrink-0`. A 375 px cada tarjeta deja unos 133 px útiles: "1.210.012,09 €" en `text-xl` parte la línea (el "€" o algún dígito baja), pero no desborda. Con importes de 10 cifras quedará en dos líneas. Si se quiere evitar que corte el número, se puede usar `text-lg` en móvil.
- Desviaciones declaradas aceptadas: las funciones extra (`madridDate`, `monthStart`, `lowStockProducts`) tienen tests (TST-1). `page.tsx` tiene unas 400 líneas en un solo archivo, pero está bien seccionado.
- Las fechas por defecto de las facturas (`current_date` en la BD) se toman en la zona del servidor de Postgres (UTC). Entre las 00:00 y la 01:00/02:00 de Madrid del día 1, un borrador sin fecha explícita quedaría en el mes anterior. Esto no es de esta tarea: se anota para la 6/7.
- ALC-1 ✅ (solo los 3 archivos de la tarea). ALC-3 ✅. SEG-1 ✅. SEG-5 ✅ (errores vía `toUserMessage` y mensaje genérico). UX-3 ✅ (estados vacíos con CTA). UX-5 ✅.
