/**
 * Importación del catálogo CIE-10: qué códigos entran y qué cambiaría en la base.
 *
 * Lo usa `scripts/import-cie10.mjs`. Separado del script para poder probar la
 * selección con Vitest (tests/cie10-importar.test.ts): un filtro mal hecho aquí
 * deja fuera diagnósticos enteros sin que nada falle, y ya pasó (ver abajo).
 *
 * Mismas dos reglas que `lib/medicamentos/importar.ts`: nada de `server-only`,
 * Next ni `@/` (lo importa Node a secas), y no lee variables de entorno ni crea
 * clientes (recibe el cliente ya hecho).
 *
 * Fuente y decisiones: docs/integraciones/Catalogo-CIE10.md
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Cie10CatalogoRow, Database } from "../supabase/tipos";

export type ClienteCatalogo = SupabaseClient<Database>;

/** Una fila del CSV de origen, con las columnas que se usan. */
export type FilaCsv = { code?: string; description?: string };

/**
 * Qué entra: **un código entra si ningún otro código lo extiende** (es el
 * código final de su rama). Se decide mirando los propios códigos, nunca la
 * columna `level` del CSV, que no sirve para esto:
 *
 *   - Las categorías finales de tres caracteres (I10, J00, R51, K30, A09)
 *     vienen casi todas en el nivel 2, junto a las que sí tienen subdivisiones
 *     (J02 → J02.0, J02.8, J02.9).
 *   - Hay subdivisiones de cuatro caracteres en el nivel 2 (T79.x, N99.x) y
 *     categorías con subdivisiones en los niveles 3 y 4 (C00, T20, M15…).
 *
 * Hasta el 17 de octubre de 2026 el filtro era "niveles 3-5". Dejaba fuera 238
 * categorías finales (la hipertensión esencial no se podía codificar) y 18
 * subdivisiones del nivel 2, y dejaba entrar 430 categorías con subdivisiones
 * y 24 rangos ("C00-C14"). Esos 454 siguen en la base, porque el importador no
 * borra: el --dry-run los informa como "en la base y no en la selección"
 * (Catalogo-CIE10.md).
 */
const CATEGORIA = /^[A-Z]\d{2}$/;

export type Seleccion = {
  registros: Cie10CatalogoRow[];
  /** De `registros`, las categorías de tres caracteres (todas finales, por la regla). */
  categoriasFinales: string[];
  /** Todos los códigos del CSV, entren o no: para saber de dónde viene un ajuste. */
  codigosDeLaFuente: Set<string>;
};

export function seleccionarCodigos(filas: FilaCsv[]): Seleccion {
  // Los rangos ("I10-I15") no son códigos, y empiezan igual que la categoría:
  // si contaran, I10 tendría una "subdivisión" y quedaría fuera otra vez.
  const validas = filas
    .map((f) => ({ codigo: (f.code ?? "").trim(), descripcion: (f.description ?? "").trim() }))
    .filter((f) => f.codigo && f.descripcion && !f.codigo.includes("-"));

  const codigosDeLaFuente = new Set(validas.map((f) => f.codigo));
  // Todo prefijo propio de un código: lo que tiene "hijos" no es final.
  const extendidos = new Set<string>();
  for (const c of codigosDeLaFuente) {
    for (let largo = 3; largo < c.length; largo++) extendidos.add(c.slice(0, largo));
  }

  const porCodigo = new Map<string, Cie10CatalogoRow>();
  for (const f of validas) {
    if (extendidos.has(f.codigo) || porCodigo.has(f.codigo)) continue;
    porCodigo.set(f.codigo, { codigo: f.codigo, descripcion: f.descripcion });
  }

  const registros = [...porCodigo.values()];
  const categoriasFinales = registros.map((r) => r.codigo).filter((c) => CATEGORIA.test(c)).sort();
  return { registros, categoriasFinales, codigosDeLaFuente };
}

/**
 * Una entrada de `supabase/datos/cie10-ajustes.json`: lo que se agrega o se
 * corrige sobre la fuente, a la vista y con su origen, nunca a mano en el panel.
 * Si el código ya viene en la fuente, se reemplaza su descripción (una
 * corrección de la doctora); si no, se agrega (U07.1/U07.2, que la fuente, de
 * 2019, no trae).
 */
export type Ajuste = { codigo: string; descripcion: string; fuente: string };

/** Como se guardan todos los códigos: sin punto, en mayúsculas, 3 o 4 caracteres (`U071`). */
const CODIGO_GUARDADO = /^[A-Z]\d{2}[0-9A-Z]?$/;

function porQueNoEsValido(codigo: string): string {
  if (codigo.includes(".")) return "va sin punto: U071, no U07.1";
  if (codigo !== codigo.toUpperCase()) return "va en mayúsculas";
  return "tiene que ser una letra, dos dígitos y, si es una subdivisión, un carácter más";
}

/** Valida el archivo y falla con un mensaje claro: un ajuste mal escrito no se ignora en silencio. */
export function validarAjustes(entradas: unknown): Ajuste[] {
  if (!Array.isArray(entradas)) throw new Error("El archivo de ajustes tiene que ser una lista.");
  const vistos = new Set<string>();
  return entradas.map((e: Partial<Record<keyof Ajuste, unknown>> | null, i) => {
    const donde = `Ajuste n.º ${i + 1}`;
    const texto = (valor: unknown) => (typeof valor === "string" ? valor.trim() : "");
    const codigo = texto(e?.codigo);
    const descripcion = texto(e?.descripcion);
    const fuente = texto(e?.fuente);
    if (!CODIGO_GUARDADO.test(codigo)) {
      throw new Error(`${donde}: el código "${codigo}" no es válido (${porQueNoEsValido(codigo)}).`);
    }
    if (!descripcion) throw new Error(`${donde} (${codigo}): falta la descripción.`);
    if (!fuente) throw new Error(`${donde} (${codigo}): falta la fuente.`);
    if (vistos.has(codigo)) throw new Error(`${donde}: el código ${codigo} está repetido.`);
    vistos.add(codigo);
    return { codigo, descripcion, fuente };
  });
}

