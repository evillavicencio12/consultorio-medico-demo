/**
 * Lectura del Sheet de medicamentos. La otra mitad compartida entre el script
 * y la pantalla de Configuración.
 *
 * Igual que `./importar.ts`, esto lo cargan dos runtimes distintos: Node a
 * secas (`node --env-file=.env scripts/import-medicamentos.mjs`) y el servidor
 * de Next. De ahí las mismas reglas: imports de valor con especificador de
 * paquete, imports de tipo sin extensión, y nada de `@/`.
 *
 * ## Por qué NO lleva `server-only`, y qué lo reemplaza
 *
 * `server-only` sería la marca obvia —aquí se descifra la clave privada de la
 * Service Account de Google—, pero ese paquete **lanza** cuando se carga fuera
 * del bundle de React Server Components, así que el script de línea de comandos
 * dejaría de arrancar. Poner una copia del lector en el script para poder
 * marcarlo es exactamente la duplicación que esta refactorización vino a
 * eliminar.
 *
 * Lo que de verdad impide que esto llegue al navegador no es la marca, son tres
 * hechos verificables:
 *
 *  1. **El único importador dentro de la app es `./acciones.ts`, que empieza con
 *     `"use server"`.** Un módulo de Server Actions nunca se empaqueta hacia el
 *     cliente: al navegador solo viaja un identificador de acción cifrado
 *     (node_modules/next/dist/docs/01-app/02-guides/data-security.md).
 *  2. **`googleapis` es un paquete de Node.** Si alguien lo importara desde un
 *     componente de cliente, el build fallaría; no habría un fallo silencioso.
 *  3. **Nada de lo que sale de aquí lleva secretos.** La función devuelve filas
 *     de texto del Sheet y el nombre del rango. Ni la clave, ni el correo de la
 *     Service Account, ni el ID del Sheet salen de este módulo.
 *
 * El punto 3 es el que hay que sostener a mano: el ID del Sheet es un secreto
 * de configuración —quien lo tiene puede pedirle el documento a Google— y no
 * debe aparecer en un mensaje de error que la pantalla vaya a mostrar.
 */
import { google } from "googleapis";

/**
 * La pestaña entera, sin acotar columnas: la tabla es ancha y va creciendo
 * hacia la derecha según se agregan principios activos. Acotar el rango (como
 * hace el de pacientes, que tiene seis columnas fijas) obligaría a editarlo
 * cada vez que el Sheet gana una columna.
 *
 * Se lee DESDE LA FILA 1, no desde la 2: aquí la primera fila no es un rótulo
 * que se descarta, son los nombres genéricos.
 */
export const RANGO_POR_DEFECTO = "Hoja1";

/** Lo que Google devolvió, más el rango con el que se pidió. */
export type LecturaDelSheet = {
  /** Filas crudas, sin normalizar. Las filas vienen con largos distintos. */
  filas: unknown[][];
  /** El rango efectivamente usado; `analizarSheet` lo necesita para el aviso. */
  rango: string;
};

/**
 * Falta configuración: se distingue del resto de fallos porque el mensaje puede
 * mostrarse tal cual (nombra variables, nunca valores).
 */
export class ConfiguracionIncompletaError extends Error {}

/** El Sheet respondió, pero sin una sola fila. */
export class SheetVacioError extends Error {}

function requerida(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor) {
    throw new ConfiguracionIncompletaError(
      `Falta la variable de entorno ${nombre}. Ver .env.example en la raíz del repositorio.`
    );
  }
  return valor;
}

/**
 * Lee el Sheet completo.
 *
 * Este archivo NO se lee del disco: el JSON de la Service Account vive fuera
 * del repositorio y llega por `GOOGLE_SERVICE_ACCOUNT_KEY_BASE64`. El Sheet
 * tiene que estar compartido con permiso *Viewer* con el `client_email` que
 * aparece dentro de ese JSON.
 *
 * El scope es `spreadsheets.readonly`: aunque la clave se filtrara, el token
 * que se emite con ella no puede escribir en ningún documento.
 */
export async function leerSheetMedicamentos(): Promise<LecturaDelSheet> {
  const sheetId = requerida("GOOGLE_SHEET_ID_MEDICAMENTOS");
  const credencialesBase64 = requerida("GOOGLE_SERVICE_ACCOUNT_KEY_BASE64");
  const rango = process.env.GOOGLE_SHEET_RANGE_MEDICAMENTOS || RANGO_POR_DEFECTO;

  let credentials: Record<string, unknown>;
  try {
    credentials = JSON.parse(Buffer.from(credencialesBase64, "base64").toString("utf-8"));
  } catch {
    // Sin detalles del contenido: el error de JSON.parse trae un fragmento del
    // texto que falló, y ese texto es la clave privada.
    throw new ConfiguracionIncompletaError(
      "GOOGLE_SERVICE_ACCOUNT_KEY_BASE64 no contiene un JSON válido en Base64. Vuelve a generarla siguiendo .env.example."
    );
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const sheets = google.sheets({ version: "v4", auth });

  const respuesta = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: rango,
  });

  const filas = (respuesta.data.values ?? []) as unknown[][];
  if (filas.length === 0) {
    throw new SheetVacioError(
      `El Sheet no devolvió ninguna fila con el rango "${rango}". Revisa que la pestaña se llame así y que el documento esté compartido con la Service Account.`
    );
  }

  return { filas, rango };
}
