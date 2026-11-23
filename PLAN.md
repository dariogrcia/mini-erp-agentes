# PLAN.md — Gestia (mini-ERP)

## Resumen
Mini-ERP web para autónomos y pymes. Incluye un **CRM básico** (clientes), **inventario**
(productos con stock y alerta de stock bajo) y **facturación con IVA** (borrador →
emitida → pagada/anulada), con numeración correlativa y descuento de stock atómico al
emitir. Lo completan un panel con KPIs y la exportación CSV de facturas para la gestoría.
Responsive (móvil y escritorio), con login y datos aislados por usuario.

## Fuera de alcance (v1)
- Varios usuarios por empresa, roles o invitaciones.
- Generación de PDF en servidor: se usa una vista imprimible y "Guardar como PDF" del navegador.
- Facturas rectificativas, series múltiples, retenciones IRPF, multimoneda.
- Integraciones reales con Holded, A3 o VeriFactu (el CSV deja preparada la vía de integración).
- Registro público de usuarios: solo login (las cuentas se crean desde Supabase).

## Decisiones
- **D1 — Stack:** Next.js 16 App Router, TS estricto, Tailwind v4, Supabase (`@supabase/ssr`),
  Zod v4 y Vitest. Motivo: es gratuito, rápido de desplegar en Vercel y tiene auth y RLS
  incluidos.
- **D2 — Aislamiento:** un "tenant" equivale a un usuario. Todas las tablas llevan `owner_id`
  y RLS. Motivo: es lo más simple que es seguro por defecto.
- **D3 — Escritura de facturas:** solo mediante funciones SQL `security definer`
  (ver `docs/agents/COMO-PROGRAMAR.md` §2, Base de datos). Motivo: integridad de estados,
  totales y stock incluso frente a llamadas directas a la API REST de Supabase con la
  anon key.
- **D4 — Dinero:** céntimos enteros en TS y `numeric(12,2)` en la BD. Las cantidades son
  enteras (unidades). Fórmula en COMO-PROGRAMAR §2, Dinero e IVA.
- **D5 — Estados en la BD (en inglés):** `draft`, `issued`, `paid` y `cancelled`. En la
  UI se muestran como Borrador, Emitida, Pagada y Anulada.
- **D6 — Numeración:** `AAAA-NNNN` (mínimo 4 dígitos; a partir de 10000 crece) por usuario y año de la fecha de emisión, asignada al
  emitir (los borradores no tienen número). Se guarda en la tabla `invoice_counters`.
- **D7 — Rutas (en español):** `/login`, `/dashboard`, `/clientes`, `/productos`,
  `/facturas`, `/facturas/nueva`, `/facturas/[id]` y `/api/facturas/export`. La raíz
  `/` redirige a `/dashboard`.
- **D8 — Sin fuentes remotas:** se usa la pila de fuentes del sistema (sin
  `next/font/google`) para que el build no dependa de la red.
- **D9 — Mutaciones:** Server Actions en `src/lib/actions/<entidad>.ts`, con la forma
  descrita en COMO-PROGRAMAR §2.
- **D10 — Cache Components activado** (es el valor por defecto de Next 16.4 en
  `next.config.ts`): no se desactiva. Toda lectura de sesión, cookies, `searchParams` o
  `params` va dentro de un componente async envuelto en `<Suspense>` con un skeleton. La
  página exterior es síncrona (el shell estático). La sesión se lee con
  `getCurrentUser()` de `src/lib/auth.ts` (Data Access Layer, redirige a `/login`). Los
  datos de usuario no se cachean (`use cache` no se usa sobre datos de Supabase). Patrón en
  COMO-PROGRAMAR §2, Páginas con datos.
