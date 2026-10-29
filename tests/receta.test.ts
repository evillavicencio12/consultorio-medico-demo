// Prueba de humo de la receta (Fase 4, sesión B).
//
// Lógica pura: corre sin red, sin base y sin navegador. Lo único "pesado" es la
// fuente Helvetica de pdf-lib, incrustada en memoria para medir de verdad si un
// texto cabe — que es lo que exige ADR-005.
//
// Lo que cuida cada bloque:
//   - **El correlativo (ADR-002).** `filaConsulta` es el único sitio del sistema
//     que decide si se quema un número de receta, y la diferencia entre "omitir
//     la clave" y "mandar null" es invisible leyendo deprisa. Si esto se rompe,
//     se pierden números del talonario de la doctora y no se recuperan.
//   - **Los límites de ADR-005**, que llevaban desde la Fase 1 sin lado de
//     formulario: contador y bloqueo tienen que ser la misma decisión.
//   - **El vocabulario cerrado**: lo que el formulario deje pasar tiene que ser
//     lo que el CHECK de la base acepta.
//
//   npm run test:receta
import { PDFDocument, StandardFonts } from "pdf-lib";
import {
  aCantidad,
  contadorRecomendaciones,
  contadorSignosAlarma,
  esPresentacion,
  esViaAdministracion,
  llevaReceta,
  medicamentoEstaVacio,
  medicamentoVacio,
  medicamentosParaGuardar,
  sinErroresReceta,
  validarMedicamento,
  validarReceta,
  type DatosMedicamento,
} from "../lib/consultas/receta";
import { filaConsulta, filasMedicamentos } from "../lib/consultas/guardado";
import { ContenidoExcedeEspacioError, drawFixedOrThrow, wrapText } from "../lib/pdf/text";
import {
  impresionDiagnosticaCabeEnHistorial,
  tratamientoCabeEnHistorial,
} from "../lib/pdf/historial-limits";
import { DATOS_VACIOS, type DatosConsulta } from "../lib/consultas/formulario";
import { PRESENTACIONES, VIAS_ADMINISTRACION } from "../lib/pdf/vocabulario";
import {
  RECETA_FONT_LEGIBLE_MIN,
  RECOMENDACIONES_MAX_CHARS,
  SIGNOS_ALARMA_MAX_CHARS,
  SIGNOS_ALARMA_MAX_WIDTH,
  signosAlarmaCabenEnReceta,
} from "../lib/pdf/receta-limits";
import { cierto, comprobar } from "./ayudas";


const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.Helvetica);

const PACIENTE_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

const consulta = (parcial: Partial<DatosConsulta> = {}): DatosConsulta => ({
  ...DATOS_VACIOS,
  fecha: "2026-08-22",
  motivo_consulta: "Odinofagia de dos días.",
  impresion_diagnostica: "Faringoamigdalitis aguda",
  ...parcial,
});

const medicamento = (parcial: Partial<DatosMedicamento> = {}): DatosMedicamento => ({
  ...medicamentoVacio(),
  nombre_generico: "amoxicilina",
  nombre_comercial: "AMOXIFAR 500",
  presentacion: "capsula",
  via_administracion: "oral",
  cantidad: "21",
  dosis: "1 cápsula",
  frecuencia: "cada 8 horas",
  duracion: "7 días",
  ...parcial,
});

// ---------------------------------------------------------------------------
console.log("--- El correlativo: quién quema un número y quién no (ADR-002) ---");
// ---------------------------------------------------------------------------

const conReceta = filaConsulta(PACIENTE_ID, consulta(), [medicamento()]);
const sinReceta = filaConsulta(PACIENTE_ID, consulta(), []);

cierto(
  "con medicamentos, la clave numero_receta NO viaja: la pone el DEFAULT de la secuencia",
  !("numero_receta" in conReceta)
);
cierto("sin medicamentos, viaja explícitamente en null", sinReceta.numero_receta === null);
cierto(
  "y un renglón agregado pero vacío no cuenta como receta",
  filaConsulta(PACIENTE_ID, consulta(), [medicamentoVacio()]).numero_receta === null
);
cierto(
  "un renglón vacío entre dos llenos tampoco estorba",
  !("numero_receta" in filaConsulta(PACIENTE_ID, consulta(), [medicamento(), medicamentoVacio()]))
);
comprobar(
  "y esos renglones vacíos no se guardan como medicamentos",
  filasMedicamentos("c1", [medicamento(), medicamentoVacio()]).length,
  1
);

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------

comprobar("el paciente va en la fila", conReceta.paciente_id, PACIENTE_ID);
comprobar("los textos vacíos se guardan como null, no como cadena vacía", conReceta.alergias, null);
comprobar(
  "los signos de alarma llegan a la fila de consultas (son columna suya)",
  filaConsulta(PACIENTE_ID, consulta({ signos_alarma: "Fiebre alta" }), []).signos_alarma,
  "Fiebre alta"
);

