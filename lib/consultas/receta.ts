import type { PDFFont } from "pdf-lib";
import {
  INDICACIONES_MAX_LINEAS,
  RECOMENDACIONES_MAX_CHARS,
  RECOMENDACIONES_MAX_LINEAS,
  SIGNOS_ALARMA_MAX_CHARS,
  SIGNOS_ALARMA_MAX_LINEAS,
  indicacionesCabenEnReceta,
  recomendacionesCabenEnReceta,
  signosAlarmaCabenEnReceta,
} from "@/lib/pdf/receta-limits";
import type { RecetaMedicamento } from "@/lib/pdf/types";
import {
  PRESENTACIONES,
  VIAS_ADMINISTRACION,
  type Presentacion,
  type ViaAdministracion,
} from "@/lib/pdf/vocabulario";
import type { Contador, DatosConsulta } from "./formulario";

/**
 * Las reglas de la receta (RF-15, RF-17, RF-18), sin React.
 *
 * Cierra lo que ADR-005 dejó pendiente desde la Fase 1: el contador de
 * caracteres visible y el bloqueo del guardado. Hasta ahora los límites solo
 * existían del lado del PDF, que es donde ya es tarde — la doctora se enteraba
 * al ver la receta impresa, después de guardar.
 *
 * **Los números no se escriben aquí.** Salen todos de `lib/pdf/receta-limits.ts`,
 * que es la fuente única que fija ADR-005: si la plantilla física se recalibra,
 * se recalculan allá y esto los sigue.
 */

/**
 * Un renglón de medicamento tal como se teclea.
 *
 * Todo `string` porque todo sale de un `<input>`, con dos excepciones
 * deliberadas: `presentacion` y `via_administracion` llevan el tipo unión de
 * `lib/pdf/vocabulario.ts` en lugar de texto libre. Es el mismo vocabulario
 * cerrado que fijan los CHECK de la base, y tenerlo tipado significa que
 * TypeScript rechaza al compilar un valor que Postgres rechazaría al insertar.
 * El `""` es el estado "todavía sin elegir" del desplegable, no un valor
 * válido: `validarMedicamento` lo exige antes de guardar.
 */
export interface DatosMedicamento {
  /** Clave local para React. No viaja a la base: allá el id lo pone la base. */
  id: string;
  nombre_generico: string;
  nombre_comercial: string;
  presentacion: Presentacion | "";
  via_administracion: ViaAdministracion | "";
  cantidad: string;
  dosis: string;
  frecuencia: string;
  duracion: string;
}

export type CampoMedicamento = Exclude<keyof DatosMedicamento, "id">;
export type ErroresMedicamento = Partial<Record<CampoMedicamento, string>>;

/** Los cuatro campos que la mitad "Rp" imprime, y los cuatro de "Prescripción". */
export const CAMPOS_RP = [
  "nombre_generico",
  "nombre_comercial",
  "presentacion",
  "cantidad",
] as const satisfies readonly CampoMedicamento[];

export const CAMPOS_PRESCRIPCION = [
  "dosis",
  "via_administracion",
  "frecuencia",
  "duracion",
] as const satisfies readonly CampoMedicamento[];

let contador = 0;
/** Id local irrepetible dentro de la sesión, solo para las claves de React. */
export function medicamentoVacio(): DatosMedicamento {
  contador += 1;
  return {
    id: `nuevo-${contador}`,
    nombre_generico: "",
    nombre_comercial: "",
    presentacion: "",
    via_administracion: "",
    cantidad: "",
    dosis: "",
    frecuencia: "",
    duracion: "",
  };
}

export function esPresentacion(valor: string): valor is Presentacion {
  return (PRESENTACIONES as readonly string[]).includes(valor);
}

export function esViaAdministracion(valor: string): valor is ViaAdministracion {
  return (VIAS_ADMINISTRACION as readonly string[]).includes(valor);
}

/**
 * La cantidad como entero positivo, o `null` si lo escrito no lo es.
 *
 * La base es `integer not null check (cantidad > 0)`: no admite decimales, ni
 * cero, ni "medio frasco" —eso se expresa en la dosis— y `lib/pdf/types.ts` lo
 * dice con las mismas palabras. Se valida aquí para que el rechazo llegue como
 * un mensaje junto al campo y no como un error crudo de Postgres.
 */
