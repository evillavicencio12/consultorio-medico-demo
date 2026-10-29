/**
 * Vocabulario cerrado de la receta: presentación y vía de administración.
 *
 * ⚠️ Estas dos listas deben coincidir EXACTAMENTE con los CHECK de la base, en
 * `supabase/migrations/20260820120300_receta_medicamentos.sql`. Son la misma
 * regla escrita en dos lenguajes: aquí para que TypeScript rechace un valor
 * inválido al compilar, y allá para que la base lo rechace aunque llegue por
 * otro camino. Agregar una opción exige tocar los dos lados, con una migración
 * nueva — ver docs/modulos/05-Prescripcion-Receta.md.
 *
 * Los valores guardados son "slugs" sin tildes ni espacios (`solucion_oral`),
 * porque son identificadores estables: sobreviven a un cambio de redacción y no
 * dependen de la codificación de caracteres. Pero un slug NO se imprime en una
 * receta — es un documento legal que lee un farmacéutico. Por eso cada valor
 * tiene su etiqueta legible aquí, y el PDF siempre imprime la etiqueta.
 */

export const PRESENTACIONES = [
  "capsula",
  "tableta",
  "ampolla",
  "frasco",
  "solucion_inyectable",
  "solucion_oral",
] as const;

export const VIAS_ADMINISTRACION = [
  "oral",
  "sublingual",
  "intramuscular",
  "intravenosa",
  "subcutanea",
  "topica",
  "rectal",
  "oftalmica",
  "otica",
  "inhalada",
] as const;

export type Presentacion = (typeof PRESENTACIONES)[number];
export type ViaAdministracion = (typeof VIAS_ADMINISTRACION)[number];

/**
 * `Record<Presentacion, string>` en vez de un objeto suelto: si mañana se
 * agrega un valor a `PRESENTACIONES` y se olvida su etiqueta, esto no compila.
 */
export const ETIQUETA_PRESENTACION: Record<Presentacion, string> = {
  capsula: "cápsula",
  tableta: "tableta",
  ampolla: "ampolla",
  frasco: "frasco",
  solucion_inyectable: "solución inyectable",
  solucion_oral: "solución oral",
};

export const ETIQUETA_VIA_ADMINISTRACION: Record<ViaAdministracion, string> = {
  oral: "oral",
  sublingual: "sublingual",
  intramuscular: "intramuscular",
  intravenosa: "intravenosa",
  subcutanea: "subcutánea",
  topica: "tópica",
  rectal: "rectal",
  oftalmica: "oftálmica",
  otica: "ótica",
  inhalada: "inhalada",
};

export const etiquetaPresentacion = (v: Presentacion): string => ETIQUETA_PRESENTACION[v];
export const etiquetaViaAdministracion = (v: ViaAdministracion): string => ETIQUETA_VIA_ADMINISTRACION[v];
