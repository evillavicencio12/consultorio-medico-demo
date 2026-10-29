// Renderiza de verdad la línea de tiempo del historial clínico
// (app/(app)/pacientes/[id]/linea-tiempo.tsx) y la vista previa de PDF, y mira
// el HTML que sale. Sin navegador, sin sesión y sin base de datos.
//
// Existe por lo mismo que la prueba de la fila del listado: hay estados que no
// se pueden ver con los datos reales. Hoy `consultas` tiene 0 filas —el
// formulario de "Nueva Consulta" es la Fase 4—, así que abrir cualquiera de las
// 164 fichas solo demuestra que el estado VACÍO funciona. Que la línea de
// tiempo se dibuje bien con consultas, y que el botón de receta desaparezca
// cuando no hay medicamentos, solo se comprueba así.
//
//   npm run test:linea-tiempo
import { renderToStaticMarkup } from "react-dom/server";
import { LineaTiempo } from "../app/(app)/pacientes/[id]/linea-tiempo";
import { VistaPreviaPdf } from "../app/(app)/vista-previa-pdf";
import type { ConsultaRow, PacienteRow, RecetaMedicamentoRow } from "../lib/supabase/tipos";
import { registrar } from "./ayudas";

function comprobar(descripcion: string, condicion: boolean) {
  registrar(descripcion, condicion);
}

const PACIENTE: PacienteRow = {
  id: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
  documento: "0912345675",
  tipo_documento: "cedula",
  nombre_completo: "PACIENTE DE PRUEBA",
  fecha_nacimiento: "1990-04-12",
  sexo: "M",
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
};

const consulta = (parcial: Partial<ConsultaRow> = {}): ConsultaRow => ({
  id: "c1",
  paciente_id: PACIENTE.id,
  fecha: "2026-08-21",
  motivo_consulta: "Cefalea frontal de tres días de evolución, sin fiebre.",
  alergias: null,
  patologias: null,
  quirurgicos: null,
  transfusionales: null,
  pa: null,
  fc: null,
  fr: null,
  temperatura: null,
  peso: null,
  impresion_diagnostica: null,
  cie10_codigo: "G440",
  tratamiento: null,
  signos_alarma: null,
  recomendaciones_no_farmacologicas: null,
  numero_receta: 7,
  created_at: "2026-08-21T10:00:00Z",
  ...parcial,
});

const medicamento = (id: string, consultaId: string): RecetaMedicamentoRow => ({
  id,
  consulta_id: consultaId,
  nombre_generico: "Paracetamol",
  nombre_comercial: "Tempra",
  presentacion: "tableta",
  cantidad: 12,
  dosis: "1 g",
  via_administracion: "oral",
  frecuencia: "cada 8 horas",
  duracion: "3 días",
});

const pintar = (
  consultas: ConsultaRow[],
  medicamentos: Record<string, RecetaMedicamentoRow[]> = {}
) =>
  renderToStaticMarkup(
    <LineaTiempo
      paciente={PACIENTE}
      consultas={consultas}
      medicamentos={medicamentos}
      fechaPrimeraConsulta={consultas.at(-1)?.fecha ?? null}
    />
  );

// ---------------------------------------------------------------------------
const vacio = pintar([]);

comprobar("dice que no hay consultas registradas", vacio.includes("Sin consultas registradas"));
comprobar("explica que aparecerán cuando se registre la primera", vacio.includes("primera consulta"));
// No es un error: es el estado normal del sistema mientras "Nueva Consulta" no
// exista. Si se pintara de rojo, la doctora abriría 164 fichas creyendo que
// algo se rompió.
comprobar("NO se disfraza de error: sin rojo", !vacio.includes("rojo"));
comprobar("y sin ícono de alerta", !vacio.includes("Alert"));
comprobar("no dibuja botones de PDF que no llevarían a nada", !vacio.includes("Ver historial"));

// ---------------------------------------------------------------------------
const una = consulta();
const conUna = pintar([una], { c1: [medicamento("m1", "c1")] });

