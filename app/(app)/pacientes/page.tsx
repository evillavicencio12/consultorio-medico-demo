import { crearClienteServidor } from "@/lib/supabase/server";
import { leerParametros } from "@/lib/pacientes/busqueda";
import { listarPacientes } from "@/lib/pacientes/consulta";
import { hoyEnEcuador } from "@/lib/fechas";
import { BarraDeControles } from "./controles";
import { FilaPaciente, SinResultados } from "./fila";

export const metadata = { title: "Pacientes — Consultorio Demo" };

/**
 * Listado y buscador de pacientes (RF-02, RF-06, RF-07).
 *
 * La composición sale de la pantalla "Listado de Pacientes" de Stitch —título a
 * la izquierda, buscador y botón turquesa a la derecha, una tarjeta por
 * paciente con avatar de iniciales, documento en mono y etiqueta roja de alergia—
 * pintada con los tokens de Sistema-de-Diseno.md, que es lo que manda cuando
 * chocan (Stitch exporta su paleta Material `primary #002441`).
 *
 * Dos cosas de Stitch NO se copiaron:
 *
 *  - **"Última consulta: 15 Oct, 2023"** en cada tarjeta. `consultas` tiene 0
 *    filas y el módulo de historial es de otra sesión: ese renglón sería una
 *    fecha inventada o un "—" en las 164 tarjetas. En su lugar va la edad, que
 *    sí es un dato real y que la doctora necesita a la vista.
 *  - **La paginación** ("1-3 de 45", flechas). Ver la nota de `LIMITE_FILAS`.
 *
 * (El chevron "abrir ficha" tampoco se copió en la Sesión A, porque la ficha no
 * existía todavía. Desde la Sesión B sí existe —`/pacientes/[id]`— y la fila
 * entera es el enlace, con el chevron como señal.)
 *
 * Datos leídos con `lib/supabase/server.ts`: clave publicable + cookies de la
 * doctora, o sea RLS aplicando en cada consulta.
 *
 * **Desde la Fase 4 esta pantalla tiene dos modos.** Con `?para=consulta` —a
 * donde reenvía el ítem "Nueva Consulta" del rail— cada fila abre la consulta
 * nueva de ese paciente en vez de su ficha. Es la misma pantalla con otro
 * destino, no una segunda: ver `app/(app)/nueva-consulta/page.tsx`.
 */
export default async function PaginaPacientes({
  searchParams,
}: {
  // Tipado a mano en vez de `PageProps<"/pacientes">`: ese tipo lo genera Next
  // durante el build, así que un `tsc --noEmit` sobre un clon limpio fallaría
  // antes de que exista.
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { busqueda, busquedaEfectiva, orden, soloIncompletas, paraConsulta } = leerParametros(
    await searchParams
  );

  const supabase = await crearClienteServidor();
  const { pacientes, total, totalGeneral, totalIncompletas } = await listarPacientes(supabase, {
    busqueda: busquedaEfectiva,
    orden,
    soloIncompletas,
  });

  // Una sola fecha de referencia para todas las edades de la página: si cada
  // tarjeta llamara a `new Date()`, dos pacientes que cumplen años hoy podrían
  // salir con edades distintas según el milisegundo en que se rendericen. Es el
  // día de Ecuador, no el del proceso (en Vercel, UTC): ver lib/fechas.ts.
  const hoy = hoyEnEcuador();

  return (
    <section className="mx-auto w-full max-w-5xl">
      <header className="mb-8">
        <h1 className="text-[26px] leading-8 font-semibold tracking-[-0.02em] text-navy">
          {paraConsulta ? "¿A quién vas a atender?" : "Pacientes"}
        </h1>
        <p className="mt-1 text-sm text-texto-secundario">
          {paraConsulta
            ? "Busca por nombre o documento: al elegirlo se abre su consulta nueva."
            : "Busca por nombre o documento para abrir una ficha o iniciar una consulta."}
        </p>
      </header>

      <BarraDeControles
        busqueda={busqueda}
        orden={orden}
        soloIncompletas={soloIncompletas}
        paraConsulta={paraConsulta}
        mostrados={pacientes.length}
        total={total}
        totalGeneral={totalGeneral}
        totalIncompletas={totalIncompletas}
      >
        {pacientes.length === 0 ? (
          <SinResultados busqueda={busquedaEfectiva} soloIncompletas={soloIncompletas} />
        ) : (
          <ul className="flex flex-col gap-3">
            {pacientes.map((paciente) => (
              <li key={paciente.id}>
                <FilaPaciente
                  paciente={paciente}
                  hoy={hoy}
                  detallarPendientes={soloIncompletas}
                  paraConsulta={paraConsulta}
                />
              </li>
            ))}
          </ul>
        )}
      </BarraDeControles>
    </section>
  );
}
