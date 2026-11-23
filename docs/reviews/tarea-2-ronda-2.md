# Tarea 2 · Ronda 2 · Veredicto: APROBADA

Alcance: `src/lib/domain/{money,validation,csv}.ts` y sus tests (sin seguimiento, rama
`tarea-2-dominio`). Fuera de `src/lib/` solo cambian los archivos del Orquestador
(`.gitignore`, `eslint.config.mjs`, `PLAN.md`, `docs/BITACORA.md`), que ya se revisaron en la
ronda 1. Se ignora `.claude/worktrees/`. Las sondas se ejecutaron con scripts **fuera del repo**
(scratchpad), y los mutantes se aplicaron sobre una copia de `src/lib/domain`.

## Puerta de calidad
| Paso | Resultado |
|---|---|
| lint | ✅ sin errores ni warnings |
| typecheck | ✅ `tsc --noEmit` limpio |
| test | ✅ 262 tests (4 archivos), 239 en la ronda 1 |
| build | ✅ `next build` correcto |

## Fallos
Ninguno.

## Fallos de la ronda anterior
- **F1 ✅** `validation.ts:29`: N y R están en el grupo «solo letra» (`"NPQRSW"`). Los CIF
  `N2345678C` y `R2345678C` se aceptan, y `N23456783` y `R23456783` se rechazan. Test en
  `validation.test.ts:11-14`.
- **F2 ✅** `validation.ts:9-14`: K, L y M se aceptan con la letra calculada sobre los
  7 dígitos (`K1234567L`, `L…` y `M…` → `true`). Se rechazan la letra errónea, 6 u 8
  dígitos, dígito final y `KX234567L`. Se normaliza la minúscula a través del schema.
  Test en `validation.test.ts:15-22`.
- **F3 ✅** Hay tests de H con letra (rechazado) y de control 9 → `I` (`P0000005I`). Los dos
  mutantes que sobrevivían en la ronda 1 (`"ABEH"`→`"ABE"` y `"…GHI"`→`"…GHJ"`) **mueren**.
- **F4 ✅** `validation.ts:78-81`: el rango va de 1900-01-01 a 2999-12-31 (inclusive) en
  `issue_date` y `due_date`. `0000-01-01`, `0001-01-01`, `1899-12-31` y `3000-01-01` se
  rechazan en ambos campos. `2024-02-29` se acepta y `2023-02-29` se rechaza.
- **F5 ✅** `csv.ts:20-22`: se prefija `'` a las celdas de texto (Número, Fecha, Cliente,
  NIF y Estado) que empiezan por `=`, `+`, `-`, `@`, `\t` o `\r`, **antes** del escapado.
  `\r` queda entrecomillado como `"'\r…"`. Los importes salen intactos, también los
  negativos (`-37,50;-7,88;-45,38`). Un `'=x` ya prefijado no se duplica, y `a=b` y
  `A+B-C@D` (con el carácter en medio) no se tocan.
- **F6 ✅** `money.ts:37`: `formatEUR(-0)` → `"0,00 €"`. `formatEUR(-1)` sigue siendo
  `"-0,01 €"`. Test en `money.test.ts:6`.

## Sin regresiones (sondas repetidas)
- **Paridad del IVA:** `vatOf` comparado con el half-up exacto en BigInt en 0..199 999,
  en 200 000 bases aleatorias hasta `MAX_CENTS` y en las 2001 bases superiores, con
  0/4/10/21: **0 discrepancias**.
- **toCents:** sigue rechazando `"1,005"`, `"1.5e2"`, `"1.234,56"`, `"0x10"`, `"NaN"`,
  `"Infinity"`, `0.1+0.2`, `1e-7`, `1e21`, `MAX_SAFE_INTEGER`, los dígitos árabes, `",5"`,
  `".5"` y `"0,"`. `" 12 "`→1200, `"-0"`→0 (sin `-0`), `"007,5"`→750 y `4.35`→435.
- **NIF/NIE/CIF:** DNI, X/Y/Z, K/L/M, NPQRSW (solo letra), ABEH (solo dígito) y CDFGJUV
  (ambos) se comportan según la norma. `I…` y `O…` se rechazan.
- **Mutación (los tests pueden fallar):** 18 de 18 mutantes dirigidos a los cambios mueren:
  quitar K/M, N o R, H; control 9→J; mover un día cualquiera de los límites de fecha o
  quitar uno; quitar la normalización de `-0`; quitar cada carácter de la clase CSV o el
  ancla `^`; quitar la neutralización o aplicarla a un importe.

## Notas (no bloqueantes)
- La neutralización no cubre `\n` inicial ni el `＝` de ancho completo, porque quedan fuera
  de la decisión del Orquestador. `\n` sale entre comillas y Excel no lo evalúa como
  fórmula. Se acepta así.
- Un cliente legítimo cuyo nombre empiece por `-` o `+` aparecerá con `'` en el CSV. Es el
  coste asumido de la decisión F5.
- Siguen vigentes las notas de la ronda 1: enviar `undefined` y no `null` en los campos
  opcionales, y `z.string().email()` está obsoleto en Zod v4.
