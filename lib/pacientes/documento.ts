/**
 * Validación del documento de identidad del paciente.
 *
 * Tres tipos, y cada uno se valida con lo que de verdad se puede comprobar de
 * él. La decisión completa está en `ADR-008-validacion-cedula.md`; aquí va el
 * resumen de por qué la estrictez es tan desigual entre uno y otro.
 *
 * ## `cedula` — se comprueba el dígito verificador
 *
 * Validar solo la forma (diez dígitos, provincia existente) atrapa "escribí
 * nueve dígitos" y poco más. **No atrapa cambiar un dígito ni intercambiar
 * dos**, que es lo que pasa al teclear con el paciente enfrente: esa cédula
 * equivocada tiene diez dígitos y una provincia válida, así que pasa.
 *
 * Y una cédula equivocada guardada no es un dato feo, es un **duplicado
 * futuro**: la próxima vez se busca por la cédula correcta, no aparece nadie, y
 * el paciente se registra otra vez. Esta base ya tiene 82 filas borradas por
 * llegar a ese final por otro camino.
 *
 * ## `pasaporte` y `otro` — no hay dígito verificador que valga
 *
 * Los formatos varían muchísimo por país y no existe un checksum común, así que
 * **cualquier regla de forma que se inventara aquí rechazaría documentos
 * legítimos** — y un documento legítimo rechazado devuelve a la doctora al
 * problema que esta versión resuelve: inventar un número para poder seguir.
 *
 * Se comprueba lo único comprobable: que quede algo, que quepa en un rango de
 * longitud amplio y que no traiga caracteres imposibles. Nada más.
 *
 * ## Qué protege entonces a los documentos que no se pueden verificar
 *
 * El valor de ADR-008 era evitar el duplicado que nace de un número mal
 * tecleado. Para un pasaporte esa protección se consigue por otras tres vías,
 * y las tres importan más que un formato inventado:
 *
 *  1. **Que la búsqueda lo encuentre.** Si el buscador solo supiera de cédulas,
 *     un pasaporte sería imposible de hallar por número y el duplicado estaría
 *     garantizado — no por un error de tecleo, sino siempre. Es la protección
 *     de verdad, y vive en `busqueda.ts`.
 *  2. **Normalizar antes de guardar.** `AB-123456`, `ab 123456` y `AB123456`
 *     son el mismo documento; sin `normalizarDocumento` serían tres pacientes.
 *  3. **Que el tipo se elija a mano.** El desplegable arranca en "Cédula", así
 *     que un pasaporte tecleado sin cambiar el tipo choca contra el dígito
 *     verificador y obliga a mirar. Un tipo por defecto estricto convierte el
 *     descuido en un error visible en vez de en un dato malo.
 *
 * ## Los datos migrados
 *
 * La estrictez es **del alta, no de la fila**. En la base hay al menos un
 * documento de 8 dígitos que entró con la importación del Sheet; al editar se
 * conserva tal cual mientras no se toque. Ver `validarDocumentoEditado`.
 */

/** Replica el CHECK `pacientes_tipo_documento_check` de la base. */
export type TipoDocumento = "cedula" | "pasaporte" | "otro";

export const TIPO_DOCUMENTO_POR_DEFECTO: TipoDocumento = "cedula";

export function esTipoDocumento(valor: string): valor is TipoDocumento {
  return valor === "cedula" || valor === "pasaporte" || valor === "otro";
}

/** Longitud de la cédula ecuatoriana. Ni una más, ni una menos. */
export const LARGO_CEDULA = 10;

/**
 * Rango de longitud para pasaportes y otros documentos.
 *
 * Deliberadamente ancho. Un pasaporte suele tener entre 6 y 9 caracteres, pero
 * las cédulas extranjeras y los documentos de refugiado se salen de ahí por los
 * dos lados. El único objetivo de estos topes es frenar el campo en blanco y el
 * pegado accidental de un párrafo — no describir ningún formato real.
 */
const LARGO_MINIMO_OTROS = 4;
const LARGO_MAXIMO_OTROS = 20;

/**
 * Códigos de provincia válidos: 01-24 son las provincias del país y **30**
 * identifica a los ecuatorianos cedulados en el exterior (consulados). Omitir
 * el 30 rechazaría cédulas reales, que es peor que aceptar una falsa.
 */
