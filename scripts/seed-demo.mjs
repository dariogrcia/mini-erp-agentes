// Seed the demo account with realistic data (tarea 9).
//
// Usage: node --env-file=.env.local scripts/seed-demo.mjs
//
// Required env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
// SUPABASE_SERVICE_ROLE_KEY, DEMO_EMAIL, DEMO_PASSWORD.
// The service_role key is only used here to create/reset the demo user and wipe its
// rows; it must never be committed nor used in src/. Customers and products are
// inserted as the demo user (RLS), and invoices go through the same SQL functions the
// app uses, so numbering, totals and stock stay consistent.
//
// Re-running is safe: it resets the demo user's data and seeds it again. An existing user is
// only reset if it carries `app_metadata.demo = true` (set when the script creates it), so a
// wrong DEMO_EMAIL can never wipe a real account. `--adopt` marks an existing user as demo.

import { createClient } from "@supabase/supabase-js";

const REQUIRED = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "DEMO_EMAIL",
  "DEMO_PASSWORD",
];
const missing = REQUIRED.filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error(`Faltan variables de entorno: ${missing.join(", ")}`);
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const email = process.env.DEMO_EMAIL.trim().toLowerCase();
const password = process.env.DEMO_PASSWORD;
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, noSession);
const demo = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, noSession);

function check(error, step) {
  if (error) {
    console.error(`Error en "${step}": ${error.message}${error.details ? ` (${error.details})` : ""}`);
    process.exit(1);
  }
}

// --- Data -------------------------------------------------------------------------

const CUSTOMERS = [
  { key: "taller", name: "Talleres Mecánicos Ruiz S.L.", tax_id: "B41562836", email: "administracion@talleresruiz.es", phone: "954 21 87 30", address: "Polígono Store, C/ Ingeniería 14, 41008 Sevilla" },
  { key: "cafe", name: "Cafetería La Alameda", tax_id: "B91234567", email: "pedidos@cafelaalameda.es", phone: "955 63 12 08", address: "Alameda de Hércules 22, 41002 Sevilla" },
  { key: "clinica", name: "Clínica Dental Sonrisa C.B.", tax_id: "E90876541", email: "gerencia@clinicasonrisa.es", phone: "954 98 44 15", address: "Av. de la Buhaira 31, 41018 Sevilla" },
  { key: "lucia", name: "Lucía Fernández Ortega", tax_id: "28765432E", email: "lucia.fernandez@correo.es", phone: "612 345 678", address: "C/ Feria 87, 3º B, 41003 Sevilla" },
  { key: "construcciones", name: "Construcciones Guadalquivir S.A.", tax_id: "A41987652", email: "compras@cguadalquivir.es", phone: "954 77 30 90", address: "C/ Astronomía 1, Torre 3, 41015 Sevilla" },
  { key: "gestoria", name: "Gestoría Morales y Asociados S.L.", tax_id: "B90345679", email: "info@gestoriamorales.es", phone: "954 50 26 71", address: "C/ Asunción 54, 41011 Sevilla" },
  { key: "hotel", name: "Hotel Triana Plaza S.L.", tax_id: "B41239872", email: "mantenimiento@trianaplaza.es", phone: "954 33 61 00", address: "C/ San Jacinto 12, 41010 Sevilla" },
  { key: "javier", name: "Javier Moreno Díaz", tax_id: "X1234567L", email: "javier.moreno@correo.es", phone: "689 012 345", address: "C/ Betis 40, 41010 Sevilla" },
];

