// Prueba de humo del formulario de consulta y del buscador CIE-10 (Fase 4,
// sesión A).
//
// Todo lo de aquí es lógica pura: corre sin red, sin base de datos y sin
// navegador. Lo único "pesado" es la fuente Helvetica de pdf-lib, que se
// incrusta en memoria (sin tocar `/templates`) para medir de verdad si un texto
// cabe en la hoja, que es lo que exige ADR-007.
//
// Qué cuida cada bloque:
//   - Los límites de ADR-007, para que el aviso salga ANTES de guardar y no al
//     ver el PDF, que es el fallo que el ADR describe.
//   - La coma decimal: "36,5" es como se escribe una temperatura aquí, y
//     `numeric` de Postgres la rechaza.
//   - El bug de huso horario, por tercera vez: ya mordió en la edad y en la
//     fecha impresa de la receta. Aquí entra por `consultas.fecha`.
//   - Que el catálogo CIE-10 se pueda encontrar tal como la doctora escribe:
//     con punto en el código, y con la eñe que el stemmer español no perdona.
//
//   npm run test:consulta
import { PDFDocument, StandardFonts } from "pdf-lib";
import {
  aConsultaPdf,
  aNumero,
  avisosConsulta,
  contadorImpresionDiagnostica,
  contadorTratamiento,
  datosIniciales,
  sinErrores,
  validarConsulta,
  DATOS_VACIOS,
  type DatosConsulta,
} from "../lib/consultas/formulario";
import {
  normalizarCodigoCie10,
  ordenarSugerencias,
  tipoDeBusquedaCie10,
} from "../lib/consultas/cie10";
import { construirTsquery } from "../lib/busqueda-texto";
import { calcularEdad, edadDe, parseFechaNacimiento } from "../lib/edad";
import {
  IMPRESION_DIAGNOSTICA_MAX_CHARS,
  TRATAMIENTO_MAX_CHARS,
} from "../lib/pdf/historial-limits";
import type { Cie10CatalogoRow, ConsultaRow, PacienteRow } from "../lib/supabase/tipos";
import { cierto, comprobar } from "./ayudas";




/** La MISMA fuente que incrusta `generateHistorialPdf`. Ver lib/pdf/medicion.ts. */
const font = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica);

/** Fecha fija: ninguna prueba puede depender de "hoy". */
const HOY = new Date(2026, 7, 22); // 22 de agosto de 2026
const HOY_ISO = "2026-08-22";

const datos = (parcial: Partial<DatosConsulta> = {}): DatosConsulta => ({
  ...DATOS_VACIOS,
  fecha: HOY_ISO,
  motivo_consulta: "Odinofagia de dos días.",
  impresion_diagnostica: "Faringoamigdalitis aguda",
  ...parcial,
});

const contexto = { hoy: HOY, font };

const consultaGuardada = (parcial: Partial<ConsultaRow> = {}): ConsultaRow => ({
  id: "c1",
  paciente_id: "p1",
  fecha: "2026-06-08",
  motivo_consulta: "Control",
  alergias: "Penicilina",
  patologias: "Hipertensión arterial",
  quirurgicos: "Colecistectomía 2019",
  transfusionales: "Niega",
  pa: null,
  fc: null,
  fr: null,
  temperatura: null,
  peso: null,
  impresion_diagnostica: null,
  cie10_codigo: null,
  tratamiento: null,
  signos_alarma: null,
  recomendaciones_no_farmacologicas: null,
  numero_receta: 3,
  created_at: "2026-06-08T10:00:00Z",
  ...parcial,
});

// ---------------------------------------------------------------------------
console.log("--- Campos obligatorios ---");
// ---------------------------------------------------------------------------

