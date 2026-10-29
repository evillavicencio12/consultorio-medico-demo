---
tags: [arquitectura, supabase, seguridad]
---

# Supabase desde la app

Server Actions y API Routes son el **único punto** que habla con Supabase y con la API de Google; el cliente nunca accede directo a esos servicios.

## Los tres clientes

Tres clientes, y elegir mal tiene consecuencias de seguridad:

- `lib/supabase/client.ts` — navegador, clave publicable. **RLS aplica.**
- `lib/supabase/server.ts` — servidor con la sesión de la doctora, clave publicable + cookies. **RLS aplica.** Es el que se usa por defecto.
- `lib/supabase/admin.ts` — clave secreta, **salta RLS**. Solo importaciones y mantenimiento. Marcado con `server-only`, así que el build falla si alguien lo alcanza desde el cliente.

Un cliente de servidor con la clave secreta saltaría RLS en cada consulta y dejaría de adorno las políticas que exige [Seguridad-OWASP](Seguridad-OWASP.md). Por eso son tres y no dos.

Usar uno u otro no reemplaza la comprobación de sesión dentro de cada Server Action: ver la regla en [Seguridad-OWASP](Seguridad-OWASP.md).

## Las filas se tipan con `type`, nunca con `interface`

En `lib/supabase/tipos.ts`, cada fila es un **alias de tipo**. No es estilo: postgrest-js exige que la fila encaje en `Record<string, unknown>`, y **una `interface` nunca encaja** —TypeScript le da firma de índice implícita a un alias pero no a una interfaz, porque una interfaz puede ampliarse desde otro archivo.

Con interfaces, `Database['public']` deja de ser un `GenericSchema` y `.insert()` / `.update()` pasan a recibir `never`: TypeScript rechaza cualquier fila que se les pase. **`select()` sigue compilando**, así que el hueco sobrevive hasta la primera escritura — que es exactamente cuando se descubrió.

Cada tabla necesita además su clave `Relationships` (vacía si no se usan joins embebidos de PostgREST). Sin ella, mismo síntoma.

## Ver también
- [Modelo-de-Datos](Modelo-de-Datos.md)
- [Migraciones](Migraciones.md)
- [Índice](../README.md)
