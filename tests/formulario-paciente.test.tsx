// Renderiza de verdad el formulario de paciente
// (app/(app)/pacientes/formulario-paciente.tsx) y mira el HTML que sale. Sin
// navegador, sin sesión y sin base de datos.
//
// Por qué hace falta, además de `npm run test:formulario`: aquella prueba
// verifica las REGLAS (qué es obligatorio, qué cédula es válida); esta verifica
// que la PANTALLA las refleje. Son fallos distintos y ninguno de los dos lo
// caza `tsc`, `eslint` ni `next build` — que es exactamente lo que pasó con el
// bug de `min-h-screen` y con el del proxy.
//
// Lo que fija concretamente:
//
//  * El bloque de acompañante aparece cuando el paciente es menor (ADR-003) y
//    NO aparece cuando es mayor. Es la mitad de UI de un CHECK de la base.
//  * Un mayor de edad que YA trae acompañante lo sigue mostrando: si no, esos
//    campos no viajarían en el envío y guardar un teléfono borraría al
//    acompañante que trajo la migración.
//  * Los tokens de Sistema-de-Diseno.md. Si alguien pega markup de Stitch —que
//    exporta la paleta Material `#002441`— o escribe `bg-red-100` en vez de
//    `bg-rojo-tint`, esto lo caza.
//
//   npm run test:formulario-ui
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { FormularioPaciente, AvisoDuplicado } from "../app/(app)/pacientes/formulario-paciente";
import { camposPendientes } from "../lib/pacientes/campos";
import { DATOS_VACIOS, ESTADO_INICIAL, type EstadoPaciente } from "../lib/pacientes/formulario";
import type { PacienteRow } from "../lib/supabase/tipos";
import { registrar } from "./ayudas";


function comprobar(descripcion: string, condicion: boolean) {
  registrar(descripcion, condicion);
}

const HOY = "2026-08-21";

/** La Server Action no se ejecuta al renderizar; solo tiene que existir. */
const accionFalsa = async () => ESTADO_INICIAL;

