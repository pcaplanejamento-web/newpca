import { redirect } from "next/navigation";
import { rotaInicial } from "@/lib/abas";
import { getAcesso } from "@/lib/acesso";

export const dynamic = "force-dynamic";

/** `/painel` é só a PORTA DE ENTRADA (login, marca do cabeçalho): vai direto para a Mesa — ou, sem ela, para a 1ª tela
 * que a pessoa ABRE (o grupo ativo libera e o papel visualiza; o ADM vê todas); sem nenhuma, o Perfil (que explica). */
export default async function PainelPage() {
  const acesso = await getAcesso();
  if (!acesso) redirect("/login");
  redirect(rotaInicial(new Set(acesso.telas)));
}
