"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { clienteConSesion, SESION_CADUCADA, type ClienteServidor } from "@/lib/supabase/sesion";
import type { PacienteRow } from "@/lib/supabase/tipos";
import { hoyEnEcuador } from "@/lib/fechas";
import {
  aFilaPaciente,
  leerFormulario,
  sinErrores,
  validarPaciente,
  type EstadoPaciente,
  type FilaPacienteEscribible,
} from "./formulario";

/**
 * Alta y edición de pacientes (RF-03, RF-04, RF-05 y tarea 2.3).
 *
 * **Es la primera vez que esta aplicación ESCRIBE en producción.** Hasta la
 * sesión anterior todo era lectura, así que aquí es donde importan las dos
 * reglas que hasta ahora no habían tenido consecuencia:
 *
 *  1. Se usa `lib/supabase/server.ts`, o sea la clave publicable con la sesión
 *     de la doctora. **RLS aplica también al INSERT y al UPDATE**: la política
 *     `FOR ALL` de `20260820120400_rls_y_grants.sql` tiene `WITH CHECK`, que es
 *     la mitad que valida lo que se escribe. Con `admin.ts` la escritura
 *     pasaría por encima de todo eso.
 *  2. Se valida en el servidor aunque el formulario ya haya validado en el
 *     navegador. Un `<form>` llega hasta aquí sin ejecutar el JavaScript de la
 *     pantalla, así que la validación del cliente es comodidad, no defensa
 *     (Seguridad-OWASP.md).
 */

/** Código SQLSTATE de `unique_violation`. */
const UNIQUE_VIOLATION = "23505";

const ERROR_GENERICO =
  "No se pudo guardar. Revisa la conexión e inténtalo otra vez; si vuelve a fallar, avisa a soporte.";


/**
 * Busca a quién pertenece un documento.
 *
 * Se consulta ANTES de escribir, en vez de dejar que reviente el UNIQUE y
 * traducir el error después. Con una sola usuaria no hay carrera que temer, y a
 * cambio el mensaje sale siempre igual de bueno. El `catch` del 23505 se
 * mantiene igual, como red: si algún día hay dos pestañas abiertas, el error
 * crudo tampoco debe llegar a la pantalla.
 */
async function duenoDelDocumento(
  supabase: ClienteServidor,
  fila: Pick<FilaPacienteEscribible, "documento" | "tipo_documento">,
  excluirId?: string
): Promise<{ id: string; nombre_completo: string } | null> {
  // Se consulta por el PAR, igual que el UNIQUE `pacientes_documento_key`.
  // Buscar solo por número daría un falso duplicado el día que un pasaporte
  // extranjero coincida carácter por carácter con la cédula de otro paciente:
  // dos personas distintas con el mismo número en documentos distintos.
  let consulta = supabase
    .from("pacientes")
    .select("id, nombre_completo")
    .eq("tipo_documento", fila.tipo_documento)
    .eq("documento", fila.documento as string)
    .limit(1);

  // En la edición, chocar consigo mismo no es un duplicado.
  if (excluirId) consulta = consulta.neq("id", excluirId);

  const { data } = await consulta;
  return data?.[0] ?? null;
}

function esUniqueDeDocumento(error: { code?: string; message?: string } | null): boolean {
  return error?.code === UNIQUE_VIOLATION && (error.message ?? "").includes("documento");
}

/**
 * Registra un paciente nuevo (RF-03).
 *
 * Nada de "guardar lo que se pueda": si algo no valida, no se escribe nada y se
 * devuelve lo tecleado para que la doctora corrija sin volver a llenar el
 * formulario.
 */
