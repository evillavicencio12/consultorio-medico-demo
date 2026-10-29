import type { NextConfig } from "next";

/**
 * Cabeceras de seguridad (docs/arquitectura/Seguridad-OWASP.md).
 *
 * La CSP va en modo **Report-Only** y solo en producción. Next mete scripts en
 * línea en cada página (la carga de RSC, `self.__next_f.push(…)`) y la app usa
 * `style={…}`: una CSP aplicada sin `'unsafe-inline'` ni nonce rompería la
 * hidratación y la doctora vería la app muerta. Report-Only la deja funcionar y
 * registra lo que se habría bloqueado; la E2E lo recoge. Se pasará a aplicada
 * —con nonce desde proxy.ts— cuando la observación lo diga. En desarrollo no
 * va: React necesita `eval` y el informe sería ruido.
 *
 * Sin `report-uri`: mandar los reportes a un servicio externo le daría a un
 * tercero URLs con el id de pacientes.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  // IBM Plex la sirve el propio dominio: los archivos están en el repositorio
  // (app/_fuentes/ibm-plex/) y next/font/local los publica en /_next/static.
  "font-src 'self'",
  // El navegador nunca habla con Supabase ni con Google: solo con el servidor.
  "connect-src 'self'",
  // La vista previa del PDF es un <iframe src="blob:…">.
  "frame-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const CABECERAS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Que ningún otro sitio enmarque la app. `frame-ancestors` no se aplica en
  // Report-Only, así que la protección real es esta. DENY y no SAMEORIGIN: el
  // único <iframe> de la app carga un blob: (el PDF), nunca una página del
  // sitio, y un blob no recibe cabeceras.
  { key: "X-Frame-Options", value: "DENY" },
  // Las URLs llevan el id del paciente: que no salgan del sitio.
  { key: "Referrer-Policy", value: "same-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), usb=(), payment=(), browsing-topics=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(process.env.NODE_ENV === "production"
    ? [
        // Solo en producción: en desarrollo, si alguien sirve localhost por
        // HTTPS, el navegador fijaría HSTS a localhost por dos años y rompería
        // cualquier otro proyecto en http://localhost. Sin `preload` ni
        // `includeSubDomains`: el dominio definitivo se decide en la Fase 6.
        { key: "Strict-Transport-Security", value: "max-age=63072000" },
        { key: "Content-Security-Policy-Report-Only", value: CSP },
      ]
    : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: CABECERAS }];
  },
};

export default nextConfig;