- **D11 — Concurrencia optimista** en `customers` y `products`: columna `updated_at timestamptz
  not null default now()`, que mantiene un trigger `before update` (migración `0003`). El
  formulario de edición envía el `updated_at` leído, y el UPDATE filtra
  `.eq("updated_at", leido)`. Si afecta a 0 filas pero el registro existe, se devuelve el
  conflicto "Este registro ha cambiado desde que lo abriste. Recarga para ver la versión
  actual." y se conservan los valores escritos. Motivo: revisión adversarial de la tarea 4
  (cambios perdidos entre pestañas).
- **D12 — Altas idempotentes**: el formulario de alta genera el `id` (UUID v4) al montarse y
  lo envía como campo oculto. La acción hace insert con ese id. Si recibe `23505` sobre la
  clave primaria **y** la fila con ese id ya es del usuario, lo trata como éxito. Motivo:
  revisión adversarial de la tarea 4 (duplicados al reintentar tras un fallo de red).
  *Limitación aceptada:* el reintento solo comprueba que la fila es del usuario, no su contenido
  (riesgo bajo, documentado en docs/reviews/tarea-4-ronda-2.md, F1).

## Esquema de datos (contrato de la tarea 1)
```
customers(id uuid pk default gen_random_uuid(), owner_id uuid not null default auth.uid()
          references auth.users on delete cascade, name text not null (1..120),
          tax_id text null, email text null, phone text null, address text null,
          created_at timestamptz not null default now())
products(id, owner_id, sku text not null (1..40), name text not null (1..120),
         unit_price numeric(12,2) not null >= 0, vat_rate smallint not null in (0,4,10,21),
         stock integer not null default 0 >= 0, low_stock_threshold integer not null default 5 >= 0,
         created_at; unique(owner_id, sku))
invoices(id, owner_id, customer_id uuid not null references customers on delete restrict,
         number text null, status text not null default 'draft' in (draft,issued,paid,cancelled),
         issue_date date not null default current_date, due_date date null (>= issue_date),
         notes text null, subtotal numeric(12,2) not null default 0, vat_total numeric(12,2)
         not null default 0, total numeric(12,2) not null default 0,
         created_at, issued_at timestamptz null, paid_at timestamptz null,
         cancelled_at timestamptz null; unique(owner_id, number))
invoice_lines(id, owner_id, invoice_id uuid not null references invoices on delete cascade,
         product_id uuid null references products on delete set null, position integer not null,
         description text not null (1..200), quantity integer not null > 0,
         unit_price numeric(12,2) not null >= 0, vat_rate smallint not null in (0,4,10,21),
         line_base numeric(12,2) not null, line_vat numeric(12,2) not null,
         line_total numeric(12,2) not null)
invoice_counters(owner_id uuid, year integer, last_number integer not null default 0,
         primary key(owner_id, year))
```
Índices: `customers(owner_id, name)`, `products(owner_id, name)`,
`invoices(owner_id, status, issue_date desc)` e `invoice_lines(invoice_id)`.

### Funciones SQL (todas `security definer`, `set search_path = ''`, `language plpgsql`)
Cada una empieza comprobando que `auth.uid()` no es null y que la factura pertenece a
`auth.uid()`. Si no, lanza `NOT_FOUND`. Se concede `execute` solo a `authenticated`.
- `save_draft_invoice(p_invoice_id uuid, p_customer_id uuid, p_issue_date date,
   p_due_date date, p_notes text, p_lines jsonb) returns uuid`
  - Si `p_invoice_id` es null, crea la factura. Si no, la actualiza, pero solo si está en
    `draft` (si no, `INVOICE_NOT_DRAFT`).
  - El cliente tiene que pertenecer al usuario (`NOT_FOUND`).
  - `p_lines` es un array de `{product_id?, description, quantity, unit_price, vat_rate}`.
    Si viene vacío, lanza `INVOICE_EMPTY`. Si `product_id` viene, el producto tiene que
    ser del usuario.
  - Borra las líneas previas y las reinserta con `position` = índice. Calcula
    `line_base = quantity*unit_price`, `line_vat = round(line_base*vat_rate/100, 2)` y
    `line_total = line_base + line_vat`, y actualiza los totales de la cabecera.
  - Devuelve el id.
