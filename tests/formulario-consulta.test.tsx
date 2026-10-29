// Renderiza de verdad el formulario de consulta y el buscador CIE-10, y mira el
// HTML que sale. Sin navegador, sin sesión y sin base de datos.
//
// Existe por lo mismo que las otras pruebas de render de este repo: hay estados
// que no se pueden ver con los datos reales. Hoy `consultas` sigue teniendo 0
// filas, así que abrir la pantalla con un paciente cualquiera solo demuestra el
// caso "primera consulta"; que los antecedentes se precarguen de la visita
// anterior, que el aviso de alergia salga, o que el código CIE-10 elegido se
// muestre con su descripción, solo se comprueba así.
//
// Comprueba además el contrato de docs/arquitectura/Armazon-de-Pantalla.md: esta
// pantalla no puede traerse su propio contenedor con scroll ni un alto en
// unidades de viewport.
//
//   npm run test:consulta-ui
import { renderToStaticMarkup } from "react-dom/server";
import { FormularioConsulta } from "../app/(app)/pacientes/[id]/consulta/formulario-consulta";
import { BuscadorCie10 } from "../app/(app)/pacientes/[id]/consulta/buscador-cie10";
import type { ConsultaRow, PacienteRow } from "../lib/supabase/tipos";
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
  sexo: "F",
  telefono: "0991234567",
  correo: null,
  domicilio: "Av. Siempre Viva 742",
  ocupacion: "Docente",
  antecedentes_heredofamiliares: "Madre con diabetes mellitus tipo 2.",
  alergia_actual: null,
  nombre_acompanante: null,
  documento_acompanante: null,
  tipo_documento_acompanante: "cedula",
  correo_acompanante: null,
  telefono_acompanante: null,
  created_at: "2026-08-18T00:00:00Z",
  estado_civil: "Casado/a",
};

const CONSULTA_ANTERIOR: ConsultaRow = {
  id: "c1",
  paciente_id: PACIENTE.id,
  fecha: "2026-06-08",
  motivo_consulta: "Control de presión arterial.",
  alergias: "Penicilina — rash",
  patologias: "Hipertensión arterial en tratamiento",
  quirurgicos: "Colecistectomía, 2019",
  transfusionales: "Niega",
  pa: "120/80",
  fc: 72,
  fr: 16,
  temperatura: 36.5,
  peso: 68,
  impresion_diagnostica: "Hipertensión arterial esencial",
  cie10_codigo: "I10",
  tratamiento: "Losartán 50 mg cada día.",
  signos_alarma: null,
  recomendaciones_no_farmacologicas: null,
  numero_receta: 3,
  created_at: "2026-06-08T10:00:00Z",
};

/** Las Server Actions de verdad no se pueden llamar aquí; nada las invoca en SSR. */
const buscarCie10 = async () => ({
  sugerencias: [],
  total: 0,
  tipo: "descripcion" as const,
});
const buscarMedicamentos = async () => ({ sugerencias: [], total: 0 });
const guardarConsulta = async () => ({ ok: false, mensaje: "no se llama en la prueba" });

const primeraVez = renderToStaticMarkup(
  <FormularioConsulta
    paciente={PACIENTE}
    hoyISO="2026-08-22"
    ultimaConsulta={null}
    fechaPrimeraConsulta={null}
    totalConsultas={0}
    buscarCie10={buscarCie10}
    buscarMedicamentos={buscarMedicamentos}
    guardarConsulta={guardarConsulta}
  />
);

const subsecuente = renderToStaticMarkup(
  <FormularioConsulta
    paciente={{ ...PACIENTE, alergia_actual: "Penicilina — rash" }}
    hoyISO="2026-08-22"
    ultimaConsulta={CONSULTA_ANTERIOR}
    fechaPrimeraConsulta="2026-01-10"
    totalConsultas={4}
    buscarCie10={buscarCie10}
    buscarMedicamentos={buscarMedicamentos}
    guardarConsulta={guardarConsulta}
  />
);

const sinNacimiento = renderToStaticMarkup(
  <FormularioConsulta
    paciente={{ ...PACIENTE, fecha_nacimiento: null }}
    hoyISO="2026-08-22"
    ultimaConsulta={null}
    fechaPrimeraConsulta={null}
    totalConsultas={0}
    buscarCie10={buscarCie10}
    buscarMedicamentos={buscarMedicamentos}
    guardarConsulta={guardarConsulta}
  />
);

// ---------------------------------------------------------------------------
console.log("--- Datos fijos del paciente (Prompts-Stitch: sobre #E8EEF2) ---");
// ---------------------------------------------------------------------------