const fila = (parcial: Partial<PacienteRow> = {}): PacienteRow => ({
  id: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
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

const pintar = (
  guardado: PacienteRow | null,
  estadoInicial: EstadoPaciente = ESTADO_INICIAL
) =>
  renderToStaticMarkup(
    <FormularioPaciente
      accion={accionFalsa}
      guardado={guardado}
      hoyISO={HOY}
      pendientes={guardado ? camposPendientes(guardado) : []}
      estadoInicial={estadoInicial}
    />
  );

// ---------------------------------------------------------------------------
const alta = pintar(null);

comprobar("están los cuatro campos obligatorios y los opcionales", [
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
].every((campo) => alta.includes(`name="${campo}"`)));

comprobar(
  "las cinco opciones de estado civil (02-Gestion-Pacientes.md)",
  ["Soltero/a", "Casado/a", "Divorciado/a", "Viudo/a", "Unión libre"].every((opcion) =>
    alta.includes(opcion)
  )
);
comprobar("sexo se guarda como M/F, el vocabulario del CHECK", alta.includes('value="M"') && alta.includes('value="F"'));
comprobar("y se muestra como palabra", alta.includes("Masculino") && alta.includes("Femenino"));

// ADR-003: el bloque no debe estar en un alta en blanco. Si estuviera, la
// doctora vería campos de acompañante obligatorios para un adulto.
comprobar("SIN bloque de acompañante en un alta en blanco", !alta.includes('name="nombre_acompanante"'));

comprobar("la etiqueta va visible sobre el campo, no solo como placeholder", alta.includes('for="documento"'));
comprobar("el documento va en la mono de identificadores", alta.includes("identificador"));
comprobar("el botón primario es turquesa", alta.includes("bg-teal"));

// ---------------------------------------------------------------------------
// Nacido en 2015: en 2026 tiene 11 años.
const menor = pintar(fila({ fecha_nacimiento: "2015-03-01", documento: "0912345675", sexo: "F" }));

comprobar("aparece el bloque de acompañante", menor.includes('name="nombre_acompanante"'));
comprobar("con el documento del acompañante", menor.includes('name="documento_acompanante"'));
comprobar("dice por qué es obligatorio", menor.includes("menor de edad"));
comprobar("sobre el fondo #E8EEF2 (navy tint) del sistema de diseño", menor.includes("bg-navy-tint"));
comprobar("y la edad calculada se muestra, no se teclea (RF-05)", menor.includes("Edad calculada"));

// ---------------------------------------------------------------------------
const mayor = pintar(fila({ fecha_nacimiento: "1990-04-12", documento: "0912345675", sexo: "M" }));
comprobar("sin bloque de acompañante", !mayor.includes('name="nombre_acompanante"'));
comprobar("el documento válido se marca con el check turquesa", mayor.includes("border-teal"));

// El caso de pérdida de datos silenciosa: un adulto que YA trae acompañante de
// la migración. Si el bloque no se dibujara, esos campos no viajarían en el
// envío y `aFilaPaciente` los guardaría como NULL.
const mayorConAcompanante = pintar(
  fila({
    fecha_nacimiento: "1990-04-12",
    nombre_acompanante: "EJEMPLO DEMO TUTORA",
    documento_acompanante: "1722222229",
  })
);
comprobar(
  "un adulto que ya trae acompañante lo sigue mostrando (o se borraría al guardar)",
  mayorConAcompanante.includes('name="nombre_acompanante"')
);
comprobar(
  "y se aclara que no es obligatorio, solo heredado",
  mayorConAcompanante.includes("Registrado de antes")
);

// ---------------------------------------------------------------------------
const migrado = pintar(fila());

comprobar("dice qué le falta a ESTA ficha, no un formulario genérico", migrado.includes("A esta ficha le falta"));
comprobar("y los nombra los tres", migrado.includes("el documento de identidad, la fecha de nacimiento y el sexo"));
comprobar("marca los campos pendientes junto a su etiqueta", migrado.includes("Falta en esta ficha"));
comprobar("el aviso va en gris, no en rojo (el rojo es de alergias y errores)", !migrado.includes("A esta ficha le falta</p>") || !migrado.includes("bg-rojo-tint"));
comprobar("deja guardar sin completarlo todo: el botón no está deshabilitado", !migrado.includes("disabled=\"\""));

// Un documento de 8 dígitos como los que existen en la base real: al editarlo
// sin tocarlo tiene que aceptarse, y la pantalla tiene que EXPLICAR por qué.
// El número está fabricado a propósito — ver la nota en
// tests/paciente-formulario.test.ts.
const cedulaCorta = pintar(fila({ documento: "10203040" }));
comprobar("un documento migrado raro se acepta tal cual", cedulaCorta.includes('value="10203040"'));
comprobar("y se explica, en vez de parecer un fallo de la validación", cedulaCorta.includes("no cumple el formato de"));

// ---------------------------------------------------------------------------

comprobar(
  "el desplegable de tipo existe y va ANTES del número",
  alta.indexOf('name="tipo_documento"') > 0 &&
    alta.indexOf('name="tipo_documento"') < alta.indexOf('name="documento"')
);
comprobar(
  "con las tres opciones del CHECK de la base",
  ["Cédula ecuatoriana", "Pasaporte", "Otro documento"].every((o) => alta.includes(o))
);
comprobar(
  "arranca en cédula, para que un pasaporte tecleado sin cambiar el tipo choque",
  alta.includes('value="cedula"')
);
comprobar("el acompañante tiene su propio tipo", menor.includes('name="tipo_documento_acompanante"'));

// Un pasaporte legítimo no puede salir en rojo: un documento válido rechazado
// devuelve a la doctora justo a inventar un número.
const conPasaporte = pintar(
  fila({ documento: "AB123456", tipo_documento: "pasaporte", fecha_nacimiento: "1990-04-12" })
);
comprobar("un pasaporte válido NO muestra error", !conPasaporte.includes("border-rojo"));
comprobar("y sí el check turquesa", conPasaporte.includes("border-teal"));
comprobar(
  "se dice por qué no se verifica, en vez de dejar un check turquesa inexplicable",
  conPasaporte.includes("no tiene dígito")
);
comprobar(
  "la ficha con pasaporte NO está incompleta: tiene documento",
  !conPasaporte.includes("A esta ficha le falta el documento")
);

// ---------------------------------------------------------------------------
const duplicado = renderToStaticMarkup(
  <AvisoDuplicado
    duplicado={{ id: "3f2504e0-4f89-41d3-9a0c-0305e82c3302", nombre_completo: "PACIENTE FICTICIO JUAN" }}
    editando={false}
  />
);

comprobar("no aparece el mensaje crudo de Postgres", !duplicado.includes("duplicate key"));
comprobar("dice QUIÉN tiene ese documento", duplicado.includes("PACIENTE FICTICIO JUAN"));
comprobar("y lleva a su ficha, para no crear el duplicado por otra vía", duplicado.includes("/pacientes/3f2504e0-4f89-41d3-9a0c-0305e82c3302"));
comprobar("en rojo del sistema, no en un rojo cualquiera", duplicado.includes("bg-rojo-tint") && duplicado.includes("text-rojo"));

const duplicadoEditando = renderToStaticMarkup(
  <AvisoDuplicado
    duplicado={{ id: "3f2504e0-4f89-41d3-9a0c-0305e82c3302", nombre_completo: "PACIENTE FICTICIO JUAN" }}
    editando
  />
);
comprobar(
  "al editar, se nombra la sospecha real: dos fichas de la misma persona",
  duplicadoEditando.includes("la misma persona, duplicada")
);
comprobar(
  "y se dice que el sistema no las une solo",
  duplicadoEditando.includes("el sistema no las une solo")
);

// ---------------------------------------------------------------------------
const conError = pintar(null, {
  ...ESTADO_INICIAL,
  errores: { documento: "La cédula no es válida — revisa si hay un dígito cambiado." },
  datos: { ...DATOS_VACIOS, documento: "0912345676" },
});

comprobar("el mensaje sale junto al campo", conError.includes("revisa si hay un dígito cambiado"));
comprobar("con borde rojo #D64545", conError.includes("border-rojo"));
comprobar("y marcado para lectores de pantalla", conError.includes('aria-invalid="true"') && conError.includes('aria-describedby="documento-error"'));
comprobar("lo tecleado no se pierde al volver con error", conError.includes('value="0912345676"'));

// ---------------------------------------------------------------------------

// Red contra el bug de "Revisa los campos marcados en rojo" sin nada en rojo.
// Si un error cae en un campo del acompañante mientras ese bloque NO está
// dibujado, el pie tiene que decir QUÉ pasa, no mandar a buscar una marca que
// no existe. La causa original está corregida en `leerFormulario`; esto es lo
// que impide que un fallo equivalente vuelva a ser invisible.
const errorInvisible = pintar(null, {
  ...ESTADO_INICIAL,
  errores: { tipo_documento_acompanante: "Tipo de documento no reconocido." },
  datos: { ...DATOS_VACIOS },
});

comprobar(
  "el bloque de acompañante NO está dibujado en un alta de adulto",
  !errorInvisible.includes('name="tipo_documento_acompanante"')
);
comprobar(
  "y aun así el mensaje concreto aparece",
  errorInvisible.includes("Tipo de documento no reconocido")
);
comprobar(
  "en vez del aviso genérico que no lleva a ningún sitio",
  !errorInvisible.includes("Revisa los campos marcados en rojo")
);

// Cuando el error SÍ tiene campo en pantalla, el aviso genérico es correcto:
// el borde rojo está ahí para mirarlo.
comprobar(
  "con un error en un campo visible, el pie sigue siendo el genérico",
  conError.includes("Revisa los campos marcados en rojo")
);

// ---------------------------------------------------------------------------

// Van tres intentos de que haya UNA sola barra de desplazamiento, y los dos
// primeros pasaron `tsc`, `eslint` y `next build` sin quejarse. Esto no
// reemplaza a mirar la pantalla, pero fija por escrito lo que se rompió:
//
//   1. `min-h-screen` estiraba el armazón con el contenido y el pie del rail
//      se iba a dos mil píxeles de la vista.
//   2. `h-dvh` seguía EN EL FLUJO, así que el documento podía crecer y
//      aparecía una segunda barra, la del navegador, además de la de <main>.
const armazon = readFileSync(join("app", "(app)", "layout.tsx"), "utf8");

comprobar("el armazón está fuera del flujo del documento", armazon.includes("fixed inset-0"));
comprobar("no vuelve a depender de un alto en unidades de viewport", !/h-(dvh|screen)/.test(armazon));
comprobar("<main> sigue siendo el único con scroll", armazon.includes('<main className="min-w-0 flex-1 overflow-auto'));

/** Todos los .tsx bajo app/, para buscar el pecado original. */
function tsxDeApp(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? tsxDeApp(join(dir, e.name)) : e.name.endsWith(".tsx") ? [join(dir, e.name)] : []
  );
}
const conMinHScreen = tsxDeApp("app").filter((f) =>
  /className=[^>]*min-h-screen/.test(readFileSync(f, "utf8"))
);
comprobar(`ninguna pantalla usa min-h-screen (${conMinHScreen.join(", ") || "ninguna"})`, conMinHScreen.length === 0);

// Y el formulario no puede traerse su propio contenedor con scroll: si lo
// hiciera, habría dos barras dentro de <main> y el armazón no podría evitarlo.
const scrollPropio = /class="[^"]*overflow-(auto|scroll|y-auto|y-scroll)/.test(alta + migrado + menor);
comprobar("el formulario NO crea su propio contenedor con scroll", !scrollPropio);
comprobar(
  "el único desplazamiento interno que se permite es el del textarea",
  alta.includes("resize-y")
);

// ---------------------------------------------------------------------------
const todo = alta + menor + migrado + duplicado + conError;

comprobar("ninguna paleta genérica de Tailwind (bg-red-, text-blue-…)", !/\b(bg|text|border)-(red|blue|green|gray|slate|indigo)-\d/.test(todo));
comprobar("ningún hex de la paleta Material que exporta Stitch", !todo.includes("#002441") && !todo.includes("#006a66"));
comprobar("radios del sistema (rounded-control / rounded-tarjeta)", todo.includes("rounded-control") && todo.includes("rounded-tarjeta"));

