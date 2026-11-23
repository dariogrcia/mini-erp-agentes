# Tarea 3 · Ronda 1 · Veredicto: RECHAZADA

## Puerta de calidad
| Paso | Resultado |
|---|---|
| lint | ✅ sin errores ni warnings |
| typecheck | ✅ (pasa porque ya existía `.next/types` en el worktree; no hizo falta `npx next typegen`. Ver nota N3) |
| test | ✅ 7 tests (1 archivo: `src/lib/actions/state.test.ts`) |
| build | ✅ `/` ○, `/dashboard` ◐, `/login` ◐, Proxy activo |

## Fallos
| # | Directriz | Severidad | Archivo:línea | Problema | Corrección esperada |
|---|---|---|---|---|---|
| F1 | SEG-4 (redirección segura tras login) | mayor | src/lib/actions/auth.ts:17-23 | **Open redirect demostrado.** `safeNextPath` solo rechaza `//` y `/\` al principio, pero no los caracteres de control. Un enlace `/login?next=%2F%09%2Fevil.com` mete `"/\t/evil.com"` en el input oculto `next` (comprobado en el HTML). Tras un login correcto el servidor responde `303 Location: /\t/evil.com`. El parser de URL de los navegadores elimina tab/CR/LF, así que esa ruta se resuelve a `http://evil.com/` (comprobado con `new URL("/\t/evil.com", base)`). Es phishing post-login con credenciales válidas. Con `next="/\n/evil.com"` la acción revienta con `500` (`ERR_INVALID_CHAR` en la cabecera Location): el usuario ve un error en lugar de entrar. | Validar `next` de forma robusta. Por ejemplo: rechazar cualquier carácter `< 0x20`, `0x7f` o `\`; resolver con `new URL(next, "http://n")`, exigir que `origin === "http://n"` y redirigir solo a `pathname + search + hash`. Excluir también `/login` después de normalizar. Extraer la función a un módulo que no sea `"use server"` (p. ej. `src/lib/domain/redirect.ts`) y añadir tests con `//x`, `/\x`, `https://x`, `/\t/x`, `/\n/x`, `/%5Cx`, `/login`, vacío y una ruta válida con query. |

## Notas (no bloqueantes)
- **N1 (menor, UX-2):** con React 19 el `<form action>` se resetea al terminar la acción. Tras un error de credenciales el email se borra y hay que escribirlo otra vez. Se puede devolver el email en `ActionState` y usarlo como `defaultValue`, o usar `key`/inputs controlados.
- **N2 (menor):** en `auth.ts:44`, `error.status === 400` agrupa como "Email o contraseña incorrectos" otros 400 de Supabase, como `email_not_confirmed`. Para la demo no importa; conviene mirar solo `error.code`.
- **N3 (deviación 3, typecheck):** `LayoutProps`/`PageProps` son tipos globales que genera Next en `.next/types`. El problema **ya existe en `main`**: `src/app/layout.tsx:13` usa `LayoutProps<"/">`. No lo introduce esta tarea. Se acepta la propuesta de que el Orquestador cambie el script a `next typegen && tsc --noEmit`.
- **Desviación 1 (`await connection()` en `createClient`):** aceptada. Marca como dinámico todo lo que use el cliente de servidor, lo que encaja con D10: ningún dato de usuario se prerenderiza y el build queda en verde. Solo afecta al rendimiento de los usos futuros, que de todas formas son por petición.
- **Desviación 2 (401 JSON en `/api/*`):** aceptada. Para un Route Handler de exportación CSV es más correcto que una redirección HTML. Comprobado: `GET /api/facturas/export` sin sesión → `401 {"error":"No autenticado"}`. El Orquestador debería reflejarlo en el contrato de PLAN.md (tarea 3 o la tarea de exportación).
- **Desviación 4 (sin `server-only`):** aceptada como menor. El paquete no está instalado y añadir dependencias queda fuera de alcance. `server.ts` importa `next/headers`, que ya falla si se importa desde cliente. Se recomienda añadir `server-only` en una tarea futura.
- **Desviación 5 (archivos extra):** aceptada (ALC-1). `LoginForm.tsx` es necesario: `useActionState` solo funciona en un componente cliente. `state.test.ts` cubre `toUserMessage`. El placeholder de `/dashboard` hace falta para que la redirección post-login caiga en una ruta real; no es una página de entidad, así que no infringe el "No hacer". `src/app/layout.tsx` y `globals.css` no se tocaron porque en `main` ya cumplían D8 (`lang="es"`, metadata y fuentes del sistema).
- **SEG-5 `toUserMessage`:** correcto. Solo devuelve textos fijos o `Stock insuficiente de <sku>`, con el SKU propio del usuario, que viene en `detail` de la RPC, recortado a 40 caracteres. Nunca devuelve `message`/`details` crudos de Postgres. Usa `Object.hasOwn`, así que no cuelan claves heredadas como `toString`. Los tests lo cubren.
- **getCurrentUser:** al redirigir a `/login` no conserva `next`. Es aceptable porque el proxy ya lo pone antes.

