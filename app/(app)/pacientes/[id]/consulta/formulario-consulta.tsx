"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertCircle,
  ChevronRight,
  ClipboardList,
  FileText,
  Pencil,
  Check,
  Loader2,
  Save,
  Stethoscope,
  Pill,
  type LucideIcon,
} from "lucide-react";
import { edadDe } from "@/lib/edad";
import { formatFechaLarga, hoyEnEcuador, parseFecha } from "@/lib/fechas";
import { etiquetaSexo, etiquetaTipoDocumento } from "@/lib/pacientes/campos";
import { formatearDocumento } from "@/lib/pacientes/documento";
import { SIN_DOCUMENTO, SIN_FECHA_NACIMIENTO, tieneAlergia } from "@/lib/pacientes/formato";
import { generateHistorialPdf, generateRecetaPdf, UNIDAD_VITAL, tieneFechaNacimiento } from "@/lib/pdf";
import { fuenteDeMedida, type PDFFont } from "@/lib/pdf/medicion";
import { consultaParaPdf, medicamentoParaPdf, pacienteParaPdf } from "@/lib/consultas/pdf";
import {
  aConsultaPdf,
  avisosConsulta,
  contadorAntecedente,
  contadorImpresionDiagnostica,
  contadorMotivo,
  contadorTratamiento,
  datosIniciales,
  sinErrores,
  validarConsulta,
  type CampoConsulta,
  type DatosConsulta,
} from "@/lib/consultas/formulario";
import {
  contadorRecomendaciones,
  contadorSignosAlarma,
  medicamentoVacio,
  sinErroresReceta,
  validarReceta,
  type DatosMedicamento,
} from "@/lib/consultas/receta";
import type { ResultadoGuardado } from "@/lib/consultas/guardado";
import type { ConsultaRow, PacienteRow, RecetaMedicamentoRow } from "@/lib/supabase/tipos";
import { VistaPreviaPdf } from "../../../vista-previa-pdf";
import { BuscadorCie10, type BuscarCie10, type Cie10Elegido } from "./buscador-cie10";
import { SeccionReceta } from "./receta";
import type { BuscarMedicamentos } from "./buscador-medicamentos";
// Los controles viven en ./controles desde que la receta necesitó los mismos.
// El motivo de peso está allí: `AreaDeTexto` es lo que engancha `useTextoPlano`,
// y una segunda copia que se olvidara del hook devolvería el fallo del Shift+Enter.
import {
  AreaDeTexto,
  Campo,
  Etiqueta,
  MensajeError,
  Medicion,
  bordeDe,
  BASE_CONTROL,
} from "./controles";

/**
 * Formulario de consulta (RF-08, RF-09, RF-10) — la pantalla donde la doctora
 * documenta la visita que está atendiendo.
 *
 * La composición es la de "Nueva Consulta — historial" de
 * docs/diseno/Prompts-Stitch.md: datos fijos del paciente arriba, no editables,
 * sobre `#E8EEF2`; debajo, secciones colapsables. De Stitch no se toma nada de
 * color ni de tipografía — su export trae la paleta Material y aquí manda
 * docs/diseno/Sistema-de-Diseno.md.
 *
 * ## Lo que esta pantalla todavía NO hace
 *
 * **No guarda.** El guardado de la consulta con su receta es la tarea 4.5, en
 * la sesión de la receta, y con él llegarán los dos campos que faltan aquí
 * —"signos de alarma" y "recomendaciones no farmacológicas"—, que pertenecen a
 * la RECETA (05-Prescripcion-Receta.md) aunque se escriban en el mismo acto.
 * Mientras tanto el botón principal enseña la hoja impresa: es lo único que se
 * puede prometer sin mentir, y de paso ejercita los límites de ADR-007 con
 * texto real.
 *
 * ## Por qué las secciones se abren solas cuando algo falla
 *
 * Un formulario largo con secciones plegadas puede esconder el campo que
 * bloquea el guardado, y el botón parecería no responder. El formulario de
 * paciente ya se encontró con esa trampa —de ahí su resumen de errores al pie—
 * y aquí, además, se despliega la sección que los contiene.
 */

type NombreSeccion =
  | "antecedentes"
  | "exploracion"
  | "motivo"
  | "diagnostico"
  | "tratamiento"
  | "receta";

/** En qué sección vive cada campo, para poder abrirla cuando tenga un error. */
const SECCION_DE: Record<CampoConsulta, NombreSeccion | null> = {
  fecha: null, // vive fuera de las secciones plegables
  alergias: "antecedentes",
  patologias: "antecedentes",
  quirurgicos: "antecedentes",
  transfusionales: "antecedentes",
  pa: "exploracion",
  fc: "exploracion",
  fr: "exploracion",
  temperatura: "exploracion",
  peso: "exploracion",
  motivo_consulta: "motivo",
  impresion_diagnostica: "diagnostico",
  cie10_codigo: "diagnostico",
  tratamiento: "tratamiento",
  signos_alarma: "receta",
  recomendaciones_no_farmacologicas: "receta",
};