- `issue_invoice(p_invoice_id uuid) returns text`
  - Bloquea la factura (`for update`). Tiene que estar en `draft` (`INVOICE_NOT_DRAFT`)
    y tener líneas (`INVOICE_EMPTY`).
  - Para cada línea con producto, bloquea el producto. Si `stock < quantity`, lanza
    `INSUFFICIENT_STOCK` con el sku en el `detail`. Si no, descuenta el stock.
  - Asigna el número con un upsert en `invoice_counters` sobre
    `(owner_id, extract(year from issue_date))`, con formato `AAAA-NNNN`
    (`lpad(n, 4, '0')`).
  - Pone `status='issued'` e `issued_at=now()`. Devuelve el número.
- `mark_invoice_paid(p_invoice_id uuid) returns void`: solo desde `issued`
  (`INVALID_TRANSITION`). Pone `paid_at`.
- `cancel_invoice(p_invoice_id uuid) returns void`: solo desde `issued`
  (`INVALID_TRANSITION`). Repone el stock de las líneas con producto que aún exista y pone
  `cancelled_at`.

### Permisos
- RLS activado en las 5 tablas.
- `customers` y `products`: políticas select/insert/update/delete con
  `owner_id = auth.uid()` para `authenticated`.
- `invoices`: políticas select y delete (este último solo si `status = 'draft'`) para
  el propietario; `revoke insert, update` a `authenticated` y `anon`.
- `invoice_lines`: solo select del propietario; `revoke insert, update, delete`.
- `invoice_counters`: sin políticas para clientes (solo lo tocan las funciones);
  `revoke all` a `authenticated` y `anon`.

## Tareas

### Tarea 1 — Migración SQL inicial
- **Estado:** hecha
- **Develop:** Codex · **Modo:** síncrono · **Crítica:** sí
- **Contexto:** base de todo. Aplica D2, D3, D5 y D6 y la sección "Esquema de datos".
- **Archivos:** crear `supabase/migrations/0001_init.sql`.
- **Contrato:** el SQL crea exactamente las tablas, índices, checks, políticas, revokes
  y funciones descritos arriba. Es idempotente en lo razonable (`create … if not exists`
  donde aplique). No hace falta que lo sea para las políticas.
- **No hacer:** no tocar `src/`. No crear datos de ejemplo. No usar `security invoker`
  en las 4 funciones de factura.
- **Verificación:** `npm run verify` sigue en verde. Testing revisa el SQL contra SEG-3,
  DOM-2 a DOM-5 y ALC. El Orquestador aplica la migración a Supabase y Testing prueba
  el aislamiento con dos usuarios.

### Tarea 2 — Lógica de dominio pura
- **Estado:** hecha
- **Develop:** Codex · **Modo:** síncrono · **Crítica:** sí (importes)
- **Contexto:** D4 y D5. Cálculos idénticos a los de la BD (DOM-2), para la vista previa
  en vivo del editor de facturas y para validar.
- **Archivos:** crear `src/lib/domain/money.ts`, `src/lib/domain/invoice.ts`,
  `src/lib/domain/validation.ts` y `src/lib/domain/csv.ts`, cada uno con su
  `*.test.ts` al lado.
