# AGENTS.md — Fuente de verdad técnica

> Lo leen **todos** los agentes: el Orquestador (`CLAUDE.md` lo importa),
> el subagente **Develop** (Claude o Codex) y el subagente **Testing**.
> Todo lo técnico se escribe aquí una sola vez. Las tareas viven en `PLAN.md`.

## Proyecto
- **Nombre:** Gestia, un mini-ERP para pymes.
- **Objetivo:** que un autónomo o una pyme gestione **clientes**, **inventario** y
  **facturas con IVA** desde el móvil o el escritorio. Al emitir una factura, se
  descuenta el stock.
- **Usuarios:** cada usuario solo ve sus propios datos (multi-tenant por usuario con RLS).

## Equipo de agentes
| Rol | Definición | Normas que sigue |
|---|---|---|
| Orquestador | `CLAUDE.md` | reparte tareas de `PLAN.md`, integra, hace commit |
| Develop | `.claude/agents/develop.md` (Claude) · Codex vía `/codex:rescue` | `docs/agents/COMO-PROGRAMAR.md` + `docs/agents/DIRECTRICES-TESTING.md` |
| Testing | `.claude/agents/testing.md` | `docs/agents/DIRECTRICES-TESTING.md` (es su dueño) |

Ciclo: Orquestador → Develop implementa → Testing revisa → si hay fallos, vuelven a
Develop → … → Testing APRUEBA → Orquestador hace merge. Detalle en `CLAUDE.md`.

## Stack
- **Framework:** Next.js 16 (App Router, Server Components, Server Actions), React 19.
- **Lenguaje:** TypeScript estricto.
- **Estilos:** Tailwind CSS v4 (sin librería de componentes).
- **Base de datos y auth:** Supabase (Postgres, Auth email+contraseña, Row Level Security).
  Cliente: `@supabase/ssr`.
- **Validación:** Zod v4 en el servidor.
- **Tests:** Vitest para la lógica de dominio pura.
- **Despliegue:** Vercel (producción pública), con las variables de entorno en el panel de Vercel.

## Comandos
- Instalar: `npm install`
- Desarrollo: `npm run dev`
- Lint: `npm run lint`
- Tipos: `npm run typecheck`
- Tests: `npm test`
- Build: `npm run build`
- **Todo junto (puerta de calidad):** `npm run verify`

## Estructura
```
src/
  app/
    (auth)/login/          página de login (pública)
    (app)/                 zona privada: layout con navegación
      dashboard/  clientes/  productos/  facturas/
    api/                   route handlers (p. ej. exportación CSV)
  components/              componentes de UI reutilizables
  lib/
    supabase/              server.ts, client.ts (factorías de cliente)
    domain/                lógica pura y testeable (cálculos, validaciones)
    actions/               server actions por entidad
  proxy.ts                 refresco de sesión y protección de rutas (Next 16: antes "middleware")
supabase/migrations/       SQL versionado: tablas, RLS, funciones
docs/                      arquitectura, bitácora, normas de agentes, revisiones
```

## Convenciones
- Código y comentarios en inglés; textos de interfaz en español.
- camelCase para variables y funciones; PascalCase para componentes; snake_case en SQL.
- Dinero: en la BD, `numeric(12,2)`; en TS, céntimos enteros para calcular y redondeo
  half-up a 2 decimales. Formato `es-ES` con `Intl.NumberFormat`.
- Validación de toda entrada en el servidor con Zod, aunque el cliente ya valide.
- Nunca secretos en el código: solo `NEXT_PUBLIC_SUPABASE_URL` y
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` (públicas por diseño). La seguridad la da RLS.
  Prohibido usar la `service_role` key en la app.
- Next 16: `cookies()`, `headers()`, `params` y `searchParams` son **asíncronos** (`await`).
  El middleware se llama `proxy.ts`. Ante la duda, lee `node_modules/next/dist/docs/`.

## Reglas para quien implementa (Develop, sea Claude o Codex)
- Implementa SOLO la tarea indicada de `PLAN.md`. No refactorices fuera de alcance.
- Sigue `docs/agents/COMO-PROGRAMAR.md` y cumple `docs/agents/DIRECTRICES-TESTING.md`.
- Respeta las decisiones (D1, D2…) de `PLAN.md`; no las cambies.
- Si algo es imposible o contradictorio, detente y explícalo en vez de improvisar.
- Termina ejecutando `npm run verify` y reporta el resultado.
- No hagas commit: lo hace el Orquestador tras la aprobación de Testing.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
