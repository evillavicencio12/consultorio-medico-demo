import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertCircle,
  CalendarDays,
  CircleDashed,
  Check,
  ClipboardPlus,
  Pencil,
  Users,
} from "lucide-react";
import { crearClienteServidor } from "@/lib/supabase/server";
import { obtenerPaciente, pareceUuid } from "@/lib/pacientes/consulta";
import { listarConsultas } from "@/lib/consultas/consulta";
import {
  camposPendientes,
  etiquetaSexo,
  etiquetaTipoDocumento,
  listarPendientes,
  prefijoDocumento,
} from "@/lib/pacientes/campos";
import { formatearDocumento } from "@/lib/pacientes/documento";
import {
  SIN_DOCUMENTO,
  SIN_FECHA_NACIMIENTO,
  formatEdadListado,
  formatFechaLarga,
  iniciales,
  tieneAlergia,
} from "@/lib/pacientes/formato";
import type { PacienteRow } from "@/lib/supabase/tipos";
import { hoyEnEcuador } from "@/lib/fechas";
import { Migas } from "../migas";
import { LineaTiempo } from "./linea-tiempo";

export const metadata = { title: "Ficha del paciente — Consultorio Demo" };

/**
 * Ficha del paciente, solo lectura (RF-04, RF-07).
 *
 * Es lo que abre una fila del listado. Hasta esta sesión la fila no llevaba a
 * ningún sitio, con la nota de que un chevron que no abre nada es peor que no
 * tenerlo; ahora abre esto.
 *
 * **La línea de tiempo de consultas NO está aquí, y es a propósito.** Es la
 * Fase 3 y hoy `consultas` tiene 0 filas: una línea de tiempo vacía en 164
 * fichas no informa de nada. Lo que sí hay es el bloque que dice qué va a ir
 * ahí, para que la ausencia se lea como "todavía no" y no como "se perdió".
 *
 * Lo que la pantalla sí trae, además de los datos fijos:
 *
 *  - **La alergia con su texto completo**, no solo la etiqueta roja del
 *    listado. Es el único dato de esta pantalla que cambia una decisión
 *    clínica, así que va arriba y entero.
 *  - **Qué le falta a la ficha, con enlace directo a completarlo.** Es lo que
 *    conecta el filtro "Fichas incompletas (83)" del listado con la pantalla
 *    que de verdad cierra la deuda: se llega desde el filtro, se ve qué falta y
 *    se completa sin buscar el campo entre diecisiete.
 *  - **La fecha de registro.** En los 164 migrados es la de la importación, no
 *    la de la primera consulta; distinguir "esta ficha vino del Sheet" de
 *    "esta la registré yo" explica por qué a una le faltan datos y a la otra no.
 */
