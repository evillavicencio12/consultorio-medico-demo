"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  Check,
  CircleDashed,
  Save,
  Users,
} from "lucide-react";
import { calcularEdad, parseFechaNacimiento } from "@/lib/edad";
import { hoyEnEcuador } from "@/lib/fechas";
import {
  ESTADOS_CIVILES,
  SEXOS,
  TIPOS_DOCUMENTO,
  etiquetaTipoDocumento,
  listarPendientes,
  type CampoPendiente,
} from "@/lib/pacientes/campos";
import {
  esTipoDocumento,
  TIPO_DOCUMENTO_POR_DEFECTO,
  type TipoDocumento,
} from "@/lib/pacientes/documento";
import {
  aDatosFormulario,
  documentoGuardado,
  requiereAcompanante,
  sinErrores,
  validarDocumento,
  validarDocumentoEditado,
  validarPaciente,
  DATOS_VACIOS,
  ESTADO_INICIAL,
  type CampoPaciente,
  type DatosPaciente,
  type ErroresPaciente,
  type EstadoPaciente,
} from "@/lib/pacientes/formulario";
import type { PacienteRow } from "@/lib/supabase/tipos";
import { AVISO_SIN_SALTOS, useTextoPlano } from "../use-texto-plano";

/**
 * El formulario de paciente — el mismo para el alta (RF-03) y para la edición
 * (tarea 2.3).
 *
 * **Un solo componente para las dos pantallas, a propósito.** Son diecisiete
 * campos con las mismas reglas; dos copias se habrían desincronizado en la
 * primera corrección. Lo que cambia entre alta y edición no es el formulario,
 * es el CONTEXTO: si hay una fila guardada detrás. De ahí salen las tres
 * diferencias —qué es obligatorio, qué cédula se acepta sin examinar y qué se
 * destaca como pendiente— y las tres las decide `lib/pacientes/formulario.ts`,
 * no este archivo.
 *
 * La composición viene de la pantalla "Registrar Paciente Nuevo" de Stitch
 * (secciones "Datos Personales" / "Contacto (opcional)" / bloque de
 * acompañante, validación en línea en la cédula, botones al pie), pintada con
 * los tokens de Sistema-de-Diseno.md. De Stitch NO se tomó nada de color ni de
 * tipografía: su export trae la paleta Material (`primary #002441`) y iconos
 * `Material Symbols`, y aquí manda `docs/`. Se agregaron además los campos
 * que su maqueta no tenía y la base sí: estado civil, domicilio, ocupación,
 * antecedentes heredofamiliares y el correo del acompañante.
 *
 * **La validación corre aquí y otra vez en la Server Action.** Esta copia es
 * para que la doctora vea el problema mientras escribe; la de allá es la que
 * defiende la base.
 */