// unit_price in euros (string, 2 decimals). Initial stock is chosen so that, after the
// issued invoices, the dashboard shows a few products at or under their low-stock threshold.
const PRODUCTS = [
  { key: "portatil", sku: "INF-PORT-14", name: "Portátil 14\" i5 16 GB", unit_price: "749.00", vat_rate: 21, stock: 9, low_stock_threshold: 3 },
  { key: "monitor", sku: "INF-MON-27", name: "Monitor 27\" QHD", unit_price: "239.90", vat_rate: 21, stock: 14, low_stock_threshold: 4 },
  { key: "teclado", sku: "INF-TEC-INAL", name: "Teclado y ratón inalámbricos", unit_price: "39.50", vat_rate: 21, stock: 30, low_stock_threshold: 8 },
  { key: "router", sku: "RED-ROUT-AX", name: "Router Wi-Fi 6 AX3000", unit_price: "129.00", vat_rate: 21, stock: 7, low_stock_threshold: 3 },
  { key: "cable", sku: "RED-CAB-C6", name: "Cable de red Cat6 (caja 305 m)", unit_price: "94.75", vat_rate: 21, stock: 6, low_stock_threshold: 2 },
  { key: "ssd", sku: "INF-SSD-1TB", name: "Disco SSD NVMe 1 TB", unit_price: "84.90", vat_rate: 21, stock: 5, low_stock_threshold: 5 },
  { key: "toner", sku: "CON-TON-HP", name: "Tóner negro compatible HP 59A", unit_price: "42.00", vat_rate: 21, stock: 12, low_stock_threshold: 6 },
  { key: "papel", sku: "CON-PAP-A4", name: "Papel A4 80 g (caja 5 paquetes)", unit_price: "24.60", vat_rate: 21, stock: 40, low_stock_threshold: 10 },
  { key: "sai", sku: "ELE-SAI-1500", name: "SAI 1500 VA", unit_price: "189.00", vat_rate: 21, stock: 4, low_stock_threshold: 2 },
  { key: "libro", sku: "LIB-MAN-OFI", name: "Manual de ofimática (libro)", unit_price: "19.90", vat_rate: 4, stock: 25, low_stock_threshold: 5 },
  { key: "mantenimiento", sku: "SRV-MANT-H", name: "Hora de soporte técnico", unit_price: "45.00", vat_rate: 21, stock: 999, low_stock_threshold: 0 },
  { key: "formacion", sku: "SRV-FORM-ONL", name: "Curso online de ciberseguridad (exento)", unit_price: "150.00", vat_rate: 0, stock: 100, low_stock_threshold: 0 },
];

// Lines: [productKey, quantity] or { description, quantity, unit_price, vat_rate } for
// free-text lines. Status is the final state; invoices are issued in issue_date order so
// numbers are correlative by date.
const INVOICES = [
  { customer: "construcciones", issue: "2026-09-03", due: "2026-10-03", status: "paid", notes: "Equipamiento oficina de obra.", lines: [["portatil", 3], ["monitor", 3], ["teclado", 3]] },
  { customer: "taller", issue: "2026-09-15", due: "2026-10-15", status: "paid", lines: [["router", 1], ["cable", 1], ["mantenimiento", 4]] },
  { customer: "clinica", issue: "2026-09-28", due: "2026-10-28", status: "paid", lines: [["sai", 2], ["ssd", 2], ["mantenimiento", 3]] },
  { customer: "lucia", issue: "2026-10-06", due: "2026-10-20", status: "paid", lines: [["libro", 2], ["formacion", 1]] },
  { customer: "hotel", issue: "2026-10-14", due: "2026-11-13", status: "cancelled", notes: "Anulada: el cliente cambió el pedido.", lines: [["router", 3], ["cable", 2]] },
  { customer: "hotel", issue: "2026-10-16", due: "2026-11-15", status: "issued", notes: "Sustituye al pedido anulado.", lines: [["router", 2], ["cable", 1], ["mantenimiento", 6]] },
  { customer: "gestoria", issue: "2026-10-30", due: "2026-11-29", status: "issued", lines: [["toner", 8], ["papel", 6], ["teclado", 2]] },
  { customer: "cafe", issue: "2026-11-10", due: "2026-12-10", status: "issued", lines: [["portatil", 1], { description: "Instalación TPV y configuración de red", quantity: 1, unit_price: "180.00", vat_rate: 21 }] },
  { customer: "construcciones", issue: "2026-11-18", due: "2026-12-18", status: "issued", lines: [["portatil", 2], ["ssd", 2], ["monitor", 2]] },
  { customer: "javier", issue: "2026-11-24", due: null, status: "draft", lines: [["monitor", 1], ["teclado", 1]] },
  { customer: "clinica", issue: "2026-11-25", due: null, status: "draft", notes: "Pendiente de confirmar cantidades.", lines: [["toner", 4], ["mantenimiento", 2]] },
];

// --- 1. Demo user (admin) -----------------------------------------------------------

async function findUserByEmail(target) {
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    check(error, "listar usuarios");
    const found = data.users.find((user) => user.email?.toLowerCase() === target);
    if (found) return found;
    if (data.users.length < 200) return null;
  }
}