function provinciaValida(codigo: number): boolean {
  return (codigo >= 1 && codigo <= 24) || codigo === 30;
}

export type MotivoDocumentoInvalido =
  | "vacio"
  | "no_numerica"
  | "largo"
  | "provincia"
  | "tercer_digito"
  | "verificador"
  | "corto_otros"
  | "largo_otros"
  | "caracteres";

export type ResultadoDocumento =
  | { valido: true; documento: string }
  | { valido: false; motivo: MotivoDocumentoInvalido; mensaje: string };

/**
 * Los mensajes viven aquí y no en el componente porque los usan los dos lados:
 * el formulario en el navegador (feedback en línea, mientras se teclea) y la
 * Server Action al revalidar. Un solo texto, imposible que se desincronicen.
 *
 * Están escritos para la doctora, no para un programador: dicen qué revisar.
 */
const MENSAJES: Record<MotivoDocumentoInvalido, string> = {
  vacio: "El documento es obligatorio.",
  no_numerica: "La cédula ecuatoriana solo lleva números.",
  largo: `La cédula ecuatoriana tiene ${LARGO_CEDULA} dígitos.`,
  provincia: "Los dos primeros dígitos no corresponden a ninguna provincia.",
  tercer_digito: "El tercer dígito no corresponde a una cédula de persona natural.",
  verificador: "La cédula no es válida — revisa si hay un dígito cambiado.",
  corto_otros: `El número parece incompleto (mínimo ${LARGO_MINIMO_OTROS} caracteres).`,
  largo_otros: `El número es demasiado largo (máximo ${LARGO_MAXIMO_OTROS} caracteres).`,
  caracteres: "El documento solo puede llevar letras y números.",
};

/**
 * Cómo se guarda el número, según su tipo.
 *
 * La cédula queda en dígitos puros: si no, el UNIQUE dejaría entrar
 * `1712345678` y `171234567-8` como dos pacientes distintos.
 *
 * El pasaporte se pasa a MAYÚSCULAS y se le quitan espacios y guiones, por la
 * misma razón y con más motivo: en un pasaporte los separadores son puramente
 * de lectura y la caja de la letra no significa nada, así que `ab-123456` y
 * `AB123456` tienen que colapsar en un solo valor. Es la única defensa
 * automática que tiene un documento sin dígito verificador.
 */