export function FormularioPaciente({
  accion,
  guardado,
  hoyISO,
  pendientes = [],
  estadoInicial = ESTADO_INICIAL,
}: {
  accion: (estado: EstadoPaciente, formData: FormData) => Promise<EstadoPaciente>;
  /** `null` en el alta; la fila tal cual está en la base, en la edición. */
  guardado: PacienteRow | null;
  /**
   * Hoy, según el SERVIDOR, en `YYYY-MM-DD`.
   *
   * No se llama a `new Date()` aquí dentro por dos razones, y la segunda es la
   * que importa. La primera es la hidratación: servidor y navegador podrían
   * renderizar edades distintas. La segunda es que el CHECK
   * `acompanante_obligatorio_si_menor` evalúa `age()` en la zona horaria de
   * Postgres, no en la del navegador; tomar la fecha del servidor hace que
   * "menor de edad" signifique lo mismo en la pantalla y en la base, incluso en
   * las cinco horas del día en que las dos no coinciden.
   */
  hoyISO: string;
  /** Qué le falta a este paciente (solo edición). Ver `camposPendientes`. */
  pendientes?: CampoPendiente[];
  /**
   * En la aplicación siempre es el valor por defecto. Es una costura para las
   * pruebas: los estados de error —el borde rojo de la cédula, el aviso de
   * cédula duplicada— solo existen DESPUÉS de un envío, y sin este parámetro
   * la única forma de verlos renderizados sería un navegador con sesión.
   * `tests/formulario-paciente.test.tsx` los pinta pasándolo.
   */
  estadoInicial?: EstadoPaciente;
}) {
  const [estado, enviar, enviando] = useActionState(accion, estadoInicial);

  const inicial = useMemo<DatosPaciente>(
    () => (guardado ? aDatosFormulario(guardado) : DATOS_VACIOS),
    [guardado]
  );

  // `estado.datos` gana cuando la acción rebotó con errores: así lo tecleado
  // sobrevive incluso si el envío se hizo sin JavaScript.
  const [datos, setDatos] = useState<DatosPaciente>(() => estado.datos ?? inicial);

  /** Un campo solo muestra su error después de visitarlo, o tras un envío. */
  const [tocados, setTocados] = useState<Partial<Record<CampoPaciente, boolean>>>({});
  const [intentoEnvio, setIntentoEnvio] = useState(false);

  const hoy = parseFechaNacimiento(hoyISO) ?? hoyEnEcuador();

  const erroresLocales = validarPaciente(datos, { guardado, hoy });
  // Los del servidor se muestran siempre: si llegaron, es que ya se envió.
  const errores: ErroresPaciente = { ...erroresLocales, ...estado.errores };

  const visible = (campo: CampoPaciente) =>
    estado.errores[campo] ?? (tocados[campo] || intentoEnvio ? erroresLocales[campo] : undefined);

  const menor = requiereAcompanante(datos, hoy);

  // El bloque de acompañante se dibuja también si el paciente YA trae datos de
  // acompañante aunque hoy sea mayor de edad. Si no, esos campos no viajarían
  // en el envío, `aFilaPaciente` los leería como vacíos y guardar un cambio de
  // teléfono borraría al acompañante que trajo la migración.
  const traeAcompanante = Boolean(
    guardado?.nombre_acompanante || guardado?.documento_acompanante
  );
  const mostrarAcompanante = menor || traeAcompanante;

  // Los únicos campos que pueden NO estar en pantalla. Si un error cae en uno
  // de ellos, no hay borde rojo que mirar: el mensaje del pie tiene que decir
  // qué pasa en vez de mandar a buscar una marca que no existe.
  //
  // Es la red que faltaba cuando `tipo_documento_acompanante` bloqueaba el alta
  // de cualquier adulto sin dejar rastro visible. La causa está corregida en
  // `leerFormulario`, pero el fallo pudo pasar desapercibido justo porque el
  // aviso genérico sonaba plausible.
  const erroresFueraDePantalla = mostrarAcompanante
    ? []
    : CAMPOS_ACOMPANANTE.map((campo) => errores[campo]).filter(
        (mensaje): mensaje is string => Boolean(mensaje)
      );

  const cambiar = (campo: CampoPaciente) => (valor: string) =>
    setDatos((previos) => ({ ...previos, [campo]: valor }));
  const marcarTocado = (campo: CampoPaciente) => () =>
    setTocados((previos) => ({ ...previos, [campo]: true }));

  const edad = useMemo(() => {
    const nacimiento = parseFechaNacimiento(datos.fecha_nacimiento);
    if (!nacimiento || nacimiento > hoy) return null;
    const { anios, totalMeses } = calcularEdad(nacimiento, hoy);
    if (anios < 1) return totalMeses === 1 ? "1 mes" : `${totalMeses} meses`;
    return anios === 1 ? "1 año" : `${anios} años`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datos.fecha_nacimiento, hoyISO]);

  const volverA = guardado ? `/pacientes/${guardado.id}` : "/pacientes";

  return (
    <form
      action={enviar}
      onSubmit={(e) => {
        setIntentoEnvio(true);
        // Se frena aquí para no gastar el viaje al servidor en algo que ya se
        // sabe que no valida — y para que el error aparezca junto al campo en
        // vez de al volver. La Server Action revalida igual: esto es
        // comodidad, no la defensa.
        if (!sinErrores(erroresLocales)) e.preventDefault();
      }}
      noValidate
      className="flex flex-col gap-6"
    >
      {pendientes.length > 0 ? <AvisoPendientes pendientes={pendientes} /> : null}

      {estado.duplicado ? (
        <AvisoDuplicado duplicado={estado.duplicado} editando={Boolean(guardado)} />
      ) : null}

      {estado.mensaje ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-control bg-rojo-tint px-3 py-2.5 text-sm text-rojo"
        >
          <AlertCircle aria-hidden className="mt-px shrink-0" size={16} strokeWidth={1.5} />
          {estado.mensaje}
        </p>
      ) : null}

      <Seccion titulo="Datos personales">
        <CampoDocumento
          campoTipo="tipo_documento"
          campoNumero="documento"
          etiqueta="Documento de identidad"
          tipo={datos.tipo_documento}
          numero={datos.documento}
          onTipo={cambiar("tipo_documento")}
          onNumero={cambiar("documento")}
          onBlur={marcarTocado("documento")}
          error={visible("documento")}
          errorTipo={visible("tipo_documento")}
          guardado={guardado ? documentoGuardado(guardado) : null}
          obligatorio={!guardado || guardado.documento !== null}
          pendiente={pendientes.includes("documento")}
        />

        <Campo
          campo="nombre_completo"
          etiqueta="Nombre completo"
          obligatorio
          valor={datos.nombre_completo}
          onChange={cambiar("nombre_completo")}
          onBlur={marcarTocado("nombre_completo")}
          error={visible("nombre_completo")}
          autoComplete="off"
          placeholder="Apellidos y nombres"
          ancho="completo"
          // Los 164 migrados están en mayúsculas y así salen impresos. Se
          // muestra en mayúsculas desde que se teclea, en vez de sorprender
          // con la transformación al guardar.
          className="uppercase"
        />

        <div className="flex flex-col gap-1.5">
          <Campo
            campo="fecha_nacimiento"
            etiqueta="Fecha de nacimiento"
            obligatorio={!guardado || guardado.fecha_nacimiento !== null}
            pendiente={pendientes.includes("fecha_nacimiento")}
            valor={datos.fecha_nacimiento}
            onChange={cambiar("fecha_nacimiento")}
            onBlur={marcarTocado("fecha_nacimiento")}
            error={visible("fecha_nacimiento")}
            tipo="date"
            max={hoyISO}
          />
          {/* RF-05: la edad no se escribe, se calcula. Aparece al lado del
              campo mientras se teclea, que es donde sirve para cazar el año
              mal puesto — el error que ya metió un `0214-06-08` en esta base. */}
          {edad ? (
            <p className="text-sm text-texto-secundario">
              Edad calculada: <span className="font-semibold text-navy">{edad}</span>
              {menor ? " · menor de edad" : ""}
            </p>
          ) : null}
        </div>

        <Desplegable
          campo="sexo"
          etiqueta="Sexo"
          obligatorio={!guardado || guardado.sexo !== null}
          pendiente={pendientes.includes("sexo")}
          valor={datos.sexo}
          onChange={cambiar("sexo")}
          onBlur={marcarTocado("sexo")}
          error={visible("sexo")}
          opciones={SEXOS.map((s) => ({ valor: s.valor, etiqueta: s.etiqueta }))}
        />

        <Desplegable
          campo="estado_civil"
          etiqueta="Estado civil"
          valor={datos.estado_civil}
          onChange={cambiar("estado_civil")}
          onBlur={marcarTocado("estado_civil")}
          error={visible("estado_civil")}
          opciones={ESTADOS_CIVILES.map((e) => ({ valor: e, etiqueta: e }))}
        />
      </Seccion>

      {mostrarAcompanante ? (
        <BloqueAcompanante
          menor={menor}
          datos={datos}
          guardado={guardado}
          cambiar={cambiar}
          marcarTocado={marcarTocado}
          visible={visible}
        />
      ) : null}

      <Seccion titulo="Contacto" nota="Todo lo de esta sección es opcional.">
        <Campo
          campo="telefono"
          etiqueta="Teléfono"
          valor={datos.telefono}
          onChange={cambiar("telefono")}
          onBlur={marcarTocado("telefono")}
          error={visible("telefono")}
          tipo="tel"
          placeholder="0991234567"
        />
        <Campo
          campo="correo"
          etiqueta="Correo electrónico"
          valor={datos.correo}
          onChange={cambiar("correo")}
          onBlur={marcarTocado("correo")}
          error={visible("correo")}
          tipo="email"
          placeholder="correo@ejemplo.com"
        />
        <Campo
          campo="domicilio"
          etiqueta="Domicilio"
          valor={datos.domicilio}
          onChange={cambiar("domicilio")}
          onBlur={marcarTocado("domicilio")}
          error={visible("domicilio")}
          ancho="completo"
        />
        <Campo
          campo="ocupacion"
          etiqueta="Ocupación"
          valor={datos.ocupacion}
          onChange={cambiar("ocupacion")}
          onBlur={marcarTocado("ocupacion")}
          error={visible("ocupacion")}
          ancho="completo"
        />
      </Seccion>

      <Seccion
        titulo="Antecedentes heredofamiliares"
        nota="Opcional. Se imprime en el historial clínico."
      >
        <AreaDeTexto
          campo="antecedentes_heredofamiliares"
          etiqueta="Antecedentes heredofamiliares"
          valor={datos.antecedentes_heredofamiliares}
          onChange={cambiar("antecedentes_heredofamiliares")}
          onBlur={marcarTocado("antecedentes_heredofamiliares")}
          error={visible("antecedentes_heredofamiliares")}
          placeholder="Ej. Madre con hipertensión arterial. Padre con diabetes mellitus tipo 2."
        />
      </Seccion>

      <div className="flex flex-col-reverse gap-3 border-t border-borde pt-6 sm:flex-row sm:justify-end">
        <Link
          href={volverA}
          className="flex items-center justify-center rounded-control border border-navy px-4 py-2.5 font-semibold text-navy transition-colors hover:bg-navy-tint"
        >
          Cancelar
        </Link>
        <button
          type="submit"
          disabled={enviando}
          className="flex items-center justify-center gap-2 rounded-control bg-teal px-5 py-2.5 font-semibold text-white transition-colors hover:bg-teal-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          {enviando ? null : <Save aria-hidden size={18} strokeWidth={1.5} />}
          {enviando ? "Guardando…" : guardado ? "Guardar cambios" : "Registrar paciente"}
        </button>
      </div>

      {/* Resumen al pie, solo tras intentar enviar: con el formulario largo, el
          campo con el error puede haber quedado fuera de la pantalla y el botón
          parecería no responder. */}
      {/* `intentoEnvio` lo pone el submit del navegador; `estado.errores` solo
          puede venir de una Server Action que ya corrió. Cualquiera de los dos
          significa que hubo un intento, y el segundo hace falta para el envío
          sin JavaScript, donde la página se rehace desde cero y el estado del
          cliente no sobrevive. */}
      {(intentoEnvio || !sinErrores(estado.errores)) && !sinErrores(errores) ? (
        <div role="alert" className="text-sm text-rojo">
          {erroresFueraDePantalla.length > 0 ? (
            erroresFueraDePantalla.map((mensaje) => (
              <p key={mensaje} className="flex items-start gap-1.5">
                <AlertCircle aria-hidden className="mt-0.5 shrink-0" size={14} strokeWidth={1.5} />
                {mensaje}
              </p>
            ))
          ) : (
            <p>Revisa los campos marcados en rojo antes de guardar.</p>
          )}
        </div>
      ) : null}
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/* Avisos                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Lo que convierte la edición en una herramienta de limpieza y no en un
 * formulario más: dice qué le falta a ESTE paciente, con nombre y apellido de
 * campo, en vez de dejar a la doctora comparando diecisiete casillas.
 *
 * En gris y no en rojo, igual que la etiqueta del listado: una ficha incompleta
 * es una tarea pendiente, no una alerta clínica (Sistema-de-Diseno.md reserva
 * el rojo para alergias y errores de validación).
 */
export function AvisoPendientes({ pendientes }: { pendientes: CampoPendiente[] }) {
  return (
    <div className="flex items-start gap-3 rounded-tarjeta border border-borde bg-navy-tint px-4 py-3">
      <CircleDashed aria-hidden className="mt-0.5 shrink-0 text-texto-secundario" size={18} strokeWidth={1.5} />
      <div className="text-sm">
        <p className="font-semibold text-navy">
          A esta ficha le falta {listarPendientes(pendientes)}.
        </p>
        <p className="mt-0.5 text-texto-secundario">
          Viene de la importación del Sheet, donde ese dato no existía. Se puede
          guardar sin completarlo — un avance parcial vale más que ninguno.
        </p>
      </div>
    </div>
  );
}

/**
 * El UNIQUE de `cedula` traducido a algo que la doctora pueda usar.
 *
 * El mensaje crudo de Postgres (`duplicate key value violates unique
 * constraint "pacientes_cedula_key"`) no dice lo único que hace falta saber:
 * QUIÉN tiene esa cédula. Sin ese dato la salida natural es registrar al
 * paciente por otra vía —o con la cédula en blanco— y ahí nace el duplicado,
 * que es el problema que esta base ya tuvo 82 veces.
 */
export function AvisoDuplicado({
  duplicado,
  editando,
}: {
  duplicado: { id: string; nombre_completo: string };
  editando: boolean;
}) {
  return (
    <div role="alert" className="rounded-tarjeta border border-rojo bg-rojo-tint px-4 py-3">
      <p className="flex items-start gap-2 font-semibold text-rojo">
        <AlertCircle aria-hidden className="mt-0.5 shrink-0" size={18} strokeWidth={1.5} />
        Esa cédula ya está registrada
      </p>
      <p className="mt-1.5 pl-7 text-sm text-navy">
        Pertenece a <span className="font-semibold">{duplicado.nombre_completo}</span>.
        {editando
          ? " Es muy probable que las dos fichas sean la misma persona, duplicada. Revisa la otra ficha antes de decidir: el sistema no las une solo, porque cuál nombre y cuál fecha quedan es una decisión tuya."
          : " No hace falta registrarlo otra vez — abre su ficha y actualiza lo que haya cambiado."}
      </p>
      <Link
        href={`/pacientes/${duplicado.id}`}
        className="mt-2.5 ml-7 inline-flex items-center gap-1.5 text-sm font-semibold text-navy underline underline-offset-4 transition-colors hover:text-teal"
      >
        Abrir la ficha de {duplicado.nombre_completo}
        <ArrowRight aria-hidden size={14} strokeWidth={1.5} />
      </Link>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Bloques                                                                     */
/* -------------------------------------------------------------------------- */

function Seccion({
  titulo,
  nota,
  children,
}: {
  titulo: string;
  nota?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-tarjeta border border-borde bg-superficie p-5 shadow-clinica sm:p-6">
      <h2 className="text-[17px] font-semibold text-navy">{titulo}</h2>
      {nota ? <p className="mt-1 text-sm text-texto-secundario">{nota}</p> : null}
      {/* 24px entre campos, el ritmo vertical del sistema de diseño: hace
          falta para que quepan etiqueta y mensaje de validación sin apretarse. */}
      <div className="mt-5 grid grid-cols-1 gap-6 sm:grid-cols-2">{children}</div>
    </section>
  );
}

/**
 * ADR-003. Fondo `#E8EEF2` (navy tint), que es como Sistema-de-Diseno.md marca
 * los bloques de datos que no son del paciente mismo.
 *
 * Aparece y desaparece según la fecha de nacimiento que haya escrita AHORA, no
 * según lo guardado: es el caso delicado de la edición —se completa la fecha de
 * un paciente migrado, resulta menor— resuelto donde la doctora lo puede
 * arreglar, en vez de dejando que lo cace el CHECK de la base.
 */
function BloqueAcompanante({
  menor,
  datos,
  guardado,
  cambiar,
  marcarTocado,
  visible,
}: {
  menor: boolean;
  datos: DatosPaciente;
  guardado: PacienteRow | null;
  cambiar: (campo: CampoPaciente) => (valor: string) => void;
  marcarTocado: (campo: CampoPaciente) => () => void;
  visible: (campo: CampoPaciente) => string | undefined;
}) {
  return (
    <section className="rounded-tarjeta border border-borde bg-navy-tint p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Users aria-hidden className="text-navy" size={20} strokeWidth={1.5} />
        <h2 className="text-[17px] font-semibold text-navy">Datos del acompañante</h2>
        {menor ? (
          <span className="rounded-full bg-teal-tint px-3 py-1 text-xs font-semibold text-teal">
            Obligatorio · paciente menor de edad
          </span>
        ) : (
          <span className="rounded-full border border-borde bg-superficie px-3 py-1 text-xs font-medium text-texto-secundario">
            Registrado de antes
          </span>
        )}
      </div>
      <p className="mt-1.5 text-sm text-texto-secundario">
        {menor
          ? "Nombre y documento son obligatorios mientras el paciente sea menor de 18 años (ADR-003). Teléfono y correo son opcionales. El acompañante puede tener un documento de otro tipo que el paciente."
          : "El paciente ya es mayor de edad. Estos datos se conservan tal como se registraron; puedes corregirlos o borrarlos."}
      </p>

      <div className="mt-5 grid grid-cols-1 gap-6 sm:grid-cols-2">
        <Campo
          campo="nombre_acompanante"
          etiqueta="Nombre completo del acompañante"
          obligatorio={menor}
          valor={datos.nombre_acompanante}
          onChange={cambiar("nombre_acompanante")}
          onBlur={marcarTocado("nombre_acompanante")}
          error={visible("nombre_acompanante")}
          ancho="completo"
          className="uppercase"
        />
        <CampoDocumento
          campoTipo="tipo_documento_acompanante"
          campoNumero="documento_acompanante"
          etiqueta="Documento del acompañante"
          tipo={datos.tipo_documento_acompanante}
          numero={datos.documento_acompanante}
          onTipo={cambiar("tipo_documento_acompanante")}
          onNumero={cambiar("documento_acompanante")}
          onBlur={marcarTocado("documento_acompanante")}
          error={visible("documento_acompanante")}
          errorTipo={visible("tipo_documento_acompanante")}
          guardado={
            guardado
              ? {
                  tipo: guardado.tipo_documento_acompanante,
                  numero: guardado.documento_acompanante,
                }
              : null
          }
          obligatorio={menor}
        />
        <Campo
          campo="telefono_acompanante"
          etiqueta="Teléfono del acompañante"
          valor={datos.telefono_acompanante}
          onChange={cambiar("telefono_acompanante")}
          onBlur={marcarTocado("telefono_acompanante")}
          error={visible("telefono_acompanante")}
          tipo="tel"
        />
        <Campo
          campo="correo_acompanante"
          etiqueta="Correo del acompañante"
          valor={datos.correo_acompanante}
          onChange={cambiar("correo_acompanante")}
          onBlur={marcarTocado("correo_acompanante")}
          error={visible("correo_acompanante")}
          tipo="email"
          ancho="completo"
        />
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Controles                                                                   */
/* -------------------------------------------------------------------------- */

/** Los cinco campos que el formulario puede no llegar a dibujar. */
const CAMPOS_ACOMPANANTE: CampoPaciente[] = [
  "nombre_acompanante",
  "tipo_documento_acompanante",
  "documento_acompanante",
  "correo_acompanante",
  "telefono_acompanante",
];

const BASE_CONTROL =
  "w-full rounded-control border bg-superficie px-3 py-2.5 text-[15px] text-navy " +
  "transition-colors focus:outline-none";

/**
 * Chevron de Lucide embebido como data-URI. No es un icono de otra librería:
 * es el mismo trazo de 1.5px del sistema, en línea porque un `<select>` no
 * admite hijos que no sean `<option>`. Vive aquí y no dentro de un componente
 * para que los dos desplegables del formulario no acaben con flechas distintas.
 */
const CLASES_DESPLEGABLE =
  "appearance-none bg-[length:16px] bg-[right_0.75rem_center] bg-no-repeat pr-10";

const ESTILO_CHEVRON: React.CSSProperties = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%235b7185' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
};

function bordeDe(error: string | undefined, valido = false): string {
  if (error) return "border-rojo focus:border-rojo";
  if (valido) return "border-teal focus:border-teal";
  return "border-borde focus:border-navy";
}

/** Sistema-de-Diseno.md: la etiqueta va SIEMPRE visible sobre el campo. */
function Etiqueta({
  campo,
  etiqueta,
  obligatorio,
  pendiente,
}: {
  campo: string;
  etiqueta: string;
  obligatorio?: boolean;
  pendiente?: boolean;
}) {
  return (
    <label
      htmlFor={campo}
      className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-semibold tracking-[0.05em] text-navy"
    >
      <span>
        {etiqueta.toUpperCase()}
        {obligatorio ? <span className="ml-1 text-rojo">*</span> : null}
      </span>
      {pendiente ? (
        <span className="rounded-full border border-borde bg-navy-tint px-2 py-0.5 text-[11px] font-medium tracking-normal text-texto-secundario">
          Falta en esta ficha
        </span>
      ) : null}
    </label>
  );
}

function MensajeError({ campo, error }: { campo: string; error: string | undefined }) {
  if (!error) return null;
  return (
    <p id={`${campo}-error`} className="flex items-start gap-1.5 text-sm text-rojo">
      <AlertCircle aria-hidden className="mt-0.5 shrink-0" size={14} strokeWidth={1.5} />
      {error}
    </p>
  );
}

function Campo({
  campo,
  etiqueta,
  valor,
  onChange,
  onBlur,
  error,
  obligatorio,
  pendiente,
  tipo = "text",
  ancho = "medio",
  className = "",
  ...resto
}: {
  campo: CampoPaciente;
  etiqueta: string;
  valor: string;
  onChange: (valor: string) => void;
  onBlur: () => void;
  error?: string;
  obligatorio?: boolean;
  pendiente?: boolean;
  tipo?: string;
  ancho?: "medio" | "completo";
  className?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "onBlur" | "value" | "className">) {
  return (
    <div className={`flex flex-col gap-2 ${ancho === "completo" ? "sm:col-span-2" : ""}`}>
      <Etiqueta campo={campo} etiqueta={etiqueta} obligatorio={obligatorio} pendiente={pendiente} />
      <input
        id={campo}
        name={campo}
        type={tipo}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${campo}-error` : undefined}
        className={`${BASE_CONTROL} ${bordeDe(error)} ${className}`}
        {...resto}
      />
      <MensajeError campo={campo} error={error} />
    </div>
  );
}

/**
 * Documento de identidad: el desplegable de tipo y el número, juntos.
 *
 * **El tipo va PRIMERO y no es una preferencia de maquetación.** Es lo que
 * decide cómo se valida el número: una cédula ecuatoriana pasa por el dígito
 * verificador, un pasaporte no puede pasar por nada equivalente. Poner el
 * número antes obligaría a teclearlo, ver un error, y solo entonces descubrir
 * que había que cambiar el tipo.
 *
 * Es el único campo con feedback en línea mientras se teclea: borde y texto
 * rojo con ícono de alerta si no cuadra, borde y check turquesa si sí
 * (Sistema-de-Diseno.md). Lo que cuenta como "cuadra" depende del tipo, así
 * que al cambiar el desplegable la señal se recalcula sola — no hay forma de
 * quedarse con un check turquesa sobre un valor que ya no es válido, ni con un
 * error rojo sobre un pasaporte perfectamente legítimo.
 *
 * El check aparece solo cuando el número está COMPLETO y es válido: uno que
 * parpadea a medio teclear no informa de nada.
 */
function CampoDocumento({
  campoTipo,
  campoNumero,
  etiqueta,
  tipo,
  numero,
  onTipo,
  onNumero,
  onBlur,
  error,
  errorTipo,
  guardado,
  obligatorio,
  pendiente,
}: {
  campoTipo: CampoPaciente;
  campoNumero: CampoPaciente;
  etiqueta: string;
  tipo: string;
  numero: string;
  onTipo: (valor: string) => void;
  onNumero: (valor: string) => void;
  onBlur: () => void;
  error?: string;
  /** Solo puede llegar de un envío manipulado; sin esto sería invisible. */
  errorTipo?: string;
  guardado: { tipo: TipoDocumento; numero: string | null } | null;
  obligatorio?: boolean;
  pendiente?: boolean;
}) {
  const tipoActual: TipoDocumento = esTipoDocumento(tipo) ? tipo : TIPO_DOCUMENTO_POR_DEFECTO;
  const esCedula = tipoActual === "cedula";

  const valido =
    numero.trim().length > 0 && validarDocumentoEditado(numero, tipoActual, guardado).valido;

  // "Se conserva tal cual porque no se ha tocado": el valor pasa solo gracias a
  // la excepción de los datos migrados, no porque sea válido por sí mismo.
  const conservado =
    valido &&
    guardado?.numero != null &&
    guardado.tipo === tipoActual &&
    numero.trim() === guardado.numero &&
    !validarDocumento(numero, tipoActual).valido;

  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:col-span-2 sm:grid-cols-[minmax(0,13rem)_1fr]">
      <div className="flex flex-col gap-2">
        <Etiqueta campo={campoTipo} etiqueta="Tipo" />
        <select
          id={campoTipo}
          name={campoTipo}
          value={tipoActual}
          onChange={(e) => onTipo(e.target.value)}
          aria-invalid={errorTipo ? true : undefined}
          aria-describedby={errorTipo ? `${campoTipo}-error` : undefined}
          className={`${BASE_CONTROL} ${bordeDe(errorTipo)} ${CLASES_DESPLEGABLE}`}
          style={ESTILO_CHEVRON}
        >
          {TIPOS_DOCUMENTO.map((opcion) => (
            <option key={opcion.valor} value={opcion.valor}>
              {opcion.etiqueta}
            </option>
          ))}
        </select>
        <MensajeError campo={campoTipo} error={errorTipo} />
      </div>

      <div className="flex flex-col gap-2">
        <Etiqueta
          campo={campoNumero}
          etiqueta={etiqueta}
          obligatorio={obligatorio}
          pendiente={pendiente}
        />
        <div className="relative">
          <input
            id={campoNumero}
            name={campoNumero}
            type="text"
            // `numeric` solo para la cédula: en un móvil, un pasaporte
            // alfanumérico con el teclado numérico sería intecleable.
            inputMode={esCedula ? "numeric" : "text"}
            autoComplete="off"
            value={numero}
            onChange={(e) => onNumero(e.target.value)}
            onBlur={onBlur}
            maxLength={25}
            placeholder={esCedula ? "0000000000" : "Nº del documento"}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${campoNumero}-error` : undefined}
            // `identificador` es la utilidad de globals.css que pone IBM Plex
            // Mono: un documento es un código, no prosa. Vale igual para un
            // pasaporte, donde además separa el 0 de la O.
            className={`identificador ${BASE_CONTROL} pr-10 ${bordeDe(error, valido)} ${
              esCedula ? "" : "uppercase"
            }`}
          />
          {error ? (
            <AlertCircle
              aria-hidden
              className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-rojo"
              size={18}
              strokeWidth={1.5}
            />
          ) : valido ? (
            <Check
              aria-hidden
              className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-teal"
              size={18}
              strokeWidth={1.5}
            />
          ) : null}
        </div>
        <MensajeError campo={campoNumero} error={error} />

        {/* Por qué un pasaporte no se examina como una cédula. Sin esta línea,
            ver un check turquesa sobre cualquier cosa parecería que la
            validación se apagó, en vez de que aquí no hay nada que verificar. */}
        {!esCedula && !error ? (
          <p className="text-sm text-texto-secundario">
            Un {etiquetaTipoDocumento(tipoActual).toLowerCase()} no tiene dígito
            verificador: se guarda tal como lo escribas. Revísalo contra el
            documento antes de guardar.
          </p>
        ) : null}

        {/* El caso de los datos migrados, dicho en voz alta (ADR-006). */}
        {conservado ? (
          <p className="text-sm text-texto-secundario">
            Es el documento que trajo la importación y no cumple el formato de
            una cédula ecuatoriana. Se conserva tal cual; si de verdad es otro
            tipo de documento, cámbialo arriba.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function Desplegable({
  campo,
  etiqueta,
  valor,
  onChange,
  onBlur,
  error,
  obligatorio,
  pendiente,
  opciones,
}: {
  campo: CampoPaciente;
  etiqueta: string;
  valor: string;
  onChange: (valor: string) => void;
  onBlur: () => void;
  error?: string;
  obligatorio?: boolean;
  pendiente?: boolean;
  opciones: { valor: string; etiqueta: string }[];
}) {
  return (
    <div className="flex flex-col gap-2">
      <Etiqueta campo={campo} etiqueta={etiqueta} obligatorio={obligatorio} pendiente={pendiente} />
      <select
        id={campo}
        name={campo}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${campo}-error` : undefined}
        className={`${BASE_CONTROL} ${bordeDe(error, Boolean(valor))} ${CLASES_DESPLEGABLE}`}
        style={ESTILO_CHEVRON}
      >
        <option value="">Seleccionar…</option>
        {opciones.map((opcion) => (
          <option key={opcion.valor} value={opcion.valor}>
            {opcion.etiqueta}
          </option>
        ))}
      </select>
      <MensajeError campo={campo} error={error} />
    </div>
  );
}

/**
 * Los antecedentes heredofamiliares, que **se imprimen en el historial**
 * (`drawWrapped` sobre los renglones de la cabecera de la plantilla).
 *
 * Por eso no admite saltos de línea, igual que los campos largos de la consulta:
 * un `
` hacía lanzar a pdf-lib al generar el PDF. Aquí el fallo era todavía
 * más traicionero que en la consulta —esta pantalla no mide nada mientras se
 * escribe, así que el texto se guardaba tan campante y la caída llegaba días
 * después, al abrir el historial de ese paciente. Ver `useTextoPlano`.
 */
function AreaDeTexto({
  campo,
  etiqueta,
  valor,
  onChange,
  onBlur,
  error,
  placeholder,
}: {
  campo: CampoPaciente;
  etiqueta: string;
  valor: string;
  onChange: (valor: string) => void;
  onBlur: () => void;
  error?: string;
  placeholder?: string;
}) {
  const { avisoSalto, manejadores } = useTextoPlano(onChange);

  return (
    <div className="flex flex-col gap-2 sm:col-span-2">
      <label htmlFor={campo} className="sr-only">
        {etiqueta}
      </label>
      <textarea
        id={campo}
        name={campo}
        value={valor}
        onChange={manejadores.onChange}
        onKeyDown={manejadores.onKeyDown}
        onBlur={onBlur}
        rows={4}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${campo}-error` : undefined}
        className={`${BASE_CONTROL} ${bordeDe(error)} resize-y`}
      />
      <MensajeError campo={campo} error={error} />
      {avisoSalto ? (
        <p role="status" className="text-sm text-texto-secundario">
          {AVISO_SIN_SALTOS}
        </p>
      ) : null}
    </div>
  );
}
