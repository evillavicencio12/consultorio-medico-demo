import Link from "next/link";
import { AlertCircle, ChevronRight, CircleDashed, SearchX, Users } from "lucide-react";
import type { PacienteListado } from "@/lib/pacientes/consulta";
import { ETIQUETA_PENDIENTE, prefijoDocumento, type CampoPendiente } from "@/lib/pacientes/campos";
import { formatearDocumento } from "@/lib/pacientes/documento";
import {
  SIN_DOCUMENTO,
  SIN_FECHA_NACIMIENTO,
  fichaIncompleta,
  formatEdadListado,
  iniciales,
  tieneAlergia,
} from "@/lib/pacientes/formato";

/**
 * La tarjeta de un paciente en el listado, y los estados vacíos.
 *
 * Están fuera de `page.tsx` para poder renderizarlos sin sesión ni base de
 * datos (`tests/fila-paciente.test.tsx`). No es una separación
 * cosmética: la etiqueta roja de alergia (RF-07) NO se puede comprobar contra
 * los datos reales —`alergia_actual` está vacío en los 164 pacientes, porque se
 * alimenta desde la consulta y todavía no hay ninguna—, así que la única forma
 * de saber que aparece cuando toca es renderizarla con un paciente de prueba.
 *
 * **Desde la Sesión B la fila entera es un enlace a la ficha.** En la sesión
 * anterior se dejó a propósito sin chevron ni destino, con la nota de que una
 * flecha que no lleva a ninguna parte es peor que no tenerla. Ya lleva:
 * `/pacientes/[id]`.
 *
 * Es un solo `<Link>` envolviendo todo, y no un botón "Ver" en un rincón,
 * porque el objetivo de esta pantalla es abrir un paciente: el blanco de clic
 * debe ser la fila completa. Por eso tampoco hay un segundo enlace "Editar"
 * dentro — un enlace anidado dentro de otro es HTML inválido, y el atajo a
 * editar vive en la ficha, a un clic.
 */
export function FilaPaciente({
  paciente,
  hoy,
  detallarPendientes = false,
  paraConsulta = false,
}: {
  paciente: PacienteListado;
  hoy: Date;
  /**
   * Cuando se llegó al listado desde "Nueva Consulta" (`?para=consulta`), la
   * fila abre la consulta nueva de ese paciente en vez de su ficha. Sigue
   * siendo un solo enlace por fila: lo que cambia es el destino, no la
   * estructura — dos enlaces dentro de la misma fila serían HTML inválido y
   * partirían en dos el blanco de clic.
   */
  paraConsulta?: boolean;
  /**
   * Con el filtro "Fichas incompletas" activo, la etiqueta dice QUÉ falta en
   * vez de solo que falta algo. Revisando 83 fichas seguidas, "Falta cédula" y
   * "Falta fecha de nacimiento" son tareas distintas: la primera se pregunta,
   * la segunda a veces hay que buscarla. Sin el filtro se deja la etiqueta
   * corta, para que 164 filas no se llenen de texto.
   */
  detallarPendientes?: boolean;
}) {
  const edad = formatEdadListado(paciente.fecha_nacimiento, hoy);
  const incompleta = fichaIncompleta(paciente);

  // `sexo` no entra: no viene en las columnas del listado y, sobre todo, falta
  // en los 164 — ver la nota de `fichaIncompleta`. Tampoco entra el TIPO de
  // documento: es NOT NULL y siempre trae valor, así que un paciente con
  // pasaporte no tiene nada pendiente.
  const pendientes: CampoPendiente[] = [];
  if (!paciente.documento) pendientes.push("documento");
  if (!paciente.fecha_nacimiento) pendientes.push("fecha_nacimiento");

  // El prefijo sale solo cuando NO es una cédula: escribir "Cédula" delante de
  // 164 números sería ruido en casi toda la pantalla para distinguir un puñado
  // de fichas. Cuando aparece, informa.
  const prefijo = prefijoDocumento(paciente.tipo_documento);

  return (
    <Link
      href={paraConsulta ? `/pacientes/${paciente.id}/consulta` : `/pacientes/${paciente.id}`}
      className="flex flex-col gap-3 rounded-tarjeta border border-borde bg-superficie p-4 shadow-clinica transition-colors hover:border-teal hover:bg-teal-tint/40 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex min-w-0 items-center gap-4">
        <span
          aria-hidden
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-navy-tint text-sm font-semibold text-navy"
        >
          {iniciales(paciente.nombre_completo)}
        </span>

        <div className="min-w-0">
          {/* El nombre se muestra tal como está guardado (mayúsculas): es como
              la doctora lo tiene archivado y como sale impreso. Pasarlo a
              capitalización "bonita" rompería casos como "DE LA CRUZ". */}
          <h2 className="truncate text-[15px] font-semibold text-navy">
            {paciente.nombre_completo}
          </h2>

          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            {paciente.documento ? (
              <span className="flex items-baseline gap-1.5 text-texto-secundario">
                {prefijo ? <span className="text-xs font-medium">{prefijo}</span> : null}
                {/* Sistema-de-Diseno.md: los identificadores van en IBM Plex Mono. */}
                <span className="identificador">
                  {formatearDocumento(paciente.documento, paciente.tipo_documento)}
                </span>
              </span>
            ) : (
              <DatoFaltante>{SIN_DOCUMENTO}</DatoFaltante>
            )}

            <span aria-hidden className="text-borde">
              ·
            </span>

            {edad ? (
              <span className="text-texto-secundario">{edad}</span>
            ) : (
              <DatoFaltante>{SIN_FECHA_NACIMIENTO}</DatoFaltante>
            )}
          </div>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 pl-15 sm:pl-0">
        {incompleta ? (
          <EtiquetaIncompleta pendientes={detallarPendientes ? pendientes : []} />
        ) : null}
        {tieneAlergia(paciente.alergia_actual) ? (
          <EtiquetaAlergia detalle={paciente.alergia_actual} />
        ) : null}
        <ChevronRight
          aria-hidden
          className="hidden shrink-0 text-borde sm:block"
          size={18}
          strokeWidth={1.5}
        />
      </div>
    </Link>
  );
}