export default async function PaginaFichaPaciente({
  params,
  searchParams,
}: {
  // Tipado a mano en vez de `PageProps<"/pacientes/[id]">`: ese tipo lo genera
  // Next durante el build, así que `tsc --noEmit` sobre un clon limpio fallaría
  // antes de que exista. En Next 16 los dos llegan como promesa.
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  if (!pareceUuid(id)) notFound();

  const supabase = await crearClienteServidor();
  const paciente = await obtenerPaciente(supabase, id);
  if (!paciente) notFound();

  // Se pide después de saber que el paciente existe: con un id inventado, las
  // dos consultas en paralelo habrían gastado un viaje para nada.
  const { consultas, medicamentos, fechaPrimeraConsulta } = await listarConsultas(
    supabase,
    paciente.id
  );

  const { nuevo, guardado } = await searchParams;

  const hoy = hoyEnEcuador();
  const edad = formatEdadListado(paciente.fecha_nacimiento, hoy);
  const pendientes = camposPendientes(paciente);

  return (
    <section className="mx-auto w-full max-w-3xl pb-10">
      <Migas actual={paciente.nombre_completo} />

      {nuevo ? <AvisoGuardado texto="Paciente registrado." /> : null}
      {guardado ? <AvisoGuardado texto="Cambios guardados." /> : null}

      <Encabezado paciente={paciente} edad={edad} />

      {tieneAlergia(paciente.alergia_actual) ? (
        <AvisoAlergia detalle={paciente.alergia_actual as string} />
      ) : null}

      {pendientes.length > 0 ? (
        <div className="mt-4 flex flex-col gap-3 rounded-tarjeta border border-borde bg-navy-tint px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2.5 text-sm text-navy">
            <CircleDashed
              aria-hidden
              className="mt-0.5 shrink-0 text-texto-secundario"
              size={18}
              strokeWidth={1.5}
            />
            <span>
              Falta {listarPendientes(pendientes)}. Se puede preguntar en la
              próxima consulta.
            </span>
          </p>
          <Link
            href={`/pacientes/${paciente.id}/editar`}
            className="shrink-0 rounded-control border border-navy px-3 py-1.5 text-center text-sm font-semibold text-navy transition-colors hover:bg-superficie"
          >
            Completar ficha
          </Link>
        </div>
      ) : null}

      {/* Los datos fijos van sobre `#E8EEF2`: Sistema-de-Diseno.md reserva ese
          fondo para los bloques que NO se editan en la pantalla en la que se
          ven. Es la misma señal que usará "Nueva Consulta" con la cabecera del
          paciente, y conviene que signifique lo mismo en las dos. */}
      <Bloque titulo="Datos del paciente" icono={CalendarDays} fondo="fijo">
        {/* La etiqueta del dato ES el tipo de documento: "Cédula ecuatoriana"
            o "Pasaporte". Así el tipo se lee sin gastar una fila aparte, y no
            queda un renglón "Tipo de documento: Cédula" repetido en 164
            fichas para decir lo que ya se daba por supuesto. */}
        <Dato
          etiqueta={
            paciente.documento
              ? etiquetaTipoDocumento(paciente.tipo_documento)
              : "Documento de identidad"
          }
          valor={
            paciente.documento
              ? formatearDocumento(paciente.documento, paciente.tipo_documento)
              : null
          }
          vacio={SIN_DOCUMENTO}
          mono
        />
        <Dato
          etiqueta="Fecha de nacimiento"
          valor={formatFechaLarga(paciente.fecha_nacimiento)}
          vacio="No registrada"
        />
        <Dato etiqueta="Edad" valor={edad} vacio={SIN_FECHA_NACIMIENTO} />
        <Dato etiqueta="Sexo" valor={etiquetaSexo(paciente.sexo)} vacio="No registrado" />
        <Dato etiqueta="Estado civil" valor={paciente.estado_civil} vacio="No registrado" />
        <Dato
          etiqueta="Registrado el"
          valor={formatFechaLarga(paciente.created_at.slice(0, 10))}
          vacio="—"
        />
      </Bloque>

      <Bloque titulo="Contacto">
        <Dato etiqueta="Teléfono" valor={paciente.telefono} vacio="No registrado" mono />
        <Dato etiqueta="Correo" valor={paciente.correo} vacio="No registrado" />
        <Dato etiqueta="Domicilio" valor={paciente.domicilio} vacio="No registrado" ancho="completo" />
        <Dato etiqueta="Ocupación" valor={paciente.ocupacion} vacio="No registrada" ancho="completo" />
      </Bloque>

      {paciente.nombre_acompanante || paciente.documento_acompanante ? (
        <Bloque titulo="Acompañante" icono={Users} fondo="fijo">
          <Dato etiqueta="Nombre" valor={paciente.nombre_acompanante} vacio="No registrado" />
          <Dato
            etiqueta={
              paciente.documento_acompanante
                ? etiquetaTipoDocumento(paciente.tipo_documento_acompanante)
                : "Documento"
            }
            valor={
              paciente.documento_acompanante
                ? formatearDocumento(
                    paciente.documento_acompanante,
                    paciente.tipo_documento_acompanante
                  )
                : null
            }
            vacio="No registrado"
            mono
          />
          <Dato etiqueta="Teléfono" valor={paciente.telefono_acompanante} vacio="No registrado" mono />
          <Dato etiqueta="Correo" valor={paciente.correo_acompanante} vacio="No registrado" />
        </Bloque>
      ) : null}

      <Bloque titulo="Antecedentes heredofamiliares">
        <Dato
          etiqueta="Antecedentes"
          valor={paciente.antecedentes_heredofamiliares}
          vacio="No registrados"
          ancho="completo"
        />
      </Bloque>

      {/* RF-20 + RF-19. El historial clínico de un paciente ES esta línea de
          tiempo, y por eso vive aquí y no en una pantalla aparte — ver la nota
          de navegación en docs/modulos/03-Historial-Clinico.md.

          El `Map` se convierte en objeto: lo que cruza del Server Component al
          componente de cliente tiene que ser serializable, y un Map no lo es. */}
      <LineaTiempo
        paciente={paciente}
        consultas={consultas}
        medicamentos={Object.fromEntries(medicamentos)}
        fechaPrimeraConsulta={fechaPrimeraConsulta}
      />
    </section>
  );
}

function Encabezado({ paciente, edad }: { paciente: PacienteRow; edad: string | null }) {
  return (
    <header className="mt-4 flex flex-col gap-4 rounded-tarjeta border border-borde bg-superficie p-5 shadow-clinica sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div className="flex min-w-0 items-center gap-4">
        <span
          aria-hidden
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-navy-tint text-base font-semibold text-navy"
        >
          {iniciales(paciente.nombre_completo)}
        </span>
        <div className="min-w-0">
          {/* El nombre tal como está guardado (mayúsculas): es como la doctora
              lo tiene archivado y como sale impreso. */}
          <h1 className="text-[22px] leading-7 font-semibold tracking-[-0.01em] text-navy">
            {paciente.nombre_completo}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-texto-secundario">
            {paciente.documento ? (
              <span className="flex items-baseline gap-1.5">
                {prefijoDocumento(paciente.tipo_documento) ? (
                  <span className="text-xs font-medium">
                    {prefijoDocumento(paciente.tipo_documento)}
                  </span>
                ) : null}
                <span className="identificador">
                  {formatearDocumento(paciente.documento, paciente.tipo_documento)}
                </span>
              </span>
            ) : (
              <span className="italic">{SIN_DOCUMENTO}</span>
            )}
            <span aria-hidden className="text-borde">·</span>
            <span className={edad ? "" : "italic"}>{edad ?? SIN_FECHA_NACIMIENTO}</span>
          </div>
        </div>
      </div>

      {/* Dos acciones, y el orden dice para qué se abre una ficha: casi
          siempre para atender, no para corregir datos. Por eso "Nueva
          consulta" es la turquesa y "Editar ficha" pasa a secundaria — el
          botón primario del sistema es uno solo por pantalla
          (Sistema-de-Diseno.md). */}
      <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
        <Link
          href={`/pacientes/${paciente.id}/editar`}
          className="flex items-center justify-center gap-2 rounded-control border border-navy px-4 py-2.5 font-semibold text-navy transition-colors hover:bg-navy-tint"
        >
          <Pencil aria-hidden size={18} strokeWidth={1.5} />
          Editar ficha
        </Link>
        <Link
          href={`/pacientes/${paciente.id}/consulta`}
          className="flex items-center justify-center gap-2 rounded-control bg-teal px-4 py-2.5 font-semibold text-white transition-colors hover:bg-teal-hover"
        >
          <ClipboardPlus aria-hidden size={18} strokeWidth={1.5} />
          Nueva consulta
        </Link>
      </div>
    </header>
  );
}

/**
 * RF-07 en su forma completa. En el listado la alergia es una etiqueta que dice
 * QUE la hay; aquí se lee CUÁL es, porque es la pantalla que se abre antes de
 * recetar. Rojo `#D64545` sobre `#FBEAEA`, uno de los dos únicos usos
 * permitidos del rojo en el sistema.
 */
function AvisoAlergia({ detalle }: { detalle: string }) {
  return (
    <div className="mt-4 rounded-tarjeta border border-rojo bg-rojo-tint px-4 py-3">
      <p className="flex items-center gap-2 text-sm font-semibold tracking-[0.05em] text-rojo">
        <AlertCircle aria-hidden size={18} strokeWidth={1.5} />
        ALERGIA REGISTRADA
      </p>
      <p className="mt-1.5 pl-7 text-[15px] text-navy">{detalle}</p>
    </div>
  );
}

/** Confirmación de lo que acaba de pasar. Turquesa: el sistema no tiene un
 *  verde de "éxito" aparte, el acento cumple ese papel (Sistema-de-Diseno.md). */
function AvisoGuardado({ texto }: { texto: string }) {
  return (
    <p
      role="status"
      className="mt-4 flex items-center gap-2 rounded-control bg-teal-tint px-3 py-2.5 text-sm font-medium text-teal"
    >
      <Check aria-hidden size={16} strokeWidth={1.5} />
      {texto}
    </p>
  );
}

function Bloque({
  titulo,
  icono: Icono,
  fondo = "normal",
  children,
}: {
  titulo: string;
  icono?: typeof Users;
  fondo?: "normal" | "fijo";
  children: React.ReactNode;
}) {
  return (
    <section
      className={`mt-4 rounded-tarjeta border border-borde p-5 sm:p-6 ${
        fondo === "fijo" ? "bg-navy-tint" : "bg-superficie shadow-clinica"
      }`}
    >
      <h2 className="flex items-center gap-2 text-[17px] font-semibold text-navy">
        {Icono ? <Icono aria-hidden size={18} strokeWidth={1.5} /> : null}
        {titulo}
      </h2>
      <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">{children}</dl>
    </section>
  );
}

/**
 * Un dato de la ficha.
 *
 * El texto de ausencia sigue la regla que fijó el listado (formato.ts): un
 * campo que la base no tiene se dice con PALABRAS y en tipografía de cuerpo,
 * nunca como celda vacía ni en la mono de identificadores — para que no pueda
 * leerse como un valor real ni como un fallo de carga.
 */
function Dato({
  etiqueta,
  valor,
  vacio,
  mono = false,
  ancho = "medio",
}: {
  etiqueta: string;
  valor: string | null | undefined;
  vacio: string;
  mono?: boolean;
  ancho?: "medio" | "completo";
}) {
  const hayDato = typeof valor === "string" && valor.trim().length > 0;

  return (
    <div className={ancho === "completo" ? "sm:col-span-2" : ""}>
      <dt className="text-[13px] font-semibold tracking-[0.05em] text-texto-secundario">
        {etiqueta.toUpperCase()}
      </dt>
      <dd
        className={
          hayDato
            ? `mt-1 text-[15px] whitespace-pre-wrap text-navy ${mono ? "identificador" : ""}`
            : "mt-1 text-[15px] text-texto-secundario italic underline decoration-borde decoration-dotted underline-offset-4"
        }
      >
        {hayDato ? valor : vacio}
      </dd>
    </div>
  );
}
