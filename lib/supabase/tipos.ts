/**
 * Tipos de las tablas de Supabase.
 *
 * > **Son `type` y no `interface`, y eso NO es estilo.** postgrest-js exige que
 * > cada fila encaje en `Record<string, unknown>`. Un `interface` nunca encaja:
 * > TypeScript le da firma de índice implícita a un alias de tipo, pero no a
 * > una interfaz, porque una interfaz puede ampliarse después desde otro
 * > archivo. Con interfaces, `Database['public']` deja de ser un `GenericSchema`
 * > y `.insert()` / `.update()` pasan a recibir `never` — o sea que TypeScript
 * > rechaza cualquier fila que se les pase. `select()` seguía compilando, así
 * > que el problema salió a la luz con la primera escritura (Fase 2, sesión B).
 *
 * Escritos a mano contra el esquema real de `supabase/migrations/`, no
 * generados: generarlos exige el CLI de Supabase y un token de cuenta vigente,
 * y el token se revoca al terminar cada tarea. Si algún día se generan con
 * `supabase gen types typescript`, este archivo se reemplaza por esa salida.
 *
 * Mantener en sincronía con las migraciones. La verificación de que el esquema
 * es el esperado ya existe: `node scripts/verificar-migraciones.mjs`.
 */
import type { Presentacion, ViaAdministracion } from "@/lib/pdf/vocabulario";
import type { TipoDocumento } from "@/lib/pacientes/documento";

/** Columnas con DEFAULT en la base: opcionales al insertar. */
type ConDefault = "id" | "created_at";

export type PacienteRow = {
  id: string;
  /**
   * El NÚMERO del documento, sea del tipo que sea. Se llamaba `cedula` hasta
   * `20260821120000_tipo_documento.sql`: una columna con ese nombre que guarda
   * pasaportes es una mentira, y este proyecto ya sabe lo que cuestan.
   * Va siempre en pareja con `tipo_documento`.
   */
  documento: string | null;
  /** CHECK en la base; el vocabulario vive en lib/pacientes/documento.ts. */
  tipo_documento: TipoDocumento;
  nombre_completo: string;
  fecha_nacimiento: string | null;
  sexo: "M" | "F" | null;
  telefono: string | null;
  correo: string | null;
  domicilio: string | null;
  ocupacion: string | null;
  antecedentes_heredofamiliares: string | null;
  alergia_actual: string | null;
  nombre_acompanante: string | null;
  documento_acompanante: string | null;
  tipo_documento_acompanante: TipoDocumento;
  correo_acompanante: string | null;
  telefono_acompanante: string | null;
  created_at: string;
  estado_civil: string | null;
}

export type ConsultaRow = {
  id: string;
  paciente_id: string;
  fecha: string;
  motivo_consulta: string | null;
  alergias: string | null;
  patologias: string | null;
  quirurgicos: string | null;
  pa: string | null;
  fc: number | null;
  fr: number | null;
  temperatura: number | null;
  peso: number | null;
  impresion_diagnostica: string | null;
  cie10_codigo: string | null;
  tratamiento: string | null;
  signos_alarma: string | null;
  recomendaciones_no_farmacologicas: string | null;
  /**
   * Correlativo GLOBAL de la receta (ADR-002), o `null` si esta consulta no
   * llevó receta.
   *
   * `null` desde `20260822120000_numero_receta_opcional.sql`: una consulta sin
   * medicamentos —un control, una revisión— ya no consume un número que después
   * no aparecería en ningún papel. Al insertar, OMITIR la columna significa
   * "asígname número" (dispara el DEFAULT `nextval`); pasar `null` explícito
   * significa "esta consulta no lleva receta".
   */
  numero_receta: number | null;
  created_at: string;
  transfusionales: string | null;
}

export type RecetaMedicamentoRow = {
  id: string;
  consulta_id: string;
  nombre_generico: string;
  nombre_comercial: string;
  /** CHECK en la base; el vocabulario vive en lib/pdf/vocabulario.ts. */
  presentacion: Presentacion;
  cantidad: number;
  dosis: string;
  via_administracion: ViaAdministracion;
  frecuencia: string;
  duracion: string;
}

export type MedicamentoCatalogoRow = {
  id: string;
  nombre_generico: string;
  nombre_comercial: string;
}

export type Cie10CatalogoRow = {
  /** El código ES la clave primaria; no hay uuid. */
  codigo: string;
  descripcion: string;
}

/**
 * Forma que espera `createBrowserClient<Database>` / `createServerClient<Database>`.
 * `numero_receta` es opcional al insertar: lo pone el DEFAULT de la secuencia.
 *
 * **`Relationships` no es decorativo aunque siempre esté vacío.** postgrest-js
 * exige esa clave para reconocer una tabla (`GenericTable`); sin ella el tipo
 * de la tabla no encaja, `.insert()` y `.update()` reciben `never` y TypeScript
 * rechaza cualquier fila que se les pase. Con `select()` no se notaba, así que
 * el hueco sobrevivió hasta la primera escritura. Va vacío porque estas
 * consultas no usan joins embebidos de PostgREST; el día que se necesite
 * `select('*, consultas(*)')` habrá que declarar la FK aquí.
 */
export type Database = {
  public: {
    Tables: {
      pacientes: {
        Row: PacienteRow;
        Insert: Omit<PacienteRow, ConDefault> & Partial<Pick<PacienteRow, ConDefault>>;
        Update: Partial<PacienteRow>;
        Relationships: [];
      };
      consultas: {
        Row: ConsultaRow;
        Insert: Omit<ConsultaRow, ConDefault | "fecha" | "numero_receta"> &
          Partial<Pick<ConsultaRow, ConDefault | "fecha" | "numero_receta">>;
        Update: Partial<ConsultaRow>;
        Relationships: [];
      };
      receta_medicamentos: {
        Row: RecetaMedicamentoRow;
        Insert: Omit<RecetaMedicamentoRow, "id"> & Partial<Pick<RecetaMedicamentoRow, "id">>;
        Update: Partial<RecetaMedicamentoRow>;
        Relationships: [];
      };
      medicamentos_catalogo: {
        Row: MedicamentoCatalogoRow;
        Insert: Omit<MedicamentoCatalogoRow, "id"> & Partial<Pick<MedicamentoCatalogoRow, "id">>;
        Update: Partial<MedicamentoCatalogoRow>;
        Relationships: [];
      };
      cie10_catalogo: {
        Row: Cie10CatalogoRow;
        Insert: Cie10CatalogoRow;
        Update: Partial<Cie10CatalogoRow>;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
}