const TODAS_ABIERTAS: Record<NombreSeccion, boolean> = {
  antecedentes: true,
  exploracion: true,
  motivo: true,
  diagnostico: true,
  tratamiento: true,
  receta: true,
};

export function FormularioConsulta({
  paciente,
  hoyISO,
  ultimaConsulta,
  fechaPrimeraConsulta,
  totalConsultas,
  buscarCie10,
  buscarMedicamentos,
  guardarConsulta,
}: {
  paciente: PacienteRow;
  /**
   * Hoy según el SERVIDOR, en `YYYY-MM-DD`. No se calcula con `new Date()` en
   * el navegador: además del desajuste de hidratación, esta fecha es la que se
   * imprime como "Fecha Actual" del historial y no puede depender del reloj ni
   * del huso de la máquina desde la que se abra el sistema.
   */
  hoyISO: string;
  /** La visita anterior, de la que se precargan los antecedentes. */
  ultimaConsulta: ConsultaRow | null;
  /** La consulta más antigua: "Fecha de Elaboración" del historial impreso. */
  fechaPrimeraConsulta: string | null;
  totalConsultas: number;
  /**
   * La Server Action que consulta el catálogo CIE-10. Llega desde el Server
   * Component en lugar de importarse aquí: un componente de cliente que importe
   * `lib/consultas/acciones.ts` arrastra `server-only` al bundle.
   */
  buscarCie10: BuscarCie10;
  /** Igual que `buscarCie10`: Server Actions pasadas desde el Server Component. */
  buscarMedicamentos: BuscarMedicamentos;
  guardarConsulta: (
    pacienteId: string,
    datos: DatosConsulta,
    medicamentos: DatosMedicamento[]
  ) => Promise<ResultadoGuardado>;
}) {
  const [datos, setDatos] = useState<DatosConsulta>(() =>
    datosIniciales({ hoyISO, paciente, ultimaConsulta })
  );
  const [cie10, setCie10] = useState<Cie10Elegido | null>(null);
  const [tocados, setTocados] = useState<Partial<Record<CampoConsulta, boolean>>>({});
  const [intentoEnvio, setIntentoEnvio] = useState(false);
  const [secciones, setSecciones] = useState<Record<NombreSeccion, boolean>>(TODAS_ABIERTAS);
  // Un renglón en blanco de salida: agregar el primero a mano sería un clic que
  // la doctora tiene que dar en casi todas las consultas.
  const [medicamentos, setMedicamentos] = useState<DatosMedicamento[]>(() => [medicamentoVacio()]);
  const [guardando, setGuardando] = useState(false);
  const [guardada, setGuardada] = useState<{
    consulta: ConsultaRow;
    medicamentos: RecetaMedicamentoRow[];
  } | null>(null);
  const [errorGuardado, setErrorGuardado] = useState<string | null>(null);
  /** Qué PDF se está mirando, con el mismo patrón que la línea de tiempo. */
  const [vista, setVista] = useState<"historial" | "receta" | null>(null);

  /**
   * La fuente con la que se mide si el texto cabe en la hoja (ADR-007). Llega
   * un instante después de montar; hasta entonces `validarConsulta` se apoya
   * en el contador de caracteres, que es la aproximación documentada en el ADR.
   */
  const [font, setFont] = useState<PDFFont | null>(null);
  useEffect(() => {
    let vivo = true;
    fuenteDeMedida()
      .then((f) => {
        if (vivo) setFont(f);
      })
      .catch(() => {
        /* Sin fuente se sigue validando por caracteres. */
      });
    return () => {
      vivo = false;
    };
  }, []);

  const hoy = parseFecha(hoyISO) ?? hoyEnEcuador();
  const fechaConsulta = parseFecha(datos.fecha) ?? hoy;

  const errores = validarConsulta(datos, {
    hoy,
    fechaNacimiento: paciente.fecha_nacimiento,
    font,
  });
  const avisos = avisosConsulta(datos);

  const erroresReceta = validarReceta(
    {
      signosAlarma: datos.signos_alarma,
      recomendaciones: datos.recomendaciones_no_farmacologicas,
      medicamentos,
    },
    font
  );
  const todoValida = sinErrores(errores) && sinErroresReceta(erroresReceta);

  const visible = (campo: CampoConsulta) =>
    tocados[campo] || intentoEnvio ? errores[campo] : undefined;

  const cambiar = (campo: CampoConsulta) => (valor: string) =>
    setDatos((previos) => ({ ...previos, [campo]: valor }));
  const marcarTocado = (campo: CampoConsulta) => () =>
    setTocados((previos) => ({ ...previos, [campo]: true }));

  const elegirCie10 = (fila: Cie10Elegido | null) => {
    setCie10(fila);
    setDatos((previos) => ({ ...previos, cie10_codigo: fila?.codigo ?? "" }));
  };

  // La edad se calcula contra la fecha de LA CONSULTA, no contra hoy: es la que
  // imprime el historial, y en una consulta con fecha atrasada las dos no
  // coinciden. `fechaConsulta` es un `Date` construido con `parseFecha`, nunca
  // la cadena — pasarla como cadena es el bug de huso horario que este proyecto
  // ya corrigió en la edad y en la fecha de la receta.
  const edad = formatearEdad(edadDe(paciente.fecha_nacimiento, fechaConsulta));

  /**
   * Guardar (tarea 4.5). Es lo único de esta pantalla que escribe.
   *
   * Se valida antes de salir hacia el servidor —donde se vuelve a validar, que
   * es la defensa de verdad— para no gastar el viaje en algo que ya se sabe que
   * no pasa, y para que el error aparezca junto al campo en vez de al volver.
   */
  const guardar = async () => {
    setIntentoEnvio(true);
    setErrorGuardado(null);
    if (!todoValida) {
      abrirSeccionesConError();
      return;
    }

    setGuardando(true);
    try {
      const resultado = await guardarConsulta(paciente.id, datos, medicamentos);
      if (!resultado.ok || !resultado.consulta) {
        setErrorGuardado(resultado.mensaje ?? "No se pudo guardar.");
        return;
      }
      setGuardada({ consulta: resultado.consulta, medicamentos: resultado.medicamentos ?? [] });
      // Se abre el historial en cuanto se guarda: es el documento que se
      // imprime siempre, lleve receta o no.
      setVista("historial");
    } catch {
      setErrorGuardado("No se pudo guardar. Revisa la conexión e inténtalo otra vez.");
    } finally {
      setGuardando(false);
    }
  };

  const abrirSeccionesConError = () => {
    // Se despliega lo que esconde un error: un botón que no responde porque el
    // campo culpable está plegado es indistinguible de un botón roto.
    setSecciones((previas) => {
      const abiertas = { ...previas };
      for (const campo of Object.keys(errores) as CampoConsulta[]) {
        const seccion = SECCION_DE[campo];
        if (errores[campo] && seccion) abiertas[seccion] = true;
      }
      if (!sinErroresReceta(erroresReceta)) abiertas.receta = true;
      return abiertas;
    });
  };

  const intentarVistaPrevia = () => {
    setIntentoEnvio(true);
    if (!sinErrores(errores)) {
      // Se despliega lo que esconde un error: un botón que no responde porque
      // el campo culpable está plegado es indistinguible de un botón roto.
      setSecciones((previas) => {
        const abiertas = { ...previas };
        for (const campo of Object.keys(errores) as CampoConsulta[]) {
          const seccion = SECCION_DE[campo];
          if (errores[campo] && seccion) abiertas[seccion] = true;
        }
        return abiertas;
      });
      return;
    }
    setVista("historial");
  };

  const alternar = (seccion: NombreSeccion) => (abierta: boolean) =>
    setSecciones((previas) => ({ ...previas, [seccion]: abierta }));

  // Los contadores reciben la misma fuente que la validación: el rojo del
  // contador y el bloqueo tienen que ser la misma decisión, no dos parecidas.
  const signos = contadorSignosAlarma(datos.signos_alarma, font);
  const recomendaciones = contadorRecomendaciones(datos.recomendaciones_no_farmacologicas, font);
  const motivo = contadorMotivo(datos, font);
  const impresion = contadorImpresionDiagnostica(datos, font);
  const tratamiento = contadorTratamiento(datos, font);
  const precargados = Boolean(ultimaConsulta);

  return (
    <form
      // Sin `action`: el guardado se llama a mano desde `guardar()`, porque
      // necesita mandar también la lista de medicamentos, que no es un campo
      // del `<form>` sino estado de React. Los `name` de los campos siguen
      // siendo los de las columnas por claridad al inspeccionar la pantalla.
      onSubmit={(e) => {
        e.preventDefault();
        void guardar();
      }}
      noValidate
      className="flex flex-col gap-4"
    >
      <BloquePaciente paciente={paciente} edad={edad} />

      <section className="rounded-tarjeta border border-borde bg-superficie p-5 shadow-clinica sm:p-6">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Etiqueta campo="fecha" etiqueta="Fecha de la consulta" obligatorio />
            <input
              id="fecha"
              name="fecha"
              type="date"
              value={datos.fecha}
              max={hoyISO}
              onChange={(e) => cambiar("fecha")(e.target.value)}
              onBlur={marcarTocado("fecha")}
              aria-invalid={visible("fecha") ? true : undefined}
              aria-describedby={visible("fecha") ? "fecha-error" : undefined}
              className={`${BASE_CONTROL} ${bordeDe(visible("fecha"))} identificador`}
            />
            <MensajeError campo="fecha" error={visible("fecha")} />
            <p className="text-sm text-texto-secundario">
              Se imprime como “Fecha Actual” del historial.
            </p>
          </div>

          <div className="flex flex-col justify-center gap-1 rounded-control bg-navy-tint px-4 py-3">
            <p className="text-[13px] font-semibold tracking-[0.05em] text-texto-secundario">
              HISTORIAL DE ESTE PACIENTE
            </p>
            <p className="text-sm text-navy">
              {totalConsultas === 0
                ? "Es su primera consulta registrada en el sistema."
                : `${totalConsultas === 1 ? "1 consulta" : `${totalConsultas} consultas`} anteriores. La última, el ${
                    formatFechaLarga(ultimaConsulta?.fecha) ?? "—"
                  }.`}
            </p>
          </div>
        </div>
      </section>

      {/* Dos columnas: el historial clínico a la izquierda, la receta a la
          derecha. Reduce el scroll vertical a la mitad — antes eran seis
          secciones apiladas.

          **Ningún scroll nuevo, y es deliberado.** El contrato de
          docs/arquitectura/Armazon-de-Pantalla.md dice que `<main>` es el ÚNICO
          elemento con scroll, y costó tres intentos llegar a eso. Dar a cada
          columna su propio `overflow-y-auto` exigiría acotarle el alto, o sea
          volver a depender de una altura calculada contra la ventana — que es
          exactamente lo que rompió el segundo intento (`h-dvh`). Estas dos
          columnas son una rejilla que crece con su contenido y se desplaza
          con `<main>`, como todo lo demás.

          `items-start`: sin él, la rejilla estira las dos columnas al alto de
          la más larga y la corta queda con un borde vacío colgando. */}
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-4">
        <Seccion
          nombre="antecedentes"
          titulo="Antecedentes patológicos"
          icono={ClipboardList}
          abierta={secciones.antecedentes}
          onAbrir={alternar("antecedentes")}
          nota={
            precargados
              ? `Precargados desde la consulta del ${formatFechaLarga(ultimaConsulta?.fecha) ?? "—"}. Revísalos y corrige lo que haya cambiado.`
              : "Personales del paciente, tal como se registran en esta consulta. Los heredofamiliares viven en su ficha."
          }
        >
          <AreaDeTexto
            campo="alergias"
            etiqueta="Alergias"
            valor={datos.alergias}
            onChange={cambiar("alergias")}
            onBlur={marcarTocado("alergias")}
            error={visible("alergias")}
            filas={2}
            contador={contadorAntecedente("alergias", datos, font)}
            placeholder="Ej. Penicilina — rash. Ninguna conocida."
          />
          <AreaDeTexto
            campo="patologias"
            etiqueta="Patologías"
            valor={datos.patologias}
            onChange={cambiar("patologias")}
            onBlur={marcarTocado("patologias")}
            error={visible("patologias")}
            filas={2}
            contador={contadorAntecedente("patologias", datos, font)}
            placeholder="Ej. Hipertensión arterial en tratamiento."
          />
          <AreaDeTexto
            campo="quirurgicos"
            etiqueta="Quirúrgicos"
            valor={datos.quirurgicos}
            onChange={cambiar("quirurgicos")}
            onBlur={marcarTocado("quirurgicos")}
            error={visible("quirurgicos")}
            filas={2}
            contador={contadorAntecedente("quirurgicos", datos, font)}
            placeholder="Ej. Colecistectomía, 2019."
          />
          <AreaDeTexto
            campo="transfusionales"
            etiqueta="Transfusionales"
            valor={datos.transfusionales}
            onChange={cambiar("transfusionales")}
            onBlur={marcarTocado("transfusionales")}
            error={visible("transfusionales")}
            filas={2}
            contador={contadorAntecedente("transfusionales", datos, font)}
            placeholder="Ej. Niega transfusiones."
          />
        </Seccion>

        <Seccion
          nombre="exploracion"
          titulo="Exploración física"
          icono={Activity}
          abierta={secciones.exploracion}
          onAbrir={alternar("exploracion")}
          nota="La unidad la pone el sistema al imprimir: aquí va solo el número."
          columnas="tres"
        >
          <Campo
            campo="pa"
            etiqueta="Presión arterial"
            valor={datos.pa}
            onChange={cambiar("pa")}
            onBlur={marcarTocado("pa")}
            error={visible("pa")}
            aviso={avisos.pa}
            placeholder="120/80"
            mono
          />
          <Medicion
            campo="fc"
            etiqueta="Frecuencia cardíaca"
            unidad={UNIDAD_VITAL.fc}
            valor={datos.fc}
            onChange={cambiar("fc")}
            onBlur={marcarTocado("fc")}
            error={visible("fc")}
            aviso={avisos.fc}
          />
          <Medicion
            campo="fr"
            etiqueta="Frecuencia respiratoria"
            unidad={UNIDAD_VITAL.fr}
            valor={datos.fr}
            onChange={cambiar("fr")}
            onBlur={marcarTocado("fr")}
            error={visible("fr")}
            aviso={avisos.fr}
          />
          <Medicion
            campo="temperatura"
            etiqueta="Temperatura"
            unidad={UNIDAD_VITAL.temperatura}
            valor={datos.temperatura}
            onChange={cambiar("temperatura")}
            onBlur={marcarTocado("temperatura")}
            error={visible("temperatura")}
            aviso={avisos.temperatura}
            placeholder="36,5"
          />
          <Medicion
            campo="peso"
            etiqueta="Peso"
            unidad={UNIDAD_VITAL.peso}
            valor={datos.peso}
            onChange={cambiar("peso")}
            onBlur={marcarTocado("peso")}
            error={visible("peso")}
            aviso={avisos.peso}
            placeholder="68"
          />
        </Seccion>

        <Seccion
          nombre="motivo"
          titulo="Motivo de consulta"
          icono={Stethoscope}
          abierta={secciones.motivo}
          onAbrir={alternar("motivo")}
          nota="Padecimiento actual. La plantilla tiene tres renglones impresos para esto."
        >
          <AreaDeTexto
            campo="motivo_consulta"
            etiqueta="Motivo de consulta"
            obligatorio
            valor={datos.motivo_consulta}
            onChange={cambiar("motivo_consulta")}
            onBlur={marcarTocado("motivo_consulta")}
            error={visible("motivo_consulta")}
            filas={4}
            contador={motivo}
            placeholder="Ej. Odinofagia y fiebre de dos días, sin tos."
          />
        </Seccion>

        <Seccion
          nombre="diagnostico"
          titulo="Impresión diagnóstica"
          icono={FileText}
          abierta={secciones.diagnostico}
          onAbrir={alternar("diagnostico")}
          nota="El código CIE-10 se imprime pegado al diagnóstico, en el mismo renglón."
        >
          <AreaDeTexto
            campo="impresion_diagnostica"
            etiqueta="Impresión diagnóstica"
            obligatorio
            valor={datos.impresion_diagnostica}
            onChange={cambiar("impresion_diagnostica")}
            onBlur={marcarTocado("impresion_diagnostica")}
            error={visible("impresion_diagnostica")}
            filas={2}
            contador={impresion}
            notaContador="incluido el código CIE-10"
            placeholder="Ej. Faringoamigdalitis aguda"
          />
          <BuscadorCie10
            elegido={cie10}
            onElegir={elegirCie10}
            buscar={buscarCie10}
            error={visible("cie10_codigo")}
          />
        </Seccion>

        <Seccion
          nombre="tratamiento"
          titulo="Tratamiento"
          icono={Pill}
          abierta={secciones.tratamiento}
          onAbrir={alternar("tratamiento")}
          nota="Indicaciones tal como deben salir escritas en el HISTORIAL. Los medicamentos con su dosis van abajo, en la receta."
        >
          <AreaDeTexto
            campo="tratamiento"
            etiqueta="Tratamiento"
            valor={datos.tratamiento}
            onChange={cambiar("tratamiento")}
            onBlur={marcarTocado("tratamiento")}
            error={visible("tratamiento")}
            filas={3}
            contador={tratamiento}
            placeholder="Ej. Amoxicilina 500 mg cada 8 h por 7 días. Paracetamol 1 g si fiebre."
          />
        </Seccion>

        </div>

        <div className="flex min-w-0 flex-col gap-4">
        <Seccion
          nombre="receta"
          titulo="Receta"
          icono={Pill}
          abierta={secciones.receta}
          onAbrir={alternar("receta")}
          nota="Cada medicamento se parte en dos: lo que queda en el archivo y lo que se lleva el paciente. Si la consulta no lleva receta, deja los renglones en blanco."
          columnas="una"
          sufijoTitulo={<NumeroDeReceta numero={guardada?.consulta.numero_receta ?? null} />}
        >
          <SeccionReceta
            medicamentos={medicamentos}
            onMedicamentos={setMedicamentos}
            signosAlarma={datos.signos_alarma}
            recomendaciones={datos.recomendaciones_no_farmacologicas}
            onSignosAlarma={cambiar("signos_alarma")}
            onRecomendaciones={cambiar("recomendaciones_no_farmacologicas")}
            contadorSignos={signos}
            contadorRecomendaciones={recomendaciones}
            errores={erroresReceta}
            mostrarErrores={intentoEnvio}
            buscarMedicamentos={buscarMedicamentos}
          />
        </Seccion>
        </div>
      </div>

      {guardada ? (
        <ConsultaGuardada
          consulta={guardada.consulta}
          medicamentos={guardada.medicamentos}
          pacienteId={paciente.id}
          onVer={setVista}
        />
      ) : (
        <>
          <div className="flex flex-col-reverse gap-3 border-t border-borde pt-6 sm:flex-row sm:justify-end">
            <Link
              href={`/pacientes/${paciente.id}`}
              className="flex items-center justify-center rounded-control border border-navy px-4 py-2.5 font-semibold text-navy transition-colors hover:bg-navy-tint"
            >
              Cancelar
            </Link>
            <button
              type="button"
              onClick={intentarVistaPrevia}
              className="flex items-center justify-center gap-2 rounded-control border border-navy px-4 py-2.5 font-semibold text-navy transition-colors hover:bg-navy-tint"
            >
              <FileText aria-hidden size={18} strokeWidth={1.5} />
              Ver cómo quedará
            </button>
            <button
              type="submit"
              disabled={guardando}
              className="flex items-center justify-center gap-2 rounded-control bg-teal px-5 py-2.5 font-semibold text-white transition-colors hover:bg-teal-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {guardando ? (
                <Loader2 aria-hidden className="animate-spin" size={18} strokeWidth={1.5} />
              ) : (
                <Save aria-hidden size={18} strokeWidth={1.5} />
              )}
              {guardando ? "Guardando…" : "Guardar y generar PDF"}
            </button>
          </div>

          {intentoEnvio && !todoValida ? (
            <p role="alert" className="text-sm text-rojo">
              Revisa los campos marcados en rojo antes de guardar.
            </p>
          ) : null}

          {errorGuardado ? (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-control bg-rojo-tint px-3 py-2.5 text-sm text-rojo"
            >
              <AlertCircle aria-hidden className="mt-px shrink-0" size={16} strokeWidth={1.5} />
              {errorGuardado}
            </p>
          ) : null}
        </>
      )}

      {vista ? (
        <VistaPreviaPdf
          key={`${vista}-${guardada?.consulta.id ?? "sin-guardar"}`}
          titulo={vista === "historial" ? "Historial clínico" : "Receta médica"}
          descripcion={
            guardada
              ? `${paciente.nombre_completo}${
                  guardada.consulta.numero_receta
                    ? ` · receta N.º ${guardada.consulta.numero_receta}`
                    : ""
                }`
              : `${paciente.nombre_completo} · vista previa, sin guardar`
          }
          onCerrar={() => setVista(null)}
          generar={() => {
            // La mayoría de edad se decide contra la fecha de LA CONSULTA
            // (ADR-003), que es la que documenta el papel, no contra el día en
            // que se mire la vista previa.
            const pdfPaciente = pacienteParaPdf(paciente, fechaConsulta);

            // Ya guardada se usa la FILA de la base, no lo que hay en pantalla:
            // es la única que trae el `numero_receta` de verdad, el que sale
            // impreso y el que la doctora va a poder rastrear después.
            const pdfConsulta = guardada
              ? consultaParaPdf(guardada.consulta)
              : aConsultaPdf(datos, paciente.id);

            if (vista === "receta") {
              return generateRecetaPdf(
                pdfPaciente,
                pdfConsulta,
                (guardada?.medicamentos ?? []).map(medicamentoParaPdf)
              );
            }

            // "Fecha de Elaboración" = la consulta más antigua del paciente
            // (03-Historial-Clinico.md). Si esta se está fechando antes que
            // todas las guardadas, la más antigua pasa a ser esta.
            const primeraGuardada = parseFecha(fechaPrimeraConsulta);
            const primera =
              primeraGuardada && primeraGuardada < fechaConsulta ? primeraGuardada : fechaConsulta;

            return generateHistorialPdf(pdfPaciente, pdfConsulta, primera);
          }}
        />
      ) : null}
    </form>
  );
}

