# Tarea 4 · Ronda 1 · Veredicto: APROBADA

## Puerta de calidad
| Paso | Resultado |
|---|---|
| lint | ✅ sin errores ni warnings |
| typecheck | ✅ `next typegen && tsc --noEmit` limpio |
| test | ✅ 318 tests (7 archivos) |
| build | ✅ `/clientes` como Partial Prerender (◐) |

## Fallos
| # | Directriz | Severidad | Archivo:línea | Problema | Corrección esperada |
|---|---|---|---|---|---|
| F1 | TST-2 / contrato (búsqueda literal) | menor | src/lib/domain/search.ts:42 | `*` no se escapa, y PostgREST lo convierte en `%` dentro de `ilike` aunque el valor vaya entre comillas. Se comprobó en vivo: `?q=*` devuelve los 4 clientes de QA_A y `?q=<tag>*plain` encuentra "<tag> plain". En cambio, `%` y `_` sí se tratan como literales (`<tag>%plain` → 0). Como lo limita RLS, no filtra datos de otros usuarios. Pero el JSDoc dice "literal text", y la tarea 5 va a reutilizar la función. | Escapar o neutralizar `*` (p. ej. sustituirlo por `\*` si PostgREST lo respeta o, si no, filtrarlo) y añadir un test con `*`. |
| F2 | UX-1 | menor | src/components/ConfirmButton.tsx:71 | La pregunta `¿Eliminar a {name}?` es un `<span>` dentro de un `flex-wrap` sin `break-words` ni `min-w-0`. Un nombre de 120 caracteres sin espacios desborda la tarjeta a 375 px en el paso de confirmación (el nombre de la tarjeta sí lleva `break-words`). | Añadir `min-w-0 break-words` (o `[overflow-wrap:anywhere]`) al span. |

## Pruebas en vivo
`npm run dev -- -p 3250` con sesión real de QA_A (cookies de `@supabase/ssr`). Las Server Actions se invocaron por HTTP, con el `encodeReply` real de React, y los efectos se comprobaron por REST con supabase-js. Al terminar se apagó el servidor y el puerto quedó libre.

| Caso | Resultado |
|---|---|
| Crear válido (NIF `12345678z`) | ✅ "Cliente creado", guardado como `12345678Z` y con `owner_id` de QA_A |
| NIF inválido `12345678A` | ✅ error en el campo `tax_id` y valores conservados |
| Nombre vacío / 100 000 caracteres / dirección de 5000 / email inválido | ✅ errores por campo (obligatorio, máx. 120, máx. 300, correo inválido). El eco se recorta a 400 caracteres |
| `id` no UUID al editar o borrar, `id` ausente al borrar | ✅ "El cliente no existe o ya se ha eliminado." sin llegar a la BD |
| Editar o borrar un cliente de QA_B con la sesión de QA_A | ✅ NOT_FOUND. La fila de B sigue intacta (comprobado por REST) |
| Acciones sin sesión | ✅ las corta `proxy.ts`, y la acción vuelve a comprobar `getUser()` |
| XSS en name/address (`<script>`, `<img onerror>`, `"><svg onload>`) | ✅ en el HTML servido solo aparece escapado (`&lt;script&gt;`), nunca crudo |
| Editar el propio cliente vaciando los opcionales | ✅ tax_id, email, phone y address pasan a `null` |
| `?q=` con `a,b`, `a)`, `(`, `%`, `_`, `\`, `x"y`, `'`, `).or(id.neq.…)`, `name.eq.x,owner_id.neq.x`, `%25` | ✅ 200, sin error crudo, sin inyección de filtros y sin datos de B. `%` y `_` se tratan como literales |
| `?q=*` | ⚠️ actúa como comodín (F1) |
| `?edit=` con el UUID de B, `nope` o `' or 1=1` | ✅ "El cliente no existe…", sin error de Postgres y sin fugar datos |
| Borrar un cliente con una factura (borrador) | ✅ "No se puede eliminar: tiene facturas asociadas" |
| Borrar el propio cliente | ✅ "Cliente eliminado" |
| Limpieza | ✅ 0 filas `QA4-%` en A y en B, y factura de prueba borrada |

