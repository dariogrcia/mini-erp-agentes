import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/PageHeader";
import { buttonClass, EmptyState, FormMessage, inputClass } from "@/components/ui";
import { toUserMessage } from "@/lib/actions/state";
import { getCurrentUser } from "@/lib/auth";
import { ilikeAnyFilter, MAX_SEARCH_LENGTH, normalizeSearch } from "@/lib/domain/search";
import { newUuid } from "@/lib/domain/uuid";
import { uuidSchema } from "@/lib/domain/validation";
import { createClient } from "@/lib/supabase/server";
import { CustomerForm, type CustomerFormData } from "./CustomerForm";
import { CustomerList } from "./CustomerList";

export const metadata: Metadata = {
  title: "Clientes",
};

const LIST_PATH = "/clientes";
const LIST_LIMIT = 200;
const COLUMNS = "id, name, tax_id, email, phone, address, updated_at";

type SearchParams = PageProps<"/clientes">["searchParams"];

/** Builds a /clientes URL keeping the search term. */
function customersHref(params: { q?: string; edit?: string; nuevo?: boolean }): string {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.edit) search.set("edit", params.edit);
  if (params.nuevo) search.set("nuevo", "1");
  const query = search.toString();
  return query ? `${LIST_PATH}?${query}` : LIST_PATH;
}

function firstString(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

// Static shell (D10): the searchParams promise is passed down, not awaited here.
export default function CustomersPage({ searchParams }: PageProps<"/clientes">) {
  return (
    <>
      <PageHeader
        title="Clientes"
        description="Tu cartera de clientes: datos fiscales y de contacto para facturar."
        actions={
          <Link href={customersHref({ nuevo: true })} className={buttonClass("primary")}>
            Nuevo cliente
          </Link>
        }
      />
      <Suspense fallback={<CustomersSkeleton />}>
        <CustomersSection searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function CustomersSection({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const q = normalizeSearch(params.q);
  const editParam = firstString(params.edit);
  const isNew = firstString(params.nuevo) === "1";

  await getCurrentUser();
  const supabase = await createClient();

  let listQuery = supabase.from("customers").select(COLUMNS).order("name").order("id").limit(LIST_LIMIT + 1);
  const filter = ilikeAnyFilter(["name", "tax_id"], q);
  if (filter) listQuery = listQuery.or(filter);

  const editId = editParam === undefined ? undefined : uuidSchema.safeParse(editParam).data;
  const [list, editing] = await Promise.all([
    listQuery,
    editId ? supabase.from("customers").select(COLUMNS).eq("id", editId).maybeSingle() : null,
  ]);

  const closeHref = customersHref({ q });
  let panel = null;
  if (editParam !== undefined) {
    const customer: CustomerFormData | null = editing?.data ?? null;
    panel = customer ? (
      <CustomerForm key={customer.id} customer={customer} closeHref={closeHref} />
    ) : (
      <div className="space-y-3">
        <FormMessage ok={false}>El cliente no existe o ya se ha eliminado.</FormMessage>
        <Link href={closeHref} className={buttonClass("secondary", "sm")}>
          Volver al listado
        </Link>
      </div>
    );
  } else if (isNew) {
    panel = <CustomerForm key="new" newId={newUuid()} closeHref={closeHref} />;
  }

  const customers: CustomerFormData[] = list.data ?? [];
  const truncated = customers.length > LIST_LIMIT;

  return (
    <div className="space-y-6">
      {panel ? <div className="max-w-2xl">{panel}</div> : null}

      <SearchBar key={q} q={q} />

      {list.error ? (
        <FormMessage ok={false}>{toUserMessage(list.error)}</FormMessage>
      ) : customers.length === 0 ? (
        q ? (
          <EmptyState
            title="Ningún cliente coincide con la búsqueda"
            description={`No hay clientes cuyo nombre o NIF contenga «${q}».`}
            action={
              <Link href={LIST_PATH} className={buttonClass("secondary")}>
                Ver todos los clientes
              </Link>
            }
          />
        ) : (
          <EmptyState
            title="Aún no tienes clientes"
            description="Añade tu primer cliente para poder emitirle facturas."
            action={
              <Link href={customersHref({ nuevo: true })} className={buttonClass("primary")}>
                Añadir el primer cliente
              </Link>
            }
          />
        )
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted" aria-live="polite">
            {truncated
              ? `Se muestran los ${LIST_LIMIT} primeros clientes. Usa la búsqueda para encontrar el resto.`
              : customers.length === 1
                ? `1 cliente${q ? " encontrado" : ""}`
                : `${customers.length} clientes${q ? " encontrados" : ""}`}
          </p>
          <CustomerList
            customers={customers.slice(0, LIST_LIMIT)}
            editHref={(id) => customersHref({ q, edit: id })}
            editingId={editId}
          />
        </div>
      )}
    </div>
  );
}

function SearchBar({ q }: { q: string }) {
  return (
    <Form action={LIST_PATH} role="search" aria-label="Buscar clientes" className="flex flex-col gap-2 sm:flex-row">
      <label htmlFor="customers-q" className="sr-only">
        Buscar por nombre o NIF
      </label>
      <input
        id="customers-q"
        name="q"
        type="search"
        defaultValue={q}
        maxLength={MAX_SEARCH_LENGTH}
        placeholder="Buscar por nombre o NIF"
        className={`${inputClass} sm:max-w-sm`}
      />
      <div className="flex gap-2">
        <button type="submit" className={`${buttonClass("secondary")} flex-1 sm:flex-none`}>
          Buscar
        </button>
        {q ? (
          <Link href={LIST_PATH} className={`${buttonClass("ghost")} flex-1 sm:flex-none`}>
            Limpiar
          </Link>
        ) : null}
      </div>
    </Form>
  );
}

function CustomersSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Cargando clientes">
      <div className="h-10 animate-pulse rounded-lg bg-surface sm:max-w-sm" />
      <div className="space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-surface" />
        ))}
      </div>
    </div>
  );
}