/**
 * El número de receta, en mono sobre turquesa (docs/diseno/Prompts-Stitch.md).
 *
 * Antes de guardar dice que se asigna al guardar, y no un número tentativo: el
 * correlativo lo entrega la secuencia de Postgres en el INSERT (ADR-002), así
 * que cualquier número que se enseñara antes sería una promesa que el sistema
 * no puede cumplir — dos consultas abiertas a la vez verían el mismo.
 */
function NumeroDeReceta({ numero }: { numero: number | null }) {
  if (numero === null) {
    return (
      <span className="rounded-full border border-borde bg-superficie px-3 py-1 text-xs font-medium text-texto-secundario">
        N.º de receta: se asigna al guardar
      </span>
    );
  }
  return (
    <span className="rounded-full bg-teal-tint px-3 py-1 text-xs font-medium text-teal">
      Receta <span className="identificador font-semibold">N.º {numero}</span>
    </span>
  );
}

/**
 * Lo que se ve cuando la consulta ya está en la base.
 *
 * El formulario deja de ofrecer "Guardar": guardar dos veces crearía una
 * consulta duplicada con un segundo número de receta, y un número quemado no
 * se recupera. Desde aquí solo se mira lo impreso o se vuelve a la ficha.
 *
 * El botón de receta **solo aparece si hay medicamentos**, igual que en la
 * línea de tiempo: sin ellos, esa mitad de la hoja saldría en blanco.
 */