export type ConAjustes = {
  registros: Cie10CatalogoRow[];
  /** Códigos que la fuente no trae (U07.1, U07.2). */
  agregados: string[];
  /** Códigos que la fuente trae pero la regla deja fuera, y el ajuste incluye a propósito. */
  incluidosAMano: string[];
  /** Códigos seleccionados cuya descripción reemplaza el ajuste. */
  corregidos: string[];
  /**
   * Códigos que dejan de ser finales porque un ajuste agrega una subdivisión
   * suya (agregar A090 saca A09). Salen de la selección, como manda la regla.
   */
  dejanDeSerFinales: string[];
};

export function aplicarAjustes(seleccion: Seleccion, ajustes: Ajuste[]): ConAjustes {
  const porCodigo = new Map(seleccion.registros.map((r) => [r.codigo, r.descripcion]));
  const agregados: string[] = [];
  const incluidosAMano: string[] = [];
  const corregidos: string[] = [];
  for (const { codigo, descripcion } of ajustes) {
    const seleccionado = porCodigo.get(codigo);
    if (seleccionado !== undefined) {
      if (seleccionado !== descripcion) corregidos.push(codigo);
    } else if (seleccion.codigosDeLaFuente.has(codigo)) incluidosAMano.push(codigo);
    else agregados.push(codigo);
    porCodigo.set(codigo, descripcion);
  }
  // La misma regla que en seleccionarCodigos, ahora con los ajustes: lo que un
  // ajuste extiende ya no es final.
  const dejanDeSerFinales: string[] = [];
  for (const { codigo } of ajustes) {
    for (let largo = 3; largo < codigo.length; largo++) {
      const madre = codigo.slice(0, largo);
      if (porCodigo.delete(madre)) dejanDeSerFinales.push(madre);
    }
  }
  return {
    registros: [...porCodigo].map(([codigo, descripcion]) => ({ codigo, descripcion })),
    agregados: agregados.sort(),
    incluidosAMano: incluidosAMano.sort(),
    corregidos: corregidos.sort(),
    dejanDeSerFinales: dejanDeSerFinales.sort(),
  };
}

export type Clasificacion = {
  nuevos: Cie10CatalogoRow[];
  cambianDescripcion: { codigo: string; antes: string; despues: string }[];
  sinCambio: number;
  /** En la base pero no en la selección: el importador no los borra, solo los informa. */
  soloEnLaBase: string[];
};

export function clasificarContraCatalogo(
  registros: Cie10CatalogoRow[],
  existentes: Cie10CatalogoRow[]
): Clasificacion {
  const enBase = new Map(existentes.map((e) => [e.codigo, e.descripcion]));
  const enSeleccion = new Set(registros.map((r) => r.codigo));
  const nuevos: Cie10CatalogoRow[] = [];
  const cambianDescripcion: Clasificacion["cambianDescripcion"] = [];
  let sinCambio = 0;
  for (const r of registros) {
    const antes = enBase.get(r.codigo);
    if (antes === undefined) nuevos.push(r);
    else if (antes !== r.descripcion) cambianDescripcion.push({ codigo: r.codigo, antes, despues: r.descripcion });
    else sinCambio++;
  }
  const soloEnLaBase = existentes.map((e) => e.codigo).filter((c) => !enSeleccion.has(c)).sort();
  return { nuevos, cambianDescripcion, sinCambio, soloEnLaBase };
}

/**
 * De lo que está en la base y no en la selección, los rangos ("C00-C14"): no son
 * códigos, y la importación original los metió como diagnósticos. Son lo único
 * que el importador puede borrar, y solo con `--quitar-rangos`.
 */
export function rangos(codigos: string[]): string[] {
  return codigos.filter(esRango);
}

/**
 * "C00-C14", "A00-B99", "O00-O9A": dos categorías de tres caracteres unidas por
 * un guion, en orden. Es la forma de los 286 rangos del CSV fijado (comprobado
 * el 17 de octubre de 2026; "O00-O9A" es el único con letra al final).
 * Estricto a propósito, porque decide qué se BORRA: una fila rara con guion que
 * no tenga esta forma no cuenta como rango, se queda y se ve en el informe.
 */
export function esRango(codigo: string): boolean {
  const partes = /^([A-Z]\d{2})-([A-Z]\d[0-9A-Z])$/.exec(codigo);
  return partes !== null && partes[1] <= partes[2];
}

const TAMANO_PAGINA = 1000;

/** El catálogo entero. Paginado: PostgREST corta en 1000 filas y no avisa, y son más de 12.000. */
export async function leerCatalogoExistente(supabase: ClienteCatalogo): Promise<Cie10CatalogoRow[]> {
  const todos: Cie10CatalogoRow[] = [];
  for (let desde = 0; ; desde += TAMANO_PAGINA) {
    const { data, error } = await supabase
      .from("cie10_catalogo")
      .select("codigo, descripcion")
      .order("codigo")
      .range(desde, desde + TAMANO_PAGINA - 1);
    if (error) throw new Error(error.message);
    const pagina = data ?? [];
    todos.push(...pagina);
    if (pagina.length < TAMANO_PAGINA) return todos;
  }
}
