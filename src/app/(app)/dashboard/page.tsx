import type { Metadata } from "next";
import Link from "next/link";
import { cache, Suspense, type ReactNode } from "react";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { buttonClass, FormMessage } from "@/components/ui";
import { toUserMessage } from "@/lib/actions/state";
import { getCurrentUser } from "@/lib/auth";
import { computeKpis, lowStockProducts, monthStart, type KpiInvoice, type Kpis } from "@/lib/domain/kpis";
import { formatEUR, toCents } from "@/lib/domain/money";
import { createClient } from "@/lib/supabase/server";
import type { InvoiceRow, ProductRow } from "@/lib/types";

export const metadata: Metadata = {
  title: "Panel",
};

const PAGE_SIZE = 1000;
const RECENT_LIMIT = 5;
const LOW_STOCK_HREF = "/productos?stock=bajo";
const NEW_CUSTOMER_HREF = "/clientes?nuevo=1";
const NEW_PRODUCT_HREF = "/productos?nuevo=1";
const NEW_INVOICE_HREF = "/facturas/nueva";
const LOAD_ERROR = "No se han podido cargar los datos del panel. Recarga la página.";

type StockItem = Pick<ProductRow, "id" | "sku" | "name" | "stock" | "low_stock_threshold">;
type RecentInvoice = Pick<InvoiceRow, "id" | "number" | "status" | "issue_date" | "total" | "customer_name"> & {
  customers: { name: string } | null;
};
type Loaded<T> = { data: T; error: string | null };

// ---- Data loaders: cache() dedupes them between the sections of one request. ----

const loadCustomerCount = cache(async (): Promise<Loaded<number>> => {
  await getCurrentUser();
  const supabase = await createClient();
  const { count, error } = await supabase.from("customers").select("id", { count: "exact", head: true });
  return { data: count ?? 0, error: error ? toUserMessage(error) : null };
});

// PostgREST cannot compare stock with its threshold, so every product is scanned in pages.
const loadProducts = cache(async (): Promise<Loaded<StockItem[]>> => {
  await getCurrentUser();
  const supabase = await createClient();
  const products: StockItem[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("products")
      .select("id, sku, name, stock, low_stock_threshold")
      .order("id")
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) return { data: [], error: toUserMessage(error) };
    products.push(...data);
    if (data.length < PAGE_SIZE) return { data: products, error: null };
  }
});

const loadRecentInvoices = cache(async (): Promise<Loaded<RecentInvoice[]>> => {
  await getCurrentUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invoices")
    .select("id, number, status, issue_date, total, customer_name, customers(name)")
    .order("issue_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(RECENT_LIMIT)
    .overrideTypes<RecentInvoice[], { merge: false }>();
  return { data: data ?? [], error: error ? toUserMessage(error) : null };
});

/** Only the invoices a KPI can use: every issued one and paid ones from this month on. */
async function loadKpis(): Promise<Loaded<Kpis | null>> {
  await getCurrentUser();
  const now = new Date();
  const supabase = await createClient();
  const invoices: KpiInvoice[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("invoices")
      .select("status, issue_date, total")
      .or(`status.eq.issued,and(status.eq.paid,issue_date.gte.${monthStart(now)})`)
      .order("id")
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) return { data: null, error: toUserMessage(error) };
    invoices.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  const [customers, products] = await Promise.all([loadCustomerCount(), loadProducts()]);
  const error = customers.error ?? products.error;
  if (error) return { data: null, error };
  try {
    return { data: computeKpis({ invoices, products: products.data, customerCount: customers.data, now }), error: null };
  } catch {
    return { data: null, error: LOAD_ERROR };
  }
}

// ---- Formatting ----

const dateFormatter = new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeZone: "UTC" });

/** "2026-11-23" → "23 nov 2026" (a date without time zone, so format it as UTC). */
function formatDate(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? isoDate : dateFormatter.format(date);
}

function formatTotal(value: InvoiceRow["total"]): string {
  try {
    return formatEUR(toCents(value));
  } catch {
    return "—";
  }
}