function ConsultaGuardada({
  consulta,
  medicamentos,
  pacienteId,
  onVer,
}: {
  consulta: ConsultaRow;
  medicamentos: RecetaMedicamentoRow[];
  pacienteId: string;
  onVer: (vista: "historial" | "receta") => void;
}) {
  return (
    <section className="rounded-tarjeta border border-teal bg-teal-tint p-5 sm:p-6">
      <p className="flex items-center gap-2 font-semibold text-teal">
        <Check aria-hidden size={18} strokeWidth={1.5} />
        Consulta guardada
      </p>
      <p className="mt-1.5 text-sm text-navy">
        {consulta.numero_receta === null ? (
          <>
            Sin receta: no se emitió ningún número. El historial clínico ya está
            registrado.
          </>
        ) : (
          <>
            Receta{" "}
            <span className="identificador font-semibold">N.º {consulta.numero_receta}</span> con{" "}
            {medicamentos.length === 1 ? "1 medicamento" : `${medicamentos.length} medicamentos`}.
          </>
        )}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onVer("historial")}
          className="flex items-center gap-1.5 rounded-control border border-navy bg-superficie px-3 py-2 text-sm font-semibold text-navy transition-colors hover:bg-navy-tint hover:text-teal"
        >
          <FileText aria-hidden size={16} strokeWidth={1.5} />
          Ver historial
        </button>
        {medicamentos.length > 0 ? (
          <button
            type="button"
            onClick={() => onVer("receta")}
            className="flex items-center gap-1.5 rounded-control border border-navy bg-superficie px-3 py-2 text-sm font-semibold text-navy transition-colors hover:bg-navy-tint hover:text-teal"
          >
            <Pill aria-hidden size={16} strokeWidth={1.5} />
            Ver receta
          </button>
        ) : null}
        <Link
          href={`/pacientes/${pacienteId}`}
          className="flex items-center gap-1.5 rounded-control bg-teal px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-teal-hover"
        >
          Volver a la ficha
        </Link>
      </div>
    </section>
  );
}

