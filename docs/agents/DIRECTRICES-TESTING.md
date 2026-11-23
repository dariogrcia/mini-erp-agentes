# Directrices de Testing (lo que Develop TIENE que cumplir)

Dueño: subagente **Testing** (`.claude/agents/testing.md`).
Develop las lee **antes** de programar. Testing revisa cada tarea contra esta lista y
devuelve los fallos citando el ID (p. ej. `SEG-2`).

**Severidad:**
- `bloqueante`: no se puede aprobar.
- `mayor`: no se puede aprobar.
- `menor`: se anota y no bloquea.

## CAL: puerta de calidad (todas bloqueantes)
- **CAL-1** `npm run lint` sin errores ni warnings.
- **CAL-2** `npm run typecheck` sin errores.
- **CAL-3** `npm test` en verde.
- **CAL-4** `npm run build` en verde.

## SEG: seguridad
- **SEG-1** *(bloqueante)* No hay secretos en el repo: claves, tokens ni contraseñas.
  Solo se permiten `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`, y
  leídas de `process.env`. La `service_role` está prohibida en `src/`.
- **SEG-2** *(bloqueante)* Toda Server Action o Route Handler que lea o escriba datos
  comprueba la sesión (`auth.getUser()`) y valida la entrada con Zod.
- **SEG-3** *(bloqueante)* Toda tabla tiene RLS activado y políticas por operación
  limitadas a `owner_id = auth.uid()`, o bien esa operación está revocada para
  `authenticated`/`anon` y solo se hace mediante una función `security definer` que
  comprueba `auth.uid()`. Ningún usuario puede leer ni modificar filas de otro.
- **SEG-4** *(bloqueante)* Las rutas privadas redirigen a `/login` sin sesión. Lo
  hace `src/proxy.ts`, con una segunda comprobación en el layout privado.
- **SEG-5** *(mayor)* Al usuario no se le muestran errores crudos de Postgres ni
  stack traces.
- **SEG-6** *(mayor)* Los IDs que llegan en `params` o formularios se validan como UUID
  antes de usarlos.

## DOM: lógica de negocio
- **DOM-1** *(bloqueante)* Los importes se calculan en céntimos enteros. No hay
  aritmética flotante con euros.
- **DOM-2** *(bloqueante)* El IVA solo admite 0, 4, 10 o 21. Por línea:
  `base = cantidad × precio`, `iva = round_half_up(base × tipo / 100)` en céntimos y
  `total = base + iva`. Los totales de la factura son sumas de líneas. TS y SQL dan el
  mismo resultado.
- **DOM-3** *(bloqueante)* Una factura no se puede emitir sin líneas ni con stock
  insuficiente. Al emitirla se descuenta el stock de forma atómica.
- **DOM-4** *(bloqueante)* Transiciones de estado válidas, y ninguna otra:
  `borrador→emitida`, `emitida→pagada`, `emitida→anulada` y `borrador→(eliminar)`.
  Una factura emitida no se edita. Al anularla se repone el stock.
- **DOM-5** *(mayor)* El número de factura es correlativo por usuario y año
  (`AAAA-NNNN`), se asigna al emitir y no se repite.
- **DOM-6** *(mayor)* Cantidades > 0, precios ≥ 0, stock ≥ 0 y NIF/CIF con formato
  válido cuando se informa.

## TST: tests
- **TST-1** *(bloqueante)* Toda función nueva de `src/lib/domain/` tiene tests.
- **TST-2** *(mayor)* Los tests cubren casos límite: cero, negativos, redondeo en el
  .5, listas vacías y entrada inválida.
- **TST-3** *(mayor)* Los tests comprueban comportamiento, no implementación. No se
  aceptan tests que no puedan fallar.

## UX: experiencia (la app se prueba en móvil y en escritorio)
- **UX-1** *(mayor)* Se usa sin scroll horizontal a 375 px de ancho. Las tablas pasan
  a tarjetas en móvil.
- **UX-2** *(mayor)* Cada formulario muestra errores por campo, un estado pendiente y
  la confirmación del resultado.
- **UX-3** *(mayor)* Los listados tienen estado vacío con llamada a la acción.
- **UX-4** *(menor)* Todos los inputs tienen `label`, el foco es visible y los
  botones de icono llevan `aria-label`.
- **UX-5** *(menor)* La moneda y las fechas se muestran en formato `es-ES`.
- **UX-6** *(mayor)* Las acciones destructivas (eliminar, anular) piden confirmación.

## ALC: alcance y limpieza
- **ALC-1** *(mayor)* Solo se tocan los archivos de la tarea, o se justifica.
- **ALC-2** *(mayor)* Se respetan las decisiones D* de `PLAN.md` y el "No hacer".
- **ALC-3** *(menor)* No hay `console.log`, código comentado, `any` ni `@ts-ignore`.
- **ALC-4** *(mayor)* Next 16: `proxy.ts` (no `middleware.ts`) y APIs de request
  asíncronas con `await`.

- **ALC-5** *(mayor)* D10: las lecturas de sesión, cookies, `params` y `searchParams` van
  dentro de un `<Suspense>` con fallback. Nada de `"use cache"` sobre datos de usuario.
  No se desactiva `cacheComponents`.

## Historial de cambios de directrices
<!-- Fecha · ID · cambio · motivo. Solo Testing modifica este archivo. -->
- 2026-11-23 · todas · versión inicial.
