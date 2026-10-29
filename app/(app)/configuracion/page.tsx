import { crearClienteServidor } from "@/lib/supabase/server";
import { contarCatalogo } from "@/lib/medicamentos/importar";
import { ImportarMedicamentos } from "./importar-medicamentos";

export const metadata = { title: "Configuración — Consultorio Demo" };

/**
 * Configuración (RF-13).
 *
 * La definición original del proyecto ya la contemplaba así: "pestaña opcional,
 * de uso ocasional". No es una pantalla de preferencias —el sistema tiene una
 * sola usuaria y ninguna opción que elegir—: es donde viven las tareas de
 * mantenimiento que antes solo se podían hacer desde una terminal. Hoy hay una,
 * la reimportación del catálogo de medicamentos.
 *
 * El conteo se hace **aquí, en el servidor**, con la sesión de la doctora y RLS
 * aplicando: es lo único que la pantalla necesita saber antes de que nadie
 * pulse nada, y así el número ya está pintado cuando la pantalla aparece en vez
 * de después de un viaje a Google.
 *
 * `dynamic = "force-dynamic"`: el número cambia cuando se importa, y una
 * versión cacheada diría "162" para siempre. Es una pantalla que se abre cada
 * varias semanas; no hay nada que ahorrar cacheándola.
 */
export const dynamic = "force-dynamic";

export default async function PaginaConfiguracion() {
  const supabase = await crearClienteServidor();
  const total = await contarCatalogo(supabase);

  return (
    <section className="mx-auto w-full max-w-4xl pb-10">
      <header className="mb-6">
        <h1 className="text-[26px] leading-8 font-semibold tracking-[-0.02em] text-navy">
          Configuración
        </h1>
        <p className="mt-1 max-w-prose text-sm text-texto-secundario">
          Tareas de mantenimiento del sistema. No hace falta entrar aquí para
          atender a un paciente.
        </p>
      </header>

      <ImportarMedicamentos totalInicial={total} />
    </section>
  );
}
