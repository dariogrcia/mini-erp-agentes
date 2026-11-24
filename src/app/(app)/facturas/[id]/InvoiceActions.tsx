"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { ConfirmButton } from "@/components/ConfirmButton";
import { buttonClass, FormMessage } from "@/components/ui";
import { cancelInvoice, deleteDraft, issueInvoice, markPaid } from "@/lib/actions/invoices";
import { initialActionState, type ActionState } from "@/lib/actions/state";
import { canTransition, type InvoiceStatus } from "@/lib/domain/invoice";
import { PrintButton } from "./PrintButton";

export function InvoiceActions({ id, status }: { id: string; status: InvoiceStatus }) {
  const [result, setResult] = useState<ActionState>(initialActionState);

  async function cancelAction(prev: ActionState, data: FormData) {
    const next = await cancelInvoice(prev, data);
    setResult(next.ok ? next : initialActionState);
    return next;
  }

  return (
    <div className="space-y-3 print:hidden">
      <div className="flex flex-wrap items-start gap-2">
        {canTransition(status, "issued") ? (
          <>
            <Link href={`/facturas/${id}/editar`} className={buttonClass("secondary")}>
              Editar
            </Link>
            <ActionForm id={id} action={issueInvoice} label="Emitir" pendingLabel="Emitiendo…" onResult={setResult} />
          </>
        ) : null}
        {canTransition(status, "paid") ? (
          <ActionForm id={id} action={markPaid} label="Marcar pagada" pendingLabel="Guardando…" onResult={setResult} />
        ) : null}
        <PrintButton />
        {canTransition(status, "cancelled") ? (
          <ConfirmButton
            action={cancelAction} fields={{ id }} label="Anular"
            question="¿Anular esta factura? Se repondrá el stock y no se podrá volver a emitir."
            pendingLabel="Anulando…"
          />
        ) : null}
        {canTransition(status, "deleted") ? (
          <ConfirmButton action={deleteDraft} fields={{ id }} label="Eliminar" question="¿Eliminar este borrador? No se puede deshacer." />
        ) : null}
      </div>
      {result.message ? <FormMessage ok={result.ok}>{result.message}</FormMessage> : null}
    </div>
  );
}

function ActionForm({ id, action, label, pendingLabel, onResult }: {
  id: string;
  action: (prev: ActionState, data: FormData) => Promise<ActionState>;
  label: string;
  pendingLabel: string;
  onResult: (result: ActionState) => void;
}) {
  const [, formAction, pending] = useActionState(async (prev: ActionState, data: FormData) => {
    const result = await action(prev, data);
    onResult(result);
    return result;
  }, initialActionState);

  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={id} />
      <button type="submit" disabled={pending} className={buttonClass()}>
        {pending ? pendingLabel : label}
      </button>
    </form>
  );
}
