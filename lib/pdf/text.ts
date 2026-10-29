import { rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { aTextoImprimible } from "@/lib/texto-plano";

const INK = rgb(0.02, 0.11, 0.18);

/**
 * **Toda cadena que venga de fuera pasa por aquí antes de medirse o dibujarse.**
 *
 * `pdf-lib` no tolera un carácter que WinAnsi no tenga: lanza
 * `WinAnsi cannot encode "
" (0x000a)` desde `font.widthOfTextAtSize()`, o sea
 * desde `wrapText`. Un Shift+Enter en "Tratamiento" tumbaba la aplicación
 * entera —Runtime Error en pantalla, no un mensaje de validación— porque el
 * contador en vivo mide en cada tecla. Un pegado desde Word hacía lo mismo con
 * `
` y con los tabuladores, sin que ninguna tecla lo delatara.
 *
 * El formulario ya no deja escribir saltos de línea (ver `aLineaUnica` y los
 * campos de texto largo), pero eso arregla UNA puerta. Esto cierra la clase:
 * cualquier código que llame a estas funciones —una importación, un script, la
 * receta de la sesión siguiente— no puede hacer caer la generación del PDF por
 * un carácter.
 *
 * Se sanea en `wrapText` y en `drawText` porque son los dos únicos sitios donde
 * el texto llega a pdf-lib; todo lo demás de este módulo pasa por uno de ellos.
 */
const imprimible = aTextoImprimible;

export function drawText(
  page: PDFPage,
  font: PDFFont,
  text: string | number | null | undefined,
  x: number,
  y: number,
  size = 9
) {
  if (text === null || text === undefined || text === "") return;
  // Se sanea DESPUÉS de descartar los vacíos y se vuelve a comprobar: un texto
  // que era solo un salto de línea queda en nada, y dibujar la cadena vacía
  // sería pintar un rastro invisible en la hoja.
  const limpio = imprimible(String(text));
  if (!limpio) return;
  page.drawText(limpio, { x, y, size, font, color: INK });
}

/**
 * Mide un texto **saneándolo antes**, que es lo que separa una medición de una
 * excepción. Existe para que `font.widthOfTextAtSize()` no se llame en ningún
 * otro sitio del módulo: era la única puerta que quedaba abierta fuera de este
 * archivo (`dibujarNumeroReceta` la usaba para alinear a la derecha).
 */
export function medirTexto(font: PDFFont, text: string, size: number): number {
  return font.widthOfTextAtSize(imprimible(text), size);
}

/**
 * ¿Alguna de estas líneas es MÁS ANCHA que el espacio disponible?
 *
 * Parece imposible después de ajustar, y no lo es: `wrapText` corta por
 * espacios, así que una palabra sin espacios sale entera en su línea **mida lo
 * que mida**. Contar renglones no lo detecta —siempre es UNA línea— y ahí se
 * colaba el fallo: un texto de 136 caracteres sin espacios medía 550pt contra
 * los 201pt de "Signos de alarma", el contador no se ponía en rojo, el guardado
 * no se bloqueaba y el PDF se generaba sin lanzar. Al imprimirlo, de los 136
 * caracteres solo 54 caían dentro de la hoja: el resto se dibujaba más allá del
 * borde derecho y no salía en el papel. Un signo de alarma recortado en
 * silencio es exactamente lo que ADR-005 existe para impedir.
 */
export function hayLineaDemasiadoAncha(
  lineas: string[],
  font: PDFFont,
  size: number,
  maxWidth: number
): boolean {
  return lineas.some((linea) => font.widthOfTextAtSize(linea, size) > maxWidth);
}

/**
 * El contrato único de "¿cabe esto en su hueco de la plantilla?".
 *
 * Son DOS condiciones, y hacen falta las dos: que no se pase de renglones y que
 * ningún renglón se pase de ancho. Todas las funciones de ajuste de ADR-005 y
 * ADR-007 pasan por aquí, para que no vuelva a haber una que compruebe una sola.
 */
export function cabeEnElEspacio(
  texto: string | null | undefined,
  font: PDFFont,
  size: number,
  maxWidth: number,
  maxLineas: number
): boolean {
  if (!texto) return true;
  const lineas = wrapText(texto, font, size, maxWidth);
  return lineas.length <= maxLineas && !hayLineaDemasiadoAncha(lineas, font, size, maxWidth);
}

/**
 * Parte una palabra que no cabe de ancho, carácter a carácter.
 *
 * Solo la usan los campos SIN límite de renglones (`drawWrapped`: motivo de
 * consulta, antecedentes…). Ahí no hay nada que bloquear —no existe un tope de
 * líneas que respetar— así que la única alternativa a partirla es dejar que la
 * tinta se salga de la hoja, y eso no es una alternativa.
 *
 * En los campos CON límite medido no se parte nada: se bloquea el guardado, que
 * es lo que pide ADR-005. Partir a la fuerza ahí escondería el problema.
 */
function partirPalabraLarga(
  palabra: string,
  font: PDFFont,
  size: number,
  maxWidth: number
): string[] {
  if (font.widthOfTextAtSize(palabra, size) <= maxWidth) return [palabra];

  const trozos: string[] = [];
  let actual = "";
  for (const caracter of palabra) {
    if (actual && font.widthOfTextAtSize(actual + caracter, size) > maxWidth) {
      trozos.push(actual);
      actual = caracter;
    } else {
      actual += caracter;
    }
  }
  if (actual) trozos.push(actual);
  return trozos;
}

export function wrapText(text: string, font: PDFFont, size: number, maxWidth: number, opciones?: { partirPalabras?: boolean }): string[] {
  // El saneado va aquí arriba, antes de la primera medición: `widthOfTextAtSize`
  // es justo la llamada que lanzaba. Como los saltos se vuelven espacios, el
  // ajuste tiene además dónde cortar, en vez de arrastrar dos frases pegadas
  // como si fueran una palabra larguísima.
  const palabras = imprimible(text).split(" ");
  // Con `partirPalabras`, una palabra más ancha que el hueco entra ya troceada.
  const words = opciones?.partirPalabras
    ? palabras.flatMap((p) => partirPalabraLarga(p, font, size, maxWidth))
    : palabras;
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export function drawWrapped(
  page: PDFPage,
  font: PDFFont,
  text: string | null | undefined,
  x: number,
  startY: number,
  { maxWidth, size = 8.5, lineHeight = 12 }: { maxWidth: number; size?: number; lineHeight?: number }
): number {
  if (!text) return 0;
  // `partirPalabras`: este camino no tiene tope de renglones que respetar, así
  // que una palabra que no cabe de ancho se trocea. La alternativa era dibujarla
  // entera y que se saliera de la hoja — que es lo que hacía.
  const lines = wrapText(text, font, size, maxWidth, { partirPalabras: true });
  lines.forEach((line, i) => drawText(page, font, line, x, startY - i * lineHeight, size));
  return lines.length;
}

/**
 * Se lanza cuando un campo no cabe en su espacio impreso a tamaño legible.
 * Ver ADR-005-limites-contenido-receta.md: la responsabilidad de evitar esto
 * es del formulario (bloquear guardado con contador de caracteres) — el PDF
 * nunca lo resuelve encogiendo la letra por debajo de lo legible ni
 * truncando el texto con "…".
 */
export class ContenidoExcedeEspacioError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContenidoExcedeEspacioError";
  }
}

