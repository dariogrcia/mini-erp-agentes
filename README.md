# Gestia: mini-ERP para autónomos y pymes

Clientes, inventario y facturas con IVA, desde el móvil o el escritorio. Prueba técnica para
Speed Paradigm, construida con un **sistema de agentes** (Orquestador, Develop y Testing)
sobre Claude Code y Codex.

## Demo

- **URL:** https://gestia-black.vercel.app
- **Usuario:** `demo@gestia.app`
- **Contraseña:** `GestiaDemo2026!`

La cuenta demo trae 8 clientes, 12 productos y 11 facturas en todos los estados (pagadas,
emitidas, una anulada y borradores). Es una cuenta compartida: si alguien cambia los datos,
`scripts/seed-demo.mjs` los restaura.

## Qué hace

- **Panel:** facturado este mes, pendiente de cobro, número de clientes y productos con stock
  bajo, últimas facturas y accesos rápidos.
- **Clientes (CRM):** alta, edición y búsqueda. Valida NIF, NIE y CIF.
- **Inventario:** productos con SKU, precio, tipo de IVA (0, 4, 10 y 21 %), stock y umbral de
  aviso. Filtro de stock bajo.
- **Facturas:**
  - Editor de borradores con vista previa del IVA en vivo.
  - Ciclo de vida borrador → emitida → pagada o anulada.
  - Al emitir se asigna un número correlativo por año (`2026-0001`) y se descuenta el stock en
    la misma transacción. Al anular, el stock se repone.
  - Vista imprimible: "Guardar como PDF" desde el navegador.
- **Exportación CSV** de las facturas emitidas, pensada para la gestoría (separador `;` y
  protección contra fórmulas al abrirlo en Excel).
- Responsive, con login y datos aislados por usuario.

## Stack

Next.js 16 (App Router, Server Components, Server Actions y Cache Components), React 19,
TypeScript estricto, Tailwind CSS v4, Supabase (Postgres, Auth y Row Level Security), Zod v4,
Vitest y Vercel.

## Cómo está hecho

### La app
- **La seguridad está en la base de datos.** RLS por `owner_id` en todas las tablas. La anon key
  es pública por diseño. La `service_role` no aparece en la app.
- **Las facturas solo se escriben a través de funciones SQL** (`security definer`, con bloqueos
  de fila). El insert y el update directos están revocados, así que nadie puede saltarse las
  reglas de estado, totales y stock llamando a la API REST.
- **Dinero en céntimos enteros** en TypeScript y `numeric(12,2)` en Postgres.
- **Concurrencia optimista:** dos pestañas editando lo mismo dan un aviso de conflicto, nunca
  una pérdida silenciosa de datos.
- **Una factura emitida es inmutable:** guarda una copia de los datos fiscales del cliente.

Detalle y diagramas en [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

### El sistema de agentes
| Agente | Definición | Papel |
|---|---|---|
| Orquestador | [`CLAUDE.md`](CLAUDE.md) | Planifica en [`PLAN.md`](PLAN.md), reparte, integra, hace commit y merge |
| Develop | [`.claude/agents/develop.md`](.claude/agents/develop.md) o Codex (`/codex:rescue`) | Implementa una tarea siguiendo [`COMO-PROGRAMAR.md`](docs/agents/COMO-PROGRAMAR.md) |
| Testing | [`.claude/agents/testing.md`](.claude/agents/testing.md) | Dueño de [`DIRECTRICES-TESTING.md`](docs/agents/DIRECTRICES-TESTING.md). Revisa y prueba en vivo, pero no toca código |

Cada tarea sigue el ciclo Develop → Testing (hasta 4 rondas) → merge. Las zonas críticas
(SQL, auth y emisión de facturas) pasan además una revisión adversarial con un segundo modelo.
[`AGENTS.md`](AGENTS.md) es la fuente de verdad técnica que leen todos los agentes.

Hay registro de todo:
- [`docs/reviews/`](docs/reviews/): los informes de cada ronda.
- [`docs/BITACORA.md`](docs/BITACORA.md): qué pasó en cada tarea, incidencias y lecciones.

Un ejemplo: en la tarea 7, Testing aprobó y la revisión adversarial encontró dos fallos de
diseño, que salieron como las decisiones D13 y D14.

## Ejecutarlo en local

```bash
npm install
cp .env.example .env.local   # URL y anon key de tu proyecto Supabase
npx supabase db push         # aplica supabase/migrations/
npm run dev
```

Puerta de calidad: `npm run verify`, que ejecuta lint, tipos, 414 tests y el build.

Datos demo, con la `service_role` solo en el entorno y nunca en el repo:

```bash
# .env.local: SUPABASE_SERVICE_ROLE_KEY, DEMO_EMAIL y DEMO_PASSWORD
node --env-file=.env.local scripts/seed-demo.mjs
```

## Fuera de alcance (v1)

Varios usuarios por empresa, PDF generado en servidor, facturas rectificativas, retenciones
IRPF, multimoneda, integraciones reales con Holded, A3 o VeriFactu (el CSV deja preparada esa
vía) y registro público de usuarios.
