"use client";

import { useState } from "react";
import { FileText, Pill, Stethoscope } from "lucide-react";
import { formatFechaCorta, formatFechaLarga, hoyEnEcuador } from "@/lib/fechas";
import { generateHistorialPdf, generateRecetaPdf } from "@/lib/pdf";
import { consultaParaPdf, medicamentoParaPdf, pacienteParaPdf } from "@/lib/consultas/pdf";
import { parseFechaNacimiento } from "@/lib/edad";
import type { ConsultaRow, PacienteRow, RecetaMedicamentoRow } from "@/lib/supabase/tipos";
import { VistaPreviaPdf } from "../../vista-previa-pdf";

/**
 * Línea de tiempo del historial clínico (RF-20), con los dos accesos a PDF de
 * cada consulta (RF-19).
 *
 * **Vive en la ficha del paciente y no en una pantalla propia.** RF-20 dice
 * "en el Historial Clínico de cada paciente": un historial clínico sin paciente
 * no existe. Ver la nota de navegación en docs/modulos/03-Historial-Clinico.md.
 *
 * El elemento visual es el que fija Sistema-de-Diseno.md como distintivo del
 * sistema: conector turquesa vertical, puntos circulares navy con anillo
 * blanco, y las fechas en IBM Plex Mono.
 *
 * Es un componente de cliente porque los PDF se generan **en el navegador**:
 * `pdf-lib` carga la plantilla física desde `/templates` por fetch, sin Server
 * Action ni API route de por medio. Los datos llegan ya leídos por el Server
 * Component con `lib/supabase/server.ts`, o sea con RLS aplicando.
 */
export function LineaTiempo({
  paciente,
  consultas,
  medicamentos,
  fechaPrimeraConsulta,
}: {
  paciente: PacienteRow;
  /** De la más reciente a la más antigua; las ordena Postgres. */
  consultas: ConsultaRow[];
  /** Agrupados por `consulta_id`. Llegan como objeto: un Map no es serializable. */
  medicamentos: Record<string, RecetaMedicamentoRow[]>;
  fechaPrimeraConsulta: string | null;
}) {
  const [vista, setVista] = useState<
    { tipo: "historial" | "receta"; consulta: ConsultaRow } | null
  >(null);

  if (consultas.length === 0) return <SinConsultas />;

  const cerrar = () => setVista(null);

  return (
    <section className="mt-6">
      <h2 className="mb-5 flex items-center gap-2 text-[17px] font-semibold text-navy">
        <Stethoscope aria-hidden size={18} strokeWidth={1.5} />
        Historial clínico
        <span className="text-sm font-normal text-texto-secundario">
          {consultas.length === 1 ? "1 consulta" : `${consultas.length} consultas`}
        </span>
      </h2>

      <ol className="relative flex flex-col gap-4">
        {/* El conector turquesa. Va detrás de los puntos (`-z-0` frente al
            `z-10` del punto) y se detiene en el último: una línea que sigue
            más allá de la última consulta sugiere que hay más y no hay. */}
        <span
          aria-hidden
          className="absolute top-3 bottom-3 left-[7px] w-0.5 bg-teal"
        />

        {consultas.map((consulta) => (
          <li key={consulta.id} className="relative pl-8">
            <Punto />
            <Tarjeta
              consulta={consulta}
              medicamentos={medicamentos[consulta.id] ?? []}
              onVerHistorial={() => setVista({ tipo: "historial", consulta })}
              onVerReceta={() => setVista({ tipo: "receta", consulta })}
            />
          </li>
        ))}
      </ol>

      {vista ? (
        <VistaPreviaPdf
          key={`${vista.tipo}-${vista.consulta.id}`}
          titulo={vista.tipo === "historial" ? "Historial clínico" : "Receta médica"}
          descripcion={`${paciente.nombre_completo} · consulta del ${
            formatFechaLarga(vista.consulta.fecha) ?? "sin fecha"
          }`}
          onCerrar={cerrar}
          generar={() => {
            // La mayoría de edad se decide contra la fecha de LA CONSULTA
            // (ADR-003), igual que al imprimir desde el formulario de consulta:
            // reimprimir un documento tiene que dar el mismo papel que el día
            // que se emitió, no recalcularlo contra hoy. Solo si esa fecha no
            // se pudiera leer cae en hoy, y hoy es el de Ecuador.
            const pdfPaciente = pacienteParaPdf(
              paciente,
              parseFechaNacimiento(vista.consulta.fecha) ?? hoyEnEcuador()
            );
            const pdfConsulta = consultaParaPdf(vista.consulta);

            if (vista.tipo === "receta") {
              return generateRecetaPdf(
                pdfPaciente,
                pdfConsulta,
                (medicamentos[vista.consulta.id] ?? []).map(medicamentoParaPdf)
              );
            }

            // "Fecha de Elaboración" del historial = la consulta más antigua
            // del paciente, nunca `created_at` (03-Historial-Clinico.md). Si
            // faltara, cae en la fecha de ESTA consulta, que es lo único cierto
            // que queda a mano.
            const primera =
              parseFechaNacimiento(fechaPrimeraConsulta) ??
              parseFechaNacimiento(vista.consulta.fecha) ??
              hoyEnEcuador();

            return generateHistorialPdf(pdfPaciente, pdfConsulta, primera);
          }}
        />
      ) : null}
    </section>
  );
}