/**
 * Envuelve el texto a un tamaño de fuente FIJO (nunca lo encoge). Si no cabe
 * en maxLines a ese tamaño, lanza ContenidoExcedeEspacioError en vez de
 * truncar o desbordar sobre el resto de la receta.
 */
export function drawFixedOrThrow(
  page: PDFPage,
  font: PDFFont,
  campo: string,
  text: string | null | undefined,
  x: number,
  startY: number,
  { maxWidth, maxLines, size, lineHeight, sugerencia }: {
    maxWidth: number;
    maxLines: number;
    size: number;
    lineHeight: number;
    sugerencia?: string;
  }
) {
  if (!text) return;
  const lines = wrapText(text, font, size, maxWidth);
  // Dos motivos para no caber, y el segundo se escapaba: demasiados renglones,
  // o UN renglón demasiado ancho. Lo segundo solo pasa con una palabra sin
  // espacios, que `wrapText` no puede partir y devuelve entera (ver
  // `hayLineaDemasiadoAncha`). Sin esta comprobación, el texto se dibujaba más
  // allá del borde de la hoja y no se imprimía, sin lanzar nada.
  if (lines.length > maxLines || hayLineaDemasiadoAncha(lines, font, size, maxWidth)) {
    throw new ContenidoExcedeEspacioError(
      `"${campo}" no cabe en el espacio impreso de la plantilla a un tamaño legible (${size}pt).` +
        (sugerencia ? ` ${sugerencia}` : "")
    );
  }
  lines.forEach((line, i) => drawText(page, font, line, x, startY - i * lineHeight, size));
}

/** Ubica un valor justo después de un label real de la plantilla, calculando
 * el ancho del label con las métricas de la fuente en vez de fijar un x a ojo. */
export function drawAfterLabel(
  page: PDFPage,
  font: PDFFont,
  labelText: string,
  labelX: number,
  labelY: number,
  // Acepta números igual que `drawText`: las constantes vitales (FC, FR,
  // temperatura, peso) son `numeric` en la base y llegan aquí como number.
  value: string | number | null | undefined,
  opts: {
    labelSize?: number;
    gap?: number;
    lift?: number;
    size?: number;
    maxWidth?: number;
    /**
     * Tope de renglones. Con él, el campo deja de poder invadir a su vecino de
     * abajo: si no cabe, lanza en vez de dibujarse encima. Sin él se comporta
     * como antes — solo lo omiten los campos que caben siempre por construcción
     * (una fecha formateada, una edad de dos dígitos).
     */
    maxLines?: number;
    /** Nombre del campo para el mensaje de error. */
    campo?: string;
  } = {}
) {
  const { labelSize = 11, gap = 5, lift = 2, size = 10, maxWidth, maxLines, campo } = opts;
  const x = labelX + font.widthOfTextAtSize(labelText, labelSize) + gap;
  const y = labelY + lift;
  // Se normaliza a texto una sola vez: `drawWrapped` necesita medir el ancho de
  // la cadena para ajustarla, y no tiene sentido que sepa de números.
  const texto = value === null || value === undefined ? value : String(value);
  if (maxWidth && maxLines) {
    drawFixedOrThrow(page, font, campo ?? "Campo", texto, x, y, {
      maxWidth,
      maxLines,
      size,
      lineHeight: size + 3,
    });
  } else if (maxWidth) {
    drawWrapped(page, font, texto, x, y, { maxWidth, size, lineHeight: size + 3 });
  } else {
    drawText(page, font, texto, x, y, size);
  }
}
