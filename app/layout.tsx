import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

/*
 * Sistema-de-Diseno.md: IBM Plex Sans en 400 (cuerpo/formularios) y 600
 * (encabezados); IBM Plex Mono en 400 para identificadores. No se cargan más
 * pesos de los que el sistema de diseño usa — cada peso extra es una descarga
 * más en un consultorio que puede estar con conexión lenta.
 *
 * Los archivos van en el repositorio (app/_fuentes/ibm-plex/, con su OFL y su
 * origen): el build no descarga nada de Google. Son los `complete` de IBM sin
 * modificar, no el corte Latin1, que no trae el espacio de cifra (U+2007) de
 * formatFechaCorta (lib/fechas.ts).
 */
const plexSans = localFont({
  variable: "--font-plex-sans",
  src: [
    { path: "./_fuentes/ibm-plex/IBMPlexSans-Regular.woff2", weight: "400", style: "normal" },
    { path: "./_fuentes/ibm-plex/IBMPlexSans-SemiBold.woff2", weight: "600", style: "normal" },
  ],
  display: "swap",
});

const plexMono = localFont({
  variable: "--font-plex-mono",
  src: [{ path: "./_fuentes/ibm-plex/IBMPlexMono-Regular.woff2", weight: "400", style: "normal" }],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Consultorio Demo",
  description:
    "Historial clínico y recetas del Consultorio Demo — Dra. Ana Ejemplo, médico general.",
  // Sistema de uso interno del consultorio: no debe aparecer en buscadores.
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${plexSans.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
