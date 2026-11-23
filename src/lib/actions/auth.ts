"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { safeNextPath } from "@/lib/safe-redirect";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "./state";

const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Introduce tu email")
    .max(254, "El email es demasiado largo")
    .pipe(z.email("Introduce un email válido")),
  password: z.string().min(1, "Introduce tu contraseña"),
  next: z.string().optional(),
});

function loginErrorMessage(code: string | undefined): string {
  switch (code) {
    // Same text for wrong email or password: do not reveal which accounts exist.
    case "invalid_credentials":
      return "Email o contraseña incorrectos.";
    case "email_not_confirmed":
      return "Tu email aún no está confirmado. Revisa tu bandeja de entrada.";
    default:
      return "No se ha podido iniciar sesión. Inténtalo de nuevo en unos minutos.";
  }
}

export async function login(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const rawEmail = formData.get("email");
  // Echoed back so the form keeps the email after an error (React resets forms).
  const values = { email: typeof rawEmail === "string" ? rawEmail.trim().slice(0, 254) : "" };

  const parsed = loginSchema.safeParse({
    email: rawEmail ?? "",
    password: formData.get("password") ?? "",
    next: formData.get("next") ?? undefined,
  });
  if (!parsed.success) {
    return { ok: false, fieldErrors: z.flattenError(parsed.error).fieldErrors, values };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    return { ok: false, message: loginErrorMessage(error.code), values };
  }

  redirect(safeNextPath(parsed.data.next));
}

export async function logout(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