comprobar(
  "el bloque de datos fijos va sobre navy tint, el fondo que el sistema reserva para lo no editable",
  primeraVez.includes("bg-navy-tint")
);
comprobar("con el nombre del paciente", primeraVez.includes("PACIENTE DE PRUEBA"));
comprobar("la cédula en mono", primeraVez.includes("identificador"));
comprobar("y la edad calculada a la fecha de la consulta", primeraVez.includes("36 años"));
comprobar(
  "ninguno de esos datos es un campo editable: no hay input con name de paciente",
  !primeraVez.includes('name="nombre_completo"') && !primeraVez.includes('name="domicilio"')
);
comprobar(
  "con enlace a la ficha, que es donde sí se corrigen",
  primeraVez.includes(`/pacientes/${PACIENTE.id}/editar`)
);
comprobar(
  "sin fecha de nacimiento se avisa de que el historial saldrá con raya (ADR-006)",
  sinNacimiento.includes("Sin fecha de nacimiento")
);
comprobar(
  "y la alergia de la ficha se ve arriba, en rojo (RF-07)",
  subsecuente.includes("ALERGIA REGISTRADA") && subsecuente.includes("bg-rojo-tint")
);

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------

const secciones = primeraVez.match(/<details/g)?.length ?? 0;
comprobar(`son seis secciones plegables (había ${secciones})`, secciones === 6);
comprobar(
  "abiertas por dentro: un error escondido en una sección plegada parecería un botón roto",
  (primeraVez.match(/<details open/g)?.length ?? 0) === 6
);
for (const titulo of [
  "Antecedentes patológicos",
  "Exploración física",
  "Motivo de consulta",
  "Impresión diagnóstica",
  "Tratamiento",
  "Receta",
]) {
  comprobar(`está la sección "${titulo}"`, primeraVez.includes(titulo));
}
comprobar(
  "son <details> nativos, no un acordeón hecho a mano con divs",
  primeraVez.includes("<summary")
);

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------

for (const campo of [
  "fecha",
  "alergias",
  "patologias",
  "quirurgicos",
  "transfusionales",
  "pa",
  "fc",
  "fr",
  "temperatura",
  "peso",
  "motivo_consulta",
  "impresion_diagnostica",
  "tratamiento",
]) {
  comprobar(`viaja el campo "${campo}"`, primeraVez.includes(`name="${campo}"`));
}
comprobar(
  "y los dos campos de la receta, que son columna de `consultas` (Sesión B)",
  primeraVez.includes('name="signos_alarma"') &&
    primeraVez.includes('name="recomendaciones_no_farmacologicas"')
);

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------

for (const unidad of ["lpm", "rpm", "°C", "kg"]) {
  comprobar(`se muestra la unidad ${unidad}`, primeraVez.includes(unidad));
}
comprobar(
  "los campos de medición no son type=number: con la coma decimal se perdería el valor",
  /inputmode="decimal"/i.test(primeraVez) && !primeraVez.includes('type="number"')
);

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------

comprobar("el contador de impresión diagnóstica dice 145", primeraVez.includes("/145"));
comprobar("el de tratamiento, 215", primeraVez.includes("/215"));
comprobar(
  "los dos se anuncian como aproximación: quien decide es la función de ajuste",
  (primeraVez.match(/aprox\./g)?.length ?? 0) >= 2
);
comprobar(
  "y se avisa de que el código CIE-10 cuenta para el límite",
  primeraVez.includes("incluido el código CIE-10")
);

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------

comprobar(
  "los antecedentes se precargan de la última visita",
  subsecuente.includes("Hipertensión arterial en tratamiento")
);
comprobar(
  "diciendo de qué fecha vienen: un dato viejo sin fecha es un dato viejo disfrazado",
  subsecuente.includes("Precargados desde la consulta del 8 de junio de 2026")
);
comprobar(
  "el motivo de la visita anterior NO se arrastra",
  !subsecuente.includes("Control de presión arterial")
);
comprobar(
  "sin historial, las alergias vienen de la ficha",
  renderToStaticMarkup(
    <FormularioConsulta
      paciente={{ ...PACIENTE, alergia_actual: "Penicilina — rash" }}
      hoyISO="2026-08-22"
      ultimaConsulta={null}
      fechaPrimeraConsulta={null}
      totalConsultas={0}
      buscarCie10={buscarCie10}
      buscarMedicamentos={buscarMedicamentos}
      guardarConsulta={guardarConsulta}
    />
  ).includes("Penicilina")
);
comprobar(
  "y se dice cuántas consultas lleva el paciente",
  subsecuente.includes("4 consultas")
);

// Un salto de línea guardado antes de que estos campos frenaran la tecla Enter
// llegaría al contador en vivo y haría lanzar a pdf-lib DURANTE el render. Se
// comprueba sobre el componente de verdad, no sobre la función suelta.
const conSaltoGuardado = renderToStaticMarkup(
  <FormularioConsulta
    paciente={PACIENTE}
    hoyISO="2026-08-22"
    ultimaConsulta={{ ...CONSULTA_ANTERIOR, patologias: "Hipertension arterial.\nDiabetes tipo 2." }}
    fechaPrimeraConsulta="2026-01-10"
    totalConsultas={4}
    buscarCie10={buscarCie10}
    buscarMedicamentos={buscarMedicamentos}
    guardarConsulta={guardarConsulta}
  />
);
comprobar(
  "una precarga con salto de línea se limpia al entrar en el formulario",
  conSaltoGuardado.includes("Hipertension arterial. Diabetes tipo 2."),
);
comprobar(
  "y no queda ni rastro del salto en el campo",
  !conSaltoGuardado.includes("arterial.\n"),
);
comprobar(
  "en la primera, que es la primera",
  primeraVez.includes("Es su primera consulta registrada")
);

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------

