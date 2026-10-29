import { notFound } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/server";
import { obtenerPaciente, pareceUuid } from "@/lib/pacientes/consulta";
import { listarConsultas } from "@/lib/consultas/consulta";
import { hoyISOEnEcuador } from "@/lib/fechas";
import {
  buscarCie10Accion,
  buscarMedicamentosAccion,
  guardarConsultaAccion,
} from "@/lib/consultas/acciones";
import { Migas } from "../../migas";
import { FormularioConsulta } from "./formulario-consulta";

export const metadata = { title: "Nueva consulta — Consultorio Demo" };

/**
 * Nueva consulta de UN paciente (RF-08, RF-09, RF-10, RF-11).
 *
 * ## Por qué la ruta cuelga del paciente
 *
 * Por lo mismo que el historial clínico dejó de ser una pantalla propia en la
 * Fase 3: una consulta sin paciente no existe. La cabecera de esta pantalla son
 * los datos fijos del paciente, así que la URL tiene que decir de quién es —y
 * así el breadcrumb, el botón "Cancelar" y el "atrás" del navegador vuelven a
 * su ficha, que es de donde se entra.
 *
 * El ítem "Nueva Consulta" del rail sigue existiendo: lleva a `/nueva-consulta`,
 * que reenvía al listado en modo "elige a quién atender". Ver la nota de esa
 * ruta y docs/modulos/03-Historial-Clinico.md.
 *
 * Los datos se leen con `lib/supabase/server.ts` —clave publicable y cookies de
 * la doctora, o sea RLS aplicando— y la pantalla **no escribe nada**: el
 * guardado de la consulta con su receta es la tarea 4.5.
 */
export default async function PaginaNuevaConsultaDePaciente({
  params,
}: {
  // Tipado a mano en vez de `PageProps<"/pacientes/[id]/consulta">`: ese tipo lo
  // genera Next durante el build, así que `tsc --noEmit` sobre un clon limpio
  // fallaría antes de que exista.
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!pareceUuid(id)) notFound();

  const supabase = await crearClienteServidor();
  const paciente = await obtenerPaciente(supabase, id);
  if (!paciente) notFound();

  // Las consultas anteriores hacen tres cosas aquí: precargar los antecedentes
  // de la última visita, decir cuántas van, y dar la "Fecha de Elaboración" que
  // imprime el historial. Se piden después de saber que el paciente existe: con
  // un id inventado, las dos consultas en paralelo gastarían un viaje para nada.
  const { consultas, fechaPrimeraConsulta } = await listarConsultas(supabase, paciente.id);

  // Hoy en ECUADOR, en el formato de un `<input type="date">`. Se calcula aquí
  // y no en el navegador: es la fecha por defecto de la consulta, la que se
  // guarda y se imprime en el historial y en la receta. Sale de
  // `hoyISOEnEcuador()` y no de la zona del proceso, que en Vercel es UTC y de
  // 19:00 a medianoche ya es mañana. El CHECK de menores de la base cuenta con
  // la misma fecha (migración 20261015120000).
  const hoyISO = hoyISOEnEcuador();

  // `max-w-3xl` en una columna, como el resto del sistema; `xl:max-w-7xl`
  // cuando el formulario se parte en dos, para que cada columna tenga un ancho
  // de trabajo real. El tope sigue existiendo: en un monitor muy ancho, una
  // línea de texto de 2000px no se lee.
  return (
    <section className="mx-auto w-full max-w-3xl pb-10 xl:max-w-7xl">
      <Migas
        intermedio={{ etiqueta: paciente.nombre_completo, href: `/pacientes/${paciente.id}` }}
        actual="Nueva consulta"
      />

      <header className="mt-4 mb-4">
        <h1 className="text-[26px] leading-8 font-semibold tracking-[-0.02em] text-navy">
          Nueva consulta
        </h1>
        <p className="mt-1 text-sm text-texto-secundario">
          Se registra una consulta nueva; las anteriores no se tocan nunca.
        </p>
      </header>

      <FormularioConsulta
        paciente={paciente}
        hoyISO={hoyISO}
        // `listarConsultas` devuelve de la más reciente a la más antigua, así
        // que la última visita es la primera de la lista.
        ultimaConsulta={consultas[0] ?? null}
        fechaPrimeraConsulta={fechaPrimeraConsulta}
        totalConsultas={consultas.length}
        // La Server Action viaja como prop: así el buscador no importa el
        // módulo de servidor y el bundle del cliente no se lleva `server-only`.
        buscarCie10={buscarCie10Accion}
        buscarMedicamentos={buscarMedicamentosAccion}
        guardarConsulta={guardarConsultaAccion}
      />
    </section>
  );
}
