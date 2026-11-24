import Link from "next/link";
import { StatusBadge } from "@/components/StatusBadge";
import { buttonClass, EmptyState } from "@/components/ui";
import { formatEUR, toCents } from "@/lib/domain/money";
import type { DbNumeric, InvoiceLineRow } from "@/lib/types";
import type { InvoiceDetail } from "./page";

function amount(value: DbNumeric) {
  try { return formatEUR(toCents(value)); } catch { return "—"; }
}

function date(isoDate: string) {
  return new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeZone: "UTC" })
    .format(new Date(`${isoDate}T00:00:00Z`));
}

/** Stored amounts are the source of truth; printing never recalculates an invoice. */
export function InvoiceDocument({ invoice, lines }: { invoice: InvoiceDetail; lines: InvoiceLineRow[] }) {
  const customer = invoice.customers;
  return (
    <article className="min-w-0 space-y-6 rounded-2xl border border-line bg-surface p-4 shadow-xs sm:p-6 print:rounded-none print:border-0 print:p-0 print:shadow-none">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold break-words">{invoice.number ?? "Borrador sin número"}</h2>
          <p className="mt-1 text-sm text-muted">Fecha de emisión: {date(invoice.issue_date)}</p>
          {invoice.due_date ? <p className="text-sm text-muted">Vencimiento: {date(invoice.due_date)}</p> : null}
        </div>
        <StatusBadge status={invoice.status} />
      </div>
      <section aria-labelledby="invoice-customer" className="space-y-1 break-words print:break-inside-avoid">
        <h3 id="invoice-customer" className="text-sm font-medium text-muted">Cliente</h3>
        <p className="font-semibold">{customer?.name ?? "Cliente no disponible"}</p>
        {customer?.tax_id ? <p className="text-sm">NIF/CIF: {customer.tax_id}</p> : null}
        {customer?.address ? <p className="text-sm whitespace-pre-wrap">{customer.address}</p> : null}
        {customer?.email ? <p className="text-sm">{customer.email}</p> : null}
        {customer?.phone ? <p className="text-sm">{customer.phone}</p> : null}
      </section>
      <section aria-labelledby="invoice-lines">
        <h3 id="invoice-lines" className="mb-3 font-semibold">Líneas</h3>
        {lines.length ? <InvoiceLines lines={lines} /> : (
          <EmptyState title="Esta factura no tiene líneas" description="Añade al menos una línea antes de emitirla." action={invoice.status === "draft" ? (
            <Link href={`/facturas/${invoice.id}/editar`} className={`${buttonClass("secondary")} print:hidden`}>Añadir líneas</Link>
          ) : undefined} />
        )}
      </section>
      <dl className="space-y-2 border-t border-line pt-4 text-sm sm:ml-auto sm:max-w-sm print:break-inside-avoid">
        <div className="flex justify-between gap-4"><dt>Base imponible</dt><dd>{amount(invoice.subtotal)}</dd></div>
        <div className="flex justify-between gap-4"><dt>IVA</dt><dd>{amount(invoice.vat_total)}</dd></div>
        <div className="flex justify-between gap-4 text-lg font-semibold"><dt>Total</dt><dd>{amount(invoice.total)}</dd></div>
      </dl>
      {invoice.notes ? (
        <section className="space-y-1 border-t border-line pt-4">
          <h3 className="text-sm font-medium text-muted">Notas</h3>
          <p className="text-sm break-words whitespace-pre-wrap">{invoice.notes}</p>
        </section>
      ) : null}
    </article>
  );
}

function InvoiceLines({ lines }: { lines: InvoiceLineRow[] }) {
  return (
    <>
      <ol className="space-y-3 md:hidden print:hidden">
        {lines.map((line) => (
          <li key={line.id} className="rounded-xl border border-line p-3">
            <p className="font-medium break-words">{line.description}</p>
            <dl className="mt-2 space-y-1 text-sm">
              <div className="flex justify-between gap-3"><dt>Cantidad</dt><dd>{line.quantity}</dd></div>
              <div className="flex justify-between gap-3"><dt>Precio unitario</dt><dd>{amount(line.unit_price)}</dd></div>
              <div className="flex justify-between gap-3"><dt>Base</dt><dd>{amount(line.line_base)}</dd></div>
              <div className="flex justify-between gap-3"><dt>IVA ({line.vat_rate} %)</dt><dd>{amount(line.line_vat)}</dd></div>
              <div className="flex justify-between gap-3 font-semibold"><dt>Total</dt><dd>{amount(line.line_total)}</dd></div>
            </dl>
          </li>
        ))}
      </ol>
      <table className="hidden w-full table-fixed text-left text-sm md:table print:table print:text-xs">
        <caption className="sr-only">Conceptos e importes de la factura</caption>
        <thead className="border-b border-line text-muted">
          <tr>
            <th scope="col" className="w-1/4 py-2 pr-2">Descripción</th>
            <th scope="col" className="w-[10%] px-1 py-2 text-right">Cant.</th>
            <th scope="col" className="px-1 py-2 text-right">Precio</th>
            <th scope="col" className="px-1 py-2 text-right">Base</th>
            <th scope="col" className="px-1 py-2 text-right">IVA</th>
            <th scope="col" className="py-2 pl-1 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.id} className="border-b border-line align-top break-words print:break-inside-avoid">
              <td className="py-3 pr-2">{line.description}</td>
              <td className="px-1 py-3 text-right">{line.quantity}</td>
              <td className="px-1 py-3 text-right">{amount(line.unit_price)}</td>
              <td className="px-1 py-3 text-right">{amount(line.line_base)}</td>
              <td className="px-1 py-3 text-right">{amount(line.line_vat)}<br /><span className="text-xs text-muted">{line.vat_rate} %</span></td>
              <td className="py-3 pl-1 text-right font-medium">{amount(line.line_total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
