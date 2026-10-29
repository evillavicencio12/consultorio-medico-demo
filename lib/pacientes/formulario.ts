/**
 * Las reglas del formulario de paciente: qué es obligatorio, qué es válido y
 * cómo se convierte lo tecleado en una fila que la base acepte.
 *
 * **Lógica pura, sin React y sin Supabase.** No es un capricho de arquitectura:
 * las mismas reglas tienen que correr en los dos lados. En el navegador, para
 * que la doctora vea el error mientras escribe; en la Server Action, porque un
 * `<form>` se puede enviar sin pasar por el JavaScript de la pantalla y porque
 * la validación del cliente no es una defensa (Seguridad-OWASP.md). Con las
 * reglas escritas dos veces, tarde o temprano una de las dos copias miente.
 *
 * El objetivo de fondo, y lo que ordena todas las decisiones de este archivo:
 * **que la doctora nunca vea un error de Postgres.** La base tiene tres
 * trampas para este formulario —el UNIQUE de `(tipo_documento, documento)`, el
 * CHECK de `sexo` y el CHECK `acompanante_obligatorio_si_menor`— y las tres
 * son correctas. Lo que no
 * sirve es su mensaje: "new row violates check constraint" no le dice a nadie
 * que hay que pedirle la cédula al señor que trajo al niño.
 */

import { esMenorDeEdad, parseFechaNacimiento } from "@/lib/edad";
import type { PacienteRow } from "@/lib/supabase/tipos";
import {
  esTipoDocumento,
  normalizarDocumento,
  validarDocumento,
  validarDocumentoEditado,
  TIPO_DOCUMENTO_POR_DEFECTO,
  type TipoDocumento,
} from "./documento";
import { esEstadoCivilConocido, SEXOS } from "./campos";

/**
 * Los campos del formulario se llaman **igual que las columnas**. Un solo
 * nombre para el `name=` del input, la clave del error y la columna: no hay
 * tabla de traducción que se pueda desincronizar.
 */
export const CAMPOS = [
  "tipo_documento",
  "documento",
  "nombre_completo",
  "fecha_nacimiento",
  "sexo",
  "estado_civil",
  "telefono",
  "correo",
  "domicilio",
  "ocupacion",
  "antecedentes_heredofamiliares",
  "nombre_acompanante",
  "tipo_documento_acompanante",
  "documento_acompanante",
  "correo_acompanante",
  "telefono_acompanante",
] as const;

export type CampoPaciente = (typeof CAMPOS)[number];

/** Lo tecleado, tal cual: todo texto, nada normalizado todavía. */
export type DatosPaciente = Record<CampoPaciente, string>;

export type ErroresPaciente = Partial<Record<CampoPaciente, string>>;

export const DATOS_VACIOS: DatosPaciente = {
  ...(Object.fromEntries(CAMPOS.map((campo) => [campo, ""])) as DatosPaciente),
  // Los dos tipos arrancan en "cédula" y no en blanco, y no es solo comodidad
  // para el caso mayoritario. Un desplegable que empieza vacío invita a
  // ignorarlo; uno que empieza en "Cédula ecuatoriana" hace que un pasaporte
  // tecleado sin cambiar el tipo choque contra el dígito verificador y obligue
  // a mirar. Con documentos que no se pueden verificar, convertir el descuido
  // en un error visible es la única protección que queda (ADR-008).
  tipo_documento: TIPO_DOCUMENTO_POR_DEFECTO,
  tipo_documento_acompanante: TIPO_DOCUMENTO_POR_DEFECTO,
};

/**
 * Topes de longitud. Las columnas son `text` sin límite, así que esto no
 * replica una restricción de la base: existe para que un pegado accidental no
 * meta media historia clínica en "ocupación", y para que lo que se escribe
 * quepa después en la plantilla física, que sí tiene un ancho fijo.
 */
const LARGO_MAXIMO: Partial<Record<CampoPaciente, number>> = {
  nombre_completo: 120,
  nombre_acompanante: 120,
  documento: 25,
  documento_acompanante: 25,
  // Estos tres topes ya no son "un número redondo razonable": son lo que la
  // PLANTILLA FÍSICA del historial puede imprimir, medido en la Fase 4B con
  // scripts/calibrar-limites-pdf.mjs. Antes se podía teclear más de lo que
  // cabía y el PDF lo dibujaba encima de la sección siguiente, sin avisar.
  // Los números viven en lib/pdf/historial-limits.ts; aquí se replican con su
  // origen a la vista porque este archivo no importa el módulo de PDF.
  domicilio: 155, // 2 renglones × 360pt @9pt
  ocupacion: 50, // 2 renglones × 155pt @10pt
  correo: 120,
  correo_acompanante: 120,
  telefono: 20,
  telefono_acompanante: 20,
  // 3 renglones impresos × 490pt @9.5pt (HEREDOFAMILIARES_MAX_CHARS). Estaba en
  // 1000: más del triple de lo que la hoja aguanta.
  antecedentes_heredofamiliares: 315,
};

