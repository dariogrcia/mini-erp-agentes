import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/PageHeader";
import { buttonClass, EmptyState, FormMessage } from "@/components/ui";
import { toUserMessage } from "@/lib/actions/state";
import { getCurrentUser } from "@/lib/auth";
import { isLowStock } from "@/lib/domain/invoice";
import { ilikeAnyFilter, normalizeSearch } from "@/lib/domain/search";
import { newUuid } from "@/lib/domain/uuid";
import { uuidSchema } from "@/lib/domain/validation";
import { createClient } from "@/lib/supabase/server";
import { ProductForm, type ProductFormData } from "./ProductForm";
import { ProductList, ProductsSearch, ProductsSkeleton } from "./ProductList";

export const metadata: Metadata = { title: "Productos" };
const LIST_PATH = "/productos";
const LIST_LIMIT = 200;
const COLUMNS = "id, sku, name, unit_price, vat_rate, stock, low_stock_threshold, updated_at";
type SearchParams = PageProps<"/productos">["searchParams"];

function productsHref(params: { q?: string; lowStock?: boolean; edit?: string; nuevo?: boolean }): string {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.lowStock) search.set("stock", "bajo");
  if (params.edit) search.set("edit", params.edit);
  if (params.nuevo) search.set("nuevo", "1");
  return search.size ? `${LIST_PATH}?${search}` : LIST_PATH;
}

function firstString(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

// PostgREST cannot compare two columns. Scan batches before limiting the matching
// rows so low-stock products beyond the first page are still found, with no SQL change.
async function loadProducts(supabase: Awaited<ReturnType<typeof createClient>>, q: string, lowStock: boolean) {
  const products: ProductFormData[] = [];
  const filter = ilikeAnyFilter(["name", "sku"], q);
  for (let offset = 0; products.length <= LIST_LIMIT;) {
    let query = supabase.from("products").select(COLUMNS).order("name").order("id")
      .range(offset, offset + LIST_LIMIT);
    if (filter) query = query.or(filter);
    const { data, error } = await query;
    if (error) return { products: [], error };
    const batch: ProductFormData[] = data;
    if (batch.length === 0) break;
    products.push(...batch.filter((product) => !lowStock || isLowStock(product.stock, product.low_stock_threshold)));
    offset += batch.length;
  }
  return { products, error: null };
}

export default function ProductsPage({ searchParams }: PageProps<"/productos">) {
  return (
    <>
      <PageHeader title="Productos" description="Tu catálogo, precios y existencias de un vistazo."
        actions={<Link href={productsHref({ nuevo: true })} className={buttonClass("primary")}>Nuevo producto</Link>} />
      <Suspense fallback={<ProductsSkeleton />}>
        <ProductsSection searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function ProductsSection({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const q = normalizeSearch(params.q);
  const lowStock = firstString(params.stock) === "bajo";
  const editParam = firstString(params.edit);
  const editId = editParam === undefined ? undefined : uuidSchema.safeParse(editParam).data;
  await getCurrentUser();
  const supabase = await createClient();
  const [list, editing] = await Promise.all([
    loadProducts(supabase, q, lowStock),
    editId ? supabase.from("products").select(COLUMNS).eq("id", editId).maybeSingle() : null,
  ]);
  const closeHref = productsHref({ q, lowStock });
  const product: ProductFormData | null = editing?.data ?? null;
  let panel = null;
  if (editParam !== undefined) {
    panel = product ? <ProductForm key={product.id} product={product} closeHref={closeHref} /> : (
      <div className="space-y-3">
        <FormMessage ok={false}>
          {editing?.error ? toUserMessage(editing.error) : "El producto no existe o ya se ha eliminado."}
        </FormMessage>
        <Link href={closeHref} className={buttonClass("secondary", "sm")}>Volver al listado</Link>
      </div>
    );
  } else if (firstString(params.nuevo) === "1") {
    panel = <ProductForm key="new" newId={newUuid()} closeHref={closeHref} />;
  }
  const filtered = Boolean(q || lowStock);
  const truncated = list.products.length > LIST_LIMIT;

  return (
    <div className="space-y-6">
      {panel ? <div className="max-w-2xl">{panel}</div> : null}
      <ProductsSearch key={`${q}:${lowStock}`} q={q} lowStock={lowStock} />
      {list.error ? <FormMessage ok={false}>{toUserMessage(list.error)}</FormMessage> : list.products.length === 0 ? (
        <EmptyState title={filtered ? "Ningún producto coincide con los filtros" : "Aún no tienes productos"}
          description={filtered ? "Prueba otra búsqueda o quita el filtro de stock bajo." : "Añade tu primer producto para gestionar sus existencias."}
          action={<Link href={filtered ? LIST_PATH : productsHref({ nuevo: true })}
            className={buttonClass(filtered ? "secondary" : "primary")}>
            {filtered ? "Ver todos los productos" : "Añadir el primer producto"}
          </Link>} />
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted" aria-live="polite">
            {truncated ? `Se muestran los ${LIST_LIMIT} primeros productos. Usa la búsqueda para encontrar el resto.`
              : `${list.products.length} ${list.products.length === 1 ? "producto" : "productos"}`}
          </p>
          <ProductList products={list.products.slice(0, LIST_LIMIT)} editingId={editId}
            editHref={(id) => productsHref({ q, lowStock, edit: id })} />
        </div>
      )}
    </div>
  );
}
