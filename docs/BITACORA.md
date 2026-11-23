# Bitácora

El Orquestador la mantiene al día: qué se hizo, quién lo hizo, cuántas rondas de Testing
hicieron falta y qué fallos se encontraron. Los informes completos de Testing están en
`docs/reviews/`.

## 2026-11-23 · Tarea 0: arranque (Orquestador)
- Elección del tema: un **mini-ERP** (clientes, inventario y facturación). Es el tipo de
  software de gestión a medida que encaja con el día a día de una pyme.
- Scaffold con `create-next-app` (Next 16.4, React 19.3, Tailwind 4). Dependencias:
  `@supabase/ssr`, `@supabase/supabase-js`, `zod` y `vitest`.
- Incidencia: `vitest@5` exige `@types/node` ≥ 22, y el scaffold traía la 20. Se subió
  `@types/node` a la 24.
- Next 16 trae su propio bloque en `AGENTS.md` ("This is NOT the Next.js you know"). Se
  mantiene y se integra en el `AGENTS.md` del equipo.
- Revisadas las notas de migración de Next 16: `middleware` pasa a `proxy`, las APIs de
  request son asíncronas y Turbopack viene por defecto. Recogido en `AGENTS.md` y en la
  directriz `ALC-4`.
- Se crean el Orquestador (`CLAUDE.md`), Develop (`.claude/agents/develop.md` y
  `docs/agents/COMO-PROGRAMAR.md`), Testing (`.claude/agents/testing.md` y
  `docs/agents/DIRECTRICES-TESTING.md`), `PLAN.md` (9 tareas) y `docs/ARCHITECTURE.md`.
- Decisión D3: las facturas solo se escriben mediante funciones SQL `security definer`.
  Se ajustan SEG-3 y DOM-2 para reflejarlo.
- Decisión D8: se elimina `next/font/google` para que el build no dependa de la red (el
  sandbox de Codex no tiene salida a internet).
- Scripts añadidos: `typecheck`, `test` y `verify` (la puerta de calidad completa).
- Incidencia: Next 16.4 trae `cacheComponents: true` por defecto. Con eso, leer `cookies()`
  fuera de `<Suspense>` es un error de build. **Decisión D10:** se mantiene (es la
  dirección de Next) y se fija el patrón "shell estático + componente de datos en
  `<Suspense>`" en COMO-PROGRAMAR. Nueva directriz `ALC-5`. Se añade `src/lib/auth.ts`
  (Data Access Layer) a la tarea 3.
- Vitest: se quita `vite-tsconfig-paths` (Vite ya resuelve los paths de `tsconfig` de
  forma nativa) y se pone `passWithNoTests` hasta que existan los tests.
