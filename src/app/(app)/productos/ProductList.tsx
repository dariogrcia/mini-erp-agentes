import Form from "next/form";
import Link from "next/link";
import { ConfirmButton } from "@/components/ConfirmButton";
import { buttonClass, inputClass } from "@/components/ui";
import { deleteProduct } from "@/lib/actions/products";
import { isLowStock } from "@/lib/domain/invoice";
import { formatEUR, toCents } from "@/lib/domain/money";
import { MAX_SEARCH_LENGTH } from "@/lib/domain/search";
import type { ProductFormData } from "./ProductForm";

type ProductListProps = { products: ProductFormData[]; editHref: (id: string) => string; editingId?: string };

export function ProductList({ products, editHref, editingId }: ProductListProps) {
  return (
    <>
      <ul className="space-y-3 lg:hidden">
        {products.map((product) => (
          <li key={product.id} className={`rounded-xl border bg-surface p-4 shadow-xs ${
            product.id === editingId ? "border-brand-500" : "border-line"
          }`}>
            <ProductName product={product} />
            <p className="mt-3 break-words text-sm text-ink">
              {formatEUR(toCents(product.unit_price))} sin IVA · IVA {product.vat_rate} %
            </p>
            <div className="mt-2"><Stock product={product} /></div>
            <div className="mt-3 flex flex-wrap items-start justify-end gap-2 border-t border-line pt-3">
              <Actions product={product} editHref={editHref} />
            </div>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-hidden rounded-2xl border border-line bg-surface shadow-xs lg:block">
        <table className="w-full table-fixed text-left text-sm">
          <thead className="border-b border-line bg-canvas text-xs font-semibold tracking-wide text-muted uppercase">
            <tr>
              <th scope="col" className="px-4 py-3">Producto / SKU</th>
              <th scope="col" className="w-[20%] px-4 py-3">Precio sin IVA</th>
              <th scope="col" className="w-[20%] px-4 py-3">Stock</th>
              <th scope="col" className="w-48 px-4 py-3"><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {products.map((product) => (
              <tr key={product.id} className={product.id === editingId ? "bg-brand-50/60" : "hover:bg-canvas/60"}>
                <td className="px-4 py-3 align-top"><ProductName product={product} /></td>
                <td className="px-4 py-3 align-top break-words">
                  {formatEUR(toCents(product.unit_price))}
                  <p className="mt-0.5 text-xs text-muted">IVA {product.vat_rate} %</p>
                </td>
                <td className="px-4 py-3 align-top"><Stock product={product} /></td>
                <td className="px-4 py-2 align-top">
                  <div className="flex flex-wrap items-start justify-end gap-1"><Actions product={product} editHref={editHref} /></div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ProductName({ product }: { product: ProductFormData }) {
  return <>
    <p className="font-medium break-words text-ink">{product.name}</p>
    <p className="mt-0.5 font-mono text-xs break-all text-muted">{product.sku}</p>
  </>;
}

function Stock({ product }: { product: ProductFormData }) {
  return (
    <div className="space-y-1 break-words">
      <p className="text-sm text-ink">{product.stock} uds.</p>
      <p className="text-xs text-muted">Umbral: {product.low_stock_threshold}</p>
      {isLowStock(product.stock, product.low_stock_threshold) ? (
        <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">Stock bajo</span>
      ) : null}
    </div>
  );
}

function Actions({ product, editHref }: { product: ProductFormData; editHref: (id: string) => string }) {
  return <>
    <Link href={editHref(product.id)} aria-label={`Editar ${product.name}`} className={buttonClass("ghost", "sm")}>Editar</Link>
    <ConfirmButton action={deleteProduct} fields={{ id: product.id }} label="Eliminar"
      ariaLabel={`Eliminar ${product.name}`} question={`¿Eliminar ${product.name}?`} />
  </>;
}

export function ProductsSearch({ q, lowStock }: { q: string; lowStock: boolean }) {
  return (
    <Form action="/productos" role="search" aria-label="Buscar productos" className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <label htmlFor="products-q" className="sr-only">Buscar por nombre o SKU</label>
      <input id="products-q" name="q" type="search" defaultValue={q} maxLength={MAX_SEARCH_LENGTH}
        placeholder="Buscar por nombre o SKU" className={`${inputClass} sm:max-w-sm`} />
      <label className="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" name="stock" value="bajo" defaultChecked={lowStock} className="size-4 accent-brand-700" />
        Solo stock bajo
      </label>
      <div className="flex gap-2">
        <button type="submit" className={`${buttonClass("secondary")} flex-1 sm:flex-none`}>Buscar</button>
        {q || lowStock ? <Link href="/productos" className={`${buttonClass("ghost")} flex-1 sm:flex-none`}>Limpiar</Link> : null}
      </div>
    </Form>
  );
}

export function ProductsSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Cargando productos">
      <div className="h-10 animate-pulse rounded-lg bg-surface sm:max-w-sm" />
      <div className="space-y-3">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-surface" />)}
      </div>
    </div>
  );
}
