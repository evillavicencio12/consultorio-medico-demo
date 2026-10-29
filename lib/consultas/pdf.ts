/**
 * El puente entre las FILAS de la base y el contrato de entrada del módulo de
 * PDF.
 *
 * Existe como módulo propio porque `lib/pdf/types.ts` dice de sí mismo, con
 * todas las letras, que **no es el espejo de las filas** sino un subconjunto:
 * nombres en camelCase, campos que la base tiene y el PDF no imprime, y uno
 * —`esMenorDeEdad`— que no es columna de nada porque se calcula. Sin este
 * archivo, esa conversión se repetiría en cada pantalla que genere un PDF, y la
 * Fase 4 va a ser la segunda.
 *
 * Lógica pura: ni React, ni Supabase, ni pdf-lib. Se puede comprobar sin nada.
 */

import { esMenorDeEdad } from "@/lib/edad";
import type { Consulta, Paciente, RecetaMedicamento } from "@/lib/pdf";
import type { ConsultaRow, PacienteRow, RecetaMedicamentoRow } from "@/lib/supabase/tipos";

/**
 * `hoy` se inyecta en lugar de llamar a `new Date()` aquí dentro: la mayoría de
 * edad se calcula contra una fecha concreta y la conversión tiene que ser
 * determinista para poder comprobarla.
 */
export function pacienteParaPdf(fila: PacienteRow, hoy: Date): Paciente {
  return {
    id: fila.id,
    nombreCompleto: fila.nombre_completo,
    documento: fila.documento,
    fechaNacimiento: fila.fecha_nacimiento,
    sexo: fila.sexo,
    estadoCivil: fila.estado_civil,
    telefono: fila.telefono,
    correo: fila.correo,
    domicilio: fila.domicilio,
    ocupacion: fila.ocupacion,
    antecedentesHeredoFamiliares: fila.antecedentes_heredofamiliares,
    alergiaActual: fila.alergia_actual,
    // ADR-003. Con `fecha_nacimiento` en NULL devuelve `false`, igual que el
    // CHECK de la base: sin fecha no se puede afirmar que sea menor.
    esMenorDeEdad: esMenorDeEdad(fila.fecha_nacimiento, hoy),
    nombreAcompanante: fila.nombre_acompanante,
    documentoAcompanante: fila.documento_acompanante,
    fechaCreacion: fila.created_at,
  };
}

export function consultaParaPdf(fila: ConsultaRow): Consulta {
  return {
    id: fila.id,
    pacienteId: fila.paciente_id,
    fecha: fila.fecha,
    motivoConsulta: fila.motivo_consulta,
    alergias: fila.alergias,
    patologias: fila.patologias,
    quirurgicos: fila.quirurgicos,
    transfusionales: fila.transfusionales,
    // Los cuatro numéricos llegan como `number | null` desde la base y así se
    // pasan: la unidad se pega al imprimir (`65 kg`), no se guarda con el dato.
    // Ver 06-Generador-PDF.md, "Unidades de los signos vitales".
    exploracionFisica: {
      pa: fila.pa,
      fc: fila.fc,
      fr: fila.fr,
      temperatura: fila.temperatura,
      peso: fila.peso,
    },
    impresionDiagnostica: fila.impresion_diagnostica,
    codigoCie10: fila.cie10_codigo,
    tratamiento: fila.tratamiento,
    signosAlarma: fila.signos_alarma,
    recomendacionesNoFarmacologicas: fila.recomendaciones_no_farmacologicas,
    numeroReceta: fila.numero_receta,
  };
}

export function medicamentoParaPdf(fila: RecetaMedicamentoRow): RecetaMedicamento {
  return {
    id: fila.id,
    consultaId: fila.consulta_id,
    nombreGenerico: fila.nombre_generico,
    nombreComercial: fila.nombre_comercial,
    presentacion: fila.presentacion,
    viaAdministracion: fila.via_administracion,
    cantidad: fila.cantidad,
    dosis: fila.dosis,
    frecuencia: fila.frecuencia,
    duracion: fila.duracion,
  };
}
