import { redirect } from "next/navigation";

/** Link antigo: o cadastro fica na tela única de acesso. */
export default function CadastroPage() {
  redirect("/login?modo=cadastro");
}