cierto(
  "una consulta con fecha, motivo e impresión diagnóstica valida",
  sinErrores(validarConsulta(datos(), contexto))
);
cierto(
  "sin motivo, no",
  Boolean(validarConsulta(datos({ motivo_consulta: "  " }), contexto).motivo_consulta)
);
cierto(
  "sin impresión diagnóstica, tampoco",
  Boolean(validarConsulta(datos({ impresion_diagnostica: "" }), contexto).impresion_diagnostica)
);
cierto(
  "el tratamiento SÍ es opcional: un control puede no llevarlo",
  sinErrores(validarConsulta(datos({ tratamiento: "" }), contexto))
);
cierto(
  "y el código CIE-10 también (RF-11 pide poder buscarlo, no exigirlo)",
  sinErrores(validarConsulta(datos({ cie10_codigo: "" }), contexto))
);

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------

cierto(
  "no se acepta una consulta con fecha futura",
  Boolean(validarConsulta(datos({ fecha: "2026-08-23" }), contexto).fecha)
);
cierto("hoy sí", !validarConsulta(datos({ fecha: HOY_ISO }), contexto).fecha);
cierto(
  "una consulta anterior al nacimiento del paciente se rechaza",
  Boolean(
    validarConsulta(datos({ fecha: "1989-01-01" }), {
      ...contexto,
      fechaNacimiento: "1990-04-12",
    }).fecha
  )
);
cierto(
  "una fecha inexistente (31 de febrero) se rechaza en vez de rodar a marzo",
  Boolean(validarConsulta(datos({ fecha: "2026-02-31" }), contexto).fecha)
);

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// El bug: `new Date("2026-08-22")` es medianoche UTC, y en Ecuador (UTC-5) eso
// es el 21 a las 19:00. Un paciente que cumple años el día de la consulta salía
// con un año MENOS impreso en su historial. Ya se corrigió dos veces —en la
// edad y en las fechas del PDF—; `calcularEdad` recibía la referencia como
// cadena y se había quedado fuera.

const cumpleHoy = parseFechaNacimiento("1990-08-22")!;
comprobar(
  "cumpleaños justo el día de la consulta: 36 años, con la fecha como CADENA",
  calcularEdad(cumpleHoy, "2026-08-22").anios,
  36
);
comprobar(
  "y lo mismo pasándola como Date",
  calcularEdad(cumpleHoy, new Date(2026, 7, 22)).anios,
  36
);
comprobar(
  "la víspera todavía son 35",
  calcularEdad(cumpleHoy, "2026-08-21").anios,
  35
);
comprobar(
  "en una consulta atrasada, la edad es la de ESE día, no la de hoy",
  edadDe("1990-08-22", parseFechaNacimiento("2020-01-15")!)?.anios,
  29
);

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------

comprobar("la coma decimal se acepta: es como se escribe aquí", aNumero("36,5"), 36.5);
comprobar("el punto también", aNumero("36.5"), 36.5);
comprobar("un campo vacío es null, no 0", aNumero("   "), null);
cierto("y una palabra no es un número", Number.isNaN(aNumero("mucha fiebre") as number));
cierto(
  "un peso con la unidad escrita se rechaza: la base guarda numeric",
  Boolean(validarConsulta(datos({ peso: "68 kg" }), contexto).peso)
);
cierto(
  "36,5 no da error",
  !validarConsulta(datos({ temperatura: "36,5" }), contexto).temperatura
);
cierto(
  "una temperatura de 365 avisa, pero NO bloquea",
  Boolean(avisosConsulta(datos({ temperatura: "365" })).temperatura) &&
    sinErrores(validarConsulta(datos({ temperatura: "365" }), contexto))
);
cierto(
  "una taquicardia real (210 lpm en un lactante) avisa, no impide guardar",
  sinErrores(validarConsulta(datos({ fc: "210" }), contexto))
);
cierto("una PA escrita como 12080 avisa", Boolean(avisosConsulta(datos({ pa: "12080" })).pa));
cierto("120/80 no", !avisosConsulta(datos({ pa: "120/80" })).pa);

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------

// Un texto que de verdad se sale de los dos renglones medidos.
const IMPRESION_LARGA =
  "Faringoamigdalitis aguda de probable origen viral, sin criterios de Centor, con adenopatías cervicales dolorosas bilaterales, odinofagia intensa de tres días de evolución y fiebre no cuantificada";
