import { Stethoscope } from "lucide-react";
import { FormularioLogin } from "./formulario";

export const metadata = { title: "Ingresar — Consultorio Demo" };

/**
 * Login (RF-01). Usuaria única: la doctora.
 *
 * La composición viene de la pantalla "Login" de Stitch —tarjeta central,
 * línea de acento superior, logo circular, campos con ícono a la izquierda—
 * pero pintada con los tokens de Sistema-de-Diseno.md. Stitch entrega su propia
 * paleta Material (`primary #002441`, `secondary #006a66`) que no es la del
 * consultorio, y ante el choque manda `docs/`.
 *
 * Fuera de lo que traía Stitch: el enlace de recuperar contraseña
 * (01-Autenticacion.md lo descarta) y la leyenda "todo acceso es monitoreado",
 * que aquí sería falsa — no hay registro de auditoría.
 */
export default async function PaginaLogin({
  searchParams,
}: {
  // Se tipa a mano en vez de usar `PageProps<"/login">`: ese tipo lo genera
  // Next durante el build, así que un `tsc --noEmit` en limpio (CI, clon
  // recién hecho) fallaría antes de que exista.
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const volverA = typeof params.volverA === "string" ? params.volverA : "";

  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <div className="relative w-full max-w-[420px] overflow-hidden rounded-tarjeta border border-borde bg-superficie p-8 shadow-clinica">
        {/* Línea de acento turquesa: el único adorno de la pantalla. */}
        <div aria-hidden className="absolute inset-x-0 top-0 h-[3px] bg-teal" />

        <div className="flex flex-col items-center gap-2 text-center">
          <div className="mb-2 flex h-16 w-16 items-center justify-center rounded-full border border-borde bg-navy-tint">
            <Stethoscope
              aria-hidden
              className="text-navy"
              size={30}
              strokeWidth={1.5}
            />
          </div>
          <h1 className="text-[26px] leading-8 font-semibold tracking-[-0.02em] text-navy">
            Consultorio Demo
          </h1>
          <p className="text-sm text-texto-secundario">
            Historial clínico y recetas
          </p>
        </div>

        <FormularioLogin volverA={volverA} />

        <p className="mt-6 text-center text-xs text-texto-secundario">
          Acceso exclusivo de la doctora. Si olvidas tu contraseña, se
          restablece desde el panel de Supabase.
        </p>
      </div>
    </main>
  );
}
