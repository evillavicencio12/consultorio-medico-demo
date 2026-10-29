// Prueba de humo del formulario de paciente (Fase 2, sesión B).
//
// Todo lo de aquí es lógica pura y corre sin red ni base de datos: las reglas
// de `lib/pacientes/formulario.ts`, la validación de cédula y el cálculo de la
// mayoría de edad.
//
// Lo que estas comprobaciones cuidan, y por qué existen: cada una de ellas es
// una fila que la BASE habría rechazado con un mensaje que la doctora no puede
// usar. El CHECK `acompanante_obligatorio_si_menor`, el CHECK de `sexo` y el
// UNIQUE de `cedula` son correctos; lo que no sirve es su texto. Si alguna de
// estas pruebas falla, el error crudo de Postgres vuelve a la pantalla.
//
//   npm run test:formulario
import {
  LARGO_CEDULA,
  formatearDocumento,
  normalizarDocumento,
  validarDocumento,
  validarDocumentoEditado,
} from "../lib/pacientes/documento";
import {
  aFilaPaciente,
  comoValorDeInput,
  esObligatorio,
  leerFormulario,
  requiereAcompanante,
  validarPaciente,
  DATOS_VACIOS,
  type DatosPaciente,
} from "../lib/pacientes/formulario";
import { camposPendientes, listarPendientes } from "../lib/pacientes/campos";
import { calcularEdad, esMenorDeEdad, parseFechaNacimiento } from "../lib/edad";
import type { PacienteRow } from "../lib/supabase/tipos";
import { comprobar } from "./ayudas";



/** El motivo del rechazo, o `null` si el documento pasó. */
function motivoDe(texto: string, tipo: "cedula" | "pasaporte" | "otro" = "cedula"): string | null {
  const resultado = validarDocumento(texto, tipo);
  return resultado.valido ? null : resultado.motivo;
}

const valida = (texto: string, tipo: "cedula" | "pasaporte" | "otro" = "cedula") =>
  validarDocumento(texto, tipo).valido;

/** Fecha fija para todo el archivo: las pruebas no pueden depender de "hoy". */
const HOY = new Date(2026, 7, 21); // 21 de agosto de 2026

const datos = (parcial: Partial<DatosPaciente> = {}): DatosPaciente => ({
  ...DATOS_VACIOS,
  ...parcial,
});

/** Fila mínima para simular la edición de un paciente ya guardado. */
const filaGuardada = (parcial: Partial<PacienteRow> = {}): PacienteRow => ({
  id: "00000000-0000-4000-8000-000000000000",
  documento: null,
  tipo_documento: "cedula",
  nombre_completo: "PACIENTE DE PRUEBA",
  fecha_nacimiento: null,
  sexo: null,
  telefono: null,
  correo: null,
  domicilio: null,
  ocupacion: null,
  antecedentes_heredofamiliares: null,
  alergia_actual: null,
  nombre_acompanante: null,
  documento_acompanante: null,
  tipo_documento_acompanante: "cedula",
  correo_acompanante: null,
  telefono_acompanante: null,
  created_at: "2026-08-18T00:00:00Z",
  estado_civil: null,
  ...parcial,
});

// ---------------------------------------------------------------------------
// 1. Cédula ecuatoriana
// ---------------------------------------------------------------------------

// Cédulas con dígito verificador correcto, calculado con el mismo módulo 10
// del Registro Civil. Ninguna corresponde a una persona real: son números
// construidos para la prueba (el repositorio no lleva datos de pacientes).
const VALIDA_GUAYAS = "0912345675";
const VALIDA_PICHINCHA = "1722222229";

comprobar("una cédula bien formada pasa", valida(VALIDA_GUAYAS), true);
comprobar("otra provincia también", valida(VALIDA_PICHINCHA), true);

