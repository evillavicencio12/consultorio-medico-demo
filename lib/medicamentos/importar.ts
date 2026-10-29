/**
 * Importación del catálogo de medicamentos: la lógica, sin dueño.
 *
 * Este archivo es la **única** fuente de verdad de la transposición, la
 * detección de duplicados y la escritura por lotes. Lo usan dos llamadores muy
 * distintos y ninguno de los dos tiene una copia:
 *
 *   - `scripts/import-medicamentos.mjs` — la línea de comandos, con `--dry-run`.
 *   - `lib/medicamentos/acciones.ts`    — la pantalla de Configuración (RF-13).
 *
 * Es el mismo principio que ya se aplicó con `lib/edad.ts` y
 * `lib/texto-plano.ts`: un bug corregido aquí no puede reaparecer por el otro
 * lado, porque no hay otro lado.
 *
 * ## Dos reglas que este archivo NO puede romper
 *
 * 1. **Nada de `server-only`, nada de Next, nada de `@/`.** El script lo importa
 *    desde Node a secas (`node --env-file=.env`, con el borrado de tipos nativo
 *    de Node 24). `server-only` lanza fuera de un bundle de React Server
 *    Components, y Node no sabe resolver el alias `@/`. Los imports de VALOR
 *    van con especificador de paquete o con extensión explícita; los de TIPO
 *    pueden ir sin extensión porque `import type` se borra entero antes de que
 *    Node vea el archivo.
 * 2. **No lee variables de entorno ni crea clientes.** Recibe el cliente de
 *    Supabase ya hecho. Quién es ese cliente —la clave secreta del script o la
 *    de `lib/supabase/admin.ts`— es una decisión de seguridad, y se toma en el
 *    llamador, a la vista, no escondida aquí.
 *
 * Contrato del Sheet: docs/integraciones/Contrato-Sheet-Medicamentos.md
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/tipos";

/** El cliente que hace falta aquí: cualquiera que sepa hablar con la base. */
export type ClienteCatalogo = SupabaseClient<Database>;

/** Una fila de `medicamentos_catalogo`, sin el `id` que pone la base. */
export type MedicamentoAImportar = {
  nombre_generico: string;
  nombre_comercial: string;
};

/** Un nombre comercial que aparece bajo dos principios activos distintos. */
export type Conflicto = {
  nombre_comercial: string;
  generico_conservado: string;
  celda_conservada: string;
  generico_descartado: string;
  celda_descartada: string;
};

/** Lo que se sacó del Sheet, con todo lo que hay que contarle a quien mira. */
export type AnalisisSheet = {
  filasLeidas: number;
  anchoReal: number;
  /**
   * `{ tope }` cuando los datos llegan JUSTO hasta la última columna del rango
   * —la señal de que el rango puede estar recortando el Sheet por la derecha—,
   * y `null` cuando el rango no pone tope o sobra sitio. Ver el aviso de
   * Contrato-Sheet-Medicamentos.md: la primera corrida real dejó 41 principios
   * activos fuera sin que nada fallara.
   */
  rangoRecortado: { rango: string; tope: number } | null;
  /** Columnas con principio activo en la fila 1. */
  columnasConGenerico: number;
  /** De esas, cuántas todavía no tienen ningún comercial debajo. */
  genericosSinComerciales: number;
  /** Columnas con contenido pero SIN encabezado: se omiten enteras. */
  columnasSinEncabezado: number;
  /** Celdas en blanco salteadas. Es normal: el Sheet se llena por partes. */
  celdasVacias: number;
  /** Copias del mismo comercial bajo el mismo genérico. Inofensivas. */
  repetidosMismoGenerico: number;
  /** El mismo comercial bajo genéricos DISTINTOS. Casi siempre, un tipeo. */
  conflictos: Conflicto[];
  /** Lo que se escribiría, ya deduplicado y listo para el `upsert`. */
  aImportar: MedicamentoAImportar[];
};

/**
 * Limpia un nombre tal como viene del Sheet.
 *
 * Tres cosas, y ninguna es cosmética cuando hay un UNIQUE de por medio:
 *
 *   - **NFC.** Un texto pegado en el Sheet desde Word o desde macOS trae los
 *     acentos descompuestos ("Diclofenaco Sódico" puede traer la ó como
 *     o + U+0301). Para Postgres esas son DOS cadenas distintas: el UNIQUE de
 *     `nombre_comercial` no las une, y el catálogo acabaría con el mismo
 *     medicamento dos veces. Es la misma lección que `lib/texto-plano.ts`
 *     documenta para el PDF, por la otra punta.
 *   - **Invisibles fuera.** Espacio de ancho cero, BOM y guion suave viajan
 *     pegados sin verse y crean el mismo falso duplicado.
 *   - **Espacios colapsados.** "Amoxicilina  500" y "Amoxicilina 500" son el
 *     mismo medicamento escrito con un dedo torpe.
 *
 * No se toca la CAJA (mayúsculas/minúsculas): así es como la doctora escribió
 * el nombre y así saldrá impreso en la receta.
 */
