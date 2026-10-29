import type { PDFFont } from "pdf-lib";
import { parseFecha } from "@/lib/fechas";
import { aLineaUnica } from "@/lib/texto-plano";
import {
  ANTECEDENTES_PATOLOGICOS,
  MOTIVO_MAX_CHARS,
  MOTIVO_MAX_LINEAS,
  antecedenteCabeEnHistorial,
  motivoCabeEnHistorial,
  type CampoAntecedente,
  IMPRESION_DIAGNOSTICA_MAX_CHARS,
  IMPRESION_DIAGNOSTICA_MAX_LINEAS,
  TRATAMIENTO_MAX_CHARS,
  TRATAMIENTO_MAX_LINEAS,
  impresionDiagnosticaCabeEnHistorial,
  textoImpresionDiagnostica,
  tratamientoCabeEnHistorial,
} from "@/lib/pdf/historial-limits";
import type { Consulta } from "@/lib/pdf/types";
import type { ConsultaRow, PacienteRow } from "@/lib/supabase/tipos";

/**
 * Las reglas del formulario de consulta (RF-08, RF-09, RF-10), sin React.
 *
 * Está aparte de la pantalla por lo mismo que `lib/pacientes/formulario.ts`: es
 * lógica pura, la cubre `tests/consulta.test.ts` sin navegador ni base
 * de datos, y en la Sesión B la va a necesitar también la Server Action que
 * guarde — que debe validar otra vez, porque un `<form>` llega al servidor sin
 * ejecutar el JavaScript de la pantalla (Seguridad-OWASP.md).
 *
 * **Los campos son los de `lib/pdf/types.ts`, no una forma nueva.** Ahí ya está
 * definido qué es una consulta para este sistema, y coincide con las columnas
 * de `consultas` en `supabase/migrations/`.
 *
 * `signos_alarma` y `recomendaciones_no_farmacologicas` viven aquí porque son
 * columnas de `consultas`, pero conceptualmente son de la RECETA: se imprimen
 * en la mitad que se lleva el paciente. Sus límites, sus contadores y su
 * validación están en `./receta` (ADR-005), no en este archivo.
 */

/**
 * Todo texto, porque todo sale de un `<input>`. La conversión a número —y el
 * problema de la coma decimal— vive en `aNumero`.
 */
export interface DatosConsulta {
  fecha: string;
  // Antecedentes personales patológicos DE ESTA consulta (los heredofamiliares
  // son del paciente y viven en su ficha).
  alergias: string;
  patologias: string;
  quirurgicos: string;
  transfusionales: string;
  // Exploración física.
  pa: string;
  fc: string;
  fr: string;
  temperatura: string;
  peso: string;
  motivo_consulta: string;
  impresion_diagnostica: string;
  cie10_codigo: string;
  tratamiento: string;
  // De la RECETA, aunque la columna viva en `consultas`: son lo que se lleva el
  // paciente impreso en su mitad de la hoja (05-Prescripcion-Receta.md). Sus
  // límites y su validación están en ./receta, no aquí.
  signos_alarma: string;
  recomendaciones_no_farmacologicas: string;
}

export type CampoConsulta = keyof DatosConsulta;

export type ErroresConsulta = Partial<Record<CampoConsulta, string>>;

export const DATOS_VACIOS: DatosConsulta = {
  fecha: "",
  alergias: "",
  patologias: "",
  quirurgicos: "",
  transfusionales: "",
  pa: "",
  fc: "",
  fr: "",
  temperatura: "",
  peso: "",
  motivo_consulta: "",
  impresion_diagnostica: "",
  cie10_codigo: "",
  tratamiento: "",
  signos_alarma: "",
  recomendaciones_no_farmacologicas: "",
};

/**
 * Con qué se abre el formulario.
 *
 * 03-Historial-Clinico.md lo llama "consulta subsecuente": al abrir a un
 * paciente que ya tiene historial, sus antecedentes patológicos vienen de la
 * última visita y la doctora solo corrige lo que haya cambiado. Volver a
 * teclear "Hipertensión arterial" en cada visita de un hipertenso es la forma
 * segura de que un día no se teclee y el historial impreso salga sin ella.
 *
 * **La precarga se anuncia en la pantalla, con la fecha de la que viene.** Un
 * campo que aparece lleno sin decir de dónde salió es un dato viejo disfrazado
 * de dato nuevo; con la fecha a la vista, revisarlo es parte de la consulta.
 *
 * Sin consultas previas, `alergias` se precarga desde `pacientes.alergia_actual`
 * (RF-07): si la ficha grita "ALERGIA REGISTRADA" y el historial impreso sale
 * con el renglón "Alergias:" en blanco, el papel contradice a la pantalla.
 *
 * `fecha` la pone el SERVIDOR y llega ya en `YYYY-MM-DD`. No se calcula aquí
 * con `new Date()`: además del desajuste de hidratación, la fecha de la
 * consulta es la que se imprime como "Fecha Actual" del historial, y tomarla
 * del reloj del navegador la hace depender del huso horario de la máquina.
 */
