---
tags: [adr]
---

# ADR-001 — Sin control de inventario de medicamentos

**Estado:** Confirmada.

**Contexto:** El buscador de medicamentos podría sugerir descuento automático de stock al recetar.

**Decisión:** El sistema NO incluye control de inventario ni descuento de stock. Se evaluó y se descartó explícitamente. El catálogo de medicamentos es solo referencia para llenar la receta rápido y sin errores de tipeo.

**Consecuencias:** `medicamentos_catalogo` no tiene campo de cantidad en stock. Si en el futuro se pide esta función, es un cambio de alcance, no un ajuste menor.

## Ver también
- [05-Prescripcion-Receta](../modulos/05-Prescripcion-Receta.md)
- [Índice](../README.md)
