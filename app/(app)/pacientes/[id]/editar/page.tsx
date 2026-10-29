import { notFound } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/server";
import { obtenerPaciente, pareceUuid } from "@/lib/pacientes/consulta";
import { camposPendientes } from "@/lib/pacientes/campos";
import { actualizarPaciente } from "@/lib/pacientes/acciones";
import { hoyISOEnEcuador } from "@/lib/fechas";
import { FormularioPaciente } from "../../formulario-paciente";
import { Migas } from "../../migas";

export const metadata = { title: "Editar paciente — Consultorio Demo" };

/**
 * Edición de paciente (tarea 2.3).
 *
 * **Es la pieza más importante a corto plazo de todo el módulo**, por encima
 * del alta: es el único mecanismo que tiene el sistema para cerrar la deuda que
 * dejó la migración —164 pacientes sin sexo, 83 sin documento, 29 sin fecha de
 * nacimiento—. Sin esta pantalla, esos
 * datos solo se podrían completar a mano en el panel de Supabase.
 *
 * Se llega desde la ficha ("Editar ficha") y desde el aviso "Falta el documento…"
 * que la propia ficha muestra, que es el que conecta con el filtro "Fichas
 * incompletas (83)" del listado: filtro → fila → ficha → completar.
 *
 * Lo que hace distinta a esta pantalla del alta no es el formulario —es el
 * mismo componente— sino que aquí SÍ hay una fila guardada detrás. De ella
 * salen las tres concesiones a los datos migrados, todas en
 * `lib/pacientes/formulario.ts`:
 *
 *  1. Un campo vacío puede seguir vacío: exigir los tres a la vez haría
 *     imposible guardar el sexo de alguien de quien no se sabe el documento, y la
 *     doctora se iría sin guardar nada.
 *  2. Un campo que ya tiene valor no se puede borrar.
 *  3. El documento guardado se acepta tal cual aunque no cumpla el formato —en
 *     la base hay al menos uno de 8 dígitos—, pero cualquier documento NUEVO se
 *     valida según su tipo: la cédula ecuatoriana con el dígito verificador,
 *     el pasaporte con lo poco que de él se puede comprobar (ADR-008).
 */
export default async function PaginaEditarPaciente({
  params,
}: {
  // Tipado a mano, no con `PageProps<…>`: ese tipo lo genera el build.
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!pareceUuid(id)) notFound();

  const supabase = await crearClienteServidor();
  const paciente = await obtenerPaciente(supabase, id);
  if (!paciente) notFound();

  const pendientes = camposPendientes(paciente);

  // `bind` en vez de un `<input type="hidden" name="id">`: el id no viaja en el
  // formulario, así que no hay nada que un envío manipulado pueda cambiar de
  // paciente. RLS protegería igual el acceso, pero no distingue entre dos
  // pacientes que la doctora sí puede ver — esa la cierra el bind.
  const accion = actualizarPaciente.bind(null, paciente.id);

  return (
    <section className="mx-auto w-full max-w-3xl pb-10">
      <Migas
        intermedio={{ etiqueta: paciente.nombre_completo, href: `/pacientes/${paciente.id}` }}
        actual="Editar"
      />

      <header className="mt-4 mb-8">
        <h1 className="text-[26px] leading-8 font-semibold tracking-[-0.02em] text-navy">
          Editar ficha
        </h1>
        <p className="mt-1 text-sm text-texto-secundario">
          {paciente.nombre_completo}
        </p>
      </header>

      <FormularioPaciente
        accion={accion}
        guardado={paciente}
        pendientes={pendientes}
        hoyISO={hoyISOEnEcuador()}
      />
    </section>
  );
}