/**
 * Un dato que la base no tiene (ADR-006). Se dice con palabras y en la
 * tipografía de cuerpo —nunca en la mono de identificadores, ni como celda
 * vacía— para que no pueda leerse como un valor real ni como un fallo de carga.
 * El subrayado punteado repite la señal sin recurrir al rojo, que el sistema de
 * diseño reserva para alergias y errores de validación.
 */
function DatoFaltante({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-texto-secundario italic underline decoration-borde decoration-dotted underline-offset-4">
      {children}
    </span>
  );
}

/**
 * RF-07. Rojo `#D64545` sobre `#FBEAEA`, el único uso permitido del rojo junto
 * a los errores de validación.
 */
function EtiquetaAlergia({ detalle }: { detalle: string | null }) {
  return (
    <span
      // El texto completo en el `title`: la etiqueta dice que HAY alergia, y
      // cuál es se lee sin abrir la ficha.
      title={detalle ?? undefined}
      className="flex items-center gap-1.5 rounded-full bg-rojo-tint px-3 py-1 text-xs font-semibold text-rojo"
    >
      <AlertCircle aria-hidden size={14} strokeWidth={1.5} />
      Alergia
    </span>
  );
}

/**
 * Falta cédula o fecha de nacimiento. Deliberadamente en gris y no en rojo: una
 * ficha incompleta es una tarea pendiente, no una alerta clínica, y el sistema
 * de diseño reserva el rojo para las alergias.
 */
function EtiquetaIncompleta({ pendientes }: { pendientes: CampoPendiente[] }) {
  const detalle = pendientes.map((campo) => ETIQUETA_PENDIENTE[campo]).join(" y ");

  return (
    <span
      title={
        detalle
          ? `Falta ${detalle}. Se completa desde la ficha del paciente.`
          : "Faltan datos del paciente (cédula o fecha de nacimiento). Se completan en la próxima consulta."
      }
      className="flex items-center gap-1.5 rounded-full border border-borde bg-navy-tint px-3 py-1 text-xs font-medium text-texto-secundario"
    >
      <CircleDashed aria-hidden size={14} strokeWidth={1.5} />
      {detalle ? `Falta ${detalle}` : "Ficha incompleta"}
    </span>
  );
}

export function SinResultados({
  busqueda,
  soloIncompletas,
}: {
  busqueda: string;
  soloIncompletas: boolean;
}) {
  const Icono = busqueda ? SearchX : Users;

  return (
    <div className="flex flex-col items-center gap-3 rounded-tarjeta border border-dashed border-borde bg-superficie px-6 py-14 text-center">
      <Icono aria-hidden className="text-texto-secundario" size={28} strokeWidth={1.5} />
      <p className="font-semibold text-navy">
        {busqueda ? "Ningún paciente coincide con la búsqueda" : "No hay pacientes que mostrar"}
      </p>
      <p className="max-w-md text-sm text-texto-secundario">
        {busqueda
          ? soloIncompletas
            ? "Prueba con un apellido o quita el filtro de fichas incompletas. Si el paciente no está registrado, créalo con “Nuevo paciente”."
            : "Prueba con un apellido, o con los últimos dígitos de la cédula. Si el paciente no está registrado, créalo con “Nuevo paciente”."
          : "Registra al primer paciente con “Nuevo paciente”."}
      </p>
    </div>
  );
}