comprobar(
  "un dígito cambiado NO pasa — el error de tecleo que crea duplicados",
  valida("0912345676"),
  false
);
comprobar(
  "dos dígitos intercambiados tampoco",
  valida("0912345657"),
  false
);
comprobar(
  "el motivo del dígito cambiado es el verificador, no el formato",
  motivoDe("0912345676"),
  "verificador"
);
comprobar(
  `menos de ${LARGO_CEDULA} dígitos`,
  motivoDe("091234567"),
  "largo"
);
comprobar(
  "provincia 99 no existe",
  motivoDe("9912345675"),
  "provincia"
);
// El 30 identifica a los ecuatorianos cedulados en el exterior. Si el rango
// se hubiera cerrado en 24, sus cédulas —que son reales— se rechazarían.
comprobar("provincia 30 (cedulados en el exterior) SÍ existe", valida("3012345678"), true);
comprobar(
  "tercer dígito 9 es un RUC de sociedad, no un paciente",
  motivoDe("0992345675"),
  "tercer_digito"
);
comprobar(
  "con letras se dice que solo lleva números",
  motivoDe("09123456AB"),
  "no_numerica"
);
comprobar("se aceptan guiones de lectura", valida("091234567-5"), true);
comprobar("y se guarda sin ellos", validarDocumento("091234567-5", "cedula"), {
  valido: true,
  documento: VALIDA_GUAYAS,
});

// --- El caso de los datos migrados (ADR-006) ---
// En la base real hay un documento de 8 dígitos que entró con la importación
// del Sheet. La edición NO puede rechazarlo, o ese paciente queda congelado
// para siempre: no se le podría completar el sexo ni la fecha de nacimiento.
//
// El número de abajo está FABRICADO, no es el real: un documento identifica a
// un paciente y CLAUDE.md prohíbe que eso entre al repositorio. Lo único que
// tiene que compartir con el de verdad es la forma — 8 dígitos, o sea algo que
// no puede ser una cédula ecuatoriana.
const CEDULA_MIGRADA_CORTA = "10203040";

comprobar(
  "la cédula migrada de 8 dígitos NO pasaría como cédula nueva",
  valida(CEDULA_MIGRADA_CORTA),
  false
);
const GUARDADA_CORTA = { tipo: "cedula" as const, numero: CEDULA_MIGRADA_CORTA };

comprobar(
  "pero al editar, sin tocarla, se conserva",
  validarDocumentoEditado(CEDULA_MIGRADA_CORTA, "cedula", GUARDADA_CORTA).valido,
  true
);
comprobar(
  "si se cambia por otra inválida, sí se rechaza",
  validarDocumentoEditado("10203041", "cedula", GUARDADA_CORTA).valido,
  false
);
comprobar(
  "y una cédula nueva en un paciente sin documento se valida estricto",
  validarDocumentoEditado("0912345676", "cedula", { tipo: "cedula", numero: null }).valido,
  false
);
// La salida real para ese documento raro: dejar de fingir que es una cédula.
comprobar(
  "cambiar el TIPO a 'otro' sin tocar el número lo hace válido de verdad",
  validarDocumentoEditado(CEDULA_MIGRADA_CORTA, "otro", GUARDADA_CORTA).valido,
  true
);
comprobar(
  "y ese cambio de tipo SÍ se valida: un número imposible como 'otro' se rechaza",
  validarDocumentoEditado("@@", "otro", GUARDADA_CORTA).valido,
  false
);

comprobar("formato de lectura", formatearDocumento(VALIDA_GUAYAS, "cedula"), "091234567-5");
comprobar(
  "lo que no mide 10 no se maquilla",
  formatearDocumento(CEDULA_MIGRADA_CORTA, "cedula"),
  CEDULA_MIGRADA_CORTA
);
comprobar(
  "un pasaporte no se parte: el número impreso debe coincidir con el documento",
  formatearDocumento("AB1234567", "pasaporte"),
  "AB1234567"
);

// ---------------------------------------------------------------------------
// 1b. Pasaporte y otros documentos (ADR-008)
// ---------------------------------------------------------------------------

comprobar("un pasaporte alfanumérico pasa", valida("AB123456", "pasaporte"), true);
comprobar("uno solo de letras también: no todos llevan dígitos", valida("ABCDEF", "pasaporte"), true);
comprobar("uno solo de dígitos también", valida("123456789", "pasaporte"), true);
comprobar("una cédula colombiana de 8 dígitos, como 'otro'", valida("10203040", "otro"), true);

// Lo importante de este bloque: NO se inventan reglas de formato. Un pasaporte
// legítimo rechazado devuelve a la doctora a inventar un número.
comprobar(
  "el mismo número que fallaría como cédula pasa como pasaporte",
  valida("0912345676", "cedula") === false && valida("0912345676", "pasaporte"),
  true
);

