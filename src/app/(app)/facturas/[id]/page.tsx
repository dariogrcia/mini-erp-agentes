import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { buttonClass, FormMessage } from "@/components/ui";
import { toUserMessage } from "@/lib/actions/state";
import { getCurrentUser } from "@/lib/auth";
import { formatEUR, toCents } from "@/lib/domain/money";
import { uuidSchema } from "@/lib/domain/validation";
import { createClient } from "@/lib/supabase/server";
import type { InvoiceRow } from "@/lib/types";

/*
 * Minimal placeholder so that saving a draft (task 6) lands on a real page.
 * Task 7 replaces this file with the full detail (lines, lifecycle, print).
 */

export const metadata: Metadata = {
  title: "Factura",
};

type Params = PageProps<"/facturas/[id]">["params"];
type SearchParams = PageProps<"/facturas/[id]">["searchParams"];

type InvoiceSummary = Pick<InvoiceRow, "id" | "number" | "status" | "subtotal" | "vat_total" | "total"> & {
  customers: { name: string } | null;
};

function formatAmount(value: InvoiceRow["total"]): string {
  try {
    return formatEUR(toCents(value));
  } catch {
    return "—";
  }
}

export default function InvoicePage({ params, searchParams }: PageProps<"/facturas/[id]">) {
  return (
    <>
      <PageHeader
        title="Factura"
        actions={
          <Link href="/facturas" className={buttonClass("secondary")}>
            Volver a facturas
          </Link>
        }
      />
      <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-surface" aria-busy="true" aria-label="Cargando la factura" />}>
        <InvoiceSection params={params} searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function InvoiceSection({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const [{ id: rawId }, { guardado }] = await Promise.all([params, searchParams]);
  const id = uuidSchema.safeParse(rawId).data;

  await getCurrentUser();
  if (!id) return <FormMessage ok={false}>La factura no existe o no tienes acceso a ella.</FormMessage>;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invoices")
    .select("id, number, status, subtotal, vat_total, total, customers(name)")
    .eq("id", id)
    .maybeSingle()
    // Many-to-one embed: PostgREST returns an object (the untyped client infers an array).
    .overrideTypes<InvoiceSummary, { merge: false }>();
  if (error) return <FormMessage ok={false}>{toUserMessage(error)}</FormMessage>;

  const invoice: InvoiceSummary | null = data;
  if (!invoice) return <FormMessage ok={false}>La factura no existe o no tienes acceso a ella.</FormMessage>;

  return (
    <div className="max-w-xl space-y-4">
      {guardado === "1" && invoice.status === "draft" ? <FormMessage ok>Borrador guardado</FormMessage> : null}
      <section className="rounded-2xl border border-line bg-surface p-4 shadow-xs sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-lg font-semibold text-ink">{invoice.number ?? "Borrador"}</p>
            <p className="mt-0.5 text-sm break-words text-muted">{invoice.customers?.name ?? "—"}</p>
          </div>
          <StatusBadge status={invoice.status} />
        </div>
        <dl className="mt-4 space-y-2 border-t border-line pt-4 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Base imponible</dt>
            <dd className="text-ink">{formatAmount(invoice.subtotal)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">IVA</dt>
            <dd className="text-ink">{formatAmount(invoice.vat_total)}</dd>
          </div>
          <div className="flex justify-between gap-4 text-base font-semibold">
            <dt className="text-ink">Total</dt>
            <dd className="text-ink">{formatAmount(invoice.total)}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
