import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/PageHeader";
import { buttonClass, FormMessage } from "@/components/ui";
import { toUserMessage } from "@/lib/actions/state";
import { getCurrentUser } from "@/lib/auth";
import { uuidSchema } from "@/lib/domain/validation";
import { createClient } from "@/lib/supabase/server";
import type { CustomerRow, InvoiceLineRow, InvoiceRow } from "@/lib/types";
import { InvoiceActions } from "./InvoiceActions";
import { InvoiceDocument } from "./InvoiceDocument";

export const metadata: Metadata = { title: "Factura" };

type DetailProps = PageProps<"/facturas/[id]">;
export type InvoiceDetail = InvoiceRow & {
  customers: Pick<CustomerRow, "name" | "tax_id" | "email" | "phone" | "address"> | null;
};

// Static shell: params, searchParams and session are only read below Suspense (D10).
export default function InvoicePage({ params, searchParams }: DetailProps) {
  return (
    <>
      <PageHeader title="Factura" actions={
        <Link href="/facturas" className={`${buttonClass("secondary")} print:hidden`}>Volver a facturas</Link>
      } />
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-surface" aria-busy="true" aria-label="Cargando la factura" />}>
        <InvoiceSection params={params} searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function InvoiceSection({ params, searchParams }: Pick<DetailProps, "params" | "searchParams">) {
  const [{ id: rawId }, { guardado }] = await Promise.all([params, searchParams]);
  const id = uuidSchema.safeParse(rawId).data;
  const user = await getCurrentUser();
  if (!id) return <FormMessage ok={false}>La factura no existe o no tienes acceso a ella.</FormMessage>;

  const supabase = await createClient();
  const { data: invoice, error } = await supabase.from("invoices")
    .select("*, customers(name, tax_id, email, phone, address)")
    .eq("id", id).eq("owner_id", user.id).maybeSingle<InvoiceDetail>();
  if (error) return <FormMessage ok={false}>{toUserMessage(error)}</FormMessage>;
  if (!invoice) return <FormMessage ok={false}>La factura no existe o no tienes acceso a ella.</FormMessage>;

  const { data: lines, error: linesError } = await supabase.from("invoice_lines").select("*")
    .eq("invoice_id", id).eq("owner_id", user.id).order("position")
    .overrideTypes<InvoiceLineRow[], { merge: false }>();
  if (linesError) return <FormMessage ok={false}>{toUserMessage(linesError)}</FormMessage>;

  return (
    <div className="min-w-0 space-y-6">
      {guardado === "1" && invoice.status === "draft" ? (
        <div className="print:hidden"><FormMessage ok>Borrador guardado</FormMessage></div>
      ) : null}
      <InvoiceActions id={id} status={invoice.status} />
      <InvoiceDocument invoice={invoice} lines={lines ?? []} />
    </div>
  );
}