/**
 * Rango plausible de `fecha_nacimiento`.
 *
 * La base NO tiene ningún CHECK que lo acote, y ya se pagó por eso: un paciente
 * llegó de la migración con `0214-06-08` porque el año se tecleó mal en el
 * Sheet y Postgres lo aceptó sin chistar —el tipo `date` admite años desde el
 * 4713 a.C. La corrección quedó registrada en la migración inicial de datos junto con
 * el pendiente de evaluar el CHECK. Mientras ese CHECK no exista, esta es la
 * única puerta por la que el dato entra hoy, así que la cierra aquí.
 */
const ANIO_MINIMO = 1900;

/** Un `<input type="date">` no acepta `max` sin este formato. */
export function comoValorDeInput(fecha: Date): string {
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const dia = String(fecha.getDate()).padStart(2, "0");
  return `${fecha.getFullYear()}-${mes}-${dia}`;
}

/**
 * Correo: comprobación de forma, no de existencia. Se queda corta a propósito
 * —validar RFC 5322 con una expresión regular es un clásico error— y solo
 * atrapa lo que de verdad pasa al teclear: falta la arroba, falta el punto,
 * sobra un espacio.
 */
function correoConForma(texto: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(texto);
}

/** Teléfono: dígitos y los separadores de siempre. Sin exigir formato local. */
function telefonoConForma(texto: string): boolean {
  return /^[\d\s()+-]{7,}$/.test(texto);
}

export interface ContextoValidacion {
  /**
   * `null` en el alta. En la edición, la fila tal como está guardada: de ahí
   * salen las dos concesiones a los datos migrados —qué cédula se acepta sin
   * examinar y qué campos pueden seguir vacíos.
   */
  guardado: PacienteRow | null;
  /** Se inyecta para que la validación sea determinista y comprobable. */
  hoy: Date;
}

/**
 * ¿Este campo es obligatorio para ESTE paciente?
 *
 * Aquí está la decisión que hace utilizable la limpieza de la deuda de datos.
 *
 * - **En el alta**, cédula, nombre, fecha de nacimiento y sexo son
 *   obligatorios, sin excepción. ADR-006 relajó la BASE por la migración
 *   histórica y dice con todas las letras que no relaja el formulario. Un
 *   paciente nuevo que entra incompleto es deuda nueva, que es justo lo que
 *   esta pantalla existe para dejar de generar.
 *
 * - **En la edición**, un campo que YA tiene valor sigue siendo obligatorio
 *   (borrarlo sería perder un dato), pero uno que está vacío puede seguir
 *   vacío. Y esto es lo importante: si la edición exigiera los tres campos,
 *   completar el sexo de un paciente del que no se sabe la cédula sería
 *   imposible, y la doctora abandonaría la pantalla sin guardar nada. Se
 *   prefiere un avance parcial guardado a un formulario perfecto que nadie
 *   puede enviar. La pantalla igual señala lo que falta; no lo esconde.
 */
export function esObligatorio(campo: CampoPaciente, contexto: ContextoValidacion): boolean {
  if (campo === "nombre_completo") return true;

  if (campo === "documento" || campo === "fecha_nacimiento" || campo === "sexo") {
    if (!contexto.guardado) return true;
    return contexto.guardado[campo] !== null;
  }

  return false;
}

/**
 * El tipo tecleado, si es uno de los que la base acepta.
 *
 * Cae al valor por defecto ante cualquier otra cosa en vez de propagar la
 * cadena cruda: el CHECK `pacientes_tipo_documento_check` la rechazaría, y un
 * error de base de datos por un desplegable manipulado no le sirve a nadie.
 * El valor se valida igual más abajo, así que un tipo inventado se reporta como
 * error de campo, no como un guardado silencioso.
 */
function tipoDe(valor: string): TipoDocumento {
  return esTipoDocumento(valor) ? valor : TIPO_DOCUMENTO_POR_DEFECTO;
}