- **Contrato:**
  - `money.ts`: `toCents(input: string | number): number` (acepta "12,50", "12.5" y 12.5;
    lanza un error si es inválido o tiene más de 2 decimales);
    `fromCents(c: number): string` ("12.50"); `formatEUR(c: number): string` (es-ES, "12,50 €");
    `vatOf(baseCents: number, rate: VatRate): number` (half-up).
    `VAT_RATES = [0, 4, 10, 21] as const` y `type VatRate`.
  - `invoice.ts`: `computeLine({quantity, unitPriceCents, vatRate}) → {base, vat, total}`;
    `computeTotals(lines) → {subtotal, vatTotal, total}` (lista vacía → ceros);
    `type InvoiceStatus = 'draft'|'issued'|'paid'|'cancelled'`;
    `STATUS_LABEL: Record<InvoiceStatus, string>`;
    `canTransition(from, to: InvoiceStatus | 'deleted'): boolean` (solo las de DOM-4);
    `isLowStock(stock, threshold): boolean` (`stock <= threshold`).
  - `validation.ts`: esquemas Zod `customerSchema` (name obligatorio, y tax_id, email,
    phone y address opcionales, donde una cadena vacía cuenta como `undefined`),
    `productSchema` (sku, name, unit_price como cadena que pasa por `toCents` y sale en
    céntimos, vat_rate de entre VAT_RATES con coerción, y stock y low_stock_threshold
    enteros ≥ 0 con coerción), `invoiceDraftSchema` (customer_id uuid, issue_date ISO,
    due_date opcional ≥ issue_date, notes opcional y `lines` con min 1 de
    `{product_id?: uuid, description (trim, 1..200), quantity int > 0, unit_price_cents int ≥ 0, vat_rate}`),
    `uuidSchema` e `isValidSpanishTaxId(s)` (NIF, NIE y CIF con dígito o letra de control).
  - `csv.ts`: `invoicesToCsv(rows)`. Separador `;`, BOM UTF-8, celdas de texto que empiezan por `= + - @ \t \r` prefijadas con `'` (anti-inyección de fórmulas), importes con coma decimal,
    escapa comillas, `;` y saltos de línea. Columnas: Número;Fecha;Cliente;NIF;Base;IVA;Total;Estado.
- **No hacer:** sin dependencias nuevas. Sin acceso a red ni a Supabase en estos archivos.
- **Verificación:** `npm run verify` en verde, con tests de casos límite (TST-2): el .5
  del redondeo, cero, negativos, cadenas inválidas, NIF, NIE y CIF válidos e inválidos,
  CSV con comillas y `;`, y las transiciones válidas e inválidas.

### Tarea 3 — Auth, clientes de Supabase y estructura de la app
- **Estado:** hecha
- **Develop:** Claude (`develop`) · **Modo:** síncrono · **Crítica:** sí
- **Contexto:** D1, D7, D8, D9 y D10. SEG-4. Next 16 usa `proxy.ts`.
- **Archivos:** crear `src/lib/supabase/server.ts`, `src/lib/supabase/client.ts`,
  `src/lib/auth.ts` (`getCurrentUser()`, D10), `src/proxy.ts`, `src/lib/actions/auth.ts`, `src/lib/actions/state.ts` (`ActionState` y
  `toUserMessage`: traduce los códigos de las RPC `NOT_FOUND`, `INVOICE_NOT_DRAFT`, `INVOICE_EMPTY`, `INSUFFICIENT_STOCK`, `INVALID_TRANSITION` e `INVALID_LINE`, y los errores de Postgres por `code`, como `23505` duplicado, `23503` FK y `23514` check, a español sin exponer nunca el mensaje crudo), `src/lib/types.ts`, `src/app/(auth)/login/page.tsx`,
  `src/app/(app)/layout.tsx` y `src/components/AppNav.tsx`. Modificar
  `src/app/layout.tsx` (D8, `lang="es"` y metadata), `src/app/page.tsx` (redirect) y
  `src/app/globals.css`.
- **Contrato:**
  - `proxy.ts` refresca la sesión (patrón `@supabase/ssr`). Si no hay sesión y la ruta no
    es `/login`, redirige a `/login?next=…`. Si hay sesión y la ruta es `/login`, redirige a
    `/dashboard`. Excluye los estáticos. En `/api/*` sin sesión responde 401 JSON (no redirige).
    El destino `next` se valida con `safeNextPath` (`src/lib/safe-redirect.ts`, lista blanca, SEG-7).
    **Una sección privada nueva debe añadirse a `ALLOWED_PATH`.**
  - El login (email y contraseña) muestra un error en español si las credenciales no son
    correctas. El logout es un botón en la navegación.
  - La navegación es una barra lateral en escritorio y una barra inferior en móvil, con
    Panel, Clientes, Productos y Facturas.
  - `(app)/layout.tsx` hace una segunda comprobación con `getUser()` y redirige a `/login`
    si falla.
  - En la página de login hay un recuadro con las credenciales demo (se rellenan en la tarea 9).