export function datosIniciales({
  hoyISO,
  paciente,
  ultimaConsulta,
}: {
  hoyISO: string;
  paciente: Pick<PacienteRow, "alergia_actual">;
  ultimaConsulta: ConsultaRow | null;
}): DatosConsulta {
  // Lo precargado pasa por `aLineaUnica` igual que lo que se teclea: una fila
  // guardada antes de que estos campos frenaran la tecla Enter podría traer un
  // salto de línea, y ese carácter hace lanzar a pdf-lib desde el contador en
  // vivo — o sea, durante el render (ver lib/texto-plano.ts). El formulario no
  // puede confiar en que lo que ya está en la base esté limpio.
  return {
    ...DATOS_VACIOS,
    fecha: hoyISO,
    alergias: aLineaUnica(
      ultimaConsulta ? (ultimaConsulta.alergias ?? "") : (paciente.alergia_actual ?? "")
    ),
    patologias: aLineaUnica(ultimaConsulta?.patologias ?? ""),
    quirurgicos: aLineaUnica(ultimaConsulta?.quirurgicos ?? ""),
    transfusionales: aLineaUnica(ultimaConsulta?.transfusionales ?? ""),
  };
}

/* -------------------------------------------------------------------------- */
/* Números                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Lee una medición tecleada y la devuelve como número, o `null` si el campo
 * está vacío, o `NaN` si lo escrito no es un número.
 *
 * **Acepta la coma decimal**, y no es un detalle de comodidad: en Ecuador
 * "36,5" es como se escribe una temperatura. La columna de la base es `numeric`
 * y Postgres rechaza `36,5`; sin esta normalización, el primer registro con
 * decimales acabaría en un error crudo de la base, o peor, en un campo vacío en
 * el historial impreso.
 *
 * Por eso los cuatro campos de medición son `type="text"` con
 * `inputMode="decimal"` y no `type="number"`: un `<input type="number">`
 * descarta el valor entero cuando el separador no es el que espera el locale
 * del navegador — se queda con la cadena vacía y no hay nada que validar.
 */
export function aNumero(texto: string): number | null {
  const limpio = texto.trim().replace(",", ".");
  if (!limpio) return null;
  // `Number("")` es 0 y `Number(" 12 ")` es 12: se filtra antes para que un
  // campo vacío no se convierta en un cero impreso en la hoja.
  return /^\d+(\.\d+)?$/.test(limpio) ? Number(limpio) : Number.NaN;
}

/** Rangos con los que se avisa —sin bloquear— de un valor poco creíble. */
const RANGOS_PLAUSIBLES: Partial<Record<CampoConsulta, { min: number; max: number; que: string }>> = {
  fc: { min: 30, max: 220, que: "latidos por minuto" },
  fr: { min: 6, max: 80, que: "respiraciones por minuto" },
  temperatura: { min: 30, max: 45, que: "grados" },
  peso: { min: 1, max: 300, que: "kilogramos" },
};

/**
 * Avisos, no errores: se ven en gris y NO bloquean el guardado.
 *
 * Una FC de 210 en un lactante con fiebre es real, y un formulario que la
 * rechaza obliga a la doctora a mentirle al sistema. Lo que sí atrapa esto es
 * el dedo torpe —"365" en temperatura, "7" en peso de un adulto—, que es un
 * error de tecleo, no un dato clínico raro.
 */