export function normalizarDocumento(texto: string, tipo: TipoDocumento): string {
  return tipo === "cedula"
    ? texto.replace(/\D/g, "")
    : texto.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Módulo 10 del Registro Civil ecuatoriano.
 *
 * Los 9 primeros dígitos se multiplican alternando 2 y 1. Todo producto de dos
 * cifras se reduce restándole 9 (equivale a sumar sus dígitos). El verificador
 * es lo que falta para la siguiente decena, y 10 se escribe 0.
 */
export function digitoVerificador(nueveDigitos: string): number {
  let suma = 0;
  for (let i = 0; i < 9; i += 1) {
    const producto = Number(nueveDigitos[i]) * (i % 2 === 0 ? 2 : 1);
    suma += producto > 9 ? producto - 9 : producto;
  }
  return (10 - (suma % 10)) % 10;
}

function validarCedulaEcuatoriana(texto: string): ResultadoDocumento {
  const cedula = normalizarDocumento(texto, "cedula");

  // Se distingue de "largo" para poder decir algo útil: quien escribió letras
  // no tiene un problema de cuántos dígitos puso. Se toleran espacios y
  // guiones porque son separadores de lectura, no caracteres del dato.
  if (!/^[\d\s-]+$/.test(texto)) {
    return { valido: false, motivo: "no_numerica", mensaje: MENSAJES.no_numerica };
  }

  if (cedula.length !== LARGO_CEDULA) {
    return { valido: false, motivo: "largo", mensaje: MENSAJES.largo };
  }

  if (!provinciaValida(Number(cedula.slice(0, 2)))) {
    return { valido: false, motivo: "provincia", mensaje: MENSAJES.provincia };
  }

  // El tercer dígito codifica el tipo de persona: 0-5 personas naturales, 6
  // sociedades públicas, 9 sociedades privadas. Un RUC de empresa NO es la
  // cédula de un paciente, y sin esta comprobación entraría sin ruido.
  if (Number(cedula[2]) >= 6) {
    return { valido: false, motivo: "tercer_digito", mensaje: MENSAJES.tercer_digito };
  }

  if (Number(cedula[9]) !== digitoVerificador(cedula)) {
    return { valido: false, motivo: "verificador", mensaje: MENSAJES.verificador };
  }

  return { valido: true, documento: cedula };
}

/**
 * Pasaporte y "otro". Lo único que se comprueba es lo comprobable.
 *
 * En particular NO se exige que traiga algún dígito, aunque casi todos los
 * pasaportes lo traen: "casi todos" no es "todos", y el precio de equivocarse
 * es rechazar el documento de una persona real que está en la consulta.
 */
function validarDocumentoLibre(texto: string): ResultadoDocumento {
  const documento = normalizarDocumento(texto, "pasaporte");

  // Se mira el texto crudo, no el normalizado: si se colaron caracteres que no
  // son letras, dígitos ni separadores de lectura, hay que decirlo en vez de
  // borrarlos en silencio y guardar algo distinto de lo que se tecleó.
  if (!/^[A-Za-z0-9\s.-]+$/.test(texto)) {
    return { valido: false, motivo: "caracteres", mensaje: MENSAJES.caracteres };
  }

  if (documento.length < LARGO_MINIMO_OTROS) {
    return { valido: false, motivo: "corto_otros", mensaje: MENSAJES.corto_otros };
  }

  if (documento.length > LARGO_MAXIMO_OTROS) {
    return { valido: false, motivo: "largo_otros", mensaje: MENSAJES.largo_otros };
  }

  return { valido: true, documento };
}

/**
 * Valida un documento que se está dando de alta. Estricta con la cédula a
 * propósito: ADR-006 relajó la BASE por la migración, nunca el formulario.
 */
export function validarDocumento(texto: string, tipo: TipoDocumento): ResultadoDocumento {
  if (!texto.trim()) return { valido: false, motivo: "vacio", mensaje: MENSAJES.vacio };

  return tipo === "cedula" ? validarCedulaEcuatoriana(texto) : validarDocumentoLibre(texto);
}

/** Lo que ya está guardado en la base para este documento. */
export interface DocumentoGuardado {
  tipo: TipoDocumento;
  numero: string | null;
}

/**
 * Igual que `validarDocumento`, pero para la pantalla de EDICIÓN.
 *
 * La diferencia es una sola y es la que hace utilizable la limpieza de la deuda
 * de datos: si el tipo Y el número son idénticos a los guardados, se acepta sin
 * examinarlos. Los pacientes migrados traen documentos que no pasan el módulo
 * 10 —hay al menos uno de 8 dígitos—, y una pantalla que se negara a guardar
 * mientras ese campo esté como está impediría completar el sexo o la fecha de
 * nacimiento de ese paciente para siempre.
 *
 * **El tipo cuenta tanto como el número.** Cambiar el tipo de `cedula` a `otro`
 * sin tocar el número es precisamente cómo se arregla ese documento de 8
 * dígitos: deja de fingir ser una cédula ecuatoriana. Si la excepción mirara
 * solo el número, ese cambio pasaría sin validarse y no habría forma de saber
 * si el nuevo tipo le queda bien al valor.
 *
 * Con `numero` en `null` —los 83 sin documento— no hay nada que preservar, así
 * que se valida estricto como en el alta.
 */
export function validarDocumentoEditado(
  texto: string,
  tipo: TipoDocumento,
  guardado: DocumentoGuardado | null
): ResultadoDocumento {
  if (guardado?.numero && guardado.tipo === tipo && texto.trim() === guardado.numero) {
    return { valido: true, documento: guardado.numero };
  }

  return validarDocumento(texto, tipo);
}

/**
 * Formato de lectura: `1712345678` → `171234567-8`.
 *
 * Solo se aplica a la cédula ecuatoriana, y solo separa el verificador, que es
 * como se lee en voz alta al confirmarlo con el paciente. Un pasaporte se
 * devuelve intacto: no tiene una partición convencional y partirlo por nuestra
 * cuenta haría que el número impreso no coincida con el del documento.
 */
export function formatearDocumento(documento: string, tipo: TipoDocumento): string {
  if (tipo !== "cedula" || documento.length !== LARGO_CEDULA) return documento;
  return `${documento.slice(0, 9)}-${documento[9]}`;
}