- **No hacer:** no crear páginas de entidades. No implementar registro público.
- **Verificación:** `npm run verify` en verde. Testing comprueba manualmente con
  `npm run dev`: `/dashboard` sin sesión redirige a `/login`.

### Tarea 4 — Clientes (CRM)
- **Estado:** hecha
- **Develop:** Claude (`develop`) · **Modo:** síncrono · **Crítica:** sí (datos personales)
- **Contexto:** D9, SEG-2, SEG-6, UX-1 a UX-6 y DOM-6.
- **Archivos:** `src/lib/actions/customers.ts`, `src/app/(app)/clientes/page.tsx`,
  `src/app/(app)/clientes/CustomerForm.tsx` y `src/components/ConfirmButton.tsx`.
- **Contrato:** listado con búsqueda por nombre o NIF (`?q=`, ilike), tabla en escritorio
  y tarjetas en móvil. Crear y editar en el mismo formulario (un panel o
  `?edit=<uuid>`). Eliminar con confirmación. Si el cliente tiene facturas (FK restrict),
  se muestra el mensaje "No se puede eliminar: tiene facturas asociadas". El NIF se valida
  con `isValidSpanishTaxId` si se informa.
- **No hacer:** no tocar productos ni facturas.
- **Verificación:** `npm run verify` en verde.

### Tarea 5 — Productos e inventario
- **Estado:** hecha
- **Develop:** Codex · **Modo:** síncrono · **Crítica:** no
- **Contexto:** mismo patrón que la tarea 4 (cópialo de `src/app/(app)/clientes/`): reutiliza
  `src/components/ui.tsx`, `PageHeader.tsx`, `ConfirmButton.tsx`, `src/lib/domain/search.ts`
  (`normalizeSearch`, `ilikeAnyFilter`) y `src/lib/domain/uuid.ts`. Aplica **D11 y D12** igual que
  `src/lib/actions/customers.ts`. `updated_at` se compara como **string tal cual llega de
  PostgREST**: nunca se convierte a `Date`, porque los microsegundos se pierden y darían un falso
  conflicto. D4 y DOM-6.
- **Archivos:** `src/lib/actions/products.ts`, `src/app/(app)/productos/page.tsx` y
  `src/app/(app)/productos/ProductForm.tsx`.
- **Contrato:** listado con búsqueda por nombre o SKU, filtro `?stock=bajo` e insignia
  "Stock bajo" (`isLowStock`). El precio se muestra con `formatEUR`. CRUD con
  confirmación al borrar. SKU duplicado → "Ya existe un producto con ese SKU".
- **No hacer:** no tocar clientes ni facturas.
- **Verificación:** `npm run verify` en verde.

### Tarea 6 — Facturas: listado y editor de borrador
- **Estado:** pendiente
- **Develop:** Claude (`develop`) · **Modo:** síncrono · **Crítica:** sí (importes)
- **Contexto:** D3, D4, D5 y D9. DOM-1 y DOM-2.
- **Archivos:** `src/lib/actions/invoices.ts` (`saveDraft`), `src/app/(app)/facturas/page.tsx`,
  `src/app/(app)/facturas/nueva/page.tsx`, `src/components/InvoiceEditor.tsx` (client) y
  `src/components/StatusBadge.tsx`.
- **Contrato:**
  - Listado con filtro por estado (`?estado=`), número, cliente, fecha y total.
  - El editor tiene cliente (select), fechas y líneas dinámicas (añadir y quitar). Al
    elegir un producto se rellenan descripción, precio e IVA. Muestra la vista previa en
    vivo de base, IVA y total con `computeLine`/`computeTotals`.
  - `saveDraft` valida con `invoiceDraftSchema` y llama a `rpc('save_draft_invoice')`,
    convirtiendo los céntimos a `fromCents`. Redirige a `/facturas/[id]`.
  - El editor también sirve para editar un borrador (prop `initial`).