comprobar("lo único que se rechaza: vacío", valida("", "pasaporte"), false);
comprobar("demasiado corto", motivoDe("AB1", "pasaporte"), "corto_otros");
comprobar("demasiado largo", motivoDe("A".repeat(21), "pasaporte"), "largo_otros");
comprobar("caracteres imposibles en un documento", motivoDe("AB#123", "pasaporte"), "caracteres");

// La normalización es la única defensa automática que le queda a un documento
// sin dígito verificador: sin ella, tres formas de escribirlo serían tres
// pacientes distintos.
comprobar("el pasaporte se guarda en mayúsculas y sin separadores", [
  normalizarDocumento("ab-123456", "pasaporte"),
  normalizarDocumento("AB 123 456", "pasaporte"),
  normalizarDocumento("AB123456", "pasaporte"),
], ["AB123456", "AB123456", "AB123456"]);
comprobar("la cédula sigue quedando en dígitos puros", normalizarDocumento("1712-345 678", "cedula"), "1712345678");

// ---------------------------------------------------------------------------
// 2. Fecha de nacimiento y mayoría de edad
// ---------------------------------------------------------------------------

// El bug que motivó el arreglo de `parseFechaNacimiento`: `new Date("2008-08-22")`
// es medianoche UTC, y leída en hora local (Ecuador, UTC-5) cae el día 21. El
// paciente salía un día más viejo, el formulario no pedía acompañante y la fila
// se estrellaba contra el CHECK de la base.
comprobar(
  "una fecha ISO se lee como fecha local, sin correrse un día",
  comoValorDeInput(parseFechaNacimiento("2008-08-22") as Date),
  "2008-08-22"
);
comprobar("una fecha imposible se rechaza", parseFechaNacimiento("2026-02-31"), null);
comprobar("sin fecha no se inventa edad", parseFechaNacimiento(""), null);

comprobar(
  "cumple 18 mañana: sigue siendo menor",
  esMenorDeEdad("2008-08-22", HOY),
  true
);
comprobar("cumple 18 hoy: ya es mayor", esMenorDeEdad("2008-08-21", HOY), false);
comprobar("sin fecha de nacimiento no se puede saber (ADR-006)", esMenorDeEdad(null, HOY), false);
comprobar(
  "menor de 1 año se cuenta en meses",
  calcularEdad(parseFechaNacimiento("2026-05-21") as Date, HOY).totalMeses,
  3
);

// ---------------------------------------------------------------------------
// 3. Alta: los tres campos que ADR-006 relajó en la base pero no aquí
// ---------------------------------------------------------------------------

const erroresAltaVacia = validarPaciente(datos(), { guardado: null, hoy: HOY });
comprobar(
  "el alta exige documento, nombre, fecha de nacimiento y sexo",
  Object.keys(erroresAltaVacia).sort(),
  ["documento", "fecha_nacimiento", "nombre_completo", "sexo"]
);

const altaBuena = datos({
  documento: VALIDA_GUAYAS,
  nombre_completo: "PACIENTE FICTICIO JUAN CARLOS",
  fecha_nacimiento: "1990-04-12",
  sexo: "M",
  estado_civil: "Casado/a",
});
comprobar("un alta completa no tiene errores", validarPaciente(altaBuena, { guardado: null, hoy: HOY }), {});

comprobar(
  "un sexo fuera del CHECK de la base se rechaza aquí",
  validarPaciente({ ...altaBuena, sexo: "X" }, { guardado: null, hoy: HOY }).sexo !== undefined,
  true
);
comprobar(
  "una fecha futura se rechaza",
  validarPaciente({ ...altaBuena, fecha_nacimiento: "2027-01-01" }, { guardado: null, hoy: HOY })
    .fecha_nacimiento !== undefined,
  true
);
comprobar(
  "el año 0214 del Sheet no volvería a entrar",
  validarPaciente({ ...altaBuena, fecha_nacimiento: "0214-06-08" }, { guardado: null, hoy: HOY })
    .fecha_nacimiento !== undefined,
  true
);
comprobar(
  "un estado civil fuera de la lista se rechaza",
  validarPaciente({ ...altaBuena, estado_civil: "Comprometido" }, { guardado: null, hoy: HOY })
    .estado_civil !== undefined,
  true
);

// ---------------------------------------------------------------------------
// 4. Acompañante — la regla que la base impone con un CHECK
// ---------------------------------------------------------------------------

