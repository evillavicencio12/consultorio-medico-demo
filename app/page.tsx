import { redirect } from "next/navigation";

/**
 * La raíz no tiene contenido propio: el sistema arranca en el listado de
 * pacientes, que es por donde empieza toda atención. Si no hay sesión, el
 * proxy intercepta antes y manda al login.
 */
export default function Raiz() {
  redirect("/pacientes");
}
