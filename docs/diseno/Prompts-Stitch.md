---
tags: [diseno, stitch, prompts]
---

# Prompts sugeridos para Google Stitch

Stitch se usa **solo para generar markup visual** (Tailwind/HTML/componentes), nunca lógica de negocio. Revisar que el código entregado use Tailwind puro antes de integrarlo.

> [!warning] Esta lista no decide la navegación
> Los títulos de abajo son nombres de pantallas para pedirle maquetas a Stitch,
> no un mapa del menú. "Historial Clínico" figura aquí como pantalla y **no es
> un ítem del rail**: el historial de un paciente es su ficha. La contradicción
> con la definición del proyecto se resolvió en la Fase 3 —
> ver [03-Historial-Clinico](../modulos/03-Historial-Clinico.md).

- **Barra lateral (rail colapsable):** pantallas de navegación, expandido (240px) y colapsado (72px) lado a lado. Tres ítems: Pacientes, Historial Clínico, Nueva Consulta. Tooltip sobre "Historial Clínico" como ejemplo. Ítem activo con fondo `#E3F3F2` y borde izquierdo `#2E9C97` de 3px.
- **Login:** tarjeta central, radio 10px, sombra `rgba(22,58,91,0.08)`, campos con etiqueta visible, botón turquesa `#2E9C97`. Sin ilustraciones genéricas de "app de salud".
- **Pacientes (listado):** buscador destacado, botón "Nuevo paciente" en turquesa, cédula en IBM Plex Mono, etiqueta roja "Alergia" cuando aplica.
- **Registrar paciente:** secciones datos personales + contacto opcional, validación en línea en cédula, bloque de acompañante sobre `#E8EEF2` (solo si es menor).
- **Historial Clínico (ficha + timeline):** breadcrumb, cabecera con etiqueta de alergia, panel de contexto con número de última receta en mono, línea de tiempo vertical con dos botones PDF por consulta.
- **Nueva Consulta — historial:** secciones colapsables (Antecedentes, Exploración física, Motivo, Impresión diagnóstica, Tratamiento), datos fijos no editables arriba sobre `#E8EEF2`, check turquesa junto al CIE-10 válido.
- *(Construido en la Fase 4: historial y receta no son dos pantallas sino **dos columnas** de la misma, a partir de `xl`. Las "dos columnas Rp / Prescripción" de la línea siguiente viven dentro de cada tarjeta de medicamento, y se parten según el ancho de la tarjeta, no el de la ventana.)*
- **Nueva Consulta — receta:** dos columnas (Rp / Prescripción), número de receta en mono sobre `#E3F3F2`, botón primario "Guardar y generar PDF".
- **Vista previa de PDF:** modal sin navegar de página, botón primario "Imprimir", botón secundario de cerrar, radio 10px.

## Ver también
- [Sistema-de-Diseno](Sistema-de-Diseno.md)
- [Índice](../README.md)
