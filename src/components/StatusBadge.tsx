import { STATUS_LABEL, type InvoiceStatus } from "@/lib/domain/invoice";

const STATUS_CLASS: Record<InvoiceStatus, string> = {
  draft: "border-line bg-canvas text-muted",
  issued: "border-sky-200 bg-sky-50 text-sky-800",
  paid: "border-brand-100 bg-brand-50 text-brand-900",
  cancelled: "border-red-200 bg-red-50 text-red-800",
};

/** Invoice status pill with its Spanish label (D5). */
export function StatusBadge({ status }: { status: InvoiceStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${STATUS_CLASS[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}
