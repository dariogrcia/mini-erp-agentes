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

## 2026-11-23 · Tarea 1: migración SQL (Develop: Codex)
- Se crea la organización "Gestia" en Supabase y el proyecto `gestia` (eu-west-3, plan
  gratuito). Las claves están solo en `.env.local`.
- Codex (`/codex:rescue`) genera `supabase/migrations/0001_init.sql`. Intentó probarla en un
  Postgres local con `initdb`, pero su sandbox no permite memoria compartida. Su
  `npm run verify` falló en el build porque el sandbox no puede abrir puertos (`os error 1`):
  es una limitación del entorno de Codex, no del código. El Orquestador repite `verify`
  fuera del sandbox y sale en verde.
- **Lección:** Codex no puede ejecutar `next build` ni Postgres en su sandbox. La
  verificación completa la repiten siempre el Orquestador y Testing.
- El Orquestador aplica la migración (`supabase db push`) y crea dos usuarios QA (A y B)
  con la Admin API. La `service_role` se usó solo en la terminal y no se guarda en ningún
  sitio. Así Testing puede probar el aislamiento en vivo contra la API REST.
- Incidencia: la sesión de Claude Code se abrió fuera del repo y no cargó
  `.claude/agents/`. Se lanza Testing como subagente genérico con la instrucción de cargar
  `.claude/agents/testing.md` como rol. Si se abre la sesión dentro del repo, se invoca de
  forma nativa (`subagent_type: testing`).
- **Testing, ronda 1: APROBADA**, con 3 fallos menores (F1: precio con más de 2
  decimales redondeado sin avisar; F2: errores internos de Postgres con el `owner_id`
  expuestos; F3: `issue_date` null). Probado en vivo con dos usuarios: aislamiento, 401 y
  403, redondeo .5, stock, transiciones y numeración. Se decide corregir los menores igualmente,
  porque F2 llegaría a la UI. Codex (`--resume`) crea `0002_hardening.sql`, ya que la 0001
  aplicada no se edita.
- **Revisión adversarial** (`/codex:adversarial-review`, zona crítica):
  `needs-attention`, con 2 fallos que ni Testing ni el Orquestador habían visto. [high] Con
  `lpad(n, 4)` el número 10000 se trunca a "1000" y bloquea las emisiones del año.
  [medium] `NaN` pasa el `CHECK >= 0`. Codex (`--resume`) los añade a la 0002.
  **Lección:** probar en vivo no basta para los casos límite numéricos de Postgres.
  Se añade la directriz DOM-7.
- **Testing, ronda 2: APROBADA.** Los 5 fallos están corregidos y probados en vivo, salvo A1,
  que se verifica estáticamente porque el contador no es accesible desde la API, como se
  pretendía. Las notas menores de Testing se trasladan al plan: `toUserMessage` traduce
  los errores por `code` de Postgres (tarea 3), Zod hace trim de la descripción (tarea 2)
  y D6 aclara "mínimo 4 dígitos".
- Cierre: commit, merge a `main` y tarea 1 marcada como **hecha**.
