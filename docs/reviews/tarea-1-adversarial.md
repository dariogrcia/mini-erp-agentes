# Tarea 1 · Revisión adversarial (Codex, /codex:adversarial-review lanzado por Darío)

```
# Codex Adversarial Review

Target: working tree diff
Verdict: needs-attention

No publicar todavía: la numeración bloquea la emisión al llegar a 10.000 facturas y la RPC permite emitir facturas con importes NaN. Revisión estática del diff; sin ejecución contra la BD.

Findings:
- [high] La factura 10.000 bloquea todas las emisiones posteriores del año (supabase/migrations/0001_init.sql:289)
  Cuando el contador alcanza 10000, lpad('10000', 4, '0') devuelve '1000': PostgreSQL trunca las cadenas que superan la longitud indicada. El número colisiona con la factura 1000 existente y viola unique(owner_id, number). La transacción revierte también el contador a 9999, por lo que cada reintento reproduce el fallo y el usuario queda sin poder emitir más facturas de ese año. Semántica documentada en [PostgreSQL](https://www.postgresql.org/docs/17/functions-string.html).
  Recommendation: Usar cuatro dígitos como anchura mínima, conservando números mayores: lpad(v_last_number::text, greatest(4, length(v_last_number::text)), '0'). Actualizar el contrato y probar las emisiones 9999, 10000 y 10001.
- [medium] La RPC acepta NaN y lo propaga a facturas emitidas (supabase/migrations/0001_init.sql:197-200)
  Una llamada autenticada puede enviar una línea válida con unit_price="NaN". El cast acepta ese valor y el CHECK unit_price >= 0 no lo rechaza: PostgreSQL considera NaN mayor que cualquier número finito. Los cálculos y sumas propagan NaN a los totales; issue_invoice permite emitir esa factura y descontar stock sin comprobar los importes. Queda una factura con importes inválidos que ya no puede editarse ni borrarse mediante las operaciones permitidas. La misma restricción insuficiente existe en products. Semántica documentada en [PostgreSQL](https://www.postgresql.org/docs/17/datatype-numeric.html).
  Recommendation: Rechazar explícitamente NaN en la RPC y añadir CHECK (unit_price <> 'NaN'::numeric) en productos y líneas. Probar que una llamada directa con ese precio falla sin persistir cambios.

Next steps:
- Corregir ambos casos y añadir pruebas SQL de regresión en una base aislada.
- Como la migración ya se aplicó según la bitácora, preparar una migración correctiva para los entornos existentes.

```