cierto(
  "una impresión diagnóstica que no cabe en dos renglones bloquea",
  Boolean(
    validarConsulta(datos({ impresion_diagnostica: IMPRESION_LARGA }), contexto)
      .impresion_diagnostica
  )
);
cierto(
  "el contador la marca como excedida",
  contadorImpresionDiagnostica(datos({ impresion_diagnostica: IMPRESION_LARGA }), font).excedido
);

// ADR-007 dice que 145 es una aproximación y que quien decide es la función de
// ajuste. Se comprueba que las dos cosas no se contradigan en pantalla: un
// texto de 158 caracteres cabe de verdad en los dos renglones (medido con las
// métricas de Helvetica), así que ni bloquea ni se pinta en rojo, aunque pase
// del número del contador.
const JUSTO_POR_ENCIMA =
  "Faringoamigdalitis aguda de probable origen viral, sin criterios de Centor, con adenopatías cervicales dolorosas bilaterales y odinofagia intensa de tres días";
comprobar("el texto de control pasa del número del contador", JUSTO_POR_ENCIMA.length > 145, true);
cierto(
  "pero cabe: no bloquea",
  sinErrores(validarConsulta(datos({ impresion_diagnostica: JUSTO_POR_ENCIMA }), contexto))
);
cierto(
  "y el contador no lo pinta en rojo, porque el color sigue a la misma decisión",
  !contadorImpresionDiagnostica(datos({ impresion_diagnostica: JUSTO_POR_ENCIMA }), font).excedido
);
cierto(
  "sin fuente, en cambio, el conteo de caracteres avisa de más — nunca de menos",
  contadorImpresionDiagnostica(datos({ impresion_diagnostica: JUSTO_POR_ENCIMA }), null).excedido
);
comprobar(
  "el contador cuenta el CÓDIGO CIE-10, porque se imprime en el mismo renglón",
  contadorImpresionDiagnostica(
    datos({ impresion_diagnostica: "Faringitis aguda", cie10_codigo: "J029" })
  ).usados,
  "Faringitis aguda (CIE-10: J029)".length
);
comprobar(
  "sin código, cuenta solo lo escrito",
  contadorImpresionDiagnostica(datos({ impresion_diagnostica: "Faringitis aguda" })).usados,
  "Faringitis aguda".length
);
comprobar(
  "y el máximo es el de ADR-007, no un número inventado aquí",
  contadorImpresionDiagnostica(datos()).maximo,
  IMPRESION_DIAGNOSTICA_MAX_CHARS
);
comprobar(
  "igual con el tratamiento",
  contadorTratamiento(datos()).maximo,
  TRATAMIENTO_MAX_CHARS
);
cierto(
  "un tratamiento que se sale de los tres renglones bloquea",
  Boolean(
    validarConsulta(
      datos({
        tratamiento:
          "Amoxicilina 500 mg cada 8 horas por 7 días. Paracetamol 1 gramo cada 8 horas si fiebre o dolor. Ibuprofeno 400 mg cada 8 horas por 3 días. Abundantes líquidos y reposo relativo. Control en 72 horas si no hay mejoría clínica evidente, y antes si aparecen signos de alarma.",
      }),
      contexto
    ).tratamiento
  )
);
cierto(
  "sin la fuente todavía incrustada, el contador de caracteres hace de red",
  Boolean(
    validarConsulta(datos({ impresion_diagnostica: IMPRESION_LARGA }), {
      hoy: HOY,
      font: null,
    }).impresion_diagnostica
  )
);

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------

const paciente = { alergia_actual: "Penicilina — rash" } as Pick<PacienteRow, "alergia_actual">;

