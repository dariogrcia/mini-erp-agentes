# Tarea 4 · Revisión adversarial (Codex, lanzada por Darío)

```
# Codex Adversarial Review

Target: working tree diff
Verdict: needs-attention

No entregaría todavía: el guardado permite perder cambios entre pestañas y duplicar altas tras un fallo de red. Revisión estática del árbol de trabajo; no se ejecutaron pruebas.

Findings:
- [medium] Una edición antigua sobrescribe cambios posteriores sin avisar (src/lib/actions/customers.ts:78-85)
  Dos pestañas pueden cargar el mismo cliente. Si la primera cambia el teléfono y la segunda cambia la dirección, el segundo guardado vuelve a escribir todos los campos, incluido el teléfono antiguo. El UPDATE solo compara id y propietario; no comprueba la versión leída. Ambos guardados devuelven éxito aunque se haya perdido una modificación.
  Recommendation: Añadir una versión del registro y comprobarla e incrementarla atómicamente al actualizar. Enviar la versión leída desde el formulario y devolver un conflicto recuperable cuando haya cambiado, conservando los valores introducidos.
- [medium] Reintentar un alta con resultado incierto crea otro cliente (src/lib/actions/customers.ts:74-76)
  Si Postgres confirma el INSERT pero se pierde la respuesta hacia el servidor, Supabase devuelve un error y esta acción conserva los campos y pide reintentar. El siguiente envío ejecuta otro INSERT con un UUID nuevo. La tabla customers no tiene una clave de idempotencia ni una restricción que reconozca esa misma operación, por lo que quedan dos fichas para una sola alta.
  Recommendation: Asignar una clave de operación estable al formulario de alta, conservarla durante los reintentos y garantizar su unicidad por propietario en la base de datos. Una repetición debe recuperar el resultado previo sin insertar otra fila.

Next steps:
- Añadir pruebas de dos ediciones sobre la misma versión y de reintento tras una inserción confirmada cuya respuesta se pierde.
- Ejecutar npm run verify tras las correcciones en un entorno con escritura habilitada.

```
