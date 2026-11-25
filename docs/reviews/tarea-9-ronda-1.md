# Tarea 9 · Ronda 1 · Veredicto: APROBADA

Diff revisado: `git diff a9614c2..HEAD` (`3efd5e4`, `c2aee7f`, `142b633`) en la rama `tarea-9-entrega`.
El árbol de trabajo está limpio.

## Puerta de calidad
| Paso | Resultado |
|---|---|
| lint | ✅ sin errores ni warnings |
| typecheck | ✅ `next typegen && tsc --noEmit` limpio |
| test | ✅ 414 tests (14 archivos) |
| build | ✅ `/dashboard` y `/facturas` como Partial Prerender (◐) y `/api/facturas/export` dinámica (ƒ) |

## Fallos
| # | Directriz | Severidad | Archivo:línea | Problema | Corrección esperada |
|---|---|---|---|---|---|
| F1 | SEG-1 / ALC-2 | menor | Supabase Auth (configuración) · README.md:107 | `GET /auth/v1/settings` devuelve `disable_signup: false`. Cualquiera con la anon key puede llamar a `signUp` contra la API de Auth, aunque la app no tenga pantalla de registro. El README dice que el "registro público de usuarios" queda fuera de alcance. El riesgo es bajo: RLS aísla los datos y `mailer_autoconfirm` es `false`, así que el registro exige confirmar el email. Aun así permite crear cuentas basura en el proyecto. | Desactivar "Allow new users to sign up" en Supabase (Auth › Providers › Email). El seed no se ve afectado porque usa `admin.createUser`. |
| F2 | ALC-1 | menor | docs/BITACORA.md | PLAN.md (tarea 9, "Archivos") incluye `docs/BITACORA.md`, pero el diff no tiene ninguna entrada de la tarea 9. | Añadir la entrada de la T9 (seed, despliegue y verificación en producción) al cerrar la tarea. |
| F3 | — | menor | scripts/seed-demo.mjs:96-108, 112-115 | Si `DEMO_EMAIL` coincide por error con un usuario real o de QA, el script le **cambia la contraseña y borra todos sus datos**, sin pedir confirmación. Hoy `DEMO_EMAIL` es distinto de `QA_A_EMAIL` y `QA_B_EMAIL` (comprobado sin imprimir los valores), así que solo es una salvaguarda. | Opcional: abortar si `DEMO_EMAIL` es igual a `QA_A_EMAIL`/`QA_B_EMAIL`, o exigir que el usuario lleve un `app_metadata.demo = true` puesto en su creación. |
| F4 | — | menor | README.md:31-32 | Dice "Exportación CSV de las **facturas emitidas**", pero `route.ts:25` exporta todo lo que no es borrador: emitidas, pagadas y anuladas. Lo correcto para la gestoría es exportarlas todas, pero el texto puede leerse como "solo estado emitida". | "…de las facturas emitidas (incluidas las pagadas y las anuladas; los borradores no)". |

No hay fallos bloqueantes ni mayores.

## Seguridad (SEG-1), lo principal de esta tarea
He comparado cada valor de `.env.local` sin imprimirlo: solo se han contado las apariciones.

| Valor | `git log -p --all` (25 commits) | Archivos versionados | Mensajes de commit | Bundle de producción |
|---|---|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | 0 | 0 | 0 | no |
| `SUPABASE_DB_PASSWORD` | 0 | 0 | 0 | no |
| `QA_A_PASSWORD` / `QA_B_PASSWORD` | 0 / 0 | 0 / 0 | 0 | no |
| `VERCEL_OIDC_TOKEN` | 0 | 0 | 0 | no |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` / URL | 0 / 0 | 0 / 0 | 0 | — |
| `QA_A_EMAIL` / `QA_B_EMAIL` | 0 / 0 | 0 / 0 | 0 | — |
| `DEMO_EMAIL` / `DEMO_PASSWORD` | 1 / 1 | 1 / 1 (README.md:10-11) | 0 | no |

- **Patrones** en el historial completo y en los archivos versionados: JWT `eyJ….…` 0, `sb_secret_` 0, `sb_publishable_` 0, `SERVICE_ROLE_KEY=<valor>` 0, `DB_PASSWORD=<valor>` 0, URLs `postgres://user:pass@` 0. Ningún commit ha añadido nunca un `.env*` distinto de `.env.example`, ni `.vercel/` ni `*.pem`. No hay stashes.
- **Ignorados:** `.env.local`, `.env` y `.env.production.local` quedan cubiertos por `.gitignore:34` (`.env*`), con `!.env.example` como única excepción. `.vercel` lo cubre `.gitignore:37`. `.vercelignore` excluye `.env*` (salvo el ejemplo), `scripts/` y `docs/reviews/`.
- **`src/`** no contiene `service_role` ni `SERVICE_ROLE` (tampoco `supabase/`). La app solo lee `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY` de `process.env`.
- **Producción:** en los 9 chunks JS de `/login` y su HTML no aparece ninguno de los secretos. `/.env.local` y `/scripts/seed-demo.mjs` no se sirven: responden 307 a login, así que no existen como estáticos.
- **Credenciales demo en el README:** son intencionadas (el contrato pide un login demo público). No coinciden con ninguna credencial de QA ni de la BD. Las acepto como excepción a SEG-1 y propongo anotarla en PLAN.md (ver Notas).