comprobar("sale la fecha de la consulta", conUna.includes("21 ago 2026"));
comprobar("en IBM Plex Mono, como fija el sistema de diseño", /identificador[^"]*"[^>]*>\s*21 ago 2026/.test(conUna) || conUna.includes('class="identificador'));
// Insensible a mayúsculas a propósito: React emite `dateTime="…"` en camelCase
// y en HTML los nombres de atributo no distinguen caja, así que el navegador lo
// lee como `datetime` igual. Lo que importa es que la fecha esté en un formato
// que una máquina (o un lector de pantalla) pueda interpretar.
comprobar("con <time> legible por máquinas", /datetime="2026-08-21"/i.test(conUna));
comprobar("sale el motivo de la consulta", conUna.includes("Cefalea frontal"));
comprobar("sale el número de receta", conUna.includes("#7"));
comprobar("sale el código CIE-10", conUna.includes("G440"));
comprobar("cuenta las consultas", conUna.includes("1 consulta"));

comprobar("los dos accesos a PDF (RF-19)", conUna.includes("Ver historial") && conUna.includes("Ver receta"));
comprobar("y dice cuántos medicamentos trae la receta", conUna.includes("1 medicamento"));

// El elemento distintivo de Sistema-de-Diseno.md.
comprobar("conector turquesa", conUna.includes("bg-teal"));
comprobar("punto navy con anillo blanco", conUna.includes("bg-navy") && conUna.includes("border-superficie"));

// ---------------------------------------------------------------------------
// Una revisión o un control puede no llevar receta. Ofrecer el botón generaría
// un PDF con la mitad "Prescripción" en blanco, que no sirve para nada.
const sinMedicamentos = pintar([una], {});

comprobar("el historial sigue disponible", sinMedicamentos.includes("Ver historial"));
comprobar("pero NO se ofrece la receta", !sinMedicamentos.includes("Ver receta"));
comprobar("y se dice por qué", sinMedicamentos.includes("Sin medicamentos recetados"));

// ---------------------------------------------------------------------------
const varias = pintar(
  [
    consulta({ id: "c3", fecha: "2026-08-21", numero_receta: 9 }),
    consulta({ id: "c2", fecha: "2026-03-02", numero_receta: 8, motivo_consulta: null }),
    consulta({ id: "c1", fecha: "2025-11-14", numero_receta: 7 }),
  ],
  { c3: [medicamento("m1", "c3")] }
);

comprobar("se dibujan las tres", varias.includes("3 consultas"));
comprobar("en el orden que llegan, la más reciente arriba", varias.indexOf("21 ago 2026") < varias.indexOf("14 nov 2025"));
comprobar("una consulta sin motivo lo dice, no deja el hueco", varias.includes("Sin motivo registrado"));
comprobar("y ese hueco no va en la mono de identificadores", !/identificador[^"]*"[^>]*>Sin motivo/.test(varias));

// ---------------------------------------------------------------------------
const modal = renderToStaticMarkup(
  <VistaPreviaPdf
    titulo="Historial clínico"
    descripcion="PACIENTE DE PRUEBA · consulta del 21 de agosto de 2026"
    generar={async () => new Uint8Array()}
    onCerrar={() => {}}
  />
);

comprobar("es un <dialog> nativo, no un div con z-index", modal.includes("<dialog"));
comprobar("con el título accesible", modal.includes('aria-label="Historial clínico"'));
comprobar("y la consulta identificada bajo el título", modal.includes("consulta del 21 de agosto de 2026"));
comprobar("trae el botón de imprimir (06-Generador-PDF.md)", modal.includes("Imprimir"));
comprobar("y el de cerrar", modal.includes('aria-label="Cerrar vista previa"'));
// Al montar todavía no hay PDF: el efecto que lo genera no corre en SSR.
comprobar("mientras se genera, lo dice", modal.includes("Generando el documento"));
comprobar("y no se puede imprimir lo que aún no existe", modal.includes("disabled"));

// ---------------------------------------------------------------------------
const todo = vacio + conUna + varias + modal;
comprobar("ninguna paleta genérica de Tailwind", !/\b(bg|text|border)-(red|blue|green|gray|slate|indigo)-\d/.test(todo));
comprobar("ningún hex de la paleta Material de Stitch", !todo.includes("#002441") && !todo.includes("#006a66"));
comprobar("radios del sistema", todo.includes("rounded-tarjeta") && todo.includes("rounded-control"));