## Pruebas en vivo (`npm run dev -p 3240`, curl)
Sin sesión:
- `/` → 307 `/login` · `/dashboard` → 307 `/login?next=%2Fdashboard` · `/dashboard?x=1&y=2` → 307 `/login?next=%2Fdashboard%3Fx%3D1%26y%3D2` · `/clientes` y `/facturas/abc` → 307 con `next` · `/api/facturas/export` → 401 JSON · `/login` → 200.

Login (Server Action vía POST multipart sin JS, con QA_A):
- Contraseña errónea → 200 con `role="alert"` "Email o contraseña incorrectos." ✅
- Campos vacíos → "Introduce tu email" / "Introduce tu contraseña" por campo ✅. Email inválido → "Introduce un email válido" ✅
- Correcto: `next` vacío → `/dashboard` · `/clientes?x=1` → `/clientes?x=1` ✅
- `next` = `//evil.com`, `/\evil.com`, `/\/evil.com`, `https://evil.com`, `javascript:alert(1)`, `/login`, `/login?next=//evil.com`, `%2F%2Fevil.com` → `/dashboard` ✅ · `/%5Cevil.com` → misma origen ✅
- `next` = `"/\t/evil.com"` → `Location: /\t/evil.com` ❌ (F1) · `"/\n/evil.com"` → 500 ❌ (F1)

Con sesión: `/dashboard` 200 · `/login` y `/login?next=/clientes` → 307 `/dashboard` · `/` → `/dashboard`.

Logout: 303 → `/login`, borra la cookie `sb-*`, y después `/dashboard` → 307 `/login`. Otra sesión del mismo usuario (otra cookie jar) también queda revocada, porque signOut es global ✅. Logout sin sesión → el proxy lo redirige a login ✅.

Revisión de UI:
- Login a 375 px: `w-full max-w-sm` y `px-4`, sin anchos fijos; inputs `text-base` en móvil, lo que evita el zoom en iOS.
- Navegación: barra lateral `md:w-60` oculta en móvil; barra inferior `grid-cols-4` con safe-area; `main` con `pb-24`. No hay desbordes.
- Las labels están enlazadas por `for`/`id`. Los errores usan `aria-invalid` y `aria-describedby`. El foco es visible con el ring de los inputs y el `:focus-visible` global. El botón de icono de logout en móvil lleva `aria-label`.
- Hay estado pendiente ("Entrando…" y `disabled`).
- D10/ALC-5: `searchParams` y la sesión se leen dentro de `<Suspense>` con skeleton.
- ALC-4: `proxy.ts` y `await cookies()` ✅.
- SEG-1: no hay secretos ni `service_role` en `src/`; `.env.local` está ignorado ✅.
- ALC-3: sin `console.log`, `any` ni `@ts-ignore` ✅.