## Revisión del diff
- **Dashboard (D14)** ✅ Sigue exactamente el patrón de `facturas/page.tsx:88,190,219`: añade `customer_name` al `select` y al `Pick` y usa `status === "draft" ? customers?.name : customer_name` con el fallback "Cliente no disponible", que es el mismo texto que en el listado.
- **`scripts/seed-demo.mjs`** ✅
  - La `service_role` solo se lee de `process.env` (línea 33). El cliente admin se usa únicamente para `listUsers`/`createUser`/`updateUserById` y para el borrado.
  - Por consola solo salen los nombres de las variables que faltan, `error.message`/`details` de Supabase (que no incluyen claves), el email demo y el resumen. Nunca salen la contraseña ni las claves.
  - **El borrado está acotado:** `delete().eq("owner_id", user.id)` en `invoices` → `customers` → `products` → `invoice_counters`. El orden respeta `customer_id ON DELETE RESTRICT`; las líneas caen por cascada y `product_id` queda en `set null`. Si `user.id` faltara, `createUser` habría salido antes por `check`.
  - **Inserta como el usuario demo** (RLS), y las facturas pasan por `save_draft_invoice` → `issue_invoice` → `mark_invoice_paid`/`cancel_invoice`, igual que la app.
  - **Se puede volver a ejecutar:** reinicia la contraseña, vacía los datos y el contador, y la numeración vuelve a 0001. `issue_invoice` conserva el `issue_date` del borrador (`0004:233`), así que el orden por fecha da números correlativos.
- **README** ✅ (salvo F4) contra el código:
  - Todas las rutas enlazadas existen y están versionadas (CLAUDE.md, PLAN.md, AGENTS.md, `.claude/agents/develop.md`/`testing.md`, `docs/agents/*`, `docs/ARCHITECTURE.md`, `docs/BITACORA.md` y `docs/reviews/`).
  - "414 tests" ✅. El separador CSV `;` ✅ (`csv.ts:31`) y la protección anti-fórmulas ✅.
  - NIF/NIE/CIF ✅ (`validation.ts:9-14`), el filtro de stock bajo ✅, la vista imprimible ✅ (clases `print:`) y los IVA 0/4/10/21 ✅.
- **ARCHITECTURE.md** ✅ Los puntos 6 y 7 reflejan D11, D13 y D14 tal como están en PLAN.md:63-70.

## Verificación en producción (https://gestia-black.vercel.app, sin cookies)
| Ruta | Esperado | Obtenido |
|---|---|---|
| `/login` | 200 | ✅ 200 |
| `/` | → login | ✅ 307 `/login` |
| `/dashboard` | → login | ✅ 307 `/login?next=%2Fdashboard` |
| `/facturas` | → login | ✅ 307 `/login?next=%2Ffacturas` |
| `/clientes`, `/productos` | → login | ✅ 307 con `next` |
| `/api/facturas/export` | 401 | ✅ 401 |

**Datos demo:** un script Node con la anon key y el login demo, **solo de lectura**. No he usado el navegador ni he modificado nada.
- El login demo funciona ✅.
- Hay 8 clientes, 12 productos y 11 facturas: 4 pagadas, 4 emitidas, 1 anulada y 2 borradores ✅.
- Ninguna factura no borrador está sin `customer_name` (0), y todas coinciden con el nombre actual del cliente. Ningún borrador tiene número.
- La numeración va de 2026-0001 a 2026-0009, correlativa por `issue_date` (09-03 → 11-18). Ningún stock es negativo.
- Hay 4 productos con stock bajo (CON-TON-HP, INF-PORT-14, INF-SSD-1TB y ELE-SAI-1500), así que el panel tiene contenido.

## Notas (no bloqueantes)
- **Propuesta de directriz:** añadir a SEG-1 "salvo las credenciales de la cuenta demo pública, documentadas en el README". Así la excepción queda escrita y no se discute en cada ronda. No la aplico sin que el Orquestador lo confirme.
- **Cuenta demo compartida:** cualquier visitante con sesión demo puede cambiar la contraseña a través de la API de Auth (`updateUser`) y dejar fuera a los demás, o alterar los datos. El README ya lo asume para los datos y lo arregla `seed-demo.mjs`. Conviene revisar la cuenta antes de cada entrega.
- `npx supabase db push` (README:85) necesita antes `npx supabase link --project-ref …`. Podría añadirse esa línea.
- `.env.example` solo trae la URL y la anon key. El README explica que las variables del seed van en `.env.local` ✅.
- ALC-3: los 5 `console.log` del seed son propios de un script CLI fuera de `src/` ✅.
- Scripts temporales en `/tmp/claude-tarea9/`, fuera del repo.