// ---- Page: static shell (D10); every section reads the session inside Suspense. ----

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        title="Panel"
        description="Tu facturación, cobros e inventario de un vistazo."
        actions={
          <>
            <Link href={NEW_INVOICE_HREF} className={buttonClass("primary")}>
              Nueva factura
            </Link>
            <Link href={NEW_CUSTOMER_HREF} className={buttonClass("secondary")}>
              Nuevo cliente
            </Link>
            <a href="/api/facturas/export" className={buttonClass("secondary")}>
              Exportar CSV
            </a>
          </>
        }
      />
      <div className="space-y-6">
        <Suspense fallback={null}>
          <GettingStarted />
        </Suspense>
        <Suspense fallback={<KpiSkeleton />}>
          <KpiSection />
        </Suspense>
        <div className="grid gap-6 lg:grid-cols-3">
          <Panel title="Últimas facturas" href="/facturas" linkLabel="Ver todas" className="lg:col-span-2">
            <Suspense fallback={<RowsSkeleton label="Cargando facturas" />}>
              <RecentInvoicesSection />
            </Suspense>
          </Panel>
          <Panel title="Stock bajo" href={LOW_STOCK_HREF} linkLabel="Ver todos">
            <Suspense fallback={<RowsSkeleton label="Cargando productos" />}>
              <LowStockSection />
            </Suspense>
          </Panel>
        </div>
      </div>
    </>
  );
}

