import { redirect } from "next/navigation";
import { rotaInicial } from "@/lib/abas";
import { getUsuarioAtual } from "@/lib/auth";
import { abasPermitidas } from "@/lib/grupos";

export const dynamic = "force-dynamic";

/** `/painel` é só a PORTA DE ENTRADA (login, marca do cabeçalho): vai direto para a Mesa — ou, sem ela, para o 1º
 * módulo que o grupo ativo pode ver (o admin vê todos); sem nenhum, o Perfil. */
export default async function PainelPage() {
  const u = await getUsuarioAtual();
  if (!u) redirect("/login");
  redirect(rotaInicial(await abasPermitidas(u)));
}