/** Punto navy con anillo blanco, el distintivo de Sistema-de-Diseno.md. */
function Punto() {
  return (
    <span
      aria-hidden
      className="absolute top-3 left-0 z-10 block h-4 w-4 rounded-full border-2 border-superficie bg-navy ring-1 ring-teal"
    />
  );
}

function Tarjeta({
  consulta,
  medicamentos,
  onVerHistorial,
  onVerReceta,
}: {
  consulta: ConsultaRow;
  medicamentos: RecetaMedicamentoRow[];
  onVerHistorial: () => void;
  onVerReceta: () => void;
}) {
  const motivo = consulta.motivo_consulta?.trim();

  return (
    <article className="rounded-tarjeta border border-borde bg-superficie p-4 shadow-clinica">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {/* Fecha en mono: Sistema-de-Diseno.md la fija así para la línea de
            tiempo, y alinea las fechas de una columna a otra. */}
        <time
          dateTime={consulta.fecha}
          className="identificador text-[15px] font-semibold whitespace-pre text-navy"
        >
          {formatFechaCorta(consulta.fecha) ?? "sin fecha"}
        </time>

        {consulta.numero_receta ? (
          <span className="rounded-full bg-teal-tint px-2.5 py-0.5 text-xs font-medium text-teal">
            Receta <span className="identificador">#{consulta.numero_receta}</span>
          </span>
        ) : null}

        {consulta.cie10_codigo ? (
          <span className="identificador text-xs text-texto-secundario">
            {consulta.cie10_codigo}
          </span>
        ) : null}
      </div>

      {/* El motivo, recortado a dos líneas: la línea de tiempo es para
          reconocer la visita, no para leerla entera. El detalle está en el PDF,
          que es el documento que la doctora ya conoce en papel. */}
      <p
        className={`mt-1.5 text-sm ${
          motivo
            ? "line-clamp-2 text-navy"
            : "text-texto-secundario italic underline decoration-borde decoration-dotted underline-offset-4"
        }`}
      >
        {motivo || "Sin motivo registrado"}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <BotonPdf onClick={onVerHistorial} Icono={FileText}>
          Ver historial
        </BotonPdf>

        {/* El botón de receta solo aparece si hay algo que recetar. Una consulta
            puede no llevar medicamentos —una revisión, un control— y su PDF
            saldría con la mitad "Prescripción" en blanco. Por eso los
            medicamentos se traen con la pantalla: para poder decidir esto sin
            un viaje extra al servidor. */}
        {medicamentos.length > 0 ? (
          <BotonPdf onClick={onVerReceta} Icono={Pill}>
            Ver receta
            <span className="ml-1 text-texto-secundario">
              ({medicamentos.length === 1 ? "1 medicamento" : `${medicamentos.length} medicamentos`})
            </span>
          </BotonPdf>
        ) : (
          <span className="flex items-center gap-1.5 rounded-control border border-dashed border-borde px-3 py-1.5 text-sm text-texto-secundario">
            <Pill aria-hidden size={16} strokeWidth={1.5} />
            Sin medicamentos recetados
          </span>
        )}
      </div>
    </article>
  );
}

function BotonPdf({
  onClick,
  Icono,
  children,
}: {
  onClick: () => void;
  Icono: typeof FileText;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-control border border-navy px-3 py-1.5 text-sm font-semibold text-navy transition-colors hover:bg-navy-tint hover:text-teal"
    >
      <Icono aria-hidden size={16} strokeWidth={1.5} />
      {children}
    </button>
  );
}

/**
 * El estado vacío, que hoy es el estado de los 164 pacientes: la tabla
 * `consultas` no tiene ninguna fila porque el formulario de "Nueva Consulta" es
 * la Fase 4.
 *
 * Tiene que leerse como "todavía no ha pasado", no como "algo falló". Por eso
 * dice qué falta y no se disfraza de error: ni rojo, ni ícono de alerta, ni
 * "no se pudieron cargar las consultas".
 */
function SinConsultas() {
  return (
    <div className="mt-6 flex flex-col items-center gap-2 rounded-tarjeta border border-dashed border-borde bg-superficie px-6 py-12 text-center">
      <Stethoscope aria-hidden className="text-texto-secundario" size={26} strokeWidth={1.5} />
      <p className="font-semibold text-navy">Sin consultas registradas</p>
      <p className="max-w-md text-sm text-texto-secundario">
        Cuando se registre la primera consulta de este paciente aparecerá aquí su
        línea de tiempo, con el historial clínico y la receta de cada visita en PDF.
      </p>
    </div>
  );
}