const adopt = process.argv.includes("--adopt");
let user = await findUserByEmail(email);
if (user) {
  if (user.app_metadata?.demo !== true && !adopt) {
    console.error(`${email} existe pero no está marcado como cuenta demo. No se toca. Usa --adopt si es la demo.`);
    process.exit(1);
  }
  const { error } = await admin.auth.admin.updateUserById(user.id, {
    password, email_confirm: true, app_metadata: { ...user.app_metadata, demo: true },
  });
  check(error, "actualizar usuario demo");
  console.log(`Usuario demo existente: ${email}. Reiniciando sus datos…`);
} else {
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, app_metadata: { demo: true },
  });
  check(error, "crear usuario demo");
  user = data.user;
  console.log(`Usuario demo creado: ${email}`);
}

// --- 2. Reset the demo user's rows (admin, scoped to owner_id) ------------------------

// Invoices first: invoices.customer_id is ON DELETE RESTRICT; lines cascade.
for (const table of ["invoices", "customers", "products", "invoice_counters"]) {
  const { error } = await admin.from(table).delete().eq("owner_id", user.id);
  check(error, `vaciar ${table}`);
}

// --- 3. Seed as the demo user (RLS + SQL functions) -----------------------------------

const { error: signInError } = await demo.auth.signInWithPassword({ email, password });
check(signInError, "iniciar sesión como demo");

function withoutKey(row) {
  const copy = { ...row };
  delete copy.key;
  return copy;
}

const { data: customerRows, error: customersError } = await demo
  .from("customers")
  .insert(CUSTOMERS.map(withoutKey))
  .select("id, name");
check(customersError, "insertar clientes");
const customerId = Object.fromEntries(
  CUSTOMERS.map((customer) => [customer.key, customerRows.find((row) => row.name === customer.name).id]),
);

const { data: productRows, error: productsError } = await demo
  .from("products")
  .insert(PRODUCTS.map(withoutKey))
  .select("id, sku");
check(productsError, "insertar productos");
const productByKey = Object.fromEntries(
  PRODUCTS.map((product) => [product.key, { ...product, id: productRows.find((row) => row.sku === product.sku).id }]),
);

function toLine(line) {
  if (!Array.isArray(line)) return line;
  const [key, quantity] = line;
  const product = productByKey[key];
  return { product_id: product.id, description: product.name, quantity, unit_price: product.unit_price, vat_rate: product.vat_rate };
}

const ordered = [...INVOICES].sort((a, b) => a.issue.localeCompare(b.issue));
for (const invoice of ordered) {
  const label = `${invoice.issue} ${invoice.customer}`;
  const { data: invoiceId, error } = await demo.rpc("save_draft_invoice", {
    p_invoice_id: null,
    p_customer_id: customerId[invoice.customer],
    p_issue_date: invoice.issue,
    p_due_date: invoice.due,
    p_notes: invoice.notes ?? null,
    p_lines: invoice.lines.map(toLine),
    p_expected_updated_at: null,
  });
  check(error, `guardar borrador ${label}`);
  if (invoice.status === "draft") {
    console.log(`  borrador  ${label}`);
    continue;
  }

  const { data: number, error: issueError } = await demo.rpc("issue_invoice", { p_invoice_id: invoiceId });
  check(issueError, `emitir ${label}`);
  if (invoice.status === "paid") {
    check((await demo.rpc("mark_invoice_paid", { p_invoice_id: invoiceId })).error, `pagar ${number}`);
  } else if (invoice.status === "cancelled") {
    check((await demo.rpc("cancel_invoice", { p_invoice_id: invoiceId })).error, `anular ${number}`);
  }
  console.log(`  ${number} ${invoice.status.padEnd(9)} ${label}`);
}

// --- 4. Summary --------------------------------------------------------------------

const { data: lowStock, error: lowStockError } = await demo.from("products").select("sku, stock, low_stock_threshold");
check(lowStockError, "leer stock");
const low = lowStock.filter((product) => product.stock <= product.low_stock_threshold && product.low_stock_threshold > 0);
await demo.auth.signOut();

console.log(
  `\nListo: ${CUSTOMERS.length} clientes, ${PRODUCTS.length} productos y ${INVOICES.length} facturas. ` +
    `Stock bajo: ${low.map((product) => `${product.sku} (${product.stock})`).join(", ") || "ninguno"}.`,
);
