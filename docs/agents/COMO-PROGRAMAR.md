# Cómo programar en Gestia (manual de Develop)

Este es el manual del subagente **Develop**, tanto si lo ejecuta Claude como si lo
ejecuta Codex. Describe **cómo** se escribe código aquí. Lo que se **exige** para
aprobar está en `DIRECTRICES-TESTING.md`.

## 1. Principios
1. **Lo simple primero.** Se usa un Server Component siempre que se pueda; un Client
   Component (`"use client"`) solo si hay interactividad real (estado, eventos).
2. **La lógica de negocio va fuera de la UI.** Cálculos, reglas y validación viven en
   `src/lib/domain/` como funciones puras, sin acceso a red ni a la BD, y con tests.
3. **El servidor manda.** Toda escritura pasa por una Server Action de
   `src/lib/actions/`, que valida con Zod, comprueba la sesión y llama a Supabase. El
   cliente nunca escribe directamente en la BD.
4. **La seguridad está en la BD.** RLS filtra por `owner_id = auth.uid()`. Aun así, la
   acción comprueba la sesión: es defensa en profundidad.
5. **Se hace solo la tarea.** Nada de refactors oportunistas ni dependencias nuevas
   sin que el plan lo diga.

## 2. Patrones del proyecto

### Cliente de Supabase
- Servidor: `createClient()` de `@/lib/supabase/server`, que es async porque usa `await cookies()`.
- Navegador: `createClient()` de `@/lib/supabase/client`. Solo se usa en Client
  Components y no para escribir.
- Nunca se crea un cliente fuera de esas dos factorías.

### Páginas con datos (Cache Components, D10)
Leer `cookies()`, `searchParams` o `params` fuera de un `<Suspense>` **rompe el build**.
Patrón obligatorio:
```tsx
export default function Page({ searchParams }: PageProps<"/clientes">) {
  return (
    <>
      <PageHeader title="Clientes" />            {/* static shell */}
      <Suspense fallback={<TableSkeleton />}>
        <CustomersList searchParams={searchParams} />  {/* pass the promise, don't await */}
      </Suspense>
    </>
  );
}

async function CustomersList({ searchParams }: { searchParams: PageProps<"/clientes">["searchParams"] }) {
  const { q } = await searchParams;
  await getCurrentUser();                 // DAL: redirects to /login if no session
  const supabase = await createClient();
  // ...query + render
}
```
- Nunca hay un `await` de sesión al nivel superior de un layout. Va dentro de un
  componente bajo `<Suspense>`.
- No se usa `"use cache"` con datos de Supabase (dependen de la cookie del usuario).

### Server Actions
```ts
"use server";
// 1) parse input with Zod  2) get user  3) query  4) revalidatePath  5) return result
export async function createCustomer(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = customerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Sesión caducada" };
  const { error } = await supabase.from("customers").insert({ ...parsed.data, owner_id: user.id });
  if (error) return { ok: false, message: toUserMessage(error) };
  revalidatePath("/clientes");
  return { ok: true };
}
```
- Devuelven siempre `ActionState` (`{ ok: boolean; message?: string; fieldErrors?: … }`).
  Solo lanzan una excepción con `redirect()`.
- Los errores de Postgres se traducen a un mensaje en español con `toUserMessage()`.
  Nunca se muestra el error crudo.
- Los formularios usan `useActionState` y muestran errores por campo y un estado
  pendiente (botón deshabilitado y texto "Guardando…").

### Dinero e IVA
- Se calcula en **céntimos enteros** (`number` entero) con las funciones de
  `src/lib/domain/money.ts`. Nunca se hace aritmética con decimales flotantes.
- Tipos de IVA válidos en España: 0, 4, 10 y 21 %.
- Por línea: `base = cantidad × precio` (exacta, porque la cantidad es entera y el
  precio está en céntimos); `iva = round_half_up(base × tipo / 100)`;
  `total = base + iva`. La factura suma bases, IVA y totales de sus líneas. La BD
  recalcula igual, y la BD es la fuente de verdad.

### Base de datos
- Cada cambio de esquema es una migración nueva en `supabase/migrations/`, con el
  formato `NNNN_descripcion.sql`. Nunca se edita una migración ya aplicada.
- Toda tabla nueva lleva `owner_id uuid not null default auth.uid()`, `enable row level
  security` y políticas separadas para select, insert, update y delete.
- **Las facturas y sus líneas solo se escriben mediante funciones SQL** (`rpc()`):
  `save_draft_invoice`, `issue_invoice`, `mark_invoice_paid` y `cancel_invoice`. Son
  `security definer`, con `set search_path = ''`, y comprueban
  `owner_id = auth.uid()` dentro. El rol `authenticated` no tiene permisos de
  insert/update sobre `invoices`, `invoice_lines` ni `invoice_counters`. Así ni la API
  pública puede saltarse las reglas de estados, totales o stock.
- Las funciones señalan los errores de negocio con `raise exception` y un código
  legible (`INVOICE_NOT_DRAFT`, `INVOICE_EMPTY`, `INSUFFICIENT_STOCK`…), que
  `toUserMessage()` traduce al español.

### UI
- Tailwind v4, mobile-first: el diseño base es para 375 px y se amplía con `sm:`/`md:`/`lg:`.
- Las tablas pasan a ser tarjetas en móvil (`hidden md:table` / `md:hidden`).
- Textos en español, con un tono claro y profesional. Fechas y moneda con `es-ES`.
- Accesibilidad mínima: cada `input` con su `label`, los botones con texto o
  `aria-label` y foco visible.
- Estados obligatorios en cada listado: vacío, error y carga si aplica.

## 3. Estilo de código
- TypeScript estricto: sin `any` y sin `@ts-ignore`. Los tipos de fila de la BD están
  en `src/lib/types.ts`.
- Nombres en inglés; textos visibles en español.
- Funciones pequeñas. Si un componente pasa de unas 150 líneas, se extrae una parte.
- Comentarios solo para explicar un *porqué* que no es obvio.

## 4. Antes de entregar
- [ ] `npm run verify` en verde.
- [ ] He repasado `DIRECTRICES-TESTING.md` punto por punto.
- [ ] No he tocado archivos fuera de la tarea (o lo justifico en el informe).
- [ ] No hay `console.log`, código comentado ni TODOs sin tarea asociada.

## 5. Lecciones aprendidas
<!-- El Orquestador añade aquí reglas nuevas cuando un fallo se repite (ver CLAUDE.md). -->
