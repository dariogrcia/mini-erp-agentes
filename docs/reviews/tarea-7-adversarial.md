# Tarea 7 — Revisión adversarial (Codex)

- **Fecha:** 2026-11-25 · **Alcance:** diff de `tarea-7-ciclo-factura` contra `main`
  (`src/lib/actions/invoices.ts`, `src/app/(app)/facturas/`, `src/app/api/facturas/export/route.ts`).
- **Veredicto:** needs-attention (revisión estática, sin ejecutar pruebas).

## F1 · medio · Pérdida silenciosa de cambios entre pestañas
`src/app/(app)/facturas/[id]/editar/page.tsx:75-81`. El borrador se carga sin versión. Si dos
pestañas lo abren y A añade líneas y guarda, B (que solo cambia las notas) reenvía las líneas
antiguas y borra las de A. `save_draft_invoice` reemplaza todas las líneas y su bloqueo solo
serializa, no detecta contenido obsoleto. Los dos guardados acaban en éxito.
**Corrección:** versión del borrador comprobada bajo el bloqueo → **D13**.

## F2 · medio · Datos del destinatario mutables tras emitir
`src/app/api/facturas/export/route.ts:25-27` y el detalle imprimible leen nombre, NIF y
dirección de `customers` en cada acceso. Editar el cliente cambia facturas ya emitidas con el
mismo número.
**Corrección:** copia inmutable al emitir → **D14**.