export function normalizar(valor: unknown): string {
  if (typeof valor !== "string") return "";
  return valor
    .normalize("NFC")
    .replace(/[\u00ad\u200b-\u200f\u2060-\u2064\ufe00-\ufe0f\ufeff]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * La última columna de un rango de Sheets, como número, o `null` si el rango
 * no pone tope (`MEDICAMENTOS`, `MEDICAMENTOS!A:A` sin fin, etc.).
 *
 * `MEDICAMENTOS!A1:Z` -> 26. Las letras van en base 26: AA es 27.
 */
export function columnaFinalDelRango(rango: string): number | null {
  const final = rango.split("!").pop()?.split(":")[1];
  if (!final) return null;
  const letras = final.replace(/[0-9]/g, "").toUpperCase();
  if (!letras) return null;
  let numero = 0;
  for (const letra of letras) numero = numero * 26 + (letra.charCodeAt(0) - 64);
  return numero;
}

/**
 * El Sheet, tal como lo devuelve la API, convertido en filas de la tabla.
 *
 * **El Sheet está TRASPUESTO respecto a la tabla.** Es una tabla ancha: la fila
 * 1 trae los principios activos como encabezado de columna, y debajo de cada
 * uno cuelgan sus nombres comerciales. La tabla guarda una fila por medicamento
 * comercial. Por eso esto recorre por COLUMNAS, no por filas.
 *
 * No lanza nunca por datos a medias: una columna sin encabezado, un genérico
 * sin comerciales o una celda en blanco se omiten y se cuentan. El Sheet a
 * medio llenar es el estado NORMAL, no un error.
 */
export function analizarSheet(filas: unknown[][], rango: string): AnalisisSheet {
  const encabezados = filas[0] ?? [];
  // La API recorta las celdas vacías del final de cada fila, así que las filas
  // llegan con largos distintos y no se puede confiar en el largo del
  // encabezado: el ancho real es el de la fila más larga.
  const anchoReal = filas.length === 0 ? 0 : Math.max(...filas.map((fila) => fila.length));

  const tope = columnaFinalDelRango(rango);
  const rangoRecortado = tope !== null && anchoReal >= tope ? { rango, tope } : null;

  const registros: (MedicamentoAImportar & { celda: string })[] = [];
  let columnasConGenerico = 0;
  let columnasSinEncabezado = 0;
  let genericosSinComerciales = 0;
  let celdasVacias = 0;

  for (let columna = 0; columna < anchoReal; columna++) {
    const nombreGenerico = normalizar(encabezados[columna]);

    if (!nombreGenerico) {
      // Columna sin principio activo en la fila 1. Si trae algo debajo, no hay
      // forma de saber a qué genérico pertenece: se avisa en vez de inventarlo.
      const tieneContenido = filas.slice(1).some((fila) => normalizar(fila[columna]));
      if (tieneContenido) columnasSinEncabezado++;
      continue;
    }

    columnasConGenerico++;
    let comercialesDeEstaColumna = 0;

    for (let fila = 1; fila < filas.length; fila++) {
      const nombreComercial = normalizar(filas[fila][columna]);
      if (!nombreComercial) {
        celdasVacias++;
        continue;
      }

      registros.push({
        nombre_generico: nombreGenerico,
        nombre_comercial: nombreComercial,
        // Dónde estaba en el Sheet. No se guarda en la base: sirve para que el
        // reporte de duplicados diga "columna 7, fila 12" y se pueda ir a
        // mirarlo, en vez de dejar a alguien buscando un nombre entre cientos.
        celda: `columna ${columna + 1}, fila ${fila + 1}`,
      });
      comercialesDeEstaColumna++;
    }

    if (comercialesDeEstaColumna === 0) genericosSinComerciales++;
  }

  // --- Duplicados: el riesgo que el proyecto anotó desde el principio --------
  //
  // El mismo nombre comercial bajo dos principios activos distintos es casi
  // siempre un error de tipeo en el Sheet, y es exactamente lo que el `upsert`
  // taparía: la segunda aparición pisaría a la primera sin decir nada, y el
  // catálogo quedaría afirmando que un medicamento tiene un principio activo
  // que no tiene. En una receta eso no es un detalle.
  //
  // Se comparan en minúsculas: "Apronax" y "APRONAX" bajo genéricos distintos
  // son el mismo error de tipeo, aunque para el UNIQUE de Postgres sean dos
  // filas diferentes.
  //
  // Además hay una razón técnica para deduplicar ANTES de escribir: un lote de
  // `upsert` con la misma clave repetida hace fallar a Postgres entero
  // ("ON CONFLICT DO UPDATE command cannot affect row a second time").
  const vistos = new Map<string, (typeof registros)[number]>();
  const conflictos: Conflicto[] = [];
  const aImportar: MedicamentoAImportar[] = [];
  let repetidosMismoGenerico = 0;

  for (const registro of registros) {
    const clave = registro.nombre_comercial.toLowerCase();
    const previo = vistos.get(clave);

    if (!previo) {
      vistos.set(clave, registro);
      aImportar.push({
        nombre_generico: registro.nombre_generico,
        nombre_comercial: registro.nombre_comercial,
      });
      continue;
    }

    if (previo.nombre_generico.toLowerCase() === registro.nombre_generico.toLowerCase()) {
      // El mismo medicamento repetido bajo el mismo genérico: inofensivo.
      repetidosMismoGenerico++;
      continue;
    }

    // Se conserva la PRIMERA aparición (la columna más a la izquierda) y se
    // reporta. Elegir por orden es arbitrario, pero es determinista: dos
    // corridas seguidas sobre el mismo Sheet dejan la base igual. Quien decide
    // de verdad es quien corrija el Sheet.
    conflictos.push({
      nombre_comercial: registro.nombre_comercial,
      generico_conservado: previo.nombre_generico,
      celda_conservada: previo.celda,
      generico_descartado: registro.nombre_generico,
      celda_descartada: registro.celda,
    });
  }

  return {
    filasLeidas: filas.length,
    anchoReal,
    rangoRecortado,
    columnasConGenerico,
    genericosSinComerciales,
    columnasSinEncabezado,
    celdasVacias,
    repetidosMismoGenerico,
    conflictos,
    aImportar,
  };
}

/** Qué le pasaría a cada fila del Sheet si se escribiera ahora mismo. */
export type Clasificacion = {
  /** No están todavía en el catálogo: el `upsert` los INSERTA. */
  nuevos: MedicamentoAImportar[];
  /** Ya están, pero con otro principio activo: el `upsert` los ACTUALIZA. */
  cambianGenerico: { nombre_comercial: string; antes: string; despues: string }[];
  /** Ya están exactamente así: el `upsert` los reescribe igual. */
  sinCambio: number;
};

/**
 * Compara lo que trae el Sheet contra lo que ya hay en el catálogo.
 *
 * El script nunca supo decir esto —imprime "importados/actualizados" en un solo
 * número— y es justo la pregunta que uno se hace antes de tocar producción:
 * *¿esto agrega algo, o solo reescribe lo mismo?* Con la vista previa de la
 * pantalla de Configuración esa pregunta pasó a tener que responderse **antes**
 * de escribir, así que vive aquí y la aprovechan los dos llamadores.
 *
 * La comparación del nombre comercial es **exacta**, no en minúsculas, a
 * propósito: quien decide si dos filas son la misma es el UNIQUE de Postgres, y
 * ese distingue caja. Comparar en minúsculas aquí diría "sin cambio" de algo
 * que la base va a insertar como fila nueva.
 */
export function clasificarContraCatalogo(
  aImportar: MedicamentoAImportar[],
  existentes: MedicamentoAImportar[]
): Clasificacion {
  const enBase = new Map(existentes.map((m) => [m.nombre_comercial, m.nombre_generico]));

  const nuevos: MedicamentoAImportar[] = [];
  const cambianGenerico: Clasificacion["cambianGenerico"] = [];
  let sinCambio = 0;

  for (const medicamento of aImportar) {
    const genericoEnBase = enBase.get(medicamento.nombre_comercial);
    if (genericoEnBase === undefined) {
      nuevos.push(medicamento);
    } else if (genericoEnBase !== medicamento.nombre_generico) {
      cambianGenerico.push({
        nombre_comercial: medicamento.nombre_comercial,
        antes: genericoEnBase,
        despues: medicamento.nombre_generico,
      });
    } else {
      sinCambio++;
    }
  }

  return { nuevos, cambianGenerico, sinCambio };
}

/**
 * Huella de lo que se va a escribir. FNV-1a de 32 bits, en hexadecimal.
 *
 * No es criptografía y no pretende serlo: es un número para contestar "¿el
 * Sheet sigue siendo el mismo que viste hace un minuto?". La pantalla lo pide
 * en la vista previa y lo devuelve al confirmar; si no coincide, la escritura
 * se rechaza y se vuelve a previsualizar. Sin esto, "confirmar" escribiría algo
 * que nadie llegó a mirar.
 *
 * Se calcula a mano y no con `node:crypto` porque este módulo tiene que cargar
 * igual en Node y dentro del bundle de Next, sin importar nada.
 */
export function huellaDeImportacion(aImportar: MedicamentoAImportar[]): string {
  let hash = 0x811c9dc5;
  const texto = aImportar
    .map((m) => `${m.nombre_comercial}\u0000${m.nombre_generico}`)
    .join("\u0001");
  for (let i = 0; i < texto.length; i++) {
    hash ^= texto.charCodeAt(i);
    // El equivalente a multiplicar por 16777619 sin salirse de 32 bits.
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${hash.toString(16).padStart(8, "0")}-${aImportar.length}`;
}

/** Filas por `upsert`. Con ~160 medicamentos sobra, pero el Sheet crece. */
export const TAMANO_LOTE = 500;

/** Páginas de 1000 al leer el catálogo: es el tope por defecto de PostgREST. */
const TAMANO_PAGINA = 1000;

/**
 * El catálogo entero, para poder compararlo con el Sheet.
 *
 * Se pagina porque PostgREST corta en 1000 filas por respuesta y no avisa: hoy
 * hay ~162 medicamentos y una sola página basta, pero el Sheet no deja de
 * crecer y el día que pase de mil, un catálogo comparado a medias reportaría
 * como "nuevos" cientos de medicamentos que ya están.
 */
export async function leerCatalogoExistente(
  supabase: ClienteCatalogo
): Promise<MedicamentoAImportar[]> {
  const todos: MedicamentoAImportar[] = [];

  for (let desde = 0; ; desde += TAMANO_PAGINA) {
    const { data, error } = await supabase
      .from("medicamentos_catalogo")
      .select("nombre_generico, nombre_comercial")
      .order("nombre_comercial")
      .range(desde, desde + TAMANO_PAGINA - 1);

    if (error) throw new Error(error.message);
    const pagina = data ?? [];
    todos.push(...pagina);
    if (pagina.length < TAMANO_PAGINA) return todos;
  }
}

/** Cuántas filas tiene el catálogo ahora mismo, o `null` si no se pudo contar. */
export async function contarCatalogo(supabase: ClienteCatalogo): Promise<number | null> {
  const { count } = await supabase
    .from("medicamentos_catalogo")
    .select("*", { count: "exact", head: true });
  return count ?? null;
}

export type ResultadoEscritura =
  | { ok: true; escritos: number }
  | { ok: false; escritos: number; lote: number; mensaje: string };

/**
 * Escribe el catálogo. `upsert` sobre `nombre_comercial`, en lotes.
 *
 * `onConflict: "nombre_comercial"` apunta al UNIQUE del esquema
 * (`medicamentos_catalogo_nombre_comercial_key`): si el comercial ya existe se
 * actualiza su genérico, y si es nuevo se agrega. Nada que limpiar antes, y
 * **correrlo mil veces deja lo mismo que correrlo una vez** — al revés que la
 * importación de pacientes, que hace `insert` a secas y costó 82 duplicados
 *.
 *
 * No hay transacción: PostgREST no la da entre llamadas. Si revienta el lote 3
 * de 5, los dos primeros quedaron escritos — y da igual, porque volver a correr
 * la importación entera es inofensivo. Esa es la propiedad que hace que esto se
 * pueda ofrecer como un botón.
 */
export async function escribirCatalogo(
  supabase: ClienteCatalogo,
  aImportar: MedicamentoAImportar[],
  alAvanzar?: (escritos: number, total: number) => void
): Promise<ResultadoEscritura> {
  let escritos = 0;

  for (let i = 0; i < aImportar.length; i += TAMANO_LOTE) {
    const lote = aImportar.slice(i, i + TAMANO_LOTE);
    const { error } = await supabase
      .from("medicamentos_catalogo")
      .upsert(lote, { onConflict: "nombre_comercial" });

    if (error) {
      return {
        ok: false,
        escritos,
        lote: Math.floor(i / TAMANO_LOTE) + 1,
        mensaje: error.message,
      };
    }

    escritos += lote.length;
    alAvanzar?.(escritos, aImportar.length);
  }

  return { ok: true, escritos };
}
