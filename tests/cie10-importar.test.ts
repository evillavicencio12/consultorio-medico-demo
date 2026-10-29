// Qué códigos del CSV de origen entran al catálogo (lib/cie10/importar.ts).
// Filas sintéticas con la forma del CSV real (verasativa/CIE-10).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  aplicarAjustes,
  clasificarContraCatalogo,
  esRango,
  rangos,
  seleccionarCodigos,
  validarAjustes,
  type FilaCsv,
} from "../lib/cie10/importar";

// El nivel se escribe como en el CSV, aunque la selección no lo mira: así el
// fixture muestra justo los casos en que el nivel engaña.
const fila = (code: string, level: string, description = `desc ${code}`): FilaCsv & { level: string } => ({
  code,
  level,
  description,
});

const CSV: FilaCsv[] = [
  fila("I00-I99", "0"),
  fila("I10-I15", "1"),
  fila("I10", "2", "Hipertensión esencial (primaria)"), // final: sin subdivisiones
  fila("J02", "2", "Faringitis aguda"), // con subdivisiones: no entra
  fila("J029", "3", "Faringitis aguda, no especificada"),
  fila("F99", "1", "Trastorno mental, no especificado"), // final en nivel 1
  fila("C61", "4", "Tumor maligno de la próstata"), // final en nivel 4 (ya entraba)
  fila("M45", "3", "Espondilitis anquilosante"), // final en nivel 3 (ya entraba)
  fila("A000", "5"), // el nivel 5 son códigos de cuatro caracteres
  fila("T20", "3"), // categoría en nivel 3, pero CON subdivisiones: no entra
  fila("T200", "4"),
  fila("T79", "1"),
  fila("T790", "2"), // subdivisión en nivel 2: entra igual
  fila("", "3"), // sin código
  fila("X00", "2", ""), // sin descripción
];

describe("seleccionarCodigos", () => {
  const { registros, categoriasFinales } = seleccionarCodigos(CSV);
  const codigos = registros.map((r) => r.codigo).sort();

  it("incluye las categorías de tres caracteres sin subdivisiones, de cualquier nivel", () => {
    expect(codigos).toContain("I10");
    expect(codigos).toContain("F99");
    expect(categoriasFinales).toEqual(["C61", "F99", "I10", "M45"]);
  });

  it("deja fuera las categorías con subdivisiones y los rangos, en cualquier nivel", () => {
    expect(codigos).not.toContain("J02");
    expect(codigos).not.toContain("T20"); // nivel 3 en el CSV
    expect(codigos).not.toContain("T79");
    expect(codigos.some((c) => c.includes("-"))).toBe(false);
  });

  it("incluye las subdivisiones aunque el CSV las ponga en el nivel 2", () => {
    expect(codigos).toContain("T790");
  });

  it("un rango que empieza como la categoría no cuenta como subdivisión", () => {
    // "I10-I15" empieza por "I10": si contara, I10 quedaría fuera otra vez.
    expect(codigos).toContain("I10");
  });

  it("deja solo los códigos finales y descarta filas sin código o sin descripción", () => {
    expect(codigos).toEqual(["A000", "C61", "F99", "I10", "J029", "M45", "T200", "T790"]);
  });

  it("conserva la descripción del CSV", () => {
    expect(registros.find((r) => r.codigo === "I10")?.descripcion).toBe("Hipertensión esencial (primaria)");
  });

  it("no repite un código que aparece dos veces", () => {
    const { registros: r } = seleccionarCodigos([fila("I10", "2"), fila("I10", "3")]);
    expect(r).toHaveLength(1);
  });
});

describe("clasificarContraCatalogo", () => {
  it("separa nuevos, cambios de descripción, sin cambio y lo que solo está en la base", () => {
    const resultado = clasificarContraCatalogo(
      [
        { codigo: "I10", descripcion: "Hipertensión esencial (primaria)" },
        { codigo: "J029", descripcion: "Faringitis aguda, no especificada" },
        { codigo: "J039", descripcion: "Amigdalitis aguda, no especificada" },
      ],
      [
        { codigo: "J029", descripcion: "Faringitis aguda, no especificada" },
        { codigo: "J039", descripcion: "Amigdalitis aguda" },
        { codigo: "Z999", descripcion: "Solo en la base" },
      ]
    );
    expect(resultado.nuevos.map((n) => n.codigo)).toEqual(["I10"]);
    expect(resultado.cambianDescripcion).toEqual([
      { codigo: "J039", antes: "Amigdalitis aguda", despues: "Amigdalitis aguda, no especificada" },
    ]);
    expect(resultado.sinCambio).toBe(1);
    expect(resultado.soloEnLaBase).toEqual(["Z999"]);
  });
});

describe("rangos", () => {
  it("de lo que solo está en la base, separa los rangos de los códigos", () => {
    // Lo único que --quitar-rangos puede borrar: una categoría con
    // subdivisiones (C00) no es un rango y se queda.
    expect(rangos(["C00", "C00-C14", "J02", "X58-X59"])).toEqual(["C00-C14", "X58-X59"]);
  });

  it("deja en la base lo que trae guion sin ser un rango", () => {
    expect(rangos(["A00-", "C00-14", "c00-c14", "C00-C14"])).toEqual(["C00-C14"]);
  });
});

