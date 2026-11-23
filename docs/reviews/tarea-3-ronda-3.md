# Tarea 3 · Ronda 3 · Veredicto: APROBADA

## Puerta de calidad
| Paso | Resultado |
|---|---|
| lint | ✅ sin errores ni warnings |
| typecheck | ✅ `tsc --noEmit` |
| test | ✅ 43 tests en 2 archivos (`state.test.ts`, `safe-redirect.test.ts`) |
| build | ✅ `/` ○, `/dashboard` ◐, `/login` ◐, Proxy activo |

## Fallos
Ninguno.

## Fallos de la ronda anterior
- **F1 (redirección abierta por la normalización)** corregido ✅. `safeNextPath` (`src/lib/safe-redirect.ts`) ahora sigue estos pasos: limita la longitud a 2048, rechaza los caracteres de control y `\`, exige que empiece por `/`, construye `new URL(next, base)`, comprueba el origen y aplica la **lista blanca** `^/(dashboard|clientes|productos|facturas)(/[A-Za-z0-9_-]+)*/?$` sobre el `pathname` **ya normalizado**, además de rechazar `//` y `/\`. Cumple **SEG-7**: lista blanca después de normalizar, y lo dudoso va a `/dashboard`. Los tests cubren los casos de la ronda 2.
- **N4 (longitud de `next`)** corregido ✅. Con exactamente 2048 caracteres se respeta. Con 3 000 y con 20 000 → `303 /dashboard`, y la cabecera ya no se desborda.
- **N5 (email sin límite)** corregido ✅. El schema tiene `.max(254)` y `values.email` usa `trim().slice(0, 254)`. En vivo, un email de 5 000 caracteres devuelve "El email es demasiado largo" y un `value` de 254 caracteres.
- **N6 (`/LOGIN`)** corregido ✅. Ahora da `/dashboard`, porque la lista blanca distingue mayúsculas y `/Clientes` también va a la ruta por defecto.

## Evaluación contra SEG-7
**Fuzz local:** 300 000 entradas aleatorias combinando `/`, `.`, `%2e`, `%2f`, `%5c`, `\`, `?`, `#`, `@`, `:`, `%`, `\t`, `%09`, espacio, `//`, `..` y nombres de secciones. Todas las salidas se resuelven al mismo origen, su path está en la lista blanca y ninguna empieza por `//`. **0 fallos.**

**Casos dirigidos (función y en vivo):**

| next | Resultado |
|---|---|
| `/dashboard/..//evil.com`, `/dashboard/%2e%2e/%2e%2e//evil.com`, `/dashboard/.//evil.com` | ✅ `/dashboard` |
| `/clientes/%2F%2Fevil.com`, `/clientes/%2f%2fevil.com`, `/clientes//evil.com`, `/clientes/..//evil.com`, `/clientes/x/../..//evil.com`, `/clientes/x/%2e%2e%2f%2f%65vil.com` | ✅ `/dashboard` |
| `/.//evil.com`, `/..//evil.com`, `/%2e%2e//evil.com`, `/a/..//evil.com`, `/../..//evil.com`, `/%2e%2e/%2e%2e//evil.com` (regresión de la ronda 2) | ✅ `/dashboard` |
| `//evil.com`, `/\evil.com`, `/\/evil.com`, `/%5Cevil.com`, `https://evil.com`, `javascript:alert(1)`, `/@evil.com`, `/dashboard@evil.com`, `/dashboard:evil.com`, `/dashboard;evil`, `／／evil.com`, `/dashboard。evil.com`, `/clientes/．．/evil`, `/clientes/%252e%252e` | ✅ `/dashboard` |
| `/\t/…`, `/\n/…`, `/\r/…`, `/\u0000`, U+2028, `/dashboard?a=\r\nX: y` | ✅ `/dashboard` |
| `/login`, `/LOGIN`, `/./login`, `/`, `/api/x`, `/_next/x`, `/clientes/ä` | ✅ `/dashboard` |
| `/dashboard?next=//evil.com`, `/dashboard?//evil.com`, `/dashboard#//evil.com` | ✅ se conservan. Es una query o un hash interno y el destino sigue siendo `/dashboard` del mismo origen (aceptable) |
| `/dashboard?%0d%0aSet-Cookie:x=1` | ✅ `303 /dashboard?%0d%0aSet-Cookie:x=1`, que sigue codificado, así que no hay inyección de cabeceras |
| `/clientes?x=1`, `/facturas/abc#lineas` | ✅ se conservan |
| `next` vacío o ausente | ✅ `/dashboard` |

**Pruebas en vivo:** `npm run dev -- -p 3242` con login real de QA_A, haciendo un POST multipart a la Server Action sin JS. Todos los casos de la tabla dieron `303` a una ruta del mismo origen, y ninguno salió del origen. `/dashboard` sin sesión → `307 /login?next=%2Fdashboard`. Con la contraseña errónea sale el mensaje genérico "Email o contraseña incorrectos." y se conserva el email recortado. El servidor se apagó al terminar y el puerto 3242 quedó libre.

## Notas (no bloqueantes)
- **N7 (informativo):** en la tanda en vivo, 3 POST seguidos con la contraseña correcta devolvieron `200` sin redirección, y al repetirlos 30 s después dieron `303` correcto. Encaja con el límite de peticiones de Supabase Auth tras unos 35 logins seguidos. No es un fallo de la app, y el usuario ve el mensaje genérico.
- **N8 (informativo):** la lista blanca acepta cualquier profundidad de subrutas dentro de las 4 secciones (p. ej. `/facturas/a/b/c/d`). Es interno y seguro, y las rutas que no existan darán 404.
- **N3 de la ronda 1** sigue abierta: `typecheck` depende de `.next/types`.
- `git diff main` muestra borrados de la tarea 2 porque la rama parte de un `main` anterior (`acd456b`). Hay que integrar con cuidado (rebase o merge) para no revertir la tarea 2.