export function avisosConsulta(datos: DatosConsulta): Partial<Record<CampoConsulta, string>> {
  const avisos: Partial<Record<CampoConsulta, string>> = {};

  for (const [campo, rango] of Object.entries(RANGOS_PLAUSIBLES)) {
    const valor = aNumero(datos[campo as CampoConsulta]);
    if (valor === null || Number.isNaN(valor)) continue;
    if (valor < rango.min || valor > rango.max) {
      avisos[campo as CampoConsulta] =
        `¿Seguro? ${valor} ${rango.que} está fuera de lo habitual (${rango.min}–${rango.max}). Se guarda igual si es correcto.`;
    }
  }

  // "120/80". La presión es texto libre en la base y así se queda —hay quien
  // anota "120/80 mmHg" o "no valorada"—, pero avisar de la forma rara evita
  // que un "12080" llegue impreso a la hoja.
  const pa = datos.pa.trim();
  if (pa && !/^\d{2,3}\s*\/\s*\d{2,3}$/.test(pa)) {
    avisos.pa = "Se espera algo como 120/80.";
  }

  return avisos;
}

/* -------------------------------------------------------------------------- */
/* Contadores de espacio (ADR-007)                                             */
/* -------------------------------------------------------------------------- */

export interface Contador {
  usados: number;
  maximo: number;
  /**
   * `true` cuando el texto NO cabe en la hoja — o sea, exactamente cuando el
   * guardado se bloquea.
   *
   * **No es "usados > maximo"**, y la diferencia importa. ADR-007 dice que esos
   * números son aproximaciones y que quien decide es la función de ajuste, que
   * mide con las métricas reales de la fuente. Las dos cosas no coinciden: 158
   * caracteres de prosa clínica caben de sobra en los dos renglones (medido),
   * aunque el contador diga 145. Si el número mandara sobre el color, la
   * doctora vería el contador en rojo con un texto que el sistema acepta —o, al
   * revés, en gris con uno que va a rechazar—. Manda la misma decisión que
   * bloquea, y el contador se anuncia como "aprox.".
   */
  excedido: boolean;
}

/**
 * El contador de "Impresión Diagnóstica" mide el texto COMPUESTO con el código
 * CIE-10, porque es lo que se imprime: `textoImpresionDiagnostica()` es la
 * misma función que usa el PDF. Elegir un código consume espacio del renglón, y
 * el contador tiene que reflejarlo en el momento de elegirlo, no al ver el PDF.
 *
 * `font` puede faltar durante los primeros milisegundos, mientras se incrusta
 * (ver `lib/pdf/medicion.ts`). Sin ella se cae al conteo de caracteres, que es
 * más estricto que la realidad: avisa de más, nunca de menos.
 */
export function contadorImpresionDiagnostica(
  datos: DatosConsulta,
  font?: PDFFont | null
): Contador {
  const texto = textoImpresionDiagnostica(datos.impresion_diagnostica, datos.cie10_codigo) ?? "";
  const cabe = font
    ? impresionDiagnosticaCabeEnHistorial(datos.impresion_diagnostica, datos.cie10_codigo, font)
    : texto.length <= IMPRESION_DIAGNOSTICA_MAX_CHARS;
  return {
    usados: texto.length,
    maximo: IMPRESION_DIAGNOSTICA_MAX_CHARS,
    excedido: !cabe,
  };
}

/**
 * "Padecimiento Actual" tiene TRES renglones impresos, no espacio libre. Lo
 * medido está en `lib/pdf/historial-limits.ts`; aquí solo se cuenta.
 */
export function contadorMotivo(datos: DatosConsulta, font?: PDFFont | null): Contador {
  const cabe = font
    ? motivoCabeEnHistorial(datos.motivo_consulta, font)
    : datos.motivo_consulta.length <= MOTIVO_MAX_CHARS;
  return {
    usados: datos.motivo_consulta.length,
    maximo: MOTIVO_MAX_CHARS,
    excedido: !cabe,
  };
}

/** Cada antecedente patológico ocupa DOS renglones, y cada uno su propio ancho. */
export function contadorAntecedente(
  campo: CampoAntecedente,
  datos: DatosConsulta,
  font?: PDFFont | null
): Contador {
  const texto = datos[campo];
  const maximo = ANTECEDENTES_PATOLOGICOS[campo].maxChars;
  const cabe = font ? antecedenteCabeEnHistorial(campo, texto, font) : texto.length <= maximo;
  return { usados: texto.length, maximo, excedido: !cabe };
}

export function contadorTratamiento(datos: DatosConsulta, font?: PDFFont | null): Contador {
  const usados = datos.tratamiento.length;
  const cabe = font
    ? tratamientoCabeEnHistorial(datos.tratamiento, font)
    : usados <= TRATAMIENTO_MAX_CHARS;
  return { usados, maximo: TRATAMIENTO_MAX_CHARS, excedido: !cabe };
}