/**
 * ADR-003 aplicado a lo que hay escrito en el formulario AHORA, no a lo
 * guardado. Es la diferencia entre avisar y estrellarse: si la doctora acaba de
 * teclear la fecha de nacimiento de un paciente migrado y resulta menor, el
 * bloque de acompañante tiene que aparecer en ese instante, antes de guardar.
 */
export function requiereAcompanante(datos: DatosPaciente, hoy: Date): boolean {
  return esMenorDeEdad(datos.fecha_nacimiento, hoy);
}

/**
 * Todas las reglas, en un solo sitio. Devuelve un error por campo; vacío
 * significa que la base va a aceptar la fila.
 *
 * Lo único que este objeto NO puede saber es si la cédula ya pertenece a otro
 * paciente: eso exige preguntarle a la base y lo resuelve `acciones.ts`.
 */
export function validarPaciente(
  datos: DatosPaciente,
  contexto: ContextoValidacion
): ErroresPaciente {
  const errores: ErroresPaciente = {};
  const valor = (campo: CampoPaciente) => datos[campo].trim();

  for (const campo of CAMPOS) {
    const largo = LARGO_MAXIMO[campo];
    if (largo && valor(campo).length > largo) {
      errores[campo] = `Máximo ${largo} caracteres.`;
    }
  }

  // --- Nombre completo ---
  if (!valor("nombre_completo")) {
    errores.nombre_completo = "El nombre completo es obligatorio.";
  } else if (valor("nombre_completo").length < 3) {
    errores.nombre_completo = "El nombre parece incompleto.";
  }

  // --- Documento de identidad (ADR-006 + ADR-008) ---
  //
  // El tipo se valida antes que el número porque decide CÓMO se valida el
  // número: una cédula pasa por el dígito verificador, un pasaporte no puede.
  if (!esTipoDocumento(valor("tipo_documento"))) {
    errores.tipo_documento = "Tipo de documento no reconocido.";
  }
  const tipoDocumento = tipoDe(valor("tipo_documento"));

  if (!valor("documento")) {
    if (esObligatorio("documento", contexto)) {
      errores.documento = contexto.guardado
        ? "Este paciente ya tiene documento registrado; no se puede dejar en blanco."
        : "El documento de identidad es obligatorio.";
    }
  } else {
    const resultado = validarDocumentoEditado(
      valor("documento"),
      tipoDocumento,
      contexto.guardado
        ? { tipo: contexto.guardado.tipo_documento, numero: contexto.guardado.documento }
        : null
    );
    if (!resultado.valido) errores.documento = resultado.mensaje;
  }

  // --- Fecha de nacimiento ---
  if (!valor("fecha_nacimiento")) {
    if (esObligatorio("fecha_nacimiento", contexto)) {
      errores.fecha_nacimiento = contexto.guardado
        ? "Este paciente ya tiene fecha de nacimiento; no se puede dejar en blanco."
        : "La fecha de nacimiento es obligatoria.";
    }
  } else {
    const fecha = parseFechaNacimiento(valor("fecha_nacimiento"));
    if (!fecha) {
      errores.fecha_nacimiento = "La fecha no es válida.";
    } else if (fecha.getTime() > contexto.hoy.getTime()) {
      errores.fecha_nacimiento = "La fecha de nacimiento no puede ser futura.";
    } else if (fecha.getFullYear() < ANIO_MINIMO) {
      errores.fecha_nacimiento = `Revisa el año: ${fecha.getFullYear()} no parece correcto.`;
    }
  }

  // --- Sexo (replica el CHECK pacientes_sexo_check) ---
  if (!valor("sexo")) {
    if (esObligatorio("sexo", contexto)) errores.sexo = "Selecciona el sexo del paciente.";
  } else if (!SEXOS.some((s) => s.valor === valor("sexo"))) {
    errores.sexo = "Valor de sexo no reconocido.";
  }

  // --- Estado civil ---
  if (valor("estado_civil") && !esEstadoCivilConocido(valor("estado_civil"))) {
    errores.estado_civil = "Estado civil no reconocido.";
  }

  // --- Contacto (opcional, pero si está tiene que servir) ---
  for (const campo of ["correo", "correo_acompanante"] as const) {
    if (valor(campo) && !correoConForma(valor(campo))) {
      errores[campo] = "El correo no parece válido.";
    }
  }
  for (const campo of ["telefono", "telefono_acompanante"] as const) {
    if (valor(campo) && !telefonoConForma(valor(campo))) {
      errores[campo] = "El teléfono no parece válido.";
    }
  }

  // --- Acompañante (ADR-003 + CHECK acompanante_obligatorio_si_menor) ---
  //
  // Esto es lo que impide que el CHECK llegue a dispararse. Ojo con el detalle
  // que lo haría inútil: el CHECK pide `is not null`, y una cadena VACÍA no es
  // NULL. Sin esta validación, un formulario enviado con los campos en blanco
  // pasaría el CHECK y guardaría un menor con acompañante "" — peor que el
  // error, porque no se nota.
  if (requiereAcompanante(datos, contexto.hoy)) {
    if (!valor("nombre_acompanante")) {
      errores.nombre_acompanante = "El paciente es menor de edad: el acompañante es obligatorio.";
    }
    if (!valor("documento_acompanante")) {
      errores.documento_acompanante =
        "El paciente es menor de edad: el documento del acompañante es obligatorio.";
    }
  }

  // El acompañante lleva su propio tipo, y no es simetría decorativa: el
  // acompañante de un menor extranjero es, casi siempre, también extranjero.
  // Validarlo siempre como cédula ecuatoriana dejaría sin registrar justo al
  // caso que motivó todo esto.
  //
  // Se comprueba SOLO si hay un documento que tipar. Sin documento el tipo no
  // describe nada —`aFilaPaciente` guardará el valor por defecto, que es lo que
  // exige el NOT NULL de la columna— y bloquear el guardado por él sería
  // bloquearlo por un campo que ni siquiera está en la pantalla.
  if (valor("documento_acompanante") && !esTipoDocumento(valor("tipo_documento_acompanante"))) {
    errores.tipo_documento_acompanante = "Tipo de documento no reconocido.";
  }

  if (valor("documento_acompanante") && !errores.documento_acompanante) {
    const resultado = validarDocumentoEditado(
      valor("documento_acompanante"),
      tipoDe(valor("tipo_documento_acompanante")),
      contexto.guardado
        ? {
            tipo: contexto.guardado.tipo_documento_acompanante,
            numero: contexto.guardado.documento_acompanante,
          }
        : null
    );
    if (!resultado.valido) errores.documento_acompanante = resultado.mensaje;
  }

  return errores;
}

