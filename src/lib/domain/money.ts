export const VAT_RATES = [0, 4, 10, 21] as const;
export type VatRate = (typeof VAT_RATES)[number];

// PostgreSQL numeric(12,2), expressed in cents.
export const MAX_CENTS = 999_999_999_999;

function assertCents(cents: number): void {
  if (!Number.isFinite(cents) || !Number.isSafeInteger(cents) || Math.abs(cents) > MAX_CENTS) {
    throw new Error("Importe inválido o fuera de rango");
  }
}

export function toCents(input: string | number): number {
  if (typeof input === "number" && !Number.isFinite(input)) {
    throw new Error("Importe inválido");
  }
  const match = /^([+-]?)(\d+)(?:[.,](\d{1,2}))?$/.exec(String(input).trim());
  if (!match) throw new Error("Introduce un importe con un máximo de dos decimales");

  // Parse the decimal digits directly; multiplying floating-point euros loses cents.
  const cents = Number(match[2]) * 100 + Number((match[3] ?? "").padEnd(2, "0"));
  assertCents(cents);
  return cents === 0 ? 0 : match[1] === "-" ? -cents : cents;
}

export function fromCents(c: number): string {
  assertCents(c);
  const absolute = Math.abs(c);
  return `${c < 0 ? "-" : ""}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}`;
}

const euroFormatter = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });

export function formatEUR(c: number): string {
  assertCents(c);
  return euroFormatter.format(c === 0 ? 0 : c / 100);
}

export function vatOf(baseCents: number, rate: VatRate): number {
  assertCents(baseCents);
  if (baseCents < 0 || !VAT_RATES.includes(rate)) throw new Error("Base o tipo de IVA inválido");
  // All intermediate integers remain below MAX_SAFE_INTEGER within numeric(12,2).
  return Math.floor((baseCents * rate + 50) / 100);
}
