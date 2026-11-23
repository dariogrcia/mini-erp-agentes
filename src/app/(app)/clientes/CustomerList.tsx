import Link from "next/link";
import { ConfirmButton } from "@/components/ConfirmButton";
import { buttonClass } from "@/components/ui";
import { deleteCustomer } from "@/lib/actions/customers";
import type { CustomerFormData } from "./CustomerForm";

type CustomerListProps = {
  customers: CustomerFormData[];
  /** Link that opens the edit form for a customer (keeps the current search). */
  editHref: (id: string) => string;
  /** Id of the customer currently open in the form, if any. */
  editingId?: string;
};

/** Customers as cards on mobile/tablet and as a table on desktop (UX-1). */
export function CustomerList({ customers, editHref, editingId }: CustomerListProps) {
  return (
    <>
      <ul className="space-y-3 lg:hidden">
        {customers.map((customer) => (
          <li
            key={customer.id}
            className={`rounded-xl border bg-surface p-4 shadow-xs ${
              customer.id === editingId ? "border-brand-500" : "border-line"
            }`}
          >
            <p className="font-medium break-words text-ink">{customer.name}</p>
            <p className="mt-0.5 text-sm text-muted">{customer.tax_id ?? "Sin NIF"}</p>
            <ContactDetails customer={customer} className="mt-3 text-sm" />
            <div className="mt-3 flex items-start justify-end gap-2 border-t border-line pt-3">
              <Actions customer={customer} editHref={editHref} />
            </div>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-hidden rounded-2xl border border-line bg-surface shadow-xs lg:block">
        <table className="w-full table-fixed text-left text-sm">
          <thead className="border-b border-line bg-canvas text-xs font-semibold tracking-wide text-muted uppercase">
            <tr>
              <th scope="col" className="w-[32%] px-4 py-3">Nombre</th>
              <th scope="col" className="w-[16%] px-4 py-3">NIF / CIF</th>
              <th scope="col" className="px-4 py-3">Contacto</th>
              <th scope="col" className="w-56 px-4 py-3 text-right">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {customers.map((customer) => (
              <tr
                key={customer.id}
                className={customer.id === editingId ? "bg-brand-50/60" : "hover:bg-canvas/60"}
              >
                <td className="px-4 py-3 align-top">
                  <p className="font-medium break-words text-ink">{customer.name}</p>
                  {customer.address ? <p className="mt-0.5 break-words text-xs text-muted">{customer.address}</p> : null}
                </td>
                <td className="px-4 py-3 align-top font-mono text-xs break-all text-ink">
                  {customer.tax_id ?? <span className="font-sans text-muted">—</span>}
                </td>
                <td className="px-4 py-3 align-top">
                  <ContactDetails customer={customer} />
                </td>
                <td className="px-4 py-2 align-top">
                  <div className="flex items-start justify-end gap-1">
                    <Actions customer={customer} editHref={editHref} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ContactDetails({ customer, className = "" }: { customer: CustomerFormData; className?: string }) {
  if (!customer.email && !customer.phone) {
    return <p className={`text-muted ${className}`}>Sin datos de contacto</p>;
  }
  return (
    <div className={`space-y-0.5 ${className}`}>
      {customer.email ? (
        <p className="break-all">
          <a href={`mailto:${customer.email}`} className="rounded text-brand-700 hover:underline">
            {customer.email}
          </a>
        </p>
      ) : null}
      {customer.phone ? (
        <p>
          <a href={`tel:${customer.phone.replace(/[^\d+]/g, "")}`} className="rounded text-ink hover:underline">
            {customer.phone}
          </a>
        </p>
      ) : null}
    </div>
  );
}

function Actions({ customer, editHref }: { customer: CustomerFormData; editHref: (id: string) => string }) {
  return (
    <>
      <Link
        href={editHref(customer.id)}
        aria-label={`Editar ${customer.name}`}
        className={buttonClass("ghost", "sm")}
      >
        Editar
      </Link>
      <ConfirmButton
        action={deleteCustomer}
        fields={{ id: customer.id }}
        label="Eliminar"
        ariaLabel={`Eliminar ${customer.name}`}
        question={`¿Eliminar a ${customer.name}?`}
      />
    </>
  );
}
