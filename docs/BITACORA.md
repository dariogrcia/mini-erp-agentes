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

## 2026-11-23 · Tareas 2 y 3 en paralelo
- Por primera vez hay dos Develop a la vez. La tarea 2 la hace Codex en la rama
  `tarea-2-dominio` y la tarea 3 la hace Claude en un git worktree aislado
  (`.claude/worktrees/…`). El worktree dentro del repo rompía el lint de la tarea 2, así que
  el Orquestador lo excluye en `eslint.config.mjs` y `.gitignore`.
- **Tarea 3, Testing ronda 1: RECHAZADA.** F1 (SEG-4, mayor): **redirección abierta demostrada
  en vivo**. `next=/\t/evil.com` pasaba el filtro de `//` y `/\`, y el navegador quita el
  tabulador y acaba en `evil.com`. Hay dos menores de UX/errores (N1 y N2). Las 5 desviaciones que
  declaró Develop se evalúan una a una: se aceptan `connection()`, el 401 JSON en `/api` y los
  archivos extra, y queda pendiente cambiar `typecheck` para que haga `next typegen`. Se
  devuelve a Develop (SendMessage, mismo contexto).
- **Tarea 2, Testing ronda 1: APROBADA**, con 6 fallos menores. Testing comparó el IVA de TS
  con un half-up exacto en BigInt (~400k casos, sin discrepancias) e hizo *mutation
  testing* a mano: de 22 mutantes mueren 18. El Orquestador decide corregir los menores; en
  F5 (inyección de fórmulas en el CSV que va a la gestoría) decide prefijar `'`. Codex
  (`--resume`) los corrige.
- **Tarea 2, Testing ronda 2: APROBADA**, sin fallos. 262 tests. Los 18 mutantes dirigidos a
  los cambios mueren. Cerrada y mergeada.
- **Tarea 3, Testing ronda 2: RECHAZADA.** La corrección de la ronda 1 filtraba antes de
  normalizar, y `/.//evil.com` acababa como `//evil.com` después de `new URL()`. Se demostró
  en vivo con un login real. El Orquestador cambia el enfoque de lista negra a **lista
  blanca** y añade la directriz **SEG-7** (propuesta por Testing). Pasa a la ronda 3.
- **Tarea 3, Testing ronda 3: APROBADA.** La lista blanca se aplica después de normalizar.
  Fuzz de 300.000 entradas sin ninguna salida del origen. Probado en vivo con login real.
  Se integra con un merge de 3 vías: la rama del worktree salía de antes de la tarea 2, y un
  merge real la conserva.
- Se aplica la propuesta N3 de Develop/Testing: `typecheck` = `next typegen && tsc --noEmit`,
  para que funcione en clones limpios, donde `PageProps`/`LayoutProps` son tipos generados.
- **Lección para COMO-PROGRAMAR:** en validaciones de seguridad, lista blanca sobre el valor
  ya normalizado; nunca lista negra sobre la entrada.

## 2026-11-23 · Tarea 4: clientes / CRM (Develop: Claude)
- Develop fija el patrón reutilizable: `ui.tsx`, `PageHeader`, `ConfirmButton` (confirmación en
  línea, sin `window.confirm`) y `search.ts`, que blinda `.or()` de PostgREST contra
  inyección de filtros.
- **Testing, ronda 1: APROBADA**, con 2 menores: `*` funciona como comodín en PostgREST y
  desborde a 375 px. Son triviales y los corrige el Orquestador directamente.
- **Revisión adversarial** (`/codex:adversarial-review`, por datos personales):
  `needs-attention`, con 2 hallazgos de **diseño** que no vieron ni Testing ni Develop:
  cambios perdidos entre dos pestañas y altas duplicadas al reintentar tras un fallo de red.
  El Orquestador los convierte en las decisiones **D11** (concurrencia optimista con
  `updated_at` y trigger, migración 0003) y **D12** (altas idempotentes con UUID del
  formulario).
- **Testing, ronda 2: APROBADA.** Probado en vivo: conflicto real entre dos ediciones, alta
  repetida que deja una sola fila y trigger que impide falsear la versión. Queda un menor
  (F1), aceptado como limitación conocida y documentado en D12.
- **Lección:** Testing verifica que se cumplen las reglas; la revisión adversarial pone en duda
  las reglas mismas. Se complementan.

## 2026-11-23 · Tarea 5: productos e inventario (Develop: Codex)
- En paralelo con la tarea 6 (Claude, worktree). Codex copia el patrón de la tarea 4, con
  D11 y D12 escritos en el plan. **Testing, ronda 1: APROBADA**, sin repetir ninguno de los
  fallos que ya se vieron en clientes (comodín `*`, desbordes, falso conflicto por `Date`). Es
  la prueba de que dejar las lecciones por escrito funciona.
- 1 menor (F1): ante un 23505 de la PK (id ajeno manipulado) se mostraba "SKU duplicado".
  El Orquestador lo corrige distinguiendo la constraint `products_owner_id_sku_key`, cuyo
  nombre se confirmó en vivo.

## 2026-11-23 · Tarea 6: facturas, listado y editor (Develop: Claude, worktree)
- El editor tiene vista previa en vivo del IVA. **Testing, ronda 1: APROBADA.** La vista
  previa coincide con la BD en todos los redondeos .5, en cantidades grandes y en el máximo
  exacto. Rechaza arrays desiguales, 201 líneas, NaN e ids de otro usuario.
- Develop tocó `(app)/layout.tsx` (AppNav en `<Suspense>`): era la primera ruta dinámica y
  `usePathname()` rompía el build con Cache Components. Desviación justificada y aceptada.
- F1 (un aviso de "límite excedido" engañoso cuando falla una línea): lo corrige el Orquestador.
  F2 (borradores no idempotentes): **excepción a D12** documentada en el plan.

## 2026-11-23 · Tarea 8: panel (Develop: Claude, worktree)
- Se hace en paralelo con la tarea 7 (Codex). `kpis.ts` es puro, con "hoy" inyectado,
  zona Europe/Madrid y cambios de mes en CET/CEST cubiertos por tests (355 en total).
- **Testing, ronda 1: APROBADA.** Recalculó los KPIs por REST de forma independiente y
  coinciden al céntimo. Hay 3 menores que se aceptan como limitaciones conocidas (ver el
  registro del plan).
- Como el checkout principal estaba ocupado por la rama de Codex, el merge a `main` se hace
  desde el propio worktree.