export function aCantidad(texto: string): number | null {
  const limpio = texto.trim();
  if (!/^\d+$/.test(limpio)) return null;
  const numero = Number(limpio);
  return numero > 0 ? numero : null;
}

/**
 * TODOS los campos son obligatorios, igual que en la base.
 *
 * No es rigidez heredada: una receta es un documento legal que ejecuta un
 * farmacéutico, y un renglón sin dosis, sin vía o sin duración no se puede
 * despachar (`lib/pdf/types.ts`). Un renglón vacío del todo no cuenta como
 * error —es una fila recién agregada— y `medicamentoEstaVacio` lo distingue.
 */
export function validarMedicamento(medicamento: DatosMedicamento): ErroresMedicamento {
  const errores: ErroresMedicamento = {};
  if (!medicamento.nombre_generico.trim()) errores.nombre_generico = "Falta el genérico.";
  if (!medicamento.nombre_comercial.trim()) errores.nombre_comercial = "Falta el comercial.";
  if (!medicamento.presentacion) errores.presentacion = "Elige la presentación.";
  if (!medicamento.via_administracion) errores.via_administracion = "Elige la vía.";
  if (aCantidad(medicamento.cantidad) === null) errores.cantidad = "Un número entero mayor que 0.";
  if (!medicamento.dosis.trim()) errores.dosis = "Falta la dosis.";
  if (!medicamento.frecuencia.trim()) errores.frecuencia = "Falta la frecuencia.";
  if (!medicamento.duracion.trim()) errores.duracion = "Falta la duración.";
  return errores;
}

/** `true` si el renglón está entero en blanco: se agregó y no se llenó. */
export function medicamentoEstaVacio(medicamento: DatosMedicamento): boolean {
  return (
    !medicamento.nombre_generico.trim() &&
    !medicamento.nombre_comercial.trim() &&
    !medicamento.presentacion &&
    !medicamento.via_administracion &&
    !medicamento.cantidad.trim() &&
    !medicamento.dosis.trim() &&
    !medicamento.frecuencia.trim() &&
    !medicamento.duracion.trim()
  );
}

/**
 * Lo tecleado con la forma que espera el módulo de PDF.
 *
 * Solo tiene sentido sobre un renglón que ya validó: los `as` de presentación y
 * vía se apoyan en que `validarMedicamento` exigió elegirlas.
 */
export function aMedicamentoPdf(
  medicamento: DatosMedicamento,
  consultaId: string
): RecetaMedicamento {
  return {
    id: medicamento.id,
    consultaId,
    nombreGenerico: medicamento.nombre_generico.trim(),
    nombreComercial: medicamento.nombre_comercial.trim(),
    presentacion: medicamento.presentacion as Presentacion,
    viaAdministracion: medicamento.via_administracion as ViaAdministracion,
    cantidad: aCantidad(medicamento.cantidad) ?? 0,
    dosis: medicamento.dosis.trim(),
    frecuencia: medicamento.frecuencia.trim(),
    duracion: medicamento.duracion.trim(),
  };
}

/* -------------------------------------------------------------------------- */
/* Contadores (ADR-005)                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Igual que los contadores del historial: `excedido` NO es "usados > maximo",
 * es el veredicto de la función de ajuste, que mide con las métricas reales de
 * la fuente. ADR-005 lo dice con todas las letras — "un texto de 180 caracteres
 * con palabras muy largas puede no caber aunque respete el contador, y uno de
 * 195 con palabras cortas cabe de sobra" — así que el rojo del contador y el
 * bloqueo del guardado tienen que ser la misma decisión, no dos parecidas.
 *
 * Sin fuente todavía incrustada se cae al conteo de caracteres: más estricto
 * que la realidad, avisa de más y nunca de menos.
 */
export function contadorSignosAlarma(texto: string, font?: PDFFont | null): Contador {
  const cabe = font ? signosAlarmaCabenEnReceta(texto, font) : texto.length <= SIGNOS_ALARMA_MAX_CHARS;
  return { usados: texto.length, maximo: SIGNOS_ALARMA_MAX_CHARS, excedido: !cabe };
}

export function contadorRecomendaciones(texto: string, font?: PDFFont | null): Contador {
  const cabe = font
    ? recomendacionesCabenEnReceta(texto, font)
    : texto.length <= RECOMENDACIONES_MAX_CHARS;
  return { usados: texto.length, maximo: RECOMENDACIONES_MAX_CHARS, excedido: !cabe };
}

