/**
 * Envuelve los bytes del PDF en un blob: URL para la vista previa embebida
 * (06-Generador-PDF.md: "vista previa dentro de la misma página", sin forzar
 * descarga). Llamar a `dispose()` al cerrar la vista previa / desmontar el
 * componente para liberar el object URL.
 */
export function crearVistaPreviaPdf(bytes: Uint8Array): { url: string; dispose: () => void } {
  const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  return { url, dispose: () => URL.revokeObjectURL(url) };
}