/* -------------------------------------------------------------------------- */
/* Validación                                                                  */
/* -------------------------------------------------------------------------- */

/** Por qué "resume" no siempre basta — ver ADR-005 y ADR-007. */
const COLETILLA_ANCHO =
  " El renglón solo se puede cortar en un espacio, así que una palabra larguísima no cabe aunque el contador diga menos.";

export interface ContextoValidacion {
  /** Hoy según el servidor, ya convertido a fecha local con `parseFecha`. */
  hoy: Date;
  fechaNacimiento?: string | null;
  /**
   * La fuente con la que se mide si el texto cabe (`lib/pdf/medicion.ts`).
   *
   * Puede ser `null` los primeros milisegundos, mientras se incrusta. Sin ella
   * se valida solo con el contador de caracteres, que es la aproximación de
   * ADR-007: menos exacta, pero nunca deja pasar un texto largo sin avisar.
   */
  font?: PDFFont | null;
}

/**
 * Qué es obligatorio, y por qué estos tres y no más.
 *
 * La base acepta NULL en casi todo, porque tuvo que tragarse la importación
 * histórica (ADR-006). El formulario es más estricto que la base a propósito,
 * igual que el de alta de pacientes:
 *
 *  - **Fecha**: es la que se imprime como "Fecha Actual" y la que ordena la
 *    línea de tiempo. `date NOT NULL` en la base.
 *  - **Motivo de consulta**: es lo que identifica la visita en la línea de
 *    tiempo (RF-20). Sin él, la ficha muestra "Sin motivo registrado" y la
 *    consulta queda irreconocible entre las demás.
 *  - **Impresión diagnóstica**: es el campo 6 de la hoja de papel y el que da
 *    sentido al CIE-10. Una consulta sin diagnóstico no se puede leer después.
 *
 * El **tratamiento no** es obligatorio: una revisión o un control pueden no
 * llevarlo, y es la misma razón por la que la línea de tiempo solo ofrece el
 * PDF de receta si hay medicamentos. El **código CIE-10 tampoco**: RF-11 pide
 * poder buscarlo y seleccionarlo, no que no exista consulta sin él.
 */
export function validarConsulta(
  datos: DatosConsulta,
  { hoy, fechaNacimiento, font }: ContextoValidacion
): ErroresConsulta {
  const errores: ErroresConsulta = {};

  // --- Fecha ---
  const fecha = parseFecha(datos.fecha);
  if (!datos.fecha.trim()) {
    errores.fecha = "La fecha de la consulta es obligatoria.";
  } else if (!fecha) {
    errores.fecha = "Esa fecha no existe. Usa el formato del calendario.";
  } else if (fecha > hoy) {
    // Comparar `Date` con `Date`, las dos construidas con `parseFecha`: una de
    // ellas como cadena habría vuelto a caer en el bug de huso horario que ya
    // se corrigió en la edad y en la fecha de la receta.
    errores.fecha = "La consulta no puede tener fecha futura.";
  } else {
    const nacimiento = parseFecha(fechaNacimiento);
    if (nacimiento && fecha < nacimiento) {
      errores.fecha = "La consulta no puede ser anterior al nacimiento del paciente.";
    }
  }

  // --- Motivo e impresión diagnóstica ---
  if (!datos.motivo_consulta.trim()) {
    errores.motivo_consulta = "Escribe el motivo de consulta.";
  }
  if (!datos.impresion_diagnostica.trim()) {
    errores.impresion_diagnostica = "Escribe la impresión diagnóstica.";
  }

  // --- Exploración física ---
  for (const campo of ["fc", "fr", "temperatura", "peso"] as const) {
    if (Number.isNaN(aNumero(datos[campo]))) {
      errores[campo] = "Solo números. Usa coma o punto para los decimales.";
    }
  }

  // --- Espacio en la hoja (ADR-007) ---
  //
  // Quien decide es la función de ajuste, que mide con las métricas reales de
  // la fuente; el contador de caracteres es la aproximación de respaldo
  // mientras la fuente se incrusta. Sin esto, el texto se perdería al imprimir
  // o `generateHistorialPdf` lanzaría `ContenidoExcedeEspacioError` DESPUÉS de
  // guardar, que es justo lo que ADR-007 quiere evitar.
  // Los campos del historial que hasta la Fase 4B no tenían tope medido. No
  // existe "sin límite" en una hoja de tamaño fijo: el motivo se montaba sobre
  // "6. Impresión Diagnóstica" y los antecedentes sobre el renglón de abajo.
  if (!errores.motivo_consulta && contadorMotivo(datos, font).excedido) {
    errores.motivo_consulta = `No cabe en los ${MOTIVO_MAX_LINEAS} renglones impresos de "Padecimiento Actual". Resume hasta unos ${MOTIVO_MAX_CHARS} caracteres.${COLETILLA_ANCHO}`;
  }

  for (const campo of Object.keys(ANTECEDENTES_PATOLOGICOS) as CampoAntecedente[]) {
    const contador = contadorAntecedente(campo, datos, font);
    if (contador.excedido) {
      errores[campo] = `No cabe en los 2 renglones de este antecedente. Resume hasta unos ${contador.maximo} caracteres.${COLETILLA_ANCHO}`;
    }
  }

  if (!errores.impresion_diagnostica && contadorImpresionDiagnostica(datos, font).excedido) {
    errores.impresion_diagnostica =
      `No cabe en los ${IMPRESION_DIAGNOSTICA_MAX_LINEAS} renglones de la hoja, contando el código CIE-10. Resume hasta unos ${IMPRESION_DIAGNOSTICA_MAX_CHARS} caracteres.${COLETILLA_ANCHO}`;
  }

  if (contadorTratamiento(datos, font).excedido) {
    errores.tratamiento =
      `No cabe en los ${TRATAMIENTO_MAX_LINEAS} renglones de la hoja. Resume hasta unos ${TRATAMIENTO_MAX_CHARS} caracteres.${COLETILLA_ANCHO}`;
  }

  return errores;
}