const menorSinAcompanante = datos({
  documento: VALIDA_GUAYAS,
  nombre_completo: "PACIENTE FICTICIO ANA",
  fecha_nacimiento: "2015-03-01",
  sexo: "F",
});

comprobar("el formulario detecta al menor", requiereAcompanante(menorSinAcompanante, HOY), true);

const erroresMenor = validarPaciente(menorSinAcompanante, { guardado: null, hoy: HOY });
comprobar("y exige nombre y cédula del acompañante", Object.keys(erroresMenor).sort(), [
  "documento_acompanante",
  "nombre_acompanante",
]);

// El detalle que haría inútil todo esto: el CHECK de la base pide `is not
// null`, y la cadena vacía NO es null. Sin esta validación, un envío con los
// campos en blanco pasaría el CHECK y guardaría un menor con acompañante "".
comprobar(
  "los espacios en blanco no cuentan como acompañante",
  Object.keys(
    validarPaciente(
      { ...menorSinAcompanante, nombre_acompanante: "   ", documento_acompanante: "  " },
      { guardado: null, hoy: HOY }
    )
  ).sort(),
  ["documento_acompanante", "nombre_acompanante"]
);

comprobar(
  "con acompañante completo, el menor pasa",
  validarPaciente(
    {
      ...menorSinAcompanante,
      nombre_acompanante: "EJEMPLO DEMO TUTORA",
      documento_acompanante: VALIDA_PICHINCHA,
    },
    { guardado: null, hoy: HOY }
  ),
  {}
);

comprobar(
  "el documento del acompañante también se valida",
  validarPaciente(
    {
      ...menorSinAcompanante,
      nombre_acompanante: "EJEMPLO DEMO TUTORA",
      documento_acompanante: "1722222220",
    },
    { guardado: null, hoy: HOY }
  ).documento_acompanante !== undefined,
  true
);

// ---------------------------------------------------------------------------
// 5. Edición — cerrar la deuda de la migración sin bloquearse
// ---------------------------------------------------------------------------

const migrado = filaGuardada();
const contextoMigrado = { guardado: migrado, hoy: HOY };

comprobar(
  "en el alta, documento obligatorio",
  esObligatorio("documento", { guardado: null, hoy: HOY }),
  true
);
comprobar(
  "en un migrado sin documento, NO obligatorio: si no, no se podría guardar el sexo",
  esObligatorio("documento", contextoMigrado),
  false
);
comprobar(
  "en un migrado CON documento, sí obligatorio: borrarlo sería perder el dato",
  esObligatorio("documento", { guardado: filaGuardada({ documento: VALIDA_GUAYAS }), hoy: HOY }),
  true
);

comprobar(
  "se puede guardar solo el sexo de un migrado, dejando el resto vacío",
  validarPaciente(
    datos({ nombre_completo: migrado.nombre_completo, sexo: "F" }),
    contextoMigrado
  ),
  {}
);

comprobar(
  "borrar un documento que ya estaba se rechaza",
  validarPaciente(
    datos({ nombre_completo: migrado.nombre_completo, documento: "" }),
    { guardado: filaGuardada({ documento: VALIDA_GUAYAS }), hoy: HOY }
  ).documento !== undefined,
  true
);

// El caso delicado del enunciado: al completar la fecha de nacimiento de un
// paciente migrado resulta que es menor, y el CHECK de la base va a exigir
// acompañante. Tiene que salir como error de FORMULARIO, no de Postgres.
const completandoFecha = validarPaciente(
  datos({ nombre_completo: migrado.nombre_completo, fecha_nacimiento: "2012-06-30" }),
  contextoMigrado
);
comprobar(
  "completar la fecha y descubrir que es menor pide el acompañante, no revienta",
  Object.keys(completandoFecha).sort(),
  ["documento_acompanante", "nombre_acompanante"]
);

// ---------------------------------------------------------------------------
// 6. Qué se le manda a la base
// ---------------------------------------------------------------------------

