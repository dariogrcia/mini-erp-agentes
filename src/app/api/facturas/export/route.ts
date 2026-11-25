import { toUserMessage } from "@/lib/actions/state";
import { invoicesToCsv, type InvoiceCsvRow } from "@/lib/domain/csv";
import { toCents } from "@/lib/domain/money";
import { createClient } from "@/lib/supabase/server";
import type { InvoiceRow } from "@/lib/types";

type ExportInvoice = Pick<InvoiceRow, "id" | "number" | "issue_date" | "subtotal" | "vat_total" | "total" | "status" | "customer_name" | "customer_tax_id">;

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" };

/** No user input: the owner is exclusively derived from the verified session. */
export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return Response.json({ message: "Tu sesión ha caducado. Vuelve a iniciar sesión." }, { status: 401, headers: PRIVATE_HEADERS });
  }

  const rows: InvoiceCsvRow[] = [];
  let lastId: string | undefined;
  // Keyset pagination avoids silently truncating the export at PostgREST's row limit.
  for (;;) {
    let query = supabase.from("invoices")
      .select("id, number, issue_date, subtotal, vat_total, total, status, customer_name, customer_tax_id")
      .eq("owner_id", user.id).neq("status", "draft").order("id").limit(500);
    if (lastId) query = query.gt("id", lastId);
    const { data, error } = await query.overrideTypes<ExportInvoice[], { merge: false }>();
    if (error) return Response.json({ message: toUserMessage(error) }, { status: 500, headers: PRIVATE_HEADERS });
    if (!data?.length) break;

    try {
      rows.push(...data.map((invoice) => ({
        number: invoice.number, issueDate: invoice.issue_date,
        customerName: invoice.customer_name ?? "", taxId: invoice.customer_tax_id,
        subtotalCents: toCents(invoice.subtotal), vatTotalCents: toCents(invoice.vat_total),
        totalCents: toCents(invoice.total), status: invoice.status,
      })));
    } catch {
      return Response.json({ message: toUserMessage(null) }, { status: 500, headers: PRIVATE_HEADERS });
    }
    lastId = data[data.length - 1].id;
  }

  // Paging needs a stable key (id); the accountant expects date + number order.
  // Numeric compare keeps "2026-10000" after "2026-9999" (D6).
  rows.sort((a, b) => a.issueDate.localeCompare(b.issueDate)
    || (a.number ?? "").localeCompare(b.number ?? "", "es", { numeric: true }));

  return new Response(invoicesToCsv(rows), {
    headers: {
      ...PRIVATE_HEADERS,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="facturas.csv"',
    },
  });
}
