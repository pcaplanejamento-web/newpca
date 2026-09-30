import { redirect } from "next/navigation";

/** Link antigo: "Esqueci a senha" fica na tela única de acesso. */
export default function RecuperarSenhaPage() {
  redirect("/login?modo=senha");
}