export function sinErrores(errores: ErroresConsulta): boolean {
  return Object.values(errores).every((mensaje) => !mensaje);
}

/* -------------------------------------------------------------------------- */
/* Salida                                                                      */
/* -------------------------------------------------------------------------- */

/** Texto vacío a `null`: la base guarda NULL, no cadenas vacías. */
function oNulo(texto: string): string | null {
  const limpio = texto.trim();
  return limpio ? limpio : null;
}

/**
 * Lo tecleado, con la forma que espera el módulo de PDF (`lib/pdf/types.ts`).
 *
 * Es lo que permite ver la hoja impresa ANTES de guardar. El `id` va vacío
 * porque todavía no existe fila: nada de este objeto se escribe en la base en
 * esta sesión — el guardado es la 4.5.
 *
 * `numeroReceta` se deja fuera a propósito mientras la consulta no está
 * guardada: lo asigna la secuencia de Postgres al insertar (ADR-002), y el PDF
 * del historial no lo imprime. Inventar uno para la vista previa sería enseñar
 * un correlativo que después no coincidiría con el de la receta impresa. Ya
 * guardada, quien genera los PDF usa la fila devuelta por la base, que sí lo
 * trae.
 */
export function aConsultaPdf(datos: DatosConsulta, pacienteId: string): Consulta {
  return {
    id: "",
    pacienteId,
    fecha: datos.fecha,
    motivoConsulta: oNulo(datos.motivo_consulta),
    alergias: oNulo(datos.alergias),
    patologias: oNulo(datos.patologias),
    quirurgicos: oNulo(datos.quirurgicos),
    transfusionales: oNulo(datos.transfusionales),
    exploracionFisica: {
      pa: oNulo(datos.pa),
      // `aNumero` puede devolver NaN, pero solo si `validarConsulta` ya lo
      // marcó como error y el formulario bloqueó el envío. Se filtra igual: un
      // NaN en el PDF se dibujaría como "NaN" sobre la hoja.
      fc: numeroLimpio(datos.fc),
      fr: numeroLimpio(datos.fr),
      temperatura: numeroLimpio(datos.temperatura),
      peso: numeroLimpio(datos.peso),
    },
    impresionDiagnostica: oNulo(datos.impresion_diagnostica),
    codigoCie10: oNulo(datos.cie10_codigo),
    tratamiento: oNulo(datos.tratamiento),
    signosAlarma: oNulo(datos.signos_alarma),
    recomendacionesNoFarmacologicas: oNulo(datos.recomendaciones_no_farmacologicas),
  };
}

function numeroLimpio(texto: string): number | null {
  const valor = aNumero(texto);
  return valor === null || Number.isNaN(valor) ? null : valor;
}