/** "34 años" / "8 meses" — ADR-003 cuenta en meses por debajo del año. */
function formatearEdad(calculada: { anios: number; totalMeses: number } | null): string | null {
  if (!calculada) return null;
  if (calculada.anios < 1) {
    return calculada.totalMeses === 1 ? "1 mes" : `${calculada.totalMeses} meses`;
  }
  return calculada.anios === 1 ? "1 año" : `${calculada.anios} años`;
}

/* -------------------------------------------------------------------------- */
/* Cabecera de datos fijos                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Los datos del paciente que la consulta NO edita, sobre `#E8EEF2`.
 *
 * Ese fondo es la señal que Sistema-de-Diseno.md reserva para los bloques de
 * datos fijos, la misma que ya usa la ficha; aquí significa exactamente lo
 * mismo: esto no se cambia desde esta pantalla. Cuando algo de esto haya
 * cambiado —un teléfono, una ocupación— se corrige en la ficha, que es donde
 * viven esas columnas, y por eso el enlace está a la vista.
 *
 * Son, uno por uno, los campos que el historial imprime en su cabecera
 * (`lib/pdf/historial.ts`): verlos aquí es poder detectar el hueco ANTES de
 * imprimir.
 */
function BloquePaciente({ paciente, edad }: { paciente: PacienteRow; edad: string | null }) {
  const faltaNacimiento = !tieneFechaNacimiento(paciente.fecha_nacimiento);

  return (
    <section className="rounded-tarjeta border border-borde bg-navy-tint p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h2 className="text-[17px] font-semibold text-navy">{paciente.nombre_completo}</h2>
        <Link
          href={`/pacientes/${paciente.id}/editar`}
          className="flex items-center gap-1.5 text-sm font-semibold text-navy underline underline-offset-4 transition-colors hover:text-teal"
        >
          <Pencil aria-hidden size={14} strokeWidth={1.5} />
          Editar la ficha
        </Link>
      </div>
      <p className="mt-1 text-sm text-texto-secundario">
        Datos fijos del paciente. No se editan desde la consulta.
      </p>

      {tieneAlergia(paciente.alergia_actual) ? (
        <p className="mt-3 flex items-start gap-2 rounded-control border border-rojo bg-rojo-tint px-3 py-2 text-sm">
          <AlertCircle aria-hidden className="mt-0.5 shrink-0 text-rojo" size={16} strokeWidth={1.5} />
          <span>
            <span className="font-semibold tracking-[0.05em] text-rojo">ALERGIA REGISTRADA</span>
            <span className="ml-2 text-navy">{paciente.alergia_actual}</span>
          </span>
        </p>
      ) : null}

      {faltaNacimiento ? (
        <p className="mt-3 flex items-start gap-2 text-sm text-texto-secundario">
          <AlertCircle aria-hidden className="mt-0.5 shrink-0" size={16} strokeWidth={1.5} />
          Sin fecha de nacimiento, el historial se imprime con una raya en la
          edad (ADR-006). Se puede completar desde la ficha.
        </p>
      ) : null}

      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        <DatoFijo
          etiqueta={
            paciente.documento ? etiquetaTipoDocumento(paciente.tipo_documento) : "Documento"
          }
          valor={
            paciente.documento
              ? formatearDocumento(paciente.documento, paciente.tipo_documento)
              : null
          }
          vacio={SIN_DOCUMENTO}
          mono
        />
        <DatoFijo etiqueta="Edad" valor={edad} vacio={SIN_FECHA_NACIMIENTO} />
        <DatoFijo etiqueta="Sexo" valor={etiquetaSexo(paciente.sexo)} vacio="No registrado" />
        <DatoFijo etiqueta="Estado civil" valor={paciente.estado_civil} vacio="No registrado" />
        <DatoFijo etiqueta="Ocupación" valor={paciente.ocupacion} vacio="No registrada" />
        <DatoFijo etiqueta="Teléfono" valor={paciente.telefono} vacio="No registrado" mono />
        <DatoFijo
          etiqueta="Domicilio"
          valor={paciente.domicilio}
          vacio="No registrado"
          ancho="doble"
        />
        <DatoFijo
          etiqueta="Antecedentes heredofamiliares"
          valor={paciente.antecedentes_heredofamiliares}
          vacio="No registrados"
          ancho="completo"
        />
      </dl>
    </section>
  );
}