**Mobile-first (HTML servido):** está el `viewport` correcto. Los únicos anchos fijos son `w-56`, `w-[32%]` y `w-[16%]`, que viven en la tabla `hidden lg:block`. Las tarjetas (`lg:hidden`) no tienen anchos fijos y el nombre, el email y la dirección llevan `break-words`/`break-all`. El `w-48` y el `grid-cols-4` vienen del layout previo (skeleton y nav inferior). No hay scroll horizontal salvo en el caso límite de F2.

## Revisión por directriz
- **SEG-1** ✅ sin secretos. **SEG-2** ✅ `saveCustomer` y `deleteCustomer` llaman a `auth.getUser()` y validan con Zod (`customerSchema`, `uuidSchema`). La página usa `getCurrentUser()`. **SEG-3** ✅ RLS sin cambios, y además se filtra por `.eq("owner_id", user.id)`. **SEG-5** ✅ todos los errores pasan por `toUserMessage`. **SEG-6** ✅ `id` y `?edit=` se validan como UUID antes de usarse. **SEG-7** ✅ no hay redirecciones con destino del usuario (`closeHref` se construye con `URLSearchParams` sobre `/clientes`).
- **DOM-6** ✅ el NIF se valida con `isValidSpanishTaxId` si se informa. **DOM-7** n/a (no hay entradas numéricas).
- **UX-1** ✅ (salvo F2). **UX-2** ✅ errores por campo con `aria-invalid` y `aria-describedby`, "Guardando…" mientras está pendiente, y "Cliente creado" o "Cliente guardado" al terminar. **UX-3** ✅ estado vacío con CTA, tanto sin clientes como sin resultados. **UX-4** ✅ todos los campos tienen label, hay `:focus-visible` global y los enlaces y botones de fila llevan `aria-label`. **UX-5** n/a. **UX-6** ✅ `ConfirmButton` confirma en dos pasos y admite Escape.
- **ALC-2** ✅ no se tocan productos ni facturas. **ALC-3** ✅ sin `console.log`, `any`, `@ts-ignore` ni código comentado. **ALC-4** ✅ `await searchParams`. **ALC-5** ✅ la página exterior es síncrona y las lecturas de `searchParams` y de sesión van en un `<Suspense>` con skeleton. No se usa `use cache`.
- **TST-1** ✅ `search.ts` tiene tests y el cambio de `validation.ts` también. **TST-2** ✅ cubren vacío, no-string, array, control chars, límite, emojis, comodines, comillas y columnas inválidas (falta `*`, F1). **TST-3** ✅ prueban comportamiento.

### ALC-1: archivos extra declarados (todos justificados)
- `clientes/CustomerList.tsx`: separa tarjetas y tabla de `page.tsx`, en la misma carpeta de la tarea. ✅
- `src/components/ui.tsx` y `PageHeader.tsx`: primitivas de presentación sin hooks que van a reutilizar las tareas 5 y 6. Es razonable. ✅
- `src/lib/domain/search.ts` (+test): función pura para que `?q=` no se pueda inyectar en `.or()`, con tests, y la usará la tarea 5. ✅
- `validation.ts` (+test): añade límites a email (254), phone (30) y address (300), porque la BD no tiene `CHECK` de longitud en esas columnas. Es un cambio aditivo y tiene test. ✅

### Desviaciones declaradas
- La tabla aparece desde `lg` en vez de `md`: aceptable. Entre 768 y 1023 px se ven tarjetas, que no desbordan, y el contrato solo pide "tabla en escritorio".
- El panel sigue abierto tras crear: aceptable. Muestra "Cliente creado", React resetea el formulario a vacío y se puede dar de alta otro cliente. Al editar, el formulario se rellena con los datos revalidados.

## Notas (no bloqueantes)
- El Orquestador debería añadir a la lista de archivos de la tarea 4 en PLAN.md los nuevos compartidos (`ui.tsx`, `PageHeader.tsx` y `search.ts`), para que la tarea 5 los reutilice en vez de duplicarlos.
- `saveCustomer` valida con Zod antes de comprobar la sesión. No es explotable (no hay acceso a datos antes de `getUser()` y el proxy corta antes), pero el orden "sesión → validación" es más uniforme.
- Tarea crítica (datos personales): según CLAUDE.md toca `/codex:adversarial-review`, que tiene que lanzar Darío.
