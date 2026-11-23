import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { InvoiceEditor, type EditorCustomer, type EditorProduct } from "@/components/InvoiceEditor";
import { PageHeader } from "@/components/PageHeader";
import { buttonClass, EmptyState, FormMessage } from "@/components/ui";
import { toUserMessage } from "@/lib/actions/state";
import { getCurrentUser } from "@/lib/auth";
import { toCents } from "@/lib/domain/money";
import { createClient } from "@/lib/supabase/server";
import type { ProductRow } from "@/lib/types";

export const metadata: Metadata = {
  title: "Nueva factura",
};

/** Upper bounds for the selects; a small business stays far below them. */
const CUSTOMER_LIMIT = 1000;
const PRODUCT_LIMIT = 1000;

type ProductOption = Pick<ProductRow, "id" | "sku" | "name" | "unit_price" | "vat_rate">;

/** Today in Spain as YYYY-MM-DD (en-CA formats dates in ISO order). */
function todayInSpain(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
}

/** Products whose price cannot be parsed are left out of the select instead of breaking the page. */
function toEditorProducts(rows: ProductOption[]): EditorProduct[] {
  return rows.flatMap((row) => {
    try {
      return [{ id: row.id, sku: row.sku, name: row.name, unitPriceCents: toCents(row.unit_price), vatRate: row.vat_rate }];
    } catch {
      return [];
    }
  });
}

// Static shell (D10): the data and the session are read inside <Suspense>.
export default function NewInvoicePage() {
  return (
    <>
      <PageHeader
        title="Nueva factura"
        description="Se guarda como borrador: podrás revisarla antes de emitirla."
        actions={
          <Link href="/facturas" className={buttonClass("secondary")}>
            Volver a facturas
          </Link>
        }
      />
      <Suspense fallback={<EditorSkeleton />}>
        <NewInvoiceSection />
      </Suspense>
    </>
  );
}

async function NewInvoiceSection() {
  await getCurrentUser();
  const supabase = await createClient();
  const [customersResult, productsResult] = await Promise.all([
    supabase.from("customers").select("id, name").order("name").order("id").limit(CUSTOMER_LIMIT),
    supabase.from("products").select("id, sku, name, unit_price, vat_rate").order("name").order("id").limit(PRODUCT_LIMIT),
  ]);

  if (customersResult.error) return <FormMessage ok={false}>{toUserMessage(customersResult.error)}</FormMessage>;

  const customers: EditorCustomer[] = customersResult.data ?? [];
  if (customers.length === 0) {
    return (
      <EmptyState
        title="Primero necesitas un cliente"
        description="Las facturas se emiten a un cliente. Añade uno y vuelve aquí."
        action={
          <Link href="/clientes?nuevo=1" className={buttonClass("primary")}>
            Añadir un cliente
          </Link>
        }
      />
    );
  }

  const products = productsResult.error ? [] : toEditorProducts(productsResult.data ?? []);

  return (
    <div className="space-y-4">
      {productsResult.error ? (
        <FormMessage ok={false}>
          No se han podido cargar los productos. Puedes facturar conceptos libres o recargar la página.
        </FormMessage>
      ) : null}
      <InvoiceEditor customers={customers} products={products} defaultIssueDate={todayInSpain()} />
    </div>
  );
}

function EditorSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Cargando el editor">
      <div className="h-44 animate-pulse rounded-2xl bg-surface" />
      <div className="h-56 animate-pulse rounded-xl bg-surface" />
      <div className="h-28 animate-pulse rounded-2xl bg-surface sm:ml-auto sm:max-w-sm" />
    </div>
  );
}
