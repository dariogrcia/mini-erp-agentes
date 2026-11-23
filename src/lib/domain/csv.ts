import { STATUS_LABEL, type InvoiceStatus } from "./invoice";
import { fromCents } from "./money";

// Callers convert database numeric amounts to integer cents before exporting.
export type InvoiceCsvRow = {
  number: string | null;
  issueDate: string;
  customerName: string;
  taxId: string | null;
  subtotalCents: number;
  vatTotalCents: number;
  totalCents: number;
  status: InvoiceStatus;
};

function escapeCell(value: string): string {
  return /[";\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function neutralizeText(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

export function invoicesToCsv(rows: readonly InvoiceCsvRow[]): string {
  const header = "Número;Fecha;Cliente;NIF;Base;IVA;Total;Estado";
  const records = rows.map((row) => [
    ...[row.number ?? "", row.issueDate, row.customerName, row.taxId ?? ""].map(neutralizeText),
    fromCents(row.subtotalCents).replace(".", ","),
    fromCents(row.vatTotalCents).replace(".", ","),
    fromCents(row.totalCents).replace(".", ","), neutralizeText(STATUS_LABEL[row.status]),
  ].map(escapeCell).join(";"));
  return `\uFEFF${[header, ...records].join("\r\n")}\r\n`;
}