const filas = filasMedicamentos("c1", [medicamento()]);
comprobar("la cantidad llega como número entero", filas[0].cantidad, 21);
comprobar("el slug del vocabulario, no la etiqueta", filas[0].presentacion, "capsula");
comprobar("la vía, igual", filas[0].via_administracion, "oral");
comprobar("y la consulta a la que pertenece", filas[0].consulta_id, "c1");

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------

comprobar("las presentaciones son las seis de la plantilla", PRESENTACIONES.length, 6);
comprobar("y las vías, diez", VIAS_ADMINISTRACION.length, 10);
cierto("'capsula' es una presentación", esPresentacion("capsula"));
cierto("'jarabe' no lo es: exigiría una migración", !esPresentacion("jarabe"));
cierto("'subcutanea' es una vía", esViaAdministracion("subcutanea"));
cierto("'subcutánea' con tilde NO: se guarda el slug", !esViaAdministracion("subcutánea"));

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------

comprobar("uno bien lleno no tiene errores", validarMedicamento(medicamento()), {});
cierto("sin dosis, sí", Boolean(validarMedicamento(medicamento({ dosis: "" })).dosis));
cierto("sin vía, sí", Boolean(validarMedicamento(medicamento({ via_administracion: "" })).via_administracion));
cierto("sin duración, sí", Boolean(validarMedicamento(medicamento({ duracion: "" })).duracion));
cierto("un renglón recién agregado está vacío", medicamentoEstaVacio(medicamentoVacio()));
cierto("y uno con algo escrito, no", !medicamentoEstaVacio(medicamento()));

comprobar("la cantidad es un entero positivo", aCantidad("21"), 21);
comprobar("no admite cero", aCantidad("0"), null);
comprobar("ni decimales: 'medio frasco' se expresa en la dosis", aCantidad("1.5"), null);
comprobar("ni texto", aCantidad("una caja"), null);
cierto(
  "un renglón a medio llenar bloquea el guardado",
  !sinErroresReceta(
    validarReceta(
      { signosAlarma: "", recomendaciones: "", medicamentos: [medicamento({ cantidad: "" })] },
      font
    )
  )
);
cierto(
  "pero uno vacío del todo no: se descarta al guardar",
  sinErroresReceta(
    validarReceta({ signosAlarma: "", recomendaciones: "", medicamentos: [medicamentoVacio()] }, font)
  )
);

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------

comprobar(
  "el contador de signos de alarma usa el número del ADR",
  contadorSignosAlarma("", font).maximo,
  SIGNOS_ALARMA_MAX_CHARS
);
comprobar(
  "y el de recomendaciones, el suyo",
  contadorRecomendaciones("", font).maximo,
  RECOMENDACIONES_MAX_CHARS
);

const SIGNOS_LARGOS =
  "Fiebre que no cede pasadas 48 horas, dificultad para respirar, dolor torácico, vómito persistente o somnolencia marcada";
cierto(
  "unos signos de alarma que no caben en dos renglones bloquean",
  Boolean(
    validarReceta({ signosAlarma: SIGNOS_LARGOS, recomendaciones: "", medicamentos: [] }, font)
      .signos_alarma
  )
);
cierto(
  "y el contador los pinta en rojo: es la MISMA decisión, no dos parecidas",
  contadorSignosAlarma(SIGNOS_LARGOS, font).excedido
);
cierto(
  "unos signos normales pasan",
  !validarReceta(
    { signosAlarma: "Fiebre que no cede en 48 h o dificultad para respirar.", recomendaciones: "", medicamentos: [] },
    font
  ).signos_alarma
);

const RECOMENDACIONES_LARGAS =
  "Reposo relativo en domicilio, abundantes líquidos por vía oral, alimentación blanda fraccionada, evitar bebidas frías y ambientes con humo, lavado de manos frecuente, aislamiento respiratorio mientras haya fiebre y control en 72 horas si no hay mejoría clínica evidente";
cierto(
  "unas recomendaciones que no caben en tres renglones bloquean",
  Boolean(
    validarReceta(
      { signosAlarma: "", recomendaciones: RECOMENDACIONES_LARGAS, medicamentos: [] },
      font
    ).recomendaciones_no_farmacologicas
  )
);

// El límite de medicamentos NO es un número fijo: depende del largo real de
// cada descripción (ADR-005). Se comprueba el comportamiento, no un tope.
const pocos = [medicamento(), medicamento({ nombre_comercial: "PARACETAMOL MK" })];
cierto(
  "dos medicamentos con descripciones típicas caben",
  !validarReceta({ signosAlarma: "", recomendaciones: "", medicamentos: pocos }, font).lista
);

const muchos = Array.from({ length: 9 }, (_, i) =>
  medicamento({
    nombre_comercial: `MEDICAMENTO COMERCIAL NUMERO ${i + 1}`,
    dosis: "2 cápsulas de 500 miligramos",
    frecuencia: "cada 8 horas",
    duracion: "10 días",
  })
);
cierto(
  "nueve con descripciones largas, no",
  Boolean(validarReceta({ signosAlarma: "", recomendaciones: "", medicamentos: muchos }, font).lista)
);

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------

