// Contrato de ENTRADA del módulo de PDF: lo que `generateHistorialPdf` y
// `generateRecetaPdf` necesitan para imprimir. No es el espejo de las filas de
// la base — es un subconjunto.
//
// Antes este archivo se anunciaba como "espejo de Modelo-de-Datos.md", y esa
// promesa creaba divergencias fantasma: `pacientes.correo_acompanante` y
// `pacientes.telefono_acompanante` existen en la base y no aparecen aquí, lo
// que parecía un olvido cuando en realidad el PDF no los imprime. Los tipos de
// fila completos, cuando haga falta persistir, van en su propio módulo.
//
// Donde SÍ describe algo que la base también guarda, los tipos coinciden con
// el esquema real (`supabase/migrations/`): mismo tipo, misma nulabilidad y,
// en los dropdowns, el mismo vocabulario cerrado.

import type { Presentacion, ViaAdministracion } from "./vocabulario";

export interface Paciente {
  id: string;
  nombreCompleto: string;
  // El NÚMERO del documento, del tipo que sea. La columna de la base se llama
  // `documento` desde 20260821120000_tipo_documento.sql, y aquí el nombre lo
  // sigue: este contrato no imprime nada con él —ninguna de las dos plantillas
  // físicas tiene un campo de documento, comprobado con
  // scripts/extract-text-positions.mjs—, así que no hay una etiqueta impresa
  // que obligue a llamarlo de otra manera.
  //
  // NO se trae `tipoDocumento`: sin nada que dibujar, agregarlo sería un campo
  // que todos los llamadores tendrían que rellenar para nada. El día que una
  // plantilla nueva imprima el documento habrá que traerlo, porque "Pasaporte
  // AB123456" y "Cédula AB123456" no son lo mismo en un papel que firma un
  // médico.
  //
  // ADR-006: `documento`, `fechaNacimiento` y `sexo` perdieron su NOT NULL para
  // permitir la importación histórica del Sheet (RF-02), así que vienen
  // ausentes en parte de la base. Supabase los entrega como `null` — nunca
  // como cadena vacía (verificado contra la base real: de 164 pacientes
  // migrados, 83 sin documento, 29 sin fecha de nacimiento y 164 sin sexo, ya
  // que el Sheet de origen no tenía esa columna). Declararlos `string` a
  // secas hacía que el PDF imprimiera edades inventadas; ver ./edad.
  // Esto NO relaja el formulario de alta, que sigue exigiéndolos (ADR-006).
  documento: string | null;
  fechaNacimiento: string | null; // ISO 8601
  sexo: "M" | "F" | null;
  estadoCivil?: string | null;
  telefono?: string | null;
  correo?: string | null;
  domicilio?: string | null;
  ocupacion?: string | null;
  antecedentesHeredoFamiliares?: string | null;
  alergiaActual?: string | null;
  esMenorDeEdad: boolean;
  nombreAcompanante?: string | null;
  documentoAcompanante?: string | null;
  // Fecha en que se creó el REGISTRO en la base, nada más. No es la fecha de
  // la primera consulta del paciente: para los importados en bloque desde el
  // Sheet (RF-02) es el día de la migración. Por eso el PDF del historial NO
  // la usa como "Fecha de Elaboración" — recibe esa fecha aparte, calculada
  // desde las consultas reales (ver ./historial y 03-Historial-Clinico.md).
  fechaCreacion: string; // ISO 8601
}

export interface ExploracionFisica {
  // `pa` es texto de verdad: se anota "120/80", que no es un número. La base
  // también la guarda como `text`.
  pa?: string | null;

  // Los otros cuatro son mediciones, y la base los guarda como `numeric`. Antes
  // estaban declarados `string`, lo que invitaba a lo que hacía el propio
  // smoke test: pasar `peso: "65 kg"` — un valor que la base rechaza, porque la
  // unidad no es parte de la medición. La unidad pertenece a la etiqueta
  // impresa, no al dato.
  fc?: number | null;
  fr?: number | null;
  temperatura?: number | null;
  peso?: number | null;
}

export interface Consulta {
  id: string;
  pacienteId: string;
  fecha: string; // ISO 8601, fecha de la consulta
  motivoConsulta?: string | null;
  alergias?: string | null;
  patologias?: string | null;
  quirurgicos?: string | null;
  transfusionales?: string | null;
  exploracionFisica: ExploracionFisica;
  impresionDiagnostica?: string | null;
  codigoCie10?: string | null;
  tratamiento?: string | null;
  signosAlarma?: string | null;
  recomendacionesNoFarmacologicas?: string | null;
  numeroReceta?: number | null; // correlativo global, ver ADR-002
}

/**
 * Un renglón de medicamento de la receta.
 *
 * TODOS los campos son obligatorios, igual que en la base (`NOT NULL` en
 * `receta_medicamentos`). No es una restricción heredada por inercia: una
 * receta es un documento legal que ejecuta un farmacéutico, y un renglón sin
 * dosis, sin vía o sin duración no se puede despachar. Antes estaban
 * declarados opcionales aquí, así que el PDF los imprimía en blanco en vez de
 * que alguien lo notara al guardar.
 */
export interface RecetaMedicamento {
  id: string;
  consultaId: string;
  nombreGenerico: string;
  nombreComercial: string;

  // Vocabulario cerrado, el mismo que fija el CHECK de la base. Se guarda el
  // slug (`solucion_inyectable`) y se IMPRIME la etiqueta (`solución
  // inyectable`) — ver ./vocabulario.
  presentacion: Presentacion;
  viaAdministracion: ViaAdministracion;

  // Entero positivo: la base es `integer NOT NULL CHECK (cantidad > 0)`.
  // No admite texto ni 0 — "medio frasco" se expresa en la dosis.
  cantidad: number;

  dosis: string;
  frecuencia: string;
  duracion: string;
}