function DatoFijo({
  etiqueta,
  valor,
  vacio,
  mono = false,
  ancho = "simple",
}: {
  etiqueta: string;
  valor: string | null | undefined;
  vacio: string;
  mono?: boolean;
  ancho?: "simple" | "doble" | "completo";
}) {
  const hayDato = typeof valor === "string" && valor.trim().length > 0;
  const columnas =
    ancho === "completo" ? "col-span-2 sm:col-span-4" : ancho === "doble" ? "col-span-2" : "";

  return (
    <div className={columnas}>
      <dt className="text-[11px] font-semibold tracking-[0.05em] text-texto-secundario">
        {etiqueta.toUpperCase()}
      </dt>
      <dd
        className={
          hayDato
            ? `mt-0.5 text-sm whitespace-pre-wrap text-navy ${mono ? "identificador" : ""}`
            : "mt-0.5 text-sm text-texto-secundario italic"
        }
      >
        {hayDato ? valor : vacio}
      </dd>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Secciones colapsables                                                       */
/* -------------------------------------------------------------------------- */

/**
 * `<details>` nativo, controlado.
 *
 * Es la misma decisión que el `<dialog>` de la vista previa: abrir y cerrar,
 * el foco y el anuncio a los lectores de pantalla ya funcionan sin escribir
 * nada. Lo que sí hace falta controlar es el `open`, porque el formulario tiene
 * que poder abrir una sección cuando dentro hay un error.
 */
function Seccion({
  nombre,
  titulo,
  icono: Icono,
  nota,
  abierta,
  onAbrir,
  columnas = "dos",
  sufijoTitulo,
  children,
}: {
  nombre: NombreSeccion;
  titulo: string;
  icono: LucideIcon;
  nota?: string;
  abierta: boolean;
  onAbrir: (abierta: boolean) => void;
  columnas?: "una" | "dos" | "tres";
  /** Va a la derecha del título, dentro del `<summary>`. */
  sufijoTitulo?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <details
      open={abierta}
      onToggle={(e) => onAbrir((e.currentTarget as HTMLDetailsElement).open)}
      className="group rounded-tarjeta border border-borde bg-superficie shadow-clinica"
    >
      <summary
        // `list-none` + el chevron propio: el triángulo por defecto del
        // navegador es lo único de esta pantalla que no sería un icono de
        // Lucide con trazo de 1.5px.
        className="flex cursor-pointer list-none items-center gap-2.5 rounded-tarjeta p-5 sm:p-6 [&::-webkit-details-marker]:hidden"
        id={`seccion-${nombre}`}
      >
        <ChevronRight
          aria-hidden
          className="shrink-0 text-texto-secundario transition-transform group-open:rotate-90"
          size={18}
          strokeWidth={1.5}
        />
        <Icono aria-hidden className="shrink-0 text-navy" size={18} strokeWidth={1.5} />
        <h2 className="text-[17px] font-semibold text-navy">{titulo}</h2>
        {sufijoTitulo ? <span className="ml-auto">{sufijoTitulo}</span> : null}
      </summary>

      <div className="px-5 pb-5 sm:px-6 sm:pb-6">
        {nota ? <p className="mb-4 text-sm text-texto-secundario">{nota}</p> : null}
        <div
          className={`grid grid-cols-1 gap-6 ${
            columnas === "tres"
              ? "sm:grid-cols-2 lg:grid-cols-3"
              : columnas === "una"
                ? ""
                : "sm:grid-cols-2"
          }`}
        >
          {children}
        </div>
      </div>
    </details>
  );
}