/* -------------------------------------------------------------------------- */
/* Validación de la receta entera                                              */
/* -------------------------------------------------------------------------- */

export interface ErroresReceta {
  /** Por id de renglón. */
  medicamentos: Record<string, ErroresMedicamento>;
  signos_alarma?: string;
  recomendaciones_no_farmacologicas?: string;
  /** La lista completa no cabe en los renglones de "Indicaciones". */
  lista?: string;
}

export function sinErroresReceta(errores: ErroresReceta): boolean {
  return (
    !errores.signos_alarma &&
    !errores.recomendaciones_no_farmacologicas &&
    !errores.lista &&
    Object.values(errores.medicamentos).every((e) => Object.keys(e).length === 0)
  );
}

/**
 * Valida la receta completa contra el espacio REAL de la plantilla.
 *
 * Los tres bloques de ADR-005 en un solo sitio, y ninguno con un tope fijo
 * inventado: cuántos medicamentos caben depende del largo de cada descripción,
 * no de cuántos son, así que lo decide `indicacionesCabenEnReceta()` sobre la
 * lista de ese momento. En la práctica son 4–6 con descripciones típicas, pero
 * el número no se escribe en ninguna parte.
 *
 * La lista solo se mide con los renglones **completos**: uno a medio llenar
 * todavía no tiene texto que ocupe sitio, y avisar de que "no cabe" mientras se
 * escribe el primero sería ruido.
 */
export function validarReceta(
  {
    signosAlarma,
    recomendaciones,
    medicamentos,
  }: { signosAlarma: string; recomendaciones: string; medicamentos: DatosMedicamento[] },
  font?: PDFFont | null
): ErroresReceta {
  const errores: ErroresReceta = { medicamentos: {} };

  for (const medicamento of medicamentos) {
    // Un renglón recién agregado y todavía en blanco no es un error: se
    // descarta al guardar (ver `medicamentosParaGuardar`).
    errores.medicamentos[medicamento.id] = medicamentoEstaVacio(medicamento)
      ? {}
      : validarMedicamento(medicamento);
  }

  if (contadorSignosAlarma(signosAlarma, font).excedido) {
    errores.signos_alarma = `No cabe en los ${SIGNOS_ALARMA_MAX_LINEAS} renglones de la receta. Resume hasta unos ${SIGNOS_ALARMA_MAX_CHARS} caracteres. El renglón solo se puede cortar en un espacio, así que una palabra larguísima no cabe aunque el contador diga menos.`;
  }

  if (contadorRecomendaciones(recomendaciones, font).excedido) {
    errores.recomendaciones_no_farmacologicas = `No cabe en los ${RECOMENDACIONES_MAX_LINEAS} renglones de la receta. Resume hasta unos ${RECOMENDACIONES_MAX_CHARS} caracteres. El renglón solo se puede cortar en un espacio, así que una palabra larguísima no cabe aunque el contador diga menos.`;
  }

  const completos = medicamentosParaGuardar(medicamentos).filter(
    (m) => Object.keys(validarMedicamento(m)).length === 0
  );
  if (
    font &&
    completos.length > 0 &&
    !indicacionesCabenEnReceta(
      completos.map((m) => aMedicamentoPdf(m, "")),
      font
    )
  ) {
    errores.lista = `La lista no cabe en los ${INDICACIONES_MAX_LINEAS} renglones de "Indicaciones". Quita un medicamento, acorta las descripciones o usa una segunda receta.`;
  }

  return errores;
}

/** Los renglones que de verdad se guardan: los que no están en blanco. */
export function medicamentosParaGuardar(medicamentos: DatosMedicamento[]): DatosMedicamento[] {
  return medicamentos.filter((m) => !medicamentoEstaVacio(m));
}

/** Atajo para la pantalla: ¿esta consulta lleva receta? */
export function llevaReceta(medicamentos: DatosMedicamento[]): boolean {
  return medicamentosParaGuardar(medicamentos).length > 0;
}

/** Los dos campos de la receta que viven en la fila de `consultas`. */
export type CampoRecetaConsulta = Extract<
  keyof DatosConsulta,
  "signos_alarma" | "recomendaciones_no_farmacologicas"
>;
