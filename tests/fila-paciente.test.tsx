// Renderiza de verdad la tarjeta del listado (app/(app)/pacientes/fila.tsx) y
// mira el HTML que sale. Sin navegador, sin sesión y sin base de datos.
//
// Existe por un motivo muy concreto: **la etiqueta roja de alergia (RF-07) no
// se puede comprobar con los datos reales**. `alergia_actual` está vacío en los
// 164 pacientes, porque el campo se alimenta desde la consulta
// (docs/modulos/02-Gestion-Pacientes.md) y todavía no hay ninguna consulta
// registrada. Abrir la pantalla en el navegador demuestra que el listado
// funciona; no demuestra que la etiqueta aparezca cuando toque. Esto sí.
//
// De paso fija los colores exigidos por Sistema-de-Diseno.md: si alguien
// sustituye `bg-rojo-tint`/`text-rojo` por una clase genérica de Tailwind
// (`bg-red-100`), esta prueba lo caza.
//
//   npm run test:fila
import { renderToStaticMarkup } from "react-dom/server";
import { FilaPaciente, SinResultados } from "../app/(app)/pacientes/fila";
import type { PacienteListado } from "../lib/pacientes/consulta";
import { registrar } from "./ayudas";


function comprobar(descripcion: string, condicion: boolean) {
  registrar(descripcion, condicion);
}

const HOY = new Date("2026-08-20T12:00:00Z");

const pintar = (paciente: PacienteListado) =>
  renderToStaticMarkup(<FilaPaciente paciente={paciente} hoy={HOY} />);

const COMPLETO: PacienteListado = {
  id: "1",
  nombre_completo: "EJEMPLO DEMO ANA LUCIA",
  documento: "0923456701",
  tipo_documento: "cedula" as const,
  fecha_nacimiento: "1992-03-10",
  alergia_actual: null,
};

// ---------------------------------------------------------------------------
const completo = pintar(COMPLETO);

comprobar("sale el nombre tal cual está guardado", completo.includes("EJEMPLO DEMO ANA LUCIA"));
// La cédula sale con el verificador separado, igual que en la ficha: es como
// se lee en voz alta al confirmarla con el paciente. La búsqueda normaliza, así
// que teclear los diez dígitos seguidos la sigue encontrando.
comprobar("sale la cédula, con el verificador separado", completo.includes("092345670-1"));
comprobar("la cédula va en la mono de identificadores", /class="identificador[^"]*"[^>]*>092345670-1/.test(completo));
comprobar("sale la edad calculada", completo.includes("34 años"));
comprobar("iniciales en el avatar", completo.includes(">ED<"));
comprobar("SIN etiqueta de alergia", !completo.includes("Alergia"));
comprobar("SIN etiqueta de ficha incompleta", !completo.includes("Ficha incompleta"));
comprobar("no aparece ningún rojo", !completo.includes("rojo"));

// ---------------------------------------------------------------------------
const conAlergia = pintar({ ...COMPLETO, alergia_actual: "Penicilina, AINEs" });

comprobar("aparece la etiqueta", conAlergia.includes("Alergia"));
// Los tokens exactos de Sistema-de-Diseno.md: #D64545 sobre #FBEAEA.
comprobar("fondo rojo-tint (#FBEAEA)", conAlergia.includes("bg-rojo-tint"));
comprobar("texto rojo (#D64545)", conAlergia.includes("text-rojo"));
comprobar("con el ícono de alerta de Lucide", conAlergia.includes("lucide-circle-alert"));
comprobar("la alergia concreta se lee al pasar el cursor", conAlergia.includes('title="Penicilina, AINEs"'));

comprobar("una cadena vacía NO enciende la etiqueta", !pintar({ ...COMPLETO, alergia_actual: "" }).includes("Alergia"));
comprobar("solo espacios tampoco", !pintar({ ...COMPLETO, alergia_actual: "   " }).includes("Alergia"));

// ---------------------------------------------------------------------------
const sinDocumento = pintar({ ...COMPLETO, documento: null });

comprobar("dice 'Sin documento', no deja el hueco", sinDocumento.includes("Sin documento"));
comprobar("y NO en la mono de identificadores", !/identificador[^"]*"[^>]*>Sin documento/.test(sinDocumento));
comprobar("marca la ficha como incompleta", sinDocumento.includes("Ficha incompleta"));
// El rojo está reservado a alergias y errores de validación: una ficha a medio
// llenar es una tarea pendiente, no una alerta clínica.
comprobar("la marca de incompleta NO usa el rojo", !sinDocumento.includes("text-rojo"));

const sinFecha = pintar({ ...COMPLETO, fecha_nacimiento: null });
comprobar("dice 'Edad no registrada'", sinFecha.includes("Edad no registrada"));
comprobar("no inventa la edad de 1970 (56 años)", !sinFecha.includes("56 años"));
comprobar("y también cuenta como incompleta", sinFecha.includes("Ficha incompleta"));

const migrado = pintar({ ...COMPLETO, documento: null, fecha_nacimiento: null, alergia_actual: "Sulfas" });
comprobar("faltando las dos, se dicen las dos", migrado.includes("Sin documento") && migrado.includes("Edad no registrada"));
comprobar("una sola marca de incompleta, no dos", migrado.split("Ficha incompleta").length - 1 === 1);
comprobar("y la alergia sigue saliendo encima", migrado.includes("bg-rojo-tint"));

// ---------------------------------------------------------------------------
// La distinción que hay que no perder: "sin documento" son los 83 de la
// migración; "con pasaporte" es una ficha COMPLETA con otro tipo de documento.
// Meterlas en la misma etiqueta enterraría a las que de verdad hay que
// completar entre fichas que ya están bien.
const conPasaporte = pintar({ ...COMPLETO, documento: "AB123456", tipo_documento: "pasaporte" });

comprobar("sale el número del pasaporte", conPasaporte.includes("AB123456"));
comprobar("sin partirlo: debe coincidir con el documento", !conPasaporte.includes("AB12345-6"));
comprobar("con su tipo delante, porque no es lo que se da por supuesto", conPasaporte.includes("Pasaporte"));
comprobar("y NO se marca como ficha incompleta", !conPasaporte.includes("Ficha incompleta"));
comprobar("sigue en la mono de identificadores", /class="identificador[^"]*"[^>]*>AB123456/.test(conPasaporte));
comprobar("una cédula, en cambio, no lleva prefijo: sería ruido en 164 filas", !completo.includes(">Cédula<"));

// ---------------------------------------------------------------------------
const nadaBuscado = renderToStaticMarkup(<SinResultados busqueda="" soloIncompletas={false} />);
const nadaEncontrado = renderToStaticMarkup(<SinResultados busqueda="zzz" soloIncompletas={false} />);
const nadaConFiltro = renderToStaticMarkup(<SinResultados busqueda="zzz" soloIncompletas />);

comprobar("sin búsqueda invita a registrar", nadaBuscado.includes("No hay pacientes que mostrar"));
comprobar("sin coincidencias lo dice", nadaEncontrado.includes("Ningún paciente coincide"));
comprobar("y sugiere buscar por cédula", nadaEncontrado.includes("últimos dígitos"));
comprobar("con el filtro puesto, sugiere quitarlo", nadaConFiltro.includes("quita el filtro"));