/** Onboarding checklist, shown until the first invoice exists. */
async function GettingStarted() {
  const [customers, products, invoices] = await Promise.all([
    loadCustomerCount(),
    loadProducts(),
    loadRecentInvoices(),
  ]);
  if (customers.error || products.error || invoices.error || invoices.data.length > 0) return null;

  const steps = [
    { done: customers.data > 0, label: "Añade tu primer cliente", href: NEW_CUSTOMER_HREF },
    { done: products.data.length > 0, label: "Da de alta un producto", href: NEW_PRODUCT_HREF },
    { done: false, label: "Crea tu primera factura", href: NEW_INVOICE_HREF },
  ];
  return (
    <section aria-labelledby="getting-started" className="rounded-2xl border border-brand-100 bg-brand-50 p-5 sm:p-6">
      <h2 id="getting-started" className="text-base font-semibold text-brand-900">
        Primeros pasos
      </h2>
      <p className="mt-1 text-sm text-brand-900/80">En tres pasos tendrás tu primera factura lista para emitir.</p>
      <ol className="mt-4 grid gap-2 sm:grid-cols-3">
        {steps.map((step, index) => (
          <li key={step.href}>
            <Link
              href={step.href}
              className="flex h-full items-center gap-3 rounded-xl border border-brand-100 bg-surface px-4 py-3 text-sm font-medium text-ink shadow-xs hover:border-brand-500"
            >
              <span
                aria-hidden="true"
                className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  step.done ? "bg-brand-700 text-white" : "border border-brand-500 text-brand-700"
                }`}
              >
                {step.done ? "✓" : index + 1}
              </span>
              <span>
                {step.label}
                {step.done ? <span className="sr-only"> (hecho)</span> : null}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

async function KpiSection() {
  const { data: kpis, error } = await loadKpis();
  if (!kpis) return <FormMessage ok={false}>{error ?? LOAD_ERROR}</FormMessage>;

  return (
    <section aria-label="Indicadores" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      <KpiCard label="Facturado este mes" value={formatEUR(kpis.billedThisMonth)} hint="Emitidas y pagadas" href="/facturas" />
      <KpiCard
        label="Pendiente de cobro"
        value={formatEUR(kpis.pendingCollection)}
        hint="Facturas emitidas"
        href="/facturas?estado=issued"
      />
      <KpiCard label="Clientes" value={String(kpis.customerCount)} hint="En tu cartera" href="/clientes" />
      <KpiCard
        label="Stock bajo"
        value={String(kpis.lowStockCount)}
        hint={kpis.lowStockCount === 1 ? "Producto por reponer" : "Productos por reponer"}
        href={LOW_STOCK_HREF}
        warning={kpis.lowStockCount > 0}
      />
    </section>
  );
}

function KpiCard({ label, value, hint, href, warning = false }: {
  label: string; value: string; hint: string; href: string; warning?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex min-w-0 flex-col rounded-2xl border bg-surface p-4 shadow-xs transition hover:border-brand-500 sm:p-5 ${
        warning ? "border-amber-300" : "border-line"
      }`}
    >
      <span className="text-xs font-medium text-muted sm:text-sm">{label}</span>
      <span
        className={`mt-2 text-xl font-semibold tracking-tight wrap-anywhere sm:text-2xl ${warning ? "text-amber-800" : "text-ink"}`}
      >
        {value}
      </span>
      <span className="mt-1 text-xs text-muted">{hint}</span>
    </Link>
  );
}

function Panel({ title, href, linkLabel, className = "", children }: {
  title: string; href: string; linkLabel: string; className?: string; children: ReactNode;
}) {
  return (
    <section aria-label={title} className={`min-w-0 rounded-2xl border border-line bg-surface shadow-xs ${className}`}>
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        <Link href={href} className="rounded text-sm font-medium text-brand-700 hover:underline">
          {linkLabel}
        </Link>
      </div>
      {children}
    </section>
  );
}

async function RecentInvoicesSection() {
  const [invoices, customers] = await Promise.all([loadRecentInvoices(), loadCustomerCount()]);
  if (invoices.error) return <PanelError message={invoices.error} />;
  if (invoices.data.length === 0) {
    const hasCustomers = customers.data > 0;
    return (
      <PanelEmpty
        title="Todavía no has creado ninguna factura"
        description={hasCustomers ? "Crea un borrador y emítelo cuando esté listo." : "Primero añade un cliente al que facturar."}
        action={
          <Link href={hasCustomers ? NEW_INVOICE_HREF : NEW_CUSTOMER_HREF} className={buttonClass("primary", "sm")}>
            {hasCustomers ? "Crear la primera factura" : "Añadir un cliente"}
          </Link>
        }
      />
    );
  }

  return (
    <ul className="divide-y divide-line">
      {invoices.data.map((invoice) => (
        <li key={invoice.id}>
          <Link href={`/facturas/${invoice.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-canvas/60 sm:px-5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">
                {invoice.number ?? "Borrador"}
                <span className="font-normal text-muted"> · {formatDate(invoice.issue_date)}</span>
              </p>
              <p className="truncate text-sm text-muted">{(invoice.status === "draft" ? invoice.customers?.name : invoice.customer_name) ?? "Cliente no disponible"}</p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span className="text-sm font-semibold text-ink">{formatTotal(invoice.total)}</span>
              <StatusBadge status={invoice.status} />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

async function LowStockSection() {
  const products = await loadProducts();
  if (products.error) return <PanelError message={products.error} />;
  if (products.data.length === 0) {
    return (
      <PanelEmpty
        title="Sin productos todavía"
        description="Da de alta tu catálogo para vigilar las existencias."
        action={
          <Link href={NEW_PRODUCT_HREF} className={buttonClass("secondary", "sm")}>
            Añadir un producto
          </Link>
        }
      />
    );
  }

  let items: StockItem[];
  try {
    items = lowStockProducts(products.data, RECENT_LIMIT);
  } catch {
    return <PanelError message={LOAD_ERROR} />;
  }
  if (items.length === 0) {
    return <PanelEmpty title="Todo en orden" description="Ningún producto está por debajo de su umbral de stock." />;
  }

  return (
    <ul className="divide-y divide-line">
      {items.map((product) => (
        <li key={product.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">{product.name}</p>
            <p className="truncate font-mono text-xs text-muted">{product.sku}</p>
          </div>
          <div className="shrink-0 text-right">
            <span
              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                product.stock === 0 ? "bg-red-50 text-red-800" : "bg-amber-100 text-amber-900"
              }`}
            >
              {product.stock === 0 ? "Agotado" : `${product.stock} ud.`}
            </span>
            <p className="mt-1 text-xs text-muted">Umbral: {product.low_stock_threshold}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function PanelEmpty({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="px-4 py-8 text-center sm:px-5">
      <p className="text-sm font-semibold text-ink">{title}</p>
      <p className="mx-auto mt-1 max-w-xs text-sm text-muted">{description}</p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

function PanelError({ message }: { message: string }) {
  return (
    <div className="p-4 sm:p-5">
      <FormMessage ok={false}>{message}</FormMessage>
    </div>
  );
}

// ---- Skeletons ----

function KpiSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4" aria-busy="true" aria-label="Cargando indicadores">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-28 animate-pulse rounded-2xl bg-surface sm:h-32" />
      ))}
    </div>
  );
}

function RowsSkeleton({ label }: { label: string }) {
  return (
    <div className="space-y-3 p-4 sm:p-5" aria-busy="true" aria-label={label}>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-10 animate-pulse rounded-lg bg-canvas" />
      ))}
    </div>
  );
}
