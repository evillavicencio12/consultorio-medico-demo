"use client";

import { useActionState } from "react";
import { AlertCircle, ArrowRight, Lock, Mail } from "lucide-react";
import { iniciarSesion, type EstadoLogin } from "./acciones";

const ESTADO_INICIAL: EstadoLogin = { error: null };

/** Clases compartidas por los dos campos, para que no se desincronicen. */
const CAMPO =
  "w-full rounded-control border border-borde bg-superficie py-2.5 pl-10 pr-3 " +
  "text-[15px] text-navy transition-colors focus:border-navy focus:outline-none";

export function FormularioLogin({ volverA }: { volverA: string }) {
  const [estado, accion, enviando] = useActionState(
    iniciarSesion,
    ESTADO_INICIAL
  );

  return (
    <form action={accion} className="mt-2 flex w-full flex-col gap-6">
      <input type="hidden" name="volverA" value={volverA} />

      {/* Sistema-de-Diseno.md: la etiqueta va siempre visible sobre el campo,
          nunca solo como placeholder — el placeholder desaparece al escribir y
          deja a quien llena el formulario sin saber en qué campo está. */}
      <div className="flex flex-col gap-2">
        <label
          htmlFor="correo"
          className="text-[13px] font-semibold tracking-[0.05em] text-navy"
        >
          CORREO ELECTRÓNICO
        </label>
        <div className="relative">
          <Mail
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-texto-secundario"
            size={18}
            strokeWidth={1.5}
          />
          <input
            id="correo"
            name="correo"
            type="email"
            autoComplete="username"
            required
            autoFocus
            className={CAMPO}
            placeholder="correo@ejemplo.com"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {/* Sin enlace de "¿olvidó su clave?". Stitch lo incluía, pero
            01-Autenticacion.md descarta la recuperación: se restablece a mano
            desde Supabase. Un enlace que no lleva a ningún lado es peor que
            no tenerlo. */}
        <label
          htmlFor="password"
          className="text-[13px] font-semibold tracking-[0.05em] text-navy"
        >
          CONTRASEÑA
        </label>
        <div className="relative">
          <Lock
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-texto-secundario"
            size={18}
            strokeWidth={1.5}
          />
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className={CAMPO}
            placeholder="Tu contraseña"
          />
        </div>
      </div>

      {estado.error ? (
        // role="alert" para que un lector de pantalla lo anuncie al aparecer,
        // en vez de que pase inadvertido bajo el campo.
        <p
          role="alert"
          className="flex items-start gap-2 rounded-control bg-rojo-tint px-3 py-2.5 text-sm text-rojo"
        >
          <AlertCircle
            aria-hidden
            className="mt-px shrink-0"
            size={16}
            strokeWidth={1.5}
          />
          {estado.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={enviando}
        className="mt-1 flex w-full items-center justify-center gap-2 rounded-control bg-teal py-2.5 font-semibold text-white transition-colors hover:bg-teal-hover disabled:cursor-not-allowed disabled:opacity-60"
      >
        {enviando ? "Ingresando…" : "Ingresar al sistema"}
        {enviando ? null : (
          <ArrowRight aria-hidden size={18} strokeWidth={1.5} />
        )}
      </button>
    </form>
  );
}