cierto("con un medicamento lleno, sí", llevaReceta([medicamento()]));
cierto("con un renglón vacío, no", !llevaReceta([medicamentoVacio()]));
cierto("sin renglones, tampoco", !llevaReceta([]));
comprobar(
  "y solo se guardan los llenos",
  medicamentosParaGuardar([medicamento(), medicamentoVacio(), medicamento()]).length,
  2
);

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Encontrado probando con datos adversarios: 136 caracteres SIN un solo espacio
// en "Signos de alarma" mostraban "136/100 aprox." pero ni se ponían en rojo ni
// bloqueaban, y el PDF se generaba sin lanzar. El motivo es que `wrapText` corta
// por espacios: sin ninguno, el texto es UNA palabra que sale en UNA línea mida
// lo que mida, así que contar renglones nunca lo detectaba.
//
// Medido: 550pt de texto contra los 201pt del hueco (2,74 veces). Impreso: de
// los 136 caracteres solo 54 caían dentro de la hoja; el resto se dibujaba más
// allá del borde derecho y no salía en el papel.

const SIN_ESPACIOS = "adaadaaaaaaaaaaaaadaad".repeat(7).slice(0, 136);
comprobar("el texto de prueba no tiene espacios", SIN_ESPACIOS.includes(" "), false);
comprobar(
  "wrapText sigue devolviendo UNA línea: no hay dónde cortar",
  wrapText(SIN_ESPACIOS, font, RECETA_FONT_LEGIBLE_MIN, SIGNOS_ALARMA_MAX_WIDTH).length,
  1
);
cierto(
  "y esa línea es más ancha que el hueco",
  font.widthOfTextAtSize(SIN_ESPACIOS, RECETA_FONT_LEGIBLE_MIN) > SIGNOS_ALARMA_MAX_WIDTH
);
cierto("aun así, AHORA no cabe", !signosAlarmaCabenEnReceta(SIN_ESPACIOS, font));
cierto("el contador lo pinta en rojo", contadorSignosAlarma(SIN_ESPACIOS, font).excedido);
cierto(
  "y el guardado se bloquea",
  Boolean(
    validarReceta({ signosAlarma: SIN_ESPACIOS, recomendaciones: "", medicamentos: [] }, font)
      .signos_alarma
  )
);
cierto(
  "lo mismo en recomendaciones",
  Boolean(
    validarReceta({ signosAlarma: "", recomendaciones: SIN_ESPACIOS, medicamentos: [] }, font)
      .recomendaciones_no_farmacologicas
  )
);
cierto(
  "y en los campos del historial (ADR-007)",
  !tratamientoCabeEnHistorial(SIN_ESPACIOS, font) &&
    !impresionDiagnosticaCabeEnHistorial(SIN_ESPACIOS, "J029", font)
);
// La red de seguridad del PDF, que era la que fallaba en silencio.
cierto(
  "drawFixedOrThrow lanza en vez de dibujar fuera de la hoja",
  (() => {
    const pagina = doc.addPage();
    try {
      drawFixedOrThrow(pagina, font, "Signos de alarma", SIN_ESPACIOS, 374, 132, {
        maxWidth: SIGNOS_ALARMA_MAX_WIDTH,
        maxLines: 2,
        size: RECETA_FONT_LEGIBLE_MIN,
        lineHeight: 8.5,
      });
      return false;
    } catch (e) {
      return e instanceof ContenidoExcedeEspacioError;
    }
  })()
);
// Los campos SIN tope de renglones no bloquean: parten la palabra, porque ahí
// la única alternativa era que la tinta se saliera de la hoja.
comprobar(
  "un campo sin límite trocea la palabra para no desbordarse",
  wrapText(SIN_ESPACIOS, font, 9.5, 505, { partirPalabras: true }).length,
  2
);
cierto(
  "y ningún trozo se pasa del ancho",
  wrapText(SIN_ESPACIOS, font, 9.5, 505, { partirPalabras: true }).every(
    (l) => font.widthOfTextAtSize(l, 9.5) <= 505
  )
);

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// También reportado: 20 filas vacías no avisaban de nada. Es lo correcto —no
// aportan texto que medir— y esto lo fija para que nadie lo "arregle" luego.

const VEINTE_VACIOS = Array.from({ length: 20 }, () => medicamentoVacio());
cierto(
  "veinte renglones vacíos no producen ningún error",
  sinErroresReceta(validarReceta({ signosAlarma: "", recomendaciones: "", medicamentos: VEINTE_VACIOS }, font))
);
comprobar("no se guarda ninguno", medicamentosParaGuardar(VEINTE_VACIOS).length, 0);
cierto("no cuentan como receta", !llevaReceta(VEINTE_VACIOS));
cierto(
  "y NO queman número de receta",
  filaConsulta("p1", consulta(), VEINTE_VACIOS).numero_receta === null
);

