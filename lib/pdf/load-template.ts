/**
 * Corre en el navegador: las plantillas viven en /public/templates y se piden
 * por fetch, nunca por fs — no hay Server Action ni API route de por medio.
 */
export async function fetchTemplateBytes(path: string): Promise<ArrayBuffer> {
  const res = await fetch(path);
  if (!res.ok) {
    throw new Error(`No se pudo cargar la plantilla PDF "${path}" (HTTP ${res.status})`);
  }
  return res.arrayBuffer();
}