- **No hacer:** no implementar emitir, pagar ni anular (tarea 7).
- **Verificación:** `npm run verify` en verde.

### Tarea 7 — Detalle de factura: ciclo de vida, impresión y CSV
- **Estado:** pendiente
- **Develop:** Codex · **Modo:** síncrono · **Crítica:** sí (stock e importes)
- **Contexto:** D3, D5 y D6. DOM-3, DOM-4 y UX-6.
- **Archivos:** `src/app/(app)/facturas/[id]/page.tsx`, ampliar
  `src/lib/actions/invoices.ts` (`issueInvoice`, `markPaid`, `cancelInvoice` y
  `deleteDraft`), `src/app/(app)/facturas/[id]/editar/page.tsx` y
  `src/app/api/facturas/export/route.ts`.
- **Contrato:**
  - El detalle muestra los datos del cliente, las líneas y los totales, en un diseño
    apto para imprimir (las clases `print:` ocultan la navegación).
  - Los botones dependen del estado (usar `canTransition`): Editar y Eliminar (borrador),
    Emitir (borrador), Marcar pagada y Anular (emitida) e Imprimir (siempre). Anular y
    Eliminar piden confirmación.
  - Errores de la RPC traducidos: `INSUFFICIENT_STOCK` → "Stock insuficiente de <sku>".
  - El export devuelve un CSV de `invoicesToCsv` con las facturas no borrador del usuario
    (`Content-Disposition: attachment; filename="facturas.csv"`), 401 sin sesión.
- **No hacer:** no modificar el SQL. Si falta algo en la BD, detente y avisa.
- **Verificación:** `npm run verify` en verde.

### Tarea 8 — Panel (dashboard)
- **Estado:** pendiente
- **Develop:** Claude (`develop`) · **Modo:** síncrono · **Crítica:** no
- **Archivos:** `src/app/(app)/dashboard/page.tsx`, `src/lib/domain/kpis.ts` y `kpis.test.ts`.
- **Contrato:** KPIs (facturado este mes = emitidas y pagadas por `issue_date`;
  pendiente de cobro = emitidas; número de clientes; productos con stock bajo), las 5
  últimas facturas, la lista de stock bajo y accesos rápidos (Nueva factura, Nuevo
  cliente, Exportar CSV). La agregación es una función pura en `kpis.ts`.
- **Verificación:** `npm run verify` en verde.

### Tarea 9 — Datos demo, despliegue y entrega
- **Estado:** pendiente
- **Develop:** Orquestador · **Crítica:** sí (secretos)
- **Archivos:** `scripts/seed-demo.mjs` (lee `SUPABASE_SERVICE_ROLE_KEY` del entorno, que
  **nunca** se versiona), `README.md`, `docs/ARCHITECTURE.md` y `docs/BITACORA.md`.
- **Contrato:** existe un usuario demo con datos realistas (8 clientes, 12 productos y unas
  10 facturas en varios estados). La app está desplegada en Vercel, es pública (sin
  Deployment Protection) y se ha comprobado en incógnito.
- **Verificación:** `npm run verify`, el login demo funciona en la URL de producción y
  `git grep` no encuentra claves.

## Registro
<!-- una línea por tarea cerrada: fecha, tarea, Develop, rondas de Testing, notas -->
- 2026-11-23 · T1 · Codex · 2 rondas y revisión adversarial · 5 fallos corregidos en `0002_hardening.sql` (aplicadas 0001 y 0002).
- 2026-11-23 · T2 · Codex · 2 rondas · 262 tests; 6 menores corregidos (CIF N/R, NIF K/L/M, fechas 1900–2999, `-0`, CSV anti-fórmulas `'`).