const buscadorVacio = renderToStaticMarkup(
  <BuscadorCie10 elegido={null} onElegir={() => {}} buscar={buscarCie10} />
);
comprobar("es un combobox accesible", buscadorVacio.includes('role="combobox"'));
comprobar(
  "se puede buscar por diagnóstico o por código",
  buscadorVacio.includes("faringitis aguda") && buscadorVacio.includes("J069")
);
comprobar(
  "sin código elegido no viaja nada: la FK contra el catálogo no admite cadena vacía",
  !buscadorVacio.includes('name="cie10_codigo"')
);

const buscadorElegido = renderToStaticMarkup(
  <BuscadorCie10
    elegido={{ codigo: "J029", descripcion: "Faringitis aguda, no especificada" }}
    onElegir={() => {}}
    buscar={buscarCie10}
  />
);
comprobar("elegido, se ve el código", buscadorElegido.includes("J029"));
comprobar(
  "y su descripción entera: un código suelto no dice nada al releer la ficha",
  buscadorElegido.includes("Faringitis aguda, no especificada")
);
comprobar(
  "con el check turquesa que pide Prompts-Stitch",
  buscadorElegido.includes("text-teal") && buscadorElegido.includes("border-teal")
);
comprobar(
  "y es el código lo que se envía",
  buscadorElegido.includes('name="cie10_codigo"') && buscadorElegido.includes('value="J029"')
);

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------

comprobar(
  "el botón primario es el de Prompts-Stitch",
  primeraVez.includes("Guardar y generar PDF")
);
comprobar(
  "y se puede mirar el PDF antes de comprometerse",
  primeraVez.includes("Ver cómo quedará")
);
comprobar(
  "el número de receta no se inventa antes de guardar: lo da la secuencia",
  primeraVez.includes("se asigna al guardar")
);

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// El formulario se parte en dos columnas para bajar el scroll vertical. Lo que
// esta prueba vigila no es la estética: es que las columnas NO traigan su
// propio scroll. docs/arquitectura/Armazon-de-Pantalla.md fija que `<main>` es el
// único elemento que se desplaza, y costó tres intentos llegar ahí.

comprobar(
  "las secciones viven en una rejilla de dos columnas a partir de xl",
  primeraVez.includes("xl:grid-cols-2")
);
comprobar(
  "que colapsa a una sola en ventana angosta",
  /grid-cols-1[^"]*xl:grid-cols-2/.test(primeraVez)
);
comprobar(
  "con items-start: la columna corta no queda estirada al alto de la larga",
  primeraVez.includes("items-start")
);
comprobar(
  "NINGUNA columna crea un scroll propio",
  !/overflow-(y-)?(auto|scroll)/.test(primeraVez)
);
comprobar(
  "ni fija un alto contra la ventana (los dos primeros intentos del armazón)",
  !/\b(min-h-screen|h-dvh|h-screen|max-h-screen)/.test(primeraVez)
);
comprobar(
  "la receta se mide contra SU ancho, no contra el de la ventana",
  primeraVez.includes("@container") && primeraVez.includes("@3xl:grid-cols-2")
);
comprobar(
  "y sus campos, igual, un nivel más adentro",
  primeraVez.includes("@sm:grid-cols-2")
);
comprobar(
  "ya no queda ningún corte por ventana dentro de la tarjeta de medicamento",
  !primeraVez.includes("lg:grid-cols-2")
);
comprobar(
  "cinco secciones de historial y una de receta, las seis abiertas",
  (primeraVez.match(/<details open/g)?.length ?? 0) === 6
);
comprobar(
  "los contadores de ADR-005 siguen en la columna derecha",
  primeraVez.includes("/100") && primeraVez.includes("/195")
);
comprobar(
  "y los de ADR-007 en la izquierda",
  primeraVez.includes("/145") && primeraVez.includes("/215") && primeraVez.includes("/325")
);

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------

const todo = primeraVez + subsecuente + buscadorVacio + buscadorElegido;
comprobar(
  "la pantalla no se trae su propio contenedor con scroll (Armazon-de-Pantalla.md)",
  !todo.includes("overflow-auto") && !todo.includes("overflow-y-scroll")
);
comprobar("ni un alto en unidades de viewport", !/\b(min-h-screen|h-dvh|h-screen)\b/.test(todo));
comprobar(
  "ninguna paleta genérica de Tailwind",
  !/\b(bg|text|border)-(red|blue|green|gray|slate|indigo)-\d/.test(todo)
);
comprobar(
  "ningún hex de la paleta Material de Stitch",
  !todo.includes("#002441") && !todo.includes("#006a66")
);
comprobar(
  "radios del sistema",
  todo.includes("rounded-tarjeta") && todo.includes("rounded-control")
);

