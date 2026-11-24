import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { InvoiceEditor, type EditorCustomer, type InvoiceEditorInitial } from "@/components/InvoiceEditor";
import { PageHeader } from "@/components/PageHeader";
import { buttonClass, FormMessage } from "@/components/ui";
import { toUserMessage } from "@/lib/actions/state";
import { getCurrentUser } from "@/lib/auth";
import { toCents } from "@/lib/domain/money";
import { uuidSchema } from "@/lib/domain/validation";
import { createClient } from "@/lib/supabase/server";
import type { InvoiceLineRow, InvoiceRow, ProductRow } from "@/lib/types";

export const metadata: Metadata = { title: "Editar borrador" };

type EditProps = PageProps<"/facturas/[id]/editar">;
type ProductOption = Pick<ProductRow, "id" | "sku" | "name" | "unit_price" | "vat_rate">;
type Draft = InvoiceRow & { customers: EditorCustomer | null };
type DraftLine = InvoiceLineRow & { products: ProductOption | null };

export default function EditInvoicePage({ params }: EditProps) {
  return (
    <>
      <PageHeader title="Editar borrador" description="Revisa las líneas y guarda los cambios antes de emitir la factura." />
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-surface" aria-busy="true" aria-label="Cargando el editor" />}>
        <EditInvoiceSection params={params} />
      </Suspense>
    </>
  );
}

async function EditInvoiceSection({ params }: Pick<EditProps, "params">) {
  const id = uuidSchema.safeParse((await params).id).data;
  const user = await getCurrentUser();
  if (!id) return <UnavailableInvoice />;

  const supabase = await createClient();
  const { data: invoice, error } = await supabase.from("invoices").select("*, customers(id, name)")
    .eq("id", id).eq("owner_id", user.id).maybeSingle<Draft>();
  if (error) return <FormMessage ok={false}>{toUserMessage(error)}</FormMessage>;
  if (!invoice) return <UnavailableInvoice />;
  if (invoice.status !== "draft") {
    return (
      <div className="space-y-4">
        <FormMessage ok={false}>La factura ya no es un borrador y no se puede editar.</FormMessage>
        <Link href={`/facturas/${id}`} className={buttonClass("secondary")}>Volver al detalle</Link>
      </div>
    );
  }

  const [linesResult, customersResult, productsResult] = await Promise.all([
    supabase.from("invoice_lines").select("*, products(id, sku, name, unit_price, vat_rate)")
      .eq("invoice_id", id).eq("owner_id", user.id).order("position")
      .overrideTypes<DraftLine[], { merge: false }>(),
    supabase.from("customers").select("id, name").eq("owner_id", user.id).order("name").order("id").limit(1000),
    supabase.from("products").select("id, sku, name, unit_price, vat_rate")
      .eq("owner_id", user.id).order("name").order("id").limit(1000),
  ]);
  const loadError = linesResult.error ?? customersResult.error ?? productsResult.error;
  if (loadError) return <FormMessage ok={false}>{toUserMessage(loadError)}</FormMessage>;
  if (!invoice.customers) return <FormMessage ok={false}>No se ha podido cargar el cliente de la factura.</FormMessage>;

  const lines = linesResult.data ?? [];
  // Always include selected records, even when they are outside the first 1000 options.
  const customers = new Map((customersResult.data ?? []).map((customer) => [customer.id, customer]));
  customers.set(invoice.customers.id, invoice.customers);
  const products = new Map<string, ProductOption>((productsResult.data ?? []).map((product) => [product.id, product]));
  for (const line of lines) {
    if (line.products) products.set(line.products.id, line.products);
  }

  let initial: InvoiceEditorInitial;
  let editorProducts;
  try {
    initial = {
      id, customerId: invoice.customer_id, issueDate: invoice.issue_date,
      dueDate: invoice.due_date, notes: invoice.notes,
      lines: lines.map((line) => ({
        productId: line.product_id, description: line.description, quantity: line.quantity,
        unitPriceCents: toCents(line.unit_price), vatRate: line.vat_rate,
      })),
    };
    editorProducts = [...products.values()].map((product) => ({
      id: product.id, sku: product.sku, name: product.name,
      unitPriceCents: toCents(product.unit_price), vatRate: product.vat_rate,
    }));
  } catch {
    return <FormMessage ok={false}>No se han podido cargar los importes. Recarga la página e inténtalo de nuevo.</FormMessage>;
  }

  return <InvoiceEditor customers={[...customers.values()]} products={editorProducts} defaultIssueDate={invoice.issue_date} initial={initial} />;
}

function UnavailableInvoice() {
  return (
    <div className="space-y-4">
      <FormMessage ok={false}>La factura no existe o no tienes acceso a ella.</FormMessage>
      <Link href="/facturas" className={buttonClass("secondary")}>Volver a facturas</Link>
    </div>
  );
}