// Por qué es estricto: ver el comentario de esRango en lib/cie10/importar.ts.
describe("esRango", () => {
  it.each(["C00-C14", "A00-B99", "X58-X59", "C81-C96", "O00-O9A"])("«%s» es un rango", (codigo) => {
    expect(esRango(codigo)).toBe(true);
  });

  it.each([
    ["J06.9", "un código con punto"],
    ["J069", "un código"],
    ["C00", "una categoría"],
    ["A00-", "un guion sin el segundo código"],
    ["-A00", "un guion sin el primer código"],
    ["c00-c14", "un rango en minúsculas"],
    ["C00-14", "un guion que no une dos códigos"],
    ["C00--C14", "dos guiones"],
    ["C00 - C14", "con espacios"],
    ["COVID-19", "una palabra con guion"],
    ["C00.0-C00.9", "un rango con puntos"],
    ["A000-A009", "códigos de cuatro caracteres (ningún rango de la fuente los tiene)"],
    ["C00-C140", "extremos de largo distinto"],
    ["C14-C00", "al revés"],
    ["", "vacío"],
  ])("«%s» no es un rango (%s)", (codigo) => {
    expect(esRango(codigo)).toBe(false);
  });
});

describe("ajustes (supabase/datos/cie10-ajustes.json)", () => {
  const archivo = new URL("../supabase/datos/cie10-ajustes.json", import.meta.url);
  const ajustes = validarAjustes(JSON.parse(readFileSync(archivo, "utf-8")));

  it("el archivo versionado trae U07.1 y U07.2 con la descripción de la OMS y su fuente", () => {
    const porCodigo = Object.fromEntries(ajustes.map((a) => [a.codigo, a]));
    expect(porCodigo.U071?.descripcion).toBe("COVID-19, virus identificado");
    expect(porCodigo.U072?.descripcion).toBe("COVID-19, virus no identificado");
    expect(porCodigo.U071?.fuente).toMatch(/OMS/);
    expect(porCodigo.U072?.fuente).toMatch(/OMS/);
  });

  it("los dos entran, y una segunda corrida no los duplica ni los cambia", () => {
    const seleccion = seleccionarCodigos(CSV);
    const fuente = seleccion.registros;
    const { registros, agregados } = aplicarAjustes(seleccion, ajustes);
    expect(agregados).toEqual(["U071", "U072"]);

    // Primera corrida: la base tiene solo lo de la fuente.
    const primera = clasificarContraCatalogo(registros, fuente);
    expect(primera.nuevos.map((n) => n.codigo).sort()).toEqual(["U071", "U072"]);

    // Segunda: la base ya tiene lo que escribió la primera.
    const segunda = clasificarContraCatalogo(registros, [...fuente, ...primera.nuevos]);
    expect(segunda.nuevos).toEqual([]);
    expect(segunda.cambianDescripcion).toEqual([]);
    expect(registros.filter((r) => r.codigo === "U071")).toHaveLength(1);
  });

  it("un ajuste sobre un código de la fuente reemplaza su descripción (una corrección)", () => {
    const r = aplicarAjustes(seleccionarCodigos(CSV), [
      { codigo: "J029", descripcion: "Faringitis aguda, sin especificar", fuente: "prueba" },
    ]);
    expect(r.corregidos).toEqual(["J029"]);
    expect(r.agregados).toEqual([]);
    expect(r.registros.find((x) => x.codigo === "J029")?.descripcion).toBe("Faringitis aguda, sin especificar");
  });

  it("un código que la fuente trae pero la regla deja fuera no cuenta como 'agregado'", () => {
    const r = aplicarAjustes(seleccionarCodigos(CSV), [{ codigo: "J02", descripcion: "Faringitis aguda", fuente: "prueba" }]);
    expect(r.incluidosAMano).toEqual(["J02"]);
    expect(r.agregados).toEqual([]);
  });

  it("un ajuste que agrega una subdivisión saca de la selección a su categoría", () => {
    const r = aplicarAjustes(seleccionarCodigos(CSV), [{ codigo: "I100", descripcion: "x", fuente: "prueba" }]);
    expect(r.dejanDeSerFinales).toEqual(["I10"]);
    expect(r.registros.some((x) => x.codigo === "I10")).toBe(false);
    expect(r.registros.some((x) => x.codigo === "I100")).toBe(true);
  });

  it("rechaza códigos mal escritos, repetidos y filas sin descripción o sin fuente", () => {
    const ok = { descripcion: "x", fuente: "y" };
    expect(() => validarAjustes([{ codigo: "U07.1", ...ok }])).toThrow(/sin punto/);
    expect(() => validarAjustes([{ codigo: "u071", ...ok }])).toThrow(/mayúsculas/);
    expect(() => validarAjustes([{ codigo: "U0711", ...ok }])).toThrow(/no es válido/);
    expect(() => validarAjustes([{ codigo: "U071", ...ok }, { codigo: "U071", ...ok }])).toThrow(/repetido/);
    expect(() => validarAjustes([{ codigo: "U071", descripcion: "", fuente: "y" }])).toThrow(/descripción/);
    expect(() => validarAjustes([{ codigo: "U071", descripcion: "x", fuente: " " }])).toThrow(/fuente/);
  });
});