/**
 * Las columnas que este formulario escribe: todas menos las tres que no le
 * pertenecen. `id` y `created_at` los pone la base con su DEFAULT, y
 * `alergia_actual` se alimenta desde la consulta (02-Gestion-Pacientes.md) —
 * incluirla aquí haría que guardar un cambio de teléfono borrara la alergia
 * del paciente, que es la etiqueta roja del listado.
 */
export type FilaPacienteEscribible = Omit<PacienteRow, "id" | "created_at" | "alergia_actual">;

/**
 * Lo tecleado convertido en lo que se le manda a Supabase.
 *
 * Dos normalizaciones que no son cosméticas:
 *
 *  - **Vacío → `null`, nunca `""`.** El CHECK de `sexo` acepta NULL pero
 *    rechaza la cadena vacía, y el de acompañante hace lo contrario: acepta
 *    `""` como si fuera un dato. Guardar `""` es a la vez un error 400 en un
 *    campo y un dato falso en el otro.
 *  - **La cédula se guarda solo con dígitos**, aunque se haya tecleado con
 *    guiones. Si no, el UNIQUE dejaría entrar "1712345678" y "171234567-8"
 *    como dos pacientes distintos, que es exactamente el duplicado que este
 *    formulario intenta evitar.
 */
export function aFilaPaciente(datos: DatosPaciente): FilaPacienteEscribible {
  const texto = (campo: CampoPaciente) => datos[campo].trim() || null;

  const tipoDocumento = tipoDe(datos.tipo_documento);
  const tipoAcompanante = tipoDe(datos.tipo_documento_acompanante);

  // La normalización depende del tipo: la cédula queda en dígitos, el
  // pasaporte en mayúsculas sin separadores. Ver `normalizarDocumento`.
  const numero = (campo: CampoPaciente, tipo: TipoDocumento) =>
    normalizarDocumento(datos[campo], tipo) || null;

  return {
    documento: numero("documento", tipoDocumento),
    tipo_documento: tipoDocumento,
    // El nombre se guarda en mayúsculas, que es como están los 164 migrados y
    // como sale impreso. Mezclarlos partiría el listado alfabético en dos
    // bloques y haría que el mismo apellido se viera distinto según cuándo se
    // registró.
    nombre_completo: datos.nombre_completo.trim().toUpperCase(),
    fecha_nacimiento: texto("fecha_nacimiento"),
    sexo: texto("sexo") as PacienteRow["sexo"],
    estado_civil: texto("estado_civil"),
    telefono: texto("telefono"),
    correo: texto("correo"),
    domicilio: texto("domicilio"),
    ocupacion: texto("ocupacion"),
    antecedentes_heredofamiliares: texto("antecedentes_heredofamiliares"),
    nombre_acompanante: datos.nombre_acompanante.trim().toUpperCase() || null,
    documento_acompanante: numero("documento_acompanante", tipoAcompanante),
    tipo_documento_acompanante: tipoAcompanante,
    correo_acompanante: texto("correo_acompanante"),
    telefono_acompanante: texto("telefono_acompanante"),
  };
}

