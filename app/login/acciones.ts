"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { crearClienteServidor } from "@/lib/supabase/server";

export type EstadoLogin = { error: string | null };

/**
 * Inicia sesión (RF-01). Server Action: la contraseña viaja en el POST y nunca
 * llega al bundle que se descarga el navegador.
 *
 * 01-Autenticacion.md: usuaria única, sin registro público y sin recuperación
 * de contraseña — si la doctora la pierde, se restablece a mano desde el panel
 * de Supabase. Por eso aquí no hay ningún flujo de "olvidé mi clave".
 */
export async function iniciarSesion(
  _estadoPrevio: EstadoLogin,
  formData: FormData
): Promise<EstadoLogin> {
  const correo = String(formData.get("correo") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!correo || !password) {
    return { error: "Ingresa tu correo y tu contraseña." };
  }

  const supabase = await crearClienteServidor();
  const { error } = await supabase.auth.signInWithPassword({
    email: correo,
    password,
  });

  if (error) {
    // Un solo mensaje, igual para correo inexistente que para contraseña
    // incorrecta: si se distinguieran, cualquiera podría averiguar qué correos
    // tienen cuenta (enumeración de usuarios, ver Seguridad-OWASP.md).
    return { error: "Correo o contraseña incorrectos." };
  }

  // `volverA` lo pone el proxy con la ruta que se intentó abrir sin sesión.
  // Se acepta solo si es interna: un valor como "https://otro-sitio"
  // convertiría este login en un trampolín de phishing. "//host" también se
  // rechaza — el navegador lo interpreta como URL absoluta.
  const solicitada = String(formData.get("volverA") ?? "");
  const destino =
    solicitada.startsWith("/") && !solicitada.startsWith("//")
      ? solicitada
      : "/pacientes";

  revalidatePath("/", "layout");
  redirect(destino);
}

/** Cierra la sesión y devuelve al login. */
export async function cerrarSesion() {
  const supabase = await crearClienteServidor();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
