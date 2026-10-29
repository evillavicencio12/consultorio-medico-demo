/**
 * El vocabulario de los campos de `pacientes` y qué se considera "pendiente".
 *
 * Vive aparte del formulario porque lo consumen cuatro sitios —el formulario de
 * alta, el de edición, la ficha y el listado— y porque el vocabulario tiene que
 * ser el mismo que la base acepta. `SEXOS` replica el CHECK
 * `pacientes_sexo_check`; si algún día se agrega un valor, se agrega con una
 * migración y luego aquí, nunca al revés.
 */

import type { PacienteRow } from "@/lib/supabase/tipos";
import type { TipoDocumento } from "./documento";

export type Sexo = NonNullable<PacienteRow["sexo"]>;

/**
 * El CHECK de la base es `sexo = any(array['M','F'])`. Se guarda la letra, se
 * muestra la palabra — el mismo criterio que `lib/pdf/vocabulario.ts` usa para
 * las presentaciones y las vías: el valor guardado es un identificador estable,
 * la etiqueta es lo que lee una persona.
 */
export const SEXOS: { valor: Sexo; etiqueta: string }[] = [
  { valor: "M", etiqueta: "Masculino" },
  { valor: "F", etiqueta: "Femenino" },
];

export function etiquetaSexo(valor: string | null | undefined): string | null {
  return SEXOS.find((s) => s.valor === valor)?.etiqueta ?? null;
}

/**
 * `estado_civil` NO tiene CHECK en la base: es `text` libre. Esta lista es la
 * de 02-Gestion-Pacientes.md y la usa el dropdown, que es lo único que escribe
 * la columna. Se deja sin CHECK a propósito por ahora — los 164 pacientes
 * migrados lo tienen vacío y agregar la restricción sería una migración con
 * cero beneficio hasta que la columna tenga datos.
 */
export const ESTADOS_CIVILES = [
  "Soltero/a",
  "Casado/a",
  "Divorciado/a",
  "Viudo/a",
  "Unión libre",
] as const;

export type EstadoCivil = (typeof ESTADOS_CIVILES)[number];

export function esEstadoCivilConocido(valor: string): valor is EstadoCivil {
  return (ESTADOS_CIVILES as readonly string[]).includes(valor);
}

/**
 * Replica el CHECK `pacientes_tipo_documento_check`. Igual que `SEXOS`: se
 * guarda el identificador estable, se muestra la etiqueta.
 *
 * El orden no es alfabético — "Cédula" va primera porque es el caso de casi
 * todos los pacientes y es la opción que el desplegable trae puesta.
 *
 * `Otro documento` no es un cajón de sastre perezoso: cubre las cédulas
 * extranjeras (las colombianas y venezolanas son frecuentes aquí), los
 * documentos de refugiado y los carnés consulares. Sin esa opción la doctora
 * acabaría metiendo ese número en el campo de cédula, que es exactamente el
 * dato malo que se quiere evitar.
 */
export const TIPOS_DOCUMENTO: { valor: TipoDocumento; etiqueta: string; corta: string }[] = [
  { valor: "cedula", etiqueta: "Cédula ecuatoriana", corta: "Cédula" },
  { valor: "pasaporte", etiqueta: "Pasaporte", corta: "Pasaporte" },
  { valor: "otro", etiqueta: "Otro documento", corta: "Documento" },
];

/**
 * La etiqueta corta, para escribirla delante del número.
 *
 * La cédula devuelve cadena vacía a propósito: es el caso de casi todas las
 * fichas, y anteponerle "Cédula" a 164 filas del listado sería ruido en el 98%
 * de la pantalla para distinguir el 2%. El prefijo aparece solo cuando el
 * documento NO es lo que se da por supuesto, que es cuando informa.
 */
export function prefijoDocumento(tipo: string | null | undefined): string {
  if (!tipo || tipo === "cedula") return "";
  return TIPOS_DOCUMENTO.find((t) => t.valor === tipo)?.corta ?? "";
}

export function etiquetaTipoDocumento(tipo: string | null | undefined): string {
  return TIPOS_DOCUMENTO.find((t) => t.valor === tipo)?.etiqueta ?? "Documento";
}

/**
 * Los tres campos que ADR-006 dejó opcionales en la base y que el sistema tiene
 * que terminar de recolectar. El orden es el de la deuda real (83 sin cédula,
 * 164 sin sexo, 29 sin fecha) puesto de forma que la fila de la izquierda del
 * formulario se lea de arriba abajo.
 */
export type CampoPendiente = "documento" | "fecha_nacimiento" | "sexo";

/**
 * "documento de identidad" y no "cédula", desde que existen los pasaportes.
 *
 * Un paciente sin documento **no** es lo mismo que un paciente con pasaporte, y
 * la etiqueta tiene que poder decir lo primero sin dar por hecho lo segundo:
 * de los 83 sin documento no se sabe todavía cuál traerán. Decir "falta la
 * cédula" prejuzgaría el tipo, y en un extranjero sería sencillamente falso.
 */
export const ETIQUETA_PENDIENTE: Record<CampoPendiente, string> = {
  documento: "documento de identidad",
  fecha_nacimiento: "fecha de nacimiento",
  sexo: "sexo",
};

/**
 * Qué le falta a ESTE paciente, en concreto.
 *
 * Distinto de `fichaIncompleta()` de `formato.ts`, y la diferencia es
 * deliberada: aquel predicado decide si el LISTADO pinta la etiqueta gris, y
 * excluye `sexo` porque falta en los 164 y una marca que sale en el 100% de las
 * filas no señala nada. Esta función es para la pantalla de EDICIÓN, donde ya
 * se está mirando a un paciente y sí importa que le falte el sexo: es
 * exactamente el dato que hay que preguntar antes de imprimir su historial.
 *
 * Devuelve la lista, no un booleano, porque la pantalla tiene que decir *qué*
 * falta. Un formulario genérico frente a un paciente al que le faltan dos
 * datos de diecisiete obliga a la doctora a buscarlos ella.
 */
export function camposPendientes(paciente: {
  documento: string | null;
  fecha_nacimiento: string | null;
  sexo: string | null;
}): CampoPendiente[] {
  const faltan: CampoPendiente[] = [];
  // Falta el NÚMERO, no el tipo: `tipo_documento` es NOT NULL y siempre trae
  // algo. Un paciente con pasaporte tiene su documento completo y no aparece
  // aquí; solo aparecen los que no tienen ninguno.
  if (!paciente.documento) faltan.push("documento");
  if (!paciente.fecha_nacimiento) faltan.push("fecha_nacimiento");
  if (!paciente.sexo) faltan.push("sexo");
  return faltan;
}

/** "el documento de identidad y el sexo", con las concordancias en su sitio. */
export function listarPendientes(campos: CampoPendiente[]): string {
  const partes = campos.map(
    (c) => `${c === "fecha_nacimiento" ? "la" : "el"} ${ETIQUETA_PENDIENTE[c]}`
  );
  if (partes.length <= 1) return partes[0] ?? "";
  return `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`;
}