comprobar(
  "con historial, los antecedentes vienen de la última consulta",
  datosIniciales({ hoyISO: HOY_ISO, paciente, ultimaConsulta: consultaGuardada() }).patologias,
  "Hipertensión arterial"
);
comprobar(
  "sin historial, las alergias vienen de la ficha (RF-07)",
  datosIniciales({ hoyISO: HOY_ISO, paciente, ultimaConsulta: null }).alergias,
  "Penicilina — rash"
);
comprobar(
  "lo variable de la visita nunca se precarga: el motivo empieza en blanco",
  datosIniciales({ hoyISO: HOY_ISO, paciente, ultimaConsulta: consultaGuardada() })
    .motivo_consulta,
  ""
);
comprobar(
  "la fecha la pone el servidor, no el reloj del navegador",
  datosIniciales({ hoyISO: HOY_ISO, paciente, ultimaConsulta: null }).fecha,
  HOY_ISO
);

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------

const paraPdf = aConsultaPdf(
  datos({ pa: "120/80", temperatura: "36,5", peso: "", fc: "no la tomé" }),
  "p1"
);
comprobar("la temperatura llega como número", paraPdf.exploracionFisica.temperatura, 36.5);
comprobar("un campo vacío llega como null, no como 0", paraPdf.exploracionFisica.peso, null);
comprobar(
  "un número imposible llega como null: 'NaN' no se imprime sobre la hoja",
  paraPdf.exploracionFisica.fc,
  null
);
comprobar("los textos vacíos son null, no cadenas vacías", paraPdf.tratamiento, null);
comprobar("la presión arterial sigue siendo texto", paraPdf.exploracionFisica.pa, "120/80");

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------

comprobar(
  "el código se busca sin punto, que es como está guardado",
  normalizarCodigoCie10("j06.0"),
  "J060"
);
comprobar("los rangos conservan el guion", normalizarCodigoCie10("c00-c14"), "C00-C14");
comprobar("'J06' es un código", tipoDeBusquedaCie10("J06"), "codigo");
comprobar("'e11.9' también", tipoDeBusquedaCie10("e11.9"), "codigo");
comprobar("'faringitis aguda' es texto", tipoDeBusquedaCie10("faringitis aguda"), "descripcion");

comprobar(
  "las dos palabras se piden a la vez, con prefijo",
  construirTsquery("gastritis aguda"),
  "gastritis:* & aguda:*"
);
comprobar(
  "una palabra con 'n' se pide también con eñe: el coste de no perder 'migraña'",
  construirTsquery("faringitis"),
  "(faringitis:* | fariñgitis:*)"
);
comprobar(
  "y 'migrana' busca también 'migraña': el stemmer español no las une",
  construirTsquery("migrana"),
  "(migrana:* | migraña:*)"
);
comprobar(
  "'COVID-19' pide el 19 también con guion: Postgres indexa 'COVID-19' como 'cov' y el entero '-19'",
  construirTsquery("COVID-19"),
  "covid:* & (19:* | -19)"
);
comprobar("un número suelto, igual", construirTsquery("19"), "(19:* | -19)");
comprobar(
  "el número con guion va sin prefijo: 'tipo 1' no tiene que traer el -19 de COVID-19",
  construirTsquery("tipo 1"),
  "tipo:* & (1:* | -1)"
);
comprobar("una palabra con dígitos no es un número", construirTsquery("b12"), "b12:*");

const catalogo: Cie10CatalogoRow[] = [
  { codigo: "J060", descripcion: "Laringofaringitis aguda" },
  { codigo: "J029", descripcion: "Faringitis aguda, no especificada" },
  { codigo: "J028", descripcion: "Faringitis aguda debida a otros microorganismos especificados" },
];
comprobar(
  "primero lo que EMPIEZA por lo tecleado, y de eso lo más corto",
  ordenarSugerencias(catalogo, "faringitis").map((f) => f.codigo),
  ["J029", "J028", "J060"]
);
comprobar(
  "las tildes no estorban al ordenar",
  ordenarSugerencias(
    [
      { codigo: "A1", descripcion: "Otras migrañas" },
      { codigo: "A2", descripcion: "Migraña común" },
    ],
    "migrana"
  ).map((f) => f.codigo),
  ["A2", "A1"]
);