export async function crearPaciente(
  _estadoPrevio: EstadoPaciente,
  formData: FormData
): Promise<EstadoPaciente> {
  const datos = leerFormulario(formData);

  // La sesión se verifica AQUÍ, antes de leer o escribir nada: proxy.ts protege
  // rutas, no acciones (docs/arquitectura/Seguridad-OWASP.md).
  const supabase = await clienteConSesion();
  if (!supabase) return { errores: {}, mensaje: SESION_CADUCADA, duplicado: null, datos };

  // El día de Ecuador, no el del proceso (en Vercel, UTC): decide ADR-003.
  const hoy = hoyEnEcuador();

  const errores = validarPaciente(datos, { guardado: null, hoy });
  if (!sinErrores(errores)) return { errores, mensaje: null, duplicado: null, datos };

  const fila = aFilaPaciente(datos);

  if (fila.documento) {
    const dueno = await duenoDelDocumento(supabase, fila);
    if (dueno) return { errores: {}, mensaje: null, duplicado: dueno, datos };
  }

  // `alergia_actual: null` explícito: la columna no está en el formulario
  // (la alimenta la consulta) pero el tipo de INSERT la exige. NULL es
  // además el estado correcto de un paciente recién registrado — "sin
  // alergia REGISTRADA", que no es lo mismo que "sin alergias".
  const { data, error } = await supabase
    .from("pacientes")
    .insert({ ...fila, alergia_actual: null })
    .select("id")
    .single();

  if (error) {
    if (esUniqueDeDocumento(error) && fila.documento) {
      const dueno = await duenoDelDocumento(supabase, fila);
      if (dueno) return { errores: {}, mensaje: null, duplicado: dueno, datos };
    }
    console.error("[pacientes] fallo al crear:", error);
    return { errores: {}, mensaje: ERROR_GENERICO, duplicado: null, datos };
  }

  // El listado es un Server Component con caché de router: sin esto, el
  // paciente recién creado no aparecería hasta recargar a mano.
  revalidatePath("/pacientes");
  // A la ficha y no al listado: lo siguiente que se hace con un paciente recién
  // registrado es mirarlo, no buscarlo entre otros 164.
  redirect(`/pacientes/${data.id}?nuevo=1`);
}

/**
 * Actualiza un paciente (tarea 2.3) — el único mecanismo que tiene el sistema
 * para cerrar la deuda de la migración: 164 sin sexo, 83 sin documento, 29 sin
 * fecha de nacimiento.
 *
 * Se lee la fila guardada antes de validar, y no es un lujo: de ella salen las
 * dos concesiones a los datos migrados —qué documento se acepta sin examinar
 * (en la base hay al menos uno de 8 dígitos) y qué campos pueden seguir vacíos.
 *
 * El número real NO se escribe aquí: es un dato identificable de un paciente y
 * el repositorio no es sitio para eso (CLAUDE.md). Las pruebas usan uno
 * fabricado con la misma forma.
 */
export async function actualizarPaciente(
  id: string,
  _estadoPrevio: EstadoPaciente,
  formData: FormData
): Promise<EstadoPaciente> {
  const datos = leerFormulario(formData);
  const supabase = await clienteConSesion();
  if (!supabase) return { errores: {}, mensaje: SESION_CADUCADA, duplicado: null, datos };

  const hoy = hoyEnEcuador();

  const { data: guardado, error: errorLectura } = await supabase
    .from("pacientes")
    .select("*")
    .eq("id", id)
    .single<PacienteRow>();

  if (errorLectura || !guardado) {
    return {
      errores: {},
      mensaje: "No se encontró el paciente. Puede que se haya eliminado desde otra pantalla.",
      duplicado: null,
      datos,
    };
  }

  const errores = validarPaciente(datos, { guardado, hoy });
  if (!sinErrores(errores)) return { errores, mensaje: null, duplicado: null, datos };

  const fila = aFilaPaciente(datos);

  // El caso que el enunciado de la sesión pedía resolver: se le agrega
  // documento a uno de los 83 que no lo tenían y ese documento ya es de otro
  // paciente. No es
  // "dato repetido", es la señal más fuerte que da esta base de que las dos
  // fichas son la MISMA persona, duplicada por la importación doble o por una
  // búsqueda que no encontró a quien sí estaba.
  //
  // No se fusiona automáticamente. Fusionar significa decidir qué nombre queda,
  // qué fecha de nacimiento gana y a qué ficha se mudan las consultas, y eso lo
  // decide la doctora mirando las dos, no una heurística. Lo que sí hace el
  // sistema es no dejarla a ciegas: le dice quién es el otro y la lleva ahí.
  if (fila.documento) {
    const dueno = await duenoDelDocumento(supabase, fila, id);
    if (dueno) return { errores: {}, mensaje: null, duplicado: dueno, datos };
  }

  // Sin `alergia_actual` a propósito: un UPDATE que la incluyera en null
  // borraría la alergia del paciente cada vez que se corrige un teléfono.
  const { error } = await supabase.from("pacientes").update(fila).eq("id", id);

  if (error) {
    if (esUniqueDeDocumento(error) && fila.documento) {
      const dueno = await duenoDelDocumento(supabase, fila, id);
      if (dueno) return { errores: {}, mensaje: null, duplicado: dueno, datos };
    }
    console.error("[pacientes] fallo al actualizar:", error);
    return { errores: {}, mensaje: ERROR_GENERICO, duplicado: null, datos };
  }

  revalidatePath("/pacientes");
  revalidatePath(`/pacientes/${id}`);
  redirect(`/pacientes/${id}?guardado=1`);
}
