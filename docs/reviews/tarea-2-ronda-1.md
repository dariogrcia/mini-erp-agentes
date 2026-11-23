# Tarea 2 · Ronda 1 · Veredicto: APROBADA

Alcance revisado: `src/lib/domain/{money,invoice,validation,csv}.ts` y sus `*.test.ts`
(sin seguimiento, rama `tarea-2-dominio`). Los cambios del Orquestador en `.gitignore`,
`eslint.config.mjs` (ignorar `.claude/worktrees/`) y `PLAN.md` (estado) están justificados
y no cuentan como ALC-1. No hay dependencias nuevas, ni red, ni Supabase en estos archivos.

## Puerta de calidad
| Paso | Resultado |
|---|---|
| lint | ✅ sin errores ni warnings |
| typecheck | ✅ `tsc --noEmit` limpio |
| test | ✅ 239 tests (4 archivos) |
| build | ✅ `next build` correcto |

## Fallos
| # | Directriz | Severidad | Archivo:línea | Problema | Corrección esperada |
|---|---|---|---|---|---|
| F1 | DOM-6 | menor | src/lib/domain/validation.ts:26-28 | Los CIF de tipo **N** y **R** aceptan dígito de control (`N23456783` y `R23456783` → `true`). Según la Orden EHA/451/2008, N, P, Q, R, S y W llevan siempre letra. | Añadir `N` y `R` al grupo de letra (`"NPQRSW"`), con test. |
| F2 | DOM-6 | menor | src/lib/domain/validation.ts:9 | No se aceptan los NIF especiales K, L y M (`K1234567L`, `L…`, `M…` → `false`), que son válidos (menores de 14 años, no residentes y extranjeros sin NIE). Rechazaría a un cliente real (es poco frecuente). | Aceptar `[KLM]\d{7}[A-Z]` con la letra calculada sobre los 7 dígitos, o documentar la exclusión. |
| F3 | TST-2/TST-3 | menor | src/lib/domain/validation.test.ts:11-20 | Hay dos mutantes que sobreviven: (a) quitar `H` del grupo «solo dígito» (`"ABEH"` → `"ABE"`) y (b) cambiar la letra del control 9 (`"JABCDEFGHI"` → `"…GHJ"`). Ningún test cubre un CIF H con letra ni un CIF con control 9 de letra. | Añadir `H` con letra (rechazar) y un CIF de letra con control 9 → `I`. |
| F4 | DOM-2 (paridad BD) | menor | src/lib/domain/validation.ts:76 | `issue_date: "0000-01-01"` pasa Zod, pero Postgres rechaza el año 0 (`date/time field value out of range`). Es la única entrada que TS acepta y la BD rechaza. | Limitar el año a ≥ 0001 (o a un rango razonable, como 1900-9999) en `issue_date` y `due_date`. |
| F5 | SEG (CSV) | menor | src/lib/domain/csv.ts:16-18 | No se neutraliza la inyección de fórmulas: un `customerName` que empieza por `=`, `+`, `-`, `@` o tabulador sale tal cual (`=HYPERLINK(...)` se ejecutaría en Excel). Los datos son del propio usuario, así que el riesgo es bajo, pero el CSV va a la gestoría. | Decidirlo el Orquestador: prefijar `'` en las celdas de texto que empiecen por esos caracteres (solo en Cliente) o dejarlo como decisión documentada en PLAN.md. |
| F6 | UX-5 | menor | src/lib/domain/money.ts:34-37 | `formatEUR(-0)` devuelve `"-0,00 €"`. `fromCents(-0)` sí da `"0.00"`. | Normalizar `c === 0 ? 0 : c` antes de formatear. |

## Notas (no bloqueantes)
- **DOM-1 y DOM-2 (IVA):** `vatOf` comparado con el redondeo half-up exacto en BigInt en
  0..199 999 céntimos, en 200 000 bases aleatorias hasta `MAX_CENTS` y en las 2000 bases
  superiores, con los cuatro tipos de IVA: **0 discrepancias**. Equivale a
  `round(base * rate / 100, 2)` de `0002_hardening.sql:124` para bases ≥ 0. Los límites
  de desbordamiento (`numeric(12,2)` en `line_base`, `line_vat`, `line_total` y los
  totales) coinciden con `MAX_CENTS`.
- **toCents:** rechaza `"1,005"`, `"1.5e2"`, `"1.234,56"`, `"0x10"`, `"NaN"`,
  `"Infinity"`, `0.1+0.2`, `1e-7`, `1e21`, `Number.MAX_SAFE_INTEGER`, los dígitos no
  ASCII, `",5"`, `".5"` y `"0,"`. Acepta `" 12 "` (1200), `"-0"` (0, sin `-0`),
  `"007,5"` y `4.35` (435, sin error flotante). Todo es coherente con `scale ≤ 2` y
  `NaN` de la BD.
- **Longitudes:** Zod v4 cuenta puntos de código, igual que `char_length` en Postgres.
  Comprobado con emojis y con acentos combinados en description (200/201), name
  (120/121) y sku (40/41).
- **productSchema:** `unit_price` `"NaN"`, `"Infinity"`, `"1e3"`, `"1.5e2"` y
  `"0,005"` → rechazados. `"+5"` → 500 y `"-0"` → 0, ambos válidos.
- **invoiceDraftSchema:** `2026-02-30` y `2026-1-5` se rechazan. Si `due_date` <
  `issue_date`, el error cae en `due_date`. Si son iguales, se acepta, igual que en la BD.
  `product_id: null`, `notes: null` y `due_date: null` se rechazan (el contrato pide
  `undefined` o una cadena vacía). Develop/UI debe enviar `undefined` y no `null`.
- **canTransition:** cubre exactamente las 20 combinaciones (4 permitidas) en los tests.
- **TST-3:** de 22 mutantes, 18 mueren. 2 sobreviven pero son equivalentes
  (`Math.round(x/100)` es exacto en el .5 con enteros ≥ 0, y un `+ 0`). Los otros 2
  son los de F3.
- Las líneas de factura aceptan `vat_rate: "21"` (con coerción), pero `quantity: "1"` no.
  Es coherente con el contrato, aunque asimétrico.
- `z.string().email()` está obsoleto en Zod v4 (se prefiere `z.email()`). Funciona y lint
  no avisa.
- ALC-3: sin `console.*`, `any`, `@ts-ignore` ni código comentado.