// El bloque de acompañante solo se dibuja si el paciente es menor o ya trae
// acompañante. En un alta normal esos cinco campos NO EXISTEN en el formulario
// y no viajan en el POST — cosa que ningún test que construya `DatosPaciente` a
// mano puede notar, porque ahí siempre están todos.
//
// Bug real (21 de agosto de 2026): `leerFormulario` los machacaba a "" igual,
// así que `tipo_documento_acompanante` llegaba vacío, la validación lo
// rechazaba con razón, y el formulario se negaba a guardar señalando un campo
// que no estaba en la pantalla. La doctora veía "Revisa los campos marcados en
// rojo" sin nada en rojo.
const envioDeAdulto = new FormData();
envioDeAdulto.set("tipo_documento", "cedula");
envioDeAdulto.set("documento", VALIDA_GUAYAS);
envioDeAdulto.set("nombre_completo", "PACIENTE FICTICIO JUAN CARLOS");
envioDeAdulto.set("fecha_nacimiento", "1990-04-12");
envioDeAdulto.set("sexo", "M");
envioDeAdulto.set("estado_civil", "Soltero/a");
envioDeAdulto.set("telefono", "0991234567");
envioDeAdulto.set("correo", "alguien@ejemplo.com");
envioDeAdulto.set("domicilio", "CIUDAD EJEMPLO");
envioDeAdulto.set("ocupacion", "ESTUDIANTE");
envioDeAdulto.set("antecedentes_heredofamiliares", "");

const leidos = leerFormulario(envioDeAdulto);
comprobar(
  "un campo ausente conserva su valor por defecto, no se lee como vacío",
  leidos.tipo_documento_acompanante,
  "cedula"
);
comprobar(
  "y el alta de un adulto NO se bloquea por el acompañante que no existe",
  validarPaciente(leidos, { guardado: null, hoy: HOY }),
  {}
);

// Lo contrario tiene que seguir funcionando: un campo que SÍ viaja vacío
// significa "borrado", que es como la edición limpia un teléfono.
const envioQueBorra = new FormData();
envioQueBorra.set("nombre_completo", "PACIENTE FICTICIO JUAN CARLOS");
envioQueBorra.set("telefono", "");
comprobar(
  "un campo presente y vacío sigue significando borrado",
  leerFormulario(envioQueBorra).telefono,
  ""
);

// Y el tipo del acompañante sigue validándose cuando SÍ hay documento que tipar.
comprobar(
  "con documento de acompañante, un tipo inventado sí se rechaza",
  validarPaciente(
    datos({
      documento: VALIDA_GUAYAS,
      nombre_completo: "PACIENTE FICTICIO ANA",
      fecha_nacimiento: "2015-03-01",
      sexo: "F",
      nombre_acompanante: "EJEMPLO DEMO TUTORA",
      documento_acompanante: VALIDA_PICHINCHA,
      tipo_documento_acompanante: "licencia",
    }),
    { guardado: null, hoy: HOY }
  ).tipo_documento_acompanante !== undefined,
  true
);

// ---------------------------------------------------------------------------

const fila = aFilaPaciente(
  datos({
    documento: "091234567-5",
    nombre_completo: "  fictício démo juan  ",
    fecha_nacimiento: "1990-04-12",
    sexo: "M",
    telefono: "",
  })
);

comprobar("la cédula viaja solo con dígitos", fila.documento, VALIDA_GUAYAS);
comprobar("el nombre se guarda en mayúsculas, como los 164 migrados", fila.nombre_completo, "FICTÍCIO DÉMO JUAN");
// La cadena vacía es el peor valor posible: el CHECK de `sexo` la rechaza y el
// de acompañante la acepta como si fuera un dato real.
comprobar("un campo vacío se guarda como NULL, nunca como cadena vacía", fila.telefono, null);
comprobar("y el acompañante ausente también", fila.nombre_acompanante, null);
comprobar(
  "`alergia_actual` no está en la fila: la alimenta la consulta, no este formulario",
  "alergia_actual" in fila,
  false
);

// ---------------------------------------------------------------------------
// 7. Qué le falta a la ficha
// ---------------------------------------------------------------------------

comprobar("un migrado del Sheet: le faltan los tres", camposPendientes(migrado), [
  "documento",
  "fecha_nacimiento",
  "sexo",
]);
comprobar(
  "y se dice en castellano",
  listarPendientes(camposPendientes(migrado)),
  "el documento de identidad, la fecha de nacimiento y el sexo"
);
comprobar(
  "un paciente completo no tiene pendientes",
  camposPendientes({ documento: VALIDA_GUAYAS, fecha_nacimiento: "1990-04-12", sexo: "M" }),
  []
);

