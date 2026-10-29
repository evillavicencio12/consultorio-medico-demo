import { connection } from "next/server";
import { crearPaciente } from "@/lib/pacientes/acciones";
import { hoyISOEnEcuador } from "@/lib/fechas";
import { FormularioPaciente } from "../formulario-paciente";
import { Migas } from "../migas";

export const metadata = { title: "Nuevo paciente — Consultorio Demo" };

/**
 * Alta de paciente (RF-03, RF-04, RF-05).
 *
 * La pantalla es fina a propósito: casi todo vive en `FormularioPaciente`, que
 * es el mismo componente que usa la edición. Lo único que decide este archivo
 * es el contexto —no hay fila guardada detrás, así que documento, fecha de
 * nacimiento y sexo son obligatorios (ADR-006)— y cuál Server Action recibe el
 * envío.
 *
 * `hoyISO` se calcula aquí, en el servidor, y viaja al formulario. Es la fecha
 * con la que se decide si el paciente es menor de edad, y tiene que ser la
 * misma con la que evalúa el CHECK `acompanante_obligatorio_si_menor` — que
 * corre en Postgres, no en el navegador de la doctora.
 *
 * `await connection()` es imprescindible. Esta página no lee cookies ni
 * parámetros, así que sin él Next la prerenderiza UNA vez en el build y el
 * `hoyISO` queda congelado en la fecha del último deploy: el tope del campo de
 * fecha de nacimiento y el bloque de acompañante se decidirían con esa fecha.
 * Pasó hasta el 16 de octubre de 2026 (`○` en la salida de `next build`); ver
 * docs/arquitectura/Trampas-Recurrentes.md.
 */
export default async function PaginaNuevoPaciente() {
  await connection();
  return (
    <section className="mx-auto w-full max-w-3xl pb-10">
      <Migas actual="Nuevo paciente" />

      <header className="mt-4 mb-8">
        <h1 className="text-[26px] leading-8 font-semibold tracking-[-0.02em] text-navy">
          Registrar paciente nuevo
        </h1>
        <p className="mt-1 text-sm text-texto-secundario">
          Documento de identidad, nombre, fecha de nacimiento y sexo son
          obligatorios. Los pacientes que vinieron del Sheet pueden tenerlos
          vacíos; los nuevos, no. Si el paciente es extranjero, elige el tipo de
          documento antes de escribir el número.
        </p>
      </header>

      <FormularioPaciente
        accion={crearPaciente}
        guardado={null}
        hoyISO={hoyISOEnEcuador()}
      />
    </section>
  );
}
