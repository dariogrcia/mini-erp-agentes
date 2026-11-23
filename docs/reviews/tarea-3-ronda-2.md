# Tarea 3 · Ronda 2 · Veredicto: RECHAZADA

## Puerta de calidad
| Paso | Resultado |
|---|---|
| lint | ✅ sin errores ni warnings |
| typecheck | ✅ `tsc --noEmit` (sigue dependiendo de `.next/types`; ver N3 de la ronda 1) |
| test | ✅ 21 tests en 2 archivos (`state.test.ts`, `safe-redirect.test.ts`) |
| build | ✅ `/` ○, `/dashboard` ◐, `/login` ◐, Proxy activo |

## Fallos
| # | Directriz | Severidad | Archivo:línea | Problema | Corrección esperada |
|---|---|---|---|---|---|
| F1 | SEG-4 (redirección segura tras login) | mayor | src/lib/safe-redirect.ts:21-34 | **Sigue habiendo open redirect, ahora por la normalización.** Las comprobaciones `startsWith("//")` se hacen **antes** de `new URL()`, y el valor devuelto es `url.pathname`, que **ya está normalizado**. Si los segmentos de punto se colapsan en `//x`, el pathname resultante es `//evil.com`. El origen comprobado sigue siendo el de la base porque el `//` está dentro del path, así que la comprobación de origen no lo para. Demostrado con la función y **en vivo** (POST real a la Server Action sin JS, con QA_A y contraseña correcta): `next=/.//evil.com`, `/..//evil.com`, `/%2e%2e//evil.com`, `/%2e%2e/%2e%2e//evil.com`, `/a/..//evil.com` y `/../..//evil.com` → `303 Location: //evil.com`. El navegador lo resuelve a `http://evil.com/`. Basta un enlace `/login?next=%2F.%2F%2Fevil.com`, porque el input oculto `next` lo refleja tal cual. | Validar **el resultado final**, no solo la entrada: después de construir `pathname+search+hash`, rechazar si empieza por `//` o `/\` (o volver a pasar el resultado por las mismas comprobaciones). Otra opción es colapsar las barras repetidas del pathname (`replace(/\/{2,}/g, "/")`). Añadir tests con `/.//evil.com`, `/..//evil.com`, `/%2e%2e//evil.com` y `/a/..//evil.com`. |

## Fallos de la ronda anterior
- **F1 (`\t`, `\n`, `\r`)** corregido ✅ a medias. Los caracteres de control ya se rechazan: en vivo, `/\t/evil.com`, `/\n/evil.com`, `/\r/evil.com` y `/\u0000` → `303 /dashboard`, sin 500. Pero la misma directriz SEG-4 sigue incumplida por otra vía, ahora abierta como el nuevo F1 de esta ronda.
- **N1 (email tras error)** corregido ✅. En vivo, con contraseña errónea y con la contraseña vacía, la respuesta trae `role="alert"` y el `<input name="email">` con `value` igual al enviado. La contraseña no se devuelve. `values` se tipa en `ActionState` y se usa como `defaultValue`.
- **N2 (`status 400`)** corregido ✅. `loginErrorMessage` usa solo `error.code`: `invalid_credentials` → texto genérico que no revela qué cuentas existen, `email_not_confirmed` → texto propio, y el resto → genérico sin el mensaje crudo de Supabase.

## Notas (no bloqueantes)
- **N4 (menor):** no hay límite de longitud para `next`. Con 20 000 caracteres el servidor manda una cabecera `Location` que el cliente HTTP de Node (undici, límite de 16 KB) rechaza con `HeadersOverflowError`. Con 8 000 sí funciona. Conviene limitar `next` (p. ej. `z.string().max(2048)` o un tope en `safeNextPath`) y usar `/dashboard` por encima.
- **N5 (menor):** `values.email` devuelve el email sin recortar ni limitar de tamaño. No hay XSS, porque React escapa el valor; solo se hincha la respuesta. Se puede limitar con `.max(254)` en el schema.
- **N6 (informativo):** la exclusión de `/login` distingue mayúsculas: `/LOGIN` → `303 /LOGIN`. Esa ruta da 404, no bucle, así que no es un riesgo.
- Unicode probado sin problema, porque todo se percent-encodea y se queda en el mismo origen: U+2028, U+2029, U+00A0, U+3000, U+200B, U+FEFF, la barra `／` y la barra invertida `＼` de ancho completo, y el surrogate suelto `\ud800`. También `/%2F%2Fevil.com`, `/%2F/evil.com`, `/%09`, `/%0a`, `/%5c%5c`, `/ /evil.com`, `/@evil.com`, `/:@evil.com`, `/?//evil.com` y `/#//evil.com`. Las entradas que no empiezan por `/` (` //evil.com`, `／／evil.com`) → `/dashboard`.
- La exclusión de `/login` resiste `/./login`, `/clientes/../login`, `/%2e%2e/login`, `/.%2e/login`, `/login/`, `/login?x` y `/login#x`.
- Regresiones: ninguna. `next` vacío → `/dashboard`; `/clientes?x=1` → `/clientes?x=1`; `//evil.com` → `/dashboard`. Los mensajes de validación por campo siguen igual.
- `safe-redirect.ts` está fuera del módulo `"use server"`, como se pidió ✅.

## Pruebas en vivo (`npm run dev -- -p 3241`, POST multipart a la Server Action sin JS)
| next | Resultado |
|---|---|
| `/.//evil.com`, `/..//evil.com`, `/%2e%2e//evil.com`, `/a/..//evil.com` | ❌ `303 //evil.com` (sale del origen) |
| `/\t/evil.com`, `/\n/evil.com`, `/\r/evil.com`, `/\u0000`, `//evil.com` | ✅ `303 /dashboard` |
| U+2028, U+00A0, `／`, `/%2F%2Fevil.com`, `/ /evil.com` | ✅ `303` a una ruta percent-encodeada del mismo origen |
| 8 000 caracteres / 20 000 caracteres | ✅ 303 / ⚠️ la cabecera desborda al cliente (N4) |
| `/clientes?x=1` | ✅ `303 /clientes?x=1` |

El servidor se apagó al terminar, y el puerto 3241 quedó libre.