/** La fila guardada de vuelta al formulario, para la pantalla de edición. */
export function aDatosFormulario(paciente: PacienteRow): DatosPaciente {
  const datos = { ...DATOS_VACIOS };
  for (const campo of CAMPOS) datos[campo] = paciente[campo] ?? "";
  return datos;
}

/** El documento guardado, en la forma que espera `validarDocumentoEditado`. */
export function documentoGuardado(paciente: PacienteRow) {
  return { tipo: paciente.tipo_documento, numero: paciente.documento };
}

/**
 * Lee un `FormData` sin confiar en que traiga todos los campos.
 *
 * **Un campo AUSENTE conserva su valor por defecto; uno presente y vacío se
 * lee como vacío.** La distinción parece pedante y no lo es: era un bug.
 *
 * El bloque de acompañante solo se dibuja si el paciente es menor o ya trae
 * acompañante, así que en un alta normal esos cinco campos no existen en el
 * formulario y no viajan en el POST. La versión anterior los machacaba a `""`
 * igualmente, y `tipo_documento_acompanante` —que es NOT NULL en la base y
 * tiene que ser uno de los tres valores del CHECK— llegaba vacío. La
 * validación lo rechazaba con razón… sobre un campo que no estaba en la
 * pantalla: el formulario se negaba a guardar sin marcar nada en rojo.
 *
 * Para los demás campos no cambia nada, porque su valor por defecto ya es la
 * cadena vacía. Y el vacío sigue significando "borrado" cuando el campo SÍ
 * viaja, que es lo que necesita la edición para limpiar un teléfono.
 */
export function leerFormulario(formData: FormData): DatosPaciente {
  const datos = { ...DATOS_VACIOS };
  for (const campo of CAMPOS) {
    if (!formData.has(campo)) continue;
    const valor = formData.get(campo);
    datos[campo] = typeof valor === "string" ? valor : "";
  }
  return datos;
}

/** `true` si no hay ni un error. */
export function sinErrores(errores: ErroresPaciente): boolean {
  return Object.keys(errores).length === 0;
}

// Se reexportan para que el formulario del navegador pueda dar el feedback en
// línea del documento sin importar dos módulos.
export { validarDocumento, validarDocumentoEditado };

/**
 * Lo que devuelve una Server Action de paciente al formulario.
 *
 * Vive aquí y no en `acciones.ts` por una restricción de React que no es
 * evidente hasta que rompe el build: un módulo marcado `"use server"` solo
 * puede exportar funciones asíncronas. Un tipo o una constante compartida
 * exportados desde ahí fallan al compilar, así que el contrato vive en este
 * módulo, que los dos lados ya importan.
 */
export interface EstadoPaciente {
  /** Error por campo. Vacío significa que no hubo nada que corregir. */
  errores: ErroresPaciente;
  /** Un error que no pertenece a ningún campo (la base no respondió, etc.). */
  mensaje: string | null;
  /**
   * El paciente que YA tiene esa cédula. Es la pieza que convierte el
   * `duplicate key value violates unique constraint "pacientes_documento_key"` en
   * algo accionable: quién es, con enlace a su ficha.
   */
  duplicado: { id: string; nombre_completo: string } | null;
  /** Lo tecleado, para que el formulario no se vacíe al volver con errores. */
  datos: DatosPaciente | null;
}

export const ESTADO_INICIAL: EstadoPaciente = {
  errores: {},
  mensaje: null,
  duplicado: null,
  datos: null,
};
