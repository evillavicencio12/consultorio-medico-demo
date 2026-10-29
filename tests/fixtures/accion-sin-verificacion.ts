"use server";

// EJEMPLOS MALOS, a propósito: no copiar.
//
// Son la "prueba de la prueba" de tests/sesion-acciones.test.ts: Server Actions
// que hacen algo antes de verificar la sesión, o que no la verifican. El
// detector tiene que marcar cada una. Viven en tests/, que el barrido de
// acciones no recorre, y nada de la app las importa.

import { revalidatePath } from "next/cache";
import { crearClienteServidor } from "@/lib/supabase/server";
import { clienteConSesion, SESION_CADUCADA } from "@/lib/supabase/sesion";

/** No verifica: va directo a la base. */
export async function accionSinVerificacion(texto: string) {
  const supabase = await crearClienteServidor();
  return supabase.from("pacientes").select("id").ilike("nombre_completo", String(texto));
}

/** Verifica, pero DESPUÉS de invalidar la caché (que haría a Next renderizar la página). */
export async function accionQueRevalidaAntes() {
  revalidatePath("/pacientes");
  const supabase = await clienteConSesion();
  if (!supabase) return { mensaje: SESION_CADUCADA };
  return { mensaje: null };
}

/** Verifica, pero después de tocar Storage con el cliente. */
export async function accionQueUsaStorageAntes() {
  const cliente = await crearClienteServidor();
  await cliente.storage.from("recetas").list();
  const supabase = await clienteConSesion();
  if (!supabase) return { mensaje: SESION_CADUCADA };
  return { mensaje: null };
}
