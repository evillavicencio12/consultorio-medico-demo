/**
 * globalSetup de Vitest: corre UNA vez antes de cualquier archivo de prueba.
 *
 * Varias suites escriben los PDF que generan en `scripts/output/` para poder
 * mirarlos a mano. Esa carpeta está en .gitignore, así que en un clon nuevo —y
 * en el CI— no existe, y como Vitest corre los archivos en paralelo y sin orden
 * garantizado, no basta con que una suite la cree: se crea aquí.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";

export default function preparar() {
  mkdirSync(join(process.cwd(), "scripts", "output"), { recursive: true });
}
