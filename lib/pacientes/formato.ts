import { edadDe } from "@/lib/edad";

/**
 * Cómo se escribe en PANTALLA un paciente del listado.
 *
 * El criterio de fondo, y lo que separa este archivo de `lib/pdf/format.ts`:
 * un dato que la base no tiene (ADR-006) nunca se dibuja como un hueco. En la
 * plantilla impresa la solución era una raya, porque el campo mide 10pt; aquí
 * hay sitio para decirlo con palabras, y decirlo con palabras es mejor —"Sin
 * documento" se lee como "falta", una celda vacía se lee como "todavía no
 * cargó".
 *
 * Cada texto de ausencia va además en tipografía de CUERPO, nunca en la mono de
 * identificadores: así "Sin documento" no puede confundirse de reojo con un
 * número real, aunque ocupen la misma columna.
 */

/**
 * "Sin documento", no "Sin cédula".
 *
 * Desde que existen los pasaportes, decir "Sin cédula" de un paciente sin
 * documento prejuzga cuál va a traer — y de un extranjero sería directamente
 * falso. Lo que la ficha sabe es que no hay NINGÚN documento registrado, y eso
 * es lo que dice.
 *
 * Ojo con la distinción, que es la que pidió no confundir: "sin documento" son
 * los 83 de la migración; un paciente con pasaporte tiene su documento completo
 * y nunca ve este texto.
 */
export const SIN_DOCUMENTO = "Sin documento";
export const SIN_FECHA_NACIMIENTO = "Edad no registrada";

/**
 * Iniciales para el avatar. Los nombres migrados vienen como
 * "APELLIDO APELLIDO NOMBRE…", así que las dos primeras palabras dan las
 * iniciales de los apellidos, que es como la doctora los tiene archivados.
 */
export function iniciales(nombreCompleto: string): string {
  return nombreCompleto
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((palabra) => palabra[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * Edad en texto largo, la forma en que se dice en voz alta en consulta.
 * ADR-003: por debajo del año se cuenta en meses.
 *
 * `fechaReferencia` se pasa siempre desde fuera —no se llama a `new Date()`
 * aquí dentro— para que la función sea determinista y comprobable.
 */
export function formatEdadListado(
  fechaNacimiento: string | null | undefined,
  fechaReferencia: string | Date
): string | null {
  const edad = edadDe(fechaNacimiento, fechaReferencia);
  if (!edad) return null;

  if (edad.anios < 1) {
    return edad.totalMeses === 1 ? "1 mes" : `${edad.totalMeses} meses`;
  }
  return edad.anios === 1 ? "1 año" : `${edad.anios} años`;
}

/**
 * RF-07. La etiqueta roja sale si el campo trae algo; una cadena en blanco es
 * "no se registró", no "no tiene alergias".
 *
 * En la base de hoy este predicado es `false` para los 164 pacientes:
 * `alergia_actual` está vacío en todos, porque se alimenta desde la consulta
 * (02-Gestion-Pacientes.md) y todavía no hay ninguna. La etiqueta empezará a
 * aparecer sola en cuanto se guarde la primera.
 */
export function tieneAlergia(alergiaActual: string | null | undefined): boolean {
  return typeof alergiaActual === "string" && alergiaActual.trim().length > 0;
}

/**
 * Qué se considera "ficha incompleta" en el listado.
 *
 * ADR-006 dejó tres campos opcionales, pero **`sexo` no entra en este
 * predicado**, y es una decisión, no un olvido: falta en los 164 pacientes. Una
 * marca que aparece en el 100% de las filas no señala nada, solo ensucia; y el
 * dato no está en el Sheet de origen, así que no hay nada que "completar"
 * revisando — solo se puede preguntar en la siguiente consulta. Queda anotado
 * como pendiente en la migración inicial de datos, que es su sitio.
 *
 * Documento (83 vacíos) y fecha de nacimiento (29 vacías, todas dentro de esos
 * 83) sí: identifican al paciente, se preguntan en 10 segundos, y sin la
 * segunda no se puede aplicar ADR-003.
 *
 * Lo que se mira es el NÚMERO del documento, no su tipo. `tipo_documento` es
 * NOT NULL y siempre trae valor, así que un paciente con pasaporte no está
 * incompleto — tiene otro documento, no le falta ninguno.
 */
export function fichaIncompleta(paciente: {
  documento: string | null;
  fecha_nacimiento: string | null;
}): boolean {
  return paciente.documento === null || paciente.fecha_nacimiento === null;
}

/** "1 paciente" / "164 pacientes", sin el "(s)" que delata a un programador. */
export function contarPacientes(n: number): string {
  return n === 1 ? "1 paciente" : `${n} pacientes`;
}

/**
 * La fecha en palabras se movió a `lib/fechas.ts` cuando la línea de tiempo de
 * consultas (Fase 3) necesitó también una versión compacta: los nombres de los
 * meses no podían vivir duplicados en dos módulos. Se reexporta para no romper
 * a quien ya la importaba desde aquí.
 */
export { formatFechaLarga } from "@/lib/fechas";
