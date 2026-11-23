import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { buttonClass, EmptyState, FormMessage } from "@/components/ui";
import { toUserMessage } from "@/lib/actions/state";
import { getCurrentUser } from "@/lib/auth";
import { STATUS_LABEL, type InvoiceStatus } from "@/lib/domain/invoice";
import { formatEUR, toCents } from "@/lib/domain/money";
import { createClient } from "@/lib/supabase/server";
import type { InvoiceRow } from "@/lib/types";

export const metadata: Metadata = {
  title: "Facturas",
};

const LIST_PATH = "/facturas";
const LIST_LIMIT = 200;
const STATUSES = Object.keys(STATUS_LABEL) as InvoiceStatus[];

type SearchParams = PageProps<"/facturas">["searchParams"];

type InvoiceListItem = Pick<InvoiceRow, "id" | "number" | "status" | "issue_date" | "total"> & {
  customers: { name: string } | null;
};

const dateFormatter = new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeZone: "UTC" });

/** "2026-11-23" → "23 nov 2026" (the date has no time zone, so format it as UTC). */
function formatDate(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? isoDate : dateFormatter.format(date);
}

/** numeric(12,2) from PostgREST → "12,50 €"; never shows a raw value if it cannot be parsed. */
function formatTotal(value: InvoiceRow["total"]): string {
  try {
    return formatEUR(toCents(value));
  } catch {
    return "—";
  }
}

/** Only the known statuses are accepted (D5); anything else means "all". */
function parseStatus(value: string | string[] | undefined): InvoiceStatus | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return STATUSES.find((status) => status === raw);
}

function invoicesHref(status?: InvoiceStatus): string {
  return status ? `${LIST_PATH}?estado=${status}` : LIST_PATH;
}

// Static shell (D10): the searchParams promise is passed down, not awaited here.
export default function InvoicesPage({ searchParams }: PageProps<"/facturas">) {
  return (
    <>
      <PageHeader
        title="Facturas"
        description="Borradores, facturas emitidas y su estado de cobro."
        actions={
          <>
            <a href="/api/facturas/export" className={buttonClass("secondary")}>
              Exportar CSV
            </a>
            <Link href={`${LIST_PATH}/nueva`} className={buttonClass("primary")}>
              Nueva factura
            </Link>
          </>
        }
      />
      <Suspense fallback={<InvoicesSkeleton />}>
        <InvoicesSection searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function InvoicesSection({ searchParams }: { searchParams: SearchParams }) {
  const status = parseStatus((await searchParams).estado);

  await getCurrentUser();
  const supabase = await createClient();

  let query = supabase
    .from("invoices")
    .select("id, number, status, issue_date, total, customers(name)")
    .order("issue_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT + 1);
  if (status) query = query.eq("status", status);
  // Many-to-one embed: PostgREST returns an object (the untyped client infers an array).
  const { data, error } = await query.overrideTypes<InvoiceListItem[], { merge: false }>();

  const invoices: InvoiceListItem[] = data ?? [];
  const truncated = invoices.length > LIST_LIMIT;

  return (
    <div className="space-y-6">
      <StatusFilter current={status} />

      {error ? (
        <FormMessage ok={false}>{toUserMessage(error)}</FormMessage>
      ) : invoices.length === 0 ? (
        status ? (
          <EmptyState
            title={`No hay facturas en estado «${STATUS_LABEL[status]}»`}
            action={
              <Link href={LIST_PATH} className={buttonClass("secondary")}>
                Ver todas las facturas
              </Link>
            }
          />
        ) : (
          <EmptyState
            title="Aún no tienes facturas"
            description="Crea un borrador, revísalo y emítelo cuando esté listo."
            action={
              <Link href={`${LIST_PATH}/nueva`} className={buttonClass("primary")}>
                Nueva factura
              </Link>
            }
          />
        )
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted" aria-live="polite">
            {truncated
              ? `Se muestran las ${LIST_LIMIT} facturas más recientes.`
              : invoices.length === 1
                ? "1 factura"
                : `${invoices.length} facturas`}
          </p>
          <InvoiceList invoices={invoices.slice(0, LIST_LIMIT)} />
        </div>
      )}
    </div>
  );
}

function StatusFilter({ current }: { current?: InvoiceStatus }) {
  const options: { label: string; status?: InvoiceStatus }[] = [
    { label: "Todas" },
    ...STATUSES.map((status) => ({ label: STATUS_LABEL[status], status })),
  ];
  return (
    <nav aria-label="Filtrar por estado">
      <ul className="flex flex-wrap gap-2">
        {options.map((option) => {
          const active = option.status === current;
          return (
            <li key={option.label}>
              <Link
                href={invoicesHref(option.status)}
                aria-current={active ? "page" : undefined}
                className={`inline-flex h-9 items-center rounded-full border px-3 text-sm font-medium transition ${
                  active ? "border-brand-700 bg-brand-700 text-white" : "border-line bg-surface text-ink hover:bg-canvas"
                }`}
              >
                {option.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function invoiceTitle(invoice: InvoiceListItem): string {
  return invoice.number ?? "Borrador";
}

/** Cards on mobile/tablet, table on desktop (UX-1). */
function InvoiceList({ invoices }: { invoices: InvoiceListItem[] }) {
  return (
    <>
      <ul className="space-y-3 lg:hidden">
        {invoices.map((invoice) => (
          <li key={invoice.id}>
            <Link
              href={`${LIST_PATH}/${invoice.id}`}
              className="block rounded-xl border border-line bg-surface p-4 shadow-xs hover:border-brand-500"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium text-ink">{invoiceTitle(invoice)}</p>
                <StatusBadge status={invoice.status} />
              </div>
              <p className="mt-1 text-sm break-words text-muted">{invoice.customers?.name ?? "Cliente eliminado"}</p>
              <div className="mt-3 flex items-end justify-between gap-3 border-t border-line pt-3 text-sm">
                <span className="text-muted">{formatDate(invoice.issue_date)}</span>
                <span className="font-semibold text-ink">{formatTotal(invoice.total)}</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-hidden rounded-2xl border border-line bg-surface shadow-xs lg:block">
        <table className="w-full table-fixed text-left text-sm">
          <thead className="border-b border-line bg-canvas text-xs font-semibold tracking-wide text-muted uppercase">
            <tr>
              <th scope="col" className="w-36 px-4 py-3">Número</th>
              <th scope="col" className="px-4 py-3">Cliente</th>
              <th scope="col" className="w-36 px-4 py-3">Fecha</th>
              <th scope="col" className="w-36 px-4 py-3 text-right">Total</th>
              <th scope="col" className="w-32 px-4 py-3">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {invoices.map((invoice) => (
              <tr key={invoice.id} className="hover:bg-canvas/60">
                <td className="px-4 py-3">
                  <Link href={`${LIST_PATH}/${invoice.id}`} className="rounded font-medium text-brand-700 hover:underline">
                    {invoiceTitle(invoice)}
                  </Link>
                </td>
                <td className="px-4 py-3 break-words text-ink">{invoice.customers?.name ?? "Cliente eliminado"}</td>
                <td className="px-4 py-3 text-muted">{formatDate(invoice.issue_date)}</td>
                <td className="px-4 py-3 text-right font-medium text-ink">{formatTotal(invoice.total)}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={invoice.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function InvoicesSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Cargando facturas">
      <div className="flex flex-wrap gap-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-9 w-20 animate-pulse rounded-full bg-surface" />
        ))}
      </div>
      <div className="space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-surface" />
        ))}
      </div>
    </div>
  );
}
